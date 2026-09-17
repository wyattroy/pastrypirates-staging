#!/usr/bin/env node
/* THE DEVICE CHANGES HANDS BEFORE THE SCREEN CHANGES CAPTAIN.
 *
 *   node scripts/qa/handover_before_turn_check.mjs
 *
 * WYATT, 2026-08-31: "Move it, I trust the plan." The plan
 * (.planning/architecture-one-director.html §04) puts pass-and-play's hand-over in the Decider —
 * it is a precondition on OBTAINING a decision from a seat, not a look, and not part of the turn.
 *
 * WHAT MEASURING FIRST FOUND, and it is a better argument than the plan's: TWO OF THE THREE
 * PASS-AND-PLAY PATHS ALREADY DID IT RIGHT, and nobody had noticed the third disagreed. The
 * backwards one (humanTurn: switch -> gate -> switch) made the board switch to the incoming captain
 * — ring, captains-box highlight, row order — and THEN the hand-over card appeared. For that
 * instant the OUTGOING captain, still holding the device, was looking at the next captain's board.
 *
 * RE-ANCHORED BY ARCHITECTURE ITEM 3 (2026-09-16), and the rule did not move. This gate used to
 * look for applyActiveSeat(seat) after each passGate. That function is gone: nothing WRITES whose
 * turn it is any more — every surface reads it (src/ui/util.js whoseTurn) from two things, and
 * those two are what "the screen changes captain" means now:
 *   · the engine's record that this captain's turn began — `ev({t:"turn",p:…})` in takeTurn,
 *     `bakeTurn(…)` in bakeTurnLive (src/orchestrator.js; the gate moved there from bakeoffPrompt so
 *     the hand-over could come before that record);
 *   · a local prompt raised for that captain — `askLocal(seat)` / `raiseLocalPrompt(seat` — which is
 *     what the screen shows during the recipe draft, before any captain holds a turn.
 * SO THIS GATE IS STILL ABOUT ORDER, NOT ABOUT A CALL EXISTING: at every pass-and-play hand-over,
 * the thing that turns the screen to that seat comes AFTER the gate, and never in the stretch
 * before it.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = rel => stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const REAL = { "src/ui/flow.js": read("src/ui/flow.js"), "src/orchestrator.js": read("src/orchestrator.js") };

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);
console.log("handover_before_turn_check — the device changes hands before the screen changes captain\n");

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* WHAT TURNS THE SCREEN TO A SEAT. `seat` is the expression handed to passGate (`player.idx`, `seat`); a record of a baking
   captain's turn takes the player object, so `player.idx` also matches `bakeTurn(player)`. A raiseLocalPrompt that is the BODY of
   an arrow (`const askLocal = (seat) => raiseLocalPrompt(seat, …)`) is a definition, not a call, and does not count. */
const turner = seat => {
  const obj = seat.replace(/\.idx$/, "");
  return new RegExp(`ev\\(\\{t:"turn",p:${esc(seat)}\\b|\\.bakeTurn\\(\\s*${esc(obj)}\\s*\\)|askLocal\\(\\s*${esc(seat)}\\s*\\)|(?<!=>\\s*)raiseLocalPrompt\\(\\s*${esc(seat)}\\s*,`);
};
/* One reading of a set of sources: every hand-over site, what precedes and what follows it. */
function sitesOf(files) {
  const sites = [];
  for (const [rel, code] of Object.entries(files)) {
    for (const g of code.matchAll(/await\s+passGate\s*\(\s*([\w.]+)\s*\)/g)) {
      const before = code.slice(Math.max(0, g.index - 400), g.index);
      const after = code.slice(g.index, g.index + 600);
      const line = code.slice(0, g.index).split("\n").length;
      sites.push({ where: `${rel}:${line}`, seat: g[1], switchesFirst: turner(g[1]).test(before), switchesAfter: turner(g[1]).test(after) });
    }
  }
  return sites;
}
const verdict = files => {
  const s = sitesOf(files);
  return { sites: s, backwards: s.filter(x => x.switchesFirst), orphan: s.filter(x => !x.switchesAfter) };
};

/* INSTRUMENT REACHED ITS SUBJECT. Three hand-overs: a turn, the secret draft, a bake. Silence below means nothing without them. */
const real = verdict(REAL);
const need = [["src/ui/flow.js", "player.idx"], ["src/ui/flow.js", "seat"], ["src/orchestrator.js", "player.idx"]];
const found = need.filter(([f, seat]) => real.sites.some(x => x.where.startsWith(f) && x.seat === seat));
found.length === need.length && real.sites.length >= 3
  ? pass(`instrument reached its subject — ${real.sites.length} hand-over(s): ${real.sites.map(x => `${x.where}(${x.seat})`).join(", ")}`)
  : fail(`found ${real.sites.length} hand-over(s) (${real.sites.map(x => x.where).join(", ") || "none"}) — expected takeTurn, the secret draft and bakeTurnLive; this gate cannot see its subject`);

/* THE ORDER, AT EVERY SITE. */
real.backwards.length === 0
  ? pass(`all ${real.sites.length} hand-over(s) come before the screen turns to that captain — the outgoing captain never sees the incoming captain's board`)
  : fail(`${real.backwards.length} site(s) turn the screen first: ${real.backwards.map(x => `${x.where} — the screen turns to ${x.seat} BEFORE the device changes hands`).join(" | ")}`);

/* AND THE SCREEN DOES TURN AFTERWARDS — a hand-over followed by no record and no prompt would leave the board on the outgoing
   captain for the whole turn. */
real.orphan.length === 0
  ? pass("every hand-over is followed by what turns the screen — the turn's record, or the prompt that asks that captain")
  : fail(`${real.orphan.length} hand-over(s) are followed by nothing that turns the screen to that captain: ${real.orphan.map(x => x.where).join(", ")}`);

/* RED-PROOF, on the REAL sources, through the same reader: each mutant puts one switch back in front of its gate. */
{
  const mut = (rel, from, to) => REAL[rel].includes(from) ? { ...REAL, [rel]: REAL[rel].replace(from, to) } : null;
  const MUTANTS = [
    ["bakeTurnLive records the bake turn BEFORE passing the device",
      mut("src/orchestrator.js", "await passGate(player.idx);\n  g.bakeTurn(player);", "g.bakeTurn(player);\n  await passGate(player.idx);")],
    ["takeTurn records the turn BEFORE passing the device",
      mut("src/ui/flow.js", "await passGate(player.idx);", "appState.game.ev({t:\"turn\",p:player.idx});\n  await passGate(player.idx);")],
    ["the secret draft raises the next captain's prompt BEFORE passing the device",
      mut("src/ui/flow.js", "await passGate(seat);", "raiseLocalPrompt(seat,()=>0);\n      await passGate(seat);")],
    ["bakeTurnLive stops recording the bake turn at all",
      mut("src/orchestrator.js", "g.bakeTurn(player);", "")],
  ];
  const bad = [];
  for (const [what, m] of MUTANTS) {
    if (!m) { bad.push(`${what}: could not be built (the source moved)`); continue; }
    const v = verdict(m);
    if (!(v.backwards.length > 0 || v.orphan.length > 0)) bad.push(`${what}: STAYS GREEN`);
  }
  bad.length === 0
    ? pass(`red-proof: ${MUTANTS.length} mutants of the real source, each going red — the bake turn, the turn and the draft prompt moved in front of their gate, and a bake whose turn is never recorded`)
    : fail(`red-proof FAILED — ${bad.join(" | ")}`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
