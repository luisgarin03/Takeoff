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
  foundationAuto: true, foundationDepthFt: 3, foundationDiameterIn: 18,
};
export const FITTINGS = [
  ["tensionBars", "Tension bars"], ["tensionBands", "Tension bands"], ["bandBolts", "Band bolts and nuts"],
  ["railEnds", "Rail end cups"], ["braceBands", "Brace bands"], ["caps", "Post caps"], ["loopCaps", "Loop caps"],
  ["railSleeves", "Rail sleeves"], ["ties", "Fence ties"], ["hogRings", "Hog rings"], ["trussRods", "Truss rods and adjusters"],
  ["barbArms", "Barb arms"], ["gateHinges", "Swing hinge sets"], ["gateLatches", "Swing gate latches"],
  ["gateDropRods", "Double gate drop rods"], ["gateRollers", "Cantilever rollers and guards"],
  ["gateStops", "Cantilever stops"], ["gateReceiver", "Cantilever latch receivers"],
];
export const FRAME_COMPONENTS = [
  ["topRail", "Top rail"], ["midRail", "Mid rail"], ["bottomRail", "Bottom rail"], ["braceRail", "Brace rails"],
  ["topWire", "Top tension wire"], ["midWire", "Intermediate tension wire"], ["bottomWire", "Bottom tension wire"],
];
export const ORNAMENTAL_SPEC = Object.freeze({
  height_ft: 4, elevation_ft: 0, bottom_clearance_in: 2, max_panel_span_ft: 8,
  strategy: "maximum", picket_spacing_in: 4.8, rails: 2, post_size_in: 2.5, rail_width_in: 1.5,
  rail_depth_in: 1.5, picket_size_in: 1, max_swivel_deg: 45, finish_color: "#303834",
  foundationAuto: true, foundationDepthFt: 3, foundationDiameterIn: 18,
});
// Treated wood privacy fence defaults follow the Blender estimating prototype
// (1.83 m height, 2.44 m maximum bay) expressed in the app's feet/inches units.
export const WOOD_SPEC = Object.freeze({
  height_ft: 6, elevation_ft: 0, bottom_clearance_in: 0, max_bay_span_ft: 8,
  spacing_strategy: "balanced", rails: 3, post_size_in: 3.5, terminal_post_size_in: 5.5,
  gate_post_size_in: 5.5, rail_width_in: 3.5, rail_depth_in: 1.5,
  picket_width_in: 5.5, picket_gap_in: .5, cap_board: true, kickboard: true,
  fasteners: true, footings: true, gravel_beds: true, gravel_depth_in: 6,
  finish_color: "#a66b37", foundationAuto: true, foundationDepthFt: 3, foundationDiameterIn: 18,
});
export const DISPLAY = { fabric: true, posts: true, rails: true, fittings: true, corners: true, lengths: false, edgeLabels: true, spacing: false, angles: false, grid: true, plan: false, light: 2.6, camera: "perspective", mode: "split", fabricMeasure: "length", componentVisibility: {}, conditionVisibility: {} };
const TYPES = ["chain-link", "ornamental", "wood", "vinyl", "guardrail"];
const GATE_TYPES = ["single", "double", "cantilever", "overhead"];
export const fenceConditionKey = (sheetId, conditionId) => JSON.stringify([String(sheetId || ""), String(conditionId || "")]);
const choices = (value, list, fallback) => list.includes(value) ? value : fallback;
const color = (value, fallback) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
export const range = (value, minimum, maximum, fallback) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;

export function recommendedFoundation(heightFt, type = "chain-link") {
  if (type === "guardrail") return { foundationDiameterIn: 18, foundationDepthFt: 3 };
  const height = Number.isFinite(heightFt) ? heightFt : 6;
  if (height <= 6) return { foundationDiameterIn: 18, foundationDepthFt: 3 };
  if (height <= 8) return { foundationDiameterIn: 18, foundationDepthFt: 4 };
  if (height <= 10) return { foundationDiameterIn: 18, foundationDepthFt: 4.5 };
  if (height <= 16) return { foundationDiameterIn: 30, foundationDepthFt: 5 };
  if (height >= 36) return { foundationDiameterIn: 30, foundationDepthFt: 12.5 };
  return { foundationDiameterIn: 30, foundationDepthFt: 5 };
}

