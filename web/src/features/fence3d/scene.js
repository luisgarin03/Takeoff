import * as T from "three";
import { METERS_PER_FOOT as FT, METERS_PER_INCH as IN, WIRE_GAUGES, FRAME_COMPONENTS } from "./settings.js";
import { braceSegments } from "./layout.js";
import { frameHeight, gateLeaves } from "./fittings.js";

const Y = new T.Vector3(0, 1, 0);
const cylinder = (sides) => new T.CylinderGeometry(.5, .5, 1, sides);
const FINISH = { galvanized: "#77858f", vinyl: "#303834" };
const MAX_DETAIL_WIRES = 12000;
const MAX_EXPLICIT_SELVAGE = 3600;

function paintPattern(mesh, wire) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = wire / ((mesh + wire) * Math.SQRT2) * 128;
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  for (const start of [-128, 0, 128, 256]) {
    ctx.moveTo(start, 0); ctx.lineTo(start + 128, 128);
    ctx.moveTo(start, 0); ctx.lineTo(start - 128, 128);
  }
  ctx.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}

const modelPoint = ([x, z], y) => [x, y, z];
const colorFor = (spec, finish) => (finish === "matching" ? spec.finish : finish) === "vinyl" ? spec.color || FINISH.vinyl : FINISH.galvanized;

function wireDiameter(spec) {
  const core = spec.wire || WIRE_GAUGES[spec.gauge];
  return Math.max(core, spec.finish === "vinyl" ? spec.coatedWire : 0) * IN;
}

function makeParts(namespace = "fence") {
  const buckets = new Map();
  const transform = new T.Object3D();
  let nextInstance = 0;
  function place(kind, color, center, axis, width, height, depth, geometry, mapCategory = kind, identity = {}) {
    if (mapCategory === kind && (kind === "wireDetail" || kind === "fabricEdge")) mapCategory = "fabric";
    const key = [kind, color, geometry, mapCategory].join("/");
    if (!buckets.has(key)) buckets.set(key, { kind, color, geometry, mapCategory, matrices: [], instanceIds: [], componentIds: [] });
    const instanceId = identity.id || `${namespace}:instance:${++nextInstance}`;
    const componentId = identity.component_id || identity.componentId || instanceId;
    transform.position.fromArray(center);
    transform.quaternion.setFromUnitVectors(Y, axis);
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    const bucket = buckets.get(key);
    bucket.matrices.push(transform.matrix.clone());
    bucket.instanceIds.push(instanceId);
    bucket.componentIds.push(componentId);
  }
  return {
    add(kind, color, a, b, diameter, mapCategory = kind, identity = {}) {
      const direction = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const length = direction.length();
      if (length < 1e-7 || !Number.isFinite(length)) return;
      place(kind, color, a.map((value, i) => (value + b[i]) / 2), direction.divideScalar(length), diameter, length, diameter, "cylinder", mapCategory, identity);
    },
    fitting(color, piece) {
      const mapCategory = piece.kind === "barbedWire" ? "barbedWire" : piece.kind;
      const identity = { id: piece.id, component_id: piece.component_id };
      if (piece.a) this.add(piece.kind, color, piece.a, piece.b, piece.diameter, mapCategory, identity);
      else place(piece.kind, color, piece.at, new T.Vector3(...piece.axis), piece.width, piece.height, piece.depth, piece.geometry, mapCategory, identity);
    },
    finish(parent, shapeId) {
      for (const { kind, color, geometry, mapCategory, matrices, instanceIds, componentIds } of buckets.values()) {
        const material = new T.MeshStandardMaterial({ color, metalness: kind === "footings" ? 0 : .6, roughness: kind === "footings" ? .9 : .36 });
        let meshGeometry;
        switch (geometry) {
          case "box": meshGeometry = new T.BoxGeometry(1, 1, 1); break;
          case "ring": meshGeometry = new T.TorusGeometry(.43, .07, 5, 16).rotateX(Math.PI / 2).scale(1, 7, 1); break;
          case "dome": meshGeometry = new T.SphereGeometry(.5, 12, 8); break;
          default: meshGeometry = cylinder(geometry === "hex" ? 6 : kind === "wireDetail" ? 4 : 10);
        }
        const mesh = new T.InstancedMesh(meshGeometry, material, matrices.length);
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.userData = { kind, shapeId, mapCategory, instanceIds, componentIds };
        mesh.name = kind;
        parent.add(mesh);
      }
    },
  };
}

