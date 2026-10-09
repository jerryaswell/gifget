/**
 * Effects: what happens to each frame after the word is placed on it. Any
 * number can be switched on at once; they always run in the order listed
 * here, distortions first and grain last, whatever order they were picked in.
 *
 * An effect is { id, name, note, tile, apply(img, ctx) } and may also have
 * colors(colors, ctx), which runs before the frame is drawn and can change
 * the colours it is drawn in. apply may change img in place or return a new
 * raster. ctx carries:
 *
 *   w, h, n, i, t   the canvas, the frame count, this frame, i / n
 *   rng             the seeded random source, shared by every frame in order
 *   once(fn)        fn's result from the first frame, kept for the rest
 *   strength        1 (subtle) to 3 (heavy)
 *   colors          { face, accent, ground } for this frame
 *   wrap            true when drawing a seamless tile: every shift wraps
 *
 * `tile: true` marks an effect safe for a seamless tile: one that never
 * breaks the match between opposite edges as long as it honours ctx.wrap.
 * Add an effect by adding an entry here; the page builds its checkboxes from
 * this list.
 */
import {
  crush,
  displace,
  eachIn,
  eachPixel,
  hex,
  luma,
  mix,
  offsetChannel,
  posterize,
  scanlines,
  tearCols,
  tearRows,
} from './raster.js';

const TAU = Math.PI * 2;

/** Whether a pixel is the ground or something drawn on it. */
const drawnOn = (img, i, ground) =>
  Math.abs(img.data[i] - ground[0]) +
    Math.abs(img.data[i + 1] - ground[1]) +
    Math.abs(img.data[i + 2] - ground[2]) >
  60;

/** A whole number of sine cycles across a length, so a wrapped wave meets itself. */
const cycles = (length, period, wrap) =>
  wrap ? length / Math.max(1, Math.round(length / period)) : period;

