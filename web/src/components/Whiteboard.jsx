import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Icon } from "../brand/icons.jsx";
import { ARROW_COLORS } from "../lib/canvasConstants.js";
import { downloadBytes } from "../lib/markedset.js";
import { boardContentRect, buildWhiteboardPdf } from "../lib/whiteboardPdf.js";
import { whiteboardPdfRenderer } from "../lib/whiteboardPdfBrowser.js";
import { whiteboardPdfPreviewScale } from "../lib/whiteboardPdfPreview.js";
import { base64ToBytes, bytesToBase64, appendWhiteboardArrow, appendWhiteboardRectangle, fitWhiteboard, normalizeWhiteboardImageCrop, NOTE_COLORS, removeBoardItem, removeWhiteboardDrawing, setWhiteboardImageCrop, setWhiteboardItemHeaderColor, updateWhiteboardDrawing, WHITEBOARD_FILE_HEADER_COLORS, WHITEBOARD_FILE_LIMIT, WHITEBOARD_TOTAL_LIMIT, whiteboardClipboardContent, whiteboardClipboardFileName, whiteboardFileHeaderColor, whiteboardFileHeaderTextColor, whiteboardFileType, whiteboardImageCrop, zoomBoard } from "../lib/whiteboard.js";
import "../styles/whiteboard.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function Button({ icon, label, children, ...props }) {
  return <button type="button" title={label} aria-label={label} {...props}><Icon name={icon} size={17} />{children}</button>;
}

const FULL_IMAGE_CROP = { x: 0, y: 0, w: 1, h: 1 };
const RECTANGLE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const FilePreview = memo(function FilePreview({ asset, page, crop, onPages, resolution, refreshKey }) {
  const host = useRef(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let stopped = false, loading, task, url, observer;
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
          if (!stopped) {
            const frame = document.createElement("div");
            frame.className = "wb-image-frame";
            frame.append(img); element.replaceChildren(frame);
            const area = normalizeWhiteboardImageCrop(crop) || FULL_IMAGE_CROP;
            const layout = () => {
              const availableW = Math.max(1, element.clientWidth), availableH = Math.max(1, element.clientHeight);
              const sourceW = Math.max(1, img.naturalWidth * area.w), sourceH = Math.max(1, img.naturalHeight * area.h);
              const scale = Math.min(1, availableW / sourceW, availableH / sourceH);
              frame.style.width = `${sourceW * scale}px`; frame.style.height = `${sourceH * scale}px`;
              img.style.width = `${img.naturalWidth * scale}px`; img.style.height = `${img.naturalHeight * scale}px`;
              img.style.left = `${-area.x * img.naturalWidth * scale}px`; img.style.top = `${-area.y * img.naturalHeight * scale}px`;
            };
            observer = new ResizeObserver(layout); observer.observe(element); layout(); setPending(false);
          }
          return;
        }
        loading = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
        const doc = await loading.promise;
        if (stopped) return;
        onPages(doc.numPages);
        const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
        if (stopped) return;
        const native = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: whiteboardPdfPreviewScale(native.width, native.height, resolution) });
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
    return () => { stopped = true; observer?.disconnect(); task?.cancel(); loading?.destroy().catch(() => {}); if (url) URL.revokeObjectURL(url); };
  }, [asset, page, crop, onPages, resolution, refreshKey]);
  return <div className="wb-preview">{error && <span role="alert">{error}</span>}{pending && <small className="wb-preview-loading" role="status">Rendering preview…</small>}<div ref={host} /></div>;
});

function ArrowGraphic({ from, to, color, selected = false, interactive = false, onSelect, onHandle }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1) return null;
  const ux = dx / length, uy = dy / length, head = Math.min(14, length * 0.65), half = head * 0.42;
  const bx = to.x - ux * head, by = to.y - uy * head;
  const d = `M ${to.x} ${to.y} L ${bx - uy * half} ${by + ux * half} L ${bx + uy * half} ${by - ux * half} Z`;
  return <g>
    {selected && <><line className="wb-drawing-selection" x1={from.x} y1={from.y} x2={bx} y2={by} /><path className="wb-drawing-selection" d={d} /></>}
    <line x1={from.x} y1={from.y} x2={bx} y2={by} stroke={color} strokeWidth="2.5" strokeLinecap="round" pointerEvents="none" />
    <path d={d} fill={color} pointerEvents="none" />
    {interactive && <>
      <line className="wb-drawing-hit" x1={from.x} y1={from.y} x2={to.x} y2={to.y} onPointerDown={onSelect} />
      <path className="wb-drawing-hit" d={d} onPointerDown={onSelect} />
    </>}
    {selected && <>
      <circle className="wb-drawing-handle" data-handle="from" cx={from.x} cy={from.y} r="5" onPointerDown={(event) => onHandle?.(event, "from")} />
      <circle className="wb-drawing-handle" data-handle="to" cx={to.x} cy={to.y} r="5" onPointerDown={(event) => onHandle?.(event, "to")} />
    </>}
  </g>;
}

