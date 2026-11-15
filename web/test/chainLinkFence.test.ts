import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateChainLinkFence,
  calculateChainLinkFenceFromLength,
  connectChainLinkBranch,
  createChainLinkFence,
  insertFenceMarker,
  moveChainLinkJunction,
  pathMetrics,
  pointAtPathT,
  prepareChainLinkJunction,
  projectPointToPath,
  removeFenceMarker,
  sanitizeChainLinkFences,
  summarizeChainLinkFencePosts,
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

test("each section is spaced independently and straight marker posts are counted", () => {
  let record = fence();
  record = insertFenceMarker(record, 35 / 110, () => "corner-a");
  record = insertFenceMarker(record, 85 / 110, () => "corner-b");
  const result = calculateChainLinkFence(record, [[0, 0], [110, 0]], 1);
  assert.deepEqual(result.sections.map((section) => Math.round(section.lengthFt)), [35, 50, 25]);
  assert.deepEqual(result.sections.map((section) => section.intermediate), [3, 4, 2]);
  assert.equal(result.cornerPostCount, 4);
  assert.equal(result.linePostCount, 11);
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

test("interior marker removal leaves endpoints derived", () => {
  const record = insertFenceMarker(fence(), .5, () => "corner-a");
  assert.equal(record.markers[0].path_t, .5);
  const withoutMarker = removeFenceMarker(record, "corner-a");
  assert.equal(withoutMarker.markers.length, 0);
  assert.equal(calculateChainLinkFenceFromLength(withoutMarker, 20).cornerPostCount, 2);
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
  assert.equal(result.cornerPostCount, 4);
  assert.equal(result.sections.length, 4);
  assert.equal(result.linePostCount, 0);
  assert.equal(result.totalPostCount, 4);
});

test("open fence endpoints are terminals and straight interior posts are automatic line posts", () => {
  const record = insertFenceMarker(fence(), .5, () => "corner-a");
  const result = calculateChainLinkFence(record, [[0, 0], [100, 0]], 1);
  assert.equal(result.terminalPostCount, 2);
  assert.equal(result.actualCornerPostCount, 0);
  assert.equal(result.linePostCount, 9);
  assert.equal(result.corners.find((post) => post.id === "corner-a")?.directions, 2);
});

test("post type follows path geometry and ignores legacy type metadata", () => {
  const record = insertFenceMarker(fence(), .5, () => "post-3");
  const legacyOverride = { ...record, markers: [{ ...record.markers[0], type: "threeway" }] };
  assert.equal(calculateChainLinkFence(legacyOverride, [[0, 0], [100, 0]], 1).corners.find((post) => post.id === "post-3")?.type, "line");
  assert.equal(calculateChainLinkFence(record, [[0, 0], [50, 0], [50, 50]], 1).corners.find((post) => post.id === "post-3")?.type, "corner");
  assert.equal(calculateChainLinkFence(record, [[0, 0], [100, 0]], 1).corners.find((post) => post.endpoint)?.type, "terminal");
});

test("an extruded three-way junction counts as one shared post", () => {
  const secondShape = { ...shape, id: "line-2" };
  const thirdShape = { ...shape, id: "line-3" };
  const records = [fence(), createChainLinkFence(secondShape, () => "fence-2"), createChainLinkFence(thirdShape, () => "fence-3")].filter(Boolean) as Array<NonNullable<ReturnType<typeof createChainLinkFence>>>;
  const linked = records.map((item) => ({ ...item, shared_posts: { [`${item.id}-start`]: "junction-1" } }));
  const entries = linked.map((item: NonNullable<ReturnType<typeof createChainLinkFence>>) => ({ fence: item, calculation: calculateChainLinkFence(item, [[0, 0], [100, 0]], 1) }));
  const summary = summarizeChainLinkFencePosts(entries);
  assert.equal(summary.terminalPostCount, 3);
  assert.equal(summary.threeWayPostCount, 1);
  assert.equal(summary.totalPostCount, 31);
});

test("persistence sanitizer keeps one valid calculator per linear shape", () => {
  const record = insertFenceMarker(fence(), .4, () => "corner-a");
  const restored = sanitizeChainLinkFences([record, { ...record, id: "duplicate" }, { ...record, id: "orphan", shape_id: "missing" }], [shape]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].markers[0].id, "corner-a");
});

test("branches from the middle of a run reuse one junction with four or more directions", () => {
  const runs = [shape, ...[2, 3, 4].map((n) => ({ ...shape, id: `line-${n}` }))];
  const [main, first] = connectChainLinkBranch(
    fence(), createChainLinkFence(runs[1], () => "fence-2")!,
    { pathT: .5, postId: undefined }, () => "shared-post", () => "junction",
  )!;
  const [updated, second] = connectChainLinkBranch(
    main, createChainLinkFence(runs[2], () => "fence-3")!,
    { pathT: .5, postId: "shared-post" }, () => "unused-post", () => "unused-junction",
  )!;
  const [updatedFirst, third] = connectChainLinkBranch(
    first, createChainLinkFence(runs[3], () => "fence-4")!,
    { pathT: 0, postId: "fence-2-start" }, () => "unused-post", () => "unused-junction",
  )!;
  const restored = sanitizeChainLinkFences([updated, updatedFirst, second, third], runs);
  const paths = [[[0, 0], [100, 0]], [[50, 0], [50, -20]], [[50, 0], [50, 20]], [[50, 0], [70, 20]]];
  const entries = restored.map((fence, i) => ({ fence, calculation: calculateChainLinkFence(fence, paths[i], 1) }));
  const summary = summarizeChainLinkFencePosts(entries);
  assert.equal(restored[0].markers.length, 1);
  assert.equal(summary.terminalPostCount, 5);
  assert.equal(summary.multiWayPostCount, 1);
  assert.equal(summary.totalPostCount - summary.linePostCount, 6);
  assert.deepEqual(entries.map(({ calculation }) => calculation.corners.find((post) => post.shared_post_id)?.point), Array(4).fill([50, 0]));

  const target = [40, 10];
  const moved = restored.map((record, i) => moveChainLinkJunction(prepareChainLinkJunction(record, paths[i])!, "junction", target)!);
  assert.deepEqual(moved[0].points, [[0, 0], target, [100, 0]]);
  for (let i = 1; i < moved.length; i++) assert.deepEqual(moved[i].points, [target, paths[i][1]]);
  const movedEntries = moved.map(({ fence, points }) => ({ fence, calculation: calculateChainLinkFence(fence, points, 1) }));
  const movedSummary = summarizeChainLinkFencePosts(movedEntries);
  assert.equal(movedSummary.multiWayPostCount, 1);
  assert.equal(movedSummary.terminalPostCount, 5);
  assert.ok(movedEntries[0].calculation.totalLengthFt > 100);
  for (const { calculation } of movedEntries) {
    const [x, y] = calculation.corners.find((post) => post.shared_post_id === "junction")!.point;
    assert.ok(Math.hypot(x - target[0], y - target[1]) < 1e-6);
  }
});

test("moving one junction leaves another on the same run in place", () => {
  const record = { ...fence(), shared_posts: { first: "a", second: "b" },
    markers: [{ id: "first", path_t: .25, type: "corner", type_override: false },
      { id: "second", path_t: .75, type: "corner", type_override: false }] };
  const run = prepareChainLinkJunction(record, [[0, 0], [100, 0]])!;
  const moved = moveChainLinkJunction(run, "a", [25, 25])!;
  assert.deepEqual(moved.points, [[0, 0], [25, 25], [75, 0], [100, 0]]);
  const result = calculateChainLinkFence(moved.fence, moved.points, 1);
  const fixed = result.corners.find((post) => post.shared_post_id === "b")!.point;
  assert.ok(Math.hypot(fixed[0] - 75, fixed[1]) < 1e-6);
  assert.equal(moveChainLinkJunction(run, "a", [75, 0]), null);
});
