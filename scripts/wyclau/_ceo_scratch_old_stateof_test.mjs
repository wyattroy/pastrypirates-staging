// SCRATCH — CEO review verification only, not part of the fix. Reconstructs the PRE-FIX stateOf()
// from the git diff (removed lines) and runs the new gate's 6 fixtures against it to verify the
// claimed "2 of 6 failed before the fix" independently of hand-tracing the regexes.
const DECLARED = /(?:→|->)\s*\*\*([^*]{0,160})/;
const FINISHED_WORDS = ["SHIPPED", "HARVESTED", "CLOSED", "DONE", "FIXED", "ROOT-CAUSED"];
const COMMITTED_WORDS = ["SCHEDULED"];
const PARKED_WORDS = ["PARKED"];
const wordRe = (list) => new RegExp(String.raw`\b(${list.join("|")})\b`);
const FINISHED = wordRe(FINISHED_WORDS);
const COMMITTED = wordRe(COMMITTED_WORDS);
const PARKED = wordRe(PARKED_WORDS);
const STILL_OPEN = /\bSTILL OPEN\b|\bNOT (?:SHIPPED|DONE|BUILT|FIXED)\b|\bUNCONFIRMED\b/;

function stateOf_OLD(block) {
  const m = DECLARED.exec(block);
  if (!m) return "open";
  const v = m[1];
  if (STILL_OPEN.test(v)) return "open";
  if (FINISHED.test(v)) return "finished";
  if (COMMITTED.test(v)) return "committed";
  if (PARKED.test(v)) return "parked";
  return "open";
}

const cases = [
  ["1 t243Shape -> finished", [
    '- **Wyatt, written on the Glass**: *"Regenerate sitemap.xml..."*',
    '      ⟨`T-243`⟩',
    '      ✅ **CLOSED PROPERLY 2026-09-06, CEO 226 (YES), through the gate this time.** The old warning',
    '      here (about a prior close landing on `T-137` instead) described a bug in `close_item.mjs`.',
  ].join("\n"), "finished"],
  ["2 trapShape -> NOT finished", [
    '- [ ] **Add New SFX to the game** — his own asset request.',
    '      ⟨`T-073`⟩',
    '      🔒 CLAIMED — in hand on the Mac. DO NOW.',
    "      ✅ **THE GATE IS CLEAR — `T-261` CLOSED 2026-09-06 (commit `826e26fd`), CEO 226 accepted the",
    "      fix), AND THIS ROW'S OWN \"GATED ON T-261\" LINE WAS LEFT STANDING FOR HOURS AFTER THAT.**",
  ].join("\n"), "!finished"],
  ["3 wrongOrderShape -> finished", [
    '- **fixture row**',
    '      ⟨`T-900`⟩',
    '      ✅ **CLOSED PROPERLY, done.** ',
    '      ✅ **AN EARLIER PARTIAL NOTE THAT SAYS NOTHING ABOUT BEING FINISHED.**',
  ].join("\n"), "finished"],
  ["4 arrowWinsShape -> open", [
    '- **fixture row**',
    '      ⟨`T-901`⟩',
    '      → **STILL OPEN, waiting on him.**',
    '      ✅ **CLOSED, done.**',
  ].join("\n"), "open"],
  ["5 noMarkerShape -> open", ['- **fixture row**', '      ⟨`T-902`⟩', '      just prose, no verdict.'].join("\n"), "open"],
  ["6 notSingleThreadedShape -> finished", [
    '- **fixture row**',
    '      ⟨`T-903`⟩',
    '      ✅ **CLOSED PROPERLY, through the gate this time.**',
    '      some more prose about what the close covered...',
    '      still more prose."* → **NOT YET FATED — harvested verbatim, not investigated.**',
  ].join("\n"), "finished"],
];

let fails = 0;
for (const [label, block, expect] of cases) {
  const got = stateOf_OLD(block);
  const ok = expect.startsWith("!") ? got !== expect.slice(1) : got === expect;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (got: ${got})`);
}
console.log(`\n${fails} of ${cases.length} failed under OLD stateOf()`);
