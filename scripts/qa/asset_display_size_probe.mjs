// WHAT IS THE BIGGEST BOX THIS PICTURE IS EVER DRAWN INTO?
//
// Wyatt, INBOX-20260901T1335Z: "everything else should be resized and compressed according to its
// maximum pixel size in the real gameplay." That sentence names a QUANTITY, and until this probe
// nobody had measured it for the tiers where the weight actually is. Two of his three asks
// (compress, preload) shipped 2026-09-01 against measured numbers; the third was left open with
// only the ICON family measured — `pastries/`, `islands/` and the About JPEGs, 3.9 MB between
// them, were never looked at.
//
//   node scripts/qa/asset_display_size_probe.mjs
//
// TWO KINDS OF PICTURE, MEASURED TWO DIFFERENT WAYS, and conflating them is the trap this file
// exists to avoid.
//
//   HTML <img> — measured directly. Reading `height:220px` out of a stylesheet tells you the BOX,
//   not the picture: `object-fit: contain` letterboxes the image, so its real drawn width is
//   whatever the aspect ratio allows inside that box. This probe computes the CONTAINED rect.
//
//   SVG <image> ON THE BOARD (islands, docks, boats) — NOT measured from a screenshot rect. The
//   director ZOOMS, so an island photographed on an unzoomed board is not at its maximum size and
//   a rect read at one arbitrary moment under-reports it. Instead the island's size is read in
//   BOARD UNITS off the SVG (scale-free, exact) and multiplied by the largest magnification the
//   camera can ever apply ON THAT DEVICE. That is rule 26's lesson applied: when the question is
//   geometric, ask it geometrically instead of hunting for a moment that happens to show the
//   maximum.
//
//   THE CEILING IS PER DEVICE CLASS, AND GETTING THAT WRONG IS HOW THIS FILE HAS BEEN WRONG TWICE.
//   See the block at the SVG branch below for both errors and what each one would have cost.
//
// THE OUTPUT IS A LEAD, NOT A VERDICT. A file measured as oversized is a CANDIDATE; whether it may
// actually shrink is a picture question and is settled by a posed pair. Nothing here shrinks
// anything.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from '../lib/cdp.mjs';
import { intrinsicSize } from '../lib/imagesize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Seeded so two runs draft the same recipes and lay out the same board — the same device
// `asset_posed_pair.mjs` uses, and for the same reason.
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

