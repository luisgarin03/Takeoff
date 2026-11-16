import test from "node:test";
import assert from "node:assert/strict";
import { adaptFenceRuns } from "../src/features/fence3d/source.js";
import { buildOrnamentalLayout } from "../src/features/fence3d/ornamental.js";
import { createOrnamentalScene } from "../src/features/fence3d/ornamentalScene.js";
import { emptyFence3d, fenceConditionKey, METERS_PER_FOOT as FT, migrateLegacyOrnamentalFences, normalizeFence3d } from "../src/features/fence3d/settings.js";

const sheetId = "plan.pdf#1";
const calibration = { width: 1000, height: 1000, feetPerPixel: .6 };
const shape = (id: string, points: number[][], conditionId = "ornamental", nodeIds?: string[]) => ({
  id, sheet_id: sheetId, condition_id: conditionId, measure_role: "linear", label: id,
  verts_norm: points.map(([x, z]) => [.5 + x / 600, .5 - z / 600]),
  polyline_node_ids: nodeIds,
  computed: { perimeter_lf: points.slice(1).reduce((sum, point, index) =>
    sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]), 0) },
});
const config = (conditions: Record<string, unknown> = {}, runs = {}) => normalizeFence3d({
  ...emptyFence3d(), runs,
  conditions: Object.fromEntries(Object.entries(conditions).map(([id, value]) => [fenceConditionKey(sheetId, id), value])),
});
const generate = (shapes: any[], conditions: Record<string, unknown> = {}, runs = {}) => {
  const adapted = adaptFenceRuns({ shapes, fences: [], sheetId, calibration,
    settings: config(conditions, runs), conditionNames: {} });
  return buildOrnamentalLayout({ runs: adapted.ornamentalRuns, issues: adapted.issues });
};
const condition = (id: string, spec = {}) => ({ type: "ornamental", spec });
const ft = (value: number) => value * FT;

test("legacy 2D ornamental attachments migrate their type and panel span into 3D condition settings", () => {
  const source = shape("legacy-run", [[0, 0], [16, 0]], "legacy-condition");
  const migrated = migrateLegacyOrnamentalFences(null, [{ shape_id: source.id, sheet_id: sheetId, panel_width_ft: 6 }], [source]);
  const setting = migrated.conditions[fenceConditionKey(sheetId, "legacy-condition")];
  assert.equal(setting.type, "ornamental");
  assert.equal(setting.spec.max_panel_span_ft, 6);
  assert.equal(setting.spec.strategy, "maximum");
  const adapted = adaptFenceRuns({ shapes: [source], fences: [], sheetId, calibration,
    settings: migrated, conditionNames: {} });
  const layout = buildOrnamentalLayout({ runs: adapted.ornamentalRuns, issues: adapted.issues });
  assert.equal(layout.panels.length, 3);
});

test("explicit 3D condition and run types take precedence over legacy ornamental attachments", () => {
  const source = shape("legacy-run", [[0, 0], [16, 0]], "legacy-condition");
  const conditionKey = fenceConditionKey(sheetId, "legacy-condition");
  const explicitCondition = normalizeFence3d({ ...emptyFence3d(), conditions: { [conditionKey]: { type: "chain-link" } } });
  const conditionResult = migrateLegacyOrnamentalFences(explicitCondition, [{ shape_id: source.id, panel_width_ft: 6 }], [source]);
  assert.equal(conditionResult.conditions[conditionKey].type, "chain-link");
  const explicitRun = normalizeFence3d({ ...emptyFence3d(), runs: { [source.id]: { type: "guardrail" } } });
  const sibling = shape("legacy-sibling", [[0, 8], [16, 8]], "legacy-condition");
  const runResult = migrateLegacyOrnamentalFences(explicitRun, [
    { shape_id: source.id, panel_width_ft: 6 }, { shape_id: sibling.id, panel_width_ft: 6 },
  ], [source, sibling]);
  assert.equal(runResult.runs[source.id].type, "guardrail");
  assert.equal(runResult.conditions[conditionKey], undefined);
});

test("the default keeps specified panel spacing and makes only the final bay shorter", () => {
  const layout = generate([shape("straight", [[0, 0], [10, 0], [17, 0]])],
    { ornamental: condition("ornamental", { max_panel_span_ft: 8, rails: 2 }) });
  assert.equal(layout.panels.length, 3);
  assert.equal(layout.posts.length, 4);
  assert.equal(layout.totals.end, 2);
  assert.equal(layout.totals.panelPosts, 2);
  assert.equal(layout.totals.flatBrackets, 3 * 2 * 2);
  assert.equal(layout.totals.swivelBrackets, 0);
  assert.deepEqual(layout.panels.map((panel) => +(panel.length / FT).toFixed(5)), [8, 8, 1]);
  assert.ok(layout.panels.every((panel) => panel.brackets.length === panel.railCount * 2));
});

test("right-angle corners share a corner post and use flat brackets on both sides", () => {
  const layout = generate([shape("corner", [[0, 0], [20, 0], [20, 20]])],
    { ornamental: condition("ornamental", { max_panel_span_ft: 20, rails: 2 }) });
  assert.equal(layout.panels.length, 2);
  assert.equal(layout.posts.length, 3);
  const corner = layout.posts.find((post) => post.type === "corner")!;
  assert.equal(layout.panels.flatMap((panel) => panel.brackets).filter((bracket) => bracket.postId === corner.id).length, 4);
  assert.equal(layout.totals.swivelBrackets, 0);
});

