import test from "node:test";
import assert from "node:assert/strict";
import { assignMarkupShortcut, clearMarkupShortcut, normalizeMarkupShortcutMap } from "../src/lib/markupShortcuts.js";

test("shortcut preferences accept only supported markup IDs and single alphanumeric keys", () => {
  assert.deepEqual(normalizeMarkupShortcutMap({
    arrow: "m", text: "7", area: "A", cloud: "not a key", highlight: null,
  }), { arrow: "M", text: "7" });
});

test("a mapped key belongs to only one markup tool", () => {
  const next = assignMarkupShortcut({ arrow: "M", text: "T" }, "cloud", "m");
  assert.deepEqual(next, { cloud: "M", text: "T" });
});

test("shortcut mapping can be cleared without touching other tools", () => {
  assert.deepEqual(clearMarkupShortcut({ arrow: "M", text: "T" }, "arrow"), { text: "T" });
});
