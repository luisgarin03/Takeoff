import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../brand/icons.jsx";

export default function SaveProjectDialog({ filename, canChooseLocation, busy, error, onSave, onClose }) {
  const [name, setName] = useState(filename);
  const input = useRef(null), root = useRef(null);
  const callbacks = useRef({ busy, onClose });
  callbacks.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement;
    input.current.focus();
    input.current.setSelectionRange(0, Math.max(0, filename.length - 4));
    // Keep Plan Set/whiteboard/canvas shortcuts out of this nested dialog.
    const key = (e) => {
      if (!root.current?.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); if (!callbacks.current.busy) callbacks.current.onClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") e.preventDefault();
      if (e.key === "Tab") {
        const nodes = [...root.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [filename]);

  return <div ref={root} role="dialog" aria-modal="true" aria-labelledby="save-project-title"
    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
    style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16 }}>
    <form className="panel" onSubmit={(e) => { e.preventDefault(); if (!busy && name.trim()) onSave(name); }}
      style={{ background: "var(--paper-bright)", color: "var(--ink)", padding: 24, width: "100%", maxWidth: 420, boxSizing: "border-box", maxHeight: "100%", overflowY: "auto", borderRadius: 8 }}>
      <h2 id="save-project-title" style={{ margin: "0 0 20px", fontSize: 18 }}>Save project</h2>
      <label htmlFor="save-project-name" style={{ display: "block", marginBottom: 6 }}>File name</label>
      <input ref={input} id="save-project-name" value={name} onChange={(e) => setName(e.target.value)} required readOnly={busy}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }} />
      {!canChooseLocation && <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Save location is managed by your browser.</p>}
      {busy && <p role="status">Saving project file...</p>}
      {error && <p role="alert" style={{ color: "var(--c-danger)", overflowWrap: "anywhere" }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
        <button className="btn-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn-primary" type="submit" disabled={busy || !name.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, letterSpacing: 0 }}>
          <Icon name="document" size={15} />{canChooseLocation ? "Choose location..." : "Download"}
        </button>
      </div>
    </form>
  </div>;
}
