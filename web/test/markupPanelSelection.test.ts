import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvasSource = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const appCss = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

test("selected canvas markup is identified and scrolled into view in the Markups panel", () => {
  assert.match(canvasSource, /markupPanelRowRefs\.current\.get\(selectedMarkupId\)\?\.scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
  assert.match(canvasSource, /className=\{`markup-panel-row\$\{markupSelected \? " is-selected" : ""\}`\}/);
  assert.match(canvasSource, /markupSelected && <span className="markup-panel-selected-label">Selected<\/span>/);
});

test("markup panel rows select the matching canvas markup and expose a visible selected style", () => {
  assert.match(canvasSource, /onClick=\{\(\) => selectMarkup\(m\.id\)\}/);
  assert.match(appCss, /\.markup-panel-row\.is-selected\s*\{[\s\S]*?border-left-color:\s*var\(--cobalt\)/);
  assert.match(appCss, /\.markup-panel-selected-label\s*\{/);
});

test("deleting a markup clears stale panel selection and editing state", () => {
  assert.match(canvasSource, /setSelectedMarkupId\(\(id\) => \(id === mid \? null : id\)\)/);
  assert.match(canvasSource, /setPanelEditId\(\(id\) => \(id === mid \? null : id\)\)/);
});
