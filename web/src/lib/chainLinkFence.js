// Independent chain-link post layout engine. Fence records reference an
// existing linear takeoff by id; they never alter the measurement shape or its
// quantity. Only manual corner/terminal markers are persisted. Intermediate
// posts and section totals are derived from the current source geometry.

export const DEFAULT_CHAIN_LINK_SPACING_FT = 10;
export const MIN_CHAIN_LINK_SPACING_FT = 0.25;
export const DEFAULT_CHAIN_LINK_MARKER_SIZE = 7;
const EPS = 1e-6;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = (value) => Math.max(0, Math.min(1, finite(value)));
const POST_TYPES = new Set(["terminal", "corner", "threeway"]);

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
      type: POST_TYPES.has(marker.type) ? marker.type : "corner",
      type_override: marker.type_override === true || marker.type === "terminal",
    });
  }
  markers.sort((a, b) => a.path_t - b.path_t);
  const sharedPosts = {};
  if (record.shared_posts && typeof record.shared_posts === "object" && !Array.isArray(record.shared_posts)) {
    for (const [postId, sharedId] of Object.entries(record.shared_posts)) {
      if (typeof postId === "string" && postId && typeof sharedId === "string" && sharedId) sharedPosts[postId] = sharedId;
    }
  }
  const postTypes = {};
  if (record.post_types && typeof record.post_types === "object" && !Array.isArray(record.post_types)) {
    for (const [postId, type] of Object.entries(record.post_types)) if (postId && POST_TYPES.has(type)) postTypes[postId] = type;
  }
  return {
    id: typeof record.id === "string" && record.id ? record.id : `fence-${crypto.randomUUID()}`,
    shape_id: shapeId,
    sheet_id: sheetId,
    condition_id: typeof record.condition_id === "string" ? record.condition_id : "",
    max_spacing_ft: Math.max(MIN_CHAIN_LINK_SPACING_FT, finite(record.max_spacing_ft, DEFAULT_CHAIN_LINK_SPACING_FT)),
    marker_size: Math.max(4, Math.min(16, finite(record.marker_size, DEFAULT_CHAIN_LINK_MARKER_SIZE))),
    show_corner_posts: record.show_corner_posts !== false,
    show_line_posts: record.show_line_posts !== false,
    show_section_lengths: !!record.show_section_lengths,
    show_post_counts: record.show_post_counts !== false,
    closed: !!record.closed,
    markers,
    shared_posts: sharedPosts,
    post_types: postTypes,
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

export function createChainLinkFence(shape, idFactory = () => `fence-${crypto.randomUUID()}`) {
  if (!shape || shape.measure_role !== "linear") return null;
  return sanitizeChainLinkFence({
    id: idFactory(), shape_id: shape.id, sheet_id: shape.sheet_id,
    condition_id: shape.condition_id, max_spacing_ft: DEFAULT_CHAIN_LINK_SPACING_FT,
    marker_size: DEFAULT_CHAIN_LINK_MARKER_SIZE, show_corner_posts: true,
    show_line_posts: true, show_section_lengths: false, show_post_counts: true,
    closed: false, markers: [], shared_posts: {}, post_types: {},
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

export function calculateChainLinkFence(fence, points, unitsPerPx) {
  const clean = sanitizeChainLinkFence(fence);
  const upp = finite(unitsPerPx);
  const metrics = pathMetrics(points, clean?.closed);
  if (!clean || metrics.total <= EPS || upp <= 0) return { valid: false, metrics, corners: [], linePosts: [], sections: [], totalLengthFt: 0, cornerPostCount: 0, linePostCount: 0, totalPostCount: 0 };
  const stops = clean.closed ? closedStops(clean) : openStops(clean);
  const sections = [];
  const linePosts = [];
  const pairs = clean.closed
    ? stops.map((start, index) => [start, stops[(index + 1) % stops.length], index === stops.length - 1])
    : stops.slice(0, -1).map((start, index) => [start, stops[index + 1], false]);
  for (let index = 0; index < pairs.length; index++) {
    const [start, end, wraps] = pairs[index];
    const fraction = wraps ? (1 - start.path_t) + end.path_t : end.path_t - start.path_t;
    const lengthFt = Math.max(0, fraction * metrics.total * upp);
    const spans = Math.max(1, Math.ceil(lengthFt / clean.max_spacing_ft));
    const intermediate = Math.max(0, spans - 1);
    const actualSpacingFt = spans ? lengthFt / spans : 0;
    const section = { id: `${clean.id}-section-${index + 1}`, index, start, end, wraps, lengthFt, spans, intermediate, actualSpacingFt };
    sections.push(section);
    for (let n = 1; n < spans; n++) {
      let pathT = start.path_t + fraction * (n / spans);
      if (pathT >= 1) pathT -= 1;
      linePosts.push({ id: `${section.id}-post-${n}`, sectionIndex: index, path_t: pathT, point: pointAtPathT(metrics, pathT) });
    }
  }
  const corners = stops.map((marker) => {
    const directions = clean.closed ? 2 : marker.endpoint ? 1 : 2;
    const automaticType = directions <= 1 ? "terminal" : directions === 2 ? "corner" : "threeway";
    const override = marker.endpoint ? clean.post_types[marker.id] : marker.type_override ? marker.type : "";
    return { ...marker, directions, type: override || automaticType, type_override: !!override, shared_post_id: clean.shared_posts[marker.id] || "", point: pointAtPathT(metrics, marker.path_t) };
  });
  const linePostCount = sections.reduce((sum, section) => sum + section.intermediate, 0);
  const terminalPostCount = corners.filter((post) => post.type === "terminal").length;
  const cornerPostCount = corners.filter((post) => post.type === "corner").length;
  return {
    valid: true, metrics, corners, linePosts, sections,
    totalLengthFt: metrics.total * upp,
    terminalPostCount, actualCornerPostCount: cornerPostCount, cornerPostCount: corners.length, threeWayPostCount: 0,
    linePostCount,
    totalPostCount: corners.length + linePostCount,
  };
}

const localPostIds = (fence) => fence.closed
  ? [`${fence.id}-loop`, ...(fence.markers || []).map((marker) => marker.id)]
  : [`${fence.id}-start`, ...(fence.markers || []).map((marker) => marker.id), `${fence.id}-end`];

export function mergeChainLinkFencePosts(records, source, target, idFactory = () => `shared-post-${crypto.randomUUID()}`) {
  if (!source?.fenceId || !source?.postId || !target?.fenceId || !target?.postId) return records;
  if (source.fenceId === target.fenceId) return records;
  const sourceFence = records.find((fence) => fence.id === source.fenceId);
  const targetFence = records.find((fence) => fence.id === target.fenceId);
  if (!sourceFence || !targetFence || !localPostIds(sourceFence).includes(source.postId) || !localPostIds(targetFence).includes(target.postId)) return records;
  const groupA = sourceFence.shared_posts?.[source.postId] || "";
  const groupB = targetFence.shared_posts?.[target.postId] || "";
  const sharedId = groupA || groupB || idFactory();
  const absorbed = new Set([groupA, groupB].filter(Boolean));
  return records.map((fence) => {
    const sharedPosts = Object.fromEntries(Object.entries(fence.shared_posts || {}).map(([postId, groupId]) => [postId, absorbed.has(groupId) ? sharedId : groupId]));
    if (fence.id === source.fenceId) sharedPosts[source.postId] = sharedId;
    if (fence.id === target.fenceId) sharedPosts[target.postId] = sharedId;
    return { ...fence, shared_posts: sharedPosts };
  });
}

export function summarizeChainLinkFencePosts(entries = []) {
  const groups = new Map();
  let linePostCount = 0;
  for (const { fence, calculation } of entries) {
    if (!fence || !calculation?.valid) continue;
    linePostCount += calculation.linePostCount;
    for (const post of calculation.corners) {
      const key = fence.shared_posts?.[post.id] || `${fence.id}:${post.id}`;
      const group = groups.get(key) || { directions: 0, references: [], overrideType: "" };
      group.directions += post.directions;
      if (post.type_override) group.overrideType = post.type;
      group.references.push({ fenceId: fence.id, postId: post.id });
      groups.set(key, group);
    }
  }
  const byFence = {};
  let terminalPostCount = 0, cornerPostCount = 0, threeWayPostCount = 0, multiWayPostCount = 0;
  const typesByPost = {};
  for (const group of groups.values()) {
    const type = group.overrideType || (group.directions <= 1 ? "terminal" : group.directions === 2 ? "corner" : group.directions === 3 ? "threeway" : "multiway");
    if (type === "terminal") terminalPostCount += 1;
    else if (type === "corner") cornerPostCount += 1;
    else if (type === "threeway") threeWayPostCount += 1;
    else multiWayPostCount += 1;
    for (const reference of group.references) {
      typesByPost[`${reference.fenceId}:${reference.postId}`] = type;
      const local = byFence[reference.fenceId] || { terminalPostCount: 0, cornerPostCount: 0, threeWayPostCount: 0, multiWayPostCount: 0, linePostCount: 0, totalPostCount: 0 };
      if (type === "terminal") local.terminalPostCount += 1;
      else if (type === "corner") local.cornerPostCount += 1;
      else if (type === "threeway") local.threeWayPostCount += 1;
      else local.multiWayPostCount += 1;
      byFence[reference.fenceId] = local;
    }
  }
  for (const { fence, calculation } of entries) {
    if (!fence || !calculation?.valid) continue;
    const local = byFence[fence.id] || { terminalPostCount: 0, cornerPostCount: 0, threeWayPostCount: 0, multiWayPostCount: 0 };
    local.linePostCount = calculation.linePostCount;
    local.totalPostCount = local.terminalPostCount + local.cornerPostCount + local.threeWayPostCount + local.multiWayPostCount + local.linePostCount;
    byFence[fence.id] = local;
  }
  return { terminalPostCount, cornerPostCount, threeWayPostCount, multiWayPostCount, linePostCount, totalPostCount: terminalPostCount + cornerPostCount + threeWayPostCount + multiWayPostCount + linePostCount, sharedPostCount: [...groups.values()].filter((group) => group.references.length > 1).length, typesByPost, byFence };
}

// Report/export companion for sheets that are not currently rendered. Marker
// locations are path fractions, so counts need only the source shape's already
// calibrated LF; no bitmap dimensions or PDF page load is required.
export function calculateChainLinkFenceFromLength(fence, totalLengthFt) {
  const clean = sanitizeChainLinkFence(fence);
  const total = Math.max(0, finite(totalLengthFt));
  if (!clean || total <= 0) return { valid: false, sections: [], totalLengthFt: 0, cornerPostCount: 0, linePostCount: 0, totalPostCount: 0 };
  const stops = clean.closed ? closedStops(clean) : openStops(clean);
  const pairs = clean.closed
    ? stops.map((start, index) => [start, stops[(index + 1) % stops.length], index === stops.length - 1])
    : stops.slice(0, -1).map((start, index) => [start, stops[index + 1], false]);
  const sections = pairs.map(([start, end, wraps], index) => {
    const fraction = wraps ? (1 - start.path_t) + end.path_t : end.path_t - start.path_t;
    const lengthFt = total * fraction;
    const spans = Math.max(1, Math.ceil(lengthFt / clean.max_spacing_ft));
    return { id: `${clean.id}-section-${index + 1}`, index, start, end, wraps, lengthFt, spans, intermediate: Math.max(0, spans - 1), actualSpacingFt: lengthFt / spans };
  });
  const linePostCount = sections.reduce((sum, section) => sum + section.intermediate, 0);
  const terminalPostCount = clean.closed ? 0 : 2;
  const cornerPostCount = stops.length - terminalPostCount;
  return { valid: true, sections, totalLengthFt: total, terminalPostCount, actualCornerPostCount: cornerPostCount, cornerPostCount: stops.length, threeWayPostCount: 0, linePostCount, totalPostCount: stops.length + linePostCount };
}

export function insertFenceMarker(fence, pathT, idFactory = () => `post-${crypto.randomUUID()}`, minimumFraction = 0.002, type = "corner") {
  const clean = sanitizeChainLinkFence(fence);
  if (!clean) return fence;
  const t = clamp01(pathT);
  if ((!clean.closed && (t <= minimumFraction || t >= 1 - minimumFraction)) || clean.markers.some((marker) => Math.abs(marker.path_t - t) < minimumFraction)) return clean;
  return { ...clean, markers: [...clean.markers, { id: idFactory(), path_t: t, type: POST_TYPES.has(type) ? type : "corner", type_override: true }].sort((a, b) => a.path_t - b.path_t) };
}

export function updateChainLinkFencePostType(fence, postId, type) {
  const clean = sanitizeChainLinkFence(fence);
  if (!clean || !POST_TYPES.has(type) || !localPostIds(clean).includes(postId)) return fence;
  if (clean.markers.some((marker) => marker.id === postId)) return { ...clean, markers: clean.markers.map((marker) => marker.id === postId ? { ...marker, type, type_override: true } : marker) };
  return { ...clean, post_types: { ...clean.post_types, [postId]: type } };
}

export function updateFenceMarker(fence, markerId, patch) {
  const clean = sanitizeChainLinkFence(fence);
  if (!clean) return fence;
  return sanitizeChainLinkFence({ ...clean, markers: clean.markers.map((marker) => marker.id === markerId ? { ...marker, ...patch } : marker) });
}

export function removeFenceMarker(fence, markerId) {
  const clean = sanitizeChainLinkFence(fence);
  return clean ? { ...clean, markers: clean.markers.filter((marker) => marker.id !== markerId) } : fence;
}
