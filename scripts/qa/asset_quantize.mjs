// Quantize assets/ to 256-colour palette PNGs. Dry run by default; --write to replace.
//
// INBOX-20260901T1335Z. This is the LOSSY half, so it reports what it costs as well as what it
// saves: per file, the mean and worst per-channel error against the original pixels.
//
//   node scripts/qa/asset_quantize.mjs                 # measure, change nothing
//   node scripts/qa/asset_quantize.mjs --write         # replace files that pass the guard
//   node scripts/qa/asset_quantize.mjs --only=pastries # one family
//
// THE GUARD, and why it is not just "did it get smaller": a file is only replaced when it saves at
// least MIN_SAVING of its bytes AND its mean error stays under MAX_MEAN_ERR. Small icons already
// use few colours, so quantizing them buys almost nothing and can only add risk; the guard keeps
// this off files it cannot actually help.
//
// ⚠ THE BOARD IS NO LONGER HERE, AND THE EXCLUSION THAT USED TO SIT BELOW COST TWO DAYS. This file
// carried `EXCLUDE = new Set(['assets/board.png'])`, justified as "Wyatt named it the one file that
// stays as it is". He did not. His words were "the only one that needs to be as big as it is is the
// board itself", inside a sentence about resizing to maximum on-screen pixel size — an exemption
// from RESIZING, not from compression. The exclusion then propagated into every measurement that
// followed ("excluding board.png, 6.36 MB remains"), so the single largest file in the game — 4.24
// MB, 43% of all its art — stopped being counted as work at all, while the launch-critical item it
// belonged to stayed open. It went to WebP on 2026-09-02 at its own 2132x2132: 4.24 MB -> 0.19 MB.
// THE REUSABLE PART: an exclusion written from a paraphrase of what somebody wanted is invisible
// once it is in the code, because every later reader inherits the paraphrase and not the sentence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quantizeFile } from '../lib/png_quantize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXCLUDE = new Set();
export const MIN_SAVING = 0.25;   // below this the colour cost is not worth paying
export const MAX_MEAN_ERR = 4.0;  // mean per-channel distance, 0-255

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out;
}

const write = process.argv.includes('--write');
// --out=DIR writes the candidates to a scratch mirror instead of over the real art, so an
// INDEPENDENT decoder (Chrome, via asset_quantize_verify.mjs) can check this brand-new encoder
// before its output is allowed anywhere near assets/. Trusting a codec you wrote an hour ago
// because its own byte counts look good is exactly the "instrument that cannot fail" trap.
const outDir = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const files = walk(path.join(ROOT, 'assets'))
  .filter((f) => {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    return !EXCLUDE.has(rel) && (!only || rel.includes(only));
  });

let before = 0, after = 0, changed = 0;
const rows = [], held = [];
for (const f of files) {
  const orig = fs.readFileSync(f);
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  before += orig.length;
  const r = quantizeFile(orig);
  if (!r) { after += orig.length; held.push({ rel, why: 'not decodable' }); continue; }
  const saving = (r.before - r.after) / r.before;
  if (saving < MIN_SAVING || r.meanErr > MAX_MEAN_ERR) {
    after += orig.length;
    held.push({ rel, why: `saving ${(saving * 100).toFixed(0)}%, mean err ${r.meanErr.toFixed(2)}` });
    continue;
  }
  after += r.after;
  changed++;
  rows.push({ rel, ...r, saving });
  if (write) fs.writeFileSync(f, r.buf);
  if (outDir) {
    const dest = path.join(ROOT, outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, r.buf);
  }
}

rows.sort((a, b) => (b.before - b.after) - (a.before - a.after));
console.log(`${write ? 'REWROTE' : 'DRY RUN'} — ${changed} of ${files.length} PNGs quantized` +
  (EXCLUDE.size ? ` (${EXCLUDE.size} excluded by name)` : ''));
console.log(`  before ${(before / 1048576).toFixed(2)} MB   after ${(after / 1048576).toFixed(2)} MB   saved ${((before - after) / 1048576).toFixed(2)} MB (${(100 * (before - after) / before).toFixed(1)}%)`);
console.log(`  held back: ${held.length}`);
console.log('\n  saved   before    after  meanErr  maxErr  file');
for (const r of rows.slice(0, 30)) {
  console.log(
    String(Math.round((r.before - r.after) / 1024)).padStart(7),
    String(Math.round(r.before / 1024)).padStart(8),
    String(Math.round(r.after / 1024)).padStart(8),
    r.meanErr.toFixed(2).padStart(8),
    String(r.maxErr).padStart(7),
    ` ${r.rel}`
  );
}
for (const h of held.slice(0, 10)) console.log(`  held: ${h.rel} — ${h.why}`);
