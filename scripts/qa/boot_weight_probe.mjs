// How many bytes of art does a player download to start a voyage? Measured, in a real browser.
//
// INBOX-20260901T1335Z is about ONE number and it is not the size of the repo: "compressing the
// images to make the game load MUCH faster". The tree total is a proxy. THIS is the quantity —
// what a cold browser actually pulls down before the board is playable, which is the tree total
// filtered by what `preloadAssets()` and the first screens genuinely request.
//
//   node scripts/qa/boot_weight_probe.mjs [--baseline=FILE]
//
// It boots the real game with an empty cache, waits for the fetches to settle, and lists every
// asset the browser asked for with its transferred size. `--baseline` compares against a JSON
// inventory recorded earlier (scripts/qa/asset_weight_report.mjs), which is how the before/after
// is honest: the SAME set of requested files, weighed twice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from '../lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselineArg = (process.argv.find((a) => a.startsWith('--baseline=')) || '').slice(11);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await openChrome({
  W: 1280, H: 900, dbgPort: 9415, httpPort: 8415, serveRoot: ROOT,
  profileDir: path.join(ROOT, '.tmp-bootweight-profile'), dsf: 1,
});
try {
  await t.send('Network.enable');
  await t.send('Network.clearBrowserCache');
  await t.nav('http://127.0.0.1:8415/index.html');
  await sleep(2000);
  await t.ev('localStorage.clear()');
  await t.send('Network.clearBrowserCache');
  await t.nav('http://127.0.0.1:8415/index.html');
  // preloadAssets() is fired without being awaited on the fresh-visit path, so the fetches keep
  // arriving after the welcome screen paints. Wait long enough for them to land.
  await sleep(12000);

  const entries = await t.ev(`performance.getEntriesByType('resource')
    .filter(e => /\\/assets\\//.test(e.name))
    .map(e => ({ name: new URL(e.name).pathname.replace(/^\\//, ''), size: e.transferSize || e.encodedBodySize || 0 }))`);

  if (!Array.isArray(entries)) { console.error('probe failed:', entries); process.exit(1); }
  const seen = new Map();
  for (const e of entries) if (!seen.has(e.name) || seen.get(e.name) < e.size) seen.set(e.name, e.size);

  let now = 0;
  for (const v of seen.values()) now += v;
  console.log(`boot fetches ${seen.size} asset files, ${(now / 1048576).toFixed(2)} MB over the wire`);

  if (baselineArg) {
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, baselineArg), 'utf8'));
    const byName = new Map(base.map((r) => [r.file, r.bytes]));
    let then = 0, missing = 0;
    for (const name of seen.keys()) {
      if (byName.has(name)) then += byName.get(name); else missing++;
    }
    console.log(`the same ${seen.size - missing} files weighed ${(then / 1048576).toFixed(2)} MB before this change`);
    console.log(`SAVED ON THE BOOT PATH: ${((then - now) / 1048576).toFixed(2)} MB (${(100 * (then - now) / then).toFixed(1)}%)`);
    if (missing) console.log(`(${missing} requested files were not in the baseline inventory)`);
  }

  const rows = [...seen].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('\n     KB  file');
  for (const [n, s] of rows) console.log(String(Math.round(s / 1024)).padStart(7), ` ${n}`);
  if (t.consoleErrs.length) console.log(`\nconsole errors: ${t.consoleErrs.slice(0, 3).join(' | ')}`);
} finally {
  await t.close();
}
