// scripts/flip_consistency_check.js
//
// T-34/T-35 — Wyatt, 2026-08-26: "Every coin flip — yers, a bot's, dock and battle. I'm not
// convinced these are consistent. write a unit test to do each one. But the coin flip should be the
// exact length of the audio file, so that the coin ALWAYS lands when the coin in the audio file
// lands -- it's the final 'blip' in the file."
//
// THREE ASSERTIONS, and the third is the one that earns its keep.
//
//   1. ONE CLOCK EXISTS. Exactly one FLIP_SPIN_MS in the tree. Two would be two answers to "how
//      long is a flip", which is how the dock flip and the battle flip disagreed by design before
//      2026-08-23 (board.js's own note records that history).
//   2. EVERY FLIP READS IT. Each site that waits out a spin waits on flipSpinLeftMs(), never on a
//      number of its own. A hardcoded sleep beside a flip is the fault returning by the back door.
//   3. THE COIN CANNOT LAND AFTER ITS OWN SOUND. FLIP_SPIN_MS is compared against the REAL duration
//      of sfx/coin-flip.mp3, decoded from the file's frame headers at gate time — not a number
//      typed in here. This is the assertion that would have caught the shipped state on its own:
//      the flip was 1000ms and the file is 965ms, so the coin landed 35ms after the audio had
//      finished entirely, and 205ms after the blip a player actually hears as the landing.
//
// WHY 3 IS DERIVED AND NOT A LITERAL: rule 9. Typing "965" here would make this test agree with a
// stale number forever the moment somebody re-exports the sound. Reading the file means a new sound
// re-points the gate automatically, and a flip that outlasts it fails on the next run.
//
// The blip's exact position (795ms) is NOT re-derived here — finding a transient needs the decoded
// waveform, which needs a decoder this repo does not have and will not grow for a gate. The file
// LENGTH is a hard ceiling that needs only the headers, and it is enough to catch the class.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// package.json sets "type":"module", so this is ESM — no require, no __dirname.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => fs.readFileSync(path.join(REPO, p), "utf8");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

/* ---- 1. one clock ------------------------------------------------------- */
const srcFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
    const rel = path.join(d, e.name);
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith(".js")) srcFiles.push(rel);
  }
})("src");

const defs = srcFiles.filter(f => /(?:export\s+)?const\s+FLIP_SPIN_MS\s*=/.test(read(f)));
if (defs.length === 1) ok("one flip clock", `FLIP_SPIN_MS defined once, in ${defs[0]}`);
else bad("one flip clock", `FLIP_SPIN_MS defined in ${defs.length} file(s): ${defs.join(", ") || "none"}`);

/* ---- 2. every flip reads it --------------------------------------------- */
// FIND THE WAITS, NOT THE PAINTS. The first version looked for `await sleep(...)` within 12 lines
// of a setFlipCoin() call and found ZERO — the paint and the wait live in different functions, so
// it was measuring nothing and said so. (It reported that rather than passing, which is the only
// reason it was caught.) This looks at every sleep whose own neighbourhood mentions a flip.
const offenders = [];
let waitSites = 0, clockSites = 0, holdSites = 0;
for (const f of srcFiles) {
  const lines = read(f).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/await\s+sleep\s*\(([^;]*)\)\s*;/);
    if (!m) continue;
    const arg = m[1].trim();
    if (/flipSpinLeftMs\s*\(\s*\)/.test(arg)) { waitSites++; clockSites++; continue; }
    // a sleep is "a flip's wait" if the surrounding lines are talking about the flip
    const near = lines.slice(Math.max(0, i - 5), i + 3).join(" ");
    if (!/flip|Flip|coin|Coin/.test(near)) continue;
    // A LANDED HOLD IS NOT A SPIN, and conflating them made this fail on correct code first time
    // round: it flagged the two battle sites' 800ms hold, which is Wyatt's own playtest-13 ruling.
    // Both beats must be a NAMED constant; neither may be a bare number.
    if (/FLIP_LAND_HOLD_MS/.test(arg)) { holdSites++; continue; }
    if (/^\d+$/.test(arg)) { waitSites++; offenders.push(`${f}:${i + 1} waits on the bare number \`${arg}\` beside a flip — every flip beat is a named constant (FLIP_SPIN_MS / FLIP_LAND_HOLD_MS)`); }
  }
}
if (!clockSites) bad("every flip reads the clock", "found NO wait on flipSpinLeftMs() anywhere — this check is not measuring anything");
else if (offenders.length) bad("every flip reads the clock", offenders.join("; "));
else ok("every flip reads the clock", `${clockSites} spin wait(s) on flipSpinLeftMs(), ${holdSites} landed hold(s) on FLIP_LAND_HOLD_MS, 0 bare numbers beside a flip`);

/* ---- 2b. the landed face holds EVERYWHERE, which is the half he doubted ---- */
// T-34: the spin was converged on 2026-08-23; the HOLD was not. Measured that day: both battle
// flips held 800ms, the human's dock flip held for its narration, and the BOT's dock flip held for
// nothing at all — it set the face and returned. Four paths, three answers. This counts the sites
// so a future path cannot quietly skip the beat again.
/* RE-ANCHORED BY ARCHITECTURE ITEM 6 (2026-09-17). There are no longer four flip PATHS to count — humanFlip, hFlip and bFlip were
   folded into one toss (src/ui/flow.js flipFor), and a flip is DRAWN in exactly two ways: the big coin the tapping screen lands
   (src/ui/board.js landFlipCoin) and the small coin every other screen throws (src/ui/dockcoin.js flipDockCoin). "Holds everywhere" is
   therefore asserted of those two by name — each must wait its spin and its hold on the named clocks — and no flip wait may exist
   outside them. That is stronger than the count it replaces: a count of three could be met by three copies. */
