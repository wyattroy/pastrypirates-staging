/* T-256 — DOES `#legalFooter` PAINT OVER `#pp4Cap` ON PHONE WIDTH?
 *
 *   node scripts/qa/gate_archive/t256_footer_clear_of_captains_check.mjs
 *   node scripts/qa/gate_archive/t256_footer_clear_of_captains_check.mjs --after   (names the pose "after")
 *
 * ⛔ RETIRED TO THE ARCHIVE 2026-09-18 (architecture item 54b), AND WHY — because the bug it looks
 * for can no longer happen, so it can no longer go red whatever the game does. A check that cannot
 * fail is not protection.
 *
 *   WHAT MOVED: Wyatt, 2026-09-06, having played a whole solo voyage on his phone — "It should only
 *   be visible on the pre-game screen, not any time during the game." `index.html` now carries
 *   `body.pp4Stage #legalFooter { display: none; }`, so the footer leaves the screen the moment the
 *   board mounts. There is nothing left on the stage to paint over the captains card.
 *
 *   MEASURED, not reasoned — this file, run 2026-09-18 with its staging wait corrected below:
 *     phone  390x664   #legalFooter visible=false display=none   overlap 0px   4 of 4 rows painted
 *     tablet 820x1180  #legalFooter visible=false display=none   overlap 0px   4 of 4 rows painted
 *   Both seats now report NOT APPLICABLE rather than the silent PASS the old code would have given.
 *
 *   AND IT CARRIED A COPIED FAULT UNTIL TODAY. Its staging wait was taken verbatim from
 *   `t142_captains_under_modal_check.mjs` (archived beside this file, commit 654da0a1) and shared
 *   its bug: `body.pp4Stage` plus more than one `.player-row` is satisfied all through the recipe
 *   draft while `capEmptyTick()` holds #pp4Cap at an inline `visibility:hidden` for Wyatt's
 *   empty-box rule. Because the wait is checked BEFORE the loop advances, this probe stopped there
 *   every run, never picked a recipe, and then measured a bar nobody had painted — whose visible
 *   row count is zero, which lands `lastRowCoveredPx` at 0 and READS AS PASS. The fault ran away
 *   from the alarm: a silently green gate, which is worse than a red one. Both are fixed here, so
 *   this stays a usable posing instrument rather than a landmine.
 *
 *   THE STRUCTURAL FACT IT WAS REACHING FOR IS NOW GATED, in the chain, in ~80ms:
 *   `scripts/qa/footer_leaves_the_stage_check.mjs` — one css rule takes the footer off the stage
 *   (by display, keyed on the board's own class), nothing in src/ writes the footer's style, and
 *   the captains card's reservation reads the footer's real measured height and books zero when it
 *   reads display:none. It stays out of `npm test` for the reason docs/DRIVING-THE-GAME.md §3d
 *   already gives: a probe that drives a browser through several game starts does not belong in
 *   the chain; gate the pure logic instead.
 *
 * WHY THIS IS A POSE AND NOT A RATE (rule 26). The claim is a geometric one — two fixed-position
 * bars sharing the bottom edge — settled by two painted rectangles, not by re-sailing a voyage.
 *
 * WHAT IT MEASURES — every number a geometric fact off the live page, nothing judged:
 *   footerRect        `#legalFooter`'s own rendered rect.
 *   capRect           `#pp4Cap`'s own rendered rect.
 *   overlapPx         vertical pixels where the two rects' Y-ranges intersect. Zero means the two
 *                     bars do not share any vertical band at all. THIS ALONE DOES NOT MEAN SAFE —
 *                     the footer paints on TOP of the panel's own last row, not merely "near" it.
 *   lastRowCoveredPx  of the LAST visible `.player-row` inside `#pp4Cap`, how many of its own
 *                     pixels (from the bottom) sit inside the footer's rect. THIS IS THE RED/GREEN
 *                     NUMBER — it is what a player actually sees covered.
 *
 * TWO SEATS: phone (390×844, the row's own evidence) and a tablet control (820×1180) where
 * `#pp4Cap` runs inside the side column (`.pp4Side`) rather than pinned to the viewport bottom, so
 * this bug should not reproduce there. If it does, the "phone-width only" scoping is wrong.
 *
 * NO GAME CODE IS TOUCHED BY THIS FILE. It is an instrument.
 */
import { serve, launch, attach, killAll, sleep } from "../../mp_rig.mjs";   /* one level deeper since the archive move */
import fs from "node:fs";
import path from "node:path";

