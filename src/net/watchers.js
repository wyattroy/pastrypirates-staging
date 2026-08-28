// src/net/watchers.js
//
// Phase 9 (SPLIT-04/NET-01/NET-02, D-05/D-06). Thin transport wrappers: each
// function builds the Firebase Reference, picks a scope and a label, and
// hands the caller's own handler straight to the registry's attach() as the
// callback itself. Nothing here wraps, adapts, or inspects the handler, and
// nothing here reads any state belonging to the caller.
//
// The handler is passed through unmodified on purpose. The caller's handler
// receives exactly the argument the underlying transport passes to it — no
// extraction, no truthiness check, no shape change happens in this file.
// That is what lets a callback body move across as a plain function
// argument with zero edits: the identity the registry later hands to its
// own teardown call is the exact same function object the caller supplied,
// never a wrapper around it. Any wrapping layer here would break that
// identity and reintroduce the reference-identity problem this whole
// module exists to close, just one level removed.
//
// No emitter, no deferred dispatch: every attach below is a direct pass of
// the caller's handler into the registry, which itself performs the one
// permitted listener-attach call synchronously, in the same tick the
// underlying transport fires. Nothing in this file defers that call to a
// later turn of the event loop.
//
// This file has exactly one dependency: the registry. It reads no state
// belonging to whatever calls it, and it never reads a value out of the
// page beyond what's passed in as an argument.

import * as registry from "./registry.js";

export function netWatchFlip(db, room, handler) {
  if (!db || !room) return null;
  const ref = db.ref("rooms/" + room + "/flip");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "flip" });
}

// Session-scoped (D-04's Pattern 3 scoping): attached once per page life
// from the caller's own connection-setup routine, independent of which
// room (if any) is open. Must never be torn down by a room-scoped teardown
// — see registry.js's detachRoom(), which only ever touches "room" entries.
// `label` names WHICH consumer this is, and it is the reason this parameter exists at all.
// The registry's key is scope|ref|event|label and it refuses a duplicate on purpose (a repeated
// key is nearly always a double-invoked entry point). But .info/connected has TWO legitimate,
// independent consumers — presence marking, and the host-gone reconnect repair — and while both
// passed the same hardcoded label, the one that attached second was refused and never ran at all.
// docs/MODULES.md:155 states each wrapper "chooses a scope and a label"; letting the caller name
// itself keeps the duplicate guard intact rather than weakening it. Covered by
// 4/scripts/net_connected_twin_test.js, which also asserts the guard still fires on a true repeat.
export function netWatchConnected(db, handler, onCancel, label = "connected") {
  const ref = db.ref(".info/connected");
  return registry.attach({ scope: "session", ref, event: "value", callback: handler, cancelCallback: onCancel, label });
}

export function netWatchPresence(db, handler, onCancel) {
  const ref = db.ref("presence");
  return registry.attach({ scope: "session", ref, event: "value", callback: handler, cancelCallback: onCancel, label: "presence" });
}



export function netWatchChat(db, room, handler) {
  if (!db || !room) return null;
  const ref = db.ref("rooms/" + room + "/chat");
  return registry.attach({ scope: "room", ref, event: "child_added", callback: handler, label: "chat" });
}

export function netWatchBattle(db, room, handler) {
  if (!db || !room) return null;
  const ref = db.ref("rooms/" + room + "/battle");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "battle" });
}

export function netWatchRecovery(db, room, handler) {
  if (!db || !room) return null;
  const ref = db.ref("rooms/" + room + "/recovery");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "recovery" });
}

// The seat is supplied by the caller as a plain argument rather than read
// from a global — this module reads no state belonging to whatever calls
// it (see the file header). The call site this replaces carried no guard,
// so none is added here.
export function netWatchDraftPrompt(db, room, seat, handler) {
  const ref = db.ref("rooms/" + room + "/draftPrompts/" + seat);
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "draftPrompts" });
}

// No guard at the call site this replaces — none added here.
export function netWatchEvents(db, room, handler) {
  const ref = db.ref("rooms/" + room + "/ev");
  return registry.attach({ scope: "room", ref, event: "child_added", callback: handler, label: "ev" });
}

// No guard at the call site this replaces — none added here.
export function netWatchPrompt(db, room, handler) {
  const ref = db.ref("rooms/" + room + "/prompt");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "prompt" });
}

// No guard at the call site this replaces — none added here.
export function netWatchNarr(db, room, handler) {
  const ref = db.ref("rooms/" + room + "/narr");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "narr" });
}

// ---------------------------------------------------------------------
// Phase 9 Plan 2, Task 2. The last four plain watchers: seats, status,
// turn order, recipe picks. The seats/status pair used to attach from a
// single caller function — each gets its own wrapper and its own label
// here so the registry lists (and can tear down) each independently.
// No guard at either of those two call sites; none added here.
// ---------------------------------------------------------------------

export function netWatchSeats(db, room, handler) {
  const ref = db.ref("rooms/" + room + "/seats");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "seats" });
}

// The handler this wrapper carries awaits a follow-up read in its own
// declaration, one file over — that stays true here too. A function is a
// single stable reference regardless of how its body is declared, so
// passing it through unwrapped, exactly like every other handler in this
// file, changes nothing about identity; only the caller's own declaration
// site decides whether its body awaits anything, and this file is not
// that site.
export function netWatchStatus(db, room, handler) {
  const ref = db.ref("rooms/" + room + "/status");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "status" });
}

export function netWatchTurnOrder(db, room, handler) {
  if (!db || !room) return null;
  const ref = db.ref("rooms/" + room + "/turnOrder");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "turnOrder" });
}

export function netWatchRecipes(db, room, handler) {
  if (!db || !room) return null;
  const ref = db.ref("rooms/" + room + "/recipes");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label: "recipes" });
}

// ---------------------------------------------------------------------
// Phase 9 Plan 3, Task 1 (D-02). The last two watchers: the self-cancelling
// one-shot response listeners behind remotePrompt()/remoteDraftPrompt(). The
// caller supplies a label that carries the prompt's own unique id (not just
// a static string like the sixteen wrappers above) — the registry's
// duplicate-attach key includes the label, so two prompts issued
// sequentially against the same response path never collide with the
// registry's duplicate-attach refusal once the first has detached. Both
// return the registry id: the caller needs it to detach itself the instant
// a matching reply arrives, which is what preserves the self-cancelling
// semantics D-02 requires untouched. Room-scoped like every other watcher
// here, so a room teardown also removes one that never received a reply —
// that room-death case is the actual gap D-02 names; the normal
// self-cancel path is unchanged.
// ---------------------------------------------------------------------

export function netWatchResponse(db, room, handler, label) {
  const ref = db.ref("rooms/" + room + "/response");
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label });
}

export function netWatchDraftResponse(db, room, seat, handler, label) {
  const ref = db.ref("rooms/" + room + "/draftResponses/" + seat);
  return registry.attach({ scope: "room", ref, event: "value", callback: handler, label });
}
