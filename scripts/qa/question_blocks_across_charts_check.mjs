#!/usr/bin/env node
/* question_blocks_across_charts_check.mjs — `T-209`.
 *
 * THE SUBJECT. Wyatt's questions all live in ONE place — `.planning/CHART.md`'s
 * `## BLOCKED ON WYATT`, the section his Glass renders as *Your Call*. His WORK lives in two
 * lists, because he split them on 2026-09-02. `chartkeeper`'s `livePointer` read the BLOCKED ON
 * WYATT of **the one chart it was pointed at**, so a `GLASS-CHART.md` row parked with a question in
 * `CHART.md` was **not blocked by it**, and sat at rank 1.
 *
 * ⚠ WHO ACTUALLY GETS HANDED THAT ROW, corrected by CEO 166 after I wrote the wrong thing in four
 * files: **not the Door.** Its rank step takes no `--chart=` and so ranks `CHART.md`; the only
 * thing it points at the Glass chart is `tick_rows.mjs`, which reports and never orders. **The
 * Advisor ranks this list by hand, every time — that is the real path, and it is enough.**
 *
 * ⚑ MEASURED THE HOUR IT WAS FILED, on the live charts, not a fixture: `T-121` parked, its question
 * written naming ⟨`T-121`⟩ correctly, `--chart=GLASS-CHART.md --rank` → **0 rows moved**. Repaired
 * by hand with `· needs: wyatt`, which does not generalise: the next parked row needs the same
 * manual flag and nothing reminds anyone.
 *
 * ⚠ AND IT IS `T-132` IN A SECOND COSTUME — that row is *"a question that names no task leaves the
 * row it is holding up at the top"*; this is *a question that names its task perfectly and still
 * cannot reach it*. Same consequence, different cause.
 *
 * WHAT THIS GATE CANNOT DO: it cannot make his questions live in one file. It asserts that
 * WHEREVER a question is written, a row it names is blocked by it — and that the chart set is
 * DERIVED, so a third list tomorrow needs nobody to remember anything.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEEPER = join(ROOT, "scripts", "wyclau", "chartkeeper.mjs");
const fails = [];
const dir = mkdtempSync(join(tmpdir(), "cross-chart-"));

const BLOCKED = (rows) => `## BLOCKED ON WYATT\n\n| Question | Recommendation | since |\n|---|---|---|\n${rows}\n`;
const rowsFor = (ids) => ids.map((h) => `- [ ] **A row about ${h}.**\n      ⟨\`${h}\`⟩\n      body.\n`).join("");
const chart = (ids, blockedRows = "") =>
  `# CHART\n\n## STEP 1 CHECKLIST\n\n${rowsFor(ids)}\n${blockedRows ? BLOCKED(blockedRows) : ""}`;

const rankOf = (chartPath, id) => {
  let out = "";
  try {
    out = execFileSync(process.execPath, [KEEPER, `--chart=${chartPath}`, "--rank", "--json"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) { out = e.stdout ?? ""; }
  let j = null;
  try { j = JSON.parse(out); } catch { return { score: null, ran: false }; }
  const r = (j.rank ?? []).find((x) => x.id === id);
  return { score: r ? r.score : null, ran: Array.isArray(j.rank) && j.rank.length > 0 };
};

try {
  const A = join(dir, "GLASS-CHART.md");
  const B = join(dir, "CHART.md");
  const question = `| ⟨\`T-701\`⟩ **A question about T-701 — is this what you meant?** | Do the other one first. | 2026-09-03 |`;

  // 1 — THE QUESTION IS IN THE OTHER FILE. This is the whole item.
  {
    writeFileSync(A, chart(["T-701", "T-702"]));
    writeFileSync(B, chart(["T-800"], question));
    const withQ = rankOf(A, "T-701");
    if (!withQ.ran) fails.push("1: the ranker produced no rank array — this case measured nothing");
    else if (withQ.score === null) fails.push("1: T-701 is not in the rank at all");
    else if (withQ.score >= 0) {
      fails.push(`1: a question in the OTHER chart did not block the row it names (score ${withQ.score}) — a session would be sent to a row waiting on Wyatt`);
    }
  }

  // 2 — AND THE SAME ROW IS NOT BLOCKED WHEN THE QUESTION IS NOT THERE. Without this, case 1
  //     passes on a row that is penalised for some unrelated reason and proves nothing.
  {
    writeFileSync(A, chart(["T-701", "T-702"]));
    rmSync(B, { force: true });
    const noQ = rankOf(A, "T-701");
    if (noQ.score !== null && noQ.score < 0) {
      fails.push(`2: the row scores negative with NO question anywhere (${noQ.score}) — case 1 cannot tell a block from a coincidence`);
    }
  }

  // 3 — A QUESTION IN THE ROW'S OWN CHART STILL BLOCKS IT. The widening must ADD a source, never
  //     replace the one that already worked.
  {
    writeFileSync(A, chart(["T-701", "T-702"], question));
    rmSync(B, { force: true });
    const own = rankOf(A, "T-701");
    if (own.score === null || own.score >= 0) fails.push(`3: a question in the row's OWN chart stopped blocking it (score ${own.score}) — the widening replaced a working source instead of adding to it`);
  }

  // 4 — A LONE CHART MUST STILL RANK. Every gate that builds a fixture writes ONE chart in a temp
  //     dir with no sibling; a hardcoded second path that must exist would crash all of them.
  //     **That is the sixth-tool fault this row is about, and it would have been introduced BY the
  //     fix for it.**
  {
    const solo = mkdtempSync(join(tmpdir(), "cross-chart-solo-"));
    const only = join(solo, "CHART.md");
    writeFileSync(only, chart(["T-703"]));
    const r = rankOf(only, "T-703");
    if (!r.ran) fails.push("4: a chart with no sibling could not be ranked — a fixture in a temp dir now crashes the ranker");
    rmSync(solo, { recursive: true, force: true });
  }

  // 5 — THE CHART SET IS DERIVED, NOT A LIST SOMEBODY TYPED. A third list must be covered by
  //     nobody doing anything, which is this project's standing lesson about hand-kept lists
  //     (`CLAUDE.md` §6: "a hand-kept list of what to guard rots exactly like the thing it guards").
  {
    writeFileSync(A, chart(["T-704"]));
    writeFileSync(join(dir, "THIRD-CHART.md"), chart(["T-900"], `| ⟨\`T-704\`⟩ **A question in a chart nobody has heard of.** | — | 2026-09-03 |`));
    const r = rankOf(A, "T-704");
    if (r.score === null || r.score >= 0) {
      fails.push(`5: a question in a THIRD chart did not block the row it names (score ${r.score}) — the chart set is a typed list, so tomorrow's list needs somebody to remember it`);
    }
    rmSync(join(dir, "THIRD-CHART.md"), { force: true });
  }

  // 6 — THE ARCHIVE IS NOT A CHART. `CHART-LOG.md` holds every closed row; reading its questions
  //     would resurrect answered ones and block live work with them.
  {
    writeFileSync(A, chart(["T-705"]));
    writeFileSync(join(dir, "CHART-LOG.md"), chart(["T-901"], `| ⟨\`T-705\`⟩ **An ARCHIVED question.** | — | 2026-08-01 |`));
    const r = rankOf(A, "T-705");
    if (r.score !== null && r.score < 0) {
      fails.push(`6: a question in CHART-LOG.md blocked a live row (score ${r.score}) — the archive is being read as a chart, so every answered question blocks work again`);
    }
    rmSync(join(dir, "CHART-LOG.md"), { force: true });
  }

  /* 6b — THE ARCHIVE EXCLUSION MUST BE AN EXCLUSION, NOT AN INCLUSION THAT ONE FILENAME MISSES.
   * CEO 166: `/CHART\.md$/` admits ANY file ending that way, so `OLD-CHART.md` or
   * `2026-09-CHART.md` were read as live questions — **every answered question in an archived
   * chart blocking live work forever, silently.** Case 6 tested one literal filename and could not
   * see it. And dropping the `$` anchor survived every case: `CHART.md.bak` / `.orig` / `.rej` are
   * the exact leftovers a branch two sessions rebase on produces. */
  {
    for (const name of ["OLD-CHART.md", "ARCHIVE-CHART.md", "CHART.md.bak", "CHART.md.orig"]) {
      writeFileSync(A, chart(["T-706"]));
      writeFileSync(join(dir, name), chart(["T-902"], `| ⟨\`T-706\`⟩ **A question in ${name}.** | — | 2026-08-01 |`));
      const r = rankOf(A, "T-706");
      if (r.score !== null && r.score < 0) {
        fails.push(`6b: a question in ${name} blocked a live row (score ${r.score}) — an archived or leftover chart is being read as live questions`);
      }
      rmSync(join(dir, name), { force: true });
    }
  }

  // 7 — THE FIX IS IN THE FILE. A gate on behaviour alone goes green if somebody reverts to
  //     `parsed.blocked` and the fixtures happen not to exercise it that day.
  {
    const keeper = readFileSync(KEEPER, "utf8");
    if (!keeper.includes("siblingBlocked")) fails.push("7: chartkeeper.mjs no longer reads the other charts' questions — a parked row on one list is invisible to a question on the other");
    if (/blockedNaming:\s*\(id\)\s*=>\s*naming\(parsed\.blocked,/.test(keeper)) {
      fails.push("7: blockedNaming is back to reading only the chart it was pointed at");
    }
  }

  /* 8 — THE REPORTING HALF MUST MOVE WITH THE SCORING HALF, and this is the case whose absence let
   * `T-132`'s live instance survive inside `T-209`'s own fix.
   *
   * ⛔ CEO 166's central finding: the first version widened the SCORE (`blockedNaming`) and left
   * `unattachedQuestions` reading only the chart being ranked. So on the live `CHART.md` the tool
   * printed *"1 of your open question(s) name no task, so nobody can tell what they are holding
   * up: ⟨T-121⟩ …"* — **about a question that names its task perfectly**, in the same function, on
   * the same row, AFTER the fix. **Widening one half of a join and not the other is how a fault
   * survives its own repair.**
   *
   * ⚠ AND THE LESSON IS NOT "reshape the fixture" THIS TIME. CEO 166 ran the gate's OWN fixture
   * unchanged and it already exhibited the bug — `unattachedQuestions: ["⟨T-701⟩ …"]` — on an
   * object the gate parsed and then discarded. **Every case asserted on `score` and nothing else.
   * One assertion on a field already in hand would have caught it.** Assert on the whole output,
   * not only the number you set out to fix. */
  {
    const A2 = join(dir, "GLASS-CHART.md"), B2 = join(dir, "CHART.md");
    writeFileSync(A2, chart(["T-707"]));
    writeFileSync(B2, chart(["T-903"], `| ⟨\`T-707\`⟩ **A question naming a row in the OTHER chart.** | — | 2026-09-03 |`));
    let out = "";
    try {
      out = execFileSync(process.execPath, [KEEPER, `--chart=${B2}`, "--rank", "--json"],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) { out = e.stdout ?? ""; }
    let uq = null;
    try { uq = JSON.parse(out).unattachedQuestions ?? null; } catch { uq = null; }
    if (uq === null) fails.push("8: could not read unattachedQuestions — this case measured nothing");
    else if (uq.some((q) => String(q).includes("T-707"))) {
      fails.push(`8: a question naming a row in the OTHER chart is reported as naming NO task — the scoring half was widened and the reporting half was not (${uq.length} reported)`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (fails.length) {
  console.log(`FAIL — question_blocks_across_charts_check (${fails.length}):`);
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("PASS — question_blocks_across_charts_check: a question blocks the row it names wherever either is written, the chart set is derived, and the archive is not a chart.");
