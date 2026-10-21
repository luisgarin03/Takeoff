import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("markup overlay renders above the selectable PDF text layer", () => {
  assert.match(source, /takeoff-pdf-text-layer[\s\S]{0,500}zIndex:\s*3/);
  assert.match(source, /<svg width=\{stage\.w\}[\s\S]{0,300}zIndex:\s*4/);
});

test("PDF text defers pointer and double-click selection only when no markup is hit", () => {
  assert.match(source, /function markupAt\(p, thr\)/);
  assert.match(source, /const point = toImage\(event\.clientX, event\.clientY\);\s*if \(!markupAt\(point, 8 \/ tfRef\.current\.scale\)\) return;/);
  assert.match(source, /closest\?\.\("\.takeoff-pdf-text-layer"\) && !markupAt\(toImage\(e\.clientX, e\.clientY\), 8 \/ tfRef\.current\.scale\)/);
});
