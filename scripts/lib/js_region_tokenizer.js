// scripts/lib/js_region_tokenizer.js
//
// Phase 10 (App State & De-globalization), Plan 01, Task 2. The single shared string/comment-aware
// tokenizer for the classic-script region of index.html (index.html:859-4667). Built once here and
// reused by BOTH scripts/migrate_app_state.js (the rewrite tool) and scripts/state_contract_check.js
// (the standing gate) -- per RESEARCH.md's Pattern 2 and Pitfall 1, a blind `\bNAME\b` regex
// substitution is EMPIRICALLY confirmed to corrupt real content in this exact file: `$("game")`
// (a DOM id lookup) and `"Pirated for the love of the game."` (a UI-copy string) both contain the
// bare word `game` in a non-identifier position. A quote-boundary regex lookaround catches the
// first case but not the second (prose mid-string, not adjacent to a quote) -- only a real
// character-by-character tokenizer, tracking whether the cursor is inside a string/comment, closes
// this reliably.
//
// Zero dependencies beyond node:fs/path/url, matching every other scripts/ tool in this repo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");
export const INDEX_HTML = path.join(ROOT, "index.html");

/**
 * BLANK EVERY COMMENT, KEEP EVERY BYTE — the one comment strip that is safe in this repo.
 *
 * Added 03-01 (Phase 3, TEST-04) as the SINGLE definition of a technique three gates needed at
 * once: host_guest_parity_check.js (which wrote the first version and now imports this),
 * net_contract_check.js and wind_dot_contract_check.js. One spelling of "what is a comment"
 * (CLAUDE.md rule 23).
 *
 * WHY IT IS NOT A `//`-TO-END-OF-LINE STRIP, which is the obvious implementation and is wrong
 * here. src/net/index.js carries the Firebase `databaseURL` — a `https://...` literal — so a
 * trailing strip truncates that line at the `//` INSIDE THE STRING, and any real violation later
 * on the same line is silently discarded. net_contract_check.js's header is a whole section about
 * that false negative and it is correct. This uses classify() below instead, which knows a `//`
 * inside a string literal is string content, so the databaseURL line survives intact and complete.
 *
 * WHY IT IS NOT A "DROP WHOLE-LINE COMMENTS" FILTER EITHER, which was this function's first
 * implementation and was replaced the same night. Against 4/ the two NO-APP-STATE hits were
 * src/net/writers.js:174 and :193 — CONTINUATION lines inside a long `/* ... *\/` block, which
 * begin with ordinary prose and match no comment-opening pattern at all. A regex that cannot
 * track block-comment state cannot see them, and a gate that only half-strips is worse than one
 * that does not strip, because its remaining false positives look like real findings.
 *
 * EVERY BYTE IS PRESERVED: comment characters become spaces, newlines stay newlines. So character
 * OFFSETS and LINE NUMBERS are both unchanged, and a caller can brace-match, slice a function body
 * by content, or report `file:line` against the stripped text and still be pointing at the truth.
 *
 * STRINGS ARE NOT TOUCHED. Only comments. A denylisted name inside a real string literal is still
 * found — which matters, because net_contract_check.js's denylist was written knowing that
 * Firebase path strings legitimately contain some of these words.
 *
 * AND THE TRAP THAT COMES WITH IT: an assertion whose SUBJECT IS A COMMENT must not use this.
 * scripts/engine_contract_check.js counts an order-is-load-bearing annotation that exists only in
 * comments; stripping first would count zero and pass forever — a vacuous check that still reads
 * as protection (docs/HARD-WON-LESSONS.md §2, §3). Strip PER-ASSERTION, never globally.
 *
 * @param {string} src
 * @returns {string} the same source, same length, with comment characters replaced by spaces.
 */
export function stripCommentSegments(src) {
  const out = src.split("");
  for (const seg of classify(src)) {
    if (seg.type !== "comment") continue;
    for (let i = seg.start; i < seg.end; i++) {
      if (out[i] !== "\n") out[i] = " ";
    }
  }
  return out.join("");
}

const BARE_SCRIPT_OPEN = "<script>";
const SCRIPT_CLOSE = "</script>";

