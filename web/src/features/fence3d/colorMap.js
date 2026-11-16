import { FITTINGS, FRAME_COMPONENTS, METERS_PER_FOOT as FT, METERS_PER_INCH as IN } from "./settings.js";
import { braceSegments } from "./layout.js";

export const FENCE_COMPONENT_COLORS = Object.freeze({
  fabric: "#15191f", gateArea: "#5c677d", rails: "#e63946", wire: "#00a6a6", barbedWire: "#d000a5",
  "post:line": "#e9c46a", "post:panel": "#c77dff", "post:end": "#2a9d8f", "post:corner": "#f77f00", "post:junction": "#6c4ccf",
  "post:threeway": "#6c4ccf", "post:fourway": "#4361ee", "post:multiway": "#8a4fff",
  "post:pull": "#00a6fb", "post:gate": "#a23b72", tensionBars: "#4361ee", tensionBands: "#277da1",
  foundations: "#8d99ae",
  bandBolts: "#4d908e", railEnds: "#f9844a", braceBands: "#9b5de5", caps: "#6d597a",
  loopCaps: "#43aa8b", railSleeves: "#f3722c", ties: "#90be6d", hogRings: "#577590",
  trussRods: "#bc6c25", barbArms: "#f72585", footings: "#8d99ae", gateHinges: "#3a86ff",
  gateLatches: "#8338ec", gateDropRods: "#fb5607", gateRollers: "#219ebc", gateStops: "#e76f51",
  gateReceiver: "#7209b7",
  gateTypeSingle: "#277da1", gateTypeDouble: "#f9844a", gateTypeOverhead: "#6c4ccf", gateTypeCantilever: "#2a9d8f",
  guardrail: "#d2a83e",
  pickets: "#f4a261", gateFrame: "#c86b32", flatBrackets: "#457b9d", swivelBrackets: "#e76f51",
  ornamentalPanels: "#8f6ac8",
  ornamentalHinges: "#2a9d8f", ornamentalLatches: "#8338ec", ornamentalKeepers: "#6d597a",
  ornamentalDropRods: "#fb5607", ornamentalCaps: "#8d99ae",
});

const componentLabels = new Map([
  ["fabric", "Fence fabric"], ["gateArea", "Gate infill"], ["rails", "Rails"], ["wire", "Tension wire"],
  ["barbedWire", "Barbed wire"], ["post:line", "Line posts"], ["post:panel", "Panel posts"], ["post:end", "End posts"],
  ["post:corner", "Corner posts"], ["post:junction", "Junction posts"],
  ["post:threeway", "3-way posts"], ["post:fourway", "4-way posts"], ["post:multiway", "5-way+ posts"], ["post:pull", "Pull posts"],
  ["post:gate", "Gate posts"],
  ["pickets", "Ornamental pickets"], ["ornamentalPanels", "Ornamental panels"], ["gateFrame", "Gate frame stiles"],
  ["flatBrackets", "Flat rail brackets"], ["swivelBrackets", "Swivel rail brackets"],
  ["ornamentalHinges", "Ornamental hinge sets"], ["ornamentalLatches", "Ornamental latch sets"],
  ["ornamentalKeepers", "Gate keepers"], ["ornamentalDropRods", "Gate drop rods"], ["ornamentalCaps", "Ornamental post caps"],
]);
for (const [id, title] of FITTINGS) componentLabels.set(id, title);
componentLabels.set("gateRollers", "Gate rollers and overhead track");

const formatLength = (value, units) => `${(units === "metric" ? value : value / FT).toFixed(2)} ${units === "metric" ? "m" : "ft"} LF`;
const formatLinearFeet = (value) => `${(value / FT).toFixed(2)} LF`;
const formatArea = (value, units) => `${(units === "metric" ? value : value / (FT * FT)).toFixed(2)} ${units === "metric" ? "m²" : "ft²"} SF`;
const formatCount = (value) => Number(value || 0).toLocaleString();
const formatVolume = (value) => `${Number(value || 0).toFixed(2)} yd³`;
const formatRowLength = (row, value, units) => row.category === "fabric" || row.category === "rails" || row.category === "guardrail"
  ? formatLinearFeet(value) : formatLength(value, units);

function midpoint(run, y) {
  const span = [...(run?.spans || [])].sort((a, b) => b.length - a.length)[0];
  if (!span) return null;
  return [(span.a[0] + span.b[0]) / 2, y, (span.a[1] + span.b[1]) / 2];
}

function fittingPoint(layout, kind) {
  for (const pieces of layout.fittings.partsByRun.values()) {
    const piece = pieces.find((item) => item.kind === kind);
    if (piece?.at) return [...piece.at];
    if (piece?.a && piece?.b) return piece.a.map((value, index) => (value + piece.b[index]) / 2);
  }
  return null;
}

