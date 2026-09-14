#!/usr/bin/env node
/* words_one_place_check.mjs — EVERY WORD THE GAME SAYS LIVES IN src/shared/words.js, AND EVERY ONE OF THEM RENDERS.
 *
 *   node scripts/qa/words_one_place_check.mjs          the gate
 *   node scripts/qa/words_one_place_check.mjs --list   also print every entry, as another screen and as its own captain
 *
 * Wyatt, 2026-09-13, on his narration pass: "All the narration should be re-architected to live in one place -- fix
 * this." A convergence with no gate lasts until the next person needs a sentence in a hurry (it is how the audit page
 * of that night came to show a third of its rows from a copy the game no longer had). So this holds both halves:
 *
 *   1. EVERY ENTRY RENDERS — for another captain's screen and for the named captain's own: no {placeholder} left
 *      unfilled, no "undefined"/"null"/"NaN", and every coin amount held to its number (FIX-21).
 *   2. NO SENTENCE IS WRITTEN INTO THE GAME'S CODE — a string with words in it, handed to anything that shows it to a
 *      player (a narration line, a question, a button, a reason, an alert, a title), fails unless it is on the short
 *      NOT_THE_GAME_SPEAKING list below, each with its reason.
 *
 * RED-PROOF at the bottom: a doctored line of code and a doctored entry must both fail.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { WORDS, PILOT, fill, seat } = await import(pathToFileURL(path.join(REPO, "src/shared/words.js")).href);
const LIST = process.argv.includes("--list");
let fails = 0;
const pass = (m) => console.log("PASS " + m);
const fail = (m) => { console.log("FAIL " + m); fails++; };

/* ---------- 1. every entry renders ---------- */
const NUMERIC = /^(n|price|coins|short|paid|got|of|step|pct|day|heads|tails|att)$/;
function sampleFacts(template) {
  const facts = {}, seatKeys = new Set();
  for (const m of template.matchAll(/\{([A-Za-z0-9_]+)(?:'s|:[^{}|]*\|[^{}]*)\}/g)) seatKeys.add(m[1]);
  let s = 0;
  for (const m of template.matchAll(/\{([A-Za-z0-9_]+)/g)) {
    const k = m[1];
    if (k in facts) continue;
    facts[k] = seatKeys.has(k) ? seat(s++) : NUMERIC.test(k) ? 3 : `«${k}»`;
  }
  return facts;
}
const look = (viewer) => ({ me: (i) => i === viewer, name: (i) => `<b>Captain${i}</b>`, poss: (i) => `<b>Captain${i}'s</b>` });
function problemsIn(html) {
  const out = [];
  if (/\{[A-Za-z0-9_]+(?:'s|:[^{}]*)?\}/.test(html)) out.push("a placeholder was left unfilled");
  if (/\b(undefined|null|NaN)\b/.test(html)) out.push("renders undefined/null/NaN");
  const bare = html.split(/<span class="nobrk">[\s\S]*?<\/span>/).join("");
  if (/\d+🌕/.test(bare)) out.push("a coin amount is not held to its number");
  return out;
}
function checkEntries(words) {
  const bad = [];
  for (const [id, template] of Object.entries(words)) {
    if (typeof template !== "string") { bad.push(`${id}: not a string`); continue; }
    const facts = sampleFacts(template);
    const seats = Object.values(facts).filter((v) => v && typeof v === "object").map((v) => v.seat);
    for (const viewer of [-1, ...seats]) {
      const html = fill(template, facts, look(viewer));
      if (LIST) console.log(`  ${id.padEnd(26)} [${viewer < 0 ? "others" : "own " + viewer}] ${html.replace(/<[^>]*>/g, "")}`);
      for (const p of problemsIn(html)) bad.push(`${id} (${viewer < 0 ? "another screen" : "its own captain's screen"}): ${p} — "${html.replace(/<[^>]*>/g, "")}"`);
    }
  }
  return bad;
}
const entryProblems = checkEntries(WORDS);
entryProblems.length ? fail(`${entryProblems.length} entr(y/ies) in src/shared/words.js do not render cleanly:\n  ` + entryProblems.join("\n  "))
  : pass(`all ${Object.keys(WORDS).length} entries in src/shared/words.js render cleanly for another screen and for each captain they name`);
const ladderIds = Object.keys(PILOT || {});
const ladderBad = ladderIds.filter((id) => !Array.isArray(PILOT[id]) || PILOT[id][PILOT[id].length - 1] !== null);
ladderIds.length && !ladderBad.length ? pass(`the parrot's ${ladderIds.length} ladders live in words.js, each ending on its null rung`)
  : fail(`the parrot's ladders are missing from words.js or a ladder does not end on null: ${ladderBad.join(", ") || "(no PILOT export)"}`);

/* ---------- 2. no sentence written into the game's code ---------- */
/* Words that are NOT the game speaking to a captain — each with its reason. Matched as substrings of the scanned text. */
const NOT_THE_GAME_SPEAKING = [
  ["src/ui/board.js", "Wind-dot smoothness check", "a developer's frame-rate panel for the wind prototype, shown only behind ?wind=… on a dev host"],
  ["src/ui/board.js", "frames a second", "the same developer panel"],
  ["src/ui/board.js", "frames measured", "the same developer panel"],
  ["src/ui/board.js", "rough moment", "the same developer panel"],
  ["src/ui/board.js", "Dial ended at", "the same developer panel"],
  ["src/ui/board.js", "ignored — the screen was off", "the same developer panel"],
  ["src/ui/board.js", "power-saving mode", "the same developer panel"],
  ["src/ui/board.js", "WIND: ", "the same developer panel's toggle"],
  ["src/ui/board.js", "HINT: ", "the same developer panel's toggle"],
  ["src/ui/board.js", "fps —", "the same developer panel's meter"],
  ["src/ui/stage.js", "Build", "the build stamp, for Wyatt reading staging — not the game's voice"],
  ["src/ui/recipe.js", "", "THE RECIPE BOOK — 21 real, bakeable recipes (names, blurbs, ingredients and steps) kept as one table, like the island, ingredient and sea-creature names in src/shared/index.js; a cookbook, not the game's narration"],
  ["src/ui/lobby.js", "Support Pastry Pirates on Ko-fi", "the Ko-fi panel is outside the game world (CLAUDE.md: credits are not pirate speak)"],
  ["src/ui/lobby.js", "Ko-Fi panel", "the same Ko-fi panel"],
  ["src/ui/lobby.js", "bot", "the lobby's seat label, a sanctioned chrome exception in ui_contract_check (D-29)"],
  ["src/ui/lobby.js", "you", "the same sanctioned lobby label"],
  ["src/ui/pulsebeacon.js", "Copy log", "the pulse beacon, a developer instrument shown only behind ?debug=pulse (approved by him as tooling, 2026-08-24)"],
  ["src/ui/pulsebeacon.js", "Close", "the same pulse beacon"],
  ["src/ui/flow.js", "SAIL BUG", "a developer alarm that is no longer drawn (his 2026-08-25 ruling) — never a player's line"],
  ["src/ui/flow.js", "illegal:", "the same developer alarm"],
  ["src/ui/flow.js", "compass shows", "the same developer alarm"],
];
const SINK = /(?:\b(?:flash|ask|localAsk|alert|confirm|showNarration|netIntroBarrier|onBroadcast|onFlash|onNetBroadcast|panel|pollySay|battlePublish|netBroadcast)\s*\(|\b(?:label|short|why|hint|result|msg|title|sub|waiting|txt|html|name|byline|stat)\s*:|\.(?:textContent|innerHTML|innerText|title)\s*=|\btitle="|aria-label="|setAttribute\(\s*"(?:aria-label|title)"|createTextNode\()/;
const LITERAL = /`(?:\\[\s\S]|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;
function stripInterpolations(t) {
  let out = "", depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (depth === 0 && t[i] === "$" && t[i + 1] === "{") { depth = 1; i++; out += " "; continue; }
    if (depth > 0) { if (t[i] === "{") depth++; else if (t[i] === "}") depth--; continue; }
    out += t[i];
  }
  return out;
}
function wordsIn(literal) {
  let t = stripInterpolations(literal.slice(1, -1));
  t = t.replace(/<[^<>]*>/g, " ").replace(/^[^<]*>/, " ").replace(/<[^>]*$/, " ").replace(/&[a-z]+;/gi, " ").replace(/\\[nt]/g, " ");
  t = t.replace(/\b[a-z-]+\s*:\s*[^;"']*;?/gi, (m) => (/[a-z-]+:\s*(?:[\d.#-]|rgba?|var|url|system-ui|none|flex|center|pointer|fixed|blur|translate|scale)/i.test(m) ? " " : m));
  t = t.trim();
  if (/^@|\{[^}]*:[^}]*\}/.test(t)) return null;                     // a CSS rule, not words
  if (/^[a-z][A-Za-z0-9_-]*(?:\s+[a-z][A-Za-z0-9_-]*)+$/.test(t)) return null;   // a class list: "primary ahoyGlow"
  if (!/[A-Za-z]{3,}/.test(t)) return null;
  if (/^[a-z][A-Za-z0-9_.-]*$/.test(t)) return null;            // an id, a class, an event type
  if (/^[A-Z][A-Z0-9_]*$/.test(t) && t.length <= 4) return null; // "H", "T", "N" — state codes
  return t;
}
function scan(rel, src) {
  const code = stripComments(src);
  const hits = [];
  for (const m of code.matchAll(LITERAL)) {
    const before = code.slice(Math.max(0, m.index - 160), m.index);
    const stmt = before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"), before.lastIndexOf("}")) + 1);
    if (!SINK.test(stmt)) continue;
    if (/^\s*(?:import|export\s*\{)/.test(stmt)) continue;
    const w = wordsIn(m[0]);
    if (!w) continue;
    if (NOT_THE_GAME_SPEAKING.some(([f, sub]) => f === rel && w.includes(sub.trim()))) continue;
    // report the line in the REAL file (the comment-stripped text has fewer lines)
    const probe = m[0].slice(0, Math.min(40, m[0].length));
    const at = src.indexOf(probe);
    const line = at < 0 ? "?" : src.slice(0, at).split("\n").length;
    hits.push(`${rel}:${line}  "${w.slice(0, 90)}"`);
  }
  return hits;
}
const FILES = ["src/orchestrator.js", ...fs.readdirSync(path.join(REPO, "src/ui")).filter((f) => f.endsWith(".js")).map((f) => "src/ui/" + f)];
const hits = FILES.flatMap((rel) => scan(rel, fs.readFileSync(path.join(REPO, rel), "utf8")));
hits.length ? fail(`${hits.length} sentence(s) are written into the game's code instead of src/shared/words.js:\n  ${hits.join("\n  ")}`)
  : pass(`no sentence is written into the game's code — ${FILES.length} files scanned; everything a player reads comes out of words.js`);
const stale = NOT_THE_GAME_SPEAKING.filter(([f, sub]) => sub && !fs.readFileSync(path.join(REPO, f), "utf8").includes(sub.trim()));
stale.length ? fail(`exception(s) that match nothing any more — delete them: ${stale.map(([f, s]) => `${f} "${s}"`).join("; ")}`)
  : pass(`every one of the ${NOT_THE_GAME_SPEAKING.length} "not the game speaking" exceptions still names something real`);

/* ---------- 3. no picture typed into a line in the code either ----------
   Wyatt, 2026-09-13: "I want all of those images that were in the lines still there, I think the images are a really important
   element of the game". A picture is part of its line, so it lives in words.js with the words — the word scan above cannot see a
   lone 🌊, which is how one stayed typed into the Muse line's code. Pictures that are NOT part of a line are listed with a reason. */
const { EMOJI_IMG } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
const ART = Object.keys(EMOJI_IMG).sort((a, b) => b.length - a.length);
const PICTURES_NOT_IN_A_LINE = [
  ["src/ui/stage.js", "pp4Chat", "the top ribbon's chat and parrot BUTTONS — controls, not a line"],
  ["src/ui/util.js", '"👑"', "the crown that pops over the winner's boat — a board effect, not a line"],
];
function scanPictures(rel, src) {
  const code = stripComments(src), hits = [];
  for (const m of code.matchAll(LITERAL)) {
    const before = code.slice(Math.max(0, m.index - 160), m.index);
    const stmt = before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"), before.lastIndexOf("}")) + 1);
    if (!SINK.test(stmt)) continue;
    const pics = ART.filter((e) => stripInterpolations(m[0]).includes(e));
    if (!pics.length) continue;
    if (PICTURES_NOT_IN_A_LINE.some(([f, sub]) => f === rel && m[0].includes(sub))) continue;
    const at = src.indexOf(m[0].slice(0, 30));
    hits.push(`${rel}:${at < 0 ? "?" : src.slice(0, at).split("\n").length}  ${pics.join(" ")}  ${m[0].slice(0, 80).replace(/\s+/g, " ")}`);
  }
  return hits;
}
const picHits = FILES.flatMap((rel) => scanPictures(rel, fs.readFileSync(path.join(REPO, rel), "utf8")));
picHits.length ? fail(`${picHits.length} picture(s) are typed into a line in the game's code instead of src/shared/words.js:\n  ${picHits.join("\n  ")}`)
  : pass(`no picture is typed into a line in the game's code — every line's pictures live in words.js with its words (${PICTURES_NOT_IN_A_LINE.length} controls/effects excepted, with reasons)`);
const redPic = scanPictures("src/ui/util.js", 'function x(){ return {txt:`🌊 ${seaLine(e.sea)}`}; }').length;
redPic === 1 ? pass("RED-PROOF: a picture typed in front of a line in the code is caught") : fail(`RED-PROOF: a typed picture was not caught (caught ${redPic})`);

/* ---------- red-proof ---------- */
const doctoredCode = 'async function x(p){ await flash("A sentence typed straight into the code."); opts.push({label:say("button.back",{}),value:1}); }';
const redCode = scan("src/ui/flow.js", doctoredCode);
redCode.length === 1 ? pass("RED-PROOF: a sentence typed into a flash() call is caught, and a say() call beside it is not")
  : fail(`RED-PROOF: the scan did not tell a typed sentence from a say() call (caught ${redCode.length}, expected 1)`);
const redEntries = checkEntries({ "doctored.coin": "{p} {p:pays|pay} 3🌕 {missing:a|b}", "doctored.gap": "{p} {p:sails|sail} to {place}" }).length;
const redFill = problemsIn('<b>Captain0</b> pays 3🌕 and {place}').length;
redFill === 2 ? pass("RED-PROOF: an unheld coin amount and an unfilled placeholder are both caught")
  : fail(`RED-PROOF: the render check missed a doctored problem (caught ${redFill} of 2; entries flagged ${redEntries})`);

console.log(fails ? `\nFAILED — ${fails}` : "\nPASSED — every word the game says lives in src/shared/words.js, and every one of them renders");
process.exit(fails ? 1 : 0);
