import test from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, effectById } from '../../src/lib/effects.js';
import { render, toGif } from '../../src/lib/pipeline.js';
import { luma, raster } from '../../src/lib/raster.js';
import { decodeGif } from './decode.mjs';

/** A stand-in for the canvas-drawn word: a row of solid blocks, px high. */
const text = (px) => {
  const h = Math.max(2, Math.round(px));
  const img = raster(h * 4, h, [255, 255, 255], 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < img.w; x++)
      if (Math.floor(x / (h / 2)) % 2 === 0) img.data[(y * img.w + x) * 4 + 3] = 255;
  }
  return img;
};

const results = new Map(EFFECTS.map((e) => [e.id, render(e, { seed: 11 }, text)]));

test('every effect is listed once, with what the page needs', () => {
  assert.equal(new Set(EFFECTS.map((e) => e.id)).size, EFFECTS.length);
  for (const e of EFFECTS) {
    assert.ok(e.name && e.note, e.id);
    assert.equal(effectById(e.id), e);
  }
});

for (const e of EFFECTS) {
  test(e.id + ': a looping GIF at its own size, frame count and pace', () => {
    const gif = decodeGif(toGif(results.get(e.id)));
    assert.equal(gif.width, e.size[0]);
    assert.equal(gif.height, e.size[1]);
    assert.equal(gif.frames.length, e.frames);
    assert.equal(gif.loop, 0);
    assert.equal(gif.frames[0].delay, e.delay);
  });

  test(e.id + ': low resolution and a small palette', () => {
    const [w, h] = e.size;
    assert.ok(w <= 340 && h <= 180, 'never retina');
    for (const f of results.get(e.id).frames) assert.ok(f.palette.length <= e.colors);
  });

  test(e.id + ': a dark ground', () => {
    // the hard rule since the white-background failure: a frame is mostly dark
    for (const img of results.get(e.id).rasters) {
      let total = 0;
      for (let i = 0; i < img.data.length; i += 4)
        total += luma(img.data[i], img.data[i + 1], img.data[i + 2]);
      assert.ok(total / (img.w * img.h) < 110, 'mean luma ' + (total / (img.w * img.h)).toFixed(0));
    }
  });

  test(e.id + ': the same seed draws the same GIF', () => {
    const again = toGif(render(e, { seed: 11 }, text));
    assert.deepEqual(again, toGif(results.get(e.id)));
  });
}

test('a different seed draws a different decay', () => {
  for (const id of ['glitch', 'borked', 'tile']) {
    const a = toGif(render(effectById(id), { seed: 1 }, text));
    const b = toGif(render(effectById(id), { seed: 2 }, text));
    assert.notDeepEqual(a, b, id);
  }
});

test('borked never flashes white', () => {
  for (const img of results.get('borked').rasters) {
    for (let i = 0; i < img.data.length; i += 4) {
      assert.ok(luma(img.data[i], img.data[i + 1], img.data[i + 2]) <= 200);
    }
  }
});

test('settings override the effect defaults, within limits', () => {
  const spin = effectById('spin');
  const r = render(spin, { colors: 999, delay: 5 }, text);
  assert.equal(r.delay, 20, 'delay floor');
  const q = render(spin, { colors: 2, crunch: 4 }, text);
  for (const f of q.frames) assert.ok(f.palette.length <= 2);
});

test('a blank word still makes a GIF', () => {
  const blank = () => raster(1, 1, [0, 0, 0], 0);
  const gif = decodeGif(toGif(render(effectById('card'), {}, blank)));
  assert.equal(gif.frames.length, effectById('card').frames);
});
