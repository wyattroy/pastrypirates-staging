#!/usr/bin/env node
/* glass_longrun_status_check.mjs — the status dot must know the difference between
 * "nothing is happening" and "something slow is happening".
 *
 * WYATT, 2026-09-01: "I can see the bosun working right now, but the status shows red. You have to
 * fix the way you report status so that it's only red if the bosun is truly not working or running
 * any subprocesses."
 *
 * WHAT WAS SHIPPED FOR THAT AT THE TIME, AND WHY IT WAS NOT ENOUGH. The honest answer that day was
 * that the dot could only count minutes since the last PUBLISH, so a session working a long job
 * looked dead; the response was a promise to republish more often. CEO Review 56 called that
 * correctly: "Wyatt asked to fix the way you report status, and what shipped is a habit, not a
 * mechanism." A habit is not a fix, and it decays the moment a session is busy.
 *
 * THE MECHANISM ARRIVED WITH THE CHAIN AUDIT. A long job now writes .planning/wyclau/LONG-RUN as it
 * progresses — what it is, how far along, and how long its own quiet stretches may legitimately run
 * (staleAfterMinutes, written by the job because only the job knows). That is a real answer to "is
 * it truly working", so the Glass can stop inferring it from a clock.
 *
 * ⚠ AND IT MUST NOT BECOME A NEW WAY TO LIE. A marker that is missing, malformed, or older than its
 * OWN staleness rule must NOT hold the dot green — that would be the 2026-08-31 timer heartbeat
 * rebuilt on the page instead of in a Monitor: a green light nothing can turn off. The last two
 * checks here are that guarantee.
 */
"use strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");
/* ⚠⚠ THIS GATE WRITES THE REAL, LIVE `LONG-RUN` MARKER, AND A SAILING SEA TRIAL WRITES THE SAME
 * FILE. MEASURED 2026-09-03T04:0xZ, filed as `T-131`. ✅ **FIXED 2026-09-03T05:4xZ — kept as the
 * record of why this gate no longer goes near the real file.**
 *
 * WHAT HAPPENS. The gate plants four fixtures in this file (`:55, :92, :100, :109`) and puts the
 * previous contents back at `:116`. With a trial in flight both of them are writing it, so:
 *   1. the gate READS the trial's marker where it expected its own fixture — all three staleness
 *      cases then fail on the same live JSON, which is what a red suite looked like tonight; and
 *   2. worse, the restore writes back a snapshot taken BEFORE the trial's updates, so **the gate
 *      can freeze a live trial's progress at whatever it was when `npm test` began.**
 *
 * On 2026-09-03 a trial (pid 35064) sat at `0/10 legs` with `updatedAt` 03:42:32Z for 25 minutes
 * while `npm test` was run repeatedly beside it. Whether the gate froze it or the trial was merely
 * slow was NOT established — and that ambiguity is itself the cost: **an instrument that writes its
 * subject's file makes its subject unreadable.**
 *
 * ⚠ AND IT IS A DESTROY-THEN-REPAIR, WHICH THIS PROJECT HAS ALREADY RULED AGAINST. `T-112`'s row
 * says it in as many words: *"Do NOT fix it by making the gate restore the file afterwards — a
 * destroy-then-repair is still a window, and this project has already lost a note inside one."*
 * That was written about `GLASS-NOTE.md` and the fix there was to make the destructive half OPT-IN
 * (`glass.mjs --consume-note`). **This is the same fault in the same shape, one file over.**
 *
 * THE FIX IS THE SAME SHAPE TOO, AND IT SHIPPED AS `--longrun-root=<dir>`: the reader is pointed at
 * a throwaway root, instead of borrowing the real file and putting it back.
 *
 * ⚠ THE FIRST MEASUREMENT OF THIS WAS THE WRONG QUANTITY, WHICH IS THE REUSABLE PART. A checksum of
 * the marker before and after a gate run came back IDENTICAL — the restore works perfectly when
 * nothing else is writing — and that says nothing at all about the hazard. The right quantity is
 * whether it WRITES, because any write is a window: mtime moved 1788413868 → 1788413882 on an
 * untouched marker. **A net-zero change is not the same as never touching it.** */
