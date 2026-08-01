#!/usr/bin/env node
// scripts/narration_test.js
//
// Phase 15 (NARR-05/D-07/D-08/D-10): the DOM-free harness every later narration plan in this
// phase asserts through. Two jobs:
//
//   1. (this wave, Wave 0) Pin the PRE-CHANGE baseline so nothing later in the phase can silently
//      break it: the full 25-key EVENT_NARRATION inventory the audit is sized against, every
//      builder surviving a minimal fabricated event with no throw, the `moored` invariants
//      scripts/bot_storm_narration_test.js already proves (mirrored here deliberately, so a
//      regression is caught by BOTH scripts, not only the older one), and the NARR-05 "encoding"
//      guarantee — a captain name with multi-byte/emoji characters survives narration intact,
//      escaped exactly once by pname()'s own escHtml().
//   2. (15-01's own tracer task) Prove the viewer-aware narration mechanism end to end on ONE
//      line (EVENT_NARRATION.dodge) — table builder -> viewer-neutral default + per-seat variants
//      -> flash() -> netNarrate -> netSetNarr's widened rooms/{code}/narr payload -> watchNarr's
//      per-client pick — entirely DOM-free, using a fake `db` that just records what it's handed.
//
// Convention (matches determinism_baseline.js/hail_ranking_test.js/storm_moored_reason_test.js/
// bot_storm_narration_test.js): no assertion library, a local check(name, actual, expected)
// counter, plain console.log, process.exit(failures?1:0). Direct `import` of the narration surface
// from src/ui/util.js — no DOM reference, no import of src/ui/flow.js or src/ui/panel.js.

import {
  EVENT_NARRATION, describe, pname, pn, describeFor, NEUTRAL_VIEWER, narrationVariants,
  pickNarrVariant, msgHoldMs, botMsgHoldMs, chatBubbleHoldMs, fmtItem,
} from "../src/ui/util.js";
import { ilabelImg, ING_IMG, ING_ALL, iconImg, dockFlavor, dockFlavorIcon, dockPlace, iname, HEXCOL } from "../src/shared/index.js";
import { netSetNarr } from "../src/net/writers.js";
import { appState } from "../src/state/index.js";
import { RECIPE_BOOK, recipeArticle, recipeTitle } from "../src/ui/recipe.js";
// D-54: src/ui/flow.js's flash() sites are not table-driven, so the one approved ad-hoc line there
// is pinned by reading the shipped source rather than by importing it (this harness deliberately
// never imports src/ui/flow.js — see the header note above).
import { readFileSync } from "node:fs";

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

// ---- bootstrap appState the way an out-of-game caller must ----
// Four claimed seats with real names (id truthy -> pname() always reads s.name, never the
// default Capt. NAMES fallback). appState.mySeat is left at its module default (null) — an
// out-of-game caller like this script, or a fresh bot_storm_narration_test.js run, never sets it.
appState.roster = [
  { id: "u0", name: "Davy Scones" },
  { id: "u1", name: "Crustbeard" },
  { id: "u2", name: "Dough Hook" },
  { id: "u3", name: "Flaky Jack" },
];
// minimal object carrying the two cfg flags the trade/fish builders read, so they don't throw
// reaching for appState.game.cfg.tradeBonus / .sardine outside a real Game instance
appState.game = { cfg: { tradeBonus: true, sardine: true } };

const at = () => [0, 0]; // describe()/captions() never need real board coordinates; neither does this harness

console.log("Narration audit harness — Wave 0 baseline + viewer-aware tracer (NARR-05/D-07/D-08/D-10)\n");

/* ---------- assertion 1: the 25-key inventory the audit is sized against ---------- */
const KEYS = Object.keys(EVENT_NARRATION);
check("EVENT_NARRATION has exactly 25 keys (the audit's inventory size)", KEYS.length, 25);

/* ---------- assertion 2: every key is a function; every builder survives a minimal fabricated event ---------- */
// one minimal, self-consistent fabricated event per key — just enough fields for that builder to
// run its full branch logic without throwing (no engine/DOM needed, mirrors bot_storm_narration_
// test.js's own direct-table-call style)
const FAB = {
  newround: { t: "newround", round: 1, dir: "N", dir2: "E", windStreak: 1, storm: false, streak: 0 },
  windmove: { t: "windmove", p: 0 },
  blownOut: { t: "blownOut", p: 0 },
  sail: { t: "sail", p: 0 },
  dodge: { t: "dodge", p: 0 },
  anchor: { t: "anchor", p: 0 },
  moored: { t: "moored", p: 0, reason: "justDocked" },
  blocked: { t: "blocked", p: 0, other: 1 },
  anchorHold: { t: "anchorHold", p: 0 },
  tradewind: { t: "tradewind", p: 0 },
  parley: { t: "parley", a: 0, b: 1, offer: "wheat", want: "sugar", ok: true },
  aground: { t: "aground", p: 0 },
  shipwrecked: { t: "shipwrecked", p: 0 },
  dock: { t: "dock", p: 0, ing: "wheat", got: "ing", heads: true },
  trade: { t: "trade", a: 0, b: 1, gave: "wheat", got: "sugar" },
  sidebet: { t: "sidebet", p: 0, won: true, delta: 2 },
  battle: { t: "battle", a: 0, d: 1, winner: 0, rounds: [[true, false, false, "a"]], spoil: "5 coins", spoilIng: null },
  battleflee: { t: "battleflee", a: 0, d: 1 },
  fish: { t: "fish", p: 0, heads: true },
  finish: { t: "finish", p: 0 },
  shotclock: { t: "shotclock", p: 0 },
  shotclockskip: { t: "shotclockskip", p: 0 },
  bakeoff: { t: "bakeoff", a: 0, b: 1, winner: 0 },
  end: { t: "end", winner: null },
  turn: { t: "turn", p: 0 },
};
for (const key of KEYS) {
  checkTrue(`EVENT_NARRATION.${key} is a function`, typeof EVENT_NARRATION[key] === "function");
  const fab = FAB[key];
  if (!fab) {
    console.log(`  FAIL  no fabricated event registered for key "${key}"`);
    failures++;
    continue;
  }
  let result, threw = false;
  try {
    result = EVENT_NARRATION[key](fab, at);
  } catch (e) {
    threw = true;
    console.log(`  FAIL  EVENT_NARRATION.${key}(...) threw: ${e && e.message}`);
    failures++;
  }
  if (!threw) {
    if (key === "turn") check("EVENT_NARRATION.turn(...) returns null (the one key with no line)", result, null);
    else checkTrue(`EVENT_NARRATION.${key}(...) returns an object`, result !== null && typeof result === "object");
  }
}

/* ---------- assertion 3: the moored baseline (mirrors bot_storm_narration_test.js's own checks) ---------- */
{
  const f = EVENT_NARRATION.moored;
  const justDocked = f({ t: "moored", p: 0, reason: "justDocked" }, at).txt;
  const home = f({ t: "moored", p: 0, reason: "home" }, at).txt;
  check("moored: reason justDocked and reason home render the identical line", justDocked, home);
  const bare = f({ t: "moored", p: 0 }, at).txt;
  checkTrue("moored: a no-reason event renders a real (non-empty, non-undefined) line", !!bare && !/undefined/.test(bare));
  checkTrue("describe(): a reasoned moored event still produces a non-null captain's-log line", describe({ t: "moored", p: 0, reason: "dock" }) !== null);
}

/* ---------- assertion 4 (NARR-05 encoding): a multi-byte/emoji captain name survives intact, escaped once ---------- */
{
  // "🐙" is deliberately an emoji with NO entry in shared/index.js's EMOJI_IMG map — describe()'s
  // final emojify() pass swaps every MAPPED emoji for its custom <img>, which would silently
  // rewrite this literal glyph inside the interpolated name and defeat the "survives intact"
  // assertion below for reasons that have nothing to do with narration encoding.
  const rawCaptainName = "Café Piér & Co. 🐙";
  const savedRoster = appState.roster;
  appState.roster = [{ id: "u0", name: rawCaptainName }, ...savedRoster.slice(1)];
  const expected = pname(0); // the single source of truth for how this name gets escaped
  checkTrue("dock: pname() HTML-escapes the ampersand exactly once (never left raw)", expected.includes("&amp;") && !expected.includes(" & "));
  const out = describe({ t: "dock", p: 0, ing: "wheat", got: "ing", heads: true });
  checkTrue("dock: describe() output is non-null for the emoji/multi-byte name case", out !== null);
  const txt = out ? out.txt : "";
  const occurrences = txt.split(expected).length - 1;
  check("dock: the escaped captain name appears exactly once in the narration", occurrences, 1);
  checkTrue("dock: the name survives intact (é + emoji both present)", txt.includes("Piér") && txt.includes("🐙"));
  appState.roster = savedRoster;
}

