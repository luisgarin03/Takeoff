export const WHITEBOARD_PDF_PREVIEW_MAX_DIMENSION = 1400;
export const WHITEBOARD_PDF_PREVIEW_MAX_PIXELS = 8_000_000;
const WHITEBOARD_PDF_LAYOUT_MAX_SCALE = 2;

// Bound both the longest edge and total pixels to avoid unbounded canvas
// allocations for large-format drawings at high preview resolution.
export function whiteboardPdfPreviewScale(width, height, resolution = 1) {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return 1;
  const factor = Number.isFinite(resolution) ? Math.max(1, Math.min(3, resolution)) : 1;
  const dimensionLimit = WHITEBOARD_PDF_PREVIEW_MAX_DIMENSION * factor;
  const pixelLimitScale = Math.sqrt(WHITEBOARD_PDF_PREVIEW_MAX_PIXELS / (width * height));
  return Math.min(dimensionLimit / Math.max(width, height), pixelLimitScale);
}

// PDF detail controls only the backing-store resolution. Keep one stable 1x
// logical footprint so changing detail cannot move a PDF under board drawings,
// and so the exporter can use the exact same contain geometry as the preview.
export function whiteboardPdfLayoutSize(width, height) {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return { width: 1, height: 1 };
  // This is the pre-detail-slider footprint used by both the original preview
  // and exporter. Keep it independent from the 1x-3x raster setting.
  const scale = Math.min(WHITEBOARD_PDF_LAYOUT_MAX_SCALE, WHITEBOARD_PDF_PREVIEW_MAX_DIMENSION / Math.max(width, height));
  return { width: Math.ceil(width * scale), height: Math.ceil(height * scale) };
}
