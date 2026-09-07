/* THE POSED PAIR FOR THE PILOT — the same board, the same seed, tutorial ON and OFF.
 *
 *   node scripts/qa/pilot_posed_pair.mjs
 *
 * WHY POSED AND NOT PLAYED. The question here is "is this drawn right?", and CLAUDE.md's answer to
 * that is not a rate over a stochastic voyage — it is two pictures of one board. Both shots come
 * from THE SAME live game object, so the seed, the wind, the island layout and the boat positions
 * are identical by construction rather than by a seed argument I would have to trust.
 *
 * WHAT IT PROVES: that the words and the course change, and the game does not.
 * WHAT IT CANNOT PROVE: whether a first-timer understands any of it. Nobody in this project has
 * ever watched one. That gate has no machine.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(REPO, ".planning", "posed", "pilot");
fs.mkdirSync(OUT, { recursive: true });

const PORT = 8497, DBG = 9397;                 // a port never loaded in this session (module cache)
const url = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-pilot-posed"));
const C = await attach(DBG);

// PHONE SIZE. He reads on a phone and the ribbon's whole measured problem is at 320-390px.
const W = 390, H = 844;
await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });

const shot = async (name) => {
  const r = await C.send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); return true; }
  return false;
};
const waitFor = async (expr, ms = 20000, label = expr) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await C.ev(expr)) return true; } catch {}
    await sleep(200);
  }
  throw new Error("timed out waiting for: " + label);
};
/* NEVER CLICK BACK — the manual's 4b. A driver that takes the first button loops on any prompt
   with a back arrow. Match on the LABEL rather than on position. */
const clickBtn = async (rx) => C.ev(`(()=>{
  const bs=[...document.querySelectorAll('#actionPanel .apBtn')]
    .filter(b=>!/back|←|‹/i.test(b.textContent));
  const b=bs.find(x=>${rx}.test(x.textContent));
  if(!b) return false; b.click(); return true;
})()`);

const report = [];
const say = (s) => { console.log(s); report.push(s); };

