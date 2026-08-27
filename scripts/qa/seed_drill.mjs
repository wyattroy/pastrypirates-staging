/* SEEDED-DEFECT DRILL — does the sea trial actually CATCH the bugs Wyatt found?
 *
 * Wyatt, 2026-08-26: "test sea trial on the same bugs that you worked on last night."
 *
 * RUNNING IT ON THE FIXED BUILD AND WATCHING IT GO GREEN PROVES ALMOST NOTHING. A suite that has
 * never been seen to fail is a suite nobody should trust — the lesson this repo learned three
 * separate ways in one night (a narration probe that measured a display:none panel and reported
 * PASS; a gear picker that called an empty diff "cosmetic"; a hook drill whose sessions collided).
 *
 * So this puts the bugs BACK, one at a time, and asks whether the sea trial notices. Professionals
 * call this seeding a defect — deliberately breaking something to measure what the tests can see.
 * Anything it does NOT catch is a real gap in coverage, reported as such rather than explained away.
 *
 *   node scripts/qa/seed_drill.mjs                 every seed, on the fastest leg
 *   node scripts/qa/seed_drill.mjs --seed=T-12     just one (the baseline still sails first)
 *   node scripts/qa/seed_drill.mjs --leg=crew-phone
 *
 * IT ALWAYS PUTS THE FILE BACK, including on a crash — the restore is in a finally.
 *
 * ── HOW IT GRADES, AND WHY IT SPENT ITS WHOLE LIFE UNABLE TO FAIL ────────────────────────────
 * Until 2026-08-26 a seed scored CAUGHT when the leg exited non-zero. The leg exits non-zero ON ITS
 * OWN, for reasons that have nothing to do with any seed, so every seed scored CAUGHT whatever was
 * done to it. The drill built to prove the sea trial can fail could not itself fail — the same
 * fault as a probe that measures a display:none panel and reports PASS: an instrument reporting on
 * a subject it never reached.
 *
 * It now sails the leg ONCE WITH NOTHING SEEDED, keeps every failure that run names, and grades
 * each seed ONLY on failures the baseline did not already have. Exit status is not consulted at
 * all: two red runs both exit 1, and comparing two non-zero numbers tells you nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

/* Each seed re-introduces ONE bug Wyatt actually reported, by reversing the exact fix. `find` must
   match the shipped code; if it does not — or if the FILE itself has moved — the drill says so
   rather than silently testing nothing, which is the same failure mode as a check that cannot see
   its subject.

   THE PATHS ARE ROOT-RELATIVE BECAUSE THE GAME IS AT ROOT. The v2.0 cutover promoted `4/` to the
   repo root on 2026-08-26 and these four still pointed into `4/`, which now holds only `scripts/`.
   The drill did not report CANNOT SEED when that happened — it threw ENOENT and died, because the
   read sat outside the guard. It is inside it now. */
const SEEDS = [
  { id: "T-12", what: "the homepage drawn on top of a live voyage",
    leg: "crew-phone",
    why: "showRoom() is the MULTIPLAYER room screen. lobby.js:263 calls it only when appState.room "
       + "is set, and orchestrator.js:1893/2136 are both room paths. A solo game has no room, so a "
       + "solo leg never runs the seeded line at all.",
    file: "src/ui/lobby.js",
    find: "  hideStageLayer();\n  hideBootLoader();\n}\nexport function showRoom(){",
    with: "  hideBootLoader();\n}\nexport function showRoom(){" },
  { id: "T-16", what: "no orange glow on the ceremony's Start button",
    leg: "solo-phone",
    why: "REACHABLE IN SOLO, and this was checked rather than assumed: .ahoyGlow is added by "
       + "netIntroBarrier() (flow.js:2553), reached via showAhoyIntro() from runLiveNet() — and "
       + "appState.isHost is TRUE in solo, so solo runs that loop. The gate's own coverage line "
       + "shows `arrgh:1/1` and `start:1/1`, which ARE those buttons.",
    file: "index.html",
    find: "  #actionPanel .apBtn.ahoyGlow:not(:disabled):not([aria-disabled=\"true\"]),",
    with: "  #actionPanel .apBtn.ahoyGlowDISABLED:not(:disabled):not([aria-disabled=\"true\"])," },
  { id: "T-30", what: "Watch again shouting for attention",
    leg: "solo-phone",
    why: "the bake-off's Watch again button (bakeoff.js:179), revealed with the bake input. Solo "
       + "plays bake-offs, so the button is built and the seeded rule applies to it.",
    file: "index.html",
    find: "  #actionPanel .apBtn.bkoWatch,",
    with: "  #actionPanel .apBtn.bkoWatchDISABLED," },
  { id: "T-02", what: "a guest with no stay square — cannot stay put",
    leg: "crew-phone",
    why: "the seeded line is orchestrator.js:1716, inside watchPrompt(). watchPrompt() is attached "
       + "ONLY on a guest (the else branch at orchestrator.js:2319). A solo leg has no guest and "
       + "never calls it, so seeding this and sailing solo measures nothing whatsoever.",
    file: "src/orchestrator.js",
    find: "hint:p.hint||null,pos:p.pos||null}",
    with: "hint:p.hint||null}" },
];

