export const METERS_PER_FOOT = 0.3048;
export const METERS_PER_INCH = 0.0254;

// Master Halco Blue Book, Chain Link - Fabric. Coated outside diameter
// depends on the specified product and is entered separately.
export const WIRE_GAUGES = Object.freeze({ "9": .148, "11": .120, "11.5": .113 });
export const SPEC = {
  height: 6, elevation: 0, clearance: 2, offset: 0, mesh: 2, gauge: "9",
  wire: 0, coatedWire: 0, finish: "galvanized", color: "#303834",
  topSelvage: "knuckle", bottomSelvage: "knuckle",
  spacing: 10, strategy: "even", lineDiameter: 1.9, terminalDiameter: 2.375,
  gateDiameter: 2.875, extension: 2, postHeight: 0, postFinish: "matching",
  topRail: true, midRail: false, bottomRail: false, braceRail: false,
  topWire: false, midWire: false, bottomWire: false,
  railDiameter: 1.315, railOffset: 0, railFinish: "matching", railConnection: "between",
  topRailHeight: 100, midRailHeight: 50, bottomRailHeight: 0, braceRailHeight: 40,
  wireDiameter: .148, topWireHeight: 98, midWireHeight: 50, bottomWireHeight: 2,
  fittings: true, detail: "auto",
  tensionBars: true, tensionBands: true, bandBolts: true, railEnds: true, braceBands: true,
  caps: true, loopCaps: true, railSleeves: true, ties: true, hogRings: true,
  trussRods: false, barbedWire: false, barbArms: true, gateHinges: true, gateLatches: true,
  gateDropRods: true, gateRollers: true, gateStops: true, gateReceiver: true,
  barLength: 0, bandSpacing: 12, minimumBands: 0, postTieSpacing: 12, railTieSpacing: 24,
  hogRingSpacing: 18, railStockLength: 21, railStock: "plain",
  barbStrands: 3, barbRise: 12, barbReach: 12, barbSide: "left",
  footings: false, footingDepth: 30, footingDiameter: 12,
};
export const FITTINGS = [
  ["tensionBars", "Tension bars"], ["tensionBands", "Tension bands"], ["bandBolts", "Band bolts and nuts"],
  ["railEnds", "Rail end cups"], ["braceBands", "Brace bands"], ["caps", "Post caps"], ["loopCaps", "Loop caps"],
  ["railSleeves", "Rail sleeves"], ["ties", "Fence ties"], ["hogRings", "Hog rings"], ["trussRods", "Truss rods and adjusters"],
  ["barbArms", "Barb arms"], ["footings", "Concrete footings"], ["gateHinges", "Swing hinge sets"], ["gateLatches", "Swing gate latches"],
  ["gateDropRods", "Double gate drop rods"], ["gateRollers", "Cantilever rollers and guards"],
  ["gateStops", "Cantilever stops"], ["gateReceiver", "Cantilever latch receivers"],
];
export const FRAME_COMPONENTS = [
  ["topRail", "Top rail"], ["midRail", "Mid rail"], ["bottomRail", "Bottom rail"], ["braceRail", "Brace rails"],
  ["topWire", "Top tension wire"], ["midWire", "Intermediate tension wire"], ["bottomWire", "Bottom tension wire"],
];
export const DISPLAY = { fabric: true, posts: true, rails: true, fittings: true, corners: true, lengths: false, edgeLabels: true, spacing: false, angles: false, grid: true, plan: false, light: 2.6, camera: "perspective", mode: "split", fabricMeasure: "length", componentVisibility: {} };
const TYPES = ["chain-link", "ornamental", "wood", "vinyl"];
const GATE_TYPES = ["single", "double", "cantilever"];
const choices = (value, list, fallback) => list.includes(value) ? value : fallback;
const color = (value, fallback) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
export const range = (value, minimum, maximum, fallback) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const rows = (value) => Array.isArray(value) ? value.filter((row) => row && typeof row.id === "string") : [];
function normalizeFenceAnnotations(value) {
  const source = object(value);
  const point = (candidate) => Array.isArray(candidate) && candidate.length >= 2
    && candidate.slice(0, 2).every((item) => Number.isFinite(item) && Math.abs(item) <= 1e7) ? candidate.slice(0, 2) : null;
  const drawings = rows(source.drawings).slice(-200).map((drawing) => ({
    id: drawing.id, points: (Array.isArray(drawing.points) ? drawing.points : []).slice(0, 5000).map(point).filter(Boolean),
  })).filter((drawing) => drawing.points.length >= 2);
  const notes = rows(source.notes).slice(-500).map((note) => ({
    id: note.id, point: point(note.point), text: typeof note.text === "string" ? note.text.trim().slice(0, 500) : "",
  })).filter((note) => note.point && note.text);
  return { drawings, notes };
}

export const emptyFence3d = () => ({ version: 1, runs: {}, display: { ...DISPLAY }, rules: {}, overrides: {}, annotations: { drawings: [], notes: [] } });

