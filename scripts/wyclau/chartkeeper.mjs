#!/usr/bin/env node
/* chartkeeper.mjs — THE CHART RE-PRIORITISES ITSELF. Three passes, and it never closes anything.
 *
 * WYATT ASKED FOR THIS FOUR TIMES AND THE FIRST THREE ARE STILL ON THE CHART MARKED "SCHEDULED".
 * 2026-09-02T00:59:32Z, 03:45:45Z, 03:46:13Z, 03:49:02Z, then in full:
 *   "audit the chart ('tasks') which has MANY completed tasks still stale on it, and design ... a
 *    system that will dynamically reprioritize it, update it, and move things around it that is
 *    built into this process somehow -- either with the Glass Update Session, or in the watch."
 * The fix for the Chart's inability to re-prioritise was itself filed on the Chart and never rose.
 * That is the acceptance test, and it is why the ranking's loudest signal is HOW OFTEN HE HAS
 * RAISED IT.
 *
 * Spec: `.planning/SPEC-CHARTKEEPER.md` (written by the Advisor, verified by CEO 89).
 *
 * THE THREE PASSES
 *   REAP   finds rows whose POINTER is dead — a question that has been answered, a report that was
 *          never written, a pid that is not running, a build stamp older than the tree. It FLAGS.
 *          IT NEVER TICKS A BOX. Ticking is a claim about WORK; the reaper only ever measures the
 *          pointer. `mark_glass_published.mjs` is the cautionary tale two files away: a stamp that
 *          could only say one thing recorded a publish that had not happened.
 *   RANK   orders the open list from signals derived entirely from the repo, and gives every row a
 *          `why-now:` phrase — because an order he cannot read is an order he cannot overrule.
 *   SWEEP  moves done rows older than seven days into `.planning/CHART-LOG.md`, leaving a one-line
 *          stub. The Chart stops growing, nothing is lost, and "done" starts meaning "done this
 *          week" instead of a number that only ever goes up.
 *
 * WHERE IT RUNS (the spec's split, and the split is the point): RANK and SWEEP in the WATCH, which
 * has write authority and a CEO gate — arithmetic can act unattended. REAP in report mode in the
 * Glass-update session, which is the only session that reads his live page — judgement belongs
 * where a human is looking.
 *
 * USAGE
 *   node scripts/wyclau/chartkeeper.mjs                      # report on everything, touch nothing
 *   node scripts/wyclau/chartkeeper.mjs --reap --json        # the Glass-update session's pass
 *   node scripts/wyclau/chartkeeper.mjs --rank --sweep --write   # the Watch's pass
 *   --chart=<path> --log=<path> --now=<iso>                  # for gates and fixtures
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ID_RE, bodyOf, chunk, overlap, parseChart, replaceSection, titleOf, tokens,
} from "./lib/chart_model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const abs = (p) => (isAbsolute(p) ? p : resolve(ROOT, p));

const CHART = abs(opt("chart", join(ROOT, ".planning", "CHART.md")));
const LOG = abs(opt("log", join(ROOT, ".planning", "CHART-LOG.md")));
const NOW = new Date(opt("now", new Date().toISOString()));
const JSON_OUT = flag("json");
const WRITE = flag("write");
// No pass named means all three, in report mode — the safe default for a session that just looks.
const anyPass = flag("reap") || flag("rank") || flag("sweep");
const DO = { reap: !anyPass || flag("reap"), rank: !anyPass || flag("rank"), sweep: !anyPass || flag("sweep") };

if (!existsSync(CHART)) {
  console.error(`chartkeeper: no Chart at ${CHART}`);
  process.exit(2);
}
const original = readFileSync(CHART, "utf8");

/* ⚠ THE KEEPER'S OWN OUTPUT IS STRIPPED BEFORE IT READS ANYTHING. Found by the gate, not by
   reasoning, and it is the sharpest thing in this file: the first version appended a flag reading
   "measured on build 2000.01.01.1; the tree is 2026.09.01.8" — and on the NEXT run the probe found
   the tree's own stamp in the row it had just annotated, concluded the evidence was current, and
   silently withdrew the flag. A row would flap between flagged and clear forever, and CHART.md
   would change on every single watch, conflicting on every push.
   THE GENERAL FORM, which is worth more than the bug: an instrument that writes into the thing it
   measures is measuring itself one run later. So the flags are treated as pure OUTPUT — removed
   from the input, re-derived from scratch every run, and re-attached on the write. A flag that
   stops being true therefore disappears on its own, with nobody having to remember to delete it. */
