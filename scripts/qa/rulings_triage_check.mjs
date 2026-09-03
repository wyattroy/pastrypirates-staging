// GATE: HIS RULINGS CARD IS GONE, AND NO RULING MAY GO MISSING BECAUSE OF IT.
//
// ⚑ WHAT CHANGED, 2026-09-03 (T-087). Wyatt, on the Glass 2026-09-02T13:18:28.755Z: "Remove the
// 'Your rulings in hand' box from the Glass". The card this gate was written around no longer
// exists. That is his instruction and it is carried out in scripts/wyclau/glass.mjs.
//
// AND REMOVING IT MOVED A REAL SAFETY PROPERTY ONTO THIS FILE, which is why this header is long.
// Until today, a freshly harvested ruling with an empty "now" cell was VISIBLE to him on that
// card while it waited to be triaged. With the card gone, ## RULED is a session-facing waiting
// room that HE CANNOT SEE. Four of his rulings were sitting in it at the moment the card was
// removed. So "untriaged is legal" -- which case 5 used to assert, and which was true while the
// card existed -- has become "untriaged is invisible", and case 5 below turns it into a build
// failure instead. The one thing this must never become is over-hiding: his answer disappearing
// from every surface is a worse fault than the stale card he complained about.
//
// The original ask this gate was built for, still in force:
// Wyatt, 2026-09-01 (INBOX-20260901T1310Z): "The Glass's Your Rulings -- In Hand are stale; there
// must be a process that triages them and adds them to the Tasks list, then removes them from the
// Your Rulings list."
//
// THE PROCESS THIS GATE ENFORCES (the Chart states it in full, above its own RULED table):
//   1. a freshly harvested ruling lands in ## RULED -- and is triaged in the SAME act, because
//      nothing shows it to him while it sits there;
//   2. if it still needs work, a "- [ ] Your ruling: ..." row goes in the STEP 1 CHECKLIST,
//      which is what the Glass builds its Tasks card from -- no second list to keep in step;
//   3. the row moves to ## SETTLED RULINGS with its verdict, and leaves the waiting room.
//
// ⚠ AND A CLAIM THIS FILE USED TO MAKE THAT IS FALSE, CORRECTED IN THE OPEN RATHER THAN DELETED.
// The header said the Glass generator "is VENDORED from claude-kit, which lives on Wyatt's Mac
// ... and there is no way to re-vendor from this machine", and used that to explain why the fix
// lived in the record instead of the page. claude-kit is at C:\Users\wyatt\Projects\claude-kit on
// this machine, and vendor_check.mjs does not fail on a local edit -- it reports DRIFT and says
// in its own words "that is the system working: the project owns its copy". A watch that believed
// that sentence would have refused his instruction on a blocker that does not exist.
//
// BOTH DIRECTIONS ARE RED-PROOFED (cases 3 and 4), and so is the removal itself (case 7), because
// a gate that has only ever been green on the tree it was written against has not been shown to
// fail.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { retireQuestion } from "../wyclau/lib/retire.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");

let failed = false;
const fail = (m) => { console.error(`FAIL -- ${m}`); failed = true; };
const pass = (m) => console.log(`PASS -- ${m}`);

// A verdict is DECLARED in this table's own convention: bold at the head of the "now" cell.
// Anything else -- including an empty cell -- is untriaged, which is the safe default: he
// steers by this card, so a ruling wrongly SHOWN costs far less than one wrongly hidden.
const DECLARED = /^\*\*[^*]{1,200}\*\*/;
// Outstanding work, i.e. this ruling still owes a task. Only unambiguous waiting phrases are
// trusted, and deliberately NOT the bare word "scheduled": "the stall test passed through the
// scheduled task" is Windows' Task Scheduler in a finished verdict, and an earlier draft of this
// filed that closed ruling as live work. A state word in passing prose is not a state.
const OUTSTANDING = /\bAWAIT(?:S|ED|ING)?\b|\bSTILL OPEN\b|\bNOT YET\b|\bPENDING\b|\bGATED ON\b|\bWAIT(?:S|ING)? (?:ON|FOR)\b|\*\*SCHEDULED\*\*/i;

