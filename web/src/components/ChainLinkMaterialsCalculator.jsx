import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../brand/icons.jsx";
import { calculateChainLinkMaterials, CHAIN_LINK_MATERIAL_DEFAULTS } from "../lib/chainLinkMaterials.js";
import { createChainLinkMaterialsPdf } from "../lib/chainLinkMaterialsPdf.js";
import "../styles/chainLinkMaterials.css";

const numericFields = [
  ["fenceHeight", "Fence height (feet)"], ["meshOpening", "Mesh opening"], ["wireGauge", "Fabric wire gauge"],
  ["linePostDiameter", "Line post diameter (inches)"], ["linePostLength", "Line post length (feet)"],
  ["linePostSpacing", "Maximum line post spacing (feet)"], ["terminalPostDiameter", "End and corner post diameter (inches)"],
  ["terminalPostLength", "End and corner post length (feet)"], ["gatePostDiameter", "Gate post diameter (inches)"],
  ["gatePostLength", "Gate post length (feet)"], ["topRailDiameter", "Top rail diameter (inches)"],
  ["topRailStockLength", "Top rail stock length (feet)"], ["fabricRollLength", "Fabric roll length (feet)"],
  ["wastePercent", "Waste allowance (percent)"], ["manualEndPosts", "End posts (blank = estimate two per run)"],
  ["cornerPosts", "Additional corner posts"], ["gateQuantity", "Gate openings"], ["doubleSwingGates", "Double-swing gates"],
  ["hingesPerGate", "Hinges per gate"], ["latchesPerGate", "Latches per gate"], ["dropRodsPerDoubleGate", "Drop rods per double-swing gate"],
  ["tensionBandsPerFittingPost", "Tension bands per end, corner, or gate post"],
  ["braceBandsPerFittingPost", "Brace bands per end, corner, or gate post"], ["tieSpacingInches", "Fence tie spacing (inches)"],
  ["barbedWireStrands", "Barbed-wire strands (zero for none)"], ["barbedWireRollLength", "Barbed-wire roll length (feet)"],
  ["tensionWireRows", "Tension-wire rows"], ["hogRingsPerFoot", "Hog rings per linear foot"],
];

