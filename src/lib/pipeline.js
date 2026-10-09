/**
 * One authoring pass: draw every frame, crunch it, quantize it, encode it.
 * Iterating means running this again with new settings, never editing a
 * previous GIF.
 *
 * A wordmark frame is: the ground, the word built by the style and placed by
 * the animation, then each effect in turn. A tile frame is a field of blocks
 * in shades of the three colours, with only the effects that wrap.
 *
 * text is the caller's way of drawing the word (a canvas in the page, the
 * bitmap font in the tests): text(px, maxW) returns a white sprite, alpha
 * marking the glyphs, about px high and no wider than maxW.
 */
import { animationById } from './animations.js';
import { effectById } from './effects.js';
import { encodeGif } from './gif.js';
import { quantize } from './quantize.js';
import { rng } from './random.js';
import { clone, crush, draw, eachIn, hex, luma, mix, pixelate, raster } from './raster.js';
import { normalize } from './settings.js';
import { styleById } from './styles.js';

/** The tile's base: 4px blocks in shades between the ground and the other two colours. */
function tileBase(w, h, { face, accent, ground }, random) {
  const shades = [
    ground,
    ground,
    mix(ground, face, 0.12),
    mix(ground, accent, 0.25),
    mix(ground, face, 0.22),
    mix(ground, accent, 0.4),
  ].map((c) => c.map(Math.round));
  const img = raster(w, h, ground);
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const c = random.pick(shades);
      const lift = random.chance(0.05) ? 1.5 : 1;
      eachIn(img, x, y, 4, 4, () => c.map((v) => v * lift));
    }
  }
  return img;
}

export function render(raw, text) {
  const s = normalize(raw);
  const { width: w, height: h, frames: n } = s;
  const random = rng(s.seed);
  const base = { face: hex(s.face), accent: hex(s.accent), ground: hex(s.ground) };
  const effects = s.effects.map(effectById);
  const style = styleById(s.style);
  const animation = animationById(s.animation);
  const tiling = s.output === 'tile';

  const kept = new Map();
  let calls = 0;
  // keyed by call order within a frame, so each effect keeps its own
  const once = (fn) => {
    const key = calls++;
    if (!kept.has(key)) kept.set(key, fn());
    return kept.get(key);
  };

  const word = tiling ? null : text((h * s.size) / 100, w * 0.88);
  const styled = new Map();
  const styledIn = (colors) => {
    const key = colors.face + '|' + colors.accent;
    if (!styled.has(key)) styled.set(key, style.make(word, colors));
    return styled.get(key);
  };
  const tile = tiling ? tileBase(w, h, base, random) : null;

  const frames = [];
  const rasters = [];
  for (let i = 0; i < n; i++) {
    calls = 0;
    const t = i / n;
    const ctx = { w, h, n, i, t, rng: random, once, strength: s.strength, wrap: tiling };
    ctx.colors = effects.reduce((c, e) => (e.colors ? e.colors(c, ctx) : c), base);

    let img;
    if (tiling) {
      img = clone(tile);
    } else {
      img = raster(w, h, ctx.colors.ground);
      const sprite = styledIn(ctx.colors);
      const place = animation.at(t, { w, h, rng: random, spriteW: sprite.w });
      draw(img, sprite, w / 2 + (place.dx ?? 0), h / 2 + (place.dy ?? 0), place);
    }
    for (const e of effects) img = e.apply(img, ctx) ?? img;
    // a tile stays quiet enough for a wordmark to sit on
    if (tiling && luma(...base.ground) < 96) {
      crush(img, { limit: 96, flat: 80, to: base.ground });
    }

    img = pixelate(img, s.crunch);
    rasters.push(img);
    frames.push(quantize(img, s.colors));
  }
  return { settings: s, width: w, height: h, delay: s.delay, frames, rasters };
}

export const toGif = ({ width, height, delay, frames }) =>
  encodeGif({ width, height, delay, frames });
