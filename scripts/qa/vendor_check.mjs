#!/usr/bin/env node
/* vendor_check.mjs — has ANY vendored-from-claude-kit copy been edited in place?
 *
 * WHY THIS GATE EXISTS. Wyatt, 2026-08-30: "i need our new organization to work both in cloud and
 * local sessions, and be consistent across both." His ruling was VENDOR EVERYWHERE — the repo
 * carries the officers and the crew, and a local session reads the same copy a cloud container
 * does. One copy per repo instead of a plugin on the laptop and a copy in the cloud, which would
 * be two things kept in step by hand: the exact fault this project spent 2026-08-30 removing from
 * the game engine.
 *
 * ONE COPY IS ONLY ONE COPY IF NOBODY EDITS IT. The failure that actually happens is not exotic:
 * a session finds a bug in a vendored file, fixes it there because that is where it is looking,
 * and the repo and claude-kit silently diverge. Nothing fails, nothing warns, and the next vendor
 * run overwrites the fix.
 *
 * ⚠ GENERALISED 2026-08-31 (renamed from org_vendor_check.mjs), the day wyclau became claude-kit's
 * SECOND vendored area (`.claude/org/` was the first). Hardcoding one path was already the trap
 * this file's own header warns about one section down — "an instrument whose subject is narrower
 * than the thing it should be checking" is the mirror image of the over-reach bug fixed the same
 * day this gate was written. So: DISCOVER every vendored area by finding every VENDORED-FROM file
 * in the repo, rather than naming `.claude/org/` as the only one that exists. A THIRD module added
 * later needs no edit here at all — this is what "derived, never hand-typed" (CLAUDE.md convention
 * 6) means applied to the gate's own scope, not just the numbers inside it.
 *
 * ⚠ WHAT THIS GATE CAN AND CANNOT SEE — and it says so in its own output, because an instrument
 * that reports a result without saying what it touched is this project's oldest recurring fault:
 *
 *   CAN see:    a vendored file EDITED, DELETED or ADDED inside this repo, by comparing every
 *               file against the sha256 recorded when it was vendored — for every vendored area
 *               found, not just one.
 *   CANNOT see: claude-kit moving FORWARD. That needs both trees, and a cloud container has only
 *               this one. `bash claude-kit/install.sh check <repo>` is the command that answers
 *               it, and it can only run where both exist.
 *
 * ⚠ THE TWO PARAGRAPHS ABOVE DESCRIBE THIS FILE BEFORE 2026-09-02 AND ARE KEPT FOR THE HISTORY.
 * THE CONTRACT LINE THAT USED TO SIT HERE HAD ROTTED INTO A FALSE STATEMENT and CEO 106 caught it:
 * it read "a PASS here means nobody has edited any copy", which is now the OPPOSITE of the truth —
 * the live repo prints `PASSED (with drift) — 2 ahead` with two files edited here, on purpose.
 * Two commits inverted the behaviour and neither touched the header, so the first thing the next
 * reader read was a behavioural claim the code contradicts. That is rule 6's other half, in the
 * one place a comment is genuinely load-bearing.
 *
 * WHAT A VERDICT MEANS NOW, and this is the line to keep true:
 *
 *   PASSED               nothing diverges from what was vendored.
 *   PASSED (with drift)  the project has moved its own copy — edited, deleted, or added a
 *                        kit-shaped file. NEWS, not a failure. His ruling.
 *   FAILED               an area could not be EXAMINED at all. The only fatal case.
 *
 * And on every path, still true and still the thing this file cannot do: whether CLAUDE-KIT has
 * moved forward is NOT answered here. See the note at the bottom for what changed about that.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

/* `--repo=<dir>` exists ONLY so a gate can drive this file's real code against real fixture trees,
 * the way can_push_check.mjs drives can_push.mjs. Without a seam the only subject available is this
 * repo, which today has no deleted file, no missing manifest and no stray role card — so every
 * branch below except one would be untested, and an untested branch in an instrument is how this
 * project keeps discovering a check was measuring something other than what it named. The default
 * is this repo, so nothing about the normal invocation changes. */
