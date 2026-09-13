// chrome.mjs — the ONE place the browser drivers learn where the repo and Chrome are.
// Cloud-runnable (2026-08-21, Wyatt: "I want to be able to run all future sessions in the cloud"):
// nothing here is typed for one machine. Importers: mouse_qa.mjs, mp_rig.mjs, stage_layout_check.mjs.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// repo root from this file's own location (scripts/lib -> repo), never a literal path
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// $CHROME_BIN wins; then the PATH (Linux cloud image: google-chrome / chromium / chromium-browser);
// then the Mac app bundle. Fail loudly — a missing binary otherwise reads as "chrome never came up".
export const CHROME = (() => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  if (process.platform !== "win32") {
    for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
      try { const p = execSync(`command -v ${n}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); if (p) return p; } catch {}
    }
    const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(mac)) return mac;
  } else {
    // WINDOWS. `command -v` does not exist here (it is bash's builtin, and this shell is not
    // bash), so every branch above was a guaranteed miss before this ever ran -- the first attempt
    // on the Razer 2026-08-31 failed with "no Chrome found" while Chrome was installed and running
    // every other browser gate fine. The registry's App Paths key is what `where chrome` and the
    // shell shortcut both resolve through, so it is the one answer that survives a reinstall to a
    // non-default drive; the two Program Files locations below are the fallback if a stripped-down
    // environment has no registry access at all.
    try {
      const out = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve',
        { stdio: ["ignore", "pipe", "ignore"] }
      ).toString();
      const m = out.match(/REG_SZ\s+(.+\.exe)\s*$/m);
      if (m && fs.existsSync(m[1].trim())) return m[1].trim();
    } catch {}
    for (const p of [
      "C:\Program Files\Google\Chrome\Application\chrome.exe",
      "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]) {
      if (fs.existsSync(p)) return p;
    }
    if (process.env.LOCALAPPDATA) {
      const p = path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe");
      if (fs.existsSync(p)) return p;
    }
  }
  console.error("FATAL: no Chrome found — set CHROME_BIN"); process.exit(1);
})();

// Linux containers (the cloud sandbox) need both or headless Chrome dies at launch: the SUID
// sandbox is unavailable when running as root, and /dev/shm is tiny.
export const LINUX_ARGS = process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];

/* ── WHERE THE GAME IS SERVED FROM — ONE SPELLING, IN ONE PLACE ────────────────────────────────
   Every browser script used to hardcode `http://127.0.0.1:${PORT}/4/`. Twenty call sites across
   twelve files, and nothing made them agree — which is CLAUDE.md rule 23 exactly: *what makes
   these two agree?* If the honest answer is "nothing, we keep them in step", that is the defect,
   before a line is written.

   THE COST OF NOT HAVING THIS, PAID 2026-08-26. The cutover promoted `4/` to the repo root, so
   `4/` holds only `scripts/`. Every one of those twenty navigations then loaded python's directory
   listing for `4/` instead of the game. The browser opened, the page loaded, HTTP 200 — and the
   first thing each script looked for (`#choiceSolo`) was not there, so they all died with the same
   uninformative "solo card not clickable". THE ENTIRE SEA TRIAL WAS POINTED AT AN EMPTY DIRECTORY
   and reported it as the game being broken. docs/DRIVING-THE-GAME.md had already been updated and
   no longer mentions `/4/` anywhere; the doc was right and the code it documents was orphaned.

   So: change it HERE, once, and every driver moves with it. If the game ever moves again, this
   constant is the only edit — and `game_url_check.js` fails the build if a new hardcoded URL
   appears beside it. */
export const GAME_PATH = "/";
export const gameURL = (port, host = "127.0.0.1") => `http://${host}:${port}${GAME_PATH}`;

/* ── AND ONE SPELLING FOR THE FROZEN v1, FOR THE SAME REASON ───────────────────────────────────
   `/classic` is v1, frozen and not developed, and it is a REAL permanent tree — but it is still a
   tree, and the rule above is not "the root is special", it is *nobody hand-types where a game
   lives*. A probe that photographs the frozen game has to name it, and the moment it names it as a
   string literal we are back to call sites that nothing makes agree.

   WHAT MADE THIS CONCRETE, 2026-09-02: `pastry_shipped_art_probe.mjs` was added to photograph the
   frozen v1's recipe modal (CEO 96 asked for it, correctly), wrote `/classic/src/ui/recipe.js` by
   hand, and turned the whole suite red — 95 of 96 — for about ninety minutes. The gate was right.
   The answer is not an exemption; it is to give the second tree the same single spelling the first
   one has, and then GUARD it twice over: `game_url_check.js` case 1b asserts this path really
   serves the frozen game, and case 2b fails the build if any script hand-types the address instead
   of importing it from here.

   ⚠ THE SCOPE, EXACTLY, because the first version of this comment overclaimed and CEO 99 caught it
   within the hour: these two constants own the URL a browser is NAVIGATED to. Repo-relative file
   reads of the frozen tree (`classic/src/shared/index.js`) resolve on disk, not over HTTP, and are
   deliberately outside both. */
export const CLASSIC_PATH = "/classic/";
/* No `classicURL()` twin of `gameURL()` here on purpose. The first draft exported one and NOTHING
   called it (CEO 99) — and an export with no caller has no red-proof and no user, so if it were
   wrong nothing would say so. Every classic-facing probe already has its own origin and needs only
   the path. Add it the day something calls it. */

/* ── ONE SPELLING FOR "run python", FOR THE SAME REASON AS CHROME ABOVE ────────────────────────
   Every driver that serves the tree over HTTP hardcoded `spawn("python3", ["-m", "http.server", ...])`
   -- twelve call sites, none of them agreeing with what is actually on the machine running them.
   `python3` is the Linux/Mac spelling; this checkout's Windows Python (python.org installer, the
   Razer, 2026-08-31) registers only as `python`, so every one of those twelve spawns failed with
   ENOENT the first time anything tried to serve a leg here -- found running exactly the short
   playtest leg this fix exists to unblock.

   Resolved the same way CHROME is: prefer an explicit override, then try each spelling in turn,
   and fail loudly rather than let a dead spawn read as "the server never came up". */
export const PYTHON = (() => {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  for (const n of ["python3", "python"]) {
    try {
      execSync(`${process.platform === "win32" ? "where" : "command -v"} ${n}`, { stdio: ["ignore", "pipe", "ignore"] });
      return n;
    } catch {}
  }
  console.error("FATAL: no python found — set PYTHON_BIN"); process.exit(1);
})();

/* ── A STATIC SERVER THAT DOES NOT TURN CALLERS AWAY ──────────────────────────────────────────
   `python -m http.server` listens with Python's default accept backlog: socketserver's
   request_queue_size = 5. When that queue is full, WINDOWS answers the next connection with a
   reset, which Chrome reports as ERR_CONNECTION_REFUSED and does not retry for a module script.
   macOS and Linux tend to drop the SYN instead, so the client retransmits and merely waits. That
   difference is why this only ever bit on the Windows laptop.

   What it cost, 2026-09-13: ten legs at --parallel=10 on Wy-Blade, and five to seven of the seven
   Chrome legs sat on "Hoisting the sails..." for the whole run. A read-only probe found every stuck
   page holding "Failed to load resource: net::ERR_CONNECTION_REFUSED" for its own /src/ modules --
   the module graph never completed, so boot() never ran. The rig reported "solo card not
   clickable", and the first fix, waiting longer for the card, still lost six of seven, because no
   wait can finish a page that is missing orchestrator.js.

   Measured before this was written: 60 simultaneous connections, three rounds, against the CLI
   exactly as the rig started it, refused 1, 0 and 2. The identical CLI with only this backlog
   raised refused 0, 0 and 0.

   So every server that serves the tree goes through this ONE spelling, which runs the stock CLI
   untouched except for the backlog. 512 is capacity, not a timing guess: comfortably above the
   ~40 simultaneous connections ten Chromes open, and the OS clamps it to its own maximum anyway.
   The argv still names http.server, but nothing identifies a server by argv: stray_probes.mjs
   deliberately kills these as the child processes they are. */
export const STATIC_SERVER_BACKLOG = 512;
export const staticServerArgs = (port) => ["-c",
  "import runpy, socketserver, sys; " +
  `socketserver.TCPServer.request_queue_size = ${STATIC_SERVER_BACKLOG}; ` +
  `sys.argv = ['http.server', '${+port}']; ` +
  "runpy.run_module('http.server', run_name='__main__')"];
