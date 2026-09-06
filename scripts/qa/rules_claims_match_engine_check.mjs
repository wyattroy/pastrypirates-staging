#!/usr/bin/env node
/* rules_claims_match_engine_check.mjs — the RULES PAGE's prose may not outlive the game it
 * describes. This gate takes the engine's answer to each behavioural claim on /rules.html by
 * PLAYING it, and goes red the moment the game stops doing what the page says.
 *
 * ⚠ THE COUNT IS NEVER WRITTEN DOWN HERE. It is printed from `Object.keys(R).length` at the bottom
 * and nowhere else. The first version of this header said "sixteen" in four places while the gate
 * measured twenty-three — CEO 191's finding, and CLAUDE.md §5's "never hand-type a number that can
 * be counted", in the one file written to answer a verdict about instruments overstating what they
 * looked at. Run it; it will tell you.
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────────────────
 * Wyatt's instruction (INBOX-20260902T225008Z): "Do a new /rules.html that explains the rules --
 * using the latest version of the game." The page is GENERATED from the in-game how-to-play modal,
 * so page and modal can never disagree with each other — and until 2026-09-03 nothing checked
 * either of them against the GAME. Measured that day, they were wrong about a rule Wyatt himself
 * changed: the modal told players "a berth protects nobody, not even a captain who's already fired
 * up the ovens", and the engine had refused exactly that attack since his 2026-08-06 sanctuary
 * ruling. A real player was being told to make a play the game does not allow.
 *
 * That one sentence is now fenced by rules_sanctuary_matches_engine_check.mjs, and the wind
 * forecast by rules_forecast_matches_engine_check.mjs. THIS gate covers the rest of the page's
 * behavioural prose, audited 2026-09-03 (T-216) and every claim found TRUE. It keeps them that way.
 *
 * ── WHAT IT CAN AND CANNOT CATCH. Read this before trusting it. ───────────────────────────────
 * It catches THE ENGINE MOVING UNDER STATIC PROSE, which is the failure that actually happened:
 * change the upwind cap, let a crosswind count against a route, make the black market finite, stop
 * ships blocking a storm, and this gate goes red naming the sentence you have just made false.
 *
 * It does NOT catch somebody REWORDING THE PAGE. The expectations below are the page's behaviours
 * transcribed once, by hand, on 2026-09-03 — they are not re-read from the rendered HTML, because
 * the prose states them in English and no classifier here could read that many sentences reliably.
 * (The two gates that DO tie a page sentence to the engine each fence exactly one sentence, with a
 * fixture-tested classifier, and that is what it costs.) So: whoever rewrites one of these
 * sentences owns re-checking this file. That is a real hole, named rather than papered over.
 *
 * ⚠ AND THE `page:` STRING ON EACH CLAIM MUST QUOTE ONLY WHAT THAT CLAIM ACTUALLY MEASURES.
 * It is printed inside "the game still does what the page says: <sentence>", so a claim that quotes
 * a whole sentence and tests a third of it is an instrument announcing more than it looked at —
 * which is the exact species CEO 174 through 191 have now found ten times, each repair pushing it
 * one level further out. Three claims here did that on their first draft: the storm quoted "every
 * ship at once" while pushing ONE ship (now fixed by calling runStorm and watching the whole
 * table), the land claim quoted "and nobody loses a turn" while measuring only a return string, and
 * the sail claim quoted "in any mix of directions" while sailing one straight line. If you widen a
 * quote here, widen the measurement in the same edit or do not widen the quote.
 *
 * ⚠ ONE CLAIM IS STILL NARROWER THAN ITS SENTENCE AND SAYS SO IN PLACE: "nobody loses a turn".
 * There is no turn-forfeit state left in the engine to observe — the v2.1 simplification deleted
 * the whole aground ladder — so the honest thing a gate can assert is that the storm's outcomes
 * never include one, and an absence is not something a mutation can convincingly break. It is
 * quoted out of the claim rather than tested badly.
 *
 * ── THE RED PROOF, AND WHY IT MUTATES THE ENGINE AND NOT THE EXPECTATION ──────────────────────
 * A gate that only proves "a wrong expectation fails" has proven its comparison works and nothing
 * about whether it reads the game at all. That is the exact shape CEO 190 caught: a case whose
 * ALLOWED list filtered nothing while its PASS line asserted it had. So every claim below carries a
 * MUTATION that patches the ENGINE's own behaviour, and --redproof asserts two things per mutation:
 * the claim it breaks goes RED, and no other claim does. A claim with no mutation FAILS the build
 * rather than being quietly skipped, so coverage is complete by construction and not by counting.
 *
 *   node scripts/qa/rules_claims_match_engine_check.mjs                 measure, then red-proof
 *   node scripts/qa/rules_claims_match_engine_check.mjs --claims-only   skip the mutations
 */
import { Game, roundCfg } from "../../src/engine/index.js";
import { DIRS } from "../../src/shared/index.js";

