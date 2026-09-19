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
 *   (c) `EVENT_SOUND` names no stem that has no file in `sfx/` — the mirror of DEFECT-1. There the
 *       file existed and nothing could reach it; here a cue is reachable and its file is absent, so
 *       the moment is silent in a way that reads like a decision and is not one.
 *   (d) No gain in `SFX_VOLUME` puts its stem's true peak above `SFX_PEAK_CEILING_DBFS`. Added with
 *       the 2026-09-18 levelling pass, which raises five stems by 9-12 dB — this is the rule that
 *       makes a raise safe to commit. The peaks are measured and live in `SFX_TRUE_PEAK_DBFS` in
 *       the file under test, so a re-exported file changes ONE number and no copy drifts. It earned
 *       its keep on its first run, catching `card-swish` at 2.82 where the file allows 2.8184 — a
 *       rounding-up that breached the ceiling by 0.003 dB and would never have been noticed.
 *
 *       RULE (b) USED TO SAY THE OPPOSITE OF THE TRUTH — "every stem has a value other than the
 *       untouched default 1, and docs/AUDIO.md DEFECT-3 carries the measured replacement for
 *       each". DEFECT-3's table holds SIX DIFFERENT stems and no value for any of the nine it
 *       accused; the nine sat at 1 by Wyatt's own ruling (q7, 2026-09-06). Repaired on `dev` in
 *       commit bc6c25cb — that repair is Mac: Dev's, brought here and wired into the chain. (The
 *       ruling has since been carried out: he put the last five in scope on 2026-09-18 and the
 *       levelling landed. See the longer note beside rule (b)'s code for why no rule here judges a
 *       gain BY ITS VALUE — a gain is his ear's business, and a gate cannot hear.)
 *
 *       THE FILTER, DECLARED (this gate drops samples, so it says how many and why, every run):
 *       the ambience and music stems are excluded from the SFX_VOLUME half, and the pass line
 *       prints the count. They are not hardcoded by name — they are read from `AMBIENCE_FILES`
 *       and `MUSIC_FILE` in the file under test, so a stem that falls out of those tables is
 *       reported as undeclared rather than quietly skipped. The error runs TOWARD the alarm: a
 *       rotted anchor makes this gate shout, never go quiet.
 *
 *       DELIBERATELY NOT FAILED: an `EVENT_SOUND` key naming an event nothing emits. Seven exist
 *       (measured 2026-09-18, 200 seeded voyages plus a grep of every emitter in `src/`) and they
 *       cost nothing at runtime. Failing them would be a gate deciding on its own to delete four
 *       records of intent, against the standing "the default is KEEP". Reported in docs/AUDIO.md
 *       §1c for a person to rule on. See the note above rule (c)'s code.
 *
 * RED-PROOFED IN THIS FILE, every run. The header used to cite a one-off run against an old commit
 * (`git show 95ca2d7:src/ui/audio.js`), which is evidence nobody re-checks. Now the gate builds a
 * MUTANT of the real source for each of its five rules, runs itself against it, and fails if the
 * mutant passes or fails on the wrong rule — so a rule that stops being able to go red is itself
 * caught. A case that cannot fail is not evidence and does not count (CLAUDE.md rule 6).
 *
 * Plain Node, no test library, no browser globals touched — same shape as every other `scripts/*`
 * gate. Optional first CLI arg overrides the file path; the red-proof children carry one, which is
 * also what stops the self-test recursing. The real gate reads the live file with no arguments.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2] || join(__dirname, "..", "src", "ui", "audio.js");
const SFX_DIR = join(__dirname, "..", "sfx");
/* ⭐ THE SOUND DESIGN IS TWO FILES SINCE 2026-09-19, and this gate reads both as one text.
   src/shared/sounds.js holds WHAT a sound is — the cues, the event map, the levels, the measured
   peaks, the pack folders. src/ui/audio.js holds what a sound DOES, and with it the bed's and the
   song's own lists, which never pass through SFX_VOLUME. Every anchor below is a distinct string,
   so concatenating is enough and there is nothing to keep in step. A second TARGET argument still
   works and is how the gate is pointed at a mutated copy. */
const SOUNDS = join(__dirname, "..", "src", "shared", "sounds.js");
const src = readFileSync(TARGET, "utf8") + "\n" + readFileSync(process.argv[3] || SOUNDS, "utf8");
/* EVERY .mp3 UNDER sfx/, at any depth — the stems moved into sfx/<pack>/<folder>/ with the table,
   and a scan of the top level alone would have found nothing and passed on nothing. */
