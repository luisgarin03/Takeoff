import { Button } from './ui/button.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { binaryRaster } from '../lib/symbolSearch.js';
import { OPS } from 'pdfjs-dist';
import { vectorObjects, selectVectorReference, pickVectorObject, matchVectorObjects } from '../lib/vectorSymbolSearch.js';
import { findSearchTargets } from '../lib/findText.js';
import '../styles/symbolSearch.css';

async function renderSearchPage(docFor, file, pageNumber, signal, renderTask) {
  const pdf = await docFor(file);
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const page = await pdf.getPage(pageNumber), base = page.getViewport({ scale: 1 });
  const scale = 1600 / Math.max(base.width, base.height), viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }); renderTask.current = task;
  const cancel = () => task.cancel(); signal.addEventListener('abort', cancel, { once: true });
  try { await task.promise; }
  finally { signal.removeEventListener('abort', cancel); if (renderTask.current === task) renderTask.current = null; }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const raster = binaryRaster(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
  const operators = await page.getOperatorList();
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return { canvas, raster, scale, objects: vectorObjects(operators, OPS, viewport), pages: pdf.numPages };
}
function thumbnail(canvas, box) {
  const crop = document.createElement('canvas'); crop.width = 180; crop.height = 110;
  const context = crop.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 180, 110);
  const w = Math.max(box.w * 2.2, box.h * 2.2 * 180 / 110, 60), h = w * 110 / 180;
  context.drawImage(canvas, box.x + box.w / 2 - w / 2, box.y + box.h / 2 - h / 2, w, h, 0, 0, 180, 110);
  context.strokeStyle = '#d54b36'; context.lineWidth = 2;
  context.strokeRect((180 - box.w / w * 180) / 2, (110 - box.h / h * 110) / 2, box.w / w * 180, box.h / h * 110);
  return crop.toDataURL('image/png');
}
export default function SymbolSearchDialog({ source: initialSource, sheets, docFor, readOnly, onOutlineMatches, onClearSearch, onClose, onOpenChange, selectionFromCanvas, referenceToScreen, onViewGesture, searchGroups = [], hiddenSearches = new Set(), onToggleSearch, onDeleteSearch }) {
  const spaceHeld = useRef(false), panAnchor = useRef(null);
  useEffect(() => {
    const down = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); spaceHeld.current = true; } };
    const up = (e) => { if (e.code === 'Space') spaceHeld.current = false; };
    const reset = () => { spaceHeld.current = false; panAnchor.current = null; };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up); window.addEventListener('blur', reset);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset); };
  }, []);
  const [source] = useState(initialSource);
  const [picking, setPicking] = useState(true);
  const [drawerTab, setDrawerTab] = useState("search");
  const [drawerHeight, setDrawerHeight] = useState(200);
  useEffect(() => { const drawer = root.current; if (!drawer) return; const observer = new ResizeObserver(() => setDrawerHeight(drawer.getBoundingClientRect().height)); observer.observe(drawer); return () => observer.disconnect(); }, []);
  const [selectionMode, setSelectionMode] = useState("click");
  const hoverPreview = useRef(null);
  const clearHoverPreview = () => { if (hoverPreview.current) hoverPreview.current.style.display = "none"; };

  const [canvasBox, setCanvasBox] = useState(null);
  const [pageImage, setPageImage] = useState(null), [box, setBox] = useState(null), [template, setTemplate] = useState(null);
  const [scope, setScope] = useState('page'), [threshold, setThreshold] = useState(.92), [rotated, setRotated] = useState(false);
  const [, setMatches] = useState([]), [, setSelected] = useState(new Set());

  const [busy, setBusy] = useState(false), [message, setMessage] = useState('Loading the current pageÃ¢â‚¬Â¦');
  const root = useRef(null), anchor = useRef(null), operation = useRef(null), worker = useRef(null), renderTask = useRef(null);
  const callbacks = useRef({ onClose, onOpenChange, selectionFromCanvas }); callbacks.current = { onClose, onOpenChange };
  useEffect(() => {
    const previous = document.activeElement; root.current?.focus();
    return () => { operation.current?.abort(); worker.current?.terminate(); renderTask.current?.cancel(); previous?.focus?.(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); operation.current = controller;
    renderSearchPage(docFor, source.file, source.page || 1, controller.signal, renderTask).then((page) => {
      if (!controller.signal.aborted) { setPageImage(page); setMessage('Drag a tight box around one symbol. Include a small white border; exclude nearby text and lines.'); }
    }).catch((error) => { if (!controller.signal.aborted) setMessage(error.message || 'This page could not be rendered.'); });
    return () => controller.abort();
  }, [docFor, source]);
  const resetResults = () => { setMatches([]); setSelected(new Set()); };
  function cancel() { operation.current?.abort(); worker.current?.terminate(); worker.current = null; renderTask.current?.cancel(); setBusy(false); setMessage('Search cancelled. Completed-page results remain available.'); }
  const searchId = useRef(crypto.randomUUID());
  async function search() {
    if (!template || busy) return;
    const controller = new AbortController(); operation.current = controller;
    searchId.current = crypto.randomUUID();
    resetResults(); setBusy(true);
    const allMatches = []; let skipped = 0, limited = false, searched = 0;
    try {
      const targets = findSearchTargets(sheets, scope, source);
      for (const target of targets) {
        if (controller.signal.aborted) return;
        let pdf; try { pdf = await docFor(target.file); } catch { skipped++; continue; }
        const pages = target.page == null ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : [target.page];
        for (const page of pages) {
          if (controller.signal.aborted) return;
          setMessage(`Searching ${target.file} Ã‚Â· page ${page} of ${pdf.numPages} Ã‚Â· ${allMatches.length} suggestions`);
          try {
            const image = await renderSearchPage(docFor, target.file, page, controller.signal, renderTask);
            if (controller.signal.aborted) return;
            const result = matchVectorObjects(image.objects, template, { threshold, ratio: image.scale / pageImage.scale, rotated });
            if (controller.signal.aborted) return;
            searched++; limited ||= result.limited;
            const key = page > 1 ? `${target.file}#${page}` : target.file;
            for (const hit of result.matches) allMatches.push({ id: `${key}:${allMatches.length}`, key, file: target.file, page, score: hit.score, pageAspect: image.raster.width / image.raster.height, x: hit.x / image.raster.width, y: hit.y / image.raster.height, w: hit.w / image.raster.width, h: hit.h / image.raster.height, thumbnail: thumbnail(image.canvas, hit) });
            setMatches(allMatches.slice(0, 1000));
            if (allMatches.length >= 1000) { limited = true; break; }
          } catch { if (controller.signal.aborted) return; skipped++; }
        }
        if (allMatches.length >= 1000) break;
      }
      if (controller.signal.aborted) return;
      const result = onOutlineMatches(allMatches.slice(0, 1000), searchId.current, { scope, file: source.file, page: source.page || 1, similarity: Math.round(threshold * 100), referenceMode: selectionMode });
      if (result === false) return;
      setMatches([]); setSelected(new Set()); setTemplate(null); setCanvasBox(null); setPicking(true);
      setMessage(`${result.added} matches outlined on ${searched} searched page${searched === 1 ? '' : 's'}.${skipped ? ` ${skipped} pages could not be searched.` : ''}${limited ? ' Result limit reached.' : ''} Click an outline with Select, then press Delete to remove it.`);
    } catch (error) { if (!controller.signal.aborted) setMessage(error.message || 'Symbol search failed.'); }
    finally { if (operation.current === controller) setBusy(false); }
  }
  useEffect(() => {
    root.current?.focus();
    if (!pageImage || !canvasBox) return;
    try {
      const reference = canvasBox.click ? pickVectorObject(pageImage.objects, { x: canvasBox.x * pageImage.raster.width, y: canvasBox.y * pageImage.raster.height }) : selectVectorReference(pageImage.objects, { x: canvasBox.x * pageImage.raster.width, y: canvasBox.y * pageImage.raster.height, w: canvasBox.w * pageImage.raster.width, h: canvasBox.h * pageImage.raster.height });
      if (!reference) throw new Error("No complete vector shape found inside the box. Include the entire symbol and a small border. This PDF may store it as separate segments or an image.");
      setTemplate(reference);
      setMessage('');
    } catch (error) { setTemplate(null); setMessage(error.message); }
  }, [pageImage, canvasBox, picking]);
  function previewShape(event) {
    const node = hoverPreview.current;
    if (!node || !pageImage || selectionMode !== "click" || panAnchor.current || spaceHeld.current) { clearHoverPreview(); return; }
    const point = selectionFromCanvas({ x: event.clientX, y: event.clientY }, { x: event.clientX, y: event.clientY });
    const hit = point && pickVectorObject(pageImage.objects, { x: point.x * pageImage.raster.width, y: point.y * pageImage.raster.height });
    if (!hit) { clearHoverPreview(); return; }
    const screen = referenceToScreen({ x: hit.x / pageImage.raster.width, y: hit.y / pageImage.raster.height, w: hit.w / pageImage.raster.width, h: hit.h / pageImage.raster.height });
    Object.assign(node.style, { display: "block", left: `${screen.left}px`, top: `${screen.top}px`, width: `${screen.width}px`, height: `${screen.height}px` });
  }
  const picker = picking ? <div ref={root} tabIndex={-1} className="symbol-canvas-picker" style={{ bottom: drawerHeight }} role="dialog" aria-modal="false" aria-label="Select symbol on PDF"
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); setPicking(false); } }}
    onWheel={(e) => { clearHoverPreview(); e.preventDefault(); anchor.current = null; setBox(null); onViewGesture({ x: e.clientX, y: e.clientY, zoom: e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1) }); }}
    onPointerDown={(e) => { clearHoverPreview(); if (e.target.closest('button') || ![0, 1].includes(e.button)) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); setBox(null); if (e.button === 1 || spaceHeld.current) { panAnchor.current = { x: e.clientX, y: e.clientY }; anchor.current = null; } else anchor.current = { x: e.clientX, y: e.clientY }; }}
    onPointerLeave={clearHoverPreview}
    onPointerMove={(e) => { previewShape(e); if (panAnchor.current) { onViewGesture({ dx: e.clientX - panAnchor.current.x, dy: e.clientY - panAnchor.current.y }); panAnchor.current = { x: e.clientX, y: e.clientY }; } else if (anchor.current && selectionMode === "box") setBox({ x: Math.min(anchor.current.x, e.clientX), y: Math.min(anchor.current.y, e.clientY), w: Math.abs(e.clientX - anchor.current.x), h: Math.abs(e.clientY - anchor.current.y) }); }}
    onPointerCancel={() => { panAnchor.current = null; anchor.current = null; setBox(null); }}
    onPointerUp={(e) => { if (panAnchor.current) { panAnchor.current = null; return; } if (!anchor.current) return; const start = anchor.current; anchor.current = null; setBox(null); const rect = selectionFromCanvas(selectionMode === "click" ? { x: e.clientX, y: e.clientY } : start, { x: e.clientX, y: e.clientY }); if (!rect || (selectionMode === "box" && (rect.w <= 0 || rect.h <= 0))) return; rect.click = selectionMode === "click"; resetResults(); setCanvasBox(rect); }}>
    {box && <div className="symbol-canvas-picker-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
  </div> : null;
  const highlight = template && pageImage ? referenceToScreen({ x: template.x / pageImage.raster.width, y: template.y / pageImage.raster.height, w: template.w / pageImage.raster.width, h: template.h / pageImage.raster.height }) : null;
  return createPortal(<>{picking && selectionMode === "click" && <div ref={hoverPreview} className="symbol-hover-highlight" aria-hidden="true" />}{highlight && <div className="symbol-reference-highlight" style={highlight} aria-label="Selected PDF shape" />}{picker}<div className="symbol-search-shade" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <section className="symbol-search-dialog" role="dialog" aria-modal="false" aria-labelledby="symbol-search-title" ref={root} tabIndex={-1} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    }}>
      <header><div><h2 id="symbol-search-title">Symbol search</h2><p>Select a symbol Ã¢â€ â€™ search Ã¢â€ â€™ outline automatically</p></div><div className="symbol-search-header-actions"><div className="symbol-search-tabs" role="tablist" aria-label="Symbol search tabs">{["search", "help"].map((tab) => <button key={tab} id={`symbol-tab-${tab}`} type="button" role="tab" aria-selected={drawerTab === tab} aria-controls={`symbol-panel-${tab}`} tabIndex={drawerTab === tab ? 0 : -1} onClick={() => { setDrawerTab(tab); if (tab === "help") setPicking(false); }} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "search" : event.key === "End" ? "help" : drawerTab === "search" ? "help" : "search"; setDrawerTab(next); if (next === "help") setPicking(false); document.getElementById(`symbol-tab-${next}`)?.focus(); } }}>{tab === "search" ? "Search" : "Help"}</button>)}</div><Button variant="ghost" size="icon" type="button" aria-label="Close symbol search" onClick={onClose}>Ãƒâ€”</Button></div></header>
      <div id="symbol-panel-search" role="tabpanel" aria-labelledby="symbol-tab-search" hidden={drawerTab !== "search"} className="symbol-search-tab-panel">
      <div className="symbol-search-controls"><div className="symbol-reference-control"><span id="symbol-reference-label">Select reference</span><div className="symbol-reference-toggle" role="group" aria-labelledby="symbol-reference-label">{[["click", "Click shape"], ["box", "Drag box"]].map(([mode, label]) => <button key={mode} type="button" disabled={busy} aria-pressed={selectionMode === mode} onClick={() => { setSelectionMode(mode); setPicking(true); }}>{label}</button>)}</div></div>
        <label>Search scope<select value={scope} disabled={busy} onChange={(event) => { setScope(event.target.value); resetResults(); }}><option value="page">Current page</option><option value="file">Current PDF set</option><option value="all">All loaded plans</option></select></label>
        <label>Vector similarity: {Math.round(threshold * 100)}%<input type="range" min="75" max="99" step="1" value={Math.round(threshold * 100)} disabled={busy} onChange={(event) => { setThreshold(Number(event.target.value) / 100); resetResults(); }} /></label>
        <label className="symbol-search-check"><input type="checkbox" checked={rotated} disabled={busy} onChange={(event) => { setRotated(event.target.checked); resetResults(); }} />Include quarter-turn rotations</label>
        {busy ? <Button variant="outline" size="sm" type="button" onClick={cancel}>Cancel search</Button> : <Button variant="default" size="sm" type="button" disabled={!template || readOnly} onClick={search}>Search symbols</Button>}
        <div className="symbol-search-manage-column">
        <section className="symbol-search-groups symbol-search-marks" aria-label="Search marks">
          <div className="symbol-search-marks-heading"><strong>Search marks</strong><button type="button" disabled={readOnly || !searchGroups.length} onClick={() => { if (busy) cancel(); resetResults(); onClearSearch(); setPicking(true); }}>Remove all</button></div>
          <div className="symbol-search-marks-list">{searchGroups.map((group) => <div className="symbol-search-mark-row" key={group.id}>
            <Button variant="outline" size="sm" className="symbol-search-mark-toggle" aria-pressed={!hiddenSearches.has(group.id)} title={hiddenSearches.has(group.id) ? 'Show outlines' : 'Hide outlines'} onClick={() => onToggleSearch(group.id)}>{hiddenSearches.has(group.id) ? 'Unmarked' : 'Ã¢Å“â€œ Marked'}</Button>
            <span className="symbol-search-mark-color" style={{ backgroundColor: group.color }} title={group.name} aria-hidden="true" />

            <span className="symbol-search-mark-total">{group.count} matches Ã‚Â· {group.pages} {group.pages === 1 ? 'page' : 'pages'}</span>
            <Button variant="ghost" size="icon" className="symbol-search-delete" title="Remove search" aria-label={`Remove ${group.name}`} disabled={readOnly} onClick={() => onDeleteSearch(group.id)}>Ãƒâ€”</Button>
          </div>)}</div>
        </section></div>

      </div>
      {message && <p className="symbol-search-message" role="status">{message}</p>}


      </div>
      <div id="symbol-panel-help" role="tabpanel" aria-labelledby="symbol-tab-help" hidden={drawerTab !== "help"} className="symbol-search-help">
        <h3>Select a reference</h3>
        <p>Select a symbol directly on the PDF canvas. Matches individual painted vector objects of approximately the same size (Ã‚Â±15%), excluding overlapping objects and text.</p>
        <p>Choose <strong>Click a shape</strong> to preview shapes in amber and select one in blue, or <strong>Drag a box</strong> to enclose a complete symbol. Opening the drawer activates selection automatically. Click either reference toggle to select another shape.</p>
        <h3>Navigate and search</h3>
        <p>Scroll to zoom. Hold Space and drag, or use the middle mouse button, to pan. Choose a search scope and similarity, enable quarter-turn rotations if needed, then select <strong>Search symbols</strong>.</p>
        <h3>Review and manage matches</h3>
        <p>Search automatically outlines matches on the PDF. Use the Select tool to click an outline, then press Delete or Backspace to remove it. Each search has its own color and Hide/Show and Delete controls. <strong>Clear all searches</strong> removes all groups; Undo restores deleted outlines.</p>
        <p>Matching depends on how the PDF stores its graphics. Scans and symbols split across unrelated objects may not be selectable as one shape.</p>
      </div>
    </section>
  </div></>, document.body);
}
