// src/engine/index.js
//
// Phase 8 engine tier (D-03/D-04). Holds no DOM, `window`, Firebase,
// wall-clock, or unseeded-random access — pure simulation logic only.
// Imports from `../shared/index.js`; must never be imported BY
// `src/shared/` (shared is a leaf, engine depends on it, never the reverse).

import { mulberry32, ING_ALL, TET, DIRS, OPPOSITE, PERP, SAIL_RANGE, SAIL_RANGE_UPWIND, STORM_PUSH, SEA_CREATURES, BAKE_SWAPS, BAKE_ATTENTION, BAKE_REWATCH_COST, BAKEOFF_ENABLED, bakeoffEnabled, ovensNowEnabled, bake2Enabled, endCardEnabled, man, ilabelImg } from "../shared/index.js";
import { recipeSteps } from "../shared/recipe-steps.js";
import { newBake, scrambleBench, shuffleSlots, scoreAttempt, applyResult, botGuess, unsolvedCount } from "./bakeoff.js";

// notes/edits #1a: roll a storm for the round, but never allow a 3rd in a row. Always consumes
// exactly one g.r() so the seeded RNG sequence stays identical live vs. host-refresh replay.
function rollStorm(g){
  const roll=g.r()<g.cfg.storm;
  const storm=(g.stormStreak||0)>=2?false:roll;
  g.stormStreak=storm?(g.stormStreak||0)+1:0;
  return storm;
}

// v2: bots are PLANNERS, not weighted gates (Wyatt, 2026-08-04: "don't give them gates, give them
// strategy"). Each bot builds a route through every ingredient it still needs, costed in TURNS —
// sail time under the committed wind forecast, plus the coins it must earn at the current crate
// price — and re-plans that whole route every turn as the wind, the stock and the prices move.
// See buildPlan() for the route, planStep() for what it does about this turn.
//
// The five archetypes survive as BIASES on that one planner, not as separate brains: same
// reasoning, different taste. Every multiplier below tilts a cost or a payoff the planner has
// already computed honestly, so a personality can change which plan wins but never makes a bot
// stop thinking. (Wyatt's ruling, 2026-08-04: "keep as biases on the planner".)
const PERSONALITY={
  // fightBias   : how much a bot discounts the turn-cost of taking a crate by force
  // dealBias    : how much it discounts the turn-cost of buying one off a rival
  // hoardBias   : appetite for crates it does NOT need, held purely as trade leverage
  // patience    : tolerance for a longer route that avoids a fight (low = impatient rusher)
  // tieBully    : break tied attack targets toward the weakest one
  pirate:     {fightBias:1.45,dealBias:0.70,hoardBias:0.8,patience:0.9,tieBully:true},
  trader:     {fightBias:0.45,dealBias:1.60,hoardBias:1.5,patience:1.2,tieBully:false},
  balanced:   {fightBias:0.95,dealBias:1.00,hoardBias:1.0,patience:1.0,tieBully:false},
  rusher:     {fightBias:0.30,dealBias:0.85,hoardBias:0.3,patience:0.6,tieBully:false},
  monopolist: {fightBias:1.05,dealBias:0.90,hoardBias:2.0,patience:1.1,tieBully:false},
};
// grudgeBonus is deliberately small — under the fish/dock baseline — so a revenge grudge can only
// tip a fight that already has some real stake behind it, never single-handedly justify one. Each
// battle re-arms a fresh grudge on whoever just lost, so a bigger bonus here would let two ships
// trade wins forever purely on narrative flavor, recreating the exact loop this system exists to
// prevent (confirmed by simulation before this was turned down from 3).
// notes/edits AI-02: windAdv/windDis weight the new wind advantage — firing downwind now wins a
// both-HEADS round, so a downwind attack is a real edge and an upwind one a real handicap.
// notes/edits AI-06: rematchEscalate breaks the fight-loop stalemates BATL-03 exposed. Pre-swap a
// winner moved away and broke adjacency for free; with no swap, two ships contesting each other's
// crates re-fought every ~4 rounds forever (games that ran the full 150-round cap with nobody ever
// finishing). A flat cooldown-scoped penalty didn't help — the cooldown lapsed and the duel resumed.
// So the penalty ESCALATES with how many times this exact pair has fought recently (see fightLog /
// recentFights): the first fight is free (still devious), each rematch hurts more, so a genuine
// one-off steal still wins but an endless grudge-duel prices itself out.
// Planner constants. Every one of these is denominated in TURNS, which is what makes the bot
// explainable: it compares "buying this crate costs me 4 turns" against "taking it by force costs
// me 2 turns and a fight I might lose" and picks the cheaper. Nothing here is a magic score.
/* v3 race planner: the two constants of the logistic curve raceScore3 reads every pairwise race
   off — P(I beat q) = σ((ETA_q − myFinish + RACE_BIAS) / RACE_SPREAD). MEASURED, not tuned:
   scripts/measure_race_spread.mjs replays a seeded corpus and fits both by maximum likelihood on  [UNGATED-IN-4: measure_race_spread.mjs reads the root tree, not this one]
   27,867 observed did-p-beat-q outcomes (2026-08-09, incumbent-driven corpus, seeds 1..300×7919).
   RACE_BIAS is positive because the two estimators lean opposite ways: my contested tour is
   pessimistic (it prices contention), a rival's public ETA is optimistic (it assumes the cheapest
   recipe they could possibly hold) — the raw margin therefore understates the mover. Re-run the
   script if the movement, dock, battle or bake rules ever change. */
const RACE_SPREAD=6.75;
const RACE_BIAS=2.75;

const PLAN={
  // a dock flip pays 6 on heads, 2 on tails (rule 10), so a turn spent docking earns 4 on average
  coinsPerDockTurn:4,
  // one turn buys one flip; earning N coins therefore costs ceil(N / coinsPerDockTurn) turns
  fightTurns:2.2,      // sail-into-position + the fight itself, amortised over how often you win
  fightLossRisk:1.9,   // expected turns burned when a fight goes wrong (powder gone, crate not taken)
  tradeTurns:1.0,      // a trade is one action; the cost is what you give away, not the time
  unreachable:99,      // sentinel "no route exists" cost — always loses to any real plan
  // AI-06 (carried from v1): an escalating brake on re-fighting the same ship. The first fight is
  // free; each recent rematch adds this many turns to the fight's cost, so a grudge-duel prices
  // itself out instead of running forever. This was the single biggest source of 150-round
  // stalemates in v1 and the mechanism is still needed under the planner.
  rematchEscalate:1.6,
  // being downwind of your target is a real edge in a v2 one-round battle (rule 9: both-heads goes
  // to the downwind ship), so the planner prices the wind into every fight it considers
  windEdge:0.8,
  // holding a crate a rival needs is leverage — worth this many turns of a bot's own time
  leverageTurns:1.1,
  // Storm lookahead, in stepToward's own units (a whole step of real distance is 1000). With the
  // lost turn gone a storm can no longer punish a bot, only displace it — so what it now avoids is
  // being shoved against land and losing the ground it just made, and what it courts is a berth
  // the storm will park it in for free. Both are worth about a square of progress, no more; price
  // them higher and a bot cowers instead of sailing.
  // how much a bot cares, per square, about where the forecast storm will leave it. Deliberately
  // a quarter of a step: enough to break a tie toward a favourable shove, never enough to walk
  // away from an island it needs.
  stormDrift:250,
  // ---- HUNTING THE LEADER (v2.1, Wyatt 2026-08-06: "they should attack people if they are about
  // to win, they should factor in others' proximity to winning and guess where they may be trying
  // to go"). Measured before: bots fought 1.77 times a game, 23% of games had no battle at all, and
  // the planner chose "take" for only 5.5% of legs — while ~29 turns a game went by with somebody
  // already one crate from a full recipe. The leader was simply invisible to a planner that costs
  // everything in turns-to-MY-recipe.
  crateTurns:2.5,     // assumed turns to land one more crate, for the PUBLIC threat estimate
  threatHorizon:8,    // a rival this many estimated turns from victory registers at urgency 0;
                      // urgency climbs to 1 as that estimate falls to nothing
  huntWeight:1.2,     // how much full urgency discounts a fight, before the archetype's own bias
  denialTurns:5,      // what stopping a captain on the brink is worth in a bot's OWN turns, at
                      // full urgency — this is what lets it raid cargo it has no use for
  interceptLead:2,    // squares to aim AHEAD of a fleeing leader, along their path home
  // ---- the objective (docs/BOT-DESIGN-PRINCIPLES.md) ----
  bakeTurns:2,        // attempts to name five crates back in order. A WHOLE number, because
                      // turnsToWin3 counts turns and there is no such thing as a third of a turn —
                      // measured mean 2.3, median 2, and the median is the one that is a real
                      // number of turns a captain can actually spend.
  huntReach:2,        // a raid is only ever PLANNED against a leader this many sail-turns away —
                      // the leash that stops a bot abandoning its own voyage to stalk across the map
};

