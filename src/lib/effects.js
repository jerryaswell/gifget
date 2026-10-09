/**
 * The looks. Each effect draws every frame of one loop as an opaque raster;
 * the pipeline crunches, quantizes and encodes them afterwards, so an effect
 * only has to say what a frame looks like.
 *
 * An effect is { id, name, note, size: [w, h], frames, delay, colors, frame }
 * and frame(i, ctx) returns the i-th raster. ctx carries:
 *   w, h     the canvas
 *   n        the frame count
 *   t        i / n, how far round the loop this frame is
 *   rng      the seeded random source, shared by every frame in order
 *   text(px) the word as a white sprite, set px high; empty for a blank word
 *   once(fn) fn's result, computed on the first frame and kept for the rest
 */
import {
  clone,
  crush,
  displace,
  draw,
  eachIn,
  eachPixel,
  hex,
  mix,
  offsetChannel,
  posterize,
  raster,
  scanlines,
  shade,
  tearCols,
  tearRows,
  tint,
} from './raster.js';

const TAU = Math.PI * 2;

/** The word, extruded: back layers darkest, then a highlight, then the face. */
function extruded(sprite, { depth, face, side, highlight, back = [0, 0, 0] }) {
  const pad = depth + 2;
  const out = raster(sprite.w + pad * 2, sprite.h + pad * 2, [0, 0, 0], 0);
  const cx = out.w / 2;
  const cy = out.h / 2;
  const layer = (color, dx, dy) => {
    const t = tint(sprite, color);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const s = (y * t.w + x) * 4;
        if (t.data[s + 3] < 128) continue;
        const ox = Math.floor(x + cx - t.w / 2 + dx);
        const oy = Math.floor(y + cy - t.h / 2 + dy);
        if (ox < 0 || oy < 0 || ox >= out.w || oy >= out.h) continue;
        const d = (oy * out.w + ox) * 4;
        out.data.set([color[0], color[1], color[2], 255], d);
      }
    }
  };
  for (let d = depth; d >= 1; d--) layer(mix(side, back, d / (depth + 1)), d, d);
  layer(highlight, -1, -1);
  layer(face, 0, 0);
  return out;
}

/** The Y-axis card turn: foreshortened, mirrored round the back, dimmed edge-on. */
function cardTurn(dst, sprite, theta, { floor = 0.35 } = {}) {
  const c = Math.cos(theta);
  const edge = Math.abs(c);
  draw(dst, sprite, dst.w / 2, dst.h / 2, {
    sx: Math.max(0.04, edge) * (c < 0 ? -1 : 1),
    sy: 1 - 0.12 * (1 - edge),
    brightness: floor + (1 - floor) * edge,
  });
  return dst;
}

const spin = {
  id: 'spin',
  name: '2D spin',
  note: 'The first banner: the word on a turntable, pixel green on black.',
  size: [240, 120],
  frames: 24,
  delay: 60,
  colors: 8,
  frame(i, { w, h, t, text }) {
    const img = raster(w, h, [0, 0, 0]);
    return draw(img, tint(text(h * 0.32), hex('#33ff33')), w / 2, h / 2, { angle: TAU * t });
  },
};

const card = {
  id: 'card',
  name: 'Y-axis card',
  note: 'The word as a card turning on its vertical axis, back face mirrored.',
  size: [280, 120],
  frames: 30,
  delay: 50,
  colors: 12,
  frame(i, { w, h, t, text }) {
    return cardTurn(raster(w, h), tint(text(h * 0.42), hex('#4dff6a')), TAU * t);
  },
};

const horror = {
  id: 'horror',
  name: 'Horror card',
  note: 'The same turn, slower, in a sickly olive on a bruised ground.',
  size: [280, 120],
  frames: 30,
  delay: 110,
  colors: 10,
  frame(i, { w, h, t, text }) {
    const img = raster(w, h, hex('#0b0a04'));
    return cardTurn(img, tint(text(h * 0.42), hex('#8a8f2a')), TAU * t, { floor: 0.2 });
  },
};

