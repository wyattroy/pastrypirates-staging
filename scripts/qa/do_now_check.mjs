#!/usr/bin/env node
/* do_now_check.mjs — HIS INTERRUPT MUST REACH THE TOP, AND ONLY ONE THING MAY BE THERE.
 *
 * WHY (Wyatt, on the Glass, 2026-09-02 3:09 PM ET): "Do Now: in the Glass, Add a \"DO now\" button
 * next to \"Send to the Chart\" button that tells RANK to put this task at the top". And the design
 * it belongs to, his own, from the question UI the same day: "i need a way to say DO THIS NOW such
 * that RANK puts it at the top -- eg a checkbox underneath the ideas list that says 'Add to top of
 * list'".
 *
 * THE FEATURE IS ITS OWN ACCEPTANCE TEST, and that is not a joke. He had to type "DO NOW" in prose
 * because the button did not exist — and the request for the button then sank to 31 of 39 on the
 * list. Had this shipped, it would not have needed rescuing by hand.
 *
 * WHAT THIS GATE HOLDS, and every case is behavioural — a fixture on disk, the real tools run
 * against it, and what they actually did read back:
 *   1. a pinned row ranks FIRST, even when every other signal is against it;
 *   2. pinning does not re-order anything else — his ask is "put THIS task at the top", not
 *      "re-rank my list";
 *   3. ONE SLOT: pinning a second row releases the first, mechanically, in one act;
 *   4. two pins arriving any other way FAIL THE BUILD, naming both;
 *   5. a pin on a handle that does not exist is REFUSED — an interrupt he cannot see is
 *      indistinguishable from one that was ignored, which is what happened to him all day;
 *   6. releasing the pin works, so a watch can take the row;
 *   7. the page carries the button beside "Send to the Chart", and an idea he pins is saved
 *      carrying its flag;
 *   8. and the pin is VISIBLE on his own Tasks card, so he can see the interrupt landed.
 *
 * THE JOINT THIS GATE EXISTS FOR IS 7→8. Between his tap and RANK sits a HUMAN harvest step, and
 * every chain in this project that has broken has broken at a human joint: the harvest that lost
 * his words, the runbook step a tick walked past, the gate aimed at the wrong tree. So the pin is
 * not carried by an instruction to a session — it is carried by ONE COMMAND that writes it, and
 * case 3 proves the command is the only thing that can produce a valid pin.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEEPER = join(ROOT, "scripts", "wyclau", "chartkeeper.mjs");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log("his DO NOW reaches the top of RANK, and only one thing is ever there\n");

const tmp = mkdtempSync(join(tmpdir(), "donow-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

const chartFile = (name, body) => {
  const p = join(tmp, `${name}.md`);
  writeFileSync(p, body);
  return p;
};
/* Every run is pinned to a THROWAWAY archive, for the reason chartkeeper_check.mjs paid to learn:
   a run without --log falls back to the real .planning/CHART-LOG.md and writes fixture rows into
   the tree it is measuring. */
