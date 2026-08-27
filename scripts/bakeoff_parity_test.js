#!/usr/bin/env node
// scripts/bakeoff_parity_test.js
//
// THE TWO BAKE-OFF DAY LOOPS MUST NOT DRIFT.
//
// The bake-off day exists twice: Game.playBakeoff() drives the headless balance runs, and
// runLiveDayBakeoff() (src/orchestrator.js) drives a real browser voyage. Every balance number this
// feature was tuned on — median voyage length, mean attempts, how often two captains tie — comes
// from the headless loop and is only worth anything if the live loop does the same thing. A comment
// saying "keep these in step" is not a mechanism; this is.
//
// WHAT IS COMPARED, AND WHAT IS DELIBERATELY NOT.
//
// This asserts parity of the DAY STRUCTURE: which seats take a turn, when the ovens light, who is
// enrolled in today's bake, the order attempts resolve in, and when the day ends. It holds the
// per-turn path constant by calling Game.takeTurn on both sides.
//
// It does NOT compare a live browser turn against a headless one, and that is not an omission this
// feature introduced. botTurn() (src/ui/flow.js) does not call takeTurn() at all — it reimplements
// the turn as chooseTarget/stepToward/tradewind/... so it can animate each step — so the live and
// headless per-turn call sequences already differed before the bake-off existed, in the classic
// loop just as much. Folding that pre-existing gap in here would make this gate fail for a reason
// it cannot fix and nobody would keep it green.
//
// So: the day loop is the thing this feature ADDED in two places, and the day loop is what this
// pins. If someone reorders lightOvens against the seat loop, resolves bakes mid-day in one loop
// and at day end in the other, or changes who bakersToday returns, exactly one side moves and the
// fingerprints diverge.
//
//   node scripts/bakeoff_parity_test.js

import { Game, roundCfg } from "../v2bakeoff/src/engine/index.js";

const GAMES=120;
const STRATS=["pirate","trader","balanced","rusher"];
let failures=0;
function check(name,ok,detail){
  if(ok){console.log("PASS "+name);return;}
  failures++;console.log("FAIL "+name+(detail?"  — "+detail:""));
}

// The same event filter the flag-off baseline uses, so both gates agree on what "the same game"
// means and neither churns on a copy edit.
function stream(g){
  const keep=["t","p","a","d","dir","ing","winner","heads","got","kind","spoilIng","dist","round",
              "attempt","correct","left","solved"];
  return g.events.map(e=>keep.filter(k=>e[k]!==undefined).map(k=>k+"="+e[k]).join(",")).join(";");
}
function fingerprint(g,winner){
  return JSON.stringify({winner,round:g.round,rand:g.randCalls,evs:g.events.length,
    finishOrder:g.finishOrder,stream:stream(g)});
}

// A: the engine's own loop.
function headless(seed){
  const g=new Game({...roundCfg(STRATS),bakeoff:true},seed,true);
  const winner=g.playBakeoff();
  return fingerprint(g,winner);
}

// B: runLiveDayBakeoff's shape, driven against the same primitives. Written out longhand rather
// than imported, on purpose — the orchestrator is DOM-bound, and a copy that has to be kept honest
// by this very test is the only version that can be compared to anything.
function liveShaped(seed){
  const g=new Game({...roundCfg(STRATS),bakeoff:true},seed,true);
  const order=g.players.map((_,i)=>i);
  g.shuffle(order);
  let ended=false;
  while(g.round<150&&!ended){
    // --- the round header, as runLiveNet() plays it ---
    g.round++;
    const {dir:wind,storm}=g.advanceWind();
    g.ev({t:"newround",dir:wind,windStreak:g.noteWind(wind),next:g.forecastWind(),nextStorm:g.stormNext});
    if(storm)g.runStorm(wind);
    // --- runLiveDayBakeoff(order) ---
    for(const i of order){
      const p=g.players[i];
      if(p.done||p.baking)continue;          // a baker's whole turn is the attempt, taken at day end
      g.takeTurn(p,wind,storm);
      g.lightOvens(p);                        // arrive -> ovens -> enrolled in TODAY
    }
    for(const i of g.bakersToday(order)){
      // bakeTurnLive's two halves. A bot seat answers with the engine's own fallback, which is
      // exactly what bakeAttempt(p,null) does on the other side — the split exists so a human can
      // be waited on between them, and it must consume the identical rng either way.
      const p=g.players[i];
      const {setup,fallback}=g.bakeSetup(p);
      if(!setup)throw new Error("bakeSetup returned nothing");
      g.bakeResolve(p,fallback);
    }
    ended=g.endBakeDay();
  }
  const winner=g.resolveEnd();
  return fingerprint(g,winner);
}

{
  const diffs=[];
  for(let s=1;s<=GAMES;s++){
    const a=headless(s),b=liveShaped(s);
    if(a!==b){
      const A=JSON.parse(a),B=JSON.parse(b);
      const moved=["winner","round","rand","evs"].filter(k=>String(A[k])!==String(B[k]));
      diffs.push("seed "+s+": "+(moved.length?moved.map(k=>k+" "+A[k]+" -> "+B[k]).join(", ")
        :"event streams differ at char "+firstDiff(A.stream,B.stream)));
    }
  }
  check("playBakeoff() and the live day loop play "+GAMES+" identical games",diffs.length===0,
        diffs.length?("\n  "+diffs.slice(0,6).join("\n  ")):"");
}

// The gate has to be able to FAIL, or a green run means nothing. Reorder the day — resolve each
// bake the instant its captain arrives instead of at day end — and the two must part company.
{
  const broken=(seed)=>{
    const g=new Game({...roundCfg(STRATS),bakeoff:true},seed,true);
    const order=g.players.map((_,i)=>i);
    g.shuffle(order);
    let ended=false;
    while(g.round<150&&!ended){
      g.round++;
      const {dir:wind,storm}=g.advanceWind();
      g.ev({t:"newround",dir:wind,windStreak:g.noteWind(wind),next:g.forecastWind(),nextStorm:g.stormNext});
      if(storm)g.runStorm(wind);
      for(const i of order){
        const p=g.players[i];
        if(p.done||p.baking)continue;
        g.takeTurn(p,wind,storm);
        if(g.lightOvens(p))g.bakeAttempt(p,null);   // <-- mid-day, the wrong rule
      }
      for(const i of g.bakersToday(order))g.bakeAttempt(g.players[i],null);
      ended=g.endBakeDay();
    }
    const winner=g.resolveEnd();
    return fingerprint(g,winner);
  };
  let moved=0;
  for(let s=1;s<=40;s++)if(headless(s)!==broken(s))moved++;
  check("the check can fail: resolving bakes mid-day moves "+moved+"/40 games",moved>=30,
        "only "+moved+" of 40 moved — this gate may not be measuring anything");
}

function firstDiff(a,b){
  const n=Math.min(a.length,b.length);
  for(let i=0;i<n;i++)if(a[i]!==b[i])return i+" (…"+a.slice(Math.max(0,i-40),i+40)+" | …"+b.slice(Math.max(0,i-40),i+40)+")";
  return String(n);
}

console.log(failures?("\n"+failures+" FAILED"):"\nthe two bake-off day loops agree");
process.exit(failures?1:0);
