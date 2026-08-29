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
// 02.15-01: additive 6th `wait` param, same shape as `variants` above — omitted from the written
// payload entirely when falsy, so the common-case write stays byte-identical and an old client
// reading a new payload simply never sees the key. A wait line registers no dismissal deadline on
// the client that draws it (see stageFlash); without this field the guest's copy would expire on
// the hold curve while the host's sat there, which is a NEW divergence in the act of closing four.
export function netSetNarr(db, room, html, onError, variants, wait, subj, evN) {
  const payload = variants && variants.length ? { html, t: Date.now(), variants } : { html, t: Date.now() };
  if (wait) payload.wait = 1;
  /* W4-2 / rule 23 — THE SUBJECT CROSSES THE WIRE, because otherwise two seats decide it two ways.
     A narration bubble anchors to a captain's boat when it has a subject and is centred when it does
     not. The HOST computes that from the event itself (panel.js: an event naming two captains is not
     about one of them, so a battle is centred). A GUEST never sees the event — it receives this
     payload and, with no subject in it, falls back to sniffing the sentence for captain colours,
     which anchors whenever exactly ONE captain is named. A battle result names exactly one, the
     winner. So the host centred it and the guest anchored it: the same line drawn two ways, which
     CEO Review 20 found still broken on the seat Wyatt actually reported.
     Sent as -1 rather than omitted when the host decided "no subject", because ABSENT and
     DELIBERATELY NONE are different: absent must keep meaning "fall back to the sniff", or every
     turn-start line an older client draws would lose its anchor. Additive and omitted when there is
     nothing to say, the same shape `wait` and `variants` already use. */
  if (subj != null) payload.subj = subj;
  else if (subj === null) payload.subj = -1;
  /* Q-18 — THE LINE SAYS WHICH EVENT IT BELONGS TO. Wyatt's ruling, 2026-08-29: "send the event
     too", so the guest stops having to guess what a drawn sentence implies.
     THE SENTENCE AND THE EVENT TRAVEL ON TWO SEPARATE PATHS — `rooms/<room>/narr` (here) and
     `rooms/<room>/ev` (netPushEvent) — watched by two independent listeners with NO ordering
     between them. On the host both happen inside one local call and are always in step; on the
     guest they are two messages that can land in either order. MEASURED, 12 minutes of a real
     two-browser game: twice the guest drew a trade sentence while its captains box still showed
     the pre-trade purse, and twice the mirror image. Both totals were right on both screens —
     each had applied a COMPLETE trade, at a different moment. Rule 23 in its plainest form: two
     things kept in step by nothing.
     WHY A SERIAL AND NOT THE EVENT ITSELF, and this is the part the first cut of it got wrong.
     Wyatt's ruling was "the guest PREFERS THE REAL EVENT" — and it already holds every event:
     watchEvents pushes each one onto the guest's own array. So the serial is not a substitute for
     the event, it is the ADDRESS OF an event the guest already has. It waits until it holds that
     event, then runs the same shared rule over it that the host ran. Zero extra bytes, and the
     rule lives in exactly one place (src/shared/index.js). `subj` below survives only as the
     fallback for a line that has no event at all. */
  if (evN != null) payload.evN = evN;
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

/* ---------- the host's hand on the wheel (host-gone detection) ------------------------------------
   Wyatt, 2026-08-20: "when the host leaves, the guest isn't told anything; the game simply stalls."
   He was right that nothing existed. netMarkPresence above is GLOBAL — a site-wide busy counter —
   and says nothing about whether a particular room still has a host in it. abandonRoom() does delete
   a room, but it is lobby-only by explicit design ("a room that has already started playing is never
   deleted here, because that would strand everyone else at the table"). So a host who closed the tab
   mid-voyage left the room sitting in the database and every guest waiting forever for events that
   were never coming.

   WHY onDisconnect AND NOT A HEARTBEAT: onDisconnect is armed on the SERVER, so it fires for the
   cases a client-side goodbye cannot cover — the tab closed, the browser crashed, the wifi dropped.
   A goodbye handler only covers the one case where the host politely leaves.

   IT WRITES status, NOT A NEW FIELD, on purpose. The guest already watches rooms/<CODE>/status
   (netWatchStatus, attached in watchRoom), the host already writes it, and /rooms is open in the
   security rules — so this adds a value to a channel that already exists rather than a node that
   might be permission-denied on an older project (the trap the presence note above describes).

   CANCELLING IS NOT OPTIONAL. The host sets status:"ended" at a normal finish and then quite
   reasonably closes the tab — at which point an armed onDisconnect would overwrite that "ended"
   with "hostgone" and tell everyone the host bailed on a game they actually completed. Every exit
   that is NOT an abandonment must call netClearHostGone() first. */

export function netMarkHostGoneOnDisconnect(db, room) {
  if (!db || !room) return;
  db.ref("rooms/" + room + "/status").onDisconnect().set("hostgone").catch(() => {});
}

export function netClearHostGone(db, room) {
  if (!db || !room) return;
  db.ref("rooms/" + room + "/status").onDisconnect().cancel().catch(() => {});
}

/* ---------- a captain who drops mid-bake does not stall the table (MP-13, 04-01 Task 4) ----------
   Wyatt, 2026-08-18: the bake-off's finish line gets AS LONG AS IT NEEDS — no shot clock. That
   removes the only thing that used to stop an absent captain hanging the whole voyage, so the two
   halves ship together or neither does: the clock goes, and the fallback fires on PRESENCE LOSS
   instead of on a countdown.

   WHY onDisconnect AND NOT A HEARTBEAT — the same reason netMarkHostGoneOnDisconnect above gives:
   it is armed on the SERVER, so it fires for the cases a client-side goodbye cannot cover — the tab
   closed, the browser crashed, the wifi dropped.

   IT NEEDS NO NEW WATCHER AND NO NEW NODE. The host is ALREADY holding an open promise on
   rooms/<CODE>/response, waiting for this captain's answer. So the captain arms a write to that
   same node carrying only the prompt's id and NO `choice`; remotePrompt resolves
   `v.choice===undefined?null:v.choice`, and the existing tail already treats a null as *forfeit to
   the engine's own guess, having bought nothing*. One decision-log entry, both facts, exactly as a
   completed bake writes.

   CANCELLING IS NOT OPTIONAL. netMarkHostGoneOnDisconnect earned that in capitals and the failure
   here is the same shape: an armed handler that outlives a real answer would forfeit a bake the
   captain actually completed. Cancel the moment the answer is sent, and on every other exit.
   (There is one belt behind it, and it is worth knowing rather than relying on: the payload carries
   the prompt's OWN id, so a stale firing lands on a node whose watcher is looking for a different
   id and is ignored. That is a second line of defence, not a reason to skip the cancel.)

   BOTH SWALLOW THEIR OWN FAILURES, matching the presence writers directly above: an older Firebase
   project can permission-deny an onDisconnect, and HARD-WON-LESSONS §1b is explicit that a throw in
   the turn chain is an invisible stall the console never shows. A forfeit that could not be armed
   is a game that behaves exactly as it did yesterday; a throw is a voyage that stops. */

export function netForfeitOnDisconnect(db, room, id) {
  if (!db || !room || !id) return;
  db.ref("rooms/" + room + "/response").onDisconnect().set({ id }).catch(() => {});
}

export function netClearForfeitOnDisconnect(db, room) {
  if (!db || !room) return;
  db.ref("rooms/" + room + "/response").onDisconnect().cancel().catch(() => {});
}

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
