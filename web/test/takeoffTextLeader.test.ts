import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("every text box exposes a leader-arrow control", () => {
  assert.match(source, /function textLeaderButton|const textLeaderButton/);
  assert.match(source, /Add leader arrow for text box/);
  assert.match(source, /m\.type === "text"[\s\S]{0,1600}textLeaderButton\(m, ax, ay\)/);
  assert.match(source, /m\.type === "text" && <button[\s\S]{0,500}armTextLeader\(m\.id\)/);
});

test("the leader button arms one next-click target with cancellation", () => {
  assert.match(source, /function armTextLeader\(mid\)/);
  assert.match(source, /if \(textLeaderMarkupId\) placeTextLeader\(p\)/);
  assert.match(source, /function placeTextLeader\(p\)[\s\S]{0,900}updateMarkup\(markup\.id, \{ target \}\)/);
  assert.match(source, /if \(textLeaderMarkupId\) \{ setTextLeaderMarkupId\(null\); setCommitMsg\("Leader arrow cancelled\."\)/);
});

test("saved text leaders render as a line with an arrowhead", () => {
  assert.match(source, /m\.target && <>[\s\S]{0,900}<line x1=\{ax\}[\s\S]{0,350}arrowheadPath\(ax, ay, tx, ty/);
});

test("a selected text leader exposes a draggable endpoint handle", () => {
  assert.match(source, /kind: "markupLeader"[\s\S]{0,180}beforeMarkup: leaderHit/);
  assert.match(source, /d\.kind === "markupMove" \|\| d\.kind === "markupLeader"/);
  assert.match(source, /selM && <circle cx=\{tx\} cy=\{ty\} r=\{6 \/ z\}/);
});

test("a selected text leader can be removed without deleting its text box", () => {
  assert.match(source, /function removeTextLeader\(mid\)[\s\S]{0,600}delete next\.target;[\s\S]{0,250}dispatchMarkup\(\{ type: "replace", markup: next \}\)/);
  assert.match(source, /const remove = \(\) => removeTextLeader\(markup\.id\);[\s\S]{0,500}aria-label="Remove leader arrow from text box"/);
  assert.match(source, /m\.type === "text" && m\.target && <button[\s\S]{0,450}removeTextLeader\(m\.id\)/);
});
