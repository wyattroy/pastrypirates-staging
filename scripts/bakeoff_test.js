#!/usr/bin/env node
// scripts/bakeoff_test.js
//
// Property tests for the bake-off's pure core (v2/src/engine/bakeoff.js).
//
// WHY PROPERTIES RATHER THAN EXAMPLES. Every failure mode this minigame has is SILENT. A shuffle
// that moves a locked bowl, a score that marks a right answer wrong, a bot that is secretly
// infallible — none of them throw. They just make the game quietly unfair, and the only way anyone
// would notice is by losing a bake they played correctly and not being able to prove it. So each
// test below asserts an invariant over hundreds of random benches, not one hand-picked case.
//
// Run: node scripts/bakeoff_test.js

import { mulberry32 } from "../v2bakeoff/src/shared/index.js";
import { newBake, scrambleBench, shuffleSlots, scoreAttempt, applyResult, botGuess,
         bowlForStep, lockedStep, unsolvedCount } from "../v2bakeoff/src/engine/bakeoff.js";

const ING=["wheat","dairy","sugar","eggs","cocoa","spice","vanilla"];
let failures=0;
function check(name,ok,detail){
  if(ok){console.log("PASS "+name);return;}
  failures++;console.log("FAIL "+name+(detail?"  — "+detail:""));
}
// a random 5-ingredient recipe order
function anyOrder(rng){
  const c=ING.slice();
  for(let i=c.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=c[i];c[i]=c[j];c[j]=t;}
  return c.slice(0,5);
}
// the guess a player with a perfect memory would make
function perfectGuess(bake){ return bake.order.map((_,k)=>bowlForStep(bake,k)); }

/* ---- 1. a perfect guess always scores 5/5, on any bench, at any stage ---- */
{
  let bad=null;
  for(let s=1;s<=400&&!bad;s++){
    const rng=mulberry32(s);
    const bake=newBake(anyOrder(rng));
    const {slots}=shuffleSlots(bake,rng,3);bake.slots=slots;
    const r=scoreAttempt(bake,perfectGuess(bake));
    if(!r.perfect)bad="seed "+s+" order="+bake.order+" slots="+bake.slots;
  }
  check("a perfect guess always scores perfect",!bad,bad);
}

/* ---- 2. the bench is always a permutation of the recipe — no ingredient lost or duplicated ---- */
{
  let bad=null;
  for(let s=1;s<=400&&!bad;s++){
    const rng=mulberry32(s);
    const bake=newBake(anyOrder(rng));
    for(let a=0;a<6&&!bad;a++){
      const {slots}=shuffleSlots(bake,rng,3);bake.slots=slots;
      const sortedA=bake.slots.slice().sort().join("|"),sortedB=bake.order.slice().sort().join("|");
      if(sortedA!==sortedB)bad="seed "+s+" attempt "+a+" bench="+bake.slots;
      applyResult(bake,scoreAttempt(bake,botGuess(bake,rng,0.6)));
    }
  }
  check("the bench stays a permutation of the recipe",!bad,bad);
}

/* ---- 3. a LOCKED bowl never moves again. This is the rule the whole design rests on ---- */
{
  let bad=null;
  for(let s=1;s<=400&&!bad;s++){
    const rng=mulberry32(s);
    const bake=newBake(anyOrder(rng));
    let {slots}=shuffleSlots(bake,rng,3);bake.slots=slots;
    for(let a=0;a<8&&!bad;a++){
      applyResult(bake,scoreAttempt(bake,botGuess(bake,rng,0.55)));
      if(bake.solved)break;
      const beforeLocked=bake.slots.map((v,i)=>bake.locked[i]?v:null);
      const out=shuffleSlots(bake,rng,3);bake.slots=out.slots;
      for(let i=0;i<bake.slots.length;i++){
        if(beforeLocked[i]!==null&&bake.slots[i]!==beforeLocked[i])
          bad="seed "+s+" attempt "+a+" bowl "+i+" was locked holding "+beforeLocked[i]+" but now holds "+bake.slots[i];
      }
      // and no swap may even NAME a locked bowl
      for(const [x,y] of out.swaps)
        if(bake.locked[x]||bake.locked[y])bad=bad||("seed "+s+" swap touched a locked bowl "+[x,y]);
    }
  }
  check("a locked bowl never moves, and no swap names one",!bad,bad);
}

