#!/usr/bin/env node
/* WHOSE TURN IT IS — ONE FACT, AND NOW NO WRITER AT ALL. WHO IS BEING ASKED — ITS OWN FACT, ONE WRITER.
   (Step 3 gate, MEASURER 2026-08-31; RE-ANCHORED BY ARCHITECTURE ITEM 3, 2026-09-16.)

   WHAT THIS HELD UNTIL 2026-09-16: "whose turn is it" was stored twice — appState.curSeat (setActor) and stage.js's S.activeSeat
   (window.__pp4.actor) — and ribbonTick drew `S.activeSeat ?? appState.curSeat`, so a write that moved only one was a write the top bar
   did not draw. applyActiveSeat() moved both; this gate made it the only writer.

   WHY THE ANCHOR MOVED: that one writer was the fault. 19 callers wrote the slot, most of them for whoever was being ASKED (a defender's
   flip, a crow's-nest call, a trade partner) and the event consumer for whichever seat each event named — so the top bar left the attacker
   mid-fight, against his ruling (DECISIONS.md, 2026-09-16): "The top bar shows whose turn it is -- which is the active player who decided
   to attack. this does not need to change during a battle; it should not." Item 3 split the one slot into the two facts it was carrying:
     · WHOSE TURN IT IS — read, never stored: src/ui/util.js whoseTurn() over the event stream (scripts/qa/whose_turn_shown_once_check.mjs
       holds every surface to it);
     · WHO IS BEING ASKED — appState.askedSeat, written by exactly one function, raiseLocalPrompt (util.js), the one door a local prompt
       comes through.
   THIS GATE, NOW: (1) no store of the turn survives — no setActor/applyActiveSeat/curSeat/S.activeSeat/__pp4.actor definition or write
   anywhere in src; (2) appState.askedSeat is assigned only inside raiseLocalPrompt, which is defined once, in util.js. Red-proofed below
   against both, in memory. */
import fs from 'node:fs';import path from 'node:path';import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip_comments.mjs';
/* ⚠ ROOT OFF THIS MODULE, NEVER OFF A TYPED PATH. This line once read `process.argv[2] || '/home/user/pastrypirates'`, and `npm test`
   passes no argument — so on any machine that was not that container the gate CRASHED and the gates after it NEVER RAN (CEO Review 37). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC=path.join(ROOT,'src');
/* COMPARE PATHS IN POSIX: on Windows path.join is backslash-separated, and a gate that is red on one OS and green on another is not
   measuring the code (the Razer, 2026-08-31). */
const rel=f=>path.relative(ROOT,f).split(path.sep).join('/');
const files={};(function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,f.name);if(f.isDirectory())walk(p);else if(f.name.endsWith('.js'))files[rel(p)]=fs.readFileSync(p,'utf8');}})(SRC);

function bodyAt(src,h){ if(h<0)return ''; let j=src.indexOf('(',h),d=0;
  for(;j<src.length;j++){if(src[j]==='(')d++;else if(src[j]===')'){d--;if(!d)break;}}
  j=src.indexOf('{',j);d=0; for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(!d)break;}}
  return src.slice(h,j+1); }

function measure(fl){
  const code=Object.fromEntries(Object.entries(fl).map(([k,v])=>[k,stripComments(v)]));
  const slots=[];
  for(const [f,c] of Object.entries(code)){
    c.split('\n').forEach((L,i)=>{
      if(/\bfunction\s+(setActor|applyActiveSeat)\s*\(|\b(setActor|applyActiveSeat)\s*\(|appState\.curSeat\b|\bcurSeat\s*:|S\.activeSeat\b|__pp4\.actor\b|activeTurnSeat\b/.test(L))
        slots.push(`${f}:${i+1}: ${L.trim().slice(0,90)}`);
    });
  }
  const doors=Object.entries(code).filter(([,c])=>/export function raiseLocalPrompt\s*\(/.test(c)).map(([f])=>f);
  const util=code['src/ui/util.js']||'';
  const door=bodyAt(util,util.indexOf('export function raiseLocalPrompt('));
  const writesIn=(door.match(/appState\.askedSeat\s*=(?!=)/g)||[]).length;
  const writesAll=Object.values(code).reduce((n,c)=>n+(c.match(/appState\.askedSeat\s*=(?!=)/g)||[]).length,0);
  return {slots, doors, writesIn, writesAll};
}
const judge=m=>({noSlot:m.slots.length===0, oneWriter:m.doors.length===1&&m.doors[0]==='src/ui/util.js'&&m.writesIn>=1&&m.writesAll===m.writesIn});

const real=measure(files), v=judge(real);
console.log('SUBJECT REACHED:');
console.log(`  ${real.doors.length?'yes':'NO '}  raiseLocalPrompt defined (${real.doors.join(', ')||'nowhere'})`);
console.log(`  ${real.writesIn?'yes':'NO '}  it writes appState.askedSeat (${real.writesIn} write(s) inside it)`);
if(!real.doors.length||!real.writesIn){console.log('\nINCONCLUSIVE — the code this gate describes has moved. Fix the gate, do not trust it.');process.exit(2);}

console.log(`\n${v.noSlot?'PASS':'FAIL'}  no store of whose turn it is survives${v.noSlot?'':` — ${real.slots.length} line(s):\n    `+real.slots.join('\n    ')}`);
console.log(`${v.oneWriter?'PASS':'FAIL'}  who is being asked has one writer, raiseLocalPrompt in util.js (${real.writesAll} assignment(s) in src, ${real.writesIn} of them inside it)`);

/* RED-PROOF, in memory, through the same measure. */
const put=(f,from,to)=>files[f].includes(from)?{...files,[f]:files[f].replace(from,to)}:null;
/* the anchor follows collectSideBets' signature — it took the fight's wind as a third argument on 2026-09-18 (architecture item 25),
   and a mutant that cannot be built is a red-proof that proves nothing */
const M1=put('src/ui/flow.js','export async function collectSideBets(att,def,downwind){','export async function collectSideBets(att,def,downwind){\n  appState.askedSeat=att.idx;');
const M2=put('src/ui/util.js','export function whoseTurn(){','function setActor(s){appState.curSeat=s;}\nexport function whoseTurn(){');
const r1=M1&&!judge(measure(M1)).oneWriter, r2=M2&&!judge(measure(M2)).noSlot;
console.log(`${r1?'PASS':'FAIL'}  red-proof: a second writer of who is being asked (collectSideBets) ${r1?'goes red':M1?'STAYS GREEN':'could not be built'}`);
console.log(`${r2?'PASS':'FAIL'}  red-proof: setActor, the old store of the turn, put back ${r2?'goes red':M2?'STAYS GREEN':'could not be built'}`);

if(!v.noSlot||!v.oneWriter||!r1||!r2){console.log('\nRED — whose turn it is has a store again, or who is being asked has a second writer (or a red-proof did not hold).');process.exit(1);}
console.log('\nGREEN — whose turn it is is read, never stored; raiseLocalPrompt is the only writer of who is being asked.');process.exit(0);