const PORT = 8621, DBG = 9521;
const OUT = process.env.T256_OUT || path.join(process.cwd(), ".planning", "posed");
const TAG = process.argv.includes("--after") ? "after" : "before";
fs.mkdirSync(OUT, { recursive: true });

/* 390x664, not 390x844 — the project's own standard phone seat (t142_captains_under_modal_check.mjs's
   SEATS, the sea trial's own "phone" leg). A taller 844 window gives #pp4Cap's max-height (JS-computed,
   stage.js:2418, "the MAX of content height and leftover space") enough slack that the panel's rows
   never reach its own box bottom — which is why the first pass at this probe measured 0px overlap on
   a real, currently-broken build. Verified against the sea trial's own failing screenshots below. */
const SEATS = [
  { tag: "phone-390x664",    W: 390, H: 664,  dsf: 2, mobile: true,  expectPhoneShape: true },
  { tag: "tablet-820x1180",  W: 820, H: 1180, dsf: 2, mobile: true,  expectPhoneShape: false },
];

/* Reach the stage the way a player does: pick solo, take the default name, choose a recipe if
   offered. Reused verbatim from t142_captains_under_modal_check.mjs's own ADVANCE. */
const ADVANCE = `(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis).find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';} return null;})()`;

/* WHY THIS IS NEEDED, AND NOT ADVANCE ALONE: the trial's own failing screenshots
   (sea-trial-shots/solo-phone-011-settled.png) show the overlap only once captains have picked up
   cargo — each row grows a second line of ingredient-hold icons (#chips${i}, src/ui/util.js:166),
   which is what pushes the panel's last row down into the footer's band. A Day-1, no-cargo panel
   (what plain ADVANCE reaches) is shorter and does not reproduce it — measured directly below.
   Priority order (docs/DRIVING-THE-GAME.md §5b): flip coin, then a sail prompt toward any island,
   then any other action-panel button, preferring dock/fish, never "anchor" or "back". */
const TICK = `(()=>{
  const coin=document.getElementById('flipCoinWrap');
  if(coin&&coin.classList.contains('active')&&coin.onclick){coin.onclick();return 'flip';}
  const cells=[...document.querySelectorAll('.sailCell')];
  if(cells.length){cells[Math.floor(cells.length/2)].dispatchEvent(new MouseEvent('click',{bubbles:true}));return 'sail';}
  const btns=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>!/back|\\u2190|\\u2039/i.test(b.textContent));
  if(!btns.length)return 'nothing';
  const noAnchor=btns.filter(b=>!/anchor/i.test(b.textContent));
  const pool=noAnchor.length?noAnchor:btns;
  const pick=pool.find(b=>/dock/i.test(b.textContent))||pool.find(b=>/fish/i.test(b.textContent))||pool[0];
  pick.click();return 'act:'+pick.textContent.trim().slice(0,16);
})()`;

/* .chip is the real ingredient icon (src/ui/board.js). ⚠ SINCE 2026-09-13 AN EMPTY HOLD IS ALSO A .chip — the crate's
   own silhouette, .chip.holdEmpty (his Q6 ruling) — so counting any .chip would read "cargo aboard" on the very first
   render, before anyone owns a single crate. Cargo is a .chip that is not the empty crate. */
const HAS_CARGO = `(()=>{return !!document.querySelector('#players .chips .chip:not(.holdEmpty)');})()`;

