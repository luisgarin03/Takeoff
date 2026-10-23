import { base64ToBytes, validateWhiteboard, whiteboardDrawingBounds, whiteboardImageCrop } from "./whiteboard.js";
import { projectFilename } from "./projectFile.js";
import { whiteboardPdfLayoutSize } from "./whiteboardPdfPreview.js";
import { pdfExportQuality } from "./exportQuality.js";

// Whiteboard.jsx renders w/h directly as CSS lengths before its camera scale.
// These are NOT the normalized coordinates used by the takeoff canvas.
export const BOARD_POINT_SCALE = 72 / 96;
export const MAX_BOARD_PDF_POINTS = 14400;
export const BOARD_EXPORT_SCALE = 3;
export const MAX_BOARD_RASTER_PIXELS = 16_000_000;
export const WHITEBOARD_PAGE_WIDTH = 792;
export const WHITEBOARD_PAGE_HEIGHT = 612;
export const WHITEBOARD_PAGE_MARGIN = 18;
export const WHITEBOARD_PAGE_CONTENT_WIDTH = WHITEBOARD_PAGE_WIDTH - WHITEBOARD_PAGE_MARGIN * 2;
export const WHITEBOARD_PAGE_CONTENT_HEIGHT = WHITEBOARD_PAGE_HEIGHT - WHITEBOARD_PAGE_MARGIN * 2;
export const WHITEBOARD_PAGE_TILE_WIDTH = WHITEBOARD_PAGE_CONTENT_WIDTH / BOARD_POINT_SCALE;
export const WHITEBOARD_PAGE_TILE_HEIGHT = WHITEBOARD_PAGE_CONTENT_HEIGHT / BOARD_POINT_SCALE;
export const MAX_WHITEBOARD_PAGES = 500;
const MAX_TOTAL_RASTER_PIXELS = 64_000_000;
const BOARD_ARROW_STROKE = 2.5;
const BOARD_ARROW_HEAD = 14;
const BOARD_ARROW_HEAD_HALF = .42;
const CUSTOM_PAGE_SIZES = Object.freeze({
  letter: [612, 792], legal: [612, 1008], tabloid: [792, 1224],
  "arch-d": [1728, 2592], "arch-e": [2592, 3456],
});

/** @typedef {{x: number, y: number, w: number, h: number}} BoardRect */
/** @typedef {BoardRect & {id: string, kind: string, text: string, color: string}} BoardNote */
/** @typedef {{
 * renderNote?: (item: BoardNote, rect: BoardRect, signal?: AbortSignal, quality?: object) => Promise<Uint8Array>,
 * renderSow?: (sow: object, brandingAsset?: object | null, signal?: AbortSignal, quality?: object) => Promise<{bytes: Uint8Array, width: number, height: number, layoutWidth: number, layoutHeight: number}>,
 * readImage?: (bytes: Uint8Array, type: string, crop?: {x:number,y:number,w:number,h:number} | null, signal?: AbortSignal, quality?: object) => Promise<{bytes: Uint8Array, type: string, width: number, height: number, layoutWidth?: number, layoutHeight?: number}>,
 * renderPdfPage?: (bytes: Uint8Array, page: number, rect: BoardRect, signal?: AbortSignal, quality?: object) => Promise<Uint8Array | {bytes: Uint8Array, type: "image/png" | "image/jpeg"}>
 * }} BoardPdfRenderer */

export function checkBoardRaster(width, height) {
  const w = Math.ceil(width), h = Math.ceil(height);
  if (![w, h].every(Number.isFinite) || w <= 0 || h <= 0 || w > 8192 || h > 8192 || w * h > MAX_BOARD_RASTER_PIXELS) {
    throw new Error("An export image exceeds the 16-megapixel / 8192-pixel limit. Resize that note or attach a smaller image.");
  }
  return { width: w, height: h };
}

function boardPdfBoundsUnchecked(rects) {
  if (!rects.length) throw new Error("Nothing to export");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y, w, h } of rects) {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error("Invalid whiteboard content bounds.");
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  const width = (maxX - minX) * BOARD_POINT_SCALE, height = (maxY - minY) * BOARD_POINT_SCALE;
  if (width < .01 || height < .01) throw new Error("Whiteboard content is too small to export.");
  return { minX, minY, maxX, maxY, width, height };
}

export function boardPdfBounds(rects) {
  const bounds = boardPdfBoundsUnchecked(rects);
  const { width, height } = bounds;
  if (width > MAX_BOARD_PDF_POINTS || height > MAX_BOARD_PDF_POINTS) {
    throw new Error("Whiteboard exceeds the single-page PDF limit (19,200 board units per side). Move items closer together or resize them; no content was cropped or scaled.");
  }
  return bounds;
}

