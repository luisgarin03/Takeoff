import { FITTINGS, FRAME_COMPONENTS, METERS_PER_FOOT as FT, METERS_PER_INCH as IN } from "./settings.js";
import { braceSegments } from "./layout.js";

const EPS = 1e-6;
const Y = [0, 1, 0];
const atHeight = ([x, z], y) => [x, y, z];
const advance = (point, axis, length) => point.map((value, i) => value + axis[i] * length);
const direction = (a, b) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / length, 0, (b[1] - a[1]) / length];
};
const normal = ([x, , z]) => [-z, 0, x];
const minus = (axis) => axis.map((n) => -n);
export const frameHeight = (spec, member) => (spec.elevation + spec.height * spec[member + "Height"] / 100) * FT + spec.clearance * IN;
export const barbBase = (spec) => spec.topRail ? frameHeight(spec, "topRail") : (spec.elevation + spec.height) * FT + spec.clearance * IN;
const enabled = (spec, kind) => spec.fittings && spec[kind];

export function tensionBandHeights(lengthFt, spacingIn = 12, minimum = 0) {
  const interval = spacingIn / 12;
  const count = Math.max(Math.round(minimum), Math.ceil(lengthFt / interval - EPS) - 1);
  return Array.from({ length: count }, (_, i) => Math.min(interval, lengthFt / (count + 1)) * (i + 1) * FT);
}

export function gateLeaves(gate, spec) {
  const { a, b } = gate;
  const width = gate.end - gate.start;
  const axis = direction(a, b);
  const slide = gate.direction === "in" ? -1 : 1;
  const count = gate.type === "double" ? 2 : 1;
  return Array.from({ length: count }, (_, i) => {
    const right = i === 1 || (gate.type === "single" && gate.hingeSide === "end");
    const sign = right ? -1 : 1;
    const pin = right ? b : a;
    const swing = gate.opening / 100 * (Math.PI / 2) * (gate.direction === "out" ? -1 : 1) * sign;
    let heading = [(axis[0] * Math.cos(swing) - axis[2] * Math.sin(swing)) * sign, 0,
      (axis[0] * Math.sin(swing) + axis[2] * Math.cos(swing)) * sign];
    const frame = gate.frame * IN;
    let start = advance(atHeight(pin, 0), heading, Math.min(width / count / 6, spec.gateDiameter * IN / 2 + frame / 2));
    let leafLength = width / count - (spec.gateDiameter * IN + frame) / count;
    if (gate.type === "cantilever") {
      heading = axis;
      start = advance(advance(atHeight(a, 0), axis, slide * width * gate.opening / 100), normal(axis), spec.gateDiameter * IN / 2 + frame * .7);
      leafLength = width;
    }
    const end = advance(start, heading, Math.max(leafLength, width / count / 3));
    return { hinge: pin, a: [start[0], start[2]], b: [end[0], end[2]], heading };
  });
}

function memberAt(segments, at) {
  const segment = segments.find((row) => row.start + row.length >= at - EPS) || segments.at(-1);
  const axis = direction(segment.a, segment.b);
  const point = advance(atHeight(segment.a, 0), axis, Math.max(0, Math.min(segment.length, at - segment.start)));
  return { point, axis };
}

function runSections(run) {
  const ends = new Set(run.posts.filter((post) => post.type !== "line" && !post.supportOnly).map((post) => post.at.toFixed(6)));
  const sections = [];
  for (const span of run.spans) {
    const previous = sections.at(-1);
    if (previous && Math.abs(previous.end - span.start) < EPS && !ends.has(span.start.toFixed(6))) previous.end = span.end;
    else sections.push({ start: span.start, end: span.end });
  }
  return sections;
}

