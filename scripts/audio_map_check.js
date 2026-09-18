#!/usr/bin/env node
/* AUDIO MAP GATE — the SFX event map has no duplicate key, and every sound file in `sfx/` is
 * DECLARED somewhere: in `SFX_VOLUME`, or in the ambience bed / music tables that carry their own
 * levels.
 *
 * WHY THIS EXISTS. docs/AUDIO.md DEFECT-1/DEFECT-2: `src/ui/audio.js` mapped `anchorHold` TWICE
 * inside the same `EVENT_SOUND` object literal — once paired with `fishing`, once (later, silently
 * winning) paired with `storm`. `fishing.mp3` was downloaded and decoded every game and could never
 * play; one anchoring ship dumped an 8-second storm bed on the master bus at roughly three times the
 * level the storm is mixed to sit. `scripts/audio_mapping_test.js` (the pre-existing suite) never
 * mentioned `anchorHold` or `fishing` at all and nothing anywhere checked the literal for duplicate
 * keys — so the green tick it produced was not evidence; that check could not fail on this defect.
 * This is the gate `docs/AUDIO.md` asks for by name.
 *
 * WHAT IT ASSERTS.
 *   (a) No event key appears twice in the `EVENT_SOUND` object literal.
 *   (b) Every `.mp3` in `sfx/` is named by one of the tables in `src/ui/audio.js` — `SFX_VOLUME`
 *       for a one-shot, `AMBIENCE_FILES`/`MUSIC_FILE` for the bed and the song, which set their
 *       own gains and never read `SFX_VOLUME`. A file no table names is a file whose loudness
 *       nobody chose.
 *
 *       RULE (b) USED TO SAY THE OPPOSITE OF THE TRUTH — "every stem has a value other than the
 *       untouched default 1, and docs/AUDIO.md DEFECT-3 carries the measured replacement for
 *       each". DEFECT-3's table holds SIX DIFFERENT stems and no value for any of the nine it
 *       accused; the nine sit at 1 by Wyatt's own ruling (q7, 2026-09-06). Repaired on `dev` in
 *       commit bc6c25cb — that repair is Mac: Dev's, brought here and wired into the chain.
 *
 *       THE FILTER, DECLARED (this gate drops samples, so it says how many and why, every run):
 *       the ambience and music stems are excluded from the SFX_VOLUME half, and the pass line
 *       prints the count. They are not hardcoded by name — they are read from `AMBIENCE_FILES`
 *       and `MUSIC_FILE` in the file under test, so a stem that falls out of those tables is
 *       reported as undeclared rather than quietly skipped. The error runs TOWARD the alarm: a
 *       rotted anchor makes this gate shout, never go quiet.
 *
 * RED-PROOFED, not merely written: run against the pre-fix commit's copy of this file
 * (`git show 95ca2d7:src/ui/audio.js`) before this gate existed, it exits 1 on BOTH assertions —
 * `anchorHold` mapped twice, and all six `SFX_VOLUME` entries still `1`. See
 * `.planning/phases/02.2-a-captain-who-cannot-take-their-turn/02.2-01-SUMMARY.md` for the transcript
 * of that run. A check that cannot fail is not protection (CLAUDE.md rule 6).
 *
 * Plain Node, no test library, no browser globals touched — same shape as every other `scripts/*`
 * gate. Optional first CLI arg overrides the file path (used only for the red-proof run above; the
 * real gate always reads the live file with no arguments).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] || join(__dirname, "..", "src", "ui", "audio.js");
const SFX_DIR = join(__dirname, "..", "sfx");
const src = readFileSync(TARGET, "utf8");

const failures = [];
let tally = null;

/* Strip `/* *​/` blocks and `//` tails before matching keys, so a stem merely MENTIONED in prose is
   never counted as a declaration. Both halves use this. It matters in BOTH directions: half (a)
   would count a commented key as a duplicate mapping; half (b) would count `a touch fuller: 0.41`
   in SFX_VOLUME's own comment trail as a declared stem called "fuller" — harmless on its own, but
   a comment reading "cannon: 1" would then MASK a cannon nobody had actually declared. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map(line => line.replace(/\/\/.*$/, ""))
  .join("\n");

// ---- (a) no duplicate key in the EVENT_SOUND object literal ----
const mapStart = src.indexOf("const EVENT_SOUND = {");
if (mapStart === -1) {
  failures.push("could not find `const EVENT_SOUND = {` — has the map been renamed or restructured?");
} else {
  // Walk forward from the opening brace, tracking nesting depth, to find the literal's own close.
  const braceOpen = src.indexOf("{", mapStart);
  let depth = 0, i = braceOpen, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) {
    failures.push("EVENT_SOUND's opening brace never closes — malformed literal");
  } else {
    const body = src.slice(braceOpen + 1, end);
    const withoutComments = stripComments(body);
    // Bare-identifier object keys only (`key: value`), which is every key this literal uses —
    // no quoted or computed keys appear in EVENT_SOUND.
    const keyRe = /(^|[,{\n]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g;
    const seen = new Map();
    let m;
    while ((m = keyRe.exec(withoutComments))) {
      const key = m[2];
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) failures.push(`EVENT_SOUND key "${key}" is mapped ${count} times — the last one silently wins and shadows the rest`);
    }
  }
}

/* ---- the ambience bed and the song, read from the file's OWN tables ----
   These stems never pass through SFX_VOLUME (`play()` reads it; the bed and the song have their
   own gains, AMBIENCE_SEA/GULL/CREAK and MUSIC_LEVEL). Deriving the list instead of typing the
   names means a stem dropped from AMBIENCE_FILES shows up below as undeclared — loud, not quiet. */
