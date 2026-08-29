/* Q-18 — WHICH NARRATION LINES ACTUALLY CARRY A SERIAL, AND DO THE TWO SEATS AGREE ON THE SUBJECT?
 *
 *   node scripts/qa/q18_wire_audit.mjs [--seconds=120]
 *
 * WHY THIS EXISTS, AND IT IS A FALSIFIER BEFORE IT IS A CHECK. CEO Review 25 found that the first
 * cut sent `events.length-1` with EVERY narration line, when only src/ui/panel.js's
 * narrateLastEvent is about the last event. The fix binds the serial to the subject: a line that
 * did not read an event now sends neither. **The obvious way for that fix to be worthless is for
 * NO line to carry a serial any more** — the ordering barrier would then be a no-op and Q-18 would
 * deliver nothing, while every text gate stayed green. So this reads the WIRE ITSELF.
 *
 * It attaches its own Firebase listener to `rooms/<code>/narr` from inside the guest's page — the
 * same node the guest's own watchNarr reads — and counts, for every line that crosses:
 *   how many carry `evN`, how many carry `subj`, and whether those two ever disagree.
 * The subject and the serial are ONE FACT after this fix, so a payload carrying one without the
 * other is the fault itself, on the wire, in a real game.
 *
 * IT CAN FAIL HONESTLY: no lines at all, or zero carrying a serial, both exit 1 and say so.
 *
 * WHAT IT UNDER-COUNTS, SAID HERE RATHER THAN LEFT TO BE DISCOVERED (CEO Review 26). `narr` is a
 * single slot written with `.set()`, and this attaches a `value` listener to it — so two lines
 * written inside one round trip are delivered as ONE callback. **Every count below is a lower
 * bound.** That does not weaken a ZERO (0 of 47 is zero at any sample rate), and it does mean the
 * RATIO of serialled lines to total lines is not a census and must not be quoted as one.
 */
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";

const PORT = 8516, DBG_H = 9418, DBG_G = 9419;
const SECONDS = Number(process.argv.find(a => a.startsWith("--seconds="))?.split("=")[1] || 120);
const url = serve(PORT);
launch(DBG_H, "/tmp/chrome-q18wire-host");
launch(DBG_G, "/tmp/chrome-q18wire-guest");
const H = await attach(DBG_H), G = await attach(DBG_G);
for (const C of [H, G]) await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

console.log(`Q-18 — the wire itself, ${SECONDS}s.\n`);
const code = await makeHost(H, url, "test1");
console.log(`  room ${code}`);
await makeGuest(G, url, code, "test2");

const WATCH = `(()=>{
  if(typeof firebase==="undefined")return "no firebase on this page";
  if(window.__wire)return "already";
  window.__wire={rows:[]};
  firebase.database().ref("rooms/${code}/narr").on("value",s=>{
    const v=s.val(); if(!v)return;
    window.__wire.rows.push({
      evN: v.evN===undefined?null:v.evN,
      subj: v.subj===undefined?null:v.subj,
      text:String(v.html||"").replace(/<[^>]*>/g,"").replace(/\\s+/g," ").trim().slice(0,58)});
    if(window.__wire.rows.length>500)firebase.database().ref("rooms/${code}/narr").off();
  });
  return "listening";})()`;
console.log("  wire listener:", await G.ev(WATCH));
await startVoyage(H);
await sleep(2500);
await driver(H, url); await driver(G, url);
console.log("  both seats driving\n");
/* BOUNDED — rule 17. */
for (let i = 0; i < Math.ceil(SECONDS / 2); i++) await sleep(2000);

const rows = JSON.parse(await G.ev(`JSON.stringify(window.__wire?window.__wire.rows:[])`));
killAll();

if (!rows.length) { console.log("=== NOT RUN — no narration crossed the wire at all. That is not a pass."); process.exit(1); }
const withEvN = rows.filter(r => r.evN != null);
const withSubj = rows.filter(r => r.subj != null);
/* THE FAULT ITSELF, IF IT IS STILL THERE: the subject and the serial are one fact after this fix,
   so a payload carrying exactly one of them is the divergence CEO Review 25 found, on the wire. */
const split = rows.filter(r => (r.evN != null) !== (r.subj != null));
console.log(`  ${rows.length} narration line(s) crossed the wire`);
console.log(`    carrying a SERIAL (evN): ${withEvN.length}`);
console.log(`    carrying a SUBJECT:      ${withSubj.length}`);
console.log(`    carrying exactly ONE of the two — the fault: ${split.length}`);
if (split.length) { console.log(`\n  lines where they disagree:`); split.slice(0, 10).forEach(r => console.log(`    evN=${r.evN} subj=${r.subj}   "${r.text}"`)); }
console.log(`\n  a sample of the lines that DO carry a serial (these are the ordered ones):`);
withEvN.slice(0, 6).forEach(r => console.log(`    evN=${r.evN} subj=${r.subj}   "${r.text}"`));
console.log(`\n  a sample of the lines that carry NEITHER (both seats fall back identically):`);
rows.filter(r => r.evN == null && r.subj == null).slice(0, 5).forEach(r => console.log(`    "${r.text}"`));

let bad = 0;
if (!withEvN.length) { console.log(`\n=== FAIL — NOT ONE line carried a serial. The ordering barrier is a no-op and Q-18 delivers nothing.`); bad = 1; }
if (split.length) { console.log(`\n=== FAIL — ${split.length} line(s) carry a serial without a subject or the reverse. They are one fact; the guest and the host will not agree on those lines.`); bad = 1; }
if (!bad) console.log(`\n=== PASS — every line carries both or neither, and ${withEvN.length} of ${rows.length} are ordered against their own event.`);
process.exit(bad);
