import { METERS_PER_FOOT as FT, METERS_PER_INCH as IN } from "./settings.js";
import { distance } from "./source.js";

const EPS = 1e-6;
const TWO_PI = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const scale = (point, amount) => [point[0] * amount, point[1] * amount];
const unit = (point) => {
  const length = Math.hypot(...point);
  return length > EPS ? scale(point, 1 / length) : [1, 0];
};
const pointAt = (segment, at) => add(segment.a, scale(unit(sub(segment.b, segment.a)), at));
const normalizedAngle = (angle) => ((angle % TWO_PI) + TWO_PI) % TWO_PI;
const angleGap = (a, b) => Math.abs(((a - b + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI);

function bestPostAxis(incidents) {
  const candidates = incidents.map((incident) => Math.atan2(incident.direction[1], incident.direction[0]));
  return candidates.reduce((best, candidate) => {
    const score = candidates.reduce((sum, angle) => {
      const delta = normalizedAngle(angle - candidate);
      return sum + Math.min(delta % (Math.PI / 2), Math.PI / 2 - delta % (Math.PI / 2));
    }, 0);
    return !best || score < best.score - 1e-8 ? { angle: candidate, score } : best;
  }, null)?.angle || 0;
}

function makePostId(run, identity) {
  return `ornamental-post:${run.conditionScopeId}:${identity}`;
}

function gateCandidates(run, issues) {
  const candidates = [];
  for (const [index, gate] of run.gates.entries()) {
    const segment = run.segments[(gate.segment || 1) - 1];
    const start = Number(gate.start) * FT;
    const width = Number(gate.width) * FT;
    const end = start + width;
    const invalidType = !["single", "double", "overhead"].includes(gate.type);
    if (!segment || invalidType || !Number.isFinite(start) || !Number.isFinite(width) || start < -EPS
      || width <= EPS || end > segment.length + EPS) {
      issues.push(`${run.label}: gate ${index + 1} needs a valid straight segment and a supported swing or top-rolling opening.`);
      continue;
    }
    const row = { ...gate, id: gate.id || `${run.id}:gate:${index + 1}`, segment, segmentIndex: segment.index,
      localStart: clamp(start, 0, segment.length), localEnd: clamp(end, 0, segment.length),
      start: segment.start + start, end: segment.start + end,
      a: pointAt(segment, start), b: pointAt(segment, end),
      height: Number(gate.height) > 0 ? gate.height : run.spec.height_ft,
      clearance: Math.max(0, Number(gate.clearance) || 0),
      startOpenDegrees: clamp(Number(gate.startOpenDegrees) || 0, -120, 120),
      endOpenDegrees: clamp(Number(gate.endOpenDegrees) || 0, -120, 120),
    };
    const overlapping = candidates.some((other) => other.segmentIndex === row.segmentIndex
      && row.localStart < other.localEnd - EPS && row.localEnd > other.localStart + EPS);
    if (overlapping) issues.push(`${run.label}: gate ${index + 1} overlaps another opening and was not generated.`);
    else candidates.push(row);
  }
  return candidates;
}

function addPanelRun(run, gates, panels, posts, issues, componentIds) {
  const { spec } = run;
  const maxSpan = spec.max_panel_span_ft * FT;
  const base = spec.elevation_ft * FT;
  const postWidth = spec.post_size_in * IN;
  const gateBySegment = new Map();
  for (const gate of gates) {
    const list = gateBySegment.get(gate.segmentIndex) || [];
    list.push(gate);
    gateBySegment.set(gate.segmentIndex, list);
  }
  const postRows = posts;
  const getPost = (identity, point, forcedType = null) => {
    let id = makePostId(run, identity);
    let post = postRows.get(id);
    if (post && distance(post.point, point) > .001) {
      issues.push(`${run.label}: connected point ${identity} has mismatched coordinates. The posts remain separate.`);
      id = makePostId(run, `${identity}:${run.id}`);
      post = null;
    }
    if (!post) {
      post = { id, component_id: `fence-component:${id}`, point: [...point], base,
        top: base + (spec.height_ft + spec.bottom_clearance_in / 12) * FT,
        fenceHeightFt: spec.height_ft,
        foundationDepthFt: spec.foundationDepthFt, foundationDiameterIn: spec.foundationDiameterIn,
        type: forcedType || null, conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
        conditionName: run.conditionName, runId: run.id, incidents: [], referenceAngle: 0,
        width: postWidth, depth: postWidth };
      postRows.set(id, post);
    } else if (forcedType === "gate") post.type = "gate";
    return post;
  };
  const endpointIdentity = (segment, at) => {
    if (at <= EPS) return `node:${segment.startPointId}`;
    if (segment.length - at <= EPS) return `node:${segment.endPointId}`;
    return null;
  };
  const endpointPost = (segment, at, point, gate, gateSide) => {
    const node = endpointIdentity(segment, at);
    if (node) return getPost(node, point, gate ? "gate" : null);
    if (gate) return getPost(`gate:${gate.id}:${gateSide}`, point, "gate");
    return getPost(`bay:${segment.id}:${at.toFixed(6)}`, point);
  };
  const addIncident = (post, panel, direction) => {
    post.incidents.push({ panelId: panel.id, direction: unit(direction), runId: run.id });
  };
  const addPanels = (segment, start, end, gatesAtSegment) => {
    const span = end - start;
    if (span <= EPS) return;
    const panelCount = Math.max(1, Math.ceil(span / maxSpan - EPS));
    const symmetric = spec.strategy === "even";
    const panelLength = symmetric ? span / panelCount : maxSpan;
    for (let index = 0; index < panelCount; index++) {
      const from = symmetric ? start + panelLength * index : Math.min(end, start + panelLength * index);
      const to = index === panelCount - 1 ? end : Math.min(end, start + panelLength * (index + 1));
      const a = pointAt(segment, from), b = pointAt(segment, to);
      const startGate = gatesAtSegment.find((gate) => Math.abs(from - gate.localEnd) <= EPS);
      const endGate = gatesAtSegment.find((gate) => Math.abs(to - gate.localStart) <= EPS);
      const startPost = endpointPost(segment, from, a, startGate, "latch");
      const endPost = endpointPost(segment, to, b, endGate, "hinge");
      const panelId = `ornamental-panel:${run.conditionScopeId}:${run.id}:${segment.id}:${index + 1}`;
      const delta = sub(b, a);
      const length = Math.hypot(...delta);
      const axis = unit(delta);
      const bottom = base + spec.bottom_clearance_in * IN;
      const railCount = spec.rails;
      const railHeightFractions = railCount === 2 ? [.12, .88] : [.1, .5, .9];
      const lower = bottom + spec.height_ft * FT * railHeightFractions[0];
      const upper = bottom + spec.height_ft * FT * railHeightFractions.at(-1);
      const clear = Math.max(0, length - postWidth);
      const picketCount = Math.max(0, Math.ceil(clear / (spec.picket_spacing_in * IN) - EPS) - 1);
      const pickets = Array.from({ length: picketCount }, (_, picketIndex) => {
        const spacing = clear / (picketCount + 1);
        const at = postWidth / 2 + spacing * (picketIndex + 1);
        const point = add(a, scale(axis, at));
        const id = `${panelId}:picket:${picketIndex + 1}`;
        const component_id = `fence-component:${id}`;
        componentIds.pickets.add(component_id);
        return { id, component_id, point, bottom: lower + spec.rail_depth_in * IN / 2,
          top: upper - spec.rail_depth_in * IN / 2, width: spec.picket_size_in * IN,
          conditionId: run.conditionId, conditionScopeId: run.conditionScopeId, runId: run.id, panelId };
      });
      const panel = { id: panelId, component_id: `fence-component:${panelId}`, conditionId: run.conditionId,
        conditionScopeId: run.conditionScopeId, conditionName: run.conditionName, runId: run.id,
        segmentIndex: segment.index, segmentId: segment.id, a, b, length, axis,
        startPostId: startPost.id, endPostId: endPost.id, base, bottom, top: bottom + spec.height_ft * FT,
        railCount, railHeightFractions, railWidth: spec.rail_width_in * IN, railDepth: spec.rail_depth_in * IN,
        pickets, spec };
      panels.push(panel);
      addIncident(startPost, panel, axis);
      addIncident(endPost, panel, scale(axis, -1));
      for (let railIndex = 0; railIndex < railCount; railIndex++) {
        const y = bottom + spec.height_ft * FT * railHeightFractions[railIndex];
        const railId = `${panelId}:rail:${railIndex + 1}`;
        const rail = { id: railId, component_id: `fence-component:${railId}`, panelId, runId: run.id,
          conditionId: run.conditionId, conditionScopeId: run.conditionScopeId, a: [...a, y], b: [...b, y], y,
          width: spec.rail_width_in * IN, depth: spec.rail_depth_in * IN };
        panel[`rail${railIndex + 1}`] = rail;
        componentIds.rails.add(rail.component_id);
      }
    }
  };

  const gatePosts = new Map();
  for (const gate of gates) {
    const segment = gate.segment;
    const startPost = endpointPost(segment, gate.localStart, gate.a, gate, "hinge");
    const endPost = endpointPost(segment, gate.localEnd, gate.b, gate, "latch");
    gatePosts.set(gate.id, { startPost, endPost });
  }

  for (const segment of run.segments) {
    const segmentGates = (gateBySegment.get(segment.index) || []).sort((a, b) => a.localStart - b.localStart);
    let cursor = 0;
    for (const gate of segmentGates) {
      addPanels(segment, cursor, gate.localStart, segmentGates);
      cursor = gate.localEnd;
    }
    addPanels(segment, cursor, segment.length, segmentGates);
  }

  const resolvedGates = gates.map((gate) => {
    const boundaries = gatePosts.get(gate.id);
    const spec = run.spec;
    const axis = unit(sub(gate.b, gate.a));
    const count = gate.type === "double" ? 2 : 1;
    const leafDescriptors = [];
    for (let index = 0; index < count; index++) {
      const right = gate.type === "double" ? index === 1 : gate.hingeSide === "end";
      const hingePoint = right ? gate.b : gate.a;
      const hingePost = right ? boundaries.endPost : boundaries.startPost;
      const direction = scale(axis, right ? -1 : 1);
      const leafLength = Math.max(0, (gate.localEnd - gate.localStart) / count - spec.post_size_in * IN * .6);
      const hinge = add(hingePoint, scale(direction, spec.post_size_in * IN * .48));
      const tip = add(hinge, scale(direction, leafLength));
      const openDegrees = right ? gate.endOpenDegrees : gate.startOpenDegrees;
      const leafId = `ornamental-gate:${run.conditionScopeId}:${gate.id}:leaf:${index + 1}`;
      const bottom = spec.elevation_ft * FT + gate.clearance * IN;
      const top = bottom + gate.height * FT;
      const gatePickets = Math.max(0, Math.ceil(Math.max(0, leafLength - spec.rail_width_in * IN)
        / (spec.picket_spacing_in * IN) - EPS) - 1);
      const pickets = Array.from({ length: gatePickets }, (_, picketIndex) => {
        const at = (leafLength / (gatePickets + 1)) * (picketIndex + 1);
        const point = add(hinge, scale(direction, at));
        const id = `${leafId}:picket:${picketIndex + 1}`;
        const component_id = `fence-component:${id}`;
        componentIds.pickets.add(component_id);
        return { id, component_id, point, direction, bottom: bottom + gate.height * FT * .12 + spec.rail_depth_in * IN / 2,
          top: top - gate.height * FT * .12 - spec.rail_depth_in * IN / 2, width: spec.picket_size_in * IN,
          conditionId: run.conditionId, conditionScopeId: run.conditionScopeId, runId: run.id, gateId: gate.id };
      });
      const railLength = leafLength * spec.rails;
      const stileLength = gate.height * FT * 2;
      for (let railIndex = 0; railIndex < spec.rails; railIndex++) componentIds.rails.add(`fence-component:${leafId}:rail:${railIndex + 1}`);
      for (let stileIndex = 0; stileIndex < 2; stileIndex++) componentIds.gateFrame.add(`fence-component:${leafId}:stile:${stileIndex + 1}`);
      const hardwareId = `${leafId}:hinge-set`;
      leafDescriptors.push({ id: leafId, component_id: `fence-component:${leafId}`, conditionId: run.conditionId,
        conditionScopeId: run.conditionScopeId, conditionName: run.conditionName, runId: run.id, gateId: gate.id,
        gateType: gate.type, leafIndex: index, hingePostId: hingePost.id, hinge, tip, direction, leafLength,
        bottom, top, railCount: spec.rails, railWidth: spec.rail_width_in * IN, railDepth: spec.rail_depth_in * IN,
        picketWidth: spec.picket_size_in * IN, pickets, openDegrees, hingeSetId: hardwareId,
        railLength, stileLength, spec });
      if (gate.type !== "overhead") componentIds.ornamentalHinges.add(`fence-component:${hardwareId}`);
    }
    const latchId = `ornamental-gate:${run.conditionScopeId}:${gate.id}:latch`;
    componentIds.ornamentalLatches.add(`fence-component:${latchId}`);
    if (gate.type === "overhead") {
      componentIds.gateRollers.add(`fence-component:ornamental-gate:${run.conditionScopeId}:${gate.id}:track`);
      componentIds.gateRollers.add(`fence-component:ornamental-gate:${run.conditionScopeId}:${gate.id}:roller:1`);
      componentIds.gateRollers.add(`fence-component:ornamental-gate:${run.conditionScopeId}:${gate.id}:roller:2`);
    }
    if (gate.type === "double") componentIds.ornamentalKeepers.add(`fence-component:ornamental-gate:${run.conditionScopeId}:${gate.id}:keeper`);
    if (gate.type === "double") componentIds.ornamentalDropRods.add(`fence-component:ornamental-gate:${run.conditionScopeId}:${gate.id}:drop-rod`);
    return { ...gate, runId: run.id, conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
      conditionName: run.conditionName, posts: [boundaries.startPost, boundaries.endPost], leaves: leafDescriptors,
      latchId, keeperId: gate.type === "double" ? `ornamental-gate:${run.conditionScopeId}:${gate.id}:keeper` : null,
      dropRodId: gate.type === "double" ? `ornamental-gate:${run.conditionScopeId}:${gate.id}:drop-rod` : null,
      openingLength: gate.end - gate.start };
  });
  return { posts: [...postRows.values()].filter((post) => post.incidents.some((incident) => incident.runId === run.id)), gates: resolvedGates };
}

function classifyPostsAndBrackets(panels, posts, issues, componentIds) {
  for (const post of posts.values()) {
    post.referenceAngle = bestPostAxis(post.incidents);
    const vectors = post.incidents.map((item) => item.direction);
    if (!post.type) {
      if (vectors.length >= 3) post.type = "junction";
      else if (vectors.length === 1) post.type = "end";
      else if (vectors.length === 2) post.type = angleGap(Math.atan2(vectors[0][1], vectors[0][0]),
        Math.atan2(vectors[1][1], vectors[1][0])) < Math.PI - .04 ? "corner" : "panel";
      else post.type = "end";
    }
    componentIds[`post:${post.type}`].add(post.component_id);
    const usedFaces = new Map();
    for (const incident of post.incidents) {
      const angle = normalizedAngle(Math.atan2(incident.direction[1], incident.direction[0]) - post.referenceAngle);
      const face = Math.round(angle / (Math.PI / 2)) % 4;
      const previous = usedFaces.get(face);
      if (previous && angleGap(previous.angle, angle) > .04) {
        issues.push(`${post.conditionName}: branch directions compete for the same square-post face at ${post.id}.`);
      } else usedFaces.set(face, { angle, runId: incident.runId });
    }
  }
  for (const panel of panels) {
    panel.brackets = [];
    const spec = panel.spec;
    for (const [side, postId, direction] of [["start", panel.startPostId, panel.axis], ["end", panel.endPostId, scale(panel.axis, -1)]]) {
      const post = posts.get(postId);
      if (!post) continue;
      const classification = classifyOrnamentalBracket(post, direction, spec.max_swivel_deg);
      if (classification.exceedsRange) {
        issues.push(`${panel.conditionName}: ${classification.swivelDegrees.toFixed(1)}° rail attachment at ${post.id} exceeds the configured ${spec.max_swivel_deg}° swivel range.`);
      }
      const point2 = post.point;
      for (let railIndex = 0; railIndex < panel.railCount; railIndex++) {
        const rail = panel[`rail${railIndex + 1}`];
        const id = `${panel.id}:bracket:${side}:${railIndex + 1}`;
        const bracket = { id, component_id: `fence-component:${id}`, kind: classification.kind, postId: post.id,
          panelId: panel.id, runId: panel.runId, conditionId: panel.conditionId, conditionScopeId: panel.conditionScopeId,
          point: [point2[0] + direction[0] * post.width * .34, rail.y, point2[1] + direction[1] * post.depth * .34],
          axis: direction, swivelDegrees: classification.swivelDegrees, face: classification.face,
          width: .11, height: .035, depth: .045 };
        panel.brackets.push(bracket);
        componentIds[classification.kind].add(bracket.component_id);
      }
    }
  }
}

export function buildOrnamentalLayout(source) {
  const issues = [...(source.issues || [])];
  const panels = [];
  const posts = new Map();
  const componentIds = {
    rails: new Set(), gateFrame: new Set(), gateRollers: new Set(), pickets: new Set(), flatBrackets: new Set(), swivelBrackets: new Set(),
    "post:panel": new Set(), "post:end": new Set(), "post:corner": new Set(), "post:junction": new Set(), "post:gate": new Set(),
    ornamentalHinges: new Set(), ornamentalLatches: new Set(), ornamentalKeepers: new Set(), ornamentalDropRods: new Set(), ornamentalCaps: new Set(),
  };
  const runs = [];
  const allGates = [];
  for (const sourceRun of source.runs || []) {
    const runIssuesBefore = issues.length;
    const gates = gateCandidates(sourceRun, issues);
    const generated = addPanelRun(sourceRun, gates, panels, posts, issues, componentIds);
    runs.push({ ...sourceRun, panels: panels.filter((panel) => panel.runId === sourceRun.id), posts: generated.posts, gates: generated.gates });
    allGates.push(...generated.gates);
    if (issues.length > runIssuesBefore && sourceRun.segments.length === 0) continue;
  }
  classifyPostsAndBrackets(panels, posts, issues, componentIds);
  for (const post of posts.values()) {
    componentIds.ornamentalCaps.add(`fence-component:${post.id}:cap`);
  }
  const countType = (type) => [...posts.values()].filter((post) => post.type === type).length;
  const fixedLength = panels.reduce((sum, panel) => sum + panel.length, 0);
  const gateLength = allGates.reduce((sum, gate) => sum + gate.openingLength, 0);
  const fixedRailLength = panels.reduce((sum, panel) => sum + panel.length * panel.railCount, 0);
  const gateRailLength = allGates.flatMap((gate) => gate.leaves).reduce((sum, leaf) => sum + leaf.railLength, 0);
  const gateFrameLength = allGates.flatMap((gate) => gate.leaves).reduce((sum, leaf) => sum + leaf.stileLength, 0);
  const totalPickets = componentIds.pickets.size;
  const totals = {
    path: runs.reduce((sum, run) => sum + run.length, 0), installedLength: fixedLength, gateOpenings: gateLength,
    panels: panels.length, rails: fixedRailLength + gateRailLength, fixedRailLength, gateRailLength, gateFrameLength,
    pickets: totalPickets, fixedPickets: panels.reduce((sum, panel) => sum + panel.pickets.length, 0),
    gatePickets: allGates.flatMap((gate) => gate.leaves).reduce((sum, leaf) => sum + leaf.pickets.length, 0),
    panelPosts: countType("panel"), end: countType("end"), corner: countType("corner"), junction: countType("junction"), gate: countType("gate"),
    flatBrackets: componentIds.flatBrackets.size, swivelBrackets: componentIds.swivelBrackets.size,
    singleGates: allGates.filter((gate) => gate.type === "single").length,
    doubleGates: allGates.filter((gate) => gate.type === "double").length,
    topRollingGates: allGates.filter((gate) => gate.type === "overhead").length,
    hinges: componentIds.ornamentalHinges.size, latches: componentIds.ornamentalLatches.size,
    keepers: componentIds.ornamentalKeepers.size, dropRods: componentIds.ornamentalDropRods.size,
    caps: componentIds.ornamentalCaps.size,
  };
  return { runs, panels, posts: [...posts.values()], gates: allGates, componentIds: Object.fromEntries(Object.entries(componentIds)
    .map(([category, ids]) => [category, [...ids]])), totals, issues: [...new Set(issues)] };
}

export function classifyOrnamentalBracket(post, direction, maxSwivelDegrees) {
  const angle = Math.atan2(direction[1], direction[0]);
  const relative = normalizedAngle(angle - post.referenceAngle);
  const remainder = relative % (Math.PI / 2);
  const swivelDegrees = Math.min(remainder, Math.PI / 2 - remainder) * 180 / Math.PI;
  return { kind: swivelDegrees <= 1 ? "flatBrackets" : "swivelBrackets", swivelDegrees,
    exceedsRange: swivelDegrees > maxSwivelDegrees + .01, face: Math.round(relative / (Math.PI / 2)) % 4 };
}
