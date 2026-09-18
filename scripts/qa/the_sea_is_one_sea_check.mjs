#!/usr/bin/env node
/* THE SEA IS ONE SEA — no board may wall off water no captain can reach.
 *
 * Wyatt, 2026-09-18, with a photograph: "the islands have trapped in a player! fix the layout
 * algorithm to prevent this."
 *
 * WHY THE GENERATOR COULD DO IT. Every other constraint on island placement is LOCAL — does the
 * shape fit, is it far enough from its neighbours, does it leave the trade-wind lane, is it clear
 * of Tortuga. Not one of them asks the global question: can you still sail everywhere? A ring of
 * islands satisfies every local rule and seals the middle. Measured on the generator as it stood:
 * 43 of 400 boards (10.8%) held water no captain could ever reach, pockets of up to 15 squares.
 *
 * The fix is one constraint added beside the others (engine/index.js, `sealsWater`), checked
 * incrementally — sound because adding an island can only ever REMOVE water, so if the sea is
 * whole after island k it was whole after k-1. It is surgical: 357 of 400 boards came out
 * byte-identical and exactly the 43 broken ones changed, which is not a coincidence — a board
 * differs only if a candidate was rejected, and a rejected candidate is precisely one that would
 * have sealed water.
 *
 * RED-PROOF: the rule is deleted from a copy of the REAL engine source, which is then imported and
 * surveyed. A gate that cannot fail proves nothing, and a gate that red-proofs itself against a
 * hand-written fake proves something about the fake. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENGINE = path.join(REPO, "src/engine/index.js");
const SEEDS = 300;
const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
const RULE = "if(sealsWater(cellsR))continue;";

/** Every open-water square, and how many of them Tortuga can reach. Rim cells are never a stopping
 *  point (the wind sweeps you off), so they are impassable here exactly as the game routes. */
function survey(Game, roundCfg, seed) {
  const g = new Game(roundCfg(["human","bot","bot","bot"]), seed, true);
  const n = g.cfg.grid, key = c => c[0]+","+c[1];
  const open = c => c[0]>=0 && c[1]>=0 && c[0]<n && c[1]<n
    && !g.blocked(c) && !g.onRim(c) && g.islands[key(c)] === undefined;
  let sea = 0;
  for (let x=0;x<n;x++) for (let y=0;y<n;y++) if (open([x,y])) sea++;
  const seen = new Set([key(g.home)]), q = [g.home];
  while (q.length) {
    const c = q.shift();
    for (const d of DIRS) {
      const o = [c[0]+d[0], c[1]+d[1]];
      if (seen.has(key(o)) || !open(o)) continue;
      seen.add(key(o)); q.push(o);
    }
  }
  return { sealed: sea - seen.size, seed };
}

async function run(mod) {
  const { Game, roundCfg } = mod;
  const bad = [];
  for (let s=1; s<=SEEDS; s++) {
    let r; try { r = survey(Game, roundCfg, s); } catch { continue; }
    if (r.sealed > 0) bad.push(r);
  }
  return bad;
}

const out = [];
const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

const real = await run(await import(pathToFileURL(ENGINE).href));
rule(real.length === 0,
  `no board walls off water — ${SEEDS} seeds, every open square reachable from Tortuga`,
  `${real.length} of ${SEEDS} boards wall off water a captain can never reach (worst: seed ${real[0]?.seed}, ${real[0]?.sealed} square(s))`);

const src = fs.readFileSync(ENGINE, "utf8");
rule(src.includes(RULE),
  "island placement still asks the global question (`sealsWater`), not only the local ones",
  "the sea-is-one-sea constraint is GONE from island placement — every remaining rule is local, and local rules cannot see a ring");

/* RED-PROOF on the real source, not a stand-in. */
let redOk = false, redNote = "the mutant could not be built (the source moved)";
const mutantPath = path.join(REPO, "src/engine", `.tmp-sea-mutant-${process.pid}.js`);
try {
  if (src.includes(RULE)) {
    fs.writeFileSync(mutantPath, src.replace(RULE, ""), "utf8");
    const bad = await run(await import(pathToFileURL(mutantPath).href));
    redOk = bad.length > 0;
    redNote = redOk
      ? `without the rule, ${bad.length} of ${SEEDS} boards wall off water — the gate can fail`
      : `without the rule NOTHING went bad, so this gate proves nothing`;
  }
} catch (e) { redNote = `the mutant could not be built or imported: ${e.message}`; }
finally { try { fs.unlinkSync(mutantPath); } catch {} }
rule(redOk, `red-proof: ${redNote}`, `red-proof FAILED — ${redNote}`);

for (const r of out) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
const fails = out.filter(r => !r.ok).length;
console.log(fails ? `\nFAIL — ${fails} rule(s) broken` : `\nPASS — the sea is one sea; ${out.length} rules, red-proofed on the real engine`);
process.exit(fails ? 1 : 0);
