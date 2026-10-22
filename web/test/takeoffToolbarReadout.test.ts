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

test("current zoom is shown in the header immediately before User Guide", () => {
  const zoom = canvasSource.indexOf('className="takeoff-header-zoom"');
  const guide = canvasSource.indexOf("<WorkspaceHelp", zoom);
  const summaryMeta = canvasSource.match(/className="takeoff-toolbar-readout-meta">([^<]*)<\/div>/)?.[1] || "";

  assert.ok(zoom >= 0, "header zoom widget exists");
  assert.ok(guide > zoom, "zoom widget is placed before User Guide");
  assert.match(toolbarCss, /\.takeoff-header-zoom\s*\{/);
  assert.doesNotMatch(summaryMeta, /zoom/i, "zoom is no longer duplicated in the Takeoff summary");
});
