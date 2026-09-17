#!/usr/bin/env node
/* WHICH RECIPE EACH CAPTAIN IS BAKING — ONE PIPE, AND IT IS THE EVENT STREAM.
   Architecture item 10 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), 2026-09-17.
   THE FAULT IT HOLDS SHUT: the pick travelled by TWO pipes. The host stated it through the engine (Game.setRecipe ->
   `recipeSet`) AND wrote the same picks to rooms/<C>/recipes; watchRecipes — attached on EVERY screen, the host's own
   included — read that node back and called setRecipe a second time. A guest never read `e.recipe` at all, so the one
   thing the one consumer was for, it did not do: a guest learned its own table's recipes from the side channel.
   MEASURED BEFORE, two real browsers in a real Firebase room (host desktop 1280x800, guest phone 375x812 dsf 3, touch;
   .planning/architecture-cleanup-shots/item-10-*-before.png), four picks:
     · host engine 8 recipeSet events — setRecipe applied TWICE to every captain;
     · guest engine 12 — 8 carrying a wire serial, and 4 more its own watcher invented with none;
     · a HOST RELOAD pushed 4 further bogus recipeSet events into the guest's live feed (12 -> 16), because the watcher
       re-fired after the replay and those events were new to the broadcast frontier.
   THE RULES (each red-proofed below against a mutant of the real source, built in memory; comments stripped first):
     1. ONE SETTER — outside the engine, `setRecipe(` is called in exactly one place: recipeDraftNet, in src/orchestrator.js.
     2. NO SECOND PIPE — nothing in src/ names netSetRecipes, netWatchRecipes or watchRecipes, nothing addresses a
        rooms/<C>/recipes path, and startGame resets no `recipes` slot.
     3. THE CONSUMER APPLIES THE FACT — consumeEvent's guest branch (`if(!appState.isHost)`) writes `e.recipe` onto the
        captain the event names, on `recipeSet`.
     4. ONE BANNER REFRESH SITE — `updateRecipeBanner(` is called exactly once in src/ (beside its own definition), inside
        consumeEvent, on a `recipeSet` statement.
     5. BEHAVIOURAL, posed from the real source text:
          a. the engine's own setRecipe records EXACTLY ONE `recipeSet` event, naming the captain and carrying the recipe;
          b. the consumer's own guest branch, run over that feed on a fresh guest engine, leaves every captain holding the
             recipe its event named — for a live draft, for a feed replayed whole from the start (a guest reload: its
             listener is `child_added`, so every past event arrives again), and for a feed delivered twice. The posed host
             picks its SECOND card for every captain, so a guest that ignored `e.recipe` would be left holding its own
             engine's default first card and the rule goes red.
   Knows nothing about which build it is looking at. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const ORCH = "src/orchestrator.js", ENGINE = "src/engine/index.js";

/* a named function's whole text, by brace matching after the parameter list (a default can carry braces) */
function fnText(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(h, k + 1); }
  return "";
}
/* the first `if(<cond matching re>){…}` block in `body`, returned whole and as its body alone */
function ifBlock(body, re) {
  for (const m of body.matchAll(/\bif\s*\(/g)) {
    let j = m.index + m[0].length - 1, d = 0;
    for (; j < body.length; j++) { if (body[j] === "(") d++; else if (body[j] === ")") { d--; if (!d) break; } }
    const cond = body.slice(m.index, j + 1);
    if (!re.test(cond)) continue;
    let k = j + 1; while (/\s/.test(body[k] || "")) k++;
    if (body[k] !== "{") continue;
    const open = k; d = 0;
    for (; k < body.length; k++) { if (body[k] === "{") d++; else if (body[k] === "}") { d--; if (!d) break; } }
    return { cond, whole: body.slice(m.index, k + 1), inner: body.slice(open + 1, k) };
  }
  return null;
}
/* every outermost `if(…)` statement in a function body whose condition names recipeSet */
function recipeSetStatements(body) {
  const out = []; let taken = -1;
  for (const m of body.matchAll(/\bif\s*\(/g)) {
    if (m.index < taken) continue;
    let j = m.index + m[0].length - 1, d = 0;
    for (; j < body.length; j++) { if (body[j] === "(") d++; else if (body[j] === ")") { d--; if (!d) break; } }
    const cond = body.slice(m.index, j + 1);
    if (!/"recipeSet"/.test(cond)) continue;
    let k = j + 1; while (/\s/.test(body[k] || "")) k++;
    if (body[k] === "{") { d = 0; for (; k < body.length; k++) { if (body[k] === "{") d++; else if (body[k] === "}") { d--; if (!d) break; } } k++; }
    else { d = 0; for (; k < body.length; k++) { const c = body[k]; if ("({[".includes(c)) d++; else if (")}]".includes(c)) d--; else if (c === ";" && !d) break; } k++; }
    out.push({ cond, code: body.slice(m.index, k) }); taken = k;
  }
  return out;
}
const count = (s, re) => (s.match(re) || []).length;
const CONSUMER = "export async function consumeEvent(e){", DRAFT = "export async function recipeDraftNet(){";

function rules(files) {
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const all = Object.entries(code), outsideEngine = all.filter(([f]) => !f.startsWith("src/engine/"));
  const orch = code[ORCH] || "";
  const consumer = fnText(orch, CONSUMER), draft = fnText(orch, DRAFT);
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. ONE SETTER
  const setters = outsideEngine.reduce((n, [, s]) => n + count(s, /\.setRecipe\s*\(/g), 0);
  const inDraft = count(draft, /\.setRecipe\s*\(/g);
  rule(setters === 1 && inDraft === 1,
    "a captain's recipe is applied in one place outside the engine — recipeDraftNet's one Game.setRecipe, which is what emits the event every screen drains",
    `setRecipe is called ${setters} time(s) outside the engine (${inDraft} of them in recipeDraftNet) — a second application is a second pipe, and it is how every screen applied every pick twice`);

  // 2. NO SECOND PIPE
  const named = all.filter(([, s]) => /\b(netSetRecipes|netWatchRecipes|watchRecipes)\b/.test(s)).map(([f]) => f);
  const pathed = all.filter(([, s]) => /["'`][^"'`]*\/recipes["'`]/.test(s)).map(([f]) => f);
  const slot = /\brecipes\s*:\s*null\b/.test(orch);
  rule(named.length === 0 && pathed.length === 0 && !slot,
    "there is no second pipe: no recipes writer, no recipes watcher, no rooms/<C>/recipes node and no room slot for one",
    `the recipes side channel is back${named.length ? " (named in " + named.join(", ") + ")" : ""}${pathed.length ? " (addressed in " + pathed.join(", ") + ")" : ""}${slot ? " (startGame resets a `recipes` slot)" : ""} — a Firebase write fires its own listener, so every screen applies every pick twice again`);

  // 3. THE CONSUMER APPLIES THE FACT
  const guest = consumer ? ifBlock(consumer, /!\s*appState\.isHost/) : null;
  const applied = !!guest && /e\.t\s*===\s*"recipeSet"/.test(guest.inner) && /e\.recipe/.test(guest.inner)
    && /appState\.game\.players\s*\[\s*e\.p\s*\]\s*\.recipe\s*=/.test(guest.inner);
  rule(applied,
    "the one consumer's guest branch applies e.recipe to the captain the event names — the only way a guest can learn what its table is baking",
    `consumeEvent's guest branch does not write e.recipe onto appState.game.players[e.p] ${guest ? "" : "(the `!appState.isHost` branch is gone) "}— a guest holds whatever card its own engine dealt first, and the fact travels by some other pipe`);

  // 4. ONE BANNER REFRESH SITE
  const banners = all.reduce((n, [, s]) => n + count(s, /\bupdateRecipeBanner\s*\(/g), 0) - 1;   // less its own definition
  const inConsumerOnRecipeSet = recipeSetStatements(consumer).some(st => /\bupdateRecipeBanner\s*\(/.test(st.code));
  rule(banners === 1 && count(consumer, /\bupdateRecipeBanner\s*\(/g) === 1 && inConsumerOnRecipeSet,
    "the recipe band is refreshed from one place — the one consumer, on the one event",
    `updateRecipeBanner is called ${banners} time(s) outside its definition${inConsumerOnRecipeSet ? "" : " and not from a recipeSet statement in consumeEvent"} — the banner used to be refreshed by the draft loop, by beginGame before a single event existed, and by the deleted watcher`);

  // 5a. BEHAVIOURAL — the engine records the pick once, carrying the recipe
  const eng = files[ENGINE] || "";
  const setBody = (() => {
    const at = eng.indexOf("\n  setRecipe(p,recipe){"); if (at < 0) return null;
    const start = eng.indexOf("{", at); let d = 0;
    for (let k = start; k < eng.length; k++) { if (eng[k] === "{") d++; else if (eng[k] === "}" && --d === 0) return eng.slice(start + 1, k); }
    return null;
  })();
  let feed = null, whyA = "Game.setRecipe(p,recipe) not found in the engine", okA = false;
  if (setBody) {
    try {
      const set = new Function("p", "recipe", setBody);
      const host = new Game(roundCfg(["human", "human", "pirate", "trader"]), 4211, true);
      const seen = [];
      for (const p of host.players) {
        const n0 = host.events.length;
        set.call(host, p, p.recipeChoices[1]);                 // the SECOND card, so a default-holding guest is wrong
        const evs = host.events.slice(n0).filter(e => e.t === "recipeSet");
        seen.push(evs.length === 1 && evs[0].p === p.idx && Array.isArray(evs[0].recipe)
          && evs[0].recipe.join("+") === p.recipeChoices[1].join("+") && p.recipe.join("+") === p.recipeChoices[1].join("+"));
      }
      okA = seen.every(Boolean);
      whyA = `four posed picks recorded ${JSON.stringify(seen)}`;
      feed = host.events.filter(e => e.t === "recipeSet").map(e => JSON.parse(JSON.stringify(e)));
    } catch (e) { whyA = "the engine's setRecipe could not be run: " + e.message; }
  }
  rule(okA,
    "the engine records a pick as exactly one recipeSet event naming the captain and carrying the recipe itself — the one thing the one pipe carries (posed: four picks)",
    `${whyA} — a pick the engine does not carry on its event cannot reach a guest at all`);

  // 5b. BEHAVIOURAL — the consumer's own guest branch, over that feed, on a fresh guest engine
  let okB = false, whyB = "the consumer's guest branch could not be built";
  if (guest && feed && feed.length === 4) {
    try {
      const apply = new Function("appState", "e", guest.inner);
      const want = feed.map(e => e.recipe.join("+"));
      const run = deliveries => {
        const g = new Game(roundCfg(["human", "human", "pirate", "trader"]), 4211, true);
        const st = { isHost: false, game: g };
        const dealt = g.players.map(p => p.recipe.join("+"));
        for (let d = 0; d < deliveries; d++) for (const e of feed) apply(st, e);
        return { got: g.players.map(p => p.recipe.join("+")), dealt };
      };
      const live = run(1), replayedTwice = run(2);
      const right = r => JSON.stringify(r.got) === JSON.stringify(want);
      const wouldBeWrong = JSON.stringify(live.dealt) !== JSON.stringify(want);   // the check can fail
      okB = right(live) && right(replayedTwice) && wouldBeWrong;
      whyB = `a drained feed left ${JSON.stringify(live.got)}; delivered twice ${JSON.stringify(replayedTwice.got)}; wanted ${JSON.stringify(want)}; the guest's own engine had dealt ${JSON.stringify(live.dealt)}`;
    } catch (e) { whyB = "the guest branch could not be run: " + e.message; }
  }
  rule(okB,
    "a guest that drains the feed — live, replayed whole from the start after a reload, or handed every event twice — holds exactly the recipe each event named, never the card its own engine dealt",
    `${whyB} — this is the recovery path fbf0993e objected about, and it must hold without a side channel`);

  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy of the real source broken the way it guards against (in memory; nothing is written). */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const OLD_WATCHER = `
export function watchRecipes(){
  netWatchRecipes(appState.db,appState.room,snap=>{
    const picks=snap.val();
    if(!picks)return;
    Object.entries(picks).forEach(([key,pk])=>{
      if(pk==null)return;
      const i=+key;
      if(appState.game.players[i]&&appState.game.players[i].recipeChoices)appState.game.setRecipe(appState.game.players[i],appState.game.players[i].recipeChoices[pk]);
    });
    updateRecipeBanner();
    if(appState.game.events.length)render();
  });
}
export function leaveGame(){`;
const MUTANTS = [
  ["the old watchRecipes body back in the orchestrator (a second setter)",
    broken(ORCH, "\nexport function leaveGame(){", OLD_WATCHER), 0],
  ["the old watchRecipes body back in the orchestrator (the side channel's watcher)",
    broken(ORCH, "\nexport function leaveGame(){", OLD_WATCHER), 1],
  ["the recipes node written again from the draft loop",
    broken("src/net/writers.js", "export function netSetDraftPrompt(", `export function netSetRecipes(db, room, picks, onError) {\n  return withReporter(db.ref("rooms/" + room + "/recipes").set(picks), onError);\n}\n\nexport function netSetDraftPrompt(`), 1],
  ["startGame clearing a `recipes` slot again (the node is back in the room's shape)",
    broken(ORCH, "{status:\"playing\",cfg,seed,ev:null,prompt:null,response:null,narr:null,meta:null,\n      dlog:null", "{status:\"playing\",cfg,seed,ev:null,prompt:null,response:null,narr:null,meta:null,\n      recipes:null,dlog:null"), 1],
  ["the consumer's guest branch no longer applying e.recipe",
    broken(ORCH, `    if(e.t==="recipeSet"&&Array.isArray(e.recipe)&&appState.game.players[e.p])appState.game.players[e.p].recipe=e.recipe.slice();`, ``), 2],
  ["the consumer's guest branch no longer applying e.recipe (a guest holds the wrong card)",
    broken(ORCH, `    if(e.t==="recipeSet"&&Array.isArray(e.recipe)&&appState.game.players[e.p])appState.game.players[e.p].recipe=e.recipe.slice();`, ``), 5],
  ["the banner refreshed from beginGame as well",
    broken(ORCH, "  drawBoard();buildPlayerRows();", "  drawBoard();buildPlayerRows();\n  updateRecipeBanner();"), 3],
  ["the engine setting a recipe without recording it",
    broken(ENGINE, `    this.ev({t:"recipeSet",p:p.idx,recipe});`, ``), 4],
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
  : `\nPASS — which recipe each captain is baking travels one pipe: the engine states it, the one consumer applies it, and no side channel carries it; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
