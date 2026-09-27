import { base64ToBytes, validateWhiteboard } from "./whiteboard.js";
import { projectFilename } from "./projectFile.js";

// Whiteboard.jsx renders w/h directly as CSS lengths before its camera scale.
// These are NOT the normalized coordinates used by the takeoff canvas.
export const BOARD_POINT_SCALE = 72 / 96;
export const MAX_BOARD_PDF_POINTS = 14400;
export const BOARD_EXPORT_SCALE = 3;
export const MAX_BOARD_RASTER_PIXELS = 16_000_000;
const MAX_TOTAL_RASTER_PIXELS = 64_000_000;

/** @typedef {{x: number, y: number, w: number, h: number}} BoardRect */
/** @typedef {BoardRect & {id: string, kind: string, text: string, color: string}} BoardNote */
/** @typedef {{
 * renderNote?: (item: BoardNote, rect: BoardRect, signal?: AbortSignal) => Promise<Uint8Array>,
 * readImage?: (bytes: Uint8Array, type: string, signal?: AbortSignal) => Promise<{bytes: Uint8Array, type: string, width: number, height: number}>,
 * renderPdfPage?: (bytes: Uint8Array, page: number, rect: BoardRect, signal?: AbortSignal) => Promise<Uint8Array>
 * }} BoardPdfRenderer */

export function checkBoardRaster(width, height) {
  const w = Math.ceil(width), h = Math.ceil(height);
  if (![w, h].every(Number.isFinite) || w <= 0 || h <= 0 || w > 8192 || h > 8192 || w * h > MAX_BOARD_RASTER_PIXELS) {
    throw new Error("An export image exceeds the 16-megapixel / 8192-pixel limit. Resize that note or attach a smaller image.");
  }
  return { width: w, height: h };
}

export function boardPdfBounds(rects) {
  if (!rects.length) throw new Error("Nothing to export");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y, w, h } of rects) {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error("Invalid whiteboard content bounds.");
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  const width = (maxX - minX) * BOARD_POINT_SCALE, height = (maxY - minY) * BOARD_POINT_SCALE;
  if (width > MAX_BOARD_PDF_POINTS || height > MAX_BOARD_PDF_POINTS) {
    throw new Error("Whiteboard exceeds the single-page PDF limit (19,200 board units per side). Move items closer together or resize them; no content was cropped or scaled.");
  }
  if (width < .01 || height < .01) throw new Error("Whiteboard content is too small to export.");
  return { minX, minY, maxX, maxY, width, height };
}

// The card's drag header, border and pagination are editor chrome. Export the
// content at its existing world position, using the canonical 100% card layout.
/** @param {BoardRect & {kind: string}} item
 * @param {{width: number, height: number} | null} source */
