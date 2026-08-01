#!/usr/bin/env node
// scripts/narration_audit_check.js
//
// NARR-01: the health gate for art-review/narration-audit.html — the tool Wyatt uses to review
// every player-facing string in the game. Until this file existed, NOTHING checked that tool. It
// was checked only by opening it in a browser, and it had stopped working without anyone noticing.
//
// It is a STATIC gate. It reads art-review/narration-audit.html as text and
// art-review/narration-inventory.json as data. No DOM, no browser, no page evaluation — so the
// tool's health becomes answerable from `npm test`, which is the single reason the last two drifts
// went undetected.
//
// Convention (matches ui_contract_check.js / determinism_baseline.js / narration_test.js): no
// assertion library, plain console.log, EVERY assertion runs before exit so one run reports every
// problem, failures named with file and key, process.exit(failures?1:0), and a `--drill` mode that
// red-proofs each assertion against a synthetic violation plus a negative control.
//
// ============================================================================
// ACCEPTANCE BASELINE — the measured state of the page at ab98e04, when this gate was written
// ============================================================================
// This gate was written RED, deliberately, as the acceptance test for the repair that follows it.
// A future reader must be able to tell a REPAIRED gate from a WEAKENED one, so the numbers it
// produced on the day it was written are recorded here:
//
//   assertion 1 (resolvability) ... 91 flow-chart lookups: 11 resolve, 55 FATAL, 25 SILENT.
//                                   First FATAL in render order: miscMpErrorCard(
//                                   "src/orchestrator.js:945") — the first entry of the first node
//                                   group. requireMiscEntry() throws on it, the exception escapes
//                                   the whole render, and the page shows its loading placeholder
//                                   and nothing else. That is the entire bug: the tool was not
//                                   fragile, it was dead.
//                                   (miscLobbyCard("src/ui/lobby.js:115"), the NEXT lookup in the
//                                   same node group, is FATAL too — it is the one the planning pass
//                                   named, and it is one line later in render order.)
//   assertion 2 (orphans) ......... 55 orphaned per-site table entries out of 68 site-shaped keys
//                                   across 15 tables — 21 of them in ADHOC_RENDERERS alone.
//   assertion 3 (placement) ....... 74 of 83 live sites unplaced (21 ad-hoc, the rest prompt/misc),
//                                   because the lookups that would place them do not resolve.
//   assertion 4 (affordances) ..... all 14 PASS — nothing had been dropped yet.
//   assertion 5 (line keying) ..... 91 DISTINCT / 147 OCCURRENCES of "<path>.js:<line>" literals.
//                                   80 of the 91 no longer match any live extracted site.
//
// After the repair, assertions 1/2/3/5 must all reach zero and assertion 4 must stay at 14 PASS.
//
// ============================================================================
// SECOND ACCEPTANCE BASELINE — assertion 10, measured at 2cbe551 (2026-07-30)
// ============================================================================
// Assertions 1–9 all went green, and the page was still broken. Wyatt opened it in Chrome and found
// 61 cards where there should be 212, with the page's own console reporting 128 self-check failures,
// while this gate said 22/22 PASS. Assertion 10 (below) is the answer to that, and it is likewise
// written RED. Its numbers on the day it was written, reproduced headlessly to the digit:
//
//   cards rendered ............... 61 (61 distinct) across 19 moments  [Chrome: 61]
//   builder-produced texts ....... 212 (art-review/narration-core.js)
//   unrendered ................... 165
//   collapsed moments ............ 13 of 19, every one "fileLine is not defined"
//   junk card ids ................ 1 (`prompt:undefined`)
//   page's own D-21 self-check ... 128 failure(s)                      [Chrome: 128]
//
// After the repair every one of those must read 0 except "cards rendered", which must equal the
// builder-produced count.
//
// ============================================================================
// NOT WIRED INTO `npm test` YET — wiring point is the page re-key (Task 4)
// ============================================================================
// Assertions 1, 2, 3 and 5 are red against ab98e04 for real reasons that the render-core extraction
// and the page re-key fix. Wiring this gate in while it is red would make every intervening commit
// red for something that commit did not cause — the exact trap extract_narration_lines.js's own
// header warns about, and the reason that extractor sat outside `npm test` while 15-06 was in
// flight. It gets added to the `npm test` chain (as gate 16, immediately after the extractor, since
// it consumes the inventory the extractor writes) in the same commit that turns it green.

import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { renderAuditPageHeadlessIsolated } from "./lib/audit_page_headless.mjs";

// The commit whose inventory Wyatt's review page actually consumed. 136 of his 141 line-keyed ids
// resolve against it; the other 5 are the page-added exceptions pinned in assertion 8.
const EXPORT_ERA_COMMIT = "ddefa8f";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PAGE_REL = "art-review/narration-audit.html";
const INV_REL = "art-review/narration-inventory.json";
const BASELINE_REL = "art-review/narration-table-baseline.json";

/* ================= result plumbing ================= */

// A check produces { label, pass, lines } and NEVER prints directly, so --drill can run the real
// check function against a synthetic tree and inspect its verdict instead of scraping stdout.
function mk(label) { return { label, pass: true, lines: [] }; }
function fail(res, msg) { res.pass = false; res.lines.push("FAIL: " + msg); }
function note(res, msg) { res.lines.push("      " + msg); }

/* ================= shared parsing helpers ================= */

