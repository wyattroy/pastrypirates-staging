#!/usr/bin/env node
// settle_order_probe.mjs — WHAT IS DRAWN WHILE THE BOARD IS STILL MOVING?
//
// Wyatt, 2026-08-25, correcting a claim made from a code comment rather than a measurement:
// "the narration box appears while the board is still moving. check it in webkit now."
//
// This settles it with frames, not with reasoning. It sails, then samples EVERY animation frame
// from the moment the sail is committed until well after the board is still, recording:
//   ship   — the hull's RENDERED transform vs its TARGET (the same comparison stage.js's own
//            shipStill() makes). Different => the boat is still gliding.
//   camera — #rimHost's transform, which is what the director writes to the board's HTML layers
//            every frame of its tween. Changed since last frame => the camera is still moving.
//   box    — the narration pill: does it exist, is it VISIBLE (computed), and where is it.
//   gates  — #actionPanel's pendingStage / pendingReveal, and #pp4Prompt's classes.
//
// IT WATCHES THE WHOLE VOYAGE, not one sail. Two earlier versions of this probe answered the
// wrong question and both looked confident doing it:
//   1. it sampled `.apMsg` (the ASK PILL) and called it "the narration box" — on the stage,
//      showNarration() goes through __pp4.narr -> stageFlash -> `.pp4Bub`, a different element;
//   2. it then compared "the first frame ANY box is visible" against the settle time — and the
//      box visible in frame 1 was the OUTGOING sail pill, still on screen from before the click.
//      It printed "the box is drawn 501ms before the board stops" about a box that had been up
//      for seconds already.
// So it now records EVENTS, not frames: every time a narration bubble APPEARS (new text), with
// the board's state at that instant, plus how far it moves and whether it ever changes SIDE.
//
// THE SIDE-FLIP COLUMN HAS NEVER GONE RED IN THIS RIG, AND A ZERO THERE PROVES NOTHING. Wyatt sees
// the flip on his iPhone (2026-08-25: "the narration bubble appears first below the boat at the
// beginning of its run and then above the boat later"). Measured here across two full voyages and
// a posed test that panned the camera under five live bubbles for ~780 frames: zero flips, on the
// code BEFORE the fix as well as after. Every bubble in this rig is born ABOVE, because the camera
// always frames the subject boat — the flip needs the boat high on screen while the camera is
// still catching up, which is what a sail does on a phone and what this rig never produces.
// So treat a green here as "nothing broke", never as "the flip is fixed". The claim under test is Wyatt's, 2026-08-25: "the narration
// box appears while the board is still moving." One bubble born mid-motion proves it.
//
// Usage:  PW_DIR=/tmp/pw node 4/scripts/settle_order_probe.mjs [--phone]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openWebKit } from "./lib/wk.mjs";
import { GATE_SRC } from "./lib/player.mjs";
import { gameURL } from "./lib/chrome.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PHONE = process.argv.includes("--phone");
const PORT = 8531;
const W = PHONE ? 390 : 430, H = PHONE ? 844 : 900;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SAMPLER = `(() => {
  window.__ev = []; window.__seen = 0;
  const shipEls = () => [...document.querySelectorAll('#shipHost [style*="translate"], .bship, #boardwrap [data-ship]')];
  let lastCam = null, camMovingFrames = 0, lastText = null;
  const t0 = performance.now();
  (function f(){
    const rim = document.getElementById('rimHost');
    const cam = rim ? rim.style.transform : '';
    const camMoved = lastCam !== null && cam !== lastCam; lastCam = cam;
    camMovingFrames = camMoved ? camMovingFrames + 1 : 0;
    let shipMoving = false;
    for (const el of shipEls()) {
      const want = el.style.transform; if (!want) continue;
      const now = getComputedStyle(el).transform;
      const a = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(want);
      const b = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+),\s*([-\d.]+)\)/.exec(now);
      if (!a || !b) continue;
      if (Math.abs(parseFloat(a[1]) - parseFloat(b[1])) > 0.5) shipMoving = true;
      if (Math.abs(parseFloat(a[2]) - parseFloat(b[2])) > 0.5) shipMoving = true;
    }
    const bub = document.querySelector('.pp4Bub:not(.out)');
    const cs = bub ? getComputedStyle(bub) : null;
    const r = bub ? bub.getBoundingClientRect() : null;
    const vis = !!(bub && cs.visibility === 'visible' && cs.display !== 'none'
                   && parseFloat(cs.opacity) > 0.05 && r.width > 4);
    const text = vis ? bub.textContent.trim().slice(0, 30) : null;
    // AN EVENT IS A NEW BUBBLE, not a visible one. Comparing text is what separates "a bubble is
    // on screen" (it may have been for seconds) from "a bubble was just born".
    if (text && text !== lastText) {
      window.__seen++;
      window.__ev.push({ t: Math.round(performance.now() - t0), text,
                         camMoving: camMoved, shipMoving, camFrames: camMovingFrames,
                         x: Math.round(r.left), y: Math.round(r.top),
                         side0: bub.classList.contains('below') ? 'below' : 'above', flips: 0 });
    }
    lastText = text;
    // follow each live bubble for a beat to see whether it MOVES after it is up (the jitter)
    if (text && window.__ev.length) {
      const e = window.__ev[window.__ev.length - 1];
      if (e.text === text) {
        e.x0 = e.x0 === undefined ? e.x : e.x0; e.y0 = e.y0 === undefined ? e.y : e.y0;
        e.dx = Math.max(e.dx || 0, Math.abs(Math.round(r.left) - e.x0));
        e.dy = Math.max(e.dy || 0, Math.abs(Math.round(r.top) - e.y0));
        // THE THING UNDER TEST: does this bubble ever change which side of the boat it is on?
        const nowSide = bub.classList.contains('below') ? 'below' : 'above';
        if (nowSide !== e.side0) { e.flips++; e.side0 = nowSide; }
      }
    }
    requestAnimationFrame(f);
  })();
  return 1;
})()`;
let c;
try {
  c = await openWebKit({ W, H, httpPort: PORT, serveRoot: REPO, profileDir: "/tmp/wk-settle", mobile: PHONE, dsf: PHONE ? 3 : 1 });
  console.log(`engine=WebKit ${W}x${H}${PHONE ? " phone" : ""}`);
  await c.nav(gameURL(PORT)); await sleep(2200);
  await c.ev(`localStorage.clear(); localStorage.setItem('pp_id','qa-settle-probe'); 1`);
  await c.nav(gameURL(PORT)); await sleep(2600);
  await c.ev(GATE_SRC);
  let g = await c.ev(`__gate(document.getElementById('choiceSolo'))`);
  await c.clickXY(g.x, g.y); await sleep(1300);
  g = await c.ev(`__gate(document.getElementById('nameModalInput'))`);
  if (g && g.ok) { await c.clickXY(g.x, g.y); await c.type("Wyargh"); }
  g = await c.ev(`__gate(document.getElementById('btnNameConfirm'))`);
  await c.clickXY(g.x, g.y); await sleep(2500);
  console.log("solo voyage started");

  await c.ev(SAMPLER);
  console.log("sampler armed — playing a voyage and watching every narration bubble\n");
  const { makePlayer } = await import("./lib/player.mjs");
  const player = makePlayer(c, { log: () => {} });
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    await player.tick();
    await sleep(300);
    const n = await c.ev(`window.__seen || 0`);
    if (n >= 14) break;
    const st = await player.state();
    if (st && st.over) break;
  }
  const ev = await c.ev(`window.__ev || []`);
  if (!ev.length) console.log("NO BUBBLES SEEN — broken run, not a result.");
  else {
    const during = ev.filter(e => e.camMoving || e.shipMoving);
    console.log(`narration bubbles born: ${ev.length}`);
    console.log(`  ...while the board was MOVING: ${during.length}`);
    console.log(`  ...on a still board          : ${ev.length - during.length}\n`);
    const flipped = ev.filter(e => (e.flips || 0) > 0);
    console.log(`  side FLIPS (below<->above during a bubble's life): ${flipped.length} of ${ev.length}`);
    console.log(`\n  t       board        moved-after  flips  text`);
    for (const e of ev) console.log(`  ${String(e.t).padStart(6)}  `
      + `${(e.camMoving || e.shipMoving) ? "MOVING " : "still  "}     `
      + `${String((e.dx||0)+"," + (e.dy||0)).padEnd(9)}  ${String(e.flips||0).padStart(4)}   "${e.text}"`);
    if (during.length) console.log(`\n  *** ${during.length} of ${ev.length} bubbles were BORN while the board was still moving. Wyatt is right. ***`);
    else console.log(`\n  Every bubble was born on a still board in this run. Not a refutation — see the header.`);
  }
} catch (e) { console.log("ERROR " + String(e.message || e).slice(0, 240)); }
finally { if (c) await c.close(); }
