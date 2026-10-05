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
  numberInput("panelLength", "Panel length", 10, { unit: "FT", exclusiveMin: 0, step: 0.5, editableRule: true, section: "layout" }),
  numberInput("basesPerPanel", "Bases / stands per panel", 1, { unit: "EA", min: 0, step: 0.5, editableRule: true, section: "materials" }),
  numberInput("clampsPerConnection", "Clamps per connection", 2, { unit: "EA", min: 0, integer: true, editableRule: true, section: "materials" }),
  numberInput("ballastPerBase", "Ballast weights per base", 0, { unit: "EA", min: 0, integer: true, editableRule: true, section: "materials" }),
  numberInput("gateQuantity", "Gate quantity", 0, { unit: "EA", min: 0, integer: true, section: "gates" }),
  numberInput("gateWidth", "Average gate width", 4, { unit: "FT", min: 0, step: 0.5, section: "gates" }),
  numberInput("wastePercent", "Waste", 5, { unit: "%", min: 0, max: 100, step: 0.5, editableRule: true, section: "advanced" }),
];

function validate(values: Readonly<Record<string, number | string>>): ValidationIssue[] {
  return gateLengthValidation(values);
}

export const temporaryCalculator: FenceCalculatorDefinition = {
  id: "temporary",
  name: "Temporary Fence",
  shortName: "Temporary",
  description: "Portable panels, bases, clamps, gates, and configured ballast.",
  inputs,
  defaultValues: defaultsFromInputs(inputs),
  ruleKeys: ["panelLength", "basesPerPanel", "clampsPerConnection", "ballastPerBase", "wastePercent"],
  resultDefinitions: [
    { id: "panels", label: "Fence panels", unit: "PANEL" },
    { id: "bases", label: "Bases / stands", unit: "EA" },
    { id: "clamps", label: "Clamps", unit: "EA" },
    { id: "ballast", label: "Ballast weights", unit: "EA" },
    { id: "gates", label: "Gates", unit: "EA" },
  ],
  aliases: ["temporary", "temporary fence", "construction fence", "portable fence"],
  validate,
  calculate(values) {
    const panels = installedSections(netFenceLength(values), valueNumber(values, "panelLength"));
    const gates = valueNumber(values, "gateQuantity");
    const connections = Math.max(0, panels - 1) + gates * 2;
    const bases = Math.ceil(panels * valueNumber(values, "basesPerPanel")) + gates * 2;
    const waste = valueNumber(values, "wastePercent");
    return [
      material("panels", "Fence panels", panels, "PANEL", { wastePercent: waste }),
      material("bases", "Bases / stands", bases, "EA", { wastePercent: waste }),
      material("clamps", "Clamps", connections * valueNumber(values, "clampsPerConnection"), "EA", { wastePercent: waste }),
      material("ballast", "Ballast weights", bases * valueNumber(values, "ballastPerBase"), "EA", { wastePercent: waste }),
      material("gates", "Gates", gates, "EA"),
    ];
  },
};
