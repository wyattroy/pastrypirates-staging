// A small, honest PNG codec — decode, re-filter, re-encode. No dependency, no external binary.
//
// WHY THIS EXISTS, AND WHY IT IS NOT "TOOLING INSTEAD OF A FIX" (CLAUDE.md rule 7):
// INBOX-20260901T1335Z is Wyatt's launch-critical ask to make the game load much faster by
// compressing 17.8 MB of images. Two watches have now stalled on it for want of an image tool:
// there is no ImageMagick and no `sharp` here, `npm install` is not available to an unattended
// watch, and ffmpeg — which IS on this machine — cannot be invoked from the sandbox. The asset
// bytes are the fix; this is the smallest thing that can move them, written once, in the repo,
// with no install step on any machine.
//
// It does exactly three things, all lossless:
//   1. DROPS A CHANNEL NOBODY USES. `assets/board.png` is 2132x2132 RGBA with 0.0% of its pixels
//      anything but fully opaque — it has carried an alpha channel it never used. Same for any
//      other file measured that way.
//   2. PICKS THE FILTER PER SCANLINE. PNG's whole compression story is its five per-line filters,
//      and the encoder that produced these files evidently did not search them. This uses the
//      standard minimum-sum-of-absolute-differences heuristic from the PNG spec's own guidance.
//   3. DEFLATES AT MAXIMUM EFFORT.
// Every pixel that survives is bit-identical. That is the point: art Wyatt commissioned does not
// get degraded to save bytes without him choosing that trade.
//
// It deliberately REFUSES anything it cannot round-trip safely — interlaced files, bit depths
// other than 8, and palette images are returned untouched rather than guessed at.
import zlib from 'node:zlib';

export const COLOUR = { GREY: 0, RGB: 2, PALETTE: 3, GREY_A: 4, RGBA: 6 };
export const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// CRC-32, the PNG flavour. Table built once.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Split a PNG into its chunk list plus the IHDR fields. */
export function chunks(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const out = [];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    out.push({ type, data: buf.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

export function header(buf) {
  const ihdr = chunks(buf).find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('no IHDR');
  return {
    w: ihdr.data.readUInt32BE(0),
    h: ihdr.data.readUInt32BE(4),
    depth: ihdr.data[8],
    colour: ihdr.data[9],
    interlace: ihdr.data[12],
  };
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode to raw 8-bit samples. Throws on anything this codec will not round-trip. */
export function decode(buf) {
  const hdr = header(buf);
  if (hdr.depth !== 8) throw new Error(`bit depth ${hdr.depth}`);
  if (hdr.interlace !== 0) throw new Error('interlaced');
  if (hdr.colour === COLOUR.PALETTE) throw new Error('palette');
  const bpp = CHANNELS[hdr.colour];
  const idat = Buffer.concat(chunks(buf).filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  const stride = hdr.w * bpp;
  if (raw.length < hdr.h * (stride + 1)) throw new Error('truncated IDAT');
  const px = Buffer.alloc(hdr.h * stride);
  let pos = 0;
  for (let y = 0; y < hdr.h; y++) {
    const f = raw[pos++];
    const o = y * stride, prev = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = x >= bpp && y > 0 ? px[prev + x - bpp] : 0;
      let v = raw[pos + x];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) v += paeth(a, b, c);
      px[o + x] = v & 0xff;
    }
    pos += stride;
  }
  return { ...hdr, bpp, px };
}

/** True when every pixel's alpha is 255 — i.e. the alpha channel is dead weight. */
export function alphaIsDeadWeight(img) {
  if (img.colour !== COLOUR.RGBA && img.colour !== COLOUR.GREY_A) return false;
  const { px, bpp } = img;
  for (let i = bpp - 1; i < px.length; i += bpp) if (px[i] !== 255) return false;
  return true;
}

/** Drop the alpha channel. Only ever called when alphaIsDeadWeight() is true. */
export function dropAlpha(img) {
  const nb = img.bpp - 1;
  const out = Buffer.alloc((px_count(img)) * nb);
  const { px, bpp } = img;
  for (let p = 0, o = 0; p < px.length; p += bpp, o += nb) {
    for (let c = 0; c < nb; c++) out[o + c] = px[p + c];
  }
  return { ...img, colour: img.colour === COLOUR.RGBA ? COLOUR.RGB : COLOUR.GREY, bpp: nb, px: out };
}

function px_count(img) { return img.w * img.h; }

/**
 * Filter one scanline five ways and keep the cheapest, by the sum-of-absolute-differences
 * heuristic the PNG spec itself recommends. This is where most of the saving comes from.
 */
function filterLine(px, o, prev, stride, bpp, scratch) {
  let best = null, bestScore = Infinity, bestType = 0;
  for (let f = 0; f < 5; f++) {
    const line = scratch[f];
    let score = 0;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0;
      const b = prev >= 0 ? px[prev + x] : 0;
      const c = x >= bpp && prev >= 0 ? px[prev + x - bpp] : 0;
      let v;
      if (f === 0) v = px[o + x];
      else if (f === 1) v = px[o + x] - a;
      else if (f === 2) v = px[o + x] - b;
      else if (f === 3) v = px[o + x] - ((a + b) >> 1);
      else v = px[o + x] - paeth(a, b, c);
      v &= 0xff;
      line[x] = v;
      score += v < 128 ? v : 256 - v;
    }
    if (score < bestScore) { bestScore = score; best = line; bestType = f; }
  }
  return { type: bestType, line: best };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Re-encode. `keep` is the ancillary chunk list carried over from the original (colour profiles
 * and gamma among them — dropping those would SHIFT THE COLOURS, which is not a lossless change
 * however identical the pixels are).
 */
export function encode(img, keep = []) {
  const { w, h, bpp, px, colour } = img;
  const stride = w * bpp;
  const scratch = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  const body = Buffer.alloc(h * (stride + 1));
  let bo = 0;
  for (let y = 0; y < h; y++) {
    const { type, line } = filterLine(px, y * stride, y > 0 ? (y - 1) * stride : -1, stride, bpp, scratch);
    body[bo++] = type;
    line.copy(body, bo);
    bo += stride;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colour; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(body, { level: 9, memLevel: 9, windowBits: 15, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    ...keep.map((c) => chunk(c.type, c.data)),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Ancillary chunks worth carrying over. Anything that can change how the art LOOKS. */
export const KEEP_TYPES = new Set(['gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs']);

export function ancillary(buf) {
  return chunks(buf).filter((c) => KEEP_TYPES.has(c.type));
}