const only = arg("seed");
const seeds = only ? SEEDS.filter(s => s.id === only) : SEEDS;
/* --leg= FORCES every seed onto one leg. Useful for a quick pass, and DANGEROUS as a default,
   which is why it is not one: three of these four seeds live in code a solo leg never executes.
   When it is used, the report says so on every row rather than quietly grading nothing. */
const FORCED = arg("leg", null);
const SHOTS = path.join(REPO, "seed-drill-shots");
const results = [];

/* Counts move between two runs of the same build; the SHAPE of a failure does not. So the signature
   drops the digits: "4 structural check failure(s)" and "6 structural check failure(s)" are the same
   complaint and must not read as a seed being caught. The cost of that choice, stated plainly: a
   seed whose ONLY effect is to raise a count the baseline already reports will score MISSED. That is
   the safer direction to be wrong in — this drill exists because it was over-reporting CAUGHT. */
const norm = s => String(s).replace(/\d+/g, "#");

/* Read playtest_gate's own report.json rather than scraping its log. Returns null — NOT an empty
   set — when there is no report, because "the gate never wrote a verdict" and "the gate found
   nothing wrong" are opposite facts and must never collapse into the same value. */
function signatures(out) {
  const p = path.join(out, "report.json");
  if (!fs.existsSync(p)) return null;
  let legs; try { legs = JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
  const S = new Map();                                   // signature -> the raw text, for reporting
  for (const leg of legs || []) {
    for (const v of leg.verdict || []) S.set("verdict::" + norm(v), v);
    for (const scr of leg.screens || []) for (const f of scr.fails || []) S.set(`${f.rule}::${norm(f.what)}`, `${f.rule}: ${f.what}`);
  }
  return S;
}

function sail(tag, leg) {
  const out = path.join(SHOTS, tag);
  fs.rmSync(out, { recursive: true, force: true });       // a stale report.json must never be read as this run's
  const r = spawnSync("node", ["scripts/playtest_gate.mjs", `--legs=${leg}`,
    `--out=${out}`, "--judge=off", "--port=8900", "--dbg=9900",
    /* BOUNDED. A seeded bug that is going to be caught is caught in the opening minutes -- all
       four seeds here are visible on the first screens. A full voyage per seed would be ~40
       minutes for four, which is how a drill stops being run. */
    `--max-min=${arg("max-min", "4")}`],
    { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, sigs: signatures(out), out };
}

/* ONE BASELINE PER LEG, sailed on demand and cached. This is the whole fix Wyatt asked for, plus
   the correction the first valid run forced: the seeds do not all live on the same leg, so one
   global baseline was both insufficient and misleading. */
const baselines = new Map();
const REUSE = process.argv.includes("--reuse-baselines");
function baselineFor(leg) {
  if (baselines.has(leg)) return baselines.get(leg);
  /* --reuse-baselines re-grades against a baseline ALREADY on disk instead of re-sailing it. Only
     honest while the build has not changed since that run — it is for re-scoring a finished drill
     and for the null test below, never for a fresh verdict on new code. */
  if (REUSE) {
    const out = path.join(SHOTS, `baseline-${leg}`);
    const sigs = signatures(out);
    if (sigs) {
      console.log(`\n▶ baseline (${leg}) — REUSED from ${path.relative(REPO, out)}, ${sigs.size} failure(s)`);
      const b = { status: null, sigs, out };
      baselines.set(leg, b); return b;
    }
    console.log(`\n  --reuse-baselines: no stored report for ${leg}; sailing one.`);
  }
  console.log(`\n▶ baseline (${leg}) — nothing seeded; finding out what this leg says on its own…`);
  const b = sail(`baseline-${leg}`, leg);
  if (!b.sigs) {
    console.log(`  THE ${leg} BASELINE WROTE NO REPORT (${path.join(b.out, "report.json")} absent).`);
    console.log(`  Without it there is nothing to subtract, so every seed on this leg would score`);
    console.log(`  CAUGHT again. Refusing to grade them.`);
  } else {
    console.log(`  baseline names ${b.sigs.size} failure(s) of its own — subtracted from every ${leg} seed:`);
    for (const t of b.sigs.values()) console.log(`    · ${String(t).slice(0, 110)}`);
    /* THE CONFOUND, NAMED OUT LOUD. If the baseline itself never finishes, "did not finish the
       voyage" is subtracted from every seed — and that is exactly the signature a seed which
       BREAKS the game would produce. The drill is then blind to its most important class of catch.
       Said here rather than in a doc, because the person who needs it is reading this output. */
    if ([...b.sigs.keys()].some(k => /did not finish/.test(k)))
      console.log(`  ⚠ this baseline did not finish its voyage, so "did not finish" cannot discriminate.\n` +
                  `    A seed that BREAKS the game outright will read as MISSED. Raise --max-min until\n` +
                  `    the baseline finishes before trusting a MISSED on this leg.`);
  }
  baselines.set(leg, b);
  return b;
}

/* ── THE NULL TEST — does this drill fire on NOTHING? ────────────────────────────────────────
   A CAUGHT means "this run produced a failure signature the baseline did not have". That is only
   evidence of a SEED if two UNSEEDED runs of the same leg produce the same signatures. Nobody had
   ever checked, and the first per-leg run reported 4/4 with two of the four "caught" by a line the
   gate itself labels `not failures` — motion-only observations, which are timing-dependent.

   So: sail the leg again with nothing seeded and grade it exactly as a seed. Anything it reports
   IS the noise floor, by construction, because there is no seed to explain it. Rule 6's other
   half: a check that cannot fail is not a check, and a check that fires on nothing is worse. */
if (process.argv.includes("--null")) {
  const legs = [...new Set(seeds.map(x => FORCED || x.leg))];
  console.log(`\n══ NULL TEST — sailing ${legs.length} leg(s) with NOTHING seeded, graded as if seeded ══`);
  let floor = 0;
  for (const leg of legs) {
    const base = baselineFor(leg);
    if (!base.sigs) { console.log(`  ${leg}: no baseline — cannot measure a noise floor`); continue; }
    console.log(`\n▶ null (${leg}) — a second unseeded run…`);
    const run = sail(`null-${leg}`, leg);
    if (!run.sigs) { console.log(`  ${leg}: null run wrote no report — NOT graded`); continue; }
    const fresh = [...run.sigs.keys()].filter(k => !base.sigs.has(k)).map(k => run.sigs.get(k));
    const gone  = [...base.sigs.keys()].filter(k => !run.sigs.has(k)).map(k => base.sigs.get(k));
    /* COUNT BOTH DIRECTIONS, and the first version of this counted only `fresh`. That gave
       "NOISE FLOOR: 0 — two unseeded runs agree" on a crew-phone pair where THREE signatures had
       vanished between them. They did not agree at all.

       A DISAPPEARING SIGNATURE IS EXACTLY AS DAMNING AS AN APPEARING ONE, because the baseline is
       the subtrahend. For a flapping signature S: when the baseline happens to HOLD S, a seeded run
       showing S is correctly subtracted; when the baseline happens to LACK S, that same run reads as
       CAUGHT. Instability in EITHER direction means the baseline is a coin toss, and that is how
       T-12 and T-02 were both "caught" 2026-08-26 by the §0 sail-square bug rather than by their
       seeds. Instability is the measurement; which way it fell on the day is not. */
    floor += fresh.length + gone.length;
    console.log(`  ${leg}: ${fresh.length} signature(s) appeared with NO seed, ${gone.length} disappeared` +
                `  -> ${fresh.length + gone.length} unstable`);
    for (const f of fresh) console.log(`    + ${String(f).slice(0, 120)}`);
    for (const g of gone)  console.log(`    - ${String(g).slice(0, 120)}`);
    if (fresh.length + gone.length === 0) console.log(`    (identical — this leg's signature set is stable)`);
  }
  console.log(`\n══ NOISE FLOOR: ${floor} unstable signature(s) ══`);
  console.log(floor === 0
    ? "  Zero. Two unseeded runs produced identical signature sets, so a CAUGHT means something."
    : `  NOT ZERO. ${floor} signature(s) differed between two runs with NOTHING seeded.\n` +
      `  Every one of them can produce a FALSE CAUGHT: the baseline is subtracted, so whenever it\n` +
      `  happens to lack a flapping signature, any run that shows it reads as caught. A seed whose\n` +
      `  only new signature has one of these shapes is NOT caught, whatever the summary says.\n` +
      `  One baseline cannot fix this. Either make the underlying defect deterministic, or sail\n` +
      `  several baselines and treat only the signatures present in ALL of them as stable.`);
  process.exit(floor === 0 ? 0 : 1);
}

for (const s of seeds) {
  const leg = FORCED || s.leg;
  const full = path.join(REPO, s.file);
  /* The read is INSIDE the guard. A file that has moved reports CANNOT SEED like a line that has
     moved; before the cutover it threw ENOENT and killed the run instead. */
  if (!fs.existsSync(full)) {
    results.push({ ...s, leg, verdict: "CANNOT SEED", note: `${s.file} does not exist — the tree moved, so this drill tested nothing` });
    console.log(`\n  ${s.id}  CANNOT SEED — ${s.file} is gone; not testing nothing and calling it a pass`);
    continue;
  }
  const original = fs.readFileSync(full, "utf8");
  if (!original.includes(s.find)) {
    results.push({ ...s, leg, verdict: "CANNOT SEED", note: "the shipped code no longer contains the line this seed reverses — the fix moved, so this drill tested nothing" });
    console.log(`\n  ${s.id}  CANNOT SEED — the fix has moved; not testing nothing and calling it a pass`);
    continue;
  }
  const base = baselineFor(leg);
  if (!base.sigs) {
    results.push({ ...s, leg, verdict: "NO BASELINE", note: `the ${leg} baseline wrote no report — NOT graded, and NOT a pass` });
    console.log(`  ${s.id}  NO BASELINE on ${leg} — not graded`);
    continue;
  }
  try {
    fs.writeFileSync(full, original.replace(s.find, s.with));
    console.log(`\n▶ ${s.id} — ${s.what}\n  seeded into ${s.file}; sailing ${leg}${FORCED && FORCED !== s.leg ? `  ⚠ FORCED off its own leg (${s.leg}) — it may be unreachable here` : ""}…`);
    const run = sail(s.id, leg);
    if (!run.sigs) {
      results.push({ ...s, leg, verdict: "NO REPORT", note: "the gate wrote no report.json for this run — NOT graded, and NOT a pass" });
      console.log(`  ${s.id}  NO REPORT — the gate never reached a verdict; this seed is not graded`);
      continue;
    }
    const fresh = [...run.sigs.keys()].filter(k => !base.sigs.has(k)).map(k => run.sigs.get(k));
    const caught = fresh.length > 0;
    results.push({ ...s, leg, verdict: caught ? "CAUGHT" : "MISSED", fresh,
      note: caught ? fresh.slice(0, 2).map(t => String(t).slice(0, 90)).join(" | ") : `nothing the baseline did not already say (${run.sigs.size} vs ${base.sigs.size} failure(s))` });
    console.log(`  ${s.id}  ${caught ? "CAUGHT ✓" : "MISSED ✗"}  ${results.at(-1).note}`);
  } finally {
    fs.writeFileSync(full, original);            // always, even on a crash
  }
}

console.log("\n=== SEEDED-DEFECT DRILL ===");
for (const [leg, b] of baselines) console.log(`  baseline ${leg.padEnd(12)} ${b.sigs ? b.sigs.size + " pre-existing failure(s)" : "NO REPORT — its seeds were not graded"}`);
console.log("");
for (const r of results) console.log(`  ${r.id.padEnd(6)} ${String(r.leg).padEnd(12)} ${r.verdict.padEnd(12)} ${r.what}`);
const missed = results.filter(r => r.verdict === "MISSED");
const graded = results.filter(r => r.verdict === "CAUGHT" || r.verdict === "MISSED");
console.log(`\n  caught ${results.filter(r => r.verdict === "CAUGHT").length} / ${graded.length} graded` +
            (graded.length < results.length ? `   (${results.length - graded.length} NOT GRADED — read them above; not-graded is not passed)` : ""));
for (const r of results.filter(r => r.verdict === "CAUGHT")) {
  console.log(`\n  ${r.id} was caught by:`);
  for (const f of r.fresh.slice(0, 4)) console.log(`    ✗ ${String(f).slice(0, 130)}`);
}
if (missed.length) {
  console.log(`\n  ${missed.length} REAL GAP(S) — the sea trial would not have found these:`);
  for (const m of missed) console.log(`    ${m.id}  ${m.what}\n           reachable because: ${m.why}`);
  console.log(`\n  This is a coverage finding about the PROCESS, not a bug in the game — BUT read the`);
  console.log(`  baseline warnings above first. A MISSED on a leg whose baseline never finished is`);
  console.log(`  not yet a gap; it may be a seed the drill could not see.`);
}