/* THE RED PROOF RUNS ON EVERY BUILD, not by hand. It costs 0.75s for the whole mutation sweep, and
 * the 18 hand-run red proofs in scripts/qa/ are the reason nobody knows whether those gates still
 * work — gate 131's own ceiling note says exactly that. A red proof somebody has to remember to run
 * is a red proof that stops running. `--claims-only` skips the mutations for quick iteration; it is
 * not what the chain calls. */
const CLAIMS_ONLY = process.argv.includes("--claims-only");

/* ═══════════════════ THE MEASUREMENTS ═══════════════════
   Every one of these plays a real Game. Nothing below reads a constant, a flag or a comment. */

const mk = (seed = 4242) => new Game(roundCfg(["human", "bot", "bot", "bot"]), seed, true);

/* Find an open square with `k` clear water squares in all four directions, so that the WIND is what
   limits a route rather than the land. A probe that measures a cap it never reached is rule 6's
   "measurement that cannot fail". */
/* ⚠ `extra` IS NOT DECORATION. The first version guaranteed clear water only along the four
   straight lines, and a claim about sailing "in any mix of directions" then asked for an L-shaped
   route whose corner happened to be an island — so the gate reported THE RULES PAGE CONTRADICTS THE
   GAME when the truth was that the probe had walked into land. Rule 6, again: when a check condemns
   something known to work, suspect the check. Any offset a caller intends to sail to must be listed
   here, so a probe that cannot reach its subject THROWS instead of accusing the game. */
function openWater(g, k, extra = []) {
  const n = g.cfg.grid;
  const wet = c => !(g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c));
  const lines = [];
  for (const d of [[0,-1],[0,1],[1,0],[-1,0]]) for (let s = 1; s <= k; s++) lines.push([d[0]*s, d[1]*s]);
  for (let x = k; x < n - k; x++) for (let y = k; y < n - k; y++) {
    const c = [x, y];
    if (!wet(c)) continue;
    if ([...lines, ...extra].every(o => wet([x + o[0], y + o[1]]))) return c;
  }
  return null;
}

