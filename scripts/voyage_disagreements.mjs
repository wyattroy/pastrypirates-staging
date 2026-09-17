#!/usr/bin/env node
// WHERE THE BOTS DISAGREE WITH A WINNING HUMAN.
// Wyatt, 2026-09-16: "i like this idea though: 'ask the bot's planner what it would have done on each of your turns —
// a list of the exact moments the bots disagree with a winning human, in the game's own words.'"
//
//   node scripts/voyage_disagreements.mjs --selftest [voyages]     prove the instrument first (no player data)
//   node scripts/voyage_disagreements.mjs --dir <folder>           ask about voyage logs saved as JSON files
//   node scripts/voyage_disagreements.mjs --firebase --since 2026-09-20   ask about players' voyages logged since that day
//   add --html <file> to write the page; --all to include voyages a human did not win; --include-dev for a developer's own machine
//
// The engine half — rebuilding a voyage's board and asking the ONE bot brain — is scripts/lib/voyage_ask.mjs.
//
// PLAYER NAMES NEVER LEAVE THE FETCH. A voyage log records the names people typed (the privacy page says so). This
// asks nothing that needs one, so --firebase deletes `names` from each record the moment it is parsed: no name is
// written to disk, printed, or put on the page.
import fs from "node:fs";
import path from "node:path";
import { Game, roundCfg } from "../src/engine/index.js";
import { askable, askVoyage, agree, list, ASK_AS } from "./lib/voyage_ask.mjs";
import { isLiveHost } from "../src/shared/host.js";

const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const DB = "https://pastry-pirates-default-rtdb.firebaseio.com";
const QA_PLAYER_ID = "qa-playtest-gate";   // scripts/playtest_gate.mjs stamps its voyages with this pid

/* What Firebase hands back: no empty lists, no nulls. The self-test's voyages are put through the same shape. */
const firebaseShape = v => JSON.parse(JSON.stringify(v, (k, x) => (x === null || (Array.isArray(x) && x.length === 0)) ? undefined : x));

/* A voyage log made in node exactly as the game writes one, except the "human" at seat 0 is a bot — and what that bot
   PLANNED on each of its turns is kept beside it, which a human's voyage can never offer. */
function sailVoyage(seed, seat0) {
  const strategies = [seat0 === "passer" ? ASK_AS : seat0, "pirate", "trader", "rusher"];
  const plans = new Map();   // event index of seat 0's turn -> what the REAL brain planned there
  class G extends Game {
    takeTurn(p, w, s) {
      if (seat0 === "passer" && p.idx === 0) { this.ev({ t: "turn", p: 0 }); this.doPass(p); return; }
      return super.takeTurn(p, w, s);
    }
    planTurn(p) {
      const r = super.planTurn(p);
      if (p.idx === 0) plans.set(this.events.length - 1, { type: r.type === "sail" && r.cell && r.cell[0] === p.pos[0] && r.cell[1] === p.pos[1] ? "stay" : r.type,
        cell: r.cell ? [...r.cell] : [...p.pos], ing: r.ing || null, target: r.target ? r.target.idx : null });
      return r;
    }
  }
  const cfg = { ...roundCfg(strategies), bakeoff: true };
  const g = new G(cfg, seed, true);
  const winner = g.play();
  const logged = [...strategies]; logged[0] = "human";
  const rec = firebaseShape({ seed, cfg: { ...cfg, strategies: logged }, host: "selftest", bots: [false, true, true, true],
    winner, round: g.round, strategies: logged, events: g.events });
  return { rec, plans };
}
/* THE SELF-TEST, three arms:
   1. FIDELITY — the rebuilt board's answer against what the REAL brain planned on that same turn. Not against what it
      then did: measured 2026-09-16, 15 of 302 turns had a real bot PLAN a trade, sail for it, and never make the offer
      (BOT-DESIGN-PRINCIPLES principle 3's "a trade committed to and never spoken", still alive). Comparing to the action
      blamed the instrument for the bot's own dead turn.
   2. and 3. DISCRIMINATION — compared the way a human is compared (against what was done): voyages a rusher sailed, and
      voyages of a captain who only ever passes. The passer must come out far below the same brain, or the comparison
      cannot tell a good turn from a wasted one. */
