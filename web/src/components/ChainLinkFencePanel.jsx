import React from "react";
import { Icon } from "../brand/icons.jsx";
import { DEFAULT_CHAIN_LINK_SPACING_FT, MIN_CHAIN_LINK_SPACING_FT } from "../lib/chainLinkFence.js";
import { M_PER_FT } from "../lib/units";

const panel = {
  position: "absolute", right: 58, bottom: 14, zIndex: 12, width: "min(360px, calc(100vw - 82px))",
  maxHeight: "min(650px, calc(100vh - var(--workspace-toolbar-height, 0px) - 30px))", overflow: "auto",
  background: "var(--paper-bright)", color: "var(--ink)", border: "1px solid var(--ink-faint)", boxShadow: "var(--shadow-2)",
};
const button = { border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", padding: "7px 9px", cursor: "pointer", fontWeight: 650, fontSize: 12 };
const label = { display: "grid", gap: 4, fontSize: 11.5, color: "var(--ink-muted)" };
const input = { border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", padding: "7px 8px", minWidth: 0 };

const number = (value, digits = 1) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function ChainLinkFencePanel({
  units = "imperial", fence, calculation, selectedMarkerId, addMode, canAttach, attachCount = 0,
  onCreate, onAddMode, onPatch, onSelectMarker, onDeleteMarker, onDeleteFence,
  onUndo, onRedo, canUndo, canRedo, onClose,
}) {
  const metric = units === "metric";
  const spacing = fence ? (metric ? fence.max_spacing_ft * M_PER_FT : fence.max_spacing_ft) : (metric ? DEFAULT_CHAIN_LINK_SPACING_FT * M_PER_FT : DEFAULT_CHAIN_LINK_SPACING_FT);
  const patchSpacing = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    onPatch({ max_spacing_ft: Math.max(MIN_CHAIN_LINK_SPACING_FT, metric ? n / M_PER_FT : n) }, "spacing");
  };
  return (
    <aside aria-label="Chain-Link Fence Post Calculator" style={panel} onPointerDown={(event) => event.stopPropagation()}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--ink-faint)" }}>
        <Icon name="fencePosts" size={18} />
        <strong style={{ flex: 1, fontFamily: "var(--f-display)", fontSize: 14 }}>Chain-Link Fence Posts</strong>
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo fence edit" style={{ ...button, padding: 5, opacity: canUndo ? 1 : .35 }}><Icon name="undo" size={14} /></button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo fence edit" style={{ ...button, padding: 5, opacity: canRedo ? 1 : .35, transform: "scaleX(-1)" }}><Icon name="undo" size={14} /></button>
        <button type="button" onClick={onClose} title="Close" style={{ ...button, padding: 5 }}><Icon name="close" size={14} /></button>
      </header>
      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        {!fence ? (
          <>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-muted)" }}>
              Attach this calculator to every completed Linear takeoff in the selected condition. Source lines and measured quantities stay unchanged.
            </p>
            <button type="button" onClick={onCreate} disabled={!canAttach}
              style={{ ...button, background: canAttach ? "var(--cobalt)" : "var(--paper-cream)", color: canAttach ? "white" : "var(--ink-muted)", opacity: canAttach ? 1 : .6 }}>
              Attach {attachCount || "all"} linear takeoff{attachCount === 1 ? "" : "s"} in condition
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onAddMode} style={{ ...button, flex: 1, background: addMode ? "var(--cobalt)" : "transparent", color: addMode ? "white" : "var(--ink)" }}>
                {addMode ? "Click line to add post…" : "+ Add corner post"}
              </button>
              <button type="button" onClick={onDeleteFence} title="Remove this calculator; the measured line is kept" style={{ ...button, color: "var(--c-danger)" }}>Remove</button>
            </div>
            {!calculation?.valid && <div role="alert" style={{ padding: 9, border: "1px solid var(--c-danger)", color: "var(--c-danger)", fontSize: 12 }}>Set a valid PDF scale before calculating post spacing.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
              {[
                ["Fence", `${number(metric ? calculation?.totalLengthFt * M_PER_FT : calculation?.totalLengthFt)} ${metric ? "m" : "LF"}`],
                ["Sections", calculation?.sections?.length || 0],
                ["Corner / terminal", calculation?.cornerPostCount || 0],
                ["Line posts", calculation?.linePostCount || 0],
                ["Total posts", calculation?.totalPostCount || 0],
                ["Manual markers", fence.markers.length],
              ].map(([name, value]) => <div key={name} style={{ border: "1px solid var(--ink-faint)", padding: "7px 8px" }}><div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-muted)" }}>{name}</div><strong style={{ fontFamily: "var(--f-mono)", fontSize: 13 }}>{value}</strong></div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <label style={label}>Maximum spacing ({metric ? "m" : "ft"})
                <input style={input} type="number" min={metric ? .1 : .25} step={metric ? .1 : .25} value={Number(spacing.toFixed(3))} onChange={(event) => patchSpacing(event.target.value)} />
              </label>
              <label style={label}>Marker size
                <input style={input} type="number" min="4" max="16" step="1" value={fence.marker_size} onChange={(event) => onPatch({ marker_size: Number(event.target.value) }, "appearance")} />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
              {[
                ["show_corner_posts", "Corner posts"], ["show_line_posts", "Line posts"],
                ["show_section_lengths", "Section lengths"], ["show_post_counts", "Post counts"],
              ].map(([key, text]) => <label key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={!!fence[key]} onChange={(event) => onPatch({ [key]: event.target.checked }, "display")} />{text}</label>)}
              <label style={{ display: "flex", alignItems: "center", gap: 6 }} title="Adds a closing section back to the starting post"><input type="checkbox" checked={!!fence.closed} onChange={(event) => onPatch({ closed: event.target.checked }, "closed-loop")} />Closed loop</label>
            </div>
            {selectedMarkerId && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--cobalt)" }}>
              <span style={{ flex: 1, fontSize: 12 }}>Selected manual post</span>
              <button type="button" onClick={() => onSelectMarker(selectedMarkerId, { type: fence.markers.find((m) => m.id === selectedMarkerId)?.type === "terminal" ? "corner" : "terminal" })} style={button}>Toggle type</button>
              <button type="button" onClick={onDeleteMarker} style={{ ...button, color: "var(--c-danger)" }}>Delete</button>
            </div>}
            {!!calculation?.sections?.length && <div>
              <strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Sections</strong>
              <div style={{ display: "grid", gap: 4 }}>
                {calculation.sections.map((section) => <div key={section.id} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 7, padding: "5px 7px", background: "var(--paper-cream)", fontSize: 11.5 }}>
                  <strong>{section.index + 1}</strong>
                  <span>{number(metric ? section.lengthFt * M_PER_FT : section.lengthFt, 2)} {metric ? "m" : "ft"}</span>
                  <span>{section.intermediate} line · {number(metric ? section.actualSpacingFt * M_PER_FT : section.actualSpacingFt, 2)} {metric ? "m" : "ft"} spacing</span>
                </div>)}
              </div>
            </div>}
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: "var(--ink-muted)" }}>Square posts are section endpoints. Circular posts are derived automatically with no span longer than the maximum spacing. Drag a selected square along the fence to reposition it.</p>
          </>
        )}
      </div>
    </aside>
  );
}
