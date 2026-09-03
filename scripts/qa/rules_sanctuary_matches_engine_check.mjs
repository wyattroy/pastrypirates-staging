#!/usr/bin/env node
/* rules_sanctuary_matches_engine_check.mjs — the rules text may not contradict the engine about
 * whether a captain whose ovens are lit can be attacked.
 *
 * WHY THIS EXISTS. Wyatt's ruling INBOX-20260902T225008Z was "Do a new /rules.html that explains
 * the rules -- using the latest version of the game." The page was built correctly and generated
 * from the in-game modal (T-100), so page and modal cannot disagree with EACH OTHER — but nothing
 * checked either of them against the GAME. Measured 2026-09-03, they were wrong about a rule Wyatt
 * himself changed: the modal said "a berth protects nobody, not even a captain who's already fired
 * up the ovens", and `Game.canAttack` has refused exactly that attack since his 2026-08-06 SANCTUARY
 * ruling (src/engine/index.js — `if(this.cfg.bakeoff&&def.baking)return false;`). A player reading
 * the rules page was told to make a play the game does not allow.
 *
 * WHY IT IS BEHAVIOURAL AND NOT A GREP FOR THE WORD "sanctuary". The truth is taken by CALLING
 * canAttack() on a real Game with a baking defender — not by reading a flag, and not by reading the
 * comment above canAttack, which on the day this was written still said the opposite of the line
 * beneath it ("there is deliberately no def.done check: v2 rule 13c is nobody is safe"). A comment
 * is not a measurement. If the sanctuary ruling is ever reversed, this gate goes red until the WORDS
 * follow — in both directions, which is the half a one-way check would miss.
 *
 * WHY IT READS THE RENDERED PAGE AND NOT index.html DIRECTLY: renderRulesPage() already owns the
 * one locator for the modal (rules_page.mjs:52). A second locator here would be a second thing to
 * keep in step — rule 23. Reading its output checks the words that actually reach a player.
 *
 *   node scripts/qa/rules_sanctuary_matches_engine_check.mjs
 *   node scripts/qa/rules_sanctuary_matches_engine_check.mjs --red=<n>   deliberately break clause n
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderRulesPage, engineClaims } from "../lib/rules_page.mjs";
import { Game, roundCfg } from "../../src/engine/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RED = Number((process.argv.find(a => a.startsWith("--red=")) || "").split("=")[1] || 0);

let failures = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { failures++; console.log("FAIL " + m); };

/* THE ENGINE'S ANSWER, taken by playing it rather than by reading it. Everything else about the
   fight is made legal first (powder affordable, a hold worth taking, a real adjacent rival) so the
   only thing left deciding the verdict is whether the ovens are lit. A probe that measures a
   refusal it caused for some OTHER reason is the "measurement that cannot fail" rule 6 warns about,
   so the not-baking case is asserted too: if that one is already false, this check knows nothing. */
function engineGrantsSanctuary() {
  const g = new Game(roundCfg(["human", "bot", "bot", "bot"]), 12345, true);
  const att = g.players[0], def = g.players[1];
  att.coins = 99;
  def.ing = [...def.recipe];
  def.baking = false;
  const beforeOvens = g.canAttack(att, def);
  def.baking = true;
  const afterOvens = g.canAttack(att, def);
  return { beforeOvens, afterOvens };
}

const { beforeOvens, afterOvens } = engineGrantsSanctuary();

/* 0. the instrument reaches its subject */
if (beforeOvens) pass("the probe can stage a legal attack at all (defender attackable before the ovens are lit)");
else fail("the probe could not stage a legal attack even before the ovens were lit — this check knows NOTHING about sanctuary; fix the probe before trusting any verdict below");

const sanctuary = beforeOvens && !afterOvens;

const page = await renderRulesPage(REPO);
/* CONVERGED 2026-09-03 (T-216). This was an inline regex while it was the only reader of these
   markers. The forecast gate is the second, so the locator moved into rules_page.mjs and BOTH read
   it — CLAUDE.md §2's "when a SECOND consumer appears, CONVERGE", rather than copying the regex and
   keeping two of them in step by memory. Nothing about this gate's measurement or classifier moved. */
const marked = engineClaims(page, "sanctuary");

/* 1. the rules text says something about it, in a place a gate can address */
const found = RED === 1 ? [] : marked;
if (found.length === 1) pass(`the rules text carries exactly one sanctuary claim, marked for this gate`);
else fail(`the rules text carries ${found.length} span(s) marked data-engine-rule="sanctuary" — expected exactly 1. The engine ${sanctuary ? "GRANTS" : "does not grant"} sanctuary, and nothing on the page is tied to that fact, so the words can drift away from the game with npm test green.`);

