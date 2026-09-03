#!/usr/bin/env node
/* harvest_glass.mjs — carry Wyatt's writing off the Glass and into the record, MECHANICALLY.
 *
 * `T-140`. Four kinds of his own words live only in the live artifact's state block:
 * `ideas`, `comments`, `rulings`, and the `now:true` pin on a pressed idea. **A republish
 * regenerates the page with `ideas: []` and `rulings: {}`** — so anything not carried across
 * first is DELETED. `glass-harvest-first.cjs` proves a session READ the page. Nothing proved it
 * MOVED anything, and between his press and his Chart sat one human-shaped step, four times over.
 *
 * ⚠ WHY THIS IS A ROW AND NOT A NOTE: a comment box that rendered and did not save cost him words
 * on 2026-09-03 (`T-076`, found by CEO 144). The machine said done, the words were gone, and every
 * gate was green. **A hand-transcription step fails exactly that way and nothing reports it.**
 *
 * WHAT IS STILL A HAND STEP, said plainly rather than overclaimed: **getting the HTML.** Only the
 * Artifact tool can read a published artifact — a node script cannot fetch one, and a Bell-launched
 * watch has no Artifact tool at all. So the session still reads the page. What it no longer does is
 * TRANSCRIBE it.
 *
 * USAGE:
 *   node scripts/wyclau/harvest_glass.mjs --html=<path>     # the file the Artifact read saved
 *   node scripts/wyclau/harvest_glass.mjs --html=<path> --dry-run
 *
 * EXIT: 0 harvested (or nothing to harvest — an empty page is a success, not a failure)
 *       1 could not read the state block, or a write did not land
 *       2 usage
 *
 * ⚑ IDEMPOTENT BY HIS TIMESTAMP, AND THIS IS LOAD-BEARING. It WILL be run twice — a session unsure
 * whether it harvested runs it again, which is the correct instinct. Every entry carries the `at`
 * from his own keystroke; an entry whose `at` is already in the destination file is skipped. A
 * harvest that duplicated his words would be worse than the hand step, which at least has a human
 * noticing the repeat.
 *
 * ⚑ AND THE COUNTS ARE READ BACK OFF DISK, NEVER TAKEN FROM THE LOOP. The failure this row is
 * about is "the machine says done and the words are gone", so a summary counted from the array it
 * iterated would reproduce that fault one layer up. Every number printed below is counted by
 * re-reading the destination file and finding the id in it.
 *
 * ⚠ AND EXACTLY WHAT THAT DOES NOT COVER, because the first version of this paragraph read wider
 * than it was (CEO 162): **it verifies the new entry ARRIVED. It does not verify the destination's
 * OTHER content survived.** A write that lands and wipes everything else counts as a success here —
 * measured at 61 of his 64 entries, with `verified in the file` printed over the top. That is the
 * gate's case 1's job now, not this counter's. A count is downstream of the selection and blind to
 * collateral damage; both halves are needed and neither substitutes for the other.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
const arg = (n) => (argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=");
const DRY = argv.includes("--dry-run");
const HTML = arg("html");

/* ⚑ THE DESTINATIONS ARE OVERRIDABLE **SO A GATE CAN POINT THEM AT SCRATCH FILES**, and that is
 * the whole reason. The alternative — let a check write the real INBOX and put it back afterwards —
 * is the destroy-then-repair this project ruled against on `T-112`: *"a destroy-then-repair is
 * still a window, and this project has already lost a note inside one."* On a branch three sessions
 * share, a check that writes his instruction queue is a check that can eat an instruction.
 * `glass.mjs` had to learn the same lesson as `--longrun-root=` (`T-112`); this one is born with it. */
