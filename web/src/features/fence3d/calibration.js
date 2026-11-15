import { RENDER_SCALE, parseSheetKey } from "../../lib/sheets";
import { autoRenderScale } from "../../lib/canvasUtil.js";
import { uppFor } from "../../lib/panelGeometry.js";

export async function renderFencePlan(key, getDocument, maxSize, signal) {
  const { file, page } = parseSheetKey(key);
  const pdf = await getDocument(file);
  signal.throwIfAborted();
  const source = await pdf.getPage(page);
  signal.throwIfAborted();
  const base = source.getViewport({ scale: 1 });
  const scale = Math.min(RENDER_SCALE, maxSize / Math.max(base.width, base.height));
  const viewport = source.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const task = source.render({ canvasContext: canvas.getContext("2d"), viewport, background: "#fff" });
  const cancel = () => task.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
    return canvas;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

export async function readFenceCalibration({ key, scales, images, renderScales, getDocument }) {
  const feetPerPixel = uppFor(scales, renderScales, key);
  if (!(feetPerPixel > 0)) return null;
  const image = images[key];
  if (image?.w > 0 && image?.h > 0) return { width: image.w, height: image.h, feetPerPixel };
  const { file, page } = parseSheetKey(key);
  const pdf = await getDocument(file);
  const source = await pdf.getPage(page);
  const base = source.getViewport({ scale: 1 });
  const scale = Math.min(RENDER_SCALE, autoRenderScale(base.width, base.height));
  const viewport = source.getViewport({ scale });
  return { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height), feetPerPixel: scales[key] * RENDER_SCALE / scale };
}