function makeFabric({ spans, spec, target, parts, id, budget, textures, mapCategory = "fabric" }) {
  if (!spans.length) return;
  const height = spec.height * FT, diameter = wireDiameter(spec), opening = spec.mesh * IN;
  const pitch = (opening + diameter) * Math.SQRT2;
  const finish = colorFor(spec, spec.finish);
  const base = spec.elevation * FT + spec.clearance * IN;
  const geometries = { vertices: [], uv: [], indices: [] };
  const textureKey = `${opening}/${diameter}`;
  if (!textures.has(textureKey)) textures.set(textureKey, paintPattern(opening, diameter));
  const detailNodes = [];
  const fabricComponentIds = [];
  const meshComponentIds = [];
  const append = (span, spanIndex) => {
    const spanComponentId = span.component_id || span.id || `${id}:fabric-span:${spanIndex + 1}`;
    const [ax, az] = span.a, [bx, bz] = span.b;
    const spanLength = Math.hypot(bx - ax, bz - az);
    const trimStart = Math.min(span.trimStart || 0, spanLength / 4);
    const trimEnd = Math.min(span.trimEnd || 0, spanLength / 4);
    const length = spanLength - trimStart - trimEnd;
    if (length < 1e-7) return;
    fabricComponentIds.push(spanComponentId);
    const dx = (bx - ax) / spanLength, dz = (bz - az) / spanLength;
    const place = (u, v, depth = 0) => [ax + (u + trimStart) * dx - depth * dz, base + v, az + (u + trimStart) * dz + depth * dx];
    const offset = spec.offset * IN;
    const index = geometries.vertices.length / 3;
    geometries.vertices.push(...place(0, 0, offset), ...place(length, 0, offset), ...place(length, height, offset), ...place(0, height, offset));
    const u0 = ((span.start || 0) + trimStart) / pitch;
    geometries.uv.push(u0, 0, u0 + length / pitch, 0, u0 + length / pitch, height / pitch, u0, height / pitch);
    geometries.indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
    const estimate = 2 * Math.ceil((length + height) / pitch) * Math.ceil(Math.min(length, height) / (pitch / 2));
    if (spec.detail !== "pattern" && estimate < budget.remaining) {
      budget.remaining -= estimate;
      const detailedParts = makeParts(`${spanComponentId}:detail`);
      for (const sign of [-1, 1]) {
        for (let line = Math.floor(-height / pitch); line <= Math.ceil((length + height) / pitch); line++) {
          const intercept = line * pitch - ((span.start || 0) + trimStart) % pitch;
          const v0 = Math.max(0, sign > 0 ? -intercept : intercept - length);
          const v1 = Math.min(height, sign > 0 ? length - intercept : intercept);
          if (v1 - v0 < 1e-7) continue;
          let previous;
          const steps = Math.max(1, Math.ceil((v1 - v0) / (pitch / 2)));
          for (let step = 0; step <= steps; step++) {
            const v = v0 + (v1 - v0) * step / steps;
            const weave = Math.cos((v + sign * pitch / 4) * 2 * Math.PI / pitch) * diameter * .65;
            const point = place(intercept + sign * v, v, offset + weave);
            if (previous) detailedParts.add("wireDetail", finish, previous, point, diameter, mapCategory,
              { component_id: spanComponentId });
            previous = point;
          }
        }
      }
      const detail = new T.Group();
      detail.userData = { id: `${spanComponentId}:wire-detail`, component_id: spanComponentId, kind: "detail", shapeId: id,
        a: new T.Vector3(...place(0, height / 2, offset)), b: new T.Vector3(...place(length, height / 2, offset)), spec };
      detailedParts.finish(detail, id);
      detailNodes.push(detail);
    }
    for (const [edge, selvage] of [[0, spec.bottomSelvage], [height, spec.topSelvage]]) {
      if (selvage === "plain") continue;
      const step = Math.max(pitch, length / Math.max(1, Math.min(1200, budget.selvage / 2)));
      for (let u = pitch / 2; u + pitch / 4 < length; u += step) {
        if (budget.selvage < 2) break;
        budget.selvage -= 2;
        const inward = edge === 0 ? 1 : -1;
        const left = place(u - pitch / 4, edge, offset);
        const right = place(u + pitch / 4, edge, offset);
        if (selvage === "twist") {
          const tip = edge - inward * diameter * 5;
          parts.add("fabricEdge", finish, left, place(u + diameter, tip, offset + diameter), diameter, mapCategory);
          parts.add("fabricEdge", finish, right, place(u - diameter, tip, offset - diameter), diameter, mapCategory);
        } else {
          const tip = place(u, edge + inward * diameter * 2, offset + diameter);
          parts.add("fabricEdge", finish, left, tip, diameter, mapCategory);
          parts.add("fabricEdge", finish, tip, right, diameter, mapCategory);
        }
      }
    }
  };
  // Detailed and flat meshes switch together per span. Without detail, batch
  // all remaining spans of this fabric into one mesh.
  let meshIndex = 0;
  const makeMesh = (data, componentIds = fabricComponentIds) => {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(data.vertices, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(data.uv, 2));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    const material = new T.MeshStandardMaterial({ color: finish, map: textures.get(textureKey), transparent: true,
      alphaTest: .025, depthWrite: false, side: T.DoubleSide, metalness: .4, roughness: .5 });
    const mesh = new T.Mesh(geometry, material);
    mesh.userData = { id: `${componentIds[0] || id}:fabric-mesh:${++meshIndex}`, kind: "fabric", shapeId: id, mapCategory,
      componentIds: [...new Set(componentIds)] };
    return mesh;
  };
  if (spec.detail === "wire" || spec.detail === "auto") {
    for (const [spanIndex, span] of spans.entries()) {
      const previous = detailNodes.length;
      const from = geometries.vertices.length;
      append(span, spanIndex);
      if (detailNodes.length === previous) {
        if (geometries.vertices.length > from) meshComponentIds.push(span.component_id || span.id || `${id}:fabric-span:${spanIndex + 1}`);
        continue;
      }
      const detail = detailNodes.at(-1);
      const flat = makeMesh({ vertices: geometries.vertices.splice(from), uv: geometries.uv.splice(from / 3 * 2), indices: [0, 1, 2, 0, 2, 3] },
        [span.component_id || span.id || `${id}:fabric-span:${spanIndex + 1}`]);
      geometries.indices.splice(-6);
      // Runtime-only pointer. Exported userData must contain serializable
      // metadata rather than a live scene object.
      detail.flatFabric = flat;
      target.add(flat, detail);
    }
  } else {
    spans.forEach(append);
    meshComponentIds.push(...fabricComponentIds);
  }
  if (geometries.indices.length) target.add(makeMesh(geometries, meshComponentIds));
}

