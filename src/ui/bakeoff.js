// src/ui/bakeoff.js
//
// THE BAKE-OFF, on screen. Five mixing bowls on a bench; the captain watches them shuffle, then
// names them back in the recipe's own order.
//
// WHAT THIS FILE IS AND IS NOT. It is a hand-built interaction inside #actionPanel, modelled on
// localPickCell (src/ui/flow.js): build with panel(html,true), wire onclick by hand, resolve a
// promise, and register appState.activePickCleanup so the shot clock can tear it down. It is NOT a
// modal — modals in this game are fire-and-forget (`style.display="flex"`) and cannot block a turn.
//
// THE UI NEVER DECIDES ANYTHING. The engine shuffles (Game.bakeSetup) and the engine scores
// (Game.bakeResolve). This file animates the swap list the engine already applied, collects a
// guess, and then animates the verdict it is handed. That separation is the whole reason the
// animation cannot disagree with the answer — a bug that would be invisible until somebody lost a
// bake they had played correctly.
//
// PERF-01: only `transform` and `opacity` are animated anywhere below. This project has a Safari
// post-mortem about exactly that (a live-composited rain overlay took the board to ~2fps), and the
// rule has held since.

import { appState } from "../state/index.js";
import { ING_IMG, iconImg, CUPCAKE_IMG, COIN_IMG } from "../shared/index.js";
import { recipeTitle, escHtml } from "./recipe.js";
import { recipeSteps } from "../shared/recipe-steps.js";
import { panel, setNeedsAction, GHOST_FADE_MS } from "./panel.js";
// narrationHoldMs — the ONE reading-speed model this game paces every line of words by (D-34/D-45).
// util.js sits BELOW panel.js in the graph (panel.js imports this same function from it, and util.js
// imports neither panel.js nor this file), so this adds no cycle — see the note beside the bake-off's
// export in ./index.js, updated in this same commit.
import { narrationHoldMs } from "./util.js";

const $=(id)=>document.getElementById(id);
// module-local, as every other src/ui/ file keeps its own
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

/* ================= timings ================= */
// PREVIEW is the study window — long enough to place five ingredients spatially, short enough to
// feel like a fairground. SWAP is per swap, and is the number that must stay readable: if a player
// cannot count the swaps the puzzle is not hard, it is arbitrary. REVEAL is per bowl, lifted one at
// a time in recipe order so a run of three correct builds before a miss lands.
// SETTLE is the PAUSE BETWEEN SWAPS: 120 -> 420 -> 700ms, twice on his say-so ("Pause a little
// longer between each bowl shuffle", then "Also, pause longer between", 2026-08-08). At 120 the next
// pair began moving while the eye was still resolving the last, so three swaps read as one blur — a
// swap you cannot separate from its neighbour is not something you can track, only something that
// happens to you. 420 was better and still not enough. This is the number that decides whether the
// puzzle is memory or reflex, so it errs long: three swaps now take about 4.6s, and the player is
// the one who chose to start them.
// PREVIEW_MS is no longer used for the study window (the player presses Ready to bake! instead);
// it survives only as the reduced-motion fallback timing further down.
// SWAP_MS 500 -> 1000 is Wyatt's 2026-08-10 playtester feedback ("the swapping animation is
// really hard to understand and keep track of. Slow the animation motion down 50%"): half speed,
// and the two crates arc over/under each other while crossing (see runSwaps).
const PREVIEW_MS=2500, COVER_MS=280, SWAP_MS=1000, SETTLE_MS=700, REVEAL_MS=520, VERDICT_MS=1300;

/* A-2 (Wyatt, 2026-08-28: "Yes. Build it. Bakeoff IS the game coming to life.") — a BOT's bake now
   plays on every screen through the same watcher choreography a human's bake feeds. The publisher
   (orchestrator's botBakePerform) has to know how long THIS file will spend animating before it may
   send the next moment, and the only way those two can never disagree is for this file to answer
   from the same constants the animation runs on (rule 23: what makes these two agree? — one source).
     benchChoreoMs(spec)  the cover sweep plus every swap-and-settle for the bench this spec
                          describes, plus the ghost allowance playBakeoffLive itself waits out
     BENCH_STUDY_MS       the bot's study window. PREVIEW_MS is not a new number: it is the study
                          window the game itself used before the Ready button existed (rule 9 —
                          derived from what the game already computed, not invented)
     BENCH_BEAT_MS        one beat between published picks. SETTLE_MS is the number this file
                          already defends as what decides whether the bench is trackable or a blur;
                          a pick landing faster than a swap settles would be unreadable by the same
                          argument */
export const BENCH_STUDY_MS=PREVIEW_MS;
export const BENCH_BEAT_MS=SETTLE_MS;
export function benchChoreoMs(spec){
  const locked=spec.locked||[];
  const bowls=(spec.before||[]).length;
  const uncovered=bowls-locked.filter(Boolean).length;   // locked crates take no cover beat
  const swaps=(spec.swaps||[]).length;
  return GHOST_FADE_MS+80+uncovered*COVER_MS+swaps*(SWAP_MS+SETTLE_MS);
}

// Reduced motion is read in JS, not CSS, for the same reason panel() does it: a media query cannot
// reach a setTimeout. It does NOT collapse to zero — the swaps have to stay countable or the game
// becomes unplayable, so they become instant repositions with a visible flash instead.
let reduced=false;
try{
  if(typeof window!=="undefined"&&window.matchMedia){
    const q=window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced=q.matches;
    const onChange=(e)=>{reduced=e.matches;};
    if(q.addEventListener)q.addEventListener("change",onChange);
    else if(q.addListener)q.addListener(onChange);
  }
}catch(err){}

/* ================= the recipe card ================= */
// One line per step: the ordinal, the ingredient's OWN ICON, and the wording. The icon is drawn
// from the same array the answer is built from (recipeSteps().ings), so the card physically cannot
// show an icon that disagrees with what the bowl is hiding — and it is the same art that appears
// under the bowl, which is what makes matching a glance rather than a translation
// (Wyatt, 2026-08-06).
function cardHTML(bake){
  const steps=recipeSteps(bake.order);
  const lines=steps?steps.lines:bake.order.map(()=>"");
  return `<ol class="bkoCard">`+bake.order.map((ing,k)=>
    `<li><b>${k+1}</b>${iconImg(ING_IMG[ing])}<span>${lines[k]||""}</span></li>`).join("")+`</ol>`;
}

