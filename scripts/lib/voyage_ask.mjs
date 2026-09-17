// ASK A BOT ABOUT A HUMAN'S VOYAGE — the engine half of scripts/voyage_disagreements.mjs.
//
// Wyatt, 2026-09-16, picking out the CEO's idea: "ask the bot's planner what it would have done on each of your
// turns — a list of the exact moments the bots disagree with a winning human, in the game's own words."
//
// HOW, AND WHY IT IS NOT A REPLAY. A voyage log (orchestrator.js writeGameLog → gamelogs/<ts>) already holds, on
// every event, each captain's square, purse and hold, every shelf's stock, the wind and the day. What it could not
// give back until 2026-09-16 was the MAP — islands and docks are drawn from the seed — so the log now carries `seed`
// and `cfg` too. From those two the engine rebuilds the very board the voyage was played on; at the top of each human
// turn the board is SET from that turn's own snapshot, and the ONE bot brain (planTurn) is asked what it would do.
// No replay, so nothing has to be deterministic across builds — only the map does, and mapMatches() checks that
// against every dock the voyage actually made before a single answer is trusted.
//
// SAFE TO ASK because the planner only reads: docs/BOT-V3-RACE-PLANNER.md, "The whole evaluation path reads state
// and returns: no this.r() draws, no events, mutate-and-restore hypotheses only". Every question still gets a board
// of its own (boardOf per turn), so one answer can never leak into the next.
//
// WHAT A REBUILT BOARD CANNOT KNOW, said once so nobody mistakes it for a replay: a bot's private memory — grudges,
// who it offered what last round, cooldowns. A human never sees those either, so the question asked is exactly
// "what would a bot do facing the board this captain faced". Every captain's recipe is set back from the log, and
// that leaks nothing: a bot reads its own recipe and nobody else's (BOT-DESIGN-PRINCIPLES principle 5).
// The CLI's --selftest measures what the missing memory costs, by asking a bot about voyages a bot actually sailed.
import { Game, roundCfg } from "../../src/engine/index.js";
import { dockPlace, iname } from "../../src/shared/index.js";

export const ASK_AS = "balanced";   // the personality asked; the table's other captains keep their own

/* Firebase drops empty arrays and turns sparse ones into objects, so every list read back is read through this. */
export const list = v => Array.isArray(v) ? v : (v && typeof v === "object"
  ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);

export const askable = rec => !!(rec && Number.isFinite(rec.seed) && rec.cfg && list(rec.cfg.strategies).length && list(rec.events).length);
export const humanSeats = rec => list(rec.bots).map((b, i) => b === false ? i : -1).filter(i => i >= 0);

export function boardOf(rec) {
  const strategies = list(rec.cfg.strategies).slice();
  // the log's cfg over the engine's defaults — Firebase may have dropped a field that was an empty list
  return new Game({ ...roundCfg(strategies), ...rec.cfg, strategies }, rec.seed, false);
}

/* THE MAP CHECK. Every dock the voyage made happened beside that island's berth; a board rebuilt from the right seed,
   on a build whose map generation has not changed, puts every one of those berths in the same place. */
export function mapMatches(g, rec) {
  let docks = 0, bad = 0;
  for (const e of list(rec.events)) {
    if (e.t !== "dock") continue;
    const sn = list(e.state)[e.p]; if (!sn || !sn.pos) continue;
    const p = g.players[e.p], keep = p.pos;
    p.pos = [...sn.pos]; docks++;
    if (g.adjPort(p) !== e.ing) bad++;
    p.pos = keep;
  }
  return { docks, bad, ok: docks > 0 && bad === 0 };
}

/* Is this square beside that island's berth? Game.adjPort answers "which port am I at" and returns only the first, so
   for a square touching two islands this asks about the one named — the same two rules adjPort uses. */
function beside(g, pos, ing) {
  if (g.cfg.singleDock) { const d = g.dockOf[ing]; return !!d && pos[0] === d[0] && pos[1] === d[1]; }
  return [[0, -1], [0, 1], [1, 0], [-1, 0]].some(([dx, dy]) => { const c = [pos[0] + dx, pos[1] + dy]; return g.isIsland(c) && g.islands[c] === ing; });
}

