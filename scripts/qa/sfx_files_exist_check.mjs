#!/usr/bin/env node
/* GATE: every sound the game names must exist on disk, at the path the game will actually fetch.
 *
 *   node scripts/qa/sfx_files_exist_check.mjs
 *
 * WHY, AND IT IS A LIVE ONE FROM THE DAY IT WAS WRITTEN. On 2026-09-06 five branches were merged
 * into `dev`. The big branch had REVERTED the SFX add ("the SFX work moves to sep06-sfx"); the
 * sound branch still had it. Git saw "deleted on our side, unchanged on theirs" and kept the two
 * mp3s deleted — no conflict, no warning, nothing to resolve. The audio module went on naming ten
 * stems while `sfx/` held eight, and `npm test` passed with 102 green gates.
 *
 * It was caught by loading the staging site and reading the network log: two 404s. That is the
 * expensive way to find it. This is the cheap way.
 *
 * `asset_paths_exist_check.mjs` is deliberately about PICTURES and says so; sound was in nobody's
 * remit. This is that half.
 *
 * ⭐ IT ASKS `stemUrl()` WHERE A FILE IS, RATHER THAN BUILDING A PATH OF ITS OWN — 2026-09-19, when
 * the flat `sfx/` became `sfx/<pack>/<folder>/` so a second map can bring its own sounds. A gate
 * that built the path itself would have been a SECOND answer to "where is this file?", and the two
 * would have agreed exactly until the day a pack's fallback mattered — which is the day this gate
 * exists for. Asking the resolver means this check now also proves the resolver, including the
 * fallback to the base pack.
 *
 * DERIVED, NOT LISTED — CLAUDE.md, "nothing is a constant". The lists come out of
 * src/shared/sounds.js, which is pure and imports nothing, so this needs no browser and no edit
 * when an eleventh stem arrives.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SFX_ROOT_DIR = path.join(REPO, "sfx");

const failures = [];
const ok = m => console.log("  PASS ", m);
const bad = m => { failures.push(m); console.log("  FAIL ", m); };

console.log("sfx_files_exist_check — every sound the game names must exist\n");

const S = await import(pathToFileURL(path.join(REPO, "src", "shared", "sounds.js")).href);
/* THE AMBIENCE AND THE MUSIC ARE IN SCOPE TOO. They are loaded by a different path on purpose
   (ambience_one_seam_check holds that), but a missing gull is the same 404 as a missing cannon. */
const AUDIO = fs.readFileSync(path.join(REPO, "src", "ui", "audio.js"), "utf8");
const listIn = name => [...((new RegExp("const " + name + " = \\[([^\\]]*)\\]").exec(AUDIO) || [, ""])[1])
  .matchAll(/"([^"]+)"/g)].map(m => m[1]);
const musicFile = (/const MUSIC_FILE = "([^"]+)"/.exec(AUDIO) || [, ""])[1];
const want = [...new Set([...S.SFX_FILES, ...listIn("AMBIENCE_FILES"), musicFile].filter(Boolean))];

if (want.length < 18) {
  bad(`only ${want.length} stem(s) could be read out of the sound table and the bed — the gate ` +
      `cannot derive what to check, so it fails rather than passing on nothing.`);
} else {
  const missing = want.filter(stem => !fs.existsSync(path.join(REPO, S.stemUrl(stem))));
  missing.length
    ? bad(`${missing.length} of ${want.length} stem(s) have no file where the game will fetch them: ` +
          `${missing.map(s => S.stemUrl(s)).join(", ")}. Every one of these is a 404 in the browser ` +
          `and a sound a player never hears.`)
    : ok(`all ${want.length} stem(s) the game loads have an mp3 at the path stemUrl() resolves them to`);

  /* EVERY STEM IS FILED. A stem with no folder lands at sfx/<pack>/<stem>.mp3 — which works, and
     is exactly the flat heap the folders exist to prevent, so it is a failure rather than a note. */
  const unfiled = want.filter(s => !S.STEM_FOLDER[s]);
  unfiled.length
    ? bad(`${unfiled.length} stem(s) are in no folder: ${unfiled.join(", ")} — give each one a ` +
          `folder in STEM_FOLDER (voyage / ceremony / ambience / music), or a new map cannot tell ` +
          `what it has to supply.`)
    : ok(`all ${want.length} stem(s) are filed under a folder a map can reason about`);

  /* The other direction is a WARNING, never a failure: an unused file costs a player nothing,
     and Luis delivers sounds before the code that plays them. */
  const walk = d => fs.readdirSync(d, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".mp3") ? [path.join(d, e.name)] : []);
  const onDisk = walk(SFX_ROOT_DIR).map(f => path.basename(f, ".mp3"));
  const unused = [...new Set(onDisk.filter(s => !want.includes(s)))];
  console.log(unused.length
    ? `  note   ${unused.length} mp3 under sfx/ that the game never asks for: ${unused.join(", ")}`
    : "  PASS   no orphaned mp3 under sfx/ either");

  /* ⛔ AND NOTHING MAY SIT LOOSE AT THE ROOT. That is the pre-2026-09-19 shape, and a file left
     there is a file no pack owns — it would keep working for this map and be invisible to the next. */
  const loose = fs.readdirSync(SFX_ROOT_DIR).filter(f => f.endsWith(".mp3"));
  loose.length
    ? bad(`${loose.length} mp3 sit loose at sfx/: ${loose.join(", ")} — every sound belongs to a ` +
          `pack, at sfx/<pack>/<folder>/. A loose file is one no map owns.`)
    : ok("no mp3 sits loose at sfx/ — every sound belongs to a pack");
}

console.log(failures.length ? `\nFAIL — ${failures.length} failure(s)` : "\nPASS — 0 failure(s)");
process.exit(failures.length ? 1 : 0);
