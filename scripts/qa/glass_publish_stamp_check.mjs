#!/usr/bin/env node
/* glass_publish_stamp_check.mjs — LAST-PUBLISH must not be able to record a publish that never
 * happened.
 *
 * WHY THIS EXISTS (2026-09-01). mark_glass_published.mjs took no arguments, verified nothing, and
 * wrote "Glass published" unconditionally. Anything that ran it stamped a publish — including a
 * `claude -p` watch, which on this machine has no Artifact tool and therefore CANNOT publish
 * (settled behaviourally: ToolSearch("select:Artifact") and ToolSearch("+artifact") both return
 * no matching deferred tools, and the print session's own prompt lists subagent tools as "All
 * tools except Agent, Artifact, ArtifactComments...").
 *
 * WHAT IT COST, and this is why it is a gate rather than a note. On the night it was found, a
 * session (this one) read LAST-PUBLISH twice and reported it to Wyatt as fact: once as evidence of
 * when the Glass had last been published, and once as the baseline of a polling watch. Neither
 * reading was safe. CLAUDE.md rule 6: a measurement that cannot fail is not a measurement — and
 * this file could only ever say one thing.
 *
 * THE FIX IT ENFORCES: the stamp requires --version=<id>, the version the Artifact publish call
 * itself returned. A session that did not publish does not have one. That does not make forgery
 * impossible — nothing a plain node script can do would — but it converts a SILENT honour system
 * into an EXPLICIT claim that names a checkable artifact version. The stamp stops being an
 * assertion and becomes a receipt.
 *
 * DELIBERATELY NOT DONE: this does not try to contact the artifact to verify the version is real.
 * A node script cannot call the Artifact tool (only a live session can), and a check that pretends
 * to verify something it cannot reach is the instrument failure this whole gate is about.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, dirname , resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "wyclau", "mark_glass_published.mjs");
/* The page the seeded harvest receipt names. Any name, so long as the flag and the receipt agree —
   which is what the writer checks. A case that deliberately passes its own --harvested= keeps it. */
/* ⚑ ABSOLUTE, because the publish stamp now compares the RESOLVED PATH — CEO 168 showed a
   basename is not an identity: two sessions hold byte-identical names for the same page
   version, so the guard could not tell "did YOU read it?" from "did anyone?". */
const CARRIED_PAGE = resolve("/sessions/gate/tool-results/artifact-74034bde-1788386140-0fbe.html");
const withHarvested = (args) => args.some((a) => String(a).startsWith("--harvested="))
  ? args : [...args, `--harvested=${CARRIED_PAGE}`];
const SIBLING = join(ROOT, "scripts", "wyclau", "glass_needs_publish.mjs");

let failures = 0;
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures++; };
const pass = (msg) => console.log(`  ok    ${msg}`);

/* Run the stamper against a THROWAWAY tree so the real .planning/wyclau/LAST-PUBLISH is never
   touched. The script derives its target from its own location, so the copy must sit at the same
   depth: <sandbox>/scripts/wyclau/mark_glass_published.mjs -> <sandbox>/.planning/wyclau/. */
/* ⚠ THE SANDBOX MUST BE A REAL GIT REPO WITH A REAL SIBLING SCRIPT — CEO 82, and this was a live
   trap rather than a tidiness point. The first version copied ONLY mark_glass_published.mjs, so its
   `await import("./glass_needs_publish.mjs")` could never resolve, the catch fired on every run, and
   `head` was the literal string "unknown" in EVERY assertion. The gate was green on a path where
   the commit derivation was 100% broken, and would have stayed green if that derivation broke in
   production. THE PRODUCTION CONSEQUENCE IS NOT BENIGN: glass_needs_publish matches
   /commit=([0-9a-f]{7,40})/, "unknown" does not match, so the stamp reads as "no commit recorded"
   and the gate returns PUBLISH on every tick forever — the exact clock-driven behaviour Wyatt
   objected to, restored silently, with npm test reporting all gates green.
   A gate that cannot fail in the one dimension the fix depends on is rule 6's own sentence,
   reproduced inside the gate written to enforce it. */
