/* THE RECIPE PICKER, POSED, AT THE THREE SIZES HE ASKED FOR.
 *
 *   node scripts/qa/_recipe_stack_shots.mjs
 *
 * Wyatt, 2026-09-07 playtest item 26: "screenshot the recipe cards in all 3 screen sizes and
 * ensure they look consistent across all three, before showing them to me again. In all three,
 * they should hover over the captains box — in desktop currently they do not."
 *
 * POSED, NOT PLAYED (CLAUDE.md): the question is "is this drawn right?", so it is one board
 * reached once and then re-measured at three viewports — never three voyages whose boards differ.
 * A throwaway probe, prefixed `_` like the others here, and NOT in the gate chain.
 *
 * Ports are derived from process.pid so two of these can never fight over a debug port — the
 * flaky-gate lesson from 2026-09-07.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(REPO, ".planning", "posed", "recipe");
fs.mkdirSync(OUT, { recursive: true });

const PORT = 8600 + (process.pid % 120);
const DBG  = 9600 + (process.pid % 120);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-recipe-${process.pid}`));
const C = await attach(DBG);

const SIZES = [
  { name: "phone",   w: 390,  h: 844,  mobile: true  },
  { name: "tablet",  w: 768,  h: 1024, mobile: false },
  { name: "desktop", w: 1280, h: 900,  mobile: false },
];

const metrics = (s) => C.send("Emulation.setDeviceMetricsOverride",
  { width: s.w, height: s.h, deviceScaleFactor: 2, mobile: s.mobile });
const shot = async (name) => {
  const r = await C.send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); return true; }
  return false;
};
const waitFor = async (expr, ms = 20000, label = expr) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await C.ev(expr)) return true; } catch {} await sleep(200); }
  throw new Error("timed out waiting for: " + label);
};
const clickBtn = async (rx) => C.ev(`(()=>{
  const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>!/back|←|‹/i.test(b.textContent));
  const b=bs.find(x=>${rx}.test(x.textContent)); if(!b) return false; b.click(); return true; })()`);

/* WHAT THE PICTURE CANNOT TELL ME ON ITS OWN — the numbers behind his three complaints:
   how much of the back card is actually showing (item 6.1), whether the cards sit centred in
   their box (6.8), and whether the stack overlaps the captains box (item 26). */
const MEASURE = `JSON.stringify((()=>{
  const R=e=>{ if(!e) return null; const r=e.getBoundingClientRect();
    return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
            r:Math.round(r.right),b:Math.round(r.bottom)}; };
  const row=[...document.querySelectorAll('#actionPanel .apBtns')].find(x=>x.querySelector('.recipeList'));
  const cards=row?[...row.querySelectorAll('.apBtn')].filter(b=>b.querySelector('.recipeList')):[];
  const front=cards.find(c=>c.dataset.rcpos==='front')||cards[0];
  const back=cards.find(c=>c.dataset.rcpos==='back');
  const cap=document.getElementById('pp4Cap');
  const ap=document.getElementById('actionPanel');
  const fr=R(front), br=R(back), rr=R(row), cr=R(cap);
  let backVisibleFrac=null;
  if(fr&&br){ const covered=Math.max(0,Math.min(fr.r,br.r)-Math.max(fr.l,br.l));
              backVisibleFrac=+(1-covered/br.w).toFixed(3); }
  let centred=null;
  const swEl=document.querySelector('.pp4RcSwap'); const sw=R(swEl);
  if(fr&&rr){ centred={cardLeftGap:fr.l-rr.l, cardRightGap:rr.r-fr.r};
    if(sw) centred.clusterLeftGap=fr.l-rr.l, centred.clusterRightGap=rr.r-sw.r; }
  let overlapsCaptains=null;
  if(fr&&cr){ overlapsCaptains = fr.b > cr.t; }
  return {vw:innerWidth, cards:cards.length, pos:cards.map(c=>c.dataset.rcpos||'-'),
    backDisplay: back?getComputedStyle(back).display:'(none present)',
    front:fr, back:br, row:rr, captains:cr, panel:R(ap),
    panelOverflowY: ap? (ap.scrollHeight>ap.clientHeight) : null,
    backVisibleFrac, centred, overlapsCaptains,
    swap:R(document.querySelector('.pp4RcSwap')), peek:R(document.querySelector('.pp4RcPeek')),
    bake:R(document.querySelector('.pp4Bake'))};
})())`;

