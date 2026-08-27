#!/usr/bin/env node
/* RULE-01 GATE — a captain who passes is paid a dubloon, at every site, BEFORE the event records it.
 *
 * WHY THIS EXISTS. Passing is the always-available turn-ender: the one move nobody can ever be
 * denied. RULE-01 makes it pay one dubloon. Three separate places in this tree end a turn that way
 * — the human menu and the animated bot fallback in src/ui/flow.js, and the engine fallback in
 * src/engine/index.js — and the flow-tier bot fallback is duplicated on purpose rather than
 * inherited (the comment above it says why). A payment added only to the engine would pay the
 * simulator and leave every real browser game exactly as broken, so this gate checks all three.
 *
 * Bots and humans have identical rules and affordances (.planning/PROJECT.md -> Constraints). Bots
 * pass, so bots are paid. That is settled and is not an open question.
 *
 * THREE LEGS, AND THEY MUST NOT BE COLLAPSED INTO ONE. The payout is no longer a literal in the
 * method — it is a field on the round config, and the payment, the button and the narration all
 * derive from it. That makes ONE failure mode available to this file that was not available before:
 * a gate re-pointed at the same config field the engine reads becomes a TAUTOLOGY. `delta ===
 * cfg.passCoin` against `coins += cfg.passCoin` cannot fail, and it still prints PASS. Read the same
 * constant twice and you have built a mirror, not a check. Every assertion below says which leg it
 * belongs to, because each leg catches something the other two cannot:
 *
 *   LEG A  THE SHIPPED DEFAULT, PINNED TO A HAND-TYPED LITERAL. The purse delta is compared with a
 *          1 typed into this file and never read back off the config it is pinning. Catches the
 *          config default silently moving. *** THIS IS THE LEG THE HAZARD IS ABOUT: a tautological
 *          gate SURVIVES a changed default and a pinned one does not. *** Red-proofed by exactly
 *          that sabotage.
 *   LEG B  DERIVATION, PROVED AT A PAYOUT THAT IS NOT THE DEFAULT. A site that kept a literal passes
 *          every run at 1 and fails the moment the number moves — which under D-07 is next week. So
 *          the payment is driven at 7 and at 0 as well, from real games built the way the tree
 *          builds them. `=== 0` and `== null` throughout: a zero payout and seat 0 are both real
 *          values (docs/HARD-WON-LESSONS.md §3, the falsy zero).
 *   LEG C  AGREEMENT BETWEEN AN OBSERVED DELTA AND A RENDERED STRING. The anti-tautology leg, and it
 *          must never be built out of one constant read twice. Its narration half lives in
 *          scripts/pass_narration_test.js, which runs a real payment, captures the purse delta as
 *          a NUMBER the engine produced, and compares it against the amount in a STRING the renderer
 *          produced. What lives HERE is the button half — and the button cannot be rendered in this
 *          process at all, because its label is built inside humanAct, which needs a DOM. That is
 *          stated plainly rather than dressed up: what follows is a SOURCE READ, not a rendering. It
 *          asserts the label is built from the same config the narration reads, and that the region
 *          matches no literal-digit gain parenthetical — which is what a re-hardcoded label looks
 *          like — with the Attack precedent asserted alongside as a CONTROL, so a rotted anchor
 *          convention fails loudly instead of leaving an empty region every later check "passes".
 *
 * WHAT IT GATES
 *   RULE-01 payment     One shared Game.prototype.doPass(p) raises the acting captain's purse by
 *                       exactly the configured amount — 1 at the shipped default, not 0, not 2 —
 *                       and appends exactly one pass entry. No other captain's purse moves.
 *   RULE-01 one source  The amount is written in ONE place, a field on roundCfg(), and the payment,
 *                       the button and the narration tag all derive from it. Nothing re-hardcodes.
 *   RULE-01 ORDERING    *** THE ASSERTION THAT MATTERS MOST IN THIS FILE ***
 *                       The purse is mutated BEFORE the event is recorded. Game.ev() is a recorder,
 *                       not a reducer: it builds its own state snapshot at the instant it is called,
 *                       mapping every captain's position, purse, hold, done flag and baking flag.
 *                       Record before paying and that snapshot holds the PRE-payment purse, so the
 *                       replay scrubber shows a captain a dubloon short at the exact tick their
 *                       narration claims they were paid. Phase 3 freezes this event stream into a
 *                       determinism corpus, after which the same fix costs a gated re-record
 *                       (docs/DETERMINISM-RERECORD.md). So the ordering is a predicate, not a style
 *                       preference, and it is asserted DIRECTLY off the recorded snapshot rather
 *                       than inferred from the order of two lines in the source.
 *   RULE-01 event shape The pass entry's key set is unchanged: the turn envelope plus `sea`, with no
 *                       key added, removed or renamed. Derived from a recorded {t:"turn"} entry in
 *                       the same run rather than hand-typed, so it stays true if ev() ever gains a
 *                       field (and stays a real check if it does not).
 *   RULE-01 all sites   Structural, on src/ui/flow.js read as raw text: both UI-tier sites call
 *                       the shared method and neither emits a bare pass event any more.
 *   Cursor placement    The human-only sea-cursor advance stays in the human menu and did NOT
 *                       migrate into the engine. It is per-device narration bookkeeping owned by one
 *                       seat; bots walk their own derived offsets and never touch it. Folding it
 *                       into the shared method would hand it to bots.
 *   Determinism         src/engine/ still contains zero wall-clock and zero random sources. A
 *                       single non-seeded call there makes seeded lockstep replay meaningless and
 *                       the Phase 3 corpus worthless.
 *
 * TWO HALVES. Half one imports ../src/engine/index.js and drives the real engine — source shape
 * cannot tell you what a snapshot actually contains. Half two reads src/ui/flow.js as raw text,
 * the source-text assertion convention of scripts/narration_flow_test.js, because botTurn and
 * humanAct need a DOM and can never run here.
 *
 * CONTROLS, because a harness is unreviewed code (docs/HARD-WON-LESSONS.md §3). Every run prints
 * quantities whose value is known before anything is measured: the record flag is on (ev() opens
 * with an early return on it, so a missing flag reads as a plausible, entirely fabricated "the
 * engine never records a pass"); the event log is non-empty; the anchor searches found their
 * anchors; and the number of source anchors located is printed, because a green run over a slice
 * that matched nothing is the shape of check this project has shipped before.
 *
 * `w == null`, never `!w`, and `q.idx` compared with `!==` — seat 0 is a real seat and a real
 * winner (docs/HARD-WON-LESSONS.md §3, the falsy zero).
 *
 * QUOTED vs BARE. Half two counts raw substrings in flow.js, so any key or call named in PROSE over
 * there must be written bare. Same trap as scripts/seat_arg_check.js, whose first run failed on
 * the comment documenting the bug it existed to catch (HARD-WON-LESSONS §1b).
 *
 * FAILURE DEMONSTRATION (CLAUDE.md §4 — a check nobody has seen fail is not yet a check). Recorded
 * with observed exit codes in 01-04-SUMMARY.md.
 *
 * Run: node scripts/pass_coin_test.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Game, roundCfg } from "../src/engine/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");            // -> 4/
const SRC = path.join(ROOT, "src");                 // -> src
const FLOW_PATH = path.join(SRC, "ui", "flow.js");
const ENGINE_DIR = path.join(SRC, "engine");
const ENGINE_PATH = path.join(ENGINE_DIR, "index.js");
const FLOW_SRC = fs.readFileSync(FLOW_PATH, "utf8");
const ENGINE_SRC = fs.readFileSync(ENGINE_PATH, "utf8");

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

function lineOf(src, idx) { return src.slice(0, idx).split("\n").length; }
function countOf(src, needle) { return src.split(needle).length - 1; }

/* Locate a region by the code that surrounds it, never by line number — line numbers in this file
 * would rot the first time somebody edits flow.js above the site. Returns "" and records a failure
 * when the anchor is missing, so a moved anchor is a loud FAIL rather than a silently empty slice
 * that every later assertion then "passes" against. */