function componentAnchor(layout, category) {
  if (category.startsWith("post:")) {
    const post = layout.posts.find((item) => item.type === category.slice(5));
    return post ? [post.point[0], post.base + post.height * .6, post.point[1]] : null;
  }
  if (category === "fabric") {
    const run = layout.runs.find((item) => item.spans.length);
    return midpoint(run, run ? (run.spec.elevation * FT + run.spec.clearance * IN + run.spec.height * FT / 2) : 0);
  }
  if (category === "gateArea") {
    const run = layout.runs.find((item) => item.gates.length);
    const gate = run?.gates[0];
    if (!gate) return null;
    return [(gate.a[0] + gate.b[0]) / 2, run.spec.elevation * FT + gate.clearance * IN + gate.height * FT / 2,
      (gate.a[1] + gate.b[1]) / 2];
  }
  if (category === "barbedWire" || FITTINGS.some(([id]) => id === category)) return fittingPoint(layout, category);
  const suffix = category === "rails" ? "Rail" : "Wire";
  const run = layout.runs.find((item) => FRAME_COMPONENTS.some(([id]) => id.endsWith(suffix) && item.spec[id]));
  if (!run) return null;
  const member = FRAME_COMPONENTS.find(([id]) => id.endsWith(suffix) && run.spec[id])?.[0];
  const percent = run.spec[member + "Height"] ?? (category === "rails" ? 100 : 2);
  const y = run.spec.elevation * FT + run.spec.clearance * IN + run.spec.height * FT * percent / 100;
  return midpoint(run, y);
}

function componentIdsFor(layout, category) {
  const unique = (values) => [...new Set(values.filter((value) => typeof value === "string" && value))];
  if (category.startsWith("post:")) {
    const type = category.slice(5);
    return unique(layout.posts.filter((post) => post.type === type).map((post) => post.component_id));
  }
  if (category === "fabric") return unique(layout.runs.flatMap((run) => run.spans.map((span) => span.component_id)));
  if (category === "gateArea") return unique(layout.runs.flatMap((run) => run.gates.flatMap((gate) =>
    Array.from({ length: gate.type === "double" ? 2 : 1 }, (_, index) => `${run.id}:gate:${gate.id}:leaf:${index + 1}:fabric`))));
  if (category === "rails" || category === "wire") {
    const suffix = category === "rails" ? "Rail" : "Wire";
    const ids = layout.runs.flatMap((run) => run.spans.flatMap((span) => FRAME_COMPONENTS
      .filter(([id]) => id.endsWith(suffix) && run.spec[id] && (category !== "rails" || id !== "braceRail"))
      .map(([id]) => `${run.id}:component:${id}:${span.id}`)));
    if (category === "rails") ids.push(...layout.runs.flatMap((run) => braceSegments(run)
      .map((_, index) => `${run.id}:component:braceRail:${index + 1}`)));
    return unique(ids);
  }
  return unique(layout.fittings.componentIds?.[category] || []);
}

