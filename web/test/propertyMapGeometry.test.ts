import test from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, pathLengthMeters, polygonAreaMeters2, formatPropertyMeasurement } from "../src/lib/propertyMapGeometry.js";

test("property map geodesic length measures a one-degree equatorial segment", () => {
  const distance = distanceMeters({ lng: 0, lat: 0 }, { lng: 1, lat: 0 });
  assert.ok(distance > 111_000 && distance < 112_000);
});

test("property map paths sum every segment", () => {
  const points = [{ lng: 0, lat: 0 }, { lng: 0.001, lat: 0 }, { lng: 0.001, lat: 0.001 }];
  assert.ok(pathLengthMeters(points) > 220 && pathLengthMeters(points) < 225);
});

test("property map area returns zero for incomplete polygons and area for closed rings", () => {
  const square = [{ lng: 0, lat: 0 }, { lng: 0.0001, lat: 0 }, { lng: 0.0001, lat: 0.0001 }, { lng: 0, lat: 0.0001 }];
  assert.equal(polygonAreaMeters2(square.slice(0, 2)), 0);
  assert.ok(polygonAreaMeters2(square) > 120 && polygonAreaMeters2(square) < 126);
});

test("property map quantities format in feet or metric and count markers", () => {
  const length = { type: "line", points: [{ lng: 0, lat: 0 }, { lng: 0.001, lat: 0 }] };
  assert.match(formatPropertyMeasurement(length), /LF$/);
  assert.match(formatPropertyMeasurement(length, "metric"), /m$/);
  assert.equal(formatPropertyMeasurement({ type: "count", points: [{ lng: 0, lat: 0 }] }), "1 EA");
});
