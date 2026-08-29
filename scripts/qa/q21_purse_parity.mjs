/* Q-21 — DO THE TWO SEATS EVER DISAGREE ABOUT A PURSE, AND IS IT A LAG OR A DESYNC?
 *
 *   node scripts/qa/q21_purse_parity.mjs      exit 0 = no disagreement seen, 1 = a REAL desync
 *
 * THE SIGHTING (2026.08.29.1 sea trial, crew-phone, once in ten voyages): Dough Hook's purse read 6
 * on the host and 7 on the guest, and BOTH SEATS HELD THOSE NUMBERS STILL for at least 750ms. Nine
 * seconds later both announced DAY 10 — so it sat on a day rollover and it healed itself.
 * Wyatt's ruling, 2026-08-29: spend the half hour. Coins are game state, not decoration.
 *
 * THE DISCRIMINATOR, and it is the whole design of this probe: SAMPLE THE DAY ALONGSIDE THE PURSE.
 *   purses differ AND the day differs      -> a LAG. The guest is painting an older moment. Nothing
 *                                             is wrong with what either seat believes.
 *   purses differ WHILE BOTH SEATS AGREE
 *   ON THE DAY                             -> a real DESYNC, and that is a state bug.
 * Reading the purse alone cannot tell those apart, which is why the sea trial's finding could not
 * be settled from its own log.
 *
 * IT MUST BE ABLE TO FIND NOTHING HONESTLY. The sighting was 1 in 10 voyages, so a quiet run proves
 * very little. This reports HOW MANY ROLLOVERS IT ACTUALLY WATCHED, and "no disagreement across N
 * rollovers" is the finding — never "fixed", never "not a bug".
 */
import fs from "node:fs";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";

const PORT = 8510, DBG_H = 9410, DBG_G = 9411;
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 10);
const url = serve(PORT);
launch(DBG_H, "/tmp/chrome-q21-host");
launch(DBG_G, "/tmp/chrome-q21-guest");
const H = await attach(DBG_H), G = await attach(DBG_G);
for (const C of [H, G]) await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

/* WHAT EACH SEAT BELIEVES, read off the rendered captains box and the ribbon — the same surfaces a
   player reads, not the engine, because the question is whether the two SCREENS agree. */
const SEAT = `(()=>{
  /* .player-row, NOT .prow — "prow" plus the seat number is the row's ID, the CLASS is player-row.
     The first cut of this selector matched NOTHING and would have reported perfect agreement on
     every sample: an instrument that cannot see its subject always says everything is fine.
     (And the comment saying so then broke the script, because this whole block is a template
     literal and the seat-number placeholder I wrote got interpolated. Loudly, at least.) */
  const rows=[...document.querySelectorAll('.player-row')];
  const purses={};
  rows.forEach(r=>{const n=r.querySelector('.pname'), c=r.querySelector('.coins');
    if(n&&c) purses[(n.textContent||'').trim()] = (c.textContent||'').replace(/[^\\d-]/g,'');});
  const day=((document.getElementById('pp4Ribbon')||{}).textContent||'').match(/DAY\\s*(\\d+)/i);
  return JSON.stringify({ rows: rows.length, day: day?+day[1]:null, purses,
    narr: ((document.querySelector('.pp4Bub')||{}).textContent||'').trim().slice(0,60) });})()`;

console.log(`Q-21 — two real browsers, one Firebase room, ${MINUTES} minutes.\n`);
const code = await makeHost(H, url, "test1");
console.log(`  room ${code}`);
await makeGuest(G, url, code, "test2");
await startVoyage(H);
await sleep(2500);
await driver(H, url); await driver(G, url);
console.log("  both seats driving\n");

const t0 = Date.now();
let samples = 0, blind = 0, rollovers = 0, lastDay = null, lastWho = null, lastWhoAt = 0;
/* THE GRACE PERIOD, READ FROM THE GAME RATHER THAN TYPED HERE (rule 9). If the wait's ceiling
   moves, this probe's idea of "longer than the wait" moves with it — a number copied into a probe
   is a number that goes stale silently. */