function measureAll() {
  const R = {};
  const claim = (id, page, ok, detail) => { R[id] = { page, ok: !!ok, detail }; };

  /* ── SAILING ──────────────────────────────────────────────────────────────── */
  {
    /* THE SEED IS SEARCHED, NOT FIXED. A 15×15 round world with seven islands does not always hold a
       square with four clear squares in every direction AND a clear elbow — seed 4242 does not — so
       the probe walks seeds until it finds a board that can pose the question. The claim is about
       the RULE, not about any one board, and a probe that cannot reach its subject must say so
       rather than accuse the game, which is precisely what the first version of this did. */
    const elbowRoute = [[0, -1], [0, -2], [1, -2], [2, -2], [1, 1], [2, 1]];
    let g = null, base = null;
    for (let s = 0; s < 60 && !base; s++) { g = mk(4242 + s * 101); base = openWater(g, 4, elbowRoute); }
    if (!base) throw new Error("no board in 60 seeds had 4 clear squares each way AND a clear elbow — the probe cannot reach its subject");
    const p = g.players[0];
    g.players.forEach((q, i) => { if (i) { q.pos = [0, 0]; q.done = true; } });
    p.pos = [...base];
    g.windNow = "N";                                  // wind blows toward N; the upwind step is S
    const reach = g.sailStates(p);
    const at = (dx, dy, k) => reach.get((base[0] + dx*k) + "," + (base[1] + dy*k));

    /* "in any mix of directions" is measured, not just quoted: an L — two squares downwind then two
       across — must cost exactly 4. Quoting the whole sentence off one straight line was CEO 191's
       finding. */
    const elbow = reach.get((base[0] + 2) + "," + (base[1] - 2));
    claim("sail-range", "Move up to 4 squares in any mix of directions",
      at(0, -1, 4) === 4 && elbow === 4,
      `4 squares straight with the wind -> ${at(0, -1, 4)}; an L of 2 downwind then 2 across -> ${elbow} (a mix of directions costs the same 4)`);

    claim("sail-upwind-cap", "the moment yer route bites into the wind … the whole move is capped at 2",
      at(0, 1, 2) === 2 && at(0, 1, 3) === undefined,
      `2 squares into the wind -> ${at(0, 1, 2)}; 3 squares into the wind -> ${at(0, 1, 3)} (must be unreachable)`);

    claim("sail-crosswind-free", "Across the wind doesn't count against ye",
      at(1, 0, 4) === 4 && at(-1, 0, 4) === 4,
      `4 squares across the wind: E -> ${at(1, 0, 4)}, W -> ${at(-1, 0, 4)} (both must be 4)`);

    const oneUp = at(0, 1, 1);
    const upThenAcross = reach.get((base[0] + 1) + "," + (base[1] + 1));
    const upThenTwo    = reach.get((base[0] + 2) + "," + (base[1] + 1));
    claim("sail-even-one-square", "even for one square, the whole move is capped at 2",
      oneUp === 1 && upThenAcross === 2 && upThenTwo === undefined,
      `one step upwind then across: 1 -> ${oneUp}, 2 -> ${upThenAcross}, 3 -> ${upThenTwo} (the third must be refused)`);

    const rival = g.players[1];
    rival.done = false; rival.baking = false;
    rival.pos = [base[0], base[1] - 1];
    const r2 = g.sailStates(p);
    const onHer = r2.get(rival.pos.join(","));
    const past  = r2.get(rival.pos[0] + "," + (rival.pos[1] - 1));
    claim("sail-past-not-onto", "Sail past other ships, but don't end on one",
      onHer === undefined && past === 2,
      `her square -> ${onHer} (must be unreachable); the square beyond her -> ${past} (must be 2 — sailed straight through)`);
  }

  /* ── THE DOCK ─────────────────────────────────────────────────────────────── */
  {
    const g = mk();
    const a = g.players[0], b = g.players[1];
    let berth = null, port = null;
    const n = g.cfg.grid;
    for (let x = 0; x < n && !berth; x++) for (let y = 0; y < n && !berth; y++) {
      const c = [x, y];
      if (g.blocked(c) || g.isIsland(c) || g.isHome(c)) continue;
      a.pos = c;
      const pt = g.adjPort(a);
      if (pt !== null && pt !== undefined) { berth = c; port = pt; }
    }
    if (!berth) throw new Error("no berth found on this board — the probe cannot reach its subject");
    /* ⚠ THE ORDER IS THE PROBE. The first draft put BOTH ships on the berth before either docked,
       so the FIRST ship's own guard saw the second already standing there and refused — and the
       probe reported the game broken when the probe was. Rule 6: when a check condemns something
       known to work, suspect the check. Claim the berth alone, THEN bring the second ship up. */
    a.pos = [...berth]; b.pos = [0, 0]; a.coins = 99; b.coins = 99;
    const first = g.doDock(a, port);
    b.pos = [...berth];
    const second = g.doDock(b, port);
    claim("dock-one-at-a-time", "tie up at an island's dock (one ship at a time!)",
      first === true && second === false,
      `first ship docks -> ${first}; a second ship at the same berth -> ${second} (must be refused)`);
  }

  /* ── CRATE PRICES ─────────────────────────────────────────────────────────── */
  {
    const g = mk();
    const ing = g.ings[0], p = g.players[0];
    const seen = [];
    g.tokens[ing] = g.cfg.crates;
    for (let i = 0; i < g.cfg.crates; i++) { p.coins = 99; seen.push(g.cratePrice(ing)); g.buyCrate(p, ing); }
    claim("price-ladder", "the first off a full island is 3, the next 4, and the last one 5",
      JSON.stringify(seen) === JSON.stringify([3, 4, 5]),
      `prices off a full ${g.cfg.crates}-crate island, in order: ${JSON.stringify(seen)}`);
  }

  /* ── THE BLACK MARKET ─────────────────────────────────────────────────────── */
  {
    const g = mk();
    const ing = g.ings[0], p = g.players[0];
    g.tokens[ing] = 0; p.coins = 999;
    const prices = [];
    for (let i = 0; i < 5; i++) { prices.push(g.cratePrice(ing)); g.buyCrate(p, ing); }
    /* ⚠ THE NUMERAL IS DELIBERATELY NOT ASSERTED, and CEO 191 was right that the first draft's
       wording hid that: it quoted "a flat 10, forever" while comparing the engine to
       `g.cfg.blackMarket` — to itself. Move the config to 7 and it would have stayed green under a
       sentence still saying 10. The numeral is NOT this gate's job: the page prints it from
       `rulesFacts(cfg)` into a `data-rule="blackMarket"` span, and `rules_page_check.mjs` re-runs
       that generator byte-for-byte every build, so the page and the config cannot disagree about a
       number. What no generator covers is the part the sentence is really about — that the shelf
       never runs dry and the price never MOVES — so that is what is claimed and quoted. */
    const flat = prices.every(v => v === prices[0]) && prices[0] === g.cfg.blackMarket;
    claim("blackmarket-flat-forever", "a sold-out island always has ONE more crate … at a flat price, forever",
      flat && p.ing.length === 5,
      `five purchases off a sold-out shelf: ${JSON.stringify(prices)} — the price never moved and the shelf never ran dry; all five delivered: ${p.ing.length === 5}. The numeral is rulesFacts' job, not this gate's (cfg.blackMarket = ${g.cfg.blackMarket}).`);

    const g2 = mk();
    const ing2 = g2.ings[0], q = g2.players[0], junk = g2.ings[3];
    g2.tokens[ing2] = 0;
    q.ing = [junk, junk]; q.coins = 0;                 // skint, and holding two of the same
    const bartered = g2.barterCrate(q, ing2, [junk, junk]);
    claim("blackmarket-two-crates", "take any two crates from yer hold in trade for it — even two of the same",
      !!bartered && q.ing.length === 1 && q.ing[0] === ing2,
      `a skint captain barters two identical crates: paid ${JSON.stringify(bartered && bartered.paidIng)}, hold afterwards ${JSON.stringify(q.ing)}`);
  }

  /* ── THE FIGHT ────────────────────────────────────────────────────────────── */
  {
    const g = mk();
    const att = g.players[0], def = g.players[1];
    att.coins = 99; def.ing = [g.ings[0]];
    def.pos = [att.pos[0], att.pos[1] - 1];
    const withCrate = g.canAttack(att, def);
    def.ing = [];
    const withoutCrate = g.canAttack(att, def);
    claim("attack-empty-hold", "Ye can't attack a ship with an empty hold; there's nothing to take",
      withCrate === true && withoutCrate === false,
      `a hold with a crate in it -> ${withCrate}; an empty hold -> ${withoutCrate}`);

    def.ing = [g.ings[0]];
    att.pos = [7, 7]; g.windNow = "N";
    def.pos = [7, 6]; const north = g.downwindSide(att, def);
    def.pos = [7, 8]; const south = g.downwindSide(att, def);
    def.pos = [8, 7]; const east  = g.downwindSide(att, def);
    def.pos = [6, 7]; const west  = g.downwindSide(att, def);
    claim("attack-downwind-wins", "Both heads? The captain firing downwind lands the shot",
      north === "a" && south === "d",
      `wind N — defender to the N: ${north} (the attacker has the gauge); defender to the S: ${south} (the defender does)`);
    claim("attack-crosswind-collides", "a crosswind clash and the cannonballs collide",
      east === null && west === null,
      `wind N — defender to the E: ${east}, to the W: ${west} (neither side may hold the gauge)`);

    const g3 = mk();
    const w = g3.players[0], l = g3.players[1];
    w.recipe = g3.ings.slice(0, 5);
    w.ing = []; l.ing = [g3.ings[5], g3.ings[2]];      // one the winner needs, one it does not
    const wPos = [...w.pos], lPos = [...l.pos];
    const took = g3.awardSpoil(w, l);
    const stayed = w.pos.join() === wPos.join() && l.pos.join() === lPos.join();
    claim("battle-one-crate-chosen", "The winner takes one crate of their choosing",
      took === g3.ings[2] && w.ing.length === 1 && l.ing.length === 1,
      `winner took ${took} (the one on its own recipe, out of ${JSON.stringify([g3.ings[5], g3.ings[2]])}); one crate moved, ${l.ing.length} left behind`);
    claim("battle-nobody-moves", "Nobody changes squares",
      stayed, `winner ${w.pos.join()} (was ${wPos.join()}), loser ${l.pos.join()} (was ${lPos.join()})`);
  }

  /* ── TRADE ────────────────────────────────────────────────────────────────── */
  {
    const g = mk();
    const p = g.players[0];
    g.players.forEach(q => { q.pos = [1, 1]; });
    p.pos = [13, 13];                                 // nowhere near anybody
    const hailed = g.tradeOpp(p);
    claim("trade-hails-whole-table", "hail the whole table at once",
      hailed.length === g.players.length - 1 && !hailed.includes(p),
      `a captain alone in the far corner hails ${hailed.length} of the other ${g.players.length - 1} — distance is no object`);
  }

  /* ── THE TRADE WINDS ──────────────────────────────────────────────────────── */
  {
    const g = mk();
    const p = g.players[0];
    const rim = [...g.rim].map(k => k.split(",").map(Number));
    let swept = 0, alreadyAtTheEnd = 0;
    for (const c of rim) {
      p.pos = [...c];
      const ev = g.tradewind(p, false);
      const head = g.rimHead[c.join(",")];
      if (ev) { if (p.pos.join() === head.join()) swept++; }
      else if (c.join() === head.join()) alreadyAtTheEnd++;
    }
    claim("tradewind-sweeps-to-the-end", "yer instantly swept to the far corner of that stretch",
      swept + alreadyAtTheEnd === rim.length && swept > 0,
      `${rim.length} rim squares: ${swept} swept to their arc's end, ${alreadyAtTheEnd} already there, ${rim.length - swept - alreadyAtTheEnd} did neither`);

    /* Arc membership is asked through rimEntriesTo() — a METHOD — rather than read straight off the
       `rimHead` map. The map is an own property built in the constructor, so a red proof cannot
       reach it; the method can be mutated, which is the only way this claim gets a real red proof
       rather than a stub. Same measurement either way. */
    const shapes = [1, 2, 3, 4, 5].map(s => {
      const gg = new Game(roundCfg(["human", "bot", "bot", "bot"]), s * 7919, true);
      const heads = [...gg.rim].map(k => k.split(",").map(Number)).filter(c => gg.isRimHead(c));
      return heads.map(h => gg.rimEntriesTo(h).length).sort((a, b) => a - b).join("/");
    });
    claim("tradewind-arcs-vary", "in arcs of varying length each game",
      new Set(shapes).size > 1, `arc lengths across five seeds: ${JSON.stringify(shapes)}`);
  }

  /* ── STORMS ───────────────────────────────────────────────────────────────── */
  {
    const g = mk();
    const p = g.players[0], q = g.players[1];
    const n = g.cfg.grid;
    let start = null;
    for (let x = 2; x < n - 2 && !start; x++) for (let y = 2; y < n - 2 && !start; y++) {
      const c = [x, y]; let clear = true;
      for (let k = 0; k <= 4; k++) { const o = [x, y + k]; if (g.blocked(o) || g.isIsland(o) || g.isHome(o) || g.onRim(o)) clear = false; }
      if (clear && !g.onRim(c)) start = c;
    }
    if (!start) throw new Error("no clear 4-square run for the storm probe — it cannot reach its subject");
    g.players.forEach((r, i) => { if (i > 1) r.done = true; });
    q.pos = [0, 0]; q.done = true;

    p.pos = [...start];
    const openSea = g.stormPush(p, "S", 3);
    claim("storm-three-squares", "3 squares",
      openSea === "moved" && p.pos[1] - start[1] === 3,
      `open water: outcome "${openSea}", moved ${p.pos[1] - start[1]} square(s)`);

    /* "EVERY SHIP AT ONCE, ALL THE SAME DIRECTION" — measured by running the real storm over the
       whole table, not inferred from one ship. CEO 191: the first draft quoted this sentence while
       pushing a single captain with the other three parked `done`, so deleting runStorm's loop
       (src/engine/index.js:3003) would have left this gate green. */
    {
      const gs = mk(20260903);
      const clear = [];
      const nn = gs.cfg.grid;
      for (let x = 1; x < nn - 1 && clear.length < gs.players.length; x++) {
        for (let y = 1; y < nn - 4 && clear.length < gs.players.length; y++) {
          const c = [x, y];
          let room = true;
          for (let k = 0; k <= 3; k++) { const o = [x, y + k]; if (gs.blocked(o) || gs.isIsland(o) || gs.isHome(o) || gs.onRim(o)) room = false; }
          /* far enough apart that no captain can be the thing that stops another — otherwise this
             would measure ships blocking ships, which is a different claim one row down */
          if (room && clear.every(d => Math.abs(d[0] - x) > 1 || Math.abs(d[1] - y) > 4)) clear.push(c);
        }
      }
      if (clear.length < gs.players.length) throw new Error("could not place every captain in clear water — the whole-table storm probe cannot reach its subject");
      gs.players.forEach((r, i) => { r.pos = [...clear[i]]; r.done = false; r.baking = false; });
      const before = gs.players.map(r => [...r.pos]);
      gs.runStorm("S");
      const shifts = gs.players.map((r, i) => [r.pos[0] - before[i][0], r.pos[1] - before[i][1]]);
      const everyShipMoved = shifts.every(s => s[1] === 3 && s[0] === 0);
      claim("storm-moves-the-whole-table", "it blows every ship at once, all the same direction",
        everyShipMoved,
        `one runStorm("S") over ${gs.players.length} captains — each ship's displacement: ${JSON.stringify(shifts)} (every one must be 3 squares S, and no ship may sit it out)`);
    }

    p.pos = [...start]; q.pos = [start[0], start[1] + 2]; q.done = false; q.baking = false;
    const behindHer = g.stormPush(p, "S", 3);
    claim("storm-ships-stop-ye", "Land and other ships stop ye short (the SHIP half)",
      behindHer === "held" && p.pos[1] - start[1] === 1,
      `another ship two squares downwind: outcome "${behindHer}", stopped after ${p.pos[1] - start[1]} square(s)`);

    q.pos = [0, 0]; q.done = true;
    let ashore = null;
    for (let x = 1; x < n - 1 && !ashore; x++) for (let y = 1; y < n - 1 && !ashore; y++) {
      const c = [x, y];
      if (!(g.isIsland([x, y + 1]) || g.isHome([x, y + 1]))) continue;
      if (g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c)) continue;
      ashore = c;
    }
    if (!ashore) throw new Error("no water square with land directly south of it — the probe cannot reach its subject");
    p.pos = [...ashore];
    const intoLand = g.stormPush(p, "S", 3);
    /* Quoted narrow ON PURPOSE. The sentence continues "…and nobody loses a turn", and that half is
       NOT measured here: the v2.1 simplification deleted the turn-forfeit state entirely, so there
       is no flag to read and an absence is not something a mutation can convincingly break. CEO 191
       caught the first draft quoting it while asserting only the name of a return string. */
    claim("storm-land-stops-ye", "Land and other ships stop ye short (the LAND half)",
      intoLand === "landHeld" && p.pos.join() === ashore.join(),
      `land dead ahead: outcome "${intoLand}", ship held on ${p.pos.join()} instead of sailing through`);
  }

  /* ── THE BAKE-OFF ─────────────────────────────────────────────────────────── */
  {
    const g = mk();
    const p = g.players[0];
    p.coins = 5;
    const looks = g.bakeRewatch(p, 99);
    claim("bake-rewatch-until-broke", "Pay 1 to watch the shuffle again, as often as yer purse allows",
      looks === 5 && p.coins === 0,
      `5 coins, 99 looks asked for: ${looks} bought, ${p.coins} left in the purse`);

    const g2 = mk();
    const b = g2.players[0];
    b.ing = [...b.recipe];
    b.pos = [g2.home[0], g2.home[1] - 1];              // as close to Tortuga as any ship can get
    /* ⚠ NO `!cfg.bakeoff ||` ESCAPE HATCH. The first draft had one, and CEO 191 named it: turn the
       bake-off flag off and half this claim silently stops being measured while the line still
       prints PASS. A claim that quietly narrows itself is the whole species of fault this gate was
       written to answer. If the flag is ever off, the gate says so and goes RED — somebody then
       decides what the page should say, which is a person's job and not a default. */
    const ovensLit = g2.cfg.bakeoff ? g2.lightOvens(b) : null;
    claim("bake-ovens-light-on-arrival", "Dock at Tortuga holdin' yer whole recipe and yer ovens light that very turn",
      g2.cfg.bakeoff === true && g2.canBake(b) === true && ovensLit === true && b.baking === true,
      g2.cfg.bakeoff
        ? `full recipe, ship at Tortuga: canBake -> ${g2.canBake(b)}, lightOvens -> ${ovensLit}, ovens actually burning -> ${b.baking}`
        : `THE BAKE-OFF IS DISABLED IN THIS BUILD (cfg.bakeoff false), so this sentence describes a game nobody is playing — the page needs re-deciding, not a green tick`);

    const g3 = mk();
    const [x, y] = g3.players;
    x.baking = true; y.baking = true; x.bakedToday = true; y.bakedToday = true;
    const anyBaked = g3.endBakeDay();
    claim("bake-together-same-day", "Two captains bakin' it on the same day? No contest — they bake together",
      anyBaked && g3.finishOrder.length === 2 && x.done && y.done,
      `two captains bake on the same day: finishers ${JSON.stringify(g3.finishOrder)}, both crowned ${x.done && y.done}`);
  }

  return R;
}

