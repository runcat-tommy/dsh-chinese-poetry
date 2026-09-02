/**
 * Host-half smoke test: the host half is a no-op by design (browser-only
 * plugin), so this just asserts apply() exists, accepts a ctx, and does not
 * throw.
 *
 * Run: node --test "test/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../lib/index.js";

test("host half applies without throwing", () => {
  const ctx = { get: () => undefined, inject: () => {} };
  assert.doesNotThrow(() => apply(ctx));
});

test("host half exposes an apply function", () => {
  assert.equal(typeof apply, "function");
});
