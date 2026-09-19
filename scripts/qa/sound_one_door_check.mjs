#!/usr/bin/env node
/* ⭐ EVERY SOUND IN THE GAME LEAVES BY ONE DOOR, AND NO CALL SITE NAMES A FILE.
 *
 *   node scripts/qa/sound_one_door_check.mjs
 *
 * WHAT THIS IS FOR. Wyatt, 2026-09-19: "we need a sound engine… all our new maps will have
 * different sounds, so these must be cleaned up the same way the assets and narration must be —
 * folderized, called in one place, through one channel, consistently across game modes and player
 * types." The fault he was quoting (docs/AUDIO.md §1c, measured 2026-09-18) was that ten of the
 * eighteen stems never touched the event map at all: they were played by functions NAMED AFTER
 * FILES — playCardSwish, playLidNote, playCrateVerdict — from twenty-four call sites across six
 * files in the UI tier. A second map's sounds would have had to be threaded through every one.
 *
 * SO THE RULE IS NOT "tidier", IT IS A PROPERTY A MAP PACK NEEDS: the ONLY place in `src/` that may
 * name a sound file is the cue table, and the ONLY thing that may start a sound is `play()` inside
 * src/ui/audio.js, reached through `playCue`. Everything else names a MOMENT.
 *
 * SIX RULES, each red-proofed against the shape it guards:
 *   1. no file outside the sound engine names a stem, in code
 *   2. `play(` is called only inside audio.js — playCue and the two runtimes it cannot own (the
 *      flip's repeating spin and the bed's scatter)
 *   3. every cue a call site asks for exists in the table (a typo is silence, and silence reads
 *      as a decision)
 *   4. every cue in the table is reachable — from a call site or from the event map
 *   5. every stem the table names is filed under a pack folder, and every folder is a real one
 *   6. the exception to "the whole table hears it" is declared on the cue, never in the UI
 *
 * BOTH ENDS ALIVE. Each rule states the count it found, and a count of zero fails rather than
 * passes — the lesson of every gate in this directory that once went green on nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
/* The list of event kinds the engine can emit, DERIVED from the emitters themselves — the same
   derivation event_sound_kinds_real_check and the twin ledger use, so there is one answer to
   "what can happen?" rather than three. */
import { emittedKinds } from "../lib/twin_ledger.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENGINE = ["src/ui/audio.js", "src/shared/sounds.js"];   // the sound engine's two halves
const FOLDERS = ["voyage", "ceremony", "ambience", "music"];

const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const FILES = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));

const S = await import(pathToFileURL(path.join(REPO, "src/shared/sounds.js")).href);

