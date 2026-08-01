#!/usr/bin/env node
// scripts/narration_flow_test.js
//
// Phase 15 plan 03 (NARR-02/NARR-03/NARR-05, D-11/D-13): DOM-free harness proving the turn-flow
// narration invariants that live inside src/ui/flow.js. Grows across this plan's 3 tasks:
//   Task 1 — SUPERSEDED 2026-07-30 by G15. It used to read: "windLeg's anchorHold branch awaits
//     narrateLastEvent() before liveRender()". That sentence is now the OPPOSITE of the rule.
//     D-13's actual requirement is that the anchorHold line PLAY AT ALL — it used to be silent —
//     and that requirement is preserved and asserted separately. The ORDER was incidental, and
//     pinning it froze a bug: Wyatt watched a storm move his boat only after the message had
//     already gone. G15 makes PAINT-BEFORE-NARRATE an invariant over windLeg's whole body, plus a
//     mirror for botWindLeg, so the file can no longer hold both orders with nothing deciding
//     which is right.
//   Task 2 (D-11): brokeSailLine/brokeAnchorLine — pure, viewer-aware "broke" narration builders,
//     for a human AND a bot who can't afford to sail, and a captain who can't afford to anchor.
//   Task 3 (NARR-03/D-07/D-08/D-10): stormIntroClause + every ad-hoc flash() site in this file
//     converted to the neutral-plus-variants broadcast form.
//
// windLeg/humanTurn/botTurn/humanAct etc all need the DOM to actually run, so their invariants are
// proven here as STRUCTURAL, source-text assertions instead — read src/ui/flow.js as text, locate
// the relevant function's body, and assert the rule (an ordering, a call site's presence, an
// absence) the same way scripts/ui_contract_check.js/scripts/no_undef_check.js do for their own
// source-text invariants. The pure exported builders (brokeSailLine, brokeAnchorLine,
// stormIntroClause) are imported and called directly — no DOM needed for those.
//
// Convention (matches hail_ranking_test.js/bot_storm_narration_test.js/narration_test.js): no
// assertion library, a local check(name, actual, expected) counter, plain console.log,
// process.exit(failures?1:0). Source-text file:line failures follow scripts/ui_contract_check.js's
// / scripts/no_undef_check.js's house convention for that style of assertion.
//
// Never touches the DOM, never imports/calls a turn function (windLeg/humanTurn/botTurn/humanAct
// etc never run here) — only src/ui/flow.js's own pure exported builders and source text.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brokeSailLine, brokeAnchorLine, stormIntroClause, counterHeadroom, coinShortfall, rimSweepPath, rimSweepCurve } from "../src/ui/flow.js";
import { Game as EngineGame, roundCfg as engineRoundCfg } from "../src/engine/index.js";
import { appState } from "../src/state/index.js";
import { DIRS } from "../src/shared/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FLOW_PATH = path.join(ROOT, "src", "ui", "flow.js");
const FLOW_SRC = fs.readFileSync(FLOW_PATH, "utf8");
const FLOW_REL = path.relative(ROOT, FLOW_PATH);

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

console.log("Turn-flow narration harness (NARR-02/03/05, D-11/D-13) — src/ui/flow.js\n");

/* ---------- helpers: string-index slicing (immune to awk's start==end same-line range trap) ---------- */
function extractFn(src, startMarker, endMarker) {
  const startIdx = src.indexOf(startMarker);
  if (startIdx < 0) return { body: null, startIdx: -1 };
  const searchFrom = startIdx + startMarker.length;
  const endIdx = endMarker ? src.indexOf(endMarker, searchFrom) : -1;
  const body = endIdx < 0 ? src.slice(startIdx) : src.slice(startIdx, endIdx);
  return { body, startIdx };
}
function lineOf(src, idx) {
  return idx < 0 ? "?" : src.slice(0, idx).split("\n").length;
}
// G15: strip FULL-LINE leading comments before any ORDERING assertion. A comment that merely
// DESCRIBES the rule ("ev() -> await narrateLastEvent()") is not a call site, and counting it makes
// the gate fire on its own documentation; conversely, without stripping, a branch could satisfy an
// ordering rule with a comment instead of code. Full-line only — a trailing `//` strip would eat
// the `https://` inside string literals (the false negative net_contract_check.js's header warns
// about), and windLeg's blocked branch carries a trailing comment on a line of real code.
// This mirrors the same technique the F5/F9 blocks below already use via `liveCode`.
const stripLeadingComments = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/* ---------- Task 1, REWRITTEN by G15 (2026-07-30): PAINT BEFORE NARRATE, as an INVARIANT ---------- */
// WHAT THIS USED TO ASSERT, and why it was wrong. Two literal pins here required
// `ev({t:"moored"…}); await narrateLastEvent(); liveRender();` and the same for `anchorHold` — i.e.
// they pinned the board being repainted AFTER the line describing it had already played. D-13's
// actual requirement was only that the anchorHold line PLAY AT ALL (it used to be silent); the
// ordering was incidental, and pinning it froze a bug in place.
//
// Wyatt, 2026-07-30: *"the storm animation didn't move your boat until AFTER the message
// disappeared… is there a way to make the movement happen before the message, for all movements
// during all storms?"* G15 reverses the order everywhere inside windLeg.
//
// D-13 IS PRESERVED: the anchorHold branch still emits and still narrates — the named per-branch
// checks below assert exactly that. Only the paint/narrate ORDER changed.
//
// THE REAL DEFECT was that src/ui/flow.js held BOTH orders with nothing enforcing which was right
// (botWindLeg does it correctly and even carries a comment describing this bug). So this is now an
// INVARIANT OVER windLeg's WHOLE BODY rather than three literals: a fourth branch added later is
// covered for free, and cannot inherit the wrong order.
{
  const { body: windLegRaw } = extractFn(FLOW_SRC, "export async function windLeg", "export async function botWindLeg");
  const windLegBody = windLegRaw && stripLeadingComments(windLegRaw);
  checkTrue("windLeg function body located", !!windLegBody);
  if (windLegBody) {
    // THE INVARIANT: split on each narrate call; walk back to the most recent ev( before it; that
    // span must contain a paint. liveRender() OR renderLiveShips() — an ordinary storm square emits
    // no event, so windLeg legitimately uses the lighter renderLiveShips() in that case (see its
    // own D-22 comment).
    const parts = windLegBody.split("await narrateLastEvent()");
    const offenders = [];
    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i - 1];
      const k = seg.lastIndexOf("ev(");
      const since = k < 0 ? seg : seg.slice(k);
      if (!/liveRender\(\)|renderLiveShips\(\)/.test(since)) {
        // name the BRANCH, not just "windLeg is wrong" — a bare count is not actionable
        const tag = (since.match(/ev\(\{t:"(\w+)"/) || [])[1] || "«no t: found»";
        offenders.push(tag);
      }
    }
    check(`G15 INVARIANT: every await narrateLastEvent() inside windLeg is preceded by a paint since the last ev() — offending branch(es): ${offenders.length ? offenders.join(", ") : "none"} (${parts.length - 1} call site(s) checked)`, offenders.length, 0);

    // Named per-branch checks alongside the invariant, so a failure says WHICH branch broke and the
    // three Wyatt's report actually travels through are pinned by name as well as by rule.
    for (const t of ["blocked", "moored", "anchorHold"]) {
      const re = new RegExp(`ev\\(\\{t:"${t}"[^}]*\\}\\);liveRender\\(\\);await narrateLastEvent\\(\\);`);
      const idx = FLOW_SRC.indexOf(`ev({t:"${t}"`);
      check(`G15: windLeg's ${t} branch (${FLOW_REL}:${lineOf(FLOW_SRC, idx)}) paints BEFORE it narrates — ev() -> liveRender() -> await narrateLastEvent()`, re.test(windLegBody), true);
    }
    // D-13's own requirement, kept explicit and separable from the ordering it used to be fused to:
    // the anchorHold beat must still be narrated at all.
    checkTrue("D-13 PRESERVED: windLeg's anchorHold branch still emits AND still narrates (the requirement; its ordering was incidental and is now G15's)",
      /ev\(\{t:"anchorHold"[^}]*\}\);[^;]*;await narrateLastEvent\(\);/.test(windLegBody));
  }
}

