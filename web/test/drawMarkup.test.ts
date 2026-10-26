import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARROW_COLORS, MARKUP_TOOLS } from "../src/lib/canvasConstants.js";

const canvasSource = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const markedSetSource = readFileSync(new URL("../src/lib/markedset.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Draw is a markup tool and exposes the complete ten-color palette", () => {
  assert.equal(MARKUP_TOOLS.find((tool) => tool.id === "draw")?.label, "Draw");
  assert.deepEqual(ARROW_COLORS.map(({ value }) => value), [
    "#C96442", "#2F7D54", "#2563EB", "#9333EA", "#B8860B",
    "#0D9488", "#BE185D", "#1F2937", "#DC2626", "#0891B2",
  ]);
  assert.match(canvasSource, /aria-label="Draw brush size" type="range" min="1" max="24"/);
  assert.match(canvasSource, /disclosure: isDraw \? \(drawSettingsOpen \? "expanded" : "collapsed"\) : undefined/);
  assert.match(canvasSource, /item\.id === "draw" && drawStyleControls[\s\S]{0,100}\{ id: "draw-settings", custom: drawStyleControls \}/);
  assert.match(canvasSource, /const markupMenuStyle = drawStyleControls \? \{ minWidth: 284 \} : undefined/);
  assert.equal((canvasSource.match(/menuStyle=\{markupMenuStyle\}/g) || []).length, 2);
});

test("Draw captures opaque freehand ink with its own remembered color and size", () => {
  assert.match(canvasSource, /localStorage\.setItem\("opentakeoff_draw_style", JSON\.stringify\(drawStyle\)\)/);
  assert.match(canvasSource, /hlRef\.current = \{ type: tool, style, pts: \[raw\], key:/);
  assert.match(canvasSource, /type: isDraw \? "draw" : "highlight"/);
  assert.match(canvasSource, /stroke-opacity", tool === "draw" \? "1"/);
});

test("Draw strokes render, hit-test, move, and export as opaque rounded paths", () => {
  assert.match(canvasSource, /\(m\.type === "highlight" \|\| m\.type === "draw"\) && Array\.isArray\(m\.pts\)/);
  assert.match(canvasSource, /if \(m\.type === "draw" && Array\.isArray\(m\.pts\)\)/);
  assert.match(canvasSource, /stroke=\{m\.color \|\| ARROW_COLORS\[0\]\.value\}/);
  assert.match(markedSetSource, /if \(m\.type === "draw" && \(m\.pts \|\| \[\]\)\.length >= 2\)/);
  assert.match(markedSetSource, /borderColor: inkCol, borderWidth: wImg \* ptScale/);
});
