import { METERS_PER_FOOT as FT, METERS_PER_INCH as IN, FRAME_COMPONENTS } from "./settings.js";
import { distance, interpolate } from "./source.js";

const EPS = 1e-6;
const PRIORITY = { line: 0, end: 1, pull: 2, corner: 3, junction: 4, gate: 5 };
const MAX_AUTO_POSTS = 20000;

const near = (a, b) => Math.abs(a - b) < EPS;
const samePoint = (a, b) => distance(a, b) < EPS;
const pointOn = (segment, offset) => interpolate(segment.a, segment.b, offset / segment.length);
const dimensions = (post, spec) => ({
  ...post, spec, base: spec.elevation * FT,
  height: Math.max(spec.postHeight * FT, spec.height * FT + (spec.clearance + spec.extension) * IN, post.gateTop || 0),
  diameter: (post.type === "line" ? spec.lineDiameter : post.type === "gate" ? spec.gateDiameter : spec.terminalDiameter) * IN,
});

function gateLayout(run, issues) {
  const accepted = [];
  for (const [gateIndex, rawGate] of run.gates.entries()) {
    const gate = { ...rawGate, id: rawGate.id || `${run.id}-gate-${gateIndex + 1}` };
    const segment = run.gateSegments[gate.segment - 1];
    const start = gate.start * FT;
    const width = gate.width * FT;
    const end = start + width;
    const chainage = (segment?.start || 0) + start;
    const hasStopInside = run.stops.some((stop) => stop.t * run.length > chainage + EPS && stop.t * run.length < chainage + width - EPS);
    const travel = gate.width * gate.opening / 100 * FT;
    const tailFits = gate.type !== "cantilever" || (gate.direction === "in"
      ? start >= Math.max(gate.tail * FT, travel) + EPS
      : end + Math.max(gate.tail * FT, travel) <= (segment?.length || 0) - EPS);
    const tail = gate.type === "cantilever" ? gate.tail * FT : 0;
    const envelopeStart = chainage - (gate.direction === "in" ? tail : 0);
    const envelopeEnd = chainage + width + (gate.direction === "out" ? tail : 0);
    if (!segment || start < 0 || end > segment.length + EPS || hasStopInside || !tailFits
      || accepted.some((row) => envelopeStart < row.envelopeEnd - EPS && envelopeEnd > row.envelopeStart + EPS)) {
      issues.push(`${run.label}: gate ${gateIndex + 1} needs a clear straight segment with room for the opening${gate.type === "cantilever" ? " and support tail" : ""}.`);
      continue;
    }
    const gateTop = gate.height * FT + gate.clearance * IN + run.spec.extension * IN;
    const posts = [
      { id: `${run.id}-gate-${gate.id}-hinge`, at: chainage, type: "gate", gateTop },
      { id: `${run.id}-gate-${gate.id}-latch`, at: chainage + width, type: "gate", gateTop },
    ];
    if (gate.type === "cantilever") posts.push({
      id: `${run.id}-gate-${gate.id}-support`, type: "gate", gateTop, supportOnly: true,
      at: gate.direction === "in" ? chainage - gate.tail * FT : chainage + width + gate.tail * FT,
    });
    accepted.push({ ...gate, a: pointOn(segment, start), b: pointOn(segment, end), start: chainage, end: chainage + width, envelopeStart, envelopeEnd, posts });
  }
  return accepted.sort((a, b) => a.start - b.start);
}