export function normalizeFoundationSettings(spec, heightFt = 6, type = "chain-link") {
  const automatic = spec?.foundationAuto === true
    || (spec?.foundationAuto == null && spec?.foundationDiameterIn == null && spec?.foundationDepthFt == null);
  const defaults = recommendedFoundation(heightFt, type);
  return {
    foundationAuto: automatic,
    foundationDiameterIn: automatic ? defaults.foundationDiameterIn : range(spec?.foundationDiameterIn, 6, 60, defaults.foundationDiameterIn),
    foundationDepthFt: automatic ? defaults.foundationDepthFt : range(spec?.foundationDepthFt, .5, 20, defaults.foundationDepthFt),
  };
}
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

export const emptyFence3d = () => ({ version: 1, runs: {}, conditions: {}, display: { ...DISPLAY }, rules: {}, overrides: {}, annotations: { drawings: [], notes: [] } });

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
  display.conditionVisibility = Object.fromEntries(Object.entries(object(value.display?.conditionVisibility))
    .filter(([id, visible]) => id && typeof visible === "boolean"));
  const runs = Object.fromEntries(Object.entries(object(value.runs)).map(([id, run]) => {
    const type = choices(run?.type, [...TYPES, "exclude"], "chain-link");
    return [id, {
    type,
    spec: type === "wood" ? normalizeWoodSpec(run?.spec)
      : type === "ornamental" ? normalizeOrnamentalSpec(run?.spec) : normalizeSpec(run?.spec),
    gates: rows(run?.gates).map((gate) => ({
      id: gate.id, type: choices(gate.type, GATE_TYPES, "single"),
      segment: Math.round(range(gate.segment, 1, 100000, 1)), start: range(gate.start, 0, 100000, 2),
      width: range(gate.width, .5, 100, 4), height: range(gate.height, 1, 30, 6),
      clearance: range(gate.clearance, 0, 36, 2), frame: range(gate.frame, .25, 12, 1.66),
      mesh: range(gate.mesh, .25, 6, 2), opening: range(gate.opening, 0, 100, 0),
      tail: range(gate.tail, 1, 100, 4), direction: choices(gate.direction, ["in", "out"], "in"),
      startOpenDegrees: range(gate.startOpenDegrees, -120, 120, 0), endOpenDegrees: range(gate.endOpenDegrees, -120, 120, 0),
      finish: choices(gate.finish, ["matching", "galvanized", "vinyl"], "matching"),
      hingeSide: choices(gate.hingeSide, ["start", "end"], "start"),
    })),
  }];
  }));
  const conditions = Object.fromEntries(Object.entries(object(value.conditions)).filter(([id]) => id)
    .map(([id, config]) => {
      const condition = {};
      if (TYPES.includes(config?.type) || config?.type === "exclude") condition.type = config.type;
      if (config?.spec && typeof config.spec === "object") {
        condition.spec = config.type === "ornamental" ? normalizeOrnamentalSpec(config.spec)
          : config.type === "wood" ? normalizeWoodSpec(config.spec) : normalizeSpec(config.spec);
      }
      if (typeof config?.visible === "boolean") condition.visible = config.visible;
      return [id, condition];
    }).filter(([, condition]) => Object.keys(condition).length));
  const quantities = (entries) => Object.fromEntries(Object.entries(object(entries)).filter(([, n]) => typeof n === "number" && Number.isFinite(n) && n >= 0));
  return { version: 1, runs, conditions, display, rules: quantities(value.rules), overrides: quantities(value.overrides), annotations: normalizeFenceAnnotations(value.annotations) };
}

// Older projects kept Ornamental as a separate 2D attachment/calculator. Move
// its type and selected panel span into the shared 3D condition settings when
// loading those projects, then the legacy attachment can be dropped safely.
// Explicit 3D condition/run choices always win over the old attachment.
export function migrateLegacyOrnamentalFences(value, legacyFences, shapes = []) {
  if (!Array.isArray(legacyFences) || !legacyFences.length) return value || null;
  const raw = object(value);
  const normalized = normalizeFence3d(value);
  const shapeById = new Map((Array.isArray(shapes) ? shapes : []).map((shape) => [shape.id, shape]));
  const conditions = { ...normalized.conditions };
  const explicitlyConfiguredConditions = new Set(Object.entries(raw.conditions || {})
    .filter(([, config]) => TYPES.includes(config?.type) || config?.type === "exclude")
    .map(([key]) => key));
  for (const [runId, config] of Object.entries(raw.runs || {})) {
    if (!TYPES.includes(config?.type) && config?.type !== "exclude") continue;
    const shape = shapeById.get(runId);
    if (!shape || shape.measure_role !== "linear") continue;
    explicitlyConfiguredConditions.add(fenceConditionKey(shape.sheet_id, shape.condition_id || `shape:${shape.id}`));
  }
  let migrated = false;
  for (const legacy of legacyFences) {
    const shape = shapeById.get(legacy?.shape_id);
    if (!shape || shape.measure_role !== "linear") continue;
    const conditionId = shape.condition_id || `shape:${shape.id}`;
    const key = fenceConditionKey(shape.sheet_id || legacy.sheet_id, conditionId);
    if (explicitlyConfiguredConditions.has(key)) continue;
    const panelSpan = Number(legacy.panel_width_ft);
    conditions[key] = {
      ...conditions[key],
      type: "ornamental",
      spec: normalizeOrnamentalSpec({
        max_panel_span_ft: Number.isFinite(panelSpan) && [6, 8].includes(panelSpan)
          ? panelSpan : ORNAMENTAL_SPEC.max_panel_span_ft,
        strategy: "maximum",
      }),
    };
    migrated = true;
  }
  return migrated ? { ...normalized, conditions } : value || null;
}

