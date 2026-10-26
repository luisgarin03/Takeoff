import React, { useEffect, useRef, useState } from "react";
import "../styles/printDialog.css";

function PrintPreview({ url }) {
  const canvas = useRef(null);
  const [page, setPage] = useState(1), [count, setCount] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    let active = true, task, render;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (!active) return;
      task = pdfjs.getDocument(url);
      const doc = await task.promise;
      if (!active) return;
      setCount(doc.numPages);
      const source = await doc.getPage(page);
      if (!active) return;
      const native = source.getViewport({ scale: 1 });
      const viewport = source.getViewport({ scale: Math.min(1200 / native.width, 1000 / native.height) });
      const target = canvas.current;
      target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
      render = source.render({ canvasContext: target.getContext("2d"), viewport, background: "white" });
      await render.promise;
    })().catch((e) => { if (active) setError(e.message); });
    return () => { active = false; render?.cancel(); void task?.destroy(); };
  }, [url, page]);
  return <div className="print-preview">
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Preview · {page} / {count || "…"}</span><button disabled={page >= count} onClick={() => setPage(page + 1)}>Next</button></div>
    {error && <p role="alert">Preview unavailable: {error}. Open the prepared PDF below.</p>}
    <div className="print-preview-paper"><canvas ref={canvas} aria-label={`Print preview page ${page}`} style={{ maxWidth: "100%", height: "auto", background: "white" }} /></div>
  </div>;
}

export default function PrintDialog({ loadPages, buildPdf, currentKey, onClose }) {
  const [pages, setPages] = useState([]);
  const [selected, setSelected] = useState(new Set([currentKey]));
  const [settings, setSettings] = useState({ quality: "balanced", paper: "letter", layout: "auto", margin: "18", markups: true, takeoffs: true, grayscale: false });
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState("Loading pages…");
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const root = useRef(null), frame = useRef(null), cancelled = useRef(false);
  const initialLoad = useRef(loadPages);
  useEffect(() => {
    let active = true;
    cancelled.current = false;
    initialLoad.current().then((value) => { if (active) setPages(value); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) { setBusy(false); setProgress(""); } });
    return () => { active = false; cancelled.current = true; };
  }, []);
  useEffect(() => { return () => { if (url) URL.revokeObjectURL(url); }; }, [url]);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.focus();
    const key = (e) => {
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab") {
        const nodes = [...root.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], iframe')];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [onClose]);
  const change = (key, value) => { setSettings((old) => ({ ...old, [key]: value })); setUrl(""); };
  const choose = (value) => { setSelected(value); setUrl(""); };
  async function prepare() {
    setBusy(true); setError(""); setUrl("");
    try {
      const bytes = await buildPdf(pages.filter((p) => selected.has(p.key)), settings, (message) => { if (!cancelled.current) setProgress(message); }, () => cancelled.current);
      if (!cancelled.current) setUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch (e) { if (!cancelled.current) setError(e.message || "Could not prepare print preview."); }
    finally { if (!cancelled.current) { setBusy(false); setProgress(""); } }
  }
  return <div className="pdf-export-scrim" style={{ zIndex: 3100 }}>
    <section ref={root} tabIndex={-1} className="print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-title">
      <aside className="print-sidebar">
      <header><div><h2 id="print-title">Print</h2><p>Total: {pages.filter((p) => selected.has(p.key)).length} sheets of paper</p></div><button type="button" aria-label="Close print panel" onClick={onClose}>×</button></header>
      <div className="print-settings">
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Pages to print · {pages.filter((p) => selected.has(p.key)).length} selected</legend>
          <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
            <button onClick={() => choose(new Set([currentKey]))}>Current page</button><button onClick={() => choose(new Set(pages.map((p) => p.key)))}>All pages</button><button onClick={() => choose(new Set())}>Clear</button>
          </div>
          <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--ink-faint)", padding: 8 }}>
            {pages.map((page, index) => <label key={page.key} style={{ display: "flex", gap: 8, padding: 5 }}><input type="checkbox" checked={selected.has(page.key)} onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(page.key); else next.delete(page.key); choose(next); }} />{index + 1}. {page.label} <small style={{ color: "var(--ink-muted)" }}>{page.file}</small></label>)}
          </div>
          <div className="print-options">
            <label>Quality <select value={settings.quality} onChange={(e) => change("quality", e.target.value)}><option value="compact">Compact</option><option value="balanced">Balanced</option><option value="hd">HD · highest detail</option></select></label>
            <label>Paper <select value={settings.paper} onChange={(e) => change("paper", e.target.value)}><option value="letter">Letter</option><option value="legal">Legal</option><option value="tabloid">Tabloid</option><option value="a4">A4</option><option value="a3">A3</option><option value="archd">ARCH D</option><option value="original">Original sheet size</option></select></label>
            <label>Layout <select value={settings.layout} onChange={(e) => change("layout", e.target.value)}><option value="auto">Auto per page</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
            <label>Margins <select value={settings.margin} onChange={(e) => change("margin", e.target.value)}><option value="0">None</option><option value="18">¼ inch</option><option value="36">½ inch</option></select></label>
          </div>
          <div className="print-toggles">{[["markups", "Include markups and notes"], ["takeoffs", "Include takeoff measurements"], ["grayscale", "Grayscale"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(e) => change(key, e.target.checked)} /> {label}</label>)}</div>
        </fieldset>
        <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Plans fit within the printable area; this can change drawing scale. Choose your printer, copies, duplex, and matching paper size in the system print dialog. Browser or PDF viewer scaling should be 100% for this prepared layout.</p>
        {progress && <p role="status">{progress}</p>}{error && <p role="alert" style={{ color: "var(--c-danger)" }}>{error}</p>}
        {url && <><iframe ref={frame} title="Prepared print document" src={url} style={{ position: "absolute", left: -10000, width: 1, height: 1, border: 0 }} /><p><a href={url} target="_blank" rel="noreferrer">Open prepared PDF in a new tab</a></p></>}
      </div>
      <footer><button className="btn-primary" disabled={busy || !pages.some((p) => selected.has(p.key))} onClick={() => { if (!url) { void prepare(); return; } try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { setError("Open the prepared PDF in a new tab and use its Print button."); } }}>{busy ? "Preparing…" : url ? "Print…" : "Prepare preview"}</button><button onClick={onClose}>Cancel</button></footer>
      </aside>
      <main className="print-preview-stage">{url ? <PrintPreview key={url} url={url} /> : <div className="print-preview-empty"><div className="print-empty-sheet"><span>Print preview</span><p>{busy ? progress : "Choose your pages and settings, then prepare a preview."}</p></div></div>}</main>
    </section>
  </div>;
}
