import test from 'node:test';
import assert from 'node:assert/strict';
import { svgPlacedBox, transformPath } from '../src/lib/svgpath.js';

test('saved four-value symbol bounds render the same as two-value bounds', () => {
  const expected = svgPlacedBox([.02, .01], .02, 1600);
  const saved = svgPlacedBox([0, 0, .02, .01], .02, 1600);
  assert.deepEqual(saved, expected);
  assert.equal(saved.bw, 32);
  assert.equal(saved.bh, 16);
  assert.ok(saved.s > 0);
  const path = transformPath('M0 0 H.02 V.01 H0 Z', (x: number, y: number) => [100 + x * saved.s, 200 + y * saved.s]);
  assert.ok(path.includes('132'));
  assert.ok(path.includes('216'));
});
