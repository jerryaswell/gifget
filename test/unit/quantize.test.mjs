import test from 'node:test';
import assert from 'node:assert/strict';
import { quantize } from '../../src/lib/quantize.js';
import { raster } from '../../src/lib/raster.js';
import { rng } from '../../src/lib/random.js';

const colourAt = (q, i) => q.palette[q.indices[i]];

test('a frame with few colours keeps them exactly', () => {
  const img = raster(4, 1, [0, 0, 0]);
  img.data.set([200, 10, 30, 255], 4);
  img.data.set([1, 2, 3, 255], 8);
  const q = quantize(img, 8);
  assert.equal(q.palette.length, 3);
  assert.deepEqual(colourAt(q, 1), [200, 10, 30]);
  assert.deepEqual(colourAt(q, 2), [1, 2, 3]);
  assert.deepEqual(colourAt(q, 3), [0, 0, 0]);
});

test('a busy frame comes down to n colours, each pixel near its own', () => {
  const random = rng(5);
  const img = raster(64, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    // two clusters: dark greens and bright magentas
    const base = random.chance(0.5) ? [10, 120, 20] : [230, 40, 210];
    for (let c = 0; c < 3; c++) img.data[i + c] = base[c] + random.int(-10, 10);
  }
  for (const n of [2, 8, 16]) {
    const q = quantize(img, n);
    assert.ok(q.palette.length <= n, q.palette.length + ' > ' + n);
    let worst = 0;
    for (let i = 0; i < 64 * 64; i++) {
      const p = colourAt(q, i);
      const d = Math.hypot(...[0, 1, 2].map((c) => p[c] - img.data[i * 4 + c]));
      worst = Math.max(worst, d);
    }
    assert.ok(worst < 40, 'worst error ' + worst.toFixed(1) + ' at ' + n + ' colours');
  }
});