// THE COLLECTOR. Returns [{url, dev, w, h, how}] — `dev` is DEVICE pixels of picture width, which
// is the number a resize decision actually turns on.
const COLLECT = `
(() => {
  const out = [];
  const dpr = window.devicePixelRatio || 1;
  const clean = (raw) => {
    if (!raw) return null;
    let u = raw;
    try { u = new URL(raw, location.href).pathname; } catch (e) {}
    if (!/\\.(png|jpe?g|webp|gif|avif)$/i.test(u)) return null;
    return u.replace(/^\\//, '');
  };
  const push = (raw, cssW, cssH, how) => {
    const u = clean(raw);
    if (!u || !(cssW > 0) || !(cssH > 0)) return;
    out.push({ url: u, dev: Math.round(cssW * dpr), w: Math.round(cssW), h: Math.round(cssH), how });
  };

  // --- HTML <img>, object-fit resolved -----------------------------------------------------
  for (const im of document.images) {
    const r = im.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const fit = getComputedStyle(im).objectFit;
    const nw = im.naturalWidth, nh = im.naturalHeight;
    let w = r.width, h = r.height;
    if (nw > 0 && nh > 0 && (fit === 'contain' || fit === 'scale-down')) {
      const s = Math.min(r.width / nw, r.height / nh);
      if (fit === 'contain' || s < 1) { w = nw * s; h = nh * s; }
    }
    push(im.currentSrc || im.src, w, h, 'img');
  }

  // --- CSS background-image ----------------------------------------------------------------
  for (const el of document.querySelectorAll('*')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || bg.indexOf('url(') < 0) continue;
    const r = el.getBoundingClientRect();
    for (const m of bg.matchAll(/url\\(["']?([^"')]+)["']?\\)/g)) push(m[1], r.width, r.height, 'bg');
  }

  // --- SVG <image> on the board, at the camera's MAXIMUM magnification ----------------------
  // The board's SVG viewBox is in board units; the game maps cam.w units across #boardwrap's
  // rendered width, so device pixels per board unit = (px / cam.w) * dpr, and the maximum is
  // reached at the NARROWEST cam.w the game will ever hold.
  //
  // ⚠ THIS CEILING HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND BOTH ERRORS WERE EXPENSIVE.
  //
  // WRONG #1, TOO LOW. Version 1 used zoomCap() (src/ui/stage.js:789) — the DIRECTOR's cap, 2.2 on
  // a <=600px board and scaled DOWN on anything bigger, collapsing to ~1.03 on a 1280px board. On
  // that number every island read "OVERSIZED x2" and the obvious next step was to halve
  // commissioned board art.
  //
  // WRONG #2, TOO HIGH, AND THIS IS THE SUBTLE ONE. Version 2 replaced it with the player's PINCH
  // clamp — src/ui/stage.js:945 holds cam.w at Math.max(640/2.6, ...), and camTo (:137-139) clamps
  // only the upper bound (Math.min(640, w)) with no lower clamp, so 2.6 really is reachable and
  // really does bypass zoomCap. All true. But version 2 then took the MAXIMUM across all three
  // viewports, and the winner was a 1280px DESKTOP at 2.6 — a gesture that desktop cannot make.
  // The pinch handler is gated on ptrs.size === 2 (src/ui/stage.js:941); the only other input on
  // #boardwrap is a wheel listener that parks a card and never moves the camera. A mouse-only
  // laptop is held at zoomCap, full stop. Crediting it with a two-finger pinch inflated the
  // ceiling by ~1.7x and manufactured the answer "nothing may shrink" — CEO 82's finding 2.
  //
  // SO THE CEILING IS PER DEVICE CLASS: a touch viewport can pinch to 2.6; a mouse-only desktop
  // cannot, and is held at zoomCap. The caller says which this viewport is, because the probe is
  // the only thing that knows whether it is emulating a finger or a mouse.
  const PINCH_MAX_ZOOM = 2.6;   // src/ui/stage.js:945 — reachable only where there are two pointers
  const bw = document.getElementById('boardwrap');
  const px = bw ? bw.getBoundingClientRect().width : 0;
  if (px > 0) {
    const zoomCap = px > 600 ? Math.max(1, 2.2 * 600 / px) : 2.2;   // src/ui/stage.js:789-794
    const maxZoom = window.__ppTouch ? PINCH_MAX_ZOOM : zoomCap;
    const camW = 640 / maxZoom;             // narrowest the camera can ever get, in board units
    const devPerUnit = (px / camW) * dpr;   // device pixels per board unit, at full zoom
    for (const im of document.querySelectorAll('svg image')) {
      const uw = parseFloat(im.getAttribute('width'));
      const uh = parseFloat(im.getAttribute('height'));
      if (!(uw > 0) || !(uh > 0)) continue;
      const href = im.getAttribute('href') || im.getAttribute('xlink:href');
      const u = clean(href);
      if (!u) continue;
      out.push({ url: u, dev: Math.round(uw * devPerUnit), w: Math.round(uw * devPerUnit / dpr),
                 h: Math.round(uh * devPerUnit / dpr), how: 'svg@maxzoom' });
    }
  }
  return out;
})()
`;

const seen = new Map(); // url -> {dev,w,h,where,how}
function record(rows, where) {
  for (const r of rows || []) {
    const prev = seen.get(r.url);
    if (!prev || r.dev > prev.dev) seen.set(r.url, { dev: r.dev, w: r.w, h: r.h, where, how: r.how });
  }
}

async function waitFor(t, expr, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await t.ev(expr) === true) return true;
    await sleep(250);
  }
  return false;
}

// THE STALL THAT COST THE FIRST RUN OF THIS PROBE, and it is DRIVING-THE-GAME.md §4's own warning:
// an opening-ceremony card with a single "Arrgh!" button sits in front of the recipe picker and
// nothing advances it on its own. The first version waited 25s for `.recipeThumb`, timed out, and
// reported all 21 pastries as "not seen" — an instrument that never reached its subject.
// `asset_posed_pair.mjs` has the same gap and its "recipe picker" screenshot is of this card.
async function clickThroughCeremony(t, untilSel) {
  for (let i = 0; i < 20; i++) {
    const done = await t.ev(`document.querySelectorAll('${untilSel}').length>0`);
    if (done === true) return true;
    await t.ev(`(()=>{const b=[...document.querySelectorAll('.apBtn')];
      if(document.querySelectorAll('${untilSel}').length===0 && b.length===1) b[0].click();})()`);
    await sleep(1200);
  }
  return (await t.ev(`document.querySelectorAll('${untilSel}').length>0`)) === true;
}

