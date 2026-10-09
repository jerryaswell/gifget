import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crush,
  draw,
  pixelate,
  posterize,
  raster,
  tearCols,
  tearRows,
} from '../../src/lib/raster.js';
import { rng } from '../../src/lib/random.js';

const noise = (w, h, seed) => {
  const random = rng(seed);
  const img = raster(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = random.int(0, 255);
    img.data[i + 1] = random.int(0, 255);
    img.data[i + 2] = random.int(0, 255);
  }
  return img;
};
const row = (img, y) => [...img.data.subarray(y * img.w * 4, (y + 1) * img.w * 4)];
const px = (img, x, y) => [...img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 3)];

test('the same seed draws the same numbers', () => {
  const a = rng(9);
  const b = rng(9);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  assert.notEqual(rng(1)(), rng(2)());
});

test('a wrapped row tear rotates each row, so a tile stays seamless', () => {
  const img = noise(16, 8, 3);
  const before = row(img, 2);
  tearRows(img, 2, 3, 5);
  const after = row(img, 2);
  for (let x = 0; x < 16; x++) {
    assert.deepEqual(
      after.slice(x * 4, x * 4 + 4),
      before.slice(((x - 5 + 16) % 16) * 4, ((x - 5 + 16) % 16) * 4 + 4)
    );
  }
});

test('a fractional shift still moves whole pixels', () => {
  // a fractional tear once read pixels a byte or two out of line: alpha leaked
  // into green and drew bright stripes across the frame
  const img = raster(10, 2, [5, 2, 1]);
  tearRows(img, 0, 1, -37.5 / 10);
  tearCols(img, 0, 9, 1.5);
  for (let i = 0; i < img.data.length; i += 4) {
    assert.deepEqual([...img.data.subarray(i, i + 4)], [5, 2, 1, 255]);
  }
});

test('random whole numbers stay whole, even from fractional bounds', () => {
  const random = rng(8);
  for (let i = 0; i < 200; i++) {
    const n = random.int(-37.5, 37.5);
    assert.ok(Number.isInteger(n) && n >= -37 && n <= 37, String(n));
  }
});

test('a column tear moves pixels down, wrapping', () => {
  const img = noise(4, 6, 4);
  const top = px(img, 1, 0);
  tearCols(img, 1, 1, 2);
  assert.deepEqual(px(img, 1, 2), top);
});

test('pixelate turns k×k blocks into one colour', () => {
  const img = pixelate(noise(12, 12, 6), 3);
  for (let by = 0; by < 12; by += 3) {
    for (let bx = 0; bx < 12; bx += 3) {
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 3; i++) assert.deepEqual(px(img, bx + i, by + j), px(img, bx, by));
    }
  }
});

test('posterize keeps only the top bits', () => {
  const img = posterize(raster(1, 1, [255, 100, 63]), 2);
  assert.deepEqual(px(img, 0, 0), [192, 64, 0]);
});

test('crush sends anything near white back to near black', () => {
  const img = raster(3, 1);
  img.data.set([250, 250, 250, 255], 0);
  img.data.set([170, 165, 168, 255], 4);
  img.data.set([200, 30, 30, 255], 8);
  crush(img);
  assert.deepEqual(px(img, 0, 0), [10, 5, 5]);
  assert.deepEqual(px(img, 1, 0), [10, 5, 5], 'flat and bright counts too');
  assert.deepEqual(px(img, 2, 0), [200, 30, 30], 'saturated colour is left alone');
});

test('draw mirrors a sprite given a negative horizontal scale', () => {
  const sprite = raster(4, 2, [255, 255, 255], 0);
  sprite.data.set([255, 0, 0, 255], 0); // top-left pixel only
  const plain = draw(raster(8, 4), sprite, 4, 2);
  const flipped = draw(raster(8, 4), sprite, 4, 2, { sx: -1 });
  assert.deepEqual(px(plain, 2, 1), [255, 0, 0]);
  assert.deepEqual(px(flipped, 5, 1), [255, 0, 0]);
  assert.deepEqual(px(flipped, 2, 1), [0, 0, 0]);
});
