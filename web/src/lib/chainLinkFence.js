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
      type: marker.type === "terminal" ? "terminal" : "corner",
    });
  }
  markers.sort((a, b) => a.path_t - b.path_t);
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
    closed: false, markers: [],
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
  const corners = stops.map((marker) => ({ ...marker, point: pointAtPathT(metrics, marker.path_t) }));
  const linePostCount = sections.reduce((sum, section) => sum + section.intermediate, 0);
  return {
    valid: true, metrics, corners, linePosts, sections,
    totalLengthFt: metrics.total * upp,
    cornerPostCount: corners.length,
    linePostCount,
    totalPostCount: corners.length + linePostCount,
  };
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
  const cornerPostCount = stops.length;
  return { valid: true, sections, totalLengthFt: total, cornerPostCount, linePostCount, totalPostCount: cornerPostCount + linePostCount };
}

export function insertFenceMarker(fence, pathT, idFactory = () => `post-${crypto.randomUUID()}`, minimumFraction = 0.002) {
  const clean = sanitizeChainLinkFence(fence);
  if (!clean) return fence;
  const t = clamp01(pathT);
  if ((!clean.closed && (t <= minimumFraction || t >= 1 - minimumFraction)) || clean.markers.some((marker) => Math.abs(marker.path_t - t) < minimumFraction)) return clean;
  return { ...clean, markers: [...clean.markers, { id: idFactory(), path_t: t, type: "corner" }].sort((a, b) => a.path_t - b.path_t) };
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
