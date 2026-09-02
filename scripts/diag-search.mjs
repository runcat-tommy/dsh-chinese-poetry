/**
 * Diagnostic: reproduce 2-char search through the real data layer
 * (live fetch). Run: node scripts/diag-search.mjs
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

// 1) pure offline-table behavior (no fetch)
const layerOff = new PoetryDataLayer({ fetchImpl: null, storage: null });
for (const q of ["明月", "黄河", "静夜", "春晓", "床前"]) {
  const off = layerOff._offlineSearch(q);
  console.log(`offline match "${q}" → ${off.length}:`, off.map((p) => p.title).join(", ") || "(none)");
}

// 2) real fetch behavior for 2-char and 3-char queries
const layer = new PoetryDataLayer({ storage: null });
for (const q of ["明月", "黄河", "明月光"]) {
  const t0 = Date.now();
  try {
    const res = await layer.search(q, { pageSize: 5 });
    console.log(`search("${q}") → from=${res.from}, items=${res.items.length}, ${Date.now() - t0}ms`,
      res.items.slice(0, 3).map((p) => p.title).join(" | "));
  } catch (err) {
    console.log(`search("${q}") → REJECTED:`, err && err.message);
  }
}
