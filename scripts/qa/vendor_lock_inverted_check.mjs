#!/usr/bin/env node
/* vendor_lock_inverted_check.mjs — the inverted vendor lock must still be a CHECK.
 *
 * WHY IT EXISTS, in Wyatt's own words. 2026-09-02, question UI, he was offered "delete the vendor
 * check entirely" and chose "invert it":
 *
 *     "claude-kit is intended to be a repo where the DESIGN of our system is made... but our system
 *      must operate LOCALLY in its OWN REPO."
 *     "DO NOT ALSO DELETE THE CHECK. Red-proof both ways: a local edit must NOT fail; a kit that
 *      has fallen behind must be reported."
 *
 * THE FIRST HALF SHIPPED AT 08:48Z AND THE SECOND DID NOT, and the gap is the reason this file
 * exists. The inversion replaced ONE `exit 1` — but the array it read is fed by FOUR different
 * conditions, only one of which is "somebody edited a file here":
 *
 *     a vendored file EDITED here      -> genuinely "this repo is AHEAD of the kit". His ruling.
 *     a vendored file DELETED here     -> also a local decision, but it is not an edit
 *     a kit-shaped role card not vendored -> a warning about the NEXT vendor pass
 *     VENDORED-FROM with no MANIFEST   -> THE CHECK CANNOT EXAMINE ITS SUBJECT AT ALL
 *
 * All four printed under one banner reading "this repo is AHEAD of the kit" and all four exited 0.
 * The last one is the one that matters: **a gate that cannot see its subject was reporting
 * PASSED.** That is HARD-WON-LESSONS.md §3 — an instrument that reports nothing has told you
 * something about ITSELF, not about the world — and it is precisely the "do not also delete the
 * check" he ruled against. Deleting the exit code and deleting the check are the same act.
 *
 * ⚠ THE SECOND HALF OF HIS SENTENCE IS NOT BUILT, AND THE FIRST VERSION OF THIS COMMENT GAVE THE
 * WRONG REASON — CEO 106, finding 1, and it is the most useful thing in the pass.
 * It said the kit-behind half "CANNOT BE BUILT HERE", because a watch's read of the claude-kit
 * checkout had been measured REFUSED twice. **Wyatt had already removed that fence.** Asked on the
 * Glass whether an unattended watch may READ the claude-kit folder, he ruled **"yes"** at
 * 2026-09-02T12:39:56.363Z — thirty-one minutes before this file was written — and nobody harvested
 * the ruling into DECISIONS.md, so the session closing the very item that depended on it answered
 * from a stale memory instead of from his answer. HARD-WON-LESSONS §12k, verbatim.
 * **A REFUSAL IS A PERMISSION SETTING, NOT A FACT ABOUT THE WORLD**, and that is the reusable line:
 * "I tried and it was refused" measures the fence, never the thing behind it.
 * The fence is down (`scripts/wyclau/bell.ps1`, --add-dir, this change). Case 6 therefore asserts
 * something WEAKER than his ruling asks for and says so: while no detector exists, the file must
 * admit on EVERY path — including the drifted one, where a reader is most likely to believe the
 * kit question has just been answered for them — that the kit half was not checked. **The detector
 * itself is the open remainder of `T-078` and is on the Chart.** When it lands, case 6 gets
 * stronger, not deleted.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "qa", "vendor_check.mjs");

let failed = false;
const check = (label, cond, detail) => {
  if (cond) console.log(`PASS -- ${label}`);
  else { console.error(`FAIL -- ${label}${detail ? `: ${detail}` : ""}`); failed = true; }
};

const dirs = [];
const mk = (name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vendor-${name}-`)); dirs.push(d); return d; };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/* Build a fixture repo with ONE vendored area, exactly the shape this repo's own areas have:
 * an area directory holding VENDORED-FROM + MANIFEST.sha256, and the vendored files themselves
 * living wherever they actually work (never inside the area) — which is how `.claude/wyclau`
 * anchors files under `scripts/wyclau/`. Returns the repo root. */
