#!/usr/bin/env node
/* lines_take_the_seat_check.mjs — A LINE ABOUT A CAPTAIN IS HANDED THE CAPTAIN, NEVER A READY-MADE NAME (architecture item 43, 2026-09-17).
 *
 * THE FACT, IN THE GAME'S WORDS: which name a line about a captain is handed — the captain (seat), so every screen words it for itself
 * ("ye" on that captain's own screen, the name on every other), or a finished name that reads the same on every screen.
 * His rulings (.claude/memory/DECISIONS.md, 2026-09-13): "the location decides 'ye' or the captain's name. The 'ye' form is derived,
 * never hand-written twice" · "i don't want to actually write out every single for of "ye" vs "Player"" · and, the same night,
 * "SOLO SAYS 'YE' TOO — ONE RULE IN EVERY MODE".
 *
 * WHY A GATE OF ITS OWN. words_one_place_check's rule 4 held this from 2026-09-14, and it looked only at a name written INLINE at the call
 * (`say("x",{p:pn(i)})`). The item-1 hit line walked past it for three days: `const nm=pn; … const hitName=nm(scorerIdx);
 * say("battle.hit",{name:hitName})` — an alias, then a variable. So did the crow's-nest calls (`ns=pn`) and the refused hail, whose line id
 * sat behind a ternary the call pattern could not read. This gate FOLLOWS the name: through a variable, an alias, a helper's return, a
 * helper's parameter (to every call of that helper), a template literal, an array it was pushed into, and a field it was stored in
 * (`baker:pn(i)` … `bake.baker`). Rule 4 moved here whole — its list of lines allowed a name is below, re-verified line by line.
 *
 * RULES (every one is a pure function of the source text, so the SAME function runs against deliberately broken copies — RED-PROOF below):
 *   1. NO READY-MADE NAME REACHES A LINE, by any road, unless that line and that placeholder are on one of the lists below, with a reason.
 *   2. A CAPTAIN'S PLACEHOLDER HOLDS THE CAPTAIN — wherever a line's template words a placeholder both ways ({p's}, {p:a|b}), the call
 *      hands seat(…) (or null), directly or through a variable; and no line, whatever its template, is handed a "ye" typed by hand (the
 *      word as a string, or words.js's "list.ye").
 *   3. {name} IS THE LABEL PLACEHOLDER (words.js header): every line that holds one is on a list below.
 *   4. THE LISTS ARE TRUE: every listed line exists and holds that placeholder, and a line listed as still being handed a name (awaiting
 *      his wording, by his ruling, or with no seat to hand) is still handed one somewhere — a list that outlives its reason fails.
 *   5. POSED: the hit line, worded for the captain who landed the shot, reads "ye"; worded for any other screen, it reads the name.
 *
 * WHAT IT READS: every .js file under src/ except src/shared/words.js. The doors are say, sayAll and sayText, every function that forwards
 * its (id, facts) to one of them (sayFlash is found that way, not named), and every {id:"…", facts:{…}} a screen words later.
 * WHAT IT DOES NOT SEE, said so a PASS is never read as more: a sentence built in code without words.js (words_one_place_check rule 2 holds
 * that), the parrot's ladders (PILOT, filled by .replace — "Yer recipe's stowed below, {name}" is put TO the captain), a name reaching a
 * line through a function called dynamically (EVENT_NARRATION[e.t] — its entries are read here, their callers are not), and a name typed
 * into the sea-creature sightings (src/shared/index.js, outside words.js by his ruling — listed below).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORDS_FILE = "src/shared/words.js";

/* ── THE LISTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Keyed by line, then by placeholder: a line may put a question TO one captain by name and still tell ABOUT another ({p}), and only the
   named placeholder is excused. Each reason was re-verified against the code on 2026-09-17 (architecture item 43). */
const NAME_LABELS = {
  "battle.fire": { name: "put TO the attacker as their own flip prompt — battleAsk sends it to the asked seat alone, and since architecture item 8 (2026-09-17) broadcasts nothing to the others: the fight's own words (battle.loads, battle.showsTails) say whose coin it is" },
  "battle.fleeAsk": { name: "put TO the defender by name — ask() sends it to the asked seat alone; every other screen gets wait.deciding" },
  "battle.refireAsk": { name: "put TO the attacker by name (ask(), as above)" },
  "battle.plunder": { name: "put TO the winner by name (ask(), as above)" },
  "draft.choose": { name: "put TO the captain choosing (draftDispatch hands each seat its own)" },
  "act.ask": { name: "put TO the captain whose turn it is (ask(), as above)" },
  "sail.ask": { name: "put TO the captain sailing — the pick spec goes to that seat; every other screen gets wait.sailing" },
  "counter.ask": { q: "put TO the captain countering (its {whose} awaits his wording, below)" },
  "counter.asking": { q: "put TO the captain countering (the coin slider's line)" },
  "trade.offered": { q: "put TO the captain offered the trade; the offerer is a captain fact ({p})" },
  "call.ask": { name: "put TO the captain asked to call — his ruling, 2026-08-08: on one device the question arrives out of nowhere and the name is what says it is theirs" },
  "call.button": { name: "a button's label naming the ship ye'd call — the caller is never one of the two fighters, so it is never the reader" },
  "call.paid": { name: "a tally of the crow's-nest calls, his wording: \"Dough Hook +5 · Flaky Jack −2\"" },
  "call.unpaid": { name: "the same tally" },
  "captains.youTip": { name: "a tooltip on the reader's own row — plain \"you\" by his F1 ruling" },
  "stats.heads": { name: "a row label in the end-of-voyage stats table, his wording \"Wyatt's HEADS\" — NOTHING DRAWS IT since the victory card replaced that table (7f0bc09d), and the end of the voyage is another session's to rebuild, so it is kept, not deleted" },
  "bake.recipeName": { name: "a recipe's name, not a captain's" },
  "lobby.nameTaken": { name: "the name a player typed, before any seat exists" },
};
/* A NAME WHERE THERE IS NO SEAT TO HAND — the captain named is not a seat of a voyage this screen has loaded. */
const NO_SEAT = {
  "host.left": { who: "the host who LEFT, named from the room's own seat list: the card can be drawn at boot (watchRoom, a guest rejoining a room already marked hostgone) before any voyage or roster exists, so there is no seat whose name could be looked up — and the captain it names is never the one reading" },
};
/* OUTSIDE words.js BY HIS RULING. */
const BY_RULING = {
  "muse.line": { sighting: "the sea creature's own sentence, typed both ways by hand in src/shared/index.js — theme text he ruled stays outside words.js for now (2026-09-14: \"don't do anything yet -- this is just context\"); words.js's header names it as the one exception" },
};
/* ⚠ AWAITING HIS WORDING — STOPPED in architecture item 43, not fixed. Each is still handed a name (or a hand-built "ye"), and the one rule's
   derived form reads wrongly or drops words he chose. The report of that item quotes each one's text today and what the rule would render.
   When he rules, the line takes a seat and leaves this list (rule 4 fails if it is left behind). */
