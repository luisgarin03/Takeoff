import { flattenCurve } from "./curve.js";

// Independent chain-link post layout engine. Fence records reference an
// existing linear takeoff by id; they never alter the measurement shape or its
// quantity. Shared Polyline junction anchors persist; post types and spacing
// derive from connected source geometry.

export const DEFAULT_CHAIN_LINK_SPACING_FT = 10;
export const MIN_CHAIN_LINK_SPACING_FT = 0.25;
const EPS = 1e-6;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = (value) => Math.max(0, Math.min(1, finite(value)));

function cornerAngle(a, b, c) {
  const product = Math.hypot(a[0] - b[0], a[1] - b[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
  if (product <= EPS) return null;
  const dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
  return Math.acos(Math.max(-1, Math.min(1, dot / product))) * 180 / Math.PI;
}

export function sanitizeChainLinkFence(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const shapeId = typeof record.shape_id === "string" ? record.shape_id : "";
  const sheetId = typeof record.sheet_id === "string" ? record.sheet_id : "";
  if (!shapeId || !sheetId) return null;
  const markers = [];
  const seen = [];
  for (const marker of Array.isArray(record.markers) ? record.markers : []) {
    if (!marker || typeof marker !== "object") continue;
    const pathT = clamp01(marker.path_t);
    if (pathT <= EPS || pathT >= 1 - EPS || seen.some((t) => Math.abs(t - pathT) < EPS)) continue;
    seen.push(pathT);
    markers.push({
      id: typeof marker.id === "string" && marker.id ? marker.id : `post-${crypto.randomUUID()}`,
      path_t: pathT,
    });
  }
  markers.sort((a, b) => a.path_t - b.path_t);
  const sharedPosts = {};
  if (record.shared_posts && typeof record.shared_posts === "object" && !Array.isArray(record.shared_posts)) {
    for (const [postId, sharedId] of Object.entries(record.shared_posts)) {
      if (typeof postId === "string" && postId && typeof sharedId === "string" && sharedId) sharedPosts[postId] = sharedId;
    }
  }
  return {
    id: typeof record.id === "string" && record.id ? record.id : `fence-${crypto.randomUUID()}`,
    shape_id: shapeId,
    sheet_id: sheetId,
    condition_id: typeof record.condition_id === "string" ? record.condition_id : "",
    closed: !!record.closed,
    markers,
    shared_posts: sharedPosts,
  };
}

export function sanitizeChainLinkFences(value, shapes = []) {
  const byShape = new Map((shapes || []).map((shape) => [shape.id, shape]));
  const seenShapes = new Set();
  const out = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const fence = sanitizeChainLinkFence(raw);
    const shape = fence && byShape.get(fence.shape_id);
    if (!fence || !shape || shape.measure_role !== "linear" || seenShapes.has(fence.shape_id)) continue;
    seenShapes.add(fence.shape_id);
    out.push({ ...fence, sheet_id: shape.sheet_id, condition_id: shape.condition_id });
  }
  return out;
}

// Keep saved junction anchors, which connect Polyline branches, while dropping
// independent manual-post markers and legacy post-type overrides.
export function removeManualChainLinkPostData(value, shapes) {
  const records = Array.isArray(shapes)
    ? sanitizeChainLinkFences(value, shapes)
    : (Array.isArray(value) ? value.map(sanitizeChainLinkFence).filter(Boolean) : []);
  return records.map((fence) => {
    const markers = fence.markers.filter((marker) => fence.shared_posts[marker.id])
      .map(({ id, path_t }) => ({ id, path_t }));
    const postIds = new Set([
      ...(fence.closed ? [`${fence.id}-loop`] : [`${fence.id}-start`, `${fence.id}-end`]),
      ...markers.map((marker) => marker.id),
    ]);
    const shared_posts = Object.fromEntries(Object.entries(fence.shared_posts).filter(([postId]) => postIds.has(postId)));
    return { ...fence, markers, shared_posts };
  });
}

export function createChainLinkFence(shape, idFactory = () => `fence-${crypto.randomUUID()}`) {
  if (!shape || shape.measure_role !== "linear") return null;
  return sanitizeChainLinkFence({
    id: idFactory(), shape_id: shape.id, sheet_id: shape.sheet_id,
    condition_id: shape.condition_id,
    closed: false, markers: [], shared_posts: {},
  });
}

export function pathMetrics(points, closed = false) {
  const pts = Array.isArray(points) ? points.filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
  if (pts.length < 2) return { points: pts, segments: [], total: 0 };
  const path = closed && (Math.abs(pts[0][0] - pts[pts.length - 1][0]) > EPS || Math.abs(pts[0][1] - pts[pts.length - 1][1]) > EPS)
    ? [...pts, pts[0]] : pts;
  const segments = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length <= EPS) continue;
    segments.push({ a, b, start: total, length });
    total += length;
  }
  return { points: path, segments, total };
}

