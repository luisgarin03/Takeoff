import React, { useState } from "react";
import { Icon } from "../brand/icons.jsx";
import { listLocalDirectory } from "../lib/localDriveProject.js";

const fileType = (entry) => entry.kind === "directory" ? "Folder" : /\.otk$/i.test(entry.name) ? "OTK" : /\.pdf$/i.test(entry.name) ? "PDF" : /\.(png|jpe?g|gif|webp|svg)$/i.test(entry.name) ? "Image" : "File";
export default function LocalFolderBrowser({ initial, busy, run, onOpen, onShare }) {
  const [trail, setTrail] = useState(initial.trail || [initial.handle]);
  const [entries, setEntries] = useState(initial.entries);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  async function navigate(next) {
    const rows = await listLocalDirectory(next.at(-1));
    setEntries(rows); setTrail(next); setSelected(null); setSearch("");
  }
  const open = (entry) => run(() => entry.kind === "directory" ? navigate([...trail, entry.handle]) : onOpen(entry.handle));
  const rows = entries.filter((entry) => entry.name.toLowerCase().includes(search.toLowerCase()));
  return <section className="cloud-browser" aria-label="Selected local folder">
    <p aria-label="Source folder path" style={{ overflowWrap: "anywhere" }}>Source Folder: {trail.map((handle) => handle.name).join(" / ")}</p>
    <div className="cloud-actions">
      <button disabled={busy || trail.length === 1} onClick={() => run(() => navigate(trail.slice(0, -1)))}>↑ Up</button>
      <button disabled={busy} onClick={() => run(() => navigate(trail))}>Refresh folder</button>
      <input aria-label="Search selected folder" placeholder="Search current folder..." value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
    <div className="cloud-file-table"><table><thead><tr><th>Name</th><th>Last modified</th><th className="cloud-author">Modified by</th><th className="cloud-type">Type</th>{onShare && <th>Share</th>}</tr></thead><tbody>
      {rows.map((entry) => <tr key={entry.name} aria-selected={selected === entry}>
        <td data-label="Name"><div className={fileType(entry) === "OTK" ? "cloud-local-file" : undefined}><button className={fileType(entry) === "OTK" ? "cloud-local-filename" : undefined} disabled={busy} onClick={() => setSelected(entry)} onDoubleClick={() => { if (["Folder", "OTK"].includes(fileType(entry))) open(entry); }}><Icon name={entry.kind === "directory" ? "folder" : fileType(entry) === "Image" ? "imageFile" : "document"} size={16} /><span>{entry.name}</span></button>
        {fileType(entry) === "OTK" && <button className="cloud-open-project" disabled={busy} aria-label={`Open project: ${entry.name}`} onClick={() => open(entry)}><Icon name="plus" size={16} />Open</button>}</div></td>
        <td data-label="Last modified" title={entry.kind === "directory" ? "Latest contained-file modification; the browser does not expose folder timestamps." : undefined}>{entry.modified != null ? new Date(entry.modified).toLocaleString() : "Unknown"}{entry.kind === "directory" && entry.modified != null && <small className="cloud-folder-date">Latest file change</small>}</td><td data-label="Modified by" className="cloud-author">{entry.modifiedBy || "Unknown"}</td><td data-label="Type" className="cloud-type">{fileType(entry)}</td>
        {onShare && <td data-label="Share">{["Folder", "OTK"].includes(fileType(entry)) && <button disabled={busy} aria-label={`Share project: ${entry.name}`} onClick={() => onShare(entry)}>Share</button>}</td>}
      </tr>)}
    </tbody></table></div>
    {!rows.length && <p>{search ? "No matching files or folders." : initial.browseProjects && trail.length === 2 ? "No projects yet." : "This folder is empty."}</p>}
    <div className="cloud-actions cloud-selection" style={{ minHeight: 36 }}>{selected && ["Folder", "OTK"].includes(fileType(selected)) && <button disabled={busy} onClick={() => open(selected)}>{selected.kind === "directory" ? "Open folder" : "Open project"}</button>}</div>
  </section>;
}
