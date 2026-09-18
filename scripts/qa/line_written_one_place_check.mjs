#!/usr/bin/env node
/* ONE PLACE SAYS THE WORDS EXPLAINING A COIN HAVE BEEN WRITTEN — AND EVERY SCREEN THAT WRITES THEM SAYS IT THERE.
   Wyatt, 2026-09-18, of a real crew game: "guest never saw coin go into their purse when musing ON THEIR TURN -- it was added to
   the beginning of their following turn! ... those coins seem to be moving across the screen & making noise only on the start of
   that player's next turn."

   THE FACT: when the words that explain a coin have been written — the moment the coin is let go to fly into the hold.

   MEASURED BEFORE THE REPAIR, two real browsers in one real Firebase crew room (host 1200x950, guest iPhone-13-mini 375x812 dsf3,
   touch), every time counted from the event's arrival ON THAT SCREEN, sampled from the game's own doors and from the DOM:
       DOCK   host: coins land 663ms, chink with the landing   |  guest: 663ms, chink with the landing
       MUSE   host: coin lands 1665ms                          |  guest: 8673ms — afterLine's 8s cap, to the millisecond,
                                                                  with a whole new turn begun in between, five times out of five
   THE CAUSE WAS TWO NARRATORS AND ONE OF THEM MUTE. src/ui/util.js narrateEvent worked the typing time out inline and let the coin
   go; src/orchestrator.js watchNarr — the guest's narrator — drew the very same line and never said it was written, so on a guest
   the DEADLINE was the behaviour. The rate was typed twice as well: a `9` in stage.js's typewriter and a `9` in the narrator's
   arithmetic, kept in step by nothing.

   THE RULES (comment-stripped source; each names the mutant that turns it red, and each mutant is built and run below):
     1. ONE RELEASE. Nothing in src/ lets a waiting coin go except src/ui/util.js's two timers — the cap in afterLine and the one
        door, lineWritten. runAfterLine is private and is called nowhere else.
     2. BOTH NARRATORS SAY IT, BESIDE THE LINE THEY WRITE. lineWritten is called exactly twice in src/: in narrateEvent immediately
        before it hands the line to onFlash, and in watchNarr's drawIt immediately before it hands the line to flash.
     3. THE BUBBLE'S TYPING RATE IS ONE NUMBER. No call to typewriterReveal anywhere in src/ is handed a bare number as its rate,
        and BUBBLE_MS_PER_CHAR is multiplied in exactly one place — inside lineWritten.
     4. A NARRATOR TIMES NOTHING ITSELF. narrateEvent's body contains no setTimeout at all: it says the line is written and the one
        door decides what that is worth.
     5. ONE DEADLINE. AFTER_LINE_CAP_MS is read in exactly one place in src/ — afterLine's own timer.
     6. BEHAVIOURAL, THE REAL DOOR ON A REAL MUSE LINE. A real Game's real `pass` event, worded by the real narration table: the real
        afterLine + the real lineWritten release the coin at the words' own length (BUBBLE_MS_PER_CHAR x characters + settle), and
        that is a small fraction of the cap.
     7. BEHAVIOURAL CONTROL — THE GUEST'S OLD ARRANGEMENT. The SAME real event with lineWritten never called does NOT release inside
        that window. Rule 6 and rule 7 are each other's mutant: without this one, rule 6 would pass on a door that fires no matter
        what, which is the failure this file exists to catch.

   ON THE TREE BEFORE THIS ITEM, rules 1, 2, 3, 4 and 6 are red (mutants 1-5 below are that tree). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code
const squash = s => s.replace(/\s+/g, "");
const count = (s, needle) => s.split(needle).length - 1;

/* a named function's text, header to matching brace (the parameter list is skipped first — a default can carry braces) */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
/* every call of `name(` in `src`, as a list of its top-level argument texts */
function calls(src, name) {
  const out = []; let i = 0;
  while ((i = src.indexOf(name + "(", i)) >= 0) {
    const before = src[i - 1] || " ";
    if (/[A-Za-z0-9_$.]/.test(before)) { i += name.length; continue; }   // a longer identifier, or a member call
    let j = src.indexOf("(", i), d = 0, args = [], cur = "";
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "(" || c === "[" || c === "{") { d++; if (d === 1) continue; }
      else if (c === ")" || c === "]" || c === "}") { d--; if (!d) { args.push(cur); break; } }
      if (c === "," && d === 1) { args.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(args.map(a => a.trim()));
    i = j < 0 ? i + name.length : j;
  }
  return out;
}

