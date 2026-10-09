/**
 * Pixels as plain RGBA buffers: { w, h, data } where data is a
 * Uint8ClampedArray laid out like canvas ImageData. A frame is an opaque
 * raster; a sprite is a raster whose alpha channel says where it is.
 *
 * Nothing here touches the DOM, so every operation can be tested in Node.
 */

export function raster(w, h, [r, g, b] = [0, 0, 0], alpha = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = alpha;
  }
  return { w, h, data };
}

export const clone = (img) => ({ w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) });

export const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

export const shade = ([r, g, b], f) => [r * f, g * f, b * f].map((v) => Math.min(255, v));

export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const mod = (n, m) => ((n % m) + m) % m;

/** The same sprite, recoloured: alpha kept, colour replaced. */
export function tint(sprite, color) {
  const out = clone(sprite);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = color[0];
    out.data[i + 1] = color[1];
    out.data[i + 2] = color[2];
  }
  return out;
}

/**
 * Paint a sprite onto dst, centred on (cx, cy), through a scale, a rotation
 * and a brightness. A negative sx mirrors it, which is how a card shows its
 * back face. Sampling is nearest-neighbour throughout: there is no smoothing
 * anywhere in this pipeline, by design.
 */
export function draw(dst, sprite, cx, cy, { sx = 1, sy = 1, angle = 0, brightness = 1 } = {}) {
  const ax = Math.abs(sx);
  const ay = Math.abs(sy);
  if (ax < 1e-6 || ay < 1e-6) return dst;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.ceil(Math.hypot(sprite.w * ax, sprite.h * ay) / 2) + 1;
  const x0 = Math.max(0, Math.floor(cx - reach));
  const x1 = Math.min(dst.w - 1, Math.ceil(cx + reach));
  const y0 = Math.max(0, Math.floor(cy - reach));
  const y1 = Math.min(dst.h - 1, Math.ceil(cy + reach));
  const hw = sprite.w / 2;
  const hh = sprite.h / 2;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const u = x + 0.5 - cx;
      const v = y + 0.5 - cy;
      // undo the rotation, then the scale
      const su = Math.floor((u * cos + v * sin) / sx + hw);
      const sv = Math.floor((-u * sin + v * cos) / sy + hh);
      if (su < 0 || sv < 0 || su >= sprite.w || sv >= sprite.h) continue;
      const s = (sv * sprite.w + su) * 4;
      const a = sprite.data[s + 3] / 255;
      if (a === 0) continue;
      const d = (y * dst.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        dst.data[d + c] += (sprite.data[s + c] * brightness - dst.data[d + c]) * a;
      }
    }
  }
  return dst;
}

/** Every pixel of out read from in at map(x, y), nearest, wrapping or not. */
export function displace(img, map, { wrap = false, fill = [0, 0, 0] } = {}) {
  const out = raster(img.w, img.h, fill);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      let [sx, sy] = map(x, y);
      sx = Math.floor(sx);
      sy = Math.floor(sy);
      if (wrap) {
        sx = mod(sx, img.w);
        sy = mod(sy, img.h);
      } else if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
      const s = (sy * img.w + sx) * 4;
      const d = (y * img.w + x) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
    }
  }
  return out;
}

/**
 * Shift rows y0..y1 sideways by dx, wrapping round the width. A wrapped tear
 * only rotates each row, so it never breaks a seamless tile.
 */
export function tearRows(img, y0, y1, dx) {
  const row = new Uint8ClampedArray(img.w * 4);
  for (let y = Math.max(0, y0); y <= Math.min(img.h - 1, y1); y++) {
    const start = y * img.w * 4;
    row.set(img.data.subarray(start, start + img.w * 4));
    for (let x = 0; x < img.w; x++) {
      const s = mod(x - dx, img.w) * 4;
      img.data.set(row.subarray(s, s + 4), start + x * 4);
    }
  }
  return img;
}

