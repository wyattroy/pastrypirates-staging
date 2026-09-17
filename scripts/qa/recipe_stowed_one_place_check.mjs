#!/usr/bin/env node
/* WHEN "YER RECIPE'S STOWED BELOW" IS SHOWN — DECIDED IN ONE PLACE, ONCE PER DEVICE.
   Architecture item 11 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md, CEO correction 1), 2026-09-17.
   THE FAULT IT HOLDS SHUT: the recipe-stowed lesson card and the captains-box blink were decided twice — in the one event
   consumer (consumeEvent, on `recipeSet`) and again in the host's draft loop (recipeDraftNet), which fbf0993e left behind
   when it wrote the consumer's copy. The loop carried the only "one showing per device" rule; the consumer had none.
   MEASURED BEFORE (e111c41c, headless phone 375x812 dsf 3, touch, a first-time device answering "Nah"):
     · solo — two cards (the long one, then "…ticked as ye hold 'em."), two blinks, two of the ladder's three lines spent;
     · pass-and-play, three humans — three cards drawn in one tick (two overwritten unseen), three blinks, the whole ladder
       spent in one voyage: the only card anyone could read was its last line, "Yer recipe's stowed below."
   THE RULES (each red-proofed below against a mutant of the real source, built in memory; comments stripped first):
     1. THE CARD — `pilotGate("recipe.stowed"` and `pilotSpeaks("recipe.stowed"` each appear exactly once in src/, inside
        consumeEvent; the ladder's id is named nowhere else outside the words.
     2. THE BLINK — flashCaptainsBox() is called exactly once in src/, inside consumeEvent, and nothing else writes its class.
     3. THE FLOW ONLY WAITS — recipeDraftNet decides nothing about the card (no ladder id, no pilotSpeaks, no pilotGate, no
        blink) and still waits for the card the consumer made before the voyage sails on.
     4. ONE SHOWING PER DEVICE, IN THE CONSUMER — the card's statement asks whether this device has shown it for THIS voyage
        and records that it has.
     5. BEHAVIOUR — posed tables run through the consumer's own `recipeSet` statements, recipeDraftNet's own code after its
        drain, flow.js's own pilotGate and the real Pilot ladder (src/ui/pilot.js), with the real decisionIsLocal:
          a pass-and-play table with THREE humans and a bot spends ONE rung — one card, the ladder's first line, naming the
          first human; one blink;
          a solo table (one human, three bots) — one card, one blink, one rung;
          a crew guest (seat 1 of 4, no draft loop of its own) handed every pick twice, as a crew device is today — one card
          naming seat 1;
          a veteran (the ladder at its silent bottom rung) — no card, no blink, nothing spent;
          the host's flow does not sail on while the card is up;
          the next voyage on the same device is taught again (its own card, the ladder's next line).
   `node scripts/qa/recipe_stowed_one_place_check.mjs --ref=<sha>` runs the rules on the files as they were at <sha>
   (e111c41c, the tree before this item, fails rules 1-5). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { appState } = await import(pathToFileURL(path.join(REPO, "src/state/index.js")).href);
const { decisionIsLocal, say } = await import(pathToFileURL(path.join(REPO, "src/ui/util.js")).href);
const pilot = await import(pathToFileURL(path.join(REPO, "src/ui/pilot.js")).href);
const ORCH = "src/orchestrator.js", FLOW = "src/ui/flow.js", WORDS = "src/shared/words.js";
const ID = "recipe.stowed";
const refArg = process.argv.find(a => a.startsWith("--ref="));
const ref = refArg ? refArg.slice(6) : null;
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const readFile = f => ref ? execFileSync("git", ["show", `${ref}:${f}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) : fs.readFileSync(path.join(REPO, f), "utf8");
const list = ref ? execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "src"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(f => f.endsWith(".js"))
                 : walk("src").map(f => f.split(path.sep).join("/"));

/* A body by brace matching, after the parameter list (skipped whole). Returns [start, end) of the whole function text. */
function span(src, head) {
  const h = src.indexOf(head); if (h < 0) return null;
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); const open = j; d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return { start: h, open, end: j + 1 };
}
const text = (src, head) => { const s = span(src, head); return s ? src.slice(s.start, s.end) : ""; };
const count = (s, needle) => s.split(needle).length - 1;
const CONSUMER = "export async function consumeEvent(e){", DRAFT = "export async function recipeDraftNet(){", BLINK = "function flashCaptainsBox(){";