class Game{
  constructor(cfg,seed,record){
    this.cfg=cfg; this.record=record; this.rng=mulberry32(seed);
    this.seed=seed; this.randCalls=0;
    const n=cfg.grid; this.home=[Math.floor(n/2),Math.floor(n/2)];
    // --- round world: pixelated circle + trade-wind rim channel ---
    this.isRound=!!cfg.roundBoard;
    this.valid=new Set(); this.rim=new Set(); this.rimHead={};
    if(this.isRound){
      const cc=(n-1)/2, r2=(cc+0.4)*(cc+0.4);
      for(let x=0;x<n;x++)for(let y=0;y<n;y++)
        if((x-cc)*(x-cc)+(y-cc)*(y-cc)<=r2)this.valid.add(x+","+y);
      for(const k of this.valid){
        const [x,y]=k.split(",").map(Number);
        for(const d of Object.values(DIRS)){
          const ox=x+d[0],oy=y+d[1];
          if(ox<0||oy<0||ox>=n||oy>=n||!this.valid.has(ox+","+oy)){this.rim.add(k);break;}
        }
      }
      // quadrants flow CLOCKWISE (each arc carries you to its own clockwise-most end).
      // Arc lengths are randomized per game (min 3 cells each, rest distributed randomly)
      // instead of 4 fixed 90° slices, so the whirlpool layout — and how far a shortcut
      // carries you — varies game to game; occasionally one arc spans nearly half the rim.
      const sorted=[...this.rim].map(k=>{
        const [x,y]=k.split(",").map(Number);
        const deg=(Math.atan2(y-cc,x-cc)*180/Math.PI+360)%360; // true geometric angle, used for arrow rendering
        return {k,x,y,deg};
      }).sort((a,b)=>a.deg-b.deg);
      const total=sorted.length,nArcs=4;
      const startIdx=Math.floor(this.r()*total); // random rotation of the whole layout
      const ring=sorted.slice(startIdx).concat(sorted.slice(0,startIdx));
      const minLen=Math.min(3,Math.floor(total/nArcs));
      const remaining=Math.max(0,total-minLen*nArcs);
      const cuts=[0,1,2].map(()=>Math.floor(this.r()*(remaining+1))).sort((a,b)=>a-b);
      const lens=[cuts[0],cuts[1]-cuts[0],cuts[2]-cuts[1],remaining-cuts[2]].map(e=>e+minLen);
      const cells=[];
      let idx=0;
      for(let q=0;q<nArcs;q++)for(let i=0;i<lens[q];i++)cells.push({...ring[idx++],q});
      const heads={};
      for(const c of cells)heads[c.q]=c; // last cell in each arc is its clockwise-most end
      for(const c of cells)this.rimHead[c.k]=[heads[c.q].x,heads[c.q].y];
      this.rimCellInfo=cells; // kept for rendering flow arrows
    }
    this.ings=ING_ALL.slice(0,cfg.nIslands);
    // island placement (rectangles of islandW x islandH)
    const iw=cfg.islandW||1, ih=cfg.islandH||1;
    const shapeFor=()=>{
      if(!cfg.tetris){
        const flip=this.r()<.5, w=flip?ih:iw, h=flip?iw:ih;
        const s=[];for(let a=0;a<w;a++)for(let b=0;b<h;b++)s.push([a,b]);
        return {cells:s,shapeIdx:-1,rot:0,flip:false}; // no TET art mapping in rectangle mode
      }
      const shapeIdx=Math.floor(this.r()*TET.length);
      let s=TET[shapeIdx].map(c=>[...c]);
      const rot=Math.floor(this.r()*4);
      for(let t=0;t<rot;t++)s=s.map(([x,y])=>[y,-x]);
      const flip=this.r()<.5;
      if(flip)s=s.map(([x,y])=>[-x,y]);
      const mx=Math.min(...s.map(c=>c[0])),my=Math.min(...s.map(c=>c[1]));
      return {cells:s.map(([x,y])=>[x-mx,y-my]),shapeIdx,rot,flip};
    };
    const rects=[],rectsMeta=[];
    for(let k=0;k<this.ings.length;k++){
      let done=false;
      // ORDER IS LOAD-BEARING — each iteration of this loop calls shapeFor(), which consumes
      // two to four this.r() calls; reordering [3,2,1] changes how many draws are consumed
      // and in what sequence before an island position is finalised.
      for(const spacing of [3,2,1]){
        const tops=[]; for(let x=0;x<n;x++)for(let y=0;y<n;y++)tops.push([x,y]);
        this.shuffle(tops);
        for(const [x,y] of tops){
          const{cells:shape,shapeIdx,rot,flip}=shapeFor();
          const cellsR=shape.map(([a,b])=>[x+a,y+b]);
          if(cellsR.some(c=>c[0]>=n||c[1]>=n))continue;
          if(cellsR.some(c=>man(c,this.home)<2))continue;
          if(this.isRound&&cellsR.some(c=>{
            const k=c[0]+","+c[1];
            if(!this.valid.has(k)||this.rim.has(k))return true;
            // keep a 1-square water lane between every island and the trade winds
            return Object.values(DIRS).some(d=>this.rim.has((c[0]+d[0])+","+(c[1]+d[1])));
          }))continue;
          if(cellsR.some(c=>rects.some(r2=>r2.some(d=>man(c,d)<spacing))))continue;
          rects.push(cellsR);rectsMeta.push({shapeIdx,rot,flip});done=true;break;
        }
        if(done)break;
      }
    }
    this.islands={}; this.islandRect={}; this.islandShapeMeta={}; this.dockOf={}; this.islandOf={};
    this.ings.forEach((ing,i)=>{
      const cellsR=rects[i]||[[0,0]];
      this.islandRect[ing]=cellsR;
      this.islandShapeMeta[ing]=rectsMeta[i]||{shapeIdx:-1,rot:0,flip:false};
      for(const c of cellsR)this.islands[c]=ing;
    });
    if(cfg.singleDock){
      // a dock must be reachable by actually sailing there from home — not just have one
      // open neighbor. Rim (trade-wind) cells are never a valid stopping point (the wind
      // sweeps you off them before you can act), so flood-fill open water from home,
      // treating the rim as impassable, exactly like the game's own routing already does.
      const passable=c=>!this.blocked(c)&&!this.onRim(c)&&this.islands[c[0]+","+c[1]]===undefined;
      const homeReach=new Set([this.home[0]+","+this.home[1]]);
      const bq=[this.home];
      while(bq.length){
        const c=bq.shift();
        for(const d of Object.values(DIRS)){
          const o=[c[0]+d[0],c[1]+d[1]],k=o[0]+","+o[1];
          if(homeReach.has(k)||!passable(o))continue;
          homeReach.add(k);bq.push(o);
        }
      }
      // claimed cells are excluded from later ingredients' candidate pools so two docks can
      // never land on the same tile (each ingredient used to pick independently, so two
      // adjacent islands could both roll the one open-water cell they share). Seeded with the
      // 4 Tortuga home-berth cells (same DIRS iteration the renderer uses) so an island's dock
      // can never overlap a home berth either.
      const claimed=new Set();
      for(const d of Object.values(DIRS)){
        const hx=this.home[0]+d[0],hy=this.home[1]+d[1];
        if(hx<0||hy<0||hx>=n||hy>=n)continue;
        claimed.add(hx+","+hy);
      }
      for(const ing of this.ings){
        const waters=[];
        for(const c of this.islandRect[ing]){
          for(const d of Object.values(DIRS)){
            const w2=[c[0]+d[0],c[1]+d[1]];
            if(!this.blocked(w2)&&!this.onRim(w2)&&this.islands[w2]===undefined
               &&!(w2[0]===this.home[0]&&w2[1]===this.home[1]))waters.push(w2);
          }
        }
        const open=waters.filter(w=>homeReach.has(w[0]+","+w[1]));
        const free=w=>!claimed.has(w[0]+","+w[1]);
        let pool=open.filter(free);
        if(!pool.length)pool=waters.filter(free);
        if(!pool.length)pool=open.length?open:waters; // last resort: every candidate is taken
        const chosen=pool.length?pool[Math.floor(this.r()*pool.length)]:this.home;
        this.dockOf[ing]=chosen;
        claimed.add(chosen[0]+","+chosen[1]);
      }
    }
    this.dockCells=new Set(Object.values(this.dockOf).map(c=>c[0]+","+c[1]));
    this.ings.forEach(ing=>{this.islandOf[ing]=cfg.singleDock?this.dockOf[ing]:this.islandRect[ing][0];});
    const tok=cfg.crates===0?1e9:cfg.crates;
    this.tokens={}; this.ings.forEach(i=>this.tokens[i]=tok);
    this.drySeen=false;   // flips true the first time any shelf empties — the black-market ceremony plays once
    this.players=cfg.strategies.map((s,i)=>{
      // two candidate recipe cards to choose from at game start (draft phase)
      const a=this.sample(this.ings,cfg.recipeSize);
      let b=this.sample(this.ings,cfg.recipeSize);
      let tries=0;
      while(tries++<20&&a.slice().sort().join()===b.slice().sort().join())b=this.sample(this.ings,cfg.recipeSize);
      return {idx:i,strategy:s,pos:[...this.home],coins:cfg.startCoins,
        ing:[],recipe:a,recipeChoices:[a,b],firstFlip:new Set(),dockedNow:new Set(),
        done:false,heads:0,flips:0,corner:null,justDocked:false,shipwrecked:false,
        coolUntil:{},grudge:null,justLost:null,fightLog:{},
        // THE BAKE-OFF (v2.1). Initialised unconditionally, flag or no flag: they consume no r()
        // and are not in ev()'s snapshot, so with the feature off they are three inert fields and
        // the event stream is byte-identical (proved by scripts/bakeoff_baseline.js).  [UNGATED-IN-4: bakeoff_baseline.js reads the root tree, not this one]
        // `baking` is still NOT `done` — done means the voyage is over and won, and it is what
        // finishOrder, bakeRank and resolveEnd read. But a baking captain IS off the board: see
        // inPlay() below, the single predicate every "still in play" test now asks. An earlier
        // version of this note argued that making a baker non-blocking and un-tradeable-with would
        // be a defect. It was, right up until a storm blew a captain off the dock they had just lit
        // the ovens on.
        baking:false,bake:null,bakedToday:false};
    });
    // ships start at Isle of Tortuga's four docks (N/S/E/W of the island)
    const dirsArr=Object.values(DIRS);
    this.players.forEach((p,i)=>{const d=dirsArr[i%4];
      p.pos=[this.home[0]+d[0],this.home[1]+d[1]];});
    // monopolists pick the most-demanded scarce ingredient to corner
    if(cfg.crates>=1&&cfg.crates<1e9){
      for(const p of this.players){
        if(p.strategy!=="monopolist")continue;
        const demand=ing=>this.players.filter(q=>q!==p&&q.recipe.includes(ing)).length;
        p.corner=this.ings.slice().sort((x,y)=>
          (demand(y)-demand(x))||((p.recipe.includes(y)?1:0)-(p.recipe.includes(x)?1:0)))[0];
      }
    }
    this.round=0;this.battles=0;this.attWins=0;this.trades=0;this.finishOrder=[];this.events=[];this.winner=null;
    // v2 bot AI: public evidence of what each captain has been chasing (see noteDemand/demandFor).
    // Never contains anybody's recipe — only actions the whole table watched happen.
    this.demand=this.players.map(()=>({}));
    this.stormStreak=0; // notes/edits #1a: consecutive-storm counter — caps storms at 2 back-to-back
    // notes/edits NARR-04: how many rounds running the wind has held one direction (1 = first round
    // of it). Separate from stormStreak, which exists to CAP repeat storms — this one is purely
    // narration and counts calm rounds too.
    this.windStreak=0;this.windPrev=null;
  }
  r(){this.randCalls++;return this.rng();}
  isHome(c){return c[0]===this.home[0]&&c[1]===this.home[1];}
  shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(this.r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
  sample(a,k){const c=[...a];this.shuffle(c);return c.slice(0,k);}
  flip(p){p.flips++;const h=this.r()<.5;if(h)p.heads++;return h;}
  key(c){return c[0]+","+c[1];}
  isIsland(c){return this.islands[c]!==undefined;}
  ev(o){if(!this.record)return;o.round=this.round;o.wind=this.windNow;o.storm=this.stormNow;o.wind2=this.windNow2;
    // `baking` rides in the snapshot so the board can render a captain's out-of-play state from the
    // EVENT rather than from live state — which is what keeps the scrubber honest when you drag it
    // back to before the ovens were lit. It consumes no r() and is not part of the baseline
    // fingerprint's key set, so the flag-off stream is unchanged (bakeoff_baseline.js proves it).  [UNGATED-IN-4: bakeoff_baseline.js reads the root tree, not this one]
    /* PRESENTATION vs GAME FACT — why `draw` is a lane of its own and nothing here goes in `state`.
       `state` is what the move WAS: where each captain now is, what they hold, whether they are
       baking. The rules read it, the scrubber replays from it, and a wrong value in it is a wrong
       game. `draw` is only how that move should be DRAWN — here, the squares a boat crossed on its
       way to the pos baked beside it. NO RULE MAY EVER READ IT: delete the whole lane and the game
       plays out move for move identically, only uglier. That is the test for whatever visual detail
       is added next to it — if a rule would have to read it, it is not presentation and it does not
       belong here.
       It is baked in the SAME breath as the snapshot on purpose: bakeDraw checks the route against
       the pos it was baked beside and refuses one that does not land there, so the drawn line and
       the recorded move can never be published disagreeing. Same refusal sailPath and rimSweepPath
       make — no route is better than an invented one. */
    o.state=this.players.map(p=>({pos:[...p.pos],coins:p.coins,ing:[...p.ing],done:p.done,baking:!!p.baking}));const draw=this.bakeDraw(o.route,o.state[o.p]);delete o.route;if(draw)o.draw=draw;
    o.tokens={...this.tokens};this.events.push(o);
    /* RETURNS THE EVENT IT PUSHED, so a caller that wants to draw this move can hold the event
       itself instead of reaching back for the last one on the pile. That reach is what W7b found:
       the walker took its subject from events[length-1], and the engine emits a sail and calls
       tradewind(p) in the same breath, so by the time anything drew, the top of the pile was no
       longer the sail. Adds nothing to what is EMITTED — the wire payload and the determinism
       corpus are untouched. */
    return o;}
  /* The presentation lane's ONE builder, so every emitter's route reaches the wire in one shape.
     `route` is the whole drawn line INCLUDING the square left behind — self-contained, so a far
     side never has to reconstruct the start out of a previous event's snapshot. Returns null on
     anything it cannot vouch for, and a null lane means the far side draws exactly what it draws
     today. */
  bakeDraw(route,snap){
    if(!Array.isArray(route)||route.length<2||!snap||!Array.isArray(snap.pos))return null;
    const end=route[route.length-1];
    if(!Array.isArray(end)||end[0]!==snap.pos[0]||end[1]!==snap.pos[1])return null;
    if(route.some(c=>!Array.isArray(c)||c.length<2))return null;
    return {route:route.map(c=>[c[0],c[1]])};
  }
  // during a reload-replay, fast-forwarding has no real delays between turns, and a bot's turn
  // can occasionally run a beat before its own recipe assignment has landed — treat "no recipe
  // yet" as "needs nothing" rather than throwing, since it resolves itself a tick later anyway
  needs(p){return p.recipe?p.recipe.filter(i=>!p.ing.includes(i)):[];}
  /* ===== v2 bot AI: public-information inference =====
     Bots see ONLY what a player sees (Wyatt's ruling, 2026-08-04) — never a rival's secret recipe
     card. What they DO see is public and sitting on the table: which crate somebody paid for, what
     somebody asked for in an open trade, and what they were willing to fight over. `demand`
     accumulates exactly that evidence, and demandFor() turns it into the same read a human makes
     across the table. Deliberately NOT derived from q.recipe anywhere. */
  noteDemand(q,ing,weight){
    if(!this.demand||q==null)return;
    const d=this.demand[q.idx!==undefined?q.idx:q];
    if(!d)return;
    d[ing]=(d[ing]||0)+(weight===undefined?1:weight);
  }
  demandFor(q,ing){
    if(q.ing.includes(ing))return 0; // they already hold it, and no recipe asks for two of a thing
    // the bare prior: a rival's recipe covers recipeSize of the ingredients in play, so before any
    // evidence at all there is already a decent chance they want any given crate
    const prior=this.cfg.recipeSize/Math.max(1,this.ings.length);
    const seen=(this.demand&&this.demand[q.idx]&&this.demand[q.idx][ing])||0;
    return Math.min(1,prior*0.9+0.3*seen);
  }
  // "I'm fairly sure they want this" — the prior alone is never enough; it takes seeing them
  // chase it at least once.
  likelyNeeds(q,ing){return this.demandFor(q,ing)>=0.8;}
  // How close does a rival LOOK to finishing, judged only from the crates visible in their hold?
  // Drives the denial premium in trade pricing (Wyatt: charge more when the asker is nearly done).
  visibleProgress(q){
    const size=this.cfg.recipeSize||5;
    const distinct=new Set(q.ing).size;
    return Math.min(1,distinct/size);
  }
  blocked(c){const n=this.cfg.grid;
    if(c[0]<0||c[1]<0||c[0]>=n||c[1]>=n)return true;
    return this.isRound&&!this.valid.has(c[0]+","+c[1]);}
  onRim(c){return this.isRound&&this.rim.has(c[0]+","+c[1]);}
  /* entering the rim channel sweeps you to the head of that quadrant.
     `blown` records HOW the ship got into the channel, because the narration says two different
     things about it (playtest 22 item 3, Wyatt): a captain who sailed in chose the ride, and only a
     storm BLOWS anyone anywhere. The engine is the only thing that knows which happened, so it is
     the engine that records it — the alternative, guessing in the narration table from whatever
     event came before, is the kind of second source of truth this project keeps paying for.
     Only windLeg's storm push passes true; a chosen sail, a rim escape and a flight from a battle
     are all the ship moving under its own canvas. */
  tradewind(p,blown){
    if(!this.isRound)return false;
    const head=this.rimHead[p.pos[0]+","+p.pos[1]];
    if(head&&(head[0]!==p.pos[0]||head[1]!==p.pos[1])){
      /* RETURNS THE EVENT IT PUSHED, for the same reason ev() does: a caller that wants to draw
         this sweep can hold the event itself instead of reaching back for the top of the pile.
         Still falsy when no sweep happened, so every `if(tradewind(...))` reads the same. */
      p.pos=[...head];return this.ev({t:"tradewind",p:p.idx,blown:!!blown});
    }
    return false;
  }
  // D-21: the FIRST matching cause, same precedence moored()'s || chain already used — null when
  // none match. moored() is now defined in terms of this, not a parallel rule.
  mooredReason(p){
    if(p.justDocked)return "justDocked";
    if(this.cfg.singleDock&&this.adjPort(p)!==null)return "dock";
    if(man(p.pos,this.home)<=1)return "home";
    return null;
  }
  moored(p){ // ships that DOCKED last turn (or sit at a berth / Isle of Tortuga) can't be wind-forced into land
    return this.mooredReason(p)!==null;
  }
  // v2 rule 1: how far this ship may sail if its route stays off the wind's nose, and how far if
  // it touches upwind even once. The lee is gone entirely — an island upwind does nothing now.
  sailRange(){return SAIL_RANGE;}
  sailRangeUpwind(){return SAIL_RANGE_UPWIND;}
  // Is this heading directly into the wind? Crosswind is NOT upwind (rule 1b).
  isUpwindStep(dirKey){return dirKey===OPPOSITE[this.windNow];}

  // v2 rules 7+8. One direction, STORM_PUSH squares, and the ONLY things that stop you are land,
  // another ship, and the rim. The whole v1 aground ladder — pay-to-dodge, flip-to-anchor,
  // lose-half-your-coins, lose-a-crate, shipwreck — is deleted: you could see this coming a round
  // ahead on the compass (rule 6), so the price of being caught is simply your turn.
  //
  // Returns an outcome string the caller narrates and acts on:
  //   "moved"    — pushed clear, turn intact
  //   "aground"  — stopped short of land; the whole turn is forfeit (rule 8a)
  //   "held"     — stopped short of another ship (or an occupied berth); turn INTACT. Wyatt's
  //                ruling 2026-08-04: an occupied dock is a ship in the way, so you strike sail
  //                and hold fast — that is the existing blocked behaviour, not running aground.
  //   "docked"   — the push put you in an open berth, which saves you (rule 8b/8d): you stop
  //                there, count as moored, and KEEP your turn.
  //   "swept"    — carried into the rim and away on the trade winds
  /* ONE square of a storm push.

     v2.1 SIMPLIFICATION (Wyatt, 2026-08-05). The storm used to have five outcomes and a whole
     vocabulary of docks: blown INTO a berth caught you, the berth you were ALREADY at held you,
     an occupied berth stopped you, land grounded you and cost your turn. Three of those were
     about docks, and "dock" meant something different in each — which is exactly why two bugs in
     the same family surfaced in one session.

     Now there is one sentence: LAND AND OTHER SHIPS STOP YE SHORT. Nobody loses a turn, and docks
     need no storm rule at all — they are simply water the storm can push you onto or off.

     What that gives up is nothing the game was relying on. Measured over 150 games: a storm still
     moves each ship 3.05 squares on average, which is most of a full turn's sailing, and still
     flings a ship into the trade-wind rim roughly 0.85 times per storm. Deleting the lost turn
     changed the median game length by zero rounds. The punishment was carrying the edge cases;
     the drama was always in the displacement. */
  stormStep(p,dirKey){
    const d=DIRS[dirKey];
    const nx=[p.pos[0]+d[0],p.pos[1]+d[1]];
    // the edge of the world is land like any other
    if(this.blocked(nx))return "landHeld";
    // another ship holds that square — you strike sail and hold fast behind her
    const blocker=this.players.find(q=>q!==p&&this.inPlay(q)&&q.pos[0]===nx[0]&&q.pos[1]===nx[1]);
    if(blocker){this.ev({t:"blocked",p:p.idx,other:blocker.idx});return "held";}
    // land dead ahead — you fetch up short of it, no harm beyond losing the ground. Distinct from
    // "held" (another ship) so the anchor line can be narrated: this is the moment a captain drops
    // anchor rather than be driven onto the rocks, and it was silent until now.
    if(this.isIsland(nx)||this.isHome(nx))return "landHeld";
    p.pos=nx;
    /* THE RIM ENTRY GOES ON THE WIRE (W9). This stepped onto the rim and swept in the same
       breath, emitting nothing in between — so the square the ship entered the channel at
       existed in NO event, and the one animator that carries a ship around the rim had no
       starting square on the rim to derive its arc from. The host worked around it by
       reconstructing the square by hand inside its own storm driver; the guest, whose only
       route is that animator, could not, and watched the ship teleport to the whirlpool.
       rimEscape (below) has always emitted `windmove` AT the rim cell and THEN swept, which
       is exactly why its ride is drawn on every tier. Same emit, same shape, one picture. */
    if(this.onRim(nx)){this.ev({t:"windmove",p:p.idx});this.tradewind(p,true);return "swept";}   // the storm put him there
    return "moved";
  }
  stormPush(p,dirKey,dist){
    let outcome="moved";
    for(let s=0;s<dist;s++){
      outcome=this.stormStep(p,dirKey);
      if(outcome!=="moved")return outcome;
    }
    return outcome;
  }
  // The bookkeeping and narration event for one ship's storm outcome — shared by the headless
  // runStorm() and the live animated push, so bots and humans can never drift apart on the rule.
  // With the lost turn gone there is nothing to forfeit and nothing to rescue: a ship either moved
  // or it did not, and a ship that ends on a berth is docked there like any other way of arriving.
  /* ONE LINE FOR THE WHOLE STORM — playtest 21 item 3 (Wyatt: "Replace all post-storm narrations
     with one summary narration (reading the same message 4 times about different players is
     tedious) — eg (The storm moved X,Y, and Z but A had land at their back and dropped anchor)").
     His example is the shape, and it is also the argument: a storm is ONE event for the whole
     table (rule 7), so it should read as one sentence about the table, not as four sentences that
     each say a quarter of it.

     WHAT IS AND IS NOT COLLAPSED, because "replace all post-storm narrations" could mean deleting
     the per-ship events entirely and that would take real things with it:
       - the per-ship events STAY. They carry the board pops, the captain-panel notes, and the
         audio cues (windmove/blownOut -> ship-move, anchorHold -> fishing). Deleting them would
         silence the storm and strip the board of the per-ship feedback that makes the push
         legible. HARD-WON-LESSONS already records the cost of removing a rule and discovering
         afterwards what its narration was covering — "silence is a bug".
       - only their BUBBLE TEXT goes. The reading is what was tedious, not the ships moving.
     So this is a summary ADDED and four texts withdrawn, which is why the seat lists are gathered
     here rather than re-derived by the UI: the engine already knows each outcome at the moment it
     decides it, and a second derivation in the renderer is a second thing to keep in step. */
  /* THE ONE ENGINE CHANGE IN PLAN 02.2-07, DISCLOSED RATHER THAN SLIPPED IN.
     `shipHeld` is a fourth outcome group: a captain whose storm push was stopped by another SHIP.
     It is a change to what the event stream CARRIES, which normally forces a gated re-record of
     the determinism corpus — the same basis plan 02.2-04 recorded applies here and was re-checked
     before it was written: there is still no 4/ determinism corpus, so there is nothing to
     invalidate. THE MOMENT A 4/ CORPUS IS RECORDED THIS BASIS EXPIRES and a change of this shape
     needs a gated re-record instead. Nothing else about the event stream moves. */
  stormSummaryEvent(dirKey){
    const g={moved:[],held:[],shipHeld:[],blown:[],swept:[]};
    for(const p of this.players){
      const o=p.stormNote;
      if(o&&g[o])g[o].push(p.idx);
      p.stormNote=null;
    }
    // nothing at all happened to anybody — say nothing rather than narrate an absence
    if(!g.moved.length&&!g.held.length&&!g.shipHeld.length&&!g.blown.length&&!g.swept.length)return;
    this.ev({t:"stormSummary",dir:dirKey,moved:g.moved,held:g.held,shipHeld:g.shipHeld,blown:g.blown,swept:g.swept});
  }
  noteStormOutcome(p,outcome,moved,wasDocked){
    // Land brought the ship up short — whether it moved first or was pinned from the start. This
    // is the anchor moment, and Wyatt asked for the line back: *"I want the narration lines about
    // 'dropped anchor to avoid running aground' to remain."* Under v2.1 nothing runs aground any
    // more, so the line reports what the anchor SAVED you from rather than a penalty it dodged.
    if(outcome==="landHeld"){p.stormNote="held";this.ev({t:"anchorHold",p:p.idx,moved:moved?1:0});return;}
    /* A PUSH STOPPED BY ANOTHER SHIP, AND THE CAPTAIN WHO NEVER MOVED AT ALL.
       `if(!moved)return;` below is correct for every outcome but one. A captain pinned from the
       first square by a hull ahead sets no stormNote, so stormSummaryEvent has nothing to say
       about them — and the storm's one summary line silently leaves them out. Measured headless:
       71 captains omitted across 300 seeded games. Combined with the inline `blocked` line the
       same captain used to produce (now silenced in src/ui/util.js), they both narrated OUTSIDE
       the summary and were MISSING from inside it — two halves of one omission.

       Only the never-moved case is routed here. A captain who WAS driven some distance before
       fetching up behind a hull keeps today's "moved"/"blown" note and today's windmove/blownOut
       event, because that note is true and that event carries their board pop, their captains-box
       capsule and their ship-move cue. Deliberately NOT the blanket treatment `landHeld` gets one
       line above: land's branch can afford to overwrite the note because it emits `anchorHold` to
       carry the same feedback, and this branch has no such substitute. Stated rather than left as
       an asymmetry for the next reader to trip over. */
    if(outcome==="held"&&!moved){p.stormNote="shipHeld";return;}
    if(!moved)return;
    p.justDocked=this.isBerth(p.pos);
    if(outcome!=="swept"){
      const blown=wasDocked&&!p.justDocked;
      p.stormNote=blown?"blown":"moved";
      this.ev({t:blown?"blownOut":"windmove",p:p.idx});
    }
    /* ITEM 8 (Wyatt, 2026-08-23c): a ship the storm blows into the trade winds is reported ONCE,
       in the post-storm summary, like every other outcome. It used to set no note at all — the
       mid-storm tradewind event narrated a line of its own AND the summary left the captain out,
       the same two-halves-of-one-omission shape shipHeld had. The tradewind event itself still
       fires (the ride animation, the board state and an ordinary sail's narration all hang off
       it); the live path now withholds only its mid-storm bubble (runStormLive). */
    else p.stormNote="swept";
  }
  // Ships in the order the storm reaches them: furthest downwind first, so the lead ship clears
  // its square before the one behind arrives (rule 7b).
  stormOrder(dirKey){
    const d=DIRS[dirKey];
    return this.players.filter(p=>this.inPlay(p))
      .map(p=>({p,proj:p.pos[0]*d[0]+p.pos[1]*d[1]}))
      .sort((a,b)=>b.proj-a.proj).map(o=>o.p);
  }
  // v2 rule 1 reachability, shared by the engine and (via reachableFrom) the UI's highlighting.
  // Breadth-first over states of (cell, hasGoneUpwind): a route is legal when it stayed off the
  // wind's nose and is <= SAIL_RANGE long, OR touched upwind and is <= SAIL_RANGE_UPWIND long.
  // You may sail PAST other ships but never END on one, so occupied cells expand but don't land.
  //
  // `opts.throughRim` lets a caller keep the rim as a legal destination (a human may deliberately
  // ride the trade winds); bots pass it false and stay out of the channel except via rimEscape().
  /* THE ONE SAIL SEARCH. sailStates() is this function's `out` and nothing else, so the squares a
     player may sail to and the ROUTE a ship takes to reach one are answered by the same walk of the
     board — they cannot disagree about what is legal, which a second pathfinder would eventually
     manage. playtest 21 item 6 needed the route (Wyatt: "Animate the boats to take the actual legal
     routes through the water. Confusingly, it often looks like they go over land because they sail
     simply from current square to end square"), and the honest way to get it was to have the search
     that already knows remember how it arrived rather than to write a second one.

     The search state is (cell, has-any-step-bitten-into-the-wind) — NOT cell alone — because the
     budget shrinks the moment a step goes upwind. So `prev` is keyed by that whole state, and
     `bestK` records WHICH state achieved each cell's entry in `out`. Walking `prev` back from
     bestK is therefore the real route the rule allows, upwind bookkeeping included. */
  sailSearch(p,opts){
    opts=opts||{};
    const maxOpen=this.sailRange(),maxUp=this.sailRangeUpwind();
    const passable=o=>{
      if(this.blocked(o))return false;
      if(this.isIsland(o)||this.isHome(o))return false;
      if(!opts.throughRim&&this.onRim(o))return false;
      return true;
    };
    const occ=o=>this.players.some(q=>q!==p&&this.inPlay(q)&&q.pos[0]===o[0]&&q.pos[1]===o[1]);
    const k=(c,u)=>c[0]+","+c[1]+","+(u?1:0);
    // `opts.from` lets a caller ask the search from a square the ship is no longer standing on —
    // the bot path needs it, because sailPlan has already committed p.pos by the time the route is
    // wanted. An explicit origin, NEVER a temporary write to p.pos: mutating live game state to
    // read something back out of it is the shortcut HARD-WON-LESSONS records as having wedged a
    // whole run, and it would be invisible here right up until something rendered mid-way.
    const origin=opts.from||p.pos;
    const startKey=k(origin,false);
    const seen={[startKey]:0};
    const out=new Map(); // "x,y" -> fewest steps to reach it legally
    const prev={};       // state key -> the state key it was reached FROM
    const bestK=new Map();// "x,y" -> the state key that achieved out's entry for that cell
    const q=[[origin,false,0]];
    while(q.length){
      const [c,used,n]=q.shift();
      const limit=used?maxUp:maxOpen;
      if(n>=limit)continue;
      for(const dk of Object.keys(DIRS)){
        const d=DIRS[dk];
        const o=[c[0]+d[0],c[1]+d[1]];
        if(!passable(o))continue;
        const u2=used||this.isUpwindStep(dk);
        const n2=n+1;
        if(n2>(u2?maxUp:maxOpen))continue;
        const kk=k(o,u2);
        if(seen[kk]!==undefined&&seen[kk]<=n2)continue;
        seen[kk]=n2;
        prev[kk]=k(c,used);
        const ck=o[0]+","+o[1];
        // a cell you may legally FINISH on: not another ship's square
        if(!occ(o)&&(!out.has(ck)||out.get(ck)>n2)){out.set(ck,n2);bestK.set(ck,kk);}
        // the rim sweeps you away the instant you touch it — never a staging post
        if(this.onRim(o))continue;
        q.push([o,u2,n2]);
      }
    }
    out.delete(origin[0]+","+origin[1]);
    bestK.delete(origin[0]+","+origin[1]);
    return {out,prev,bestK,startKey};
  }
  sailStates(p,opts){return this.sailSearch(p,opts).out;}
  /* The squares a ship actually crosses to reach `dest`, in order, EXCLUDING the square it starts
     on and INCLUDING dest. Empty when dest is not legally reachable — callers animate nothing
     rather than invent a route, the same refusal rimSweepPath makes.

     playtest 21 item 6: a ship was drawn gliding straight from its old square to its new one, so a
     move around the corner of an island read as sailing THROUGH the island. Nothing was wrong with
     the move; only with the line drawn between its endpoints. */
  sailPath(p,dest,opts){
    if(!dest)return [];
    const {prev,bestK,startKey}=this.sailSearch(p,opts);
    let cur=bestK.get(dest[0]+","+dest[1]);
    if(!cur)return [];
    const path=[];
    // bounded by the sail budget; the guard is against a malformed prev chain, never expected
    for(let i=0;cur&&cur!==startKey&&i<64;i++){
      const parts=cur.split(",");
      path.push([+parts[0],+parts[1]]);
      cur=prev[cur];
    }
    if(cur!==startKey)return [];   // the chain did not reach the start — refuse rather than guess
    return path.reverse();
  }
  // How far every water square is from `target`, sailing around the islands rather than through
  // them — a plain BFS flood, wind ignored (wind prices how FAR you get in a turn, not which
  // routes exist). Manhattan distance is a liar next to land: a dock two squares away round the
  // corner of its own island can be four squares of actual sailing, and scoring candidate moves
  // on Manhattan makes a bot refuse every move that does not shorten a line it cannot travel.
  // That regression left a third of all bot turns doing nothing at all; v1's Dijkstra had it right.
  waterField(target){
    const k=target[0]+","+target[1];
    if(this._fieldKey===k&&this._fieldRound===this.round&&this._field)return this._field;
    const dist={[k]:0},q=[target];
    while(q.length){
      const c=q.shift(),dc=dist[c[0]+","+c[1]];
      for(const d of Object.values(DIRS)){
        const o=[c[0]+d[0],c[1]+d[1]],ok=o[0]+","+o[1];
        if(dist[ok]!==undefined)continue;
        if(this.blocked(o))continue;
        // land is impassable, but the TARGET itself may legitimately be a dock beside it
        if(this.isIsland(o)||this.isHome(o))continue;
        dist[ok]=dc+1;q.push(o);
      }
    }
    this._field=dist;this._fieldKey=k;this._fieldRound=this.round;
    return dist;
  }
  /* v2 rules 6 + 8. The compass commits next round's wind a FULL ROUND early and rule 6d
     promises the forecast is never wrong — so a captain who is paying attention can see a storm
     coming and place themselves for it. stormOutcomeFrom() used to answer "would this square
     ground me?"; v2.1 removed grounding, so the question became "where will the shove leave me?"
     and stormLanding() below answers that instead. The old helper is deleted rather than left
     unused. */
  // WHERE the forecast storm will actually leave a ship that ends its move on `cell`. Other ships
  // are not modelled — nobody can know where they will be next round, and being stopped by one is
  // harmless anyway.
  // v2.1: reads forecastWind(), NOT windNext — which means that while the forecast hides the storm's
  // direction this returns `cell` unchanged, the drift below is 0, and the bot plans the storm
  // exactly as blindly as the player does. Deliberately left standing rather than deleted: it is one
  // line from working again if the forecast ever shows direction, and gating it is what keeps the
  // bots honest instead of merely uninformed.
  stormLanding(cell){
    const dir=this.forecastWind();
    if(!this.stormNext||!dir)return cell;
    const d=DIRS[dir];
    let c=[cell[0],cell[1]];
    for(let s=0;s<STORM_PUSH;s++){
      const nx=[c[0]+d[0],c[1]+d[1]];
      if(this.blocked(nx)||this.isIsland(nx)||this.isHome(nx))return c;
      c=nx;
      if(this.onRim(c)){const h=this.rimHead[c[0]+","+c[1]];return h?[h[0],h[1]]:c;}
    }
    return c;
  }
  /* ---- READING THE LEADER, FROM PUBLIC EVIDENCE ONLY (v2.1) ----
     threatTurns(q) estimates how many turns until q could plausibly win, using exactly what any
     captain at the table can see: how many DISTINCT crates they are carrying, and how far they are
     from home. It NEVER touches q.recipe. That constraint is the whole reason this is an estimate
     rather than a calculation — a bot that knew the recipe would know precisely when to strike, and
     would be playing a different game from the one at the table.
     Distinct crates, not total: a captain hoarding three sacks of cocoa is not two-thirds of the way
     to a recipe, and counting raw cargo would rate the biggest hoarder as the biggest threat. This
     can still overestimate (five distinct crates might be four of theirs plus a spare), which is the
     right direction to be wrong in — a bot that occasionally raids a captain who was not quite as
     close as they looked is playing the same guessing game a human plays. */
  threatTurns(q){
    if(!this.inPlay(q))return 0;
    const distinct=new Set(q.ing).size;
    const short=Math.max(0,(this.cfg.recipeSize||5)-distinct);
    return short*PLAN.crateTurns+this.sailTurns(q.pos,this.home,this.windNow);
  }
  // 0 = no threat worth acting on, rising to 1 as they close on victory. Every hunting decision
  // below reads this one number, so "how close is close" is tuned in ONE place (PLAN.threatHorizon).
  threatUrgency(q){
    return Math.max(0,Math.min(1,(PLAN.threatHorizon-this.threatTurns(q))/PLAN.threatHorizon));
  }
  /* Where to sail to CUT THEM OFF rather than chase them — Wyatt's "guess where they may be trying
     to go". No mind-reading is needed: a captain near the end of their recipe is sailing home, and
     home is the one destination every player at the table can see. So this walks a few squares down
     the water-distance field toward home from where they are now, and aims there.
     Aiming at their CURRENT square is what a stern chase looks like: you arrive where they were.
     PLAN.interceptLead squares of lead is enough to meet them, and short enough that a bot never
     abandons its own errand to camp the home port. */
  interceptOf(q){
    const field=this.waterField(this.home);
    let c=[q.pos[0],q.pos[1]];
    const lead=Math.min(PLAN.interceptLead,Math.max(0,Math.round(this.threatTurns(q))));
    for(let s=0;s<lead;s++){
      let best=null,bv=field[c[0]+","+c[1]];
      if(bv===undefined)break;
      for(const d of Object.values(DIRS)){
        const nx=[c[0]+d[0],c[1]+d[1]];
        const v=field[nx[0]+","+nx[1]];
        if(v!==undefined&&v<bv){bv=v;best=nx;}
      }
      if(!best)break;
      c=best;
    }
    return c;
  }
  /* SAIL THE TURN'S PLAN — the one movement entry point both turn paths share (Game.takeTurn
     headless, src/ui/flow.js botTurn animated), so a route that exists in one can never be
     missing from the other. The ordinary case is stepToward. A plan that rides the trade winds
     names the square where the ship ENTERS the channel; the caller's tradewind(p) then does what
     it does for a human who sails onto the rim, which is the whole of the ride. */
  sailPlan(p,plan){
    if(plan.via&&this.sailStates(p,{throughRim:true}).has(plan.via[0]+","+plan.via[1])){
      p.pos=[...plan.via];return true;
    }
    return this.stepToward(p,plan.cell);
  }
  // Move as close to `target` as this turn's sailing allows, measured in real sailing distance.
  // Ties break toward the shorter move, so a bot never burns its whole range drifting sideways
  // when it is already as close as it can get.
  stepToward(p,target){
    const cells=this.sailStates(p);
    if(!cells.size)return false;
    const field=this.waterField(target);
    const here=field[p.pos[0]+","+p.pos[1]];
    const cur=here===undefined?man(p.pos,target):here;
    let best=null,bestScore=Infinity;
    for(const [ck,n] of cells){
      const c=ck.split(",").map(Number);
      const fd=field[ck];
      // a square the flood never reached is cut off from the target — fall back to Manhattan so
      // it still ranks, just always behind anything genuinely connected
      const d=fd===undefined?man(c,target)+1000:fd;
      // Storm lookahead (rules 6 + 8). Running aground costs a WHOLE TURN, which is worth more
      // than a square or two of progress — so an unsafe berth is penalised by more than one step
      // of distance, and a bot will willingly end its move further from the island to keep its
      // next turn. A square the storm would blow into an open dock is a small BONUS: rule 8d says
      // you tie up safe there and keep the turn, so the storm does the sailing for you.
      // v2.1: being stopped by land is no longer a punishment to dodge — it is simply no movement,
      // and movement can help as easily as hurt (measured: the storm pushes a ship CLOSER to its
      // target 25% of the time and further 36%). So the bot no longer flees "blocked"; it scores
      // where the storm will actually leave it, and mildly prefers a square whose shove helps.
      // Weighted well under one step of real distance so it can never override reaching a dock.
      const land=this.stormLanding(c);
      const after=field[land[0]+","+land[1]];
      const drift=(after===undefined||fd===undefined)?0:(after-fd);
      const stormPenalty=drift*PLAN.stormDrift;
      const score=d*1000+n+stormPenalty;
      if(score<bestScore){bestScore=score;best=c;}
    }
    if(!best)return false;
    const bd=field[best[0]+","+best[1]];
    const bestDist=bd===undefined?man(best,target)+1000:bd;
    // nothing in range gets us any closer — hold position rather than drift for the sake of it
    if(bestDist>=cur)return false;
    p.pos=[...best];
    return true;
  }
  // AI-05: is this bot walled in — every orthogonal neighbour blocked, an island, home, occupied,
  // or the rim? (The rim counts as "not an ordinary move" because stepToward refuses it.) When
  // this is true a bot has no normal way out and used to just sit there turn after turn.
  boxedIn(p){
    return Object.values(DIRS).every(d=>{
      const o=[p.pos[0]+d[0],p.pos[1]+d[1]];
      return this.blocked(o)||this.isIsland(o)||this.isHome(o)||this.onRim(o)||
        this.players.some(q=>q!==p&&this.inPlay(q)&&q.pos[0]===o[0]&&q.pos[1]===o[1]);
    });
  }
  // notes/edits AI-04/AI-05: a boxed-in bot may duck INTO the trade-wind channel to escape — the
  // rim sweeps it to that quadrant's head, unsticking it. Only ever used as a last resort (see
  // takeTurn), so normal play still keeps bots out of the current; this is the one time a bot
  // deliberately uses the trade winds the way a human can.
  rimEscape(p){
    if(!this.isRound)return false;
    for(const d of Object.values(DIRS)){
      const o=[p.pos[0]+d[0],p.pos[1]+d[1]];
      if(this.onRim(o)&&!this.blocked(o)&&!this.players.some(q=>q!==p&&this.inPlay(q)&&q.pos[0]===o[0]&&q.pos[1]===o[1])){
        p.pos=o;this.ev({t:"windmove",p:p.idx});
        this.tradewind(p);
        return true;
      }
    }
    return false;
  }
  /* Is this square a berth a ship can tie up at? THE FOUR TORTUGA BERTHS COUNT.
     `dockCells` holds only the island docks, so a storm that shoved a ship onto a Tortuga berth
     did not recognise it as a rescue, carried on pushing into the island itself, and grounded the
     captain — losing them a turn while they sat in a berth. Wyatt, 2026-08-05: *"I was blown into
     a dock, on tortuga, which should be the same as every other dock."* He is right, and the rest
     of the engine already agrees: mooredReason() has always treated a Tortuga berth as a berth.
     Distance exactly 1 — the home square itself is land, not a berth. */
  isBerth(c){
    if(this.dockCells.has(c[0]+","+c[1]))return true;
    return man(c,this.home)===1;
  }
  adjPort(p){
    if(this.cfg.singleDock){
      for(const ing of this.ings){const d=this.dockOf[ing];
        if(p.pos[0]===d[0]&&p.pos[1]===d[1])return ing;}
      return null;
    }
    for(const d of Object.values(DIRS)){const c=[p.pos[0]+d[0],p.pos[1]+d[1]];
      if(this.isIsland(c))return this.islands[c];}
    return null;
  }
  dockOccupiedBy(ing,exclude){
    const d=this.dockOf[ing];if(!d)return null;
    for(const q of this.players)if(q!==exclude&&this.inPlay(q)&&q.pos[0]===d[0]&&q.pos[1]===d[1])return q;
    return null;
  }
  adjOpp(p){const out=this.players.filter(q=>q!==p&&this.inPlay(q)&&man(p.pos,q.pos)<=1);this.shuffle(out);return out;}
  tradeOpp(p){if(this.cfg.parley)return this.players.filter(q=>q!==p&&this.inPlay(q));
    return this.players.filter(q=>q!==p&&this.inPlay(q)&&man(p.pos,q.pos)<=1);}
  // v2 rule 11: price = 6 − crates still on the island. 3 left → 3🌕, 2 → 4🌕, 1 → 5🌕. Shared by
  // the whole table, and self-correcting if a crate ever comes back into supply — it is a function
  // of the board, not a counter anybody has to maintain. Returns null when there is nothing to buy.
  cratePrice(ing){
    const left=this.tokens[ing];
    // sold out -> the black market's flat price (never null while cfg.blackMarket is set). This
    // ONE change is how the bots learn the mechanic with no special rules: every planner —
    // acquireTurns and planTurnV3's dock branch — price crates through here, so a dry
    // shelf simply becomes an expensive shelf and the same win-likelihood math weighs it against
    // dealing and fighting. (rivalPlan3/tour3 model prices locally for speed; they mirror this
    // rule in place — change the two together.)
    if(!left||left<=0)return this.cfg.blackMarket||null;
    if(left>=1e9)return this.cfg.crateBase-1; // endless-supply sentinel: hold the opening price
    return Math.max(1,this.cfg.crateBase-left);
  }
  // ONE purchase path for bot and human alike (they diverged once before — see humanDock's
  // keep-in-step warning). Pays, takes the crate, and floors the shelf at zero: the black market
  // is bottomless, so a sold-out shelf never goes negative and its price never leaves 10.
  // Returns what the buy did for the caller's dock event to say — `black` (paid the black
  // market), `wentDry` (this purchase emptied the shelf), `firstDry` (first shelf of the whole
  // voyage to empty — the ceremony that teaches the black market keys on this, once).
  /* THE BLACK MARKET'S SECOND PRICE (Wyatt, 2026-08-13): "you can trade any 2 ingredients for the
     black market ingredient of the island you're docked at — so you either pay in doubloons or in
     2 crates."

     His three rulings, taken as given:
       - DRY SHELVES ONLY. Exactly the trigger the coin black market already has, so geography and
         the 3/4/5-coin shelf are untouched; this only means an empty purse is no longer a wall.
       - THE CRATES LEAVE THE GAME. Not restocked anywhere. The voyage keeps tightening.
       - ANY TWO, DUPLICATES ALLOWED. A hold full of the same junk crate is now worth something.

     Which two you spend is the CALLER's choice — a human picks them, a bot picks with
     blackMarketPick() below. This function only validates and settles, so the two can never
     diverge the way the buy path once did (see buyCrate's own note).  */
  canBlackMarket(p,ing){
    return !!(this.cfg.blackMarket&&this.cfg.dockBuy&&
      !(this.tokens[ing]>0)&&this.tokens[ing]!==undefined&&p.ing.length>=2);
  }
  // Settle a barter. `give` is two ingredient names out of p.ing (duplicates fine). Returns the
  // same shape buyCrate does so the dock event can narrate either payment identically.
  barterCrate(p,ing,give){
    if(!this.canBlackMarket(p,ing))return null;
    if(!Array.isArray(give)||give.length!==2)return null;
    // validate against a COPY before mutating anything — paying with a crate you do not hold, or
    // with the same single crate twice, must fail whole rather than half-settle
    const pool=p.ing.slice();
    for(const g of give){
      const at=pool.indexOf(g);
      if(at<0)return null;
      pool.splice(at,1);
    }
    p.ing=pool;
    p.ing.push(ing);
    return {price:0,paidIng:give.slice(),black:1,wentDry:0,firstDry:0};
  }
  /* WHICH two a bot spends, and whether it should. Denominated in TURNS, because that is the only
     currency the objective is written in (BOT-DESIGN-PRINCIPLES section 0: a bot acts to minimise
     the expected turns until IT wins) — never a gate, and never "does it have spare junk".

     Giving up a crate costs what getting it back would cost: nothing much if it is surplus, a real
     leg of sailing if the recipe still wants it. So the two CHEAPEST crates by that measure are the
     ones to spend, and the barter is worth doing only when it beats earning the coins instead. */
  blackMarketPick(p,ing){
    if(!this.canBlackMarket(p,ing))return null;
    const need=this.needs(p);
    const cost=g=>{
      // a crate the recipe still wants, and this is the only one aboard: losing it costs the whole
      // errand to replace. A spare copy, or a crate nothing needs, is leverage and little else.
      const wanted=need.includes(g)||(p.recipe&&p.recipe.includes(g)&&this.cnt(p.ing,g)<=1);
      return wanted?this.acquireTurns(p,g).turns:PLAN.leverageTurns;
    };
    const ranked=p.ing.map(g=>({g,c:cost(g)})).sort((a,b)=>a.c-b.c);
    if(ranked.length<2)return null;
    const give=[ranked[0].g,ranked[1].g];
    const barterTurns=ranked[0].c+ranked[1].c;
    // the coin route's cost is only the coins it still has to EARN — what is already in the purse
    // is sunk, and spending it here costs nothing extra
    const coinTurns=this.coinTurns(Math.max(0,(this.cfg.blackMarket||0)-p.coins));
    return {give,barterTurns,coinTurns,worthIt:barterTurns<coinTurns};
  }
  buyCrate(p,ing){
    const price=this.cratePrice(ing);
    if(price===null||p.coins<price)return null;
    const left=this.tokens[ing];
    const black=(left<=0)?1:0;
    p.coins-=price;p.ing.push(ing);
    let wentDry=0,firstDry=0;
    if(!black&&left<1e9){
      this.tokens[ing]--;
      if(this.tokens[ing]===0){wentDry=1;if(!this.drySeen){this.drySeen=true;firstDry=1;}}
    }
    return {price,black,wentDry,firstDry};
  }
  // v2 rule 10: docking is a treasure hunt, THEN a purchase. The flip only decides your payday —
  // heads you turn up buried treasure (cfg.dockHeads), tails you spend the turn working the dock as
  // a hand (cfg.dockTails). There is no free crate any more: crates are bought, won, or traded for (rule 10b).
  // Buying is offered after EITHER outcome and may use the coins just earned (rule 10c).
  doDock(p,port){
    const ing=port,k=port; // ports are identified by ingredient name
    if(this.cfg.singleDock&&this.dockOccupiedBy(ing,p))return false;
    p.firstFlip.add(k);p.dockedNow.add(k);p.justDocked=true;
    const h=this.flip(p);
    p.coins+=h?this.cfg.dockHeads:this.cfg.dockTails;
    const price=this.cratePrice(ing);
    // a bot buys when it needs the crate and can afford today's price — or, if it trades for a
    // living, when the crate is leverage somebody else at the table plainly needs (rule 4 fodder)
    let got=h?"treasure":"dockhand",buy=null;
    if(this.cfg.dockBuy&&price!==null){
      const needsIt=this.needs(p).includes(ing);
      const leverage=this.cfg.merchant&&!needsIt&&
        PERSONALITY[p.strategy]&&PERSONALITY[p.strategy].hoardBias>=1.4&&
        this.players.some(q=>q!==p&&this.inPlay(q)&&this.likelyNeeds(q,ing));
      if(needsIt||leverage){
        // playtest 20: a dry shelf now has TWO prices. Coins if the purse can stand it, or any two
        // crates out of the hold. A bot takes whichever costs it fewer TURNS (blackMarketPick) —
        // never a gate, and it only ever spends crates when that genuinely beats earning the coin.
        // Leverage buying stays a coin-only errand: paying two real crates for stock to dangle at
        // somebody else would spend the voyage to win someone else's.
        const bm=needsIt?this.blackMarketPick(p,ing):null;
        if(bm&&(bm.worthIt||p.coins<price))buy=this.barterCrate(p,ing,bm.give);
        if(!buy&&p.coins>=price)buy=this.buyCrate(p,ing);
        if(buy)got="bought";
      }
    }
    this.ev({t:"dock",p:p.idx,ing,heads:h?1:0,got,price:buy&&buy.paidIng?0:price,
      paidIng:buy&&buy.paidIng?buy.paidIng:undefined,
      black:buy?buy.black:0,wentDry:buy?buy.wentDry:0,firstDry:buy?buy.firstDry:0});
    return true;
  }
  // v2.2 RULE-01: passing pays a dubloon. Passing is the always-available turn-ender — the one move
  // nobody can ever be denied — so this is the floor of the economy rather than a reward for idling:
  // a captain who is blocked, broke and out of reach of every berth still comes away with something
  // to show for the day. The narration says so (EVENT_NARRATION.pass, src/ui/util.js).
  //
  // THE ORDER OF THESE TWO LINES IS THE RULE, not a style preference — the same order doDock uses,
  // and for the same reason. ev() is a RECORDER, not a reducer: it builds its own state snapshot at
  // the instant it is called, mapping every captain's purse. Record before paying and that snapshot
  // holds the pre-payment purse, so the replay scrubber shows a captain a dubloon short at the exact
  // tick their narration claims payment. Phase 3 freezes this stream into a determinism corpus,
  // after which the same fix costs a gated re-record (docs/DETERMINISM-RERECORD.md).
  // 4/scripts/pass_coin_test.js reads the purse back out of the snapshot and has been seen failing
  // with these two statements swapped.
  //
  // NOT conditioned on this.record. ev() self-gates; the payment must not — a game that happens not
  // to be recording is still a game being played, and the dubloon is a rule, not a log entry.
  //
  // ONE method, three call sites: the engine fallback below, and both UI-tier sites in
  // src/ui/flow.js (the human menu and the animated bot fallback, which is deliberately duplicated
  // rather than inherited — see the note there). Bots and humans have identical rules and
  // affordances, so bots pass and bots are paid. Deliberately NOT folded in: the human-only sea
  // cursor advanced at the flow.js menu site, which is per-device narration bookkeeping owned by one
  // seat — bots walk their own derived offsets and would be handed a cursor they must not touch.
  //
  // THE AMOUNT IS NOT WRITTEN HERE. It is a field on the round config (see roundCfg, and the note
  // on it), read live off this game's own cfg, so the payment, the Pass button and the narration
  // tag can never disagree about what a pass is worth. "A dubloon" above is the SHIPPED DEFAULT,
  // not a constant: D-07 may lower it at the wave 5 balance gate, and that edit lands on the config
  // field, not on this line.
  doPass(p){
    p.coins+=this.cfg.passCoin;
    this.ev({t:"pass",p:p.idx,sea:this.nextSeaCreature(p)});
  }
  // NARR-04: record this round's wind and return how many rounds running it has held that
  // direction. Called once per round, right after the direction is rolled.
  noteWind(dir){
    this.windStreak=(this.windPrev===dir)?(this.windStreak||1)+1:1;
    this.windPrev=dir;
    return this.windStreak;
  }
  // What this captain sees when they look into the ocean. Walks the list rather than sampling it:
  // each seat starts at a different offset and advances one step per look, so all thirty appear
  // before any repeats and two captains rarely see the same beast in the same round. Consumes no
  // RNG, so it cannot perturb a seeded replay.
  // Each captain walks the list from a different starting point, one step per look, so all fifty
  // appear before any repeat — a random pick would collide almost immediately (birthday problem: a
  // repeat is more likely than not inside eight looks).
  //
  // `seaSeat`/`seaBase` (Wyatt, 2026-08-06: "remember where the host was in the lineup, and start
  // their next game from the next one so they work their way through the whole list over many
  // games") let ONE seat resume mid-list instead of always starting at its derived offset. Both are
  // plain numbers set on the instance by beginGame — the engine never learns what a "local player"
  // or a localStorage key is (D-03: no DOM, no storage, no wall-clock in this tier). The cursor is
  // read once per GAME rather than once per look, which is what keeps a host-refresh replay showing
  // the same creatures it showed the first time: base is fixed for the voyage and `oceanLooks` is
  // rebuilt deterministically from the decision log.
  nextSeaCreature(p){
    const n=(p.oceanLooks=(p.oceanLooks||0)+1);
    const base=(p.idx===this.seaSeat)?(this.seaBase||0):p.idx*7;
    return SEA_CREATURES[(base+n-1)%SEA_CREATURES.length];
  }
  cnt(arr,x){return arr.filter(v=>v===x).length;}

  /* ================= v2 rule 4: the table-wide open trade =================
     Nobody targets a partner any more. You announce WHAT YOU WANT and WHAT YOU OFFER to the whole
     table; everyone holding it accepts, denies, or counters; you pick one answer or walk away.
     One round only — a counter cannot itself be countered.

     An offer is {want, giveIng, giveCoins}. A response is
     {q, kind:"accept"|"deny"|"counter", askFor, why}. */

  // Everyone who could answer an offer for `ing` — i.e. actually holds one. Cargo is public, so
  // this is exactly what the asking player can see for themselves.
  holdersOf(ing,exclude){
    return this.players.filter(q=>q!==exclude&&this.inPlay(q)&&q.ing.includes(ing));
  }
  // How a bot prices a crate somebody is asking it for. Wyatt's ruling, 2026-08-04: price it in
  // TURNS — how long would it take me to replace this myself — PLUS a denial premium when the
  // asker looks close to finishing. That is the whole valuation; there is no flat threshold.
  offerValueTurns(q,offer){
    let v=0;
    // q is valuing what it is being HANDED, so it may consult its own recipe — this is q's own
    // decision about q's own cargo, not a guess about somebody else's.
    if(offer.giveIng)v+=this.acquireTurns(q,offer.giveIng).turns*(this.needs(q).includes(offer.giveIng)?1:0.25);
    v+=this.coinTurns(offer.giveCoins||0);
    return v;
  }
  // Public estimate of how dearly ANOTHER captain holds a crate they own. Built only from what
  // the whole table can see — how many of them they have, whether anybody ever saw them chase
  // that ingredient, and how close their visible hold is to a full recipe. Deliberately never
  // reads q.recipe: this is the guess a human makes across the table, and it is what a bot uses
  // when deciding whether opening a trade is even worth the turn.
  estimateCrateCost(q,ing){
    const held=this.cnt(q.ing,ing);
    const seen=(this.demand&&this.demand[q.idx]&&this.demand[q.idx][ing])||0;
    let c=PLAN.leverageTurns;          // a crate nobody saw them chase is probably spare
    if(seen)c+=2.5*Math.min(2,seen);   // seen going after this — they'll want paying properly
    if(held>1)c*=0.45;                 // a duplicate is easy to part with, whatever it is
    c+=3*this.visibleProgress(q);      // a captain close to baking parts with nothing cheaply
    return c;
  }
  crateCostTurns(q,ing,asker){
    // what it costs ME to hand this over: what I'd have to spend to replace it...
    const spare=this.cnt(q.ing,ing)-(this.needs(q).includes(ing)?0:0);
    let cost=this.acquireTurns(q,ing).turns;
    // ...discounted hard if it is surplus I never needed (pure leverage, not a recipe item)
    if(!q.recipe||!q.recipe.includes(ing))cost=PLAN.leverageTurns*(PERSONALITY[q.strategy]||PERSONALITY.balanced).hoardBias;
    else if(spare>1)cost*=0.4; // a second copy of a recipe item is cheap to let go
    // ...plus the denial premium: the closer the asker looks to baking, the dearer this gets, and
    // past a point no price buys it at all (handled by the caller as an outright deny)
    if(asker)cost+=4*this.visibleProgress(asker)*(this.likelyNeeds(asker,ing)?1:0.4);
    return cost;
  }
  // One captain's answer to an open offer. Bots reason; humans are asked by the UI instead.
  respondToOffer(q,offer,asker){
    if(!q.ing.includes(offer.want))return {q,kind:"deny",why:"nohave"};
    const cost=this.crateCostTurns(q,offer.want,asker);
    const value=this.offerValueTurns(q,offer);
    const bias=(PERSONALITY[q.strategy]||PERSONALITY.balanced).dealBias;
    if(value*bias>=cost)return {q,kind:"accept"};
    // a rival one crate from home is refused outright, at any price — same instinct v1 had, now
    // driven by what the bot can actually SEE rather than by reading their recipe card
    const nearlyDone=asker&&this.visibleProgress(asker)>=(this.cfg.recipeSize-1)/this.cfg.recipeSize;
    if(nearlyDone&&this.likelyNeeds(asker,offer.want))return {q,kind:"deny",why:"blocking"};
    // otherwise name a price: the coin shortfall, converted back out of turns
    const shortTurns=cost-value*bias;
    /* ASK FOR A CRATE, NOT ONLY FOR COIN — playtest 21 item 7, and it is the PARITY half of it.
       Wyatt's ruling when humans could not counter with a crate: "rather than remove the bot's
       ability, we want to add it to the human ability." The same principle runs back the other
       way — having taught the human to say "keep yer coin, I want yer milk", a bot that can only
       ever answer "+2 coins" is now the one with the poorer vocabulary, and the standing invariant
       is that bots play by exactly the same affordances as humans.

       No new valuation: it asks what the crate would be worth to ITSELF, with the same call
       offerValueTurns already uses to price a crate on the table. Reading its own recipe here is
       correct and not mind-reading (principle 5) — q is deciding what q wants — and the asker's
       hold is public, so choosing from it is a read any player could make across the table.

       Preferred over coin when it actually covers the gap, because a crate a bot NEEDS is worth
       whole turns of sailing while coins are worth a fraction of one — so this is the counter more
       likely to be worth striking for both sides, which is the entire point of countering. */
    if(asker){
      let bestIng=null,bestVal=0;
      for(const i of new Set(asker.ing)){
        if(i===offer.giveIng)continue;                 // already on the table — not a counter
        const v=this.acquireTurns(q,i).turns*(this.needs(q).includes(i)?1:0.25);
        if(v>bestVal){bestVal=v;bestIng=i;}
      }
      if(bestIng&&bestVal*bias>=shortTurns)return {q,kind:"counter",askIng:bestIng,askFor:0};
    }
    const askFor=Math.max(1,Math.ceil(shortTurns*PLAN.coinsPerDockTurn));
    if(asker&&askFor>asker.coins-(offer.giveCoins||0))return {q,kind:"deny",why:"toodear"};
    return {q,kind:"counter",askFor};
  }
  // Every answer to an open offer, in seat order. The asker sees all of them at once (rule 4a) —
  // human captains are skipped here and prompted by the UI instead.
  collectResponses(offer,asker,opts){
    opts=opts||{};
    const out=[];
    for(const q of this.holdersOf(offer.want,asker)){
      if(q.strategy==="human"&&!opts.includeHumans)continue;
      out.push(this.respondToOffer(q,offer,asker));
    }
    return out;
  }
  // Settle an agreed deal. `extra` is any coins added by a counter-offer the asker accepted.
  settleTrade(p,q,offer,extra){
    extra=extra||0;
    const total=(offer.giveCoins||0)+extra;
    if(!q.ing.includes(offer.want))return false;
    if(offer.giveIng&&!p.ing.includes(offer.giveIng))return false;
    if(p.coins<total)return false;
    q.ing.splice(q.ing.indexOf(offer.want),1);p.ing.push(offer.want);
    if(offer.giveIng){p.ing.splice(p.ing.indexOf(offer.giveIng),1);q.ing.push(offer.giveIng);}
    if(total){p.coins-=total;q.coins+=total;}
    // /4 playtest 13 (Wyatt: "dough hook traded milk for my sugar, then immediately tried to buy
    // it back for much less. A human would intuitively not do this"): both captains remember what
    // they just handed over. botOpenOffer refuses to hail the table for a crate its own captain
    // gave away within the last few rounds — the seller's remorse rule.
    if(!q.gaveAway)q.gaveAway={};
    q.gaveAway[offer.want]=this.round;
    if(offer.giveIng){if(!p.gaveAway)p.gaveAway={};p.gaveAway[offer.giveIng]=this.round;}
    this.trades++;
    // v2 rule 4e: no harbor-tax refund. A trade is just the exchange.
    // The whole table watched who wanted what — that is public evidence, and it is how bots
    // learn each other's recipes without ever being shown one.
    this.noteDemand(p,offer.want,1);
    if(offer.giveIng)this.noteDemand(q,offer.giveIng,0.5);
    this.ev({t:"trade",a:p.idx,b:q.idx,gave:this.offerLabel(offer,extra),got:offer.want,kind:extra?"counter":"open"});
    return true;
  }
  /* WHAT A COUNTER ACTUALLY MEANS, in one place — playtest 21 item 7.

     A counter comes in two shapes now and they settle differently, which is precisely the kind of
     fork that grows a family of bugs if each caller works it out for itself (this project already
     has "one word meaning three things" written down for the same reason):

       {askFor:n}            the old shape — n MORE coins on top of what was offered. Additive.
       {askIng:i, askFor:n}  the new one — "keep yer coin, I want yer milk". REPLACES the offer's
                             give side entirely, because Wyatt's ruling is that a counter is a
                             fresh deal: "instead" means instead, and no money rides along
                             invisibly from an offer that was just rejected.

     Returns a full offer object ready for settleTrade, so the button label a captain reads and the
     trade that actually settles are derived from the SAME call. `want` never changes: a counter
     haggles over the price, never over which crate is being sold. */
  counterTerms(offer,r){
    if(!r||r.kind!=="counter")return offer;
    if(r.askIng==null)
      return {want:offer.want,giveIng:offer.giveIng,giveCoins:(offer.giveCoins||0)+(r.askFor||0)};
    return {want:offer.want,giveIng:r.askIng,giveCoins:r.askFor||0};
  }
  offerLabel(offer,extra){
    const coins=(offer.giveCoins||0)+(extra||0);
    return (offer.giveIng?ilabelImg(offer.giveIng):"")+(offer.giveIng&&coins?" + ":"")+(coins?`${coins} coins`:"");
  }
  /* ================= trade memory: why an offer is not worth repeating =================
     Wyatt, 2026-08-05: *"bots must remember trades they've requested and been rejected from, and
     not request the same ones again if they've failed, unless the table has substantively
     changed... write logic (not gates) to stop spam."*

     So this is deliberately NOT a cooldown. A timer would be a gate: it would silence a bot that
     has a genuinely better offer, and then let the identical hopeless one through again the moment
     it lapsed. What actually stops spam is asking the honest question — *has anything changed that
     could change their answer?* — and the answer is derived from the board, so a bot re-asks the
     instant it has a real reason to and never before.

     A refusal is remembered per (crate wanted, captain who refused), with what the offer was worth
     at the time and what that captain's situation looked like. Three things can revive it, each of
     them a real change in the world rather than the passage of time:

       1. THE OFFER GOT BETTER. Materially — a fifth more than they turned down, not a coin.
       2. WHAT WE'RE OFFERING IS NOW SOMETHING THEY WANT. Judged from public evidence only
          (demandFor), so this fires when the table watched them chase that ingredient.
       3. THEIR HOLD CHANGED so the crate is cheaper for them to part with — they picked up a
          second one, or they have visibly stopped needing it.

     Note what is deliberately absent: elapsed rounds. A bot that has nothing new to say stays
     quiet for the whole game, which is exactly right. */
  rememberRefusal(p,want,byIdx,worth){
    if(!p.refused)p.refused={};
    const q=this.players[byIdx];
    p.refused[want+"|"+byIdx]={
      worth,
      // their situation AT THE MOMENT THEY SAID NO, so we can tell later whether it moved
      held:q?this.cnt(q.ing,want):0,
      progress:q?this.visibleProgress(q):0,
      wantedOurs:0, // filled by the caller when it knows what was on the table
    };
  }
  // Records whether what we offered was something they visibly wanted at the time they refused.
  // One place decides it, because worthReAsking's rule 2 compares against exactly this flag.
  refusedFlagWanted(p,offer,q){
    const memo=p.refused&&p.refused[offer.want+"|"+q.idx];
    if(memo)memo.wantedOurs=offer.giveIng&&this.likelyNeeds(q,offer.giveIng)?1:0;
  }
  // Would it be worth putting this offer to this captain again? Everything here is public.
  worthReAsking(p,q,want,offer){
    const memo=p.refused&&p.refused[want+"|"+q.idx];
    if(!memo)return true; // never refused us — always worth asking
    const worth=this.offerWorthTurns(p,offer);
    if(worth>=memo.worth*1.2+0.15)return true;          // 1. a materially better offer
    if(offer.giveIng&&this.likelyNeeds(q,offer.giveIng)&&!memo.wantedOurs)return true; // 2. they want what we hold now
    if(this.cnt(q.ing,want)>memo.held)return true;      // 3a. they picked up a spare
    if(this.visibleProgress(q)<memo.progress-0.01)return true; // 3b. they lost ground; it may be cheap now
    return false;
  }
  // What our own offer is worth, in the same turn units everything else is priced in. Kept next to
  // the memory because the memory stores its output and the two must not drift apart.
  offerWorthTurns(p,offer){
    return this.coinTurns(offer.giveCoins||0)+(offer.giveIng?PLAN.leverageTurns:0);
  }
  // What offer would this bot put to the table? It asks for the ingredient its route says is
  // dearest to get any other way, and offers the cheapest thing it owns that the holders are
  // likely to want — a surplus crate first (it costs almost nothing to give away), sweetened with
  // coins only as far as it must.
  //
  // ORDER IS LOAD-BEARING: the offer is COMPOSED FIRST and only then tested against the memory,
  // for each candidate crate in turn. Testing before composing (which is what the first cut did)
  // checks a hypothetical offer and lets the real one through anyway — the bot still hails the
  // table and only then discovers nobody will answer, which is precisely the spam. The hail is
  // the thing being suppressed, so nothing may announce before this returns.
  /* WHAT TO OPEN WITH — playtest 21 item 4 (Wyatt: "The bots offer trades that are far too low to
     be enticing, early on… no one would trade a resource that cost them 3 for 5, when it would
     waste them a turn, and save their opponent travel across the board. Find an elegant way to
     increase the theory of mind of the bots with trades; in fact i think the logic is already in
     there.")

     He was right on both counts, and the second one is the whole shape of this fix. The RESPONDER
     already has the theory of mind: respondToOffer prices a crate in turns and names the exact
     coin shortfall it would take to say yes. The PROPOSER never asked. It bid a flat 2 coins
     alongside a crate and 5 coins alone, hardcoded, having consulted nobody — so the table's
     answer was mostly no. Measured over 150 seeded voyages before this change:
         487 open offers -> 28 trades struck.  A 5.7% hit rate.
         mean bid 4.35 coins; 311 of the 487 hails inside the first five rounds.
     That is not a negotiation, it is 94% noise, and it is exactly what he was reading on screen.

     SO THE BID IS NOW DERIVED, NOT DECLARED: what would it take to make somebody say yes?

     THE HARD CONSTRAINT, and it decides the whole implementation — BOT-DESIGN-PRINCIPLES §5, only
     what a player can see. The obvious version of this change is to call respondToOffer() (or
     crateCostTurns, or needs(q)) and read the answer off. EVERY ONE OF THOSE READS q.recipe, which
     p is not allowed to know — it would be mind-reading, it would be an affordance no human at the
     table has, and it would quietly break the parity invariant the whole trade design rests on.
     estimateCrateCost() exists for precisely this and says so in its own comment: the guess a human
     makes across the table, built only from crates held, demand anyone has publicly shown, and
     visible progress. That is what this prices against. The bid can therefore be WRONG — and it
     should be, sometimes. Being wrong is what the counter-offer is for.

     TWO CEILINGS, both of which must hold, because a bid that wins the crate and loses the voyage
     is the process-optimising failure §0 warns about:
       1. never bid more than the crate is worth TO ME — acquireTurns says what fetching it myself
          would cost, and that is the identical test tryTrade already applies before paying a
          counter, so opening and closing a deal are now priced on one scale instead of two;
       2. never bid past the purse, less the powder a fighting archetype is holding back.

     Bid to clear the CHEAPEST live holder, not the dearest: one yes is all a hail needs.

    Returns {coins, need}: what it will actually put on the table, and what it publicly reckons the
    table wants. composeOffer needs BOTH, because the gap between them is the whole question of
    whether opening yer mouth is worth the turn. */
  openingBid(p,want,giveIng,holders,reserve){
    const live=holders&&holders.length?holders:this.holdersOf(want,p);
    if(!live.length)return {coins:0,need:0};
    const need=Math.min(...live.map(q=>{
      // what the offer is ALREADY worth to them, estimated publicly. likelyNeeds reads observed
      // demand — who was seen chasing what — never a recipe card.
      const theirs=giveIng?(this.likelyNeeds(q,giveIng)?PLAN.crateTurns:PLAN.leverageTurns):0;
      const shortTurns=this.estimateCrateCost(q,want)-theirs;
      let coins=Math.max(0,Math.ceil(shortTurns*PLAN.coinsPerDockTurn));
      /* LEARN THE PRICE FROM THE REFUSAL. A captain who turned down 5🌕 has told ye, for free and
         in public, that their price is ABOVE 5 — so the estimate that produced 5 was too low and
         must never be trusted again for this pair. Without this the bid is re-derived from the
         same unchanged public evidence every time, and the ONLY thing that moves it is the bot's
         own growing purse: it gets richer, bids a little more, clears worthReAsking's "materially
         better offer" test, and hails again. Measured when it was missing — repeat hails for the
         same (captain, crate) went 70 -> 167, from 14.4% of all hails to 25.5%. That is precisely
         the spam Wyatt ruled out on 2026-08-05, arriving through a side door.
         Note WHERE this sits: it raises the PRICE, and composeOffer's reach test then decides
         whether to speak. So a bot goes quiet because the deal stopped being worth it, not because
         a counter told it to shut up — "write logic (not gates)", his words. */
      const memo=p.refused&&p.refused[want+"|"+q.idx];
      if(memo)coins=Math.max(coins,Math.ceil(memo.worth*PLAN.coinsPerDockTurn)+1);
      return coins;
    }));
    const worthToMe=Math.floor(this.acquireTurns(p,want).turns*PLAN.coinsPerDockTurn);
    const affordable=Math.max(0,p.coins-(reserve||0));
    const coins=Math.max(0,Math.min(need,worthToMe,affordable));
    /* WHAT ELSE IS STILL ON THE TABLE IF THEY SAY "not for that" — the REACH.

       Before counters could ask for a crate, a shortfall was a dead end: the bot could not cover
       the price, so speaking bought nothing but a refusal. Now a shortfall is where the
       NEGOTIATION STARTS — a holder can answer "keep yer coin, I want yer cocoa", and the asker
       decides then, with the real deal in front of it.

       So the reach is the opening bid PLUS the best thing the counter could still ask me for:
       whichever crate I hold, other than the one already on the table, that this captain has
       publicly been seen chasing. likelyNeeds reads observed demand, never a recipe card (I2), and
       a crate nobody has seen them want counts for the little that leverage is worth — which is
       what stops this becoming "hail about everything".

       Capped by worthToMe like the bid itself: a deal I would not accept is not made reachable by
       my being willing to overpay for it. */
    // the same spare set composeOffer picks giveIng from — computed here rather than passed, so
    // openingBid stays callable on its own and the two definitions cannot drift apart
    const spares=p.ing.filter(i=>!p.recipe||!p.recipe.includes(i)||this.cnt(p.ing,i)>1);
    const reachExtra=Math.max(0,...live.map(q=>{
      /* The reach is an EXPECTED value, and deliberately not a threshold: each crate I hold is
         worth what it would be worth to them TIMES how likely they are to want it. demandFor is
         the game's own public estimate of exactly that probability — it already folds in the bare
         prior (a rival's recipe covers 5 of the 7 crates in play, so any given crate is a decent
         bet before any evidence at all), everything the table has SEEN them chase, and zero for a
         crate they already hold.

         Both cruder versions were measured and both were wrong in the way a threshold always is.
         Counting every crate at flat leverage value made the reach nearly free — 6.03 hails a game,
         the bot opening a conversation on the grounds that it owned cargo, which is not a reason.
         Counting only crates past likelyNeeds' 0.8 cut went to the other extreme at 1.45, because
         that cut requires having been seen chasing it and most crates never are. The probability
         itself is the honest answer and needs no cut at all. */
      /* THE REACH IS "IS THERE AN ANSWER THEY COULD GIVE THAT I WOULD TAKE?" — which is the same
         test tryTrade already applies before paying a counter, asked one step earlier.

         A crate of mine counts toward the reach only if handing it over would STILL leave the deal
         beating what fetching the crate myself would cost. That is what makes this self-limiting
         without a threshold: a crate my own recipe wants, and that I hold only one of, prices
         itself out on its own arithmetic, while a spare costs me almost nothing and a
         recipe-for-recipe swap counts exactly when it is genuinely worth doing — which is the best
         kind of trade on the board and the one most worth opening a conversation about.

         Three cruder versions were measured first and every one missed, in both directions:
           every crate at flat leverage value      6.03 hails/game — opening on the grounds of
                                                   owning cargo, which is not a reason
           every crate x demandFor                 7.33 — worse, because demandFor's prior is high
           spares only                             0.78 — identical to no reach at all, since a bot
                                                   has usually already offered its only spare
         The willingness test is the honest question the others were approximating. */
      let best=0;
      const mineTurns=this.acquireTurns(p,want).turns;
      for(const i of p.ing){
        if(i===giveIng)continue;
        const wanted=p.recipe&&p.recipe.includes(i)&&this.cnt(p.ing,i)<=1;
        const giveCost=wanted?this.acquireTurns(p,i).turns:PLAN.leverageTurns;
        if(this.coinTurns(coins)+giveCost>mineTurns)continue;   // I would refuse this counter
        const v=PLAN.crateTurns*this.demandFor(q,i);
        if(v>best)best=v;
      }
      return Math.ceil(best*PLAN.coinsPerDockTurn);
    }));
    return {coins,need,giveIng,reach:Math.min(coins+reachExtra,worthToMe)};
  }
  /* IS THIS WORTH SAYING OUT LOUD AT ALL? — and this test is the whole reason the bid may be
     raised without the table getting noisier.

     THE ANNOUNCEMENT IS THE SPAM. That is the lesson, in those words, from the trade-memory work
     (HARD-WON-LESSONS): filtering RESPONSES after the hail barely helped (706 -> 543), and moving
     the check BEFORE the hail took it to 375. A hail reaches the WHOLE TABLE — rule 4, ye stand on
     yer deck and announce it to the Sugar Seas — so one hail is not one captain being asked, it is
     every captain being interrupted, the human included. Hail COUNT is therefore exactly the
     number of things a player has to swat away, and Wyatt's ruling on it is explicit: "We dont
     want the table continuously spammed with shitty trade requests, it's exhausting for players to
     swat them away." 03a683c held it at ~2.8 a game deliberately.

     Raising the bid without also tightening this test broke that, and the first cut of item 4 did
     exactly it: hails went 3.25 -> 4.10 a game. The cause is plain in hindsight — the old test
     suppressed offers whose FIXED low bid fell far short of the asking price, and a bid that now
     rises to meet the price sails through a test written against the old one. Same disease as the
     -21.2 regression: a threshold left calibrated to a quantity that changed underneath it.

     AND THERE IS NO CONSTANT HERE, DELIBERATELY. Wyatt, on the first cut of this: "We also dont
     want constants to drive the hail behavior, because the game is always shifting!! The bot
     should calculate an offer that it would accept, and offer something close to that." He is
     right, and it is the same objection BOT-DESIGN-PRINCIPLES already records as "nothing should
     be hardcoded" — a fixed margin is a price list standing in for a quantity that moves by an
     order of magnitude across a voyage. A first crate and a last crate are not the same trade.

     So the bot asks itself the question, and it already knows how: what would I take for this?
     openingBid caps the bid at acquireTurns — what fetching the crate myself would cost — which is
     precisely the price at which I would be indifferent to selling it. That IS "an offer I would
     accept", computed from the live board every turn and never written down as a number.

     Which collapses this whole test to ONE comparison. `bid.coins` is already
     min(what the table wants, what it's worth to me, what's in my purse), so:

         bid.coins >= bid.need

     is true only when the price the table wants is BOTH inside what I'd accept AND inside what I
     can pay. One line, no threshold, and it moves with the board because every input does. If I
     cannot meet the price, the hail buys nothing but a refusal I then have to remember — so I keep
     my mouth shut and go and fetch it. */
  worthHailing(bid){
    if(bid.need<=0)return bid.coins>0||!!bid.giveIng;   // nothing to cover — a crate-only swap
    /* 2026-08-14, Wyatt: "We do want more hails.. especially now that players can counter-offer
       robustly." He is right, and the reason is that THIS TEST WAS WRITTEN FOR A GAME THAT NO
       LONGER EXISTS. `coins >= need` asks "can I pay the whole price up front?" — the only
       question worth asking when a shortfall was a dead end, because a counter could then add
       coins and nothing else. Now a holder can answer "keep yer coin, I want yer cocoa", so a
       shortfall is not a refusal waiting to happen, it is where the bargaining starts.

       Measured with the old test in place: it blocked 24,165 of 24,901 attempts — 97% — at a mean
       shortfall of 8.15 coins. At coinsPerDockTurn 4 that is about two turns, which is precisely
       the size of gap ONE CRATE closes. The bots were sitting silent on the exact deals the new
       counter mechanic exists to settle.

       So the test now asks the question the mechanic actually supports: is there any answer they
       could give that I would take? `reach` is the bid plus the best crate a counter could still
       ask me for (openingBid), so this stays derived from the live board and carries no threshold
       — I4. It cannot become "hail about everything", because reach only counts a crate this
       captain has been publicly SEEN chasing, and is capped by what the crate is worth to me. */
    return bid.reach>=bid.need;
  }
  composeOffer(p,want){
    const holders=this.holdersOf(want,p);
    if(!holders.length)return null;
    const spares=p.ing.filter(i=>!p.recipe.includes(i)||this.cnt(p.ing,i)>1);
    // prefer a spare the holders are likely to want — that is what makes an offer land
    spares.sort((x,y)=>{
      const wx=holders.filter(h=>this.likelyNeeds(h,x)).length;
      const wy=holders.filter(h=>this.likelyNeeds(h,y)).length;
      return wy-wx;
    });
    const giveIng=spares.length?spares[0]:null;
    const bias=(PERSONALITY[p.strategy]||PERSONALITY.balanced);
    const reserve=bias.fightBias>=1?(this.cfg.powder||0):0;
    /* TWO PASSES, and the order is the whole point. openingBid takes the MINIMUM price across the
       captains it is given — one yes is all a hail needs — so it must be given the captains who
       will ACTUALLY be hailed. Priced against every holder instead, a captain who has never been
       asked sets a cheap price, the min throws away the higher price learned from everyone who
       already refused, and the refusal-learning above is silently discarded. Measured with the
       single pass: repeat hails 167, essentially unchanged from having no learning at all.
       So: bid provisionally, use that to ask who is still worth asking, then RE-BID against only
       those captains. The second bid is the one that goes on the table. */
    const provisional={want,giveIng,giveCoins:this.openingBid(p,want,giveIng,holders,reserve).coins};
    const live=holders.filter(q=>this.worthReAsking(p,q,want,provisional));
    if(!live.length)return null;
    const bid=this.openingBid(p,want,giveIng,live,reserve);
    const giveCoins=bid.coins;
    if(!giveIng&&!giveCoins)return null;
    const offer={want,giveIng,giveCoins};
    // Don't hail the table with an offer nobody could say yes to. Two independent reasons to stay
    // quiet, and BOTH have to clear before a word is said:
    //   a) nobody is worth re-asking — every holder already refused something this good and
    //      nothing about the table has moved since (see worthReAsking, applied above to build the
    //      audience this bid is priced for);
    //   b) the price they are likely to name is far beyond what this offer is worth.
    /* b) THE PRICE IS OUT OF REACH. This test used to read
             worth*dealBias < cheapest*0.6      (worth and cheapest both in turns)
       and it had to be rewritten in the same change that derived the bid, not left alone —
       BOT-DESIGN-PRINCIPLES records a −21.2 ladder regression from doing exactly the opposite
       (swapping a constant for a calculation and leaving the thresholds calibrated to the old
       range). Here the range did not merely shift, the test went VACUOUS: the bid is now BUILT to
       clear `cheapest`, so `worth` lands on top of it by construction and a comparison against
       cheapest*0.6 can never fail again. Measured when it was left in place — 487 hails -> 634,
       a 30% rise in noise from a gate that had quietly stopped being a gate.

       Asked properly, in coins, the question is no longer "is my offer worth much?" but "can I
       actually reach what they want?" — and if the purse or the crate's own worth to me stops me
       short, the hail is a wasted turn and a refusal I will have to remember. dealBias keeps its
       old job of tilting how gamely an archetype pushes a marginal deal (a trader at 1.60 will
       open on a stretch a rusher at 0.85 walks away from). */
    if(!this.worthHailing(bid))return null;
    offer.audience=live.map(q=>q.idx);
    return offer;
  }
  botOpenOffer(p){
    const needs=this.needs(p);
    if(!needs.length)return null;
    // cargo is public, so asking only for things somebody holds is not hidden information.
    // The seller's-remorse rule (see settleTrade): never hail the table for a crate this captain
    // handed over within the last 3 rounds — buying back what ye just sold reads as witless.
    const askable=needs.filter(i=>this.holdersOf(i,p).length)
      .filter(i=>!(p.gaveAway&&p.gaveAway[i]!=null&&this.round-p.gaveAway[i]<3));
    if(!askable.length)return null;
    // hardest-to-get-otherwise first, then fall down the list — a crate whose holders have all
    // said no is skipped entirely rather than re-hailed, and the bot simply asks for the next one
    askable.sort((x,y)=>this.acquireTurns(p,y).turns-this.acquireTurns(p,x).turns);
    for(const want of askable){
      const offer=this.composeOffer(p,want);
      if(offer)return offer;
    }
    return null;
  }
  // A bot's whole trade turn: put the offer to the table, read every answer, take the best one it
  // can afford — or walk away. Exactly the flow a human gets in the UI (rule 4).
  tryTrade(p){
    const offer=this.botOpenOffer(p);
    if(!offer)return false;
    // announcing what you want is itself public information — everyone now knows p wants this
    this.noteDemand(p,offer.want,1);
    this.ev({t:"openoffer",p:p.idx,want:offer.want,offer:this.offerLabel(offer,0)});
    // composeOffer already decided who is worth hailing; honour that list rather than re-deriving it
    const aud=offer.audience;
    const responses=this.collectResponses(offer,p)
      .filter(r=>!aud||aud.includes(r.q.idx));
    if(!responses.length)return false;
    // remember every no, with what it cost them to say it — see rememberRefusal
    const worth=this.offerWorthTurns(p,offer);
    for(const r of responses)if(r.kind==="deny"){
      this.rememberRefusal(p,offer.want,r.q.idx,worth);
      p.refused[offer.want+"|"+r.q.idx].wantedOurs=offer.giveIng&&this.likelyNeeds(r.q,offer.giveIng)?1:0;
    }
    const accepts=responses.filter(r=>r.kind==="accept");
    // affordability is judged on the counter's OWN terms — a crate counter may cost no coin at all,
    // and the old test would have thrown those away as unaffordable
    const counters=responses.filter(r=>{
      if(r.kind!=="counter")return false;
      const t=this.counterTerms(offer,r);
      return (t.giveCoins||0)<=p.coins&&(!t.giveIng||p.ing.includes(t.giveIng));
    });
    let deal=null,terms=offer;
    if(accepts.length){
      // several yeses: take the crate from whoever can spare it most easily
      accepts.sort((x,y)=>this.crateCostTurns(y.q,offer.want,p)-this.crateCostTurns(x.q,offer.want,p));
      deal=accepts[0].q;
    }else if(counters.length){
      /* playtest 21 item 7: a counter may now ask for one of MY crates instead of coin, so the
         answers are no longer comparable on askFor alone and are priced in TURNS — the currency
         everything else in this planner uses. What a counter costs me is what I hand over: the
         coins, plus (if they want a crate) what replacing that crate would cost me, discounted
         hard when it is surplus I never needed. Cheapest first, and still only struck if it beats
         fetching the crate myself, which is the test that was already here. */
      const priced=counters.map(r=>{
        const t=this.counterTerms(offer,r);
        let cost=this.coinTurns(t.giveCoins||0);
        if(t.giveIng)cost+=(p.recipe&&p.recipe.includes(t.giveIng)&&this.cnt(p.ing,t.giveIng)<=1)
          ?this.acquireTurns(p,t.giveIng).turns
          :PLAN.leverageTurns;
        return {r,t,cost};
      }).filter(x=>!x.t.giveIng||p.ing.includes(x.t.giveIng))
        .sort((a,b)=>a.cost-b.cost);
      const mine=this.acquireTurns(p,offer.want).turns;
      if(priced.length&&priced[0].cost<=mine){deal=priced[0].r.q;terms=priced[0].t;}
    }
    if(!deal){
      // walking away from a counter is this offer being refused too — remember it, or the bot
      // re-opens the identical hail next turn and gets the identical price back
      for(const r of responses)if(r.kind==="counter")this.rememberRefusal(p,offer.want,r.q.idx,worth);
      this.ev({t:"parley",a:p.idx,b:null,offer:this.offerLabel(offer,0)||"nothing",want:offer.want});
      return false;
    }
    return this.settleTrade(p,deal,terms,0);
  }
  // called on every battle resolution (win or flee) — cools the opportunistic "rich" attack
  // trigger against this specific opponent for a few rounds (mutual, since either side's coin
  // total may have just crossed the rich threshold) and, on a decisive win, arms a one-shot
  // grudge so the loser is a little more likely to seek revenge against this attacker specifically.
  // `spoilIng`, when the spoil was a crate rather than coins, also arms justLost: without it, two
  // ships that each need the exact item the other's holding will just steal it back and forth
  // forever (verified in simulation — the single biggest source of pointless repeat duels, bigger
  // than the "rich" trigger alone). justLost doesn't block fighting this opponent for OTHER
  // reasons, only re-litigating the same crate immediately.
  recordSkirmish(att,def,lose,spoilIng){
    const cool=this.round+3;
    att.coolUntil[def.idx]=cool;
    def.coolUntil[att.idx]=cool;
    // AI-06: bump the recent-fight tally for this pair (decays over ~10 rounds — see recentFights).
    // A tally that keeps climbing is exactly the endless-duel signature scoreAttack prices out.
    this.bumpFight(att,def);
    this.bumpFight(def,att);
    if(lose){
      const win=lose===att?def:att;
      lose.grudge={against:win.idx,expires:this.round+2};
      if(spoilIng)lose.justLost={ing:spoilIng,by:win.idx,until:this.round+3};
    }
  }
  bumpFight(p,q){
    const f=p.fightLog[q.idx];
    // if the last fight with q was recent, keep climbing; if it lapsed, start over
    const n=(f&&f.until>=this.round)?f.n+1:1;
    p.fightLog[q.idx]={n,until:this.round+10};
  }
  // AI-06: how many times p has recently fought q (0 if none or the tally has decayed away). Drives
  // the escalating rematch penalty in scoreAttack — first fight free, each rematch costlier.
  recentFights(p,q){
    const f=p.fightLog[q.idx];
    return (f&&f.until>=this.round)?f.n:0;
  }
  // Every square this ship could legally finish a move on, as a plain array — the engine-side
  // twin of the UI's reachable() helper. A fleeing defender uses the ordinary v2 sail rules
  // (4 squares, 2 if the escape route touches upwind), which is Wyatt's ruling for rule 9's flee.
  reachableFrom(p){
    return [...this.sailStates(p).keys()].map(k=>k.split(",").map(Number));
  }
  /* TAKING THE WEATHER GAUGE, IN THE SAME TURN YOU FIRE (Wyatt, 2026-08-09).
     Measured on this engine over 60,000 battles: firing with the wind behind you takes the crate
     49.6% of the time; upwind or crosswind, 24.9%. Same 2🌕. So WHERE you attack from is worth as
     much as whether you attack.

     WHY THE WIND SQUARE IS NEVER A MULTI-TURN GOAL. Wyatt: *"We dont want bots to get into an
     infinite loop trying to get upwind of a player, as their position changes. They should navigate
     upwind within the same turn they try to attack."* A bot creeping toward `mark − wind` re-derives
     a new square every turn as the mark drifts, and shadows it forever without firing.
     The APPROACH is a different thing and is still multi-turn, because it aims at something that
     does not drift: where the mark is GOING. Wyatt again: *"humans can notice a player going towards
     an island when the player has 4 ingredients, and infer that they are about to complete their
     recipe, so abandon their own mission to sail over and intercept the winning player before they
     reach tortuga."* That is interceptOf(), and it is stable because home is stable.

     So: sail at the intercept while they are far, and at the wind square on the turn you arrive.
     downwindSide() only reports "a" when the mark is EXACTLY one square away along the wind, so the
     winning square is the single cell `mark − wind` — nothing to search, nothing to oscillate over. */
  windSquare(q){
    const wv=DIRS[this.windNow];
    if(!wv)return null;
    return [q.pos[0]-wv[0],q.pos[1]-wv[1]];
  }
  // The best square this ship could BOTH finish its move on this turn AND legally attack `q` from,
  // with the odds that shot really carries. null when the mark cannot be engaged this turn at all —
  // which means "keep approaching", not "give up".
  strikeFrom(p,q){
    if(!this.canAttack(p,q))return null;
    if(p.coins<(this.cfg.powder||0))return null;
    const reach=new Set(this.reachableFrom(p).map(c=>c.join(",")));
    reach.add(p.pos.join(",")); // staying put is a legal "move" and may already hold the gauge
    const wind=this.windSquare(q);
    if(wind&&reach.has(wind.join(",")))return {cell:wind,pWin:0.5};
    for(const d of Object.values(DIRS)){
      const c=[q.pos[0]+d[0],q.pos[1]+d[1]];
      if(reach.has(c.join(",")))return {cell:c,pWin:0.25};
    }
    return null;
  }
  /* ---- board reads parameterised by a SQUARE, so a turn can be scored from somewhere the ship has
       not reached yet. The originals all read p.pos, which is exactly why the turn used to be
       decided in two halves. None of these draw RNG, deliberately: adjOpp() shuffles (and so calls
       this.r()), making it unusable inside a planner that evaluates dozens of hypothetical squares.
       Ties break on value then seat order — deterministic, and fairer than a coin toss. ---- */
  portAt(cell){
    if(this.cfg.singleDock){
      for(const ing of this.ings){const d=this.dockOf[ing];
        if(cell[0]===d[0]&&cell[1]===d[1])return ing;}
      return null;
    }
    for(const d of Object.values(DIRS)){const c=[cell[0]+d[0],cell[1]+d[1]];
      if(this.isIsland(c))return this.islands[c];}
    return null;
  }
  foesAt(cell,p){return this.players.filter(q=>q!==p&&this.inPlay(q)&&man(cell,q.pos)<=1);}
  // Would a ship on `cell` hold the weather gauge over q? Rule 9 gives a both-heads round to the
  // downwind ship, and downwindSide grants it at exactly one square along the wind — so this is the
  // single cell that doubles the odds, and there is nothing to search for.
  downwindFrom(cell,q){
    const wv=DIRS[this.windNow];
    if(!wv)return false;
    return q.pos[0]-cell[0]===wv[0]&&q.pos[1]-cell[1]===wv[1];
  }
  // Which side is firing downwind on this adjacency? Purely geometric; positions never change
  // mid-battle in v2 (no swap), so one reading holds for the whole fight.
  downwindSide(att,def){
    const dx=def.pos[0]-att.pos[0],dy=def.pos[1]-att.pos[1];
    const dirAtoD=Object.keys(DIRS).find(k=>DIRS[k][0]===dx&&DIRS[k][1]===dy);
    const dirDtoA=Object.keys(DIRS).find(k=>DIRS[k][0]===-dx&&DIRS[k][1]===-dy);
    if(this.windNow===dirAtoD)return "a";
    if(this.windNow===dirDtoA)return "d";
    return null;
  }
  // v2 rule 9/13 prize: ONE CRATE, winner's choice. No coin alternative, and no place-swap — a
  // swap would hand the loser the advantageous square (Wyatt, 2026-08-04). A ship with no crates
  // cannot be attacked at all (rule 13e), so `lose.ing` is never empty by the time we get here.
  awardSpoil(win,lose){
    if(!lose.ing.length)return null;
    const wanted=lose.ing.filter(i=>this.needs(win).includes(i));
    // no recipe need of its own? take what somebody else at the table plainly wants — leverage
    const leverage=lose.ing.filter(i=>this.players.some(q=>q!==win&&q!==lose&&this.inPlay(q)&&this.likelyNeeds(q,i)));
    const pick=(wanted[0]!==undefined)?wanted[0]:(leverage[0]!==undefined?leverage[0]:lose.ing[0]);
    lose.ing.splice(lose.ing.indexOf(pick),1);win.ing.push(pick);
    // the whole table just watched the winner choose that crate — public evidence of what it wants
    this.noteDemand(win,pick,1);
    // v2.1 BUG (Wyatt, 2026-08-06): "I attacked Davy Scones when he got to Tortuga to start his
    // bakery, and I stole one of the ingredients he needed... but instead, he still won."
    // Rule 13c makes a finished captain a legal target precisely so this raid is worth making —
    // but nothing ever REVOKED the finish. `done` stayed true, the seat stayed in finishOrder, and
    // resolveEnd crowned a baker who no longer had a recipe to bake. The raid was legal, landed,
    // and meant nothing.
    if(lose.done&&this.needs(lose).length)this.unfinish(lose);
    return pick;
  }
  /* Take a captain back OUT of the bakery. Two things have to happen together and neither is
     optional: `done` goes false so they re-enter the rotation and can go and replace what was
     taken (Wyatt: "they should be able to continue playing"), and the seat leaves finishOrder so
     the end-of-voyage ranking cannot crown them.
     Emitted as its own event rather than folded into the battle line, because it is a separate
     beat with separate stakes — the crate changing hands is the raid, this is the consequence. */
  unfinish(p){
    p.done=false;
    const k=this.finishOrder.indexOf(p.idx);
    if(k>=0)this.finishOrder.splice(k,1);
    this.ev({t:"unfinish",p:p.idx});
  }
  // Can this ship legally be attacked? v2 rule 13e: an empty hold is not a target — there is
  // nothing to take, and the option greys out rather than wasting the attacker's powder.
  /* ⛔ THE PARAGRAPH THAT USED TO SIT HERE STATED THE OPPOSITE OF THE LINE BELOW, AND IT COST
     SOMETHING. It read: "there is deliberately no `def.done` check: v2 rule 13c is 'nobody is
     safe' — a captain who has already fired up the ovens is still a legal target". That was true
     until Wyatt's SANCTUARY ruling of 2026-08-06, four lines down, and nobody deleted it after.
     On 2026-09-03 the how-to-play modal was found teaching the old rule to real players, and this
     comment is why the error survived a reading: a session checking the page against the code
     would have had its mistake CONFIRMED by the commentary sitting above the code.
     Rule 6, in its exact shape — a comment is not a measurement. If you want to know what this
     function does, call it: scripts/qa/rules_sanctuary_matches_engine_check.mjs does. */
  canAttack(att,def){
    if(!def||def===att)return false;
    // v2.1 SANCTUARY (Wyatt, 2026-08-06). Once the ovens are lit nobody can touch them. The raid
    // does not die, it moves earlier: you rob a captain carrying a full recipe on their way home,
    // which is the more skilful version of the same play and the one the bots already hunt for.
    // Tortuga becomes the thing you are racing for rather than a place you get mugged.
    if(this.cfg.bakeoff&&def.baking)return false;
    if(this.cfg.powder&&att.coins<this.cfg.powder)return false;
    return def.ing.length>0;
  }
  // v2 rule 9 — the battle is ONE round.
  //
  //   heads vs tails            → the heads ship wins outright
  //   both heads, one downwind  → the downwind ship wins (the wind carries the shot home)
  //   both heads, crosswind     → cannonballs collide. The ATTACKER may pay 2🌕 to re-fire ALONE
  //                               against the defender's standing heads, repeatable as often as
  //                               they can pay. Decline and the battle ends NULL — nobody gains.
  //   both tails                → both shots went wild. The defender may flee, FREE, under the
  //                               ordinary v2 sail rules. Stand their ground and the attacker may
  //                               pay 2🌕 to re-fire, same as above; decline → NULL.
  //
  // Prize: one crate, winner's choice, no coin alternative and no place-swap (rule 9d).
  battle(att,def){
    const c=this.cfg;
    if(!this.canAttack(att,def))return null; // empty hold or no powder — never a legal fight
    if(c.powder)att.coins-=c.powder;
    this.battles++;
    const downwind=this.downwindSide(att,def);
    const rounds=[];
    let flips=0,win=null,fled=false,nulled=false;
    // ---- THE round. Both cannons speak once. ----
    const ah=this.flip(att),dh=this.flip(def);flips+=2;
    let scorer=null;
    if(ah&&dh){
      if(downwind==="a"){win=att;scorer="a";}
      else if(downwind==="d"){win=def;scorer="d";}
      // crosswind: the cannonballs collide. Falls through to the re-fire below.
    }else if(ah){win=att;scorer="a";}
    else if(dh){win=def;scorer="d";}
    rounds.push([ah?1:0,dh?1:0,0,scorer]);
    if(!win){
      // ---- both tails: the defender's FREE escape (rules 9a + 2c) ----
      if(!ah&&!dh){
        // a bot slips away when the wind is against it (it loses the next both-heads) or when it
        // is carrying a crate it cannot afford to lose; otherwise it stands and takes its chances
        // "carrying a crate it cannot afford to lose" = a RECIPE crate it holds no spare of.
        // NOT `needs(def).includes(i)`: needs() is the recipe MINUS what you already hold, so
        // testing held crates against it is always false and the defender would never flee.
        const holdingCritical=def.ing.some(i=>def.recipe&&def.recipe.includes(i)&&this.cnt(def.ing,i)<=1);
        if(downwind==="a"||holdingCritical){
          const cells=this.reachableFrom(def);
          if(cells.length){
            def.pos=cells.reduce((best,cc)=>man(cc,att.pos)>man(best,att.pos)?cc:best,cells[0]);
            this.tradewind(def);
            fled=true;
            this.recordSkirmish(att,def,null);
            this.ev({t:"battleflee",a:att.idx,d:def.idx,rounds,flips,downwind});
          }
        }
      }
      // ---- the attacker's paid re-fire (rule 9b, extended by rule 9a to the both-tails case).
      // The defender's cannon is spent for this exchange; the attacker buys a fresh broadside for
      // 2🌕 and fires ALONE. Heads and the shot lands — attacker wins. Tails and they may pay
      // again, as often as they can afford it. Decline at any point and the battle ends NULL:
      // no crate, no coins, no caller paid, and the powder already spent stays spent. ----
      if(!fled){
        const refire=c.refire||0;
        while(!win){
          if(!refire||att.coins<refire||!this.wantsRefire(att,def,downwind,rounds.length)){nulled=true;break;}
          att.coins-=refire;
          this.ev({t:"refire",a:att.idx,d:def.idx,cost:refire});
          const rh=this.flip(att);flips++;
          rounds.push([rh?1:0,null,0,rh?"a":null]);
          if(rh)win=att;
        }
      }
    }
    if(fled)return null;
    if(nulled){
      // NULL: the battle ends with no player gaining anything. No spoil, no swap, no caller paid.
      this.recordSkirmish(att,def,null);
      this.ev({t:"battlenull",a:att.idx,d:def.idx,rounds,flips,downwind});
      return null;
    }
    const lose=win===att?def:att;
    if(win===att)this.attWins++;
    const spoilIng=this.awardSpoil(win,lose);
    const spoil=spoilIng?ilabelImg(spoilIng):"nothing";
    // BATL-03 carried into v2 and hardened by rule 9d: nobody moves after a battle. A swap would
    // put the loser in the advantageous square, which is exactly backwards.
    this.recordSkirmish(att,def,lose,spoilIng);
    this.ev({t:"battle",a:att.idx,d:def.idx,rounds,winner:win.idx,spoil,spoilIng,flips,downwind});
    return win;
  }
  /* ================= v2 bot AI: planners, not gates =================
     Wyatt, 2026-08-04: *"have them make a plan for their entire ingredient trajectory that they
     update with the wind each turn and includes who they may need to battle or trade with to get
     ingredients that they need which are currently out of stock. Think like a human when you
     design the bot ai — don't give them gates, give them strategy."*

     So there is no if-chain and no bag of scores here. A bot answers ONE question every turn:
     *what is the cheapest remaining route to a full recipe, measured in turns?* Everything else —
     where to sail, whether to dock, whether to open a trade, whether to pick a fight — falls out
     of that route. The route is rebuilt from scratch each turn, against the current board, the
     current prices, and the wind it can actually see (this round's, plus next round's committed
     forecast — rule 6).

     Every cost below is denominated in TURNS, which is what keeps it explainable: "buying this
     costs me 4 turns, taking it by force costs me 2 and a fight I might lose". A bot never
     consults anybody's recipe card — only what the whole table can see (see demandFor).

     ================= THE OBJECTIVE =================
     THE GOAL OF EVERY GAME IS TO WIN AS QUICKLY AS POSSIBLE. (Wyatt, 2026-08-09.) That is not
     specific to this game; it is what a game IS, and everything below is a consequence of it.
     It is written down only because it was MISSED — a whole day of bot work optimised the machinery
     of deciding (are the options compared fairly? are the odds honest? is the turn decided before
     the ship moves?) without once asking what the machinery was FOR. The failure mode has a name:
     optimising the process instead of the goal. The tell is a scoreboard full of improved
     intermediate metrics and no improvement in wins.

     Wyatt, 2026-08-09: *"the bots should be acting according to valuing, completing the game in as
     few turns as possible. When they evaluate all of the ways that they could spend their turn right
     now, they should act towards the path that will end the game the most quickly with the highest
     probability, with them as the winner."*

     So there is ONE number, and every action is worth exactly what it does to it:

         E[turns until I bake a full recipe at Tortuga]

         value(action) = (my turns-to-win, before minus after)
                       + (the leader's turns-to-win, after minus before)  <- only while they beat me
                       - 1                                                <- the turn, paid by all

     buildRoute() already returns that first quantity as `total`. The engine has computed the
     objective all along and never used it AS the objective — which is why the constants below
     (crateTurns, denialTurns, leverageTurns, and coinTurns' flat rate) exist at all. Each is a fixed
     price standing in for a quantity that varies by an order of magnitude across a voyage, and a bot
     optimising a price list looks busy and plays badly. Measured: a whole-turn planner built on
     those prices improved every behaviour statistic — trades 26 -> 140, shots with the wind 25.5% ->
     88.6%, blank turns 8.8% -> 6.8% — and still won BELOW the bot it replaced.

     THE FULL PRINCIPLES, the measurements behind them, and the failures worth not repeating live in
     docs/BOT-DESIGN-PRINCIPLES.md. Pointed at rather than copied here, deliberately: a copy of a
     living document rots, a pointer cannot. Read it before changing anything below. */

  // Coins are just stored turns: a dock flip pays 6 or 2, so a turn at a dock earns 4 on average.
  coinTurns(n){return n<=0?0:n/PLAN.coinsPerDockTurn;}
  // Sailing time from a to b under a given wind. v2 rule 1: 4 squares a turn unless the route has
  // to bite into the wind, in which case 2. Bots plan against the wind they can SEE — this round's
  // for the leg they're on, and the committed forecast for the leg after it (rule 6d: never wrong).
  sailTurns(from,to,wind){
    const d=man(from,to);
    if(!d)return 0;
    const dx=to[0]-from[0],dy=to[1]-from[1];
    // does any leg of this route head straight into the wind?
    const legs=[];
    if(dx>0)legs.push("E"); if(dx<0)legs.push("W");
    if(dy>0)legs.push("S"); if(dy<0)legs.push("N");
    const upwind=wind&&legs.some(k=>k===OPPOSITE[wind]);
    /* FRACTIONAL, NOT CEILED — load-bearing for the objective, not a rounding taste.
       As ceil(d/4) this returned the same number for a ship 5 squares out and one 8 squares out, so
       the objective could not see a turn of sailing at all: in scripts/bot_matrix.js every sail  [UNGATED-IN-4: bot_matrix.js reads the root tree, not this one]
       option scored exactly -1.00, the cost of the turn with no credit for the ground made. A bot
       that cannot see movement shortening its voyage stops moving and waits at berths, which is
       exactly what the mixed-table run showed — docks up, crates bought down, purse trebled.
       Fractional turns say what the board says: four squares is one turn, two squares is half of
       one. Every consumer compares these costs against each other, so finer resolution can only
       sharpen the comparison; nothing reads it as a whole number of moves. */
    return Math.ceil(d/(upwind?SAIL_RANGE_UPWIND:SAIL_RANGE));
  }
  // The three ways to get a crate, each priced in turns, and which one wins. This is the heart of
  // the planner and the answer to "what do I do when it's out of stock everywhere" (Wyatt asked
  // for all three evaluated, and the likeliest to work chosen):
  //
  //   buy  — sail to the island, earn the price at the dock, buy it (rule 10/11)
  //   deal — open a table-wide trade for it (rule 4)
  //   take — sail into range of a holder and fight them for it (rules 9/13)
  //
  // `from` lets buildRoute() cost a later leg from where the previous one ended, rather than
  // pretending every errand starts from where the ship is sitting right now.
  acquireTurns(p,ing,from,wind){
    from=from||p.pos;
    wind=wind===undefined?this.windNow:wind;
    const bias=PERSONALITY[p.strategy]||PERSONALITY.balanced;
    // `target` is where this option would have the ship SAIL. A deal has none (rule 4 reaches the
    // table from anywhere), so we track the best PHYSICAL option separately: even when talking is
    // the cheapest plan, the ship should still be making way toward the island it would otherwise
    // buy from, so a refused offer costs a conversation and not a turn.
    const out={turns:PLAN.unreachable,kind:null,target:null,via:null,moveTarget:null,moveTurns:PLAN.unreachable};
    const consider=(turns,kind,target,via)=>{
      if(turns<out.turns){out.turns=turns;out.kind=kind;out.target=target;out.via=via;}
      if(target&&turns<out.moveTurns){out.moveTurns=turns;out.moveTarget=target;}
    };
    // ---- buy it at its island ----
    const price=this.cratePrice(ing);
    if(price!==null){
      const dock=this.islandOf[ing];
      const sail=this.sailTurns(from,dock,wind);
      // coins I still have to earn, at 4 a docking turn — and I can earn them at THIS dock, so
      // the earning turns and the arrival turns stack rather than needing a detour
      const short=Math.max(0,price-p.coins);
      const earn=Math.ceil(this.coinTurns(short));
      // somebody else is tied up in that berth. Only one ship fits (singleDock), so this errand
      // means loitering until they leave — price the wait, so a different ingredient wins the leg
      // instead. Without this a bot fixates on an occupied berth it can never reach, cannot
      // improve its distance, and idles in place for the rest of the game.
      const occupied=this.cfg.singleDock&&this.dockOccupiedBy(ing,p)?2.5:0;
      // one turn to make the purchase itself (the flip that pays for it doubles as the buy)
      consider(sail+earn+1+occupied,"buy",dock,ing);
    }
    // ---- get it from somebody who has one ----
    for(const q of this.holdersOf(ing,p)){
      // DEAL. One action, and crucially NO SAILING — rule 4 reaches the whole table from wherever
      // you happen to be floating. So a deal never sets a movement target (that stays null): the
      // bot keeps sailing toward the island it would otherwise buy from and hails the table on the
      // way, exactly as a human does. Pricing it any other way makes every bot converge on
      // whoever holds the crate and then sit there — which is precisely what the first headless
      // run of this planner did, 580 idle turns and four docks in 150 rounds.
      const spare=p.ing.find(i=>!p.recipe.includes(i)||this.cnt(p.ing,i)>1);
      const sweetener=spare?PLAN.leverageTurns:this.coinTurns(3);
      // what THEY will want for it, guessed from public evidence only — a crate somebody has
      // plainly been chasing is not going to come cheap, and pretending otherwise is how a bot
      // ends up making the same doomed offer every turn for a hundred rounds.
      const theirPrice=this.estimateCrateCost(q,ing);
      consider((PLAN.tradeTurns+sweetener+theirPrice)/bias.dealBias,"deal",null,q);
      // take: sail into range, then fight. A fight is only worth planning when it is legal
      // (rule 13e — an empty hold is never a target) and when I can pay for powder.
      if(this.canAttack(p,q)||p.coins>=(this.cfg.powder||0)){
        if(q.ing.includes(ing)){
          // v2.1: sail to CUT THEM OFF, not to where they are standing. For a captain who is going
          // nowhere this is their own square and nothing changes; for one running for home it is a
          // couple of squares down their route (interceptOf).
          const aim=this.interceptOf(q);
          const sail=this.sailTurns(from,aim,wind);
          const rematch=PLAN.rematchEscalate*this.recentFights(p,q);
          // the wind is a real edge in a one-round battle — price it
          const dirPtoQ=Object.keys(DIRS).find(k=>DIRS[k][0]===Math.sign(q.pos[0]-p.pos[0])&&DIRS[k][1]===Math.sign(q.pos[1]-p.pos[1]));
          const edge=(dirPtoQ&&wind===dirPtoQ)?-PLAN.windEdge:((dirPtoQ&&wind===OPPOSITE[dirPtoQ])?PLAN.windEdge:0);
          // v2.1: a crate in the hands of someone about to win is worth more than the same crate
          // anywhere else, because taking it costs them as well as paying me. Urgency discounts the
          // fight; the archetype's own fightBias scales how far it will go, so the pirate hunts and
          // the rusher keeps racing (Wyatt's choice, 2026-08-06 — "same brain, different taste").
          const hunt=1+this.threatUrgency(q)*PLAN.huntWeight*bias.fightBias;
          const cost=(sail+PLAN.fightTurns+PLAN.fightLossRisk+rematch+edge)/bias.fightBias/hunt;
          consider(cost,"take",aim,q);
        }
      }
    }
    return out;
  }
  // The full remaining trajectory, rebuilt every turn: order the ingredients still needed so the
  // whole voyage is as short as possible, costing each leg from where the previous one ended and
  // under the wind that will actually be blowing. Nearest-cheapest-first with the costs recomputed
  // after every pick — with at most recipeSize legs this is both fast and stable, and it re-plans
  // wholesale each turn anyway, so a better opening never gets locked in behind a stale one.
  buildRoute(p){
    const remaining=this.needs(p).slice();
    const route=[];
    let at=p.pos,wind=this.windNow,total=0;
    // the first leg is planned under the wind now; every leg after it under the forecast, which
    // rule 6d guarantees is correct. Beyond that a bot plans as if the forecast holds.
    let legWind=wind;
    while(remaining.length){
      let best=null,bestIdx=-1;
      for(let i=0;i<remaining.length;i++){
        const plan=this.acquireTurns(p,remaining[i],at,legWind);
        if(!best||plan.turns<best.turns){best=plan;bestIdx=i;}
      }
      if(!best||best.turns>=PLAN.unreachable){
        // nothing on the board can supply this one right now — record it as an open problem so
        // the bot keeps hunting a holder rather than silently dropping the ingredient
        route.push({ing:remaining[0],kind:"stuck",turns:PLAN.unreachable,target:null,via:null});
        remaining.splice(0,1);
        continue;
      }
      const ing=remaining.splice(bestIdx,1)[0];
      route.push({ing,...best});
      total+=best.turns;
      // the NEXT leg is costed from wherever this one physically ends — a deal leg leaves the
      // ship where it already was, so `at` only advances when there was somewhere to sail
      at=best.target||best.moveTarget||at;
      // v2.1: forecastWind(), not windNext — with a storm coming the bot costs its next leg against
      // the wind it can actually see, same as a captain reading the chip.
      legWind=this.forecastWind()||legWind;
    }
    return {route,total};
  }
  // Where this bot is trying to get to right now — the first leg of its route. Kept under the old
  // name because the live turn flow and the headless sim both call it.
  /* Sail to head off a captain on the brink — the half of "attack people if they are about to win"
     that the opportunism arm in chooseAction() cannot supply, because that arm only ever sees ships
     ALREADY adjacent. Measured: with the threat model wired into costs but nothing steering the
     ship, denial raids fired 0.05 times a game. A bot has to actually go after them.
     BOUNDED BY PLAN.huntReach ON PURPOSE. Without a reach limit the sums say "always chase": at full
     urgency the discounted cost of a raid stays under its worth from most of the board, so a pirate
     would abandon a half-finished errand to cross the map, and the voyage would stop being about
     baking. A short leash makes the behaviour legible instead — bots pounce when the leader comes
     within reach, they do not stalk. */
  huntTarget(p){
    const bias=PERSONALITY[p.strategy]||PERSONALITY.balanced;
    if(p.coins<(this.cfg.powder||0))return null; // no powder, no raid — never plan what you can't pay for
    let best=null;
    for(const q of this.players){
      if(q===p||!this.inPlay(q)||!q.ing.length)continue;   // rule 13e: an empty hold is never a target
      const urgent=this.threatUrgency(q);
      if(urgent<=0)continue;
      // WHERE the last leg aims. If the mark can be engaged this turn, aim at the square that wins
      // the fight rather than the one that merely reaches it — same turn, same sail, twice the odds.
      // Otherwise keep approaching the intercept, which is stable across turns (see strikeFrom).
      const strike=this.strikeFrom(p,q);
      const aim=strike?strike.cell:this.interceptOf(q);
      const sail=this.sailTurns(p.pos,aim,this.windNow);
      // NOT stretched by urgency, and that was measured rather than assumed: an urgency-scaled
      // leash was built, ablated over 300 games and found completely inert (46 -> 46 seat wins,
      // 1.68 -> 1.69 fights/game). Aiming at a strike square already collapses the measured sail
      // distance to <=1, so the leash stopped being the binding constraint the moment the aim
      // changed. A constant that does nothing reads as if it does something; it went.
      if(sail>PLAN.huntReach)continue;
      const rematch=PLAN.rematchEscalate*this.recentFights(p,q);
      const cost=(sail+PLAN.fightTurns+PLAN.fightLossRisk+rematch)/bias.fightBias/(1+urgent*PLAN.huntWeight);
      const gain=q.ing.some(i=>this.needs(p).includes(i))?PLAN.crateTurns:0;
      const worth=Math.max(gain,urgent*PLAN.denialTurns);
      if(cost<worth&&(!best||cost<best.cost))best={aim,cost};
    }
    return best?best.aim:null;
  }
  chooseTarget(p){
    if(!this.needs(p).length)return this.home; // recipe done — the only job left is to sail home
    // v2.1: a captain about to win, within reach, outranks the next errand on the shopping list.
    const hunt=this.huntTarget(p);
    if(hunt)return hunt;
    const {route}=this.buildRoute(p);
    p.plan=route; // kept on the player so the turn flow (and any debugging) can read the reasoning
    // sail toward the first leg that HAS somewhere to sail to — a deal leg has none, so the ship
    // keeps making way toward the island it would otherwise buy from while it hails the table
    for(const leg of route){
      const t=leg.target||leg.moveTarget;
      if(t)return t;
    }
    // every ingredient is out of stock and nobody holds one: shadow the captain carrying the most
    // of what we need, so we're in position the moment they pick one up
    const needs=this.needs(p);
    const holders=this.players.filter(q=>q!==p&&this.inPlay(q)&&q.ing.some(i=>needs.includes(i)));
    if(holders.length){holders.sort((x,y)=>man(p.pos,x.pos)-man(p.pos,y.pos));return holders[0].pos;}
    return this.home;
  }
  canDock(p,port){
    if(this.cfg.singleDock&&this.dockOccupiedBy(port,p))return false;
    return true;
  }
  // Is another 2🌕 broadside worth it? The prize is a crate whose worth the bot has already
  // computed in turns; a re-fire buys a 50% shot at it for two coins' worth of dock time. The
  // shot count keeps a rich bot from grinding forever, and the reserve stops it going broke on a
  // crate it could simply have bought.
  wantsRefire(att,def,downwind,shots){
    const bias=PERSONALITY[att.strategy]||PERSONALITY.balanced;
    if(shots>=2+Math.round(bias.fightBias))return false;
    const wanted=def.ing.filter(i=>this.needs(att).includes(i));
    if(!wanted.length&&bias.hoardBias<1.4)return false;
    const prize=wanted.length?this.acquireTurns(att,wanted[0]).turns:PLAN.leverageTurns;
    const cost=this.coinTurns(this.cfg.refire||0);
    return 0.5*prize*bias.fightBias>=cost;
  }
  /* A ROUTE FIELD PER DESTINATION, over the real water. waterField() already does the BFS that
     respects islands and the rim; it just caches one target at a time, which is useless to a planner
     that costs six destinations per plan. The board's land never moves, so these are computed once
     per game and reused. */
  destField(cell){
    const k=cell[0]+","+cell[1];
    if(!this._destFields)this._destFields={};
    if(!this._destFields[k]){
      const saveF=this._field,saveK=this._fieldKey,saveR=this._fieldRound;
      this._field=null;this._fieldKey=null;
      this._destFields[k]=this.waterField(cell);
      this._field=saveF;this._fieldKey=saveK;this._fieldRound=saveR;
    }
    return this._destFields[k];
  }
  /* ================= ONE BRAIN =================
     planTurn(p) is the ONE brain entry point — Game.takeTurn (headless) and src/ui/flow.js
     botTurn (animated) both call it, so the brain that lives here drives both turn paths by
     construction. This engine holds exactly ONE whole-turn planner and planTurn dispatches to
     it unconditionally. Tuning is therefore done with the brain that actually ships: a bot
     tuned against a planner the game never runs measures a game nobody plays. Wyatt,
     2026-08-18: *"we should never use the old bot brain, it's done. Bot tuning should be done
     with the newest algorithm that is actually used in game."*

     The incumbent whole-turn planner /4 inherited from /v2bakeoff was kept here byte-identical
     as the control arm of a head-to-head that has since been decided, along with the four
     helpers only it called. All five are gone. That also settled the divergent float tie-break
     tolerance the intake audit flagged: the looser value lived ONLY inside the deleted planner,
     so the tighter one used at three sites below is now the only tie-break tolerance in this
     file. Nothing was reconciled — the duplicate simply went away.

     The incumbent itself is not lost. It still ships at /v2bakeoff and in 3/, and
     docs/BOT-V3-RACE-PLANNER.md records what the head-to-head against it measured. Those
     numbers stay true as the record of why this brain was chosen; they are simply no longer
     reproducible against THIS tree, which was the accepted price of deleting the control. */
  planTurn(p){
    return this.planTurnV3(p);
  }
  /* ================= v3: THE RACE PLANNER =================
     The incumbent minimises MY expected turns and bolts denial on as a priced constant. This brain
     changes the objective itself: it maximises the PROBABILITY OF WINNING a modelled four-way race.

         P(win) = Π over rivals q of  σ( (ETA_q − myFinish) / RACE_SPREAD )

     where σ is the logistic curve, myFinish comes from my own contested tour, and ETA_q is a real
     voyage built for each rival from public evidence only. What this buys over the incumbent:

       1. CONTENTION. Rivals' predicted island arrivals deplete the shelves inside MY tour costing,
          so "go first where the crates will be gone" falls out of the price, not a tie-break.
       2. DENIAL WITHOUT A CONSTANT. Robbing the leader raises P(win) by exactly how much it moves
          their ETA past mine — worth everything in a close race, nothing when I'm out of it, and
          no denialTurns/threatHorizon to mis-scale (the −21.2 lesson).
       3. RISK POSTURE FOR FREE. A fight's outcomes are evaluated ON the curve, not averaged before
          it: a comfortable leader finds gambles lower its P(win) (little to gain up top, a lot to
          lose), a trailing captain finds the same gamble raises it. Jensen's inequality does what
          an explicit variance policy would have hard-coded.
       4. TRUE SAILING COSTS. Legs are costed by a wind-aware turn-count field built from the real
          one-turn reachability rule, so a dogleg around the wind and a squeeze past an island are
          priced as the squares they actually cost, not ceil(manhattan/speed).

     Everything here is RNG-free (reads state, returns) and reads no rival's recipe. */

  /* One turn's reach from `from` under `wind` — the same flood as sailStates (rule 1: 4 squares,
     2 once any step bites into the wind; the rim is a place you may FINISH but never a staging
     post) with two deliberate differences: other ships are ignored (they will have moved by the
     time a later leg is sailed), and the wind is a parameter, because later legs are costed under
     the forecast. */
  windReach3(from,wind,rev){
    const maxOpen=this.sailRange(),maxUp=this.sailRangeUpwind();
    // REVERSED FLOODS MIRROR THE TRIGGER. A legal turn from x to y under wind W is a path whose
    // steps, negated and read backwards, form a path from y to x — and it contained a step in
    // direction OPPOSITE[W] exactly when the reversed one contains a step in direction W. The
    // "any upwind step halves the whole turn" rule is path-wide, so it survives the reversal
    // intact. That is what lets turnsFieldTo3 flood once per DESTINATION instead of once per
    // candidate square.
    const trigger=rev?wind:OPPOSITE[wind];
    const passable=o=>{
      if(this.blocked(o))return false;
      if(this.isIsland(o)||this.isHome(o))return false;
      return true;
    };
    const seen={[from[0]+","+from[1]+",0"]:0};
    const out=[];
    const q=[[from,false,0]];
    while(q.length){
      const [c,used,n]=q.shift();
      const limit=used?maxUp:maxOpen;
      if(n>=limit)continue;
      for(const dk of Object.keys(DIRS)){
        const d=DIRS[dk];
        const o=[c[0]+d[0],c[1]+d[1]];
        if(!passable(o))continue;
        const u2=used||dk===trigger;
        const n2=n+1;
        if(n2>(u2?maxUp:maxOpen))continue;
        const kk=o[0]+","+o[1]+","+(u2?1:0);
        if(seen[kk]!==undefined&&seen[kk]<=n2)continue;
        seen[kk]=n2;
        out.push(o);
        if(this.onRim(o))continue;   // the current sweeps you away — never a staging post
        q.push([o,u2,n2]);
      }
    }
    return out;
  }
  // Is this square the head of its quadrant's current — the one rim square a ship can actually
  // BE on? (rimHead maps every rim square to its quadrant's head; the head maps to itself, which
  // is why entering there is a zero-square ride.)
  isRimHead(c){const h=this.rimHead[c[0]+","+c[1]];return !!h&&h[0]===c[0]&&h[1]===c[1];}
  // Every rim square whose current delivers to `head` — i.e. every way into that quadrant's
  // channel. Built once per game; the board never moves.
  rimEntriesTo(head){
    if(!this._rimEntries){
      this._rimEntries={};
      for(const k of this.rim){
        const h=this.rimHead[k];if(!h)continue;
        const hk=h[0]+","+h[1];
        (this._rimEntries[hk]=this._rimEntries[hk]||[]).push(k.split(",").map(Number));
      }
    }
    return this._rimEntries[head[0]+","+head[1]]||[];
  }
  /* Whole-TURN distance field TO a destination under a constant `wind`: field["x,y"] = fewest
     turns of real sailing from x,y to `dest`, by the real movement rule. Layered reverse BFS —
     each layer is one turn's windReach3 flood with the upwind trigger mirrored (see above). Land
     never moves and ships are ignored, so a field lives for the whole game, cached by (dest,
     wind); there are only ever a handful of destinations (seven docks and home), which is the
     entire point of flooding from this end. This replaces ceil(BFS-distance / speed), which
     prices a full-speed dogleg around the wind and a half-speed crawl straight into it
     identically — and both wrong. */
  turnsFieldTo3(dest,wind){
    const key=dest[0]+","+dest[1]+"|"+(wind||"-");
    if(!this._tf3)this._tf3={};
    if(this._tf3[key])return this._tf3[key];
    const field={};field[dest[0]+","+dest[1]]=0;
    let frontier=[dest],t=0;
    while(frontier.length&&t<60){
      t++;
      const next=[];
      /* A rim square is somewhere a ship sails TO, never somewhere it can BE — the current
         sweeps it to that quadrant's head the instant it touches the channel. So the flood
         records a distance only for squares a ship can occupy: open water, and the four heads. */
      const add=o=>{
        if(this.onRim(o)&&!this.isRimHead(o))return;
        const k=o[0]+","+o[1];
        if(field[k]===undefined){field[k]=t;next.push(o);}
      };
      for(const c of frontier){
        for(const o of this.windReach3(c,wind,true))add(o);
        /* THE RIDE, READ BACKWARDS. If this square is a quadrant's head, then every square that
           can touch ANY of that quadrant's rim squares is one turn from here — the ship pays the
           turn to reach the channel and the current sails the rest. That is the whole trade wind
           in the cost model: one more edge in the same flood, priced as the one turn it is, so
           the planner weighs a ride against every other route by the same arithmetic. */
        if(this.isRimHead(c))
          for(const entry of this.rimEntriesTo(c))
            for(const o of this.windReach3(entry,wind,true))add(o);
      }
      frontier=next;
    }
    return this._tf3[key]=field;
  }
  /* Turns to sail from→to under `wind`, over the real water, by the real movement rule.
     null = no route. A voyage ENDS beside home, never on it (canBake is adjacency, and the home
     square is land to the flood) — so home as a destination reads the nearest berth's field
     value. Docks are ordinary water squares and read directly. */
  legTurns3(from,to,wind){
    const fk=from[0]+","+from[1];
    if(this.isHome(to)){
      let bst=null;
      for(const d of Object.values(DIRS)){
        const b=[to[0]+d[0],to[1]+d[1]];
        if(this.blocked(b)||this.isIsland(b)||this.onRim(b))continue;
        const v=this.turnsFieldTo3(b,wind)[fk];
        if(v!==undefined&&(bst===null||v<bst))bst=v;
      }
      return bst;
    }
    const d=this.turnsFieldTo3(to,wind)[fk];
    return d===undefined?null:d;
  }
  /* A rival's fastest plausible voyage, from PUBLIC evidence only (principle 5): position, purse,
     distinct crates held, live stock and prices. Which five of the seven they actually need is
     hidden, so this takes the OPTIMISTIC completion — the cheapest (recipeSize − distinct) crates
     they do not yet hold, greedily nearest-first with prices moving as their own predicted buys
     deplete each shelf. Optimistic is the right direction to be wrong in (threatTurns' own
     argument), and it is also the assumption under which their arrivals empty shelves soonest,
     which is exactly what the contention model must be robust against.
     Returns {eta, buys:[{ing,t}]} — eta in turns from now, buys feeding the depletion schedule. */
  rivalPlan3(q){
    const rs=this.cfg.recipeSize||5;
    const held=new Set(q.ing);
    let need=Math.max(0,rs-held.size);
    const stock={};for(const ing of this.ings)stock[ing]=this.tokens[ing]||0;
    const pay=((this.cfg.dockHeads||0)+(this.cfg.dockTails||0))/2||1;
    const base=this.cfg.crateBase||6;
    const fc=this.forecastWind()||this.windNow;
    let at=q.pos,coins=q.coins,t=0;
    const buys=[];
    while(need>0){
      let best=null,bing=null,bsail=0,bearn=0,bprice=0;
      for(const ing of this.ings){
        if(held.has(ing)||buys.some(b=>b.ing===ing))continue;
        // an empty shelf is no longer a dead end: the black market prices it flat (mirrors
        // cratePrice — change the two together). Without cfg.blackMarket the old skip stands.
        if(stock[ing]<=0&&!this.cfg.blackMarket)continue;
        const sail=this.legTurns3(at,this.dockOf[ing],t===0?this.windNow:fc);
        if(sail===null)continue;
        const price=stock[ing]>=1e9?base-1
          :stock[ing]<=0?this.cfg.blackMarket
          :Math.max(1,base-stock[ing]);
        const earn=Math.max(0,Math.ceil((price-coins)/pay));
        const cost=sail+earn+1;
        if(best===null||cost<best){best=cost;bing=ing;bsail=sail;bearn=earn;bprice=price;}
      }
      if(bing===null){t+=4;need--;continue;}   // nothing buyable: a deal or a fight, ~4 turns
      t+=bsail+bearn+1;
      coins+=bearn*pay+pay-bprice;             // the buying flip pays too, same as doDock
      if(stock[bing]<1e9&&stock[bing]>0)stock[bing]--;   // the black market's shelf is bottomless
      buys.push({ing:bing,t});
      at=this.dockOf[bing];
      need--;
    }
    const home=this.legTurns3(at,this.home,fc);
    t+=(home===null?PLAN.unreachable:home)+(this.cfg.bakeoff?PLAN.bakeTurns:0);
    return {eta:t,buys};
  }
  // Recompute one rival's ETA under a hypothesis about their hold — they lost a crate to me, or
  // took one of mine. Mutates and restores, the same pattern turnsToWin3If keeps: the whole path
  // reads state and returns, so a replay cannot fork on it.
  rivalEta3If(q,h){
    const si=q.ing;
    if(h.gain)q.ing=q.ing.concat([h.gain]);
    if(h.drop){const c=q.ing.slice(),i=c.indexOf(h.drop);if(i>=0)c.splice(i,1);q.ing=c;}
    const v=this.rivalPlan3(q).eta;
    q.ing=si;
    return v;
  }
  /* The race, read once per decision: every rival's predicted voyage, and the merged schedule of
     which shelves their buys empty and when. Computed at the top of planTurnV3 and passed down —
     rivals do not move while this captain is choosing. */
  raceContext3(p){
    const plans=this.players.filter(q=>q!==p&&this.inPlay(q))
      .map(q=>({q,plan:this.rivalPlan3(q)}));
    const taken={};
    for(const {plan} of plans)for(const b of plan.buys)(taken[b.ing]=taken[b.ing]||[]).push(b.t);
    for(const k in taken)taken[k].sort((a,b)=>a-b);
    // Which still-needed crates could p actually open a table offer for RIGHT NOW. tour3 may only
    // let a deal undercut a fight when the trade system would genuinely speak one (principle 3 —
    // ask the exact question the action will ask). composeOffer is pure and RNG-free, the same
    // guarantee tryTrade already relies on.
    const offerable=new Set();
    for(const ing of this.needs(p))
      if(this.holdersOf(ing,p).length&&this.composeOffer(p,ing))offerable.add(ing);
    return {plans,taken,offerable};
  }
  /* MY contested tour: the incumbent's exact-order walk (every ordering of the crates still
     needed, real water, the wind that will actually blow, earn-only-what-is-short), with ONE
     change of substance — the shelf I arrive at holds what will be LEFT when I get there, rivals'
     predicted buys included, not what it holds now. Price is a clock; this makes the clock tick.
     Returns {turns, first} — first is the best ordering's opening destination, for aiming. */
  tour3(p,ctx){
    const fc=this.forecastWind()||this.windNow;
    if(p.done)return {turns:0,first:null};
    const needs=this.needs(p);
    if(!needs.length){
      const home=this.legTurns3(p.pos,this.home,this.windNow);
      return {turns:(home===null?PLAN.unreachable:home)+(this.cfg.bakeoff?PLAN.bakeTurns:0),
              first:this.home};
    }
    const pay=((this.cfg.dockHeads||0)+(this.cfg.dockTails||0))/2||1;
    const base=this.cfg.crateBase||6;
    let best=PLAN.unreachable,bestFirst=null;
    const walk=(rest,at,coins,t,first)=>{
      if(t>=best)return;
      if(!rest.length){
        const home=this.legTurns3(at,this.home,fc);
        const total=t+(home===null?PLAN.unreachable:home)+(this.cfg.bakeoff?PLAN.bakeTurns:0);
        if(total<best){best=total;bestFirst=first;}
        return;
      }
      for(let i=0;i<rest.length;i++){
        const ing=rest[i];
        let cost,end=at,purse=coins;
        const sail=this.legTurns3(at,this.dockOf[ing],t===0?this.windNow:fc);
        const arrive=t+(sail===null?PLAN.unreachable:sail);
        const raw=this.tokens[ing]||0;
        const takes=ctx&&ctx.taken[ing]?ctx.taken[ing]:[];
        const left=raw>=1e9?raw:raw-takes.filter(x=>x<=arrive).length;
        if(sail===null||left<=0){
          /* Shelf bare by arrival: the crate lives in somebody's hold, and the leg must be the
             JOURNEY of taking it — sail to the cheapest holder's intercept, fight until it lands
             (planned from the gauge, ~2 attempts at the measured 50%), and END THERE, so every
             later leg is costed from the deck of the fight. The old costing charged the turns but
             not the voyage: with no position in the price, closing on a holder bought nothing
             while drifting from Tortuga lengthened the sail home — so a becalmed bot scored
             SITTING STILL above every move and passed, for rounds on end (Wyatt saw it live;
             measured 211 motionless open-water passes in 300 games, seed 87109 parked four
             rounds straight). A deal may undercut the fight only when ctx.offerable says the
             trade system would actually compose the offer right now — a hail that will never be
             spoken is not a plan (principle 3, the 4,884-dead-turns lesson). */
          const legWind=t===0?this.windNow:fc;
          let take=null,aim=null;
          for(const q of this.holdersOf(ing,p)){
            const a=this.interceptOf(q);
            const s=this.legTurns3(at,a,legWind);
            if(s===null)continue;
            const c=s+2;
            if(take===null||c<take){take=c;aim=a;}
          }
          const deal=(ctx&&ctx.offerable&&ctx.offerable.has(ing))?2:null;
          // THE BLACK MARKET keeps the buy leg alive on a bare shelf (mirrors cratePrice — change
          // the two together): sail there, earn up to the flat price, buy. Weighed on the same
          // clock as the fight and the deal, so the tour — not a special rule — decides which wins.
          let bm=null,bmPurse=0;
          if(sail!==null&&this.cfg.blackMarket){
            const bprice=this.cfg.blackMarket;
            const bearn=Math.max(0,Math.ceil((bprice-coins)/pay));
            bm=sail+bearn+1;
            bmPurse=coins+bearn*pay+pay-bprice;
          }
          if(take===null&&deal===null&&bm===null){best=Math.min(best,PLAN.unreachable);continue;}
          const cheapest=Math.min(take===null?Infinity:take,deal===null?Infinity:deal,bm===null?Infinity:bm);
          if(bm!==null&&bm===cheapest){
            cost=bm;end=this.dockOf[ing];purse=bmPurse;  // a certain purchase outranks a coin-flip fight on ties
          }else if(deal!==null&&deal===cheapest){
            cost=deal;                                   // rule 4: a hail reaches the whole table
          }else{
            cost=take;end=aim;
            purse=coins-2*(this.cfg.powder||0);          // powder for the expected two broadsides
          }
        }else{
          const price=raw>=1e9?base-1:Math.max(1,base-left);
          const earn=Math.max(0,Math.ceil((price-coins)/pay));
          cost=sail+earn+1;
          end=this.dockOf[ing];
          purse=coins+earn*pay+pay-price;   // the buying flip pays too, same as doDock
        }
        // `first` is the best ordering's opening DESTINATION, for aiming ties. A leg that moved
        // the ship supplies it (a buy leg's dock, a take leg's intercept); a deal leg moves
        // nothing and supplies nothing — it must NOT fall back to the bare island's dock, which
        // is exactly the empty shelf there is no reason to visit.
        walk(rest.slice(0,i).concat(rest.slice(i+1)),end,purse,t+cost,
             first||(end===at?null:end));
      }
    };
    walk(needs,p.pos,p.coins,0,null);
    return {turns:best,first:bestFirst};
  }
  turnsToWin3(p,ctx){return this.tour3(p,ctx).turns;}
  // The contested tour under a hypothesis — standing elsewhere, one crate up or down, a different
  // purse. Mutate-and-restore, the same contract rivalEta3If keeps.
  turnsToWin3If(p,h,ctx){
    const sp=p.pos,si=p.ing,sc=p.coins;
    if(h.cell)p.pos=h.cell;
    if(h.gain)p.ing=p.ing.concat([h.gain]);
    if(h.drop){const c=p.ing.slice(),i=c.indexOf(h.drop);if(i>=0)c.splice(i,1);p.ing=c;}
    if(h.coins!==undefined)p.coins=h.coins;
    const v=this.turnsToWin3(p,ctx);
    p.pos=sp;p.ing=si;p.coins=sc;
    return v;
  }
  /* P(win). My finish is (this turn) + (the contested tour after it); each rival's is their ETA.
     Each pairwise race reads off a logistic curve over the margin in turns — RACE_SPREAD is the
     measured scatter between a mid-voyage prediction and the finish it predicted (see the header
     of scripts/measure_race_spread.mjs for the measurement), not a tuned taste. Margins are  [UNGATED-IN-4: measure_race_spread.mjs reads the root tree, not this one]
     clamped so a hopeless race is 0 and a won one is 1 without overflow. */
  raceScore3(myT,plans,overrides){
    let s=1;
    for(const e of plans){
      const eta=(overrides&&overrides.has(e.q))?overrides.get(e.q):e.plan.eta;
      let m=(eta-(myT+1)+RACE_BIAS)/RACE_SPREAD;
      if(m<-30)m=-30;if(m>30)m=30;
      s*=1/(1+Math.exp(-m));
    }
    return s;
  }
  /* THE WHOLE TURN, DECIDED BEFORE THE SHIP MOVES — same shape as the incumbent (one plan: the
     square I end on and what I do there; candidates pruned to every square with a berth or an
     enemy plus the best ground-makers; ties break on ground made), scored on P(win) instead of
     turns. Stochastic actions branch on their real outcomes and average the SCORE, not the state:
     that is where the risk posture lives.

     Set game.explain = [] before a turn and every candidate this planner scores is appended to
     it, with the arithmetic that produced its number. Off unless something asks. That note used
     to sit on the deleted incumbent, which is the only place it was ever written down; the hook
     is live here and this is now the only planner it can describe. */
  planTurnV3(p){
    const log=this.explain;
    const bias=PERSONALITY[p.strategy]||PERSONALITY.balanced;
    const grudge=p.grudge;p.grudge=null;
    const ctx=this.raceContext3(p);
    const tour=this.tour3(p,ctx);
    const baseT=tour.turns;
    p.plan=this.buildRoute(p).route;   // kept for narration/debugging, same as the incumbent

    const cells=this.reachableFrom(p);
    cells.push([...p.pos]);
    /* THE RIDE AS A MOVE. Touching the trade winds is a legal one-turn move whose ARRIVAL is that
       quadrant's head, so the candidate square is the head and the entry square is remembered as
       the route to it (plan.via). Nothing else here changes: the head is an ordinary square to
       everything downstream — it can be docked from, fought from, hailed from, exactly as a human
       captain does after the current sets them down — and it is weighed by P(win) like any other
       square. Same edge the cost field just learned, offered on this turn. */
    const rideVia={};
    for(const k of this.sailStates(p,{throughRim:true}).keys()){
      const c=k.split(",").map(Number);
      if(!this.onRim(c))continue;
      const h=this.rimHead[k]||c;
      const hk=h[0]+","+h[1];
      if(rideVia[hk]||(h[0]===p.pos[0]&&h[1]===p.pos[1]))continue;   // a ride to where we already are is a wasted turn
      rideVia[hk]=c;cells.push([h[0],h[1]]);
    }
    const interesting=[],rest=[];
    for(const c of cells){
      const hasPort=!!this.portAt(c),hasFoe=this.foesAt(c,p).length>0;
      (hasPort||hasFoe?interesting:rest).push(c);
    }
    const aimCell=tour.first||this.home;
    rest.sort((a,b)=>man(a,aimCell)-man(b,aimCell));
    /* Every reachable square is scored in full. The incumbent shortlisted six of them because
       its re-plans were the cost; v3's legs are O(1) field lookups, so the whole option surface is
       affordable — and it is worth points on the ladder (+6.7 -> +10.2 at 400 games), because the
       wind-true fields can only prefer a dogleg the shortlist never offered them. */
    const candidates=interesting.concat(rest);

    const aimField=this.destField(aimCell);
    const ground=c=>{const d=aimField[c[0]+","+c[1]];return d===undefined?1e6:d;};
    let best=null,bestGround=1e9;
    const consider=o=>{
      if(log)log.push({...o,cell:[...o.cell],target:o.target?o.target.idx:null,ground:ground(o.cell)});
      const g=ground(o.cell);
      if(!best||o.value>best.value+1e-12||(Math.abs(o.value-best.value)<=1e-12&&g<bestGround)){
        best=o;bestGround=g;
      }
    };
    const heads=this.cfg.dockHeads||0,tails=this.cfg.dockTails||0;

    for(const cell of candidates){
      // POSITION ALONE: the race if I simply finish the turn here.
      const sailT=this.turnsToWin3If(p,{cell},ctx);
      consider({cell,type:"sail",value:this.raceScore3(sailT,ctx.plans),
                why:this.needs(p).length?"enroute":"finishing",
                detail:{myT:sailT}});

      const port=this.portAt(cell);
      if(port&&!(this.cfg.singleDock&&this.dockOccupiedBy(port,p))){
        /* THE BERTH, BRANCHED ON THE FLIP IT ACTUALLY IS. doDock flips FIRST and buys against the
           purse the flip just paid — so heads and tails are different states, evaluated exactly as
           doDock will play them (needsIt || the merchant's leverage clause), then averaged as
           SCORES. Using the mean payout instead would ask a different question than the action
           answers, which is principle 3's whole warning. */
        const price=this.cratePrice(port);
        let ep=0;const branches=[];
        for(const pay of [heads,tails]){
          const purse=p.coins+pay;
          const buys=this.cfg.dockBuy&&price!==null&&purse>=price;
          const needsIt=buys&&this.needs(p).includes(port);
          const leverage=buys&&!needsIt&&this.cfg.merchant&&bias.hoardBias>=1.4&&
            this.players.some(q=>q!==p&&this.inPlay(q)&&this.likelyNeeds(q,port));
          const take=needsIt||leverage;
          const myT=this.turnsToWin3If(p,{cell,gain:take?port:null,
                                          coins:purse-(take?price:0)},ctx);
          // my purchase empties a shelf slot rivals may have been counting on — their race moves.
          // Not on a black-market buy: that shelf is bottomless, so nobody's plan changes.
          let ov=null;
          if(take&&this.tokens[port]>0){
            ov=new Map();
            this.tokens[port]--;
            for(const e of ctx.plans)
              if(e.plan.buys.some(b=>b.ing===port))ov.set(e.q,this.rivalPlan3(e.q).eta);
            this.tokens[port]++;
          }
          const s=this.raceScore3(myT,ctx.plans,ov);
          ep+=0.5*s;branches.push({pay,myT,take,s:+s.toFixed(4)});
        }
        consider({cell,type:"dock",ing:port,value:ep,
                  why:(p.plan[0]&&p.plan[0].ing===port)?"plan":"income",
                  detail:{price,branches}});
      }

      if(!this.needs(p).length)continue;   // finished recipes never start fights (v1's AI-01)
      for(const q of this.foesAt(cell,p)){
        if(!this.canAttack(p,q))continue;
        /* THE FIGHT, EVALUATED ON THE CURVE. Outcome odds are the measured ones (60,000 battles:
           downwind 49.6 / 25.4 / 25.0, otherwise 24.9 / 0 / 75.1). Each outcome is a full state —
           crates moved on BOTH sides of the race — scored separately, then averaged. A leader
           holding four crates finds the loss branch costs more P(win) than the win branch buys;
           a trailer finds the reverse. Nobody wrote that policy down; the curve's shape is it.
           The rematch escalator survives as a cost in my own turns — it exists to stop grudge
           duels pricing themselves back in, and that failure mode does not care which objective
           the duel was justified under. */
        const downwind=this.downwindFrom(cell,q);
        const pWin=downwind?0.5:0.25,pFlee=downwind?0.25:0,pLose=1-pWin-pFlee;
        const purse=p.coins-(this.cfg.powder||0);
        const rematch=PLAN.rematchEscalate*this.recentFights(p,q);
        const revenge=(grudge&&grudge.against===q.idx&&grudge.expires>=this.round)?0.6:0;
        const drag=rematch-revenge;
        // the crate the winner actually takes, mirroring awardSpoil's own pick order
        const wanted=q.ing.filter(i=>this.needs(p).includes(i));
        const lever=q.ing.filter(i=>this.players.some(x=>x!==p&&x!==q&&this.inPlay(x)&&this.likelyNeeds(x,i)));
        const spoil=wanted[0]!==undefined?wanted[0]:(lever[0]!==undefined?lever[0]:q.ing[0]);
        // stand: I sailed here and paid powder, coins landed nowhere
        const standT=this.turnsToWin3If(p,{cell,coins:purse},ctx)+drag;
        const sFlee=this.raceScore3(standT,ctx.plans);
        // win: their crate in my hold, and their voyage longer by having to replace it
        const winT=this.turnsToWin3If(p,{cell,gain:spoil,coins:purse},ctx)+drag;
        const ovW=new Map([[q,this.rivalEta3If(q,{drop:spoil})]]);
        const sWin=this.raceScore3(winT,ctx.plans,ovW);
        // lose: my most expensive crate gone TO THEM — worst case for me, and their gain is real
        let worst=null,worstCost=-1;
        for(const ing of new Set(p.ing)){
          const c=this.turnsToWin3If(p,{cell,drop:ing,coins:purse},ctx);
          if(c>worstCost){worstCost=c;worst=ing;}
        }
        const loseT=(worst?worstCost:standT)+drag;
        const ovL=worst?new Map([[q,this.rivalEta3If(q,{gain:worst})]]):null;
        const sLose=this.raceScore3(loseT,ctx.plans,ovL);
        /* Principle 8, ported: fightBias is the archetype's thumb on the RISK, never the prize.
           A pirate feels the loss branch at 1/fightBias of its true depth below the stand score;
           a rusher feels it deeper. The probabilities stay honest. */
        const feltLose=sFlee-(sFlee-sLose)/bias.fightBias;
        const v=pWin*sWin+pFlee*sFlee+pLose*feltLose;
        consider({cell,type:"attack",target:q,value:v,why:wanted.length?"opportunity":"denial",
                  detail:{downwind,pWin,pLose:+pLose.toFixed(2),spoil,
                          sWin:+sWin.toFixed(4),sFlee:+sFlee.toFixed(4),sLose:+sLose.toFixed(4),
                          rematch:+rematch.toFixed(2)}});
      }
    }

    // A HAIL REACHES THE WHOLE TABLE (rule 4) — it rides on the best-positioned square, same as
    // the incumbent, and botOpenOffer is the exact question tryTrade will ask (principle 3).
    // The park prefers a MOVING square on ties (same anti-anchor rule as below): a hail can be
    // refused, and a refused hail from a ship that also stood still is a whole turn shown to the
    // table as nothing.
    if(this.needs(p).length){
      const offer=this.botOpenOffer(p);
      if(offer){
        let park=null,parkS=-Infinity,parkG=1e9,parkStay=true;
        for(const cell of candidates){
          const s=this.raceScore3(this.turnsToWin3If(p,{cell},ctx),ctx.plans);
          const g=ground(cell),stay=cell[0]===p.pos[0]&&cell[1]===p.pos[1];
          if(s>parkS+1e-12||(Math.abs(s-parkS)<=1e-12&&(parkStay&&!stay||(stay===parkStay&&g<parkG)))){
            parkS=s;park=cell;parkG=g;parkStay=stay;
          }
        }
        const tradeT=this.turnsToWin3If(p,{cell:park,gain:offer.want,
                                           coins:p.coins-(offer.giveCoins||0)},ctx);
        consider({cell:park,type:"trade",value:this.raceScore3(tradeT,ctx.plans),why:"plan",
                  detail:{park:[...park],myT:tradeT}});
      }
    }
    /* NEVER ANCHOR. Wyatt, 2026-08-10, watching /3: "They should never simply stay on the same
       square and wait." When the winning plan is plain sailing that goes nowhere — no fight, no
       berth worked, just this square again — and the race arithmetic was indifferent (whole-turn
       tours tie in flat spots by construction), the indifference is resolved toward MOTION: the
       best candidate that actually moves, by the same (value, ground) order as everything else.
       Motion carries option value the integer tour cannot see — berths free up, storms shove,
       holders drift into range — and a becalmed ship reads as a broken one (principle 7: a turn
       with nothing worth doing is a bug). Exceptions are the honest ones: an ACTION on this
       square (dock/fight here) is not waiting, arrival at the bakery is not waiting (lightOvens
       fires after this turn), and a boxed-in ship has takeTurn's own rim escape. */
    if(best&&best.type==="sail"&&best.cell[0]===p.pos[0]&&best.cell[1]===p.pos[1]&&!this.canBake(p)){
      let move=null,moveG=1e9;
      const mv=o=>{
        const g=ground(o.cell);
        if(!move||o.value>move.value+1e-12||(Math.abs(o.value-move.value)<=1e-12&&g<moveG)){move=o;moveG=g;}
      };
      for(const cell of candidates){
        if(cell[0]===p.pos[0]&&cell[1]===p.pos[1])continue;
        mv({cell,type:"sail",value:this.raceScore3(this.turnsToWin3If(p,{cell},ctx),ctx.plans),why:"enroute"});
      }
      if(move)best=move;
    }
    // A square that is only reachable on the current names the entry the ship must sail for.
    if(best){const hk=best.cell[0]+","+best.cell[1];if(rideVia[hk])best.via=rideVia[hk];}
    return best||{cell:[...p.pos],type:"sail",value:0,why:"enroute"};
  }
  /* ================= what to do with THIS turn =================
     Not a menu of scores — the route already decided what this bot wants. This just reads the
     first leg of it and answers "can I take that step from where I'm standing?" */
  chooseAction(p){
    const activeGrudge=p.grudge;p.grudge=null;
    const route=p.plan||this.buildRoute(p).route;
    const leg=route&&route.length?route[0]:null;
    const port=this.adjPort(p);
    const adj=this.adjOpp(p);
    // 1. The plan says take it by force, and the mark is right there — fight.
    if(leg&&leg.kind==="take"&&leg.via&&adj.includes(leg.via)&&this.canAttack(p,leg.via))
      return {type:"attack",target:leg.via,why:"plan"};
    // 2. The plan says deal for it — a trade reaches the whole table, so position is irrelevant.
    //
    // ASK THE QUESTION THE TRADE ITSELF WILL ASK (Wyatt, 2026-08-09, watching bots pass while sitting
    // on a dock). This used to check only that SOMEBODY holds the crate — but botOpenOffer applies
    // two further tests before it will say a word (is anyone still worth re-asking, and is my offer
    // within reach of their price), and it fails one of them most of the time. The turn was then
    // committed to a hail that never happened: no offer, no parley, no dock, just a blank pass.
    // Measured over 300 games: 4,884 of 5,703 trade turns died this way, 836 of them while standing
    // at a workable dock and 831 beside a legal target holding a crate the bot needed.
    //
    // Calling botOpenOffer here is safe to do twice — the whole compose path (composeOffer /
    // worthReAsking / offerWorthTurns / estimateCrateCost / acquireTurns) reads state and returns;
    // it draws no RNG, emits no event and mutates nothing, so tryTrade recomputing it a moment
    // later gets the same answer and the seeded stream is untouched. That purity is load-bearing:
    // if anything in that path ever starts drawing from this.r(), this line forks replay.
    if(leg&&leg.kind==="deal"&&this.botOpenOffer(p))
      return {type:"trade",why:"plan"};
    // 3. Standing at the dock the plan sent us to — work it. Docking is never wasted: it pays
    //    whether or not there is a crate left to buy (rule 10d), so it is always a real option.
    if(port&&this.canDock(p,port))
      return {type:"dock",ing:port,why:(leg&&leg.ing===port)?"plan":"income"};
    // 4. Opportunism, priced honestly: somebody adjacent is holding something my route says is
    //    expensive to get any other way, and beating them for it is cheaper than my current plan.
    if(!this.needs(p).length){
      // recipe complete — never start a fight, just sail home and bake (v1's AI-01, still right)
      return {type:"sail",why:"finishing"};
    }
    let bestFight=null;
    for(const q of adj){
      if(!this.canAttack(p,q))continue;
      const prize=q.ing.filter(i=>this.needs(p).includes(i));
      // v2.1 — THE DENIAL RAID (Wyatt, 2026-08-06). This used to `continue` whenever the target held
      // nothing on my own shopping list, which is exactly why the leader sailed home unmolested:
      // every fight in the game had to be self-interested, so a captain one crate from victory was
      // only ever attacked by coincidence. Now a crate I have no use for is still worth taking if
      // losing it sets THEM back — and that value is what `denial` prices, in my own turns.
      const urgent=this.threatUrgency(q);
      if(!prize.length&&urgent<=0)continue;
      // what the fight is WORTH: the better of what I'd gain (turns saved acquiring it the slow
      // way) and what I'd cost them. A raid on a nobody still needs to pay for itself.
      const gain=prize.length?this.acquireTurns(p,prize[0]).turns:0;
      const denial=urgent*PLAN.denialTurns;
      const worth=Math.max(gain,denial);
      const bias=PERSONALITY[p.strategy]||PERSONALITY.balanced;
      const rematch=PLAN.rematchEscalate*this.recentFights(p,q);
      const grudge=(activeGrudge&&activeGrudge.against===q.idx&&activeGrudge.expires>=this.round)?0.6:0;
      const hunt=1+urgent*PLAN.huntWeight*bias.fightBias;
      const cost=(PLAN.fightTurns+PLAN.fightLossRisk+rematch-grudge)/bias.fightBias/hunt;
      if(cost<worth&&(!bestFight||cost<bestFight.cost))bestFight={type:"attack",target:q,cost,why:prize.length?"opportunity":"denial"};
    }
    if(bestFight){
      const tied=adj.filter(q=>this.canAttack(p,q));
      // v2.1: tieBully re-points a pirate at the WEAKEST adjacent ship, which is the opposite of
      // what hunting the leader is for. Picking on the runt is a flavour preference; stopping the
      // captain on the brink is the plan — so the bully arm stands down whenever the current mark
      // is a genuine threat, rather than quietly undoing the decision made just above.
      const marked=this.threatUrgency(bestFight.target)>0;
      if(!marked&&(PERSONALITY[p.strategy]||PERSONALITY.balanced).tieBully&&tied.length>1){
        tied.sort((x,y)=>(x.coins+x.ing.length)-(y.coins+y.ing.length));
        if(tied[0]!==bestFight.target&&this.needs(p).some(i=>tied[0].ing.includes(i)))bestFight.target=tied[0];
      }
      return bestFight;
    }
    // 5. Nothing to do here. A trade reaches the whole table from anywhere, so try that before
    //    settling for sailing — it is the one action distance cannot deny us.
    if(this.botOpenOffer(p))return {type:"trade",why:"fallback"};
    return {type:"sail",why:"enroute"};
  }
  takeTurn(p,windDir,storm){
    this.ev({t:"turn",p:p.idx});
    // v2 rule 7: storms are resolved for the WHOLE TABLE at the top of the round (see play()),
    // not per player here. By the time a turn starts the storm has already happened, and v2.1
    // removed the only way it could cost a turn — so every captain always gets to play.
    const port0=this.adjPort(p);
    if(!port0)p.dockedNow.clear();
    // PRINCIPLE 1: the WHOLE turn is decided here, before a square is crossed — which square to
    // finish on and what to do from it, scored as one plan against turns-to-victory.
    const plan=this.planTurn(p);
    const before=[...p.pos];
    // sailing is free now (rule 2) — no coin gate, no refund, no "too poor to sail"
    if(man(p.pos,plan.cell)>0){
      const moved=this.sailPlan(p,plan);
      // The drawn route rides WITH the move (see ev/bakeDraw above). sailPlan has already written
      // p.pos, so the search is told the pre-move square outright via `from`, and `before` heads
      // the polyline — the wire then carries the whole line instead of a destination that the far
      // side would have to guess a line to.
      if(moved){this.ev({t:"sail",p:p.idx,route:[[...before],...this.sailPath(p,[...p.pos],{throughRim:false,from:before})]});this.tradewind(p);}
      else if(this.boxedIn(p)&&this.rimEscape(p)){/* rim sweep recorded its own event */}
    }
    if(p.pos[0]!==before[0]||p.pos[1]!==before[1])p.justDocked=false;
    if(!this.adjPort(p))p.dockedNow.clear(); // leaving a port re-arms its dock flip
    // The plan was costed from plan.cell; a storm or a blocked route can leave the ship short of it,
    // so anything needing adjacency is re-checked against where the ship ACTUALLY is. Not a second
    // decision — the same plan, refusing to pretend it arrived.
    if(plan.type==="attack"&&man(p.pos,plan.target.pos)<=1&&this.canAttack(p,plan.target)){
      this.battle(p,plan.target);return;}
    if(plan.type==="trade"&&this.tryTrade(p))return;
    if(plan.type==="dock"&&this.adjPort(p)===plan.ing&&this.doDock(p,plan.ing))return;
    // THE FALLBACK. chooseAction picks ONE action and, before this, a refusal ended the turn: a
    // hail nobody would answer, or a berth already taken, and the captain went to look at the sea —
    // even standing on a dock that pays whether or not there is a crate left to buy (rule 10d).
    // A human does the next best thing instead, so a bot does too. Deliberately only the DOCK, not
    // a second full pass through chooseAction: re-running the menu could pick a fight the planner
    // had already priced and rejected this turn, and working the berth under your feet is the one
    // move that is never wrong.
    const fallbackPort=this.adjPort(p);
    if(fallbackPort&&this.canDock(p,fallbackPort)&&this.doDock(p,fallbackPort))return;
    // Nothing left worth doing this turn — so a bot does exactly what a human does in the same
    // position (rule 3 left no filler action): leans over the rail and looks into the ocean — and
    // is paid the same dubloon a human is paid for it (RULE-01, see doPass).
    //
    // UNLESS the captain can bake (item 4, D-15). A human standing in this exact spot never even
    // sees the Pass button — flow.js's canOvens suppresses it the instant canBake(p) is true
    // (4/src/ui/flow.js:1857-1902) and shows "Fire up the ovens!" instead. A bot must not have an
    // affordance a human lacks (rule 13), so it does not pass here either. Ending the turn silently
    // is enough: playBakeoff()'s own lightOvens(p) call fires unconditionally right after takeTurn
    // returns (:2947), exactly as it does for a human whose turn ended on the ovens button — so the
    // ovens still light, the bot just never collects the pass dubloon for looking at the sea.
    if(this.cfg.bakeoff&&this.canBake(p))return;
    this.doPass(p);
  }
  /* ================= THE BAKE-OFF (v2.1) =================
     Arriving at Tortuga with a full recipe no longer wins the voyage — it lights the ovens. The
     captain must then name their five ingredients back in the recipe's own order, under bowls that
     have been shuffled. See v2bakeoff/src/engine/bakeoff.js for the pure core. */
  // Same predicate checkFinish has always used, extracted so both endings share one gate and can
  // never drift apart.
  /* IN PLAY — one predicate, and the ONLY thing that decides whether a captain is on the board.
     (Wyatt, 2026-08-08: "when you enter tortuga and click 'fire up the ovens' your boat should no
     longer be interactible — the weather shouldn't affect you, neither should the other players be
     able to do anything to you. Rather than encode this as a list of special cases, there may be
     some elegant way to do it".)

     This is that way. Every "still in play" test in this engine — the storm's running order, who
     blocks a square, who occupies a dock, who is adjacent to fight, who can be traded with, who
     holds an ingredient worth raiding, who a bot rates as a threat — used to ask `this.inPlay(q)`. They
     all ask this instead, so a baking captain leaves the board through one edit rather than
     thirteen special cases, and anything added later inherits the rule for free.

     WITH THE BAKE-OFF OFF THIS IS EXACTLY `!done`, because `baking` can never become true — which
     is why scripts/bakeoff_baseline.js stays byte-identical across all 200 games.  [UNGATED-IN-4: bakeoff_baseline.js reads the root tree, not this one] */
  inPlay(p){ return !p.done&&!p.baking; }
  canBake(p){ return !this.needs(p).length&&man(p.pos,this.home)<=1; }
  // Light the ovens. Returns true only on the transition, so a caller can narrate it once.
  // The bench is built from the AUTHORED step order (shared/recipe-steps.js), falling back to the
  // player's own recipe array if that table ever misses one: it is already a valid permutation, and
  // a live voyage must never crash on a data gap.
  lightOvens(p){
    if(!this.cfg.bakeoff||p.baking||p.done||!this.canBake(p))return false;
    const authored=recipeSteps(p.recipe);
    if(!authored)console.error("bake-off: no step order for recipe",p.recipe);
    p.baking=true;
    p.bake=newBake(authored?authored.ings:p.recipe.slice());
    // The bench the captain studies is SCRAMBLED, not the recipe laid out in order — see
    // scrambleBench. Bound rng, never `this.r` bare: r() increments this.randCalls and detaches.
    scrambleBench(p.bake,()=>this.r());
    this.ev({t:"ovens",p:p.idx});
    return true;
  }
  /* One attempt. `guess` is BOWL INDICES in recipe order; pass null and the engine plays it with
     the bot's own imperfect memory.

     botGuess IS CALLED FOR EVERY SEAT, HUMAN OR BOT, and that is deliberate: it keeps the r()
     stream from forking on "is this seat human?", which is the classic source of replay desync in
     this codebase. It also hands the shot clock a free, deterministic default for a 30s forfeit.
     The shuffle likewise always runs, so live and headless consume identical randomness. */
  /* SPLIT IN TWO so the live path can show the shuffle, wait for a human, and only then score —
     while the headless path does all three in one call. The rng ORDER is identical either way
     (shuffle, then the bot's guess, then nothing else draws), which is what keeps a live game and
     the simulator on the same seeded stream. Do not reorder these two draws. */
  bakeSetup(p){
    // BOUND, not passed bare: r() increments this.randCalls, so handing the pure core `this.r`
    // detaches it from the instance and throws on the first draw. Caught by the first balance run.
    const rng=()=>this.r();
    const setup=shuffleSlots(p.bake,rng,BAKE_SWAPS);
    p.bake.slots=setup.slots;
    // computed for EVERY seat, human or bot: it keeps the stream from forking on "is this seat
    // human?", and it is the forfeit answer if a human's shot clock runs out.
    const fallback=botGuess(p.bake,rng,BAKE_ATTENTION);
    return {setup,fallback};
  }
  bakeAttempt(p,guess){
    const {setup,fallback}=this.bakeSetup(p);
    return {setup,...this.bakeResolve(p,guess||fallback)};
  }
  bakeResolve(p,answer){
    const res=scoreAttempt(p.bake,answer);
    applyResult(p.bake,res);
    this.ev({t:"bake",p:p.idx,attempt:p.bake.attempts,
      correct:res.correct.filter(Boolean).length,left:unsolvedCount(p.bake),solved:p.bake.solved});
    if(p.bake.solved){
      p.bakedToday=true;
      // NO `finish` EVENT HERE (Wyatt, 2026-08-08: "There is a final narration after the successful
      // bakeoff which should be removed: 'ye return to tortuga with a full recipe!'").
      //
      // The plan for this feature said the existing `finish` copy was "already right and is reused,
      // not replaced". It was right for ARRIVING — which under the bake-off is what the `ovens`
      // event already narrates, days earlier. Firing it again on a successful bake told the player
      // they had just sailed home, at the exact moment they had in fact just baked, and immediately
      // after the `bake` line that says so properly ("every bowl in its place — ye baked it!").
      //
      // Nothing else needed it: finishOrder is built by endBakeDay from `bakedToday`, not from this
      // event, EVENT_SOUND.finish is explicit silence, and no code branches on the event type.
      // checkFinish keeps its own `finish` — on the classic path that line is exactly true.
    }
    return {answer,res,solved:p.bake.solved};
  }
  // Every captain at the ovens, in turn order. Bakes resolve together at the END of a day so that
  // arriving on the same day is a fair race rather than an accident of seat order (Wyatt's ruling).
  /* PAY FOR ANOTHER LOOK. Buys `n` replays of the shuffle at BAKE_REWATCH_COST each, and returns
     how many were actually AFFORDED — which is not always how many were asked for, so the caller
     must not assume. Coins are the only thing this minigame spends, and the only reason a rewatch
     is not free.

     DRAWS NO RANDOM NUMBERS and does not touch the bench. It replays what already happened, so it
     cannot change the answer — the swap list the UI animates a second time is the same one the
     engine already applied. Emits an event so the spend shows up in the captain's log rather than
     coins quietly draining, and so a scrubbed replay can account for them.

     Called with the whole count at once on replay, and one at a time live — see bakeTurnLive. */
  bakeRewatch(p,n){
    const cost=BAKE_REWATCH_COST;
    let bought=0;
    for(let i=0;i<(n||0);i++){
      if(p.coins<cost)break;
      p.coins-=cost;bought++;
    }
    if(bought)this.ev({t:"rewatch",p:p.idx,n:bought,paid:bought*cost});
    return bought;
  }
  bakersToday(order){ return order.filter(i=>this.players[i].baking&&!this.players[i].done); }
  /* Close the day. Anyone who baked perfectly joins finishOrder — which keeps its exact existing
     meaning, so bakeRank, eligibleFinishers, resolveEnd and the collab scene all keep working with
     no changes at all. Two on the same day means two finishers and the collaborative bakery. */
  endBakeDay(){
    const won=this.players.filter(q=>q.bakedToday);
    for(const q of won){ q.done=true;q.baking=false;this.finishOrder.push(q.idx); }
    this.players.forEach(q=>{q.bakedToday=false;});
    return won.length>0;
  }
  checkFinish(p){
    if(!this.needs(p).length&&man(p.pos,this.home)<=1){
      p.done=true;this.finishOrder.push(p.idx);this.ev({t:"finish",p:p.idx});
      // the "final round!" announcement + wind re-spin are handled by the caller (runLiveNet),
      // which alone knows the live turn order and can pause the whole crew for it (see #19).
      return true;}
    return false;
  }
  /* v2 rule 6: the wind for the NEXT round is drawn a round early and shown on the compass, storm
     and all. Rule 6d makes that a promise — once shown it is committed and can never turn out to
     be wrong — so a captain really can plan around it, which is the whole justification for rule
     8's "blown into land simply costs you the turn, there are no options". advanceWind() is the
     one place the promise is kept: what was forecast last round BECOMES this round's weather, and
     a fresh forecast is drawn behind it. */
  drawWeather(){
    const dir="NSEW"[Math.floor(this.r()*4)];
    const storm=rollStorm(this); // #1a: never a third storm back-to-back
    return {dir,storm};
  }
  /* v2.1 (Wyatt, 2026-08-06): "remove the storm direction from the forecast, so you'd know that a
     storm will come next turn, but you don't know which direction it'll go." The storms had lost
     their edge — a shove you can see coming a full round out is a logistics problem, not weather.

     A storm blows along ITS OWN ROUND'S WIND (see play(): `if(storm)this.runStorm(wind)`), so the
     storm's direction and next round's wind are THE SAME FACT. Hiding one hides the other, and
     that is the whole mechanic: a storm round is a round whose weather nobody can plan. No rule is
     added — a tabletop deck would simply print the storm card face-down.

     Everything that shows or uses the forecast goes through here, so the hidden direction cannot
     leak: the chip, the round header, the event log, and the bots' own planner. Bots must never
     know what the player cannot see — an opponent with private weather reads as a cheat far faster
     than an unfair rule does. */
  forecastWind(){ return this.stormNext?null:this.windNext; }
  advanceWind(){
    // first round of the game: there is no standing forecast yet, so draw this round's weather now
    if(!this.next)this.next=this.drawWeather();
    const cur=this.next;
    this.windNow=cur.dir;this.stormNow=cur.storm;
    this.next=this.drawWeather();
    this.windNext=this.next.dir;this.stormNext=this.next.storm;
    // v1's second perpendicular gust is gone (rule 7): a storm is one direction, one distance.
    this.windNow2=null;
    return cur;
  }
  /* v2 rule 7: ONE storm event for the whole table, at the top of the round, before anybody acts.
     Resolved downwind-first (Wyatt's ruling) so the lead ship clears its square before the ship
     behind it arrives — otherwise ships shield each other purely by seat order. */
  runStorm(dirKey){
    this.ev({t:"storm",dir:dirKey,dist:STORM_PUSH});
    for(const p of this.stormOrder(dirKey)){
      const before=[...p.pos];
      const wasDocked=this.adjPort(p)!==null;
      const outcome=this.stormPush(p,dirKey,STORM_PUSH);
      this.noteStormOutcome(p,outcome,p.pos[0]!==before[0]||p.pos[1]!==before[1],wasDocked);
    }
    // playtest 21 item 3: the one line that reads the whole storm, after every ship has resolved
    this.stormSummaryEvent(dirKey);
  }
  /* v2.1: two rulesets, two loops, dispatched here. Split rather than branched INSIDE one loop on
     purpose — playClassic is today's body moved verbatim, so "flag off = byte-for-byte" is a
     property of the code's shape rather than a claim about a conditional, and
     scripts/bakeoff_baseline.js proves it against a fingerprint taken before any of this existed.  [UNGATED-IN-4: bakeoff_baseline.js reads the root tree, not this one] */
  play(){ return this.cfg.bakeoff?this.playBakeoff():this.playClassic(); }
  /* THE BAKE-OFF LOOP. Three differences from playClassic, all of them consequences of one rule —
     the bake, not the arrival, is the finish line:
       - a captain at the ovens takes no ordinary turn; the attempt IS their turn
       - arriving lights the ovens and enrols them in THIS day's resolution, so nobody waits a day
         for a first attempt
       - the day resolves after every seat has played, so two captains arriving on the same day get
         a fair race instead of seat order deciding it
     The old one-lap final round is gone entirely: the baking days ARE the catch-up window. */
  playBakeoff(){
    let order=this.players.map((_,i)=>i);
    this.shuffle(order);
    while(this.round<150){
      this.round++;
      const {dir:wind,storm}=this.advanceWind();
      this.ev({t:"newround",dir:wind,windStreak:this.noteWind(wind),next:this.forecastWind(),nextStorm:this.stormNext});
      if(storm)this.runStorm(wind);
      for(const i of order){
        const p=this.players[i];
        if(p.done)continue;
        /* A-1 (Wyatt, 2026-08-28: "player to immediately be able to start their bake-off when
           they dock at tortuga"). ONE PHASE: a baking captain's turn IS their attempt, taken in
           their own turn slot — a continuing baker attempts instead of sailing, and a captain who
           docks this turn lights the ovens and bakes in the same breath. The fairness rule this
           loop has always carried SURVIVES, because endBakeDay still resolves at day end: two
           captains arriving the same day both get their attempt before anyone is crowned. What
           changed is only WHEN the attempt runs, not when the day resolves.
           DETERMINISM: this reorders the r() interleaving, in lockstep with the live loop
           (runLiveDayBakeoff) — the 2026-07-26 corpus, already unbound at the cutover, needs its
           re-record to be against THIS order; SOLO_SCHEMA_V=3 refuses pre-reorder saves. */
        if(p.baking){this.bakeAttempt(p,null);continue;}
        this.takeTurn(p,wind,storm);
        if(this.lightOvens(p))this.bakeAttempt(p,null);
      }
      if(this.endBakeDay())return this.resolveEnd();
    }
    return this.resolveEnd();
  }
  playClassic(){
    let order=this.players.map((_,i)=>i);
    this.shuffle(order);
    while(this.round<150){
      this.round++;
      const {dir:wind,storm}=this.advanceWind();
      this.ev({t:"newround",dir:wind,windStreak:this.noteWind(wind),next:this.forecastWind(),nextStorm:this.stormNext}); // NARR-04
      if(storm)this.runStorm(wind); // rule 7: everyone at once, before anyone acts
      for(const i of order){
        const p=this.players[i];
        if(p.done)continue;
        this.takeTurn(p,wind,storm);
        if(this.checkFinish(p)){
          if(this.finishOrder.length===1){
            // final round continues the SAME rotation from the seat after the finisher (#19)
            const sp=order.indexOf(i),lastLap=order.slice(sp+1).concat(order.slice(0,sp));
            for(const j of lastLap){const q=this.players[j];
              if(q.done)continue;
              this.takeTurn(q,wind,storm);this.checkFinish(q);}
            // v2.1: the final lap is the LIKELIEST moment for a raid on the bakery (rule 13c), and
            // if it lands the finisher is no longer finished. Ending here regardless would crown
            // nobody and stop a voyage that is still being sailed — so the voyage only ends if
            // somebody is still home. Otherwise the while-loop simply carries on to the next day.
            if(this.finishOrder.length)return this.resolveEnd();
            break;
          }
        }
      }
    }
    return this.resolveEnd();
  }
  /* v2 rule 12: there is no bakeoff. Every captain who got home collaborates on one bakery — a
     scene, not a mechanic — and BEST BAKER goes to whoever brought the most to it. Ranked on
     crates (all of them, recipe or not), then coins, then who got home first. No flipping: the
     title is earned across the whole voyage, not decided by one last coin. */
  bakeRank(a,b){
    const pa=this.players[a],pb=this.players[b];
    if(pb.ing.length!==pa.ing.length)return pb.ing.length-pa.ing.length;
    if(pb.coins!==pa.coins)return pb.coins-pa.coins;
    return this.finishOrder.indexOf(a)-this.finishOrder.indexOf(b);
  }
  /* NOBODY WINS WITHOUT A FULL RECIPE (Wyatt, 2026-08-06). unfinish() already removes a robbed
     captain from finishOrder at the moment the crate changes hands, so this should never find
     anyone to drop — it is here because the cost of being wrong is crowning a baker with nothing
     to bake, which is the exact bug being fixed, and because rule 13c invites raids on the bakery
     from paths this file cannot enumerate in advance. A check that is merely redundant today is
     the cheapest possible insurance against the next one. */
  eligibleFinishers(){
    return this.finishOrder.filter(i=>!this.needs(this.players[i]).length);
  }
  resolveEnd(){
    this.finishOrder=this.eligibleFinishers();
    if(!this.finishOrder.length){this.ev({t:"end",winner:null});return null;}
    if(this.finishOrder.length===1){this.winner=this.finishOrder[0];this.ev({t:"end",winner:this.winner});return this.winner;}
    const ranked=this.finishOrder.slice().sort((a,b)=>this.bakeRank(a,b));
    this.winner=ranked[0];
    this.ev({t:"collab",finishers:ranked.slice(),winner:this.winner,
      crates:ranked.map(i=>this.players[i].ing.length),coins:ranked.map(i=>this.players[i].coins)});
    this.ev({t:"end",winner:this.winner});
    return this.winner;
  }
}

// Fixed "Round World" ruleset (the recommended big-game preset), sized to the player count.
function roundCfg(strategies){
  const np=strategies.length;
  // v2 rule 11b (Wyatt, 2026-08-04): 3 crates per island at 3–4 players, 1 at 2 players. v1 gave
  // 2p unlimited islands to avoid two ships deadlocking over a single crate; under v2 that
  // deadlock is gone because crates are BOUGHT rather than won on a flip, so the scarcity can
  // stand. Note the consequence, which he was shown and accepted: with 1 crate left on an island
  // the price formula puts every 2-player crate at 5🌕.
  const crates=np===2?1:3;
  return {grid:15,nIslands:7,recipeSize:5,crates,startCoins:3,
    // rule 9c: powder still 2 up front. rule 9b: another 2 buys a fresh broadside, repeatable.
    powder:2,refire:2,callBounty:2,
    // rule 10: heads finds treasure, tails is a turn of dock work. rule 11: price = 6 − crates left.
    // WHAT THE DOCK PAYS IS THE `dockHeads`/`dockTails` FIELDS BELOW, NOT THIS PROSE. Derive every
    // displayed amount from cfg (checked 2026-08-27: `ui/flow.js` and `ui/util.js` both do; the
    // how-to-play modal still hardcodes its numbers — that is a filed todo, not this line's job).
    // This block is the GRAVEYARD for that pair: it has moved twice, each time on Wyatt's ask and
    // each time against a measured table, so any amount spelled out in a sentence here is dated
    // evidence and not a standing fact.
    //
    // CORRECTED 2026-08-27 (W2-10). This comment opened "TREASURE PAYS 5, NOT 6" from 2026-08-08
    // until today. It was TRUE when written — 49443202 introduced the sentence and `dockHeads:5`
    // in the same commit — and it rotted thirteen days later when D-30 moved the number and left
    // the prose alone. Wyatt saw 3 at a dock and was right; a session read this line and nearly
    // told him he was wrong. That is why the reasons below are dated, and why the amount itself
    // is not restated in prose anywhere in this block.
    //
    // ── 2026-08-08 · 6 → 5 (Wyatt: "Can we lower treasure to 5?"; commit 49443202) ──
    // Measured over 600 normal-length voyages, this is what the number moved:
    //   pays  ends with (median)  mean  ends broke  HOLDS AT THE OVENS
    //     6           4            5.2      21%            6
    //     5           3            3.5      29%            3
    //     4           2            2.1      49%            2
    // The end-of-voyage purse was never the real problem — crates already absorb ~81% of all dock
    // income. What mattered is the last column: a captain reaching the ovens with 6 coins can buy
    // six looks at the same three swaps, which stops being a memory test. 5 halves that to three
    // looks while leaving the midgame able to fund itself. The peek price is deliberately untouched.
    //
    // ── 2026-08-21 · 5/2 → 3/1, the values shipping below (D-30, stamp 2026-08-20t; commit 059bbe5,
    // which lives in the pre-cutover history and does not resolve in this repo) ──
    // A different question from the one above — not how fat the purse is at the end, but how often
    // a captain is priced out of a crate they are standing next to. 300 games, seed x7919
    // (`node scripts/economy_table.js 300 7919 --json`; full write-up in
    // `.planning/phases/02.2-a-captain-who-cannot-take-their-turn/02.2-ECONOMY-TABLE.md`):
    //   tails/heads   in the healthy 1–3-miss band   priced out 4+ times in a voyage
    //     2 / 5 (was)            24.6%                          0.2%
    //     1 / 4                  31.4%                          4.4%
    //     1 / 3 (his pick)       41.1%                          7.2%
    // A leaner dock is what makes money bite at all: it nearly halves the captains money never
    // troubles, and buys that with a small tail it now stifles. He was shown that trade and took
    // it. 1/4 remains the measured half-step if the stifled tail ever proves too much.
    dockHeads:3,dockTails:1,crateBase:6,
    // RULE-01: what a pass pays. A FIELD rather than a number written into the method, for the
    // reason every other amount on this object is one — nothing here is a constant, the game shifts
    // under it, and three copies of an amount that must move together is how the interface ends up
    // lying to a captain about their own purse. D-07 makes the balance check a gate on this phase:
    // if the ladder shows bots passing materially more and voyages dragging, Wyatt lowers this, and
    // THIS LINE is where that edit lands. Everything else — the payment, the button, the narration —
    // derives from here.
    passCoin:1,
    // THE BLACK MARKET (Wyatt, 2026-08-12): a sold-out island always has ONE more crate — for a
    // flat 10🌕, forever — twice the dearest a shelf crate can ever get (rule 11 prices a crate at
    // `crateBase` − crates left, so the last one on an island is 5), which is what makes it a last
    // resort and not a shop. (It read "two treasure finds' worth (treasure pays 5)" until
    // 2026-08-27; that was the same rotted number as the block above — the black market is priced
    // off the SHELF, not off the dock, and pinning it to the dock payout was never the argument.)
    // But it means no recipe is ever mathematically dead, and the map stays honest: the crate is
    // still AT its island, ye still sail there.
    // He killed the harbormaster 2-for-1 for this exact reason — it deleted geography; this keeps it.
    blackMarket:10,
    dockBuy:true,merchant:true,parley:true,
    // rule 4e: no harbor-tax refund on a struck trade. rule 3: no fishing, so no sardine rule.
    asym:false,storm:0.20,islandW:2,islandH:2,tetris:true,singleDock:true,
    roundBoard:true,unlimitedDock:true,strategies,
    // v2.1: threaded onto cfg rather than read at each call site, so a headless run can flip it PER
    // GAME to compare rulesets in one process, and so a solo save carries the value it was played
    // under (cfg is rebuilt from roundCfg() on resume).
    //
    // bakeoffEnabled(), NOT the bare constant: it is what honours `?bakeoff=0/1`, which is the whole
    // point of having the override — A/B'ing both rulesets on a phone with no redeploy. Reading
    // BAKEOFF_ENABLED here left that switch wired to nothing. It falls back to the constant wherever
    // there is no location to read (every headless script), so the simulator is unaffected.
    bakeoff:bakeoffEnabled(),
    // ?ovens=1 rides on cfg for the same two reasons bakeoff does just above — and for a third
    // that is multiplayer's own: a CREW room's cfg is written to Firebase at startGame and is what
    // a host-reload replay rebuilds from, so the shortcut has to live where the replay can see it.
    // A host who started a test room at ?ovens=1 and resumed at a bare URL would otherwise replay
    // the decision log against captains whose holds were never stocked — a structurally different
    // game. Falls back to the constant (false) headless, like bakeoffEnabled().
    ovens:ovensNowEnabled(),
    // W0-1's two endgame skips ride here for exactly the same three reasons, and are read through
    // the one testFlagOn() chain in orchestrator.js rather than three copies of it.
    bake2:bake2Enabled(),
    endcard:endCardEnabled()};
}

export { rollStorm, PERSONALITY, PLAN, Game, roundCfg };
