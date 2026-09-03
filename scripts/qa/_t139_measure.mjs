/* Throwaway measurement for T-139. Reads the LIVE Chart with the page's own parse and the one
   fate rule, and prints how many of his ideas each state holds — plus what the PRE-RULING rule
   (SCHEDULED counted as finished) would have hidden. Deleted before the close. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stateOf, DECLARED, STILL_OPEN } from "../wyclau/lib/chart_model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chart = fs.readFileSync(path.join(root, ".planning/CHART.md"), "utf8");
const inboxSec = chart.split(/^## THE IDEA INBOX$/m)[1]?.split(/^## /m)[0] ?? "";
const blocks = /\(empty/.test(inboxSec) ? [] : inboxSec
  .split(/^(?=[-*] )/m).map((b) => b.trim()).filter((b) => /^[-*] /.test(b))
  .map((b) => ({ head: b.split("\n")[0].replace(/^[-*] /, ""), all: b }));

/* The rule as it stood BEFORE his ruling: one list of eight words, SCHEDULED among them. */
const OLD = /\b(SHIPPED|HARVESTED|CLOSED|DONE|FIXED|ROOT-CAUSED|SCHEDULED|PARKED)\b/;
const oldHides = (b) => {
  const m = DECLARED.exec(b); if (!m) return false;
  return !STILL_OPEN.test(m[1]) && OLD.test(m[1]);
};

const tally = { open: 0, committed: 0, parked: 0, finished: 0 };
let hiddenNow = 0, hiddenOld = 0;
const scheduledShown = [];
for (const b of blocks) {
  const s = stateOf(b.all);
  tally[s]++;
  if (s === "finished") hiddenNow++;
  if (oldHides(b.all)) hiddenOld++;
  if (s === "committed") scheduledShown.push(b.head.slice(0, 72));
}
console.log(`ideas in THE IDEA INBOX: ${blocks.length}`);
console.log(`  open ${tally.open} · committed(SCHEDULED) ${tally.committed} · parked ${tally.parked} · finished ${tally.finished}`);
console.log(`HIDDEN by the live rule : ${hiddenNow}  (finished only)`);
console.log(`HIDDEN by the OLD rule  : ${hiddenOld}  (finished + scheduled + parked)`);
console.log(`SHOWN because of his ruling, and hidden before it: ${hiddenOld - hiddenNow}`);
console.log(`\nThe SCHEDULED ideas that are on his page only because of the ruling:`);
for (const h of scheduledShown) console.log(`  · ${h}`);
