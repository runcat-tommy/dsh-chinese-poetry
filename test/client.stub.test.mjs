/**
 * Client-half smoke test: evaluates the ModuleLoader bundle in a stubbed
 * browser environment and asserts the conversation-view registration shape:
 *   - exports.apply is a function; inject lists ["slots", "locale"]
 *   - apply() registers the 'poetry' tab on the 'conversation.view' slot
 *     with order 20 (right after Trajectory) and a locale-bound label
 *   - apply() tolerates a DOM-less environment (graceful degradation)
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

/**
 * Stateful React stub: useState keeps values across re-renders so the M3
 * behavior test can drive the PoetryView UI (type → search → expand → AI).
 */
function makeStatefulReact() {
  const states = new Map();
  let hookIndex = 0;
  return {
    resetIndex: () => { hookIndex = 0; },
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (init) => {
      const i = hookIndex++;
      if (!states.has(i)) states.set(i, typeof init === "function" ? init() : init);
      const value = states.get(i);
      const set = (v) => { states.set(i, typeof v === "function" ? v(states.get(i)) : v); };
      return [value, set];
    },
    useEffect: () => {},
  };
}

/** Depth-first collection of element nodes matching a predicate. */
function collect(tree, out, pred) {
  if (Array.isArray(tree)) {
    for (const c of tree) collect(c, out, pred);
    return out;
  }
  if (!tree || typeof tree !== "object") return out;
  if (!pred || pred(tree)) out.push(tree);
  for (const c of tree.children || []) collect(c, out, pred);
  return out;
}
function findByClass(tree, cls) {
  return collect(tree, [], (n) => n.props && n.props.className === cls);
}
function textOf(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return (node.children || []).map(textOf).join("");
}

/** Capture the registration passed to slots.register inside slots.inject. */
function makeCtx(counters, registrations) {
  return {
    get: () => undefined,
    on: () => () => {},
    effect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanup();
      return () => {};
    },
    locale: {
      register: () => { counters.localeRegister++; },
      bind: () => (key) => `L:${key}`,
    },
    slots: {
      inject: (name, cb) => { counters.injectCalls.push(name); registrations.push(cb()); },
      register: (def, render) => ({ def, render }),
    },
  };
}

function runFactory(reactImpl) {
  const counters = { localeRegister: 0, injectCalls: [] };
  const registrations = [];
  globalThis.window = { __ModuleLoader__: {} };
  let exportsOut = null;
  window.__ModuleLoader__.load = (opts) => {
    const returned = opts.factory((id) => {
      if (id === "react") return reactImpl || makeReact();
      throw new Error(`unexpected require: ${id}`);
    });
    exportsOut = returned;
  };
  (0, eval)(source); // the file calls window.__ModuleLoader__.load(...) at top level
  return { exportsOut, counters, registrations };
}

test("client exposes apply and the expected inject list", () => {
  const { exportsOut } = runFactory();
  assert.equal(typeof exportsOut.apply, "function");
  assert.deepEqual(exportsOut.inject, ["slots", "locale"]);
});

test("apply registers a conversation.view tab named poetry at order 20", () => {
  const { exportsOut, counters, registrations } = runFactory();
  exportsOut.apply(makeCtx(counters, registrations));

  assert.ok(counters.localeRegister >= 1, "dictionaries should register");
  assert.ok(
    counters.injectCalls.includes("conversation.view"),
    "should inject into the conversation.view slot"
  );

  const viewReg = registrations.find((r) => r.def && r.def.name === "conversation.view");
  assert.ok(viewReg, "a conversation.view registration should exist");
  assert.equal(viewReg.def.id, "poetry");
  assert.equal(viewReg.def.order, 20, "should sit right after Trajectory (order 10)");
  assert.equal(typeof viewReg.def.label, "function");
  assert.equal(viewReg.def.label(), "L:view", "label should be locale-bound");
  assert.equal(typeof viewReg.render, "function", "a render component should be provided");
});

test("apply tolerates a DOM-less environment", () => {
  const { exportsOut, counters, registrations } = runFactory();
  assert.doesNotThrow(() => exportsOut.apply(makeCtx(counters, registrations)));
});

