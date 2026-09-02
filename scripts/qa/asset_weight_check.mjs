// GATE: the game's art must not get heavier than the ceiling Wyatt paid for.
//
// INBOX-20260901T1335Z, his words: "compressing the images to make the game load MUCH faster...
// this is launch critical". A one-off compression pass is worth nothing six weeks later if nobody
// notices the tree drifting back up — and nobody will, because a heavy asset is invisible on a
// developer machine with a warm cache and a fast connection. That is the whole reason this is a
// gate and not a note.
//
// The ceiling lives in package.json (`assets.ceilingBytes`), beside `gates.ceiling`, and follows
// the same rule that one earned: it is set at the CURRENT total the day it is established, so the
// next increase is a conscious decision somebody takes rather than a drift nobody sees. Raising it
// is allowed. Raising it without saying why in the commit is the thing this stops.
//
// Deliberately cheap — it stats files, it does not decode them. `scripts/qa/asset_quantize.mjs`
// is the slow instrument that says HOW MUCH slack is left, and it stays out of `npm test` on
// purpose (docs/GATE-RETIREMENT.md: an advisory tool is not a gate).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function weigh(assetsDir = path.join(ROOT, 'assets')) {
  const byFamily = new Map();
  let total = 0, count = 0;
  for (const f of walk(assetsDir)) {
    if (!EXTS.has(path.extname(f).toLowerCase())) continue;
    const rel = path.relative(assetsDir, f).split(path.sep).join('/');
    const family = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '(top level)';
    const bytes = fs.statSync(f).size;
    byFamily.set(family, (byFamily.get(family) || 0) + bytes);
    total += bytes;
    count++;
  }
  return { total, count, byFamily };
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ceiling = pkg.assets && pkg.assets.ceilingBytes;
if (!ceiling) {
  console.error('FAIL — package.json has no assets.ceilingBytes, so nothing is guarding the art weight');
  process.exit(1);
}

const { total, count, byFamily } = weigh();
const mb = (n) => (n / 1048576).toFixed(2);
/* THE EXACT BYTE TOTAL IS PRINTED BESIDE THE MB, because `ceilingBytes` is a BYTE figure and this
   gate is the only thing that knows the current one. Printing MB alone meant that ratcheting the
   ceiling down after a compression pass — the whole way this gate is supposed to be maintained —
   required going and counting the tree by hand, so in practice nobody did and the ceiling drifted
   0.43 MB above the art it guards. An instrument that reports a number you cannot act on is an
   instrument that stops being used. (2026-09-02, the WebP pass.) */
console.log(`assets: ${mb(total)} MB across ${count} files (${total} bytes; ceiling ${mb(ceiling)} MB = ${ceiling} bytes)`);
for (const [f, b] of [...byFamily].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${mb(b).padStart(6)} MB  ${f}`);
}

if (total > ceiling) {
  console.error(`\nFAIL — the art weighs ${mb(total)} MB, ${mb(total - ceiling)} MB over the ${mb(ceiling)} MB ceiling.`);
  console.error('Either compress it (node scripts/qa/asset_quantize.mjs) or raise assets.ceilingBytes');
  console.error('in package.json and say in the commit message what a player gets for the extra weight.');
  process.exit(1);
}
console.log(`\nPASS — ${mb(ceiling - total)} MB of headroom.`);