const say = (s) => console.log(s);

try {
  await metrics(SIZES[0]);
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
  await sleep(2200);
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.reload()`).catch(() => {});
  await sleep(2500);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000, "the name modal");
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`!!(window.__pp_app_state_debug&&__pp_app_state_debug().game&&__pp_app_state_debug().game.players.some(p=>p.strategy==='human'))`, 25000, "a solo game");

  // the Ahoy card now carries the fork's two circles — "Nah" is the taught path
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`, 20000, "the Ahoy card");
  await shot("00-ahoy-with-fork.png"); say("shot 00 — the Ahoy card (item 2: the fork now rides its bottom)");
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b){b.click();return true}return false})()`);
  await sleep(900);
  await clickBtn("/start/i"); await sleep(1400);

  await waitFor(`!!document.querySelector('#actionPanel .recipeList')`, 20000, "the recipe picker");
  await sleep(900);

  for (const s of SIZES) {
    await metrics(s);
    await sleep(1100);                       // let the reflow and the panel's own height maths land
    await shot(`10-picker-${s.name}.png`);
    const m = JSON.parse(await C.ev(MEASURE));
    say(`\n── ${s.name} (${s.w}x${s.h}) ─────────────────────────────`);
    say(`   cards=${m.cards} pos=${JSON.stringify(m.pos)} backDisplay=${m.backDisplay}`);
    say(`   front  ${JSON.stringify(m.front)}`);
    say(`   back   ${JSON.stringify(m.back)}`);
    say(`   row    ${JSON.stringify(m.row)}`);
    say(`   captains box ${JSON.stringify(m.captains)}`);
    say(`   back card visible fraction : ${m.backVisibleFrac}   (he wants ~0.20 — "80% overlapped")`);
    say(`   centred in its row?        : ${JSON.stringify(m.centred)}   (equal gaps = centred)`);
    say(`   overlaps the captains box? : ${m.overlapsCaptains}   (he wants TRUE at all three)`);
    say(`   panel  ${JSON.stringify(m.panel)}  scrolls=${m.panelOverflowY}`);
    say(`   swap circle  ${JSON.stringify(m.swap)}`);
    if(m.swap&&m.panel) say(`   circle inside the WHITE BOX? ${m.swap.r <= m.panel.r}  (box right ${m.panel.r}, circle right ${m.swap.r})`);
    say(`   peek strip   ${JSON.stringify(m.peek)}`);
    if(m.swap&&m.row) say(`   swap fits inside the row? ${m.swap.r <= m.row.r}  (row right ${m.row.r}, circle right ${m.swap.r})`);
    if(m.swap&&m.back) say(`   gap from back card edge  : ${m.swap.l - m.back.r}px  (he asked for 10)`);
  }

  // and the selected state, at phone size, for the "Bake this!" placement (item 6.6)
  await metrics(SIZES[0]); await sleep(900);
  await C.ev(`(()=>{const c=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]')||document.querySelector('#actionPanel .apBtn .recipeList')?.closest('.apBtn');if(c){c.click();return true}return false})()`);
  await sleep(700);
  await shot("20-bake-this-phone.png");
  const sel = JSON.parse(await C.ev(MEASURE));
  say(`\n── selected, phone ──────────────────────────`);
  say(`   front ${JSON.stringify(sel.front)}`);
  say(`   row   ${JSON.stringify(sel.row)}   panel ${JSON.stringify(sel.panel)} scrolls=${sel.panelOverflowY}`);
  say(`   "Bake this!" ${JSON.stringify(sel.bake)}   (item 6.6: over the MIDDLE of the card, and the card's height must not change)`);
  say(`\nshots -> ${OUT}`);
} catch (e) {
  console.log("PROBE FAILED:", e.message);
} finally {
  killAll();
}
