#!/usr/bin/env node
/* attack_buttons_on_target_check.mjs — a button that names a captain sits on THAT captain's boat.
 *
 * WYATT, on the Glass, 2026-09-01 13:32Z: "Sometimes, the buttons to attack a captain (when there
 * are two options, eg. you're adjacent to two captains) place the buttons on top of the wrong
 * captain -- eg Davy Scones button will not be on top of Davy Scones, it'll be on top of
 * Crustbeard. Fix this universally, not through patches, so that the buttons that refer to
 * selecting a player are always drawn next to them, not on top of, or next to, someone else."
 *
 * THE UNIVERSAL RULE ALREADY EXISTS — he ruled it at playtest 22 and W5-2 hardened it: an option
 * carrying `seat` anchors its circle beside the boat it NAMES (stage.js's anchored-boats branch,
 * held by w52_call_beside_boat_check with hull-avoidance and no wrong-boat swap). The contract is
 * all-or-nothing: EVERY button in the menu must carry a seat or the whole menu falls back to the
 * ordinary fan around the chooser — where a captain-coloured circle can coincidentally sit on a
 * neighbour's hull, which is exactly the wrong-captain picture he reports (two adjacent captains
 * = boats inside the fan's radius).
 *
 * The "Attack whom?" menu (src/ui/flow.js, humanAct's attack branch) never joined that rule: its
 * captain options carried no `seat`, and its "← Back" carried none either — so the fix is
 * CONVERGENCE, not a new placement rule (rule 23, and his own "universally, not through patches"):
 * captains carry their own seat; Back carries the CHOOSER's seat (returning to your menu belongs
 * beside your own boat), keeping the all-or-nothing contract intact with zero changes to the
 * placement machinery w52 already guards.
 *
 * W52's hard lesson applies here: this gate reads EXPRESSIONS, not words — each assertion names
 * the exact code shape whose absence recreates the fault — and every assertion is red-proofed
 * against a doctored source that reintroduces the seatless menu.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let failed = false;
const check = (label, cond, detail) => {
  if (cond) console.log(`PASS -- ${label}`);
  else { console.error(`FAIL -- ${label}${detail ? `: ${detail}` : ""}`); failed = true; }
};

const src = fs.readFileSync(path.join(REPO, "src", "ui", "flow.js"), "utf8");

/* The attack ask, located by its own copy key so the assertion survives reformatting. */
const seg = src.split('"Attack whom?"')[1] || "";
const menuExpr = seg.slice(0, seg.indexOf("HEXCOL") > -1 ? seg.indexOf("HEXCOL") : 400);

const assertions = [
  ["the Attack whom? prompt exists at one call site",
    (s) => s.split('"Attack whom?"').length === 2],
  ["each attackable captain's option carries its OWN seat (seat:o.idx beside value:o)",
    () => /attackable\.map\(o=>\(\{label:pn\(o\.idx\),value:o,seat:o\.idx\}\)\)/.test(seg)],
  ["the Back option carries the CHOOSER's seat (all-or-nothing contract preserved)",
    () => /\{label:"← Back",back:true,value:null,seat:player\.idx\}/.test(seg)],
];
console.log("attack_buttons_on_target_check — the attack menu joins the one anchored-boats rule\n");
for (const [label, test] of assertions) check(label, test(src), "flow.js's attack menu is not fully seat-bearing");

/* RED-PROOF: the pre-fix shape (no seat on captains, no seat on Back) must fail assertions 2-3. */
const doctored = 'await ask("Attack whom?",attackable.map(o=>({label:pn(o.idx),value:o})).concat([{label:"← Back",back:true,value:null}]), attackable.map(o=>HEXCOL[o.idx]));';
const dSeg = doctored.split('"Attack whom?"')[1];
const dFails = [
  /attackable\.map\(o=>\(\{label:pn\(o\.idx\),value:o,seat:o\.idx\}\)\)/.test(dSeg),
  /\{label:"← Back",back:true,value:null,seat:player\.idx\}/.test(dSeg),
].filter((x) => !x).length;
check("red-proof: the pre-fix seatless menu fails both seat assertions", dFails === 2, `only ${dFails} fired`);

console.log("");
if (failed) { console.error("FAIL attack_buttons_on_target_check — attack circles can sit on the wrong captain's hull."); process.exit(1); }
console.log("PASS attack_buttons_on_target_check — every attack option is seat-anchored; the one rule covers it.");
process.exit(0);
