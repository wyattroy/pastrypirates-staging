#!/usr/bin/env node
// apply_judge_results.mjs — merge a session's vision verdicts back into a gate run.
//
// The other half of the queue handoff (see the long note in lib/vision.mjs). playtest_gate.mjs
// leaves `judge-queue.json`; a Claude session reads the screenshots itself and writes
// `judge-results.json`; this merges them into `judge-findings.txt`, byte-compatible with what the
// CLI-shelling judge used to produce, so every downstream reader (README, handoffs, the next
// session's work queue) is unchanged.
//
// Usage: node 4/scripts/apply_judge_results.mjs <gate-output-dir>
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: node 4/scripts/apply_judge_results.mjs <gate-output-dir>"); process.exit(2); }
const qPath = path.join(dir, "judge-queue.json");
const rPath = path.join(dir, "judge-results.json");
for (const p of [qPath, rPath]) if (!fs.existsSync(p)) { console.error("missing " + p); process.exit(2); }

const q = JSON.parse(fs.readFileSync(qPath, "utf8"));
const r = JSON.parse(fs.readFileSync(rPath, "utf8"));
const results = Array.isArray(r) ? r : (r.results || []);
const byShot = new Map(results.map(x => [path.basename(String(x.shot || "")), x]));

/* A SCREEN THAT WAS NOT JUDGED IS NOT A SCREEN THAT PASSED, and the whole point of this tool is to
   keep those two apart. The gate's own judge already distinguished ERROR from PASS for exactly this
   reason; a merge step that quietly filled the gaps with PASS would hand back a clean sheet for
   work nobody did — the most expensive kind of green this project has. Unjudged screens are counted
   and named, and the exit code is non-zero so a script cannot mistake a partial pass for a full one. */
const lines = [], unjudged = [], failed = [];
for (const s of q.screens) {
  const base = path.basename(s.shot);
  const v = byShot.get(base);
  if (!v) { unjudged.push(base); continue; }
  const verdict = /fail/i.test(String(v.verdict)) ? "FAIL" : "PASS";
  if (verdict === "FAIL") {
    failed.push(base);
    for (const issue of (Array.isArray(v.issues) ? v.issues : [String(v.issues || "")]).filter(Boolean)) {
      lines.push(`${base}: ${issue}`);
    }
  }
}
const out = [];
out.push(`# judged by a Claude session via the queue handoff (no CLI, no second credential)`);
out.push(`# ${q.screens.length} screen(s) queued · ${q.screens.length - unjudged.length} judged · ${failed.length} FAILED · ${unjudged.length} NOT judged`);
if (unjudged.length) {
  out.push(`# NOT JUDGED — these are NOT cleared: ${unjudged.join(", ")}`);
}
out.push("");
out.push(...lines);
fs.writeFileSync(path.join(dir, "judge-findings.txt"), out.join("\n") + "\n");
q.status = unjudged.length ? "partial" : "complete";
fs.writeFileSync(qPath, JSON.stringify(q, null, 1));

console.log(`judge-findings.txt written: ${failed.length} screen(s) FAILED, ${unjudged.length} NOT judged`);
if (unjudged.length) console.log(`NOT JUDGED (not cleared): ${unjudged.join(", ")}`);
process.exit(unjudged.length ? 1 : 0);