// Lines whose first non-whitespace characters are "//" are excluded from every scan below EXCEPT
// the affordance census, which deliberately does not strip comments (a commented-out affordance is
// a removed affordance, and must still fail).
function stripCommentLines(text) {
  return text.split("\n").map((l) => (/^\s*\/\//.test(l) ? "" : l)).join("\n");
}

// Balanced capture of a `const NAME = { ... }` / `const NAME = new Set([ ... ])` declaration body,
// string- and template-aware so a brace inside a template literal never closes the block early.
function declBody(text, name) {
  const re = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(new\\s+Set\\s*\\(\\s*)?([\\[{])`);
  const m = re.exec(text);
  if (!m) return null;
  const openIdx = m.index + m[0].length - 1;
  const open = m[2], close = open === "[" ? "]" : "}";
  let depth = 0, inString = null, inTemplate = false, tDepth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i], prev = text[i - 1];
    if (inString) { if (c === inString && prev !== "\\") inString = null; continue; }
    if (inTemplate) {
      if (c === "`" && prev !== "\\" && tDepth === 0) inTemplate = false;
      else if (c === "{" && prev === "$") tDepth++;
      else if (c === "}" && tDepth > 0) tDepth--;
      continue;
    }
    if (c === "'" || c === '"') { inString = c; continue; }
    if (c === "`") { inTemplate = true; continue; }
    if (c === "[" || c === "{") { depth++; continue; }
    if (c === "]" || c === "}") { depth--; if (depth === 0) return text.slice(openIdx, i + 1); continue; }
  }
  return null;
}

// Object-literal keys only ("key": ...), never a string that happens to sit in a value position.
function objectKeys(body) {
  return [...body.matchAll(/"([^"\n]+)"\s*:/g)].map((m) => m[1]);
}
// Set members — every string literal in the block (a Set literal has no key/value distinction).
function setMembers(body) {
  return [...body.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]);
}

// Reduce any card-id-shaped string to the bare "<file>:<line>" site it points at: drop a leading
// category prefix (adhoc:/prompt:/button:/sub:/misc:<cat>:) and any trailing ~suffix.
function toSiteKey(raw) {
  let s = raw;
  s = s.replace(/^misc:[A-Za-z0-9]+:/, "");
  s = s.replace(/^(adhoc|prompt|button|sub):/, "");
  s = s.replace(/~[^~]*$/, "");
  return s;
}
// A per-site table entry is now STABLE-ID shaped (`adhoc.turn.banner`, `misc.mperror.roomfull`,
// optionally with a `~branch` suffix), and it may still be a legacy `file:line` key — which is the
// point: a leftover line-keyed entry is exactly the orphan this assertion must catch, so both shapes
// count as "a key that claims to name a site".
function isSiteShaped(raw) {
  return /[A-Za-z0-9_/.]+\.js:\d+/.test(raw) || /^(?:adhoc|prompt|misc|sub)\.[a-z0-9][a-z0-9.-]*(?:~[A-Za-z0-9]+)?$/.test(raw);
}

/* ================= the flow-chart lookup table ================= */

// Every per-category card lookup the page's flow-chart node table performs, with the shape of the
// key it takes and whether the helper THROWS on a miss (which blanks the whole page) or returns an
// empty list (which silently omits a card — how D-30's prompts went absent in the first place).
const LOOKUPS = {
  adhocCards:            { kind: "adhoc",  throws: true },
  promptCards:           { kind: "prompt", throws: false },
  miscMpErrorCard:       { kind: "misc",   category: "mpError",      throws: true },
  miscLobbyCard:         { kind: "misc",   category: "lobby",        throws: true },
  miscIntroBarrierCards: { kind: "misc",   category: "introBarrier", throws: true },
  miscDraftWaitCard:     { kind: "misc",   category: "draftWait",    throws: true },
  miscParamPromptCard:   { kind: "misc",   category: "paramPrompt",  throws: true },
  miscBattleLineCard:    { kind: "misc",   category: "battleLine",   throws: true },
  miscTimerCards:        { kind: "misc",   category: "timer",        throws: true },
  miscBoardCards:        { kind: "misc",   category: "board",        throws: true },
};

function nodeGroupsBlock(page) {
  const body = declBody(page, "NODE_GROUPS");
  return body == null ? "" : body;
}

// In render order: the page builds each node group's cards in NODE_GROUPS source order, so source
// index IS render order and "the first failing lookup" is a meaningful, reportable fact.
function collectLookups(page) {
  const blk = stripCommentLines(nodeGroupsBlock(page));
  const out = [];
  const names = Object.keys(LOOKUPS).join("|");
  const direct = new RegExp(`\\b(${names})\\s*\\(\\s*"([^"]+)"\\s*\\)`, "g");
  let m;
  while ((m = direct.exec(blk))) out.push({ helper: m[1], key: m[2], at: m.index });
  // the array-of-keys form: [ "a", "b", ... ].flatMap(miscMpErrorCard)
  const flat = new RegExp(`\\[([^\\]]*)\\]\\s*\\n?\\s*\\.flatMap\\(\\s*(${names})\\s*\\)`, "g");
  while ((m = flat.exec(blk))) {
    const keys = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    keys.forEach((k, i) => out.push({ helper: m[2], key: k, at: m.index + i }));
  }
  // bulk placements with no key of their own
  const bulk = [];
  for (const name of ["awardCards", "dockFlavorCards"]) {
    const re = new RegExp(`\\b${name}\\s*\\(\\s*\\)`, "g");
    while ((m = re.exec(blk))) bulk.push({ helper: name, at: m.index });
  }
  out.sort((a, b) => a.at - b.at);
  return { lookups: out, bulk };
}

// The key space is each site's own DECLARED id (`// @copy <id>` in the source), not `file:line`.
// That is the whole repair: a lookup can now only break if somebody deletes the marker, which the
// extractor fails on by name — rather than breaking silently every time a line moves.
function liveKeySets(inv) {
  return {
    adhoc: new Set((inv.adhoc || []).map((e) => e.id)),
    prompt: new Set((inv.prompts || []).map((e) => e.id)),
    misc: new Set((inv.misc || []).map((e) => `${e.category}:${e.id}`)),
  };
}
function resolves(spec, key, live) {
  if (spec.kind === "adhoc") return live.adhoc.has(key);
  if (spec.kind === "prompt") return live.prompt.has(key);
  return live.misc.has(`${spec.category}:${key}`);
}

/* ================= assertion 1: resolvability ================= */

function checkResolvability(page, inv) {
  const res = mk("assertion 1 — resolvability: every flow-chart card lookup resolves against the live inventory");
  const { lookups } = collectLookups(page);
  const live = liveKeySets(inv);
  if (lookups.length === 0) fail(res, "no card lookups found in NODE_GROUPS at all — the flow-chart node table is missing or unparseable");
  let fatal = 0, silent = 0, ok = 0, firstFatal = null;
  for (const { helper, key } of lookups) {
    const spec = LOOKUPS[helper];
    if (resolves(spec, key, live)) { ok++; continue; }
    if (spec.throws) {
      fatal++;
      if (!firstFatal) firstFatal = `${helper}("${key}")`;
      fail(res, `FATAL unresolvable lookup ${helper}("${key}") — ${helper}() throws on a miss, so this one exception aborts the ENTIRE page render`);
    } else {
      silent++;
      fail(res, `SILENT unresolvable lookup ${helper}("${key}") — ${helper}() returns an empty list on a miss, so this card vanishes with no error at all`);
    }
  }
  note(res, `lookups: ${lookups.length} total — ${ok} resolve, ${fatal} FATAL, ${silent} SILENT`);
  if (firstFatal) note(res, `first FATAL in render order: ${firstFatal} — everything after it never renders`);
  return res;
}

/* ================= assertion 2: orphan detection ================= */

// The direction applyMeta() structurally cannot see. It fails only on a MISSING key, so a stale key
// silently attaches the wrong metadata to a shifted site while the orphan sits unnoticed.
// ADHOC_RENDERERS, PASS_THROUGH, PROMPT_RENDERERS, PROMPT_SUB_RENDERERS and LEGACY_CARD_ID_PIN are
// deliberately absent from this list because they no longer exist: the hand-transcribed text layer is
// gone (the render core evaluates the real expression), the pass-through sets moved into the core
// keyed by stable id, and the legacy id pin was only ever needed because line numbers drifted. A
// table that is absent is reported as skipped rather than silently passing.
const PER_SITE_TABLES = [
  { name: "ADHOC_EXTRA_TAGS", how: "objectKeys" },
  { name: "ADHOC_LABEL_OVERRIDE", how: "objectKeys" },
  { name: "GUARDED_TEXT", how: "objectKeys" },
  { name: "PARAM_PROMPT_DECL", how: "objectKeys" },
  { name: "PARAM_PROMPT_DEAD_CALLS", how: "setMembers" },
  { name: "SIGN_RULE_BUTTON_OVERRIDE", how: "objectKeys" },
  { name: "SIGN_RULE_EXEMPT_IDS", how: "setMembers" },
  { name: "DRAFT_WAIT_RENDERERS", how: "objectKeys" },
];

function checkOrphans(page, inv) {
  const res = mk("assertion 2 — orphans: every per-site table entry corresponds to a live inventory site");
  const live = liveKeySets(inv);
  const allSites = new Set();
  for (const k of live.adhoc) allSites.add(k);
  for (const k of live.prompt) allSites.add(k);
  for (const k of live.misc) allSites.add(k.replace(/^[A-Za-z0-9]+:/, ""));
  // a button's card id names its prompt plus an option slot; a sub names its prompt plus a branch
  for (const e of inv.prompts || []) {
    for (const l of e.labels || []) allSites.add(`${e.id}~${l.slot}`);
    if (e.rawSub) allSites.add(e.id);
  }
  let checked = 0, orphans = 0;
  for (const { name, how } of PER_SITE_TABLES) {
    const body = declBody(page, name);
    if (body == null) { note(res, `table ${name} not present (skipped — nothing to orphan)`); continue; }
    const raw = how === "objectKeys" ? objectKeys(stripCommentLines(body)) : setMembers(stripCommentLines(body));
    for (const r of raw) {
      if (!isSiteShaped(r)) continue;
      checked++;
      const site = toSiteKey(r);
      if (!allSites.has(site)) {
        orphans++;
        fail(res, `orphan entry ${name}["${r}"] — no live inventory site at ${site}; it can never fire, and its stale key can attach the wrong metadata to a shifted site`);
      }
    }
  }
  note(res, `per-site table entries checked: ${checked}; orphan entries: ${orphans}`);
  return res;
}

/* ================= assertion 3: every live site placed exactly once ================= */

// A card placed in TWO stages is not automatically a bug — three of the page's helpers genuinely
// fire at two different moments in the game, and Wyatt reads them in both places on purpose. Each
// such placement is allowlisted BY NAME with its reason, and a stale allowlist entry (one whose
// card is no longer multiply placed) FAILS — so the allowlist can never rot into blanket cover.
const MULTI_PLACEMENT_ALLOWED = {
  "prompt:prompt.flip.fallback": "humanFlip()'s own prompt — the shared coin-flip helper fires at the storm-anchor dodge AND at docking; the page shows it in both stages deliberately (D-33 comments at both sites).",
  "adhoc:adhoc.flip.announce": "the coin-flip announcement — the same generic line the storm dodge and the docking flip both emit (AD_HOC_META: \"generic — used at docking/anchor moments\").",
};

// `allowed` is injectable so --drill can run this exact function against a synthetic fixture with
// its own (usually empty) allowlist. The REAL allowlist is still the module constant above and is
// still the default — the injection point exists for fixture isolation, not to relax the check, and
// the drill has a dedicated case proving the stale-entry branch fires.
function checkPlacement(page, inv, allowed = MULTI_PLACEMENT_ALLOWED) {
  const res = mk("assertion 3 — placement: every live inventory site is reachable from exactly one flow-chart node");
  const { lookups, bulk } = collectLookups(page);
  const placed = new Map();
  const bump = (id) => placed.set(id, (placed.get(id) || 0) + 1);
  for (const { helper, key } of lookups) {
    const spec = LOOKUPS[helper];
    if (spec.kind === "adhoc") bump(`adhoc:${key}`);
    else if (spec.kind === "prompt") bump(`prompt:${key}`);
    else bump(`misc:${spec.category}:${key}`);
  }
  const bulkCount = (name) => bulk.filter((b) => b.helper === name).length;

  const want = [];
  for (const e of inv.adhoc || []) want.push(`adhoc:${e.id}`);
  for (const e of inv.prompts || []) want.push(`prompt:${e.id}`);
  for (const e of inv.misc || []) want.push(`misc:${e.category}:${e.id}`);

  let zero = 0, multi = 0;
  for (const id of want) {
    const n = placed.get(id) || 0;
    if (n === 0) { zero++; fail(res, `unplaced live site ${id} — it is extracted but no flow-chart node renders it, so Wyatt cannot see the card at all`); continue; }
    if (n > 1 && !allowed[id]) { multi++; fail(res, `${id} is placed ${n} times with no reasoned allowlist entry — it would render as a duplicate card`); }
  }
  // stale-allowlist check: an allowlisted id that is no longer multiply placed is unnecessary cover
  for (const [id, reason] of Object.entries(allowed)) {
    if (!reason || !reason.trim()) fail(res, `MULTI_PLACEMENT_ALLOWED["${id}"] has no reason — every exception must state why`);
    const n = placed.get(id) || 0;
    if (n <= 1) fail(res, `STALE MULTI_PLACEMENT_ALLOWED["${id}"] — that card is placed ${n} time(s) now, so the exception is unnecessary cover and must be deleted`);
  }
  // the two bulk placements must each appear exactly once
  for (const [name, count, what] of [["awardCards", bulkCount("awardCards"), `${(inv.awards || []).length} award card(s)`], ["dockFlavorCards", bulkCount("dockFlavorCards"), "the dock-flavour cards"]]) {
    if (count !== 1) fail(res, `${name}() appears ${count} time(s) in NODE_GROUPS — expected exactly 1, it places ${what}`);
  }
  note(res, `live sites: ${want.length}; unplaced: ${zero}; unreasoned duplicates: ${multi}; reasoned shared placements: ${Object.keys(allowed).length}`);
  return res;
}

/* ================= assertion 4: the affordance census ================= */

// Every DOM/CSS/function hook each affordance Wyatt actually works with depends on, asserted present
// on EVERY run, so a refactor that quietly drops one fails the build instead of surprising him.
// Named in his own words plus the decision id, because the failure message is the only explanation
// anyone reading a red build will get.
//
// Comment-only lines are stripped BEFORE the presence scan, because a hook that survives only
// inside a comment is a removed affordance and must still fail. (The plan this gate implements
// described the mechanism as "no comment stripping" while stating that exact intent — the two are
// opposites, since an unstripped scan FINDS a commented-out hook and passes. The intent is what is
// implemented: verified at ab98e04 that all 14 affordances still PASS with comments stripped, so
// this is strictly stronger than an unstripped scan and costs nothing.)
const AFFORDANCES = [
  { what: "Reviewed checkbox and the progress counter", dec: "D-27", hooks: ["reviewedBox", "isReviewed", "reviewProgress", "reviewed:"] },
  { what: "The derived-intent line, recomputed live as he types", dec: "D-26", hooks: ["derivedIntent", "renderDerivedLine", "computeIntent"] },
  { what: "Typing in the notes box auto-selects Rewrite, without clobbering a deliberate Cut or Merge", dec: "D-42", hooks: ["applyAutoRewriteRule"] },
  { what: "The second copy box, for the addressed (\"you\") version", dec: "D-47", hooks: ["addressedNotesArea", "addressedDerivedIntent"] },
  { what: "The third copy box, on two-party cards only, labelled with each role", dec: "D-54", hooks: ["addressedNotesArea2", "roleLabel", "checkAddressedFieldPresent"] },
  { what: "The separate Question box, which never becomes shipped copy", dec: "D-26", hooks: ["questionArea"] },
  { what: "A single canonical merge target, never a cycle", dec: "D-36/D-44", hooks: ["mergeTargetSelect", "mergeTargetCustom", "checkMergeCycles"] },
  { what: "The shared-wording notice — one string behind several doors, vs separate strings that happen to match", dec: "D-28", hooks: ["computeSharedWordingGroups", "sharedWordingNote"] },
  { what: "The dead / guarded / config-dead badges", dec: "D-33/34/40/43", hooks: ["deadCopyNote", "guardedNote", "checkDeadCopyMarking"] },
  { what: "Fabricated events that still satisfy the real emit sites' invariants", dec: "D-51", hooks: ["assertBattleEventInvariants", "FABRICATED_EVENT_VIOLATIONS"] },
  { what: "Live pirate voice and sign normalisation, so Keep ships exactly what he sees", dec: "D-25/29/38", hooks: ["finalize", "applySignRule", "checkSignRule"] },
  { what: "The flow chart's really-drawn SVG edges, surviving a window resize", dec: "D-22", hooks: ["drawEdges", "edgeSvg", "resize"] },
  { what: "His work saved in the browser between sittings", dec: "—", hooks: ["STORAGE_KEY", "loadSaved", "saveAll"] },
  { what: "The Export button and its per-row keys", dec: "—", hooks: ["exportBtn", "addressedNotes", "mergeInto"] },
];

function checkAffordances(page) {
  const live = stripCommentLines(page);
  const out = [];
  for (const a of AFFORDANCES) {
    const res = mk(`affordance (${a.dec}) — ${a.what}`);
    for (const h of a.hooks) {
      if (!live.includes(h)) {
        const commentedOut = page.includes(h);
        fail(res, `affordance hook "${h}" is ${commentedOut ? "present ONLY inside a comment in" : "absent from"} ${PAGE_REL} — ${a.what} (${a.dec}) has been dropped`);
      }
    }
    out.push(res);
  }
  return out;
}

/* ================= assertion 5: no line-number keying ================= */

function checkLineKeying(page) {
  const res = mk("assertion 5 — identity: no card id in the page is keyed by a source line number");
  const hits = [];
  page.split("\n").forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    for (const m of line.matchAll(/"(src\/[A-Za-z0-9_/.]+\.js):(\d+)"/g)) hits.push({ line: i + 1, lit: m[0] });
  });
  const distinct = [...new Set(hits.map((h) => h.lit))];
  // DISTINCT and OCCURRENCE are two different numbers (91 and 147 at ab98e04) and conflating them
  // is how a gate fails its own verify. Both are reported, and the assertion fails while either is
  // above zero.
  note(res, `line-number-keyed literals — distinct: ${distinct.length}, occurrences: ${hits.length}`);
  if (hits.length) {
    fail(res, `${distinct.length} distinct / ${hits.length} occurrence(s) of line-number-keyed card ids remain — every one of them drifts the moment source moves`);
    distinct.slice(0, 10).forEach((lit) => note(res, `offender: ${lit}`));
    if (distinct.length > 10) note(res, `… and ${distinct.length - 10} more distinct offender(s)`);
  }
  return res;
}

