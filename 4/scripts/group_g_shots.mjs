#!/usr/bin/env node
/* group_g_shots.mjs — Group G's instrument: pose the six states the vision judge failed on build
 * 2026-08-22b, read the rendered rects, and keep the pictures.
 *
 *   node 4/scripts/group_g_shots.mjs --out=DIR --port=N --dbg=N [--size=WxH] [--mobile]
 *                                    [--scenes=bubble,battle,ceremony,give,recipes] [--tag=NAME]
 *                                    [--root=DIR]
 *
 * Same three rules as group_f_shots.mjs, and for the same reasons:
 *   1. A LIVE MUTATION CANNOT SHIP; A SOURCE EDIT CAN. Everything is mutated on the live objects
 *      over CDP; nothing under 4/src is edited to make a state happen (DRIVING-THE-GAME §5e).
 *   2. RED-PROOF EVERY INJECTION — force the known-negative first and print it beside the positive.
 *   3. SOLO ONLY. Injection desyncs a real room.
 *
 * AND ONE OF ITS OWN, because fault 5 is a PAINT-ORDER question and no rect can answer one:
 *   4. A STACKING CLAIM IS SETTLED IN PIXELS, NOT IN z-index. `bubbleStack` reads the computed
 *      opacity and the whole stacking-context chain, and then PROVES the paint order by sampling
 *      the screenshot at a point inside both the bubble and a sail square. A z-index that "should
 *      win" is arithmetic of mine; the pixel is what the renderer produced (BOARD-RENDERING §7).
 *
 * Hygiene: headless, --mute-audio, its own ports, bounded loops, kills what it starts.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPO, gameURL } from "./lib/chrome.mjs";
import { openChrome, sleep } from "./lib/cdp.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = k => process.argv.includes(`--${k}`);
const OUT = path.resolve(arg("out", "/tmp/group-g"));
const PORT = +arg("port", 8471), DBG = +arg("dbg", 9471);
const [W, H] = arg("size", "1900x1000").split("x").map(Number);
const MOBILE = has("mobile");
const SCENES = arg("scenes", "bubble,battle,ceremony,give,recipes").split(",");
const TAG = arg("tag", `${W}x${H}`);
const ROOT = path.resolve(arg("root", REPO));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(" "); console.log(s); fs.appendFileSync(path.join(OUT, "log.txt"), s + "\n"); };

const c = await openChrome({ W, H, dbgPort: DBG, httpPort: PORT, serveRoot: ROOT,
  profileDir: path.join(OUT, `prof-${TAG}`), mobile: MOBILE });
const out = { tag: TAG, W, H, mobile: MOBILE, scenes: {} };
async function finish(code) {
  fs.writeFileSync(path.join(OUT, `result-${TAG}.json`), JSON.stringify(out, null, 2));
  try { c.close(); } catch {}
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`, { stdio: "ignore" }); } catch {}
  try { execSync(`pkill -f "http.server ${PORT}"`, { stdio: "ignore" }); } catch {}
  process.exit(code);
}
const die = async (msg) => { log("ABORT: " + msg); await finish(1); };
process.on("SIGINT", () => finish(1));

const shot = n => c.shot(path.join(OUT, `${TAG}-${n}.png`));
const ev = e => c.ev(e);

const armGate = () => ev(`window.__gate = (el) => {
  if (!el) return {ok:false, why:'no element'};
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return {ok:false, why:'zero size'};
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return {ok:false, why:'outside viewport'};
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return {ok:false, why:'occluded by '+(hit?(hit.id||hit.className||hit.tagName):'nothing')};
  return {ok:true, x:cx, y:cy};
};`);

async function clickSel(sel, filter = "() => true") {
  const probe = `(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${filter});
     for (const el of els) { const g = __gate(el); if (g.ok) return {ok:true,x:g.x,y:g.y,txt:(el.textContent||'').trim().slice(0,24)}; }
     return {ok:false, n:els.length, why: els.length ? __gate(els[0]).why : 'none'}; })()`;
  let g = await ev(probe);
  if (g && g.ok) { await c.clickXY(g.x, g.y); return g.txt || "?"; }
  if (g && g.n && /outside viewport/.test(g.why || "")) {
    await ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${filter});
       if (els[0]) els[0].scrollIntoView({block:'center'}); return 1; })()`);
    await sleep(400);
    g = await ev(probe);
    if (g && g.ok) { await c.clickXY(g.x, g.y); return g.txt || "?"; }
  }
  return null;
}

/* ---- boot a solo voyage (DRIVING-THE-GAME §2, §3 — both of that section's traps) ---- */
log(`\n=== ${TAG} ${MOBILE ? "(touch)" : ""} — booting solo from ${ROOT} ===`);
await c.nav(gameURL(PORT)); await sleep(2000);
await ev("localStorage.clear(); 1");
await c.nav(gameURL(PORT)); await sleep(2500);
await armGate();
if (!await clickSel("#choiceSolo")) await die("solo card not clickable");
await sleep(900);
const ni = await ev("(()=>{const el=document.getElementById('nameModalInput'); if(!el) return null; const g=__gate(el); return g.ok?g:null;})()");
if (ni) {
  // triple-click first: the field arrives PRE-FILLED and a bare type gives "Davy SconesDavy Scones"
  await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: ni.x, y: ni.y, button: "left", clickCount: 3 });
  await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ni.x, y: ni.y, button: "left", clickCount: 3 });
  await c.type("Davy Scones");
}
if (!await clickSel("#btnNameConfirm")) await die("name confirm not clickable");
{
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { await sleep(500);
    ok = await ev(`(async()=>{try{if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;}
      const g=window.appState.game; return !!(g&&g.players.some(p=>p.strategy==='human')&&document.getElementById('pp4Ribbon'));}catch(e){return false}})()`);
  }
  if (!ok) await die("no human solo game inside 30s");
}
await ev(`(async()=>{ window.__G = {
  st:(await import('/src/state/index.js')).appState,
  flow:await import('/src/ui/flow.js'),
  stage:await import('/src/ui/stage.js'),
  board:await import('/src/ui/board.js'),
  shared:await import('/src/shared/index.js') }; return 1; })()`);