test("M3: feihua input, favorites toggle, and AI explain write the composer draft", async () => {
  const reactImpl = makeStatefulReact();
  const { exportsOut, counters, registrations } = runFactory(reactImpl);

  const poem = {
    id: 1,
    title: "静夜思",
    author: { name: "李白" },
    dynasty: { name: "唐" },
    type: { name: "五言绝句" },
    content: ["床前明月光，疑是地上霜。"],
  };
  // The view builds its own PoetryDataLayer; mock global fetch so it stays local.
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({ data: [poem] }),
  });

  try {
    exportsOut.apply(makeCtx(counters, registrations));
    const viewReg = registrations.find((r) => r.def && r.def.name === "conversation.view");
    const setDraftCalls = [];
    const slotProps = {
      sessionId: "s1",
      inputActions: { setDraft: (v) => setDraftCalls.push(v), submit: () => {} },
    };
    const render = () => {
      reactImpl.resetIndex();
      const desc = viewReg.render(slotProps);
      // createElement only describes nodes; invoke the top-level function component.
      return typeof desc.type === "function" ? desc.type(desc.props) : desc;
    };

    // 1) M3 UI chrome renders: credit line, feihua group + favorites toggle
    let tree = render();
    assert.equal(findByClass(tree, "cp-credit").length, 1, "credit line should render");
    const creditLink = collect(tree, [], (n) => n.type === "a" && n.props.href && n.props.href.includes("palemoky"));
    assert.equal(creditLink.length, 1, "credit should link to the upstream project");
    assert.equal(findByClass(tree, "cp-feihua").length, 1, "feihua char input should render");
    assert.equal(findByClass(tree, "cp-search").length, 1, "search input should render");
    const favBtn = collect(tree, [], (n) => n.type === "button" && textOf(n).includes("L:favs"));
    assert.ok(favBtn.length >= 1, "favorites toggle button should render");

    // 1b) feihua with an empty char guides instead of searching
    collect(tree, [], (n) => n.type === "button" && textOf(n) === "L:feihuaGo")[0].props.onClick();
    tree = render();
    const feihuaMsg = collect(tree, [], (n) => n.props && typeof n.props.className === "string" && n.props.className.indexOf("cp-msg") === 0 && textOf(n).includes("L:feihuaNeedOne"));
    assert.ok(feihuaMsg.length >= 1, "empty feihua should show a guidance message");

    // 1c) history block is always shown (here: empty placeholder) so it is discoverable
    const histBlock = collect(tree, [], (n) => n.props && n.props.className === "cp-history");
    assert.equal(histBlock.length, 1, "history block should always render in the search view");
    const histEmpty = collect(tree, [], (n) => n.props && n.props.className === "cp-history-empty" && textOf(n).includes("L:historyEmpty"));
    assert.ok(histEmpty.length >= 1, "empty history should show a placeholder");

    // 2) type a query and run the search (async settle)
    findByClass(tree, "cp-search")[0].props.onChange({ target: { value: "明月光" } });
    tree = render();
    collect(tree, [], (n) => n.type === "button" && textOf(n) === "L:search")[0].props.onClick();
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    tree = render();

    // 3) a result row rendered — expand it to reveal the action bar
    const head = findByClass(tree, "cp-row-head")[0];
    assert.ok(head, "search result row should render");
    head.props.onClick();
    tree = render();

    // 4) AI explain fills the composer draft (never auto-submits)
    const aiBtn = collect(tree, [], (n) => n.type === "button" && textOf(n) === "L:aiExplain")[0];
    assert.ok(aiBtn, "AI explain button should appear in the expanded row");
    aiBtn.props.onClick({ stopPropagation() {} });
    assert.equal(setDraftCalls.length, 1, "setDraft should be called once");
    assert.ok(setDraftCalls[0].includes("静夜思"), "draft should include the poem title");
    assert.ok(setDraftCalls[0].includes("床前明月光"), "draft should include the poem text");

    // 5) a fresh render (simulated view switch → remount) restores the content
    tree = render();
    const head2 = findByClass(tree, "cp-row-head")[0];
    assert.ok(head2, "search results should survive a remount (view-switch memory)");
    assert.equal(findByClass(tree, "cp-search")[0].props.value, "明月光", "query text should survive a remount");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("M4: festival grid, featured poem, AI-verse handoff, and share-card fallback", () => {
  const reactImpl = makeStatefulReact();
  const { exportsOut, counters, registrations } = runFactory(reactImpl);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({ data: [] }),
  });
  try {
    exportsOut.apply(makeCtx(counters, registrations));
    const viewReg = registrations.find((r) => r.def && r.def.name === "conversation.view");
    const setDraftCalls = [];
    const slotProps = {
      sessionId: "s2",
      inputActions: { setDraft: (v) => setDraftCalls.push(v), submit: () => {} },
    };
    const render = () => {
      reactImpl.resetIndex();
      const desc = viewReg.render(slotProps);
      return typeof desc.type === "function" ? desc.type(desc.props) : desc;
    };

    // enter the festival view
    let tree = render();
    collect(tree, [], (n) => n.type === "button" && textOf(n) === "L:festival")[0].props.onClick();
    tree = render();
    assert.equal(findByClass(tree, "cp-festival-grid").length, 1, "festival grid should render");
    assert.equal(findByClass(tree, "cp-festival-card").length, 7, "seven festival cards");

    // pick the first festival → its featured poem renders
    findByClass(tree, "cp-festival-card")[0].props.onClick();
    tree = render();
    assert.ok(findByClass(tree, "cp-row-head").length >= 1, "festival featured poem should render");
    assert.equal(findByClass(tree, "cp-festival-card active").length, 1, "the chosen card is highlighted");

    // AI verse hands off a prompt (never auto-submits)
    const aiBtn = collect(tree, [], (n) => n.type === "button" && textOf(n) === "L:festivalAi")[0];
    assert.ok(aiBtn, "AI-verse button should appear");
    aiBtn.props.onClick();
    assert.equal(setDraftCalls.length, 1, "AI verse should call setDraft once");

    // expand the featured poem, then share-card in a DOM-less env falls back to a message
    findByClass(tree, "cp-row-head")[0].props.onClick();
    tree = render();
    const shareBtn = collect(tree, [], (n) => n.type === "button" && textOf(n) === "L:cardShare")[0];
    assert.ok(shareBtn, "share-card button should appear in expanded actions");
    shareBtn.props.onClick({ stopPropagation() {} });
    tree = render();
    const cardMsg = collect(tree, [], (n) => n.props && typeof n.props.className === "string" && n.props.className.indexOf("cp-msg") === 0 && textOf(n).includes("L:cardNoCanvas"));
    assert.ok(cardMsg.length >= 1, "no-canvas share should show a fallback message");
  } finally {
    globalThis.fetch = origFetch;
  }
});
