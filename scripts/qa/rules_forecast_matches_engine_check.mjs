#!/usr/bin/env node
/* rules_forecast_matches_engine_check.mjs — the rules text may not contradict the engine about
 * whether the compass's ghost needle shows a STORM's direction.
 *
 * WHY THIS EXISTS, AND IT IS THE SANCTUARY FAULT A SECOND TIME. Wyatt's ruling
 * INBOX-20260902T225008Z was "Do a new /rules.html that explains the rules -- using the latest
 * version of the game." Auditing the remaining claims on that page (T-216, 2026-09-03) found a
 * second sentence contradicting a rule HE HIMSELF CHANGED. The modal said the ghost needle shows
 * next day's wind "storms and all", and `Game.forecastWind` has hidden exactly that since his
 * v2.1 ruling of 2026-08-06 (`src/engine/index.js`: `return this.stormNext?null:this.windNext;` —
 * "remove the storm direction from the forecast, so you'd know that a storm is coming but not
 * which direction").
 *
 * WHAT IT COSTS A PLAYER, which is why it is worth a gate rather than a quiet edit. The forecast is
 * the whole justification for the rest of the weather rules: a storm can shove you three squares
 * and you are told a day ahead so you can plan around it. A reader told the direction is shown will
 * plan a route on the strength of a needle that, on exactly the day it matters, shows a spinning
 * arrow instead of a letter (`src/ui/board.js` — `forecastMark.textContent = nx ? ... : ""`).
 *
 * WHY IT IS BEHAVIOURAL AND NOT A GREP. The truth is taken by CALLING forecastWind() on a real Game
 * with a storm standing in the forecast, in both states — not by reading the flag, and not by
 * reading a comment. If the ruling is ever reversed and storms rejoin the forecast, this gate goes
 * red until the WORDS follow. Both directions, like its sanctuary sibling.
 *
 * WHY IT IS A SECOND FILE AND NOT A CLAUSE INSIDE THAT SIBLING: they measure different functions
 * and their classifiers share no vocabulary, so folding them together would make one file that is
 * two gates wearing a trench coat. What they DO share — how a marked sentence is located on the
 * page — was converged into `engineClaims()` in scripts/lib/rules_page.mjs rather than copied.
 *
 *   node scripts/qa/rules_forecast_matches_engine_check.mjs
 *   node scripts/qa/rules_forecast_matches_engine_check.mjs --red=<n>   deliberately break clause n
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

/* THE ENGINE'S ANSWER, taken by asking it rather than by reading it. Both states are forced
   deliberately instead of sailing until a storm turns up: a probe that waits for weather is a probe
   that sometimes measures nothing and reports green. The CALM case is asserted too — if the
   forecast were null on a calm day as well, this check would know nothing about storms, which is
   rule 6's "a measurement that cannot fail is not a measurement". */
function engineHidesStormDirection() {
  const g = new Game(roundCfg(["human", "bot", "bot", "bot"]), 12345, true);
  g.windNext = "N";
  g.stormNext = false;
  const calm = g.forecastWind();
  g.stormNext = true;
  const stormy = g.forecastWind();
  return { calm, stormy };
}

const { calm, stormy } = engineHidesStormDirection();

/* 0. the instrument reaches its subject */
if (calm != null) pass("the probe reads a real forecast on a calm day (so a null on a storm day means something)");
else fail("forecastWind() returned nothing even with NO storm coming — this check knows NOTHING about storms; fix the probe before trusting any verdict below");

const hidesStorm = calm != null && stormy == null;

const page = await renderRulesPage(REPO);
const marked = engineClaims(page, "forecast");

/* 1. the rules text says something about it, in a place a gate can address */
const found = RED === 1 ? [] : marked;
if (found.length === 1) pass("the rules text carries exactly one forecast claim, marked for this gate");
else fail(`the rules text carries ${found.length} span(s) marked data-engine-rule="forecast" — expected exactly 1. The engine ${hidesStorm ? "HIDES" : "shows"} a storm's direction in the forecast, and nothing on the page is tied to that fact, so the words can drift away from the game with npm test green.`);

/* THE CLASSIFIER. It reads a sentence about the ghost needle / forecast and says which of the two
 * rules it asserts.
 *
 * ⚠ IT TURNS ON WHAT THE SENTENCE PROMISES ABOUT A STORM'S DIRECTION, never on the word "storm"
 * being nearby — the lesson CEO 181 taught the sanctuary gate, applied here on the first draft
 * instead of after the hole was found. "Storm" appears in BOTH readings, so a classifier keyed on
 * it would place every sentence in both buckets or neither. The discriminator is whether the
 * sentence extends the forecast's promise TO storms or withholds it FROM them, and the fixtures
 * below include adversarial rewrites of each. */
