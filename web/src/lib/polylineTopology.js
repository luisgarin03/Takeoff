import { pathMetrics, pointAtPathT, projectPointToPath } from "./chainLinkFence.js";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nodeId = () => `plnode-${crypto.randomUUID()}`;
const groupId = () => `polyline-${crypto.randomUUID()}`;

// Give every stored Polyline vertex a stable identity. A node ID can appear in
// more than one run only when those runs refer to the same junction on the
// same sheet; collisions between unrelated points are repaired on load.
export function ensurePolylineNodeIds(shapes = [], sheetDimensions = new Map()) {
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
    const conditionId = shape.condition_id || `shape:${shape.id}`;
    const groupKey = `${shape.sheet_id || ""}\0${conditionId}\0${groupId}`;
    const groupNodes = byGroup.get(groupKey) || new Map();
    byGroup.set(groupKey, groupNodes);
    const sourceIds = Array.isArray(shape.polyline_node_ids) ? shape.polyline_node_ids : [];
    const ids = [];
    const verts = [];
    const seenInShape = new Set();
    shape.verts_norm.forEach((point, index) => {
      let x = Number.isFinite(point?.[0]) ? point[0] : 0;
      let y = Number.isFinite(point?.[1]) ? point[1] : 0;
      const prior = sourceIds[index];
      let canonical = null;
      if (typeof prior === "string" && prior) {
        const entries = groupNodes.get(prior) || [];
        const sameSheetNode = entries.find((entry) => entry.sheetId === shape.sheet_id && entry.conditionId === conditionId);
        canonical = sameSheetNode?.id || null;
        // A repeated Polyline node ID is the connectivity contract. Old edits
        // could leave the two stored copies a few pixels apart; keep the ID and
        // reconcile the stale copy to the first point so the junction cannot
        // render as two posts or drift apart again on the next drag.
        if (sameSheetNode && (x !== sameSheetNode.point[0] || y !== sameSheetNode.point[1])) {
          x = sameSheetNode.point[0];
          y = sameSheetNode.point[1];
        }
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
      verts.push([x, y]);

      const rows = groupNodes.get(prior) || [];
      if (typeof prior !== "string" || !prior || !rows.some((entry) => entry.id === canonical
        && entry.sheetId === shape.sheet_id && entry.conditionId === conditionId
        && entry.point[0] === x && entry.point[1] === y)) {
        rows.push({ id: canonical, sheetId: shape.sheet_id, conditionId, point: [x, y] });
        if (typeof prior === "string" && prior) groupNodes.set(prior, rows);
      }
    });

    const sameIds = sourceIds.length === ids.length && ids.every((id, index) => id === sourceIds[index]);
    const samePoints = verts.every(([x, y], index) => x === shape.verts_norm[index]?.[0] && y === shape.verts_norm[index]?.[1]);
    const same = sameIds && samePoints;
    if (same) return shape;
    changed = true;
    return { ...shape, verts_norm: verts, polyline_node_ids: ids };
  });
  // Repair old Polyline branches whose endpoints landed a couple of sheet
  // pixels from the source vertex. Group + condition + sheet scope is the
  // explicit connection contract; unrelated lines and geometric crossings
  // are never welded by proximity alone.
  const result = normalized.slice();
  const recordsByGroup = new Map();
  for (let shapeIndex = 0; shapeIndex < result.length; shapeIndex++) {
    const shape = result[shapeIndex];
    if (shape?.measure_role !== "linear" || shape.curved || !shape.polyline_group_id
      || !Array.isArray(shape.verts_norm) || !Array.isArray(shape.polyline_node_ids)) continue;
    const dims = sheetDimensions.get(shape.sheet_id);
    if (!dims?.width || !dims?.height) continue;
    const conditionId = shape.condition_id || `shape:${shape.id}`;
    const groupKey = `${shape.sheet_id || ""}\0${conditionId}\0${shape.polyline_group_id}`;
    const records = recordsByGroup.get(groupKey) || [];
    shape.verts_norm.forEach(([x, y], vertexIndex) => records.push({
      shapeIndex, vertexIndex, shapeId: shape.id, nodeId: shape.polyline_node_ids[vertexIndex],
      point: [x * dims.width, y * dims.height],
      endpoint: vertexIndex === 0 || vertexIndex === shape.verts_norm.length - 1,
      width: dims.width, height: dims.height,
    }));
    recordsByGroup.set(groupKey, records);
  }
  const writable = (shapeIndex) => {
    if (result[shapeIndex] === normalized[shapeIndex]) result[shapeIndex] = {
      ...normalized[shapeIndex],
      verts_norm: normalized[shapeIndex].verts_norm.map((point) => [...point]),
      polyline_node_ids: [...normalized[shapeIndex].polyline_node_ids],
    };
    return result[shapeIndex];
  };
  const idAvailable = (shape, vertexIndex, id) => shape.polyline_node_ids.every((value, index) => index === vertexIndex || value !== id);
  for (const records of recordsByGroup.values()) {
    for (const endpoint of records.filter((record) => record.endpoint)) {
      let nearest = null;
      for (const candidate of records) {
        if (candidate.shapeId === endpoint.shapeId) continue;
        const gap = distance(endpoint.point, candidate.point);
        if (gap <= 2 && (!nearest || gap < nearest.gap)) nearest = { candidate, gap };
      }
      if (!nearest) continue;
      const target = nearest.candidate;
      let sharedId = target.nodeId;
      const endpointShape = result[endpoint.shapeIndex];
      const targetShape = result[target.shapeIndex];
      if (!idAvailable(endpointShape, endpoint.vertexIndex, sharedId)
        || !idAvailable(targetShape, target.vertexIndex, sharedId)) {
        sharedId = endpoint.nodeId;
        if (!idAvailable(endpointShape, endpoint.vertexIndex, sharedId)
          || !idAvailable(targetShape, target.vertexIndex, sharedId)) sharedId = nextId();
      }
      const canonicalNorm = [target.point[0] / target.width, target.point[1] / target.height];
      const endpointNorm = endpointShape.verts_norm[endpoint.vertexIndex];
      const targetNorm = targetShape.verts_norm[target.vertexIndex];
      if (endpointShape.polyline_node_ids[endpoint.vertexIndex] === sharedId
        && targetShape.polyline_node_ids[target.vertexIndex] === sharedId
        && endpointNorm[0] === canonicalNorm[0] && endpointNorm[1] === canonicalNorm[1]
        && targetNorm[0] === canonicalNorm[0] && targetNorm[1] === canonicalNorm[1]) continue;
      const endpointCopy = writable(endpoint.shapeIndex);
      const targetCopy = writable(target.shapeIndex);
      endpointCopy.polyline_node_ids[endpoint.vertexIndex] = sharedId;
      endpointCopy.verts_norm[endpoint.vertexIndex] = canonicalNorm;
      targetCopy.polyline_node_ids[target.vertexIndex] = sharedId;
      endpoint.nodeId = sharedId;
      target.nodeId = sharedId;
      endpoint.point = [...target.point];
      changed = true;
    }
  }
  return { shapes: result, changed };
}