export function pointAtPathT(metrics, pathT) {
  if (!metrics?.segments?.length || metrics.total <= EPS) return metrics?.points?.[0] || [0, 0];
  const distance = clamp01(pathT) * metrics.total;
  const segment = metrics.segments.find((item) => distance <= item.start + item.length + EPS) || metrics.segments[metrics.segments.length - 1];
  const local = Math.max(0, Math.min(1, (distance - segment.start) / segment.length));
  return [segment.a[0] + (segment.b[0] - segment.a[0]) * local, segment.a[1] + (segment.b[1] - segment.a[1]) * local];
}

export function projectPointToPath(metrics, point) {
  if (!metrics?.segments?.length || metrics.total <= EPS) return null;
  let best = null;
  for (const segment of metrics.segments) {
    const dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1];
    const u = Math.max(0, Math.min(1, ((point[0] - segment.a[0]) * dx + (point[1] - segment.a[1]) * dy) / (segment.length * segment.length)));
    const x = segment.a[0] + dx * u, y = segment.a[1] + dy * u;
    const distance = Math.hypot(point[0] - x, point[1] - y);
    if (!best || distance < best.distance) best = { point: [x, y], distance, path_t: (segment.start + segment.length * u) / metrics.total };
  }
  return best;
}

function unitDirection(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length > EPS ? [dx / length, dy / length] : null;
}

function directionsAtPath(metrics, pathT, closed = false) {
  if (!metrics?.segments?.length || metrics.total <= EPS) return [];
  let distance = clamp01(pathT) * metrics.total;
  if (closed && distance >= metrics.total - EPS) distance = 0;
  const arms = [];
  for (const segment of metrics.segments) {
    const end = segment.start + segment.length;
    if (distance > segment.start + EPS && distance < end - EPS) {
      return [unitDirection(segment.a, segment.b), unitDirection(segment.b, segment.a)].filter(Boolean);
    }
    if (Math.abs(distance - segment.start) <= EPS) arms.push(unitDirection(segment.a, segment.b));
    if (Math.abs(distance - end) <= EPS) arms.push(unitDirection(segment.b, segment.a));
  }
  if (closed && distance <= EPS) {
    const last = metrics.segments.at(-1);
    arms.push(unitDirection(last.b, last.a));
  }
  return arms.filter(Boolean);
}

function automaticPostType(arms, fallbackDirections = arms.length) {
  const count = Math.max(0, Number(fallbackDirections) || 0);
  if (count <= 1) return "terminal";
  if (count === 2) {
    const [a, b] = arms;
    return a && b && a[0] * b[0] + a[1] * b[1] <= -0.999 ? "line" : "corner";
  }
  if (count === 3) return "threeway";
  if (count === 4) return "fourway";
  return "multiway";
}

export function classifyChainLinkPathPost(metrics, pathT, closed = false) {
  const arms = directionsAtPath(metrics, pathT, closed);
  const directions = arms.length || (closed ? 2 : pathT <= EPS || pathT >= 1 - EPS ? 1 : 2);
  return { arms, directions, type: automaticPostType(arms, directions) };
}

// Extrusion records the shared Polyline node as a fence marker. Older saved
// records can have that marker a few raster pixels away from the actual
// vertex, which made the automatic corner and shared junction render as two
// posts. Snap only connected markers to nearby path vertices; free-standing
// markers remain at their intentionally placed stations.
function alignSharedMarkersToVertices(fence, metrics, tolerancePx = 2) {
  if (!fence?.markers?.length || !metrics?.segments?.length || metrics.total <= EPS) return fence;
  const vertices = [];
  let station = 0;
  vertices.push({ path_t: 0, station });
  for (const segment of metrics.segments) {
    station += segment.length;
    vertices.push({ path_t: station / metrics.total, station });
  }
  const markers = fence.markers.map((marker) => {
    if (!fence.shared_posts?.[marker.id]) return marker;
    const markerStation = marker.path_t * metrics.total;
    let nearest = null;
    for (const vertex of vertices) {
      if (vertex.station <= EPS || vertex.station >= metrics.total - EPS) continue;
      const gap = Math.abs(vertex.station - markerStation);
      if (!nearest || gap < nearest.gap) nearest = { ...vertex, gap };
    }
    return nearest && nearest.gap <= tolerancePx
      ? { ...marker, path_t: nearest.path_t }
      : marker;
  });
  return markers.every((marker, index) => marker === fence.markers[index])
    ? fence
    : { ...fence, markers };
}

