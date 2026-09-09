/* THE STALLED-CLOCK STATE, AND THE PROOF IT DOES NOT CRY WOLF ON A HEALTHY GAME.
 *   node scripts/qa/_audio_stall_check.mjs
 *
 * Wyatt, 2026-09-09, on his phone: Safari lit the tab's audio indicator over total silence, through
 * a full sound-toggle cycle, a reload, and a trip to YouTube and back — then "when i clicked polly
 * to toggle it off, the sound came on", and it never reproduced.
 *
 * WHAT THIS PROBE IS FOR, and it is not "did I fix his bug" — I cannot reproduce his device state.
 * It holds the two things the fix MUST NOT get wrong, both of which are regressions I could easily
 * ship while chasing a bug I cannot see:
 *   1. a healthy game must NEVER report "stalled" — a wrong word on that row is what cost him an
 *      evening in the first place, and my first draft did exactly this for the first half-second of
 *      every voyage because "cannot tell yet" collapsed onto "stalled".
 *   2. the master bus must still come back to full after a hide/show cycle, which is the ramp path
 *      the change rewrote.
 *
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8790 + (process.pid % 80), DBG = 9790 + (process.pid % 80);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-audio-${process.pid}`));
const C = await attach(DBG);
const waitFor = async (e, ms = 25000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(200); }
  throw new Error("timed out: " + e); };
const DIAG = `(()=>{const b=document.getElementById('btnMute');return b?b.dataset.audio:null})()`;
const ROW  = `(()=>{const b=document.getElementById('btnMute');return b?(b.getAttribute('aria-label')||''):''})()`;
const say = console.log;
let bad = 0;

try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
  await sleep(2400);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`, 26000);
  // a real gesture, so the context is unlocked the way a player unlocks it
  await C.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 500, button: "left", buttons: 1, clickCount: 1 });
  await C.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 640, y: 500, button: "left", buttons: 0, clickCount: 1 });
  await sleep(1200);

  say("── 1. a healthy game, sampled every 400ms for 6s ─────────────");
  const seen = new Set();
  for (let i = 0; i < 15; i++) {
    const d = await C.ev(DIAG);
    seen.add(d);
    if (d === "stalled") bad++;
    await sleep(400);
  }
  say(`   states seen: ${JSON.stringify([...seen])}`);
  say(`   ${bad === 0 ? "PASS" : "FAIL"}  "stalled" reported ${bad} time(s) on a healthy game   (must be 0)`);
  say(`   row says: ${JSON.stringify(await C.ev(ROW))}`);

  say("\n── 2. hide -> show, the ramp path the change rewrote ─────────");
  await C.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => {});
  // drive the real visibility path the game listens to
  await C.ev(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));return 1})()`);
  await sleep(1500);
  const hid = await C.ev(DIAG);
  say(`   while hidden : ${hid}`);
  await C.ev(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});
    document.dispatchEvent(new Event('visibilitychange'));return 1})()`);
  await sleep(2000);
  const back = await C.ev(DIAG);
  const backOk = back === "ok" || back === "nomusic";
  if (!backOk) bad++;
  say(`   after showing: ${back}   ${backOk ? "PASS" : "FAIL"}  (must be ok/nomusic — the bus came back)`);
  say(`   row says: ${JSON.stringify(await C.ev(ROW))}`);

  /* ── 3. THE RED PROOF: MAKE A CONTEXT LIE, AND SEE WHETHER THE ROW CATCHES IT ───────────────
     Sections 1 and 2 only prove the detector does not fire when it shouldn't. That is half a test:
     a function that returns "healthy" unconditionally would pass both. So this reproduces the exact
     condition Wyatt's phone was in — a context reporting `running` while its clock does not
     advance — by capturing the AudioContext the page constructs, suspending it for real (which
     stops ctx.currentTime), and redefining `state` to keep claiming "running".
     WITHOUT THE FIX THIS SAYS "ok" FOREVER, which is precisely the silence he could not explain. */
  say("\n── 3. red proof: a context that CLAIMS running with a frozen clock ──");
  await C.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    (() => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const Wrapped = function(...a){ const c = new AC(...a); window.__ctx = c; return c; };
      Wrapped.prototype = AC.prototype;
      window.AudioContext = Wrapped; window.webkitAudioContext = Wrapped;
    })();` });
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.reload()`).catch(() => {});
  await sleep(2600);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`, 26000);
  await C.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 500, button: "left", buttons: 1, clickCount: 1 });
  await C.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 640, y: 500, button: "left", buttons: 0, clickCount: 1 });
  await sleep(1500);
  const captured = await C.ev(`!!window.__ctx`);
  say(`   captured the game's AudioContext: ${captured}`);
  if (!captured) { say("   SKIPPED — could not capture it, so this proves nothing"); bad++; }
  else {
    say(`   before: diag=${await C.ev(DIAG)}  state=${await C.ev(`window.__ctx.state`)}`);
    await C.ev(`(async()=>{ await window.__ctx.suspend();
      Object.defineProperty(window.__ctx,'state',{configurable:true,get:()=>'running'});
      return window.__ctx.state; })()`);
    await sleep(2500);                       // let the 500ms panel tick take two clock samples
    const d = await C.ev(DIAG);
    const caught = d === "stalled";
    if (!caught) bad++;
    say(`   with the clock frozen and state lying: diag=${d}   ${caught ? "PASS — caught" : "FAIL — the row still says " + d}`);
    say(`   row says: ${JSON.stringify(await C.ev(ROW))}`);
    /* AND A TAP MUST BE ABLE TO REACH IT WHILE IT IS STILL LYING — the other half of the dead end,
       and the half my first version of this check got wrong. It deleted the fake `state` getter
       BEFORE tapping, so the context honestly said "suspended" and the OLD code recovered too: the
       sub-check passed on the broken build and discriminated nothing. The lie stays in place now,
       and the verdict is the CLOCK — whether ctx.currentTime actually advances — because that is
       the only thing a lying context cannot fake. */
    const t0 = await C.ev(`window.__ctx.currentTime`);
    await C.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 500, button: "left", buttons: 1, clickCount: 1 });
    await C.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 640, y: 500, button: "left", buttons: 0, clickCount: 1 });
    await sleep(2200);
    const t1 = await C.ev(`window.__ctx.currentTime`);
    const after = await C.ev(DIAG);
    const moved = (t1 - t0) > 0.2;
    if (!moved) bad++;
    say(`   after one tap, still lying: clock ${t0.toFixed(2)} -> ${t1.toFixed(2)} diag=${after}`);
    say(`   ${moved ? "PASS — a gesture reached a context that claimed to be running" : "FAIL — the clock never restarted; no tap can recover it"}`);
  }

  say(`\n${bad === 0 ? "PASS — no wolf cried, the bus recovers, and a real stall IS caught" : "FAIL — " + bad + " problem(s)"}`);
  process.exitCode = bad === 0 ? 0 : 1;
} catch (e) {
  say("PROBE FAILED:", e.message);
  process.exitCode = 1;
} finally { killAll(); }
