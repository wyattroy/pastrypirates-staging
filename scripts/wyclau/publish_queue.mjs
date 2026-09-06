#!/usr/bin/env node
// scripts/wyclau/publish_queue.mjs
//
// A durable handoff for a session that holds no Artifact tool (every Bell-launched `claude -p`
// watch, measured 2026-09-02, Door step 6b) to hand a finished publishable page to a session that
// does. Built 2026-09-06 after TWO separate watches (pastrypirates-f6, pastrypirates-ba) tried
// cross-session `SendMessage` to reach an Artifact-holding session for T-261 and neither delivery
// could be confirmed -- the pipe target the peer names is not the same address space
// `mcp__ccd_session_mgmt__send_message` resolves, so a reply attempt from the receiving side
// returned "session not found" twice, for two different peers. A live message can silently fail
// to arrive. A git-tracked file cannot -- it sits in the repo until a session that CAN publish
// reads it, whether that is in five seconds or five hours.
//
//   --add --ticket=T-NNN --path=<file> --desc="one line"
//       Append an open entry. Called by a session with no Artifact tool once its page is written
//       in publishable shape (starts with <title> then <style>, no <html>/<head>/<body>).
//       No-ops (exit 0) if that ticket already has an open entry -- calling it twice is safe.
//
//   --list   (default if no flag given)
//       Print open entries. Exit 0 if any are waiting, exit 10 if the queue is empty -- same
//       shape as glass_needs_publish.mjs's PUBLISH/NOTHING-MOVED split, so a session can chain
//       it in a check without parsing text: `node scripts/wyclau/publish_queue.mjs || true`.
//
//   --mark-published --ticket=T-NNN --url=<url>
//       Close an entry once a session has actually published it AND told Wyatt -- not before.
//       Rule 27 stands: "it ends when he has the link, not when the file exists."
//
// WHAT THIS DOES NOT DO, ON PURPOSE: it never publishes anything itself, and it never decides FOR
// a session that permission was granted. A plain node script cannot hold the Artifact tool and
// cannot ask Wyatt a question -- only a live session can do either. This just makes "is anything
// waiting" a fact any session can check in one command, instead of a fact that lives only in
// whichever peer happened to be listening on a pipe at the moment the request was sent.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QUEUE = join(ROOT, ".planning", "wyclau", "PUBLISH-QUEUE.md");

const ROW_RE = /^- \[( |x)\] `(T-[\w-]+)` — (.+?) — `([^`]+)`(?: — published: (\S+))?\s*$/;

function readRows() {
  if (!existsSync(QUEUE)) return [];
  const rows = [];
  for (const line of readFileSync(QUEUE, "utf8").split("\n")) {
    const m = line.match(ROW_RE);
    if (m) rows.push({ done: m[1] === "x", ticket: m[2], desc: m[3], path: m[4], url: m[5] || null });
  }
  return rows;
}

function writeRows(rows) {
  const header = `# Publish queue

A git-tracked handoff, not a live message: a session with no Artifact tool (every Bell-launched
watch) appends a finished page here instead of depending on a cross-session message that might
never be read. A session that DOES hold the Artifact tool runs
\`node scripts/wyclau/publish_queue.mjs\` at Door orientation, asks Wyatt once for everything open
(question UI, not prose), publishes what he approves, and closes each row with
\`--mark-published --ticket=T-NNN --url=<url>\`. See the script's own header for the full contract.

`;
  const lines = rows.map(r =>
    `- [${r.done ? "x" : " "}] \`${r.ticket}\` — ${r.desc} — \`${r.path}\`${r.url ? ` — published: ${r.url}` : ""}`
  );
  writeFileSync(QUEUE, header + lines.join("\n") + (lines.length ? "\n" : ""));
}

function arg(name) {
  const pfx = `--${name}=`;
  const hit = process.argv.slice(2).find(a => a.startsWith(pfx));
  return hit ? hit.slice(pfx.length) : null;
}
const has = (name) => process.argv.includes(`--${name}`);

if (has("add")) {
  const ticket = arg("ticket"), path = arg("path"), desc = arg("desc");
  if (!ticket || !path || !desc) {
    console.error('--add needs --ticket=T-NNN --path=<file> --desc="one line"');
    process.exit(1);
  }
  const rows = readRows();
  if (rows.some(r => r.ticket === ticket && !r.done)) {
    console.log(`ALREADY QUEUED — ${ticket} already has an open entry; not duplicated.`);
    process.exit(0);
  }
  rows.push({ done: false, ticket, desc, path, url: null });
  writeRows(rows);
  console.log(`QUEUED — ${ticket}: ${path}`);
  console.log("Not published yet. The next session with the Artifact tool closes this.");
  process.exit(0);
}

if (has("mark-published")) {
  const ticket = arg("ticket"), url = arg("url");
  if (!ticket || !url) {
    console.error("--mark-published needs --ticket=T-NNN --url=<url>");
    process.exit(1);
  }
  const rows = readRows();
  const row = rows.find(r => r.ticket === ticket && !r.done);
  if (!row) {
    console.error(`NOT FOUND — no OPEN queue row for ${ticket} (already closed, or never queued).`);
    process.exit(1);
  }
  row.done = true;
  row.url = url;
  writeRows(rows);
  console.log(`CLOSED — ${ticket}: ${url}`);
  process.exit(0);
}

// default: --list
const open = readRows().filter(r => !r.done);
if (!open.length) {
  console.log("EMPTY — nothing waiting to be published.");
  process.exit(10);
}
console.log(`${open.length} item(s) waiting for a session with the Artifact tool:`);
for (const r of open) console.log(`  ${r.ticket} — ${r.desc}\n    ${r.path}`);
process.exit(0);
