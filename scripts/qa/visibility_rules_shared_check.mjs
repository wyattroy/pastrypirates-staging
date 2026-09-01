#!/usr/bin/env node
/* THE SECRECY RULES LIVE IN ONE PURE PLACE, AND THE DRAWING CODE ONLY SUPPLIES FACTS.
 *
 *   node scripts/qa/visibility_rules_shared_check.mjs
 *
 * STEP 5's NARROW HALF — Wyatt, 2026-08-31: "Do the narrow half." Three branches in the drawing
 * code decided what a player may SEE by asking which mode the game was in. CEO review 41 named
 * them as the reason "the Decider already exists" was a claim larger than the code.
 *
 * WHY A NEW GATE, when mode_fork_check already counts forks: IT CANNOT SEE THIS CHANGE.
 * That check counts LINES mentioning passAndPlay / mySeat / isHost, and a line that PASSES
 * `sharedDevice: appState.passAndPlay` into a pure rule mentions it exactly as much as a line that
 * BRANCHES on it. The counts held at 3 and 9 across this refactor — correctly, by its own
 * definition, and uselessly for judging it. **A metric that cannot distinguish the fix from the
 * fault is not evidence about the fix**, and reporting the unchanged number as "no regression"
 * would be true and empty. So this asserts the thing that actually changed: WHERE THE RULE LIVES.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const { mayRevealRecipe, offersRecipeCheck, showsThinkingIndicator } = await import(pathToFileURL(path.join(ROOT, "src/shared/visibility.js")).href);

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);
console.log("visibility_rules_shared_check — one pure rule; the drawing code only supplies facts\n");

const board = strip(read("src/ui/board.js"));
const stage = strip(read("src/ui/stage.js"));

/* THE RULES RUN — imported and executed, not asserted against a copy. This is the correction from
   decider_table_check, which typed its rule in as a literal and was bypassed in one line. */
{
  const rows = [
    ["your own recipe, your own device", mayRevealRecipe({ isMySeat: true, sharedDevice: false }), true],
    ["a rival's recipe, ever", mayRevealRecipe({ isMySeat: false, sharedDevice: false }), false],
    ["your own, shared screen, not yet asked", mayRevealRecipe({ isMySeat: true, sharedDevice: true, askedThisTurn: false }), false],
    ["your own, shared screen, asked", mayRevealRecipe({ isMySeat: true, sharedDevice: true, askedThisTurn: true }), true],
    ["a spectator is not a rival", mayRevealRecipe({ isMySeat: false, spectator: true }), true],
    ["the ask button, shared screen, your turn", offersRecipeCheck({ isMySeat: true, isActiveSeat: true, sharedDevice: true, askedThisTurn: false }), true],
    ["the ask button, your own device", offersRecipeCheck({ isMySeat: true, isActiveSeat: true, sharedDevice: false, askedThisTurn: false }), false],
    ["thinking shown when nobody else can tell you", showsThinkingIndicator({ sharedDevice: false, networked: false, watchingAnotherSeat: true, seatStillPlaying: true }), true],
    ["thinking hidden — they are sitting next to you", showsThinkingIndicator({ sharedDevice: true, networked: false, watchingAnotherSeat: true, seatStillPlaying: true }), false],
    ["thinking hidden — the wire carries their turn", showsThinkingIndicator({ sharedDevice: false, networked: true, watchingAnotherSeat: true, seatStillPlaying: true }), false],
  ];
  const wrong = rows.filter(r => r[1] !== r[2]).map(r => r[0]);
  wrong.length === 0
    ? pass(`all ${rows.length} secrecy case(s) answer correctly — run, not asserted against a copy of the rule`)
    : fail(`${wrong.length} case(s) answer wrongly: ${wrong.join("; ")}`);
}

/* AND THE DRAWING CODE MUST NOT SPELL THEM OUT AGAIN. A second copy inline is how a rule that
   "lives in one place" quietly comes to live in two — and the inline copy is the one that drifts,
   because it is the one nothing tests. */
{
  const sites = [
    ["src/ui/board.js", board, "canReveal", /const\s+canReveal\s*=\s*mayRevealRecipe\s*\(/],
    ["src/ui/board.js", board, "offerCheckBtn", /const\s+offerCheckBtn\s*=\s*offersRecipeCheck\s*\(/],
    ["src/ui/stage.js", stage, "botsUp", /const\s+botsUp\s*=[^;]*showsThinkingIndicator\s*\(/],
  ];
  const bad = sites.filter(([, src, name, re]) => !re.test(src)).map(([f, , name]) => `${f} — ${name}`);
  bad.length === 0
    ? pass(`all ${sites.length} drawing site(s) call the shared rule instead of spelling it out`)
    : fail(`${bad.length} drawing site(s) decide visibility inline again: ${bad.join(", ")}`);
}

/* NO MODE NAME IN THE PURE TIER. The rules read hardware facts — is the device shared, is there a
   wire — and never which mode the game calls itself. That is what makes them hold for a future
   couch mode, a spectator or a replay without being told about them. */
{
  const vis = strip(read("src/shared/visibility.js"));
  const names = ["passAndPlay", "isHost", "mySeat", "soloMode", "crew"].filter(n => new RegExp(`\\b${n}\\b`).test(vis));
  names.length === 0
    ? pass("the pure rules name no mode — they read hardware facts (sharedDevice, networked) only")
    : fail(`the pure rules name ${names.length} mode(s): ${names.join(", ")} — mode has leaked one tier down, which is the leak this whole plan exists to remove`);
}

/* RED-PROOF, both halves. */
{
  const inlineAgain = 'const canReveal=spectator||(i===appState.mySeat&&(!appState.passAndPlay||appState.recipeRevealed));';
  const catchesInline = !/const\s+canReveal\s*=\s*mayRevealRecipe\s*\(/.test(inlineAgain);
  const bentRule = ({ isMySeat }) => !!isMySeat;                       // drops the shared-device condition
  const catchesBent = bentRule({ isMySeat: true, sharedDevice: true, askedThisTurn: false }) !== false;
  catchesInline && catchesBent
    ? pass("red-proof: catches the rule spelled out inline again, and a rule that forgets the shared-device condition")
    : fail(`red-proof FAILED (inline:${catchesInline} bentRule:${catchesBent})`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