/* ================= the bench ================= */
// NAMING, so nobody tidies it: the CSS classes and local variables still say "bowl" (.bkoBowl,
// .bkoDome, bowlForStep) while everything the player sees says CRATE. The rename was Wyatt's
// 2026-08-08 call to match the rest of the game, where a crate is already what ingredients live in;
// renaming the identifiers too would touch the engine's pure core, its property tests and the CSS
// for no player-visible gain. The rule is simply: player-facing strings say crate, code says bowl.
// A bowl is: the ingredient art, a dome that slides down over it, and a badge for the number the
// player assigns. `data-pos` is the bowl's PHYSICAL index and never changes — the swap animation
// moves elements visually and then commits by swapping their contents, so a bowl's identity as
// "position 2 on the bench" is stable for the whole attempt. Anything else and the player's spatial
// memory would be tracking a lie.
// stepOfSlot(order,slots) — for each bench position, the recipe step it holds, 1-based, or null.
// Only ever SHOWN for locked bowls, whose contents are public knowledge.
function stepOfSlot(order,slots){
  const out=new Array(slots.length).fill(null);
  order.forEach((ing,k)=>{ const pos=slots.indexOf(ing); if(pos>=0)out[pos]=k+1; });
  return out;
}

// `slots` is what the bench LOOKS LIKE right now, which during a live attempt is the engine's
// pre-shuffle arrangement (spec.before) — NOT the post-shuffle bench, which the engine has already
// advanced to the answer. See shuffleSlots' own note for what conflating the two shipped. Since
// 04-01 Task 2 the answer is not on this client at all, so the wrong one cannot be reached from
// here even by accident.
function benchHTML(bake,slots){
  // A LOCKED BOWL KEEPS ITS STEP NUMBER ON SHOW. Without it a retry hands the player three solved
  // bowls and no way to tell WHICH steps they solved — measured at 360px, attempt 2 showed
  // cinnamon, flour and milk sitting open with nothing saying those were steps 5, 3 and 1, so the
  // only route to "I still owe 2 and 4" was re-deriving it off the card. The number is the answer
  // the player already earned; making them work it out again is a tax on having done well.
  const step=stepOfSlot(bake.order,slots);
  return `<div class="bkoRow">`+slots.map((ing,pos)=>{
    const lk=bake.locked[pos];
    return `<button class="bkoBowl${lk?" locked":""}" data-pos="${pos}" type="button"
       aria-label="${lk?`Crate ${pos+1}, step ${step[pos]}, already placed`:`Crate ${pos+1}`}">
       <span class="bkoBack"></span>
       <img class="bkoIng" src="${ING_IMG[ing]}" alt="">
       <span class="bkoDome"></span>
       <span class="bkoNum">${lk?step[pos]:""}</span>
     </button>`;}).join("")+`</div>`;
}

/* THE ONE THING THAT WRITES A BADGE ONTO A CRATE (04-01 Task 3, rule 23).
   It was a closure inside the baker's own taps loop; the moment a WATCHER also had to show which
   crates had been named, that closure was about to be copied — and a second badge painter is two
   chances for the two screens to disagree about the same bench. So it is one function, called by
   the baker's paint() and by the watcher's pick stream, and neither knows where its list came from.
   A LOCKED CRATE IS NEVER TOUCHED: its badge is the step number the captain already earned. */
function paintBadges(bowls,openSteps,picks){
  bowls.forEach((b,pos)=>{
    if(b.classList.contains("locked"))return;
    const at=picks.indexOf(pos);
    const num=b.querySelector(".bkoNum");
    if(num)num.textContent=at>=0?String(openSteps[at]+1):"";
    b.classList.toggle("picked",at>=0);
  });
}

// "2", "2 and 4", "2, 4 and 5" — the ordinals of the steps still owed, from 0-based step indices.
function listSteps(steps){
  const n=steps.map(k=>k+1);
  if(n.length<=1)return String(n[0]||"");
  return n.slice(0,-1).join(", ")+" and "+n[n.length-1];
}

// `p` used to be the first argument here and was never read in the body — the whole shell is
// composed from the BAKE, which is the only thing a bench is about. Dropped in 04-01 Task 2, where
// the choreography stopped taking a player at all (see playBakeoffLive).
/* T-25 — whose bake is this?  ONE RULE TAKING THE VIEWER AS ITS INPUT, which DISPLAY-RULES §2
   sanctions explicitly ("a rule that takes the viewer as an input is not two rules") — the same
   shape the captains list already uses. It is NOT a baker branch and a watcher branch: one
   expression, one source of the name, and that name arrived in the shared spec so the two screens
   cannot resolve it differently.  Falls back to the old wording if `baker` is absent, so a bench
   published by an older client still renders a sensible heading rather than "undefined's". */
function bakeTitle(bake,watching){
  const who=bake&&bake.baker;
  if(!who)return "The Bake-Off";
  /* ONE SPAN, NOT THREE. `.bkoHd` is display:flex with gap:6px, so every child is a flex ITEM:
     returning `<span>Name</span>, Yer Bake-Off` made the coloured name one item and the rest an
     anonymous second one, separated by the row gap -- "Davy Probe , Yer Bake-Off", with the comma
     adrift. Caught on the rendered card by bakeoff_surface.mjs, which read the title back as
     "Davy Probe\n, Yer Bake-Off". Wrapping makes the whole heading a single item again. */
  const inner=watching?`${who}'s Bake-Off`:`${who}, Yer Bake-Off`;
  return `<span class="bkoWho">${inner}</span>`;
}
function shellHTML(bake,slots,hint,btnLabel,btnEnabled,watching){
  const att=bake.attempts+1;
  /* THE SAME SHELL FOR A WATCHER (04-01 Task 3, MP-05). Same header, same recipe card, same bench,
     same attempt number — the ONLY difference is that the two controls are absent, because a
     watcher has nothing to answer. That is the whole shape of this convergence: the response
     mechanism is what differs between tiers, never the drawing. */
  return `<div class="bko${watching?" bkoWatching":""}">
    <div class="bkoHd">${iconImg(CUPCAKE_IMG)} ${bakeTitle(bake,watching)}<span class="bkoAtt">attempt ${att}</span></div>
    ${cardHTML(bake)}
    ${benchHTML(bake,slots)}
    <div class="bkoHint" id="bkoHint">${hint}</div>
    ${watching?"":`<div class="bkoBtns">
      <button class="apBtn bkoWatch" id="bkoWatch" type="button" hidden>Watch again ${iconImg(COIN_IMG)}1</button>
      <button class="apBtn bkoGo" id="bkoGo" type="button"${btnEnabled?"":" disabled"}>${btnLabel}</button>
    </div>`}
  </div>`;
}

/* ================= the story beat ================= */

/* ================= the story beat ================= */