let anchorsFound = 0;
function regionAfter(src, anchor, chars, label, file = FLOW_PATH) {
  const i = src.indexOf(anchor);
  if (i < 0) { failures++; console.log(`  FAIL  ${label}: anchor not found in source: ${JSON.stringify(anchor)}`); return ""; }
  anchorsFound++;
  console.log(`         ${label} anchored at ${path.basename(file)}:${lineOf(src, i)}`);
  return src.slice(i, i + chars);
}
/* Trim a region at its own closing punctuation, so what is scanned is the construct and not whatever
 * happens to follow it. This matters here specifically: the prose ABOVE the pass button explains why
 * the parenthetical disappears at a zero payout, and spells out what that would have rendered as —
 * so a region that swallowed a neighbouring comment would trip the literal-digit assertion on the
 * explanation of the rule rather than on a breach of it. The QUOTED-vs-BARE trap, one level out. */
function upTo(region, terminator) {
  const j = region.indexOf(terminator);
  return j < 0 ? region : region.slice(0, j + terminator.length);
}
// The one accessor every UI-tier reader of the payout goes through. Written as the full chain, not
// the bare field name, because prose in these files can naturally contain the latter and cannot
// naturally contain the former.
const CFG_READ = "appState.game.cfg.passCoin";
// LEG A's pin. Hand-typed here, and never read back off the config it exists to pin.
const SHIPPED_PAYOUT = 1;
// LEG B's non-default payouts. 7 is nothing the game would produce by accident; 0 is the D-07 floor
// and the value a falsy test would silently swallow.
const ALT_PAYOUT = 7;
const ZERO_PAYOUT = 0;

