/* A-2 — WATCH A BOT'S BAKE-OFF. Wyatt, 2026-08-28: "Yes. Build it. Bakeoff IS the game coming
 * to life."
 *
 * MEASURED BEFORE CHANGING (T-23's trace, confirmed by reading the wiring): a bot's bake was
 * invisible everywhere. bakeTurnLive's bot branch resolved the engine's fallback guess with no UI
 * at all — the only bench publisher was bakeoffPrompt's onBench, which exists on the HUMAN branch
 * only. The whole watcher pipeline (benchPublish -> applyBenchSnap -> benchWatch ->
 * playBakeoffLive with a watch ctl) already renders any seat that is not decisionIsLocal — and a
 * bot seat is never decisionIsLocal — so the ONE missing thing was somebody publishing the bot's
 * moments. Run RED against the tree where nobody does.
 *
 * THE RULE AFTER THIS CHANGE: THE BOT'S BAKE IS A PERFORMANCE OF A DECISION ALREADY MADE. The
 * engine computes setup+fallback first, exactly as before (the seeded stream must not move —
 * BOT-V3-RACE-PLANNER "Determinism and information"); the performance then publishes the same
 * discrete moments a human baker publishes — open, shuffle, picks landing one per beat — and the
 * verdict reveals through benchReveal like any human's. Every screen draws it through the SAME
 * watcher choreography a human's bake already feeds (rule 23: one display path — the new consumer
 * goes through the existing one).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy, and every copy deleted BLOCK
   comments first — so a LINE comment containing the characters that open one swallowed 152
   lines of src/orchestrator.js, the whole import block included, in eight gates at once.
   See scripts/qa/lib/strip_comments.mjs for the measurement. */
import { stripComments as strip } from "./lib/strip_comments.mjs";
function fnBody(src, name) {
  // strip FIRST, then anchor — a comment naming the function earlier in the file must not win.
  // `function` is REQUIRED in the anchor: an optional prefix let a bare CALL SITE win the search
  // (await bakeTurnLive(p) sits above the definition), which made this gate condemn three things
  // the current tree plainly does — caught by red-proofing the first run, per rule 6.
  const clean = strip(src);
  let h = clean.search(new RegExp(`(async\\s+)?function\\s+${name}\\(`));
  if (h < 0) return null;
  let i = clean.indexOf("{", clean.indexOf(")", h)), depth = 0, j = i;
  for (; j < clean.length; j++) {
    if (clean[j] === "{") depth++;
    else if (clean[j] === "}") { depth--; if (!depth) break; }
  }
  return clean.slice(i, j + 1);
}

const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
const bko = fs.readFileSync(path.join(REPO, "src/ui/bakeoff.js"), "utf8");

/* 1. a bot performance exists and publishes the same three moments a human baker publishes */
{
  const body = fnBody(orch, "botBakePerform");
  if (!body) fail("orchestrator: no botBakePerform — a bot's bake is still invisible (T-23)");
  else {
    for (const phase of ["open", "shuffle", "pick"])
      if (new RegExp(`phase:"${phase}"`).test(body)) pass(`bot performance publishes {phase:"${phase}"}`);
      else fail(`bot performance never publishes {phase:"${phase}"} — watchers miss that moment`);
    if (/benchPublish\(/.test(body)) pass("bot performance goes through benchPublish — the one publisher every tier uses");
    else fail("bot performance does not use benchPublish — a second publish path is the rule-23 fault");
    /* the decision is already made — the performance must not touch the engine or the rng
       (BOT-V3-RACE-PLANNER: display drivers draw nothing from the seeded stream) */
    if (/bakeResolve|bakeSetup|\br\(\)/.test(body)) fail("bot performance touches the engine — the seeded stream forks on 'did anyone watch'");
    else pass("bot performance is display-only — no engine call, no rng draw");
    /* rule 9: pacing derived from the choreography's own constants, not typed here */
    if (/\b\d{3,}\b/.test(body)) fail("bot performance holds a hardcoded ms number — pacing must derive from bakeoff.js's own timings");
    else pass("bot performance holds no timing literal of its own");
  }
}

/* 2. the pacing is answered by the file that owns the animation, from the constants it runs on */
{
  const body = fnBody(bko, "benchChoreoMs");
  if (!body) fail("bakeoff.js does not export benchChoreoMs — the publisher would keep a duplicate timing model in step by discipline");
  else if (/COVER_MS/.test(body) && /SWAP_MS/.test(body) && /SETTLE_MS/.test(body))
    pass("benchChoreoMs derives from COVER_MS/SWAP_MS/SETTLE_MS — the same constants the animation runs on");
  else fail("benchChoreoMs does not read the animation's own constants — the two can drift");
  if (/export const BENCH_STUDY_MS\s*=\s*PREVIEW_MS/.test(bko)) pass("the bot's study window is PREVIEW_MS — the game's own original study window, not a new number");
  else fail("BENCH_STUDY_MS is not derived from PREVIEW_MS");
  if (/export const BENCH_BEAT_MS\s*=\s*SETTLE_MS/.test(bko)) pass("the pick beat is SETTLE_MS — the readability beat this file already defends");
  else fail("BENCH_BEAT_MS is not derived from SETTLE_MS");
}

/* 3. the verdict reveals for every seat, not only humans */
{
  const body = fnBody(orch, "bakeTurnLive") || "";
  if (/if\(human&&!appState\.replaying\)awaitbenchReveal/.test(body.replace(/\s+/g, "")))
    fail("benchReveal is still human-gated — a bot's verdict never reaches any screen");
  /* \w+ , not the literal `p` — this went red on 2026-08-31 when bakeTurnLive's player parameter
     was renamed from `p` to `player`. Nothing about the bake changed. A check pinned to a local
     variable's NAME asserts about spelling, and stands in the way of the readability work it
     should not care about. Second gate in one commit with this fault; both now read \w+. */
  else if (/benchReveal\(\w+,out\.res\)/.test(body)) pass("benchReveal runs for bot seats too — the verdict is drawn everywhere");
  else fail("bakeTurnLive no longer calls benchReveal at all");
  /* the guess is still the engine's own fallback — watching changed nothing about the outcome */
  if (/\{g:fallback,w:0\}/.test(body.replace(/\s+/g, ""))) pass("the bot's guess is still the engine's fallback — the performance decides nothing");
  else fail("the bot branch no longer resolves the engine's fallback");
  /* a replay must stay silent — its benches would animate in real time over a fast-forward */
  if (/replaying/.test(body)) pass("bakeTurnLive still consults appState.replaying — replays keep the silent bake");
  else fail("nothing in bakeTurnLive guards the performance against replay");
}

/* 4. the baker's name rides the snapshot, so a watcher's title says whose bake this is (T-25) */
{
  const pub = fnBody(orch, "benchPublish") || "";
  if (/baker:spec\.baker/.test(pub.replace(/\s+/g, ""))) pass("benchPublish carries baker — watchers title the bench by name");
  else fail("benchPublish drops spec.baker — every watcher sees the generic 'The Bake-Off' title");
  const bw = fnBody(orch, "benchWatch") || "";
  if (/baker:snap\.baker/.test(bw.replace(/\s+/g, ""))) pass("benchWatch hands baker through to the choreography");
  else fail("benchWatch does not pass snap.baker into playBakeoffLive's spec");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — a bot's bake plays on every screen, through the one watcher path");
process.exit(fails ? 1 : 0);
