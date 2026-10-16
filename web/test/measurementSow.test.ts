import test from "node:test";
import assert from "node:assert/strict";
import { measurementAggregateQuantity, measurementAggregateSowText, measurementCallout, measurementCalloutGeometry, measurementQuantity, measurementSowText, syncMeasurementCallouts, syncMeasurementSowBoard } from "../src/lib/measurementSow.js";

test("formats automatic SOW lines as [measurement] - condition name", () => {
  const condition = { finish_tag: "10' ornamental fence", color: "#2563EB" };
  const line = { id: "line-1", measure_role: "linear", computed: { perimeter_lf: 149.96 } };
  const area = { id: "area-1", measure_role: "floor_area", computed: { area_sf: 225.25 } };
  const count = { id: "count-1", measure_role: "count", computed: { count: 1 } };

  assert.equal(measurementSowText(line, condition), "[150 LF] - 10' ornamental fence");
  assert.equal(measurementSowText(area, condition), "[225.3 SF] - 10' ornamental fence");
  assert.equal(measurementSowText(count, condition), "[1 EA] - 10' ornamental fence");
  assert.equal(measurementQuantity(line, "metric"), "45.7 m");
});

test("automatic LF entries always round partial feet up without changing whole feet", () => {
  assert.equal(measurementQuantity({ measure_role: "linear", computed: { perimeter_lf: 149.01 } }), "150 LF");
  assert.equal(measurementQuantity({ measure_role: "linear", computed: { perimeter_lf: 149 } }), "149 LF");
  assert.equal(measurementQuantity({ measure_role: "linear", computed: { perimeter_lf: 0.01 } }), "1 LF");
});

test("condition totals sum precise measurements before rounding the final SOW LF once", () => {
  const shapes = [
    { measure_role: "linear", computed: { perimeter_lf: 40.1 } },
    { measure_role: "linear", computed: { perimeter_lf: 45.1 } },
  ];
  const condition = { finish_tag: "perimeterWall" };
  assert.equal(measurementAggregateQuantity(shapes), "86 LF");
  assert.equal(measurementAggregateSowText(shapes, condition), "[86 LF] - perimeterWall");
  assert.equal(measurementAggregateSowText(shapes, { ...condition, multiplier: 2, waste_pct: 50 }), "[171 LF] - perimeterWall",
    "the live multiplier applies before display rounding, while report-only waste does not change measured SOW copy");
  assert.equal(measurementAggregateQuantity([
    { measure_role: "floor_area", computed: { area_sf: 100 } },
    { measure_role: "deduct", computed: { area_sf: 20 } },
  ], "imperial", { multiplier: 2 }), "160 SF", "area additions and deductions use the canonical signed total");
  assert.equal(measurementAggregateQuantity([
    { measure_role: "count", computed: { count: 2 } },
    { measure_role: "count", computed: { count: 3 } },
  ], "imperial", { multiplier: 2 }), "10 EA", "counts follow the same multiplier rule as live condition totals");
});

test("automatic callout uses the same measurement and condition copy as the SOW", () => {
  const shape = { id: "line-1", measure_role: "linear", verts_norm: [[0.1, 0.2], [0.7, 0.2]], computed: { perimeter_lf: 149.01 } };
  const callout = measurementCallout(shape, { finish_tag: "Chain link", color: "#0D9488" });

  assert.equal(callout.type, "callout");
  assert.equal(callout.text, "[150 LF] - Chain link");
  assert.equal(callout.color, "#0D9488");
  assert.equal(callout.measurement_shape_id, "line-1");
  assert.ok(Math.abs(callout.target[0] - 0.4) < 1e-12);
  assert.equal(callout.target[1], 0.2);
  assert.notDeepEqual(callout.at, callout.target);
});

test("callout target stays on the longest measured segment in every direction", () => {
  const line = measurementCalloutGeometry({
    measure_role: "linear",
    verts_norm: [[0.8, 0.8], [0.7, 0.7], [0.1, 0.7]],
  }).target;
  assert.ok(Math.abs(line[0] - 0.4) < 1e-12);
  assert.equal(line[1], 0.7);

  const polygon = measurementCalloutGeometry({
    measure_role: "floor_area",
    verts_norm: [[0.1, 0.1], [0.8, 0.1], [0.8, 0.4], [0.1, 0.4]],
  });
  assert.deepEqual(polygon.target, [0.45, 0.1]);
  assert.ok(polygon.at.every((value) => value >= 0 && value <= 1));
});