/* ---------- Task 2 (TRACER): viewer-aware narration, one line, end to end, DOM-free ----------
   Reproduces the whole chain — table builder -> viewer-neutral default + per-seat variants ->
   the payload netSetNarr writes -> pickNarrVariant's per-client selection — exactly as
   narrateLastEvent()/netNarrate()/watchNarr() do it in the real UI, but with a fake `db` that
   just records what it's handed instead of touching Firebase. */
{
  const dodgeEvent = { t: "dodge", p: 1 };

  // ---- table builder -> viewer-neutral default + per-seat variants (mirrors narrateLastEvent()) ----
  const neutral = describeFor(dodgeEvent, NEUTRAL_VIEWER);
  checkTrue("dodge: describeFor(e, NEUTRAL_VIEWER) is non-null", neutral !== null);
  const variants = narrationVariants(dodgeEvent);
  check("dodge: narrationVariants(e) has exactly one entry (the addressed subject seat)", variants.length, 1);
  checkTrue("dodge: the one variant's seat equals the event's subject seat (e.p)", variants.length === 1 && variants[0].seat === dodgeEvent.p);
  checkTrue("dodge: describeFor(e, subjectSeat).txt differs from the neutral rendering", describeFor(dodgeEvent, dodgeEvent.p).txt !== neutral.txt);
  checkTrue("dodge: with appState.mySeat unset, describe(e).txt equals the neutral rendering", describe(dodgeEvent).txt === neutral.txt);
  checkTrue("narrationVariants: calling it twice returns arrays with identical ordering", JSON.stringify(narrationVariants(dodgeEvent)) === JSON.stringify(variants));
  // Plan 15-04 Task 2 note: this originally pinned "anchor" as the no-viewer-branch example, but
  // Task 2 (D-07) deliberately gives `anchor` its own addressed branch — `newround` (D-09) is the
  // one entry guaranteed to stay branch-free for the life of this table, so the pin moves there.
  check("narrationVariants: a builder with no viewer branch (newround) returns an empty array", narrationVariants({ t: "newround", round: 1, dir: "N", dir2: "E", windStreak: 1, storm: false, streak: 0 }).length, 0);

  // ---- the payload netSetNarr writes (mirrors netNarrate/netBroadcast's own call) ----
  function makeFakeDb() {
    const calls = [];
    return { calls, ref(path) { return { set(payload) { calls.push({ path, payload }); return Promise.resolve(); } }; } };
  }
  const fakeDb = makeFakeDb();
  netSetNarr(fakeDb, "ROOM", neutral.txt, null, variants);
  check("netSetNarr: writes to the rooms/<room>/narr path", fakeDb.calls[0] && fakeDb.calls[0].path, "rooms/ROOM/narr");
  const payload = fakeDb.calls[0] && fakeDb.calls[0].payload;
  checkTrue("netSetNarr: a non-empty variants array lands on the written payload", !!payload && Array.isArray(payload.variants) && payload.variants.length === 1);
  check("netSetNarr: the written payload's html field is the viewer-neutral text", payload && payload.html, neutral.txt);

  // ---- pickNarrVariant's per-client selection (mirrors netNarrate's own screen AND watchNarr) ----
  check("pickNarrVariant: the subject seat gets the addressed text", pickNarrVariant(payload, dodgeEvent.p), variants[0].html);
  check("pickNarrVariant: a non-subject seat gets the viewer-neutral text", pickNarrVariant(payload, dodgeEvent.p + 1), neutral.txt);
  check("pickNarrVariant: a viewer with a null seat gets the viewer-neutral text", pickNarrVariant(payload, null), neutral.txt);
  check("pickNarrVariant: literal spec example — html-only payload", pickNarrVariant({ html: "X" }, 2), "X");
  check("pickNarrVariant: literal spec example — empty variants array", pickNarrVariant({ html: "X", variants: [] }, 2), "X");
  check("pickNarrVariant: literal spec example — null payload", pickNarrVariant(null, 2), "");
  check("pickNarrVariant: literal spec example — null seat falls back to html", pickNarrVariant({ html: "X", variants: [{ seat: 2, html: "Y" }] }, null), "X");

  // ---- both version-skew directions degrade cleanly to the payload's own html ----
  const fakeDbOld = makeFakeDb();
  netSetNarr(fakeDbOld, "ROOM", neutral.txt, null, []); // an "old host" writes no variants at all
  const oldPayload = fakeDbOld.calls[0].payload;
  checkTrue("netSetNarr: an empty variants array is OMITTED from the written payload entirely (not written as [])", !Object.prototype.hasOwnProperty.call(oldPayload, "variants"));
  check("pickNarrVariant: a payload with no variants key still yields the neutral text (old-host skew)", pickNarrVariant(oldPayload, dodgeEvent.p), neutral.txt);
  checkTrue("pickNarrVariant: never returns undefined/null for a well-formed payload", typeof pickNarrVariant(oldPayload, dodgeEvent.p) === "string");
}

/* ---------- Task 2 (NARR-06/D-14/D-15): the 10% hold cut, pinned across all three curves ----------
   Computes every "before" value from the documented base/per-char/pause/clamp formula with the
   OLD multiplier (never hardcoded from memory), then asserts the "after" value the live curve
   actually returns is exactly 0.9x that — mechanically enforcing D-14's "10% less time" on both
   cut curves, while chatBubbleHoldMs (D-15) stays completely unmoved by this task. */
{
  // mirrors msgHoldMs/botMsgHoldMs/chatBubbleHoldMs's own base/per-char/pause/clamp shape exactly,
  // parameterized by clamp bounds + multiplier, so "old value" can be computed without importing
  // a frozen pre-change copy of the function itself
  function holdFormula(text, lo, hi, multiplier) {
    text = text || "";
    const base = 1000, charTime = 50;
    let raw = base + text.length * charTime;
    const body = text.replace(/[.,!?]+$/, "");
    const pauses = (body.match(/[,!?.]/g) || []).length;
    raw += pauses * 300;
    return Math.round(Math.min(Math.max(raw, lo), hi) * multiplier);
  }

  const sample40 = "x".repeat(40); // 40 code units, no punctuation — the plan's own pinned sample

  /* ---- G28 (Wyatt-approved 2026-07-30): the curve's numbers are now set DIRECTLY, so there is no
     multiplier for the sample to be a ratio OF. The old pins asserted "0.9x the pre-change value",
     a relationship NARR-06 expressed and G28 supersedes — he retuned live against a measured table
     and the constants are the visible milliseconds. Pinned against the formula and as a literal, so
     a silent drift in either the shape or the numbers still fails. ---- */
  const HOLD_BASE = 500, HOLD_PER_CHAR = 20, HOLD_PAUSE = 300, HOLD_FLOOR = 800, HOLD_CEIL = 2000;
  const holdG28 = (t) => {
    const body = t.replace(/[.,!?]+$/, "");
    const pauses = (body.match(/[,!?.]/g) || []).length;
    return Math.round(Math.min(Math.max(HOLD_BASE + t.length * HOLD_PER_CHAR + pauses * HOLD_PAUSE, HOLD_FLOOR), HOLD_CEIL));
  };
  check("msgHoldMs: 40-code-unit sample matches the G28 curve", msgHoldMs(sample40), holdG28(sample40));
  check("msgHoldMs: 40-code-unit sample returns 1300 (pinned literal)", msgHoldMs(sample40), 1300);
  check("msgHoldMs: the G28 ceiling binds — a 200-char line is capped, not linear", msgHoldMs("x".repeat(200)), 2000);
  check("msgHoldMs: the G28 floor binds on a short pauseless line", msgHoldMs("x".repeat(5)), 800);
  // D-23 (Wyatt-approved 2026-07-29): the separate, shorter bot curve is RETIRED — bot narration
  // now holds for exactly as long as an identical human line (D-18 parity), so botMsgHoldMs is a
  // pure alias for msgHoldMs and this asserts that equality rather than the old distinct formula.
  check("botMsgHoldMs: is now a pure alias for msgHoldMs (D-23 parity)", botMsgHoldMs(sample40), msgHoldMs(sample40));

  /* ---- the D-15 invariant: chat bubbles are UNCHANGED by this task, and equal to msgHoldMs's own pre-cut value ---- */
  const bubbleExpected = holdFormula(sample40, 1200, 7000, 0.8); // CHAT_BUBBLE_HOLD_MULTIPLIER, pinned at Task 1
  check("chatBubbleHoldMs: 40-code-unit sample is unchanged by the NARR-06 cut", chatBubbleHoldMs(sample40), bubbleExpected);
  check("chatBubbleHoldMs: 40-code-unit sample returns 2400 (pinned literal, equal to msgHoldMs's pre-change value)", chatBubbleHoldMs(sample40), 2400);

  /* ---- NARR-06 empty: "", null, undefined all return a positive, clamped-floor hold on every curve ---- */
  for (const input of ["", null, undefined]) {
    const label = input === "" ? '""' : String(input);
    const humanVal = msgHoldMs(input);
    check(`msgHoldMs(${label}): G28 floor — a plain 800ms, no multiplier`, humanVal, 800);
    checkTrue(`msgHoldMs(${label}): positive integer, never NaN/zero/negative`, Number.isInteger(humanVal) && humanVal > 0);
    const botVal = botMsgHoldMs(input);
    check(`botMsgHoldMs(${label}): D-23 parity — equals msgHoldMs(${label})`, botVal, humanVal);
    checkTrue(`botMsgHoldMs(${label}): positive integer, never NaN/zero/negative`, Number.isInteger(botVal) && botVal > 0);
    const bubbleVal = chatBubbleHoldMs(input);
    check(`chatBubbleHoldMs(${label}): clamped floor 1200 x 0.8`, bubbleVal, 960);
    checkTrue(`chatBubbleHoldMs(${label}): positive integer, never NaN/zero/negative`, Number.isInteger(bubbleVal) && bubbleVal > 0);
  }

  /* ---- NARR-06 encoding: emoji vs ASCII of equal String.length hold identically on all three curves ---- */
  // 20 astral-plane emoji, each a UTF-16 surrogate PAIR -> String.length === 40, same as the
  // 40-character ASCII sample — these curves only ever read text.length and match ASCII
  // punctuation, so this is unaffected by describe()/emojify()'s DOM-only EMOJI_IMG substitution.
  const emojiSample = "\u{1F419}".repeat(20); // octopus emoji, astral plane (surrogate pair)
  const asciiSample = "y".repeat(40);
  check("encoding: 20-emoji sample has String.length 40 (UTF-16 code units, not 20 grapheme clusters)", emojiSample.length, 40);
  check("encoding: 40-ASCII-character sample has String.length 40", asciiSample.length, 40);
  check("msgHoldMs: emoji sample and ASCII sample of equal String.length hold identically", msgHoldMs(emojiSample), msgHoldMs(asciiSample));
  check("botMsgHoldMs: emoji sample and ASCII sample of equal String.length hold identically", botMsgHoldMs(emojiSample), botMsgHoldMs(asciiSample));
  check("chatBubbleHoldMs: emoji sample and ASCII sample of equal String.length hold identically", chatBubbleHoldMs(emojiSample), chatBubbleHoldMs(asciiSample));

  /* ---- the D-15 invariant, restated across every sample string in this block: bubbles outlast narration ---- */
  for (const s of [sample40, emojiSample, asciiSample, ""]) {
    checkTrue(`chatBubbleHoldMs > msgHoldMs for sample len=${s.length}`, chatBubbleHoldMs(s) > msgHoldMs(s));
  }
}

