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
 * So a PASS here means "nobody has edited any copy", NOT "every copy is current". The two are
 * different claims and the gate must never let the first stand in for the second.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
const fail = [];
const summaries = [];

for (const DST of areas) {
  const relDst = path.relative(REPO, DST).split(path.sep).join("/");
  const MANIFEST = path.join(DST, "MANIFEST.sha256");
  const STAMP = path.join(DST, "VENDORED-FROM");

  if (!fs.existsSync(MANIFEST)) {
    fail.push(`${relDst}: has VENDORED-FROM but no MANIFEST.sha256 — a vendored copy with no manifest cannot be checked at all. Re-run the vendor command named in its VENDORED-FROM file.`);
    continue;
  }

  const rows = fs.readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean).map(l => {
    const i = l.indexOf("  ");
    return { hash: l.slice(0, i), rel: l.slice(i + 2) };
  });

  const areaFail = [];
  for (const r of rows) {
    const abs = path.join(REPO, r.rel);
    if (!fs.existsSync(abs)) { areaFail.push(`DELETED since vendoring: ${r.rel}`); continue; }
    if (sha(abs) !== r.hash) areaFail.push(`EDITED IN PLACE: ${r.rel}`);
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
      if (!known.has(rel)) areaFail.push(`LOOKS LIKE A KIT ROLE CARD BUT IS NOT FROM THE KIT (lost on the next vendor): ${rel}`);
    }
    notes.push(`only files named ${prefix}* in .claude/agents/ are this area's business; ${fs.readdirSync(agentsDir).filter(f => !f.startsWith(prefix)).length} other agent(s) there belong elsewhere and were not examined`);
  }

  const stampLine = (fs.readFileSync(STAMP, "utf8").split("\n")[0] || "").trim() || "(no VENDORED-FROM stamp)";
  summaries.push({ relDst, stampLine, count: rows.length, notes, fail: areaFail });
  fail.push(...areaFail.map(f => `[${relDst}] ${f}`));
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

if (fail.length) {
  for (const f of fail) console.log(`  FAIL  ${f}`);
  console.log("\n  Edit these in claude-kit, never here, then re-vendor. If the change was");
  console.log("  deliberate and belongs to this repo alone, it does not belong in a vendored area.");
  console.log("\nFAILED — at least one vendored copy has been changed inside this repo.");
  process.exit(1);
}

console.log(`PASSED — nobody has edited any of the ${areas.length} vendored area(s). That is not the same as any of them being current.`);
console.log(`NOT CHECKED, and only a machine holding claude-kit can: whether the kit has moved forward. Run its own "check" command from there.`);
