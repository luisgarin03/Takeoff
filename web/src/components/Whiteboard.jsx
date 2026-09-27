import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Icon } from "../brand/icons.jsx";
import { downloadBytes } from "../lib/markedset.js";
import { buildWhiteboardPdf } from "../lib/whiteboardPdf.js";
import { whiteboardPdfRenderer } from "../lib/whiteboardPdfBrowser.js";
import { base64ToBytes, bytesToBase64, fitBoard, NOTE_COLORS, removeBoardItem, WHITEBOARD_FILE_LIMIT, WHITEBOARD_TOTAL_LIMIT, whiteboardFileType, zoomBoard } from "../lib/whiteboard.js";
import "../styles/whiteboard.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function Button({ icon, label, children, ...props }) {
  return <button type="button" title={label} aria-label={label} {...props}><Icon name={icon} size={17} />{children}</button>;
}

const FilePreview = memo(function FilePreview({ asset, page, onPages }) {
  const host = useRef(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let stopped = false, loading, task, url;
    const element = host.current;
    setError(""); setPending(true);
    async function render() {
      try {
        if (asset.missing) throw new Error("File unavailable on this device");
        const bytes = base64ToBytes(asset.data);
        if (asset.type !== "application/pdf") {
          url = URL.createObjectURL(new Blob([bytes], { type: asset.type }));
          const img = new Image();
          img.src = url; img.alt = asset.name; img.draggable = false;
          await img.decode();
          if (!stopped) { element.replaceChildren(img); setPending(false); }
          return;
        }
        loading = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
        const doc = await loading.promise;
        if (stopped) return;
        onPages(doc.numPages);
        const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
        if (stopped) return;
        const native = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: Math.min(2, 1400 / Math.max(native.width, native.height)) });
        // Render offscreen and publish only while this page owns the preview.
        // A cancelled/older page must never replace the current page's pixels.
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("aria-label", `${asset.name}, page ${page}`);
        task = pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport });
        await task.promise;
        if (!stopped) { element.replaceChildren(canvas); setPending(false); }
      } catch (e) {
        if (!stopped && e.name !== "RenderingCancelledException") { setError(asset.missing ? "Local Only - original file unavailable on this device." : "Preview unavailable. Download the original file to view it."); setPending(false); }
      }
    }
    render();
    return () => { stopped = true; task?.cancel(); loading?.destroy().catch(() => {}); if (url) URL.revokeObjectURL(url); };
  }, [asset, page, onPages]);
  return <div className="wb-preview">{error && <span role="alert">{error}</span>}{pending && <small className="wb-preview-loading" role="status">Loading preview...</small>}<div ref={host} /></div>;
});

const FileCard = memo(function FileCard({ asset, item, onPage, visible }) {
  const [pages, setPages] = useState(0);
  return <>
    {visible ? <FilePreview asset={asset} page={item.page} onPages={setPages} /> : <div className="wb-preview" />}
    <footer className="wb-file-footer" onPointerDown={(e) => e.stopPropagation()}>
      {asset.type === "application/pdf" && <>
        <Button icon="chevronLeft" label={`Previous page of ${asset.name}`} disabled={item.page <= 1} onClick={() => onPage(item.id, item.page - 1)} />
        <label><input aria-label={`Page of ${asset.name}`} type="number" min="1" max={pages || 1} value={item.page}
          onChange={(e) => { const page = Number(e.target.value); if (page >= 1 && page <= pages) onPage(item.id, page); }} /> / {pages || "..."}</label>
        <Button icon="chevronRight" label={`Next page of ${asset.name}`} disabled={!pages || item.page >= pages} onClick={() => onPage(item.id, item.page + 1)} />
      </>}
      <Button icon="document" label={`Download ${asset.name}`} className="wb-download" disabled={asset.missing} onClick={() => downloadBytes(asset.name, base64ToBytes(asset.data), asset.type)} />
    </footer>
  </>;
});

