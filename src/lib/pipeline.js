/**
 * One authoring pass: draw every frame of an effect, crunch it, quantize it,
 * encode it. Iterating means running this again with new settings, never
 * editing a previous GIF.
 *
 * text is the caller's way of rendering the word (a canvas in the page, a
 * stand-in in the tests): text(px) returns a white sprite, alpha marking
 * the glyphs.
 */
import { encodeGif } from './gif.js';
import { quantize } from './quantize.js';
import { rng } from './random.js';
import { pixelate } from './raster.js';

export const LIMITS = {
  colors: [2, 32],
  delay: [20, 1000],
  crunch: [1, 4],
  word: 16,
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Math.round(v)));

export function render(effect, { seed = 1, colors, delay, crunch = 2 } = {}, text) {
  const [w, h] = effect.size;
  const n = effect.frames;
  const random = rng(seed);
  const kept = new Map();
  let current = 0;
  const once = (fn) => {
    // keyed by call order within a frame, so an effect may keep several things
    const key = current++;
    if (!kept.has(key)) kept.set(key, fn());
    return kept.get(key);
  };

  const k = clamp(crunch, LIMITS.crunch);
  const palette = clamp(colors ?? effect.colors, LIMITS.colors);
  const frames = [];
  const rasters = [];
  for (let i = 0; i < n; i++) {
    current = 0;
    const img = pixelate(effect.frame(i, { w, h, n, t: i / n, rng: random, text, once }), k);
    rasters.push(img);
    frames.push(quantize(img, palette));
  }
  return {
    width: w,
    height: h,
    delay: clamp(delay ?? effect.delay, LIMITS.delay),
    frames,
    rasters,
  };
}

export const toGif = ({ width, height, delay, frames }) =>
  encodeGif({ width, height, delay, frames });