function classify(text) {
  const t = text.replace(/<[^>]*>/g, "").toLowerCase().replace(/[’']/g, "'");
  /* --red=3 restores the naive keyword classifier a first draft would reach for, so the fixture
     clause below can be shown to catch it by anyone, at any time, without editing this file. */
  if (RED === 3) return { shows: /storm/.test(t), hides: /not/.test(t) };
  /* SHOWS: the forecast's promise is extended to storms too. */
  const shows = /storms and all|storms included|including storms|even storms|storms too|storm and all|which way (the|a) storm|the storm's (own )?(direction|bearing)|direction of the storm/.test(t);
  /* HIDES: the sentence withholds the direction for a storm specifically. */
  const hides = /not which way|never which way|but not (its|the) (direction|bearing|way)|not the direction|no direction|which way it'?ll blow.{0,24}(anyone'?s guess|ye'?ll not know|nobody knows|no tellin)|keeps? (its|the) (direction|bearing) (to itself|hidden|secret)|won'?t say which way|can'?t say which way|cannot say which way|says? nothing (about|of) (which way|the direction)|blank|hides? (its|the) (direction|bearing)/.test(t);
  return { shows, hides };
}

/* 2a. the classifier can tell the two apart — proven on fixtures, not assumed.
   Each of these is a sentence somebody could plausibly write into that span. */
const FIXTURES = [
  ["the ghost needle behind it is next day's — storms and all. That forecast is never wrong", "shows"],
  ["Tomorrow's wind is on the compass too, even storms.", "shows"],
  ["The compass names which way a storm will blow a full day ahead.", "shows"],
  ["A storm is the one thing it won't name: ye know it's coming, but not which way.", "hides"],
  ["The ghost needle goes blank for a storm — ye get a day's warning and no direction.", "hides"],
  ["Ye'll know a storm is due, but which way it'll blow is anyone's guess.", "hides"],
  ["The wind holds for the whole table each day.", "neither"],
];
const misread = FIXTURES.filter(([s, want]) => {
  const { shows, hides } = classify(s);
  const got = shows && hides ? "both" : shows ? "shows" : hides ? "hides" : "neither";
  return got !== want;
});
if (!misread.length) pass(`the classifier separates all ${FIXTURES.length} fixture sentences`);
else fail(`the classifier misread ${misread.length} fixture(s) — it cannot be trusted to judge the real sentence: ${JSON.stringify(misread.map(m => m[0]))}`);

/* 2b. and what the real sentence says matches what the engine actually does */
if (found.length === 1) {
  const text = (RED === 2 ? "the ghost needle behind it is next day's — storms and all" : found[0])
    .replace(/<[^>]*>/g, "").toLowerCase();
  /* Deliberately narrow in one direction: an unrecognised sentence FAILS rather than passing,
     because a rule nobody can classify is a rule nobody is checking. Whoever rewords this sentence
     owns teaching the classifier above about the new wording — that cost is the point. */
  const { shows: claimsShows, hides: claimsHides } = classify(text);

  if (claimsShows && claimsHides)
    fail(`the marked forecast sentence claims BOTH that storms are forecast and that they are not: ${JSON.stringify(text)}`);
  else if (!claimsShows && !claimsHides)
    fail(`the marked forecast sentence commits to neither reading, so this gate cannot tell whether it agrees with the engine: ${JSON.stringify(text)}`);
  else if (hidesStorm && claimsShows)
    fail(`THE RULES CONTRADICT THE GAME. forecastWind() returns nothing while a storm is coming, and the rules text tells a player the ghost needle shows it: ${JSON.stringify(text)}`);
  else if (!hidesStorm && claimsHides)
    fail(`THE RULES CONTRADICT THE GAME. forecastWind() DOES name a storm's direction, and the rules text tells a player it is withheld: ${JSON.stringify(text)}`);
  else
    pass(`the rules text and forecastWind() agree: a storm's direction is ${hidesStorm ? "WITHHELD" : "shown"} in the forecast`);
}

console.log(failures ? `\nFAILED — ${failures} check(s)` : "\nOK — the rules text and the engine agree about the forecast");
process.exit(failures ? 1 : 0);
