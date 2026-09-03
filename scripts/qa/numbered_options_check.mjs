#!/usr/bin/env node
/* numbered_options_check.mjs — every call he has to make is NUMBERED, with a (recommended).
 *
 * HIS WORDS, 2026-09-03 ~11:55 AM ET, and the cause is in the first half of the sentence:
 *
 *   "please change the response buttons -- they are unclear. There is no 'yes' button -- only one
 *    that says 'do it' -- but what the 'it' is, is unclear. for every call i need to make, you
 *    should label your suggestions in the same way as the claude question UI does -- with numbers,
 *    and a (recommended) -- so I can reply with 1, 2, 3, 4, or other and write in the box"
 *
 * ⛔ THE FAULT WAS NOT THE BUTTON WORDS. The Glass had three FIXED buttons — Approve / Deny /
 * Let's talk — identical on every card, so they could not name what he was approving. The only
 * per-question text was one prose line starting "My recommendation:", which the buttons never
 * referred to. **"Approve" meant "the thing in that paragraph."** Relabelling three words would
 * have answered his sentence and left every future question exactly as vague.
 *
 * ⚑ SO THE ANTI-DECAY CLAUSE IS THE POINT OF THIS FILE, not the rendering. A parser that ACCEPTS
 * options is worthless if the next question anyone writes is prose again — which is how "a
 * capability nothing invokes" has already failed twice on this project (the ranker that nothing
 * ran; the harvest nothing called). **Case 5 fails the build on any question dated today or later
 * that does not declare options**, and the date is read from the row's own `since` cell, so nobody
 * has to maintain a list of which questions are new.
 *
 * ⚠ AND CASE 5 IS GUARDING NOTHING TODAY — BLOCKED ON WYATT IS EMPTY, so it judges zero rows and
 * cannot fail. CEO 176 measured that, against a commit message of mine that sold it as live
 * protection. It now PRINTS how many rows it judged, so its green line can never again be read as
 * "the rule held" when the honest reading is "there was nothing to hold it against".
 * **A rule that has never had a subject is not yet evidence about anything.**
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { questionOptions } from "../wyclau/lib/chart_model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHART = join(ROOT, ".planning", "CHART.md");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");
const NL = String.fromCharCode(10);
const fails = [];
/* How many rows case 5 actually judged. Reported out loud so nobody reads its silence as protection
   — CEO 176 found it guarding an empty table while the commit message called it live. */
let judged5 = 0;
const dir = mkdtempSync(join(tmpdir(), "numbered-opts-"));

/* THE CUT-OFF IS THE DAY HE ASKED. Questions written before it keep their three words and are not
   a failure — rewriting his whole open backlog on a parser change would be a bigger edit than the
   ask, and the two that were live that day were converted by hand instead. */
const ASKED_ON = "2026-09-03";

