/* W3-1 — HOW MANY TIMES IS ONE BATTLE BEAT DRAWN, AND WHERE?
 *
 *   node scripts/qa/w31_battle_choreography.mjs [--seconds=180]
 *
 * WYATT, verbatim: "The battle box choreography is glitchy, in ALL modes. It appears for an
 * instant, the stage deletes it, it moves down to centre, then it is removed and replaced by the
 * stage with the coin flipper. And after the flip the coin disappears from the flippenator BEFORE
 * the stage does — it should stay until the stage goes."
 *
 * ALL MODES IS THE FIRST THING TO HONOUR: this is not a host/guest fault, so Wave 1's whole family
 * of causes is excluded before anything is measured. Solo is therefore the right place to watch it,
 * and the cheapest.
 *
 * WHAT HE IS DESCRIBING IS A SEQUENCE, NOT A SCREEN — four transitions where a player should see
 * one. A snapshot cannot show that, and neither can a state dump: only a per-frame trace can. So
 * this samples every animation frame, INSIDE the page, and records the battle card's REGIME —
 * whether it exists, which container holds it, whether the stage is up, whether the ceremony slot
 * exists, and whether the flip coin is present. Then it counts the DISTINCT regimes for one beat.
 * ONE BEAT SHOULD BE ONE REGIME.
 *
 * THE PREDICTION, WRITTEN BEFORE THIS WAS RUN (.planning/predictions/W3-1-battle-choreography.md):
 * the card is drawn at least twice — once unstaged by renderBattle's panel() call, then again
 * staged once a prompt with a `stage` option sets ap.dataset.pp4Stage — because "is this centre
 * stage" is decided from the panel's CONTENT after the content has already been drawn.
 * NAMED FALSIFIER: if the trace shows the card rendered ONCE, at centre, with no intermediate
 * unstaged frame, the double-render theory is dead and the cause is a transition, not a re-render.
 *
 * AND IT MUST BE ABLE TO FIND NOTHING HONESTLY: if no battle happens in the window, it says NOT RUN
 * and exits 1. A probe that never reached its subject has told you about itself, not the game.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import os from "node:os";
import path from "node:path";

const PORT = 8518, DBG = 9420;
const SECONDS = Number(process.argv.find(a => a.startsWith("--seconds="))?.split("=")[1] || 180);
const url = serve(PORT);
// A hardcoded "/tmp/..." profile path is a Linux-container-era assumption: on Windows Chrome gets
// a bad path (same fault fixed 2026-09-01 in w33_drumroll_order.mjs). os.tmpdir() resolves to the
// real temp directory on every platform this runs on.
launch(DBG, path.join(os.tmpdir(), "chrome-w31"));
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

/* THE REGIME OF ONE FRAME. Everything here is read from the RENDERED DOM, not from game state —
   the fault is about what a player sees, and state was never the thing that was wrong. */
