#!/usr/bin/env node
/* THE STORYBOARD GOLDEN FILE — step 4 of the one-director plan.
 *
 *   node scripts/qa/storyboard_golden_check.mjs              verify against the committed golden
 *   node scripts/qa/storyboard_golden_check.mjs --update     re-record it (review the diff!)
 *
 * WHAT THIS REPLACES, AND WHY THAT MATTERS MORE THAN WHAT IT DOES. The plan's first version of this
 * gate was "the same seed through a solo client and a host+guest pair" — a live, two-client,
 * networked comparison needing Firebase, real timing and two browsers. CEO review 31 threw it out
 * for a reason this project has paid for: **a gate that flakes gets disabled, and a disabled gate is
 * worse than no gate, because it was believed for a while.**
 *
 * THE VERSION THAT CANNOT FLAKE IS ALSO THE STRONGER ONE. If L3 is genuinely pure, you do not need
 * two clients to compare at all: there is ONE present(), so both clients produce the same storyboard
 * because they run the same function on the same events. Parity stops being something you measure
 * and becomes true by construction. This gate exists to notice if that construction ever changes —
 * a storyboard that moves without somebody meaning it to.
 *
 * WHY IT IS BUILT NOW, WITH ONE KIND CONVERTED, RATHER THAN AFTER TWO. The plan says "as soon as two
 * event kinds are converted", and gives the reason: "early enough that it guards the rest of the
 * migration rather than certifying it afterwards". One kind serves that reason better than two.
 *
 * THE FIXTURE IS A REAL GAME, AND THE FIRST ONE I REACHED FOR WOULD HAVE BEEN VACUOUS.
 * scripts/fixtures/determinism/ holds 1,820 recorded sails — and **not one of them carries
 * draw.route**, because that corpus predates the lane. A golden built on it would be 1,820 empty
 * beat lists: green forever, whatever present() did to a routed sail. Checked before building, not
 * after. So scripts/fixtures/storyboard/events.jsonl is recorded fresh from three seeded engine
 * runs (12345/12346/12347, the same bot strategies the determinism recorder uses), and it spans
 * BOTH SIDES of the walk threshold — 19 two-square hops that must not walk, and 137 longer routes
 * that must.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { present } = await import(pathToFileURL(path.join(ROOT, "src/shared/storyboard.js")).href);

const EVENTS = path.join(ROOT, "scripts/fixtures/storyboard/events.jsonl");
const GOLDEN = path.join(ROOT, "scripts/fixtures/storyboard/golden.json");
const UPDATE = process.argv.includes("--update");

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);
console.log("storyboard_golden_check — the storyboard may not move without somebody meaning it to\n");

if (!fs.existsSync(EVENTS)) {
  fail(`the fixture is missing: ${path.relative(ROOT, EVENTS)} — this gate has no subject, so its silence would mean nothing`);
  console.log(`\nFAIL — ${failures} failure(s)`); process.exit(1);
}

const events = fs.readFileSync(EVENTS, "utf8").trim().split("\n").map(l => JSON.parse(l));
/* Only converted kinds appear. `null` means "not converted yet" and is deliberately NOT recorded —
   otherwise every future conversion would show up as a diff in every unconverted kind's row. */
const produced = [];
for (let i = 0; i < events.length; i++) {
  const beats = present(events[i]);
  if (beats === null) continue;
  produced.push({ i, t: events[i].t, beats });
}

/* ANTI-VACUITY, FIRST AND LOUDEST. A golden of all-empty lists passes forever and proves nothing —
   which is exactly what the determinism corpus would have produced. Assert the fixture still
   exercises BOTH answers before believing any comparison below. */
{
  const walking = produced.filter(p => p.beats.length > 0).length;
  const empty = produced.length - walking;
  walking > 0 && empty > 0
    ? pass(`the fixture discriminates — ${produced.length} converted event(s): ${walking} produce beats, ${empty} correctly produce none`)
    : fail(`the fixture no longer exercises both answers (${walking} with beats, ${empty} without) — a golden that is all one thing cannot fail, so every comparison below would be theatre`);
}

if (UPDATE) {
  fs.writeFileSync(GOLDEN, JSON.stringify(produced, null, 1) + "\n");
  console.log(`\n  RE-RECORDED ${path.relative(ROOT, GOLDEN)} — ${produced.length} converted event(s).`);
  console.log("  READ THE DIFF. A golden updated without reading it is a gate switched off quietly.");
  process.exit(failures ? 1 : 0);
}

if (!fs.existsSync(GOLDEN)) {
  fail(`no golden on record — run with --update once, READ THE DIFF, and commit it`);
} else {
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  if (golden.length !== produced.length) {
    fail(`the storyboard now covers ${produced.length} event(s); the golden has ${golden.length}. If a kind was converted deliberately, re-record with --update and read the diff.`);
  } else {
    const diffs = [];
    for (let k = 0; k < golden.length; k++) {
      const a = JSON.stringify(golden[k]), b = JSON.stringify(produced[k]);
      if (a !== b) diffs.push(`event #${produced[k].i} (${produced[k].t}): golden ${a.slice(0, 120)} → now ${b.slice(0, 120)}`);
    }
    diffs.length === 0
      ? pass(`all ${golden.length} storyboard(s) are byte-identical to the golden — nothing moved`)
      : fail(`${diffs.length} storyboard(s) changed:\n          ${diffs.slice(0, 3).join("\n          ")}`);
  }
}

/* RED-PROOF. A comparison that cannot separate two different storyboards is not a comparison. */
{
  const a = JSON.stringify([{ i: 1, t: "sail", beats: [{ do: "walkRoute", seat: 1, from: [0, 0], path: [[0, 1], [1, 1]] }] }]);
  const b = JSON.stringify([{ i: 1, t: "sail", beats: [{ do: "walkRoute", seat: 2, from: [0, 0], path: [[0, 1], [1, 1]] }] }]);
  const c = JSON.stringify([{ i: 1, t: "sail", beats: [] }]);
  (a !== b && a !== c)
    ? pass("red-proof: this comparison separates a changed seat and a vanished beat — it can fail")
    : fail("red-proof FAILED — the comparison cannot distinguish two different storyboards");
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
