import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../brand/icons.jsx";
import "./themeSettings.css";

export default function AppSettingsDialog({ onClose, onMenuDepth, onAppearance, onPdf, onTrackpad }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    onMenuDepth(true);
    dialog.current.showModal();
    return () => { onMenuDepth(false); previous?.focus(); };
  }, [onMenuDepth]);
  const options = [
    ["palette", "Appearance", "Theme, colors, logo, and cursors", onAppearance],
    ["document", "PDF opening & OCR", "Plan loading, compatibility, and text recognition", onPdf],
    ["trackpad", "Trackpad", "Pan and zoom controls", onTrackpad],
  ];
  return createPortal(<dialog ref={dialog} className="theme-settings app-settings-dialog" aria-labelledby="app-settings-title" onCancel={onClose} onKeyDown={(event) => event.stopPropagation()}>
    <header><div><h2 id="app-settings-title"><Icon name="settings" size={21} /> Settings</h2></div><button type="button" autoFocus onClick={onClose} aria-label="Close settings">×</button></header>
    <div style={{ display: "grid", gap: 10, padding: 20 }}>{options.map(([icon, title, description, action]) => <button key={title} type="button" onClick={() => { onClose(); action(); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, textAlign: "left", border: "1px solid var(--ink-faint)", borderRadius: 8, background: "var(--paper-bright)", color: "var(--ink)" }}><Icon name={icon} size={22} /><span><strong style={{ display: "block" }}>{title}</strong><small style={{ display: "block", marginTop: 4, color: "var(--ink-muted)" }}>{description}</small></span><span style={{ marginLeft: "auto" }}><Icon name="chevronRight" size={16} /></span></button>)}</div>
  </dialog>, document.body);
}