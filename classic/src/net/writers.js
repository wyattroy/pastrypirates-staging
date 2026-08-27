// src/net/writers.js
//
// Phase 9 (SPLIT-04, D-06/D-08/D-09). One function per Firebase write. Each
// performs exactly one `set`, `push`, `update` or `remove` on a path built
// from the same expression the call site used before it moved here, with
// the caller's own error reporter attached as a rejection handler only when
// one is supplied. Nothing else: no guard, no UI call, no app-state read,
// no logging of its own beyond the reporter the caller hands in.
//
// What stays behind, and why (see index.html, not here):
//   - The error-surfacing helper that drives the visible "sync trouble"
//     banner toggles a DOM element — that's UI, so it stays in index.html
//     and is passed into every writer
//     below as a plain function argument, exactly as it was passed to
//     `.catch(...)` before the move. The chat push and the feedback write
//     are the two exceptions in the current code — both use an inline
//     console.error rather than the shared helper. That difference is
//     preserved rather than normalised away; normalising it would add a
//     visible sync-trouble banner to failures that deliberately don't raise
//     one today.
//   - The host-authority and mid-replay-suppression checks sit ahead of
//     most of these writes at their call sites. They stay there. Every
//     writer below is unconditional — moving a guard in here would make
//     this module read app state, and would move a host-authority decision
//     out of the layer that owns it (D-08).
//   - Every payload object is constructed by the caller and passed in
//     whole; no writer below re-derives a value from who's currently
//     seated, the local seat, the shot-clock timing, or any other
//     application state. This module never reads a value it wasn't handed
//     as an argument.
//
// A writer attaches `.catch(onError)` only when `onError` is truthy. Some
// call sites already wrap their write in a `try`/`await` (createRoom,
// startGame) with no `.catch` at all — those callers pass no error reporter,
// and the returned promise is left to reject exactly as it did before the
// move, so the caller's own try/catch still sees the rejection.
//
// Decision-log ordering (D-09) and the event-feed push loop are the two
// writes this file must not "improve": one write per call, issued exactly
// where the caller already issues it, fire-and-forget, never batched into
// an array-and-flush and never awaited. Nothing in this file adds either.

function withReporter(promise, onError) {
  return onError ? promise.catch(onError) : promise;
}

/* ---------- flip / clock / timer --------------------------------------------------------------- */

export function netSetFlip(db, room, state, onError) {
  return withReporter(db.ref("rooms/" + room + "/flip").set({ state, t: Date.now() }), onError);
}

export function netSetClock(db, room, payload, onError) {
  return withReporter(db.ref("rooms/" + room + "/clock").set(payload), onError);
}

export function netSetTimerOff(db, room, val, onError) {
  return withReporter(db.ref("rooms/" + room + "/timerOff").set(val), onError);
}

// CLOCK-02: host-authoritative whole-table pause/resume flag, same
// withReporter(db.ref(...).set(val), onError) shape as netSetTimerOff above —
// any client (host or guest) may write it, but only the host's watchPause
// branch reacts to it authoritatively (src/orchestrator.js).
export function netSetPaused(db, room, val, onError) {
  return withReporter(db.ref("rooms/" + room + "/paused").set(val), onError);
}

/* ---------- prompt / response (the shared singular prompt node) -------------------------------- */

export function netSetPrompt(db, room, payload, onError) {
  return withReporter(db.ref("rooms/" + room + "/prompt").set(payload), onError);
}

export function netRemovePrompt(db, room, onError) {
  return withReporter(db.ref("rooms/" + room + "/prompt").remove(), onError);
}

export function netSetResponse(db, room, payload, onError) {
  return withReporter(db.ref("rooms/" + room + "/response").set(payload), onError);
}

/* ---------- narration ------------------------------------------------------------------------- */

// D-10 (Phase 15 narration audit): additive 5th `variants` param — omitted from the written
// payload entirely when absent/empty, so the common-case write stays byte-identical to before
// this wave (an old client reading a new payload, or a new client reading an old one, both
// degrade to the payload's own `html` — see src/ui/util.js's pickNarrVariant()).
export function netSetNarr(db, room, html, onError, variants) {
  const payload = variants && variants.length ? { html, t: Date.now(), variants } : { html, t: Date.now() };
  return withReporter(db.ref("rooms/" + room + "/narr").set(payload), onError);
}

/* ---------- chat --------------------------------------------------------------------------------
   Failure handler is the caller's own inline console.error, not the shared sync-trouble helper —
   preserved exactly, never normalised onto that helper (see file header). */

export function netPushChat(db, room, payload, onError) {
  return withReporter(db.ref("rooms/" + room + "/chat").push(payload), onError);
}

