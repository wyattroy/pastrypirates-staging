#!/usr/bin/env node
// GATE: the buttons Wyatt rules with are NUMBERED in his words, and the value under them never moves.
//
// HIS WORDS, Glass DO NOW pin, 2026-09-03 10:22 AM ET (INBOX-20260903T142249Z):
//   "Change the buttons that say Do It and Don't to Approve and Deny— and always when giving me
//    options to choose number or letter them"
//
// WHY A GATE AND NOT JUST AN EDIT. Two strings are the easiest thing in this repo to lose: the
// Glass generator is edited by every session that touches his page, and the buttons carry no test
// of their own. He has had to ask twice for the Lesson to move and four times for the Chart to
// re-prioritise. A label he asked for once, with nothing checking it, is a label that comes back.
//
// AND THE HALF THAT IS NOT ABOUT WORDS AT ALL — case 4. The button's `data-choice` is the VALUE
// stored in `glassState.rulings` and re-read at `glass.mjs`'s redraw to decide which button shows
// as pressed. Renaming the value while relabelling the button would orphan every ruling already
// saved on his live page: he would open it and find his own answers un-pressed. **The label is his
// to name; the value is a key and must not move.** That is the failure this gate exists to make
// impossible, and it is the one a careless "rename it everywhere" would cause.
//
// CASE 5 IS THE SWEEP (rule 8, same thing said the same way everywhere). `harvest_glass.mjs`
// writes his ruling into DECISIONS.md, and it wrote the raw value — so from the day of the
// relabel his page would say Approve while his own decision record said "yes".
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");
const HARVEST = join(ROOT, "scripts", "wyclau", "harvest_glass.mjs");

let failed = false;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed = true; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log("his ruling buttons are NUMBERED (his 15:56Z ruling), and the value under them never moves\n");

const CHART = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **A thing still to do.**

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|
| <!--qid:q-prose--> Ship the coin? | Yes — it is one line | 2026-08-01 |
| <!--qid:q-declared--> Which wind should the gauge show? | 1. Current push only (recommended) · 2. Show both · 3. Let me toggle it | 2026-09-03 |

## THE IDEA INBOX