const allMp3 = (d) => !existsSync(d) ? [] : readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? allMp3(join(d, e.name)) : e.name.endsWith(".mp3") ? [e.name.replace(/\.mp3$/, "")] : []);

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

// ---- (a) no duplicate key in the event->cue object literal ----
const mapStart = src.indexOf("const EVENT_CUE = {");
if (mapStart === -1) {
  failures.push("could not find `const EVENT_CUE = {` — has the map been renamed or restructured?");
} else {
  // Walk forward from the opening brace, tracking nesting depth, to find the literal's own close.
  const braceOpen = src.indexOf("{", mapStart);
  let depth = 0, i = braceOpen, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) {
    failures.push("EVENT_CUE's opening brace never closes — malformed literal");
  } else {
    const body = src.slice(braceOpen + 1, end);
    const withoutComments = stripComments(body);
    // Bare-identifier object keys only (`key: value`), which is every key this literal uses —
    // no quoted or computed keys appear in EVENT_CUE.
    const keyRe = /(^|[,{\n]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g;
    const seen = new Map();
    let m;
    while ((m = keyRe.exec(withoutComments))) {
      const key = m[2];
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) failures.push(`EVENT_CUE key "${key}" is mapped ${count} times — the last one silently wins and shadows the rest`);
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
  /* ⛔ A GAIN IS NEVER CONDEMNED BY ITS VALUE HERE, and the history is worth keeping because this
     check twice reached for a rule of that shape and was twice wrong.
     Attempt 1 said "every stem must differ from the untouched default 1, and docs/AUDIO.md DEFECT-3
     carries the measured replacement for each" — FALSE TWICE: DEFECT-3's table holds six different
     stems and no value for any of the nine it accused, and those nine sat at 1 by Wyatt's own q7
     ruling (2026-09-06, "level everything together, once, after all files are in").
     Attempt 2 would have been "a gain of 1 is his q7 ruling, leave it alone" — which went stale in
     twelve days: on 2026-09-18 he put the last five in scope himself ("It should relevel them too;
     I haven't heard them properly") and the levelling pass landed, so only four stems are at 1 now
     and every one of them for its own stated reason.
     THE LESSON, and why the rule below is about DECLARATION rather than value: a gain is a matter
     of his ear, and a gate cannot hear. What a gate CAN prove is that every stem is declared (an
     absent key and a key at 1 behave identically at runtime, and only one of them looks decided),
     that every declared gain keeps its file under the peak ceiling, and that no cue names a file
     that is not there. Those are rules (b), (d) and (c). */
  const spec = allMp3(SFX_DIR);
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

/* ---- (c) no CUE names a stem that is not in sfx/ ----
   A cue pointing at a file that is not there is silence that looks like a decision — the same
   family of fault as DEFECT-1, where a stem that existed could never be reached. This is the
   mirror: a reachable cue whose file does not exist. Only NAMED stems are checked; `null` is
   explicit silence and is the file's own convention for a moment that should make no sound.

   DEAD KEYS ARE DELIBERATELY NOT FAILED HERE, and the reason is evidence, not leniency. Measured
   2026-09-18 over 200 seeded voyages plus a grep of every emitter in src/: six EVENT_CUE keys
   name an event nothing emits — `fish`, `anchor`, `dodge` (which name real stems) and `moored`,
   `idle`, `bakeoff` (explicit silence). They cost nothing at runtime: an event that never fires
   never reaches the lookup. Failing them would be a gate deciding, on its own, to delete three
   records of intent — and the standing ruling is that the default is KEEP. They are reported in
   docs/AUDIO.md §1c instead, where a person can rule on them. (It was seven until 2026-09-19:
   the wreck at the bottom of the v1 storm ladder is out of the live tree at Wyatt's word, and
   scripts/qa/event_sound_kinds_real_check.mjs is what keeps any of them from coming back.) */
/* ⭐ IT READS THE CUE TABLE NOW, NOT THE EVENT MAP — 2026-09-19. The event map's values became cue
   NAMES ("which moment is this?"), and only CUES names a file. That is a strictly wider check than
   before: it covers the ten stems that never went through the event map at all, which is the whole
   fault Wyatt named. */
const evSoundStems = [];
{
  const s0 = src.indexOf("export const CUES = {");
  if (s0 !== -1) {
    const open = src.indexOf("{", s0);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) {
      const body = stripComments(src.slice(open + 1, end));
      for (const m of body.matchAll(/\bstem:\s*["']([A-Za-z0-9_-]+)["']/g)) evSoundStems.push(m[1]);
    }
  }
}
if (existsSync(SFX_DIR)) {
  const onDisk = new Set(allMp3(SFX_DIR));
  const ghosts = [...new Set(evSoundStems)].filter(n => !onDisk.has(n));
  if (ghosts.length)
    failures.push(`CUES names ${ghosts.length} stem(s) with no file under sfx/: ${ghosts.join(", ")} — the cue fires and nothing is heard, which reads as a decision and is not one`);
  if (!evSoundStems.length)
    failures.push("no cue names a stem at all — the CUES table could not be read, so this rule would pass on nothing");
}

/* ---- (d) no gain pushes a stem's true peak above the ceiling ----
   The mix (2026-09-18) raises five stems by 9-12 dB, so this is the rule that makes those safe to
   commit: gain x file-peak must stay under SFX_PEAK_CEILING_DBFS. The peaks are MEASURED and live
   in SFX_TRUE_PEAK_DBFS in the file under test, so there is no second copy to keep in step and a
   re-exported file changes one number.
   THE ONE EXCEPTION IS NAMED, NOT HIDDEN: `battle-swords` measures +0.2 dBFS in the file itself,
   above the ceiling before any gain is applied. Luis checked it on 2026-09-18 and found it fine,
   and Wyatt relayed that ruling, so it is a judged exception rather than an outstanding fault. The
   gate still checks that its GAIN does not make it worse than the file already is. */
{
  const peaks = {};
  const p0 = src.indexOf("const SFX_TRUE_PEAK_DBFS = {");
  if (p0 === -1) {
    failures.push("could not find `const SFX_TRUE_PEAK_DBFS = {` — the measured true peaks are this rule's only evidence; re-anchor it rather than typing peaks in here");
  } else {
    const open = src.indexOf("{", p0), close = src.indexOf("}", open);
    for (const m of stripComments(src.slice(open + 1, close)).matchAll(/["']([A-Za-z0-9_-]+)["']\s*:\s*(-?[0-9.]+)/g))
      peaks[m[1]] = Number(m[2]);
  }
  const ceilM = src.match(/const SFX_PEAK_CEILING_DBFS\s*=\s*(-?[0-9.]+)/);
  const ceiling = ceilM ? Number(ceilM[1]) : null;
  if (ceiling == null) failures.push("could not find `const SFX_PEAK_CEILING_DBFS = …` — the ceiling must be read from the file, never typed in the gate");

  const volStart2 = src.indexOf("const SFX_VOLUME = {");
  if (volStart2 !== -1 && ceiling != null) {
    const open = src.indexOf("{", volStart2), close = src.indexOf("}", open);
    const body = stripComments(src.slice(open + 1, close));
    const undeclared = [], over = [];
    for (const m of body.matchAll(/["']?([A-Za-z0-9_-]+)["']?\s*:\s*([0-9.]+)/g)) {
      const stem = m[1], gain = Number(m[2]);
      if (!(stem in peaks)) { undeclared.push(stem); continue; }
      const filePeak = peaks[stem];
      const played = filePeak + 20 * Math.log10(gain);
      // A file already over the ceiling may not be pushed FURTHER by its gain (gain <= 1); every
      // other stem must land under the ceiling outright.
      const ok = filePeak > ceiling ? gain <= 1 : played <= ceiling + 1e-9;
      if (!ok) over.push(`${stem} (gain ${gain} x file peak ${filePeak} dBFS = ${played.toFixed(1)} dBFS)`);
    }
    if (undeclared.length)
      failures.push(`SFX_TRUE_PEAK_DBFS has no measured peak for ${undeclared.length} stem(s) in SFX_VOLUME: ${undeclared.join(", ")} — a gain whose peak nobody measured cannot be checked against the ceiling`);
    if (over.length)
      failures.push(`${over.length} gain(s) put a stem's true peak above the ${ceiling} dBFS ceiling: ${over.join("; ")} — turn the gain down or re-export the file quieter`);
  }
}

if (failures.length) {
  console.error(`audio_map_check: ${failures.length} problem(s) in ${TARGET}\n`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
/* THE FILTER SAYS ITS OWN SIZE, on every run, zeroes included — a silent skip of 0 and a silent
   skip of 12 read identically and the difference is the whole result. */
if (tally) {
  console.log(`audio_map_check: ${tally.files} file(s) in sfx/ — ${tally.inVolume} declared in SFX_VOLUME (${tally.atOne} of them at gain 1, each for its own stated reason after the q7 levelling pass of 2026-09-18); ${tally.skipped} skipped as the ambience bed / the song, which carry their own gains (AMBIENCE_FILES, MUSIC_FILE).`);
}
console.log(`audio_map_check: OK — no duplicate EVENT_SOUND key; every stem in sfx/ is declared; EVENT_SOUND names no missing file; no gain breaches the peak ceiling (${TARGET})`);

/* ================= RED-PROOF — the gate proves its own rules can fail =================
   A case that cannot go red is decoration, and it lends its green to the cases beside it. So each
   rule below is run against a MUTANT of the real source, built in memory, and must be caught. The
   mutants are deliberately the smallest plausible mistakes, not absurd ones — each is a thing a
   session could really do while editing the mix.

   Only the real run (no path argument) red-proofs; the child runs carry a path, which is also what
   stops this recursing. */
if (!process.argv[2]) {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "audiomap-redproof-"));
  /* THE MUTATIONS MATCH WHATEVER THE VALUE IS, never a literal like `"drumroll": 1.51`. Written
     with the numbers in them first, they went blind the same day — the mix was re-dialled, the
     mutations matched nothing, and two rules silently stopped being evidence. The gate caught its
     OWN decoration (the "changed NOTHING" arm below is what fired), which is the whole reason that
     arm exists: a mutation that does not mutate reads exactly like a rule that cannot fail. */
  const mutants = [
    ["(a) a duplicate EVENT_CUE key",
      s => s.replace(/(\n\s*pass: "muse",)/, '$1\n  pass: "sail",'),
      /mapped 2 times/],
    ["(b) a stem in sfx/ that SFX_VOLUME does not declare",
      s => s.replace(/\n\s*"drumroll":\s*[0-9.]+,/, "\n"),
      /does not mention 1 stem/],
    ["(c) a CUE naming a file that is not in sfx/",
      s => s.replace(/"sail":(\s*)\{ stem: "ship-move" \}/, '"sail":$1{ stem: "ship-move-LOUD" }'),
      /no file under sfx\//],
    ["(d) a gain that pushes a true peak over the ceiling",
      s => s.replace(/"cork-pop":\s*[0-9.]+,/, '"cork-pop": 9,'),
      /above the -1 dBFS ceiling/],
    /* Scoped to the PEAKS table by slicing rather than by a clever regex: `"cork-pop": …` appears
       in both tables, and a pattern that tried to tell them apart by the sign of the number would
       go blind the day a gain went negative or a peak went positive (battle-swords already has). */
    ["(d) a stem with a gain but no measured peak to check it against",
      s => {
        const i = s.indexOf("const SFX_TRUE_PEAK_DBFS = {");
        if (i === -1) return s;
        const j = s.indexOf("}", i);
        return s.slice(0, i) + s.slice(i, j).replace(/"cork-pop":\s*-?[0-9.]+,\s*/, "") + s.slice(j);
      },
      /no measured peak/],
  ];
  const bad = [];
  for (const [what, mutate, expect] of mutants) {
    const mutated = mutate(src);
    if (mutated === src) { bad.push(`${what}: the mutation changed NOTHING — this case cannot fail and is not evidence`); continue; }
    /* THE CHILD READS THE MUTANT AND NOTHING ELSE. `src` is the two real files concatenated, so the
       mutant already contains both; the second path is an empty file so the child does not then
       append a PRISTINE copy of the sound table behind it and quietly heal every mutation. */
    const f = join(dir, "audio.js"), empty = join(dir, "empty.js");
    writeFileSync(f, mutated, "utf8");
    writeFileSync(empty, "", "utf8");
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), f, empty], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || "");
    if (r.status === 0) bad.push(`${what}: the mutant PASSED — the rule cannot fail`);
    else if (!expect.test(out)) bad.push(`${what}: the mutant failed, but on the wrong rule (wanted ${expect}) — got: ${out.trim().split("\n").slice(0, 3).join(" | ")}`);
  }
  if (bad.length) {
    console.error(`audio_map_check RED-PROOF FAILED — ${bad.length} rule(s) cannot catch what they claim to:\n`);
    for (const b of bad) console.error("  - " + b);
    process.exit(1);
  }
  console.log(`audio_map_check: red-proofed — all ${mutants.length} rules go red on a mutant of the real file (duplicate key, undeclared stem, missing file, over-ceiling gain, unmeasured peak).`);
}
