import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("text notes use a large resizable multiline editor", () => {
  assert.match(source, /Math\.min\(520, el\.clientWidth - inset \* 2\)/);
  assert.match(source, /Math\.min\(180, el\.clientHeight - inset \* 2\)/);
  assert.match(source, /aria-label="Text box content"[\s\S]{0,180}rows=\{8\}/);
  assert.match(source, /width: editor\.width, height: editor\.height[\s\S]{0,500}resize: "both"/);
});

test("the enlarged text editor is clamped inside the visible plan area", () => {
  assert.match(source, /const left = Math\.max\(inset, Math\.min\(anchorLeft, el\.clientWidth - width - inset\)\)/);
  assert.match(source, /const top = Math\.max\(inset, Math\.min\(anchorTop, el\.clientHeight - height - inset\)\)/);
});

test("existing text notes are edited in place without a second rendered box", () => {
  assert.match(source, /function markupTextBoxStage\(m\)/);
  assert.match(source, /anchorStage: textBoxAnchor \|\| anchor,[\s\S]{0,160}markupId: textBoxAnchor \? m\.id : null/);
  assert.match(source, /if \(editor\?\.markupId === m\.id\) return null;/);
  assert.match(source, /border: `2px solid \$\{editor\.markupColor \|\| "#1f3fc7"\}`/);
  assert.match(source, /color: darkMode \? "#f5f2e8" : "#0e1a2e"/);
});