/* ⛔ THE FIXTURE MARKER NOW LIVES IN A THROWAWAY ROOT. This read
 *   const MARKER = join(ROOT, ".planning", "wyclau", "LONG-RUN");
 * i.e. the REAL file a sailing sea trial writes. The generator now takes
 * `--longrun-root=<dir>`, so this gate builds its own tiny root and points the reader at that.
 * Nothing here touches the live marker any more, and the destroy-then-repair at the end of the
 * old version is gone rather than made safer — `T-112`'s row: "a destroy-then-repair is still a
 * window, and this project has already lost a note inside one." */
const LR_ROOT = mkdtempSync(join(tmpdir(), "glass-longrun-"));
mkdirSync(join(LR_ROOT, ".planning", "wyclau"), { recursive: true });
const MARKER = join(LR_ROOT, ".planning", "wyclau", "LONG-RUN");
const OUT = join(ROOT, ".planning", "wyclau", "glass.html");

const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("glass_longrun_status_check — a slow job must read as WORKING, not as dead\n");

/* The real generator against a real marker — never a copy of its logic (HARD-WON-LESSONS §12i) —
   but the marker is now this gate's OWN, in a temp root. Running this gate cannot disturb a trial
   sailing on this machine because it never opens the file that trial writes. */
/* ⛔ THE RESTORE THAT USED TO LIVE HERE IS DELETED, NOT KEPT "just in case".
 * It read `const had = existsSync(MARKER); const previous = …` and put the contents back in a
 * `finally`. Once MARKER moved into a freshly-made `mkdtempSync` dir, `had` could never be true,
 * so the restore branch was unreachable — **a restore whose subject had been removed.** CEO 147
 * found it still sitting there and named the hazard exactly: leave it and the next reader believes
 * this gate still restores something. That belief is what the whole row was about. */
const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
const gen = () => { execFileSync("node", [GLASS, "--longrun-root=" + LR_ROOT, "--note", "longrun status check"], { cwd: ROOT, stdio: "pipe" }); return readFileSync(OUT, "utf8"); };
const stateOf = (html) => JSON.parse(html.match(/id="glassState">([^<]*)</)[1]);

