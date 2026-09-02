/**
 * Real-API smoke check (not part of npm test): evaluates the client bundle,
 * creates a PoetryDataLayer against the live public API, and exercises
 * search / random / daily. Requires network access.
 *
 * Run: node scripts/smoke-real.mjs
 */
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
globalThis.window = { __ModuleLoader__: {} };
let exportsOut = null;
window.__ModuleLoader__.load = (opts) => {
  exportsOut = opts.factory((id) => {
    if (id === "react") return { createElement: () => {}, useState: () => [], useEffect: () => {} };
    throw new Error("unexpected require: " + id);
  });
};
(0, eval)(source);

const { PoetryDataLayer } = exportsOut;
const layer = new PoetryDataLayer({ storage: null }); // mem-cache only, live fetch

let t0 = Date.now();
const res = await layer.search("静夜思", { pageSize: 3 });
console.log(`search("静夜思") → ${res.from}, ${res.items.length} items, ${Date.now() - t0}ms`);
for (const p of res.items.slice(0, 2)) {
  console.log(`  - ${p.title} · ${p.author && p.author.name} · ${p.dynasty && p.dynasty.name} · ${p.type && p.type.name}`);
}

t0 = Date.now();
const r = await layer.random({ type: "五言绝句" });
console.log(`random(五言绝句) → ${r && r.title} · ${r && r.author && r.author.name} (${Date.now() - t0}ms)`);

// M2: filtered random (author + genre) and traditional Chinese
const rf = await layer.random({ author: "李白", type: "七言绝句", lang: "zh-Hant" });
console.log(`random(李白·七言绝句·zh-Hant) → ${rf && rf.title} · ${rf && rf.author && rf.author.name} (${rf && rf.type && rf.type.name})`);

const rf2 = await layer.random({ dynasty: "宋", type: "宋词" });
console.log(`random(宋·宋词) → ${rf2 && rf2.title} · ${rf2 && rf2.author && rf2.author.name}`);

// M2: traditional-Chinese search
const rt = await layer.search("明月光", { pageSize: 2, lang: "zh-Hant" });
console.log(`search("明月光", zh-Hant) → ${rt.from}, ${rt.items.length} items, first: ${rt.items[0] && rt.items[0].title} (${rt.items[0] && rt.items[0].type && rt.items[0].type.name})`);

const d = await layer.daily();
console.log(`daily → ${d && d.title} · ${d && d.author && d.author.name}`);

const dyn = await layer.dynasties();
console.log(`dynasties → ${dyn.length} entries (first: ${dyn[0] && dyn[0].name})`);

const types = await layer.types();
console.log(`types → ${types.length} entries (first: ${types[0] && types[0].name})`);

console.log("status:", JSON.stringify(layer.status()));