const STALE_MARK = "⚠ STALE-CANDIDATE —";
const input = original.split("\n").filter((l) => !l.includes(STALE_MARK)).join("\n");
let text = input;

/* ── THE TREE'S OWN FACTS. Everything REAP and RANK judge against is read here, once, from the
   repo — never from a stored list. Rule 9: a hand-kept list of what to guard rots exactly like the
   thing it guards. ── */
const treeStamp = (() => {
  try {
    return (/PP4_STAMP\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "src", "ui", "stage.js"), "utf8")) || [])[1] ?? null;
  } catch { return null; }
})();
const inboxWords = (() => {
  // His words, verbatim, in the Inbox — the best available proxy for what he cares about, and it is
  // already on disk with timestamps. One token-set per entry.
  try {
    const raw = readFileSync(join(ROOT, ".planning", "wyclau", "INBOX.md"), "utf8");
    return raw.split(/^## INBOX-/m).slice(1).map((b) => tokens(b.slice(0, 1200)));
  } catch { return []; }
})();

const parsed = parseChart(text);
const openItems = parsed.tasks;

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 1 — REAP. Ask the WORLD a question about the row's pointer; never read a stored flag.
   Each probe returns a reason string or null. A row with no pointers in it can never be flagged,
   which is how the Chartkeeper is able to say "the Chart is fine" (guardrail 4).
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const blockedTokens = parsed.blockedQuestions.map((q) => tokens(q));

const pidAlive = (pid) => {
  // process.kill(pid, 0) is the portable liveness probe; EPERM means the process exists and is
  // simply not ours. `tasklist` is refused by this machine's sandbox, so this is the only route.
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};

const PROBES = [
  function deadPointerToWyatt(row) {
    if (!/BLOCKED ON WYATT/i.test(row.raw)) return null;
    const mine = tokens(row.raw);
    if (blockedTokens.some((q) => overlap(q, mine) >= 3)) return null;
    return parsed.blockedQuestions.length === 0
      ? "points at BLOCKED ON WYATT, which is empty — the question it is waiting on has been answered"
      : "points at BLOCKED ON WYATT, but no question there matches it any more — it was answered and nothing moved the row";
  },
  function reportNeverWritten(row) {
    const cited = row.raw.match(/[.\w/-]*SEA-TRIAL[\w.-]*\.md/g) || [];
    const missing = cited.map((c) => c.replace(/^`|`$/g, "")).filter((c) => !existsSync(abs(c.startsWith(".planning") ? c : join(".planning", c))));
    return missing.length ? `cites a trial report that is not on disk: ${missing[0]}` : null;
  },
  function pidLongDead(row) {
    const m = /\bpid\s+(\d{2,7})\b/i.exec(row.raw);
    if (!m) return null;
    return pidAlive(Number(m[1])) ? null : `warns readers off on account of pid ${m[1]}, which is not running`;
  },
  function evidenceRetired(row) {
    if (!treeStamp) return null;
    const stamps = [...new Set(row.raw.match(/\b20\d\d\.\d\d\.\d\d\.\d+\b/g) || [])];
    if (!stamps.length) return null;
    const older = stamps.filter((s) => s < treeStamp);
    if (!older.length || stamps.includes(treeStamp)) return null;
    return `measured on build ${older[0]}; the tree is ${treeStamp}, so its evidence no longer describes this game`;
  },
  function supersededByAnotherRow(row) {
    const mine = tokens(row.title);
    for (const other of openItems) {
      if (other === row) continue;
      const m = /supersedes ([^.*)\n]{6,80})/i.exec(other.raw);
      if (!m) continue;
      if (overlap(tokens(m[1]), mine) >= 2) return `superseded — the row "${other.title.slice(0, 60)}" says in its own text that it supersedes this`;
    }
    return null;
  },
];

