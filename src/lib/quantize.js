/**
 * Reduce an opaque raster to at most n colours: a palette and one palette
 * index per pixel.
 *
 * If the frame already has n colours or fewer (a posterized frame often does),
 * those exact colours are the palette. Otherwise it is median cut, the method
 * Pillow's MEDIANCUT uses: colours go in boxes, the box holding the most
 * pixels is split at the median of its widest channel, and each final box
 * contributes its average colour. Colours are binned to 5 bits a channel
 * first, which is plenty at eight to twenty output colours.
 */
export function quantize(img, n) {
  const { w, h, data } = img;
  const count = w * h;
  const indices = new Uint8Array(count);

  const exact = new Map();
  for (let i = 0; i < count && exact.size <= n; i++) {
    const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    let index = exact.get(key);
    if (index === undefined) exact.set(key, (index = exact.size));
    indices[i] = index;
  }
  if (exact.size <= n) {
    const palette = [...exact.keys()].map((k) => [k >> 16, (k >> 8) & 255, k & 255]);
    return { palette, indices };
  }

  const bins = new Uint32Array(32768);
  const sums = new Float64Array(32768 * 3);
  for (let i = 0; i < count; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    bins[key]++;
    sums[key * 3] += r;
    sums[key * 3 + 1] += g;
    sums[key * 3 + 2] += b;
  }

  const items = [];
  for (let key = 0; key < 32768; key++) {
    if (bins[key]) items.push({ key, c: [key >> 10, (key >> 5) & 31, key & 31], n: bins[key] });
  }
  const boxes = [{ items, n: count }];

  while (boxes.length < n) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].items.length > 1 && (pick < 0 || boxes[i].n > boxes[pick].n)) pick = i;
    }
    if (pick < 0) break;
    const box = boxes[pick];
    let axis = 0;
    let widest = -1;
    for (let c = 0; c < 3; c++) {
      let lo = 31;
      let hi = 0;
      for (const it of box.items) {
        lo = Math.min(lo, it.c[c]);
        hi = Math.max(hi, it.c[c]);
      }
      if (hi - lo > widest) [widest, axis] = [hi - lo, c];
    }
    box.items.sort((a, b) => a.c[axis] - b.c[axis]);
    let seen = 0;
    let cut = 1;
    for (; cut < box.items.length - 1; cut++) {
      seen += box.items[cut - 1].n;
      if (seen >= box.n / 2) break;
    }
    const left = box.items.slice(0, cut);
    const right = box.items.slice(cut);
    const total = (list) => list.reduce((s, it) => s + it.n, 0);
    boxes.splice(pick, 1, { items: left, n: total(left) }, { items: right, n: total(right) });
  }

  const palette = boxes.map((box) => {
    const avg = [0, 0, 0];
    for (const it of box.items) for (let c = 0; c < 3; c++) avg[c] += sums[it.key * 3 + c];
    return avg.map((v) => Math.round(v / box.n));
  });

  // each bin maps to the palette entry nearest its own average colour
  const nearest = new Int16Array(32768).fill(-1);
  for (const it of items) {
    const c = [0, 1, 2].map((ch) => sums[it.key * 3 + ch] / it.n);
    let best = 0;
    let bestD = Infinity;
    palette.forEach((p, i) => {
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    });
    nearest[it.key] = best;
  }
  for (let i = 0; i < count; i++) {
    const key = ((data[i * 4] >> 3) << 10) | ((data[i * 4 + 1] >> 3) << 5) | (data[i * 4 + 2] >> 3);
    indices[i] = nearest[key];
  }
  return { palette, indices };
}
