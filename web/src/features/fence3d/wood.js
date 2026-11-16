import { METERS_PER_FOOT as FT, METERS_PER_INCH as IN, normalizeWoodSpec } from "./settings.js";
import { distance } from "./source.js";

const EPS = 1e-6;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const unit = (a) => { const n = Math.hypot(...a); return n > EPS ? mul(a, 1 / n) : [1, 0]; };
const pointAt = (segment, at) => add(segment.a, mul(unit(sub(segment.b, segment.a)), at));
const uniqueCount = (set) => set.size;

function gateCandidates(run, issues) {
  const candidates = [];
  for (const [index, gate] of (run.gates || []).entries()) {
    const segment = run.segments[(Number(gate.segment) || 1) - 1];
    const localStart = Number(gate.start) * FT;
    const width = Number(gate.width) * FT;
    const localEnd = localStart + width;
    if (!segment || !["single", "double"].includes(gate.type) || !Number.isFinite(localStart)
      || !Number.isFinite(width) || localStart < -EPS || width <= EPS || localEnd > segment.length + EPS) {
      issues.push(`${run.label}: Wood gate ${index + 1} needs a valid single- or double-swing opening on a straight edge.`);
      continue;
    }
    const row = { ...gate, id: gate.id || `${run.id}:wood-gate:${index + 1}`, segment,
      segmentIndex: segment.index, localStart: Math.max(0, localStart), localEnd: Math.min(segment.length, localEnd),
      a: pointAt(segment, localStart), b: pointAt(segment, localEnd), openingLength: width,
      height: Number(gate.height) > 0 ? Number(gate.height) : run.spec.height_ft,
      clearance: Math.max(0, Number(gate.clearance) || 0),
      startOpenDegrees: Math.max(-120, Math.min(120, Number(gate.startOpenDegrees) || 0)),
      endOpenDegrees: Math.max(-120, Math.min(120, Number(gate.endOpenDegrees) || 0)),
    };
    if (candidates.some((other) => other.segmentIndex === row.segmentIndex
      && row.localStart < other.localEnd - EPS && row.localEnd > other.localStart + EPS)) {
      issues.push(`${run.label}: Wood gate ${index + 1} overlaps another gate and was not generated.`);
    } else candidates.push(row);
  }
  return candidates;
}

function makeId(run, identity) { return `wood-post:${run.conditionScopeId}:${identity}`; }

function classifyPost(post) {
  if (post.gate) return "gate";
  const directions = post.incidents.map((item) => item.direction);
  if (directions.length <= 1) return "end";
  if (directions.length >= 5) return "multiway";
  if (directions.length === 3) return "threeway";
  if (directions.length === 4) return "fourway";
  const dot = directions[0][0] * directions[1][0] + directions[0][1] * directions[1][1];
  return dot < -.999 ? "line" : "corner";
}

/** Generate installed Wood components and estimating quantities from the same scaled runs.
 * @param {{ runs?: Array<any>, issues?: Array<string> }} input
 * @returns {any}
 */