/* ---------- Plan 15-04 Task 1 (NARR-04/D-12), extended by Plan 18-04 Task 2 (FIX-07) ----------
   Direct-table-call style (mirrors scripts/bot_storm_narration_test.js's own EVENT_NARRATION.
   moored assertions) — fabricated battle events, no engine/DOM needed. Asserts the boundary sits
   exactly between 4 and 5 coins, ingredient spoils are untouched, an absent/empty/non-numeric
   spoil always falls through to the cleaned-out (least-claiming) framing with no undefined/NaN,
   AND (FIX-07) that the real spoilChosen signal — not the coin amount alone — decides whether a
   5-coin spoil reads as a genuine bribe or as an empty-hold give-up. */
{
  const f = EVENT_NARRATION.battle;
  // FIX-07: spoilChosen is an optional 3rd arg — omitted entirely (not just `undefined`-valued)
  // when the caller passes nothing, so the "absent field" case fabricates the exact shape every
  // engine/replay/simulator/fixture event actually has: no key at all.
  const mkEvent = (spoil, spoilIng = null, spoilChosen) => {
    const e = { t: "battle", a: 0, d: 1, winner: 0, rounds: [[true, false, false, "a"]], spoil, spoilIng };
    if (spoilChosen !== undefined) e.spoilChosen = spoilChosen;
    return e;
  };
  const isBribe = txt => /bribes their way out of giving away a crate/.test(txt);
  // NARR-01/D-25 (Wyatt-approved 2026-07-29): the cleaned-out framing's wording changed to
  // "gives up all they have" (was "has nothing left to give") — same invariant, new literal.
  const isCleanedOut = txt => /gives up all they have/.test(txt);
  // FIX-07 (ruled 2026-07-31): the new give-up line is "gives up {spoil}."/"give up {spoil}." with
  // NO "all" following — the negative lookahead is what keeps this from also matching the
  // cleaned-out phrase above ("gives up all they have"), which always has "all" immediately after.
  const isGiveUp = txt => /\bgives? up (?!all\b)/i.test(txt);

  const genuine = f(mkEvent("5 coins"), at).txt;
  const cleaned = f(mkEvent("2 coins"), at).txt;
  checkTrue("battle: 5-coin (bribe) wording differs from 2-coin (cleaned-out) wording", genuine !== cleaned);
  checkTrue("battle: both renderings non-empty with no undefined/NaN token", !!genuine && !!cleaned && !/undefined|NaN/.test(genuine) && !/undefined|NaN/.test(cleaned));

  // FIX-07: the 0/1/2/4-coin cleaned-out assertions, extended across all three spoilChosen states
  // (genuinely chosen, genuinely not chosen, and unknown/absent) — pinning that the under-5 path is
  // independent of the new field, exactly as the plan's own behavior spec requires ("a 2-coin spoil
  // renders the all-they-have framing regardless of spoilChosen").
  for (const spoilChosen of [true, false, undefined]) {
    for (const n of [0, 1, 2, 4]) {
      const txt = f(mkEvent(`${n} coins`, null, spoilChosen), at).txt;
      checkTrue(`battle: ${n}-coin spoil (spoilChosen=${spoilChosen}) renders the cleaned-out framing`, isCleanedOut(txt));
      checkTrue(`battle: ${n}-coin spoil (spoilChosen=${spoilChosen}) does NOT render the bribe framing`, !isBribe(txt));
      checkTrue(`battle: ${n}-coin spoil (spoilChosen=${spoilChosen}) does NOT render the give-up framing`, !isGiveUp(txt));
    }
  }

  // FIX-07: the 5-coin block, split into three labelled cases per the copy-gate rule (re-pointed,
  // never deleted) — this is the exact assertion that used to encode the bug, since a 5-coin spoil
  // with spoilIng:null was always read as a bribe regardless of whether the loser ever had a crate
  // to forgo. Each case asserts mutual exclusivity: exactly one of the three framings is present.
  {
    // Case A — genuine-bribe: the loser HAD a crate and genuinely chose coins over it.
    const txt = f(mkEvent("5 coins", null, true), at).txt;
    checkTrue("battle FIX-07 [genuine-bribe case]: 5-coin spoil with spoilChosen:true renders the bribe framing", isBribe(txt));
    checkTrue("battle FIX-07 [genuine-bribe case]: does NOT render the give-up framing", !isGiveUp(txt));
    checkTrue("battle FIX-07 [genuine-bribe case]: does NOT render the cleaned-out framing", !isCleanedOut(txt));
    checkTrue("battle FIX-07 [genuine-bribe case]: exactly one framing present", [isBribe(txt), isGiveUp(txt), isCleanedOut(txt)].filter(Boolean).length === 1);
  }
  {
    // Case B — empty-hold: the loser had NO crate; the coin take still reached the 5-coin clamp
    // ceiling. This is the case that used to render bribe framing before this plan's fix (FIX-07).
    const txt = f(mkEvent("5 coins", null, false), at).txt;
    checkTrue("battle FIX-07 [empty-hold case]: 5-coin spoil with spoilChosen:false renders the give-up framing", isGiveUp(txt));
    checkTrue("battle FIX-07 [empty-hold case]: does NOT render the bribe framing", !isBribe(txt));
    checkTrue("battle FIX-07 [empty-hold case]: does NOT render the cleaned-out framing", !isCleanedOut(txt));
    checkTrue("battle FIX-07 [empty-hold case]: exactly one framing present", [isBribe(txt), isGiveUp(txt), isCleanedOut(txt)].filter(Boolean).length === 1);
    checkTrue("battle FIX-07 [empty-hold case]: the ruled literal 'gives up 5🌕.' appears verbatim (neutral viewer)", txt.includes("gives up 5🌕."));
  }
  {
    // Case C — absent-field regression: no spoilChosen key at all, exactly the shape every
    // engine-generated, replayed, and fixture battle event has and always will have (hard
    // constraint 2). Must render the shipped-history bribe framing, byte-unchanged.
    const txt = f(mkEvent("5 coins"), at).txt;
    checkTrue("battle FIX-07 [absent-field case]: 5-coin spoil with no spoilChosen key renders the bribe framing (shipped-history default)", isBribe(txt));
    checkTrue("battle FIX-07 [absent-field case]: does NOT render the give-up framing", !isGiveUp(txt));
    checkTrue("battle FIX-07 [absent-field case]: does NOT render the cleaned-out framing", !isCleanedOut(txt));
    checkTrue("battle FIX-07 [absent-field case]: exactly one framing present", [isBribe(txt), isGiveUp(txt), isCleanedOut(txt)].filter(Boolean).length === 1);
  }

  // ingredient spoils are UNTOUCHED by the split — pin the literal "{winner} takes {spoil}." clause.
  //
  // G3 (Wyatt-approved 2026-07-30) — FIXTURE REPAIRED, assertion not loosened. This event used to
  // be built with a hand-written placeholder spoil ('<img class="ic" src="x">Wheat') alongside
  // spoilIng:"wheat", which VIOLATES the paired-field invariant every real emit site upholds:
  // src/orchestrator.js:586 and src/engine/index.js:572-573 both set `spoil=ilabelImg(pick)` and
  // `spoilIng=pick` together, so the two fields always agree. That is the D-51 defect class in
  // miniature — the right line rendered with values the game cannot produce — and it only surfaced
  // because the crate branch now renders from the DATA field (spoilIng) rather than from the
  // pre-rendered engine text. Pinning against ilabelImg() is STRICTER than the old placeholder:
  // it asserts the clause carries the ingredient's real custom art (D-17), not an arbitrary stub.
  //
  // FIX-07: also asserted for spoilChosen:true — an ingredient spoil (spoilIng set) is unaffected
  // by the new field in all three states, per the plan's own behavior spec.
  const ingTxt = f(mkEvent(ilabelImg("wheat"), "wheat"), at).txt;
  checkTrue("battle: ingredient-spoil clause still reads '{winner} takes {spoil}.' (untouched by the split, and rendered from the spoilIng DATA field)", ingTxt.includes(`takes ${ilabelImg("wheat")}.`));
  const ingTxtChosen = f(mkEvent(ilabelImg("wheat"), "wheat", true), at).txt;
  checkTrue("battle FIX-07: an ingredient spoil is unaffected by spoilChosen:true (still '{winner} takes {spoil}.')", ingTxtChosen.includes(`takes ${ilabelImg("wheat")}.`));

  for (const [label, spoil] of [["absent", undefined], ["empty", ""], ["non-numeric", "abc coins"]]) {
    const txt = f(mkEvent(spoil), at).txt;
    checkTrue(`battle: ${label} spoil still renders a non-empty line with no undefined/NaN token`, !!txt && !/undefined|NaN/.test(txt));
    checkTrue(`battle: ${label} spoil falls through to the cleaned-out (least-claiming) framing`, isCleanedOut(txt));
  }

  // FIX-07: the loser-addressed composite rendering (the SEPARATE if/else chain further down in
  // src/ui/util.js) gets its own coverage for the empty-hold case, so it cannot regress silently.
  {
    const LOSER = 1; // e.a=0/e.d=1/winner=0 -> seat 1 is the loser
    const txt = f(mkEvent("5 coins", null, false), at, 0, LOSER).txt;
    checkTrue("battle FIX-07 [empty-hold case, loser-addressed composite]: renders the give-up framing", isGiveUp(txt));
    checkTrue("battle FIX-07 [empty-hold case, loser-addressed composite]: does NOT render the bribe framing", !isBribe(txt));
    checkTrue("battle FIX-07 [empty-hold case, loser-addressed composite]: does NOT render the cleaned-out framing", !isCleanedOut(txt));
    checkTrue("battle FIX-07 [empty-hold case, loser-addressed composite]: the ruled literal 'ye give up 5🌕.' appears verbatim", txt.includes("ye give up 5🌕."));
  }
}

