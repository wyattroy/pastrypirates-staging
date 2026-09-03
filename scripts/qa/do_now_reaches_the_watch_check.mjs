#!/usr/bin/env node
/* do_now_reaches_the_watch_check.mjs — HIS DEFINITION OF "WORKS", MADE MECHANICAL.
 *
 * WYATT, 2026-09-02 10:30 PM ET, on the backlog page, about the DO NOW button:
 *
 *     "i see the DO NOW button -- does it work? Work = puts the task at the TOP of the list
 *      and gives it to the very next watch."
 *
 * **That is not a question, it is an acceptance test**, and it is the most useful sentence on that
 * page: it turns "does it work" from a judgement somebody makes into something a gate can run. This
 * file is that sentence, in code.
 *
 * HIS TWO HALVES, CHECKED SEPARATELY, BECAUSE THEY FAIL SEPARATELY:
 *
 *   HALF 1 — "puts the task at the TOP of the list". A pinned row must rank FIRST, against a real
 *            Chart, beating every other signal. Measured when this was written: a pinned row went
 *            from rank 46 / score -1000 to rank 1 / score 9,000,000. This gate re-proves it on a
 *            fixture every run, so a future scoring change cannot quietly demote his pin.
 *
 *   HALF 2 — "gives it to the very next watch". The Door must send a watch to row ONE. As of
 *            2026-09-02 it does (`SKILL.md` step 2, "RANK THE CHART, THEN TAKE ROW ONE"), replacing
 *            an oldest-first rule under which his pin would have reached the top of a list nobody
 *            read. **If that line ever reverts, his button silently stops working** — the pin still
 *            lands, and the watch still takes something else. This gate fails if it reverts.
 *
 * ⚠ AND THE HALF NO GATE CAN CHECK, NAMED RATHER THAN GLOSSED. Between his PRESS and the pin lies
 * one step performed by a session, not by code: the tick reads `"now": true` off the page and runs
 * the pin command (`GLASS-UPDATE-SESSION.md` step 2). **A tick that skips it leaves his press as an
 * idea nobody pinned.** Case 4 asserts the runbook still carries that instruction, which is the most
 * a file-reading gate can do; it cannot prove a session obeyed it. **That gap is the honest answer
 * to his question and it belongs in the reply to him, not buried here.**
 */
"use strict";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const ok = (m) => console.log(`  PASS -- ${m}`);
const bad = (m) => { console.log(`  FAIL -- ${m}`); failed++; };

const KEEPER = join(ROOT, "scripts", "wyclau", "chartkeeper.mjs");
const DOOR = join(ROOT, ".claude", "skills", "door", "SKILL.md");
const RUNBOOK = join(ROOT, ".planning", "wyclau", "GLASS-UPDATE-SESSION.md");

console.log("do_now_reaches_the_watch — his words: \"puts the task at the TOP of the list and gives it to the very next watch\"\n");

/* A fixture, not his live Chart: this must give the same answer on a quiet day and a busy one. The
   pinned row is deliberately LAST and deliberately the least deserving, so a pass cannot come from
   it having won on merit. */
const FIXTURE = `## STEP 1 CHECKLIST

- [ ] **A row that would rank first on its own** — his words, INBOX-20260101T0000Z, and mentioned often.
      ⟨\`T-801\`⟩
- [ ] **A middling row**
      ⟨\`T-802\`⟩
- [ ] **THE ROW HE PINNED — last in the file and lowest on merit**
      ⟨\`T-803\` · now: yes⟩
`;