test("T and cross junctions share one post and bracket counts scale with rail count", () => {
  const branches = (directions: number[][], conditionId = "shared") => directions.map(([x, z], index) =>
    shape("branch-" + index, [[0, 0], [x, z]], conditionId, ["junction", "end-" + index]));
  const options = { shared: condition("shared", { max_panel_span_ft: 20, rails: 3 }) };
  const t = generate(branches([[100, 0], [-100, 0], [0, 100]]), options);
  const tPost = t.posts.find((post) => post.type === "junction")!;
  assert.equal(t.posts.filter((post) => post.type === "junction").length, 1);
  assert.equal(t.panels.flatMap((panel) => panel.brackets).filter((bracket) => bracket.postId === tPost.id).length, 9);
  const cross = generate(branches([[100, 0], [-100, 0], [0, 100], [0, -100]]), options);
  const crossPost = cross.posts.find((post) => post.type === "junction")!;
  assert.equal(cross.posts.filter((post) => post.type === "junction").length, 1);
  assert.equal(cross.panels.flatMap((panel) => panel.brackets).filter((bracket) => bracket.postId === crossPost.id).length, 12);
  assert.equal(cross.totals.swivelBrackets, 0);
});

test("a cross with one 30 degree branch has 9 flat and 3 swivel bracket locations", () => {
  const layout = generate([
    shape("right", [[0, 0], [100, 0]], "cross30", ["junction", "right-end"]),
    shape("left", [[0, 0], [-100, 0]], "cross30", ["junction", "left-end"]),
    shape("up", [[0, 0], [0, 100]], "cross30", ["junction", "up-end"]),
    shape("angled", [[0, 0], [86.602540378, 50]], "cross30", ["junction", "angled-end"]),
  ], { cross30: condition("cross30", { max_panel_span_ft: 20, rails: 3 }) });
  const junction = layout.posts.find((post) => post.type === "junction")!;
  const junctionBrackets = layout.panels.flatMap((panel) => panel.brackets).filter((bracket) => bracket.postId === junction.id);
  assert.equal(junctionBrackets.filter((bracket) => bracket.kind === "flatBrackets").length, 9);
  assert.equal(junctionBrackets.filter((bracket) => bracket.kind === "swivelBrackets").length, 3);
});

test("gates interrupt fixed panels, count unique posts and give double leaves independent hinge pivots", () => {
  const run = shape("gated", [[0, 0], [300, 0]], "gates", ["start", "end"]);
  const layout = generate([run], { gates: condition("gates", { max_panel_span_ft: 20, rails: 3 }) }, {
    gated: { type: "ornamental", gates: [{ id: "double", type: "double", segment: 1, start: 8, width: 8, height: 4,
      startOpenDegrees: 35, endOpenDegrees: -20 }] },
  });
  assert.equal(layout.totals.doubleGates, 1);
  assert.equal(layout.totals.gate, 2);
  assert.equal(layout.totals.hinges, 2);
  assert.equal(layout.totals.latches, 1);
  assert.equal(layout.totals.keepers, 1);
  assert.equal(layout.totals.dropRods, 1);
  assert.equal(layout.gates[0].leaves.length, 2);
  assert.equal(layout.gates[0].leaves[0].openDegrees, 35);
  assert.equal(layout.gates[0].leaves[1].openDegrees, -20);
  assert.notEqual(layout.gates[0].leaves[0].hingeSetId, layout.gates[0].leaves[1].hingeSetId);
  const scene = createOrnamentalScene(layout);
  const pivots: any[] = [];
  scene.traverse((object: any) => { if (object.userData.kind === "gateLeaf") pivots.push(object); });
  assert.equal(pivots.length, 2);
  assert.deepEqual(pivots.map((pivot) => pivot.userData.openDegrees), [35, -20]);
  assert.notEqual(pivots[0].rotation.y, pivots[1].rotation.y);
  assert.equal(layout.totals.installedLength + layout.totals.gateOpenings, layout.totals.path);
  assert.equal(layout.panels.reduce((sum, panel) => sum + panel.brackets.length, 0), layout.panels.length * 6);
});

test("distinct conditions and disconnected runs stay separate; condition settings survive reload", () => {
  const shapes = [
    shape("same-name-a", [[0, 0], [10, 0]], "condition-a", ["node-a", "node-b"]),
    shape("same-name-b", [[10, 0], [20, 0]], "condition-b", ["node-b", "node-c"]),
    shape("disconnected-a", [[0, 10], [10, 10]], "condition-c", ["c-a", "c-b"]),
    shape("disconnected-b", [[30, 10], [40, 10]], "condition-c", ["c-c", "c-d"]),
  ];
  const options = Object.fromEntries(["condition-a", "condition-b", "condition-c"].map((id) => [id, condition(id, { max_panel_span_ft: 20 })]));
  const layout = generate(shapes, options);
  assert.equal(layout.posts.filter((post) => post.conditionId === "condition-a").length, 2);
  assert.equal(layout.posts.filter((post) => post.conditionId === "condition-b").length, 2);
  assert.equal(layout.posts.filter((post) => post.conditionId === "condition-c").length, 4);
  assert.equal(new Set(layout.posts.map((post) => post.component_id)).size, layout.posts.length);
  const key = fenceConditionKey(sheetId, "condition-a");
  const restored = normalizeFence3d({ ...emptyFence3d(), conditions: { [key]: options["condition-a"] },
    display: { conditionVisibility: { [key]: false } } });
  assert.equal((restored.conditions as any)[key].type, "ornamental");
  assert.equal((restored.conditions as any)[key].spec.max_panel_span_ft, 20);
  assert.equal((restored.display.conditionVisibility as any)[key], false);
});