export function boardContentRect(item, source = null) {
  const rect = { x: item.x + 1, y: item.y + 39, w: item.w - 2, h: item.h - 40 - (item.kind === "file" ? 40 : 0) };
  if (!source) return rect;
  const scale = Math.min(1, rect.w / source.width, rect.h / source.height);
  const w = source.width * scale, h = source.height * scale;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

export function boardPdfPlacement(rect, bounds) {
  return { x: (rect.x - bounds.minX) * BOARD_POINT_SCALE, y: (bounds.maxY - rect.y - rect.h) * BOARD_POINT_SCALE,
    width: rect.w * BOARD_POINT_SCALE, height: rect.h * BOARD_POINT_SCALE };
}

export function whiteboardPdfFilename(projectName, boardName = "Whiteboard") {
  return `${projectFilename(projectName).slice(0, -4)} - ${projectFilename(boardName).slice(0, -4)}.pdf`;
}

function exportSnapshot(board) {
  const snapshot = structuredClone(board);
  if (!Array.isArray(snapshot?.items)) throw new Error("Invalid whiteboard data.");
  snapshot.items = snapshot.items.filter((item) => !item.hidden && item.visible !== false && !item.deleted);
  if (!snapshot.items.length) throw new Error("Nothing to export");
  for (const item of snapshot.items) {
    // Fail closed for future scene types instead of silently exporting only
    // their untransformed boxes. Today's board supports note/file cards only.
    if (!["note", "file"].includes(item.kind) || ["rotation", "scale", "scaleX", "scaleY", "transform", "children", "clip", "mask", "stroke", "strokeWidth", "opacity"].some((key) => item[key] !== undefined)) {
      throw new Error(`Item ${item.id || "(unnamed)"} uses an unsupported whiteboard type or effect. Export supports the current note and file cards only.`);
    }
  }
  validateWhiteboard(snapshot);
  return snapshot;
}

/** Export an isolated model, never the current viewport or preview canvases.
 * Browser-only decoding/text layout is injected so geometry and PDF boxes can
 * also be tested without a browser. No adapter receives the live board object.
 * @param {object} board
 * @param {{projectName?: string, boardName?: string, renderer?: BoardPdfRenderer, signal?: AbortSignal}} options
 */
export async function buildWhiteboardPdf(board, { projectName, boardName = "Whiteboard", renderer, signal } = {}) {
  const snapshot = exportSnapshot(board);
  const checkCancelled = () => signal?.throwIfAborted();
  checkCancelled();
  const { PDFDocument, PDFName, PDFNumber, rgb, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${projectName || "Untitled project"} - ${boardName}`);
  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const files = new Map(), prepared = [];
  let rasterPixels = 0;
  const budget = (w, h) => {
    const size = checkBoardRaster(w, h);
    rasterPixels += size.width * size.height;
    if (rasterPixels > MAX_TOTAL_RASTER_PIXELS) throw new Error("Whiteboard export exceeds the 64-megapixel image budget. Use smaller attachments or notes and try again.");
    return size;
  };
  for (const item of snapshot.items) {
    checkCancelled();
    const asset = assets.get(item.assetId), label = asset?.name || `Note ${item.id}`;
    try {
      if (item.kind === "note") {
        const rect = boardContentRect(item);
        budget(rect.w * BOARD_EXPORT_SCALE, rect.h * BOARD_EXPORT_SCALE);
        prepared.push({ item, rect });
        continue;
      }
      const key = asset.type === "application/pdf" ? `${asset.id}:${item.page}` : asset.id;
      let file = files.get(key);
      if (!file) {
        if (asset.type === "application/pdf") {
          let source = files.get(`pdf:${asset.id}`);
          if (!source) {
            const bytes = base64ToBytes(asset.data);
            source = { pdf: await PDFDocument.load(bytes), bytes }; files.set(`pdf:${asset.id}`, source);
          }
          const { pdf, bytes } = source;
          if (item.page > pdf.getPageCount()) throw new Error(`Page ${item.page} does not exist. Choose an available page.`);
          const page = pdf.getPage(item.page - 1), crop = page.getCropBox(), media = page.getMediaBox();
          let box = { left: Math.max(crop.x, media.x), bottom: Math.max(crop.y, media.y), right: Math.min(crop.x + crop.width, media.x + media.width), top: Math.min(crop.y + crop.height, media.y + media.height) };
          if (box.right <= box.left || box.top <= box.bottom) box = { left: media.x, bottom: media.y, right: media.x + media.width, top: media.y + media.height };
          const rotation = ((page.getRotation().angle % 360) + 360) % 360;
          if (![0, 90, 180, 270].includes(rotation)) throw new Error("Unsupported PDF page rotation.");
          const unit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() || 1;
          const nativeW = (rotation % 180 ? box.top - box.bottom : box.right - box.left) * unit;
          const nativeH = (rotation % 180 ? box.right - box.left : box.top - box.bottom) * unit;
          // Match FilePreview's intrinsic canvas, including its integer rounding.
          const previewScale = Math.min(2, 1400 / Math.max(nativeW, nativeH));
          const width = Math.ceil(nativeW * previewScale), height = Math.ceil(nativeH * previewScale);
          // embedPage does not copy annotations, optional-content configuration,
          // or a page transparency group. Flatten just these pages with PDF.js.
          const raster = !!(page.node.Annots()?.size() || page.node.has(PDFName.of("Group")) || pdf.catalog.has(PDFName.of("OCProperties")));
          const embedded = !raster && page.node.Contents() ? await doc.embedPage(page, box) : null;
          file = { kind: "pdf", embedded, raster, bytes, page: item.page, rotation, width, height };
        } else {
          if (!renderer?.readImage) throw new Error("Image decoder is unavailable. Reload the app and try again.");
          const image = await renderer.readImage(base64ToBytes(asset.data), asset.type, signal);
          budget(image.width, image.height);
          const embedded = image.type === "image/jpeg" ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes);
          file = { kind: "image", embedded, width: image.width, height: image.height };
        }
        files.set(key, file);
      }
      const rect = boardContentRect(item, file);
      if (file.raster) budget(rect.w * BOARD_EXPORT_SCALE, rect.h * BOARD_EXPORT_SCALE);
      prepared.push({ item, file, rect });
    } catch (error) {
      checkCancelled();
      throw new Error(`${label}: ${error.message || "Could not read attachment. Re-add the file and try again."}`, { cause: error });
    }
  }
  const bounds = boardPdfBounds(prepared.map(({ rect }) => rect));
  const page = doc.addPage([bounds.width, bounds.height]);
  for (const setBox of ["setMediaBox", "setCropBox", "setTrimBox", "setBleedBox", "setArtBox"]) page[setBox](0, 0, bounds.width, bounds.height);
  page.drawRectangle({ x: 0, y: 0, width: bounds.width, height: bounds.height, color: rgb(1, 1, 1) });
  for (const { item, file, rect } of prepared) {
    checkCancelled();
    const place = boardPdfPlacement(rect, bounds);
    try {
      if (!file || file.raster) {
        const png = !file ? await renderer?.renderNote(item, rect, signal) : await renderer?.renderPdfPage(file.bytes, file.page, rect, signal);
        if (!png) throw new Error("Export renderer is unavailable. Reload the app and try again.");
        checkCancelled();
        page.drawImage(await doc.embedPng(png), place);
      } else if (file.kind === "image") {
        // Transparent image pixels sit on the same white backing as FilePreview.
        page.drawRectangle({ ...place, color: rgb(1, 1, 1) });
        page.drawImage(file.embedded, place);
      }
      else {
        // A PDF page is opaque white in FilePreview, including blank PDF pages.
        page.drawRectangle({ ...place, color: rgb(1, 1, 1) });
        if (file.embedded) {
          const { x, y, width: w, height: h } = place;
          const origins = { 0: [x, y], 90: [x, y + h], 180: [x + w, y + h], 270: [x + w, y] };
          page.drawPage(file.embedded, { x: origins[file.rotation][0], y: origins[file.rotation][1],
            width: file.rotation % 180 ? h : w, height: file.rotation % 180 ? w : h, rotate: degrees(-file.rotation) });
        }
      }
    } catch (error) {
      checkCancelled();
      throw new Error(`${assets.get(item.assetId)?.name || `Note ${item.id}`}: ${error.message || "Export failed. Try again."}`, { cause: error });
    }
  }
  checkCancelled();
  return { bytes: await doc.save(), filename: whiteboardPdfFilename(projectName, boardName), bounds };
}
