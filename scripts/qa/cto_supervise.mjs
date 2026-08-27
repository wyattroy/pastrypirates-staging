#!/usr/bin/env node
/* cto_supervise.mjs — THE SHIFT WORKER. Its only job is to check the marathon worker is working well.
 *
 * WYATT'S DESIGN, 2026-08-27, and it is better than either option he was offered:
 *   "i want a shift worker to make sure the marathon worker is always working well. the shift
 *    worker's only job is to support the marathon worker"
 *
 * He was given a choice between a scheduled worker that does the work and a long-running one that
 * does the work. He took neither and made the scheduled one a SUPERVISOR — which fixes the exact
 * failure named in the offer: a long-running worker stops without warning and nobody notices.
 *
 * SO THIS SCRIPT DOES NO BACKLOG WORK, EVER. It answers five questions and stops.
 *
 * ── WHY IT COMPUTES INSTEAD OF READING ──────────────────────────────────────────────────────────
 * A supervisor that reads a log and forms an opinion is precisely the instrument this project keeps
 * being burned by. docs/HARD-WON-LESSONS.md §10 is the day five instruments lied; the cutover broke
 * six more and not one failed loudly. So every number here is DERIVED from a file or from git, and
 * nothing is hand-kept.
 *
 * ── AND WHY IT SAYS "UNKNOWN" RATHER THAN "OK" ──────────────────────────────────────────────────
 * The precedent is ~/.claude/bin/rc-state.sh, rewritten after it told Wyatt his phone access was
 * DOWN while he was reading the session on his phone. It now reports evidence of LIFE and returns
 * UNKNOWN otherwise, because nothing in the log supports the word DOWN.
 *
 * Same discipline: an unreadable ledger, a git command that fails, a missing file — every one of
 * those is UNKNOWN. A supervisor that reports OK because it could not find a problem is worse than
 * no supervisor, because it manufactures confidence out of its own blindness.
 *
 *   node scripts/qa/cto_supervise.mjs            # the report
 *   node scripts/qa/cto_supervise.mjs --brief    # + the prompt to hand a supervising agent
 *
 * EXIT STATUS: 0 all well · 1 something needs attention · 2 cannot tell (which is NOT the same as 1)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (...a) => path.join(REPO, ...a);
const sh = (c) => { try { return execSync(c, { cwd: REPO, encoding: "utf8", stdio: ["ignore","pipe","ignore"] }).trim(); } catch { return null; } };
const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };

const now = new Date();

/* IS A CTO SUPPOSED TO BE RUNNING AT ALL? Read this FIRST, because every judgement below depends
   on it. THE LOCK IS THE ONLY HONEST ANSWER: it is written when a marathon worker starts and
   removed when it stops, so its presence is a CLAIM that work is in flight — and this script's job
   is to test that claim, not to assume it.

   FOUND BY RUNNING IT (2026-08-27, first execution): with no CTO running at all, the report said
   "ALL WELL" in green. Every individual line was true and the banner was a lie — "all well" says
   work is happening and happening well, when nothing was happening. That is precisely the
   reassuring-green this project has been burned by six times in one cutover. IDLE is now its own
   verdict, and aliveness is judged ONLY when the lock says a worker should be alive. */
const lockRaw = (() => { try { return fs.readFileSync(path.join(REPO, ".planning", ".cto-lock"), "utf8"); } catch { return null; } })();
const ctoShouldBeRunning = lockRaw !== null;
const findings = [];      // things that need attention  -> exit 1
const unknowns = [];      // things that cannot be told  -> exit 2
const facts    = [];      // things that are simply true

/* THE HEARTBEAT CADENCE IS NOT A CONSTANT TYPED HERE. It is read from the ledger's own contract, so
   changing the cadence in one place changes the watchdog with it. Rule 9: derive it, never fix it. */