function RectangleGraphic({ rect, color, strokeWidth = 2.5, selected = false, interactive = false, onSelect, onHandle }) {
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w < 1 || rect.h < 1) return null;
  const points = {
    nw: [rect.x, rect.y], n: [rect.x + rect.w / 2, rect.y], ne: [rect.x + rect.w, rect.y],
    e: [rect.x + rect.w, rect.y + rect.h / 2], se: [rect.x + rect.w, rect.y + rect.h],
    s: [rect.x + rect.w / 2, rect.y + rect.h], sw: [rect.x, rect.y + rect.h], w: [rect.x, rect.y + rect.h / 2],
  };
  return <g>
    {selected && <rect className="wb-drawing-selection" x={rect.x} y={rect.y} width={rect.w} height={rect.h} />}
    <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke={color} strokeWidth={strokeWidth} pointerEvents="none" />
    {interactive && <rect className="wb-drawing-hit" x={rect.x} y={rect.y} width={rect.w} height={rect.h} onPointerDown={onSelect} />}
    {selected && RECTANGLE_HANDLES.map((handle) => <circle key={handle} className="wb-drawing-handle" data-handle={handle}
      cx={points[handle][0]} cy={points[handle][1]} r="5" onPointerDown={(event) => onHandle?.(event, handle)} />)}
  </g>;
}

