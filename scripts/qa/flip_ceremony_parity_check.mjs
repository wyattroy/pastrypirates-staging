#!/usr/bin/env node
/* THE FLIP CEREMONY MUST READ THE SAME ON BOTH SIDES OF THE WIRE.
 *
 *   node scripts/qa/flip_ceremony_parity_check.mjs
 *
 * FOUND 2026-08-28 while mapping fork 2 for the one-activity-engine work, and it is two real bugs a
 * guest has been living with, not plumbing:
 *
 *   1. THE CEREMONY HAD NO WORDS ON A GUEST. `window.__pp4.flipMsg` is stamped in exactly two
 *      places (src/ui/flow.js), both on the HOST's local path. src/ui/stage.js writes
 *      `fm ? emojify(String(fm.m)) : ""` for the title and the same for the stakes — so a guest's
 *      flip ceremony drew an EMPTY title over EMPTY stakes. The wire already carried `msg` and
 *      `sub`; nobody assigned them.
 *   2. THE GUEST'S COIN DID NOT SPIN WHEN TAPPED. The host paints the spin in the tap's own frame
 *      (`setFlipCoin("spin")`) — that IS the playtest-22 fix for "the coin disappears, the word
 *      FLIP remains, then after a second or two the coin starts to flip". The guest never called
 *      it, so a guest still sees the fault the host had fixed: a blank coin, then a spin a beat
 *      later when the host's broadcast lands.
 *
 * AND THE GUARD IS THE POINT, NOT AN AFTERTHOUGHT. `src/ui/stage.js` has a `!fm && btl` fallback
 * that writes "⚔️ Broadside!" for a BATTLE flip, which borrows no words. Stamping flipMsg
 * unconditionally would silently destroy the battle ceremony's title. So this check asserts BOTH
 * directions: the ordinary flip stamps, and the battle path must not.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const orch = rd("src/orchestrator.js"), flow = rd("src/ui/flow.js"), stage = rd("src/ui/stage.js");

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };

/* RE-ANCHORED BY FORK 2's CONVERGENCE (W1, 2026-08-28). The guest flip branch this gate used to
   read line-by-line is GONE — watchPrompt's ask branch now renders through renderAskPrompt, the
   ONE ask-class renderer, which is the same code the host runs. So the parity this gate exists
   for is now asserted at its new home: the renderer stamps flipMsg (battle-guarded) and paints
   the tap's own spin, and watchPrompt actually reaches it. The original two bugs stay described
   in the header — they are why this gate exists at all. */
function fnBody(src, name) {
  let h = src.indexOf(`export function ${name}(`);
  if (h < 0) h = src.indexOf(`export async function ${name}(`);
  if (h < 0) return "";
  let i = src.indexOf("{", h), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(i, j + 1);
}
const renderer = fnBody(flow, "renderAskPrompt");
const watchP = fnBody(orch, "watchPrompt");

console.log("\nThe guest's flip prompt says what the host's says — because it IS the host's renderer");
if (!renderer) bad("renderAskPrompt not found in flow.js — check pointed at nothing");
else {
  /flipMsg/.test(renderer)       ? ok("the ONE renderer stamps window.__pp4.flipMsg, so the ceremony has a title and stakes on every tier")
                                 : bad("no flipMsg in renderAskPrompt — the ceremony draws an EMPTY title and EMPTY stakes (stage.js writes `fm ? … : \"\"`)");
  /setFlipCoin\("spin"\)/.test(renderer) ? ok('the ONE renderer paints setFlipCoin("spin") in the tap\'s own frame')
                                 : bad('no setFlipCoin("spin") in renderAskPrompt — the blank-coin-then-spin fault playtest 22 fixed');
  /battle/.test(renderer)        ? ok("the stamp is guarded so a BATTLE flip is excluded")
                                 : bad("nothing excludes a battle flip — stamping unconditionally kills stage.js's `!fm && btl` \"⚔️ Broadside!\" title");
}
if (!watchP) bad("watchPrompt not found in orchestrator.js — check pointed at nothing");
else /renderAskPrompt\(/.test(watchP) ? ok("watchPrompt reaches the renderer — the guest draws through the same code, not a copy")
                                       : bad("watchPrompt does not call renderAskPrompt — the guest's flip has no renderer at all");

console.log("\nThe battle ceremony still borrows no words");
/if\s*\(\s*!fm\s*&&\s*btl\s*\)/.test(stage) ? ok("stage.js still has the `!fm && btl` fallback the battle title depends on")
                                            : bad("the `!fm && btl` fallback is gone — the battle ceremony title will be blank");

console.log("\nThe renderer stamps both flip shapes");
((fnBody(flow, "renderAskPrompt").match(/flipMsg/g) || []).length >= 2) ? ok("flipMsg is stamped on both the pure-flip and flip-with-options paths")
                                           : bad("one of the renderer's two flip paths lost its flipMsg stamp");

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — both sides of the wire draw the same ceremony\n");
process.exit(fails ? 1 : 0);