/* ================= assertion 6: card text is real, never a placeholder =================
 *
 * The page used to hand-write each ad-hoc site's current wording in its own per-site renderer
 * table. Those literals were true when typed and had gone 20-of-26 orphaned and pre-15-06 in
 * wording, so cards would have shown copy the game no longer ships. art-review/narration-core.js
 * deletes that layer and renders every card from the live extracted expression instead. This
 * assertion is what keeps it deleted: if a site's expression is resolvable, its card must show
 * REAL TEXT — never a placeholder, never an evaluation-failure fallback.
 *
 * The curated-renderer cap is the second half. A curated renderer is a licence to hand-write, so
 * the licence is counted and capped rather than left open-ended.
 */
const PLACEHOLDER_PATTERNS = [
  /no renderer defined/i,
  /could not evaluate/i,
  /\(TODO\)/i,
  /placeholder/i,
];

export function checkCardText(cards, core) {
  const res = mk("assertion 6 — fidelity: every card's text is rendered from live source, never a placeholder");
  const errored = cards.filter((c) => c.error);
  const silent = cards.filter((c) => c.silent && !c.error);
  const passThrough = cards.filter((c) => c.passThrough && !c.error);
  // A card that could not be rendered at all degrades to a NAMED error card (T-QT-04) rather than
  // blanking the page — but it is still a failure of this gate, because in a healthy tree there is
  // nothing to degrade from.
  for (const c of errored) fail(res, `card ${c.id} failed to render — ${c.error}`);
  // A resolvable site whose text is a placeholder is the exact rot this refactor removed.
  for (const c of cards) {
    if (c.error || c.silent || c.passThrough) continue;
    if (c.neutral == null) {
      fail(res, `card ${c.id} rendered no text, but its site is neither silent nor a pass-through — raw: ${String(c.rawNeutral).slice(0, 90)}`);
      continue;
    }
    const hit = PLACEHOLDER_PATTERNS.find((re) => re.test(c.neutral));
    if (hit) fail(res, `card ${c.id} shows placeholder/fallback text matching ${hit} — it must render the real expression`);
  }
  const curated = core && core.CURATED_RENDERERS ? Object.keys(core.CURATED_RENDERERS).length : 0;
  const cap = (core && core.CURATED_RENDERER_CAP) || 0;
  if (curated > cap) fail(res, `${curated} curated renderer(s) exceeds the cap of ${cap} — each one is a hand-written licence to go stale`);
  note(res, `cards rendered: ${cards.length} (${silent.length} deliberately silent, ${passThrough.length} table pass-through, ${errored.length} error)`);
  note(res, `curated renderers: ${curated} of a cap of ${cap}`);
  // D-51: a fabricated event that violates its real emit site's invariants renders the RIGHT line
  // with IMPOSSIBLE VALUES — the third defect class, and the one that put the literal word "null"
  // on a card once.
  const viol = (core && core.FABRICATED_EVENT_VIOLATIONS) || [];
  if (viol.length) for (const v of viol) fail(res, `fabricated-event invariant (D-51): ${v}`);
  else note(res, "fabricated-event invariants (D-51): all satisfied");
  return res;
}

/* ================= assertion 7: the table path still reproduces its committed pin =================
 *
 * art-review/narration-table-baseline.json was captured BEFORE the render-core extraction, by
 * importing src/ui/util.js's real describeFor()/narrationVariants() builders directly. The table
 * surface is the one that was never broken; this keeps it that way. A committed fixture rather than
 * a temp snapshot, because a temp snapshot becomes unreproducible the moment the refactor lands.
 */
export function checkTableBaseline(core, baselineText) {
  const res = mk("assertion 7 — the table path reproduces its committed baseline byte-for-byte");
  if (!baselineText) { fail(res, "art-review/narration-table-baseline.json is missing — the regression pin is gone"); return res; }
  let want;
  try { want = JSON.parse(baselineText); } catch (e) { fail(res, `baseline is not valid JSON: ${e.message}`); return res; }
  const got = core.tableCards();
  const wantIds = Object.keys(want.cards || {});
  const gotIds = Object.keys(got);
  if (wantIds.length !== gotIds.length) fail(res, `baseline pins ${wantIds.length} table cards, the core renders ${gotIds.length}`);
  for (const id of wantIds) {
    const a = want.cards[id], b = got[id];
    if (!b) { fail(res, `table card ${id} is pinned in the baseline but the core no longer renders it`); continue; }
    if (a.neutral !== b.neutral) fail(res, `table card ${id} drifted from the baseline\n        pinned: ${JSON.stringify(a.neutral)}\n        now:    ${JSON.stringify(b.neutral)}`);
    if (JSON.stringify(a.variants) !== JSON.stringify(b.variants)) fail(res, `table card ${id}'s addressed variants drifted from the baseline`);
  }
  note(res, `table baseline: ${wantIds.length} card(s) pinned, ${gotIds.length} rendered`);
  return res;
}

