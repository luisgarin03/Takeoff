import { BOARD_EXPORT_SCALE, checkBoardRaster } from "./whiteboardPdf.js";
import { NOTE_COLORS, WHITEBOARD_FILE_HEADER_COLORS, normalizeWhiteboardImageCrop, whiteboardFileHeaderColor, whiteboardFileHeaderTextColor } from "./whiteboard.js";

function canvasFor(width, height) {
  const size = checkBoardRaster(width, height), canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  if (!canvas.getContext("2d")) throw new Error("Not enough graphics memory. Close other tabs and try again.");
  return canvas;
}

async function pngBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the export image. Close other tabs and try again.");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function readBoardImage(bytes, type, crop, signal) {
  // Preserve the former direct-call signature readBoardImage(bytes, type,
  // signal) while the PDF pipeline now supplies crop as the third argument.
  if (!signal && crop?.throwIfAborted) { signal = crop; crop = null; }
  signal?.throwIfAborted();
  const image = await createImageBitmap(new Blob([bytes], { type }));
  let canvas;
  try {
    signal?.throwIfAborted();
    const normalized = normalizeWhiteboardImageCrop(crop);
    const cropped = normalized && (normalized.x > 0 || normalized.y > 0 || normalized.w < 1 || normalized.h < 1);
    if (cropped) {
      // Crop only for this export. The original attachment bytes remain the
      // project's single source of truth, so re-cropping can reveal hidden
      // pixels and repeated crop operations never create stored image blobs.
      const width = Math.max(1, Math.round(image.width * normalized.w));
      const height = Math.max(1, Math.round(image.height * normalized.h));
      canvas = canvasFor(width, height);
      canvas.getContext("2d").drawImage(image,
        image.width * normalized.x, image.height * normalized.y,
        image.width * normalized.w, image.height * normalized.h,
        0, 0, width, height);
      signal?.throwIfAborted();
      return { bytes: await pngBytes(canvas), type: "image/png", width, height };
    }
    checkBoardRaster(image.width, image.height);
    // JPEG EXIF orientation must agree with the browser preview. Decode these
    // at original resolution instead of embedding unoriented JPEG pixels.
    const exif = type === "image/jpeg" && bytes.some((b, i) => b === 69 && bytes[i + 1] === 120 && bytes[i + 2] === 105 && bytes[i + 3] === 102 && bytes[i + 4] === 0);
    if (type === "image/png" || (type === "image/jpeg" && !exif)) return { bytes, type, width: image.width, height: image.height };
    canvas = canvasFor(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
    return { bytes: await pngBytes(canvas), type: "image/png", width: image.width, height: image.height };
  } finally { image.close(); if (canvas) canvas.width = canvas.height = 0; }
}

