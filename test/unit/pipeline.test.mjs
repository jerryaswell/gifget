import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATIONS } from '../../src/lib/animations.js';
import { bitmapText } from '../../src/lib/bitmapfont.js';
import { EFFECTS } from '../../src/lib/effects.js';
import { render, toGif } from '../../src/lib/pipeline.js';
import { PRESETS, applyPreset } from '../../src/lib/presets.js';
import { hex, luma } from '../../src/lib/raster.js';
import { STYLES } from '../../src/lib/styles.js';
import { decodeGif } from './decode.mjs';

const text = (px, maxW) => bitmapText('zomnbio', px, maxW);
const small = { width: 120, height: 60, frames: 6, word: 'zomnbio' };

/** How many pixels of a frame differ from the ground colour. */
const drawnPixels = (img, ground) => {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const d =
      Math.abs(img.data[i] - ground[0]) +
      Math.abs(img.data[i + 1] - ground[1]) +
      Math.abs(img.data[i + 2] - ground[2]);
    if (d > 30) n++;
  }
  return n;
};

for (const preset of PRESETS) {
  const settings = applyPreset(preset, { word: 'zomnbio', seed: 11 });
  const result = render(settings, text);

  test(preset.id + ': a looping GIF at its size, frame count and pace', () => {
    const gif = decodeGif(toGif(result));
    assert.equal(gif.width, settings.width);
    assert.equal(gif.height, settings.height);
    assert.equal(gif.frames.length, settings.frames);
    assert.equal(gif.loop, 0);
    assert.equal(gif.frames[0].delay, settings.delay);
  });

  test(preset.id + ': low resolution, a small palette and a dark ground', () => {
    assert.ok(settings.width <= 340 && settings.height <= 180, 'never retina');
    for (const f of result.frames) assert.ok(f.palette.length <= settings.colors);
    // the hard rule since the white-background failure: a frame is mostly dark
    for (const img of result.rasters) {
      let total = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        total += luma(img.data[i], img.data[i + 1], img.data[i + 2]);
      }
      assert.ok(total / (img.w * img.h) < 110);
    }
  });

  test(preset.id + ': the same settings draw the same file', () => {
    assert.deepEqual(toGif(render(settings, text)), toGif(result));
  });
}

test('every style with every animation draws the word', () => {
  for (const style of STYLES) {
    for (const animation of ANIMATIONS) {
      const r = render({ ...small, style: style.id, animation: animation.id }, text);
      const drawn = r.rasters.map((img) => drawnPixels(img, hex('#050201')));
      assert.ok(Math.max(...drawn) > 50, style.id + ' + ' + animation.id + ' drew nothing');
    }
  }
});

test('every effect works on its own, at every intensity', () => {
  for (const effect of EFFECTS) {
    for (const strength of [1, 2, 3]) {
      const r = render({ ...small, effects: [effect.id], strength }, text);
      assert.equal(r.frames.length, small.frames, effect.id);
    }
  }
});

test('all the effects at once', () => {
  const r = render({ ...small, effects: EFFECTS.map((e) => e.id), strength: 3 }, text);
  assert.equal(r.frames.length, small.frames);
});

test('effects change the frames, and the seed changes the randomness', () => {
  const plain = toGif(render({ ...small }, text));
  for (const effect of EFFECTS.filter((e) => e.id !== 'flicker')) {
    assert.notDeepEqual(toGif(render({ ...small, effects: [effect.id] }, text)), plain, effect.id);
  }
  const a = toGif(render({ ...small, effects: ['decay'], seed: 1 }, text));
  const b = toGif(render({ ...small, effects: ['decay'], seed: 2 }, text));
  assert.notDeepEqual(a, b);
});

test('decay never leaves a white pixel on a dark ground', () => {
  const r = render(
    { ...small, effects: ['decay'], strength: 3, face: '#ffffff', frames: 12 },
    text
  );
  for (const img of r.rasters) {
    for (let i = 0; i < img.data.length; i += 4) {
      assert.ok(luma(img.data[i], img.data[i + 1], img.data[i + 2]) <= 200);
    }
  }
});

test('the colours are the ones asked for', () => {
  const r = render({ ...small, face: '#ff0000', ground: '#0000ff', crunch: 1 }, text);
  const colours = r.frames[0].palette.map((c) => c.join());
  assert.ok(colours.includes('255,0,0'), 'face');
  assert.ok(colours.includes('0,0,255'), 'ground');
});

test('a tile keeps only the effects that wrap, and whole blocks', () => {
  const r = render(
    { output: 'tile', width: 130, height: 66, effects: ['melt', 'decay', 'glint'], frames: 3 },
    text
  );
  assert.deepEqual(r.settings.effects, ['decay']);
  assert.equal(r.width, 128);
  assert.equal(r.height, 64);
});

test('a tile takes every effect that wraps', () => {
  const r = render(
    {
      output: 'tile',
      width: 64,
      height: 64,
      effects: ['wave', 'split', 'slice', 'scanlines'],
      frames: 4,
      crunch: 1,
    },
    text
  );
  assert.equal(r.frames.length, 4);
});

test('one frame makes a still GIF', () => {
  const gif = decodeGif(toGif(render({ ...small, frames: 1 }, text)));
  assert.equal(gif.frames.length, 1);
});

test('a blank word still makes a GIF', () => {
  const r = render({ ...small, word: '' }, () => bitmapText('', 20));
  assert.equal(r.frames.length, small.frames);
});
