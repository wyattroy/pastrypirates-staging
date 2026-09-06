#!/usr/bin/env node
/* GATE: every sound the game names must exist on disk.
 *
 *   node scripts/qa/sfx_files_exist_check.mjs
 *
 * WHY, AND IT IS A LIVE ONE FROM THE DAY IT WAS WRITTEN. On 2026-09-06 five branches were merged
 * into `dev`. The big branch had REVERTED the SFX add ("the SFX work moves to sep06-sfx"); the
 * sound branch still had it. Git saw "deleted on our side, unchanged on theirs" and kept the two
 * mp3s deleted — no conflict, no warning, nothing to resolve. `src/ui/audio.js` went on naming ten
 * stems while `sfx/` held eight, and `npm test` passed with 102 green gates.
 *
 * It was caught by loading the staging site and reading the network log: two 404s. That is the
 * expensive way to find it. This is the cheap way.
 *
 * `asset_paths_exist_check.mjs` is deliberately about PICTURES and says so; sound was in nobody's
 * remit. This is that half.
 *
 * DERIVED, NOT LISTED — CLAUDE.md, "nothing is a constant". The gate reads `SFX_FILES` out of
 * src/ui/audio.js, which is the module's own single source of every fetch URL. Adding an eleventh
 * stem needs no edit here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDIO = path.join(REPO, "src", "ui", "audio.js");
const SFX_DIR = path.join(REPO, "sfx");

const failures = [];
const ok = m => console.log("  PASS ", m);
const bad = m => { failures.push(m); console.log("  FAIL ", m); };

console.log("sfx_files_exist_check — every sound the game names must exist\n");

const src = fs.readFileSync(AUDIO, "utf8");
const m = src.match(/const\s+SFX_FILES\s*=\s*\[([^\]]*)\]/);
if (!m) {
  bad(`could not find the SFX_FILES array in ${path.relative(REPO, AUDIO)} — the gate cannot ` +
      `derive what to check, so it fails rather than passing on nothing.`);
} else {
  const want = m[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  if (want.length === 0) {
    bad("SFX_FILES is empty — a gate that checks zero files is not a green gate.");
  } else {
    const missing = want.filter(stem => !fs.existsSync(path.join(SFX_DIR, `${stem}.mp3`)));
    if (missing.length) {
      bad(`src/ui/audio.js names ${want.length} stem(s); ${missing.length} have no file in sfx/: ` +
          `${missing.map(s => s + ".mp3").join(", ")}. Every one of these is a 404 in the browser ` +
          `and a sound a player never hears.`);
    } else {
      ok(`all ${want.length} stem(s) named in SFX_FILES have an mp3 in sfx/`);
    }

    /* The other direction is a WARNING, never a failure: an unused file costs a player nothing,
       and Luis delivers sounds before the code that plays them. */
    const onDisk = fs.readdirSync(SFX_DIR).filter(f => f.endsWith(".mp3")).map(f => f.slice(0, -4));
    const unused = onDisk.filter(s => !want.includes(s));
    console.log(unused.length
      ? `  note   ${unused.length} mp3 in sfx/ that the game never asks for: ${unused.join(", ")}`
      : "  PASS   no orphaned mp3 in sfx/ either");
  }
}

console.log(failures.length ? `\nFAIL — ${failures.length} failure(s)` : "\nPASS — 0 failure(s)");
process.exit(failures.length ? 1 : 0);
