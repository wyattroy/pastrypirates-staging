// src/main.js
//
// Module entry point (D-13, D-14). Phase 7 proved the zero-build module-loading contract here.
// Phase 8 introduced a temporary global-object bridge (a `window.PP` namespace plus a spread of
// every tier's exports onto the global object) so the still-classic <script> region could keep
// resolving engine/shared/net/state/ui/orchestrator symbols as bare identifiers while extraction
// was still in progress. Phase 11
// (11-07) completes that extraction and DELETES the bridge: the classic <script> region itself
// is now gone from index.html, every one of the ~183 moved functions resolves through a normal
// ES-module import, and this file is the sole composition root — it imports every tier, wires
// the UI's injected-handler seam to real orchestrator functions, owns the single deliberate
// retained global (`window.revealMyRecipe`, D-05), calls `boot()` directly, and hosts the small
// handful of top-level browser-lifecycle statements (auto-pause, clock tick, resize/orientation)
// that used to live in the classic script as bare top-level statements (never function
// declarations, so they never showed up in analyze_classic.mjs's function-only inventory, but  [ROOT-TREE-CITATION: analyze_classic.mjs reads the root tree on purpose — true as written]
// still needed a real home once that region was deleted).

import { MODULE_OK_FLAG } from "./module-contract.js";
import * as net from "./net/index.js";
import * as stateNs from "./state/index.js";
import * as ui from "./ui/index.js";
import * as orchestrator from "./orchestrator.js";
import { boot } from "./orchestrator.js";
import { initStage } from "./ui/stage.js";