test("linked SOW rows merge into one live condition total and disappear only after its final shape", () => {
  const board: any = { version: 1, sows: [{ id: "sow", activeTabId: "tab", tabs: [{ id: "tab", name: "Scope", entries: [
    { id: "auto", text: "old", color: "#000000", measurementShapeId: "shape-1" },
    { id: "duplicate", text: "old", color: "#000000", measurementShapeId: "shape-2" },
    { id: "manual", text: "keep me", color: "#2563EB" },
  ] }] }] };
  const shapes = [
    { id: "shape-1", condition_id: "new-condition", measure_role: "linear", computed: { perimeter_lf: 40.1 } },
    { id: "shape-2", condition_id: "new-condition", measure_role: "linear", computed: { perimeter_lf: 45.1 } },
  ];
  const condition = { id: "new-condition", finish_tag: "Reassigned fence", color: "#2F7D54" };
  const updated: any = syncMeasurementSowBoard(board, shapes, [condition]);

  assert.deepEqual(updated.sows[0].tabs[0].entries, [
    { id: "auto", text: "[86 LF] - Reassigned fence", color: "#2F7D54",
      measurementConditionId: "new-condition", measurementShapeIds: ["shape-1", "shape-2"] },
    board.sows[0].tabs[0].entries[2],
  ]);
  const oneLeft: any = syncMeasurementSowBoard(updated, [shapes[0]], [condition]);
  assert.equal(oneLeft.sows[0].tabs[0].entries[0].text, "[41 LF] - Reassigned fence");
  assert.deepEqual(oneLeft.sows[0].tabs[0].entries[0].measurementShapeIds, ["shape-1"]);
  assert.deepEqual(syncMeasurementSowBoard(oneLeft, [], [condition]).sows[0].tabs[0].entries, [board.sows[0].tabs[0].entries[2]]);
});

test("reassigning one tracked measurement splits totals without duplicating either condition", () => {
  const board: any = { version: 1, sows: [{ id: "sow", activeTabId: "tab", tabs: [{ id: "tab", name: "Scope", entries: [
    { id: "aggregate-a", text: "[20 LF] - A", color: "#2563EB", measurementConditionId: "a", measurementShapeIds: ["one", "two"] },
  ] }] }] };
  const shapes = [
    { id: "one", condition_id: "b", measure_role: "linear", computed: { perimeter_lf: 8.2 } },
    { id: "two", condition_id: "a", measure_role: "linear", computed: { perimeter_lf: 11.1 } },
  ];
  const updated: any = syncMeasurementSowBoard(board, shapes, [
    { id: "a", finish_tag: "Fence A", color: "#2563EB" },
    { id: "b", finish_tag: "Fence B", color: "#DC2626" },
  ]);
  assert.equal(updated.sows[0].tabs[0].entries.length, 2);
  assert.deepEqual(updated.sows[0].tabs[0].entries.map((entry: any) => entry.text), ["[9 LF] - Fence B", "[12 LF] - Fence A"]);
  assert.equal(updated.sows[0].tabs[0].entries[1].id, "aggregate-a", "the original condition keeps its row identity");
});

test("linked callouts follow geometry and condition edits while preserving a moved text-box anchor", () => {
  const original: any = {
    id: "markup", type: "callout", sheet_id: "sheet", measurement_shape_id: "shape",
    at: [0.9, 0.9], target: [0.2, 0.2], text: "old", color: "#000000",
  };
  const shape = { id: "shape", sheet_id: "sheet", condition_id: "condition", measure_role: "linear",
    verts_norm: [[0.1, 0.4], [0.7, 0.4]], computed: { perimeter_lf: 20.01 } };
  const condition = { id: "condition", finish_tag: "Updated fence", color: "#9333EA" };
  const updated: any[] = syncMeasurementCallouts([original], [shape], [condition]);

  assert.equal(updated[0].text, "[21 LF] - Updated fence");
  assert.equal(updated[0].color, "#9333EA");
  assert.deepEqual(updated[0].at, original.at, "manual label placement remains intact");
  assert.ok(Math.abs(updated[0].target[0] - 0.4) < 1e-12);
  assert.equal(updated[0].target[1], 0.4);
  assert.deepEqual(syncMeasurementCallouts(updated, [], [condition]), []);
});