export function buildFenceFittings(layout) {
  const componentIds = Object.fromEntries([...FITTINGS.map(([kind]) => kind), "barbedWire"].map((kind) => [kind, []]));
  const partsByRun = new Map();
  let barbedLength = 0;
  const frame = (kind, at, axis, width, height, depth, geometry = "box") => ({ kind, at, axis, width, height, depth, geometry });
  const sequences = new Map();
  const identify = (run, name, pieces, componentId) => {
    let id = componentId;
    if (!id) {
      const key = `${run.id}:${name}`;
      const next = sequences.get(key) || 0;
      sequences.set(key, next + 1);
      id = `fence-component:${name}:${run.id}:${next + 1}`;
    }
    if (!componentIds[name]) componentIds[name] = [];
    if (!componentIds[name].includes(id)) componentIds[name].push(id);
    return pieces.map((piece, index) => ({ ...piece, id: `${id}:part:${index + 1}`, component_id: id }));
  };
  const add = (run, name, pieces) => {
    if (!enabled(run.spec, name)) return;
    partsByRun.get(run.id).push(...identify(run, name, pieces));
  };
  const simple = (run, name, at, axis, width, height, depth, geometry) =>
    add(run, name, [frame(name, at, axis, width, height, depth, geometry)]);
  const pipe = (kind, a, b, diameter) => ({ kind, a, b, diameter });
  const capOwners = new Set();
  const sharedPosts = new Map(layout.posts.filter((post) => post.shared).map((post) => [post.shared, post]));

  for (const run of layout.runs) {
    const spec = run.spec;
    partsByRun.set(run.id, []);
    const bottom = spec.elevation * FT + spec.clearance * IN;
    const top = bottom + spec.height * FT;
    const rails = FRAME_COMPONENTS.map(([id]) => id).filter((id) => spec[id] && id !== "braceRail" && id.endsWith("Rail"));
    const wires = FRAME_COMPONENTS.map(([id]) => id).filter((id) => spec[id] && id.endsWith("Wire"));
    const postByDistance = new Map(run.posts.map((post) => [post.at.toFixed(6), post]));
    if (run.closed && run.posts.length) postByDistance.set(run.length.toFixed(6), run.posts[0]);
    const routes = new Map();
    const attach = (post, axis, at, forward) => {
      if (!post || post.type === "line" || post.supportOnly) return;
      const key = post.id + ":" + at.toFixed(6) + ":" + axis.map((n) => n.toFixed(6)).join(",");
      if (!routes.has(key)) routes.set(key, { post, axis, at, forward });
    };
    for (const span of run.spans) {
      const axis = direction(span.a, span.b);
      attach(postByDistance.get(span.start.toFixed(6)), axis, span.start, axis);
      attach(postByDistance.get(span.end.toFixed(6)), minus(axis), span.end, axis);
    }
    const routesByPost = Map.groupBy(routes.values(), (route) => route.post);

    function terminalCollar(name, post, axis, y, reach) {
      const center = atHeight(post.point, y);
      const outer = post.diameter + .006;
      add(run, name, [
        frame(name, center, Y, outer, .021, outer, "cylinder"),
        frame(name, advance(center, axis, reach / 2), axis, .028, reach, .021),
      ]);
      if (enabled(spec, name)) simple(run, "bandBolts", advance(center, axis, reach * .88), normal(axis), .014, .035, .014, "hex");
    }

    for (const { post, axis, forward } of routes.values()) {
      const structural = sharedPosts.get(post.shared) || post;
      const face = normal(forward);
      const reach = structural.diameter / 2 + .032;
      const bar = advance(advance(atHeight(post.point, bottom), axis, reach), face, spec.offset * IN);
      const barHeight = Math.min(spec.barLength || spec.height, spec.height);
      simple(run, "tensionBars", advance(bar, Y, barHeight * FT / 2), Y, .016, barHeight * FT, .005);
      for (const height of tensionBandHeights(barHeight, spec.bandSpacing, spec.minimumBands)) {
        terminalCollar("tensionBands", structural, axis, bottom + height, reach);
      }
      for (const id of rails) {
        const y = frameHeight(spec, id);
        const center = advance(advance(atHeight(post.point, y), axis, reach + .016), face, spec.railOffset * IN);
        simple(run, "railEnds", center, axis, spec.railDiameter * IN * 1.22, .075, spec.railDiameter * IN * 1.22, "cylinder");
        terminalCollar("braceBands", structural, axis, y, reach);
      }
      for (const id of wires) terminalCollar("braceBands", structural, axis, frameHeight(spec, id), reach);
    }

    for (const post of run.posts) {
      const { axis } = memberAt(run.segments, post.at);
      const physical = sharedPosts.get(post.shared) || post;
      if (!capOwners.has(physical)) {
        capOwners.add(physical);
        const pipeTop = physical.base + physical.height;
        if (physical.type === "line" && spec.topRail) {
          const railTop = frameHeight(spec, "topRail");
          if (!spec.barbedWire || !enabled(spec, "barbArms")) {
            add(run, "loopCaps", [
              frame("loopCaps", atHeight(post.point, railTop), axis, spec.railDiameter * IN * 1.38, .025, spec.railDiameter * IN * 1.38, "ring"),
              frame("loopCaps", atHeight(post.point, railTop - spec.railDiameter * IN * .6), Y, post.diameter * 1.12, .034, post.diameter * 1.12, "cylinder"),
            ]);
          }
        } else simple(run, "caps", atHeight(post.point, pipeTop + .009), Y, physical.diameter * 1.13, .024, physical.diameter * 1.13, "dome");
      }
      if (post.type !== "line") continue;
      for (let y = bottom + spec.postTieSpacing * IN / 2; y < top - EPS; y += spec.postTieSpacing * IN) {
        simple(run, "ties", atHeight(post.point, y), Y, post.diameter + .008, .008, post.diameter + .008, "ring");
      }
      for (const id of wires) {
        simple(run, "ties", atHeight(post.point, frameHeight(spec, id)), Y, post.diameter + .008, .008, post.diameter + .008, "ring");
      }
    }

    for (const section of runSections(run)) {
      const pointAlong = (at, height, offset = 0) => {
        const { point, axis } = memberAt(run.segments, at);
        point[1] = height;
        return { point: advance(point, normal(axis), offset), axis };
      };
      for (const id of rails) {
        const y = frameHeight(spec, id);
        const stock = spec.railStockLength * FT;
        const tie = spec.railTieSpacing * IN;
        if (spec.railStock === "plain") for (let at = section.start + stock; at < section.end - EPS; at += stock) {
          const { point, axis } = pointAlong(at, y, spec.railOffset * IN);
          simple(run, "railSleeves", point, axis, spec.railDiameter * IN * 1.13, .14, spec.railDiameter * IN * 1.13, "cylinder");
        }
        for (let at = section.start + tie / 2; at < section.end - EPS; at += tie) {
          const { point, axis } = pointAlong(at, y, spec.railOffset * IN);
            const diameter = spec.railDiameter * IN + .007;
          simple(run, "ties", point, axis, diameter, .006, diameter, "ring");
        }
      }
      for (const id of wires) {
        const y = frameHeight(spec, id);
        const spacing = spec.hogRingSpacing * IN;
        for (let at = section.start + spacing / 2; at < section.end - EPS; at += spacing) {
          const { point, axis } = pointAlong(at, y, spec.railOffset * IN);
          simple(run, "hogRings", point, axis, .018, .005, .018, "ring");
        }
      }
    }

    for (const brace of braceSegments(run)) {
      const [a, b] = brace;
      const u = direction(a, b);
      const y = frameHeight(spec, "braceRail");
      for (const [point, axis] of [[a, u], [b, minus(u)]]) {
        const post = run.posts.find((item) => Math.hypot(item.point[0] - point[0], item.point[1] - point[1]) < EPS);
        if (!post) continue;
        simple(run, "railEnds", advance(atHeight(point, y), axis, post.diameter / 2 + .035), axis, spec.railDiameter * IN * 1.22, .075, spec.railDiameter * IN * 1.22, "cylinder");
        terminalCollar("braceBands", post, axis, y, post.diameter / 2 + .035);
      }
      const terminal = run.posts.find((post) => post.type !== "line" && Math.hypot(post.point[0] - a[0], post.point[1] - a[1]) < EPS);
      const low = atHeight(terminal ? a : b, bottom + .07);
      const high = atHeight(terminal ? b : a, y);
      const adjuster = low.map((value, i) => (value + high[i]) / 2);
      const rodLength = Math.hypot(...low.map((value, i) => high[i] - value));
      const rodAxis = low.map((value, i) => (high[i] - value) / rodLength);
      add(run, "trussRods", [pipe("trussRods", low, high, .009), frame("trussRods", adjuster, rodAxis, .027, .13, .027, "cylinder")]);
    }

    if (spec.barbedWire) {
      const strands = Math.round(spec.barbStrands);
      const rise = spec.barbRise * IN, reach = spec.barbReach * IN * (spec.barbSide === "left" ? 1 : -1);
      const base = barbBase(spec);
      const strandPoint = (point, axis, fraction) => advance(atHeight(point, base + fraction * rise), normal(axis), fraction * reach);
      for (const post of run.posts) {
        if (post.supportOnly) continue;
        const { axis } = memberAt(run.segments, post.at);
        const routesAtPost = routesByPost.get(post) || [];
        const armAxes = routesAtPost.length ? routesAtPost.map((route) => route.forward) : [axis];
        const unique = new Map(armAxes.map((item) => [item.map((n) => n.toFixed(6)).join(","), item]));
        for (const arm of unique.values()) add(run, "barbArms", [
          pipe("barbArms", atHeight(post.point, base - .06), atHeight(post.point, base), post.diameter * 1.1),
          pipe("barbArms", atHeight(post.point, base), strandPoint(post.point, arm, 1), .035),
        ]);
      }
      for (const [spanIndex, span] of run.spans.entries()) {
        const axis = direction(span.a, span.b);
        for (let i = 1; i <= strands; i++) {
          const fraction = i / strands;
          const a = strandPoint(span.a, axis, fraction), b = strandPoint(span.b, axis, fraction);
          const strandId = `${run.id}:component:barbed-wire:${span.id || spanIndex}:${i}`;
          const wirePieces = [pipe("barbedWire", a, b, .0056)];
          const step = Math.max(.127, run.net * strands / 3500);
          for (let offset = step / 2; offset < span.length - EPS; offset += step) {
            const point = advance(a, axis, offset);
            const side = normal(axis);
            const barbStart = advance(advance(point, axis, -.012), side, -.013);
            const barbEnd = advance(advance(point, axis, .012), side, .013);
            wirePieces.push(pipe("barbedWire", barbStart, barbEnd, .003));
          }
          partsByRun.get(run.id).push(...identify(run, "barbedWire", wirePieces, strandId));
          barbedLength += span.length;
        }
      }
    }

    for (const gate of run.gates) {
      const bottom = spec.elevation * FT + gate.clearance * IN;
      const height = gate.height * FT;
      const axis = direction(gate.a, gate.b);
      const leaves = gateLeaves(gate, spec);
      if (["single", "double"].includes(gate.type)) {
        for (const leaf of leaves) for (const fraction of [.2, .8]) {
          const y = bottom + height * fraction;
          const pin = atHeight(leaf.hinge, y);
          const tube = atHeight(leaf.a, y);
          add(run, "gateHinges", [frame("gateHinges", pin, Y, spec.gateDiameter * IN * 1.12, .05, spec.gateDiameter * IN * 1.12, "cylinder"),
            pipe("gateHinges", pin, tube, .021), frame("gateHinges", tube, Y, gate.frame * IN * 1.22, .054, gate.frame * IN * 1.22, "cylinder")]);
        }
        const latch = atHeight(leaves[0].b, bottom + height * .55);
        add(run, "gateLatches", [
          pipe("gateLatches", advance(latch, normal(leaves[0].heading), -.045), advance(latch, normal(leaves[0].heading), .045), .022),
          pipe("gateLatches", latch, advance(latch, leaves[0].heading, .085), .019),
        ]);
        if (gate.type === "double") add(run, "gateDropRods", [pipe("gateDropRods", atHeight(leaves[1].b, spec.elevation * FT + .015), atHeight(leaves[1].b, bottom + height * .34), .019)]);
      } else if (gate.type === "cantilever") {
        const left = gate.direction === "in";
        const support = left ? gate.a : gate.b;
        const receiver = left ? gate.b : gate.a;
        for (const offset of [0, gate.tail * FT * (left ? -1 : 1)]) {
          for (const y of [bottom + .06, bottom + height - .08]) {
            const post = advance(atHeight(support, y), axis, offset);
            const roller = advance(post, normal(axis), spec.gateDiameter * IN / 2 + gate.frame * IN * .7);
            add(run, "gateRollers", [
              pipe("gateRollers", post, roller, .032),
              frame("gateRollers", roller, normal(axis), .071, .058, .071, "cylinder"),
              frame("gateRollers", advance(roller, Y, .045), normal(axis), .078, .074, .025),
            ]);
          }
        }
        simple(run, "gateReceiver", atHeight(receiver, bottom + height * .54), axis, .09, .085, .06);
        simple(run, "gateStops", advance(atHeight(support, bottom + .11), axis, gate.tail * FT * (left ? -1 : 1)), axis, .1, .05, .075);
      } else {
        const top = bottom + height;
        const trackA = atHeight(gate.a, top + .15);
        const trackB = atHeight(gate.b, top + .15);
        const width = gate.end - gate.start;
        const inset = Math.min(.3, width / 4);
        const pieces = [pipe("gateRollers", trackA, trackB, .04)];
        for (const offset of [inset, width - inset]) {
          const wheel = advance(atHeight(gate.a, top + .055), axis, offset);
          const axle = advance(wheel, normal(axis), spec.gateDiameter * IN * .6);
          pieces.push(pipe("gateRollers", trackA.map((value, i) => value + axis[i] * offset), wheel, .028));
          pieces.push(frame("gateRollers", axle, normal(axis), .14, .11, .055, "cylinder"));
        }
        add(run, "gateRollers", pieces);
      }
    }
  }
  const counts = Object.fromEntries(FITTINGS.map(([kind]) => [kind, componentIds[kind].length]));
  return { counts, componentIds, partsByRun, barbedLength };
}
