/**
 * A GIF89a encoder: indexed frames in, the bytes of an animated, looping GIF
 * out. In file order:
 *
 *   1. the "GIF89a" signature
 *   2. the Logical Screen Descriptor and a Global Color Table
 *   3. the NETSCAPE2.0 application extension, which makes it loop
 *   4. per frame: a Graphic Control Extension (delay, disposal), an Image
 *      Descriptor, a Local Color Table if the frame's palette differs from
 *      the global one, and the LZW-compressed pixels
 *   5. the trailer, 0x3B
 *
 * Frames are { palette: [[r, g, b], ...], indices: Uint8Array }, every frame
 * the full width and height. Nothing is optimised between frames: each frame
 * is written whole, so corruption drawn into a frame stays in it.
 */

/** The smallest power of two of at least 2 entries that holds the palette, as bits. */
const tableBits = (size) => Math.max(1, Math.ceil(Math.log2(Math.max(2, size))));

class Bytes {
  constructor() {
    this.buf = new Uint8Array(1 << 16);
    this.length = 0;
  }
  byte(b) {
    if (this.length === this.buf.length) {
      const grown = new Uint8Array(this.buf.length * 2);
      grown.set(this.buf);
      this.buf = grown;
    }
    this.buf[this.length++] = b;
  }
  bytes(list) {
    for (const b of list) this.byte(b);
  }
  short(n) {
    this.byte(n & 255);
    this.byte((n >> 8) & 255);
  }
  ascii(s) {
    for (const ch of s) this.byte(ch.charCodeAt(0));
  }
  result() {
    return this.buf.slice(0, this.length);
  }
}

function writeTable(out, palette, bits) {
  for (let i = 0; i < 1 << bits; i++) out.bytes(palette[i] ?? [0, 0, 0]);
}

/**
 * LZW as the GIF variant has it: variable-width codes from minCodeSize + 1 up
 * to 12 bits, packed least-significant bit first, a clear code at the start
 * and whenever the 4096-entry table fills, then cut into sub-blocks of at
 * most 255 bytes.
 */
export function lzw(indices, minCodeSize, out) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let size = minCodeSize + 1;
  let next = end + 1;
  const table = new Map();

  const packed = new Bytes();
  let acc = 0;
  let bits = 0;
  const emit = (code) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      packed.byte(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const code = table.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      table.clear();
      size = minCodeSize + 1;
      next = end + 1;
    } else {
      // the decoder widens one code later than it adds the entry, which is
      // exactly when the entry about to be added no longer fits
      if (next >= 1 << size) size++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) packed.byte(acc & 255);

  const body = packed.result();
  out.byte(minCodeSize);
  for (let i = 0; i < body.length; i += 255) {
    const block = body.subarray(i, i + 255);
    out.byte(block.length);
    out.bytes(block);
  }
  out.byte(0);
}

const samePalette = (a, b) =>
  a.length === b.length &&
  a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1] && c[2] === b[i][2]);

export function encodeGif({ width, height, frames, delay = 100, loop = 0, disposal = 2 }) {
  if (!frames.length) throw new Error('a GIF needs at least one frame');
  for (const f of frames) {
    if (f.indices.length !== width * height) throw new Error('every frame must be the full canvas');
    if (f.palette.length > 256) throw new Error('a GIF palette holds at most 256 colours');
  }
  const out = new Bytes();
  const global = frames[0].palette;
  const globalBits = tableBits(global.length);

  out.ascii('GIF89a');
  out.short(width);
  out.short(height);
  // global table present, colour resolution 8 bits, not sorted, table size
  out.byte(0x80 | (7 << 4) | (globalBits - 1));
  out.byte(0); // background colour index
  out.byte(0); // no pixel aspect ratio
  writeTable(out, global, globalBits);

  out.bytes([0x21, 0xff, 11]);
  out.ascii('NETSCAPE2.0');
  out.bytes([3, 1]);
  out.short(loop);
  out.byte(0);

  // the delay field counts hundredths of a second
  const centis = Math.max(2, Math.round(delay / 10));
  for (const frame of frames) {
    out.bytes([0x21, 0xf9, 4, (disposal & 7) << 2]);
    out.short(centis);
    out.bytes([0, 0]);

    out.byte(0x2c);
    out.short(0);
    out.short(0);
    out.short(width);
    out.short(height);
    const local = !samePalette(frame.palette, global);
    const bits = local ? tableBits(frame.palette.length) : globalBits;
    out.byte(local ? 0x80 | (bits - 1) : 0);
    if (local) writeTable(out, frame.palette, bits);

    lzw(frame.indices, Math.max(2, bits), out);
  }

  out.byte(0x3b);
  return out.result();
}