const reap = [];
if (DO.reap) {
  for (const row of openItems) {
    const reasons = PROBES.map((p) => p(row)).filter(Boolean);
    if (reasons.length) reap.push({ id: row.id, kind: row.kind, title: row.title, reason: reasons.join("; ") });
  }
}
const reapById = new Map(reap.map((r) => [r.title, r.reason]));

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 2 — RANK. Every signal is derived from the repo, and every signal contributes a phrase to
   `why-now:`. The tie-break is the TITLE, never the file position: a ranking that reads position
   is a ranking that only looks like it works (the gate proves this by ranking the same rows from
   two different file orders and demanding the same answer).
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const HEAD = /⟨([^⟩]*)⟩/;
const headField = (row, name) => {
  const m = HEAD.exec(row.lines[0]);
  if (!m) return null;
  const f = new RegExp(`${name}\\s*:\\s*([^·⟩]+)`).exec(m[1]);
  return f ? f[1].trim() : null;
};

function score(row) {
  const why = [];
  let s = 0;
  const gated = /\bGATED:/.test(row.raw);
  const needsWyatt = (headField(row, "needs") || "").toLowerCase() === "wyatt";
  const livePointer = /BLOCKED ON WYATT/i.test(row.raw) && !reapById.has(row.title);

  // BLOCKED SINKS TO THE BOTTOM, ALWAYS. The spec: "this alone fixes most of the present list."
  if (gated || needsWyatt || livePointer) {
    s -= 1000;
    why.push(gated ? "blocked (GATED)" : livePointer ? "waiting on your answer" : "needs you");
  }

  // APPROVED AND UNBLOCKED FLOATS TO THE VERY TOP — a decision he has already made, sitting undone,
  // is the most expensive row on the list. This is the one that would have surfaced the staging
  // permission line four hours before anybody noticed it.
  if (!gated && !livePointer && /\bruled YES\b|\bhe ruled\b|\bhis ruling\b|\bRULED YES\b|\byour ruling\b/i.test(row.raw)) {
    s += 100;
    why.push("approved and unblocked");
  }

  // LOOKS FINISHED. A stale candidate is cheap to close and is inflating the count he steers by.
  if (reapById.has(row.title)) { s += 40; why.push("looks finished — needs a verdict, not work"); }

  // PLAYER-FACING OUTRANKS INSTRUMENT-FACING. This is the rulebook's own THE POINT, made
  // mechanical: "is the game better than it was this morning, in a way a player would notice?"
  if (/`?(?:src\/[\w/.-]+|index\.html)`?/.test(row.raw)) { s += 30; why.push("a player can see it"); }

  // EVIDENCE RETIRED — the measurement no longer describes the tree, so the row is arguing about a
  // build nobody is running.
  if (treeStamp) {
    const stamps = row.raw.match(/\b20\d\d\.\d\d\.\d\d\.\d+\b/g) || [];
    if (stamps.length && !stamps.includes(treeStamp) && stamps.every((x) => x < treeStamp)) {
      s -= 20; why.push("evidence retired");
    }
  }

  // HOW OFTEN HE HAS RAISED IT. Timestamped, already on disk, and the best proxy there is for what
  // he cares about. Three sightings of the trade circle; four asks for this very tool.
  const mine = tokens(row.raw.slice(0, 900));
  const raised = inboxWords.filter((w) => overlap(w, mine) >= 4).length;
  if (raised) { s += 8 * raised; why.push(`you have raised it ${raised === 1 ? "once" : `${raised} times`}`); }

  // SIZE — a tie-break only, small first, so the queue drains.
  const size = (headField(row, "size") || "").toUpperCase();
  if (size === "S") { s += 3; why.push("small"); }
  if (size === "L") { s -= 3; }

  if (!why.length) why.push("no signal either way");
  return { s, whyNow: why.join(" · ") };
}

