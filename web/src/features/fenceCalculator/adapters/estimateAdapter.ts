import type { EstimateLineItem, FenceCalculation, MaterialResult } from "../types.ts";

const SUMMARY_RESULT_IDS = new Set(["sections", "fabric", "topRail", "concreteCf", "concreteCy"]);

export function defaultEstimateResultIds(results: MaterialResult[]): string[] {
  return results.filter((result) => result.orderQty > 0 && !SUMMARY_RESULT_IDS.has(result.id)).map((result) => result.id);
}

export function calculationToEstimateLineItems(
  calculation: FenceCalculation,
  { selectedIds, unitCosts = {}, idFactory = () => crypto.randomUUID() }: {
    selectedIds?: Iterable<string>;
    unitCosts?: Record<string, number>;
    idFactory?: () => string;
  } = {},
): EstimateLineItem[] {
  if (!calculation.valid) return [];
  const selected = selectedIds ? new Set(selectedIds) : new Set(defaultEstimateResultIds(calculation.results));
  return calculation.results.filter((result) => selected.has(result.id) && result.orderQty > 0).map((result) => {
    const cost = Number(unitCosts[result.id]);
    const unitCost = Number.isFinite(cost) && cost >= 0 ? cost : null;
    return {
      id: idFactory(),
      source: "fence-calculator",
      calculatorId: calculation.calculatorId,
      materialId: result.id,
      description: result.name,
      quantity: result.orderQty,
      unit: result.unit,
      unitCost,
      total: unitCost == null ? null : Math.round(result.orderQty * unitCost * 100) / 100,
      metadata: { requiredQty: result.requiredQty, wastePercent: result.wastePercent },
    };
  });
}

export function calculationToConditionMaterials(
  calculation: FenceCalculation,
  {
    basisQuantity,
    basisType = "linear",
    selectedIds,
    idFactory = () => crypto.randomUUID(),
    calculatorName = "Fence Material Calculator",
  }: {
    basisQuantity: number;
    basisType?: "linear" | "count";
    selectedIds?: Iterable<string>;
    idFactory?: () => string;
    calculatorName?: string;
  },
) {
  const source = calculationToEstimateLineItems(calculation, { selectedIds, idFactory });
  const basis = Math.max(0, Number(basisQuantity) || 0);
  if (!basis) return [];
  return source.map((line) => ({
    id: line.id,
    name: line.description,
    unit: line.unit,
    per: line.quantity > 0 ? basis / line.quantity : 0,
    basis: basisType,
    round: true,
    note: `${calculatorName}: ${line.metadata.requiredQty.toLocaleString(undefined, { maximumFractionDigits: 3 })} required${line.metadata.wastePercent ? ` + ${line.metadata.wastePercent}% waste` : ""}; ${line.quantity.toLocaleString()} ${line.unit} order quantity.`,
    fence_calculator: {
      calculator_id: line.calculatorId,
      material_id: line.materialId,
      required_qty: line.metadata.requiredQty,
      order_qty: line.quantity,
      waste_pct: line.metadata.wastePercent,
    },
  }));
}
