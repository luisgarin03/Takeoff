import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, rgb } from "pdf-lib";
import { buildPrintDocument, printPageLayout } from "../src/lib/printPlans.js";

test("print layout fits and centers a wide plan inside landscape Letter margins", () => {
  const p = printPageLayout(1440, 720, { paper: "letter", layout: "auto", margin: "18" });
  assert.deepEqual(p.size, [792, 612]);
  assert.equal(p.width / p.height, 2);
  assert.equal(p.x, 18);
  assert.equal(p.y, (612 - p.height) / 2);
  assert.ok(p.y >= 18);
});
test("original paper preserves dimensions with no margins", () => {
  const p = printPageLayout(2592, 1728, { paper: "original", layout: "auto", margin: "0" });
  assert.deepEqual(p.size, [2592, 1728]);
  assert.equal(p.width, 2592);
  assert.equal(p.x, 0);
});
test("printing includes every selected unmarked page, in order, without a cover", async () => {
  const seen: string[] = [];
  const bytes = await buildPrintDocument([{ label: "A" }, { label: "B" }], { paper: "a4", layout: "portrait", margin: "36", grayscale: false }, async (sheet: { label: string }) => {
    seen.push(sheet.label);
    const source = await PDFDocument.create();
    source.addPage([1000, 500]).drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(1, 0, 0) });
    return source.save();
  }, () => {}, () => false);
  assert.deepEqual(seen, ["A", "B"]);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 595.28, height: 841.89 });
});
test("cancelled printing stops before rendering another page", async () => {
  await assert.rejects(buildPrintDocument([{ label: "A" }], {}, async () => { throw new Error("should not render"); }, () => {}, () => true), /cancelled/);
});
