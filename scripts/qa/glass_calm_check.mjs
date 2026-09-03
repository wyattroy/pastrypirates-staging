#!/usr/bin/env node
// GATE: the three things Wyatt called chaotic on the Glass, 2026-09-02T17:xxZ — `T-095`.
//
// HIS WORDS, verbatim:
//   "the glass looks chaotic again.
//    1. In Hand needs to give me context on what is being worked on -- i don't know or care about
//       the 'T-088 · claimed 2026-09-02T16:49Z' -- i want to know the content of it.
//    2. 'page published 3 min ago — it cannot see anything newer than that' should be up next to
//       '🟢 last progress 6 min ago' as one status bar with fewer words:
//       '🟢 Progress: 6 min ago. 🟢 Updated: 4 min ago.'
//    3. '…and there is more in that section this page could not read…' --> what is causing this?
//       debug and fix."
//
// Spec: `.planning/SPEC-GLASS-CALM.md`. CEO 112 APPROVED item 2 as written and REJECTED items 1 and
// 3 as first drafted; both rejections were re-measured and both held, so the shapes below are the
// corrected ones:
//   * item 1 does NOT look the title up in the Chart by its handle — `⟨T-088⟩` sits on two different
//     rows, so a lookup would confidently tell him we are resizing artwork while we fix his page.
//     The words are already in the claim marker. SPLIT THE FIELD, never look anything up.
//   * item 3 does NOT make the reader cleverer. The rejected draft warned only on prose containing a
//     "?" — and three of the five real prose blocks quote his own already-answered questions, marks
//     and all, so the red warning would still have been on his page after the work was reported
//     done. FENCE THE WRITER: the section is table rows, blanks and HTML comments or nothing.
//
// WHY EACH CASE PAIRS THE ASK WITH ITS LIE, the same discipline as `glass_his_five_asks_check.mjs`:
// this page's recurring fault is not a missing feature, it is a feature that says something untrue.
//   in hand ..... must name the WORK, and must never render blank for an old marker
//   the clock ... must be computed in his browser, so COLD moves with it
//   the bar ..... must keep BOTH clocks; one of them is the only thing that says how old the page is
//   the warning . must go quiet because there is nothing to find, never because it stopped looking
//
// ⚠ WHAT THIS GATE CANNOT SEE: it reads the HTML the real generator writes; it runs no browser, so
// it cannot prove the minute counter ticks. Where a value must be live it asserts BOTH that the
// browser is given what it needs and that the client script is the thing that writes the line — a
// value decided in Node is a value frozen at publish, which is the whole of his item 2.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");

let failed = false;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed = true; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log("the Glass is calm: his three faults of 2026-09-02T17:xxZ\n");

/* THE REAL GENERATOR, IN A THROWAWAY TREE — never a paraphrase, and never the real .planning/.
   `glass.mjs --note` rewrites glass.html AND CLEARS GLASS-NOTE.md unconditionally; a watch's
   unpublished note to Wyatt has already been destroyed once by a command run only to inspect the
   page (INBOX-20260902T0350Z). A gate must not be the second time. */
