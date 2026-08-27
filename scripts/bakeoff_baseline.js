#!/usr/bin/env node
// scripts/bakeoff_baseline.js
//
// THE ROLLBACK GUARANTEE, MADE MECHANICAL.
//
// The bake-off ships behind BAKEOFF_ENABLED, and the promise is that flipping it false restores
// today's game exactly. That promise is worthless as an assertion — the whole point of a feature
// flag is that nobody re-reads the disabled path. So this captures a fingerprint of the engine's
// full event stream across many seeded games BEFORE the feature exists, and re-checks it after.
//
// Fingerprint, not a diff: a SHA of every event's type plus its ordering-relevant fields, per game,
// plus the seeded RNG call count. randCalls is the sharpest signal there is — if a new code path
// draws even one extra random number with the flag off, every subsequent event in that game shifts
// and the hash moves. A change that is genuinely inert cannot move it.
//
//   node scripts/bakeoff_baseline.js --write     capture (run this BEFORE changing the engine)
//   node scripts/bakeoff_baseline.js             verify against the captured file
//
// RE-BASED ONCE, 2026-08-08, and here is exactly why — because a re-captured baseline is worthless
// if nobody records what moved. Wyatt lowered buried treasure from 6 coins to 5 (roundCfg's
// dockHeads), which is a deliberate change to the RULESET, not a leak from the bake-off. It moved
// 181 of 200 games, as any economy change would.
//
// It was proved to be the only cause before re-capturing, rather than assumed: setting dockHeads
// back to 6 with every other line of the feature still in place returned all 200 games to
// byte-identical. So the flag-off path is still inert with respect to the BAKE-OFF; it has simply
// been re-anchored to the v2bakeoff ruleset, which now deliberately differs from /v2/'s.
//
// RE-BASED A SECOND TIME, 2026-08-09, same discipline. Wyatt, watching a pass-and-play voyage:
// "the bots are stupid — sometimes they pass instead of dock — even when theyre at a dock and could
// make money or gather resources that others need." Two fixes to the shared bot brain followed
// (chooseAction no longer commits a turn to a trade botOpenOffer will refuse to open; a refused
// action falls back to working the dock instead of ending the turn). Both change what bots DO, so
// they move the event stream in every game a bot was previously wasting a turn in — 162 of 200.
//
// Proved to be the only cause before re-capturing, same as last time: stashing exactly those two
// edits and re-running returned all 200 games to byte-identical. Measured effect, over 300 games:
// passes taken while standing at a workable dock went 3,746 -> 0, turns spent on a trade that was
// never even announced went 4,884 -> 0, and the median voyage shortened by roughly half a day.
//
// RE-BASED A THIRD TIME, 2026-08-09, same discipline again. Bots now aim their last approach leg at
// the square that WINS the fight (`mark − wind`) rather than merely one that reaches the mark —
// measured 49.6% vs 24.9% to take the crate, for the same 2🌕. Steering changes what bots do, so it
// moves the stream in every game containing a raid: 125 of 200.
//
// Proved to be the only cause before re-capturing, as with the previous two: stashing exactly that
// edit returned all 200 games to byte-identical. Measured effect over 300 games — fights 1.68 -> 2.35
// per game, shots fired with the wind 25.5% -> 44.6%, and the win spread across the four archetypes
// TIGHTENED from 46-93 to 59-88. Zero games unfinished before or after.
//
// RE-BASED A FOURTH TIME, 2026-08-09. The bot brain was replaced: a turn is now decided WHOLE before
// the ship moves, scored against an actual voyage plan (turnsToWin — every remaining ingredient
// ordered, sailed over real water under the wind that will actually blow, docked, sailed home,
// baked; a whole number of turns). It changes what every bot does on every turn, so all 200 games
// move — as they must.
//
// Proved the sole cause before re-capturing, same as the three before it: stashing exactly this
// change returned all 200 games to byte-identical. It is also the first bot change this project has
// shipped on evidence of WINNING rather than of behaving better: scripts/bot_ladder.js over 400
// games a row scores it +6.7 points against the bot it replaces, positive in all four
// configurations. Behaviour, for the record — fights 2.35 -> 2.41 a game but 44.6% -> 91.1% of them
// fired with the wind, blank turns 8.8% -> 6.2%, deals struck 26 -> 156, voyage length unchanged at
// ~18 days, no game unfinished.
//
// RE-BASED A FIFTH TIME, 2026-08-09, for a one-token change with a real effect. An action's value
// was turnsToWin(now) - (1 + turnsToWin(after)); the 1 was the turn just spent. Wyatt: "Sailing
// towards your goal should lower your turns to win because it gets you closer to your goal, if your
// algorithm rates sailing at zero that means your algorithm is wrong." He is right — a full leg of
// sailing printed 0.00, which made the game's most productive act look worthless.
//
// It was ALSO expected to be a pure constant that changed no decision, and that was wrong: where a
// personality bias multiplies the value ((base - after) * dealBias) the constant does not cancel, so
// 49 of 200 games moved. Sole cause proved by stashing before re-capturing, as always. The ladder is
// unmoved by it — +5.3 points over 300 games a row, positive in all four configurations.
//
// RE-BASED A SIXTH TIME, 2026-08-09. dealBias was being applied to the trade option's WHOLE value —
// including the sailing component, which has nothing to do with haggling — and it was the SECOND
// application, since composeOffer already gates whether a word is spoken on `worth * dealBias`.
// Applied twice it stopped tilting and started overriding (principle 8): a trader's 1.6x promoted a
// hail worth 2 real turns above a dock worth a genuine 3. Removing it moves 103 of 200 games.
//
// Sole cause proved by stashing before re-capturing, as always. Ladder over 250 games a row: +5.8
// points, positive in all four configurations.
//
// What this file still guarantees: no FURTHER bake-off code leaks into the disabled path from here.
// What it no longer guarantees: that /v2bakeoff/ with the flag off plays identically to /v2/ (that
// stopped being true on purpose at the first re-base), NOR that the bot brain is frozen — it is
// under active work, and a bot change is expected to move this file. Read the diff, prove the cause,
// record it here, then re-capture.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Game, roundCfg } from "../v2bakeoff/src/engine/index.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const OUT=path.join(__dirname,"fixtures","bakeoff-baseline.json");
const GAMES=200;
const STRATS=["pirate","trader","balanced","rusher"];

