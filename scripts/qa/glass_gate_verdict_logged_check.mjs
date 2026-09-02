#!/usr/bin/env node
/* glass_gate_verdict_logged_check.mjs — the change-gate must RUN on every tick and leave a verdict.
 *
 * WHY (INBOX-20260902T0120Z). On the 01:02Z Glass tick the harvest had already found a real ruling
 * and a real idea, so the tick went straight to publishing without running
 * `glass_needs_publish.mjs` at all. The runbook told it to: step 3 said *"if step 2 found ideas or
 * rulings, you are publishing regardless of what this says"*. The publisher's own account:
 *
 *   "That was a judgment call to not run a check whose answer was moot, not a skip I didn't
 *    notice — but I take your point that 'the answer was moot' and 'the gate ran and I have a
 *    verdict on record' are different things, and only the second is auditable."
 *
 * THE DEFECT IS NOT THE PUBLISH. Publishing was correct — his words landing on the Chart IS a
 * change. The defect is that FROM OUTSIDE, a tick that skipped the gate and a tick where the gate
 * is not wired in at all look identical: `npm test` stays green either way, and everybody believes
 * the guard is live. A gate that is present but not consulted is worse than no gate — it is the
 * exact shape of the publish-stamp fault fixed hours earlier the same night, where a watch that
 * could not publish still marked the Glass as fresh.
 *
 * THE FIX THIS CHECKS: the override moves off the CHECK and onto the ACTION.
 * `scripts/wyclau/glass_gate_log.mjs` always runs the gate, always writes one line, and exits with
 * the gate's own code — except under `--harvested`, where the gate still runs and is still
 * recorded and only the DECISION is overridden. That is the item's sentence, mechanised.
 *
 * ⚠ WHAT THIS CHECK CAN AND CANNOT SEE, said out loud because an instrument that reports a result
 * without naming its subject is this project's oldest recurring fault:
 *   CAN see:    what the wrapper DOES — exit codes preserved, a line appended every run, an
 *               unreadable gate resolving to PUBLISH rather than to silence. Behavioural, run
 *               against an injected fake gate whose verdict and exit code this file chooses.
 *   CANNOT see: whether a human running the tick actually typed the command. Case 8 reads the
 *               runbook's PROSE, and prose-grepping is the weakest thing in this file — it is here
 *               because the fault class it guards is real and measured: `INBOX-20260902T05xxZ-c`
 *               found the permission layer covering one spelling while the documentation taught
 *               another, with nothing connecting them. This connects them. It does not enforce
 *               obedience, and no reader should think it does.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WRAPPER = join(ROOT, "scripts", "wyclau", "glass_gate_log.mjs");
const RUNBOOK = join(ROOT, ".planning", "wyclau", "GLASS-UPDATE-SESSION.md");

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log("the change-gate runs on every tick and leaves a verdict on the record\n");

if (!existsSync(WRAPPER)) {
  fail("scripts/wyclau/glass_gate_log.mjs does not exist — nothing records whether the gate ran, so a skipped tick and an unwired gate are indistinguishable");
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}

/* THE SEAM. A fake gate whose exit code and words this file chooses, so every case below is a
 * measurement of the wrapper rather than of whatever the real repo happens to look like today.
 * The real gate's own behaviour is glass_needs_publish_check.mjs's subject, not this file's. */
const box = mkdtempSync(join(os.tmpdir(), "pp-gatelog-"));
const LOG = join(box, "GATE-LOG");
const fakeGate = (verdict, code, crash = false) => {
  const p = join(box, `gate-${verdict}-${code}${crash ? "-crash" : ""}.mjs`);
  writeFileSync(p, crash
    ? `console.error("boom"); process.exit(${code});\n`
    : `console.log(${JSON.stringify(`${verdict} — because the fake gate said so`)}); process.exit(${code});\n`);
  return p;
};