export function buildWoodLayout({ runs = [], issues: sourceIssues = [] } = {}) {
  const issues = [...sourceIssues];
  const panels = [], gates = [], posts = new Map(), components = new Map();
  const addComponent = (category, id) => {
    if (!components.has(category)) components.set(category, new Set());
    components.get(category).add(id);
  };
  const getPost = (run, identity, point, gate = false) => {
    const id = makeId(run, identity);
    let post = posts.get(id);
    if (post && distance(post.point, point) > .001) {
      issues.push(`${run.conditionName || run.label}: connected Wood post ${identity} has mismatched coordinates; separate post retained.`);
      return getPost(run, `${identity}:${run.id}`, point, gate);
    }
    if (!post) {
      const spec = run.spec;
      post = { id, component_id: `fence-component:${id}`, point: [...point], base: spec.elevation_ft * FT,
        top: (spec.elevation_ft + spec.height_ft + spec.bottom_clearance_in / 12) * FT,
        fenceHeightFt: spec.height_ft, foundationDepthFt: spec.foundationDepthFt,
        foundationDiameterIn: spec.foundationDiameterIn, footing: spec.footings,
        gravelBeds: spec.gravel_beds, gravelDepthIn: spec.gravel_depth_in,
        width: (gate ? spec.gate_post_size_in : spec.post_size_in) * IN,
        depth: (gate ? spec.gate_post_size_in : spec.post_size_in) * IN,
        type: null, gate, incidents: [], runId: run.id, conditionId: run.conditionId,
        conditionScopeId: run.conditionScopeId, conditionName: run.conditionName, referenceAngle: 0 };
      posts.set(id, post);
    } else if (gate) {
      post.gate = true;
      post.width = post.depth = Math.max(post.width, run.spec.gate_post_size_in * IN);
      post.foundationDiameterIn = Math.max(post.foundationDiameterIn, run.spec.foundationDiameterIn);
      post.foundationDepthFt = Math.max(post.foundationDepthFt, run.spec.foundationDepthFt);
      post.footing ||= run.spec.footings;
      post.gravelBeds ||= run.spec.gravel_beds;
    }
    return post;
  };
  const endpointPost = (run, segment, at, point, gate, side) => {
    const nodeId = at <= EPS ? segment.startPointId : segment.length - at <= EPS ? segment.endPointId : null;
    const identity = nodeId ? `node:${nodeId}` : gate ? `gate:${gate.id}:${side}` : `bay:${segment.id}:${at.toFixed(6)}`;
    return getPost(run, identity, point, Boolean(gate));
  };

  for (const sourceRun of runs) {
    const spec = normalizeWoodSpec(sourceRun.spec);
    const run = { ...sourceRun, spec, gates: sourceRun.gates || [] };
    const runGates = gateCandidates(run, issues);
    const gatesBySegment = new Map();
    for (const gate of runGates) {
      const list = gatesBySegment.get(gate.segmentIndex) || [];
      list.push(gate);
      gatesBySegment.set(gate.segmentIndex, list);
    }
    const boundaries = new Map();
    for (const gate of runGates) {
      boundaries.set(gate.id, {
        start: endpointPost(run, gate.segment, gate.localStart, gate.a, gate, "hinge"),
        end: endpointPost(run, gate.segment, gate.localEnd, gate.b, gate, "latch"),
      });
    }
    for (const segment of run.segments) {
      const segmentGates = (gatesBySegment.get(segment.index) || []).sort((a, b) => a.localStart - b.localStart);
      const intervals = [];
      let cursor = 0;
      for (const gate of segmentGates) {
        if (gate.localStart > cursor + EPS) intervals.push([cursor, gate.localStart]);
        cursor = gate.localEnd;
      }
      if (segment.length > cursor + EPS) intervals.push([cursor, segment.length]);
      for (const [intervalIndex, [start, end]] of intervals.entries()) {
        const span = end - start;
        if (span <= EPS) continue;
        const maxBay = spec.max_bay_span_ft * FT;
        const bayCount = Math.max(1, Math.ceil(span / maxBay - EPS));
        const baySize = spec.spacing_strategy === "balanced" ? span / bayCount : maxBay;
        for (let index = 0; index < bayCount; index++) {
          const from = spec.spacing_strategy === "balanced" ? start + baySize * index : Math.min(end, start + baySize * index);
          const to = index === bayCount - 1 ? end : Math.min(end, from + baySize);
          const a = pointAt(segment, from), b = pointAt(segment, to);
          const startGate = segmentGates.find((gate) => Math.abs(from - gate.localEnd) <= EPS);
          const endGate = segmentGates.find((gate) => Math.abs(to - gate.localStart) <= EPS);
          const startPost = endpointPost(run, segment, from, a, startGate, "latch");
          const endPost = endpointPost(run, segment, to, b, endGate, "hinge");
          const axis = unit(sub(b, a));
          const panelId = `wood-panel:${run.conditionScopeId}:${run.id}:${segment.id}:${intervalIndex + 1}:${index + 1}`;
          const panel = { id: panelId, component_id: `fence-component:${panelId}`, runId: run.id,
            conditionId: run.conditionId, conditionScopeId: run.conditionScopeId, conditionName: run.conditionName,
            segmentId: segment.id, segmentIndex: segment.index, a, b, axis, length: to - from,
            startPostId: startPost.id, endPostId: endPost.id, spec, rails: [], pickets: [], fasteners: [] };
          startPost.incidents.push({ panelId, direction: axis, runId: run.id });
          endPost.incidents.push({ panelId, direction: mul(axis, -1), runId: run.id });
          panels.push(panel);
        }
      }
    }
    for (const gate of runGates) {
      const bound = boundaries.get(gate.id);
      const axis = unit(sub(gate.b, gate.a));
      bound.start.incidents.push({ gateId: gate.id, direction: axis, runId: run.id });
      bound.end.incidents.push({ gateId: gate.id, direction: mul(axis, -1), runId: run.id });
      const leafCount = gate.type === "double" ? 2 : 1;
      const leafLength = Math.max(0, gate.openingLength / leafCount - spec.gate_post_size_in * IN * .45);
      const leaves = Array.from({ length: leafCount }, (_, leafIndex) => {
        const fromEnd = gate.type === "double" ? leafIndex === 1 : gate.hingeSide === "end";
        const hinge = fromEnd ? gate.b : gate.a;
        const direction = mul(axis, fromEnd ? -1 : 1);
        const id = `wood-gate:${run.conditionScopeId}:${gate.id}:leaf:${leafIndex + 1}`;
        const leaf = { id, component_id: `fence-component:${id}`, gateId: gate.id,
          runId: run.id, conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
          leafIndex, hinge, direction, length: leafLength,
          bottom: spec.elevation_ft * FT + gate.clearance * IN,
          height: gate.height * FT, openDegrees: fromEnd ? gate.endOpenDegrees : gate.startOpenDegrees,
          pickets: [], rails: [], fasteners: [] };
        const n = Math.max(1, Math.floor((leafLength + spec.picket_gap_in * IN)
          / ((spec.picket_width_in + spec.picket_gap_in) * IN)));
        const gap = Math.max(0, (leafLength - n * spec.picket_width_in * IN) / (n + 1));
        for (let picketIndex = 0; picketIndex < n; picketIndex++) {
          const at = gap * (picketIndex + 1) + spec.picket_width_in * IN * (picketIndex + .5);
          const picketId = `${id}:picket:${picketIndex + 1}`;
          leaf.pickets.push({ id: picketId, component_id: `fence-component:${picketId}`, at,
            bottom: leaf.bottom, top: leaf.bottom + leaf.height });
          addComponent("wood:pickets", `fence-component:${picketId}`);
          for (let rail = 0; spec.fasteners && rail < spec.rails; rail++) {
            const fastenerId = `${picketId}:fastener:${rail + 1}`;
            leaf.fasteners.push({ id: fastenerId, component_id: `fence-component:${fastenerId}`, at, rail });
            addComponent("wood:fasteners", `fence-component:${fastenerId}`);
          }
        }
        for (let rail = 0; rail < spec.rails; rail++) {
          const railId = `${id}:rail:${rail + 1}`;
          leaf.rails.push({ id: railId, component_id: `fence-component:${railId}`, fraction: spec.rails === 2 ? (rail ? .84 : .16) : [.12, .5, .88][rail] });
          addComponent("wood:rails", `fence-component:${railId}`);
        }
        for (const stileIndex of [0, 1]) {
          const stileId = `${id}:stile:${stileIndex + 1}`;
          addComponent("wood:gateFrame", `fence-component:${stileId}`);
        }
        const braceId = `${id}:compression-brace`;
        addComponent("wood:gateFrame", `fence-component:${braceId}`);
        for (let hingeIndex = 1; hingeIndex <= 2; hingeIndex++) addComponent("wood:gateHinges", `fence-component:${id}:hinge:${hingeIndex}`);
        return leaf;
      });
      const latchId = `wood-gate:${run.conditionScopeId}:${gate.id}:latch`;
      addComponent("wood:gateLatches", `fence-component:${latchId}`);
      if (gate.type === "double") {
        addComponent("wood:gateKeepers", `fence-component:wood-gate:${run.conditionScopeId}:${gate.id}:keeper`);
        addComponent("wood:dropRods", `fence-component:wood-gate:${run.conditionScopeId}:${gate.id}:drop-rod`);
        addComponent("wood:groundReceivers", `fence-component:wood-gate:${run.conditionScopeId}:${gate.id}:ground-receiver`);
      }
      gates.push({ ...gate, runId: run.id, conditionId: run.conditionId, conditionScopeId: run.conditionScopeId,
        conditionName: run.conditionName, posts: [bound.start, bound.end], leaves,
        latchId, keeperId: gate.type === "double" ? `wood-gate:${run.conditionScopeId}:${gate.id}:keeper` : null,
        dropRodId: gate.type === "double" ? `wood-gate:${run.conditionScopeId}:${gate.id}:drop-rod` : null,
        receiverId: gate.type === "double" ? `wood-gate:${run.conditionScopeId}:${gate.id}:ground-receiver` : null });
      addComponent(gate.type === "double" ? "wood:doubleGates" : "wood:singleGates", gate.id);
    }
  }

  for (const post of posts.values()) {
    post.type = classifyPost(post);
    const postSpec = runs.find((run) => run.id === post.runId)?.spec;
    const sizeIn = post.gate ? postSpec?.gate_post_size_in
      : post.type === "line" ? postSpec?.post_size_in : postSpec?.terminal_post_size_in;
    post.width = post.depth = sizeIn * IN;
  }

  const panelsByRun = new Map();
  for (const panel of panels) {
    const run = runs.find((item) => item.id === panel.runId);
    const startPost = posts.get(panel.startPostId), endPost = posts.get(panel.endPostId);
    const insetStart = startPost.width / 2, insetEnd = endPost.width / 2;
    const clearLength = Math.max(0, panel.length - insetStart - insetEnd);
    const railStart = add(panel.a, mul(panel.axis, insetStart));
    const railEnd = add(panel.b, mul(panel.axis, -insetEnd));
    const railLength = distance(railStart, railEnd);
    panel.railStart = railStart; panel.railEnd = railEnd; panel.railLength = railLength;
    const bottom = run.spec.elevation_ft * FT + run.spec.bottom_clearance_in * IN;
    const top = bottom + run.spec.height_ft * FT;
    panel.bottom = bottom; panel.top = top;
    const fractions = run.spec.rails === 2 ? [.16, .84] : [.12, .5, .88];
    for (const [index, fraction] of fractions.entries()) {
      const id = `${panel.id}:rail:${index + 1}`;
      const rail = { id, component_id: `fence-component:${id}`, a: [railStart[0], bottom + run.spec.height_ft * FT * fraction, railStart[1]],
        b: [railEnd[0], bottom + run.spec.height_ft * FT * fraction, railEnd[1]], y: bottom + run.spec.height_ft * FT * fraction,
        length: railLength, fraction, width: run.spec.rail_width_in * IN, depth: run.spec.rail_depth_in * IN };
      panel.rails.push(rail); addComponent("wood:rails", rail.component_id);
    }
    if (run.spec.cap_board) addComponent("wood:capBoards", `${panel.id}:cap-board`);
    if (run.spec.kickboard) addComponent("wood:kickboards", `${panel.id}:kickboard`);
    const picketWidth = run.spec.picket_width_in * IN;
    const picketGap = run.spec.picket_gap_in * IN;
    const picketCount = Math.max(0, Math.floor((clearLength + picketGap) / (picketWidth + picketGap)));
    const actualGap = picketCount ? Math.max(0, (clearLength - picketCount * picketWidth) / (picketCount + 1)) : 0;
    for (let index = 0; index < picketCount; index++) {
      const at = insetStart + actualGap * (index + 1) + picketWidth * (index + .5);
      const id = `${panel.id}:picket:${index + 1}`;
      panel.pickets.push({ id, component_id: `fence-component:${id}`,
        point: add(panel.a, mul(panel.axis, at)), bottom, top, width: picketWidth });
      addComponent("wood:pickets", `fence-component:${id}`);
      if (run.spec.fasteners) for (let rail = 0; rail < run.spec.rails; rail++) {
        const fastenerId = `${id}:fastener:${rail + 1}`;
        panel.fasteners.push({ id: fastenerId, component_id: `fence-component:${fastenerId}`,
          point: add(panel.a, mul(panel.axis, at)), y: panel.rails[rail]?.y ?? bottom, direction: panel.axis });
        addComponent("wood:fasteners", `fence-component:${fastenerId}`);
      }
    }
    addComponent("wood:panels", panel.component_id);
    if (!panelsByRun.has(panel.runId)) panelsByRun.set(panel.runId, []);
    panelsByRun.get(panel.runId).push(panel);
  }

  for (const post of posts.values()) {
    const angles = post.incidents.map((item) => Math.atan2(item.direction[1], item.direction[0]));
    post.referenceAngle = angles[0] || 0;
    if (angles.length >= 2) {
      for (const angle of angles.slice(1)) {
        const quarterTurns = Math.round((angle - post.referenceAngle) / (Math.PI / 2));
        const mismatch = Math.abs(angle - post.referenceAngle - quarterTurns * Math.PI / 2);
        if (mismatch > .025) {
          issues.push(`${post.conditionName}: Wood ${post.type} at ${post.id} is not a right-angle connection; square-post faces may not align.`);
          break;
        }
      }
    }
    addComponent(`wood:post:${post.type}`, post.component_id);
    if (post.footing) addComponent("wood:foundations", `${post.component_id}:foundation`);
    if (post.gravelBeds && post.gravelDepthIn > 0) addComponent("wood:gravelBeds", `${post.component_id}:gravel`);
    const capId = `${post.component_id}:cap`;
    addComponent("wood:postCaps", capId);
  }

  // Convert gate leaf descriptors to world-space axis and retain independent hinges.
  for (const gate of gates) {
    const run = runs.find((item) => item.id === gate.runId);
    const axis = unit(sub(gate.b, gate.a));
    const count = gate.leaves.length;
    for (const leaf of gate.leaves) {
      leaf.rails = leaf.rails.map((rail) => ({ ...rail, y: leaf.bottom + leaf.height * rail.fraction,
        a: [0, leaf.bottom + leaf.height * rail.fraction, 0],
        b: [leaf.length, leaf.bottom + leaf.height * rail.fraction, 0] }));
      leaf.baseAxis = mul(axis, gate.type === "double" ? (leaf.leafIndex === 0 ? 1 : -1)
        : gate.hingeSide === "end" ? -1 : 1);
      leaf.runSpec = run.spec;
      leaf.leafCount = count;
    }
  }

  const countPost = (type) => [...posts.values()].filter((post) => post.type === type).length;
  const fixedLength = panels.reduce((sum, panel) => sum + panel.length, 0);
  const gateLength = gates.reduce((sum, gate) => sum + gate.openingLength, 0);
  const componentIds = Object.fromEntries([...components].map(([category, ids]) => [category, [...ids]]));
  const postTypes = ["line", "end", "corner", "threeway", "fourway", "multiway", "gate"];
  const totals = {
    path: runs.reduce((sum, run) => sum + run.length, 0), fixedLength, gateLength,
    panels: panels.length, rails: uniqueCount(components.get("wood:rails") || new Set()),
    railLength: panels.reduce((sum, panel) => sum + panel.railLength * panel.rails.length, 0)
      + gates.flatMap((gate) => gate.leaves).reduce((sum, leaf) => sum + leaf.length * leaf.rails.length, 0),
    gateFrameLength: gates.flatMap((gate) => gate.leaves)
      .reduce((sum, leaf) => sum + leaf.height * 2 + Math.hypot(leaf.length, leaf.height * .72), 0),
    pickets: uniqueCount(components.get("wood:pickets") || new Set()),
    fasteners: uniqueCount(components.get("wood:fasteners") || new Set()),
    capBoardLength: panels.filter((panel) => panel.spec.cap_board).reduce((sum, panel) => sum + panel.railLength, 0),
    kickboardLength: panels.filter((panel) => panel.spec.kickboard).reduce((sum, panel) => sum + panel.railLength, 0),
    singleGates: gates.filter((gate) => gate.type === "single").length,
    doubleGates: gates.filter((gate) => gate.type === "double").length,
    hinges: gates.reduce((sum, gate) => sum + gate.leaves.length * 2, 0),
    latches: gates.length, keepers: gates.filter((gate) => gate.type === "double").length,
    dropRods: gates.filter((gate) => gate.type === "double").length,
    receivers: gates.filter((gate) => gate.type === "double").length,
  };
  for (const type of postTypes) totals[`post_${type}`] = countPost(type);
  totals.totalPosts = posts.size;
  totals.footingCount = [...posts.values()].filter((post) => post.footing).length;
  totals.gravelCount = [...posts.values()].filter((post) => post.gravelBeds && post.gravelDepthIn > 0).length;
  totals.gravelVolumeYd3 = [...posts.values()].filter((post) => post.gravelBeds && post.gravelDepthIn > 0)
    .reduce((sum, post) => sum + Math.PI * (post.foundationDiameterIn / 24) ** 2 * (post.gravelDepthIn / 12) / 27, 0);
  return { runs: runs.map((run) => ({ ...run, panels: panelsByRun.get(run.id) || [], gates: gates.filter((gate) => gate.runId === run.id),
    posts: [...posts.values()].filter((post) => post.runId === run.id) })), panels, posts: [...posts.values()], gates,
  componentIds, totals, issues: [...new Set(issues)] };
}

