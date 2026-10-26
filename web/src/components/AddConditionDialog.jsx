import React, { useEffect, useRef, useState } from "react";

export default function AddConditionDialog({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector("input")?.focus();
    const key = (event) => {
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const nodes = [...root.current.querySelectorAll("input, button:not(:disabled)")];
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [onClose]);
  return <div className="pdf-export-scrim" style={{ zIndex: 3200 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={root} className="pdf-export-dialog" style={{ width: "min(460px, calc(100vw - 32px))" }} role="dialog" aria-modal="true" aria-labelledby="add-condition-title"
      onSubmit={(event) => { event.preventDefault(); if (name.trim()) onAdd(name.trim()); }}>
      <header><div><span>Takeoff</span><h2 id="add-condition-title">New condition</h2></div><button type="button" aria-label="Close new condition" onClick={onClose}>×</button></header>
      <div className="pdf-export-body">
        <p style={{ margin: "0 0 18px", color: "var(--ink-muted)", lineHeight: 1.5 }}>Give this condition a name to identify its measurements on your plans.</p>
        <label style={{ display: "grid", gap: 8, fontWeight: 600 }}>Condition name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Chain-link fence or LVT-1" required autoComplete="off" /></label>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>You can edit its name, colors, hatch, and waste allowance afterward.</p>
      </div>
      <footer><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={!name.trim()}>+ Add condition</button></footer>
    </form>
  </div>;
}
