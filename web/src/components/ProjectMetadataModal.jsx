import React, { useEffect, useState } from "react";
import { PROJECT_STATUSES, formatProjectDate, validateProjectDraft } from "../lib/projectMetadata.js";

export default function ProjectMetadataModal({ initial, mode = "new", hasWorkspace = false, saveState = "idle", onSubmit, onClose }) {
  const [draft, setDraft] = useState({ name: initial?.name || "", submissionDate: initial?.submissionDate || "", status: initial?.status || "Ongoing" });
  const [errors, setErrors] = useState({});
  useEffect(() => { document.querySelector('[name="new-project-name"]')?.focus(); }, []);
  const submit = (e) => {
    e.preventDefault();
    const checked = validateProjectDraft(draft);
    setErrors(checked.errors);
    if (checked.valid) onSubmit(checked.value);
  };
  const field = { width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid var(--ink-faint)", background: "var(--paper-shadow)", color: "var(--ink)", font: "inherit", outline: "none" };
  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1300, display: "grid", placeItems: "center", padding: 20, background: "rgba(5, 9, 16, .72)", backdropFilter: "blur(8px)" }}>
      <form role="dialog" aria-modal="true" aria-labelledby="project-modal-title" onSubmit={submit}
        style={{ width: "min(520px, 100%)", border: "1px solid var(--ink)", background: "var(--paper-bright)", color: "var(--ink)", boxShadow: "0 24px 70px rgba(0,0,0,.45)" }}>
        <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--ink-faint)" }}>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 9.5, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--cobalt)", marginBottom: 6 }}>Project</div>
          <h2 id="project-modal-title" style={{ margin: 0, fontFamily: "var(--f-display)", fontSize: 22 }}>{mode === "new" ? "New project" : "Project details"}</h2>
          <p style={{ margin: "7px 0 0", color: "var(--ink-muted)", fontSize: 12.5, lineHeight: 1.5 }}>
            {mode === "new" ? "Start a clean estimating workspace with portable project details." : "These details travel with local project files and Drive-backed projects."}
          </p>
        </div>
        <div style={{ display: "grid", gap: 16, padding: 22 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650 }}>Project name <span style={{ color: "var(--c-danger)" }}>*</span>
            <input name="new-project-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-invalid={!!errors.name} style={field} />
            {errors.name && <span role="alert" style={{ color: "var(--c-danger)", fontSize: 11.5 }}>{errors.name}</span>}
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650 }}>Submission / due date <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>optional</span>
              <input type="date" value={draft.submissionDate} onChange={(e) => setDraft((d) => ({ ...d, submissionDate: e.target.value }))} style={{ ...field, colorScheme: "dark" }} />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650 }}>Status
              <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} style={field}>
                {PROJECT_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>
          {mode === "new" && hasWorkspace && (
            <div style={{ padding: "10px 12px", borderLeft: "3px solid var(--c-warning)", background: "var(--paper-shadow)", fontSize: 12, lineHeight: 1.5 }}>
              <strong>This resets the current workspace.</strong> Loaded plans, takeoffs, markups, and local autosaved project data will be replaced. {saveState === "saving" ? "A save is still in progress." : "Export a project file first if you need a portable backup."}
            </div>
          )}
          {mode === "edit" && initial?.createdAt && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ink-muted)" }}>Created {formatProjectDate(initial.createdAt, { dateStyle: "medium", timeStyle: "short" })} · Last modified {formatProjectDate(initial.lastModifiedAt, { dateStyle: "medium", timeStyle: "short" })}</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 22px", borderTop: "1px solid var(--ink-faint)", background: "var(--paper-shadow)" }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 14px", border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", cursor: "pointer" }}>Cancel</button>
          <button type="submit" disabled={mode === "new" && saveState === "saving"} style={{ padding: "9px 16px", border: "1px solid var(--cobalt)", background: "var(--cobalt)", color: "white", cursor: mode === "new" && saveState === "saving" ? "wait" : "pointer", opacity: mode === "new" && saveState === "saving" ? .55 : 1, fontWeight: 700 }}>{mode === "new" && saveState === "saving" ? "Waiting for save…" : mode === "new" ? "Create project" : "Save details"}</button>
        </div>
      </form>
    </div>
  );
}