export async function renderBoardNote(item, rect, signal) {
  signal?.throwIfAborted();
  const family = getComputedStyle(document.documentElement).getPropertyValue("--f-body").trim() || "system-ui, sans-serif";
  const font = `16px ${family}`;
  await document.fonts.load(font, item.text || "Note");
  await document.fonts.ready;
  signal?.throwIfAborted();
  const canvas = canvasFor(rect.w * BOARD_EXPORT_SCALE, rect.h * BOARD_EXPORT_SCALE);
  const mirror = document.createElement("div");
  try {
    // Let the browser do the same note body/title font layout as the board.
    // This isolated mirror has no camera, selection, scroll or device-DPR state.
    mirror.setAttribute("aria-hidden", "true");
    Object.assign(mirror.style, { position: "fixed", left: "1px", top: "39px", visibility: "hidden", pointerEvents: "none",
      boxSizing: "border-box", width: `${rect.w - 2}px`, padding: "14px 20px 20px 14px", margin: "0", border: "0",
      font, lineHeight: "24px", letterSpacing: "0", whiteSpace: "pre-wrap", overflowWrap: "break-word", tabSize: "8", direction: "ltr" });
    mirror.textContent = item.text.replace(/\r\n?/g, "\n");
    document.body.appendChild(mirror);
    if (mirror.getBoundingClientRect().height > rect.h - 40 + .1) {
      throw new Error("Text extends beyond this note. Enlarge the note before exporting so all its text fits.");
    }
    const ctx = canvas.getContext("2d");
    ctx.scale(canvas.width / rect.w, canvas.height / rect.h);
    const headerColor = whiteboardFileHeaderColor(item.headerColor) || "#242424";
    const titleColor = whiteboardFileHeaderTextColor(item.headerColor) || "#ffffff";
    ctx.fillStyle = NOTE_COLORS[item.color];
    ctx.beginPath(); ctx.roundRect(0, 0, rect.w, rect.h, 4); ctx.fill();
    ctx.fillStyle = headerColor; ctx.fillRect(1, 1, rect.w - 2, 38);
    // The live card includes the inline palette after the editable title.
    // Draw the same swatches and selected ring so colors stay legible in PDF.
    const selectedHeaderColor = whiteboardFileHeaderColor(item.headerColor);
    const swatchStep = 8, swatchesWidth = WHITEBOARD_FILE_HEADER_COLORS.length * 7 + (WHITEBOARD_FILE_HEADER_COLORS.length - 1);
    const swatchesLeft = rect.w - 8 - swatchesWidth;
    for (let index = 0; index < WHITEBOARD_FILE_HEADER_COLORS.length; index++) {
      const color = WHITEBOARD_FILE_HEADER_COLORS[index].value, x = swatchesLeft + index * swatchStep;
      if (color === selectedHeaderColor) {
        ctx.beginPath(); ctx.arc(x + 3.5, 20, 4.5, 0, Math.PI * 2); ctx.fillStyle = titleColor; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x + 3.5, 20, 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = color === selectedHeaderColor ? 1 : .6; ctx.strokeStyle = color === selectedHeaderColor ? headerColor : "#0006"; ctx.stroke();
    }
    ctx.save(); ctx.beginPath(); ctx.rect(34, 3, Math.max(0, swatchesLeft - 40), 32); ctx.clip();
    ctx.font = `600 13px ${family}`; ctx.fillStyle = titleColor; ctx.textBaseline = "middle";
    ctx.fillText(typeof item.title === "string" ? item.title : "Note", 34, 20);
    ctx.restore();
    ctx.strokeStyle = "#8f8f8f"; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, rect.w - 1, rect.h - 1);
    ctx.strokeStyle = "#0000001c"; ctx.beginPath(); ctx.moveTo(1, 38.5); ctx.lineTo(rect.w - 1, 38.5); ctx.stroke();
    ctx.font = font; ctx.fillStyle = "#202520"; ctx.textBaseline = "alphabetic"; ctx.direction = "ltr";
    const ascent = ctx.measureText("Mg").fontBoundingBoxAscent;
    const origin = mirror.getBoundingClientRect(), text = mirror.firstChild;
    const range = document.createRange();
    let offset = 0, line = "", left = 0, top = 0;
    const flush = () => { if (line) ctx.fillText(line, left - origin.left + 1, top - origin.top + 39 + ascent); line = ""; };
    // Range bounds preserve the browser's word/Unicode line breaking; drawing
    // whole runs also keeps ligatures, kerning and bidirectional shaping intact.
    for (const char of mirror.textContent) {
      range.setStart(text, offset); range.setEnd(text, offset + char.length); offset += char.length;
      const box = range.getBoundingClientRect();
      if (char === "\n" || char === "\t") { flush(); continue; }
      if (line && Math.abs(box.top - top) > 12) flush();
      if (!line) { left = box.left; top = box.top; }
      // The first logical character of an RTL run is its rightmost glyph.
      left = Math.min(left, box.left);
      line += char;
    }
    flush(); range.detach();
    signal?.throwIfAborted();
    return await pngBytes(canvas);
  } finally { mirror.remove(); canvas.width = canvas.height = 0; }
}

export function whiteboardPdfRenderer(pdfjsLib) {
  return {
    readImage: readBoardImage,
    renderNote: renderBoardNote,
    async renderPdfPage(bytes, pageNumber, rect, signal) {
      signal?.throwIfAborted();
      const loading = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
      let canvas, task;
      const cancel = () => { task?.cancel(); loading.destroy().catch(() => {}); };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        const doc = await loading.promise, page = await doc.getPage(pageNumber);
        signal?.throwIfAborted();
        const native = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.max(rect.w / native.width, rect.h / native.height) * BOARD_EXPORT_SCALE });
        canvas = canvasFor(viewport.width, viewport.height);
        task = page.render({ canvasContext: canvas.getContext("2d"), viewport, annotationMode: pdfjsLib.AnnotationMode.ENABLE });
        await task.promise;
        signal?.throwIfAborted();
        return await pngBytes(canvas);
      } finally {
        signal?.removeEventListener("abort", cancel);
        task?.cancel();
        try { await loading.destroy(); }
        finally { if (canvas) canvas.width = canvas.height = 0; }
      }
    },
  };
}
