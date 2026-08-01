#!/usr/bin/env node
// scripts/net_registry_test.js
//
// Phase 9 (NET-01/NET-02) Wave 0 gap. Node unit test for src/net/registry.js
// against a small in-memory fake standing in for a Firebase Reference — no
// network, no DOM.
//
// The registry's own bookkeeping is only trustworthy ground truth if this
// test proves it actually does what it claims — see RESEARCH.md's "Don't
// Hand-Roll" table. Two cases below carry disproportionate weight:
//
//   - The room-vs-session case is leak vector (c): the session-scoped
//     connection watchers must survive a room-scoped teardown, or a "fix"
//     that tears everything down would score as a pass on a count-only
//     test while being a real regression.
//   - The cross-instance case is the permanent answer to Assumption A1:
//     the registry stores the original Reference so the answer doesn't
//     gate correctness today, but this test is what stops a future
//     maintainer from "simplifying" the registry back to a rebuilt-path
//     design that may not work.
//
// Every teardown case asserts its pre-teardown count is greater than zero
// before asserting the post-teardown count — a teardown test against an
// empty registry passes trivially and is worse than no test at all.
//
// Follows this repo's existing test-script convention (see
// scripts/engine_contract_check.js, scripts/dlog_replay_test.js): no
// third-party test runner, one PASS/FAIL line per case, every case runs
// before exit, process.exit(0) on pass / process.exit(1) on any failure.

import { attach, detach, detachRoom, detachAll, size, list } from "../src/net/registry.js";

