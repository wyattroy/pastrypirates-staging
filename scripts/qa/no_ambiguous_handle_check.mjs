#!/usr/bin/env node
/* no_ambiguous_handle_check.mjs — NO TWO OPEN ROWS MAY CARRY THE SAME HANDLE.
 *
 * WHY. `chartkeeper.mjs:860` is explicit: an ambiguous handle CLAIMS NOTHING. So while two open
 * rows share `T-079`, a ruling of his naming it speaks for neither, the ranker cannot score it, and
 * — the one that actually cost him something — **his dragged order named `T-079` three times and
 * could not say which row he had moved.** That is why the row he dragged to the top on
 * 2026-09-02 did not arrive there.
 *
 * Found and fixed that night: FOUR handles were each carried by two or three open rows — `T-008`,
 * `T-079` (x3), `T-088`, `T-105`. The later rows were renumbered `T-124`–`T-128`. This gate is what
 * stops the fifth.
 *
 * HANDLES ARE NEVER REUSED, which is what makes renumbering safe: `T-079` still resolves in
 * `CHART-LOG.md` and in git history, so an old reference lands on the archived row rather than
 * nowhere.
 */
"use strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHART = join(ROOT, ".planning", "CHART.md");
let failed = 0;
const ok = (m) => console.log(`  PASS -- ${m}`);
const bad = (m) => { console.log(`  FAIL -- ${m}`); failed++; };

const HANDLE = /⟨`(T-\d+)`⟩/g;

/* Open rows only. A CLOSED row keeping its handle is the whole point of never reusing them. */
function openRows(src) {
  const starts = [...src.matchAll(/^- \[ \]/gm)].map((m) => m.index);
  starts.push(src.length);
  const out = [];
  for (let i = 0; i < starts.length - 1; i++) {
    /* ⛔ A ROW ENDS AT THE NEXT SECTION HEADING TOO, NOT ONLY AT THE NEXT ROW.
     * Slicing straight to the next "- [ ]" makes the LAST row before a heading swallow everything
     * under it -- and CHART.md's BLOCKED ON WYATT table carries handles, one per question
     * (`| <!--qid:t017-name-type-too-small--> ⟨`T-017`⟩ ...`). So whichever row happened to sit last
     * before that table was reported as carrying T-017 and colliding with the row that really owns
     * it. The accused row CHANGED as rows moved -- first "Your ruling: the cutover moment", then a
     * restored ruling row -- which is the tell that the finding was about POSITION, not ownership.
     * A handle in his question table is a REFERENCE. Only a row's own handle line is a claim. */
    let seg = src.slice(starts[i], starts[i + 1]);
    const head = seg.search(/^## /m);
    if (head > 0) seg = seg.slice(0, head);
    out.push({ seg, title: seg.split("\n")[0].replace(/^- \[ \]\s*/, "").slice(0, 70) });
  }
  return out;
}

console.log("no_ambiguous_handle_check — two open rows may never carry the same handle\n");

if (!existsSync(CHART)) {
  bad("no .planning/CHART.md — the file this gate guards is missing, which is not a pass");
} else {
  const src = readFileSync(CHART, "utf8");
  const rows = openRows(src);
  const by = new Map();
  for (const r of rows) {
    for (const h of new Set([...r.seg.matchAll(HANDLE)].map((m) => m[1]))) {
      if (!by.has(h)) by.set(h, []);
      by.get(h).push(r.title);
    }
  }
  const dups = [...by.entries()].filter(([, v]) => v.length > 1);
  if (dups.length) {
    bad(`${dups.length} handle(s) are carried by more than one OPEN row — each claims nothing:\n` +
        dups.map(([h, v]) => `         ${h} on ${v.length} rows:\n` + v.map((t) => `           - ${t}`).join("\n")).join("\n") +
        `\n         Give every row but the first a fresh handle (highest in use + 1) and write the reason into it.`);
  } else {
    ok(`every handle on the Chart is unique across ${rows.length} open rows (${by.size} handles)`);
  }

  /* RED-PROOF. A gate that cannot fail is not a gate — this project has shipped three of those and
     spent days on each. Prove the detector fires on a fixture holding the exact shape it guards. */
  const fixture = "- [ ] **row one**\n      ⟨`T-900`⟩\n- [ ] **row two**\n      ⟨`T-900`⟩\n";
  const fr = openRows(fixture);
  const fb = new Map();
  for (const r of fr) for (const h of new Set([...r.seg.matchAll(HANDLE)].map((m) => m[1]))) {
    if (!fb.has(h)) fb.set(h, []); fb.get(h).push(r.title);
  }
  const caught = [...fb.values()].some((v) => v.length > 1);
  const clean = "- [ ] **a**\n      ⟨`T-901`⟩\n- [ ] **b**\n      ⟨`T-902`⟩\n";
  const cr = openRows(clean);
  const cb = new Map();
  for (const r of cr) for (const h of new Set([...r.seg.matchAll(HANDLE)].map((m) => m[1]))) {
    if (!cb.has(h)) cb.set(h, []); cb.get(h).push(r.title);
  }
  const quiet = ![...cb.values()].some((v) => v.length > 1);
  if (!caught) bad("red-proof: the detector did NOT catch a fixture with one handle on two open rows");
  else if (!quiet) bad("red-proof: the detector fired on a fixture whose handles are all distinct");
  else ok("red-proof: catches a duplicate fixture, silent on a clean one");
}

console.log(failed ? `\nFAIL -- ${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
