/*
 * Minimal PNG reader / writer (Node, no dependencies) for the sprite-sheet
 * tools. Reads non-interlaced PNGs of any colour type with 1-8 bit samples
 * (what an editor export normally is) into RGBA; writes 8-bit RGBA.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/* rgba: Uint8Array / Buffer of width * height * 4 bytes. */
export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let pos = 8;
  let ihdr = null;
  let plte = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('missing IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const color = ihdr[9];
  if (ihdr[12] !== 0) throw new Error('interlaced PNGs are not supported');
  const ch = CHANNELS[color];
  if (!ch) throw new Error(`unsupported colour type ${color}`);
  const bpp = Math.max(1, (ch * depth) >> 3);
  const stride = (width * ch * depth + 7) >> 3;
  const data = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = data[y * (stride + 1)];
    const src = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rows[y * stride + i - bpp] : 0;
      const b = y ? rows[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y ? rows[(y - 1) * stride + i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error('bad filter');
      rows[y * stride + i] = v & 255;
    }
  }
  const sample = (y, i) => {
    if (depth === 8) return rows[y * stride + i];
    if (depth === 16) return rows[y * stride + i * 2];
    const per = 8 / depth;
    const byte = rows[y * stride + Math.floor(i / per)];
    return (byte >> (8 - depth * ((i % per) + 1))) & ((1 << depth) - 1);
  };
  const scale = depth < 8 && color !== 3 ? 255 / ((1 << depth) - 1) : 1;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r;
      let g;
      let b;
      let a = 255;
      if (color === 3) {
        const k = sample(y, x);
        r = plte[k * 3];
        g = plte[k * 3 + 1];
        b = plte[k * 3 + 2];
        if (trns && k < trns.length) a = trns[k];
      } else if (color === 0 || color === 4) {
        r = g = b = Math.round(sample(y, x * ch) * scale);
        if (color === 4) a = sample(y, x * ch + 1);
      } else {
        r = sample(y, x * ch);
        g = sample(y, x * ch + 1);
        b = sample(y, x * ch + 2);
        if (color === 6) a = sample(y, x * ch + 3);
      }
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }
  return { width, height, rgba };
}