const run = (args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [WRAPPER, ...args], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const logLines = () => {
  try { return readFileSync(LOG, "utf8").split("\n").filter((l) => l.trim()); } catch { return []; }
};

// 1. PUBLISH must pass straight through. The tick branches on the exit code; changing it would
//    change what the tick does, and this wrapper's whole claim is that it does not.
{
  const r = run([`--gate=${fakeGate("PUBLISH", 0)}`, `--log=${LOG}`]);
  if (r.code !== 0) fail(`a PUBLISH gate (exit 0) came back as exit ${r.code} — the wrapper changed the tick's decision instead of only recording it`);
  else pass("a PUBLISH gate exits 0 through the wrapper — the decision is untouched");
}

// 2. NOTHING-MOVED must pass straight through as 10, or a quiet night starts publishing again and
//    the change-gate is defeated by the thing meant to make it auditable.
{
  const r = run([`--gate=${fakeGate("NOTHING-MOVED", 10)}`, `--log=${LOG}`]);
  if (r.code !== 10) fail(`a NOTHING-MOVED gate (exit 10) came back as exit ${r.code} — the tick would publish on a quiet night, which is the waste the gate exists to remove`);
  else pass("a NOTHING-MOVED gate exits 10 through the wrapper — a quiet tick still ends silently");
}

// 3. APPEND, NEVER TRUNCATE. A log that keeps only the newest line answers "what did the last tick
//    say", which is what a session's memory already answered. The value is the HISTORY.
{
  const before = logLines().length;
  run([`--gate=${fakeGate("PUBLISH", 0)}`, `--log=${LOG}`]);
  const after = logLines();
  if (after.length !== before + 1) fail(`the log went from ${before} to ${after.length} lines across one run — it must grow by exactly one, never truncate`);
  else pass(`every run appends exactly one line (${after.length} now) and leaves the earlier ones alone`);
}

// 4. A LINE A HUMAN CAN AUDIT: when, and what the gate said. Without the timestamp the log cannot
//    be matched against a publish; without the verdict there is nothing to audit.
{
  const last = logLines().at(-1) ?? "";
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(last)) fail(`the newest log line carries no UTC timestamp, so it cannot be matched against LAST-PUBLISH: ${last.slice(0, 120)}`);
  else pass("each line carries a UTC timestamp that can be lined up against LAST-PUBLISH");
  if (!/\b(PUBLISH|NOTHING-MOVED|UNREADABLE)\b/.test(last)) fail(`the newest log line carries no verdict word: ${last.slice(0, 120)}`);
  else pass("each line carries the verdict the gate actually returned");
}

// 5. THE GATE'S OWN WORDS SURVIVE. The gate explains itself ("a note is queued…", "no commit has
//    landed since…"); a log that keeps the verdict and drops the reason makes the next reader
//    re-derive what was already known.
{
  const last = logLines().at(-1) ?? "";
  if (!/because the fake gate said so/.test(last)) fail(`the gate's own explanation did not reach the log — only the verdict did: ${last.slice(0, 160)}`);
  else pass("the gate's own explanation reaches the log, not just its verdict");
}

/* 6. EVERY DOUBT RESOLVES TO PUBLISH — the discipline the gate itself already holds. A gate that
 *    CRASHES tells us nothing; the wrapper must not turn that into silence, because the failure
 *    mode of a missed publish is Wyatt reading a frozen page. It must still leave a line, so the
 *    crash is auditable rather than merely survived. */
{
  const before = logLines().length;
  const r = run([`--gate=${fakeGate("x", 1, true)}`, `--log=${LOG}`]);
  if (r.code !== 0) fail(`a crashing gate came back as exit ${r.code} — a broken input must resolve to PUBLISH, never suppress one`);
  else pass("a crashing gate resolves to PUBLISH (exit 0) rather than to silence");
  const after = logLines();
  if (after.length !== before + 1) fail("a crashing gate left no log line — the one tick most worth auditing is unrecorded");
  else if (!/UNREADABLE/.test(after.at(-1) ?? "")) fail(`a crashing gate was logged as something other than UNREADABLE: ${(after.at(-1) ?? "").slice(0, 140)}`);
  else pass("a crashing gate is recorded as UNREADABLE, so the record says what happened");
}

/* 7. THE ITEM'S OWN SENTENCE: THE OVERRIDE MOVES ONTO THE ACTION.
 *    Under --harvested the tick is publishing whatever the gate says — his words landing on the
 *    Chart is itself a change. That must not mean the gate goes unrun. The gate still runs, its
 *    real verdict is still what gets written down, and ONLY the exit code is overridden. */
{
  const before = logLines().length;
  const r = run([`--gate=${fakeGate("NOTHING-MOVED", 10)}`, `--log=${LOG}`, "--harvested"]);
  if (r.code !== 0) fail(`--harvested with a NOTHING-MOVED gate exited ${r.code} — the harvest must override the action, so the tick publishes his words`);
  else pass("--harvested overrides the ACTION: a NOTHING-MOVED tick still publishes when the harvest found his words");
  const last = logLines().at(-1) ?? "";
  if (logLines().length !== before + 1) fail("--harvested wrote no log line — this is exactly the tick that went unrecorded on 2026-09-02T01:02Z");
  else if (!/NOTHING-MOVED/.test(last)) fail(`--harvested recorded something other than the gate's real verdict: ${last.slice(0, 140)}`);
  else if (!/harvest/i.test(last)) fail(`--harvested did not record that the action was overridden, so the line reads as a plain publish: ${last.slice(0, 140)}`);
  else pass("--harvested does NOT override the check: the gate's real verdict and the override are both on the record");
}

