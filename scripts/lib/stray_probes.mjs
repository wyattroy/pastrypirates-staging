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
import fs from "node:fs";
import path from "node:path";

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

/* ⛔ THE ONLY SAFE WAY TO SWEEP A PROBE'S BROWSER — Wyatt, 2026-09-10: "will finally { killAll() }
 * kill processes running in other claude sessions? it must not."
 *
 * IT COULD, IN SIX SCRIPTS, AND EVERY ONE CARRIED A COMMENT SAYING IT WAS SCOPED. They swept with
 * `pkill -f "remote-debugging-port=<port>"`, and a port is not an identity: every probe picks one
 * as `base + (process.pid % N)`, so two unrelated processes collide the moment their pids agree
 * modulo N — and the bases overlap between probes as well (two start at 9790). The first session to
 * finish killed whatever else had landed on the same number.
 *
 * A PROFILE DIRECTORY IS an identity: `<repo>/.tmp-<probe>-<pid>` names one run of one probe in one
 * worktree. Another session cannot land on it even at the same pid modulo, and a different worktree
 * cannot match it at all.
 *
 * (There is deliberately NO equivalent for the python http server. Its command line is
 * `python -m http.server <port>` and nothing in it is unique — cwd is not in argv — so any pattern
 * broad enough to find it is broad enough to kill somebody else's, including the one Wyatt runs on
 * port 8000. Kill it as the child process it is.)
 */
export function killProfile(dir) {
  if (!dir) return;
  try { execFileSync("/bin/sh", ["-c", `pkill -f ${JSON.stringify("--user-data-dir=" + dir)}`], { stdio: "ignore" }); }
  catch { /* nothing matched, which is the normal case */ }
}

/* ⭐ AND THE DIRECTORY OUTLIVES THE BROWSER — 2026-09-15, 188 of them, 9.8 GB, in one worktree.
 *
 * Everything above this line reaps PROCESSES. Nothing reaped the folders they ran out of, so a
 * machine could pass `stray_probe_check` — no browsers running, genuinely clean — while nearly ten
 * gigabytes of dead Chrome profiles sat in a worktree. Wyatt found them; the instrument could not,
 * because it was never asked the question.
 *
 * WHY THEY SURVIVE. `launch()` wipes its profile directory on the way IN, not on the way out, and
 * `killAll()` / `reapOrphans()` only ever end processes. A probe that exits cleanly therefore leaves
 * its ~50 MB folder standing, and `checks_pointer_events_redproof.mjs` is IN `npm test` — so every
 * suite run on this machine dropped another one. 188 is what a fortnight of that looks like.
 *
 * ⛔ THREE THINGS IT MUST NOT DELETE, and each one is why the checks below are not padding:
 *   - a profile a browser is USING right now. Same restraint as the reaper: an in-flight posed
 *     board or a sea trial at sea must survive a tidy-up, or the first person it hurts turns it off.
 *   - a `.tmp-` directory that is not a profile at all. `asset_quantize.mjs` writes `.tmp-quant`,
 *     `art_posed_pair.mjs` writes copies of the art tree — somebody's OUTPUT, sitting under the same
 *     prefix. So "is it a Chrome profile?" is answered by what Chrome itself puts there, never by
 *     the name.
 *   - anything recent. A day is far longer than any probe runs and far shorter than the mess takes
 *     to build, so nothing a session might still be looking at is ever in range.
 *
 * And a FAILED LOOK DELETES NOTHING — the rule this whole family was written after. If the process
 * table cannot be read, `held` is unknown, so every directory might be in use and none are swept.
 */
export const STALE_PROFILE_MS = 24 * 60 * 60 * 1000;

/** Every `--user-data-dir=` on this machine's process table, as a Set of paths.
 *  THROWS if it cannot look — an empty set means "nothing is held", which is the opposite fact.
 *
 *  A path containing spaces comes back truncated at the first one (the Claude app's own
 *  `…/Application Support/Claude` does). That is harmless HERE and deliberately not worked around:
 *  the only paths this set is ever compared against are `<repo>/.tmp-*`, which have no spaces, and
 *  a truncated foreign path cannot collide with one. */