const WATCH = `(()=>{
  if(window.__w31)return "already";
  const regime=()=>{
    const btl=document.querySelector(".btl");
    const ap=document.getElementById("actionPanel");
    const cer=document.getElementById("pp4CerSlot");
    const coin=document.getElementById("flipCoinWrap");
    if(!btl&&!cer&&!coin)return null;
    let host="none";
    if(btl){ let n=btl.parentElement, seen=[];
      while(n&&seen.length<6){ if(n.id){host=n.id;break;} seen.push(n); n=n.parentElement; }
      if(host==="none"&&btl.closest("#pp4CerSlot"))host="pp4CerSlot"; }
    /* VISIBILITY FIRST, BECAUSE A HIDDEN ELEMENT REPORTS top:0 AND THAT IS NOT "AT THE TOP".
       The first cut of this probe rounded that 0 to "y0" and I very nearly recorded a visible jump
       from the top of the screen that was really the box being display:none while it was measured.
       An instrument that cannot tell "not laid out" from "laid out at zero" is measuring something
       other than what it names (rule 6). So a frame now says SHOWN or HIDDEN, and a position is
       only reported for a frame that is actually on screen with area. */
    const r=btl?btl.getBoundingClientRect():null;
    const vis=(()=>{ if(!btl) return "-";
      if(!r||!r.width||!r.height) return "HIDDEN:noarea";
      let n=btl; while(n&&n.nodeType===1){ const cs=getComputedStyle(n);
        if(cs.display==="none") return "HIDDEN:display";
        if(cs.visibility==="hidden") return "HIDDEN:visibility";
        if(parseFloat(cs.opacity)===0) return "HIDDEN:opacity";
        n=n.parentElement; }
      return "SHOWN"; })();
    return [
      btl?"card":"-",
      "in:"+host,
      ap&&ap.dataset.pp4Stage?"apStage":"-",
      document.body.classList.contains("pp4Stage")?"bodyStage":"-",
      cer?"cerSlot":"-",
      /* THE COIN'S STATE IS ITS CLASS AND ITS FACE, NEVER ITS TEXT. The first cut read
         textContent and called an empty string "empty" — but setFlipCoin() sets textContent to ""
         for heads, tails, spin AND wait, painting the face as a background-image, and only the
         ARMED coin carries the word "FLIP" (setFlipActive, src/ui/board.js). So "coin:empty" meant
         "the caption was replaced by the coin face", which is the correct behaviour, and I nearly
         recorded it as the coin vanishing. Wyatt's report is about the FACE going, so the face is
         what is read. */
      coin?("coin:"+(["heads","tails","spin","wait","active"].filter(c=>coin.classList.contains(c)).join("+")||"none")
            +((coin.style.backgroundImage||"").indexOf("url")>=0?"+face":"+noface")):"-",
      vis,
      (r&&vis==="SHOWN")?("y"+Math.round(r.top/20)*20):"-",
      /* WHICH THING MOVES — the card inside its box, or the whole box? Three geometry guesses have
         died on this codebase in a week, so this asks the question instead of assuming an answer:
         the card's offset WITHIN #apGridInner, and the panel's own screen position, side by side.
         If the offset is constant while the panel's top changes, the mover is the PANEL's layout,
         not the content's. */
      (r&&vis==="SHOWN")?("off"+Math.round((btl.offsetTop||0)/10)*10):"-",
      /* THE CLASS I FAILED TO RECORD LAST TIME, and it decides everything: runHeightSequence
         early-returns on centreStaged(), which tests the pp4Center class on #pp4Prompt -- NOT the
         ap.dataset.pp4Stage I had been recording. If it is set while the card is up, the panel's
         own height sequence never runs and the grow is driven by the stage's layout instead: a
         different file and a different fix.
         NO BACKTICKS ANYWHERE IN THIS BLOCK. It is a template literal handed to the page, and
         quoting a selector in backticks ends the literal and throws. That is the THIRD time in one
         session -- so the rule is now written where the mistake gets made, not in a ledger. */
      (()=>{const b=document.getElementById("pp4Prompt");
        return b?("prompt:"+(b.classList.contains("pp4Center")?"CENTER":"-")+(b.classList.contains("radial")?"+radial":"")):"noPrompt";})(),
      /* THE BOX ITSELF, beside the panel. If #pp4Prompt's rect is the same in both frames while
         the panel's top moves, the panel is moving INSIDE a static box and the mover is the
         panel's own layout. If the BOX moves, it is the stage's. Two readings this morning were
         wrong from reading code; both were settled by adding one line here. */
      (()=>{const b=document.getElementById("pp4Prompt");
        if(!b||vis!=="SHOWN")return "-";
        const q=b.getBoundingClientRect(); const cs=getComputedStyle(b);
        /* THE FALSIFIER I NAMED IN THE LEDGER, run rather than left standing. The hypothesis is
           that #pp4Prompt is fixed with top:auto, so it sits at its STATIC position and its top is
           a layout consequence that resolves a frame late. If cs.top reads auto in BOTH frames the
           hypothesis holds; if it reads a px value, something is assigning it and I am wrong. */
        return "box"+Math.round(q.top/20)*20+"h"+Math.round(q.height/20)*20+":"+cs.display+":"+cs.position+":top="+cs.top+":inline="+(b.style.top||"UNSET")+":tr="+(cs.transform==="none"?"none":"yes");})(),
      (()=>{const ap=document.getElementById("actionPanel");
        if(!ap||vis!=="SHOWN")return "-";
        const q=ap.getBoundingClientRect();
        return "ap"+Math.round(q.top/20)*20+"h"+Math.round(q.height/20)*20;})(),
      (()=>{const b=document.querySelector(".btl");
        if(!b)return "-";
        const f=b.querySelector(".btl-wait,.btl-prompt,.btl-result");
        return "foot:"+(f?f.className.replace("btl-",""):"none");})()
    ].join(" ");
  };
  window.__w31={log:[],last:null,frames:0};
  const tick=()=>{
    window.__w31.frames++;
    const g=regime();
    if(g!==window.__w31.last){window.__w31.last=g;
      window.__w31.log.push({t:Math.round(performance.now()),g:g});}
    if(window.__w31.log.length<600&&window.__w31.frames<60*400)requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "watching";})()`;

console.log(`W3-1 — the battle beat, frame by frame, SOLO (all modes, so solo is the honest place).\n`);
await C.ev(`location.href=${JSON.stringify(url)}`);
await sleep(2500);
/* THE START SEQUENCE IS THE DOCUMENTED ONE (docs/DRIVING-THE-GAME.md §3), not a guessed click.
   The first cut of this probe hunted for a button whose text matched /arrgh|start|play/ and got
   NOTHING for 170 seconds — and reported "no battle happened", which is a statement about the
   probe. TWO TRAPS THE DOC ALREADY PAID FOR, both honoured here:
     - `btnNameConfirm` is in the DOM from boot, so waiting on its existence returns instantly and
       the confirm fires before the modal opens, doing nothing. Wait for it to be VISIBLE.
     - the welcome screen runs its own all-bot ATTRACT board on appState.game, so "a game exists"
       is not the signal. Wait for a game with a HUMAN seat in it. */
