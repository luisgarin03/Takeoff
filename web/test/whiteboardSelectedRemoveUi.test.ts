import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/Whiteboard.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(new URL("../src/styles/whiteboard.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("selected Whiteboard objects show a red Remove action on the object instead of the toolbar", () => {
  assert.doesNotMatch(source, /label="Delete selected object"/);
  assert.match(source, /className="wb-selected-remove"[\s\S]*?aria-label="Remove selected object"[\s\S]*?>Remove<\/button>/);
  assert.match(source, /if \(activeItem\)[\s\S]*?if \(activeArrow\)[\s\S]*?if \(activeRectangle\)/);
  assert.match(source, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); removeSelected\(\); \}\}/);
  assert.match(css, /\.wb \.wb-selected-remove \{[^}]*position: absolute;[^}]*z-index: 22;[^}]*background: #dc2626;[^}]*color: #fff !important;[^}]*-webkit-text-fill-color: #fff !important;/);
});

test("keyboard removal keeps using the same undoable selected-object path", () => {
  assert.match(source, /\(e\.key === "Delete" \|\| e\.key === "Backspace"\)[^}]*removeSelected\(\)/);
  assert.match(source, /if \(next !== current\) commit\(next\);/);
});

test("the selected-object Remove button stays screen-sized while the board zoom changes", () => {
  const rule = css.match(/\.wb \.wb-selected-remove \{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /min-height: 28px;/);
  assert.match(rule, /padding: 5px 9px;/);
  assert.match(rule, /transform: translate\(-100%, calc\(-100% - 7px\)\);/);
  assert.doesNotMatch(rule, /scale\(/);
  assert.match(source, /<\/svg>\s*\{selectedRemoveAnchor && !imageCrop && <button type="button" className="wb-selected-remove"/);
});