function runInSandbox(args) {
  const box = mkdtempSync(join(tmpdir(), "glass-stamp-"));
  mkdirSync(join(box, "scripts", "wyclau"), { recursive: true });
  mkdirSync(join(box, ".planning", "wyclau"), { recursive: true });
  const copy = join(box, "scripts", "wyclau", "mark_glass_published.mjs");
  writeFileSync(copy, readFileSync(SCRIPT));
  // The sibling the stamper imports its one definition of "newest work commit" from.
  writeFileSync(join(box, "scripts", "wyclau", "glass_needs_publish.mjs"), readFileSync(SIBLING));
  /* ⚠ AND THE WHOLE lib/ FOLDER, DERIVED RATHER THAN LISTED — earned 2026-09-03 (`T-111`).
     `mark_glass_published.mjs` gained an import of ./lib/artifact_version.mjs, this sandbox listed
     its files by hand, and the module failed to resolve — so the stamper exited 1 and THREE
     assertions here failed against a script that was working. That is the same shape CEO 82 caught
     in this very function: a sandbox where an import cannot resolve tests a path production never
     takes. Copying the directory means the next shared module needs nobody to remember this. */
  const LIB = join(ROOT, "scripts", "wyclau", "lib");
  if (existsSync(LIB)) {
    mkdirSync(join(box, "scripts", "wyclau", "lib"), { recursive: true });
    for (const f of readdirSync(LIB)) writeFileSync(join(box, "scripts", "wyclau", "lib", f), readFileSync(join(LIB, f)));
  }
  // A real repo with a real commit, so the derivation runs for real instead of falling into catch.
  const git = (...a) => execFileSync("git", ["-C", box, ...a], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("init", "-q");
    git("config", "user.email", "gate@example.invalid");
    git("config", "user.name", "gate");
    git("add", "-A");
    git("commit", "-q", "-m", "sandbox");
  } catch { /* no git here: the assertions below will show it as a real failure, not hide it */ }
  const stamp = join(box, ".planning", "wyclau", "LAST-PUBLISH");
  writeFileSync(stamp, "SENTINEL-UNTOUCHED\n");
  /* ⛔ THE PUBLISH STAMP NOW REQUIRES --harvested= AND A MATCHING HARVEST RECEIPT (`T-210`):
     one session's look may no longer license another session's overwrite of his page. **This
     gate's subject is the VERSION FIELD**, so it satisfies the precondition and goes on testing
     that — seeding the receipt rather than loosening the refusal, because a refusal relaxed for
     a test is not a refusal. */
  writeFileSync(join(box, ".planning", "wyclau", "LAST-HARVEST"),
    JSON.stringify({ artifactVersion: "seeded", harvestedPath: CARRIED_PAGE }));
  let code = 0, out = "";
  try {
    out = execFileSync(process.execPath, [copy, ...withHarvested(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    code = e.status ?? 1;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  const after = existsSync(stamp) ? readFileSync(stamp, "utf8") : "";
  rmSync(box, { recursive: true, force: true });
  return { code, out, after };
}

console.log("LAST-PUBLISH must be a receipt, not an assertion\n");

// 1. NO EVIDENCE -> MUST REFUSE. This is the one that fails on the old script, which stamped
//    happily with no arguments at all.
{
  const r = runInSandbox([]);
  if (r.code === 0) fail("stamped with NO --version: a session that never published can forge a publish");
  else pass("refuses to stamp without --version");
  if (r.after !== "SENTINEL-UNTOUCHED\n") fail("wrote to LAST-PUBLISH despite having no evidence of a publish");
  else pass("leaves LAST-PUBLISH untouched when it refuses");
}

// 2. AN EMPTY VERSION IS NOT A VERSION. Guards the obvious way round the first check.
{
  const r = runInSandbox(["--version="]);
  if (r.code === 0) fail("accepted an EMPTY --version=");
  else pass("rejects an empty --version=");
}

// 3. WITH A REAL VERSION -> STAMPS, AND RECORDS THE VERSION so a later reader can check it
//    against the live artifact rather than taking the line on trust.
{
  const r = runInSandbox(["--version=1788301109-8c5c"]);
  if (r.code !== 0) fail(`refused a valid --version (exit ${r.code}): ${r.out.trim().split("\n")[0] ?? ""}`);
  else pass("stamps when given the version the publish returned");
  if (!r.after.includes("1788301109-8c5c")) fail("stamped without recording the version — the receipt has no number on it");
  else pass("records the artifact version in the stamp");
  // AND THE COMMIT, FOR REAL. Not "unknown": a 40-hex sha, derived through the sibling import.
  const sha = (r.after.match(/commit=([0-9a-f]{40})/) || [])[1];
  if (!sha) fail(`stamped no real commit sha — the change-gate reads that as "nothing to compare" and publishes on every tick forever. Got: ${r.after.trim()}`);
  else pass(`records a real 40-hex commit (${sha.slice(0,7)}), so the derivation actually ran`);
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