/** Plan only occupied Letter-landscape tiles. World coordinates remain at the
 * same 0.75 point/unit scale as single-page export, including across gaps. */
export function planWhiteboardPages(contentBounds, sceneRects, arrows = []) {
  if (!contentBounds || (!sceneRects?.length && !arrows.length)) throw new Error("Nothing to export");
  const keys = new Set();
  const addKey = (row, col) => {
    keys.add(`${row}:${col}`);
    if (keys.size > MAX_WHITEBOARD_PAGES) {
      throw new Error(`Whiteboard pages export would exceed ${MAX_WHITEBOARD_PAGES} pages. Move items closer together or export a selected area.`);
    }
  };
  for (const { x, y, w, h } of sceneRects) {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error("Invalid whiteboard content bounds.");
    const firstCol = Math.floor((x - contentBounds.minX) / WHITEBOARD_PAGE_TILE_WIDTH);
    const lastCol = Math.ceil((x + w - contentBounds.minX) / WHITEBOARD_PAGE_TILE_WIDTH) - 1;
    const firstRow = Math.floor((y - contentBounds.minY) / WHITEBOARD_PAGE_TILE_HEIGHT);
    const lastRow = Math.ceil((y + h - contentBounds.minY) / WHITEBOARD_PAGE_TILE_HEIGHT) - 1;
    const span = (lastCol - firstCol + 1) * (lastRow - firstRow + 1);
    if (!Number.isSafeInteger(span) || span > MAX_WHITEBOARD_PAGES) {
      throw new Error(`Whiteboard pages export would exceed ${MAX_WHITEBOARD_PAGES} pages. Move very large items closer together or make them smaller.`);
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = firstCol; col <= lastCol; col += 1) {
        addKey(row, col);
      }
    }
  }
  for (const arrow of arrows) {
    const bounds = boardArrowPaintBounds(arrow);
    if (!bounds) continue;
    const firstCol = Math.floor((bounds.x - contentBounds.minX) / WHITEBOARD_PAGE_TILE_WIDTH);
    const lastCol = Math.ceil((bounds.x + bounds.w - contentBounds.minX) / WHITEBOARD_PAGE_TILE_WIDTH) - 1;
    const firstRow = Math.floor((bounds.y - contentBounds.minY) / WHITEBOARD_PAGE_TILE_HEIGHT);
    const lastRow = Math.ceil((bounds.y + bounds.h - contentBounds.minY) / WHITEBOARD_PAGE_TILE_HEIGHT) - 1;
    const candidateCount = (lastCol - firstCol + 1) * (lastRow - firstRow + 1);
    if (!Number.isSafeInteger(candidateCount) || candidateCount > MAX_WHITEBOARD_PAGES ** 2) {
      throw new Error(`Whiteboard pages export would exceed ${MAX_WHITEBOARD_PAGES} pages. Shorten very long arrows or move their endpoints closer together.`);
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = firstCol; col <= lastCol; col += 1) {
        const tile = { x: contentBounds.minX + col * WHITEBOARD_PAGE_TILE_WIDTH,
          y: contentBounds.minY + row * WHITEBOARD_PAGE_TILE_HEIGHT,
          w: WHITEBOARD_PAGE_TILE_WIDTH, h: WHITEBOARD_PAGE_TILE_HEIGHT };
        if (boardArrowIntersectsRect(arrow, tile)) addKey(row, col);
      }
    }
  }
  return Array.from(keys, (key) => key.split(":").map(Number))
    .sort(([rowA, colA], [rowB, colB]) => rowA - rowB || colA - colB)
    .map(([row, col]) => {
      const x = contentBounds.minX + col * WHITEBOARD_PAGE_TILE_WIDTH;
      const y = contentBounds.minY + row * WHITEBOARD_PAGE_TILE_HEIGHT;
      return { row, col, bounds: { x, y, w: WHITEBOARD_PAGE_TILE_WIDTH, h: WHITEBOARD_PAGE_TILE_HEIGHT,
        minX: x, minY: y, maxX: x + WHITEBOARD_PAGE_TILE_WIDTH, maxY: y + WHITEBOARD_PAGE_TILE_HEIGHT,
        width: WHITEBOARD_PAGE_CONTENT_WIDTH, height: WHITEBOARD_PAGE_CONTENT_HEIGHT } };
    });
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