try {
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
  await sleep(2200);
  // §2: leftover pp_solo silently resumes a game instead of showing the welcome screen.
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.reload()`).catch(() => {});
  await sleep(2500);

  // §3: the name modal opens AFTER the mode card, and #btnNameConfirm is in the DOM from boot —
  // so wait for it to be VISIBLE, not to exist.
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000, "the name modal");
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  // the welcome screen runs its own all-bot attract board, so "a game exists" is not the signal
  // appState is NOT a window global — src/main.js exposes a read-only shallow copy through
  // __pp_app_state_debug(), deliberately, so a console session cannot corrupt live game state.
  await waitFor(`!!(window.__pp_app_state_debug&&__pp_app_state_debug().game&&__pp_app_state_debug().game.players.some(p=>p.strategy==='human'))`, 25000, "a solo game with a human seat");

  /* ── 1. THE FORK. It only appears on a device that has never played, which is what the cleared
     storage above guarantees. */
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/know ye|know how to play/i.test(p.textContent))})()`, 20000, "the Ahoy fork");
  await shot("01-fork.png"); say("shot 01 — the fork: 'Do ye know how to play?'");
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b){b.click();return true}return false})()`);
  await sleep(700);

  // the Ahoy card, then the turn-order card
  await clickBtn("/arrgh/i"); await sleep(900);
  await clickBtn("/start/i"); await sleep(1400);

  /* ── 2. THE RECIPE PICKER. The FIRST tap charts the course; the second commits. */
  await waitFor(`!!document.querySelector('#actionPanel .recipeList')`, 20000, "the recipe picker");
  await sleep(700);
  const stack = await C.ev(`JSON.stringify((()=>{
    const row=[...document.querySelectorAll('#actionPanel .apBtns')].find(r=>r.querySelector('.recipeList'));
    if(!row) return {no:'row'};
    const cards=[...row.querySelectorAll('.apBtn')].filter(b=>b.querySelector('.recipeList'));
    const arrows=[...row.querySelectorAll('.pp4RcArrow')];
    return {cards:cards.length, pos:cards.map(c=>c.dataset.rcpos||'-'),
      arrows:arrows.length,
      arrowBox:arrows.map(a=>{const r=a.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]}),
      rowPos:getComputedStyle(row).position,
      hints:[...document.querySelectorAll('.pp4RecipeHint,#actionPanel .apSub')].map(e=>(e.textContent||'').slice(0,44)),
      icons:row.querySelectorAll('[data-ing]').length};
  })())`);
  say("  the picker -> " + stack);
  const boxes = await C.ev(`JSON.stringify((()=>{
    const R=e=>e?{t:Math.round(e.getBoundingClientRect().top),b:Math.round(e.getBoundingClientRect().bottom),h:Math.round(e.getBoundingClientRect().height)}:null;
    const box=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
    const row=[...document.querySelectorAll('#actionPanel .apBtns')].find(r=>r.querySelector('.recipeList'));
    const card=row&&row.querySelector('.apBtn[data-rcpos="front"]');
    return {vh:innerHeight, box:R(box), ap:R(ap), apScroll:ap?ap.scrollHeight:0,
      apMax:ap?ap.style.maxHeight:'', row:R(row), card:R(card),
      icons:R(card&&card.querySelector('.recipeIcons')),
      boxTop:box?box.style.top:''};
  })())`);
  say("  boxes -> " + boxes);
  await shot("02-recipe-before-tap.png"); say("shot 02 — the picker, before any tap");

  /* R3 + his ruling 18: the arrow flips the card AND re-draws the dotted course. Read the FRONT
     card's title and its charted marks before and after, so "it flipped" is not just a class
     changing — the board has to answer too. */
  const snapFront = `JSON.stringify({
    title:((document.querySelector('#actionPanel .apBtn[data-rcpos="front"] .recipeTitle')||{}).textContent||'').trim(),
    marks:[...document.querySelectorAll('.pp4CourseMark')].map(m=>m.dataset.gx+','+m.dataset.gy).sort().join(' '),
    dashes:document.querySelectorAll('.pp4Course path').length })`;
  const before = JSON.parse(await C.ev(snapFront));
  await C.ev(`(()=>{const a=document.querySelector('.pp4RcArrow.next');if(a){a.click();return true}return false})()`);
  await sleep(700);
  const after = JSON.parse(await C.ev(snapFront));
  say(`  the arrow -> "${before.title}" then "${after.title}"`);
  say(`  the course re-charted -> ${before.marks !== after.marks} (${before.dashes} dashes then ${after.dashes})`);
  await shot("02b-recipe-flipped.png"); say("shot 02b — flipped to the other recipe");
  // and back, so the rest of the run photographs the first card as before
  await C.ev(`(()=>{const a=document.querySelector('.pp4RcArrow.prev');if(a){a.click();return true}return false})()`);
  await sleep(600);
  await C.ev(`(()=>{const b=document.querySelector('#actionPanel .apBtn');if(b){b.click();return true}return false})()`);
  await sleep(900);
  const chart = await C.ev(`JSON.stringify({
    dashes: document.querySelectorAll('.pp4Course path').length,
    marks:  document.querySelectorAll('.pp4CourseMark').length,
    rings:  document.querySelectorAll('.pp4Glow').length,
    host:   !!document.getElementById('courseHost')
  })`);
  say("  charted on the first tap -> " + chart);
  await shot("03-recipe-course.png"); say("shot 03 — the dotted course + pulsing X, drawn from the recipe card");

  // commit that recipe (the second tap is the same card — the Bake this! pill is inert and the
  // tap falls through to it)
  await C.ev(`(()=>{const b=document.querySelector('#actionPanel .apBtn');if(b){b.click();return true}return false})()`);
  /* THE ONE NEW LINE — "where did my recipe go?", his own ask. Sampled in a poll rather than after
     a fixed sleep: it is a narration with a reading-speed hold, so a single timed read would be a
     probe that measures whether I guessed the delay right. */
  let stowed = "", blinked = false;
  for (let i = 0; i < 24; i++) {
    await sleep(250);
    const got = await C.ev(`JSON.stringify({
      n: [...document.querySelectorAll('#pp4Fx,#narr,.pp4Bubble,#actionPanel')].map(e=>e.textContent||'').join(' | '),
      f: !!document.querySelector('.pp4StowFlash')})`);
    const o = JSON.parse(got);
    if (o.f) blinked = true;
    if (/stowed below/i.test(o.n)) { stowed = "yes"; await shot("03b-recipe-stowed.png"); break; }
  }
  say(`  the stowed line -> ${stowed || "NOT SEEN"} · the captains box blinked -> ${blinked}`);
  await sleep(1500);

  /* ── 3. THE SAIL PROMPT, at rung 0.
     GETTING THERE NEEDS THE MANUAL'S 4a: there is NO separate flip button — the flippenator coin
     #flipCoinWrap IS the control, and every stalled driver in this project traced to that. So the
     advance loop below clicks the coin as well as any non-back panel button, and stops the moment
     the sail squares exist. */
  const advance = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await C.ev(`!!document.querySelector('.sailCell')`)) return true;
      await C.ev(`(()=>{
        const coin=document.getElementById('flipCoinWrap');
        if(coin&&coin.classList.contains('active')&&coin.onclick){coin.onclick();return 'coin'}
        const bs=[...document.querySelectorAll('#actionPanel .apBtn')]
          .filter(b=>!/back|←|‹/i.test(b.textContent)&&b.offsetParent&&!b.getAttribute('aria-disabled'));
        if(bs.length){bs[0].click();return 'btn'}
        return null;
      })()`);
      await sleep(500);
    }
    return false;
  };
  if (!(await advance(60000))) {
    const dump = await C.ev(`JSON.stringify({panel:(document.getElementById('actionPanel')||{}).textContent||'',
      coin:!!(document.getElementById('flipCoinWrap')||{}).classList,
      round:(window.__pp_app_state_debug&&__pp_app_state_debug().game||{}).round})`);
    await shot("98-stalled.png");
    throw new Error("never reached the sail prompt -> " + dump);
  }
  await sleep(900);
  const on = await C.ev(`JSON.stringify({
    msg: (document.querySelector('#actionPanel .apMsg')||{}).textContent||'',
    sub: (document.querySelector('#actionPanel .apSub')||{}).textContent||'',
    dashes: document.querySelectorAll('.pp4Course path').length,
    marks: document.querySelectorAll('.pp4CourseMark').length,
    cells: document.querySelectorAll('.sailCell').length,
    ribbonHelp: !!document.getElementById('pp4Help')
  })`);
  say("  PILOT ON  -> " + on);
  await shot("04-sail-rung0.png"); say("shot 04 — the sail prompt, rung 0, with the course");

  /* ── 4. THE SAME BOARD WITH THE PILOT OFF. Nothing about the game changes: same game object,
     same seed, same wind, same squares. Only the words and the course go. */
  await C.ev(`(()=>{const b=document.getElementById('pp4Help');if(b){b.click();return true}return false})()`);
  await sleep(500);
  // re-render the identical prompt so the pose is the same moment, not the next one
  const off = await C.ev(`JSON.stringify({
    dashes: document.querySelectorAll('.pp4Course path').length,
    marks: document.querySelectorAll('.pp4CourseMark').length,
    cells: document.querySelectorAll('.sailCell').length
  })`);
  say("  PILOT OFF -> " + off);
  await shot("05-sail-pilot-off.png"); say("shot 05 — the parrot switched off");

  /* ── 5. THE RIBBON AT 320px, which is where the ? was measured to break it. */
  await C.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const rib = await C.ev(`JSON.stringify((()=>{
    const r=document.getElementById('pp4Ribbon'); if(!r) return {no:'ribbon'};
    const kids=[...r.children].map(c=>({id:c.id||c.className,right:Math.round(c.getBoundingClientRect().right)}));
    return {inner:innerWidth, scrollW:r.scrollWidth, clientW:r.clientWidth,
            overflow:Math.max(0,r.scrollWidth-r.clientWidth),
            furthestRight:Math.max(...kids.map(k=>k.right)), kids};
  })())`);
  say("  RIBBON @320 -> " + rib);
  await shot("06-ribbon-320.png"); say("shot 06 — the ribbon at 320px with the ? present");

  say("");
  say("shots in .planning/posed/pilot/");
} catch (e) {
  say("FAILED — " + e.message);
  await shot("99-failure.png");
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, "report.txt"), report.join("\n") + "\n");
  killAll();
}
