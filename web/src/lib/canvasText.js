export const MARKUP_TEXT_FONT_SIZE_PT = 12;
export const MARKUP_TEXT_LINE_HEIGHT_PT = 15;
export const MARKUP_TEXT_MAX_WIDTH_PT = 300;
export const MARKUP_TEXT_PAD_X_PT = 8;
export const MARKUP_TEXT_PAD_Y_PT = 5;
export const MARKUP_TEXT_ASCENT_RATIO = 0.78;
export const MARKUP_TEXT_DESCENT_RATIO = 0.22;
export const MARKUP_TEXT_MAX_CHARS = 42;
export const MARKUP_TEXT_FONT_FAMILY = "Arial, Helvetica, sans-serif";

export const MARKUP_TEXT_METRICS_PT = Object.freeze({
  fontSize: MARKUP_TEXT_FONT_SIZE_PT,
  lineHeight: MARKUP_TEXT_LINE_HEIGHT_PT,
  maxTextWidth: MARKUP_TEXT_MAX_WIDTH_PT,
  padX: MARKUP_TEXT_PAD_X_PT,
  padY: MARKUP_TEXT_PAD_Y_PT,
  ascentRatio: MARKUP_TEXT_ASCENT_RATIO,
  descentRatio: MARKUP_TEXT_DESCENT_RATIO,
});

function positiveFinite(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function fallbackMarkupWidth(value, fontSize) {
  return Array.from(String(value ?? "")).length * fontSize * 0.55;
}

function widthMeasurer(measureWidth, fontSize) {
  return (value) => {
    const fallback = fallbackMarkupWidth(value, fontSize);
    if (typeof measureWidth !== "function") return fallback;
    try {
      const measured = measureWidth(value, fontSize);
      const width = typeof measured === "number" ? measured : measured?.width;
      return Number.isFinite(width) && width >= 0 ? width : fallback;
    } catch {
      return fallback;
    }
  };
}

// Convert the canonical point-space metrics to any other coordinate space.
// For example, a canvas renderer can pass its point-to-stage-pixel ratio.
export function scaleMarkupTextMetrics(scale = 1) {
  const factor = Number(scale);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError("Markup text scale must be a positive finite number");
  }
  return {
    fontSize: MARKUP_TEXT_FONT_SIZE_PT * factor,
    lineHeight: MARKUP_TEXT_LINE_HEIGHT_PT * factor,
    maxTextWidth: MARKUP_TEXT_MAX_WIDTH_PT * factor,
    padX: MARKUP_TEXT_PAD_X_PT * factor,
    padY: MARKUP_TEXT_PAD_Y_PT * factor,
    ascentRatio: MARKUP_TEXT_ASCENT_RATIO,
    descentRatio: MARKUP_TEXT_DESCENT_RATIO,
  };
}