const AWAITING_HIS_WORDING = {
  "battle.downwindTag": { name: "\"⬇ WYATT FIRES DOWNWIND — WINS TIES\" — said with a fight's first line to every screen now (the box it labelled went in 8eca1608); the name is in capitals, and one line would read \"⬇ Wyatt — ye FIRE DOWNWIND — WIN TIES\" on his own screen and lose the capitals on every other" },
  "storm.drives": { who: "the storm summary names a GROUP of captains, and words.js cannot say a group: its \"ye\" is built by hand in util.js stormSummary list() — a clause filled on its own would open \"Wyatt — ye …\" in the middle of the summary" },
  "storm.blowsOff": { who: "the storm summary's group (as storm.drives)" },
  "storm.sweeps": { who: "the storm summary's group (as storm.drives)" },
  "storm.holds.one": { who: "the storm summary's group (as storm.drives); one captain or several, and \"ye\" takes the plural verb" },
  "storm.holds.many": { who: "the storm summary's group (as storm.holds.one)" },
  "storm.pinned.one": { who: "the storm summary's group (as storm.holds.one)" },
  "storm.pinned.many": { who: "the storm summary's group (as storm.holds.one)" },
  "bake.titleWatching": { who: "his T-25 wording (2026-08-26): \"{Captain}'s Bake-Off\" or \"{Your name}, Yer Bake-Off\" — two lines chosen in code; one line derives \"Yer Bake-Off\" and drops his name, and the bench's spec would carry a seat, not a name" },
  "bake.titleMine": { who: "the other half of his T-25 title (as bake.titleWatching)" },
  "counter.ask": { whose: "the asker's cargo, \"Crustbeard: what o' Wyatt's will ye have instead?\" — put to the countering captain alone, so the asker is never the reader and no screen reads it wrong today; but the one rule's own-screen form is \"what o' yer will ye have instead?\", which is not English (\"yers\"), and the template cannot say it" },
  "victory.bake.cobakers": { names: "a LIST of the captains who baked too — a co-baker reads their own name today; words.js cannot say a list, and one captain would read \"Wyatt — ye baked too — Best Baker went to the fullest hold\"" },
};
const LISTS = [["NAME_LABELS", NAME_LABELS], ["NO_SEAT", NO_SEAT], ["BY_RULING", BY_RULING], ["AWAITING_HIS_WORDING", AWAITING_HIS_WORDING]];
const allowed = (id, key) => LISTS.find(([, L]) => L[id] && Object.prototype.hasOwnProperty.call(L[id], key));