function sectionRows(md, heading) {
  const sec = md.split(new RegExp(`^## ${heading}[^\\n]*$`, "m"))[1]?.split(/^## /m)[0] ?? "";
  return sec.split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*item\b/i.test(l) && !/^\|\s*-+/.test(l))
    .map((l) => {
      const c = l.split("|").map((x) => x.trim());
      return { item: c[1] ?? "", call: c[2] ?? "", now: c[3] ?? "" };
    });
}
const checklistRows = (md) => (md.split(/^## STEP 1 CHECKLIST[^\n]*$/m)[1]?.split(/^## /m)[0] ?? "")
  .match(/^- \[ \] .*$/gm) || [];

/* ⚠ A SECOND HELPER FOR THIS EXACT REPAIR WAS WRITTEN HERE AT 14:0xZ AND REMOVED AGAIN, BY A WATCH
   THAT DID NOT KNOW ANOTHER SESSION WAS IN THIS FILE. Both sessions were making the same dependent
   repair from `SPEC-CHARTKEEPER.md` — the settled table moved to `CHART-LOG.md`, so this gate has to
   read it there. The version below won on merit: passing `settledMd` as a PARAMETER keeps the
   fixtures isolated, where the removed one read the real log inside the helper and would have judged
   every fixture against the real tree.
   **Recorded rather than tidied away, because the duplication is the finding**: neither session had
   claimed this file in the ledger, so nothing on disk said it was taken. Eighth sighting. */

/* `mutate` transforms the GENERATOR'S SOURCE before it is staged, so a fixture can render a
   different Glass rather than a differently-edited string. Case 7's red-proof needs exactly that:
   put the card back in the generator and prove the real render brings it back. Default is
   identity, so every other caller is unchanged. */
function renderWith(chart, mutate = (s) => s) {
  const dir = mkdtempSync(join(tmpdir(), "rulings-triage-"));
  mkdirSync(join(dir, "scripts", "wyclau"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), mutate(readFileSync(GLASS, "utf8")));
  /* glass.mjs IMPORTS ./lib/chart_model.mjs since the 2026-09-02 convergence — a staged copy without its dependency dies with ERR_MODULE_NOT_FOUND. */
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"), readFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs")));
  writeFileSync(join(dir, ".planning", "CHART.md"), chart);
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", "triage gate"], { stdio: "pipe" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return {
    html,
    /* ⚑ KEPT AFTER THE CARD WAS REMOVED, AND IT IS NOT DEAD CODE — it is the DETECTOR case 7 uses
       to prove the card is gone, and the same expression that used to prove it was present. If it
       ever finds a table again, his box is back. */
    rulingsCard: (/<table id="ruled">([\s\S]*?)<\/table>/.exec(html) || ["", ""])[1],
    /* ⚠ BROKE 2026-09-02 AND IT IS THE SAME FAULT AS CASE 4's FIXTURE, TWICE IN ONE DAY.
       This was `/<h2>Tasks \(/` — anchored to the card's exact heading text. Wyatt then had the
       card renamed to "The Chart (Tasks To Do)" (his ask, made five times), and this gate went red
       reporting "3 rulings on neither card" — a false alarm about the RECORD caused by a change to
       the PAGE. A check that locates content by a user-facing string breaks every time the words
       change, and the words are exactly what he keeps changing.
       FIXED BY ANCHORING TO STRUCTURE, NOT COPY: the card is the one whose heading carries the
       "N done · N open" counts, which is a fact about what the card IS rather than what it is
       called. Rename it again and this keeps working. */
    tasksCard: (/<h2>[^<]*\bdone\b[^<]*\bopen\b[\s\S]*?<\/section>/.exec(html) || ["", ""])[0],
  };
}

