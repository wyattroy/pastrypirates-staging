/* FORK 2 — THE ASK PROMPT HAS ONE RENDERER. Wave 1, 2026-08-28.
 *
 * DISPLAY-RULES fork 2: localAsk (the host's own prompt) and watchPrompt's ask branch (the
 * guest's) were two orchestrations of one drawn thing. The button MARKUP converged in 02.1-03
 * (optionButtonsHTML) and the slider in 05-01 — but the fork itself stood: who builds the panel,
 * stamps the stage, stashes the flip ceremony's words, wires the clicks. The flip half of that
 * gap put an EMPTY ceremony title on every guest for three phases.
 *
 * After this step, renderAskPrompt(spec, answer) in src/ui/flow.js is the ONE ask-class
 * renderer — renderPickPrompt's exact precedent: localAsk passes its promise resolver as
 * `answer`, watchPrompt passes sendResponse. Run RED against the pre-convergence tree.
 *
 * THE LANDMINES THIS GATE PINS (fork-2 map):
 *   · stage.js's `!fm && btl` "⚔️ Broadside!" fallback is load-bearing — the renderer must never
 *     stamp flipMsg for a battle prompt (battleAsk keeps producing fm===null).
 *   · the parity gate anchors on the NAME localAsk( — it stays, as the local response mechanism.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const flow = fs.readFileSync(path.join(REPO, "src/ui/flow.js"), "utf8");
const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
const stage = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
function fnBody(src, name) {
  const h = src.search(new RegExp(`(export )?(async )?function ${name}\\(`));
  if (h < 0) return null;
  let i = src.indexOf("{", h), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(i, j + 1);
}

/* 1. the one renderer exists and owns the ask-class panel build */
{
  const body = fnBody(flow, "renderAskPrompt");
  if (!body) fail("renderAskPrompt() does not exist in src/ui/flow.js");
  else {
    for (const piece of ["optionButtonsHTML(", "sliderWrapHTML", "wireSlider(", "backButtonHTML", "setFlipActive(", "panel("]) {
      if (!body.includes(piece)) fail(`renderAskPrompt() is missing ${piece} — a piece of the ask prompt one tier would lose`);
    }
    if (body.includes("optionButtonsHTML(") && body.includes("panel(")) pass("renderAskPrompt() builds the whole ask prompt (buttons, slider, back, flip, panel)");
    if (/flipMsg/.test(body)) {
      if (/battle/.test(body)) pass("renderAskPrompt() stamps flipMsg guarded against battle prompts (stage.js's ⚔️ Broadside! fallback survives)");
      else fail("renderAskPrompt() stamps flipMsg with no battle guard — a battle flip would lose its ⚔️ Broadside! title (stage.js `!fm && btl`)");
    } else fail("renderAskPrompt() never stamps flipMsg — the ceremony would have no words on either tier");
  }
}

/* 2. both tiers reach it, and neither builds the ask panel inline any more */
{
  const la = strip(fnBody(flow, "localAsk") || "");
  if (/renderAskPrompt\(/.test(la)) pass("localAsk() reaches renderAskPrompt (the local response mechanism, like localPickCell)");
  else fail("localAsk() does not reach renderAskPrompt");
  if (/optionButtonsHTML\(/.test(la)) fail("localAsk() still builds its own button row inline");
  else pass("localAsk(): no inline panel build");

  // watchPrompt's ask branch: the plain-ask render must go through the shared renderer.
  const wp = strip(fnBody(orch, "watchPrompt") || "");
  if (/renderAskPrompt\(/.test(wp)) pass("watchPrompt() names renderAskPrompt directly (the tracer — a guest-only wrapper would satisfy the eye and nothing else)");
  else fail("watchPrompt() does not reach renderAskPrompt — the guest still has its own ask orchestration");
  if (/optionButtonsHTML\(/.test(wp)) fail("watchPrompt() still builds its own button row inline beside the shared renderer");
  else pass("watchPrompt(): no inline ask-panel build");
}

/* 3. ONE emitter of the ask-class markup. The fork-2 map's own caution: when markup moves into a
      shared renderer, a region-comparison assertion goes vacuously green — so COUNT emitters
      instead. The draft channel (watchDraftPrompt) is fork 4/5's subject, counted there, not here. */
{
  const stripped = strip(flow) + strip(orch);
  const emitters = [...stripped.matchAll(/optionButtonsHTML\(/g)].length;
  // sanctioned: renderAskPrompt's one call, plus watchDraftPrompt's (fork 4/5, not this fork).
  if (emitters > 2) fail(`${emitters} optionButtonsHTML( call sites across flow+orchestrator — expected 2 (renderAskPrompt + the draft channel); a third is a new copy of the row`);
  else pass(`${emitters} optionButtonsHTML( call sites (the ask renderer + the draft channel)`);
}

/* 4. the battle fallback the renderer must not break */
{
  if (/!fm\s*&&\s*btl/.test(stage) || /btl\s*&&\s*!fm/.test(stage)) pass("stage.js's battle-flip title fallback (`!fm && btl`) is intact");
  else fail("stage.js's `!fm && btl` Broadside fallback is gone — verify the battle ceremony still has a title");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — one ask renderer, two response mechanisms");
process.exit(fails ? 1 : 0);
