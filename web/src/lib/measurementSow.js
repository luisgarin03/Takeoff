import { areaUnit, areaVal, lenUnit, lenVal } from "./units";
import { conditionTotals, round2 } from "./totals.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = "#C96442";

const measurementColor = (condition) => typeof condition?.color === "string" && HEX_COLOR.test(condition.color)
  ? condition.color.toUpperCase() : FALLBACK_COLOR;
const conditionForShape = (shape, conditionsById) => conditionsById.get(shape.condition_id)
  || { finish_tag: "Condition", color: FALLBACK_COLOR };

/**
 * Automatic plan notes are enabled by default for backward compatibility.
 * A condition stores only an explicit false when the estimator turns them off.
 */
export function conditionAutoNoteArrowEnabled(condition) {
  return condition?.auto_note_arrow !== false;
}

function formatQuantity(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** The quantity recorded in the automatic Whiteboard SOW line item. */
export function measurementQuantity(shape, units = "imperial") {
  const computed = shape?.computed || {};
  switch (shape?.measure_role) {
    case "count":
      return `${formatQuantity(computed.count || 1, 0)} EA`;
    case "linear": {
      const length = Number(computed.perimeter_lf) || 0;
      // Estimating SOW rows carry order-facing LF: any partial foot rounds up,
      // while the underlying takeoff remains precise everywhere else.
      if (units !== "metric") return `${Math.ceil(length).toLocaleString()} ${lenUnit(units)}`;
      return `${formatQuantity(lenVal(length, units))} ${lenUnit(units)}`;
    }
    case "deduct":
      return `-${formatQuantity(areaVal(computed.area_sf || 0, units))} ${areaUnit(units)}`;
    case "surface_area":
    case "floor_area":
    default:
      return `${formatQuantity(areaVal(computed.area_sf || 0, units))} ${areaUnit(units)}`;
  }
}

/** Exact SOW copy requested by estimators: `[measurement] - condition name`. */
export function measurementSowText(shape, condition, units = "imperial") {
  const name = String(condition?.finish_tag || "Condition").trim() || "Condition";
  return `[${measurementQuantity(shape, units)}] - ${name}`;
}

/** @param {any[]} shapes @param {string} [units] @param {any} [condition] */
export function measurementAggregateQuantity(shapes, units = "imperial", condition = null) {
  let hasArea = false, hasLinear = false, hasCount = false;
  for (const shape of shapes || []) {
    if (shape?.measure_role === "linear") hasLinear = true;
    else if (shape?.measure_role === "count") hasCount = true;
    else hasArea = true;
  }
  // Run through the same role-aware arithmetic used by the live Takeoffs and
  // Report totals. This deliberately reads only the persisted numeric
  // `computed` values; it never derives geometry again or totals display text.
  // conditionTotals applies the condition multiplier but keeps waste confined
  // to its separate *_net fields, which are not used here.
  const aggregateId = "__whiteboard_sow_total__";
  const total = conditionTotals(
    [{ id: aggregateId, multiplier: condition?.multiplier }],
    (shapes || []).map((shape) => ({ ...shape, condition_id: aggregateId })),
  )[0];
  const linearLf = total?.lf || 0;
  const areaSf = round2((total?.floor_sf || 0) + (total?.wall_sf || 0));
  const count = total?.ea || 0;
  const values = [];
  if (hasLinear) values.push(units === "metric"
    ? `${formatQuantity(lenVal(linearLf, units))} ${lenUnit(units)}`
    : `${Math.ceil(linearLf).toLocaleString()} ${lenUnit(units)}`);
  if (hasArea) values.push(`${formatQuantity(areaVal(areaSf, units))} ${areaUnit(units)}`);
  if (hasCount) values.push(`${formatQuantity(count, 0)} EA`);
  return values.join(" · ") || `0 ${lenUnit(units)}`;
}

export function measurementAggregateSowText(shapes, condition, units = "imperial") {
  const name = String(condition?.finish_tag || "Condition").trim() || "Condition";
  return `[${measurementAggregateQuantity(shapes, units, condition)}] - ${name}`;
}

function segmentMidpointOnLongestEdge(verts, closeRing) {
  if (!verts.length) return [0.5, 0.5];
  if (verts.length === 1) return [...verts[0]];
  let best = { length: -1, point: [...verts[0]] };
  const count = closeRing ? verts.length : verts.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = verts[index], b = verts[(index + 1) % verts.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > best.length) best = { length, point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  }
  return best.point;
}

/**
 * Place the arrow tip directly on the measured geometry and the label nearby.
 * Coordinates remain normalized, so zoom, pan and raster resolution do not
 * affect the resulting callout or its PDF export.
 */
export function measurementCalloutGeometry(shape) {
  const verts = Array.isArray(shape?.verts_norm)
    ? shape.verts_norm.filter((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))
    : [];
  const open = shape?.measure_role === "linear" || shape?.measure_role === "surface_area";
  const target = segmentMidpointOnLongestEdge(verts, !open && shape?.measure_role !== "count");
  const dx = target[0] > 0.72 ? -0.16 : 0.06;
  const dy = target[1] < 0.14 ? 0.08 : -0.07;
  return {
    target: [clamp(target[0], 0, 1), clamp(target[1], 0, 1)],
    at: [clamp(target[0] + dx, 0.025, 0.86), clamp(target[1] + dy, 0.035, 0.965)],
  };
}

export function measurementCallout(shape, condition, units = "imperial") {
  const color = measurementColor(condition);
  return { type: "callout", ...measurementCalloutGeometry(shape), text: measurementSowText(shape, condition, units), color, measurement_shape_id: shape.id };
}

/** Keep only linked automatic SOW rows synchronized; manual rows are untouched. */
export function syncMeasurementSowBoard(board, shapes, conditions, units = "imperial") {
  if (!Array.isArray(board?.sows)) return board;
  const shapesById = new Map((shapes || []).map((shape) => [shape.id, shape]));
  const conditionsById = new Map((conditions || []).map((condition) => [condition.id, condition]));
  let boardChanged = false;
  const sows = board.sows.map((sow) => {
    let sowChanged = false;
    const tabs = sow.tabs.map((tab) => {
      const linked = tab.entries.filter((entry) => entry.measurementShapeId || entry.measurementConditionId || entry.measurementShapeIds?.length);
      if (!linked.length) return tab;
      const firstLinkedIndex = tab.entries.findIndex((entry) => linked.includes(entry));
      const trackedIds = [];
      const seenIds = new Set();
      for (const entry of linked) {
        const ids = Array.isArray(entry.measurementShapeIds) ? entry.measurementShapeIds : entry.measurementShapeId ? [entry.measurementShapeId] : [];
        for (const id of ids) if (!seenIds.has(id)) { seenIds.add(id); trackedIds.push(id); }
      }
      const groups = new Map();
      for (const id of trackedIds) {
        const shape = shapesById.get(id);
        if (!shape) continue;
        if (!groups.has(shape.condition_id)) groups.set(shape.condition_id, []);
        groups.get(shape.condition_id).push(shape);
      }
      const unusedEntries = [...linked];
      const aggregates = [];
      for (const [conditionId, conditionShapes] of groups) {
        let sourceIndex = unusedEntries.findIndex((entry) => entry.measurementConditionId === conditionId);
        // Legacy rows were linked to one shape and did not carry a condition.
        // They are safe to reuse during migration. An existing aggregate for a
        // different condition is reserved for that condition; a reassignment
        // receives a fresh row instead of stealing the old row's identity.
        if (sourceIndex < 0) sourceIndex = unusedEntries.findIndex((entry) => !entry.measurementConditionId);
        const source = sourceIndex >= 0 ? unusedEntries.splice(sourceIndex, 1)[0] : {
          id: `sow-entry-${crypto.randomUUID()}`,
          text: "",
          color: FALLBACK_COLOR,
        };
        const condition = conditionForShape(conditionShapes[0], conditionsById);
        const { measurementShapeId: _legacyShapeId, ...rest } = source;
        aggregates.push({
          ...rest,
          text: measurementAggregateSowText(conditionShapes, condition, units),
          color: measurementColor(condition),
          measurementConditionId: conditionId,
          measurementShapeIds: conditionShapes.map((shape) => shape.id),
        });
      }
      const manual = tab.entries.filter((entry) => !linked.includes(entry));
      const entries = [...manual];
      entries.splice(Math.min(firstLinkedIndex, entries.length), 0, ...aggregates);
      const unchanged = entries.length === tab.entries.length && entries.every((entry, index) => {
        const prior = tab.entries[index];
        return entry === prior || (entry.id === prior.id && entry.text === prior.text && entry.color === prior.color
          && entry.measurementConditionId === prior.measurementConditionId
          && JSON.stringify(entry.measurementShapeIds) === JSON.stringify(prior.measurementShapeIds));
      });
      if (unchanged) return tab;
      sowChanged = true;
      return { ...tab, entries };
    });
    if (!sowChanged) return sow;
    boardChanged = true;
    return { ...sow, tabs };
  });
  return boardChanged ? { ...board, sows } : board;
}

/** Keep linked automatic plan callouts synchronized; manual markups are untouched. */
export function syncMeasurementCallouts(markups, shapes, conditions, units = "imperial") {
  const shapesById = new Map((shapes || []).map((shape) => [shape.id, shape]));
  const conditionsById = new Map((conditions || []).map((condition) => [condition.id, condition]));
  let changed = false;
  const next = [];
  for (const markup of markups || []) {
    if (!markup.measurement_shape_id) { next.push(markup); continue; }
    const shape = shapesById.get(markup.measurement_shape_id);
    if (!shape) { changed = true; continue; }
    const condition = conditionForShape(shape, conditionsById);
    const expected = measurementCallout(shape, condition, units);
    const sameTarget = Array.isArray(markup.target) && markup.target.length === 2
      && markup.target[0] === expected.target[0] && markup.target[1] === expected.target[1];
    if (markup.text === expected.text && markup.color === expected.color && markup.sheet_id === shape.sheet_id && sameTarget) next.push(markup);
    else {
      // Preserve a manually repositioned label anchor; only the arrow tip,
      // measurement copy, condition color and owning sheet stay linked.
      next.push({ ...markup, text: expected.text, color: expected.color, target: expected.target, sheet_id: shape.sheet_id });
      changed = true;
    }
  }
  return changed ? next : markups;
}
