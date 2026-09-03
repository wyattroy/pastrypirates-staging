/* CEO 156 throwaway — verifies parkedReason on real + adversarial shapes, and renders the LIVE
   Chart through the real glass.mjs pipeline to see what actually reaches his page. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chunk, stateOf, parkedReason, titleOf } from "../scripts/wyclau/lib/chart_model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("=== A. parkedReason on shapes ===");
const shapes = [
  ["real #1126 (inbox)", "- **CEO Review 51's small finding**: `quiet_gate_report.mjs`'s naming convention (`^[wq]\\d+_`)\n  misses a1 / a2 — two real per-item gates that are\n  neither structural nor currently reportable as retirement candidates. → **PARKED, low priority**:\n  widen the regex to also match `a\\d+_` whenever someone is next in it."],
  ["real #609 (prose)", "  → **PARKED, with the measurement, because the obvious fix has a real cost.** `waitSettled()`\n  already pushes its deadline while TEXT is still painting."],
  ["bare PARKED", "- **Y** → **PARKED**"],
  ["PARKED, reason after bold", "- **Z** → **PARKED** because I said so and it costs too much."],
  ["SCHEDULED", "- **Q** → **SCHEDULED, T-100**"],
  ["unclosed bold, >160", "- **R** → **PARKED, " + "x".repeat(300)],
  ["PARKED word inside a longer verdict", "- **S** → **NOT PARKED, still open**"],
  ["arrow ASCII", "- **T** -> **PARKED, no time**"],
];
for (const [name, s] of shapes) {
  console.log(String(name).padEnd(34), stateOf(s).padEnd(10), JSON.stringify(parkedReason(s)));
}

console.log("\n=== B. LIVE CHART.md — every inbox block's state + why ===");
const chart = readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8");
// mirror glass.mjs's section slicing loosely: find THE IDEA INBOX section
const lines = chart.split("\n");
const start = lines.findIndex((l) => /^##\s+THE IDEA INBOX/.test(l));
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
const section = lines.slice(start + 1, end);
const chunks = chunk(section, "bullet");
let n = 0, counts = { open: 0, committed: 0, parked: 0, finished: 0 };
for (const c of chunks) {
  if (c.kind !== "row") continue;
  n++;
  const all = c.lines.join("\n");
  const st = stateOf(all);
  counts[st]++;
  if (st === "parked") {
    console.log("PARKED ROW head:", titleOf(c.lines).slice(0, 90));
    console.log("   parkedReason ->", JSON.stringify(parkedReason(all)));
  }
}
console.log("inbox rows:", n, JSON.stringify(counts));
