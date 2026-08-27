// src/ui/index.js
//
// Phase 11 (SPLIT-03/06). The UI barrel — re-exports every extracted UI/rendering function so
// src/main.js can `import * as ui from "./ui/index.js"` and spread `...ui` onto the PP bridge
// (the strangler-fig mechanism: still-classic functions keep resolving these as bare globals
// until the bridge itself is deleted in 11-07). One `export * from "./<cluster>.js"` line is
// added per cluster file as later waves (11-02..11-06) extract more of the classic script.

export * from "./recipe.js";
export * from "./util.js";
export * from "./board.js";
export * from "./panel.js";
export * from "./lobby.js";
export * from "./handlers.js";
// v2.1 bake-off: BEFORE flow.js, which now genuinely depends on it — flow.js's bakeoffPrompt (the
// logged + clocked wrapper) drives playBakeoffLive. The dependency runs one way only: bakeoff.js
// reaches no further than panel.js/util.js/recipe.js/state/shared, so there is no cycle. util.js was
// added to that list on 2026-08-22 (item 6, D-16) for narrationHoldMs — the one reading-speed model
// — and it widens the invariant by nothing in practice: panel.js, which bakeoff.js already imports,
// imports util.js itself, and util.js imports neither panel.js nor bakeoff.js.
export * from "./bakeoff.js";
export * from "./flow.js";