const GRACE_MS = Number((fs.readFileSync(new URL("../../src/orchestrator.js", import.meta.url), "utf8")
  .match(/NARR_EVENT_GRACE_MS\s*=\s*(\d+)/) || [, 450])[1]);
const lags = [], desyncs = [];
/* BOUNDED, never while(true) — rule 17. */
const CAP = Math.ceil((MINUTES * 60 * 1000) / 400);
for (let i = 0; i < CAP; i++) {
  let h, g;
  try { h = JSON.parse(await H.ev(SEAT)); g = JSON.parse(await G.ev(SEAT)); } catch { await sleep(400); continue; }
  samples++;
  /* A SAMPLE THAT SAW NO CAPTAINS IS NOT A SAMPLE THAT SAW AGREEMENT. */
  if (!h.rows || !g.rows) { blind++; await sleep(400); continue; }
  if (h.day != null && h.day !== lastDay) { if (lastDay != null) rollovers++; lastDay = h.day; }
  const names = [...new Set([...Object.keys(h.purses), ...Object.keys(g.purses)])];
  /* A SEAT THAT HAS NOT DRAWN A PURSE YET IS NOT A SEAT THAT DISAGREES. The captains box renders
     its rows before the numbers arrive, so during the lobby handoff the guest has names and blank
     coins — and comparing "4" against "" counted every captain as a disagreement, four at a time.
     That is what made the after-fix run look WORSE than the before (11 against 4). Same family as
     the blind-sample guard above: an instrument that cannot see a value must not report it as a
     difference. (This guard is legitimate and was checked against the BEFORE run too — every
     before-run entry has real numbers on both sides, so the before count is unchanged at 4. A
     guard that only ever flattered the after-run would be the same fault wearing a fix's clothes.) */
  const diff = names.filter(n => {
    const a = h.purses[n], b = g.purses[n];
    if (a == null || b == null || a === "" || b === "") return false;
    return a !== b;
  });
  if (!diff.length) { lastWho = null; lastWhoAt = 0; }
  if (diff.length) {
    const rec = { t: Date.now() - t0, day: [h.day, g.day],
      who: diff.map(n => `${n}: host ${h.purses[n] ?? "(absent)"} vs guest ${g.purses[n] ?? "(absent)"}`),
      narr: [h.narr, g.narr] };
    /* WHAT COUNTS, AND THE FIRST ANSWER WAS THE WRONG ONE (CEO Review 24, and it is right).
       This said the sharp test was "both seats drawing a line" — and the fix under test WORKS BY
       LEAVING THE GUEST'S NARRATION BOX EMPTY while it waits for an event. So the one filter I
       narrowed to excluded, by construction, precisely the state the change creates: 6 of the 8
       printed hits in the after-run had `guest saw ""` WITH a live coin gap, and every one of them
       had just been made unable to fail the probe. A test that cannot fail in the window a change
       widens is not a sharpened test, it is a blindfold with a rationale.
       SO THE VERDICT IS THE PLAIN THING AGAIN: a real number-against-number gap, on the same day,
       is a disagreement. The narration state is recorded and REPORTED as a breakdown — because it
       says which kind of disagreement it is — but it never excuses one. */
    rec.bothDrawing = !!(h.narr && g.narr && h.narr.trim() && g.narr.trim());
    rec.guestBlank = !!(h.narr && h.narr.trim() && !(g.narr && g.narr.trim()));
    /* A DISAGREEMENT THAT PERSISTS IS NOT A TRANSIENT, IT IS A STALL — CEO Reviews 25 and 26.
       A disagreement while the two seats are on DIFFERENT days was excused outright as "the guest
       is painting an older moment", and could never fail this probe. But "a whole day behind" is
       precisely what a wait-based fix produces if it goes wrong, so the excuse was pointed away
       from the change under test.
       AND MY FIRST CUT OF THE FIX WAS TOO NARROW, WHICH CEO 26 CAUGHT: it compared the joined
       purse VALUES between samples, so it only fired on a FROZEN mismatch. A guest genuinely stuck
       a day behind while the game carried on around it — purses moving on the host every sample —
       changed the signature every time and still could not fail. What persists is the DISAGREEMENT,
       so what is compared is WHO disagrees, not what their numbers happen to be.
       AND THE ARITHMETIC I JUSTIFIED IT WITH WAS WRONG, which is the same fault as quoting a
       comment as a measurement. I wrote "two consecutive 400ms samples means it outlived the 450ms
       ceiling". Two consecutive samples span ONE interval, not two — about 400ms plus two CDP round
       trips, which is around the ceiling rather than safely past it. So the run is MEASURED rather
       than assumed: the real gap between samples is timed, and a disagreement must outlive the
       grace period in wall-clock time before it counts as held. */
    const who = diff.slice().sort().join("|");
    rec.held = who === lastWho && (rec.t - lastWhoAt) >= GRACE_MS;
    if (who !== lastWho) { lastWho = who; lastWhoAt = rec.t; }
    (h.day === g.day ? desyncs : lags).push(rec);
  }
  if (Date.now() - t0 > MINUTES * 60 * 1000) break;
  await sleep(400);
}

