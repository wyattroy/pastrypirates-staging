#!/usr/bin/env node
// bubble_side_probe.mjs — DOES A NARRATION BUBBLE EVER CHANGE WHICH SIDE OF ITS BOAT IT SITS ON?
//
// Wyatt, 2026-08-25: "the narration bubble appears first below the boat at the beginning of its
// run and then above the boat later. Ideally, the narration bubble stays in its same location with
// respect to the boat for the whole time because if it has to flip from below to above, that's
// when it looks jittery." He is emphatic that the bubble MOVING with the camera is GOOD and must
// be kept — "i love that look and feel… as long as it is smooth". Only the SIDE may not change.
//
// THIS PROBE EXISTS BECAUSE THE BUG COULD NOT BE REPRODUCED, AND HE IS THE ONE WHO CRACKED IT.
// Three attempts failed and each looked like evidence of absence:
//   - two full driven voyages: 14 bubbles, 0 flips, on the BROKEN code;
//   - a posed test that panned the camera under five live bubbles for ~780 frames: 0 flips;
//   - sailing to the extreme rows of the board: still 0.
// Every bubble was born ABOVE, because the side is decided from the boat's SCREEN position and the
// camera centres whoever it follows — so board-top is not screen-top and the "no room above"
// branch never fired. His hint, "sail the boat to the top or bottom of the board", is what pointed
// at the geometry; the missing half is that the camera must then be made to frame the boat against
// a distant one (__pp4.battle), which zooms out and pushes it to the screen's top edge. Only then
// is a bubble born BELOW, and only then can it flip.
//
// MEASURED, same script, same posed condition:
//     BEFORE the fix : 2 side flips
//     AFTER  the fix : 0 side flips, with bubbles still born below and still gliding with the camera
// A green here means something only because the red was demonstrated first. If this ever reports
// zero flips on both sides of a change, the condition was not posed and the run proves nothing.
//
// Usage:  PW_DIR=/tmp/pw node 4/scripts/bubble_side_probe.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openWebKit } from "./lib/wk.mjs";
import { makePlayer, GATE_SRC } from "./lib/player.mjs";
import { gameURL } from "./lib/chrome.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.PORT || 8561);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const c=await openWebKit({W:390,H:844,httpPort:PORT,serveRoot:REPO,profileDir:"/tmp/wk-edge",mobile:true,dsf:3});
try{
  await c.nav(gameURL(PORT)); await sleep(2200);
  await c.ev(`localStorage.clear(); localStorage.setItem('pp_id','qa-edge'); 1`);
  await c.nav(gameURL(PORT)); await sleep(2600);
  await c.ev(GATE_SRC);
  let g=await c.ev(`__gate(document.getElementById('choiceSolo'))`); await c.clickXY(g.x,g.y); await sleep(1300);
  g=await c.ev(`__gate(document.getElementById('nameModalInput'))`); if(g&&g.ok){await c.clickXY(g.x,g.y); await c.type("Wy");}
  g=await c.ev(`__gate(document.getElementById('btnNameConfirm'))`); await c.clickXY(g.x,g.y); await sleep(2800);
  const player=makePlayer(c,{log:()=>{}});

  /* WYATT'S REPRODUCTION, 2026-08-25: "sail the boat to the top or bottom of the board."
     That is the geometry the rig never produced on its own — every bubble was born ABOVE because
     the camera always frames the subject boat mid-board. Put the boat on an EXTREME ROW and the
     bubble is born BELOW it (no room above), and then the camera pan makes room and it flips. */
  let sailed = 0;
  for (let i = 0; i < 400 && sailed < 5; i++) {
    await c.ev(GATE_SRC);
    const s = await c.ev(`(() => {
      const cs = [...document.querySelectorAll('.sailCell')];
      if (!cs.length) return { n: 0 };
      const rows = cs.map(e => +e.dataset.gy).filter(v => !isNaN(v));
      return { n: cs.length, minY: Math.min(...rows), maxY: Math.max(...rows) };
    })()`);
    if (s.n) {
      // the most EXTREME row available, top or bottom, whichever is further from the middle
      const pick = await c.ev(`(() => {
        const cs = [...document.querySelectorAll('.sailCell')];
        const rows = cs.map(e => +e.dataset.gy);
        // NORTH. The flip needs the boat where there is NO room above it, so the bubble is born
        // BELOW and the camera pan then makes room. At the bottom of the board there is always
        // room above, the bubble is correctly born ABOVE, and nothing ever flips (measured).
        let best = null, bd = 1e9;
        for (const e of cs) { const gy = +e.dataset.gy;
          const gg = __gate(e); if (!gg.ok) continue;
          if (gy < bd) { bd = gy; best = Object.assign(gg, { gy }); } }
        return best; })()`);
      if (pick && pick.ok) { await c.clickXY(pick.x, pick.y); sailed++;
        console.log(`sail #${sailed}: to row gy=${pick.gy} (rows offered ${s.minY}..${s.maxY})`);
        // now watch every bubble born for the next stretch
        await c.ev(`(() => { window.__b = []; let cur = null, lastText = null;
          (function f(){
            const bb = document.querySelector('.pp4Bub:not(.out)');
            const t = bb ? bb.textContent.trim().slice(0,22) : null;
            if (t && t !== lastText) { cur = { text: t, side0: bb.classList.contains('below')?'below':'above', flips: 0, cur: null, frames: 0 };
              cur.cur = cur.side0; window.__b.push(cur); }
            if (t && cur && t === cur.text) { cur.frames++;
              const n = bb.classList.contains('below')?'below':'above';
              if (n !== cur.cur) { cur.flips++; cur.cur = n; } }
            lastText = t; requestAnimationFrame(f);
          })(); return 1; })()`);
        /* AND NOW FORCE THE BOAT TO THE TOP OF THE SCREEN. Board-top is not screen-top: the
           camera centres whoever it is following, so a boat on row 0 still has room above it.
           __pp4.battle(a,d) fits BOTH boats on screen, so framing the subject against the boat
           furthest SOUTH pushes the subject up to the screen's top edge — which is the only place
           the "no room above" branch can fire. */
        for (let k = 0; k < 26; k++) {
          await player.tick();
          await c.ev(`(() => { try {
            const g = window.appState.game, ps = g.players;
            const bub = document.querySelector('.pp4Bub:not(.out)');
            if (!bub) return 0;
            let a = window.appState.mySeat, best = a, bd = -1;
            for (let i = 0; i < ps.length; i++) { const d = (ps[i].pos||[0,0])[1] - (ps[a].pos||[0,0])[1];
              if (d > bd) { bd = d; best = i; } }
            if (best !== a) window.__pp4.battle(a, best);
          } catch(e){} return 1; })()`);
          await sleep(300);
        }
        const b = await c.ev(`window.__b || []`);
        for (const e of b.filter(x => x.frames > 15))
          console.log(`   bubble "${e.text}"  born ${e.side0.toUpperCase()}  flips=${e.flips}  frames=${e.frames}`);
        const tot = b.filter(x=>x.frames>15).reduce((n,e)=>n+e.flips,0);
        const below = b.filter(x=>x.frames>15&&x.side0==='below').length;
        console.log(`   -> born BELOW: ${below}   TOTAL FLIPS: ${tot}\n`);
      }
      continue;
    }
    await player.tick(); await sleep(280);
  }
}catch(e){console.log("ERR",String(e.message||e).slice(0,220));}
finally{ await c.close(); }