// bakeoffIntroCard(bake) — the narration card, and the FIRST SIGHT OF THE RECIPE.
//
// (Wyatt, 2026-08-08: "The narration card should explain that the ingredients are all mixed up and
// you have to use them in the right order. The recipe should also be revealed to you first, in that
// narration screen, before showing you the mixed up bowls.")
//
// The recipe leads and the bowls are not on screen at all yet. That ordering is the whole point:
// the player reads what they are trying to make while nothing is competing for their attention, so
// that when the bench does appear they are matching against something they already hold in their
// head rather than reading two new things at once. It is also the only screen in the minigame with
// no time pressure of any kind — no timer, no clock, nothing moving.
//
// Ordinary panel + button, not the bake-off shell, so it reads as the game's own narrator — the
// voice that has told the whole voyage — rather than as furniture belonging to the puzzle. Pirate
// register, because this is squarely inside the game world.
//
// Playtest 16 (Wyatt: "The recipe is not inside the white narration box, but it should be! In
// fact this whole thing should be on a stage"): the recipe card lives INSIDE .apMsg now, so on
// the centre stage it sits in the white box under the message — and being part of .apMsg means
// the typewriter walks it natively, top to bottom, per the standing reveal-order rule. The DOM
// order is msg -> buttons -> helper, same as localAsk() builds. The stage flag itself is owned
// by playBakeoffLive, which wraps this card and every later phase.
function bakeoffIntroCard(bake){
  return new Promise(res=>{
    // @copy prompt.bakeoff.intro
    // WYATT'S OWN WORDS, 2026-08-08 — he rewrote this himself into the register ("I'm bad at
    // pirate", then two passes fixing my English back into his). His copy is the copy.
    //
    // APOSTROPHES ARE NORMALISED TO STRAIGHT, on his standing instruction: "Ignore my glyphs, I'm
    // writing them in notes and cannot control them. Keep game consistency." He drafts on a phone
    // where Notes substitutes a curly ' automatically, so the glyph in what he sends is an artefact
    // of his keyboard rather than a choice. This file's copy is 41 straight elisions and zero curly,
    // so straight it is — words untouched, and no need to ask again.
    /* THE WARNING MOVED INTO THE MESSAGE, 2026-08-25. Wyatt: "get rid of both … but add the text
       of 'add them in this exact order or it's a ruined mess.' to the text of the bakeoff intro."
       It was the last `.apSub` on this card and the shared helper line is gone everywhere else —
       it is a slab of grey italic set apart from the thing it is warning about, and here it was
       warning about the recipe card sitting directly above it. Same words, same position, now part
       of what the card says instead of a separate register beneath it. HIS WORDS ARE UNTOUCHED:
       the sentence is carried across verbatim, straight apostrophe included, per this block's own
       standing rule two comments up. Note for him rather than a silent edit: the line above already
       says "addin' them in the correct order", so the two sit close together — his call whether to
       tighten, not mine. */
    panel(`<div class="apMsg">${iconImg(CUPCAKE_IMG)} The ovens be roarin'! Yer ingredients be
      waitin'. Ye must bake yer recipe by addin' them in the <b>correct order</b>.<br><br>
      <b>${escHtml(recipeTitle(bake.order))} Recipe</b>
      ${cardHTML(bake)}<br>
      Add them in this exact order or it's a ruined mess.</div>
      <div class="apBtns bkoIntroBtns"><button class="apBtn" id="bkoIntroGo" type="button">Get bakin'!</button></div>`,true);
    const go=$("bkoIntroGo");
    if(!go){res();return;}
    go.onclick=()=>{go.onclick=null;res();};
  });
}

/* ================= the card's exit ================= */

// retireBakeCard() — THE ONE PLACE THE BAKE-OFF CARD LEAVES THE SCREEN (item 6, D-16).
//
// WYATT'S RULING: the card does NOT come back once you have attempted your bake — the attempt is
// locked in and the card has nothing left to offer, and while it is up you cannot see the other
// captains' simultaneous bake-offs.
//
// WHAT A PLAYER WAS ACTUALLY GETTING, measured on a real solo voyage at `?ovens=1` rather than
// inferred from the code (4/scripts/bakeoff_shots.mjs, shots 06 and 08): the shell went up when the
// ovens lit and NEVER LEFT. Twenty-five seconds after the guess resolved it was still on the glass —
// spent, its button greyed to "In the oven…", its own verdict line still reading "2 of 5 in place" —
// with DAY 2 running behind it: three narration lines stacked unreadably in the top-left corner, the
// board dimmed, the captains' holds changing under a card nobody could dismiss. Then attempt 2's
// bench rendered straight into the same box. So "it comes back" understates the fault by a distance:
// it never went away, and the voyage carried on for days behind it.
//
// THIS IS A CONSISTENCY FAULT, NOT A ONE-OFF (CLAUDE.md rule 8). Every other centre-stage card in
// this game already ends itself with exactly these two statements. The bake-off was the only one of
// the four that did not:
//   - localAsk's done()            4/src/ui/flow.js:221   delete pp4Stage; panel("")
//   - dryCeremony's button         4/src/ui/panel.js:1219  delete pp4Stage; panel("")
//   - passGate's hand-off took()   4/src/ui/lobby.js:307   delete pp4Stage; delete pp4Hand; panel("")
// So this invents no mechanism and adds no flag. It makes the fourth card do what its three siblings
// have always done, through the same one call.
//
// NO NEW STATE, DELIBERATELY. "Has this captain attempted their bake?" is already answered by the
// engine — the reveal only ever runs after Game.bakeResolve has scored, so reaching the end of
// bakeoffReveal IS the attempt being spent. A UI-only "hasBaked" flag would be a second copy of a
// fact the engine already holds, kept in step by discipline (rule 23).
//
// GUARDED ON OUR OWN CONTENT. panel("") is a GLOBAL clear of #actionPanel (deferred CLEAR_GRACE_MS,
// so a replacement one statement away cancels it rather than flickering). Fired when the panel has
// already moved on to something else it would take THAT down instead — so it only runs while a .bko
// is still the thing on screen. That is what makes this safe to call from every exit below,
// including the ones that can race a shot-clock forfeit.
function retireBakeCard(){
  delete $("actionPanel").dataset.pp4Stage;
  if(document.querySelector("#actionPanel .bko"))panel("");
}

/* ================= the interaction ================= */