/* Set the rebuilt board to the moment event i was recorded. */
export function setBoard(g, E, i) {
  const e = E[i];
  g.round = e.round || 0; g.windNow = e.wind; g.windNow2 = e.wind2 ?? null; g.stormNow = !!e.storm;
  const tok = e.tokens || {}; g.tokens = {}; for (const ing of g.ings) g.tokens[ing] = tok[ing] || 0;
  g.windNext = null; g.stormNext = false;
  for (let j = i; j >= 0; j--) if (E[j].t === "newround") { g.windNext = E[j].next ?? null; g.stormNext = !!E[j].nextStorm; break; }
  const st = list(e.state);
  g.players.forEach((p, k) => {
    const sn = st[k]; if (!sn) return;
    p.pos = [...sn.pos]; p.coins = sn.coins || 0; p.ing = list(sn.ing).slice(); p.done = !!sn.done; p.baking = !!sn.baking;
    p.firstFlip = new Set(); p.dockedNow = new Set(); p.justDocked = false;
  });
  for (let j = 0; j <= i; j++) {
    const x = E[j];
    if (x.t === "recipeSet") g.players[x.p].recipe = list(x.recipe).slice();
    if (x.t === "dock") g.players[x.p].firstFlip.add(x.ing);
  }
  /* THE BERTH MEMORY, the two flags a bot's turn reads about where it last docked. Found by diffing a real bot's board at
     the instant it planned against the rebuilt one (2026-09-16): 13 of the 15 turns still disagreeing had a real bot with
     justDocked set and a rebuilt board without it.
       dockedNow  — every berth this captain docked at and has not been away from since (takeTurn clears it on leaving).
       justDocked — docked and not moved a square since. A captain's own sail clears it; a storm that shoves a ship sets
                    it to whether the ship landed on a berth (the storm's own rule, isBerth). A storm is resolved at the
                    top of the round, outside anybody's turn — which is how the two kinds of move are told apart. */
  let turnOf = -1; const whoseTurn = [];
  for (let j = 0; j <= i; j++) { if (E[j].t === "newround") turnOf = -1; if (E[j].t === "turn") turnOf = E[j].p; whoseTurn[j] = turnOf; }
  for (const p of g.players) {
    let jd = false, prev = null;
    const docks = [];
    for (let j = 0; j <= i; j++) {
      const x = E[j], sn = list(x.state)[p.idx];
      if (x.t === "dock" && x.p === p.idx && j < i) { jd = true; docks.push(j); }
      else if (sn && prev && (sn.pos[0] !== prev[0] || sn.pos[1] !== prev[1])) jd = whoseTurn[j] === p.idx ? false : g.isBerth(sn.pos);
      if (sn) prev = sn.pos;
    }
    p.justDocked = jd;
    for (const j0 of docks) {
      const ing = E[j0].ing; let stayed = true;
      for (let j = j0; j <= i && stayed; j++) { const sn = list(E[j].state)[p.idx]; if (sn && !beside(g, sn.pos, ing)) stayed = false; }
      if (stayed) p.dockedNow.add(ing);
    }
  }
}

const same = (a, b) => !!(a && b && a[0] === b[0] && a[1] === b[1]);
const asBots = (g, s, askAs) => { for (const q of g.players) if (q.strategy === "human") q.strategy = askAs; if (s >= 0) g.players[s].strategy = askAs; };

/* ⭐ THE BOTS' MEMORY OF THE BOARD, REBUILT FROM WHAT HAPPENED ON IT. Measured before this existed: asked about voyages
   its OWN brain had sailed, a bot disagreed on 35 of 302 turns (11.6%) — 16 of them wanting to open a trade the real bot
   had just been refused, 8 wanting a fight it was on a rematch cooldown for. None of that is a secret: every refusal,
   trade and fight happened in front of the table, and principle 5 allows "the whole history of what everyone did".
   So it is replayed with the ENGINE'S OWN recorders — recordSkirmish, rememberHail (the one memory of a hail), noteDemand (the table's public
   record of what each captain has been seen chasing, which every offer's price and every read of an answer leans on),
   the gaveAway stamp settleTrade writes — never a copy of their rules. The refusals are the one re-derivation: the log says an offer was hailed, not
   who said no, so the responses are asked again on the board as it stood (composeOffer and collectResponses
   only read and return — checked, 2026-09-16). Walks events [from, to). */
