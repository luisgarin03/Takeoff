import { pathMetrics, pointAtPathT, projectPointToPath } from "./chainLinkFence.js";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nodeId = () => `plnode-${crypto.randomUUID()}`;
const groupId = () => `polyline-${crypto.randomUUID()}`;

// Give every stored Polyline vertex a stable identity. A node ID can appear in
// more than one run only when those runs refer to the same junction on the
// same sheet; collisions between unrelated points are repaired on load.
export function ensurePolylineNodeIds(shapes = []) {
  const usedIds = new Set();
  const byGroup = new Map();
  const nextId = () => {
    let id = nodeId();
    while (usedIds.has(id)) id = nodeId();
    usedIds.add(id);
    return id;
  };
  let changed = false;
  const normalized = shapes.map((shape) => {
    if (shape?.measure_role !== "linear" || shape.curved || typeof shape.polyline_group_id !== "string"
      || !shape.polyline_group_id || !Array.isArray(shape.verts_norm) || shape.verts_norm.length < 2) return shape;

    const groupId = shape.polyline_group_id;
    const groupNodes = byGroup.get(groupId) || new Map();
    byGroup.set(groupId, groupNodes);
    const sourceIds = Array.isArray(shape.polyline_node_ids) ? shape.polyline_node_ids : [];
    const ids = [];
    const seenInShape = new Set();
    shape.verts_norm.forEach((point, index) => {
      const x = Number.isFinite(point?.[0]) ? point[0] : 0;
      const y = Number.isFinite(point?.[1]) ? point[1] : 0;
      const prior = sourceIds[index];
      let canonical = null;
      if (typeof prior === "string" && prior) {
        const entries = groupNodes.get(prior) || [];
        canonical = entries.find((entry) => entry.sheetId === shape.sheet_id
          && Math.hypot(entry.point[0] - x, entry.point[1] - y) <= 1e-9)?.id || null;
        if (!canonical && !usedIds.has(prior)) {
          canonical = prior;
          usedIds.add(prior);
        }
      }
      if (!canonical) canonical = nextId();

      // A closed path may repeat its first vertex as its last vertex. That is
      // one logical point; every other vertex within a run gets its own ID.
      const isClosingVertex = index === shape.verts_norm.length - 1
        && Math.hypot(x - shape.verts_norm[0][0], y - shape.verts_norm[0][1]) <= 1e-9;
      if (isClosingVertex) canonical = ids[0];
      if (seenInShape.has(canonical) && !isClosingVertex) canonical = nextId();
      seenInShape.add(canonical);
      ids.push(canonical);

      const rows = groupNodes.get(prior) || [];
      if (typeof prior !== "string" || !prior || !rows.some((entry) => entry.id === canonical
        && entry.sheetId === shape.sheet_id && entry.point[0] === x && entry.point[1] === y)) {
        rows.push({ id: canonical, sheetId: shape.sheet_id, point: [x, y] });
        if (typeof prior === "string" && prior) groupNodes.set(prior, rows);
      }
    });

    const same = sourceIds.length === ids.length && ids.every((id, index) => id === sourceIds[index]);
    if (same) return shape;
    changed = true;
    return { ...shape, polyline_node_ids: ids };
  });
  return { shapes: normalized, changed };
}

function postPathT(fence, postId) {
  if (postId === `${fence.id}-start` || postId === `${fence.id}-loop`) return 0;
  if (postId === `${fence.id}-end`) return 1;
  return fence.markers?.find((marker) => marker.id === postId)?.path_t ?? null;
}

