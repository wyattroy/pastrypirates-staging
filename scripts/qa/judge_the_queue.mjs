/* judge_the_queue.mjs — take a trial's queued screens somewhere safe, then judge them, resumably.
 *
 * WYATT'S RULING, 2026-09-02 (INBOX-20260902T0050Z, his own pick in the question UI): "Judge the
 * screenshots first" — before staging, before release. His reasoning: the untappable sail square
 * that cost days was caught by looking, not by structure.
 *
 * WHY THE SNAPSHOT HALF EXISTS, MEASURED AND NOT ASSUMED. Every trial writes its screenshots to
 * the SAME filenames in sea-trial-shots/ and writes judge-queue.json LAST, once, to the same path
 * (scripts/playtest_gate.mjs:673-682). So the moment a second trial sails, the first run's queue is
 * still on disk pointing at pictures that now belong to the second run — silently, with no stamp
 * on any of them. Measured 2026-09-02T02:2xZ: the 1914Z release trial's queue (written
 * 2026-09-01T20:42:16Z UTC, runid 2026.09.01.7) was still intact while the trial started
 * 2026-09-02T01:37Z had already rewritten 107 of its 343 settled screens. Every hour of waiting
 * costs more of them. THE EVIDENCE IS PERISHABLE AND NOTHING WAS PROTECTING IT.
 *
 * WHY IT IS RESUMABLE AND WRITES AS IT GOES. A judging pass over a few hundred screens is a long
 * job, and a long job that keeps its results in memory loses all of them when it is interrupted —
 * this project has already lost three sea trials that way. Results are appended to
 * judge-results.json in the snapshot after every batch, and a re-run skips anything already
 * judged, so any number of sessions can share one pass.
 *
 * A SCREEN THIS DOES NOT JUDGE STAYS UNJUDGED. It is never written as PASS to finish the list —
 * the whole point of the queue, and of the trial's NOT-RUN column, is that "we could not look" and
 * "we looked and it was fine" must never collapse into each other.
 *
 *   node scripts/qa/judge_the_queue.mjs --snapshot=judge-1914Z-shots [--before=2026-09-02T01:37:00Z]
 *   node scripts/qa/judge_the_queue.mjs --judge=judge-1914Z-shots [--max=40] [--batch=6]
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { judgeBatch } from "../lib/vision.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SHOTS = path.join(REPO, "sea-trial-shots");
const base = (p) => String(p).split(/[\\/]/).pop();

if (arg("snapshot")) {
  const out = path.join(REPO, arg("snapshot"));
  const cut = new Date(arg("before", "2026-09-02T01:37:00Z")).getTime();
  fs.mkdirSync(out, { recursive: true });
  let took = 0, left = 0;
  for (const f of fs.readdirSync(SHOTS)) {
    const src = path.join(SHOTS, f);
    let st; try { st = fs.statSync(src); } catch { continue; }
    if (!st.isFile()) continue;
    const wanted = f.endsWith(".png") ? st.mtimeMs < cut : (f === "judge-queue.json" || f === "runid.json");
    if (!wanted) { if (f.endsWith(".png")) left++; continue; }
    /* NEVER OVERWRITE WHAT IS ALREADY PRESERVED. A second run of this after another trial has
       sailed would otherwise replace good bytes with that trial's, which is the very fault. */
    const dst = path.join(out, f);
    if (fs.existsSync(dst)) continue;
    fs.copyFileSync(src, dst); took++;
  }
  console.log(`snapshot ${arg("snapshot")}: took ${took} file(s); ${left} png already rewritten by a later run and left behind`);
  process.exit(0);
}

const dir = path.join(REPO, arg("judge", ""));
if (!arg("judge") || !fs.existsSync(path.join(dir, "judge-queue.json"))) {
  console.error("usage: --snapshot=<dir> | --judge=<dir with a judge-queue.json in it>");
  process.exit(2);
}
const queue = JSON.parse(fs.readFileSync(path.join(dir, "judge-queue.json"), "utf8"));
const resultsPath = path.join(dir, "judge-results.json");
const prior = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, "utf8")) : { results: [] };
const done = new Set(prior.results.map(r => base(r.shot)));

/* THE QUEUE NAMES THE ORIGINAL PATHS. Point every entry at the preserved copy by basename — that
   is the same one-derivation rule the judge's own staging uses (scripts/lib/vision.mjs). A screen
   whose picture did not survive the later trial is DROPPED here, loudly, never judged from
   whatever now sits at its old path. */
const todo = [], lost = [];
for (const s of queue.screens || []) {
  const b = base(s.shot);
  if (done.has(b)) continue;
  const p = path.join(dir, b);
  if (fs.existsSync(p)) todo.push({ path: p, context: s.context || "", shot: s.shot });
  else lost.push(b);
}
const MAX = +arg("max", "0") || todo.length;
const BATCH = +arg("batch", "6");
console.log(`${queue.screens.length} queued · ${done.size} already judged · ${lost.length} lost to a later trial · judging ${Math.min(MAX, todo.length)} now`);

let judged = 0, failed = 0;
for (let i = 0; i < Math.min(MAX, todo.length); i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  const r = await judgeBatch(slice);
  if (r.fatal) { console.log(`  FATAL — ${r.fatal.issues.join("; ")}`); break; }
  if (r.unparseable) { console.log(`  skipped a batch — ${r.unparseable}`); continue; }
  for (const it of slice) {
    const v = r.results.get(it.path);
    if (!v) continue;                                  // not mentioned -> NOT judged, NOT cleared
    prior.results.push({ shot: it.shot, verdict: v.verdict, issues: v.issues, confidence: v.confidence });
    judged++; if (v.verdict === "FAIL") { failed++; console.log(`  FAIL  ${base(it.path)} — ${v.issues.join("; ")}`); }
  }
  fs.writeFileSync(resultsPath, JSON.stringify(prior, null, 1));   // after EVERY batch, never at the end
  console.log(`  ${prior.results.length}/${queue.screens.length} judged, ${failed} FAIL so far`);
}
console.log(`\n${judged} screen(s) judged this pass, ${failed} FAIL. ${queue.screens.length - prior.results.length} still unjudged — NOT cleared.`);
