import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateChainLinkMaterials } from "../src/lib/chainLinkMaterials.js";

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