// Upgrade older connected runs that stored shared fence-post IDs but did not
// persist Polyline group/node IDs. Only explicit, coincident shared stops are
// migrated; unrelated Linear measurements remain untouched.
export function migrateLegacyPolylineGroups(shapes = [], fences = [], sheetDimensions = new Map()) {
  const shapeById = new Map(shapes.map((shape) => [shape.id, shape]));
  const sharedRefs = new Map();
  for (const fence of fences) {
    const shape = shapeById.get(fence.shape_id);
    if (!shape || shape.measure_role !== "linear" || shape.curved || shape.polyline_group_id
      || shape.sheet_id !== fence.sheet_id || !Array.isArray(shape.verts_norm) || shape.verts_norm.length < 2) continue;
    for (const sharedId of Object.values(fence.shared_posts || {})) {
      if (typeof sharedId !== "string" || !sharedId) continue;
      const refs = sharedRefs.get(sharedId) || [];
      refs.push({ fence, shape });
      sharedRefs.set(sharedId, refs);
    }
  }

  const junctions = [];
  for (const [sharedId, refs] of sharedRefs) {
    const uniqueShapeIds = new Set(refs.map(({ shape }) => shape.id));
    if (uniqueShapeIds.size < 2) continue;
    const positions = refs.map(({ fence, shape }) => {
      const dims = sheetDimensions.get(shape.sheet_id);
      if (!dims?.width || !dims?.height) return null;
      const points = shape.verts_norm.map(([x, y]) => [x * dims.width, y * dims.height]);
      const metrics = pathMetrics(points, fence.closed);
      const pathT = Object.keys(fence.shared_posts || {}).find((postId) => fence.shared_posts[postId] === sharedId);
      const t = postPathT(fence, pathT);
      if (t == null || metrics.total <= 0) return null;
      return { fence, shape, dims, points, pathT: t, point: pointAtPathT(metrics, t) };
    });
    if (positions.some((position) => !position)) continue;
    const canonical = positions[0].point;
    // A shared ID whose old geometry has drifted apart is ambiguous. Leave it
    // alone rather than pulling user geometry toward an arbitrary branch.
    if (positions.some((position) => distance(position.point, canonical) > 2)) continue;
    junctions.push({ sharedId, refs: positions, point: canonical });
  }

  const parent = new Map();
  const find = (id) => {
    const current = parent.get(id) || id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a, b) => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parent.set(rootB, rootA); };
  for (const junction of junctions) {
    const ids = [...new Set(junction.refs.map(({ shape }) => shape.id))];
    for (const id of ids.slice(1)) union(ids[0], id);
  }

  const components = new Map();
  for (const junction of junctions) for (const { shape } of junction.refs) {
    const root = find(shape.id);
    const component = components.get(root) || new Set();
    component.add(shape.id);
    components.set(root, component);
  }
  if (!components.size) {
    const identified = ensurePolylineNodeIds(shapes);
    return { shapes: identified.shapes, fences, changed: identified.changed };
  }

  const migratedShapes = new Map();
  const migratedFences = new Map();
  for (const component of components.values()) {
    const members = [...component].map((id) => shapeById.get(id)).filter(Boolean);
    if (members.length < 2 || members.some((shape) => shape.polyline_group_id)) continue;
    const topologyGroupId = groupId();
    const work = new Map(members.map((shape) => {
      const dims = sheetDimensions.get(shape.sheet_id);
      const points = shape.verts_norm.map(([x, y]) => [x * dims.width, y * dims.height]);
      const ids = Array.isArray(shape.polyline_node_ids) && shape.polyline_node_ids.length === points.length
        ? [...shape.polyline_node_ids] : points.map(nodeId);
      return [shape.id, { shape, dims, points, ids }];
    }));

    const memberJunctions = junctions.filter((junction) => junction.refs.some(({ shape }) => component.has(shape.id)));
    const idByShared = new Map(memberJunctions.map(({ sharedId }) => [sharedId, nodeId()]));
    for (const junction of memberJunctions) for (const ref of junction.refs) {
      const row = work.get(ref.shape.id);
      if (!row) continue;
      const metrics = pathMetrics(row.points, ref.fence.closed);
      const hit = projectPointToPath(metrics, junction.point);
      if (!hit || hit.distance > 2) continue;
      let vertexIndex = -1, nearest = Infinity;
      row.points.forEach((point, index) => {
        const gap = distance(point, junction.point);
        if (gap < nearest) { nearest = gap; vertexIndex = index; }
      });
      const junctionNode = idByShared.get(junction.sharedId);
      if (nearest <= 2) {
        row.points[vertexIndex] = [...junction.point];
        row.ids[vertexIndex] = junctionNode;
      } else {
        const along = hit.path_t * metrics.total;
        const segment = metrics.segments.find((item) => along <= item.start + item.length + 1e-8) || metrics.segments.at(-1);
        const index = row.points.indexOf(segment?.a);
        if (index < 0) continue;
        row.points.splice(index + 1, 0, [...junction.point]);
        row.ids.splice(index + 1, 0, junctionNode);
      }
      const priorFence = migratedFences.get(ref.fence.id) || ref.fence;
      const sharedPosts = Object.fromEntries(Object.entries(priorFence.shared_posts || {}).map(([postId, id]) => [
        postId, idByShared.get(id) || id,
      ]));
      migratedFences.set(ref.fence.id, { ...priorFence, shared_posts: sharedPosts });
    }

    for (const [id, row] of work) {
      migratedShapes.set(id, {
        ...row.shape,
        verts_norm: row.points.map(([x, y]) => [x / row.dims.width, y / row.dims.height]),
        polyline_group_id: topologyGroupId,
        polyline_node_ids: row.ids,
      });
    }
  }
  if (!migratedShapes.size) {
    const identified = ensurePolylineNodeIds(shapes);
    return { shapes: identified.shapes, fences, changed: identified.changed };
  }
  const upgradedShapes = shapes.map((shape) => migratedShapes.get(shape.id) || shape);
  const identified = ensurePolylineNodeIds(upgradedShapes);
  return {
    shapes: identified.shapes,
    fences: fences.map((fence) => migratedFences.get(fence.id) || fence),
    changed: true,
  };
}
