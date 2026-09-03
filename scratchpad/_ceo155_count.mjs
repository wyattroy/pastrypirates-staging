import fs from "node:fs";
import * as m from "../scripts/wyclau/lib/chart_model.mjs";
const src = fs.readFileSync("C:/Users/wyatt/Projects/pastrypirates/.planning/CHART.md", "utf8");
const inboxSec = src.split(/^## THE IDEA INBOX$/m)[1]?.split(/^## /m)[0] ?? "";
const blocks = /\(empty/.test(inboxSec) ? [] : inboxSec.split(/^(?=[-*] )/m).map((b) => b.trim()).filter((b) => /^[-*] /.test(b));
const tally = { open: 0, committed: 0, parked: 0, finished: 0 };
for (const b of blocks) tally[m.stateOf(b)]++;
console.log("inbox blocks:", blocks.length, JSON.stringify(tally));
const OLD = /\b(SHIPPED|HARVESTED|CLOSED|DONE|FIXED|ROOT-CAUSED|SCHEDULED|PARKED)\b/;
let oldHidden = 0;
for (const b of blocks) {
  const d = m.DECLARED.exec(b);
  if (!d) continue;
  const v = d[1];
  if (m.STILL_OPEN.test(v)) continue;
  if (OLD.test(v)) oldHidden++;
}
console.log("hidden LIVE:", tally.finished, "| hidden PRE-RULING:", oldHidden);
console.log("--- PARKED blocks ---");
for (const b of blocks) if (m.stateOf(b) === "parked") console.log("  HEAD:", b.split("\n")[0].slice(0, 130), "\n   FULL:", b.replace(/\s+/g, " ").slice(0, 300));
console.log("--- sample COMMITTED heads (5) ---");
let n = 0;
for (const b of blocks) if (m.stateOf(b) === "committed" && n++ < 5) console.log("  *", b.split("\n")[0].slice(0, 130));