export function snapChainLinkPathPosition(metrics, point, tolerance) {
  const projected = projectPointToPath(metrics, point);
  if (!projected) return null;
  let bestVertex = null;
  let travelled = 0;
  const vertices = metrics.segments.map((segment) => {
    const vertex = { point: segment.a, path_t: travelled / metrics.total };
    travelled += segment.length;
    return vertex;
  });
  const last = metrics.segments.at(-1);
  if (last) vertices.push({ point: last.b, path_t: 1 });
  for (const vertex of vertices) {
    const distance = Math.hypot(point[0] - vertex.point[0], point[1] - vertex.point[1]);
    if (distance <= tolerance && (!bestVertex || distance < bestVertex.distance)) bestVertex = { ...vertex, distance };
  }
  return bestVertex || projected;
}

function openStops(fence) {
  return [
    { id: `${fence.id}-start`, path_t: 0, type: "terminal", endpoint: true },
    ...fence.markers,
    { id: `${fence.id}-end`, path_t: 1, type: "terminal", endpoint: true },
  ].sort((a, b) => a.path_t - b.path_t);
}

function closedStops(fence) {
  return [
    { id: `${fence.id}-loop`, path_t: 0, type: "terminal", endpoint: true },
    ...fence.markers,
  ].sort((a, b) => a.path_t - b.path_t);
}

export function calculateChainLinkFence(fence, points, unitsPerPx, curved = false, spacingFt = DEFAULT_CHAIN_LINK_SPACING_FT, strategy = "even") {
  let clean = sanitizeChainLinkFence(fence);
  const upp = finite(unitsPerPx);
  const metrics = pathMetrics(points, clean?.closed);
  if (!clean || metrics.total <= EPS || upp <= 0) return { valid: false, metrics, corners: [], linePosts: [], sections: [], totalLengthFt: 0, cornerPostCount: 0, linePostCount: 0, totalPostCount: 0 };
  clean = alignSharedMarkersToVertices(clean, metrics);
  const stops = clean.closed ? closedStops(clean) : openStops(clean);
  if (!curved) {
    let walked = 0;
    for (let index = 1; index < metrics.points.length - 1; index++) {
      walked += metrics.segments[index - 1]?.length || 0;
      const angle = cornerAngle(metrics.points[index - 1], metrics.points[index], metrics.points[index + 1]);
      if (angle == null || angle >= 179.999) continue;
      const pathT = walked / metrics.total;
      if (stops.some((stop) => Math.abs(stop.path_t - pathT) <= EPS)) continue;
      stops.push({ id: `${clean.id}-corner-${index}`, path_t: pathT, type: "corner", automatic: true });
    }
  }
  stops.sort((a, b) => a.path_t - b.path_t);
  const sections = [];
  const linePosts = [];
  const pairs = clean.closed
    ? stops.map((start, index) => [start, stops[(index + 1) % stops.length], index === stops.length - 1])
    : stops.slice(0, -1).map((start, index) => [start, stops[index + 1], false]);
  for (let index = 0; index < pairs.length; index++) {
    const [start, end, wraps] = pairs[index];
    const fraction = wraps ? (1 - start.path_t) + end.path_t : end.path_t - start.path_t;
    const lengthFt = Math.max(0, fraction * metrics.total * upp);
    const maxSpacing = Math.max(MIN_CHAIN_LINK_SPACING_FT, finite(spacingFt, DEFAULT_CHAIN_LINK_SPACING_FT));
    const spans = Math.max(1, Math.ceil(lengthFt / maxSpacing));
    const intermediate = Math.max(0, spans - 1);
    const actualSpacingFt = strategy === "maximum" ? Math.min(maxSpacing, lengthFt) : spans ? lengthFt / spans : 0;
    const section = { id: `${clean.id}-section-${index + 1}`, index, start, end, wraps, lengthFt, spans, intermediate, actualSpacingFt };
    sections.push(section);
    for (let n = 1; n < spans; n++) {
      const offset = strategy === "maximum" ? Math.min(lengthFt, maxSpacing * n) / lengthFt : n / spans;
      let pathT = start.path_t + fraction * offset;
      if (pathT >= 1) pathT -= 1;
      linePosts.push({ id: `${section.id}-post-${n}`, sectionIndex: index, path_t: pathT, point: pointAtPathT(metrics, pathT) });
    }
  }
  const corners = stops.map((marker) => {
    const classification = classifyChainLinkPathPost(metrics, marker.path_t, clean.closed);
    return { ...marker, ...classification, shared_post_id: clean.shared_posts[marker.id] || "", point: pointAtPathT(metrics, marker.path_t) };
  });
  const automaticLinePostCount = sections.reduce((sum, section) => sum + section.intermediate, 0);
  const junctionLinePostCount = corners.filter((post) => post.type === "line").length;
  const linePostCount = automaticLinePostCount + junctionLinePostCount;
  const terminalPostCount = corners.filter((post) => post.type === "terminal").length;
  const cornerPostCount = corners.filter((post) => post.type === "corner").length;
  const threeWayPostCount = corners.filter((post) => post.type === "threeway").length;
  const fourWayPostCount = corners.filter((post) => post.type === "fourway").length;
  const multiWayPostCount = corners.filter((post) => post.type === "multiway").length;
  return {
    valid: true, metrics, corners, linePosts, sections,
    totalLengthFt: metrics.total * upp,
    terminalPostCount, actualCornerPostCount: cornerPostCount, cornerPostCount: corners.length, threeWayPostCount, fourWayPostCount, multiWayPostCount,
    automaticLinePostCount, junctionLinePostCount,
    linePostCount,
    totalPostCount: terminalPostCount + cornerPostCount + threeWayPostCount + fourWayPostCount + multiWayPostCount + linePostCount,
  };
}

