/* _t215_e2_realdata.mjs — watch e2's own look at what the fix surfaces on REAL trial data.
 *
 * Not a gate. Deleted before the commit. It exists because the previous session's claim
 * ("ten screens, five distinct defects") is a sentence in a document, and rule 6 says a document
 * is not a measurement. This runs the CURRENT legVerdict over the report the trial actually wrote
 * and prints every judge-failure line, so the claim can be checked rather than repeated.
 *
 * `_`-prefixed on purpose: that is this directory's established convention for a throwaway probe,
 * and it is what keeps gate_count_check from counting it as a gate.
 */
import { readFileSync } from "node:fs";
import { legVerdict } from "../lib/leg_verdict.mjs";

const rep = JSON.parse(readFileSync(new URL("../../sea-trial-shots/report.json", import.meta.url), "utf8"));
const legs = Array.isArray(rep) ? rep : (rep.legs || rep.results || []);
console.log(`report holds ${legs.length} leg record(s)\n`);

let named = 0;
for (const leg of legs) {
  const v = legVerdict(leg);
  const judgeLines = v.filter((x) => /vision judge FAILED/.test(x));
  if (!judgeLines.length) continue;
  console.log(`-- ${leg.name ?? "(unnamed leg)"} --`);
  for (const line of judgeLines) {
    console.log(line);
    named += (line.match(/\n/g) || []).length;
  }
  console.log("");
}
console.log(`TOTAL screens named with the judge's own sentence: ${named}`);