/* ---- SCENE: the recipe sheet, caught on the way past (fault 4) ---- */
if (SCENES.includes("recipes")) {
  const r = out.scenes.recipes = {};
  for (let i = 0; i < 40; i++) {
    if (await ev("!!document.querySelector('#pp4Prompt .recipeList')")) break;
    await sleep(500);
    await clickSel("#pp4Prompt .apBtn", "b => !/back|←|‹/i.test(b.textContent)");
  }
  // visible, not merely present — pendingReveal holds the whole prompt until the camera settles
  for (let i = 0; i < 40; i++) {
    if (await ev("(()=>{const c=document.querySelector('#pp4Prompt .apBtn .recipeList'); return !!(c&&c.getBoundingClientRect().width>10);})()")) break;
    await sleep(400);
  }
  await sleep(1000);
  /* THE SETTLED STATE THE JUDGE SAW, not the resting one. solo-desktop-005 has the "Bake this!"
     overlay up — a recipe has been tapped ONCE (a card takes two taps, §3c) — and the plan is
     explicit that this rules out an animation artifact. Tapping first is therefore part of posing
     the fault, not a step towards dismissing it. RED-PROOF: the overlay must be absent before. */
  r.bakeBefore = await ev("!!document.querySelector('#pp4Prompt .apBtn.pp4Focus')");
  await armGate();
  await clickSel("#pp4Prompt .apBtn", "b => !!b.querySelector('.recipeList')");
  await sleep(1400);
  r.bakeAfter = await ev("!!document.querySelector('#pp4Prompt .apBtn.pp4Focus')");
  log(`recipes RED-PROOF: "Bake this!" focus before=${r.bakeBefore} after=${r.bakeAfter}`);
  r.measured = await ev(`(() => {
    const R = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {l:+b.left.toFixed(1),t:+b.top.toFixed(1),r:+b.right.toFixed(1),b:+b.bottom.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1)}; };
    const hint = document.querySelector('.pp4RecipeHint');
    const cards = [...document.querySelectorAll('#pp4Prompt .apBtn')].filter(c=>c.querySelector('.recipeList'));
    const grid = document.getElementById('apGrid') || document.querySelector('#pp4Prompt .apBtns');
    const msg = document.querySelector('#pp4Prompt .apMsg');
    const hr = R(hint), cardRs = cards.map(R);
    // THE COMPLAINT, as a number: how far does the top of a card reach ABOVE the bottom of the hint?
    const sliced = cardRs.map(cr => hr && cr ? +(hr.b - cr.t).toFixed(1) : null);
    return { ih: innerHeight, iw: innerWidth,
      hint: hr, hintText: hint ? hint.textContent.trim() : null,
      hintCS: hint ? (cs => ({pos:cs.position, mb:cs.marginBottom, pad:cs.padding, h:cs.height, lh:cs.lineHeight, ov:cs.overflow}))(getComputedStyle(hint)) : null,
      hintParent: hint ? (hint.parentNode.id || hint.parentNode.className) : null,
      msg: R(msg), cards: cardRs,
      cardsOverHintBy: sliced,
      grid: R(grid),
      gridCS: grid ? (cs => ({pos:cs.position, rows:cs.gridTemplateRows, h:cs.height, mt:cs.marginTop, inline:grid.getAttribute('style')||''}))(getComputedStyle(grid)) : null,
      gridParent: grid ? (grid.parentNode.id || grid.parentNode.className) : null,
      // the panel's own children in order, with their rects — a block-flow overlap has to show up here
      panelKids: [...(document.getElementById('actionPanel')||{children:[]}).children]
        .map(e => ({ cls:(e.id||e.className||e.tagName), r:R(e), pos:getComputedStyle(e).position })) };
  })()`);
  /* THE PULSE IS THE FAULT, so it is sampled rather than photographed once. `pp4FocusPulse` runs
     `box-shadow: 0 0 0 0` -> `0 0 0 7px` on a 1s infinite cycle, and an outline and a box-shadow
     both paint OUTSIDE the layout box — so nothing in the block flow reserves room for them, and
     the card's ring reaches up over the hint line for half of every second. A single screenshot
     catches a trough or a peak at random, which is exactly why my first run read this as "2.6px,
     text clear" while the gate's own screenshot shows the words sliced. */
  r.pulse = [];
  for (let i = 0; i < 16; i++) {
    r.pulse.push(await ev(`(() => {
      const card = document.querySelector('#pp4Prompt .apBtn.pp4Focus'); if (!card) return null;
      const hint = document.querySelector('.pp4RecipeHint'); if (!hint) return null;
      const cs = getComputedStyle(card);
      // the TEXT's own box, not the padded element's — a Range gives the line the renderer drew
      const rg = document.createRange(); rg.selectNodeContents(hint);
      const tb = rg.getBoundingClientRect();
      const spread = (m => m ? parseFloat(m[1]) : 0)(/0px 0px 0px ([\d.]+)px/.exec(cs.boxShadow || ''));
      const ow = parseFloat(cs.outlineWidth) || 0;
      const cardTop = card.getBoundingClientRect().top;
      const reach = cardTop - Math.max(spread, ow);      // the highest pixel the ring paints
      /* AND THE CARD'S OWN TWO BOXES. The painted rect came back 456.7px wide inside an 858px grid
         — two of those cannot sit side by side, so something is scaling them and the rect is the
         TRANSFORMED box (BOARD-RENDERING §7). offsetHeight is the layout box; the transform says
         by how much it is being grown, and the difference is how far the card's top edge climbs
         over the hint line. Which animation is doing it is the thing to find, not to assume. */
      return { spread:+spread.toFixed(2), outline:ow, cardTop:+cardTop.toFixed(1),
               ringTop:+reach.toFixed(1), textBottom:+tb.bottom.toFixed(1),
               overText:+(tb.bottom - reach).toFixed(1),
               cardLayoutH: card.offsetHeight, cardLayoutW: card.offsetWidth,
               cardPaintedH:+card.getBoundingClientRect().height.toFixed(1),
               tf: cs.transform, anim: cs.animationName, cardCls: card.className,
               // …and the card's own LAYOUT top, which is what a block-flow fault would show
               layoutTop:+(cardTop + (card.getBoundingClientRect().height - card.offsetHeight)/2).toFixed(1) }; })()`));
    await sleep(70);
  }
  r.shot = await shot("recipes");
  const worst = r.pulse.filter(Boolean).reduce((a, b) => (!a || b.overText > a.overText) ? b : a, null);
  r.worstPulse = worst;
  log(`recipes FAULT 4 — ring spread over ~1.1s: ${r.pulse.filter(Boolean).map(p => p.spread).join(" ")}`);
  log(`recipes FAULT 4 — card painted height: ${r.pulse.filter(Boolean).map(p => p.cardPaintedH).join(" ")} (layout ${worst && worst.cardLayoutH})`);
  log(`recipes FAULT 4 — card transform:      ${r.pulse.filter(Boolean).map(p => (p.tf||'').replace(/matrix\(([\d.]+).*/, '$1')).join(" ")}`);
  log(`recipes FAULT 4 — animation-name=${worst && worst.anim} class="${worst && worst.cardCls}"`);
  log(`recipes FAULT 4 — card LAYOUT top ~${worst && worst.layoutTop} vs painted top ${worst && worst.cardTop}; hint text ends ${worst && worst.textBottom}`);
  log(`recipes FAULT 4 — WORST: ring paints up to y${worst && worst.ringTop}, hint text ends at y${worst && worst.textBottom} => the ring covers the bottom ${worst && worst.overText}px of the line`);
  const m = r.measured;
  log(`recipes: hint=${JSON.stringify(m.hint)} "${m.hintText}"`);
  log(`recipes: hint css=${JSON.stringify(m.hintCS)} parent=${m.hintParent}`);
  log(`recipes FAULT 4 — cards reach above the hint's bottom by ${JSON.stringify(m.cardsOverHintBy)}px (>0 = SLICED)`);
  log(`recipes: grid=${JSON.stringify(m.grid)} css=${JSON.stringify(m.gridCS)} parent=${m.gridParent}`);
  log(`recipes: panel kids=${JSON.stringify(m.panelKids)}`);
}

