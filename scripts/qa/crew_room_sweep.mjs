#!/usr/bin/env node
/* crew_room_sweep.mjs — the crew rooms a probe left standing in the live database, and (only when
 * you ask it in so many words) their removal.
 *
 * THE SISTER OF stray_probe_check.mjs. That one asks "are there abandoned browsers on this machine
 * right now?"; this one asks the same question of Firebase, where a probe's leak is not a process
 * but a ROOM. On 2026-09-17 a tidy-up after one item's crew runs removed 186 rooms and only FIVE
 * belonged to that run — the rest were weeks of litter nobody could see. The probes' own leaks are
 * fixed (scripts/lib/crew_room.mjs); this is the mop for what is already there, and for the one
 * path no process can cover: a SIGKILL, which runs no `finally` anywhere.
 *
 * ⛔ IT IS DRY BY DEFAULT, AND IT PRINTS BOTH LISTS BEFORE IT TOUCHES ANYTHING. A destructive
 * default is how somebody deletes a real player's voyage. It deletes only with `--delete`, only
 * rooms older than a day, and only rooms where EVERY named captain is a name a script in this repo
 * types (test*, HostCap, GuestCap, "QA …"). One name it does not recognise keeps the whole room —
 * and if such a room ever reaches the delete list, it stops without deleting anything at all.
 *
 *   node scripts/qa/crew_room_sweep.mjs                 # report: what it would delete, what it keeps
 *   node scripts/qa/crew_room_sweep.mjs --delete        # the same report, then the deletions
 *   node scripts/qa/crew_room_sweep.mjs --hours 48      # a different age floor
 *   node scripts/qa/crew_room_sweep.mjs --room ABCD     # one room only (still by the same rules)
 *
 * Exit: 0 clean, 1 a delete failed, 2 it refused to act (an unrecognised name on the delete list).
 */
import {
  databaseURL, listRoomCodes, readRoomCard, roomVerdict, dropRoom,
  humanAge, DEFAULT_MIN_AGE_MS, THROWAWAY_NAMES,
} from "../lib/crew_room.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes("--" + name);
const val = (name) => {
  const i = argv.findIndex(a => a === "--" + name || a.startsWith("--" + name + "="));
  if (i < 0) return null;
  const a = argv[i];
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[i + 1] || null;
};

const DELETE = flag("delete");                       // the ONLY way anything is removed
const HOURS = val("hours") === null ? DEFAULT_MIN_AGE_MS / 3600000 : Number(val("hours"));
const ONLY = (val("room") || "").trim().toUpperCase() || null;
const minAgeMs = HOURS * 3600000;
const now = Date.now();

if (!isFinite(minAgeMs) || minAgeMs < 0) { console.log("--hours must be a number of hours"); process.exit(2); }

console.log("=== crew room sweep ===");
console.log(`  database   ${databaseURL()}`);
console.log(`  mode       ${DELETE ? "DELETE — it will remove what it lists below" : "DRY RUN (the default) — nothing will be deleted"}`);
console.log(`  age floor  older than ${HOURS}h`);
console.log(`  a probe's captain names: ${THROWAWAY_NAMES.map(r => r.source).join("  ")}`);
if (ONLY) console.log(`  restricted to room ${ONLY}`);
console.log("");

let codes = await listRoomCodes();
if (ONLY) codes = codes.filter(c => c.toUpperCase() === ONLY);
console.log(`${codes.length} room(s) in the database\n`);

/* Read the cards a few at a time — 345 rooms is 690 small reads, and a flood of them gets throttled. */
const cards = [];
const WIDTH = 8;
for (let i = 0; i < codes.length; i += WIDTH) {
  cards.push(...await Promise.all(codes.slice(i, i + WIDTH).map(readRoomCard)));
}

const rows = cards.map(card => ({ card, v: roomVerdict(card, { now, minAgeMs }) }));
const toDelete = rows.filter(r => r.v.deletable);
const toKeep = rows.filter(r => !r.v.deletable);
const line = ({ card, v }) => `  ${card.code.padEnd(8)} ${humanAge(v.ageMs).padStart(7)}  ${v.why}`;

console.log(`--- WOULD DELETE (${toDelete.length}) — every captain a probe's, older than ${HOURS}h ---`);
if (!toDelete.length) console.log("  (none)");
for (const r of toDelete.sort((a, b) => (b.v.ageMs || 0) - (a.v.ageMs || 0))) console.log(line(r));

console.log(`\n--- KEEPING (${toKeep.length}) ---`);
if (!toKeep.length) console.log("  (none)");
for (const r of toKeep.sort((a, b) => (b.v.ageMs || 0) - (a.v.ageMs || 0))) console.log(line(r));

const oldest = arr => arr.length ? Math.max(...arr.map(r => r.v.ageMs || 0)) : null;
console.log(`\n--- summary ---`);
console.log(`  rooms                 ${rows.length}`);
console.log(`  would delete          ${toDelete.length}   oldest ${humanAge(oldest(toDelete))}`);
console.log(`  keeping               ${toKeep.length}   oldest ${humanAge(oldest(toKeep))}`);
const why = {};
for (const r of toKeep) { const k = r.v.why.replace(/:.*/, "").replace(/only .* old.*/, "younger than the age floor"); why[k] = (why[k] || 0) + 1; }
for (const [k, n] of Object.entries(why)) console.log(`    kept: ${k} — ${n}`);

if (!DELETE) {
  console.log(`\nDRY RUN — nothing was deleted. Re-run with --delete to remove the ${toDelete.length} above.`);
  process.exit(0);
}

/* THE LAST GATE BEFORE ANYTHING GOES. The verdict is re-derived here, immediately before the
   deletes, and one unrecognised name on the list stops the whole run — the room list is shared
   state that belongs to real players too, and no sweep of this kind is worth one lost voyage. */
const impure = toDelete.filter(r => !roomVerdict(r.card, { now, minAgeMs }).deletable);
if (impure.length) {
  console.log("\nREFUSING TO DELETE — a room on the list no longer reads as a probe's:");
  for (const r of impure) console.log(line(r));
  process.exit(2);
}

console.log("");
let failed = 0;
for (const r of toDelete) {
  const res = await dropRoom(r.card.code);
  console.log(`  ${res.ok ? "deleted" : "FAILED "} ${r.card.code}  ${res.ok ? "" : res.why}`);
  if (!res.ok) failed++;
}
console.log(`\n${toDelete.length - failed} room(s) deleted, ${failed} failed, ${toKeep.length} left alone.`);
process.exit(failed ? 1 : 0);
