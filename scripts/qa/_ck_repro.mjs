/* SCRATCH PROBE — reproduce chartkeeper_check case 10f's non-idempotence and print the DIFF.
 * Not a gate. Delete when the item closes. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = readFileSync("scripts/qa/chartkeeper_check.mjs", "utf8");
const m = src.match(/^const BUNDLED = `([\s\S]*?)^`;/m);
const BUNDLED = m[1].replace(/\\`/g, "`");

const dir = join(tmpdir(), "ck-repro");
mkdirSync(dir, { recursive: true });
const p = join(dir, "chart.md");
writeFileSync(p, BUNDLED);

// The GATE pins a throwaway archive per chart. Letting it default to the real .planning/CHART-LOG.md
// changes where ids start, which is exactly the variable under suspicion — so mirror the gate.
const logPath = join(dir, "chart-LOG.md");
const run = () =>
  execFileSync(
    process.execPath,
    ["scripts/wyclau/chartkeeper.mjs", `--chart=${p}`, "--write", `--log=${logPath}`],
    { encoding: "utf8" },
  );

run();
const first = readFileSync(p, "utf8");
run();
const second = readFileSync(p, "utf8");
run();
const third = readFileSync(p, "utf8");

console.log("run1 === run2 :", first === second);
console.log("run2 === run3 :", second === third);

if (first !== second) {
  const a = first.split("\n"), b = second.split("\n");
  console.log("\n--- lines only in run1 ---");
  a.filter((l) => !b.includes(l)).forEach((l) => console.log("  -", JSON.stringify(l)));
  console.log("--- lines only in run2 ---");
  b.filter((l) => !a.includes(l)).forEach((l) => console.log("  +", JSON.stringify(l)));

  const rowsOf = (t) => (t.match(/^- \[[ x]\][^\n]*/gm) || []);
  console.log("\n--- row ORDER, run1 ---");
  rowsOf(first).forEach((l, i) => console.log(` ${i + 1}. ${l.slice(0, 78)}`));
  console.log("--- row ORDER, run2 ---");
  rowsOf(second).forEach((l, i) => console.log(` ${i + 1}. ${l.slice(0, 78)}`));

  // WHAT DOES THE RANKER ACTUALLY SEE? The sort is (score desc, title asc) — deterministic — so a
  // swap means score or title differs between the two passes. Ask each pass what it computed.
  const rankOf = (body, label, pre = []) => {
    const q = join(dir, `${label}.md`);
    const lg = join(dir, `${label}-LOG.md`);
    writeFileSync(q, body);
    const call = (extra) =>
      execFileSync(process.execPath, ["scripts/wyclau/chartkeeper.mjs", `--chart=${q}`, `--log=${lg}`, ...extra], { encoding: "utf8" });
    if (pre.length) call(pre);
    const out = call(["--rank"]);
    console.log(`\n--- ranked, ${label} ---`);
    console.log(out.split("RANK")[1]?.split("\n").slice(0, 18).join("\n") ?? out.slice(0, 400));
  };
  // Pass 1's view: BUNDLED with SETTLE already applied (which is what derive() re-reads at line 1126).
  rankOf(BUNDLED, "as-pass1-sees-it", ["--settle", "--write"]);
  // Pass 2's view: the file run 1 actually wrote.
  rankOf(first, "as-pass2-sees-it");

  const block = (t, needle) => {
    const lines = t.split("\n");
    const i = lines.findIndex((l) => l.includes(needle));
    return lines.slice(i, i + 4).map((l) => "    " + JSON.stringify(l)).join("\n");
  };
  for (const needle of ["ring-test the Bell in both", "the O2 publish test"]) {
    console.log(`\n--- ${needle} — as written by run1 ---\n${block(first, needle)}`);
    console.log(`--- ${needle} — as written by run2 ---\n${block(second, needle)}`);
  }
}
