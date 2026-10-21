import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(new URL("../src/styles/toolbarTabs.css", import.meta.url), "utf8");

test("the unchanged brand text owns the hidden triple-click gesture", () => {
  assert.match(source, /devLogoGestureRef\.current\.filter\(\(at\) => now - at <= 650\)/);
  assert.match(source, /logo={<strong onClick={handleDevLogoGesture}/);
  assert.doesNotMatch(source, /takeoff-dev-trigger/);
});

test("experimental controls live in the floating developer panel", () => {
  const panelStart = source.indexOf('className="takeoff-dev-panel"');
  const panelEnd = source.indexOf("document.body,", panelStart);
  const panel = source.slice(panelStart, panelEnd);

  assert.ok(panelStart >= 0 && panelEnd > panelStart);
  for (const label of ["Report", "Zone", "AI", "Revisions", "Render settings", "Command line"]) {
    assert.ok(panel.includes(label), `${label} is present in the developer panel`);
  }
  assert.match(css, /\.takeoff-dev-panel\s*{[\s\S]*position:\s*fixed/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.takeoff-dev-panel/);
});

test("AI and Revisions no longer occupy the canvas rail", () => {
  const railStart = source.indexOf('className="canvas-panel-rail"');
  const railEnd = source.indexOf("{chainLinkOpen", railStart);
  const rail = source.slice(railStart, railEnd);

  assert.ok(railStart >= 0 && railEnd > railStart);
  assert.doesNotMatch(rail, /agentAI/);
  assert.doesNotMatch(rail, /setShowRevisions/);
});

test("the regular Takeoff toolbar closes around the moved controls", () => {
  const toolbarStart = source.indexOf("takeoff={<>");
  const toolbarEnd = source.indexOf("</>}\n        />", toolbarStart);
  const toolbar = source.slice(toolbarStart, toolbarEnd);

  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  assert.doesNotMatch(toolbar, /setShowReport/);
  assert.doesNotMatch(toolbar, /<Icon name="zone"/);
  assert.doesNotMatch(toolbar, /Render & fill settings/);
  assert.doesNotMatch(toolbar, /takeoff-dev-command/);
});