await C.ev(`localStorage.clear()`);
await C.ev(`location.reload()`);
await sleep(2500);
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);
let started = false;
for (let i = 0; i < 60; i++) {
  started = await C.ev(`(()=>{try{return !!(window.appState&&appState.game&&appState.game.players.some(p=>p.strategy==='human'))}catch(e){return false}})()`) === true;
  if (started) break;
  await sleep(500);
}
console.log("  human seat in the game:", started);
if (!started) {
  /* appState may not be on window; fall back to the rendered board, which is the surface a player
     reads anyway — and say WHICH signal was used rather than pretending they are the same. */
  const board = await C.ev(`!!document.getElementById('pp4Ribbon')`);
  console.log("  (appState not reachable from the page; using the rendered ribbon instead:", board + ")");
  if (!board) { console.log("\n=== NOT RUN — the voyage never started, so nothing was measured."); killAll(); process.exit(1); }
}
console.log("  watcher:", await C.ev(WATCH));
const { DRIVER_SRC } = await import("../mp_rig.mjs");
await C.ev(DRIVER_SRC(url));
console.log("  driving\n");
/* BOUNDED — rule 17. */
for (let i = 0; i < Math.ceil(SECONDS / 2); i++) await sleep(2000);

const log = JSON.parse(await C.ev(`JSON.stringify(window.__w31?window.__w31.log:[])`));
killAll();

const cardFrames = log.filter(r => r.g && r.g.startsWith("card"));
if (!cardFrames.length) {
  console.log(`  ${log.length} regime change(s) recorded, NONE of them showing a battle card.`);
  console.log(`\n=== NOT RUN — no battle happened in ${SECONDS}s, so nothing was measured. That is not a pass.`);
  process.exit(1);
}
console.log(`  ${log.length} regime change(s) over the run; ${cardFrames.length} of them with the battle card on screen\n`);
console.log(`  the sequence, one line per CHANGE (this is the choreography a player sees):`);
log.forEach(r => console.log(`    ${String(r.t).padStart(7)}ms  ${r.g}`));
/* THE VERDICT, NARROWED 2026-09-01 AFTER A REAL FIX CHANGED WHAT THIS NEEDS TO MEASURE.
   The original verdict below (positions.length > 1) could not tell "still uncentred, about to
   snap" from "already centred via transform:translate(-50%,-50%), growing in place" — a box
   anchored by that transform legitimately moves its OWN bounding-rect top as its height changes,
   because the translate is computed against the box's current height every frame. That is a
   DIFFERENT, much milder thing than what Wyatt reported ("it appears for an instant... it moves
   down to centre"), and the position-bucket count alone cannot distinguish them.
   THE PRECISE SIGNATURE OF WHAT HE DESCRIBED, measured 2026-08-30 and confirmed again here: a
   SHOWN battle-card frame with `tr=none` — i.e. `.centered` has not been applied yet, so the box
   is sitting whatever the PREVIOUS prompt left inline (`top=0px inline=0px tr=none`), before a
   later frame clears it (`inline=UNSET tr=yes`). THAT transition — uncentred while visible, then
   centred — is what "painted before it is placed" means, and it is what the 2026-09-01 fix
   (src/ui/stage.js promptTick's `force` parameter) targets. A box that is `tr=yes` on its FIRST
   visible frame and stays `tr=yes` never showed the uncentred state to a player at all, whatever
   its height does afterward. */
const shownFrames = cardFrames.filter(r => / SHOWN /.test(r.g));
const uncentredWhileShown = shownFrames.some(r => /:tr=none/.test(r.g));
const shownPos = shownFrames.map(r => (r.g.match(/ y(-?\d+)/) || [, null])[1]).filter(v => v != null);
const positions = [...new Set(shownPos)];
console.log(`\n  vertical positions the card occupied WHILE VISIBLE: ${positions.length ? positions.map(p => "y" + p).join(", ") : "(never visible)"}`);
console.log(`  was the card ever UNCENTRED (tr=none) on a visible frame: ${uncentredWhileShown}`);
if (!positions.length) {
  console.log(`\n=== NOT RUN — the card was never visible with area, so nothing about its placement was measured.`);
  process.exit(1);
}
const moved = positions.length > 1;
if (moved && !uncentredWhileShown) {
  console.log(`\n=== PASS (with a note) — the card was CENTRED (tr=yes, .centered applied) on every visible frame, never sitting at a stale/uncentred position. Its bounding-rect top still moved (${positions.length} positions) because centring via translate(-50%,-50%) tracks the box's own height, and the height changed while shown — a symmetric grow-in-place, not the "appears elsewhere, then jumps to centre" fault reported. NOT the same defect; if this growth itself looks wrong on screen, that needs a posed screenshot (rule 26), not this gate.`);
  process.exit(0);
}
console.log(moved
  ? `\n=== FAIL — the battle card was UNCENTRED (tr=none) on at least one visible frame and occupied ${positions.length} different vertical positions. It is painted before it is placed, which is exactly what he reported.`
  : `\n=== PASS — the battle card was drawn at one position and stayed there.`);
process.exit(moved ? 1 : 0);
