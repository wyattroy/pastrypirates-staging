// Re-encode every PNG in assets/ losslessly. Dry run by default; --write to actually replace.
//
// INBOX-20260901T1335Z, Wyatt: "compressing the images to make the game load MUCH faster."
// This is the lossless half — same pixels, same dimensions, fewer bytes. Nothing here changes what
// the art looks like, so it needs no taste decision from him and cannot degrade a commission.
//
//   node scripts/qa/asset_recompress.mjs            # measure, change nothing
//   node scripts/qa/asset_recompress.mjs --write    # replace the files that got smaller
//
// A file is only replaced when it (a) decodes, (b) re-encodes SMALLER, and (c) round-trips to
// pixels identical to the original. (c) is not paranoia: this codec is new, and an encoder bug
// would put corrupted art on the board while every byte-count in this report still looked like a
// win. See CLAUDE.md rule 6 — check that the instrument reaches its subject.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, ancillary, alphaIsDeadWeight, dropAlpha } from '../lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out;
}

/** Returns the smaller re-encoding of one PNG, or null when it cannot be improved safely. */
export function shrink(buf) {
  let img;
  try { img = decode(buf); } catch (e) { return { skipped: e.message }; }
  const keep = ancillary(buf);
  const droppedAlpha = alphaIsDeadWeight(img);
  const work = droppedAlpha ? dropAlpha(img) : img;
  const out = encode(work, keep);
  // (c) the round-trip: decode what we are about to write, and demand the visible pixels match.
  const back = decode(out);
  const bpp = work.bpp;
  if (back.w !== img.w || back.h !== img.h || back.bpp !== bpp) return { skipped: 'round-trip shape' };
  for (let p = 0, q = 0; p < img.px.length; p += img.bpp, q += bpp) {
    for (let c = 0; c < bpp; c++) if (img.px[p + c] !== back.px[q + c]) return { skipped: 'round-trip pixels' };
  }
  return { buf: out, droppedAlpha, before: buf.length, after: out.length };
}

const write = process.argv.includes('--write');
const files = walk(path.join(ROOT, 'assets'));
let before = 0, after = 0, changed = 0, alphaDropped = 0;
const skips = new Map();
const rows = [];

for (const f of files) {
  const orig = fs.readFileSync(f);
  before += orig.length;
  const r = shrink(orig);
  if (r.skipped) {
    skips.set(r.skipped, (skips.get(r.skipped) || 0) + 1);
    after += orig.length;
    continue;
  }
  if (r.after >= r.before) { after += orig.length; continue; }
  after += r.after;
  changed++;
  if (r.droppedAlpha) alphaDropped++;
  rows.push({ f: path.relative(ROOT, f).split(path.sep).join('/'), before: r.before, after: r.after, a: r.droppedAlpha });
  if (write) fs.writeFileSync(f, r.buf);
}

rows.sort((a, b) => (b.before - b.after) - (a.before - a.after));
console.log(`${write ? 'REWROTE' : 'DRY RUN'} — ${changed} of ${files.length} PNGs get smaller`);
console.log(`  before ${(before / 1048576).toFixed(2)} MB   after ${(after / 1048576).toFixed(2)} MB   saved ${((before - after) / 1048576).toFixed(2)} MB (${(100 * (before - after) / before).toFixed(1)}%)`);
console.log(`  unused alpha channels dropped: ${alphaDropped}`);
for (const [why, n] of skips) console.log(`  skipped (${why}): ${n}`);
console.log('\n  saved  before   after   file');
for (const r of rows.slice(0, 25)) {
  console.log(
    String(Math.round((r.before - r.after) / 1024)).padStart(7),
    String(Math.round(r.before / 1024)).padStart(7),
    String(Math.round(r.after / 1024)).padStart(7),
    ` ${r.f}${r.a ? '  [dropped dead alpha]' : ''}`
  );
}
