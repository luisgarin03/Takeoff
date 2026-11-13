const positive = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};
const roundUp = (value) => Math.ceil(Math.max(0, value));
const quantity = (value, digits = 2) => Number(Math.max(0, value).toFixed(digits));

export const CHAIN_LINK_MATERIAL_DEFAULTS = Object.freeze({
  project: "",
  material: "Chain-link fence",
  finish: "Black",
  fenceHeight: "6",
  meshOpening: "2 inches",
  wireGauge: "9 gauge",
  linePostDiameter: "2 3/8",
  linePostLength: "9",
  terminalPostDiameter: "3",
  terminalPostLength: "9",
  gatePostDiameter: "4",
  gatePostLength: "10",
  topRailDiameter: "1 5/8",
  linePostSpacing: "10",
  manualEndPosts: "",
  cornerPosts: "0",
  gateQuantity: "0",
  doubleSwingGates: "0",
  hingesPerGate: "2",
  latchesPerGate: "1",
  dropRodsPerDoubleGate: "1",
  fabricRollLength: "50",
  topRailStockLength: "21",
  wastePercent: "5",
  tensionBandsPerFittingPost: "5",
  braceBandsPerFittingPost: "2",
  tieSpacingInches: "24",
  bagsPerLinePost: "1",
  bagsPerFittingPost: "2",
  barbedWireStrands: "0",
  barbedWireRollLength: "1000",
  tensionWireRows: "2",
  hogRingsPerFoot: "1",
});