/* ---------- D-54 (Wyatt-approved 2026-07-29): the LOSER's own view, pinned byte-for-byte ----------
   Source of truth: .planning/phases/15-narration-audit-fixes/15-ADDRESSED2-APPROVED.json rows
   table:battle / table:battle~cleaned / table:battle~crate, plus adhoc:src/ui/flow.js:901.
   His three battle rewrites all name the WINNER and join into ONE sentence, unlike the
   winner-addressed and neutral renderings — which this block also pins as unchanged.

   Two mechanical notes on how the expected literals are built, both deliberate:
   - Names go through pn(), the same helper the builder itself uses and the single source of truth
     for how a name is coloured and escaped (cf. this file's dock assertion, which pins pname()'s
     escaping the same way). Hardcoding pn()'s <b style> markup here would pin the styling instead
     of the copy, and would break on any future palette change.
   - The score slot is ALWAYS attacker–defender order, never winner-first — that is pre-existing
     shipped behaviour of the shared head and is out of scope here. So the fabricated event makes
     the ATTACKER the winner (seat 1, "Crustbeard" — the name the audit page itself sampled), which
     is what reproduces his approved "wins 2–1". {coin} -> 🌕 per D-50. */
{
  const f = EVENT_NARRATION.battle;
  // attacker = seat 1 (Crustbeard) and also the winner; defender = seat 0 (Davy Scones), the loser.
  // aP=2, dP=1 -> the head reads "Crustbeard wins 2–1", exactly his approved sample.
  const mk = (spoil, spoilIng = null) => ({
    t: "battle", a: 1, d: 0, winner: 1, spoil, spoilIng,
    rounds: [[true, false, false, "a"], [false, true, false, "d"], [true, false, false, "a"]],
  });
  const WINNER = 1, LOSER = 0, SPECTATOR = 2;
  const W = pn(1), L = pn(0);

  check("D-54 battle (loser's view, bribe): matches Wyatt's approved line",
    f(mk("5🌕"), at, 0, LOSER).txt,
    `⚔️ ${W} wins 2–1 — ye bribe yer way out of givin' away a crate with 5🌕.`);
  check("D-54 battle~cleaned (loser's view): matches Wyatt's approved line",
    f(mk("2🌕"), at, 0, LOSER).txt,
    `⚔️ ${W} wins 2–1 — ye give up all ye have: 2🌕.`);
  // ~crate: the possessive "takes yer" carries the ingredient's custom art. Note the deliberate
  // ABSENT trailing period.
  //
  // G3 (Wyatt-approved 2026-07-30) — FIXTURE REPAIRED, assertion not loosened, for the same reason
  // as the ingredient-spoil check above: this event paired a hand-written placeholder spoil with
  // spoilIng:"cacao", and "cacao" is not even an ingredient key the game has — the real one is
  // "cocoa" (ING_ALL). So it fabricated a spoil the game cannot emit FOR a crate the game does not
  // carry. Both halves are now real: a live key, and the spoil its emit sites actually produce.
  check("D-54 battle~crate (loser's view): matches Wyatt's approved line, no trailing period",
    f(mk(ilabelImg("cocoa"), "cocoa"), at, 0, LOSER).txt,
    `⚔️ ${W} wins 2–1 and takes yer ${ilabelImg("cocoa")}`);

  // the other two viewers are deliberately NOT restructured — still two sentences, and the bribe
  // clause still keys on viewerIsLoser, so the winner reads the third-person form of it
  check("D-54: the winner-addressed rendering is unchanged (two sentences)",
    f(mk("5🌕"), at, 0, WINNER).txt,
    `⚔️ ${W} — ye win 2–1. ${L} bribes their way out of giving away a crate with 5🌕.`);
  check("D-54: the viewer-neutral rendering is unchanged (two sentences)",
    f(mk("5🌕"), at, 0, NEUTRAL_VIEWER).txt,
    `⚔️ ${W} wins 2–1. ${L} bribes their way out of giving away a crate with 5🌕.`);
  checkTrue("D-54: a spectator seat still reads the viewer-neutral rendering",
    f(mk("5🌕"), at, 0, SPECTATOR).txt === f(mk("5🌕"), at, 0, NEUTRAL_VIEWER).txt);

  // the spoilN/isBribe guard survives the new branch — no NaN in the loser's composite either
  for (const [label, spoil] of [["absent", undefined], ["empty", ""], ["non-numeric", "abc coins"]]) {
    const txt = f(mk(spoil), at, 0, LOSER).txt;
    checkTrue(`D-54: ${label} spoil still falls through to the loser's cleaned-out framing, no NaN`,
      /ye give up all ye have/.test(txt) && !/undefined|NaN/.test(txt));
  }

  // adhoc:src/ui/flow.js:901 — the called captain's side-bet variant. flow.js's flash() sites are
  // not table-driven, so pin the shipped literal in source (same technique as this file's other
  // source-grep assertions).
  {
    const src = readFileSync(new URL("../src/ui/flow.js", import.meta.url), "utf8");
    checkTrue("D-54 adhoc flow.js:901: the called captain's side-bet variant ends 'bets N🌕 on it!'",
      src.includes("calls ye to win and bets ${amt}\u{1F315} on it!"));
    checkTrue("D-54: the free-call sibling is untouched (matches its own approved row already)",
      src.includes("calls ye to win from the crow's nest."));
  }
}

/* ---------- D-17 (Wyatt-approved 2026-07-29): fmtItem() renders ingredients as custom art --------
   The gap: fmtItem() was byte-unchanged since before Phase 15 and still emitted ING_EMOJI[x]. None
   of the 7 in-play ingredient emoji are EMOJI_IMG keys, so emojify() could not rescue them
   downstream — they reached the screen as raw system glyphs beside custom coin art.

   This block pins the fix AND all three of its traps: the coin branch must stay first, the
   ING_IMG guard must keep non-key inputs byte-identical, and the emitted src must be the SAME
   file the islands and the captain's box draw (D-17's own stated verification). */
{
  // --- the fix itself, across every in-play ingredient, not just one sample ---
  const RAW_ING_EMOJI = /[\u{1F33E}\u{1F95B}\u{1F36C}\u{1F95A}\u{1F36B}\u{1F336}\u{1F33C}]/u;
  for (const key of ING_ALL) {
    const out = fmtItem(key);
    check(`D-17 fmtItem(${key}): equals ilabelImg(${key}) — the shared custom-art helper`,
      out, ilabelImg(key));
    checkTrue(`D-17 fmtItem(${key}): emits no raw system ingredient emoji`, !RAW_ING_EMOJI.test(out));
    // D-17's own stated check: the inline src is the island / captain's-box asset, not a lookalike
    checkTrue(`D-17 fmtItem(${key}): src is ING_IMG.${key}, the same asset the board draws`,
      out.includes(`src="${ING_IMG[key]}"`));
    checkTrue(`D-17 fmtItem(${key}): carries the narrIcon class`, out.includes('class="narrIcon"'));
  }

  // --- trap 1: the /coin/ branch stays FIRST and unchanged ---
  check("D-17 trap 1: fmtItem('2 coins') unchanged (coin branch leads)", fmtItem("2 coins"), "2🌕");
  check("D-17 trap 1: fmtItem('coins') unchanged", fmtItem("coins"), "🌕");
  // offerLabel composes a DISPLAY string, not an ingredient key — it must not be re-looked-up
  check("D-17 trap 1: fmtItem('Toasty Wheat + 2 coins') unchanged (composite display label)",
    fmtItem("Toasty Wheat + 2 coins"), "Toasty Wheat + 2🌕");

  // --- trap 2: the ING_IMG guard keeps every non-key input byte-identical, never <img src=undefined>
  for (const probe of ["nothing", "Toasty Wheat", "", "Crystal Sugar"]) {
    const out = fmtItem(probe);
    checkTrue(`D-17 trap 2: fmtItem(${JSON.stringify(probe)}) emits no <img src="undefined">`,
      !/undefined/.test(out) && !/<img/.test(out));
  }
  // "nothing" is emitted at three src/ui/flow.js sites; pin its exact pre-change output
  check("D-17 trap 2: fmtItem('nothing') is byte-identical to its pre-change output",
    fmtItem("nothing"), " nothing");

  // --- the end-to-end effect: a rendered trade line carries art, not emoji ---
  {
    const t = EVENT_NARRATION.trade({ t: "trade", a: 0, b: 1, gave: "wheat", got: "sugar" }, at, 0, NEUTRAL_VIEWER);
    check("D-17: a rendered trade event's text carries exactly 2 narrIcon images",
      (t.txt.match(/class="narrIcon"/g) || []).length, 2);
    checkTrue("D-17: a rendered trade event's text carries zero raw ingredient emoji",
      !RAW_ING_EMOJI.test(t.txt));
  }
}

/* ---------- Plan 15-04 Task 1 (NARR-01 audit finding): shotclockskip narrates from the table ----------
   src/orchestrator.js's expireShotClock() no longer hand-writes text — it awaits
   narrateLastEvent(), which reads through EVENT_NARRATION.shotclockskip.

   REWRITTEN 2026-07-30 (Wyatt removed both 30-second resource penalties — see expireShotClock).
   The old block pinned the two literal shapes this event used to carry, `ing` and `coins`. Those
   shapes no longer exist, and a pin on a shape records BEHAVIOUR rather than INTENT — exactly the
   trap 15-LEARNINGS #3 describes, where narration_flow_test.js:68-73 had frozen a bug in place and
   went red when it was fixed. So this asserts the INVARIANT instead: the event carries no resource
   field, and the rendered line must not claim a resource was lost. That stays true if the wording
   is retuned again, and goes red the moment a penalty is reinstated without the copy following it. */
{
  const f = EVENT_NARRATION.shotclockskip;
  const e = { t: "shotclockskip", p: 0 };
  const selfTxt = f(e, at, 0, 0).txt;      // the timed-out captain's own view
  const otherTxt = f(e, at, 0, 1).txt;     // everyone else's view
  checkTrue("shotclockskip: addressed wording is non-empty with no undefined token", !!selfTxt && !/undefined/.test(selfTxt));
  checkTrue("shotclockskip: named wording is non-empty with no undefined token", !!otherTxt && !/undefined/.test(otherTxt));
  checkTrue("shotclockskip: the two viewer variants actually differ (D-08)", selfTxt !== otherTxt);
  // the penalty is gone, so the line must not say anything left the player
  const claimsLoss = /overboard|treasure|tumbles|crate of|🌕/.test(selfTxt + otherTxt);
  checkTrue("shotclockskip: no line claims a crate or coins were lost", !claimsLoss);
  // ...and it must still say the turn was lost, which IS what happens
  checkTrue("shotclockskip: both variants still name the lost turn", /turn/.test(selfTxt) && /turn/.test(otherTxt));
  // nothing goes overboard any more, so nothing splashes
  checkTrue("shotclockskip: no pops (nothing goes overboard)", !f(e, at, 0, 0).pops);
}

