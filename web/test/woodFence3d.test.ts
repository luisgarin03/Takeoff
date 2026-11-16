import test from "node:test";
import assert from "node:assert/strict";
import { buildWoodLayout, buildWoodColorMapRows } from "../src/features/fence3d/wood.js";
import { adaptFenceRuns } from "../src/features/fence3d/source.js";
import { fenceConditionKey, METERS_PER_FOOT as FT, normalizeFence3d, WOOD_SPEC } from "../src/features/fence3d/settings.js";

const scope = "[\"sheet-1\",\"condition-wood\"]";
function run(id: string, pointsFt: number[][], pointIds: string[], gates: any[] = [], scopeId = scope) {
  let at = 0;
  const points = pointsFt.map(([x, z]) => [x * FT, z * FT]);
  const segments = points.slice(1).map((b, index) => {
    const a = points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const segment = { id: `${id}:segment:${index}`, index, a, b, length, start: at,
      startPointId: pointIds[index], endPointId: pointIds[index + 1] };
    at += length;
    return segment;
  });
  return { id, label: id, points, pointIds, segments, gateSegments: segments, length: at,
    conditionId: "condition-wood", conditionScopeId: scopeId, conditionName: "Wood privacy fence",
    type: "wood", spec: { ...WOOD_SPEC }, gates };
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("Wood straight runs balance bays below the maximum and derive component quantities", () => {
  const layout = buildWoodLayout({ runs: [run("straight", [[0, 0], [20, 0]], ["a", "b"])] });
  near(layout.totals.fixedLength / FT, 20);
  assert.equal(layout.panels.length, 3);
  assert.ok(layout.panels.every((panel: any) => panel.length / FT <= 8));
  assert.equal(layout.totals.post_end, 2);
  assert.equal(layout.totals.post_line, 2);
  assert.equal(layout.totals.rails, 9);
  assert.equal(layout.totals.footingCount, 4);
  assert.equal(layout.totals.gravelCount, 4);
  assert.equal(layout.totals.pickets, new Set(layout.panels.flatMap((panel: any) => panel.pickets.map((picket: any) => picket.component_id))).size);
  assert.equal(buildWoodColorMapRows(layout).find((row) => row.category === "wood:fixed")?.quantity, "20.00 LF");
});

test("Wood L, T, and four-way connections each use one shared post", () => {
  const l = buildWoodLayout({ runs: [run("L", [[0, 0], [12, 0], [12, 8]], ["a", "corner", "b"])] });
  near(l.totals.fixedLength / FT, 20);
  assert.equal(l.totals.post_corner, 1);
  assert.equal(l.posts.filter((post: any) => post.id.endsWith("node:corner")).length, 1);
  const t = buildWoodLayout({ runs: [
    run("bar", [[-8, 0], [0, 0], [8, 0]], ["west", "join", "east"]),
    run("branch", [[0, 0], [0, 7]], ["join", "north"]),
  ] });
  assert.equal(t.totals.post_threeway, 1);
  assert.equal(t.posts.filter((post: any) => post.id.endsWith("node:join")).length, 1);
  const cross = buildWoodLayout({ runs: [
    run("h", [[-8, 0], [0, 0], [8, 0]], ["west", "cross", "east"]),
    run("v", [[0, -8], [0, 0], [0, 8]], ["south", "cross", "north"]),
  ] });
  assert.equal(cross.totals.post_fourway, 1);
  assert.equal(cross.posts.filter((post: any) => post.id.endsWith("node:cross")).length, 1);
});

test("disconnected paths do not bridge and remain independently represented within a condition", () => {
  const a = run("a", [[0, 0], [12, 0]], ["a0", "a1"]);
  const b = run("b", [[40, 0], [47, 0]], ["b0", "b1"]);
  const layout = buildWoodLayout({ runs: [a, b] });
  near(layout.totals.fixedLength / FT, 19);
  assert.equal(layout.runs.length, 2);
  assert.ok(layout.panels.every((panel: any) => panel.runId === "a" || panel.runId === "b"));
  assert.equal(layout.posts.filter((post: any) => post.type === "end").length, 4);
});

test("single and double swing gate openings cut fixed fence and have unique leaves and hardware", () => {
  const straight = run("gates", [[0, 0], [24, 0]], ["start", "finish"], [
    { id: "walk", type: "single", segment: 1, start: 4, width: 4, height: 6, hingeSide: "start" },
    { id: "double", type: "double", segment: 1, start: 12, width: 8, height: 6 },
  ]);
  const layout = buildWoodLayout({ runs: [straight] });
  near(layout.totals.fixedLength / FT, 12);
  near(layout.totals.gateLength / FT, 12);
  assert.equal(layout.totals.singleGates, 1);
  assert.equal(layout.totals.doubleGates, 1);
  assert.equal(layout.totals.hinges, 6);
  assert.equal(layout.totals.dropRods, 1);
  assert.equal(layout.totals.receivers, 1);
  assert.equal(new Set(layout.gates.flatMap((gate: any) => gate.leaves.map((leaf: any) => leaf.id))).size, 3);
  assert.ok(layout.gates.every((gate: any) => gate.posts.length === 2));
});

test("Wood condition settings survive normalization and right-angle checks flag unsupported joins", () => {
  const key = scope;
  const persisted = normalizeFence3d({ version: 1, conditions: { [key]: { type: "wood", spec: {
    height_ft: 8, max_bay_span_ft: 7, rails: 2, finish_color: "#123456", foundationDepthFt: 4,
  } } } });
  assert.equal(persisted.conditions[key].spec.height_ft, 8);
  assert.equal(persisted.conditions[key].spec.max_bay_span_ft, 7);
  assert.equal(persisted.conditions[key].spec.rails, 2);
  assert.equal(persisted.conditions[key].spec.finish_color, "#123456");
  const invalid = buildWoodLayout({ runs: [run("angled", [[0, 0], [8, 0], [11, 5]], ["a", "corner", "b"])] });
  assert.match(invalid.issues.join(" "), /not a right-angle connection/);
});

test("condition-selected Wood routes through the scaled takeoff adapter and projects gate Count marks", () => {
  const sheetId = "plan.pdf";
  const conditionId = "wood-condition";
  const key = fenceConditionKey(sheetId, conditionId);
  const stored = normalizeFence3d({ version: 1, conditions: { [key]: { type: "wood", spec: { height_ft: 7 } } } });
  const shapes = [
    { id: "wood-run", sheet_id: sheetId, condition_id: conditionId, measure_role: "linear", label: "Wood run",
      verts_norm: [[.05, .1], [.15, .1]], polyline_node_ids: ["begin", "end"],
      computed: { perimeter_lf: 20 } },
    { id: "walk-count", sheet_id: sheetId, condition_id: conditionId, measure_role: "count", gate_type: "single",
      gate_width_ft: 4, verts_norm: [[.1, .1]], label: "Walk gate" },
  ];
  const source = adaptFenceRuns({ shapes, fences: [], sheetId,
    calibration: { width: 2000, height: 1000, feetPerPixel: .1, toleranceFt: .01 },
    settings: { runs: stored.runs, conditions: stored.conditions } });
  assert.equal(source.woodRuns.length, 1);
  assert.equal(source.runs.length, 0);
  assert.equal(source.woodRuns[0].spec.height_ft, 7);
  assert.equal(source.woodRuns[0].gates.length, 1);
  const layout = buildWoodLayout({ runs: source.woodRuns, issues: source.issues });
  near(layout.totals.fixedLength / FT, 16);
  near(layout.totals.gateLength / FT, 4);
});