export function calculateChainLinkMaterials(values = {}, runLengths = []) {
  const v = { ...CHAIN_LINK_MATERIAL_DEFAULTS, ...values };
  const runs = (Array.isArray(runLengths) ? runLengths : [])
    .map((entry) => positive(typeof entry === "object" ? entry.length : entry))
    .filter((length) => length > 0);
  const totalFenceLength = runs.reduce((sum, length) => sum + length, 0);
  const spacing = positive(v.linePostSpacing);
  const linePosts = spacing > 0
    ? runs.reduce((sum, length) => sum + Math.max(0, Math.ceil(length / spacing) - 1), 0)
    : 0;
  const endPosts = v.manualEndPosts === "" || v.manualEndPosts == null
    ? runs.length * 2
    : roundUp(positive(v.manualEndPosts));
  const cornerPosts = roundUp(positive(v.cornerPosts));
  const gates = roundUp(positive(v.gateQuantity));
  const gatePosts = gates * 2;
  const fittingPosts = endPosts + cornerPosts + gatePosts;
  const waste = Math.min(100, positive(v.wastePercent)) / 100;
  const fabricLength = totalFenceLength * (1 + waste);
  const railLength = totalFenceLength * (1 + waste);
  const fabricRollLength = positive(v.fabricRollLength);
  const railStockLength = positive(v.topRailStockLength);
  const fabricRolls = fabricRollLength > 0 ? roundUp(fabricLength / fabricRollLength) : 0;
  const railPieces = railStockLength > 0
    ? runs.reduce((sum, length) => sum + roundUp(length * (1 + waste) / railStockLength), 0)
    : 0;
  const sleeves = railStockLength > 0
    ? runs.reduce((sum, length) => sum + Math.max(0, roundUp(length * (1 + waste) / railStockLength) - 1), 0)
    : 0;
  const gateHinges = gates * roundUp(positive(v.hingesPerGate));
  const gateLatches = gates * roundUp(positive(v.latchesPerGate));
  const dropRods = roundUp(positive(v.doubleSwingGates)) * roundUp(positive(v.dropRodsPerDoubleGate));
  const barbStrands = roundUp(positive(v.barbedWireStrands));
  const wireLength = totalFenceLength * barbStrands * (1 + waste);
  const barbRollLength = positive(v.barbedWireRollLength);
  const barbRolls = barbRollLength > 0 ? roundUp(wireLength / barbRollLength) : 0;
  const tensionWireLength = totalFenceLength * roundUp(positive(v.tensionWireRows)) * (1 + waste);
  const fittingAccessories = {
    tensionBands: fittingPosts * roundUp(positive(v.tensionBandsPerFittingPost)),
    braceBands: fittingPosts * roundUp(positive(v.braceBandsPerFittingPost)),
    tensionBars: fittingPosts,
    railEnds: fittingPosts,
  };
  const tieSpacing = positive(v.tieSpacingInches);
  const fenceTies = tieSpacing > 0 ? roundUp((totalFenceLength * 12) / tieSpacing) : 0;
  const concreteBags = linePosts * positive(v.bagsPerLinePost) + fittingPosts * positive(v.bagsPerFittingPost);
  const barbArms = barbStrands > 0 ? linePosts + endPosts + cornerPosts : 0;
  const hogRings = roundUp(totalFenceLength * positive(v.hogRingsPerFoot));
  const rows = [
    { id: "fabric", dimension: `${v.fenceHeight || "—"} feet high, ${v.meshOpening || "mesh opening not specified"}, ${v.wireGauge || "wire gauge not specified"}`, material: "Chain-link fence fabric", quantity: quantity(fabricLength), unit: "linear feet", note: `${fabricRolls} rolls at ${fabricRollLength || 0} linear feet per roll, including ${positive(v.wastePercent)} percent waste.` },
    { id: "top-rail", dimension: `${v.topRailDiameter || "—"} inch diameter × ${v.topRailStockLength || "—"} feet`, material: "Top rail", quantity: railPieces, unit: "pieces", note: `${quantity(railLength)} linear feet including waste.` },
    { id: "rail-sleeves", dimension: `${v.topRailDiameter || "—"} inch diameter`, material: "Top rail sleeves", quantity: sleeves, unit: "pieces", note: "One sleeve for each rail joint between stock pieces on each run." },
    { id: "line-posts", dimension: `${v.linePostDiameter || "—"} inch diameter × ${v.linePostLength || "—"} feet`, material: "Line posts", quantity: linePosts, unit: "pieces", note: `Calculated from ${runs.length} fence runs at ${spacing || 0} feet maximum spacing.` },
    { id: "end-posts", dimension: `${v.terminalPostDiameter || "—"} inch diameter × ${v.terminalPostLength || "—"} feet`, material: "End posts", quantity: endPosts, unit: "pieces", note: v.manualEndPosts === "" ? "Two end posts per fence run; adjust if the layout differs." : "Quantity entered by the user." },
    { id: "corner-posts", dimension: `${v.terminalPostDiameter || "—"} inch diameter × ${v.terminalPostLength || "—"} feet`, material: "Corner posts", quantity: cornerPosts, unit: "pieces", note: "Quantity entered by the user." },
    { id: "gate-posts", dimension: `${v.gatePostDiameter || "—"} inch diameter × ${v.gatePostLength || "—"} feet`, material: "Gate posts", quantity: gatePosts, unit: "pieces", note: "Two gate posts per gate opening." },
    { id: "loop-caps", dimension: `${v.linePostDiameter || "—"} inch diameter`, material: "Loop caps", quantity: linePosts, unit: "pieces", note: "One loop cap per line post." },
    { id: "rail-ends", dimension: `${v.topRailDiameter || "—"} inch diameter`, material: "Rail ends", quantity: fittingAccessories.railEnds, unit: "pieces", note: "One rail end per end, corner, and gate post." },
    { id: "tension-bands", dimension: `${v.fenceHeight || "—"} foot fence`, material: "Tension bands", quantity: fittingAccessories.tensionBands, unit: "pieces", note: `${positive(v.tensionBandsPerFittingPost)} per end, corner, and gate post.` },
    { id: "brace-bands", dimension: `${v.topRailDiameter || "—"} inch rail`, material: "Brace bands", quantity: fittingAccessories.braceBands, unit: "pieces", note: `${positive(v.braceBandsPerFittingPost)} per end, corner, and gate post.` },
    { id: "tension-bars", dimension: `${v.fenceHeight || "—"} foot fence`, material: "Tension bars", quantity: fittingAccessories.tensionBars, unit: "pieces", note: "One per end, corner, and gate post." },
    { id: "fence-ties", dimension: `Every ${positive(v.tieSpacingInches)} inches`, material: "Fence ties", quantity: fenceTies, unit: "pieces", note: "Calculated along the total fence length." },
    { id: "concrete", dimension: "Line post and fitting post holes", material: "Concrete bags", quantity: quantity(concreteBags), unit: "bags", note: `${positive(v.bagsPerLinePost)} bags per line post and ${positive(v.bagsPerFittingPost)} bags per end, corner, and gate post.` },
    { id: "gates", dimension: "As specified in the project", material: "Chain-link gates", quantity: gates, unit: "pieces", note: "Gate dimensions and frame materials can be listed as additional materials below." },
    { id: "gate-hinges", dimension: `${positive(v.hingesPerGate)} per gate`, material: "Gate hinges", quantity: gateHinges, unit: "pieces", note: "Based on the hinge quantity entered per gate." },
    { id: "gate-latches", dimension: "One per gate", material: "Gate latches", quantity: gateLatches, unit: "pieces", note: "Based on the latch quantity entered per gate." },
    { id: "drop-rods", dimension: "Double-swing gates", material: "Gate drop rods", quantity: dropRods, unit: "pieces", note: "Based on the number of double-swing gates and rods per gate." },
    { id: "barbed-arms", dimension: `${barbStrands} wire strand${barbStrands === 1 ? "" : "s"}`, material: "Barbed-wire arms", quantity: barbArms, unit: "pieces", note: "One arm per line, end, and corner post when barbed wire is selected." },
    { id: "barbed-wire", dimension: `${barbStrands} strand${barbStrands === 1 ? "" : "s"}`, material: "Barbed wire", quantity: barbRolls, unit: "rolls", note: `${quantity(wireLength)} linear feet; ${barbRollLength || 0} linear feet per roll, including waste.` },
    { id: "tension-wire", dimension: `${roundUp(positive(v.tensionWireRows))} wire row${roundUp(positive(v.tensionWireRows)) === 1 ? "" : "s"}`, material: "Tension wire coils", quantity: quantity(tensionWireLength), unit: "linear feet", note: "Calculated from total fence length, wire rows, and waste." },
    { id: "hog-rings", dimension: `${positive(v.hogRingsPerFoot)} per linear foot`, material: "Hog rings", quantity: hogRings, unit: "pieces", note: "Adjust the rings-per-foot rate to match the installation detail." },
  ];
  return { totalFenceLength: quantity(totalFenceLength), linePosts, endPosts, cornerPosts, gatePosts, runs: runs.length, rows };
}