const selfLevelled = new Set();
const ambStart = src.indexOf("const AMBIENCE_FILES = [");
if (ambStart === -1) {
  failures.push("could not find `const AMBIENCE_FILES = [` — the ambience bed's own list is this gate's anchor for which stems skip SFX_VOLUME; re-anchor it rather than hardcoding names here");
} else {
  const close = src.indexOf("]", ambStart);
  for (const m of src.slice(ambStart, close).matchAll(/["']([A-Za-z0-9_-]+)["']/g)) selfLevelled.add(m[1]);
}
const musicM = src.match(/const MUSIC_FILE\s*=\s*["']([A-Za-z0-9_-]+)["']/);
if (!musicM) {
  failures.push("could not find `const MUSIC_FILE = \"…\"` — the song's own name is this gate's anchor for the one stem that is music, not an effect");
} else {
  selfLevelled.add(musicM[1]);
}

// ---- (b) every .mp3 in sfx/ is declared: SFX_VOLUME, or the ambience/music tables above ----
const volStart = src.indexOf("const SFX_VOLUME = {");
if (volStart === -1) {
  failures.push("could not find `const SFX_VOLUME = {` — has the levelling table been renamed?");
} else {
  const braceOpen = src.indexOf("{", volStart);
  const braceClose = src.indexOf("}", braceOpen);
  const body = stripComments(src.slice(braceOpen + 1, braceClose));
  const entryRe = /["']?([A-Za-z0-9_-]+)["']?\s*:\s*([0-9.]+)/g;
  let m, count = 0;
  const untouched = [];
  const names = [];
  while ((m = entryRe.exec(body))) {
    count++;
    const [, stem, value] = m;
    names.push(stem);
    if (Number(value) === 1) untouched.push(stem);
  }
  /* ⛔ A GAIN OF 1 IS NOT AN OVERSIGHT HERE — IT IS HIS RULING, AND THIS CHECK USED TO CONDEMN IT.
     Wyatt, 2026-09-06 (q7, DECISIONS.md): "level everything together, once, after all files are in."
     Nine stems sit at 1 deliberately, and five of them are at 1 for a STRONGER reason than waiting:
     the cork pop and the four "Sounds of the Voyage" picks were rendered from their own tuner pages
     AT THE LEVEL HE AUDITIONED, so 1 plays them exactly as he dialled them. Normalising those to a
     target would undo his own ear — measured 2026-09-18, it would raise them 3.1x to 4.0x.
     The old rule said "docs/AUDIO.md DEFECT-3 carries the measured replacement for each", which was
     FALSE TWICE: DEFECT-3's table holds six different stems and no value for any of these nine. A
     check that is wrong about its own evidence is how a settled ruling gets overturned by a session
     doing what it was told. What is actually worth guarding is that every stem is DECLARED — an
     absent key and a key at 1 behave identically at runtime, and only one of them looks decided. */
  const spec = existsSync(SFX_DIR)
    ? readdirSync(SFX_DIR).filter(f => f.endsWith(".mp3")).map(f => f.replace(/\.mp3$/, ""))
    : [];
  const declared = new Set(names);
  const skipped = spec.filter(n => selfLevelled.has(n));
  const missing = spec.filter(n => !declared.has(n) && !selfLevelled.has(n));
  if (count === 0) {
    failures.push("SFX_VOLUME has no numeric entries at all — is the table empty?");
  } else if (missing.length) {
    failures.push(`SFX_VOLUME does not mention ${missing.length} stem(s) that exist in sfx/: ${missing.join(", ")} — an absent key and a key at 1 sound identical, so declare it at 1 with the reason, the way the nine q7 stems are`);
  }
  tally = { files: spec.length, inVolume: count, atOne: untouched.length, skipped: skipped.length };
}

if (failures.length) {
  console.error(`audio_map_check: ${failures.length} problem(s) in ${TARGET}\n`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
/* THE FILTER SAYS ITS OWN SIZE, on every run, zeroes included — a silent skip of 0 and a silent
   skip of 12 read identically and the difference is the whole result. */
if (tally) {
  console.log(`audio_map_check: ${tally.files} file(s) in sfx/ — ${tally.inVolume} declared in SFX_VOLUME (${tally.atOne} of them at gain 1, his q7 ruling, not an oversight); ${tally.skipped} skipped as the ambience bed / the song, which carry their own gains (AMBIENCE_FILES, MUSIC_FILE).`);
}
console.log(`audio_map_check: OK — no duplicate EVENT_SOUND key, every stem in sfx/ is declared (a gain of 1 is a decision here, not an oversight — q7) (${TARGET})`);