const STRATS = ["pirate", "trader", "balanced", "rusher"];
// roundCfg() returns bakeoff:true headless and this passes it explicitly too: these are the
// BAKE-OFF rules, which is what /4 ships. Third arg true is the record flag.
function newGame(seed) { return new Game({ ...roundCfg(STRATS), bakeoff: true }, seed, true); }

console.log("\nRULE-01 — passing pays a dubloon\n");

/* ================= HALF ONE: the real engine ================= */
console.log("  -- engine: the shared method --");

/* LEG A. The config default, pinned against a literal typed into this file. This is the assertion a
 * vacuous gate would not have: re-point it at the config and it becomes `x === x`. It sits first so
 * that when the default moves, the report opens by saying so rather than burying it under a purse
 * delta whose expected value the reader then has to reason about. */
check("LEG A: the shipped default payout is one dubloon", roundCfg(STRATS).passCoin, SHIPPED_PAYOUT);
checkTrue("CONTROL: the payout on a freshly built round config is a finite number",
  Number.isFinite(roundCfg(STRATS).passCoin));

const g = newGame(7919);
checkTrue("CONTROL: the game was constructed with the record flag on", g.record === true);
const HAS_DOPASS = typeof g.doPass === "function";
checkTrue("CONTROL: doPass exists on the Game prototype", HAS_DOPASS);
g.advanceWind();                       // so the recorded entry carries real weather, as in play()

/* Every assertion runs before the exit (the scripts/ house shell), so the engine half is skipped
 * as a block rather than allowed to throw on a missing method — a gate that dies at its first
 * failure hides the rest of the report, and half two is what tells you WHERE the method is missing
 * from. */
