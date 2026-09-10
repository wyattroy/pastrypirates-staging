/* stray_probes.mjs — ONE definition of "a debug browser this machine is running, and whether it is
 * abandoned". Rule 23: two things that must agree are one thing, or they will drift.
 *
 * WHY THIS FILE EXISTS. `stray_probe_check.mjs` could SEE orphaned probes and could only print a
 * command for a human to run. Wyatt, 2026-09-03: *"did you fix this problem so that there are never
 * any abandoned browsers hitting my laptop anymore?"* — and the honest answer was no: the detector
 * had been made reachable again, nothing had been made to act on it. A killer needs the same
 * definition of "orphaned" the detector uses, and a second copy of that query is exactly how the
 * two would come to disagree about what counts.
 *
 * ⛔ ORPHANED, NOT MERELY RUNNING. A debug browser whose launcher is still alive is a probe somebody
 * is USING — a posed board being photographed, a sea trial at sea. One whose parent has exited is
 * abandoned. Killing the first kind would break live work; killing the second is rule 17.
 *
 * WHAT IT COST TO LEARN, 2026-09-02: 183 chrome.exe processes carrying --remote-debugging-port, the
 * oldest more than a day old, holding 15,097 MB, on the laptop he was asleep next to.
 */
import { execFileSync } from "node:child_process";

export const isWin = process.platform === "win32";

/** One line per matching process, as `pid|created|parent-alive|orphan`. Throws if it cannot look —
 *  a failed look is NOT an empty result, and conflating the two is the bug this family exists after. */
/** Is a debug-port browser with this parent ABANDONED? Pure, and exported ONLY so it can be
 *  red-proofed — the bug it now encodes lived inside a function that shells out, which is exactly
 *  why nothing could test it and why it survived long enough to cook Wyatt's laptop twice.
 *  `alive` is the set of PIDs currently in the process table, as strings. */
export function isOrphan(ppid, alive) {
  // re-parented to init: the launcher is gone, whatever the process table says about PID 1
  if (String(ppid) === "1" || String(ppid) === "0") return true;
  return !alive.has(String(ppid));
}

export function askTheOS() {
  if (isWin) {
    // PowerShell, because Get-CimInstance is the only thing here that can see a command line.
    const ps = `$live = @{}; Get-CimInstance Win32_Process | ForEach-Object { $live[[int]$_.ProcessId] = $true }; ` +
               `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | ` +
               `Where-Object { $_.CommandLine -match 'remote-debugging-port' } | ` +
               `ForEach-Object { "$($_.ProcessId)|$($_.CreationDate)|$(if ($live[[int]$_.ParentProcessId]) { 'parent-alive' } else { 'orphan' })" }`;
    return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" });
  }
  /* Mac and Linux. `ps` is present on both; `pgrep` is NOT, and its absence is what made rule 17
     decorative on Windows for as long as Windows has run the relay. */
  const sh = "ps -eo pid,ppid,lstart,command | grep -- '--remote-debugging-port' | grep -v grep || true";
  const raw = execFileSync("/bin/sh", ["-c", sh], { encoding: "utf8" });
  const alive = new Set(execFileSync("/bin/sh", ["-c", "ps -eo pid"], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean).slice(1));
  return raw.split("\n").filter(Boolean).map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) return "";
    /* ⚑ PPID 1 IS AN ORPHAN, AND MISSING THAT MADE THIS WHOLE GATE DECORATIVE — 2026-09-10.
       Wyatt, with his laptop choking: "COME ON MAN!!!! you were supposed to learn this the last
       time!" There were 22 abandoned headless browsers up, several pegging 70-85% CPU, and this
       check had just printed "EVERY ONE has a live launcher — a probe in use, not a leak".
       WHY IT LIED. Every probe here spawns Chrome DETACHED so it outlives the shell. When the
       launcher exits, the kernel re-parents the child to init — PID 1 — which is alive by
       definition and always in the process table. So `alive.has(ppid)` was TRUE for precisely the
       browsers that had been abandoned, and the more thoroughly a probe leaked, the more confident
       this gate was that it had not.
       "Its parent is init" IS the operating system telling you the launcher is gone. That is the
       whole definition of an orphan on Unix, and it was the one case the test could not see. */
    return `${m[1]}|${m[3].slice(0, 24)}|${isOrphan(m[2], alive) ? "orphan" : "parent-alive"}`;
  }).filter(Boolean).join("\n");
}

