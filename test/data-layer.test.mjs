/**
 * Data-layer unit tests: evaluates the ModuleLoader bundle to obtain the
 * exported PoetryDataLayer class, then exercises it with injected
 * fetch/storage/timers — fully deterministic, no network access.
 *
 * Covers: input validation, caching, sliding-window rate limiting, 429
 * exponential backoff, cache-only degradation, offline fallback, daily-poem
 * stability, and serialized request ordering.
 *
 * Run: node --test "test/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

function makeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
    useEffect: () => {},
  };
}

/** Eval the bundle and return its exported module (apply/inject/PoetryDataLayer). */
function loadExports() {
  globalThis.window = { __ModuleLoader__: {} };
  let exportsOut = null;
  window.__ModuleLoader__.load = (opts) => {
    exportsOut = opts.factory((id) => {
      if (id === "react") return makeReact();
      throw new Error(`unexpected require: ${id}`);
    });
  };
  (0, eval)(source);
  return exportsOut;
}

const { PoetryDataLayer } = loadExports();
assert.ok(PoetryDataLayer, "PoetryDataLayer should be exported by the client bundle");

/** Minimal localStorage-like store backed by a Map. */
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** Fake fetch response. */
function jsonRes(data, status, headers) {
  return {
    ok: status === undefined || (status >= 200 && status < 300),
    status: status === undefined ? 200 : status,
    headers: { get: (name) => (headers ? headers[String(name).toLowerCase()] || null : null) },
    text: async () => JSON.stringify(data),
  };
}

function makeFixture() {
  const fixture = {
    nowVal: 1_000_000,
    waits: [],
    fetches: [],
    calls: 0,
  };
  fixture.now = () => fixture.nowVal;
  fixture.waitImpl = (ms) => { fixture.waits.push(ms); return Promise.resolve(); };
  fixture.storage = makeStorage();
  fixture.fetchImpl = async (url) => {
    fixture.calls++;
    fixture.fetches.push(String(url));
    return jsonRes({ data: [{ id: fixture.calls, title: "测试诗", author: { name: "某人" }, dynasty: { name: "唐" }, type: { name: "五言绝句" }, content: ["床前明月光。"] }] });
  };
  fixture.layer = new PoetryDataLayer({
    baseUrl: "https://test.example",
    fetchImpl: fixture.fetchImpl,
    storage: fixture.storage,
    now: fixture.now,
    waitImpl: fixture.waitImpl,
  });
  return fixture;
}

test("search rejects queries shorter than 2 characters", async () => {
  const { layer } = makeFixture();
  await assert.rejects(() => layer.search("月"), /2 个字符/);
});

test("search URL includes the encoded query and lang", async () => {
  const f = makeFixture();
  await f.layer.search("明月", { lang: "zh-Hans" });
  assert.equal(f.fetches.length, 1);
  assert.ok(f.fetches[0].includes("/api/search?q=" + encodeURIComponent("明月")));
  assert.ok(f.fetches[0].includes("lang=zh-Hans"));
});

test("identical searches hit the cache: only one network call", async () => {
  const f = makeFixture();
  const a = await f.layer.search("明月");
  const b = await f.layer.search("明月");
  assert.equal(a.items.length, 1);
  assert.equal(b.items.length, 1);
  assert.equal(f.calls, 1, "second search should be served from cache");
  assert.equal(a.from, "api");
});

test("random() applies filters to the URL", async () => {
  const f = makeFixture();
  await f.layer.random({ author: "李白", type: "五言绝句" });
  assert.equal(f.fetches.length, 1);
  assert.ok(f.fetches[0].includes("author=" + encodeURIComponent("李白")));
  assert.ok(f.fetches[0].includes("type=" + encodeURIComponent("五言绝句")));
});

test("random() passes lang to the URL", async () => {
  const f = makeFixture();
  await f.layer.random({ lang: "zh-Hant" });
  assert.ok(f.fetches[0].includes("lang=zh-Hant"));
});

