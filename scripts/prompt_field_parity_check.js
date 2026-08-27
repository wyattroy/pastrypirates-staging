#!/usr/bin/env node
/* PROMPT-FIELD PARITY GATE — a field the host SENDS and the guest never READS (or the reverse)
 * fails here, by name, instead of being found by a human staring at two browser windows.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * A prompt is composed once, on the host, inside ask() (src/ui/util.js). If the seat that has to
 * answer it is not the host's own, ask() FLATTENS the option list onto the wire — six parallel
 * arrays and a handful of flags — and the guest's watchPrompt() (src/orchestrator.js) rebuilds a
 * button row out of them. Those are two pieces of code that have to agree about a field set, and
 * nothing made them.
 *
 * SEVEN FIELDS HAVE ALREADY DRIFTED, AND EVERY ONE WAS CAUGHT ONE AT A TIME, BY EYE:
 *
 *   disabled  a greyed option arrived ungreyed on the guest — a dead circle that could be clicked
 *   why       the greying crossed but the REASON did not, so a greyed circle answered nothing
 *   back      the "‹" escape hatch was host-only; a guest had no way back out of a decision
 *   flipIdx   a remote player got a stray "FLIP!" button in the panel
 *   stage     the host got the dimmed 420px centre-stage card, the guest a small pill.
 *             Wyatt, 2026-08-19: "the narration box stage doesn't look the same for guest and host"
 *   shorts    menuButtons() only blooms the radial ring when every button carries a short label or
 *             is <=16 characters, so with `short` left behind the guest silently fell back to a
 *             flat card FOR THE COMMONEST PROMPT IN THE GAME.
 *             Wyatt, same morning: "the guest doesn't have radial action menus"
 *   seats     an option carrying `seat` blooms its circle over the boat it NAMES rather than the
 *             boat choosing (the battle side-bet's "Call Dough Hook"). Found by research, 02.1-03,
 *             still missing at the time — the seventh, and the one that prompted this gate.
 *
 * That is not seven accidents. It is one structural fact producing the same accident seven times:
 * a field is cheap to add on one side and invisible to omit on the other. 02.1-03 removed half the
 * cause by giving both renderers ONE button-row builder (optionButtonsHTML, src/ui/util.js). This
 * gate removes the other half — the WIRE contract, which a shared builder cannot police, because
 * the guest can only pass along a field it actually read off the payload.
 *
 * ============================================================================
 * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ============================================================================
 * THIS FILE NOW HOLDS THREE ASSERTIONS (grew from one, then to three — each addition has its own
 * header where it is defined, below). Assertion 1, in two parts, is the ask-channel wire/builder
 * check this header describes. Assertion 2 is the sail (pick) channel's sibling. Assertion 3 is the
 * standing static solo guard (02.15-02 Task 3 item 8 / 02.15-REVIEW WR-01) — a different KIND of
 * check, not a field comparison: it declares the pick channel's LOCAL render-and-resolve path and
 * asserts it never references a Firebase prompt writer, which is what keeps a solo game
 * (appState.db===null) alive on that path.
 *
 * Assertion 1, in two parts:
 *
 *   (A) THE WIRE.  The set of keys ask()'s remote payload WRITES equals the set of `p.<name>`
 *       properties watchPrompt()'s ask branch READS, modulo a short allow-list named below with a
 *       reason for each entry. A failure names the field and which side is missing it.
 *
 *   (B) THE BUILDER.  localAsk, watchPrompt and watchDraftPrompt all call optionButtonsHTML, and
 *       it is defined exactly once. Without this, (A) can pass over a re-inlined button row: a
 *       renderer that reads every field and then builds its own markup again is precisely the
 *       state this phase was undoing, and a gate that stays green through it is decoration.
 *
 * IT DOES NOT compare RENDERED HTML, and it never will from here — that is a browser's job, and
 * 02.1-03's two-browser check does it. This is the cheap, always-run half.
 *
 * COMMENTS ARE BLANKED FIRST (stripper lifted from seat_arg_check.js, same reason it was written
 * there): this file's own header quotes `seats:` and `p.seats` verbatim, and a check that cannot
 * tell prose from code makes writing the explanation an offence. Drill 1g pins that.
 *
 * Run:  node scripts/prompt_field_parity_check.js
 *       node scripts/prompt_field_parity_check.js --drill     (prove it CAN fail)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = path.join(__dirname, "..");            // the 4/ tree

const UTIL_REL = path.join("src", "ui", "util.js");
const ORCH_REL = path.join("src", "orchestrator.js");
const FLOW_REL = path.join("src", "ui", "flow.js");

/* The allow-list, every entry named with the reason it is legitimately one-sided. Kept short and
 * explicit ON PURPOSE — an allow-list is where a gate goes to die, so each addition has to be
 * argued in this comment before it is added below. */
const GUEST_ONLY_OK = {
  id:     "stamped by remotePrompt() (orchestrator.js), not by ask() — it is the round-trip's own identifier",
  seat:   "stamped by remotePrompt() alongside id, and read by watchPrompt BEFORE the ask branch to decide whose prompt this is",
  battle: "sent by the OTHER kind:\"ask\" payload — the battle prompt (orchestrator.js's runBattle path) — which renders a scoreboard, not this button row",
};
const HOST_ONLY_OK = {
  // (empty today. A field ask() sends that the guest never reads is ALWAYS a bug — that is six of
  // the seven above. If one ever belongs here, it needs a sentence, not an entry.)
};

/* A VACUITY FLOOR. If either extraction comes back nearly empty the source moved and this gate is
 * reading nothing — which would otherwise report a clean run over an empty set, the exact shape of
 * check this project has shipped before and had to withdraw. */
const MIN_FIELDS = 8;

const mk = (name) => ({ name, ok: true, failures: [], notes: [] });
const fail = (res, msg) => { res.ok = false; res.failures.push(msg); };
const note = (res, msg) => { res.notes.push(msg); };
const read = (root, rel) => {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
};

/* Comments blanked, newlines kept, quote- and regex-literal-aware. Lifted verbatim from
 * scripts/seat_arg_check.js — including its regex-literal skip, which exists because this very
 * source contains `/"/g` in an HTML escaper and a naive read opens a string on that lone quote. */
