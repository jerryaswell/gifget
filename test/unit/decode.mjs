/**
 * A minimal GIF decoder, written separately from the encoder so the tests can
 * read back what it wrote. It reads exactly what encodeGif emits: the header,
 * the global table, extensions, full-canvas frames with or without a local
 * table. No interlacing, no transparency.
 */
export function decodeGif(bytes) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => bytes[p++] | (bytes[p++] << 8);
  const ascii = (n) => String.fromCharCode(...bytes.subarray(p, (p += n)));
  const table = (bits) => Array.from({ length: 1 << bits }, () => [u8(), u8(), u8()]);
  const blocks = () => {
    const out = [];
    for (let n = u8(); n; n = u8()) out.push(...bytes.subarray(p, (p += n)));
    return out;
  };

  const signature = ascii(6);
  const width = u16();
  const height = u16();
  const packed = u8();
  u8();
  u8();
  const global = packed & 0x80 ? table((packed & 7) + 1) : null;
  const gif = { signature, width, height, global, loop: null, frames: [] };
  let control = null;

  for (;;) {
    const kind = u8();
    if (kind === 0x3b) return gif;
    if (kind === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8();
        const flags = u8();
        control = { disposal: (flags >> 2) & 7, delay: u16() * 10 };
        u8();
        u8();
      } else if (label === 0xff) {
        u8();
        const id = ascii(11);
        const data = blocks();
        if (id === 'NETSCAPE2.0') gif.loop = data[1] | (data[2] << 8);
      } else blocks();
    } else if (kind === 0x2c) {
      u16();
      u16();
      const w = u16();
      const h = u16();
      const flags = u8();
      const palette = flags & 0x80 ? table((flags & 7) + 1) : global;
      const minCodeSize = u8();
      const indices = lzwDecode(blocks(), minCodeSize, w * h);
      gif.frames.push({ ...control, palette, indices });
      control = null;
    } else throw new Error('unexpected block 0x' + kind.toString(16) + ' at ' + (p - 1));
  }
}

function lzwDecode(data, minCodeSize, count) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out = new Uint8Array(count);
  let o = 0;
  let size = minCodeSize + 1;
  let dict = [];
  const reset = () => {
    dict = Array.from({ length: clear }, (_, i) => [i]);
    dict.push(null, null);
    size = minCodeSize + 1;
  };
  reset();
  let prev = null;
  let bit = 0;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) {
      if ((data[bit >> 3] >> (bit & 7)) & 1) code |= 1 << i;
    }
    return code;
  };
  while (bit + size <= data.length * 8) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === end) break;
    let entry;
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error('bad LZW code ' + code + ' with ' + dict.length + ' entries');
    for (const v of entry) out[o++] = v;
    if (prev && dict.length < 4096) dict.push([...prev, entry[0]]);
    if (dict.length === 1 << size && size < 12) size++;
    prev = entry;
  }
  if (o !== count) throw new Error('decoded ' + o + ' pixels, expected ' + count);
  return out;
}
