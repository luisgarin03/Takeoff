import { METERS_PER_FOOT as FT } from "./settings.js";

const EPS = 1e-7;
const planarDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pointKey(run, index) {
  return `${run.conditionScopeId || run.conditionId || "unassigned"}:${run.pointIds?.[index] || `${run.id}:point:${index}`}`;
}

function otherEnd(edge, key) { return edge.aKey === key ? edge.bKey : edge.aKey; }

function normalized(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const size = Math.hypot(dx, dz);
  return size > EPS ? [dx / size, dz / size] : [1, 0];
}

function traceRoute(startKey, firstEdge, adjacency, visited) {
  const keys = [startKey];
  const edges = [];
  let current = startKey;
  let edge = firstEdge;
  let closed = false;
  while (edge && !visited.has(edge.id)) {
    visited.add(edge.id);
    edges.push(edge);
    current = otherEnd(edge, current);
    keys.push(current);
    if (current === startKey) { closed = true; break; }
    const connected = adjacency.get(current) || [];
    if (connected.length !== 2) break;
    edge = connected.find((candidate) => !visited.has(candidate.id));
  }
  return { keys, edges, closed, startDegree: adjacency.get(keys[0])?.length || 0,
    endDegree: adjacency.get(keys.at(-1))?.length || 0 };
}

function routeAtDistance(route, target) {
  const { points, segmentLengths, cumulative } = route;
  const total = cumulative.at(-1) || 0;
  const distance = Math.max(0, Math.min(total, target));
  let index = segmentLengths.findIndex((length, segment) => distance <= cumulative[segment + 1] + EPS && length > EPS);
  if (index < 0) index = segmentLengths.length - 1;
  const length = segmentLengths[index] || 1;
  const start = cumulative[index] || 0;
  const t = Math.max(0, Math.min(1, (distance - start) / length));
  const a = points[index], b = points[index + 1];
  const point = [a.point[0] + (b.point[0] - a.point[0]) * t,
    a.elevationM + (b.elevationM - a.elevationM) * t,
    a.point[1] + (b.point[1] - a.point[1]) * t];
  let tangent = normalized(a.point, b.point);
  if (t <= EPS && index > 0) {
    const before = normalized(points[index - 1].point, a.point);
    const after = tangent;
    const x = before[0] + after[0], z = before[1] + after[1];
    if (Math.hypot(x, z) > EPS) tangent = [x / Math.hypot(x, z), z / Math.hypot(x, z)];
  } else if (t >= 1 - EPS && index + 2 < points.length) {
    const before = tangent;
    const after = normalized(b.point, points[index + 2].point);
    const x = before[0] + after[0], z = before[1] + after[1];
    if (Math.hypot(x, z) > EPS) tangent = [x / Math.hypot(x, z), z / Math.hypot(x, z)];
  }
  return { point, tangent };
}

