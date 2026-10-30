import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvas = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("new Linear points animate their connected segment and endpoint", () => {
  assert.match(canvas, /className=\{tool === "linear" \? "takeoff-linear-segment-enter"/);
  assert.match(canvas, /pathLength=\{tool === "linear" \? 1/);
  assert.match(canvas, /className="takeoff-linear-point-ring"/);
  assert.match(canvas, /"takeoff-linear-point-enter"/);
  assert.match(css, /@keyframes takeoff-linear-segment-draw/);
  assert.match(css, /@keyframes takeoff-linear-point-pop/);
  assert.match(css, /@keyframes takeoff-linear-point-ring/);
});

test("Linear drafting feedback respects reduced motion", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.takeoff-linear-segment-enter[\s\S]*?stroke-dashoffset: 0/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.takeoff-linear-point-ring \{ display: none; \}/);
});
