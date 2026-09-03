#!/usr/bin/env node
/* GATE: the size reader's numbers must agree with a real image decoder, on every file.
 *
 *   node scripts/qa/imagesize_matches_browser_check.mjs
 *
 * WHY THIS EXISTS SEPARATELY FROM `display_size_reads_every_picture_check.mjs`. That gate asserts
 * the reader RETURNS something for every picture. This one asserts the something is TRUE.
 *
 * They are different failures and only the second one is dangerous. A reader that returns null is
 * caught immediately — a whole family disappears from the report. A reader that returns a plausible
 * WRONG number is invisible: it produces a ratio, the ratio lands in a candidate list, and art gets
 * resized on it. `assets/board.webp` is a `VP8X` file whose canvas size sits in a 24-bit
 * little-endian field, and reading it as 16-bit would give a number that looks like a picture size.
 *
 * SO IT VERIFIES AGAINST AN INDEPENDENT PATH, WHICH IS THE ONLY KIND OF VERIFICATION THAT COUNTS
 * (CLAUDE.md §4): the game's own browser, decoding the same file into an <img> and reporting
 * naturalWidth/naturalHeight. Chromium's WebP/PNG/JPEG decoders are not this repo's header reader,
 * so an agreement between them is real evidence and a disagreement names the file.
 *
 * IT IS NOT IN `npm test` — it launches a browser, which the fast suite must not. Run it whenever
 * `scripts/lib/imagesize.mjs` changes; that is what its own header says to do.
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";
import { intrinsicSize } from "../lib/imagesize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PATTERN = /\.(png|jpe?g|webp|gif|avif)$/i;

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (PATTERN.test(e.name)) files.push(path.relative(ROOT, p).replace(/\\/g, "/"));
  }
})(path.join(ROOT, "assets"));

const mine = new Map();
for (const rel of files) mine.set(rel, intrinsicSize(fs.readFileSync(path.join(ROOT, rel))));

const t = await openChrome({
  W: 800, H: 600, dbgPort: 9481, httpPort: 9482, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-imagesize-check"),
});
let theirs = null;
try {
  await t.nav(`http://127.0.0.1:9482/index.html`);
  theirs = await t.ev(`(async () => {
    const list = ${JSON.stringify(files)};
    const out = {};
    for (const rel of list) {
      out[rel] = await new Promise((res) => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => res(null);
        im.src = '/' + rel;
      });
    }
    return out;
  })()`);
} finally {
  await t.close();
}

let fail = false;
const say = (ok, label) => { console.log(`${ok ? "OK" : "FAIL"} -- ${label}`); if (!ok) fail = true; };

say(theirs && Object.keys(theirs).length === files.length,
  `the browser decoded ${theirs ? Object.keys(theirs).length : 0} of ${files.length} file(s) — a gate whose second opinion never arrived would pass on nothing`);

const bad = [];
for (const rel of files) {
  const a = mine.get(rel), b = theirs && theirs[rel];
  if (!a || !b) { bad.push([rel, a, b]); continue; }
  if (a.w !== b.w || a.h !== b.h) bad.push([rel, a, b]);
}
say(bad.length === 0,
  bad.length === 0
    ? `all ${files.length} pictures: the header reader and the browser agree exactly on width and height`
    : `${bad.length} picture(s) where the header reader and the browser DISAGREE`);

for (const [rel, a, b] of bad.slice(0, 12))
  console.log(`   ${rel}  reader=${a ? `${a.w}x${a.h}` : "null"}  browser=${b ? `${b.w}x${b.h}` : "could not decode"}`);

process.exit(fail ? 1 : 0);
