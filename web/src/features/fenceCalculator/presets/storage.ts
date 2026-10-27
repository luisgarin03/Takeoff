import { FENCE_CALCULATOR_IDS, type CalculatorValues, type FenceCalculatorId } from "../types.ts";
import { getCalculatorDefinition, mergeCalculatorValues } from "../engine/calculate.ts";

export const FENCE_PRESETS_KEY = "opentakeoff.fence-calculator.presets.v1";
export const FENCE_FAVORITES_KEY = "opentakeoff.fence-calculator.favorites.v1";

export interface FenceCalculatorPreset {
  id: string;
  name: string;
  calculatorId: FenceCalculatorId;
  values: CalculatorValues;
  createdAt: string;
  updatedAt: string;
  isDefault?: boolean;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function sanitizeFencePresets(raw: unknown): FenceCalculatorPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const defaults = new Set<string>();
  const result: FenceCalculatorPreset[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Partial<FenceCalculatorPreset>;
    const calculator = getCalculatorDefinition(item.calculatorId);
    if (!calculator || typeof item.id !== "string" || !item.id || seen.has(item.id) || typeof item.name !== "string" || !item.name.trim()) continue;
    seen.add(item.id);
    const isDefault = item.isDefault === true && !defaults.has(calculator.id);
    if (isDefault) defaults.add(calculator.id);
    result.push({
      id: item.id,
      name: item.name.trim().slice(0, 80),
      calculatorId: calculator.id,
      values: mergeCalculatorValues(calculator, item.values),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
      ...(isDefault ? { isDefault: true } : {}),
    });
  }
  return result;
}

export function loadFencePresets(storage: StorageLike = localStorage): FenceCalculatorPreset[] {
  try { return sanitizeFencePresets(JSON.parse(storage.getItem(FENCE_PRESETS_KEY) || "[]")); }
  catch { return []; }
}

export function saveFencePresets(presets: FenceCalculatorPreset[], storage: StorageLike = localStorage): FenceCalculatorPreset[] {
  const safe = sanitizeFencePresets(presets);
  try { storage.setItem(FENCE_PRESETS_KEY, JSON.stringify(safe)); } catch { /* session remains usable */ }
  return safe;
}

export function makeFencePreset(
  calculatorId: FenceCalculatorId,
  name: string,
  values: CalculatorValues,
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): FenceCalculatorPreset {
  const calculator = getCalculatorDefinition(calculatorId);
  if (!calculator) throw new Error("Unknown fence calculator.");
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Preset name is required.");
  return { id, name: cleanName.slice(0, 80), calculatorId, values: mergeCalculatorValues(calculator, values), createdAt: now, updatedAt: now };
}

export function setDefaultFencePreset(presets: FenceCalculatorPreset[], id: string): FenceCalculatorPreset[] {
  const target = presets.find((preset) => preset.id === id);
  if (!target) return presets;
  return presets.map((preset) => ({
    ...preset,
    ...(preset.calculatorId === target.calculatorId ? { isDefault: preset.id === id || undefined } : {}),
  }));
}

export function loadFenceFavorites(storage: StorageLike = localStorage): FenceCalculatorId[] {
  try {
    const raw = JSON.parse(storage.getItem(FENCE_FAVORITES_KEY) || "[]");
    return Array.isArray(raw) ? [...new Set(raw.filter((id): id is FenceCalculatorId => FENCE_CALCULATOR_IDS.includes(id)))] : [];
  } catch { return []; }
}

export function saveFenceFavorites(ids: FenceCalculatorId[], storage: StorageLike = localStorage): FenceCalculatorId[] {
  const safe = [...new Set(ids.filter((id) => FENCE_CALCULATOR_IDS.includes(id)))];
  try { storage.setItem(FENCE_FAVORITES_KEY, JSON.stringify(safe)); } catch { /* session remains usable */ }
  return safe;
}
