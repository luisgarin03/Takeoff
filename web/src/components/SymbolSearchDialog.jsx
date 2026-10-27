import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { binaryRaster, cropSymbol } from '../lib/symbolSearch.js';
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
  return { canvas, raster, scale, pages: pdf.numPages };
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
export default function SymbolSearchDialog({ source: initialSource, sheets, docFor, conditions, activeCondition, readOnly, onAddCounts, onClose, onOpenChange }) {
  const [source] = useState(initialSource);
  const [zoom, setZoom] = useState(100);
  const [pageImage, setPageImage] = useState(null), [box, setBox] = useState(null), [template, setTemplate] = useState(null);
  const [scope, setScope] = useState('page'), [threshold, setThreshold] = useState(.92), [rotated, setRotated] = useState(false);
  const [matches, setMatches] = useState([]), [selected, setSelected] = useState(new Set());
  const [condition, setCondition] = useState(activeCondition || ''), [newName, setNewName] = useState('Symbol count');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('Loading the current page…');
  const root = useRef(null), canvasRef = useRef(null), anchor = useRef(null), operation = useRef(null), worker = useRef(null), renderTask = useRef(null);
  const callbacks = useRef({ onClose, onOpenChange }); callbacks.current = { onClose, onOpenChange };
  useEffect(() => {
    const previous = document.activeElement; callbacks.current.onOpenChange?.(true); root.current?.focus();
    return () => { operation.current?.abort(); worker.current?.terminate(); renderTask.current?.cancel(); callbacks.current.onOpenChange?.(false); previous?.focus?.(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); operation.current = controller;
    renderSearchPage(docFor, source.file, source.page || 1, controller.signal, renderTask).then((page) => {
      if (!controller.signal.aborted) { setPageImage(page); setMessage('Drag a tight box around one symbol. Include a small white border; exclude nearby text and lines.'); }
    }).catch((error) => { if (!controller.signal.aborted) setMessage(error.message || 'This page could not be rendered.'); });
    return () => controller.abort();
  }, [docFor, source]);
  useEffect(() => {
    if (!pageImage || !canvasRef.current) return;
    const canvas = canvasRef.current; canvas.width = pageImage.canvas.width; canvas.height = pageImage.canvas.height;
    canvas.getContext('2d').drawImage(pageImage.canvas, 0, 0);
  }, [pageImage]);
  const resetResults = () => { setMatches([]); setSelected(new Set()); };
  function point(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(pageImage.raster.width - 1, (event.clientX - rect.left) / rect.width * pageImage.raster.width)), y: Math.max(0, Math.min(pageImage.raster.height - 1, (event.clientY - rect.top) / rect.height * pageImage.raster.height)) };
  }
  function selection(event, finish = false) {
    if (!anchor.current || !pageImage || busy) return;
    const current = point(event), rect = { x: Math.min(current.x, anchor.current.x), y: Math.min(current.y, anchor.current.y), w: Math.abs(current.x - anchor.current.x), h: Math.abs(current.y - anchor.current.y) };
    setBox(rect);
    if (finish) {
      anchor.current = null; resetResults();
      try { setTemplate(cropSymbol(pageImage.raster, rect)); setMessage('Symbol selected. Choose a scope, then search.'); }
      catch (error) { setTemplate(null); setMessage(error.message); }
    }
  }
  function cancel() { operation.current?.abort(); worker.current?.terminate(); worker.current = null; renderTask.current?.cancel(); setBusy(false); setMessage('Search cancelled. Completed-page results remain available.'); }
  async function search() {
    if (!template || busy) return;
    const controller = new AbortController(); operation.current = controller;
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
          setMessage(`Searching ${target.file} · page ${page} of ${pdf.numPages} · ${allMatches.length} suggestions`);
          try {
            const image = await renderSearchPage(docFor, target.file, page, controller.signal, renderTask);
            if (controller.signal.aborted) return;
            const result = await new Promise((resolve, reject) => {
              const task = new Worker(new URL('../lib/symbolSearch.worker.js', import.meta.url), { type: 'module' }); worker.current = task;
              const abort = () => { task.terminate(); reject(new DOMException('Cancelled', 'AbortError')); };
              controller.signal.addEventListener('abort', abort, { once: true });
              const finish = () => { task.terminate(); worker.current = null; controller.signal.removeEventListener('abort', abort); };
              task.onmessage = ({ data }) => { finish(); data.error ? reject(new Error(data.error)) : resolve(data); };
              task.onerror = () => { finish(); reject(new Error('Symbol matching failed on this page.')); };
              const ratio = image.scale / pageImage.scale;
              task.postMessage({ image: image.raster, template, options: { threshold, scales: [.85, 1, 1.15].map((value) => value * ratio), rotations: rotated ? [0, 90, 180, 270] : [0], limit: 250 } });
            });
            if (controller.signal.aborted) return;
            searched++; limited ||= result.limited;
            const key = page > 1 ? `${target.file}#${page}` : target.file;
            for (const hit of result.matches) allMatches.push({ id: `${key}:${allMatches.length}`, key, file: target.file, page, score: hit.score, x: hit.x / image.raster.width, y: hit.y / image.raster.height, w: hit.w / image.raster.width, h: hit.h / image.raster.height, thumbnail: thumbnail(image.canvas, hit) });
            setMatches(allMatches.slice(0, 1000));
            if (allMatches.length >= 1000) { limited = true; break; }
          } catch { if (controller.signal.aborted) return; skipped++; }
        }
        if (allMatches.length >= 1000) break;
      }
      setMessage(`${Math.min(allMatches.length, 1000)} suggestions on ${searched} searched page${searched === 1 ? '' : 's'}.${skipped ? ` ${skipped} pages/files could not be searched.` : ''}${limited ? ' Result limit reached; narrow the scope or raise similarity.' : ''} Review each suggestion before adding counts. Similar symbols and nearby linework can produce false matches.`);
    } catch (error) { if (!controller.signal.aborted) setMessage(error.message || 'Symbol search failed.'); }
    finally { if (operation.current === controller) setBusy(false); }
  }
  const chosen = matches.filter((hit) => selected.has(hit.id));
  return createPortal(<div className="symbol-search-shade" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <section className="symbol-search-dialog" role="dialog" aria-modal="true" aria-labelledby="symbol-search-title" ref={root} tabIndex={-1} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const nodes = [...root.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), canvas[tabindex]')];
        if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === root.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && (document.activeElement === nodes.at(-1) || document.activeElement === root.current)) { event.preventDefault(); nodes[0]?.focus(); }
      }
    }}>
      <header><div><h2 id="symbol-search-title">Symbol search</h2><p>Select a symbol → find similar symbols → review → count</p></div><button type="button" aria-label="Close symbol search" onClick={onClose}>×</button></header>
      <div className="symbol-search-controls">
        <label>Search scope<select value={scope} disabled={busy} onChange={(event) => { setScope(event.target.value); resetResults(); }}><option value="page">Current page</option><option value="file">Current PDF set</option><option value="all">All loaded plans</option></select></label>
        <label>Minimum similarity: {Math.round(threshold * 100)}%<input type="range" min="75" max="99" step="1" value={Math.round(threshold * 100)} disabled={busy} onChange={(event) => { setThreshold(Number(event.target.value) / 100); resetResults(); }} /></label>
        <label className="symbol-search-check"><input type="checkbox" checked={rotated} disabled={busy} onChange={(event) => { setRotated(event.target.checked); resetResults(); }} />Include quarter-turn rotations</label>
        {busy ? <button type="button" onClick={cancel}>Cancel search</button> : <button className="btn-primary" type="button" disabled={!template} onClick={search}>Search symbols</button>}
      </div>
      <p className="symbol-search-message" role="status">{message}</p>
      <div className="symbol-search-body">
        <div className="symbol-search-source"><h3>Reference · {source.file} · page {source.page || 1}</h3><p>Search includes symbols approximately the same size (±15%). Use a tight selection for better results. Drag on the preview to choose a different reference.</p>
          <label className="symbol-search-preview-zoom">Preview zoom: {zoom}%<input type="range" min="100" max="300" step="25" value={zoom} disabled={busy} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <div className="symbol-search-preview-scroll"><div className="symbol-search-preview" style={{ width: `${zoom}%` }}>
            <canvas ref={canvasRef} aria-label="Plan preview: drag to select the reference symbol" onPointerDown={(event) => { if (!pageImage || busy || event.button !== 0) return; anchor.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); setBox(null); setTemplate(null); resetResults(); }} onPointerMove={(event) => selection(event)} onPointerUp={(event) => selection(event, true)} onPointerCancel={() => { anchor.current = null; setBox(null); setTemplate(null); }} />
            {box && pageImage && <div className="symbol-search-selection" style={{ left: `${box.x / pageImage.raster.width * 100}%`, top: `${box.y / pageImage.raster.height * 100}%`, width: `${box.w / pageImage.raster.width * 100}%`, height: `${box.h / pageImage.raster.height * 100}%` }} />}
          </div></div>
        </div>
        <div className="symbol-search-results"><div className="symbol-search-results-heading"><h3>Review suggestions ({matches.length})</h3><button type="button" disabled={!matches.length || busy} onClick={() => setSelected(new Set(matches.map((hit) => hit.id)))}>Select all</button><button type="button" disabled={!selected.size || busy} onClick={() => setSelected(new Set())}>Clear selection</button></div>
          <div className="symbol-search-matches">{matches.map((hit) => <label className="symbol-search-match" key={hit.id}><input type="checkbox" checked={selected.has(hit.id)} disabled={busy} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(hit.id); else next.delete(hit.id); return next; })} /><img src={hit.thumbnail} alt={`Suggested symbol on page ${hit.page}`} /><span title={hit.file}>{hit.file} · p{hit.page}<small>{Math.round(hit.score * 100)}% similarity</small></span></label>)}</div>
        </div>
      </div>
      <footer><div><label>Count condition<select value={condition} disabled={busy || readOnly} onChange={(event) => setCondition(event.target.value)}><option value="">Create a new condition</option>{conditions.map((item) => <option key={item.id} value={item.id}>{item.finish_tag}</option>)}</select></label>{!condition && <label>New condition name<input value={newName} maxLength={120} disabled={busy || readOnly} onChange={(event) => setNewName(event.target.value)} /></label>}</div>
        <span>{readOnly ? 'Read only mode · Upgrade to add counts.' : `${chosen.length} selected · nothing added until you confirm`}</span>
        <button className="btn-primary" type="button" disabled={readOnly || busy || !chosen.length || (!condition && !newName.trim())} onClick={() => {
          try { const result = onAddCounts(chosen, condition, newName.trim()); if (result === false) return; const added = result.added; setCondition(result.conditionId); setSelected(new Set()); root.current?.focus(); setMessage(`${added} counts added. Overlapping counts already in this condition were skipped. Use Undo on the plan to remove this batch.`); }
          catch (error) { setMessage(error.message || 'Counts could not be added.'); }
        }}>Add selected counts</button>
      </footer>
    </section>
  </div>, document.body);
}
