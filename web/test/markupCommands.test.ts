import assert from "node:assert/strict";
import test from "node:test";
import { applyMarkupCommand } from "../src/lib/markupCommands.js";

const note = { id: "note-1", type: "text", at: [.2, .3], text: "Verify" };

test("markup add/delete commands round-trip with the same object and index", () => {
  const start = [{ id: "before", type: "arrow" }, { id: "after", type: "cloud" }];
  const added = applyMarkupCommand(start, { type: "add", markup: note, index: 1 });
  assert.deepEqual(added.markups.map((item) => item.id), ["before", "note-1", "after"]);
  const undone = applyMarkupCommand(added.markups, added.inverse);
  assert.deepEqual(undone.markups, start);
  const redone = applyMarkupCommand(undone.markups, undone.inverse);
  assert.deepEqual(redone.markups, added.markups);
});

test("markup replace restores optional leader targets exactly", () => {
  const withLeader = { ...note, target: [.8, .7] };
  const changed = applyMarkupCommand([note], { type: "replace", markup: withLeader });
  assert.deepEqual(changed.markups, [withLeader]);
  const undone = applyMarkupCommand(changed.markups, changed.inverse);
  assert.deepEqual(undone.markups, [note]);
  assert.equal("target" in undone.markups[0], false);
});

test("deleting and restoring multiple markups preserves their positions", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const removed = applyMarkupCommand(items, { type: "delete", ids: ["b", "d"] });
  assert.deepEqual(removed.markups.map((item) => item.id), ["a", "c"]);
  assert.deepEqual(applyMarkupCommand(removed.markups, removed.inverse).markups, items);
});
