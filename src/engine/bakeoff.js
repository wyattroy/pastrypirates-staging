// src/engine/bakeoff.js
//
// THE BAKE-OFF — the pure, DOM-free core of the end-of-voyage minigame (v2.1, Wyatt 2026-08-06).
//
// Five mixing bowls on a bench, one per recipe ingredient. They are shuffled; the captain must name
// them in the order the recipe uses them. Get one right and it locks; get one wrong and only the
// unsolved bowls shuffle again next attempt, so the puzzle shrinks until it is solved.
//
// WHY THIS FILE IS SEPARATE FROM THE ENGINE. Every function here is pure: same inputs, same output,
// no DOM, no clock, no storage, and no random source of its own — an `rng` is always passed in, and
// the engine passes `game.r` so a bake replays identically on a host-refresh and in the headless
// simulator. This is the same split the storm rain and the wind dots already use (stormLayerSpecs,
// windDotSpecs): a pure half that can be exercised thousands of times in Node, and a DOM half that
// only animates what the pure half decided. It is also what lets the bot's fallibility be TUNED by
// measurement rather than guessed at.
//
// THE TWO ARRAYS, AND WHY CONFUSING THEM IS THE ONLY REAL HAZARD HERE:
//   order — the recipe's own sequence. order[0] is the ingredient used first.
//   slots — the physical bench. slots[k] is the ingredient hiding under bowl k.
// A guess is an array of BOWL INDICES in recipe order: guess[0] is the bowl the player believes
// holds order[0]. So the attempt is correct at step k when slots[guess[k]] === order[k]. Nothing
// in this file ever compares an ingredient id to a bowl index; if a future edit makes that
// possible, the property tests in scripts/bakeoff_test.js will catch it.  [UNGATED-IN-4: bakeoff_test.js reads the root tree, not this one]

/* ================= building a bake ================= */

// newBake(order) — a fresh bench for one captain. `order` is the recipe's ingredient sequence
// (RECIPE_BOOK's order5, validated at boot to be a permutation of that recipe's own ingredients).
//
// It starts in recipe order, which is NOT the arrangement the player ever sees: scrambleBench()
// below is called immediately, by Game.lightOvens. An earlier version left it in recipe order
// through the study screen on the reasoning that watching a known-good arrangement get scrambled is
// more legible than memorising a random one. That reasoning was wrong in the way that matters
// (Wyatt, 2026-08-08): "The crates currently are starting arranged in the actual order of the
// recipe — this makes tracking them much easier than if they were in a mixed up order." It did not
// make the shuffle legible, it made the whole puzzle three swaps deep, because the study screen WAS
// the answer and the recipe card is on screen the entire time.
export function newBake(order){
  const n=order.length;
  return {order:order.slice(),slots:order.slice(),locked:new Array(n).fill(false),attempts:0,solved:false};
}

/* ================= the shuffle ================= */

// scrambleBench(bake,rng) — a full random permutation of the UNLOCKED crates, applied once when the
// ovens are lit. This is what the player studies.
//
// A FULL PERMUTATION, not more swaps. Swaps from a known-good start are trackable individually; a
// permutation has to be memorised as an arrangement, which is the thing the minigame is actually
// about. shuffleSlots' three swaps then happen ON TOP of an arrangement the player has had to learn.
//
// Locked crates are excluded, so a retry cannot move a crate the player already earned — the same
// invariant shuffleSlots keeps, asserted over both in scripts/bakeoff_test.js.  [UNGATED-IN-4: bakeoff_test.js reads the root tree, not this one]
//
// The rng is passed in, like everything else here, so a bake replays identically. With the bake-off
// off this is never reached (lightOvens returns false before it), so the flag-off stream is
// untouched — bakeoff_baseline.js is the proof.  [UNGATED-IN-4: bakeoff_baseline.js reads the root tree, not this one]
export function scrambleBench(bake,rng){
  const open=[];
  for(let i=0;i<bake.slots.length;i++)if(!bake.locked[i])open.push(i);
  for(let i=open.length-1;i>0;i--){
    const j=Math.floor(rng()*(i+1));
    const a=open[i],b=open[j];
    const t=bake.slots[a];bake.slots[a]=bake.slots[b];bake.slots[b]=t;
  }
  return bake.slots;
}

