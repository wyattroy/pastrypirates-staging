/* chart_model.mjs — ONE reading of the Chart, for everything that needs to know what is open.
 *
 * WHY THIS IS A MODULE AND NOT A SECOND PARSER. Rule 23: two things that must agree are one thing,
 * or they will drift. The Chartkeeper's whole job is to re-order THE LIST WYATT SEES; if it derives
 * "what is open" differently from `glass.mjs`, it will perfectly re-order a list his phone does not
 * render, and nothing would ever say so.
 *
 * ⚠ THE CONVERGENCE IS NOT FINISHED, AND SAYING SO IS THE POINT. `glass.mjs` is VENDORED from
 * claude-kit (`.claude/wyclau/MANIFEST.sha256`), and the kit lives outside this session's allowed
 * working directory — measured, not assumed: an `ls` of the kit path is refused. So the second
 * consumer could not be converged onto this module in the watch that wrote it. What exists instead
 * is `scripts/qa/chart_model_agrees_with_glass_check.mjs`, which runs the REAL `glass.mjs` against a
 * fixture and fails if the two derivations disagree. That turns a silent drift into a red gate,
 * which is the second-best answer; the best one is one function, and it is a named follow-up in
 * `.planning/wyclau/PENDING-KIT-PATCHES.md`.
 *
 * THE FATE TEST BELOW IS COPIED DELIBERATELY, WITH ITS SCARS. `glass.mjs` records getting it wrong
 * twice in opposite directions (CEO Review 63 caught one), and those two mistakes are why the rule
 * is "the fate must be DECLARED — an arrow, then a bold verdict — and the verdict must not
 * explicitly say otherwise". Changing it here without changing it there is exactly the drift the
 * gate above exists to catch.
 */

/* A section body: everything under `## <NAME>` up to the next `## `. The same split `glass.mjs`
   uses, character for character, so a heading rename breaks both at once rather than one silently. */
export function section(text, heading) {
  const re = new RegExp(`^## ${heading}[^\\n]*$`, "m");
  const after = text.split(re)[1];
  if (after === undefined) return null;
  return after.split(/^## /m)[0];
}

const DECLARED = /(?:→|->)\s*\*\*([^*]{0,160})/;
const FATE_WORD = /\b(SHIPPED|PARKED|SCHEDULED|HARVESTED|CLOSED|DONE|FIXED|ROOT-CAUSED)\b/;
const STILL_OPEN = /\bSTILL OPEN\b|\bNOT (?:SHIPPED|DONE|BUILT|FIXED)\b|\bUNCONFIRMED\b/;

/** True when an IDEA INBOX block has announced a fate. Wyatt steers by the open count, so
 *  over-hiding costs him more than over-showing — hence "declared", never "mentioned". */
export function hasFate(block) {
  const m = DECLARED.exec(block);
  if (!m) return false;
  return FATE_WORD.test(m[1]) && !STILL_OPEN.test(m[1]);
}

/* CHUNKING. A section is a sequence of chunks, each either a ROW (a `- [ ]`/`- [x]` line plus its
   indented continuation) or PROSE (headings, blockquotes, tables, blank lines). Reassembly is
   `chunks.map(c => c.lines.join("\n")).join("\n")` and is lossless by construction — which is what
   lets RANK re-order rows without any risk of eating the prose between them. */
function isRowStart(line, marker) {
  return marker === "checklist" ? /^- \[[ xX]\] /.test(line) : /^[-*] /.test(line);
}
function continues(lines, i) {
  // An indented non-empty line continues the row. A blank line continues it only if the next
  // non-blank line is itself indented — otherwise the blank is the row's terminator.
  const line = lines[i];
  if (/^\s+\S/.test(line)) return true;
  if (/^\s*$/.test(line)) {
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*$/.test(lines[j])) continue;
      return /^\s+\S/.test(lines[j]);
    }
  }
  return false;
}