/* ═══════════════════ THE RED PROOF ═══════════════════
   Each entry patches the ENGINE, never the expectation. `breaks` names the claim(s) that MUST go
   red under it; every other claim must stay green, so a mutation that reddens the whole suite is
   itself a failure — that is what stops a blunt patch from certifying a blind gate. */
/* Two ships and a storm both read player POSITIONS, so the obvious mutations for "ships block"
   (patching inPlay) reddened the dock and the storm as well and proved nothing about either. These
   two helpers take the rivals off the board for the duration of ONE method call instead, which is
   as narrow as "ships stopped mattering here" can be written. */
/* ⚠ IT RESTORES ONLY THE OTHERS' SQUARES, NEVER THE SUBJECT'S — and the first version got that
   wrong in a way the red proof caught. It snapshotted EVERY ship and restored every ship, so
   stormStep's own `p.pos = nx` was undone on the way out: the ship never moved, and the mutation
   reddened "3 squares, all the same direction" as well as the claim it was aimed at. A helper that
   quietly cancels the thing it is wrapping is the blunt-mutation failure in miniature. */
const blindTo = name => P => {
  const o = P[name];
  P[name] = function (a, b) {
    const others = this.players.filter(q => q !== a);
    const saved = others.map(q => q.pos);
    others.forEach(q => { q.pos = [-9, -9]; });
    try { return o.call(this, a, b); }
    finally { others.forEach((q, i) => { q.pos = saved[i]; }); }
  };
};