function fixture(name, { files, manifestRows, writeManifest = true }) {
  const repo = mk(name);
  const area = path.join(repo, ".claude", "kitarea");
  fs.mkdirSync(area, { recursive: true });
  fs.writeFileSync(path.join(area, "VENDORED-FROM"), "claude-kit fixture 0000000\n");

  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(repo, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  if (writeManifest) {
    const rows = manifestRows.map(([rel, body]) => `${sha(Buffer.from(body))}  ${rel}`).join("\n") + "\n";
    fs.writeFileSync(path.join(area, "MANIFEST.sha256"), rows);
  }
  return repo;
}

const run = (repo) => {
  const r = spawnSync(process.execPath, [SCRIPT, `--repo=${repo}`], { encoding: "utf8" });
  return { code: r.status, out: ((r.stdout || "") + (r.stderr || "")).trim() };
};

/* ⚑ CEO 106, FINDING 2 — AND IT IS CEO 104'S FAULT RECURRING INSIDE THE GATE THAT BOASTS ABOUT
   REMOVING IT. Cases 2c and 4e first asked whether the sentence "task list for the next back-port
   pass" appeared in the output. That is a WORD-SEARCH over user-facing prose: reword the sentence —
   which sessions in this repo do constantly — and both cases pass forever having examined nothing.
   **They fail OPEN, silently**, exactly like `unattachedMentions` grepping for a heading. Case 3b
   already had its own comment diagnosing this class, and two cases in the same file were left on
   the prose anyway; being able to name a fault is not the same as not committing it.
   The structural fact is the COUNT the verdict line reports, which is what the back-port pass
   actually consumes. Anchor to that. */
const aheadCount = (out) => {
  const m = out.match(/^PASSED \(with drift\) — (\d+) ahead\b/m);
  return m ? Number(m[1]) : 0;
};

console.log("vendor_lock_inverted_check — the project owns its copy, and the check still checks\n");

const CLEAN = { "scripts/kit/tool.mjs": "one\n" };

/* ------------------------------------------------------------------ *
 * 1. HIS HALF THAT SHIPPED — a local EDIT must NOT fail.
 *    Run first and deliberately: a gate that fails everything is as useless as one that passes
 *    everything, and this is the case that proves the inversion is real rather than asserted.
 * ------------------------------------------------------------------ */
{
  const repo = fixture("edited", {
    files: { "scripts/kit/tool.mjs": "EDITED HERE\n" },
    manifestRows: [["scripts/kit/tool.mjs", "one\n"]],
  });
  const { code, out } = run(repo);
  check("1. a locally EDITED vendored file exits 0 — his ruling, the project owns its copy",
    code === 0, `exit ${code}\n${out}`);
  check("1b. ...and is named as this repo being AHEAD of the kit, not as an offence",
    /AHEAD of the kit/.test(out) && !/EDITED IN PLACE/.test(out), out);
}

/* ------------------------------------------------------------------ *
 * 2. A DELETED vendored file is a local decision too — so it must not FAIL. But it is not an
 *    edit, and calling it "ahead of the kit" is a false sentence about the world: nothing here
 *    moved forward, a file went away. The back-port pass reading that list would go looking for
 *    an improvement to promote and find nothing.
 * ------------------------------------------------------------------ */
{
  const repo = fixture("deleted", {
    files: {},                                   // the manifest names a file that is not on disk
    manifestRows: [["scripts/kit/tool.mjs", "one\n"]],
  });
  const { code, out } = run(repo);
  check("2. a DELETED vendored file exits 0 — deleting your own copy is not a build failure",
    code === 0, `exit ${code}\n${out}`);
  check("2b. ...and is reported as DELETED here, never as 'AHEAD of the kit'",
    /DELETED/i.test(out) && !/AHEAD of the kit[^\n]*tool\.mjs|tool\.mjs[^\n]*AHEAD of the kit/.test(out), out);
  /* ⚑ THE CASE THE FIRST DRAFT OF 2b MISSED, AND IT IS THE ONE THAT MATTERS. The per-line label
     survives — only "EDITED IN PLACE" is rewritten — so 2b passed on the ORIGINAL code and told me
     nothing. The false sentence is the PARAGRAPH: "N file(s) have moved on here and not yet in
     claude-kit ... These files are the task list for the next back-port pass". A deleted file is
     not an improvement waiting to be promoted upstream, and a back-port pass reading that list
     goes looking for one and finds a hole. Written before the fix, like the rest. */
  check("2c. ...and is NOT counted into the back-port task list — there is nothing to promote",
    !aheadCount(out), `ahead count was ${aheadCount(out)}\n${out}`);
}

/* ------------------------------------------------------------------ *
 * 3. THE CASE THAT MUST FAIL THE BUILD, and the whole reason this gate exists.
 *    A VENDORED-FROM with no MANIFEST.sha256 means the check has nothing to hash and cannot say
 *    anything at all about that area. Today it prints "PASSED (with drift)" and exits 0.
 *    A gate that cannot see its subject must never report a verdict about it.
 * ------------------------------------------------------------------ */
{
  const repo = fixture("nomanifest", {
    files: CLEAN,
    manifestRows: [],
    writeManifest: false,
  });
  const { code, out } = run(repo);
  check("3. a vendored area with NO MANIFEST exits 1 — the check cannot examine its subject",
    code === 1, `exit ${code}\n${out}`);
  /* ⚑ THIS CASE WORD-SEARCHED AND CAUGHT ITSELF, WHICH IS WORTH MORE THAN THE CASE. Its first form
     asserted the string "PASSED" appeared nowhere in the output — and it went red on the FIXED
     code, because the new FAILED block explains itself with the sentence "Reporting PASSED about it
     would be deleting the check". A gate grepping prose for a word it also uses is exactly the
     fault CEO 104 removed from the Chartkeeper one watch ago (`unattachedMentions` searching for a
     heading its own rows quote), and it very nearly shipped again inside the gate written to stop a
     different one. The verdict is STRUCTURAL: every verdict line this script prints starts at
     column 0. Assert that, not a word. */
  check("3b. ...and no verdict line claims PASSED — a check with no subject may not report one",
    !/^PASSED/m.test(out), out.split("\n").filter(l => /^PASSED/.test(l)).join(" | "));
}

/* ------------------------------------------------------------------ *
 * 4. A kit-shaped role card that was never vendored will be LOST on the next vendor pass. That is
 *    a warning about the future, not a claim that this repo has moved ahead. Non-fatal (it is a
 *    file somebody deliberately added), but it must be labelled as what it is.
 * ------------------------------------------------------------------ */
{
  const repo = fixture("stray", {
    files: {
      ".claude/agents/kit-one.md": "a\n",
      ".claude/agents/kit-two.md": "b\n",
      ".claude/agents/kit-stray.md": "not vendored\n",   // matches the derived `kit-` prefix
      ".claude/agents/unrelated.md": "belongs to this repo\n",
    },
    manifestRows: [[".claude/agents/kit-one.md", "a\n"], [".claude/agents/kit-two.md", "b\n"]],
  });
  const { code, out } = run(repo);
  check("4. a stray kit-shaped role card exits 0 — a deliberate local file is not a build failure",
    code === 0, `exit ${code}\n${out}`);
  check("4b. ...is still reported, naming the file that would be lost",
    /kit-stray\.md/.test(out) && /lost/i.test(out), out);
  check("4c. ...and is NOT called 'AHEAD of the kit' — nothing here moved forward",
    !/AHEAD of the kit[^\n]*kit-stray|kit-stray[^\n]*AHEAD of the kit/.test(out), out);
  check("4d. ...and an unrelated agent file is left alone (the derived-prefix scope still holds)",
    !/unrelated\.md/.test(out), out);
  check("4e. ...and is NOT counted into the back-port task list — it was never in the kit to begin with",
    !aheadCount(out), `ahead count was ${aheadCount(out)}\n${out}`);
}

/* ------------------------------------------------------------------ *
 * 5. A CLEAN area passes with no drift. The other direction of the red-proof: without this, every
 *    case above could be satisfied by a check that always complains.
 * ------------------------------------------------------------------ */
{
  const repo = fixture("clean", {
    files: CLEAN,
    manifestRows: [["scripts/kit/tool.mjs", "one\n"]],
  });
  const { code, out } = run(repo);
  check("5. a clean vendored area exits 0 and reports no drift",
    code === 0 && !/DRIFT/.test(out), `exit ${code}\n${out}`);
}

/* ------------------------------------------------------------------ *
 * 6. THE HALF OF HIS SENTENCE THIS MACHINE CANNOT ANSWER MUST SAY SO — ON EVERY PATH.
 *    "A kit that has fallen behind must be reported" needs both trees. The no-drift path already
 *    carries that admission; the DRIFTED path does not, and that is the path where a reader has
 *    just been handed a confident paragraph about the kit and is most likely to conclude the
 *    question is settled. Same fault class as "a green suite proves nothing about what he sees".
 * ------------------------------------------------------------------ */
{
  const repo = fixture("drift-notchecked", {
    files: { "scripts/kit/tool.mjs": "EDITED HERE\n" },
    manifestRows: [["scripts/kit/tool.mjs", "one\n"]],
  });
  const { out } = run(repo);
  check("6. the DRIFTED path also says the kit-moved-forward half was NOT CHECKED here",
    /NOT CHECKED/.test(out), out);
  check("6b. ...and names the command that can answer it",
    /install\.sh|claude-kit[^\n]*check/i.test(out), out);
}

/* ------------------------------------------------------------------ *
 * 7. THE REAL REPO STILL PASSES. Every case above runs on a fixture; this one runs on the subject
 *    npm test actually cares about, so the gate cannot go green on tmpdirs while the thing it
 *    guards is red. (chartkeeper_check.mjs case 7 was aimed at a fixture and never at the live
 *    Chart, and a duplicate handle sat on the real file for hours behind a green gate.)
 * ------------------------------------------------------------------ */
{
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  check("7. the real repo's own vendored areas still exit 0",
    r.status === 0, `exit ${r.status}\n${((r.stdout || "") + (r.stderr || "")).trim()}`);
}

for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }

console.log(failed ? "\nFAIL" : "\nPASS");
process.exit(failed ? 1 : 0);
