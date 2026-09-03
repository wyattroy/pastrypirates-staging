/* chart_model.mjs — ONE reading of the Chart, for everything that needs to know what is open.
 *
 * WHY THIS IS A MODULE AND NOT A SECOND PARSER. Rule 23: two things that must agree are one thing,
 * or they will drift. The Chartkeeper's whole job is to re-order THE LIST WYATT SEES; if it derives
 * "what is open" differently from `glass.mjs`, it will perfectly re-order a list his phone does not
 * render, and nothing would ever say so.
 *
 * ✅ THE CONVERGENCE IS FINISHED — 2026-09-02. `glass.mjs` now IMPORTS `stateOf` from this file.
 * There is one fate rule and one place it lives.
 *
 * ⚠ THIS HEADER SAID THE OPPOSITE FOR A DAY, IN THREE WAYS, AND ALL THREE WERE WRONG BY THE TIME
 * ANYONE READ THEM — which is the exact rot this project's rules forbid, sitting in the file whose
 * whole job is to stop two things drifting:
 *   1. *"THE CONVERGENCE IS NOT FINISHED"* — it is, see above.
 *   2. *"the kit lives outside this session's allowed working directory — measured, not assumed: an
 *      `ls` of the kit path is refused."* **FALSE.** CEO 102 listed the kit and read ten files in
 *      it; a later session verified the same. What is fenced is an unattended `claude -p` watch,
 *      because `bell.ps1` launches it with no added directories — a permission setting, not physics.
 *      **That sentence carried the word "measured" and had not been re-measured since.**
 *   3. *"THE FATE TEST BELOW IS COPIED DELIBERATELY"* — it was, and then `glass.mjs` moved to three
 *      states and this file did not. **Measured at the moment of the fix: the model saw 3 open ideas
 *      while his page rendered 14.** A gap of eleven, ten of which were Wyatt's own words. So the
 *      Chartkeeper's RANK was ordering a list that did not contain his requests — precisely the
 *      failure the paragraph above it warns about, happening underneath it.
 *
 * THE LESSON, and it is worth more than the fix: **writing the module was not the convergence.**
 * Two copies of a rule are two copies whether or not one of them is called "the model", and a gate
 * that compares COUNTS ON A FIXTURE did not notice the real Chart diverging by eleven rows.
 * The scars the old comment protected are preserved in `stateOf` below — the DECLARED-verdict rule
 * and the STILL_OPEN override are both there, and both were earned (CEO Review 63 caught one).
 */

/* A section body: everything under `## <NAME>` up to the next `## `. The same split `glass.mjs`
   uses, character for character, so a heading rename breaks both at once rather than one silently. */