*(empty)*
`;

/* THE REAL GENERATOR, IN A THROWAWAY TREE — never the real .planning/. `glass.mjs --note`
   rewrites .planning/wyclau/glass.html, and a watch's unpublished note to Wyatt has already been
   destroyed once by a command run only to inspect the page (INBOX-20260902T0350Z). */
function render() {
  const dir = mkdtempSync(join(tmpdir(), "glass-ruling-words-"));
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), readFileSync(GLASS));
  writeFileSync(join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"),
    readFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs")));
  writeFileSync(join(dir, ".planning", "CHART.md"), CHART);
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", "gate: glass_ruling_button_words"], { stdio: "pipe" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return html;
}

const html = render();

/* ⛔ READ BOTH SHAPES OF QUESTION, BECAUSE THIS GATE HAD ONLY EVER SEEN ONE. Until CEO 177 the
   fixture held a single question whose recommendation cell was PROSE, so the page always fell
   through to the three numbered defaults — and the gate that certifies his numbered-button ruling
   had never once rendered a question that DECLARES numbered options, which is the shape his ruling
   is about and which `numbered_options_check` case 5 now requires of every new question.

   Pointed at one, four of its cases went red with wrong messages, including *"the third button is
   gone"* about a button on screen reading **"3 Let us talk about it first"**. It was not gone; the
   gate was looking for a KEY (`talk`) and a declared option keys off its own words (`opt-<hash>`,
   `glass.mjs`'s `optionKey`). **The cheapest way to make that red go away would have been to put
   the fixture back to the shape he replaced** — which is exactly how a gate pins a reversed
   decision, the fault this file's own header was written about. So the cases below now assert the
   PROPERTY and the fixture carries both shapes. */
const rowOf = (qid) => {
  const at = html.indexOf(qid);
  if (at < 0) return null;
  const rowAt = html.indexOf('<div class="ruleRow">', at);
  if (rowAt < 0) return null;
  const end = html.indexOf("</div>", rowAt);
  return html.slice(rowAt, end < 0 ? rowAt + 4000 : end);
};
const buttonsIn = (row) => row === null ? [] :
  [...row.matchAll(/<button[^>]*data-choice="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => ({ value: m[1], label: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }));

const proseRow = rowOf("q-prose");
const declaredRow = rowOf("q-declared");
const buttons = buttonsIn(proseRow);          // the DEFAULT shape — keys must stay yes/no/talk
const declared = buttonsIn(declaredRow);      // the DECLARED shape — keys derive from the words
const labelFor = (v) => (buttons.find((b) => b.value === v) || {}).label;

/* ⛔ SUPERSEDED BY HIS OWN LATER RULING, THREE AND A HALF HOURS AFTER THE ONE ABOVE.
   Glass, 2026-09-03T15:56:28Z (11:56 AM ET): *"this is a perfect example of why 'approve' and
   'deny' make no sense here — what would 'approve' even mean in response to your above question?
   Replace Approve and Deny with 1 2 3 Other, to bring Glass into parity with Claude's question UI,
   and leave the box as a space to write 'other' content in."*

   **THIS GATE WAS ENFORCING THE WORDS HE HAD ALREADY ASKED US TO REMOVE.** It is the second gate
   in one day to do that — CEO 174 caught the first, in `numbered_options_check`, asserting that
   the word "Approve" must never disappear. Both were written in good faith from his 10:22 AM
   instruction and both outlived it.

   ⚑ **THE LESSON, AND IT IS WHY THIS COMMENT IS LONG: A GATE PINS A DECISION HARDER THAN CODE
   DOES.** Wrong code gets changed by the next person who reads it; a wrong gate makes doing what
   he asked look like breaking the build, so the next session "fixes" his instruction back out
   again. When you gate a piece of his wording, gate the PROPERTY he wanted (every call is
   numbered; the stored key never moves) rather than the literal string — the string is the part
   he keeps changing, and he is entitled to.

   AND HIS 10:22 INSTRUCTION IS NOT DISCARDED, because it had two halves: *"Change the buttons…
   AND ALWAYS WHEN GIVING ME OPTIONS TO CHOOSE NUMBER OR LETTER THEM."* The second half is the one
   that survived and it is now the rule for every card. Cases 4, 5 and 6 below are untouched: the
   stored value must still never move, or every ruling on his live page comes un-pressed. */
const NUMBERED = /^\s*\d+\s/;

/* 1/5 — EVERY BUTTON HE CAN PRESS OPENS WITH ITS NUMBER — both shapes of question. This is the
 *       PROPERTY his ruling asked for ("so I can reply with 1, 2, 3, 4, or other"), stated once
 *       and applied to every row, instead of three assertions each naming a literal key. */
{
  if (proseRow === null) fail("there is no ruling row on the page at all — the Your call card renders no buttons, so he cannot rule on anything");
  else if (declaredRow === null) fail("the question that DECLARES numbered options rendered no ruling row — the shape his 15:56Z ruling is about is the one missing");
  else {
    const unnumbered = [...buttons, ...declared].filter((b) => !NUMBERED.test(b.label));
    const bareVerb = [...buttons, ...declared].filter((b) => /^(do it|don.?t|approve|deny)$/i.test(b.label));
    if (bareVerb.length) fail(`${bareVerb.length} button(s) read as a bare verb with no number — ${JSON.stringify(bareVerb.map((b) => b.label))}. His 15:56Z ruling: "Replace Approve and Deny with 1 2 3 Other."`);
    else if (unnumbered.length) fail(`${unnumbered.length} button(s) do not open with a number — ${JSON.stringify(unnumbered.map((b) => b.label))}. He asked to reply "1, 2, 3, 4, or other"`);
    else pass(`every button on both shapes of question opens with its number (${buttons.length} default + ${declared.length} declared)`);
  }
}

/* 2/5 — A DECLARED OPTION CARRIES ITS OWN WORDS, and the recommended one is marked. A number he
 *       cannot read the meaning of is the fault he reported in the first place: "There is no 'yes'
 *       button -- only one that says 'do it' -- but what the 'it' is, is unclear." */
{
  if (!declared.length) fail("the declared-options question drew no buttons at all");
  else if (!declared.some((b) => /Current push only/.test(b.label))) {
    fail(`the buttons do not carry the option's WORDS — ${JSON.stringify(declared.map((b) => b.label))}`);
  } else if (!/recTag|recommended/i.test(declaredRow ?? "")) {
    fail("no (recommended) marker reached the page — he asked for numbers AND a (recommended)");
  } else pass(`a declared option carries its own words and its (recommended) marker ("${declared[0].label}")`);
}

