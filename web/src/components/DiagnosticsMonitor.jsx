import React, { useEffect, useRef, useState } from "react";
import { diagnosticsClear, diagnosticsEvent, diagnosticsState, diagnosticsSubscribe } from "../lib/renderDiagnostics.js";

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const mib = (n) => `${(n / 1048576).toFixed(1)} MiB`;
const canvasInfo = () => [...document.querySelectorAll("canvas")].map((c, i) => {
  const r = c.getBoundingClientRect(), bytes = c.width * c.height * 4;
  return { id: c.id || c.dataset.diagnosticsId || `#${i + 1}`, width: c.width, height: c.height, css: `${Math.round(r.width)}×${Math.round(r.height)}`, backing: `${c.width}×${c.height}`, bytes };
});
export default function DiagnosticsMonitor({ open, onClose, zoom, initialPreviewResolution = 0.5, onPreviewResolutionChange, previewStatus }) {
  const [paused, setPaused] = useState(false), [data, setData] = useState(() => ({ frames: {}, canvases: [], heap: null, preview: null, now: diagnosticsState() }));
  const [previewResolution, setPreviewResolution] = useState(() => Math.round(initialPreviewResolution * 100));
  const pausedRef = useRef(false), drag = useRef(null), [pos, setPos] = useState({ right: 12, top: 12 });
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => {
    if (!open) return undefined;
    let raf = 0, last = performance.now(), frames = [], prior = new Map();
    const sample = () => { const now = performance.now(), delta = now - last; last = now; frames.push(delta); frames = frames.filter((x, i) => i > frames.length - 120); if (delta > 50) diagnosticsEvent("LONG FRAME", `${Math.round(delta)}ms`, true); raf = requestAnimationFrame(sample); };
    raf = requestAnimationFrame(sample);
    const update = () => { if (pausedRef.current) return; const cs = canvasInfo(); cs.forEach((c) => { const old = prior.get(c.id); if (old && old.backing !== c.backing) diagnosticsEvent("CANVAS RESIZE", `${c.id}: ${old.backing} → ${c.backing} · ${mb(old.bytes)} → ${mb(c.bytes)} · zoom ${(zoom * 100).toFixed(0)}%`); prior.set(c.id, c); }); const pm = performance.memory; const avg = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0; setData({ frames: { current: frames.at(-1) || 0, avg, fps: avg ? 1000 / avg : 0 }, canvases: cs, heap: pm ? { used: pm.usedJSHeapSize, total: pm.totalJSHeapSize, limit: pm.jsHeapSizeLimit } : null, preview: previewStatus?.() || null, now: diagnosticsState() }); };
    update(); const interval = setInterval(update, 500); const mo = new MutationObserver((records) => {
      // Ignore the monitor's own React DOM updates. Only canvas insertion/removal
      // or canvas attribute mutations need an immediate scan; the 500ms sample
      // catches every other layout change without polling per frame.
      const changed = records.some((r) => r.type === "attributes" ? r.target instanceof HTMLCanvasElement : [...r.addedNodes, ...r.removedNodes].some((n) => n instanceof HTMLCanvasElement || (n instanceof Element && n.querySelector?.("canvas"))));
      if (changed) update();
    }); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "style"] }); const off = diagnosticsSubscribe(update);
    return () => { cancelAnimationFrame(raf); clearInterval(interval); mo.disconnect(); off(); };
  }, [open, previewStatus, zoom]);
  if (!open) return null;
  const { frames, canvases, heap, preview, now } = data, total = canvases.reduce((n, c) => n + c.bytes, 0);
  const base = canvases.find((c) => String(c.id).startsWith("base-"));
  const previewWidth = base ? Math.max(1, Math.round(base.width * previewResolution / 100)) : preview?.width || 0;
  const previewHeight = base ? Math.max(1, Math.round(base.height * previewResolution / 100)) : preview?.height || 0;
  const previewBytes = previewWidth * previewHeight * 4;
  const setResolution = (pct) => { setPreviewResolution(pct); onPreviewResolutionChange?.(pct / 100); };
  const copy = async () => { const lines = ["RENDERING DIAGNOSTICS", "=====================", "", `Timestamp: ${new Date().toString()}`, `Browser: ${navigator.userAgent}`, `Viewport: ${innerWidth}×${innerHeight}`, `DPR: ${devicePixelRatio}`, "", `Zoom: ${(zoom * 100).toFixed(1)}%`, `FPS: ${frames.fps?.toFixed(1) || "—"}`, `Frame time: ${frames.current?.toFixed(1) || "—"}ms`, "", `Preview Resolution: ${previewResolution}%`, `Preview Size: ${previewWidth ? `${previewWidth}×${previewHeight}` : "waiting for base canvas"}`, `Estimated RGBA Memory: ${previewWidth ? mib(previewBytes) : "unavailable"} (not GPU memory)`, `Preview Generation: ${preview?.generationMs ? `${Math.round(preview.generationMs)}ms` : "—"}`, "", `JS Heap: ${heap ? mb(heap.used) : "unavailable in this browser"}`, `JS Heap Limit: ${heap ? mb(heap.limit) : "unavailable"}`, "", `Canvas Count: ${canvases.length}`, `Canvas Memory Estimate: ${mb(total)} (RGBA backing-store estimate; not GPU memory)`, ...canvases.flatMap((c) => ["", `Canvas ${c.id}:`, `CSS: ${c.css}`, `Backing: ${c.backing}`, `Memory: ${mb(c.bytes)}`]), "", `Active Renders: ${now.renders.active}`, `Pending Renders: ${now.renders.pending}`, `Completed Renders: ${now.renders.completed}`, `Cancelled Renders: ${now.renders.cancelled}`, "", "Recent Events:", ...now.events.map((e) => `${e.time} ${e.type}: ${e.text}`), "", "Warnings:", ...(now.warnings.map((w) => `${w.time} ${w.text}`) || ["None"])]; try { await navigator.clipboard.writeText(lines.join("\n")); diagnosticsEvent("INFO", "Diagnostic snapshot copied"); } catch { diagnosticsEvent("ERROR", "Clipboard unavailable", true); } };
  return <div onPointerDown={(e) => { if (e.target.dataset.drag) drag.current = { x: e.clientX, y: e.clientY, pos }; }} onPointerMove={(e) => { if (!drag.current) return; const d = drag.current; setPos({ left: Math.max(0, d.pos.left ?? innerWidth - d.pos.right - 360 + e.clientX - d.x), top: Math.max(0, d.pos.top + e.clientY - d.y) }); }} onPointerUp={() => { drag.current = null; }} style={{ position: "fixed", ...pos, zIndex: 100, width: "min(360px, calc(100vw - 16px))", maxHeight: "min(76vh, 620px)", overflow: "auto", background: "var(--paper-bright)", color: "var(--ink)", border: "1px solid var(--ink)", boxShadow: "0 8px 28px rgba(0,0,0,.25)", font: "11px var(--f-mono, monospace)", touchAction: "none" }}>
    <div data-drag="true" style={{ cursor: "move", padding: "8px", background: "var(--ink)", color: "var(--paper-bright)", display: "flex", justifyContent: "space-between" }}><b>DIAGNOSTICS · {paused ? "PAUSED" : "LIVE ●"}</b><button onClick={onClose}>×</button></div>
    <div style={{ padding: 8, display: "grid", gap: 8 }}>
      <div><b>APPLICATION</b><br />Zoom {(zoom * 100).toFixed(1)}% · viewport {innerWidth}×{innerHeight} · DPR {devicePixelRatio}<br /><span title={navigator.userAgent}>Browser: {navigator.userAgent.slice(0, 66)}…</span></div>
      <div><b>PERFORMANCE</b><br />FPS {frames.fps?.toFixed(1) || "—"} · avg frame {frames.avg?.toFixed(1) || "—"}ms · current {frames.current?.toFixed(1) || "—"}ms</div>
      <div><b>MEMORY</b><br />{heap ? <>JS heap {mb(heap.used)} / {mb(heap.total)} · limit {mb(heap.limit)}</> : "JS heap metrics unavailable in this browser"}<br />GPU memory: not directly exposed</div>
      <div><b>PREVIEW RESOLUTION</b><br />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <input type="range" min="10" max="100" step="5" value={previewResolution} onChange={(e) => setResolution(Number(e.target.value))} aria-label="Preview Resolution" style={{ flex: 1, minWidth: 0 }} />
          <span>{previewResolution}%</span>
          <button type="button" onClick={() => setResolution(50)} title="Reset preview resolution to 50%">Reset</button>
        </label>
        <small>{previewWidth ? <>{previewWidth}×{previewHeight} · Estimated RGBA Memory: {mib(previewBytes)}<br />Preview generation: {preview?.generationMs ? `${Math.round(preview.generationMs)}ms` : "pending"}</> : "Waiting for a rendered base canvas"}<br />RGBA estimate, not GPU memory.</small>
      </div>
      <div><b>CANVAS</b><br />{canvases.map((c) => <div key={c.id}>{c.id}: CSS {c.css}, backing {c.backing}, est. {mb(c.bytes)}</div>)}<b>Total canvas backing-store estimate: {mb(total)}</b><br /><small>RGBA estimate, not actual GPU memory.</small></div>
      <div><b>RENDERING</b><br />active {now.renders.active} · pending {now.renders.pending} · complete {now.renders.completed} · cancelled {now.renders.cancelled} · errors {now.renders.errors}<br />last {Math.round(now.renders.lastMs)}ms · longest {Math.round(now.renders.longestMs)}ms</div>
      <div><b>ZOOM</b><br />{(now.zoom.events?.length || 0)} events/s · {(now.zoom.previous * 100).toFixed(0)}% → {(now.zoom.current * 100).toFixed(0)}% ({now.zoom.direction}) · renders after zoom {now.zoom.rendersAfter}</div>
      <div><b>TIMELINE / EVENTS</b>{now.events.slice(0, 14).map((e, i) => <div key={i}>{e.time} {e.type} — {e.text}</div>)}</div>
      {now.warnings.length > 0 && <div><b>WARNINGS</b>{now.warnings.map((w, i) => <div key={i}>{w.time} {w.text}</div>)}</div>}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}><button onClick={() => setPaused((v) => !v)}>{paused ? "Resume" : "Pause"}</button><button onClick={diagnosticsClear}>Clear Events</button><button onClick={copy}>Copy Diagnostics</button><button onClick={onClose}>Close</button></div>
    </div>
  </div>;
}
