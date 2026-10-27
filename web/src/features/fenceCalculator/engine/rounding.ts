import type { RoundingRule } from "../types.ts";

const DEFAULT_INCREMENT = 1;

export function roundToPrecision(value: number, precision = 6): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** precision;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function applyWaste(quantity: number, wastePercent = 0): number {
  return quantity * (1 + wastePercent / 100);
}

export function roundOrderQuantity(quantity: number, rule: RoundingRule = {}): number {
  if (!Number.isFinite(quantity)) return quantity;
  const packSize = rule.packSize && rule.packSize > 0 ? rule.packSize : 1;
  const increment = rule.increment && rule.increment > 0 ? rule.increment : DEFAULT_INCREMENT;
  const mode = rule.mode || "ceil";
  const step = packSize * increment;
  const scaled = quantity / step;
  let rounded: number;
  switch (mode) {
    case "none":
      rounded = quantity;
      break;
    case "floor":
      rounded = Math.floor(scaled) * step;
      break;
    case "nearest":
      rounded = Math.round(scaled) * step;
      break;
    default:
      rounded = Math.ceil(scaled) * step;
      break;
  }
  return roundToPrecision(rounded, rule.precision ?? 6);
}