/* ── READING JAVASCRIPT, ENOUGH FOR THIS ────────────────────────────────────────────────────────────────────────────────────────────── */
const IDENT = /[A-Za-z_$][\w$]*/y;
const KEYWORDS = new Set("if else for while do return typeof instanceof new delete void in of const let var function async await true false null undefined this switch case break continue default try catch finally throw class extends super yield import export from".split(" "));
const regexCanStart = (code, i) => {
  let j = i - 1; while (j >= 0 && /\s/.test(code[j])) j--;
  if (j < 0) return true;
  if ("(,=:[!&|?{};+-*%<>~^".includes(code[j])) return true;
  const w = /[\w$]+$/.exec(code.slice(Math.max(0, j - 10), j + 1));
  return !!w && ["return", "typeof", "case", "in", "of", "void", "delete", "throw"].includes(w[0]);
};
/* skip a string, template or regex starting at i; returns the index just past it, or -1 if none starts here */
function skipLiteral(code, i) {
  const c = code[i];
  if (c === '"' || c === "'") { let j = i + 1; while (j < code.length && code[j] !== c && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1; return j + 1; }
  if (c === "`") {
    let j = i + 1;
    while (j < code.length && code[j] !== "`") {
      if (code[j] === "\\") { j += 2; continue; }
      if (code[j] === "$" && code[j + 1] === "{") { j = matchClose(code, j + 1) + 1; continue; }
      j++;
    }
    return j + 1;
  }
  if (c === "/" && code[i + 1] !== "/" && code[i + 1] !== "*" && regexCanStart(code, i)) {
    let j = i + 1, cls = false;
    while (j < code.length && code[j] !== "\n") {
      if (code[j] === "\\") { j += 2; continue; }
      if (code[j] === "[") cls = true; else if (code[j] === "]") cls = false; else if (code[j] === "/" && !cls) break;
      j++;
    }
    j++; while (/[a-z]/.test(code[j] || "")) j++;
    return j;
  }
  return -1;
}
/* the index of the bracket that closes the one at `open` */
function matchClose(code, open) {
  let d = 0;
  for (let i = open; i < code.length; i++) {
    const s = skipLiteral(code, i); if (s >= 0) { i = s - 1; continue; }
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") { d--; if (d === 0) return i; }
  }
  return code.length - 1;
}
/* split at top-level commas */
function splitTop(t) {
  const parts = []; let d = 0, last = 0;
  for (let i = 0; i < t.length; i++) {
    const s = skipLiteral(t, i); if (s >= 0) { i = s - 1; continue; }
    const c = t[i];
    if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--;
    else if (c === "," && d === 0) { parts.push([last, t.slice(last, i)]); last = i + 1; }
  }
  parts.push([last, t.slice(last)]);
  return parts;
}
/* the end of an expression that starts at i: a top-level , ; ) ] } or the end */
function exprEnd(code, i) {
  let d = 0;
  for (let j = i; j < code.length; j++) {
    const s = skipLiteral(code, j); if (s >= 0) { j = s - 1; continue; }
    const c = code[j];
    if ("([{".includes(c)) d++;
    else if (")]}".includes(c)) { if (d === 0) return j; d--; }
    else if ((c === "," || c === ";") && d === 0) return j;
  }
  return code.length;
}
/* the code of an expression with the words of every string blanked (a "pn(" typed inside a string is not a call) — interpolations kept */
function codeOnly(t) {
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"' || c === "'") { const e = skipLiteral(t, i); out += c + c + " ".repeat(Math.max(0, e - i - 2)); i = e - 1; continue; }
    if (c === "`") {
      let j = i + 1; out += "`";
      while (j < t.length && t[j] !== "`") {
        if (t[j] === "\\") { out += "  "; j += 2; continue; }
        if (t[j] === "$" && t[j + 1] === "{") { const k = matchClose(t, j + 1); out += "${" + codeOnly(t.slice(j + 2, k)) + "}"; j = k + 1; continue; }
        out += " "; j++;
      }
      out += "`"; i = j; continue;
    }
    if (c === "/" && regexCanStart(t, i)) { const e = skipLiteral(t, i); if (e > i + 1) { out += " ".repeat(e - i); i = e - 1; continue; } }
    out += c;
  }
  return out;
}

/* ── ONE FILE, READ ONCE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function parseFile(rel, src) {
  const code = stripComments(src);
  const fns = [];   // {name, params:[names], defaults:{name:expr}, start, end, bodyStart, bodyEnd, expr:boolean}
  const addFn = (name, paramOpen, arrowOrBodyAt) => {
    const pClose = matchClose(code, paramOpen);
    const params = [], defaults = {};
    for (const [, p] of splitTop(code.slice(paramOpen + 1, pClose))) {
      const m = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*(?:=([\s\S]*))?$/.exec(p);
      if (m) { params.push(m[1]); if (m[2]) defaults[m[1]] = m[2]; } else params.push(null);
    }
    let b = arrowOrBodyAt; while (/\s/.test(code[b])) b++;
    if (code[b] === "{") { const e = matchClose(code, b); fns.push({ name, params, defaults, start: paramOpen, end: e, bodyStart: b + 1, bodyEnd: e, expr: false }); }
    else { const e = exprEnd(code, b); fns.push({ name, params, defaults, start: paramOpen, end: e, bodyStart: b, bodyEnd: e, expr: true }); }
  };
  for (let i = 0; i < code.length; i++) {
    const s = skipLiteral(code, i); if (s >= 0) { i = s - 1; continue; }
    if (code.startsWith("function", i) && !/[\w$]/.test(code[i - 1] || "") && !/[\w$]/.test(code[i + 8] || "")) {
      let j = i + 8; while (/[\s*]/.test(code[j])) j++;
      IDENT.lastIndex = j; const m = IDENT.exec(code); let name = null;
      if (m) { name = m[0]; j = IDENT.lastIndex; }
      while (/\s/.test(code[j])) j++;
      if (code[j] === "(") { const pc = matchClose(code, j); addFn(name, j, pc + 1); }
      continue;
    }
    if (code[i] === "=" && code[i + 1] === ">") {
      // find the parameter list that ends just before =>
      let j = i - 1; while (/\s/.test(code[j])) j--;
      let paramOpen, pseudo = null;
      if (code[j] === ")") { let d = 0, k = j; for (; k >= 0; k--) { if (code[k] === ")") d++; else if (code[k] === "(") { d--; if (!d) break; } } paramOpen = k; }
      else { const m = /[A-Za-z_$][\w$]*$/.exec(code.slice(0, j + 1)); if (!m) continue; pseudo = m[0]; paramOpen = j + 1 - m[0].length; }
      let name = null;
      const before = code.slice(Math.max(0, paramOpen - 80), paramOpen);
      const nm = /([A-Za-z_$][\w$]*)\s*[=:]\s*(?:async\s*)?$/.exec(before);
      if (nm && !/[=!<>]=\s*(?:async\s*)?$/.test(before)) name = nm[1];
      if (pseudo) {
        let b = i + 2; while (/\s/.test(code[b])) b++;
        const params = [pseudo];
        if (code[b] === "{") { const e = matchClose(code, b); fns.push({ name, params, defaults: {}, start: paramOpen, end: e, bodyStart: b + 1, bodyEnd: e, expr: false }); }
        else { const e = exprEnd(code, b); fns.push({ name, params, defaults: {}, start: paramOpen, end: e, bodyStart: b, bodyEnd: e, expr: true }); }
      } else addFn(name, paramOpen, i + 2);
    }
  }
  return { rel, src, code, fns };
}
const scopesAt = (F, pos) => F.fns.filter((f) => f.start <= pos && pos <= f.end).sort((a, b) => (a.end - a.start) - (b.end - b.start));
/* the line in the REAL file (the comment-stripped text has fewer lines): the stripped text from `pos`, found in the source — shorter probes
   when a comment sat inside the first one */
