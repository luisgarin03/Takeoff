import React, { useEffect, useRef, useState } from "react";

export default function SaveSettingsDialog({ filename, compactProject, hasDestination, onSave, onClose }) {
  const [name, setName] = useState(filename.replace(/\.otk$/i, ""));
  const [mode, setMode] = useState("full");
  const [newLocation, setNewLocation] = useState(!hasDestination);
  const [backup, setBackup] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector("input")?.focus();
    const key = (e) => {
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab") {
        const nodes = [...root.current.querySelectorAll("input:not(:disabled), button:not(:disabled)")];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [onClose]);
  return <div className="pdf-export-scrim" style={{ zIndex: 3100 }}>
    <form ref={root} className="pdf-export-dialog" role="dialog" aria-modal="true" aria-labelledby="save-settings-title" onSubmit={(e) => {
      e.preventDefault();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const base = name.trim().replace(/\.otk$/i, "");
      onSave(`${base}${mode === "compact" ? " - marked pages only" : ""}${backup ? ` - backup ${stamp}` : ""}.otk`, mode === "compact", newLocation || backup, backup);
    }}>
      <header><div><span>Portable project file</span><h2 id="save-settings-title">Save project</h2></div><button type="button" aria-label="Close save settings" onClick={onClose}>×</button></header>
      <div className="pdf-export-body">
        <label style={{ display: "grid", gap: 8 }}>File name<input required value={name} onChange={(e) => { setName(e.target.value); setNewLocation(true); }} style={{ padding: 10 }} /></label>
        <fieldset style={{ border: 0, padding: 0, margin: "20px 0" }}><legend style={{ marginBottom: 10 }}>What to save</legend>
          <label style={{ display: "block", padding: 12, border: "1px solid var(--ink-faint)", marginBottom: 10 }}><input type="radio" name="save-content" checked={mode === "full"} onChange={() => setMode("full")} /> <b>{compactProject ? "Save current project" : "Full project"}</b><p style={{ margin: "8px 0 0 23px", lineHeight: 1.5 }}>{compactProject ? "Preserves all content available in this compact project. Omitted source pages cannot be restored by saving; import the original files first." : "Keeps all loaded plans, measurements, markups, bookmarks, and Whiteboard content. Best for continuing work and keeping a complete backup."}</p></label>
          <label style={{ display: "block", padding: 12, border: "1px solid var(--ink-faint)", opacity: compactProject ? .55 : 1 }}><input type="radio" name="save-content" disabled={!!compactProject} checked={mode === "compact"} onChange={() => setMode("compact")} /> <b>Marked pages only</b><p style={{ margin: "8px 0 0 23px", lineHeight: 1.5 }}>Creates a smaller copy with measured, marked, or bookmarked plan pages. Other source-page content is omitted; keep a full project backup for future work. Your open workspace stays unchanged.</p></label>
        </fieldset>
        <label style={{ display: "block", marginBottom: 12 }}><input type="checkbox" checked={newLocation || mode === "compact" || backup} disabled={mode === "compact" || backup || !hasDestination} onChange={(e) => setNewLocation(e.target.checked)} /> Choose a new location / Save as</label>
        <label style={{ display: "block" }}><input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> Create a dated backup copy</label>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-muted)" }}>A dated backup adds a timestamp to the filename and leaves your current save destination unchanged. Your browser chooses the download location if file picking is unavailable. Files use the .otk format.</p>
      </div>
      <footer><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={!name.trim()}>Save…</button></footer>
    </form>
  </div>;
}
