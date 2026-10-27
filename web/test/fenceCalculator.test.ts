import test from "node:test";
import assert from "node:assert/strict";
import {
  CALCULATORS,
  calculateFenceMaterials,
  calculationToConditionMaterials,
  calculationToEstimateLineItems,
  cubicFeetToCubicYards,
  loadFenceFavorites,
  loadFencePresets,
  makeFencePreset,
  mergeCalculatorValues,
  normalizeFenceUnit,
  roundOrderQuantity,
  sanitizeFenceCalculatorProject,
  saveFenceFavorites,
  saveFencePresets,
  setDefaultFencePreset,
  suggestFenceCalculators,
  takeoffToCalculatorSeed,
} from "../src/features/fenceCalculator/index.ts";

const result = (id: string, values: Record<string, number | string>, materialId: string) => {
  const calculation = calculateFenceMaterials(id, values);
  assert.equal(calculation.valid, true, calculation.errors.map((error) => error.message).join(", "));
  const item = calculation.results.find((entry) => entry.id === materialId);
  assert.ok(item, `missing ${materialId}`);
  return item;
};

test("all seven fence calculators are registered and carry schemas", () => {
  assert.deepEqual(CALCULATORS.map((calculator) => calculator.id), [
    "privacy", "board-on-board", "chain-link", "vinyl", "aluminum", "temporary", "post-concrete",
  ]);
  for (const calculator of CALCULATORS) {
    assert.ok(calculator.inputs.length > 0);
    assert.ok(calculator.resultDefinitions.length > 0);
    assert.ok(calculator.ruleKeys.every((key) => calculator.inputs.some((input) => input.id === key)));
  }
});

test("board-on-board calculates exact and partial sections with overlap and waste", () => {
  const exact = calculateFenceMaterials("board-on-board", { fenceLength: 128, postSpacing: 8, gateQuantity: 0, extraPosts: 0 });
  assert.equal(exact.valid, true);
  assert.equal(exact.results.find((entry) => entry.id === "sections")?.requiredQty, 16);
  assert.equal(exact.results.find((entry) => entry.id === "posts")?.requiredQty, 17);
  assert.equal(exact.results.find((entry) => entry.id === "rails")?.requiredQty, 48);
  assert.equal(exact.results.find((entry) => entry.id === "pickets")?.requiredQty, 342);
  assert.equal(exact.results.find((entry) => entry.id === "pickets")?.orderQty, 360);
  assert.equal(result("board-on-board", { fenceLength: 129, postSpacing: 8 }, "sections").requiredQty, 17);
  assert.equal(result("board-on-board", { fenceLength: 0 }, "posts").requiredQty, 0);
});

test("board-on-board rejects invalid overlap and gate openings", () => {
  const overlap = calculateFenceMaterials("board-on-board", { picketWidth: 5.5, boardOverlap: 5.5 });
  assert.equal(overlap.valid, false);
  assert.equal(overlap.errors[0].code, "overlap-exceeds-width");
  assert.equal(overlap.results.length, 0);
  const gates = calculateFenceMaterials("board-on-board", { fenceLength: 10, gateQuantity: 3, gateWidth: 4 });
  assert.equal(gates.valid, false);
  assert.ok(gates.errors.some((error) => error.code === "gate-openings-exceed-length"));
});

test("privacy calculator returns panel and field-built quantities", () => {
  const calculation = calculateFenceMaterials("privacy", { fenceLength: 101, postSpacing: 8, panelWidth: 8, wastePercent: 0 });
  assert.equal(calculation.results.find((entry) => entry.id === "sections")?.requiredQty, 13);
  assert.equal(calculation.results.find((entry) => entry.id === "panels")?.requiredQty, 13);
  assert.equal(calculation.results.find((entry) => entry.id === "posts")?.requiredQty, 14);
});

