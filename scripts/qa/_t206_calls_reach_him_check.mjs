#!/usr/bin/env node
/* T-206 — HIS TWO ANALYTICS CALLS MUST BE ON A SURFACE HE CAN ANSWER FROM.
 *
 * The install of the Google Analytics tag is blocked on two decisions that are HIS, stated in
 * `CHART.md`'s own row: which pages get the tag, and cookie or cookieless. On 2026-09-03 both were
 * written onto `.planning/ANALYTICS-PLAN.html` — a repo path, not a URL, and CEO 177's top finding
 * was that he therefore cannot answer either one. Rule 27: hand him a link he can tap, never a
 * file path.
 *
 * The one question surface a Bell watch can reach without an Artifact tool is `CHART.md`'s
 * `## BLOCKED ON WYATT` table, which `glass.mjs` renders onto his Your Call card. So this check
 * asks the narrow question: are both calls sitting in that table, each carrying a `qid:` and each
 * declaring NUMBERED options with one marked (recommended) — the shape he asked for twice
 * (`INBOX-20260903T1600Z`, `INBOX-20260903T1556Z`)?
 *
 * WHY THIS IS NOT A GATE IN `npm test`: like `_t206_dark_property_check.mjs` beside it, it is RED
 * on the tree where it was written, and a gate added red is a gate somebody disables. It becomes
 * chain-worthy the moment both rows exist — at which point what it guards is his questions being
 * deleted from the table before he has answered them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const chart = readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8");

const blockSec = chart.split(/^## BLOCKED ON WYATT$/m)[1]?.split(/^## /m)[0] ?? "";

/* The two calls, by the qid each must carry. Slugs chosen to match the house `t206-` prefix. */
const WANT = [
  { qid: "t206-which-pages", about: "which pages get the tag" },
  { qid: "t206-cookie-choice", about: "cookie notice or cookieless" },
];

/* Same parse `glass.mjs:449-468` performs, so a row this check accepts is a row his page renders. */
const rows = blockSec.split("\n")
  .filter((l) => l.startsWith("|") && !/^\|\s*Question|^\|-+/.test(l) && !/^\|\s*---/.test(l))
  .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean))
  .filter((c) => c.length >= 2);

/* Same option parse as `questionOptions()` in lib/chart_model.mjs — deliberately duplicated in
 * eleven lines rather than imported, because this check exists to prove his page can read the row;
 * importing the reader would make it agree with itself. Kept minimal on purpose. */
function numbered(cell) {
  return String(cell).split(/(?:^|\s)(?=[1-9]\d?\.\s)/)
    .map((x) => x.trim()).filter((p) => /^[1-9]\d?\.\s+\S/.test(p));
}

const fails = [];
for (const { qid, about } of WANT) {
  const row = rows.find((c) => c[0].includes(`qid:${qid}`));
  if (!row) { fails.push(`no row in ## BLOCKED ON WYATT carries qid:${qid} — his call on ${about} is on no surface he can answer from`); continue; }
  const opts = numbered(row[1] ?? "");
  if (opts.length < 2) fails.push(`qid:${qid} declares ${opts.length} numbered option(s); his page needs 2+ to draw numbered buttons, so it would fall back to generic ones`);
  else if (!/\(recommended\)/i.test(row[1])) fails.push(`qid:${qid} numbers its options but marks none (recommended) — he asked for the mark, twice`);
}

if (fails.length) {
  console.log("FAIL -- T-206: his two analytics calls do not reach him.");
  for (const f of fails) console.log(`  • ${f}`);
  process.exit(1);
}
console.log(`PASS -- both T-206 calls are on his Your Call card, numbered, each with a recommendation.`);