// `touch` is not decoration — it decides this viewport's zoom ceiling (see the SVG branch above).
// A mouse-only desktop cannot pinch, so it is held at the director's zoomCap; a phone and a tablet
// can, so they reach 2.6.
const VIEWPORTS = [
  { name: 'desktop', W: 1280, H: 900, dsf: 2, touch: false },
  { name: 'tablet', W: 834, H: 1112, dsf: 2, touch: true },
  { name: 'phone', W: 390, H: 844, dsf: 3, touch: true },
];

const notes = [];
let port = 9421;
for (const vp of VIEWPORTS) {
  const dbgPort = port++, httpPort = port++;
  const t = await openChrome({
    W: vp.W, H: vp.H, dbgPort, httpPort, serveRoot: ROOT,
    profileDir: path.join(ROOT, `.tmp-dispsize-${vp.name}`), dsf: vp.dsf,
  });
  try {
    const base = `http://127.0.0.1:${httpPort}`;
    await t.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__ppTouch=${vp.touch ? 'true' : 'false'};\n${SEED_SCRIPT}`,
    });
    await t.nav(`${base}/index.html`);
    await sleep(1500);
    await t.ev('localStorage.clear()');
    await t.nav(`${base}/index.html`);
    await sleep(2500);
    record(await t.ev(COLLECT), `${vp.name}/welcome`);

    // §3 of DRIVING-THE-GAME.md: the mode card FIRST, then the name modal.
    await t.ev(`document.getElementById('choiceSolo').click()`);
    await waitFor(t, `(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await t.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
    await t.ev(`document.getElementById('btnNameConfirm').click()`);
    await waitFor(t, `(()=>{try{return !!(appState.game&&appState.game.players.some(p=>p.strategy==='human'))}catch(e){return false}})()`, 25000);

    // SURFACE 1 — the recipe draft picker, where pastry art is drawn in quantity.
    const gotPicker = await clickThroughCeremony(t, '.recipeThumb');
    await sleep(1500);
    record(await t.ev(COLLECT), `${vp.name}/picker`);

    // SURFACE 2 — the board. Islands, docks, boats, the compass.
    if (gotPicker) {
      await t.ev(`(()=>{const c=document.querySelectorAll('.recipeCard,.apBtn');if(c[0])c[0].click()})()`);
      await sleep(1000);
      await t.ev(`(()=>{const b=[...document.querySelectorAll('button,.apBtn')].find(e=>/bake this/i.test(e.textContent||''));if(b)b.click()})()`);
    }
    await waitFor(t, `(()=>!!document.querySelector('#board image, svg#board'))()`, 25000);
    await sleep(3000);
    record(await t.ev(COLLECT), `${vp.name}/board`);

    // SURFACE 3 — the recipe MODAL, the largest pastry slot in the game, and the reason 19 of the
    // 21 pastries came back NOT SEEN on every run before 2026-09-01T23:xxZ.
    //
    // A player reaches it by tapping their own recipe in the CAPTAINS panel (`.prowRecipe`, wired
    // in recipe.js:428), so that is tried FIRST and its result is reported either way. But the row
    // only exists once this seat has committed a recipe, and the commit ahead of it (a draft card,
    // then the "Bake this!" overlay — DRIVING-THE-GAME.md §3c) does not reliably land under this
    // driver. **The modal was never refused; the thing that opens it was never built.** Waiting
    // longer on `.prowRecipe` cannot fix that, and an instrument that never reaches its subject
    // reports something about itself (rule 6).
    //
    // SO THE FALLBACK CALLS THE GAME'S OWN OPENER, `openRecipeModal()` — literally the function
    // the `.prowRecipe` handler calls on line 433 of the same file. Same DOM, same stylesheet,
    // same `object-fit` maths; nothing here draws a card of its own. ONE DISPLAY PATH holds. It is
    // the same move DRIVING-THE-GAME.md §6 makes with `board.showStats()`, and §5e's rule: pose
    // the state, do not play your way to it.
    //
    // AND IT WALKS ALL 21, not one. Every pastry is 512px wide but they differ in HEIGHT, and the
    // modal is `height:220px; object-fit:contain` — so the drawn width is set by each picture's own
    // aspect ratio, and one sample cannot stand for the family.
    let modal = 'prowRecipe-missing';
    const clicked = await t.ev(`(()=>{
      const el=[...document.querySelectorAll('.prowRecipe')].find(e=>(e.textContent||'').trim());
      if(!el) return false;
      el.click(); return true;
    })()`);
    if (clicked === true) {
      await sleep(1200);
      if (await t.ev(`document.querySelectorAll('.recipeModalThumb').length>0`) === true) {
        modal = 'prowRecipe';
        record(await t.ev(COLLECT), `${vp.name}/modal`);
      }
    }
    // RED-PROOF THE FALLBACK BEFORE BELIEVING IT: nothing is recorded unless the thumb is really on
    // screen with a real width. A modal that failed to open records nothing and says so.
    const walked = await t.ev(`(async()=>{
      const m = await import('/src/ui/recipe.js');
      if (!m.RECIPE_BOOK || !m.RECIPE_BOOK.length) return -1;
      window.__ppOpen = (i) => { m.openRecipeModal(m.RECIPE_BOOK[i].ings);
        const im = document.querySelector('.recipeModalThumb');
        return !!(im && im.getBoundingClientRect().width > 0); };
      return m.RECIPE_BOOK.length;
    })()`);
    let measured = 0;
    if (typeof walked === 'number' && walked > 0) {
      for (let i = 0; i < walked; i++) {
        const ok = await t.ev(`window.__ppOpen(${i})`);
        if (ok !== true) continue;
        await sleep(140);                       // let the <img> decode so naturalWidth is real
        const rows = await t.ev(COLLECT);
        if (Array.isArray(rows)) { record(rows, `${vp.name}/recipe-modal`); measured++; }
      }
      if (measured > 0 && modal === 'prowRecipe-missing') modal = `openRecipeModal(x${measured})`;
      // LOOK AT THE PICTURE (rule 19). A number from a modal nobody photographed is a number from
      // an instrument nobody checked.
      await t.shot(path.join(ROOT, `.tmp-dispsize-modal-${vp.name}.png`));
      await t.ev(`(()=>{const el=document.getElementById('recipeModal'); if(el) el.style.display='none';})()`);
    }
    const modalUp = measured > 0 || modal === 'prowRecipe';

    // SURFACE 4 — about.html, four JPEGs on a plain static page.
    await t.nav(`${base}/about.html`);
    await sleep(1800);
    record(await t.ev(COLLECT), `${vp.name}/about`);

    const note = `${vp.name}: picker=${gotPicker} modal=${modal}/${modalUp ? 'up' : 'NOT UP'}`;
    notes.push(note);
    console.log(note);
    if (t.consoleErrs.length) console.log(`  console: ${t.consoleErrs.slice(0, 3).join(' | ')}`);
  } finally {
    await t.close();
  }
}

// ---- the report -------------------------------------------------------------------------------
// THE SIZE READER MOVED OUT TO `scripts/lib/imagesize.mjs` ON 2026-09-02, AND THAT IS THE POINT.
// It lived here, private, reading PNG and JPEG. Then ~200 files were renamed to `.webp` by the
// compression pass, `intrinsic()` returned null for every one, and the `if (!nat) continue;` below
// dropped them out of this report in silence — 53 files, 2.09 MB, more than half the library, the
// board included. A private helper cannot be gated; a shared one can, and
// `display_size_reads_every_picture_check.mjs` now fails the build if this report ever goes blind
// to a format again.
const intrinsic = (file) => intrinsicSize(fs.readFileSync(file));

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(png|jpe?g|webp|gif|avif)$/i.test(e.name)) files.push(p);
  }
})(path.join(ROOT, 'assets'));