test("chain-link calculator rounds fabric rolls, rail stock, line posts, and fittings", () => {
  const calculation = calculateFenceMaterials("chain-link", {
    fenceLength: 128, linePostSpacing: 10, fabricRollLength: 50, topRailStockLength: 21,
    cornerQuantity: 2, endQuantity: 2, gateQuantity: 1, gateWidth: 4, wastePercent: 5,
  });
  assert.equal(calculation.valid, true);
  assert.equal(calculation.results.find((entry) => entry.id === "linePosts")?.requiredQty, 12);
  assert.equal(calculation.results.find((entry) => entry.id === "fabricRolls")?.orderQty, 3);
  assert.equal(calculation.results.find((entry) => entry.id === "topRailPieces")?.orderQty, 7);
  assert.equal(calculation.results.find((entry) => entry.id === "gatePosts")?.requiredQty, 2);
  assert.equal(calculation.results.find((entry) => entry.id === "tensionBars")?.requiredQty, 6);
});

test("vinyl and aluminum split post types and account for gates", () => {
  for (const id of ["vinyl", "aluminum"] as const) {
    const calculation = calculateFenceMaterials(id, {
      fenceLength: 80, panelWidth: 8, cornerQuantity: 2, endQuantity: 2,
      gateQuantity: 1, gateWidth: 4, wastePercent: 0,
    });
    assert.equal(calculation.valid, true);
    assert.equal(calculation.results.find((entry) => entry.id === "panels")?.requiredQty, 10);
    assert.equal(calculation.results.find((entry) => entry.id === "linePosts")?.requiredQty, 7);
    assert.equal(calculation.results.find((entry) => entry.id === "gatePosts")?.requiredQty, 2);
    assert.equal(calculation.results.find((entry) => entry.id === "caps")?.requiredQty, 13);
  }
  assert.equal(result("aluminum", { fenceLength: 80, panelWidth: 8, bracketsPerPanel: 4, wastePercent: 0 }, "brackets").requiredQty, 40);
});

test("temporary fence calculates panels, junction clamps, bases, and ballast", () => {
  const calculation = calculateFenceMaterials("temporary", {
    fenceLength: 95, panelLength: 10, basesPerPanel: 1, clampsPerConnection: 2,
    ballastPerBase: 2, gateQuantity: 1, gateWidth: 5, wastePercent: 0,
  });
  assert.equal(calculation.results.find((entry) => entry.id === "panels")?.requiredQty, 9);
  assert.equal(calculation.results.find((entry) => entry.id === "bases")?.requiredQty, 11);
  assert.equal(calculation.results.find((entry) => entry.id === "clamps")?.requiredQty, 20);
  assert.equal(calculation.results.find((entry) => entry.id === "ballast")?.requiredQty, 22);
});

test("post concrete subtracts post displacement, converts yards, applies waste, and rounds bags", () => {
  const calculation = calculateFenceMaterials("post-concrete", {
    postQuantity: 10, holeDiameter: 12, holeDepth: 36, postShape: "square",
    postWidth: 4, bagSize: 80, concreteYieldPerBag: 0.6, wastePercent: 5,
  });
  assert.equal(calculation.valid, true);
  const cf = calculation.results.find((entry) => entry.id === "concreteCf")!;
  const cy = calculation.results.find((entry) => entry.id === "concreteCy")!;
  const bags = calculation.results.find((entry) => entry.id === "concreteBags")!;
  assert.ok(Math.abs(cf.requiredQty - 20.228) < 0.001);
  assert.ok(Math.abs(cy.requiredQty - cubicFeetToCubicYards(cf.requiredQty)) < 0.001);
  assert.equal(bags.orderQty, 36);
  assert.equal(calculateFenceMaterials("post-concrete", { holeDiameter: 4, postWidth: 4 }).valid, false);
});

test("generic input validation handles zero denominators, negatives, integers, and unknown calculators", () => {
  assert.equal(calculateFenceMaterials("privacy", { postSpacing: 0 }).valid, false);
  assert.equal(calculateFenceMaterials("vinyl", { fenceLength: -1 }).valid, false);
  assert.equal(calculateFenceMaterials("temporary", { gateQuantity: 1.5 }).valid, false);
  assert.equal(calculateFenceMaterials("not-real", {}).valid, false);
});