/* Every `if(…)` statement in the consumer whose condition names recipeSet, outermost only. */
function recipeSetStatements(body) {
  const out = []; let taken = -1;
  for (const m of body.matchAll(/\bif\s*\(/g)) {
    if (m.index < taken) continue;
    let j = m.index + m[0].length - 1, d = 0;
    for (; j < body.length; j++) { if (body[j] === "(") d++; else if (body[j] === ")") { d--; if (!d) break; } }
    const cond = body.slice(m.index, j + 1);
    if (!/"recipeSet"/.test(cond)) continue;
    let k = j + 1; while (/\s/.test(body[k])) k++;
    if (body[k] === "{") { d = 0; for (; k < body.length; k++) { if (body[k] === "{") d++; else if (body[k] === "}") { d--; if (!d) break; } } k++; }
    else { d = 0; for (; k < body.length; k++) { const c = body[k]; if ("({[".includes(c)) d++; else if (")}]".includes(c)) d--; else if (c === ";" && !d) break; } k++; }
    let rest = k; while (/\s/.test(body[rest] || "")) rest++;
    if (body.startsWith("else", rest)) throw new Error("a recipeSet statement in consumeEvent has an else branch this harness does not run");
    out.push({ cond, code: body.slice(m.index, k) }); taken = k;
  }
  return out;
}

/* THE HARNESS: the consumer's recipeSet statements, recipeDraftNet's code after its drain, and flow.js's pilotGate, compiled
   together with the module-level `let`s they share, over the real Pilot and the real decisionIsLocal. */
function harness(S) {
  const orch = S[ORCH], flow = S[FLOW];
  const consumer = text(orch, CONSUMER), draft = text(orch, DRAFT), gate = text(flow, "export async function pilotGate(");
  if (!consumer || !draft || !gate) throw new Error("consumeEvent, recipeDraftNet or pilotGate is missing");
  const statements = recipeSetStatements(consumer).map(s => s.code);
  const drain = draft.indexOf("await liveRender();");
  if (drain < 0) throw new Error("recipeDraftNet no longer drains with `await liveRender();`");
  const tail = draft.slice(drain + "await liveRender();".length, draft.lastIndexOf("}"));
  const code = statements.join("\n") + "\n" + tail;
  const lets = [...orch.matchAll(/^let\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*);/gm)].filter(m => new RegExp(`\\b${m[1].replace(/\$/g, "\\$")}\\b`).test(code)).map(m => m[0]).join("\n");
  const makeGate = new Function("pilotSpeaks", "pilotLine", "pilotSee", "localAsk", "say", `return ${gate.replace(/^export\s+/, "")};`);
  /* `updateRecipeBanner` joined the injected names on 2026-09-17 (architecture item 10 gave the consumer's recipeSet
     statements the one banner refresh). It is a stub here for the same reason `window` is: this gate is about the CARD,
     and a repaint of the recipe band decides nothing about whether one is shown. Nothing below was relaxed. */
  const make = new Function("appState", "decisionIsLocal", "pilotSpeaks", "pilotGate", "flashCaptainsBox", "pn", "window", "updateRecipeBanner",
    `${lets}\nasync function consume(e){\n${statements.join("\n")}\n}\nasync function afterDrain(){\n${tail}\n}\nreturn {consume, afterDrain};`);
  return { makeGate, make };
}
const NAMES = ["Anne", "Mary", "Ned", "Jack"];
const tick = () => new Promise(r => setTimeout(r, 0));
async function table(H, { strategies, passAndPlay, mySeat, deliveries = 1, voyages = 1, veteran = false, hostFlow = true }) {
  pilot.__pilotPose({ met: true, seen: veteran ? { [ID]: pilot.pilotDepth(ID) - 1 } : {} });
  const cards = [], pending = [];
  let blinks = 0;
  const localAsk = (msg) => new Promise(res => { cards.push(msg); pending.push(res); });
  const pilotGate = H.makeGate(pilot.pilotSpeaks, pilot.pilotLine, pilot.pilotSee, localAsk, say);
  const h = H.make(appState, decisionIsLocal, pilot.pilotSpeaks, pilotGate, () => { blinks++; }, i => NAMES[i], {}, () => {});
  const before = pilot.__pilotPeek().seen[ID] | 0;
  const perVoyage = []; let flowWaited = true;
  for (let v = 0; v < voyages; v++) {
    const c0 = cards.length, b0 = blinks, r0 = pilot.__pilotPeek().seen[ID] | 0;
    appState.game = { players: strategies.map((strategy, idx) => ({ idx, strategy })) };   // a new voyage: a new game
    appState.passAndPlay = passAndPlay; appState.mySeat = mySeat; appState.replaying = false;
    for (let d = 0; d < deliveries; d++) for (const p of appState.game.players) await h.consume({ t: "recipeSet", p: p.idx });
    let sailed = false;
    const flow = (hostFlow ? h.afterDrain() : Promise.resolve()).then(() => { sailed = true; });   // a guest has no draft loop
    await tick(); await tick();
    if (pending.length && sailed) flowWaited = false;          // a card is up and the voyage has already sailed on
    for (let k = 0; k < 40 && !sailed; k++) { pending.splice(0).forEach(r => r(0)); await tick(); }   // tap Aye aye on whatever is up
    await flow;
    pending.splice(0).forEach(r => r(0));
    perVoyage.push({ cards: cards.slice(c0), blinks: blinks - b0, rungs: (pilot.__pilotPeek().seen[ID] | 0) - r0 });
  }
  return { perVoyage, flowWaited, spent: (pilot.__pilotPeek().seen[ID] | 0) - before };
}

