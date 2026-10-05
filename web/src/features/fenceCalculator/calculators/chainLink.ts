import { applyWaste } from "../engine/rounding.ts";
import type { FenceCalculatorDefinition, ValidationIssue } from "../types.ts";
import {
  defaultsFromInputs,
  gateLengthValidation,
  material,
  netFenceLength,
  numberInput,
  valueNumber,
} from "./shared.ts";

const inputs = [
  numberInput("fenceLength", "Fence length", 100, { unit: "LF", min: 0, step: 1, section: "dimensions" }),
  numberInput("fenceHeight", "Fence height", 6, { unit: "FT", exclusiveMin: 0, step: 0.5, section: "dimensions" }),
  numberInput("linePostSpacing", "Line post spacing", 10, { unit: "FT", exclusiveMin: 0, step: 0.5, editableRule: true, section: "layout" }),
  numberInput("cornerQuantity", "Corner posts", 0, { unit: "EA", min: 0, integer: true, section: "layout" }),
  numberInput("endQuantity", "End posts", 2, { unit: "EA", min: 0, integer: true, section: "layout" }),
  numberInput("gateQuantity", "Gate quantity", 0, { unit: "EA", min: 0, integer: true, section: "gates" }),
  numberInput("gateWidth", "Average gate width", 4, { unit: "FT", min: 0, step: 0.5, section: "gates" }),
  numberInput("fabricRollLength", "Fabric roll length", 50, { unit: "LF", exclusiveMin: 0, step: 1, editableRule: true, section: "materials" }),
  numberInput("topRailStockLength", "Top rail stock length", 21, { unit: "FT", exclusiveMin: 0, step: 0.5, editableRule: true, section: "materials" }),
  numberInput("concreteBagsPerLinePost", "Bags per line post", 1, { unit: "BAG", min: 0, step: 0.25, editableRule: true, section: "materials" }),
  numberInput("concreteBagsPerTerminalPost", "Bags per terminal post", 2, { unit: "BAG", min: 0, step: 0.25, editableRule: true, section: "materials" }),
  numberInput("tensionBandsPerTerminalPost", "Tension bands per terminal post", 5, { unit: "EA", min: 0, integer: true, editableRule: true, section: "materials" }),
  numberInput("braceBandsPerTerminalPost", "Brace bands per terminal post", 2, { unit: "EA", min: 0, integer: true, editableRule: true, section: "materials" }),
  numberInput("tieSpacing", "Fence tie spacing", 24, { unit: "IN", exclusiveMin: 0, step: 1, editableRule: true, section: "materials" }),
  numberInput("wastePercent", "Waste", 5, { unit: "%", min: 0, max: 100, step: 0.5, editableRule: true, section: "advanced" }),
];

function validate(values: Readonly<Record<string, number | string>>): ValidationIssue[] {
  return gateLengthValidation(values);
}