export function replayMemory(g, E, from, to) {
  for (let j = from; j < to; j++) {
    const x = E[j];
    if (x.t === "turn" && g.players[x.p]) { g.players[x.p].grudge = null; continue; }   // planTurnV3 spends a grudge the turn it reads it
    if (x.t === "battle" || x.t === "battlenull" || x.t === "battleflee") {
      setBoard(g, E, j);
      const att = g.players[x.a], def = g.players[x.d]; if (!att || !def) continue;
      const lose = x.t === "battle" && x.winner != null ? (x.winner === x.a ? def : att) : null;
      g.recordSkirmish(att, def, lose, lose ? x.spoilIng : undefined);
      if (x.t === "battle" && x.winner != null && x.spoilIng) g.noteDemand(g.players[x.winner], x.spoilIng, 1);   // awardSpoil: the pick is public
    } else if (x.t === "trade" && x.a != null && x.b != null) {
      const p = g.players[x.a], q = g.players[x.b], round = x.round || 0;
      if (x.got) { if (!q.gaveAway) q.gaveAway = {}; q.gaveAway[x.got] = round; }
      const gave = String(x.gave || ""), hits = g.ings.filter(ing => gave.includes(ing));
      if (hits.length === 1) { if (!p.gaveAway) p.gaveAway = {}; p.gaveAway[hits[0]] = round; }
      if (x.got) g.noteDemand(p, x.got, 1);                            // settleTrade's own two notes
      if (hits.length === 1) g.noteDemand(q, hits[0], 0.5);
    } else if (x.t === "openoffer" && x.p != null && x.want) {
      setBoard(g, E, j);
      const p = g.players[x.p], offer = g.composeOffer(p, x.want);
      g.noteDemand(p, x.want, 1);                                         // tryTrade notes the ask BEFORE anyone answers
      if (!offer) continue;
      const responses = g.collectResponses(offer, p);                     // put to the offer's own audience (Game.hailAudience)
      let dealt = false;
      for (let k = j + 1; k < E.length && E[k].t !== "turn"; k++) if (E[k].t === "trade" && E[k].a === x.p) { dealt = true; break; }
      g.rememberHail(p, offer, responses, dealt);                          // the engine's one memory of a hail (architecture item 15)
    }
  }
}
const copy = o => o ? JSON.parse(JSON.stringify(o)) : o;
function copyMemory(from, to) {
  to.demand = copy(from.demand);                                          // the table's public record of who chased what
  from.players.forEach((p, k) => { const q = to.players[k];
    q.refused = copy(p.refused); q.gaveAway = copy(p.gaveAway); q.coolUntil = copy(p.coolUntil) || {};
    q.fightLog = copy(p.fightLog) || {}; q.justLost = copy(p.justLost) || null; q.grudge = copy(p.grudge) || null; });
}
/* A fresh board for one question: the voyage's map, the memory so far, the snapshot at event i. */
function boardAt(rec, mem, E, i, s, askAs) {
  const g = boardOf(rec);
  copyMemory(mem, g); setBoard(g, E, i); asBots(g, s, askAs);
  return g;
}

/* What a bot would do at the top of turn i, as a plain answer. A sail to the square it is standing on is a pass. */
export function botAnswer(g, s) {
  const p = g.players[s];
  if (!g.adjPort(p)) p.dockedNow.clear();
  const plan = g.planTurn(p);
  const route = list(p.plan).map(x => x && x.ing).filter(Boolean);
  let type = plan.type;
  if (type === "sail" && (!plan.cell || same(plan.cell, p.pos))) type = "stay";
  return { type, cell: plan.cell ? [...plan.cell] : [...p.pos], ing: plan.ing || null,
    target: plan.target ? plan.target.idx : null, route, why: plan.why || "" };
}

/* What the human actually did on turn i: everything they did before the next captain's turn began. */
export function humanAnswer(E, i, s) {
  let end = E.length;
  for (let j = i + 1; j < E.length; j++) if (E[j].t === "turn") { end = j; break; }
  const from = list(E[i].state)[s];
  const out = { type: "stay", ing: null, target: null, got: null, price: null, paidIng: null, black: 0, dockAt: -1,
    from: from ? [...from.pos] : null, cell: from ? [...from.pos] : null };
  for (let j = i + 1; j < end; j++) {
    const x = E[j], sn = list(x.state)[s];
    if (sn) out.cell = [...sn.pos];
    if (x.t === "dock" && x.p === s) Object.assign(out, { type: "dock", ing: x.ing, got: x.got, price: x.price ?? null,
      paidIng: x.paidIng ? list(x.paidIng) : null, black: x.black || 0, dockAt: j });
    else if (/^battle/.test(x.t) && x.a === s) Object.assign(out, { type: "attack", target: x.d });
    else if (x.t === "trade" && x.a === s && out.type !== "dock") out.type = "trade";
    else if ((x.t === "openoffer" || x.t === "parley") && x.p === s && out.type === "stay") out.type = "trade";
  }
  if (out.type === "stay" && out.from && !same(out.from, out.cell)) out.type = "sail";
  return out;
}