/* ---------- Plan 15-04 Task 2 (D-07/D-09): viewer-aware branches across the single-subject table ----------
   Iterates the table generically instead of asserting entry by entry: every key must still be
   callable with no throw; the viewer-neutral rendering must stay non-empty (except the keys
   documented as producing no text) and undefined-token-free; and for every one of the 16 keys this
   task covers, the addressed rendering must differ from the viewer-neutral rendering. `newround`
   (D-09) is pinned identical with and without a viewer seat — it never gains a branch. */
{
  const COVERED_SINGLE_SUBJECT = [
    "blownOut", "sail", "anchor", "moored", "blocked", "anchorHold", "tradewind",
    "aground", "shipwrecked", "dock", "sidebet", "fish", "finish", "shotclock", "shotclockskip",
  ];
  check("COVERED_SINGLE_SUBJECT has exactly 15 keys (FIX-04 moved windmove to SILENT_KEYS, dropping this from 16)", COVERED_SINGLE_SUBJECT.length, 15);
  // FIX-04: windmove joins turn/end as silent — describeFor() returns null for it on every viewer,
  // per D-07/NARR-05 (both addressed and neutral variants removed together).
  const SILENT_KEYS = new Set(["turn", "end", "windmove"]); // documented as producing no captain's-log line (or none in this fabricated shape)

  for (const key of KEYS) {
    const fab = FAB[key];
    let result, threw = false;
    try { result = EVENT_NARRATION[key](fab, at); } catch (e) { threw = true; }
    checkTrue(`viewer-neutral (post-Task2): EVENT_NARRATION.${key}(...) does not throw`, !threw);
    if (threw) continue;
    const txt = result && result.txt;
    if (!SILENT_KEYS.has(key)) {
      checkTrue(`viewer-neutral (post-Task2): EVENT_NARRATION.${key} renders non-empty text`, !!txt);
      checkTrue(`viewer-neutral (post-Task2): EVENT_NARRATION.${key} contains no JS undefined token`, !txt || !/undefined/.test(txt));
    }
  }

  for (const key of COVERED_SINGLE_SUBJECT) {
    const fab = FAB[key];
    const neutralTxt = describeFor(fab, NEUTRAL_VIEWER).txt;
    const addressedTxt = describeFor(fab, fab.p).txt;
    checkTrue(`${key}: addressed rendering differs from the viewer-neutral rendering`, addressedTxt !== neutralTxt);
    checkTrue(`${key}: addressed rendering is non-empty with no JS undefined token`, !!addressedTxt && !/undefined/.test(addressedTxt));
    checkTrue(`${key}: viewer-neutral rendering is non-empty with no JS undefined token`, !!neutralTxt && !/undefined/.test(neutralTxt));
  }

  // FIX-04: the windmove builder is silenced (no txt), but the Captains-box capsule survives, and
  // describeFor() returns null for BOTH the neutral and the addressed viewer — the addressed variant
  // is gone too, not just the third-person one (D-07/NARR-05 requires both together).
  {
    const windmoveFab = FAB.windmove;
    const raw = EVENT_NARRATION.windmove(windmoveFab, at);
    checkTrue("windmove: the builder produces no narration text", !raw.txt);
    check("windmove: the builder's caps array has exactly one entry", (raw.caps || []).length, 1);
    checkTrue("windmove: describeFor(e, NEUTRAL_VIEWER) is null", describeFor(windmoveFab, NEUTRAL_VIEWER) === null);
    checkTrue("windmove: describeFor(e, addressedSeat) is null too — both variants gone together", describeFor(windmoveFab, windmoveFab.p) === null);
  }

  // D-09: newround gets NO viewer branch at all — identical with and without a viewer seat
  const newroundFab = FAB.newround;
  check("newround: rendering identical with a viewer seat (0) and without one (undefined)",
    describeFor(newroundFab, 0).txt, describeFor(newroundFab, undefined).txt);
  check("newround: rendering identical with NEUTRAL_VIEWER too",
    describeFor(newroundFab, NEUTRAL_VIEWER).txt, describeFor(newroundFab, 1).txt);

  // moored invariants (mirrors assertion 3 / bot_storm_narration_test.js) must survive byte-identical
  {
    const f = EVENT_NARRATION.moored;
    const justDocked = f({ t: "moored", p: 0, reason: "justDocked" }, at).txt;
    const home = f({ t: "moored", p: 0, reason: "home" }, at).txt;
    check("moored (post-Task2, appState.mySeat unset): reason justDocked and reason home render the identical line", justDocked, home);
    const bare = f({ t: "moored", p: 0 }, at).txt;
    checkTrue("moored (post-Task2, appState.mySeat unset): a no-reason event renders a real (non-empty, non-undefined) line", !!bare && !/undefined/.test(bare));
    const dockLine = f({ t: "moored", p: 0, reason: "dock" }, at).txt;
    check("moored (post-Task2, appState.mySeat unset): reason \"dock\" with no position evidence renders the \"still docked\" line, not the shove line", dockLine, justDocked);
  }

  // Object.keys(EVENT_NARRATION).length still 25 — no key added or removed
  check("EVENT_NARRATION still has exactly 25 keys after Task 2", Object.keys(EVENT_NARRATION).length, 25);

  // describe(e) with appState.mySeat null equals describeFor(e, NEUTRAL_VIEWER) for every key
  for (const key of KEYS) {
    const fab = FAB[key];
    const d = describe(fab);
    const n = describeFor(fab, NEUTRAL_VIEWER);
    check(`describe(): ${key} equals describeFor(e, NEUTRAL_VIEWER) with appState.mySeat unset`, d ? d.txt : null, n ? n.txt : null);
  }

  // caps/pops are unchanged by addressing — the viewer only ever selects .txt
  for (const key of COVERED_SINGLE_SUBJECT) {
    const fab = FAB[key];
    const neutralResult = EVENT_NARRATION[key](fab, at, 0);
    const addressedResult = EVENT_NARRATION[key](fab, at, 0, fab.p);
    check(`${key}: caps array unchanged by addressing`, JSON.stringify(addressedResult.caps || []), JSON.stringify(neutralResult.caps || []));
    check(`${key}: pops array unchanged by addressing`, JSON.stringify(addressedResult.pops || []), JSON.stringify(neutralResult.pops || []));
  }
}

/* ---------- Plan 15-04 Task 3 (D-08): two-party viewer-aware branches + payload ordering ----------
   parley/trade/battle/battleflee/bakeoff/blocked each name TWO seats; this block proves each is
   addressed independently, narrationVariants() emits one deterministic {seat,html} entry per named
   seat (never more than one per seat), and pickNarrVariant() routes each seat to its own line. */
{
  const battleEvent = { t: "battle", a: 0, d: 2, winner: 0, rounds: [[true, false, false, "a"]], spoil: "5 coins", spoilIng: null };
  const neutral = describeFor(battleEvent, NEUTRAL_VIEWER).txt;
  const forAttacker = describeFor(battleEvent, 0).txt;
  const forDefender = describeFor(battleEvent, 2).txt;
  checkTrue("battle: viewer 0 (attacker), viewer 2 (defender), and the neutral rendering are pairwise distinct",
    neutral !== forAttacker && neutral !== forDefender && forAttacker !== forDefender);
  checkTrue("battle: attacker's addressed rendering is non-empty with no JS undefined token", !!forAttacker && !/undefined/.test(forAttacker));
  checkTrue("battle: defender's addressed rendering is non-empty with no JS undefined token", !!forDefender && !/undefined/.test(forDefender));
  checkTrue("battle: a third seat (1) sees the viewer-neutral rendering", describeFor(battleEvent, 1).txt === neutral);

  const variants = narrationVariants(battleEvent);
  check("narrationVariants(battleEvent): exactly 2 entries", variants.length, 2);
  checkTrue("narrationVariants(battleEvent): seats are exactly the attacker (0) and defender (2), sorted ascending",
    variants.length === 2 && variants[0].seat === 0 && variants[1].seat === 2);
  check("narrationVariants: calling it twice on the same event is deep-equal, including order",
    JSON.stringify(narrationVariants(battleEvent)), JSON.stringify(variants));

  for (const key of ["parley", "trade", "battle", "battleflee", "bakeoff", "blocked"]) {
    const fab = FAB[key];
    const v = narrationVariants(fab);
    const seats = v.map(x => x.seat);
    check(`narrationVariants: ${key} emits at most one entry per seat`, seats.length, new Set(seats).size);
  }

  check("pickNarrVariant: the attacker's seat gets the attacker's addressed text", pickNarrVariant({ html: neutral, variants }, 0), variants.find(x => x.seat === 0).html);
  check("pickNarrVariant: the defender's seat gets the defender's addressed text", pickNarrVariant({ html: neutral, variants }, 2), variants.find(x => x.seat === 2).html);
  check("pickNarrVariant: a third seat gets the viewer-neutral text", pickNarrVariant({ html: neutral, variants }, 1), neutral);

  // each two-party entry is addressed independently for BOTH named seats (D-08 in full)
  //
  // EXCEPTION — `bakeoff`'s seat B. Wyatt's approved loser wording (D-54,
  // 15-ADDRESSED2-APPROVED.json) keeps BOTH captains named: "BAKEOFF! {a} vs {b} — {winner} takes
  // it!". In a bakeoff the matchup is the drama, and turning the loser into "ye" flattens one of the
  // two names exactly when the pairing is the point. That makes the loser's rendering deliberately
  // IDENTICAL to the spectator's, so the differs-from-neutral rule below does not apply to it.
  // This is a copy decision, not a missing variant: seat A (the winner) still reads "ye take it!".
  const SEAT_B_MATCHES_NEUTRAL = new Set(["bakeoff"]);
  for (const key of ["parley", "trade", "battleflee", "bakeoff", "blocked"]) {
    const fab = FAB[key];
    const seatA = key === "blocked" ? fab.p : fab.a;
    const seatB = key === "blocked" ? fab.other : (fab.b != null ? fab.b : fab.d);
    const neutralTxt = describeFor(fab, NEUTRAL_VIEWER).txt;
    checkTrue(`${key}: seat A's addressed rendering differs from the viewer-neutral rendering`, describeFor(fab, seatA).txt !== neutralTxt);
    if (SEAT_B_MATCHES_NEUTRAL.has(key)) {
      checkTrue(`${key}: seat B intentionally matches the viewer-neutral rendering (D-54 — both captains stay named)`, describeFor(fab, seatB).txt === neutralTxt);
    } else {
      checkTrue(`${key}: seat B's addressed rendering differs from the viewer-neutral rendering`, describeFor(fab, seatB).txt !== neutralTxt);
    }
  }
}