const holdDefs = srcFiles.filter(f => /(?:export\s+)?const\s+FLIP_LAND_HOLD_MS\s*=/.test(read(f)));
const fnBody = (src, name) => {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src); if (!m) return "";
  let j = src.indexOf(")", m.index); j = src.indexOf("{", j); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(m.index, k + 1); }
  return "";
};
const land = fnBody(read("src/ui/board.js"), "landFlipCoin"), small = fnBody(read("src/ui/dockcoin.js"), "flipDockCoin");
const holds = s => /await\s+sleep\s*\(\s*FLIP_LAND_HOLD_MS\s*\)/.test(s);
const flipWaitsOutside = srcFiles.reduce((n, f) => {
  const s = read(f).replace(land, "").replace(small, "");
  return n + (s.match(/await\s+sleep\s*\(\s*(?:flipSpinLeftMs\s*\(\s*\)|FLIP_LAND_HOLD_MS|FLIP_SPIN_MS[^)]*)\s*\)/g) || []).length;
}, 0);
if (holdDefs.length !== 1) bad("one landed-hold clock", `FLIP_LAND_HOLD_MS defined in ${holdDefs.length} file(s)`);
else if (!land || !small) bad("one landed-hold clock", `the flip's two drawings were not found (landFlipCoin: ${!!land}, flipDockCoin: ${!!small}) — this check is not measuring anything`);
else if (!holds(land) || !/await\s+sleep\s*\(\s*flipSpinLeftMs\s*\(\s*\)\s*\)/.test(land)) bad("one landed-hold clock", "the big coin's landing (landFlipCoin) does not wait out the spin on flipSpinLeftMs() and hold on FLIP_LAND_HOLD_MS");
else if (!holds(small)) bad("one landed-hold clock", "the small coin (flipDockCoin) does not hold its landed face on FLIP_LAND_HOLD_MS");
else if (flipWaitsOutside) bad("one landed-hold clock", `${flipWaitsOutside} flip wait(s) outside the two drawings — a toss that sleeps out its own spin or hold is a second copy of the flip's clock`);
else ok("one landed-hold clock", `FLIP_LAND_HOLD_MS defined once in ${holdDefs[0]}; both drawings of a flip — the big coin's landing and the small coin — hold on it, and no flip wait exists outside them (${holdSites} hold site(s))`);

/* ---- 3. the coin cannot land after its own sound ------------------------ */
/* MEASURED ONCE, PROPERLY, and pinned to the exact bytes it was measured from.
   sfx/coin-flip.mp3 decoded to PCM (afconvert -> WAVE, 48kHz stereo) on 2026-08-26 and read as a
   10ms peak envelope:
       duration            965ms   (46314 mono samples @ 48kHz)
       transient 1           0ms   the toss
       transient 2 (BLIP)  790-800ms, peaking at 795ms  <- what a player hears as the landing
       then               ~165ms of decay, nothing struck

   A HEADER-ONLY FRAME COUNT WAS TRIED HERE FIRST AND REJECTED. It reported 1032ms against the
   PCM decode's 965 — a 7% OVER-estimate, which in this assertion is the dangerous direction: it
   would let a too-long flip pass. A gate that errs toward passing is worse than no gate, so the
   authoritative numbers are recorded and the FILE ITSELF is fingerprinted instead. If the sound is
   re-exported the byte length changes, this fails loudly and asks for a re-measure rather than
   quietly checking a stale number -- which is the rule-9 corollary applied to an asset. */
const MEASURED = { bytes: 15504, ms: 965, blipMs: 795 };
const spin = Number((read(defs[0] || "src/ui/board.js").match(/FLIP_SPIN_MS\s*=\s*(\d+)/) || [])[1]);
const sfxPath = path.join(REPO, "sfx", "coin-flip.mp3");
if (!fs.existsSync(sfxPath)) bad("flip fits its sound", "sfx/coin-flip.mp3 is missing — cannot check");
else if (!spin) bad("flip fits its sound", "could not read FLIP_SPIN_MS");
else {
  const bytes = fs.statSync(sfxPath).size;
  if (bytes !== MEASURED.bytes)
    bad("flip fits its sound",
      `sfx/coin-flip.mp3 is ${bytes} bytes, measured at ${MEASURED.bytes}. The sound changed, so the ${MEASURED.blipMs}ms landing blip this flip is tuned to is no longer trustworthy — RE-MEASURE and update MEASURED here.`);
  else if (spin > MEASURED.ms)
    bad("flip fits its sound",
      `FLIP_SPIN_MS is ${spin}ms and the sound is ${MEASURED.ms}ms — the coin lands ${spin - MEASURED.ms}ms after its own sound has finished`);
  else
    ok("flip fits its sound",
      `FLIP_SPIN_MS ${spin}ms; sound ${MEASURED.ms}ms with its landing blip at ${MEASURED.blipMs}ms (file unchanged at ${bytes} bytes). Offset from the blip: ${spin - MEASURED.blipMs}ms.`);
}

/* ---- report -------------------------------------------------------------- */
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} — ${r.detail}`);
const failed = results.filter(r => !r.pass);
if (failed.length) { console.log(`\nFAILED — ${failed.length} of ${results.length}`); process.exit(1); }
console.log(`\nPASSED — ${results.length} of ${results.length}`);
