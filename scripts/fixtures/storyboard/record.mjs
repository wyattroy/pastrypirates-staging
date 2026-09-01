#!/usr/bin/env node
/* RE-RECORD THE STORYBOARD FIXTURE.
 *
 *   node scripts/fixtures/storyboard/record.mjs
 *
 * WHY THIS FILE EXISTS: CEO review 41 found the fixture committed WITHOUT its recorder — the
 * events could be re-compared forever but never re-made. A fixture whose provenance left with the
 * session that made it is a fixture nobody can trust or refresh; when the engine legitimately
 * changes, the only options would be to hand-edit recorded data or delete the gate.
 *
 * THE SAME THREE SEEDS AND THE SAME BOT STRATEGIES the determinism recorder uses, so the corpus is
 * a real game rather than a hand-built one. It must keep spanning BOTH sides of the walk threshold
 * — routes under 3 squares (which must not walk) and longer ones (which must) — and it says so
 * below, because a fixture that drifts to one side turns the golden gate into theatre. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(ROOT, "src/engine/index.js")).href);

const STRATS = ["balanced", "pirate", "trader", "rusher"];
const SEEDS = [12345, 12346, 12347];
const out = [];
for (const seed of SEEDS) {
  const g = new Game(roundCfg(STRATS), seed, true);   // record=true — Game.ev() is a no-op otherwise
  g.play();
  out.push(...g.events);
}
const sails = out.filter(e => e.t === "sail");
const routed = sails.filter(e => e.draw && e.draw.route);
const lens = {};
for (const e of routed) lens[e.draw.route.length] = (lens[e.draw.route.length] || 0) + 1;
const short = routed.filter(e => e.draw.route.length < 3).length;

const target = path.join(ROOT, "scripts/fixtures/storyboard/events.jsonl");
fs.writeFileSync(target, out.map(e => JSON.stringify(e)).join("\n") + "\n");
console.log(`recorded ${out.length} event(s) from seeds ${SEEDS.join(", ")} -> ${path.relative(ROOT, target)}`);
console.log(`  sails ${sails.length}, carrying a route ${routed.length}, route lengths ${JSON.stringify(lens)}`);
if (short > 0 && routed.length - short > 0) console.log(`  spans the threshold: ${short} too short to walk, ${routed.length - short} long enough — the golden gate can still discriminate`);
else console.log(`  ⚠ DOES NOT SPAN THE THRESHOLD (${short} short, ${routed.length - short} long) — the golden gate would be vacuous; do not commit this fixture`);
console.log(`\nNow: node scripts/qa/storyboard_golden_check.mjs --update   and READ THE DIFF.`);
