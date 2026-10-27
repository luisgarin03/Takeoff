import { FENCE_CALCULATOR_IDS, type CalculatorValues, type FenceCalculatorId } from "./types.ts";
import { getCalculatorDefinition, mergeCalculatorValues } from "./engine/calculate.ts";

export interface FenceCalculatorProjectState {
  version: 1;
  activeCalculatorId: FenceCalculatorId;
  valuesByCalculator: Partial<Record<FenceCalculatorId, CalculatorValues>>;
}

export const emptyFenceCalculatorProject = (): FenceCalculatorProjectState => ({
  version: 1,
  activeCalculatorId: "board-on-board",
  valuesByCalculator: {},
});

export function sanitizeFenceCalculatorProject(raw: unknown): FenceCalculatorProjectState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyFenceCalculatorProject();
  const source = raw as Partial<FenceCalculatorProjectState>;
  const activeCalculatorId = FENCE_CALCULATOR_IDS.includes(source.activeCalculatorId as FenceCalculatorId)
    ? source.activeCalculatorId as FenceCalculatorId
    : "board-on-board";
  const valuesByCalculator: Partial<Record<FenceCalculatorId, CalculatorValues>> = {};
  if (source.valuesByCalculator && typeof source.valuesByCalculator === "object" && !Array.isArray(source.valuesByCalculator)) {
    for (const id of FENCE_CALCULATOR_IDS) {
      const calculator = getCalculatorDefinition(id);
      const values = source.valuesByCalculator[id];
      if (calculator && values && typeof values === "object" && !Array.isArray(values)) valuesByCalculator[id] = mergeCalculatorValues(calculator, values);
    }
  }
  return { version: 1, activeCalculatorId, valuesByCalculator };
}

export const fenceCalculatorProjectHasContent = (state: FenceCalculatorProjectState) => Object.keys(state.valuesByCalculator || {}).length > 0;
