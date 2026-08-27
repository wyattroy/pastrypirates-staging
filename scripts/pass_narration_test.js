#!/usr/bin/env node
/* RULE-02 GATE — the pass narration tells the captain they were paid, on all 100 renderings.
 *
 * WHY THIS EXISTS. RULE-01 pays a dubloon for passing. A payment the interface never mentions is a
 * payment the player has to discover by watching their own purse, and a tag that states an amount
 * the engine did not pay is the interface lying to them about it. So the two land together and both
 * gates must be green before either is shippable.
 *
 * THE TAG IS A SUBJECTLESS FRAGMENT, AND THAT IS THE ENTIRE DESIGN (D-06, Wyatt 2026-08-18). The 50
 * sea sightings are hand-written prose PAIRS — an addressed form and a third-person form carrying a
 * name marker — and roughly twenty of them end on the CREATURE as the nearest grammatical subject
 * ("...and a dozen donut shrimp bounce past."). Any appended clause carrying a verb hands the pen to
 * the shrimp. A fragment with no subject, no verb and no agreement reads identically after all fifty
 * sentences in both persons, which is why the tag can be appended by the renderer in ONE place and
 * all 100 hand-written strings stay untouched.
 *
 * That is also the seaLine contract (src/ui/util.js): both persons are read out verbatim, nothing
 * is conjugated, no article is guessed, no agreement is derived. The deleted seaSighting() did all
 * three and got the plurals wrong. This gate is what stops that coming back.
 *
 * THREE LEGS, AND THEY MUST NOT BE COLLAPSED INTO ONE. The amount inside the tag is no longer
 * written into the builder — it derives from a field on the round config, the same field the engine
 * pays from. That makes ONE failure mode available to this file that was not available before: an
 * assertion re-pointed at that field becomes a TAUTOLOGY, unable to fail and still printing PASS.
 * Read the same constant twice and you have built a mirror, not a check. Each leg catches something
 * the other two cannot, so every assertion below says which one it belongs to:
 *
 *   LEG A  THE SHIPPED DEFAULT, PINNED TO HAND-TYPED COPY. TAG below is D-06's approved wording,
 *          amount and all, typed out once and never read back off the config it pins. All 100
 *          renderings are compared against it. *** THIS IS THE LEG THE HAZARD IS ABOUT: move the
 *          config default and a tautological gate stays green while a pinned one goes red. *** It
 *          is also why the 100 verdicts were NOT edited when the builder was de-hardcoded — their
 *          passing UNCHANGED is the evidence that the derivation is invisible at the default, and
 *          rewriting them would have destroyed exactly that evidence.
 *   LEG B  DERIVATION, PROVED AT A PAYOUT THAT IS NOT THE DEFAULT. A builder that kept a literal
 *          passes every run at 1 and fails the moment the number moves, which under D-07 is next
 *          week. So all 100 are re-rendered at a payout the game would never produce by accident,
 *          against a tag built from a literal typed here — never from the config.
 *   LEG C  AGREEMENT BETWEEN AN OBSERVED DELTA AND A RENDERED STRING. The anti-tautology leg. A real
 *          payment is run on the fixture game and the purse delta captured as a NUMBER the engine
 *          performed; the narration is then rendered for that same game and the amount in the STRING
 *          the renderer produced is compared against it. Neither side is a constant read off the
 *          other's source, so a builder pointed at the wrong config field is caught even though both
 *          sides would still "derive". Done at both payouts. Its button half lives in
 *          scripts/pass_coin_test.js and is a SOURCE read, because the button needs a DOM.
 *
 * WHAT IT GATES
 *   RULE-02 coverage    All 100 renderings — 50 entries x the addressed and third-person persons —
 *                       end with the tag. One check line per rendering, each naming its own fault.
 *   RULE-02 ENCODING    *** THE EDGE THIS GATE EXISTS FOR ***
 *                       Asserted on the string the builder ACTUALLY RETURNS, never on the source
 *                       literal, so a coin mangled or split by the render pipeline is caught. The
 *                       coin is checked as a whole grapheme (code-point iteration, not a substring
 *                       match, which a lone surrogate would satisfy) and the whole rendering is
 *                       swept for unpaired surrogates.
 *   D-50 chokepoint     The coin rides through the ONE emoji chokepoint: a raw character in the
 *                       builder body that emojify() swaps for the coin image, exactly as panel()
 *                       does at render time. Proven by running emojify() over every rendering, and
 *                       by asserting the builder body hand-rolls no image markup of its own.
 *   D-06 wrapping       The tag is wrapped WHOLE in a no-break span — the unit and its amount are
 *                       one readable thing and must not split across a line break (the sailing-order
 *                       precedent, G27/P7). Asserted as one exact substring, so nothing can creep in
 *                       between the opening tag and the coin.
 *   Sentence intact     Each entry's own sighting sentence still renders verbatim, ahead of the tag.
 *                       The renderer appends; it does not rewrite.
 *   Caption + pop       The on-ship caption and the wave pop are unchanged. The tag lands in the
 *                       narration text only.
 *
 * FIXTURE VALIDATION (docs/HARD-WON-LESSONS.md §3 — a fixture that cannot exist in the game proves
 * nothing). Every creature here is READ OUT of SEA_CREATURES rather than typed, and the shape of
 * what was read is asserted before anything is measured. A hand-typed sighting would let this file
 * "prove" the tag works on a sentence the game does not contain.
 *
 * CONTROLS, because a harness is unreviewed code. The entry count, the pair shape, the name marker
 * in the third-person form, and the fact that the two persons render DIFFERENTLY are all printed and
 * checked before the 100 renderings run — a builder that ignored its viewer argument would otherwise
 * sail through 100 identical assertions.
 *
 * WHY THE EXPLICIT EXIT. Importing src/ui/util.js arms module-scope timers that hold Node's event
 * loop open forever after a perfectly SUCCESSFUL import — the same reason scripts/stage_import_
 * check.js and scripts/pp4_timeroff_check.js force theirs. A gate that hangs CI is worse than no
 * gate.
 *
 * IT PRINTS RENDERED COPY, NOT A DESCRIPTION OF IT (CLAUDE.md §1). Wyatt picked this wording after
 * seeing real lines on screen and reversing himself twice, and he judges copy the same way every
 * time. The samples below include the donut-shrimp line, which broke every earlier draft.
 *
 * FAILURE DEMONSTRATION (CLAUDE.md §4 — a check nobody has seen fail is not yet a check). Recorded
 * with observed exit codes in 01-04-SUMMARY.md.
 *
 * Run: node scripts/pass_narration_test.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_NARRATION, pn, NEUTRAL_VIEWER } from "../src/ui/util.js";
import { SEA_CREATURES, emojify, COIN_IMG, WAVE_IMG } from "../src/shared/index.js";
import { appState } from "../src/state/index.js";
import { Game, roundCfg } from "../src/engine/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");            // -> 4/
const UTIL_PATH = path.join(ROOT, "src", "ui", "util.js");
const UTIL_SRC = fs.readFileSync(UTIL_PATH, "utf8");

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }
function countOf(src, needle) { return src.split(needle).length - 1; }

// Four claimed seats with real names (a truthy id makes pname() read the name rather than the
// seat-indexed default). appState.mySeat is left at its module default — this gate always passes an
// explicit viewerSeat, so the live value is never consulted.
appState.roster = [
  { id: "u0", name: "Davy Scones" },
  { id: "u1", name: "Crustbeard" },
  { id: "u2", name: "Dough Hook" },
  { id: "u3", name: "Flaky Jack" },
];
const at = () => [0, 0];   // the builder needs board coordinates for its pop; it never reads them here
const SEAT = 1;            // Crustbeard, the seat D-06's own rendered check was written against

/* A REAL GAME, because the builder reads the payout off the live round config rather than writing a
 * number into the tag. A hand-made {cfg:{...}} stand-in would let this file "prove" the tag against
 * a config the game cannot produce — the lemon-in-the-hold failure (docs/HARD-WON-LESSONS.md §3), so
 * the fixture is built by roundCfg() exactly as every construction site in the tree builds it, at a
 * fixed seed, and is VALIDATED below before a single rendering is measured. Third arg true is the
 * record flag; bakeoff:true is explicit because these are the rules /4 ships. */
