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
 * AND THE GUARD IS THE POINT, NOT AN AFTERTHOUGHT. `src/ui/stage.js` has a `!fm && S.battle` fallback
 * (it was `!fm && btl` while a battle box existed; the box was removed at Wyatt's ask, 2026-09-14)
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
  /* RE-ANCHORED BY ARCHITECTURE ITEM 6 (2026-09-17). The tap's spin used to be painted inline here, in the renderer's two flip
     shapes — and ONLY here: both FIGHT taps (battleAsk's on the host, watchPrompt's battle branch on a guest) armed the coin without it,
     so a crew guest's own fight coin sat still until the host's answer came back over the wire (measured ~118ms). The paint now lives
     in ONE place, board.js armFlipTap, and every arming goes through it; this gate asserts the renderer's two shapes, and both fight
     taps, reach it — a STRONGER form of the assertion it replaces, which could not see the fight taps at all. */
  const board = rd("src/ui/board.js");
  const armTap = fnBody(board, "armFlipTap");
  (armTap && /setFlipActive\(\s*\(\s*\)\s*=>\s*\{[^}]*setFlipCoin\("spin"\)/.test(armTap))
    ? ok('the ONE tap (board.js armFlipTap) paints setFlipCoin("spin") in the tap\'s own handler')
    : bad('armFlipTap does not paint setFlipCoin("spin") inside the tap handler — the blank-coin-then-spin fault playtest 22 fixed');
  ((renderer.match(/armFlipTap\(/g) || []).length >= 2)
    ? ok("both of the renderer's flip shapes (the pure flip and the flip-with-options) arm the coin through armFlipTap")
    : bad("one of renderAskPrompt's two flip shapes arms the coin without armFlipTap — its tap would not start the spin");
  const battleAskBody = fnBody(orch, "battleAsk");
  (/armFlipTap\(/.test(battleAskBody) && /armFlipTap\(/.test(watchP))
    ? ok("both FIGHT taps — the host's own (battleAsk) and a guest's (watchPrompt's battle branch) — arm through armFlipTap, so the tap starts the spin there too")
    : bad("a fight's flip tap arms the coin without armFlipTap — that screen's coin waits for the host before it spins");
  /battle/.test(renderer)        ? ok("the stamp is guarded so a BATTLE flip is excluded")
                                 : bad("nothing excludes a battle flip — stamping unconditionally kills stage.js's `!fm && btl` \"⚔️ Broadside!\" title");
}
if (!watchP) bad("watchPrompt not found in orchestrator.js — check pointed at nothing");
else /renderAskPrompt\(/.test(watchP) ? ok("watchPrompt reaches the renderer — the guest draws through the same code, not a copy")
                                       : bad("watchPrompt does not call renderAskPrompt — the guest's flip has no renderer at all");

console.log("\nThe battle ceremony still borrows no words");
/if\s*\(\s*!fm\s*&&\s*S\.battle/.test(stage) ? ok("stage.js still titles a battle flip from the fight itself (`!fm && S.battle`)")
                                             : bad("the `!fm && S.battle` fallback is gone — the battle ceremony title will be blank");

/* …AND IT MUST NAME THE RIGHT WIND. Added 2026-09-03 after the ceremony called every downwind battle a crosswind (a DOM lookup
   one hop short — judge-1914Z-shots/solo-tablet-wk-018.png against -018-settled.png). RE-ANCHORED 2026-09-14: Wyatt had the
   battle box removed entirely ("THe battle box covered this up. I want the battle box removed entirely."), so there is no card
   left to read a badge off.
   RE-ANCHORED AGAIN 2026-09-18 (architecture item 25), AND STRENGTHENED. From 09-14 to today this gate INSISTED that both the
   ceremony and the fight's opening bubble call the engine's downwindSide themselves — "one source, so they cannot disagree". They
   do disagree, and that was the fault: downwindSide reads the POSITIONS AND WIND ON THE BOARD THE SCREEN IS DRAWING, and a watching
   screen's board is behind its event queue. Measured in a two-window crew room, one fight, 340 ms apart: host "⬇ HOSTCAP FIRES
   DOWNWIND — WINS TIES", guest "CROSSWIND · ties collide", then the guest's OWN flip stage "HostCap is firin' downwind". So the two
   readings are gone: Game.beginBattle takes the wind once, records it on the `engage` event and on the fight, and both screens are
   HANDED it — the ceremony from S.battle's third slot (written by the one event consumer), the bubble from o.dw (carried on every
   publish and across the wire). This now asserts that NEITHER asks the engine again.
   ⚠ THESE ARE A REVERT ALARM, NOT THE PROOF. The behavioural proof poses a battle, raises the real ceremony and reads the line:
   `node scripts/qa/flip_ceremony_names_the_wind_check.mjs` (and `--before`, which hands the stage a crosswind and must go RED).
   Deliberately NOT in `npm test`: it launches Chrome for ~40s. The one place is held by
   `node scripts/qa/fight_wind_decided_once_check.mjs`, which IS in the chain. */
console.log("\nThe battle ceremony names the DOWNWIND captain the ENGINE named, and does not work it out for itself");
/* comments never count as code: both of these blocks now CARRY the name of the call they no longer make, so that the next reader
   knows what was deleted and why — matching on the raw text would read those sentences as the fault they describe. */
const nocomment = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const stageCode = nocomment(stage), orchCode = nocomment(orch);
const cerWind = (stageCode.match(/if\s*\(\s*!fm\s*&&\s*S\.battle[\s\S]{0,900}/) || [""])[0];
/const\s+dw\s*=\s*S\.battle\s*\[\s*2\s*\]/.test(cerWind) && !/downwindSide\s*\(/.test(cerWind)
  ? ok("the ceremony reads the wind the fight was called in off S.battle, which the one event consumer wrote from the `engage` event")
  : bad("the ceremony works the wind out from this screen's own board again (downwindSide) — on a guest that board is behind its event queue");
const rb = (orchCode.match(/export function renderBattle\(o\)\{[\s\S]*?\n\}/) || [""])[0];
/o\.dw/.test(rb) && /battle\.downwindTag/.test(rb) && !/downwindSide\s*\(/.test(rb)
  ? ok("the fight's opening bubble says the wind it was handed (o.dw), so the bubble and the ceremony cannot name different winds")
  : bad("renderBattle works the wind out for itself again — the bubble and the ceremony can name different winds on the same fight");

console.log("\nThe renderer stamps both flip shapes");
((fnBody(flow, "renderAskPrompt").match(/flipMsg/g) || []).length >= 2) ? ok("flipMsg is stamped on both the pure-flip and flip-with-options paths")
                                           : bad("one of the renderer's two flip paths lost its flipMsg stamp");

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — both sides of the wire draw the same ceremony\n");
process.exit(fails ? 1 : 0);
