#!/usr/bin/env node
/* A LINE IS DRAWN WHEN IT ARRIVES, ON EVERY SCREEN — A FIGHT BEING ON CHANGES NOTHING ABOUT THAT.  (architecture item 8, 2026-09-17)
   Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16): name the fact, count every place that decides it, make the count ONE, and
   gate it. THE FACT: whether a narration line or a fight's words are drawn while a fight is on.
   BEFORE (count 3): a crew GUEST dropped every narration line while a fight's snapshot was live or its own fight prompt was up
   (orchestrator.js watchNarr: `if(v&&!appState.spectatingBattle&&!appState.inBattlePrompt)`), and dropped a fight's own words while its
   fight prompt was up (applyBattleSnap: `if(!appState.inBattlePrompt)renderBattleFromSnap(snap)`); the HOST filtered neither (panel.js
   flash, battlePublish). Both guest filters were written 2026-07-20 (2793771d, playtest item #9) so the per-flip lines would stop
   "overwriting the panel" and making "the battle box flicker away between flips". The battle box was deleted on 2026-09-14 (1c87b27a),
   and the reason with it. Measured before this change in a two-window crew fight: see the item-8 commit.
   AFTER (count 1): a line is drawn when it arrives — watchNarr and applyBattleSnap draw whatever is on this screen, exactly as the host's
   flash and battlePublish always did. Both flags are deleted: inBattlePrompt had no other reader, and architecture item 4 had already
   taken spectatingBattle's other reader (the clash's once-per-fight edge) into the one event consumer.
   AND THE FIGHT SAYS NOTHING ABOUT WAITING. Wyatt's ruling, relayed 2026-09-17, his own option (a): drop the fight's two waiting lines
   everywhere — "⚔️ {a} attacks {d}! Waiting for {d} to defend…" (battle.waitDefend) and "⚔️ {a} attacks {d} — waiting for {who}…"
   (battle.waitFor). The host never drew either (netBroadcast draws nothing locally), and "battle.loads" / "battle.showsTails" already say
   whose coin the table is waiting on. Letting them through to a watching phone instead is what this gate must forbid: measured, they cut
   the fight's own line from 4,537 ms of reading time to 769 ms.
   RULES (each red-proofed below, in memory):
     1. POSED AND RUN: a guest's narration listener, handed a line while every fight flag on its screen is up, draws it
     2. POSED AND RUN: a fight snapshot arriving while every fight flag on the screen is up is drawn
     3. no path that draws a narration line or a fight's words reads a fight flag (watchNarr, applyBattleSnap, renderBattle,
        renderBattleFromSnap, netNarrate, netBroadcast, sendNarr, flash, showNarration, narrateLastEvent, narrateEvent, narrateCurrent,
        stageFlash)
     4. neither flag exists anywhere in src/
     5. the fight's two waiting lines are gone: neither id is said anywhere in src/, and neither is written in words.js — and no line a
        fight says is about waiting for a captain
   "Every fight flag up" (rules 1-2) is not a list of today's names: the posed screen starts from src/state's real defaults, answers TRUE
   for any field whose name says battle or fight, and TRUE for any field the state does not have — so a filter that comes back under a new
   name is caught by what it DOES, not by what it is called. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const { appState: DEFAULTS } = await import(pathToFileURL(path.join(REPO, "src/state/index.js")).href);
const FIGHTY = /battle|fight/i;
/* A screen with a fight on and its own fight prompt up: the real defaults, every fight-named field TRUE, every unknown field TRUE. */
function posedScreen(extra) {
  const t = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), extra || {});
  for (const k of Object.keys(t)) if (FIGHTY.test(k)) t[k] = true;
  const read = new Set();
  const p = new Proxy(t, {
    get(o, k) { if (typeof k !== "string") return o[k]; read.add(k); return k in o ? o[k] : true; },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { p, read };
}
/* The real function, run as written, with only its outside world stubbed. Every name it reaches that is not stubbed resolves to the real
   global of that name, so an unexpected dependency throws here instead of passing quietly. */
function realFunction(src, name, stubs) {
  const fn = body(src, `export function ${name}(`).replace(/^export\s+/, "");
  if (!fn) return null;
  const scope = new Proxy({}, {
    has: (_, k) => typeof k === "string" && k !== "undefined",
    get: (_, k) => (k === Symbol.unscopables ? undefined : (Object.prototype.hasOwnProperty.call(stubs, k) ? stubs[k] : globalThis[k])),
  });
  return new Function("scope", `with(scope){ return (${fn}); }`)(scope);
}
const tick = () => new Promise(r => setTimeout(r, 20));
/* THE TWO WAITING LINES, BY WHAT THEY SAY rather than by the ids they happen to wear today: a line a fight says whose words are about
   waiting for a captain. Both ids and both sentences are listed, so putting either back under a new name is still caught by rule 5. */
const WAIT_IDS = ["battle.waitDefend", "battle.waitFor"];
const WAIT_WORDS = /waiting for\b|\bto defend…/i;

async function rules(files) {
  const orchRaw = files["src/orchestrator.js"], orch = strip(orchRaw);
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. POSED AND RUN — watchNarr
  let drawn = [], listener = null, err1 = null, read1 = [];
  try {
    const { p, read } = posedScreen({ db: {}, room: "POSE", game: null, evSeen: null });
    const watchNarr = realFunction(orchRaw, "watchNarr", {
      appState: p, window: {}, netWatchNarr: (db, room, cb) => { listener = cb; },
      flash: (html) => { drawn.push(html); return Promise.resolve(); },
      eventDrawn: () => Promise.resolve(), subjectOf: () => null,
      /* the one door that says a line has been written (util.js lineWritten) — drawing a line calls it, and an
         unstubbed name here resolves to undefined, throws inside drawIt's own catch, and reads exactly like a
         FILTER: "drew 0 of 1 line". Stubbed, never asserted on: whether the coin is released is
         scripts/qa/line_written_one_place_check.mjs's rule, not this one's. */
      lineWritten: () => {},
    });
    if (!watchNarr) throw new Error("watchNarr not found in src/orchestrator.js");
    watchNarr();
    const line = "Crustbeard is deciding…";
    listener({ val: () => ({ html: line, variants: [], wait: true }) });
    await tick();
    read1 = [...read].filter(k => FIGHTY.test(k) || !(k in DEFAULTS));
    drawn = drawn.filter(h => h === line);
  } catch (e) { err1 = e.message; }
  rule(!err1 && drawn.length === 1,
    "a guest's narration listener draws the line it is handed while a fight is on and its own fight prompt is up (posed and run)",
    err1 ? `watchNarr could not be run posed: ${err1}` : `watchNarr, posed with a fight on, drew ${drawn.length} of 1 line — it filters on ${read1.join(", ") || "something"}`);

  // 2. POSED AND RUN — applyBattleSnap
  let rendered = 0, err2 = null, read2 = [];
  try {
    const { p, read } = posedScreen();
    const snap = { attIdx: 0, defIdx: 1, round: 1, result: { id: "battle.bothMiss" } };
    const applyBattleSnap = realFunction(orchRaw, "applyBattleSnap", {
      appState: p, renderBattleFromSnap: s => { if (s === snap) rendered++; },
    });
    if (!applyBattleSnap) throw new Error("applyBattleSnap not found in src/orchestrator.js");
    applyBattleSnap(snap);
    read2 = [...read].filter(k => FIGHTY.test(k) || !(k in DEFAULTS));
  } catch (e) { err2 = e.message; }
  rule(!err2 && rendered === 1,
    "a fight snapshot is drawn whatever this screen is doing — its own fight prompt up included (posed and run)",
    err2 ? `applyBattleSnap could not be run posed: ${err2}` : `applyBattleSnap, posed with its own fight prompt up, drew the snapshot ${rendered} time(s) — it reads ${read2.join(", ")}`);

  // 3. NO LINE-DRAWING PATH READS A FIGHT FLAG
  const FLAG = /\b(spectatingBattle|inBattlePrompt)\b/;
  const PATHS = [
    ["src/orchestrator.js", "export function watchNarr("], ["src/orchestrator.js", "export function applyBattleSnap("],
    ["src/orchestrator.js", "export function renderBattle("], ["src/orchestrator.js", "export function netNarrate("],
    ["src/orchestrator.js", "export function netBroadcast("], ["src/orchestrator.js", "function sendNarr("],
    ["src/ui/flow.js", "export function renderBattleFromSnap("], ["src/ui/panel.js", "export async function flash("],
    ["src/ui/panel.js", "export function showNarration("], ["src/ui/panel.js", "export async function narrateLastEvent("],
    ["src/ui/util.js", "export async function narrateEvent("], ["src/ui/util.js", "export async function narrateCurrent("],
    ["src/ui/stage.js", "function stageFlash("],
  ];
  const missing = [], reading = [];
  for (const [file, head] of PATHS) {
    const b = body(strip(files[file] || ""), head);
    if (!b) { missing.push(`${file} ${head}`); continue; }
    if (FLAG.test(b)) reading.push(`${file} ${head.replace(/^export\s+|async\s+|function\s+|\($/g, "")}`);
  }
  rule(!missing.length && !reading.length,
    `no path that draws a narration line or a fight's words reads a fight flag (${PATHS.length} paths read)`,
    missing.length ? `a line-drawing path could not be found to read: ${missing.join("; ")}` : `a fight flag decides whether a line is drawn in: ${reading.join("; ")}`);

  // 4. THE FLAGS THEMSELVES — gone, both of them, everywhere under src/
  const all = Object.entries(files).map(([f, s]) => [f, strip(s)]);
  const back = all.filter(([, s]) => FLAG.test(s)).map(([f]) => f);
  rule(back.length === 0,
    "neither inBattlePrompt nor spectatingBattle exists anywhere in src/ — the flags that decided whether a line was drawn are gone",
    `a fight flag is back, in ${back.join(", ")} — the only thing either one ever did was drop a line`);

  // 5. THE FIGHT'S TWO WAITING LINES — gone from the code and from the words
  const wordsRaw = files["src/shared/words.js"] || "", words = strip(wordsRaw);
  const saidIn = all.filter(([f, s]) => f !== "src/shared/words.js" && WAIT_IDS.some(id => s.includes(`"${id}"`) || s.includes(`'${id}'`))).map(([f]) => f);
  const written = WAIT_IDS.filter(id => new RegExp(`["']${id.replace(".", "\\.")}["']\\s*:`).test(words));
  /* any OTHER line a fight says whose words are about waiting for a captain — the same line back under a new id */
  const renamed = [...words.matchAll(/["'](battle\.[A-Za-z0-9_]+)["']\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
    .filter(m => WAIT_WORDS.test(m[2]) && /\{/.test(m[2])).map(m => `${m[1]} ("${m[2]}")`);
  rule(!saidIn.length && !written.length && !renamed.length,
    `the fight says nothing about waiting for a captain's coin — ${WAIT_IDS.join(" and ")} are said nowhere in src/ and written nowhere in words.js (his ruling, 2026-09-17)`,
    [saidIn.length && `a waiting line is said again in ${saidIn.join(", ")}`,
     written.length && `${written.join(", ")} is back in words.js`,
     renamed.length && `a fight line is about waiting for a captain again, under a new name: ${renamed.join("; ")}`].filter(Boolean).join("; "));
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = await rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF — each break must turn the rule that guards against it red, not merely some rule. */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const DRAW_IF = "    if(v)\n      {";
const WAIT_LINE = `  "battle.loads": "{a} {a:loads|load} the cannon…",`;
const MUTANTS = [
  ["watchNarr's draw condition given `&&!appState.spectatingBattle` back", broken("src/orchestrator.js", DRAW_IF, "    if(v&&!appState.spectatingBattle)\n      {"), [0, 2, 3]],
  ["applyBattleSnap's `if(!appState.inBattlePrompt)` guard put back", broken("src/orchestrator.js", "  renderBattleFromSnap(snap);", "  if(!appState.inBattlePrompt)renderBattleFromSnap(snap);"), [1, 2, 3]],
  ["watchNarr filtering on a flag with a NEW name (appState.fightOnScreen)", broken("src/orchestrator.js", DRAW_IF, "    if(v&&!appState.fightOnScreen)\n      {"), [0]],
  ["the filter moved into flash() itself", broken("src/ui/panel.js", "export async function flash(msg,ms,holdMs,variants,opts){", "export async function flash(msg,ms,holdMs,variants,opts){\n  if(appState.inBattlePrompt)return;"), [2, 3]],
  ["the bubble renderer skipping lines while a fight is watched", broken("src/ui/stage.js", "  if (appState.ff) return Promise.resolve();", "  if (appState.ff || appState.spectatingBattle) return Promise.resolve();"), [2, 3]],
  ["battleAsk broadcasting the waiting line again (battle.waitFor)", broken("src/orchestrator.js", "  let idxP;\n  if(decisionIsLocal(askSeat)){",
    `  netBroadcast(sayAll("battle.waitFor",{a:seat(o.att.idx),d:seat(o.def.idx),who:seat(askSeat)}).html,[]);\n  let idxP;\n  if(decisionIsLocal(askSeat)){`), [4]],
  ["both waiting lines back in words.js", broken("src/shared/words.js", WAIT_LINE,
    `  "battle.waitDefend": "⚔️ {a} {a:attacks|attack} {d}! Waiting for {d} to defend…",\n  "battle.waitFor": "⚔️ {a} {a:attacks|attack} {d} — waiting for {who}…",\n${WAIT_LINE}`), [4]],
  ["the same waiting line back under a new name (battle.holdOn)", broken("src/shared/words.js", WAIT_LINE,
    `  "battle.holdOn": "⚔️ {a} {a:attacks|attack} {d} — waiting for {who}…",\n${WAIT_LINE}`), [4]],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? await rules(mutant) : null;
  const red = !!res && idx.every(i => !res[i].ok);
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `turns rule${idx.length > 1 ? "s" : ""} ${idx.map(i => i + 1).join(", ")} red` : mutant ? `LEAVES rule(s) ${idx.filter(i => res[i].ok).map(i => i + 1).join(", ")} GREEN` : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — a line is drawn when it arrives, fight or no fight, and the fight says nothing about waiting; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