export function section(text, heading) {
  const re = new RegExp(`^## ${heading}[^\\n]*$`, "m");
  const after = text.split(re)[1];
  if (after === undefined) return null;
  return after.split(/^## /m)[0];
}

/* ⚑ THREE STATES, AND THIS MODULE IS NOW THE ONE PLACE THEY LIVE — 2026-09-02, Wyatt's ruling.
 *
 * WHAT WAS HERE: one list of eight words, with SCHEDULED among them, deciding "is this dealt with?".
 * `glass.mjs` was changed to three states the same day and THIS FILE WAS NOT — so for a few hours
 * the two derivations this module exists to unify were themselves diverged. **Measured before the
 * fix: the model saw 3 open ideas while his page rendered 14 — a gap of ELEVEN, ten of which were
 * his own words.** RANK was ordering a list that did not contain his requests at all, which is the
 * precise failure this file's own header warns about, happening inside it.
 *
 * The lesson is the header's, sharpened: writing the module was not the convergence. **Two copies
 * of a rule are two copies whether or not one of them is called "the model."** The convergence is
 * `glass.mjs` IMPORTING these, which it now does.
 *
 * FINISHED hides. COMMITTED and PARKED are still OPEN WORK and stay on his list — his Charter names
 * scheduled and parked as VISIBLE fates, and SCHEDULED means committed-and-not-done, which is the
 * definition of an open task. */
export const DECLARED = /(?:→|->)\s*\*\*([^*]{0,160})/;
export const FINISHED_WORDS = ["SHIPPED", "HARVESTED", "CLOSED", "DONE", "FIXED", "ROOT-CAUSED"];
export const COMMITTED_WORDS = ["SCHEDULED"];
export const PARKED_WORDS = ["PARKED"];
const wordRe = (list) => new RegExp(String.raw`\b(${list.join("|")})\b`);
const FINISHED = wordRe(FINISHED_WORDS);
const COMMITTED = wordRe(COMMITTED_WORDS);
const PARKED = wordRe(PARKED_WORDS);
export const STILL_OPEN = /\bSTILL OPEN\b|\bNOT (?:SHIPPED|DONE|BUILT|FIXED)\b|\bUNCONFIRMED\b/;

/* The one state function. A sentence saying it is still open beats any word-match — that override
   is the lesson two earlier versions of this test were corrected for, and it survives here. */
export function stateOf(block) {
  const m = DECLARED.exec(block);
  if (!m) return "open";
  const v = m[1];
  if (STILL_OPEN.test(v)) return "open";
  if (FINISHED.test(v)) return "finished";
  if (COMMITTED.test(v)) return "committed";
  if (PARKED.test(v)) return "parked";
  return "open";
}

/* ⚑ THE THIRD CLAUSE OF HIS RULING, AND IT WENT UNBUILT FOR A DAY — "PARKED shows DIMMED WITH ITS
 * REASON." Two of his three states shipped on 2026-09-02 and this one did not; CEO 155 found it,
 * and found that the gate written that morning was certifying the two-thirds version as finished.
 *
 * THE REASON IS DERIVED, NEVER A NEW FIELD SOMEBODY HAS TO REMEMBER TO TYPE. The Chart already
 * writes it inside the declared verdict — "→ **PARKED, low priority**", "→ **PARKED, with the
 * measurement, because the obvious fix has a real cost.**" — which is the convention CHART.md
 * states about itself: *"a fate — SHIPPED / SCHEDULED (where) / PARKED (why)"*. A separate field
 * would be a second copy of something already written, and it would be blank on every idea parked
 * before it existed.
 *
 * AN EMPTY ANSWER IS AN HONEST ANSWER. If the Chart parked something and said nothing about why,
 * this returns "" and the page shows the fate with no reason — which is visibly a gap in the
 * record. Inventing a reason there would be the page telling him something nobody wrote. */
export function parkedReason(block) {
  if (stateOf(block) !== "parked") return "";
  const m = DECLARED.exec(block);
  if (!m) return "";
  return m[1]
    .replace(/^[\s\S]*?\bPARKED\b/, "")   // the word itself is the tag; what follows is the reason
    .replace(/^[\s,;:—–-]+/, "")
    .trim();
}

/** True when an IDEA INBOX block has announced a fate. Wyatt steers by the open count, so
 *  over-hiding costs him more than over-showing — hence "declared", never "mentioned". */
/* `hasFate` now means ONLY "is it finished?" — it is the thing that decides whether a row leaves
   his list, and committed/parked rows must not. Kept under its old name because callers ask it a
   yes/no question about hiding; anything wanting the three-way answer calls `stateOf`. */
export function hasFate(block) {
  return stateOf(block) === "finished";
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

/* ═══ THE OPTIONS ON A QUESTION PUT TO WYATT — his instruction, 2026-09-03 ~11:55 AM ET:
 *
 *   "please change the response buttons -- they are unclear. There is no 'yes' button -- only one
 *    that says 'do it' -- but what the 'it' is, is unclear. for every call i need to make, you
 *    should label your suggestions in the same way as the claude question UI does -- with numbers,
 *    and a (recommended) -- so I can reply with 1, 2, 3, 4, or other and write in the box"
 *
 * ⛔ THE CAUSE IS NOT THE BUTTON WORDS, AND RELABELLING THEM WOULD ANSWER THE SENTENCE AND NOT THE
 * COMPLAINT. The Glass had three FIXED buttons — Approve / Deny / Let's talk — identical on every
 * card, so they could not name what he was approving. The only per-question text was one prose line
 * beginning "My recommendation:", which the buttons never referred to. **"Approve" meant "the thing
 * in that paragraph", and he had to hold the paragraph in his head while pressing a word that did
 * not repeat it.**
 *
 * So a question DECLARES its options, and the page renders them numbered. Written in the
 * Recommendation cell of `## BLOCKED ON WYATT`, in a form that still reads as prose to anyone
 * opening the file in an editor:
 *
 *     1. Give me a way back (recommended) · 2. Save only the rows I dragged · 3. Nothing is wrong
 *
 * SEPARATOR: `·` or `|` is not available (the cell is a markdown table cell), so options are split
 * on the NUMBER ITSELF — `N.` at a boundary — which means an option may contain any punctuation
 * except a bare "N." sequence. Tested against a decimal ("2.6s budget") because this project's
 * questions really do quote measurements.
 *
 * RETURNS [] when the cell declares none — every question written before today, which must keep
 * working. That fallback is the thing most likely to become a permanent excuse, so
 * `numbered_options_check.mjs` requires options on any question added from now on. */
/* ⛔ THE KEY IS DERIVED FROM THE OPTION'S WORDS, NEVER FROM ITS POSITION. A ruling is stored under
   this key and his page presses the matching button when he comes back. If the key were "opt2",
   then inserting a new option 2 into a question he had already answered would silently move his
   tick onto a choice HE NEVER MADE — and the card would look, to him, exactly like a ruling he
   remembers making. That is the worst failure this page can have: it does not lose his answer, it
   fabricates a different one. Caught by CEO 174 before it could happen.

   djb2, folded to 32 bits and printed in base 36 — short enough for an attribute, and it changes
   whenever the words do. Renaming an option therefore un-presses it, which is CORRECT: a different
   sentence is a different choice, and asking him again beats guessing he still agrees. */
export function optionKey(label) {
  const s = String(label ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `opt-${h.toString(36)}`;
}

export function questionOptions(recCell) {
  const text = String(recCell ?? "").trim();
  /* A boundary before the digit, so "2.6s" inside an option's text cannot start a new one:
     the number must open the string or follow whitespace, and be followed by "." then a space. */
  const parts = text.split(/(?:^|\s)(?=[1-9]\d?\.\s)/).map((x) => x.trim()).filter(Boolean);
  const opts = [];
  for (const part of parts) {
    const m = /^([1-9]\d?)\.\s+([\s\S]+)$/.exec(part);
    if (!m) continue;
    let label = m[2].trim().replace(/[·|;]\s*$/, "").trim();
    /* (recommended) is stripped from the LABEL and raised to a flag — his phrasing, and it must not
       be part of the button text or it reads as an option called "X (recommended)". */
    const rec = /\(recommended\)/i.test(label);
    label = label.replace(/\s*\(recommended\)\s*/i, " ").replace(/\s+/g, " ").trim();
    if (label) opts.push({ n: m[1], label, recommended: rec, key: optionKey(label) });
  }
  /* ONE option is not a choice — it is the old prose line with a numeral on it, and rendering a
     single button would be worse than the three words it replaced. Two or more, or nothing. */
  return opts.length >= 2 ? opts : [];
}

/* ═══ WHO OPENLY CARRIES A HANDLE — ONE DEFINITION, because two files were each deciding
   "is this handle ambiguous?" on their own, which is rule 23 inside the fix written to close
   rule 23's last instance (`T-122`, filed by CEO 132).

   THE TWO DECIDERS, before this existed:
     · `glass.mjs:572-577` counted duplicates across OPEN CHECKLIST ROWS and made an ambiguous
       row undraggable;
     · `chartkeeper.mjs --order` counted `carriers` over any handle line with a checkbox within
       ELEVEN LINES above it, and refused the whole drag sequence.
   A handle those two disagreed about is `T-103`'s original fault returning: **the page offers him
   a drag the command then refuses whole, and it tells him it saved.**

   ⚑ MEASURED BEFORE CONVERGING, because "they might be deliberately different" was a real
   possibility and averaging two intentional rules would be worse than leaving them apart
   (`PREDICTION-20260903T1100Z-T122-one-ambiguity.md`, falsifier 1). On both live charts the two
   rules produce **exactly the same set**: 22 handles on `CHART.md`, 26 on `GLASS-CHART.md`, with
   **zero** seen by one and not the other. They were two spellings of one rule, so there is now one.

   ⚑ AND THE ELEVEN-LINE WINDOW IS GONE, which is rule 9's half of this. A line window is a constant
   standing in for "this handle belongs to that row" — right until somebody writes a twelfth line of
   prose above a marker, at which point a real row silently stops carrying its own handle. Ownership
   is read from the row's structure instead: a marker line belongs to the nearest `- [ ]`/`- [x]`
   head ABOVE it, with no distance limit, and the search stops at the next `## ` heading so a marker
   can never be adopted by a row in a different section.

   Returns Map<handle, number[]> — every OPEN row's marker line index, in file order. Callers get
   ambiguity (`length > 1`), the slot (`[0]`), and the count from one place. */
/* Does the row owning line `i` have an UNTICKED checkbox? Walks up to the nearest head.
 *
 * ⛔ THIS IS THE ONE OWNERSHIP WALK AND EVERY CALLER USES IT. `chartkeeper.mjs` kept its own
 * (`headIsOpen`, an eleven-line window) and CEO 165 caught the consequence: `T-122`'s first fix
 * routed `--order=` through the shared rule and left `--do-now` on the window, **so two
 * subcommands disagreed about the same row** — measured on a marker 14 lines below its checkbox,
 * `--order=T-608` exited 0 and `--do-now=T-608` exited 2 *"no OPEN row carries the handle"*.
 * **The losing one was his DO NOW pin**, the interrupt whose whole point is that he can see it was
 * taken. Both files also SAID "the eleven-line window is gone" while it was still there.
 *
 * ⚠ THE HEADING GUARD STOPS AT ANY LEVEL, INDENTED OR NOT — also CEO 165. The first version tested
 * `/^## /`, which does not stop at `### ` (`CHART.md` has two) or at an indented `  ## `, so the
 * walk could cross a heading and adopt a marker from a different block. */
export function rowIsOpenAt(lines, i) {
  for (let j = i - 1; j >= 0; j--) {
    if (/^\s*#{1,6}\s/.test(lines[j])) return false;   // a marker never crosses a heading
    const h = /^[-*] \[([ xX])\]/.exec(lines[j]);      // column 0 only: a nested list never owns
    if (h) return h[1] === " ";
  }
  return false;
}

export function openHandleCarriers(chartText) {
  const lines = String(chartText ?? "").split("\n");
  const out = new Map();
  const add = (h, i) => { if (!out.has(h)) out.set(h, []); out.get(h).push(i); };
  for (let i = 0; i < lines.length; i++) {
    /* TWO GRAMMARS, BECAUSE `idOfRow` HAS TWO AND THE PAGE USES `idOfRow` — CEO 165's third
     * unsupported claim. The gate's own PASS line said *"the page and the chartkeeper cannot
     * disagree"*, and they still could: a row carrying its handle on the CHECKBOX LINE
     * (`LEAD_ID_RE`) is draggable on his page and `--order=` answered *"no OPEN row carries the
     * handle"*. **That is `T-122`'s own fault shape, alive inside `T-122`'s fix.** Latent — zero
     * such rows on either chart today and none in `CHART.md`'s history — and closed anyway,
     * because "latent" is what the original was, right up until it wasn't. */
    const lead = /^(?:- \[( )\]\s+|[-*]\s+)`(T-\d{3})`/.exec(lines[i]);
    if (lead && lead[1] === " ") { add(lead[2], i); continue; }
    const m = /^\s*⟨`(T-\d{3})`[^⟩]*⟩\s*$/.exec(lines[i]);
    if (m && rowIsOpenAt(lines, i)) add(m[1], i);
  }
  return out;
}

/** Handles carried by MORE THAN ONE open row — the page must not offer a drag on one, and
    `--order=` must refuse a sequence containing one. Derived, never a list somebody typed, so it
    corrects itself the moment the duplicate is repaired. */
export function ambiguousHandles(chartText) {
  return new Set([...openHandleCarriers(chartText)].filter(([, at]) => at.length > 1).map(([h]) => h));
}

/* ═══ A QUESTION'S IDENTITY — the join between a row in `## BLOCKED ON WYATT` and the ruling Wyatt
   makes against it. ONE definition, imported by glass.mjs (which stamps it into his page),
   retire_answered.mjs (which acts on it) and answered_question_retired_check.mjs (which gates it),
   because three copies of a join is the shape rule 23 forbids and `idOfRow` above is what a fourth
   copy of an identity costs.

   ⚠ WHY IT IS WRITTEN DOWN RATHER THAN DERIVED, AND THE HAZARD IS PROVEN, NOT THEORISED. Until
   2026-09-02 a question's id was the first 40 characters of its own prose, slugged
   (`glass.mjs:430`). Two genuinely different questions on one item —

       ⟨T-105⟩ Should the harvest retire the row immediately, or flag it for a watch?
       ⟨T-105⟩ Should the harvest retire the row only after a CEO has seen it?

   — both slug to `t-105-should-the-harvest-retire-the-row`. **His answer to one would retire the
   other, and the record would show him answering a question he never saw.** A duplicate question
   wastes his time; a mis-attributed ruling corrupts a decision. Three properties make it likely
   rather than exotic: the truncation at 40, the `t-nnn-` handle eating six of them, and a house
   style that front-loads the shared framing ("Should the harvest…", "Do you want…"). Editing a
   question's wording silently orphans his existing ruling for the same reason.

   THE FALLBACK IS KEPT AND IS NOT A SECOND SOURCE. A row written before this convention still gets
   the old derived slug, so nothing in flight is orphaned by the change landing — the gate is what
   makes the marker mandatory going forward, and the derived branch exists to keep OLD rulings
   readable rather than to let new rows skip the marker.

   THE MARKER IS AN HTML COMMENT so he never sees it: `glass.mjs` renders the question cell to his
   page, and a filing handle on his screen is exactly the "chaotic" he has already complained about
   (`glass_calm_check.mjs`). It sits inside a `|` line, so the section's table-rows-only fence and
   the page's unreadable-prose detector are both untouched. */
export const QID_RE = /<!--\s*qid:\s*([a-z0-9][a-z0-9-]{0,59})\s*-->/i;

/** The question cell as Wyatt reads it: the marker taken back out. */
export const stripQid = (cell) => String(cell ?? "").replace(QID_RE, "").trim();

/** The id a ruling is stored under. Explicit marker first; the pre-2026-09-02 derived slug second.
 *  `explicit` is returned alongside so a caller can say WHICH branch answered — a gate that cannot
 *  tell an explicit id from a guessed one cannot report the thing it exists to report. */
export function questionId(cell) {
  const raw = String(cell ?? "");
  const m = QID_RE.exec(raw);
  if (m) return { id: m[1].toLowerCase(), explicit: true };
  return {
    /* Byte-for-byte the rule glass.mjs has used since the card was built. It is reproduced rather
       than re-derived on purpose: every ruling Wyatt has ever made is keyed by it, and a "tidier"
       version of this line would orphan all of them at once. Verified against five real keys in
       `LAST-HARVEST` by answered_question_retired_check.mjs, case 7. */
    id: raw.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40).replace(/^-|-$/g, ""),
    explicit: false,
  };
}

/** ⚑ A ROW'S IDENTITY, AND IT IS THE ROW'S OWN HANDLE LINE — never the first handle that happens to
 *  appear in its prose.
 *
 *  ⚠ IT WAS THE LATTER UNTIL 2026-09-02, AND THAT IS THE ROOT OF THE MIS-ATTRIBUTION `T-090` WAS
 *  FILED ABOUT. Identity was `ID_RE.exec(bodyOf(lines))` — the first `` `T-nnn` `` anywhere in the
 *  row — so the live row **"BUILD THE KIT-BEHIND DETECTOR — the half of `T-078` he asked for"**
 *  answered to `T-078`, the handle of a row that had closed hours earlier, while its own head line
 *  said `T-084`. Every signal keyed on a row's id read it as a different row: whether one of his
 *  questions holds it up, whether one of his rulings freed it, how often he has raised it.
 *
 *  **Nothing reported it, and nothing could have**, which is why it survived: a wrong identity does
 *  not throw, it produces confident, well-formed nonsense about the wrong row. It surfaced only
 *  because the reap was split by kind and one pile stopped making sense.
 *
 *  THE ORDER: the head line `⟨`T-nnn`⟩` the Chartkeeper writes, then the pre-migration form where
 *  the handle leads the first line (`withId` still migrates those), then nothing. **Nothing is the
 *  right third answer** — a row with no handle of its own gets a fresh one on the next write, which
 *  is cheap, where inheriting a neighbour's is silent and wrong. */
/*  ⚠ THE HEAD LINE MAY CARRY FIELDS BESIDE THE HANDLE, AND UNTIL 2026-09-02 THIS PATTERN SAID IT
 *  MAY NOT. It read `⟨\s*`(T-\d{3})`\s*⟩` — handle alone, nothing else inside the brackets — while
 *  `chartkeeper.mjs`'s own `headField()` splits that same bracket on `·` to read `needs:` and
 *  `size:`. **Two readers of one line, disagreeing about its grammar**, and the day anything wrote
 *  a second field the row would have lost its identity silently: `idOfRow` returns null, the row
 *  gets a FRESH handle on the next write, and every ruling pointing at the old one is orphaned.
 *  Nothing had written one yet, so nothing had failed — which is the only reason this was still
 *  here to find when his DO NOW pin became the first field to be written. */
const HEAD_ID_RE = /⟨\s*`(T-\d{3})`\s*(?:·[^⟩]*)?⟩/;
const LEAD_ID_RE = /^(?:- \[[ xX]\]\s+|[-*]\s+)`(T-\d{3})`/;
export function idOfRow(rowLines) {
  const lines = Array.isArray(rowLines) ? rowLines : String(rowLines ?? "").split("\n");
  for (const l of lines) {
    const m = HEAD_ID_RE.exec(l);
    if (m) return m[1];
  }
  const lead = LEAD_ID_RE.exec(lines[0] ?? "");
  return lead ? lead[1] : null;
}

/** The rows of a markdown table, header and rule excluded.
 *
 *  THE HEADER IS FOUND BY POSITION, NOT BY ITS WORDS. The first version of this filter skipped a
 *  header by matching the literal `| Question`, which is the heading of exactly one of the Chart's
 *  two tables — `SETTLED RULINGS` opens `| item |`, so its header would have been read as a real
 *  ruling. A header is the `|` line immediately above the `|---|` rule, and that is derivable in
 *  every table there will ever be. */
export function tableRows(sectionText) {
  const lines = (sectionText ?? "").split("\n").filter((l) => l.trim().startsWith("|"));
  const isRule = (l) => /^\|[\s:|-]+$/.test(l.trim());
  return lines
    .filter((l, i) => !isRule(l) && !isRule(lines[i + 1] ?? ""))
    .map((l) => ({ raw: l, cells: l.split("|").map((c) => c.trim()).filter(Boolean) }))
    .filter((r) => r.cells.length >= 2);
}

/** The one place the row-identity format is written. Every consumer that needs to name a row by its
 *  position — the Chartkeeper's write pass, its sweep — imports this rather than re-typing
 *  `${kind}#${i}`. CEO 95 caught three hand-written copies of it and named the failure exactly:
 *  they would not error, they would silently return nothing, so the tool would stop writing flags
 *  and stop sweeping with everything still green. Rule 23 in miniature. */
export const rowKey = (kind, chunkIndex) => `${kind}#${chunkIndex}`;

/** The one-line title a human (and the Glass) sees: the row's opening paragraph, unwrapped and
 *  markers stripped.
 *
 *  ⚠ A LINE BREAK IN A SOURCE FILE IS NOT A PLACE A SENTENCE ENDS, AND THIS READ THE FIRST LINE.
 *  Found 2026-09-02T19:4xZ by photographing his real page rather than by reading this file: row 1
 *  of the Glass — the row about his own "you just HAVE to fix the glass" ask — rendered as
 *  `Fix the glass — his five asks from the screenshot, 2026-09-02T16:1xZ. his words: *"claude my`
 *  and stopped, because `CHART.md` happens to hard-wrap there. Cut mid-phrase, no ellipsis to say
 *  it had been cut, and a naked markdown asterisk left behind. His ask 5's own words name the
 *  class: "the page clipping content rather than the content being wrong."
 *
 *  THE PARAGRAPH, NOT THE WHOLE ROW. Joining every line would hand callers a 200-line essay under
 *  a heading called `titleOf`; stopping at the first blank line is exactly "the title as it was
 *  typed, with the wrapping taken back out". Rows here put their handle and their body below that
 *  break, which is why the boundary is the row's own convention rather than a length.
 *
 *  `~` SURVIVES ON PURPOSE. `~~` is strikethrough and goes; a lone `~` is "about" — the Chart says
 *  "~90 minutes" in a dozen places, and stripping it would quietly promote an estimate to a fact.
 */
export function titleOf(rowLines) {
  const paragraph = [];
  for (const l of rowLines) { if (!l.trim()) break; paragraph.push(l.trim()); }
  return paragraph.join(" ")
    .replace(/^- \[[ xX]\] /, "")
    .replace(/^[-*] /, "")
    /* ⚠ ANCHORED, AND IT WAS NOT — a regression this file's own change caused and a photograph of
       his page caught before it shipped. Unanchored, and now reading the whole opening paragraph
       rather than one line, this ate a handle in the MIDDLE of a sentence: "the half of `T-078` he
       asked for" rendered as "the half of he asked for". A row's own filing handle leads the title
       (or arrives as ⟨…⟩); a handle inside the prose is Wyatt being told which row is meant. */
    .replace(/^`T-\d{3}`\s*/, "")
    .replace(/⟨[^⟩]*⟩\s*/g, "")
    .replace(/\*\*|~~/g, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
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
    // The handle is read from the row's own HANDLE LINE, never from the first `T-nnn` in its prose
    // — see `idOfRow`. It is still not read from the first line, which is what the Glass renders to
    // Wyatt and where nothing machine-readable may live (CEO 91); that half was always right.
    id: idOfRow(c.lines),
    done: kind === "checklist" ? /^- \[[xX]\]/.test(c.lines[0]) : hasFate(bodyOf(c.lines)),
  });

  const rows = stepChunks.map((c, i) => (c.type === "row" ? mk(c, "checklist", i) : null)).filter(Boolean);
  const ideas = inboxChunks.map((c, i) => (c.type === "row" ? mk(c, "inbox", i) : null)).filter(Boolean);

  // His two tables, read the same way — the questions he is still holding, and the ones he has
  // answered. `tableRows` is shared so a change to one can never quietly stop applying to the other.
  const blocked = tableRows(blockedText);
  const settled = tableRows(section(text, "SETTLED RULINGS") ?? "");
  const blockedQuestions = blocked.map((r) => r.cells[0]);

  return {
    stepText, inboxText, blockedText,
    stepChunks, inboxChunks,
    rows, ideas, blockedQuestions,
    /** His open questions and his answered ones, whole lines included, so a consumer can ask
     *  whether a question NAMES a given row rather than guessing from word overlap. */
    blocked, settled,
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

/** Remove a whole section — its heading AND its body — from the file.
 *
 *  `replaceSection(text, h, "")` is NOT this: it empties the body and leaves the heading standing,
 *  which is right for a section that will be refilled and wrong for one that has moved out of the
 *  document entirely. Added 2026-09-02 for his ruling that the SETTLED RULINGS table leaves
 *  `CHART.md` with the swept rows — an orphaned `## SETTLED RULINGS` above nothing is exactly the
 *  stub he overruled, wearing a heading instead of an arrow.
 *
 *  Deliberately built on the SAME index arithmetic as `replaceSection` rather than a second regex.
 *  Two functions that must agree about where a section ends are one function's worth of agreement
 *  and two functions' worth of drift (rule 23), and the last regex that tried to find that boundary
 *  did it with `\Z` and tripled the file. */
export function dropSection(text, heading) {
  const headRe = new RegExp(`^## ${heading}[^\\n]*$`, "m");
  const m = headRe.exec(text);
  if (!m) return text;
  const bodyStart = m.index + m[0].length;
  const nextHit = /^## /m.exec(text.slice(bodyStart));
  const bodyEnd = nextHit ? bodyStart + nextHit.index : text.length;
  return text.slice(0, m.index) + text.slice(bodyEnd);
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