// Notes export as complete cards, while their text renderer still paints only
// the colored body. Keeping these rectangles separate preserves the editor's
// 38px title bar and the existing body padding/layout.
export function boardNoteCardRect(item) {
  return { x: item.x, y: item.y, w: item.w, h: item.h };
}

export function boardPdfPlacement(rect, bounds) {
  return { x: (rect.x - bounds.minX) * BOARD_POINT_SCALE, y: (bounds.maxY - rect.y - rect.h) * BOARD_POINT_SCALE,
    width: rect.w * BOARD_POINT_SCALE, height: rect.h * BOARD_POINT_SCALE };
}

function boardPdfPlacementAtScale(rect, bounds, scale) {
  return { x: (rect.x - bounds.minX) * scale, y: (bounds.maxY - rect.y - rect.h) * scale,
    width: rect.w * scale, height: rect.h * scale };
}

/** Resolve a custom export area's physical PDF page without ever stretching
 * its content. Match keeps the selected aspect ratio; named paper sizes center
 * the selection inside the printable page. */
export function whiteboardExportPageLayout(region, pageSize = "match", orientation = "auto") {
  const bounds = boardPdfBoundsUnchecked([region]);
  const landscape = region.w >= region.h;
  let width, height, margin = 0;
  if (pageSize === "match" || !CUSTOM_PAGE_SIZES[pageSize]) {
    const cap = Math.min(1, MAX_BOARD_PDF_POINTS / Math.max(bounds.width, bounds.height));
    width = bounds.width * cap; height = bounds.height * cap;
    if ((orientation === "portrait" && width > height) || (orientation === "landscape" && height > width)) [width, height] = [height, width];
  } else {
    [width, height] = CUSTOM_PAGE_SIZES[pageSize];
    const wantsLandscape = orientation === "landscape" || (orientation === "auto" && landscape);
    if (wantsLandscape) [width, height] = [height, width];
    margin = WHITEBOARD_PAGE_MARGIN;
  }
  const availableWidth = Math.max(1, width - margin * 2), availableHeight = Math.max(1, height - margin * 2);
  const scale = Math.min(availableWidth / region.w, availableHeight / region.h);
  const contentWidth = region.w * scale, contentHeight = region.h * scale;
  return { width, height, scale, x: (width - contentWidth) / 2, y: (height - contentHeight) / 2,
    contentWidth, contentHeight, bounds };
}

export function boardRectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectAroundPoints(points, padding = 0) {
  const xs = points.map(({ x }) => x), ys = points.map(({ y }) => y);
  const minX = Math.min(...xs) - padding, minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding, maxY = Math.max(...ys) + padding;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function boardArrowGeometry({ from, to }) {
  const start = { x: from[0], y: from[1] }, tip = { x: to[0], y: to[1] };
  const dx = tip.x - start.x, dy = tip.y - start.y, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0) return null;
  const ux = dx / length, uy = dy / length, head = Math.min(BOARD_ARROW_HEAD, length * .65), half = head * BOARD_ARROW_HEAD_HALF;
  const base = { x: tip.x - ux * head, y: tip.y - uy * head };
  return { start, base, tip,
    left: { x: base.x - uy * half, y: base.y + ux * half },
    right: { x: base.x + uy * half, y: base.y - ux * half } };
}

// Bounds describe painted pixels, not just path centerlines. This prevents a
// board-edge arrowhead or half of a rectangle stroke from being clipped and
// lets selected-area export detect a drawing touched only by its visible ink.
export function boardArrowPaintBounds(arrow) {
  const geometry = boardArrowGeometry(arrow);
  if (!geometry) return null;
  const shaft = rectAroundPoints([geometry.start, geometry.base], BOARD_ARROW_STROKE / 2);
  const head = rectAroundPoints([geometry.tip, geometry.left, geometry.right]);
  return boardPdfBoundsWorld([shaft, head]);
}

function segmentIntersectsRect(from, to, rect) {
  let low = 0, high = 1;
  for (const [origin, delta, min, max] of [
    [from.x, to.x - from.x, rect.x, rect.x + rect.w],
    [from.y, to.y - from.y, rect.y, rect.y + rect.h],
  ]) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const a = (min - origin) / delta, b = (max - origin) / delta;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    if (low > high) return false;
  }
  return true;
}

function pointSegmentDistanceSquared(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)) : 0;
  const x = from.x + t * dx, y = from.y + t * dy;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function pointRectDistanceSquared(point, rect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - rect.x - rect.w);
  const dy = Math.max(rect.y - point.y, 0, point.y - rect.y - rect.h);
  return dx * dx + dy * dy;
}