const repoArg = process.argv.find(a => a.startsWith("--repo="));
const REPO = repoArg
  ? path.resolve(repoArg.slice("--repo=".length))
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---- find every vendored area: any VENDORED-FROM file, anywhere, its sibling dir is the area ----
function findVendoredAreas(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { findVendoredAreas(abs, out); continue; }
    if (e.name === "VENDORED-FROM") out.push(path.dirname(abs));
  }
}
const areas = [];
findVendoredAreas(REPO, areas);
areas.sort();

if (areas.length === 0) {
  // NOT AN ERROR. A repo may legitimately vendor nothing; saying "PASS" would be a silent skip,
  // and saying "FAIL" would force every repo to carry something. Say what is true.
  console.log("vendor check — NOT APPLICABLE: no VENDORED-FROM file anywhere in this repo (nothing vendored)");
  process.exit(0);
}

const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/* ⚑ FOUR KINDS, NOT ONE LIST. Added 2026-09-02 to finish his ruling, and the WHY is the whole
 * point of the change: the inversion replaced a single `exit 1`, but the array that `exit 1` read
 * was fed by four unrelated conditions. Collapsing them meant a deleted file, a stray role card
 * and an area that could not be examined at all were every one of them announced as "this repo is
 * AHEAD of the kit" and counted into the back-port task list. Only ONE of the four is an edit.
 *
 *   AHEAD  a vendored file was edited here — HIS RULING. News, not a failure, and the real input
 *          to the batched back-port pass.
 *   GONE   a vendored file was deleted here. Also a local decision, so also not a failure — but
 *          there is nothing to promote upstream, and saying there is sends the back-port pass
 *          looking for an improvement that does not exist.
 *   STRAY  a kit-shaped role card that was never vendored, and will be lost on the next vendor
 *          pass. A warning about the future. Nothing here moved forward.
 *   BLIND  VENDORED-FROM with no MANIFEST.sha256 — THE CHECK CANNOT EXAMINE ITS SUBJECT.
 *          **This is the only fatal one, and it is fatal for the reason he gave: "do not also
 *          delete the check."** A gate that cannot see its subject must never print PASSED about
 *          it. HARD-WON-LESSONS.md §3: an instrument reporting nothing has told you something
 *          about ITSELF, not about the world. */
const findings = [];
const summaries = [];