const ledgerRaw = read(P(".planning", "CTO-LEDGER.md"));
let beatMins = null;
if (ledgerRaw) {
  const m = ledgerRaw.match(/at least every\s+(\d+)\s*minutes/i);
  if (m) beatMins = parseInt(m[1], 10);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   1. IS THE MARATHON WORKER ALIVE?
   Staleness is measured against TWO heartbeat intervals, not one — a single missed beat is a slow
   item, two is a worker that stopped. Without the heartbeat a stuck CTO and a busy CTO look
   identical, which is the whole reason this check exists.
   ───────────────────────────────────────────────────────────────────────────────────────────── */
const entries = [];
if (ledgerRaw === null) {
  unknowns.push("The ledger `.planning/CTO-LEDGER.md` cannot be read. **Nothing below about progress can be trusted.**");
} else {
  for (const line of ledgerRaw.split("\n")) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+Z)\s+(\S+)\s+(START|DONE|BLOCKED|PARKED|ABANDONED|REVERTED|HEARTBEAT)\s+(.*)$/);
    if (m) entries.push({ at: new Date(m[1]), id: m[2], state: m[3], note: m[4].trim() });
  }
  if (!entries.length) unknowns.push("The ledger has no parseable entries. Either no CTO has run, or the format drifted — **and those two look the same from here.**");
}

