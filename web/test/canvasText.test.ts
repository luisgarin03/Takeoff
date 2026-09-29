import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapCanvasNoteText } from "../src/lib/canvasText.js";

test("canvas notes preserve explicit lines and wrap long paragraphs into a readable box", () => {
  assert.deepEqual(wrapCanvasNoteText("first line\nsecond line"), ["first line", "second line"]);
  assert.deepEqual(wrapCanvasNoteText("one two three four", 8), ["one two", "three", "four"]);
  assert.deepEqual(wrapCanvasNoteText("supercalifragilistic", 8), ["supercal", "ifragili", "stic"]);
  assert.deepEqual(wrapCanvasNoteText("first\n\nthird"), ["first", "", "third"]);
});