test("daily() separates cache entries per language", async () => {
  const f = makeFixture();
  f.layer.fetchImpl = async (url) => {
    f.calls++;
    return jsonRes({ data: { id: f.calls, title: "d" + f.calls, content: ["x"] } });
  };
  await f.layer.daily("zh-Hans");
  await f.layer.daily("zh-Hans"); // cache hit (same day + same lang)
  await f.layer.daily("zh-Hant"); // different lang → new fetch
  assert.equal(f.calls, 2);
});

test("sliding window rate limit waits when the budget is exhausted", async () => {
  const f = makeFixture();
  // generalRate 3 per 60s window; the 4th call in the same window must wait.
  f.layer.generalRate = 3;
  f.layer.searchRate = 3;
  await f.layer.random();
  await f.layer.random();
  await f.layer.random();
  f.waits.length = 0;
  await f.layer.random(); // 4th: must be throttled
  assert.ok(f.waits.length >= 1, "4th call should have waited");
  assert.ok(f.waits[0] > 0, "wait should be positive");
});

test("429 backs off using Retry-After and recovers", async () => {
  const f = makeFixture();
  let n = 0;
  f.layer.fetchImpl = async () => {
    n++;
    if (n === 1) return jsonRes({}, 429, { "retry-after": "1" });
    return jsonRes({ data: [{ id: 1, title: "恢复", content: ["a"] }] });
  };
  const res = await f.layer.search("明月");
  assert.equal(res.items.length, 1);
  assert.equal(f.layer.consecutive429, 0, "success resets the 429 counter");
  assert.equal(f.layer.backoffMs, 0, "success resets the backoff");
  assert.ok(f.layer.maxBackoffMs >= 1000);
});

test("three consecutive 429s flip the layer to cache-only offline mode", async () => {
  const f = makeFixture();
  f.layer.fetchImpl = async () => jsonRes({}, 429, { "retry-after": "1" });
  const res = await f.layer.search("静夜思");
  assert.equal(res.from, "offline", "search should fall back to the offline table");
  assert.ok(res.items.length >= 1);
  assert.equal(res.items[0].title, "静夜思");
  assert.equal(f.layer.status().cacheOnly, true, "cache-only mode should be active");
});

test("network failure falls back to the offline table", async () => {
  const f = makeFixture();
  f.layer.fetchImpl = async () => { throw new Error("network down"); };
  const res = await f.layer.search("静夜思");
  assert.equal(res.from, "offline");
  assert.equal(res.items[0].title, "静夜思");
  assert.equal(f.layer.status().cacheOnly, false, "network errors alone do not enter cache-only");
});

test("two-char queries are marked short-offline and match local picks", async () => {
  const f = makeFixture();
  // The public API rejects 2-char queries with 400; the layer must degrade gracefully.
  f.layer.fetchImpl = async () => jsonRes({}, 400);
  const res = await f.layer.search("明月");
  assert.equal(res.from, "offline");
  assert.equal(res.note, "short-offline", "2-char results should carry the short-offline note");
  assert.ok(res.items.length >= 1, "common imagery like 明月 should match local picks");
  const titles = res.items.map((p) => p.title);
  assert.ok(titles.includes("静夜思"), "静夜思 (床前明月光) should match");
});

test("two-char queries without local matches report empty with the short note", async () => {
  const f = makeFixture();
  f.layer.fetchImpl = async () => jsonRes({}, 400);
  const res = await f.layer.search("量子");
  assert.equal(res.from, "offline");
  assert.equal(res.note, "short-offline");
  assert.equal(res.items.length, 0);
});

test("expanded offline table covers common two-char imagery", () => {
  const f = makeFixture();
  for (const q of ["明月", "黄河", "长安", "孤舟", "天涯", "人间", "春风", "桃花", "故人", "长江", "青山", "大雪"]) {
    const hits = f.layer._offlineSearch(q);
    assert.ok(hits.length >= 1, `"${q}" should match at least one local pick`);
  }
});

