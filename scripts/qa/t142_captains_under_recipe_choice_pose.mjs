/* T-142 (third bug) — DOES THE CAPTAINS PANEL READ THROUGH THE RECIPE-CHOICE PROMPT?
 *
 *   node scripts/qa/t142_captains_under_recipe_choice_pose.mjs
 *
 * WHY THIS IS A POSE AND NOT A RATE (rule 26). The claim is a single fixed-position box
 * (`#pp4Cap`) either does or does not read through a single card's rect at the very start of a
 * solo voyage, on a tablet. A screenshot plus the two rects settle it; a driven-voyage rate
 * cannot.
 *
 * WHY THIS IS NOT `t142_captains_under_modal_check.mjs`: that instrument opens a `.modalOverlay`
 * (How-to-play, the log, the recipe modal opened from the captains row) — a different code path
 * from the recipe-CHOICE prompt this probe poses, which is `recipeDraftNet()`
 * (`src/orchestrator.js:939-957`) rendered through `localAsk`/`panel()`
 * (`src/ui/flow.js`/`src/ui/stage.js`). It is not a `.modalOverlay` at all, so the shipped
 * `pp4ModalOpen` fix (`src/orchestrator.js:2564-2572`) cannot see it. See
 * `.planning/wyclau/PREDICTION-20260904T1210Z-T-142.md` for the reasoning measured here.
 *
 * WHAT IT MEASURES — every number a geometric fact off the live page, nothing judged:
 *   exposedPx   the width of #pp4Cap left uncovered by the recipe-choice card, inside the band
 *               where the two actually overlap vertically. Zero means the card fully covers the
 *               part of the bar it overlaps; a player never sees the exposure.
 *   cutRows     which captain rows are split by the card's edge, with their own text.
 *   promptClass which of radial/centered/pp4Center/pp4Recipes ended up on #pp4Prompt — the
 *               mechanism, read rather than assumed.
 *
 * NO GAME CODE IS TOUCHED BY THIS FILE. It is an instrument.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8621, DBG = 9521;
const OUT = process.env.T142_OUT || path.join(process.cwd(), ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

const SEATS = [
  { tag: "tablet-820x1180", W: 820, H: 1180, dsf: 2, mobile: true },
];

const ADVANCE = `(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const go=[...document.querySelectorAll('button')].filter(vis).find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';} return null;})()`;

const MEASURE = `JSON.stringify((()=>{
  const vis = e => { if(!e) return false; const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
    return r.width>2 && r.height>2 && s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity||'1')>0.05; };
  const rect = e => { const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),h:Math.round(r.height),w:Math.round(r.width)}; };

  const cap = document.getElementById('pp4Cap');
  const prompt = document.getElementById('pp4Prompt');
  const ap = document.getElementById('actionPanel');
  const recipeCard = ap ? ap.querySelector('.recipeCard') : null;
  if(!prompt) return {ok:false, why:'#pp4Prompt does not exist'};
  if(!cap)    return {ok:false, why:'#pp4Cap does not exist'};
  if(!recipeCard) return {ok:false, why:'no .recipeCard inside #actionPanel — did not reach the recipe-choice prompt'};

  const promptVisible = vis(prompt);
  const promptClass = prompt.className;
  const capVisible = vis(cap);
  const capRect = rect(cap);

  /* the CARD is what a player sees drawn — #actionPanel itself, not the whole #pp4Prompt box,
     which can be full-viewport even when its content is a small centred card */
  const card = ap;
  let exposedPx = 0, cardRect = null, bandPx = 0;
  if (card && vis(card)) {
    const c = card.getBoundingClientRect(), b = cap.getBoundingClientRect();
    cardRect = rect(card);
    bandPx = Math.round(Math.min(c.bottom,b.bottom) - Math.max(c.top,b.top));
    if (capVisible && bandPx > 0) {
      const inter = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
      exposedPx = Math.round(Math.max(0, b.width - inter));
    }
  }

  const cutRows = [];
  if (capVisible && card && vis(card)) {
    const c = card.getBoundingClientRect();
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
    promptVisible, promptClass,
    capVisible, capRect,
    cardRect, bandPx, exposedPx,
    cutRows,
  };
})())`;

const url = serve(PORT);
launch(DBG, path.join(process.cwd(), ".tmp-chrome-t142rc"));
const C = await attach(DBG);
const results = {};

try {
  for (const seat of SEATS) {
    await C.send("Emulation.setDeviceMetricsOverride",
      { width: seat.W, height: seat.H, deviceScaleFactor: seat.dsf, mobile: seat.mobile });
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} load`);
    await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t142rc-'+Math.floor(Math.random()*1e9));true`);
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} reload`);
    await sleep(900);
    await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${seat.tag} home`);
    await C.ev(`document.getElementById('choiceSolo').click();true`); await sleep(700);
    await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${seat.tag} name`);
    await C.ev(`document.getElementById('btnNameConfirm').click();true`);

    /* advance through intro barriers until a .recipeCard appears in #actionPanel */
    let staged = false;
    for (let i = 0; i < 40; i++) {
      staged = await C.ev(`(()=>{const ap=document.getElementById('actionPanel');
        return !!(ap && ap.querySelector('.recipeCard'));})()`);
      if (staged) break;
      await C.ev(ADVANCE); await sleep(800);
    }
    if (!staged) {
      console.log(`  ${seat.tag}: never reached the recipe-choice prompt — NOT MEASURED`);
      results[seat.tag] = { ok: false, why: "never reached a .recipeCard prompt" };
      continue;
    }
    await sleep(600);

    const m = JSON.parse(await C.ev(MEASURE));
    results[seat.tag] = m;

    const cap0 = await C.send("Page.captureScreenshot", { format: "png" });
    const png = path.join(OUT, `t142-captains-under-recipe-choice-${seat.tag}.png`);
    fs.writeFileSync(png, Buffer.from(cap0.result.data, "base64"));
    m.shot = png;

    console.log(`\n=== ${seat.tag} ===  ${png}`);
    if (!m.ok) { console.log(`  NOT MEASURED: ${m.why}`); continue; }
    console.log(`  viewport ${m.viewport.w}x${m.viewport.h} @${m.viewport.dpr}x`);
    console.log(`  #pp4Prompt visible=${m.promptVisible} class="${m.promptClass}"`);
    console.log(`  #pp4Cap visible=${m.capVisible}  ${m.capRect.left}..${m.capRect.right} x ${m.capRect.top}..${m.capRect.bottom}`);
    console.log(`  card ${m.cardRect ? `${m.cardRect.left}..${m.cardRect.right} x ${m.cardRect.top}..${m.cardRect.bottom}` : 'none'}   vertical overlap with the bar: ${m.bandPx}px`);
    console.log(`  EXPOSED BAR WIDTH: ${m.exposedPx}px`);
    console.log(`  captain rows cut through by the card's edge: ${m.cutRows.length}`);
    for (const r of m.cutRows) console.log(`    ! only ${r.visiblePx}px of ${r.totalPx}px drawn — "${r.text}"`);
  }

  console.log(`\n--- THE VERDICT ---`);
  let fails = 0, measured = 0;
  for (const seat of SEATS) {
    const m = results[seat.tag];
    if (!m || !m.ok) { console.log(`${seat.tag}: NOT MEASURED — ${m ? m.why : 'no result'}`); continue; }
    measured++;
    if (m.exposedPx > 0) { fails++;
      console.log(`${seat.tag}: the captains bar reads through the recipe-choice card — ${m.exposedPx}px exposed` +
        (m.cutRows.length ? `, ${m.cutRows.length} captain row(s) cut mid-word` : ``));
    } else {
      console.log(`${seat.tag}: the bar does not read through this card (0px exposed in the overlap band)`);
    }
  }
  if (!measured) console.log(`\n⚠ NOT ONE SEAT REACHED THE POSE. This run is evidence of nothing.`);

  const jsonPath = path.join(OUT, `t142-recipe-choice-measurements.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${jsonPath}`);
  process.exitCode = 0; // instrument only — this script never fails a build, it reports
} finally {
  killAll();
}