if (!HAS_DOPASS) console.log("         (engine half skipped — the shared method does not exist yet)");
if (HAS_DOPASS) {
const p = g.players[1];
const coinsBefore = g.players.map((q) => q.coins);
const evBefore = g.events.length;
g.doPass(p);
const e = g.events[g.events.length - 1] || {};

// LEG A again, and this literal is the one that matters most in the file. NOT `cfg.passCoin` — that
// would compare the engine's arithmetic against the very number the engine added, which cannot fail.
check("LEG A: doPass raises the acting captain's purse by exactly one dubloon", p.coins - coinsBefore[1], SHIPPED_PAYOUT);
check("doPass appends exactly one entry to the event log", g.events.length - evBefore, 1);
check("the appended entry is a pass, tagged with the acting seat", `${e.t}:${e.p}`, "pass:1");
checkTrue("the pass entry carries something to look at", e.sea != null);

// *** THE ORDERING PREDICATE ***  ev() snapshots the purse at call time. If the event is recorded
// before the payment, this reads the pre-payment purse and fails. Asserted off the snapshot, not
// off the source order.
check("ORDERING: the pass entry's own snapshot shows the purse AFTER the payment", e.state[p.idx].coins, p.coins);
check("ORDERING: and that snapshot purse is one higher than before the call", e.state[p.idx].coins, coinsBefore[1] + 1);

for (const q of g.players) {
  if (q.idx === p.idx) continue;       // !== on an index, never a falsy test — seat 0 is a real seat
  check(`no other purse moves: seat ${q.idx} live purse untouched`, q.coins, coinsBefore[q.idx]);
  check(`no other purse moves: seat ${q.idx} snapshot purse untouched`, e.state[q.idx].coins, coinsBefore[q.idx]);
}

/* ---------------- LEG B: the payment DERIVES, proved away from the default ----------------
 * A site that kept a literal passes every run at 1. It fails the first time the number moves, and
 * D-07 may move it at the wave 5 balance gate — so the derivation is proved at a payout the game
 * would never produce by accident, and at zero, which is both the D-07 floor and the value a falsy
 * test swallows. The games are built the way every construction site in the tree builds them, so a
 * config this file could not really produce cannot "prove" anything (HARD-WON-LESSONS §3). */
console.log("  -- engine: the payment derives, at payouts that are NOT the default --");
function payoutRun(payout, seed) {
  const gp = new Game({ ...roundCfg(STRATS), bakeoff: true, passCoin: payout }, seed, true);
  gp.advanceWind();
  const q = gp.players[2];                          // a different seat from LEG A's, on purpose
  const before = q.coins;
  gp.doPass(q);
  const last = gp.events[gp.events.length - 1] || {};
  return { delta: q.coins - before, snap: last.state && last.state[q.idx].coins, after: q.coins, t: last.t };
}
const alt = payoutRun(ALT_PAYOUT, 3 * 7919);
check(`LEG B: at a payout of ${ALT_PAYOUT} the purse moves by exactly ${ALT_PAYOUT}`, alt.delta, ALT_PAYOUT);
check(`LEG B: and the recorded snapshot still shows the post-payment purse at ${ALT_PAYOUT}`, alt.snap, alt.after);
check(`CONTROL: the run at ${ALT_PAYOUT} recorded a pass entry`, alt.t, "pass");

const zero = payoutRun(ZERO_PAYOUT, 4 * 7919);
check("LEG B: at a payout of zero the purse moves by exactly zero — there is no hidden floor", zero.delta, ZERO_PAYOUT);
check("LEG B: and the zero-payout snapshot still shows the post-payment purse", zero.snap, zero.after);
check("CONTROL: the zero-payout run still recorded a pass entry — a free pass is still a pass", zero.t, "pass");
checkTrue("CONTROL: both non-default runs produced finite purses", Number.isFinite(alt.after) && Number.isFinite(zero.after));

/* The event's SHAPE. Derived from a {t:"turn"} entry recorded in the same run — turn is emitted with
 * only its type and seat, so its key set IS the envelope ev() adds to everything. A pass is that
 * envelope plus `sea`. Deriving it rather than typing it means this stays a real check if ev() ever
 * gains a field, instead of becoming a list nobody updates. */
console.log("  -- engine: the recorded shape --");
const gShape = newGame(2 * 7919);
const wShape = gShape.play();
checkTrue("CONTROL: a full voyage recorded events", gShape.events.length > 0);
checkTrue("CONTROL: the voyage finished with a real seat index or a real null", wShape == null || typeof wShape === "number");
/* A cfg that reached doPass without the payout field would add `undefined` to every passing
 * captain's purse, and NaN is exactly the class of failure that renders as a dash and gets reported
 * as a UI bug three days later. Cheap, and it covers every construction path a full voyage takes. */
checkTrue("CONTROL: every purse is finite after a full voyage — a missing payout field would make them all NaN",
  gShape.players.every((q) => Number.isFinite(q.coins)));
const turnEv = gShape.events.find((x) => x.t === "turn");
const passEv = gShape.events.find((x) => x.t === "pass");
checkTrue("CONTROL: the voyage recorded at least one turn entry", turnEv != null);
checkTrue("CONTROL: the voyage recorded at least one pass entry", passEv != null);
if (turnEv && passEv) {
  const envelope = [...new Set([...Object.keys(turnEv), "sea"])].sort();
  check("the pass entry's key set is the turn envelope plus `sea` — nothing added, removed or renamed",
    Object.keys(passEv).sort().join(","), envelope.join(","));
}

/* A whole bot turn that resolves to the engine fallback. Driven turn by turn rather than through
 * play(), because the quantity under test is the purse either side of ONE turn and play() only ever
 * hands back a winner. Bounded loops throughout (CLAUDE.md §3). */
console.log("  -- engine: a bot turn that ends at the fallback --");
let found = null;
for (let s = 1; s <= 60 && !found; s++) {
  const gt = newGame(s * 7919);
  for (let r = 0; r < 40 && !found; r++) {
    gt.round++;
    gt.advanceWind();
    for (const q of gt.players) {
      if (q.done || q.baking) continue;
      const before = q.coins;
      const evLen = gt.events.length;
      gt.takeTurn(q, gt.windNow, gt.stormNow);
      const added = gt.events.slice(evLen);
      const passes = added.filter((x) => x.t === "pass");
      if (passes.length === 1 && added[added.length - 1].t === "pass") {
        found = {
          seed: s * 7919, round: r + 1, seat: q.idx, before, after: q.coins,
          snap: passes[0].state[q.idx].coins, passCount: passes.length,
          added: added.map((x) => x.t).join("+"),
        };
        break;
      }
    }
  }
}
checkTrue("CONTROL: a turn resolving to the engine fallback was reached", found != null);
if (found) {
  console.log(`         found at seed ${found.seed}, round ${found.round}, seat ${found.seat}; that turn recorded ${found.added}`);
  check("a turn ending at the engine fallback leaves the purse exactly one higher", found.after - found.before, 1);
  check("that turn appended exactly one pass entry", found.passCount, 1);
  check("ORDERING: the recorded snapshot for that turn shows the post-payment purse", found.snap, found.after);
}
} // end of the engine half

