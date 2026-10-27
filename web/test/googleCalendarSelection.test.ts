import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreGoogleSelection, saveGoogleSelection } from "../src/lib/googleCalendarSelection.js";
test("Google calendar selections survive remounts, remain account-specific, and preserve deselect-all", () => {
  const values = new Map();
  const storage: any = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const calendars = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(restoreGoogleSelection("one", calendars, storage), ["a", "b"]);
  saveGoogleSelection("one", ["b", "removed"], storage);
  assert.deepEqual(restoreGoogleSelection("one", calendars, storage), ["b"]);
  assert.deepEqual(restoreGoogleSelection("two", calendars, storage), ["a", "b"]);
  saveGoogleSelection("one", [], storage);
  assert.deepEqual(restoreGoogleSelection("one", calendars, storage), []);
});