export function normalizeFence3d(value) {
  if (value?.version !== 1) return emptyFence3d();
  const display = { ...DISPLAY };
  for (const name of ["fabric", "posts", "rails", "fittings", "corners", "lengths", "edgeLabels", "spacing", "angles", "grid", "plan"]) {
    if (typeof value.display?.[name] === "boolean") display[name] = value.display[name];
  }
  display.light = range(value.display?.light, .3, 6, DISPLAY.light);
  display.camera = choices(value.display?.camera, ["perspective", "orthographic"], DISPLAY.camera);
  display.mode = choices(value.display?.mode, ["split", "3d"], DISPLAY.mode);
  display.fabricMeasure = choices(value.display?.fabricMeasure, ["length", "area"], DISPLAY.fabricMeasure);
  display.componentVisibility = Object.fromEntries(Object.entries(object(value.display?.componentVisibility))
    .filter(([, visible]) => typeof visible === "boolean"));
  const runs = Object.fromEntries(Object.entries(object(value.runs)).map(([id, run]) => [id, {
    type: choices(run?.type, [...TYPES, "exclude"], "chain-link"),
    spec: normalizeSpec(run?.spec),
    gates: rows(run?.gates).map((gate) => ({
      id: gate.id, type: choices(gate.type, GATE_TYPES, "single"),
      segment: Math.round(range(gate.segment, 1, 100000, 1)), start: range(gate.start, 0, 100000, 2),
      width: range(gate.width, .5, 100, 4), height: range(gate.height, 1, 30, 6),
      clearance: range(gate.clearance, 0, 36, 2), frame: range(gate.frame, .25, 12, 1.66),
      mesh: range(gate.mesh, .25, 6, 2), opening: range(gate.opening, 0, 100, 0),
      tail: range(gate.tail, 1, 100, 4), direction: choices(gate.direction, ["in", "out"], "in"),
      finish: choices(gate.finish, ["matching", "galvanized", "vinyl"], "matching"),
      hingeSide: choices(gate.hingeSide, ["start", "end"], "start"),
    })),
  }]));
  const quantities = (entries) => Object.fromEntries(Object.entries(object(entries)).filter(([, n]) => typeof n === "number" && Number.isFinite(n) && n >= 0));
  return { version: 1, runs, display, rules: quantities(value.rules), overrides: quantities(value.overrides), annotations: normalizeFenceAnnotations(value.annotations) };
}

function normalizeSpec(spec) {
  const result = {};
  for (const [name, minimum, maximum] of [
    ["height", 1, 50], ["elevation", -1000, 1000], ["clearance", 0, 60], ["offset", -24, 24],
    ["mesh", .25, 6], ["wire", 0, .5], ["coatedWire", 0, .75], ["spacing", .5, 100],
    ["lineDiameter", .25, 24], ["terminalDiameter", .25, 24], ["gateDiameter", .25, 24],
    ["extension", 0, 60], ["postHeight", 0, 60], ["railDiameter", .25, 24], ["railOffset", -24, 24],
    ["topRailHeight", 0, 100], ["midRailHeight", 0, 100], ["bottomRailHeight", 0, 100], ["braceRailHeight", 0, 100],
    ["wireDiameter", .02, 1], ["topWireHeight", 0, 100], ["midWireHeight", 0, 100], ["bottomWireHeight", 0, 100],
    ["barLength", 0, 50], ["bandSpacing", 4, 24], ["minimumBands", 0, 8],
    ["postTieSpacing", 6, 36], ["railTieSpacing", 6, 36], ["hogRingSpacing", 6, 36],
    ["railStockLength", 4, 60], ["barbStrands", 1, 6], ["barbRise", 4, 30], ["barbReach", 0, 30],
    ["footingDepth", 4, 120], ["footingDiameter", 3, 60],
  ]) {
    if (spec?.[name] != null) result[name] = range(spec[name], minimum, maximum, SPEC[name]);
  }
  for (const name of [...FRAME_COMPONENTS.map(([id]) => id), ...FITTINGS.map(([id]) => id), "fittings", "barbedWire"]) {
    if (typeof spec?.[name] === "boolean") result[name] = spec[name];
  }
  for (const [name, options] of Object.entries({
    gauge: Object.keys(WIRE_GAUGES), finish: ["galvanized", "vinyl"],
    postFinish: ["matching", "galvanized", "vinyl"], railFinish: ["matching", "galvanized", "vinyl"],
    topSelvage: ["knuckle", "twist", "plain"], bottomSelvage: ["knuckle", "twist", "plain"],
    strategy: ["even", "maximum"], railConnection: ["between", "center"],
    detail: ["auto", "pattern", "wire"],
    railStock: ["plain", "swaged"], barbSide: ["left", "right"],
  })) {
    if (spec?.[name] != null) result[name] = choices(spec[name], options, SPEC[name]);
  }
  if (spec?.color != null) result.color = color(spec.color, SPEC.color);
  return result;
}

export function runSpec(run, fence) {
  return { ...SPEC, spacing: fence?.max_spacing_ft || SPEC.spacing, ...run?.spec };
}