function railAcross(parts, spec, key, a, b, diameterA = 0, diameterB = 0, componentId) {
  const height = frameHeight(spec, key);
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  if (length < 1e-7) return;
  const isWire = key.endsWith("Wire");
  const between = !isWire && spec.railConnection === "between";
  const trimA = between ? Math.min(length / 4, diameterA / 2) : 0;
  const trimB = between ? Math.min(length / 4, diameterB / 2) : 0;
  const offset = spec.railOffset * IN;
  const start = [a[0] + (trimA * dx - offset * dz) / length, height, a[1] + (trimA * dz + offset * dx) / length];
  const end = [b[0] + (-trimB * dx - offset * dz) / length, height, b[1] + (-trimB * dz + offset * dx) / length];
  parts.add(isWire ? "wire" : "rails", colorFor(spec, spec.railFinish), start, end,
    (isWire ? spec.wireDiameter : spec.railDiameter) * IN, undefined,
    componentId ? { id: `${componentId}:model`, component_id: componentId } : {});
}

function gateModel(gate, run, target, parts, budget, textures) {
  const { a, b } = gate, spec = run.spec;
  const width = gate.end - gate.start;
  const u = [(b[0] - a[0]) / width, (b[1] - a[1]) / width];
  const height = gate.height * FT, low = spec.elevation * FT + gate.clearance * IN, high = low + height;
  const finish = colorFor(spec, gate.finish);
  for (const [leafIndex, leaf] of gateLeaves(gate, spec).entries()) {
    const { a: hinge, b: tip } = leaf;
    const frame = gate.frame * IN;
    const gateLeafId = `${run.id}:gate:${gate.id}:leaf:${leafIndex + 1}`;
    for (const [memberIndex, position] of [hinge, tip].entries()) parts.add("rails", finish,
      modelPoint(position, low), modelPoint(position, high), frame, undefined,
      { id: `${gateLeafId}:vertical:${memberIndex + 1}`, component_id: `${gateLeafId}:vertical:${memberIndex + 1}` });
    for (const [memberIndex, y] of [low, high].entries()) parts.add("rails", finish,
      modelPoint(hinge, y), modelPoint(tip, y), frame, undefined,
      { id: `${gateLeafId}:horizontal:${memberIndex + 1}`, component_id: `${gateLeafId}:horizontal:${memberIndex + 1}` });
    makeFabric({ target, parts, id: run.id, budget, textures, mapCategory: "gateArea",
      spans: [{ id: `${gateLeafId}:fabric`, a: hinge, b: tip }], spec: {
      ...spec, height: gate.height, clearance: gate.clearance, mesh: gate.mesh, offset: 0,
      finish: gate.finish === "matching" ? spec.finish : gate.finish,
    } });
    if (gate.type === "cantilever") {
      const left = gate.direction === "in", origin = left ? hinge : tip;
      const end = [origin[0] + (left ? -1 : 1) * gate.tail * FT * u[0], origin[1] + (left ? -1 : 1) * gate.tail * FT * u[1]];
      parts.add("rails", finish, modelPoint(origin, low), modelPoint(end, low), frame, undefined,
        { id: `${gateLeafId}:tail:lower`, component_id: `${gateLeafId}:tail:lower` });
      parts.add("rails", finish, modelPoint(origin, high), modelPoint(end, low), frame, undefined,
        { id: `${gateLeafId}:tail:diagonal`, component_id: `${gateLeafId}:tail:diagonal` });

    }
  }
}