// The rule, in one function, so the real Chart and the red-proof fixtures are judged identically.
/* ⚑ SETTLED RULINGS MOVED OUT OF THE CHART — 2026-09-02, Wyatt's ruling that the Chart shows only
   WHERE WE ARE GOING. The sweep took that table to `.planning/CHART-LOG.md`, so reading it from the
   Chart found NOTHING and this half of the gate silently stopped checking anything — a check that
   cannot fail, arriving through a change nobody connected to it. SPEC-CHARTKEEPER.md named it as a
   dependent repair before the sweep shipped; this is it.
   `settledMd` IS A PARAMETER, NOT A FILE READ, and that matters: the first attempt read the real log
   inside this function, which meant every FIXTURE below was silently judged against the real tree.
   Case 5 caught it immediately. A gate that mixes fixture data with real data is not isolated, and
   an unisolated fixture proves nothing. */
function violations(md, settledMd) {
  const out = [];
  for (const r of sectionRows(md, "RULED")) {
    if (DECLARED.test(r.now)) out.push(`"${r.item.slice(0, 60)}" sits in ## RULED with a verdict already written (${r.now.slice(0, 40)}…) -- a ruling with a fate has been triaged and belongs in ## SETTLED RULINGS, off the card.`);
  }
  /* ⚠ ONLY THE TAGGED ROWS COUNT, and the first version of this got it wrong. Searching the WHOLE
     checklist for the ruling's words made case 4's red-proof pass silently: delete the cutover
     ruling's row and "cutover" is still there in "Rulebook cutover: CLAUDE-next.md replaces…",
     "moment" still there in "GATED: same quiet moment". The gate looked green while the thing it
     guards was gone. Scoped to rows that declare themselves, so an accidental word match in
     somebody else's task can never stand in for a ruling's own row. */
  /* ⛔ NORMALISE BOTH SIDES THE SAME WAY, OR THE MATCH IS A COIN FLIP. The key below strips
     backticks and asterisks (`⟨`T-102`⟩` → `⟨t-102⟩`) and this haystack did not — so every ruling
     whose first long word is its own task token could NEVER match, however perfect its row.
     That is what all EIGHT failures were on 2026-09-03: each row existed, each reported "2 of 3
     words matched", and the missing word was the token every time.

     WHAT IT COST, and it is why this is a ⛔ and not a tidy-up: the suite is an `&&` chain and this
     gate sits ~90th of 123, so a third of the fence — stray_probe_check, numbered_options_check,
     doc_command_check among them — DID NOT RUN ALL DAY. A false failure here is not a nuisance;
     it silently switches off everything downstream of it. Caught while acting on CEO 174. */
  const norm = (s) => s.replace(/[`*]/g, "").toLowerCase();
  const checklist = norm(checklistRows(md).filter((l) => /Your ruling:/i.test(l)).join("\n"));
  /* ⚑ NEW 2026-09-03 WITH T-087, AND IT IS THE PROPERTY THE DELETED CARD USED TO PROVIDE.
     While "Your rulings, in hand" existed, a row sitting here with an empty `now` cell was still
     ON HIS PAGE, so waiting was harmless. He asked for that card to go. Nothing renders ## RULED
     now, so a row that waits here waits somewhere only sessions can see -- which is the same
     "on no surface he can see" fault the rule below already guards, arriving through the front
     door instead of the back. A ruling that needs no work goes STRAIGHT to SETTLED and never
     needs a task row; a ruling that needs work gets its checklist row in the act of harvesting
     it, which is what puts it on the Tasks card he does read. */
  for (const r of sectionRows(md, "RULED")) {
    const key = r.item.replace(/[`*]/g, "").replace(/<!--[\s\S]*?-->/g, "").toLowerCase()
      .split(/\s+/).filter((w) => w.length > 4).slice(0, 3);
    if (!key.length || !key.every((w) => checklist.includes(w))) {
      /* ⚠ NAME THE NEAR-MISS, NOT JUST THE ABSENCE. The first version of this message said only
         "no row in the STEP 1 CHECKLIST", and the very first time it fired the row WAS there --
         it missed on one character ("your ideas." against his "your ideas?"). A peer session lost
         ten minutes hunting for something absent when the true state was "present, reworded". The
         message now shows the words it looked for and the closest row it found, so the reader can
         see a near-miss for what it is. */
      const near = checklistRows(md).filter((l) => /Your ruling:/i.test(l))
        .map((l) => ({ l, hits: key.filter((w) => norm(l).includes(w)).length }))
        .sort((a, b) => b.hits - a.hits)[0];
      const nearNote = near && near.hits
        ? ` CLOSEST ROW FOUND (${near.hits} of ${key.length} words matched, so this may be a near-miss rather than a missing row): ${near.l.replace(/^- \[ \] /, "").slice(0, 110)}…`
        : " No 'Your ruling:' row in the checklist came close, so this one is genuinely absent.";
      out.push(`"${r.item.slice(0, 60)}" is waiting in ## RULED with no "- [ ] Your ruling: …" row in the STEP 1 CHECKLIST -- since the "Your rulings, in hand" card was removed (T-087, his instruction) nothing renders this section, so it is on no surface he can see. Triage it in the same act that harvests it: task row if it owes work, straight to ## SETTLED RULINGS if it does not. Words looked for: ${key.join(", ")}.${nearNote}`);
    }
  }
  for (const r of sectionRows(settledMd ?? md, "SETTLED RULINGS")) {
    if (!OUTSTANDING.test(r.now)) continue;
    const key = r.item.replace(/[`*]/g, "").toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 3);
    if (!key.length || !key.every((w) => checklist.includes(w))) {
      out.push(`settled ruling "${r.item.slice(0, 60)}" still owes work but has no "- [ ] Your ruling: …" row in the STEP 1 CHECKLIST -- it has left the rulings card without reaching the Tasks card, so it is on no surface he can see.`);
    }
  }
  return out;
}

const realChart = readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8");
/* The settled table now lives in the log (his sweep ruling). Read it here, ONCE, and hand it in —
   so the real call is judged against the real log and every fixture below is judged against itself. */
const realSettled = (() => {
  try {
    const log = readFileSync(join(ROOT, ".planning", "CHART-LOG.md"), "utf8");
    if (/^## SETTLED RULINGS/m.test(log)) return log;
  } catch { /* no log yet — the sweep has not run on this tree */ }
  return realChart;
})();

// 1/7 -- THE REAL CHART OBEYS THE LIFECYCLE.
{
  const v = violations(realChart, realSettled);
  if (v.length) v.forEach((m) => fail(m));
  /* ⚠ THE SETTLED COUNT READS THE LOG, NOT THE CHART — it used to read `realChart`, a section that
     has been empty since the sweep moved SETTLED RULINGS to CHART-LOG.md, so this green line
     printed "0 settled" forever. Caught by CEO 151. A hand-read number inside a PASS line rots
     exactly like one in a document, and is harder to notice because it is wearing a pass. */
  else pass(`the Chart's rulings lifecycle holds: ${sectionRows(realChart, "RULED").length} waiting to be triaged, ${sectionRows(realSettled, "SETTLED RULINGS").length} settled.`);
}

// 2/7 -- WHAT HE ACTUALLY SEES, through the real generator: every ruling that still owes work is
//        on the Tasks card. The record could be tidy and the page still wrong; only rendering it
//        can tell.
/* ⚠ THIS CASE USED TO CARRY A SECOND HALF AND IT IS DELETED RATHER THAN LEFT TO ROT, which is the
   point worth reading. It asserted "no settled ruling leaks into the rulings card". With the card
   gone, `rulingsCard` is the empty string forever, so `leaked` could never be non-empty and that
   half would have gone on printing PASS while testing nothing -- a check that cannot fail, which
   this project has been bitten by often enough to name it (docs/HARD-WON-LESSONS.md §10, and
   `sailedHere()` returning false for every leg of every trial). A removed feature must take its
   assertions with it. Case 7 replaces it with the assertion that now matters: the card is GONE. */
{
  const { tasksCard } = renderWith(realChart);
  const settled = sectionRows(realSettled, "SETTLED RULINGS");
  const owing = settled.filter((r) => OUTSTANDING.test(r.now));
  const missing = owing.filter((r) => !tasksCard.toLowerCase().includes(r.item.replace(/[`*]/g, "").toLowerCase().slice(0, 25)));
  if (missing.length) fail(`${missing.length} ruling(s) with work outstanding are on no card at all -- e.g. "${missing[0].item.slice(0, 50)}".`);
  else pass(`the rendered page agrees: all ${owing.length} still-owing ruling(s) visible in Tasks.`);
}

// 3/7 -- RED-PROOF, DIRECTION ONE: a settled ruling left in the waiting room must FAIL.
{
  const bad = realChart.replace(/^## RULED[^\n]*$/m, "$&\n\n| The cutover moment | **\"After the exit test verdict\"** | **SCHEDULED** — gated on the exit test verdict. |");
  if (!violations(bad).length) fail("the gate cannot fail: a ruling carrying a verdict was planted in ## RULED and nothing objected.");
  else pass("red-proof: a verdict-carrying row planted in ## RULED is caught.");
}

// 4/7 -- RED-PROOF, DIRECTION TWO: an owing ruling with no checklist row must FAIL.
{
  /* ⚠ WENT STALE 2026-09-02 AND SAID SO — which is the whole reason this line is worth reading.
     The pattern used to be `^- \[ \] Your ruling: the cutover moment`, anchored to the checkbox with
     nothing allowed between it and the words. The Chartkeeper build then began giving every row a
     stable id, so CHART.md:431 now reads "- [ ] `T-007` Your ruling: the cutover moment" and this
     fixture matched nothing.
     IT FAILED LOUDLY RATHER THAN PASSING, and that is the design working: the message below says
     "the fixture is stale, so case 4 proves nothing" instead of quietly reporting a green case-4 that
     had tested nothing at all. The comment at :86 records that an earlier version DID pass silently
     here, and this is the guard that was added because of it.
     FIXED THE WAY :91 ALREADY WORKS — match the row by its WORDS, not by an exact prefix, so any
     future row-head decoration (an id, a star, a size tag) cannot break it again. */
  const bad = realChart.replace(/^- \[ \] .*Your ruling: the cutover moment.*$/m, "");
  if (bad === realChart) fail("the red-proof could not find the checklist row it meant to delete -- the fixture is stale, so case 4 proves nothing.");
  else /* ⚑ THE SETTLED SOURCE MUST BE HANDED IN HERE TOO — 2026-09-02. The sweep moved SETTLED RULINGS
     out of the Chart and into the log, so a fixture built from the Chart alone contains NO owing
     rulings at all, and this red-proof silently had nothing to detect. It said so rather than
     passing, which is the design working twice in one file. */
  if (!violations(bad, realSettled).length) fail("the gate cannot fail: a ruling that still owes work had its only task row deleted and nothing objected.");
  else pass("red-proof: deleting an owing ruling's checklist row is caught.");
}

/* ⚠ CASE 5 USED TO BE "AN UNTRIAGED RULING IS STILL SHOWN", and its own comment read: "Over-hiding
   is the failure that would replace the one he reported, and it would be harder to notice." THAT
   SENTENCE IS STILL TRUE -- what changed is that the card it relied on is gone at his instruction,
   so the protection had to move rather than be deleted. Cases 5 and 6 below are that move: 5
   proves an untriaged ruling can no longer sit unnoticed, and 6 proves the rule it rests on can
   actually fail. */

// 5/7 -- A RULING PARKED IN ## RULED WITH NO TASK ROW MUST FAIL. This is the protection that used
//        to be the card: with nothing rendering that section, waiting there means invisible.
{
  const chart = `# Chart\n\n## STEP 1 CHECKLIST\n\n## BLOCKED ON WYATT\n\n## THE IDEA INBOX\n\n*(empty)*\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n| Whether the tutorial ships before launch | **"Yes, before"** | |\n`;
  const v = violations(chart);
  if (!v.length) fail("the gate cannot fail: a ruling was left in ## RULED with no task row and nothing objected -- with the card removed, that ruling is on no surface he can see.");
  else if (!/tutorial ships before launch/.test(v[0])) fail(`the parked ruling was caught, but the message names the wrong row: ${v[0].slice(0, 90)}`);
  else pass("red-proof: a ruling parked in ## RULED with no task row is caught and named.");
}

// 6/7 -- AND THE SAME RULING WITH A TASK ROW IS LEGAL. Without this, case 5 could be satisfied by
//        a rule that condemns every ruling, which would be over-hiding's mirror image: a gate
//        nobody can ever satisfy gets disarmed, and then it protects nothing at all.
{
  const chart = `# Chart\n\n## STEP 1 CHECKLIST\n\n- [ ] \`T-999\` Your ruling: whether the tutorial ships before launch — build it first.\n\n## BLOCKED ON WYATT\n\n## THE IDEA INBOX\n\n*(empty)*\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n| Whether the tutorial ships before launch | **"Yes, before"** | |\n`;
  const v = violations(chart);
  if (v.length) fail(`a triaged ruling -- one with its own "Your ruling:" task row -- was reported as a violation: ${v[0].slice(0, 90)}`);
  else pass("a ruling that has been triaged onto the Tasks card is legal.");
}

// 7/7 -- HIS INSTRUCTION, ON THE RENDERED PAGE: "Remove the 'Your rulings in hand' box from the
//        Glass" (2026-09-02T13:18:28.755Z). Asserted against the real generator and the real
//        Chart, so it is about the page he opens and not about the source text.
{
  const { html, rulingsCard } = renderWith(realChart);
  /* ⚠ HTML COMMENTS ARE STRIPPED FIRST, AND THIS IS NOT A LOOPHOLE — IT IS THE DIFFERENCE BETWEEN
     JUDGING THE PAGE AND JUDGING THE SOURCE. The generator carries a long <!-- --> note at the
     removal site explaining where his rulings went, and that note necessarily quotes the card's
     name. Un-stripped, this case failed with "Its heading renders" against a comment that draws
     nothing — an instrument condemning the very fix it was written to verify (rule 6: when a check
     condemns something known to be right, suspect the check). What he sees is what renders. */
  const visible = html.replace(/<!--[\s\S]*?-->/g, "");
  /* ⚠ AND IT MUST MATCH THE CARD'S HEADING ELEMENT, NEVER THE PHRASE ANYWHERE ON THE PAGE — this
     is the same lesson already written at :91 of this file, learned again ninety minutes later.
     A bare /Your rulings,? in hand/ over the whole document went red on a correctly-fixed tree,
     because the triage rows written to carry his four stranded rulings QUOTE HIS INSTRUCTION:
     "Remove the 'Your rulings in hand' box from the Glass". So the words that ask for the card's
     removal were being read as evidence the card was still there. Locate the card by what it IS —
     a heading element, and its table's id — not by what it is called. */
  const heading = /<h2>[^<]*Your rulings,? in hand/i.test(visible);
  if (heading || rulingsCard) fail(`the "Your rulings, in hand" card is back on the Glass -- he asked for it removed on 2026-09-02T13:18:28.755Z (T-087).${heading ? " Its heading renders." : ""}${rulingsCard ? " Its table renders." : ""}`);
  else {
    /* RED-PROOF, IN-FILE, so this case is not merely green on the tree it was written against:
       splice the card's own markup back into the rendered page and prove the same two tests find
       it. Anchored to the markup the generator used to emit, so a future rewrite that reintroduces
       the card in the same shape is caught. */
    /* ⚑ THE RED-PROOF PUTS THE CARD BACK IN THE GENERATOR AND RE-RENDERS — it does not hand-write
       markup into the finished page. CEO 151 caught the first version doing the latter: "case 7's
       red-proof only tests its own regex against its own string", while every other case in this
       file goes through the real generator. The difference is not pedantry — a hand-written
       fixture proves the REGEX works, and what needs proving is that a Glass which still builds
       the card is CAUGHT. This version restores the card the way a careless future edit would (a
       <section> emitted into the page body) and asserts the same two tests find it.
       ANCHORED ON THE "Shipped today" CARD because that is what the removed one sat beside; if a
       future rewrite renames it, the splice fails and this case says so rather than passing. */
    const anchor = "  <section class=\"card\">\n    <h2>Shipped today (";
    const revivedSrc = (src) => src.replace(anchor, "  <section class=\"card\"><h2>Your rulings, in hand (1)</h2><table id=\"ruled\"><tr><td>x</td><td>y</td></tr></table></section>\n" + anchor);
    if (revivedSrc(readFileSync(GLASS, "utf8")) === readFileSync(GLASS, "utf8")) {
      fail("the red-proof could not put the card back into the generator -- its anchor on the \"Shipped today\" card no longer matches, so case 7 proves nothing.");
    } else {
      const revived = renderWith(realChart, revivedSrc).html.replace(/<!--[\s\S]*?-->/g, "");
      const back = /<h2>[^<]*Your rulings,? in hand/i.test(revived) && /<table id="ruled">/.test(revived);
      if (!back) fail("the red-proof failed: the generator was edited to build the card again, the page was re-rendered, and this case did not detect it.");
      else pass('his instruction holds: no "Your rulings, in hand" card on the rendered Glass, and a generator that builds one again is caught by the same test.');
    }
  }
}

// 8/8 -- THE HARVEST TOOL'S OWN NORMAL OUTPUT MUST BE LEGAL UNDER THE RULE ADDED ABOVE.
/* ⚑ CEO 151's SHARPEST FINDING, AND IT WOULD HAVE BEEN A LANDMINE. The new rule makes a ruling
   parked in ## RULED with no task row a build failure. `retireQuestion()` in
   scripts/wyclau/lib/retire.mjs writes exactly such a row every time Wyatt answers a question and
   a watch harvests it -- so the very next harvest would have turned npm test red, with a message
   telling the watch to do something the tool had not done. A gate condemning the tool that feeds
   it is not a gate, it is a trap.
   `retireQuestion` now writes the task row in the same act, and THIS CASE IS WHAT KEEPS THE TWO
   TOGETHER: it runs the real function on a fixture and asserts the result is clean. Split them
   again -- weaken the insert, or tighten the rule -- and this goes red immediately, which is the
   whole point of testing the seam instead of each side of it (rule 23). */
{
  const chart = `# Chart\n\n## STEP 1 CHECKLIST\n\n- [ ] \`T-001\` something else entirely\n\n## BLOCKED ON WYATT\n\n| Question | Recommendation | since |\n|---|---|---|\n| <!--qid:should-the-tutorial-ship-first--> Should the tutorial ship before launch? | rec | 2026-09-03 |\n\n## THE IDEA INBOX\n\n*(empty)*\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n`;
  const r = retireQuestion(chart, "should-the-tutorial-ship-first", "Yes, before");
  if (!r.ok) fail(`the real retireQuestion() refused a well-formed fixture, so this seam cannot be tested: ${r.error}`);
  else {
    const v = violations(r.next);
    const ruledCount = sectionRows(r.next, "RULED").length;
    if (ruledCount !== 1) fail(`retireQuestion() did not leave exactly one row in ## RULED (${ruledCount}) -- the fixture is wrong and this case proves nothing.`);
    else if (v.length) fail(`recording his answer with the real harvest tool produces a Chart this gate condemns: ${v[0].slice(0, 140)}`);
    else pass("the seam holds: retireQuestion() records his answer AND puts it on the Tasks card in one act, and the rule above accepts its own tool's output.");
  }
}

process.exit(failed ? 1 : 0);
