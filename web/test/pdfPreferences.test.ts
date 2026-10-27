import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PDF_PREFERENCES,
  loadPdfPreferences,
  pdfValidationModeForPreferences,
  PDF_OCR_MODES,
  PDF_OPEN_MODES,
  PDF_PREFERENCES_KEY,
  savePdfPreferences,
} from "../src/lib/pdfPreferences.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test("PDF preferences default safely and persist supported choices", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadPdfPreferences(storage as any), DEFAULT_PDF_PREFERENCES);
  const saved = savePdfPreferences({ openMode: PDF_OPEN_MODES.VERIFY, ocrMode: PDF_OCR_MODES.ASK }, storage as any);
  assert.deepEqual(saved, { openMode: "verify", ocrMode: "ask" });
  assert.equal(pdfValidationModeForPreferences(saved), "full");
  assert.equal(pdfValidationModeForPreferences(DEFAULT_PDF_PREFERENCES), "quick");
  assert.deepEqual(loadPdfPreferences(storage as any), saved);
});

test("PDF preferences ignore corrupt and unsupported stored values", () => {
  const corrupt = memoryStorage({ [PDF_PREFERENCES_KEY]: "{" });
  assert.deepEqual(loadPdfPreferences(corrupt as any), DEFAULT_PDF_PREFERENCES);
  const unsupported = memoryStorage({ [PDF_PREFERENCES_KEY]: JSON.stringify({ openMode: "unsafe", ocrMode: "remote" }) });
  assert.deepEqual(loadPdfPreferences(unsupported as any), DEFAULT_PDF_PREFERENCES);
});