/* ================= assertion 8: the 209-row migration ==============================
 *
 * Wyatt spent a day producing 209 reviewed dispositions and 130 of them pointed at cards that no
 * longer existed under those names. This is the assertion that says none of them was lost.
 *
 * Every number below is an EQUALITY on purpose. A window of "209 minus at most 6" would let six of
 * his rows vanish with the gate still green, which is the precise slack this assertion exists to
 * remove — a 6-row tolerance was drafted once and taken out again for exactly that reason.
 */
// Not a count and not a reason string — the exact list. "Roughly six" is not a constraint: a
// migration that retired forty rows with the reason "site gone" would satisfy every count-and-reason
// check while silently discarding his work.
const EXPECTED_RETIRED = [
  "adhoc:src/ui/flow.js:296",
  "adhoc:src/ui/flow.js:571",
  "adhoc:src/ui/flow.js:645",
  "misc:battleLine:src/orchestrator.js:483",
  "misc:battleLine:src/orchestrator.js:487",
  "misc:battleLine:src/ui/flow.js:967",
];
// Five ids the PAGE synthesised, so they have no export-era inventory entry to resolve against.
const PAGE_ADDED = new Set([
  "adhoc:src/ui/util.js:874", "adhoc:src/ui/util.js:878",
  "sub:src/ui/flow.js:563~afford", "sub:src/ui/flow.js:563~poor", "sub:src/ui/flow.js:563~none",
]);
// A SECOND, deliberately separate way a row can leave the live set — and it is not retirement.
//
// Retirement above means "two of his rows were twins and he merged them", which is why it demands
// his own `merge` tag and refuses a `keep` or `rewrite`. That rule is correct and is NOT relaxed.
//
// This list means something different: **the game mechanic the row reviewed no longer exists**, by
// Wyatt's own instruction. His words, 2026-07-30: *"when the shot clock runs out, you just lose
// your turn, but you don't lose a crate. Let's get rid of that crate losing business altogether."*
// The row is a genuine `rewrite` of his, and it is not being discarded as redundant — the sentence
// it improved describes a confiscation the game no longer performs.
//
// The same anti-slack discipline applies as above: an exact LIST, never a count and never a reason
// string, because "roughly one row, removed for a good reason" would let a later pass quietly drop
// forty. And one extra condition retirement does not have — each id here must name a card that is
// genuinely NOT live. That stops this list from ever becoming a way to hide a card that still
// renders to players from his review.
const EXPECTED_MECHANIC_REMOVED = [
  "table:shotclockskip~crate",
];
const EXPECTED_ROWS = 209;
const EXPECTED_DRIFT = 104;

/** D-26's rules, never the raw tag: cut/merge win outright, empty notes mean keep. */
function derivedIntent(r) {
  if (r.tag === "cut" || r.tag === "merge") return r.tag;
  return (r.notes || "").trim() ? "rewrite" : "keep";
}

export function checkMigration({ rows, aliases, baseline, exportEraInventory, liveCardIds }) {
  const res = mk("assertion 8 — migration: all 209 of Wyatt's reviewed dispositions are accounted for");
  if (!rows || !aliases) { fail(res, "the disposition export or the alias file is missing — the migration cannot be verified at all"); return res; }
  const list = Array.isArray(aliases) ? aliases : aliases.entries;

  // every frozen id appears exactly once
  const byOld = {};
  for (const e of list) {
    if (byOld[e.old]) fail(res, `duplicate alias entry for ${e.old} — one frozen id cannot map two ways`);
    byOld[e.old] = e;
  }
  const missing = rows.filter((r) => !byOld[r.id]).map((r) => r.id);
  if (missing.length) fail(res, `${missing.length} disposition row(s) have no alias entry, first: ${missing.slice(0, 5).join(", ")}`);
  const extra = list.filter((e) => !rows.some((r) => r.id === e.old)).map((e) => e.old);
  if (extra.length) fail(res, `alias entries for rows that are not in his export: ${extra.slice(0, 5).join(", ")}`);

  // no live card is the target of two aliases
  const targets = list.filter((e) => e.new).map((e) => e.new);
  const dupT = [...new Set(targets.filter((x, i) => targets.indexOf(x) !== i))];
  if (dupT.length) fail(res, `two aliases point at the same card: ${dupT.join(", ")} — whichever renders second would inherit the other's review mark`);

  // the retirement set is the pinned LIST, and every retirement carries his own `merge` tag
  const retired = list.filter((e) => e.retired).map((e) => e.old).sort();
  const wantRetired = [...EXPECTED_RETIRED].sort();
  if (JSON.stringify(retired) !== JSON.stringify(wantRetired)) {
    fail(res, `the retirement set drifted from its pinned list\n        expected: ${wantRetired.join("\n                  ")}\n        actual:   ${retired.join("\n                  ")}`);
  }
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const id of retired) {
    const tag = byId[id] && byId[id].tag;
    if (tag !== "merge") fail(res, `refusing to retire ${id} — his own tag is "${tag}", not merge. A keep or rewrite row can never be retired.`);
  }

  // rows whose MECHANIC was removed — the pinned list, and each must name a genuinely dead card
  const mechGone = list.filter((e) => e.mechanicRemoved).map((e) => e.old).sort();
  const wantMechGone = [...EXPECTED_MECHANIC_REMOVED].sort();
  if (JSON.stringify(mechGone) !== JSON.stringify(wantMechGone)) {
    fail(res, `the mechanic-removed set drifted from its pinned list\n        expected: ${wantMechGone.join("\n                  ")}\n        actual:   ${mechGone.join("\n                  ")}`);
  }
  for (const e of list.filter((x) => x.mechanicRemoved)) {
    // the whole justification is that the branch cannot reach a player. If the card is live, it
    // must be reviewable, and this entry is hiding it.
    if (liveCardIds && liveCardIds.has(e.old)) fail(res, `refusing to drop ${e.old} as mechanic-removed — that card is STILL LIVE and would vanish from his review`);
    if (e.new) fail(res, `${e.old} is marked mechanicRemoved but still names a target (${e.new}) — it must be one or the other`);
    if (!e.ruling) fail(res, `${e.old} is marked mechanicRemoved with no \`ruling\` recording who decided it and when`);
  }

  // the arithmetic — every one of his rows lands in exactly one of the three buckets
  if (targets.length + retired.length + mechGone.length !== EXPECTED_ROWS) {
    fail(res, `${EXPECTED_ROWS} != ${targets.length} aliased + ${retired.length} retired + ${mechGone.length} mechanic-removed`);
  }

  // every alias target is a LIVE card id
  if (liveCardIds) {
    const dead = targets.filter((id) => !liveCardIds.has(id));
    if (dead.length) fail(res, `${dead.length} alias target(s) name no live card, first: ${dead.slice(0, 5).join(", ")}`);
  }

  // THE RECIPROCAL, which prose alone cannot enforce: without it an alias could point anywhere and
  // nothing would notice. Every frozen line-keyed id must resolve against the export-era inventory
  // his page actually consumed, or be on the pinned page-added list.
  if (exportEraInventory) {
    const known = new Set();
    (exportEraInventory.adhoc || []).forEach((e) => known.add(`adhoc:${e.file}:${e.line}`));
    (exportEraInventory.prompts || []).forEach((e) => {
      known.add(`prompt:${e.file}:${e.line}`);
      (e.labels || []).forEach((l, i) => known.add(`button:${e.file}:${e.line}~${i}`));
    });
    (exportEraInventory.misc || []).forEach((e) => known.add(`misc:${e.category}:${e.file}:${e.line}`));
    const base = (id) => id.replace(/~[^~]*$/, "");
    const unresolved = rows
      .filter((r) => /:\d+/.test(r.id))
      .filter((r) => !known.has(r.id) && !known.has(base(r.id)) && !PAGE_ADDED.has(r.id))
      .map((r) => r.id);
    if (unresolved.length) fail(res, `${unresolved.length} frozen id(s) resolve against NEITHER the export-era inventory NOR the pinned exception list: ${unresolved.join(", ")}`);
  }

  // the seed yields 209 reviewed rows, and no `keep` is degraded to unknown — an unreviewed row is
  // not a keep, it is unknown, which is the specific regression D-27 exists to prevent
  const seeded = rows.filter((r) => byOld[r.id] && byOld[r.id].new);
  const reviewed = seeded.filter((r) => r.reviewed !== false).length;
  note(res, `reviewed rows carried across: ${reviewed} of ${EXPECTED_ROWS} (${retired.length} retired against his own merge instruction, ${mechGone.length} whose mechanic he removed)`);
  // The equality still covers every one of his 209 rows — the third bucket is ADDED to the sum, not
  // subtracted from the requirement, so a row cannot go missing by being quietly reclassified.
  if (reviewed + retired.length + mechGone.length !== EXPECTED_ROWS) {
    fail(res, `only ${reviewed} row(s) seed as reviewed; ${EXPECTED_ROWS - retired.length - mechGone.length} expected — a keep that becomes unknown is a lost decision, not a keep`);
  }
  const keepLost = seeded.filter((r) => derivedIntent(r) === "keep" && r.reviewed === false);
  if (keepLost.length) fail(res, `${keepLost.length} keep row(s) would seed unreviewed: ${keepLost.slice(0, 5).map((r) => r.id).join(", ")}`);

  // the drift baseline covers EXACTLY the derived-keep rows — not "at most", not a window. No
  // retirement is a derived-keep row (all six are merge-tagged), so this number cannot legitimately move.
  const derivedKeep = rows.filter((r) => derivedIntent(r) === "keep").length;
  if (derivedKeep !== EXPECTED_DRIFT) fail(res, `expected ${EXPECTED_DRIFT} derived-keep rows in his export, found ${derivedKeep}`);
  if (!baseline) fail(res, "art-review/narration-approved-baseline.json is missing — the drift class has nothing to compare against");
  else {
    const n = Object.keys(baseline.cards || baseline).length;
    if (n !== EXPECTED_DRIFT) fail(res, `the drift baseline covers ${n} card(s), expected exactly ${EXPECTED_DRIFT} — no retirement is a derived-keep row, so this count cannot move`);
    if (!/drift pin/i.test(JSON.stringify(baseline._provenance || baseline.provenance || ""))) {
      fail(res, "the drift baseline must state it is a DRIFT PIN, not evidence of approval — otherwise the next reader treats it as something Wyatt said");
    }
    note(res, `drift baseline: ${n} of ${EXPECTED_DRIFT} derived-keep cards pinned, provenance stated`);
  }
  return res;
}