export function normalizeOrnamentalSpec(spec) {
  const result = { ...ORNAMENTAL_SPEC };
  for (const [name, minimum, maximum] of [
    ["height_ft", 1, 20], ["elevation_ft", -1000, 1000], ["bottom_clearance_in", 0, 36],
    ["max_panel_span_ft", 1, 20], ["picket_spacing_in", 1, 12], ["post_size_in", 1, 8],
    ["rail_width_in", .5, 6], ["rail_depth_in", .5, 6], ["picket_size_in", .25, 3],
    ["max_swivel_deg", 0, 45],
  ]) result[name] = range(spec?.[name], minimum, maximum, ORNAMENTAL_SPEC[name]);
  result.strategy = choices(spec?.strategy, ["even", "maximum"], ORNAMENTAL_SPEC.strategy);
  result.rails = choices(spec?.rails, [2, 3], ORNAMENTAL_SPEC.rails);
  result.finish_color = color(spec?.finish_color, ORNAMENTAL_SPEC.finish_color);
  Object.assign(result, normalizeFoundationSettings(spec, result.height_ft, "ornamental"));
  return result;
}

export function normalizeWoodSpec(spec) {
  const result = { ...WOOD_SPEC };
  for (const [name, minimum, maximum] of [
    ["height_ft", 1, 20], ["elevation_ft", -1000, 1000], ["bottom_clearance_in", 0, 36],
    ["max_bay_span_ft", 1, 20], ["post_size_in", 1, 12], ["terminal_post_size_in", 1, 16],
    ["gate_post_size_in", 1, 16], ["rail_width_in", .5, 12], ["rail_depth_in", .5, 8],
    ["picket_width_in", .5, 12], ["picket_gap_in", 0, 6], ["gravel_depth_in", 0, 36],
  ]) result[name] = range(spec?.[name], minimum, maximum, WOOD_SPEC[name]);
  result.rails = choices(spec?.rails, [2, 3], WOOD_SPEC.rails);
  result.spacing_strategy = choices(spec?.spacing_strategy, ["balanced", "maximum"], WOOD_SPEC.spacing_strategy);
  result.finish_color = color(spec?.finish_color, WOOD_SPEC.finish_color);
  for (const name of ["cap_board", "kickboard", "fasteners", "footings", "gravel_beds"]) {
    if (typeof spec?.[name] === "boolean") result[name] = spec[name];
  }
  const automatic = spec?.foundationAuto !== false;
  const foundation = normalizeFoundationSettings({
    foundationAuto: automatic,
    foundationDepthFt: spec?.foundationDepthFt,
    foundationDiameterIn: spec?.foundationDiameterIn,
  }, result.height_ft, "wood");
  result.foundationAuto = automatic;
  result.foundationDepthFt = foundation.foundationDepthFt;
  result.foundationDiameterIn = foundation.foundationDiameterIn;
  return result;
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
  for (const name of [...FRAME_COMPONENTS.map(([id]) => id), ...FITTINGS.map(([id]) => id), "fittings", "barbedWire", "footings"]) {
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
  const height = range(spec?.height, 1, 50, SPEC.height);
  Object.assign(result, normalizeFoundationSettings(spec, height, "chain-link"));
  // Preserve this legacy field when reading old projects; concrete foundations
  // are now generated from the independent foundation dimensions above.
  if (typeof spec?.footings === "boolean") result.footings = spec.footings;
  return result;
}

export function runSpec(run, conditionSpec) {
  // Chain-link fence records now hold topology only. Their former calculator
  // spacing field must not override settings owned by the 3D workspace.
  const result = { ...SPEC, ...run?.spec, ...conditionSpec };
  Object.assign(result, normalizeFoundationSettings(result, result.height, "chain-link"));
  return result;
}
