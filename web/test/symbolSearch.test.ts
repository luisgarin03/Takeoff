import test from 'node:test';
import assert from 'node:assert/strict';
import { binaryRaster, cropSymbol, searchSymbolRaster, suppressSymbolOverlaps, symbolCountShapes } from '../src/lib/symbolSearch.js';
function raster(width: number, height: number) { return { width, height, pixels: new Uint8Array(width * height) }; }
function symbol() {
  const t = raster(16, 20);
  for (let y = 3; y < 17; y++) for (let x = 3; x < 13; x++) if (x === 3 || y === 16 || (x === 12 && y < 9) || (y === 3 && x < 9)) t.pixels[y * t.width + x] = 1;
  return t;
}
function stamp(image: ReturnType<typeof raster>, t: ReturnType<typeof raster>, x: number, y: number, rotation = false) {
  for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) {
    const dx = rotation ? t.height - 1 - j : i, dy = rotation ? i : j;
    image.pixels[(y + dy) * image.width + x + dx] = t.pixels[j * t.width + i];
  }
}
test('symbol matching finds repeated symbols at odd offsets and the page edge without duplicate boxes', () => {
  const image = raster(100, 70), t = symbol();
  stamp(image, t, 5, 7); stamp(image, t, 51, 31); stamp(image, t, 84, 50);
  const result = searchSymbolRaster(image, t, { scales: [1], threshold: .98 });
  assert.equal(result.matches.length, 3);
  assert.deepEqual(result.matches.map((m) => [m.x, m.y]).sort(), [[5, 7], [51, 31], [84, 50]].sort());
  assert.equal(searchSymbolRaster(raster(80, 80), t).matches.length, 0);
});
test('quarter-turn matching is optional and blank/solid references are rejected', () => {
  const image = raster(80, 80), t = symbol(); stamp(image, t, 21, 19, true);
  assert.equal(searchSymbolRaster(image, t, { scales: [1], threshold: .98 }).matches.length, 0);
  const found = searchSymbolRaster(image, t, { scales: [1], rotations: [0, 90, 180, 270], threshold: .98 }).matches;
  assert.equal(found.length, 1); assert.equal(found[0].rotation, 90);
  assert.throws(() => cropSymbol(raster(20, 20), { x: 0, y: 0, w: 20, h: 20 }));
  const solid = raster(20, 20); solid.pixels.fill(1);
  assert.throws(() => cropSymbol(solid, { x: 0, y: 0, w: 20, h: 20 }));
});
test('transparent pixels are composited onto white before matching', () => {
  const image = binaryRaster({ width: 3, height: 1, data: new Uint8ClampedArray([0,0,0,0, 0,0,0,255, 255,255,255,255]) });
  assert.deepEqual([...image.pixels], [0,1,0]);
});
test('overlap suppression preserves nearby distinct symbols and honors result caps', () => {
  const a = { x: 10, y: 10, w: 20, h: 20, score: .95 };
  assert.deepEqual(suppressSymbolOverlaps([a, { ...a, x: 11, score: .9 }, { ...a, x: 40 }]), [a, { ...a, x: 40 }]);
  assert.equal(suppressSymbolOverlaps([a, { ...a, x: 40 }], 1).length, 1);
});
test('reviewed count conversion uses normalized centers, preserves pages, and skips existing counts', () => {
  const hit = { key: 'plans.pdf#2', x: .2, y: .4, w: .1, h: .2, score: .94 };
  const shapes = symbolCountShapes([hit, hit], 'gates');
  assert.equal(shapes.length, 1);
  assert.deepEqual(shapes[0].verts_norm, [[.25, .5]]);
  assert.equal(shapes[0].sheet_id, hit.key); assert.equal(shapes[0].computed.count, 1);
  assert.equal(shapes[0].origin.reviewed, true);
  assert.equal(symbolCountShapes([hit], 'gates', shapes).length, 0);
  assert.equal(symbolCountShapes([{ ...hit, key: 'plans.pdf' }], 'gates', shapes).length, 1);
  assert.equal(symbolCountShapes([{ ...hit, x: NaN }, { ...hit, x: 2 }], 'gates').length, 0);
  assert.throws(() => symbolCountShapes([hit], ''));
});

test('matching handles the supported approximate size variations', () => {
  const original = symbol(), scaled = raster(Math.round(original.width * 1.15), Math.round(original.height * 1.15));
  for (let y = 0; y < scaled.height; y++) for (let x = 0; x < scaled.width; x++) scaled.pixels[y * scaled.width + x] = original.pixels[Math.floor(y / scaled.height * original.height) * original.width + Math.floor(x / scaled.width * original.width)];
  const image = raster(100, 100); stamp(image, scaled, 35, 41);
  const result = searchSymbolRaster(image, original, { threshold: .98 });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].scale, 1.15);
  assert.equal(result.matches[0].x, 35); assert.equal(result.matches[0].y, 41);
});
