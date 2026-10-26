import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const whiteboardCss = readFileSync(new URL("../src/styles/whiteboard.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const workspaceCss = readFileSync(new URL("../src/styles/workspaceUi.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Whiteboard top toolbar uses the shared compact frame without styling its children", () => {
  assert.match(
    whiteboardCss,
    /\.wb-header \{[^}]*min-height: 58px;[^}]*padding: 8px 12px;[^}]*border: 1px solid var\(--workspace-border, var\(--ink-faint\)\);[^}]*box-shadow: none;/,
  );
  assert.match(
    whiteboardCss,
    /@media \(min-width: 601px\) \{\s*\.wb-toolbar-overlay > \.wb-header \{ height: 58px; \}\s*\}/,
  );
  assert.match(
    workspaceCss,
    /\.wb-toolbar-overlay > \.wb-tools \{ background: var\(--workspace-surface\); color: #000; border-color: var\(--workspace-border\); \}/,
  );
});

test("Whiteboard metadata uses one Takeoff-style compact mono treatment", () => {
  assert.match(
    whiteboardCss,
    /\.wb-resolution,\s*\.wb-resolution output,\s*\.wb-header-item-count,\s*\.wb-header-utilities \.wb-status,\s*\.wb-header-zoom \{[^}]*font-family: var\(--f-mono\);[^}]*font-size: 11px;[^}]*font-weight: 600;[^}]*line-height: 1;/,
  );
  assert.doesNotMatch(whiteboardCss, /\.wb-header-utilities \.wb-status \{[^}]*font: 12px/);
  assert.doesNotMatch(whiteboardCss, /\.wb-header-item-count \{[^}]*font: 12px/);
});
