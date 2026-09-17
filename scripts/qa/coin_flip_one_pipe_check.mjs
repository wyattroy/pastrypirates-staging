#!/usr/bin/env node
/* A COIN FLIP REACHES EVERY SCREEN ON ONE PIPE, IS TOSSED ONCE, AND ITS SPIN SOUND STARTS ONCE PER SCREEN.
   Architecture item 6 (2026-09-17). Wyatt, playing build .5: "it seems like the coin flip sound is being played twice. hopefully this
   kind of slop is being fixed by the architecture audit work". It was, and it was measured before a line changed (headless Chrome,
   every start of the coin-flip sample counted): a bot's fight flip on a solo phone started the spin sound TWICE in the same
   millisecond; a crew guest watching the host's dock flip, twice in one millisecond; watching the host's fight flip, twice 696ms apart;
   the host watching a guest's fight flip, twice. And a crew guest's own fight coin sat still ~118ms after its tap, waiting for the host.
   WHY: a flip reached another screen by TWO routes — the `flip` wire node (broadcastFlip -> watchFlip -> setFlipCoin("spin") on a big
   coin the stage hides, so its only effect there was the sound) and the `coinflip` event (-> the small coin, which starts the sound
   too) — and it was tossed by THREE routines (flow.js humanFlip, orchestrator.js hFlip and bFlip), each sleeping out the spin, sending the
   face, holding and clearing on its own; the D-49 and T-34 timing fixes each had to be made in all of them. And "the tap starts the
   spin" was written for the ordinary flip only; both fight taps skipped it.
   RULES (on comment-stripped source; each red-proofed below against a copy broken the way it guards against):
     1. ONE WIRE ROUTE — no broadcastFlip / watchFlip / netSetFlip / netWatchFlip / onBroadcastFlip, no rooms/<C>/flip path, no `flip`
        slot in the room reset. A flip reaches other screens only as the engine's `coinflip` event.
     2. ONE TOSS — outside the engine, a captain's coin is flipped in exactly one place, ui/flow.js flipFor, which records it, publishes
        it and AWAITS THE DRAIN; the dock (humanFlip) and the fight (asyncBattleRun) both toss through it; no hFlip/bFlip.
     3. THE FLIP'S CLOCK IS WAITED OUT ONLY WHERE IT IS DRAWN — `sleep(flipSpinLeftMs())`, `sleep(FLIP_LAND_HOLD_MS)` and
        `sleep(FLIP_SPIN_MS…)` appear only inside the two drawings: board.js landFlipCoin (the big coin the tapping screen lands) and
        dockcoin.js flipDockCoin (the small coin every other screen throws). (The audit's wording put them "in flipFor"; they cannot be
        there — a guest's own flip is tossed by the HOST's flipFor, and the landing must happen on the guest's screen.)
     4. ONE CONSUMER DRAWS EVERY FLIP — consumeEvent's coinflip branch: decisionIsLocal(e.p) -> landFlipCoin, else -> flipDockCoin; each
        drawing is called from nowhere else.
     5. ONE SPIN-SOUND STARTER PER SCREEN — startFlipSpinSound( is called in exactly two places: setFlipCoin's "spin" branch, guarded by
        !wasSpin (the tapping screen), and flipDockCoin (every other screen); and setFlipCoin("spin") is painted from exactly one place.
     6. THE TAP STARTS THE SPIN, IN ONE PLACE — setFlipActive is armed with a handler only inside board.js armFlipTap, which paints
        setFlipCoin("spin"); the ordinary flip's two shapes (renderAskPrompt), the host's own fight tap (battleAsk) and a guest's fight
        tap (watchPrompt) all arm through it.
     7. BEHAVIOURAL — Game.flip, compiled from the engine's own source text onto a real posed Game, records exactly one coinflip event
        naming the captain, the face and the reason, for a dock and for a fight: the one event the one pipe carries.
   Knows nothing about which build it is looking at. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);

/* a named function's text, from its header to its matching brace (parameters skipped first — a default can carry braces) */
function fn(src, name) {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src); if (!m) return "";
  let j = src.indexOf("(", m.index), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(m.index, k + 1); }
  return "";
}
const count = (s, re) => (s.match(re) || []).length;