test("offline table is substantially larger than the original 20", () => {
  const { OFFLINE_POEMS } = loadExports();
  assert.ok(OFFLINE_POEMS.length >= 60, `offline table should hold >= 60 poems, got ${OFFLINE_POEMS.length}`);
});

test("offline random() without filters returns a poem", async () => {
  const f = makeFixture();
  f.layer.fetchImpl = async () => { throw new Error("down"); };
  const poem = await f.layer.random();
  assert.ok(poem, "should return an offline poem");
  assert.ok(poem.title && poem.content);
});

test("daily poem is stable within the same calendar day", async () => {
  const f = makeFixture();
  // /api/poems/random returns data as a single object (not an array).
  f.layer.fetchImpl = async (url) => {
    f.calls++;
    f.fetches.push(String(url));
    return jsonRes({ data: { id: f.calls, title: "每日" + f.calls, content: ["一行"] } });
  };
  const a = await f.layer.daily();
  const b = await f.layer.daily();
  assert.deepEqual(a, b, "same day → same poem");
  assert.equal(f.calls, 1, "second daily call should hit the day cache");
  // next day → a new network call
  f.nowVal += 24 * 3600 * 1000;
  const c = await f.layer.daily();
  assert.equal(f.calls, 2);
  assert.equal(c.id, 2, "next day should fetch a fresh poem");
});

test("requests are serialized through the queue", async () => {
  const f = makeFixture();
  const order = [];
  f.layer.fetchImpl = async (url) => {
    order.push(String(url));
    await new Promise((r) => setTimeout(r, 5));
    return jsonRes({ data: [{ id: order.length, title: "t" + order.length, content: ["x"] }] });
  };
  await Promise.all([f.layer.search("明月"), f.layer.random()]);
  assert.equal(order.length, 2);
  assert.ok(order[0].includes("/api/search"), "search should start first");
});

test("fixPoemDynasty corrects a known mislabeled dynasty", () => {
  const { fixPoemDynasty } = loadExports();
  const fixed = fixPoemDynasty({ author: { name: "曾丰" }, dynasty: { name: "唐" } });
  assert.equal(fixed.name, "宋");
  assert.equal(fixed.corrected, true);
  assert.equal(fixed.from, "唐");
});

test("fixPoemDynasty leaves an already-correct dynasty untouched", () => {
  const { fixPoemDynasty } = loadExports();
  const res = fixPoemDynasty({ author: { name: "李白" }, dynasty: { name: "唐" } });
  assert.equal(res.name, "唐");
  assert.equal(res.corrected, false);
});

test("fixPoemDynasty passes through unknown or empty dynasty", () => {
  const { fixPoemDynasty } = loadExports();
  const known = fixPoemDynasty({ author: { name: "某诗人" }, dynasty: { name: "唐" } });
  assert.equal(known.name, "唐");
  assert.equal(known.corrected, false);
  const empty = fixPoemDynasty({ author: "苏轼", dynasty: "" });
  assert.equal(empty.name, "");
  assert.equal(empty.corrected, false);
});

test("FESTIVALS provides a themed poem per festival (M4)", () => {
  const { FESTIVALS, festivalById } = loadExports();
  assert.equal(FESTIVALS.length, 7, "seven festivals");
  for (const f of FESTIVALS) {
    assert.ok(f.id && f.name && f.char, `festival ${f.id} should have id/name/char`);
    assert.ok(f.poem.title && f.poem.author && f.poem.author.name && f.poem.dynasty && f.poem.dynasty.name, `poem of ${f.id} should be complete`);
    assert.ok(Array.isArray(f.poem.content) && f.poem.content.length > 0, `poem of ${f.id} should have content`);
  }
  const zq = festivalById("zhongqiu");
  assert.ok(zq && zq.name === "中秋", "festivalById should resolve");
  assert.equal(festivalById("missing"), null);
});

test("shareCardDataUrl returns null without a canvas (stub env)", () => {
  const { shareCardDataUrl } = loadExports();
  assert.equal(shareCardDataUrl({ title: "x", author: { name: "a" }, content: ["line"] }), null);
});
