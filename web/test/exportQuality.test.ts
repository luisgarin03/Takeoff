import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PDF_EXPORT_QUALITY,
  estimatePdfExportSize,
  formatFileSize,
  formatFileSizeRange,
  pdfExportQuality,
  rasterPixelsForPage,
  safePdfRasterScale,
} from "../src/lib/exportQuality.js";

test("PDF export quality presets default safely and increase raster detail", () => {
  assert.equal(pdfExportQuality().id, DEFAULT_PDF_EXPORT_QUALITY);
  assert.equal(pdfExportQuality("unknown").id, DEFAULT_PDF_EXPORT_QUALITY);
  assert.equal(pdfExportQuality({ id: "hd" }).id, "hd");

  const compact = rasterPixelsForPage(1600, 1000, "compact");
  const balanced = rasterPixelsForPage(1600, 1000, "balanced");
  const hd = rasterPixelsForPage(1600, 1000, "hd");
  assert.ok(compact < balanced);
  assert.ok(balanced < hd);
});

test("large HD pages fit the raster budget after integer canvas rounding", () => {
  for (const [width, height] of [[612, 792], [2592, 1728], [5000, 5000]]) {
    const scale = safePdfRasterScale(width, height, 20);
    const rasterWidth = Math.ceil(width * scale), rasterHeight = Math.ceil(height * scale);
    assert.ok(rasterWidth <= 8192);
    assert.ok(rasterHeight <= 8192);
    assert.ok(rasterWidth * rasterHeight <= 16_000_000);
  }
});

test("PDF export estimates are ordered, formatted ranges", () => {
  const source = { width: 1600, height: 1000, pages: 3, vectorItems: 80 };
  const compact = estimatePdfExportSize(source, "compact");
  const balanced = estimatePdfExportSize(source, "balanced");
  const hd = estimatePdfExportSize(source, "hd");
  assert.ok(compact.low < compact.high);
  assert.ok(compact.high < balanced.high);
  assert.ok(balanced.high < hd.high);
  assert.match(formatFileSizeRange(balanced), /^~.+–.+$/);
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(1024), "1 KB");
});