function render({ chart, status, note = "gate: glass_calm" }) {
  const dir = mkdtempSync(join(tmpdir(), "glass-calm-"));
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau", "status"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), readFileSync(GLASS));
  writeFileSync(join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"),
    readFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs")));
  writeFileSync(join(dir, ".planning", "CHART.md"), chart);
  if (status !== null) writeFileSync(join(dir, ".planning", "wyclau", "status", "a-machine.md"), status);
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", note], { stdio: "pipe" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return html;
}

/* THE REAL WRITERS, NEVER A HAND-TYPED COPY OF THEIR OUTPUT — the fixture comes out of
   claim_item.mjs and publish_status.mjs, so a change to either shape fails this gate rather than
   quietly passing against last week's format. `legacy` reproduces a marker written BEFORE the
   handle field existed, which is the case the reader must not render blank. */
function statusFile({ item, handle = null, ageMinutes = 0, stale = 90, legacy = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "glass-calm-claim-"));
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  const args = [join(ROOT, "scripts", "wyclau", "claim_item.mjs"), `--dir=${dir}`, `--item=${item}`, `--stale=${stale}`];
  if (handle) args.push(`--handle=${handle}`);
  execFileSync(process.execPath, args, { stdio: "pipe" });
  const p = join(dir, ".planning", "wyclau", "IN-HAND");
  const m = JSON.parse(readFileSync(p, "utf8"));
  if (legacy) delete m.handle;
  if (ageMinutes) m.claimedAt = new Date(Date.now() - ageMinutes * 60000).toISOString();
  writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  try { execFileSync(process.execPath, [join(ROOT, "scripts", "wyclau", "publish_status.mjs"), `--dir=${dir}`], { stdio: "pipe" }); } catch { /* exit 3 = unchanged */ }
  const out = readFileSync(join(dir, ".planning", "wyclau", "status", `${hostname()}.md`), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return out;
}

const CHART = (blockedBody) => `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **A thing still to do.**

## BLOCKED ON WYATT
${blockedBody}
## THE IDEA INBOX

*(empty)*
`;
const ONE_ROW = `
| Question | Recommendation | since |
|---|---|---|
| Ship the coin? | Yes — it is one line | 16:00Z |

`;

// Located by id, not by its words, so renaming the label does not silently retire the whole gate.
const inHandLine = (html) => (/<p[^>]*id="inHand"[^>]*>([\s\S]*?)<\/p>/.exec(html) || [null, null])[1];
const plain = (line) => String(line).replace(/<[^>]+>/g, "").trim();
// The client script only — never the server-rendered markup, so "the browser does it" is provable.
const clientScript = (html) => (/<script>([\s\S]*)<\/script>/.exec(html) || [null, ""])[1];

// ─────────────────────────────────────────────────────────────────────────────
// HIS ITEM 1 — "i want to know the content of it"
// ─────────────────────────────────────────────────────────────────────────────

// 1 — THE WORDS, NOT THE HANDLE. `T-095` is a filing handle; he has never needed to type one.
{
  const st = statusFile({ item: "fix the Glass: his three chaotic faults", handle: "T-095" });
  const line = inHandLine(render({ chart: CHART(ONE_ROW), status: st }));
  if (line === null) fail("nothing on the page says what is in hand at all");
  else if (!/fix the Glass: his three chaotic faults/.test(plain(line)))
    fail(`the in-hand line reads "${plain(line)}" — it does not print the words the claim carries, which is his whole ask`);
  else if (/\bT-095\b/.test(plain(line)))
    fail(`the in-hand line still shows him the handle: "${plain(line)}" — his words: "i don't know or care about the 'T-088 · claimed …'"`);
  else if (!/data-handle="T-095"/.test(line))
    fail("the handle vanished entirely — machines still need it, so it belongs in data-handle rather than in the sentence");
  else pass("a claim renders as the WORK, with the handle kept as an attribute");
}

// 2 — BE KIND TO THE MARKERS ALREADY ON DISK. Every claim written before the split field has only
//     `item`, usually shaped "T-nnn — words". Strip the prefix; NEVER render blank.
{
  const st = statusFile({ item: "T-088 — fix the Glass: his five asks", legacy: true });
  const line = inHandLine(render({ chart: CHART(ONE_ROW), status: st }));
  if (!/fix the Glass: his five asks/.test(plain(line)))
    fail(`a marker written before the handle field renders as "${plain(line)}" — an old claim must still print its words`);
  else if (/\bT-088\b/.test(plain(line)))
    fail(`the legacy prefix is still shown: "${plain(line)}" — "T-nnn — " is the handle, and he does not want it`);
  else pass("a legacy marker has its handle prefix stripped rather than being shown or dropped");

  const bare = statusFile({ item: "compressing the art", legacy: true });
  const bareLine = inHandLine(render({ chart: CHART(ONE_ROW), status: bare }));
  if (!/compressing the art/.test(plain(bareLine)))
    fail(`a legacy marker with no handle prefix renders as "${plain(bareLine)}" — the fallback must print it whole`);
  else pass("a legacy marker with no handle prefix is printed whole");
}

// 3 — NO RAW ISO TIMESTAMP ON HIS PAGE. It is the one format here he would have to do arithmetic on;
//     every other time on this page is already relative.
{
  const st = statusFile({ item: "fix the Glass", handle: "T-095" });
  const line = plain(inHandLine(render({ chart: CHART(ONE_ROW), status: st })));
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(line))
    fail(`the in-hand line prints a raw ISO timestamp: "${line}" — his words name that exact string as the thing he does not want`);
  else pass("no raw ISO timestamp on the in-hand line");
}

