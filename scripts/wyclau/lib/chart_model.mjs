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

  const mk = (c, kind, i) => ({
    kind,
    chunkIndex: i,
    lines: c.lines,
    raw: bodyOf(c.lines),
    title: titleOf(c.lines),
    id: (ID_RE.exec(c.lines[0]) || [])[1] ?? null,
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
    tasks: [...rows.filter((r) => !r.done)], /* RED-PROOF: inbox half removed on purpose */
  };
}

/** Rebuild the file with new section bodies. Splices on the same headings `section()` splits on, so
 *  the two cannot disagree about where a section starts. */
export function replaceSection(text, heading, newBody) {
  const re = new RegExp(`(^## ${heading}[^\\n]*$)([\\s\\S]*?)(?=^## |\\Z)`, "m");
  return text.replace(re, (_m, head) => `${head}${newBody}`);
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
