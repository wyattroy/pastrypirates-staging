// src/net/readers.js
//
// Phase 9 (SPLIT-04, D-06). One-shot reads. Each function returns the raw
// promise from the underlying Firebase call — never a transformed value —
// so every caller's own handling (the `.val()` extraction, the existence
// check, the try/catch, the failure recording, the `.then()`/`.catch()`
// chain) stays exactly where it is in index.html, untouched by the move.
//
// This matters most for the resume path (resumeHostGame): the BUG-03
// comment block there documents why a thrown read, a successful empty
// read, and a successful read with data must stay three distinguishable
// outcomes. Returning a transformed value here — even something as
// small as `.val()` — would collapse two of those three outcomes into one
// before the caller ever sees them. Nothing in this file calls `.val()`,
// checks `.exists()`, or catches anything on the caller's behalf.
//
// The seat-claim transaction takes the caller's updater function as an
// argument rather than moving the updater's body here: that body closes
// over the typed player name, the local id, and a shared default-name
// helper — all application state this module never reads (see
// src/net/writers.js's file header for the same rule applied to writes).

export function netReadMeta(db, room) {
  return db.ref("rooms/" + room + "/meta").get();
}

// Reused for every "read the room document" call site — the lobby/room
// path is built from a room code before a room is joined (joinRoom) and
// from the already-joined room variable everywhere after (watchRoom,
// startGame, boot's resume path). Same path shape either way; the caller
// decides which value to pass.
export function netReadRoom(db, roomOrCode) {
  return db.ref("rooms/" + roomOrCode).get();
}

export function netReadDlog(db, room) {
  return db.ref("rooms/" + room + "/dlog").get();
}

export function netReadEv(db, room) {
  return db.ref("rooms/" + room + "/ev").get();
}

export function netClaimSeat(db, code, updater) {
  return db.ref("rooms/" + code + "/seats").transaction(updater);
}