/* ---------- G15 mirror: botWindLeg must not fork back apart from windLeg ---------- */
// botWindLeg already painted before it narrated, and its comment describes this exact bug — but
// nothing asserted it, so the two paths were one edit away from diverging again.
//
// WRITTEN AGAINST WHAT botWindLeg ACTUALLY DOES, not against windLeg's shape. It narrates with
// `await flash(describeFor(ev,…))` per event, NOT with narrateLastEvent(), so re-using windLeg's
// invariant verbatim here checks ZERO call sites and passes vacuously — which is exactly the class
// of empty assertion this project has caught three times in two days. The real invariant is the
// one below.
//
// The tail leg-summary (`g.ev({t:blownOut|windmove}); … await flash(…); liveRender();`) is
// DELIBERATELY not covered: by the time it runs, the loop above has already painted the ship at
// its final square via renderLiveShips(), and the summary event records no further movement — so
// there is nothing stale on screen when that line plays. Stated here rather than silently excluded.
{
  const { body: botRaw } = extractFn(FLOW_SRC, "export async function botWindLeg", "\nexport async function humanDock");
  const botBody = botRaw && stripLeadingComments(botRaw);
  checkTrue("botWindLeg function body located", !!botBody);
  if (botBody) {
    // the per-square block: windPush() may move the ship AND record an event in one call, so the
    // board must be repainted before any line describing that square plays
    const blockIdx = botBody.indexOf("if(g.events.length>evBefore){");
    checkTrue("botWindLeg's per-square event block located", blockIdx >= 0);
    if (blockIdx >= 0) {
      const block = botBody.slice(blockIdx);
      const paintIdx = block.indexOf("renderLiveShips()");
      const flashIdx = block.indexOf("await flash(");
      checkTrue(`G15 MIRROR: botWindLeg repaints (renderLiveShips) BEFORE it flashes the line describing that square, so the human and bot storm paths cannot fork apart (paint@${paintIdx}, narrate@${flashIdx})`,
        paintIdx >= 0 && flashIdx >= 0 && paintIdx < flashIdx);
    }
  }
}

/* ---------- Task 2 (D-11): brokeSailLine / brokeAnchorLine — pure, viewer-aware builders ---------- */
{
  checkTrue("brokeSailLine is exported and callable with no DOM", typeof brokeSailLine === "function");
  checkTrue("brokeAnchorLine is exported and callable with no DOM", typeof brokeAnchorLine === "function");

  // appState.mySeat starts unset (null/undefined) — an out-of-game caller like this script, same
  // baseline scripts/narration_test.js/scripts/bot_storm_narration_test.js run against.
  appState.mySeat = null;

  const sailNeutral = brokeSailLine(0, -1); // NEUTRAL_VIEWER === -1 (src/ui/util.js)
  const sailAddressed = brokeSailLine(0, 0);
  checkTrue("brokeSailLine: neutral rendering is non-empty and contains no JS undefined token", !!sailNeutral && !/undefined/.test(sailNeutral));
  checkTrue("brokeSailLine: addressed rendering is non-empty and contains no JS undefined token", !!sailAddressed && !/undefined/.test(sailAddressed));
  checkTrue("brokeSailLine: addressed rendering differs from the neutral rendering", sailAddressed !== sailNeutral);

  const anchorNeutral = brokeAnchorLine(1, -1);
  const anchorAddressed = brokeAnchorLine(1, 1);
  checkTrue("brokeAnchorLine: neutral rendering is non-empty and contains no JS undefined token", !!anchorNeutral && !/undefined/.test(anchorNeutral));
  checkTrue("brokeAnchorLine: addressed rendering is non-empty and contains no JS undefined token", !!anchorAddressed && !/undefined/.test(anchorAddressed));
  checkTrue("brokeAnchorLine: addressed rendering differs from the neutral rendering", anchorAddressed !== anchorNeutral);

  // appState.mySeat left null, viewerSeat OMITTED entirely -> isLocalTo's seatLocal() fallback ->
  // always false (no real seat ever equals null) -> both builders return their third-person form,
  // and that form names the seat via pn() (a <b style=...> wrapped name, not a raw "you").
  const sailFallback = brokeSailLine(2);
  const anchorFallback = brokeAnchorLine(2);
  check("brokeSailLine: appState.mySeat null + viewerSeat omitted returns the SAME text as the explicit neutral form", sailFallback, brokeSailLine(2, -1));
  check("brokeAnchorLine: appState.mySeat null + viewerSeat omitted returns the SAME text as the explicit neutral form", anchorFallback, brokeAnchorLine(2, -1));
  checkTrue("brokeSailLine: the fallback (third-person) form contains a <b> name tag from pn()", /<b /.test(sailFallback));
  checkTrue("brokeAnchorLine: the fallback (third-person) form contains a <b> name tag from pn()", /<b /.test(anchorFallback));

  // NARR-02: never mocks/shames the broke player — a lightweight lexical guard against the
  // obvious failure shapes (sarcasm/insult words), not a substitute for Wyatt's own D-04 read.
  const MOCKING_WORDS = /\b(loser|pathetic|idiot|stupid|dumb|broke-ass|poor sod|shame on)\b/i;
  checkTrue("brokeSailLine: neither rendering reads as mocking the broke player (NARR-02)", !MOCKING_WORDS.test(sailNeutral) && !MOCKING_WORDS.test(sailAddressed));
  checkTrue("brokeAnchorLine: neither rendering reads as mocking the broke player (NARR-02)", !MOCKING_WORDS.test(anchorNeutral) && !MOCKING_WORDS.test(anchorAddressed));
}

