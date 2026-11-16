import * as T from "three";
import { METERS_PER_FOOT as FT, METERS_PER_INCH as IN } from "./settings.js";

const Y = new T.Vector3(0, 1, 0);
const ROTATION = (axis) => -Math.atan2(axis[1], axis[0]);
const METAL = "#303834";

function batcher(parent, run) {
  const buckets = new Map();
  const transform = new T.Object3D();
  const add = (category, color, center, axis, width, height, depth, identity, rotation = null) => {
    if (!(width > 0 && height > 0 && depth > 0)) return;
    const key = `${category}/${color}`;
    if (!buckets.has(key)) buckets.set(key, { category, color, matrices: [], componentIds: [], instanceIds: [] });
    transform.position.set(center[0], center[1], center[2]);
    transform.rotation.set(0, rotation ?? ROTATION(axis || [1, 0]), 0);
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    const bucket = buckets.get(key);
    bucket.matrices.push(transform.matrix.clone());
    bucket.componentIds.push(identity.component_id);
    bucket.instanceIds.push(identity.id);
  };
  return {
    add,
    finish() {
      for (const bucket of buckets.values()) {
        const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1),
          new T.MeshStandardMaterial({ color: bucket.color, metalness: .68, roughness: .3 }), bucket.matrices.length);
        bucket.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.userData = { kind: bucket.category, mapCategory: bucket.category, shapeId: run.id,
          conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
          componentIds: bucket.componentIds, instanceIds: bucket.instanceIds };
        mesh.name = bucket.category;
        parent.add(mesh);
      }
    },
  };
}

function modelBox(parent, category, color, position, size, rotationY, identity, run) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size),
    new T.MeshStandardMaterial({ color, metalness: .68, roughness: .3 }));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.userData = { kind: category, mapCategory: category, shapeId: run.id,
    conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
    component_id: identity.component_id, id: identity.id, gateId: identity.gateId || null };
  parent.add(mesh);
  return mesh;
}

function modelRoller(parent, gate, run, index, point) {
  const mesh = new T.Mesh(new T.CylinderGeometry(.075, .075, .04, 12),
    new T.MeshStandardMaterial({ color: "#626d72", metalness: .72, roughness: .28 }));
  mesh.position.set(...point);
  const axis = new T.Vector3(gate.a[1] - gate.b[1], 0, gate.b[0] - gate.a[0]).normalize();
  mesh.quaternion.setFromUnitVectors(Y, axis);
  const id = `ornamental-gate:${run.conditionScopeId}:${gate.id}:roller:${index + 1}`;
  mesh.userData = { kind: "gateRollers", mapCategory: "gateRollers", shapeId: run.id,
    conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
    component_id: `fence-component:${id}`, id, gateId: gate.id };
  parent.add(mesh);
  return mesh;
}

