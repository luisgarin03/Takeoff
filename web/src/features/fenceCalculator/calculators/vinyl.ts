import type { FenceCalculatorDefinition, ValidationIssue } from "../types.ts";
import {
  defaultsFromInputs,
  gateLengthValidation,
  installedSections,
  material,
  netFenceLength,
  numberInput,
  valueNumber,
} from "./shared.ts";

const inputs = [
  numberInput("fenceLength", "Fence length", 100, { unit: "LF", min: 0, step: 1, section: "dimensions" }),
  numberInput("fenceHeight", "Fence height", 6, { unit: "FT", exclusiveMin: 0, step: 0.5, section: "dimensions" }),
  numberInput("panelWidth", "Panel width", 8, { unit: "FT", exclusiveMin: 0, step: 0.5, editableRule: true, section: "layout" }),
  numberInput("cornerQuantity", "Corner posts", 0, { unit: "EA", min: 0, integer: true, section: "layout" }),
  numberInput("endQuantity", "End posts", 2, { unit: "EA", min: 0, integer: true, section: "layout" }),
  numberInput("gateQuantity", "Gate quantity", 0, { unit: "EA", min: 0, integer: true, section: "gates" }),
  numberInput("gateWidth", "Average gate width", 4, { unit: "FT", min: 0, step: 0.5, section: "gates" }),
  numberInput("concreteBagsPerPost", "Concrete bags per post", 2, { unit: "BAG", min: 0, step: 0.25, editableRule: true, section: "materials" }),
  numberInput("wastePercent", "Waste", 5, { unit: "%", min: 0, max: 100, step: 0.5, editableRule: true, section: "advanced" }),
];

function validate(values: Readonly<Record<string, number | string>>): ValidationIssue[] {
  const issues = gateLengthValidation(values);
  const panels = installedSections(netFenceLength(values), valueNumber(values, "panelWidth"));
  const typedPosts = valueNumber(values, "cornerQuantity") + valueNumber(values, "endQuantity");
  if (panels > 0 && typedPosts > panels + 1) {
    issues.push({
      field: "cornerQuantity",
      code: "terminal-posts-exceed-layout",
      message: "End and corner posts exceed the available panel junctions; line posts will be zero.",
      severity: "warning",
    });
  }
  return issues;
}

export const vinylCalculator: FenceCalculatorDefinition = {
  id: "vinyl",
  name: "Vinyl Fence",
  shortName: "Vinyl",
  description: "Panelized vinyl fence with typed posts, caps, gates, and concrete.",
  inputs,
  defaultValues: defaultsFromInputs(inputs),
  ruleKeys: ["panelWidth", "concreteBagsPerPost", "wastePercent"],
  resultDefinitions: [
    { id: "panels", label: "Panels", unit: "PANEL" },
    { id: "linePosts", label: "Line posts", unit: "EA" },
    { id: "endPosts", label: "End posts", unit: "EA" },
    { id: "cornerPosts", label: "Corner posts", unit: "EA" },
    { id: "gatePosts", label: "Gate posts", unit: "EA" },
    { id: "caps", label: "Post caps", unit: "EA" },
    { id: "concrete", label: "Concrete", unit: "BAG" },
    { id: "gates", label: "Gates", unit: "EA" },
  ],
  aliases: ["vinyl", "vinyl fence", "pvc fence", "vinyl privacy"],
  validate,
  calculate(values) {
    const panels = installedSections(netFenceLength(values), valueNumber(values, "panelWidth"));
    const endPosts = valueNumber(values, "endQuantity");
    const cornerPosts = valueNumber(values, "cornerQuantity");
    const gatePosts = valueNumber(values, "gateQuantity") * 2;
    const linePosts = panels > 0 ? Math.max(0, panels + 1 - endPosts - cornerPosts) : 0;
    const posts = linePosts + endPosts + cornerPosts + gatePosts;
    const waste = valueNumber(values, "wastePercent");
    return [
      material("panels", "Panels", panels, "PANEL", { wastePercent: waste }),
      material("linePosts", "Line posts", linePosts, "EA", { wastePercent: waste }),
      material("endPosts", "End posts", endPosts, "EA", { wastePercent: waste }),
      material("cornerPosts", "Corner posts", cornerPosts, "EA", { wastePercent: waste }),
      material("gatePosts", "Gate posts", gatePosts, "EA", { wastePercent: waste }),
      material("caps", "Post caps", posts, "EA", { wastePercent: waste }),
      material("concrete", "Concrete", posts * valueNumber(values, "concreteBagsPerPost"), "BAG"),
      material("gates", "Gates", valueNumber(values, "gateQuantity"), "EA"),
    ];
  },
};