// clear the intro barriers so the board is the thing on screen (§3c: a recipe card takes TWO taps)
for (let i = 0; i < 26; i++) {
  const n = await ev("[...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b=>b.getBoundingClientRect().width>4).length");
  const staged = await ev("!!document.getElementById('actionPanel').dataset.pp4Stage || !!document.querySelector('#pp4Prompt .recipeList')");
  if (!staged && n === 0) break;
  if (!await clickSel("#pp4Prompt .recipeCard, #pp4Prompt .bkoCard")) {
    if (!await clickSel("#pp4Prompt .apBtn", "b => !/back|←|‹/i.test(b.textContent)")) await sleep(500);
  }
  await sleep(650);
}
log("booted.");

/* ---- shared measurement helpers, all reading the RENDERER's rects ---- */
const RECTS = `(() => {
  const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return {l:+r.left.toFixed(1),t:+r.top.toFixed(1),r:+r.right.toFixed(1),b:+r.bottom.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}; };
  const vis = el => { const cs = getComputedStyle(el); return cs.visibility!=='hidden' && cs.display!=='none' && parseFloat(cs.opacity) > .05; };
  /* TWO WIDTHS, DELIBERATELY, and the difference between them is the whole of fault 6.
     offsetWidth is the LAYOUT box the placement reads (D = menu[0].offsetWidth). getBoundingClientRect
     returns the PAINTED box, which on these petals includes D-32's pulse transform — so a circle at
     rest and the same circle mid-pulse measure differently, and any gap computed from the painted box
     shrinks by that difference. BOARD-RENDERING §7's own warning: a size ratio is not a size, and
     getBoundingClientRect on a transformed element returns its transformed bounding box. */
  const petals = [...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b=>vis(b)&&b.getBoundingClientRect().width>4)
    .map(b => ({ r:R(b), text:(b.textContent||'').trim().slice(0,24),
                 ow:b.offsetWidth, tf:getComputedStyle(b).transform,
                 imgs:b.querySelectorAll('img').length, html:(b.innerHTML||'').slice(0,90) }));
  const box = document.getElementById('pp4Prompt');
  return { iw:innerWidth, ih:innerHeight, side:document.body.classList.contains('pp4Side'),
    bodyCls: document.body.className,
    mode: box ? (box.classList.contains('pp4Center')?'pp4Center':box.classList.contains('radial')?'radial'
        :box.classList.contains('pp4Recipes')?'pp4Recipes':box.classList.contains('centered')?'card-centered':'card') : 'none',
    petals,
    pill: R(document.querySelector('#pp4Prompt .apMsg')),
    sub: R(document.querySelector('#pp4Prompt .apSub')),
    cap: R(document.getElementById('pp4Cap')),
    capPanel: R(document.getElementById('captainsPanel')),
    ribbon: R(document.getElementById('pp4Ribbon')),
    bub: R(document.querySelector('.pp4Bub')),
    cerTitle: R(document.querySelector('#pp4Veil .pp4CerTitle')),
    cerSlot: R(document.getElementById('pp4CerSlot')),
    cerStakes: R(document.querySelector('#pp4Veil .pp4CerStakes')),
    cerSub: R(document.querySelector('#pp4Veil .pp4CerSub')),
    veil: R(document.getElementById('pp4Veil')),
    sails: [...document.querySelectorAll('.sailCell')].map(R) };
})()`;
const ov = (a, b) => !!(a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0);
const olap = (a, b) => (a && b) ? +Math.min(Math.min(a.r, b.r) - Math.max(a.l, b.l), Math.min(a.b, b.b) - Math.max(a.t, b.t)).toFixed(2) : null;
/* TWO GAPS, for the same reason there are two widths above.
   `minGap` is the PAINTED gap — what a screenshot (and therefore the vision judge) sees, pulse and
   all. `minGapLayout` is the gap between the LAYOUT boxes, which is what the placement actually
   spaced and what a player's finger has to hit. `centreMin` is the spacing itself, which should be
   D + GAP and is the number the placement rule is really about. Reporting only the first is how a
   correct 17px rule reads as "about 10px apart". */
function fanStats(petals) {
  let minGap = Infinity, minGapL = Infinity, centreMin = Infinity; const piles = [];
  for (let i = 0; i < petals.length; i++) for (let j = i + 1; j < petals.length; j++) {
    const a = petals[i].r, b = petals[j].r;
    const dist = Math.hypot((a.l + a.w / 2) - (b.l + b.w / 2), (a.t + a.h / 2) - (b.t + b.h / 2));
    const gap = dist - (a.w + b.w) / 2;
    const gapL = dist - ((petals[i].ow || a.w) + (petals[j].ow || b.w)) / 2;
    if (gap < minGap) minGap = gap;
    if (gapL < minGapL) minGapL = gapL;
    if (dist < centreMin) centreMin = dist;
    if (ov(a, b)) piles.push(`${petals[i].text}/${petals[j].text} by ${olap(a, b)}px`);
  }
  return { n: petals.length, d: petals.length ? petals[0].r.w : null,
           dLayout: petals.length ? petals[0].ow : null,
           minGap: petals.length > 1 ? +minGap.toFixed(2) : null,
           minGapLayout: petals.length > 1 ? +minGapL.toFixed(2) : null,
           centreMin: petals.length > 1 ? +centreMin.toFixed(2) : null, piles };
}
const settle = (ms = 2800) => sleep(ms);

/* ================= SCENE: the narration bubble and the sail squares (FAULT 5) =================
   THE QUESTION THE PLAN ASKS IS A PAINT-ORDER QUESTION, so it is answered in pixels. Three
   readings, in this order, because each one can invalidate the next:
     (a) the computed OPACITY of the bubble — a box at 18% needs no stacking explanation at all;
     (b) the whole stacking-context chain above the bubble and above a sail square — every property
         that CREATES a context, not just z-index, since a context is what the plan suspects;
     (c) the PIXEL, sampled from the screenshot inside the bubble ∩ a sail square and compared
         against the bubble's own background colour. That is the renderer's answer.
   RED-PROOF: the bubble is first raised with NO sail squares on the board (it must overlap zero),
   then the squares are drawn under it. A probe that reports "overlapping" in both states is not
   measuring overlap. */
