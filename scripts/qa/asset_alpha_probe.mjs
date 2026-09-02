// Does this PNG actually USE its alpha channel, or is it merely carrying one?
//
// WHY (INBOX-20260901T1335Z): the compression decision turns entirely on this. A fully opaque PNG
// of painted artwork is a JPEG wearing the wrong extension — it can lose 80-90% of its bytes with
// no visible change. A PNG with real cut-out transparency cannot, and re-encoding it as JPEG would
// paint a black or white box behind the art on the board. Guessing this wrong is a player-visible
// regression, so it gets measured, not assumed.
//
// Method: decode the IDAT stream with node's own zlib (no dependency), undo the per-scanline PNG
// filters, and look at every pixel's alpha byte. Reports colour type, bit depth, and the share of
// pixels that are not fully opaque.
import fs from 'node:fs';
import zlib from 'node:zlib';

const CT = { 0: 'grey', 2: 'rgb', 3: 'palette', 4: 'grey+a', 6: 'rgba' };

export function readPng(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  const meta = { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colour: b[25] };
  const idat = [];
  let trnsSeen = false;
  let i = 8;
  while (i + 8 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + len));
    if (type === 'tRNS') trnsSeen = true;
    if (type === 'IEND') break;
    i += 12 + len;
  }
  return { ...meta, trns: trnsSeen, idat: Buffer.concat(idat) };
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Undo the five PNG scanline filters in place. Returns the raw (unfiltered) bytes.
export function unfilter(raw, w, h, bpp) {
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const o = y * stride, prev = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const bb = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += bb;
      else if (f === 3) v += (a + bb) >> 1;
      else if (f === 4) v += paeth(a, bb, c);
      out[o + x] = v & 0xff;
    }
  }
  return out;
}

// Fraction of pixels whose alpha is below 255. null when the file cannot carry per-pixel alpha
// in a form this probe decodes (palette + tRNS, or interlaced).
export function alphaUse(file) {
  const p = readPng(file);
  if (p.depth !== 8) return { ...p, translucent: null, why: `bit depth ${p.depth}` };
  if (p.colour !== 6 && p.colour !== 4) {
    return { ...p, translucent: p.trns ? null : 0, why: p.trns ? 'palette/tRNS' : 'no alpha channel' };
  }
  const bpp = p.colour === 6 ? 4 : 2;
  const raw = zlib.inflateSync(p.idat);
  if (raw.length < p.h * (p.w * bpp + 1)) return { ...p, translucent: null, why: 'interlaced or truncated' };
  const px = unfilter(raw, p.w, p.h, bpp);
  let notOpaque = 0;
  const total = p.w * p.h;
  for (let n = 0; n < total; n++) if (px[n * bpp + bpp - 1] !== 255) notOpaque++;
  // COUNT, not just share. The share is what misled this probe's first reading on 2026-09-01:
  // board.png printed "0.0% not opaque" and was reported as carrying a dead alpha channel, when
  // it has a small non-zero number of translucent pixels that rounding hid. A percentage is a
  // lossy summary of the only question that matters here — is it EXACTLY zero?
  return { ...p, translucent: notOpaque / total, notOpaque, total, why: null };
}

if (process.argv[1] && process.argv[1].endsWith('asset_alpha_probe.mjs')) {
  for (const f of process.argv.slice(2)) {
    try {
      const r = alphaUse(f);
      const pct = r.translucent == null
        ? `? (${r.why})`
        : `${r.notOpaque} of ${r.total} px not opaque (${(r.translucent * 100).toFixed(3)}%)`;
      console.log(`${f}  ${r.w}x${r.h}  depth${r.depth} ${CT[r.colour] ?? r.colour}  ${pct}`);
    } catch (e) {
      console.log(`${f}  ERROR ${e.message}`);
    }
  }
}
