import assert from "node:assert/strict";
import test from "node:test";
import { findOcrLineMatches, ocrLinesFromBlocks } from "../src/lib/findOcr.js";

test("OCR block lines are filtered and normalized", () => {
  const lines = ocrLinesFromBlocks([{ paragraphs: [{ lines: [
    { text: "  TRANSFORMER   FENCE  ", confidence: 91, bbox: { x0: 100, y0: 20, x1: 500, y1: 60 } },
    { text: "noise", confidence: 3, bbox: { x0: 0, y0: 0, x1: 20, y1: 10 } },
  ] }] }]);
  assert.deepEqual(lines, [{ str: "TRANSFORMER FENCE", x0: 100, y0: 20, x1: 500, y1: 60 }]);
});

test("OCR matches retain page-normalized highlight boxes", () => {
  const lines = [{ str: "TRANSFORMER FENCE", x0: 100, y0: 20, x1: 500, y1: 60 }];
  const [match] = findOcrLineMatches(lines, ["fence"], 1000, 500);
  assert.equal(match.term, "fence");
  assert.equal(match.source, "ocr");
  assert.ok(match.x > 0.3 && match.x < 0.5);
  assert.equal(match.y, 0.04);
  assert.ok(match.w > 0.1);
  assert.equal(match.h, 0.08);
});