function stripComments(src) {
  let out = "", i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (quote) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && d !== "/" && d !== "*" && /[([{=,;:!&|?+\-*%~^<>]$|\breturn$|\btypeof$/.test(out.trimEnd())) {
      out += c; i++;
      let cls = false;
      for (; i < src.length; i++) {
        const e = src[i];
        out += e === "\n" ? "\n" : e;
        if (e === "\\") { i++; if (i < src.length) out += src[i]; continue; }
        if (e === "[") cls = true;
        else if (e === "]") cls = false;
        else if (e === "/" && !cls) { i++; break; }
        else if (e === "\n") break;
      }
      continue;
    }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2), stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === "\n" ? "\n" : " ";
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* Balance brackets from an opening one, skipping strings and template literals whole. Returns the
 * index of the matching close, or -1. */
function matchBracket(src, openIdx) {
  let depth = 0, quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === "\\") { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* Slice a named top-level function: from its header to the next top-level `export ` (column 0), or
 * end of file. Located by CONTENT, never by line number, so a line shift makes this go loud rather
 * than silently reading the wrong region. */
function sliceFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  const j = src.indexOf("\nexport ", i + header.length);
  return src.slice(i, j < 0 ? src.length : j);
}

/* The top-level key names of an object literal, INCLUDING ES6 shorthand (`{kind:"ask",msg,...}` —
 * `msg` is a field on the wire exactly as much as `kind` is, and reading only `name:` pairs would
 * silently drop it). A key counts only where a key can legally start: right after the opening
 * brace or a comma at depth 1. That is what keeps the `:null` of a depth-1 ternary
 * (`colors?colors.map(...):null`) from registering as a field named after whatever preceded it. */
function payloadKeys(literal) {
  const out = [];
  let depth = 0, quote = null;
  for (let i = 0; i < literal.length; i++) {
    const c = literal[i];
    if (quote) { if (c === "\\") { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; continue; }
    if (c === "}" || c === ")" || c === "]") { depth--; continue; }
    if (depth !== 1 || !/[A-Za-z_$]/.test(c)) continue;
    const m = /^([A-Za-z_$][\w$]*)\s*[:,}]/.exec(literal.slice(i));
    if (!m) continue;
    let k = i - 1;
    while (k >= 0 && /\s/.test(literal[k])) k--;
    if (literal[k] === "{" || literal[k] === ",") out.push(m[1]);
    i += m[1].length - 1;
  }
  return out;
}

/* ================= the assertion ================= */
export function checkPromptFieldParity(root) {
  const res = mk("assertion 1 — prompt wire-field parity (ask()'s payload vs watchPrompt's ask branch)");

  const utilRaw = read(root, UTIL_REL);
  const orchRaw = read(root, ORCH_REL);
  const flowRaw = read(root, FLOW_REL);
  if (utilRaw === null) { fail(res, `PARITY-FIELD: ${UTIL_REL} is missing — the host's prompt payload has nothing to read.`); return res; }
  if (orchRaw === null) { fail(res, `PARITY-FIELD: ${ORCH_REL} is missing — the guest's prompt reader has nothing to read.`); return res; }
  const util = stripComments(utilRaw), orch = stripComments(orchRaw);
  const flow = flowRaw === null ? "" : stripComments(flowRaw);

  /* ---- (A) the wire ---- */
  const askFn = sliceFn(util, "export function ask(");
  if (!askFn) { fail(res, `PARITY-FIELD: ask() was not located in ${UTIL_REL} — if it was renamed, re-anchor this gate; do NOT delete the assertion.`); return res; }

  const callI = askFn.indexOf("onRemotePrompt(seat,{");
  if (callI < 0) { fail(res, `PARITY-FIELD: ask() in ${UTIL_REL} no longer flattens a prompt onto the wire via onRemotePrompt(seat,{...}) — there is no payload to compare, so this gate cannot pass. Re-anchor it rather than deleting it.`); return res; }
  const open = askFn.indexOf("{", callI + "onRemotePrompt(seat".length);
  const close = matchBracket(askFn, open);
  if (close < 0) { fail(res, `PARITY-FIELD: ask()'s remote payload literal in ${UTIL_REL} does not close — this gate could not read it.`); return res; }
  const hostFields = new Set(payloadKeys(askFn.slice(open, close + 1)));

  const wp = sliceFn(orch, "export function watchPrompt(");
  if (!wp) { fail(res, `PARITY-FIELD: watchPrompt() was not located in ${ORCH_REL} — if it was renamed, re-anchor this gate; do NOT delete the assertion.`); return res; }
  const branchI = wp.indexOf('if(p.kind==="ask")');
  if (branchI < 0) { fail(res, `PARITY-FIELD: watchPrompt() in ${ORCH_REL} has no kind==="ask" branch — the guest is not rendering ask prompts at all, or this gate is reading the wrong region. Either way it must FAIL rather than pass over an absent branch.`); return res; }
  const bOpen = wp.indexOf("{", branchI + 'if(p.kind==="ask")'.length - 1);
  const bClose = matchBracket(wp, bOpen);
  if (bClose < 0) { fail(res, `PARITY-FIELD: watchPrompt()'s ask branch in ${ORCH_REL} does not close — this gate could not read it.`); return res; }
  const branch = wp.slice(branchI, bClose + 1);
  const guestFields = new Set([...branch.matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));

  if (hostFields.size < MIN_FIELDS) fail(res, `PARITY-FIELD-VACUITY: only ${hostFields.size} field(s) read out of ask()'s payload in ${UTIL_REL} (expected at least ${MIN_FIELDS}) — this gate is reading almost nothing, so its PASS would mean nothing.`);
  if (guestFields.size < MIN_FIELDS) fail(res, `PARITY-FIELD-VACUITY: only ${guestFields.size} p.<field> read(s) found in watchPrompt's ask branch in ${ORCH_REL} (expected at least ${MIN_FIELDS}) — this gate is reading almost nothing, so its PASS would mean nothing.`);

  for (const f of [...hostFields].sort()) {
    if (guestFields.has(f) || f in HOST_ONLY_OK) continue;
    fail(res, `PARITY-FIELD: ask() (${UTIL_REL}) SENDS "${f}" and watchPrompt's ask branch (${ORCH_REL}) never reads p.${f} — the host renders this prompt with that field and the guest renders it without. That is how disabled, why, back, flipIdx, stage, shorts and seats each shipped broken. Read it on the guest, or stop sending it.`);
  }
  for (const f of [...guestFields].sort()) {
    if (hostFields.has(f) || f in GUEST_ONLY_OK) continue;
    fail(res, `PARITY-FIELD: watchPrompt's ask branch (${ORCH_REL}) reads p.${f} and ask() (${UTIL_REL}) never sends "${f}" — the guest is reading a field that is never on the wire, so it silently falls back for every prompt. Send it, or stop reading it.`);
  }

  /* ---- (B) the builder ---- */
  const defs = (util.match(/export function optionButtonsHTML\(/g) || []).length;
  if (defs !== 1) {
    fail(res, `PARITY-BUILDER: ${defs} definition(s) of optionButtonsHTML in ${UTIL_REL}, expected exactly 1. Two definitions is two chances to disagree about what an option button is — the state 02.1-03 collapsed into one.`);
  }
  const callers = [
    [FLOW_REL, "export function localAsk(", "the host's own-seat renderer"],
    [ORCH_REL, "export function watchPrompt(", "the guest's remote-seat renderer"],
    [ORCH_REL, "export function watchDraftPrompt(", "the recipe-draft channel"],
  ];
  for (const [rel, header, what] of callers) {
    const src = rel === FLOW_REL ? flow : orch;
    const body = sliceFn(src, header);
    if (!body) { fail(res, `PARITY-BUILDER: ${header.replace("export function ", "").replace("(", "()")} was not located in ${rel} — re-anchor this gate rather than deleting the assertion.`); continue; }
    if (!/optionButtonsHTML\(/.test(body)) {
      fail(res, `PARITY-BUILDER: ${header.replace("export function ", "").replace("(", "()")} (${rel}, ${what}) does not call optionButtonsHTML() — it is building its own button markup again. Reading every field off the wire does not help if the row is then hand-assembled a second time; that is exactly the drift this phase removed.`);
    }
  }

  note(res, `wire fields — host sends ${hostFields.size}: ${[...hostFields].sort().join(", ")}`);
  note(res, `wire fields — guest reads ${guestFields.size}: ${[...guestFields].sort().join(", ")}`);
  note(res, `guest-only by design (allow-listed): ${Object.keys(GUEST_ONLY_OK).join(", ")}`);
  note(res, `optionButtonsHTML definitions: ${defs}; callers required: localAsk, watchPrompt, watchDraftPrompt`);
  return res;
}

/* ================= assertion 2 — the OTHER prompt channel =================
 * THIS GATE WAS AIMED AT ONE CHANNEL AND THERE ARE TWO. Assertion 1 above covers kind:"ask" — the
 * button-row prompt — and it is the channel all seven historic drifts happened on. But pickCell()
 * (src/ui/flow.js) sends a SECOND payload, kind:"pick", which is the sail window: the prompt every
 * captain answers on every turn of every voyage. Nothing was watching it, and it had already
 * drifted the same way: the guest's renderer had no .apSub, so the sail self-check's shout could
 * not reach a guest even in principle.
 *
 * Wyatt's standing instruction, 2026-08-20: "when a renderer has two callers, fix it in the ONE
 * place both pass through, and widen the parity gate so a second caller fails the build." The fix
 * went into sailPanelHTML(); this is the widening. Same shape as assertion 1 deliberately — a
 * reader who understands one understands both.
 *
 * The floor is lower (3, not 8) because this payload is genuinely small — kind, cells, msg, hint.
 * It still cannot pass over an empty read, which is the only thing a floor is for. */
const PICK_MIN_FIELDS = 3;
const PICK_GUEST_ONLY_OK = {
  id:     "stamped by remotePrompt() (orchestrator.js), not by pickCell() — the round-trip's own identifier",
  seat:   "stamped by remotePrompt() alongside id, and read by watchPrompt BEFORE the pick branch to decide whose prompt this is",
  kind:   "the discriminant itself — read to choose this branch, never a field the renderer draws",
};
export function checkSailFieldParity(root) {
  const res = mk('assertion 2 — sail wire-field parity (pickCell\'s kind:"pick" payload vs watchPrompt\'s pick branch)');
  const flowRaw = read(root, FLOW_REL);
  const orchRaw = read(root, ORCH_REL);
  if (flowRaw === null) { fail(res, `PARITY-SAIL: ${FLOW_REL} is missing — the host's sail payload has nothing to read.`); return res; }
  if (orchRaw === null) { fail(res, `PARITY-SAIL: ${ORCH_REL} is missing — the guest's sail reader has nothing to read.`); return res; }
  const flow = stripComments(flowRaw), orch = stripComments(orchRaw);

  /* ---- (A) the wire ---- */
  const pickI = flow.indexOf('{kind:"pick"');
  if (pickI < 0) { fail(res, `PARITY-SAIL: no {kind:"pick"...} payload found in ${FLOW_REL} — the sail window is not being sent to remote captains at all, or this gate is reading the wrong region. Re-anchor it rather than deleting it.`); return res; }
  const pClose = matchBracket(flow, pickI);
  if (pClose < 0) { fail(res, `PARITY-SAIL: the kind:"pick" payload literal in ${FLOW_REL} does not close — this gate could not read it.`); return res; }
  const hostFields = new Set(payloadKeys(flow.slice(pickI, pClose + 1)));

  /* ---- (B) the guest ---- */
  const wp = sliceFn(orch, "export function watchPrompt(");
  if (!wp) { fail(res, `PARITY-SAIL: watchPrompt() was not located in ${ORCH_REL} — if it was renamed, re-anchor this gate; do NOT delete the assertion.`); return res; }
  const bI = wp.indexOf('if(p.kind==="pick")');
  if (bI < 0) { fail(res, `PARITY-SAIL: watchPrompt() in ${ORCH_REL} has no kind==="pick" branch — a guest cannot be shown a sail window at all, or this gate is reading the wrong region. Either way it must FAIL rather than pass over an absent branch.`); return res; }
  const bOpen = wp.indexOf("{", bI + 'if(p.kind==="pick")'.length - 1);
  const bClose = matchBracket(wp, bOpen);
  if (bClose < 0) { fail(res, `PARITY-SAIL: watchPrompt()'s pick branch in ${ORCH_REL} does not close — this gate could not read it.`); return res; }
  const guestFields = new Set([...wp.slice(bI, bClose + 1).matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));

  if (hostFields.size < PICK_MIN_FIELDS) fail(res, `PARITY-SAIL-VACUITY: only ${hostFields.size} field(s) read out of the kind:"pick" payload in ${FLOW_REL} (expected at least ${PICK_MIN_FIELDS}) — this gate is reading almost nothing, so its PASS would mean nothing.`);
  if (guestFields.size < PICK_MIN_FIELDS) fail(res, `PARITY-SAIL-VACUITY: only ${guestFields.size} p.<field> read(s) found in watchPrompt's pick branch in ${ORCH_REL} (expected at least ${PICK_MIN_FIELDS}) — this gate is reading almost nothing, so its PASS would mean nothing.`);

  for (const f of [...hostFields].sort()) {
    if (f === "kind" || guestFields.has(f)) continue;
    fail(res, `PARITY-SAIL: pickCell() (${FLOW_REL}) SENDS "${f}" on the sail payload and watchPrompt's pick branch (${ORCH_REL}) never reads p.${f} — the captain on this device sees that field and a remote captain does not. That is exactly how the self-check's shout stayed host-only. Read it on the guest, or stop sending it.`);
  }
  for (const f of [...guestFields].sort()) {
    if (hostFields.has(f) || f in PICK_GUEST_ONLY_OK) continue;
    fail(res, `PARITY-SAIL: watchPrompt's pick branch (${ORCH_REL}) reads p.${f} and pickCell() (${FLOW_REL}) never sends "${f}" — the guest is reading a field that is never on the wire, so it silently falls back on every sail prompt. Send it, or stop reading it.`);
  }

  /* ---- (C) ONE renderer, so the markup cannot drift the way the fields did ----
     RE-ANCHORED 02.15-02 Task 3 (THE TRACER). localPickCell and remotePickHighlights used to be
     the TWO ORCHESTRATIONS that each built the sail card through sailPanelHTML — a comparison of
     "do both callers use the shared builder?" With THE TRACER they converged into ONE renderer,
     renderPickPrompt, named directly by localPickCell (the local response mechanism, which no
     longer touches sailPanelHTML itself) and by watchPrompt's pick branch. With one renderer left
     there is NOTHING TO COMPARE — a two-name check would pass vacuously forever the moment the
     second name stopped existing (T-02.15-06). Replaced with a COUNT: exactly one definition of
     sailPanelHTML, exactly one definition of renderPickPrompt, renderPickPrompt's body builds the
     card through sailPanelHTML, and sailPanelHTML is CALLED from exactly one place in flow.js. A
     synthetic tree where a second caller hand-builds the sail card must go RED — see drills
     2e/2f below, and the count must go UP, not stay flat. */
  const defs = (flow.match(/export function sailPanelHTML\s*\(/g) || []).length;
  if (defs !== 1) fail(res, `PARITY-SAIL-BUILDER: expected exactly 1 definition of sailPanelHTML() in ${FLOW_REL}, found ${defs}. The ONE sail renderer must build its card from ONE function or the markup drifts again — the guest's card had no .apSub for exactly this reason.`);

  const rppDefs = (flow.match(/export function renderPickPrompt\s*\(/g) || []).length;
  if (rppDefs !== 1) fail(res, `PARITY-SAIL-BUILDER: expected exactly 1 definition of renderPickPrompt() in ${FLOW_REL}, found ${rppDefs} — the converged renderer either does not exist or has been duplicated, both of which reopen the two-orchestrations fault.`);

  const rppBody = sliceFn(flow, "export function renderPickPrompt(");
  if (!rppBody) {
    fail(res, `PARITY-SAIL-BUILDER: renderPickPrompt() was not located in ${FLOW_REL} — re-anchor this gate rather than deleting it.`);
  } else if (!/sailPanelHTML\s*\(/.test(rppBody)) {
    fail(res, `PARITY-SAIL-BUILDER: renderPickPrompt() in ${FLOW_REL} does not build its card through sailPanelHTML() — it is hand-writing the sail card again, which is the second copy this assertion exists to stop.`);
  }

  // The one-caller count. Total mentions of `sailPanelHTML(` minus its own `export function`
  // definition is the number of CALL SITES — must be exactly 1, or a second orchestration is
  // hand-building the sail card again and the count alone proves it.
  const totalSailPanelMentions = (flow.match(/sailPanelHTML\(/g) || []).length;
  const sailPanelCallSites = totalSailPanelMentions - (defs >= 1 ? defs : 0);
  if (sailPanelCallSites !== 1) fail(res, `PARITY-SAIL-BUILDER: sailPanelHTML( is called from ${sailPanelCallSites} place(s) in ${FLOW_REL}, expected exactly 1 (renderPickPrompt). With one converged renderer there is nothing left to keep in step if a second caller reappears.`);

  note(res, `sail payload fields: ${[...hostFields].sort().join(", ")}`);
  return res;
}

/* ================= assertion 4 — THE THIRD PROMPT CHANNEL: the bake =================
 * 04-01 Task 2 (MP-04) gave the bake-off a remote branch. bakeoffPrompt() (src/ui/flow.js) now
 * sends a THIRD payload, kind:"bake", and watchPrompt() rebuilds a bench out of it. That is one
 * more pair of code that has to agree about a field set, and the ONLY reason it does not have to
 * be kept in step by hand is that both sides hand the same shape to the same choreography
 * function — but nothing enforced the SHAPE until this assertion.
 *
 * WHY IT IS WORTH ADDING RATHER THAN TRUSTING THE SHARED FUNCTION. The seven historic drifts on
 * the ask channel all happened while both sides already called shared BUILDERS. A shared builder
 * cannot police the wire, because the guest can only pass along a field it actually read off the
 * payload — that sentence is this file's own header, and it is exactly as true here. Drop `locked`
 * on the guest and a captain's earned crates come back unlocked, silently, on their second attempt.
 *
 * Same shape as assertions 1 and 2, deliberately. The floor is 4: order, before, swaps, locked are
 * the minimum a bench cannot be drawn without. */
const BAKE_MIN_FIELDS = 4;
const BAKEOFF_REL = "src/ui/bakeoff.js";   // where the ONE choreography lives
const BAKE_GUEST_ONLY_OK = {
  id:     "stamped by remotePrompt() (orchestrator.js), not by bakeoffPrompt() — the round-trip's own identifier",
  seat:   "stamped by remotePrompt() alongside id; the bake branch also uses it to name whose purse to redraw (MP-06)",
  kind:   "the discriminant itself — read to choose this branch, never a field the renderer draws",
};
// Sent for the HOST's own bookkeeping and deliberately not read back off the wire by the sender's
// own branch. Each needs a reason, exactly like the ask channel's allow-list.
const BAKE_HOST_ONLY_OK = {
  coins:  "READ on the guest as p.coins for the optimistic purse (MP-06). Listed here only because a future host-side field would need a reason, not an omission.",
};
export function checkBakeFieldParity(root) {
  const res = mk('assertion 4 — bake wire-field parity (bakeoffPrompt\'s kind:"bake" payload vs watchPrompt\'s bake branch)');
  const flowRaw = read(root, FLOW_REL);
  const orchRaw = read(root, ORCH_REL);
  if (flowRaw === null) { fail(res, `PARITY-BAKE: ${FLOW_REL} is missing — the host's bake payload has nothing to read.`); return res; }
  if (orchRaw === null) { fail(res, `PARITY-BAKE: ${ORCH_REL} is missing — the guest's bake reader has nothing to read.`); return res; }
  const flow = stripComments(flowRaw), orch = stripComments(orchRaw);

  /* ---- (A) the wire ---- */
  const bI = flow.indexOf('{kind:"bake"');
  if (bI < 0) { fail(res, `PARITY-BAKE: no {kind:"bake"...} payload found in ${FLOW_REL} — a remote captain is not being sent their own bench at all, which is the state measured on 2026-08-23 where the HOST played the guest's bake on its own screen. Re-anchor this gate rather than deleting it.`); return res; }
  const bClose = matchBracket(flow, bI);
  if (bClose < 0) { fail(res, `PARITY-BAKE: the kind:"bake" payload literal in ${FLOW_REL} does not close — this gate could not read it.`); return res; }
  const hostFields = new Set(payloadKeys(flow.slice(bI, bClose + 1)));

  /* ---- (B) the guest ---- */
  const wp = sliceFn(orch, "export function watchPrompt(");
  if (!wp) { fail(res, `PARITY-BAKE: watchPrompt() was not located in ${ORCH_REL} — if it was renamed, re-anchor this gate; do NOT delete the assertion.`); return res; }
  const gI = wp.indexOf('if(p.kind==="bake")');
  const gI2 = gI < 0 ? wp.indexOf('else if(p.kind==="bake")') : gI;
  const at = gI2 < 0 ? wp.indexOf('p.kind==="bake"') : gI2;
  if (at < 0) { fail(res, `PARITY-BAKE: watchPrompt() in ${ORCH_REL} has no kind==="bake" branch — a remote captain cannot be shown their own bench at all. It must FAIL rather than pass over an absent branch.`); return res; }
  const gOpen = wp.indexOf("{", at + 'p.kind==="bake"'.length);
  const gClose = matchBracket(wp, gOpen);
  if (gClose < 0) { fail(res, `PARITY-BAKE: watchPrompt()'s bake branch in ${ORCH_REL} does not close — this gate could not read it.`); return res; }
  const guestFields = new Set([...wp.slice(at, gClose + 1).matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));

  if (hostFields.size < BAKE_MIN_FIELDS) fail(res, `PARITY-BAKE-VACUITY: only ${hostFields.size} field(s) read out of the kind:"bake" payload in ${FLOW_REL} (expected at least ${BAKE_MIN_FIELDS}) — this gate is reading almost nothing, so its PASS would mean nothing.`);
  if (guestFields.size < BAKE_MIN_FIELDS) fail(res, `PARITY-BAKE-VACUITY: only ${guestFields.size} p.<field> read(s) found in watchPrompt's bake branch in ${ORCH_REL} (expected at least ${BAKE_MIN_FIELDS}) — this gate is reading almost nothing, so its PASS would mean nothing.`);

  for (const f of [...hostFields].sort()) {
    if (f === "kind" || guestFields.has(f) || f in BAKE_HOST_ONLY_OK) continue;
    fail(res, `PARITY-BAKE: bakeoffPrompt() (${FLOW_REL}) SENDS "${f}" on the bake payload and watchPrompt's bake branch (${ORCH_REL}) never reads p.${f} — the captain on this device gets that fact about their bench and a remote captain does not. Drop "locked" and a captain's earned crates come back unlocked on their second attempt, silently. Read it on the guest, or stop sending it.`);
  }
  for (const f of [...guestFields].sort()) {
    if (hostFields.has(f) || f in BAKE_GUEST_ONLY_OK) continue;
    fail(res, `PARITY-BAKE: watchPrompt's bake branch (${ORCH_REL}) reads p.${f} and bakeoffPrompt() (${FLOW_REL}) never sends "${f}" — the guest is reading a field that is never on the wire, so it silently falls back on every remote bake. Send it, or stop reading it.`);
  }

  /* ---- (C) ONE choreography, named DIRECTLY by both tiers ----
     The thing that makes the two benches agree is that they are the same function reading the same
     object (rule 23). A guest-only wrapper would satisfy the field check above and reintroduce the
     two-orchestrations fault underneath it, so: exactly one definition of playBakeoffLive, and both
     bakeoffPrompt and watchPrompt's bake branch must NAME IT. */
  const bakeoffRaw = read(root, BAKEOFF_REL);
  if (bakeoffRaw === null) {
    fail(res, `PARITY-BAKE-BUILDER: ${BAKEOFF_REL} is missing — the choreography this whole channel converges on cannot be counted, and this assertion must not pass over a tree it cannot read.`);
  } else {
    const hits = (n) => (n.match(/export async function playBakeoffLive\s*\(/g) || []).length;
    const pblDefs = hits(flow) + hits(stripComments(bakeoffRaw));
    if (pblDefs !== 1) fail(res, `PARITY-BAKE-BUILDER: expected exactly 1 definition of playBakeoffLive(), found ${pblDefs}. Two choreographies is two chances for a baker's screen and a watcher's to disagree about the same shuffle.`);
  }
  const bp = sliceFn(flow, "export async function bakeoffPrompt(");
  if (!bp) fail(res, `PARITY-BAKE-BUILDER: bakeoffPrompt() was not located in ${FLOW_REL} — re-anchor this gate rather than deleting it.`);
  else if (!/playBakeoffLive\s*\(/.test(bp)) fail(res, `PARITY-BAKE-BUILDER: bakeoffPrompt() does not name playBakeoffLive() — the local branch is running something else.`);
  if (!/playBakeoffLive\s*\(/.test(wp.slice(at, gClose + 1))) fail(res, `PARITY-BAKE-BUILDER: watchPrompt's bake branch does not name playBakeoffLive() DIRECTLY. A guest-only wrapper is exactly what stops the orchestration parity gate seeing a convergence — name the choreography function.`);

  note(res, `bake payload fields: ${[...hostFields].sort().join(", ")}`);
  note(res, `guest reads: ${[...guestFields].sort().join(", ")}`);
  return res;
}

/* ================= assertion 3 — THE STANDING STATIC SOLO GUARD =================
 * 02.15-02-PLAN.md Task 3, action item 8 (T-02.15-06 / 02.15-VALIDATION.md's Wave 0 gap): the
 * highest-severity failure mode in the whole pick-channel conversion is the LOCAL render-and-resolve
 * path reaching a Firebase prompt writer. netSetPrompt (src/net/writers.js) is a bare db.ref(...)
 * with NO null guard, and runLiveNet() drives solo and pass-and-play too (the host fork is
 * `if(appState.isHost)`, true in solo, where appState.db is null) — so the very first sail prompt of
 * a solo game throws, and a two-tab crew check cannot see this by construction (it always has a
 * room). This assertion was RUN ONCE, by hand, as a one-off `node -e` embedded in the PLAN's own
 * <verify> block during Task 3's execution, and never persisted into a committed, drillable gate —
 * 02.15-REVIEW.md WR-01. This is that persistence.
 *
 * WHAT IT DECLARES: the functions that make up the pick channel's LOCAL render-and-resolve path —
 * renderPickPrompt() (the shared renderer) and localPickCell() (the local response mechanism that
 * wraps it). Comment-stripped, neither may reference any Firebase prompt writer or publisher.
 *
 * STATED LIMIT, IN THE ASSERTION'S OWN HEADER, so nobody mistakes a green run for more than it is:
 * a static scan proves the CALL IS NOT WRITTEN. It cannot prove a solo game RUNS — that proof is a
 * driven whole solo voyage, and it stays manual, exactly as 02.15-01 accepted and 02.15-02 wrote
 * down instead of assumed.
 *
 * ANTI-VACUITY: if neither declared function can be located, this FAILS rather than passing over a
 * tree it cannot parse — the same posture assertion 6 of scripts/host_guest_parity_check.js takes for
 * an unrecognisable listener set.
 */
const LOCAL_PICK_PATH_FNS = ["renderPickPrompt", "localPickCell"];
const FIREBASE_PROMPT_WRITER_RE = /\b(netSetPrompt|netRemovePrompt|netSetResponse|remotePrompt|onRemotePrompt)\b/;

// Brace-matched function-body slice, located by CONTENT not line number — mirrors fnBody() in
// scripts/host_guest_parity_check.js's assertion 6, which this assertion is the sibling of.
function fnBody(src, name) {
  const header = `export function ${name}(`;
  const i = src.indexOf(header);
  if (i < 0) return null;
  const st = src.indexOf("{", i);
  if (st < 0) return null;
  const end = matchBracket(src, st);
  return end < 0 ? null : src.slice(st, end + 1);
}

export function checkSoloGuard(root) {
  const res = mk("assertion 3 — the standing static solo guard: the local pick-channel path never references a Firebase prompt writer (02.15-02 Task 3 item 8)");
  const flowRaw = read(root, FLOW_REL);
  if (flowRaw === null) { fail(res, `PARITY-SOLOGUARD: ${FLOW_REL} is missing — the local render-and-resolve path has nothing to scan.`); return res; }
  const flow = stripComments(flowRaw);

  let located = 0;
  for (const name of LOCAL_PICK_PATH_FNS) {
    const body = fnBody(flow, name);
    if (!body) {
      fail(res, `PARITY-SOLOGUARD: ${name}() was not located in ${FLOW_REL} — the local render-and-resolve path this guard declares does not exist where expected. Re-anchor this assertion rather than deleting it; a static check that cannot find its subject must not pass silently.`);
      continue;
    }
    located++;
    const m = body.match(FIREBASE_PROMPT_WRITER_RE);
    if (m) {
      fail(res, `PARITY-SOLOGUARD: ${name}() (${FLOW_REL}) references ${m[1]} — the LOCAL render-and-resolve path must never reach a Firebase prompt writer or publisher. netSetPrompt (src/net/writers.js) is a bare db.ref(...) with NO null guard, and a solo/pass-and-play game has appState.db===null; the first sail prompt this reaches throws and a captain cannot take their turn.`);
    }
  }
  if (located === 0) { fail(res, `PARITY-SOLOGUARD-VACUITY: none of the ${LOCAL_PICK_PATH_FNS.length} declared local-path functions (${LOCAL_PICK_PATH_FNS.join(", ")}) were found in ${FLOW_REL} — refusing to report a guard against a tree it cannot parse.`); return res; }

  note(res, `local render-and-resolve path scanned: ${LOCAL_PICK_PATH_FNS.join(", ")} (${located}/${LOCAL_PICK_PATH_FNS.length} located), comment-stripped — none reference netSetPrompt | netRemovePrompt | netSetResponse | remotePrompt | onRemotePrompt`);
  note(res, `LIMIT: this is a static scan. It proves the call is not WRITTEN; it cannot prove a solo game RUNS — that proof is a driven whole solo voyage, and it stays manual.`);
  return res;
}

function runAll(root, { quiet = false } = {}) {
  const log = quiet ? () => {} : (s) => console.log(s);
  const a1 = checkPromptFieldParity(root);
  log(`${a1.ok ? "PASS" : "FAIL"} ${a1.name}`);
  for (const n of a1.notes) log(`      ${n}`);
  const a2 = checkSailFieldParity(root);
  log(`${a2.ok ? "PASS" : "FAIL"} ${a2.name}`);
  for (const n of a2.notes) log(`      ${n}`);
  const a3 = checkSoloGuard(root);
  log(`${a3.ok ? "PASS" : "FAIL"} ${a3.name}`);
  for (const n of a3.notes) log(`      ${n}`);
  const a4 = checkBakeFieldParity(root);
  log(`${a4.ok ? "PASS" : "FAIL"} ${a4.name}`);
  for (const n of a4.notes) log(`      ${n}`);
  return [a1, a2, a3, a4];
}

/* ================= --drill: prove the assertion CAN fail ================= */
// Copies the REAL src into a disposable tree under os.tmpdir(), applies ONE synthetic violation at
// a time, and runs the SAME check function against it. Never touches the real src/ — every write
// below is rooted at tmpRoot, and the real tree is only ever READ.
function drill() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pp4-promptfield-drill-"));
  let allOk = true;

  const realUtil = fs.readFileSync(path.join(REAL_ROOT, UTIL_REL), "utf8");
  const realOrch = fs.readFileSync(path.join(REAL_ROOT, ORCH_REL), "utf8");
  const realFlow = fs.readFileSync(path.join(REAL_ROOT, FLOW_REL), "utf8");
  // 04-01 Task 2: assertion 4 part (C) counts playBakeoffLive across flow.js AND bakeoff.js, so the
  // disposable tree has to carry bakeoff.js too. Without it every bake drill failed for the wrong
  // reason — a missing file, not the planted fault — which is a drill that proves nothing.
  const realBakeoff = fs.readFileSync(path.join(REAL_ROOT, BAKEOFF_REL), "utf8");

  const write = (rel, content) => {
    const full = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  // restore all three to the real, unmodified sources before each case
  const reset = () => { write(UTIL_REL, realUtil); write(ORCH_REL, realOrch); write(FLOW_REL, realFlow); write(BAKEOFF_REL, realBakeoff); };
  // a replacement that REFUSES to be a no-op — a drill whose surgery silently missed would report
  // the gate as broken (or, worse, as fine) for the wrong reason
  const surgery = (src, from, to) => {
    if (!src.includes(from)) { throw new Error(`drill surgery target not found in the real source: ${JSON.stringify(from.slice(0, 70))}`); }
    return src.replace(from, to);
  };
  const expect = (label, r, wantFail, marker) => {
    const ok = wantFail
      ? (!r.ok && (!marker || r.failures.some((f) => f.includes(marker))))
      : r.ok;
    console.log(`${ok ? "PASS" : "FAIL"} ${label} — expected ${wantFail ? "FAIL" : "PASS"}${marker ? ` naming ${marker}` : ""}, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!ok) allOk = false;
  };

  const SEND_SEATS = `seats:opts.map(o=>o&&o.seat!=null?o.seat:""),`;
  const READ_SEATS = `const seats=p.seats||[];`;

  // 1a — the host stops SENDING seats while the guest still reads it. This is the "added on one
  //      side only" half of the drift, in the direction a field is usually removed.
  reset();
  write(UTIL_REL, surgery(realUtil, SEND_SEATS, ``));
  expect("drill 1a (ask() stops sending `seats` while watchPrompt still reads it)", checkPromptFieldParity(tmpRoot), true, "never sends \"seats\"");

  // 1b — the mirror image: the field is on the wire and the guest never reads it. THIS is the
  //      direction all seven real drifts took, and the one a reviewer cannot see.
  reset();
  write(ORCH_REL, surgery(
    surgery(realOrch, READ_SEATS, ``),
    `seat:(seats[x.i]===""||seats[x.i]==null)?null:seats[x.i],`, ``));
  expect("drill 1b (watchPrompt stops reading p.seats while ask() still sends it)", checkPromptFieldParity(tmpRoot), true, `SENDS "seats"`);

  // 1c — ANTI-VACUITY. The guest's ask branch is gone entirely. The gate must FAIL rather than
  //      pass because it found nothing to compare — the shape of vacuous check this project has
  //      caught more than once, most recently inside 02.1-02's own red run.
  reset();
  write(ORCH_REL, surgery(realOrch, `if(p.kind==="ask"){`, `if(p.kind==="never-happens"){`));
  expect("drill 1c (anti-vacuity — no ask branch at all must FAIL, not silently pass)", checkPromptFieldParity(tmpRoot), true, "no kind===\"ask\" branch");

  // 1d — ANTI-VACUITY, the other side: ask() no longer flattens anything onto the wire.
  reset();
  write(UTIL_REL, surgery(realUtil, `onRemotePrompt(seat,{kind:"ask"`, `onRemotePromptRENAMED(seat,{kind:"ask"`));
  expect("drill 1d (anti-vacuity — no remote payload at all must FAIL)", checkPromptFieldParity(tmpRoot), true, "no payload to compare");

  // 1e — the wire is perfect and the HOST re-inlines its own button row. Part (A) alone would
  //      sail straight past this, which is why part (B) exists.
  reset();
  write(FLOW_REL, surgery(realFlow,
    `optionButtonsHTML(rest.map(x=>({i:x.i,label:x.o.label,cls:x.o.cls,disabled:x.o.disabled,why:x.o.why,seat:x.o.seat,color:colors&&colors[x.i]})))`,
    "rest.map(x=>`<button class=\"apBtn\" data-i=\"${x.i}\">${x.o.label}</button>`).join(\"\")"));
  expect("drill 1e (localAsk re-inlines its own button row — the wire is fine, the render forked)", checkPromptFieldParity(tmpRoot), true, "does not call optionButtonsHTML()");

  // 1f — two definitions of the shared builder. One shared function does not help if there are two.
  reset();
  write(UTIL_REL, realUtil + `\nexport function optionButtonsHTML(items){return "";}\n`);
  expect("drill 1f (a second optionButtonsHTML definition)", checkPromptFieldParity(tmpRoot), true, "expected exactly 1");

  // 1g — COMMENT BLANKING IS LOAD-BEARING. `seats` is deleted from the payload for real, and a
  //      comment mentioning it verbatim is left behind. A gate that cannot tell prose from code
  //      would read the comment as the field and pass. It must still FAIL, naming seats.
  reset();
  write(UTIL_REL, surgery(realUtil, SEND_SEATS, `/* the payload used to carry seats:opts.map(o=>o.seat) here */`));
  expect("drill 1g (a `seats:` named only in a COMMENT does not count as sent)", checkPromptFieldParity(tmpRoot), true, "never sends \"seats\"");

  /* ===== assertion 2's own red-proof — the SAIL channel =====
     Same discipline as 1a-1g: one synthetic violation at a time, and each must be caught BY NAME.
     A gate nobody has seen fail is a gate nobody has tested, and this one was written the same
     afternoon the drift it watches for was found. */

  // 2a — the host stops SENDING hint while the guest still reads it. This is the state the tree was
  //      in this morning, expressed as a drill: the self-check's shout composed for a local captain
  //      and nothing on the wire for a remote one.
  reset();
  write(FLOW_REL, surgery(realFlow, `,hint:bug||null}`, `}`));
  expect("drill 2a (sail payload stops sending hint)", checkSailFieldParity(tmpRoot), true, "never sends");

  // 2b — the reverse: the guest stops READING it. Identical damage, opposite side, and the reason
  //      this assertion is symmetric rather than one-directional.
  reset();
  write(ORCH_REL, surgery(realOrch, `renderPickPrompt({cells:p.cells||[],msg:p.msg,hint:p.hint||null},cell=>sendResponse(p.id,cell));`,
                                    `renderPickPrompt({cells:p.cells||[],msg:p.msg},cell=>sendResponse(p.id,cell));`));
  expect("drill 2b (guest's pick branch stops reading p.hint)", checkSailFieldParity(tmpRoot), true, "never reads p.hint");

  // 2c — RE-ANCHORED 02.15-02 Task 3 (THE TRACER): renderPickPrompt (the ONE converged renderer)
  //      hand-writes its own sail card instead of calling sailPanelHTML. The fields can all be
  //      present and correct and the card still not match what sailPanelHTML would have built,
  //      which is what .apSub was.
  reset();
  write(FLOW_REL, surgery(realFlow, `  panel(sailPanelHTML(spec.msg||sailPickMsg(appState.mySeat),spec.hint),true);`,
                                    `  panel(\`<div class="apMsg">\${spec.msg}</div>\`,true);`));
  expect("drill 2c (renderPickPrompt hand-writes the sail card again)", checkSailFieldParity(tmpRoot), true, "PARITY-SAIL-BUILDER");

  // 2d — the branch this gate reads disappears entirely. It must go LOUD, not quiet: a gate that
  //      passes over an absent branch is the reassuring-green failure docs/HARD-WON-LESSONS.md §3
  //      is about.
  reset();
  write(ORCH_REL, surgery(realOrch, `}else if(p.kind==="pick"){`, `}else if(p.kind==="nope"){`));
  expect("drill 2d (the guest's pick branch vanishes)", checkSailFieldParity(tmpRoot), true, "no kind===\"pick\" branch");

  // 2e — RE-ANCHORED (part C): renderPickPrompt vanishes entirely — anti-vacuity for the
  //      converged-renderer count, the same way 1c/1d red-proof assertion 1.
  reset();
  write(FLOW_REL, surgery(realFlow, `export function renderPickPrompt(spec,answer){`,
                                    `export function renderPickPromptRENAMED(spec,answer){`));
  expect("drill 2e (renderPickPrompt renamed out of existence)", checkSailFieldParity(tmpRoot), true, "renderPickPrompt() was not located");

  // 2f — A SECOND CALLER of sailPanelHTML reappears — the two-directors fault reborn on THIS
  //      channel, exactly as 2b of host_guest_parity_check.js's re-anchor tests for
  //      sailHighlightRect. The count must go UP and catch it, or this re-anchor weakened the
  //      gate instead of strengthening it (T-02.15-06).
  reset();
  write(FLOW_REL, realFlow + `\nexport function ghostPickRenderer(spec){return sailPanelHTML(spec.msg,spec.hint);}\n`);
  expect("drill 2f (a SECOND caller of sailPanelHTML reappears — the two-directors fault, reborn)", checkSailFieldParity(tmpRoot), true, "expected exactly 1");

  /* ===== assertion 3's own red-proof — THE STANDING STATIC SOLO GUARD (02.15-REVIEW WR-01) =====
     Same discipline as 1a-2f: one synthetic violation at a time, caught BY NAME. This is the check
     the PLAN required as Task 3 item 8 and that was run once by hand and never persisted — this
     drill is what makes it a STANDING gate rather than a one-off reading. */

  // 3a — renderPickPrompt (the shared renderer) grows a call to a Firebase prompt writer. This is
  //      the exact shape of the concrete failure scenario: a future "mirror the host's own prompt
  //      for spectators" refactor landing a write on the path a solo game (db===null) also takes.
  reset();
  write(FLOW_REL, surgery(realFlow, `appState.currentPrompt=spec;`, `appState.currentPrompt=spec;netSetPrompt(spec);`));
  expect("drill 3a (renderPickPrompt grows a call to netSetPrompt)", checkSoloGuard(tmpRoot), true, "netSetPrompt");

  // 3b — localPickCell (the local response mechanism) reaches a writer instead. Different function,
  //      same disease: the LOCAL path is the one a solo/pass-and-play game's db===null cannot survive.
  reset();
  write(FLOW_REL, surgery(realFlow, `const pre=ffEndNow();\n  if(pre)return pre.then(()=>localPickCell(p,spec));`,
                                    `const pre=ffEndNow();\n  if(pre)return pre.then(()=>localPickCell(p,spec));\n  remotePrompt(p,spec);`));
  expect("drill 3b (localPickCell grows a call to remotePrompt)", checkSoloGuard(tmpRoot), true, "remotePrompt");

  // 3c — ANTI-VACUITY: both declared local-path functions vanish. The guard must FAIL rather than
  //      pass over a tree it cannot parse — the same posture assertion 6 of
  //      scripts/host_guest_parity_check.js takes for an unrecognisable listener set.
  reset();
  write(FLOW_REL, surgery(
    surgery(realFlow, `export function renderPickPrompt(spec,answer){`, `export function renderPickPromptGONE(spec,answer){`),
    `export function localPickCell(p,spec){`, `export function localPickCellGONE(p,spec){`));
  expect("drill 3c (anti-vacuity — both local-path functions renamed away must FAIL, not silently pass)", checkSoloGuard(tmpRoot), true, "PARITY-SOLOGUARD");

  /* ===== assertion 4's own red-proof — THE BAKE CHANNEL (04-01 Task 2) =====
     Written the same night the channel was. A gate nobody has seen fail is a gate nobody has
     tested, and this one guards the shape of a two-minute interaction where a dropped field costs
     a captain crates they already earned. */

  // 4a — the host stops SENDING `locked`. This is the expensive one and the reason the assertion
  //      exists: `locked` is which crates the captain already won on an earlier attempt, and
  //      without it a remote captain's second attempt hands them back the whole bench.
  reset();
  write(FLOW_REL, surgery(realFlow, `    locked:p.bake.locked.slice(),\n`, ``));
  expect("drill 4a (bake payload stops sending locked)", checkBakeFieldParity(tmpRoot), true, 'never sends "locked"');

  // 4b — the reverse: the guest stops READING `swaps`, so a remote captain's crates never move and
  //      the puzzle is trivially solvable. Same damage, opposite side.
  reset();
  write(ORCH_REL, surgery(realOrch, `before:p.before||[],swaps:p.swaps||[],`, `before:p.before||[],swaps:[],`));
  expect("drill 4b (guest's bake branch stops reading p.swaps)", checkBakeFieldParity(tmpRoot), true, "never reads p.swaps");

  // 4c — the branch vanishes entirely: back to the measured 2026-08-23 state where the HOST played
  //      the guest's bake on its own screen. It must go LOUD, not quiet.
  reset();
  write(ORCH_REL, surgery(realOrch, `}else if(p.kind==="bake"){`, `}else if(p.kind==="nope"){`));
  expect("drill 4c (the guest's bake branch vanishes)", checkBakeFieldParity(tmpRoot), true, "no kind===\"bake\" branch");

  // 4d — the payload vanishes: the host stops offering a remote captain their own bench at all.
  reset();
  write(FLOW_REL, surgery(realFlow, `  const spec={kind:"bake",`, `  const spec={kind:"bakeXX",`));
  expect("drill 4d (the host stops sending a bake payload)", checkBakeFieldParity(tmpRoot), true, "no {kind:\"bake\"...} payload");

  // 4e — A GUEST-ONLY WRAPPER around the choreography. Every field can be present and correct and
  //      this still reopens the two-directors fault, because a wrapper is exactly what stops the
  //      orchestration parity gate seeing a convergence. Part (C) is what catches it.
  reset();
  write(ORCH_REL, surgery(realOrch, `playBakeoffLive(wireSpec,{onRewatch:spend,`,
                                    `guestBenchWrapper(wireSpec,{onRewatch:spend,`));
  expect("drill 4e (a guest-only wrapper replaces the named choreography)", checkBakeFieldParity(tmpRoot), true, "PARITY-BAKE-BUILDER");

  // 4f — a SECOND playBakeoffLive appears. Every field can be correct on both sides and the two
  //      benches still diverge, because there are now two things drawing them. The COUNT is what
  //      catches it — the same idiom 2f uses for sailPanelHTML.
  reset();
  write(BAKEOFF_REL, realBakeoff + `\nexport async function playBakeoffLive(spec){return null;}\n`);
  expect("drill 4f (a SECOND playBakeoffLive appears — two choreographies)", checkBakeFieldParity(tmpRoot), true, "expected exactly 1 definition of playBakeoffLive");

  // Z — negative control: the REAL, unmodified tree passes. Without this the drill only proves the
  //     gate can shout, not that it can ever be quiet.
  {
    const r = runAll(REAL_ROOT, { quiet: true });
    const ok = r.every((x) => x.ok);
    console.log(`${ok ? "PASS" : "FAIL"} drill Z (negative control — the REAL 4/ tree passes) — expected PASS, got ${ok ? "PASS" : "FAIL"}`);
    for (const x of r) for (const f of x.failures) console.log(`    ${f}`);
    if (!ok) allOk = false;
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\n${allOk ? "RED-PROOF DRILLED OK — 22 synthetic violations caught, real tree clean" : "DRILL FAILURE — the assertion did not fail against its own synthetic violation"}`);
  process.exit(allOk ? 0 : 1);
}

/* ================= Entry ================= */
// Guarded on being the MAIN module, for the reason host_guest_parity_check.js records: without it
// the entry block runs on IMPORT and process.exit()s before the caller's own code does, printing
// this gate's verdict where the caller's belongs — a false red-proof.
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!IS_MAIN) {
  // imported for reuse — nothing runs
} else if (process.argv.includes("--drill")) {
  drill();
} else {
  const results = runAll(REAL_ROOT);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("\nFAILURES:");
    for (const r of failed) for (const f of r.failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}
