import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../brand/icons.jsx";
import googleLogo from "../brand/google-g.png";
import { useCloud } from "../lib/supabase/CloudContext.jsx";
import { createAuth, googleSignInUnavailable } from "../lib/supabase/auth.js";
import { createProjectRepository } from "../lib/supabase/projects.js";
import { createFileStorage } from "../lib/supabase/files.js";
import { createDriveFiles } from "../lib/supabase/driveFiles.js";
import { createProjectFiles } from "../lib/supabase/projectFiles.js";
import { connectDrive } from "../lib/supabase/driveConnection.js";
import { createCloudSync } from "../lib/supabase/sync.js";
import { cloudError, CloudError } from "../lib/supabase/errors.js";
import { captureCloudProject, restoredProjectSource } from "../lib/supabase/projectState.js";
import { createFileProjectStore, importFileProject, metaGet, metaPut } from "../lib/store.js";
import { exportProjectFile } from "../lib/projectFile.js";
import { saveProjectArchive } from "../lib/saveProjectFile.js";
import { downloadBytes } from "../lib/markedset.js";
import "../styles/cloud.css";

export const cloudBindingKey = (url, userId, workspace) => `supabase:${url}:${userId}:${workspace}`;
const workspace = () => new URLSearchParams(window.location.search).get("localProject") || "default";
const meta = { get: metaGet, put: metaPut };

