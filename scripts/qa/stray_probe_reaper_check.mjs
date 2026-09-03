#!/usr/bin/env node
/* GATE: SOMETHING ACTUALLY KILLS ABANDONED BROWSERS, AND NOTHING CAN SILENCE THE DETECTOR.
 *
 * HIS QUESTION, 2026-09-03, after being told the detector had been made reachable again:
 *   *"did you fix this problem so that there are never any abandoned browsers hitting my laptop
 *    anymore?"*
 *
 * The honest answer was NO, in three separate ways, and this gate holds all three shut:
 *
 *   1. `stray_probe_check.mjs` only ever PRINTED a command. Nothing killed anything.
 *   2. It sat 117th of 127 in an `&&` chain, so **116 gates could switch it off by failing first**
 *      — and on 2026-09-03 one of them did, for a whole day, on a FALSE failure.
 *   3. It only looked when somebody ran `npm test`. A session that leaves browsers and never runs
 *      the suite was never noticed at all.
 *
 * WHAT THAT COST: 183 chrome.exe processes carrying --remote-debugging-port, the oldest more than a
 * day old, holding 15,097 MB, on the laptop he was asleep next to.
 *
 * ⛔ AND THE RESTRAINT IS PART OF THE CONTRACT, NOT A DETAIL. The reaper must kill ORPHANS ONLY. A
 * debug browser whose launcher is alive is a probe somebody is USING — a posed board mid-photograph,
 * a sea trial at sea. A reaper that killed those would break live work every time it tidied up, and
 * the first person it hurt would turn it off.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/* Deliberately NOT imported from scripts/lib/stray_probes.mjs. Case 2b's whole value is that it
   reaches the OS by a route the reaper does not share; borrowing the library's helpers would put
   the suspect back inside the instrument (rule 6). */
const isWin = () => process.platform === "win32";
let failed = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failed++; };

console.log("stray_probe_reaper_check — abandoned browsers are KILLED, and the detector cannot be silenced\n");

// 1 — THE REAPER EXISTS AND RUNS.
{
  const p = join(ROOT, "scripts", "qa", "kill_stray_probes.mjs");
  let out = "";
  try { out = execFileSync(process.execPath, [p, "--dry-run"], { encoding: "utf8", cwd: ROOT }); }
  catch (e) { fail(`the reaper would not run: ${String(e.message).split("\n")[0]}`); }
  if (out) {
    if (/stray probes:/.test(out)) pass(`the reaper runs and reports: "${out.trim().split("\n")[0].slice(0, 78)}"`);
    else fail(`the reaper ran but said nothing recognisable: ${JSON.stringify(out.slice(0, 90))}`);
  }
}