for (const DST of areas) {
  const relDst = path.relative(REPO, DST).split(path.sep).join("/");
  const MANIFEST = path.join(DST, "MANIFEST.sha256");
  const STAMP = path.join(DST, "VENDORED-FROM");

  if (!fs.existsSync(MANIFEST)) {
    findings.push({ kind: "BLIND", area: relDst, rel: "MANIFEST.sha256",
      msg: `${relDst}: has VENDORED-FROM but no MANIFEST.sha256 — a vendored copy with no manifest cannot be checked at all. Re-run the vendor command named in its VENDORED-FROM file.` });
    continue;
  }

  const rows = fs.readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean).map(l => {
    const i = l.indexOf("  ");
    return { hash: l.slice(0, i), rel: l.slice(i + 2) };
  });

  const areaFound = [];
  for (const r of rows) {
    const abs = path.join(REPO, r.rel);
    if (!fs.existsSync(abs)) {
      areaFound.push({ kind: "GONE", area: relDst, rel: r.rel, msg: `DELETED here since vendoring: ${r.rel}` });
      continue;
    }
    if (sha(abs) !== r.hash) {
      areaFound.push({ kind: "AHEAD", area: relDst, rel: r.rel, msg: `this repo is AHEAD of the kit: ${r.rel}` });
    }
  }

  /* ADDED files count too — BUT ONLY THE ONES THE KIT OWNS, and getting that wrong is instructive.
     The first version of this check (org-only) flagged every file in .claude/agents/ not in the
     manifest, and its own red-proof immediately condemned 34 pre-existing GSD role cards that
     belong to this repo and have nothing to do with the kit. The prefix below is DERIVED from the
     manifest's own agent filenames rather than typed, so it cannot fall out of step with what the
     kit actually vendors — same logic, now run per-area rather than assuming there is only one. */
  const kitAgents = rows.map(r => r.rel).filter(r => r.startsWith(".claude/agents/"));
  const prefix = (() => {
    const names = kitAgents.map(r => path.posix.basename(r));
    if (!names.length) return null;
    let p = names[0];
    for (const n of names) { while (p && !n.startsWith(p)) p = p.slice(0, -1); }
    return p && p.length >= 3 ? p : null;
  })();
  const known = new Set(rows.map(r => r.rel));
  const agentsDir = path.join(REPO, ".claude", "agents");
  const notes = [];
  if (prefix && fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir)) {
      if (!f.startsWith(prefix)) continue;
      const rel = path.posix.join(".claude", "agents", f);
      if (!known.has(rel)) areaFound.push({ kind: "STRAY", area: relDst, rel,
        msg: `LOOKS LIKE A KIT ROLE CARD BUT IS NOT FROM THE KIT (lost on the next vendor): ${rel}` });
    }
    notes.push(`only files named ${prefix}* in .claude/agents/ are this area's business; ${fs.readdirSync(agentsDir).filter(f => !f.startsWith(prefix)).length} other agent(s) there belong elsewhere and were not examined`);
  }

  const stampLine = (fs.readFileSync(STAMP, "utf8").split("\n")[0] || "").trim() || "(no VENDORED-FROM stamp)";
  summaries.push({ relDst, stampLine, count: rows.length, notes, fail: areaFound });
  findings.push(...areaFound);
}

console.log(`vendor check — is any vendored-from-claude-kit copy edited in place?\n`);
console.log(`  vendored area(s) found: ${areas.length}\n`);
for (const s of summaries) {
  console.log(`  ${s.relDst}`);
  console.log(`    vendored from: ${s.stampLine}`);
  console.log(`    files checked: ${s.count}`);
  for (const n of s.notes) console.log(`    scope: ${n}`);
  if (s.fail.length === 0) console.log(`    PASS  all ${s.count} file(s) match the hash recorded when vendored`);
  console.log("");
}

/* ⚑ INVERTED 2026-09-02, WYATT'S RULING (question UI). THE PROJECT COPY IS THE TRUTH.
 *
 * HIS FRAMING: "claude-kit is intended to be a repo where the DESIGN of our system is made... but
 * our system must operate LOCALLY in its OWN REPO... at the beginning of a project, claude-kit is
 * added to it. then all of the instructions and processes in claude-kit start running within the
 * project's repo." The kit is upstream DESIGN, not a runtime dependency — so a local edit is the
 * system working, and blocking it was backwards.
 *
 * WHAT THIS CHECK USED TO DO: exit 1 on any local edit. WHAT IT COST, measured: five patches
 * dammed in PENDING-KIT-PATCHES.md, two of them his own rulings — including the Chartkeeper he
 * asked for four times, and moving The Lesson below Tasks, which he asked for FIVE times and which
 * never moved because no session that could see the ask was allowed to make the edit.
 *
 * WHY IT IS NOT DELETED: he was offered "delete it entirely" and chose "invert it". The drift
 * signal is the point; only its DIRECTION was wrong. A divergence is now news about the KIT being
 * behind — a condition that has already happened unnoticed (claude-kit commit 8691117: "the kit's
 * glass.mjs was 104 lines behind the repo it vendors into").
 *
 * AND IT IS STILL A REAL CHECK, not a print statement: it hashes every vendored file and names
 * exactly which ones diverge, which is the input to his ruling 3 — the batched back-port pass that
 * promotes local improvements upstream. Its output IS that pass's task list.
 *
 * ⚑ FINISHED 2026-09-02T13:xxZ, the other half of the same ruling. The inversion above shipped at
 * 08:48Z as step 1 of an unrelated item, so it never went through a close gate and no reviewer ever
 * held it against the second half of his sentence: "DO NOT ALSO DELETE THE CHECK. Red-proof both
 * ways." What was actually shipped exited 0 on FOUR conditions, three of which are not edits — and
 * counted all four into the back-port task list. The worst of them printed "PASSED (with drift)"
 * for an area it had not examined at all. Gate: vendor_lock_inverted_check.mjs, 16 cases, six of
 * them red first. */
