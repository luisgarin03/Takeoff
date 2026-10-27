import React, { useState } from "react";
import { Icon } from "../brand/icons.jsx";
import { DEFAULT_ORNAMENTAL_PANEL_WIDTH_FT, ORNAMENTAL_PANEL_WIDTHS_FT } from "../lib/ornamentalFence.js";
import { M_PER_FT } from "../lib/units";

const panel = { position: "absolute", right: 58, bottom: 14, zIndex: 12, width: "min(360px, calc(100vw - 82px))", maxHeight: "min(650px, calc(100vh - var(--workspace-toolbar-height, 0px) - 30px))", overflow: "auto", background: "var(--paper-bright)", color: "var(--ink)", border: "1px solid var(--ink-faint)", boxShadow: "var(--shadow-2)" };
const button = { border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", padding: "7px 9px", cursor: "pointer", fontWeight: 650, fontSize: 12 };
const input = { border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", padding: "7px 8px", minWidth: 0 };
const number = (value, digits = 1) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function OrnamentalFencePanel({ units = "imperial", fence, calculation, conditionSummary, sheetLabel = (value) => value, canAttach, attachCount = 0, addMode, selectedManualPostId, onAddMode, onDeleteManualPost, onCreate, onPatch, onDeleteFence, onClose }) {
  const [scope, setScope] = useState("page");
  const metric = units === "metric";
  const width = fence?.panel_width_ft || DEFAULT_ORNAMENTAL_PANEL_WIDTH_FT;
  const scopedSummary = conditionSummary?.[scope];
  const summary = conditionSummary ? scopedSummary : calculation && scope === "page" ? {
    lineCount: 1, totalLengthFt: calculation.totalLengthFt, panelCount: calculation.panelCount,
    postCount: calculation.postCount, orderedPanelLf: calculation.orderedPanelLf,
    cutWasteLf: calculation.cutWasteLf, wasteItems: [],
  } : scopedSummary || null;
  return <aside aria-label="Ornamental Fence Calculator" style={panel} onPointerDown={(event) => event.stopPropagation()}>
    <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--ink-faint)" }}>
      <Icon name="fencePosts" size={18} /><strong style={{ flex: 1, fontFamily: "var(--f-display)", fontSize: 14 }}>Ornamental Fence</strong>
      <button type="button" onClick={onClose} title="Close" style={{ ...button, padding: 5 }}><Icon name="close" size={14} /></button>
    </header>
    <div style={{ padding: 12, display: "grid", gap: 12 }}>
      {!fence ? <>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-muted)" }}>Attach this ornamental calculator to every completed Linear takeoff in the selected condition. Its settings remain separate from chain-link settings.</p>
        <button type="button" onClick={onCreate} disabled={!canAttach} style={{ ...button, background: canAttach ? "var(--cobalt)" : "var(--paper-cream)", color: canAttach ? "white" : "var(--ink-muted)", opacity: canAttach ? 1 : .6 }}>Attach {attachCount || "all"} linear takeoff{attachCount === 1 ? "" : "s"} in condition</button>
      </> : <>
        <button type="button" onClick={onAddMode} style={{ ...button, background: addMode ? "var(--cobalt)" : "transparent", color: addMode ? "var(--accent-contrast)" : "var(--ink)" }}>{addMode ? "Click anywhere on this sheet to add post…" : "+ Post"}</button>
        {selectedManualPostId && <button type="button" onClick={onDeleteManualPost} style={{ ...button, color: "var(--c-danger)", borderColor: "var(--c-danger)" }}>Delete selected added post</button>}
        <div role="group" aria-label="Ornamental quantity scope" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <button type="button" aria-pressed={scope === "page"} onClick={() => setScope("page")} style={{ ...button, background: scope === "page" ? "var(--cobalt)" : "transparent", color: scope === "page" ? "var(--accent-contrast)" : "var(--ink)" }}>This page</button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")} style={{ ...button, background: scope === "all" ? "var(--cobalt)" : "transparent", color: scope === "all" ? "var(--accent-contrast)" : "var(--ink)" }}>All added pages</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>{scope === "page" ? `Showing ${sheetLabel(conditionSummary?.currentSheetId || "current page")}` : "Showing every attached ornamental takeoff in this condition"}</div>
        {!!summary?.invalidScaleCount && <div role="alert" style={{ padding: 9, border: "1px solid var(--c-danger)", color: "var(--c-danger)", fontSize: 12, lineHeight: 1.45 }}>
          {summary.invalidScaleCount} attached takeoff{summary.invalidScaleCount === 1 ? " is" : "s are"} not included because {summary.invalidScaleCount === 1 ? "its sheet does" : "their sheets do"} not have a measurement scale. Set the PDF scale on {summary.invalidScaleCount === 1 ? "that sheet" : "those sheets"} to include {summary.invalidScaleCount === 1 ? "it" : "them"}.
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
          {[["Linear takeoffs", summary?.lineCount || 0], ["Measured fence", `${number(metric ? summary?.totalLengthFt * M_PER_FT : summary?.totalLengthFt)} ${metric ? "m" : "LF"}`], ["Panels to order", summary?.panelCount || 0], ["Posts", summary?.postCount || 0], ["Panel stock", `${number(metric ? summary?.orderedPanelLf * M_PER_FT : summary?.orderedPanelLf, 2)} ${metric ? "m" : "LF"}`], ["Total cut waste", `${number(metric ? summary?.cutWasteLf * M_PER_FT : summary?.cutWasteLf, 2)} ${metric ? "m" : "LF"}`]].map(([name, value]) => <div key={name} style={{ border: "1px solid var(--ink-faint)", padding: "7px 8px" }}><div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-muted)" }}>{name}</div><strong style={{ fontFamily: "var(--f-mono)", fontSize: 13 }}>{value}</strong></div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--ink-muted)" }}>Standard panel length<select style={input} value={width} onChange={(event) => onPatch({ panel_width_ft: Number(event.target.value) })}>{ORNAMENTAL_PANEL_WIDTHS_FT.map((feet) => <option key={feet} value={feet}>{feet} ft{metric ? ` (${number(feet * M_PER_FT, 2)} m)` : ""}</option>)}</select></label>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--ink-muted)" }}>Post marker size<input style={input} type="number" min="4" max="16" step="1" value={fence.marker_size} onChange={(event) => onPatch({ marker_size: Number(event.target.value) })} /></label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
          <label><input type="checkbox" checked={!!fence.show_posts} onChange={(event) => onPatch({ show_posts: event.target.checked })} /> Posts</label>
          <label><input type="checkbox" checked={!!fence.show_panel_lengths} onChange={(event) => onPatch({ show_panel_lengths: event.target.checked })} /> Panel widths</label>
          <label><input type="checkbox" checked={!!fence.show_post_counts} onChange={(event) => onPatch({ show_post_counts: event.target.checked })} /> Post counts</label>
          <label><input type="checkbox" checked={!!fence.closed} onChange={(event) => onPatch({ closed: event.target.checked })} /> Closed loop</label>
        </div>
        <div>
          <strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Reusable cut-panel offcuts</strong>
          {summary?.wasteItems?.length ? <div style={{ display: "grid", gap: 4, maxHeight: 190, overflow: "auto" }}>
            {summary.wasteItems.map((item) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "6px 7px", background: "var(--paper-cream)", fontSize: 11.5 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${sheetLabel(item.sheetId)} · Run ${item.run}`}>{sheetLabel(item.sheetId)} · Run {item.run}</span>
              <strong style={{ fontFamily: "var(--f-mono)" }}>{number(metric ? item.wasteFt * M_PER_FT : item.wasteFt, 2)} {metric ? "m" : "ft"} offcut</strong>
              <span style={{ gridColumn: "1 / -1", color: "var(--ink-muted)" }}>{item.panels} × {item.panelWidthFt} ft panels · final cut {number(metric ? item.finalCutFt * M_PER_FT : item.finalCutFt, 2)} {metric ? "m" : "ft"}</span>
            </div>)}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px", borderTop: "1px solid var(--ink-faint)", fontSize: 12 }}><strong>Total reusable length</strong><strong style={{ fontFamily: "var(--f-mono)" }}>{number(metric ? summary.cutWasteLf * M_PER_FT : summary.cutWasteLf, 2)} {metric ? "m" : "ft"}</strong></div>
          </div> : <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-muted)" }}>No cut-panel waste—all runs divide evenly into {width} ft panels.</p>}
        </div>
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: "var(--ink-muted)" }}>Each run orders whole {width} ft panels. Cut-panel waste is the unused length remaining after the final cut panel in each run.</p>
        <button type="button" onClick={onDeleteFence} title="Remove this calculator; the measured line is kept" style={{ ...button, color: "var(--c-danger)" }}>Remove ornamental calculator</button>
      </>}
    </div>
  </aside>;
}
