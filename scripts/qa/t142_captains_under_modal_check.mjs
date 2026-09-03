/* T-142 — DOES THE CAPTAINS PANEL READ THROUGH AN OPEN MODAL?
 *
 *   node scripts/qa/t142_captains_under_modal_check.mjs
 *
 * WHY THIS IS A POSE AND NOT A RATE (rule 26). The claim is "five of the ten screens the trial's
 * eyes rejected are this one bug on tablet". A rate over a driven voyage cannot settle where a box
 * is drawn; two painted rectangles can.
 *
 * ⚠ TWO HONEST LIMITS ON WHAT THESE PICTURES ARE, both found by CEO 175, both stated here rather
 * than left for the next reader to discover:
 *
 *   THIS IS NOT A SEEDED PAIR, AND AN EARLIER VERSION OF THIS PARAGRAPH SAID IT WAS. Line ~190
 *   mints a random `pp_id` per run, so the before and after shots are DIFFERENT voyages — different
 *   islands, different wind. That is survivable for THIS question only because the question is
 *   about one fixed-position box: `#pp4Cap`'s rect and the card's rect came back byte-identical
 *   across both runs, which is what makes the comparison sound. **It would NOT be sound for
 *   anything that depends on the board.** Rule 26 asks for the same seed; this delivers the same
 *   BOXES and says so.
 *
 *   THE FILENAMES SAY `under-recipe` AND THE MODAL IS USUALLY `howToPlayModal`. The recipe row is
 *   only clickable once `mayRevealRecipe()` has filled it (`src/ui/board.js:1721`), which it has
 *   not this early, so the pose falls through to How-to-play. The names are left alone because the
 *   commit and the CEO review already cite them; `posedVia` in the JSON is the field that tells the
 *   truth, and it is the one to read.
 *
 * ⚠ THE CHART ROW'S STATED MECHANISM IS WRONG, AND THIS PROBE EXISTS PARTLY TO SAY SO.
 * `CHART.md` ⟨T-142⟩ says modals are "centred cards at z-index:1000 WITH NO SCRIM OVER THE FIXED
 * BAR". There IS a scrim: `.modalOverlay` is `position:fixed; inset:0; z-index:1000`
 * (`index.html:1232`), stacked well above `#pp4Cap`'s 22 (`index.html:1752` — the row cites 1748,
 * which is a comment). So this is NOT a stacking fault and NOT a missing covering. The overlay's
 * paint is `radial-gradient(…, rgba(69,223,166,.22), rgba(41,163,178,.40) 68%)` — 22% to 40% alpha
 * — and `#pp4Cap` is `rgba(255,253,242,.97)`, a near-opaque cream bar. A cream bar reads straight
 * through a 30% teal wash. THE SCRIM WAS NEVER MEANT TO HIDE ANYTHING: until the CAPTAINS bar
 * existed there was nothing behind it but the board, which is exactly what it is there to show.
 *
 * So the probe reports the overlay's own computed background alpha beside the geometry, because
 * "the covering is see-through" and "there is no covering" are different bugs with different fixes
 * and the row picked the wrong one.
 *
 * WHAT IT MEASURES — every number a geometric fact off the live page, nothing judged:
 *   exposedPx        the width of #pp4Cap left uncovered by the modal CARD, inside the band where
 *                    the two actually overlap vertically. THIS IS THE RED/GREEN NUMBER. Zero means
 *                    a player cannot read the bar under a modal.
 *   cutRows          which captain rows are split by the card's edge — the half-words a player sees
 *                    ("Davy", "Dou" in solo-tablet-002, per the row). Reported with their TEXT so a
 *                    human can check the probe found what it says it found (rule 6).
 *   scrimAlpha       the overlay's own background alpha. The mechanism, stated as a number.
 *
 * THREE SEATS, because "tablet only" is a claim this probe has to be able to FALSIFY. If the phone
 * seat also shows an exposed bar, the width explanation is wrong and no width-reasoned fix should
 * ship. The desktop seat is the control where the panel is a side column, not a bottom bar.
 *
 * NO GAME CODE IS TOUCHED BY THIS FILE. It is an instrument.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8619, DBG = 9519;
const OUT = process.env.T142_OUT || path.join(process.cwd(), ".planning", "posed");
/* `--after` only changes the filename, so a before and an after sit side by side for his eye */
const TAG = process.argv.includes("--after") ? "after" : "before";
fs.mkdirSync(OUT, { recursive: true });