/** `pid|created|state` lines -> [{pid, created, orphan}]. Same shape on every platform. */
export function parseProbes(text) {
  return String(text).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split("|");
    return { pid: Number(p[0]), created: (p[1] || "").trim(), orphan: /orphan/.test(p[2] || "") };
  }).filter((p) => Number.isFinite(p.pid) && p.pid > 0);
}

/** Kill one process. Returns true if it is gone afterwards. Never throws. */
export function killPid(pid) {
  try {
    if (isWin) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(pid, "SIGKILL");
  } catch { /* already gone, or not ours to kill — verified below either way */ }
  /* ⛔ A BARE catch HERE COUNTS SOMEBODY ELSE'S BROWSER AS KILLED. `process.kill(pid, 0)` throws two
     different things and they mean opposite facts: ESRCH is "the process is gone" (we killed it),
     EPERM is "it is very much alive, it just is not ours to touch". Treating both as success made
     the reaper report kills it had not made — CEO 182. Only ESRCH is a death. */
  try { process.kill(pid, 0); return false; }
  catch (e) { return String(e?.code ?? "") !== "EPERM"; }
}

/* ⭐ THE REAPER — added 2026-09-10, after twenty-two abandoned browsers cooked Wyatt's laptop.
 *
 * ONE implementation, used by BOTH the rig (before it launches) and the Stop hook (before I
 * reply), because two copies of "which processes are mine to kill" is two answers waiting to
 * disagree — and the thing they disagree about is whether to SIGKILL something.
 *
 * WHY KILLING ORPHANS IS NOT ENOUGH ON ITS OWN, and why the rig calls this too: a probe leaks
 * precisely when it CANNOT clean up after itself — the node process is SIGKILLed by a tool
 * timeout, so its `finally { killAll() }` never runs. No amount of discipline inside the probe
 * covers that. Reaping at the START of the next launch makes leaks self-limiting instead: the
 * worst case becomes one stray browser between runs rather than twenty-two across an afternoon.
 *
 * SCOPED, ALWAYS. It kills only processes whose --user-data-dir sits under `<repo>/.tmp-`, which
 * this repo's probes own and nothing else on the machine uses. A bare `pkill -f
 * remote-debugging-port` kills every other agent's browser on the machine, and this project paid
 * for that lesson on 2026-08-21.
 */
export function reapOrphans(repoRoot, { dryRun = false } = {}) {
  const prefix = `--user-data-dir=${repoRoot}/.tmp-`;
  let listed = "";
  try {
    listed = execFileSync("/bin/sh", ["-c",
      "ps -eo pid,ppid,command | grep -- '--remote-debugging-port' | grep -v grep || true"],
      { encoding: "utf8" });
  } catch { return { killed: [], spared: [], looked: false }; }
  const alive = new Set(execFileSync("/bin/sh", ["-c", "ps -eo pid"], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean).slice(1));
  const killed = [], spared = [];
  for (const line of listed.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    if (!m[3].includes(prefix)) continue;              // not ours — never touch it
    if (!isOrphan(m[2], alive)) { spared.push(m[1]); continue; }   // somebody is driving it
    if (dryRun) { killed.push(m[1]); continue; }
    try { process.kill(Number(m[1]), "SIGKILL"); killed.push(m[1]); } catch {}
  }
  return { killed, spared, looked: true };
}
