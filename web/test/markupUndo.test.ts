import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("markup add, replace, and delete mutations enter the shared undo history", () => {
  assert.match(source, /recordCommand\(undoStackRef\.current, \{ kind: "markup", cmd, inverse \}\)/);
  assert.match(source, /dispatchMarkup\(\{ type: "add", markup \}\)/);
  assert.match(source, /dispatchMarkup\(\{ type: "replace", markup: next \}\)/);
  assert.match(source, /dispatchMarkup\(\{ type: "delete", ids: \[mid\] \}\)/);
});

test("undo and redo apply markup history entries chronologically with shape entries", () => {
  assert.match(source, /function undoShapeCommand\(\)[\s\S]{0,550}entry\.kind === "markup"[\s\S]{0,250}applyMarkupHistoryCommand\(entry\.inverse\)/);
  assert.match(source, /function redoShapeCommand\(\)[\s\S]{0,550}entry\.kind === "markup"[\s\S]{0,250}applyMarkupHistoryCommand\(entry\.cmd\)/);
  assert.match(source, /recordAppliedMarkupReplace\(d\.beforeMarkup, d\.afterMarkup\)/);
});

test("Edit menu exposes shared undo, redo, and markup deletion", () => {
  assert.match(source, /label: poly\.length \? "Undo last point" : "Undo"/);
  assert.match(source, /disabled: !redoStackRef\.current\.length/);
  assert.match(source, /selectedMarkupId \? deleteMarkup\(selectedMarkupId\) : deleteSelected\(\)/);
});
