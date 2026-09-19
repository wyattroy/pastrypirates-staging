#!/usr/bin/env node
/* A SOUND MAPPED TO SOMETHING THAT CANNOT HAPPEN IS DEAD WIRING.
 *
 * FACT: which of the game's events make a sound. It is decided in one place — EVENT_CUE,
 * src/shared/sounds.js — and that place is a HAND-KEPT TABLE whose other half, the list of events
 * the engine can actually emit, lives in the engine and moves without it.
 *
 * (It was EVENT_SOUND in src/ui/audio.js until 2026-09-19, when the whole sound design moved into
 * the shared tier so a second map can bring its own pack. The table's VALUES are cue names now
 * rather than stem names — "which moment is this?" instead of "which file?" — and this gate reads
 * its KEYS, which are the event kinds and did not change. What it guards is unchanged with them.)
 *
 * IT HAD ALREADY DRIFTED BY TWO ENTRIES WHEN THIS GATE WAS WRITTEN, 2026-09-18, and both were found
 * by reading the table's own comments against the engine:
 *   fish: "fishing"    — src/ui/flow.js:321, in the game's own words: "v2 rule 3: fishing is gone
 *                        entirely. fishCast() and its whole flip-for-coins path are deleted".
 *                        Nothing in src/ has emitted a `fish` event since the cutover.
 *   anchor: "fishing"  — the v1 storm ladder, deleted with the rest of it by the v2 rules. The
 *                        second entry of the pair was the worse of the two: it pointed at `storm`,
 *                        the one stem docs/AUDIO.md DEFECT-1 and DEFECT-2 are about (an 8-second
 *                        bed at ~3x level, once per ship, unfadeable). A dead key aimed at a sound
 *                        that must never come back is the worst kind of dead: harmless today, and
 *                        armed. Its name is out of this tree entirely now (Wyatt, 2026-09-19), so
 *                        the mutant below exercises the rule with the survivor of the same pair.
 * Both were real kinds in the FROZEN v1 (classic/, and the determinism fixtures still record them),
 * which is exactly how a table rots — the entry was right when it was written.
 *
 * SCOPED TO src/ ON PURPOSE. classic/ is v1, frozen, with its own audio.js and its own engine; this
 * gate must never read one tree's table against the other's engine.
 *
 * WHY THE PRODUCER LIST IS DERIVED AND NOT TYPED, in this repo's own words
 * (scripts/qa/event_actor_field_check.mjs): "Never trust a hand-kept list to detect the failure it
 * exists to prevent." The derivation is shared with scripts/lib/twin_ledger.mjs, so the twin
 * ledger's coverage line and this gate's expectation can never become two different lists.
 *
 * ⚠ AND THE DERIVATION IS ITSELF CHECKED, because a case that cannot fail is not a case: an empty
 * key list would make rule 1 vacuously green, and a regex that lost the engine's ONE non-literal
 * emission (src/engine/index.js:741, `this.ev({t:blown?"blownOut":"windmove",p:p.idx})`) would
 * condemn a live key as dead. Rule 2 holds both ends alive, and its mutants are run below.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emittedKinds, strayEmitters, MUST_HAVE, EMITTER_FILES } from "../lib/twin_ledger.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code

/* the top-level keys of an object literal, read out of the real source with the comments stripped */
function tableKeys(src, name) {
  const s = code(src), i = s.indexOf(name);
  if (i < 0) return [];
  let j = s.indexOf("{", i), d = 0, end = -1;
  for (let k = j; k < s.length; k++) { const c = s[k]; if ("{([".includes(c)) d++; else if ("})]".includes(c)) { d--; if (!d) { end = k; break; } } }
  if (end < 0) return [];
  const inner = s.slice(j + 1, end), parts = []; let depth = 0, cur = "";
  for (const c of inner) { if ("{([".includes(c)) depth++; else if ("})]".includes(c)) depth--; if (c === "," && !depth) { parts.push(cur); cur = ""; } else cur += c; }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean).map(p => { const c = p.indexOf(":"); return (c < 0 ? p : p.slice(0, c)).trim(); }).filter(k => /^[A-Za-z_$][\w$]*$/.test(k));
}