export default function CloudProjects({ initialView = "projects", source, getPayload, onClose, onOpenChange }) {
  const cloud = useCloud(), root = useRef(null), callbacks = useRef(null);
  const [view, setView] = useState(initialView), [filter, setFilter] = useState("mine");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [projects, setProjects] = useState([]), [warnings, setWarnings] = useState([]);
  const [authMode, setAuthMode] = useState("signin"), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [code, setCode] = useState(""), [displayName, setDisplayName] = useState("");
  const [confirm, setConfirm] = useState(null), [name, setName] = useState("");
  const [sharing, setSharing] = useState(null), [members, setMembers] = useState([]), [shareEmail, setShareEmail] = useState(""), [role, setRole] = useState("viewer");
  const [conflict, setConflict] = useState(null), lock = useRef(false), alive = useRef(true);
  const [savedCopy, setSavedCopy] = useState("");
  const [drive, setDrive] = useState(null), [driveError, setDriveError] = useState("");
  const [provider, setProvider] = useState(null), [defaultProvider, setDefaultProvider] = useState("supabase");
  const [copyProvider, setCopyProvider] = useState("supabase"), [currentCloud, setCurrentCloud] = useState(null);
  const transfer = useRef(null);
  const userId = cloud.user?.id;
  const services = useMemo(() => {
    if (!cloud.client || !userId) return null;
    const repository = createProjectRepository(cloud.client, userId);
    const drive = createDriveFiles({ client: cloud.client, ...cloud.configuration, userId, assertUser: repository.assertUser });
    const files = createProjectFiles(createFileStorage(cloud.client, cloud.configuration.url, repository.assertUser), drive);
    const key = cloudBindingKey(cloud.configuration.url, userId, workspace());
    const sync = createCloudSync({ repository, files, local: source, meta, key, onProgress: (s) => { if (alive.current) setBusy(s); } });
    return { repository, files, drive, sync, key, preferenceKey: `drive-default:${cloud.configuration.url}:${userId}` };
  }, [cloud.client, userId, cloud.configuration, source]);
  const auth = cloud.client ? createAuth(cloud.client) : null;
  const googleUnavailable = googleSignInUnavailable();
  useEffect(() => {
    if (cloud.authReturn) {
      setError(cloud.authReturn.error);
      setNotice(cloud.authReturn.error ? "" : "Signed in with Google.");
    }
  }, [cloud.authReturn]);
  useEffect(() => {
    if (cloud.driveReturn) { setView("account"); setError(cloud.driveReturn.error); }
  }, [cloud.driveReturn]);
  callbacks.current = { busy, onClose };
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    root.current?.focus(); onOpenChange?.(true);
    const key = (e) => {
      if (!root.current?.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); if (!lock.current) callbacks.current.onClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") e.preventDefault();
      if (e.key === "Tab") {
        const nodes = [...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter((n) => n.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { alive.current = false; transfer.current?.abort(); window.removeEventListener("keydown", key, true); onOpenChange?.(false); previous?.focus?.(); };
  }, [onOpenChange]);

  const run = async (fn) => {
    if (lock.current) return;
    lock.current = true; transfer.current = new AbortController(); setBusy("Working..."); setError(""); setNotice(""); setSavedCopy(""); cloud.clearAuthReturn(); cloud.clearDriveReturn();
    try { await fn(); }
    catch (e) {
      const safe = cloudError(e);
      if (import.meta.env.DEV) console.warn("Cloud operation failed", { code: safe.code });
      if (alive.current) { setError(safe.message); if (safe.code === "OTK_CONFLICT") cloud.setStatus("Conflict"); }
    } finally { lock.current = false; if (alive.current) setBusy(""); }
  };
  async function refresh() {
    const rows = await services.repository.listProjects();
    if (alive.current) setProjects(rows);
  }
  async function refreshDrive() {
    const state = await services.drive.status();
    if (alive.current) { setDrive(state); setDriveError(""); }
  }
  useEffect(() => {
    setDrive(null); setDriveError(""); setCurrentCloud(null); setProvider(null); setDefaultProvider("supabase");
    if (!services) return;
    let live = true;
    services.drive.status().then((s) => { if (live) setDrive(s); }).catch((e) => { if (live) setDriveError(cloudError(e).message); });
    metaGet(services.preferenceKey).then((p) => { if (live && ["supabase", "google_drive"].includes(p)) setDefaultProvider(p); });
    return () => { live = false; transfer.current?.abort(); };
  }, [services]);
  useEffect(() => {
    if (!services || !cloud.driveReturn) return;
    let live = true;
    services.drive.status().then((s) => { if (live) setDrive(s); }).catch((e) => { if (live) setDriveError(cloudError(e).message); });
    return () => { live = false; };
  }, [services, cloud.driveReturn]);
  useEffect(() => {
    if (!services) return;
    let live = true;
    const id = getPayload().project_id;
    if (projects.some((p) => p.id === id && !p.deleted_at)) {
      services.repository.loadProject(id).then((p) => { if (live) { setCurrentCloud(p); setProvider(null); } }).catch(() => {});
    }
    return () => { live = false; };
    // Reload authoritative provider after saves/list refresh, not canvas edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, projects]);
  useEffect(() => {
    setProjects([]); setSharing(null); setMembers([]); setConflict(null); setWarnings([]); setConfirm(null);
    if (!services) return;
    let live = true;
    services.repository.listProjects().then((rows) => { if (live) setProjects(rows); }).catch((e) => { if (live) setError(cloudError(e).message); });
    // The canvas serializer includes edits still inside the local debounce.
    services.sync.status(getPayload()).then((status) => { if (live) cloud.setStatus(status); }).catch(() => {});
    return () => { live = false; };
    // Account/workspace changes, not drawing renders, refresh the cloud list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  async function authenticate(e) {
    e.preventDefault();
    await run(async () => {
      if (authMode === "signin") { await auth.signIn(email.trim(), password); setPassword(""); }
      else if (authMode === "signup") {
        const result = await auth.signUp(email.trim(), password, displayName);
        setPassword("");
        if (!result.session) { setAuthMode("confirm"); setNotice("Check your email for a confirmation code."); }
      } else if (authMode === "forgot") { await auth.forgotPassword(email.trim()); setAuthMode("recover"); setNotice("If an account exists, a recovery email has been sent."); }
      else if (authMode === "confirm" || authMode === "recover") {
        await auth.verifyCode(email.trim(), code.trim(), authMode === "recover" ? "recovery" : "signup");
        setCode(""); setAuthMode(authMode === "recover" ? "password" : "signin");
      } else if (authMode === "password") { await auth.updatePassword(password); setPassword(""); setAuthMode("signin"); setNotice("Password updated."); }
    });
  }
  async function authenticateGoogle() {
    await run(async () => {
      // OAuth leaves this page; flush edits still inside the local autosave delay first.
      await source.saveAnnotations(getPayload());
      setBusy("Opening Google...");
      await auth.signInWithGoogle();
    });
  }
  async function save(expectedVersion) {
    const payload = getPayload();
    setWarnings([]); cloud.setStatus("Uploading");
    try {
      const result = await services.sync.save(payload, { expectedVersion, signal: transfer.current?.signal,
        storageProvider: !currentCloud || currentCloud.owner_id === userId ? provider : undefined, newProjectProvider: defaultProvider });
      setWarnings(result.warnings); setNotice("Project state saved to cloud."); setConflict(null);
      cloud.setStatus(result.warnings.length ? "Files Local Only" : "Synced");
      await refresh();
    } catch (e) {
      if (e.code === "OTK_CONFLICT") {
        const latest = await services.repository.loadProject(payload.project_id);
        setConflict(latest); cloud.setStatus("Conflict");
      } else { cloud.setStatus(cloud.offline ? "Offline" : "Cloud Sync Pending"); throw e; }
    }
  }
  async function open(id) {
    await source.saveAnnotations(getPayload());
    cloud.setStatus("Downloading");
    const loaded = await services.sync.load(id, { signal: transfer.current?.signal });
    const localId = await importFileProject(loaded.restored);
    await metaPut(cloudBindingKey(cloud.configuration.url, cloud.user.id, localId), loaded.binding);
    // Open in a separate local workspace. Never overwrite an offline edit or
    // the previous workspace when adopting a cloud winner.
    window.location.assign(`${window.location.pathname}?localProject=${localId}`);
  }
  async function saveCopy(payload, localSource = source) {
    const id = crypto.randomUUID();
    const a = { ...payload, project_id: id, project_name: name.trim() || `${payload.project_name || "Untitled project"} copy` };
    const previous = localSource === source ? await services.sync.metadata() : null;
    const captured = await captureCloudProject(localSource, a, previous?.projectId === payload.project_id ? previous.missingPlans || [] : []);
    const pdfs = captured.state.plans.filter((p) => captured.files.has(p.sha256)).map((p) => ({ name: p.name, bytes: captured.files.get(p.sha256).bytes }));
    const snapshots = [];
    for (const s of await localSource.listSnapshots()) {
      const record = await localSource.getSnapshot(s.id);
      snapshots.push({ ...record, payload: { ...record.payload, project_id: id } });
    }
    const localId = await importFileProject({ annotations: a, pdfs, snapshots });
    const copyStore = createFileProjectStore(localId);
    const key = cloudBindingKey(cloud.configuration.url, cloud.user.id, localId);
    await metaPut(key, { projectId: id, cloudVersion: 0, missingPlans: captured.state.plans.filter((p) => !captured.files.has(p.sha256)) });
    const copySync = createCloudSync({ repository: services.repository, files: services.files, local: copyStore, meta,
      key, onProgress: setBusy });
    const path = `${window.location.pathname}?localProject=${localId}`;
    try {
      const result = await copySync.save(a, { storageProvider: copyProvider, signal: transfer.current?.signal });
      if (result.warnings.length) { setWarnings(result.warnings); setNotice("Copy saved; some files remain Local Only."); setSavedCopy(path); return; }
    } catch (e) { setNotice("The copy is saved locally."); setSavedCopy(path); throw e; }
    window.location.assign(path);
  }
  async function action() {
    const pending = confirm; setConfirm(null);
    if (pending.type === "rename") { await services.repository.renameProject(pending.project, name.trim()); await refresh(); }
    if (pending.type === "delete") {
      await services.repository.deleteProject(pending.project.id, pending.project.version);
      const rows = await services.repository.listFiles(pending.project.id);
      await services.files.removeRecords(rows);
      await services.repository.purgeProject(pending.project.id);
      setNotice("Cloud project deleted. Local workspaces and downloaded backups are unchanged."); await refresh();
    }
    if (pending.type === "copy-local") await saveCopy(getPayload());
    if (pending.type === "copy-cloud") {
      const loaded = await services.sync.load(pending.project.id, { signal: transfer.current?.signal });
      if (loaded.restored.missing.length) throw new CloudError("OTK_MISSING", "Restore Local Only files before duplicating this cloud project.");
      await saveCopy(loaded.restored.annotations, restoredProjectSource(loaded.restored));
    }
    if (pending.type === "use-cloud") await open(pending.project.id);
    if (pending.type === "keep-local") await save(pending.project.version);
  }
  const ask = (type, project) => { setCopyProvider(defaultProvider); setName(type.startsWith("copy") ? `${project?.name || getPayload().project_name || "Untitled project"} copy` : project?.name || ""); setConfirm({ type, project }); };
  async function download(project) {
    // The picker runs synchronously from the click, before network/ZIP work.
    await saveProjectArchive({ name: project.name,
      pickFile: typeof window.showSaveFilePicker === "function" ? window.showSaveFilePicker.bind(window) : null,
      buildArchive: async () => {
        const loaded = await services.sync.load(project.id, { signal: transfer.current?.signal });
        if (loaded.restored.missing.length) throw new CloudError("OTK_MISSING", "A complete .otk backup needs the Local Only files. Export from the device holding those originals.");
        return exportProjectFile(restoredProjectSource(loaded.restored), loaded.restored.annotations);
      }, download: downloadBytes });
  }
  const visible = projects.filter((p) => filter === "recent" || (filter === "mine" ? p.owner_id === cloud.user?.id : p.owner_id !== cloud.user?.id));
  const authentication = !cloud.user || authMode === "password";
  const storageOptions = <><option value="supabase">Supabase Storage</option><option value="google_drive" disabled={!drive?.connected}>Google Drive{!drive?.connected ? " (connect in Profile)" : ""}</option></>;
  return createPortal(<div className="cloud-shade" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
    <section ref={root} className="cloud-dialog" role="dialog" aria-modal="true" aria-label="Cloud projects" tabIndex={-1}>
      <header><h2>Cloud projects</h2><span className="cloud-status">{cloud.offline ? "Offline" : cloud.status}</span>
        <button type="button" title="Close cloud projects" aria-label="Close cloud projects" disabled={!!busy} onClick={onClose}><Icon name="close" size={18} /></button></header>
      <div className="cloud-content">
        {!cloud.configuration.configured ? <p role="status">{cloud.configuration.error || "Cloud is not configured. Local saving remains available."}</p> : !cloud.ready || !auth ? <p role="status">Restoring account...</p> : <>
          {authentication ? <form onSubmit={authenticate} className="cloud-auth">
            <h3>{{ signin: "Sign in", signup: "Create account", forgot: "Forgot password", confirm: "Confirm email", recover: "Recovery code", password: "New password" }[authMode]}</h3>
            {["signin", "signup"].includes(authMode) && <>
              <button className="cloud-google" type="button" disabled={!!busy || cloud.offline || !!googleUnavailable} title={googleUnavailable || undefined} onClick={authenticateGoogle}><img src={googleLogo} alt="" width="20" height="20" />Continue with Google</button>
              {googleUnavailable && <p role="note">{googleUnavailable}</p>}
            </>}
            {authMode !== "password" && <label>Email<input type="email" autoComplete="email" value={email} required onChange={(e) => setEmail(e.target.value)} /></label>}
            {authMode === "signup" && <label>Display name<input value={displayName} maxLength={120} autoComplete="name" onChange={(e) => setDisplayName(e.target.value)} /></label>}
            {["signin", "signup", "password"].includes(authMode) && <label>Password<input type="password" minLength={authMode === "signin" ? 1 : 8} autoComplete={authMode === "signin" ? "current-password" : "new-password"} value={password} required onChange={(e) => setPassword(e.target.value)} /></label>}
            {["confirm", "recover"].includes(authMode) && <label>Email code<input inputMode="numeric" autoComplete="one-time-code" value={code} required onChange={(e) => setCode(e.target.value)} /></label>}
            <button className="btn-primary" disabled={!!busy || cloud.offline} type="submit">{authMode === "signin" ? "Sign in" : "Continue"}</button>
            <div className="cloud-actions">{["signin", "signup", "forgot"].filter((m) => m !== authMode).map((m) => <button key={m} type="button" disabled={!!busy} onClick={() => { setAuthMode(m); setError(""); setPassword(""); }}>{m === "signup" ? "Create account" : m === "forgot" ? "Forgot password" : "Sign in"}</button>)}</div>
          </form> : <>
            <div className="cloud-account"><span>{cloud.user.email}</span><button disabled={!!busy} onClick={() => run(async () => { await auth.signOut(); cloud.setStatus("Local Only"); })}>Sign out</button></div>
            <div className="cloud-actions cloud-tabs"><button aria-pressed={view === "save"} disabled={!!busy} onClick={() => setView("save")}>This project</button><button aria-pressed={view === "projects"} disabled={!!busy} onClick={() => setView("projects")}>Browse projects</button><button aria-pressed={view === "account"} disabled={!!busy} onClick={() => { setDisplayName(cloud.user.user_metadata?.display_name || ""); setView("account"); }}>Profile</button></div>
            {view === "account" && <>
              <form className="cloud-auth" onSubmit={(e) => { e.preventDefault(); run(async () => { await auth.saveProfile(cloud.user.id, displayName); setNotice("Profile saved."); }); }}><label>Display name<input value={displayName} maxLength={120} onChange={(e) => setDisplayName(e.target.value)} /></label><button className="btn-primary" disabled={!!busy || cloud.offline}>Save profile</button></form>
              <section className="cloud-drive"><h3>Google Drive</h3>
                <p role="status">{drive?.connected ? `Connected as ${drive.email}` : drive?.configured ? "Not connected" : driveError || "Drive server setup required."}</p>
                <div className="cloud-actions">
                  <button disabled={!!busy || cloud.offline || !drive?.configured} onClick={() => run(async () => {
                    await source.saveAnnotations(getPayload()); await connectDrive(services.drive);
                  })}>{drive?.connected ? "Reconnect Google Drive" : "Connect Google Drive"}</button>
                  {drive?.connected && <><button disabled={!!busy || cloud.offline} onClick={() => {
                    if (window.confirm("Disconnect Google Drive? Cloud files in this Drive will be unavailable to you and shared members until you reconnect. Local copies are kept.")) run(async () => {
                      const result = await services.drive.disconnect(); await refreshDrive();
                      setNotice(result.revoked ? "Google Drive disconnected." : "Disconnected in OpenTakeoff. Also remove access under Google Account permissions.");
                    });
                  }}>Disconnect</button><a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Manage</a></>}
                  <button disabled={!!busy || cloud.offline} onClick={() => run(refreshDrive)}>Refresh connection</button>
                </div>
                <label>Default file storage for new cloud projects<select value={defaultProvider} disabled={!!busy} onChange={(e) => run(async () => {
                  const value = e.target.value; await metaPut(services.preferenceKey, value); setDefaultProvider(value);
                })}>{storageOptions}</select></label>
              </section>
            </>}
            {view === "save" && <div className="cloud-save"><h3>{getPayload().project_name || "Untitled project"}</h3>
              <label>Cloud file storage<select value={provider || currentCloud?.file_provider || defaultProvider} disabled={!!busy || !!currentCloud?.file_provider_locked || (!!currentCloud && currentCloud.owner_id !== userId)} onChange={(e) => setProvider(e.target.value)}>{storageOptions}</select></label>
              {currentCloud?.file_provider_locked && <p>Storage: {currentCloud.file_provider === "google_drive" ? "Google Drive" : "Supabase Storage"}. Existing files stay with this provider.</p>}
              <div className="cloud-actions"><button className="btn-primary" disabled={!!busy || cloud.offline || !!source.listFolder} onClick={() => run(() => save())}><Icon name="document" size={16} />Save to Cloud</button><button className="btn-ghost" disabled={!!busy || cloud.offline || !!source.listFolder} onClick={() => ask("copy-local")}>Save As...</button></div>
              {source.listFolder && <p>Export this Drive project and open its local .otk copy before saving to Supabase.</p>}
            </div>}
            {view === "projects" && <>
              <div className="cloud-actions"><select aria-label="Project filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="mine">My Projects</option><option value="shared">Shared With Me</option><option value="recent">Recent</option></select><button disabled={!!busy || cloud.offline} onClick={() => run(refresh)}>Refresh</button></div>
              {!visible.length && <p>No cloud projects in this view.</p>}
              <div className="cloud-project-list">{visible.map((p) => <article key={p.id}>
                <div><strong>{p.name}</strong><small>{p.owner} · {p.role} · {new Date(p.updated_at).toLocaleString()}{p.deleted_at ? " · Deleted" : " · Cloud"}</small></div>
                <div className="cloud-actions">
                  {!p.deleted_at && <><button disabled={!!busy || cloud.offline} onClick={() => run(() => open(p.id))}>Open</button><button disabled={!!busy || cloud.offline} onClick={() => run(() => download(p))}>Download</button><button disabled={!!busy || cloud.offline} onClick={() => ask("copy-cloud", p)}>Duplicate</button></>}
                  {!p.deleted_at && p.role !== "viewer" && <button disabled={!!busy || cloud.offline} onClick={() => ask("rename", p)}>Rename</button>}
                  {!p.deleted_at && p.role === "owner" && <button disabled={!!busy || cloud.offline} onClick={() => run(async () => { setSharing(p); setMembers(await services.repository.listProjectMembers(p.id)); })}>Share</button>}
                  {p.role === "owner" && <button disabled={!!busy || cloud.offline} onClick={() => ask("delete", p)}>{p.deleted_at ? "Finish deletion" : "Delete"}</button>}
                </div>
              </article>)}</div>
            </>}
            {sharing && <section className="cloud-share"><h3>Share {sharing.name}</h3><form onSubmit={(e) => { e.preventDefault(); run(async () => { await services.repository.shareProject(sharing.id, shareEmail, role); setMembers(await services.repository.listProjectMembers(sharing.id)); setShareEmail(""); }); }}>
              <label>Registered user's email<input type="email" required value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} /></label><select aria-label="Member role" value={role} onChange={(e) => setRole(e.target.value)}><option value="viewer">Viewer</option><option value="editor">Editor</option></select><button disabled={!!busy}>Share</button></form>
              {members.map((m) => <div className="cloud-member" key={m.user_id}><span>{m.name} · {m.role}</span><button disabled={!!busy} onClick={() => run(async () => { await services.repository.removeProjectMember(sharing.id, m.user_id); setMembers(await services.repository.listProjectMembers(sharing.id)); })}>Remove</button></div>)}
              <button disabled={!!busy} onClick={() => setSharing(null)}>Done</button></section>}
            {conflict && <section className="cloud-conflict" role="alert"><h3>Cloud version changed since your last sync</h3><p>Version {conflict.version}, updated {new Date(conflict.updated_at).toLocaleString()}</p><div className="cloud-actions"><button disabled={!!busy} onClick={() => ask("keep-local", conflict)}>Keep Local Version</button><button disabled={!!busy} onClick={() => ask("use-cloud", conflict)}>Use Cloud Version</button><button disabled={!!busy} onClick={() => ask("copy-local")}>Save Local as Copy</button></div></section>}
            {confirm && <section className="cloud-confirm"><h3>{{ rename: "Rename project", delete: "Delete cloud project?", "copy-local": "Save local as a new project", "copy-cloud": "Duplicate cloud project", "keep-local": "Replace the shown cloud version?", "use-cloud": "Open the cloud version?" }[confirm.type]}</h3>
              {["rename", "copy-local", "copy-cloud"].includes(confirm.type) && <label>Project name<input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></label>}
              {confirm.type.startsWith("copy") && <label>File storage for the new copy<select value={copyProvider} disabled={!!busy} onChange={(e) => setCopyProvider(e.target.value)}>{storageOptions}</select></label>}
              <p>{confirm.type === "delete" ? "The cloud project and its uploaded files will be removed. Local copies are kept." : confirm.type === "keep-local" ? "This replaces the cloud state only if it has not changed again." : confirm.type === "use-cloud" ? "Your local version is kept in its current workspace. The cloud copy opens separately." : "Copies use a new project ID and separate file storage."}</p>
              <div className="cloud-actions"><button disabled={!!busy} onClick={() => setConfirm(null)}>Cancel</button><button className="btn-primary" disabled={!!busy || (["rename", "copy-local", "copy-cloud"].includes(confirm.type) && !name.trim())} onClick={() => run(action)}>Confirm</button></div></section>}
          </>}
        </>}
        {busy && <p role="status">{busy}{/Uploading|Downloading/.test(busy) && <button type="button" onClick={() => transfer.current?.abort()}>Cancel transfer</button>}</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert" className="cloud-error">{error}</p>}
        {savedCopy && <a href={savedCopy}>Open saved copy</a>}
        {warnings.length > 0 && <ul className="cloud-warnings">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      </div>
    </section>
  </div>, document.body);
}
