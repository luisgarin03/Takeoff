import React from "react";
import { Icon } from "../brand/icons.jsx";

export default function LinearFenceChooser({ onChoose, onClose }) {
  const choice = { display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "center", gap: 10, padding: 12, border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", textAlign: "left", cursor: "pointer" };
  return <aside aria-label="Linear Fence Calculator" style={{ position: "absolute", right: 58, bottom: 14, zIndex: 13, width: "min(340px, calc(100vw - 82px))", background: "var(--paper-bright)", color: "var(--ink)", border: "1px solid var(--ink-faint)", boxShadow: "var(--shadow-2)" }} onPointerDown={(event) => event.stopPropagation()}>
    <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--ink-faint)" }}><Icon name="fencePosts" size={18} /><strong style={{ flex: 1 }}>Linear Fence Calculator</strong><button type="button" onClick={onClose} title="Close" style={{ border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", padding: 5 }}><Icon name="close" size={14} /></button></header>
    <div style={{ display: "grid", gap: 8, padding: 12 }}>
      <button type="button" style={choice} onClick={() => onChoose("chain-link")}><Icon name="fencePosts" size={18} /><span><strong style={{ display: "block" }}>Chain-Link Fence</strong><small style={{ color: "var(--ink-muted)" }}>Terminal, corner, and maximum-spacing line posts</small></span></button>
      <button type="button" style={choice} onClick={() => onChoose("ornamental")}><Icon name="fencePosts" size={18} /><span><strong style={{ display: "block" }}>Ornamental Fence</strong><small style={{ color: "var(--ink-muted)" }}>Panel widths and ornamental post layout</small></span></button>
    </div>
  </aside>;
}
