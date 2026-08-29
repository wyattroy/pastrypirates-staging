/* A-7 — THE RULES PAGE DERIVES FROM THE GAME, NOT FROM MEMORY. Wyatt, 2026-08-28: "Add a
 * mechanism (perhaps a hook? please suggest the most efficient, durable method) to the build
 * process that automatically updates the rules page according to the latest rules (eg. i'm not
 * sure if black market is in there either)".
 *
 * MEASURED BEFORE CHANGING: the How-to-Play modal hand-typed every number (roundCfg's own comment
 * had already filed it: "the how-to-play modal still hardcodes its numbers — that is a filed
 * todo"), still documented the SHOT CLOCK (removed 2026-08-28, A-10), still described the old
 * "declare victory + one last turn" ending (the bake-off replaced it), and never mentioned the
 * black market (live since 2026-08-12). He was right to be suspicious.
 *
 * THE MECHANISM, two halves — chosen over a hook because a hook only fires in Claude sessions
 * while this fires for anything that runs npm test, which the release loop requires:
 *   1. RUNTIME DERIVATION (the automatic half): every tuned number on the page is an empty
 *      <b data-rule="key"> span, filled from rulesFacts(cfg) — the same cfg the engine plays by —
 *      when the game boots and again each time the modal opens. A retuned constant can never
 *      disagree with the page, because the page holds no copy of it.
 *   2. THIS GATE (the fence for prose): numbers can derive themselves; sentences cannot. So the
 *      gate fails the build when the page's PROSE drifts from the code — a mechanic the code
 *      carries that the page never mentions, a mechanic the code dropped that the page still
 *      teaches, a hand-typed amount that bypasses the span mechanism, or a span nothing fills.
 *      Each prose requirement is ANCHORED TO A LIVE CODE SYMBOL, so the requirement itself
 *      retires with the feature instead of rotting into a false alarm.
 *
 * Run RED against the pre-A-7 page: shot clock present, black market and bake-off absent,
 * every number hand-typed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy that deletes BLOCK comments
   first — so a LINE comment containing the characters that open one swallowed 152 lines of
   src/orchestrator.js, the whole import block included. MEASURED: it also blinded 10 lines
   of src/shared/index.js and 10 of src/ui/util.js. scripts/qa/lib/strip_comments.mjs. */
import { stripComments as sharedStrip } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const { roundCfg } = await import(path.join(REPO, "src/engine/index.js"));
const shared = await import(path.join(REPO, "src/shared/index.js"));
if (typeof shared.rulesFacts !== "function") {
  fail("src/shared/index.js does not export rulesFacts() — there is no one source both the page filler and this gate can read");
  console.log(`\nFAILED — ${fails} assertion(s)`);
  process.exit(1);
}
const facts = shared.rulesFacts(roundCfg(["human", "bot", "bot", "bot"]));

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const m = html.match(/<div id="howToPlayModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
if (!m) { fail("could not locate the howToPlayModal block in index.html"); console.log(`\nFAILED — ${fails}`); process.exit(1); }
const modal = m[0];
const modalNoComments = modal.replace(/<!--[\s\S]*?-->/g, "");

/* 1. every derivable fact appears on the page as a data-rule span, and no span is an orphan */
{
  const used = [...modalNoComments.matchAll(/data-rule="([a-zA-Z0-9_]+)"/g)].map(x => x[1]);
  for (const k of Object.keys(facts))
    if (used.includes(k)) pass(`fact "${k}" (${facts[k]}) reaches the page through its span`);
    else fail(`fact "${k}" (${facts[k]}) has no data-rule span in the modal — that number is either missing from the rules or hand-typed`);
  for (const k of new Set(used))
    if (!(k in facts)) fail(`the modal carries data-rule="${k}" but rulesFacts() computes no such fact — the span would render blank`);
  if (new Set(used).size && [...new Set(used)].every(k => k in facts)) pass("every data-rule span on the page maps to a computed fact");
}

/* 2. no hand-typed amount bypasses the mechanism: a digit glued to 🌕 or "squares" outside a span
      is the exact drift A-7 exists to end */
{
  const prose = modalNoComments.replace(/<b data-rule="[^"]*">[^<]*<\/b>/g, "").replace(/<span data-rule="[^"]*">[^<]*<\/span>/g, "");
  const money = [...prose.matchAll(/\d+\s*🌕/g)].map(x => x[0]);
  if (money.length) fail(`hand-typed coin amount(s) in the modal outside data-rule spans: ${JSON.stringify(money)} — these rot the moment the cfg moves`);
  else pass("no hand-typed coin amount outside a data-rule span");
  const squares = [...prose.matchAll(/\b\d+\s+squares?\b/g)].map(x => x[0]);
  if (squares.length) fail(`hand-typed distance(s) in the modal outside data-rule spans: ${JSON.stringify(squares)}`);
  else pass("no hand-typed square-count outside a data-rule span");
}

/* 3. prose coverage, each requirement anchored to a live code symbol */
{
  const eng = fs.readFileSync(path.join(REPO, "src/engine/index.js"), "utf8");
  const modalText = modalNoComments.toLowerCase();
  // black market: live iff the engine can settle one
  if (/canBlackMarket\(/.test(eng)) {
    if (modalText.includes("black market")) pass("the black market is live (engine.canBlackMarket) and the page teaches it");
    else fail("the engine carries canBlackMarket() but the rules page never mentions the black market — Wyatt's own example of the drift");
  }
  // the bake-off: live iff its UI module exists
  if (fs.existsSync(path.join(REPO, "src/ui/bakeoff.js"))) {
    if (/bake-?off/.test(modalText)) pass("the bake-off ships (src/ui/bakeoff.js) and the page teaches it");
    else fail("the bake-off ships but the rules page still describes the old ending — a new player reads rules for a game that no longer exists");
  }
  // the shot clock: the page may teach it only while the game has one
  const srcFiles = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) srcFiles.push(p); } })(path.join(REPO, "src"));
  // comments stripped first: util.js's graveyard tombstone NAMES the removed clock functions, and
  // an unstripped scan read that as the clock being alive (caught on this gate's first green run)
  const stripJs = sharedStrip;
  const clockLive = srcFiles.some(p => /startShotClock|shotClockTick/.test(stripJs(fs.readFileSync(p, "utf8"))));
  if (!clockLive) {
    if (modalText.includes("shot clock")) fail("the shot clock is gone from src/ (removed 2026-08-28) but the rules page still teaches it — a player will wait for a timer that never comes");
    else pass("the shot clock is gone and the page no longer teaches it");
  } else pass("shot clock live in src/ — its page section is its own business");
}

/* 4. something actually fills the spans: the filler must exist and be reachable from the modal's
      own button, or the page ships blanks */
{
  const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
  if (/rulesFacts\(/.test(orch) && /data-rule/.test(orch)) pass("orchestrator fills [data-rule] spans from rulesFacts()");
  else fail("no filler found in src/orchestrator.js — the data-rule spans would render empty");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — the rules page derives its numbers and its prose is fenced to the code");
process.exit(fails ? 1 : 0);