/**
 * Locates the classic-script region inside a full index.html source string. Uses the SAME
 * bare-attribute-less-<script>-tag convention scripts/lib/load_engine.js's header and
 * docs/MODULES.md's "extraction hazard" section already document as matching exactly once in the
 * whole file -- NOT a hardcoded line number. Line numbers drift as index.html is edited across
 * this phase's seven plans; the marker does not.
 *
 * 11-07 (bridge removal): the bare `<script>` tag pair itself is deleted once the classic region
 * is fully extracted (D-08 — index.html reduces to markup + Firebase compat classics + the one
 * module entry). A missing bare-tag is therefore now a legitimate TERMINAL state, not an error —
 * every consumer (scripts/ui_contract_check.js's classic-region-empty assertion,
 * scripts/state_contract_check.js's per-name declaration/bare-usage/reassignment scans,
 * scripts/migrate_app_state.js) must keep degrading to "region is empty" rather than throwing,
 * since this codebase's own end-state deletes the tag they used to locate. Only a genuine
 * SECOND bare `<script>` tag (an accidental reintroduction) is still treated as an error below.
 *
 * @param {string} html - the full index.html source text
 * @returns {{start:number, end:number, source:string, removed:boolean}} start/end are character
 *   offsets into `html` bounding the region EXCLUSIVE of the `<script>`/`</script>` tags
 *   themselves. When the bare tag no longer exists at all, `removed` is `true` and
 *   `start`/`end`/`source` describe an empty region at the end of the file.
 */
export function locateClassicScriptRegion(html) {
  const openIdx = html.indexOf(BARE_SCRIPT_OPEN);
  if (openIdx === -1) {
    // The classic region has been fully extracted and its bare <script> tag deleted (11-07,
    // D-08) — an empty region, not a violation. Every caller treats "nothing found" identically
    // to "region scanned and found empty".
    return { start: html.length, end: html.length, source: "", removed: true };
  }
  const secondOpenIdx = html.indexOf(BARE_SCRIPT_OPEN, openIdx + BARE_SCRIPT_OPEN.length);
  if (secondOpenIdx !== -1) {
    throw new Error(`js_region_tokenizer: a SECOND bare <script> open tag was found at offset ${secondOpenIdx} — docs/MODULES.md's "extraction hazard" rule requires every new <script> tag to carry attributes; this tokenizer would silently extract the wrong region otherwise.`);
  }
  const start = openIdx + BARE_SCRIPT_OPEN.length;
  const end = html.indexOf(SCRIPT_CLOSE, start);
  if (end === -1) {
    throw new Error("js_region_tokenizer: no matching `</script>` close tag found after the bare <script> open tag");
  }
  return { start, end, source: html.slice(start, end), removed: false };
}

/**
 * Reads index.html from disk and returns its classic-script region.
 */
export function loadClassicScriptRegion() {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  return locateClassicScriptRegion(html);
}

/**
 * Character-by-character tokenizer for a JS source slice. Classifies EVERY character offset as
 * exactly one of: "code" (genuine JS code, identifier-position eligible), "string" (inside a
 * '...'/"..."/`...` string literal, including its escape sequences and, for template literals,
 * the raw text portions OUTSIDE any ${...} interpolation), or "comment" (inside a `//` line
 * comment or a `/* ... *' + '/` block comment).
 *
 * Template-literal interpolations (`${...}`) are treated as CODE, not string content, and can
 * nest arbitrarily (including nested template literals inside an interpolation) — this matters
 * because real reads of app-state names occur inside interpolations in this codebase (e.g.
 * `` `${game.round}` ``); treating the whole template literal as opaque string content would
 * silently miss those as migration targets (Pitfall 2's "missed site" failure class, not just
 * Pitfall 1's string-corruption one).
 *
 * @param {string} source
 * @returns {Array<{type:"code"|"string"|"comment", start:number, end:number}>} segments covering
 *   the entire source with no gaps, in order.
 */
