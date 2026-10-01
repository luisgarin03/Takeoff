import { test } from "node:test";
import assert from "node:assert/strict";
import { measureCanvasMarkupText, wrapCanvasNoteText } from "../src/lib/canvasText.js";

test("canvas notes preserve explicit lines and wrap long paragraphs into a readable box", () => {
  assert.deepEqual(wrapCanvasNoteText("first line\nsecond line"), ["first line", "second line"]);
  assert.deepEqual(wrapCanvasNoteText("one two three four", 8), ["one two", "three", "four"]);
  assert.deepEqual(wrapCanvasNoteText("supercalifragilistic", 8), ["supercal", "ifragili", "stic"]);
  assert.deepEqual(wrapCanvasNoteText("first\n\nthird"), ["first", "", "third"]);
});

test("markup text measurement has a deterministic non-DOM fallback", () => {
  assert.ok(Math.abs(measureCanvasMarkupText("ACCESS", 12, 600) - 39.6) < 1e-9);
  assert.equal(measureCanvasMarkupText("", 12, 600), 0);
});
