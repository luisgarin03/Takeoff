// Visual markers for Linear takeoffs. These are condition styling only: they
// never enter geometry, calibration, snapping, or quantity calculations.

export const LINE_MARKERS = Object.freeze({
  none: { label: "No mark", glyph: "—" },
  circle: { label: "Circles", glyph: "○" },
  x: { label: "X marks", glyph: "×" },
});

export const LINE_MARKER_IDS = Object.freeze(Object.keys(LINE_MARKERS));

// Older projects predate this field. No mark preserves their original plain
// line appearance until the estimator explicitly chooses circles or X marks.
export function normalizeLineMarker(value) {
  return LINE_MARKER_IDS.includes(value) ? value : "none";
}

// Return evenly spaced points along an open polyline. The caller chooses the
// units (screen-relative stage px on canvas, page-relative image px in PDF
// export). Short runs still receive one marker at their midpoint.
export function linearMarkerPoints(points, spacing) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(Number(b?.[0]) - Number(a?.[0]), Number(b?.[1]) - Number(a?.[1]));
    if (!Number.isFinite(length) || length <= 1e-6) continue;
    segments.push({ a, b, start: total, length });
    total += length;
  }
  if (!segments.length || total <= 1e-6) return [];

  const gap = Math.max(1, Number(spacing) || 1);
  const distances = total <= gap
    ? [total / 2]
    : Array.from({ length: Math.max(1, Math.ceil(total / gap) - 1) }, (_, index) => gap * (index + 1));
  const out = [];
  let segIndex = 0;
  for (const distance of distances) {
    while (segIndex + 1 < segments.length && distance > segments[segIndex].start + segments[segIndex].length) segIndex++;
    const segment = segments[segIndex];
    const t = Math.max(0, Math.min(1, (distance - segment.start) / segment.length));
    out.push([
      Number(segment.a[0]) + (Number(segment.b[0]) - Number(segment.a[0])) * t,
      Number(segment.a[1]) + (Number(segment.b[1]) - Number(segment.a[1])) * t,
    ]);
  }
  return out;
}