/* ---------- Task 2 structural: the three call sites exist inside the right functions ---------- */
{
  const { body: humanTurnBody } = extractFn(FLOW_SRC, "export async function humanTurn", "/* ================= bot hail (AI-01)");
  checkTrue("humanTurn function body located", !!humanTurnBody);
  if (humanTurnBody) {
    checkTrue("humanTurn: the human sail gate narrates its own broke moment via brokeSailLine (D-11 case 1, human)", humanTurnBody.includes("brokeSailLine"));
    checkTrue("humanTurn: the turn banner no longer pre-announces the second storm leg (windNow2)", !humanTurnBody.includes("windNow2"));
  }

  const { body: humanWindBody } = extractFn(FLOW_SRC, "export async function humanWind", "export async function humanDock");
  checkTrue("humanWind function body located", !!humanWindBody);
  if (humanWindBody) {
    checkTrue("humanWind: still announces the second leg's own direction at the moment it happens (windNow2)", humanWindBody.includes("windNow2"));
  }

  const { body: botTurnBody } = extractFn(FLOW_SRC, "export async function botTurn", "/* ================= battle-UI");
  checkTrue("botTurn function body located", !!botTurnBody);
  if (botTurnBody) {
    checkTrue("botTurn: the bot sail gate narrates its own broke moment via brokeSailLine (D-11 case 1, bot)", botTurnBody.includes("brokeSailLine"));
  }

  const { body: windLegBody2 } = extractFn(FLOW_SRC, "export async function windLeg", "export async function botWindLeg");
  checkTrue("windLeg function body located (case 2 check)", !!windLegBody2);
  if (windLegBody2) {
    checkTrue("windLeg: the storm-anchor block narrates the broke-can't-anchor moment via brokeAnchorLine (D-11 case 2)", windLegBody2.includes("brokeAnchorLine"));
    const payOpts = (windLegBody2.match(/value:"pay"/g) || []).length;
    const flipOpts = (windLegBody2.match(/value:"flip"/g) || []).length;
    check("windLeg: exactly one Pay-to-anchor option is ever pushed (unaffected by the broke narration)", payOpts, 1);
    check("windLeg: the flip is offered in every case (unaffected by the broke narration)", flipOpts, 1);
  }
}

/* ---------- Task 3 (NARR-03): stormIntroClause — one leg, second person, four distinct directions ---------- */
{
  checkTrue("stormIntroClause is exported and callable with no DOM", typeof stormIntroClause === "function");
  const byDir = {};
  for (const dk of Object.keys(DIRS)) {
    const clause = stormIntroClause(dk);
    byDir[dk] = clause;
    checkTrue(`stormIntroClause(${dk}): non-empty and contains no JS undefined token`, !!clause && !/undefined/.test(clause));
  }
  const dirKeys = Object.keys(DIRS);
  checkTrue("stormIntroClause: two different directions produce different output", byDir[dirKeys[0]] !== byDir[dirKeys[1]]);
}