const SEATS = [
  { tag: "tablet-820x1180", W: 820,  H: 1180, dsf: 2, mobile: true },
  { tag: "phone-390x664",   W: 390,  H: 664,  dsf: 2, mobile: true },
  { tag: "desktop-1440x900",W: 1440, H: 900,  dsf: 1, mobile: false },
];

/* Reach the stage the way a player does: pick solo, take the default name, choose a recipe. The
   seat-0 default is "Davy Scones" (`src/shared/index.js:606`) — the very name the row says is cut
   to "Davy" — so it is deliberately left alone. */
const ADVANCE = `(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis).find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';} return null;})()`;

/* THE POSE ITSELF. The recipe modal is opened by tapping a recipe line inside the CAPTAINS panel
   (`src/ui/recipe.js:437` delegates off `#players`), so the modal a player opens from this bar is
   opened here the same way — a real click on a real element, not `openRecipeModal()` called by
   hand. If the click cannot be made, the seat reports NOT MEASURED rather than a zero. */
/* ⚠ AND THE RECIPE ROW IS NOT ALWAYS THERE TO CLICK, which is why this falls back rather than
   failing. `src/ui/board.js:1721-1725` only fills `#prowRecipe{i}` when `mayRevealRecipe()` says so;
   before that the cell holds a "Check my recipe" button or a cargo list, and early in a voyage it is
   empty. A probe that insisted on the recipe modal reported NOT MEASURED on all three seats.
   THE ROW'S CLAIM IS "EVERY MODAL", so any `.modalOverlay` over the stage is on-claim — and
   `#btnShowLog` (`src/orchestrator.js:2505`) is a real ribbon button a player can press at any
   moment on the stage. WHICH modal was posed is reported, never assumed. */
const OPEN_MODAL = `(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden';};
  const el=[...document.querySelectorAll('#players .prowRecipe')].find(e=>vis(e)&&(e.textContent||'').trim());
  if(el){ el.click(); return 'recipeModal'; }
  for(const [id,modal] of [['btnShowHow','howToPlayModal'],['btnShowLog','logModal']]){
    const b=document.getElementById(id); if(b&&vis(b)){ b.click(); return modal; }
  }
  /* LAST RESORT, AND IT IS THE HANDLER'S OWN LINE, NOT A MONKEY-PATCH. On the phone/tablet stage
     the ribbon's buttons are not on screen, so neither opener above can be clicked — and the small
     seats reported NOT MEASURED, which is the seat the whole row is about. This sets exactly what
     src/orchestrator.js:2522 sets (howToPlayModal.style.display = flex), so the page reaches the
     same state a player's tap reaches. NOTHING IS STUBBED and no game code is altered. It is
     recorded as howToPlayModal(posed) so the record never implies a click that did not happen —
     and the row's own evidence that a player really does reach this state is the trial's own
     screenshots, solo-tablet-002/003. */
  const m=document.getElementById('howToPlayModal');
  if(m){ m.style.display='flex'; return 'howToPlayModal(posed)'; }
  return 'no .prowRecipe with text, no visible opener, and no #howToPlayModal';})()`;