const localPostIds = (fence) => fence.closed
  ? [`${fence.id}-loop`, ...(fence.markers || []).map((marker) => marker.id)]
  : [`${fence.id}-start`, ...(fence.markers || []).map((marker) => marker.id), `${fence.id}-end`];

export function summarizeChainLinkFencePosts(entries = []) {
  const groups = new Map();
  let linePostCount = 0;
  for (const { fence, calculation } of entries) {
    if (!fence || !calculation?.valid) continue;
    linePostCount += calculation.automaticLinePostCount ?? calculation.linePostCount;
    for (const post of calculation.corners) {
      const key = fence.shared_posts?.[post.id] || `${fence.id}:${post.id}`;
      const group = groups.get(key) || { arms: [], directions: 0, references: [] };
      group.directions += post.directions;
      group.arms.push(...(post.arms || []));
      group.references.push({ fenceId: fence.id, postId: post.id });
      groups.set(key, group);
    }
  }
  const byFence = {};
  let terminalPostCount = 0, cornerPostCount = 0, threeWayPostCount = 0, fourWayPostCount = 0, multiWayPostCount = 0;
  const typesByPost = {};
  for (const group of groups.values()) {
    const type = automaticPostType(group.arms, group.directions);
    if (type === "terminal") terminalPostCount += 1;
    else if (type === "corner") cornerPostCount += 1;
    else if (type === "threeway") threeWayPostCount += 1;
    else if (type === "fourway") fourWayPostCount += 1;
    else if (type === "multiway") multiWayPostCount += 1;
    else linePostCount += 1;
    for (const reference of group.references) {
      typesByPost[`${reference.fenceId}:${reference.postId}`] = type;
      const local = byFence[reference.fenceId] || { terminalPostCount: 0, cornerPostCount: 0, threeWayPostCount: 0, fourWayPostCount: 0, multiWayPostCount: 0, linePostCount: 0, totalPostCount: 0 };
      if (type === "terminal") local.terminalPostCount += 1;
      else if (type === "corner") local.cornerPostCount += 1;
      else if (type === "threeway") local.threeWayPostCount += 1;
      else if (type === "fourway") local.fourWayPostCount += 1;
      else if (type === "multiway") local.multiWayPostCount += 1;
      else local.linePostCount += 1;
      byFence[reference.fenceId] = local;
    }
  }
  for (const { fence, calculation } of entries) {
    if (!fence || !calculation?.valid) continue;
    const local = byFence[fence.id] || { terminalPostCount: 0, cornerPostCount: 0, threeWayPostCount: 0, fourWayPostCount: 0, multiWayPostCount: 0, linePostCount: 0 };
    local.linePostCount += calculation.automaticLinePostCount ?? calculation.linePostCount;
    local.totalPostCount = local.terminalPostCount + local.cornerPostCount + local.threeWayPostCount + local.fourWayPostCount + local.multiWayPostCount + local.linePostCount;
    byFence[fence.id] = local;
  }
  return { terminalPostCount, cornerPostCount, threeWayPostCount, fourWayPostCount, multiWayPostCount, linePostCount, totalPostCount: terminalPostCount + cornerPostCount + threeWayPostCount + fourWayPostCount + multiWayPostCount + linePostCount, typesByPost, byFence };
}

