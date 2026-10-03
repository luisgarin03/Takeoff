import { SHARING_UI_ENABLED } from "../lib/sharingVisibility.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../brand/icons.jsx";
import googleLogo from "../brand/google-g.png";
import googleDriveLogo from "../brand/google-drive.png";
import { useCloud } from "../lib/supabase/CloudContext.jsx";
import { createAuth, googleSignInUnavailable } from "../lib/supabase/auth.js";
import { createProjectRepository } from "../lib/supabase/projects.js";
import { createFileStorage } from "../lib/supabase/files.js";
import { createDriveFiles } from "../lib/supabase/driveFiles.js";
import { createProjectFiles } from "../lib/supabase/projectFiles.js";

import { createCloudSync } from "../lib/supabase/sync.js";
import { cloudError, CloudError } from "../lib/supabase/errors.js";
import { captureCloudProject, restoredProjectSource } from "../lib/supabase/projectState.js";
import { createFileProjectStore, importFileProject, metaGet, metaPut } from "../lib/store.js";
import { projectFilename, projectFolderName } from "../lib/projectFile.js";
import { withProjectAuthor, withProjectEditor, touchProjectMetadata } from "../lib/projectMetadata.js";
import { downloadDriveFolder } from "../lib/supabase/driveLibrary.js";
import { openLocalDriveProject, localDriveUnavailable, readLocalProjectHandle, SOURCE_FOLDER_NAME, findLocalSourceFolder, createLocalSourceFolder, localSourceFolderView } from "../lib/localDriveProject.js";
import { jsonHash } from "../lib/supabase/projectState.js";
import CloudFileBrowser from "./CloudFileBrowser.jsx";
import AccountAvatar from "./AccountAvatar.jsx";
import LocalFolderBrowser from "./LocalFolderBrowser.jsx";
import ProjectInvitations from "./ProjectInvitations.jsx";

import "../styles/cloud.css";

export const cloudBindingKey = (url, userId, workspace) => `supabase:${url}:${userId}:${workspace}`;
const workspace = () => new URLSearchParams(window.location.search).get("localProject") || "default";
const meta = { get: metaGet, put: metaPut };