export function createFenceScene(layout) {
  const model = new T.Group();
  model.name = "Chain-link fence";
  const textures = new Map();
  const budget = { remaining: MAX_DETAIL_WIRES, selvage: MAX_EXPLICIT_SELVAGE };
  const postsByRun = Map.groupBy(layout.posts, (post) => post.runId);
  const shared = new Map(layout.posts.filter((post) => post.shared).map((post) => [post.shared, post]));
  const renderedPosts = new Set();
  for (const run of layout.runs) {
    const target = new T.Group();
    target.name = run.label;
    target.userData = { shapeId: run.id, component_id: `fence-run:${run.id}` };
    const spec = run.spec;
    const parts = makeParts(`fence-run:${run.id}`);
    const terminals = new Map(run.posts.filter((post) => post.type !== "line" && !post.supportOnly)
      .map((post) => [post.at.toFixed(6), shared.get(post.shared) || post]));
    if (run.closed && terminals.has("0.000000")) terminals.set(run.length.toFixed(6), terminals.get("0.000000"));
    const diameterAt = (at) => terminals.get(at.toFixed(6))?.diameter || 0;
    const fabricTrim = (at) => {
      const diameter = diameterAt(at);
      return diameter && spec.fittings && spec.tensionBars ? diameter / 2 + .032 : 0;
    };
    const fabricSpans = run.spans.map((span) => ({ ...span, trimStart: fabricTrim(span.start), trimEnd: fabricTrim(span.end) }));
    makeFabric({ target, parts, spec, spans: fabricSpans, id: run.id, budget, textures });
    for (const post of postsByRun.get(run.id) || []) {
      const physical = post.shared ? shared.get(post.shared) || post : post;
      const postKey = physical.component_id || `${run.id}:${post.id}`;
      if (renderedPosts.has(postKey)) continue;
      renderedPosts.add(postKey);
      const color = colorFor(physical.spec, physical.spec.postFinish);
      const top = physical.base + physical.height;
      const buried = physical.spec.fittings && physical.spec.footings ? physical.spec.footingDepth * IN : 0;
      const railSeat = physical.type === "line" && spec.topRail && spec.fittings && (spec.loopCaps || (spec.barbedWire && spec.barbArms))
        ? frameHeight(spec, "topRail") - spec.railDiameter * IN * .6 : top;
      parts.add("posts", color, modelPoint(physical.point, physical.base - buried), modelPoint(physical.point, railSeat), physical.diameter,
        `post:${physical.type}`, { id: `${postKey}:model`, component_id: postKey });
    }
    for (const [key] of FRAME_COMPONENTS) {
      if (!spec[key]) continue;
      if (key === "braceRail") {
        for (const [index, [a, b]] of braceSegments(run).entries()) {
          railAcross(parts, spec, key, a, b, 0, 0, `${run.id}:component:${key}:${index + 1}`);
        }
      } else for (const span of run.spans) railAcross(parts, spec, key, span.a, span.b,
        diameterAt(span.start), diameterAt(span.end), `${run.id}:component:${key}:${span.id}`);
    }
    for (const gate of run.gates) gateModel(gate, run, target, parts, budget, textures);
    for (const piece of layout.fittings.partsByRun.get(run.id) || []) {
      const color = piece.kind === "footings" ? "#a09e98" : colorFor(spec, piece.kind === "barbedWire" ? "galvanized" : "matching");
      parts.fitting(color, piece);
    }
    parts.finish(target, run.id);
    model.add(target);
  }
  return model;
}

export function disposeFenceScene(root) {
  const textures = new Set();
  root.traverse((object) => {
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.map) textures.add(material.map);
      material?.dispose();
    }
    if (object.isInstancedMesh) object.dispose();
  });
  for (const texture of textures) texture.dispose();
}
