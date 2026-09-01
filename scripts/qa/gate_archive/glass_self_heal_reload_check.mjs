#!/usr/bin/env node
// scripts/qa/glass_self_heal_reload_check.mjs
//
// BLANK, THEN RELOAD -- NOT A ROOT-CAUSE FIX. Wyatt, 2026-08-31, live: after submitting an idea
// the RENDERED page corrupted (raw JS source visible as page text); his own View Page Source
// moments later showed the STORED HTML was clean. So the corruption lives in one specific render,
// not in what gets saved -- and the exact mechanism could not be root-caused (no way to drive
// cap.publish() outside the live Claude Artifact host to watch it happen).
//
// FIRST ATTEMPT (superseded, this gate replaced its own predecessor): keep the full page on
// screen and schedule a reload 1400ms after a successful publish. Wyatt reported it STILL broken
// -- read plainly, a full complex page still on screen during whatever window the corruption
// actually happens in still shows him the broken render, reload or no reload.
//
// THIS VERSION removes the risk surface instead of racing it: blankThenReload() replaces the
// entire visible body with a few words of plain text BEFORE cap.publish() is even called, then
// reloads once that publish settles (success or failure -- the existing draft-recovery logic on
// page load already tells the next load whether the words made it), with a safety-net timeout in
// case the promise never settles at all. This checks that mechanism is actually wired in.
//
// Checks the REAL generated output, never a copy (HARD-WON-LESSONS §12i).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS_MJS = join(REPO_ROOT, "scripts", "wyclau", "glass.mjs");
const OUT = join(REPO_ROOT, ".planning", "wyclau", "glass.html");

execFileSync("node", [GLASS_MJS, "--note", "blank-then-reload check"], { cwd: REPO_ROOT });
const html = readFileSync(OUT, "utf8");

const failures = [];

// --- blankThenReload itself ---
if (!html.includes("function blankThenReload(msg, publishPromise){")) {
  failures.push("blankThenReload(msg, publishPromise) is not defined at all");
} else {
  if (!/document\.body\.textContent\s*=\s*["']["']/.test(html)) failures.push("blankThenReload does not clear document.body before doing anything else");
  if (!html.includes("location.reload();")) failures.push("blankThenReload never calls a real location.reload()");
  if (!/publishPromise\.then\(go,\s*go\)/.test(html)) failures.push("blankThenReload does not reload on BOTH success and failure of publishPromise (must accept the failure branch too, not just .then's success arg)");
  if (!/setTimeout\(go,\s*\d+\)/.test(html)) failures.push("blankThenReload has no safety-net timeout for a publishPromise that never settles");
}

// --- the send handler: blank must happen BEFORE cap.publish() is called, not after ---
const clickIdx = html.indexOf('send.addEventListener("click"');
if (clickIdx === -1) {
  failures.push('could not find send.addEventListener("click", ...)');
} else {
  const sendHandler = html.slice(clickIdx, clickIdx + 2000);
  const blankIdx = sendHandler.indexOf("blankThenReload(");
  const publishIdx = sendHandler.indexOf("cap.publish(buildDoc(st))");
  if (blankIdx === -1) failures.push("send handler: does not call blankThenReload at all");
  else if (publishIdx === -1) failures.push("send handler: does not call cap.publish(buildDoc(st)) at all");
  else if (publishIdx < blankIdx) failures.push("send handler: cap.publish() is called BEFORE blankThenReload -- the risky window opens before the screen is blanked");
  // The draft must NOT be cleared before the reload -- clearing early would lose his words on a
  // failed publish, since blankThenReload no longer branches on success vs failure itself.
  if (/setDraft\(""\)/.test(sendHandler)) failures.push('send handler: still calls setDraft("") directly -- this must be left to the on-load reconciliation, or a failed publish loses his draft');
}

// --- saveRuling: blank must happen BEFORE cap.publish() ---
const rulingIdx = html.indexOf("function saveRuling(el, choice){");
if (rulingIdx === -1) {
  failures.push("could not find saveRuling(el, choice)");
} else {
  const rulingHandler = html.slice(rulingIdx, rulingIdx + 1200);
  const blankIdx = rulingHandler.indexOf("blankThenReload(");
  const publishIdx = rulingHandler.indexOf("cap.publish(buildDoc(next))");
  if (blankIdx === -1) failures.push("saveRuling: does not call blankThenReload at all");
  else if (publishIdx === -1) failures.push("saveRuling: does not call cap.publish(buildDoc(next)) at all");
  else if (publishIdx < blankIdx) failures.push("saveRuling: cap.publish() must be passed AS THE ARGUMENT to blankThenReload (same call), not invoked separately before it");
}

// The whole document must still contain exactly 2 real script elements (rule from
// glass_script_tag_purity_check.mjs) -- confirm this new code did not introduce a stray one, and
// that it appears correctly ESCAPED inside the embedded TPL copy (proof the two copies stay equal,
// per rule 23 ONE DISPLAY PATH -- a live self-publish must run the identical logic).
const totalOpens = (html.match(/<script/gi) || []).length;
if (totalOpens !== 2) failures.push(`whole document: expected exactly 2 "<script" occurrences, found ${totalOpens}`);
const occurrences = (html.match(/blankThenReload/g) || []).length;
if (occurrences < 6) failures.push(`blankThenReload appears only ${occurrences} times -- expected at least 6 (3 in the live script: definition + 2 call sites, echoed again inside the embedded self-publish TPL copy); the two may have fallen out of sync`);

if (failures.length) {
  console.error("FAIL — glass self-heal reload check");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("PASS — a Send/ruling click blanks the screen before the risky publish window opens, then reloads on settle (either outcome) or on a safety timeout");
process.exit(0);
