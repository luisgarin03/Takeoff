import { applyWaste, roundOrderQuantity } from "../engine/rounding.ts";
import type {
  CalculatorInputDefinition,
  CalculatorValues,
  FenceUnit,
  MaterialResult,
  RoundingRule,
  ValidationIssue,
} from "../types.ts";

export const numberInput = (
  id: string,
  label: string,
  defaultValue: number,
  options: Omit<CalculatorInputDefinition, "id" | "label" | "defaultValue" | "type"> = {},
): CalculatorInputDefinition => ({ id, label, type: "number", defaultValue, ...options });

export const selectInput = (
  id: string,
  label: string,
  defaultValue: string,
  options: Omit<CalculatorInputDefinition, "id" | "label" | "defaultValue" | "type"> = {},
): CalculatorInputDefinition => ({ id, label, type: "select", defaultValue, ...options });

export function defaultsFromInputs(inputs: CalculatorInputDefinition[]): CalculatorValues {
  return Object.fromEntries(inputs.map((input) => [input.id, input.defaultValue]));
}

export const valueNumber = (values: Readonly<CalculatorValues>, id: string): number => Number(values[id]);
export const valueString = (values: Readonly<CalculatorValues>, id: string): string => String(values[id]);

export function gateOpeningLength(values: Readonly<CalculatorValues>): number {
  return valueNumber(values, "gateQuantity") * valueNumber(values, "gateWidth");
}

export function netFenceLength(values: Readonly<CalculatorValues>): number {
  return Math.max(0, valueNumber(values, "fenceLength") - gateOpeningLength(values));
}

export function installedSections(length: number, spacing: number): number {
  if (length <= 0) return 0;
  return Math.ceil(length / spacing);
}

export function material(
  id: string,
  name: string,
  requiredQty: number,
  unit: FenceUnit,
  options: {
    wastePercent?: number;
    rounding?: RoundingRule;
    orderFrom?: number;
    stockSize?: number;
    stockUnit?: FenceUnit;
    note?: string;
  } = {},
): MaterialResult {
  const wastePercent = options.wastePercent || 0;
  const rounding: RoundingRule = { mode: "ceil", increment: 1, ...options.rounding };
  const baseForOrder = options.orderFrom ?? applyWaste(requiredQty, wastePercent);
  return {
    id,
    name,
    requiredQty,
    unit,
    wastePercent,
    orderQty: roundOrderQuantity(baseForOrder, rounding),
    rounding: {
      mode: rounding.mode || "ceil",
      increment: rounding.increment || 1,
      ...(rounding.packSize ? { packSize: rounding.packSize } : {}),
      ...(rounding.precision != null ? { precision: rounding.precision } : {}),
    },
    ...(options.stockSize != null ? { stockSize: options.stockSize } : {}),
    ...(options.stockUnit ? { stockUnit: options.stockUnit } : {}),
    ...(options.note ? { note: options.note } : {}),
  };
}

export function gateLengthValidation(values: Readonly<CalculatorValues>): ValidationIssue[] {
  const fenceLength = valueNumber(values, "fenceLength");
  const opening = gateOpeningLength(values);
  if (opening > fenceLength) {
    return [{
      field: "gateWidth",
      code: "gate-openings-exceed-length",
      message: "Total gate width cannot exceed the fence length.",
      severity: "error",
    }];
  }
  return [];
}
