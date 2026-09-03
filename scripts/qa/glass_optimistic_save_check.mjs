#!/usr/bin/env node
// scripts/qa/glass_optimistic_save_check.mjs
// Replaces glass_self_heal_reload_check.mjs (retired to gate_archive/, 2026-09-01).
//
// Wyatt reported the SAME idea-submit corruption after TWO different reload-based fixes: one that
// reloaded 1400ms after a successful publish, and one that blanked the body then reloaded once the
// publish settled either way. Two different reload timings producing the identical symptom is
// evidence the reload itself is implicated, not when it fires. ATTEMPT 3 removes location.reload()
// from the send/ruling flow entirely: a send or a ruling updates `state` in memory, repaints
// synchronously (renderIdeas/paintAsk), and publishes in the background -- the tab never tears
// itself down. This checks that mechanism is actually wired in, not that it fixes his symptom
// (unmeasurable from outside the live Claude Artifact host -- see the Chart entry).
//
// Checks the REAL generated output, never a copy (HARD-WON-LESSONS §12i).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS_MJS = join(REPO_ROOT, "scripts", "wyclau", "glass.mjs");
const OUT = join(REPO_ROOT, ".planning", "wyclau", "glass.html");

execFileSync("node", [GLASS_MJS, "--note", "optimistic-save check"], { cwd: REPO_ROOT });
const html = readFileSync(OUT, "utf8");

const failures = [];

if (html.includes("function blankThenReload(")) {
  failures.push("blankThenReload still defined -- the reload-based mechanism should be fully removed, not left dead");
}

// --- the send handler: must update state + repaint BEFORE calling cap.publish(), and must not reload ---
/* ⚠ FOLLOW THE DELEGATION, DO NOT ANCHOR ON THE LISTENER'S OWN TEXT. This read the 2000 characters
   after `send.addEventListener("click"` and judged them. On 2026-09-02 the send body moved into a
   named `sendIdea()` so his new DO NOW button could share ONE send path (rule 23 — two buttons,
   one way for an idea to reach the page), and this gate went red on four counts while every
   property it guards was intact. **A gate anchored on where code happens to live fails the day the
   code is tidied, and the next reader's cheapest move is to weaken it.** So it now resolves the
   listener to whatever it CALLS, and reads that. The properties are unchanged and the coverage is
   strictly larger: both buttons go through the body this checks. */
const clickIdx = html.indexOf('send.addEventListener("click"');
if (clickIdx === -1) {
  failures.push('could not find send.addEventListener("click", ...)');
} else {
  const listener = html.slice(clickIdx, clickIdx + 300);
  const delegate = /\b([A-Za-z_$][\w$]*)\s*\((?:[^)]*)\)\s*;\s*\}\s*\)\s*;/.exec(listener);
  let sendHandler = html.slice(clickIdx, clickIdx + 2000);
  if (delegate && delegate[1] !== "addEventListener") {
    const fnIdx = html.indexOf(`function ${delegate[1]}(`);
    if (fnIdx === -1) failures.push(`the send listener delegates to ${delegate[1]}() and no such function is defined on the page`);
    else sendHandler = html.slice(fnIdx, fnIdx + 2500);
  }
  const pushIdx = sendHandler.indexOf("state.ideas.push(idea)");
  const renderIdx = sendHandler.indexOf("renderIdeas()");
  const publishIdx = sendHandler.indexOf("cap.publish(buildDoc(state))");
  if (pushIdx === -1) failures.push("send handler: does not push the new idea into state.ideas before publishing");
  if (renderIdx === -1) failures.push("send handler: does not call renderIdeas() to repaint synchronously");
  if (publishIdx === -1) failures.push("send handler: does not call cap.publish(buildDoc(state))");
  if (pushIdx > -1 && renderIdx > -1 && publishIdx > -1 && !(pushIdx < renderIdx && renderIdx < publishIdx)) {
    failures.push("send handler: state update and repaint must happen BEFORE the publish call (optimistic UI), found out of order");
  }
  if (/location\.reload/.test(sendHandler)) failures.push("send handler: still calls location.reload() -- this is exactly what attempts 1 and 2 did and both still corrupted");
  if (!/\.then\(\s*function\s*\(\s*\)/.test(sendHandler) || sendHandler.indexOf(".then(") === -1) {
    failures.push("send handler: cap.publish() has no success/failure handling");
  }
}

// --- saveRuling: must update state + repaint BEFORE publishing, and must not reload ---
const rulingIdx = html.indexOf("function saveRuling(el, choice){");
if (rulingIdx === -1) {
  failures.push("could not find saveRuling(el, choice)");
} else {
  /* ⛔ THE FUNCTION'S OWN BODY, NOT A FIXED 1,200 CHARACTERS. That window was a constant standing
     in for "the inside of saveRuling", and it broke the day someone added a comment to it: the
     assertions below still described the code correctly, and the slice simply stopped reaching
     `paintAsk` and `cap.publish`. **A gate that fails because its subject grew is measuring its own
     window.** Same fault, and the same fix, as chartkeeper's eleven-line ownership window earlier
     today. The assertions are UNCHANGED — only what counts as "inside the function" is now derived,
     by matching braces from the opening one. */
  const bodyFrom = (src, at) => {
    let depth = 0;
    for (let i = src.indexOf("{", at); i < src.length && i !== -1; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
    }
    return src.slice(at, at + 4000);
  };
  const rulingHandler = bodyFrom(html, rulingIdx);
  const paintIdx = rulingHandler.indexOf("paintAsk(el)");
  const publishIdx = rulingHandler.indexOf("cap.publish(buildDoc(state))");
  if (paintIdx === -1) failures.push("saveRuling: does not call paintAsk(el) to repaint synchronously");
  if (publishIdx === -1) failures.push("saveRuling: does not call cap.publish(buildDoc(state))");
  if (paintIdx > -1 && publishIdx > -1 && paintIdx > publishIdx) {
    failures.push("saveRuling: repaint must happen BEFORE the publish call (optimistic UI), found out of order");
  }
  if (/location\.reload/.test(rulingHandler)) failures.push("saveRuling: still calls location.reload()");
}

// The Reload link on the SEPARATE capability-negotiation-hang bug is intentional and must survive
// -- confirm this gate is not accidentally asking for zero location.reload() in the whole document.
if (!html.includes('a.addEventListener("click", function(ev){ ev.preventDefault(); location.reload(); });')) {
  failures.push("the capability-negotiation-hang 'Reload' link (a separate, real fix) appears to be missing");
}

// The whole document must still contain exactly 2 real script elements (rule from
// glass_script_tag_purity_check.mjs) -- confirm this rewrite didn't introduce a stray one.
const totalOpens = (html.match(/<script/gi) || []).length;
if (totalOpens !== 2) failures.push(`whole document: expected exactly 2 "<script" occurrences, found ${totalOpens}`);

if (failures.length) {
  console.error("FAIL — glass optimistic save check");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("PASS — Send/ruling clicks update state and repaint in place, publish in the background, and never reload the tab");
process.exit(0);
