import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif } from '../../src/lib/gif.js';
import { rng } from '../../src/lib/random.js';
import { decodeGif } from './decode.mjs';

const frame = (w, h, palette, pick) => ({
  palette,
  indices: Uint8Array.from({ length: w * h }, (_, i) => pick(i % w, Math.floor(i / w))),
});

test('the file has the GIF89a signature and the trailer', () => {
  const bytes = encodeGif({
    width: 2,
    height: 2,
    frames: [
      frame(
        2,
        2,
        [
          [0, 0, 0],
          [255, 0, 0],
        ],
        () => 1
      ),
    ],
  });
  assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), 'GIF89a');
  assert.equal(bytes.at(-1), 0x3b);
});

test('frames, delay, loop and disposal survive a round trip', () => {
  const palette = [
    [0, 0, 0],
    [0, 255, 0],
    [255, 0, 255],
  ];
  const frames = [0, 1, 2].map((k) => frame(7, 5, palette, (x, y) => (x + y + k) % 3));
  const gif = decodeGif(encodeGif({ width: 7, height: 5, frames, delay: 80 }));
  assert.equal(gif.width, 7);
  assert.equal(gif.height, 5);
  assert.equal(gif.loop, 0, 'loops forever');
  assert.equal(gif.frames.length, 3);
  gif.frames.forEach((f, k) => {
    assert.equal(f.delay, 80);
    assert.equal(f.disposal, 2, 'restore to background between frames');
    assert.deepEqual([...f.indices], [...frames[k].indices]);
  });
});

test('a frame with its own palette carries a local colour table', () => {
  const a = frame(
    3,
    3,
    [
      [0, 0, 0],
      [255, 255, 255],
    ],
    (x) => x % 2
  );
  const b = frame(
    3,
    3,
    [
      [10, 0, 0],
      [0, 0, 200],
      [9, 9, 9],
    ],
    (x, y) => (x * y) % 3
  );
  const gif = decodeGif(encodeGif({ width: 3, height: 3, frames: [a, b] }));
  assert.deepEqual(gif.frames[0].palette.slice(0, 2), a.palette);
  assert.deepEqual(gif.frames[1].palette.slice(0, 3), b.palette);
  assert.deepEqual([...gif.frames[1].indices], [...b.indices]);
});

test('LZW holds up past a full code table, at every palette size', () => {
  const random = rng(42);
  for (const colors of [2, 3, 16, 200, 256]) {
    const palette = Array.from({ length: colors }, (_, i) => [i, 255 - i, (i * 7) % 256]);
    // noise fills the 4096-entry table many times over, forcing clear codes
    const f = frame(173, 97, palette, () => random.int(0, colors - 1));
    const gif = decodeGif(encodeGif({ width: 173, height: 97, frames: [f] }));
    assert.deepEqual([...gif.frames[0].indices], [...f.indices], colors + ' colours');
  }
});

test('long flat runs compress', () => {
  const f = frame(
    200,
    200,
    [
      [0, 0, 0],
      [1, 1, 1],
    ],
    () => 0
  );
  const bytes = encodeGif({ width: 200, height: 200, frames: [f] });
  assert.ok(bytes.length < 2000, bytes.length + ' bytes for 40,000 identical pixels');
  assert.deepEqual([...decodeGif(bytes).frames[0].indices], [...f.indices]);
});

test('bad input is refused rather than written', () => {
  assert.throws(() => encodeGif({ width: 2, height: 2, frames: [] }));
  assert.throws(() =>
    encodeGif({
      width: 2,
      height: 2,
      frames: [{ palette: [[0, 0, 0]], indices: new Uint8Array(3) }],
    })
  );
});
