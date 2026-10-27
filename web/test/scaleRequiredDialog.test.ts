import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvas = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("scale-dependent tools open the centered scale picker on their first unscaled click", () => {
  assert.match(canvas, /\["oneclick", "area", "rect", "linear", "curve", "surface", "deduct", "deduct-rect"\]\.includes\(tool\) && !uppFor\(fp\.key\)[\s\S]{0,120}promptForScale\(fp\.key\)/);
  assert.doesNotMatch(canvas, /\["oneclick"[^\]]*"count"/);
  assert.doesNotMatch(canvas, /\["oneclick"[^\]]*"highlighter"/);
  assert.match(canvas, /role="dialog" aria-modal="true" aria-labelledby="scale-required-title"/);
  assert.match(canvas, /<h2 id="scale-required-title"[^>]*>Set the scale first<\/h2>/);
  assert.match(canvas, /before you can measure/);
});

test("the scale-required dialog reuses detected, standard, and calibration choices", () => {
  assert.match(canvas, /const scalePromptItems = scaleItems\.map/);
  assert.match(canvas, /items=\{scalePromptItems\}/);
  assert.match(canvas, /detected scale or manually choose a scale/);
  assert.match(canvas, /choose <strong>Calibrate two points<\/strong>, click both ends of a printed dimension, and enter the measurement shown on the plan/);
  assert.match(canvas, /onClick=\{\(\) => setScaleRequiredSheet\(null\)\}>Not now<\/button>/);
});

test("fallback measurement and paste scale gates open the same dialog", () => {
  assert.ok((canvas.match(/if \(!upp\) \{ promptForScale\(tp\.key\); return; \}/g) || []).length >= 3);
  assert.match(canvas, /if \(needsScale && !uppFor\(tp\.key\)\) \{ promptForScale\(tp\.key\); return; \}/);
});