const extrude = {
  id: 'extrude',
  name: 'Deep 3D',
  note: 'Mid-nineties extruded type, fourteen layers deep, rocking on its axis.',
  size: [320, 160],
  frames: 24,
  delay: 70,
  colors: 16,
  frame(i, { w, h, t, text, once }) {
    const block = once(() =>
      extruded(text(h * 0.4), {
        depth: 14,
        face: hex('#ffd23f'),
        side: hex('#c2410c'),
        highlight: hex('#fff6b0'),
        back: hex('#1c0500'),
      })
    );
    const img = raster(w, h, hex('#04040c'));
    return cardTurn(img, block, 0.7 * Math.sin(TAU * t), { floor: 0.6 });
  },
};

const chrome = {
  id: 'chrome',
  name: 'Cyan chrome',
  note: 'Early-2000s chrome: cyan face, steel sides, a glint passing over.',
  size: [320, 140],
  frames: 20,
  delay: 80,
  colors: 16,
  frame(i, { w, h, t, text, once }) {
    const block = once(() =>
      extruded(text(h * 0.42), {
        depth: 6,
        face: hex('#5ff6ff'),
        side: hex('#3a6f8f'),
        highlight: hex('#e8fdff'),
        back: hex('#06121c'),
      })
    );
    const img = raster(w, h, hex('#020611'));
    draw(img, block, w / 2, h / 2);
    // a diagonal glint band crossing the face once per loop
    const x0 = -w * 0.3 + t * w * 1.6;
    return eachPixel(img, (r, g, b, x, y) => {
      const lit = Math.abs(x + y * 0.6 - x0) < 6 && r + g + b > 120;
      return lit ? [255, 255, 255] : [r, g, b];
    });
  },
};

function glitchFrame(i, { w, h, t, rng, text }, heavy) {
  const img = raster(w, h, hex('#030303'));
  const blood = rng.chance(heavy ? 0.2 : 0.12);
  const face = blood ? hex('#b0001a') : hex('#39ff14');
  draw(img, tint(text(h * 0.4), face), w / 2 + Math.round(Math.sin(TAU * t) * 2), h / 2);

  const burst = heavy && rng.chance(0.25);
  const spread = heavy ? rng.int(9, 22) * (burst ? 1.6 : 1) : rng.int(1, 3);
  offsetChannel(img, 0, Math.round(spread), 0);
  offsetChannel(img, 2, -Math.round(spread * 0.8), heavy ? rng.int(-2, 2) : 0);

  const slices = rng.int(heavy ? 2 : 1, heavy ? 7 : 3);
  for (let s = 0; s < slices; s++) {
    const y = rng.int(0, h - 1);
    tearRows(img, y, y + rng.int(1, heavy ? 10 : 5), rng.int(-14, 14));
  }
  scanlines(img);
  const grain = heavy ? 36 : 22;
  return eachPixel(img, (r, g, b) => {
    const n = (rng() - 0.5) * grain;
    return [r + n, g + n, b + n];
  });
}

const glitch = {
  id: 'glitch',
  name: 'VHS glitch',
  note: 'Scanlines, sliced rows, grain and a mild colour split.',
  size: [300, 130],
  frames: 20,
  delay: 80,
  colors: 14,
  frame: (i, ctx) => glitchFrame(i, ctx, false),
};

const aberration = {
  id: 'aberration',
  name: 'Heavy RGB split',
  note: 'The glitch with the channels torn nine to twenty-two pixels apart, and burst frames.',
  size: [300, 130],
  frames: 20,
  delay: 80,
  colors: 16,
  frame: (i, ctx) => glitchFrame(i, ctx, true),
};

