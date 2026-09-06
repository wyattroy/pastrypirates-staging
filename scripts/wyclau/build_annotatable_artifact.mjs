#!/usr/bin/env node
/* build_annotatable_artifact.mjs — bake a self-publishing comment mechanism into a static,
 * publishable HTML page, the same way glass.mjs's PAGE bakes __GLASS_TPL__/__GLASS_STATE__.
 *
 * WHY THIS EXISTS. Wyatt asked (2026-09-06, on the SFX PRD): "make comment boxes in the artifact
 * that i can write notes in for you, and you can read them." The mechanism that already does this
 * lives inside glass.mjs — a state script tag (`#glassState`), a client script that reads it,
 * repaints on save, and calls `window.claude.use("artifact")` -> `cap.publish(buildDoc(state))` to
 * self-republish with the new state baked in. Rule 23 (ONE DISPLAY PATH): a second page that wants
 * the same capability should reuse that mechanism, not invent a fresh textarea with its own storage
 * scheme nobody can read back.
 *
 * Glass gets to bake __GLASS_TPL__ automatically because glass.mjs is a live generator, re-run
 * every time the page needs fresh Chart/ledger data. A one-off artifact like a PRD has no such
 * generator — it is written once, by hand, and never needs external data injected again. So this
 * script is the one-time equivalent: it takes a SHELL (the page as authored, containing exactly two
 * literal tokens, __PRD_STATE__ inside a `<script type="application/json" id="prdState">` and
 * __PRD_TPL__ inside `var TPL = "__PRD_TPL__";`) and bakes them in, exactly as glass.mjs's PAGE
 * generation does, so the resulting page can call buildDoc(state) and self-publish forever after,
 * with no server-side generator involved.
 *
 * USAGE: node scripts/wyclau/build_annotatable_artifact.mjs <shell.html> [--state='{"comments":{}}']
 * Writes the baked page back to the same path. Run this ONCE, after writing/editing the shell's
 * markup and before publishing (or re-publishing after a hand-edit that isn't a `cap.publish()`
 * round-trip, e.g. adding a NEW comment box to an already-annotated page).
 *
 * The two token names are per-page (STATE_TOKEN/TPL_TOKEN below) so a future artifact with a
 * differently-named state script (e.g. __FOO_STATE__) can reuse this file with a one-line edit
 * rather than fighting glass.mjs's Chart-specific token names.
 */
"use strict";
import fs from "node:fs";
import path from "node:path";

const STATE_TOKEN = "__PRD_STATE__";
const TPL_TOKEN = "__PRD_TPL__";

const file = process.argv[2];
if (!file) {
  console.log("usage: node build_annotatable_artifact.mjs <shell.html> [--state='{\"comments\":{}}']");
  process.exit(2);
}
const abs = path.resolve(file);
if (!fs.existsSync(abs)) { console.log(`REFUSED: ${abs} does not exist`); process.exit(1); }

const stateArg = process.argv.find((a) => a.startsWith("--state="));
const initialState = stateArg ? stateArg.slice("--state=".length) : '{"comments":{}}';
try { JSON.parse(initialState); } catch (e) {
  console.log(`REFUSED: --state is not valid JSON: ${e.message}`);
  process.exit(1);
}

let shell = fs.readFileSync(abs, "utf8");

/* ⛔ THE ID MUST BE glassState, NOT A PAGE-LOCAL NAME. Wyatt's own instruction (handoff
 * .planning/wyclau/HANDOFF-20260906.md, "T-261 — what is actually left"): "Build them on
 * glassState.comments... the mechanism his Glass already uses and harvest_glass.mjs already reads
 * back." scripts/wyclau/harvest_glass.mjs greps for the exact literal
 * `<script type="application/json" id="glassState">` — a page using any other id is invisible to
 * that script and would need its own harvester, which is the "fresh textarea" rule 23 forbids. */
if (!shell.includes(`id="glassState">${STATE_TOKEN}`)) {
  console.log(`REFUSED: no <script type="application/json" id="glassState">${STATE_TOKEN}</script> found — harvest_glass.mjs looks for that exact id, and a different one is invisible to it.`);
  process.exit(1);
}
if (!shell.includes(`= ${TPL_TOKEN};`)) {
  console.log(`REFUSED: no var TPL = ${TPL_TOKEN}; found — nothing to bake the self-template into.`);
  process.exit(1);
}

// Function-form replacements throughout: a plain string replacement interprets "$&"-style
// sequences inside the inserted value, and both the TPL string and his comment text are
// arbitrary content that can legally contain a dollar sign (glass.mjs carries the same rule,
// and CEO 115 found the string-form version actually corrupt a file on this project once).
/* ⚠ THE TOKEN MUST BE BARE IN THE SHELL — `var TPL = __PRD_TPL__;`, no surrounding quotes — same as
 * glass.mjs's own PAGE (`var TPL = __GLASS_TPL__;`, line ~1570). jsEsc()/JSON.stringify() already
 * produce a self-quoted string, so wrapping the TOKEN in quotes too doubles them. Measured, not
 * guessed: an earlier version of this script used a quoted search pattern while the client-side
 * buildDoc() (copied from glass.mjs) used a bare one — the two disagreed, and the corruption was
 * invisible on first load (this script's own quoted replace was internally self-consistent) and
 * only appeared the FIRST TIME buildDoc() ran client-side, i.e. the first time a real person saved
 * a comment — caught by scripts/qa/_t261_prd_comment_probe.mjs's round-trip check, which is why
 * that check exists rather than just asserting "the first save works". */
let baked = shell;
baked = baked.replace(TPL_TOKEN, () => JSON.stringify(shell).replace(/</g, "\\u003c"));
baked = baked.replace(STATE_TOKEN, () => initialState);

fs.writeFileSync(abs, baked, "utf8");
console.log(`BAKED  ${abs}`);
console.log(`  state token   -> ${initialState}`);
console.log(`  TPL token     -> ${shell.length} bytes of shell, JSON-escaped, baked in as a JS string`);
console.log(`  bytes: ${shell.length} shell -> ${baked.length} baked`);
