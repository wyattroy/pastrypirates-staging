#!/usr/bin/env node
/* SCRATCH — watch 2026-09-03T01:10Z, T-103. NOT A GATE, not in npm test, safe to delete.
 *
 * THE ACCEPTANCE TEST, ON HIS REAL CHART — the one thing `do_now_check.mjs` structurally cannot do.
 * Every order case in that gate hands the command FOUR hand-picked clean handles; his page hands it
 * fifty-seven real ones, three of which were carried twice. CEO 131's sentence about that gate is
 * the reason this file exists: *"the check is honest and it is measuring a different thing than the
 * one that is broken."*
 *
 * It runs the whole chain against a COPY of `.planning/CHART.md` — never the real file:
 *   render his page  →  take the sequence his page would save after a drag
 *                    →  chartkeeper --order=<that sequence>
 *                    →  chartkeeper --rank --write
 *                    →  render again, and read the order back off the page.
 * A drag he makes is only real if the last step comes back in the sequence he dragged.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = mkdtempSync(join(tmpdir(), "t103rt-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

const chart = join(tmp, "CHART.md");
copyFileSync(join(ROOT, ".planning", "CHART.md"), chart);
const log = join(tmp, "CHART-LOG.md");
copyFileSync(join(ROOT, ".planning", "CHART-LOG.md"), log);

const render = (n) => {
  const out = join(tmp, `glass-${n}.html`);
  execFileSync(process.execPath, [join(ROOT, "scripts", "wyclau", "glass.mjs"),
    `--chart=${chart}`, `--out=${out}`], { cwd: ROOT, stdio: "ignore" });
  const card = readFileSync(out, "utf8").split(/<ol id="taskList">/)[1]?.split("</ol>")[0] ?? "";
  return [...card.matchAll(/data-handle="(T-\d{3})"/g)].map((m) => m[1]);
};
const keeper = (args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath,
      [join(ROOT, "scripts", "wyclau", "chartkeeper.mjs"), `--chart=${chart}`, `--log=${log}`, ...args],
      { cwd: ROOT, encoding: "utf8" }) };
  } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};

const before = render("before");
console.log(`his page offers ${before.length} draggable rows`);
const dup = before.filter((h, i) => before.indexOf(h) !== i);
console.log(`repeated handles in what the page would save: ${dup.length ? dup.join(", ") : "none"}`);

// His drag: take the fourth row and put it first — the same move the posed pair photographs.
const dragged = [before[3], ...before.filter((_, i) => i !== 3)];
const r1 = keeper([`--order=${dragged.join(",")}`]);
console.log(`\n--order= exit ${r1.code}`);
console.log(`  ${r1.out.trim().split("\n")[0] ?? ""}`);
if (r1.code !== 0) {
  console.log("\nHIS DRAG DID NOT REACH THE CHART. The page would have told him it was saved.");
  process.exit(1);
}
const r2 = keeper(["--rank", "--write"]);
if (r2.code !== 0) { console.log(`--rank --write exit ${r2.code}: ${r2.out.slice(0, 300)}`); process.exit(1); }

const after = render("after");
const wanted = dragged.slice(0, 8);
const got = after.slice(0, 8);
console.log(`\nhe dragged to : ${wanted.join(",")}`);
console.log(`his page reads: ${got.join(",")}`);
const ok = wanted.every((h, i) => got[i] === h);
console.log(`\n${ok ? "PASS — the page he next reads is in the order he dragged." : "FAIL — the page does not reflect his drag."}`);
process.exit(ok ? 0 : 1);
