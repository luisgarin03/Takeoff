import { checkBoardRaster } from "./whiteboardPdf.js";
import { NOTE_COLORS, WHITEBOARD_FILE_HEADER_COLORS, WHITEBOARD_SOW_DEFAULT_SECTION_TITLE, WHITEBOARD_SOW_DEFAULT_TAKEOFF_TITLE, normalizeWhiteboardImageCrop, whiteboardFileHeaderColor, whiteboardFileHeaderTextColor, whiteboardSowLogoWidth, wrapWhiteboardSowText } from "./whiteboard.js";
import brandLogo from "../assets/beitzell-fence-company-logo.png";
import { pdfExportQuality, safePdfRasterScale } from "./exportQuality.js";

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

async function jpegBytes(canvas, quality = 0.82) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not compress the export image. Close other tabs and try again.");
  return new Uint8Array(await blob.arrayBuffer());
}

let brandImagePromise;
function loadBrandImage(asset = null) {
  if (asset) return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the custom SOW branding image."));
    image.src = `data:${asset.type};base64,${asset.data}`;
  });
  if (!brandImagePromise) brandImagePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the SOW branding image."));
    image.src = brandLogo;
  });
  return brandImagePromise;
}

export async function renderBoardSow(sow, brandingAsset = null, signal = null, quality = "balanced") {
  if (!signal && brandingAsset?.throwIfAborted) { signal = brandingAsset; brandingAsset = null; }
  signal?.throwIfAborted();
  const active = sow.tabs.find((tab) => tab.id === sow.activeTabId) || sow.tabs[0];
  const width = sow.w;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--f-body").trim() || "system-ui, sans-serif";
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `7px ${family}`;
  const entryLayouts = active.entries.map((entry) => {
    const isTitle = entry.kind === "title";
    measure.font = `${isTitle ? "800 9px" : "7px"} ${family}`;
    const lines = wrapWhiteboardSowText((value) => measure.measureText(value).width, entry.text, width - (isTitle ? 12 : 40));
    return { entry, lines, isTitle, height: isTitle ? Math.max(16, lines.length * 11 + 3) : Math.max(20, lines.length * 10 + 5) };
  });
  const brand = await loadBrandImage(brandingAsset);
  signal?.throwIfAborted();
  const brandHeight = 62;
  const logoColumnWidth = whiteboardSowLogoWidth(sow);
  const logoRect = { x: 13, y: 7, w: Math.max(1, logoColumnWidth - 12), h: brandHeight - 14 };
  const titleHeight = 20;
  const listHeight = active.entries.length ? 4 + entryLayouts.reduce((sum, item) => sum + item.height + 3, 0) : 38;
  // Scope tabs and counts are editor controls. Export the branded worksheet,
  // its SOW heading and active entries—not the footer or Add Item control.
  const height = Math.ceil(brandHeight + titleHeight + listHeight);
  const preset = pdfExportQuality(quality);
  const scale = safePdfRasterScale(width, height, preset.boardScale, preset.imageMaxPixels);
  const canvas = canvasFor(width * scale, height * scale);
  try {
    const ctx = canvas.getContext("2d");
    ctx.scale(canvas.width / width, canvas.height / height);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 1; ctx.strokeRect(4.5, 4.5, width - 9, brandHeight - 9);
    const logoScale = Math.min(logoRect.w / brand.naturalWidth, logoRect.h / brand.naturalHeight);
    const imageWidth = brand.naturalWidth * logoScale, imageHeight = brand.naturalHeight * logoScale;
    ctx.drawImage(brand, logoRect.x + (logoRect.w - imageWidth) / 2, logoRect.y + (logoRect.h - imageHeight) / 2, imageWidth, imageHeight);
    const takeoffTitle = typeof sow.takeoffTitle === "string" ? sow.takeoffTitle : WHITEBOARD_SOW_DEFAULT_TAKEOFF_TITLE;
    const takeoffX = 7 + logoColumnWidth + 3, takeoffWidth = width - takeoffX - 7;
    let takeoffFontSize = 11;
    while (takeoffFontSize > 7) {
      ctx.font = `800 ${takeoffFontSize}px ${family}`;
      if (ctx.measureText(takeoffTitle).width <= takeoffWidth - 12) break;
      takeoffFontSize -= 1;
    }
    ctx.save(); ctx.beginPath(); ctx.rect(takeoffX, 7, takeoffWidth, brandHeight - 14); ctx.clip();
    ctx.fillStyle = "#111827"; ctx.font = `800 ${takeoffFontSize}px ${family}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(takeoffTitle, takeoffX + takeoffWidth / 2, brandHeight / 2, Math.max(1, takeoffWidth - 12));
    ctx.restore(); ctx.textAlign = "left";
    const titleY = brandHeight;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, titleY, width, titleHeight);
    ctx.strokeStyle = "#c7cbd1"; ctx.beginPath(); ctx.moveTo(0, titleY + titleHeight - .5); ctx.lineTo(width, titleY + titleHeight - .5); ctx.stroke();
    ctx.fillStyle = "#20252d"; ctx.font = `800 9px ${family}`; ctx.textBaseline = "alphabetic";
    const sectionTitle = typeof sow.sectionTitle === "string" ? sow.sectionTitle : WHITEBOARD_SOW_DEFAULT_SECTION_TITLE;
    ctx.fillText(sectionTitle, 6, titleY + 14, Math.max(1, width - 12));
    let y = titleY + titleHeight + 4;
    if (!active.entries.length) {
      ctx.fillStyle = "#5f6670"; ctx.font = `600 7px ${family}`; ctx.textAlign = "center";
      ctx.fillText("No scope items yet", width / 2, y + 16); ctx.textAlign = "left";
      y += 44;
    } else {
      for (const { entry, lines, isTitle, height: entryHeight } of entryLayouts) {
        if (isTitle) {
          ctx.fillStyle = "#111827"; ctx.font = `800 9px ${family}`; ctx.textBaseline = "alphabetic";
          lines.forEach((line, index) => ctx.fillText(line, 6, y + 10 + index * 11));
          y += entryHeight + 3;
          continue;
        }
        ctx.save(); ctx.shadowColor = "#0000001f"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(5, y, width - 10, entryHeight, 5); ctx.fill(); ctx.restore();
        ctx.strokeStyle = "#c7cbd1"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(5.5, y + .5, width - 11, entryHeight - 1, 5); ctx.stroke();
        ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(entry.color) ? entry.color : "#60A5FA";
        ctx.beginPath(); ctx.roundRect(5, y, 4, entryHeight, [5, 0, 0, 5]); ctx.fill();
        ctx.fillStyle = "#20252d"; ctx.font = `7px ${family}`; ctx.textBaseline = "alphabetic";
        lines.forEach((line, index) => ctx.fillText(line, 17, y + 9 + index * 10));
        y += entryHeight + 3;
      }
    }
    ctx.strokeStyle = "#8f939b"; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, width - 1, height - 1);
    signal?.throwIfAborted();
    return { bytes: await pngBytes(canvas), width: canvas.width, height: canvas.height, layoutWidth: width, layoutHeight: height };
  } finally { canvas.width = canvas.height = 0; }
}

export async function readBoardImage(bytes, type, crop, signal, quality = "balanced") {
  // Preserve the former direct-call signature readBoardImage(bytes, type,
  // signal) while the PDF pipeline now supplies crop as the third argument.
  if (!signal && crop?.throwIfAborted) { signal = crop; crop = null; }
  signal?.throwIfAborted();
  const image = await createImageBitmap(new Blob([bytes], { type }));
  let canvas;
  try {
    signal?.throwIfAborted();
    const normalized = normalizeWhiteboardImageCrop(crop) || { x: 0, y: 0, w: 1, h: 1 };
    const source = {
      x: image.width * normalized.x,
      y: image.height * normalized.y,
      width: image.width * normalized.w,
      height: image.height * normalized.h,
    };
    const preset = pdfExportQuality(quality);
    const scale = Math.min(1, preset.imageMaxDimension / Math.max(source.width, source.height),
      Math.sqrt(preset.imageMaxPixels / (source.width * source.height)));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    canvas = canvasFor(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    // Re-encode every image attachment through a fresh canvas. This honors the
    // non-destructive crop while dropping EXIF/profile/application metadata and
    // downsampling pixels that cannot be used at Whiteboard export scale.
    context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, width, height);
    signal?.throwIfAborted();
    const [png, jpeg] = await Promise.all([pngBytes(canvas), jpegBytes(canvas, preset.jpegQuality)]);
    const compact = jpeg.length < png.length ? { bytes: jpeg, type: "image/jpeg" } : { bytes: png, type: "image/png" };
    return { ...compact, width, height, layoutWidth: source.width, layoutHeight: source.height };
  } finally { image.close(); if (canvas) canvas.width = canvas.height = 0; }
}

export async function renderBoardNote(item, rect, signal, quality = "balanced") {
  signal?.throwIfAborted();
  const family = getComputedStyle(document.documentElement).getPropertyValue("--f-body").trim() || "system-ui, sans-serif";
  const font = `16px ${family}`;
  await document.fonts.load(font, item.text || "Note");
  await document.fonts.ready;
  signal?.throwIfAborted();
  const preset = pdfExportQuality(quality);
  const canvas = canvasFor(rect.w * preset.boardScale, rect.h * preset.boardScale);
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
    renderSow: renderBoardSow,
    async renderPdfPage(bytes, pageNumber, rect, signal, quality = "balanced") {
      signal?.throwIfAborted();
      const loading = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
      let canvas, task;
      const cancel = () => { task?.cancel(); loading.destroy().catch(() => {}); };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        const doc = await loading.promise, page = await doc.getPage(pageNumber);
        signal?.throwIfAborted();
        const preset = pdfExportQuality(quality);
        const native = page.getViewport({ scale: 1 });
        const layoutScale = Math.max(rect.w / native.width, rect.h / native.height) * preset.boardScale;
        const detailScale = preset.pageMaxDimension / Math.max(native.width, native.height);
        const requestedScale = Math.min(Math.max(layoutScale, detailScale), 6);
        const scale = safePdfRasterScale(native.width, native.height, requestedScale, preset.imageMaxPixels);
        const viewport = page.getViewport({ scale });
        canvas = canvasFor(viewport.width, viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        task = page.render({ canvasContext: context, viewport, background: "white", annotationMode: pdfjsLib.AnnotationMode.ENABLE });
        await task.promise;
        signal?.throwIfAborted();
        // PDF pages are intentionally flattened and JPEG-compressed for
        // distribution. This drops source OCR/text layers, fonts, annotations,
        // and complex vector resources while keeping the visible sheet crisp
        // at the user's Compact, Balanced, or HD export setting.
        return { bytes: await jpegBytes(canvas, preset.jpegQuality), type: "image/jpeg", width: canvas.width, height: canvas.height };
      } finally {
        signal?.removeEventListener("abort", cancel);
        task?.cancel();
        try { await loading.destroy(); }
        finally { if (canvas) canvas.width = canvas.height = 0; }
      }
    },
  };
}