const rows = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const nat = intrinsic(f);
  if (!nat) continue;
  rows.push({ rel, kb: fs.statSync(f).size / 1024, nat, hit: seen.get(rel) });
}

rows.sort((a, b) => b.kb - a.kb);
console.log(`\nTOTAL ${(rows.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)} MB across ${rows.length} images`);
console.log(`Surfaces reached: ${notes.join(' | ')}\n`);
console.log('    KB   intrinsic    max drawn   wants(dev)  ratio  file');
for (const r of rows.slice(0, 50)) {
  if (!r.hit) {
    console.log(`${String(Math.round(r.kb)).padStart(6)}  ${`${r.nat.w}x${r.nat.h}`.padStart(10)}  ` +
      `${'- not seen -'.padStart(11)}  ${'-'.padStart(10)}  ${'-'.padStart(5)}  ${r.rel}`);
    continue;
  }
  const ratio = r.nat.w / r.hit.dev;
  console.log(`${String(Math.round(r.kb)).padStart(6)}  ${`${r.nat.w}x${r.nat.h}`.padStart(10)}  ` +
    `${`${r.hit.w}x${r.hit.h}`.padStart(11)}  ${String(r.hit.dev).padStart(10)}  ` +
    `${('x' + ratio.toFixed(2)).padStart(5)}  ${r.rel}  [${r.hit.where}/${r.hit.how}]`);
}