try {
  // 1 — the parser reads his shape.
  {
    const o = questionOptions("1. Give me a way back (recommended) · 2. Save only the rows I dragged · 3. Nothing is wrong");
    if (o.length !== 3) fails.push(`1: his three-option shape parsed as ${o.length} option(s)`);
    if (o[0] && !o[0].recommended) fails.push("1: (recommended) did not raise the flag on option 1");
    if (o[0] && /recommended/i.test(o[0].label)) fails.push("1: (recommended) was left inside the button's LABEL — it reads as an option called 'X (recommended)'");
    if (o[1] && o[1].recommended) fails.push("1: an option that is not recommended was flagged as one");
  }

  // 2 — A DECIMAL INSIDE AN OPTION MUST NOT START A NEW ONE. This project's questions quote
  //     measurements ("a 2.6s budget"), so this is the realistic way the split breaks.
  {
    const o = questionOptions("1. wait past the 2.6s budget (recommended) · 2. leave it alone");
    if (o.length !== 2) fails.push(`2: a decimal inside an option split it — got ${o.length}, expected 2`);
  }

  // 3 — ONE option is not a choice. Rendering a single button is worse than the three words it
  //     replaced, so the parser must decline and let the fallback draw.
  {
    if (questionOptions("1. only one thing").length !== 0) fails.push("3: a single numbered item was offered as a choice");
    if (questionOptions("just prose, no options at all").length !== 0) fails.push("3: prose was read as options");
  }

  // 4 — THE PAGE RENDERS BOTH SHAPES: numbered when declared, the old three words when not.
  //     Rendered for real, because a parser test cannot see whether the buttons reached his page.
  {
    const chart = [
      "# CHART", "", "## STEP 1 CHECKLIST", "", "- [ ] **A row.**", "      ⟨`T-901`⟩", "",
      "## BLOCKED ON WYATT", "", "| Question | Recommendation | since |", "|---|---|---|",
      "| <!--qid:q-numbered--> **A question with options.** | 1. First way (recommended) · 2. Second way · 3. Leave it | 2026-09-03 |",
      "| <!--qid:q-prose--> **An older question, prose only.** | Just a recommendation. | 2026-08-01 |", "",
      "## RULED", "", "| question | his verdict |", "|---|---|", "",
    ].join(NL);
    const cPath = join(dir, "CHART.md");
    const oPath = join(dir, "glass.html");
    writeFileSync(cPath, chart);
    /* ⛔ `--out=` OR THIS GATE DESTROYS HIS LIVE PAGE. Without it the rehearsal writes over
       `.planning/wyclau/glass.html` — his real Glass — with this two-question fixture, on EVERY
       `npm test`, and the next session to publish would hand him a page containing nothing but
       "A question with options." Caught by CEO 174. The same fault was live in
       lesson_process_check.mjs and is fixed there too. */
    try { execFileSync(process.execPath, [GLASS, `--chart=${cPath}`, `--out=${oPath}`], { cwd: ROOT, stdio: "ignore" }); }
    catch (e) { fails.push(`4: glass.mjs could not render (exit ${e.status}) — nothing below is checked`); }
    let html = "";
    try { html = readFileSync(oPath, "utf8"); } catch { /* reported below */ }
    /* ⚠ BOUND EACH CARD AT ITS BUTTON ROW, NOT AT THE NEXT CARD. Splitting on the ask marker leaves
       the LAST card's slice running to the end of the document, so it swallows the ledger pills
       below — which contain the word "Approve" in their prose. The first run of this gate failed on
       exactly that and blamed the page. **A slice that reaches past its subject is not evidence
       about its subject.** Take the ruleRow, which is the thing under test. */
    const cardOf = (qid) => {
      const at = html.indexOf(qid);
      if (at < 0) return "";
      const rowAt = html.indexOf('<div class="ruleRow">', at);
      if (rowAt < 0) return "";
      const end = html.indexOf("</textarea>", rowAt);
      return html.slice(rowAt, end < 0 ? rowAt + 4000 : end + 11);
    };
    const numbered = cardOf("q-numbered");
    const prose = cardOf("q-prose");
    /* ⛔ ASSERT THE NUMBER HE CAN SEE, NOT THE ATTRIBUTE. CEO 174 mutated `<b>${n}</b>` out of the
       render and this case still passed, because it only ever read `data-choice`. He asked for
       NUMBERS ON THE BUTTONS — "so I can reply with 1, 2, 3, 4" — and a hidden attribute is not a
       number he can reply with. Read the button's visible text with the tags stripped. */
    const visibleButtons = (seg) => [...seg.matchAll(/<button[^>]*class="rb num"[^>]*>([\s\S]*?)<\/button>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

    if (!numbered) fails.push("4: the numbered question did not render at all");
    else {
      const seen = visibleButtons(numbered);
      if (seen.length !== 3) fails.push(`4: expected 3 numbered buttons, his page drew ${seen.length}`);
      for (const n of ["1", "2", "3"]) {
        if (!seen.some((t) => new RegExp(`^${n}\\b`).test(t))) {
          fails.push(`4: no button VISIBLY begins with "${n}" — he asked to reply 1, 2, 3, and a number he cannot see is not one he can quote back`);
        }
      }
      if (!/First way/.test(numbered)) fails.push("4: the button does not carry the option's WORDS — a number he cannot read the meaning of is the fault he reported");
      if (!/recommended/.test(numbered)) fails.push("4: no (recommended) marker reached the page");
      if (!/Other/.test(numbered)) fails.push("4: the write-in box is not offered as 'Other' — he asked to reply 1, 2, 3, 4, or other");
    }
    /* ⛔ HIS RULING, 2026-09-03T15:56:28Z — AND THIS ASSERTION USED TO SAY THE OPPOSITE. It read
       `if (!/Approve/.test(prose))`, i.e. it FAILED THE BUILD if anyone removed the word "Approve"
       — a word he had asked to remove eight minutes before this gate was written, in words nobody
       read: *"what would 'approve' even mean in response to your above question? Replace Approve
       and Deny with 1 2 3 Other."* **A gate can hold a mistake in place far harder than code can**,
       because removing it then looks like breaking the build. Caught by CEO 174. */
    if (!prose) fails.push("4: the prose question did not render at all");
    else {
      if (/>Approve<|>Deny</.test(prose)) fails.push("4: Approve/Deny are still drawn — his 15:56Z ruling was to replace them with 1 2 3 Other");
      const seen = visibleButtons(prose);
      for (const n of ["1", "2", "3"]) {
        if (!seen.some((t) => new RegExp(`^${n}\\b`).test(t))) {
          fails.push(`4: a question that declares no options has no visible "${n}" button — EVERY call he makes is numbered, not just the ones somebody remembered to write options for`);
        }
      }
    }
  }

  /* 5 — ⛔ THE ANTI-DECAY CLAUSE. Any question dated on or after the day he asked must declare
   *     options. Without this the parser is a capability nothing invokes, and the next question
   *     written is prose again. The date comes from the row's own `since` cell — DERIVED, so no
   *     list of "new" questions has to be kept by hand.
   *
   * ⚠ AND KNOW WHAT IT IS GUARDING TODAY: NOTHING. BLOCKED ON WYATT is EMPTY, so this loop runs
   *   zero times and cannot fail — CEO 176 measured it. The design is right and it bites the day a
   *   question is added, but the commit that shipped it sold it as live protection ("FAILS THE
   *   BUILD on any question…") when it was an empty room. **A rule that has never had a subject is
   *   not yet evidence about anything** — the same shape as the paragraph count one file over that
   *   could not fail while his lesson was a single paragraph.
   *
   *   NOT "fixed" by seeding a fake question: a gate that manufactures its own subject is measuring
   *   itself. Case 1's parser cases are what prove the mechanism; this case proves it is APPLIED,
   *   and it will have something to apply to as soon as a question exists. Counted out loud below
   *   so the next reader sees how many rows it actually judged. */
  /* ⛔ NO `let judged5` HERE. There was one, and it SHADOWED the outer counter declared at :45 —
     so `judged5++` below fed a variable that died at this block's closing brace, and the report at
     the bottom of the file read the outer one, which was permanently 0. **The line CEO 176 added
     so nobody would read the gate's silence as protection could only ever print "BLOCKED ON WYATT
     is empty"** — including on 2026-09-03, the moment two of his real analytics questions were
     added to that table. Rule 6: a measurement that cannot fail is not a measurement, and this one
     could only say one thing. Caught by watching it claim an empty section while `_t206_dbg`
     printed two well-formed dated rows out of the same file. */
  {
    const sec = readFileSync(CHART, "utf8").split(/^## BLOCKED ON WYATT$/m)[1]?.split(/^## /m)[0] ?? "";
    const rows = sec.split(NL).filter((l) => l.startsWith("|") && !/^\|\s*Question|^\|\s*-+/.test(l));
    for (const l of rows) {
      /* ⛔ DO NOT `filter(Boolean)` A TABLE ROW. It deletes EMPTY cells, which silently shifts every
         column left — so `| q | rec |  |` becomes a two-column row and falls out of the `< 3` skip
         below. **The one row shape this case exists to catch is the one it could not see.** Caught
         by red-proofing: mutation M4 inserted a question with a blank `since` and the gate passed.
         Split on the pipes and drop only the empties OUTSIDE them. */
      const cells = l.split("|");
      const c = cells.slice(1, cells.length - 1).map((x) => x.trim());
      if (c.length < 3) continue;
      const since = (c[2] || "").trim();
      const who = (c[0] || "").replace(/<!--[\s\S]*?-->/g, "").replace(/[*`⟨⟩]/g, "").trim().slice(0, 70);
      /* ⛔ AN UNDATED ROW IS A HOLE IN THIS GATE, NOT A ROW IT DOES NOT COVER. This used to
         `continue`, so the way to get a prose question past the anti-decay clause was simply to
         leave `since` blank — and the last question authored before CEO 174 found this had exactly
         that: an empty cell. **A skip is a silent exemption anyone can claim by accident.** */
      if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
        fails.push(`5: a question with no readable date — "${who}…" has since="${since}". Undated, it escapes the rule that every new question is numbered; give it a YYYY-MM-DD.`);
        continue;
      }
      judged5++;
      if (since < ASKED_ON) continue;
      if (questionOptions(c[1]).length === 0) {
        fails.push(`5: a question dated ${since} offers him no numbered options — "${who}…". He asked for numbers and a (recommended) on EVERY call he has to make.`);
      }
    }
  }

  /* 6 — ⛔ RUN THE SAVE PATH, DO NOT GREP FOR IT. This case used to test `/chose:/.test(src)`, and
   *     CEO 174 killed it with one mutation: the string "chose:" survives anywhere in the file,
   *     including inside the very comment explaining why it matters. **A grep for a word is not a
   *     test of the behaviour that word names.**
   *
   *     So: lift the real `saveRuling` out of the RENDERED page — the same text his browser runs —
   *     and drive it with a stub card. If it stops recording his words, this fails. */
  {
    const html = readFileSync(join(dir, "glass.html"), "utf8");
    /* ⛔ LOOK INSIDE THE SCRIPT, NOT ANYWHERE THE NAME APPEARS. `indexOf("function saveRuling")`
       over the whole page matched a LEDGER PILL — a commit message of mine, rendered as prose on
       his own Glass, which happens to quote the words "function saveRuling(". The extractor then
       brace-matched 6,106 characters of English and handed them to `new Function`, which is the
       only reason this was caught at all: it threw "Unexpected string" instead of quietly passing.

       **The gate found its subject's NAME and measured that instead of its subject** — the same
       family as the `offsetParent` check that condemned a working screen, and as this very file's
       case-4 slice that swallowed the ledger pills below the last card. This page RENDERS the
       project's own commit prose, so any grep over it will keep finding the words it is looking
       for. Scope to the runnable script, not the page.

       ⛔ AND THERE ARE TWO COPIES OF EVERY FUNCTION ON THIS PAGE. The Glass can publish new
       versions of ITSELF, so it carries its own source a second time, escaped inside a string
       literal — `function saveRuling(el, choice){\\n      if (!cap)...`. That copy is never
       executed. Taking the last <script> block found exactly that one and fed its backslash-n
       text to `new Function` ("Invalid or unexpected token").

       **The discriminator is real newlines**: the executable copy has character 10 in it, the
       embedded copy has the two characters backslash and n. */
    const SIG = "function saveRuling(el, choice)";
    let at = -1;
    for (let i = html.indexOf(SIG); i !== -1; i = html.indexOf(SIG, i + 1)) {
      if (html.slice(i, i + 300).includes(NL)) { at = i; break; }
    }
    if (at < 0) fails.push("6: saveRuling is not present as RUNNABLE code — only as the escaped copy the page carries of itself, so his rulings would never be saved");
    else {
      /* ⛔ BRACE-MATCH THE CODE, NOT THE COMMENTS. A naive depth counter walked straight past the
         end of this function and captured 6,106 characters, because a comment further down the
         page contains the text `{before,after}` — an unbalanced brace inside prose. **A counter
         that cannot tell code from commentary is not measuring the function.**
         So: skip line comments, block comments, and all three kinds of string literal. */
      const open = html.indexOf("{", at);
      let depth = 0, end = -1, q = "", inLine = false, inBlock = false;
      for (let i = open; i < html.length; i++) {
        const c = html[i], n = html[i + 1];
        if (inLine) { if (c === "\n") inLine = false; continue; }
        if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
        if (q) { if (c === "\\") i++; else if (c === q) q = ""; continue; }
        if (c === "/" && n === "/") { inLine = true; i++; continue; }
        if (c === "/" && n === "*") { inBlock = true; i++; continue; }
        if (c === '"' || c === "'" || c === "`") { q = c; continue; }
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) { end = i + 1; break; }
      }
      const fnSrc = end > 0 ? html.slice(at, end) : "";
      if (!fnSrc) fails.push("6: could not read saveRuling out of the page — unbalanced braces");
      else {
        const btns = [
          { choice: "opt-aaa", label: "Give me a way back" },
          { choice: "opt-bbb", label: "Save only the rows I dragged" },
        ].map((b) => ({
          getAttribute: (k) => (k === "data-label" ? b.label : k === "data-choice" ? b.choice : null),
        }));
        const el = {
          getAttribute: () => "q-real",
          querySelectorAll: () => btns,
          querySelector: (s) => (s === ".rnote" ? { value: "  and a note  " } : { textContent: "The question." }),
        };
        const state = { rulings: {} };
        let stored = null;
        try {
          /* Its collaborators are stubbed so the SAVE is what gets exercised, not the page around
             it. `buildDoc`/`cap.publish` are how the ruling reaches the artifact; a no-op here is
             correct — this case is about what gets RECORDED, not about publishing it. */
          // eslint-disable-next-line no-new-func
          const run = new Function("state", "cap", "el", "choice", "paintAsk", "queueSave",
            "buildDoc", "setDraft", "getDraft", "document",
            `${fnSrc}; saveRuling(el, choice); return state.rulings["q-real"];`);
          stored = run(state, { publish: () => Promise.resolve() }, el, "opt-bbb", () => {}, () => {},
            () => "<html></html>", () => {}, () => "",
            { getElementById: () => null, getElementsByClassName: () => [] });
        } catch (e) { fails.push(`6: saveRuling threw when run: ${e.message}`); }
        if (stored) {
          if (stored.chose !== "Save only the rows I dragged") {
            fails.push(`6: the ruling did not record WHICH option he chose in words (chose=${JSON.stringify(stored.chose)}) — DECISIONS.md would hold a key whose card is gone`);
          }
          if (!Array.isArray(stored.options) || stored.options.length !== 2) {
            fails.push("6: the ruling did not record the options he was SHOWN — 'the alternative he did not pick' becomes unrecoverable, which is the T-121 fault verbatim");
          }
          if (stored.note !== "and a note") fails.push("6: his written-in words were not saved with the ruling — 'Other' is where his best answers come from");
        } else if (!fails.some((f) => f.startsWith("6:"))) {
          fails.push("6: saveRuling stored nothing at all for a real (non-demo) card");
        }
      }
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (fails.length) {
  console.log(`FAIL — numbered_options_check (${fails.length}):`);
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log(judged5
  ? `  (case 5 judged ${judged5} dated question(s) on his Chart)`
  : "  (case 5 judged NO questions — BLOCKED ON WYATT is empty, so the anti-decay clause had nothing to apply to this run)");
console.log("PASS — numbered_options_check: every call he has to make is numbered with a (recommended), older questions still answerable, and his choice is stored in words.");
