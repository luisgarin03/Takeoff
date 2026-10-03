import React, { useEffect, useMemo, useRef, useState } from "react";
import { createProjectInvitations, importSharedFiles } from "../lib/projectInvitations.js";
import { pickDriveFiles } from "../lib/googleDrivePicker.js";
import { connectDrive } from "../lib/supabase/driveConnection.js";
import { cloudError } from "../lib/supabase/errors.js";

export default function ProjectInvitations({ cloud, drive, assertUser, shareEntry, onShareClose, busy, run, onOpen }) {
  const api = useMemo(() => createProjectInvitations(cloud.client, cloud.user.id, assertUser, drive), [cloud.client, cloud.user.id, assertUser, drive]);
  const [rows, setRows] = useState([]), [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [files, setFiles] = useState(null), [email, setEmail] = useState("");
  const [status, setStatus] = useState(""), [received, setReceived] = useState(null);
  const [selected, setSelected] = useState([]), [projectPath, setProjectPath] = useState("");
  const shareForm = useRef(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api.list().then((data) => { if (live) { setRows(data); setLoadError(""); } }).catch((e) => { if (live) setLoadError(cloudError(e).message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, revision]);
  useEffect(() => {
    if (cloud.offline) return;
    const timer = setInterval(() => { if (!document.hidden && !busy) setRevision((n) => n + 1); }, 60000);
    return () => clearInterval(timer);
  }, [cloud.offline, busy]);
  useEffect(() => {
    setFiles(null); setEmail("");
    if (shareEntry) {
      setStatus("");
      shareForm.current?.scrollIntoView({ block: "nearest" });
    }
  }, [shareEntry]);
  const incoming = rows.filter((r) => r.sender_id !== cloud.user.id && r.state === "ready" && new Date(r.expires_at) > new Date());
  const outgoing = rows.filter((r) => r.sender_id === cloud.user.id && r.state !== "revoked");
  const refresh = () => { setRevision((n) => n + 1); cloud.refreshInvitations?.(); };
  async function choose(invitation) {
    const files = await api.files(invitation.id);
    setReceived({ ...invitation, files }); setSelected(files.map((f) => f.path));
    setProjectPath(files.find((f) => /\.otk$/i.test(f.path))?.path || ""); setStatus("");
  }
  async function importFiles() {
    // Picker must run directly from a user gesture, before any network awaits.
    const parent = await window.showDirectoryPicker({ mode: "readwrite", id: "shared-project-import" });
    const handle = await importSharedFiles(api, received, selected, projectPath, parent, setStatus);
    await api.imported(received.id).catch(() => { setStatus("Files copied; notification status could not be updated."); });
    refresh();
    await onOpen(handle);
  }
  return <section className="project-invitations" aria-label="Project sharing">
    <div className="cloud-actions"><strong>Shared with me{incoming.some((r) => !r.imported_at) ? ` (${incoming.filter((r) => !r.imported_at).length} new)` : ""}</strong><button disabled={busy || loading || cloud.offline} onClick={refresh}>Refresh invitations</button></div>
    {loading && !rows.length && <p role="status">Loading invitations…</p>}
    {loadError && <p role="status">Project sharing is unavailable. {loadError}</p>}
    {!loading && !loadError && !incoming.length && <p>No project invitations yet.</p>}
    {incoming.map((item) => <div key={item.id} className="share-invitation-row"><div><strong>{item.project_name}</strong><small>From {item.sender_email} · {item.imported_at ? "Imported" : "New invitation"}</small></div><button disabled={busy} onClick={() => run(() => choose(item))}>Import to my Drive</button></div>)}
    {shareEntry && <section ref={shareForm} className="cloud-confirm" aria-label="Share project">
      <h3>Share {shareEntry.name}</h3><p>Choose the actual files in Google Drive. The recipient gets read/download access to those files in your Drive. Save and sync your latest .otk file first.</p>
      <div className="cloud-actions"><button disabled={busy || cloud.offline} onClick={() => run(async () => { const picked = await pickDriveFiles(drive); if (picked) setFiles(picked); })}>Choose files in Google Drive</button><button disabled={busy || cloud.offline} onClick={() => run(() => connectDrive(drive))}>Connect Google Drive</button></div>
      {files && <><ul className="share-file-list">{files.map((f) => <li key={f.id}>{f.name}</li>)}</ul>
        <form onSubmit={(e) => { e.preventDefault(); run(async () => {
          setStatus("");
          const result = await api.send(shareEntry.name.replace(/\.otk$/i, ""), email.trim(), files);
          onShareClose(); refresh();
          setStatus(result.emailSent ? "Drive access granted. Google sent sharing emails and the in-app invitation is ready." : "The recipient already has Drive access. An in-app invitation was created; Google did not send a new sharing email.");
        }); }}><label>Recipient email<input type="email" value={email} required maxLength={254} disabled={busy} onChange={(e) => setEmail(e.target.value)} /></label><p>Include an .otk file. Google sends an email for each newly shared file. Files remain in your Drive.</p><button className="btn-primary" disabled={busy || cloud.offline || !files.some((f) => /\.otk$/i.test(f.name))}>Share & notify</button></form></>}
      <button disabled={busy} onClick={onShareClose}>Cancel</button>
    </section>}
    {received && <section className="cloud-confirm" aria-label="Import shared project"><h3>Import {received.project_name}</h3><p>Download selected files directly from the shared Drive into a new folder inside your Google Drive synced folder. Existing files will not be overwritten.</p>
      <p>The .otk archive contains its saved plans and takeoff data as one file; attachments below are optional.</p>
      <label>Project to open<select value={projectPath} disabled={busy} onChange={(e) => { setProjectPath(e.target.value); setSelected((list) => [...new Set([...list, e.target.value])]); }}>{received.files.filter((f) => /\.otk$/i.test(f.path)).map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}</select></label>
      <div className="share-file-list">{received.files.map((file) => <label key={file.path}><input type="checkbox" checked={selected.includes(file.path)} disabled={busy || file.path === projectPath} onChange={(e) => setSelected((list) => e.target.checked ? [...list, file.path] : list.filter((path) => path !== file.path))} />{file.path}{file.path === projectPath ? " (required)" : ""}</label>)}</div>
      {!window.showDirectoryPicker && <p>This browser cannot write to a Drive folder. Open this invitation in desktop Chrome or Edge with Google Drive for desktop installed.</p>}
      <div className="cloud-actions"><button disabled={busy || cloud.offline || !window.showDirectoryPicker || !projectPath} onClick={() => run(importFiles)}>Choose Drive folder & import</button><button disabled={busy} onClick={() => setReceived(null)}>Cancel</button></div>
    </section>}
    {status && <p role="status" aria-live="polite">{status}</p>}
    {!!outgoing.length && <details><summary>Sent invitations ({outgoing.length})</summary><p>Canceling an app invitation does not remove Google Drive permissions. Manage those using Share in Google Drive.</p>{outgoing.map((item) => <div className="share-invitation-row" key={item.id}><div><strong>{item.project_name}</strong><small>To {item.recipient_email} · {new Date(item.expires_at) <= new Date() ? "Expired" : item.state === "draft" ? "Incomplete — check permissions in Drive before retrying" : item.imported_at ? "Imported" : "Awaiting import"}</small></div><button disabled={busy || cloud.offline} onClick={() => run(async () => { await api.revoke(item); setStatus("App invitation canceled. Manage Drive permissions in Google Drive."); refresh(); })}>Cancel invitation</button></div>)}</details>}
  </section>;
}
