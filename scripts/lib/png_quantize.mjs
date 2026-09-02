// Median-cut colour quantization with alpha — what `pngquant` does, in pure node.
//
// WHY THIS AND NOT A FORMAT CHANGE (INBOX-20260901T1335Z):
// The obvious way to make 17.8 MB of art small is WebP or JPEG. It is the wrong way HERE, and the
// reason is `classic/`: the frozen v1 game at playpastrypirates.com/classic serves out of this very
// same `assets/` tree by relative path (`classic/src/shared/index.js:22` — `ASSET_BASE="../assets/"`).
// Renaming `anchor.png` to `anchor.webp` would either break the live classic game or force a second
// copy of every asset — two things kept in step by memory, which CLAUDE.md §2 spends a whole
// section explaining never survives.
//
// A palette PNG keeps the filename, the format and the alpha channel, so nothing that references
// these files has to change and classic gets the same speed-up for free. The cost is colour depth:
// 256 colours instead of 16.7 million. THAT IS A VISIBLE TRADE ON SOFT-SHADED ART, so nothing here
// is applied on faith — `asset_quantize.mjs` reports the measured error per file and the change is
// checked against a posed screenshot of the real game before it ships.
//
// Floyd-Steinberg dithering is on by default because the failure mode of quantizing painted art is
// BANDING in smooth gradients, and dithering is the standard answer to exactly that.
import zlib from 'node:zlib';
import { crc32, decode, ancillary, COLOUR } from './png.mjs';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** RGBA samples for any decoded image, whatever its colour type. */
export function toRGBA(img) {
  const n = img.w * img.h;
  if (img.colour === COLOUR.RGBA) return img.px;
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const s = i * img.bpp, d = i * 4;
    if (img.colour === COLOUR.RGB) { out[d] = img.px[s]; out[d + 1] = img.px[s + 1]; out[d + 2] = img.px[s + 2]; out[d + 3] = 255; }
    else if (img.colour === COLOUR.GREY) { out[d] = out[d + 1] = out[d + 2] = img.px[s]; out[d + 3] = 255; }
    else { out[d] = out[d + 1] = out[d + 2] = img.px[s]; out[d + 3] = img.px[s + 1]; }
  }
  return out;
}

/**
 * Median cut. Boxes are split on their widest channel, choosing the box with the largest
 * (population x extent) — population alone over-serves flat backgrounds, extent alone over-serves
 * a handful of stray outlier pixels, and this art has both.
 */
export function palette(rgba, maxColours = 256) {
  const counts = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    // Fully transparent pixels carry no colour anyone can see; collapse them onto one entry so
    // they do not spend palette slots on whatever RGB happens to sit under the transparency.
    const key = rgba[i + 3] === 0 ? 0 : (rgba[i] << 24 | rgba[i + 1] << 16 | rgba[i + 2] << 8 | rgba[i + 3]) >>> 0;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const pts = [];
  for (const [k, n] of counts) {
    pts.push(k === 0 ? [0, 0, 0, 0, n] : [(k >>> 24) & 255, (k >>> 16) & 255, (k >>> 8) & 255, k & 255, n]);
  }
  if (pts.length <= maxColours) return pts.map((p) => p.slice(0, 4));

  let boxes = [pts];
  while (boxes.length < maxColours) {
    let bi = -1, bScore = 0, bCh = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.length < 2) continue;
      let pop = 0;
      const lo = [255, 255, 255, 255], hi = [0, 0, 0, 0];
      for (const p of b) {
        pop += p[4];
        for (let c = 0; c < 4; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
      }
      let ch = 0, ext = 0;
      for (let c = 0; c < 4; c++) { const e = hi[c] - lo[c]; if (e > ext) { ext = e; ch = c; } }
      const score = ext * Math.cbrt(pop);
      if (score > bScore) { bScore = score; bi = i; bCh = ch; }
    }
    if (bi < 0) break;
    const box = boxes[bi];
    box.sort((a, b) => a[bCh] - b[bCh]);
    let total = 0; for (const p of box) total += p[4];
    let half = 0, cut = 0;
    for (let i = 0; i < box.length; i++) { half += box[i][4]; if (half * 2 >= total) { cut = Math.max(1, Math.min(i + 1, box.length - 1)); break; } }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.filter((b) => b.length).map((b) => {
    let n = 0; const s = [0, 0, 0, 0];
    for (const p of b) { n += p[4]; for (let c = 0; c < 4; c++) s[c] += p[c] * p[4]; }
    return s.map((v) => Math.round(v / n));
  });
}

function nearest(pal, r, g, b, a) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i];
    const da = p[3] - a;
    // Alpha is weighted heavily: a pixel matched to the right colour but the wrong opacity shows
    // as a hard edge or a halo, which reads as a defect far louder than a slight hue shift.
    const dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = 3 * dr * dr + 4 * dg * dg + 2 * db * db + 12 * da * da;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Map every pixel to a palette index, optionally with Floyd-Steinberg error diffusion. */
