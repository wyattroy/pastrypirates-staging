#!/usr/bin/env node
/* sail_containment_probe.mjs — WHERE DO THE SAIL SQUARES ACTUALLY LAND ON A PHONE?
 *
 * ADVISORY probe, not a gate. It answers ONE geometric question and prints numbers.
 *
 * WHY THIS SHAPE, AND NOT ANOTHER TRIAL. The bug is real and old: a guest on a phone gets sail
 * squares it cannot tap. `scripts/lib/checks.mjs` caught one again on 2026-09-01 (crew-phone, day
 * 1: "clickable off-screen: sailCell", "a sail square <- nothing (outside any element)"), and
 * src/ui/stage.js records a measurement from 2026-08-29 of six squares at x = -57..-116 and one at
 * x = 400 on a 390-wide screen.
 *
 * IT HAS RESISTED FIXING FOR A SPECIFIC REASON, IN WYATT'S OWN WORDS: "don't touch bubble placement
 * again without a posed comparison — the same seeded sail prompt, before and after, two
 * screenshots. Three probe runs and three 85-minute trials couldn't settle a question that two
 * pictures would have." A driven voyage yields a handful of samples an hour and they swing wildly;
 * three runs of one probe gave 7, 12 and 5 captures with different cause mixes, and every fix
 * shipped on that evidence was reverted. CLAUDE.md rule 26 is the rule that came out of it: when
 * the question is "is this drawn wrong", ask a GEOMETRIC question instead of hunting a rate.
 *
 * SO THIS ASKS THE GEOMETRIC ONE. It reaches the first sail prompt on a phone-sized viewport and
 * measures every `.sailCell` rect against the viewport, reporting exactly which squares are outside
 * and by how many pixels. One run, one answer, no sampling.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: decide anything, or change anything. stage.js already records
 * that "the bbox genuinely contains every square — the fit is not what fails; containment in BOARD
 * coordinates is not containment on SCREEN", and that TWO geometry theories were measured dead
 * there. This prints the ground truth a fix would have to move; it does not theorise about why.
 *
 *   node scripts/qa/sail_containment_probe.mjs [--w=390] [--h=844] [--shot=<path>]
 */
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(fileURLToPath(import.meta.url), "..", "..", "..");
const { openChrome, sleep } = await import(pathToFileURL(path.join(ROOT, "scripts/lib/cdp.mjs")).href);
const { makePlayer, GATE_SRC } = await import(pathToFileURL(path.join(ROOT, "scripts/lib/player.mjs")).href);

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const W = +arg("w", 390), H = +arg("h", 844);
const MODE = arg("mode", "solo");
const SEED = arg("seed", "");        // pose the SAME board twice: --seed=1   // solo | crew  (crew measures the GUEST, where the bug lives)
/* Into sea-trial-shots/, which exists and is gitignored -- NOT the repo root. tree_health_check
   reads a root-level path as a top-level directory and fails the build on one that is not there,
   which is exactly what it caught here. */
const SHOT = arg("shot", path.join(ROOT, "sea-trial-shots", "sail-containment.png"));


const SEED_SRC = (n) => `(() => {
  let s = ${n} >>> 0;
  Math.random = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})()`;

const c = await openChrome({
  W, H, dbgPort: 9411, httpPort: 8301, serveRoot: ROOT,
  profileDir: path.join(ROOT, "sea-trial-shots", "prof-sail-probe"),
  mobile: true, dsf: 2,
});

/* THE HOST IS A SECOND BROWSER, on its own ports so it cannot collide with the guest's (rule 17
   names the ports discipline). It is driven only far enough to start the voyage -- nothing is
   measured on it. */
let hostC = null;
if (MODE === "crew") {
  hostC = await openChrome({
    W: 1100, H: 900, dbgPort: 9421, httpPort: 8311, serveRoot: ROOT,
    profileDir: path.join(ROOT, "sea-trial-shots", "prof-sail-probe-host"),
    mobile: false, dsf: 1,
  });
  /* THE HOST'S SEED IS THE ONE THAT MATTERS in a crew game -- the host creates the Game and the
     guest receives its seeded stream -- but both are pinned so nothing else drifts between runs. */
  if (SEED) await hostC.send("Page.addScriptToEvaluateOnNewDocument", { source: SEED_SRC(SEED) });
}

