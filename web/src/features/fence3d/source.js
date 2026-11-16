import { flattenCurve } from "../../lib/curve.js";
import { classifyChainLinkPathPost, pathMetrics, pointAtPathT } from "../../lib/chainLinkFence.js";
import { fenceConditionKey, METERS_PER_FOOT, normalizeFoundationSettings, normalizeOrnamentalSpec, runSpec } from "./settings.js";

const EPS = 1e-7;
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const interpolate = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const finitePositive = (value) => Number.isFinite(value) && value > 0;

// Coordinates are normalized against the already-rotated PDF viewport. This
// adapter has no dependency on screen offsets or on the canvas pan/zoom state.
export function adaptFenceRuns({ shapes, fences, sheetId, calibration, settings, conditionNames = {} }) {
  const issues = [];
  const runs = [];
  const ornamentalRuns = [];
  const guardrailRuns = [];
  const attached = new Map(fences.map((fence) => [fence.shape_id, fence]));
  const center = calibration ? [calibration.width / 2, calibration.height / 2] : [0, 0];
  const nodeOwners = new Map();
  for (const shape of shapes) {
    if (shape.sheet_id !== sheetId || shape.measure_role !== "linear") continue;
    const conditionId = shape.condition_id || `shape:${shape.id}`;
    const ids = new Set(Array.isArray(shape.polyline_node_ids) ? shape.polyline_node_ids.filter(Boolean) : []);
    for (const id of ids) {
      const key = `${conditionId}:${id}`;
      const owners = nodeOwners.get(key) || new Set();
      owners.add(shape.id);
      nodeOwners.set(key, owners);
    }
  }
  for (const shape of shapes) {
    if (shape.sheet_id !== sheetId || shape.measure_role !== "linear") continue;
    const designation = settings.runs?.[shape.id];
    const fence = attached.get(shape.id);
    const conditionId = shape.condition_id || `shape:${shape.id}`;
    const conditionScopeId = fenceConditionKey(sheetId, conditionId);
    const conditionConfig = settings.conditions?.[conditionScopeId];
    const type = conditionConfig?.type ?? designation?.type ?? (fence ? "chain-link" : null);
    if (type !== "chain-link" && type !== "ornamental" && type !== "guardrail") continue;
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
    // A Polyline branch may connect at a straight-through vertex. It is still
    // a real fence junction even though that vertex is not an angled corner.
    // Use the shared node identity (scoped to this sheet condition) so the
    // adjoining runs produce one physical post and one component ID.
    if (!shape.curved && metrics.total > EPS) {
      let station = 0;
      for (let i = 0; i < metrics.points.length; i++) {
        if (i > 0) station += distance(metrics.points[i - 1], metrics.points[i]);
        if (closed && i === metrics.points.length - 1 && pointIds[i] === pointIds[0]) continue;
        const pointId = pointIds[i];
        if (!pointId || (nodeOwners.get(`${conditionId}:${pointId}`)?.size || 0) < 2) continue;
        const t = station / metrics.total;
        const shared = `polyline:${conditionScopeId}:${pointId}`;
        const existing = stops.find((stop) => Math.abs(stop.t * metrics.total - station) <= EPS);
        if (existing) {
          existing.point_id = pointId;
          existing.shared = shared;
          existing.directions = i === 0 || i === metrics.points.length - 1 ? 1 : 2;
        } else {
          stops.push({ t, id: `${shape.id}-node-${i}`, point_id: pointId,
            type: "corner", directions: i === 0 || i === metrics.points.length - 1 ? 1 : 2, shared });
        }
      }
    }
    if (closed) {
      const angle = cornerAngle(metrics.points.at(-2), points[0], points[1]);
      if (angle != null) corners.push({ point: points[0], angle });
    }
    for (const marker of fence?.markers || []) {
      if (marker.path_t > 0 && marker.path_t < 1) {
        const connectedNodeId = fence.shared_posts?.[marker.id];
        if (shape.polyline_group_id && connectedNodeId
          && shape.polyline_node_ids?.includes(connectedNodeId)
          && (nodeOwners.get(`${conditionId}:${connectedNodeId}`)?.size || 0) > 1) {
          // The shared Polyline vertex above is already the single physical
          // post for this junction. Its legacy fence marker is only the saved
          // connection anchor; adding it here can leave a second nearby post
          // when an older marker station drifted slightly from the vertex.
          continue;
        }
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
      const vertexIndex = metrics.points.findIndex((point) => distance(point, stop.point) <= EPS);
      const pointId = stop.point_id || (vertexIndex >= 0 ? pointIds[vertexIndex] : null);
      if (pointId && (nodeOwners.get(`${conditionId}:${pointId}`)?.size || 0) > 1) {
        stop.point_id = pointId;
        stop.shared = `polyline:${conditionScopeId}:${pointId}`;
      } else if (!shape.polyline_group_id) {
        // Legacy Linear runs used shared_posts as their connection record.
        // Resolve those IDs by proximity after all runs are adapted, since a
        // copied old ID can appear on unrelated paths far apart on the sheet.
        stop.legacyShared = fence?.shared_posts?.[stop.id] || "";
      }
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
    const run = {
      id: shape.id, label, points: metrics.points, pointIds, segments, gateSegments, length: metrics.total,
      sourceLength, measured, corners, stops, closed, spec: runSpec(designation, conditionConfig?.type === "chain-link" ? conditionConfig.spec : null),
      gates: designation?.gates || [],
      conditionId, conditionScopeId, conditionName: conditionNames[conditionId] || label, type,
    };
    if (type === "chain-link") runs.push(run);
    else if (type === "ornamental") {
      const ornamentalSegments = metrics.segments.map((segment, index) => {
        const vertexIndex = metrics.points.indexOf(segment.a);
        const nextIndex = (vertexIndex + 1) % pointIds.length;
        return { ...segment, index, startPointId: pointIds[vertexIndex], endPointId: pointIds[nextIndex],
          id: `${shape.id}:ornamental-segment:${pointIds[vertexIndex]}:${pointIds[nextIndex]}:${index}` };
      });
      const straightSections = [];
      for (const segment of ornamentalSegments) {
        const previous = straightSections.at(-1);
        const sharedNode = nodeOwners.get(`${conditionId}:${segment.startPointId}`)?.size > 1;
        const previousAxis = previous && [(previous.b[0] - previous.a[0]) / previous.length, (previous.b[1] - previous.a[1]) / previous.length];
        const nextAxis = [(segment.b[0] - segment.a[0]) / segment.length, (segment.b[1] - segment.a[1]) / segment.length];
        const aligned = previousAxis && previousAxis[0] * nextAxis[0] + previousAxis[1] * nextAxis[1] > .999999;
        if (previous && !sharedNode && aligned && distance(previous.b, segment.a) <= EPS) {
          previous.b = segment.b;
          previous.endPointId = segment.endPointId;
          previous.length += segment.length;
          previous.id += `+${segment.id}`;
        } else straightSections.push({ ...segment, a: [...segment.a], b: [...segment.b] });
      }
      straightSections.forEach((segment, index) => { segment.index = index; });
      ornamentalRuns.push({
        id: shape.id, label, points: metrics.points, pointIds, segments: straightSections,
        gateSegments: shape.curved ? [] : straightSections, length: metrics.total, measured, closed,
        spec: normalizeOrnamentalSpec(conditionConfig?.type === "ornamental" ? conditionConfig.spec : designation?.spec),
        gates: designation?.gates || [], conditionId, conditionScopeId,
        conditionName: conditionNames[conditionId] || label,
      });
    } else {
      const elevationFt = Number.isFinite(shape.elevation_ft) ? shape.elevation_ft
        : Number.isFinite(shape.base_elevation_ft) ? shape.base_elevation_ft : 0;
      guardrailRuns.push({ ...run, elevationM: elevationFt * METERS_PER_FOOT,
        spec: normalizeFoundationSettings(conditionConfig?.type === "guardrail" ? conditionConfig.spec : null, 6, "guardrail") });
    }
  }
  const legacyJunctions = new Map();
  for (const run of runs) for (const stop of run.stops) {
    if (!stop.legacyShared) continue;
    const key = `${run.conditionScopeId}:${stop.legacyShared}`;
    const refs = legacyJunctions.get(key) || [];
    refs.push({ run, stop });
    legacyJunctions.set(key, refs);
  }
  const legacySnapDistance = calibration?.feetPerPixel * METERS_PER_FOOT * 2;
  if (finitePositive(legacySnapDistance)) for (const [key, refs] of legacyJunctions) {
    const clusters = [];
    for (const ref of refs) {
      let cluster = clusters.find((items) => distance(items[0].stop.point, ref.stop.point) <= legacySnapDistance);
      if (!cluster) clusters.push(cluster = []);
      cluster.push(ref);
    }
    clusters.forEach((cluster, index) => {
      if (new Set(cluster.map(({ run }) => run.id)).size < 2) return;
      const shared = `legacy:${key}:${index}`;
      for (const { stop } of cluster) {
        stop.shared = shared;
        delete stop.legacyShared;
      }
    });
  }
  // Gate Count marks are stored as ordinary count shapes so they remain easy
  // to place, select, delete, and persist in the 2D takeoff. Project each mark
  // onto the nearest straight fence edge in the same sheet and condition, then
  // feed that opening through the normal chain-link/ornamental layout paths.
  const gateCounts = shapes.filter((shape) => shape.sheet_id === sheetId
    && shape.measure_role === "count" && ["single", "double", "overhead"].includes(shape.gate_type)
    && Array.isArray(shape.verts_norm?.[0]) && shape.verts_norm[0].slice(0, 2).every(Number.isFinite));
  if (gateCounts.length && calibration && finitePositive(calibration.width) && finitePositive(calibration.height)
    && finitePositive(calibration.feetPerPixel)) {
    const center = [calibration.width / 2, calibration.height / 2];
    const toMeters = ([x, y]) => [(x - center[0]) * calibration.feetPerPixel * METERS_PER_FOOT,
      (y - center[1]) * calibration.feetPerPixel * METERS_PER_FOOT];
    const targetRuns = [...runs, ...ornamentalRuns];
    for (const count of gateCounts) {
      const conditionId = count.condition_id || `shape:${count.id}`;
      const conditionScopeId = fenceConditionKey(sheetId, conditionId);
      const anchor = toMeters([count.verts_norm[0][0] * calibration.width, count.verts_norm[0][1] * calibration.height]);
      const widthFt = Number.isFinite(count.gate_width_ft) ? Math.max(.5, Math.min(100, count.gate_width_ft))
        : count.gate_type === "single" ? 4 : count.gate_type === "double" ? 8 : 12;
      const width = widthFt * METERS_PER_FOOT;
      let nearest = null;
      for (const run of targetRuns) {
        if (run.conditionScopeId !== conditionScopeId) continue;
        for (const [index, segment] of run.gateSegments.entries()) {
          if (segment.length + EPS < width) continue;
          const dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1];
          const t = Math.max(0, Math.min(1, ((anchor[0] - segment.a[0]) * dx + (anchor[1] - segment.a[1]) * dy) / (segment.length * segment.length)));
          const projected = interpolate(segment.a, segment.b, t);
          const gap = distance(anchor, projected);
          const localStart = t * segment.length - width / 2;
          if (localStart < -EPS || localStart + width > segment.length + EPS) continue;
          if (!nearest || gap < nearest.gap) nearest = { run, segment, index, gap, localStart };
        }
      }
      if (!nearest || nearest.gap > 8 * METERS_PER_FOOT) {
        issues.push(`${count.label || "Gate count"}: place the Count mark on a straight Chain-link or Ornamental fence edge with room for its opening.`);
        continue;
      }
      const run = nearest.run;
      const gate = {
        id: `gate-count:${count.id}`, sourceCountId: count.id, type: count.gate_type,
        segment: nearest.index + 1, start: nearest.localStart / METERS_PER_FOOT, width: widthFt,
        height: Number.isFinite(count.gate_height_ft) ? count.gate_height_ft : (run.spec.height_ft || run.spec.height || 6),
        clearance: 2, frame: 1.66, mesh: run.spec.mesh || 2, opening: 0, tail: 4,
        direction: "in", hingeSide: "start", finish: "matching",
      };
      run.gates = [...run.gates, gate];
    }
  }
  return { runs, ornamentalRuns, guardrailRuns, issues };
}

export function cornerAngle(a, b, c) {
  const product = distance(a, b) * distance(b, c);
  if (product <= EPS) return null;
  const dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
  return Math.acos(Math.max(-1, Math.min(1, dot / product))) * 180 / Math.PI;
}
