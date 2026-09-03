#!/usr/bin/env node
/* assign_handles.mjs — EVERY ROW ON HIS CHART CAN BE NAMED, so every row can be moved.
 *
 * HIS WORDS, 2026-09-03: *"it looks like not all the Glass Chart rows have buttons next to them
 * that allow them to be moved up; but they all need to be moveable. can you explain why, and design
 * an elegant solution?"* — and, given the options, he picked this one: **give every row a real tag**,
 * rather than teach the page to cope with rows that have none.
 *
 * WHY A ROW WITHOUT A TAG CANNOT MOVE, which is the whole explanation in one sentence:
 * **the order is saved as a list of TASK TAGS, but the thing he orders is ROWS — and there are more
 * rows than tags.** A saved order that says "T-017 first" cannot say WHICH of two rows carrying
 * T-017 he meant, so the page refuses to move either. Measured on his live page: 40 of 67 rows had
 * no button, in three kinds —
 *    6  checklist rows with no ⟨T-nnn⟩ at all
 *   10  rows whose tag is shared with another OPEN row (T-017, T-102, T-207, T-216, T-206, each x2)
 *   the rest  IDEA INBOX rows, which `glass.mjs` handed `handle: null` unconditionally
 *
 * ⛔ HANDLES ARE ALLOCATED ONCE AND NEVER REUSED. `chart_sweep_conserves_check` treats a handle
 * owned by nothing as a row that has fallen out of both records — "the one failure a sweep cannot
 * undo". So the next number is taken from the highest EVER seen across every chart AND the log,
 * never from the highest currently open, and a split takes a FRESH number rather than recycling.
 *
 * ⚠ AND A SPLIT CHANGES ONE ROW'S IDENTITY, which is the risk he accepted. The FIRST carrier keeps
 * the original tag — history in `CHART-LOG.md`, `CTO-LEDGER.md` and `CEO-REVIEWS.md` refers to it —
 * and later carriers take new numbers. The split is announced so a reader can follow it.
 *
 * USAGE:  node scripts/wyclau/assign_handles.mjs            # dry run: says what it would do
 *         node scripts/wyclau/assign_handles.mjs --write    # do it
 * EXIT: 0 (nothing to do, or done) · 1 refused, and nothing was written
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WRITE = process.argv.includes("--write");
const CHARTS = [".planning/CHART.md", ".planning/GLASS-CHART.md"].filter((f) => existsSync(join(ROOT, f)));
const SCAN = [...CHARTS, ".planning/CHART-LOG.md"].filter((f) => existsSync(join(ROOT, f)));
const NL = String.fromCharCode(10);

/* THE HIGH-WATER MARK, and it must come from OWNERSHIP, not from any mention of the string "T-nnn".
   `GLASS-CHART.md` quotes `T-802` inside a sentence about chartkeeper FIXTURE OUTPUT; reading that
   as an allocation would jump the counter by 582 and make every future gap check meaningless. Only
   a row's own token line, or an archive heading, counts as an allocation. */
