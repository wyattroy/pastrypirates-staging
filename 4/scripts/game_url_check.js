#!/usr/bin/env node
// 4/scripts/game_url_check.js
//
// THE BROWSER FLEET MUST AGREE ON WHERE THE GAME IS, AND THAT PLACE MUST HOLD THE GAME.
//
// WHAT THIS COST, 2026-08-26. The v2.0 cutover promoted `4/` to the repo root, leaving `4/` holding
// only `scripts/`. Twelve browser scripts had `http://127.0.0.1:${PORT}/4/` hardcoded — 22 sites —
// and another 15 files did in-page `import("/4/src/…")`, 49 more. Seventy-seven references, none of
// which any gate could see.
//
// The failure was not loud. Chrome opened, python's http.server answered 200 with a DIRECTORY
// LISTING for `4/`, and every script then failed on the first thing it looked for with the same
// uninformative message: "solo card not clickable". THE ENTIRE SEA TRIAL WAS POINTED AT AN EMPTY
// DIRECTORY and read as the game being broken. The seeded-defect drill, run against it, dutifully
// reported "4 REAL GAP(S) — the sea trial would not have found these" about four bugs it had never
// got within a mile of. docs/HARD-WON-LESSONS.md §3: a gate aimed at the wrong tree is not silent,
// it is REASSURING.
//
// doc_command_check.js predicted exactly this class in its own header — "the v2.0 cutover will move
// every 4/scripts/... path, so on that day the docs will confidently name files that do not exist"
// — and guards the DOCS. Nobody guarded the URLs the browser scripts navigate to. This does.
//
// It is CLAUDE.md rule 23 in gate form: the design-time question is *what makes these agree?* The
// answer is now `gameURL()` in 4/scripts/lib/chrome.mjs, and this fails the build if a second
// spelling appears beside it.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = path.join(REPO, "4", "scripts");

let failures = 0;
const fail = (what) => { failures++; console.log(`  FAIL  ${what}`); };
const pass = (what) => console.log(`  PASS  ${what}`);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name))
  : /\.(mjs|js)$/.test(e.name) ? [path.join(dir, e.name)] : []);
const FILES = walk(SCRIPTS);

/* The one place allowed to name the path, plus the two files whose `/4/` is PROSE about this very
   incident. Everything else must go through gameURL()/GAME_PATH. */
const OWNER = path.join(SCRIPTS, "lib", "chrome.mjs");
const PROSE_OK = new Set([OWNER, path.join(SCRIPTS, "lib_twin_check.js"), path.join(SCRIPTS, "game_url_check.js")]);

console.log("game_url_check — one spelling of where the game is served, and it must be the game\n");

// 1. GAME_PATH must actually point at the game. This is the check that would have caught the cutover.
let gamePath = null;
{
  const src = fs.readFileSync(OWNER, "utf8");
  const m = src.match(/export const GAME_PATH\s*=\s*["'`]([^"'`]*)["'`]/);
  if (!m) fail("4/scripts/lib/chrome.mjs does not export GAME_PATH — the fleet has no single spelling");
  else {
    gamePath = m[1];
    const idx = path.join(REPO, gamePath, "index.html");
    if (!fs.existsSync(idx)) fail(`GAME_PATH is "${gamePath}" but ${path.relative(REPO, idx)} does not exist`);
    else {
      const html = fs.readFileSync(idx, "utf8");
      /* Not "a file is there" — the game specifically. Every driver's first act is clicking
         #choiceSolo, so its absence is precisely what breaks them, and a directory listing or the
         wrong tree's index.html would both pass a mere existence check. */
      if (!html.includes("choiceSolo")) fail(`GAME_PATH "${gamePath}" has an index.html with no #choiceSolo — that is not the game the drivers drive`);
      else pass(`GAME_PATH "${gamePath}" serves the game (index.html has #choiceSolo)`);
    }
  }
}

// 2. Nobody else may hardcode a local game URL.
{
  const bad = [];
  for (const f of FILES) {
    if (PROSE_OK.has(f)) continue;
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      /* fetch() is the CDP/WebKit CONTROL PLANE — /json/new, /json/list, /json/version, /status —
         and those hardcoded hosts are correct. The game is NAVIGATED to, never fetched. The first
         version of this check had no such discriminator and condemned all nine of them; every one
         works. CLAUDE.md rule 6: when a check condemns something known to work, suspect the check. */
      if (/fetch\(/.test(line)) return;
      if (/https?:\/\/(127\.0\.0\.1|localhost):\$\{[^}]+\}\//.test(line) && !/contact-|judge-queue/.test(line))
        bad.push(`${path.relative(REPO, f)}:${i + 1}`);
    });
  }
  if (bad.length) fail(`${bad.length} hardcoded local game URL(s) — use gameURL(port) from lib/chrome.mjs: ${bad.slice(0, 6).join(", ")}`);
  else pass("no script hardcodes a local game URL; all navigation goes through gameURL()");
}

// 3. No in-page module import may name a tree that the cutover can move.
{
  const bad = [];
  for (const f of FILES) {
    if (PROSE_OK.has(f)) continue;
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      const m = line.match(/import\(\s*["'`](\/(?!src\/)[^"'`]*\/src\/[^"'`]*)["'`]/);
      if (m) bad.push(`${path.relative(REPO, f)}:${i + 1} -> ${m[1]}`);
    });
  }
  if (bad.length) fail(`${bad.length} in-page import(s) naming a non-root tree — these 404 the moment a tree moves: ${bad.slice(0, 5).join(", ")}`);
  else pass("no in-page import names a tree other than the served root");
}

// 4. RED-PROOF. A check that has never been seen to fail is not a check (CLAUDE.md rule 6).
{
  const synthetic = 'await c.nav(`http://127.0.0.1:${PORT}/4/`); await import("/4/src/ui/index.js");';
  const cdpLine   = 'tgt = await (await fetch(`http://127.0.0.1:${dbgPort}/json/new?about:blank`, { method: "PUT" })).json();';
  const urlRe = /https?:\/\/(127\.0\.0\.1|localhost):\$\{[^}]+\}\//;
  const impRe = /import\(\s*["'`](\/(?!src\/)[^"'`]*\/src\/[^"'`]*)["'`]/;
  const catchesURL = urlRe.test(synthetic) && !/fetch\(/.test(synthetic);
  const catchesImport = impRe.test(synthetic);
  /* BOTH DIRECTIONS. A gate that only proves it can go red is half a gate — the version before this
     one went red on nine CDP control-plane fetches that are all correct. So the red-proof also
     asserts the gate stays QUIET on the line it must never flag. */
  const sparesCDP = /fetch\(/.test(cdpLine);
  if (catchesURL && catchesImport && sparesCDP) pass("red-proof: catches the line that broke the fleet, and spares the CDP fetch it must not flag");
  else fail(`red-proof FAILED (url:${catchesURL} import:${catchesImport} sparesCDP:${sparesCDP})`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