// Report/export companion for sheets that are not currently rendered. Marker
// locations are path fractions, so counts need only the source shape's already
// calibrated LF; no bitmap dimensions or PDF page load is required.
export function calculateChainLinkFenceFromLength(fence, totalLengthFt, spacingFt = null, strategy = "even") {
  const clean = sanitizeChainLinkFence(fence);
  const total = Math.max(0, finite(totalLengthFt));
  if (!clean || total <= 0) return { valid: false, sections: [], totalLengthFt: 0, cornerPostCount: 0, linePostCount: 0, totalPostCount: 0 };
  // Kept for old report integrations and saved data readers; active fence
  // configuration no longer reads this legacy value and comes from 3D settings.
  const configuredSpacing = spacingFt == null ? fence?.max_spacing_ft : spacingFt;
  const maxSpacingFt = Math.max(MIN_CHAIN_LINK_SPACING_FT,
    finite(configuredSpacing, DEFAULT_CHAIN_LINK_SPACING_FT));
  const stops = clean.closed ? closedStops(clean) : openStops(clean);
  const pairs = clean.closed
    ? stops.map((start, index) => [start, stops[(index + 1) % stops.length], index === stops.length - 1])
    : stops.slice(0, -1).map((start, index) => [start, stops[index + 1], false]);
  const sections = pairs.map(([start, end, wraps], index) => {
    const fraction = wraps ? (1 - start.path_t) + end.path_t : end.path_t - start.path_t;
    const lengthFt = total * fraction;
    const spans = Math.max(1, Math.ceil(lengthFt / maxSpacingFt));
    const actualSpacingFt = strategy === "maximum" ? Math.min(maxSpacingFt, lengthFt) : lengthFt / spans;
    return { id: `${clean.id}-section-${index + 1}`, index, start, end, wraps, lengthFt, spans, intermediate: Math.max(0, spans - 1), actualSpacingFt };
  });
  const linePostCount = sections.reduce((sum, section) => sum + section.intermediate, 0);
  const terminalPostCount = clean.closed ? 0 : 2;
  const cornerPostCount = stops.length - terminalPostCount;
  return { valid: true, sections, totalLengthFt: total, terminalPostCount, actualCornerPostCount: cornerPostCount, cornerPostCount: stops.length, threeWayPostCount: 0, linePostCount, totalPostCount: stops.length + linePostCount };
}

export function insertFenceMarker(fence, pathT, idFactory = () => `post-${crypto.randomUUID()}`, minimumFraction = 0.002) {
  const clean = sanitizeChainLinkFence(fence);
  if (!clean) return fence;
  const t = clamp01(pathT);
  if ((!clean.closed && (t <= minimumFraction || t >= 1 - minimumFraction)) || clean.markers.some((marker) => Math.abs(marker.path_t - t) < minimumFraction)) return clean;
  return { ...clean, markers: [...clean.markers, { id: idFactory(), path_t: t }].sort((a, b) => a.path_t - b.path_t) };
}

export function connectChainLinkBranch(fence, branch, { pathT, postId, nodeId }, createPostId, createJunctionId) {
  let source = fence;
  // A later extrusion from an already connected Polyline vertex should reuse
  // its existing junction marker, upgrading that same post to 3-way/4-way.
  if (!postId && nodeId) {
    const existing = Object.entries(fence.shared_posts || {}).find(([id, sharedId]) =>
      sharedId === nodeId && fence.markers.some((marker) => marker.id === id));
    if (existing) {
      postId = existing[0];
      pathT = fence.markers.find((marker) => marker.id === postId)?.path_t ?? pathT;
    }
  }
  if (!localPostIds(fence).includes(postId)) {
    if (!fence.closed && pathT <= EPS) postId = `${fence.id}-start`;
    else if (!fence.closed && pathT >= 1 - EPS) postId = `${fence.id}-end`;
    else if (fence.closed && (pathT <= EPS || pathT >= 1 - EPS)) postId = `${fence.id}-loop`;
    else {
      const existing = fence.markers.find((marker) => Math.abs(marker.path_t - pathT) <= EPS);
      postId = existing?.id || createPostId();
      if (!existing) {
        source = insertFenceMarker(fence, pathT, () => postId, EPS);
      }
    }
  }
  if (!localPostIds(source).includes(postId)) return null;
  const sharedId = source.shared_posts[postId] || createJunctionId();
  return [
    { ...source, shared_posts: { ...source.shared_posts, [postId]: sharedId } },
    { ...branch, shared_posts: { ...branch.shared_posts, [`${branch.id}-start`]: sharedId } },
  ];
}