function selfTest(n) {
  let fTurns = 0, fAgreed = 0, mapBad = 0; const misses = {};
  let sameTurns = 0, sameAgreed = 0;
  for (let s = 1; s <= n; s++) {
    const { rec, plans } = sailVoyage(s * 7919, ASK_AS);
    const r = askVoyage(rec, { onTurn: (i, seat, h, b) => {
      const real = plans.get(i); if (!real) return;
      fTurns++;
      if (agree(real, b)) fAgreed++; else { const k = `${real.type} -> ${b.type}`; misses[k] = (misses[k] || 0) + 1; }
    } });
    if (!r.map.ok) mapBad++;
    sameTurns += r.turns; sameAgreed += r.agreed;
  }
  const fidelity = fTurns ? fAgreed / fTurns : 0;
  console.log(`  1. the rebuilt board against the real bot's own plan: agrees on ${(100 * fidelity).toFixed(1)}% of ${fTurns} turns` +
    `${Object.keys(misses).length ? `  (misses: ${JSON.stringify(misses)})` : ""}${mapBad ? `  — ${mapBad} maps did NOT match` : ""}`);
  const rate = seat0 => { let t = 0, a = 0; for (let s = 1; s <= n; s++) { const r = askVoyage(sailVoyage(s * 7919, seat0).rec); t += r.turns; a += r.agreed; } return t ? a / t : 0; };
  const same = sameTurns ? sameAgreed / sameTurns : 0, rusher = rate("rusher"), passer = rate("passer");
  console.log(`  2. against what was DONE: the same brain ${(100 * same).toFixed(1)}%, a rusher ${(100 * rusher).toFixed(1)}%, a captain who only passes ${(100 * passer).toFixed(1)}%`);
  let errorIsError = false;
  try { readJson('{"error":"startAt not supported for with shallow GET"}', "self-test"); } catch (e) { errorIsError = /refused/.test(e.message); }
  console.log(`  3. a database error ${errorIsError ? "stops the run" : "IS READ AS DATA — it would report zero voyages"}`);
  const ok = mapBad === 0 && fidelity >= 0.95 && same - passer >= 0.5 && errorIsError;
  console.log(ok ? "\nTHE INSTRUMENT HOLDS — it rebuilds the board a bot planned on, and it tells a real turn from a wasted one."
                 : "\nTHE INSTRUMENT DOES NOT HOLD — do not read anything it says about a human.");
  return ok;
}

/* ---------------------------------------------------------------------------------------------------------------
   THE PLAYERS' VOYAGES. */
/* ONLY WHAT WAS LOGGED SINCE --since. A log's key is the millisecond it was written. Firebase will not order or range a keys-only read
   (shallow=true refuses orderBy and startAt), so the keys are read bare — names only, never content — and filtered here, and only the
   logs from that moment on are downloaded. The 585 logs from before the seed was recorded cannot be asked about, and there is no reason to
   fetch a player's name along with one.
   ⛔ A DATABASE ERROR IS AN ERROR, NEVER "NO VOYAGES". The first version sent shallow+startAt, the database answered {"error": ...}, and
   the script read that object's one key, "error", as a list of zero voyages — reporting "0 voyage logs" with a straight face (2026-09-16).
   readJson now throws on any error answer, and --selftest proves it does. */
export function readJson(text, what) {
  let j; try { j = JSON.parse(text); } catch (e) { throw new Error(`${what}: the database did not answer with JSON (${String(text).slice(0, 80)})`); }
  if (j && typeof j === "object" && !Array.isArray(j) && typeof j.error === "string") throw new Error(`${what}: the database refused — ${j.error}`);
  return j;
}
async function fromFirebase(since) {
  const from = Date.parse(since);
  if (!Number.isFinite(from)) { console.log("--firebase needs --since <date>, e.g. --since 2026-09-20"); process.exit(2); }
  const keys = Object.keys(readJson(await (await fetch(`${DB}/gamelogs.json?shallow=true`)).text(), "reading the voyage log keys") || {})
    .filter(k => /^\d+$/.test(k) && +k >= from).sort((a, b) => a - b);
  const recs = [];
  for (const k of keys) {
    const rec = readJson(await (await fetch(`${DB}/gamelogs/${k}.json`)).text(), `reading voyage log ${k}`);
    if (!rec) continue;
    delete rec.names;                               // never kept, never written, never shown
    if (!askable(rec)) continue;                    // a log from before 2026-09-16 has no seed: its map cannot be rebuilt
    recs.push({ key: k, rec });
  }
  console.log(`${keys.length} voyage log(s) written since ${new Date(from).toISOString()}`);
  return recs;
}
function fromDir(dir) {
  const recs = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const [key, rec] of Object.entries(askable(d) ? { [f]: d } : d)) { if (rec && typeof rec === "object") { delete rec.names; if (askable(rec)) recs.push({ key, rec }); } }
  }
  return recs;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const WORD = { stay: "stayed put", sail: "sailed", dock: "docked", attack: "attacked", trade: "traded" };

