#!/usr/bin/env node
/* glass_never_force_check.mjs — NOTHING IN THE GLASS PATH MAY PASS `force` TO A PUBLISH.
 *
 * WHY THIS EXISTS, AND IT IS THE WHOLE OF `T-105` LAYER A.
 * The Artifact tool refuses a publish that was not built on the live version — MEASURED, not
 * assumed: on 2026-09-02 at 4:58 PM ET a deliberately stale republish of a disposable artifact came
 * back *"a newer version … is live and this publish was not built on it"*, and a second, independent
 * gate refused a session that had never viewed the page at all. That refusal is the ONLY thing
 * standing between a regenerating session and everything Wyatt has typed into his page.
 *
 * `force: true` turns it off. There is no partial version of that.
 *
 * SO THE RULE WAS WRITTEN DOWN — `GLASS-UPDATE-SESSION.md:300`, *"NEVER PASS `force`. NOT ONCE, NOT
 * TO GET PAST A CONFLICT."* — and NOTHING ENFORCED IT. This project's whole record is sessions
 * walking past sentences: the harvest rule, the CEO cadence, the "answered question leaves" rule,
 * each one prose first and a gate only after it failed. **A sentence is what failed here. This is
 * the fence.**
 *
 * WHAT IT CHECKS, and it is deliberately narrow: the FILES THAT DRIVE THE GLASS must not contain a
 * force flag aimed at a publish. It cannot read a session's mind or inspect a tool call — no gate
 * can. What it CAN do is fail the build the moment `force` is written into the path, which is how
 * such a flag would arrive: somebody hits a conflict, reaches for the override, and commits it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not ban the WORD — `docs/` and this header discuss it,
 * and a gate that fails on its own explanation is a gate somebody deletes. It matches an assignment
 * or a JSON key, in the files that publish.
 */
"use strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const ok = (m) => console.log(`  PASS -- ${m}`);
const bad = (m) => { console.log(`  FAIL -- ${m}`); failed++; };

/* The Glass publish path: the generator, the two receipt writers, the harvest hook, and the runbook
   a session follows by hand. Derived by NAME because these are the files that publish or instruct a
   publish; a sixth arriving tomorrow is caught by case 3's sweep of the whole wyclau directory. */
const PATH_FILES = [
  "scripts/wyclau/glass.mjs",
  "scripts/wyclau/mark_glass_published.mjs",
  "scripts/wyclau/mark_glass_harvest.mjs",
  ".claude/hooks/glass-harvest-first.cjs",
  ".planning/wyclau/GLASS-UPDATE-SESSION.md",
];

/* An ASSIGNMENT or a JSON key, never the bare word. `force: true`, `"force": true`, `force=true`,
   `--force`. Prose that merely says the word "force" is not a violation and must not be, or the
   header above would fail its own check. */
const FORCE = /(^|[^A-Za-z_])(--force\b|["'`]?force["'`]?\s*[:=]\s*(true|1|["'`]?yes))/i;

/* ⚠ FILESYSTEM CALLS TAKE A `force` OPTION AND HAVE NOTHING TO DO WITH PUBLISHING. Caught on this
   gate's first red run: `longrun_status.mjs:125` is `fs.rmSync(…, { force: true })` — deleting a
   marker file. Left unhandled, this gate would have failed `npm test` forever on innocent code,
   which is how a gate gets deleted rather than fixed. The exclusion is by CALL, not by file, so a
   sixth script doing the same thing is fine and a real publish flag on the same line still fails. */
const FS_CALL = /\b(rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|cp|cpSync|mkdir|mkdirSync|writeFile|writeFileSync|copyFile|copyFileSync)\s*\(/;

function scan(rel, why) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  const lines = readFileSync(abs, "utf8").split("\n");
  const hits = [];
  lines.forEach((l, i) => { if (FORCE.test(l) && !FS_CALL.test(l)) hits.push(`${rel}:${i + 1}  ${l.trim().slice(0, 90)}`); });
  if (hits.length) bad(`${why}\n         ` + hits.join("\n         "));
  else ok(why);
  return hits.length;
}

console.log("glass_never_force_check — nothing in the Glass path may override a stale-publish refusal\n");

// 1-5. every file in the publish path
for (const f of PATH_FILES) {
  if (!existsSync(join(ROOT, f))) { bad(`${f} is missing — the path this gate guards has moved, and a moved path is an unguarded one`); continue; }
  scan(f, `no force flag in ${f}`);
}

// 6. THE WHOLE wyclau DIRECTORY, so a sixth publisher added tomorrow needs nobody to register it.
//    Rule 9: derive the subject, never keep a hand-typed list.
{
  const dir = join(ROOT, "scripts", "wyclau");
  const { readdirSync } = await import("node:fs");
  const all = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".mjs")) : [];
  const hits = [];
  for (const f of all) {
    const rel = `scripts/wyclau/${f}`;
    readFileSync(join(dir, f), "utf8").split("\n").forEach((l, i) => {
      if (FORCE.test(l) && !FS_CALL.test(l)) hits.push(`${rel}:${i + 1}  ${l.trim().slice(0, 90)}`);
    });
  }
  if (hits.length) bad(`a force flag appeared somewhere in scripts/wyclau/ (${all.length} files swept)\n         ` + hits.join("\n         "));
  else ok(`no force flag anywhere in scripts/wyclau/ — ${all.length} files swept, so a new publisher needs nobody to register it`);
}

// 7. THE RUNBOOK MUST STILL CARRY THE RULE. A gate with no rule beside it gets deleted by the next
//    person who cannot see why it exists; a rule with no gate is what failed here. Both, or neither.
{
  const rb = join(ROOT, ".planning", "wyclau", "GLASS-UPDATE-SESSION.md");
  const src = existsSync(rb) ? readFileSync(rb, "utf8") : "";
  if (/NEVER PASS `?force`?/i.test(src)) ok("the runbook still tells a session never to pass force — rule and gate together");
  else bad("the runbook no longer says NEVER PASS force — the sentence this gate enforces has been deleted");
}

// 8. RED-PROOF. A gate that cannot fail is not a gate; this project has shipped three of those.
//    Prove the matcher fires on the exact shape a session would write, and stays silent on prose.
{
  const shouldFail = ['  force: true,', '{"force": true}', 'publish(url, --force)', "force = true"];
  const shouldPass = ["never pass force to a publish", "the force flag is the danger", "// force is discussed here"];
  const fsLines = ["fs.rmSync(dir, { force: true });", "await rm(p, { force: true })"];
  const f1 = shouldFail.filter((s) => !FORCE.test(s));
  const p1 = shouldPass.filter((s) => FORCE.test(s));
  const fsMiss = fsLines.filter((s) => !(FORCE.test(s) && FS_CALL.test(s)));
  if (fsMiss.length) bad(`red-proof: a filesystem force option is NOT being excluded, so this gate would fail the build on innocent code: ${JSON.stringify(fsMiss)}`);
  else if (f1.length) bad(`red-proof: the matcher MISSED a real force flag: ${JSON.stringify(f1)}`);
  else if (p1.length) bad(`red-proof: the matcher fired on prose, which would make this gate undeletable-by-annoyance: ${JSON.stringify(p1)}`);
  else ok("red-proof: fires on all 4 real flag shapes, silent on 3 prose mentions AND on 2 filesystem force options");
}

console.log(failed ? `\nFAIL -- ${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