const fmtFt = (meters) => `${(meters / FT).toFixed(2)} LF`;
const fmtCount = (value) => `${Number(value || 0).toLocaleString()} count`;
const fmtYards = (value) => `${Number(value || 0).toFixed(2)} yd³`;
export const WOOD_COMPONENT_COLORS = Object.freeze({
  "wood:fixed": "#a66b37", "wood:gateOpenings": "#6f4e37", "wood:panels": "#bb8656",
  "wood:rails": "#8a552b", "wood:pickets": "#c08a55", "wood:capBoards": "#d0a36a",
  "wood:gateFrame": "#8a552b",
  "wood:kickboards": "#93613b", "wood:fasteners": "#535b61", "wood:post:line": "#8b5e3c",
  "wood:post:end": "#725038", "wood:post:corner": "#805638", "wood:post:threeway": "#6e4c35",
  "wood:post:fourway": "#5e4534", "wood:post:multiway": "#4f3c30", "wood:post:gate": "#76502f",
  "wood:postCaps": "#d0a36a", "wood:foundations": "#8d99ae", "wood:gravelBeds": "#b3a27c",
  "wood:gateHinges": "#59636b", "wood:gateLatches": "#59636b", "wood:gateKeepers": "#59636b",
  "wood:dropRods": "#59636b", "wood:groundReceivers": "#59636b", "wood:singleGates": "#a66b37", "wood:doubleGates": "#a66b37",
});
const WOOD_LABELS = Object.freeze({
  "wood:fixed": "Wood fixed fence", "wood:gateOpenings": "Wood gate openings",
  "wood:panels": "Wood bays / panels", "wood:rails": "Wood backer rails",
  "wood:gateFrame": "Wood gate frame and braces",
  "wood:pickets": "Wood pickets", "wood:capBoards": "Wood cap boards", "wood:kickboards": "Wood kickboards",
  "wood:fasteners": "Wood fasteners", "wood:post:line": "Wood line posts", "wood:post:end": "Wood end posts",
  "wood:post:corner": "Wood corner posts", "wood:post:threeway": "Wood 3-way posts",
  "wood:post:fourway": "Wood 4-way posts", "wood:post:multiway": "Wood 5-way+ posts",
  "wood:post:gate": "Wood gate posts", "wood:postCaps": "Wood post caps",
  "wood:foundations": "Wood concrete foundations", "wood:gravelBeds": "Wood gravel beds",
  "wood:gateHinges": "Wood gate hinges", "wood:gateLatches": "Wood gate latches",
  "wood:gateKeepers": "Wood gate keepers", "wood:dropRods": "Wood gate drop rods",
  "wood:groundReceivers": "Wood ground receivers", "wood:singleGates": "Single wood gates", "wood:doubleGates": "Double wood gates",
});