/* Do they agree? A sail agrees when the two would finish within a square of each other. */
export function agree(h, b) {
  if (h.type !== b.type) return false;
  if (h.type === "dock") return h.ing === b.ing;
  if (h.type === "attack") return h.target === b.target;
  if (h.type === "sail") return !!(h.cell && b.cell && Math.abs(h.cell[0] - b.cell[0]) + Math.abs(h.cell[1] - b.cell[1]) <= 1);
  return true;
}

/* THE BUY, asked separately: at each of the human's docks, would a bot have taken that crate? The dock event is
   recorded AFTER the buy, so the purse, the hold and the shelf are put back to the moment before it. The bot's
   answer is the engine's own `wantsCrate` — the ONE buy decision both of its turn paths ask. */
export function buyAnswer(g, x, s) {
  const p = g.players[s], bought = x.got === "bought";
  if (bought) {
    if (x.paidIng) p.ing.push(...list(x.paidIng)); else p.coins += x.price || 0;
    const k = p.ing.lastIndexOf(x.ing); if (k >= 0) p.ing.splice(k, 1);
    if (!x.black) g.tokens[x.ing] = (g.tokens[x.ing] || 0) + 1;
  }
  const price = g.cratePrice(x.ing);
  const why = g.wantsCrate(p, x.ing, price);
  return { humanBought: bought, botBuys: !!why && price != null && p.coins >= price,
    needed: g.needs(p).includes(x.ing), price, purse: p.coins, why };
}

/* The game's own words. Islands by their berths' names (dockPlace); no captain's name is ever used. */
const at = ing => dockPlace(ing) || iname(ing) || ing;
export function sayHuman(h) {
  if (h.type === "dock") return `docked at ${at(h.ing)} and ${h.got === "bought" ? "bought the crate" : "left the crate"}`;
  if (h.type === "attack") return "attacked a captain";
  if (h.type === "trade") return "offered a trade";
  if (h.type === "sail") return "sailed on";
  return "stayed put";
}
export function sayBot(b) {
  if (b.type === "dock") return `docked at ${at(b.ing)}`;
  if (b.type === "attack") return "attacked a captain";
  if (b.type === "trade") return "offered a trade";
  if (b.type === "sail") return b.route.length ? `sailed toward ${at(b.route[0])}` : "sailed on";
  return "stayed put and mused";
}

/* A whole voyage, asked turn by turn. */
export function askVoyage(rec, { askAs = ASK_AS, onTurn = null } = {}) {
  const E = list(rec.events), seats = humanSeats(rec), map = mapMatches(boardOf(rec), rec);
  const out = { seats, winner: rec.winner ?? null, won: seats.includes(rec.winner), days: rec.round || 0, map,
    turns: 0, agreed: 0, pairs: {}, moments: [], buys: 0, buysAgreed: 0, buyMoments: [] };
  if (!map.ok) return out;
  const mem = boardOf(rec); asBots(mem, -1, askAs);
  let walked = 0;
  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    if (e.t !== "turn" || !seats.includes(e.p)) continue;
    replayMemory(mem, E, walked, i); walked = i;
    const h = humanAnswer(E, i, e.p), b = botAnswer(boardAt(rec, mem, E, i, e.p, askAs), e.p);
    out.turns++;
    if (onTurn) onTurn(i, e.p, h, b);
    const key = `${h.type}>${b.type}`; out.pairs[key] = (out.pairs[key] || 0) + 1;
    if (agree(h, b)) out.agreed++;
    else out.moments.push({ day: e.round || 0, seat: e.p, human: h.type, bot: b.type, said: `you ${sayHuman(h)}; a bot would have ${sayBot(b)}` });
    if (h.type === "dock" && h.dockAt >= 0) {
      const a = buyAnswer(boardAt(rec, mem, E, h.dockAt, e.p, askAs), E[h.dockAt], e.p);
      out.buys++;
      if (a.humanBought === a.botBuys) out.buysAgreed++;
      else out.buyMoments.push({ day: e.round || 0, seat: e.p, ...a,
        said: a.humanBought
          ? `you bought the crate at ${at(h.ing)} for ${a.price}; a bot would have left it${a.needed ? "" : " — it was not on your recipe"}`
          : `you left the crate at ${at(h.ing)}; a bot would have bought it for ${a.price}${a.needed ? " — your recipe still needed it" : ""}` });
    }
  }
  return out;
}
