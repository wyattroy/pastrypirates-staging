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

const PORT = 8518, DBG = 9420;
const SECONDS = Number(process.argv.find(a => a.startsWith("--seconds="))?.split("=")[1] || 180);
const url = serve(PORT);
launch(DBG, "/tmp/chrome-w31");
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
      (r&&vis==="SHOWN")?("y"+Math.round(r.top/20)*20):"-"
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
const distinct = [...new Set(cardFrames.map(r => r.g))];
console.log(`\n  DISTINCT regimes while the battle card was on screen: ${distinct.length}`);
distinct.forEach(g => console.log(`    ${g}`));
console.log(`\n  One beat should be one regime. ${distinct.length > 1 ? "It is not." : "It is."}`);
process.exit(0);
