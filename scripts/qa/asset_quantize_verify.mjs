// Verify the quantized art with an INDEPENDENT decoder — the browser that will actually draw it.
//
// WHY, and this is the whole point (CLAUDE.md rule 6, "verify against an independent path, never
// against the suspect itself"): `scripts/lib/png_quantize.mjs` is a PNG encoder written from
// scratch on 2026-09-01. Its own error numbers are computed from its own palette by its own code —
// if the encoder writes a malformed PLTE, a wrong tRNS length or a bad filter byte, every one of
// those numbers still looks excellent and the art on the board is ruined. Chrome does not share
// any of that code, and Chrome is what a player uses.
//
//   node scripts/qa/asset_quantize_verify.mjs [--dir=.tmp-quant] [--limit=N]
//
// For each candidate: load the ORIGINAL and the CANDIDATE as real images, draw both to a canvas
// over the same opaque backdrop (so translucent pixels are compared as a player would see them,
// composited, not as raw premultiplied noise), and report the mean and worst channel difference.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from '../lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = (process.argv.find((a) => a.startsWith('--dir=')) || '--dir=.tmp-quant').slice(6);
const limit = Number((process.argv.find((a) => a.startsWith('--limit=')) || '--limit=0').slice(8)) || 0;

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.png')) out.push(p);
  }
  return out;
}

const base = path.join(ROOT, dir);
if (!fs.existsSync(base)) { console.error(`no candidate directory at ${dir} — run asset_quantize.mjs --out=${dir}`); process.exit(1); }
let rels = walk(base).map((f) => path.relative(base, f).split(path.sep).join('/'));
if (limit) rels = rels.slice(0, limit);

const t = await openChrome({ W: 400, H: 400, dbgPort: 9411, httpPort: 8411, serveRoot: ROOT, profileDir: path.join(ROOT, '.tmp-quant-profile') });
try {
  // Any same-origin page will do — this probe only needs a document on 127.0.0.1:8411 so that the
  // relative image loads below resolve against the served repo root.
  await t.nav(`http://127.0.0.1:8411/about.html`);
  await new Promise((r) => setTimeout(r, 1200));

  const script = `(async () => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + src)); i.src = src; });
    const out = [];
    for (const rel of ${JSON.stringify(rels)}) {
      try {
        const [a, b] = await Promise.all([load('/' + rel), load('/${dir}/' + rel)]);
        if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) { out.push({ rel, err: 'size ' + a.naturalWidth + 'x' + a.naturalHeight + ' vs ' + b.naturalWidth + 'x' + b.naturalHeight }); continue; }
        const w = a.naturalWidth, h = a.naturalHeight;
        const draw = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
          // composite over mid grey: a player never sees a bare alpha channel, they see the art on
          // the board, so comparing composited pixels is comparing what they actually look at.
          x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const pa = draw(a), pb = draw(b);
        let sum = 0, max = 0, n = 0;
        for (let i = 0; i < pa.length; i += 4) {
          for (let c = 0; c < 3; c++) { const d = Math.abs(pa[i + c] - pb[i + c]); sum += d; if (d > max) max = d; }
          n += 3;
        }
        out.push({ rel, mean: sum / n, max, w, h });
      } catch (e) { out.push({ rel, err: String(e.message || e) }); }
    }
    return out;
  })()`;

  const res = await t.ev(script);
  if (!Array.isArray(res)) { console.error('probe failed:', res); process.exit(1); }

  const bad = res.filter((r) => r.err);
  const ok = res.filter((r) => !r.err);
  ok.sort((a, b) => b.mean - a.mean);
  console.log(`Chrome decoded ${ok.length} of ${res.length} candidates`);
  if (bad.length) { console.log('\nFAILED TO DECODE OR WRONG SIZE:'); for (const b of bad) console.log(`  ${b.rel} — ${b.err}`); }
  console.log('\n  mean   max  file   (composited over mid grey, 0-255 per channel)');
  for (const r of ok.slice(0, 15)) console.log(`  ${r.mean.toFixed(2).padStart(5)} ${String(r.max).padStart(5)}  ${r.rel}`);
  const worstMean = ok.length ? ok[0].mean : 0;
  console.log(`\nworst mean error across all candidates: ${worstMean.toFixed(2)} / 255`);
  process.exitCode = bad.length ? 1 : 0;
} finally {
  await t.close();
}
