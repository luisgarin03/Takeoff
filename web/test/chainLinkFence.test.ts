import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateChainLinkFence,
  calculateChainLinkFenceFromLength,
  createChainLinkFence,
  insertFenceMarker,
  pathMetrics,
  pointAtPathT,
  projectPointToPath,
  removeFenceMarker,
  sanitizeChainLinkFences,
  updateFenceMarker,
} from "../src/lib/chainLinkFence.js";

const shape = { id: "line-1", sheet_id: "plan.pdf#1", condition_id: "fence", measure_role: "linear" };
const fence = () => createChainLinkFence(shape, () => "fence-1");

test("100-foot fence uses 9 intermediate posts at 10-foot maximum spacing", () => {
  const result = calculateChainLinkFence(fence(), [[0, 0], [100, 0]], 1);
  assert.equal(result.totalLengthFt, 100);
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].spans, 10);
  assert.equal(result.linePostCount, 9);
  assert.equal(result.cornerPostCount, 2);
  assert.equal(result.totalPostCount, 11);
});

test("each corner-delimited section is calculated independently", () => {
  let record = fence();
  record = insertFenceMarker(record, 35 / 110, () => "corner-a");
  record = insertFenceMarker(record, 85 / 110, () => "corner-b");
  const result = calculateChainLinkFence(record, [[0, 0], [110, 0]], 1);
  assert.deepEqual(result.sections.map((section) => Math.round(section.lengthFt)), [35, 50, 25]);
  assert.deepEqual(result.sections.map((section) => section.intermediate), [3, 4, 2]);
  assert.equal(result.cornerPostCount, 4);
  assert.equal(result.linePostCount, 9);
  assert.equal(result.totalPostCount, 13);
});

test("25-foot section distributes two posts at equal 8.33-foot spans", () => {
  const result = calculateChainLinkFence(fence(), [[0, 0], [25, 0]], 1);
  assert.equal(result.linePostCount, 2);
  assert.ok(Math.abs(result.sections[0].actualSpacingFt - 25 / 3) < 1e-9);
  assert.deepEqual(result.linePosts.map((post) => Number(post.point[0].toFixed(4))), [8.3333, 16.6667]);
});

test("polyline projection and post placement use cumulative path length", () => {
  const metrics = pathMetrics([[0, 0], [30, 0], [30, 40]]);
  const hit = projectPointToPath(metrics, [34, 20]);
  if (!hit) assert.fail("expected a projected point");
  assert.equal(metrics.total, 70);
  assert.ok(Math.abs(hit.path_t - 50 / 70) < 1e-9);
  assert.deepEqual(pointAtPathT(metrics, hit.path_t).map(Math.round), [30, 20]);
});

test("changing maximum spacing recalculates without changing source geometry", () => {
  const record = { ...fence(), max_spacing_ft: 8 };
  const result = calculateChainLinkFenceFromLength(record, 35);
  assert.equal(result.sections[0].spans, 5);
  assert.equal(result.linePostCount, 4);
  assert.equal(result.sections[0].actualSpacingFt, 7);
});

test("manual markers can move and delete while endpoints remain derived", () => {
  let record = insertFenceMarker(fence(), .5, () => "corner-a");
  record = updateFenceMarker(record, "corner-a", { path_t: .25, type: "terminal" });
  assert.equal(record.markers[0].path_t, .25);
  assert.equal(record.markers[0].type, "terminal");
  record = removeFenceMarker(record, "corner-a");
  assert.equal(record.markers.length, 0);
  assert.equal(calculateChainLinkFenceFromLength(record, 20).cornerPostCount, 2);
});

test("duplicate and endpoint markers are rejected", () => {
  let record = insertFenceMarker(fence(), .5, () => "corner-a");
  record = insertFenceMarker(record, .5001, () => "corner-b", .002);
  record = insertFenceMarker(record, 0, () => "corner-c");
  assert.deepEqual(record.markers.map((marker: { id: string }) => marker.id), ["corner-a"]);
});

test("closed loops count the physical start/end post once", () => {
  const record = { ...fence(), closed: true };
  const result = calculateChainLinkFence(record, [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], 1);
  assert.equal(result.totalLengthFt, 40);
  assert.equal(result.cornerPostCount, 1);
  assert.equal(result.sections.length, 1);
  assert.equal(result.linePostCount, 3);
  assert.equal(result.totalPostCount, 4);
});

test("persistence sanitizer keeps one valid calculator per linear shape", () => {
  const record = insertFenceMarker(fence(), .4, () => "corner-a");
  const restored = sanitizeChainLinkFences([record, { ...record, id: "duplicate" }, { ...record, id: "orphan", shape_id: "missing" }], [shape]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].markers[0].id, "corner-a");
});