async function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const orch = S[ORCH];
  const src = Object.entries(S).filter(([f]) => f !== WORDS);
  const consumer = text(orch, CONSUMER), draft = text(orch, DRAFT), blink = text(orch, BLINK);
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const where = needle => src.filter(([, s]) => s.includes(needle)).map(([f, s]) => `${f} ×${count(s, needle)}`).join(", ") || "nowhere";

  // 1. THE CARD
  {
    const g = src.reduce((n, [, s]) => n + count(s, `pilotGate("${ID}"`), 0), sp = src.reduce((n, [, s]) => n + count(s, `pilotSpeaks("${ID}"`), 0);
    const ids = src.reduce((n, [, s]) => n + count(s, `"${ID}"`), 0);
    const inside = count(consumer, `pilotGate("${ID}"`) === 1 && count(consumer, `pilotSpeaks("${ID}"`) === 1 && count(consumer, `"${ID}"`) === 2;
    rule(g === 1 && sp === 1 && ids === 2 && inside,
      `the card is decided in one place: consumeEvent asks the ladder (pilotSpeaks) and shows the card (pilotGate) once each, and "${ID}" is named nowhere else outside the words`,
      `the card is decided in more than one place — pilotGate("${ID}" in ${where(`pilotGate("${ID}"`)}; pilotSpeaks("${ID}" in ${where(`pilotSpeaks("${ID}"`)}; the id in ${where(`"${ID}"`)}`);
  }
  // 2. THE BLINK
  {
    const calls = src.reduce((n, [, s]) => n + (s.match(/\bflashCaptainsBox\s*\(/g) || []).length, 0) - (/\bfunction\s+flashCaptainsBox\s*\(/.test(orch) ? 1 : 0);
    const inConsumer = (consumer.match(/\bflashCaptainsBox\s*\(/g) || []).length;
    const classWriters = src.reduce((n, [, s]) => n + count(s, `"pp4StowFlash"`), 0), inBlink = count(blink, `"pp4StowFlash"`);
    rule(calls === 1 && inConsumer === 1 && blink && classWriters === inBlink,
      "the captains box blinks from one place: flashCaptainsBox() is called once, inside consumeEvent, and nothing else writes its class",
      `the captains box is blinked from ${calls} call site(s) (${inConsumer} in consumeEvent), or its class is written outside flashCaptainsBox (${classWriters - inBlink})`);
  }
  // 3. THE FLOW ONLY WAITS
  {
    const decides = [`"${ID}"`, "pilotSpeaks(", "pilotGate(", "flashCaptainsBox("].filter(n => draft.includes(n));
    const waits = /if\s*\(\s*stowedGate\s*\)\s*\{[^}]*await\s+\w+/.test(draft);
    rule(draft && !decides.length && waits,
      "recipeDraftNet decides nothing about the card and waits for the one the consumer made before sailing on",
      !draft ? "recipeDraftNet is missing" : decides.length ? `recipeDraftNet decides the card itself again (${decides.join(", ")})` : "recipeDraftNet no longer waits for the card (stowedGate) before sailing on");
  }
  // 4. ONE SHOWING PER DEVICE, IN THE CONSUMER
  let statements = [];
  try { statements = recipeSetStatements(consumer); } catch (e) { statements = []; }
  {
    const card = statements.find(s => s.code.includes(`pilotGate("${ID}"`));
    const m = card && card.cond.match(/\b([A-Za-z_$][\w$]*)\s*!==\s*appState\.game\b/);
    const marks = m && new RegExp(`\\b${m[1]}\\s*=\\s*appState\\.game\\s*;`).test(card.code.slice(card.cond.length));
    rule(!!(card && m && marks),
      `the consumer's card carries the one-showing-per-device rule: it asks whether this device has shown it for this voyage (${m ? m[1] : "?"}) and records that it has`,
      card ? "the consumer's card has no one-showing-per-device rule — every seat at this device gets its own card and spends its own rung" : `consumeEvent shows no card on a recipeSet statement`);
  }
  // 5. BEHAVIOUR
  {
    let bad = [];
    try {
      const H = harness(S);
      const one = (r, what, first) => {
        const v = r.perVoyage[0];
        if (v.cards.length !== 1 || v.blinks !== 1 || v.rungs !== 1) bad.push(`${what}: ${v.cards.length} card(s), ${v.blinks} blink(s), ${v.rungs} rung(s) — one each wanted`);
        else if (v.cards[0] !== pilot.LADDERS[ID][0].replace("{name}", NAMES[first])) bad.push(`${what}: the card read "${v.cards[0]}" — the ladder's first line for ${NAMES[first]} wanted`);
      };
      const pnp = await table(H, { strategies: ["human", "human", "human", "rusher"], passAndPlay: true, mySeat: 0 });
      one(pnp, "pass-and-play, three humans", 0);
      one(await table(H, { strategies: ["human", "pirate", "trader", "rusher"], passAndPlay: false, mySeat: 0 }), "solo", 0);
      one(await table(H, { strategies: ["human", "human", "pirate", "trader"], passAndPlay: false, mySeat: 1, deliveries: 2, hostFlow: false }), "a crew guest at seat 1, each pick delivered twice", 1);
      const vet = await table(H, { strategies: ["human", "pirate", "trader", "rusher"], passAndPlay: false, mySeat: 0, veteran: true });
      if (vet.perVoyage[0].cards.length || vet.perVoyage[0].blinks || vet.spent) bad.push(`a veteran: ${vet.perVoyage[0].cards.length} card(s), ${vet.perVoyage[0].blinks} blink(s), ${vet.spent} rung(s) — nothing wanted`);
      if (!pnp.flowWaited) bad.push("the host's flow sailed on while the card was still up");
      const two = await table(H, { strategies: ["human", "human", "human", "rusher"], passAndPlay: true, mySeat: 0, voyages: 2 });
      const v2 = two.perVoyage[1];
      if (v2.cards.length !== 1 || v2.rungs !== 1 || v2.cards[0] !== pilot.LADDERS[ID][1]) bad.push(`the next voyage on the same device: ${v2.cards.length} card(s), ${v2.rungs} rung(s)${v2.cards[0] ? `, "${v2.cards[0]}"` : ""} — its own card, the ladder's second line, wanted`);
    } catch (e) { bad.push(`the posed tables could not be run: ${e.message}`); }
    rule(!bad.length,
      "posed tables: three humans passing one phone spend ONE rung (one card, its first line, one blink); solo and a crew device each get one card; a veteran gets none; the flow waits; the next voyage is taught again",
      bad.join("; "));
  }
  return out;
}

const files = Object.fromEntries(list.map(f => [f, readFile(f)]));
console.log(`recipe stowed, one place — ${ref ? "files at " + ref : "working tree"}\n`);
const real = await rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
let proofOk = true;
if (!ref) {
  /* RED-PROOF: each mutant must turn the rule(s) that guard against it red. */
  const LOOP = `
  if(!appState.replaying)for(const player of appState.game.players){
    if(player.strategy!=="human"||!decisionIsLocal(player.idx))continue;
    if(!pilotSpeaks("recipe.stowed"))break;
    flashCaptainsBox();
    await pilotGate("recipe.stowed",t=>t.replace("{name}",pn(player.idx)));
    break;
  }`;
  const WAIT = "if(stowedGate){ const g=stowedGate; stowedGate=null; await g; }";
  const RULE = "&&stowedShownFor!==appState.game";
  const broken = (edits) => { let s = files[ORCH]; for (const [from, to] of edits) { if (!s.includes(from)) return null; s = s.replace(from, to); } return { ...files, [ORCH]: s }; };
  const MUTANTS = [
    ["the host loop's copy of the card put back into recipeDraftNet", broken([[WAIT, WAIT + LOOP]]), [0, 1, 2, 4]],
    ["the consumer's card without the one-showing-per-device rule", broken([[RULE, ""]]), [3, 4]],
    ["the tree before item 11 (both at once)", broken([[WAIT, WAIT + LOOP], [RULE, ""]]), [0, 1, 2, 3, 4]],
    ["the rule kept as a plain true/false, so a device is never taught again", broken([[RULE, "&&!stowedShownFor"], ["stowedShownFor=appState.game;", "stowedShownFor=true;"]]), [4]],
    ["recipeDraftNet no longer waiting for the card", broken([[WAIT, ""]]), [2, 4]],
  ];
  for (const [what, mutant, idxs] of MUTANTS) {
    const res = mutant ? await rules(mutant) : null;
    const red = !!res && idxs.every(i => res[i] && !res[i].ok);
    if (process.argv.includes("--verbose") && res) for (const i of idxs) console.log(`        rule ${i + 1} on this mutant: ${res[i].text}`);
    if (!red) proofOk = false;
    console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `turns rule(s) ${idxs.map(i => i + 1).join(", ")} red` : mutant ? `STAYS GREEN on rule(s) ${idxs.filter(i => res[i].ok).map(i => i + 1).join(", ")}` : "could not be built (the source moved)"}`);
  }
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — "yer recipe's stowed below" is shown from one place, once per device; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
