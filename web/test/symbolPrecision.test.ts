import test from 'node:test';
import assert from 'node:assert/strict';
import { searchSymbolRaster } from '../src/lib/symbolSearch.js';

test('extra linework does not score like an exact symbol surrounded by white space', () => {
  const template = { width: 16, height: 16, pixels: new Uint8Array(256) };
  for (let i = 3; i < 13; i++) {
    template.pixels[8 * 16 + i] = 1;
    template.pixels[i * 16 + 8] = 1;
  }
  const image = { width: 64, height: 24, pixels: new Uint8Array(64 * 24) };
  for (const offset of [2, 36]) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    image.pixels[(y + 4) * 64 + x + offset] = template.pixels[y * 16 + x];
  }
  // A similar cross with unrelated surrounding ink used to pass the sampled
  // recall/white-background score despite being a substantially different crop.
  for (let x = 3; x < 13; x++) image.pixels[(4 + 4) * 64 + 36 + x] = 1;
  const result = searchSymbolRaster(image, template, { threshold: .85, scales: [1] });
  assert.ok(result.matches.some((hit) => hit.x === 2 && hit.y === 4 && hit.score === 1));
  assert.equal(result.matches.some((hit) => hit.x >= 30), false);
});
