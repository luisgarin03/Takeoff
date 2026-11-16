import * as T from "three";
import { METERS_PER_INCH as IN, METERS_PER_FOOT as FT } from "./settings.js";

const Y = new T.Vector3(0, 1, 0);
const angleOf = (axis) => -Math.atan2(axis?.[1] || 0, axis?.[0] || 1);

function makeBatcher(parent, condition) {
  const buckets = new Map();
  const transform = new T.Object3D();
  const add = (category, color, center, axis, size, identity, rotation = null) => {
    if (size.some((part) => !(part > 0))) return;
    const key = `${category}/${color}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = { category, color, matrices: [], ids: [], instances: [] });
    transform.position.set(center[0], center[1], center[2]);
    transform.rotation.set(0, rotation ?? angleOf(axis), 0);
    transform.scale.set(size[0], size[1], size[2]);
    transform.updateMatrix();
    bucket.matrices.push(transform.matrix.clone());
    bucket.ids.push(identity.component_id || identity.id);
    bucket.instances.push(identity.id || identity.component_id);
  };
  return { add, finish() {
    for (const bucket of buckets.values()) {
      const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1),
        new T.MeshStandardMaterial({ color: bucket.color, roughness: .82, metalness: .02 }), bucket.matrices.length);
      bucket.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.userData = { kind: bucket.category, mapCategory: bucket.category,
        conditionId: condition.conditionId, conditionScopeId: condition.conditionScopeId,
        componentIds: bucket.ids, instanceIds: bucket.instances };
      mesh.name = bucket.category;
      parent.add(mesh);
    }
  } };
}

function meshBox(parent, category, color, position, size, rotationY, run, id, componentId = id) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size),
    new T.MeshStandardMaterial({ color, roughness: .78, metalness: category.startsWith("wood:gate") ? .45 : .02 }));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.userData = { kind: category, mapCategory: category, shapeId: run.id,
    conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
    id, component_id: componentId, componentIds: [componentId] };
  mesh.name = category;
  parent.add(mesh);
  return mesh;
}

function addGateLeaf(parent, gate, leaf, run, color, spec) {
  const pivot = new T.Group();
  pivot.name = `${gate.id} leaf ${leaf.leafIndex + 1} hinge pivot`;
  pivot.position.set(leaf.hinge[0], leaf.bottom, leaf.hinge[1]);
  pivot.rotation.y = angleOf(leaf.baseAxis);
  pivot.userData = { kind: "gateLeaf", gateId: gate.id, shapeId: run.id,
    conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
    id: leaf.id, component_id: leaf.component_id };
  const swing = new T.Group();
  swing.rotation.y = leaf.openDegrees * Math.PI / 180;
  swing.userData = { kind: "gateLeaf" };
  pivot.add(swing);
  parent.add(pivot);

  const h = leaf.height, length = leaf.length;
  const postSize = spec.gate_post_size_in * IN;
  const railWidth = spec.rail_width_in * IN, railDepth = spec.rail_depth_in * IN;
  for (const rail of leaf.rails) {
    meshBox(swing, "wood:rails", color, [length / 2, rail.y - leaf.bottom, 0],
      [length, railDepth, railWidth], 0, run, rail.id, rail.component_id);
  }
  for (const [index, x] of [[0, postSize * .14], [1, length - postSize * .14]]) {
    const id = `${leaf.id}:stile:${index + 1}`;
    meshBox(swing, "wood:gateFrame", color, [x, h / 2, 0], [postSize * .28, h, postSize * .28], 0, run, id, `fence-component:${id}`);
  }
  for (const picket of leaf.pickets) {
    const id = picket.id;
    meshBox(swing, "wood:pickets", color, [picket.at, h / 2, 0],
      [spec.picket_width_in * IN, h, spec.picket_width_in * IN], 0, run, id, picket.component_id);
  }
  for (const fastener of leaf.fasteners) {
    const fraction = spec.rails === 2 ? (fastener.rail ? .84 : .16) : [.12, .5, .88][fastener.rail];
    meshBox(swing, "wood:fasteners", "#535b61", [fastener.at, h * fraction, postSize * .2],
      [.025, .025, .025], 0, run, fastener.id, fastener.component_id);
  }
  // Compression brace slopes up from the hinge side to the latch side.
  const braceId = `${leaf.id}:compression-brace`;
  const braceLength = Math.hypot(length, h * .72);
  const brace = meshBox(swing, "wood:gateFrame", color, [length / 2, h * .5, 0],
    [braceLength, Math.max(.035, railDepth * .72), Math.max(.035, railWidth * .72)], 0,
    run, braceId, `fence-component:${braceId}`);
  brace.rotation.z = Math.atan2(h * .72, length);
  for (const [hingeIndex, y] of [.14, .82].entries()) {
    const id = `${leaf.id}:hinge:${hingeIndex + 1}`;
    meshBox(swing, "wood:gateHinges", "#59636b", [postSize * .25, h * y, 0],
      [.12, .11, postSize * .46], 0, run, id, `fence-component:${id}`);
  }
  if (leaf.leafIndex === (gate.type === "double" ? 1 : 0)) {
    const latchId = `${gate.id}:latch`;
    meshBox(swing, "wood:gateLatches", "#59636b", [Math.max(0, length - postSize * .3), h * .79, 0],
      [.18, .09, .09], 0, run, latchId, `fence-component:${gate.latchId}`);
  }
  if (gate.type === "double" && leaf.leafIndex === 1) {
    const rodId = `${gate.id}:drop-rod`;
    meshBox(swing, "wood:dropRods", "#59636b", [length - postSize * .28, h * .36, 0],
      [.035, h * .66, .035], 0, run, rodId, `fence-component:${gate.dropRodId}`);
    meshBox(swing, "wood:groundReceivers", "#59636b", [length - postSize * .28, -.035, 0],
      [.12, .07, .1], 0, run, `${rodId}:receiver`, `fence-component:${gate.receiverId}`);
  }
  return pivot;
}

/** Build the wood model with instanced fixed members and individually pivoted gates. */
export function createWoodScene(layout) {
  const root = new T.Group();
  root.name = "Procedural wood privacy fence";
  const conditions = new Map();
  const batchers = new Map();
  const conditionFor = (run) => {
    const key = run.conditionScopeId || run.conditionId || "unassigned";
    let group = conditions.get(key);
    if (!group) {
      group = new T.Group();
      group.name = `Wood condition: ${run.conditionName || run.conditionId || "Unassigned"}`;
      group.userData = { kind: "condition", conditionId: run.conditionId, conditionScopeId: run.conditionScopeId };
      batchers.set(key, makeBatcher(group, run));
      conditions.set(key, group); root.add(group);
    }
    return group;
  };
  const batches = new Map();
  for (const run of layout.runs) {
    const group = conditionFor(run);
    batches.set(run.id, { group, batch: batchers.get(run.conditionScopeId || run.conditionId || "unassigned"), run });
  }
  const forRun = (runId) => batches.get(runId);

  for (const post of layout.posts) {
    const entry = forRun(post.runId) || [...batches.values()].find((item) => item.run.conditionScopeId === post.conditionScopeId);
    if (!entry) continue;
    const { run, batch, group } = entry;
    const color = run.spec.finish_color;
    const depth = post.footing ? post.foundationDepthFt * FT : 0;
    const postHeight = post.top - post.base + depth;
    const centerY = post.base + (post.top - post.base - depth) / 2;
    batch.add(`wood:post:${post.type}`, color, [post.point[0], centerY, post.point[1]],
      [Math.cos(post.referenceAngle), Math.sin(post.referenceAngle)], [post.width, postHeight, post.depth],
      { id: post.id, component_id: post.component_id }, post.referenceAngle);
    if (post.footing) {
      const cylinderDepth = post.foundationDepthFt * FT;
      const cylinderDiameter = post.foundationDiameterIn * IN;
      const foundation = new T.Mesh(new T.CylinderGeometry(cylinderDiameter / 2, cylinderDiameter / 2, cylinderDepth, 12),
        new T.MeshStandardMaterial({ color: "#a09e98", roughness: .92 }));
      foundation.position.set(post.point[0], post.base - cylinderDepth / 2, post.point[1]);
      foundation.userData = { kind: "foundations", mapCategory: "wood:foundations", shapeId: run.id,
        conditionId: post.conditionId, conditionScopeId: post.conditionScopeId,
        id: `${post.component_id}:foundation`, component_id: `${post.component_id}:foundation` };
      foundation.name = "Wood post concrete footing"; group.add(foundation);
    }
    if (post.gravelBeds && post.gravelDepthIn > 0) {
      const gravelDepth = post.gravelDepthIn * IN;
      const diameter = post.foundationDiameterIn * IN * 1.12;
      const gravel = new T.Mesh(new T.CylinderGeometry(diameter / 2, diameter / 2, gravelDepth, 10),
        new T.MeshStandardMaterial({ color: "#b3a27c", roughness: 1 }));
      gravel.position.set(post.point[0], post.base - gravelDepth / 2, post.point[1]);
      gravel.userData = { kind: "wood:gravelBeds", mapCategory: "wood:gravelBeds", shapeId: run.id,
        conditionId: post.conditionId, conditionScopeId: post.conditionScopeId,
        id: `${post.component_id}:gravel`, component_id: `${post.component_id}:gravel` };
      group.add(gravel);
    }
    const capId = `${post.component_id}:cap`;
    batch.add("wood:postCaps", color, [post.point[0], post.top + .035, post.point[1]], [1, 0],
      [post.width * 1.06, .07, post.depth * 1.06], { id: capId, component_id: capId });
  }

  for (const panel of layout.panels) {
    const entry = forRun(panel.runId);
    if (!entry) continue;
    const { run, batch } = entry;
    const color = run.spec.finish_color;
    for (const rail of panel.rails) {
      const center = [(rail.a[0] + rail.b[0]) / 2, rail.y, (rail.a[2] + rail.b[2]) / 2];
      const axis = [rail.b[0] - rail.a[0], rail.b[2] - rail.a[2]];
      batch.add("wood:rails", color, center, axis, [rail.length, rail.depth, rail.width], rail);
    }
    if (run.spec.cap_board) {
      const id = `${panel.id}:cap-board`;
      batch.add("wood:capBoards", color,
        [(panel.railStart[0] + panel.railEnd[0]) / 2, panel.top - run.spec.rail_depth_in * IN * .2, (panel.railStart[1] + panel.railEnd[1]) / 2],
        panel.axis, [panel.railLength, run.spec.rail_depth_in * IN, run.spec.rail_width_in * IN],
        { id, component_id: `fence-component:${id}` });
    }
    if (run.spec.kickboard) {
      const id = `${panel.id}:kickboard`;
      batch.add("wood:kickboards", color,
        [(panel.railStart[0] + panel.railEnd[0]) / 2, panel.bottom + run.spec.rail_width_in * IN / 2, (panel.railStart[1] + panel.railEnd[1]) / 2],
        panel.axis, [panel.railLength, run.spec.rail_width_in * IN, run.spec.rail_depth_in * IN],
        { id, component_id: `fence-component:${id}` });
    }
    for (const picket of panel.pickets) batch.add("wood:pickets", color,
      [picket.point[0], (picket.bottom + picket.top) / 2, picket.point[1]], panel.axis,
      [picket.width, picket.top - picket.bottom, picket.width], picket);
    for (const fastener of panel.fasteners) batch.add("wood:fasteners", "#535b61",
      [fastener.point[0], fastener.y, fastener.point[1]], fastener.direction, [.025, .025, .025], fastener);
  }
  for (const gate of layout.gates) {
    const entry = forRun(gate.runId);
    if (!entry) continue;
    for (const leaf of gate.leaves) addGateLeaf(entry.group, gate, leaf, entry.run,
      entry.run.spec.finish_color, entry.run.spec);
    if (gate.type === "double") {
      const middle = [(gate.a[0] + gate.b[0]) / 2, entry.run.spec.elevation_ft * FT + .8, (gate.a[1] + gate.b[1]) / 2];
      meshBox(entry.group, "wood:gateKeepers", "#59636b", middle, [.09, .1, .08], 0,
        entry.run, `${gate.id}:keeper`, `fence-component:${gate.keeperId}`);
    }
  }
  for (const batch of batchers.values()) batch.finish();
  return root;
}