function rules(files) {
  const T = files["src/shared/sounds.js"] || "";
  const keys = tableKeys(T, "const EVENT_CUE=").concat(tableKeys(T, "const EVENT_CUE ="));
  const keySet = [...new Set(keys)];
  const produced = emittedKinds(files);
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. EVERY SOUND IS MAPPED TO SOMETHING THAT CAN HAPPEN
  const dead = keySet.filter(k => !produced.has(k));
  rule(dead.length === 0,
    `all ${keySet.length} event->sound entries name an event the game can still emit`,
    `${dead.length} event->sound entr(y/ies) name events nothing in src/ emits any more: ${dead.join(", ")} — dead wiring, and the table is the expectation nobody re-reads`);

  // 2. BOTH ENDS OF THE COMPARISON ARE ALIVE (without this, rule 1 passes on an empty list)
  const anchors = ["sail", "dock", "turn", "engage"].filter(k => !keySet.includes(k));
  const lost = MUST_HAVE.filter(k => !produced.has(k));
  const strays = strayEmitters(files);
  rule(anchors.length === 0 && lost.length === 0 && strays.length === 0 && keySet.length >= 15 && produced.size >= 25,
    `both lists are derived and alive: ${keySet.length} sound entries read out of sounds.js, ${produced.size} event kinds derived from the ${EMITTER_FILES.length} files that emit them (the ternary's blownOut/windmove and the ones built in a variable, sail and battleflee, included), and nothing else in src/ emits`,
    anchors.length ? `the event->cue table could not be read (missing ${anchors.join(", ")}; ${keySet.length} keys found) — rule 1 above would pass on nothing`
      : lost.length ? `the producer derivation lost ${lost.join(", ")} — a live event would be condemned as dead`
        : strays.length ? `${strays.join(", ")} emits events too, and the derivation does not read it — add it to EMITTER_FILES in scripts/lib/twin_ledger.mjs`
          : `the lists look wrong: ${keySet.length} sound entries, ${produced.size} event kinds`);
  return out;
}

const files = Object.fromEntries(walk(path.join(REPO, "src")).map(f => [path.relative(REPO, f).split(path.sep).join("/"), fs.readFileSync(f, "utf8")]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule goes red on a copy broken exactly the way it guards against. The first two
   mutants are not inventions — they are the tree as it stood before this commit. */
const broke = (file, from, to) => { const f = { ...files }; if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const MUTANTS = [
  ["the `fish` sound put back (it was there until 2026-09-18)", broke("src/shared/sounds.js", "  anchorHold: null,", "  fish: \"anchor.drops\", anchorHold: null,"), 0],
  ["the `anchor` -> fishing mapping put back (it was there until 2026-09-18)", broke("src/shared/sounds.js", "  blocked: null,", "  anchor: \"anchor.drops\",\n  blocked: null,"), 0],
  ["the `idle` silence put back (it was there until 2026-09-18)", broke("src/shared/sounds.js", "  purse: null,", "  purse: null, idle: null,"), 0],
  ["the engine's one non-literal emission flattened, so `blownOut` vanishes from the derived list",
    broke("src/engine/index.js", 'this.ev({t:blown?"blownOut":"windmove",p:p.idx})', 'this.ev({t:"windmove",p:p.idx})'), 1],
  ["the derivation narrowed to `.ev({t:\"…\"`, which loses the events built in a variable (sail, battleflee)",
    broke("src/engine/index.js", 'const move={...(as||{t:"sail",p:p.idx})', 'const move={...(as||{tt:"sail",p:p.idx})'), 1],
  ["a fourth file starts emitting events where the derivation does not look",
    broke("src/ui/board.js", "const ON_THE_WAY={},LEAVING={};", "const ON_THE_WAY={},LEAVING={};\nfunction stray(g){g.ev({t:\"kraken\",p:0});}"), 1],
  ["the event->cue table renamed, so its keys cannot be read at all", broke("src/shared/sounds.js", "const EVENT_CUE = {", "const EVENT_CUE_RENAMED = {"), 1],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && res[idx] && !res[idx].ok;          // the rule that guards against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — every sound is mapped to an event that can still happen; ${real.length} rules, ${MUTANTS.length} mutants, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