/* ================= assertion 9: the safe-render boundary and the storage key ================= */

export function checkPageBoundary(page) {
  const res = mk("assertion 9 — safe-render: every card in the page's render loop goes through the boundary");
  const stripped = stripCommentLines(page);
  const wrapped = (stripped.match(/renderCardSafely\s*\(/g) || []).length;
  // PRESENCE FIRST. A "no failures found" check prints nothing when the assertion was never written
  // at all, so prove the wiring exists before proving it passes.
  if (wrapped < 1) fail(res, "the page never calls renderCardSafely — the per-card boundary is not wired, so one bad card still blanks the whole page");
  // and no direct per-category renderer call survives inside the render loop itself
  const loop = declBody(page, "boxesHtml") || "";
  const direct = (stripped.match(/const built = ng\.cardsOf\(\)/g) || []).length;
  note(res, `safe-render: ${wrapped} boundary call site(s) in the page, ${direct} direct per-category renderer call(s) left in the render loop`);
  if (direct !== 0) fail(res, `${direct} card-emitting call(s) in the render loop still bypass renderCardSafely`);

  // the storage key and the id-scheme version must agree, so a future id change cannot ship
  // without a bump — the ids just changed, and an old-era entry would quietly mix two schemes.
  const schemeM = /const ID_SCHEME_VERSION = "([^"]+)"/.exec(stripped);
  const keyM = /const STORAGE_KEY = [`"]([^`"]+)[`"]/.exec(stripped);
  if (!schemeM) fail(res, "the page declares no ID_SCHEME_VERSION — nothing pins the storage key to the id scheme");
  else if (!keyM) fail(res, "the page's STORAGE_KEY could not be parsed");
  else {
    const agrees = keyM[1].includes("${ID_SCHEME_VERSION}") || keyM[1].includes(schemeM[1]);
    note(res, `storage key: ${keyM[1]} · id scheme: ${schemeM[1]}`);
    if (!agrees) fail(res, `the storage key "${keyM[1]}" does not carry the id-scheme version "${schemeM[1]}" — an id change could ship without a bump, mixing two schemes in one browser`);
  }
  return res;
}

/* ================= assertion 10: the LIVE RENDER — what the page actually shows =================
 *
 * WHY THIS ASSERTION EXISTS, AND WHY THE OTHER NINE COULD NOT CATCH IT (2026-07-30).
 *
 * Assertions 1–9 read the page as TEXT. That was a deliberate choice and it still is: it caught five
 * classes of decay and it needs no browser. But a static read cannot see an exception thrown INSIDE a
 * card builder, and that is the failure mode that has now killed this page twice.
 *
 * Measured at 2cbe551, in a browser, by Wyatt: the page rendered 61 cards and its own console
 * reported `D-21 self-check failures ... Array(128)`. `npm test` reported 22/22 PASS. A gate that is
 * green over a page that knows it is missing 128 lines is worse than no gate, because it is the
 * reason nobody looked. Concretely: Wyatt's newly approved line — "Yer too broke to buy it — take
 * the 3🌕 instead." (src/ui/flow.js, `// @copy prompt.dock.tailschoice`) — was already invisible on
 * the page it exists to be reviewed on, hours after he approved it.
 *
 * The cause was two symmetric leftovers from the 15-07 Task 3 re-key, neither visible in page text:
 *   - `adhocCards()` passed `fileLine`, an identifier that no longer exists in that scope, so EVERY
 *     ad-hoc lookup threw ReferenceError and each of the 13 NODE_GROUPS containing one collapsed
 *     into a single error card — 61 rendered instead of 212;
 *   - the page's own coverage probe called `promptCardId(entry.file, entry.line)` against the new
 *     one-argument signature, producing the id `prompt:undefined` — and a pass-through prompt card
 *     was ALSO built under that same junk id, so `renderedIds.has("prompt:undefined")` was true and
 *     all 28 prompts reported COVERED while 41 of their buttons reported missing. Two bugs cancelling
 *     into a false pass is exactly what an independent check has to be able to see.
 *
 * `scripts/no_undef_check.js` finds precisely this identifier class, but it is scoped to
 * `src/**\/*.js` and the audit page is not in `src/`. Rather than widen a heuristic, this assertion
 * EXECUTES the page (scripts/lib/audit_page_headless.mjs + a hand-rolled DOM, no dependency) and
 * reads its own numbers back. Fidelity is proven, not asserted: headless reproduces the browser's
 * 61 cards and 128 self-check failures exactly.
 *
 * It reports FAIL, never a warning. A coverage shortfall on this page means Wyatt is reviewing
 * wording that is not all of the wording, which is the one thing this tool must never do quietly.
 * ==========================================================================*/

// How many missing ids to name in the failure output. Enough to act on, not a wall of text.
const LIVE_RENDER_SAMPLE = 12;

/**
 * @param {object} headless the return of renderAuditPageHeadless() — the page's OWN render and its
 *   OWN probeFailures array, read back. Never re-derived here.
 * @param {object[]} coreCards core.renderAllCards(inv) — the shared render core's full card list,
 *   i.e. every distinct text the live builders can produce. The page and this list have exactly one
 *   implementation between them, which is why comparing them is meaningful rather than circular:
 *   the core says what text EXISTS, the page says what a reviewer can SEE.
 */
export function checkLiveRender(headless, coreCards) {
  const res = mk("assertion 10 — live render: the page shows a card for every text the builders produce");

  if (!headless || headless.fatal) {
    fail(res, `the page's module threw before finishing — in a browser this is the "stuck on loading, no cards" failure:\n${headless ? headless.fatal : "(no result at all)"}`);
    return res;
  }

  const rendered = new Set(headless.cardIds);
  const coreIds = coreCards.map((c) => c.id);
  const distinctCore = new Set(coreIds);
  const missing = coreIds.filter((id) => !rendered.has(id));
  const errorCards = headless.errorCards || [];
  const probe = headless.selfCheckFailures || [];

  // THE NUMBERS, always printed — pass or fail. A gate that only speaks when it is unhappy leaves
  // nobody able to tell a repaired number from a number that was never measured.
  note(res, `cards rendered: ${headless.cardIds.length} (${rendered.size} distinct) across ${headless.nodeGroupCount} moments`);
  note(res, `distinct texts the builders produce (render core): ${distinctCore.size}`);
  note(res, `unrendered: ${missing.length}`);
  note(res, `the page's own D-21 self-check: ${probe.length} failure(s)`);

  // (a) a collapsed NODE_GROUP — the per-group boundary caught a throw, so the page survived, but
  // every card in that group is gone. Named with the real exception so the fix is one read away.
  if (errorCards.length) {
    fail(res, `${errorCards.length} of ${headless.nodeGroupCount} moment(s) collapsed into an error card — every card inside them is missing from the page:`);
    for (const e of errorCards) note(res, `  ${e.id}: ${String(e.detail || "").split("\n")[0]}`);
  }

  // (b) a junk card id. `prompt:undefined` is not a card, and worse, it silently satisfied the
  // page's own prompt-coverage probe for all 28 prompts.
  const junk = Array.from(rendered).filter((id) => /undefined|NaN|:null\b/.test(String(id)));
  if (junk.length) {
    fail(res, `${junk.length} rendered card id(s) are junk — a stale call signature produced them, and a junk id can silently satisfy a coverage probe: ${junk.join(", ")}`);
  }

  // (c) COVERAGE. The assertion this whole file exists for.
  if (missing.length) {
    fail(res, `${missing.length} of ${distinctCore.size} builder-produced texts have NO card on the page — Wyatt cannot review what he cannot see. First ${Math.min(LIVE_RENDER_SAMPLE, missing.length)}:`);
    for (const id of missing.slice(0, LIVE_RENDER_SAMPLE)) note(res, `  ${id}`);
    if (missing.length > LIVE_RENDER_SAMPLE) note(res, `  …and ${missing.length - LIVE_RENDER_SAMPLE} more (run \`node scripts/narration_audit_check.js --live\` for the full list)`);
  }

  // (d) the page's OWN self-check, promoted from a console message nobody reads into a gate. Grouped
  // by its own key so the shape of the shortfall is legible at a glance.
  if (probe.length) {
    const byKey = new Map();
    for (const f of probe) byKey.set(f.key, (byKey.get(f.key) || 0) + 1);
    const shape = Array.from(byKey.entries()).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(", ");
    fail(res, `the page's own D-21 self-check reports ${probe.length} failure(s) — ${shape}. It has been saying so in the browser console; this is the gate that makes it count. First ${Math.min(LIVE_RENDER_SAMPLE, probe.length)}:`);
    for (const f of probe.slice(0, LIVE_RENDER_SAMPLE)) note(res, `  [${f.key}] ${String(f.text).replace(/\s+/g, " ").slice(0, 150)}`);
    if (probe.length > LIVE_RENDER_SAMPLE) note(res, `  …and ${probe.length - LIVE_RENDER_SAMPLE} more`);
  }

  return res;
}

/* ================= the whole gate, as one callable function ================= */