export function classify(source) {
  const segments = [];
  const n = source.length;

  // mode: 'code' | 'linecomment' | 'blockcomment' | 'squote' | 'dquote' | 'template'
  let mode = "code";
  // stack of open template literals; each frame is a plain marker object (no per-frame state
  // needed beyond presence — "are we inside SOME template's ${} expression" is captured by
  // `mode === 'code' && templateStack.length > 0`; the frame's own braceDepth tracks nested `{`/`}`
  // WITHIN that specific interpolation, needed to find its matching closing `}`).
  const templateStack = [];

  let segStart = 0;
  let segType = "code";
  let regexInCharClass = false; // `[...]` inside a regex literal — a `/` there does NOT close it

  function segKindFor(m) {
    // Regex literals are classified as "string" — opaque pattern content, never an
    // identifier-substitution target, and (like a real string) may legitimately contain `"`,
    // `'`, `{`, `}`, `(`, `)` characters that must NOT be interpreted as real string/bracket
    // syntax by anything scanning the surrounding code (see the regex-literal note below).
    if (m === "squote" || m === "dquote" || m === "template" || m === "regex") return "string";
    if (m === "linecomment" || m === "blockcomment") return "comment";
    return "code";
  }

  function flushTo(end, newMode) {
    const newKind = segKindFor(newMode);
    if (newKind !== segType) {
      if (end > segStart) segments.push({ type: segType, start: segStart, end });
      segStart = end;
      segType = newKind;
    }
  }

  // Disambiguates a bare `/` in code mode as regex-literal-start vs. the division operator — the
  // classic JS lexer ambiguity, resolved (as every real JS tokenizer does) by looking at the last
  // significant token already scanned. Confirmed load-bearing against this exact file: `escHtml`
  // (index.html:866) contains the regex literal `/[&<>"]/g`, whose character class holds a
  // literal `"` — treating that `/` as division (i.e. NOT recognizing the regex) lets the `"`
  // inside it fool a naive tokenizer into starting a fake double-quoted string that consumes
  // everything up to the NEXT unrelated `"` in the file, corrupting every string/comment
  // classification after it. This was caught empirically during this task by running the
  // migration tool end-to-end and finding a corrupted declaration statement far downstream.
  //
  // Looks backward through the RAW source (skipping whitespace) from the `/`'s position — by
  // construction this is safe to do directly on `source` rather than `masked`/segments, because
  // everything scanned so far up to `idx` has already been correctly classified by this same
  // pass (mode transitions only ever return to 'code' at well-defined boundaries), so the
  // characters immediately preceding a code-mode `/` are always genuine code, never leftover
  // string/comment content.
  const REGEX_PRECEDING_CHARS = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", ";", "+", "-", "*", "%", "<", ">", "^", "~", "\n"]);
  const REGEX_PRECEDING_KEYWORDS = new Set(["return", "typeof", "case", "in", "of", "new", "do", "else", "yield", "throw", "instanceof", "void", "delete"]);

  function looksLikeRegexStart(idx) {
    let p = idx - 1;
    while (p >= 0 && /[ \t]/.test(source[p])) p--;
    if (p < 0) return true; // start of region
    const ch = source[p];
    if (REGEX_PRECEDING_CHARS.has(ch)) return true;
    // last significant token was a word (identifier/keyword/number) — regex only if it's one of
    // the keyword operators that take an expression operand (`return /x/`, `typeof /x/`, …).
    const wordMatch = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(source.slice(Math.max(0, p - 11), p + 1));
    if (wordMatch && REGEX_PRECEDING_KEYWORDS.has(wordMatch[0])) return true;
    return false; // identifier, number, `)`, `]`, `}`, closing quote/backtick — treat as division
  }

  let i = 0;
  while (i < n) {
    const c = source[i];
    const c2 = i + 1 < n ? source[i + 1] : "";

    if (mode === "code") {
      const inExpr = templateStack.length > 0;
      if (c === "/" && c2 === "/") {
        flushTo(i, "linecomment");
        mode = "linecomment";
        i += 2;
        continue;
      }
      if (c === "/" && c2 === "*") {
        flushTo(i, "blockcomment");
        mode = "blockcomment";
        i += 2;
        continue;
      }
      if (c === "/" && c2 !== "/" && c2 !== "*" && looksLikeRegexStart(i)) {
        flushTo(i, "regex");
        mode = "regex";
        regexInCharClass = false;
        i += 1;
        continue;
      }
      if (c === "'") {
        flushTo(i, "squote");
        mode = "squote";
        i += 1;
        continue;
      }
      if (c === '"') {
        flushTo(i, "dquote");
        mode = "dquote";
        i += 1;
        continue;
      }
      if (c === "`") {
        flushTo(i, "template");
        templateStack.push({});
        mode = "template";
        i += 1;
        continue;
      }
      if (inExpr && c === "{") {
        templateStack[templateStack.length - 1].braceDepth =
          (templateStack[templateStack.length - 1].braceDepth || 0) + 1;
        i += 1;
        continue;
      }
      if (inExpr && c === "}") {
        const frame = templateStack[templateStack.length - 1];
        if ((frame.braceDepth || 0) === 0) {
          // this `}` closes the ${...} interpolation itself — resume this template's string body
          flushTo(i + 1, "template");
          mode = "template";
          i += 1;
          continue;
        }
        frame.braceDepth -= 1;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === "linecomment") {
      if (c === "\n") {
        flushTo(i, "code");
        mode = "code";
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === "blockcomment") {
      if (c === "*" && c2 === "/") {
        flushTo(i + 2, "code");
        mode = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === "regex") {
      if (c === "\\") {
        i += 2; // skip escaped char (e.g. `\/` inside a regex body)
        continue;
      }
      if (c === "[") {
        regexInCharClass = true;
        i += 1;
        continue;
      }
      if (c === "]") {
        regexInCharClass = false;
        i += 1;
        continue;
      }
      if (c === "/" && !regexInCharClass) {
        // consume trailing flags (g/i/m/s/u/y and combinations)
        let j = i + 1;
        while (j < n && /[a-zA-Z]/.test(source[j])) j++;
        flushTo(j, "code");
        mode = "code";
        i = j;
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === "squote" || mode === "dquote") {
      const quote = mode === "squote" ? "'" : '"';
      if (c === "\\") {
        i += 2; // skip escaped char
        continue;
      }
      if (c === quote) {
        flushTo(i + 1, "code");
        mode = "code";
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === "template") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        templateStack.pop();
        flushTo(i + 1, "code");
        mode = "code";
        i += 1;
        continue;
      }
      if (c === "$" && c2 === "{") {
        flushTo(i, "code"); // the raw template text up to (not including) `${` is "string"
        mode = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
  }

  if (n > segStart) segments.push({ type: segType, start: segStart, end: n });
  return segments;
}

/**
 * Produces a "masked" copy of `source` — SAME LENGTH, with every character inside a "string" or
 * "comment" segment replaced by a single space (newlines preserved as newlines, everything else
 * as a space), and every "code" character left completely untouched. Regex matching against the
 * masked copy is guaranteed string/comment-safe (Pitfall 1) while byte offsets stay valid against
 * the ORIGINAL source, so callers can find matches in the masked text and splice the real source
 * at the same offsets.
 *
 * @param {string} source
 * @param {Array<{type:string,start:number,end:number}>} [segments] - reuse an existing classify()
 *   call if the caller already has one; computed fresh otherwise.
 */
export function maskNonCode(source, segments = classify(source)) {
  const chars = source.split("");
  for (const seg of segments) {
    if (seg.type === "code") continue;
    for (let i = seg.start; i < seg.end; i++) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

/**
 * Extracts the ordered concatenation of every string-literal body and comment body in `source`
 * (for byte-safety diffing — critical invariant #6: string/comment content must be byte-identical
 * before vs after a migration). Segment boundaries are preserved with a newline separator so a
 * diff between two extractions is readable, not one giant line.
 */
export function extractStringsAndComments(source, segments = classify(source)) {
  const parts = [];
  for (const seg of segments) {
    if (seg.type === "code") continue;
    parts.push(source.slice(seg.start, seg.end));
  }
  return parts.join("\n");
}