/** Wood-specific installed takeoff quantities, sourced from generated parts. */
export function buildWoodColorMapRows(layout) {
  const t = layout.totals;
  const rows = [
    ["wood:fixed", t.fixedLength, "length"], ["wood:gateOpenings", t.gateLength, "length"],
    ["wood:panels", t.panels, "count"], ["wood:rails", t.railLength, "length"],
    ["wood:gateFrame", t.gateFrameLength, "length"],
    ["wood:pickets", t.pickets, "count"], ["wood:capBoards", t.capBoardLength, "length"],
    ["wood:kickboards", t.kickboardLength, "length"], ["wood:fasteners", t.fasteners, "count"],
    ...["line", "end", "corner", "threeway", "fourway", "multiway", "gate"].map((type) => [`wood:post:${type}`, t[`post_${type}`], "count"]),
    ["wood:postCaps", layout.componentIds["wood:postCaps"]?.length || 0, "count"],
    ["wood:foundations", t.footingCount, "count"], ["wood:gravelBeds", t.gravelCount, "count"],
    ["wood:gateHinges", t.hinges, "count"], ["wood:gateLatches", t.latches, "count"],
    ["wood:gateKeepers", t.keepers, "count"], ["wood:dropRods", t.dropRods, "count"],
    ["wood:groundReceivers", t.receivers, "count"], ["wood:singleGates", t.singleGates, "count"],
    ["wood:doubleGates", t.doubleGates, "count"],
  ];
  const anchorFor = (category) => {
    const post = layout.posts.find((item) => category.startsWith("wood:post:") && item.type === category.slice("wood:post:".length));
    if (post) return [post.point[0], (post.base + post.top) / 2, post.point[1]];
    if (category === "wood:foundations" || category === "wood:gravelBeds") {
      const item = layout.posts.find((post) => post.footing || post.gravelBeds);
      return item ? [item.point[0], item.base - .3, item.point[1]] : null;
    }
    if (category === "wood:pickets") {
      const picket = layout.panels.flatMap((panel) => panel.pickets)[0];
      return picket ? [picket.point[0], (picket.bottom + picket.top) / 2, picket.point[1]] : null;
    }
    const panel = layout.panels[0];
    if (panel) return [(panel.a[0] + panel.b[0]) / 2, (panel.bottom + panel.top) / 2, (panel.a[1] + panel.b[1]) / 2];
    const gate = layout.gates[0];
    return gate ? [(gate.a[0] + gate.b[0]) / 2, gate.leaves[0]?.bottom || 0, (gate.a[1] + gate.b[1]) / 2] : null;
  };
  return rows.map(([category, count, measure]) => ({ id: category, category, title: WOOD_LABELS[category], count,
    measure, quantity: measure === "length" ? fmtFt(count) : fmtCount(count),
    detail: category === "wood:gateOpenings" && count ? `${t.singleGates} single · ${t.doubleGates} double` : undefined,
    componentIds: layout.componentIds[category] || [], color: WOOD_COMPONENT_COLORS[category], anchor: anchorFor(category) }));
}

