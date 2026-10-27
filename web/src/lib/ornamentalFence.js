// Independent ornamental-fence panel layout. Records link to an existing
// Linear takeoff and never modify its geometry or measured LF. This module is
// intentionally separate from chainLinkFence.js so both calculators keep
// their own defaults, settings, persistence, and derived results.

export const ORNAMENTAL_PANEL_WIDTHS_FT = [6, 8];
export const DEFAULT_ORNAMENTAL_PANEL_WIDTH_FT = 8;
export const DEFAULT_ORNAMENTAL_MARKER_SIZE = 7;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = (value) => Math.max(0, Math.min(1, finite(value)));

export function sanitizeOrnamentalFence(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const shapeId = typeof record.shape_id === "string" ? record.shape_id : "";
  const sheetId = typeof record.sheet_id === "string" ? record.sheet_id : "";
  if (!shapeId || !sheetId) return null;
  const manualPosts = (Array.isArray(record.manual_posts) ? record.manual_posts : []).flatMap((post) => {
    if (!post || typeof post !== "object") return [];
    const pointNorm = Array.isArray(post.point_norm) && post.point_norm.length >= 2
      ? [clamp01(post.point_norm[0]), clamp01(post.point_norm[1])]
      : null;
    return [{ id: typeof post.id === "string" && post.id ? post.id : `orn-post-${crypto.randomUUID()}`, ...(pointNorm ? { point_norm: pointNorm } : { path_t: clamp01(post.path_t) }) }];
  });
  return {
    id: typeof record.id === "string" && record.id ? record.id : `ornamental-${crypto.randomUUID()}`,
    shape_id: shapeId,
    sheet_id: sheetId,
    condition_id: typeof record.condition_id === "string" ? record.condition_id : "",
    panel_width_ft: ORNAMENTAL_PANEL_WIDTHS_FT.includes(finite(record.panel_width_ft)) ? finite(record.panel_width_ft) : DEFAULT_ORNAMENTAL_PANEL_WIDTH_FT,
    marker_size: Math.max(4, Math.min(16, finite(record.marker_size, DEFAULT_ORNAMENTAL_MARKER_SIZE))),
    show_posts: record.show_posts !== false,
    show_panel_lengths: !!record.show_panel_lengths,
    show_post_counts: record.show_post_counts !== false,
    closed: !!record.closed,
    manual_posts: manualPosts,
  };
}

export function sanitizeOrnamentalFences(value, shapes = []) {
  const byShape = new Map((shapes || []).map((shape) => [shape.id, shape]));
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const fence = sanitizeOrnamentalFence(raw);
    const shape = fence && byShape.get(fence.shape_id);
    if (!fence || !shape || shape.measure_role !== "linear" || seen.has(fence.shape_id)) continue;
    seen.add(fence.shape_id);
    out.push({ ...fence, sheet_id: shape.sheet_id, condition_id: shape.condition_id });
  }
  return out;
}

export function createOrnamentalFence(shape, idFactory = () => `ornamental-${crypto.randomUUID()}`) {
  if (!shape || shape.measure_role !== "linear") return null;
  return sanitizeOrnamentalFence({
    id: idFactory(), shape_id: shape.id, sheet_id: shape.sheet_id, condition_id: shape.condition_id,
    panel_width_ft: DEFAULT_ORNAMENTAL_PANEL_WIDTH_FT, marker_size: DEFAULT_ORNAMENTAL_MARKER_SIZE,
    show_posts: true, show_panel_lengths: false, show_post_counts: true, closed: false, manual_posts: [],
  });
}

export function calculateOrnamentalFence(fence, points, unitsPerPx) {
  const clean = sanitizeOrnamentalFence(fence);
  const upp = finite(unitsPerPx);
  const pts = Array.isArray(points) ? points.filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])) : [];
  if (!clean || pts.length < 2 || upp <= 0) return { valid: false, sections: [], posts: [], totalLengthFt: 0, orderedPanelLf: 0, cutWasteLf: 0, panelCount: 0, postCount: 0 };
  const path = clean.closed && (pts[0][0] !== pts.at(-1)[0] || pts[0][1] !== pts.at(-1)[1]) ? [...pts, pts[0]] : pts;
  const sections = [], posts = [];
  const lengthsPx = [];
  let totalPx = 0;
  for (let index = 1; index < path.length; index++) {
    const lengthPx = Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
    lengthsPx.push(lengthPx); totalPx += lengthPx;
  }
  let totalLengthFt = 0, orderedPanelLf = 0, cutWasteLf = 0, panelCount = 0;
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index];
    const lengthPx = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(lengthPx > 0)) continue;
    const lengthFt = lengthPx * upp;
    const panels = Math.max(1, Math.ceil(lengthFt / clean.panel_width_ft));
    const finalPanelWidthFt = lengthFt - clean.panel_width_ft * (panels - 1);
    const orderedPanelLfForSection = panels * clean.panel_width_ft;
    const cutWasteLfForSection = Math.max(0, orderedPanelLfForSection - lengthFt);
    const section = { id: `${clean.id}-section-${index}`, index: sections.length, a, b, lengthFt, panels, panelWidthFt: clean.panel_width_ft, finalPanelWidthFt, orderedPanelLf: orderedPanelLfForSection, cutWasteLf: cutWasteLfForSection };
    sections.push(section); totalLengthFt += lengthFt; orderedPanelLf += orderedPanelLfForSection; cutWasteLf += cutWasteLfForSection; panelCount += panels;
    for (let n = 0; n <= panels; n++) {
      if (posts.length && n === 0) continue;
      const distanceFt = Math.min(lengthFt, n * clean.panel_width_ft);
      const t = distanceFt / lengthFt;
      posts.push({ id: `${section.id}-post-${n}`, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], sectionIndex: section.index });
    }
  }
  if (clean.closed && posts.length > 1) posts.pop();
  const manualPosts = clean.manual_posts.map((post) => {
    if (post.point_norm) return { ...post, manual: true, point: null };
    const target = post.path_t * totalPx;
    let travelled = 0;
    for (let index = 0; index < lengthsPx.length; index++) {
      const lengthPx = lengthsPx[index];
      if (target <= travelled + lengthPx || index === lengthsPx.length - 1) {
        const a = path[index], b = path[index + 1];
        const t = lengthPx > 0 ? Math.max(0, Math.min(1, (target - travelled) / lengthPx)) : 0;
        return { ...post, manual: true, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
      }
      travelled += lengthPx;
    }
    return { ...post, manual: true, point: path[0] };
  });
  return { valid: sections.length > 0, sections, posts, manualPosts, totalLengthFt, orderedPanelLf, cutWasteLf, panelCount, automaticPostCount: posts.length, manualPostCount: manualPosts.length, postCount: posts.length + manualPosts.length };
}

export function insertOrnamentalPost(fence, location, idFactory = () => `orn-post-${crypto.randomUUID()}`) {
  const clean = sanitizeOrnamentalFence(fence);
  if (!clean) return fence;
  const post = Array.isArray(location)
    ? { id: idFactory(), point_norm: [clamp01(location[0]), clamp01(location[1])] }
    : { id: idFactory(), path_t: clamp01(location) };
  return sanitizeOrnamentalFence({ ...clean, manual_posts: [...clean.manual_posts, post] });
}

export function removeOrnamentalPost(fence, postId) {
  const clean = sanitizeOrnamentalFence(fence);
  if (!clean) return fence;
  return sanitizeOrnamentalFence({ ...clean, manual_posts: clean.manual_posts.filter((post) => post.id !== postId) });
}
