import { CALCULATORS } from "../engine/calculate.ts";
import type { CalculatorValues, FenceCalculatorId, TakeoffCalculatorSeed } from "../types.ts";

type TakeoffSource = {
  condition?: { id?: string; finish_tag?: string; name?: string; category?: string; trade?: string } | null;
  totals?: { lf?: number; lf_net?: number; ea?: number } | null;
  shape?: { id?: string; computed?: { perimeter_lf?: number; count?: number }; measure_role?: string } | null;
};

const clean = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function suggestFenceCalculators(label: unknown): FenceCalculatorId[] {
  const haystack = clean(label);
  if (!haystack) return [];
  return CALCULATORS
    .map((calculator) => ({
      id: calculator.id,
      score: calculator.aliases.reduce((score, alias) => {
        const needle = clean(alias);
        if (!needle) return score;
        if (haystack === needle) return Math.max(score, 100 + needle.length);
        if (haystack.includes(needle)) return Math.max(score, 50 + needle.length);
        const shared = needle.split(" ").filter((word) => word.length > 2 && haystack.includes(word)).length;
        return Math.max(score, shared * 5);
      }, 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.id);
}

export function takeoffToCalculatorSeed(source: TakeoffSource | null | undefined): TakeoffCalculatorSeed {
  const condition = source?.condition || null;
  const shape = source?.shape || null;
  const label = condition?.finish_tag || condition?.name || condition?.category || condition?.trade || "";
  const suggestedCalculatorIds = suggestFenceCalculators(label);
  const measuredLf = Number(source?.totals?.lf) || Number(shape?.computed?.perimeter_lf) || 0;
  const count = Number(source?.totals?.ea) || Number(shape?.computed?.count) || 0;
  const values: CalculatorValues = {};
  if (measuredLf > 0) values.fenceLength = measuredLf;
  if (count > 0) values.postQuantity = count;
  const warnings: string[] = [];
  if (!suggestedCalculatorIds.length && label) warnings.push("The takeoff name did not identify a fence type; choose a calculator.");
  if (!measuredLf && !count) warnings.push("The active takeoff has no linear-foot or count quantity to import.");
  const preferCount = suggestedCalculatorIds[0] === "post-concrete" && count > 0;
  return {
    calculatorId: suggestedCalculatorIds[0] || null,
    suggestedCalculatorIds,
    values,
    source: {
      ...(condition?.id ? { conditionId: condition.id } : {}),
      ...(shape?.id ? { shapeId: shape.id } : {}),
      ...(label ? { label } : {}),
      ...(preferCount
        ? { quantity: count, unit: "EA" }
        : measuredLf > 0
          ? { quantity: measuredLf, unit: "LF" }
          : count > 0
            ? { quantity: count, unit: "EA" }
            : {}),
    },
    warnings,
  };
}