/* ---- 4. the puzzle never grows: unsolved count is monotonically non-increasing ---- */
{
  let bad=null;
  for(let s=1;s<=400&&!bad;s++){
    const rng=mulberry32(s);
    const bake=newBake(anyOrder(rng));
    let {slots}=shuffleSlots(bake,rng,3);bake.slots=slots;
    let prev=unsolvedCount(bake);
    for(let a=0;a<10&&!bad;a++){
      applyResult(bake,scoreAttempt(bake,botGuess(bake,rng,0.55)));
      const now=unsolvedCount(bake);
      if(now>prev)bad="seed "+s+" attempt "+a+" unsolved went "+prev+" -> "+now;
      prev=now;
      if(bake.solved)break;
      bake.slots=shuffleSlots(bake,rng,3).slots;
    }
  }
  check("the unsolved set never grows",!bad,bad);
}

/* ---- 5. every bake terminates. With one bowl left it is forced; the loop must always converge ---- */
{
  let worst=0,stuck=null;
  for(let s=1;s<=600&&!stuck;s++){
    const rng=mulberry32(s);
    const bake=newBake(anyOrder(rng));
    bake.slots=shuffleSlots(bake,rng,3).slots;
    let a=0;
    while(!bake.solved&&a<60){
      applyResult(bake,scoreAttempt(bake,botGuess(bake,rng,0.55)));
      a++;
      if(!bake.solved)bake.slots=shuffleSlots(bake,rng,3).slots;
    }
    if(!bake.solved)stuck="seed "+s+" still unsolved after 60 attempts";
    if(a>worst)worst=a;
  }
  check("every bake terminates (worst case "+worst+" attempts)",!stuck,stuck);
}

/* ---- 6. attention=1 is infallible, attention=0 never keeps a bowl by design ---- */
{
  let perfectAlways=true,zeroLucky=0,zeroTotal=0;
  for(let s=1;s<=300;s++){
    const rng=mulberry32(s);
    const bake=newBake(anyOrder(rng));
    bake.slots=shuffleSlots(bake,rng,3).slots;
    if(!scoreAttempt(bake,botGuess(bake,rng,1)).perfect)perfectAlways=false;
    const b2=newBake(anyOrder(rng));
    b2.slots=shuffleSlots(b2,rng,3).slots;
    zeroTotal++;
    if(scoreAttempt(b2,botGuess(b2,rng,0)).perfect)zeroLucky++;
  }
  check("attention 1.0 solves every bake first try",perfectAlways);
  // a blind guess at 5 bowls is a random permutation: 1/120 chance of being right by luck.
  // The point of this check is that it is LOW, not that it is zero — zero would mean the bot is
  // being prevented from guessing right, which is a different (and wrong) behaviour.
  check("attention 0 is blind luck only ("+zeroLucky+"/"+zeroTotal+", expect ~2-3)",zeroLucky<=12,
        zeroLucky+" of "+zeroTotal+" is too many for a blind guess");
}

/* ---- 7. determinism: the same seed must reproduce the same bake, or replay breaks ---- */
{
  const run=()=>{
    const rng=mulberry32(12345);
    const bake=newBake(["sugar","eggs","vanilla","cocoa","wheat"]);
    const out=[];
    for(let a=0;a<5;a++){
      const sh=shuffleSlots(bake,rng,3);bake.slots=sh.slots;
      out.push(sh.swaps.map(p=>p.join("-")).join(","));
      const g=botGuess(bake,rng,0.6);
      out.push(g.join("/"));
      applyResult(bake,scoreAttempt(bake,g));
      if(bake.solved)break;
    }
    return out.join(" | ");
  };
  const a=run(),b=run();
  check("same seed reproduces the same bake exactly",a===b,a!==b?("\n  A: "+a+"\n  B: "+b):"");
}

