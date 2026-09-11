// scripts/qa/seat_parity_confirm_check.mjs — the crew parity check tells "a moment apart" from "a
// different game", and can still fail. Two fake seats, no browser:
//   stuck  — the guest shows Flaky one coin short FOREVER            -> must be CONFIRMED (a finding)
//   lag    — the guest shows it one coin short, then catches up       -> must HEAL (not a finding)
// His ruling (docs/INTENDED-BEHAVIOUR.md): "same sequence, never a different script — possibly a
// moment apart." confirmDivergence (scripts/lib/seat_parity.mjs) is the clock that encodes it.
import { compareWhenSettled, confirmDivergence } from "../lib/seat_parity.mjs";
const view = purse => JSON.stringify({ day: "DAY 14", wind: "W", captains: `test1:3,Flaky:${purse},test2:4`, lit: "test2" });
const seat = fn => ({ ev: async () => fn() });
const host = seat(() => view(7));
let failed = 0;
const say = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed++; };

const stuck = seat(() => view(6));
const first = await compareWhenSettled(host, stuck, { sampleMs: 50 });
say(first.findings && first.findings.some(f => f.field === "captains"), "a settled disagreement is SEEN (the sampler still bites)");
const c1 = await confirmDivergence(host, stuck, first.findings[0], { windowMs: 2500 });
say(c1.healed === false, `a guest that never catches up is CONFIRMED after ${c1.ms}ms — a different game stays a finding`);

const t0 = Date.now();
const lagging = seat(() => view(Date.now() - t0 > 1200 ? 7 : 6));
const second = await compareWhenSettled(host, lagging, { sampleMs: 50 });
say(second.findings && second.findings.some(f => f.field === "captains"), "the lagging guest is seen disagreeing at first");
const c2 = await confirmDivergence(host, lagging, second.findings[0], { windowMs: 5000 });
say(c2.healed === true, `a guest a moment behind HEALS (${c2.ms}ms) — his "possibly a moment apart", not a finding`);

console.log(failed ? `\nFAILED — ${failed}` : "\nPASS — the parity check tells a lag from a different game, and can still fail");
process.exit(failed ? 1 : 0);
