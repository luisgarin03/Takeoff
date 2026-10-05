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
  numberInput("panelWidth", "Panel width", 8, { unit: "FT", exclusiveMin: 0, step: 0.5, editableRule: true, section: "layout" }),
  numberInput("railsPerSection", "Rails per section", 3, { unit: "EA", min: 0, integer: true, editableRule: true, section: "materials" }),
  numberInput("picketWidth", "Picket width", 5.5, { unit: "IN", exclusiveMin: 0, step: 0.125, editableRule: true, section: "materials" }),
  numberInput("picketSpacing", "Picket spacing", 0, { unit: "IN", min: 0, step: 0.125, editableRule: true, section: "materials" }),
  numberInput("concreteBagsPerPost", "Concrete bags per post", 2, { unit: "BAG", min: 0, step: 0.25, editableRule: true, section: "materials" }),
  numberInput("wastePercent", "Waste", 5, { unit: "%", min: 0, max: 100, step: 0.5, editableRule: true, section: "advanced" }),
  numberInput("gateQuantity", "Gate quantity", 0, { unit: "EA", min: 0, integer: true, section: "gates" }),
  numberInput("gateWidth", "Average gate width", 4, { unit: "FT", min: 0, step: 0.5, section: "gates" }),
];

function validate(values: Readonly<Record<string, number | string>>): ValidationIssue[] {
  return gateLengthValidation(values);
}

export const privacyCalculator: FenceCalculatorDefinition = {
  id: "privacy",
  name: "Privacy Fence",
  shortName: "Privacy",
  description: "Panel and field-built privacy-fence quantities from one layout.",
  inputs,
  defaultValues: defaultsFromInputs(inputs),
  ruleKeys: ["postSpacing", "panelWidth", "railsPerSection", "picketWidth", "picketSpacing", "concreteBagsPerPost", "wastePercent"],
  resultDefinitions: [
    { id: "sections", label: "Sections", unit: "EA" },
    { id: "panels", label: "Panels", unit: "PANEL" },
    { id: "posts", label: "Posts", unit: "EA" },
    { id: "rails", label: "Rails", unit: "EA" },
    { id: "pickets", label: "Pickets", unit: "EA" },
    { id: "concrete", label: "Concrete", unit: "BAG" },
    { id: "postCaps", label: "Post caps", unit: "EA" },
    { id: "gates", label: "Gates", unit: "EA" },
  ],
  aliases: ["privacy fence", "wood privacy", "stockade", "wood panel"],
  validate,
  calculate(values) {
    const length = netFenceLength(values);
    const sections = installedSections(length, valueNumber(values, "postSpacing"));
    const panels = installedSections(length, valueNumber(values, "panelWidth"));
    const gates = valueNumber(values, "gateQuantity");
    const posts = (sections > 0 ? sections + 1 : 0) + gates * 2;
    const picketCoverage = valueNumber(values, "picketWidth") + valueNumber(values, "picketSpacing");
    const pickets = length > 0 ? Math.ceil((length * 12) / picketCoverage) : 0;
    const waste = valueNumber(values, "wastePercent");
    return [
      material("sections", "Sections", sections, "EA"),
      material("panels", "Panels", panels, "PANEL", { wastePercent: waste }),
      material("posts", "Posts", posts, "EA", { wastePercent: waste }),
      material("rails", "Rails", sections * valueNumber(values, "railsPerSection"), "EA", { wastePercent: waste }),
      material("pickets", "Pickets", pickets, "EA", { wastePercent: waste }),
      material("concrete", "Concrete", posts * valueNumber(values, "concreteBagsPerPost"), "BAG"),
      material("postCaps", "Post caps", posts, "EA", { wastePercent: waste }),
      material("gates", "Gates", gates, "EA"),
    ];
  },
};
