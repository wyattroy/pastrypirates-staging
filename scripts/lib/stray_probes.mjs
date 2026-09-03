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
    return `${m[1]}|${m[3].slice(0, 24)}|${alive.has(m[2]) ? "parent-alive" : "orphan"}`;
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