function rules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const audio = code(files["src/ui/audio.js"] || "");
  const table = code(files["src/shared/sounds.js"] || "");
  /* A cue may name its stem through one of the four named constants (WIN_SOUND, CANNON_SOUND,
     DRUMROLL_SOUND, BATTLE_ENGAGE_SOUND), so those are resolved out of the same text rather than
     skipped — skipping them would have left four stems unguarded by rule 1. */
  const consts = Object.fromEntries([...table.matchAll(/export const ([A-Z_]+_SOUND) = "([a-z0-9-]+)"/g)].map(m => [m[1], m[2]]));
  const stems = [...new Set([...table.matchAll(/\bstem:\s*(?:"([a-z0-9-]+)"|([A-Z_]+_SOUND))/g)]
    .map(m => m[1] || consts[m[2]]).filter(Boolean))];
  const folder = Object.fromEntries([...(/export const STEM_FOLDER = \{([\s\S]*?)\n\};/.exec(table) || [, ""])[1]
    .matchAll(/"([a-z0-9-]+)":\s*"([a-z]+)"/g)].map(m => [m[1], m[2]]));
  const cueBody = (/export const CUES = \{([\s\S]*?)\n\};/.exec(table) || [, ""])[1];
  const cueNames = [...new Set([...cueBody.matchAll(/^\s*"([A-Za-z.]+)":\s*\{/gm)].map(m => m[1]))];
  const evValues = [...new Set([...(/export const EVENT_CUE = \{([\s\S]*?)\n\};/.exec(table) || [, ""])[1]
    .matchAll(/:\s*"([A-Za-z.]+)"/g)].map(m => m[1]))];
  /* cueForEvent names two cues directly — the storm's scatter and a crate BOUGHT at a dock — because
     each needs a field of the event, not just its kind. They are reachable and must count as such. */
  const evDirect = [...(/export function cueForEvent\(e\) \{([\s\S]*?)\n\}/.exec(table) || [, ""])[1]
    .matchAll(/return "([A-Za-z.]+)"/g)].map(m => m[1]);

  /* 1 — NO STEM NAMED OUTSIDE THE ENGINE. The stem list comes from the table, so a stem added
     tomorrow is guarded the day it is added and nothing here needs editing. */
  /* ⛔ ONE STEM IS EXEMPT AND IT IS DERIVED, NEVER TYPED: `storm` is BOTH a stem and one of the
     engine's own event kinds, so `e.t === "storm"` in the orchestrator is the game talking about
     weather, not about a file. Excluding by hand would rot the day a stem is called `dock`; the
     exemption is the intersection of the two lists, worked out here, and the rule says which
     name(s) it gave up on so the hole is visible rather than silent. */
  const eventKinds = emittedKinds(files);
  const ambiguous = stems.filter(s => eventKinds.has(s));
  const checkable = stems.filter(s => !eventKinds.has(s));
  const named = [];
  for (const [f, s] of Object.entries(files)) {
    if (ENGINE.includes(f)) continue;
    const c = code(s);
    for (const stem of checkable) if (new RegExp('["\'`]' + stem + '["\'`]').test(c)) named.push(`${f} names "${stem}"`);
  }
  rule(stems.length >= 15 && named.length === 0,
    `no file outside the sound engine names any of the ${checkable.length} stems whose name is a file and nothing else` +
    (ambiguous.length ? ` (${ambiguous.join(", ")} not checked — also the name of an event the engine emits)` : "") +
    " — a call site names a moment, never a file",
    stems.length < 15 ? `only ${stems.length} stem(s) could be read out of the cue table — this rule would pass on nothing`
      : `${named.length} call site(s) name a sound file: ${named.join("; ")}. A map pack cannot reach in there.`);

  /* 2 — ONE THING STARTS A SOUND. play() is audio.js's private starter; outside it, nothing. */
  /* A SOUND START IS `play("<stem>")` — matched with its string argument, never a bare `play(`.
     The engine's own game loop is a method called play() (src/engine/index.js), and a rule that
     could not tell the two apart would cry wolf on the one file that has nothing to do with sound. */
  const outside = Object.entries(files).filter(([f]) => !ENGINE.includes(f))
    .flatMap(([f, s]) => (code(s).match(/(^|[^.\w])play\s*\(\s*["'`]/g) || []).map(() => f));
  rule(outside.length === 0,
    "nothing outside audio.js starts a sound — play() is private to the graph that owns the buses",
    `play() is called from outside audio.js in ${[...new Set(outside)].join(", ")} — a second starter skips mute, the bus and the spacing clock`);

  /* 3 — EVERY CUE ASKED FOR EXISTS. A misspelt cue is silence, and silence reads as a decision. */
  /* EVERY cue name inside a playCue(...) call, not just one immediately after the bracket — the
     bake-off picks its verdict with a ternary, and a rule that missed it would have called two live
     cues dead. */
  const asked = [...new Set(Object.entries(files).filter(([f]) => !ENGINE.includes(f))
    .flatMap(([, s]) => [...code(s).matchAll(/playCue\(([^)]*)\)/g)]
      .flatMap(m => [...m[1].matchAll(/"([A-Za-z.]+)"/g)].map(q => q[1]))))];
  const ghosts = asked.filter(c => !S.CUES[c]);
  rule(asked.length >= 15 && ghosts.length === 0,
    `all ${asked.length} cue(s) the game asks for exist in the table`,
    asked.length < 15 ? `only ${asked.length} playCue call(s) found — this rule would pass on nothing`
      : `${ghosts.length} cue(s) are asked for and not in the table: ${ghosts.join(", ")} — each one is silence that looks like a decision`);

  /* 4 — AND EVERY CUE IS REACHABLE, the other direction. A cue nothing plays is dead wiring, the
     same fault `event_sound_kinds_real_check` guards on the event side. */
  /* The flip is the one cue the engine itself reaches, because it is a repeating source node and
     cannot go through playCue — it still takes its stem from the table (CUES["coin.spins"].stem). */
  const viaEngine = [...new Set([...audio.matchAll(/CUES\["([A-Za-z.]+)"\]/g)].map(m => m[1]))];
  const viaEvent = new Set([...evValues, ...evDirect]);
  const dead = cueNames.filter(c => !asked.includes(c) && !viaEvent.has(c) && !viaEngine.includes(c));
  rule(cueNames.length >= 25 && dead.length === 0,
    `all ${cueNames.length} cue(s) in the table are reachable — ${asked.length} from a call site, ${viaEvent.size} from the event map, ${viaEngine.length} from the flip's own runtime`,
    cueNames.length < 25 ? `only ${cueNames.length} cue(s) could be read out of the table — this rule would pass on nothing`
      : `${dead.length} cue(s) can never play: ${dead.join(", ")} — dead wiring, and the table is the expectation nobody re-reads`);

  /* 5 — EVERY STEM IS FILED, under a folder that exists. This is what tells a new map what it has
     to supply, and it is the difference between a pack and a heap. */
  const unfiled = stems.filter(s => !folder[s]);
  const oddFolder = [...new Set(Object.values(folder))].filter(f => !FOLDERS.includes(f));
  rule(unfiled.length === 0 && oddFolder.length === 0,
    `every stem the table names is filed under one of ${FOLDERS.join(" / ")}`,
    unfiled.length ? `${unfiled.length} stem(s) are in no folder: ${unfiled.join(", ")}`
      : `folder(s) nothing knows about: ${oddFolder.join(", ")} — add them to this gate deliberately, or file the stems under an existing one`);

  /* 6 — THE ONE EXCEPTION IS DECLARED ON THE CUE. "Your turn" is the only sound in the game a
     single seat hears (his knowing ruling, 2026-09-06). A second one is a decision for him, and it
     has to be visible in the table rather than an `if` somewhere in the UI. */
  const seatIfs = Object.entries(files).filter(([f]) => !ENGINE.includes(f))
    .filter(([, s]) => /(isLocalTo|decisionIsLocal|isHost)[^\n]{0,80}playCue\(|playCue\([^\n]{0,80}(isLocalTo|decisionIsLocal|isHost)/.test(code(s)))
    .map(([f]) => f);
  const locals = [...cueBody.matchAll(/^\s*"([A-Za-z.]+)":\s*\{[^}]*localOnly:\s*true/gm)].map(m => m[1]);
  rule(seatIfs.length === 0 && locals.length === 1 && locals[0] === "turn.begins",
    `the one seat-gated sound is declared on its cue (${locals.join(", ")}), and no call site decides a sound by who is watching`,
    seatIfs.length ? `a sound is chosen by seat at a call site in ${seatIfs.join(", ")} — that decision belongs on the cue, so a second one is a visible act`
      : `${locals.length} cue(s) are seat-gated (${locals.join(", ") || "none"}) — "your turn" is the only one Wyatt has ruled on; a second is a fresh decision for him, not a precedent`);
  return out;
}

const real = rules(FILES);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule goes red on a copy broken the way it guards against — including the shape
   the tree was actually in before 2026-09-19, which is the only mutant that matters. */
const broke = (f, from, to) => { const c = { ...FILES }; if (!c[f] || !c[f].includes(from)) return null; c[f] = c[f].replace(from, to); return c; };
const MUTANTS = [
  ["a call site naming a file again, the pre-2026-09-19 shape", broke("src/ui/victory.js", 'playCue("victory.drumroll")', 'play("drumroll")'), 0],
  ["something outside audio.js starting a sound itself", broke("src/ui/popin.js", 'playCue("popin.crateArrives"', 'play("cork-pop"'), 1],
  ["a cue asked for that the table does not have (a typo is silence)", broke("src/ui/bakeoff.js", '"bakeoff.lidLands"', '"bakeoff.lidLanded"'), 2],
  ["a cue in the table that nothing can reach", broke("src/shared/sounds.js", '  "muse":               { stem: "fishing" },', '  "muse":               { stem: "fishing" },\n  "kraken.rises":       { stem: "storm" },'), 3],
  ["a stem filed under no folder", broke("src/shared/sounds.js", '"card-swish": "ceremony", ', ''), 4],
  ["a second seat-gated sound, decided in the UI instead of on the cue", broke("src/ui/board.js", '  playCue("purse.coinIn");', '  if (decisionIsLocal(0)) playCue("purse.coinIn");'), 5],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  let red = false;
  try { const res = mutant ? rules(mutant) : null; red = !!res && res[idx] && !res[idx].ok; } catch (e) { red = false; }
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk
  ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — one table, one door: ${real.length} rules, ${MUTANTS.length} mutants, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
