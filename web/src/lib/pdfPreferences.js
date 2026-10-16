import { PDF_VALIDATION_MODES } from "./pdfCompatibility.js";

export const PDF_PREFERENCES_KEY = "opentakeoff.pdf-preferences";

export const PDF_OPEN_MODES = Object.freeze({
  FAST: "fast",
  VERIFY: "verify",
});

export const PDF_OCR_MODES = Object.freeze({
  AUTO: "auto",
  ASK: "ask",
  OFF: "off",
});

export const DEFAULT_PDF_PREFERENCES = Object.freeze({
  openMode: PDF_OPEN_MODES.FAST,
  ocrMode: PDF_OCR_MODES.AUTO,
});

export function normalizePdfPreferences(value) {
  return {
    openMode: Object.values(PDF_OPEN_MODES).includes(value?.openMode)
      ? value.openMode
      : DEFAULT_PDF_PREFERENCES.openMode,
    ocrMode: Object.values(PDF_OCR_MODES).includes(value?.ocrMode)
      ? value.ocrMode
      : DEFAULT_PDF_PREFERENCES.ocrMode,
  };
}

export function pdfValidationModeForPreferences(value) {
  return normalizePdfPreferences(value).openMode === PDF_OPEN_MODES.VERIFY
    ? PDF_VALIDATION_MODES.FULL
    : PDF_VALIDATION_MODES.QUICK;
}

export function loadPdfPreferences(storage = globalThis.localStorage) {
  try {
    return normalizePdfPreferences(JSON.parse(storage?.getItem(PDF_PREFERENCES_KEY) || "null"));
  } catch {
    return { ...DEFAULT_PDF_PREFERENCES };
  }
}

export function savePdfPreferences(value, storage = globalThis.localStorage) {
  const normalized = normalizePdfPreferences(value);
  try { storage?.setItem(PDF_PREFERENCES_KEY, JSON.stringify(normalized)); }
  catch { /* Private browsing or a full storage quota keeps the session setting only. */ }
  return normalized;
}