export function chunk(sectionText, marker) {
  const lines = sectionText.split("\n");
  const chunks = [];
  let cur = { type: "prose", lines: [] };
  const flush = () => { if (cur.lines.length) chunks.push(cur); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isRowStart(line, marker)) {
      flush();
      cur = { type: "row", lines: [line] };
      while (i + 1 < lines.length && continues(lines, i + 1) && !isRowStart(lines[i + 1], marker)) {
        cur.lines.push(lines[++i]);
      }
      flush();
      cur = { type: "prose", lines: [] };
      continue;
    }
    cur.lines.push(line);
  }
  flush();
  return chunks;
}

export const ID_RE = /`(T-\d{3})`/;

/** The one place the row-identity format is written. Every consumer that needs to name a row by its
 *  position — the Chartkeeper's write pass, its sweep — imports this rather than re-typing
 *  `${kind}#${i}`. CEO 95 caught three hand-written copies of it and named the failure exactly:
 *  they would not error, they would silently return nothing, so the tool would stop writing flags
 *  and stop sweeping with everything still green. Rule 23 in miniature. */
export const rowKey = (kind, chunkIndex) => `${kind}#${chunkIndex}`;

/** The one-line title a human (and the Glass) sees: the row's first line, markers stripped. */
export function titleOf(rowLines) {
  return rowLines[0]
    .replace(/^- \[[ xX]\] /, "")
    .replace(/^[-*] /, "")
    .replace(/`T-\d{3}`\s*/, "")
    .replace(/⟨[^⟩]*⟩\s*/g, "")
    .replace(/\*\*|~~|`/g, "")
    .trim();
}

/** Everything a signal might want to read: the row's whole text, first line included. */
export const bodyOf = (rowLines) => rowLines.join("\n");

/**
 * The Chart, as the Glass reads it plus the handles the Chartkeeper needs.
 * `tasks` is deliberately the SAME concatenation glass.mjs:385-386 builds — open checklist rows
 * first, then IDEA INBOX entries with no declared fate. CEO 89 caught this being missed in the
 * spec: an unfated idea is a task on his phone, so a keeper blind to them orders the wrong list.
 */
export function parseChart(text) {
  const stepText = section(text, "STEP 1 CHECKLIST") ?? "";
  const inboxText = section(text, "THE IDEA INBOX") ?? "";
  const blockedText = section(text, "BLOCKED ON WYATT") ?? "";

  const stepChunks = chunk(stepText, "checklist");
  const inboxChunks = /\(empty/.test(inboxText) ? [] : chunk(inboxText, "inbox");

  /* `key` IS THE ONLY THING IN HERE GUARANTEED UNIQUE, AND THAT IS WHY IT EXISTS. Everything else a
     caller might reach for as an identity can repeat: two rows may share a title (nothing forbids
     it), and `id` is null until a write pass allocates one. `new Map(pairs)` keeps the LAST value
     for a repeated key without a word, so a title-keyed lookup silently hands one row's verdict to
     another — measured 2026-09-02: REAP's "⚠ STALE-CANDIDATE" flag was written into a row it had
     never judged, and `score()` gave it the +40 that goes with it.
     A chunk index is unique within its own chunk list by construction, and `kind` separates the two
     lists — so this is derived, not a counter somebody has to remember to bump. */
  const mk = (c, kind, i) => ({
    kind,
    chunkIndex: i,
    key: rowKey(kind, i),
    lines: c.lines,
    raw: bodyOf(c.lines),
    title: titleOf(c.lines),
    // The handle is read from the WHOLE row, never just its first line: the first line is what the
    // Glass renders to Wyatt, so nothing machine-readable is allowed to live there (CEO 91).
    id: (ID_RE.exec(bodyOf(c.lines)) || [])[1] ?? null,
    done: kind === "checklist" ? /^- \[[xX]\]/.test(c.lines[0]) : hasFate(bodyOf(c.lines)),
  });

  const rows = stepChunks.map((c, i) => (c.type === "row" ? mk(c, "checklist", i) : null)).filter(Boolean);
  const ideas = inboxChunks.map((c, i) => (c.type === "row" ? mk(c, "inbox", i) : null)).filter(Boolean);

  // The BLOCKED ON WYATT questions, as rows of its table — the thing a "See BLOCKED ON WYATT"
  // pointer either resolves to or does not.
  const blockedQuestions = blockedText.split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*Question/i.test(l) && !/^\|\s*-+/.test(l) && !/^\|\s*---/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean))
    .filter((c) => c.length >= 2)
    .map((c) => c[0]);

  return {
    stepText, inboxText, blockedText,
    stepChunks, inboxChunks,
    rows, ideas, blockedQuestions,
    openRows: rows.filter((r) => !r.done),
    doneRows: rows.filter((r) => r.done),
    openIdeas: ideas.filter((r) => !r.done),
    /** The list the Glass's Tasks card actually renders, in its order. */
    tasks: [...rows.filter((r) => !r.done), ...ideas.filter((r) => !r.done)],
  };
}

/** Rebuild the file with new section bodies. Splices on the same headings `section()` splits on, so
 *  the two cannot disagree about where a section starts.
 *
 *  ⚠ THIS WAS A REGEX AND THE REGEX WAS SILENTLY WRONG. It read
 *  `(^## <h>[^\n]*$)([\s\S]*?)(?=^## |\Z)` — and **`\Z` IS NOT A JAVASCRIPT ANCHOR.** JavaScript
 *  has no end-of-input escape; `\Z` is just the literal capital letter Z. So the lazy body stopped
 *  at the first `^## ` *or the first Z in the text*, and this repo writes UTC timestamps
 *  constantly ("04:19Z"). A single run on the real Chart spliced the new body in after roughly one
 *  line, and a second run tripled the file: 3,243 insertions.
 *
 *  EVERY GATE WAS HONESTLY GREEN WHILE THIS WAS TRUE, and that is the part worth keeping. The
 *  idempotence case ran twice and compared the results, exactly as designed — but its fixture
 *  contained no letter Z, so the wrong branch was never reached. **A check is only as good as the
 *  one input it was given**, which is rule 6 wearing a different hat: the instrument was fine and
 *  it was pointed somewhere the bug was not. The fixtures now carry a `Z` on purpose.
 *
 *  It is index arithmetic now rather than a cleverer regex. There is no end-of-input escape to get
 *  wrong, and `indexOf` cannot be misread. */
export function replaceSection(text, heading, newBody) {
  const headRe = new RegExp(`^## ${heading}[^\\n]*$`, "m");
  const m = headRe.exec(text);
  if (!m) return text;
  const bodyStart = m.index + m[0].length;
  const nextRe = /^## /m;
  const rest = text.slice(bodyStart);
  const nextHit = nextRe.exec(rest);
  const bodyEnd = nextHit ? bodyStart + nextHit.index : text.length;
  return text.slice(0, bodyStart) + newBody + text.slice(bodyEnd);
}

/* TOKENS — the crude, honest way two pieces of prose are compared here. Distinctive words only:
   five letters or more, lowercased, minus a stopword list that is deliberately short. This is used
   for "does this row's pointer resolve to a live question?" and "how many times has HE raised
   this?", and it is a HEURISTIC, said out loud rather than dressed up: a token overlap is evidence,
   not proof, which is why REAP only ever FLAGS and a watch still closes. */
const STOP = new Set([
  "about", "after", "again", "against", "already", "always", "another", "because", "before",
  "being", "below", "between", "could", "every", "first", "found", "front", "instead",
  "into", "never", "other", "same", "should", "since", "still", "their", "there", "these",
  "thing", "think", "those", "through", "under", "until", "using", "where", "which", "while",
  "whole", "would", "wyatt", "chart", "glass", "watch", "session", "sessions", "planning",
]);
export function tokens(s) {
  return new Set(
    String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 5 && !STOP.has(w)),
  );
}
export function overlap(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}
