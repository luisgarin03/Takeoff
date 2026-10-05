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
  numberInput("postSpacing", "Post spacing", 8, { unit: "FT", exclusiveMin: 0, step: 0.5, editableRule: true, section: "layout" }),
  numberInput("railsPerSection", "Rails per section", 3, { unit: "EA", min: 0, integer: true, editableRule: true, section: "materials" }),
  numberInput("picketWidth", "Picket width", 5.5, { unit: "IN", exclusiveMin: 0, step: 0.125, editableRule: true, section: "materials" }),
  numberInput("boardOverlap", "Board overlap", 1, { unit: "IN", min: 0, step: 0.125, editableRule: true, section: "materials" }),
  numberInput("concreteBagsPerPost", "Concrete bags per post", 2, { unit: "BAG", min: 0, step: 0.25, editableRule: true, section: "materials" }),
  numberInput("wastePercent", "Waste", 5, { unit: "%", min: 0, max: 100, step: 0.5, editableRule: true, section: "advanced" }),
  numberInput("gateQuantity", "Gate quantity", 0, { unit: "EA", min: 0, integer: true, section: "gates" }),
  numberInput("gateWidth", "Average gate width", 4, { unit: "FT", min: 0, step: 0.5, section: "gates" }),
  numberInput("extraPosts", "Extra end/corner posts", 0, { unit: "EA", min: 0, integer: true, section: "advanced" }),
];

function validate(values: Readonly<Record<string, number | string>>): ValidationIssue[] {
  const issues = gateLengthValidation(values);
  if (valueNumber(values, "boardOverlap") >= valueNumber(values, "picketWidth")) {
    issues.push({
      field: "boardOverlap",
      code: "overlap-exceeds-width",
      message: "Board overlap must be less than the picket width.",
      severity: "error",
    });
  }
  return issues;
}

export const boardOnBoardCalculator: FenceCalculatorDefinition = {
  id: "board-on-board",
  name: "Board-on-Board Fence",
  shortName: "Board-on-Board",
  description: "Alternating overlapping pickets with posts, rails, caps, and concrete.",
  inputs,
  defaultValues: defaultsFromInputs(inputs),
  ruleKeys: ["postSpacing", "railsPerSection", "picketWidth", "boardOverlap", "concreteBagsPerPost", "wastePercent"],
  resultDefinitions: [
    { id: "sections", label: "Sections", unit: "EA" },
    { id: "posts", label: "Posts", unit: "EA" },
    { id: "rails", label: "Rails", unit: "EA" },
    { id: "pickets", label: "Pickets", unit: "EA" },
    { id: "concrete", label: "Concrete", unit: "BAG" },
    { id: "postCaps", label: "Post caps", unit: "EA" },
    { id: "gates", label: "Gates", unit: "EA" },
  ],
  aliases: ["board on board", "board-on-board", "board fence", "wood fence", "shadow box"],
  validate,
  calculate(values) {
    const length = netFenceLength(values);
    const sections = installedSections(length, valueNumber(values, "postSpacing"));
    const gateQuantity = valueNumber(values, "gateQuantity");
    const fencePosts = sections > 0 ? sections + 1 : 0;
    const posts = fencePosts + gateQuantity * 2 + valueNumber(values, "extraPosts");
    const coverage = valueNumber(values, "picketWidth") - valueNumber(values, "boardOverlap");
    const pickets = length > 0 ? Math.ceil((length * 12) / coverage) : 0;
    const waste = valueNumber(values, "wastePercent");
    return [
      material("sections", "Sections", sections, "EA"),
      material("posts", "Posts", posts, "EA", { wastePercent: waste }),
      material("rails", "Rails", sections * valueNumber(values, "railsPerSection"), "EA", { wastePercent: waste }),
      material("pickets", "Pickets", pickets, "EA", { wastePercent: waste }),
      material("concrete", "Concrete", posts * valueNumber(values, "concreteBagsPerPost"), "BAG"),
      material("postCaps", "Post caps", posts, "EA", { wastePercent: waste }),
      material("gates", "Gates", gateQuantity, "EA"),
    ];
  },
};
