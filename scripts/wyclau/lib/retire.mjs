/* retire.mjs — RECORDING WYATT'S ANSWER AND RETIRING HIS QUESTION, AS ONE ACT. The only copy.
 *
 * WHY THIS IS A MODULE AND NOT A SECOND COPY INSIDE THE HARVEST. Rule 23: two things that must
 * agree are one thing, or they will drift. This act carries three details that were each earned and
 * each easy to leave out of a second copy —
 *
 *   · the `|` and newline escaping (CEO 125: a ruling he types on his phone containing a pipe would
 *     otherwise split `## RULED` into extra cells, and a newline would drop the rest of his sentence
 *     into the document as prose — the one act promising "his words, verbatim" broken BY his words);
 *   · the `<!--qid:…-->` stamped onto the row it writes, which is the only thing that makes the
 *     answered-set readable on a machine without `.planning/wyclau/LAST-HARVEST` (gitignored);
 *   · ONE write, so a crash cannot leave the question deleted and his answer unrecorded.
 *
 * A copy of this in the harvest would have had to reproduce all three, and the day one of them was
 * fixed in one copy only, his words would start being lost by the caller nobody looked at.
 *
 * IT RETURNS THE NEW TEXT AND WRITES NOTHING. Two callers need different atomicity: the standalone
 * script writes one question's worth, the harvest applies several and then writes the Chart AND the
 * receipt together — and if any of them is refused it must write neither. A function that wrote to
 * disk could not give the second caller that guarantee.
 */

import { section, tableRows, questionId, stripQid } from "./chart_model.mjs";

/** The questions asking him right now, each with the id his ruling is stored under. */
export function liveQuestions(chartText) {
  return tableRows(section(chartText, "BLOCKED ON WYATT") ?? "").map((r) => ({
    raw: r.raw,
    cell: r.cells[0],
    ...questionId(r.cells[0]),
  }));
}

/* HIS WORDS GO INTO A TABLE CELL, AND A TABLE CELL ENDS AT A PIPE. Escaped rather than stripped: he
   must be able to read back exactly what he typed. */
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/**
 * Retire one question: add his verdict to `## RULED` and delete the row from `## BLOCKED ON WYATT`,
 * in the same returned string.
 *
 * @returns {{ok: true, next: string, row: string}|{ok: false, error: string, live: string[]}}
 */
export function retireQuestion(chartText, qidRaw, verdictRaw) {
  const qid = String(qidRaw ?? "").trim().toLowerCase();
  const verdict = String(verdictRaw ?? "").trim();
  const rows = liveQuestions(chartText);

  if (!qid) return { ok: false, error: "no question id was given.", live: rows.map((r) => r.id) };
  if (!verdict) return { ok: false, error: `no verdict was given for "${qid}". A question retired with no answer on record is his words deleted, which is strictly worse than the bug.`, live: rows.map((r) => r.id) };

  const target = rows.find((r) => r.id === qid);
  /* ⚠ THIS REFUSES RATHER THAN SHRUGS ON PURPOSE. A no-op that reports success tells the caller the
     retirement happened. The whole class of fault being fixed here is "the record says it was done
     and his page still asks", so a silent success is this bug wearing a different hat. */
  if (!target) return { ok: false, error: `no live question in \`## BLOCKED ON WYATT\` has the id "${qid}".`, live: rows.map((r) => r.id) };

  /* ⚠ THE "now" CELL IS LEFT EMPTY, AND THAT IS A DEPARTURE FROM THE SPEC — named here rather than
     left to be discovered. `SPEC-ANSWERED-QUESTIONS-RETIRE.md:79` asks for the row written "with the
     `now` cell filled". `## RULED` is a WAITING ROOM with its own three-move process, and an empty
     "now" is what marks a ruling as untriaged; filling it here would file his answer as already
     acted on the instant it is recorded. Flagged by CEO 127 as an undisclosed deviation, which it
     was. If he wants it filled, it is one expression — but the triage lifecycle has to move too. */
  const questionText = stripQid(target.cell);
  const ruledRow = `| <!--qid:${qid}--> ${cell(questionText)} | ${cell(verdict)} | |`;

  const ruledText = section(chartText, "RULED") ?? "";
  const headerRule = ruledText.split("\n").findIndex((l) => /^\|[\s:|-]+$/.test(l.trim()));
  if (headerRule < 0) return { ok: false, error: "could not find the `|---|` header rule under `## RULED` in CHART.md, so there is no safe place to add the row. Fix the table by hand and run again.", live: rows.map((r) => r.id) };

  /* TWO EDITS, ONE STRING. The deletion and the addition are computed against the same in-memory
     text and are returned together or not at all — a half-applied retirement is not reachable. */
  let next = chartText.replace(ruledText, ruledText.split("\n")
    .flatMap((l, i) => (i === headerRule ? [l, ruledRow] : [l])).join("\n"));
  const before = next;
  next = next.split("\n").filter((l) => l !== target.raw).join("\n");
  if (next === before) return { ok: false, error: `the question row was found by the parser but its exact line could not be removed. Nothing was written. The row: ${target.raw.slice(0, 90)}…`, live: rows.map((r) => r.id) };

  /* ⚑ THIRD EDIT, ADDED 2026-09-03 WITH T-087, AND IT IS THE ACT COMPLETING ITSELF RATHER THAN A
     NEW FEATURE. Until today `## RULED` was RENDERED on the Glass, under "Your rulings, in hand",
     so a row landing here with an empty "now" was still on the page he reads while it waited to be
     triaged. Wyatt asked for that card to be removed (2026-09-02T13:18:28.755Z) and it is gone.
     Nothing renders this section now — so without this insert, THE ONE ACT THAT PROMISES TO
     RECORD HIS ANSWER WOULD MOVE IT SOMEWHERE ONLY SESSIONS CAN SEE, which is the same fault, one
     table over, as the one this whole module exists to fix.
     `rulings_triage_check.mjs` case 5 fails the build on exactly that state. Found by CEO 151,
     which pointed out that the new rule would otherwise go red on this function's own normal
     output — a gate condemning the tool that feeds it.
     THE SAFE DEFAULT IS "SHOW IT": a task row is written whether or not work turns out to be
     owed, because a ruling wrongly SHOWN costs him far less than one wrongly hidden — the same
     asymmetry `rulings_triage_check.mjs:42-44` already states. A watch that finds nothing owed
     moves the row to SETTLED and deletes this task, which is step 3 of the documented process.
     BEST EFFORT BY DESIGN: a Chart with no `## STEP 1 CHECKLIST` (every fixture in
     `answered_question_retired_check.mjs` is one) is left alone rather than refused. Recording his
     answer must never fail because a section is missing — the record is worth more than the
     bookkeeping. */
  const checklistText = section(next, "STEP 1 CHECKLIST");
  if (checklistText) {
    const taskRow = `- [ ] Your ruling: ${cell(questionText)} — his answer: ${cell(verdict)} **Untriaged.** A watch decides whether this still owes work, then moves the ruling to SETTLED RULINGS and deletes this row.`;
    next = next.replace(checklistText, `${checklistText.replace(/\s+$/, "")}\n\n${taskRow}\n`);
  }

  return { ok: true, next, row: ruledRow };
}