/* ============================================================================
 * F11 / D-41 — CO-REACHABILITY: the greyed Trade button's reason must be reachable
 * in the state it explains, headlessly.
 *
 * The 2026-07-29 two-tab playtest found the greyed Trade button rendering with
 * ATTACK's helper text beneath it while Attack was enabled. humanAct() assigned its
 * helper text across an if/else-if chain whose two conditions are INDEPENDENT —
 * whether an enemy is adjacent says nothing about whether anyone holds cargo — so
 * Wyatt's approved cargo reason, sitting in the `else` arm, was unreachable whenever
 * an attack target happened to be adjacent.
 *
 * This pins the OBSERVABLE the playtest found missing, with no browser: run the real
 * assignment chain out of the shipped source, in the exact state "attack target
 * adjacent AND nobody holds cargo", and require the cargo reason to be present. The
 * chain is READ FROM SOURCE rather than imported, the same discipline the rest of
 * this harness already uses for src/ui/flow.js's flash() sites.
 *
 * scripts/ui_contract_check.js assertion 6 gates the SHAPE; this pins the RESULT.
 * ==========================================================================*/
{
  console.log("\nF11/D-41 — the greyed Trade reason is co-reachable with an adjacent attack target:");
  const flowSrc = readFileSync(new URL("../src/ui/flow.js", import.meta.url), "utf8").split("\n");
  const start = flowSrc.findIndex((l) => /^\s*let sub=null;/.test(l));
  checkTrue("humanAct()'s helper-text assignment is still locatable in the shipped source", start >= 0);
  if (start >= 0) {
    // every `sub=` assignment from the declaration up to the ask() call that consumes it
    const askAt = flowSrc.findIndex((l, i) => i > start && /await ask\(prompt,opts,null,sub\)/.test(l));
    checkTrue("the ask() call that consumes it is still locatable", askAt > start);
    const body = flowSrc.slice(start, askAt).filter((l) => !/^\s*\/\//.test(l) && /\bsub\s*=(?!=)/.test(l)).join("\n");
    // NOT an else-if chain any more — an independent-condition chain, which is the fix
    checkTrue("the cargo reason is no longer in an else-if arm (an adjacent enemy cannot suppress it)",
      !/else\s+if\s*\([^)]*tradeOpp/.test(flowSrc.slice(start, askAt).join("\n")));
    checkTrue("the cargo reason has not vanished from the chain entirely", /tradeOpp/.test(body));

    const runChain = ({ targets, canAfford, canTrade }) => {
      const appStateStub = { game: { cfg: { powder: 2 }, tradeOpp: () => [{ idx: 1 }] } };
      // eslint-disable-next-line no-new-func
      // `p` is the acting player; the chain only ever passes it to tradeOpp(), whose result the
      // stub supplies, so a bare seat object is enough to run the real assignment lines.
      const fn = new Function("targets", "canAfford", "canTrade", "appState", "p", `"use strict"; ${body}\nreturn sub;`);
      return fn(targets, canAfford, canTrade, appStateStub, { idx: 0 });
    };
    const CARGO = "No one's holding cargo to trade for yet.";
    const POWDER = "Yer too poor to afford powder!";

    // THE STATE THE PLAYTEST HIT: a target is adjacent, Attack is affordable (so enabled), and
    // nobody holds cargo (so Trade is greyed). Before the fix this rendered Attack's tip instead.
    const f11 = runChain({ targets: [{ idx: 1 }], canAfford: true, canTrade: false });
    checkTrue(`with an attack target adjacent AND nobody holding cargo, the helper text contains "${CARGO}"`,
      typeof f11 === "string" && f11.includes(CARGO));

    // both greyed -> BOTH reasons, blocked-action reason first, neither silently dropped
    const both = runChain({ targets: [{ idx: 1 }], canAfford: false, canTrade: false });
    checkTrue("with BOTH controls greyed, both reasons are present rather than one being dropped",
      typeof both === "string" && both.includes(POWDER) && both.includes(CARGO));
    checkTrue("with BOTH greyed, the blocked-action reason comes first", typeof both === "string" && both.indexOf(POWDER) < both.indexOf(CARGO));

    // nothing greyed -> the informational Attack tip still fires (the fix did not delete it)
    const tip = runChain({ targets: [{ idx: 1 }], canAfford: true, canTrade: true });
    checkTrue("with nothing greyed, Attack's informational tip still renders", typeof tip === "string" && /Attacking costs ye/.test(tip));

    // no target, cargo available -> deliberately silent, nothing to explain
    checkTrue("with no target and cargo available, no helper text renders at all",
      runChain({ targets: [], canAfford: true, canTrade: true }) == null);
  }
}

/* ============================================================================
 * F7 / D-10 — DELIVERY: the actor gets the prompt, spectators get the spectator line,
 * asserted PER SEAT, headlessly.
 *
 * A single broadcast reaches every client, so content that branches on the local
 * viewer can never be right. ask() used to send
 * `seat===appState.mySeat?msg:spectatorLine` — and ask() runs on the HOST, so
 * `mySeat` is the host's seat and whichever branch the host took went to the whole
 * table. Measured on a guest during the playtest: the host's raw prompts arrived
 * verbatim, and of 2516 recorded narration lines ZERO contained "is deciding".
 *
 * The fix routes all three sites through the D-10 neutral-plus-variants shape. This
 * pins the observable the guest recording showed missing: pickNarrVariant — the exact
 * selector both the host's own panel and every guest's watchNarr use — must resolve
 * the ACTOR's seat to the prompt and a SPECTATOR's seat to the spectator line, from
 * ONE payload.
 *
 * ui_contract_check.js assertion 7 gates the SHAPE at all three sites; this pins the
 * per-seat RESULT.
 * ==========================================================================*/
{
  console.log("\nF7/D-10 — one broadcast, per-seat delivery (actor gets the prompt, spectators get the spectator line):");
  const ACTOR = 2, SPECTATOR = 0, OTHER = 3;

  // ---- ask(): the payload the converted call builds ----
  const prompt = `${pn(ACTOR)}, what'll ye do:`;
  const spectatorLine = `${pn(ACTOR)} is deciding…`;
  const askPayload = { html: spectatorLine, variants: [{ seat: ACTOR, html: prompt }] };
  check("ask(): the ACTOR's seat resolves to the prompt", pickNarrVariant(askPayload, ACTOR), prompt);
  check("ask(): a SPECTATOR's seat resolves to the spectator line", pickNarrVariant(askPayload, SPECTATOR), spectatorLine);
  check("ask(): another spectator resolves to the same spectator line", pickNarrVariant(askPayload, OTHER), spectatorLine);
  checkTrue("ask(): the BROADCAST content is the spectator line, not the raw prompt — a guest can never receive the prompt verbatim",
    askPayload.html === spectatorLine && !askPayload.html.includes("what'll ye do"));
  checkTrue("ask(): the spectator line is the thing the guest recording showed missing (\"is deciding\")", /is deciding/.test(askPayload.html));

  // ---- pickCell(): same shape, and the actor's variant is deliberately the empty string ----
  const sailSpect = `${pn(ACTOR)} is choosing where to sail…`;
  const sailPayload = { html: sailSpect, variants: [{ seat: ACTOR, html: "" }] };
  check("pickCell(): the ACTOR's seat resolves to the empty string (their own board highlighting is the feedback)", pickNarrVariant(sailPayload, ACTOR), "");
  check("pickCell(): a SPECTATOR's seat resolves to the spectator line", pickNarrVariant(sailPayload, SPECTATOR), sailSpect);

  // ---- asyncBattle(): the defender is asked, so the attacker is a spectator of that decision ----
  const battlePrompt = "Defend or flee?";
  const battleSpect = `⚔️ ${pn(SPECTATOR)} attacks ${pn(ACTOR)}! Waiting for ${pname(ACTOR)} to defend…`;
  const battlePayload = { html: battleSpect, variants: [{ seat: ACTOR, html: battlePrompt }] };
  check("asyncBattle(): the asked seat resolves to its own prompt", pickNarrVariant(battlePayload, ACTOR), battlePrompt);
  check("asyncBattle(): the OTHER combatant resolves to the battle-aware spectator line", pickNarrVariant(battlePayload, SPECTATOR), battleSpect);
  check("asyncBattle(): an uninvolved seat resolves to the same spectator line", pickNarrVariant(battlePayload, OTHER), battleSpect);

  // ---- and the property that makes this a rule rather than three patches ----
  checkTrue("one payload serves every seat — no per-viewer difference is decided before the broadcast",
    [ACTOR, SPECTATOR, OTHER].every((s) => typeof pickNarrVariant(askPayload, s) === "string"));
  // an unset local seat (a fresh client, or an out-of-game caller) must still get the neutral content
  check("a client whose seat is not yet known still receives the neutral spectator line", pickNarrVariant(askPayload, null), spectatorLine);
}

/* ---------- F5: the dock-flavour icon insertion point is DECLARED IN DATA ---------- */
// The comparison input is a HARDCODED copy of the pre-change literals. It is deliberately NOT
// re-derived from DOCK_FLAVOR: an expectation built from the new structure would be comparing the
// change to itself and could only ever pass.
const DOCK_FLAVOR_BEFORE = {
  sugar: "a jar of Crystal Sugar",
  vanilla: "a bundle of Velvety Vanilla Beans",
  spice: "sprigs of Red-Hot Cinnamon",
  wheat: "a sack of Toasty Wheat",
  dairy: "some jugs of Fresh Milk",
  eggs: "a dozen Sand-Speckled Eggs",
  cocoa: "a pod of Luscious Cacao Beans",
};
{
  // 1. dockFlavor() is unchanged in value — the seven `misc:dockFlavor:<ing>` audit cards render it
  //    directly, so Wyatt's seven reviewed rows must read exactly as they did before F5.
  for (const [ing, want] of Object.entries(DOCK_FLAVOR_BEFORE)) {
    check(`F5: dockFlavor("${ing}") is byte-identical to the pre-change literal`, dockFlavor(ing), want);
  }

  // 2. dockFlavorIcon() differs from dockFlavor() by NOTHING BUT the inserted icon. Proven by
  //    stripping the icon back out — so a silently dropped icon or a lost word fails here rather
  //    than passing as "text unchanged" (D-16).
  for (const ing of Object.keys(DOCK_FLAVOR_BEFORE)) {
    const withIcon = dockFlavorIcon(ing);
    const icon = iconImg(ING_IMG[ing]);
    checkTrue(`F5/D-16: dockFlavorIcon("${ing}") still carries the ingredient's icon`, withIcon.includes(icon));
    const stripped = withIcon.split(icon).join(" ").replace(/\s+/g, " ").trim();
    check(`F5: dockFlavorIcon("${ing}") strips back to exactly dockFlavor("${ing}") — the icon is the only difference`, stripped, DOCK_FLAVOR_BEFORE[ing]);

    // 3. and the icon sits BETWEEN the prefix and the name, not floated to the front of the clause
    //    — which is the whole point of F5.
    check(`F5: dockFlavorIcon("${ing}") does not put the icon before the whole clause`, withIcon.trim().startsWith(icon), false);
    const prefix = withIcon.slice(0, withIcon.indexOf(icon)).trim();
    checkTrue(`F5: dockFlavorIcon("${ing}") has a prefix (${JSON.stringify(prefix)}) before the icon, and it is the original phrase's own opening`, !!prefix && DOCK_FLAVOR_BEFORE[ing].startsWith(prefix));
    // the name follows the icon, and it is the remainder of the original phrase
    const name = withIcon.slice(withIcon.indexOf(icon) + icon.length).trim();
    check(`F5: dockFlavorIcon("${ing}") puts the icon directly before the ingredient NAME`, `${prefix} ${name}`, DOCK_FLAVOR_BEFORE[ing]);
  }

  // 4. an unknown key survives on both helpers rather than throwing
  let unknownThrew = false;
  try { dockFlavor("nonsuch"); dockFlavorIcon("nonsuch"); } catch { unknownThrew = true; }
  check("F5: an unknown ingredient key falls back on BOTH helpers without throwing", unknownThrew, false);
}

/* ---------- F5 + F10: the four dock branches ---------- */
// F5 — the icon sits directly before the ingredient NAME on every branch that names goods.
// F10 — the addressed bought/coins/empty lines name their place AND their goods, so no pronoun is
//       left without an antecedent (D-46's letter: only `ing` loses its place clause).
{
  appState.roster = [{ id: "a", name: "Claude" }, { id: "b", name: "Wyatt" }, {}, {}];
  const at = () => [0, 0];
  const stripIcons = (s) => s.replace(/<img[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const render = (ing, got, viewer) =>
    EVENT_NARRATION.dock({ t: "dock", p: 0, ing, got, heads: got === "ing" ? 1 : 0 }, at, 0, viewer).txt;
  const NAME = `<b style="color:${HEXCOL[0]}">Claude</b>`;

  // ---- the PRE-CHANGE neutral text, hardcoded for one ingredient. Icon markup stripped and
  // whitespace collapsed, so it is identical before and after F5 by construction: F5 MOVES the icon
  // and changes no word. A hardcoded literal is the only expectation that cannot pass by comparing
  // the change to itself.
  const DAIRY_NEUTRAL_BEFORE = {
    ing: `${NAME} docks at Full Cream Folly and flips ⚪ HEADS — hauls aboard some jugs of Fresh Milk!`,
    empty: `${NAME} docks at Full Cream Folly and finds no Fresh Milk, so grabs 3🌕`,
    bought: `${NAME} docks at Full Cream Folly for some jugs of Fresh Milk and flips ⚫ TAILS, but buys it anyway for 3🌕`,
    coins: `${NAME} docks at Full Cream Folly for some jugs of Fresh Milk, but flips ⚫ TAILS and takes 3🌕`,
  };
  for (const [got, want] of Object.entries(DAIRY_NEUTRAL_BEFORE)) {
    check(`F5: the neutral dock "${got}" line is its pre-change self with the icon moved and NOTHING else`, stripIcons(render("dairy", got, NEUTRAL_VIEWER)), want);
  }

  // ---- G1 (Wyatt-approved 2026-07-30): the addressed lines, written out in full. RE-PINNED from
  // F10's forms, which restored the place clause in order to give `bought`'s "it" an antecedent.
  // The dangling pronoun was the real defect; the place was never the fix. Each literal below now
  // protects TWO things at once: that the addressed line carries NO place clause, and — for
  // `bought` — that it still names its goods, so no pronoun is left without an antecedent.
  // Written as literals so a future re-restoration of the place clause fails here, loudly.
  check("G1: the addressed dock \"bought\" line carries NO place clause, and names its goods in place of the pronoun so \"it\" is gone entirely",
    stripIcons(render("dairy", "bought", 0)),
    `${NAME} — ye flip ⚫ TAILS, but buy some jugs of Fresh Milk anyway for 3🌕`);
  check("G1: the addressed dock \"coins\" line carries no place clause and needs no goods — nothing was hauled",
    stripIcons(render("dairy", "coins", 0)),
    `${NAME} — ye flip ⚫ TAILS and take 3🌕`);
  check("G1: the addressed dock \"empty\" line carries no place clause (back to its shorter pre-F10 form, at Wyatt's explicit ask)",
    stripIcons(render("dairy", "empty", 0)),
    `${NAME} — ye find no Fresh Milk, so ye grab 3🌕`);
  // G1's rule, asserted directly rather than only as a by-product of the four literals above: no
  // addressed dock branch may name the place. The actor read it on the Dock button and the flip
  // prompt already. This is the check that catches a NEW addressed branch reintroducing the clause.
  {
    let placeBad = null;
    for (const ing of ING_ALL) {
      const place = dockPlace(ing);
      for (const got of ["ing", "empty", "bought", "coins"]) {
        if (stripIcons(render(ing, got, 0)).includes(place)) placeBad = placeBad || `${ing}/${got} still names "${place}"`;
      }
    }
    check(`G1: no addressed dock branch names its place, on any of the 7 ingredients${placeBad ? ` — ${placeBad}` : ""}`, placeBad, null);
  }
  // D-46's single sanctioned cut: `ing` alone still drops the place and leads with the payoff.
  check("D-46: the addressed dock \"ing\" line STILL drops the place clause and leads with the payoff — the one cut D-46 sanctioned",
    stripIcons(render("dairy", "ing", 0)),
    `${NAME} — ye haul aboard some jugs of Fresh Milk!`);

  // ---- structural equality across all 7 ingredients x 4 branches x both viewer forms. The sentence
  // SHAPES below are hardcoded pre-change templates; only the flavour/place words come from the live
  // helpers, and those are pinned byte-identical against hardcoded literals in the F5 block above.
  const NEUTRAL_SHAPE = {
    ing: (place, flavor, label) => `${NAME} docks at ${place} and flips ⚪ HEADS — hauls aboard ${flavor}!`,
    empty: (place, flavor, label) => `${NAME} docks at ${place} and finds no ${label}, so grabs 3🌕`,
    bought: (place, flavor, label) => `${NAME} docks at ${place} for ${flavor} and flips ⚫ TAILS, but buys it anyway for 3🌕`,
    coins: (place, flavor, label) => `${NAME} docks at ${place} for ${flavor}, but flips ⚫ TAILS and takes 3🌕`,
  };
  // G1 (Wyatt-approved 2026-07-30): re-pinned — no addressed branch names the place. `bought` keeps
  // its goods (F10's antecedent fix, carried forward by naming the thing rather than the place).
  const ADDRESSED_SHAPE = {
    ing: (place, flavor, label) => `${NAME} — ye haul aboard ${flavor}!`,
    empty: (place, flavor, label) => `${NAME} — ye find no ${label}, so ye grab 3🌕`,
    bought: (place, flavor, label) => `${NAME} — ye flip ⚫ TAILS, but buy ${flavor} anyway for 3🌕`,
    coins: (place, flavor, label) => `${NAME} — ye flip ⚫ TAILS and take 3🌕`,
  };
  // G1: the addressed `coins` line is the ONE cell that names no ingredient at all, so it is the one
  // cell that can carry no ingredient icon. Enumerated as a single named exception rather than
  // relaxing the D-16 assertion below to a subset-match — and paired with its own positive check,
  // so the removal is PINNED rather than merely tolerated.
  const namesIngredient = (got, addressed) => !(addressed && got === "coins");
  let shapeBad = null, iconBad = null, strayIcon = null, pairs = 0, iconCells = 0;
  for (const ing of ING_ALL) {
    const place = dockPlace(ing), flavor = dockFlavor(ing), label = iname(ing);
    for (const got of ["ing", "empty", "bought", "coins"]) {
      for (const [viewer, shape] of [[NEUTRAL_VIEWER, NEUTRAL_SHAPE], [0, ADDRESSED_SHAPE]]) {
        const raw = render(ing, got, viewer);
        const addressed = viewer !== NEUTRAL_VIEWER;
        pairs++;
        // D-16: every branch that NAMES the ingredient still carries the ingredient's icon. Asserted
        // on the IMAGE rather than on one exact markup form, because the `empty` branch renders it
        // through ilabelImg() (which carries alt text) while the goods branches use dockFlavorIcon()
        // -> iconImg() (alt=""). Both are the ingredient's icon; the playtest measured `empty` as
        // already correct, so demanding the goods-branch markup there would be wrong, not stricter.
        //
        // G1: the addressed `coins` line names no ingredient, so it carries none — an icon still
        // never goes while its subject stays, which is what D-16 protects. Both halves are checked:
        // present where the ingredient is named, ABSENT where it is not.
        if (namesIngredient(got, addressed)) {
          iconCells++;
          if (!raw.includes(ING_IMG[ing])) iconBad = iconBad || `${ing}/${got}/${addressed ? "addressed" : "neutral"}`;
        } else if (raw.includes(ING_IMG[ing])) {
          strayIcon = strayIcon || `${ing}/${got}/addressed carries an ingredient icon but names no ingredient`;
        }
        const want = shape[got](place, flavor, label);
        if (stripIcons(raw) !== want) shapeBad = shapeBad || `${ing}/${got}/${addressed ? "addressed" : "neutral"}\n      got:  ${stripIcons(raw)}\n      want: ${want}`;
      }
    }
  }
  check(`F5/G1: all ${pairs} dock renderings (7 ingredients x 4 branches x neutral+addressed) match their hardcoded sentence shape${shapeBad ? ` — FIRST MISMATCH ${shapeBad}` : ""}`, shapeBad, null);
  check(`F5/D-16: every one of the ${iconCells} renderings that names its ingredient still carries that ingredient's icon — an icon is never dropped while its subject stays${iconBad ? ` — FIRST MISSING ${iconBad}` : ""}`, iconBad, null);
  check(`G1/D-16: and the ${pairs - iconCells} addressed "coins" renderings, which name no ingredient, carry no orphaned ingredient icon either${strayIcon ? ` — ${strayIcon}` : ""}`, strayIcon, null);

  // ---- and the icon is positioned before the NAME, not before the flavour phrase, in the goods
  // branches. This is the observable difference F5 exists to produce.
  let posBad = null;
  for (const ing of ING_ALL) {
    const icon = iconImg(ING_IMG[ing]);
    for (const got of ["ing", "bought", "coins"]) {
      for (const viewer of [NEUTRAL_VIEWER, 0]) {
        // G1: the addressed `coins` line names no goods, so there is no icon here to position. Its
        // absence is pinned by the strayIcon check above, not silently skipped.
        if (!namesIngredient(got, viewer !== NEUTRAL_VIEWER)) continue;
        const raw = render(ing, got, viewer);
        const beforeIcon = raw.slice(0, raw.indexOf(icon));
        // the flavour's own prefix word(s) must already be on the page before the icon appears
        const prefix = dockFlavor(ing).split(" ")[0];
        if (!beforeIcon.includes(prefix)) posBad = posBad || `${ing}/${got}: icon appears before the flavour prefix ${JSON.stringify(prefix)}`;
      }
    }
  }
  check(`F5: in every goods branch the icon appears AFTER the flavour's opening words — i.e. immediately before the ingredient name, not in front of the phrase${posBad ? ` — ${posBad}` : ""}`, posBad, null);
}

/* ---------- F6: the narration box is never empty — a line persists until another replaces it ---------- */
// Source-text assertions over src/ui/panel.js, extracting each function's body by name. The
// assertions STRIP COMMENT LINES, because this task's own comments necessarily name the class and the
// behaviour they remove — a raw substring check would fail on its own documentation.
{
  const panelSrc = readFileSync(new URL("../src/ui/panel.js", import.meta.url), "utf8");
  const panelCode = panelSrc.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
  const bodyOf = (name) => {
    const i = panelCode.indexOf(name);
    if (i < 0) return null;
    const j = panelCode.indexOf("\nexport ", i + name.length);
    return panelCode.slice(i, j < 0 ? undefined : j);
  };
  const sn = bodyOf("export function showNarration");
  const fl = bodyOf("export async function flash");
  const cb = bodyOf("export function showChatBubble");
  checkTrue("F6: showNarration, flash and showChatBubble all located in src/ui/panel.js", !!sn && !!fl && !!cb);

  // the guest display path schedules NO timed fade and NO timed hold, so a trailing line survives
  check("F6: showNarration schedules no fade — the box is NEVER EMPTY, a line persists until another replaces it", /fadeOut/.test(sn), false);
  check("F6: showNarration holds on no timer — nothing can time out the last line", /msgHoldMs/.test(sn), false);
  check("F6: no supersession token survives with no reader — a variable nothing reads is dead code (D-33/D-34/D-40)", /_narrToken/.test(panelCode), false);
  checkTrue("F6: the EXPLICIT-clear path survives — a caller asking for an empty box is not a timer producing one", /panel\(html\?/.test(sn || ""));

  // the host path KEEPS the hold — that is what paces CONSECUTIVE lines — and loses only the clear
  checkTrue("F6: flash() STILL awaits msgHoldMs(text) — the hold is deliberately preserved, so pacing between consecutive lines is unchanged", /msgHoldMs\(text\)/.test(fl || ""));
  check("F6: flash() no longer fades to empty", /fadeOut/.test(fl || ""), false);
  check("F6: flash() no longer waits out a trailing fade — reclaims ~half a second per line (D-58)", /sleep\(500\)/.test(fl || ""), false);

  // chat bubbles are untouched (D-15), so the fade class keeps a live consumer and nothing is orphaned
  checkTrue("F6/D-15: showChatBubble keeps its own fade — the fade class still has a live consumer, nothing is orphaned", /fadeOut/.test(cb || ""));

  /* ---------- G8: the outgoing line fades when — and ONLY when — one replaces it ----------
   * Source-text assertions in the same DOM-free style as the F6 block above, because panel()
   * touches the DOM and has no headless gate. No genuine pure function falls out of this change,
   * so nothing was added to narration_flow_test.js rather than writing a test that asserts nothing.
   * These do assert something real: they catch a regression to fade-to-empty, a lost
   * pointer-events guard, a panel() that acquired an await, and a ghost with no removal path. */
  const pn8 = bodyOf("export function panel");
  checkTrue("G8: panel() clones the outgoing message into a ghost and dresses it with the fade class", /cloneNode/.test(pn8 || "") && /fadeOut/.test(pn8 || ""));
  // the trigger condition IS the feature: no incoming line, no ghost, so a trailing line never fades
  checkTrue("G8/F6: the ghost is built ONLY when incoming html is non-empty — a trailing line has no replacement, so it never fades", /html\?inner\.querySelector/.test(pn8 || ""));
  check("G8: panel() is still SYNCHRONOUS — flash() reads .apMsg._revealDone the instant it returns, so a deferred swap would hand it the wrong element", /await |async /.test(pn8 || ""), false);
  checkTrue("G8: the ghost has BOTH removal paths — animationend, and a setTimeout belt for a backgrounded tab that drops the event", /animationend/.test(pn8 || "") && /setTimeout\(drop/.test(pn8 || ""));
  // F6's rule is untouched BY CONSTRUCTION: the fade lives in panel(), triggered by the replacement,
  // so showNarration still schedules nothing at all (asserted above and deliberately left as-is).
  check("G8/F6: showNarration STILL schedules no fade of its own — the replacement triggers it, not a timer", /fadeOut/.test(sn), false);

  const indexSrc = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const fadeRule = (indexSrc.match(/\.apMsg\.fadeOut\s*\{[^}]*\}/) || [""])[0];
  checkTrue("G8: the ghost is out of flow (position:absolute) so resizePanel measures only the incoming message — the box still animates once per message", /position:\s*absolute/.test(fadeRule));
  checkTrue("G8: the ghost is pointer-events:none — panel() also renders prompt buttons, and a ghost swallowing the first click would be worse than the bug being fixed", /pointer-events:\s*none/.test(fadeRule));
  checkTrue("G28: the fade runs at .8s — Wyatt lengthened it so it reads as a WARNING (\"hurry up and read it\"); .18s was too quick to notice and .5s was the earlier draggy reject", /animation:\s*apMsgFadeOut\s+\.8s/.test(fadeRule));
  // CR-01: the CSS duration alone was never enough — a hardcoded belt timer in panel.js beat the
  // animation and tore the ghost out early, leaving the box empty. Assert the belt is DERIVED from
  // GHOST_FADE_MS, not a literal, so the two can never disagree again.
  checkTrue("CR-01: the ghost's removal belt is derived from GHOST_FADE_MS, never a hardcoded ms literal",
    /setTimeout\(drop,\s*GHOST_FADE_MS\s*\+/.test(panelSrc) && !/setTimeout\(drop,\s*\d+\)/.test(panelSrc));
  check("G8: the rejected half-second is gone from the rule", /\.5s/.test(fadeRule), false);

  // the hold CURVES themselves are untouched — the pinned values above must still hold unchanged
  const utilSrc = readFileSync(new URL("../src/ui/util.js", import.meta.url), "utf8");
  checkTrue("G28: MSG_HOLD_MULTIPLIER is RETIRED — a scale factor over Wyatt's numbers would make his 2000 ceiling render as 1440, the exact 'constants don't mean what they say' bug G28 fixed", !/MSG_HOLD_MULTIPLIER\s*=/.test(utilSrc));
  checkTrue("G28: the hold curve's constants are named and are the VISIBLE milliseconds", /HOLD_FLOOR_MS=800/.test(utilSrc) && /HOLD_CEILING_MS=2000/.test(utilSrc));
  checkTrue("G28: the clamp is applied LAST, not to a pre-multiplier intermediate", /Math\.min\(Math\.max\(raw,HOLD_FLOOR_MS\),HOLD_CEILING_MS\)/.test(utilSrc));
  checkTrue("F6: CHAT_BUBBLE_HOLD_MULTIPLIER is untouched at 0.8 (D-15)", /CHAT_BUBBLE_HOLD_MULTIPLIER=0\.8/.test(utilSrc));
}

/* ============================================================================
 * Phase 18-02 (FIX-08): the win banner's article — "baked a Pound Cake" but
 * "baked Cinnamon-Sugar Churros" — covering all 21 RECIPE_BOOK entries plus the
 * recipeTitle() fallback branch.
 *
 * The expected mapping (which 8 titles take no article) is hardcoded here, INDEPENDENTLY of
 * RECIPE_BOOK's own `article` field, and matched by TITLE TEXT (never array index/position) —
 * so a mistake in the source data's article assignment, or a future reordering of RECIPE_BOOK,
 * both still fail this block rather than the test tautologically re-deriving its own answer key
 * from the thing it is checking. ==========================================================*/
{
  console.log("\nFIX-08 — recipeArticle(): the win banner prints an article only where one belongs:");
  check("RECIPE_BOOK has exactly 21 entries", RECIPE_BOOK.length, 21);

  // the 8 plural titles that take NO article — Wyatt's punch list item, curated per-title (no
  // pluralisation heuristic: "Pots de Crème" is plural with no trailing s, "Chocolate Genoise
  // Sponge Cake" is singular — see RESEARCH "Don't Hand-Roll")
  const NO_ARTICLE_TITLES = new Set([
    "Cinnamon-Sugar Churros", "Spiced Fudge Brownies", "Cinnamon Snaps", "Snickerdoodle Bites",
    "Crispy Cocoa Snaps", "Dark Chocolate Cream Puffs", "French Pots de Crème", "Mexican Chocolate Pots",
  ]);
  check("the curated no-article title set has exactly 8 entries (Wyatt's punch list count)", NO_ARTICLE_TITLES.size, 8);

  let emptyArticleCount = 0;
  for (const entry of RECIPE_BOOK) {
    const expected = NO_ARTICLE_TITLES.has(entry.title) ? "" : "a";
    check(`recipeArticle(): "${entry.title}" resolves to ${JSON.stringify(expected)}`, recipeArticle(entry.ings), expected);
    check(`RECIPE_BOOK data: "${entry.title}"'s own article field matches the expected mapping`, entry.article, expected);
    // sanity: the ings actually round-trip to this same title (proves the lookup used the right entry)
    check(`recipeTitle(): "${entry.title}"'s ings round-trip to its own title`, recipeTitle(entry.ings), entry.title);
    if (recipeArticle(entry.ings) === "") emptyArticleCount++;
  }
  check("exactly 8 of the 21 entries resolve to an empty (no-article) string", emptyArticleCount, 8);
  check("the remaining 13 entries resolve to \"a\"", RECIPE_BOOK.length - emptyArticleCount, 13);

  // the fallback branch: an ingredient set with no RECIPE_LOOKUP match drives recipeTitle()'s
  // "Captain's X & Y Bake" fallback, which is always singular — recipeArticle() must return "a"
  const fabricatedRecipe = ["dairy", "vanilla", "wheat", "cocoa", "sugar", "spice"]; // 6 ings: no 21-entry 5-combo matches this set
  checkTrue("the fabricated non-standard ingredient set has no RECIPE_LOOKUP match (drives the fallback branch)",
    recipeTitle(fabricatedRecipe).startsWith("Captain's"));
  check("recipeArticle(): a non-standard ingredient set (recipeTitle() fallback) resolves to \"a\"", recipeArticle(fabricatedRecipe), "a");
}

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failing check(s)`);
process.exit(failures ? 1 : 0);