const run = (args) => {
  const chartArg = args.find((a) => a.startsWith("--chart="))?.slice(8) ?? "default";
  const own = `${chartArg.split(/[\\/]/).pop().replace(/\.md$/, "")}-LOG.md`;
  const pinned = args.some((a) => a.startsWith("--log=")) ? args : [...args, `--log=${join(tmp, own)}`];
  try {
    return { code: 0, out: execFileSync(process.execPath, [KEEPER, ...pinned], { encoding: "utf8", cwd: ROOT }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const runJson = (args) => {
  const r = run([...args, "--json"]);
  try { return { ...r, json: JSON.parse(r.out) }; } catch { return { ...r, json: null }; }
};

/* ── THE FIXTURE. One row that RANK already loves and one it has no reason to care about, so
   "the pin won" cannot be confused with "it was going to win anyway". T-801 touches src/ (+30)
   and reads as player-facing; T-803 carries nothing at all. ── */
const FIXTURE = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **A ROW RANK ALREADY LOVES** — it changes \`src/ui/flow.js\`, where a player can see it,
      ⟨\`T-801\`⟩
      and it has been raised more than once.
- [ ] **AN ORDINARY MIDDLE ROW** with nothing much to recommend it either way.
      ⟨\`T-802\`⟩
- [ ] **THE ROW HE WANTS DONE NOW** — nothing about this row is urgent to anyone but him.
      ⟨\`T-803\`⟩
- [ ] **ANOTHER ORDINARY ROW** so the ordering below has something to be stable about.
      ⟨\`T-804\`⟩

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;

const rankTitles = (p, extra = []) => {
  const r = runJson([`--chart=${p}`, "--rank", ...extra]);
  return r.json && Array.isArray(r.json.rank) ? r.json.rank.map((x) => String(x.title || "")) : null;
};
const pinnedRows = (p) =>
  (readFileSync(p, "utf8").match(/^\s*⟨[^⟩]*\bnow\s*:\s*yes\b[^⟩]*⟩\s*$/gmi) || []).length;

/* ── 1. THE PIN WINS, AND IT WINS AGAINST A ROW THAT WAS ALREADY WINNING ────────────────────── */
{
  const p = chartFile("pin-wins", FIXTURE);
  const before = rankTitles(p);
  if (!before) fail("--rank --json produced no ordered list on the fixture");
  else if (!/RANK ALREADY LOVES/.test(before[0]))
    fail(`the fixture is not set up as intended — expected the player-facing row first, got "${before[0].slice(0, 50)}"`);
  else pass("before the pin, the row RANK already loves is first (the fixture is honest)");

  const r = run([`--chart=${p}`, `--do-now=T-803`]);
  if (r.code !== 0) fail(`--do-now=T-803 exited ${r.code}: ${r.out.trim().slice(0, 200)}`);
  const after = rankTitles(p);
  if (!after) fail("--rank --json produced no ordered list after the pin");
  else if (!/HE WANTS DONE NOW/.test(after[0]))
    fail(`he said DO NOW and the row is at position ${after.findIndex((t) => /HE WANTS DONE NOW/.test(t)) + 1}, not 1 — his interrupt does not reach the top, which is the whole of what he asked for`);
  else pass("the row he pinned ranks FIRST, over a row RANK was already putting above it");
}

/* ── 2. THE PIN MOVES ONE ROW, NOT THE LIST. "put THIS task at the top" ─────────────────────── */
{
  const p = chartFile("pin-stable", FIXTURE);
  const before = rankTitles(p);
  run([`--chart=${p}`, `--do-now=T-803`]);
  const after = rankTitles(p);
  if (!before || !after) fail("could not rank one of the two passes");
  else {
    const b = before.filter((t) => !/HE WANTS DONE NOW/.test(t));
    const a = after.filter((t) => !/HE WANTS DONE NOW/.test(t));
    if (JSON.stringify(a) !== JSON.stringify(b))
      fail(`pinning one row re-ordered the others — he asked to move ONE task, not to re-rank his list.\n        was: ${JSON.stringify(b)}\n        now: ${JSON.stringify(a)}`);
    else pass("every other row kept its relative order — the pin lifts one row and disturbs nothing");
  }
}

/* ── 3. ONE SLOT, NOT A QUEUE — his design says so, and it is enforced by the WRITE, not by a rule.
      "Ticking it on a second item must displace the first, deliberately. An interrupt with a queue
      is just another backlog, which is the fault this whole design removes." ─────────────────── */
{
  const p = chartFile("one-slot", FIXTURE);
  run([`--chart=${p}`, `--do-now=T-803`]);
  if (pinnedRows(p) !== 1) fail(`after one pin the Chart carries ${pinnedRows(p)} pinned rows, expected exactly 1`);
  else pass("one pin marks exactly one row");
  run([`--chart=${p}`, `--do-now=T-802`]);
  const n = pinnedRows(p);
  if (n !== 1) fail(`pinning a second row left ${n} pinned rows — an interrupt with a queue is just another backlog`);
  else {
    const titles = rankTitles(p);
    if (titles && /ORDINARY MIDDLE ROW/.test(titles[0])) pass("pinning a second row released the first, in the same act — one slot, mechanically");
    else fail(`the second pin did not take the top slot; got "${titles ? titles[0].slice(0, 50) : "no ranking"}"`);
  }
}

/* ── 4. TWO PINS ARRIVING ANY OTHER WAY FAIL THE BUILD. The command cannot produce this state, so
      a hand edit is the only way in — and a hand edit is exactly what the record keeps losing to. */
{
  const TWO = FIXTURE
    .replace("⟨`T-802`⟩", "⟨`T-802` · now: yes⟩")
    .replace("⟨`T-803`⟩", "⟨`T-803` · now: yes⟩");
  const p = chartFile("two-pins", TWO);
  const r = run([`--chart=${p}`, "--rank"]);
  if (r.code === 0) fail("two rows carry DO NOW and the tool said nothing — his one interrupt slot silently became a list");
  else if (!/T-802/.test(r.out) || !/T-803/.test(r.out))
    fail(`refused two pins but did not name both rows (${r.out.trim().slice(0, 160)}) — a complaint he cannot act on is not a complaint`);
  else pass("two pinned rows fail the build, naming both");
}

/* ── 5. A PIN THAT LANDS NOWHERE IS REFUSED, LOUDLY. "An interrupt he cannot see is
      indistinguishable from one that was ignored" — his own words' consequence, and the thing
      that made him repeat himself five times on 2026-09-02. ─────────────────────────────────── */
{
  const p = chartFile("no-such-row", FIXTURE);
  const r = run([`--chart=${p}`, `--do-now=T-999`]);
  if (r.code === 0) fail("pinned a handle that is on no row and reported success — his tap would vanish with nothing to show for it");
  else if (pinnedRows(p) !== 0) fail("refused, and marked something anyway");
  else pass("a pin on a handle that does not exist is refused, and marks nothing");
}

/* ── 6. THE WATCH CAN RELEASE IT. A slot that cannot be emptied fills up once and stops working. */
{
  const p = chartFile("release", FIXTURE);
  run([`--chart=${p}`, `--do-now=T-803`]);
  /* Guard against a vacuous green: if the pin never landed, "the release worked" is a sentence
     about nothing. Case 6 is only a test once case 3 is real. */
  if (pinnedRows(p) !== 1) fail("case 6 cannot run — nothing was pinned to release");
  const r = run([`--chart=${p}`, "--do-now-clear"]);
  if (r.code !== 0) fail(`--do-now-clear exited ${r.code}: ${r.out.trim().slice(0, 160)}`);
  else if (pinnedRows(p) !== 0) fail("--do-now-clear left the row pinned — the slot can never be reused");
  else {
    const titles = rankTitles(p);
    if (titles && /RANK ALREADY LOVES/.test(titles[0])) pass("releasing the pin restores the ordinary ranking");
    else fail("the ranking did not return to its unpinned order after the release");
  }
}

/* ── 7 & 8. THE BUTTON HE ASKED FOR, ON THE PAGE, BESIDE THE ONE HE ALREADY HAS — AND THE PIN
      VISIBLE ON HIS OWN TASKS CARD. The page is rendered from a FIXTURE Chart to a FIXTURE file:
      a gate that renders the real page stamps the heartbeat and consumes GLASS-NOTE.md, and this
      project has already lost a watch's note that way (INBOX-20260902T0350Z). ───────────────── */
{
  const p = chartFile("page", FIXTURE.replace("⟨`T-803`⟩", "⟨`T-803` · now: yes⟩"));
  const out = join(tmp, "glass-fixture.html");
  let page = "";
  try {
    execFileSync(process.execPath, [GLASS, `--chart=${p}`, `--out=${out}`], { encoding: "utf8", cwd: ROOT });
    page = readFileSync(out, "utf8");
  } catch (e) {
    fail(`glass.mjs could not render against a fixture Chart (${String(e.status ?? e.message).slice(0, 120)}) — so nothing about his page can be checked without touching the real one`);
  }
  if (page) {
    const sendAt = page.indexOf('id="ideaSend"');
    const nowAt = page.indexOf('id="ideaDoNow"');
    if (nowAt === -1) fail('no "DO NOW" button on the page — his ask was for a button "next to \'Send to the Chart\'"');
    else if (Math.abs(nowAt - sendAt) > 400) fail("the DO NOW button exists but is not next to Send to the Chart");
    else pass('the DO NOW button sits beside "Send to the Chart"');
    if (!/DO NOW/i.test(page)) fail("the button carries no label he would recognise as his own words");
    else pass("it is labelled in his own words");
    /* ⚠ THE WIRE, AND IT WAS THE HOLE CEO 121 PUT FIRST. Every other assertion here passed on a
       page whose button was connected to NOTHING: delete the one listener line and the id, the
       label, the flag and the tag are all still in the source. "The button would look like it
       worked and reach nothing" is this gate's own sentence about the danger, and it was the one
       thing the gate could not see. It must not merely be listened to — it must reach the SAME
       send path as the ordinary button, or his pin is a second implementation waiting to drift. */
    const wire = /doNow\.addEventListener\(\s*"click"[\s\S]{0,120}?\}\s*\)/.exec(page);
    const sendWire = /send\.addEventListener\(\s*"click"[\s\S]{0,120}?\}\s*\)/.exec(page);
    const called = (m) => (m ? (/\b([A-Za-z_$][\w$]*)\s*\(/g, [...m[0].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((x) => x[1]).filter((n) => n !== "addEventListener" && n !== "function")) : []);
    if (!wire) fail("the DO NOW button is drawn and nothing listens to it — a control he can press that reaches nothing is worse than no control");
    else if (!called(wire).length) fail("the DO NOW listener calls nothing");
    else if (!called(sendWire).some((n) => called(wire).includes(n)))
      fail(`the DO NOW button does not go through the same send path as "Send to the Chart" (${JSON.stringify(called(wire))} vs ${JSON.stringify(called(sendWire))}) — two ways for an idea to reach the page is two things that will drift`);
    else pass("the button is wired, and to the SAME send path as Send to the Chart — one way in, two doors");
    /* The page's own script must WRITE the flag onto the idea and READ it back when it repaints,
       or the button is decoration.
       ⚠ SAID PLAINLY: THESE TWO ARE SOURCE-SHAPE ASSERTIONS, NOT BEHAVIOUR. There is no DOM here,
       so this gate cannot press the button. What covers the behaviour is the browser screenshot the
       watch takes of this same rendered page — and if that screenshot was not taken, this pair is
       the weakest thing in the file and should be read as such. */
    if (!/\bnow\s*=\s*true\b/.test(page)) fail("the page never writes a pin flag onto the idea it saves — the button would look like it worked and reach nothing");
    else pass("a pinned idea is saved carrying its flag, so the harvest can see it");
    /* ⚠ THIS ASSERTION WAS `\bi\.now\b` FOR ABOUT A MINUTE AND IT COULD NOT FAIL. `releasePins`
       contains `i.now` too, so deleting the entire pinned-idea rendering left it green — caught by
       red-proofing it, not by reading it. It now keys on the tag that rendering exists to produce. */
    if (!/className\s*=\s*"pinTag"/.test(page)) fail("nothing on the page renders the flag back, so a pinned idea would look identical to an ordinary one until a session harvested it");
    else pass("the page paints a pinned idea as pinned, immediately, before any session has seen it");
    /* And ONE SLOT on the page too: a second pin must release the first before it is published. */
    if (!/releasePins/.test(page)) fail("nothing on the page releases a previous pin — he could pin three ideas and the page would show three interrupts");
    else pass("pinning on the page releases any previous pin, before it is ever saved");
    /* ⚠ SCOPED TO THE LIST ITSELF, NOT THE CARD — and it was scoped to the card until the drag
       landed, at which point an HTML COMMENT quoting his words ("DO NOW: build a way for me to
       drag…") became the first match in the card and this case failed against a page that was
       drawing the pin perfectly. A check that a comment can fool is a check about the source text
       and not about what he sees. The rows are what he sees. */
    const tasksCard = page.split(/<ol id="taskList">/)[1]?.split("</ol>")[0] ?? "";
    if (!tasksCard) fail("could not find the Tasks list in the rendered page");
    else if (!/DO NOW/i.test(tasksCard))
      fail("a row carrying his pin is not marked on his Tasks card — an interrupt he cannot see is indistinguishable from one that was ignored");
    /* Case-INSENSITIVE, and that is not laziness: the page de-shouts a row's title on purpose
       (his ask, "the Glass is SHOUTING at me"), so this row reaches him as "The row he wants done
       now". A case-sensitive assertion here would fail on the page working correctly. */
    else if (!/he wants done now/i.test(tasksCard.split(/DO NOW/i)[1]?.slice(0, 200) ?? ""))
      fail("the Tasks card marks something as DO NOW, but not the row that carries the pin");
    else pass("the pinned row is marked DO NOW on his own Tasks card");
  }
}

/* ── 9. THE JOINT. Between his tap and RANK sits a session reading the page by hand, and that is
      the one step no code can take for it. CEO 121: "a session harvests his pinned idea, sees the
      DO NOW tag on the page, writes a row — and unless it happens to have read this commit, never
      runs `--do-now=`, and RANK never learns." A capability nothing invokes is a capability that
      never runs; this project has the sentence written down twice already.
      So the instruction is not left to be remembered: the build fails if the harvest step stops
      naming the command. ⚠ IT IS STILL AN INSTRUCTION — this proves the SENTENCE is there, not
      that a session typed it. That is the honest ceiling of a human joint, and naming the ceiling
      is better than pretending it is closed. ───────────────────────────────────────────────── */
{
  const RUNBOOK = join(ROOT, ".planning", "wyclau", "GLASS-UPDATE-SESSION.md");
  let book = "";
  try { book = readFileSync(RUNBOOK, "utf8"); } catch { fail(`could not read ${RUNBOOK} — the harvest instruction lives there`); }
  if (book) {
    const harvest = book.split(/HARVEST FIRST/)[1]?.slice(0, 2500) ?? "";
    if (!harvest) fail("the runbook has no HARVEST FIRST step any more — this check is pointed at the wrong place and should be repaired, not deleted");
    else if (!/--do-now=/.test(harvest))
      fail("the harvest step does not tell the session to run chartkeeper --do-now= — so his pin reaches the Chart as prose and RANK never learns of it");
    else if (!/"now"\s*:\s*true|`now`|now.*true/i.test(harvest))
      fail("the harvest step names the command but not the flag that triggers it — a session cannot tell which idea he pinned");
    else pass("the harvest step names both the flag it must look for and the command that carries it");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   HIS OTHER HALF — "DRAG TO REPRIORITIZE". Cases 10-16.

   Wyatt wrote TWO notes in one breath on 2026-09-02 at 3:09 PM ET. The button above is one of
   them; this is the other: "DO NOW: build a way for me to drag to reprioritize the chart, in The
   Glass."

   ⚠ WHY THEY SHARE A GATE AND NOT A CONCEPT. They are both "his own say-so, written onto a row,
   obeyed by RANK" — the same joint, the same failure mode, and a second gate would be a second
   place to keep the same reasoning. But they are NOT the same feature and the cases below prove
   they cannot be collapsed: the pin is ONE SLOT (case 3), an order is a SEQUENCE (case 11), and
   the pin still outranks the order (case 13). Serving both from one boolean would turn his
   interrupt into the queue his own constraint forbids.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const orderedRows = (p) =>
  (readFileSync(p, "utf8").match(/^\s*⟨[^⟩]*\border\s*:\s*\d+[^⟩]*⟩\s*$/gmi) || []).length;

/* ── 10. THE ORDER HE DRAGS IS THE ORDER RANK WORKS. Every derived signal is a guess; this is him
      saying it, so it must beat all of them — including the row RANK already loves. ──────────── */
{
  const p = chartFile("order-wins", FIXTURE);
  const before = rankTitles(p);
  if (!before || !/RANK ALREADY LOVES/.test(before[0]))
    fail("the fixture is not set up as intended for the order cases");
  const r = run([`--chart=${p}`, "--order=T-803,T-804,T-802,T-801"]);
  if (r.code !== 0) fail(`--order exited ${r.code}: ${r.out.trim().slice(0, 200)}`);
  const after = rankTitles(p);
  if (!after) fail("--rank --json produced no ordered list after the drag");
  else {
    const want = ["HE WANTS DONE NOW", "ANOTHER ORDINARY ROW", "ORDINARY MIDDLE ROW", "RANK ALREADY LOVES"];
    const got = after.slice(0, 4);
    const ok = want.every((w, i) => new RegExp(w, "i").test(got[i] ?? ""));
    if (!ok) fail(`the list is not in the order he dragged.\n        he asked for: ${JSON.stringify(want)}\n        RANK gave:    ${JSON.stringify(got.map((t) => t.slice(0, 34)))}`);
    else pass("RANK works the list in the exact sequence he dragged, over its own derived order");
  }
}

/* ── 11. AN ORDER IS A SEQUENCE, AND IT IS REPLACED WHOLE. A second drag must not be merged into
      the first: two orders half-applied is a list that is his in places and ours in the rest, with
      nothing on the page saying which. ───────────────────────────────────────────────────────── */
{
  const p = chartFile("order-replaced", FIXTURE);
  run([`--chart=${p}`, "--order=T-803,T-804,T-802,T-801"]);
  if (orderedRows(p) !== 4) fail(`after one drag ${orderedRows(p)} rows carry an order, expected 4`);
  else pass("a drag writes his sequence onto exactly the rows he moved");
  run([`--chart=${p}`, "--order=T-802,T-801"]);
  if (orderedRows(p) !== 2)
    fail(`a second drag left ${orderedRows(p)} ordered rows — the previous order was merged into it rather than replaced, so part of the list is his and part is stale`);
  else {
    const titles = rankTitles(p);
    if (titles && /ORDINARY MIDDLE ROW/.test(titles[0]) && /RANK ALREADY LOVES/.test(titles[1] ?? ""))
      pass("a second drag replaces the first whole — one order, never merged");
    else fail(`the second drag did not take effect; got ${JSON.stringify((titles || []).slice(0, 2).map((t) => t.slice(0, 34)))}`);
  }
}

/* ── 12. HE CAN PUT IT BACK. An order that cannot be cleared is a list that can never return to the
      ranking the tool derives, and RANK is the thing he asked for in the first place. ────────── */
{
  const p = chartFile("order-clear", FIXTURE);
  run([`--chart=${p}`, "--order=T-803,T-804"]);
  if (orderedRows(p) !== 2) fail("case 12 cannot run — nothing was ordered to clear");
  const r = run([`--chart=${p}`, "--order-clear"]);
  if (r.code !== 0) fail(`--order-clear exited ${r.code}: ${r.out.trim().slice(0, 160)}`);
  else if (orderedRows(p) !== 0) fail("--order-clear left rows ordered — his list could never go back to the derived ranking");
  else {
    const titles = rankTitles(p);
    if (titles && /RANK ALREADY LOVES/.test(titles[0])) pass("clearing the order restores the derived ranking");
    else fail("the ranking did not return to its underived order after the clear");
  }
}

/* ── 13. HIS PIN STILL OUTRANKS HIS ORDER, and this is the case that proves the two features were
      not collapsed. A pin is a later, sharper act than an ordering — he can always drag again.
      ⚠ THE MARGIN IS A JUDGEMENT AND HIS TO OVERRULE; it is written down as such in
      PREDICTION-20260903T0110Z-T103.md and in score()'s own comment. This case exists so that if
      he ever rules the other way, changing it is one deliberate edit and not a silent drift. ── */
{
  const p = chartFile("pin-beats-order", FIXTURE);
  run([`--chart=${p}`, "--order=T-803,T-804,T-802,T-801"]);
  run([`--chart=${p}`, "--do-now=T-801"]);
  const titles = rankTitles(p);
  if (!titles) fail("could not rank with both a pin and an order in play");
  else if (!/RANK ALREADY LOVES/.test(titles[0]))
    fail(`he pinned T-801 and it is not first — the pin lost to an order he made earlier, so his most recent word is not the one obeyed`);
  else if (!/HE WANTS DONE NOW/.test(titles[1] ?? ""))
    fail("the pin won but the rest of his dragged order was lost underneath it");
  else pass("the pin sits above his dragged order, and the order survives underneath it");
}

/* ── 14. A DRAG THAT LANDS NOWHERE IS REFUSED AND NOTHING IS WRITTEN — including the handles that
      WOULD have resolved. A partly-applied order is the worst of the three outcomes. ─────────── */
{
  const p = chartFile("order-nowhere", FIXTURE);
  const r = run([`--chart=${p}`, "--order=T-803,T-999"]);
  if (r.code === 0) fail("ordered a handle that is on no row and reported success");
  else if (orderedRows(p) !== 0) fail("refused the drag and wrote part of it anyway — his list would be half his and half ours, with nothing saying which");
  else pass("a drag naming a row that does not exist is refused, and writes nothing at all");
}

/* ── 15. AND THE AMBIGUITY THIS CHART CAN ACTUALLY PRODUCE TODAY: one handle on two open rows.
      --rank already warns about it; a drag must REFUSE, because silently moving one of two rows
      nobody can tell apart is the mis-attribution that fault causes. ─────────────────────────── */
{
  const TWIN = FIXTURE.replace("⟨`T-804`⟩", "⟨`T-803`⟩");
  const p = chartFile("order-ambiguous", TWIN);
  const r = run([`--chart=${p}`, "--order=T-803,T-802"]);
  if (r.code === 0) fail("two open rows carry T-803 and the drag applied anyway — one of them moved and nothing says which");
  else if (!/T-803/.test(r.out)) fail("refused an ambiguous drag without naming the handle");
  else if (orderedRows(p) !== 0) fail("refused, and ordered something anyway");
  else pass("a drag naming a handle carried by two open rows is refused, and names it");
}

/* ── 16. THE PAGE. Every task he can drag must carry its handle, the list must be wired with
      POINTER events (mouse and touch are one path — dragstart never fires on the phone he reads
      this on), and the sequence must be what is saved. ⚠ SOURCE-SHAPE ASSERTIONS, said plainly:
      there is no DOM here, so this gate cannot drag anything. What covers the gesture is the
      browser screenshot the watch takes of this same rendered page. ─────────────────────────── */
{
  const p = chartFile("order-page", FIXTURE);
  const out = join(tmp, "glass-order.html");
  let page = "";
  try {
    execFileSync(process.execPath, [GLASS, `--chart=${p}`, `--out=${out}`], { encoding: "utf8", cwd: ROOT });
    page = readFileSync(out, "utf8");
  } catch (e) {
    fail(`glass.mjs could not render against a fixture Chart (${String(e.status ?? e.message).slice(0, 120)})`);
  }
  if (page) {
    const card = page.split(/<h2>The Chart \(Tasks To Do\)/)[1]?.split("</section>")[0] ?? "";
    const handles = [...card.matchAll(/data-handle="(T-\d{3})"/g)].map((m) => m[1]);
    if (handles.length !== 4)
      fail(`the Tasks card carries ${handles.length} draggable rows, expected 4 — a task with no handle is a task a drop cannot name, which is why this could not be built before`);
    else pass("every open task on his card carries its handle, so a drop can say which row moved");
    if (!/id="taskList"/.test(card)) fail("the task list has no id — the page's own script would have to find it by tag or position, which resolves to the artifact HOST's markup");
    else pass("the task list is addressed by id, never by position");
    /* ⛔ TWO CASES USED TO SIT HERE DEMANDING THE DRAG HE DELETED, and CEO 182 caught both — a
     * hundred lines above the sibling case that was re-pointed on the same day, which is exactly how
     * a re-point misses half its own subject.
     *
     * **The worse half is HOW they were passing.** They grepped the whole rendered page for the bare
     * word `pointermove`, and the five hits left in it are all PROSE: three code comments, and two
     * from the Chart note ANNOUNCING the deletion ("DRAG REMOVED: 62 lines of pointerdown/
     * pointermove/drop…"). So a build gate's verdict was being produced by the obituary of the thing
     * it was checking for — and edit that note and the suite goes red claiming the drag is broken on
     * iOS. Rule 6, in a gate: a comment is not a measurement.
     *
     * ⚑ WHAT REPLACES THEM IS THE PROPERTY HE ACTUALLY ASKED FOR — every row is moveable — asserted
     * against the RUNNABLE SCRIPT, never the page's prose. The gesture case lives at case 16d below;
     * this one is about the button existing on every row the card draws. */
    /* ⛔ COUNT EVERY `<li>` THE LIST DRAWS, NOT THE TAGGED ONES. The first version of this case
     * counted rows carrying `data-handle` against buttons — and `glass.mjs:1395-1400` gates BOTH on
     * the same `t.handle` ternary, so an untagged row subtracts one from each side and the case
     * passes while the card visibly strands a row. CEO 186 built that fixture: 4 tagged + 1
     * untagged rendered `rows=4, arrows=4 → PASS`, printing *"every row on his card carries the ▲
     * top button"* while the list drew five and one could not be moved at all.
     * **Two numbers from one source are one number wearing a disguise** — the same shape as the
     * reaper gate two hours earlier, in a different file, on the same day.
     * The list itself is the only honest denominator. */
    const list = card.split(/id="taskList"/)[1]?.split("</ol>")[0] ?? "";
    const rows = [...list.matchAll(/<li\b/g)].length;
    const arrows = [...list.matchAll(/class="totop"/g)].length;
    if (!list) fail("the rendered page has no taskList to count — this case cannot see its subject, so it must not report PASS");
    else if (!rows) fail("the Tasks card draws no rows at all, so nothing can be said about whether they are moveable");
    else if (arrows !== rows)
      fail(`the list draws ${rows} row(s) and offers ${arrows} ▲ top button(s) — every row must be moveable, his instruction 2026-09-03. A row without the arrow cannot be moved by any means now the drag is gone, and it is the NEW rows that arrive without one.`);
    else pass(`every row the list draws carries the ▲ top button — ${arrows} of ${rows}, counted against the list and not against the tagged subset`);
    if (!/state\.order\s*=/.test(page))
      fail("the page never records an order onto its state — he could drag all day and nothing would leave the tab");
    else pass("the sequence he drags is written onto the page's own state");
    if (!/"order"\s*:\s*null/.test(page))
      fail("the generated state does not start with an empty order — a republish would carry a stale order forward as though he had just made it");
    else pass("every generation starts with no order, the same harvest contract as ideas and rulings");
    /* The handles, not the row text: text is de-shouted and truncated for him and changes whenever
       anyone edits the Chart, so an order saved by text could not be applied a day later. */
    if (!/getAttribute\("data-handle"\)/.test(page))
      fail("the saved order does not read the handles — an order recorded by row text cannot be applied once the Chart is edited");
    else pass("the order is saved as handles, which is the thing the Chartkeeper can act on");
    if (!/cap\.publish/.test(page.split(/function saveOrder/)[1]?.slice(0, 900) ?? ""))
      fail("the order is put on the state and never published — it would live only in his tab until he closed it");
    else pass("saving an order publishes it, the same way a ruling is saved");
  }
}

/* ── 16b. THE THREE FAULTS CEO 131 MEASURED, EACH WITH ITS OWN CASE. Every one of them passed the
      cases above and made the feature useless on his REAL Chart — which is the whole lesson: the
      order cases hand the command four clean handles, and his page hands it fifty-seven dirty ones.
      *"The check is honest and it is measuring a different thing than the one that is broken."* ── */
{
  /* His live Chart carries three handles twice over (`T-107`). A page that lets him drag such a row
     produces a sequence the command REFUSES WHOLE — so every drag he made died at the command
     while the page told him it was saved. The refusal is right; offering the gesture was not. */
  const TWIN = FIXTURE.replace("⟨`T-804`⟩", "⟨`T-803`⟩");
  const p = chartFile("page-ambiguous", TWIN);
  const out = join(tmp, "glass-ambiguous.html");
  let page = "";
  try {
    execFileSync(process.execPath, [GLASS, `--chart=${p}`, `--out=${out}`], { encoding: "utf8", cwd: ROOT });
    page = readFileSync(out, "utf8");
  } catch (e) { fail(`glass.mjs could not render the ambiguous fixture (${String(e.status ?? e.message).slice(0, 120)})`); }
  if (page) {
    const card = page.split(/<ol id="taskList">/)[1]?.split("</ol>")[0] ?? "";
    const handles = [...card.matchAll(/data-handle="(T-\d{3})"/g)].map((m) => m[1]);
    if (handles.includes("T-803"))
      fail("a handle carried by TWO open rows is still draggable — the command refuses such a sequence whole, so every drag he makes would die there while the page says it saved");
    else if (handles.length !== 2)
      fail(`the ambiguous rows were dropped rather than made undraggable — ${handles.length} draggable rows, expected the 2 unambiguous ones`);
    else pass("a row whose handle names two rows is shown and cannot be dragged, so the sequence he saves is always one the command can apply");
    /* And the guard must be DERIVED, not a list: the same render with no twin must offer all four. */
    const clean = join(tmp, "glass-clean.html");
    execFileSync(process.execPath, [GLASS, `--chart=${chartFile("page-clean", FIXTURE)}`, `--out=${clean}`], { encoding: "utf8", cwd: ROOT });
    const cleanCard = readFileSync(clean, "utf8").split(/<ol id="taskList">/)[1]?.split("</ol>")[0] ?? "";
    if ([...cleanCard.matchAll(/data-handle="/g)].length !== 4)
      fail("the ambiguity guard is over-firing on a clean Chart — it must be derived from the rows, and correct itself the moment the duplicate handles are repaired");
    else pass("the guard is derived: a Chart with no duplicate handle offers every row");
  }
}
{
  /* A page rebuilt from the template plus the state showed the OLD order with a line underneath
     swearing his order was saved. Reload and his list snapped back. The rows must be put in his
     saved order on load, or the page lies to him about the one thing he did. */
  const p = chartFile("page-reapply", FIXTURE);
  const out = join(tmp, "glass-reapply.html");
  let page = "";
  try {
    execFileSync(process.execPath, [GLASS, `--chart=${p}`, `--out=${out}`], { encoding: "utf8", cwd: ROOT });
    page = readFileSync(out, "utf8");
  } catch { /* reported by the case above */ }
  if (page) {
    const init = page.split(/var taskList = document.getElementById\("taskList"\)/)[1] ?? "";
    /* ⚠ THESE TWO ARE SOURCE SEARCHES AND CEO 132 IS RIGHT THAT THEY READ STRONGER THAN THEY ARE.
       Gut the body of `applySaved` and both still pass, because NOTHING IN THIS PROJECT EXECUTES
       THE GLASS PAGE'S JAVASCRIPT — no browser gate, no jsdom, no vm — and the posed pair cannot
       cover it either: with no saved order in the page's state, `applySaved` returns on its first
       line, which is why both "after" screenshots read "This view can't save an order". So the one
       fix CEO 131 called the worst is, today, backed by a grep and a hand trace. Filed as its own
       Chart row rather than described away. The wording below says what is actually being proved. */
    if (!/applySaved\s*\(\s*\)\s*;/.test(init))
      fail("a saved order is never put back on the rows when the page loads — what is published is the template plus the state, so his list snaps back to the Chart's file order while the note under it still reads 'Your order is saved'");
    else pass("the page CALLS a re-apply of his saved order on load (source search — this gate cannot run it)");
    if (!/insertBefore\(\s*mark\s*,/.test(init))
      fail("the re-apply inserts before a row rather than a marker — the first row is usually in the saved order too, and inserting a node before itself silently reverses everything after it");
    else pass("the re-apply inserts before a marker, so a row already first cannot invert the rest (source search)");
  }
  /* The confirmation must sit where he can see it after a drag near the top of a long list. */
  if (page) {
    const card = page.split(/<h2>The Chart \(Tasks To Do\)/)[1]?.split("</section>")[0] ?? "";
    if (card.indexOf('id="orderNote"') > card.indexOf('id="taskList"'))
      fail("the order confirmation is below the list — on a phone showing eight of fifty-seven rows, a drag near the top puts its own confirmation fifty rows out of sight");
    else pass("the confirmation sits above the list, where a drag at the top can still be seen to have landed");
  }
  /* ⛔ THIS CASE ENFORCED A FEATURE HE REMOVED, and it went red the moment his instruction landed.
   *
   * It required `window.scrollBy` — the drag's edge-scrolling — because *"on a phone he cannot move
   * row 30 to row 1 at all"*. That problem is real and it is exactly why he killed the gesture:
   * Wyatt, 2026-09-03, *"you can remove the dragging feature from the Chart -- it was really buggy
   * and didn't work as intended. we'll just use the arrows."*
   *
   * ⚑ SO THE ASSERTION MOVES TO THE PROPERTY, NOT THE MECHANISM — the third time today a gate has
   * had to be re-pointed this way. **The property he wanted was never "the list edge-scrolls"; it
   * was "I can move row 30 to row 1 on my phone."** One tap on ▲ top does that in one action with
   * no scrolling at all, which is a better answer to the same requirement. What must hold now is
   * that the arrow exists on EVERY row and commits through the one save path. */
  if (page && /addEventListener\("pointermove"/.test(page))
    fail("the drag is back — he removed it on 2026-09-03 as 'really buggy and didn't work as intended', and two gestures writing one order is the drift rule 23 is about");
  else if (page && !/function moveToTop/.test(page))
    fail("there is no move-to-top handler on his page, so no row can be moved at all — the arrows are the ONLY way to reorder since the drag was removed");
  else if (page && !/class="totop"/.test(page))
    fail("no row carries a ▲ top button — his list cannot be reordered by any means");
  else if (page) pass("the drag is gone and every move goes through the arrow, which reaches row 30 in ONE tap rather than a scroll he could not perform");
}

/* ── 17. THE JOINT AGAIN. Same reasoning as case 9, for the same reason: between his drag and RANK
      sits a session reading the page by hand. A capability nothing invokes is a capability that
      never runs — the sentence this project has now written down three times. ─────────────────── */
{
  const RUNBOOK = join(ROOT, ".planning", "wyclau", "GLASS-UPDATE-SESSION.md");
  let book = "";
  try { book = readFileSync(RUNBOOK, "utf8"); } catch { fail(`could not read ${RUNBOOK}`); }
  if (book) {
    const harvest = book.split(/HARVEST FIRST/)[1]?.slice(0, 2500) ?? "";
    if (!harvest) fail("the runbook has no HARVEST FIRST step any more — this check is pointed at the wrong place");
    else if (!/--order=/.test(harvest))
      fail("the harvest step does not tell the session to run chartkeeper --order= — so his drag reaches the Chart as nothing at all and RANK never learns of it");
    else if (!/\border\b/.test(harvest))
      fail("the harvest step names the command but not the state field it must look for");
    else pass("the harvest step names the order field and the command that carries it");
    /* AND THE SECOND COMMAND, which CEO 131 measured as the difference between his order landing
       and his page not moving: --order= writes numbers onto rows and stops, and the Glass draws its
       Tasks card in the rows' FILE order. Without a re-rank he reads the old list. */
    if (harvest && !/--rank\s+--write/.test(harvest))
      fail("the harvest step applies his order and never re-ranks — the Glass draws tasks in the rows' file order, so his page regenerates unchanged and he is right to think nothing happened");
    else if (harvest) pass("the harvest step re-ranks in the same act, so the page he next reads is in the order he dragged");
  }
}

console.log(failures ? `\nFAIL (${failures})` : "\nPASS");
process.exit(failures ? 1 : 0);
