export const FENCE_CALCULATOR_IDS = [
  "privacy",
  "board-on-board",
  "chain-link",
  "vinyl",
  "aluminum",
  "temporary",
  "post-concrete",
] as const;

export type FenceCalculatorId = (typeof FENCE_CALCULATOR_IDS)[number];

export const FENCE_UNITS = [
  "LF",
  "FT",
  "IN",
  "EA",
  "BAG",
  "PANEL",
  "ROLL",
  "CY",
  "CF",
] as const;

export type FenceUnit = (typeof FENCE_UNITS)[number];

export type CalculatorValue = number | string;
export type CalculatorValues = Record<string, CalculatorValue>;

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface CalculatorInputDefinition {
  id: string;
  label: string;
  description?: string;
  section?: "dimensions" | "layout" | "materials" | "gates" | "advanced";
  type: "number" | "select";
  unit?: FenceUnit | "%" | "LB";
  defaultValue: CalculatorValue;
  min?: number;
  exclusiveMin?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  editableRule?: boolean;
  options?: SelectOption[];
  visibleWhen?: { field: string; values: CalculatorValue[] };
}

export interface ResultDefinition {
  id: string;
  label: string;
  unit: FenceUnit;
  description?: string;
}

export type RoundingMode = "none" | "ceil" | "floor" | "nearest";

export interface RoundingRule {
  mode?: RoundingMode;
  increment?: number;
  packSize?: number;
  precision?: number;
}

export interface MaterialResult {
  id: string;
  name: string;
  requiredQty: number;
  unit: FenceUnit;
  wastePercent: number;
  orderQty: number;
  rounding: Required<Pick<RoundingRule, "mode" | "increment">> &
    Pick<RoundingRule, "packSize" | "precision">;
  stockSize?: number;
  stockUnit?: FenceUnit;
  note?: string;
}

export type CalculatorFormula = (values: Readonly<CalculatorValues>) => MaterialResult[];
export type CrossValidator = (values: Readonly<CalculatorValues>) => ValidationIssue[];

export interface FenceCalculatorDefinition {
  id: FenceCalculatorId;
  name: string;
  shortName: string;
  description: string;
  inputs: CalculatorInputDefinition[];
  defaultValues: CalculatorValues;
  ruleKeys: string[];
  resultDefinitions: ResultDefinition[];
  calculate: CalculatorFormula;
  validate?: CrossValidator;
  aliases: string[];
}

export interface FenceCalculation {
  calculatorId: FenceCalculatorId | string;
  values: CalculatorValues;
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  results: MaterialResult[];
}

export interface TakeoffCalculatorSeed {
  calculatorId: FenceCalculatorId | null;
  suggestedCalculatorIds: FenceCalculatorId[];
  values: CalculatorValues;
  source: {
    conditionId?: string;
    shapeId?: string;
    label?: string;
    quantity?: number;
    unit?: string;
  };
  warnings: string[];
}

export interface EstimateLineItem {
  id: string;
  source: "fence-calculator";
  calculatorId: FenceCalculatorId | string;
  materialId: string;
  description: string;
  quantity: number;
  unit: FenceUnit;
  unitCost: number | null;
  total: number | null;
  metadata: {
    requiredQty: number;
    wastePercent: number;
  };
}