function rules(files) {
  const util = code(files["src/ui/util.js"]), orch = code(files["src/orchestrator.js"]);
  const all = Object.entries(files).map(([f, s]) => [f, code(s)]);
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. ONE RELEASE
  const releaseSites = all.reduce((n, [, s]) => n + count(s, "runAfterLine("), 0);
  const defs = all.reduce((n, [, s]) => n + count(s, "function runAfterLine("), 0);
  const afterLineBody = body(util, "export function afterLine(");
  const doorBody = body(util, "export function lineWritten(");
  rule(releaseSites - defs === 2 && defs === 1 && !/export\s+function\s+runAfterLine/.test(util)
    && /runAfterLine\(e\)/.test(afterLineBody) && /runAfterLine\(e\)/.test(doorBody),
    "a waiting coin is let go in exactly two places, both in util.js: the deadline (afterLine) and the one door (lineWritten)",
    `a waiting coin is let go from ${releaseSites - defs} place(s)${/export\s+function\s+runAfterLine/.test(util) ? ", and the release is exported" : ""} — anything but the deadline and the one door is a second opinion about when the words were written`);

  // 2. BOTH NARRATORS SAY IT, BESIDE THE LINE THEY WRITE
  const doorCalls = all.reduce((n, [, s]) => n + count(s, "lineWritten(") - count(s, "function lineWritten("), 0);
  const narrate = squash(body(util, "export async function narrateEvent("));
  const watch = squash(body(orch, "export function watchNarr("));
  const inNarrator = /lineWritten\(L\.txt,e\);awaitnetHandlers\(\)\.onFlash\(L\.txt,/.test(narrate);
  const inWatcher = /lineWritten\(v\.html,ev\);returnflash\(v\.html,/.test(watch);
  rule(doorCalls === 2 && inNarrator && inWatcher,
    "both narrators say the line was written, each beside the line it writes: narrateEvent before onFlash, watchNarr's drawIt before flash",
    doorCalls !== 2 ? `the one door is called from ${doorCalls} place(s) — it takes two, one per narrator`
      : `${inNarrator ? "" : "the host's narrator "}${inNarrator || inWatcher ? "" : "and "}${inWatcher ? "" : "the guest's narrator "}does not say the line was written beside the line it writes — that screen's coin waits out the deadline instead`);

  // 3. THE BUBBLE'S TYPING RATE IS ONE NUMBER
  const literalRate = all.flatMap(([f, s]) => calls(s, "typewriterReveal").filter(a => /^\d+(\.\d+)?$/.test(a[1] || "")).map(a => `${f} (${a[1]})`));
  const rateUses = all.reduce((n, [, s]) => n + (s.match(/BUBBLE_MS_PER_CHAR\s*\*/g) || []).length, 0);
  rule(literalRate.length === 0 && rateUses === 1 && /BUBBLE_MS_PER_CHAR\s*\*/.test(doorBody),
    "the narration bubble's typing rate is one number: no typewriter is handed a bare rate, and only the one door counts a line in it",
    literalRate.length ? `a typewriter is handed a bare rate at ${literalRate.join(", ")} — the words would type at one number and the coin wait on another`
      : `the rate is multiplied in ${rateUses} place(s), ${/BUBBLE_MS_PER_CHAR\s*\*/.test(doorBody) ? "" : "and not "}in the one door`);

  // 4. A NARRATOR TIMES NOTHING ITSELF
  rule(!/setTimeout\s*\(/.test(narrate),
    "the host's narrator times nothing itself — it says the line was written and the one door decides what that is worth",
    "narrateEvent runs a timer of its own — a second answer to how long the words take, beside the one door");

  // 5. ONE DEADLINE
  const capUses = all.reduce((n, [, s]) => n + count(s, "AFTER_LINE_CAP_MS"), 0) - 1;   // less its own definition
  rule(capUses === 1 && /AFTER_LINE_CAP_MS/.test(afterLineBody),
    "the deadline is read in exactly one place: afterLine's own timer",
    `the deadline is read in ${capUses} place(s) — a second one is a second rule about how long a coin may hang`);

  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const real = rules(files);

/* ── 6 and 7: THE REAL DOOR, ON A REAL MUSE LINE ────────────────────────────────────────────────
   The event is a real Game's own `pass` — never typed in here — and the words are the real narration
   table's. The only thing that changes between the two runs is whether the one door is called at all,
   which is exactly the difference between the host and the guest before this item. */
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const U = await import(pathToFileURL(path.join(REPO, "src/ui/util.js")).href);
const { appState } = await import(pathToFileURL(path.join(REPO, "src/state/index.js")).href);

async function release(useDoor) {
  const g = new Game(roundCfg(["bot", "bot"]), 4207, true);
  g.doPass(g.players[0]);
  const e = g.events[g.events.length - 1];
  appState.game = g;   // the words read this game's own config for the coin's worth — the real table, not a typed number
  const L = U.describeFor(e, U.NEUTRAL_VIEWER);
  if (!L || !L.txt) return { at: null, expect: null, txt: null };
  const chars = String(L.txt || "").replace(/<[^>]*>/g, "").length;
  const expect = U.BUBBLE_MS_PER_CHAR * chars + U.LINE_SETTLE_MS;
  const t0 = Date.now();
  let at = null;
  U.afterLine(e, () => { at = Date.now() - t0; });
  if (useDoor) U.lineWritten(L.txt, e);
  await new Promise(r => setTimeout(r, expect + 500));
  return { at, expect, chars, txt: L.txt };
}
const spoken = await release(true), mute = await release(false);
const TOL = 250;
real.push({
  ok: spoken.at != null && spoken.expect != null && Math.abs(spoken.at - spoken.expect) <= TOL && spoken.expect * 4 <= U.AFTER_LINE_CAP_MS,
  text: spoken.at == null ? `a real muse coin was NOT let go by the one door at all (the real line was ${JSON.stringify(spoken.txt)})`
    : `a real muse coin is let go ${spoken.at}ms after its real line starts — the words' own length (${spoken.chars} characters, ${spoken.expect}ms), a ${Math.round(U.AFTER_LINE_CAP_MS / spoken.expect)}th of the ${U.AFTER_LINE_CAP_MS}ms deadline`,
});
real.push({
  ok: mute.at == null,
  text: mute.at == null ? `and a screen that never says the line was written does NOT release it in that window — the deadline is its only answer, which is what a guest did with every muse coin before this`
    : `the control released anyway, at ${mute.at}ms, with the one door never called — the measurement above is not measuring the door`,
});

for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each source rule must go red on a copy of the real source broken the way it guards against.
   Rules 6 and 7 are each other's mutant and were both RUN above, on the real module — the two arrangements
   are printed with their milliseconds, so a door that fired regardless could not read as a pass. */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const MUTANTS = [
  ["a third release, from somewhere that is neither the deadline nor the door",
    broken("src/ui/util.js", "function runAfterLine(e){", "function leak(e){runAfterLine(e);}\nfunction runAfterLine(e){"), 0],
  ["THE TREE BEFORE THIS ITEM: the guest's narrator drawing the line and saying nothing",
    broken("src/orchestrator.js", "applySubject();lineWritten(v.html,ev);return flash(", "applySubject();return flash("), 1],
  ["THE TREE BEFORE THIS ITEM: the bubble's typewriter handed its own bare rate again",
    broken("src/ui/stage.js", 'typewriterReveal(b.querySelector(".pp4BubIn"), BUBBLE_MS_PER_CHAR)', 'typewriterReveal(b.querySelector(".pp4BubIn"), 9)'), 2],
  ["THE TREE BEFORE THIS ITEM: the host's narrator guessing the typing time inline",
    broken("src/ui/util.js", "  lineWritten(L.txt,e);",
      '  setTimeout(() => runAfterLine(e), 9 * String(L.txt == null ? "" : L.txt).replace(/<[^>]*>/g, "").length + 120);'), 3],
  ["a second deadline for a coin that is waiting",
    broken("src/ui/util.js", "  AFTER_LINE.set(e, fn);", "  AFTER_LINE.set(e, fn);\n  setTimeout(() => runAfterLine(e), AFTER_LINE_CAP_MS / 2);"), 4],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && res[idx] && !res[idx].ok;          // the rule that guards against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}

const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — one place says the words explaining a coin have been written, and every screen that writes them says it there; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
