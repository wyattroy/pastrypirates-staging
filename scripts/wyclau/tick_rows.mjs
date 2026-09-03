#!/usr/bin/env node
/* tick_rows.mjs — A ROW THAT CAN SAY WHEN IT IS FINISHED TICKS ITSELF.
 *
 *   node scripts/wyclau/tick_rows.mjs            # report: what would tick, what would not, coverage
 *   node scripts/wyclau/tick_rows.mjs --write    # tick the rows whose condition passes
 *
 * THE FAULT THIS ENDS. Measured 2026-09-02: **60 open rows, 0 ticked, and `--sweep` correctly
 * archiving nothing** — sweep moves rows already ticked, and the only thing that ticks is
 * `close_item.mjs`, behind a CEO verdict and solution-first evidence. Anything finished any other
 * way never ticks, so it never leaves his page. He said it plainly: *"THIS CHART IS A MESS."*
 *
 * AND IT COULD NOT BE CLEANED BY INFERENCE, which is why the fix is this and not a tidy-up. Two
 * attempts that night: rows whose cited INBOX entry is DONE → **0 of 60**; rows with a CEO verdict
 * naming their handle → **11, and unusable**, because several were PARTIAL verdicts on live work.
 * **There was no way to ask a row whether it was finished, because no row said what finished meant.**
 *
 * SO EVERY ROW MAY STATE THE CONDITION THAT ENDS IT:
 *
 *     done-when: node scripts/qa/no_ambiguous_handle_check.mjs
 *
 * This runner executes it. Exit 0 → the row is finished and gets ticked. Anything else → left alone
 * and reported. `chartkeeper.mjs --sweep` then archives the ticked rows. **Both halves already
 * existed; this is the missing middle.**
 *
 * WHY A COMMAND AND NOT A CHECKBOX. Today "is this done?" is a judgement, which needs a session to
 * make it and a human to trust it. A command makes it a MEASUREMENT — the row's own claim becomes
 * falsifiable, which is this project's method applied to its own list.
 *
 * ═══ THE FOUR WAYS THIS COULD GO WRONG, AND WHAT STOPS EACH ═══
 *
 * (a) A CONDITION THAT CANNOT FAIL TICKS A ROW THAT IS NOT DONE. The oldest trap here — five
 *     instruments lied in one night, and a field named `artifactVersion` held a clock. **So a
 *     condition must name a gate that contains a red-proof**; one that does not is REFUSED, loudly,
 *     and the row stays open. A gate that has never failed proves nothing.
 *
 * (b) ARBITRARY SHELL OUT OF A MARKDOWN FILE. `CHART.md` is written by three sessions and by a
 *     tool. **Only `node scripts/…` is permitted** — the exact shape `doc_command_check.js` already
 *     validates across every doc. Anything else is refused and named.
 *
 * (c) A WRONG TICK MUST BE REVERSIBLE. Every tick is reported with the command it ran, and the row
 *     keeps its handle forever, so a wrongly-archived row is found by `T-nnn` in `CHART-LOG.md` and
 *     in git and put back. Handles are never reused.
 *
 * (d) THE SILENT GAP. A row with no condition is never ticked — correct, and it must not be
 *     invisible. **Coverage is printed every run**, so "how many rows can say when they are
 *     finished" is a number rather than a silence.
 *
 * ⚠ AND WHAT THIS DELIBERATELY DOES NOT DO: it never ticks a row whose condition is `HIS SAY-SO`.
 * That is his ruling of 2026-09-02 3:33 PM, chosen against the marked recommendation — his approval
 * MARKS a row, and a watch closes it through the gate. This tool must not quietly overturn that.
 */
"use strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/* `--chart=<path>` — the same fault `close_item.mjs` carried, fixed in the same pass. After the
 * split he ordered, three quarters of the open rows live in `.planning/GLASS-CHART.md`, and a tool
 * that names one chart by path silently guards only its own quarter. CEO 134 listed five tools with
 * this fault; this is one of them. */
const CHART = (() => {
  const a = process.argv.find((x) => x.startsWith("--chart="));
  return a ? join(ROOT, a.slice(8)) : join(ROOT, ".planning", "CHART.md");
})();
const WRITE = process.argv.includes("--write");

const SAY_SO = /^HIS SAY-SO\b/i;
/* (b) — only a node invocation of a repo script. Nothing else runs, ever. */
const ALLOWED = /^node\s+scripts\/[A-Za-z0-9_\-/.]+\.(mjs|js|cjs)(\s+[-A-Za-z0-9_=.,/]*)*$/;

if (!existsSync(CHART)) { console.error("no .planning/CHART.md"); process.exit(2); }
const src = readFileSync(CHART, "utf8");

const starts = [...src.matchAll(/^- \[ \]/gm)].map((m) => m.index);
starts.push(src.length);
const rows = [];
for (let i = 0; i < starts.length - 1; i++) {
  const seg = src.slice(starts[i], starts[i + 1]);
  const cond = seg.match(/^\s*done-when:\s*(.+?)\s*$/m);
  rows.push({
    a: starts[i], b: starts[i + 1], seg,
    handle: (seg.match(/⟨`(T-\d+)`⟩/) || [])[1] || "?",
    title: seg.split("\n")[0].replace(/^- \[ \]\s*/, "").replace(/\*\*/g, "").slice(0, 66),
    cond: cond ? cond[1] : null,
  });
}

