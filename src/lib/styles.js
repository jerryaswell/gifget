/**
 * Styles: how the letters are built, before anything moves. A style takes the
 * word as a white sprite and the three colours, and returns a coloured sprite
 * (alpha marks where it is) that an animation then places on each frame.
 *
 *   face    the letters themselves
 *   accent  whatever the style builds round them: shadow, sides, outline
 *   ground  the background, which an extrusion fades back into
 *
 * Add a style by adding an entry here; the page builds its picker from this
 * list.
 */
import { mix, raster, shade, tint } from './raster.js';

const WHITE = [255, 255, 255];

/** A transparent canvas pad pixels larger than the word on every side. */
const padded = (sprite, pad) => raster(sprite.w + pad * 2, sprite.h + pad * 2, [0, 0, 0], 0);

/**
 * Paint the word's solid pixels onto out, offset by (dx, dy) from centre.
 * color is a colour or a function of the glyph pixel's row, for gradients.
 */
function stamp(out, sprite, color, dx = 0, dy = 0) {
  const ox = Math.floor((out.w - sprite.w) / 2 + dx);
  const oy = Math.floor((out.h - sprite.h) / 2 + dy);
  for (let y = 0; y < sprite.h; y++) {
    const c = typeof color === 'function' ? color(y / Math.max(1, sprite.h - 1)) : color;
    for (let x = 0; x < sprite.w; x++) {
      if (sprite.data[(y * sprite.w + x) * 4 + 3] < 128) continue;
      const X = x + ox;
      const Y = y + oy;
      if (X < 0 || Y < 0 || X >= out.w || Y >= out.h) continue;
      out.data.set([c[0], c[1], c[2], 255], (Y * out.w + X) * 4);
    }
  }
  return out;
}

/** Depth layers offset down-right, darkening into the ground, then the face. */
function extrusion(sprite, { face, accent, ground }, depth, faceColor = face) {
  const out = padded(sprite, depth + 2);
  for (let d = depth; d >= 1; d--) stamp(out, sprite, mix(accent, ground, d / (depth + 1)), d, d);
  stamp(out, sprite, mix(face, WHITE, 0.6), -1, -1); // highlight on the top-left
  return stamp(out, sprite, faceColor);
}

/** Lighten every face pixel that has no face pixel above it. */
function gloss(img, face, color) {
  const top = new Uint8Array(img.w * img.h);
  for (let y = 1; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const p = (y * img.w + x) * 4;
      const q = ((y - 1) * img.w + x) * 4;
      const isFace = (i) =>
        img.data[i + 3] &&
        img.data[i] === face[0] &&
        img.data[i + 1] === face[1] &&
        img.data[i + 2] === face[2];
      if (isFace(p) && !isFace(q)) top[y * img.w + x] = 1;
    }
  }
  top.forEach((on, i) => on && img.data.set([...color, 255], i * 4));
  return img;
}

const round = (c) => c.map(Math.round);

export const STYLES = [
  {
    id: 'flat',
    name: 'Flat',
    note: 'The letters in one colour, nothing else.',
    make: (sprite, { face }) => tint(sprite, face),
  },
  {
    id: 'shadow',
    name: 'Drop shadow',
    note: 'A hard shadow in the accent colour, down and to the right.',
    make: (sprite, { face, accent }) =>
      stamp(stamp(padded(sprite, 4), sprite, accent, 3, 3), sprite, face),
  },
  {
    id: 'outline',
    name: 'Outline',
    note: 'A one-pixel accent outline all the way round.',
    make(sprite, { face, accent }) {
      const out = padded(sprite, 3);
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ])
        stamp(out, sprite, accent, dx, dy);
      return stamp(out, sprite, face);
    },
  },
  {
    id: 'extrude',
    name: 'Deep 3D',
    note: 'Mid-nineties extruded type: fourteen layers of accent fading into the ground.',
    make: (sprite, colors) => extrusion(sprite, colors, 14),
  },
  {
    id: 'bevel',
    name: 'Shallow 3D',
    note: 'A short six-layer extrusion, for type that has to stay readable small.',
    make: (sprite, colors) => extrusion(sprite, colors, 6),
  },
  {
    id: 'chrome',
    name: 'Chrome',
    note: 'Early-2000s chrome: a short extrusion with the face banded light to dark.',
    make: (sprite, colors) =>
      extrusion(sprite, colors, 6, (v) =>
        round(
          v < 0.45
            ? mix(mix(colors.face, WHITE, 0.55), colors.face, v / 0.45)
            : mix(colors.face, shade(colors.face, 0.55), (v - 0.45) / 0.55)
        )
      ),
  },
  {
    id: 'slime',
    name: 'Slime',
    note: 'Stacked dark-to-light layers for volume, with a gloss along every top edge.',
    make(sprite, { face }) {
      const out = padded(sprite, 5);
      [
        [0.15, 3],
        [0.45, 2],
        [0.75, 1],
      ].forEach(([f, d]) => stamp(out, sprite, round(shade(face, f)), 0, d));
      stamp(out, sprite, face);
      return gloss(out, face, round(mix(face, WHITE, 0.7)));
    },
  },
];

export const styleById = (id) => STYLES.find((s) => s.id === id);
