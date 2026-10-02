import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../brand/icons.jsx";
import ManualContent from "./ManualContent.jsx";

const KEY = "opentakeoff.welcome.recents.v1";
function readRecent() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]").filter((r) => typeof r.name === "string" && typeof r.search === "string" && (!r.search || /^\?(localProject|project)=[\w%-]+$/.test(r.search))).slice(0, 12); }
  catch { return []; }
}
export default function WorkspaceHelp({ name, hasWorkspace, ready, onMenuDepth }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    if (!ready || !hasWorkspace) return;
    const params = new URLSearchParams(window.location.search);
    const key = params.has("localProject") ? "localProject" : params.has("project") ? "project" : null;
    const search = key ? `?${key}=${encodeURIComponent(params.get(key))}` : "";
    const next = [{ name: name || "Local workspace", search }, ...readRecent().filter((r) => r.search !== search)].slice(0, 12);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Storage may be full or unavailable. */ }
  }, [name, hasWorkspace, ready]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    onMenuDepth(true);
    dialog.current.showModal();
    return () => { onMenuDepth(false); previous?.focus(); };
  }, [open, onMenuDepth]);
  return <>
    <button type="button" onClick={() => setOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px", background: "transparent", color: "var(--ink)", border: "1px solid var(--ink-faint)", cursor: "pointer", whiteSpace: "nowrap" }}><Icon name="document" size={15} />User Guide</button>
    {open && createPortal(<dialog ref={dialog} aria-labelledby="user-guide-title" onCancel={() => setOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      onKeyDown={(e) => e.stopPropagation()} style={{ width: "min(960px, 92vw)", height: "min(850px, 86vh)", padding: 0, border: "1px solid var(--ink-faint)", borderRadius: 10, background: "var(--paper-bright)", color: "var(--ink)", overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--ink-faint)" }}><h2 id="user-guide-title" style={{ margin: 0 }}>User Guide</h2><button autoFocus onClick={() => setOpen(false)} aria-label="Close user guide">×</button></header>
        <ManualContent />
      </div>
    </dialog>, document.body)}
  </>;
}

export function RecentProjectsMenu() {
  const [recent] = useState(readRecent);
  return <details style={{ color: "var(--ink)", fontSize: 12.5 }}>
    <summary style={{ padding: "8px 14px", cursor: "pointer" }}>Open Recent</summary>
    <div style={{ maxHeight: "40vh", overflowY: "auto", padding: "4px 8px 8px 24px", background: "var(--paper-shadow)" }}>
      {recent.length ? recent.map((r) => <a key={r.search} href={`${window.location.pathname}${r.search}`} style={{ display: "block", padding: "9px 6px", color: "var(--ink)", textDecoration: "none", overflowWrap: "anywhere" }}>{r.name}<small style={{ display: "block", color: "var(--ink-muted)" }}>{r.search.startsWith("?project=") ? "Google Drive" : "This browser"}</small></a>) : <p>No recent workspaces yet.</p>}
    </div>
  </details>;
}