function page(results, meta) {
  const asked = results.filter(r => r.map.ok);
  const turns = asked.reduce((a, r) => a + r.turns, 0), agreed = asked.reduce((a, r) => a + r.agreed, 0);
  const buys = asked.reduce((a, r) => a + r.buys, 0), buysAgreed = asked.reduce((a, r) => a + r.buysAgreed, 0);
  const pairs = {};
  for (const r of asked) for (const [k, n] of Object.entries(r.pairs)) { const [h, b] = k.split(">"); if (h !== b) pairs[k] = (pairs[k] || 0) + n; }
  const top = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pct = (a, b) => b ? Math.round(100 * a / b) + "%" : "—";
  const voyage = (r, i) => `
    <section class="voy">
      <h3>Voyage ${i + 1} <span class="tag ${r.won ? "won" : ""}">${r.won ? "won by the human" : "a bot won"}</span></h3>
      <p class="meta">${r.days} days · agreed on ${r.agreed} of ${r.turns} turns (${pct(r.agreed, r.turns)}) · ${r.buysAgreed} of ${r.buys} buys</p>
      ${r.moments.length ? `<ol class="moments">${r.moments.map(m => `<li><b>Day ${m.day}</b> ${esc(m.said)}</li>`).join("")}</ol>` : `<p class="meta">No turn where a bot would have done otherwise.</p>`}
      ${r.buyMoments.length ? `<h4>At the docks</h4><ol class="moments">${r.buyMoments.map(m => `<li><b>Day ${m.day}</b> ${esc(m.said)}</li>`).join("")}</ol>` : ""}
    </section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Where the Bots Disagree</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>
:root{--bg:#f3ecdc;--card:#fffcf4;--line:#dfd2b6;--text:#23303a;--muted:#6b6252;--sea:#1b8796;--wood:#83562a;--won:#1f9e6e;--shade:0 1px 2px rgba(45,30,10,.07),0 6px 18px rgba(45,30,10,.07)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121a1e;--card:#19242a;--line:#2d3d45;--text:#e8f0f2;--muted:#98a7a3;--sea:#4cc3d2;--wood:#d49a5c;--won:#46c996;--shade:0 1px 2px rgba(0,0,0,.5)}}
:root[data-theme="dark"]{--bg:#121a1e;--card:#19242a;--line:#2d3d45;--text:#e8f0f2;--muted:#98a7a3;--sea:#4cc3d2;--wood:#d49a5c;--won:#46c996;--shade:0 1px 2px rgba(0,0,0,.5)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 "Source Sans 3",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 64px}
h1{font:700 clamp(26px,6vw,36px)/1.15 "Zilla Slab",Georgia,serif;margin:0 0 6px;text-wrap:balance}
h2{font:700 20px/1.3 "Zilla Slab",Georgia,serif;color:var(--wood);margin:32px 0 8px}
h3{font:700 17px/1.3 "Zilla Slab",Georgia,serif;margin:0 0 2px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
h4{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
.lede{color:var(--muted);max-width:62ch;margin:0 0 18px}
.figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:360px){.figs{grid-template-columns:1fr}}
.fig{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.fig b{display:block;font:700 24px/1.1 "Zilla Slab",Georgia,serif;color:var(--sea);font-variant-numeric:tabular-nums}
.fig span{display:block;font-size:13px;line-height:1.35;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
td,th{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
th{font-size:12.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:600}
td.n{text-align:right;width:4.5em}
.voy{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 12px;box-shadow:var(--shade)}
.meta{color:var(--muted);font-size:14px;margin:2px 0 8px}
.tag{font:600 12px/1 "Source Sans 3",sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:4px 8px}
.tag.won{color:var(--won);border-color:currentColor}
.moments{margin:0;padding-left:1.3em}
.moments li{margin:0 0 5px}
.moments b{color:var(--wood);font-weight:700;margin-right:4px}
.note{font-size:14px;color:var(--muted);border-left:3px solid var(--line);padding:2px 0 2px 12px;margin:18px 0 0;max-width:62ch}
</style></head><body><div class="wrap">
<h1>Where the bots disagree</h1>
<p class="lede">At the top of each of ${meta.whose} turns, the board was set back exactly as it stood and a ${ASK_AS} bot was asked what it would do. Every line below is a turn where the bot would have played it differently.</p>
<div class="figs">
  <div class="fig"><b>${asked.length}</b><span>voyages asked${meta.wonOnly ? ", each won by a human" : ""}</span></div>
  <div class="fig"><b>${pct(agreed, turns)}</b><span>of ${turns} turns, the bot agreed</span></div>
  <div class="fig"><b>${pct(buysAgreed, buys)}</b><span>of ${buys} dock buys, the bot agreed</span></div>
</div>
${top.length ? `<h2>Where they part ways most</h2>
<table><thead><tr><th>The human</th><th>A bot would have</th><th class="n">Turns</th></tr></thead><tbody>
${top.map(([k, n]) => { const [h, b] = k.split(">"); return `<tr><td>${WORD[h] || h}</td><td>${WORD[b] || b}</td><td class="n">${n}</td></tr>`; }).join("")}
</tbody></table>` : ""}
<h2>Turn by turn</h2>
${asked.map(voyage).join("")}
<p class="note">${esc(meta.note)}</p>
</div></body></html>`;
}