// 4 — THE CLOCK IS THE BROWSER'S, AND SO IS THE VERDICT. `inHandHtml` is built in Node, so an age
//     computed there really would freeze — which is the fault of his item 2, one line below. And
//     COLD must move with it: a page open on his phone has to stop claiming work is in hand once the
//     claim goes stale, rather than holding a judgement made at publish time.
{
  const st = statusFile({ item: "fix the Glass", handle: "T-095" });
  const html = render({ chart: CHART(ONE_ROW), status: st });
  const js = clientScript(html);
  const stateJson = (/<script type="application\/json" id="glassState">([\s\S]*?)<\/script>/.exec(html) || [null, "{}"])[1];
  let state = {}; try { state = JSON.parse(stateJson); } catch { /* reported below */ }
  if (!state.inHand || !state.inHand.claimedAt)
    fail("glassState carries no inHand.claimedAt — the browser has nothing to compute an age from, so whatever it shows was decided at publish time and is frozen");
  else if (!(state.inHand.staleAfterMinutes > 0))
    fail("glassState carries no inHand.staleAfterMinutes — COLD is still being decided in Node, so a page left open on his phone keeps saying work is in hand");
  else pass("the browser is given the claim's own timestamp and staleness rule");

  if (!/getElementById\("inHand"\)/.test(js))
    fail("the client script never touches the in-hand line — it is baked in at publish and cannot go cold or age");
  else pass("the client script owns the in-hand line");
}

// 5 — AND IT STILL FAILS TOWARD SILENCE. Every doubt about a claim resolves to NOT LIVE; a stale
//     claim must not read as work in progress. (The four states are `glass_his_five_asks_check`'s
//     subject; this asserts only that the split field did not break the safe direction.)
{
  const cold = statusFile({ item: "fix the Glass", handle: "T-095", ageMinutes: 200 });
  const line = plain(inHandLine(render({ chart: CHART(ONE_ROW), status: cold })));
  if (!/cold/i.test(line)) fail(`a claim 200 minutes past its own 90-minute staleness still reads as work in progress: "${line}"`);
  else if (!/fix the Glass/.test(line)) fail("a cold claim stops naming its work — he cannot tell what was abandoned");
  else pass("a stale claim reads as cold and still names the work");
}

// ─────────────────────────────────────────────────────────────────────────────
// HIS ITEM 2 — one status bar, his own wording, approved as written by CEO 112
// ─────────────────────────────────────────────────────────────────────────────

// 6 — ONE BAR, TWO CLOCKS, HIS WORDS. "🟢 Progress: 6 min ago. 🟢 Updated: 4 min ago."
{
  const st = statusFile({ item: "fix the Glass", handle: "T-095" });
  const html = render({ chart: CHART(ONE_ROW), status: st });
  const bar = (/<div class="pulseline" id="pulse">([\s\S]*?)<\/div>/.exec(html) || [null, null])[1];
  if (bar === null) fail("the status bar could not be found at all");
  else if (!/Progress:/.test(bar)) fail(`the status bar does not say "Progress:" — his wording, adopted verbatim: "${plain(bar)}"`);
  else if (!/Updated:/.test(bar)) fail(`the second clock is not in the bar — "Updated:" is what tells him how old this page is: "${plain(bar)}"`);
  else pass("one status bar carries both of his clocks in his own wording");

  /* ⚠ "GONE" MEANS GONE FROM WHAT HE READS, NOT GONE FROM THE FILE. The sentence is still quoted in
     two code comments, deliberately — this project keeps the reason a line existed when the line
     goes (rule 10), and a grep over the whole document would forbid that and quietly push the record
     out of the file. So the subject here is exactly the two places it could reach him: visible
     markup, and anything the client writes into the DOM. */
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const written = (clientScript(html).match(/\.(?:textContent|innerHTML)\s*=\s*[^;]+;/g) || [])
    .filter((a) => /cannot see anything newer/i.test(a));
  if (/cannot see anything newer/i.test(visible))
    fail("the apology is still in the page's visible markup — his item 2 replaces it with the Updated clock, which says the same thing in two words");
  else if (written.length)
    fail(`${written.length} client assignment(s) still write the apology into the page after the first tick`);
  else pass("the apologising second line is gone from everything he can read");
}