let failures = 0;
function check(name, condition, detail) {
  const ok = !!condition;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name}${ok ? "" : `  (${detail || "condition false"})`}`);
}

/* ---------- fake Firebase Reference ------------------------------------------------------------ */
// Backing is keyed by path and shared across every ref this factory makes for that path — this is
// what makes the cross-instance case testable at all: two separately-constructed fake refs to the
// same path see and can remove each other's listeners, mirroring the empirical Firebase behavior
// RESEARCH.md's Assumption A1 describes (a reproducible bug report, not a maintainer confirmation
// — this test is the permanent, repeatable stand-in for that open question).
function createFakeFirebase() {
  const backing = new Map(); // path -> [{event, callback, cancelCallback}]
  const onCalls = []; // {path, event, callback, cancelCallback}
  const offCalls = []; // {path, event, callback}
  function makeRef(path) {
    return {
      toString() {
        return path;
      },
      on(event, callback, cancelCallback) {
        onCalls.push({ path, event, callback, cancelCallback });
        if (!backing.has(path)) backing.set(path, []);
        backing.get(path).push({ event, callback });
      },
      off(event, callback) {
        offCalls.push({ path, event, callback });
        const entries = backing.get(path);
        if (!entries) return;
        const idx = entries.findIndex((e) => e.event === event && e.callback === callback);
        if (idx !== -1) entries.splice(idx, 1);
      },
      emit(event, payload) {
        const entries = backing.get(path) || [];
        for (const e of [...entries]) if (e.event === event) e.callback(payload);
      },
      listenerCount(event) {
        const entries = backing.get(path) || [];
        return entries.filter((e) => !event || e.event === event).length;
      },
    };
  }
  return { makeRef, backing, onCalls, offCalls };
}

function withCapturedErrors(fn) {
  const original = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args.join(" "));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return captured;
}

const fake = createFakeFirebase();

console.log("net_registry_test — src/net/registry.js against a fake Reference\n");

/* ---------- case 1: attach calls the fake exactly once, with the identical function object ----- */
{
  const ref = fake.makeRef("rooms/t/case1");
  const handler = () => {};
  attach({ scope: "room", ref, event: "value", callback: handler, label: "case1" });
  const onFor1 = fake.onCalls.filter((c) => c.path === "rooms/t/case1");
  check("attach calls the fake's listener API exactly once", onFor1.length === 1, `onCalls=${onFor1.length}`);
  check("attach hands the fake the identical function object", onFor1[0] && onFor1[0].callback === handler);
}

/* ---------- case 2: detach by id calls the fake's removal API with the same function, and a ----- */
/* ---------- subsequent emit does not invoke the handler ----------------------------------------- */
{
  const ref = fake.makeRef("rooms/t/case2");
  let calledCount = 0;
  const handler = () => {
    calledCount++;
  };
  const id = attach({ scope: "room", ref, event: "value", callback: handler, label: "case2" });
  const offBefore = fake.offCalls.length;
  const detachedOk = detach(id);
  check("detach(id) returns true for a live entry", detachedOk === true);
  const offFor2 = fake.offCalls.slice(offBefore).filter((c) => c.path === "rooms/t/case2");
  check("detach calls the fake's removal API with the identical function object", offFor2.length === 1 && offFor2[0].callback === handler);
  ref.emit("value", { x: 1 });
  check("a subsequent emit on that path does not invoke the detached handler", calledCount === 0, `calledCount=${calledCount}`);
}

/* ---------- case 3: a second attach with the same scope/path/event/label is refused loudly ------ */
{
  const ref = fake.makeRef("rooms/t/case3");
  const handlerA = () => {};
  const handlerB = () => {};
  const idA = attach({ scope: "room", ref, event: "value", callback: handlerA, label: "case3" });
  const countAfterFirst = size();
  let idB;
  const errors = withCapturedErrors(() => {
    idB = attach({ scope: "room", ref, event: "value", callback: handlerB, label: "case3" });
  });
  check("duplicate attach leaves the total count unchanged", size() === countAfterFirst, `size()=${size()} want=${countAfterFirst}`);
  check("duplicate attach returns the existing id, not a new one", idB === idA);
  const onFor3 = fake.onCalls.filter((c) => c.path === "rooms/t/case3");
  check("the fake recorded only the first attachment", onFor3.length === 1, `onCalls=${onFor3.length}`);
  check("a duplicate attach logs a named console.error", errors.length === 1 && /case3/.test(errors[0]), JSON.stringify(errors));
}

/* ---------- case 4: detachRoom() removes every room-scoped entry and leaves every session-scoped */
/* ---------- entry both counted and still firing on emit (leak vector c) ------------------------- */
{
  const roomRefA = fake.makeRef("rooms/t/case4-room-a");
  const roomRefB = fake.makeRef("rooms/t/case4-room-b");
  const sessionRefA = fake.makeRef(".info/connected");
  const sessionRefB = fake.makeRef("presence");
  attach({ scope: "room", ref: roomRefA, event: "value", callback: () => {}, label: "case4-room-a" });
  attach({ scope: "room", ref: roomRefB, event: "value", callback: () => {}, label: "case4-room-b" });
  let sessionACalls = 0;
  let sessionBCalls = 0;
  attach({ scope: "session", ref: sessionRefA, event: "value", callback: () => sessionACalls++, label: "case4-session-a" });
  attach({ scope: "session", ref: sessionRefB, event: "value", callback: () => sessionBCalls++, label: "case4-session-b" });

  const roomBefore = size("room");
  const sessionBefore = size("session");
  check("vacuity guard: room-scoped count is greater than zero before teardown", roomBefore > 0, `roomBefore=${roomBefore}`);

  const removedCount = detachRoom();
  check("detachRoom() returns the count of entries it removed", removedCount === roomBefore, `removedCount=${removedCount} want=${roomBefore}`);
  check("detachRoom() empties the room scope", size("room") === 0, `size(room)=${size("room")}`);
  check("detachRoom() leaves the session scope's count untouched", size("session") === sessionBefore, `size(session)=${size("session")} want=${sessionBefore}`);

  sessionRefA.emit("value", {});
  sessionRefB.emit("value", {});
  check("session-scoped listeners still fire after a room-scoped teardown", sessionACalls === 1 && sessionBCalls === 1, `a=${sessionACalls} b=${sessionBCalls}`);
}

/* ---------- case 5: after detachRoom(), re-attaching the same set returns the room-scoped count - */
/* ---------- to its pre-teardown value rather than doubling it ----------------------------------- */
{
  // Room scope is empty at this point (case 4 emptied it and no case since has room-scoped
  // entries) — confirmed rather than assumed, since the whole point of this case is not to trust
  // an unverified starting count.
  check("precondition: room scope is empty before this case's own attach", size("room") === 0, `size(room)=${size("room")}`);

  const specs = [
    { path: "rooms/t/case5-a", label: "case5-a" },
    { path: "rooms/t/case5-b", label: "case5-b" },
  ];
  const attachAll = () => specs.map((s) => attach({ scope: "room", ref: fake.makeRef(s.path), event: "value", callback: () => {}, label: s.label }));

  attachAll();
  const preTeardown = size("room");
  check("vacuity guard: pre-teardown room count is greater than zero", preTeardown > 0, `preTeardown=${preTeardown}`);

  detachRoom();
  check("room count reaches zero after teardown", size("room") === 0, `size(room)=${size("room")}`);

  attachAll();
  check("re-attaching the same set returns the room count to its pre-teardown value, not double it", size("room") === preTeardown, `size(room)=${size("room")} want=${preTeardown}`);
}

/* ---------- case 6: detachAll() brings the total to zero ---------------------------------------- */
{
  const preTeardown = size();
  check("vacuity guard: total count is greater than zero before detachAll()", preTeardown > 0, `preTeardown=${preTeardown}`);
  const removedCount = detachAll();
  check("detachAll() returns the count of entries it removed", removedCount === preTeardown, `removedCount=${removedCount} want=${preTeardown}`);
  check("detachAll() brings the total to zero", size() === 0, `size()=${size()}`);
}

/* ---------- case 7: cross-instance detach — the Assumption A1 burn-down ------------------------- */
// Deliberately bypasses the registry: this proves what the FAKE (standing in for Firebase's
// documented-but-unconfirmed-for-this-exact-point behavior — RESEARCH.md Pitfall 1) does when a
// listener attached via one Reference instance is detached via a different instance to the same
// path. The registry itself never needs this to be true (it always stores and reuses the exact
// Reference object it was given), which is the whole point — but this test is the permanent record
// of which way the fake's shared-backing semantics resolve, for a future reader who might wonder
// whether a rebuilt-path design would have worked too.
{
  const refA = fake.makeRef("rooms/t/case7");
  const refB = fake.makeRef("rooms/t/case7"); // a different object, same path
  check("cross-instance setup: refA and refB are different object instances", refA !== refB);
  let calledCount = 0;
  const handler = () => {
    calledCount++;
  };
  refA.on("value", handler);
  check("vacuity guard: the shared path has a listener before the cross-instance detach", refA.listenerCount("value") > 0);
  refB.off("value", handler); // detach via the OTHER instance
  check("a cross-instance off() empties the shared path's listener list in the fake", refA.listenerCount("value") === 0, `count=${refA.listenerCount("value")}`);
  refA.emit("value", {});
  check("emitting after a cross-instance detach does not invoke the handler", calledCount === 0, `calledCount=${calledCount}`);
}

/* ---------- case 7b: cross-instance — detach() must use the exact stored Reference, never one --- */
/* ---------- rebuilt/looked-up from another entry sharing the same path -------------------------- */
// Uses a deliberately NON-shared-backing fake (unlike createFakeFirebase() above) so that if
// detach() ever stopped using the entry's own stored `ref` — e.g. "simplified" to look a reference
// up by path instead — this test would go red even though the shared-backing fake used everywhere
// else in this file would not visibly notice the same change (its off() already resolves purely by
// path). This is the registry-routed half of the Assumption A1 burn-down; case 7 above is the
// fake-level half.
function createIsolatedFakeRef(path) {
  const localBacking = [];
  return {
    toString() {
      return path;
    },
    on(event, callback, cancelCallback) {
      localBacking.push({ event, callback, cancelCallback });
    },
    off(event, callback) {
      const idx = localBacking.findIndex((e) => e.event === event && e.callback === callback);
      if (idx !== -1) localBacking.splice(idx, 1);
    },
    emit(event, payload) {
      for (const e of [...localBacking]) if (e.event === event) e.callback(payload);
    },
  };
}
{
  const refA = createIsolatedFakeRef("rooms/t/case7b");
  const refB = createIsolatedFakeRef("rooms/t/case7b"); // same path, isolated (non-shared) backing
  let calledA = 0;
  let calledB = 0;
  const handlerA = () => {
    calledA++;
  };
  const handlerB = () => {
    calledB++;
  };
  const idA = attach({ scope: "room", ref: refA, event: "value", callback: handlerA, label: "case7b-a" });
  attach({ scope: "room", ref: refB, event: "value", callback: handlerB, label: "case7b-b" });
  detach(idA);
  refA.emit("value", {});
  refB.emit("value", {});
  check(
    "detach() uses the exact Reference instance stored at attach time, not one rebuilt/shared from another cross-instance entry at the same path",
    calledA === 0 && calledB === 1,
    `calledA=${calledA} calledB=${calledB}`
  );
}

/* ---------- case 8: a cancel callback supplied at attach time reaches the fake as a third arg --- */
{
  const ref = fake.makeRef(".info/connected/case8");
  const handler = () => {};
  const onCancel = () => {};
  attach({ scope: "session", ref, event: "value", callback: handler, cancelCallback: onCancel, label: "case8" });
  const onFor8 = fake.onCalls.filter((c) => c.path === ".info/connected/case8");
  check("attach forwards the cancel callback to the fake as the third argument", onFor8.length === 1 && onFor8[0].cancelCallback === onCancel);
}

/* ---------- case 9: list() survives JSON.stringify and exposes no function or Reference values -- */
{
  const ref = fake.makeRef("rooms/t/case9");
  attach({ scope: "room", ref, event: "value", callback: () => {}, cancelCallback: () => {}, label: "case9" });
  const listing = list();
  let serialized;
  let threw = false;
  try {
    serialized = JSON.stringify(listing);
  } catch (e) {
    threw = true;
  }
  check("list() survives JSON.stringify", !threw && typeof serialized === "string");
  const leaksFunctionOrRef = listing.some((entry) => Object.values(entry).some((v) => typeof v === "function" || (v && typeof v === "object" && typeof v.on === "function")));
  check("list() exposes no function or Reference values", !leaksFunctionOrRef);
}

/* ---------- case 10: leak vector (a) — a room-scoped one-shot that never received a matching ---- */
/* ---------- reply is still removed by detachRoom(), not just left dangling forever -------------- */
// This is 09-03's Task 1 case: remotePrompt()/remoteDraftPrompt()'s response listeners already
// self-cancel correctly the instant a matching reply arrives (that's proven by case 2's shape, not
// this one) — the real gap D-02 names is a room that dies (or a target seat that never answers)
// while one of these is still pending. Room scope alone isn't enough to prove that gap is closed;
// the vacuity guard below fires the listener once BEFORE teardown to prove it was genuinely
// attached and live, not a case that only "passes" because nothing was ever really listening.
{
  const ref = fake.makeRef("rooms/t/case10-response");
  let firedBeforeTeardown = 0;
  const handler = () => {
    firedBeforeTeardown++;
  };
  attach({ scope: "room", ref, event: "value", callback: handler, label: "response:abandoned-q1" });
  // simulate a reply that does NOT match this decision's id — the callback bodies in index.html
  // only detach on a matching id, so a non-matching emit is exactly what "still pending" looks like
  ref.emit("value", { id: "not-mine" });
  check("vacuity guard: the abandoned one-shot is genuinely attached and firing before teardown", firedBeforeTeardown === 1, `firedBeforeTeardown=${firedBeforeTeardown}`);

  const removed = detachRoom();
  check("detachRoom() removes the still-pending one-shot (leak vector a)", removed > 0, `removed=${removed}`);
  check("the fake's listener list for the abandoned one-shot's path is empty after teardown", ref.listenerCount("value") === 0, `count=${ref.listenerCount("value")}`);

  ref.emit("value", { id: "still-not-mine" });
  check("emitting on the abandoned path after teardown never invokes the handler again", firedBeforeTeardown === 1, `firedBeforeTeardown=${firedBeforeTeardown}`);
}

console.log(`\n${failures === 0 ? "All cases passed." : failures + " case(s) FAILED."}`);
process.exit(failures === 0 ? 0 : 1);