let high = 0;
for (const f of SCAN) {
  const md = readFileSync(join(ROOT, f), "utf8");
  for (const m of md.matchAll(/^\s*⟨`T-(\d{3})`[^⟩]*⟩\s*$/gm)) high = Math.max(high, +m[1]);
  for (const m of md.matchAll(/^## T-(\d{3}) — /gm)) high = Math.max(high, +m[1]);
}
if (!high) { console.log("REFUSING — found no allocated handle anywhere; that cannot be right, and guessing a start would risk reuse."); process.exit(1); }
let next = high + 1;
const fresh = () => `T-${String(next++).padStart(3, "0")}`;

/* ⛔ ONLY THE ROWS HIS PAGE ACTUALLY SHOWS — and this scoping is the whole difference between a
 * useful pass and a mess. His ask is about *"the Glass Chart rows"*, the list he is looking at.
 * The FIRST version of this file read every bullet in both sections and proposed **32** handles,
 * most of them for historical harvested notes — *"Wyatt, written on the Glass, 2026-09-02…"* — that
 * are already SHIPPED and are records, not work. Minting twenty task numbers for finished things
 * would inflate his Chart to fix a page.
 *
 * So the row set is taken from the SAME RULE `glass.mjs` renders by (`stateOf`, from the shared
 * chart model): every open checklist row, plus every inbox idea whose fate is not `finished`.
 * Rule 23 — the page and the thing that prepares the page must not each decide what a row is. */
import { stateOf } from "./lib/chart_model.mjs";

/* ⛔ ROWS ARE LOCATED BY LINE, NEVER BY THEIR TEXT. The first version edited with
 * `md.replace(rowText, …)`, and this Chart contains rows whose prose is WORD-FOR-WORD identical —
 * a "Your ruling:" checklist row and the same ruling's entry in the `## RULED` table. So the
 * replace patched the first match, which was a different row, and welded a handle onto a bullet:
 *     ⟨`T-235`⟩- [ ] Your ruling: …
 * That silently removed a row from his list. The structural guard below caught it, his Chart was
 * restored from a backup, and the model became positional. **A file with duplicate blocks cannot be
 * edited by matching text.**
 */
function parseRows(md) {
  const L = md.split(NL);
  const heads = [];
  L.forEach((l, i) => { if (/^## /.test(l)) heads.push(i); });
  const bounds = (name) => {
    const at = L.findIndex((l) => new RegExp(`^## ${name}`).test(l));
    if (at < 0) return null;
    const next = heads.find((h) => h > at);
    return [at + 1, next === undefined ? L.length : next];
  };
  const rows = [];
  const collect = (range, kind, startRe) => {
    if (!range) return;
    const [a, b] = range;
    let cur = null;
    for (let i = a; i < b; i++) {
      if (startRe.test(L[i])) { if (cur) { cur.end = i; rows.push(cur); } cur = { kind, start: i, end: b }; }
    }
    if (cur) rows.push(cur);
  };
  collect(bounds("STEP 1 CHECKLIST"), "task", /^- \[ \] /);
  collect(bounds("THE IDEA INBOX"), "idea", /^[-*] (?!\[)/);
  for (const r of rows) {
    r.lines = L.slice(r.start, r.end);
    r.text = r.lines.join(NL);
    /* The OWNER line: the handle alone on a line. An inline ⟨T-nnn⟩ earlier in the prose is a
       REFERENCE to what the row is about, and renaming that would change its subject. */
    r.ownerAt = -1;
    for (let i = 0; i < r.lines.length; i++) {
      const m = r.lines[i].match(/^\s*⟨`(T-\d{3})`[^⟩]*⟩\s*$/);
      if (m) { r.ownerAt = r.start + i; r.owner = m[1]; break; }
    }
    r.token = r.owner ?? (r.text.match(/⟨`(T-\d{3})`[^⟩]*⟩/) || [])[1] ?? null;
  }
  return { L, rows };
}

function liveRows(md) {
  const { L, rows } = parseRows(md);
  return { L, rows: rows.filter((r) => r.kind === "task" || stateOf(r.text) !== "finished") };
}

const plan = [];
for (const f of CHARTS) {
  const md = readFileSync(join(ROOT, f), "utf8");
  const { rows } = liveRows(md);
  const seen = new Map();
  for (const r of rows) {
    if (!r.token) { plan.push({ f, r, why: "no tag at all", give: fresh() }); continue; }
    const n = (seen.get(r.token) || 0) + 1;
    seen.set(r.token, n);
    if (n > 1) plan.push({ f, r, why: `shares ${r.token} with an earlier open row`, give: fresh(), was: r.token });
  }
}

if (!plan.length) { console.log("every open row already carries a unique tag — nothing to assign."); process.exit(0); }

console.log(`${plan.length} row(s) cannot be named today. Next free handle: T-${String(high + 1).padStart(3, "0")}.${NL}`);
for (const p of plan) {
  const title = p.r.lines[0].replace(/^[-*] (\[ \] )?/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/[*`]/g, "").trim().slice(0, 62);
  console.log(`  ${p.give}  <- ${p.why.padEnd(38)} | ${title}`);
}
if (!WRITE) { console.log(`${NL}DRY RUN — nothing written. Re-run with --write to apply.`); process.exit(0); }

for (const f of CHARTS) {
  const path = join(ROOT, f);
  const before = readFileSync(path, "utf8");
  const { L } = parseRows(before);
  const mine = plan.filter((p) => p.f === f).sort((a, b) => b.r.start - a.r.start);   // BOTTOM UP, so indices hold
  for (const p of mine) {
    if (p.was && p.r.ownerAt >= 0) {
      L[p.r.ownerAt] = L[p.r.ownerAt].replace(/⟨`T-\d{3}`/, `⟨\`${p.give}\``);
    } else {
      /* ⚑ A ROW CAN SHARE A TAG AND STILL HAVE NO OWNER LINE — it mentions ⟨T-102⟩ in its prose and
         never declares an identity of its own. The first version SKIPPED those "rather than guessing
         where its identity lives", which sounded careful and left one row unmoveable. There is no
         guess to make: it has no identity, so it is given one, exactly like a row with no tag at
         all. Its inline reference is untouched — the row is still ABOUT that task. */
      /* Insert the owner line straight after the row's LAST non-empty line, so it lands inside the
         row and never against the next row's bullet. */
      let last = p.r.end - 1;
      while (last > p.r.start && !L[last].trim()) last--;
      L.splice(last + 1, 0, `      ⟨\`${p.give}\`⟩`);
    }
  }
  if (!mine.length) continue;
  const after = L.join(NL);
  /* PROVE IT ONLY ADDED IDENTITY. Two structural facts must survive exactly. */
  const rb = (before.match(/^- \[ \] /gm) || []).length;
  const ra = (after.match(/^- \[ \] /gm) || []).length;
  const glued = /⟨`T-\d{3}`[^⟩]*⟩[ \t]*[-*] \[/.test(after);
  if (ra !== rb || glued) {
    console.log(`REFUSING to write ${f} — checklist rows ${rb} -> ${ra}${glued ? ", and a handle is welded to a bullet" : ""}. Nothing written.`);
    process.exit(1);
  }
  writeFileSync(path, after);
}

/* COUNTED BACK OFF DISK, never from the loop. */
let stillUnnamed = 0;
for (const f of CHARTS) {
  const { rows } = liveRows(readFileSync(join(ROOT, f), "utf8"));
  const seen = new Map();
  for (const r of rows) {
    if (!r.token) { stillUnnamed++; continue; }
    const n = (seen.get(r.token) || 0) + 1; seen.set(r.token, n);
    if (n > 1) stillUnnamed++;
  }
}
console.log(`${NL}wrote handles. Rows still unnameable, counted from the files: ${stillUnnamed}.`);
process.exit(0);