// shuffleSlots(bake,rng,swaps) — scramble the UNLOCKED bowls and report exactly how.
//
// Returns the swap LIST as well as the new bench, and the UI animates that list rather than
// re-deriving one. If the animation invented its own swaps it could show the player a bench that
// disagrees with the answer they are about to be marked against — a bug that would be invisible
// until somebody lost a bake they had played correctly.
//
// `before` IS PART OF THAT CONTRACT, and the reason it exists is a bug that shipped without it.
// The engine assigns bake.slots = the FINAL bench the instant it shuffles, so a UI that renders
// from bake.slots is already looking at the answer — and then plays the swap animation on top,
// landing on a doubly-shuffled bench. Caught by screenshot at 360px: a bowl badged "step 2 — beat
// in the sugar" was sitting over the vanilla. The animation must START from `before` and ARRIVE at
// `slots`; the invariant that swaps applied in order turn one into the other is asserted in
// scripts/bakeoff_test.js so it cannot rot.  [UNGATED-IN-4: bakeoff_test.js reads the root tree, not this one]
//
// Swaps are drawn only from unlocked positions (rule: a solved bowl never moves again), so the
// puzzle shrinks with every attempt. Two guards matter:
//   - fewer than 2 unlocked bowls  -> nothing can be swapped; returns an empty list rather than
//     spinning. This is the normal end state, not an error.
//   - a swap that would pair a bowl with itself is redrawn, because a "swap" the player cannot see
//     is worse than no swap at all: it silently costs them one of the three they were promised.
export function shuffleSlots(bake,rng,swaps=3){
  const open=[];
  for(let i=0;i<bake.slots.length;i++)if(!bake.locked[i])open.push(i);
  const list=[];
  const before=bake.slots.slice();
  if(open.length<2)return {before,slots:bake.slots.slice(),swaps:list};
  const slots=bake.slots.slice();
  for(let s=0;s<swaps;s++){
    const a=open[Math.floor(rng()*open.length)];
    let b=open[Math.floor(rng()*open.length)];
    let guard=0;
    while(b===a&&guard++<8)b=open[Math.floor(rng()*open.length)];
    if(b===a)continue; // vanishingly unlikely; skip rather than loop forever
    const t=slots[a];slots[a]=slots[b];slots[b]=t;
    list.push([a,b]);
  }
  return {before,slots,swaps:list};
}

/* ================= scoring an attempt ================= */

// scoreAttempt(bake,guess) — mark the captain's answer.
//
// `correct[k]` is true when the bowl they named for step k really does hold order[k]. `perfect` is
// the win condition and is the ONLY thing that ends a voyage — a captain with four of five has not
// baked anything.
//
// Already-locked bowls count as correct without being re-checked, because they were solved on an
// earlier attempt and the UI does not ask about them again. `guess` may therefore carry nulls for
// locked steps; both shapes are accepted so the caller never has to pad.
export function scoreAttempt(bake,guess){
  const n=bake.order.length;
  const correct=new Array(n).fill(false);
  for(let k=0;k<n;k++){
    const bowl=guess[k];
    if(bowl==null){
      // no answer given for this step — only legitimate when it was already solved
      correct[k]=lockedStep(bake,k);
      continue;
    }
    correct[k]=bake.slots[bowl]===bake.order[k];
  }
  return {correct,perfect:correct.every(Boolean)};
}

// Which BOWL currently holds the ingredient used at step k. The bridge between the two arrays, and
// the only place the translation happens.
export function bowlForStep(bake,k){ return bake.slots.indexOf(bake.order[k]); }

// Is step k already solved? A step is locked when the bowl holding its ingredient is locked.
export function lockedStep(bake,k){
  const bowl=bowlForStep(bake,k);
  return bowl>=0&&!!bake.locked[bowl];
}