export function runChecks(page, inv, opts = {}) {
  const results = [
    checkResolvability(page, inv),
    checkOrphans(page, inv),
    checkPlacement(page, inv, opts.multiPlacementAllowed === undefined ? MULTI_PLACEMENT_ALLOWED : opts.multiPlacementAllowed),
    ...checkAffordances(page),
    checkLineKeying(page),
  ];
  if (opts.cards) results.push(checkCardText(opts.cards, opts.core));
  if (opts.core) results.push(checkTableBaseline(opts.core, opts.baselineText));
  if (opts.migration) results.push(checkMigration(opts.migration));
  if (opts.checkBoundary !== false) results.push(checkPageBoundary(page));
  // Assertion 10 needs the page EXECUTED, which is async, so main() renders it once and hands the
  // result in. runChecks itself stays synchronous — that is what lets --drill run every assertion
  // against a synthetic tree without a browser or an event loop.
  if (opts.headless) results.push(checkLiveRender(opts.headless, opts.cards || []));
  return results;
}

/* ================= --drill: red-proof every assertion ================= */

// A synthetic, fully-consistent page + inventory pair. The negative control: every assertion must
// PASS against it, proving none of them is vacuous. Each drill case then breaks exactly one thing
// and asserts that assertion goes red.
//
// The fixture's file paths are under `drill/`, deliberately NOT under `src/`. Assertion 5's whole
// subject is card ids keyed to a REAL source line, so its pattern is anchored on `src/` — a fixture
// using `src/` paths would make the negative control fail assertion 5 for a reason that has nothing
// to do with the fixture being inconsistent. `drill/` keeps every other assertion exercised
// identically while leaving assertion 5's own violation to be introduced deliberately, below.
function syntheticPair() {
  const inv = {
    table: [], awards: [{ key: "most", img: null, name: "N", byline: "B", line: 1 }], roundCfgFlags: { a: true },
    adhoc: [{ id: "adhoc.drill.one", file: "drill/flow.js", line: 10, fn: "f", label: "l", defaultTag: "keep", rawNeutral: "`x`", rawVariants: null, tableDriven: false, group: "g" }],
    prompts: [{ id: "prompt.drill.one", file: "drill/flow.js", line: 20, fn: "g", kind: "ask", rawMsg: "`y`", labels: [], dynamicLabelCount: 0, dynamicBase: null, rawSub: null, isLiteral: true }],
    misc: [{ category: "lobby", id: "misc.drill.one", file: "drill/lobby.js", line: 30, fn: "h", rawMsg: "`z`" }],
  };
  const hooks = AFFORDANCES.flatMap((a) => a.hooks).map((h) => `/* hook ${h} */ ${h}`).join("\n");
  const page = [
    "const NODE_GROUPS = [",
    '  { id: "one", stage: 0, cardsOf: () => adhocCards("adhoc.drill.one")',
    '      .concat(promptCards("prompt.drill.one"), miscLobbyCard("misc.drill.one"), awardCards(), dockFlavorCards()) },',
    "];",
    'const ADHOC_EXTRA_TAGS = { "adhoc.drill.one": ["b"] };',
    'const ADHOC_LABEL_OVERRIDE = { "adhoc.drill.one~b": "a sibling branch" };',
    // the safe-render boundary and the storage-key pin, so assertion 9 is exercised by the control
    "const built = core.renderCardSafely(ng, (n) => n.cardsOf());",
    'const ID_SCHEME_VERSION = "v3-stable-copy-ids";',
    "const STORAGE_KEY = `drill_${ID_SCHEME_VERSION}`;",
    hooks,
  ].join("\n");
  return { page, inv };
}

