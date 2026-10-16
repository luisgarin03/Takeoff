import { findTextItemMatches } from "./findText.js";

const OCR_MAX_SIDE = 3200;
const OCR_MAX_PIXELS = 9_000_000;
const OCR_MIN_SCALE = 1.5;
const OCR_MAX_SCALE = 3;
const OCR_MIN_CONFIDENCE = 20;

let workerPromise = null;
let progressListener = null;
let pageLinesCache = new WeakMap();

function ocrRenderScale(viewport) {
  const width = Math.max(1, Number(viewport?.width) || 1);
  const height = Math.max(1, Number(viewport?.height) || 1);
  return Math.max(0.5, Math.min(
    OCR_MAX_SCALE,
    Math.max(OCR_MIN_SCALE, OCR_MAX_SIDE / Math.max(width, height)),
    Math.sqrt(OCR_MAX_PIXELS / (width * height)),
  ));
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker, OEM }) => createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/tesseract-core-simd-lstm.wasm.js",
      langPath: "/ocr",
      logger: (message) => progressListener?.(message),
    })).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export function ocrLinesFromBlocks(blocks) {
  const lines = [];
  for (const block of blocks || []) {
    for (const paragraph of block?.paragraphs || []) {
      for (const line of paragraph?.lines || []) {
        const text = String(line?.text || "").replace(/\s+/g, " ").trim();
        const bbox = line?.bbox;
        if (!text || !bbox || (Number(line?.confidence) || 0) < OCR_MIN_CONFIDENCE) continue;
        const x0 = Number(bbox.x0);
        const y0 = Number(bbox.y0);
        const x1 = Number(bbox.x1);
        const y1 = Number(bbox.y1);
        if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) continue;
        lines.push({ str: text, x0, y0, x1, y1 });
      }
    }
  }
  return lines;
}

export function findOcrLineMatches(lines, terms, imageWidth, imageHeight) {
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  const matches = [];
  for (const match of findTextItemMatches(lines, terms)) {
    const line = lines[match.itemIndex];
    if (!line) continue;
    const charWidth = (line.x1 - line.x0) / Math.max(1, line.str.length);
    matches.push({
      ...match,
      source: "ocr",
      x: (line.x0 + charWidth * match.start) / width,
      y: line.y0 / height,
      w: Math.max(1, charWidth * match.length) / width,
      h: Math.max(1, line.y1 - line.y0) / height,
    });
  }
  return matches;
}

async function recognizePageLines(pageObject, onProgress) {
  const baseViewport = pageObject.getViewport({ scale: 1 });
  const scale = ocrRenderScale(baseViewport);
  const viewport = pageObject.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return [];
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const renderTask = pageObject.render({ canvasContext: context, viewport, background: "white" });
  await renderTask.promise;

  progressListener = onProgress || null;
  try {
    const worker = await getWorker();
    const result = await worker.recognize(canvas, {}, {
      text: true,
      blocks: true,
      layoutBlocks: false,
      hocr: false,
      tsv: false,
      box: false,
      unlv: false,
      osd: false,
      pdf: false,
      imageColor: false,
      imageGrey: false,
      imageBinary: false,
      debug: false,
    });
    return {
      lines: ocrLinesFromBlocks(result?.data?.blocks),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    progressListener = null;
    canvas.width = 1;
    canvas.height = 1;
  }
}

export async function recognizePdfPageForFind(pageObject, terms, { onProgress } = {}) {
  if (!pageObject || typeof document === "undefined") return [];
  let pageLines = pageLinesCache.get(pageObject);
  if (!pageLines) {
    pageLines = recognizePageLines(pageObject, onProgress).catch((error) => {
      if (pageLinesCache.get(pageObject) === pageLines) pageLinesCache.delete(pageObject);
      throw error;
    });
    pageLinesCache.set(pageObject, pageLines);
  }
  const { lines, width, height } = await pageLines;
  return findOcrLineMatches(lines, terms, width, height);
}

export async function disposeFindOcr() {
  const pending = workerPromise;
  workerPromise = null;
  progressListener = null;
  pageLinesCache = new WeakMap();
  if (!pending) return;
  try { await (await pending).terminate(); }
  catch { /* Worker creation may have failed or already terminated. */ }
}
