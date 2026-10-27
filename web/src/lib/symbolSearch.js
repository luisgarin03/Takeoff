// Local raster template matching. Scores measure similarity, not certainty.
export function binaryRaster({ width, height, data }) {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    const a = data[i * 4 + 3] / 255;
    const luminance = (data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114) * a + 255 * (1 - a);
    pixels[i] = luminance < 190 ? 1 : 0;
  }
  return { width, height, pixels };
}
export function cropSymbol(image, box) {
  const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y));
  const w = Math.min(image.width - x, Math.ceil(box.w)), h = Math.min(image.height - y, Math.ceil(box.h));
  if (w < 8 || h < 8 || w > 300 || h > 300) throw new Error('Select one symbol between 8 and 300 pixels wide and high. Zoom the preview if needed.');
  const pixels = new Uint8Array(w * h);
  let ink = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) ink += pixels[j * w + i] = image.pixels[(y + j) * image.width + x + i];
  if (ink < 8 || ink / pixels.length > .8) throw new Error('Select a visible symbol with some white space around it.');
  return { width: w, height: h, pixels };
}
function integral(image) {
  const stride = image.width + 1, sums = new Uint32Array(stride * (image.height + 1));
  for (let y = 0; y < image.height; y++) {
    let row = 0;
    for (let x = 0; x < image.width; x++) { row += image.pixels[y * image.width + x]; sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row; }
  }
  return (x, y, w, h) => sums[(y + h) * stride + x + w] - sums[y * stride + x + w] - sums[(y + h) * stride + x] + sums[y * stride + x];
}
function variant(template, scale, rotation) {
  const rw = rotation % 180 ? template.height : template.width, rh = rotation % 180 ? template.width : template.height;
  const w = Math.max(4, Math.round(rw * scale)), h = Math.max(4, Math.round(rh * scale)), pixels = new Uint8Array(w * h);
  const foreground = [], background = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = Math.min(rw - 1, Math.floor(x / w * rw)), v = Math.min(rh - 1, Math.floor(y / h * rh));
    const tx = rotation === 90 ? v : rotation === 180 ? template.width - 1 - u : rotation === 270 ? template.width - 1 - v : u;
    const ty = rotation === 90 ? template.height - 1 - u : rotation === 180 ? template.height - 1 - v : rotation === 270 ? u : v;
    const bit = template.pixels[ty * template.width + tx]; pixels[y * w + x] = bit;
    (bit ? foreground : background).push([x, y]);
  }
  const sample = (points) => points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 96)) === 0);
  return { w, h, ink: foreground.length, foreground: sample(foreground), background: sample(background), scale, rotation };
}
export function suppressSymbolOverlaps(candidates, limit = 250) {
  const kept = [];
  for (const hit of candidates.slice().sort((a, b) => b.score - a.score)) {
    if (kept.some((other) => {
      const overlap = Math.max(0, Math.min(hit.x + hit.w, other.x + other.w) - Math.max(hit.x, other.x)) * Math.max(0, Math.min(hit.y + hit.h, other.y + other.h) - Math.max(hit.y, other.y));
      return overlap / Math.min(hit.w * hit.h, other.w * other.h) > .35;
    })) continue;
    kept.push(hit); if (kept.length >= limit) break;
  }
  return kept;
}
export function searchSymbolRaster(image, template, { threshold = .88, scales = [.85, 1, 1.15], rotations = [0], limit = 250 } = {}) {
  if (!image?.pixels || !template?.pixels) throw new Error('Select a symbol before searching.');
  const sum = integral(image), candidates = [], stride = 2;
  const scoreAt = (x, y, t) => {
    const mass = sum(x, y, t.w, t.h);
    if (mass < t.ink * .55 || mass > t.ink * 1.65) return 0;
    let correct = 0;
    for (let i = 0; i < t.foreground.length; i++) {
      const [dx, dy] = t.foreground[i]; correct += image.pixels[(y + dy) * image.width + x + dx];
      // Most positions can be rejected after only a few samples.
      if (i === 15 && correct < 8) return 0;
    }
    const recall = correct / t.foreground.length;
    if (recall < threshold - .15) return 0;
    let clear = 0;
    for (const [dx, dy] of t.background) clear += 1 - image.pixels[(y + dy) * image.width + x + dx];
    return recall * .7 + (t.background.length ? clear / t.background.length : 1) * .3;
  };
  for (const rotation of rotations) for (const scale of scales) {
    const t = variant(template, scale, rotation);
    if (!t.ink || t.w > image.width || t.h > image.height) continue;
    // Check every other pixel, with a one-pixel refinement for thin linework.
    for (let y = 0; y <= image.height - t.h; y += stride) for (let x = 0; x <= image.width - t.w; x += stride) {
      let best = { score: 0, x, y };
      for (let dy = 0; dy < 2 && y + dy <= image.height - t.h; dy++) for (let dx = 0; dx < 2 && x + dx <= image.width - t.w; dx++) {
        const score = scoreAt(x + dx, y + dy, t);
        if (score > best.score) best = { score, x: x + dx, y: y + dy };
      }
      if (best.score >= threshold) candidates.push({ ...best, w: t.w, h: t.h, scale, rotation });
      if (candidates.length >= 10000) return { matches: suppressSymbolOverlaps(candidates, limit), limited: true };
    }
  }
  const matches = suppressSymbolOverlaps(candidates, limit + 1);
  return { matches: matches.slice(0, limit), limited: matches.length > limit };
}
export function symbolCountShapes(matches, conditionId, existing = []) {
  if (!conditionId) throw new Error('Choose a condition for these counts.');
  const additions = [];
  for (const hit of matches) {
    if (![hit.x, hit.y, hit.w, hit.h, hit.score].every(Number.isFinite) || hit.w <= 0 || hit.h <= 0 || hit.x < 0 || hit.y < 0 || hit.x + hit.w > 1.001 || hit.y + hit.h > 1.001 || !hit.key) continue;
    const point = [hit.x + hit.w / 2, hit.y + hit.h / 2];
    if ([...existing, ...additions].some((shape) => shape.sheet_id === hit.key && shape.condition_id === conditionId && shape.measure_role === 'count' && Math.abs(shape.verts_norm[0][0] - point[0]) < hit.w * .4 && Math.abs(shape.verts_norm[0][1] - point[1]) < hit.h * .4)) continue;
    additions.push({ sheet_id: hit.key, condition_id: conditionId, measure_role: 'count', verts_norm: [point], computed: { count: 1 }, origin: { method: 'manual', source: 'symbol_search', match_similarity: hit.score, reviewed: true } });
  }
  return additions;
}
