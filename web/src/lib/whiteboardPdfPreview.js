export const WHITEBOARD_PDF_PREVIEW_MAX_DIMENSION = 1400;
export const WHITEBOARD_PDF_PREVIEW_MAX_PIXELS = 8_000_000;

// Bound both the longest edge and total pixels to avoid unbounded canvas
// allocations for large-format drawings at high preview resolution.
export function whiteboardPdfPreviewScale(width, height, resolution = 1) {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return 1;
  const factor = Number.isFinite(resolution) ? Math.max(1, Math.min(3, resolution)) : 1;
  const dimensionLimit = WHITEBOARD_PDF_PREVIEW_MAX_DIMENSION * factor;
  const pixelLimitScale = Math.sqrt(WHITEBOARD_PDF_PREVIEW_MAX_PIXELS / (width * height));
  return Math.min(dimensionLimit / Math.max(width, height), pixelLimitScale);
}
