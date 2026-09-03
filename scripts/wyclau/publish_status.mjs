#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
/* publish_status.mjs — let any session read this machine's instruments.
 *
 * WYATT, 2026-09-01, after pasting 57 lines of restarts.log into the chat by hand: "you need to
 * design a way to read these without me opening the blade, writing into terminal, and copypasting
 * the output to you." He was the transport for his own laptop's instruments — that is the defect
 * (fault F9 of the 2026-09-01 post-mortem), and scripts/qa/wyclau_status_publish_check.mjs is the
 * red gate that specified this file before it existed.
 *
 * OWNERSHIP, NOT SHARING — the same answer the sea trial reached with --report=. The local,
 * gitignored instruments (restarts.log, HEARTBEAT, LONG-RUN) are summarized into ONE TRACKED file
 * per machine, .planning/wyclau/status/<hostname>.md. Per-machine filenames cannot conflict, so
 * every machine can publish forever and never collide.
 *
 *   node scripts/wyclau/publish_status.mjs [--dir=<repo>]
 *     exit 0 = the status file was created or its content CHANGED — the caller commits it
 *     exit 3 = nothing changed — the caller does nothing
 *
 * EXIT 3 IS WHAT MAKES THIS SAFE TO CALL EVERY WATCH. Publishing only on change means a quiet
 * night produces nothing and a ring produces one commit. Do not replace it with a timer — and do
 * not add a generated-at timestamp to the body: content that changes on every run would make
 * every run exit 0, which is the 144-commits-a-day failure the exit code exists to prevent. The
 * commit that carries this file already records WHEN.
 *
 * WHO CALLS IT: every watch, at its close step (the Door), so the Blade's log reaches the branch
 * within one watch of anything happening on it.
 */
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dirArg = process.argv.slice(2).find((a) => a.startsWith("--dir="));
const repo = dirArg ? path.resolve(dirArg.slice(6)) : process.cwd();
const WY = path.join(repo, ".planning", "wyclau");
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };

/* The body is DERIVED ENTIRELY FROM THE SOURCES, so identical sources produce identical bytes
 * and the change test below is honest. Absence is INFORMATION, never an error and never silence:
 * "this machine has never pulsed" is exactly what a reader on another machine needs to know. */
const host = os.hostname();
const heartbeat = read(path.join(WY, "HEARTBEAT"));
const restarts = read(path.join(WY, "restarts.log"));
const longRun = read(path.join(WY, "LONG-RUN"));
/* WHAT THIS MACHINE'S WATCH HAS IN HAND — his ask, 2026-09-02: "what is being worked on RIGHT NOW?"
 * Written by scripts/wyclau/claim_item.mjs, read by glass.mjs the same way it already reads the
 * long-run block. Deliberately the SAME SHAPE as that block rather than a new one: the reader is
 * then a copy of one already hardened by a real incident (the false red of 2026-08-31), and every
 * doubt in it resolves to NOT LIVE. */
const inHand = read(path.join(WY, "IN-HAND"));

const RESTART_TAIL = 40; // enough to cover a bad day; the full log stays on the machine that wrote it
const lines = [];
lines.push(`# wyclau status — ${host}`);
lines.push("");
lines.push("*Derived from this machine's local instruments by `scripts/wyclau/publish_status.mjs`.*");
lines.push("*The commit that carries this file records when it was published.*");
lines.push("");
lines.push("## Last pulse (HEARTBEAT)");
lines.push(heartbeat === null
  ? "No HEARTBEAT file — this machine has never pulsed (or the file was cleaned)."
  : "```\n" + heartbeat.trim() + "\n```");
lines.push("");
lines.push("## In hand (IN-HAND)");
lines.push(inHand === null
  ? "None recorded."
  : "```\n" + inHand.trim() + "\n```");
lines.push("");
lines.push("## Long run in flight (LONG-RUN)");
lines.push(longRun === null
  ? "None recorded."
  : "```\n" + longRun.trim() + "\n```");
lines.push("");
lines.push(`## The Bell's log (restarts.log, last ${RESTART_TAIL} lines)`);
if (restarts === null) {
  lines.push("No restarts.log — the Bell (or the old watchdog) has never logged on this machine.");
} else {
  const tail = restarts.trim().split("\n").slice(-RESTART_TAIL);
  lines.push("```");
  lines.push(...tail);
  lines.push("```");
}
lines.push("");
const body = lines.join("\n");

const statusDir = path.join(WY, "status");
const outPath = path.join(statusDir, `${host}.md`);
const existing = read(outPath);
if (existing === body) {
  console.log(`unchanged — ${path.relative(repo, outPath)} already says exactly this (nothing to commit)`);
  process.exit(3);
}
fs.mkdirSync(statusDir, { recursive: true });
fs.writeFileSync(outPath, body);
console.log(`published ${path.relative(repo, outPath)} — commit it so other machines can read this one's instruments`);
/* THE ONE PLACE A WATCH CAN BE TOLD, and it is here because the Door could not be edited from the
 * session that built this. CEO 112: a watch that works without recording a claim leaves his page
 * saying nothing is in hand while it works — "a false statement of the same family he complained
 * about, inverted." Every watch runs THIS script (Door steps 4 and 6), so this is the reminder that
 * actually reaches one. It never fails the publish; it is a sentence, not a gate. */
if (inHand === null) {
  console.log("  ⚠ NO CLAIM RECORDED on this machine — his page will read \"Nothing recorded in hand\".");
  console.log("  -> if you are working an item: node scripts/wyclau/claim_item.mjs --item=\"T-000 — what it is\"");
}
process.exit(0);