// "Oversized" = the file carries more than 1.3x the device pixels its largest slot can ever use.
// The 1.3 is headroom, not a target: it keeps a file that is merely a rounding step above its slot
// out of the candidate list, because shrinking those buys almost nothing and risks real art.
const oversized = rows.filter((r) => r.hit && r.nat.w > r.hit.dev * 1.3);

// ⚠ AND HIS SENTENCE SAYS "IN THE REAL GAMEPLAY", SO A PEAK FOUND OFF THE GAME IS NOT A PEAK.
//
// `welcome` and `about` are not gameplay: the About page and the welcome screen draw GAME ICONS
// decoratively in prose, at 18x18. So an icon whose LARGEST sighting is one of those has not been
// measured at its real slot at all — the probe simply never reached the screen it belongs to.
//
// MEASURED 2026-09-02, AND THIS IS WHY THE SPLIT EXISTS RATHER THAN A COMMENT. The three biggest
// ratios in the whole report were `icons/flip-heads.png` (x7.07), `icons/crown.png` (x5.93) and
// `icons/cupcake.png` (x5.88) — all three peaking at the SAME 18x18 slot in the About page's prose.
// `flip-heads.png` is the FLIPPENATOR COIN. Its real slot is the flip ceremony, which this probe
// does not reach, and its two siblings `flip-tails.png` and `flip-socket.webp` come back NOT SEEN
// for exactly that reason. Cutting it to 54px on this evidence would have destroyed the coin — and
// it sat at the top of the candidate list, sorted by how attractive it looked.
//
// The set is derived from the surface names this probe records, not from a list of filenames.
const GAMEPLAY = (where) => !/\/(welcome|about)$/.test(where || '');
const over = oversized.filter((r) => GAMEPLAY(r.hit.where));
const offGame = oversized.filter((r) => !GAMEPLAY(r.hit.where));

const wouldSave = over.reduce((s, r) => s + r.kb * (1 - Math.min(1, (r.hit.dev / r.nat.w) ** 2)), 0);
console.log(`\nCANDIDATES (more than 1.3x the device pixels their largest GAMEPLAY slot can use): ` +
  `${over.length} file(s), ${(over.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)} MB today, ` +
  `~${(wouldSave / 1024).toFixed(2)} MB recoverable if each were cut to its own slot.`);
for (const r of over.slice(0, 20))
  console.log(`  x${(r.nat.w / r.hit.dev).toFixed(2)}  ${r.nat.w}px -> ${r.hit.dev}px  ${Math.round(r.kb)}KB  ${r.rel}  [${r.hit.where}]`);

console.log(`\nNOT CANDIDATES — biggest sighting was OFF the game (the welcome screen or the About ` +
  `page, where game icons are drawn in prose at 18px): ${offGame.length} file(s), ` +
  `${(offGame.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)} MB. Their real slots were never ` +
  `reached. DO NOT SHRINK THESE — one of them is the flippenator coin.`);
for (const r of offGame.slice(0, 20))
  console.log(`  x${(r.nat.w / r.hit.dev).toFixed(2)}  ${r.nat.w}px  ${Math.round(r.kb)}KB  ${r.rel}  [only seen at ${r.hit.where}]`);
const unseen = rows.filter((r) => !r.hit);
console.log(`\nNOT SEEN on the surfaces this probe reaches: ${unseen.length} file(s), ` +
  `${(unseen.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)} MB. This probe reaches five surfaces, ` +
  `so NOT SEEN means "not measured here" and never "unused" — do not shrink one on this evidence.`);