const MUTATIONS = [
  /* Shrinking the range really does falsify BOTH sentences — "up to 4 squares" and "4 across the
     wind" — so listing one would be the gate lying about its own reach. */
  { id: "sail-range", breaks: ["sail-range", "sail-crosswind-free"],
    patch: P => { P.sailRange = function () { return 3; }; } },
  { id: "sail-upwind-cap", breaks: ["sail-upwind-cap", "sail-even-one-square"],
    patch: P => { P.sailRangeUpwind = function () { return 4; }; } },
  /* NOT sail-even-one-square: with a crosswind counting as upwind, one step upwind then across is
     still capped at 2, so that sentence stays honest. Measured, not assumed — the red proof said so
     and this list was corrected to match it rather than the other way round. */
  /* …but it DOES falsify "up to 4 squares in any mix of directions", now that that claim really
     sails a mix: the elbow's second leg is across the wind, so a crosswind that counts caps the
     whole L at 2. Listed because the sweep measured it, not because it was predicted. */
  { id: "sail-crosswind-free", breaks: ["sail-crosswind-free", "sail-range"],
    patch: P => { const o = P.isUpwindStep; P.isUpwindStep = function (d) { return o.call(this, d) || d === "E" || d === "W"; }; } },
  { id: "sail-past-not-onto", breaks: ["sail-past-not-onto"], patch: blindTo("sailSearch") },
  { id: "dock-one-at-a-time", breaks: ["dock-one-at-a-time"],
    patch: P => { P.dockOccupiedBy = function () { return null; }; } },
  /* Only the SHELF price moves: a blanket +1 shifted the black market's flat 10 too, which
     reddened a claim this mutation says nothing about. */
  { id: "price-ladder", breaks: ["price-ladder"],
    patch: P => { const o = P.cratePrice; P.cratePrice = function (i) { const left = this.tokens[i]; const v = o.call(this, i); return (left > 0 && v !== null) ? v + 1 : v; }; } },
  { id: "blackmarket-flat-forever", breaks: ["blackmarket-flat-forever"],
    patch: P => { const o = P.cratePrice; P.cratePrice = function (i) { const l = this.tokens[i]; return (!l || l <= 0) ? null : o.call(this, i); }; } },
  { id: "blackmarket-two-crates", breaks: ["blackmarket-two-crates"],
    patch: P => { const o = P.barterCrate; P.barterCrate = function (p, i, g) { return (g && g[0] === g[1]) ? null : o.call(this, p, i, g); }; } },
  { id: "attack-empty-hold", breaks: ["attack-empty-hold"],
    patch: P => { const o = P.canAttack; P.canAttack = function (a, d) { return o.call(this, a, d) || !!(d && d !== a && (!this.cfg.bakeoff || !d.baking)); }; } },
  { id: "attack-downwind-wins", breaks: ["attack-downwind-wins"],
    patch: P => { const o = P.downwindSide; P.downwindSide = function (a, d) { const s = o.call(this, a, d); return s === "a" ? "d" : s === "d" ? "a" : s; }; } },
  { id: "attack-crosswind-collides", breaks: ["attack-crosswind-collides"],
    patch: P => { const o = P.downwindSide; P.downwindSide = function (a, d) { return o.call(this, a, d) || "a"; }; } },
  { id: "battle-one-crate-chosen", breaks: ["battle-one-crate-chosen"],
    patch: P => { const o = P.awardSpoil; P.awardSpoil = function (w, l) { const t = o.call(this, w, l); if (l.ing.length) { w.ing.push(l.ing.pop()); } return t; }; } },
  { id: "battle-nobody-moves", breaks: ["battle-nobody-moves"],
    patch: P => { const o = P.awardSpoil; P.awardSpoil = function (w, l) { const t = o.call(this, w, l); const s = w.pos; w.pos = l.pos; l.pos = s; return t; }; } },
  { id: "tradewind-sweeps-to-the-end", breaks: ["tradewind-sweeps-to-the-end"],
    patch: P => { P.tradewind = function () { return false; }; } },
  /* Back to the pre-parley rule, where a hail only reached the ships you were standing next to —
     which is what "the whole table at once" denies. */
  { id: "trade-hails-whole-table", breaks: ["trade-hails-whole-table"],
    patch: P => { P.tradeOpp = function (p) { return this.players.filter(q => q !== p && this.inPlay(q) && Math.abs(p.pos[0] - q.pos[0]) + Math.abs(p.pos[1] - q.pos[1]) <= 1); }; } },
  /* Every arc the same length in every game — which is precisely what "arcs of varying length each
     game" denies. The first attempt at this mutation was a STUB that set an unread flag and changed
     nothing; the red proof reported the claim staying green and that is how it was caught. A red
     proof that only ever confirms is the failure this whole section exists to prevent. */
  { id: "tradewind-arcs-vary", breaks: ["tradewind-arcs-vary"],
    patch: P => { P.rimEntriesTo = function () { return new Array(10).fill([0, 0]); }; } },
  /* Reddens BOTH storm-distance claims, and honestly so: a storm that stops after one square is a
     storm that moved neither one ship three squares nor the whole table three squares. */
  { id: "storm-three-squares", breaks: ["storm-three-squares", "storm-moves-the-whole-table"],
    patch: P => { const o = P.stormStep; P.stormStep = function (p, d) { const r = o.call(this, p, d); return r === "moved" ? "held" : r; }; } },
  /* THE SEAT THAT SITS THE STORM OUT — runStorm's loop reduced to its first ship, which is what
     "every ship at once" denies, and what deleting src/engine/index.js:3003 would produce. */
  { id: "storm-moves-the-whole-table", breaks: ["storm-moves-the-whole-table"],
    patch: P => { const o = P.stormOrder; P.stormOrder = function (d) { return o.call(this, d).slice(0, 1); }; } },
  { id: "storm-ships-stop-ye", breaks: ["storm-ships-stop-ye"], patch: blindTo("stormStep") },
  /* stormStep rewritten MINUS its land test, rather than blanking isIsland globally. Two reasons,
     both measured: isIsland also feeds sailSearch's passable(), so blanking it moves squares under
     the sailing claims; and the storm stops at `isIsland(nx) || isHome(nx)`, so blanking only
     isIsland left Tortuga still stopping the ship and the claim stayed GREEN under a mutation that
     was supposed to break it. */
  { id: "storm-land-stops-ye", breaks: ["storm-land-stops-ye"],
    patch: P => {
      P.stormStep = function (p, dirKey) {
        const d = DIRS[dirKey];
        const nx = [p.pos[0] + d[0], p.pos[1] + d[1]];
        if (this.blocked(nx)) return "landHeld";
        if (this.players.find(q => q !== p && this.inPlay(q) && q.pos[0] === nx[0] && q.pos[1] === nx[1])) return "held";
        p.pos = nx;                                   // the land check that belongs here is gone
        if (this.onRim(nx)) { this.tradewind(p, true); return "swept"; }
        return "moved";
      };
    } },
  { id: "bake-rewatch-until-broke", breaks: ["bake-rewatch-until-broke"],
    patch: P => { const o = P.bakeRewatch; P.bakeRewatch = function (p, n) { return o.call(this, p, Math.min(n || 0, 1)); }; } },
  { id: "bake-ovens-light-on-arrival", breaks: ["bake-ovens-light-on-arrival"],
    patch: P => { P.canBake = function () { return false; }; } },
  { id: "bake-together-same-day", breaks: ["bake-together-same-day"],
    patch: P => { const o = P.endBakeDay; P.endBakeDay = function () { const w = this.players.filter(q => q.bakedToday); w.slice(1).forEach(q => { q.bakedToday = false; }); return o.call(this); }; } },
];

