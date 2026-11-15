import { flattenCurve } from "../../lib/curve.js";
import { classifyChainLinkPathPost, pathMetrics, pointAtPathT } from "../../lib/chainLinkFence.js";
import { METERS_PER_FOOT, runSpec } from "./settings.js";

const EPS = 1e-7;
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const interpolate = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const finitePositive = (value) => Number.isFinite(value) && value > 0;

// Coordinates are normalized against the already-rotated PDF viewport. This
// adapter has no dependency on screen offsets or on the canvas pan/zoom state.
export function adaptFenceRuns({ shapes, fences, ornamental, sheetId, calibration, settings, conditionNames = {} }) {
  const issues = [];
  const runs = [];
  const attached = new Map(fences.map((fence) => [fence.shape_id, fence]));
  const ornamentalIds = new Set(ornamental.map((fence) => fence.shape_id));
  const center = calibration ? [calibration.width / 2, calibration.height / 2] : [0, 0];
  for (const shape of shapes) {
    if (shape.sheet_id !== sheetId || shape.measure_role !== "linear") continue;
    const designation = settings.runs[shape.id];
    const fence = attached.get(shape.id);
    if ((designation?.type ?? (fence ? "chain-link" : ornamentalIds.has(shape.id) ? "ornamental" : null)) !== "chain-link") continue;
    const label = shape.label || conditionNames[shape.condition_id] || shape.id;
    if (!calibration || ![calibration.width, calibration.height, calibration.feetPerPixel].every(finitePositive)) {
      issues.push(`${label} needs a calibrated PDF page.`);
      continue;
    }
    if (!Array.isArray(shape.verts_norm) || shape.verts_norm.length < 2 || shape.verts_norm.some((point) => !Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite))) {
      issues.push(`${label} has an invalid path.`);
      continue;
    }
    const pixels = shape.verts_norm.map(([x, y]) => [x * calibration.width, y * calibration.height]);
    const controls = [];
    const pixelPath = shape.curved ? flattenCurve(pixels, { controlIndices: controls }) : pixels;
    const toMeters = ([x, y]) => [(x - center[0]) * calibration.feetPerPixel * METERS_PER_FOOT, (y - center[1]) * calibration.feetPerPixel * METERS_PER_FOOT];
    const points = pixelPath.map(toMeters);
    const closed = fence?.closed || distance(points[0], points.at(-1)) <= EPS;
    const sourceLength = pathMetrics(points).total;
    if (!(sourceLength > EPS)) {
      issues.push(`${label} has zero measured length.`);
      continue;
    }
    const measured = shape.computed?.perimeter_lf;
    if (!Number.isFinite(measured)) issues.push(`${label} is missing a stored takeoff length.`);
    else if (Math.abs(sourceLength / METERS_PER_FOOT - measured) > Math.max(.011, calibration.toleranceFt || 0)) {
      issues.push(`${label} has a saved length of ${measured.toFixed(2)} ft and a calibrated path of ${(sourceLength / METERS_PER_FOOT).toFixed(2)} ft. Check the sheet scale.`);
    }
    const metrics = pathMetrics(points, closed);
    const stops = [];
    const atStart = closed ? fence?.closed ? "loop" : "start" : "start";
    const pointIds = metrics.points.map((_, index) => {
      if (index < (shape.polyline_node_ids?.length || 0) && shape.polyline_node_ids[index]) return shape.polyline_node_ids[index];
      if (closed && index === metrics.points.length - 1 && distance(metrics.points[index], metrics.points[0]) <= EPS) {
        return shape.polyline_node_ids?.[0] || `${shape.id}:point:0`;
      }
      return `${shape.id}:${shape.curved ? "curve-point" : "point"}:${index}`;
    });
    stops.push({ t: 0, id: fence ? `${fence.id}-${atStart}` : `${shape.id}-${atStart}`,
      point_id: pointIds[0], type: closed ? "corner" : "end", directions: closed ? 2 : 1 });
    if (!closed) stops.push({ t: 1, id: fence ? `${fence.id}-end` : `${shape.id}-end`,
      point_id: pointIds.at(-1), type: "end", directions: 1 });
    else if (!fence?.closed && fence?.shared_posts?.[`${fence.id}-end`]) {
      stops.push({ t: 1, id: `${fence.id}-end`, point_id: pointIds.at(-1), type: "corner", directions: 1 });
    }
    const corners = [];
    let walked = 0;
    for (let i = 1; i < metrics.points.length; i++) {
      const a = metrics.points[i - 1], b = metrics.points[i], c = metrics.points[i + 1];
      walked += distance(a, b);
      if (!c || (shape.curved && !controls.includes(i))) continue;
      const angle = cornerAngle(a, b, c);
      if (angle == null || angle > 179.999) continue;
      corners.push({ point: b, angle });
      if (!shape.curved) stops.push({ t: walked / metrics.total, id: `${fence?.id || shape.id}-corner-${i}`,
        point_id: pointIds[i], type: "corner" });
    }
    if (closed) {
      const angle = cornerAngle(metrics.points.at(-2), points[0], points[1]);
      if (angle != null) corners.push({ point: points[0], angle });
    }
    for (const marker of fence?.markers || []) {
      if (marker.path_t > 0 && marker.path_t < 1) {
        const classification = classifyChainLinkPathPost(metrics, marker.path_t, closed);
        stops.push({
          t: marker.path_t, id: marker.id, directions: classification.directions,
          type: classification.type === "terminal" ? "end"
            : classification.type === "line" ? "line"
              : classification.type === "threeway" || classification.type === "fourway" || classification.type === "multiway" ? "junction" : "corner",
        });
      }
    }
    for (const stop of stops) {
      stop.point = pointAtPathT(metrics, stop.t);
      stop.shared = fence?.shared_posts?.[stop.id];
    }
    const segments = metrics.segments.map((segment, index) => {
      const vertexIndex = metrics.points.indexOf(segment.a);
      const nextIndex = vertexIndex + 1;
      const startPointId = pointIds[vertexIndex];
      const endPointId = pointIds[nextIndex];
      return { ...segment, id: `${shape.id}:segment:${startPointId}:${endPointId}:${index}` };
    });
    const gateSegments = shape.curved ? [] : segments;
    if (closed && metrics.total - sourceLength > EPS) {
      issues.push(`${label} has an explicit closing section of ${((metrics.total - sourceLength) / METERS_PER_FOOT).toFixed(2)} ft. It is separate from the stored takeoff length.`);
    }
    runs.push({
      id: shape.id, label, points: metrics.points, pointIds, segments, gateSegments, length: metrics.total,
      sourceLength, measured, corners, stops, closed, spec: runSpec(designation, fence),
      gates: designation?.gates || [],
    });
  }
  return { runs, issues };
}

export function cornerAngle(a, b, c) {
  const product = distance(a, b) * distance(b, c);
  if (product <= EPS) return null;
  const dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
  return Math.acos(Math.max(-1, Math.min(1, dot / product))) * 180 / Math.PI;
}