export const EFFECTS = [
  {
    id: 'flicker',
    name: 'Colour flicker',
    note: 'Now and then a frame swaps the face and accent colours.',
    tile: false,
    colors: (colors, { rng, strength }) =>
      rng.chance(0.08 + 0.06 * strength)
        ? { ...colors, face: colors.accent, accent: colors.face }
        : colors,
    apply: () => {},
  },
  {
    id: 'wave',
    name: 'Liquid wave',
    note: 'Two travelling sine waves bend the whole frame.',
    tile: true,
    apply(img, { w, h, t, strength, colors, wrap }) {
      const phase = TAU * t;
      const px = cycles(w, 70, wrap);
      const py = cycles(h, 40, wrap);
      const ay = 2 + 2.5 * strength;
      const ax = 0.5 + 0.75 * strength;
      return displace(
        img,
        (x, y) => [
          x - ax * Math.sin((TAU * y) / py + phase),
          y - ay * Math.sin((TAU * x) / px + phase),
        ],
        { wrap, fill: colors.ground }
      );
    },
  },
  {
    id: 'melt',
    name: 'Melt',
    note: 'The letters sag under gravity and drip from their lowest points.',
    tile: false,
    apply(img, { w, h, t, rng, once, strength, colors }) {
      const phase = TAU * t;
      const pull = 4 + 5 * strength;
      const sagged = displace(
        img,
        (x, y) => [
          x + 1.5 * Math.sin(y / 6 + phase),
          y - pull * (y / h) ** 2 * (0.6 + 0.4 * Math.sin(phase + x / 11)),
        ],
        { fill: colors.ground }
      );
      const drips = once(() =>
        Array.from({ length: 3 + 2 * strength }, () => ({
          x: rng.int(Math.floor(w * 0.12), Math.floor(w * 0.88)),
          k: rng() * TAU,
        }))
      );
      for (const { x, k } of drips) {
        let bottom = -1;
        let color = null;
        for (let y = h - 1; y >= 0; y--) {
          const i = (y * w + x) * 4;
          if (drawnOn(sagged, i, colors.ground)) {
            bottom = y;
            color = [sagged.data[i], sagged.data[i + 1], sagged.data[i + 2]];
            break;
          }
        }
        if (bottom < 0) continue;
        const len = 3 + (6 + 6 * strength) * (0.5 + 0.5 * Math.sin(phase + k));
        const lit = mix(color, [255, 255, 255], 0.5);
        eachIn(sagged, x - 2, bottom, 5, Math.ceil(len) + 2, (r, g, b, px, py) => {
          const u = (px - x) / 2.2;
          const v = (py - bottom - len / 2) / (len / 2 + 1);
          return u * u + v * v <= 1 ? (px === x - 1 ? lit : color) : [r, g, b];
        });
      }
      return sagged;
    },
  },
  {
    id: 'glint',
    name: 'Glint',
    note: 'A diagonal band of light sweeps across the letters once a loop.',
    tile: false,
    apply(img, { w, t, strength, colors }) {
      const x0 = -w * 0.3 + t * w * 1.6;
      const band = 2 + 2 * strength;
      for (let i = 0; i < img.data.length; i += 4) {
        const x = (i / 4) % w;
        const y = Math.floor(i / 4 / w);
        if (Math.abs(x + y * 0.6 - x0) < band && drawnOn(img, i, colors.ground)) {
          img.data.set([255, 255, 255], i);
        }
      }
    },
  },
  {
    id: 'split',
    name: 'RGB split',
    note: 'Red and blue pulled apart from green: chromatic aberration, with bursts when heavy.',
    tile: true,
    apply(img, { rng, strength, wrap }) {
      const ranges = [
        [1, 3],
        [4, 9],
        [9, 22],
      ];
      const [lo, hi] = ranges[strength - 1];
      const burst = strength === 3 && rng.chance(0.25) ? 1.6 : 1;
      const spread = Math.round(rng.int(lo, hi) * burst);
      offsetChannel(img, 0, spread, 0, { wrap });
      offsetChannel(img, 2, -Math.round(spread * 0.8), strength > 1 ? rng.int(-2, 2) : 0, {
        wrap,
      });
    },
  },
  {
    id: 'slice',
    name: 'Sliced rows',
    note: 'Bands of rows jump sideways, like a VHS tracking error.',
    tile: true,
    apply(img, { h, rng, strength }) {
      const slices = rng.int(strength, 2 + strength * 2);
      for (let s = 0; s < slices; s++) {
        const y = rng.int(0, h - 1);
        tearRows(img, y, y + rng.int(1, 3 + 3 * strength), rng.int(-14, 14));
      }
    },
  },
  {
    id: 'decay',
    name: 'Decay',
    note: 'A file copied too many times: tears, swapped and dead channels, stuck pixels, static.',
    tile: true,
    apply(img, { w, h, rng, once, strength, colors, wrap }) {
      const reach = wrap ? 8 : 12 - 2 * strength;
      for (let k = rng.int(1, 1 + strength * 2); k > 0; k--) {
        if (rng.chance(0.8)) {
          const y = rng.int(0, h - 1);
          tearRows(img, y, y + rng.int(1, 12), rng.int(-w / reach, w / reach));
        } else {
          const x = rng.int(0, w - 1);
          tearCols(img, x, x + rng.int(1, 8), rng.int(-h / reach, h / reach));
        }
      }
      for (let k = rng.int(0, 1 + strength * 2); k > 0; k--) {
        const kind = rng.int(0, 2);
        eachIn(
          img,
          rng.int(0, w - 1),
          rng.int(0, h - 1),
          rng.int(6, Math.max(7, w / 5)),
          rng.int(3, Math.max(4, h / 6)),
          (r, g, b) => {
            if (kind === 0) return [b, r, g]; // a local channel swap
            if (kind === 1) return [255 - r, 255 - g, 255 - b]; // a partial invert, never the whole frame
            return [r, 0, b]; // a dead channel
          },
          { wrap }
        );
      }
      if (rng.chance(0.12 * strength)) {
        // a static burst
        eachIn(
          img,
          rng.int(0, w - 1),
          rng.int(0, h - 1),
          rng.int(10, Math.max(11, w / 2)),
          rng.int(3, Math.max(4, h / 5)),
          () => {
            const v = rng.int(0, 160);
            return [v, v * 0.8, v * 0.7];
          },
          { wrap }
        );
      }
      if (rng.chance(0.05 * strength)) eachPixel(img, (r, g, b) => [g, b, r]); // channel reorder
      if (!wrap) {
        // stuck pixels die once and stay dead
        const stuck = once(() =>
          Array.from({ length: 2 + 2 * strength }, () => ({
            x: rng.int(0, w - 4),
            y: rng.int(0, h - 4),
            c: rng.pick([hex('#ff0044'), hex('#00ff66'), hex('#3355ff')]),
          }))
        );
        for (const { x, y, c } of stuck) eachIn(img, x, y, 3, 2, () => c);
      }
      // the more decay, the fewer bits survive; a tile keeps more, to stay quiet
      posterize(img, wrap ? 5 - Math.min(1, strength - 1) : 5 - strength);
      // never flash white on a dark ground: crush anything bright back down
      if (luma(...colors.ground) < 96) crush(img, { to: mix(colors.ground, [10, 5, 5], 0.5) });
    },
  },
  {
    id: 'scanlines',
    name: 'Scanlines',
    note: 'Every other row darkened, like a CRT.',
    tile: true,
    apply: (img, { strength }) => scanlines(img, 0.75 - 0.12 * strength),
  },
  {
    id: 'grain',
    name: 'Grain',
    note: 'Noise over every pixel.',
    tile: true,
    apply(img, { rng, strength }) {
      const amount = 10 + 12 * strength;
      eachPixel(img, (r, g, b) => {
        const n = (rng() - 0.5) * amount;
        return [r + n, g + n, b + n];
      });
    },
  },
];

export const effectById = (id) => EFFECTS.find((e) => e.id === id);