function withPatch(patch, fn) {
  const P = Game.prototype;
  const saved = new Map();
  const proxy = new Proxy(P, {
    set(t, k, v) { if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(t, k)); t[k] = v; return true; },
    get(t, k) { return t[k]; },
  });
  patch(proxy);
  try { return fn(); }
  finally {
    for (const [k, d] of saved) { if (d) Object.defineProperty(P, k, d); else delete P[k]; }
  }
}

let failures = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { failures++; console.log("FAIL " + m); };

/* ---- 1. every claim, measured against the engine as it actually is ---- */
const R = measureAll();
const ids = Object.keys(R);
for (const id of ids) {
  if (R[id].ok) pass(`${id} — the game still does what the page says: ${R[id].detail}`);
  else fail(`THE RULES PAGE CONTRADICTS THE GAME. /rules.html says "${R[id].page}" and the engine says otherwise: ${R[id].detail}`);
}

/* ---- 2. and no claim may sit here without a mutation proving this gate can SEE it ---- */
const covered = new Set(MUTATIONS.flatMap(m => m.breaks));
const uncovered = ids.filter(id => !covered.has(id));
if (!uncovered.length) pass(`all ${ids.length} claims carry an engine mutation`);
else fail(`${uncovered.length} claim(s) have no engine mutation proving this gate can see them: ${JSON.stringify(uncovered)}`);