function postPathT(fence, postId) {
  if (postId === `${fence.id}-start` || postId === `${fence.id}-loop`) return 0;
  if (postId === `${fence.id}-end`) return 1;
  return fence.markers?.find((marker) => marker.id === postId)?.path_t ?? null;
}

// Upgrade older connected runs that stored shared fence-post IDs but did not
// persist Polyline group/node IDs. Only coincident legacy junctions are safe
// to infer: copied Linear runs can retain the same old shared ID far apart.
export function migrateLegacyPolylineGroups(shapes = [], fences = [], sheetDimensions = new Map()) {
  const shapeById = new Map(shapes.map((shape) => [shape.id, shape]));
  const sharedRefs = new Map();
  const sharedKey = (fence, shape, id) => `${fence.sheet_id || shape.sheet_id || ""}\0${shape.condition_id || `shape:${shape.id}`}\0${id}`;
  for (const fence of fences) {
    const shape = shapeById.get(fence.shape_id);
    if (!shape || shape.measure_role !== "linear" || shape.curved || shape.polyline_group_id
      || shape.sheet_id !== fence.sheet_id || !Array.isArray(shape.verts_norm) || shape.verts_norm.length < 2) continue;
    for (const sharedId of Object.values(fence.shared_posts || {})) {
      if (typeof sharedId !== "string" || !sharedId) continue;
      const key = sharedKey(fence, shape, sharedId);
      const refs = sharedRefs.get(key) || [];
      refs.push({ fence, shape, sharedId, key });
      sharedRefs.set(key, refs);
    }
  }

  const junctions = [];
  for (const [key, refs] of sharedRefs) {
    const uniqueShapeIds = new Set(refs.map(({ shape }) => shape.id));
    if (uniqueShapeIds.size < 2) continue;
    const positions = refs.map(({ fence, shape }) => {
      const dims = sheetDimensions.get(shape.sheet_id);
      if (!dims?.width || !dims?.height) return null;
      const points = shape.verts_norm.map(([x, y]) => [x * dims.width, y * dims.height]);
      const metrics = pathMetrics(points, fence.closed);
      const pathT = Object.keys(fence.shared_posts || {}).find((postId) => fence.shared_posts[postId] === refs[0].sharedId);
      const t = postPathT(fence, pathT);
      if (t == null || metrics.total <= 0) return null;
      return { fence, shape, dims, points, pathT: t, point: pointAtPathT(metrics, t) };
    });
    if (positions.some((position) => !position)) continue;
    const canonical = positions[0].point;
    // A shared ID may have been copied with a duplicated Linear measurement.
    // Do not pull a distant run to an arbitrary anchor; new Polyline branches
    // have explicit shared node IDs and are reconciled by ensurePolylineNodeIds.
    if (positions.some((position) => distance(position.point, canonical) > 2)) continue;
    junctions.push({ key, refs: positions.map((position, index) => ({ ...position, sharedId: refs[index].sharedId, key })), point: canonical });
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
    const identified = ensurePolylineNodeIds(shapes, sheetDimensions);
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
    const idByShared = new Map(memberJunctions.map(({ key }) => [key, nodeId()]));
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
      const junctionNode = idByShared.get(junction.key);
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
        postId, idByShared.get(sharedKey(priorFence, ref.shape, id)) || id,
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
    const identified = ensurePolylineNodeIds(shapes, sheetDimensions);
    return { shapes: identified.shapes, fences, changed: identified.changed };
  }
  const upgradedShapes = shapes.map((shape) => migratedShapes.get(shape.id) || shape);
  const identified = ensurePolylineNodeIds(upgradedShapes, sheetDimensions);
  return {
    shapes: identified.shapes,
    fences: fences.map((fence) => migratedFences.get(fence.id) || fence),
    changed: true,
  };
}