export function remap(rgba, w, h, pal, dither = true) {
  const idx = Buffer.alloc(w * h);
  const cache = new Map();
  const err = dither ? new Float32Array(w * h * 4) : null;
  let maxErr = 0, sumErr = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      let r = rgba[o], g = rgba[o + 1], b = rgba[o + 2], a = rgba[o + 3];
      if (dither) {
        r = Math.max(0, Math.min(255, r + err[o]));
        g = Math.max(0, Math.min(255, g + err[o + 1]));
        b = Math.max(0, Math.min(255, b + err[o + 2]));
        a = Math.max(0, Math.min(255, a + err[o + 3]));
      }
      const key = (Math.round(r) << 24 | Math.round(g) << 16 | Math.round(b) << 8 | Math.round(a)) >>> 0;
      let k = cache.get(key);
      if (k === undefined) { k = nearest(pal, r, g, b, a); cache.set(key, k); }
      idx[i] = k;
      const p = pal[k];
      const de = [r - p[0], g - p[1], b - p[2], a - p[3]];
      // Report the error against the ORIGINAL pixel, not the dithered one — the original is what
      // a player would have seen, and a metric measured against our own intermediate is a metric
      // that cannot fail.
      let px = 0;
      for (let c = 0; c < 4; c++) { const d = Math.abs(rgba[o + c] - p[c]); if (d > px) px = d; }
      if (px > maxErr) maxErr = px;
      sumErr += px;
      if (dither) {
        const spread = (dx, dy, f) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) return;
          const no = (ny * w + nx) * 4;
          for (let c = 0; c < 4; c++) err[no + c] += de[c] * f;
        };
        spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
      }
    }
  }
  return { idx, maxErr, meanErr: sumErr / (w * h) };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Write an 8-bit palette PNG (PLTE + tRNS when any entry is translucent). */
export function encodePalette(w, h, pal, idx, keep = []) {
  const stride = w;
  const body = Buffer.alloc(h * (stride + 1));
  const scratch = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  let bo = 0;
  for (let y = 0; y < h; y++) {
    let best = null, bestScore = Infinity, bestType = 0;
    for (let f = 0; f < 5; f++) {
      const line = scratch[f];
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const cur = idx[y * stride + x];
        const a = x >= 1 ? idx[y * stride + x - 1] : 0;
        const b = y > 0 ? idx[(y - 1) * stride + x] : 0;
        const c = x >= 1 && y > 0 ? idx[(y - 1) * stride + x - 1] : 0;
        let v;
        if (f === 0) v = cur; else if (f === 1) v = cur - a; else if (f === 2) v = cur - b;
        else if (f === 3) v = cur - ((a + b) >> 1); else v = cur - paeth(a, b, c);
        v &= 0xff;
        line[x] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = line; bestType = f; }
    }
    body[bo++] = bestType;
    best.copy(body, bo);
    bo += stride;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = COLOUR.PALETTE; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // tRNS must be a PREFIX of the palette, so translucent entries are sorted to the front.
  const plte = Buffer.alloc(pal.length * 3);
  const trns = Buffer.alloc(pal.length);
  pal.forEach((p, i) => { plte[i * 3] = p[0]; plte[i * 3 + 1] = p[1]; plte[i * 3 + 2] = p[2]; trns[i] = p[3]; });
  let lastTranslucent = -1;
  for (let i = 0; i < pal.length; i++) if (trns[i] !== 255) lastTranslucent = i;
  const parts = [SIG, chunk('IHDR', ihdr), ...keep.map((c) => chunk(c.type, c.data)), chunk('PLTE', plte)];
  if (lastTranslucent >= 0) parts.push(chunk('tRNS', trns.subarray(0, lastTranslucent + 1)));
  parts.push(chunk('IDAT', zlib.deflateSync(body, { level: 9, memLevel: 9 })));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** Sort the palette so every translucent entry precedes every opaque one (shrinks tRNS). */
export function sortPalette(pal, idx) {
  const order = pal.map((_, i) => i).sort((a, b) => pal[a][3] - pal[b][3]);
  const rank = new Array(pal.length);
  order.forEach((old, neu) => { rank[old] = neu; });
  const out = Buffer.alloc(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = rank[idx[i]];
  return { pal: order.map((i) => pal[i]), idx: out };
}

/** The whole pipeline for one file. Returns null when the source cannot be decoded. */
export function quantizeFile(buf, { colours = 256, dither = true } = {}) {
  let img;
  try { img = decode(buf); } catch { return null; }
  const rgba = toRGBA(img);
  const pal = palette(rgba, colours);
  const { idx, maxErr, meanErr } = remap(rgba, img.w, img.h, pal, dither);
  const sorted = sortPalette(pal, idx);
  const out = encodePalette(img.w, img.h, sorted.pal, sorted.idx, ancillary(buf));
  return { buf: out, before: buf.length, after: out.length, colours: pal.length, maxErr, meanErr, w: img.w, h: img.h };
}