function postOverallHeight(heightFt) {
  const inches = Math.max(0, Math.round(heightFt * 12));
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder ? ` ${remainder}"` : ""} H incl. foundation`;
}

function foundationHeightDetail(posts, category) {
  const type = category.slice("post:".length);
  const heights = posts.filter((post) => post.type === type).map((post) =>
    (post.fenceHeightFt ?? ((post.height ?? ((post.top || 0) - (post.base || 0))) / FT))
      + (post.foundationDepthFt || 0));
  return heights.length ? `Overall ${postOverallHeight(Math.max(...heights))}` : "";
}

export function foundationVolumeCubicYards(elements) {
  const unique = new Map();
  for (const element of elements || []) {
    const id = element.component_id || element.id;
    if (!id || unique.has(id)) continue;
    const diameterFt = Number(element.foundationDiameterIn) / 12;
    const depthFt = Number(element.foundationDepthFt);
    if (!(diameterFt > 0 && depthFt > 0)) continue;
    unique.set(id, Math.PI * (diameterFt / 2) ** 2 * depthFt / 27);
  }
  return [...unique.values()].reduce((sum, volume) => sum + volume, 0);
}

export function buildFoundationColorMapRow(elements) {
  const unique = new Map();
  for (const element of elements || []) {
    const componentId = element.component_id || element.id;
    if (componentId && !unique.has(componentId)) unique.set(componentId, element);
  }
  if (!unique.size) return null;
  const posts = [...unique.values()];
  const volume = foundationVolumeCubicYards(posts);
  const first = posts[0];
  const base = first.base ?? first.point?.[1] ?? 0;
  const depth = (first.foundationDepthFt || 0) * FT;
  const point = first.point || [0, base, 0];
  return { id: "foundations", title: "Concrete foundations", category: "foundations",
    quantity: formatVolume(volume), count: volume, measure: "volume",
    componentIds: posts.map((post) => `${post.component_id || post.id}:foundation`),
    color: FENCE_COMPONENT_COLORS.foundations, anchor: [point[0], base - depth / 2, point[2] ?? point[1]] };
}

export function buildColorMapRows(layout, units, fabricMeasure = "length") {
  const { totals: t, fittings } = layout;
  const postCount = (type) => new Set(layout.posts.filter((post) => post.type === type)
    .map((post) => post.component_id).filter(Boolean)).size;
  const fittingCount = (kind) => new Set(fittings.componentIds?.[kind] || []).size;
  const fabricQuantity = fabricMeasure === "area" ? formatArea(t.area, units) : formatLinearFeet(t.fabric);
  const fabricCount = fabricMeasure === "area" ? t.area : t.fabric;
  const rows = [
    { id: "fabric", title: componentLabels.get("fabric"), category: "fabric", quantity: fabricQuantity, count: fabricCount, measure: fabricMeasure === "area" ? "area" : "length" },
    { id: "gateArea", title: componentLabels.get("gateArea"), category: "gateArea", quantity: formatArea(t.gateArea, units), count: t.gateArea, measure: "area" },
    { id: "rails", title: componentLabels.get("rails"), category: "rails", quantity: formatLinearFeet(t.rail),
      detail: `${(t.rail / FT / 21).toFixed(2)} units at 21'`, count: t.rail, measure: "length" },
    { id: "wire", title: componentLabels.get("wire"), category: "wire", quantity: formatLength(t.wire, units), count: t.wire, measure: "length" },
    { id: "barbedWire", title: componentLabels.get("barbedWire"), category: "barbedWire", quantity: formatLength(fittings.barbedLength, units), count: fittings.barbedLength, measure: "length" },
    ...[["line", "line"], ["end", "end"], ["corner", "corner"], ["threeway", "threeway"], ["fourway", "fourway"], ["multiway", "multiway"], ["pull", "pull"], ["gate", "gate"]]
      .map(([id, type]) => {
        const count = postCount(type);
        return { id: `post:${id}`, title: componentLabels.get(`post:${type}`), category: `post:${type}`, quantity: `${formatCount(count)} count`, count, measure: "count" };
      }),
    ...FITTINGS.map(([id, title]) => {
      const count = fittingCount(id);
      return { id, title, category: id, quantity: `${formatCount(count)} count`, count, measure: "count" };
    }),
  ];
  return rows.map((row) => ({ ...row, ...(row.category.startsWith("post:") ? { detail: foundationHeightDetail(layout.posts, row.category) } : {}),
    componentIds: componentIdsFor(layout, row.category),
    color: FENCE_COMPONENT_COLORS[row.category], anchor: componentAnchor(layout, row.category) }));
}

