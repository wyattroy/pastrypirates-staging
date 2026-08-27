// chrome.mjs — the ONE place the browser drivers learn where the repo and Chrome are.
// Cloud-runnable (2026-08-21, Wyatt: "I want to be able to run all future sessions in the cloud"):
// nothing here is typed for one machine. Importers: mouse_qa.mjs, mp_rig.mjs, stage_layout_check.mjs.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// repo root from this file's own location (4/scripts/lib -> repo), never a literal path
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// $CHROME_BIN wins; then the PATH (Linux cloud image: google-chrome / chromium / chromium-browser);
// then the Mac app bundle. Fail loudly — a missing binary otherwise reads as "chrome never came up".
export const CHROME = (() => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { const p = execSync(`command -v ${n}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); if (p) return p; } catch {}
  }
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(mac)) return mac;
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