function rectangleFromPoints(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function resizeRectangle(rect, handle, dx, dy, minimum) {
  let left = rect.x, top = rect.y, right = rect.x + rect.w, bottom = rect.y + rect.h;
  if (handle.includes("w")) left = Math.min(left + dx, right - minimum);
  if (handle.includes("e")) right = Math.max(right + dx, left + minimum);
  if (handle.includes("n")) top = Math.min(top + dy, bottom - minimum);
  if (handle.includes("s")) bottom = Math.max(bottom + dy, top + minimum);
  return { ...rect, x: left, y: top, w: right - left, h: bottom - top };
}

function resizeImageCrop(crop, handle, dx, dy, minW, minH) {
  let left = crop.x, top = crop.y, right = crop.x + crop.w, bottom = crop.y + crop.h;
  if (handle.includes("w")) left = Math.max(0, Math.min(left + dx, right - minW));
  if (handle.includes("e")) right = Math.min(1, Math.max(right + dx, left + minW));
  if (handle.includes("n")) top = Math.max(0, Math.min(top + dy, bottom - minH));
  if (handle.includes("s")) bottom = Math.min(1, Math.max(bottom + dy, top + minH));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function HeaderColorButtons({ itemLabel, color, scale, onChange }) {
  const selected = whiteboardFileHeaderColor(color);
  const controlScale = Math.min(1 / scale, 38 / 16);
  return <div className="wb-item-header-colors" role="group" aria-label={`Header colors for ${itemLabel}`}
    style={{ right: `${8 / scale}px`, top: "calc(50% - 8px)", transform: `scale(${controlScale})` }}>
    {WHITEBOARD_FILE_HEADER_COLORS.map(({ name, value }) => {
      const active = selected === value;
      return <button key={value} type="button" className="wb-file-header-swatch"
        aria-label={`${name} header color for ${itemLabel}`} title={`${name}${active ? " — selected; click again for default" : ""}`}
        aria-pressed={active} style={{ backgroundColor: value, color: whiteboardFileHeaderTextColor(value) }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onChange(active ? null : value); }}>
        {active && <Icon name="check" size={6} />}
      </button>;
    })}
  </div>;
}

const FileCard = memo(function FileCard({ asset, item, onPage, visible, resolution, refreshKey }) {
  const [pages, setPages] = useState(0);
  return <>
    {visible ? <FilePreview asset={asset} page={item.page} crop={item.crop} onPages={setPages} resolution={resolution} refreshKey={refreshKey} /> : <div className="wb-preview" />}
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
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [exportArea, setExportArea] = useState(null), [areaDraft, setAreaDraft] = useState(null);
  const [drawingColor, setDrawingColor] = useState(ARROW_COLORS[0].value), [drawingPreview, setDrawingPreview] = useState(null);
  const [imageCrop, setImageCrop] = useState(null);
  const imageCropRef = useRef(imageCrop); imageCropRef.current = imageCrop;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const importLock = useRef(false), alive = useRef(true);
  const exportTask = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pdfResolution, setPdfResolution] = useState(2);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const gesture = useRef(null), pointers = useRef(new Map());
  const pastePoint = useRef(null);
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
  const clearImageCrop = useCallback(() => {
    const current = imageCropRef.current;
    if (current?.url) URL.revokeObjectURL(current.url);
    imageCropRef.current = null; setImageCrop(null);
  }, []);
  const removeSelected = useCallback(() => {
    const id = selectedRef.current;
    if (!id) return;
    const current = boardRef.current;
    let next = current;
    if (current.items.some((item) => item.id === id)) next = removeBoardItem(current, id);
    else if ((current.arrows || []).some((arrow) => arrow.id === id)) next = removeWhiteboardDrawing(current, "arrow", id);
    else if ((current.rectangles || []).some((rectangle) => rectangle.id === id)) next = removeWhiteboardDrawing(current, "rectangle", id);
    if (next !== current) commit(next);
    setSelected(null);
  }, [commit]);
  const pageChange = useCallback((id, page) => patch(id, { page }), [patch]);
  const undo = useCallback((redo = false) => {
    const h = history.current, from = redo ? h.future : h.past, to = redo ? h.past : h.future;
    if (!from.length) return;
    to.push(boardRef.current);
    const next = from.pop(); boardRef.current = next;
    callbacks.current.onChange(next); editGroup.current = null; clearImageCrop(); setSelected(null); historyTick((n) => n + 1);
  }, [clearImageCrop]);

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
      if (e.key === "Escape" && !importLock.current) {
        e.preventDefault();
        if (imageCropRef.current) clearImageCrop();
        else if (gesture.current?.kind === "export-area" || mode === "export-area" || exportArea) {
          gesture.current = null; pointers.current.clear(); setAreaDraft(null); setExportArea(null); setMode("select");
        } else callbacks.current.onClose();
      }
      if (e.key === "Tab") {
        const nodes = [...root.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea')].filter((node) => node.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if (!editing && !imageCropRef.current && (e.key === "Delete" || e.key === "Backspace") && selectedRef.current) { e.preventDefault(); removeSelected(); }
      if (!editing && !imageCropRef.current && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (!importLock.current) undo(e.shiftKey); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!importLock.current) callbacks.current.onSave(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { alive.current = false; exportTask.current?.abort(); window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [clearImageCrop, removeSelected, undo, mode, exportArea]);

  useEffect(() => () => {
    if (imageCropRef.current?.url) URL.revokeObjectURL(imageCropRef.current.url);
  }, []);

  const point = (e) => { const r = viewport.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const center = () => ({ x: viewport.current.clientWidth / 2, y: viewport.current.clientHeight / 2 });
  const setCamera = (next) => { viewRef.current = next; setView(next); };
  const zoom = (factor) => setCamera(zoomBoard(viewRef.current, center(), viewRef.current.scale * factor));
  const fit = () => setCamera(fitWhiteboard(boardRef.current, viewport.current.clientWidth, viewport.current.clientHeight));

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
    const next = fitWhiteboard(boardRef.current, element.clientWidth, element.clientHeight);
    viewRef.current = next; setView(next);
    return () => { element.removeEventListener("wheel", wheel); observer.disconnect(); };
  }, []);

  function start(e, target = null, handle = null) {
    if (busy || (e.button !== 0 && e.button !== 1)) return;
    if (imageCropRef.current && e.button === 0) return;
    e.preventDefault(); e.stopPropagation(); root.current.focus();
    viewport.current.setPointerCapture(e.pointerId);
    const p = point(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", view: viewRef.current, middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
      setPreview(null); setDrawingPreview(null); return;
    }
    if (pointers.current.size > 2) return;
    const drawingMode = mode === "arrow" || mode === "rectangle";
    const kind = mode === "export-area" && e.button === 0 ? "export-area" : drawingMode && e.button === 0 ? `draw-${mode}` :
      target?.type === "item" && mode === "select" && e.button === 0 ? (handle ? "item-resize" : "item-move") :
        target && mode === "select" && e.button === 0 ? (handle ? "drawing-resize" : "drawing-move") : "pan";
    gesture.current = { kind, p, to: p, target, handle, view: viewRef.current, color: drawingColor };
    if (kind === "draw-arrow") setDrawingPreview({ type: "arrow", screen: true, from: p, to: p, color: drawingColor });
    if (kind === "draw-rectangle") setDrawingPreview({ type: "rectangle", screen: true, rect: { x: p.x, y: p.y, w: 0, h: 0 }, color: drawingColor });
    if (kind === "export-area") { setExportArea(null); setAreaDraft({ x: p.x, y: p.y, w: 0, h: 0 }); }
    if (drawingMode) setSelected(null);
    else if (kind !== "export-area") { if (target) setSelected(target.value.id); else setSelected(null); }
  }

  function startImageCropResize(e, handle) {
    const cropState = imageCropRef.current;
    if (!cropState || busy || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); root.current.focus();
    viewport.current.setPointerCapture(e.pointerId);
    const p = point(e); pointers.current.set(e.pointerId, p);
    gesture.current = { kind: "image-crop-resize", p, handle, crop: cropState.draft, base: cropState.base,
      minW: Math.min(cropState.draft.w, Math.max(.02, 16 / cropState.naturalWidth, 40 / cropState.base.w)),
      minH: Math.min(cropState.draft.h, Math.max(.02, 16 / cropState.naturalHeight, 40 / cropState.base.h)),
      view: viewRef.current };
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
    else if (g.kind === "draw-arrow") { g.to = p; setDrawingPreview({ type: "arrow", screen: true, from: g.p, to: p, color: g.color }); }
    else if (g.kind === "draw-rectangle") { g.to = p; setDrawingPreview({ type: "rectangle", screen: true, rect: rectangleFromPoints(g.p, p), color: g.color }); }
    else if (g.kind === "export-area") {
      g.to = p;
      setAreaDraft({ x: Math.min(g.p.x, p.x), y: Math.min(g.p.y, p.y), w: Math.abs(p.x - g.p.x), h: Math.abs(p.y - g.p.y) });
    }
    else if (g.kind === "image-crop-resize") {
      const draft = resizeImageCrop(g.crop, g.handle, dx / (g.base.w * g.view.scale), dy / (g.base.h * g.view.scale), g.minW, g.minH);
      setImageCrop((current) => current ? { ...current, draft } : current);
    }
    else if (g.kind === "item-move" || g.kind === "item-resize") {
      const item = g.target.value;
      const croppedImage = item.kind === "file" && item.crop;
      const minW = croppedImage ? 42 : 160, minH = croppedImage ? 82 : 140;
      const changes = g.kind === "item-move" ? { x: item.x + dx / g.view.scale, y: item.y + dy / g.view.scale } :
        { w: Math.max(minW, Math.min(5000, item.w + dx / g.view.scale)), h: Math.max(minH, Math.min(5000, item.h + dy / g.view.scale)) };
      g.changes = changes; setPreview({ id: item.id, ...changes });
    }
    else if (g.kind === "drawing-move" || g.kind === "drawing-resize") {
      const drawing = g.target.value, wx = dx / g.view.scale, wy = dy / g.view.scale;
      let next;
      if (g.target.type === "arrow") {
        next = g.kind === "drawing-move" ? { ...drawing, from: [drawing.from[0] + wx, drawing.from[1] + wy], to: [drawing.to[0] + wx, drawing.to[1] + wy] } :
          { ...drawing, [g.handle]: [drawing[g.handle][0] + wx, drawing[g.handle][1] + wy] };
        if (Math.hypot(next.to[0] - next.from[0], next.to[1] - next.from[1]) < 8 / g.view.scale) next = drawing;
      } else {
        next = g.kind === "drawing-move" ? { ...drawing, x: drawing.x + wx, y: drawing.y + wy } : resizeRectangle(drawing, g.handle, wx, wy, 4 / g.view.scale);
      }
      g.drawing = next; setDrawingPreview({ type: g.target.type, id: drawing.id, drawing: next });
    }
  }
  function end(e, cancel = false) {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId)) return;
    if (g?.kind === "export-area") {
      if (!cancel && Math.abs(g.to.x - g.p.x) >= 20 && Math.abs(g.to.y - g.p.y) >= 20) {
        const { view: camera } = g;
        const x1 = (Math.min(g.p.x, g.to.x) - camera.x) / camera.scale;
        const y1 = (Math.min(g.p.y, g.to.y) - camera.y) / camera.scale;
        const x2 = (Math.max(g.p.x, g.to.x) - camera.x) / camera.scale;
        const y2 = (Math.max(g.p.y, g.to.y) - camera.y) / camera.scale;
        setExportArea({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        setMode("select");
      }
      setAreaDraft(null);
    }
    if (!cancel && g?.changes) patch(g.target.value.id, g.changes);
    if (!cancel && g?.drawing) commit(updateWhiteboardDrawing(boardRef.current, g.target.type, g.target.value.id, g.drawing));
    if (!cancel && g?.kind === "draw-arrow" && Math.hypot((g.to.x - g.p.x), (g.to.y - g.p.y)) >= 8) {
      const v = g.view;
      commit(appendWhiteboardArrow(boardRef.current, [(g.p.x - v.x) / v.scale, (g.p.y - v.y) / v.scale], [(g.to.x - v.x) / v.scale, (g.to.y - v.y) / v.scale], g.color || drawingColor));
    }
    if (!cancel && g?.kind === "draw-rectangle" && Math.abs(g.to.x - g.p.x) >= 8 && Math.abs(g.to.y - g.p.y) >= 8) {
      const v = g.view;
      commit(appendWhiteboardRectangle(boardRef.current, [(g.p.x - v.x) / v.scale, (g.p.y - v.y) / v.scale], [(g.to.x - v.x) / v.scale, (g.to.y - v.y) / v.scale], g.color || drawingColor));
    }
    pointers.current.delete(e.pointerId);
    if (viewport.current.hasPointerCapture(e.pointerId)) viewport.current.releasePointerCapture(e.pointerId);
    gesture.current = null; setPreview(null); setDrawingPreview(null);
    if (pointers.current.size === 1) gesture.current = { kind: "pan", p: [...pointers.current.values()][0], view: viewRef.current };
  }
  function addNote(text = "", at = null) {
    if (text.length > 100000) { setError("Pasted text exceeds the 100,000 character note limit."); return; }
    if (boardRef.current.items.length >= 2000) { setError("Whiteboard item limit reached."); return; }
    const p = at || center(), v = viewRef.current;
    const existing = boardRef.current.items;
    const placed = at || !existing.length;
    const item = { id: crypto.randomUUID(), kind: "note", text, color: "yellow", x: placed ? (p.x - v.x) / v.scale - 140 : Math.max(...existing.map((i) => i.x + i.w)) + 32, y: placed ? (p.y - v.y) / v.scale - 110 : Math.min(...existing.map((i) => i.y)), w: 280, h: 220 };
    const next = { ...boardRef.current, items: [...existing, item] };
    commit(next); setSelected(item.id);
    setCamera(fitWhiteboard(next, viewport.current.clientWidth, viewport.current.clientHeight));
  }
  async function addFiles(list, at = null) {
    if (importLock.current || !list?.length) return;
    importLock.current = true; setBusy(true); setError(""); callbacks.current.onBusyChange(true);
    const v = viewRef.current, existing = boardRef.current.items, p = at || center();
    const origin = !at && existing.length ? { x: Math.max(...existing.map((i) => i.x + i.w)) + 32, y: Math.min(...existing.map((i) => i.y)) } : { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
    const assets = [], items = [], errors = [];
    let total = boardRef.current.assets.reduce((n, asset) => n + asset.size, 0);
    try {
      for (const [fileIndex, file] of Array.from(list).entries()) {
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
          const asset = { id: crypto.randomUUID(), name: whiteboardClipboardFileName(file, fileIndex), type, size: bytes.length, data: bytesToBase64(bytes) };
          const i = items.length, w = 360, h = Math.max(180, Math.min(560, w / ratio + 78));
          assets.push(asset); total += bytes.length;
          items.push({ id: crypto.randomUUID(), kind: "file", assetId: asset.id, page: 1, x: origin.x + (i % 3) * 390, y: origin.y + Math.floor(i / 3) * 590, w, h });
        } catch (e) { errors.push(`${file.name}: ${e.message || "Couldn't read file."}`); }
      }
      if (alive.current) {
        if (items.length) {
          const next = { ...boardRef.current, assets: [...boardRef.current.assets, ...assets], items: [...boardRef.current.items, ...items] };
          commit(next); setSelected(items[items.length - 1].id);
          setCamera(fitWhiteboard(next, viewport.current.clientWidth, viewport.current.clientHeight));
        }
        setError(errors.join("\n"));
      }
    } finally { importLock.current = false; callbacks.current.onBusyChange(false); if (alive.current) setBusy(false); }
  }
  function paste(e) {
    if (busy || importLock.current || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const content = whiteboardClipboardContent(e.clipboardData);
    if (!content.files.length && !content.text) return;
    e.preventDefault(); e.stopPropagation(); setError("");
    const at = pastePoint.current || center();
    if (content.files.length) addFiles(content.files, at);
    else addNote(content.text, at);
  }
  async function beginImageCrop() {
    const item = boardRef.current.items.find(({ id }) => id === selectedRef.current);
    const asset = item?.kind === "file" && boardRef.current.assets.find(({ id }) => id === item.assetId);
    if (!item || !asset?.type?.startsWith("image/") || asset.missing) return;
    setError("");
    const url = URL.createObjectURL(new Blob([base64ToBytes(asset.data)], { type: asset.type }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (!alive.current || selectedRef.current !== item.id) { URL.revokeObjectURL(url); return; }
      clearImageCrop();
      const crop = whiteboardImageCrop(item) || FULL_IMAGE_CROP;
      const visible = boardContentRect(item, { width: image.naturalWidth * crop.w, height: image.naturalHeight * crop.h });
      const base = { x: visible.x - crop.x * visible.w / crop.w, y: visible.y - crop.y * visible.h / crop.h,
        w: visible.w / crop.w, h: visible.h / crop.h };
      const next = { itemId: item.id, assetId: asset.id, url, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, base, draft: { ...crop } };
      imageCropRef.current = next; setImageCrop(next); setMode("select");
    } catch (cause) {
      URL.revokeObjectURL(url);
      setError(cause?.message || "Could not open this image for cropping.");
    }
  }
  function applyImageCrop() {
    const state = imageCropRef.current;
    if (!state) return;
    const crop = normalizeWhiteboardImageCrop(state.draft) || FULL_IMAGE_CROP;
    const visible = { x: state.base.x + crop.x * state.base.w, y: state.base.y + crop.y * state.base.h,
      w: crop.w * state.base.w, h: crop.h * state.base.h };
    let next = setWhiteboardImageCrop(boardRef.current, state.itemId, crop);
    next = { ...next, items: next.items.map((item) => item.id === state.itemId ? { ...item,
      x: visible.x - 1, y: visible.y - 39, w: Math.max(42, visible.w + 2), h: Math.max(82, visible.h + 80) } : item) };
    clearImageCrop(); commit(next); setSelected(state.itemId);
  }
  async function exportPdf(region = null) {
    if (exportTask.current || importLock.current) return;
    const controller = new AbortController();
    exportTask.current = controller; setExporting(true); setError("");
    try {
      const result = await buildWhiteboardPdf(boardRef.current, { projectName, ...(region ? { region, boardName: "Whiteboard selection" } : {}),
        renderer: whiteboardPdfRenderer(pdfjsLib), signal: controller.signal });
      if (alive.current && !controller.signal.aborted) downloadBytes(result.filename, result.bytes);
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError(e.message || "Whiteboard PDF export failed. Please try again.");
    } finally { if (exportTask.current === controller) exportTask.current = null; if (alive.current) setExporting(false); }
  }
  const activeItem = board.items.find((item) => item.id === selected);
  const activeArrow = (board.arrows || []).find((arrow) => arrow.id === selected);
  const activeRectangle = (board.rectangles || []).find((rectangle) => rectangle.id === selected);
  const active = activeItem || activeArrow || activeRectangle;
  const assets = new Map(board.assets.map((asset) => [asset.id, asset]));
  const activeAsset = activeItem?.kind === "file" ? assets.get(activeItem.assetId) : null;
  const canCropImage = !!activeAsset?.type?.startsWith("image/") && !activeAsset.missing;
  const hasPdf = board.assets.some((asset) => asset.type === "application/pdf");
  const drawingCount = (board.arrows?.length || 0) + (board.rectangles?.length || 0);
  return createPortal(<section className="wb" role="dialog" aria-modal="true" aria-label="Whiteboard" tabIndex={-1} ref={root}
    onPaste={paste}
    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
    <header className="wb-header">
      <Button icon="chevronLeft" label="Close whiteboard" onClick={onClose} disabled={busy} />
      <div className="wb-title"><strong>Whiteboard</strong><span>{projectName || "Untitled project"}</span></div>
      <div className="wb-actions">
        <button type="button" onClick={() => input.current.click()} disabled={busy}><Icon name="plus" size={16} />Add files</button>
        <button type="button" onClick={() => addNote()} disabled={busy || board.items.length >= 2000}><Icon name="textNote" size={16} />Note</button>
        <button type="button" onClick={onSave} disabled={busy}><Icon name="document" size={16} />Save project</button>
        <Button icon="document" label="Export whiteboard as PDF" onClick={() => exportPdf()} disabled={busy || exporting} aria-busy={exporting}>{exporting ? "Exporting..." : "Export whiteboard as PDF"}</Button>
      </div>
      <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp" aria-label="Whiteboard files" hidden
        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
    </header>
    <div className="wb-tools">
      <div role="group" aria-label="Whiteboard mode">
        <Button icon="select" label="Select and move" disabled={!!imageCrop} aria-pressed={mode === "select"} onClick={() => setMode("select")} />
        <Button icon="pan" label="Pan whiteboard" disabled={!!imageCrop} aria-pressed={mode === "pan"} onClick={() => setMode("pan")} />
        <Button icon="arrow" label="Draw arrow" disabled={!!imageCrop} aria-pressed={mode === "arrow"} onClick={() => setMode(mode === "arrow" ? "select" : "arrow")} />
        <Button icon="rectTool" label="Draw rectangle" disabled={!!imageCrop} aria-pressed={mode === "rectangle"} onClick={() => setMode(mode === "rectangle" ? "select" : "rectangle")} />
        <Button icon="fullscreen" label={mode === "export-area" ? "Cancel export area selection" : "Select area to export"} disabled={!!imageCrop} aria-pressed={mode === "export-area"} onClick={() => {
          setExportArea(null); setAreaDraft(null); setMode(mode === "export-area" ? "select" : "export-area");
        }} />
      </div>
      {imageCrop && <div className="wb-crop-actions" role="group" aria-label="Image crop actions">
        <Button icon="check" className="is-primary" label="Apply image crop" onClick={applyImageCrop}>Apply crop</Button>
        <Button icon="close" label="Cancel image crop" onClick={clearImageCrop}>Cancel</Button>
      </div>}
      {exportArea && <div className="wb-export-actions" role="group" aria-label="Selected PDF export area">
        <button type="button" onClick={() => exportPdf(exportArea)} disabled={busy || exporting}>{exporting ? "Exporting selection…" : "Export selected area as PDF"}</button>
        <button type="button" onClick={() => setExportArea(null)} disabled={exporting}>Clear area</button>
      </div>}
      {(mode === "arrow" || mode === "rectangle") && <div className="wb-colors wb-arrow-colors" role="group" aria-label={`${mode === "arrow" ? "Arrow" : "Rectangle"} color`}>
        {ARROW_COLORS.map(({ name, value }) => <button key={value} type="button" aria-label={`${name} ${mode} color`} title={`${name} ${mode} color`} aria-pressed={drawingColor === value}
          style={{ backgroundColor: value }} onClick={() => setDrawingColor(value)} />)}
      </div>}
      <Button icon="undo" label="Undo whiteboard change" disabled={busy || !!imageCrop || !history.current.past.length} onClick={() => undo()} />
      <Button icon="undo" className="wb-redo" label="Redo whiteboard change" disabled={busy || !!imageCrop || !history.current.future.length} onClick={() => undo(true)} />
      {active && !imageCrop && <>
        <Button icon="close" label="Delete selected object" disabled={busy} onClick={removeSelected} />
        {canCropImage && <Button icon="crop" label={activeItem.crop ? "Adjust image crop" : "Crop image"} disabled={busy} onClick={beginImageCrop}>{activeItem.crop ? "Adjust crop" : "Crop"}</Button>}
        {activeItem?.kind === "note" && <div className="wb-colors" role="group" aria-label="Note color">{Object.entries(NOTE_COLORS).map(([name, color]) =>
          <button type="button" key={name} aria-label={`${name} note`} title={`${name} note`} aria-pressed={activeItem.color === name} style={{ background: color }} onClick={() => patch(selected, { color: name })} />)}</div>}
      </>}
      {hasPdf && <>
        <label className="wb-resolution" title="Higher PDF preview resolution is sharper when zoomed in but takes longer to render and more memory.">
          <span>PDF detail</span>
          <input type="range" min="1" max="3" step="1" value={pdfResolution} aria-label="PDF preview resolution"
            onChange={(e) => setPdfResolution(Number(e.target.value))} />
          <output>{pdfResolution}×</output>
        </label>
        <button type="button" className="wb-refresh" title="Render visible PDF previews again at the selected detail" aria-label="Refresh PDF previews"
          disabled={busy || exporting} onClick={() => setPdfRefreshKey((key) => key + 1)}>Refresh</button>
      </>}
      <span className="wb-status" role="status">{exporting ? "Exporting PDF..." : busy ? "Adding files..." : saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved locally" : ""}</span>
    </div>
    {error && <div className="wb-error" role="alert"><span>{error}</span><Button icon="close" label="Dismiss whiteboard error" onClick={() => setError("")} /></div>}
    <div ref={viewport} className={`wb-viewport${mode === "pan" ? " is-pan" : ""}${mode === "arrow" ? " is-arrow" : ""}${mode === "rectangle" ? " is-rectangle" : ""}${mode === "export-area" ? " is-crop" : ""}${imageCrop ? " is-image-crop" : ""}`} aria-label="Whiteboard canvas"
      style={{ backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={(e) => { pastePoint.current = point(e); start(e); }} onPointerMove={(e) => { pastePoint.current = point(e); move(e); }} onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files, point(e)); }}>
      {!board.items.length && !drawingCount && <div className="wb-empty"><Icon name="document" size={36} /><strong>No notes yet</strong><span>Paste text, images or supported files, or add them manually.</span><button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => input.current.click()} disabled={busy}><Icon name="plus" size={16} />Add PDFs or images</button></div>}
      {board.items.map((saved) => {
        const item = preview?.id === saved.id ? { ...saved, ...preview } : saved;
        const asset = assets.get(item.assetId);
        const itemHeaderColor = whiteboardFileHeaderColor(item.headerColor);
        const itemHeaderStyle = itemHeaderColor ? { backgroundColor: itemHeaderColor, color: whiteboardFileHeaderTextColor(itemHeaderColor) } : undefined;
        const x = view.x + item.x * view.scale, y = view.y + item.y * view.scale;
        const visible = x < viewportSize.width + 200 && y < viewportSize.height + 200 && x + item.w * view.scale > -200 && y + item.h * view.scale > -200;
        return <article key={item.id} className={`wb-item${item.id === selected ? " is-selected" : ""}${item.kind === "note" ? " wb-note" : ""}`}
          aria-label={item.kind === "note" ? "Text note" : asset?.name} onPointerDown={(e) => start(e, { type: "item", value: item })}
          style={{ width: item.w, height: item.h, transform: `translate(${view.x + item.x * view.scale}px, ${view.y + item.y * view.scale}px) scale(${view.scale})`, ...(item.kind === "note" ? { background: NOTE_COLORS[item.color] } : {}) }}>
          <div className="wb-item-title wb-color-title" title={asset?.name || item.title || "Note"}
            style={{ ...(itemHeaderStyle || {}), paddingRight: `calc(12px + ${87 / view.scale}px)` }}>
            <Icon name={item.kind === "note" ? "textNote" : "document"} size={15} />
            {item.kind === "note" ? <input className="wb-note-title" type="text" aria-label="Note title" maxLength={120}
              value={item.title ?? "Note"} placeholder="Note" onPointerDown={(e) => { e.stopPropagation(); setSelected(item.id); }}
              onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => patch(item.id, { title: e.target.value }, `title:${item.id}`)}
              onBlur={() => { editGroup.current = null; }} /> : <span>{asset?.name}</span>}
            <HeaderColorButtons itemLabel={item.kind === "note" ? (item.title || "Note") : (asset?.name || "file")} color={itemHeaderColor} scale={view.scale}
              onChange={(color) => commit(setWhiteboardItemHeaderColor(boardRef.current, item.id, color))} />
          </div>
          {item.kind === "note" ? <textarea aria-label="Note text" value={item.text} maxLength={100000} spellCheck
            onPointerDown={(e) => { if (mode !== "select") start(e); else { e.stopPropagation(); setSelected(item.id); } }}
            onChange={(e) => patch(item.id, { text: e.target.value }, item.id)} onBlur={() => { editGroup.current = null; }} /> :
            asset && <FileCard asset={asset} item={item} onPage={pageChange} visible={visible}
              resolution={asset.type === "application/pdf" ? pdfResolution : 1} refreshKey={asset.type === "application/pdf" ? pdfRefreshKey : 0} />}
          <button type="button" className="wb-resize" aria-label={`Resize ${asset?.name || "note"}`} title="Resize" onPointerDown={(e) => start(e, { type: "item", value: item }, "se")}><Icon name="fullscreen" size={13} /></button>
        </article>;
      })}
      <svg className="wb-arrows" aria-label="Whiteboard drawings" role="img"
        viewBox={`0 0 ${Math.max(1, viewportSize.width)} ${Math.max(1, viewportSize.height)}`} preserveAspectRatio="none">
        {(board.arrows || []).map((arrow) => {
          const shown = drawingPreview?.type === "arrow" && drawingPreview.id === arrow.id ? drawingPreview.drawing : arrow;
          const from = { x: view.x + shown.from[0] * view.scale, y: view.y + shown.from[1] * view.scale };
          const to = { x: view.x + shown.to[0] * view.scale, y: view.y + shown.to[1] * view.scale };
          return <ArrowGraphic key={arrow.id} from={from} to={to} color={shown.color || "#1f3fc7"} selected={selected === arrow.id}
            interactive={mode === "select" && !imageCrop} onSelect={(event) => start(event, { type: "arrow", value: shown })}
            onHandle={(event, handle) => start(event, { type: "arrow", value: shown }, handle)} />;
        })}
        {(board.rectangles || []).map((rectangle) => {
          const shown = drawingPreview?.type === "rectangle" && drawingPreview.id === rectangle.id ? drawingPreview.drawing : rectangle;
          const rect = { x: view.x + shown.x * view.scale, y: view.y + shown.y * view.scale, w: shown.w * view.scale, h: shown.h * view.scale };
          return <RectangleGraphic key={rectangle.id} rect={rect} color={shown.color || "#1f3fc7"} strokeWidth={shown.strokeWidth || 2.5} selected={selected === rectangle.id}
            interactive={mode === "select" && !imageCrop} onSelect={(event) => start(event, { type: "rectangle", value: shown })}
            onHandle={(event, handle) => start(event, { type: "rectangle", value: shown }, handle)} />;
        })}
        {drawingPreview?.screen && drawingPreview.type === "arrow" && <ArrowGraphic from={drawingPreview.from} to={drawingPreview.to} color={drawingPreview.color} />}
        {drawingPreview?.screen && drawingPreview.type === "rectangle" && <RectangleGraphic rect={drawingPreview.rect} color={drawingPreview.color} />}
      </svg>
      {imageCrop && <div className="wb-image-crop-overlay" aria-label="Crop image" style={{
        left: view.x + imageCrop.base.x * view.scale, top: view.y + imageCrop.base.y * view.scale,
        width: imageCrop.base.w * view.scale, height: imageCrop.base.h * view.scale,
      }}>
        <img src={imageCrop.url} alt="" draggable="false" />
        <div className="wb-image-crop-frame" style={{ left: `${imageCrop.draft.x * 100}%`, top: `${imageCrop.draft.y * 100}%`,
          width: `${imageCrop.draft.w * 100}%`, height: `${imageCrop.draft.h * 100}%` }}>
          {RECTANGLE_HANDLES.map((handle) => <button key={handle} type="button" className="wb-image-crop-handle" data-handle={handle}
            aria-label={`Crop ${handle} handle`} onPointerDown={(event) => startImageCropResize(event, handle)} />)}
        </div>
      </div>}
      {exportArea && <div className="wb-export-area" aria-label="Selected PDF export area" style={{
        left: view.x + exportArea.x * view.scale, top: view.y + exportArea.y * view.scale,
        width: exportArea.w * view.scale, height: exportArea.h * view.scale,
      }} />}
      {areaDraft && <div className="wb-export-area is-draft" aria-hidden="true" style={{ left: areaDraft.x, top: areaDraft.y, width: areaDraft.w, height: areaDraft.h }} />}
    </div>
    <footer className="wb-bottom"><span>{board.items.length + drawingCount} items</span><div>
      <Button icon="chevronDown" label="Zoom out whiteboard" onClick={() => zoom(1 / 1.2)} />
      <button type="button" className="wb-zoom" title="Reset zoom" aria-label="Reset whiteboard zoom" onClick={() => setCamera(zoomBoard(viewRef.current, center(), 1))}>{Math.round(view.scale * 100)}%</button>
      <Button icon="plus" label="Zoom in whiteboard" onClick={() => zoom(1.2)} />
      <Button icon="fullscreen" label="Fit whiteboard" onClick={fit} />
    </div></footer>
  </section>, document.body);
}