/* THE CLASSIFIER. It reads a sentence about lit ovens and says which of the two rules it asserts.
 *
 * ⚠ IT IS SPLIT OUT AND FIXTURE-TESTED BECAUSE ITS FIRST VERSION HAD A HOLE ON THE SIDE THE FAULT
 * ACTUALLY COMES FROM, and CEO 181 found it by reading rather than running. That version opened with
 * `/once .*ovens/`, which classified a sentence as PROTECTIVE on the words "once … ovens" alone —
 * so a rewrite like "Once ye spot their ovens lit, that's yer moment to strike" would have passed
 * GREEN while telling a player the exact thing this gate exists to stop. The gate was strong against
 * the ENGINE changing and weak against the WORDS changing, and the words are what drifted.
 *
 * So: every branch now turns on a VERB about reach, never on the noun "ovens" being nearby, and the
 * classifier is exercised against adversarial fixtures below — including that sentence — so the hole
 * cannot reopen silently. */
function classify(text) {
  const t = text.replace(/<[^>]*>/g, "").toLowerCase();
  /* --red=3 restores the EXACT hole CEO 181 found, so the fixture clause below can be shown to
     catch it by anyone, at any time, without editing this file. A red proof nobody can re-run is a
     red proof somebody has to take on trust. */
  if (RED === 3) return { protects: /once .*ovens/.test(t), raidable: /not even a captain/.test(t) };
  const ovens = /ovens|baking|bake(-| )?off|fired up/.test(t);
  /* PROTECTIVE: the sentence says the reach is denied. */
  const protects = ovens && /beyond yer reach|beyond your reach|out of reach|can'?t be (touched|raided|attacked|robbed)|cannot be (touched|raided|attacked|robbed)|nobody can (touch|raid|attack|rob)|no one can (touch|raid|attack|rob)|ye can'?t (touch|raid|attack|rob)|safe (from|at)|sanctuary|protects them|beyond reach/.test(t);
  /* RAIDABLE: the sentence says the reach stands anyway. */
  const raidable = ovens && /not even|still (a )?(legal )?(target|fair game|raidable)|even .*(raid|attack|rob)|fair game|nobody is safe|no one is safe|yer moment to strike|moment to strike/.test(t);
  return { protects, raidable };
}

/* 2a. the classifier can tell the two apart — proven on fixtures, not assumed.
   Each of these is a sentence somebody could plausibly write into that span. */
const FIXTURES = [
  ["But once a captain's ovens are lit they're beyond yer reach — rob 'em on the way home, or not at all.", "protects"],
  ["A captain at the ovens cannot be raided.", "protects"],
  ["Once the ovens are lit nobody can touch them.", "protects"],
  ["a berth protects nobody, not even a captain who's already fired up the ovens", "raidable"],
  ["Once ye spot their ovens lit, that's yer moment to strike.", "raidable"],
  ["A captain who has fired up the ovens is still a legal target.", "raidable"],
  ["The ovens are lit and the bakery smells grand.", "neither"],
];
const misread = FIXTURES.filter(([s, want]) => {
  const { protects, raidable } = classify(s);
  const got = protects && raidable ? "both" : protects ? "protects" : raidable ? "raidable" : "neither";
  return got !== want;
});
if (!misread.length) pass(`the classifier separates all ${FIXTURES.length} fixture sentences, including the two adversarial rewrites CEO 181 named`);
else fail(`the classifier misread ${misread.length} fixture(s) — it cannot be trusted to judge the real sentence: ${JSON.stringify(misread.map(m => m[0]))}`);

/* 2b. and what the real sentence says matches what the engine actually does */
if (found.length === 1) {
  const text = (RED === 2 ? "a berth protects nobody, not even a captain who's already fired up the ovens" : found[0])
    .replace(/<[^>]*>/g, "").toLowerCase();
  /* Deliberately narrow in one direction: an unrecognised sentence FAILS rather than passing,
     because a rule nobody can classify is a rule nobody is checking. Whoever rewords this sentence
     owns teaching the classifier above about the new wording — that cost is the point. */
  const { protects: claimsSanctuary, raidable: claimsRaidable } = classify(text);

  if (claimsSanctuary && claimsRaidable)
    fail(`the marked sanctuary sentence claims BOTH that the ovens protect and that they do not: ${JSON.stringify(text)}`);
  else if (!claimsSanctuary && !claimsRaidable)
    fail(`the marked sanctuary sentence commits to neither reading, so this gate cannot tell whether it agrees with the engine: ${JSON.stringify(text)}`);
  else if (sanctuary && claimsRaidable)
    fail(`THE RULES CONTRADICT THE GAME. canAttack() refuses an attack on a captain whose ovens are lit, and the rules text tells a player they may make it: ${JSON.stringify(text)}`);
  else if (!sanctuary && claimsSanctuary)
    fail(`THE RULES CONTRADICT THE GAME. canAttack() ALLOWS an attack on a captain whose ovens are lit, and the rules text tells a player they are safe: ${JSON.stringify(text)}`);
  else
    pass(`the rules text and canAttack() agree: ovens lit ${sanctuary ? "PROTECT" : "do NOT protect"} a captain`);
}

console.log(failures ? `\nFAILED — ${failures} check(s)` : "\nOK — the rules text and the engine agree about sanctuary");
process.exit(failures ? 1 : 0);
