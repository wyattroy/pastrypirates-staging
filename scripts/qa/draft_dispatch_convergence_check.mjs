/* FORKS 4 + 5 — ONE DRAFT DISPATCHER, WITH THE PUBLIC/PRIVATE SEAT SET OUTSIDE IT. W1, 2026-08-28.
 *
 * The two draft-channel forks mean OPPOSITE things in pass-and-play, and that is a PRODUCT
 * decision, not an implementation accident (the fork-4/5 map, and the handoff's one warning that
 * needed Wyatt rather than a session):
 *   · fork 4 (recipeDraftNet) shows EVERY seat in turn behind the pass-the-device gate, because
 *     recipe cards are SECRET — collapsing it leaks both of a seat's choices to the next player;
 *   · fork 5 (netIntroBarrier) shows ONE card for the whole table, because — Wyatt, 2026-08-08 —
 *     "Dont require passing to the next player for the opening narration… Just show those once."
 * A single dispatcher that handles one correctly handles the other wrongly — UNLESS the seat set
 * is computed BEFORE the dispatcher: public + pass-and-play → [first human]; private + pass-and-
 * play → every human seat walked SERIALLY behind passGate; networked → all human seats CONCURRENT
 * (local via localAsk, remote via the draft-prompt channel). That is what draftDispatch() is.
 * Run RED against the pre-convergence tree.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
const flow = fs.readFileSync(path.join(REPO, "src/ui/flow.js"), "utf8");

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
function fnBody(src, name) {
  let h = src.indexOf(`export function ${name}(`);
  if (h < 0) h = src.indexOf(`export async function ${name}(`);
  if (h < 0) return null;
  // the body's brace, not a destructured parameter's — start looking after the params close
  let i = src.indexOf("{", src.indexOf(")", h)), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(i, j + 1);
}

/* 1. the dispatcher exists, in flow.js (ui tier — fork 5 lives there and may not import the
      orchestrator; the remote leg rides the netHandlers seam, the map's own requirement) */
const body = fnBody(flow, "draftDispatch");
{
  if (!body) fail("draftDispatch() does not exist in src/ui/flow.js");
  else {
    if (/isPublic/.test(body)) pass("draftDispatch() takes the public/private distinction as an INPUT — the decision Wyatt made cannot be quietly deleted by convergence");
    else fail("draftDispatch() has no isPublic input — a single dispatcher that cannot tell a secret recipe card from a public intro handles one of them wrongly");
    if (/passGate\(/.test(body)) pass("draftDispatch() walks private pass-and-play seats behind passGate (serial — nobody's two recipe choices on screen for the seat that comes next)");
    else fail("draftDispatch() never calls passGate — the secret-draft leak (fork-4 map: optsFor renders BOTH of a seat's choices) is open");
    if (/decisionIsLocal\(/.test(body)) pass("draftDispatch() forks its networked leg on decisionIsLocal (Rule B), not seatLocal");
    else fail("draftDispatch() does not use decisionIsLocal — Rule B's wrong-predicate fault");
    if (/onRemoteDraftPrompt/.test(body)) pass("draftDispatch() reaches the remote seat through the netHandlers seam (flow.js may not import the orchestrator)");
    else fail("draftDispatch() has no onRemoteDraftPrompt leg — remote captains never get their card");
  }
}

/* 2. both forks feed it, and neither keeps its own branch pair */
{
  const f4 = strip(fnBody(orch, "recipeDraftNet") || "");
  if (/draftDispatch\(/.test(f4)) pass("recipeDraftNet() (fork 4) dispatches through draftDispatch");
  else fail("recipeDraftNet() does not reach draftDispatch — fork 4 still runs its own branch pair");
  const f5 = strip(fnBody(flow, "netIntroBarrier") || "");
  if (/draftDispatch\(/.test(f5)) pass("netIntroBarrier() (fork 5) dispatches through draftDispatch");
  else fail("netIntroBarrier() does not reach draftDispatch — fork 5 still runs its own branch pair");
  // the old inline shapes must be gone from the forks themselves
  if (/appState\.passAndPlay/.test(f4)) fail("recipeDraftNet() still branches on passAndPlay itself — the sequencing belongs to the dispatcher now");
  else pass("recipeDraftNet(): no inline pass-and-play branch");
  if (/appState\.passAndPlay/.test(f5)) fail("netIntroBarrier() still branches on passAndPlay itself");
  else pass("netIntroBarrier(): no inline pass-and-play branch");
}

/* 3. the intro barrier's call-site count is someone else's gate (extract_narration_lines asserts
      exactly 3) — assert here only that the barrier still exists and is exported. */
{
  if (/export async function netIntroBarrier\(/.test(flow)) pass("netIntroBarrier still exists and is exported (its 3 call sites are extract_narration_lines' assertion)");
  else fail("netIntroBarrier is gone or renamed — extract_narration_lines:939 asserts its 3 call sites by name");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — one draft dispatcher, the seat set decided outside it");
process.exit(fails ? 1 : 0);