/* playBakeoffLive(spec,io) — the whole human attempt, start to finish, resolving to
   {guess,rewatches}: `guess` is an array of BOWL INDICES in recipe order (guess[k] = the bowl the
   player says holds step k).

   ONE SPEC, AND IT IS THE WHOLE POINT (04-01 Task 2, THE TRACER — rule 23 / DISPLAY-RULES §1).
   This used to take the live player object and the engine's setup, which meant only the machine
   holding the engine could run it. It now takes a plain SPEC — and the same spec is what crosses
   the wire, so the captain baking in another browser runs THIS function, from THIS data, and the
   two screens cannot be paced or aimed differently because they are literally the same code
   reading the same object. That is pickCell()'s tracer pattern applied verbatim (flow.js's
   `const spec={kind:"pick",...}`): one spec, built once, handed to both branches.

     spec.order    the recipe's ingredient sequence — order[k] is the ingredient used at step k
     spec.before   the PRE-SHUFFLE bench: what the player studies, and what the swaps start from
     spec.swaps    the engine's own swap list, animated rather than re-derived (see shuffleSlots)
     spec.locked   per BENCH POSITION, solved on an earlier attempt and never moved again
     spec.attempts how many attempts have already been spent (0 shows the story card)
     spec.cost     the price of one re-watch, so the button can say it without importing a constant

   THE ANSWER IS NOT IN THE SPEC, and that is deliberate rather than incidental. The engine's
   post-shuffle `bake.slots` never appears here: everything this function needs about which steps
   are already solved is recoverable from `before` + `locked`, because a LOCKED BOWL NEVER MOVES
   (scrambleBench and shuffleSlots both draw only from unlocked positions). So
   `before.indexOf(order[k])` lands on a locked bowl exactly when step k is itself locked — the
   same answer `slots.indexOf(order[k])` gave, with no way for a captain to read the solution off
   their own network tab.

   THE RESPONSE MECHANISM IS THE SECOND ARGUMENT, AND IT IS THE ONLY THING THAT DIFFERS BETWEEN
   ONE CLIENT AND ANOTHER (04-01 Task 3, MP-05). `io` is either a BAKER's or a WATCHER's:

     BAKER    { onRewatch, onBench }
              onRewatch(n) spends the coins and returns whether it bought anything, with
              onRewatch.canAfford() greying the button; onBench(patch) publishes the DISCRETE
              MOMENTS only the baker can know — Ready pressed, each pick landing and un-landing, a
              paid replay restarting.
              THERE IS NO `onArm` ANY MORE (04-01 Task 4, MP-13). It existed for one purpose — to
              start the shot clock at the moment the bench became answerable rather than burning
              4.5s of a 30s window on animation — and the bake has no shot clock now. Removing a
              mechanism means removing what fed it.

     WATCHER  { watch }
              The identical sequence, driven by those same moments instead of by taps: crate
              clicks unwired, no re-watch button, no promise to resolve. NOTHING IS STREAMED FRAME
              BY FRAME — the watcher is handed the same spec and runs the same choreography from
              it, so the shuffle they see is the same arcs, the same 1000ms swaps and the same
              700ms settles, drawn by this code. Snapshot-streaming the animation would give
              jump-cuts and a second timing model to keep in step; this gives neither.
              watch.hint      the line under the bench, naming who is baking
              watch.started   resolves when the baker presses Ready
              watch.onPicks   registers a callback for the badge state
              watch.done      resolves when the bake is over (the verdict, or the node clearing)

   THERE IS NO SECOND SWAP LOOP ANYWHERE BELOW, and if a future edit is about to copy one, that is
   the defect this task exists to prevent, not a shortcut. */