/* ================= HALF TWO: source text ================= */
console.log("\n  -- src/ui/flow.js: all three sites, one method --");

const humanRegion = regionAfter(FLOW_SRC, 'if(v==="pass"){', 700, "human menu");
const botRegion = regionAfter(FLOW_SRC, "v2 rule 3: no fishing", 500, "bot fallback");

checkTrue("the human menu calls the shared method", humanRegion.includes("doPass("));
checkTrue("the animated bot fallback calls the shared method", botRegion.includes("doPass("));
checkTrue("the human menu emits no bare pass event any more", !humanRegion.includes('ev({t:"pass"'));
checkTrue("the animated bot fallback emits no bare pass event any more", !botRegion.includes('ev({t:"pass"'));
check("no bare pass emission survives anywhere in the UI tier", countOf(FLOW_SRC, 'ev({t:"pass"'), 0);
check("the UI tier calls the shared method at exactly the two sites it owns", countOf(FLOW_SRC, "doPass"), 2);

checkTrue("the human-only sea-cursor advance is still in the human menu", humanRegion.includes("advanceSeaCursor("));
checkTrue("the bot fallback does not touch the human-only sea cursor", !botRegion.includes("advanceSeaCursor"));
check("the human-only sea-cursor advance did not migrate into the engine", countOf(ENGINE_SRC, "advanceSeaCursor"), 0);

/* ---------------- LEG C (button half): the label derives, and states no literal ----------------
 * THIS IS A SOURCE READ AND NOT A RENDERING, said plainly rather than dressed up. The label is built
 * inside humanAct, which needs a DOM, so it can never be rendered in this process — which is the
 * same reason the whole of half two reads flow.js as raw text. The half of LEG C that DOES compare a
 * rendered string against an observed purse delta lives in scripts/pass_narration_test.js.
 *
 * The negative assertion is the one with teeth: a re-hardcoded gain parenthetical looks like a `+`
 * immediately followed by a digit, and the region is trimmed to the option itself so the rule's own
 * written explanation above it cannot trip the check on the explanation instead of on a breach. */