const MEASURE = `JSON.stringify((()=>{
  const vis = e => { if(!e) return false; const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
    return r.width>2 && r.height>2 && s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity||'1')>0.05; };
  const rect = e => { const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),h:Math.round(r.height),w:Math.round(r.width)}; };

  const footer = document.getElementById('legalFooter');
  const cap = document.getElementById('pp4Cap');
  if (!footer) return {ok:false, why:'#legalFooter does not exist on this page'};
  if (!cap)    return {ok:false, why:'#pp4Cap does not exist on this page'};

  const footerVisible = vis(footer);
  const capVisible = vis(cap);
  const footerRect = rect(footer);
  const capRect = rect(cap);
  const side = document.body.classList.contains('pp4Side');

  let overlapPx = 0;
  if (footerVisible && capVisible) {
    overlapPx = Math.max(0, Math.min(footerRect.bottom, capRect.bottom) - Math.max(footerRect.top, capRect.top));
  }

  /* #pp4Cap itself clips its children (overflow:auto — CSS clips at the box's own border edge
     regardless of scroll position), so a row's OWN geometric rect can legitimately extend past
     cap's box with nothing actually painted there. The number that matters is what's VISIBLE:
     the row's rect intersected with cap's own rect, THEN checked against the footer. */
  /* THE ROW FILTER DECLARES ITSELF. vis() drops rows, so both numbers are reported on every
     run — a silent 0-of-0 and a silent 0-of-4 look identical here and the difference is the whole
     result. Which way the error runs: AWAY from the alarm. A dark bar yields zero visible rows,
     which lands lastRowCoveredPx at 0 and reads as PASS, so a zero row count is reported as NOT
     MEASURED by the verdict below, never as a pass.
     (No backticks in this comment: it lives inside a template literal.) */
  const rowsAll = [...cap.querySelectorAll('.player-row')];
  const rows = rowsAll.filter(vis);
  const capVisibility = getComputedStyle(cap).visibility;
  let lastRowCoveredPx = 0, lastRowText = null, lastRowRect = null, lastRowVisibleRect = null;
  if (footerVisible && rows.length) {
    const last = rows[rows.length - 1];
    const r = last.getBoundingClientRect();
    lastRowRect = rect(last);
    lastRowText = (last.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60);
    const visTop = Math.max(r.top, capRect.top);
    const visBottom = Math.min(r.bottom, capRect.bottom);
    lastRowVisibleRect = {top: Math.round(visTop), bottom: Math.round(visBottom)};
    if (visBottom > visTop) {
      lastRowCoveredPx = Math.round(Math.max(0, Math.min(visBottom, footerRect.bottom) - Math.max(visTop, footerRect.top)));
    }
  }

  return {ok:true,
    viewport: {w: innerWidth, h: innerHeight, dpr: devicePixelRatio},
    stage: document.body.classList.contains('pp4Stage'), side,
    footerVisible, footerRect, footerDisplay: getComputedStyle(footer).display,
    capVisible, capRect, capVisibility,
    overlapPx,
    rowCount: rows.length, rowCountAll: rowsAll.length, rowsDropped: rowsAll.length - rows.length,
    lastRowText, lastRowRect, lastRowVisibleRect, lastRowCoveredPx,
  };
})())`;

const url = serve(PORT);
launch(DBG, path.join(process.cwd(), ".tmp-chrome-t256"));
const C = await attach(DBG);
const results = {};

