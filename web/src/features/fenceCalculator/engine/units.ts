import type { FenceUnit } from "../types.ts";

export const INCHES_PER_FOOT = 12;
export const CUBIC_FEET_PER_CUBIC_YARD = 27;

const UNIT_ALIASES: Record<string, FenceUnit> = {
  lf: "LF",
  "linear foot": "LF",
  "linear feet": "LF",
  ft: "FT",
  foot: "FT",
  feet: "FT",
  in: "IN",
  inch: "IN",
  inches: "IN",
  ea: "EA",
  each: "EA",
  bag: "BAG",
  bags: "BAG",
  panel: "PANEL",
  panels: "PANEL",
  roll: "ROLL",
  rolls: "ROLL",
  cf: "CF",
  "cu ft": "CF",
  "cubic foot": "CF",
  "cubic feet": "CF",
  cy: "CY",
  "cu yd": "CY",
  "cubic yard": "CY",
  "cubic yards": "CY",
};

export function normalizeFenceUnit(value: unknown): FenceUnit | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase() as FenceUnit;
  if (["LF", "FT", "IN", "EA", "BAG", "PANEL", "ROLL", "CY", "CF"].includes(upper)) {
    return upper;
  }
  return UNIT_ALIASES[trimmed.toLowerCase()] || null;
}

export function toFeet(value: number, unit: "LF" | "FT" | "IN"): number {
  return unit === "IN" ? value / INCHES_PER_FOOT : value;
}

export function toInches(value: number, unit: "LF" | "FT" | "IN"): number {
  return unit === "IN" ? value : value * INCHES_PER_FOOT;
}

export function convertLength(
  value: number,
  from: "LF" | "FT" | "IN",
  to: "LF" | "FT" | "IN",
): number {
  const feet = toFeet(value, from);
  return to === "IN" ? feet * INCHES_PER_FOOT : feet;
}

export function cubicFeetToCubicYards(cubicFeet: number): number {
  return cubicFeet / CUBIC_FEET_PER_CUBIC_YARD;
}

export function cubicYardsToCubicFeet(cubicYards: number): number {
  return cubicYards * CUBIC_FEET_PER_CUBIC_YARD;
}