export default function ChainLinkMaterialsCalculator({ onClose }) {
  const [values, setValues] = useState(CHAIN_LINK_MATERIAL_DEFAULTS);
  const [runs, setRuns] = useState([""]);
  const [overrides, setOverrides] = useState({});
  const [extras, setExtras] = useState([]);
  const [extraDraft, setExtraDraft] = useState({ material: "", dimension: "", quantity: "", unit: "pieces", note: "" });
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const result = useMemo(() => calculateChainLinkMaterials(values, runs), [values, runs]);
  const rows = [...result.rows.map((row) => ({ ...row, quantity: overrides[row.id] ?? row.quantity })), ...extras];
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  async function downloadPdf() {
    setExporting(true);
    setError("");
    try {
      const bytes = await createChainLinkMaterialsPdf({ values, totalFenceLength: result.totalFenceLength, rows });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(values.project || "chain-link-materials").replace(/[^a-z0-9-]+/gi, "-")}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("The supplier PDF could not be created. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function addExtra(event) {
    event.preventDefault();
    if (!extraDraft.material.trim() || extraDraft.quantity === "") { setError("Enter a material name and quantity."); return; }
    setExtras((current) => [...current, { id: `extra-${Date.now()}-${current.length}`, ...extraDraft, material: extraDraft.material.trim(), quantity: Number(extraDraft.quantity), note: extraDraft.note || "Entered by the user." }]);
    setExtraDraft({ material: "", dimension: "", quantity: "", unit: "pieces", note: "" });
    setError("");
  }

  return createPortal(<div className="chain-material-shade"
    onPointerDown={(event) => event.stopPropagation()}
    onPointerMove={(event) => event.stopPropagation()}
    onPointerUp={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="chain-material-dialog" role="dialog" aria-modal="true" aria-labelledby="chain-material-title" onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") onClose(); }}>
      <header className="chain-material-header"><div><span className="chain-material-eyebrow">WHITEBOARD · SUPPLIER ORDER</span><h1 id="chain-material-title">Chain-Link Materials Calculator</h1><p>Enter each straight fence run. Quantities update automatically and can be adjusted for your supplier.</p></div><button type="button" aria-label="Close calculator" onClick={onClose}><Icon name="close" size={18} /></button></header>
      <div className="chain-material-body">
        <section className="chain-material-section"><h2>Project details</h2><div className="chain-material-fields">
          <label>Project name<input value={values.project} onChange={(e) => update("project", e.target.value)} placeholder="Project name" /></label>
          <label>Fence material<input value={values.material} onChange={(e) => update("material", e.target.value)} /></label>
          <label>Finish<input value={values.finish} onChange={(e) => update("finish", e.target.value)} placeholder="Black, galvanized, or other" /></label>
        </div></section>
        <section className="chain-material-section"><div className="chain-material-section-title"><div><h2>Fence runs</h2><p>Enter measured lengths excluding gate openings. Split runs at corners and gate posts.</p></div><strong>{result.totalFenceLength.toLocaleString()} linear feet total</strong></div>
          <div className="chain-material-runs">{runs.map((length, index) => <label key={index}>Run {index + 1} length (feet)<span><input type="number" min="0" step="0.1" value={length} onChange={(e) => setRuns((current) => current.map((entry, i) => i === index ? e.target.value : entry))} placeholder="0" />{runs.length > 1 && <button type="button" aria-label={`Remove run ${index + 1}`} onClick={() => setRuns((current) => current.filter((_, i) => i !== index))}>Remove</button>}</span></label>)}</div>
          <button type="button" className="chain-material-secondary" onClick={() => setRuns((current) => [...current, ""])}>+ Add fence run</button>
        </section>
        <section className="chain-material-section chain-material-concrete"><h2>Concrete for post holes</h2><p>Enter the hole size for each post type. The estimate uses cylindrical hole volume, post counts, bag yield, and the extra allowance.</p><div className="chain-material-fields chain-material-fields-wide chain-material-concrete-fields">
          {[["lineHoleDiameter", "Line post hole diameter (inches)"], ["lineHoleDepth", "Line post hole depth (inches)"], ["fittingHoleDiameter", "End and corner post hole diameter (inches)"], ["fittingHoleDepth", "End and corner post hole depth (inches)"], ["gateHoleDiameter", "Gate post hole diameter (inches)"], ["gateHoleDepth", "Gate post hole depth (inches)"], ["concreteBagYield", "Concrete yield per 80-pound bag (cubic feet)"], ["concreteWastePercent", "Extra concrete allowance (percent)"]].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" value={values[key]} onChange={(e) => update(key, e.target.value)} /></label>)}
        </div><div className="chain-material-concrete-summary"><div><span>Line post holes</span><strong>{result.concrete.linePosts} cubic feet</strong></div><div><span>End and corner post holes</span><strong>{result.concrete.fittingPosts} cubic feet</strong></div><div><span>Gate post holes</span><strong>{result.concrete.gatePosts} cubic feet</strong></div><div><span>Total including extra</span><strong>{result.concrete.totalCubicFeet} cubic feet</strong></div><div className="chain-material-concrete-total"><span>Estimated 80-pound bags</span><strong>{result.concrete.bags}</strong></div></div></section>
        <details className="chain-material-section chain-material-options"><summary><span><b>Construction details</b><small>Post sizes, spacing, gates, fittings, concrete, waste, and wire details</small></span><span aria-hidden="true">⌄</span></summary><div className="chain-material-fields chain-material-fields-wide">
          {numericFields.map(([key, label]) => <label key={key}>{label}<input type="text" inputMode="decimal" value={values[key]} onChange={(e) => update(key, e.target.value)} /></label>)}
        </div></details>
        <section className="chain-material-section"><div className="chain-material-section-title"><div><h2>Supplier material breakdown</h2><p>Calculated quantities are estimates. Edit a quantity to match the supplier takeoff.</p></div><a href="https://www.spsfence.com/Resources/Library" target="_blank" rel="noreferrer">SPS Fence resource library ↗</a></div>
          <div className="chain-material-table-wrap"><table className="chain-material-table"><thead><tr><th>Material</th><th>Dimensions</th><th>Quantity</th><th>Unit</th><th>Calculation</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.material}</td><td>{row.dimension}</td><td><input aria-label={`${row.material} quantity`} type="number" min="0" step="any" value={row.quantity} onChange={(e) => row.id.startsWith("extra-") ? setExtras((current) => current.map((item) => item.id === row.id ? { ...item, quantity: e.target.value } : item)) : setOverrides((current) => ({ ...current, [row.id]: e.target.value }))} /></td><td>{row.unit}</td><td>{row.note}</td><td>{row.id.startsWith("extra-") && <button type="button" aria-label={`Remove ${row.material}`} onClick={() => setExtras((current) => current.filter((item) => item.id !== row.id))}>×</button>}</td></tr>)}</tbody></table></div>
        </section>
        <form className="chain-material-add" onSubmit={addExtra}><h2>Add supplier-specific material</h2><div className="chain-material-fields chain-material-fields-wide">
          <label>Material name<input value={extraDraft.material} onChange={(e) => setExtraDraft({ ...extraDraft, material: e.target.value })} placeholder="For example, post cap" /></label>
          <label>Dimensions<input value={extraDraft.dimension} onChange={(e) => setExtraDraft({ ...extraDraft, dimension: e.target.value })} placeholder="Size or specification" /></label>
          <label>Quantity<input type="number" min="0" step="any" value={extraDraft.quantity} onChange={(e) => setExtraDraft({ ...extraDraft, quantity: e.target.value })} /></label>
          <label>Unit<select value={extraDraft.unit} onChange={(e) => setExtraDraft({ ...extraDraft, unit: e.target.value })}>{["pieces", "linear feet", "rolls", "bags", "boxes", "sets"].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          <label className="chain-material-note-field">Calculation notes<input value={extraDraft.note} onChange={(e) => setExtraDraft({ ...extraDraft, note: e.target.value })} placeholder="Optional" /></label>
        </div><button className="chain-material-secondary" type="submit">+ Add material row</button>{error && <p className="chain-material-error" role="alert">{error}</p>}</form>
        <p className="chain-material-disclaimer">Post layout, gate hardware, concrete, tie spacing, and package sizes vary by job and supplier. Review the notes and adjust quantities before ordering.</p>
      </div>
      <footer className="chain-material-footer"><span>{rows.length} materials · {result.totalFenceLength.toLocaleString()} linear feet</span><div><button type="button" className="chain-material-secondary" disabled={exporting} onClick={downloadPdf}>{exporting ? "Creating PDF…" : "Download supplier list PDF"}</button><button type="button" className="chain-material-primary" onClick={onClose}>Done</button></div></footer>
    </section>
  </div>, document.body);
}
