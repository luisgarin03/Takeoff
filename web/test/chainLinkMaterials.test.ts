import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateChainLinkMaterials } from "../src/lib/chainLinkMaterials.js";
import { createChainLinkMaterialsPdf } from "../src/lib/chainLinkMaterialsPdf.js";

test("chain-link material estimate totals runs and estimates line and end posts", () => {
  const result = calculateChainLinkMaterials({ linePostSpacing: "10", wastePercent: "0" }, ["100", "50"]);
  assert.equal(result.totalFenceLength, 150);
  assert.equal(result.linePosts, 13);
  assert.equal(result.endPosts, 4);
  assert.equal(result.rows.find((row) => row.id === "fabric")?.quantity, 150);
  assert.equal(result.rows.find((row) => row.id === "top-rail")?.quantity, 8);
  assert.equal(result.rows.find((row) => row.id === "rail-sleeves")?.quantity, 6);
});

test("chain-link material estimate includes gates, accessories, and barbed wire", () => {
  const result = calculateChainLinkMaterials({
    linePostSpacing: "10", wastePercent: "0", gateQuantity: "1", doubleSwingGates: "1",
    barbedWireStrands: "3", barbedWireRollLength: "1000", tensionWireRows: "2",
  }, ["200"]);
  assert.equal(result.gatePosts, 2);
  assert.equal(result.rows.find((row) => row.id === "gate-hinges")?.quantity, 2);
  assert.equal(result.rows.find((row) => row.id === "drop-rods")?.quantity, 1);
  assert.equal(result.rows.find((row) => row.id === "barbed-wire")?.quantity, 1);
  assert.equal(result.rows.find((row) => row.id === "tension-wire")?.quantity, 400);
});

test("manual end-post quantity replaces the per-run estimate", () => {
  const result = calculateChainLinkMaterials({ manualEndPosts: "7", wastePercent: "0" }, ["30", "40"]);
  assert.equal(result.endPosts, 7);
  assert.match(result.rows.find((row) => row.id === "end-posts")?.note || "", /entered by the user/);
});

test("post concrete uses cylindrical hole diameter, depth, post count, bag yield, and extra allowance", () => {
  const result = calculateChainLinkMaterials({ linePostSpacing: "10" }, ["100"]);
  assert.equal(result.linePosts, 9);
  assert.equal(result.endPosts, 2);
  assert.equal(result.concrete.linePosts, 17.67);
  assert.equal(result.concrete.fittingPosts, 4.71);
  assert.equal(result.concrete.totalCubicFeet, 24.62);
  assert.equal(result.concrete.bags, 42);
  assert.equal(result.rows.find((row) => row.id === "concrete")?.quantity, 42);
});

test("supplier material list exports as a paginated landscape PDF", async () => {
  const rows = Array.from({ length: 35 }, (_, index) => ({
    material: `Fence material ${index + 1}`,
    dimension: "Six feet high, two inch mesh opening",
    quantity: index + 1,
    unit: "pieces",
    note: "Calculated quantity with project-specific supplier notes and installation details.",
  }));
  const bytes = await createChainLinkMaterialsPdf({ values: { project: "Sample Project", material: "Chain-link fence", finish: "Black" }, totalFenceLength: 420, rows });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 792, height: 612 });
});
