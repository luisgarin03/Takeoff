import test from "node:test";
import assert from "node:assert/strict";
import { calculateOrnamentalFence, createOrnamentalFence, insertOrnamentalPost, removeOrnamentalPost, sanitizeOrnamentalFences } from "../src/lib/ornamentalFence.js";

test("ornamental calculator stays separate and distributes panels per run", () => {
  const shape = { id: "shape-1", sheet_id: "plan.pdf#1", condition_id: "orn", measure_role: "linear" };
  const fence = createOrnamentalFence(shape, () => "orn-1")!;
  const result = calculateOrnamentalFence({ ...fence, panel_width_ft: 8 }, [[0, 0], [20, 0]], 1);
  assert.equal(result.valid, true);
  assert.equal(result.panelCount, 3);
  assert.equal(result.postCount, 4);
  assert.deepEqual(result.posts.map((post) => post.point[0]), [0, 8, 16, 20]);
  assert.equal(result.sections[0].finalPanelWidthFt, 4);
  assert.equal(result.orderedPanelLf, 24);
  assert.equal(result.cutWasteLf, 4);
  assert.equal(fence.panel_width_ft, 8);
});

test("manual ornamental posts increment the total one at a time", () => {
  const shape = { id: "shape-1", sheet_id: "plan.pdf#1", condition_id: "orn", measure_role: "linear" };
  const fence = createOrnamentalFence(shape, () => "orn-1")!;
  const once = insertOrnamentalPost(fence, .25, () => "manual-1");
  const twice = insertOrnamentalPost(once, .75, () => "manual-2");
  const result = calculateOrnamentalFence(twice, [[0, 0], [20, 0]], 1);
  assert.equal(result.automaticPostCount, 4);
  assert.equal(result.manualPostCount, 2);
  assert.equal(result.postCount, 6);
  assert.deepEqual(result.manualPosts.map((post: { point: number[] }) => post.point[0]), [5, 15]);
  const removed = removeOrnamentalPost(twice, "manual-1");
  assert.equal(calculateOrnamentalFence(removed, [[0, 0], [20, 0]], 1).postCount, 5);
  const freePlaced = insertOrnamentalPost(fence, [.8, .2], () => "free-post");
  assert.deepEqual(freePlaced.manual_posts[0].point_norm, [.8, .2]);
});

test("ornamental records sanitize independently by linear shape", () => {
  const shapes = [{ id: "linear", sheet_id: "plan.pdf#2", condition_id: "orn", measure_role: "linear" }];
  const records = sanitizeOrnamentalFences([
    { id: "a", shape_id: "linear", sheet_id: "old", panel_width_ft: 6 },
    { id: "duplicate", shape_id: "linear", sheet_id: "old", panel_width_ft: 8 },
  ], shapes);
  assert.equal(records.length, 1);
  assert.equal(records[0].sheet_id, "plan.pdf#2");
  assert.equal(records[0].panel_width_ft, 6);
});
