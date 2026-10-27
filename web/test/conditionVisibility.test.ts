import test from "node:test";
import assert from "node:assert/strict";
import { conditionTakeoffVisible, filterVisibleConditionContent } from "../src/lib/conditionVisibility.js";

test("condition takeoff visibility defaults on for existing projects", () => {
  assert.equal(conditionTakeoffVisible(undefined), true);
  assert.equal(conditionTakeoffVisible({}), true);
  assert.equal(conditionTakeoffVisible({ takeoff_visible: true }), true);
  assert.equal(conditionTakeoffVisible({ takeoff_visible: false }), false);
});

test("hidden conditions remove their shapes, linked callouts, and linked fence overlays only", () => {
  const conditions = [
    { id: "shown", takeoff_visible: true },
    { id: "hidden", takeoff_visible: false },
  ];
  const shapes = [
    { id: "shape-shown", condition_id: "shown", sheet_id: "A1.pdf" },
    { id: "shape-hidden", condition_id: "hidden", sheet_id: "A1.pdf" },
  ];
  const markups = [
    { id: "manual-note", type: "text", sheet_id: "A1.pdf" },
    { id: "callout-shown", measurement_shape_id: "shape-shown", sheet_id: "A1.pdf" },
    { id: "callout-hidden", measurement_shape_id: "shape-hidden", sheet_id: "A1.pdf" },
    { id: "orphan-callout", measurement_shape_id: "missing", sheet_id: "A1.pdf" },
  ];
  const chainLinkFences = [
    { id: "fence-shown", shape_id: "shape-shown", sheet_id: "A1.pdf" },
    { id: "fence-hidden", shape_id: "shape-hidden", sheet_id: "A1.pdf" },
  ];

  const result = filterVisibleConditionContent({ conditions, shapes, markups, chainLinkFences });

  assert.deepEqual(result.shapes.map((item) => item.id), ["shape-shown"]);
  assert.deepEqual(result.markups.map((item) => item.id), ["manual-note", "callout-shown", "orphan-callout"]);
  assert.deepEqual(result.chainLinkFences.map((item) => item.id), ["fence-shown"]);
  assert.equal(shapes.length, 2, "visibility is presentation-only and does not mutate measurements");
});