/* ---------- Task 3 (D-07/D-08/D-09/D-10): every ad-hoc flash() site is neutral-plus-variants ---------- */
{
  const flashSeatLocalLines = FLOW_SRC.split("\n").filter((l) => /flash\([^;]*seatLocal\(/.test(l));
  check("no flash( call in src/ui/flow.js still selects its message with an inline seatLocal( ternary", flashSeatLocalLines.length, 0);

  const variantsFormLines = FLOW_SRC.split("\n").filter((l) => /flash\([^;]*\[\{\s*seat/.test(l));
  checkTrue(`the neutral-plus-variants form is in use at >= 8 sites (found ${variantsFormLines.length})`, variantsFormLines.length >= 8);

  const { body: botWindLegBody } = extractFn(FLOW_SRC, "export async function botWindLeg", "// only ever called during a storm now");
  checkTrue("botWindLeg function body located", !!botWindLegBody);
  if (botWindLegBody) {
    const nvCount = (botWindLegBody.match(/narrationVariants\(/g) || []).length;
    check("botWindLeg: both describe()-then-flash() sites now render neutral text with narrationVariants(...)", nvCount, 2);
  }

  // T-15-02: names still flow through pn()/poss() only — no raw ${x.name} interpolation anywhere
  // in this file (the same encoding guarantee narration_test.js already pins on util.js's side).
  const rawNameLines = FLOW_SRC.split("\n").filter((l) => /\$\{[A-Za-z_.[\]() ]*\.name\}/.test(l));
  check("T-15-02: no raw ${...name} interpolation in src/ui/flow.js — names flow through pn()/poss() only", rawNameLines.length, 0);
}

/* ---------- F12: counterHeadroom — a bot's counter can never demand coins already pledged ---------- */
{
  checkTrue("counterHeadroom is exported and callable with no DOM", typeof counterHeadroom === "function");

  // the live playtest case: Wyatt held 1 coin and had already pledged it, so the headroom is 0 and
  // the existing `askFor>0` guard suppresses the counter entirely (the D-41 pattern, correctly).
  check("F12: the live playtest case (shortfall 1, purse 1, 1 already pledged) offers NO counter", counterHeadroom(1, 1, 1), 0);
  check("F12: purse 3, 1 pledged, shortfall 5 -> names the smaller amount they CAN afford", counterHeadroom(5, 3, 1), 2);
  check("F12: purse 1, nothing pledged, shortfall 1 -> 1 (the case that always worked)", counterHeadroom(1, 1, 0), 1);
  check("F12: an over-pledged purse floors at 0, never a negative demand", counterHeadroom(4, 2, 3), 0);

  // the invariant the bug violated: whatever the bot demands, the captain can still pay what they
  // pledged PLUS the demand out of the purse they actually hold. Cannot be satisfied by inspection.
  let violation = null;
  let points = 0;
  for (let shortfall = 0; shortfall <= 8 && !violation; shortfall++) {
    for (let purse = 0; purse <= 8 && !violation; purse++) {
      for (let pledged = 0; pledged <= purse; pledged++) {
        const headroom = counterHeadroom(shortfall, purse, pledged);
        points++;
        if (headroom < 0 || pledged + headroom > purse) {
          violation = `shortfall=${shortfall} purse=${purse} pledged=${pledged} -> ${headroom}`;
          break;
        }
      }
    }
  }
  check(`F12 INVARIANT over ${points} points: pledged + headroom <= purse, and headroom >= 0${violation ? ` — FIRST VIOLATION ${violation}` : ""}`, violation, null);

  // the arithmetic is the whole defect, so the call site must keep using the helper — a future
  // inline rewrite of the expression is what this assertion exists to fail on.
  const counterIdx = FLOW_SRC.indexOf("scoffs — but counters");
  checkTrue("humanTrade's counter block located by its prompt (never by line number)", counterIdx > 0);
  if (counterIdx > 0) {
    const region = FLOW_SRC.slice(Math.max(0, counterIdx - 900), counterIdx + 200);
    const regionCode = region.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    checkTrue(`F12: humanTrade's counter block (${FLOW_REL}:${lineOf(FLOW_SRC, counterIdx)}) computes askFor through counterHeadroom(), not inline`, /counterHeadroom\s*\(/.test(regionCode));
    const liveCode = FLOW_SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    check("F12: the old total-purse cap appears nowhere in live (non-comment) code", /Math\.min\(shortfall\s*,\s*p\.coins\s*\)/.test(liveCode), false);
  }
}

/* ---------- G6: one shared coin re-validation, called at every debit site that can interleave ----------
 * COIN-AUDIT.md's root cause, in one sentence: affordability is checked when the option list is
 * BUILT, the purse is debited AFTER the click, and the 20-second shot-clock penalty
 * (src/ui/util.js applyShotClockPenalty, takes Math.min(1,p.coins) from the DECIDING seat) fires
 * inside exactly that window. appState.turnExpired does not protect against it — that flag is set
 * at 30 seconds; the coin penalty fires at 20 and sets no flag at all.
 *
 * Wyatt, approving the audit's recommendation: "yes, build this check and apply it to all
 * situations."
 *
 * Same DOM-free shape as the F12 counterHeadroom block above: pure arithmetic, no DOM, no appState. */
{
  checkTrue("G6: coinShortfall is exported and callable with no DOM", typeof coinShortfall === "function");

  // 0 means "clear" — the purse covers the debit and the caller may proceed.
  check("G6: a purse that covers the debit clears it", coinShortfall(3, 5), 0);
  check("G6: debit 0 against purse 0 clears — a free choice is always affordable", coinShortfall(0, 0), 0);
  check("G6: debit EQUAL to the purse clears exactly — spending the last coin is legal", coinShortfall(5, 5), 0);
  check("G6: debit one more than the purse reports a shortfall of exactly 1", coinShortfall(6, 5), 1);
  check("G6: a wider gap reports the true shortfall, not a flag", coinShortfall(9, 4), 5);

  // the guard that stops the helper from becoming a way to CREDIT a purse
  checkTrue("G6: a NEGATIVE intended debit is unaffordable, never a silent credit", coinShortfall(-3, 5) > 0);
  checkTrue("G6: a NaN intended debit is unaffordable rather than clearing", coinShortfall(NaN, 5) > 0);
  checkTrue("G6: an Infinite intended debit is unaffordable rather than clearing", coinShortfall(Infinity, 5) > 0);
  checkTrue("G6: an undefined intended debit is unaffordable rather than clearing", coinShortfall(undefined, 5) > 0);

  // exhaustive: the helper never reports a negative shortfall, and clearing always means the debit
  // genuinely fits. Cannot be satisfied by inspection.
  let violation = null, points = 0;
  for (let debit = 0; debit <= 12 && !violation; debit++) {
    for (let purse = 0; purse <= 12; purse++) {
      const short = coinShortfall(debit, purse);
      points++;
      if (short < 0) { violation = `debit=${debit} purse=${purse} -> negative shortfall ${short}`; break; }
      if (short === 0 && purse - debit < 0) { violation = `debit=${debit} purse=${purse} cleared but would go negative`; break; }
      if (short > 0 && purse - debit >= 0) { violation = `debit=${debit} purse=${purse} reported a shortfall it does not have`; break; }
    }
  }
  check(`G6 INVARIANT over ${points} points: clearing implies purse-debit >= 0, and no shortfall is ever negative${violation ? ` — FIRST VIOLATION ${violation}` : ""}`, violation, null);

  // the helper is PURE — it must not mutate a purse-bearing object handed to it by mistake
  {
    const p = { coins: 5 };
    coinShortfall(3, p.coins);
    check("G6: the helper mutates nothing — the purse it was asked about is unchanged", p.coins, 5);
  }

  /* ---- the INTERLEAVE itself, arithmetically. This is the assertion that would have caught F12
   * and catches the whole class; the pure helper checks above would not. Scripted exactly as the
   * audit's shortest repro: an option priced against the purse the player HELD when the list was
   * built, then the 1-coin slow-play penalty, then the settlement. ---- */
  {
    let worst = null, cases = 0;
    for (let purse = 0; purse <= 8; purse++) {
      // the option list is built now: every price the player can currently afford is offered
      for (let priced = 0; priced <= purse; priced++) {
        // ...the player sits past 20s, and applyShotClockPenalty takes min(1, coins) from THIS seat
        const afterPenalty = purse - Math.min(1, purse);
        // ...and only now does the click resolve and the settlement run
        const settled = coinShortfall(priced, afterPenalty) === 0 ? afterPenalty - priced : afterPenalty;
        cases++;
        if (settled < 0) worst = worst || `purse=${purse} priced=${priced} penalty=1 -> ${settled}`;
      }
    }
    check(`G6: over ${cases} scripted (build -> 20s penalty -> settle) interleaves, no captain's purse can end below zero${worst ? ` — FIRST NEGATIVE ${worst}` : ""}`, worst, null);
    // and the unguarded arithmetic the audit found really does go negative, so the test above is
    // proving something rather than restating an impossibility
    checkTrue("G6: the UNGUARDED settlement genuinely goes negative on the audit's shortest repro (purse 3, priced 3, penalty 1) — the guard is load-bearing", (3 - Math.min(1, 3)) - 3 < 0);
  }
}

/* ---------- G6: the guards are actually AT the call sites, not merely available ----------
 * The helper passing its own unit tests proves nothing about whether anything calls it. Located by
 * CONTENT, never by line number, in this file's established convention. */
{
  const liveCode = FLOW_SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const ORCH_PATH = path.join(ROOT, "src", "orchestrator.js");
  const ORCH_REL = path.relative(ROOT, ORCH_PATH);
  const ORCH_SRC = fs.readFileSync(ORCH_PATH, "utf8");
  const orchCode = ORCH_SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

  // the five src/ui/flow.js sites, each identified by the debit it protects
  const flowSites = [
    ["site 5 — storm anchor pay", /v==="pay"&&!coinShortfall\(1,p\.coins\)/],
    ["site 2 — trade counter settlement (the FULL total, not just the increment)", /deal&&!coinShortfall\(give\.coins\+askFor,p\.coins\)/],
    ["site 3 — accepted-offer settlement routes to the existing decline path", /!accept\|\|coinShortfall\(give\.coins,p\.coins\)/],
    ["site 11 — side-bet stake, losing branch only", /won\|\|!coinShortfall\(bet\.amt,p\.coins\)/],
  ];
  for (const [name, re] of flowSites) {
    checkTrue(`G6: ${FLOW_REL} ${name} re-validates before debiting`, re.test(liveCode));
  }
  // sites 7 and 8 are the same guard shape at two sail sites — both must carry it
  const sailGuards = (liveCode.match(/dest&&!coinShortfall\(1,p\.coins\)/g) || []).length;
  check("G6: BOTH sail sites (7 — action menu, 8 — turn start) re-validate before p.coins--", sailGuards, 2);

  // the two src/orchestrator.js sites
  checkTrue(`G6: ${ORCH_REL} site 14 — defender flee re-validates, falling through to keep fighting`, /flee&&!coinShortfall\(1,def\.coins\)/.test(orchCode));
  checkTrue(`G6: ${ORCH_REL} site 13 — asyncBattle carries the engine's own powder guard`, /c\.powder&&coinShortfall\(c\.powder,att\.coins\)\)return null/.test(orchCode));
  // ...and it must sit BEFORE the opening broadcast, which is the whole answer to the audit's
  // "a battle snapshot may already be in flight" concern
  {
    const guardIdx = orchCode.indexOf("c.powder&&coinShortfall(c.powder,att.coins)");
    const openIdx = orchCode.indexOf("adhoc.battle.opening") >= 0
      ? orchCode.indexOf("attacks ${pn(def.idx)}! First to")
      : orchCode.indexOf("First to ${need} hits wins");
    checkTrue("G6: site 13's guard sits BEFORE asyncBattle's opening broadcast — no battle snapshot can be in flight when it returns null", guardIdx > 0 && openIdx > guardIdx);
  }

  // site 4 is already closed by yesterday's D-40 guard and must NOT be double-guarded
  checkTrue("G6: site 4 (dock buy) keeps its existing D-40 guard, re-reading p.coins rather than the pre-await flag", /buy&&p\.coins>=3/.test(liveCode));
  check("G6: site 4 is NOT double-guarded — one guard, not two doing the same job", /buy&&p\.coins>=3&&!coinShortfall/.test(liveCode), false);

  // COIN-AUDIT site 12 (the shot-clock coin forfeit) used to be pinned here on its `Math.min(5,
  // p.coins)` clamp — the audit marked it SAFE, arithmetically closed, needing no guard.
  //
  // RETIRED 2026-07-30: Wyatt removed BOTH 30-second penalties, so there is no forfeit left to
  // clamp. The assertion is not weakened to keep it green — it is replaced by the stronger claim
  // that the site is GONE, which is what actually shipped. (Never widen a pattern to make a gate
  // pass; re-pin it with the reason, which is what this is.)
  checkTrue("G6: site 12 (shot-clock forfeit) no longer exists — the 30s coin penalty was removed", !/Math\.min\(5,p\.coins\)/.test(orchCode));
  checkTrue("...and no crate confiscation replaced it", !/p\.ing\.splice\(idx,1\)/.test(orchCode));
  // presence-before-absence: the function those two absences are claims ABOUT must still be here
  checkTrue("...anchor: expireShotClock still exists and still narrates a skip", /shotclockskip/.test(orchCode));
}

/* ---------- F5: an ingredient icon sits directly before the noun it names ---------- */
// Both sites live inside DOM-needing functions (humanAct, humanDock), so they are pinned as
// source-text assertions — this file's established convention. Located by CONTENT, never by line.
{
  const liveCode = FLOW_SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

  // Site 1 — the dock action button. Wyatt's own example: "Dock at 🥛 Full Cream Folly".
  const dockBtn = (liveCode.match(/`[^`]*Dock at[^`]*`/g) || []).find((t) => t.includes("⚓"));
  checkTrue("F5: the dock action button label located by content", !!dockBtn);
  if (dockBtn) {
    checkTrue(`F5: the dock button puts the icon AFTER "Dock at" — ${dockBtn}`, dockBtn.indexOf("Dock at") < dockBtn.indexOf("iconImg"));
    checkTrue("F5: the dock button's icon sits immediately before the place name, with nothing between them", /Dock at \$\{iconImg\(ING_IMG\[port\]\)\} \$\{dockPlace\(port\)\}/.test(dockBtn));
    checkTrue("F5/D-16: the dock button still carries its ingredient icon", dockBtn.includes("iconImg(ING_IMG[port])"));
    checkTrue("F5: the anchor still leads the dock button — it labels the ACTION, not the island", dockBtn.trim().startsWith("`⚓"));
  }

  // Site 2 — the dock-on-tails buy prompt, now rendered through the declared {prefix,name} split.
  // RE-PIN 2026-07-30 (G12): the content anchor moved from "Tails! Take" to "TAILS! Take treasure
  // instead?" because Wyatt rewrote the prompt in his own words — ALL CAPS on the flip outcome, and
  // the amounts DELETED because the buttons already carry them (D-31). The anchor is exactly as
  // specific as the one it replaces; nothing here was widened to accommodate the new copy. What F5
  // asserts about this site — that the flavour phrase comes from dockFlavorIcon() and the BUTTON
  // keeps ilabelImg() — is unchanged and still holds.
  const tailsIdx = liveCode.indexOf("TAILS! Take treasure instead?");
  checkTrue("F5: the dock-on-tails buy prompt located by content", tailsIdx > 0);
  if (tailsIdx > 0) {
    const tailsRegion = liveCode.slice(tailsIdx - 120, tailsIdx + 260);
    checkTrue(`F5: the tails buy prompt renders its flavour through dockFlavorIcon() (${FLOW_REL}:${lineOf(FLOW_SRC, FLOW_SRC.indexOf("TAILS! Take treasure instead?"))})`, /dockFlavorIcon\s*\(/.test(tailsRegion));
    checkTrue("F5: the buy BUTTON label keeps its own icon-then-name rendering (ilabelImg) — it was already correct", /ilabelImg\(ing\)/.test(tailsRegion));
  }
  check("F5: no icon-before-flavour interpolation survives anywhere in this file", /iconImg\(ING_IMG\[\w+\]\)\}\s*\$\{dockFlavor\(/.test(liveCode), false);
  check("F5: dockFlavor is no longer imported here — dockFlavorIcon replaced its only use", /\bdockFlavor\b(?!Icon)/.test(liveCode), false);

  // The dock FLIP prompt was measured ALREADY CORRECT in the playtest (icon directly before the
  // place name) and must not have moved. Located by its own text — "Docking at", not "Dock at".
  const flipPrompt = (liveCode.match(/`[^`]*Docking at[^`]*`/g) || []).find((t) => t.includes("flip!"));
  check("F5: the dock FLIP prompt is byte-unchanged — the playtest measured it already correct",
    flipPrompt, "`Docking at ${iconImg(ING_IMG[ing])} ${dockPlace(ing)} — flip!`");
}

/* ---------- F9: the unaffordable dock-buy option greys out with its reason, instead of vanishing ---------- */
{
  const liveCode = FLOW_SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  // RE-PIN 2026-07-30 (G12): same anchor move as F5's site 2 above, same reason — Wyatt's rewritten
  // prompt. F9's subject (the option greys instead of vanishing, and its reason is conditional) is
  // untouched by the copy change; only the string this block locates itself by moved.
  const tailsIdx = liveCode.indexOf("TAILS! Take treasure instead?");
  checkTrue("F9: the dock-on-tails prompt located by content", tailsIdx > 0);

  // 1. the coin test is OUT of the branch condition, so the prompt can no longer vanish. Extracted
  //    by balancing the if(...) parens — slicing to the prompt instead would run past the condition
  //    into the statement below it and read `const canBuy=p.coins>=3` as part of the guard.
  const before = liveCode.slice(Math.max(0, tailsIdx - 420), tailsIdx);
  const lastIf = before.lastIndexOf("if(");
  let depth = 0, condEnd = -1;
  for (let k = lastIf + 2; lastIf >= 0 && k < before.length; k++) {
    if (before[k] === "(") depth++;
    else if (before[k] === ")") { depth--; if (depth === 0) { condEnd = k; break; } }
  }
  const branchCond = condEnd < 0 ? "" : before.slice(lastIf, condEnd + 1);
  checkTrue("F9: the enclosing branch condition was located", !!branchCond);
  check(`F9: the coin test is OUT of the branch condition, so the prompt always shows — ${branchCond}`, /p\.coins/.test(branchCond), false);
  checkTrue("F9: the buy-rule and remaining-stock tests DO remain in the condition", /dockBuy/.test(branchCond) && /tokens/.test(branchCond));

  // 2. affordability now only decides whether the option is clickable
  const callRegion = liveCode.slice(tailsIdx, tailsIdx + 900);
  checkTrue("F9/D-41: the buy option carries a disabled flag", /disabled\s*:\s*!canBuy/.test(callRegion));
  checkTrue("F9: canBuy is computed from the purse", /const canBuy=p\.coins>=3;/.test(liveCode));

  // 3. Wyatt's approved reason ships BYTE-EXACT, with its U+2014 em dash and its coin shorthand
  const REASON = "Yer too broke to buy it — take the 3\u{1F315} instead.";
  checkTrue("F9: the approved reason is present byte-exact (U+2014 em dash, 🌕 emoji shorthand)", FLOW_SRC.includes(REASON));
  check("F9/D-53: the dash is U+2014 — not an en dash, not a hyphen", /Yer too broke to buy it (–|-) /.test(FLOW_SRC), false);
  check("F9/D-50: the coin stays as emoji shorthand — emojify() renders the art at the panel() chokepoint, so no hand-rolled img tag", /<img[^>]*coin[^>]*>\s*instead/i.test(FLOW_SRC), false);
  checkTrue("F9: the reason is supplied CONDITIONALLY, so an affordable captain sees no helper text", /canBuy\?null:`Yer too broke to buy it/.test(liveCode));

  // 4. D-40 safety net — and it re-reads the purse rather than trusting the pre-await flag, because
  //    the shot clock's 20s penalty can take a coin WHILE this prompt is open (COIN-AUDIT.md site 4).
  const buyGuard = (liveCode.slice(tailsIdx, tailsIdx + 900).match(/if\s*\(\s*buy[^)]*\)/) || [""])[0];
  checkTrue("F9/D-40: the purchase branch was located", !!buyGuard);
  checkTrue(`F9/D-40: the purchase is guarded on affordability as well as on the returned choice — ${buyGuard}`, /&&/.test(buyGuard));
  check("F9/D-40: the guard re-reads p.coins rather than trusting the pre-await canBuy flag", /if\(buy&&p\.coins>=3\)/.test(liveCode), true);
}


/* ---------- G14 (2026-07-30): rimSweepPath — the ONE trade-wind stepper's pure half ---------- */
// Wyatt: "the tradewinds to move players square-by-square, quickly… then we don't need a new
// narration line, and the players are just seeing what happens."
//
// Run against REAL round boards over 12 seeds and EVERY rim cell on each, because the arc layout is
// randomised per game (arc lengths and the whole ring's rotation are both RNG-derived,
// src/engine/index.js:70-83) — a single hand-picked board would prove almost nothing. This is a
// PURE, DOM-free function, which is exactly why it can be tested here at all.
{
  let cellsChecked = 0, atHead = 0, longest = 0;
  const problems = [];
  for (let seed = 1; seed <= 12; seed++) {
    const g = new EngineGame(engineRoundCfg(["balanced", "balanced", "balanced", "balanced"]), seed, true);
    const ring = g.rimCellInfo || [];
    if (!ring.length) { problems.push(`seed ${seed}: no rim ring`); continue; }
    for (const rc of ring) {
      const from = [rc.x, rc.y];
      const head = g.rimHead[rc.x + "," + rc.y];
      const path = rimSweepPath(g, from);
      cellsChecked++;
      // a cell already AT its arc head returns []
      if (head[0] === from[0] && head[1] === from[1]) {
        if (path.length) problems.push(`seed ${seed}: ${from} is its own arc head but returned a ${path.length}-cell path`);
        atHead++;
        continue;
      }
      if (!path.length) { problems.push(`seed ${seed}: empty path from non-head rim cell ${from}`); continue; }
      longest = Math.max(longest, path.length);
      // the last cell IS the arc head
      const last = path[path.length - 1];
      if (last[0] !== head[0] || last[1] !== head[1]) problems.push(`seed ${seed}: path from ${from} ends at ${last}, not the arc head ${head}`);
      let prev = from;
      for (const c of path) {
        // every returned cell is on the rim
        if (!g.onRim(c)) problems.push(`seed ${seed}: path from ${from} leaves the rim at ${c}`);
        // consecutive cells are king-move adjacent — proof this is a real ring WALK, not a jump
        const dx = Math.abs(c[0] - prev[0]), dy = Math.abs(c[1] - prev[1]);
        if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) problems.push(`seed ${seed}: path from ${from} jumps ${prev} -> ${c}`);
        // never includes `from` itself
        if (c[0] === from[0] && c[1] === from[1]) problems.push(`seed ${seed}: path from ${from} includes its own start`);
        prev = c;
      }
    }
    // a cell that is not on the ring at all
    if (rimSweepPath(g, [-1, -1]).length) problems.push(`seed ${seed}: a non-rim cell returned a path`);
  }
  check(`G14: rimSweepPath holds over 12 seeds and every rim cell — ${cellsChecked} cell(s) checked, ${atHead} already at their arc head, longest arc ${longest} cell(s)${problems.length ? " — " + problems.slice(0, 5).join("; ") : ""}`, problems.length, 0);
  checkTrue("G14: the corpus is non-trivial — at least 300 rim cells were actually exercised", cellsChecked >= 300);

  // a NON-ROUND board has no ring at all, so there is nothing to sweep
  const flat = new EngineGame({ ...engineRoundCfg(["balanced", "balanced", "balanced", "balanced"]), roundBoard: false }, 7, true);
  check("G14: a non-round board returns [] (no ring exists, so no sweep can be invented)", rimSweepPath(flat, [0, 0]).length, 0);
  check("G14: a null/absent `from` returns [] rather than throwing", rimSweepPath(flat, null).length, 0);
}

/* ---------- 2026-07-31: rimSweepCurve — the smooth arc's pure half ---------- */
// The per-square stepper this replaces was CORRECT and looked wrong (Wyatt: "it moves according to
// a step function instead of a smooth, rounded motion"). Correctness alone therefore proves nothing
// here; what these check is that the curve is smooth, hugs the ring, and lands exactly where the
// engine says the ship ended up. Run over real randomised boards for the same reason rimSweepPath's
// tests are: arc layout and ring rotation are both RNG-derived per game.
{
  let curvesChecked = 0, worstGap = 0, worstDrift = 0, worstEven = 0;
  const problems = [];
  for (let seed = 1; seed <= 8; seed++) {
    const g = new EngineGame(engineRoundCfg(["balanced", "balanced", "balanced", "balanced"]), seed, true);
    const ring = g.rimCellInfo || [];
    // `g.cfg.grid`, NOT `g.grid` — there is no `grid` property on Game, and the first draft of this
    // test used one. cx/cy came out NaN, every radius came out NaN, and `r < rMin - 0.75` is false
    // for NaN, so the ring-hugging assertion below silently checked NOTHING while printing PASS.
    // That is the exact vacuous-check failure mode this project has now caught four times; the
    // finite() guard underneath is here so it cannot recur silently a fifth.
    const n = g.cfg.grid;
    const cx = (n - 1) / 2, cy = (n - 1) / 2;
    // the ring's own radius band, measured from the board — never hard-coded, so an island-redesign
    // that moves the ring makes this test move with it instead of going quietly wrong
    const radii = ring.map((c) => Math.hypot(c.x - cx, c.y - cy));
    const rMin = Math.min(...radii), rMax = Math.max(...radii);
    if (!Number.isFinite(rMin) || !Number.isFinite(rMax) || rMax <= 0) {
      problems.push(`seed ${seed}: ANTI-VACUITY — the ring radius band is not finite (${rMin}..${rMax}); the hugs-the-ring assertion below would silently pass without testing anything`);
      continue;
    }
    for (const rc of ring) {
      const from = [rc.x, rc.y];
      const path = rimSweepPath(g, from);
      if (!path.length) continue;
      const curve = rimSweepCurve([from, ...path]);
      curvesChecked++;
      if (curve.length < 2) { problems.push(`seed ${seed}: ${from} produced a degenerate curve`); continue; }

      // 1. starts ON the square the player clicked, ends ON the whirlpool — no easing past either
      const head = path[path.length - 1];
      const d0 = Math.hypot(curve[0][0] - from[0], curve[0][1] - from[1]);
      const d1 = Math.hypot(curve[curve.length - 1][0] - head[0], curve[curve.length - 1][1] - head[1]);
      if (d0 > 1e-6) problems.push(`seed ${seed}: curve from ${from} starts ${d0.toFixed(3)} cells away from it`);
      if (d1 > 1e-6) problems.push(`seed ${seed}: curve from ${from} ends ${d1.toFixed(3)} cells from the arc head ${head}`);

      // 2. SMOOTH: no sample-to-sample jump anywhere near a whole cell. A staircase would show up
      //    here as a gap of ~1.0 — this is the property the redesign exists to create.
      // 3. EVENLY SPACED: constant spacing == constant speed. Uneven spacing would make the boat
      //    slow through the curves and hurry the straights, the same class of artefact as before.
      const gaps = [];
      for (let i = 1; i < curve.length; i++) gaps.push(Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]));
      const maxGap = Math.max(...gaps), minGap = Math.min(...gaps);
      worstGap = Math.max(worstGap, maxGap);
      worstEven = Math.max(worstEven, maxGap - minGap);
      if (maxGap > 0.35) problems.push(`seed ${seed}: curve from ${from} jumps ${maxGap.toFixed(3)} cells between samples — that is a step, not a glide`);
      if (maxGap - minGap > 0.05) problems.push(`seed ${seed}: curve from ${from} is unevenly spaced (${minGap.toFixed(3)}..${maxGap.toFixed(3)}) — speed would vary along the arc`);

      // 4. HUGS THE RING: the whole point of the previous bug was a boat cutting across the middle
      //    of the board. A spline can overshoot on tight turns, so allow a small band either side
      //    of the ring's own radius — but nothing like the several cells a chord would cut.
      for (const p of curve) {
        const r = Math.hypot(p[0] - cx, p[1] - cy);
        worstDrift = Math.max(worstDrift, Math.max(0, rMin - r, r - rMax));
        if (r < rMin - 0.75 || r > rMax + 0.75) {
          problems.push(`seed ${seed}: curve from ${from} strays to radius ${r.toFixed(2)}, outside the ring band ${rMin.toFixed(2)}..${rMax.toFixed(2)} — it is cutting across the board`);
          break;
        }
      }
    }
  }
  check(`SMOOTH-ARC: rimSweepCurve over 8 seeds and every rim cell — ${curvesChecked} curve(s); largest sample gap ${worstGap.toFixed(3)} cells, spacing spread ${worstEven.toFixed(4)}, max drift off the ring band ${worstDrift.toFixed(3)} cells${problems.length ? " — " + problems.slice(0, 4).join("; ") : ""}`, problems.length, 0);
  check("SMOOTH-ARC: fewer than two cells cannot make a curve (returns [], never throws)", rimSweepCurve([[3, 3]]).length, 0);
  check("SMOOTH-ARC: a null/garbage input returns [] rather than throwing", rimSweepCurve(null).length, 0);

  // RED-PROOF for the smoothness threshold above. A PASS on "largest gap 0.088" only means
  // something if a real staircase would FAIL it — otherwise the number is decoration. Feed the raw
  // cell centres (exactly what the old per-square stepper visited) through the same measurement and
  // confirm it lands where a step function must: at ~1.0 cells, far past the 0.35 threshold.
  {
    const stair = [[5, 0], [6, 0], [7, 0], [8, 0], [9, 0]];
    let maxStep = 0;
    for (let i = 1; i < stair.length; i++) maxStep = Math.max(maxStep, Math.hypot(stair[i][0] - stair[i - 1][0], stair[i][1] - stair[i - 1][1]));
    checkTrue(`SMOOTH-ARC RED-PROOF: the per-square stepper's own gaps (${maxStep.toFixed(2)} cells) exceed the 0.35 smoothness threshold — the assertion above can fail`, maxStep > 0.35);
    // and the curve through those same cells must come in UNDER it
    const smoothed = rimSweepCurve(stair);
    let maxSmooth = 0;
    for (let i = 1; i < smoothed.length; i++) maxSmooth = Math.max(maxSmooth, Math.hypot(smoothed[i][0] - smoothed[i - 1][0], smoothed[i][1] - smoothed[i - 1][1]));
    checkTrue(`SMOOTH-ARC RED-PROOF: the curve through the same cells stays under it (${maxSmooth.toFixed(3)} cells)`, maxSmooth < 0.35);
  }
}

/* ---------- D-09: the round-level lines this plan must NOT touch stay out of this file's diff surface ---------- */
{
  checkTrue("D-09: this file never defines EVENT_NARRATION.newround (that table lives in src/ui/util.js, plan 15-04's territory)", !FLOW_SRC.includes("newround:"));
}

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failing check(s)`);
process.exit(failures ? 1 : 0);