const MEASURE = `JSON.stringify((()=>{
  const vis = e => { if(!e) return false; const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
    return r.width>2 && r.height>2 && s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity||'1')>0.05; };
  const rect = e => { const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),h:Math.round(r.height),w:Math.round(r.width)}; };

  const cap = document.getElementById('pp4Cap');
  const overlay = [...document.querySelectorAll('.modalOverlay')].find(vis);
  if(!overlay) return {ok:false, why:'no visible .modalOverlay — the pose did not land'};
  if(!cap)     return {ok:false, why:'#pp4Cap does not exist on this page'};

  const card = overlay.querySelector('.modalCard');
  const cs   = getComputedStyle(cap);
  const os   = getComputedStyle(overlay);

  /* THE SCRIM'S ALPHA, read rather than assumed. \`background\` shorthand carries the gradient, so
     the alphas are pulled out of the gradient's own colour stops — that is where they live. */
  const bg = os.backgroundImage + ' ' + os.backgroundColor;
  const alphas = [...bg.matchAll(/rgba?\\(\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*(?:,\\s*([\\d.]+))?\\s*\\)/g)]
    .map(m => m[1] === undefined ? 1 : parseFloat(m[1]));

  /* IS THE BAR EVEN PAINTING? A display:none bar is not a bug, it is the fix. Reported first so a
     green result can never be confused with a probe that failed to find its subject (rule 6). */
  const capVisible = vis(cap);
  const capRect = rect(cap);

  /* THE EXPOSED WIDTH. Only the band where the card and the bar actually overlap vertically counts
     — a card that stops 200px above the bar covers none of it, and calling that "exposed" would
     make every screen fail. Left of the card and right of the card are summed. */
  let exposedPx = 0, cardRect = null, bandPx = 0;
  if (card && vis(card)) {
    const c = card.getBoundingClientRect(), b = cap.getBoundingClientRect();
    cardRect = rect(card);
    bandPx = Math.round(Math.min(c.bottom,b.bottom) - Math.max(c.top,b.top));
    /* ⚠ THE FIRST VERSION SUMMED "left of the card" AND "right of the card" AND WAS WRONG WHENEVER
       THE TWO DO NOT OVERLAP HORIZONTALLY. On the 1440 desktop the bar is a SIDE column at
       x 886..1426 and the card sits at 203..683 — no horizontal overlap at all — so the two terms
       became 0 + 743, and it reported 743px of exposure on a 540px-wide bar. A number larger than
       the thing it measures is the tell. Exposure is the bar's own width minus however much of it
       the card actually covers, which cannot exceed the bar. */
    if (capVisible && bandPx > 0) {
      const inter = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
      exposedPx = Math.round(Math.max(0, b.width - inter));
    }
  }

  /* THE HALF-WORDS. A captain row that the card's edge runs THROUGH is what a player actually sees
     as broken text. Each is reported with its own text, clipped to what is left of it. */
  const cutRows = [];
  if (capVisible && card && vis(card)) {
    const c = card.getBoundingClientRect();
    /* ⚠ THE ROW CLASS IS \`.player-row\`, NOT \`.prow\` — \`prow\` is the ID PREFIX
       (\`src/ui/util.js:162\`: \`<div class="player-row" id="prow\${i}">\`). The first version of this
       probe queried \`.prow\`, matched zero elements, and every seat reported "never reached the
       stage". It failed LOUDLY only because the staged-check is also written on this selector and
       the run has a NOT MEASURED path; had it been used only here, the probe would have printed
       "0 captain rows cut" on a screen that was visibly broken. Rule 6, at selector scale. */
    for (const row of cap.querySelectorAll('.player-row')) {
      if (!vis(row)) continue;
      const r = row.getBoundingClientRect();
      const straddles = r.left < c.left && r.right > c.left;
      const vOverlap = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) > 0;
      if (straddles && vOverlap) cutRows.push({
        text: (row.textContent||'').trim().replace(/\\s+/g,' ').slice(0,50),
        visiblePx: Math.round(c.left - r.left),
        totalPx: Math.round(r.width),
      });
    }
  }

  return {ok:true,
    viewport: {w: innerWidth, h: innerHeight, dpr: devicePixelRatio},
    stage: document.body.classList.contains('pp4Stage'),
    side:  document.body.classList.contains('pp4Side'),
    bleed: document.body.classList.contains('pp4CapBleed'),
    overlayId: overlay.id, overlayZ: os.zIndex,
    capVisible, capZ: cs.zIndex, capDisplay: cs.display, capRect,
    cardRect, bandPx, exposedPx,
    scrimAlphas: alphas,
    scrimMaxAlpha: alphas.length ? Math.max(...alphas) : null,
    cutRows,
  };
})())`;

const url = serve(PORT);
launch(DBG, path.join(process.cwd(), ".tmp-chrome-t142"));
const C = await attach(DBG);
const results = {};

