#!/usr/bin/env node
/* STAGE IMPORT GATE — src/ui/stage.js must load under Node without throwing.
 *
 * WHY THIS EXISTS. Root `npm test` runs 21 gates and not one of them loads `4/`. That is the
 * failure shape docs/HARD-WON-LESSONS.md §3 names outright — "a gate's ROOT is wherever the gate's
 * FILE lives" — and a green root suite says nothing whatever about the new game. This is the first
 * gate in this repository that reads the `4/` tree by importing it.
 *
 * What it caught on its first run: `addEventListener("resize", …)` at module scope in stage.js,
 * bare, with no `window.` and no guard. In a browser that resolves off the global object and works;
 * under Node it is an undeclared identifier and throws `ReferenceError` at module-evaluation time,
 * before a single export exists. So the 1,545-line stage layer — the largest module in the new game
 * — could not be imported by ANY headless test, which is why none had ever been written.
 *
 * WHY THE EXPLICIT EXIT IS NOT TIDINESS. stage.js arms a module-scope `setInterval` watchdog (the
 * playtest-22 belt that re-arms the tick loop from an independent hook). That interval holds the
 * Node event loop open forever after a perfectly SUCCESSFUL import, so a script that merely awaits
 * the promise and falls off the end hangs instead of passing — a gate that hangs CI is worse than
 * no gate. The watchdog is deliberate browser behaviour and is left exactly as it is: this script
 * exits, the game does not change. `scripts/module_graph_check.js` sets the same precedent, forcing
 * `process.exit` after its own dynamic imports rather than waiting to drain.
 *
 * Run: node scripts/stage_import_check.js
 */
import("../src/ui/stage.js")
  .then(() => {
    console.log("PASS TEST-01 — src/ui/stage.js imported under Node without throwing");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAIL TEST-01 — src/ui/stage.js threw on import:");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
