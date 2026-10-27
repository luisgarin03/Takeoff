import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvas = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const panel = readFileSync(new URL("../src/components/TakeoffsPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("every condition row exposes an accessible automatic note-and-arrow toggle", () => {
  assert.match(panel, /const autoNoteArrow = c\.auto_note_arrow !== false;/);
  assert.match(panel, /onToggleAutoNoteArrow\(c\.id, !autoNoteArrow\)/);
  assert.match(panel, /aria-pressed=\{autoNoteArrow\}/);
  assert.match(panel, /Automatic note \+ arrow is on/);
});

test("measurement commits filter plan callouts without disabling automatic SOW totals", () => {
  assert.match(canvas, /const calloutRows = rows\.filter\(\(\{ condition \}\) => conditionAutoNoteArrowEnabled\(condition\)\);/);
  assert.match(canvas, /for \(const \{ shape, condition \} of rows\) \{/,
    "the SOW loop continues to include every completed measurement");
  assert.match(canvas, /onToggleAutoNoteArrow: \(id, enabled\) => updateCondById\(id, \{ auto_note_arrow: enabled \}\)/);
});
