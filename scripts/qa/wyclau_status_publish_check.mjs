#!/usr/bin/env node
/* wyclau_status_publish_check.mjs — the RED half of "let any session read the Razer's instruments".
 *
 * WYATT, 2026-09-01, after pasting 57 lines of restarts.log into the chat by hand: "you need to
 * design a way to read these without me opening the blade, writing into terminal, and copypasting
 * the output to you."
 *
 * THE PROBLEM, EXACTLY. HEARTBEAT, restarts.log and LONG-RUN are gitignored (.gitignore:77-96,
 * "local-only... Per-machine by nature"). That reasoning is sound for SHARED files — two machines
 * writing one HEARTBEAT would clobber each other, which is the fault `--report=` already fixed for
 * sea trials. But the consequence is that the only instruments that can answer "is the engine
 * alive, and did the watchdog have to revive it" live on exactly one laptop, so every status
 * question routes through Wyatt's hands. He is the transport, and that is the defect.
 *
 * THE DESIGN THIS GATE PINS: ownership, not sharing — the same answer the sea trial reached.
 * A tracked file PER MACHINE at `.planning/wyclau/status/<hostname>.md`, written from the local
 * gitignored originals. Per-machine filenames cannot conflict, so two machines can both publish
 * forever and never collide. `.planning/wyclau/status/` is NOT in .gitignore, so this works with
 * no ignore-file surgery.
 *
 *   node scripts/wyclau/publish_status.mjs --dir=<repo>
 *     exit 0 = the status file was created or its content CHANGED — the caller should commit+push
 *     exit 3 = nothing changed — the caller does nothing
 *
 * EXIT 3 IS THE WHOLE REASON THIS IS SAFE TO CALL EVERY TICK. The watchdog runs every ten minutes;
 * committing on every tick would be ~144 commits a day of noise. Publishing only on CHANGE means a
 * quiet night produces nothing and a launch produces one commit. Do not replace it with a timer.
 *
 * WHAT THIS GATE CAN AND CANNOT SEE:
 *   CAN see:    that the script writes a per-machine file, that its content carries the heartbeat
 *               and the recent restarts, that an unchanged run exits 3, that a changed source
 *               brings it back to 0, and that it touches nothing outside its own directory.
 *   CANNOT see: whether the watchdog actually CALLS it, or whether the commit+push that follows
 *               succeeds on Windows. Both are proved on the Razer by the file appearing on the
 *               branch — which is itself the feature, so the proof and the deliverable are the
 *               same thing for once.
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = "scripts/wyclau/publish_status.mjs";
const failures = [];
let passCount = 0;
const cleanups = [];

function check(label, cond, detail) {
  if (cond) { passCount++; console.log(`PASS -- ${label}`); }
  else { failures.push(`${label}${detail ? `: ${detail}` : ""}`); console.error(`FAIL -- ${label}${detail ? `: ${detail}` : ""}`); }
}

function fixture(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `wyclau-status-${name}-`));
  fs.mkdirSync(path.join(d, ".planning", "wyclau"), { recursive: true });
  cleanups.push(d);
  return d;
}

function run(dir) {
  const abs = path.join(ROOT, SCRIPT);
  if (!fs.existsSync(abs)) return { missing: true, code: null };
  const r = spawnSync(process.execPath, [abs, `--dir=${dir}`], { encoding: "utf8" });
  return { missing: false, code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// A snapshot of every file under a directory, so "touched nothing else" is checkable rather than
// asserted — the difference between a guard and a wish.
function snapshot(dir) {
  const seen = new Map();
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else seen.set(path.relative(dir, full), fs.readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return seen;
}

const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();

function seed(dir, { heartbeat, restarts, longRun }) {
  const wy = path.join(dir, ".planning", "wyclau");
  if (heartbeat !== undefined) fs.writeFileSync(path.join(wy, "HEARTBEAT"), heartbeat);
  if (restarts !== undefined) fs.writeFileSync(path.join(wy, "restarts.log"), restarts);
  if (longRun !== undefined) fs.writeFileSync(path.join(wy, "LONG-RUN"), longRun);
}

console.log("wyclau status publishing — can a session anywhere read the Razer's instruments?\n");

/* ---------------------------------------------------------------------------------------------
 * 1. It publishes, per machine, into a tracked directory.
 * ------------------------------------------------------------------------------------------- */
{
  const d = fixture("basic");
  seed(d, {
    heartbeat: `${iso(2)}\tSea trial for 2026.09.01.1 is genuinely running\n`,
    restarts: `2026-09-01T11:06:01Z\tno engine, and no commit for 55 min (over 45) -- LAUNCH\n` +
              `2026-09-01T11:16:01Z\thold off: an engine is already running -- never stack a second on it\n`,
  });
  const r = run(d);
  if (r.missing) {
    check("publish_status.mjs exists", false, `${SCRIPT} does not exist yet — this contract is unbuilt`);
  } else {
    check("first publish exits 0 (content is new, caller should commit)", r.code === 0, `got exit ${r.code}`);
    const statusDir = path.join(d, ".planning", "wyclau", "status");
    const files = fs.existsSync(statusDir) ? fs.readdirSync(statusDir) : [];
    check("it writes exactly one file into .planning/wyclau/status/", files.length === 1, `found: ${JSON.stringify(files)}`);
    const named = files[0] || "";
    check("the filename carries this machine's hostname, so two machines can never collide",
      named.includes(os.hostname()), `hostname is ${os.hostname()}, file is ${named}`);
    const body = files.length ? fs.readFileSync(path.join(statusDir, files[0]), "utf8") : "";
    check("the published file carries the heartbeat's own text",
      body.includes("Sea trial for 2026.09.01.1 is genuinely running"), `body was: ${body.slice(0, 200)}`);
    check("the published file carries the recent restarts, including the LAUNCH line",
      body.includes("LAUNCH") && body.includes("never stack a second"), `body was: ${body.slice(0, 300)}`);
  }
}