/* THE SAIL WINDOW IS THE ENGINE'S OWN — g.reachableFrom(p) is the twin of the UI's reachable()
   helper and is what a real sail prompt highlights, so the squares this draws are the squares a
   captain would actually be looking at. Drawn with flow.sailHighlightRect, the game's own renderer
   (one function, host and guest alike), at the game's own cellPx. No geometry of this file's. */
async function poseBubbleOverSails(cell, msg) {
  return ev(`(async(S)=>{ const {st,flow,board} = window.__G; S=JSON.parse(S);
    document.querySelectorAll('.sailCell').forEach(e=>e.remove());
    const g = st.game, seat = st.mySeat ?? 0, p = g.players[seat];
    p.pos = S.cell.slice();
    board.paintShipAt(seat, p.pos);
    await new Promise(r=>setTimeout(r,700));
    const cells = g.reachableFrom(p) || [];
    const cellPx = 640 / g.cfg.grid;
    const svg = document.getElementById('board');
    for (const c of cells) flow.sailHighlightRect(c, cellPx, svg);
    window.__pp4.subject = seat;
    window.__pp4.narr(S.msg);
    return {seat, pos:p.pos, reach:cells.length, sails:document.querySelectorAll('.sailCell').length};
  })(${JSON.stringify(JSON.stringify({ cell, msg }))})`);
}
// how many sail squares the bubble is standing on, and by how much — D-38's own number
const BUB_VS_SAILS = `(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {l:+r.left.toFixed(1),t:+r.top.toFixed(1),r:+r.right.toFixed(1),b:+r.bottom.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}; };
  const bub = document.querySelector('.pp4Bub'); if (!bub) return { bub:null };
  const b = R(bub);
  const hits = [...document.querySelectorAll('.sailCell')].map(R)
    .filter(r => r.l < b.r && r.r > b.l && r.t < b.b && r.b > b.t);
  return { bub:b, text:bub.textContent.trim().slice(0,60), opacity:getComputedStyle(bub).opacity,
    sails: document.querySelectorAll('.sailCell').length, covered: hits.length,
    worst: hits.length ? +Math.max(...hits.map(r => Math.min(Math.min(b.r,r.r)-Math.max(b.l,r.l), Math.min(b.b,r.b)-Math.max(b.t,r.t)))).toFixed(1) : 0 };
})()`;
if (SCENES.includes("bubble")) {
  const s = out.scenes.bubble = {};
  const G = await ev("window.__G.st.game.cfg.grid");
  const mid = [(G / 2) | 0, (G / 2) | 0];

  // ---- (0) RED-PROOF: same bubble, NO sail squares. Overlap must be zero.
  await ev(`(async()=>{ const {st,board}=window.__G; const seat=st.mySeat??0;
    document.querySelectorAll('.sailCell').forEach(e=>e.remove());
    st.game.players[seat].pos=[${mid[0]},${mid[1]}]; board.paintShipAt(seat, st.game.players[seat].pos);
    await new Promise(r=>setTimeout(r,900));
    window.__pp4.subject=seat; window.__pp4.narr("Ahoy, Davy Scones — yer turn!"); return 1;})()`);
  await sleep(1200);
  {
    const m = await ev(RECTS);
    s.redProof = { sails: m.sails.length, bubOverSails: m.sails.filter(r => ov(m.bub, r)).length };
    log(`bubble RED-PROOF (no squares): sailCells=${s.redProof.sails} bubble overlaps ${s.redProof.bubOverSails}`);
  }

  /* ---- (1) the real state: the engine's own sail window, bubble raised.
     RETRIED, because a bot's own turn narration replaces the live bubble (one bubble at a time) and
     a measurement taken on somebody else's line is a measurement of the wrong thing. The loop
     stops on OUR words being the ones on screen, and says which attempt it took. */
  const MINE = "Ahoy, Davy Scones — yer turn!";
  let got = null;
  for (let i = 0; i < 6 && !got; i++) {
    s.pose = await poseBubbleOverSails(mid, MINE);
    await sleep(500);
    const v = await ev(BUB_VS_SAILS);
    if (v && v.text && v.text.indexOf("Ahoy") === 0) { got = v; s.attempts = i + 1; }
  }
  s.sailOverlap = got;
  log(`bubble pose: ${JSON.stringify(s.pose)} (attempt ${s.attempts})`);
  log(`bubble FAULT 5 — D-38: bubble stands on ${got && got.covered} of ${got && got.sails} sail squares (worst overlap ${got && got.worst}px); bubble opacity=${got && got.opacity}`);
  s.stack = await ev(`(() => {
    const R = el => { const r = el.getBoundingClientRect(); return {l:+r.left.toFixed(1),t:+r.top.toFixed(1),r:+r.right.toFixed(1),b:+r.bottom.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}; };
    const bub = document.querySelector('.pp4Bub');
    const cell = document.querySelector('.sailCell');
    if (!bub || !cell) return { err: 'missing bubble or sailCell', bub: !!bub, cell: !!cell };
    // EVERY property that creates a stacking context, walked to the root — the plan's own suspicion
    const CTX = el => { const cs = getComputedStyle(el); return {
      tag: (el.id ? '#'+el.id : el.className ? '.'+String(el.className).split(' ')[0] : el.tagName),
      pos: cs.position, z: cs.zIndex, opacity: cs.opacity, transform: cs.transform,
      filter: cs.filter, isolation: cs.isolation, mixBlend: cs.mixBlendMode,
      willChange: cs.willChange, contain: cs.contain, perspective: cs.perspective,
      // the actual test for "does this element establish a stacking context"
      makesCtx: (cs.position!=='static' && cs.zIndex!=='auto') || parseFloat(cs.opacity) < 1 ||
                cs.transform!=='none' || cs.filter!=='none' || cs.isolation==='isolate' ||
                cs.mixBlendMode!=='normal' || /transform|opacity|filter/.test(cs.willChange) ||
                /paint|layout|strict|content/.test(cs.contain) || cs.perspective!=='none' };
    };
    const chain = el => { const out=[]; for (let e=el; e && e!==document.documentElement; e=e.parentElement) out.push(CTX(e)); return out; };
    const bcs = getComputedStyle(bub);
    return {
      bubOpacity: bcs.opacity, bubBg: bcs.backgroundColor, bubZ: bcs.zIndex, bubBorder: bcs.borderColor,
      bubClass: bub.className, bubText: bub.textContent.trim().slice(0,60),
      bodyCls: document.body.className,
      bubRect: R(bub), cellRect: R(cell),
      bubChain: chain(bub), cellChain: chain(cell),
      // the DOM's own answer to "what is painted on top here" at the centre of the overlap
      hitTest: (() => {
        const b = bub.getBoundingClientRect();
        const cs2 = [...document.querySelectorAll('.sailCell')].map(e=>({e, r:e.getBoundingClientRect()}))
          .filter(o => o.r.left < b.right && o.r.right > b.left && o.r.top < b.bottom && o.r.bottom > b.top);
        if (!cs2.length) return { overlapping: 0 };
        const o = cs2[0], x = (Math.max(b.left,o.r.left)+Math.min(b.right,o.r.right))/2,
                          y = (Math.max(b.top,o.r.top)+Math.min(b.bottom,o.r.bottom))/2;
        return { overlapping: cs2.length, x:+x.toFixed(1), y:+y.toFixed(1),
          stack: document.elementsFromPoint(x,y).slice(0,6).map(e => e.id ? '#'+e.id : e.className ? '.'+String(e.className).split(' ')[0] : e.tagName) };
      })() };
  })()`);
  s.shotWith = await shot("bubble-over-sails");
  // ---- (2) THE PIXEL. Hide the bubble, re-shoot, and compare the same point.
  s.probePt = s.stack && s.stack.hitTest && s.stack.hitTest.x != null ? [s.stack.hitTest.x, s.stack.hitTest.y] : null;
  await ev(`(()=>{const b=document.querySelector('.pp4Bub'); if(b) b.style.visibility='hidden'; return 1;})()`);
  await sleep(250);
  s.shotWithout = await shot("bubble-hidden");
  await ev(`(()=>{const b=document.querySelector('.pp4Bub'); if(b) b.style.visibility=''; return 1;})()`);
  // ---- (3) force opacity 1 and re-shoot: if the cream then covers the square, it was never z-order
  await ev(`(()=>{const b=document.querySelector('.pp4Bub'); if(b){b.style.opacity='1'; b.style.transition='none';} return 1;})()`);
  await sleep(250);
  s.shotOpaque = await shot("bubble-forced-opaque");
  await ev(`(()=>{const b=document.querySelector('.pp4Bub'); if(b){b.style.opacity=''; b.style.transition='';} return 1;})()`);
  const st = s.stack || {};
  log(`bubble: opacity=${st.bubOpacity} bg=${st.bubBg} z=${st.bubZ} class="${st.bubClass}" body="${st.bodyCls}"`);
  log(`bubble: text="${st.bubText}"`);
  log(`bubble hit-test at ${JSON.stringify(s.probePt)}: overlapping ${st.hitTest && st.hitTest.overlapping} squares; paint stack (top first) = ${JSON.stringify(st.hitTest && st.hitTest.stack)}`);
  log(`bubble stacking chain: ${JSON.stringify((st.bubChain||[]).filter(x=>x.makesCtx))}`);
  log(`sailCell stacking chain: ${JSON.stringify((st.cellChain||[]).filter(x=>x.makesCtx))}`);
  log(`bubble shots: with=${s.shotWith} hidden=${s.shotWithout} forcedOpaque=${s.shotOpaque}`);
}

