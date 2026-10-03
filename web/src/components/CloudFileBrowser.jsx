import React, { useState } from "react";
import { Icon } from "../brand/icons.jsx";
import { isDriveFolder } from "../lib/supabase/driveLibrary.js";
const date = (value) => value ? new Date(value).toLocaleString() : "Unknown";
const type = (f) => isDriveFolder(f) ? "Folder" : /\.otk$/i.test(f.name) ? "OTK" : /\.pdf$/i.test(f.name) ? "PDF" : f.mimeType?.startsWith("image/") ? "Image" : "File";
export default function CloudFileBrowser({ projects, drive, busy, offline, run, actions }) {
  const [trail, setTrail] = useState([]), [entries, setEntries] = useState([]), [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const project = trail[0]?.project;
  async function navigate(next) {
    if (next.length) {
      const last = next.at(-1), data = await drive.listFolder(next[0].project.id, last.id);
      setEntries(data.entries);
      if (next.length === 1) next = [{ ...next[0], id: data.projectFolder.id }];
    } else setEntries([]);
    setTrail(next); setSearch(""); setSelected(null);
  }
  const rows = (project ? entries : projects).filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return <section className="cloud-browser" aria-label="Project file browser">
    <nav className="cloud-actions" aria-label="Cloud folder path"><button disabled={busy} onClick={() => run(() => navigate([]))}>Cloud Projects</button><span>› Projects</span>{trail.map((item, i) => <button key={item.id || item.project.id} disabled={busy} onClick={() => run(() => navigate(trail.slice(0, i + 1)))}>› {item.name}</button>)}</nav>
    <div className="cloud-actions"><button disabled={busy || !trail.length} onClick={() => run(() => navigate(trail.slice(0, -1)))}>↑ Up</button><button disabled={busy || offline} onClick={() => run(() => navigate(trail))}>Refresh folder</button><input aria-label="Search current folder" placeholder="Search current folder..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div className="cloud-file-table"><table><thead><tr><th>Name</th><th className="cloud-author">Author</th><th>Modified</th><th className="cloud-type">Type / size</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id} aria-selected={selected?.id === p.id}>
      <td data-label="Name"><button disabled={busy || offline || p.deleted_at} onClick={() => setSelected(p)} onDoubleClick={() => {
        if ((!project && p.file_provider === "google_drive") || (project && isDriveFolder(p))) run(() => navigate([...trail, { id: project ? p.id : null, name: p.name, ...(!project ? { project: p } : {}) }]));
      }}><Icon name={!project || isDriveFolder(p) ? "folder" : p.mimeType?.startsWith("image/") ? "imageFile" : "document"} size={16} />{p.name}</button></td>
      <td data-label="Author" className="cloud-author">{!project ? p.project_metadata?.authorName || p.project_metadata?.authorEmail || p.owner || "Unknown" : "—"}</td>
      <td data-label="Modified">{date(project ? p.modifiedTime : p.updated_at)}</td><td data-label="Type / size" className="cloud-type">{project ? type(p) : p.deleted_at ? "Deleted" : p.file_provider === "google_drive" ? "Project" : "Legacy project"}{project && p.size != null ? ` · ${(Number(p.size) / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB` : ""}</td>
    </tr>)}</tbody></table></div>
    {!rows.length && <p>No files or projects in this view.</p>}
    {selected && <div className="cloud-actions cloud-selection" aria-label="Selected item actions">
      {(!project || isDriveFolder(selected)) && !selected.deleted_at && <button disabled={busy || offline || (!project && selected.file_provider !== "google_drive")} onClick={() => run(() => navigate([...trail, { id: project ? selected.id : null, name: selected.name, ...(!project ? { project: selected } : {}) }]))}>Browse folder</button>}
      {actions(project || selected, !project || /\.otk$/i.test(selected.name))}
    </div>}
    {project && <p>Files are listed for inspection. Open project reads the matching .otk from your locally synced Google Drive folder.</p>}
  </section>;
}
