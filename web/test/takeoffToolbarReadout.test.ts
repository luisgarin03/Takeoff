import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvasSource = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const toolbarCss = readFileSync(new URL("../src/styles/toolbarTabs.css", import.meta.url), "utf8");

test("live takeoff summary is rendered once inside the Takeoff toolbar tab", () => {
  const takeoffStart = canvasSource.indexOf("takeoff={<>");
  const summary = canvasSource.indexOf('className="takeoff-toolbar-readout"');
  const takeoffEnd = canvasSource.indexOf("</>}\n        />", takeoffStart);

  assert.ok(takeoffStart >= 0, "Takeoff toolbar content exists");
  assert.ok(summary > takeoffStart && summary < takeoffEnd, "summary belongs to the Takeoff toolbar content");
  assert.equal(canvasSource.match(/className="takeoff-toolbar-readout"/g)?.length, 1);
  assert.equal(canvasSource.includes('className="canvas-live-readout"'), false, "the canvas overlay was removed");
});

test("toolbar summary has responsive wrapping styles instead of absolute positioning", () => {
  const start = toolbarCss.indexOf(".takeoff-toolbar-readout {");
  const end = toolbarCss.indexOf("}\n", start);
  const rule = toolbarCss.slice(start, end);

  assert.ok(start >= 0);
  assert.match(rule, /display:\s*grid/);
  assert.match(rule, /flex:\s*1 1/);
  assert.doesNotMatch(rule, /position:\s*absolute/);
  assert.match(toolbarCss, /@media \(max-width: 600px\)[\s\S]*\.takeoff-toolbar-readout/);
});