function layOutRun(run, issues) {
  const gates = gateLayout(run, issues);
  const blocked = (at) => gates.some((gate) => at > gate.start + EPS && at < gate.end - EPS);
  const stops = run.stops.map((stop) => ({ ...stop, at: stop.t * run.length })).concat(gates.flatMap((gate) => gate.posts));
  stops.sort((a, b) => a.at - b.at);
  const breaks = [];
  for (const stop of stops) {
    const last = breaks.at(-1);
    if (!last || !near(last.at, stop.at)) {
      breaks.push(stop);
      continue;
    }
    const type = PRIORITY[stop.type] > PRIORITY[last.type] ? stop.type : last.type;
    breaks[breaks.length - 1] = { ...last, type, gateTop: Math.max(last.gateTop || 0, stop.gateTop || 0),
      shared: last.shared || stop.shared, directions: last.directions || stop.directions,
      supportOnly: !!last.supportOnly && !!stop.supportOnly };
  }
  const posts = [...breaks];
  if (run.closed && !near(breaks.at(-1).at, run.length)) breaks.push({ ...breaks[0], at: run.length });
  const intervals = [];
  const spacing = run.spec.spacing * FT;
  let overflow = false;
  for (let i = 1; i < breaks.length; i++) {
    const start = breaks[i - 1].at;
    const end = breaks[i].at;
    if (end - start <= EPS || blocked((start + end) / 2)) continue;
    const bays = Math.max(1, Math.ceil((end - start) / spacing - EPS));
    const step = run.spec.strategy === "even" ? (end - start) / bays : spacing;
    for (let j = 1; j < bays; j++) {
      if (posts.length >= MAX_AUTO_POSTS) { overflow = true; break; }
      posts.push({ id: `${run.id}:line-post:${i}:${j}`, at: start + step * j, type: "line" });
    }
    intervals.push([start, end]);
  }
  if (overflow) issues.push(`${run.label}: automatic post limit reached. Increase spacing or divide the source into smaller runs.`);
  posts.sort((a, b) => a.at - b.at);
  let segmentIndex = 0;
  const localPosts = [];
  for (const post of posts) {
    while (segmentIndex < run.segments.length - 1 && post.at > run.segments[segmentIndex].start + run.segments[segmentIndex].length) segmentIndex++;
    const segment = run.segments[segmentIndex];
    const point = post.point || pointOn(segment, post.at - segment.start);
    const last = localPosts.at(-1);
    if (run.closed && near(post.at, run.length) && samePoint(point, localPosts[0].point)) {
      localPosts[0].shared ||= post.shared;
      continue;
    }
    if (last && near(last.at, post.at)) continue;
    const component_id = post.shared ? `fence-component:post:shared:${post.shared}` : `fence-component:post:${run.id}:${post.id}`;
    localPosts.push(dimensions({ ...post, id: post.id || `${run.id}:post:${localPosts.length}`,
      component_id, point, runId: run.id }, run.spec));
  }
  const spacingLabels = [];
  const spacingStoppers = run.closed ? [...localPosts, { ...localPosts[0], at: run.length }] : localPosts;
  for (let i = 1; i < spacingStoppers.length; i++) {
    const a = spacingStoppers[i - 1], b = spacingStoppers[i];
    if (blocked((a.at + b.at) / 2)) continue;
    spacingLabels.push({ point: interpolate(a.point, b.point, .5), length: b.at - a.at });
  }
  if (spacingLabels.some((bay) => bay.length > spacing + EPS)) issues.push(`${run.label}: at least one post bay exceeds configured spacing.`);
  const spans = [];
  let intervalIndex = 0;
  for (const [segmentIndex, segment] of run.segments.entries()) {
    const end = segment.start + segment.length;
    while (intervalIndex < intervals.length && intervals[intervalIndex][1] <= segment.start + EPS) intervalIndex++;
    let fragmentIndex = 0;
    for (let index = intervalIndex; index < intervals.length && intervals[index][0] < end - EPS; index++) {
      const [startAt, endAt] = intervals[index];
      const start = Math.max(startAt, segment.start);
      const stop = Math.min(endAt, end);
      if (stop - start > EPS) {
        const spanId = `${run.id}:span:${segment.id || segmentIndex}:${fragmentIndex++}`;
        spans.push({ id: spanId, component_id: `fence-component:fabric:${spanId}`,
        a: pointOn(segment, start - segment.start), b: pointOn(segment, stop - segment.start),
        length: stop - start, start, end: stop });
      }
    }
  }
  const net = spans.reduce((sum, span) => sum + span.length, 0);
  const opening = gates.reduce((sum, gate) => sum + gate.end - gate.start, 0);
  if (Math.abs(net + opening - run.length) > EPS) issues.push(`${run.label}: generated spans do not reconcile with the calibrated run.`);
  return { ...run, gates, posts: localPosts, spans, spacingLabels, net, opening };
}