// D-15 (amended): the marker assignment must be guarded — `window` is
// undeclared under plain Node and a bare reference throws ReferenceError,
// which would break the Node-side half of Success Criterion 1. Indexing
// `window` with the imported flag (rather than a literal property name)
// makes the leaf import load-bearing: a silent resolution failure would
// leave the marker unset, not merely unused.
if (typeof window !== "undefined") {
  window[MODULE_OK_FLAG] = true;

  // D-17: standing tripwire for a classic-before-module load-order
  // regression in Phases 8-11. Scoped to the browser branch alongside the
  // `typeof window` guard — under Node there is no script ordering to
  // regress, so this has nothing to report there. `typeof` is used because
  // it is the one operator safe on an undeclared identifier; a truthiness
  // check on a bare `firebase` reference would throw under exactly the
  // conditions this tripwire exists to catch.
  // v2: the Firebase SDK is deliberately not on the page — this build is solo and pass-and-play
  // only. A missing global is therefore the EXPECTED state, and the v1 tripwire that reported it
  // as broken script order would fire on every single boot. Restoring the two SDK <script> tags in
  // index.html is what brings multiplayer (and this check's usefulness) back.

  // 11-04/11-05/11-06/11-07: the injected-handler seam (D-07/criterion 1), fully formalized.
  // src/ui/panel.js's flash()/liveRender() and src/ui/flow.js's remotePickHighlights()/
  // endReplay()/wireRestoreFail() never call netNarrate()/pushEvents()/sendResponse()/
  // setRecoveryState()/leaveGame() directly (that would be a UI->net import) — they call
  // through src/ui/handlers.js's netHandlers() accessor instead, and THIS composition root
  // wires the actual net-adjacent operations in, bound directly by reference to
  // src/orchestrator.js's exports. No bridge/globalThis indirection remains anywhere in this
  // wiring. This is the ORIGINAL 5 of the milestone's UI-side seam edges (RESEARCH.md Q1b) — the
  // 6th (battleAsk) is orchestration, homed in src/orchestrator.js, not a UI-side
  // injected-handler edge in the ORIGINAL table.
  //
  // 11-07 (bridge deletion, post-hoc fix): deleting the bridge exposed a much larger set of bare
  // cross-module CALLS the bridge had been silently satisfying beyond those original 5 edges —
  // caught by a dedicated no-undef gate (4/scripts/no_undef_check.js) added this same wave, and
  // (CORRECTED 03-01/TEST-07: this said `scripts/no_undef_check.js`  [ROOT-TREE-CITATION: no_undef_check.js named here IS the root copy, deliberately], which scans the
  // root game's src/ and has never opened this file. The 4/ copy is byte-identical and tree-relative,
  // so it is the one that actually covers this tree — HARD-WON-LESSONS §3. It is NOT yet in npm test.)
  // confirmed independently in a live Chrome session (renderDecorativeBoard/startSinglePlayer
  // threw ReferenceError on the bridge-deleted build). Every one of the keys below is either (a)
  // a src/orchestrator.js (main-tier) function a ui-tier module needs to CALL — src/ui/ can never
  // import a main-tier file, so there is no direct-import alternative regardless of which ui file
  // needs it — or (b) a ui-tier SIBLING function that would otherwise close an import cycle (e.g.
  // src/ui/util.js is imported BY board.js/panel.js/flow.js, so it can never import any of them
  // back). See src/ui/handlers.js's own header and src/ui/util.js's header for the full account
  // of which case each edge is and why. Naming: the original 5 keys name the semantic EVENT; the
  // additions below name the TARGET FUNCTION directly, since each maps 1:1 to exactly one
  // function with no other consumer.
  ui.setNetHandlers({
    onBroadcast: orchestrator.netNarrate,
    onEvents: orchestrator.pushEvents,
    // onRespond: 02.15-02 Task 3 retired remotePickHighlights(), its only consumer. Left wired,
    // deliberately unused — deleting a composition-root entry is a cleanup, not part of an
    // architecture drop, and touching this file here would widen the diff for no player benefit.
    onRespond: orchestrator.sendResponse,
    onRecovery: orchestrator.setRecoveryState,
    onLeave: orchestrator.leaveGame,
    // 11-07 additions — src/orchestrator.js (main-tier) targets:
    onRemotePrompt: orchestrator.remotePrompt,
    // 04-01 Task 3 (MP-05): the bake-off's bench moments. A (a)-case edge — benchPublish is
    // main-tier (it reaches src/net/) and src/ui/ can never import a main-tier file.
    onBenchPublish: orchestrator.benchPublish,
    onRemoteDraftPrompt: orchestrator.remoteDraftPrompt,
    onLogDecision: orchestrator.logDecision,
    onBeginGame: orchestrator.beginGame,
    onBroadcastFlip: orchestrator.broadcastFlip,
    onTogglePause: orchestrator.togglePause,
    onCreateRoom: orchestrator.createRoom, // UI-05: "Host a Crew" creates the room directly
    onNetBroadcast: orchestrator.netBroadcast,
    onRenderBattle: orchestrator.renderBattle,
    onConsumeEvent: orchestrator.consumeEvent,   // W1: the ONE event consumer — liveRender's drain reaches it through this seam
    onBattleAsk: orchestrator.battleAsk,
    onAsyncBattle: orchestrator.asyncBattle,
    // Wyatt's problem 5 (2026-08-23): endReplay tells the orchestrator the resumed host is live
    // again, so the host-gone safety net is re-armed for the NEW connection (the old one's
    // server-side onDisconnect burned when it fired). An (a)-case edge like onRemotePrompt:
    // armHostGone reaches src/net/ and flow.js can never import a main-tier file.
    onHostBack: orchestrator.armHostGone,
    // 11-07 additions — ui-tier sibling targets (cycle-avoidance, not net-adjacency):
    onEndReplay: ui.endReplay,
    onLocalAsk: ui.localAsk,
    onLiveRender: ui.liveRender,
    onFlash: ui.flash,
    onSetClockUI: ui.setClockUI,
    onNarrateLastEvent: ui.narrateLastEvent,
    // his item 7 (rule 23): the once-per-voyage black-market ceremony, reached by BOTH narration
    // paths through util.js's eventCeremony(). panel.js owns the card; util.js owns the gate and
    // cannot import panel.js back without closing a cycle, so the edge comes through here — the
    // same (b)-case cycle-avoidance as onLiveRender and onFlash directly above.
    onDryCeremony: ui.dryCeremony,
    onPopEmoji: ui.popEmoji,
    onRender: ui.render,
  });

  // Phase 9's debug hook (NET-03 observation point, GLOBAL-03's seed for a
  // future single documented debug mechanism). Deliberately carries no
  // bridge-removal tag: it is meant to outlive the bridge, as a permanent, named
  // observation surface for the registry's own bookkeeping.
  window.__pp_net_debug = {
    size: net.netRegistrySize,
    list: net.netRegistryList,
    detachRoom: net.netDetachRoom,
    detachAll: net.netDetachAll,
  };

  // GLOBAL-03/D-09: the fourth named debug hook, landed under the same "single documented
  // mechanism" umbrella as the three above rather than a new ad-hoc window.* global. Unlike
  // __pp_net_debug (a namespace of live function references, safe to call at any time),
  // exposing appState directly would hand a console/MCP session the SAME mutable object every
  // classic-script write mutates — see src/state/index.js's header on why the appState BINDING
  // must never be reassigned; exposing the live object as a debug hook has the identical hazard
  // one level down, since calling this and writing back into the result would silently corrupt
  // authoritative game state with no error. So this is a helper FUNCTION, not a plain property
  // assignment of the object itself: each call returns a fresh `{...appState}` shallow copy,
  // safe to inspect and safe to mutate without touching the real state. Deliberately carries no
  // bridge-removal tag, matching __pp_net_debug: it is meant to outlive the bridge, as a
  // permanent, named, read-only observation surface.
  window.__pp_app_state_debug = function () {
    return { ...stateNs.appState };
  };

  // D-05: the ONE deliberate retained non-debug global. src/ui/board.js's rendered
  // `checkRecipeBtn` markup carries a literal `onclick="revealMyRecipe()"` attribute, built into
  // an innerHTML string at render time (not static index.html markup) — inline HTML event-handler
  // attributes always evaluate their body in the GLOBAL scope, and an ES-module export is never
  // automatically reachable there. Since converting that one button to addEventListener would
  // mean board.js reaching back into a DOM-attach step outside its own render pass, GLOBAL-02/03's
  // "single documented mechanism" principle is honored the other way: one explicit, named,
  // commented `window.` assignment, exactly like the debug hooks above. ui_contract_check.js's  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
  // retained-globals-allowlist assertion enforces that this is the ONLY new non-debug window.*
  // assignment anywhere under src/.
  window.revealMyRecipe = ui.revealMyRecipe;

  // 11-07: moved verbatim from the (now-deleted) classic <script> region. These are top-level
  // statements, not function declarations, so they never appeared in analyze_classic.mjs's  [ROOT-TREE-CITATION: analyze_classic.mjs reads the root tree on purpose — true as written]
  // function-only inventory across 11-01..11-06 — but they still execute every page load and
  // needed a real module home once the classic region itself was removed.

  // auto-pause solo/bot games when the tab/screen goes hidden (backgrounded, locked, computer
  // sleeps) — mobile especially can't rely on a second tab catching up later, so we pause rather
  // than let bots keep playing unattended.
  //
  // /4: a pause the PLAYER never asked for must also end itself when they come back. The stage
  // hides the shot-clock panel (and solo defaults the clock off), so the v2 rule "never
  // auto-resumes; player taps ▶" left no reachable ▶ at all — an app-switch on a phone silently
  // paused the game, and the next sleep() (in practice the trade-wind rim sweep, twice in live
  // playtests) hung the turn forever with no indicator. Only the automatic pause auto-resumes:
  // a pause the player chose by tapping ⏸ stays theirs to end.
  document.addEventListener("visibilitychange", () => {
    const st = stateNs.appState;
    if (document.hidden && st.isHost && ui.soloBotGame() && !st.shotClockPaused) {
      st.autoPausedByHide = true;
      ui.toggleShotClockPause();
    } else if (!document.hidden && st.autoPausedByHide) {
      st.autoPausedByHide = false;
      if (st.shotClockPaused) ui.toggleShotClockPause();
    }
  });

  // the whole-table clock display is self-driving on a 500ms tick (mirrors src/ui/board.js's
  // resize-listener precedent for a standing top-level interval/listener living beside its own
  // module's function, rather than here — setClockUI's own module is src/ui/panel.js, so this
  // interval is the one exception, kept here since it is not itself a DOM-resize concern).
  setInterval(ui.setClockUI, 500);

  // FIX-10 (18-01 Task 3): both listeners now also re-measure the narration panel, not just the
  // board — that re-measurement never ran on resize/orientationchange before, which is the
  // confirmed cause of a clipped action button on a narrow window or after a rotation — a
  // resize/rotation never re-triggered the height measurement panel()'s own message-swap path
  // already had. `minHeight` is deliberately OMITTED from both calls below so the panel-height
  // helper inherits activeGhostFloor from its own default parameter (src/ui/panel.js, 18-01 Task
  // 2) — a rotation that lands mid-fade must not re-clip a still-fading ghost through this door.
  window.addEventListener("resize", () => {
    if (stateNs.appState.syncBoardRAF) return;
    stateNs.appState.syncBoardRAF = requestAnimationFrame(() => {
      stateNs.appState.syncBoardRAF = null;
      ui.syncBoardSizing();
      const inner = document.getElementById("apGridInner");
      if (inner) ui.resizePanel(!!inner.innerHTML);
    });
  });
  // Deliberately NOT routed through the rAF debounce flag above: orientationchange fires once,
  // not in a burst like resize, so sharing that flag would let a coincident resize win the race
  // and swallow this event entirely.
  window.addEventListener("orientationchange", () => {
    ui.syncBoardSizing();
    const inner = document.getElementById("apGridInner");
    if (inner) ui.resizePanel(!!inner.innerHTML);
  });

  // 08-02: the relocated D-06 impurities and the ASSET_BASE top-level hazard
  // must run before boot()'s element-lookup/event-wiring (wireWelcome,
  // wireLobby, wireRecipeModal) does — the relocated comment inside
  // applyEngineBootstrapEffects() states exactly that invariant, and boot()
  // is where that wiring happens, so this ordering preserves it. 11-07: both
  // are now real src/ui/ exports, called directly rather than through the
  // `window`-property indirection the bridge provided.
  /* THE BELT BEHIND THE BRACES. orchestrator.js catches the voyage chain at its root, which is
     where a broken turn actually lands. This catches everything that is NOT rooted there — a
     guest's Firebase watcher, a detached animation, a stray listener — because the failure mode
     being closed is not "an error happened" but "the game died and said nothing". Installed at the
     composition root, before boot(), so nothing can throw ahead of the handler that reports it.
     voyageAground() itself is first-fault-wins, so the two paths cannot stack two boxes. */
  window.addEventListener("unhandledrejection", e => ui.voyageAground(e.reason, "unhandled rejection"));
  window.addEventListener("error", e => ui.voyageAground(e.error || e.message, "uncaught error"));

  ui.applyEngineBootstrapEffects();
  ui.attachPastryArt();

  // Standing tripwire (mirrors the module-ok marker's convention): the
  // document.body.innerHTML rewrite above now runs at module time instead
  // of mid-parse, so it re-serialises and re-parses the whole body —
  // including the classic <script> elements, which the HTML parser marks
  // non-executable on innerHTML insertion and will not re-run. This counter
  // proves src/main.js itself still only runs once, rather than assuming it.
  window.__pp_boot_count = (window.__pp_boot_count || 0) + 1;

  // Inversion of control (D-14), formalized (11-06), bridge-free (11-07): `boot()` is a real
  // src/orchestrator.js export, imported by name at the top of this file — this module calls it
  // directly. The module still drives startup only after the UI wiring and retained global above
  // are in place, same ordering as before.
  boot();
initStage();
/* THE PULSE BEACON (?debug=pulse) — Wyatt's sanctioned debug instrument, 2026-08-24: the pulse
   bug lives only on real devices, so the game itself can testify. Dynamic import, gated on the
   URL flag: zero bytes fetched and zero work done for every ordinary player. The beacon is
   DOM-only by design (see its own header) — it can never touch the engine or the replay. */
try {
  if (new URLSearchParams(location.search).get("debug") === "pulse")
    import("./ui/pulsebeacon.js");
} catch (e) {}
}