const INBOX = arg("inbox") ? resolve(arg("inbox")) : join(ROOT, ".planning", "wyclau", "INBOX.md");
/* ⚑ THE CARRY RECEIPT — what makes this tool part of the chain instead of an optional extra.
 * CEO 162: a session could read the page, stamp `LAST-HARVEST`, and publish, WITHOUT EVER RUNNING
 * THIS — the Door listed them as two independent steps and nothing joined them. So this leaves a
 * receipt naming the exact page file it carried, and `mark_glass_harvest.mjs` refuses to stamp
 * unless `--harvested=` names that same file. Same move CEO 127 made with `--rulings=`: the
 * declaration becomes mandatory, so "a session remembered" stops being the trigger. */
const CARRY = join(ROOT, ".planning", "wyclau", "LAST-CARRY");
const DECISIONS = arg("decisions") ? resolve(arg("decisions")) : join(ROOT, ".claude", "memory", "DECISIONS.md");

if (!HTML) {
  console.log("usage: --html=<path to the HTML the Artifact read saved> [--dry-run]");
  console.log("  read the Glass first (Artifact tool, action \"read\"); it saves the page to a file.");
  process.exit(2);
}
const htmlPath = resolve(HTML);
if (!existsSync(htmlPath)) { console.log(`no such file: ${htmlPath}`); process.exit(2); }

/* The state block is the page's own contract with itself — `glass.mjs` writes it at line ~1146 and
 * the page parses it back at ~1320. Matching the id rather than the position is deliberate: the
 * page carries other JSON and the runtime shell prepends its own scripts. */
const html = readFileSync(htmlPath, "utf8");
const m = html.match(/<script type="application\/json" id="glassState">([\s\S]*?)<\/script>/);
if (!m) {
  console.log("no #glassState block in that file — is it the Glass, and is it the RAW html?");
  process.exit(1);
}
let state;
try { state = JSON.parse(m[1]); }
catch (e) { console.log(`#glassState is not JSON: ${String(e.message).slice(0, 120)}`); process.exit(1); }

const ideas = state.ideas ?? [];
const rulings = state.rulings ?? {};
const comments = state.comments ?? {};

/* His `at` is an ISO string. The INBOX heading format is `## INBOX-<compact UTC>` and the close
 * gate parses it, so the shape is not ours to invent — see INBOX.md's own "Entry format" block. */
/* ⛔ AN ENTRY WITH NO USABLE `at` IS REFUSED, NOT SKIPPED — CEO 162, and this was a silent drop of
 * his words dressed as a success. `stamp(undefined)` returned `""`, so the id became the bare
 * string `INBOX-`, and the de-dupe below is a SUBSTRING test — true of any INBOX that has ever held
 * an entry. Measured against a copy of his real file: **three of his items reported as
 * `already on record, skipped: 3`, a DO NOW pin announced for an entry never written, exit 0, and
 * an instruction to republish** — which then deletes them from the page. That is `T-076`'s fault,
 * verbatim, inside the tool built to end it.
 * **LATENT, NOT LIVE, and said plainly rather than hidden:** `glass.mjs` sets `at` on every idea,
 * comment and ruling the current page creates, so nothing reaches this path today. What was LIVE is
 * the shape — **the tool could not tell "already on record" from "I could not identify this", and
 * spent one word on two opposite outcomes.** */
const stamp = (iso) => String(iso ?? "").replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").slice(0, 16);
const requireStamp = (iso, what) => {
  const s = stamp(iso);
  if (!s) {
    console.log(`REFUSING — ${what} has no usable timestamp, so it cannot be given an id.`);
    console.log("  Without one it cannot be de-duplicated, and it would be dropped in silence.");
    console.log("");
    console.log("!! NOTHING WAS HARVESTED. His words are still on the page — do NOT republish the Glass.");
    process.exit(1);
  }
  return s;
};
const firstLine = (t) => String(t ?? "").trim().split("\n")[0].slice(0, 90).trim() || "(no title)";
const quote = (t) => String(t ?? "").trim().split("\n").map((l) => `> ${l}`).join("\n");

/* Written at BOTH success exits — an empty page is a real harvest and must leave a receipt too,
 * or the commonest case (nothing new) would be the one the chain cannot see. `--dry-run` writes
 * nothing: it did not carry anything, so it must not licence a publish. Scratch destinations
 * (`--inbox=`) also write nothing, so a gate's run can never licence a real publish either. */