// 7 — TWO DOTS THAT COLOUR INDEPENDENTLY, ON THE RULE THAT ALREADY EXISTS. A fresh page reporting
//     stale progress is exactly the state he is complaining about, and it is invisible if one dot
//     answers for both. NO NEW CONSTANT: the 45-minute rule the first dot already used.
{
  const st = statusFile({ item: "fix the Glass", handle: "T-095" });
  const html = render({ chart: CHART(ONE_ROW), status: st });
  const js = clientScript(html);
  const dots = (js.match(/getElementById\("(?:pulseEmoji|updatedEmoji)"\)/g) || []).length;
  if (dots < 2) fail("only one dot is written by the client — the page cannot show fresh-page-with-stale-progress, which is the state he reported");
  else pass("two dots are written independently by the client");

  const staleTests = js.match(/>\s*STALE_MIN\b/g) || [];
  if (!/var STALE_MIN\s*=\s*45\b/.test(js)) fail("the 45-minute rule is not declared once as a named constant — the spec forbids inventing a new number here");
  else if (staleTests.length < 2) fail("the two dots do not both go through that one staleness rule — two copies of a threshold are two things kept in step by nothing");
  else pass("both dots use one 45-minute rule, declared once");
}

// ─────────────────────────────────────────────────────────────────────────────
// HIS ITEM 3 — the red "could not read" warning. Fence the WRITER, not the reader.
// ─────────────────────────────────────────────────────────────────────────────

// 8 — A NOTE TO WRITERS IS NOT CONTENT HE IS MISSING. The header note stays where writers meet it,
//     as an HTML comment, and must not raise an alarm on his page.
{
  const st = statusFile({ item: "fix the Glass", handle: "T-095" });
  const commented = `
<!-- THIS SECTION IS TABLE ROWS OR NOTHING. A question written here as prose is invisible to him. -->

| Question | Recommendation | since |
|---|---|---|
| Ship the coin? | Yes — it is one line | 16:00Z |

`;
  const html = render({ chart: CHART(commented), status: st });
  if (/could not read/i.test(html))
    fail("an HTML comment in BLOCKED ON WYATT still raises the red warning — the reader must strip comments before the check, or the writers' own note is what he sees flagged");
  else pass("an HTML comment in the section does not raise the warning");
}

// 9 — AND THE DETECTOR STAYS BROAD AND DUMB. Do NOT delete it: Your Call truthfully read (0) while a
//     real question sat in that section as prose, and he caught it in a screenshot.
{
  const st = statusFile({ item: "fix the Glass", handle: "T-095" });
  const prose = `
*Should the trial's red proof be allowed to flash a console window on every npm test?*

| Question | Recommendation | since |
|---|---|---|
| Ship the coin? | Yes — it is one line | 16:00Z |

`;
  const html = render({ chart: CHART(prose), status: st });
  if (!/could not read/i.test(html))
    fail("real prose in BLOCKED ON WYATT no longer raises the warning — the fix made the reader blind instead of making the section clean, which is the failure the detector exists for");
  else pass("real prose still raises the warning");
}

// 10 — THE REAL FILE, WHICH IS THE ONLY REASON HE SAW ANY OF THIS. Five prose blocks were sitting in
//      that section on a tree where `npm test` was green: nothing in the build could see them, and
//      the only thing that noticed was the renderer, at read time, on his page, in red.
{
  const chart = readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8");
  const sec = chart.split(/^## BLOCKED ON WYATT$/m)[1];
  if (sec === undefined) fail("`## BLOCKED ON WYATT` is not in .planning/CHART.md at all — the Glass's Your Call card has no source");
  else {
    const body = sec.split(/^## /m)[0];
    // A structural rule, not a guess about wording: table rows, blanks, HTML comments. Nothing else.
    const stripped = body.replace(/<!--[\s\S]*?-->/g, "");
    const offenders = stripped.split("\n").map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("|"));
    if (offenders.length)
      fail(`${offenders.length} line(s) in \`## BLOCKED ON WYATT\` are neither a table row, a blank, nor an HTML comment — his page prints a red warning about them. First: "${offenders[0].slice(0, 90)}"`);
    else pass("the real BLOCKED ON WYATT section is table rows, blanks and comments only");
  }
}

console.log(failed ? "\nFAIL" : "\nPASS");
process.exit(failed ? 1 : 0);