/* --------------------------------------------------------------------------------------------------------------- */
if (flag("--selftest")) {
  const n = +(opt("--selftest") || 20) || 20;
  console.log(`self-test: ${n} voyages an arm, asked as a ${ASK_AS} bot\n`);
  const ok = selfTest(n);
  if (opt("--html")) {
    const demo = [1, 2, 3, 4, 5, 6].map(s => askVoyage(sailVoyage(s * 104729, "pirate").rec));
    fs.writeFileSync(opt("--html"), page(demo, { whose: "a pirate bot's", wonOnly: false,
      note: "A DEMONSTRATION, not players: these voyages were sailed in node by a pirate bot sitting in the human's seat, so the page can be seen before any real voyage carries its seed. Built by scripts/voyage_disagreements.mjs --selftest." }));
    console.log(`page written: ${opt("--html")}`);
  }
  process.exit(ok ? 0 : 1);
}

const source = flag("--firebase") ? await fromFirebase(opt("--since")) : opt("--dir") ? fromDir(opt("--dir")) : null;
if (!source) { console.log("give --selftest, --dir <folder> or --firebase"); process.exit(2); }
/* WHOSE VOYAGES COUNT. Wyatt, 2026-09-16: "is it watching my playtests on staging to? it should be! i'm very good at this game, and it should
   learn from me. Also, it should only try to learn from humans who win. we don't want the bots learning bad moves from bad human players."
   So staging counts as well as the live game — it is where he plays — and a probe's or a sea trial's voyage never does: those play on a
   developer's own machine (localhost), and the playtest gate stamps its own pid besides. Only voyages a human WON are asked (below). */
const fromPeople = rec => (isLiveHost(rec.host) || /^staging\./.test(String(rec.host || "")) || flag("--include-dev")) && rec.pid !== QA_PLAYER_ID;
const players = source.filter(({ rec }) => fromPeople(rec));
const results = players.map(({ rec }) => askVoyage(rec)).filter(r => flag("--all") || r.won);
const skipped = results.filter(r => !r.map.ok).length;
console.log(`${source.length} voyage logs carry a seed; ${players.length} were played by people (the live game or staging); ` +
  `${results.length} ${flag("--all") ? "asked" : "were won by a human"}${skipped ? ` (${skipped} on a map this build no longer draws, left out)` : ""}`);
for (const [i, r] of results.entries()) if (r.map.ok) console.log(`  voyage ${i + 1}: ${r.days} days, agreed ${r.agreed}/${r.turns} turns, ${r.buysAgreed}/${r.buys} buys`);
if (opt("--html")) {
  fs.writeFileSync(opt("--html"), page(results, { whose: flag("--all") ? "the human captains'" : "the winning captain's", wonOnly: !flag("--all"),
    note: `From the live game's voyage logs, ${new Date().toISOString().slice(0, 10)}. No player's name is read, kept or shown. Built by scripts/voyage_disagreements.mjs.` }));
  console.log(`page written: ${opt("--html")}`);
}
