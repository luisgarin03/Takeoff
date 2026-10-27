export const PDF_EXPORT_QUALITY_KEY = "opentakeoff.pdf-export-quality";
export const PDF_EXPORT_MAX_RASTER_PIXELS = 16_000_000;
export const PDF_EXPORT_MAX_RASTER_DIMENSION = 8192;

export const PDF_EXPORT_QUALITIES = Object.freeze([
  Object.freeze({
    id: "compact", label: "Compact", badge: "Smallest file",
    description: "Readable construction-plan detail with stronger compression for email.",
    pageMaxDimension: 3200, jpegQuality: 0.82, boardScale: 2.5,
    imageMaxDimension: 3200, imageMaxPixels: 8_000_000, estimateBpp: [0.055, 0.13],
  }),
  Object.freeze({
    id: "balanced", label: "Balanced", badge: "Recommended",
    description: "Crisp small notes and dimensions with efficient compression for everyday use.",
    pageMaxDimension: 4200, jpegQuality: 0.9, boardScale: 3,
    imageMaxDimension: 4200, imageMaxPixels: 13_000_000, estimateBpp: [0.075, 0.17],
  }),
  Object.freeze({
    id: "hd", label: "HD", badge: "Sharpest",
    description: "Maximum safe detail for tiny callouts; oversized sheets are fitted automatically.",
    pageMaxDimension: 5200, jpegQuality: 0.94, boardScale: 4,
    imageMaxDimension: 5200, imageMaxPixels: PDF_EXPORT_MAX_RASTER_PIXELS, estimateBpp: [0.1, 0.23],
  }),
]);

export const DEFAULT_PDF_EXPORT_QUALITY = "balanced";

export function pdfExportQuality(value) {
  const id = typeof value === "object" && value ? value.id : value;
  return PDF_EXPORT_QUALITIES.find((quality) => quality.id === id) || PDF_EXPORT_QUALITIES[1];
}

export function loadPdfExportQuality() {
  try { return pdfExportQuality(localStorage.getItem(PDF_EXPORT_QUALITY_KEY)).id; }
  catch { return DEFAULT_PDF_EXPORT_QUALITY; }
}

export function savePdfExportQuality(value) {
  const id = pdfExportQuality(value).id;
  try { localStorage.setItem(PDF_EXPORT_QUALITY_KEY, id); } catch { /* private storage can be unavailable */ }
  return id;
}

/** Return the largest scale that fits the browser-safe raster limits after
 * integer canvas rounding. This keeps HD exports from failing one or two
 * pixels over the nominal megapixel budget on large or square sheets. */
export function safePdfRasterScale(width, height, requestedScale, maxPixels = PDF_EXPORT_MAX_RASTER_PIXELS,
  maxDimension = PDF_EXPORT_MAX_RASTER_DIMENSION) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const requested = Math.max(Number.EPSILON, Number(requestedScale) || 1);
  const pixelLimit = Math.max(1, Number(maxPixels) || PDF_EXPORT_MAX_RASTER_PIXELS);
  const dimensionLimit = Math.max(1, Number(maxDimension) || PDF_EXPORT_MAX_RASTER_DIMENSION);
  const fits = (scale) => {
    const rw = Math.ceil(w * scale), rh = Math.ceil(h * scale);
    return rw <= dimensionLimit && rh <= dimensionLimit && rw * rh <= pixelLimit;
  };
  let high = Math.min(requested, dimensionLimit / Math.max(w, h), Math.sqrt(pixelLimit / (w * h)));
  if (fits(high)) return high;
  let low = 0;
  for (let index = 0; index < 36; index += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return Math.max(Number.EPSILON, low);
}

export function rasterPixelsForPage(width, height, quality) {
  const preset = pdfExportQuality(quality);
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const requestedScale = Math.min(preset.pageMaxDimension / Math.max(w, h), 6);
  const scale = safePdfRasterScale(w, h, requestedScale, preset.imageMaxPixels);
  return Math.max(1, Math.ceil(w * scale) * Math.ceil(h * scale));
}

export function estimatePdfExportSize({ width = 1600, height = 1100, pages = 1, rasterPixels = null, vectorItems = 0 } = {}, quality) {
  const preset = pdfExportQuality(quality);
  const pageCount = Math.max(1, Math.round(Number(pages) || 1));
  const pixels = Number.isFinite(rasterPixels) && rasterPixels > 0
    ? rasterPixels
    : rasterPixelsForPage(width, height, preset) * pageCount;
  const overhead = pageCount * 12_000 + Math.max(0, Number(vectorItems) || 0) * 110;
  return {
    low: Math.max(20_000, Math.round(pixels * preset.estimateBpp[0] + overhead)),
    high: Math.max(45_000, Math.round(pixels * preset.estimateBpp[1] + overhead)),
  };
}

export function formatFileSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(value < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function formatFileSizeRange(range) {
  if (!range) return "Estimating…";
  return `~${formatFileSize(range.low)}–${formatFileSize(range.high)}`;
}
