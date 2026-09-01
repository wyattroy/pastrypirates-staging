#!/usr/bin/env node
/* sail_window_single_check.mjs — at most ONE sail window may ever exist, and clearing a prompt
 * clears its squares.
 *
 * WYATT, on the Glass, 2026-09-01 13:08Z: "The guest's camera sometimes stops reframing the
 * action... some interaction causes the camera to become FULLY zoomed out, and stay that way,
 * until the guest refreshes their page."
 *
 * THE MECHANISM, read from the code before any fix (both halves verified by eye at the cited
 * lines, then proven RED by this check against the pre-fix build):
 *   1. renderPickPrompt's teardown removes only the squares THAT call created (src/ui/flow.js,
 *      `hs`), and the guest's watchPrompt caller DISCARDS the returned teardown
 *      (src/orchestrator.js, kind==="pick"). A re-delivered prompt therefore renders a SECOND
 *      window, and answering tears down only the second — the first is orphaned in #sailHost
 *      forever. Nothing else in the codebase ever empties it short of a page refresh.
 *   2. watchPrompt's clear branch (prompt gone, or another seat's) runs panel("") and never
 *      touches squares — a pick prompt cleared remotely rather than answered locally orphans its
 *      whole window the same way.
 *   Orphaned squares used to be a quiet cosmetic leak. The 2026-09-01 containment pass
 *   (sailContainTick) turned them loud: it re-fights every later camera glide over squares that
 *   never leave, its retry budget resets every turn (key = turnSerial|count), and its only move
 *   is OUT — capped at 640, the whole ocean. "Fully zoomed out, stays until refresh" exactly.
 *
 * THE INVARIANT THIS PINS (rule 23's shape): renderPickPrompt is the ONE renderer of sail
 * windows (the parity gate already insists on that), so it OWNS the one-window invariant — any
 * .sailCell existing when it starts is stale by definition and is swept. And the clear path
 * disposes through the same exported broom, clearSailWindow(), so the two paths cannot drift.
 *
 * Drives the REAL page over CDP (real solo boot per docs/DRIVING-THE-GAME.md §3), imports the
 * real module, renders a synthetic pick spec exactly the way the guest's caller does (teardown
 * discarded) — no game state is mutated, no gameplay is simulated.
 *
 * RED-PROOFED at authoring: run against the pre-fix tree it failed 3 of 3 behavioural cases
 * (double render kept 8 squares; answer left 4 orphans; clearSailWindow did not exist).
 */
"use strict";
import { openChrome } from "../lib/cdp.mjs";
import { REPO, gameURL } from "../lib/chrome.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HTTP = 8479, DBG = 9479; // this gate's own ports, never shared (HARD-WON-LESSONS §8)
let failed = false;
const check = (label, cond, detail) => {
  if (cond) console.log(`PASS -- ${label}`);
  else { console.error(`FAIL -- ${label}${detail ? `: ${detail}` : ""}`); failed = true; }
};

console.log("sail_window_single_check — one sail window, ever; a cleared prompt keeps no squares\n");
const c = await openChrome({
  W: 900, H: 700, dbgPort: DBG, httpPort: HTTP, serveRoot: REPO,
  profileDir: path.join(os.tmpdir(), "pp4-sail-window-check"),
});
try {
  await c.nav(gameURL(HTTP));
  await c.sleep(1500);
  await c.ev(`localStorage.clear()`);
  await c.nav(gameURL(HTTP));
  await c.sleep(1500);
  // Solo boot, §3 of the driving manual: card first, then the modal, waiting on VISIBILITY.
  await c.ev(`document.getElementById('choiceSolo').click()`);
  for (let i = 0; i < 40; i++) {
    if (await c.ev(`(() => { const b = document.getElementById('btnNameConfirm'); return !!(b && b.offsetParent); })()`)) break;
    await c.sleep(250);
  }
  await c.ev(`document.getElementById('nameModalInput').value = 'Gate'`);
  await c.ev(`document.getElementById('btnNameConfirm').click()`);
  for (let i = 0; i < 60; i++) {
    if (await c.ev(`(async () => { const st = (await import('/src/state/index.js')).appState; return !!(st.game && st.game.players.some(p => p.strategy === 'human')); })()`)) break;
    await c.sleep(300);
  }

  /* Render the same pick spec TWICE, discarding the teardown both times — byte-for-byte the
     guest caller's shape. A duplicate listener delivery is exactly this. */
  // CENTRE squares only: a rim cell gets the trade-wind sweep decoration, and a swept square
  // takes TWO taps by design (Wyatt's 2026-08-13 pick — first tap previews the ride at camFull).
  // The first draft used [2,2] and reported the two-tap gesture as a teardown failure.
  const spec = `{cells:[[3,3],[4,3],[3,4]], msg:"gate probe", hint:null, pos:[4,4]}`;
  const afterTwo = await c.ev(`(async () => {
    const f = await import('/src/ui/flow.js');
    f.renderPickPrompt(${spec}, () => {});
    f.renderPickPrompt(${spec}, () => {});
    return document.querySelectorAll('.sailCell').length;
  })()`);
  // 3 cells + 1 stay square = 4. Two renders without the sweep leave 8.
  check("a re-delivered prompt does not stack a second window (4 squares, not 8)",
    afterTwo === 4, `counted ${JSON.stringify(afterTwo)}`);

  const afterAnswer = await c.ev(`(() => {
    const sq = [...document.querySelectorAll('.sailCell')].find(el => !el.classList.contains('pp4StayCell') && !el.classList.contains('sailSwept'));
    if (sq) sq.click();
    return document.querySelectorAll('.sailCell').length;
  })()`);
  check("answering the window leaves ZERO squares behind", afterAnswer === 0, `counted ${JSON.stringify(afterAnswer)}`);

  /* The clear path: render once (teardown discarded), then dispose through the exported broom —
     the same call watchPrompt's clear branch makes when a prompt vanishes remotely. */
  const afterClear = await c.ev(`(async () => {
    const f = await import('/src/ui/flow.js');
    f.renderPickPrompt(${spec}, () => {});
    if (typeof f.clearSailWindow !== 'function') return 'no clearSailWindow export';
    f.clearSailWindow();
    return document.querySelectorAll('.sailCell').length;
  })()`);
  check("a remotely-cleared prompt keeps no squares (clearSailWindow)", afterClear === 0, `got ${JSON.stringify(afterClear)}`);

  /* WIRING, not just capability: the guest's clear branch must actually call the broom. A broom
     nobody sweeps with is the gap between capability and behaviour this repo keeps paying for. */
  const orch = fs.readFileSync(path.join(REPO, "src", "orchestrator.js"), "utf8");
  const clearBranch = orch.split("if(!prompt||prompt.seat!==appState.mySeat)")[1] || "";
  check("watchPrompt's clear branch calls clearSailWindow()",
    clearBranch.slice(0, clearBranch.indexOf("return;}") + 8).includes("clearSailWindow("),
    "the clear branch does not sweep before its return");
} finally {
  c.close();
}

console.log("");
if (failed) { console.error("FAIL sail_window_single_check — orphaned sail squares are possible, and the containment pass will pin the camera at full zoom on them."); process.exit(1); }
console.log("PASS sail_window_single_check — one window ever; cleared prompts keep no squares.");
process.exit(0);