export default function CloudProjects({ initialView = "projects", source, getPayload, onPersisted, onClose, onOpenChange }) {
  const cloud = useCloud(), root = useRef(null), callbacks = useRef(null);
  const [view, setView] = useState(initialView), [filter, setFilter] = useState("mine");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [projects, setProjects] = useState([]), [warnings, setWarnings] = useState([]);
  const [authMode, setAuthMode] = useState("signin"), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [code, setCode] = useState(""), [displayName, setDisplayName] = useState(cloud.identity?.name || "");
  const [confirm, setConfirm] = useState(null), [name, setName] = useState("");
  const [sharing, setSharing] = useState(null), [members, setMembers] = useState([]), [shareEmail, setShareEmail] = useState(""), [role, setRole] = useState("viewer");
  const [conflict, setConflict] = useState(null), lock = useRef(false), alive = useRef(true);
  const [savedCopy, setSavedCopy] = useState("");
  const [drive, setDrive] = useState(null);
  const [defaultProvider, setDefaultProvider] = useState("google_drive");
  const [localRoot, setLocalRoot] = useState(null);
  const [restoringSource, setRestoringSource] = useState(!!cloud.user);
  const [localBrowser, setLocalBrowser] = useState(null);
  const [shareEntry, setShareEntry] = useState(null);
  const [showCloudLibrary, setShowCloudLibrary] = useState(false);
  const [createSource, setCreateSource] = useState(null);
  const [copyProvider, setCopyProvider] = useState("supabase"), [currentCloud, setCurrentCloud] = useState(null);
  const transfer = useRef(null);
  const userId = cloud.user?.id;
  const profileDraft = useRef({ userId, edited: false });
  useEffect(() => {
    if (profileDraft.current.userId !== userId) profileDraft.current = { userId, edited: false };
    if (view === "account" && !profileDraft.current.edited) setDisplayName(cloud.identity?.name || "");
  }, [userId, view, cloud.identity?.name]);
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
  callbacks.current = { busy, onClose, cancelCreate: createSource ? () => { setCreateSource(null); setError(""); } : null };
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    root.current?.focus(); onOpenChange?.(true);
    const key = (e) => {
      if (!root.current?.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); if (!lock.current) (callbacks.current.cancelCreate || callbacks.current.onClose)(); }
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
      if (e.name === "AbortError") return;
      const safe = cloudError(e);
      if (import.meta.env.DEV) console.warn("Cloud operation failed", { code: safe.code });
      if (alive.current) { setError(safe.message); if (safe.code === "OTK_CONFLICT") cloud.setStatus("Conflict"); }
    } finally { lock.current = false; if (alive.current) setBusy(""); }
  };
  async function refresh() {
    const rows = await services.repository.listProjects();
    if (alive.current) setProjects(rows);
  }
  useEffect(() => {
    setDrive(null); setCurrentCloud(null); setLocalRoot(null); setLocalBrowser(null); setShareEntry(null); setShowCloudLibrary(false); setCreateSource(null); setDefaultProvider("google_drive");
    setRestoringSource(!!services);
    if (!services) return;
    let live = true;
    metaGet(`drive-local-folder:${userId}`).then(async (saved) => {
      const handle = saved?.handle || saved;
      if (!handle || !live) return;
      setLocalRoot(handle);
      if (handle.queryPermission && await handle.queryPermission({ mode: "read" }) !== "granted") return;
      const browser = await localSourceFolderView(handle, !!saved?.browseProjects);
      if (live) setLocalBrowser(browser);
    }).catch(() => {
      if (live) setNotice("Could not load the saved source folder. Locate it again to continue.");
    }).finally(() => { if (live) setRestoringSource(false); });
    services.drive.status().then((s) => { if (live) setDrive(s); }).catch((e) => { if (live) setError(cloudError(e).message); });
    metaGet(services.preferenceKey).then((p) => { if (live && ["supabase", "google_drive"].includes(p)) setDefaultProvider(p); });
    return () => { live = false; transfer.current?.abort(); };
  }, [services, userId]);
  useEffect(() => {
    if (!services || !cloud.driveReturn) return;
    let live = true;
    services.drive.status().then((s) => { if (live) setDrive(s); }).catch((e) => { if (live) setError(cloudError(e).message); });
    return () => { live = false; };
  }, [services, cloud.driveReturn]);
  useEffect(() => {
    if (!services) return;
    let live = true;
    const id = getPayload().project_id;
    if (id) {
      services.repository.loadProject(id).then((p) => { if (live) { setCurrentCloud(p); } }).catch(() => {});
    }
    return () => { live = false; };
    // Reload authoritative provider after saves/list refresh, not canvas edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, projects]);
  useEffect(() => {
    setProjects([]); setSharing(null); setMembers([]); setConflict(null); setWarnings([]); setConfirm(null);
    if (!services) return;
    let live = true;
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
    const raw = getPayload({ touch: true });
    const binding = await services.sync.metadata();
    const authoritative = binding?.projectId === raw.project_id ? await services.repository.loadProject(raw.project_id) : currentCloud;
    const original = authoritative?.project_state?.annotations?.project_metadata;
    const author = original?.authorId || original?.authorName || original?.authorEmail ? original : raw.project_metadata;
    const payload = { ...raw, project_metadata: { ...raw.project_metadata, ...Object.fromEntries(Object.entries(withProjectAuthor(author, cloud.user, cloud.profileName) || {}).filter(([k]) => k.startsWith("author"))) } };
    setWarnings([]); cloud.setStatus("Uploading");
    try {
      const result = await services.sync.save(payload, { expectedVersion, signal: transfer.current?.signal,
        storageProvider: authoritative?.file_provider, newProjectProvider: "google_drive" });
      const filename = projectFilename(payload.project_name), folder = projectFolderName(payload.project_name);
      const destination = result.project.file_provider === "google_drive" ? `Google Drive folder ${folder}/` : "cloud storage";
      setWarnings(result.warnings); setNotice(result.warnings.length ? `Cloud save incomplete for ${folder}/${filename}. Retry after resolving the listed files.` : `${filename} and all project assets saved in ${destination}.`);
      if (!result.warnings.length) onPersisted?.(payload.project_metadata?.lastModifiedAt, payload.project_metadata);
      setConflict(null);
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
    const project = await services.repository.loadProject(id);
    await source.saveAnnotations(getPayload());
    if (project.file_provider !== "google_drive") {
      // Keep the pre-existing Supabase workflow available for legacy projects.
      cloud.setStatus("Downloading");
      const loaded = await services.sync.load(id, { signal: transfer.current?.signal });
      const localId = await importFileProject(loaded.restored);
      await metaPut(cloudBindingKey(cloud.configuration.url, userId, localId), loaded.binding);
      window.location.assign(`${window.location.pathname}?localProject=${localId}`);
      return;
    }
    setBusy("Opening project from Google Drive...");
    if (!localRoot) throw new CloudError("OTK_LOCAL_DRIVE", localDriveUnavailable);
    const listing = await services.drive.listFolder(id, null, transfer.current?.signal);
    const restored = await openLocalDriveProject(localRoot, listing.localPath, id, undefined, project.project_state.archive?.sha256);
    // Do not bind a stale synced .otk to the newest cloud version and overwrite it.
    const capture = project.project_state.archive ? { hash: await jsonHash(project.project_state), state: project.project_state } : await captureCloudProject(restoredProjectSource(restored), restored.annotations);
    if (await jsonHash(capture.state.annotations) !== await jsonHash(project.project_state.annotations)) throw new CloudError("OTK_LOCAL_DRIVE", "The synced .otk differs from the cloud project. Wait for Google Drive to finish syncing, then retry. You can open an older file separately through Project > Open project.");
    const localId = await importFileProject(restored);
    await metaPut(cloudBindingKey(cloud.configuration.url, userId, localId), { projectId: id, cloudVersion: project.version,
      syncedHash: capture.hash, archive: project.project_state.archive || null, pendingFiles: false, missingPlans: [] });
    window.location.assign(`${window.location.pathname}?localProject=${localId}`);
  }
  async function activateLocalSource(handle, browseProjects = false) {
    const browser = await localSourceFolderView(handle, browseProjects);
    await services.repository.assertUser();
    try { await metaPut(`drive-local-folder:${userId}`, browseProjects ? { handle, browseProjects: true } : handle); }
    catch { throw new CloudError("OTK_LOCAL_DRIVE", "The folder is available, but OpenTakeoff could not remember it locally. Check browser storage and try selecting it again."); }
    if (!alive.current) return;
    setLocalRoot(handle); setLocalBrowser(browser); setShowCloudLibrary(false); setCreateSource(null);
    setNotice(`Source folder: ${handle.name}. Ready.`);
  }
  async function locateDrive() {
    if (!window.showDirectoryPicker) throw new CloudError("OTK_LOCAL_DRIVE", localDriveUnavailable);
    const handle = await window.showDirectoryPicker({ id: "opentakeoff-drive", mode: "read" });
    await activateLocalSource(handle);
  }
  async function chooseSourceParent() {
    if (!window.showDirectoryPicker) throw new CloudError("OTK_LOCAL_DRIVE", localDriveUnavailable);
    setCreateSource(null);
    let parent;
    try { parent = await window.showDirectoryPicker({ id: "opentakeoff-drive", mode: "readwrite" }); }
    catch (error) {
      if (error.name === "AbortError") return;
      throw new CloudError("OTK_LOCAL_DRIVE", "The selected location could not be opened. Allow folder access and check Google Drive is available on this computer.");
    }
    const existing = await findLocalSourceFolder(parent);
    if (alive.current) setCreateSource({ parent, exists: !!existing });
  }
  async function finishCreateSource(useExisting = false) {
    const result = await createLocalSourceFolder(createSource.parent, useExisting);
    if (result.exists) { setCreateSource((current) => ({ ...current, exists: true })); return; }
    await activateLocalSource(result.handle, true);
  }
  async function openSelectedLocalFile(handle) {
    setBusy("Opening project from selected folder...");
    const restored = await readLocalProjectHandle(handle);
    await source.saveAnnotations(getPayload());
    const localId = await importFileProject(restored);
    window.location.assign(`${window.location.pathname}?localProject=${localId}`);
  }
  async function saveCopy(payload, localSource = source) {
    const id = crypto.randomUUID();
    const copyName = name.trim() || `${payload.project_name || "Untitled project"} copy`;
    const copiedMetadata = Object.fromEntries(Object.entries(payload.project_metadata || {}).filter(([k]) => !k.startsWith("author")));
    const a = { ...payload, project_id: id, project_name: copyName, project_metadata: withProjectEditor(withProjectAuthor(touchProjectMetadata({ ...copiedMetadata, name: copyName, createdAt: "" }), cloud.user, cloud.profileName), cloud.user, cloud.profileName) };
    const previous = localSource === source ? await services.sync.metadata() : null;
    const captured = await captureCloudProject(localSource, a, previous?.projectId === payload.project_id ? previous.missingPlans || [] : [], previous?.projectId === payload.project_id ? previous.archive || null : null);
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
    if (!project || project.file_provider !== "google_drive") throw new CloudError("OTK_LOCAL_DRIVE", "Save this project to Google Drive before downloading a local copy.");
    cloud.setStatus("Downloading");
    try { await downloadDriveFolder({ drive: services.drive, project, signal: transfer.current?.signal, onProgress: setBusy,
      pickFile: window.showSaveFilePicker?.bind(window),
      download: (name, blob) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); } });
    } finally { cloud.setStatus(await services.sync.status(getPayload()).catch(() => "Local Only")); }
  }
  const visible = projects.filter((p) => filter === "legacy" ? p.file_provider !== "google_drive" : p.file_provider === "google_drive" && (filter === "recent" || (filter === "mine" ? p.owner_id === userId : p.owner_id !== userId)));
  const projectActions = (p, canOpen = true) => <>
    {!p.deleted_at && <>{canOpen && <button disabled={!!busy || cloud.offline} onClick={() => run(() => open(p.id))}>Open project</button>}<button disabled={!!busy || cloud.offline} onClick={() => ask("copy-cloud", p)}>Duplicate</button></>}
    {!p.deleted_at && p.role !== "viewer" && <button disabled={!!busy || cloud.offline} onClick={() => ask("rename", p)}>Rename</button>}
    {SHARING_UI_ENABLED && !p.deleted_at && p.role === "owner" && <button disabled={!!busy || cloud.offline} onClick={() => run(async () => { setSharing(p); setMembers(await services.repository.listProjectMembers(p.id)); })}>Share</button>}
    {p.role === "owner" && <button disabled={!!busy || cloud.offline} onClick={() => ask("delete", p)}>{p.deleted_at ? "Finish deletion" : "Delete"}</button>}
  </>;
  const authentication = !cloud.user || authMode === "password";
  const storageOptions = <><option value="supabase">Supabase Storage</option><option value="google_drive" disabled={!drive?.connected}>Google Drive{!drive?.connected ? " (connect in Profile)" : ""}</option></>;
  return createPortal(<div className="cloud-shade" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
    <section ref={root} className="cloud-dialog" role="dialog" aria-modal="true" aria-label={view === "account" ? "Profile" : "Cloud projects"} tabIndex={-1}>
      <header><h2>{view === "account" ? "Profile" : "Cloud projects"}</h2>{cloud.user && view !== "account" && <div className="cloud-header-account"><AccountAvatar profile={cloud.identity} size={28} /><span title={cloud.user.email}>{cloud.user.email}</span></div>}<span className="cloud-status">{cloud.displayStatus}</span>
        <button type="button" title={view === "account" ? "Close profile" : "Close cloud projects"} aria-label={view === "account" ? "Close profile" : "Close cloud projects"} disabled={!!busy} onClick={onClose}><Icon name="close" size={18} /></button></header>
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
            {view === "account" && <>
              <div className="cloud-profile-summary"><div className="cloud-profile-identity"><AccountAvatar profile={cloud.identity} size={40} /><strong>{cloud.identity.name}</strong><div>{cloud.identity.email}</div></div><button disabled={!!busy} onClick={() => run(async () => { await auth.signOut(); cloud.setStatus("Local Only"); })}>Log out</button></div>
              <form className="cloud-auth cloud-profile-form" onSubmit={(e) => { e.preventDefault(); run(async () => { await auth.saveProfile(cloud.user.id, displayName); profileDraft.current.edited = false; await cloud.refreshProfile(); setDisplayName(displayName.trim()); setNotice("Profile saved."); }); }}><label>Display name<input value={displayName} maxLength={120} onChange={(e) => { profileDraft.current.edited = true; setDisplayName(e.target.value); }} /></label><button className="btn-primary" disabled={!!busy || cloud.offline}>Save profile</button></form>

            </>}
            {view === "save" && <div className="cloud-save"><h3>{getPayload().project_name || "Untitled project"}</h3>
              <p>Cloud status: {currentCloud?.file_provider === "supabase" ? "Existing project uses Supabase Storage" : drive?.connected ? "Google Drive connected" : "Connect Google Drive in Profile"}</p>
              <div className="cloud-actions"><button className="btn-primary" disabled={!!busy || cloud.offline || !!source.listFolder || (!currentCloud && !drive?.connected)} onClick={() => run(() => save())}><Icon name="document" size={16} />Save to Cloud</button><button disabled={!!busy || cloud.offline || currentCloud?.file_provider !== "google_drive"} onClick={() => run(() => download(currentCloud))}>Download Locally</button><button className="btn-ghost" disabled={!!busy || cloud.offline || !!source.listFolder} onClick={() => ask("copy-local")}>Save As...</button></div>
              {currentCloud?.file_provider !== "google_drive" && <p>Save this project to Google Drive before downloading a local copy.</p>}
              {source.listFolder && <p>Export this Drive project and open its local .otk copy before saving to Supabase.</p>}
            </div>}
            {view === "projects" && <>
              {restoringSource && <p role="status" aria-live="polite">Loading saved source folder…</p>}
              {!restoringSource && !localBrowser && !showCloudLibrary && <section><h3>Select a source folder</h3><p>You are signed in. Select or create your Google Drive folder on this computer to display its files.</p></section>}
              <div className="cloud-actions">{showCloudLibrary && !localBrowser && <><select aria-label="Project filter" value={filter} disabled={(!!busy || restoringSource)} onChange={(e) => setFilter(e.target.value)}><option value="mine">My Projects</option>{SHARING_UI_ENABLED && <option value="shared">Shared With Me</option>}<option value="recent">Recent</option><option value="legacy">Legacy storage</option></select><button disabled={(!!busy || restoringSource) || cloud.offline} onClick={() => run(refresh)}>Refresh projects</button></>}<button disabled={(!!busy || restoringSource) || !window.showDirectoryPicker} onClick={() => run(locateDrive)}><img src={googleDriveLogo} alt="" aria-hidden="true" width={18} height={18} style={{ objectFit: "contain", flexShrink: 0 }} />Locate Google Drive Folder</button></div>
              {!restoringSource && !localBrowser && !showCloudLibrary && <p>Locate an existing source folder, or create a new source folder in Google Drive for desktop.</p>}
              {createSource && <section className="cloud-confirm" aria-label="Create source folder">
                <h3>{createSource.exists ? "An OpenTakeoff source folder already exists here." : "Create New Source Folder"}</h3>
                <p>Selected location: {createSource.parent.name}</p>
                <p>{createSource.exists ? "Use" : "Create"}: {createSource.parent.name} / {SOURCE_FOLDER_NAME} / Projects</p>
                <p>Choose a location inside your Google Drive for desktop folder. The source folder name is fixed to match OpenTakeoff’s managed structure.</p>
                <div className="cloud-actions">
                  <button className="btn-primary" disabled={(!!busy || restoringSource)} onClick={() => run(() => finishCreateSource(createSource.exists))}>{createSource.exists ? "Use Existing Folder" : "Create Folder"}</button>
                  <button disabled={(!!busy || restoringSource)} onClick={() => run(chooseSourceParent)}>Choose Another Location</button>
                  <button disabled={(!!busy || restoringSource)} onClick={() => { setCreateSource(null); setError(""); }}>Cancel</button>
                </div>
              </section>}
              {!window.showDirectoryPicker && <p>This browser cannot locate synced folders. Use Project → Open project to choose the synced .otk file; Open will not download a cloud copy.</p>}
              {SHARING_UI_ENABLED && services && <ProjectInvitations key={userId} cloud={cloud} drive={services.drive} assertUser={services.repository.assertUser} shareEntry={shareEntry} onShareClose={() => setShareEntry(null)} busy={!!busy} run={run} onOpen={openSelectedLocalFile} />}
              {localBrowser ? <LocalFolderBrowser key={localBrowser.key} initial={localBrowser} busy={(!!busy || restoringSource)} run={run} onOpen={openSelectedLocalFile} onShare={SHARING_UI_ENABLED ? setShareEntry : undefined} /> : showCloudLibrary ? <CloudFileBrowser key={`${userId}:${filter}`} projects={visible} drive={services.drive} busy={(!!busy || restoringSource)} offline={cloud.offline} run={run} actions={projectActions} /> : null}
            </>}
            {SHARING_UI_ENABLED && sharing && <section className="cloud-share"><h3>Share {sharing.name}</h3><form onSubmit={(e) => { e.preventDefault(); run(async () => { await services.repository.shareProject(sharing.id, shareEmail, role); setMembers(await services.repository.listProjectMembers(sharing.id)); setShareEmail(""); }); }}>
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
