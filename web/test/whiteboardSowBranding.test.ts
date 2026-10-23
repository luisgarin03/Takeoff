import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("../src/components/SOWPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const exportSource = readFileSync(new URL("../src/lib/whiteboardPdfBrowser.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(new URL("../src/styles/whiteboard.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("live and exported SOW panels use the standalone default company logo", () => {
  assert.match(panelSource, /import brandLogo from "\.\.\/assets\/beitzell-fence-company-logo\.png"/);
  assert.match(exportSource, /import brandLogo from "\.\.\/assets\/beitzell-fence-company-logo\.png"/);
  assert.doesNotMatch(exportSource, /bundled legacy artwork|sourceWidth/);
});

test("logo and takeoff title use matching centered insets", () => {
  assert.match(css, /\.wb-sow-logo\s*\{[^}]*padding:\s*0 6px;/);
  assert.match(css, /\.wb-sow-takeoff-title-label\s*\{[^}]*padding:\s*0 6px;/);
  assert.match(css, /\.wb-sow-logo img\s*\{[^}]*object-fit:\s*contain;[^}]*object-position:\s*center;/);
  assert.match(exportSource, /logoRect = \{ x: 13, y: 7, w: Math\.max\(1, logoColumnWidth - 12\)/);
  assert.match(exportSource, /takeoffWidth - 12/);
});