let dir = null;
try {
  dir = mkdtempSync(join(tmpdir(), "donow-"));
  const chart = join(dir, "CHART.md");
  const log = join(dir, "CHART-LOG.md");
  writeFileSync(chart, FIXTURE, "utf8");
  writeFileSync(log, "# archive\n", "utf8");

  const rank = (p) => execFileSync("node", [KEEPER, `--chart=${p}`, `--log=${log}`, "--rank"],
    { cwd: ROOT, encoding: "utf8", timeout: 60000 });

  // 1. HALF 1 — the pinned row must come first.
  const out = rank(chart);
  const order = [...out.matchAll(/^\s+(\d+)\.\s+\[\s*(-?\d+)\]\s+(.*)$/gm)].map((m) => ({ n: +m[1], score: +m[2], t: m[3] }));
  if (!order.length) bad("could not read a ranked list out of chartkeeper — this gate cannot see its subject, which is not a pass");
  else if (/PINNED/i.test(order[0].t)) ok(`his pinned row ranks FIRST (score ${order[0].score}) even though it is last in the file and lowest on merit`);
  else bad(`his pinned row did NOT rank first — rank 1 is "${order[0].t.slice(0, 60)}". His press would put a row at the top of a list, and the watch would take a different one.`);

  // 2. RED-PROOF. Same fixture, pin removed: the pinned row must STOP winning, or case 1 proves nothing.
  const unpinned = join(dir, "CHART2.md");
  writeFileSync(unpinned, FIXTURE.replace("`T-803` · now: yes", "`T-803`"), "utf8");
  const out2 = rank(unpinned);
  const first2 = [...out2.matchAll(/^\s+1\.\s+\[\s*-?\d+\]\s+(.*)$/gm)][0];
  if (!first2) bad("red-proof: could not read rank 1 from the unpinned fixture");
  else if (/PINNED/i.test(first2[1])) bad("red-proof: the row still ranks first WITHOUT the pin, so case 1 was measuring something else");
  else ok(`red-proof: with the pin removed the same row stops winning (rank 1 becomes "${first2[1].slice(0, 40)}…") — case 1 is measuring the pin`);
} catch (e) {
  bad(`could not run the ranker against a fixture: ${String(e.message).slice(0, 120)}`);
} finally {
  if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// 3. HALF 2 — the Door must send the next watch to ROW ONE.
{
  const src = existsSync(DOOR) ? readFileSync(DOOR, "utf8") : "";
  const takesTop = /RANK THE CHART, THEN TAKE ROW ONE|work the FIRST open row/i.test(src);
  const oldestFirst = /INBOX first — the oldest OPEN item; his words outrank the Chart\. Otherwise\s*\n?\s*the top unblocked Chart item\./i.test(src);
  if (!takesTop) bad("the Door no longer sends a watch to the TOP of the Chart — his pin would reach the top of a list nobody reads, and the button silently stops working");
  else if (oldestFirst) bad("the Door has reverted to taking the OLDEST inbox item — the second half of his definition is broken");
  else ok("the Door sends the next watch to row ONE, so a pinned row is what the next watch takes");
}

// 4. THE STEP NO GATE CAN PROVE — assert the instruction still exists, and say plainly what that is worth.
{
  const src = existsSync(RUNBOOK) ? readFileSync(RUNBOOK, "utf8") : "";
  if (/`?"?now"?`?:\s*true/i.test(src) && /now: yes|--now/i.test(src))
    ok("the tick's runbook still tells a session to turn his `now: true` press into a pin — the one hop no gate can verify was performed");
  else
    bad("the runbook no longer tells the tick to turn his DO NOW press into a pin — the press would land on the page and reach the Chart never");
}

/* 5. THE SAME INSTRUCTION, IN THE FILE EVERY WATCH ACTUALLY READS.
   Case 4 asserts the Glass runbook still tells a session to turn his `now: true` press into a pin.
   That runbook is read by the Glass-update session; **the DOOR is read by every watch**, and until
   2026-09-03 its harvest step named the ideas and the rulings and not the pin. `T-104` was left open
   for exactly that omission. A one-line instruction that lives in only one of two files a session
   might enter through is an instruction that runs some of the time. */
{
  /* ⚠ SCOPED TO THE HARVEST BLOCK, BECAUSE THE FIRST VERSION CLAIMED A PLACE IT DID NOT CHECK.
     It read the WHOLE FILE for `--do-now=`. CEO 151 broke it in the way that mattered: it moved the
     line out of the harvest step into an "Appendix nobody reads" at the very end of SKILL.md, past
     both mode headings, and this case still reported *"the DOOR's harvest step also tells a
     watch..."* — **the assertion named a location it never looked at.** Its own message was the
     overclaim. Today the line is in the right place; the guard against it LEAVING that place was
     what was missing.
     The window is from the harvest heading to the mode fork, which is the text every session reads
     in both modes before it becomes a watch or the Advisor. */
  const src = existsSync(DOOR) ? readFileSync(DOOR, "utf8") : "";
  const from = src.indexOf("**Harvest the Glass");
  const to = src.indexOf("## THE WATCH");
  const harvest = from >= 0 && to > from ? src.slice(from, to) : "";
  if (!harvest)
    bad("could not find the Door's harvest block at all — it was renamed or removed, and this case cannot see its subject, which is not a pass");
  else if (/--do-now=/.test(harvest) && /now"?\s*:\s*true/i.test(harvest))
    ok("the DOOR's harvest step — the text every session reads before it forks — carries the pin, not just the Glass runbook");
  else
    bad("the Door's harvest step does not name `--do-now=` — a watch that enters here carries his idea across and drops his press");
}

console.log(failed
  ? `\nFAIL -- ${failed} check(s) failed. His DO NOW button does not meet his own definition.`
  : "\nAll checks passed. (Half 1 and half 2 are proven; the press-to-pin hop is a session step, not code.)");
process.exit(failed ? 1 : 0);