try {
  for (const seat of SEATS) {
    await C.send("Emulation.setDeviceMetricsOverride",
      { width: seat.W, height: seat.H, deviceScaleFactor: seat.dsf, mobile: seat.mobile });
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} load`);
    await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t256-'+Math.floor(Math.random()*1e9));true`);
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} reload`);
    await sleep(900);
    await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${seat.tag} home`);
    await C.ev(`document.getElementById('choiceSolo').click();true`); await sleep(700);
    await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${seat.tag} name`);
    await C.ev(`document.getElementById('btnNameConfirm').click();true`);

    /* wait until the stage is up AND the captains bar is actually PAINTED.
       ⛔ THE THIRD CLAUSE IS THE CORRECTION, 2026-09-18 (architecture item 54b). This wait was
       copied verbatim from t142_captains_under_modal_check.mjs and carried its fault with it: the
       first two clauses alone are satisfied all through the recipe draft, while `capEmptyTick()`
       (src/ui/stage.js) holds #pp4Cap at an INLINE `visibility:hidden` for Wyatt's empty-box rule
       (2026-09-09: "for this whole section of the pre-game where the captain's box is empty, hide
       it ... make it appear after the recipe has been selected"). The bar keeps its rows the whole
       time, so the wait passed on a screen where the bar was already dark — and because it is
       checked BEFORE the loop advances, the probe stopped here every run and never picked a recipe
       at all. It then measured a bar nobody had painted. t142's copy was corrected the same way in
       commit 654da0a1. */
    let staged = false;
    for (let i = 0; i < 40; i++) {
      staged = await C.ev(`(()=>{const c=document.getElementById('pp4Cap');
        return !!(document.body.classList.contains('pp4Stage') && c && c.querySelectorAll('.player-row').length>1
          && getComputedStyle(c).visibility==='visible')})()`);
      if (staged) break;
      await C.ev(ADVANCE); await sleep(800);
    }
    if (!staged) {
      console.log(`  ${seat.tag}: never reached the stage with a PAINTED CAPTAINS panel — NOT MEASURED`);
      results[seat.tag] = { ok: false, why: "never reached a stage with a painted captains bar" };
      continue;
    }
    await sleep(600);

    /* DRIVE UNTIL AT LEAST ONE CAPTAIN HAS CARGO, so the panel is the taller (two-line) shape the
       trial's own failing screenshots show — capped so a stuck driver reports NOT MEASURED rather
       than hanging. */
    let hasCargo = await C.ev(HAS_CARGO);
    let ticks = 0;
    while (!hasCargo && ticks < 90) {
      await C.ev(TICK);
      await sleep(650);
      hasCargo = await C.ev(HAS_CARGO);
      ticks++;
    }
    console.log(`  ${seat.tag}: drove ${ticks} tick(s) to reach cargo=${hasCargo}`);
    if (!hasCargo) {
      console.log(`  ${seat.tag}: never got any captain cargo after ${ticks} ticks — measuring the panel as-is (weaker evidence)`);
    }
    await sleep(1500);

    const m = JSON.parse(await C.ev(MEASURE));
    results[seat.tag] = m;

    const cap0 = await C.send("Page.captureScreenshot", { format: "png" });
    const png = path.join(OUT, `t256-footer-captains-${seat.tag}-${TAG}.png`);
    fs.writeFileSync(png, Buffer.from(cap0.result.data, "base64"));
    m.shot = png;

    console.log(`\n=== ${seat.tag} ===  ${png}`);
    if (!m.ok) { console.log(`  NOT MEASURED: ${m.why}`); continue; }
    console.log(`  viewport ${m.viewport.w}x${m.viewport.h} @${m.viewport.dpr}x   body: stage=${m.stage} side=${m.side}`);
    console.log(`  #legalFooter visible=${m.footerVisible} display=${m.footerDisplay} rect ${m.footerRect.left}..${m.footerRect.right} x ${m.footerRect.top}..${m.footerRect.bottom} (h=${m.footerRect.h})`);
    console.log(`  #pp4Cap      visible=${m.capVisible} visibility=${m.capVisibility} rect ${m.capRect.left}..${m.capRect.right} x ${m.capRect.top}..${m.capRect.bottom} (h=${m.capRect.h})`);
    console.log(`  captain rows: ${m.rowCountAll} in the DOM, ${m.rowCount} painted (${m.rowsDropped} dropped by the visibility filter)`);
    console.log(`  vertical overlap between the two bars: ${m.overlapPx}px`);
    console.log(`  last player-row ("${m.lastRowText}"): ${m.lastRowCoveredPx}px of its VISIBLE (cap-clipped) area covered by #legalFooter`);
  }

  console.log(`\n--- THE VERDICT ---`);
  let fails = 0, measured = 0;
  for (const seat of SEATS) {
    const m = results[seat.tag];
    if (!m || !m.ok) { console.log(`${seat.tag}: NOT MEASURED — ${m ? m.why : 'no result'}`); continue; }
    /* A BAR WITH NO PAINTED ROWS CANNOT ANSWER THIS QUESTION, AND MUST NOT ANSWER IT "PASS".
       lastRowCoveredPx is 0 when there is no last row, which is the same number a clear bar gives.
       Before this, a dark bar scored a silent green (2026-09-18, architecture item 54b). */
    if (!m.rowCount) {
      console.log(`${seat.tag}: NOT MEASURED — the CAPTAINS bar has ${m.rowCountAll} row(s) in the DOM and none painted (visibility=${m.capVisibility}); a bar nobody drew cannot be covered by anything`);
      continue;
    }
    /* AND NEITHER CAN A SCREEN THE FOOTER HAS LEFT. `body.pp4Stage #legalFooter{display:none}`
       (index.html) took the footer off every staged screen on Wyatt's 2026-09-06 ruling. That is
       not this probe passing — it is the bug being unreachable. */
    if (!m.footerVisible) {
      console.log(`${seat.tag}: NOT APPLICABLE — #legalFooter is display=${m.footerDisplay} on the stage, so it is not on the screen to cover anything`);
      continue;
    }
    measured++;
    if (m.lastRowCoveredPx > 0) {
      if (seat.expectPhoneShape) {
        fails++;
        console.log(`${seat.tag}: FAIL — #legalFooter covers ${m.lastRowCoveredPx}px of the last captain row`);
      } else {
        console.log(`${seat.tag}: FAIL (control seat, informational — same bug reproduces off phone width) — ${m.lastRowCoveredPx}px covered`);
      }
    } else {
      console.log(`${seat.tag}: PASS — the last captain row is fully clear of #legalFooter`);
    }
  }
  if (!measured) console.log(`\n⚠ NOT ONE SEAT REACHED THE POSE. This run is evidence of nothing.`);

  const jsonPath = path.join(OUT, `t256-measurements-${TAG}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${jsonPath}`);
  process.exitCode = (measured && fails) ? 1 : 0;
} finally {
  killAll();
}