/* 2 — ⛔ IT KILLS ORPHANS ONLY. Asserted on the SOURCE because the live machine may legitimately
 *     have zero orphans right now, and a case that can only run on a dirty machine is a case that
 *     never runs.
 *
 * ⚠ THIS CASE WAS VACUOUS AND THIS IS WHY. CEO 182 replaced the selection with `probes.slice()` in
 * an isolated copy — a reaper that kills EVERY debug browser on the machine, a sailing sea trial and
 * a posed board included — and this case printed PASS. Its regex looked for `.filter(p => p.orphan)`
 * ANYWHERE in the file, and the after-the-fact recount 23 lines below the kill loop contains exactly
 * that string. **Delete the real filter, keep the counter, gate stays green** — an instrument
 * certifying a safety property it structurally could not see, guarding something that now runs
 * unattended on his laptop at the end of every turn. That is the worst place this project's
 * recurring fault has landed.
 *
 * ⚑ SO IT NOW ANCHORS TO THE TWO STATEMENTS THAT ACTUALLY DECIDE WHAT DIES: the single
 * `const orphans = …` that names the doomed set, and the loop that hands pids to `killPid`. And it
 * PROVES ITSELF ON EVERY RUN — the two mutants below are applied to an in-memory copy and must both
 * go red before the real source is allowed to go green. A case that cannot fail can no longer report
 * that it passed. */
{
  const src = readFileSync(join(ROOT, "scripts", "qa", "kill_stray_probes.mjs"), "utf8");

  /* The judge, so the mutants are judged by the same eyes as the real thing. */
  const judge = (s) => {
    const sel = s.match(/^[ \t]*const\s+orphans\s*=\s*(.+?);[ \t]*$/m);
    if (!sel) return "there is no single `const orphans = …` statement any more — the reaper does not name what it is allowed to kill, so nothing here can check the restraint";
    if (!/\bprobes\b\s*\.filter\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.orphan\s*\)/.test(sel[1]))
      return `what the reaper kills is now \`${sel[1].trim()}\` — it must be probes.filter(p => p.orphan), or the next tidy-up takes a posed board mid-photograph and a sea trial at sea with it`;
    const loop = s.match(/for\s*\(\s*const\s+\w+\s+of\s+(\w+)\s*\)\s*\(?\s*killPid/);
    if (!loop) return "cannot find the loop that hands pids to killPid — the gate cannot see what it iterates, so it must not say PASS";
    if (loop[1] !== "orphans") return `the kill loop iterates \`${loop[1]}\`, not \`orphans\` — the selection above it is then decoration`;
    return null;
  };

  /* RED FIRST, on every run: the exact mutation CEO 182 made, plus its sibling. */
  const mutants = [
    ["the selection replaced by `probes.slice()` (CEO 182's own mutation)",
     src.replace(/^([ \t]*const\s+orphans\s*=\s*).+?;[ \t]*$/m, "$1probes.slice();")],
    ["the kill loop switched to iterate every probe",
     src.replace(/(for\s*\(\s*const\s+\w+\s+of\s+)orphans(\s*\)\s*\(?\s*killPid)/, "$1probes$2")],
  ];
  let proofs = 0;
  for (const [what, mut] of mutants) {
    if (mut === src) fail(`could not build the mutant "${what}" — the source no longer has the shape this case mutates, so the red proof did not run and its PASS would mean nothing`);
    else if (!judge(mut)) fail(`⛔ VACUOUS: with ${what}, this case still judges the reaper safe. That is the CEO 182 fault returning.`);
    else proofs++;
  }
  if (proofs === mutants.length) pass(`the restraint check can FAIL — both mutants go red (${proofs}/${mutants.length}), so its green below is worth something`);

  const why = judge(src);
  if (why) fail(why);
  else pass("it kills orphans only — a probe with a live launcher is in use and is left alone");
}

/* 2b — ⛔ AND THE SOURCE CHECK ABOVE IS STILL NOT ENOUGH, WHICH IS THE SEVENTH TIME THIS PROJECT HAS
 *      MET THIS FAULT. CEO 186 broke the same safety through a door case 2 does not open: the word
 *      `orphan` it anchors on is a FIELD whose meaning lives in `scripts/lib/stray_probes.mjs:50`,
 *      and case 2 reads only `kill_stray_probes.mjs`. One line changed there — `orphan: true` —
 *      and, on this machine, at that moment:
 *
 *        the reaper:  "WOULD kill 14 orphan(s)"   ← a sea trial that was AT SEA
 *        this gate:   PASS ×6, exit 0, including "it kills orphans only"
 *
 *      **And it was worse than 182's version, because 182's was silently blind and this one
 *      CERTIFIED ITS OWN SIGHT** — case 2 prints "both mutants go red (2/2)", a confident claim of
 *      non-vacuity that was false at the level that mattered.
 *
 * ⚑ SO THIS CASE DOES NOT READ SOURCE AT ALL. It asks the OS ITSELF, by its own query, how many
 *   debug browsers have a dead parent — then asks the reaper what it WOULD kill, and requires the
 *   two numbers to agree. Independent path, independent answer (rule 6: verify against a different
 *   route, never against the suspect itself). Edit the reaper, edit the shared library, edit
 *   whatever comes next — if the killer's appetite stops matching the machine's reality, this goes
 *   red and names both numbers. That is the whole class, closed once.
 *
 *   A FAILED LOOK IS NOT A PASS. If the query cannot run, this case says so and stays silent —
 *   it never prints a green line it did not earn. */
{
  const winQ = "$live=@{}; Get-CimInstance Win32_Process | ForEach-Object { $live[[int]$_.ProcessId]=$true }; " +
    "$p=@(Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | " +
    "Where-Object { $_.CommandLine -match 'remote-debugging-port' }); " +
    "\"$(@($p | Where-Object { -not $live[[int]$_.ParentProcessId] }).Count) $($p.Count)\"";
  const posixQ =
    "live=$(ps -eo pid | tail -n +2 | tr -d ' '); n=0; o=0; " +
    "while read -r pid ppid rest; do n=$((n+1)); " +
    "  echo \"$live\" | grep -qx \"$ppid\" || o=$((o+1)); " +
    "done <<EOF\n$(ps -eo pid,ppid,command | grep -- '--remote-debugging-port' | grep -v grep)\nEOF\n" +
    "echo \"$o $n\"";

  let mine = null;
  try {
    const out = isWin()
      ? execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", winQ], { encoding: "utf8" })
      : execFileSync("/bin/sh", ["-c", posixQ], { encoding: "utf8" });
    const m = out.trim().match(/(\d+)\s+(\d+)\s*$/);
    if (m) mine = { orphans: Number(m[1]), all: Number(m[2]) };
  } catch { /* named below */ }

  if (!mine) {
    console.log("  SKIP  this gate could not ask the OS itself, so it will not vouch for the reaper's appetite. Nothing is claimed here.");
  } else {
    let out = "";
    try { out = execFileSync(process.execPath, [join(ROOT, "scripts", "qa", "kill_stray_probes.mjs"), "--dry-run"], { encoding: "utf8", cwd: ROOT }); }
    catch { /* case 1 already reports a reaper that will not run */ }
    /* Three shapes the reaper can print, and only one of them names a number. */
    let wants = null;
    if (/WOULD kill (\d+) orphan/.test(out)) wants = Number(/WOULD kill (\d+) orphan/.exec(out)[1]);
    else if (/every one with a live launcher/.test(out) || /: none —/.test(out)) wants = 0;

    if (wants === null) {
      if (out) fail(`the reaper's dry run said something this gate cannot count: ${JSON.stringify(out.trim().slice(0, 110))} — an appetite nobody can read is an appetite nobody is checking`);
    } else if (wants !== mine.orphans) {
      fail(`⛔ THE REAPER WANTS TO KILL ${wants} BROWSER(S) AND THIS MACHINE HAS ${mine.orphans} ABANDONED ONE(S) (of ${mine.all} up). Asked independently of the reaper's own code. A killer whose appetite exceeds the abandoned set takes live work with it — a sea trial at sea, a posed board mid-photograph.`);
    } else {
      pass(`the reaper's appetite matches the machine, asked independently: ${wants} abandoned of ${mine.all} debug browser(s) up, and it would kill exactly those`);
    }
  }
}

/* 3 — ONE DEFINITION OF "ORPHANED" (rule 23). The detector and the reaper must not each decide what
 *     counts, or they will drift and only one of them will be right. */
{
  const det = readFileSync(join(ROOT, "scripts", "qa", "stray_probe_check.mjs"), "utf8");
  const rea = readFileSync(join(ROOT, "scripts", "qa", "kill_stray_probes.mjs"), "utf8");
  const lib = "lib/stray_probes.mjs";
  if (!rea.includes(lib)) fail("the reaper does not use the shared definition of an orphaned probe");
  else if (!det.includes(lib)) {
    fail("the DETECTOR still carries its own copy of the orphan query — two definitions of the same fact, which is how they come to disagree (rule 23)");
  } else pass("detector and reaper share one definition of 'orphaned' — scripts/lib/stray_probes.mjs");
}

/* 4 — ⛔ THE DETECTOR CANNOT BE SILENCED BY A GATE THAT FAILS BEFORE IT. This is the fault that
 *     actually happened: it ran 117th, a false failure ~90th switched it off, and it stayed off for
 *     a day. Position 1 is not a preference; it is what makes the check unconditional. */
{
  const chain = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts.test
    .split("&&").map((s) => s.trim());
  const at = chain.findIndex((c) => /stray_probe_check/.test(c));
  if (at < 0) fail("stray_probe_check is not in `npm test` at all");
  else if (at !== 0) {
    fail(`stray_probe_check runs ${at + 1}th, so ${at} gate(s) can silence it by failing first — exactly what happened on 2026-09-03. It must run FIRST.`);
  } else pass("stray_probe_check runs FIRST — no gate can switch it off by failing");
}

/* 5 — ⛔ AND IT MUST NOT DEPEND ON ANYONE RUNNING `npm test`. The 183-browser night had no suite run
 *     in it at all. The reaper is wired to turn-end so it happens whether or not a session tests. */
{
  let s = "";
  try { s = readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"); }
  catch { fail(".claude/settings.json is unreadable, so nothing can be said about the hooks"); }
  if (s) {
    const j = JSON.parse(s);
    const wired = (evt) => JSON.stringify(j.hooks?.[evt] ?? []).includes("kill_stray_probes");
    if (!wired("Stop")) fail("the reaper is not wired to the Stop hook — it would only ever run when somebody remembers, which is the state that cost him 15GB overnight");
    else if (!wired("SubagentStop")) fail("the reaper runs at Stop but not SubagentStop — a subagent that launches a browser and ends is exactly how one is abandoned");
    else pass("the reaper runs at the end of every turn AND every subagent, not only when the suite is run");
  }
}

console.log(failed ? `\nFAIL — ${failed} failure(s).` : "\nPASS — abandoned browsers are killed automatically, and the detector runs first so nothing can silence it.");
process.exit(failed ? 1 : 0);
