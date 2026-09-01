#!/usr/bin/env node
// scripts/qa/glass_script_tag_purity_check.mjs
//
// THE GLASS'S REAL SCRIPT TAGS, AND ONLY THEM. Wyatt, 2026-08-31, reported the Glass "css breaks"
// right after he saved an idea through the Ideas box, and sent two screenshots. The second showed
// raw JS SOURCE CODE rendering as visible page text, in the exact spot the client's own script
// block should have been running silently.
//
// ⚠ CORRECTION, CEO Review 54, IN THE OPEN: the first version of this file said the root cause was
// "measured" -- a comment inside the client script block reading `// The state block is a JSON
// <script>, so...`, a literal, unescaped, tag-shaped substring sitting inside the real script
// element's own text. That substring was real and IS worth removing (this gate still enforces its
// absence, below) -- but it was NOT measured to be the cause. CEO Review 54 regenerated the exact
// pre-fix page and rendered it in a real, unmodified headless Chrome: it came up completely clean,
// no corruption, because per the HTML5 spec a bare `<script>` (no slash) inside script-data state
// is not special -- only `</script` ends it, and this file's own follow-up multi-round self-publish
// simulation (jsEsc/JSON.stringify round-tripped 4 times) never drifted either. So: THE ACTUAL
// MECHANISM THAT CORRUPTED WYATT'S LIVE PAGE IS STILL UNKNOWN. It may be specific to the Claude
// Artifact host's own internal rendering/patching pipeline when `cap.publish()` runs live, which
// cannot be reproduced or inspected from outside that system. This gate is kept because the
// substring it bans is genuinely bad practice regardless of whether it was Wyatt's actual trigger,
// and because a wider invariant (below) is worth having independent of that open question.
//
// THE INVARIANT THIS GUARDS, WIDENED after the same review found the first version only checked
// two ALREADY-LOCATED blocks' own interiors -- a stray "</script" sitting in ordinary body markup,
// outside either block, would be read as closing the state block early and never flagged. Now:
// the WHOLE generated document must contain EXACTLY two `<script` occurrences and exactly two
// `</script` occurrences (the state block and the client block, nothing else), AND neither block's
// own interior may contain a stray one either. Two independent checks of the same invariant from
// different directions.
//
// ⚠ THIS CHECKS THE REAL GENERATED OUTPUT, NEVER A COPY (HARD-WON-LESSONS §12i): it runs the real
// scripts/wyclau/glass.mjs and reads the glass.html it actually writes -- not a re-typed excerpt of
// the template. CORRECTION, same review: an earlier version of this comment claimed it ran "in a
// throwaway working directory" -- false, and never checked. glass.mjs resolves its own paths from
// ITS OWN file location regardless of cwd or CLAUDE_PROJECT_DIR, so this always writes and reads
// the REAL repo's .planning/wyclau/glass.html (local, gitignored) -- the same side effect every
// other Glass gate in this suite already accepts, stated honestly instead of guessed.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS_MJS = join(REPO_ROOT, "scripts", "wyclau", "glass.mjs");
const OUT = join(REPO_ROOT, ".planning", "wyclau", "glass.html");

function generate() {
  execFileSync("node", [GLASS_MJS, "--note", "script tag purity check"], { cwd: REPO_ROOT });
  return readFileSync(OUT, "utf8");
}

// ⚠ THE BUG THIS GATE ITSELF HAD, red-proofed into existence and fixed before trusting this file:
// an earlier version stripped each script block's ENTIRE span (open tag through its own close) and
// then checked what was OUTSIDE both spans -- which throws away the exact place the real defect
// lives (a stray tag-shaped substring INSIDE a script's own running text) before ever looking at
// it. Planting the real bug back and running this file's own logic against it still PASSED, which
// is what caught the mistake. The fix: extract each block's INNER content (between its tags, not
// including them) and check THAT for any extra "<script"/"</script" occurrence -- the boundary
// tags are expected and excluded; anything else inside is the failure mode.
function checkBlockInterior(html, label, openTag, findClose) {
  const failures = [];
  const openIdx = html.indexOf(openTag);
  if (openIdx === -1) { failures.push(`${label}: could not find its opening tag at all`); return failures; }
  const contentStart = openIdx + openTag.length;
  const closeIdx = findClose(html, contentStart);
  if (closeIdx === -1) { failures.push(`${label}: opening tag has no closing </script> after it`); return failures; }
  const interior = html.slice(contentStart, closeIdx);
  const stray = interior.match(/<\/?script/gi) || [];
  if (stray.length > 0) {
    failures.push(`${label}: ${stray.length} stray script-tag-shaped substring(s) inside its OWN content: ${JSON.stringify(stray)}`);
  }
  return failures;
}

const html = generate();
const failures = [
  ...checkBlockInterior(html, "state script block", '<script type="application/json" id="glassState">', (h, from) => h.indexOf("</script>", from)),
  // The client block is the LAST script tag in the fragment, so its close is the document's last
  // </script> -- found from the end, not from the first occurrence after its own open tag (which
  // would find the wrong, nearer one whenever a stray "</script"-shaped substring sits inside it).
  ...checkBlockInterior(html, "client script block", "<script>", (h) => h.lastIndexOf("</script>")),
];

// CEO Review 54's widening: check the WHOLE document too, not just the two known blocks' own
// interiors. This is what would catch a stray tag-shaped substring sitting in ORDINARY body
// markup, between the two blocks -- the interior checks above cannot see that by construction.
const totalOpens = (html.match(/<script/gi) || []).length;
const totalCloses = (html.match(/<\/script/gi) || []).length;
if (totalOpens !== 2) failures.push(`whole document: expected exactly 2 "<script" occurrences (the state block and the client block), found ${totalOpens}`);
if (totalCloses !== 2) failures.push(`whole document: expected exactly 2 "</script" occurrences, found ${totalCloses}`);

if (failures.length) {
  console.error("FAIL — glass script tag purity");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nA stray \"<script\" or \"</script\" substring anywhere outside the two real script");
  console.error("elements is banned regardless of whether it is proven to corrupt the live page. Say");
  console.error("\"script element\" or \"script tag\" in prose instead of the bracketed form.");
  process.exit(1);
}

console.log("PASS — exactly 2 real script elements, no stray tag-shaped substrings anywhere else");
process.exit(0);