function thickSegmentIntersectsRect(from, to, rect, radius) {
  if (segmentIntersectsRect(from, to, rect)) return true;
  let distanceSquared = Math.min(pointRectDistanceSquared(from, rect), pointRectDistanceSquared(to, rect));
  for (const corner of [
    { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
  ]) distanceSquared = Math.min(distanceSquared, pointSegmentDistanceSquared(corner, from, to));
  return distanceSquared < radius * radius - 1e-9;
}

function triangleIntersectsRect(triangle, rect) {
  const box = [
    { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
  ];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let index = 0; index < triangle.length; index += 1) {
    const from = triangle[index], to = triangle[(index + 1) % triangle.length];
    axes.push({ x: -(to.y - from.y), y: to.x - from.x });
  }
  return axes.every((axis) => {
    const triangleProjection = triangle.map((point) => point.x * axis.x + point.y * axis.y);
    const boxProjection = box.map((point) => point.x * axis.x + point.y * axis.y);
    const overlap = Math.min(Math.max(...triangleProjection), Math.max(...boxProjection))
      - Math.max(Math.min(...triangleProjection), Math.min(...boxProjection));
    return overlap > 1e-9;
  });
}

export function boardArrowIntersectsRect(arrow, rect) {
  const geometry = boardArrowGeometry(arrow);
  return !!geometry && (thickSegmentIntersectsRect(geometry.start, geometry.base, rect, BOARD_ARROW_STROKE / 2)
    || triangleIntersectsRect([geometry.tip, geometry.left, geometry.right], rect));
}

export function boardRectanglePaintBounds(rectangle) {
  const rect = whiteboardDrawingBounds(rectangle, "rectangle");
  if (!rect) return null;
  const padding = (Number.isFinite(rectangle.strokeWidth) ? rectangle.strokeWidth : 2.5) / 2;
  return { x: rect.x - padding, y: rect.y - padding, w: rect.w + padding * 2, h: rect.h + padding * 2 };
}

export function boardRectanglePaintRects(rectangle) {
  const rect = whiteboardDrawingBounds(rectangle, "rectangle");
  if (!rect) return [];
  const padding = (Number.isFinite(rectangle.strokeWidth) ? rectangle.strokeWidth : 2.5) / 2;
  const thickness = padding * 2;
  return [
    { x: rect.x - padding, y: rect.y - padding, w: rect.w + thickness, h: thickness },
    { x: rect.x - padding, y: rect.y + rect.h - padding, w: rect.w + thickness, h: thickness },
    { x: rect.x - padding, y: rect.y - padding, w: thickness, h: rect.h + thickness },
    { x: rect.x + rect.w - padding, y: rect.y - padding, w: thickness, h: rect.h + thickness },
  ];
}

export function boardRectangleIntersectsRect(rectangle, rect) {
  return boardRectanglePaintRects(rectangle).some((edge) => boardRectsIntersect(edge, rect));
}

function boardPdfBoundsWorld(rects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x); minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w); maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function whiteboardPdfFilename(projectName, boardName = "Whiteboard") {
  return `${projectFilename(projectName).slice(0, -4)} - ${projectFilename(boardName).slice(0, -4)}.pdf`;
}

function exportSnapshot(board, allowEmpty = false) {
  const snapshot = structuredClone(board);
  if (!Array.isArray(snapshot?.items)) throw new Error("Invalid whiteboard data.");
  snapshot.items = snapshot.items.filter((item) => !item.hidden && item.visible !== false && !item.deleted);
  snapshot.arrows = Array.isArray(snapshot.arrows) ? snapshot.arrows : [];
  snapshot.rectangles = Array.isArray(snapshot.rectangles) ? snapshot.rectangles : [];
  const hasSow = (Array.isArray(snapshot.sows) && snapshot.sows.length) || snapshot.sow;
  if (!allowEmpty && !snapshot.items.length && !snapshot.arrows.length && !snapshot.rectangles.length && !hasSow) throw new Error("Nothing to export");
  for (const item of snapshot.items) {
    // Fail closed for future scene types instead of silently exporting only
    // their untransformed boxes. Today's board supports note/file cards only.
    if (!["note", "file"].includes(item.kind) || ["rotation", "scale", "scaleX", "scaleY", "transform", "children", "clip", "mask", "stroke", "strokeWidth", "opacity"].some((key) => item[key] !== undefined)) {
      throw new Error(`Item ${item.id || "(unnamed)"} uses an unsupported whiteboard type or effect. Export supports the current note and file cards only.`);
    }
  }
  return validateWhiteboard(snapshot);
}