function drill() {
  let bad = 0;
  const say = (ok, what) => { console.log((ok ? "PASS" : "FAIL") + ": drill — " + what); if (!ok) bad++; };
  const idOf = (r) => r.label.split(" ")[1]; // "1"/"2"/"3"/"5" for the numbered assertions

  const base = syntheticPair();

  // Every synthetic run passes an EMPTY multi-placement allowlist: the real allowlist names real
  // card ids, which are absent from the fixture and would read as stale against it. The stale branch
  // gets its own dedicated case below, so nothing goes unproven.
  const run = (page, inv, allowed) => runChecks(page, inv, { multiPlacementAllowed: allowed || {} });

  // NEGATIVE CONTROL — a consistent pair must pass EVERYTHING. Without this, every assertion below
  // could be red for a reason that has nothing to do with the violation the case introduces, and
  // the drill would prove nothing at all.
  {
    const results = run(base.page, base.inv);
    const reds = results.filter((r) => !r.pass);
    say(reds.length === 0, "negative control: a fully consistent synthetic page + inventory PASSES every assertion" + (reds.length ? " (red: " + reds.map((r) => r.label + " :: " + r.lines.join(" / ")).join("; ") + ")" : ""));
  }

  // assertion 1 — a lookup key with no inventory entry
  {
    const page = base.page.replace('miscLobbyCard("misc.drill.one")', 'miscLobbyCard("misc.drill.gone")');
    const r = run(page, base.inv).find((x) => idOf(x) === "1");
    say(!r.pass && r.lines.some((l) => /FATAL/.test(l)), "assertion 1 goes red on an unresolvable FATAL lookup");
  }
  {
    const page = base.page.replace('promptCards("prompt.drill.one")', 'promptCards("prompt.drill.gone")');
    const r = run(page, base.inv).find((x) => idOf(x) === "1");
    say(!r.pass && r.lines.some((l) => /SILENT/.test(l)), "assertion 1 goes red on an unresolvable SILENT lookup");
  }
  // assertion 2 — a per-site table entry keyed to a site that does not exist
  {
    const page = base.page.replace('const ADHOC_EXTRA_TAGS = { "adhoc.drill.one": ["b"] };', 'const ADHOC_EXTRA_TAGS = { "adhoc.drill.one": ["b"], "adhoc.drill.deleted": ["b"] };');
    const r = run(page, base.inv).find((x) => idOf(x) === "2");
    say(!r.pass && r.lines.some((l) => /orphan/.test(l)), "assertion 2 goes red on an orphaned per-site renderer entry");
  }
  // assertion 3 — a live site no node group places
  {
    const inv = JSON.parse(JSON.stringify(base.inv));
    inv.adhoc.push({ file: "drill/flow.js", line: 11, fn: "f", label: "l", defaultTag: "keep", rawNeutral: "`q`", rawVariants: null, tableDriven: false, group: "g" });
    const r = run(base.page, inv).find((x) => idOf(x) === "3");
    say(!r.pass && r.lines.some((l) => /unplaced/.test(l)), "assertion 3 goes red on a live site with no flow-chart placement");
  }
  {
    const page = base.page.replace('adhocCards("adhoc.drill.one")', 'adhocCards("adhoc.drill.one").concat(adhocCards("adhoc.drill.one"))');
    const r = run(page, base.inv).find((x) => idOf(x) === "3");
    say(!r.pass && r.lines.some((l) => /placed 2 times/.test(l)), "assertion 3 goes red on an unreasoned duplicate placement");
  }
  {
    // a duplicate placement WITH a reason is allowed — the allowlist is a real escape hatch, not a
    // dead branch
    const page = base.page.replace('adhocCards("adhoc.drill.one")', 'adhocCards("adhoc.drill.one").concat(adhocCards("adhoc.drill.one"))');
    const r = run(page, base.inv, { "adhoc:adhoc.drill.one": "a shared helper that genuinely fires at two moments" }).find((x) => idOf(x) === "3");
    say(r.pass, "assertion 3 accepts a duplicate placement that carries a stated reason");
  }
  {
    // …and a reason for a card that is NOT multiply placed is stale cover, which must fail
    const r = run(base.page, base.inv, { "adhoc:adhoc.drill.one": "no longer true" }).find((x) => idOf(x) === "3");
    say(!r.pass && r.lines.some((l) => /STALE/.test(l)), "assertion 3 goes red on a STALE multi-placement allowlist entry");
  }
  {
    // …and an allowlist entry with an empty reason is not an exception, it is a hole
    const r = run(base.page, base.inv, { "adhoc:adhoc.drill.one": "" }).find((x) => idOf(x) === "3");
    say(!r.pass && r.lines.some((l) => /no reason/.test(l)), "assertion 3 goes red on an allowlist entry with no stated reason");
  }
  // assertion 4 — a dropped affordance hook
  {
    const page = base.page.replace(/^.*mergeTargetCustom.*$/m, "");
    const r = run(page, base.inv).filter((x) => /^affordance/.test(x.label)).find((x) => !x.pass);
    say(!!r, "assertion 4 goes red when an affordance hook is deleted");
  }
  {
    // a hook that survives ONLY inside a comment is still a removed affordance
    const page = base.page.replace(/^.*checkMergeCycles.*$/m, "// checkMergeCycles");
    const r = run(page, base.inv).filter((x) => /^affordance/.test(x.label)).find((x) => !x.pass);
    say(!!r && r.lines.some((l) => /ONLY inside a comment/.test(l)), "assertion 4 goes red when an affordance hook survives ONLY inside a comment");
  }
  // assertion 5 — a line-number-keyed literal
  {
    const page = base.page + '\nconst X = "src/ui/flow.js:42";\n';
    const r = run(page, base.inv).find((x) => idOf(x) === "5");
    say(!r.pass && r.lines.some((l) => /distinct: 1, occurrences: 1/.test(l)), "assertion 5 goes red on a single line-number-keyed literal");
  }
  {
    // and it reports DISTINCT and OCCURRENCE as two separate numbers
    const page = base.page + '\nconst X = "src/ui/flow.js:42"; const Y = "src/ui/flow.js:42";\n';
    const r = run(page, base.inv).find((x) => idOf(x) === "5");
    say(r.lines.some((l) => /distinct: 1, occurrences: 2/.test(l)), "assertion 5 reports distinct and occurrence counts as two separate numbers");
  }

  /* ---- assertion 6 — card fidelity. Its subject is RENDERED CARDS rather than page text, so its
   * fixtures are synthetic card lists plus a synthetic core stub. ---- */
  const stubCore = (curated, cap, viol) => ({
    CURATED_RENDERERS: Object.fromEntries(Array.from({ length: curated }, (_, i) => [`r${i}`, 1])),
    CURATED_RENDERER_CAP: cap,
    FABRICATED_EVENT_VIOLATIONS: viol || [],
  });
  {
    // negative control: healthy cards must PASS
    const cards = [{ id: "a", neutral: "real text" }, { id: "b", silent: true, neutral: null }, { id: "c", passThrough: true, neutral: null }];
    const r = checkCardText(cards, stubCore(0, 2));
    say(r.pass, "negative control: assertion 6 PASSES a card list whose text is all real");
  }
  {
    const cards = [{ id: "a", neutral: "(no renderer defined for this line yet)" }];
    const r = checkCardText(cards, stubCore(0, 2));
    say(!r.pass && r.lines.some((l) => /placeholder/.test(l)), "assertion 6 goes red on a card showing placeholder text");
  }
  {
    const cards = [{ id: "a", neutral: null, rawNeutral: "`x`" }];
    const r = checkCardText(cards, stubCore(0, 2));
    say(!r.pass && r.lines.some((l) => /rendered no text/.test(l)), "assertion 6 goes red on a resolvable site that rendered nothing");
  }
  {
    const cards = [{ id: "a", error: "boom" }];
    const r = checkCardText(cards, stubCore(0, 2));
    say(!r.pass && r.lines.some((l) => /failed to render/.test(l)), "assertion 6 goes red on a card that failed to render");
  }
  {
    const r = checkCardText([{ id: "a", neutral: "t" }], stubCore(5, 2));
    say(!r.pass && r.lines.some((l) => /exceeds the cap/.test(l)), "assertion 6 goes red when curated renderers exceed their cap");
  }
  {
    const r = checkCardText([{ id: "a", neutral: "t" }], stubCore(0, 2, ["table:battle takes null (D-51)"]));
    say(!r.pass && r.lines.some((l) => /D-51/.test(l)), "assertion 6 goes red on a fabricated event that violates its real emit-site invariants (D-51)");
  }

  /* ---- assertion 7 — the committed table baseline. ---- */
  {
    const fakeCore = { tableCards: () => ({ "table:x": { neutral: "same", variants: [] } }) };
    const good = JSON.stringify({ cards: { "table:x": { neutral: "same", variants: [] } } });
    say(checkTableBaseline(fakeCore, good).pass, "negative control: assertion 7 PASSES when the core reproduces the baseline");
    const drifted = JSON.stringify({ cards: { "table:x": { neutral: "DIFFERENT", variants: [] } } });
    const r = checkTableBaseline(fakeCore, drifted);
    say(!r.pass && r.lines.some((l) => /drifted from the baseline/.test(l)), "assertion 7 goes red when a table card drifts from its committed baseline");
    const rm = checkTableBaseline(fakeCore, null);
    say(!rm.pass && rm.lines.some((l) => /regression pin is gone/.test(l)), "assertion 7 goes red when the baseline fixture is deleted outright");
  }

  /* ---- assertion 8 — the migration. Its subject is the alias map, so its fixtures are synthetic
   * row/alias pairs. Every case below is about a way his 209 rows could be LOST while a laxer gate
   * still reported green. ---- */
  const migFixture = (over = {}) => {
    // one row per pinned retirement (all merge-tagged) plus enough keep rows to hit the drift count
    const rows = EXPECTED_RETIRED.map((id) => ({ id, tag: "merge", reviewed: true, notes: "" }));
    for (let i = 0; i < EXPECTED_DRIFT; i++) rows.push({ id: `table:k${i}`, tag: "keep", reviewed: true, notes: "" });
    while (rows.length < EXPECTED_ROWS) rows.push({ id: `table:r${rows.length}`, tag: "rewrite", reviewed: true, notes: "words" });
    const entries = rows.map((r) => (EXPECTED_RETIRED.includes(r.id)
      ? { old: r.id, retired: "merged away" }
      : { old: r.id, new: r.id, evidence: "stable" }));
    const cards = {};
    rows.filter((r) => r.tag === "keep").forEach((r) => { cards[r.id] = { neutral: "t", variants: [] }; });
    const baseline = { _provenance: "DRIFT PIN, not evidence of approval", cards };
    const liveCardIds = new Set(entries.filter((e) => e.new).map((e) => e.new));
    return Object.assign({ rows, aliases: { entries }, baseline, exportEraInventory: null, liveCardIds }, over);
  };
  {
    const r = checkMigration(migFixture());
    say(r.pass, "negative control: assertion 8 PASSES a complete, correctly-retired migration" + (r.pass ? "" : " (red: " + r.lines.join(" / ") + ")"));
  }
  {
    // a row silently dropped from the alias map
    const f = migFixture();
    f.aliases.entries = f.aliases.entries.slice(1);
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /no alias entry/.test(l)), "assertion 8 goes red when a disposition row has no alias entry");
  }
  {
    // a mass retirement dressed up with a reason — the failure mode the pinned LIST exists to stop
    const f = migFixture();
    f.aliases.entries = f.aliases.entries.map((e) => (e.new && /^table:k/.test(e.old) ? { old: e.old, retired: "site gone" } : e));
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /retirement set drifted/.test(l)), "assertion 8 goes red on a mass retirement, even though every entry carries a reason");
  }
  {
    // retiring a row he tagged keep — never his instruction
    const f = migFixture();
    f.rows = f.rows.map((r) => (r.id === EXPECTED_RETIRED[0] ? Object.assign({}, r, { tag: "keep" }) : r));
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /refusing to retire/.test(l)), "assertion 8 refuses to retire a row whose own tag is keep, not merge");
  }
  {
    // two aliases pointing at one card — the second review mark would land on the wrong card
    const f = migFixture();
    const live = f.aliases.entries.find((e) => e.new);
    f.aliases.entries.push({ old: "table:extra", new: live.new });
    f.rows.push({ id: "table:extra", tag: "keep", reviewed: true, notes: "" });
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /point at the same card/.test(l)), "assertion 8 goes red when two aliases point at the same card");
  }
  {
    // the drift baseline narrowed — a 6-row window here would let six of his rows vanish green
    const f = migFixture();
    const keys = Object.keys(f.baseline.cards);
    keys.slice(0, 6).forEach((k) => delete f.baseline.cards[k]);
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /this count cannot move/.test(l)), "assertion 8 goes red when the drift baseline loses even six rows");
  }
  {
    // a baseline that does not say what it is would be read as something Wyatt approved
    const f = migFixture({});
    f.baseline = { _provenance: "the approved text", cards: f.baseline.cards };
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /DRIFT PIN/.test(l)), "assertion 8 goes red when the drift baseline does not state that it is a drift pin");
  }
  {
    // an alias pointing at a card that does not exist
    const f = migFixture();
    f.aliases.entries.find((e) => e.new).new = "adhoc:does.not.exist";
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /name no live card/.test(l)), "assertion 8 goes red when an alias target names no live card");
  }
  {
    // a frozen id that resolves against neither the export-era inventory nor the exception list
    const f = migFixture({ exportEraInventory: { adhoc: [], prompts: [], misc: [] } });
    f.rows.push({ id: "adhoc:src/ui/nowhere.js:1", tag: "keep", reviewed: true, notes: "" });
    f.aliases.entries.push({ old: "adhoc:src/ui/nowhere.js:1", new: "adhoc:invented" });
    f.liveCardIds.add("adhoc:invented");
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /resolve against NEITHER/.test(l)), "assertion 8 goes red on a frozen id that traces to neither the export-era inventory nor the pinned exceptions");
  }
  {
    // a keep row degraded to unreviewed — an unreviewed row is not a keep, it is unknown (D-27)
    const f = migFixture();
    f.rows = f.rows.map((r) => (r.id === "table:k0" ? Object.assign({}, r, { reviewed: false }) : r));
    const r = checkMigration(f);
    say(!r.pass && r.lines.some((l) => /seed unreviewed|not a keep/.test(l)), "assertion 8 goes red when a keep row would seed unreviewed");
  }

  /* ---- assertion 9 — the safe-render boundary and the storage key. ---- */
  {
    const good = 'const built = core.renderCardSafely(ng, (n) => n.cardsOf());\nconst ID_SCHEME_VERSION = "v3-x";\nconst STORAGE_KEY = `k_${ID_SCHEME_VERSION}`;';
    say(checkPageBoundary(good).pass, "negative control: assertion 9 PASSES a page that wires the boundary and pins the storage key");
  }
  {
    const r = checkPageBoundary('const ID_SCHEME_VERSION = "v3-x";\nconst STORAGE_KEY = `k_${ID_SCHEME_VERSION}`;');
    say(!r.pass && r.lines.some((l) => /never calls renderCardSafely/.test(l)), "assertion 9 goes red when the page never calls the safe-render boundary");
  }
  {
    const r = checkPageBoundary('const built = ng.cardsOf();\nconst renderCardSafely = 1;\nconst ID_SCHEME_VERSION = "v3-x";\nconst STORAGE_KEY = `k_${ID_SCHEME_VERSION}`;');
    say(!r.pass && r.lines.some((l) => /bypass renderCardSafely/.test(l)), "assertion 9 goes red on a direct renderer call left in the render loop");
  }
  {
    const r = checkPageBoundary('renderCardSafely(x);\nconst ID_SCHEME_VERSION = "v3-x";\nconst STORAGE_KEY = "k_v2-old";');
    say(!r.pass && r.lines.some((l) => /does not carry the id-scheme version/.test(l)), "assertion 9 goes red when the storage key does not carry the id-scheme version");
  }

  /* ---- assertion 10 — the live render. Red-proofed BOTH ways, per this pass's own standard.
   *
   * The PASS side matters as much as the fail side here, and it needs saying why it is a fixture. On
   * the day this assertion was written the real page was 165 cards short, so "it passes when coverage
   * is complete" could not be demonstrated on the real tree at that commit. It is demonstrated on a
   * synthetic complete pair instead: a headless result whose rendered ids are exactly the core's card
   * ids, no error cards, no junk ids, an empty probe array. Every field the assertion reads is
   * exercised, so a future reader can tell a REPAIRED assertion 10 from a weakened one.
   *
   * `complete()` fabricates the HARNESS OUTPUT, not the page — checkLiveRender is pure and takes that
   * output as data, which is exactly what makes it drillable without a browser. The harness itself is
   * separately proven faithful: run against the real page it reproduces Chrome's own numbers (61
   * cards, 128 self-check failures) to the digit. ---- */
  {
    const coreCards = [{ id: "table:a" }, { id: "prompt:p" }, { id: "button:p~0" }, { id: "sub:p~poor" }];
    const complete = (over) => Object.assign({
      ok: true, fatal: null,
      cardIds: coreCards.map((c) => c.id),
      cardElements: coreCards.length,
      selfCheckFailures: [], errorCards: [], nodeGroupCount: 3,
      inventoryCounts: { adhoc: 1, prompts: 1, misc: 0, awards: 0 },
    }, over || {});

    say(checkLiveRender(complete(), coreCards).pass,
      "negative control: assertion 10 PASSES when every builder-produced text has a rendered card");

    // it must also always PRINT the numbers, pass or fail — a silent pass is unauditable
    {
      const r = checkLiveRender(complete(), coreCards);
      say(r.lines.some((l) => /cards rendered: 4/.test(l)) && r.lines.some((l) => /unrendered: 0/.test(l)),
        "assertion 10 reports the real counts even when it passes");
    }
    {
      const r = checkLiveRender(complete({ cardIds: ["table:a", "prompt:p"] }), coreCards);
      say(!r.pass && r.lines.some((l) => /2 of 4 builder-produced texts have NO card/.test(l)) && r.lines.some((l) => /button:p~0/.test(l)),
        "assertion 10 goes red on an unrendered builder text, and names it");
    }
    {
      const r = checkLiveRender(complete({ errorCards: [{ id: "dockOutcomes", detail: "fileLine is not defined" }] }), coreCards);
      say(!r.pass && r.lines.some((l) => /collapsed into an error card/.test(l)) && r.lines.some((l) => /fileLine is not defined/.test(l)),
        "assertion 10 goes red on a collapsed moment, and names the exception");
    }
    {
      const r = checkLiveRender(complete({ cardIds: coreCards.map((c) => c.id).concat("prompt:undefined") }), coreCards);
      say(!r.pass && r.lines.some((l) => /junk/.test(l) && /prompt:undefined/.test(l)),
        "assertion 10 goes red on a junk card id — the one that silently satisfied the page's own probe");
    }
    {
      const r = checkLiveRender(complete({ selfCheckFailures: [{ key: "misc", text: "MISSING CARD for misc:timer:x", fields: null }] }), coreCards);
      say(!r.pass && r.lines.some((l) => /own D-21 self-check reports 1 failure/.test(l)),
        "assertion 10 goes red on the page's OWN self-check failures — it fails, it does not warn");
    }
    {
      const r = checkLiveRender({ ok: false, fatal: "ReferenceError: boom" }, coreCards);
      say(!r.pass && r.lines.some((l) => /threw before finishing/.test(l)),
        "assertion 10 goes red when the page's module throws at all — the historic blank-page failure");
    }
  }

  // prove the drill never touched the real tree
  const d = mkdtempSync(join(tmpdir(), "narr-audit-drill-"));
  writeFileSync(join(d, "note.txt"), "drill scratch dir — the drill builds its fixtures in memory and never writes to the repo\n");

  console.log(bad ? `\n${bad} drill case(s) FAILED — a guard that does not fail when broken is not a guard.` : "\nall drill cases passed — every assertion red-proofed, negative control included.");
  return bad ? 1 : 0;
}

