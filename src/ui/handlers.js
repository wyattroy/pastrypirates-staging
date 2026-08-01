// src/ui/handlers.js
//
// Phase 11 (SPLIT-03/06), wave 11-04. The injected-handler seam — the criterion-1 mechanism
// that keeps D-07's directional boundary ("ui may never import net") mechanically true as the
// UI functions that need a networking side effect leave the classic <script> region.
//
// This is the reverse of Phase 9's net->UI handler injection (src/net/watchers.js: net
// publishes, consumers subscribe via injected callbacks). Here UI PUBLISHES the render/turn
// events it produces, and the composition root (src/main.js) INJECTS the net-adjacent
// operations the UI needs to trigger as a result — so src/ui/ never needs its own `from
// "../net"` import to reach them.
//
// 11-04 resolved the first 2 of the six UI->orchestration edges RESEARCH.md's Q1b table
// identified through this seam: src/ui/panel.js's flash() calls the injected `onBroadcast` (was
// a direct netNarrate(...) call) and liveRender() calls the injected `onEvents` (was a direct
// pushEvents() call). 11-05 resolves the remaining 3 UI-side edges the same way, in
// src/ui/flow.js: remotePickHighlights() calls `onRespond` (was sendResponse(...)),
// endReplay() calls `onRecovery` (was setRecoveryState(...)), and wireRestoreFail() calls both
// `onRecovery` and `onLeave` (was setRecoveryState(...) + leaveGame()). That is all 5 of the
// milestone's UI-side seam edges — the 6th (battleAsk) is orchestration (calls net-adjacent
// functions directly), not a UI-side injected-handler edge, and is homed in 11-06. All five
// targets (netNarrate/pushEvents/sendResponse/setRecoveryState/leaveGame) are themselves still
// classic-script globals this wave — not yet modularized into src/net/ — so src/main.js wires
// them in through the still-present PP bridge as a deliberate, temporary, explicitly-commented
// composition-root-only use of globalThis. This is formalized to real src/net/ imports once the
// room-lifecycle/orchestration functions themselves modularize (11-06).
//
// setNetHandlers() merges onto the existing handler set (Object.assign, never a full replace)
// so a later wave can register additional handlers without every earlier caller needing to know
// about them, or without clobbering handlers a different wave already registered.
//
// 11-07 (bridge deletion, post-hoc fix): deleting the bridge exposed a class of bare cross-module
// CALLS the bridge had been silently satisfying, beyond the 5 net-adjacent edges 11-04/11-05
// resolved through this same mechanism. Two distinct sub-cases, both routed through this SAME
// seam rather than two different mechanisms:
//   (a) ui -> src/orchestrator.js (main-tier) edges — src/ui/ can never import a main-tier file
//       (module_graph_check.js's directional rule), so any orchestrator function a ui-tier module
//       needs to CALL (not just have injected as a one-off callback) has no direct-import option
//       at all, regardless of which ui file needs it.
//   (b) ui -> ui SIBLING edges that would otherwise form an import cycle — e.g. src/ui/util.js is
//       imported BY src/ui/board.js/panel.js/flow.js, so util.js importing any of THEM back
//       (to reach a rendering function it needs) would close a cycle module_graph_check.js's
//       "no import cycle" assertion forbids. Routing the call through this seam instead of a
//       direct import adds no import edge at all — it's a runtime property lookup on a plain
//       object populated by src/main.js, which can import every tier unrestricted.
// The naming convention shifts slightly for this larger batch: the original 5 keys name the
// SEMANTIC EVENT (onBroadcast, onEvents, onRespond, onRecovery, onLeave); the 11-07 additions
// name the TARGET FUNCTION directly (onRemotePrompt, onBeginGame, onLiveRender, ...) since each
// new key maps 1:1 to exactly one function with no other consumer, and inventing a distinct
// event-style name for each would add naming work with no disambiguation benefit. See
// src/main.js's own setNetHandlers({...}) call for the full, current key -> function mapping.

let _h = {};

export function setNetHandlers(h) {
  Object.assign(_h, h);
}

// Narrow read accessor for the UI functions that need to reach an injected handler. Deliberately
// a function (not the object exported directly) so every caller always sees the LIVE handler
// set at call time, never a snapshot taken before setNetHandlers() ran (module-load order between
// src/ui/index.js's barrel and src/main.js's composition-root wiring is not otherwise guaranteed).
export function netHandlers() {
  return _h;
}