/* ================= SCENE: the battle circles' gap (FAULT 6) =================
   The plan asks whether battle prompts reach the fan's placement at all. `.btlBtn` disqualifies a
   panel from the radial bloom outright (menuButtons), so the "Fire again / Break off" circles in
   solo-desktop-020 CANNOT be .btlBtn — they are ordinary .apBtn from ask(). This measures the two
   side by side: the battle's own two options, and a plain two-option control at the same square.
   If they measure the same, there is one gap rule and the judge's ~10px is a misread. */
if (SCENES.includes("battle")) {
  const s = out.scenes.battle = {};
  const G = await ev("window.__G.st.game.cfg.grid");
  const poseAsk = (cell, optsJson) => ev(`(async(S)=>{ const {st,flow,board}=window.__G; S=JSON.parse(S);
    document.querySelectorAll('.sailCell').forEach(e=>e.remove());
    const seat=st.mySeat??0, p=st.game.players[seat];
    p.pos=S.cell.slice(); board.paintShipAt(seat,p.pos);
    await new Promise(r=>setTimeout(r,700));
    flow.localAsk(S.msg, S.opts, null, null);
    return 1; })(${JSON.stringify(JSON.stringify(optsJson))})`);

  for (const [name, cell] of [["mid", [(G / 2) | 0, (G / 2) | 0]], ["corner", [G - 1, G - 1]]]) {
    // the battle pair, worded exactly as solo-desktop-020 shows them
    await poseAsk(cell, { cell, msg: "<b>Davy Scones</b>: load another broadside (−2🪙)? 🪙 HEADS and the shot lands.",
      opts: [{ label: "🔥 Fire again <span class=\"nobrk\">−2🪙</span>", short: "🔥 Fire again −2🪙", value: "again" },
             { label: "🏳️ Break off", short: "🏳️ Break off", value: "off" }] });
    await settle();
    let m = await ev(RECTS);
    const battle = fanStats(m.petals);
    const battleRects = m.petals.map(p => ({ text: p.text, painted: p.r.w, layout: p.ow, tf: p.tf, cx: +(p.r.l + p.r.w / 2).toFixed(1), cy: +(p.r.t + p.r.h / 2).toFixed(1) }));
    const battleShot = await shot(`battle-${name}-pair`);
    // the CONTROL: two plain options, same square. Same placement => same gap.
    await poseAsk(cell, { cell, msg: "Wyargh, what'll ye do, cap'n?",
      opts: [{ label: "Sail on", short: "Sail on", value: "a" }, { label: "🌊 Pass", short: "🌊 Pass", value: "pass" }] });
    await settle();
    m = await ev(RECTS);
    const control = fanStats(m.petals);
    const controlRects = m.petals.map(p => ({ text: p.text, painted: p.r.w, layout: p.ow, tf: p.tf, cx: +(p.r.l + p.r.w / 2).toFixed(1), cy: +(p.r.t + p.r.h / 2).toFixed(1) }));
    s[name] = { battle, battleRects, control, controlRects,
      diff: (battle.minGap != null && control.minGap != null) ? +(battle.minGap - control.minGap).toFixed(2) : null,
      shot: battleShot, controlShot: await shot(`battle-${name}-control`) };
    log(`battle ${name}: PAIR   painted circle ${battle.d}px / layout ${battle.dLayout}px | centre-to-centre ${battle.centreMin} | gap painted ${battle.minGap} / layout ${battle.minGapLayout}`);
    log(`battle ${name}: CTRL   painted circle ${control.d}px / layout ${control.dLayout}px | centre-to-centre ${control.centreMin} | gap painted ${control.minGap} / layout ${control.minGapLayout}`);
    log(`battle ${name} petals: pair=${JSON.stringify(battleRects)}`);
    log(`battle ${name} petals: ctrl=${JSON.stringify(controlRects)}`);
    log(`battle ${name} VERDICT: same spacing? centre-to-centre ${battle.centreMin} vs ${control.centreMin}`);
  }
}