export function buildOrnamentalColorMapRows(layout, units) {
  const totals = layout.totals;
  const panelComponentIds = [...new Set(layout.panels.map((panel) => panel.component_id).filter(Boolean))];
  const counts = [
    ["post:panel", "panelPosts"], ["post:end", "end"], ["post:corner", "corner"], ["post:junction", "junction"], ["post:gate", "gate"],
  ];
  const measureLength = (id, title, value) => ({ id, title, category: id, quantity: formatLength(value, units), count: value, measure: "length" });
  const measureRailLength = (value) => ({ id: "rails", title: componentLabels.get("rails"), category: "rails",
    quantity: formatLinearFeet(value), count: value, measure: "length" });
  const measureCount = (id, title, componentCategory, value) => ({ id, title, category: componentCategory, quantity: `${formatCount(value)} count`, count: value, measure: "count" });
  const rows = [measureRailLength(totals.rails),
    measureCount("ornamentalPanels", componentLabels.get("ornamentalPanels"), "ornamentalPanels", panelComponentIds.length),
    measureLength("gateFrame", componentLabels.get("gateFrame"), totals.gateFrameLength),
    measureCount("pickets", componentLabels.get("pickets"), "pickets", totals.pickets),
    ...counts.map(([category, type]) => measureCount(category, componentLabels.get(category), category, totals[type])),
    measureCount("flatBrackets", componentLabels.get("flatBrackets"), "flatBrackets", totals.flatBrackets),
    measureCount("swivelBrackets", componentLabels.get("swivelBrackets"), "swivelBrackets", totals.swivelBrackets),
    measureCount("ornamentalHinges", componentLabels.get("ornamentalHinges"), "ornamentalHinges", totals.hinges),
    measureCount("gateRollers", componentLabels.get("gateRollers"), "gateRollers", layout.componentIds.gateRollers?.length || 0),
    measureCount("ornamentalLatches", componentLabels.get("ornamentalLatches"), "ornamentalLatches", totals.latches),
    measureCount("ornamentalKeepers", componentLabels.get("ornamentalKeepers"), "ornamentalKeepers", totals.keepers),
    measureCount("ornamentalDropRods", componentLabels.get("ornamentalDropRods"), "ornamentalDropRods", totals.dropRods),
    measureCount("ornamentalCaps", componentLabels.get("ornamentalCaps"), "ornamentalCaps", totals.caps)];
  const postAnchor = (type) => {
    const post = layout.posts.find((item) => item.type === type);
    return post ? [post.point[0], (post.base + post.top) / 2, post.point[1]] : null;
  };
  const anchorFor = (category) => {
    if (category.startsWith("post:")) return postAnchor(category.slice(5));
    if (category === "ornamentalCaps") {
      const post = layout.posts[0];
      return post ? [post.point[0], post.top + .04, post.point[1]] : null;
    }
    if (category === "ornamentalPanels") {
      const panel = layout.panels[0];
      return panel ? [(panel.a[0] + panel.b[0]) / 2, (panel.bottom + panel.top) / 2,
        (panel.a[1] + panel.b[1]) / 2] : null;
    }
    if (category === "rails") {
      const panel = layout.panels[0];
      return panel ? [(panel.a[0] + panel.b[0]) / 2, panel.rail1.y, (panel.a[1] + panel.b[1]) / 2] : null;
    }
    if (category === "gateFrame") {
      const leaf = layout.gates[0]?.leaves[0];
      return leaf ? [leaf.hinge[0], (leaf.bottom + leaf.top) / 2, leaf.hinge[1]] : null;
    }
    if (category === "gateRollers") {
      const gate = layout.gates.find((item) => item.type === "overhead");
      if (!gate) return null;
      const run = layout.runs.find((item) => item.id === gate.runId);
      return [(gate.a[0] + gate.b[0]) / 2,
        run.spec.elevation_ft * FT + gate.clearance * IN + gate.height * FT + .12,
        (gate.a[1] + gate.b[1]) / 2];
    }
    if (category === "pickets") {
      const picket = layout.panels.flatMap((panel) => panel.pickets)[0] || layout.gates.flatMap((gate) => gate.leaves.flatMap((leaf) => leaf.pickets))[0];
      return picket ? [picket.point[0], (picket.bottom + picket.top) / 2, picket.point[1]] : null;
    }
    const bracket = layout.panels.flatMap((panel) => panel.brackets || []).find((item) => item.kind === category);
    if (bracket) return bracket.point;
    const gate = layout.gates[0];
    if (!gate) return null;
    return [(gate.a[0] + gate.b[0]) / 2, layout.runs.find((run) => run.id === gate.runId)?.spec.elevation_ft * FT + .7, (gate.a[1] + gate.b[1]) / 2];
  };
  return rows.map((row) => ({ ...row, ...(row.category.startsWith("post:") ? { detail: foundationHeightDetail(layout.posts, row.category) } : {}), componentIds: row.category === "ornamentalPanels"
    ? panelComponentIds : layout.componentIds[row.category] || [], color: FENCE_COMPONENT_COLORS[row.category],
    anchor: anchorFor(row.category) }));
}

export function buildGuardrailColorMapRows(layout) {
  const routes = layout.routes || [];
  const feet = layout.totals.length / FT;
  const componentIds = routes.flatMap((route) => [route.beamComponentId,
    ...route.supports.map((support) => support.component_id),
    ...route.terminals.map((terminal) => terminal.component_id)]);
  return [{ id: "guardrail", title: "Guardrail", category: "guardrail",
    quantity: `${feet.toFixed(2)} LF`, count: feet, measure: "length", componentIds,
    color: FENCE_COMPONENT_COLORS.guardrail, anchor: routes.find((route) => route.anchor)?.anchor || null }];
}

export function combineColorMapRows(units, ...groups) {
  const rows = new Map();
  for (const row of groups.flat()) {
    const previous = rows.get(row.category);
    if (!previous) { rows.set(row.category, { ...row, componentIds: [...(row.componentIds || [])] }); continue; }
    const measure = previous.measure || row.measure;
    const count = previous.count + row.count;
    const quantity = measure === "length" ? formatRowLength(previous, count, units)
      : measure === "area" ? formatArea(count, units) : measure === "volume" ? formatVolume(count) : `${formatCount(count)} count`;
    rows.set(row.category, { ...previous, count, quantity, measure,
      componentIds: [...new Set([...previous.componentIds, ...(row.componentIds || [])])], anchor: previous.anchor || row.anchor });
  }
  return [...rows.values()].map((row) => ({ ...row, quantity: row.measure === "length" ? formatRowLength(row, row.count, units)
    : row.measure === "area" ? formatArea(row.count, units) : row.measure === "volume" ? formatVolume(row.count) : `${formatCount(row.count)} count` }));
}
