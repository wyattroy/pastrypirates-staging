#!/usr/bin/env node
/* group_d_crew_leg.mjs — Group D's crew leg: does an ORDINARY crew game still work?
 *
 *   node scripts/group_d_crew_leg.mjs [--port=N] [--dbgA=N] [--dbgB=N] [--out=DIR] [--rounds=N]
 *
 * WHY THIS AND NOT name_collision_2browser.mjs. That one proves the two COLLISION paths. This one
 * proves the far more important thing they sit on top of: that a join with no collision at all is
 * untouched, that the voyage still starts, and that both captains still play. Item 16 changed the
 * Firebase seat-claim write - the path every single player takes to get into a room - and the plan
 * rates it costly for exactly that reason: a mistake there locks people out of games rather than
 * showing a cosmetic fault, and it is invisible in a screenshot of a working lobby.
 *
 * IT STOPS WELL BEFORE THE END OF VOYAGE, deliberately and by construction: a bounded number of
 * rounds, and it asserts the voyage has NOT ended before it finishes. writeGameLog() writes a
 * permanent row that nobody, Wyatt included, can delete.
 *
 * D-21 IS A WATCHING BRIEF here, not a hunt: the guest who returns to a battle prompt that draws
 * nothing. Three dedicated hunts have already failed, so this only records whether a prompt was ever
 * on screen with no drawable content, and says so either way.
 */