/* ================= SCENE: the flip ceremony's captions (FAULT 1) =================
   Raised through the game's own arm hook (__pp4.flip), with the battle wording the judge saw. */
if (SCENES.includes("ceremony")) {
  const s = out.scenes.ceremony = {};
  s.before = await ev("!!document.getElementById('pp4Veil')");
  /* Raised through board.setFlipActive() — the game's OWN entry, which is what humanFlip and both
     battle halves call. Calling __pp4.flip directly is the trap that cost this scene its first
     run: flipArmed(el, onClick) takes TWO arguments, so a single-argument call lands in the
     `!onClick` disarm branch and builds no veil at all. */
  await ev(`(()=>{ window.__pp4.flipMsg = null; window.__G.board.setFlipActive(()=>{}); return 1; })()`);
  await sleep(400);
  // the stakes line the judge read — written into the ceremony's own node, not a new one
  await ev(`(()=>{ const v=document.getElementById('pp4Veil'); if(!v) return 0;
    let t=v.querySelector('.pp4CerTitle'); if(t) t.textContent='⚔️ Broadside!';
    let st=v.querySelector('.pp4CerStakes'); if(st) st.textContent='Crosswind — two heads and the cannonballs collide.';
    return 1; })()`);
  await sleep(1200);
  const m = await ev(RECTS);
  s.after = !!m.veil;
  s.rects = { veil: m.veil, title: m.cerTitle, slot: m.cerSlot, stakes: m.cerStakes, sub: m.cerSub, cap: m.cap, ribbon: m.ribbon };
  s.stakesOverCap = ov(m.cerStakes, m.cap) ? olap(m.cerStakes, m.cap) : null;
  s.subOverCap = ov(m.cerSub, m.cap) ? olap(m.cerSub, m.cap) : null;
  s.slotOverCap = ov(m.cerSlot, m.cap) ? olap(m.cerSlot, m.cap) : null;
  s.lowestBottom = Math.max(...[m.cerSub, m.cerStakes, m.cerSlot, m.cerTitle].filter(Boolean).map(r => r.b));
  s.capTop = m.cap ? m.cap.t : null;
  s.spillBelowBand = (s.capTop != null) ? +(s.lowestBottom - s.capTop).toFixed(1) : null;
  s.columnHeight = (() => { const rs = [m.cerTitle, m.cerSlot, m.cerStakes, m.cerSub].filter(Boolean);
    return rs.length ? +(Math.max(...rs.map(r => r.b)) - Math.min(...rs.map(r => r.t))).toFixed(1) : null; })();
  s.shot = await shot("ceremony");
  log(`ceremony: veil before=${s.before} after=${s.after} side=${m.side}`);
  log(`ceremony rects: title=${JSON.stringify(m.cerTitle)} slot=${JSON.stringify(m.cerSlot)} stakes=${JSON.stringify(m.cerStakes)} sub=${JSON.stringify(m.cerSub)}`);
  log(`ceremony: captains card top=${s.capTop}; column ${s.columnHeight}px tall; lowest ceremony line ends at ${s.lowestBottom}`);
  log(`ceremony FAULT 1 — stakes over the card by ${s.stakesOverCap}px, sub over it by ${s.subOverCap}px, coin over it by ${s.slotOverCap}px (spill past the card's top = ${s.spillBelowBand}px)`);
  await ev(`(()=>{const v=document.getElementById('pp4Veil'); if(v)v.remove(); document.body.classList.remove('pp4Cer'); return 1;})()`);
  await sleep(400);
}

/* ================= SCENE: the GIVE prompt's unnamed circle (FAULT 2) + the ask pill (FAULT 3) ===
   Posed through the REAL humanTrade(), so the option objects are built by the real crateOpt() and
   not by a copy of it in this file — the whole point of the fault. */