test("unit and rounding helpers normalize construction units and pack sizes", () => {
  assert.equal(normalizeFenceUnit("linear feet"), "LF");
  assert.equal(normalizeFenceUnit("cu yd"), "CY");
  assert.equal(normalizeFenceUnit("m"), null);
  assert.equal(roundOrderQuantity(21.1, { mode: "ceil", packSize: 10 }), 30);
  assert.equal(roundOrderQuantity(21.1, { mode: "nearest", increment: 0.5 }), 21);
});

test("takeoff adapter matches fence names and imports LF without applying report waste", () => {
  assert.deepEqual(suggestFenceCalculators("6 FT COMMERCIAL CHAIN LINK FENCE").slice(0, 1), ["chain-link"]);
  const seed = takeoffToCalculatorSeed({
    condition: { id: "c1", finish_tag: "Board-on-Board Fence" },
    totals: { lf: 1284, lf_net: 1348.2 },
  });
  assert.equal(seed.calculatorId, "board-on-board");
  assert.equal(seed.values.fenceLength, 1284);
  assert.equal(seed.source.unit, "LF");
  const concreteSeed = takeoffToCalculatorSeed({
    condition: { id: "c2", finish_tag: "Fence Post Concrete" },
    totals: { lf: 200, ea: 24 },
  });
  assert.equal(concreteSeed.calculatorId, "post-concrete");
  assert.equal(concreteSeed.values.fenceLength, 200);
  assert.equal(concreteSeed.values.postQuantity, 24);
  assert.equal(concreteSeed.source.quantity, 24);
  assert.equal(concreteSeed.source.unit, "EA");
  assert.equal(takeoffToCalculatorSeed({ condition: { finish_tag: "Unknown scope" }, totals: {} }).warnings.length, 2);
});

test("estimate adapter emits independent line items and existing condition material lines", () => {
  const calculation = calculateFenceMaterials("board-on-board", { fenceLength: 128, wastePercent: 0 });
  const lines = calculationToEstimateLineItems(calculation, { selectedIds: ["posts", "concrete"], idFactory: () => "line" });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].source, "fence-calculator");
  const materials = calculationToConditionMaterials(calculation, {
    selectedIds: ["posts"], basisQuantity: 128, idFactory: () => "mat", calculatorName: "Board-on-Board Fence",
  });
  assert.equal(materials.length, 1);
  assert.equal(materials[0].basis, "linear");
  assert.equal(materials[0].id, "mat");
  assert.ok(materials[0].per > 0);
  assert.equal(materials[0].fence_calculator.material_id, "posts");
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

test("presets save, reload, sanitize, and maintain one default per calculator", () => {
  const storage = new MemoryStorage();
  const one = makeFencePreset("board-on-board", "6 FT", { fenceHeight: 6 }, "2026-01-01T00:00:00.000Z", "p1");
  const two = makeFencePreset("board-on-board", "8 FT", { fenceHeight: 8 }, "2026-01-01T00:00:00.000Z", "p2");
  const saved = saveFencePresets(setDefaultFencePreset([one, two], "p2"), storage);
  assert.equal(saved.find((preset) => preset.id === "p2")?.isDefault, true);
  assert.equal(loadFencePresets(storage)[1].values.fenceHeight, 8);
  assert.equal(saveFenceFavorites(["vinyl", "vinyl", "privacy"], storage).length, 2);
  assert.deepEqual(loadFenceFavorites(storage), ["vinyl", "privacy"]);
});

test("project calculator state is backward compatible and filters unknown values", () => {
  const state = sanitizeFenceCalculatorProject({
    version: 99,
    activeCalculatorId: "vinyl",
    valuesByCalculator: { vinyl: { fenceLength: 200, malicious: "no" }, unknown: { fenceLength: 1 } },
  });
  assert.equal(state.version, 1);
  assert.equal(state.activeCalculatorId, "vinyl");
  assert.equal(state.valuesByCalculator.vinyl?.fenceLength, 200);
  assert.equal("malicious" in (state.valuesByCalculator.vinyl || {}), false);
  assert.equal(sanitizeFenceCalculatorProject(null).activeCalculatorId, "board-on-board");
  assert.equal(mergeCalculatorValues("privacy", { fenceLength: 80 }).fenceLength, 80);
});