export async function playBakeoffLive(spec,io){
  io=io||{};
  const watch=io.watch||null;                 // present => this client is WATCHING, not baking
  const onRewatch=io.onRewatch||null;
  /* EVERY PUBLISHED MOMENT CARRIES THE SAME EPOCH, and getting that wrong is the one way this can
     stutter: a watcher restarts its session when the epoch moves, so a `pick` still stamped with
     the old epoch after a paid replay would restart it again, every tap. `epoch` is bumped exactly
     once per paid replay, by the one line that buys one. */
  let epoch=0;
  const rawBench=io.onBench||function(){};    // a no-op in solo and for a watcher
  const bench=(patch)=>rawBench(Object.assign({epoch},patch));
  const swaps=spec.swaps||[];
  // The shape cardHTML/benchHTML/stepOfSlot have always read. Built from the spec rather than
  // handed in, so this function never touches a live engine object.
  const bake={order:spec.order,locked:(spec.locked||[]).slice(),attempts:spec.attempts||0,baker:spec.baker};
  const n=bake.order.length;
  while(bake.locked.length<n)bake.locked.push(false);

  // Playtest 16 (Wyatt: "the bakeoff itself is still in a yellow action box, which we were
  // supposed to get rid of! It should also happen over the stage"): the WHOLE bake — intro card,
  // study, shuffle, taps and the reveal — plays on the centre stage, board dimmed, exactly like
  // the other ceremonies. The flag (same one localAsk() uses for stage:true options) carries the
  // INTRO card only; the shell stages itself by content (promptTick keys on .bko), which is what
  // ends the stage at the exact moment the post-bake narration replaces it — no flash of the old
  // card style, and a forfeit can never strand the stage. The deletes on the bail-out, teardown
  // and reveal paths below are belts against future re-ordering.
  $("actionPanel").dataset.pp4Stage="1";
  // ...and the box flips to centre mode SYNCHRONOUSLY, before panel() below measures anything:
  // measured under the outgoing radial prompt's CSS (children position:fixed) the intro reads as
  // ~zero-height and the grid clips it invisible for the whole typewriter. Same __pp4 bridge the
  // rest of src/ui/ uses toward stage.js — absent (stage not active) it is a harmless no-op.
  if(window.__pp4&&window.__pp4.stageCenterNow)window.__pp4.stageCenterNow();

  // spec.before, NOT the post-shuffle bench: the engine advances bake.slots to the ANSWER the
  // instant it builds a setup, so rendering from that would preview the solution and then shuffle
  // a second time (see shuffleSlots' own note for the screenshot that caught it). `before` is the
  // only arrangement this function ever draws, and building the spec is where it is chosen.
  const shown=(spec.before||[]).slice();

  // ---- phase 0: THE STORY, before any of the machinery ----
  // (Wyatt, 2026-08-08: "We need more context before the sequence fully starts. Something like a
  // narration card saying that you have your ingredients, now you must combine them in the correct
  // order to bake your recipe.") Only on the FIRST attempt — on a retry he already knows what game
  // he is playing, and a card explaining it again would be in the way.
  // A WATCHER GETS NO STORY CARD. It is the captain's own beat — "ye must bake YER recipe" with a
  // button on it — and a watcher has not stepped up to anything. They join at the bench.
  if(!watch&&bake.attempts===0){
    await bakeoffIntroCard(bake);
  }

  // BUTTON STARTS DISABLED, deliberately. Its click handler is not attached until after the ghost
  // wait below, so for ~0.9s after this renders there is a live-looking button that does nothing —
  // a tap in that window is silently swallowed, which reads as the game ignoring you. Rendering it
  // disabled and enabling it at the exact moment it works removes the dead window instead of hiding
  // it. Found by a probe that clicked at 800ms and hung.
  panel(shellHTML(bake,shown,
    watch?watch.hint:"Study the order. Start the shuffle when yer ready.",
    "Ready to bake!",false,!!watch),true);
  // the shell is in the DOM and carries .bko — from here the content keeps the stage lit, so the
  // intro's flag can go (see the note at the top of this function)
  delete $("actionPanel").dataset.pp4Stage;
  const row=document.querySelector("#actionPanel .bkoRow");
  // The shell rendered but has no bench in it — nothing here is playable, so it is a spent card by
  // definition and leaves through the same one exit as a finished attempt (item 6).
  if(!row){retireBakeCard();return null;}
  const bowls=[...row.querySelectorAll(".bkoBowl")];
  /* T-29 (Wyatt, 2026-08-26): "it seems like the crates are clickable by the watcher (the mouse
     changes cursor) -- if the player tries to click while watching, a tooltip should appear that
     says 'Now yer just watchin''."  The cursor is fixed in CSS (.bkoWatching .bkoBowl); this is the
     answer for a tap that happens anyway. It borrows the hint line the bench already has rather
     than inventing a tooltip, so there is one place the bench speaks and it cannot drift — and it
     restores whatever the hint said before, because that line is load-bearing during a real bake. */
  if(watch){
    const hint=$("bkoHint");
    for(const b of bowls) b.addEventListener("click",()=>{
      if(!hint)return;
      if(hint._t)clearTimeout(hint._t); else hint._was=hint.textContent;
      hint.textContent="Now yer just watchin'";   // his words, exactly
      hint._t=setTimeout(()=>{hint.textContent=hint._was||"";hint._t=null;},1800);
    });
  }

  // MEASURED ONCE, never per frame: the centre-to-centre distance between two bowls, used for the
  // swap translate. Horizontal, so it is a left-to-left distance and the swap animates translateX.
  // These two must be changed together — a vertical build measured pitch off .top; leaving one and
  // not the other yields a pitch of 0 and a shuffle in which nothing visibly moves.
  const pitch=bowls.length>1?(bowls[1].getBoundingClientRect().left-bowls[0].getBoundingClientRect().left):0;

  // ---- phase 0: let the previous line's GHOST finish fading ----
  // panel() clones the outgoing .apMsg and cross-fades it over GHOST_FADE_MS as an absolutely
  // positioned overlay. Every other prompt in the game hides under it harmlessly because
  // typewriterReveal blanks the incoming text until the fade ends — but this shell has no .apMsg to
  // blank, so at 360px the last narration line painted straight across the recipe card and the
  // bench for 800ms. The preview is the one moment the player MUST be able to read the bench, so it
  // does not begin until the ghost is gone. Costs nothing when there is no ghost (a first line, or
  // an explicit clear), and the wait is measured off panel.js's own exported constant rather than a
  // second copy of the duration.
  if(document.querySelector("#actionPanel .apMsg.fadeOut"))await sleep(GHOST_FADE_MS+80);
  {const g0=$("bkoGo"); if(g0)g0.disabled=false;}   // the bench is clean; the button is now real (absent for a watcher)
  // The ghost crates (see .bkoBack) fade up for the study phase, so the ingredients are sitting IN
  // something rather than floating on an empty bench. They go the moment the real crates close over
  // them — from then on the crate the player is tracking is the solid one.
  row.classList.add("bkoStudy");

  // ---- phase 1: THE PLAYER DECIDES WHEN TO START ----
  // (Wyatt, 2026-08-08: "It was REALLY hard!! Don't hide the cups after a few seconds — let the user
  // decide when to start the shuffle sequence by clicking a 'ready to bake!' button.")
  // The 2.5s auto-timer is gone. It was the single biggest source of difficulty and the least fair
  // one: a fixed study window punishes reading speed rather than memory, and it started running
  // while the previous line was still fading over the bench. Untimed here is safe because the shot
  // clock is not armed until the bench is answerable, further down.
  if(watch){
    // The watcher's Ready is the BAKER's Ready, crossing the wire. Same gate, different hand on it.
    bench({phase:"open"});
    await watch.started;
  }else{
    bench({phase:"open"});
    await new Promise(res=>{
      const go=$("bkoGo");
      if(!go){res();return;}
      go.onclick=()=>{go.onclick=null;go.disabled=true;res();};
    });
    bench({phase:"shuffle"});
  }

  // ---- phase 2: crates down, ONE BY ONE, LEFT TO RIGHT ----
  // (Wyatt, 2026-08-10, playtester feedback: "when the player clicks 'ready', animate in the
  // crates 1-by-1 to cover up the ingredients, from left to right.") Each crate's lid rides the
  // existing .26s CSS transition; the stagger is one COVER_MS beat apiece, so the bench closes as
  // a readable sweep instead of one simultaneous slam. Locked crates are already sealed and take
  // no beat. Reduced motion keeps the old instant cover — a forced 1.4s parade is the opposite of
  // what that setting asks for.
  row.classList.remove("bkoStudy");
  await coverBench();

  // The left-to-right sweep, shared by the first cover and every paid rewatch so the bench always
  // closes with the same grammar.
  async function coverBench(){
    if(reduced){
      bowls.forEach(b=>{ if(!b.classList.contains("locked"))b.classList.add("covered"); });
      await sleep(60);
      return;
    }
    for(const b of bowls){
      if(b.classList.contains("locked"))continue;
      b.classList.add("covered");
      await sleep(COVER_MS);
    }
  }

  // ---- phase 3: the swaps, one at a time ----
  await runSwaps();

  async function runSwaps(){
  for(const [a,b] of swaps){
    const A=bowls[a],B=bowls[b];
    if(!A||!B)continue;
    if(reduced){
      A.classList.add("flash");B.classList.add("flash");
      await sleep(340);
      A.classList.remove("flash");B.classList.remove("flash");
    }else{
      const d=(b-a)*pitch;
      /* THE ARC (Wyatt, 2026-08-10, confirmed in his words before building: "move up/down
         vertically smoothly in an arc as they travel — not linearly — reaching the apex at the
         halfway point of their travel before vertically moving back down to baseline as they
         complete their journey"). One continuous tossed-ball path: the crate leaves its seat
         level with the row, curves up (right-mover) or down (left-mover), peaks at 30% of its
         height exactly at mid-travel — precisely where the two crates pass, so the separation is
         greatest at the only moment they could overlap — and lands already level at its new
         seat. Horizontal keeps the old cubic ease; vertical rides a half-sine; both are baked
         into sampled keyframes because no single CSS easing can draw a curve that comes back to
         where it started. Still transform-only (PERF-01). The old two-stage version (climb the
         whole way, then drop level in a separate step) is gone with it. */
      /* T-27 (Wyatt, 2026-08-26): "the crates are visible moving behind the green 'correct crate'
         square. this looks messy. the crates should move in front of the green 'correct' squares
         so it looks like the correct guesses are locked in, behind."

         The two travelling bowls are SIBLINGS of the ones standing still, so in a flat flex row
         they paint in DOM order — a crate swapping past a solved bowl went behind it. Raising the
         pair for the length of the swap says the right thing about the game: what is settled stays
         put and stays back, what is in play moves over the top of it. Removed on commit below, so
         nothing carries a stacking context it no longer needs. */
      A.classList.add("bkoSwapping");B.classList.add("bkoSwapping");
      const lift=A.getBoundingClientRect().height*0.3;
      const peakA=d>0?-lift:lift;
      const easeIO=u=>u<0.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
      const arc=(dx,peak)=>Array.from({length:25},(_,k)=>{
        const u=k/24;
        return {transform:`translate(${dx*easeIO(u)}px,${peak*Math.sin(Math.PI*u)}px)`};
      });
      if(A.animate){
        const aA=A.animate(arc(d,peakA),{duration:SWAP_MS,easing:"linear",fill:"forwards"});
        const aB=B.animate(arc(-d,-peakA),{duration:SWAP_MS,easing:"linear",fill:"forwards"});
        await sleep(SWAP_MS);
        // commit first (below), then release the fills — same invisible reconcile as ever:
        // the crate sits at (d,0), the contents swap, the effect drops away, same pixels.
        A._bkoAnim=aA;B._bkoAnim=aB;
      }else{
        // no Web Animations API (very old WebKit): the pre-arc flat slide, still legible
        A.style.transition=`transform ${SWAP_MS}ms ease-in-out`;
        B.style.transition=`transform ${SWAP_MS}ms ease-in-out`;
        A.style.transform=`translateX(${d}px)`;
        B.style.transform=`translateX(${-d}px)`;
        await sleep(SWAP_MS);
      }
    }
    // COMMIT by swapping the two bowls' CONTENTS, then clearing the transform. The elements stay
    // where they are in the DOM, so `data-pos` keeps meaning "this place on the bench" and the next
    // swap's arithmetic stays trivial. (FLIP-lite: animate, then reconcile.)
    const ia=A.querySelector(".bkoIng"),ib=B.querySelector(".bkoIng");
    const t=ia.getAttribute("src");ia.setAttribute("src",ib.getAttribute("src"));ib.setAttribute("src",t);
    if(A._bkoAnim){A._bkoAnim.cancel();A._bkoAnim=null;}
    if(B._bkoAnim){B._bkoAnim.cancel();B._bkoAnim=null;}
    A.style.transition="";B.style.transition="";
    A.style.transform="";B.style.transform="";
    A.classList.remove("bkoSwapping");B.classList.remove("bkoSwapping");   // T-27
    await sleep(reduced?40:SETTLE_MS);
  }
  }

  // Write an arrangement straight onto the bench. Used to rewind to the pre-shuffle bench before a
  // paid replay — simpler and safer than un-applying the swap list in reverse, and it cannot drift
  // from `before` because it IS `before`.
  function paintBench(arr){
    bowls.forEach((b,i)=>{ const img=b.querySelector(".bkoIng"); if(img&&arr[i])img.setAttribute("src",ING_IMG[arr[i]]); });
  }

  // ---- phase 4: take taps ----
  // This used to arm the shot clock, HERE rather than at prompt time, so that ~4.5s of preview and
  // shuffle did not eat a sixth of a 30s window. Wyatt removed the clock from the bake outright on
  // 2026-08-18 — the finish line gets as long as it needs — so the arming went with it (Task 4).
  const guess=new Array(n).fill(null);
  /* Steps already solved on an earlier attempt are not asked about again.
     READ OFF `shown`, NOT THE ENGINE'S ANSWER (04-01 Task 2). This used to index bake.slots — the
     post-shuffle arrangement, i.e. the solution — and that single line was the only thing in the
     whole choreography that needed it. It is EXACTLY equivalent: a locked bowl never moves, so
     `shown[j] === slots[j]` at every locked j; `shown.indexOf(order[k])` therefore lands on a
     locked bowl precisely when step k is locked, and on some unlocked bowl otherwise. Same result,
     and the answer no longer has to exist on this client at all — which is what lets the identical
     function run in the baker's own browser. */
  const openSteps=[];
  for(let k=0;k<n;k++){
    const solvedBowl=shown.indexOf(bake.order[k]);
    if(solvedBowl>=0&&bake.locked[solvedBowl])guess[k]=solvedBowl; else openSteps.push(k);
  }

  const hint=$("bkoHint");
  // On a retry the instruction "tap in recipe order" is true but unhelpful — the order that remains
  // is 2 then 4, not 1 to 5, and saying so is the difference between the player counting and the
  // player playing.
  if(hint)hint.textContent=watch?watch.hint
    :openSteps.length===n
    ?"Tap the crates in recipe order. Tap again to undo."
    :`${openSteps.length} left — tap them for step${openSteps.length>1?"s":""} ${listSteps(openSteps)}. Tap again to undo.`;

  /* ---- THE WATCHER'S HALF OF PHASE 4 (04-01 Task 3, MP-05) ----
     Everything above ran identically. What a watcher does not have is a hand on the bench: no
     shot clock to arm (they are not being asked anything), no crate handlers, no confirm button,
     and no promise for the engine to wait on. What they DO get is the badges appearing as the
     baker names each crate — the same paintBadges() the baker's own screen uses, driven by the
     pick list off the wire instead of by clicks. */
  if(watch){
    setNeedsAction(false);
    watch.onPicks(picks=>paintBadges(bowls,openSteps,picks||[]));
    if(watch.picksNow)paintBadges(bowls,openSteps,watch.picksNow());
    await watch.done;
    /* THE CARD STILL LEAVES THROUGH THE ONE EXIT (item 6 / D-16). bakeoffReveal calls
       retireBakeCard itself, so this only fires on the paths it did NOT run: the bench node
       cleared, or the captain being watched dropped out. Without it a watcher is left holding a
       covered bench for the rest of the voyage — the exact fault item 6 was written for, one tier
       over.
       BOTH FLAGS ARE SET SYNCHRONOUSLY BEFORE `done` RESOLVES, which is the only thing that makes
       this safe: `revealed` stops it destroying the verdict animation, and `superseded` stops it
       destroying the NEXT session's bench when a paid replay restarts the watch. The second was
       measured — a watching captain lost their bench the moment the baker bought another look. */
    if(!watch.revealed&&!watch.superseded)retireBakeCard();
    return null;
  }

  setNeedsAction(true);
  // The same button served as "Ready to bake!"; it becomes the confirm control now, disabled until
  // every open step has been assigned.
  const goBtn=$("bkoGo");
  if(goBtn){goBtn.textContent="Bake it!";goBtn.disabled=true;}

  let rewatches=0;                        // paid replays, logged so a resume charges the same coins

  return await new Promise(resolve=>{
    const picks=[];                       // bowl indices, in the order tapped
    const go=$("bkoGo");
    const watch=$("bkoWatch");

    /* PAY FOR ANOTHER LOOK (Wyatt, 2026-08-08). The button is revealed only now, with the input —
       there is nothing to re-watch before the shuffle has run once, and it must never compete with
       "Ready to bake!" for the same tap.

       IT CANNOT CHANGE THE ANSWER. It repaints the bench to spec.before and replays spec.swaps —
       the engine's own list, the same one already applied — so a replay is a recording, not a
       re-shuffle.

       THE ORDERING NUMBERS CLEAR when the shuffle restarts (Wyatt, 2026-08-08: "The ordering numbers
       that appear when i tap the bowls stayed visible when i paid to rewatch the shuffle. They
       should not. They should disappear when the shuffle restarts."). An earlier version kept them
       on the reasoning that you bought a second look rather than a reset — but a number pinned to a
       bowl while that bowl is visibly moving is an anchor to a reading you are in the middle of
       replacing, and it is on screen at exactly the moment you are trying to see the bench fresh.
       A rewatch is a fresh read, so the bench presents itself fresh.

       The coin is spent through the engine (onRewatch), not deducted here, because coins are game
       state that the end-of-voyage ranking reads. If the purse is empty the engine buys nothing and
       returns 0, and no animation runs — so the button can never hand out a free look. */
    let replaying=false;
    const paintButtons=()=>{
      if(!watch)return;
      watch.hidden=false;
      watch.disabled=replaying||!(onRewatch&&onRewatch.canAfford&&onRewatch.canAfford());
    };
    if(watch)watch.onclick=async()=>{
      if(replaying)return;
      if(!(onRewatch&&onRewatch(1)))return;   // engine says no coins — nothing spent, nothing shown
      rewatches++;
      replaying=true;
      // A PAID REPLAY RESTARTS THE SHUFFLE FOR EVERYONE. `epoch` is what tells a watcher this is a
      // new run of the same swaps rather than a snapshot it has already seen, so its own session
      // restarts and it watches the replay too — through this same function, from this same spec.
      epoch=rewatches;
      bench({phase:"shuffle"});
      picks.length=0;                    // the tapped numbers go with the restart, badges and all
      paint();                           // repaints every badge empty and re-disables Bake it!
      if(go)go.disabled=true;
      paintButtons();
      const hintEl=$("bkoHint");
      const was=hintEl?hintEl.textContent:"";
      if(hintEl)hintEl.textContent="Watch closely — the crates move again.";
      paintBench(shown);
      row.classList.add("bkoStudy");
      bowls.forEach(b=>{ if(!b.classList.contains("locked"))b.classList.remove("covered"); });
      /* T-28 (Wyatt, 2026-08-26) IS THIS LINE, AND IT IS DELIBERATELY NOT FIXED YET: "after
         hitting 'watch again' the crates cover the ingredients too fast. instead, watch again
         should trigger the same pattern as before, where you can study the crates as long as you
         want and say 'i'm ready'."

         He is right, and the asymmetry is plain: phase 1 above deleted its 2.5s auto-timer on his
         own 2026-08-08 ruling ("Don't hide the cups after a few seconds — let the user decide when
         to start"), and a PAID look still runs on a fixed 900ms clock. The player buys a second
         read and gets less time than the free one.

         WHY IT IS NOT A ONE-LINE SWAP, and why nobody should make it one. A watcher runs THIS SAME
         function from the published bench phases (epoch restarts its session). Replacing this sleep
         with a Ready-button wait on the baker's screen alone would leave the watcher covering on
         the old clock while the baker is still studying — a baker and a watcher watching different
         benches, which is precisely the divergence class this whole playtest is about. Creating one
         while fixing his list would be worse than the wait.

         THE CORRECT FIX, scoped so it is not re-derived: a rewatch must publish `{phase:"open"}`
         and wait, exactly as phase 1 does — baker on its own Ready click, watcher on
         `watch.started` — and only then publish `{phase:"shuffle"}` and cover. That needs
         `watch.started` re-armable per epoch, which it is not today (it is a promise resolved
         once). One protocol change, one re-armable gate, and it must be seen in two browsers
         before it is believed. */
      await sleep(reduced?400:900);
      row.classList.remove("bkoStudy");
      await coverBench();
      await runSwaps();
      if(hintEl)hintEl.textContent=was;
      replaying=false;
      paintButtons();
      paint();
    };
    const paint=()=>{
      paintBadges(bowls,openSteps,picks);
      if(go)go.disabled=replaying||picks.length!==openSteps.length;
      paintButtons();
      // THE PICKS ARE A DISCRETE MOMENT, not animation — a player decision, so it crosses the wire
      // (04-01 Task 3). Every landing AND un-landing, because "tap again to undo" is a decision too
      // and a watcher left holding a badge the baker has taken back is watching a different bench.
      bench({phase:"pick",picks:picks.slice()});
    };
    const finish=()=>{
      appState.activePickCleanup=null;
      setNeedsAction(false);
      // SPENT THE MOMENT THE GUESS LEAVES. bakeoffReveal greys it too, but on a remote captain's
      // screen the verdict has to travel to the host and back first, and a live "Bake it!" sitting
      // on a decision that has already resolved is an invitation to press it again (the same
      // reasoning bakeoffReveal's own note gives for greying it at all).
      if(go){go.disabled=true;}
      openSteps.forEach((k,i)=>{guess[k]=picks[i];});
      if(watch)watch.hidden=true;
      resolve({guess,rewatches});
    };
    // Teardown, registered the way every hand-built prompt in this file registers one. It was the
    // SHOT CLOCK's hook until Task 4 took the clock off the bake; nothing forces a bench closed on
    // a timer any more, and it is kept because it is the standing contract for abandoning a prompt's
    // DOM — it stops handlers leaking and drops the stage flag, or an abandoned bake would leave the
    // next ordinary prompt playing centre stage.
    appState.activePickCleanup=()=>{appState.activePickCleanup=null;setNeedsAction(false);
      delete $("actionPanel").dataset.pp4Stage;};

    bowls.forEach((b,pos)=>{
      if(b.classList.contains("locked"))return;
      b.onclick=()=>{
        if(replaying)return;              // the bench is mid-animation; a tap now means nothing
        const at=picks.indexOf(pos);
        if(at>=0)picks.splice(at,1);          // tap again to undo, and everything after renumbers
        else if(picks.length<openSteps.length)picks.push(pos);
        paint();
      };
    });
    if(go)go.onclick=()=>{ if(!replaying&&picks.length===openSteps.length)finish(); };
    paint();
  });
}