function drawGateLeaf(parent, gate, leaf, run) {
  const pivot = new T.Group();
  pivot.name = `${gate.id} leaf ${leaf.leafIndex + 1} hinge pivot`;
  pivot.position.set(leaf.hinge[0], leaf.bottom, leaf.hinge[1]);
  pivot.rotation.y = ROTATION(leaf.direction) + leaf.openDegrees * Math.PI / 180;
  pivot.userData = { kind: "gateLeaf", gateId: gate.id, component_id: leaf.component_id,
    shapeId: run.id, conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
    hingePoint: [...leaf.hinge], openDegrees: leaf.openDegrees };
  parent.add(pivot);
  const length = leaf.leafLength;
  const height = leaf.top - leaf.bottom;
  const railFractions = leaf.railCount === 2 ? [.12, .88] : [.1, .5, .9];
  for (let index = 0; index < railFractions.length; index++) {
    const railId = `${leaf.id}:rail:${index + 1}`;
    modelBox(pivot, "rails", run.spec.finish_color, [length / 2, height * railFractions[index], 0],
      [length, leaf.railWidth, leaf.railDepth], 0, { id: railId, component_id: `fence-component:${railId}` }, run);
  }
  for (const [index, x] of [0, length].entries()) {
    const id = `${leaf.id}:stile:${index + 1}`;
    modelBox(pivot, "gateFrame", run.spec.finish_color, [x, height / 2, 0],
      [leaf.railWidth, height, leaf.railDepth], 0, { id, component_id: `fence-component:${id}` }, run);
  }
  for (const picket of leaf.pickets) {
    const along = Math.max(0, Math.min(length,
      (picket.point[0] - leaf.hinge[0]) * leaf.direction[0] + (picket.point[1] - leaf.hinge[1]) * leaf.direction[1]));
    modelBox(pivot, "pickets", run.spec.finish_color, [along, (picket.bottom + picket.top) / 2 - leaf.bottom, 0],
      [picket.width, picket.top - picket.bottom, picket.width], 0,
      { id: picket.id, component_id: picket.component_id }, run);
  }
  for (const level of gate.type === "overhead" ? [] : [.2, .8]) {
    const id = `${leaf.hingeSetId}:hinge:${level}`;
    modelBox(pivot, "ornamentalHinges", "#78848b", [0, height * level, 0],
      [.07, .05, leaf.railDepth * 1.5], 0, { id, component_id: `fence-component:${leaf.hingeSetId}` }, run);
  }
  if (leaf.leafIndex === 0) {
    const latchId = `${gate.latchId}:body`;
    modelBox(pivot, "ornamentalLatches", "#626d72", [length - .04, height * .78, 0],
      [.09, .1, .055], 0, { id: latchId, component_id: `fence-component:${gate.latchId}`, gateId: gate.id }, run);
  }
  if (gate.type === "double" && leaf.leafIndex === 1) {
    const dropId = `fence-component:${gate.dropRodId}`;
    modelBox(pivot, "ornamentalDropRods", "#626d72", [length - .04, height * .42, 0],
      [.025, height * .65, .025], 0, { id: `${gate.dropRodId}:bar`, component_id: dropId, gateId: gate.id }, run);
  }
  return pivot;
}