/* ---------------------------------------------------------------------------------------------
 * 2. Unchanged input publishes NOTHING. This is the assertion that keeps a ten-minute watchdog
 *    from producing 144 commits a day, and it is the one a naive implementation fails.
 * ------------------------------------------------------------------------------------------- */
{
  const d = fixture("idempotent");
  seed(d, { heartbeat: `${iso(5)}\tsteady\n`, restarts: `2026-09-01T10:00:00Z\thold off\n` });
  const first = run(d);
  if (!first.missing) {
    const second = run(d);
    check("a second run with nothing changed exits 3 (no commit, no noise)", second.code === 3, `got exit ${second.code}`);

    // ...and it must come BACK to 0 the moment something real happens, or the quiet is a lie.
    seed(d, { restarts: `2026-09-01T10:00:00Z\thold off\n2026-09-01T11:06:01Z\tLAUNCH\n` });
    const third = run(d);
    check("a new restart line brings it back to exit 0", third.code === 0, `got exit ${third.code}`);
  } else {
    check("idempotence: unchanged run exits 3", false, `${SCRIPT} does not exist yet`);
    check("idempotence: changed input returns to exit 0", false, `${SCRIPT} does not exist yet`);
  }
}

/* ---------------------------------------------------------------------------------------------
 * 3. A machine with no instruments yet is INFORMATION, not an error — "this machine has never
 *    pulsed" is exactly what a reader needs to know, and a script that stays silent there hands
 *    back the same ambiguity Wyatt is trying to escape.
 * ------------------------------------------------------------------------------------------- */
{
  const d = fixture("empty");
  const r = run(d);
  if (!r.missing) {
    check("no HEARTBEAT and no restarts.log still publishes a file, saying so", r.code === 0, `got exit ${r.code}`);
    const statusDir = path.join(d, ".planning", "wyclau", "status");
    const files = fs.existsSync(statusDir) ? fs.readdirSync(statusDir) : [];
    check("that file exists and is non-empty", files.length === 1 &&
      fs.readFileSync(path.join(statusDir, files[0]), "utf8").trim().length > 0,
      `files: ${JSON.stringify(files)}`);
  } else {
    check("an empty machine still publishes", false, `${SCRIPT} does not exist yet`);
    check("that file is non-empty", false, `${SCRIPT} does not exist yet`);
  }
}

/* ---------------------------------------------------------------------------------------------
 * 4. It touches NOTHING outside its own directory. A status publisher that can rewrite the ledger
 *    or the Chart is a status publisher that will, on the night nobody is watching.
 * ------------------------------------------------------------------------------------------- */
{
  const d = fixture("blast-radius");
  seed(d, { heartbeat: `${iso(1)}\tworking\n`, restarts: `2026-09-01T09:00:00Z\thold off\n` });
  fs.writeFileSync(path.join(d, ".planning", "CTO-LEDGER.md"), "the record\n");
  fs.writeFileSync(path.join(d, ".planning", "CHART.md"), "the plan\n");
  const before = snapshot(d);
  const r = run(d);
  if (!r.missing) {
    const after = snapshot(d);
    const changed = [];
    for (const [k, v] of after) if (!before.has(k) || before.get(k) !== v) changed.push(k);
    for (const k of before.keys()) if (!after.has(k)) changed.push(`${k} (deleted)`);
    const strayed = changed.filter((f) => !f.replace(/\\/g, "/").startsWith(".planning/wyclau/status/"));
    check("it writes ONLY under .planning/wyclau/status/ — nothing else in the tree moved",
      strayed.length === 0, `also changed: ${JSON.stringify(strayed)}`);
  } else {
    check("blast radius is limited to .planning/wyclau/status/", false, `${SCRIPT} does not exist yet`);
  }
}

for (const d of cleanups) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }

console.log("");
if (failures.length) {
  console.error(`FAIL wyclau status publishing — ${failures.length} of ${failures.length + passCount} checks failing:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nRED ON PURPOSE until scripts/wyclau/publish_status.mjs exists. Turning this green is");
  console.error("what stops Wyatt being the transport for his own laptop's instruments.");
  process.exit(1);
}
console.log(`PASS wyclau status publishing — all ${passCount} checks green.`);
process.exit(0);
