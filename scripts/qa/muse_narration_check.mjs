#!/usr/bin/env node
/* muse_narration_check.mjs — a Muse (pass) narrates the sighting, in every mode.
 *
 * WYATT, on the Glass, 2026-09-01 13:14Z: "The Muse narrations are now missing from all narration
 * in Multiplayer -- they don't seem to be firing at all, or maybe they get wiped away IMMEDIATELY"
 *
 * WHAT ACTUALLY HAPPENED, found in the graveyard (rule 10) before any measurement: commit
 * 693c2b0b (2026-08-27, the weather-line copy change) deleted EVENT_NARRATION's entire `pass:`
 * entry — the sea-creature sighting, the "Recipe idea! (+N🌕)" clause, the captain's-log line and
 * the wave pop — as collateral in a table edit. Its own commit message lists everything it cut on
 * purpose, and the pass line is NOT on that list. With the entry gone, describeFor({t:"pass"})
 * returns null and narrateLastEvent() narrates nothing — in EVERY mode, not just multiplayer;
 * he noticed it where he plays. seaLine() sat with zero callers for five days and no gate said so:
 * w21's own header records that each narration copy has at most one gate standing over it, and
 * this copy had none. Now it has this one.
 *
 * Renders the REAL EVENT_NARRATION.pass against real event shapes (the engine emits
 * {t:"pass", p, sea} — src/engine/index.js:1032), the w21 harness pattern. The coin amount is
 * asserted DERIVED from cfg.passCoin, never a literal — the gate changes the config and demands
 * the text follow (rule 9's red-proof).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { EVENT_NARRATION } = await import(pathToFileURL(path.join(ROOT, "src/ui/util.js")).href);
const { appState } = await import(pathToFileURL(path.join(ROOT, "src/state/index.js")).href);

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };
const strip = (h) => String(h).replace(/<[^>]*>/g, "");

console.log("muse_narration_check — a Muse narrates the sighting and the derived coin\n");

if (typeof EVENT_NARRATION.pass !== "function") {
  bad("EVENT_NARRATION has no `pass` entry — a Muse narrates NOTHING (deleted by 693c2b0b, 2026-08-27, as collateral)");
} else {
  appState.game = { cfg: { passCoin: 1 }, players: [{ name: "Crustbeard" }, { name: "Mando" }] };
  const at = () => [320, 320];
  const sea = { o: "six clownfish", s: "six clownfish", y: "ye lean over the rail, and spot six clownfish.", t: "{} leans over the rail, and spots six clownfish." };

  const other = EVENT_NARRATION.pass({ t: "pass", p: 0, sea }, at, 40, 1);
  const otherTxt = strip(other && other.txt || "");
  if (/leans over the rail, and spots six clownfish/.test(otherTxt)) ok("another captain's Muse narrates the sighting in the third person");
  else bad(`third-person sighting missing — got: "${otherTxt.slice(0, 90)}"`);
  if (/Recipe idea! \(\+1🌕\)/.test(otherTxt)) ok("the Recipe idea clause carries the coin");
  else bad(`no "Recipe idea! (+1🌕)" clause — got: "${otherTxt.slice(0, 90)}"`);

  const mine = EVENT_NARRATION.pass({ t: "pass", p: 0, sea }, at, 40, 0);
  if (/ye lean over the rail, and spot six clownfish/.test(strip(mine && mine.txt || ""))) ok("yer own Muse speaks to ye (second person)");
  else bad(`second-person sighting missing — got: "${strip(mine && mine.txt || "").slice(0, 90)}"`);

  // Rule 9, red-proofed by changing the input: the amount must FOLLOW the config.
  appState.game.cfg.passCoin = 3;
  const paid3 = strip(EVENT_NARRATION.pass({ t: "pass", p: 0, sea }, at, 40, 1).txt || "");
  if (/\(\+3🌕\)/.test(paid3)) ok("the coin amount derives from cfg.passCoin (follows a config change)");
  else bad(`coin amount does not follow cfg.passCoin=3 — got: "${paid3.slice(0, 90)}"`);

  // A pre-2026-08-06 save stores `sea` as a bare string — seaLine's own documented contract.
  const legacy = strip(EVENT_NARRATION.pass({ t: "pass", p: 1, sea: "a kraken" }, at, 40, 0).txt || "");
  if (/there's a kraken down there/.test(legacy)) ok("a legacy string sea payload still narrates");
  else bad(`legacy sea payload broken — got: "${legacy.slice(0, 90)}"`);

  const entry = EVENT_NARRATION.pass({ t: "pass", p: 0, sea }, at, 40, 1);
  if (entry.caps && entry.caps.length && /looks into the ocean/.test(entry.caps[0][1])) ok("the captain's-log line survives");
  else bad("no captain's-log caps line");
  if (entry.pops && entry.pops.length) ok("the wave pop survives");
  else bad("no wave pop");
}

console.log("");
if (fails) { console.log(`FAIL — ${fails} failing check(s). A Muse is silent; the fifty sea creatures are unreachable.`); process.exit(1); }
console.log("PASS — a Muse narrates the sighting, the coin derives, both persons and the legacy payload hold.");
process.exit(0);