/* 3/5 — HE DOES NOT LOSE A BUTTON. He named two labels to change; a rename that quietly dropped the
 *       third would be a session substituting its taste for his ask (rule 1: wording is his).
 *       Counted, not named by key — a declared question's third button is keyed off its own words. */
{
  if (buttons.length !== 3) fail(`a question that declares no options drew ${buttons.length} button(s), not 3 — he asked for two labels to change, not for a button to be removed`);
  else if (!buttons.some((b) => /talk/i.test(b.label))) fail(`the third default button no longer offers to talk — ${JSON.stringify(buttons.map((b) => b.label))}. He did not ask for that one to change`);
  else if (declared.length !== 3) fail(`the three-option question drew ${declared.length} button(s) — a declared option that does not reach his page is a choice he cannot make`);
  else pass(`three buttons on each shape, and the default third still offers to talk ("${buttons[2].label}")`);
}

/* 4/5 — ⛔ THE VALUE UNDER THE LABEL MUST NOT MOVE, AND THAT MEANS TWO DIFFERENT THINGS.
 *       `glass.mjs`'s redraw compares a saved ruling's `choice` against this attribute to decide
 *       which button shows as pressed, so a key that moves un-presses his own answers on a page he
 *       cannot re-rule from memory.
 *
 *       ⚠ THIS CASE USED TO SAY THE KEYS MUST BE EXACTLY `yes,no,talk` FULL STOP — which made a
 *       declared-option question a build failure, reporting `opt-1d2e9l,…` as if the page were
 *       broken. It is not: a declared option keys off its own WORDS by design, so that inserting
 *       an option cannot slide his saved tick onto a choice he never made. **The property is not
 *       "the keys are these three strings", it is "a key is stable for a given label".** Defaults
 *       keep yes/no/talk because rulings already on his live page carry those; declared options
 *       must key identically across two renders of the same words. Both halves below. */
{
  const values = buttons.map((b) => b.value).sort().join(",");
  const declaredKeys = declared.map((b) => b.value);
  const again = buttonsIn((() => { const h = render(); const at = h.indexOf("q-declared"); const r = h.indexOf('<div class="ruleRow">', at); return r < 0 ? null : h.slice(r, h.indexOf("</div>", r)); })());
  if (values !== "no,talk,yes") {
    fail(`the DEFAULT stored values are now ${JSON.stringify(values)} — they must stay yes,no,talk or every ruling already saved on his live page stops showing as answered`);
  } else if (!declaredKeys.every((k) => /^opt-/.test(k))) {
    fail(`a declared option's key is not content-derived — ${JSON.stringify(declaredKeys)}. A positional key moves his saved tick when an option is inserted`);
  } else if (again.map((b) => b.value).join(",") !== declaredKeys.join(",")) {
    fail(`the same option keyed differently on two renders — ${JSON.stringify(declaredKeys)} then ${JSON.stringify(again.map((b) => b.value))}. His saved ruling would come un-pressed on the next publish`);
  } else pass("the default keys are still yes/no/talk, and a declared option's key is content-derived and stable across renders");
}