if (SEED) await c.send("Page.addScriptToEvaluateOnNewDocument", { source: SEED_SRC(SEED) });

try {
  /* BOOT AND DRIVE WITH THE REPO'S OWN DRIVER, not a hand-rolled click loop. The first version of
     this probe clicked "Play Solo" and then guessed at buttons; it never reached a sail prompt and
     reported "nothing measured", which is the honest output but a wasted run. scripts/lib/player.mjs
     is "the ONE thing that knows how to play the game" (rule 23) and playtest_gate boots it the way
     copied below -- localStorage id, a reload, then GATE_SRC. Re-deriving that is exactly what
     docs/DRIVING-THE-GAME.md exists to stop. */
  const url = `http://127.0.0.1:8301/`;
  await c.nav(url); await sleep(2200);
  await c.ev(`localStorage.clear(); localStorage.setItem('pp_id','qa-sail-probe'); 1`);
  await c.nav(url); await sleep(2600);
  await c.ev(GATE_SRC);

  /* THE GATE'S OWN SOLO BOOT, copied rather than re-guessed: #choiceSolo, then the name modal.
     Two earlier attempts here searched the DOM for a button matching /solo/i, clicked the right
     card, and still never reached a sail prompt -- because the name modal was never answered, so
     the game never started and player.tick() had nothing to drive. */
  if (MODE === "crew") {
    /* THE CREW SEQUENCE, copied from playtest_gate's own helpers rather than re-derived -- host
       card, room code, guest joins with that code, host presses Start and then the two-step
       confirm. Note bootJoin's own hard-won detail: the name modal is GONE from the join flow
       since 2026-08-24, so it is used if present and skipped if not. A rig that encodes a flow
       breaks when the flow is fixed, and it fails looking like the GAME is broken. */
    const hurl = "http://127.0.0.1:8311/";
    await hostC.nav(hurl); await sleep(2200);
    await hostC.ev(`localStorage.clear(); localStorage.setItem('pp_id','qa-sail-probe-host'); 1`);
    await hostC.nav(hurl); await sleep(2600);
    await hostC.ev(GATE_SRC);
    const hc = await hostC.ev(`__gate(document.getElementById('choiceHost'))`);
    if (!hc || !hc.ok) { console.log("host card not clickable — nothing measured"); process.exit(2); }
    await hostC.clickXY(hc.x, hc.y);
    await sleep(800);
    const hn = await hostC.ev(`__gate(document.getElementById('nameModalInput'))`);
    if (hn && hn.ok) {
      await hostC.send("Input.dispatchMouseEvent", { type: "mousePressed", x: hn.x, y: hn.y, button: "left", clickCount: 3 });
      await hostC.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: hn.x, y: hn.y, button: "left", clickCount: 3 });
      await hostC.type("probehost");
      const hb = await hostC.ev(`__gate(document.getElementById('btnNameConfirm'))`);
      if (hb && hb.ok) await hostC.clickXY(hb.x, hb.y);
    }
    let code = "";
    for (let i = 0; i < 50 && !/^[A-Z0-9]{4}$/.test(code); i++) {
      await sleep(600);
      code = await hostC.ev(`(document.getElementById('roomCode')||{textContent:''}).textContent.trim()`);
    }
    console.log("room code:", code || "(never appeared)");
    if (!/^[A-Z0-9]{4}$/.test(code)) { console.log("no room — nothing measured"); process.exit(2); }

    const jc = await c.ev(`__gate(document.getElementById('choiceJoin'))`);
    if (!jc || !jc.ok) { console.log("join card not clickable — nothing measured"); process.exit(2); }
    await c.clickXY(jc.x, jc.y); await sleep(900);
    const hasModal = await c.ev(`(()=>{const m=document.getElementById('nameModal'); return !!(m && getComputedStyle(m).display !== 'none');})()`);
    if (hasModal) {
      const nm2 = await c.ev(`__gate(document.getElementById('nameModalInput'))`);
      if (nm2 && nm2.ok) {
        await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: nm2.x, y: nm2.y, button: "left", clickCount: 3 });
        await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: nm2.x, y: nm2.y, button: "left", clickCount: 3 });
        await c.type("probeguest");
        const cb = await c.ev(`__gate(document.getElementById('btnNameConfirm'))`);
        if (cb && cb.ok) await c.clickXY(cb.x, cb.y);
      }
      await sleep(700);
    }
    await c.ev(`(() => { const j = document.getElementById('joinCode'); if (j) j.value = ${JSON.stringify(code)};
      const n = document.getElementById('joinName'); if (n) n.value = "probeguest"; return 1; })()`);
    const jb = await c.ev(`__gate(document.getElementById('btnJoin'))`);
    if (!jb || !jb.ok) { console.log("join button not clickable — nothing measured"); process.exit(2); }
    await c.clickXY(jb.x, jb.y);
    await sleep(2500);

    for (let i = 0; i < 60; i++) {
      await sleep(700);
      const b = await hostC.ev(`__gate(document.getElementById('btnStart'))`);
      if (b && b.ok) { await hostC.clickXY(b.x, b.y); break; }
    }
    await sleep(1000);
    for (let i = 0; i < 30; i++) {
      await sleep(600);
      const b = await hostC.ev(`__gate(document.getElementById('btnConfirmStart'))`);
      if (b && b.ok) { await hostC.clickXY(b.x, b.y); break; }
    }
    console.log("crew started; measuring on the GUEST");
    await sleep(2600);
  } else {
  const g = await c.ev(`__gate(document.getElementById('choiceSolo'))`);
  if (!g || !g.ok) { console.log("solo card not clickable — nothing measured"); c.close(); process.exit(2); }
  await c.clickXY(g.x, g.y);
  await sleep(800);
  const nm = await c.ev(`__gate(document.getElementById('nameModalInput'))`);
  if (nm && nm.ok) {
    await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: nm.x, y: nm.y, button: "left", clickCount: 3 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: nm.x, y: nm.y, button: "left", clickCount: 3 });
    await c.type("probe");
    /* #btnNameConfirm, the gate's own selector -- not a text match. My text match looked for
       /start|ok|go|ahoy/ and the button reads "Aye, that's me name", so the modal simply stayed
       open and the game never started. Three silent boot failures came from guessing at the DOM
       instead of copying the id the gate already knows. */
    const b = await c.ev(`__gate(document.getElementById('btnNameConfirm'))`);
    if (b && b.ok) await c.clickXY(b.x, b.y);
  }
  await sleep(2600);

  }

  const player = makePlayer(c, { log: (m) => console.log("  [guest]", m), isGuest: MODE === "crew" });
  const hostPlayer = hostC ? makePlayer(hostC, { log: () => {} }) : null;
  let cells = 0;
  /* GENEROUS, because in a crew game the GUEST only gets sail squares on ITS OWN TURN and the
     other captains have to play first. A 60-iteration budget reached DAY 1 and timed out waiting
     for the turn to come round -- which looks exactly like "no sail prompt" and is not. */
  for (let i = 0; i < 240 && cells === 0; i++) {
    await c.ev(GATE_SRC);
    cells = await c.ev(`document.querySelectorAll(".sailCell").length`);
    if (cells) break;
    try { await player.tick(); } catch (e) { /* keep driving */ }
    if (hostC) { try { await hostC.ev(GATE_SRC); await hostPlayer.tick(); } catch (e) { /* host just needs to keep its turn moving */ } }
    await sleep(500);
  }
  console.log("sail squares on screen:", cells);
  if (!cells) {
    /* LOOK, do not guess again. Three boot attempts failed silently before this line existed; a
       screenshot and the visible text answer in one run what another round of DOM guessing does
       not (rule 19). */
    await c.shot(path.join(ROOT, "sea-trial-shots", "sail-probe-stuck.png"));
    const where = await c.ev(`JSON.stringify({
      day: (document.body.innerText.match(/DAY \d+/)||["none"])[0],
      modal: !!document.getElementById("nameModalInput"),
      buttons: [...document.querySelectorAll("button,.apBtn")].filter(b=>b.offsetParent).map(b=>(b.textContent||"").trim().slice(0,22)).slice(0,8),
      text: document.body.innerText.replace(/\s+/g," ").slice(0,180)
    })`);
    console.log("stuck at:", where);
    console.log("screenshot: sea-trial-shots/sail-probe-stuck.png");
  }
  if (!cells) { console.log("NO SAIL PROMPT REACHED — nothing measured. Not a result about the game."); c.close(); process.exit(2); }

  await sleep(1200); // let the 180ms camera fit and its lerp finish

  /* WHICH MOMENT WAS MEASURED, and this is the lesson of the seeded runs.
     SEEDING THE RNG PINS THE BOARD AND NOT THE MOMENT. Two runs at --seed=7 produced the SAME
     room code (ZTNK, so the seed really is taking) and two different pictures: 20 squares with 1
     outside, then 18 squares with 6 outside and one 116px off the left. Nothing is flaky about
     the game there -- the guest's FIRST sail prompt simply falls on a different turn depending on
     how quickly the driver reached it, and a different turn is a different board position.
     A before/after judged across those two runs would be exactly the sampling mistake that cost
     the night of 2026-08-30, in new clothes. So every result states the moment it measured, and
     runs are only comparable when the day AND the square count match.
     (Run 2's numbers -- -58, -59, -116 -- match the measurement stage.js recorded on 2026-08-29:
     "six sail squares at x = -57 to -116". The probe reproduces the documented signature.) */
  const moment = await c.ev(`(() => {
    const d = (document.body.innerText.match(/DAY (\d+)/) || [0, "?"])[1];
    return JSON.stringify({ day: d, cells: document.querySelectorAll(".sailCell").length });
  })()`);
  console.log("measured at:", moment, "— only compare runs whose day AND cell count match");
  const report = await c.ev(`(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const out = [];
    document.querySelectorAll(".sailCell").forEach(el => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hitEl = document.elementFromPoint(cx, cy);
      out.push({
        gx: el.dataset.gx, gy: el.dataset.gy,
        left: Math.round(r.left), top: Math.round(r.top),
        right: Math.round(r.right), bottom: Math.round(r.bottom),
        w: Math.round(r.width), h: Math.round(r.height),
        centreOutside: cx < 0 || cy < 0 || cx > vw || cy > vh,
        anyOutside: r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh,
        hit: hitEl ? (hitEl.className && hitEl.className.baseVal !== undefined ? hitEl.className.baseVal : String(hitEl.className || hitEl.tagName)).slice(0, 28) : null,
      });
    });
    return JSON.stringify({ vw, vh, cells: out });
  })()`);

  const r = JSON.parse(report);
  const outside = r.cells.filter(x => x.anyOutside);
  const centreOut = r.cells.filter(x => x.centreOutside);
  const unhittable = r.cells.filter(x => x.hit === null);

  console.log(`\nviewport ${r.vw}x${r.vh}   sail squares: ${r.cells.length}${SEED ? `   seed ${SEED} (posed — rerun with --seed=${SEED} for the same board)` : "   UNSEEDED — this board will not recur"}`);
  console.log(`squares with ANY part outside the viewport: ${outside.length}`);
  console.log(`squares whose CENTRE is outside (untappable):  ${centreOut.length}`);
  console.log(`squares whose centre hits NOTHING at all:      ${unhittable.length}`);
  for (const x of outside) {
    const how = [];
    if (x.left < 0) how.push(`${-x.left}px off the LEFT`);
    if (x.top < 0) how.push(`${-x.top}px off the TOP`);
    if (x.right > r.vw) how.push(`${x.right - r.vw}px off the RIGHT`);
    if (x.bottom > r.vh) how.push(`${x.bottom - r.vh}px off the BOTTOM`);
    console.log(`  (${x.gx},${x.gy}) ${x.w}x${x.h} at [${x.left},${x.top}] — ${how.join(", ")}${x.centreOutside ? "  ⚠ CENTRE OUTSIDE" : ""}${x.hit === null ? "  ⚠ HITS NOTHING" : ""}`);
  }
  /* RED-PROOF THE INSTRUMENT BEFORE BELIEVING "0 OUTSIDE". A containment probe that cannot see an
     off-screen square would report a clean board on a broken one, and this project has already paid
     for three checks that measured something other than what they named (CLAUDE.md rule 6). So:
     shove the board sideways by a whole viewport and re-measure. If the count does not move, the
     measurement above proves nothing and says so. The shove is undone immediately -- it is a probe,
     not a change. */
  const proof = await c.ev(`(() => {
    const el = document.querySelector(".sailCell"); if (!el) return "no cell";
    const host = el.closest("svg") || el.parentElement; if (!host) return "no host";
    const prev = host.style.transform;
    host.style.transform = "translateX(-2000px)";
    let outside = 0;
    document.querySelectorAll(".sailCell").forEach(e => {
      const r = e.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) outside++;
    });
    host.style.transform = prev;
    return String(outside);
  })()`);
  const proved = /^\d+$/.test(proof) && +proof > 0;
  console.log(`
red-proof: with the board shoved a viewport sideways, the probe sees ${proof} square(s) outside` +
    (proved ? " — it CAN detect the fault it is looking for." : " — ⚠ IT CANNOT. Treat the count above as unproven."));

  await c.shot(SHOT);
  console.log(`\nscreenshot: ${SHOT}`);

  /* --tap=gx,gy — TAP ONE SQUARE AND REPORT WHAT THE GAME DID. Added 2026-09-01 for the camera
     containment fix: measuring elementFromPoint says a square is REACHABLE; only a real tap says
     it is TAPPABLE (the fix's whole point — the square at (3,8) was 23px off the LEFT before it).
     A successful sail tears the prompt down (renderPickPrompt's teardown removes every .sailCell),
     so "squares gone" is the game's own confirmation, not a probe-side theory. */
  const TAP = arg("tap", "");
  if (TAP) {
    const [tgx, tgy] = TAP.split(",");
    const t = await c.ev(`(() => {
      const el = [...document.querySelectorAll(".sailCell")].find(e => e.dataset.gx === ${JSON.stringify(String(+tgx))} && e.dataset.gy === ${JSON.stringify(String(+tgy))});
      if (!el) return "null";
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`);
    if (t === "null") console.log(`tap: square (${tgx},${tgy}) is not on this board's sail window — nothing tapped`);
    else {
      const p = JSON.parse(t);
      await c.clickXY(p.x, p.y);
      await sleep(1500);
      const left = await c.ev(`document.querySelectorAll(".sailCell").length`);
      console.log(`tap: clicked (${tgx},${tgy}) at [${Math.round(p.x)},${Math.round(p.y)}] — ${left === 0
        ? "the game ACCEPTED the sail (prompt torn down, all squares gone)"
        : `⚠ ${left} square(s) still up — the tap did NOT take`}`);
      // A second screenshot AFTER the click, so the acceptance claim has a picture that can
      // actually contain it. CEO Review 66's fault 1: the pre-tap shot was cited for a fact it
      // was photographed too early to see — the sound programmatic check above printed to a
      // console nobody kept, and the PNG stood in for it. Evidence should photograph its claim.
      const afterShot = SHOT.replace(/\.png$/, "-after-tap.png");
      await c.shot(afterShot);
      console.log(`tap: post-tap screenshot: ${afterShot}`);
    }
  }
  console.log(centreOut.length || unhittable.length
    ? "\nRESULT: squares are unreachable on this viewport — the ground truth a fix has to move."
    : "\nRESULT: every square is reachable on this viewport. Not a proof of the general case: one board, one seed.");
} finally {
  c.close();
  if (hostC) hostC.close();
}