import path from "node:path";
import fs from "node:fs";
import { serve, launch, attach, makeHost, makeGuest, driver, driverOff, ribbonReport, killAll, sleep, SHOTS } from "./mp_rig.mjs";
import { GAME_PATH } from "./lib/chrome.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = +arg("port", 8791), DBG_A = +arg("dbgA", 9791), DBG_B = +arg("dbgB", 9792);
const ROUNDS = +arg("rounds", 4);
const OUT = path.resolve(arg("out", SHOTS));
fs.mkdirSync(OUT, { recursive: true });
const notes = [];
const log = (...a) => { const s = a.join(" "); console.log(s); notes.push(s); };
let fails = 0, n = 0;
const ok = (name, got, want) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want);
  const pass = g === w; if (!pass) fails++; log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(58)} got=${g} want=${w}`); };
const SHOT = async (C, f) => { const r = await C.send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) { fs.writeFileSync(path.join(OUT, f), Buffer.from(r.result.data, "base64")); log(`    shot -> ${f}`); } };
const SEATS = `(() => [...document.querySelectorAll('#seatList .seat .nm')].map(e => (e.textContent||'').trim()))()`;
/* AN EMPTY PROMPT — the box is on screen and painted, and NOTHING INSIDE IT IS DRAWN. That is the
   D-21 shape, asked of whatever happens to be up rather than hunted for.
 *
 * THE FIRST VERSION OF THIS PREDICATE WAS WRONG, and it is worth recording how, because it is the
 * exact class of mistake that produced three phantom defects at the 02.1 gate. It listed the things
 * it expected a prompt to contain — .apMsg, .apBtn, .btlBtn, .sailCell, the armed coin, .bko — and
 * called the panel empty when it found none of them. It then fired 4 times on the HOST and 10 on the
 * guest, which looked like a D-21 sighting.
 *
 * It was a BATTLE CARD. Measured directly (a solo control, where D-21 cannot exist by construction —
 * no guest, no room): every hit held 800-935 characters of `<div class="btl">`, painted, opacity 1,
 * visible. A battle card between its phases carries none of the six class names on that list, so a
 * perfectly good card was being condemned by a check that had never been shown a battle.
 *
 * So it no longer names what it expects. It asks the RENDERER what is actually drawn: has
 * #apGridInner any element child with a real rectangle? Nothing to enumerate, nothing to keep in step
 * with as new prompt kinds are added, and a new card cannot be mistaken for an empty box. */
const EMPTY_PROMPT = `(() => {
  const ap = document.getElementById('actionPanel'); if (!ap) return null;
  const r = ap.getBoundingClientRect(); if (!(r.width > 20 && r.height > 20)) return null;
  const cs = getComputedStyle(ap);
  if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
  // a pick prompt draws its choices on the BOARD, and the armed coin lives outside the panel —
  // in both cases there is something on screen to act on, so the box is not stranded.
  if (document.querySelectorAll('.sailCell').length) return null;
  if (document.querySelector('#flipCoinWrap.active')) return null;
  const inner = document.getElementById('apGridInner'); if (!inner) return null;
  const drawn = [...inner.querySelectorAll('*')].filter(e => {
    const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; });
  return drawn.length === 0
    ? { h: Math.round(r.height), innerLen: inner.innerHTML.length,
        innerHead: inner.innerHTML.replace(/\\s+/g, ' ').slice(0, 90) }
    : null;
})()`;

const url = serve(PORT);
launch(DBG_A, "/tmp/pp-crew-host", { url: "about:blank" });
launch(DBG_B, "/tmp/pp-crew-guest", { url: "about:blank" });
await sleep(1800);
const A = await attach(DBG_A), B = await attach(DBG_B);
let code = null;
const emptyPrompts = { host: 0, guest: 0 };

try {
  log(`\nGROUP D — the crew leg: an ORDINARY join, then a voyage that actually runs  (${url})\n`);

  code = await makeHost(A, url, "Wyatt");
  log(`  host "Wyatt" created room ${code}`);
  await sleep(1200);

  /* AN ORDINARY JOIN. "Bess" collides with nothing - not the host, not any bot default. This is the
     regression test for item 16: the overwhelmingly common path must be exactly as it was. */
  await makeGuest(B, url, code, "Bess");
  await sleep(2500);
  /* ONE async IIFE, returning the string. `JSON.stringify(await (async()=>…)())` puts an `await` at
     the top level of the evaluated expression, which is a ReferenceError, and CDP reports it as an
     exception with no hint that the shape is the problem. ev() already passes awaitPromise. */
  const gstate = JSON.parse(await B.ev(`(async()=>{const st=(await import('/src/state/index.js')).appState;
    return JSON.stringify({room:st.room||null,mySeat:st.mySeat,isHost:!!st.isHost});})()`));
  ok("an ordinary, non-colliding join still gets a seat", gstate.room, code);
  ok("...and the guest is not the host", gstate.isHost, false);
  const hs = await A.ev(SEATS), gs = await B.ev(SEATS);
  log(`  host lobby:  ${JSON.stringify(hs)}`);
  log(`  guest lobby: ${JSON.stringify(gs)}`);
  ok("...under exactly the name they typed", gs[gstate.mySeat].startsWith("Bess"), true);
  ok("...and the host sees it too", hs[gstate.mySeat].startsWith("Bess"), true);
  const bare = a => a.map(s => s.split("—")[0].trim());
  ok("...with no two captains sharing a name", bare(hs).filter((x, i, v) => v.indexOf(x) !== i), []);
  ok("...and the two lobbies agree seat for seat", bare(hs), bare(gs));
  await SHOT(A, "d-crew-01-host-lobby.png");
  await SHOT(B, "d-crew-02-guest-lobby.png");

  /* START THE VOYAGE. §3b: #btnStart opens a CONFIRMATION; #btnConfirmStart is the button that
     actually begins the game, and it is not an .apBtn - a driver that misses this sits on the lobby
     until it times out, with nothing in the console. */
  await A.ev(`document.getElementById('btnStart').click();true`);
  await sleep(1000);
  await A.waitFor(`(()=>{const b=document.getElementById('btnConfirmStart');return !!(b&&b.getBoundingClientRect().width>10)})()`, 20000, "host: confirm start");
  await A.ev(`document.getElementById('btnConfirmStart').click();true`);
  await sleep(3000);
  await A.waitFor(`(async()=>{const st=(await import('/src/state/index.js')).appState;return !!st.gameStarted})()`, 40000, "host: game started");
  await B.waitFor(`(async()=>{const st=(await import('/src/state/index.js')).appState;return !!st.gameStarted})()`, 40000, "guest: game started");
  ok("the voyage starts for BOTH captains", true, true);

  /* both sides play - the recipe draft first, then ordinary turns */
  await driver(A, GAME_PATH); await driver(B, GAME_PATH);
  log(`  drivers up; running a bounded ${ROUNDS} rounds, then stopping WELL SHORT of the end card`);
  let round = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const h = await ribbonReport(A);
    round = h.round || 0;
    for (const [tag, C] of [["host", A], ["guest", B]]) {
      const e = await C.ev(EMPTY_PROMPT);
      if (e) { emptyPrompts[tag]++; log(`    D-21? ${tag}: ${JSON.stringify(e)}`); }
    }
    if (round >= ROUNDS) break;
    const over = await A.ev(`(async()=>{const st=(await import('/src/state/index.js')).appState;
      return !!(st.game&&(st.game.winner!=null||st.game.over));})()`);
    if (over) break;
  }
  await driverOff(A); await driverOff(B);
  await sleep(1500);

  const H = await ribbonReport(A), G = await ribbonReport(B);
  log(`  host : round ${H.round}, ${H.events} events, day "${H.day}"`);
  log(`  guest: round ${G.round}, ${G.events} events, day "${G.day}"`);
  ok("the voyage genuinely progressed past round 1", H.round > 1, true);
  ok("the guest's event stream tracks the host's (within a beat)", Math.abs(H.events - G.events) <= 3, true);
  ok("both captains agree what day it is", H.day, G.day);
  /* THE POSITIONS THAT ARE ACTUALLY DRAWN. §5c: game.players[].pos is a stale render shell on a
     guest - comparing it across clients reports drift that does not exist. Compare the event state. */
  ok("the board drawn on both screens is the same board", H.posEvent, G.posEvent);
  ok("nobody reached the end of voyage (writeGameLog never ran)",
    await A.ev(`(async()=>{const st=(await import('/src/state/index.js')).appState;
      return !!(st.game&&(st.game.winner!=null||st.game.over));})()`), false);
  await SHOT(A, "d-crew-03-host-midgame.png");
  await SHOT(B, "d-crew-04-guest-midgame.png");

  log(`\n  D-21 watching brief — empty prompts seen: host ${emptyPrompts.host}, guest ${emptyPrompts.guest}`);
  ok("D-21: no prompt box was ever up with nothing drawable in it", emptyPrompts, { host: 0, guest: 0 });

} catch (e) {
  fails++; log("ABORT: " + (e && e.message ? e.message : e));
} finally {
  if (code) { try { await A.ev(`(async()=>{const st=(await import('/src/state/index.js')).appState;
      if(st.db) await st.db.ref('rooms/${code}').remove(); return 1;})()`); log(`\n  room ${code} deleted`); } catch (e) { log("  could not delete room: " + e.message); } }
  killAll();
}

fs.writeFileSync(path.join(OUT, "crew-leg-log.txt"), notes.join("\n") + "\n");
log(`\n  ${n} assertion(s), ${fails} failure(s)`);
if (fails) { console.error("FAIL group_d_crew_leg"); process.exit(1); }
console.log("PASS group_d_crew_leg — an ordinary crew game joins, starts and plays, both sides agreeing");
process.exit(0);