/* ---- 8. THE ANIMATION CONTRACT: before + swaps, applied in order, must equal slots ----

   This is the invariant a shipped bug violated. The UI draws the bench from `before`, plays each
   swap, and the player is then marked against `slots`. If replaying the swap list does not land
   exactly on `slots`, the bowls on screen disagree with the answer — and the player only finds out
   by losing a bake they played correctly. Nothing else in this file would notice: `slots` alone is
   internally consistent, which is precisely why the bug survived the first seven checks.

   Also asserts locked bowls hold still, since the UI relies on that to keep their badges valid. */
{
  const rng=mulberry32(909);
  let mismatches=0,lockMoves=0,trials=0,withLocks=0;
  for(let t=0;t<600;t++){
    const bake=newBake(["sugar","eggs","vanilla","cocoa","wheat"]);
    // walk a real multi-attempt bake so later rounds are exercised with locks in place
    for(let a=0;a<5;a++){
      const sh=shuffleSlots(bake,rng,3);
      trials++;
      if(bake.locked.some(Boolean))withLocks++;
      const replay=sh.before.slice();
      for(const [i,j] of sh.swaps){const tmp=replay[i];replay[i]=replay[j];replay[j]=tmp;}
      if(replay.join()!==sh.slots.join())mismatches++;
      for(let i=0;i<bake.locked.length;i++)if(bake.locked[i]&&sh.before[i]!==sh.slots[i])lockMoves++;
      bake.slots=sh.slots;
      const g=botGuess(bake,rng,0.55);
      applyResult(bake,scoreAttempt(bake,g));
      if(bake.solved)break;
    }
  }
  check("replaying `swaps` over `before` lands exactly on `slots` ("+trials+" shuffles, "+withLocks+" with locks)",
        mismatches===0,mismatches+" shuffles ended somewhere other than the scored bench");
  check("locked bowls never move during a shuffle",lockMoves===0,lockMoves+" locked bowls moved");
}

/* ---- 9. THE OPENING SCRAMBLE: what the player studies is not the recipe ----

   The bench used to start in recipe order, so the study screen WAS the answer and the puzzle was
   only ever the three swaps on top of it. scrambleBench fixes that, and these pin the two things it
   must not break: the bench stays the same five ingredients, and a locked crate never moves. */
{
  const rng=mulberry32(31337);
  let notPerm=0,lockMoved=0,identical=0,trials=0;
  for(let t=0;t<2000;t++){
    const bake=newBake(anyOrder(rng));
    const before=bake.slots.slice();
    scrambleBench(bake,rng);
    trials++;
    if(bake.slots.slice().sort().join("|")!==bake.order.slice().sort().join("|"))notPerm++;
    if(bake.slots.join("|")===before.join("|"))identical++;
  }
  check("the opening scramble keeps the bench a permutation of the recipe",notPerm===0,notPerm+" benches lost or duplicated an ingredient");
  // 1/120 of random permutations are the identity, so a handful is expected and zero would mean the
  // scramble is being prevented from landing on recipe order — a different, wrong behaviour.
  check("it does land somewhere other than recipe order ("+identical+"/"+trials+" identity, expect ~17)",
        identical>0&&identical<trials*0.06, identical+" of "+trials+" came back in recipe order");
  // and with locks in play
  for(let t=0;t<2000;t++){
    const bake=newBake(anyOrder(rng));
    scrambleBench(bake,rng);
    applyResult(bake,scoreAttempt(bake,botGuess(bake,rng,0.5)));
    if(bake.solved)continue;
    const held=bake.slots.map((v,i)=>bake.locked[i]?v:null);
    scrambleBench(bake,rng);
    for(let i=0;i<bake.slots.length;i++)if(held[i]!==null&&bake.slots[i]!==held[i])lockMoved++;
  }
  check("a locked crate never moves in the scramble",lockMoved===0,lockMoved+" locked crates moved");
}

console.log(failures?("\n"+failures+" FAILED"):"\nall bake-off invariants hold");
process.exit(failures?1:0);