// 5/5 — THE SWEEP: his own decision record must say the same word his page said. `harvest_glass.mjs`
//       carries a ruling into DECISIONS.md; it used to print the raw value, so his page would read
//       "Approve" and his record "yes" — the same thing said two ways, which is rule 8.
{
  const dir = mkdtempSync(join(tmpdir(), "glass-ruling-harvest-"));
  const page = join(dir, "page.html");
  const decisions = join(dir, "DECISIONS.md");
  const inbox = join(dir, "INBOX.md");
  /* ⚑ THE FIXTURE CARRIES `chose` AND `options` BECAUSE THE REAL PAGE DOES. `saveRuling` stores the
     LABEL he pressed and every label he was shown, beside the storage key. A fixture holding only
     `choice` is not his page — and case 5 below used to assert against exactly that, which is how
     it ended up REQUIRING the word "Approve" long after he had replaced it.
     The third ruling is a NUMBERED question: its key is a content hash, so it is the case where
     printing the key instead of the label puts "opt-15wnciu" in his permanent record. */
  const state = { ideas: [], comments: {}, rulings: {
    "t999-fixture": { q: "Ship the coin?", choice: "yes", chose: "1 Yes — go ahead",
      options: ["yes: 1 Yes — go ahead", "no: 2 No — do not", "talk: 3 Let us talk about it first"],
      at: "2026-09-03T14:30:00.000Z" },
    "t998-fixture": { q: "Rebuild the Glass on Firebase?", choice: "no", chose: "2 No — do not",
      options: ["yes: 1 Yes — go ahead", "no: 2 No — do not", "talk: 3 Let us talk about it first"],
      at: "2026-09-03T14:31:00.000Z" },
    "t997-fixture": { q: "Should the wind gauge show forecast?", choice: "opt-15wnciu",
      chose: "Current push only", options: ["opt-15wnciu: Current push only", "opt-1wszcjb: Show both"],
      at: "2026-09-03T14:32:00.000Z" },
  } };
  writeFileSync(page, `<script type="application/json" id="glassState">${JSON.stringify(state)}</script>`);
  writeFileSync(decisions, "# DECISIONS — fixture\n\n");
  writeFileSync(inbox, "# THE INBOX — fixture\n\n");
  execFileSync(process.execPath, [HARVEST, `--html=${page}`, `--decisions=${decisions}`, `--inbox=${inbox}`], { stdio: "pipe" });
  const out = readFileSync(decisions, "utf8");
  rmSync(dir, { recursive: true, force: true });

  /* ⛔ THIS CASE WAS THE THIRD PLACE ENFORCING THE WORDS HE ASKED US TO REMOVE, and it was the one
     nobody found: it required `Wyatt ruled "Approve"` and `"Deny"` LITERALLY, so his page said
     "1 Yes — go ahead" while his permanent decision record said "Approve" — and the gate's own
     green line claimed the record used "the same words the button showed him". **It printed a
     true-sounding sentence about a state that was false.** Found by CEO 176, in the same file
     whose cases 1 and 2 had just been corrected for exactly this fault. Two out of three.

     THE ASSERTION NOW MATCHES THE PROPERTY, NOT THE STRING (the lesson from cases 1 and 2, applied
     the whole way this time): whatever words were on the button he pressed are the words the record
     gets — so relabelling the buttons again never needs this file edited. */
  const ruled = [...out.matchAll(/\*\*Wyatt ruled "([^"]*)"\*\*/g)].map((m) => m[1]);
  if (/Wyatt ruled "(yes|no|talk)"/.test(out)) {
    fail('his decision record holds a storage KEY ("yes"/"no") instead of the words on the button he pressed');
  } else if (/Wyatt ruled "opt-/.test(out)) {
    fail('a NUMBERED ruling reached his record as a hash (opt-…) — the one durable trace of his answer is unreadable. glass.mjs saves `chose` for exactly this; harvest_glass.mjs must read it');
  } else if (/Wyatt ruled "(Approve|Deny)"/.test(out)) {
    fail('his record says "Approve"/"Deny" — words he replaced on 2026-09-03T15:56:28Z. The record must carry what the BUTTON said, never a hard-coded word');
  } else if (!ruled.includes("1 Yes — go ahead") || !ruled.includes("Current push only")) {
    fail(`the record does not carry the button's own words: ${JSON.stringify(ruled)}`);
  } else {
    /* ⛔ THIS CLAUSE COULD NOT FAIL, AND IT GUARDED THE ONE THING THAT WRITES A FALSEHOOD INTO HIS
       RECORD. It read:

         !/Current push only.*his pick|…/.test(out) && !/- Show both/.test(out)

       `- Show both` is ALWAYS in the output, so the right-hand side is always false and the whole
       condition never fires. CEO 177 measured it: deleting the "his pick" marker entirely → 6× ok,
       PASS; **flipping the marker onto the option he did NOT press → 6× ok, PASS.** That second one
       is not a missing check, it is a check standing next to a sentence in his permanent record
       saying he chose something he did not.

       **Third review running in which this file passed a case that could not fail.** So the marker
       is now located and compared to `chose` — the same value the record says he ruled. */
    const lines = out.split(String.fromCharCode(10));
    const marked = lines.filter((l) => /←\s*\*\*his pick\*\*/.test(l))
      .map((l) => l.replace(/^-\s*/, "").replace(/\s*←[\s\S]*$/, "").trim());
    const listed = lines.filter((l) => /^- /.test(l)).length;
    if (!listed) {
      fail("the alternatives he did NOT pick are not recorded, though the page carried them — the charter asks every ruling to record them");
    } else if (marked.length !== 3) {
      fail(`${marked.length} option(s) are marked as his pick across the 3 fixture rulings — every ruling that carried its options must mark exactly the one he pressed, once`);
    } else if (!["1 Yes — go ahead", "2 No — do not", "Current push only"].every((w) => marked.includes(w))) {
      fail(`the "his pick" marker sits on the wrong option — marked ${JSON.stringify(marked)}, but he pressed "1 Yes — go ahead", "2 No — do not" and "Current push only". A misplaced marker states in his permanent record that he chose something he did not.`);
    } else pass("a harvested ruling reaches DECISIONS.md in the same words the button showed him, numbered questions included, with the alternatives beside it and the marker on the one he actually pressed");
  }
}