const lineOf = (F, pos) => { for (const n of [60, 36, 22]) { const at = F.src.indexOf(F.code.slice(pos, pos + n)); if (at >= 0) return F.src.slice(0, at).split("\n").length; } return "?"; };

/* ── THE WHOLE READING ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const SEED_FNS = new Set(["pn", "pname", "poss", "rawName"]);   // the functions that make a captain's name
const MAKER = /(?<![\w$.])(?:pn|pname|poss|rawName)\s*\(|(?<![\w$.])NAMES\s*\[/;   // …and the default names they fall back on
const STRINGY = new Set("toUpperCase toLowerCase toLocaleUpperCase trim trimStart trimEnd slice substring substr replace replaceAll concat padStart padEnd repeat normalize toString at join map filter flat flatMap reverse sort split".split(" "));
const RECORD = /(?<![\w$.])(?:roster|seats)\b|\.\s*(?:roster|seats)\b/;   // a seat's own record, whose .name is a captain's name
function analyse(files) {
  const words = {};
  for (const m of files[WORDS_FILE].matchAll(/^\s*"([A-Za-z0-9_.]+)":\s*("(?:\\.|[^"\\\n])*")\s*,?\s*$/gm)) words[m[1]] = JSON.parse(m[2]);
  const F = Object.entries(files).filter(([rel]) => rel !== WORDS_FILE && rel.endsWith(".js")).map(([rel, src]) => parseFile(rel, src));

  /* the doors: say, sayAll, sayText, and every function that forwards its first two parameters to a door */
  const doors = new Map([["say", [0, 1, 2]], ["sayAll", [0, 1, -1]], ["sayText", [0, 1, 2]]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const f of F) for (const fn of f.fns) {
      if (!fn.name || doors.has(fn.name) || fn.params.length < 2 || !fn.params[0] || !fn.params[1]) continue;
      const body = f.code.slice(fn.bodyStart, fn.bodyEnd);
      for (const d of doors.keys()) if (new RegExp(`\\b${d}\\(\\s*${fn.params[0].replace(/\$/g, "\\$")}\\s*,\\s*${fn.params[1].replace(/\$/g, "\\$")}\\b`).test(body)) { doors.set(fn.name, [0, 1, -1]); changed = true; break; }
    }
  }
  const doorNames = [...doors.keys()];
  const DOOR_CALL = new RegExp(`(?<![\\w$.])(${doorNames.map((d) => d.replace(/\$/g, "\\$")).join("|")})\\(`, "g");
  const stripCalls = (t, names) => {
    const re = new RegExp(`(?<![\\w$.])(?:${names.join("|")})\\(`, "g"); let out = "", last = 0, m;
    while ((m = re.exec(t))) { const open = m.index + m[0].length - 1; const close = matchClose(t, open); out += t.slice(last, m.index) + "0"; last = close + 1; re.lastIndex = last; }
    return out + t.slice(last);
  };
  const clean = (t) => stripCalls(codeOnly(t), [...doorNames, "seat"]);

  /* every site a line is worded at */
  const sites = [];   // {F, pos, door, idText, idPos, factsText, factsPos}
  for (const f of F) {
    for (const m of f.code.matchAll(DOOR_CALL)) {
      const name = m[1], open = m.index + m[0].length - 1, close = matchClose(f.code, open);
      if (/function\s*$/.test(f.code.slice(Math.max(0, m.index - 12), m.index))) continue;
      const args = splitTop(f.code.slice(open + 1, close)), [idA, factsA] = doors.get(name);
      if (!args[idA] || !args[factsA]) continue;
      const idText = args[idA][1].trim();
      if (scopesAt(f, m.index).some((sc) => sc.params.includes(idText) && doors.has(sc.name))) continue;   // a door forwarding its own (id, facts)
      sites.push({ F: f, pos: m.index, door: name, idText, idPos: open + 1 + args[idA][0], factsText: args[factsA][1], factsPos: open + 1 + args[factsA][0] });
    }
    for (const m of f.code.matchAll(/\bid\s*:\s*([^,{}]*?"[A-Za-z][A-Za-z0-9_.]*"[^,{}]*?)\s*,\s*facts\s*:\s*/g)) {
      const at = m.index + m[0].length;
      const factsText = f.code[at] === "{" ? f.code.slice(at, matchClose(f.code, at) + 1) : f.code.slice(at, exprEnd(f.code, at));
      sites.push({ F: f, pos: m.index, door: "{id,facts}", idText: m[1], idPos: m.index, factsText, factsPos: at });
    }
  }
  /* a field a name was stored in — `baker:pn(i)` — read as `.baker` (a line's own facts are placeholders, not fields) */
  const factRanges = sites.map((s) => [s.F.rel, s.factsPos, s.factsPos + s.factsText.length]);
  const taintedProps = new Set();
  for (const f of F) for (const m of f.code.matchAll(/(?<=[{,]\s*)([A-Za-z_$][\w$]*)\s*:(?!:)/g)) {
    if (factRanges.some(([r, a, b]) => r === f.rel && m.index >= a && m.index < b)) continue;
    if (MAKER.test(clean(f.code.slice(m.index + m[0].length, exprEnd(f.code, m.index + m[0].length))))) taintedProps.add(m[1]);
  }
  taintedProps.delete("name");

  /* WHERE A NAME IS BOUND — the innermost function around `pos` that has it as a parameter or assigns it; else a top-level assignment */
  const reEsc = (n) => n.replace(/\$/g, "\\$");
  function assignmentsIn(f, name, a, b) {
    const out = [], e = reEsc(name), seg = f.code.slice(a, b);
    for (const m of seg.matchAll(new RegExp(`(?<![\\w$.])${e}\\s*(?:\\[[^\\]]*\\]\\s*)?=(?![=>])`, "g"))) { const s = a + m.index + m[0].length; out.push([s, f.code.slice(s, exprEnd(f.code, s))]); }
    for (const m of seg.matchAll(new RegExp(`(?<![\\w$.])${e}\\s*\\.\\s*(?:push|unshift)\\(`, "g"))) { const o = a + m.index + m[0].length - 1; out.push([o + 1, f.code.slice(o + 1, matchClose(f.code, o))]); }
    for (const m of seg.matchAll(new RegExp(`(?:const|let|var)\\s+${e}\\s+(?:of|in)\\s+`, "g"))) { const s = a + m.index + m[0].length; out.push([s, f.code.slice(s, exprEnd(f.code, s))]); }
    return out;
  }
  function binding(f, name, pos) {
    for (const sc of scopesAt(f, pos)) {
      const param = sc.params.includes(name), assigns = assignmentsIn(f, name, sc.start, sc.end);
      if (param || assigns.length) return { sc, param, assigns };
    }
    const assigns = assignmentsIn(f, name, 0, f.code.length).filter(([s]) => !f.fns.some((fn) => fn.start <= s && s <= fn.end));
    return assigns.length ? { sc: null, param: false, assigns } : null;
  }
  const callSites = (fnName) => F.flatMap((g) => [...g.code.matchAll(new RegExp(`(?<![\\w$.])${reEsc(fnName)}\\(`, "g"))].map((m) => {
    const open = m.index + m[0].length - 1;
    return { g, at: m.index, open, args: splitTop(g.code.slice(open + 1, matchClose(g.code, open))) };
  }));

  /* TAINT — does this expression carry a ready-made name? The roads it follows, and no others: a name maker (pn, pname, poss, rawName, the
     default NAMES), a name read off a seat's record (the roster, a room's seats), a field a name was stored in, a variable or array holding
     any of those, an alias of a name maker, a helper whose RETURN is any of those, a template literal around any of those, and — for the
     function a line is worded in — a parameter, followed ONE hop to every call of that function. A helper's own parameters are never
     followed (what it returns for a seat is not a name), which is what keeps `$(id)` and `ask(opts)` from dragging the whole game in.
     `st.why` collects the road taken, for the failure message. */
  const memo = new Map();
  const deeper = (st, extra) => Object.assign({}, st, { depth: st.depth + 1 }, extra || {});
  function taint(f, text, pos, st) {
    if (st.depth > 10) return false;
    const c = clean(text);
    const mk = MAKER.exec(c); if (mk) { st.why.push(mk[0].replace(/\s+/g, "") + "…"); return true; }
    if (/\.\s*name\b/.test(c)) {
      if (RECORD.test(c)) { st.why.push("a name read off the roster or a room's seats"); return true; }
      for (const m of c.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]]*\])*\s*\.\s*name\b/g))
        if (recordTaint(f, m[1], pos, deeper(st))) { st.why.push(`${m[1]}….name, a seat's record`); return true; }
    }
    // a stored field is read where a line is worded, or into a variable on the way there — never inside a helper's body, where fields are
    // a prompt's option labels and the answer that comes back is a choice, not a name
    if (!st.inCallee) for (const p of taintedProps) if (new RegExp(`\\.\\s*${reEsc(p)}\\b`).test(c)) { st.why.push(`the field .${p}, which holds a name`); return true; }
    for (const m of c.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)/g)) {
      const name = m[1]; if (KEYWORDS.has(name)) continue;
      const after = c.slice(m.index + name.length), before = c.slice(0, m.index).replace(/\s+$/, "");
      if (/^\s*:/.test(after) && /[{,]$/.test(before)) continue;   // an object's key, not a value
      // a member of something: only a string's own methods pass its name on ("who.toUpperCase()", "names.join(', ')"); any other field
      // is a different value (bake.attempts, list.size), and a field that holds a name is caught above by its own name
      const member = /^\s*\??\.\s*([A-Za-z_$][\w$]*)/.exec(after);
      if (member && !STRINGY.has(member[1])) continue;
      const call = !member && /^\s*\(/.test(after);
      if (call ? calleeTaint(f, name, pos, deeper(st)) : varTaint(f, name, pos, deeper(st))) { st.why.push(call ? `${name}(…)` : name); return true; }
    }
    return false;
  }
  function varTaint(f, name, pos, st) {
    const b = binding(f, name, pos); if (!b) return false;
    const key = `v|${f.rel}|${b.sc ? b.sc.start : -1}|${name}|${st.hops}`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false);
    let t = b.assigns.some(([s, rhs]) => taint(f, rhs, s, st));
    if (!t && b.param) {
      if (b.sc.defaults[name]) t = taint(f, b.sc.defaults[name], b.sc.start, st);
      if (!t && st.hops < 1 && b.sc.name && !doors.has(b.sc.name)) {
        const idx = b.sc.params.indexOf(name);
        for (const cs of callSites(b.sc.name)) {
          if (cs.g === f && cs.open === b.sc.start) continue;
          if (cs.args[idx] && taint(cs.g, cs.args[idx][1], cs.open + 1 + cs.args[idx][0], deeper(st, { hops: st.hops + 1 }))) { st.why.push(`handed to ${b.sc.name}() as ${name} at ${cs.g.rel}:${lineOf(cs.g, cs.at)}`); t = true; break; }
        }
      }
    }
    memo.set(key, t);
    return t;
  }
  function recordTaint(f, name, pos, st) {
    if (/^(?:roster|seats)$/.test(name)) return true;
    const b = binding(f, name, pos); if (!b) return false;
    const key = `r|${f.rel}|${b.sc ? b.sc.start : -1}|${name}|${st.hops}`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false);
    let t = b.assigns.some(([s, rhs]) => { const c = clean(rhs); return RECORD.test(c) || [...c.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?!\s*\()/g)].some((m) => !KEYWORDS.has(m[1]) && m[1] !== name && st.depth < 8 && recordTaint(f, m[1], s, deeper(st))); });
    if (!t && b.param && st.hops < 1 && b.sc.name && !doors.has(b.sc.name)) {
      const idx = b.sc.params.indexOf(name);
      for (const cs of callSites(b.sc.name)) {
        if (cs.g === f && cs.open === b.sc.start) continue;
        if (cs.args[idx] && RECORD.test(clean(cs.args[idx][1]))) { t = true; break; }
      }
    }
    memo.set(key, t);
    return t;
  }
  function calleeTaint(f, name, pos, st) {
    if (SEED_FNS.has(name)) return true;
    if (doors.has(name) || name === "seat") return false;
    const b = binding(f, name, pos);   // an alias of a name maker: const nm=pn
    if (b && b.assigns.some(([, rhs]) => { const r = rhs.trim(); return /^[A-Za-z_$][\w$]*$/.test(r) && r !== name && calleeTaint(f, r, pos, deeper(st)); })) { st.why.push(`${name}, an alias`); return true; }
    const local = f.fns.filter((fn) => fn.name === name && scopesAt(f, pos).some((sc) => sc.start <= fn.start && fn.end <= sc.end));
    const defs = local.length ? local.map((fn) => [f, fn]) : F.flatMap((g) => g.fns.filter((fn) => fn.name === name && !g.fns.some((o) => o !== fn && o.start < fn.start && fn.end < o.end)).map((fn) => [g, fn]));
    if (!defs.length) return false;
    const key = `c|${defs.map(([g, fn]) => g.rel + ":" + fn.start).join(",")}|${name}`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false);
    let t = false;
    for (const [g, fn] of defs) {
      const inner = deeper(st, { hops: 1, inCallee: true });
      if (fn.expr) { if (taint(g, g.code.slice(fn.bodyStart, fn.bodyEnd), fn.bodyStart, inner)) { t = true; break; } continue; }
      const body = g.code.slice(fn.bodyStart, fn.bodyEnd);
      for (const m of body.matchAll(/(?<![\w$.])return\b/g)) { const s = fn.bodyStart + m.index + 6; if (taint(g, g.code.slice(s, exprEnd(g.code, s)), s, inner)) { t = true; break; } }
      if (t) break;
    }
    memo.set(key, t);
    return t;
  }
  const idsOf = (s) => {
    let t = s.idText;
    for (const m of codeOnly(s.idText).matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?!\s*\()/g)) {
      if (KEYWORDS.has(m[1])) continue;
      const b = binding(s.F, m[1], s.pos);
      if (b && !b.param) t += " " + b.assigns.map(([, r]) => r).join(" ");
    }
    return [...new Set([...t.matchAll(/"([A-Za-z][A-Za-z0-9_.]*)"/g)].map((m) => m[1]).filter((id) => id in words))];
  };
  const factsOf = (s) => {
    let text = s.factsText.trim(), pos = s.factsPos;
    if (/^[A-Za-z_$][\w$]*$/.test(text)) {
      const b = binding(s.F, text, s.pos);
      const obj = b && b.assigns.find(([, r]) => r.trim().startsWith("{"));
      if (obj) { pos = obj[0] + (obj[1].length - obj[1].trimStart().length); text = obj[1].trim(); }
    }
    if (!text.startsWith("{")) return null;
    const inner = text.slice(1, matchClose(text, 0));
    return splitTop(inner).map(([o, p]) => {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([\s\S]*))?$/.exec(p);
      return m ? { key: m[1], value: (m[2] ?? m[1]), pos: pos + 1 + o } : null;
    }).filter(Boolean);
  };

  /* a "ye" typed by hand: the word itself as a string, or words.js's "list.ye" — in the value, or in the variable it names */
  const HAND_YE = /(["'`])(?:ye|yer|Ye|Yer)\1|"list\.ye"/;
  const handYe = (s, value, pos) => {
    if (HAND_YE.test(value)) return true;
    const v = codeOnly(value).trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(v)) return false;
    const b = binding(s.F, v, pos);
    return !!b && b.assigns.some(([, r]) => HAND_YE.test(r));
  };

  const names = [], notSeat = [], unread = [], handed = new Set();
  for (const s of sites) {
    const ids = idsOf(s), facts = factsOf(s), where = `${s.F.rel}:${lineOf(s.F, s.pos)}`;
    if (!facts) { if (!/^\{\s*\}$/.test(s.factsText.trim())) unread.push(`${where} ${s.door}(${s.idText.slice(0, 30)}, ${s.factsText.trim().slice(0, 30)})`); continue; }
    for (const { key, value, pos } of facts) {
      if (key === "icon") continue;
      const why = [];
      const named = taint(s.F, value, pos, { depth: 0, hops: 0, why });
      if (named) {
        for (const id of ids.length ? ids : ["?"]) {
          handed.add(`${id}|${key}`);
          if (!allowed(id, key)) names.push(`${where}  "${id}" {${key}} is handed a ready-made name: ${value.trim().replace(/\s+/g, " ").slice(0, 60)}  (by way of ${[...new Set(why)].reverse().join(" ← ")})`);
        }
        continue;
      }
      for (const id of ids) {
        if (allowed(id, key)) continue;
        if (handYe(s, value, pos)) { notSeat.push(`${where}  "${id}" {${key}} is handed a "ye" built by hand: ${value.trim().replace(/\s+/g, " ").slice(0, 60)}`); continue; }
        const t = words[id] || "";
        if (!new RegExp(`\\{${key}(?:'s|:)`).test(t)) continue;   // this line words {key} both ways: it is a captain's placeholder
        const v = codeOnly(value).trim();
        if (/(?<![\w$.])seat\(/.test(v) || /^(null|undefined)$/.test(v)) continue;
        if (/^[A-Za-z_$][\w$]*$/.test(v)) {   // a variable holding seat(…)
          let ok = false;
          const bv = binding(s.F, v, pos); if (bv && !bv.param) ok = bv.assigns.every(([, r]) => /(?<![\w$.])seat\(/.test(codeOnly(r)));
          if (ok) continue;
        }
        notSeat.push(`${where}  "${id}" {${key}} is a captain's placeholder, handed ${value.trim().replace(/\s+/g, " ").slice(0, 60)} — not seat(…)`);
      }
    }
  }
  const labelOnly = Object.entries(words).filter(([id, t]) => /\{name(?:'s|:|\})/.test(t) && !allowed(id, "name")).map(([id, t]) => `"${id}": ${JSON.stringify(t)}`);
  const staleLists = [];
  for (const [list, L] of LISTS) for (const [id, keys] of Object.entries(L)) for (const key of Object.keys(keys)) {
    if (!(id in words)) staleLists.push(`${list} "${id}" — words.js has no such line`);
    else if (!new RegExp(`\\{${key}(?:'s|:[^{}|]*\\|[^{}]*)?\\}`).test(words[id])) staleLists.push(`${list} "${id}" {${key}} — the line holds no {${key}}`);
    else if (list !== "NAME_LABELS" && !handed.has(`${id}|${key}`)) staleLists.push(`${list} "${id}" {${key}} — no longer handed a name anywhere: it takes a seat now, so take it off the list`);
  }
  return { words, sites, doors: doorNames, names, notSeat, labelOnly, staleLists, unread, taintedProps: [...taintedProps] };
}

function rules(files) {
  const A = analyse(files), out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  rule(!A.names.length,
    `no ready-made name reaches a line about a captain — ${A.sites.length} places a line is worded (doors: ${A.doors.join(", ")}, and {id, facts}), every name followed through variables, aliases, helpers, parameters, templates, arrays and stored fields`,
    `${A.names.length} line(s) about a captain are handed a ready-made name, so that captain's own screen can never read "ye" — hand over seat(i), or, if the line is put TO a captain or labels one, add it to NAME_LABELS with the reason:\n    ${A.names.join("\n    ")}`);
  rule(!A.notSeat.length,
    "every captain's placeholder is handed the captain — seat(…)",
    `${A.notSeat.length} captain's placeholder(s) are handed something other than seat(…) — "ye" is derived by words.js from the seat, never built by hand:\n    ${A.notSeat.join("\n    ")}`);
  rule(!A.labelOnly.length,
    "every line that holds {name} — the label placeholder — is on a list, with its reason",
    `${A.labelOnly.length} line(s) hold {name} but are on no list — a line ABOUT a captain words them with a captain's placeholder ({p} {p:is|are}):\n    ${A.labelOnly.join("\n    ")}`);
  rule(!A.staleLists.length,
    `the lists are true: ${Object.keys(NAME_LABELS).length} address/label lines, ${Object.keys(NO_SEAT).length} with no seat to hand, ${Object.keys(BY_RULING).length} by his ruling, ${Object.keys(AWAITING_HIS_WORDING).length} awaiting his wording — each still exists, and each still handed a name is`,
    `list entr(y/ies) that no longer hold:\n    ${A.staleLists.join("\n    ")}`);
  return { out, A };
}

/* ── THE REAL TREE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const files = Object.fromEntries(walk("src").map((f) => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = rules(files);
for (const r of real.out) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
if (real.A.unread.length) console.log(`  note  ${real.A.unread.length} place(s) word a line from facts they did not build here (a door's generic renderer reading {id, facts} data, checked where that data is made): ${real.A.unread.join("; ")}`);

/* 5. POSED — the hit line itself, filled by the game's own fill() for the scorer's screen and for another screen */
const { fill, seat, WORDS } = await import(pathToFileURL(path.join(REPO, WORDS_FILE)).href);
const look = (viewer) => ({ me: (i) => i === viewer, name: (i) => `Captain${i}`, poss: (i) => `Captain${i}'s` });
const own = fill(WORDS["battle.hit"], { w: seat(2) }, look(2)), other = fill(WORDS["battle.hit"], { w: seat(2) }, look(0));
const posedOk = /\bye land a hit!/.test(own) && !/Captain2 lands/.test(own) && other === "Captain2 lands a hit!";
console.log(`  ${posedOk ? "PASS" : "FAIL"}  posed: the hit line reads "${own}" on the scorer's own screen and "${other}" on every other`);

/* ── RED-PROOF — each break below must turn the rule that guards against it red, on the real tree with one file changed ─────────────── */
const orch = files["src/orchestrator.js"], flow = files["src/ui/flow.js"], wordsSrc = files[WORDS_FILE];
const withFile = (rel, text) => (text == null ? null : { ...files, [rel]: text });
const swap = (src, a, b) => (src.includes(a) ? src.replace(a, b) : null);
const addToFlow = (code) => withFile("src/ui/flow.js", flow + "\n" + code + "\n");
const HIT_NOW = `:why==="hit"?{id:"battle.hit",facts:{w:seat(scorerIdx)},cls:"score"}`;
const itemOneBack = (() => {   // the item-1 line exactly as it stood at f1de861e: an alias, a variable, a finished name
  let s = swap(orch, HIT_NOW, ":why===\"hit\"?`<span class=\"score\">${say(\"battle.hit\",{name:hitName})}</span>`");
  s = s && swap(s, "  const rmsg=\n", "  const hitName=nm(scorerIdx);\n  const rmsg=\n");
  s = s && swap(s, "  let round=0;\n", "  let round=0;\n  const nm=pn;\n");
  return s;
})();
const MUTANTS = [
  ["the item-1 hit line put back (const nm=pn; const hitName=nm(scorerIdx); say(\"battle.hit\",{name:hitName}))", withFile("src/orchestrator.js", itemOneBack), 0],
  ["the item-1 hit line's words put back (\"battle.hit\": \"{name} lands a hit!\")", withFile(WORDS_FILE, swap(wordsSrc, `"battle.hit": "{w} {w:lands|land} a hit!",`, `"battle.hit": "{name} lands a hit!",`)), 2],
  ["a name in a variable (const who=pname(i); say(\"battle.hit\",{w:who}))", addToFlow(`function __m1(i){const who=pname(i);return say("battle.hit",{w:who});}`), 0],
  ["a name handed to a helper's parameter (function tell(x){say(\"wait.deciding\",{p:x})} … tell(pn(2)))", addToFlow(`function __tell(x){return say("wait.deciding",{p:x});}\nfunction __m2(){return __tell(pn(2));}`), 0],
  ["a name in a template literal ({p:`<b>${pname(i)}</b>`})", addToFlow("function __m3(i){return say(\"wait.sailing\",{p:`<b>${pname(i)}</b>`});}"), 0],
  ["a helper's return (const list=s=>s.map(i=>pn(i)).join(); {who:list(x)} on a line about a captain)", addToFlow(`function __m4(x){const list=s=>s.map(i=>pn(i)).join(", ");return say("battle.waitFor",{a:seat(0),d:seat(1),who:list(x)});}`), 0],
  ["a name stored in a field (const spec={chef:pn(i)}; {p:spec.chef})", addToFlow(`function __m5(i){const spec={chef:pn(i)};return __use5(spec);}\nfunction __use5(spec){return say("wait.ovens",{p:spec.chef});}`), 0],
  ["the refused hail put back (a line id behind a comparison: say(r.why===\"blocking\"?…,{q:pn(r.q.idx)}))", withFile("src/ui/flow.js", swap(flow, `{q:seat(r.q.idx)},player.idx)`, `{q:pn(r.q.idx)})`)), 0],
  ["the crow's-nest alias put back (const bets=[],ns=pn; … say(\"call.made\",{p:ns(s.idx),…}))", addToFlow(`function __m7(s){const bets=[],ns=pn;return sayFlash("call.made",{p:ns(s.idx),called:seat(1)},900);}`), 0],
  ["a {id, facts} result handed a name ({id:\"battle.loads\",facts:{a:nm(i)}} with nm=pn)", addToFlow(`function __m8(i){const nm=pn;return {id:"battle.loads",facts:{a:nm(i)}};}`), 0],
  ["the offered trade's offerer as a finished name (say(\"trade.offered\",{q:pn(q.idx),p:pn(asker.idx),…}) — {q} is excused, {p} is not)", withFile("src/ui/flow.js", swap(flow, `{q:pn(q.idx),p:seat(asker.idx),`, `{q:pn(q.idx),p:pn(asker.idx),`)), 0],
  ["a hand-built \"ye\" with no name in it ({p:isLocalTo(i,v)?\"ye\":\"a captain\"})", addToFlow(`function __m9(i,v){return say("wait.deciding",{p:isLocalTo(i,v)?"ye":"a captain"});}`), 1],
  ["a stopped line left on the list after it takes a seat (bake.titleMine handed seat(0))", withFile("src/ui/bakeoff.js", swap(files["src/ui/bakeoff.js"], `say(watching?"bake.titleWatching":"bake.titleMine",{who})`, `say(watching?"bake.titleWatching":"bake.titleMine",{who:seat(0)})`)), 3],
];
let proofOk = true;
/* words_one_place_check's own rule-4 red-proof, carried over: three calls, two about a captain (red) and one put TO a captain (green) —
   with its `nm` now an alias of pn() the gate must see through, rather than a spelling it trusted */
{
  const old4 = addToFlow(`function __old4(ok){const nm=pn;const x=say("wait.deciding",{p:pn(3)});const y=say(ok?"battle.showsHeads":"battle.showsTails",{a:nm(1)});const z=say("act.ask",{name:pn(2)});return [x,y,z];}`);
  const delta = analyse(old4).names.length - real.A.names.length;
  const ok = delta === 3;   // wait.deciding {p}, battle.showsHeads {a}, battle.showsTails {a} — and not act.ask {name}
  if (!ok) proofOk = false;
  console.log(`  ${ok ? "PASS" : "FAIL"}  red-proof: words_one_place_check's old rule-4 mutant — ${delta} finding(s), expected 3 (two lines about a captain, one of them behind a ternary, and not the question put TO a captain)`);
}
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant).out : null;
  const red = !!res && !res[idx].ok;
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved — re-anchor it)"}`);
}
const GREENS = [
  ["a question put TO a captain by name (say(\"act.ask\",{name:pn(i)}))", addToFlow(`function __g1(i){return say("act.ask",{name:pn(i)});}`)],
  ["a line handed the captain through a variable (const who=seat(i); say(\"wait.deciding\",{p:who}))", addToFlow(`function __g2(i){const who=seat(i);return say("wait.deciding",{p:who});}`)],
];
for (const [what, tree] of GREENS) {
  const res = rules(tree).out, green = res.every((r) => r.ok);
  if (!green) proofOk = false;
  console.log(`  ${green ? "PASS" : "FAIL"}  green-proof: ${what} ${green ? "stays green" : "GOES RED — the gate would forbid what is allowed: " + res.filter((r) => !r.ok).map((r) => r.text.split("\n")[0]).join(" / ")}`);
}

const fails = real.out.filter((r) => !r.ok).length + (posedOk ? 0 : 1);
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — every line about a captain takes the captain, so "ye" is derived where it is read; ${Object.keys(AWAITING_HIS_WORDING).length} line(s) await his wording, named above`);
process.exit(fails || !proofOk ? 1 : 0);