export const chainLinkCalculator: FenceCalculatorDefinition = {
  id: "chain-link",
  name: "Chain-Link Fence",
  shortName: "Chain Link",
  description: "Fabric, framework, fittings, ties, gates, and concrete.",
  inputs,
  defaultValues: defaultsFromInputs(inputs),
  ruleKeys: [
    "linePostSpacing", "fabricRollLength", "topRailStockLength",
    "concreteBagsPerLinePost", "concreteBagsPerTerminalPost",
    "tensionBandsPerTerminalPost", "braceBandsPerTerminalPost", "tieSpacing", "wastePercent",
  ],
  resultDefinitions: [
    { id: "fabric", label: "Fence fabric", unit: "LF" },
    { id: "fabricRolls", label: "Fabric rolls", unit: "ROLL" },
    { id: "linePosts", label: "Line posts", unit: "EA" },
    { id: "endPosts", label: "End posts", unit: "EA" },
    { id: "cornerPosts", label: "Corner posts", unit: "EA" },
    { id: "gatePosts", label: "Gate posts", unit: "EA" },
    { id: "topRail", label: "Top rail", unit: "LF" },
    { id: "topRailPieces", label: "Top rail pieces", unit: "EA" },
    { id: "loopCaps", label: "Loop caps", unit: "EA" },
    { id: "railEnds", label: "Rail ends", unit: "EA" },
    { id: "tensionBands", label: "Tension bands", unit: "EA" },
    { id: "braceBands", label: "Brace bands", unit: "EA" },
    { id: "tensionBars", label: "Tension bars", unit: "EA" },
    { id: "fenceTies", label: "Fence ties", unit: "EA" },
    { id: "concrete", label: "Concrete", unit: "BAG" },
    { id: "gates", label: "Gates", unit: "EA" },
  ],
  aliases: ["chain link", "chain-link", "chainlink", "cyclone fence", "wire fence"],
  validate,
  calculate(values) {
    const length = netFenceLength(values);
    const waste = valueNumber(values, "wastePercent");
    const linePosts = length > 0
      ? Math.max(0, Math.ceil(length / valueNumber(values, "linePostSpacing")) - 1)
      : 0;
    const endPosts = valueNumber(values, "endQuantity");
    const cornerPosts = valueNumber(values, "cornerQuantity");
    const gatePosts = valueNumber(values, "gateQuantity") * 2;
    const fittingPosts = endPosts + cornerPosts + gatePosts;
    const fabricRollLength = valueNumber(values, "fabricRollLength");
    const railStockLength = valueNumber(values, "topRailStockLength");
    const fabricWithWaste = applyWaste(length, waste);
    const railWithWaste = applyWaste(length, waste);
    const fabricRollsRequired = length > 0 ? Math.ceil(length / fabricRollLength) : 0;
    const topRailPiecesRequired = length > 0 ? Math.ceil(length / railStockLength) : 0;
    const ties = length > 0 ? Math.ceil((length * 12) / valueNumber(values, "tieSpacing")) : 0;
    return [
      material("fabric", "Fence fabric", length, "LF", { wastePercent: waste }),
      material("fabricRolls", "Fabric rolls", fabricRollsRequired, "ROLL", {
        wastePercent: waste,
        orderFrom: fabricWithWaste > 0 ? Math.ceil(fabricWithWaste / fabricRollLength) : 0,
        stockSize: fabricRollLength,
        stockUnit: "LF",
      }),
      material("linePosts", "Line posts", linePosts, "EA", { wastePercent: waste }),
      material("endPosts", "End posts", endPosts, "EA", { wastePercent: waste }),
      material("cornerPosts", "Corner posts", cornerPosts, "EA", { wastePercent: waste }),
      material("gatePosts", "Gate posts", gatePosts, "EA", { wastePercent: waste }),
      material("topRail", "Top rail", length, "LF", { wastePercent: waste }),
      material("topRailPieces", "Top rail pieces", topRailPiecesRequired, "EA", {
        wastePercent: waste,
        orderFrom: railWithWaste > 0 ? Math.ceil(railWithWaste / railStockLength) : 0,
        stockSize: railStockLength,
        stockUnit: "FT",
      }),
      material("loopCaps", "Loop caps", linePosts, "EA", { wastePercent: waste }),
      material("railEnds", "Rail ends", fittingPosts, "EA", { wastePercent: waste }),
      material("tensionBands", "Tension bands", fittingPosts * valueNumber(values, "tensionBandsPerTerminalPost"), "EA", { wastePercent: waste }),
      material("braceBands", "Brace bands", fittingPosts * valueNumber(values, "braceBandsPerTerminalPost"), "EA", { wastePercent: waste }),
      material("tensionBars", "Tension bars", fittingPosts, "EA", { wastePercent: waste }),
      material("fenceTies", "Fence ties", ties, "EA", { wastePercent: waste }),
      material(
        "concrete",
        "Concrete",
        linePosts * valueNumber(values, "concreteBagsPerLinePost")
          + fittingPosts * valueNumber(values, "concreteBagsPerTerminalPost"),
        "BAG",
      ),
      material("gates", "Gates", valueNumber(values, "gateQuantity"), "EA"),
    ];
  },
};