function splitTokenToWidth(token, maxTextWidth, measure) {
  const chars = Array.from(token);
  const parts = [];
  let offset = 0;

  while (offset < chars.length) {
    let low = 1;
    let high = chars.length - offset;
    let fit = 1; // Always consume one code point, even if one glyph is oversized.

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = chars.slice(offset, offset + middle).join("");
      if (measure(candidate) <= maxTextWidth) {
        fit = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    parts.push(chars.slice(offset, offset + fit).join(""));
    offset += fit;
  }

  return parts;
}

// Word-wrap with actual glyph measurements. Explicit newlines (including
// blank ones) remain distinct output lines, and overlong tokens are split.
export function wrapMeasuredMarkupText(value, options = {}) {
  const fontSize = positiveFinite(options.fontSize, MARKUP_TEXT_FONT_SIZE_PT);
  const maxTextWidth = positiveFinite(
    options.maxTextWidth ?? options.maxWidth,
    MARKUP_TEXT_MAX_WIDTH_PT,
  );
  const measure = widthMeasurer(options.measureWidth, fontSize);
  const lines = [];

  for (const paragraph of String(value ?? "").split(/\r\n?|\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxTextWidth) {
        line = candidate;
        continue;
      }

      if (line) {
        lines.push(line);
        line = "";
      }

      if (measure(word) <= maxTextWidth) {
        line = word;
        continue;
      }

      const parts = splitTokenToWidth(word, maxTextWidth, measure);
      lines.push(...parts.slice(0, -1));
      line = parts.at(-1) || "";
    }
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

// Lay out boxed markup in the caller's coordinate space. top/bottom describe
// the text's glyph bounds relative to the box; the box itself spans 0..height.
export function layoutBoxedMarkupText(value, options = {}) {
  const fontSize = positiveFinite(options.fontSize, MARKUP_TEXT_FONT_SIZE_PT);
  const lineHeight = positiveFinite(options.lineHeight, MARKUP_TEXT_LINE_HEIGHT_PT);
  const maxTextWidth = positiveFinite(options.maxTextWidth, MARKUP_TEXT_MAX_WIDTH_PT);
  const padX = Number.isFinite(options.padX) && options.padX >= 0
    ? options.padX
    : MARKUP_TEXT_PAD_X_PT;
  const padY = Number.isFinite(options.padY) && options.padY >= 0
    ? options.padY
    : MARKUP_TEXT_PAD_Y_PT;
  const ascentRatio = positiveFinite(options.ascentRatio, MARKUP_TEXT_ASCENT_RATIO);
  const descentRatio = positiveFinite(options.descentRatio, MARKUP_TEXT_DESCENT_RATIO);
  const measure = widthMeasurer(options.measureWidth, fontSize);
  const lines = wrapMeasuredMarkupText(value, { measureWidth: measure, fontSize, maxTextWidth });
  const textWidth = Math.max(0, ...lines.map(measure));
  const ascent = fontSize * ascentRatio;
  const descent = fontSize * descentRatio;
  const baselines = lines.map((_, index) => padY + ascent + index * lineHeight);
  const top = baselines[0] - ascent;
  const bottom = baselines.at(-1) + descent;
  const lineMetrics = lines.map((text, index) => ({
    text,
    baseline: baselines[index],
    top: baselines[index] - ascent,
    bottom: baselines[index] + descent,
  }));

  return {
    lines,
    textWidth,
    width: textWidth + padX * 2,
    height: bottom + padY,
    baselines,
    top,
    bottom,
    lineMetrics,
    fontSize,
    lineHeight,
    maxTextWidth,
    padX,
    padY,
    ascent,
    descent,
  };
}

// Wrap estimating-canvas notes into predictable screen-sized annotation boxes.
export function wrapCanvasNoteText(value, maxChars = MARKUP_TEXT_MAX_CHARS) {
  const lines = [];
  for (const paragraph of String(value || "").split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (word.length > maxChars) {
        if (line) { lines.push(line); line = ""; }
        for (let offset = 0; offset < word.length; offset += maxChars) {
          const part = word.slice(offset, offset + maxChars);
          if (offset + maxChars < word.length) lines.push(part);
          else line = part;
        }
        continue;
      }
      if (line && line.length + word.length + 1 > maxChars) { lines.push(line); line = word; }
      else line += `${line ? " " : ""}${word}`;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

let markupMeasureContext = null;

// SVG does not expose a useful text width until after paint. Measure with the
// same browser font up front so annotation backgrounds fit their actual glyphs
// instead of guessing from character count (which leaves narrow text offset).
export function measureCanvasMarkupText(value, size = 12, weight = 400) {
  const text = String(value || "");
  try {
    if (!markupMeasureContext && typeof document !== "undefined") {
      markupMeasureContext = document.createElement("canvas").getContext("2d");
    }
    if (markupMeasureContext) {
      // The PDF exporter uses the standard Helvetica face. Arial is its
      // browser-safe metric twin, keeping live wrapping/background bounds as
      // close as possible to the generated PDF instead of measuring in Inter.
      markupMeasureContext.font = `${weight} ${size}px ${MARKUP_TEXT_FONT_FAMILY}`;
      return markupMeasureContext.measureText(text).width;
    }
  } catch { /* deterministic fallback for tests/non-DOM renderers */ }
  return text.length * size * 0.55;
}
