// POSE THE BOARD — the same seeded voyage, photographed before and after the art change.
//
// CLAUDE.md rule 26, in his words: "don't touch bubble placement again without a posed comparison —
// the same seeded sail prompt, before and after, two screenshots." The art is the same class of
// question: "does the game still LOOK right" cannot be answered by a byte count or by a mean-error
// number, and it certainly cannot be answered by a rate over a stochastic voyage.
//
//   node scripts/qa/asset_posed_pair.mjs --tag=before
//   ...swap the assets...
//   node scripts/qa/asset_posed_pair.mjs --tag=after
//
// THE GAME HAS NO SEED PARAMETER, so the pose is made by replacing Math.random with a fixed
// mulberry32 BEFORE the first script runs (Page.addScriptToEvaluateOnNewDocument). Both runs then
// draft the same recipes, lay out the same board and seat the same captains — which is the whole
// point: any pixel that differs between the two shots differs because of the art, and nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from '../lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tag = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=shot').slice(6);

// Posing an ART comparison means swapping the art, and the game hardcodes `assets/`, so the swap
// has to happen on disk. These two flags are part of the pose, not a side utility:
//   --save=DIR     copy assets/ aside (do this with the NEW art in place)
//   --restore=DIR  put it back afterwards
// Between the two, `git checkout -- assets` gives you the ORIGINAL art to photograph.
const save = (process.argv.find((a) => a.startsWith('--save=')) || '').slice(7);
const restore = (process.argv.find((a) => a.startsWith('--restore=')) || '').slice(10);
if (save || restore) {
  const src = save ? path.join(ROOT, 'assets') : path.join(ROOT, restore);
  const dst = save ? path.join(ROOT, save) : path.join(ROOT, 'assets');
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log(`copied ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dst)}`);
  process.exit(0);
}

const outDir = path.join(ROOT, '.tmp-posed');
fs.mkdirSync(outDir, { recursive: true });

const SEED_SCRIPT = `
  (() => {
    let a = 0x9e3779b9;
    Math.random = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(t, expr, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await t.ev(expr) === true) return true;
    await sleep(250);
  }
  return false;
}

const t = await openChrome({
  W: 1280, H: 900, dbgPort: 9413, httpPort: 8413, serveRoot: ROOT,
  profileDir: path.join(ROOT, '.tmp-posed-profile'), dsf: 2,
});
try {
  // Seeded BEFORE any document script — this is what makes the two runs comparable.
  await t.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SCRIPT });
  await t.nav('http://127.0.0.1:8413/index.html');
  await sleep(1500);
  await t.ev('localStorage.clear()');
  await t.nav('http://127.0.0.1:8413/index.html');
  await sleep(2500);

  // §3 of DRIVING-THE-GAME.md: click the mode card FIRST, then the name modal.
  await t.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(t, `(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await t.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await t.ev(`document.getElementById('btnNameConfirm').click()`);

  // A game with a HUMAN seat — not the welcome screen's all-bot attract board (§3's second trap).
  await waitFor(t, `(()=>{try{return !!(appState.game&&appState.game.players.some(p=>p.strategy==='human'))}catch(e){return false}})()`, 25000);

  // The recipe picker is where the pastry art is drawn largest and in quantity — the single most
  // exposed surface of this change.
  const gotPicker = await waitFor(t, `(()=>document.querySelectorAll('.recipeThumb').length>0)()`, 25000);
  await sleep(1800);
  await t.shot(path.join(outDir, `${tag}-1-recipe-picker.png`));

  // The board: islands, docks, boats, the wind arrow, the compass — the other quantized families.
  if (gotPicker) {
    await t.ev(`(()=>{const c=document.querySelectorAll('.recipeCard,.apBtn');if(c[0])c[0].click()})()`);
    await sleep(1200);
    await t.ev(`(()=>{const b=[...document.querySelectorAll('button,.apBtn')].find(e=>/bake this/i.test(e.textContent||''));if(b)b.click()})()`);
  }
  await waitFor(t, `(()=>!!document.querySelector('#board image, #board .islandArt, svg#board'))()`, 25000);
  await sleep(3000);
  await t.shot(path.join(outDir, `${tag}-2-board.png`));

  const counts = await t.ev(`({thumbs:document.querySelectorAll('.recipeThumb').length,
      imgs:document.querySelectorAll('#board image').length,
      broken:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.getAttribute('src')).slice(0,10)})`);
  console.log(`${tag}: recipeThumbs=${counts.thumbs} boardImages=${counts.imgs}`);
  console.log(`${tag}: images that FAILED to decode: ${counts.broken.length ? counts.broken.join(', ') : 'none'}`);
  if (t.consoleErrs.length) console.log(`${tag}: console errors: ${t.consoleErrs.slice(0, 5).join(' | ')}`);
  console.log(`${tag}: wrote ${outDir}`);
} finally {
  await t.close();
}