/* ---------- battle scoreboard -------------------------------------------------------------------- */

export function netSetBattle(db, room, snapshot, onError) {
  return withReporter(db.ref("rooms/" + room + "/battle").set(snapshot), onError);
}

export function netRemoveBattle(db, room, onError) {
  return withReporter(db.ref("rooms/" + room + "/battle").remove(), onError);
}

/* ---------- recipe drafting -------------------------------------------------------------------- */

export function netSetRecipes(db, room, picks, onError) {
  return withReporter(db.ref("rooms/" + room + "/recipes").set(picks), onError);
}

export function netSetDraftPrompt(db, room, seat, payload, onError) {
  return withReporter(db.ref("rooms/" + room + "/draftPrompts/" + seat).set(payload), onError);
}

export function netRemoveDraftPrompt(db, room, seat, onError) {
  return withReporter(db.ref("rooms/" + room + "/draftPrompts/" + seat).remove(), onError);
}

export function netSetDraftResponse(db, room, seat, payload, onError) {
  return withReporter(db.ref("rooms/" + room + "/draftResponses/" + seat).set(payload), onError);
}

/* ---------- turn order / room status ------------------------------------------------------------ */

export function netSetTurnOrder(db, room, order, onError) {
  return withReporter(db.ref("rooms/" + room + "/turnOrder").set(order), onError);
}

// Reused for both the room-scoped "status: ended" patch (with an error
// reporter, fire-and-forget) and startGame()'s much larger "status:
// playing" reset patch (no reporter — that call site already wraps its own
// try/await, so the rejection is left to propagate there exactly as before
// the move).
export function netUpdateRoom(db, room, patch, onError) {
  return withReporter(db.ref("rooms/" + room).update(patch), onError);
}

// Delete a lobby the host backed out of, so abandoning "Host a Crew" does not leave an orphan room
// sitting in the database advertising a code nobody is waiting on. Only ever called by the host, and
// only from the lobby — a room that has started playing is left alone (see abandonRoom()).
export function netDeleteRoom(db, room, onError) {
  return withReporter(db.ref("rooms/" + room).remove(), onError);
}

/* ---------- end-of-voyage meta / voyage transcript log -------------------------------------------- */

export function netSetMeta(db, room, meta, onError) {
  return withReporter(db.ref("rooms/" + room + "/meta").set(meta), onError);
}

export function netWriteGameLog(db, ts, payload, onError) {
  return withReporter(db.ref("gamelogs/" + ts).set(payload), onError);
}

/* ---------- presence -----------------------------------------------------------------------------
   Both the mark and the disconnect handler swallow their own failures silently — an older Firebase
   project whose rules predate the presence node will permission-deny these, and that's a nice-to-
   have busy indicator, not core gameplay, so it fails quietly rather than surfacing a banner. */

export function netMarkPresence(db, myId) {
  const myRef = db.ref("presence/" + myId);
  myRef.onDisconnect().remove().catch(() => {});
  myRef.set(true).catch(() => {});
}

/* ---------- decision log (D-09: ordering is load-bearing) ---------------------------------------- */

export function netSetDlog(db, room, n, encoded, onError) {
  return withReporter(db.ref("rooms/" + room + "/dlog/" + n).set(encoded), onError);
}

/* ---------- broadcast event feed ------------------------------------------------------------------
   One write per call, issued once per loop iteration by the caller — the loop and its counter stay
   in index.html; this is only the single push itself. */

export function netPushEvent(db, room, event, onError) {
  return withReporter(db.ref("rooms/" + room + "/ev").push(event), onError);
}

/* ---------- host-repair recovery strip ----------------------------------------------------------- */

export function netSetRecovery(db, room, payload, onError) {
  return withReporter(db.ref("rooms/" + room + "/recovery").set(payload), onError);
}

export function netRemoveRecovery(db, room, onError) {
  return withReporter(db.ref("rooms/" + room + "/recovery").remove(), onError);
}

/* ---------- room lifecycle ------------------------------------------------------------------------
   createRoom() awaits this with its own try/catch — no reporter is passed, so a rejection
   propagates exactly as it did before the move. */

export function netCreateRoom(db, code, payload) {
  return db.ref("rooms/" + code).set(payload);
}

/* ---------- feedback -------------------------------------------------------------------------------
   Failure handler is the caller's own inline console.error, not the shared sync-trouble helper —
   same preserved difference as the chat push above. */

export function netSetFeedback(db, ts, payload, onError) {
  return withReporter(db.ref("feedback/" + ts).set(payload), onError);
}
