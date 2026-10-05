import { aluminumCalculator } from "../calculators/aluminum.ts";
import { boardOnBoardCalculator } from "../calculators/boardOnBoard.ts";
import { chainLinkCalculator } from "../calculators/chainLink.ts";
import { postConcreteCalculator } from "../calculators/postConcrete.ts";
import { privacyCalculator } from "../calculators/privacy.ts";
import { temporaryCalculator } from "../calculators/temporary.ts";
import { vinylCalculator } from "../calculators/vinyl.ts";
import type {
  CalculatorInputDefinition,
  CalculatorValues,
  FenceCalculation,
  FenceCalculatorDefinition,
  FenceCalculatorId,
  ValidationIssue,
} from "../types.ts";

export const CALCULATORS: readonly FenceCalculatorDefinition[] = Object.freeze([
  privacyCalculator,
  boardOnBoardCalculator,
  chainLinkCalculator,
  vinylCalculator,
  aluminumCalculator,
  temporaryCalculator,
  postConcreteCalculator,
]);

const CALCULATOR_BY_ID = new Map(CALCULATORS.map((calculator) => [calculator.id, calculator]));

export function getCalculatorDefinition(id: unknown): FenceCalculatorDefinition | null {
  return typeof id === "string" ? CALCULATOR_BY_ID.get(id as FenceCalculatorId) || null : null;
}

export function mergeCalculatorValues(
  calculatorOrId: FenceCalculatorDefinition | FenceCalculatorId | string,
  ...sources: Array<CalculatorValues | null | undefined>
): CalculatorValues {
  const calculator = typeof calculatorOrId === "string" ? getCalculatorDefinition(calculatorOrId) : calculatorOrId;
  if (!calculator) return {};
  const allowed = new Set(calculator.inputs.map((input) => input.id));
  const merged: CalculatorValues = { ...calculator.defaultValues };
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (allowed.has(key) && (typeof value === "string" || typeof value === "number")) merged[key] = value;
    }
  }
  return merged;
}

function validateInput(input: CalculatorInputDefinition, values: Readonly<CalculatorValues>): ValidationIssue[] {
  const value = values[input.id];
  if (input.type === "select") {
    if (!input.options?.some((option) => option.value === value)) {
      return [{ field: input.id, code: "invalid-option", message: `Choose a valid ${input.label.toLowerCase()}.`, severity: "error" }];
    }
    return [];
  }
  const number = Number(value);
  if (value === "" || !Number.isFinite(number)) {
    return [{ field: input.id, code: "not-a-number", message: `${input.label} must be a number.`, severity: "error" }];
  }
  if (input.min != null && number < input.min) {
    return [{ field: input.id, code: "below-minimum", message: `${input.label} must be at least ${input.min}.`, severity: "error" }];
  }
  if (input.exclusiveMin != null && number <= input.exclusiveMin) {
    return [{ field: input.id, code: "not-positive", message: `${input.label} must be greater than ${input.exclusiveMin}.`, severity: "error" }];
  }
  if (input.max != null && number > input.max) {
    return [{ field: input.id, code: "above-maximum", message: `${input.label} cannot exceed ${input.max}.`, severity: "error" }];
  }
  if (input.integer && !Number.isInteger(number)) {
    return [{ field: input.id, code: "not-whole", message: `${input.label} must be a whole number.`, severity: "error" }];
  }
  return [];
}

export function validateCalculatorInputs(
  calculatorOrId: FenceCalculatorDefinition | FenceCalculatorId | string,
  values: CalculatorValues,
): ValidationIssue[] {
  const calculator = typeof calculatorOrId === "string" ? getCalculatorDefinition(calculatorOrId) : calculatorOrId;
  if (!calculator) return [{ field: "calculator", code: "unknown-calculator", message: "Choose a valid fence calculator.", severity: "error" }];
  const merged = mergeCalculatorValues(calculator, values);
  return [
    ...calculator.inputs.flatMap((input) => validateInput(input, merged)),
    ...(calculator.validate?.(merged) || []),
  ];
}

export function calculateFenceMaterials(
  calculatorId: FenceCalculatorId | string,
  values: CalculatorValues = {},
): FenceCalculation {
  const calculator = getCalculatorDefinition(calculatorId);
  if (!calculator) {
    const issue = { field: "calculator", code: "unknown-calculator", message: "Choose a valid fence calculator.", severity: "error" as const };
    return { calculatorId, values: {}, valid: false, errors: [issue], warnings: [], results: [] };
  }
  const merged = mergeCalculatorValues(calculator, values);
  const issues = validateCalculatorInputs(calculator, merged);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    calculatorId: calculator.id,
    values: merged,
    valid: errors.length === 0,
    errors,
    warnings,
    results: errors.length ? [] : calculator.calculate(merged),
  };
}
