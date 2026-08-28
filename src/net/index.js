// src/net/index.js
//
// Phase 9 (SPLIT-04, D-05). Barrel for src/net/: Firebase app construction,
// config readiness, room-scoped teardown, and re-exports of the watcher
// transport wrappers. Only net-prefixed names (plus cfgReady) are exported
// from this file — the registry's own generic attach/detach/size/list names
// are deliberately not re-exported here, since this barrel is folded onto
// the classic script's global bridge and a bare `attach`/`detach`/`size`/
// `list` landing on that bridge would be far too easy to collide with an
// unrelated identifier.
//
// `firebase` is referenced only inside netInit()'s own function body, never
// at module top level — that is what lets this file (and everything that
// imports it) still import cleanly under plain Node with no DOM and no
// Firebase global present, which the Task 1 Node-import acceptance check
// depends on directly.

import { detach, detachRoom, detachAll, size, list } from "./registry.js";
import {
  netWatchFlip, netWatchConnected, netWatchPresence,
  netWatchChat, netWatchBattle,
  netWatchRecovery, netWatchDraftPrompt, netWatchEvents, netWatchPrompt,
  netWatchNarr,
  netWatchSeats, netWatchStatus, netWatchTurnOrder, netWatchRecipes,
  netWatchResponse, netWatchDraftResponse, netWatchPaused,
} from "./watchers.js";
import {
  netSetFlip,
  netSetPrompt, netRemovePrompt, netSetResponse,
  netSetNarr, netPushChat,
  netSetBattle, netRemoveBattle,
  netSetRecipes, netSetDraftPrompt, netRemoveDraftPrompt, netSetDraftResponse,
  netSetTurnOrder, netUpdateRoom, netDeleteRoom,
  netSetMeta, netWriteGameLog,
  netMarkPresence, netMarkHostGoneOnDisconnect, netClearHostGone,
  netForfeitOnDisconnect, netClearForfeitOnDisconnect,
  netSetDlog, netPushEvent,
  netSetRecovery, netRemoveRecovery,
  netCreateRoom, netSetFeedback, netSetPaused,
} from "./writers.js";
import {
  netReadMeta, netReadRoom, netReadDlog, netReadEv, netClaimSeat,
} from "./readers.js";

export {
  netWatchFlip, netWatchConnected, netWatchPresence,
  netWatchChat, netWatchBattle,
  netWatchRecovery, netWatchDraftPrompt, netWatchEvents, netWatchPrompt,
  netWatchNarr,
  netWatchSeats, netWatchStatus, netWatchTurnOrder, netWatchRecipes,
  netWatchResponse, netWatchDraftResponse, netWatchPaused,
};
export {
  netSetFlip,
  netSetPrompt, netRemovePrompt, netSetResponse,
  netSetNarr, netPushChat,
  netSetBattle, netRemoveBattle,
  netSetRecipes, netSetDraftPrompt, netRemoveDraftPrompt, netSetDraftResponse,
  netSetTurnOrder, netUpdateRoom, netDeleteRoom,
  netSetMeta, netWriteGameLog,
  netMarkPresence, netMarkHostGoneOnDisconnect, netClearHostGone,
  netForfeitOnDisconnect, netClearForfeitOnDisconnect,
  netSetDlog, netPushEvent,
  netSetRecovery, netRemoveRecovery,
  netCreateRoom, netSetFeedback, netSetPaused,
};
export {
  netReadMeta, netReadRoom, netReadDlog, netReadEv, netClaimSeat,
};

/* ================= Firebase config ================= */
/*  ▼▼▼  PASTE YOUR OWN FIREBASE PROJECT CONFIG HERE (see ONLINE_SETUP.md)  ▼▼▼  */
// Values copied byte-for-byte from the prior index.html declaration —
// retyping an apiKey or a databaseURL here would be a silent multiplayer
// outage, not a compile error, so this block is a copy, never a retype.
const firebaseConfig = {
  apiKey: "AIzaSyAA8FbPiKYc82MpCkQD2ABYirnnCl09OuA",
  authDomain: "pastry-pirates.firebaseapp.com",
  databaseURL: "https://pastry-pirates-default-rtdb.firebaseio.com",
  projectId: "pastry-pirates",
  storageBucket: "pastry-pirates.firebasestorage.app",
  messagingSenderId: "546790679465",
  appId: "1:546790679465:web:cdb72aa39660fca844dab8",
  measurementId: "G-2KK6EZDZSP"
};
/*  ▲▲▲  ---------------------------------------------------------------  ▲▲▲  */

export function cfgReady() {
  return firebaseConfig && firebaseConfig.databaseURL && !/PASTE_YOUR/.test(firebaseConfig.databaseURL);
}

// Constructs the Firebase app and returns a database handle, or null on a
// missing config / thrown init error. The caller keeps the returned handle
// in its own global exactly as before — de-globalizing that assignment is
// a later phase's job, not this one's.
export function netInit() {
  if (!cfgReady()) return null;
  // v2 ships without the Firebase SDK tags (solo / pass-and-play only), so the global is simply
  // absent. That is a supported configuration here, not a failure — check for it before touching
  // it, so a solo build boots with a clean console instead of a thrown ReferenceError caught one
  // line later. `typeof` is the one operator safe on an undeclared identifier.
  if (typeof firebase === "undefined") return null;
  try {
    firebase.initializeApp(firebaseConfig);
    return firebase.database();
  } catch (e) {
    console.error("Firebase init failed", e);
    return null;
  }
}

// Room-scoped teardown, wired into the production leave path (index.html's
// leaveGame()). Spares every session-scoped entry by construction — see
// registry.js's detachRoom(), which only ever touches "room"-scoped
// entries.
export function netLeaveRoom() {
  return detachRoom();
}

// Single-entry detach, exposed net-prefixed for the two self-cancelling
// one-shots (remotePrompt()/remoteDraftPrompt() in index.html): their own
// callback calls this the instant a matching reply arrives, instead of
// calling the Firebase removal API directly, so the registry's bookkeeping
// never goes stale on the normal self-cancel path (D-02, D-04).
export function netDetach(id) {
  return detach(id);
}

// The registry's generic surface, exposed under net-prefixed names for
// anything that needs it beyond the leave path above — currently only
// src/main.js's debug hook.
export function netDetachRoom() {
  return detachRoom();
}
export function netDetachAll() {
  return detachAll();
}
export function netRegistrySize(scope) {
  return size(scope);
}
export function netRegistryList() {
  return list();
}
