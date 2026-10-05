import { applyWaste } from "../engine/rounding.ts";
import { cubicFeetToCubicYards } from "../engine/units.ts";
import type { FenceCalculatorDefinition, ValidationIssue } from "../types.ts";
import {
  defaultsFromInputs,
  material,
  numberInput,
  selectInput,
  valueNumber,
  valueString,
} from "./shared.ts";

const inputs = [
  numberInput("postQuantity", "Number of posts", 10, { unit: "EA", min: 0, integer: true, section: "dimensions" }),
  numberInput("holeDiameter", "Hole diameter", 12, { unit: "IN", exclusiveMin: 0, step: 0.25, section: "dimensions" }),
  numberInput("holeDepth", "Hole depth", 36, { unit: "IN", exclusiveMin: 0, step: 1, section: "dimensions" }),
  selectInput("postShape", "Post shape", "square", {
    section: "layout",
    options: [
      { value: "round", label: "Round" },
      { value: "square", label: "Square" },
      { value: "rectangular", label: "Rectangular" },
    ],
  }),
  numberInput("postWidth", "Post width / diameter", 4, { unit: "IN", min: 0, step: 0.25, section: "dimensions" }),
  numberInput("postDepth", "Post depth", 4, {
    unit: "IN",
    min: 0,
    step: 0.25,
    section: "dimensions",
    visibleWhen: { field: "postShape", values: ["rectangular"] },
  }),
  numberInput("bagSize", "Bag size", 80, { unit: "LB", exclusiveMin: 0, step: 10, editableRule: true, section: "materials" }),
  numberInput("concreteYieldPerBag", "Concrete yield per bag", 0.6, { unit: "CF", exclusiveMin: 0, step: 0.01, editableRule: true, section: "materials" }),
  numberInput("wastePercent", "Waste", 5, { unit: "%", min: 0, max: 100, step: 0.5, editableRule: true, section: "advanced" }),
];

function postCrossSectionSquareInches(values: Readonly<Record<string, number | string>>): number {
  const width = valueNumber(values, "postWidth");
  switch (valueString(values, "postShape")) {
    case "round":
      return Math.PI * (width / 2) ** 2;
    case "rectangular":
      return width * valueNumber(values, "postDepth");
    default:
      return width ** 2;
  }
}

function validate(values: Readonly<Record<string, number | string>>): ValidationIssue[] {
  const width = valueNumber(values, "postWidth");
  const depth = valueString(values, "postShape") === "rectangular"
    ? valueNumber(values, "postDepth")
    : width;
  if (valueNumber(values, "holeDiameter") <= Math.max(width, depth)) {
    return [{
      field: "holeDiameter",
      code: "hole-too-small",
      message: "Hole diameter must be greater than the post width and depth.",
      severity: "error",
    }];
  }
  return [];
}

export const postConcreteCalculator: FenceCalculatorDefinition = {
  id: "post-concrete",
  name: "Post / Concrete Calculator",
  shortName: "Concrete",
  description: "Net cylindrical-hole concrete after round, square, or rectangular post displacement.",
  inputs,
  defaultValues: defaultsFromInputs(inputs),
  ruleKeys: ["bagSize", "concreteYieldPerBag", "wastePercent"],
  resultDefinitions: [
    { id: "concreteCf", label: "Concrete volume", unit: "CF" },
    { id: "concreteCy", label: "Concrete volume", unit: "CY" },
    { id: "concreteBags", label: "Concrete bags", unit: "BAG" },
  ],
  aliases: ["concrete", "post concrete", "post hole", "footing", "fence post"],
  validate,
  calculate(values) {
    const posts = valueNumber(values, "postQuantity");
    const radiusFeet = valueNumber(values, "holeDiameter") / 24;
    const depthFeet = valueNumber(values, "holeDepth") / 12;
    const holeVolumeCf = Math.PI * radiusFeet ** 2 * depthFeet * posts;
    const postVolumeCf = (postCrossSectionSquareInches(values) / 144) * depthFeet * posts;
    const netVolumeCf = Math.max(0, holeVolumeCf - postVolumeCf);
    const waste = valueNumber(values, "wastePercent");
    const orderVolumeCf = applyWaste(netVolumeCf, waste);
    const bagYield = valueNumber(values, "concreteYieldPerBag");
    const bagName = `${valueNumber(values, "bagSize")} lb concrete bags`;
    return [
      material("concreteCf", "Concrete volume", netVolumeCf, "CF", {
        wastePercent: waste,
        rounding: { mode: "none", increment: 0.01, precision: 3 },
      }),
      material("concreteCy", "Concrete volume", cubicFeetToCubicYards(netVolumeCf), "CY", {
        wastePercent: waste,
        rounding: { mode: "none", increment: 0.001, precision: 4 },
      }),
      material("concreteBags", bagName, netVolumeCf / bagYield, "BAG", {
        wastePercent: waste,
        orderFrom: orderVolumeCf / bagYield,
      }),
    ];
  },
};
