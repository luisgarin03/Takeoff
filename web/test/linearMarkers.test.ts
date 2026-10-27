import { test } from "node:test";
import assert from "node:assert/strict";
import { linearMarkerPoints, normalizeLineMarker } from "../src/lib/linearMarkers.js";

test("line marker choice accepts no mark, circles or X and defaults old projects to plain lines", () => {
  assert.equal(normalizeLineMarker("none"), "none");
  assert.equal(normalizeLineMarker("circle"), "circle");
  assert.equal(normalizeLineMarker("x"), "x");
  assert.equal(normalizeLineMarker(undefined), "none");
  assert.equal(normalizeLineMarker("triangle"), "none");
});

test("short linear takeoffs receive one centered visual marker", () => {
  assert.deepEqual(linearMarkerPoints([[0, 0], [10, 0]], 30), [[5, 0]]);
});

test("marker points follow cumulative polyline distance without changing geometry", () => {
  const points = [[0, 0], [30, 0], [30, 30]];
  assert.deepEqual(linearMarkerPoints(points, 20), [[20, 0], [30, 10]]);
  assert.deepEqual(points, [[0, 0], [30, 0], [30, 30]]);
  assert.deepEqual(linearMarkerPoints([[1, 1], [1, 1]], 20), []);
});
