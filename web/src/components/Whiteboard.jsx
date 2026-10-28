import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Icon } from "../brand/icons.jsx";
import LongTaskLoader from "./LongTaskLoader.jsx";
import PdfExportDialog from "./PdfExportDialog.jsx";
import ToolMenu from "./ToolMenu.jsx";
import { usePinchZoom } from "../lib/usePinchZoom.js";
import SOWPanel from "./SOWPanel.jsx";
import { ARROW_COLORS } from "../lib/canvasConstants.js";
import { downloadBytes } from "../lib/markedset.js";
import { WHITEBOARD_PAGE_TILE_HEIGHT, WHITEBOARD_PAGE_TILE_WIDTH, boardContentRect, buildWhiteboardPdf } from "../lib/whiteboardPdf.js";
import { whiteboardPdfRenderer } from "../lib/whiteboardPdfBrowser.js";
import { estimatePdfExportSize, formatFileSize, loadPdfExportQuality, pdfExportQuality, savePdfExportQuality } from "../lib/exportQuality.js";
import { whiteboardPdfLayoutSize, whiteboardPdfPreviewScale } from "../lib/whiteboardPdfPreview.js";
import { addWhiteboardSowPanel, appendWhiteboardExportArea, base64ToBytes, bytesToBase64, appendWhiteboardArrow, appendWhiteboardRectangle, clearWhiteboardExportAreas, duplicateWhiteboardExportArea, fitBoard, fitWhiteboard, moveWhiteboardExportArea, normalizeWhiteboardImageCrop, NOTE_COLORS, removeBoardItem, removeWhiteboardDrawing, removeWhiteboardExportArea, setWhiteboardImageCrop, setWhiteboardItemHeaderColor, updateWhiteboardDrawing, updateWhiteboardExportArea, updateWhiteboardSowLayout, WHITEBOARD_FILE_HEADER_COLORS, WHITEBOARD_FILE_LIMIT, WHITEBOARD_TOTAL_LIMIT, whiteboardClipboardContent, whiteboardClipboardFileName, whiteboardFileHeaderColor, whiteboardFileHeaderTextColor, whiteboardFileType, whiteboardImageCrop, zoomBoard } from "../lib/whiteboard.js";
import "../styles/whiteboard.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function Button({ icon, label, children, ...props }) {
  return <button type="button" title={label} aria-label={label} {...props}><Icon name={icon} size={17} />{children}</button>;
}

const FULL_IMAGE_CROP = { x: 0, y: 0, w: 1, h: 1 };
const RECTANGLE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const EXPORT_PAGE_SIZES = [
  ["match", "Match selected area"], ["letter", "Letter"], ["legal", "Legal"], ["tabloid", "Tabloid (11 × 17)"],
  ["arch-d", "ARCH D (24 × 36)"], ["arch-e", "ARCH E (36 × 48)"],
];
const EXPORT_ORIENTATIONS = [["auto", "Auto"], ["portrait", "Portrait"], ["landscape", "Landscape"]];
const EXPORT_QUALITIES = [["standard", "Standard"], ["high", "High"], ["maximum", "Maximum"]];

