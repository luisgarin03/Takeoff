import { FITTINGS, FRAME_COMPONENTS, METERS_PER_FOOT as FT, METERS_PER_INCH as IN } from "./settings.js";
import { braceSegments } from "./layout.js";

export const FENCE_COMPONENT_COLORS = Object.freeze({
  fabric: "#15191f", gateArea: "#5c677d", rails: "#e63946", wire: "#00a6a6", barbedWire: "#d000a5",
  "post:line": "#e9c46a", "post:end": "#2a9d8f", "post:corner": "#f77f00", "post:junction": "#6c4ccf",
  "post:pull": "#00a6fb", "post:gate": "#a23b72", tensionBars: "#4361ee", tensionBands: "#277da1",
  bandBolts: "#4d908e", railEnds: "#f9844a", braceBands: "#9b5de5", caps: "#6d597a",
  loopCaps: "#43aa8b", railSleeves: "#f3722c", ties: "#90be6d", hogRings: "#577590",
  trussRods: "#bc6c25", barbArms: "#f72585", footings: "#8d99ae", gateHinges: "#3a86ff",
  gateLatches: "#8338ec", gateDropRods: "#fb5607", gateRollers: "#219ebc", gateStops: "#e76f51",
  gateReceiver: "#7209b7",
});

const componentLabels = new Map([
  ["fabric", "Fence fabric"], ["gateArea", "Gate infill"], ["rails", "Rails"], ["wire", "Tension wire"],
  ["barbedWire", "Barbed wire"], ["post:line", "Line posts"], ["post:end", "End posts"],
  ["post:corner", "Corner posts"], ["post:junction", "Junction posts"], ["post:pull", "Pull posts"],
  ["post:gate", "Gate posts"],
]);
for (const [id, title] of FITTINGS) componentLabels.set(id, title);

const formatLength = (value, units) => `${(units === "metric" ? value : value / FT).toFixed(2)} ${units === "metric" ? "m" : "ft"} LF`;
const formatArea = (value, units) => `${(units === "metric" ? value : value / (FT * FT)).toFixed(2)} ${units === "metric" ? "m²" : "ft²"} SF`;
const formatCount = (value) => Number(value || 0).toLocaleString();

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

export function buildColorMapRows(layout, units, fabricMeasure = "length") {
  const { totals: t, fittings } = layout;
  const postCount = (type) => new Set(layout.posts.filter((post) => post.type === type)
    .map((post) => post.component_id).filter(Boolean)).size;
  const fittingCount = (kind) => new Set(fittings.componentIds?.[kind] || []).size;
  const fabricQuantity = fabricMeasure === "area" ? formatArea(t.area, units) : formatLength(t.fabric, units);
  const fabricCount = fabricMeasure === "area" ? t.area : t.fabric;
  const rows = [
    { id: "fabric", title: componentLabels.get("fabric"), category: "fabric", quantity: fabricQuantity, count: fabricCount },
    { id: "gateArea", title: componentLabels.get("gateArea"), category: "gateArea", quantity: formatArea(t.gateArea, units), count: t.gateArea },
    { id: "rails", title: componentLabels.get("rails"), category: "rails", quantity: formatLength(t.rail, units), count: t.rail },
    { id: "wire", title: componentLabels.get("wire"), category: "wire", quantity: formatLength(t.wire, units), count: t.wire },
    { id: "barbedWire", title: componentLabels.get("barbedWire"), category: "barbedWire", quantity: formatLength(fittings.barbedLength, units), count: fittings.barbedLength },
    ...[["line", "line"], ["end", "end"], ["corner", "corner"], ["junction", "junction"], ["pull", "pull"], ["gate", "gate"]]
      .map(([id, type]) => {
        const count = postCount(type);
        return { id: `post:${id}`, title: componentLabels.get(`post:${type}`), category: `post:${type}`, quantity: `${formatCount(count)} count`, count };
      }),
    ...FITTINGS.map(([id, title]) => {
      const count = fittingCount(id);
      return { id, title, category: id, quantity: `${formatCount(count)} count`, count };
    }),
  ];
  return rows.map((row) => ({ ...row, componentIds: componentIdsFor(layout, row.category),
    color: FENCE_COMPONENT_COLORS[row.category], anchor: componentAnchor(layout, row.category) }));
}
