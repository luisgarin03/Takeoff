import assert from "node:assert/strict";
import test from "node:test";
import { findOcrLineMatches, ocrLinesFromBlocks, ocrWordsFromBlocks } from "../src/lib/findOcr.js";

test("OCR block lines are filtered and normalized", () => {
  const lines = ocrLinesFromBlocks([{ paragraphs: [{ lines: [
    { text: "  TRANSFORMER   FENCE  ", confidence: 91, bbox: { x0: 100, y0: 20, x1: 500, y1: 60 } },
    { text: "noise", confidence: 3, bbox: { x0: 0, y0: 0, x1: 20, y1: 10 } },
  ] }] }]);
  assert.deepEqual(lines, [{ str: "TRANSFORMER FENCE", x0: 100, y0: 20, x1: 500, y1: 60 }]);
});

test("OCR words retain tight selectable boxes and reading-order spaces", () => {
  const words = ocrWordsFromBlocks([{ paragraphs: [{ lines: [{ words: [
    { text: "OVERALL", confidence: 94, bbox: { x0: 10, y0: 20, x1: 80, y1: 40 } },
    { text: "PLAN", confidence: 92, bbox: { x0: 86, y0: 20, x1: 126, y1: 40 } },
    { text: "noise", confidence: 2, bbox: { x0: 130, y0: 20, x1: 145, y1: 40 } },
  ] }] }] }]);
  assert.deepEqual(words, [
    { str: "OVERALL ", x0: 10, y0: 20, x1: 80, y1: 40 },
    { str: "PLAN ", x0: 86, y0: 20, x1: 126, y1: 40 },
  ]);
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