const ranked = openItems
  .map((row) => ({ row, ...score(row) }))
  .sort((a, b) => (b.s - a.s) || a.row.title.localeCompare(b.row.title))
  .map((x, i) => ({ rank: i + 1, id: x.row.id, kind: x.row.kind, title: x.row.title, score: x.s, whyNow: x.whyNow, row: x.row }));

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 3 — SWEEP. A done row leaves only when its age can be ESTABLISHED. If no date can be read
   out of the row, it stays — an archiver that guesses at ages will eventually archive something
   that was finished this morning, and that is a worse failure than a long Chart.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const lastDateIn = (s) => {
  const all = s.match(/\b20\d\d-\d\d-\d\d\b/g) || [];
  if (!all.length) return null;
  return all.map((d) => new Date(`${d}T00:00:00Z`)).sort((a, b) => b - a)[0];
};
const sweepable = DO.sweep
  ? parsed.doneRows.map((r) => ({ row: r, when: lastDateIn(r.raw) }))
      .filter((x) => x.when && NOW - x.when > SEVEN_DAYS)
  : [];

/* ────────────────────────────────────────────────────────────────────────────────────────────
   THE WRITE. Everything above is a reading; only this section changes the file, only under
   --write, and it is IDEMPOTENT by construction — ids are allocated once, stale flags are removed
   before being re-added, and rows are placed into the SAME open-row slots the file already has.
   Idempotence is not tidiness here: two sessions share this branch, and a rewrite that differs
   every run conflicts on every push.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
function stripStale(lines) {
  return lines.filter((l) => !l.includes(STALE_MARK));
}
function withId(lines, id) {
  if (ID_RE.test(lines[0])) return lines;
  const out = lines.slice();
  out[0] = out[0].replace(/^(- \[[ xX]\] |[-*] )/, (m) => `${m}\`${id}\` `);
  return out;
}
function withStale(lines, reason) {
  const out = lines.slice();
  out.push(`      ${STALE_MARK} ${reason}`);
  return out;
}

let wrote = { ids: 0, flags: 0, reordered: 0, archived: 0 };

if (WRITE) {
  // 1. ALLOCATE IDS. Never reused: the next id is one past the highest that has ever appeared in
  //    either file, so a row archived last week can never have its handle handed to a new row.
  const seen = [
    ...(text.match(/`T-(\d{3})`/g) || []),
    ...(existsSync(LOG) ? (readFileSync(LOG, "utf8").match(/`T-(\d{3})`/g) || []) : []),
  ].map((m) => Number(m.slice(3, 6)));
  let next = (seen.length ? Math.max(...seen) : 0) + 1;
  const nextId = () => `T-${String(next++).padStart(3, "0")}`;

  const rebuild = (chunks, marker, sectionRows) => {
    // Slots: which chunk positions currently hold an OPEN row. Ranked rows are placed back into
    // those same slots, so headings, prose and done rows never move — the file's structure is
    // untouched and only the ORDER of the open list changes.
    const out = chunks.map((c) => ({ ...c, lines: c.lines.slice() }));
    const slots = [];
    for (let i = 0; i < out.length; i++) {
      if (out[i].type !== "row") continue;
      const done = marker === "checklist" ? /^- \[[xX]\]/.test(out[i].lines[0]) : null;
      if (done === false) slots.push(i);
    }
    const order = ranked.filter((r) => r.kind === marker);
    if (slots.length === order.length) {
      for (let k = 0; k < slots.length; k++) {
        const before = out[slots[k]].lines.join("\n");
        out[slots[k]] = { type: "row", lines: order[k].row.lines.slice() };
        if (out[slots[k]].lines.join("\n") !== before) wrote.reordered++;
      }
    }
    // 2. Ids and stale flags, applied AFTER placement so they follow the row, not the slot.
    for (const i of slots) {
      let lines = stripStale(out[i].lines);
      if (!ID_RE.test(lines[0])) { lines = withId(lines, nextId()); wrote.ids++; }
      const title = titleOf(lines);
      const reason = reapById.get(title);
      if (reason) { lines = withStale(lines, reason); wrote.flags++; }
      out[i].lines = lines;
    }
    // Done rows get ids too — an archive stub needs a handle to point at.
    for (let i = 0; i < out.length; i++) {
      if (out[i].type !== "row" || slots.includes(i)) continue;
      if (!ID_RE.test(out[i].lines[0])) { out[i].lines = withId(out[i].lines, nextId()); wrote.ids++; }
    }
    return out;
  };

  let stepOut = rebuild(parsed.stepChunks, "checklist");
  const inboxOut = rebuild(parsed.inboxChunks, "inbox");

  // 3. SWEEP. The row's full text goes to the archive; a one-line stub stays behind so a reader
  //    following an old reference lands somewhere rather than nowhere. The stub is NOT a checkbox,
  //    which is what makes the `done` count start meaning "done this week".
  if (DO.sweep && sweepable.length) {
    const stamps = [];
    stepOut = stepOut.map((c) => {
      if (c.type !== "row") return c;
      const hit = sweepable.find((x) => titleOf(x.row.lines) === titleOf(c.lines));
      if (!hit) return c;
      const id = (ID_RE.exec(c.lines[0]) || [])[1] ?? "T-???";
      const when = hit.when.toISOString().slice(0, 10);
      const ceo = (/CEO\s*(?:Review\s*)?(\d{1,3})/i.exec(c.lines.join(" ")) || [])[1];
      stamps.push({ id, when, title: titleOf(c.lines), text: c.lines.join("\n") });
      wrote.archived++;
      return {
        type: "prose",
        lines: [`  ↳ \`${id}\` ${when}${ceo ? ` · CEO ${ceo}` : ""} · ${titleOf(c.lines).slice(0, 90)} → [CHART-LOG](CHART-LOG.md)`],
      };
    });
    const header = existsSync(LOG) ? readFileSync(LOG, "utf8") : `# THE CHART LOG — closed rows, kept forever

*Rows the Chartkeeper swept off [\`CHART.md\`](CHART.md) after seven days done. Nothing is lost
here: the full text of every row is below, under the handle the Chart still points at. Swept by
\`scripts/wyclau/chartkeeper.mjs --sweep --write\`, never by hand.*
`;
    const added = stamps.map((s) => `\n## ${s.id} — ${s.when} — ${s.title}\n\n${s.text}\n`).join("");
    writeFileSync(LOG, header + added);
  }

  const join_ = (chunks) => chunks.map((c) => c.lines.join("\n")).join("\n");
  text = replaceSection(text, "STEP 1 CHECKLIST", join_(stepOut));
  text = replaceSection(text, "THE IDEA INBOX", join_(inboxOut));
  if (text !== original) writeFileSync(CHART, text);
}

/* ── THE REPORT ── */
if (JSON_OUT) {
  console.log(JSON.stringify({
    chart: CHART, treeStamp, now: NOW.toISOString(), wrote: WRITE ? wrote : null,
    reap, rank: ranked.map(({ row, ...r }) => r),
    sweep: sweepable.map((x) => ({ title: titleOf(x.row.lines), when: x.when.toISOString().slice(0, 10) })),
  }, null, 2));
} else {
  console.log(`THE CHARTKEEPER — ${CHART}`);
  console.log(`tree stamp ${treeStamp ?? "(unreadable)"} · ${parsed.openRows.length} open rows + ${parsed.openIdeas.length} unfated ideas = ${openItems.length} tasks on his phone\n`);
  if (DO.reap) {
    console.log(reap.length === 0
      ? "REAP   the Chart is fine — every pointer on it still resolves.\n"
      : `REAP   ${reap.length} stale candidate(s). FLAGGED, NOT CLOSED — a watch closes through close_item.mjs.`);
    for (const r of reap) console.log(`       • ${r.title.slice(0, 78)}\n         ${r.reason}`);
    if (reap.length) console.log("");
  }
  if (DO.rank) {
    console.log("RANK   the open list, next-to-be-completed first:");
    for (const r of ranked) console.log(`  ${String(r.rank).padStart(2)}. [${String(r.score).padStart(5)}] ${r.title.slice(0, 66)}\n         why now: ${r.whyNow}`);
    console.log("");
  }
  if (DO.sweep) {
    console.log(sweepable.length === 0
      ? "SWEEP  nothing done for longer than seven days.\n"
      : `SWEEP  ${sweepable.length} done row(s) ready to archive into ${LOG}`);
    for (const x of sweepable) console.log(`       • ${x.when}  ${titleOf(x.row.lines).slice(0, 70)}`);
  }
  console.log(WRITE
    ? `\nWROTE  ${wrote.ids} id(s) allocated · ${wrote.flags} flag(s) · ${wrote.reordered} row(s) moved · ${wrote.archived} archived`
    : "\n(report only — nothing on disk changed. Add --write to act.)");
}