/* ================= the render core, loaded once ================= */

// art-review/narration-core.js is the SAME module the page imports. Loading it here is the whole
// point of the refactor: the tool's rendering becomes answerable without a browser. It needs the raw
// text of the source files so it can resolve a copy site that interpolates a local computed a few
// lines above the call (`neutralBanner`, `promptMsg`, `sub`) out of the real declaration, instead of
// anybody hand-transcribing what those produce.
async function loadCore() {
  const core = await import("../art-review/narration-core.js");
  const sources = {};
  for (const rel of core.SOURCE_FILES) sources[rel] = readFileSync(join(ROOT, rel), "utf8");
  core.configure({ sources });
  return core;
}

/* ================= main ================= */

const argv = process.argv.slice(2);
if (argv.includes("--drill")) {
  process.exit(drill());
}

const page = readFileSync(join(ROOT, PAGE_REL), "utf8");
const inv = JSON.parse(readFileSync(join(ROOT, INV_REL), "utf8"));
const core = await loadCore();

/* ---- --print: dump every card's id, label and rendered text. --table-only reproduces the
 * committed table baseline byte-for-byte, which is how that fixture stays checkable forever. ---- */
if (argv.includes("--print")) {
  if (argv.includes("--table-only")) {
    const baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_REL), "utf8"));
    process.stdout.write(JSON.stringify({ _provenance: baseline._provenance, cards: core.tableCards() }, null, 2) + "\n");
    process.exit(0);
  }
  for (const c of core.renderAllCards(inv)) {
    if (c.error) { console.log(`--- ${c.id}\n    ERROR: ${c.error}`); continue; }
    console.log(`--- ${c.id}`);
    console.log(`    label:   ${c.label}`);
    console.log(`    neutral: ${c.silent || c.passThrough ? "(deliberately silent / pass-through)" : c.neutral}`);
    for (const v of c.variants || []) console.log(`    seat ${v.seat}: ${v.text}`);
    for (const n of c.notes || []) if (n) console.log(`    note:    ${n}`);
  }
  process.exit(0);
}

let baselineText = null;
try { baselineText = readFileSync(join(ROOT, BASELINE_REL), "utf8"); } catch (e) { baselineText = null; }
const cards = core.renderAllCards(inv);

// The migration inputs. The export-era inventory comes from git history, because that is the exact
// inventory Wyatt's review page consumed — the only evidence that can tell a correct alias from a
// plausible-looking guess.
const readJson = (rel) => { try { return JSON.parse(readFileSync(join(ROOT, rel), "utf8")); } catch (e) { return null; } };
// Two homes, archived first — see the matching note in art-review/narration-audit.html. The v1.3
// archive (d5189c2) moved phase 15's review files and branches exist on both sides of that move.
const readReviewJson = (rel) => readJson(`.planning/milestones/v1.2-phases/${rel}`) ?? readJson(`.planning/phases/${rel}`);
const dispositions = readReviewJson("15-narration-audit-fixes/15-DISPOSITIONS-FINAL.json");
const aliases = readJson("art-review/narration-id-aliases.json");
const approvedBaseline = readJson("art-review/narration-approved-baseline.json");
let exportEraInventory = null;
try {
  exportEraInventory = JSON.parse(execFileSync("git", ["show", `${EXPORT_ERA_COMMIT}:art-review/narration-inventory.json`], { cwd: ROOT, maxBuffer: 1e8 }).toString());
} catch (e) { exportEraInventory = null; }

const migration = dispositions && aliases ? {
  rows: dispositions.rows,
  aliases,
  baseline: approvedBaseline,
  exportEraInventory,
  liveCardIds: new Set(cards.map((c) => c.id)),
} : null;

// Assertion 10: EXECUTE the page. This is the one measurement the other nine cannot make (see that
// assertion's own header). Rendered once, here, and handed to runChecks.
const headless = renderAuditPageHeadlessIsolated();

/* ---- --live: the full unrendered list plus the page's whole self-check, for working through a
 * coverage gap rather than just being told its size. ---- */
if (argv.includes("--live")) {
  if (headless.fatal) {
    console.error("the page threw before finishing:\n" + headless.fatal);
    process.exit(1);
  }
  const renderedIds = new Set(headless.cardIds);
  const missing = cards.map((c) => c.id).filter((id) => !renderedIds.has(id));
  console.log(`cards rendered: ${headless.cardIds.length} (${renderedIds.size} distinct) · builders produce: ${new Set(cards.map((c) => c.id)).size} · unrendered: ${missing.length}`);
  console.log(`error cards: ${(headless.errorCards || []).length} · page self-check failures: ${(headless.selfCheckFailures || []).length}\n`);
  for (const e of headless.errorCards || []) console.log(`ERROR CARD  ${e.id}: ${String(e.detail || "").split("\n")[0]}`);
  for (const id of missing) console.log(`UNRENDERED  ${id}`);
  for (const f of headless.selfCheckFailures || []) console.log(`SELF-CHECK  [${f.key}] ${String(f.text).replace(/\s+/g, " ").slice(0, 200)}`);
  process.exit(0);
}

const results = runChecks(page, inv, { cards, core, baselineText, migration, headless });
let failures = 0;
for (const r of results) {
  console.log((r.pass ? "PASS" : "FAIL") + ": " + r.label);
  for (const l of r.lines) console.log(l);
  if (!r.pass) failures++;
}
console.log(`\n${results.length - failures}/${results.length} assertion group(s) PASS.`);
if (failures) {
  console.error(`${failures} assertion group(s) FAILED — see the named keys above.`);
  process.exit(1);
}
process.exit(0);