const newest = entries.length ? entries.reduce((a, b) => (a.at > b.at ? a : b)) : null;
let ageMins = null;
if (newest) {
  ageMins = Math.round((now - newest.at) / 60000);
  if (beatMins === null) {
    unknowns.push("The ledger does not state its own heartbeat cadence, so staleness cannot be judged. Restore the *\"at least every N minutes\"* line in `CTO-LEDGER.md`.");
  } else if (newest.id === "BOOTSTRAP") {
    facts.push(`**No CTO has ever run.** The ledger holds only its bootstrap line. This is the correct reading of an empty record — not a failure.`);
  } else if (ageMins > beatMins * 2 && ctoShouldBeRunning) {
    findings.push(`**THE MARATHON WORKER HAS GONE QUIET.** The lock says a worker is in flight, but the last ledger entry was **${ageMins} min ago** (\`${newest.id}\` ${newest.state}) against a ${beatMins}-min cadence. Two missed beats means stopped, not slow. **Restart it, or tell Wyatt it is down.**`);
  } else if (ageMins > beatMins * 2) {
    facts.push(`Last ledger entry ${ageMins} min ago (\`${newest.id}\` ${newest.state}). No lock held, so nobody is expected to be working — this is idleness, not silence.`);
  } else {
    facts.push(`Alive — last entry ${ageMins} min ago (\`${newest.id}\` ${newest.state}), inside the ${beatMins}-min cadence.`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   2. IS IT MAKING PROGRESS, OR STUCK ON ONE THING?
   ───────────────────────────────────────────────────────────────────────────────────────────── */
const CLOSERS = new Set(["DONE", "BLOCKED", "PARKED", "ABANDONED", "REVERTED"]);
const latestByItem = new Map();
for (const e of entries) {
  if (e.id === "BOOTSTRAP" || e.state === "HEARTBEAT") continue;
  const prev = latestByItem.get(e.id);
  if (!prev || e.at >= prev.at) latestByItem.set(e.id, e);
}
const open = [...latestByItem.values()].filter(e => !CLOSERS.has(e.state));
const done = [...latestByItem.values()].filter(e => e.state === "DONE");

if (open.length > 1)
  findings.push(`**${open.length} items are open at once** (${open.map(e => e.id).join(", ")}). The CTO does ONE item at a time so that a CEO verdict has one thing to judge. Two open items means one of them was abandoned without saying so.`);

for (const e of open) {
  const mins = Math.round((now - e.at) / 60000);
  if (beatMins !== null && mins > beatMins * 6 && ctoShouldBeRunning)
    findings.push(`**\`${e.id}\` has been open for ${Math.round(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}** without closing. Either it is genuinely large — in which case the ledger should say so — or the CTO is stuck and does not know it.`);
}

/* THE BACKLOG IS THE MANDATE. Count what is in it, and count what has been closed against it, so
   "how far through are we" is never a number somebody typed. */
const backlog = read(P(".planning", "BACKLOG.md"));
if (backlog === null) {
  unknowns.push("`.planning/BACKLOG.md` cannot be read — **the CTO has no mandate, and rule 3 says it may then do nothing.**");
} else {
  const ids = [...backlog.matchAll(/^\|\s*(W\d+-\d+)\s*\|/gm)].map(m => m[1]);
  const uniq = [...new Set(ids)];
  const closed = uniq.filter(id => { const e = latestByItem.get(id); return e && CLOSERS.has(e.state); });
  facts.push(`Backlog: **${closed.length} of ${uniq.length}** items closed.`);
  if (uniq.length && closed.length === uniq.length)
    findings.push(`**THE BACKLOG IS EMPTY OF UNSTARTED WORK.** Wyatt's rule 3: the CTO executes only what is on the backlog. **It must now STOP and write proposals — it may not promote its own ideas.**`);
  /* WORK THAT IS NOT ON THE MANDATE. This is failure mode 5 — an agent with hours left invents
     something. Named because it already happened once: an eight-hour fix window went into a hook
     nobody asked for. */
  const strays = [...latestByItem.keys()].filter(id => /^W\d+-\d+$/.test(id) && !uniq.includes(id));
  if (strays.length)
    findings.push(`**WORK LOGGED AGAINST ITEMS THAT ARE NOT ON THE BACKLOG:** ${strays.join(", ")}. Either the backlog was edited underneath the CTO, or it invented work. **Both need Wyatt.**`);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   3. IS IT STAYING IN BOUNDS? — the safety property, checked rather than trusted.
   ───────────────────────────────────────────────────────────────────────────────────────────── */
const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch === null) unknowns.push("`git` did not answer — branch and history checks below are all UNKNOWN.");
else {
  if (branch === "main")
    findings.push("**THE WORKING TREE IS ON \`main\`.** Every push from here is served to real players immediately. The CTO must work on a dated branch.");
  else facts.push(`On branch \`${branch}\` — not \`main\`. Correct.`);

  if (lockRaw === null) facts.push("No CTO lock held — `main` is reachable, which is right when only Wyatt is driving.");
  else {
    let L = {}; try { L = JSON.parse(lockRaw); } catch {}
    facts.push(`CTO lock held by **${L.holder || "unknown"}** since ${L.since || "?"} — \`.claude/hooks/cto-staging-only.cjs\` is denying every route to \`main\`.`);
  }

  /* DID main MOVE WHILE THE CTO WAS RUNNING? The hook should make this impossible. A supervisor
     that trusts the hook instead of checking it is not a supervisor. */
  sh("git fetch origin --quiet");
  const aheadLocal = sh("git rev-list --count origin/main..main");
  /* "AHEAD OF origin/main" IS NOT THE SAME QUESTION AS "SOMEBODY COMMITTED TO MAIN HERE", and
     reading it as if it were made this detector cry wolf on every cloud session.

     MEASURED 2026-08-27: a fresh cloud container's clone left local `main` 50 commits ahead and 70
     behind, on an old lineage whose tip was authored by WYATT on 2026-08-21. The CTO had not gone
     near `main`. The supervisor's one and only alarm was firing for something no CTO could ever
     cause — a smoke detector wired to the kettle — and an alarm that is always wrong is one people
     learn to walk past, which is the failure this whole file exists to prevent.

     THE HONEST TEST IS "--not --remotes": are those commits reachable from ANY remote branch? If
     every one of them is, they were fetched, not authored here, however far ahead they look. Only
     a commit that exists NOWHERE on the remote was made on this machine. Derived from the refs
     themselves, never from a list of excuses somebody typed. */
  const localOnly = sh("git rev-list --count origin/main..main --not --remotes");
  if (aheadLocal === null || localOnly === null) unknowns.push("Could not compare local `main` to `origin/main`.");
  else if (localOnly !== "0") findings.push(`Local \`main\` carries **${localOnly} commit(s) that exist on NO remote branch** — something committed to main on this machine. Nothing in the CTO's loop should ever do that.`);
  else if (aheadLocal !== "0") facts.push(`Local \`main\` is ${aheadLocal} commit(s) ahead of \`origin/main\`, but **every one of them is already on a remote branch** — a stale clone, not local work. Common in a fresh cloud container. Tidy with \`git branch -f main origin/main\`; it is not a finding.`);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   4. IS THE WORK ACTUALLY VERIFIED? — every DONE owes a CEO verdict.
   Rule 25 exists because 22 fixes shipped with 4 verified and the report said success. A DONE with
   no verdict is that same claim wearing a ledger entry.
   ───────────────────────────────────────────────────────────────────────────────────────────── */
const reviews = read(P(".planning", "CEO-REVIEWS.md"));
if (reviews === null) unknowns.push("`.planning/CEO-REVIEWS.md` cannot be read — **whether any completed work was reviewed is UNKNOWN.**");
else {
  const unreviewed = done.filter(e => !reviews.includes(e.id));
  if (unreviewed.length)
    findings.push(`**${unreviewed.length} item(s) marked DONE with no CEO verdict on record:** ${unreviewed.map(e => e.id).join(", ")}. Rule 25 is not optional and a verdict nobody recorded is a recurrence check nobody can run.`);
  else if (done.length) facts.push(`All ${done.length} DONE item(s) have a CEO verdict recorded.`);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   5. WHAT IS WAITING ON WYATT? — the queue he comes home to.
   ───────────────────────────────────────────────────────────────────────────────────────────── */
const qs = read(P(".planning", "CTO-QUESTIONS.md"));
if (qs === null) unknowns.push("`.planning/CTO-QUESTIONS.md` cannot be read — parked questions are UNKNOWN.");
else {
  const blocks = qs.split(/^### /m).slice(1);
  const openQ = blocks.filter(b => !/^-\s+\*\*resolved:\*\*\s*\S/m.test(b));
  const taste = openQ.filter(b => /\*\*kind:\*\*\s*TASTE/.test(b));
  if (openQ.length) facts.push(`**${openQ.length} question(s) waiting on Wyatt**, ${taste.length} of them TASTE (which never time out and never default).`);
  else facts.push("No open questions.");
}

/* ── THE REPORT ─────────────────────────────────────────────────────────────────────────────── */
/* FOUR VERDICTS, NOT THREE. "ALL WELL" is reserved for a worker that is actually running and
   actually healthy; anything else gets a word that does not overstate what was observed. */
const verdict = findings.length ? "NEEDS ATTENTION"
              : unknowns.length ? "CANNOT TELL"
              : ctoShouldBeRunning ? "ALL WELL"
              : "IDLE — no CTO is running";
const bar = { "NEEDS ATTENTION": "🔴", "CANNOT TELL": "🟡", "ALL WELL": "🟢", "IDLE — no CTO is running": "⚪" }[verdict];

console.log(`${bar} CTO SUPERVISOR — ${verdict}`);
console.log(`   ${now.toISOString()}  ·  repo ${REPO}\n`);
if (findings.length) { console.log("NEEDS ATTENTION"); findings.forEach(f => console.log(`  ✗ ${f}\n`)); }
if (unknowns.length) { console.log("CANNOT TELL — and this is NOT the same as fine"); unknowns.forEach(u => console.log(`  ? ${u}\n`)); }
if (facts.length)    { console.log("OBSERVED"); facts.forEach(f => console.log(`  · ${f}`)); }

if (process.argv.includes("--brief")) {
  console.log(`\n${"─".repeat(78)}\nHAND THIS TO THE SUPERVISING AGENT:\n${"─".repeat(78)}
You are the SHIFT WORKER for Pastry Pirates. Wyatt, 2026-08-27: "i want a shift worker to make sure
the marathon worker is always working well. the shift worker's only job is to support the marathon
worker."

YOU DO NO BACKLOG WORK. None. If you find yourself editing game code you have misunderstood the job.

The mechanical report above is your evidence. Your job is what a script cannot do:
 1. If the marathon worker has GONE QUIET — restart it, and say so in the ledger.
 2. If it is STUCK on one item — read its recent commits and say whether it is working or spinning.
 3. If a DONE has no CEO verdict — run one: node scripts/qa/ceo_brief.mjs --ask="<the item, verbatim>"
 4. If questions are waiting on Wyatt — push the TASTE ones to his phone. They never default.
 5. If the backlog is empty — STOP the marathon worker and write proposals. Do not invent work.

RULES: Report only what you measured. "CANNOT TELL" is a real answer and a good one. Never say the
work is fine because you could not find a problem — that manufactures confidence out of blindness.
Plain English: Wyatt is a founder and designer, not an engineer.`);
}

process.exit(findings.length ? 1 : unknowns.length ? 2 : 0);
