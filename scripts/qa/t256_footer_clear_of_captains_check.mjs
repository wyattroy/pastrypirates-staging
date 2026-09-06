/* T-256 — DOES `#legalFooter` PAINT OVER `#pp4Cap` ON PHONE WIDTH?
 *
 *   node scripts/qa/t256_footer_clear_of_captains_check.mjs
 *   node scripts/qa/t256_footer_clear_of_captains_check.mjs --after   (names the pose "after")
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
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
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

/* .chip is the real ingredient icon (src/ui/board.js:1731/1734/1745); an empty hold renders a
   plain opacity-.4 <span> with NO .chip class, so counting any child would false-positive on the
   very first render, before anyone owns a single crate. */
const HAS_CARGO = `(()=>{return !!document.querySelector('#players .chips .chip');})()`;

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
  const rows = [...cap.querySelectorAll('.player-row')].filter(vis);
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
    footerVisible, footerRect,
    capVisible, capRect,
    overlapPx,
    rowCount: rows.length, lastRowText, lastRowRect, lastRowVisibleRect, lastRowCoveredPx,
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

    /* wait until the stage is up AND the captains bar has more than one row in it */
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
    console.log(`  #legalFooter visible=${m.footerVisible} rect ${m.footerRect.left}..${m.footerRect.right} x ${m.footerRect.top}..${m.footerRect.bottom} (h=${m.footerRect.h})`);
    console.log(`  #pp4Cap      visible=${m.capVisible} rect ${m.capRect.left}..${m.capRect.right} x ${m.capRect.top}..${m.capRect.bottom} (h=${m.capRect.h})`);
    console.log(`  vertical overlap between the two bars: ${m.overlapPx}px`);
    console.log(`  last player-row ("${m.lastRowText}"): ${m.lastRowCoveredPx}px of its VISIBLE (cap-clipped) area covered by #legalFooter`);
  }

  console.log(`\n--- THE VERDICT ---`);
  let fails = 0, measured = 0;
  for (const seat of SEATS) {
    const m = results[seat.tag];
    if (!m || !m.ok) { console.log(`${seat.tag}: NOT MEASURED — ${m ? m.why : 'no result'}`); continue; }
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
