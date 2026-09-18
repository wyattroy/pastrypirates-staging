#!/usr/bin/env node
/* A PROMPT THAT HAS BEEN ANSWERED IS NOT STILL WAITING — AND THE BOX SAYS SO, IN ONE PLACE.
   Architecture item 9b (the tail item 9 parked; .planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on
   "architectural" (DECISIONS.md, 2026-09-16).

   THE FACT: when the screen a captain has just answered on stops being marked as waiting on them — `needsAction` on
   #actionPanel. It is not decoration. THE ONE NARRATOR REFUSES TO SAY A WORD WHILE IT IS UP (src/ui/util.js
   narrateEvent), and on the screen running the engine it never reaches the broadcast either, so a line lost there is
   lost for the whole table.

   THE FAULT IT HOLDS SHUT: the mark used to ride out on the box's CONTENT timer — `panel("")` defers its clear by
   CLEAR_GRACE_MS so a replacement one statement away can still fade (src/ui/panel.js), and the mark was in the
   deferred body. renderAskPrompt's `done` dropped it by hand one statement earlier; renderPickPrompt's teardown did
   not. Two prompt renderers, one fact, two answers — and the sail window was the one that got it wrong.
   MEASURED 2026-09-18, two windows, a real crew room through scripts/mp_rig.mjs (host 1200x950 + guest 375x812 dsf3
   touch), the same fight posed both ways round, twice each:
     the HOST flees (their square is picked on the machine running the engine) — "slips away!" said 0 times on the
       host AND 0 times on the guest, twice; the next thing either screen said was the crow's-nest settling, ~200ms
       after the tap. AFTER: "HostCap — ye slip away!" on the host 185ms after the tap, "HostCap slips away!" on the
       guest 60ms later.
     the GUEST flees (their square is picked remotely, so the host's box carries no mark) — said on both screens
       before and after, ~300ms after the tap. Unchanged: that path was never the broken one, and the asymmetry
       between the two is what named the cause.

   THE RULES (comment-stripped source; each red-proofed below against a copy of the real source broken the way it
   guards against, in memory):
     1. THE BOX DROPS THE MARK AT ONCE. In src/ui/panel.js, panel()'s clear branch says setNeedsAction(false) BEFORE
        it schedules anything, and the deferred body never mentions needsAction — while still doing the job the grace
        exists for (the content, the row collapse, pendingReveal/pendingStage).
     2. NO PROMPT SAYS IT A SECOND TIME. Nowhere in src/ does a setNeedsAction(false) sit beside a panel("") — the box
        is the one place that says it. (A prompt that draws NO box — a pure flip stage, the bake bench — still owns
        its own mark and is untouched by this: it has no panel("") beside it.)
     3. BOTH PROMPT RENDERERS LEAVE IT TO THE BOX. renderAskPrompt's `done` and renderPickPrompt's `teardown` each
        clear the box, and neither touches the mark.
     4. ONE WRITER OF THE CLASS. Only src/ui/panel.js adds/removes/toggles `needsAction` on a classList — with one
        named exception, pinned here so it cannot multiply or move unseen: the end-of-voyage collapse in
        src/ui/board.js showStats(), which this item may not edit (it is inside another session's no-touch zone).
     5. BEHAVIOURAL — THE REAL SOURCE, AGAINST A REAL FLIGHT'S REAL WORDS. panel()'s real clear branch and the real
        setNeedsAction are lifted from src/ui/panel.js and run against a stub DOM with the real CLEAR_GRACE_MS: the
        mark is down the instant the box is cleared (so the narrator would speak), the content still leaves on the
        grace, and the one narrator still reads the mark. The line at stake is taken from a real Game — a real
        Game.flee event worded by the real narration table — never typed in here.

   ON THE TREE BEFORE ITEM 9b, rules 1, 2, 3 and 5 are red (mutants 1 and 2 below are that tree). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { describeFor, NEUTRAL_VIEWER } = await import(pathToFileURL(path.join(REPO, "src/ui/util.js")).href);
const { appState } = await import(pathToFileURL(path.join(REPO, "src/state/index.js")).href);

const PANEL = "src/ui/panel.js", FLOW = "src/ui/flow.js", UTIL = "src/ui/util.js", BOARD = "src/ui/board.js";

/* a named function's text, header to matching brace (parameters skipped first — a default can carry braces) */
function fn(src, name) {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return "";
  let j = src.indexOf("(", m.index), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(m.index, k + 1); }
  return "";
}
/* the block that starts at `at` (which must sit on its opening brace's line), to its matching brace */
function blockFrom(src, at) {
  const j = src.indexOf("{", at); if (j < 0) return "";
  let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(at, k + 1); }
  return "";
}
/* the arrow assigned to `const <name>=` inside `text`, to its matching brace */
function arrow(text, name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*[^=]*=>\\s*\\{`).exec(text);
  return m ? blockFrom(text, m.index) : "";
}
const idxAll = (s, needle) => { const out = []; let i = 0; while ((i = s.indexOf(needle, i)) >= 0) { out.push(i); i += needle.length; } return out; };

/* THE LINE A FLIGHT HAS, TAKEN FROM A REAL GAME — never typed in here (rule 6: a fixture that cannot exist in the
   game proves nothing). A real 2-captain Game, two ships side by side on open water, both shots wild, the defender
   flees: Game.flee's own event, worded by the real narration table. */
function realFlightLine() {
  for (let s = 0; s < 80; s++) {
    const g = new Game(roundCfg(["bot", "bot"]), 9209 + s * 101, true);
    const n = g.cfg.grid, wet = c => !(g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c));
    for (let x = 1; x < n - 1; x++) for (let y = 1; y < n - 1; y++) {
      const a = [x, y], d = [x, y - 1];
      if (!wet(a) || !wet(d)) continue;
      const [att, def] = g.players;
      att.pos = a; def.pos = d;
      g.players.forEach(pl => { pl.done = false; pl.baking = false; pl.coins = 20; });
      def.ing = [g.ings[0]]; att.ing = [];
      if (!g.canAttack(att, def)) continue;
      g.flip = function (p, why) { p.flips++; if (why) this.ev({ t: "coinflip", p: p.idx, heads: 0, why }); return false; };
      const F = g.beginBattle(att, def); if (!F) continue;
      g.resolveRound(F, false, false);
      if (!g.mayFlee(F)) continue;
      const { evFlee } = g.flee(F, g.fleeSquares(def)[0]);
      appState.game = g;                                   // the narration table words an event against the live game
      const L = describeFor(evFlee, NEUTRAL_VIEWER);
      const txt = L && L.txt ? String(L.txt).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : null;
      if (txt) return { txt, evFlee };
    }
  }
  return { txt: null, evFlee: null };
}

function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const panel = S[PANEL] || "", flow = S[FLOW] || "", util = S[UTIL] || "", board = S[BOARD] || "";
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  const panelFn = fn(panel, "panel");
  const clearAt = panelFn.indexOf("if(!html){");
  const clearBranch = clearAt >= 0 ? blockFrom(panelFn, clearAt) : "";

  // 1. THE BOX DROPS THE MARK AT ONCE
  {
    const timerAt = clearBranch.indexOf("setTimeout(");
    const dropAt = clearBranch.indexOf("setNeedsAction(false)");
    const deferred = timerAt >= 0 ? clearBranch.slice(timerAt) : "";
    const graceKept = /innerHTML\s*=\s*""/.test(deferred) && /pendingReveal/.test(deferred) && /pendingStage/.test(deferred);
    const ok = !!clearBranch && timerAt > 0 && dropAt >= 0 && dropAt < timerAt && !/needsAction/.test(deferred) && graceKept;
    rule(ok,
      "panel()'s clear branch drops the mark at once — setNeedsAction(false) before it schedules anything — and the deferred body carries only the content, the row collapse and the reveal gates",
      "panel()'s clear branch does not drop the mark at once —"
      + `${clearBranch ? "" : " its `if(!html){` branch was not found (re-anchor);"}`
      + `${dropAt >= 0 ? "" : " it never says setNeedsAction(false);"}`
      + `${dropAt >= 0 && timerAt > 0 && dropAt > timerAt ? " it says it INSIDE the deferred body, so an answered prompt goes on claiming a decision for the whole clearing grace;" : ""}`
      + `${/needsAction/.test(deferred) ? " the deferred body still mentions needsAction;" : ""}`
      + `${graceKept ? "" : " the deferred body no longer clears the content / the reveal gates (the grace exists for those);"}`);
  }

  // 2. NO PROMPT SAYS IT A SECOND TIME
  {
    const bad = [];
    for (const [f, s] of Object.entries(S)) {
      // panel()'s own line IS the one place, so its own body is where the fact is allowed to live
      const own = f === PANEL ? fn(s, "panel") : "";
      const ownAt = own ? s.indexOf(own) : -1;
      for (const i of idxAll(s, "setNeedsAction(false)")) {
        if (ownAt >= 0 && i >= ownAt && i < ownAt + own.length) continue;
        const near = s.slice(Math.max(0, i - 200), i + 200);
        if (near.includes('panel("")')) bad.push(`${f}: …${s.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, " ").trim()}…`);
      }
    }
    rule(bad.length === 0,
      "no prompt drops the mark by hand beside a cleared box — the box is the one place that says it",
      `a second place drops the mark beside a cleared box: ${bad.slice(0, 3).join(" | ")}${bad.length > 3 ? ` (+${bad.length - 3} more)` : ""}`);
  }

  // 3. BOTH PROMPT RENDERERS LEAVE IT TO THE BOX
  {
    const ask = fn(flow, "renderAskPrompt"), pick = fn(flow, "renderPickPrompt");
    const done = arrow(ask, "done"), tear = arrow(pick, "teardown");
    const clean = t => !!t && t.includes('panel("")') && !/setNeedsAction\s*\(/.test(t);
    const ok = clean(done) && clean(tear);
    rule(ok,
      "renderAskPrompt's done and renderPickPrompt's teardown each clear the box and neither touches the mark",
      "a prompt renderer's teardown does not leave the mark to the box —"
      + `${done ? "" : " renderAskPrompt's `done` was not found (re-anchor);"}${tear ? "" : " renderPickPrompt's `teardown` was not found (re-anchor);"}`
      + `${done && !done.includes('panel("")') ? " renderAskPrompt's done does not clear the box;" : ""}${done && /setNeedsAction\s*\(/.test(done) ? " renderAskPrompt's done touches the mark itself;" : ""}`
      + `${tear && !tear.includes('panel("")') ? " renderPickPrompt's teardown does not clear the box;" : ""}${tear && /setNeedsAction\s*\(/.test(tear) ? " renderPickPrompt's teardown touches the mark itself;" : ""}`);
  }

  // 4. ONE WRITER OF THE CLASS
  {
    const WRITE = /classList\s*\.\s*(?:add|remove|toggle)\s*\(([^)]*)\)/g;
    const strays = [], boardHits = [];
    for (const [f, s] of Object.entries(S)) {
      if (f === PANEL) continue;
      let m; WRITE.lastIndex = 0;
      while ((m = WRITE.exec(s))) {
        if (!/needsAction/.test(m[1])) continue;
        if (f === BOARD) { boardHits.push(m.index); continue; }
        strays.push(`${f}: ${m[0].replace(/\s+/g, "")}`);
      }
    }
    const stats = fn(board, "showStats");
    const inStats = boardHits.filter(i => stats && i >= board.indexOf(stats) && i < board.indexOf(stats) + stats.length);
    const reads = /classList\s*\.\s*contains\s*\(\s*"needsAction"\s*\)/.test(fn(util, "narrateEvent"));
    const ok = strays.length === 0 && boardHits.length === 1 && inStats.length === 1 && reads;
    rule(ok,
      "only panel() writes the mark's class — with the one pinned exception, the end-of-voyage collapse in board.js showStats() — and the one narrator still reads it",
      "the mark's class is written somewhere else —"
      + `${strays.length ? ` ${strays.slice(0, 3).join(" | ")};` : ""}`
      + `${boardHits.length === 1 && inStats.length === 1 ? "" : ` board.js writes it ${boardHits.length} time(s), ${inStats.length} of them inside showStats() (the one pinned exception);`}`
      + `${reads ? "" : " and narrateEvent no longer reads it at all — the fact this gate is about has no reader;"}`);
  }

  return out;
}

/* 5. BEHAVIOURAL — the real clear branch, the real setNeedsAction, the real CLEAR_GRACE_MS, a real flight's words */
async function behaviour(files, flight) {
  const panel = stripComments(files[PANEL] || ""), util = stripComments(files[UTIL] || "");
  const panelFn = fn(panel, "panel");
  const clearAt = panelFn.indexOf("if(!html){");
  const clearBranch = clearAt >= 0 ? blockFrom(panelFn, clearAt) : "";
  const setNA = fn(panel, "setNeedsAction").replace(/^export\s+/, "");
  const grace = +((/const\s+CLEAR_GRACE_MS\s*=\s*(\d+)/.exec(panel) || [])[1]);
  if (!clearBranch || !setNA || !Number.isFinite(grace)) return { ok: false, text: "the real clear branch, setNeedsAction or CLEAR_GRACE_MS could not be read out of src/ui/panel.js — re-anchor" };
  if (!flight.txt) return { ok: false, text: "no posed Game produced a flight with words — the line this gate is about could not be taken from the game" };

  const cls = new Set();
  const ap = {
    style: {}, dataset: {},
    classList: { add: (...a) => a.forEach(x => cls.add(x)), remove: (...a) => a.forEach(x => cls.delete(x)), toggle: (k, v) => { v ? cls.add(k) : cls.delete(k); }, contains: k => cls.has(k) },
  };
  const inner = { innerHTML: "the line that was on screen" };
  const S = { pendingClear: null, setTimeout, clearTimeout, CLEAR_GRACE_MS: grace, resizePanel: () => {}, $: id => id === "actionPanel" ? ap : inner };
  let api;
  try {
    api = new Function("S", `with(S){
      ${setNA}
      return { setNeedsAction, clear:function(html){
        const inner=$("apGridInner");
        if(pendingClear){clearTimeout(pendingClear);pendingClear=null;}
        ${clearBranch}
      } };
    }`)(S);
  } catch (e) { return { ok: false, text: `the real clear branch could not be compiled: ${e.message}` }; }

  const why = [];
  api.setNeedsAction(true);
  if (!ap.classList.contains("needsAction")) why.push("setNeedsAction(true) did not mark the box at all");
  api.clear("");
  const markedAfterClear = ap.classList.contains("needsAction");
  if (markedAfterClear) why.push(`the box still claims a decision the instant it is cleared, so the one narrator would swallow ${JSON.stringify(flight.txt.slice(0, 40))} and its broadcast`);
  if (inner.innerHTML === "") why.push("the content left with the mark — the clearing grace no longer does the job it exists for");
  await new Promise(r => setTimeout(r, grace + 60));
  if (inner.innerHTML !== "") why.push(`the box never emptied, ${grace + 60}ms after the clear`);
  if (ap.style.display !== "none") why.push("the box never hid");
  if (!/classList\s*\.\s*contains\s*\(\s*"needsAction"\s*\)/.test(fn(util, "narrateEvent"))) why.push("narrateEvent no longer reads the mark, so nothing gates a line over a live prompt");

  return why.length
    ? { ok: false, text: `the real clear branch leaves an answered prompt claiming a decision: ${why.join("; ")}` }
    : { ok: true, text: `the real clear branch drops the mark at once and the content leaves ${grace}ms later — so a captain who taps a square is told ${JSON.stringify(flight.txt)}` };
}

async function allRules(files, flight) { return [...rules(files), await behaviour(files, flight)]; }

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const flight = realFlightLine();
const real = await allRules(files, flight);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${r.text}`));

/* RED-PROOF: each mutant is the real source broken the way a rule guards against; the rule(s) it names must go red. */
const broken = edits => { const f = { ...files }; for (const [file, from, to] of edits) { if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, () => to); } return f; };
const DONE = 'const done=v=>{setFlipActive(null);delete $("actionPanel").dataset.pp4Stage;panel("");answer(v);};';
const TEAR = 'const teardown=()=>{hs.forEach(h=>h.remove());panel("");appState.currentPrompt=null;';
const MUTANTS = [
  ["the mark back on the box's CONTENT timer (the tree before item 9b, half one): an answered sail prompt goes on claiming a decision for the clearing grace",
    broken([[PANEL, '    setNeedsAction(false);\n    // Defer', "    // Defer"],
            [PANEL, 'classList.remove("pendingReveal","pendingStage")', 'classList.remove("needsAction","pendingReveal","pendingStage")']]), [1, 5]],
  ["renderAskPrompt dropping it by hand again, one statement before the box does (the tree before item 9b, half two)",
    broken([[FLOW, DONE, DONE.replace("setFlipActive(null);", "setFlipActive(null);setNeedsAction(false);")]]), [2, 3]],
  ["renderPickPrompt dropping it by hand beside the box (the same copy, the other way round)",
    broken([[FLOW, TEAR, TEAR.replace('h.remove());panel("");', 'h.remove());setNeedsAction(false);panel("");')]]), [2, 3]],
  ["a second writer of the class, outside the box",
    broken([[FLOW, TEAR, TEAR.replace('panel("");appState.currentPrompt=null;', 'panel("");$("actionPanel").classList.remove("needsAction");appState.currentPrompt=null;')]]), [4]],
  ["the one narrator no longer reading the mark — the fact with no reader",
    broken([[UTIL, 'if(apNow&&apNow.classList.contains("needsAction"))return;', "if(apNow&&false)return;"]]), [4, 5]],
];
let proofOk = true;
for (const [what, mutant, idxs] of MUTANTS) {
  const res = mutant ? await allRules(mutant, flight) : null;
  const red = !!res && idxs.every(i => res[i - 1] && !res[i - 1].ok);
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${idxs.join(" & ")}): ${what} ${red ? "goes red" : mutant ? `STAYS GREEN on rule(s) ${idxs.filter(i => res[i - 1].ok).join(", ")} — the gate cannot see it` : "could not be built (the source moved — re-anchor)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — an answered prompt stops claiming a decision at once, in one place; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