const writeCarry = (n) => {
  if (DRY || arg("inbox") || arg("decisions")) return;
  try {
    writeFileSync(CARRY, `${new Date().toISOString()}	carried=${n}	from=${basename(htmlPath)}
`);
  } catch { /* best effort — the counts above are the real report */ }
};

const planned = { ideas: [], comments: [], rulings: [] };

for (const i of ideas) {
  const id = `INBOX-${requireStamp(i.at, "an idea")}`;
  planned.ideas.push({
    id, pinned: i.now === true,
    /* A pinned idea is his DO NOW press. It carries into the entry title so a watch reading the
     * INBOX sees the interrupt without needing the page — the pin's whole point is that it beats
     * the ordering, and an ordering signal that only exists on the page is one a watch cannot obey. */
    block: `## ${id} — ${i.now === true ? "⚑ HE PRESSED DO NOW — " : ""}${firstLine(i.text)}\n`
      + `${quote(i.text)}\n`
      + `solution: none stated\n`
      + `status: OPEN${i.now === true ? " — PINNED by him on the Glass; take this before anything ranked" : ""}\n`,
  });
}

for (const [handle, arr] of Object.entries(comments)) {
  for (const c of arr ?? []) {
    const id = `INBOX-${requireStamp(c.at, `a comment on ${handle}`)}`;
    planned.comments.push({
      id, handle,
      /* ⚠ THE HANDLE MAY NO LONGER OWN A ROW — he comments, the row closes and sweeps to
       * CHART-LOG.md, and the comment now points at nothing. It is still HIS WRITING, so it is
       * carried regardless and the handle is recorded as written. Dropping it silently would be
       * the very fault this tool exists to prevent, with a zero exit code. */
      block: `## ${id} — his comment on \`${handle}\`\n`
        + `${quote(c.text)}\n`
        + `solution: none stated\n`
        + `status: OPEN — left on \`${handle}\` via the Glass's comment box\n`,
    });
  }
}

/* ⛔ THE RECORD SAYS THE WORDS THAT WERE ON THE BUTTON HE PRESSED. `data-choice` is a storage key
 * — `yes`/`no`/`talk` for the defaults, a content-derived `opt-<hash>` for a declared option — and
 * it must never move, because the page redraws his saved answers by comparing against it. **A key
 * is not an answer.** `glass.mjs`'s `saveRuling` stores `chose` (the label he actually pressed)
 * beside it for exactly this, so read that first.
 *
 * ⚠ THIS MAP USED TO BE THE ANSWER AND IT WAS THE THIRD PLACE ENFORCING WORDS HE HAD REVERSED.
 * It read `{ yes: "Approve", no: "Deny", talk: "Let's talk" }`, hard-coded from his 10:22
 * instruction of 2026-09-03 — and his 15:56:28Z ruling replaced those buttons with numbered
 * options three and a half hours later. Two gates were found pinning the old words and corrected;
 * CEO 176 found this one, plus `glass_ruling_button_words_check` case 5 REQUIRING it. So his page
 * would show him *"1 Yes — go ahead"* and his permanent decision record would say *"Approve"* —
 * rule 8's sweep failing in the opposite direction from the one the check was written to catch.
 *
 * AND ON A NUMBERED QUESTION IT WAS WORSE: an unrecognised key printed VERBATIM, so the one
 * durable artifact of his answer was `opt-15wnciu`. The readable label was already in the file,
 * unused. **This is CEO 174's own recurrence check firing: a join built half at a time** — the
 * option-key design was right and was built on the page only.
 *
 * THE FALLBACK IS STILL THE POINT, and it is now a key of last resort rather than the norm: a
 * value with no label prints verbatim rather than being dropped or renamed, because a ruling
 * recorded wrongly is worse than one recorded awkwardly. `note` is a real case — a note typed with
 * no button pressed still saves as a ruling (`glass.mjs`'s blur handler), and it is his answer
 * even though he pressed nothing. */