// 6/6 — THE OTHER HALF OF HIS SENTENCE, AND IT IS NOT A BUTTON. "and always when giving me options
//        to choose number or letter them" is a standing WRITING rule: it governs the question UI,
//        a BLOCKED ON WYATT row that offers alternatives, and any reply laying out ways to go.
//
// ⚠ WHAT THIS CASE HONESTLY CHECKS, AND WHAT IT CANNOT. It checks that the RULE IS STILL WRITTEN
//   DOWN where a session reads it. It cannot check that a session obeyed it — no gate can read
//   prose for that, and pretending otherwise would be the "green suite that proves nothing about
//   what he sees" this project already owns a rule about.
//   IT IS HERE ANYWAY BECAUSE THE RULE IS IN THE WRONG HOME AND EVERYONE SHOULD KNOW IT. The
//   canonical place is `.claude/CLAUDE.md` §1 and `.claude/memory/DECISIONS.md`; a watch is fenced
//   out of `.claude/` (measured 2026-09-03 — both edits refused as protected files), so the rule
//   lives in the wyclau CHARTER, which is the most-read file this watch could write. A rule in an
//   unusual home is a rule somebody tidies away, so it is pinned.
{
  const charter = readFileSync(join(ROOT, ".planning", "wyclau", "CHARTER.md"), "utf8");
  if (!/number or letter/i.test(charter)) fail("his 2026-09-03 rule — number or letter every option you put in front of him — is no longer written in .planning/wyclau/CHARTER.md, and it is not in .claude/ either, so nothing a session reads carries it");
  else if (!/INBOX-20260903T142249Z/.test(charter)) fail("the numbering rule is in the CHARTER but no longer cites the instruction it came from — a rule with no source is a rule the next session argues with");
  else pass("his numbering rule is still written where a session reads it, and still cites his own words");
}

console.log(failed ? "\nFAIL" : "\nPASS");
process.exit(failed ? 1 : 0);