/** The vertical counterpart of tearRows: columns x0..x1 shifted by dy. */
export function tearCols(img, x0, x1, dy) {
  const col = new Uint8ClampedArray(img.h * 4);
  for (let x = Math.max(0, x0); x <= Math.min(img.w - 1, x1); x++) {
    for (let y = 0; y < img.h; y++)
      col.set(img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4), y * 4);
    for (let y = 0; y < img.h; y++) {
      const s = mod(y - dy, img.h) * 4;
      img.data.set(col.subarray(s, s + 4), (y * img.w + x) * 4);
    }
  }
  return img;
}

/** Move one colour channel by (dx, dy): chromatic aberration. */
export function offsetChannel(img, channel, dx, dy, { wrap = true } = {}) {
  const src = new Uint8ClampedArray(img.data);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      let sx = x - dx;
      let sy = y - dy;
      if (wrap) {
        sx = mod(sx, img.w);
        sy = mod(sy, img.h);
      } else if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) {
        img.data[(y * img.w + x) * 4 + channel] = 0;
        continue;
      }
      img.data[(y * img.w + x) * 4 + channel] = src[(sy * img.w + sx) * 4 + channel];
    }
  }
  return img;
}

/**
 * Run fn over every pixel of a rectangle, which may run off any edge. With
 * wrap the rectangle continues on the opposite side, so a corruption that
 * crosses the seam of a tile crosses it on both sides.
 */
export function eachIn(img, x0, y0, w, h, fn, { wrap = false } = {}) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let x = x0 + i;
      let y = y0 + j;
      if (wrap) {
        x = mod(x, img.w);
        y = mod(y, img.h);
      } else if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const p = (y * img.w + x) * 4;
      const px = img.data;
      const [r, g, b] = fn(px[p], px[p + 1], px[p + 2], x, y);
      px[p] = r;
      px[p + 1] = g;
      px[p + 2] = b;
    }
  }
  return img;
}

export const eachPixel = (img, fn) => eachIn(img, 0, 0, img.w, img.h, fn);

/** Darken every other row, like a CRT. */
export const scanlines = (img, f = 0.55) =>
  eachPixel(img, (r, g, b, x, y) => (y % 2 ? [r * f, g * f, b * f] : [r, g, b]));

/** Keep only the top `bits` bits of each channel. */
export function posterize(img, bits) {
  const mask = (0xff << (8 - bits)) & 0xff;
  return eachPixel(img, (r, g, b) => [r & mask, g & mask, b & mask]);
}

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Force anything bright back down to near-black. A decayed frame must never
 * flash white: the dark ground is a hard rule, since the white-background
 * failure on an inverted frame.
 */
export function crush(img, { limit = 200, flat = 150, to = [10, 5, 5] } = {}) {
  return eachPixel(img, (r, g, b) => {
    const l = luma(r, g, b);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    return l > limit || (spread < 24 && l > flat) ? to : [r, g, b];
  });
}

/**
 * The cheap pixel crunch: shrink by k with nearest-neighbour, then grow back.
 * Type drawn at full size comes out with the hard stepped edges of early web
 * art.
 */
export function pixelate(img, k) {
  if (k <= 1) return img;
  const dw = Math.max(1, Math.floor(img.w / k));
  const dh = Math.max(1, Math.floor(img.h / k));
  const out = raster(img.w, img.h);
  for (let y = 0; y < img.h; y++) {
    const sy = Math.floor((Math.floor(((y + 0.5) * dh) / img.h) + 0.5) * (img.h / dh));
    for (let x = 0; x < img.w; x++) {
      const sx = Math.floor((Math.floor(((x + 0.5) * dw) / img.w) + 0.5) * (img.w / dw));
      const s = (Math.min(img.h - 1, sy) * img.w + Math.min(img.w - 1, sx)) * 4;
      const d = (y * img.w + x) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
    }
  }
  return out;
}
