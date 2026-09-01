#!/usr/bin/env node
// scripts/qa/glass_send_confirms_check.mjs
//
// THE SEND BUTTON MUST NEVER GET STUCK. Wyatt, 2026-08-31, live: "i need to be able to send
// another idea immediately afterwards, without waiting. i need to know that my first idea was
// sent, and added to the chart." The pre-fix code's success handler was an empty comment ("Success
// reloads every open view to the new version") -- it relied entirely on the platform's own reload
// and never re-enabled the button or said anything on success. CEO Review 54's finding: the UX fix
// shipped with no gate at all -- fixed without a failing check first, the one step of the four this
// project's own process names as non-negotiable. This is that check, red-proofed against the exact
// pre-fix shape before being trusted.
//
// ⚠ WHAT THIS CAN AND CANNOT SEE. There is no local way to drive a real Claude Artifact's "artifact"
// capability (cap.publish) outside the live host, so this cannot click the button and watch it
// happen. What it CAN do, and does: read the REAL generated client script source (never a copy) and
// confirm the success handler contains every behaviour Wyatt asked for, in the right place -- state
// reassigned, the draft cleared, the textarea cleared, the visible list repainted, an HONEST
// confirmation string (not overclaiming "added to the chart" -- only a session harvesting it does
// that), and the button re-enabled. A source check is weaker than driving the real thing; it is
// still a real, red-proofable check, which is exactly the gap CEO Review 54 found: none at all.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS_MJS = join(REPO_ROOT, "scripts", "wyclau", "glass.mjs");
const OUT = join(REPO_ROOT, ".planning", "wyclau", "glass.html");

execFileSync("node", [GLASS_MJS, "--note", "send-confirms check"], { cwd: REPO_ROOT });
const html = readFileSync(OUT, "utf8");

// Isolate the send.addEventListener("click", ...) handler's own body, so a check does not
// accidentally pass by matching similar-looking code somewhere else in the file (e.g. saveRuling).
const clickIdx = html.indexOf('send.addEventListener("click"');
if (clickIdx === -1) {
  console.error('FAIL — could not find send.addEventListener("click", ...) at all');
  process.exit(1);
}
// The handler is a short, self-contained block; slice a generous window and rely on the require
// list below rather than trying to precisely bracket-match the function body.
const handler = html.slice(clickIdx, clickIdx + 3000);

const requirements = [
  { label: "publish success is handled (a .then after cap.publish)", re: /cap\.publish\(buildDoc\(st\)\)\.then\(/ },
  { label: "local state is reassigned to the just-saved value (not left stale)", re: /state\s*=\s*st\s*;/ },
  { label: "the textarea is cleared", re: /text\.value\s*=\s*["']["']\s*;/ },
  { label: "the visible ideas list is repainted immediately (renderIdeas called again)", re: /renderIdeas\(\)\s*;/ },
  { label: "an honest confirmation is shown, using the word 'Saved'", re: /status\.textContent\s*=\s*["'][^"']*Saved[^"']*["']/ },
  { label: "the button is re-enabled on success", re: /send\.disabled\s*=\s*false\s*;/ },
];

const failures = [];
for (const r of requirements) {
  const found = r.re.test(handler);
  if (!found) failures.push(r.label);
}

// A SEPARATE, POSITIVE assertion (not just "missing a requirement" above): the confirmation text
// must not overclaim that the idea is already IN the Chart -- only a session harvesting it does
// that. Extract whatever string literal follows the FIRST status.textContent assignment inside the
// success handler (there is exactly one on the success path) and check its wording directly,
// rather than trying to encode "not this phrase" as one more regex on the whole handler blob.
const statusMatch = handler.match(/status\.textContent\s*=\s*"([^"]*)"/);
if (statusMatch) {
  const confirmText = statusMatch[1];
  if (/added to the chart|is in the chart/i.test(confirmText)) {
    failures.push(`the confirmation overclaims -- "${confirmText}" implies it's already in the Chart, but only a session harvesting it does that`);
  }
} else if (!failures.some((f) => f.includes("honest confirmation"))) {
  failures.push("could not find the confirmation string literal to check its wording");
}

if (failures.length) {
  console.error("FAIL — glass send-confirms check");
  for (const f of failures) console.error(`  - missing: ${f}`);
  process.exit(1);
}

console.log("PASS — the Send button's success path updates state, clears the box, confirms honestly, and re-enables");
process.exit(0);
