#!/usr/bin/env node
// scripts/net_connected_twin_test.js
//
// THE BUG THIS EXISTS FOR. The crew-phone sea trial on 2026-08-26 completed a real two-phone
// voyage and logged one console ERROR the whole way:
//
//   [src/net/registry.js] duplicate attach refused for key
//   "session|…/.info/connected|value|connected" — was the caller's setup entry point invoked twice?
//
// It is not noise. TWO different consumers legitimately watch .info/connected:
//   1. watchPresence()  — marks presence, hides the "syncing" note.
//   2. armHostGone()    — on every return to connected, re-asserts status:"playing" and re-arms
//                         the server-side onDisconnect.
// Both reached it through netWatchConnected(), which hardcoded label:"connected", so both produced
// the IDENTICAL registry key (scope|ref|event|label). The registry refuses a duplicate key by
// design — so whichever attaches SECOND silently never attaches at all.
//
// armHostGone() attaches second. Its own comment (src/orchestrator.js) says what that costs: a
// host whose connection blips for a moment leaves the room marked "hostgone" and the guest reading
// "yer matey has left the game…" with nothing to clear it. The repair that is supposed to undo that
// is the listener that was refused.
//
// WHY A LABEL AND NOT A SECOND REGISTRY. The registry's duplicate refusal is a real guard against a
// double-invoked entry point and must stay. docs/MODULES.md:155 says each netWatch* wrapper
// "chooses a scope and a label" — the label IS the designed way to tell two intentional consumers
// of one Reference apart. So the fix is to let the caller name itself, not to weaken the guard.
//
// House convention (scripts/net_registry_test.js): no test runner, one PASS/FAIL line per case,
// every case runs before exit, exit 0 on pass / 1 on any failure.

import { netWatchConnected } from "../src/net/watchers.js";
import { detachAll, size } from "../src/net/registry.js";

let failures = 0;
function check(name, condition, detail) {
  const ok = !!condition;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name}${ok ? "" : `  (${detail || "condition false"})`}`);
}

/* ---------- fake Firebase db, same shape as scripts/net_registry_test.js ----------------------- */
function createFakeDb() {
  const backing = new Map(); // path -> [{event, callback}]
  return {
    ref(path) {
      return {
        toString() { return path; },
        on(event, callback) {
          if (!backing.has(path)) backing.set(path, []);
          backing.get(path).push({ event, callback });
        },
        off(event, callback) {
          const l = backing.get(path) || [];
          const i = l.findIndex(e => e.event === event && e.callback === callback);
          if (i >= 0) l.splice(i, 1);
        },
      };
    },
    fire(path, event, val) {
      for (const e of (backing.get(path) || [])) if (e.event === event) e.callback({ val: () => val });
    },
  };
}

console.log("net_connected_twin_test — two consumers of .info/connected must BOTH be live\n");

detachAll();
const db = createFakeDb();

// Capture the registry's own ERROR so we can assert it is gone, not merely tolerated.
const realError = console.error;
const errors = [];
console.error = (...a) => { errors.push(a.join(" ")); };

let presenceRan = 0, hostGoneRan = 0;
// 1. watchPresence()'s consumer — attaches first, exactly as it does at page boot.
netWatchConnected(db, snap => { if (snap.val() === true) presenceRan++; }, () => {});
// 2. armHostGone()'s consumer — attaches second, and names itself so it is a distinct key.
netWatchConnected(db, snap => { if (snap.val() === true) hostGoneRan++; }, () => {}, "hostgone-reassert");

console.error = realError;

check("both consumers are registered (registry holds 2, not 1)", size() === 2, `registry.size() === ${size()}`);
check("no 'duplicate attach refused' error was logged", errors.length === 0, errors[0] || "");

db.fire(".info/connected", "value", true);
check("the presence consumer received the reconnect", presenceRan === 1, `ran ${presenceRan}x`);
check("the host-gone repair received the reconnect", hostGoneRan === 1,
      `ran ${hostGoneRan}x — this is the listener that clears "yer matey has left the game"`);

// The guard itself must SURVIVE: a genuinely double-invoked entry point (same label twice) is
// still an error. A fix that simply removed the refusal would pass every case above and be wrong.
detachAll();
const db2 = createFakeDb();
const errors2 = [];
console.error = (...a) => { errors2.push(a.join(" ")); };
netWatchConnected(db2, () => {}, () => {});
netWatchConnected(db2, () => {}, () => {});          // same label on purpose — must still be refused
console.error = realError;
check("a genuine double-invoke is STILL refused (guard not weakened)",
      size() === 1 && errors2.length === 1, `size=${size()} errors=${errors2.length}`);

detachAll();
console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