export function woodMaterialRows(layout) {
  const t = layout.totals;
  const rows = [["wood-fixed-lf", "Wood fixed fence", fmtFt(t.fixedLength)],
    ["wood-gate-openings-lf", "Wood gate openings", fmtFt(t.gateLength)],
    ["wood-panels", "Wood bays / panels", t.panels], ["wood-rails", "Wood backer rails", fmtFt(t.railLength)],
    ["wood-gate-frame", "Wood gate frames and braces", fmtFt(t.gateFrameLength)],
    ["wood-pickets", "Wood pickets", t.pickets], ["wood-cap-board", "Wood cap boards", fmtFt(t.capBoardLength)],
    ["wood-kickboard", "Wood kickboards", fmtFt(t.kickboardLength)], ["wood-fasteners", "Wood fasteners", t.fasteners],
    ...[["line", "Line"], ["end", "End"], ["corner", "Corner"], ["threeway", "3-way"], ["fourway", "4-way"], ["gate", "Gate"]]
      .map(([type, label]) => [`wood-post-${type}`, `Wood ${label.toLowerCase()} posts`, t[`post_${type}`]]),
    ["wood-post-caps", "Wood post caps", layout.componentIds["wood:postCaps"]?.length || 0],
    ["wood-single-gates", "Wood single swing gates", t.singleGates], ["wood-double-gates", "Wood double swing gates", t.doubleGates],
    ["wood-hinges", "Wood gate hinge sets", t.hinges], ["wood-latches", "Wood gate latches", t.latches],
    ["wood-keepers", "Wood gate keepers", t.keepers], ["wood-drop-rods", "Wood gate drop rods", t.dropRods],
    ["wood-ground-receivers", "Wood ground receivers", t.receivers],
    ["wood-concrete", "Wood concrete foundations", fmtYards([...layout.posts].filter((post) => post.footing)
      .reduce((sum, post) => sum + Math.PI * (post.foundationDiameterIn / 24) ** 2 * post.foundationDepthFt / 27, 0))],
    ["wood-gravel", "Wood gravel beds", fmtYards(t.gravelVolumeYd3)],
  ];
  return rows;
}