console.log(`\n=== Q-21 VERDICT ===`);
console.log(`  ${blind} sample(s) saw no captains at all and were NOT counted as agreement`);
console.log(`  watched ${samples - blind} usable samples over ${Math.round((Date.now() - t0) / 1000)}s, across ${rollovers} day rollover(s)`);
if (!rollovers) console.log(`  ⚠ NO ROLLOVER WAS WATCHED — the sighting was on one. This run says almost nothing.`);

/* EVERY RECORD IS PRINTED. The old `slice(0, 8)` hid 3 of 11 after-run disagreements, and "the
   after-run has ZERO" was asserted over records nobody had ever seen. If a run produces hundreds,
   that is itself the finding and it should be loud, not trimmed to look tidy. */
const show = (label, rows) => {
  console.log(`\n  ${label}: ${rows.length}`);
  rows.forEach(r => console.log(`    ${r.t}ms  day host ${r.day[0]} / guest ${r.day[1]}   ${r.who.join("; ")}`
    + `\n        host saw "${r.narr[0]}"\n        guest saw "${r.narr[1]}"`));
};
show("disagreements while the two seats were on DIFFERENT days (a LAG, not a state bug)", lags);
show("disagreements while BOTH seats showed the SAME day — the ones that mean something", desyncs);
const bothDrawing = desyncs.filter(d => d.bothDrawing).length;
const guestBlank  = desyncs.filter(d => d.guestBlank).length;
console.log(`\n  ...of those: ${bothDrawing} with both seats drawing a line, ${guestBlank} with the guest showing NOTHING`);
console.log(`     (the second number is the state a wait-based fix CREATES — it is reported, never excused)`);
const heldLags = lags.filter(r => r.held).length;
console.log(`\n  LAGS WHERE THE SAME CAPTAINS DISAGREED FOR LONGER THAN THE ${GRACE_MS}ms GRACE PERIOD (a stall, not a transient): ${heldLags} of ${lags.length}`);
console.log(`     A lag used to be excused outright, which pointed the excuse away from the very change`);
console.log(`     under test — a wait going wrong looks exactly like a guest a whole day behind.`);
if (!lags.length && !desyncs.length)
  console.log(`\n  Nothing disagreed. The sighting was 1 in 10 voyages, so this is "not seen in ${rollovers} rollover(s)" — not "fixed", and not "not a bug".`);
killAll();
process.exit((desyncs.length || heldLags) ? 1 : 0);