console.log("\n  -- src/ui/flow.js: the Pass button states the amount, and derives it --");
const LITERAL_GAIN = /\(\+\d/;
const passBtn = upTo(regionAfter(FLOW_SRC, "if(!canOvens)opts.push({label:", 400, "pass button"), "});");
console.log(`         scanned ${passBtn.length} chars: ${passBtn}`);
checkTrue("LEG C: the Pass button reads the payout from the same round config the narration reads",
  passBtn.includes(CFG_READ));
checkTrue("LEG C: the Pass button states no literal gain amount — the number is derived, never typed",
  !LITERAL_GAIN.test(passBtn));
checkTrue("the amount is wrapped whole with the label, so it cannot break across a line",
  passBtn.includes('<span class="nobrk">'));
checkTrue("the coin is left raw for the emoji chokepoint — no hand-rolled image markup",
  !passBtn.includes("iconImg(") && !passBtn.includes("COIN_IMG") && !passBtn.includes("<img"));
const flowReads = countOf(FLOW_SRC, CFG_READ);
console.log(`         the accessor chain appears ${flowReads}x in flow.js (the label reads it twice: the guard, then the amount)`);
checkTrue("the UI tier reads the payout rather than writing a number", flowReads >= 1);

/* CONTROL for the anchor convention itself. The Pass button was built to the shape of the Attack
 * option; if that precedent is gone, or the anchors here have rotted, this fails loudly instead of
 * every assertion above quietly "passing" against an empty region. */
const attackOpt = upTo(regionAfter(FLOW_SRC, "opts.push({label:`⚔️ Attack", 400, "attack precedent"), "});");
checkTrue("CONTROL: the Attack precedent the Pass button copies is still present and still anchors",
  attackOpt.includes('<span class="nobrk">') && attackOpt.includes("appState.game.cfg.powder"));
checkTrue("CONTROL: Attack states no literal amount either — same rule, both buttons",
  !/\(−\d/.test(attackOpt) && !LITERAL_GAIN.test(attackOpt));

console.log("\n  -- src/engine/index.js --");
checkTrue("the engine defines and calls the shared method", countOf(ENGINE_SRC, "doPass") >= 2);
check("the engine emits the pass event in exactly one place", countOf(ENGINE_SRC, 'ev({t:"pass"'), 1);

/* LEG C's negative, in the shape a re-hardcoded PAYMENT takes rather than a re-hardcoded label:
 * a literal-digit increment of the purse. Anchored on the method and trimmed to its own body. */
const doPassBody = upTo(regionAfter(ENGINE_SRC, "\n  doPass(p){", 400, "the shared method's body", ENGINE_PATH), "\n  }");
console.log(`         scanned ${doPassBody.split("\n").length} lines: ${JSON.stringify(doPassBody)}`);
checkTrue("LEG C: the payment reads the payout off this game's own round config",
  doPassBody.includes("this.cfg.passCoin"));
checkTrue("LEG C: the payment adds no literal amount to the purse — the number is derived, never typed",
  !/coins\s*\+=\s*\d/.test(doPassBody) && !/coins\+\+/.test(doPassBody));
check("the payout is written in exactly one place in the engine — the round config",
  countOf(ENGINE_SRC, "passCoin:"), 1);

/* Determinism. src/engine/ is clean of all three sources today and Phase 3 records a corpus
 * against it; RULE-01's dubloon is an integer increment and must not change that. */
console.log("\n  -- src/engine/ is still determinism-clean --");
const engineFiles = fs.readdirSync(ENGINE_DIR).filter((f) => f.endsWith(".js")).sort();
checkTrue("CONTROL: the engine directory has files to scan", engineFiles.length > 0);
console.log(`         scanning ${engineFiles.length} file(s): ${engineFiles.join(", ")}`);
for (const src of ["Math.random", "Date.now", "performance.now"]) {
  let n = 0;
  for (const f of engineFiles) n += countOf(fs.readFileSync(path.join(ENGINE_DIR, f), "utf8"), src);
  check(`no ${src} anywhere under src/engine/`, n, 0);
}

console.log(`\n  ${anchorsFound} source anchor(s) located, ${failures} failure(s)\n`);
process.exit(failures ? 1 : 0);
