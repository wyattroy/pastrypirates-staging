/* T-206 — rewrite the ruling's CHECKLIST row (what he SEES on the Tasks card), and file his
 * third sentence as its own row.
 *
 *   node scripts/qa/_t206_rows.mjs
 *
 * The Tasks card on his Glass is built from the STEP 1 CHECKLIST, so this row is the only part of
 * T-206 he can actually read. It currently says "Untriaged. A watch decides whether this still
 * owes work" -- true this morning, wrong now that the plan is written.
 *
 * Done as a script for the same reason as _t206_triage.mjs: the row carries ~1,900 characters of
 * his own words that must survive byte for byte. Only the trailing session-written sentence moves.
 * Idempotent. Throwaway.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHART = path.join(ROOT, ".planning", "CHART.md");

const ANCHOR = "- [ ] Your ruling: ⟨`T-206`⟩ **There is probably already a Google Analytics account";
const OLD_TAIL = "**Untriaged.** A watch decides whether this still owes work, then moves the ruling to SETTLED RULINGS and deletes this row.";

const NEW_TAIL =
  "**⚑ THE PLAN YOU ASKED FOR IS WRITTEN — and it needs two answers from you.** " +
  "`.planning/ANALYTICS-PLAN.html`: what you already collect and why the drop-off reads worse " +
  "than it is, the three things Google actually adds, and five numbered steps to switch it on. " +
  "**Nothing installed** — you asked for instructions, and consent is yours. **Your two calls, " +
  "both on the page with a recommendation marked:** (1) which pages get the tag — public pages " +
  "only *(recommended)*, everything including `/classic`, or the game page alone; and (2) cookie " +
  "notice or cookieless *(cookieless recommended)*. **Step 1 is ten seconds of yours:** open " +
  "`analytics.google.com` and confirm `G-2KK6EZDZSP` is there. The ruling itself is settled in " +
  "[`CHART-LOG.md`](CHART-LOG.md); this row stays because the install is still outstanding.";

// NO HANDLE LINE — `chartkeeper.mjs --write` allocates the next free one. Hand-picking an id is
// how you land on somebody else's: T-217 was taken by another row between this script being
// written and being run, and the chartkeeper's own duplicate-handle warning is the reason that
// matters ("nothing may be claimed from a mention of one").
const NEW_ROW =
  "- [ ] **LET A SEA TRIAL BE RUN AT A DEPTH SOMEBODY CHOOSES — his own words, and he is right.**\n" +
  "      `INBOX-20260902T214507Z` / his ruling on `qid:t206-ga-turn-on`: *\"we need a way to bypass\n" +
  "      sea trial for this -- it clearly doesn't need a full one given that you're just adding a\n" +
  "      tag to index; so we need a way to tell sea trial that and manually choose the depth of the\n" +
  "      trial\"*. **Split off T-206 deliberately** — that item is the analytics plan, this one\n" +
  "      changes the testing machinery, and folding them together finishes neither.\n" +
  "      **THE SIZE:** today `scripts/qa/gear.mjs` decides the gear from the files touched and\n" +
  "      nothing can overrule it, so a one-line script tag in `index.html` buys the same ~75-minute\n" +
  "      FULL trial as a rewrite of the board. That rule exists for a reason — `.claude/CLAUDE.md`\n" +
  "      §5: *\"chosen by the files you touched, never by how the change feels\"* — and it was earned\n" +
  "      the day a session picked its own depth by mood and shipped 22 unverified fixes.\n" +
  "      ⚠ **SO THE JOB IS NOT \"ADD A BYPASS FLAG\", AND WHOEVER TAKES IT SHOULD SAY SO TO HIM.** An\n" +
  "      unconditional `--gear=cosmetic` re-creates exactly the failure the rule was written\n" +
  "      against. What is defensible is a depth a person can lower *on the record*: the reason\n" +
  "      typed in, the chosen gear and the picker's own verdict both printed in the trial report,\n" +
  "      so a shallow trial can never read as a full one. **Recommend that shape to him before\n" +
  "      building either.**\n" +
  "      **Read first:** `docs/QA-PROCESS.md` (\"THE WHOLE LOOP, END TO END\"),\n" +
  "      `docs/HARD-WON-LESSONS.md` §10, `scripts/qa/gear.mjs:78-121`.\n";

let s = fs.readFileSync(CHART, "utf8");
let changed = 0;

// 1. the ruling's own checklist row
const i = s.indexOf(ANCHOR);
if (i === -1) {
  console.log("skip — the T-206 ruling checklist row is not where it was.");
} else {
  const j = s.indexOf("\n", i);
  const row = s.slice(i, j);
  if (!row.endsWith(OLD_TAIL)) {
    console.log("skip — that row no longer ends in the Untriaged sentence; leaving it alone.");
  } else {
    s = s.slice(0, i) + row.slice(0, row.length - OLD_TAIL.length) + NEW_TAIL + s.slice(j);
    changed++;
    console.log(`rewrote the T-206 checklist row's tail (${OLD_TAIL.length} -> ${NEW_TAIL.length} chars)`);
  }
}

// 2. his third sentence, as its own row — filed immediately after T-206's block
if (s.includes("LET A SEA TRIAL BE RUN AT A DEPTH SOMEBODY CHOOSES")) {
  console.log("skip — the sea-trial-depth row is already on the Chart.");
} else {
  const k = s.indexOf(ANCHOR);
  const end = k === -1 ? -1 : s.indexOf("\n", s.indexOf("\n", k) + 1); // row + its handle line
  if (end === -1) { console.error("could not find where to file T-217"); process.exit(1); }
  s = s.slice(0, end + 1) + NEW_ROW + s.slice(end + 1);
  changed++;
  console.log("filed ⟨T-217⟩ — the sea-trial depth control, his third sentence");
}

if (changed) fs.writeFileSync(CHART, s, "utf8");
console.log(`${changed} change(s) written`);