/* (a) — A CONDITION IS ONLY TRUSTED IF THE GATE IT NAMES CAN ACTUALLY FAIL.
 *
 * ⚠ THIS USED TO BE A WORD SEARCH FOR "red-proof", AND CEO 134 KILLED IT WITH A REAL FILE.
 * `scripts/qa/asset_display_size_probe.mjs` contains the phrase, has no `process.exit` anywhere,
 * and therefore exits 0 no matter what it finds. Under the old guard,
 * `done-when: node scripts/qa/asset_display_size_probe.mjs` would have been accepted as trustworthy
 * and ticked its row on EVERY run, forever. **A guard that reports "verified" on a gate that cannot
 * fail is worse than no guard**, because it launders the thing it was built to catch — which is the
 * project's oldest fault (rule 6: check that a check can FAIL before believing it passing) committed
 * by the very tool written to enforce it.
 *
 * SO THE GUARD NOW LOOKS FOR THE MECHANISM INSTEAD OF THE VOCABULARY: **a non-zero exit path**.
 * `process.exit(1)`, `process.exit(failed ? 1 : 0)`, `process.exitCode = 1` all qualify;
 * `process.exit(0)`, a bare `process.exit()`, and a file with no exit at all do not.
 *
 * ⚠ IT USED TO SAY "a REACHABLE exit", AND CEO 135 CALLED THAT OUT IN THE SAME BREATH AS PRAISING
 * THE PARAGRAPH BELOW: *"The honest sentence and the overclaiming sentence are in the same comment
 * block."* Right, and worth fixing rather than arguing: this is a regex over the file's text, so it
 * cannot see reachability at all — `if (false) process.exit(1)` sails straight through it. The word
 * promised a stronger check two lines above the paragraph that correctly disclaims it.
 *
 * WHAT THIS PROVES, STATED HONESTLY SO NOBODY OVERSELLS IT AGAIN: that the gate has a way to say
 * NO. It does NOT prove that path is reachable for the right reason — only a red-proof run against
 * a broken subject shows that, and no generic tool can perform one. **This is a floor, not a
 * ceiling.** It is placed here because the failure it removes is total (a gate that ticks rows
 * unconditionally) while the one it leaves is partial (a gate whose NO is wrongly aimed).
 *
 * AND IT FAILS SAFE: a legitimate gate that reports failure only by throwing is REFUSED, not
 * trusted. A refused row simply does not tick itself and waits for a person — the harmless
 * direction. */
function canActuallyFail(cmd) {
  const f = (cmd.match(/scripts\/[A-Za-z0-9_\-/.]+\.(?:mjs|js|cjs)/) || [])[0];
  if (!f) return false;
  const p = join(ROOT, f);
  if (!existsSync(p)) return false;
  const body = readFileSync(p, "utf8");
  for (const m of body.matchAll(/process\.exit(Code)?\s*(?:\(([^)]*)\)|=\s*([^;\n]+))/g)) {
    const arg = (m[2] ?? m[3] ?? "").trim();
    if (arg !== "" && arg !== "0") return true;   // something other than a guaranteed success
  }
  return false;
}

const ticked = [], held = [], refused = [], sayso = [], none = [];
for (const r of rows) {
  if (!r.cond) { none.push(r); continue; }
  if (SAY_SO.test(r.cond)) { sayso.push(r); continue; }
  if (!ALLOWED.test(r.cond)) { refused.push([r, "not a `node scripts/…` command — nothing else is ever run from the Chart"]); continue; }
  if (!canActuallyFail(r.cond)) { refused.push([r, "the gate it names has no non-zero exit — it cannot say NO, so its YES means nothing"]); continue; }
  let code = 1, out = "";
  try { out = execFileSync("node", r.cond.split(/\s+/).slice(1), { cwd: ROOT, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] }); code = 0; }
  catch (e) { code = e.status ?? 1; out = String(e.stdout || e.message || "").slice(-200); }
  (code === 0 ? ticked : held).push([r, code, out.trim().split("\n").slice(-1)[0] || ""]);
}

console.log(`tick_rows — a row that can say when it is finished ticks itself\n`);
console.log(`  ${rows.length} open row(s). ${rows.length - none.length} can say when they are finished; ${none.length} cannot.\n`);
if (ticked.length) {
  console.log(`  FINISHED — condition passed, ${WRITE ? "TICKED" : "would tick"}:`);
  for (const [r, , line] of ticked) console.log(`    ✓ ${r.handle}  ${r.title}\n        ran: ${r.cond}\n        → ${line}`);
}
if (held.length) {
  console.log(`\n  NOT FINISHED — condition ran and did not pass (this is the normal case):`);
  for (const [r, code] of held) console.log(`    · ${r.handle}  ${r.title}  (exit ${code})`);
}
if (sayso.length) {
  console.log(`\n  HIS SAY-SO — never ticked here; goes to Your Call, his tap queues a close (his ruling 3:33 PM):`);
  for (const r of sayso) console.log(`    ? ${r.handle}  ${r.title}`);
}
if (refused.length) {
  console.log(`\n  REFUSED — the condition is not trustworthy, so the row stays open:`);
  for (const [r, why] of refused) console.log(`    ⚠ ${r.handle}  ${r.title}\n        ${why}`);
}

if (WRITE && ticked.length) {
  let out = src;
  for (const [r] of [...ticked].reverse()) {
    out = out.slice(0, r.a) + r.seg.replace(/^- \[ \]/, "- [x]") + out.slice(r.b);
  }
  writeFileSync(CHART, out, "utf8");
  console.log(`\n  WROTE ${ticked.length} tick(s) to CHART.md.`);
  console.log(`  -> now archive them:  node scripts/wyclau/chartkeeper.mjs --sweep --write`);
  console.log(`  -> commit CHART.md AND CHART-LOG.md together; an archive that is not committed is a deleted row.`);
} else if (!WRITE) {
  console.log(`\n  (report only — nothing changed. Add --write to tick.)`);
}
process.exit(0);