if (SCENES.includes("give")) {
  const s = out.scenes.give = {};
  s.pose = await ev(`(async()=>{ const {st,flow,board}=window.__G; const g=st.game;
    document.querySelectorAll('.sailCell').forEach(e=>e.remove());
    const seat=st.mySeat??0, p=g.players[seat];
    /* THE WHEEL HAS TO BE OURS. The first run of this scene called humanTrade while curSeat was a
       BOT (1), and the WANT prompt was torn down under the click — logged as "picked Toasty Wheat"
       followed by a step that never arrived. Posing the state means posing the turn too. */
    st.curSeat = seat; st.turnExpired = false; st.liveDone = false;
    /* AND FREEZE THE VOYAGE BEFORE OPENING THE TRADE. Run 3 reached the GIVE step and then
       photographed a STORM ("Day 1: A storm be ragin'!") that had swept the prompt away mid-
       measurement. Every bot beat and every weather beat is an awaited sleep, and sleep stalls on
       shotClockPaused (util.js) — a human prompt resolves on a click, not on a sleep, so the trade
       still walks while the world around it holds still. */
    st.shotClockPaused = true;
    // a hold to offer and coins to offer…
    p.ing = g.ings.slice(0,3); p.coins = 6;
    // …and EVERY other captain holding something, so the WANT step's options are not all greyed.
    // holdersOf() drives the greying, and a single holder leaves six of seven circles untappable —
    // which is what made the first run click a disabled crate and go nowhere.
    g.players.filter(q=>q!==p).forEach((q,i)=>{ q.ing=[g.ings[(i+3)%g.ings.length]]; });
    board.paintShipAt(seat, p.pos);
    flow.humanTrade(p);
    return {mine:p.ing, curSeat:st.curSeat, mySeat:seat}; })()`);
  await sleep(2600);
  s.want = await ev(RECTS);
  log(`give: WANT step mode=${s.want.mode} circles=${s.want.petals.length}`);
  s.wantShot = await shot("give-want");
  // take the first enabled crate to reach the GIVE step
  await armGate();
  /* ENABLED means NOT aria-disabled. playtest 21 item 5 moved greyed options onto aria-disabled so
     they can be tapped for their reason, which means `b.disabled` is false on EVERY circle and a
     naive filter happily picks a greyed one — stage.js's own stayConfirm note records this exact
     trap one screen over. */
  const picked = await clickSel("#pp4Prompt .apBtn",
    "b => !/back|←|‹/i.test(b.textContent) && b.getAttribute('aria-disabled') !== 'true' && !/apDisabled/.test(b.className)");
  log(`give: picked "${picked}" on the WANT step`);
  // WAIT FOR THE GIVE STEP TO EXIST, don't assume a fixed sleep reaches it — and if it never
  // arrives, say what IS on screen rather than reporting an empty fan as a measurement.
  /* FREEZE THE GAME THE INSTANT THE STEP EXISTS. The first two runs polled, found the GIVE step,
     then slept 900ms and measured an empty prompt — the turn loop had moved on and torn it down
     underneath the ruler. appState.shotClockPaused is the game's own whole-game freeze (every bot
     beat is an awaited sleep and sleep stalls on it, util.js), so pausing is posing, not faking. */
  /* MEASURE IN THE SAME BREATH AS DETECTING. Runs 3 and 4 polled, saw the GIVE step, then slept
     and measured an empty prompt — twice, for two different reasons (a storm the first time, and
     the step simply moving on the second). Reading the circles inside the SAME evaluate as the
     detection removes the window entirely: there is no gap for anything to happen in. */
  let arrived = false, snap = null;
  for (let i = 0; i < 70 && !arrived; i++) {
    await sleep(120);
    snap = await ev(`(()=>{const m=document.querySelector('#pp4Prompt .apMsg');
      if (!(m && /GIVE/i.test(m.textContent||''))) return null;
      window.__G.st.shotClockPaused = true;
      const vis = el => { const cs=getComputedStyle(el); return cs.visibility!=='hidden' && cs.display!=='none' && parseFloat(cs.opacity)>.05; };
      /* THE ASK ARRIVING IS NOT THE CIRCLES ARRIVING. panel()'s pendingReveal gate holds .apBtns at
         visibility:hidden until the typewriter has finished the sentence, so a probe that fires on
         the message alone reads an empty fan and calls it a measurement — which is exactly what run
         5 did. Both conditions, or keep waiting. */
      if (![...document.querySelectorAll('#pp4Prompt .apBtn')].some(b=>vis(b)&&b.getBoundingClientRect().width>4)) return null;
      return { msg: m.textContent.trim().slice(0,60),
        circles: [...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b=>vis(b)&&b.getBoundingClientRect().width>4)
          .map(b => ({ text:(b.textContent||'').trim().slice(0,24), imgs:b.querySelectorAll('img').length,
                       html:(b.innerHTML||'').slice(0,110) })) }; })()`);
    arrived = !!snap;
  }
  s.snap = snap;
  if (snap) {
    s.snapUnnamed = snap.circles.filter(x => !x.text || !x.text.replace(/[\s×0-9]/g, "").length);
    log(`give FAULT 2 (caught at the moment it rendered) — ask: "${snap.msg}"`);
    log(`give FAULT 2 — circles: ${JSON.stringify(snap.circles.map(x => x.text + " [" + x.imgs + " img]"))}`);
    log(`give FAULT 2 — UNNAMED (icon only, no words): ${s.snapUnnamed.length} ${JSON.stringify(s.snapUnnamed.map(x => x.html))}`);
  }
  if (!arrived) {
    s.giveMissing = await ev(`(()=>{ const box=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
      return { display: box?getComputedStyle(box).display:'?', cls: box?box.className:'?',
        prompt: window.__G.st.currentPrompt ? Object.keys(window.__G.st.currentPrompt) : null,
        curSeat: window.__G.st.curSeat, mySeat: window.__G.st.mySeat,
        turnExpired: window.__G.st.turnExpired,
        msg: (document.querySelector('#pp4Prompt .apMsg')||{textContent:''}).textContent.trim().slice(0,80),
        panel: ap ? ap.innerHTML.slice(0,200) : null }; })()`);
    log(`give: GIVE step never arrived — ${JSON.stringify(s.giveMissing)}`);
  }
  await sleep(900);
  const m = await ev(RECTS);
  s.give = { mode: m.mode, petals: m.petals, pill: m.pill, cap: m.cap, ih: m.ih };
  // FAULT 2, as a number: a circle whose visible TEXT is empty is an unnamed circle.
  s.unnamed = m.petals.filter(p => !p.text || !p.text.replace(/[\s×0-9]/g, "").length).map(p => p.html);
  s.named = m.petals.map(p => p.text);
  // FAULT 3: clear air between the ask pill's bottom and the captains card's top
  s.pillToCap = (m.pill && m.cap) ? +(m.cap.t - m.pill.b).toFixed(1) : null;
  s.pillOverCap = ov(m.pill, m.cap) ? olap(m.pill, m.cap) : null;
  s.fan = fanStats(m.petals);
  s.giveShot = await shot("give-step");
  log(`give FAULT 2 — circles: ${JSON.stringify(s.named)}`);
  log(`give FAULT 2 — UNNAMED circles: ${s.unnamed.length} ${JSON.stringify(s.unnamed)}`);
  log(`give FAULT 3 — ask pill bottom=${m.pill && m.pill.b} captains card top=${m.cap && m.cap.t} => clear air ${s.pillToCap}px (overlap ${s.pillOverCap})`);
  log(`give fan: n=${s.fan.n} painted circle ${s.fan.d}px / layout ${s.fan.dLayout}px | centre-to-centre ${s.fan.centreMin} | gap painted ${s.fan.minGap} / layout ${s.fan.minGapLayout} | piles=[${s.fan.piles.join(", ")}]`);
}

/* ================= SCENE: the ask pill against the captains card (FAULT 3) =================
   solo-phone-023 shows a THREE-LINE pill whose bottom edge meets the card's top edge with no gap.
   Reproducing it needs both halves of that: a boat low on the board (D-38 keeps the pill near the
   boat) AND a message long enough to wrap to three lines. A one-line pill high on the board — the
   first pose this scene tried — measures 281px of clear air and proves nothing.
   RED-PROOF: the same long message with the boat at the TOP of the board must NOT come near the
   card. If both poses report the same clearance, this is not measuring the pill's placement. */