const NO_BUTTON = { note: "a note, no button pressed" };
/* ⛔ THE FALLBACK MUST ANNOUNCE ITSELF. CEO 178: the fallback to a bare key is defensible — a ruling
   recorded awkwardly beats one recorded wrongly — *"the silence is not"*. Without this, an
   unreadable value (`opt-1a2b3c`, or a bare `yes`) reaches his permanent decision record with
   nothing telling the session it happened, and `glass_ruling_button_words_check` case 5 calls
   exactly that output a build failure. So it is counted here and printed at the end of the run. */
const keyFallbacks = [];
const hisWord = (r, qid) => {
  const chose = String(r?.chose ?? "").trim();
  if (chose) return chose;
  const named = NO_BUTTON[String(r?.choice)];
  if (named) return named;
  const raw = String(r?.choice ?? "");
  keyFallbacks.push(`${qid} -> ${JSON.stringify(raw)}`);
  return raw;
};

for (const [qid, r] of Object.entries(rulings)) {
  const id = `RULING-${requireStamp(r.at, `a ruling on ${qid}`)}-${qid}`;
  const q = String(r.q ?? qid).trim();
  planned.rulings.push({
    id,
    /* DECISIONS.md is newest-at-TOP, under the H1. The charter asks every ruling to record the
     * alternative he did NOT pick; a script cannot know it, so it says so rather than invent one. */
    /* ⚑ THE ALTERNATIVES ARE NOW RECOVERABLE, AND THIS PARAGRAPH USED TO SAY THEY WERE NOT.
       It read *"not recorded — this script sees his answer and not the options it was put beside"*,
       and that was true when it was written. It stopped being true when `saveRuling` began storing
       `options` (every button he was shown) beside `chose`. The charter asks every ruling to record
       the alternative he did not pick; now it can, so it does — and it still says so honestly when
       the page did not carry them, rather than inventing one. */
    block: `## ${q.replace(/\s+/g, " ").slice(0, 110)} — ${r.at}\n\n`
      + `Asked on the Glass: *"${q.replace(/\s+/g, " ")}"* — **Wyatt ruled "${hisWord(r, qid)}"**, ${r.at}.\n\n`
      + (r.note ? `**His note, verbatim:** *"${String(r.note).trim().replace(/\s+/g, " ")}"*\n\n` : "")
      + (Array.isArray(r.options) && r.options.length
        ? `**The alternatives he did not pick**, as his card showed them:\n`
          + r.options.map((o) => {
            const label = String(o).replace(/^[^:]*:\s*/, "").trim();
            return `- ${label}${label === String(r.chose ?? "").trim() ? "  ← **his pick**" : ""}`;
          }).join("\n") + "\n\n"
        : `**The alternative he did not pick:** not recorded — the page did not carry the options\n`
          + `with this ruling. The session that acts on it should fill this in from the question's\n`
          + `own card.\n\n`)
      + `<!-- harvest-id: ${id} -->\n`,
  });
}

const total = planned.ideas.length + planned.comments.length + planned.rulings.length;
if (total === 0) {
  writeCarry(0);
  console.log("nothing on the Glass to harvest — 0 ideas, 0 comments, 0 rulings.");
  console.log("(That is a clean page, not a failure: whoever republished last carried his words across.)");
  process.exit(0);
}

/* ⚠ READ THE DESTINATIONS BEHIND A GUARD. The first version let `readFileSync` throw, which exits
 * non-zero — technically a failure — but hands a session a raw ENOENT stack over `node:fs` internals
 * at the exact moment his unharvested words are still on the page. **A stack trace is not a report.**
 * Rule 3: say what breaks for a player (here, for him) before saying how you know. */
const readOr = (p, what) => {
  try { return readFileSync(p, "utf8"); }
  catch (e) {
    console.log(`cannot read ${what}: ${p}`);
    console.log(`  (${String(e.code ?? e.message).slice(0, 60)})`);
    console.log("");
    console.log("!! NOTHING WAS HARVESTED. His words are still on the page — do NOT republish the Glass.");
    process.exit(1);
  }
};
const inboxBefore = readOr(INBOX, "the INBOX");
const decisionsBefore = readOr(DECISIONS, "DECISIONS.md");