/* 7b. THE DEFAULT GATE PATH MUST RESOLVE — CEO 100's finding 2, and it is this item's own fault
 *     one floor down. Every case above injects a fake gate with --gate=, so NOTHING exercised the
 *     path the tick actually takes. If that default ever breaks — a rename, a re-vendor moving
 *     glass_needs_publish.mjs — the wrapper reads the result as UNREADABLE, exits 0, and the Glass
 *     publishes on EVERY tick forever while the log dutifully records a verdict that came from
 *     nothing. `npm test` would stay green throughout. A guard that cannot see its own subject
 *     moving is the fault this whole item is about.
 *     --log is still redirected into the sandbox: a check must not write into the audit trail it
 *     is checking, or every `npm test` run looks like a Glass tick. */
{
  const r = run([`--log=${LOG}`]);
  const last = logLines().at(-1) ?? "";
  if (/UNREADABLE/.test(last))
    fail(`run with no --gate, the wrapper could not reach the real glass_needs_publish.mjs (logged UNREADABLE). Every tick would publish on a verdict that came from nothing, and this suite would stay green: ${last.slice(0, 160)}`);
  else if (!/\b(PUBLISH|NOTHING-MOVED)\b/.test(last))
    fail(`run with no --gate, the wrapper logged no real verdict at all: ${last.slice(0, 160)}`);
  else pass(`the wrapper's DEFAULT gate path reaches the real check and returns a real verdict (${(last.match(/\b(PUBLISH|NOTHING-MOVED)\b/) || [])[1]}, exit ${r.code})`);
}

/* 8. THE RUNBOOK AND THE TOOL MUST NAME EACH OTHER. The weakest case in this file, and it is here
 *    for a measured reason: on 2026-09-02 the allowlist covered `bash scripts/deploy-staging.sh`
 *    while three documents taught `./scripts/deploy-staging.sh`, and nothing connected them, so a
 *    watch following its own documentation was refused. A tool nobody is told to run is CEO 95's
 *    finding about the Chartkeeper: "a ranking tool nobody runs does not clean your list."
 *
 *    ⚠ WIDENED AFTER CEO 100, WHICH NAMED THE WEAKNESS THIS FILE HAD MIS-NAMED. The first version
 *    matched only the one sentence that had just been deleted, and CEO 100 listed five rewordings
 *    that would sail straight through — "step 3 is optional", "no need to ask the gate", "bypass
 *    the gate on a harvest tick", "go straight to step 4". This file had honestly declared its own
 *    weakness as "it cannot see whether a human typed the command", which was true and was NOT the
 *    weakness that mattered. A memorial to one sentence is not a guard against a class.
 *    THE DELIBERATE COST, stated so nobody rediscovers it as a bug: the runbook can no longer quote
 *    the old clause verbatim without turning the suite red. It paraphrases instead, which is the
 *    right trade — the runbook is an instruction sheet, and the history belongs here and in the
 *    Inbox. */
{
  const book = existsSync(RUNBOOK) ? readFileSync(RUNBOOK, "utf8") : "";
  if (!book) fail(".planning/wyclau/GLASS-UPDATE-SESSION.md is missing — the tick has no runbook to follow");
  else {
    if (!/node scripts\/wyclau\/glass_gate_log\.mjs/.test(book))
      fail("the runbook never names `node scripts/wyclau/glass_gate_log.mjs` — the wrapper exists and nobody is told to run it, so no tick is any more auditable than before");
    else pass("the runbook's tick step names the wrapper by the exact command that exists");

    /* The raw gate must never appear as a COMMAND in the runbook. Naming the file in prose is fine
       and necessary (the box explaining why it exists does); telling someone to run it is the hole,
       because a direct run leaves no line in GATE-LOG. CEO 100 found exactly that sentence still
       standing two hundred lines below the step that had replaced it. */
    if (/node\s+scripts\/wyclau\/glass_needs_publish\.mjs/.test(book))
      fail("the runbook still gives `node scripts/wyclau/glass_needs_publish.mjs` as a command to run — a direct run of the raw gate leaves no line in GATE-LOG, which is the hole this item closed");
    else pass("the runbook never tells anyone to run the raw gate directly — only the wrapper");

    const SKIP_CLAUSES = [
      /regardless of what this says/i,
      /\bskip(?:ping|ped)?\b[^.\n]{0,40}\b(?:check|gate|step 3)\b/i,
      /\bstep 3\b[^.\n]{0,40}\b(?:optional|unnecessary|not needed)\b/i,
      /\bno need to\b[^.\n]{0,40}\b(?:ask|run|check|gate)\b/i,
      /\bbypass(?:ing)?\b[^.\n]{0,40}\b(?:check|gate|step 3)\b/i,
      /\b(?:go|jump|straight)\b[^.\n]{0,20}\bstraight to step\b/i,
      /\bdon'?t (?:bother|need to) (?:ask|run)\b/i,
    ];
    const hit = SKIP_CLAUSES.map((re) => re.exec(book)).find(Boolean);
    if (hit)
      fail(`the runbook grants a skip of the CHECK ("${hit[0]}") — the override must land on the action, not on whether the gate runs`);
    else pass(`the runbook grants no skip of the check itself — ${SKIP_CLAUSES.length} rewordings tested, only the decision may be overridden`);
  }
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