if (SCENES.includes("pill")) {
  const s = out.scenes.pill = {};
  const G = await ev("window.__G.st.game.cfg.grid");
  /* FIVE LINES, NOT THREE. solo-phone-023's pill is three lines and overruns the card by ~3px on
     a 664px phone; the clamp being tested is `capT - 44`, a constant that assumes ONE line, so the
     overrun grows with the message. A longer ask makes the same fault unmissable instead of
     marginal, which is what a before/after pair needs. */
  const LONG = "Fer yer 🧊 Crystal Sugar the table answers: ✅ <b>Flaky Jack</b> takes yer 🌾 Toasty Wheat + 4🪙, and <b>Crustbeard</b> offers ye 🥛 Fresh Milk fer it instead. Take a deal, or walk away?";
  const posePill = (cell) => ev(`(async(S)=>{ const {st,flow,board}=window.__G; S=JSON.parse(S);
    document.querySelectorAll('.sailCell').forEach(e=>e.remove());
    const seat=st.mySeat??0, p=st.game.players[seat];
    st.shotClockPaused=false; st.curSeat=seat; st.turnExpired=false;
    p.pos=S.cell.slice(); board.paintShipAt(seat,p.pos);
    await new Promise(r=>setTimeout(r,700));
    flow.localAsk(S.msg, [{label:"✅ Take the deal",short:"✅ Take it",value:"y"},
                          {label:"🚫 Walk away",short:"🚫 Walk away",value:"n"}], null, null);
    return 1; })(${JSON.stringify(JSON.stringify({ cell, msg: LONG }))})`);
  // …and hold it still to measure it, same reason as the GIVE step above
  const freezeOnPill = async () => { for (let i = 0; i < 60; i++) { await sleep(150);
    if (await ev(`(()=>{const m=document.querySelector('#pp4Prompt .apMsg');
      if(!(m && m.getBoundingClientRect().height>4)) return false;
      window.__G.st.shotClockPaused = true; return true;})()`)) return true; } return false; };

  /* SWEPT ACROSS THE BOARD, not sampled at two spots. The camera reframes on every move, so a
     board row does not map to a fixed screen height and one pose can miss the collision by luck —
     the pristine tree measured the same fault at 16px one run and 65px another. Five rows, and the
     verdict is the WORST of them. */
  for (const [name, cell] of [["boat-high", [(G / 2) | 0, 1]], ["boat-r4", [(G / 2) | 0, 4]],
                              ["boat-mid", [(G / 2) | 0, (G / 2) | 0]], ["boat-r10", [(G / 2) | 0, 10]],
                              ["boat-low", [(G / 2) | 0, G - 1]]]) {
    await posePill(cell);
    const ok = await freezeOnPill();
    await sleep(700);
    const m = await ev(RECTS);
    if (!ok) log(`pill ${name}: WARNING — the pill never rendered; the numbers below are not a measurement`);
    // the pill's own HEIGHT is the quantity `capT - 44` pretends is constant, so that is what is reported
    const lines = m.pill ? m.pill.h : null;
    s[name] = { pill: m.pill, cap: m.cap, lines,
      clearAir: (m.pill && m.cap) ? +(m.cap.t - m.pill.b).toFixed(1) : null,
      overlap: ov(m.pill, m.cap) ? olap(m.pill, m.cap) : null,
      shot: await shot(`pill-${name}`) };
    log(`pill ${name}: pill is ${lines}px tall, bottom=${m.pill && m.pill.b}, card top=${m.cap && m.cap.t} => clear air ${s[name].clearAir}px (overlap ${s[name].overlap})`);
  }
  /* AND ONE DETERMINISTIC CASE, because the five above are not. The camera reframes on every move,
     so a board row does not map to a fixed screen height and the same pristine tree measured this
     fault at 65px one run, 16px another and not at all a third. A pill tall enough to fill most of
     the band cannot miss: whichever spot the placement picks, the only thing keeping its foot off
     the captains card is the clamp. The assertion is the invariant itself — a pill's bottom may
     never pass capT - 6 — rather than a number that depends on where the boat happened to be. */
  for (const ROW of [3,4,5,6]) {
    const HUGE = ("Fer yer 🧊 Crystal Sugar the table answers: ✅ <b>Flaky Jack</b> takes yer 🌾 Toasty Wheat + 4🪙, "
      + "and <b>Crustbeard</b> offers ye 🥛 Fresh Milk fer it instead, while <b>Dough Hook</b> would rather "
      + "hand over 🥚 Speckled Eggs and two coins on top. Take a deal, or walk away?");
    /* THE BOAT HAS TO BE IN THE WINDOW WHERE THE PILL GOES BELOW IT *AND* THE CARD IS WITHIN REACH,
       and that window is narrow — which is the whole reason the five rows above are flaky. Reading
       the placement: the pill sits ABOVE the boat while `sy - R - 96 >= tSafe - 34` and below it
       otherwise, so the below-the-boat spot needs the boat HIGH on screen (sy < ~252 at 390x664);
       and the foot only reaches the card when `sy + R + 34 + pillHeight > capT`, which needs
       sy > ~191. So: zoom the camera all the way out through the game's own camFull (__pp4.sweepCam,
       which is what a rim ride already calls) so board rows map to fixed screen heights, and stand
       the boat in the middle rows. That lands sy inside 191..252 every time. */
    await ev(`(async(S)=>{ const {st,flow,board}=window.__G; S=JSON.parse(S);
      document.querySelectorAll('.sailCell').forEach(e=>e.remove());
      const seat=st.mySeat??0, p=st.game.players[seat];
      st.shotClockPaused=false; st.curSeat=seat; st.turnExpired=false;
      p.pos=[(st.game.cfg.grid/2|0), S.row]; board.paintShipAt(seat,p.pos);
      await new Promise(r=>setTimeout(r,900));
      window.__pp4.sweepCam();
      await new Promise(r=>setTimeout(r,1100));
      flow.localAsk(S.msg, [{label:"✅ Take the deal",short:"✅ Take it",value:"y"},
                            {label:"🚫 Walk away",short:"🚫 Walk away",value:"n"}], null, null);
      return 1; })(${JSON.stringify(JSON.stringify({ msg: HUGE, row: ROW }))})`);
    await freezeOnPill();
    await sleep(900);
    const m = await ev(RECTS);
    const air = (m.pill && m.cap) ? +(m.cap.t - m.pill.b).toFixed(1) : null;
    (s.huge = s.huge || {})["row"+ROW] = { pill: m.pill, cap: m.cap, clearAir: air, holds: air != null && air >= 5.5,
      shot: await shot("pill-huge-row"+ROW) };
    log(`pill HUGE row ${ROW}: pill ${m.pill && m.pill.h}px tall, top=${m.pill && (m.pill.b - m.pill.h).toFixed(1)}, bottom=${m.pill && m.pill.b}, card top=${m.cap && m.cap.t} => clear air ${air}px  [invariant holds=${air != null && air >= 5.5}]`);
  }
  const airs = Object.keys(s).filter(k => s[k] && s[k].clearAir != null).map(k => [k, s[k].clearAir]);
  const worstAir = airs.reduce((a, b) => (!a || b[1] < a[1]) ? b : a, null);
  s.worst = worstAir;
  log(`pill VERDICT — clear air by row: ${airs.map(([k, v]) => k + "=" + v).join(", ")}`);
  log(`pill VERDICT — WORST is ${worstAir && worstAir[0]} at ${worstAir && worstAir[1]}px (negative = the pill is inside the captains card)`);
}

log(`\n=== ${TAG} done ===`);
await finish(0);