// One game -> a stable string. Only fields that affect what a player SEES or what the engine
// DECIDES are included; anything cosmetic is left out so the fingerprint doesn't churn on copy edits.
function fingerprint(seed){
  // FORCE THE FLAG OFF. This corpus exists to prove the DISABLED path is unchanged, so it must
  // never inherit whatever BAKEOFF_ENABLED happens to be set to while the feature is being built.
  const g=new Game({...roundCfg(STRATS),bakeoff:false},seed,true);
  const w=g.play();
  const parts=g.events.map(e=>{
    const keep=["t","p","a","d","dir","ing","winner","heads","got","kind","spoilIng","dist","round"];
    return keep.filter(k=>e[k]!==undefined).map(k=>k+"="+e[k]).join(",");
  });
  return {seed,winner:w,rounds:g.round,randCalls:g.randCalls,
    events:g.events.length,
    hash:crypto.createHash("sha1").update(parts.join(";")).digest("hex").slice(0,16)};
}

function capture(){
  const rows=[];
  for(let s=1;s<=GAMES;s++)rows.push(fingerprint(s));
  return {games:GAMES,strategies:STRATS,rows};
}

const write=process.argv.includes("--write");
const now=capture();

if(write){
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(now,null,1));
  console.log("captured "+now.games+" games -> "+path.relative(process.cwd(),OUT));
  console.log("total rng draws across the corpus: "+now.rows.reduce((a,r)=>a+r.randCalls,0));
  process.exit(0);
}

if(!fs.existsSync(OUT)){
  console.log("FAIL no baseline captured yet — run with --write BEFORE changing the engine");
  process.exit(1);
}
const was=JSON.parse(fs.readFileSync(OUT,"utf8"));
const diffs=[];
for(let i=0;i<Math.max(was.rows.length,now.rows.length);i++){
  const a=was.rows[i],b=now.rows[i];
  if(!a||!b){diffs.push("game count changed: "+was.rows.length+" -> "+now.rows.length);break;}
  const keys=["winner","rounds","randCalls","events","hash"];
  const moved=keys.filter(k=>String(a[k])!==String(b[k]));
  if(moved.length)diffs.push("seed "+a.seed+": "+moved.map(k=>k+" "+a[k]+" -> "+b[k]).join(", "));
}
if(diffs.length){
  console.log("FAIL the disabled path is NOT inert — "+diffs.length+" of "+was.rows.length+" games differ");
  diffs.slice(0,8).forEach(d=>console.log("  "+d));
  process.exit(1);
}
console.log("PASS all "+was.rows.length+" games byte-identical to the pre-bake-off baseline");
console.log("     (winner, day count, rng draw count, event count and event-stream hash all match)");