export default function Whiteboard({ board, onChange, onClose, onSave, onBusyChange, projectName, saveState }) {
  const root = useRef(null), viewport = useRef(null), input = useRef(null);
  const boardRef = useRef(board), callbacks = useRef({ onChange, onClose, onBusyChange, onSave });
  boardRef.current = board; callbacks.current = { onChange, onClose, onBusyChange, onSave };
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const [selected, setSelected] = useState(null), [mode, setMode] = useState("select");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const importLock = useRef(false), alive = useRef(true);
  const exportTask = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const gesture = useRef(null), pointers = useRef(new Map());
  const history = useRef({ past: [], future: [] });
  const [, historyTick] = useState(0);
  const editGroup = useRef(null);

  const commit = useCallback((next, group = null) => {
    if (next === boardRef.current) return;
    if (!group || editGroup.current !== group) {
      history.current.past = [...history.current.past.slice(-19), boardRef.current];
    }
    history.current.future = []; editGroup.current = group;
    boardRef.current = next; callbacks.current.onChange(next); historyTick((n) => n + 1);
  }, []);
  const patch = useCallback((id, changes, group = null) => {
    commit({ ...boardRef.current, items: boardRef.current.items.map((item) => item.id === id ? { ...item, ...changes } : item) }, group);
  }, [commit]);
  const pageChange = useCallback((id, page) => patch(id, { page }), [patch]);
  const undo = useCallback((redo = false) => {
    const h = history.current, from = redo ? h.future : h.past, to = redo ? h.past : h.future;
    if (!from.length) return;
    to.push(boardRef.current);
    const next = from.pop(); boardRef.current = next;
    callbacks.current.onChange(next); editGroup.current = null; setSelected(null); historyTick((n) => n + 1);
  }, []);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    root.current.focus();
    // The whiteboard is a separate workspace. Block takeoff shortcuts even when
    // the Plan Set underneath has its own window capture listener.
    const key = (e) => {
      if (!root.current?.contains(e.target)) return;
      e.stopImmediatePropagation();
      const editing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (e.key === "Escape" && !importLock.current) { e.preventDefault(); callbacks.current.onClose(); }
      if (e.key === "Tab") {
        const nodes = [...root.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea')].filter((node) => node.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if (!editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (!importLock.current) undo(e.shiftKey); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!importLock.current) callbacks.current.onSave(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { alive.current = false; exportTask.current?.abort(); window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [undo]);

  const point = (e) => { const r = viewport.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const center = () => ({ x: viewport.current.clientWidth / 2, y: viewport.current.clientHeight / 2 });
  const setCamera = (next) => { viewRef.current = next; setView(next); };
  const zoom = (factor) => setCamera(zoomBoard(viewRef.current, center(), viewRef.current.scale * factor));
  const fit = () => setCamera(fitBoard(boardRef.current.items, viewport.current.clientWidth, viewport.current.clientHeight));

  useEffect(() => {
    const element = viewport.current;
    const wheel = (e) => {
      if (e.target.closest("textarea,input")) return;
      e.preventDefault();
      const r = element.getBoundingClientRect();
      const next = zoomBoard(viewRef.current, { x: e.clientX - r.left, y: e.clientY - r.top }, viewRef.current.scale * Math.exp(-e.deltaY * .0015));
      viewRef.current = next; setView(next);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(() => setViewportSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    const next = fitBoard(boardRef.current.items, element.clientWidth, element.clientHeight);
    viewRef.current = next; setView(next);
    return () => { element.removeEventListener("wheel", wheel); observer.disconnect(); };
  }, []);

  function start(e, item = null, resize = false) {
    if (busy || (e.button !== 0 && e.button !== 1)) return;
    e.preventDefault(); e.stopPropagation(); root.current.focus();
    viewport.current.setPointerCapture(e.pointerId);
    const p = point(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", view: viewRef.current, middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
      setPreview(null); return;
    }
    if (pointers.current.size > 2) return;
    const kind = resize ? "resize" : item && mode === "select" && e.button === 0 ? "move" : "pan";
    gesture.current = { kind, p, item, view: viewRef.current };
    if (item) setSelected(item.id); else setSelected(null);
  }
  function move(e) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = point(e); pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const next = zoomBoard(g.view, g.middle, g.view.scale * Math.hypot(a.x - b.x, a.y - b.y) / g.distance);
      setCamera({ ...next, x: next.x + (a.x + b.x) / 2 - g.middle.x, y: next.y + (a.y + b.y) / 2 - g.middle.y });
      return;
    }
    const dx = p.x - g.p.x, dy = p.y - g.p.y;
    if (g.kind === "pan") setCamera({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    else {
      const changes = g.kind === "move" ? { x: g.item.x + dx / g.view.scale, y: g.item.y + dy / g.view.scale } :
        { w: Math.max(160, Math.min(5000, g.item.w + dx / g.view.scale)), h: Math.max(140, Math.min(5000, g.item.h + dy / g.view.scale)) };
      g.changes = changes; setPreview({ id: g.item.id, ...changes });
    }
  }
  function end(e, cancel = false) {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId)) return;
    if (!cancel && g?.changes) patch(g.item.id, g.changes);
    pointers.current.delete(e.pointerId);
    if (viewport.current.hasPointerCapture(e.pointerId)) viewport.current.releasePointerCapture(e.pointerId);
    gesture.current = null; setPreview(null);
    if (pointers.current.size === 1) gesture.current = { kind: "pan", p: [...pointers.current.values()][0], view: viewRef.current };
  }
  function addNote() {
    const p = center(), v = viewRef.current;
    const existing = boardRef.current.items;
    const item = { id: crypto.randomUUID(), kind: "note", text: "", color: "yellow", x: existing.length ? Math.max(...existing.map((i) => i.x + i.w)) + 32 : (p.x - v.x) / v.scale - 140, y: existing.length ? Math.min(...existing.map((i) => i.y)) : (p.y - v.y) / v.scale - 110, w: 280, h: 220 };
    const next = { ...boardRef.current, items: [...existing, item] };
    commit(next); setSelected(item.id);
    setCamera(fitBoard(next.items, viewport.current.clientWidth, viewport.current.clientHeight));
  }
  async function addFiles(list, at = null) {
    if (importLock.current || !list?.length) return;
    importLock.current = true; setBusy(true); setError(""); callbacks.current.onBusyChange(true);
    const v = viewRef.current, existing = boardRef.current.items, p = at || center();
    const origin = !at && existing.length ? { x: Math.max(...existing.map((i) => i.x + i.w)) + 32, y: Math.min(...existing.map((i) => i.y)) } : { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
    const assets = [], items = [], errors = [];
    let total = boardRef.current.assets.reduce((n, asset) => n + asset.size, 0);
    try {
      for (const file of Array.from(list)) {
        try {
          const type = whiteboardFileType(file);
          if (!type) throw new Error("Use a PDF, PNG, JPEG, WebP, GIF or BMP.");
          if (!file.size || file.size > WHITEBOARD_FILE_LIMIT) throw new Error("Maximum attachment size is 25 MB.");
          if (total + file.size > WHITEBOARD_TOTAL_LIMIT) throw new Error("Whiteboard attachment limit is 75 MB.");
          if (boardRef.current.assets.length + assets.length >= 500 || boardRef.current.items.length + items.length >= 2000) throw new Error("Whiteboard item limit reached.");
          const bytes = new Uint8Array(await file.arrayBuffer());
          let ratio;
          if (type === "application/pdf") {
            const loading = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
            try { const doc = await loading.promise; const page = await doc.getPage(1); const size = page.getViewport({ scale: 1 }); ratio = size.width / size.height; }
            finally { await loading.destroy(); }
          } else {
            const bitmap = await createImageBitmap(new Blob([bytes], { type }));
            ratio = bitmap.width / bitmap.height; bitmap.close();
          }
          if (!alive.current) return;
          const asset = { id: crypto.randomUUID(), name: file.name, type, size: bytes.length, data: bytesToBase64(bytes) };
          const i = items.length, w = 360, h = Math.max(180, Math.min(560, w / ratio + 78));
          assets.push(asset); total += bytes.length;
          items.push({ id: crypto.randomUUID(), kind: "file", assetId: asset.id, page: 1, x: origin.x + (i % 3) * 390, y: origin.y + Math.floor(i / 3) * 590, w, h });
        } catch (e) { errors.push(`${file.name}: ${e.message || "Couldn't read file."}`); }
      }
      if (alive.current) {
        if (items.length) {
          const next = { ...boardRef.current, assets: [...boardRef.current.assets, ...assets], items: [...boardRef.current.items, ...items] };
          commit(next); setSelected(items[items.length - 1].id);
          setCamera(fitBoard(next.items, viewport.current.clientWidth, viewport.current.clientHeight));
        }
        setError(errors.join("\n"));
      }
    } finally { importLock.current = false; callbacks.current.onBusyChange(false); if (alive.current) setBusy(false); }
  }
  async function exportPdf() {
    if (exportTask.current || importLock.current) return;
    const controller = new AbortController();
    exportTask.current = controller; setExporting(true); setError("");
    try {
      const result = await buildWhiteboardPdf(boardRef.current, { projectName,
        renderer: whiteboardPdfRenderer(pdfjsLib), signal: controller.signal });
      if (alive.current && !controller.signal.aborted) downloadBytes(result.filename, result.bytes);
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError(e.message || "Whiteboard PDF export failed. Please try again.");
    } finally { if (exportTask.current === controller) exportTask.current = null; if (alive.current) setExporting(false); }
  }
  const active = board.items.find((item) => item.id === selected);
  const assets = new Map(board.assets.map((asset) => [asset.id, asset]));
  return createPortal(<section className="wb" role="dialog" aria-modal="true" aria-label="Whiteboard" tabIndex={-1} ref={root}
    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
    <header className="wb-header">
      <Button icon="chevronLeft" label="Close whiteboard" onClick={onClose} disabled={busy} />
      <div className="wb-title"><strong>Whiteboard</strong><span>{projectName || "Untitled project"}</span></div>
      <div className="wb-actions">
        <button type="button" onClick={() => input.current.click()} disabled={busy}><Icon name="plus" size={16} />Add files</button>
        <button type="button" onClick={addNote} disabled={busy || board.items.length >= 2000}><Icon name="textNote" size={16} />Note</button>
        <button type="button" onClick={onSave} disabled={busy}><Icon name="document" size={16} />Save project</button>
        <Button icon="document" label="Export Whiteboard as PDF" onClick={exportPdf} disabled={busy || exporting} aria-busy={exporting}>{exporting ? "Exporting..." : "Export PDF"}</Button>
      </div>
      <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp" aria-label="Whiteboard files" hidden
        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
    </header>
    <div className="wb-tools">
      <div role="group" aria-label="Whiteboard mode">
        <Button icon="select" label="Select and move" aria-pressed={mode === "select"} onClick={() => setMode("select")} />
        <Button icon="pan" label="Pan whiteboard" aria-pressed={mode === "pan"} onClick={() => setMode("pan")} />
      </div>
      <Button icon="undo" label="Undo whiteboard change" disabled={busy || !history.current.past.length} onClick={() => undo()} />
      <Button icon="undo" className="wb-redo" label="Redo whiteboard change" disabled={busy || !history.current.future.length} onClick={() => undo(true)} />
      {active && <>
        <Button icon="close" label="Delete selected item" disabled={busy} onClick={() => { commit(removeBoardItem(boardRef.current, selected)); setSelected(null); }} />
        {active.kind === "note" && <div className="wb-colors" role="group" aria-label="Note color">{Object.entries(NOTE_COLORS).map(([name, color]) =>
          <button type="button" key={name} aria-label={`${name} note`} title={`${name} note`} aria-pressed={active.color === name} style={{ background: color }} onClick={() => patch(selected, { color: name })} />)}</div>}
      </>}
      <span className="wb-status" role="status">{exporting ? "Exporting PDF..." : busy ? "Adding files..." : saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved locally" : ""}</span>
    </div>
    {error && <div className="wb-error" role="alert"><span>{error}</span><Button icon="close" label="Dismiss whiteboard error" onClick={() => setError("")} /></div>}
    <div ref={viewport} className={`wb-viewport${mode === "pan" ? " is-pan" : ""}`} aria-label="Whiteboard canvas"
      style={{ backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={(e) => start(e)} onPointerMove={move} onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files, point(e)); }}>
      {!board.items.length && <div className="wb-empty"><Icon name="document" size={36} /><strong>No notes yet</strong><button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => input.current.click()} disabled={busy}><Icon name="plus" size={16} />Add PDFs or images</button></div>}
      {board.items.map((saved) => {
        const item = preview?.id === saved.id ? { ...saved, ...preview } : saved;
        const asset = assets.get(item.assetId);
        const x = view.x + item.x * view.scale, y = view.y + item.y * view.scale;
        const visible = x < viewportSize.width + 200 && y < viewportSize.height + 200 && x + item.w * view.scale > -200 && y + item.h * view.scale > -200;
        return <article key={item.id} className={`wb-item${item.id === selected ? " is-selected" : ""}${item.kind === "note" ? " wb-note" : ""}`}
          aria-label={item.kind === "note" ? "Text note" : asset?.name} onPointerDown={(e) => start(e, item)}
          style={{ width: item.w, height: item.h, transform: `translate(${view.x + item.x * view.scale}px, ${view.y + item.y * view.scale}px) scale(${view.scale})`, ...(item.kind === "note" ? { background: NOTE_COLORS[item.color] } : {}) }}>
          <div className="wb-item-title" title={asset?.name || "Move note"}><Icon name={item.kind === "note" ? "textNote" : "document"} size={15} /><span>{asset?.name || "Note"}</span></div>
          {item.kind === "note" ? <textarea aria-label="Note text" value={item.text} maxLength={100000} spellCheck
            onPointerDown={(e) => { if (mode === "pan") start(e); else { e.stopPropagation(); setSelected(item.id); } }}
            onChange={(e) => patch(item.id, { text: e.target.value }, item.id)} onBlur={() => { editGroup.current = null; }} /> :
            asset && <FileCard asset={asset} item={item} onPage={pageChange} visible={visible} />}
          <button type="button" className="wb-resize" aria-label={`Resize ${asset?.name || "note"}`} title="Resize" onPointerDown={(e) => start(e, item, true)}><Icon name="fullscreen" size={13} /></button>
        </article>;
      })}
    </div>
    <footer className="wb-bottom"><span>{board.items.length} items</span><div>
      <Button icon="chevronDown" label="Zoom out whiteboard" onClick={() => zoom(1 / 1.2)} />
      <button type="button" className="wb-zoom" title="Reset zoom" aria-label="Reset whiteboard zoom" onClick={() => setCamera(zoomBoard(viewRef.current, center(), 1))}>{Math.round(view.scale * 100)}%</button>
      <Button icon="plus" label="Zoom in whiteboard" onClick={() => zoom(1.2)} />
      <Button icon="fullscreen" label="Fit whiteboard" onClick={fit} />
    </div></footer>
  </section>, document.body);
}
