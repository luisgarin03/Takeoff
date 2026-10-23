import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/Whiteboard.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("custom export controls use the content label and hide canvas overlays with the closed manager", () => {
  assert.match(source, /label="Select Content to Export"/);
  assert.doesNotMatch(source, />Select Export Areas<\/Button>/);
  assert.match(source, /showExportPages && \(board\.exportAreas \|\| \[\]\)\.map/);
  assert.match(source, /function closeExportPages\(\)[\s\S]*?setShowExportPages\(false\)/);
});

test("PDF Export Pages header omits the redundant Whiteboard PDF eyebrow", () => {
  assert.match(source, /<h2>PDF Export Pages<\/h2>/);
  assert.doesNotMatch(source, /<span>Whiteboard PDF<\/span>/);
});