function junctionPath(points, curved, closed) {
  const controlIndices = [];
  const path = curved ? flattenCurve(points, { controlIndices }) : points.slice();
  if (!curved) points.forEach((_, index) => controlIndices.push(index));
  if (closed && Math.hypot(path[0][0] - path.at(-1)[0], path[0][1] - path.at(-1)[1]) > EPS) path.push(path[0]);
  const distances = [0];
  for (let index = 1; index < path.length; index++) {
    distances.push(distances.at(-1) + Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]));
  }
  return { controlDistances: controlIndices.map((index) => distances[index]), total: distances.at(-1), metrics: pathMetrics(path) };
}

// Saved fences locate their stops by distance along the run. Materialize the
// shared stops as control points for this gesture so moving one can't slide the
// other junctions along the line as the measured length changes.
export function prepareChainLinkJunction(fence, points, curved = false) {
  if (points.length < 2) return null;
  const path = junctionPath(points, curved, fence.closed);
  if (path.total <= EPS) return null;
  const controls = points.map((point, index) => ({ point, distance: path.controlDistances[index] }));
  const stops = (fence.closed ? closedStops(fence) : openStops(fence)).filter((stop) => fence.shared_posts[stop.id]);
  const bindings = stops.map((stop) => {
    const distance = stop.path_t * path.total;
    let control = controls.find((item) => Math.abs(item.distance - distance) <= EPS);
    if (!control) {
      control = { distance, point: pointAtPathT(path.metrics, stop.path_t) };
      controls.push(control);
    }
    return { stop, control };
  });
  controls.sort((a, b) => a.distance - b.distance);
  // If a junction lies on the implicit closing edge, make that edge part of
  // the edited path. A repeated closing point moves with the opening point.
  if (fence.closed && controls.at(-1).distance > path.controlDistances.at(-1)) {
    controls.push({ point: points[0], distance: path.total });
  }
  const vertices = controls.map(({ point }) => point);
  const closedAtStart = Math.hypot(vertices[0][0] - vertices.at(-1)[0], vertices[0][1] - vertices.at(-1)[1]) <= EPS;
  return { vertices, curved, fence, closedAtStart, bindings: bindings.map(({ stop, control }) => ({
    postId: stop.id, index: controls.indexOf(control), junctionId: fence.shared_posts[stop.id],
  })) };
}

export function moveChainLinkJunction(run, junctionId, point) {
  const indices = new Set(run.bindings.filter((binding) => binding.junctionId === junctionId).map((binding) => binding.index));
  if (run.closedAtStart && indices.has(0)) indices.add(run.vertices.length - 1);
  const points = run.vertices.map((vertex, index) => indices.has(index) ? point : vertex);
  // Avoid collapsing a junction onto a neighboring control point, which could
  // otherwise turn two posts into the same stop or drop an interior stop.
  for (const index of indices) {
    for (const neighbor of [index - 1, index + 1]) {
      if (points[neighbor] && Math.hypot(point[0] - points[neighbor][0], point[1] - points[neighbor][1]) <= EPS) return null;
    }
  }
  const { controlDistances, total } = junctionPath(points, run.curved, run.fence.closed);
  if (total <= EPS) return null;
  const fractions = new Map(run.bindings.map(({ postId, index }) => [postId, controlDistances[index] / total]));
  const markers = run.fence.markers.map((marker) => fractions.has(marker.id) ? { ...marker, path_t: fractions.get(marker.id) } : marker);
  if (markers.some((marker, index) =>
    marker.path_t <= EPS || marker.path_t >= 1 - EPS
    || markers.slice(0, index).some((other) => Math.abs(other.path_t - marker.path_t) <= EPS))) return null;
  return { points, fence: { ...run.fence, markers: markers.sort((a, b) => a.path_t - b.path_t) } };
}

export function removeFenceMarker(fence, markerId) {
  const clean = sanitizeChainLinkFence(fence);
  return clean ? { ...clean, markers: clean.markers.filter((marker) => marker.id !== markerId) } : fence;
}