// THE NUMBERS GO TO DISK, and this is not a nicety. CEO 82 finding 7: the first run of this probe
// wrote to stdout only, so the whole deliverable of a measurement item vanished with the terminal
// and the reviewer had to re-run it to see what he was being asked to believe. A measurement
// nobody can open is a measurement nobody can check.
const out = path.join(ROOT, '.planning', 'ASSET-DISPLAY-SIZES.md');
const lines = [
  '# Asset display sizes — the measured maximum each picture is drawn at',
  '',
  '*Generated by `node scripts/qa/asset_display_size_probe.mjs`. Do not hand-edit; re-run it.*',
  `*Run: ${new Date().toISOString()} — surfaces reached: ${notes.join(' | ')}*`,
  '',
  'Answers Wyatt\'s INBOX-20260901T1335Z part (c): *"everything else should be resized and',
  'compressed according to its maximum pixel size in the real gameplay."* `wants` is DEVICE pixels',
  'of picture width at the largest slot found; `ratio` is intrinsic ÷ wants, so above 1 is spare',
  'resolution and below 1 is already under-resolution.',
  '',
  '**NOT SEEN means "this probe never reached a screen that draws it" — never "unused".**',
  'Do not shrink a NOT SEEN file on this evidence.',
  '',
  // CEO 83 finding 3: the two lines that turn this table into an ANSWER were printed to the
  // terminal and never written down, so every reader had to re-run the probe to recompute them.
  // A summary nobody can open is a summary nobody checks.
  `**CANDIDATES** (more than 1.3x the device pixels their largest GAMEPLAY slot can use): ` +
  `**${over.length} file(s), ${(over.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)} MB today, ` +
  `~${(wouldSave / 1024).toFixed(2)} MB recoverable** if each were cut to its own slot. ` +
  'The 1.3 is headroom, not a target.',
  '',
  ...over.slice(0, 30).map((r) =>
    `- \`x${(r.nat.w / r.hit.dev).toFixed(2)}\` — \`${r.rel}\`, ${r.nat.w}px carried, ${r.hit.dev}px wanted, ` +
    `${Math.round(r.kb)} KB, biggest at ${r.hit.where}`),
  '',
  `⚠ **NOT CANDIDATES, AND THE MOST DANGEROUS ROWS IN THIS FILE: ${offGame.length} file(s), ` +
  `${(offGame.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)} MB whose biggest sighting was OFF ` +
  'THE GAME** — the welcome screen or the About page, which draw game icons decoratively in prose ' +
  'at 18x18. Their real gameplay slots were never reached, so their ratios are meaningless and they ' +
  'are excluded above. **`assets/icons/flip-heads.png` is one of them and it is the flippenator ' +
  'coin** — it reads x7.07 here purely because the About page shows it as an 18px inline icon, and ' +
  'its siblings `flip-tails.png` and `flip-socket.webp` come back NOT SEEN for the same reason. ' +
  'Cutting it to 54px would have destroyed the coin.',
  '',
  ...offGame.slice(0, 30).map((r) =>
    `- ~~\`x${(r.nat.w / r.hit.dev).toFixed(2)}\`~~ — \`${r.rel}\`, ${r.nat.w}px, ${Math.round(r.kb)} KB, ` +
    `only ever seen at ${r.hit.where}`),
  '',
  `**NOT SEEN: ${unseen.length} file(s), ${(unseen.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)} MB.** ` +
  'Not measured here, so not safe to shrink.',
  '',
  '⚠ **A CANDIDATE IS A LEAD, NOT A VERDICT.** This probe applies the camera\'s zoom ceiling to ' +
  '`svg image` only. An HTML `<img>` inside a camera layer (`CAM_HTML_LAYERS`, `src/ui/stage.js:476` ' +
  '— `rippleHost`, `sailHost`, `rimHost`) grows with the zoom too, and is measured here at whatever ' +
  'zoom the board happened to be at. `assets/trade-swirl.png` and `assets/wind-arrow.png` are both ' +
  'in `rimHost` (`src/ui/board.js:243-250`), so their ratios are FLOORS. Found by CEO 83; not yet fixed.',
  '',
  '| KB | intrinsic | max drawn (css) | wants (dev) | ratio | file | where |',
  '|---:|---|---|---:|---:|---|---|',
];
for (const r of rows) {
  lines.push(r.hit
    ? `| ${Math.round(r.kb)} | ${r.nat.w}x${r.nat.h} | ${r.hit.w}x${r.hit.h} | ${r.hit.dev} | ` +
      `x${(r.nat.w / r.hit.dev).toFixed(2)} | \`${r.rel}\` | ${r.hit.where}/${r.hit.how} |`
    : `| ${Math.round(r.kb)} | ${r.nat.w}x${r.nat.h} | — | — | — | \`${r.rel}\` | **NOT SEEN** |`);
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`\nwrote ${path.relative(ROOT, out)}`);