const wave = {
  id: 'wave',
  name: 'Liquid neon',
  note: 'Magenta neon on two travelling sine waves.',
  size: [300, 130],
  frames: 24,
  delay: 60,
  colors: 12,
  frame(i, { w, h, t, text }) {
    const img = raster(w, h, hex('#08010d'));
    const word = text(h * 0.42);
    draw(img, tint(word, hex('#7a1fff')), w / 2 + 3, h / 2 + 3);
    draw(img, tint(word, hex('#ff2bd6')), w / 2, h / 2);
    const phase = TAU * t;
    return displace(
      img,
      (x, y) => [
        x - 2 * Math.sin((TAU * y) / 40 + phase),
        y - 7 * Math.sin((TAU * x) / 70 + phase),
      ],
      {
        fill: hex('#08010d'),
      }
    );
  },
};

const melt = {
  id: 'melt',
  name: 'Melting slime',
  note: 'Glossy green slime whose letters sag under gravity, dripping.',
  size: [300, 160],
  frames: 24,
  delay: 80,
  colors: 14,
  frame(i, { w, h, t, rng, text, once }) {
    const ground = hex('#020802');
    const word = text(h * 0.36);
    const cy = h * 0.4;
    const img = raster(w, h, ground);
    // stacked dark-to-light layers give the slime its volume
    [
      ['#0b3d0b', 3],
      ['#1f7a12', 2],
      ['#43c21a', 1],
      ['#7dff3a', 0],
    ].forEach(([c, d]) => draw(img, tint(word, hex(c)), w / 2, cy + d));
    // a gloss on every top edge of the face
    const face = clone(img);
    eachPixel(img, (r, g, b, x, y) => {
      if (y === 0 || g < 200) return [r, g, b];
      const above = (y - 1) * w * 4 + x * 4;
      return face.data[above + 1] < 200 ? hex('#e8ffd0') : [r, g, b];
    });

    const phase = TAU * t;
    const sagged = displace(
      img,
      (x, y) => {
        const fall = 9 * (y / h) ** 2 * (0.6 + 0.4 * Math.sin(phase + x / 11));
        return [x + 1.5 * Math.sin(y / 6 + phase), y - fall];
      },
      { fill: ground }
    );

    // drips hang from fixed columns and grow and recede through the loop
    const drips = once(() =>
      Array.from({ length: 7 }, () => ({
        x: rng.int(Math.floor(w * 0.15), Math.floor(w * 0.85)),
        k: rng() * TAU,
      }))
    );
    for (const { x, k } of drips) {
      let bottom = -1;
      for (let y = h - 1; y >= 0; y--) {
        if (sagged.data[(y * w + x) * 4 + 1] > 100) {
          bottom = y;
          break;
        }
      }
      if (bottom < 0) continue;
      const len = 4 + 18 * (0.5 + 0.5 * Math.sin(phase + k));
      eachIn(sagged, x - 2, bottom, 5, Math.ceil(len) + 2, (r, g, b, px, py) => {
        const u = (px - x) / 2.2;
        const v = (py - bottom - len / 2) / (len / 2 + 1);
        return u * u + v * v <= 1 ? (px === x - 1 ? hex('#b6ff7a') : hex('#43c21a')) : [r, g, b];
      });
    }
    return sagged;
  },
};