const newInbox = [...planned.ideas, ...planned.comments].filter((e) => !inboxBefore.includes(`## ${e.id}`));
const newRulings = planned.rulings.filter((e) => !decisionsBefore.includes(e.id));
const skipped = total - newInbox.length - newRulings.length;

if (DRY) {
  console.log(`would carry ${newInbox.length + newRulings.length} of ${total} (${skipped} already on record):`);
  for (const e of [...newInbox, ...newRulings]) console.log(`  + ${e.id}`);
  process.exit(0);
}

/* INBOX entries append at the END: the file is chronological and the close gate reads its own
 * headings, not positions. DECISIONS entries go at the TOP, under the H1, because that file is
 * newest-first — and a `tail` on it has already misled one session tonight. */
if (newInbox.length) {
  writeFileSync(INBOX, `${inboxBefore.replace(/\s*$/, "")}\n\n${newInbox.map((e) => e.block).join("\n")}`);
}
if (newRulings.length) {
  const lines = decisionsBefore.split("\n");
  const h1 = lines.findIndex((l) => /^# /.test(l));
  const at = h1 === -1 ? 0 : h1 + 1;
  writeFileSync(DECISIONS, [...lines.slice(0, at), "", ...newRulings.map((e) => e.block), ...lines.slice(at)].join("\n"));
}

/* ⚑ COUNTED FROM THE FILE, NOT FROM THE LOOP ABOVE — see the header. If a write silently no-ops,
 * these numbers say so instead of confirming an intention. */
const inboxAfter = readFileSync(INBOX, "utf8");
const decisionsAfter = readFileSync(DECISIONS, "utf8");
const landedInbox = newInbox.filter((e) => inboxAfter.includes(`## ${e.id}`)).length;
const landedRulings = newRulings.filter((e) => decisionsAfter.includes(e.id)).length;

console.log(`ideas + comments -> INBOX.md:      ${landedInbox} of ${newInbox.length} new (verified in the file)`);
console.log(`rulings -> DECISIONS.md:           ${landedRulings} of ${newRulings.length} new (verified in the file)`);
/* ⚑ "SKIPPED" NOW MEANS ONE THING ONLY. It used to also cover an entry the tool could not
 * identify — the opposite outcome, wearing the word reserved for success (CEO 162). Anything
 * unidentifiable now REFUSES above, so everything counted here really is already on record. */
if (skipped) console.log(`already on record (same timestamp), skipped: ${skipped}`);
const pins = planned.ideas.filter((e) => e.pinned).length;
if (pins) console.log(`⚑ HE PRESSED DO NOW on ${pins} — that entry says so, and it beats the ranking.`);

if (landedInbox !== newInbox.length || landedRulings !== newRulings.length) {
  console.log("");
  console.log("!! SOMETHING DID NOT LAND. His words are still on the page — do NOT republish the Glass.");
  process.exit(1);
}
console.log("");
/* ⛔ SAY WHEN A RULING WENT IN AS A KEY. See `hisWord` above: the fallback is deliberate, the
   silence was the fault (CEO 178). This is the one output the button-words gate treats as a build
   failure, so a session must not be able to produce it and not know. */
if (keyFallbacks.length) {
  console.log(`!! ${keyFallbacks.length} ruling(s) went into DECISIONS.md as a STORAGE KEY, not as words he can read:`);
  for (const f of keyFallbacks) console.log(`     ${f}`);
  console.log("   The page stores the label he pressed as `chose`; these carried none, so the record now");
  console.log("   holds a value that means nothing once the question card is gone. Open those entries and");
  console.log("   write in what he actually chose, from the question's own card, before this is relied on.");
  console.log("");
}
writeCarry(landedInbox + landedRulings);
console.log("Now commit these files, THEN republish the Glass. Republishing first deletes his words.");
process.exit(0);
