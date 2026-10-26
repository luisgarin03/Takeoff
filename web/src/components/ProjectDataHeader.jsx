import React, { useState } from "react";
import { PROJECT_STATUSES, validateProjectDraft } from "../lib/projectMetadata.js";

export default function ProjectDataHeader({ metadata, onSave }) {
  const [draft, setDraft] = useState({ name: metadata.name || "", submissionDate: metadata.submissionDate || "", status: metadata.status || "Ongoing" });
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const change = (key, value) => { setDraft((old) => ({ ...old, [key]: value })); setSaved(false); };
  return <form className="project-data-header" onSubmit={(event) => {
    event.preventDefault();
    const checked = validateProjectDraft(draft);
    setErrors(checked.errors);
    if (checked.valid) { onSave(checked.value); setSaved(true); }
  }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 14 }}>
      <label style={{ flex: "2 1 260px", display: "grid", gap: 7 }}>Project name<input value={draft.name} required onChange={(e) => change("name", e.target.value)} aria-invalid={!!errors.name} /></label>
      <label style={{ flex: "1 1 160px", display: "grid", gap: 7 }}>Submission / due date<input type="date" value={draft.submissionDate} onChange={(e) => change("submissionDate", e.target.value)} aria-invalid={!!errors.submissionDate} /></label>
      <label style={{ flex: "1 1 150px", display: "grid", gap: 7 }}>Status<select value={draft.status} onChange={(e) => change("status", e.target.value)}>{PROJECT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
      <button type="submit" className="ui-button ui-button--secondary">Save</button>
    </div>
    {Object.values(errors).length > 0 && <p role="alert" style={{ color: "var(--c-danger)" }}>{Object.values(errors).join(" ")}</p>}
    {saved && <p role="status" style={{ margin: "8px 0 0", color: "var(--c-positive)", fontSize: 12 }}>Project details saved.</p>}
  </form>;
}
