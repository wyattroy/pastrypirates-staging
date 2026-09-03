/* SCRATCH PROBE — does the handle pre-pass REORDER Wyatt's real Chart, or is it a no-op?
 * `T-130` parks that question as HIS call. It is only his call if the answer is "it reorders".
 * Runs against COPIES in tmp. Never writes .planning/. Delete when the item closes. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = join(tmpdir(), "ck-real");
mkdirSync(dir, { recursive: true });

for (const name of ["CHART", "GLASS-CHART"]) {
  const srcChart = join(".planning", `${name}.md`);
  const srcLog = join(".planning", "CHART-LOG.md");
  const p = join(dir, `${name}.md`);
  const lg = join(dir, `${name}-LOG.md`);
  copyFileSync(srcChart, p);
  if (existsSync(srcLog)) copyFileSync(srcLog, lg);

  const before = readFileSync(p, "utf8");
  const rowsOf = (t) => (t.match(/^- \[[ x]\][^\n]*/gm) || []).map((l) => l.slice(0, 60));

  const run = () =>
    execFileSync(process.execPath, ["scripts/wyclau/chartkeeper.mjs", `--chart=${p}`, `--log=${lg}`, "--rank", "--sweep", "--write"], { encoding: "utf8" });

  const out1 = run();
  const first = readFileSync(p, "utf8");
  run();
  const second = readFileSync(p, "utf8");

  const minted = /(\d+)\s+handle|ids?[^\n]*?(\d+)/i.exec(out1);
  console.log(`\n===== ${name}.md =====`);
  console.log("  wrote line:", (out1.match(/^WRITE[^\n]*/m) || out1.match(/^\s*wrote[^\n]*/mi) || ["(none)"])[0].trim());
  console.log("  idempotent (run1 === run2):", first === second);

  const b = rowsOf(before), f = rowsOf(first);
  const movedFromOriginal = b.length === f.length && b.every((x, i) => x === f[i]);
  console.log(`  first-pass row order identical to the file on disk today: ${movedFromOriginal}`);
  if (!movedFromOriginal) {
    console.log("  (the pass reorders — but RANK reorders by design; the question is whether run1 !== run2)");
  }
  // The only thing that makes this HIS call: a row with no handle, which the pre-pass would mint.
  const openNoHandle = [];
  const lines = before.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^- \[ \]/.test(lines[i])) continue;
    let has = false;
    for (let j = i + 1; j < lines.length && !/^- \[/.test(lines[j]) && !/^#/.test(lines[j]); j++)
      if (/⟨`T-\d{3}`⟩/.test(lines[j])) { has = true; break; }
    if (!has) openNoHandle.push(lines[i].slice(0, 70));
  }
  console.log(`  OPEN rows with NO handle (these are the only rows the pre-pass touches): ${openNoHandle.length}`);
  openNoHandle.slice(0, 6).forEach((l) => console.log("     •", l));
}
