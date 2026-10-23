import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles/whiteboard.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("SOW color palettes can extend beyond the panel without losing the rounded header", () => {
  assert.match(css, /\.wb-sow\s*\{[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.wb-sow-brand\s*\{[^}]*border-radius:\s*8px 8px 0 0;/);
  assert.match(css, /\.wb-sow-color-popover\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*4;/);
});