// applyResult(bake,result) — lock in what they got right and count the attempt.
//
// MUTATES the bake, deliberately: it is per-player state owned by the engine, and copying it here
// would leave the caller holding a stale bench. Locking is by BOWL, not by step, because the bowl is
// the thing that must not move again.
export function applyResult(bake,result){
  for(let k=0;k<bake.order.length;k++){
    if(!result.correct[k])continue;
    const bowl=bowlForStep(bake,k);
    if(bowl>=0)bake.locked[bowl]=true;
  }
  // THE FORCED LAST BOWL. If exactly one bowl is left unlocked, its contents are known by
  // elimination — there is nowhere else the remaining ingredient can be. Locking it here rather
  // than making the captain spend a whole day "guessing" a puzzle with one legal answer: a day is
  // the most expensive thing in this game, and charging one for a non-choice reads as the game
  // wasting your time. It also removes the degenerate case where shuffleSlots has fewer than two
  // bowls to work with and returns an empty swap list, leaving a bench that visibly does not move.
  const open=[];
  for(let i=0;i<bake.locked.length;i++)if(!bake.locked[i])open.push(i);
  if(open.length===1)bake.locked[open[0]]=true;
  bake.attempts++;
  if(bake.locked.every(Boolean))bake.solved=true;
  return bake;
}

// How many bowls are still in play. Drives the UI's "3 of 5 in place" and the narration.
export function unsolvedCount(bake){ return bake.locked.filter(x=>!x).length; }

/* ================= the bot's imperfect memory ================= */

// botGuess(bake,rng,attention) — a bot's answer, made deliberately fallible.
//
// A computer would follow all five bowls perfectly and win every bake on the first attempt, which
// would make the minigame a formality for the player and a certainty for everyone else. So each bowl
// is independently "kept an eye on" with probability `attention`; the ones it lost are randomly
// permuted AMONG THEMSELVES.
//
// This shape was chosen over a flat per-attempt success roll because of what its FAILURES look like.
// Losing track of two bowls transposes exactly those two — the bot ends up four of five, one pair
// swapped, which is precisely how a person fails at this. A flat roll produces either a clean win or
// total noise, and never the "so close" that makes a rival's bake worth watching.
//
// `attention` is tuned by measurement, never picked by eye.
//
// CORRECTED 03-01/TEST-07 — THIS SENTENCE NAMED A SWEEP THAT HAS NEVER EXISTED. It used to read
// "(scripts/bakeoff_tune.js sweeps it against mean attempts to solve)". There is no such file  [UNGATED-IN-4: bakeoff_tune.js has never existed — quoted here as the finding]
// in this repo and `git log -S bakeoff_tune` finds no commit that ever added one — the name arrived
// with the file it describes and was never written. So the claim of a tuning sweep was false from
// the first day, and it is left named here rather than deleted because a comment that promised a
// measurement and delivered none is the finding.
//
// WHAT ACTUALLY TOUCHES `attention` TODAY, measured 2026-08-23: only scripts/bakeoff_test.js  [UNGATED-IN-4: bakeoff_test.js reads the root tree, not this one]
// mentions it anywhere in the repo
// — and it is not in `npm test` either. NOTHING GATES THIS VALUE IN 4/. Re-deriving it is not
// this plan's work; naming the gap is.
export function botGuess(bake,rng,attention){
  const n=bake.order.length;
  // steps still to answer, and the bowls that actually hold them
  const openSteps=[];
  for(let k=0;k<n;k++)if(!lockedStep(bake,k))openSteps.push(k);
  const truth=openSteps.map(k=>bowlForStep(bake,k));
  // which of those did it manage to follow?
  const kept=truth.map(()=>rng()<attention);
  // the lost ones get shuffled among the positions they occupied — Fisher-Yates over the lost subset
  const lostIdx=[];
  for(let i=0;i<kept.length;i++)if(!kept[i])lostIdx.push(i);
  const lostBowls=lostIdx.map(i=>truth[i]);
  for(let i=lostBowls.length-1;i>0;i--){
    const j=Math.floor(rng()*(i+1));
    const t=lostBowls[i];lostBowls[i]=lostBowls[j];lostBowls[j]=t;
  }
  const answer=truth.slice();
  lostIdx.forEach((slotPos,i)=>{answer[slotPos]=lostBowls[i];});
  // expand back to a full-length guess, with nulls where a step was already locked
  const guess=new Array(n).fill(null);
  openSteps.forEach((k,i)=>{guess[k]=answer[i];});
  return guess;
}