export function createOrnamentalScene(layout) {
  const root = new T.Group();
  root.name = "Procedural ornamental fence";
  const conditionGroups = new Map();
  const conditionGroup = (conditionId, conditionScopeId, conditionName) => {
    const key = conditionScopeId || conditionId || "unassigned";
    if (!conditionGroups.has(key)) {
      const group = new T.Group();
      group.name = `Ornamental condition: ${conditionName || conditionId || "Unassigned"}`;
      group.userData = { conditionId, conditionScopeId, kind: "condition" };
      conditionGroups.set(key, group);
      root.add(group);
    }
    return conditionGroups.get(key);
  };
  const runGroups = new Map();
  for (const run of layout.runs) {
    const condition = conditionGroup(run.conditionId, run.conditionScopeId, run.conditionName);
    const group = new T.Group();
    group.name = run.label;
    group.userData = { shapeId: run.id, conditionId: run.conditionId,
      conditionScopeId: run.conditionScopeId, component_id: `ornamental-run:${run.id}` };
    condition.add(group);
    runGroups.set(run.id, { run, group, parts: batcher(group, run) });
  }
  for (const post of layout.posts) {
    const entry = runGroups.get(post.runId) || [...runGroups.values()].find((item) => item.run.conditionScopeId === post.conditionScopeId);
    if (!entry) continue;
    const category = `post:${post.type}`;
    const foundationDepth = post.foundationDepthFt * FT;
    const postHeight = post.top - post.base + foundationDepth;
    const centerY = (post.base - foundationDepth + post.top) / 2;
    entry.parts.add(category, post.runId && entry.run.spec.finish_color || METAL,
      [post.point[0], centerY, post.point[1]], [Math.cos(post.referenceAngle), Math.sin(post.referenceAngle)],
      post.width, postHeight, post.depth, { id: post.id, component_id: post.component_id }, -post.referenceAngle);
    const foundationDiameter = post.foundationDiameterIn * IN;
    const foundation = new T.Mesh(new T.CylinderGeometry(foundationDiameter / 2, foundationDiameter / 2, foundationDepth, 12),
      new T.MeshStandardMaterial({ color: "#a09e98", metalness: 0, roughness: .92 }));
    foundation.position.set(post.point[0], post.base - foundationDepth / 2, post.point[1]);
    foundation.userData = { kind: "foundations", mapCategory: "foundations", shapeId: post.runId,
      conditionId: post.conditionId, conditionScopeId: post.conditionScopeId,
      id: `${post.component_id}:foundation`, component_id: `${post.component_id}:foundation` };
    foundation.name = `Concrete foundation ${post.id}`;
    entry.group.add(foundation);
    const capId = `${post.id}:cap`;
    entry.parts.add("ornamentalCaps", "#505b5e", [post.point[0], post.top + .018, post.point[1]],
      [1, 0], post.width * 1.08, .036, post.depth * 1.08,
      { id: capId, component_id: `fence-component:${capId}` });
  }
  for (const panel of layout.panels) {
    const entry = runGroups.get(panel.runId);
    if (!entry) continue;
    const centerX = (panel.a[0] + panel.b[0]) / 2;
    const centerZ = (panel.a[1] + panel.b[1]) / 2;
    const color = panel.spec.finish_color || METAL;
    for (let index = 0; index < panel.railCount; index++) {
      const rail = panel[`rail${index + 1}`];
      entry.parts.add("rails", color, [centerX, rail.y, centerZ], panel.axis,
        panel.length, panel.railWidth, panel.railDepth, rail);
    }
    for (const picket of panel.pickets) entry.parts.add("pickets", color,
      [picket.point[0], (picket.bottom + picket.top) / 2, picket.point[1]], [1, 0],
      picket.width, picket.top - picket.bottom, picket.width, picket);
    for (const bracket of panel.brackets || []) entry.parts.add(bracket.kind, "#78848b", bracket.point,
      bracket.axis, bracket.width, bracket.height, bracket.depth, bracket);
  }
  for (const gate of layout.gates) {
    const entry = runGroups.get(gate.runId);
    if (!entry) continue;
    if (gate.type === "overhead") {
      const top = entry.run.spec.elevation_ft * FT + gate.clearance * IN + gate.height * FT;
      const axis = [(gate.b[0] - gate.a[0]) / gate.openingLength, (gate.b[1] - gate.a[1]) / gate.openingLength];
      const center = [(gate.a[0] + gate.b[0]) / 2, top + .12, (gate.a[1] + gate.b[1]) / 2];
      const trackId = `ornamental-gate:${entry.run.conditionScopeId}:${gate.id}:track`;
      modelBox(entry.group, "gateRollers", "#626d72", center,
        [gate.openingLength, .055, .065], ROTATION(axis),
        { id: trackId, component_id: `fence-component:${trackId}`, gateId: gate.id }, entry.run);
      const inset = Math.min(.3, gate.openingLength / 4);
      for (const [index, distanceAlong] of [inset, gate.openingLength - inset].entries()) {
        const point = [gate.a[0] + axis[0] * distanceAlong, top + .06,
          gate.a[1] + axis[1] * distanceAlong];
        modelRoller(entry.group, gate, entry.run, index, point);
      }
    }
    for (const leaf of gate.leaves) drawGateLeaf(entry.group, gate, leaf, entry.run);
    if (gate.type === "double") {
      const middle = [(gate.a[0] + gate.b[0]) / 2, entry.run.spec.elevation_ft * FT + gate.clearance * IN + gate.height * FT * .78,
        (gate.a[1] + gate.b[1]) / 2];
      const id = `${gate.keeperId}:body`;
      modelBox(entry.group, "ornamentalKeepers", "#626d72", middle, [.08, .1, .06], 0,
        { id, component_id: `fence-component:${gate.keeperId}`, gateId: gate.id }, entry.run);
    }
  }
  for (const entry of runGroups.values()) entry.parts.finish();
  return root;
}