export function buildFenceLayout(source) {
  const issues = [...source.issues];
  const runs = source.runs.map((run) => layOutRun(run, issues));
  const posts = [];
  const shared = new Map();
  const ambiguous = new Set();
  for (const post of runs.flatMap((run) => run.posts)) {
    if (!post.shared) continue;
    const first = shared.get(post.shared);
    if (!first) shared.set(post.shared, post);
    else if (!samePoint(first.point, post.point) || !near(first.base, post.base)) ambiguous.add(post.shared);
  }

  // Only an explicit junction identity connects separate runs. Geometric
  // coincidence alone can be a crossing or two unrelated runs, and merging
  // every post at the same coordinates creates phantom junctions between
  // auto-spaced line posts.
  shared.clear();
  const totals = { measured: 0, path: 0, opening: 0, fabric: 0, area: 0, gateArea: 0,
    line: 0, end: 0, corner: 0, junction: 0, pull: 0, gate: 0, totalPosts: 0,
    rail: 0, wire: 0, single: 0, double: 0, cantilever: 0 };
  for (const run of runs) {
    totals.measured += Number.isFinite(run.measured) ? run.measured * FT : 0;
    totals.path += run.length;
    totals.opening += run.opening;
    totals.fabric += run.net;
    totals.area += run.net * run.spec.height * FT;
    totals.rail += run.net * FRAME_COMPONENTS.filter(([id]) => id.endsWith("Rail") && id !== "braceRail" && run.spec[id]).length;
    totals.rail += braceLength(run);
    totals.wire += run.net * FRAME_COMPONENTS.filter(([id]) => id.endsWith("Wire") && run.spec[id]).length;
    for (const gate of run.gates) {
      totals[gate.type]++;
      totals.gateArea += (gate.end - gate.start) * gate.height * FT;
    }
    for (const post of run.posts) {
      if (!post.shared) { posts.push(post); continue; }
      if (ambiguous.has(post.shared)) {
        issues.push(`${run.label}: shared post positions or elevations disagree. The runs are displayed separately.`);
        posts.push({ ...post, shared: undefined, component_id: `fence-component:post:${run.id}:${post.id}` });
        continue;
      }
      const match = shared.get(post.shared);
      if (!match) {
        shared.set(post.shared, { index: posts.length, directions: post.directions || 2 });
        posts.push(post);
        continue;
      }
      const first = posts[match.index];
      match.directions += post.directions || 2;
      const type = first.type === "gate" || post.type === "gate" ? "gate" : match.directions > 2 ? "junction" : "corner";
      posts[match.index] = { ...first, id: first.id, component_id: first.component_id, type,
        diameter: Math.max(first.diameter, post.diameter, first.spec.terminalDiameter * IN, post.spec.terminalDiameter * IN), height: Math.max(first.height, post.height) };
    }
  }
  const countedPostIds = new Map();
  for (const post of posts) {
    const ids = countedPostIds.get(post.type) || new Set();
    ids.add(post.component_id);
    countedPostIds.set(post.type, ids);
  }
  for (const [type, ids] of countedPostIds) totals[type] = ids.size;
  totals.totalPosts = new Set(posts.map((post) => post.component_id)).size;
  return { runs, posts, totals, issues: [...new Set(issues)] };
}

export function braceSegments(run) {
  if (!run.spec.braceRail) return [];
  const braces = [];
  const posts = run.posts;
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1], b = posts[i];
    if ((a.type !== "line" && b.type !== "line") || (a.type === "line" && b.type === "line")) continue;
    if (run.segments.some((segment) => a.at >= segment.start - EPS && b.at <= segment.start + segment.length + EPS)
      && !run.gates.some((gate) => a.at < gate.end - EPS && b.at > gate.start + EPS)) braces.push([a.point, b.point]);
  }
  return braces;
}

function braceLength(run) {
  return braceSegments(run).reduce((sum, [a, b]) => sum + distance(a, b), 0);
}
