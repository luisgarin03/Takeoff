import * as T from "three";
import { METERS_PER_FOOT as FT, METERS_PER_INCH as IN } from "./settings.js";

const BEAM_PROFILE = Object.freeze([
  [0, -.155], [.05, -.115], [.07, -.07], [0, 0], [.07, .07], [.05, .115], [0, .155],
]);
const RAIL_HEIGHT = .66;
const STEEL = "#9aa8af";
const TERMINAL_YELLOW = "#f0c43c";
const EPS = 1e-7;

function direction(a, b) {
  const x = b.point[0] - a.point[0], z = b.point[1] - a.point[1];
  const length = Math.hypot(x, z);
  return length > EPS ? [x / length, z / length] : [1, 0];
}

function sideAt(points, index, closed) {
  const last = points.length - 1;
  const normalizedIndex = closed && index === last ? 0 : index;
  const previousIndex = normalizedIndex > 0 ? normalizedIndex - 1 : closed ? last - 1 : 0;
  const nextIndex = normalizedIndex < last ? normalizedIndex + 1 : closed ? 1 : last;
  const incoming = previousIndex === normalizedIndex ? null : direction(points[previousIndex], points[normalizedIndex]);
  const outgoing = nextIndex === normalizedIndex ? null : direction(points[normalizedIndex], points[nextIndex]);
  if (!incoming) return [-outgoing[1], outgoing[0], 1];
  if (!outgoing) return [-incoming[1], incoming[0], 1];
  const inSide = [-incoming[1], incoming[0]], outSide = [-outgoing[1], outgoing[0]];
  let x = inSide[0] + outSide[0], z = inSide[1] + outSide[1];
  const size = Math.hypot(x, z);
  if (size < EPS) return [outSide[0], outSide[1], 1];
  x /= size; z /= size;
  const dot = Math.max(.25, Math.abs(x * outSide[0] + z * outSide[1]));
  return [x, z, Math.min(4, 1 / dot)];
}

function beamGeometry(route) {
  const positions = [];
  const indices = [];
  for (let index = 0; index < route.points.length; index++) {
    const point = route.points[index];
    const [nx, nz, miter] = sideAt(route.points, index, route.closed);
    for (const [lateral, vertical] of BEAM_PROFILE) {
      positions.push(point.point[0] + nx * lateral * miter,
        point.elevationM + RAIL_HEIGHT + vertical,
        point.point[1] + nz * lateral * miter);
    }
  }
  const profileCount = BEAM_PROFILE.length;
  for (let index = 0; index < route.points.length - 1; index++) {
    for (let profile = 0; profile < profileCount - 1; profile++) {
      const a = index * profileCount + profile;
      const b = a + 1;
      const c = a + profileCount;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function setComponentData(object, route, kind, id, componentId, mapCategory = "guardrail") {
  object.userData = { kind, mapCategory, shapeId: route.sourceRunIds[0],
    conditionId: route.conditionId, conditionScopeId: route.conditionScopeId,
    id, component_id: componentId, componentIds: [componentId] };
}

function supportMesh(route, support) {
  const [tx, tz] = support.tangent;
  const nx = -tz, nz = tx;
  const depth = support.foundationDepthFt * FT;
  const mesh = new T.Mesh(new T.BoxGeometry(.12, .72 + depth, .12),
    new T.MeshStandardMaterial({ color: STEEL, metalness: .72, roughness: .32 }));
  mesh.position.set(support.point[0] - nx * .11, support.point[1] + (.72 - depth) / 2, support.point[2] - nz * .11);
  mesh.rotation.y = -Math.atan2(tz, tx);
  mesh.name = `Guardrail support ${support.stationFt.toFixed(2)} ft`;
  setComponentData(mesh, route, "guardrailSupport", support.id, support.component_id);
  return mesh;
}

function foundationMesh(route, support) {
  const depth = support.foundationDepthFt * FT;
  const diameter = support.foundationDiameterIn * IN;
  const mesh = new T.Mesh(new T.CylinderGeometry(diameter / 2, diameter / 2, depth, 12),
    new T.MeshStandardMaterial({ color: "#a09e98", metalness: 0, roughness: .92 }));
  mesh.position.set(support.point[0], support.point[1] - depth / 2, support.point[2]);
  mesh.name = `Guardrail concrete foundation ${support.id}`;
  setComponentData(mesh, route, "foundations", `${support.id}:foundation`, `${support.component_id}:foundation`, "foundations");
  return mesh;
}

function terminalMesh(route, terminal) {
  const [tx, tz] = terminal.tangent;
  const nx = -tz, nz = tx;
  const mesh = new T.Mesh(new T.BoxGeometry(.2, .34, .2),
    new T.MeshStandardMaterial({ color: TERMINAL_YELLOW, metalness: .22, roughness: .48 }));
  mesh.position.set(terminal.point[0] + nx * .025, terminal.point[2] + RAIL_HEIGHT + .025, terminal.point[1] + nz * .025);
  mesh.rotation.y = -Math.atan2(tz, tx);
  mesh.name = `Guardrail ${terminal.end} end marker`;
  setComponentData(mesh, route, "guardrailTerminalMarker", terminal.id, terminal.component_id);
  return mesh;
}

/** Procedural low-poly W-beam sweep with 6 ft support stationing. */
export function createGuardrailScene(layout) {
  const root = new T.Group();
  root.name = "Procedural W-beam guardrail";
  const conditions = new Map();
  for (const route of layout.routes) {
    let condition = conditions.get(route.conditionScopeId || route.conditionId || "unassigned");
    if (!condition) {
      condition = new T.Group();
      condition.name = `Guardrail condition: ${route.conditionName || route.conditionId || "Unassigned"}`;
      condition.userData = { kind: "condition", conditionId: route.conditionId, conditionScopeId: route.conditionScopeId };
      conditions.set(route.conditionScopeId || route.conditionId || "unassigned", condition);
      root.add(condition);
    }
    const group = new T.Group();
    group.name = route.sourceRunIds.join(" + ");
    group.userData = { kind: "guardrailRoute",
      conditionId: route.conditionId, conditionScopeId: route.conditionScopeId, shapeId: route.sourceRunIds[0] };
    condition.add(group);

    const beam = new T.Mesh(beamGeometry(route), new T.MeshStandardMaterial({ color: STEEL,
      metalness: .78, roughness: .3, side: T.DoubleSide }));
    beam.name = "W-beam rail";
    setComponentData(beam, route, "guardrail", route.beamId, route.beamComponentId);
    group.add(beam);
    for (const support of route.supports) {
      group.add(foundationMesh(route, support));
      group.add(supportMesh(route, support));
    }
    for (const terminal of route.terminals) group.add(terminalMesh(route, terminal));
  }
  return root;
}