function prepareRoute(trail, nodes, index) {
  const points = trail.keys.map((key) => nodes.get(key));
  const segmentLengths = points.slice(1).map((point, pointIndex) => planarDistance(points[pointIndex].point, point.point));
  const cumulative = [0];
  for (const length of segmentLengths) cumulative.push(cumulative.at(-1) + length);
  const length = cumulative.at(-1) || 0;
  const conditionScopeId = trail.edges[0].conditionScopeId;
  const spec = trail.edges[0].spec || { foundationDiameterIn: 18, foundationDepthFt: 3 };
  const sourceRunIds = [...new Set(trail.edges.map((edge) => edge.runId))];
  const sourceSegmentIds = trail.edges.map((edge) => edge.sourceSegmentId);
  const signature = trail.edges.map((edge) => edge.id).sort().join("|");
  const id = `guardrail-route:${conditionScopeId || "unassigned"}:${signature}`;
  const interval = 6 * FT;
  const stationValues = [];
  for (let station = 0; station <= length + EPS; station += interval) stationValues.push(Math.min(station, length));
  if (!stationValues.length) stationValues.push(0);
  if (length - stationValues.at(-1) > EPS) stationValues.push(length);
  const supports = stationValues.map((station, stationIndex) => {
    const at = routeAtDistance({ points, segmentLengths, cumulative }, station);
    return { id: `${id}:support:${stationIndex}`, component_id: `fence-component:${id}:support:${stationIndex}`,
      stationFt: station / FT, point: at.point, tangent: at.tangent,
      foundationDiameterIn: spec.foundationDiameterIn, foundationDepthFt: spec.foundationDepthFt };
  });
  const startDegree = trail.startDegree, endDegree = trail.endDegree;
  const terminals = [];
  if (!trail.closed && startDegree === 1) {
    terminals.push({ id: `${id}:terminal:start`, component_id: `fence-component:${id}:terminal:start`,
      point: [...points[0].point, points[0].elevationM], tangent: normalized(points[0].point, points[1].point), end: "start" });
  }
  if (!trail.closed && endDegree === 1) {
    terminals.push({ id: `${id}:terminal:end`, component_id: `fence-component:${id}:terminal:end`,
      point: [...points.at(-1).point, points.at(-1).elevationM], tangent: normalized(points.at(-2).point, points.at(-1).point), end: "end" });
  }
  const middle = routeAtDistance({ points, segmentLengths, cumulative }, length / 2).point;
  return { id, beamId: `${id}:beam`, beamComponentId: `fence-component:${id}:beam`,
    points, segmentLengths, cumulative, length, lengthFt: length / FT, anchor: [middle[0], middle[1] + .66, middle[2]],
    conditionId: trail.edges[0].conditionId, conditionScopeId, conditionName: trail.edges[0].conditionName,
    sourceRunIds, sourceSegmentIds, closed: trail.closed, supports, terminals, spec, index };
}

/** Builds guardrail paths from calibrated source edges, joining shared polyline nodes only. */
export function buildGuardrailLayout({ runs = [], issues = [] } = {}) {
  const nodes = new Map();
  const edges = [];
  const seenSharedEdges = new Set();
  for (const run of runs) {
    if (!Array.isArray(run.points) || run.points.length < 2) continue;
    for (let index = 1; index < run.points.length; index++) {
      const a = run.points[index - 1], b = run.points[index];
      const length = planarDistance(a, b);
      if (!(length > EPS)) continue;
      const aKey = pointKey(run, index - 1), bKey = pointKey(run, index);
      const edgeKey = [aKey, bKey].sort().join("<>");
      // Adjacent source sections may contain the same shared-node edge twice. Count it once.
      if (seenSharedEdges.has(edgeKey)) continue;
      seenSharedEdges.add(edgeKey);
      const elevationM = Number.isFinite(run.elevationM) ? run.elevationM : 0;
      if (!nodes.has(aKey)) nodes.set(aKey, { key: aKey, point: [...a], elevationM });
      if (!nodes.has(bKey)) nodes.set(bKey, { key: bKey, point: [...b], elevationM });
      const edge = { id: `${run.conditionScopeId || "unassigned"}:${run.id}:edge:${index - 1}:${aKey}->${bKey}`,
        aKey, bKey, runId: run.id, sourceSegmentId: run.segments?.[index - 1]?.id || `${run.id}:segment:${index - 1}`,
        conditionId: run.conditionId, conditionScopeId: run.conditionScopeId, conditionName: run.conditionName, spec: run.spec };
      edges.push(edge);
    }
  }

  const adjacency = new Map();
  for (const edge of edges) {
    for (const key of [edge.aKey, edge.bKey]) {
      const connected = adjacency.get(key) || [];
      connected.push(edge);
      adjacency.set(key, connected);
    }
  }
  const visited = new Set();
  const trails = [];
  for (const [key, connected] of adjacency) {
    if (connected.length === 2) continue;
    for (const edge of connected) if (!visited.has(edge.id)) trails.push(traceRoute(key, edge, adjacency, visited));
  }
  for (const [key, connected] of adjacency) {
    const first = connected.find((edge) => !visited.has(edge.id));
    if (first) trails.push(traceRoute(key, first, adjacency, visited));
  }
  const routes = trails.filter((trail) => trail.edges.length).map((trail, index) => prepareRoute(trail, nodes, index));
  const totals = { length: routes.reduce((sum, route) => sum + route.length, 0),
    routes: routes.length, supports: routes.reduce((sum, route) => sum + route.supports.length, 0),
    terminals: routes.reduce((sum, route) => sum + route.terminals.length, 0) };
  return { routes, totals, issues: [...new Set(issues)] };
}