const STRATS = ["pirate", "trader", "balanced", "rusher"];
const SHIPPED_PAYOUT = 1;  // Leg A: hand-typed, never read back off the config it is pinning
appState.game = new Game({ ...roundCfg(STRATS), bakeoff: true }, 7919, true);

// The tag, and the whole-unit wrapping it must arrive in. Both written once, here, and everything
// below is asserted against these rather than against a literal repeated per assertion.
const TAG = "Recipe idea! (+1\u{1F315})";
const WRAPPED = `<span class="nobrk">${TAG}</span>`;
const COIN = "\u{1F315}";
// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one. This is
// what a multi-code-point character split by a careless slice or re-encode leaves behind.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function render(entry, mine) {
  return EVENT_NARRATION.pass({ t: "pass", p: SEAT, sea: entry }, at, 40, mine ? SEAT : NEUTRAL_VIEWER);
}
function plain(html) { return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

console.log("\nRULE-02 — the pass narration says the captain was paid\n");

/* ================= the fixture, before anything is measured ================= */
console.log("  -- fixture: the sightings are the game's own, not this file's --");
// The seated game, asserted before it is used. A cfg missing the payout field would render the tag
// as NaN on all 100 lines, and a config default that has quietly moved would render a number D-06
// never approved — this pins both, against a literal typed here rather than read back off the
// config, which is the whole point of the pin.
checkTrue("CONTROL: a real game is seated, built by the game's own round config", appState.game instanceof Game);
checkTrue("CONTROL: the payout the builder reads is a finite number", Number.isFinite(appState.game.cfg.passCoin));
check("LEG A: the shipped default payout is one dubloon", appState.game.cfg.passCoin, SHIPPED_PAYOUT);
check("CONTROL: SEA_CREATURES holds 50 hand-written entries", SEA_CREATURES.length, 50);
checkTrue("CONTROL: every entry is a pair carrying both persons",
  SEA_CREATURES.every((s) => s && typeof s.y === "string" && typeof s.t === "string" && s.y.length > 0 && s.t.length > 0));
checkTrue("CONTROL: every third-person entry carries the name marker",
  SEA_CREATURES.every((s) => s.t.includes("{}")));
checkTrue("CONTROL: no entry writes the tag itself — the renderer appends it in one place",
  SEA_CREATURES.every((s) => !s.y.includes("Recipe idea") && !s.t.includes("Recipe idea")));
// A builder that ignored its viewer argument would sail through 100 identical assertions below.
checkTrue("CONTROL: the two persons really do render differently",
  render(SEA_CREATURES[0], true).txt !== render(SEA_CREATURES[0], false).txt);
checkTrue("CONTROL: emojify() swaps a raw coin for the coin image", emojify(COIN).includes(COIN_IMG));

/* ================= 100 renderings ================= */
console.log("\n  -- 100 renderings: 50 entries x the addressed and third-person persons --");

function verdict(entry, mine) {
  const out = render(entry, mine);
  const txt = out && out.txt;
  if (typeof txt !== "string") return "the builder returned no narration text";
  const problems = [];
  // the tag, whole, unbroken, and at the end
  if (!txt.endsWith(WRAPPED)) problems.push("does not end with the tag wrapped whole in a no-break span");
  if (countOf(txt, TAG) !== 1) problems.push(`the tag appears ${countOf(txt, TAG)} times, not once`);
  if (countOf(txt, WRAPPED) !== 1) problems.push("the no-break wrapping is missing or duplicated");
  // ENCODING — on the returned string, and as a whole grapheme
  if (!Array.from(txt).includes(COIN)) problems.push("the coin did not survive as a whole grapheme");
  if (LONE_SURROGATE.test(txt)) problems.push("the rendering contains an unpaired surrogate");
  // D-50 — the raw coin resolves at the chokepoint, and nothing hand-rolls it earlier
  const emojified = emojify(txt);
  if (!emojified.includes(COIN_IMG)) problems.push("the coin does not resolve to the coin image at the chokepoint");
  if (emojified.includes(COIN)) problems.push("a raw coin survived the chokepoint unresolved");
  // the sighting sentence itself, verbatim, ahead of the tag
  const sentence = mine ? entry.y : entry.t.replace("{}", pn(SEAT));
  const si = txt.indexOf(sentence);
  if (si < 0) problems.push("the entry's own sighting sentence is not rendered verbatim");
  else if (si > txt.indexOf(WRAPPED)) problems.push("the tag renders ahead of the sighting sentence");
  // the caption and the pop are narration-text-free
  const capTxt = out.caps && out.caps[0] && out.caps[0][1];
  if (capTxt !== "\u{1F30A} looks into the ocean") problems.push(`the on-ship caption changed: ${JSON.stringify(capTxt)}`);
  if (!out.pops || out.pops[0][1] !== "\u{1F30A}" || out.pops[0][2] !== false || out.pops[0][3] !== WAVE_IMG) {
    problems.push("the wave pop changed");
  }
  return problems.length ? problems.join("; ") : "ok";
}

for (let i = 0; i < SEA_CREATURES.length; i++) {
  check(`#${String(i).padStart(2, "0")} addressed`, verdict(SEA_CREATURES[i], true), "ok");
  check(`#${String(i).padStart(2, "0")} third-person`, verdict(SEA_CREATURES[i], false), "ok");
}

/* ================= LEG B: the amount DERIVES, proved away from the default ================= */
/* A builder that kept a literal sails through every assertion above. So the payout is moved to a
 * number the game would never produce by accident and all 100 are re-rendered — against a tag built
 * from a literal typed HERE, never read back off the config that was just set. Counted rather than
 * printed one line per rendering: 100 more PASS lines would bury the report, and a count is
 * falsifiable where a bare "OK" is not. */
console.log("\n  -- 100 re-renderings at a payout that is NOT the default --");
const ALT_PAYOUT = 7;
const ALT_WRAPPED = `<span class="nobrk">Recipe idea! (+${ALT_PAYOUT}\u{1F315})</span>`;
appState.game.cfg.passCoin = ALT_PAYOUT;
let altOk = 0, altFirstFault = "";
for (let i = 0; i < SEA_CREATURES.length; i++) {
  for (const mine of [true, false]) {
    const txt = render(SEA_CREATURES[i], mine).txt;
    if (txt.endsWith(ALT_WRAPPED) && countOf(txt, ALT_WRAPPED) === 1) altOk++;
    else if (!altFirstFault) altFirstFault = `#${String(i).padStart(2, "0")} ${mine ? "addressed" : "third-person"}: ${JSON.stringify(txt.slice(-60))}`;
  }
}
if (altFirstFault) console.log(`         first fault: ${altFirstFault}`);
check(`LEG B: all 100 renderings carry the moved payout, wrapped whole`, altOk, SEA_CREATURES.length * 2);
// The counterpart, and it is what makes the count above mean something: at the moved payout the
// shipped default's tag must be GONE from every rendering. Without this a builder that appended both
// amounts, or ignored the config and got lucky, would still score 100.
let staleDefault = 0;
for (let i = 0; i < SEA_CREATURES.length; i++) {
  for (const mine of [true, false]) if (render(SEA_CREATURES[i], mine).txt.includes(TAG)) staleDefault++;
}
check("LEG B: and not one of them still carries the shipped default's amount", staleDefault, 0);

/* ================= LEG C: an OBSERVED delta against a RENDERED string ================= */
/* THE ANTI-TAUTOLOGY LEG. One side is a number the engine actually produced by moving a purse; the
 * other is the amount inside a string the renderer actually built. Neither is read off the other's
 * source, so this stays able to fail even though both sides derive from the same field — a builder
 * pointed at the WRONG config field derives just as honestly and is caught here and nowhere else.
 * Run at both payouts, because agreement at one number can be a coincidence. */
console.log("\n  -- the amount RENDERED equals the purse delta a real payment OBSERVES --");
function observedVsRendered(payout, seed) {
  appState.game = new Game({ ...roundCfg(STRATS), bakeoff: true, passCoin: payout }, seed, true);
  const p = appState.game.players[SEAT];
  const before = p.coins;
  appState.game.doPass(p);                      // behaviour the engine performed
  const observed = p.coins - before;            // ... captured as a plain number
  const txt = render(SEA_CREATURES[4], false).txt;   // ... and a string the renderer produced
  const expected = `<span class="nobrk">Recipe idea! (+${observed}\u{1F315})</span>`;
  return { observed, txt, agrees: txt.endsWith(expected) };
}
for (const [payout, seed] of [[SHIPPED_PAYOUT, 5 * 7919], [ALT_PAYOUT, 6 * 7919]]) {
  const r = observedVsRendered(payout, seed);
  console.log(`         at a configured payout of ${payout}: the engine moved the purse by ${r.observed}; rendered "...${r.txt.slice(-42)}"`);
  checkTrue(`CONTROL: the payment at ${payout} actually moved a purse by a finite amount`, Number.isFinite(r.observed));
  check(`LEG C: the amount the narration renders equals the delta the purse observed (payout ${payout})`, r.agrees, true);
}

/* Back to the shipped default, and re-rendered to prove the restore took, before the structural
 * assertions below read a source file that says nothing about the live config. */
appState.game = new Game({ ...roundCfg(STRATS), bakeoff: true }, 7919, true);
check("LEG A: restored — the fixture is back at the shipped default", appState.game.cfg.passCoin, SHIPPED_PAYOUT);
checkTrue("LEG A: and a rendering at the restored default carries D-06's approved tag again",
  render(SEA_CREATURES[4], false).txt.endsWith(WRAPPED));

/* ================= the builder's own source ================= */
console.log("\n  -- src/ui/util.js: appended in one place, resolved at the chokepoint --");
check("the tag is written in exactly one place in the narration table", countOf(UTIL_SRC, "Recipe idea!"), 1);

const passIdx = UTIL_SRC.indexOf("\n  pass:(e,at,cellPx,viewerSeat)=>(");
checkTrue("CONTROL: the pass builder was located in the narration table", passIdx >= 0);
if (passIdx >= 0) {
  const body = UTIL_SRC.slice(passIdx, UTIL_SRC.indexOf("\n  unfinish:", passIdx));
  console.log(`         pass builder anchored at util.js:${UTIL_SRC.slice(0, passIdx).split("\n").length + 1}, ${body.split("\n").length} lines`);
  /* The body no longer carries the tag as ONE literal, because the amount derives from the round
   * config. What must still be true of the source is that the WORDING is written out here and the
   * NUMBER is not — the pin against D-06's approved string in full is the 100 verdicts above, which
   * compare the RENDERED text and are unchanged. Derived from TAG rather than re-typed, so the two
   * cannot drift. */
  checkTrue("the builder body carries the tag's approved wording", body.includes(TAG.slice(0, TAG.indexOf("(") + 2)));
  /* LEG C's negative, in the shape a re-hardcoded TAG takes: a `+` immediately followed by a digit
   * inside the parenthetical. The body is sliced from the builder itself, so the prose above it —
   * which necessarily discusses what the amount used to be — cannot trip this on the explanation
   * rather than on a breach. */
  checkTrue("LEG C: the builder writes no literal amount into the tag — the number is derived",
    !/\(\+\d/.test(body));
  checkTrue("LEG C: and it reads the payout off the live round config, the same field the engine pays from",
    body.includes("appState.game.cfg.passCoin"));
  check("the builder body wraps it in exactly one no-break span", countOf(body, "nobrk"), 1);
  checkTrue("the builder body hand-rolls no image markup — the coin resolves at the chokepoint",
    !body.includes("iconImg(") && !body.includes("COIN_IMG") && !body.includes("<img"));
}

/* ================= rendered samples, for a human to read ================= */
// Three lines at both persons, printed as the panel receives them and as they read on screen. #04 is
// the donut-shrimp line that broke every earlier draft; #00 opens the list and #49 closes the ring.
console.log("\n  -- rendered samples (D-06: show the copy, do not describe it) --");
for (const i of [0, 4, 49]) {
  for (const mine of [true, false]) {
    const out = render(SEA_CREATURES[i], mine);
    console.log(`\n    #${String(i).padStart(2, "0")} ${mine ? "addressed " : "third-person"}  ${plain(out.txt)}`);
    console.log(`         raw:  ${out.txt}`);
  }
}

console.log(`\n  ${SEA_CREATURES.length * 2} renderings checked, ${failures} failure(s)\n`);
// util.js arms module-scope timers on import; without this the gate hangs after a successful run.
process.exit(failures ? 1 : 0);