/** Export an isolated model, never the current viewport or preview canvases.
 * Browser-only decoding/text layout is injected so geometry and PDF boxes can
 * also be tested without a browser. No adapter receives the live board object.
 * @param {object} board
 * @param {{projectName?: string, boardName?: string, renderer?: BoardPdfRenderer, signal?: AbortSignal, region?: BoardRect, regions?: Array<BoardRect & {name?:string,pageSize?:string,orientation?:string,quality?:string,fit?:string,sourceItemId?:string,sourcePage?:number}>, pageMode?: "single" | "pages", quality?: "compact" | "balanced" | "hd", onProgress?: (value: {completed:number,total:number,name:string}) => void}} options
 */
export async function buildWhiteboardPdf(board, { projectName, boardName = "Whiteboard", renderer, signal, region, regions, pageMode = "single", quality = "balanced", onProgress,
  _outputPage = null, _skipTotalBudget = false, _snapshot = null } = {}) {
  if (regions !== undefined) {
    if (!Array.isArray(regions) || !regions.length) throw new Error("Add at least one PDF export area before exporting.");
    const { PDFDocument } = await import("pdf-lib");
    const combined = await PDFDocument.create();
    combined.setTitle(`${projectName || "Untitled project"} - ${boardName}`);
    const qualityMap = { standard: "compact", high: "balanced", maximum: "hd" };
    // Clone and validate the potentially large embedded-asset model once. Each
    // page is still composed independently, but repeated areas do not duplicate
    // every base64 PDF/image string before their sequential render begins.
    const customSnapshot = exportSnapshot(board, true);
    const pages = [];
    for (const [index, area] of regions.entries()) {
      signal?.throwIfAborted();
      if (!area || ![area.x, area.y, area.w, area.h].every(Number.isFinite) || area.w < 4 || area.h < 4) {
        throw new Error(`Page ${index + 1} has an invalid export area.`);
      }
      try {
        let outputArea = area, pageSnapshot = customSnapshot;
        if (area.sourceItemId) {
          const sourceItem = customSnapshot.items.find((item) => item.id === area.sourceItemId && item.kind === "file");
          if (!sourceItem) throw new Error("The selected Whiteboard page is no longer available. Delete this PDF page and select it again.");
          outputArea = { ...area, ...boardContentRect(sourceItem) };
          pageSnapshot = { ...customSnapshot, items: customSnapshot.items.map((item) => item.id === sourceItem.id
            ? { ...item, page: area.sourcePage || item.page } : item) };
        }
        const result = await buildWhiteboardPdf(pageSnapshot, { projectName, boardName: area.name || `Page ${index + 1}`, renderer, signal,
          region: outputArea, quality: qualityMap[area.quality] || quality, _outputPage: outputArea, _skipTotalBudget: true, _snapshot: pageSnapshot });
        signal?.throwIfAborted();
        const embedded = (await combined.embedPdf(result.bytes, [0]))[0];
        const page = combined.addPage([embedded.width, embedded.height]);
        for (const setBox of ["setMediaBox", "setCropBox", "setTrimBox", "setBleedBox", "setArtBox"]) page[setBox](0, 0, embedded.width, embedded.height);
        page.drawPage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        pages.push({ id: area.id, name: area.name || `Area ${index + 1}`, bounds: { x: outputArea.x, y: outputArea.y, w: outputArea.w, h: outputArea.h },
          width: embedded.width, height: embedded.height });
        onProgress?.({ completed: index + 1, total: regions.length, name: pages.at(-1).name });
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        signal?.throwIfAborted();
        throw new Error(`Page ${index + 1} (${area.name || `Area ${index + 1}`}): ${error.message || "Could not export this area."}`, { cause: error });
      }
    }
    signal?.throwIfAborted();
    return { bytes: await combined.save(), filename: whiteboardPdfFilename(projectName, boardName), pages };
  }
  if (!["single", "pages"].includes(pageMode)) throw new Error("Unknown whiteboard PDF page mode.");
  if (pageMode === "pages" && region) throw new Error("Selected-area export uses the single-page PDF format.");
  const snapshot = _snapshot || exportSnapshot(board, !!region);
  const exportQuality = pdfExportQuality(quality);
  const bounds = region ? (_outputPage ? boardPdfBoundsUnchecked([region]) : boardPdfBounds([region])) : null;
  const checkCancelled = () => signal?.throwIfAborted();
  checkCancelled();
  const { PDFDocument, PDFName, PDFNumber, StandardFonts, rgb,
    pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${projectName || "Untitled project"} - ${boardName}`);
  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const files = new Map(), prepared = [];
  let rasterPixels = 0;
  const budget = (w, h) => {
    const size = checkBoardRaster(w, h);
    rasterPixels += size.width * size.height;
    if (!_skipTotalBudget && rasterPixels > MAX_TOTAL_RASTER_PIXELS) throw new Error("Whiteboard export exceeds the 64-megapixel image budget. Use smaller attachments or notes and try again.");
    return size;
  };
  for (const item of snapshot.items) {
    checkCancelled();
    const itemBounds = item.kind === "note" ? boardNoteCardRect(item) : boardContentRect(item);
    if (region && !boardRectsIntersect(itemBounds, region)) continue;
    const asset = assets.get(item.assetId), label = asset?.name || `Note ${item.id}`;
    try {
      if (item.kind === "note") {
        const rect = boardNoteCardRect(item);
        budget(rect.w * exportQuality.boardScale, rect.h * exportQuality.boardScale);
        prepared.push({ item, rect });
        continue;
      }
      const crop = asset.type.startsWith("image/") ? whiteboardImageCrop(item) : null;
      // One source asset may appear more than once with a different non-destructive
      // crop. Cache decoded/export-ready pixels by both source and crop so one
      // item's crop can never leak into another instance of that image.
      const key = asset.type === "application/pdf" ? `${asset.id}:${item.page}` : `${asset.id}:${JSON.stringify(crop)}`;
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
          // Use the preview's stable logical footprint. Render detail changes
          // backing pixels only and must never change board/export placement.
          const { width, height } = whiteboardPdfLayoutSize(nativeW, nativeH);
          // Distribution exports flatten every source PDF page. Copying or
          // embedding a page retains its selectable text/OCR, fonts, nested
          // forms and other complex resources; those made real-world exports
          // unnecessarily large and slow in estimating viewers. PDF.js paints
          // the visible page only, then the browser renderer compresses it.
          file = { kind: "pdf", bytes, page: item.page, rotation, width, height };
        } else {
          if (!renderer?.readImage) throw new Error("Image decoder is unavailable. Reload the app and try again.");
          const image = await renderer.readImage(base64ToBytes(asset.data), asset.type, crop, signal, exportQuality);
          budget(image.width, image.height);
          const embedded = image.type === "image/jpeg" ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes);
          file = { kind: "image", embedded,
            width: image.layoutWidth ?? image.width, height: image.layoutHeight ?? image.height };
        }
        files.set(key, file);
      }
      const rect = boardContentRect(item, file);
      prepared.push({ item, file, rect });
    } catch (error) {
      checkCancelled();
      throw new Error(`${label}: ${error.message || "Could not read attachment. Re-add the file and try again."}`, { cause: error });
    }
  }
  const sowPrepared = [];
  for (const sow of snapshot.sows || []) {
    if (!renderer?.renderSow) throw new Error("The SOW export renderer is unavailable. Reload the app and try again.");
    checkCancelled();
    const brandingAsset = sow.brandAssetId ? snapshot.assets.find((asset) => asset.id === sow.brandAssetId) : null;
    const rendered = await renderer.renderSow(sow, brandingAsset, signal, exportQuality);
    budget(rendered.width, rendered.height);
    const rect = { x: sow.x, y: sow.y, w: rendered.layoutWidth, h: rendered.layoutHeight };
    if (!region || boardRectsIntersect(rect, region)) {
      sowPrepared.push({ id: sow.id, rect, embedded: await doc.embedPng(rendered.bytes) });
    }
  }
  const exportArrows = snapshot.arrows.filter((arrow) => {
    const rect = boardArrowPaintBounds(arrow);
    return rect && (!region || boardRectsIntersect(rect, region));
  });
  const arrowEntries = exportArrows.map((drawing) => ({ drawing, rect: boardArrowPaintBounds(drawing) }));
  const exportRectangles = snapshot.rectangles.filter((rectangle) => {
    const rect = boardRectanglePaintBounds(rectangle);
    return rect && (!region || boardRectsIntersect(rect, region));
  });
  const rectangleEntries = exportRectangles.map((drawing) => ({ drawing, rect: boardRectanglePaintBounds(drawing) }));
  const sceneRects = [...prepared.map(({ rect }) => rect), ...arrowEntries.map(({ rect }) => rect), ...rectangleEntries.map(({ rect }) => rect), ...sowPrepared.map(({ rect }) => rect)];
  const occupiedRects = [...prepared.map(({ rect }) => rect), ...exportRectangles.flatMap(boardRectanglePaintRects), ...sowPrepared.map(({ rect }) => rect)];
  const outputBounds = bounds || (pageMode === "pages" ? boardPdfBoundsUnchecked(sceneRects) : boardPdfBounds(sceneRects));

  // Notes and flattened PDF pages may cross a page boundary. Embed their
  // pixels once, then reuse the same compressed image on every touched tile.
  for (const entry of prepared) {
    const { item, file, rect } = entry;
    if (file?.kind === "image") continue;
    checkCancelled();
    try {
      const rendered = !file ? await renderer?.renderNote(item, rect, signal, exportQuality) : await renderer?.renderPdfPage(file.bytes, file.page, rect, signal, exportQuality);
      if (!rendered) throw new Error("Export renderer is unavailable. Reload the app and try again.");
      checkCancelled();
      const raster = rendered instanceof Uint8Array ? { bytes: rendered, type: "image/png" } : rendered;
      if (Number.isFinite(raster.width) && Number.isFinite(raster.height)) budget(raster.width, raster.height);
      entry.rasterEmbedded = raster.type === "image/jpeg" ? await doc.embedJpg(raster.bytes) : await doc.embedPng(raster.bytes);
    } catch (error) {
      checkCancelled();
      throw new Error(`${assets.get(item.assetId)?.name || `Note ${item.id}`}: ${error.message || "Export failed. Try again."}`, { cause: error });
    }
  }

  const setPageBoxes = (page, width, height) => {
    for (const setBox of ["setMediaBox", "setCropBox", "setTrimBox", "setBleedBox", "setArtBox"]) page[setBox](0, 0, width, height);
  };
  const addOffset = (place, x, y) => ({ ...place, x: place.x + x, y: place.y + y });
  const parseColor = (value) => {
    const colorHex = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#1f3fc7";
    return rgb(parseInt(colorHex.slice(1, 3), 16) / 255, parseInt(colorHex.slice(3, 5), 16) / 255, parseInt(colorHex.slice(5, 7), 16) / 255);
  };
  const paintScenePage = async (page, pageBounds, offsetX = 0, offsetY = 0, sceneScale = BOARD_POINT_SCALE) => {
    const worldRect = { x: pageBounds.minX, y: pageBounds.minY,
      w: pageBounds.maxX - pageBounds.minX, h: pageBounds.maxY - pageBounds.minY };
    for (const { item, file, rect, rasterEmbedded } of prepared) {
      if (!boardRectsIntersect(rect, worldRect)) continue;
      checkCancelled();
      const place = addOffset(boardPdfPlacementAtScale(rect, pageBounds, sceneScale), offsetX, offsetY);
      try {
        if (!file || file.kind === "pdf") {
          page.drawImage(rasterEmbedded, place);
        } else if (file.kind === "image") {
          // Transparent image pixels sit on the same white backing as FilePreview.
          page.drawRectangle({ ...place, color: rgb(1, 1, 1) });
          page.drawImage(file.embedded, place);
        }
      } catch (error) {
        checkCancelled();
        throw new Error(`${assets.get(item.assetId)?.name || `Note ${item.id}`}: ${error.message || "Export failed. Try again."}`, { cause: error });
      }
    }
    for (const { drawing: arrow } of arrowEntries) {
      if (!boardArrowIntersectsRect(arrow, worldRect)) continue;
      checkCancelled();
      const point = ([x, y]) => ({ x: offsetX + (x - pageBounds.minX) * sceneScale,
        y: offsetY + (pageBounds.maxY - y) * sceneScale });
      const geometry = boardArrowGeometry(arrow);
      const from = point([geometry.start.x, geometry.start.y]), base = point([geometry.base.x, geometry.base.y]);
      const tip = point([geometry.tip.x, geometry.tip.y]), left = point([geometry.left.x, geometry.left.y]), right = point([geometry.right.x, geometry.right.y]);
      const color = parseColor(arrow.color);
      page.drawLine({ start: from, end: base, thickness: BOARD_ARROW_STROKE * sceneScale, color, opacity: .95 });
      // pdf-lib's SVG path parser uses an SVG y-down coordinate system.
      const path = [tip, left, right].map((p, index) => `${index ? "L" : "M"}${p.x} ${-p.y}`).join(" ") + " Z";
      page.drawSvgPath(path, { x: 0, y: 0, color, opacity: .95 });
    }
    // Match the live SVG's fixed layer order: cards, arrows, then rectangles.
    for (const { drawing: rectangleDrawing } of rectangleEntries) {
      if (!boardRectangleIntersectsRect(rectangleDrawing, worldRect)) continue;
      checkCancelled();
      const rect = whiteboardDrawingBounds(rectangleDrawing, "rectangle");
      const place = addOffset(boardPdfPlacementAtScale(rect, pageBounds, sceneScale), offsetX, offsetY);
      page.drawRectangle({ ...place, borderColor: parseColor(rectangleDrawing.color),
        borderWidth: (Number.isFinite(rectangleDrawing.strokeWidth) ? rectangleDrawing.strokeWidth : 2.5) * sceneScale, borderOpacity: .95 });
    }
    // Movable SOW worksheets are topmost in the live board. Editor-only panel
    // controls and add buttons are intentionally omitted by renderSow.
    for (const preparedSow of sowPrepared) {
      if (!boardRectsIntersect(preparedSow.rect, worldRect)) continue;
      checkCancelled();
      page.drawImage(preparedSow.embedded, addOffset(boardPdfPlacementAtScale(preparedSow.rect, pageBounds, sceneScale), offsetX, offsetY));
    }
  };

  if (pageMode === "pages") {
    const plannedPages = planWhiteboardPages(outputBounds, occupiedRects, exportArrows);
    const footerFont = await doc.embedFont(StandardFonts.Helvetica);
    for (const [index, planned] of plannedPages.entries()) {
      // Large vector-only boards otherwise monopolize the main thread until
      // every page is built, preventing the close/unmount abort from running.
      if (index && index % 8 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        checkCancelled();
      }
      checkCancelled();
      const page = doc.addPage([WHITEBOARD_PAGE_WIDTH, WHITEBOARD_PAGE_HEIGHT]);
      setPageBoxes(page, WHITEBOARD_PAGE_WIDTH, WHITEBOARD_PAGE_HEIGHT);
      page.drawRectangle({ x: 0, y: 0, width: WHITEBOARD_PAGE_WIDTH, height: WHITEBOARD_PAGE_HEIGHT, color: rgb(1, 1, 1) });
      page.pushOperators(pushGraphicsState(), rectangle(WHITEBOARD_PAGE_MARGIN, WHITEBOARD_PAGE_MARGIN,
        WHITEBOARD_PAGE_CONTENT_WIDTH, WHITEBOARD_PAGE_CONTENT_HEIGHT), clip(), endPath());
      await paintScenePage(page, planned.bounds, WHITEBOARD_PAGE_MARGIN, WHITEBOARD_PAGE_MARGIN);
      page.pushOperators(popGraphicsState());
      const footer = `Page ${index + 1} of ${plannedPages.length}`;
      const footerSize = 7.5;
      page.drawText(footer, { x: (WHITEBOARD_PAGE_WIDTH - footerFont.widthOfTextAtSize(footer, footerSize)) / 2,
        y: 5.25, size: footerSize, font: footerFont, color: rgb(.35, .35, .35) });
    }
    checkCancelled();
    return { bytes: await doc.save(), filename: whiteboardPdfFilename(projectName, boardName), bounds: outputBounds,
      pages: plannedPages.map(({ row, col, bounds: pageBounds }) => ({ row, col,
        bounds: { x: pageBounds.x, y: pageBounds.y, w: pageBounds.w, h: pageBounds.h } })) };
  }

  const customLayout = _outputPage && region ? whiteboardExportPageLayout(region, _outputPage.pageSize, _outputPage.orientation) : null;
  const pageWidth = customLayout?.width ?? outputBounds.width, pageHeight = customLayout?.height ?? outputBounds.height;
  const page = doc.addPage([pageWidth, pageHeight]);
  setPageBoxes(page, pageWidth, pageHeight);
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) });
  if (customLayout) {
    page.pushOperators(pushGraphicsState(), rectangle(customLayout.x, customLayout.y, customLayout.contentWidth, customLayout.contentHeight), clip(), endPath());
    await paintScenePage(page, outputBounds, customLayout.x, customLayout.y, customLayout.scale);
    page.pushOperators(popGraphicsState());
  } else await paintScenePage(page, outputBounds);
  checkCancelled();
  return { bytes: await doc.save(), filename: whiteboardPdfFilename(projectName, boardName), bounds: outputBounds,
    ...(customLayout ? { pageSize: { width: pageWidth, height: pageHeight } } : {}) };
}
