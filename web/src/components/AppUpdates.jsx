import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { APP_VERSION, desktopUpdateApi, formatUpdateBytes, normalizeDesktopUpdateState } from "../lib/appUpdates.js";
import AppToast from "./AppToast.jsx";

function useDesktopUpdates() {
  const api = useMemo(() => desktopUpdateApi(globalThis), []);
  const [state, setState] = useState(() => normalizeDesktopUpdateState(null));
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    if (!api) return undefined;
    let live = true;
    api.getState().then((next) => { if (live) setState(normalizeDesktopUpdateState(next)); })
      .catch(() => { if (live) setActionError("Update status could not be loaded."); });
    const unsubscribe = api.onState((next) => { if (live) { setState(normalizeDesktopUpdateState(next)); setActionError(""); } });
    return () => { live = false; unsubscribe?.(); };
  }, [api]);
  const invoke = useCallback(async (name) => {
    if (!api || typeof api[name] !== "function") return;
    setActionError("");
    try { setState(normalizeDesktopUpdateState(await api[name]())); }
    catch (error) { setActionError(error?.message || "The update action could not be completed."); }
  }, [api]);
  return { api, state, actionError, invoke };
}

function progressText(state) {
  const amount = state.total > 0 ? `${formatUpdateBytes(state.transferred)} of ${formatUpdateBytes(state.total)}` : `${Math.round(state.percent)}%`;
  const speed = state.bytesPerSecond > 0 ? ` · ${formatUpdateBytes(state.bytesPerSecond)}/s` : "";
  return `${amount}${speed}`;
}

export function AppUpdateNotice() {
  const { state, actionError, invoke } = useDesktopUpdates();
  if (!state.supported || !["available", "downloading", "ready", "installing"].includes(state.phase)) return null;
  const version = state.availableVersion ? ` ${state.availableVersion}` : "";
  const title = state.phase === "ready" ? "Update ready" : state.phase === "downloading" ? "Downloading update" : state.phase === "installing" ? "Installing update" : `Update${version} available`;
  return <AppToast className="app-update-notice" title={title} loading={["downloading", "installing"].includes(state.phase)} danger={!!actionError}>
    {state.phase === "downloading" && <><progress value={state.percent} max="100" /><span>{progressText(state)}</span></>}
    {state.phase === "available" && <button type="button" onClick={() => invoke("download")}>Download update</button>}
    {state.phase === "ready" && <button type="button" className="btn-primary" onClick={() => {
      if (window.confirm("Save your current project before restarting. Restart now and install the update?")) invoke("install");
    }}>Restart and install</button>}
    {actionError && <span>{actionError}</span>}
  </AppToast>;
}

export function UpdateSection() {
  const { api, state, actionError, invoke } = useDesktopUpdates();
  const platform = Capacitor.getPlatform();
  const iosStoreUrl = String(import.meta.env.VITE_IOS_APP_STORE_URL || "").trim();
  const desktop = !!api && state.supported;
  let status = `Version ${state.currentVersion || APP_VERSION}`;
  if (state.phase === "checking") status = "Checking for updates…";
  else if (state.phase === "current") status = `Version ${state.currentVersion} is current.`;
  else if (state.phase === "available") status = `Version ${state.availableVersion || "new"} is available.`;
  else if (state.phase === "downloading") status = `Downloading ${progressText(state)}`;
  else if (state.phase === "ready") status = `Version ${state.availableVersion || "new"} is ready to install.`;
  else if (state.phase === "installing") status = "Restarting to install…";
  else if (state.phase === "error") status = state.error || "Updates are temporarily unavailable.";
  return <section className="profile-card app-update-card" aria-labelledby="app-update-heading">
    <div className="profile-card-heading"><h3 id="app-update-heading">App updates</h3><span className="subscription-badge">{state.currentVersion || APP_VERSION}</span></div>
    <p>{status}</p>
    {desktop ? <div className="cloud-actions">
      <button type="button" disabled={["checking", "downloading", "ready", "installing"].includes(state.phase)} onClick={() => invoke("check")}>Check for updates</button>
      {state.phase === "available" && <button type="button" className="btn-primary" onClick={() => invoke("download")}>Download update</button>}
      {state.phase === "ready" && <button type="button" className="btn-primary" onClick={() => {
        if (window.confirm("Save your current project before restarting. Restart now and install the update?")) invoke("install");
      }}>Restart and install</button>}
    </div> : platform === "ios" ? <>
      <p className="profile-muted">iPhone and iPad updates are delivered through the App Store after you publish and Apple approves them.</p>
      {/^https:\/\/apps\.apple\.com\//i.test(iosStoreUrl) && <button type="button" onClick={async () => {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: iosStoreUrl });
      }}>Open App Store</button>}
    </> : <p className="profile-muted">Signed Windows installations check your release channel automatically. The hosted browser app receives updates when it is reopened after deployment.</p>}
    {state.phase === "downloading" && <progress value={state.percent} max="100" />}
    {(actionError || state.error) && <p className="cloud-error" role="alert">{actionError || state.error}</p>}
    {state.releaseNotes && ["available", "ready"].includes(state.phase) && <details><summary>What’s new</summary><p>{state.releaseNotes}</p></details>}
  </section>;
}