/* bakeoffReveal(view,result) — phase 5. Called AFTER the engine has scored, and animates its
   verdict: crates lift one at a time in recipe order, each stamped right or wrong, then the
   correct ones settle into their lock.

   IT TAKES A PLAIN VIEW NOW, NOT THE LIVE PLAYER (04-01 Task 3). `view` is {order,slots} — the
   recipe's sequence and the FINAL bench, which stops being a secret the instant the crates come
   off. That is what lets EVERY captain run this: the baker on their own bench, a watcher on the
   bench they have been watching, the host on either. One broadcast, one renderer, and nobody is
   shown a verdict computed on their own machine.

   IT RENDERS ONTO WHATEVER BENCH IS ON SCREEN and returns quietly if there is none — which is the
   correct behaviour for a captain whose card has already gone, and the reason this is safe to call
   from a broadcast handler rather than only from the turn loop. */
export async function bakeoffReveal(view,result){
  const bake=view;
  const row=document.querySelector("#actionPanel .bkoRow");
  // Nothing left to reveal onto — the attempt is still spent, so the card still leaves (item 6).
  if(!row){retireBakeCard();return;}
  const bowls=[...row.querySelectorAll(".bkoBowl")];
  const hint=$("bkoHint");
  // The confirm button is spent — the guess is already scored. Left live it stayed fully enabled and
  // clickable right through the reveal (visible in the 360px screenshot), inviting a second press on
  // a decision that has already resolved.
  const go=$("bkoGo");
  if(go){go.disabled=true;go.textContent="In the oven…";}
  if(hint)hint.textContent="Opening the crates…";
  for(let k=0;k<bake.order.length;k++){
    const bowl=bake.slots.indexOf(bake.order[k]);
    const el=bowls[bowl];
    if(!el)continue;
    /* T-32 (his checklist #22b) — A CRATE ALREADY SOLVED HAS NOTHING TO REVEAL, SO IT COSTS NOTHING.
       Wyatt, from a second attempt with two crates left: "the 1st turned pink instantly, then the
       5th lagged as if 2, 3 and 4 were being revealed invisibly." That is exactly what it was.

       A locked bowl is never `covered` (see the reveal-cover pass in playBakeoffLive), so this loop
       was removing a class it does not have, restamping a number it already shows, and then pausing
       a full REVEAL_MS in front of a crate that visibly did not change. MEASURED before the fix, by
       posing a five-step bench with three locked and timing the whole reveal: 0 locked -> 6309ms,
       3 locked -> 6310ms. Identical. 1561ms — 3 x 520 — spent on nothing, which is his "lagged as
       if 2, 3 and 4 were being revealed" to the millisecond.

       THE PAUSE IS THE REVEAL. It exists to let a player watch one crate be judged before the next
       is, so it belongs only to a crate whose state actually changes on screen. The classes are
       still written for the locked ones — they are already right, and writing them keeps this loop
       one path rather than two (rule 23) — but the beat is not spent.

       Read from the DOM rather than from a `locked` array because `view` is {order,slots} and does
       not carry one; the bowl itself is the thing that knows, and it is the same class the cover
       pass keys on, so the two cannot disagree about what "locked" means. */
    const alreadyLocked=el.classList.contains("locked");
    el.classList.remove("covered","picked");
    // Stamp the step number as the bowl comes off. A row of green and pink outlines says HOW MANY
    // landed but not WHICH — and "which" is the only thing the player can act on next attempt.
    const num=el.querySelector(".bkoNum");
    if(num)num.textContent=String(k+1);
    el.classList.add(result.correct[k]?"right":"wrong");
    if(alreadyLocked)continue;
    await sleep(reduced?Math.round(REVEAL_MS*0.5):REVEAL_MS);
  }
  if(hint){
    const got=result.correct.filter(Boolean).length;
    hint.textContent=result.perfect?"Every crate in its place — ye baked it!"
      :`${got} of 5 in place. Those stay put; the rest get shuffled again tomorrow.`;
  }
  // THE VERDICT'S HOLD IS SIZED BY ITS OWN WORDS, and it has to be now that the card LEAVES at the
  // end of it. Until this change the flat VERDICT_MS did not have to be long enough to read by —
  // the card stood on screen indefinitely, so a slow reader simply kept looking. Retiring the card
  // makes this hold the ENTIRE reading window, which turns a fixed number into a price list standing
  // in for a reading time: it would hand "2 of 5 in place. Those stay put; the rest get shuffled
  // again tomorrow." (70 characters) the same beat as "Every crate in its place — ye baked it!" (39).
  // CLAUDE.md rule 9 — derive it from something the game already computes.
  //
  // narrationHoldMs() IS that thing: the one reading-speed model every line of narration in this game
  // is paced by (D-34/D-45), reused rather than re-derived, so the bake's verdict and a narration
  // sentence can never disagree about how long the same words take to read (rule 23).
  //
  // VERDICT_MS SURVIVES AS THE FLOOR, so nothing that already shipped gets shorter — only a longer
  // verdict gains. It also covers the fast-forward branch: narrationHoldMs returns 0 when appState.ff
  // is set, which is unreachable here anyway (bakeoffPrompt awaits ffEndNow() before a human's bake
  // begins), but a floor means that never has to be re-reasoned about from this end.
  await sleep(Math.max(VERDICT_MS,narrationHoldMs(hint?hint.textContent:"")));
  // ...AND THE CARD GOES. This line is item 6. The old comment here called the stage-flag delete a
  // "belt only", on the stated expectation that "the stage itself ends when the narration that
  // follows replaces the .bko content (see promptTick)" — measured 2026-08-22, that replacement never
  // happens: narration in this game draws into its own bubble, not into #actionPanel, so nothing
  // downstream was ever going to take this card down. See retireBakeCard's note for what that looked
  // like on screen.
  retireBakeCard();
}