if (CLAIMS_ONLY) {
  console.log(failures ? `\nFAILED — ${failures} check(s)` : `\nOK — ${ids.length} claims measured (mutations skipped: --claims-only)`);
  process.exit(failures ? 1 : 0);
}

/* ---- 3. break the engine one way at a time and insist this gate notices ---- */
if (failures) {
  fail(`the UNMUTATED engine already fails a claim — the mutation sweep below would be meaningless, so it is skipped`);
  console.log(`\nFAILED — ${failures} check(s)`);
  process.exit(1);
}
for (const m of MUTATIONS) {
  let R;
  try { R = withPatch(m.patch, measureAll); }
  catch (e) { fail(`mutation "${m.id}" threw instead of reddening a claim: ${e.message}`); continue; }
  const red = Object.keys(R).filter(id => !R[id].ok);
  const missed = m.breaks.filter(id => !red.includes(id));
  const extra = red.filter(id => !m.breaks.includes(id));
  if (missed.length) fail(`mutation "${m.id}" broke the engine and this gate DID NOT NOTICE: ${JSON.stringify(missed)} stayed green`);
  else if (extra.length) fail(`mutation "${m.id}" reddened claims it should not have: ${JSON.stringify(extra)} — a mutation this blunt proves nothing about the claim it names`);
  else pass(`mutation "${m.id}" → exactly ${JSON.stringify(m.breaks)} went red, everything else stayed green`);
}
console.log(failures
  ? `\nFAILED — ${failures} check(s)`
  : `\nOK — ${ids.length} rules-page claims, each measured by playing the engine, and each proved able to fail`);
process.exit(failures ? 1 : 0);