function estimateWhiteboardSize(board, request, quality) {
  const preset = pdfExportQuality(quality);
  const region = request?.region || null;
  const intersects = (rect) => !region || (rect.x < region.x + region.w && rect.x + rect.w > region.x && rect.y < region.y + region.h && rect.y + rect.h > region.y);
  const assets = new Map((board.assets || []).map((asset) => [asset.id, asset]));
  const rects = [];
  let rasterPixels = 0;
  for (const item of board.items || []) {
    const rect = item.kind === "note" ? { x: item.x, y: item.y, w: item.w, h: item.h } : boardContentRect(item);
    if (!intersects(rect)) continue;
    rects.push(rect);
    const asset = assets.get(item.assetId);
    if (asset?.type === "application/pdf") rasterPixels += preset.pageMaxDimension ** 2 * 0.72;
    else rasterPixels += Math.max(1, rect.w * rect.h * preset.boardScale ** 2);
  }
  for (const sow of board.sows || []) {
    const active = sow.tabs?.find((tab) => tab.id === sow.activeTabId) || sow.tabs?.[0];
    const height = 86 + Math.max(38, (active?.entries?.length || 0) * 24);
    const rect = { x: sow.x, y: sow.y, w: sow.w, h: height };
    if (!intersects(rect)) continue;
    rects.push(rect); rasterPixels += rect.w * rect.h * preset.boardScale ** 2;
  }
  let pages = 1;
  if (request?.pageMode === "pages" && rects.length) {
    const minX = Math.min(...rects.map((rect) => rect.x)), minY = Math.min(...rects.map((rect) => rect.y));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.w)), maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
    pages = Math.max(1, Math.ceil((maxX - minX) / WHITEBOARD_PAGE_TILE_WIDTH) * Math.ceil((maxY - minY) / WHITEBOARD_PAGE_TILE_HEIGHT));
  }
  return estimatePdfExportSize({ rasterPixels: Math.max(1, rasterPixels), pages,
    vectorItems: (board.arrows?.length || 0) + (board.rectangles?.length || 0) }, preset);
}

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
        const layout = whiteboardPdfLayoutSize(native.width, native.height);
        // Render offscreen and publish only while this page owns the preview.
        // A cancelled/older page must never replace the current page's pixels.
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${layout.width}px`; canvas.style.height = `${layout.height}px`;
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

export default function Whiteboard({ board, onChange, onClose: onClosed, onSave, onBusyChange, projectName, saveState,
  initialFiles = null, onInitialFilesHandled, readOnly = false, readOnlyMessage = "" }) {
  const root = useRef(null), viewport = useRef(null), input = useRef(null);
  const cameraInput = useRef(null);
  const toolbarRef = useRef(null);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const update = () => root.current?.style.setProperty("--wb-toolbar-height", `${element.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null), closeCallback = useRef(onClosed);
  closeCallback.current = onClosed;
  const onClose = useCallback(() => {
    if (closeTimer.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      closeCallback.current();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => closeCallback.current(), 220);
  }, []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const boardRef = useRef(board), callbacks = useRef({ onChange, onClose, onBusyChange, onSave, onInitialFilesHandled });
  boardRef.current = board; callbacks.current = { onChange, onClose, onBusyChange, onSave, onInitialFilesHandled };
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const [selected, setSelected] = useState(null), [mode, setMode] = useState("select");
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [areaDraft, setAreaDraft] = useState(null), [exportAreaPreview, setExportAreaPreview] = useState(null);
  const [showExportPages, setShowExportPages] = useState(false);
  const [drawingColor, setDrawingColor] = useState(ARROW_COLORS[0].value), [drawingPreview, setDrawingPreview] = useState(null);
  const [sowPreview, setSowPreview] = useState(null);
  const [imageCrop, setImageCrop] = useState(null);
  const imageCropRef = useRef(imageCrop); imageCropRef.current = imageCrop;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [pendingLocalImport, setPendingLocalImport] = useState(null); // { files: File[], at } — waits for PDF page grouping choice
  const importLock = useRef(false), localImportProbeLock = useRef(false), alive = useRef(true);
  const exportTask = useRef(null);
  const [exportMode, setExportMode] = useState(null);
  const [exportRequest, setExportRequest] = useState(null);
  const [exportQuality, setExportQuality] = useState(loadPdfExportQuality);
  const [lastExportSize, setLastExportSize] = useState(0);
  const [customExportProgress, setCustomExportProgress] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const exporting = !!exportMode;
  const [preview, setPreview] = useState(null);
  const [pdfResolution, setPdfResolution] = useState(3);
  const [pdfRefreshKey] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const gesture = useRef(null), pointers = useRef(new Map());
  const pastePoint = useRef(null);
  const history = useRef({ past: [], future: [] });
  const [, historyTick] = useState(0);
  const editGroup = useRef(null);

  const denyReadOnlyEdit = useCallback(() => {
    if (!readOnly) return false;
    setError(readOnlyMessage || "This whiteboard is read-only.");
    return true;
  }, [readOnly, readOnlyMessage]);

  const commit = useCallback((next, group = null) => {
    if (denyReadOnlyEdit()) return;
    if (next === boardRef.current) return;
    if (!group || editGroup.current !== group) {
      history.current.past = [...history.current.past.slice(-19), boardRef.current];
    }
    history.current.future = []; editGroup.current = group;
    boardRef.current = next; callbacks.current.onChange(next); historyTick((n) => n + 1);
  }, [denyReadOnlyEdit]);
  const patch = useCallback((id, changes, group = null) => {
    commit({ ...boardRef.current, items: boardRef.current.items.map((item) => item.id === id ? { ...item, ...changes } : item) }, group);
  }, [commit]);
  const clearImageCrop = useCallback(() => {
    const current = imageCropRef.current;
    if (current?.url) URL.revokeObjectURL(current.url);
    imageCropRef.current = null; setImageCrop(null);
  }, []);
  const removeSelected = useCallback((selectedId = selectedRef.current) => {
    if (denyReadOnlyEdit()) return;
    const id = selectedId;
    if (!id) return;
    const current = boardRef.current;
    let next = current;
    if (current.items.some((item) => item.id === id)) next = removeBoardItem(current, id);
    else if ((current.arrows || []).some((arrow) => arrow.id === id)) next = removeWhiteboardDrawing(current, "arrow", id);
    else if ((current.rectangles || []).some((rectangle) => rectangle.id === id)) next = removeWhiteboardDrawing(current, "rectangle", id);
    else if ((current.exportAreas || []).some((area) => area.id === id)) next = removeWhiteboardExportArea(current, id);
    if (next !== current) commit(next);
    setSelected(null);
  }, [commit, denyReadOnlyEdit]);
  const pageChange = useCallback((id, page) => patch(id, { page }), [patch]);
  const undo = useCallback((redo = false) => {
    if (denyReadOnlyEdit()) return;
    const h = history.current, from = redo ? h.future : h.past, to = redo ? h.past : h.future;
    if (!from.length) return;
    to.push(boardRef.current);
    const next = from.pop(); boardRef.current = next;
    callbacks.current.onChange(next); editGroup.current = null; clearImageCrop(); setSelected(null); historyTick((n) => n + 1);
  }, [clearImageCrop, denyReadOnlyEdit]);

  useEffect(() => {
    if (!readOnly) return;
    setMode("pan"); setSelected(null); setAreaDraft(null); setDrawingPreview(null); clearImageCrop();
  }, [readOnly, clearImageCrop]);

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
        else if (gesture.current?.kind?.startsWith("export-area") || mode === "export-area" || mode === "export-page") {
          gesture.current = null; pointers.current.clear(); setAreaDraft(null); setExportAreaPreview(null); setMode("select");
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
      if (!editing && !imageCropRef.current && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); if (!importLock.current) undo(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!importLock.current) callbacks.current.onSave(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { alive.current = false; exportTask.current?.abort(); window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [clearImageCrop, removeSelected, undo, mode]);

  useEffect(() => () => {
    if (imageCropRef.current?.url) URL.revokeObjectURL(imageCropRef.current.url);
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
  }, [pdfPreviewUrl]);

  const point = (e) => { const r = viewport.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const center = () => ({ x: viewport.current.clientWidth / 2, y: viewport.current.clientHeight / 2 });
  const setCamera = (next) => { viewRef.current = next; setView(next); };
  const touchZoom = usePinchZoom({ getView: () => viewRef.current, setView: setCamera,
    onStart: () => { gesture.current = null; pointers.current.clear(); setPreview(null); setDrawingPreview(null); setAreaDraft(null); setSowPreview(null); } });
  const zoom = (factor) => setCamera(zoomBoard(viewRef.current, center(), viewRef.current.scale * factor));
  const fit = () => setCamera(fitWhiteboard(boardRef.current, viewport.current.clientWidth, viewport.current.clientHeight));

  useEffect(() => {
    const element = viewport.current;
    const wheel = (e) => {
      if (e.target.closest("textarea,input,.wb-export-panel")) return;
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

  function resolvedExportArea(area, currentBoard = boardRef.current) {
    if (!area?.sourceItemId) return area;
    const item = currentBoard.items.find((candidate) => candidate.id === area.sourceItemId && candidate.kind === "file");
    return item ? { ...area, ...boardContentRect(item) } : area;
  }

  function addExactExportPage(item) {
    if (denyReadOnlyEdit() || item?.kind !== "file") return;
    const current = boardRef.current;
    const existing = (current.exportAreas || []).find((area) => area.sourceItemId === item.id && area.sourcePage === item.page);
    if (existing) {
      setSelected(existing.id); setShowExportPages(true); setError("");
      return;
    }
    const asset = current.assets.find((candidate) => candidate.id === item.assetId);
    if (!asset || asset.missing) {
      setError("This page's original file is unavailable on this device and cannot be selected for export.");
      return;
    }
    const baseName = (asset.name || "Whiteboard page").replace(/\.[^.]+$/, "").trim() || "Whiteboard page";
    const name = (asset.type === "application/pdf" ? `${baseName} · page ${item.page}` : baseName).slice(0, 120);
    const next = appendWhiteboardExportArea(current, boardContentRect(item), {
      name, sourceItemId: item.id, sourcePage: item.page,
    });
    if (next !== current) {
      commit(next); setSelected(next.exportAreas.at(-1)?.id || null); setShowExportPages(true); setError("");
    }
  }

  function start(e, target = null, handle = null) {
    if (busy || (e.button !== 0 && e.button !== 1)) return;
    if (readOnly && e.button === 0) target = null;
    if (imageCropRef.current && e.button === 0) return;
    e.preventDefault(); e.stopPropagation(); root.current.focus();
    if (mode === "export-page" && e.button === 0) {
      if (target?.type === "item" && target.value.kind === "file") addExactExportPage(target.value);
      else setError("Select Pages is active. Click a PDF or image page on the Whiteboard.");
      return;
    }
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
    const kind = target?.type === "export-area" && target.value.sourceItemId && e.button === 0 ? "export-area-select" :
      target?.type === "export-area" && e.button === 0 ? (handle ? "export-area-resize" : "export-area-move") :
      mode === "export-area" && e.button === 0 ? "export-area-create" :
      target?.type === "sow-logo" && e.button === 0 ? "sow-logo-resize" :
      target?.type === "sow" && handle && e.button === 0 ? "sow-resize" :
      target?.type === "sow" && e.button === 0 ? "sow-move" : drawingMode && e.button === 0 ? `draw-${mode}` :
      target?.type === "item" && mode === "select" && e.button === 0 ? (handle ? "item-resize" : "item-move") :
        target && mode === "select" && e.button === 0 ? (handle ? "drawing-resize" : "drawing-move") : "pan";
    gesture.current = { kind, p, to: p, target, handle, view: viewRef.current, color: drawingColor };
    if (kind === "draw-arrow") setDrawingPreview({ type: "arrow", screen: true, from: p, to: p, color: drawingColor });
    if (kind === "draw-rectangle") setDrawingPreview({ type: "rectangle", screen: true, rect: { x: p.x, y: p.y, w: 0, h: 0 }, color: drawingColor });
    if (kind === "export-area-create") setAreaDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    if (drawingMode) setSelected(null);
    else if (kind !== "export-area-create") { if (target) setSelected(target.value.id); else setSelected(null); }
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
    else if (g.kind === "export-area-create") {
      g.to = p;
      setAreaDraft({ x: Math.min(g.p.x, p.x), y: Math.min(g.p.y, p.y), w: Math.abs(p.x - g.p.x), h: Math.abs(p.y - g.p.y) });
    }
    else if (g.kind === "export-area-move" || g.kind === "export-area-resize") {
      const area = g.target.value, wx = dx / g.view.scale, wy = dy / g.view.scale;
      const next = g.kind === "export-area-move" ? { ...area, x: area.x + wx, y: area.y + wy } :
        resizeRectangle(area, g.handle, wx, wy, Math.max(4, 12 / g.view.scale));
      g.area = next; setExportAreaPreview(next);
    }
    else if (g.kind === "image-crop-resize") {
      const draft = resizeImageCrop(g.crop, g.handle, dx / (g.base.w * g.view.scale), dy / (g.base.h * g.view.scale), g.minW, g.minH);
      setImageCrop((current) => current ? { ...current, draft } : current);
    }
    else if (g.kind === "sow-move") {
      const next = { x: g.target.value.x + dx / g.view.scale, y: g.target.value.y + dy / g.view.scale };
      g.sow = next; setSowPreview({ id: g.target.value.id, ...next });
    }
    else if (g.kind === "sow-resize") {
      const sow = g.target.value, wx = dx / g.view.scale;
      const w = Math.max(240, Math.min(800, sow.w + (g.handle === "left" ? -wx : wx)));
      const next = g.handle === "left" ? { x: sow.x + sow.w - w, y: sow.y, w } : { x: sow.x, y: sow.y, w };
      g.sow = next; setSowPreview({ id: sow.id, ...next });
    }
    else if (g.kind === "sow-logo-resize") {
      const sow = g.target.value, wx = dx / g.view.scale;
      const logoWidth = Math.max(72, Math.min(240, sow.w - 128, sow.logoWidth + wx));
      g.sow = { logoWidth }; setSowPreview({ id: sow.id, logoWidth });
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
    if (g?.kind === "export-area-create") {
      if (!cancel && Math.abs(g.to.x - g.p.x) >= 20 && Math.abs(g.to.y - g.p.y) >= 20) {
        const { view: camera } = g;
        const x1 = (Math.min(g.p.x, g.to.x) - camera.x) / camera.scale;
        const y1 = (Math.min(g.p.y, g.to.y) - camera.y) / camera.scale;
        const x2 = (Math.max(g.p.x, g.to.x) - camera.x) / camera.scale;
        const y2 = (Math.max(g.p.y, g.to.y) - camera.y) / camera.scale;
        const next = appendWhiteboardExportArea(boardRef.current, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        if (next !== boardRef.current) { commit(next); setSelected(next.exportAreas.at(-1)?.id || null); setShowExportPages(true); }
      }
      setAreaDraft(null);
    }
    if (!cancel && g?.area) commit(updateWhiteboardExportArea(boardRef.current, g.target.value.id, g.area));
    if (!cancel && g?.changes) patch(g.target.value.id, g.changes);
    if (!cancel && g?.sow) commit(updateWhiteboardSowLayout(boardRef.current, g.sow, g.target.value.id));
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
    gesture.current = null; setPreview(null); setDrawingPreview(null); setSowPreview(null); setExportAreaPreview(null);
    if (pointers.current.size === 1) gesture.current = { kind: "pan", p: [...pointers.current.values()][0], view: viewRef.current };
  }
  function addNote(text = "", at = null) {
    if (denyReadOnlyEdit()) return;
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
  async function queueLocalFiles(list, at = null) {
    if (denyReadOnlyEdit()) return;
    const files = Array.from(list || []);
    if (!files.length) return;
    const pdfs = files.filter((file) => whiteboardFileType(file) === "application/pdf");
    if (!pdfs.length) { await addFiles(files, at); return; }
    if (localImportProbeLock.current || importLock.current) return;
    localImportProbeLock.current = true; setBusy(true); setError(""); callbacks.current.onBusyChange(true);
    let hasMultipagePdf = false;
    try {
      for (const file of pdfs) {
        let loading;
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          loading = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
          const doc = await loading.promise;
          if (doc.numPages > 1) { hasMultipagePdf = true; break; }
        } catch {
          // Let addFiles produce the normal file-specific validation error.
        } finally { await loading?.destroy().catch(() => {}); }
      }
    } finally {
      localImportProbeLock.current = false; callbacks.current.onBusyChange(false); if (alive.current) setBusy(false);
    }
    if (!alive.current) return;
    if (hasMultipagePdf) setPendingLocalImport({ files, at });
    else await addFiles(files, at);
  }
  function finishLocalPdfChoice(pdfPageMode) {
    const request = pendingLocalImport;
    setPendingLocalImport(null);
    if (request) addFiles(request.files, request.at, { pdfPageMode });
  }
  async function addFiles(list, at = null, options = {}) {
    if (denyReadOnlyEdit()) return;
    if (importLock.current || !list?.length) return;
    const focusAdded = options.focusAdded === true;
    const importAsPlan = options.importAsPlan === true;
    const pdfPageMode = options.pdfPageMode === "separate" ? "separate" : "combined";
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
          let ratio, pdfPageRatios = [];
          if (type === "application/pdf") {
            const loading = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
            try {
              const doc = await loading.promise;
              const pageNumbers = pdfPageMode === "separate" && !importAsPlan
                ? Array.from({ length: doc.numPages }, (_, index) => index + 1)
                : [1];
              if (boardRef.current.items.length + items.length + pageNumbers.length > 2000) throw new Error("Whiteboard item limit reached.");
              for (const pageNumber of pageNumbers) {
                const page = await doc.getPage(pageNumber);
                const size = page.getViewport({ scale: 1 });
                pdfPageRatios.push(size.width / size.height);
                page.cleanup();
              }
              ratio = pdfPageRatios[0];
            }
            finally { await loading.destroy(); }
          } else {
            const bitmap = await createImageBitmap(new Blob([bytes], { type }));
            ratio = bitmap.width / bitmap.height; bitmap.close();
          }
          if (!alive.current) return;
          const asset = { id: crypto.randomUUID(), name: whiteboardClipboardFileName(file, fileIndex), type, size: bytes.length, data: bytesToBase64(bytes) };
          // A page sent from Takeoff is a primary plan sheet, not a thumbnail.
          // Give it a plan-scale board footprint so the 400% camera limit still
          // leaves useful room for close detail inspection. Ordinary attachments
          // keep their compact card size.
          assets.push(asset); total += bytes.length;
          const pages = type === "application/pdf" && pdfPageMode === "separate" && !importAsPlan
            ? pdfPageRatios.map((pageRatio, index) => ({ page: index + 1, ratio: pageRatio }))
            : [{ page: 1, ratio }];
          for (const pageInfo of pages) {
            const i = items.length, w = importAsPlan && type === "application/pdf" ? 960 : 360;
            const h = Math.max(180, Math.min(importAsPlan ? 1600 : 560, w / pageInfo.ratio + 78));
            items.push({ id: crypto.randomUUID(), kind: "file", assetId: asset.id, page: pageInfo.page,
              x: origin.x + (i % 3) * (w + 30), y: origin.y + Math.floor(i / 3) * 590, w, h });
          }
        } catch (e) { errors.push(`${file.name}: ${e.message || "Couldn't read file."}`); }
      }
      if (alive.current) {
        if (items.length) {
          const next = { ...boardRef.current, assets: [...boardRef.current.assets, ...assets], items: [...boardRef.current.items, ...items] };
          commit(next); setSelected(items[items.length - 1].id);
          setCamera(focusAdded
            ? fitBoard(items, viewport.current.clientWidth, viewport.current.clientHeight, 4)
            : fitWhiteboard(next, viewport.current.clientWidth, viewport.current.clientHeight));
        }
        setError(errors.join("\n"));
      }
    } finally { importLock.current = false; callbacks.current.onBusyChange(false); if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    if (!initialFiles?.length) return;
    let cancelled = false;
    addFiles(initialFiles, null, { focusAdded: true, importAsPlan: true }).finally(() => {
      if (!cancelled) callbacks.current.onInitialFilesHandled?.();
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initialFiles are a mount-only import request.
  function paste(e) {
    if (readOnly) { e.preventDefault(); denyReadOnlyEdit(); return; }
    if (busy || importLock.current || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const content = whiteboardClipboardContent(e.clipboardData);
    if (!content.files.length && !content.text) return;
    e.preventDefault(); e.stopPropagation(); setError("");
    const at = pastePoint.current || center();
    if (content.files.length) queueLocalFiles(content.files, at);
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
  async function exportPdf(region = null, pageMode = null, quality = exportQuality) {
    if (exportTask.current || importLock.current) return;
    const controller = new AbortController();
    const nextExportMode = pageMode === "pages" ? "pages" : region ? "selection" : "single";
    exportTask.current = controller; setExportMode(nextExportMode); setError("");
    try {
      const result = await buildWhiteboardPdf(boardRef.current, { projectName,
        ...(pageMode === "pages" ? { pageMode: "pages", boardName: "Whiteboard pages" } : region ? { region, boardName: "Whiteboard selection" } : {}),
        renderer: whiteboardPdfRenderer(pdfjsLib), signal: controller.signal, quality });
      if (alive.current && !controller.signal.aborted) { downloadBytes(result.filename, result.bytes); setLastExportSize(result.bytes.length); }
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError(e.message || "Whiteboard PDF export failed. Please try again.");
    } finally { if (exportTask.current === controller) exportTask.current = null; if (alive.current) { setExportMode(null); setExportRequest(null); } }
  }
  async function exportCustomPages(previewOnly = false) {
    if (exportTask.current || importLock.current) return;
    const areas = boardRef.current.exportAreas || [];
    if (!areas.length) { setError("Add at least one PDF export area before exporting."); setShowExportPages(true); return; }
    const controller = new AbortController();
    exportTask.current = controller; setExportMode("custom"); setCustomExportProgress({ completed: 0, total: areas.length, name: "" }); setError("");
    try {
      const result = await buildWhiteboardPdf(boardRef.current, { projectName, boardName: "Whiteboard custom pages", regions: areas,
        renderer: whiteboardPdfRenderer(pdfjsLib), signal: controller.signal,
        onProgress: (progress) => { if (alive.current && !controller.signal.aborted) setCustomExportProgress(progress); } });
      if (!alive.current || controller.signal.aborted) return;
      setLastExportSize(result.bytes.length);
      if (previewOnly) {
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl(URL.createObjectURL(new Blob([result.bytes], { type: "application/pdf" })));
      } else downloadBytes(result.filename, result.bytes);
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError(e.message || "Custom Whiteboard PDF export failed. Please try again.");
    } finally {
      if (exportTask.current === controller) exportTask.current = null;
      if (alive.current) { setExportMode(null); setCustomExportProgress(null); }
    }
  }
  function locateExportArea(area) {
    setSelected(area.id); setShowExportPages(true);
    setCamera(fitBoard([resolvedExportArea(area)], viewport.current.clientWidth, viewport.current.clientHeight, 4));
  }
  function closeExportPages() {
    setShowExportPages(false);
    if (mode === "export-area" || mode === "export-page") setMode("select");
    if ((boardRef.current.exportAreas || []).some((area) => area.id === selectedRef.current)) setSelected(null);
  }
  const activeItem = board.items.find((item) => item.id === selected);
  const activeArrow = (board.arrows || []).find((arrow) => arrow.id === selected);
  const activeRectangle = (board.rectangles || []).find((rectangle) => rectangle.id === selected);
  const active = activeItem || activeArrow || activeRectangle;
  const selectedRemoveAnchor = (() => {
    if (activeItem) {
      const shown = preview?.id === activeItem.id ? { ...activeItem, ...preview } : activeItem;
      return { x: view.x + (shown.x + shown.w) * view.scale, y: view.y + shown.y * view.scale };
    }
    if (activeArrow) {
      const shown = drawingPreview?.type === "arrow" && drawingPreview.id === activeArrow.id ? drawingPreview.drawing : activeArrow;
      return { x: view.x + Math.max(shown.from[0], shown.to[0]) * view.scale, y: view.y + Math.min(shown.from[1], shown.to[1]) * view.scale };
    }
    if (activeRectangle) {
      const shown = drawingPreview?.type === "rectangle" && drawingPreview.id === activeRectangle.id ? drawingPreview.drawing : activeRectangle;
      return { x: view.x + (shown.x + shown.w) * view.scale, y: view.y + shown.y * view.scale };
    }
    return null;
  })();
  const assets = new Map(board.assets.map((asset) => [asset.id, asset]));
  const activeAsset = activeItem?.kind === "file" ? assets.get(activeItem.assetId) : null;
  const canCropImage = !!activeAsset?.type?.startsWith("image/") && !activeAsset.missing;
  const hasPdf = board.assets.some((asset) => asset.type === "application/pdf");
  const drawingCount = (board.arrows?.length || 0) + (board.rectangles?.length || 0);
  const exportTaskLabel = exportMode === "custom" ? `Exporting PDF page ${Math.min((customExportProgress?.completed || 0) + 1, customExportProgress?.total || 1)} of ${customExportProgress?.total || (board.exportAreas?.length || 1)}…`
    : exportMode === "pages" ? "Exporting whiteboard pages…"
    : exportMode === "selection" ? "Exporting selected whiteboard area…"
      : exportMode === "single" ? "Exporting whiteboard PDF…" : "";
  const longTaskLabel = exportTaskLabel || (busy ? "Adding files to the whiteboard…" : saveState === "saving" ? "Saving whiteboard…" : "");
  return createPortal(<section className={`wb${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Whiteboard" tabIndex={-1} ref={root}
    onPaste={paste}
    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
    <LongTaskLoader active={!!longTaskLabel} label={longTaskLabel} delay={saveState === "saving" && !busy && !exporting ? 800 : 350} variant="fixed" />
    {exportMode === "custom" && <button type="button" className="wb-export-cancel" onClick={() => exportTask.current?.abort()}>Cancel PDF export</button>}
    {pdfPreviewUrl && <div className="wb-pdf-preview" role="dialog" aria-modal="true" aria-label="PDF export preview">
      <header><strong>PDF export preview</strong><button type="button" onClick={() => setPdfPreviewUrl("")} aria-label="Close PDF preview">×</button></header>
      <iframe src={pdfPreviewUrl} title="Whiteboard PDF export preview" />
    </div>}
    {pendingLocalImport && <div className="wb-import-choice-shade" role="presentation" onPointerDown={(event) => event.stopPropagation()}>
      <section className="wb-import-choice" role="dialog" aria-modal="true" aria-labelledby="wb-import-choice-title">
        <header><div><small>LOCAL PDF</small><h2 id="wb-import-choice-title">How should the PDF pages be added?</h2></div>
          <button type="button" aria-label="Cancel PDF import" onClick={() => setPendingLocalImport(null)}>×</button></header>
        <p><strong>Separate pages</strong> creates an individual Whiteboard card for every PDF page. <strong>All pages in one</strong> creates one card with page controls.</p>
        <div className="wb-import-choice-actions">
          <button type="button" className="is-primary" onClick={() => finishLocalPdfChoice("separate")}>
            <Icon name="document" size={17} />Separate pages
          </button>
          <button type="button" onClick={() => finishLocalPdfChoice("combined")}>
            <Icon name="document" size={17} />All pages in one
          </button>
        </div>
      </section>
    </div>}
    {exportRequest && <PdfExportDialog title={exportRequest.title} scopeLabel={exportRequest.scopeLabel}
      defaultQuality={exportQuality} busy={exporting}
      estimateFor={(quality) => estimateWhiteboardSize(boardRef.current, exportRequest, quality)}
      onExport={(quality) => { const saved = savePdfExportQuality(quality); setExportQuality(saved); exportPdf(exportRequest.region, exportRequest.pageMode, saved); }}
      onClose={() => { if (!exporting) setExportRequest(null); }} />}
    {toolbarHidden && <Button icon="chevronDown" className="wb-toolbar-reveal" label="Show toolbar" onClick={() => setToolbarHidden(false)} />}
    <div className="wb-toolbar-overlay" ref={toolbarRef} hidden={toolbarHidden}>
    <header className="wb-header">
      <Button icon="chevronLeft" label="Close whiteboard" onClick={onClose} disabled={busy} />
      <div className="wb-title"><strong>Whiteboard</strong><span>{projectName || "Untitled project"}</span></div>
      <div className="wb-primary-tools">

      {hasPdf && <>
        <label className="wb-resolution" title="Higher PDF preview resolution is sharper when zoomed in but takes longer to render and more memory.">
          <span>PDF detail</span>
          <input type="range" min="1" max="3" step="1" value={pdfResolution} aria-label="PDF preview resolution"
            onChange={(e) => setPdfResolution(Number(e.target.value))} />
          <output>{pdfResolution}×</output>
        </label>
      </>}
      </div>
      <div className="wb-actions">
        <ToolMenu title="Add" face={<><Icon name="plus" size={16} /><span>Add</span></>} disabled={busy || readOnly}
          menuStyle={{ minWidth: 190 }}
          items={[
            { label: "Add files", icon: "plus", onSelect: () => input.current.click() },
            { label: "Take photo", icon: "camera", onSelect: () => cameraInput.current?.click() },
            { label: "Note", icon: "textNote", disabled: board.items.length >= 2000, onSelect: () => addNote() },
            { label: "SOW panel", icon: "plus", onSelect: () => commit(addWhiteboardSowPanel(boardRef.current)) },
          ]} />
        <ToolMenu title="Export" face={<><Icon name="document" size={17} /><span>{exporting ? "Exporting…" : "Export"}</span></>} disabled={busy || exporting}
          menuStyle={{ right: 0, left: "auto", minWidth: 250 }}
          items={[
            { label: "Export whiteboard as PDF", icon: "document", onSelect: () => setExportRequest({ title: "Export whiteboard as PDF", scopeLabel: "Entire whiteboard · one flattened visual PDF page", region: null, pageMode: null }) },
            { label: "Select Content to Export", icon: "fullscreen", disabled: readOnly, onSelect: () => { if (showExportPages) closeExportPages(); else { setShowExportPages(true); setMode("export-area"); } } },
          ]} />
      </div>
      <div className="wb-header-utilities">
        <span className="wb-header-item-count">{board.items.length + drawingCount} Items</span>
      <span className="wb-status" role="status" aria-hidden={longTaskLabel ? "true" : undefined}>{exportMode === "custom" ? exportTaskLabel : exportMode === "pages" ? "Exporting pages..." : exportMode === "selection" ? "Exporting selection..." : exportMode === "single" ? "Exporting PDF..." : busy ? "Adding files..." : saveState === "saving" ? "Saving..." : lastExportSize ? `Last export ${formatFileSize(lastExportSize)}` : saveState === "saved" ? "Saved ✓" : ""}</span>
        <Button icon="eye" label="Hide toolbar" onClick={() => setToolbarHidden(true)} />
      <Button icon="undo" label="Undo whiteboard change" disabled={busy || readOnly || !!imageCrop || !history.current.past.length} onClick={() => undo()} />
      <Button icon="undo" className="wb-redo" label="Redo whiteboard change" disabled={busy || readOnly || !!imageCrop || !history.current.future.length} onClick={() => undo(true)} />
        <output className="wb-header-zoom" aria-label="Whiteboard zoom">Zoom {Math.round(view.scale * 100)}%</output>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="Take a work photo" hidden
        onChange={(event) => { if (event.target.files?.length) addFiles(event.target.files); event.target.value = ""; }} />
      <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp" aria-label="Whiteboard files" hidden
        onChange={(e) => { queueLocalFiles(e.target.files); e.target.value = ""; }} />
    </header>
    <div className="wb-tools">
      {imageCrop && <div className="wb-crop-actions" role="group" aria-label="Image crop actions">
        <Button icon="check" className="is-primary" label="Apply image crop" onClick={applyImageCrop}>Apply crop</Button>
        <Button icon="close" label="Cancel image crop" onClick={clearImageCrop}>Cancel</Button>
      </div>}
      {(mode === "arrow" || mode === "rectangle") && <div className="wb-colors wb-arrow-colors" role="group" aria-label={`${mode === "arrow" ? "Arrow" : "Rectangle"} color`}>
        {ARROW_COLORS.map(({ name, value }) => <button key={value} type="button" aria-label={`${name} ${mode} color`} title={`${name} ${mode} color`} aria-pressed={drawingColor === value}
          style={{ backgroundColor: value }} onClick={() => setDrawingColor(value)} />)}
      </div>}
      {active && !imageCrop && <>
        {canCropImage && <Button icon="crop" label={activeItem.crop ? "Adjust image crop" : "Crop image"} disabled={busy || readOnly} onClick={beginImageCrop}>{activeItem.crop ? "Adjust crop" : "Crop"}</Button>}
        {activeItem?.kind === "note" && <div className="wb-colors" role="group" aria-label="Note color">{Object.entries(NOTE_COLORS).map(([name, color]) =>
          <button type="button" key={name} aria-label={`${name} note`} title={`${name} note`} aria-pressed={activeItem.color === name} style={{ background: color }} onClick={() => patch(selected, { color: name })} />)}</div>}
      </>}

    </div>
    </div>
    {error && <div className="wb-error" role="alert"><span>{error}</span><Button icon="close" label="Dismiss whiteboard error" onClick={() => setError("")} /></div>}
    <div ref={viewport} {...touchZoom} className={`wb-viewport${mode === "pan" ? " is-pan" : ""}${mode === "arrow" ? " is-arrow" : ""}${mode === "rectangle" ? " is-rectangle" : ""}${mode === "export-area" ? " is-crop" : ""}${mode === "export-page" ? " is-export-page" : ""}${imageCrop ? " is-image-crop" : ""}`} aria-label="Whiteboard canvas"
      style={{ backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={(e) => { pastePoint.current = point(e); start(e); }} onPointerMove={(e) => { pastePoint.current = point(e); move(e); }} onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); queueLocalFiles(e.dataTransfer.files, point(e)); }}>
      {!board.items.length && !drawingCount && <div className="wb-empty"><Icon name="document" size={36} /><strong>No notes yet</strong><span>Paste text, images or supported files, or add them manually.</span><button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => input.current.click()} disabled={busy || readOnly}><Icon name="plus" size={16} />Add PDFs or images</button></div>}
      {board.items.map((saved) => {
        const item = preview?.id === saved.id ? { ...saved, ...preview } : saved;
        const asset = assets.get(item.assetId);
        const itemHeaderColor = whiteboardFileHeaderColor(item.headerColor);
        const itemHeaderStyle = itemHeaderColor ? { backgroundColor: itemHeaderColor, color: whiteboardFileHeaderTextColor(itemHeaderColor) } : undefined;
        const x = view.x + item.x * view.scale, y = view.y + item.y * view.scale;
        const visible = x < viewportSize.width + 200 && y < viewportSize.height + 200 && x + item.w * view.scale > -200 && y + item.h * view.scale > -200;
        const pagePicked = item.kind === "file" && (board.exportAreas || []).some((area) => area.sourceItemId === item.id && area.sourcePage === item.page);
        return <article key={item.id} className={`wb-item${item.id === selected ? " is-selected" : ""}${item.kind === "note" ? " wb-note" : ""}${mode === "export-page" && item.kind === "file" ? " is-export-page-target" : ""}${mode === "export-page" && pagePicked ? " is-export-page-picked" : ""}`}
          aria-label={item.kind === "note" ? "Text note" : asset?.name} onPointerDown={(e) => start(e, { type: "item", value: item })}
          style={{ width: item.w, height: item.h, transform: `translate(${view.x + item.x * view.scale}px, ${view.y + item.y * view.scale}px) scale(${view.scale})`, ...(item.kind === "note" ? { background: NOTE_COLORS[item.color] } : {}) }}>
          <div className="wb-item-title wb-color-title" title={asset?.name || item.title || "Note"}
            style={{ ...(itemHeaderStyle || {}), paddingRight: `calc(12px + ${87 / view.scale}px)` }}>
            <Icon name={item.kind === "note" ? "textNote" : "document"} size={15} />
            {item.kind === "note" ? <input className="wb-note-title" type="text" aria-label="Note title" maxLength={120}
              readOnly={readOnly}
              value={item.title ?? "Note"} placeholder="Note" onPointerDown={(e) => { e.stopPropagation(); setSelected(item.id); }}
              onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => patch(item.id, { title: e.target.value }, `title:${item.id}`)}
              onBlur={() => { editGroup.current = null; }} /> : <span>{asset?.name}</span>}
            <HeaderColorButtons itemLabel={item.kind === "note" ? (item.title || "Note") : (asset?.name || "file")} color={itemHeaderColor} scale={view.scale}
              onChange={(color) => commit(setWhiteboardItemHeaderColor(boardRef.current, item.id, color))} />
          </div>
          {item.kind === "note" ? <textarea aria-label="Note text" value={item.text} maxLength={100000} spellCheck
            readOnly={readOnly}
            onPointerDown={(e) => { if (mode !== "select") start(e); else { e.stopPropagation(); setSelected(item.id); } }}
            onChange={(e) => patch(item.id, { text: e.target.value }, item.id)} onBlur={() => { editGroup.current = null; }} /> :
            asset && <FileCard asset={asset} item={item} onPage={pageChange} visible={visible}
              resolution={asset.type === "application/pdf" ? pdfResolution : 1} refreshKey={asset.type === "application/pdf" ? pdfRefreshKey : 0} />}
          {mode === "export-page" && item.kind === "file" && <span className="wb-export-page-target-label" aria-hidden="true">{pagePicked ? "Added to PDF" : "Select this page"}</span>}
          <button type="button" className="wb-resize" aria-label={`Resize ${asset?.name || "note"}`} title="Resize" disabled={readOnly} onPointerDown={(e) => start(e, { type: "item", value: item }, "se")}><Icon name="fullscreen" size={13} /></button>
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
      {selectedRemoveAnchor && !imageCrop && <button type="button" className="wb-selected-remove"
        aria-label="Remove selected object" disabled={busy || readOnly}
        style={{ left: selectedRemoveAnchor.x, top: selectedRemoveAnchor.y }}
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); removeSelected(active?.id); }}
        onClick={(event) => event.stopPropagation()}>Remove</button>}
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
      {showExportPages && (board.exportAreas || []).map((saved, index) => {
        const area = saved.sourceItemId ? resolvedExportArea(saved) : exportAreaPreview?.id === saved.id ? exportAreaPreview : saved;
        const x = view.x + area.x * view.scale, y = view.y + area.y * view.scale;
        return <div key={saved.id} className={`wb-export-area${selected === saved.id ? " is-selected" : ""}`}
          aria-label={`PDF export Page ${index + 1}, ${saved.name}`} onPointerDown={(event) => start(event, { type: "export-area", value: area })}
          style={{ left: x, top: y, width: area.w * view.scale, height: area.h * view.scale }}>
          <span>Page {index + 1}</span>
          {selected === saved.id && !saved.sourceItemId && RECTANGLE_HANDLES.map((handle) => <button key={handle} type="button" className="wb-export-area-handle"
            data-handle={handle} aria-label={`Resize Page ${index + 1} ${handle}`} onPointerDown={(event) => start(event, { type: "export-area", value: area }, handle)} />)}
        </div>;
      })}
      {areaDraft && <div className="wb-export-area is-draft" aria-hidden="true" style={{ left: areaDraft.x, top: areaDraft.y, width: areaDraft.w, height: areaDraft.h }} />}
      {(board.sows || []).map((sow) => {
        const panelPreview = sowPreview?.id === sow.id ? sowPreview : null;
        return <SOWPanel key={sow.id} board={board} sow={sow} readOnly={readOnly} onCommit={commit} onEditEnd={() => { editGroup.current = null; }} onError={setError}
          position={{ x: view.x + (panelPreview?.x ?? sow.x) * view.scale, y: view.y + (panelPreview?.y ?? sow.y) * view.scale,
            w: panelPreview?.w ?? sow.w, logoWidth: panelPreview?.logoWidth ?? sow.logoWidth, scale: view.scale }}
          onStartMove={(event) => start(event, { type: "sow", value: sow })}
          onStartLogoResize={(event) => start(event, { type: "sow-logo", value: sow })}
          onStartResize={(event, handle) => start(event, { type: "sow", value: sow }, handle)} />;
      })}
      {showExportPages && <aside className="wb-export-panel" aria-label="PDF Export Pages" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><h2>PDF Export Pages</h2></div><button type="button" aria-label="Close PDF Export Pages" onClick={closeExportPages}>×</button></header>
        <div className={`wb-export-mode-hint${mode === "export-area" || mode === "export-page" ? " is-active" : ""}`} role="status">
          {mode === "export-page" ? "Select Pages is on — click any PDF or image page to add its exact bounds."
            : mode === "export-area" ? "Add Area is on — drag a rectangle anywhere on the Whiteboard."
              : "Choose Add Area for a custom crop or Select Pages for exact page bounds."}
        </div>
        <div className="wb-export-page-list">
          {!(board.exportAreas || []).length && <p>Add a custom area, or select a PDF/image page for an exact page-sized export.</p>}
          {(board.exportAreas || []).map((area, index) => <section key={area.id} className={selected === area.id ? "is-selected" : ""}>
            <button type="button" className="wb-export-locate" onClick={() => locateExportArea(area)} title={`Locate Page ${index + 1}`}><b>Page {index + 1}</b></button>
            <input value={area.name} maxLength={120} aria-label={`Name for PDF Page ${index + 1}`} readOnly={readOnly}
              onFocus={() => setSelected(area.id)} onChange={(event) => commit(updateWhiteboardExportArea(boardRef.current, area.id, { name: event.target.value }), `export-name:${area.id}`)}
              onBlur={() => { editGroup.current = null; }} />
            <select value={area.orientation} aria-label={`Orientation for PDF Page ${index + 1}`} disabled={readOnly}
              onChange={(event) => commit(updateWhiteboardExportArea(boardRef.current, area.id, { orientation: event.target.value }))}>
              {EXPORT_ORIENTATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="wb-export-page-actions">
              <Button icon="chevronUp" label={`Move Page ${index + 1} up`} disabled={!index || exporting} onClick={() => commit(moveWhiteboardExportArea(boardRef.current, area.id, "up"))} />
              <Button icon="chevronDown" label={`Move Page ${index + 1} down`} disabled={index === board.exportAreas.length - 1 || exporting} onClick={() => commit(moveWhiteboardExportArea(boardRef.current, area.id, "down"))} />
              <Button icon="duplicate" label={`Duplicate Page ${index + 1}`} disabled={exporting} onClick={() => commit(duplicateWhiteboardExportArea(boardRef.current, area.id))} />
              <Button icon="close" label={`Delete Page ${index + 1}`} disabled={exporting} onClick={() => { commit(removeWhiteboardExportArea(boardRef.current, area.id)); if (selected === area.id) setSelected(null); }} />
            </div>
          </section>)}
        </div>
        {(board.exportAreas || []).length > 0 && (() => {
          const activeArea = board.exportAreas.find((area) => area.id === selected) || board.exportAreas[0];
          const update = (changes) => commit(updateWhiteboardExportArea(boardRef.current, activeArea.id, changes));
          return <div className="wb-export-settings">
            <label>Page size<select value={activeArea.pageSize} onChange={(event) => update({ pageSize: event.target.value })}>{EXPORT_PAGE_SIZES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Quality<select value={activeArea.quality} onChange={(event) => update({ quality: event.target.value })}>{EXPORT_QUALITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Fit<select value={activeArea.fit} onChange={(event) => update({ fit: event.target.value })}>
              <option value="fit">Fit to page</option><option value="actual" disabled>Actual scale — calibration unavailable</option>
            </select></label>
            <small>{activeArea.sourceItemId ? "This exact page stays linked to its Whiteboard card and selected PDF page. " : ""}Settings apply to the selected page. Content is always kept proportional.</small>
          </div>;
        })()}
        <footer>
          <button type="button" className="wb-export-method" aria-pressed={mode === "export-area"} onClick={() => { setMode(mode === "export-area" ? "select" : "export-area"); setShowExportPages(true); }} disabled={exporting}><Icon name="plus" size={14} />Add Area</button>
          <button type="button" className="wb-export-method" aria-pressed={mode === "export-page"} onClick={() => { setMode(mode === "export-page" ? "select" : "export-page"); setShowExportPages(true); }} disabled={exporting}><Icon name="document" size={14} />Select Pages</button>
          <button type="button" className="wb-export-clear" onClick={() => { commit(clearWhiteboardExportAreas(boardRef.current)); setSelected(null); }} disabled={exporting || !(board.exportAreas || []).length}>Clear All</button>
          <button type="button" className="wb-export-preview" onClick={() => exportCustomPages(true)} disabled={exporting || !(board.exportAreas || []).length}>Preview PDF</button>
          <button type="button" className="is-primary wb-export-download" onClick={() => exportCustomPages(false)} disabled={exporting || !(board.exportAreas || []).length}>Export All to One PDF</button>
        </footer>
      </aside>}
    </div>
    <div className="wb-zoom-controls" role="group" aria-label="Whiteboard zoom controls">
      <Button icon="select" label="Select and move" disabled={!!imageCrop || readOnly} aria-pressed={mode === "select"} onClick={() => setMode("select")} />
      <Button icon="pan" label="Pan whiteboard" disabled={!!imageCrop} aria-pressed={mode === "pan"} onClick={() => setMode("pan")} />
      <Button icon="arrow" label="Draw arrow" disabled={!!imageCrop || readOnly} aria-pressed={mode === "arrow"} onClick={() => setMode(mode === "arrow" ? "select" : "arrow")} />
      <Button icon="rectTool" label="Draw rectangle" disabled={!!imageCrop || readOnly} aria-pressed={mode === "rectangle"} onClick={() => setMode(mode === "rectangle" ? "select" : "rectangle")} />
      <button type="button" title="Zoom in whiteboard" aria-label="Zoom in whiteboard" onClick={() => zoom(1.2)}>+</button>
      <button type="button" title="Zoom out whiteboard" aria-label="Zoom out whiteboard" onClick={() => zoom(1 / 1.2)}>−</button>
      <button type="button" title="Fit whiteboard" aria-label="Fit whiteboard" onClick={fit}>fit</button>
    </div>
  </section>, document.body);
}