export function liveProfileDirs() {
  let raw;
  if (isWin) {
    const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '--user-data-dir=' } | ForEach-Object { $_.CommandLine }`;
    raw = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" });
  } else {
    raw = execFileSync("/bin/sh", ["-c",
      "ps -eo command | grep -- '--user-data-dir=' | grep -v grep || true"], { encoding: "utf8" });
  }
  const held = new Set();
  for (const m of String(raw).matchAll(/--user-data-dir=(\S+)/g)) held.add(m[1].replace(/["']/g, ""));
  return held;
}

/** Is this directory a Chrome profile, as opposed to some probe's output folder that happens to
 *  share the `.tmp-` prefix? Asked of Chrome's own bookkeeping, which it writes on first run and
 *  which nothing else in this repo produces. */
export function isChromeProfile(dir) {
  try { return fs.existsSync(path.join(dir, "Local State")) || fs.statSync(path.join(dir, "Default")).isDirectory(); }
  catch { return false; }
}

/** Delete `<repoRoot>/.tmp-*` Chrome profile DIRECTORIES that are older than `maxAgeMs` and that no
 *  live browser is holding. Same scope as `reapOrphans` — this repo's own prefix, nothing else on
 *  the machine. Returns `{ swept, bytes, looked }`; never throws. */
export function sweepStaleProfiles(repoRoot, { maxAgeMs = STALE_PROFILE_MS, now = Date.now(), dryRun = false, held = null } = {}) {
  /* `held` is injectable ONLY so the restraint can be red-proofed. The bug this family keeps
     meeting is a safety check nothing could reach — `isOrphan` was extracted for exactly this
     reason — and "does it spare a profile a browser is using?" is the one question here whose
     wrong answer breaks live work. The default path asks the OS and nothing changes. */
  if (!held) {
    try { held = liveProfileDirs(); }
    catch { return { swept: [], bytes: 0, looked: false }; }   // could not look -> delete NOTHING
  }
  let entries;
  try { entries = fs.readdirSync(repoRoot, { withFileTypes: true }); }
  catch { return { swept: [], bytes: 0, looked: false }; }
  const swept = [];
  let bytes = 0;
  for (const ent of entries) {
    if (!ent.name.startsWith(".tmp-")) continue;
    if (!ent.isDirectory()) continue;                 // `.tmp-about-before.html` is a FILE, not ours
    const dir = path.join(repoRoot, ent.name);
    if (held.has(dir)) continue;                      // a browser is in it right now
    if (!isChromeProfile(dir)) continue;              // somebody's output, not a profile
    let st;
    try { st = fs.statSync(dir); } catch { continue; }
    /* ⚑ mtime, AND DELIBERATELY NOT ctime OR birthtime. A first version took the newest of all
       three, reasoning that a folder should only go when every clock agrees it is old — and the
       gate caught it, red, on a three-day-old profile it refused to sweep. ctime is the INODE
       CHANGE time: it answers "when did this directory's metadata last change", not "when was this
       profile last used", and nothing can set it, so no test could ever pose an old folder and the
       sweep would have shipped never deleting anything. mtime is what `find -mtime` means and what
       "last touched" means. Age is only the coarse filter here anyway — a profile that is genuinely
       IN USE is spared by `held` above, which asks the process table, not a clock. */
    if (now - st.mtimeMs < maxAgeMs) continue;
    let size = 0;
    try { size = dirBytes(dir); } catch {}
    if (dryRun) { swept.push(dir); bytes += size; continue; }
    try { fs.rmSync(dir, { recursive: true, force: true }); swept.push(dir); bytes += size; } catch {}
  }
  return { swept, bytes, looked: true };
}

/** Bytes, in the unit a person reads. The first version of the sweep's report said "0.00 GB" after
 *  freeing four megabytes, which is a line that tells Wyatt nothing. */
export function humanBytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} bytes`;
}

/** Bytes under a directory. Only ever called on something already judged sweepable, so it is
 *  allowed to be approximate — it exists so the report can say what was freed. */
function dirBytes(dir) {
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, ent.name);
    try { total += ent.isDirectory() ? dirBytes(f) : fs.statSync(f).size; } catch {}
  }
  return total;
}

/* ⭐ ONE "TIDY UP BEFORE YOU LAUNCH", SHARED BY EVERY LAUNCHER — rule 23.
 *
 * `mp_rig.launch()` had its own memoised reap; `cdp.openChrome()` had none at all, and it is the
 * mount behind `board_decodes_probe`, `storm_rain_posed`, `asset_quantize_verify` and the WebKit
 * legs. Two launchers, one of them tidying, is how 9.8 GB accumulates in the worktree that happened
 * to use the other. The flag lives here, in the module both import, so it is genuinely once per
 * process however many launchers a probe uses. */
let tidied = false;
export function reapOnce(repoRoot) {
  if (tidied) return { killed: [], swept: [], bytes: 0, ran: false };
  tidied = true;
  let killed = [];
  try { ({ killed } = reapOrphans(repoRoot)); } catch {}
  let swept = [], bytes = 0;
  try { ({ swept, bytes } = sweepStaleProfiles(repoRoot)); } catch {}
  return { killed, swept, bytes, ran: true };
}