try {
  // 1. A PROGRESSING long run is carried onto the page, with the job's own staleness rule.
  writeFileSync(MARKER, JSON.stringify({
    what: "sea trial, 10 legs", startedAt: iso(60), updatedAt: iso(2), progress: "7/10 legs", staleAfterMinutes: 53,
  }));
  let st = stateOf(gen());
  check("a progressing long run reaches the page's own state block",
    !!st.longRun && st.longRun.what === "sea trial, 10 legs", `got ${JSON.stringify(st.longRun)}`);
  check("it carries the job's OWN staleness rule, not one the page invented",
    st.longRun && st.longRun.staleAfterMinutes === 53, `got ${JSON.stringify(st.longRun && st.longRun.staleAfterMinutes)}`);
  check("it carries what to SHOW him — what it is and how far along",
    st.longRun && /7\/10/.test(String(st.longRun.progress)), `got ${JSON.stringify(st.longRun && st.longRun.progress)}`);

  /* 2. THE CLIENT MUST ACTUALLY USE IT — AND USE IT THE RIGHT WAY ROUND.
     ⚠ THIS CHECK WAS A TEXT SEARCH FOR THE WORD "longRun" UNTIL CEO Review 62 called it out: it
     would have passed with the comparison INVERTED, i.e. with the light stuck green exactly when
     the job had gone quiet. A check that cannot tell right from backwards is not a check (rule 6).
     So it now RUNS the page's real logic against a moved clock, which is what the reviewer did by
     hand: a marker inside its allowance must read as working, and one past it must go back to red. */
  const html = readFileSync(OUT, "utf8");
  const live = html.slice(html.lastIndexOf("<script>"));
  const lrLogic = (live.match(/var lr = state\.longRun[\s\S]*?lrLive = lrAgeMin >= 0 && lrAgeMin <= lr\.staleAfterMinutes;\s*\}/) || [])[0];
  if (!lrLogic) {
    /* ⚠ THIS IS A COUPLING ALARM, NOT A BEHAVIOURAL CHECK, AND SAYING SO IS THE POINT.
     * The extractor regex above CONTAINS the expression it is fishing for, `lrAgeMin <=
     * lr.staleAfterMinutes`. So ANY edit to that comparison stops the MATCH and fires this branch —
     * which reads, to a casual eye, like the gate catching a behavioural regression. It is not: the
     * three `runAt` cases below never run at all when this fires.
     *
     * CEO 147 caught this session drawing exactly that false conclusion. It red-proofed the gate by
     * flipping `<=` to `>`, saw one failure, and reported the gate armed. The gate IS armed — 147
     * proved it properly with mutants that leave the anchor text intact (zeroing `lrAgeMin` fires
     * two real cases; raising `MAX_STALE_MINUTES` fires a third) — but the experiment used did not
     * show that. **"I mutated it and it went red" is only evidence if you check WHICH assertion
     * went red.** CEO 62 made the same criticism of an earlier version of this gate.
     *
     * DO NOT RED-PROOF THIS GATE BY EDITING THE STALENESS COMPARISON. Mutate a value it reads
     * instead. */
    check("COUPLING: the page's longRun decision is still where this gate looks for it", false,
      "could not find the client's longRun decision at all — it was removed, rewritten, or its text "
      + "changed shape. This is NOT a behavioural failure: the staleness cases below did not run.");
  } else {
    // Run the real snippet with a synthetic state and a moved clock.
    const runAt = (ageMin, staleAfterMinutes) => {
      const state = { longRun: { what: "x", progress: "1/2", updatedAt: new Date(Date.now() - ageMin * 60000).toISOString(), staleAfterMinutes } };
      return new Function("state", `${lrLogic}; return lrLive;`)(state);
    };
    check("INSIDE its allowance, the page reads a long run as working (not red)", runAt(10, 53) === true, "it read a live job as dead");
    check("PAST its allowance, the page stops calling it work and falls back to the clock",
      runAt(60, 53) === false, "a job quiet past its own rule still showed as working — this is the green light nobody can turn off");
    check("a FUTURE-dated marker is not treated as very fresh", runAt(-30, 53) === false, "clock skew could hold the light green");
  }

  // 3. A STALLED marker must NOT hold the light green -- past its own staleness, it is evidence of
  //    a stall rather than of work.
  writeFileSync(MARKER, JSON.stringify({
    what: "sea trial", startedAt: iso(200), updatedAt: iso(90), progress: "3/10 legs", staleAfterMinutes: 20,
  }));
  st = stateOf(gen());
  check("a marker frozen past its OWN staleness is not carried as live work",
    !st.longRun, `got ${JSON.stringify(st.longRun)} — a stalled job would show as working`);

  // 4. A MALFORMED marker must be ignored entirely, never trusted into a permanent green.
  writeFileSync(MARKER, "{ this is not json");
  st = stateOf(gen());
  check("a malformed marker is ignored, never a green light nothing can turn off",
    !st.longRun, `got ${JSON.stringify(st.longRun)}`);

  /* 5. AND A JOB MAY NOT CLAIM UNLIMITED SILENCE. CEO Review 62 found this by exploiting it:
     nothing capped staleAfterMinutes, so a marker claiming a year was carried onto the page and
     held the light green. Reachable without touching code — the value is derived from the trial's
     leg cap and that cap is a CLI flag. */
  writeFileSync(MARKER, JSON.stringify({
    what: "runaway", startedAt: iso(5), updatedAt: iso(1), progress: "1/2", staleAfterMinutes: 525600,
  }));
  st = stateOf(gen());
  check("a marker claiming a YEAR of allowed silence is refused, not carried",
    !st.longRun, `got ${JSON.stringify(st.longRun)} — a hold-off no evidence could ever withdraw`);
} finally {
  /* Take the whole throwaway root with us. Without this the gate leaked one `glass-longrun-*`
     directory per run — CEO 147 counted 12 in %TEMP% and watched it go 10 → 11 across a single
     run. A gate that tidies the file it borrowed and then litters a directory has moved the mess
     rather than removed it. */
  rmSync(LR_ROOT, { recursive: true, force: true });
}

if (failures.length) { console.error(`\nFAIL — ${failures.length} failure(s)`); process.exit(1); }
console.log("\nPASS — the dot reads a long job's own account of itself, and cannot be held green by a broken one");
process.exit(0);