/** The decay vocabulary, shared by the borked logo and the tile. */
function decay(img, rng, { wrap, strength, bits = [2, 4], reach = 4 }) {
  const { w, h } = img;
  const tears = rng.int(1, 3 + strength * 3);
  for (let k = 0; k < tears; k++) {
    if (rng.chance(0.8)) {
      const y = rng.int(0, h - 1);
      tearRows(
        img,
        y,
        wrap ? y + rng.int(1, 12) : Math.min(h - 1, y + rng.int(1, 12)),
        rng.int(-w / reach, w / reach)
      );
    } else {
      const x = rng.int(0, w - 1);
      tearCols(img, x, x + rng.int(1, 8), rng.int(-h / reach, h / reach));
    }
  }
  const patches = rng.int(0, 1 + strength * 3);
  for (let k = 0; k < patches; k++) {
    const pw = rng.int(6, Math.max(7, w / 5));
    const ph = rng.int(3, Math.max(4, h / 6));
    const x = rng.int(0, w - 1);
    const y = rng.int(0, h - 1);
    const kind = rng.int(0, 2);
    eachIn(
      img,
      x,
      y,
      pw,
      ph,
      (r, g, b) => {
        if (kind === 0) return [b, r, g]; // a local channel swap
        if (kind === 1) return [255 - r, 255 - g, 255 - b]; // a partial invert, never the whole frame
        return [r, 0, b]; // a killed channel
      },
      { wrap }
    );
  }
  if (rng.chance(0.15 * strength)) {
    // a static burst
    const x = rng.int(0, w - 1);
    const y = rng.int(0, h - 1);
    eachIn(
      img,
      x,
      y,
      rng.int(10, w / 2),
      rng.int(3, h / 5),
      () => {
        const v = rng.int(0, 160);
        return [v, v * 0.8, v * 0.7];
      },
      { wrap }
    );
  }
  if (rng.chance(0.08 * strength)) eachPixel(img, (r, g, b) => [g, b, r]); // channel reorder
  // 2 bits is the floor; anything darker than a quarter of full scale goes to black
  return posterize(img, rng.int(bits[0], bits[1]));
}

const borked = {
  id: 'borked',
  name: 'Borked',
  note: 'A decayed, malfunctioning file: tears, swapped channels, stuck pixels, static.',
  size: [300, 130],
  frames: 24,
  delay: 90,
  colors: 12,
  frame(i, { w, h, rng, text, once }) {
    const img = raster(w, h, hex('#050201'));
    draw(img, tint(text(h * 0.42), hex('#c9a66b')), w / 2, h / 2);
    draw(img, tint(text(h * 0.42), hex('#6b1d12')), w / 2 + 2, h / 2 + 2, { brightness: 0.7 });
    draw(img, tint(text(h * 0.42), hex('#c9a66b')), w / 2, h / 2);
    decay(img, rng, { wrap: false, strength: 1, bits: [3, 4], reach: 10 });
    // stuck pixels stay where they died, every frame
    const stuck = once(() =>
      Array.from({ length: 6 }, () => ({
        x: rng.int(0, w - 4),
        y: rng.int(0, h - 4),
        c: rng.pick([hex('#ff0044'), hex('#00ff66'), hex('#3355ff')]),
      }))
    );
    for (const { x, y, c } of stuck) eachIn(img, x, y, 3, 2, () => c);
    return crush(img);
  },
};

const tile = {
  id: 'tile',
  name: 'Seamless tile',
  note: 'Wallpaper in the same decayed language, quieter, wrapping on every edge.',
  size: [128, 128],
  frames: 16,
  delay: 120,
  colors: 10,
  tiles: true,
  frame(i, { w, h, rng, once }) {
    // a field of dark 4px blocks, drawn once; random blocks tile trivially
    const base = once(() => {
      const img = raster(w, h);
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const c = rng.pick([
            hex('#1c0f08'),
            hex('#2b170c'),
            hex('#3a2212'),
            hex('#1a2410'),
            hex('#4a2c18'),
          ]);
          const lift = rng.chance(0.05) ? 1.8 : 1;
          eachIn(img, x, y, 4, 4, () => shade(c, lift));
        }
      }
      return img;
    });
    const img = clone(base);
    decay(img, rng, { wrap: true, strength: 1, bits: [4, 5], reach: 8 });
    // keep it quiet enough for a mark to sit on
    return crush(img, { limit: 96, flat: 80, to: hex('#1c0f08') });
  },
};

export const EFFECTS = [
  spin,
  card,
  horror,
  extrude,
  chrome,
  glitch,
  aberration,
  wave,
  melt,
  borked,
  tile,
];

export const effectById = (id) => EFFECTS.find((e) => e.id === id);