const byKind = k => findings.filter(f => f.kind === k);
const ahead = byKind("AHEAD"), gone = byKind("GONE"), stray = byKind("STRAY"), blind = byKind("BLIND");

for (const f of blind) console.log(`  CANNOT CHECK  [${f.area}] ${f.msg}`);
for (const f of ahead) console.log(`  DRIFT  [${f.area}] ${f.msg}`);
for (const f of gone)  console.log(`  GONE   [${f.area}] ${f.msg}`);
for (const f of stray) console.log(`  STRAY  [${f.area}] ${f.msg}`);
if (findings.length) console.log("");

if (ahead.length) {
  console.log(`  ${ahead.length} file(s) have moved on here and not yet in claude-kit.`);
  console.log("  That is the system working: the project owns its copy and the kit is upstream design.");
  console.log("  These files are the task list for the next back-port pass — generalise them and");
  console.log("  push them up. Do NOT revert them, and do NOT edit them in the kit first.");
}
/* Deliberately NOT folded into the sentence above. A deleted file and a stray role card are local
   decisions too, so neither fails the build — but neither is an improvement waiting to be promoted,
   and a back-port pass told otherwise goes looking for one and finds a hole. */
if (gone.length)  console.log(`  ${gone.length} vendored file(s) were DELETED here. Nothing to back-port; update the manifest if that was deliberate.`);
if (stray.length) console.log(`  ${stray.length} kit-shaped file(s) were never vendored and will be LOST on the next vendor pass.`);

/* ⚑ ON EVERY PATH, INCLUDING THE DRIFTED ONE. This line used to print only when there was no
   drift — so the run that had just handed the reader a confident paragraph about the kit was the
   one run that never admitted the kit question was untouched. That is the path where somebody is
   most likely to conclude it has been answered for them.

   ⚠ AND THE REASON IS PERMISSION, NOT POSSESSION — CEO 106, finding 4, and the correction matters
   more than the line. The first version said "only a MACHINE HOLDING claude-kit can", which sends
   the next reader looking for a different computer. **This machine holds it.** What a watch lacked
   was the right to read outside the repo, and Wyatt was asked and ruled "yes" on the Glass at
   2026-09-02T12:39:56Z. The fence was one missing `--add-dir` in `scripts/wyclau/bell.ps1`, and it
   is down as of this change. So this line is now a TODO with an owner, not a law of nature: the
   kit-behind detector is buildable by the first watch the Bell rings after that change, and until
   somebody builds it this file must keep saying plainly that it has not been built. */
console.log(`\nNOT CHECKED HERE: whether claude-kit has moved FORWARD. That needs both trees read together.`);
console.log(`  Run \`bash claude-kit/install.sh check <this repo> <module>\` from a session that can read both.`);
console.log(`  A watch may now do that — his ruling 2026-09-02T12:39:56Z; bell.ps1 passes --add-dir.`);

if (blind.length) {
  console.log(`\nFAILED — ${blind.length} vendored area(s) could not be examined at all.`);
  console.log("  This is the one condition that still fails the build, and it is not a change of");
  console.log("  heart about the lock: an area with no manifest is not a project that owns its copy,");
  console.log("  it is a check with no subject. Reporting PASSED about it would be deleting the");
  console.log("  check, which is the thing his ruling explicitly did not choose.");
  process.exit(1);
}

if (ahead.length || gone.length || stray.length) {
  console.log(`\nPASSED (with drift) — ${ahead.length} ahead, ${gone.length} deleted, ${stray.length} stray.`);
  process.exit(0);
}

console.log(`PASSED — no drift: all ${areas.length} vendored area(s) still match what was vendored.`);