try {
  for (const seat of SEATS) {
    await C.send("Emulation.setDeviceMetricsOverride",
      { width: seat.W, height: seat.H, deviceScaleFactor: seat.dsf, mobile: seat.mobile });
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} load`);
    await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t142-'+Math.floor(Math.random()*1e9));true`);
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} reload`);
    await sleep(900);
    await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${seat.tag} home`);
    await C.ev(`document.getElementById('choiceSolo').click();true`); await sleep(700);
    await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${seat.tag} name`);
    await C.ev(`document.getElementById('btnNameConfirm').click();true`);

    /* wait until the stage is up AND the captains bar has rows in it — an empty bar cannot show
       through anything, so measuring one would be measuring nothing */
    let staged = false;
    for (let i = 0; i < 40; i++) {
      staged = await C.ev(`(()=>{const c=document.getElementById('pp4Cap');
        return !!(document.body.classList.contains('pp4Stage') && c && c.querySelectorAll('.player-row').length>1)})()`);
      if (staged) break;
      await C.ev(ADVANCE); await sleep(800);
    }
    if (!staged) {
      console.log(`  ${seat.tag}: never reached the stage with a populated CAPTAINS panel — NOT MEASURED`);
      results[seat.tag] = { ok: false, why: "never reached a populated stage" };
      continue;
    }
    await sleep(600);

    const opened = await C.ev(OPEN_MODAL);
    if (!/Modal/.test(opened)) {
      console.log(`  ${seat.tag}: could not open any modal — ${opened} — NOT MEASURED`);
      results[seat.tag] = { ok: false, why: `could not open a modal: ${opened}` };
      continue;
    }
    await sleep(700);

    const m = JSON.parse(await C.ev(MEASURE));
    m.posedVia = opened;
    results[seat.tag] = m;

    /* ⚠ THE PICTURE IS TAKEN WHILE THE MODAL IS STILL OPEN, AND THE ORDER HERE IS THE WHOLE POINT.
       The first version closed the modal first and then shot the page, so every "after" PNG was a
       photograph of a screen with no modal on it — a picture that cannot show whether the bar hides
       under one, filed under a name that says it does. The posed pair (rule 26) is the deliverable;
       the restore check below runs after the shutter, never before it. */
    const cap0 = await C.send("Page.captureScreenshot", { format: "png" });
    const png = path.join(OUT, `t142-captains-under-recipe-${seat.tag}-${TAG}.png`);
    fs.writeFileSync(png, Buffer.from(cap0.result.data, "base64"));
    m.shot = png;

    console.log(`\n=== ${seat.tag} ===  ${png}`);
    if (!m.ok) { console.log(`  NOT MEASURED: ${m.why}`); continue; }
    console.log(`  viewport ${m.viewport.w}x${m.viewport.h} @${m.viewport.dpr}x   body: stage=${m.stage} side=${m.side} bleed=${m.bleed}`);
    console.log(`  overlay #${m.overlayId} z=${m.overlayZ}   scrim alphas ${JSON.stringify(m.scrimAlphas)} (max ${m.scrimMaxAlpha})`);
    console.log(`  #pp4Cap visible=${m.capVisible} display=${m.capDisplay} z=${m.capZ} ${m.capRect.left}..${m.capRect.right} x ${m.capRect.top}..${m.capRect.bottom}`);
    console.log(`  card ${m.cardRect ? `${m.cardRect.left}..${m.cardRect.right} x ${m.cardRect.top}..${m.cardRect.bottom}` : 'none'}   vertical overlap with the bar: ${m.bandPx}px`);
    console.log(`  EXPOSED BAR WIDTH: ${m.exposedPx}px`);
    console.log(`  captain rows cut through by the card's edge: ${m.cutRows.length}`);
    for (const r of m.cutRows) console.log(`    ! only ${r.visiblePx}px of ${r.totalPx}px drawn — "${r.text}"`);

    /* ⛔ THE REGRESSION THAT WOULD BE WORSE THAN THE BUG. Hiding the bar under a modal is only a fix
       if it COMES BACK when the modal closes; a bar that stays hidden is a CAPTAINS panel a player
       has lost for the rest of the voyage, and it would pass every assertion above. Closed the way a
       player closes it — the ✕ the wiring adds (`src/orchestrator.js:2538`), else a click on the
       overlay's own backdrop (`:2541`). Measured AFTER, not assumed. */
    const closed = await C.ev(`(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
      return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden';};
      const ov=[...document.querySelectorAll('.modalOverlay')].find(vis); if(!ov) return 'nothing open';
      const x=ov.querySelector('.modalX'); if(x){ x.click(); return 'x'; }
      ov.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'backdrop';})()`);
    await sleep(500);
    m.restored = JSON.parse(await C.ev(`JSON.stringify((()=>{
      const c=document.getElementById('pp4Cap'); if(!c) return {ok:false};
      const s=getComputedStyle(c), r=c.getBoundingClientRect();
      return {ok:true, closedVia:${JSON.stringify(closed)},
        modalStillOpen: [...document.querySelectorAll('.modalOverlay')].some(o=>getComputedStyle(o).display!=='none'),
        bodyHasOpenClass: document.body.classList.contains('pp4ModalOpen'),
        visibility: s.visibility, display: s.display,
        rect:{top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right)}};})())`));
    const R = m.restored;
    console.log(`  after closing (via ${R.closedVia}): bar visibility=${R.visibility} · body.pp4ModalOpen=${R.bodyHasOpenClass} · a modal still open=${R.modalStillOpen}`);
    /* the bar's BOX must also be where it was — that is the whole reason this uses `visibility`
       rather than `display`, and an unchecked reason is a reason that rots */
    m.rectUnchangedAfterClose = R.ok && m.capRect &&
      R.rect.top === m.capRect.top && R.rect.bottom === m.capRect.bottom &&
      R.rect.left === m.capRect.left && R.rect.right === m.capRect.right;
    console.log(`  bar's box unchanged by the whole open/close cycle: ${m.rectUnchangedAfterClose}`);
  }

  console.log(`\n--- THE VERDICT ---`);
  let fails = 0, measured = 0;
  for (const seat of SEATS) {
    const m = results[seat.tag];
    if (!m || !m.ok) { console.log(`${seat.tag}: NOT MEASURED — ${m ? m.why : 'no result'}`); continue; }
    measured++;
    if (m.exposedPx > 0) { fails++;
      console.log(`${seat.tag}: FAIL — ${m.exposedPx}px of the CAPTAINS bar reads through #${m.overlayId}` +
        (m.cutRows.length ? `, ${m.cutRows.length} captain row(s) cut mid-word` : ``));
    } else {
      console.log(`${seat.tag}: PASS — nothing of the CAPTAINS bar is left uncovered` +
        (m.capVisible ? `` : ` (the bar is not painted at all while the modal is open)`));
    }
    /* A HIDDEN BAR THAT NEVER COMES BACK IS A WORSE BUG THAN THE ONE BEING FIXED, so it fails the
       run in its own right rather than being a line of log nobody reads. */
    const R = m.restored;
    if (R && R.ok && !R.modalStillOpen && R.visibility !== 'visible') { fails++;
      console.log(`${seat.tag}: FAIL — the CAPTAINS bar did NOT come back after the modal closed ` +
        `(visibility=${R.visibility}, body.pp4ModalOpen=${R.bodyHasOpenClass})`);
    }
    if (R && R.ok && m.rectUnchangedAfterClose === false) { fails++;
      console.log(`${seat.tag}: FAIL — the bar's box MOVED across the open/close cycle; ` +
        `the whole point of using visibility over display is that it does not`);
    }
  }
  /* ⚠ A run that measured nothing is not a run that passed. Said out loud, because "0 failures"
     and "0 seats reached the pose" print the same number. */
  if (!measured) console.log(`\n⚠ NOT ONE SEAT REACHED THE POSE. This run is evidence of nothing.`);

  const jsonPath = path.join(OUT, `t142-measurements-${TAG}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${jsonPath}`);
  process.exitCode = (measured && fails) ? 1 : 0;
} finally {
  killAll();
}
