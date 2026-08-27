#!/usr/bin/env node
/* SEAT-ARG GATE — the name renderers take a SEAT INDEX, and nothing else.
 *
 * WHY THIS EXISTS. playtest 22: "when i counter-offer a bot trade the entire game stalls and
 * stops... it happened immediately when i clicked counter offer." The whole fault was
 *
 *     poss(pn(p.idx))          // flow.js, the counter-offer crate picker
 *
 * pn() and poss() BOTH take a seat index and both render the name themselves, so the inner call
 * handed the outer one a finished `<b style=…>Dough Hook</b>` string. pname() then evaluates
 *
 *     const fallback = NAMES[i].replace("Capt. ", "");
 *
 * unconditionally, before any early return — NAMES is a plain array, NAMES["<b …>"] is undefined,
 * and .replace throws a TypeError on the first line of the first counter prompt.
 *
 * WHAT MAKES IT WORTH A GATE RATHER THAN A FIX. Nothing above that call catches. The throw killed
 * the voyage in silence — no prompt, no error on screen, no line in the captain's log — and on a
 * refresh the decision-log replay hit the recorded Counter press and died again before the board
 * was driven, so the game came back at the starting position. It shipped in the counter rebuild
 * and survived TWO later sessions that were each fixing "the counter", because both were reasoning
 * about what a counter settles: everything downstream of a prompt that never rendered.
 *
 * no_undef_check.js cannot see this — `poss` is defined and imported, and it is the ARGUMENT that
 * is wrong. This is the check for that.
 *
 * WHAT IT REJECTS, and only this: an argument to pn/poss/pname/rawName that is itself a rendered
 * name (a nested call to any of the four), or a string/template literal. Those are the two shapes
 * that cannot be a seat index. Identifiers, member expressions, numbers, ternaries and arithmetic
 * all pass untouched — the gate must not become something a real call site has to route around.
 *
 * Run: node scripts/seat_arg_check.js
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const RENDERERS = ["pn", "poss", "pname", "rawName"];

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out.sort();
}

/* COMMENTS ARE BLANKED FIRST, and that is not tidiness — the first run of this gate failed on the
 * comment that documents the bug it exists to catch, which quotes `poss(pn(p.idx))` verbatim. A
 * check that cannot tell prose from code makes writing the explanation an offence. Blanked rather
 * than deleted (newlines kept) so reported line numbers still match the file on disk. */
function stripComments(src) {
  let out = "", i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (quote) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    /* A REGEX LITERAL IS SKIPPED WHOLE, because this source contains `/"/g` (util.js's HTML
     * escaper): read naively, that lone `"` opens a string that swallows the rest of the line and
     * takes real code out of the scan with it. Standard heuristic — a `/` is a regex only where a
     * value cannot already have ended. */
    if (c === "/" && d !== "/" && d !== "*" && /[([{=,;:!&|?+\-*%~^<>]$|\breturn$|\btypeof$/.test(out.trimEnd())) {
      out += c; i++;
      let cls = false;
      for (; i < src.length; i++) {
        const e = src[i];
        out += e === "\n" ? "\n" : e;
        if (e === "\\") { i++; if (i < src.length) out += src[i]; continue; }
        if (e === "[") cls = true;
        else if (e === "]") cls = false;
        else if (e === "/" && !cls) { i++; break; }
        else if (e === "\n") break;   // not a regex after all — bail rather than run away
      }
      continue;
    }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2), stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === "\n" ? "\n" : " ";
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* The first argument's SOURCE TEXT, read by balancing parens/brackets/braces from the open paren.
 * Quotes and template literals are skipped whole so a comma or paren inside a string cannot end
 * the scan early — which matters here, since every one of these calls lives inside a template. */
function firstArg(src, openIdx) {
  let depth = 0, i = openIdx, quote = null;
  const start = openIdx + 1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { depth--; if (depth === 0) return src.slice(start, i); }
    else if (c === "," && depth === 1) return src.slice(start, i);
  }
  return null;   // unbalanced — not this gate's business to report
}

const nestedRenderer = new RegExp(`\\b(${RENDERERS.join("|")})\\s*\\(`);
const failures = [];
/* Counted and PRINTED, because the comment stripper above is the one part of this gate that could
 * quietly delete the thing it inspects — a stripper that over-blanks reports a clean run over
 * nothing at all, which is the shape of check this project has shipped before and had to withdraw.
 * A green line with a plausible site count is falsifiable; a bare "OK" is not. */
let sites = 0;

for (const file of jsFiles(SRC)) {
  const src = stripComments(readFileSync(file, "utf8"));
  const rel = relative(ROOT, file);
  // call position only, and never a declaration — `export function poss(i){` is not a call site
  const callRe = new RegExp(`(^|[^\\w.$])(${RENDERERS.join("|")})\\s*\\(`, "g");
  let m;
  while ((m = callRe.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 24), m.index + m[1].length);
    if (/\b(function|class)\s*$/.test(before)) continue;
    const open = m.index + m[0].length - 1;
    const arg = firstArg(src, open);
    if (arg == null) continue;
    sites++;
    const text = arg.trim();
    const line = src.slice(0, m.index).split("\n").length;
    const why = nestedRenderer.test(text)
      ? `argument is itself a rendered name — ${RENDERERS.join("/")}() take a seat index`
      : /^["'`]/.test(text)
        ? "argument is a string literal, not a seat index"
        : null;
    if (why) failures.push(`${rel}:${line}  ${m[2]}(${text})\n    ${why}`);
  }
}

if (failures.length) {
  console.error(`seat_arg_check: ${failures.length} bad seat argument(s) of ${sites} call sites\n`);
  for (const f of failures) console.error("  " + f + "\n");
  process.exit(1);
}
console.log(`seat_arg_check: OK — all ${sites} ${RENDERERS.join("/")}() call sites are passed a seat index`);
