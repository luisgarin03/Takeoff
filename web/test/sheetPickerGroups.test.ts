import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvas = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const menu = readFileSync(new URL("../src/components/ToolMenu.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("sheet selector groups nested page rows below collapsible PDF parents", () => {
  assert.match(canvas, /section: "PDF sets"/);
  assert.match(canvas, /disclosure: expanded \? "expanded" : "collapsed"/);
  assert.match(canvas, /if \(!expanded\) continue;[\s\S]{0,900}depth: 1/);
  assert.doesNotMatch(canvas, /section: "Sheets in this set"/);
});

test("page counts load lazily and only the active PDF expands automatically", () => {
  assert.match(canvas, /const loadSheetPickerPageCount = useCallback/);
  assert.match(canvas, /setSheetPickerExpandedFiles[\s\S]{0,300}current\.has\(active\)/);
  assert.match(canvas, /if \(!expanded\) loadSheetPickerPageCount\(name\)/);
});

test("the shared menu renders disclosure chevrons and nested indentation", () => {
  assert.match(menu, /const depth = Math\.max\(0, Number\(it\.depth\) \|\| 0\)/);
  assert.match(menu, /it\.disclosure === "expanded" \? "chevronDown" : "chevronRight"/);
});
