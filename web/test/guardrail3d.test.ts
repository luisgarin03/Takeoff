import test from "node:test";
import assert from "node:assert/strict";
import { adaptFenceRuns } from "../src/features/fence3d/source.js";
import { buildGuardrailLayout } from "../src/features/fence3d/guardrail.js";
import { createGuardrailScene } from "../src/features/fence3d/guardrailScene.js";
import { buildGuardrailColorMapRows } from "../src/features/fence3d/colorMap.js";
import { emptyFence3d, fenceConditionKey, METERS_PER_FOOT as FT, normalizeFence3d } from "../src/features/fence3d/settings.js";

const sheetId = "guardrail-plan.pdf#1";
const calibration = { width: 1000, height: 1000, feetPerPixel: .6 };
function shape(id: string, points: number[][], conditionId = "guardrail", nodeIds?: string[]) {
  return { id, sheet_id: sheetId, condition_id: conditionId, measure_role: "linear", label: id,
    verts_norm: points.map(([x, z]) => [.5 + x / 600, .5 - z / 600]),
    polyline_node_ids: nodeIds || points.map((_, index) => `${id}:node:${index}`),
    computed: { perimeter_lf: points.slice(1).reduce((sum, point, index) =>
      sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]), 0) } };
}
function adapt(shapes: any[], types: Record<string, string> = {}) {
  const conditions = Object.fromEntries(Object.entries(types).map(([id, type]) => [fenceConditionKey(sheetId, id), { type }]));
  const settings = normalizeFence3d({ ...emptyFence3d(), conditions });
  return adaptFenceRuns({ shapes, fences: [], sheetId, calibration, settings, conditionNames: {} }) as any;
}
function guardrail(shapes: any[]) {
  const source = adapt(shapes, Object.fromEntries(shapes.map((item) => [item.condition_id, "guardrail"])));
  return { source, layout: buildGuardrailLayout({ runs: source.guardrailRuns }) };
}

test("20 ft straight W-beam uses 6 ft stations, adds its endpoint, and reports plan LF", () => {
  const { layout } = guardrail([shape("straight", [[0, 0], [20, 0]])]);
  const route = layout.routes[0];
  assert.equal(layout.routes.length, 1);
  assert.ok(Math.abs(layout.totals.length / FT - 20) < 1e-8);
  assert.deepEqual(route.supports.map((support) => +support.stationFt.toFixed(5)), [0, 6, 12, 18, 20]);
  assert.equal(route.terminals.length, 2);
  const row = buildGuardrailColorMapRows(layout)[0];
  assert.equal(row.title, "Guardrail");
  assert.equal(row.quantity, "20.00 ft LF");
  const scene = createGuardrailScene(layout);
  const components: any[] = [];
  scene.traverse((object: any) => { if (object.userData.component_id) components.push(object); });
  assert.equal(new Set(components.map((object) => object.userData.component_id)).size, components.length);
  const markers = components.filter((object) => object.userData.kind === "guardrailTerminalMarker");
  assert.equal(markers.length, 2);
  assert.ok(markers.every((marker) => marker.material.color.getHexString() === "f0c43c"));
});

test("a connected 12 ft plus 8 ft L keeps stationing through the turn and only has two ends", () => {
  const shapes = [
    shape("l-east", [[0, 0], [12, 0]], "l-condition", ["l-start", "l-corner"]),
    shape("l-north", [[12, 0], [12, 8]], "l-condition", ["l-corner", "l-end"]),
  ];
  const { layout } = guardrail(shapes);
  assert.equal(layout.routes.length, 1);
  const route = layout.routes[0];
  assert.ok(Math.abs(layout.totals.length / FT - 20) < 1e-8);
  assert.deepEqual(route.supports.map((support) => +support.stationFt.toFixed(5)), [0, 6, 12, 18, 20]);
  assert.ok(Math.abs(route.supports[2].point[0] / FT - 12) < 1e-8);
  assert.ok(Math.abs(route.supports[2].point[2]) < 1e-8);
  assert.equal(route.terminals.length, 2);
});

test("disconnected lines under one condition stay separate, sum their path, and share a condition group", () => {
  const shapes = [
    shape("disconnected-a", [[0, 0], [20, 0]], "same-condition"),
    shape("disconnected-b", [[40, 0], [48, 0]], "same-condition"),
  ];
  const { layout } = guardrail(shapes);
  assert.equal(layout.routes.length, 2);
  assert.ok(Math.abs(layout.totals.length / FT - 28) < 1e-8);
  assert.equal(layout.totals.terminals, 4);
  assert.deepEqual(layout.routes.map((route) => route.supports.map((support) => +support.stationFt.toFixed(4))),
    [[0, 6, 12, 18, 20], [0, 6, 8]]);
  const scene = createGuardrailScene(layout);
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0].userData.kind, "condition");
  assert.equal(scene.children[0].userData.conditionScopeId, fenceConditionKey(sheetId, "same-condition"));
  assert.equal(scene.children[0].children.length, 2);
});

test("guardrail type persists by sheet and condition and stays separate alongside existing fence generators", () => {
  const shapes = [shape("rail", [[0, 0], [20, 0]], "rail-condition"),
    shape("chain", [[0, 20], [20, 20]], "chain-condition"),
    shape("ornamental", [[0, 40], [20, 40]], "ornamental-condition")];
  const source = adapt(shapes, { "rail-condition": "guardrail", "chain-condition": "chain-link", "ornamental-condition": "ornamental" });
  assert.equal(source.guardrailRuns.length, 1);
  assert.equal(source.runs.length, 1);
  assert.equal(source.ornamentalRuns.length, 1);
  const persisted = normalizeFence3d({ ...emptyFence3d(), conditions: {
    [fenceConditionKey(sheetId, "rail-condition")]: { type: "guardrail" },
  } });
  const reloaded = normalizeFence3d(JSON.parse(JSON.stringify(persisted)));
  assert.equal(reloaded.conditions[fenceConditionKey(sheetId, "rail-condition")].type, "guardrail");
  assert.equal(buildGuardrailLayout({ runs: source.guardrailRuns }).routes[0].sourceRunIds[0], "rail");
});
