/* one-shot: move the two T-206 question rows from ## RULED into ## BLOCKED ON WYATT */
import { readFileSync, writeFileSync } from "node:fs";
const p = ".planning/CHART.md";
const lines = readFileSync(p, "utf8").split("\n");
const isMine = (l) => l.includes("qid:t206-which-pages") || l.includes("qid:t206-cookie-choice");
const rows = lines.filter(isMine);
const kept = lines.filter((l) => !isMine(l));
const hdr = kept.findIndex((l) => l.trim() === "| Question | Recommendation | since |");
kept.splice(hdr + 2, 0, ...rows);
writeFileSync(p, kept.join("\n"));
console.log(`moved ${rows.length} row(s); header was at ${hdr}, separator ${JSON.stringify(kept[hdr + 1])}`);
