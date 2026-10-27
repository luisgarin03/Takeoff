import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKUP_TEXT_ASCENT_RATIO,
  MARKUP_TEXT_DESCENT_RATIO,
  MARKUP_TEXT_FONT_SIZE_PT,
  MARKUP_TEXT_LINE_HEIGHT_PT,
  MARKUP_TEXT_MAX_WIDTH_PT,
  MARKUP_TEXT_PAD_X_PT,
  MARKUP_TEXT_PAD_Y_PT,
  layoutBoxedMarkupText,
  measureCanvasMarkupText,
  scaleMarkupTextMetrics,
  wrapCanvasNoteText,
  wrapMeasuredMarkupText,
} from "../src/lib/canvasText.js";

test("canvas notes preserve explicit lines and wrap long paragraphs into a readable box", () => {
  assert.deepEqual(wrapCanvasNoteText("first line\nsecond line"), ["first line", "second line"]);
  assert.deepEqual(wrapCanvasNoteText("one two three four", 8), ["one two", "three", "four"]);
  assert.deepEqual(wrapCanvasNoteText("supercalifragilistic", 8), ["supercal", "ifragili", "stic"]);
  assert.deepEqual(wrapCanvasNoteText("first\n\nthird"), ["first", "", "third"]);
});

test("markup text measurement has a deterministic non-DOM fallback", () => {
  assert.ok(Math.abs(measureCanvasMarkupText("ACCESS", 12, 600) - 39.6) < 1e-9);
  assert.equal(measureCanvasMarkupText("", 12, 600), 0);
});

test("measured markup wrapping preserves explicit and blank lines", () => {
  const measureWidth = (text: string) => text.length;
  assert.deepEqual(
    wrapMeasuredMarkupText("one two three\n\nfour five\n", { measureWidth, maxTextWidth: 7 }),
    ["one two", "three", "", "four", "five", ""],
  );
});

test("measured markup wrapping splits tokens wider than the inner box", () => {
  const measureWidth = (text: string) => Array.from(text).length;
  assert.deepEqual(
    wrapMeasuredMarkupText("abcdefghij ok", { measureWidth, maxTextWidth: 4 }),
    ["abcd", "efgh", "ij", "ok"],
  );
});

test("boxed markup layout reports deterministic text and box geometry", () => {
  const layout = layoutBoxedMarkupText("aa bbbb", {
    measureWidth: (text: string) => text.length * 2,
    fontSize: 10,
    lineHeight: 13,
    maxTextWidth: 8,
    padX: 6,
    padY: 4,
  });

  assert.deepEqual(layout.lines, ["aa", "bbbb"]);
  assert.equal(layout.textWidth, 8);
  assert.equal(layout.width, 20);
  assert.equal(layout.height, 31);
  assert.deepEqual(layout.baselines, [11.8, 24.8]);
  assert.equal(layout.top, 4);
  assert.equal(layout.bottom, 27);
  assert.deepEqual(layout.lineMetrics, [
    { text: "aa", baseline: 11.8, top: 4, bottom: 14 },
    { text: "bbbb", baseline: 24.8, top: 17, bottom: 27 },
  ]);
});

test("point-space defaults and boxed layout scale proportionally", () => {
  assert.deepEqual(
    {
      fontSize: MARKUP_TEXT_FONT_SIZE_PT,
      lineHeight: MARKUP_TEXT_LINE_HEIGHT_PT,
      maxTextWidth: MARKUP_TEXT_MAX_WIDTH_PT,
      padX: MARKUP_TEXT_PAD_X_PT,
      padY: MARKUP_TEXT_PAD_Y_PT,
      ascentRatio: MARKUP_TEXT_ASCENT_RATIO,
      descentRatio: MARKUP_TEXT_DESCENT_RATIO,
    },
    {
      fontSize: 12,
      lineHeight: 15,
      maxTextWidth: 300,
      padX: 8,
      padY: 5,
      ascentRatio: 0.78,
      descentRatio: 0.22,
    },
  );

  const measureWidth = (text: string, fontSize: number) => text.length * fontSize * 0.5;
  const base = layoutBoxedMarkupText("wide words", {
    ...scaleMarkupTextMetrics(1),
    measureWidth,
  });
  const doubled = layoutBoxedMarkupText("wide words", {
    ...scaleMarkupTextMetrics(2),
    measureWidth,
  });

  assert.deepEqual(doubled.lines, base.lines);
  for (const key of ["textWidth", "width", "height", "top", "bottom"] as const) {
    assert.ok(Math.abs(doubled[key] - base[key] * 2) < 1e-9, key);
  }
  assert.deepEqual(
    doubled.baselines.map((baseline) => baseline / 2),
    base.baselines,
  );
});
