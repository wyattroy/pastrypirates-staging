// Asset weight report — what every image WEIGHS and what it MEASURES, in one table.
//
// WHY this exists (INBOX-20260901T1335Z, Wyatt: "compressing the images to make the game load MUCH
// faster ... everything else should be resized and compressed according to its maximum pixel size in
// the real gameplay"): before anything is resized, the question "how big is this drawn?" has to be
// answered from the game, not from memory. This prints the intrinsic size beside the byte cost so a
// resize decision is made against a measurement rather than a guess.
//
// Header-only: no image library, no dependency, because this repo has none and adding one to answer
// "how wide is this file?" would be tooling in place of a fix. PNG dimensions live at a fixed offset;
// JPEG's live in the first SOFn marker. That covers every asset this game ships.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function pngSize(b) {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

export function jpgSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    // SOF0..SOF15, minus DHT (c4), JPG (c8) and DAC (cc), which are not frame headers
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

export function imageSize(file) {
  const b = fs.readFileSync(file);
  const d = pngSize(b) || jpgSize(b);
  return { bytes: b.length, w: d ? d.w : null, h: d ? d.h : null };
}

export function inventory(assetsDir = path.join(ROOT, 'assets')) {
  const rows = [];
  for (const f of walk(assetsDir)) {
    if (!EXTS.has(path.extname(f).toLowerCase())) continue;
    const { bytes, w, h } = imageSize(f);
    rows.push({ file: path.relative(ROOT, f).split(path.sep).join('/'), bytes, w, h });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  return rows;
}

export function totalBytes(rows) {
  return rows.reduce((s, r) => s + r.bytes, 0);
}

if (process.argv[1] && process.argv[1].endsWith('asset_weight_report.mjs')) {
  const rows = inventory();
  const total = totalBytes(rows);
  console.log(`TOTAL ${(total / 1048576).toFixed(2)} MB across ${rows.length} images\n`);
  console.log('    KB   intrinsic  file');
  for (const r of rows) {
    console.log(
      String(Math.round(r.bytes / 1024)).padStart(6),
      `${r.w ?? '?'}x${r.h ?? '?'}`.padStart(11),
      r.file
    );
  }
}
