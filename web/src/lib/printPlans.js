import { PDFDocument } from "pdf-lib";
import { pdfExportQuality } from "./exportQuality.js";

export function printPageLayout(width, height, settings) {
  const sizes = { letter: [612, 792], legal: [612, 1008], tabloid: [792, 1224], a4: [595.28, 841.89], a3: [841.89, 1190.55], archd: [1728, 2592] };
  let [w, h] = settings.paper === "original" ? [width, height] : (sizes[settings.paper] || sizes.letter);
  const landscape = settings.layout === "landscape" || (settings.layout === "auto" && width > height);
  [w, h] = landscape ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
  const margin = Number(settings.margin) || 0;
  const scale = Math.min((w - 2 * margin) / width, (h - 2 * margin) / height);
  return { size: [w, h], x: (w - width * scale) / 2, y: (h - height * scale) / 2, width: width * scale, height: height * scale };
}

export async function buildPrintDocument(pages, settings, renderSheet, progress, cancelled) {
  const output = await PDFDocument.create();
  for (const [index, sheet] of pages.entries()) {
    if (cancelled()) throw new Error("Printing cancelled.");
    progress(`Preparing page ${index + 1} of ${pages.length} · ${sheet.label}`);
    const bytes = await renderSheet(sheet, settings);
    if (cancelled()) throw new Error("Printing cancelled.");
    const source = await PDFDocument.load(bytes);
    const original = source.getPage(0);
    const placement = printPageLayout(original.getWidth(), original.getHeight(), settings);
    const page = output.addPage(placement.size);
    if (settings.grayscale) {
      const pdfjs = await import("pdfjs-dist");
      const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      let canvas;
      try {
        const pdf = await task.promise;
        const sourcePage = await pdf.getPage(1);
        const native = sourcePage.getViewport({ scale: 1 });
        const preset = pdfExportQuality(settings.quality);
        const scale = Math.min(preset.pageMaxDimension / Math.max(native.width, native.height), Math.sqrt(15_000_000 / (native.width * native.height)));
        const viewport = sourcePage.getViewport({ scale });
        canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        await sourcePage.render({ canvasContext: ctx, viewport, background: "white" }).promise;
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const gray = Math.round(.2126 * pixels.data[i] + .7152 * pixels.data[i + 1] + .0722 * pixels.data[i + 2]);
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
        }
        ctx.putImageData(pixels, 0, 0);
        const image = await output.embedJpg(canvas.toDataURL("image/jpeg", preset.jpegQuality));
        page.drawImage(image, placement);
      } finally { if (canvas) { canvas.width = 0; canvas.height = 0; } await task.destroy(); }
    } else {
      const [embedded] = await output.embedPages([original]);
      page.drawPage(embedded, placement);
    }
  }
  if (cancelled()) throw new Error("Printing cancelled.");
  return output.save();
}