function rules(files) {
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const all = Object.entries(code), outsideEngine = all.filter(([f]) => !f.startsWith("src/engine/"));
  const orch = code["src/orchestrator.js"], flow = code["src/ui/flow.js"], board = code["src/ui/board.js"], dock = code["src/ui/dockcoin.js"];
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. ONE WIRE ROUTE
  const wire = all.filter(([, s]) => /\b(broadcastFlip|watchFlip|netSetFlip|netWatchFlip|onBroadcastFlip)\b/.test(s) || /["'`]\/flip["'`]/.test(s)).map(([f]) => f);
  const slot = /\bflip\s*:\s*null\b/.test(orch);
  rule(wire.length === 0 && !slot,
    "a flip reaches other screens on one pipe: no flip wire node, no writer, no watcher, no room slot for it",
    `the flip wire node is back${wire.length ? " in " + wire.join(", ") : ""}${slot ? " (startGame resets a `flip` slot)" : ""} — a second route paints every flip again, and starts its sound again`);

  // 2. ONE TOSS
  const tosses = outsideEngine.reduce((n, [, s]) => n + count(s, /(?:\bgame|\bg)\.flip\s*\(/g), 0);
  const toss = fn(flow, "flipFor");
  const humanFlipBody = fn(flow, "humanFlip"), battleRun = fn(orch, "asyncBattleRun");
  const copies = all.filter(([, s]) => /\b(hFlip|bFlip)\b/.test(s)).map(([f]) => f);
  rule(tosses === 1 && /(?:\bgame|\bg)\.flip\s*\(\s*player\s*,\s*why\s*\)/.test(toss) && /publishNow\(\s*\)/.test(toss) && /await\s+liveRender\(\s*\)/.test(toss)
       && /flipFor\(/.test(humanFlipBody) && /flipFor\(\s*player\s*,\s*"battle"\s*\)/.test(battleRun) && copies.length === 0,
    "a coin is tossed in one place, ui/flow.js flipFor — recorded, published, and the drain awaited — and the dock and every fight flip toss through it",
    `a coin is tossed ${tosses} time(s) outside the engine${toss ? "" : " and flipFor is gone"}${copies.length ? ", and hFlip/bFlip are back in " + copies.join(", ") : ""}, or a flip skips flipFor or no longer awaits the drain`);

  // 3. THE FLIP'S CLOCK, WAITED OUT ONLY WHERE THE FLIP IS DRAWN
  const land = fn(board, "landFlipCoin"), small = fn(dock, "flipDockCoin");
  const WAIT = /await\s+sleep\s*\(\s*(?:flipSpinLeftMs\s*\(\s*\)|FLIP_LAND_HOLD_MS|FLIP_SPIN_MS[^)]*)\s*\)/g;
  const waitsOutside = all.reduce((n, [f, s]) => n + count(f === "src/ui/board.js" ? s.replace(land, "") : f === "src/ui/dockcoin.js" ? s.replace(small, "") : s, WAIT), 0);
  rule(!!land && !!small && waitsOutside === 0 && /sleep\s*\(\s*flipSpinLeftMs\s*\(\s*\)\s*\)/.test(land) && /sleep\s*\(\s*FLIP_LAND_HOLD_MS\s*\)/.test(land) && /sleep\s*\(\s*FLIP_LAND_HOLD_MS\s*\)/.test(small),
    "a flip's spin and hold are waited out only by its two drawings — the big coin's landing and the small coin — each on the named clocks",
    `${waitsOutside} flip wait(s) outside the two drawings${land ? "" : " (landFlipCoin is gone)"}${small ? "" : " (flipDockCoin is gone)"} — a toss that sleeps and holds on its own is the copy D-49 and T-34 had to be fixed in three times`);

  // 4. ONE CONSUMER DRAWS EVERY FLIP
  const consume = fn(orch, "consumeEvent");
  const branch = /e\.t\s*===\s*"coinflip"[\s\S]{0,120}?\{\s*if\s*\(\s*decisionIsLocal\s*\(\s*e\.p\s*\)\s*\)\s*await\s+landFlipCoin\s*\(\s*!!e\.heads\s*,\s*sleep\s*\)\s*;\s*else\s*\{[\s\S]{0,200}?await\s+flipDockCoin\s*\(\s*e\.p\s*,\s*!!e\.heads/.test(consume);
  const landCalls = all.reduce((n, [, s]) => n + count(s, /\blandFlipCoin\s*\(/g), 0) - 1;     // less its definition
  const smallCalls = all.reduce((n, [, s]) => n + count(s, /\bflipDockCoin\s*\(/g), 0) - 1;
  rule(branch && landCalls === 1 && smallCalls === 1 && /landFlipCoin\s*\(/.test(consume) && /flipDockCoin\s*\(/.test(consume),
    "the one event consumer draws every flip: the tapping screen lands its big coin, every other screen throws the small coin — and nothing else draws one",
    `consumeEvent does not fork the coinflip on decisionIsLocal into exactly one drawing (landFlipCoin called ${landCalls}x, flipDockCoin ${smallCalls}x)`);

  // 5. ONE SPIN-SOUND STARTER PER SCREEN
  const setCoin = fn(board, "setFlipCoin");
  const starters = outsideEngine.filter(([f]) => f !== "src/ui/audio.js").reduce((n, [, s]) => n + count(s, /\bstartFlipSpinSound\s*\(/g), 0);
  const guarded = /else\s+if\s*\(\s*state\s*===\s*"spin"\s*\)\s*\{[\s\S]{0,200}?if\s*\(\s*!wasSpin\s*\)\s*\{[^}]*startFlipSpinSound\s*\(\s*\)/.test(setCoin) && count(setCoin, /\bstartFlipSpinSound\s*\(/g) === 1;
  const spinPaints = all.reduce((n, [, s]) => n + count(s, /\bsetFlipCoin\s*\(\s*"spin"\s*\)/g), 0);
  rule(starters === 2 && guarded && /startFlipSpinSound\s*\(\s*\)/.test(small) && spinPaints === 1,
    "a flip's spin sound starts once per screen: the tapping screen's spin paint (guarded, painted from one place) or the small coin — never both",
    `startFlipSpinSound is called ${starters} time(s)${guarded ? "" : " (setFlipCoin's start is not the one guarded \"spin\" branch)"} and the spin is painted ${spinPaints} time(s) — a screen can hear one flip twice`);

  // 6. THE TAP STARTS THE SPIN, IN ONE PLACE
  const armTap = fn(board, "armFlipTap");
  const armings = all.reduce((n, [, s]) => n + count(s.replace(/function\s+setFlipActive\s*\(/g, "function __def("), /\bsetFlipActive\s*\(\s*(?!null\s*\))/g), 0);
  const tapPaints = /setFlipActive\s*\(\s*\(\s*\)\s*=>\s*\{\s*setFlipActive\s*\(\s*null\s*\)\s*;\s*onTap\s*\(\s*\)\s*;\s*setFlipCoin\s*\(\s*"spin"\s*\)/.test(armTap);
  const ask = fn(flow, "renderAskPrompt");
  rule(armings === 1 && tapPaints && count(ask, /\barmFlipTap\s*\(/g) === 2 && /\barmFlipTap\s*\(/.test(fn(orch, "battleAsk")) && /\barmFlipTap\s*\(/.test(fn(orch, "watchPrompt")),
    "every flip's tap starts its spin in one place, armFlipTap — the ordinary flip's two shapes, the host's own fight tap and a guest's fight tap",
    `the coin is armed with a handler ${armings} time(s) outside armFlipTap's one arming${tapPaints ? "" : ", or armFlipTap no longer disarms, answers and paints the spin"} — some flip's tap waits for the host before its coin spins`);

  // 7. BEHAVIOURAL — the one event the pipe carries, from the engine's own flip
  const eng = files["src/engine/index.js"];
  const at = eng.indexOf("\n  flip(p,why){");
  let beh = false, why = "Game.flip(p,why) not found in the engine";
  if (at >= 0) {
    const start = eng.indexOf("{", at); let d = 0, end = start;
    for (let k = start; k < eng.length; k++) { if (eng[k] === "{") d++; else if (eng[k] === "}" && --d === 0) { end = k; break; } }
    try {
      const flip = new Function("p", "why", eng.slice(start + 1, end));
      const g = new Game(roundCfg(["human", "bot", "bot", "bot"]), 7919, true);
      const seen = [];
      for (const [p, w] of [[g.players[0], "dock"], [g.players[2], "battle"]]) {
        const n0 = g.events.length, f0 = p.flips;
        const h = flip.call(g, p, w);
        const evs = g.events.slice(n0).filter(e => e.t === "coinflip");
        seen.push(evs.length === 1 && evs[0].p === p.idx && evs[0].heads === (h ? 1 : 0) && evs[0].why === w && p.flips === f0 + 1);
      }
      beh = seen.every(Boolean); why = `a posed dock flip and fight flip recorded ${JSON.stringify(seen)}`;
    } catch (e) { why = "the engine's flip could not be run: " + e.message; }
  }
  rule(beh,
    "the engine records every flip as exactly one coinflip event naming the captain, the face and why — the one thing the one pipe carries (posed: a dock flip and a fight flip)",
    `${why} — a flip the engine does not record cannot be drawn on any screen`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy of the real source broken the way it guards against (in memory; nothing is written). */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const MUTANTS = [
  ["the flip wire node back beside a fight's toss (broadcastFlip)",
    broken("src/orchestrator.js", `    return flipFor(player,"battle");`, `    const h=await flipFor(player,"battle");broadcastFlip(h?"H":"T");return h;`), 0],
  ["a bot's fight flip tossed by a routine of its own again",
    broken("src/orchestrator.js", `    return flipFor(player,"battle");`, `    if(player.strategy!=="human"){const h=appState.game.flip(player,"battle");publishNow();liveRender();return h;}\n    return flipFor(player,"battle");`), 1],
  ["a bot's fight flip holding its landed face on its own clock",
    broken("src/orchestrator.js", `    else battlePublish(o);`, `    else{battlePublish(o);await sleep(FLIP_LAND_HOLD_MS);}`), 2],
  ["the consumer throwing the small coin on the tapping screen too",
    broken("src/orchestrator.js", `    if(decisionIsLocal(e.p))await landFlipCoin(!!e.heads,sleep);\n    else{`, `    if(decisionIsLocal(e.p))await landFlipCoin(!!e.heads,sleep);\n    {`), 3],
  ["an unguarded startFlipSpinSound() back in setFlipCoin",
    broken("src/ui/board.js", `  stopFlipSpinSound();\n  el.classList.remove(`, `  stopFlipSpinSound();\n  if(state==="spin")startFlipSpinSound();\n  el.classList.remove(`), 4],
  ["the big coin's landing painting the spin again (a second sound on the tapping screen)",
    broken("src/ui/board.js", `  await sleep(flipSpinLeftMs());\n  setFlipCoin(heads?"H":"T");`, `  setFlipCoin("spin");\n  await sleep(flipSpinLeftMs());\n  setFlipCoin(heads?"H":"T");`), 4],
  ["the host's own fight tap arming the coin without starting the spin (the CEO's find)",
    broken("src/orchestrator.js", `armFlipTap(()=>{setNeedsAction(false);res(0);});`, `setFlipActive(()=>{setFlipActive(null);setNeedsAction(false);res(0);});`), 5],
  ["the engine flipping a coin without recording it",
    broken("src/engine/index.js", `if(why)this.ev({t:"coinflip",p:p.idx,heads:h?1:0,why});`, ``), 6],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && !!res[idx] && !res[idx].ok;          // the rule that guards against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — a coin flip reaches every screen on one pipe, is tossed once, and its spin sound starts once per screen; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
