// src/engine/index.js
//
// Phase 8 engine tier (D-03/D-04). Holds no DOM, `window`, Firebase,
// wall-clock, or unseeded-random access — pure simulation logic only.
// Imports from `../shared/index.js`; must never be imported BY
// `src/shared/` (shared is a leaf, engine depends on it, never the reverse).

import { mulberry32, ING_ALL, TET, DIRS, OPPOSITE, PERP, SAIL_BUDGET, SAIL_BUDGET_LEEWARD, windStepCost, man, ilabelImg } from "../shared/index.js";

// notes/edits #1a: roll a storm for the round, but never allow a 3rd in a row. Always consumes
// exactly one g.r() so the seeded RNG sequence stays identical live vs. host-refresh replay.
function rollStorm(g){
  const roll=g.r()<g.cfg.storm;
  const storm=(g.stormStreak||0)>=2?false:roll;
  g.stormStreak=storm?(g.stormStreak||0)+1:0;
  return storm;
}

// Bot decision weights — every bot turn scores {attack, trade, dock, fish} and takes the best
// one instead of following a fixed priority order, so a bot only fights/trades/docks when it's
// actually the sharpest move that turn, not just because it's first in an if-chain. Magnitudes
// are starting points tuned by eye against the existing archetype personalities in
// DESIGN_REPORT.md — treat them as a dial to playtest, not a spec.
const PERSONALITY={
  //            attack trade dock fish  tieBully: break tied attack targets toward the weakest one
  pirate:     {attackMult:1.3,tradeMult:0.6,dockMult:0.9,fishMult:1.0,tieBully:true},
  trader:     {attackMult:0.5,tradeMult:1.6,dockMult:1.0,fishMult:1.0,tieBully:false},
  balanced:   {attackMult:0.9,tradeMult:1.0,dockMult:1.0,fishMult:1.0,tieBully:false},
  rusher:     {attackMult:0.0,tradeMult:0.7,dockMult:1.3,fishMult:1.1,tieBully:false},
  monopolist: {attackMult:1.0,tradeMult:0.8,dockMult:1.1,fishMult:1.0,tieBully:false},
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
const AW={steal:6,stealStack:0.3,rich:0.9,richCap:8,blockBonus:4,cornerBonus:5,riskPenalty:3,grudgeBonus:1,windAdv:3,windDis:2.5,rematchEscalate:5.5};
const TW={base:5,swapBonus:2,rusherRecipeGuard:0.2};
const DW={fallback:2,neededBonus:5,monopolistCornerBonus:6,surplusBonus:2,finisherBonus:8};
const FISH_BASE=1.5;

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
    this.players=cfg.strategies.map((s,i)=>{
      // two candidate recipe cards to choose from at game start (draft phase)
      const a=this.sample(this.ings,cfg.recipeSize);
      let b=this.sample(this.ings,cfg.recipeSize);
      let tries=0;
      while(tries++<20&&a.slice().sort().join()===b.slice().sort().join())b=this.sample(this.ings,cfg.recipeSize);
      return {idx:i,strategy:s,pos:[...this.home],coins:cfg.startCoins,
        ing:[],recipe:a,recipeChoices:[a,b],firstFlip:new Set(),dockedNow:new Set(),
        done:false,heads:0,flips:0,corner:null,justDocked:false,shipwrecked:false,
        coolUntil:{},grudge:null,justLost:null,fightLog:{}};
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
    o.state=this.players.map(p=>({pos:[...p.pos],coins:p.coins,ing:[...p.ing],done:p.done}));
    o.tokens={...this.tokens};this.events.push(o);}
  // during a reload-replay, fast-forwarding has no real delays between turns, and a bot's turn
  // can occasionally run a beat before its own recipe assignment has landed — treat "no recipe
  // yet" as "needs nothing" rather than throwing, since it resolves itself a tick later anyway
  needs(p){return p.recipe?p.recipe.filter(i=>!p.ing.includes(i)):[];}
  blocked(c){const n=this.cfg.grid;
    if(c[0]<0||c[1]<0||c[0]>=n||c[1]>=n)return true;
    return this.isRound&&!this.valid.has(c[0]+","+c[1]);}
  onRim(c){return this.isRound&&this.rim.has(c[0]+","+c[1]);}
  tradewind(p){ // entering the rim channel sweeps you to the head of that quadrant
    if(!this.isRound)return false;
    const head=this.rimHead[p.pos[0]+","+p.pos[1]];
    if(head&&(head[0]!==p.pos[0]||head[1]!==p.pos[1])){
      p.pos=[...head];this.ev({t:"tradewind",p:p.idx});return true;
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
  leeward(p){ // an island upwind of you blocks the wind — cuts your sail budget (see #7c)
    const d=DIRS[OPPOSITE[this.windNow]],up=[p.pos[0]+d[0],p.pos[1]+d[1]];
    // D-18: Tortuga is land for wind purposes too, exactly like every other island — mirrors the
    // isIsland(o)||isHome(o) blocking-movement parity already used by stepToward's pass() (:295).
    return this.isIsland(up)||this.isHome(up);
  }
  sailBudget(p){return this.leeward(p)?SAIL_BUDGET_LEEWARD:SAIL_BUDGET;}
  windPush(p,d,dist,dodgedOnce){
    dodgedOnce=dodgedOnce||{v:false};
    for(let s=0;s<dist;s++){
      const nx=[p.pos[0]+d[0],p.pos[1]+d[1]];
      if(this.blocked(nx))return;
      // D-19: Tortuga is a single square, so the only cells you can be pushed onto it FROM are
      // its four orthogonal neighbours — which are exactly the berths — and a berth always
      // satisfies mooredReason's "home" cause. So the aground ladder below is unreachable for the
      // home square; the old separate isHome(nx) early return was redundant with moored(), not
      // load-bearing, and folds into ordinary land handling here without changing any outcome.
      if(this.isIsland(nx)||this.isHome(nx)){
        const reason=this.mooredReason(p);
        if(reason){this.ev({t:"moored",p:p.idx,reason});return;}
        // a storm only ever charges (coins or a coin flip) once per turn — a second leg that
        // also hits an island is a free pass, already-paid anchor holding fast
        if(dodgedOnce.v){this.ev({t:"anchorHold",p:p.idx});return;}
        if(p.coins>=3){p.coins--;this.ev({t:"dodge",p:p.idx});}
        else if(this.flip(p)){this.ev({t:"anchor",p:p.idx});}
        // tails with no coins can't "lose half" of nothing — take a crate instead, or if the
        // hold is empty too, the ship is stuck and repairs eat the rest of this turn
        else if(p.coins>0){p.coins-=Math.max(1,Math.floor(p.coins/2));this.ev({t:"aground",p:p.idx});}
        else if(p.ing.length){
          const idx=Math.floor(this.r()*p.ing.length);
          const lost=p.ing.splice(idx,1)[0];
          this.tokens[lost]++;
          this.ev({t:"aground",p:p.idx,ing:lost});
        }else{p.shipwrecked=true;this.ev({t:"shipwrecked",p:p.idx});}
        dodgedOnce.v=true;
        return;
      }
      const blocker=this.players.find(q=>q!==p&&!q.done&&q.pos[0]===nx[0]&&q.pos[1]===nx[1]);
      if(blocker){this.ev({t:"blocked",p:p.idx,other:blocker.idx});return;} // another ship holds that square — wind stops short
      p.pos=nx;
      if(this.onRim(nx)){this.tradewind(p);return;} // swept into the trade winds
    }
  }
  stepToward(p,target,budget){
    // Dijkstra pathfinding (routes cleanly around concave islands; greedy movement gets
    // trapped), weighted by wind direction — moving with the wind is cheap, against it dear.
    const pass=o=>{
      if(this.blocked(o)||this.isIsland(o)||this.isHome(o))return false;
      if(this.onRim(o))return false; // bots stay out of the trade-wind channel
      if(this.dockCells.has(o[0]+","+o[1])&&this.players.some(q=>q!==p&&!q.done&&q.pos[0]===o[0]&&q.pos[1]===o[1]))return false;
      return true;};
    const key=c=>c[0]+","+c[1];
    const start=key(p.pos);
    const prev={},dist={[start]:0};
    const frontier=[[p.pos,0]];
    let best=null,bestScore=man(p.pos,target)*1000;
    while(frontier.length){
      let mi=0;
      for(let i=1;i<frontier.length;i++)if(frontier[i][1]<frontier[mi][1])mi=i;
      const [c,dc]=frontier.splice(mi,1)[0];
      if(dc>dist[key(c)])continue; // stale entry, already beaten by a cheaper path
      const score=man(c,target)*1000+dc;
      if(score<bestScore){bestScore=score;best=c;}
      if(dc>=budget+20)continue; // search past move range to find routes around obstacles
      for(const dk of Object.keys(DIRS)){
        const d=DIRS[dk];
        const o=[c[0]+d[0],c[1]+d[1]],k=key(o);
        if(!pass(o))continue;
        const nc=dc+windStepCost(this.windNow,dk);
        if(dist[k]!==undefined&&dist[k]<=nc)continue;
        dist[k]=nc;prev[k]=c;frontier.push([o,nc]);
      }
    }
    if(!best||key(best)===start)return;
    const path=[];let c=best;
    while(key(c)!==start){path.push(c);c=prev[key(c)];}
    path.reverse();
    // may sail PAST other ships, but must not END on one: back off to the last affordable,
    // unoccupied square along the path
    const occ=o=>this.players.some(q=>q!==p&&!q.done&&q.pos[0]===o[0]&&q.pos[1]===o[1]);
    let idx=path.length-1;
    while(idx>=0&&(dist[key(path[idx])]>budget||occ(path[idx])))idx--;
    if(idx>=0)p.pos=[...path[idx]];
  }
  // AI-05: is this bot walled in — every orthogonal neighbour blocked, an island, home, occupied,
  // or the rim? (The rim counts as "not an ordinary move" because stepToward refuses it.) When
  // this is true a bot has no normal way out and used to just sit there turn after turn.
  boxedIn(p){
    return Object.values(DIRS).every(d=>{
      const o=[p.pos[0]+d[0],p.pos[1]+d[1]];
      return this.blocked(o)||this.isIsland(o)||this.isHome(o)||this.onRim(o)||
        this.players.some(q=>q!==p&&!q.done&&q.pos[0]===o[0]&&q.pos[1]===o[1]);
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
      if(this.onRim(o)&&!this.blocked(o)&&!this.players.some(q=>q!==p&&!q.done&&q.pos[0]===o[0]&&q.pos[1]===o[1])){
        p.pos=o;this.ev({t:"windmove",p:p.idx});
        this.tradewind(p);
        return true;
      }
    }
    return false;
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
    for(const q of this.players)if(q!==exclude&&!q.done&&q.pos[0]===d[0]&&q.pos[1]===d[1])return q;
    return null;
  }
  adjOpp(p){const out=this.players.filter(q=>q!==p&&!q.done&&man(p.pos,q.pos)<=1);this.shuffle(out);return out;}
  tradeOpp(p){if(this.cfg.parley)return this.players.filter(q=>q!==p&&!q.done);
    return this.players.filter(q=>q!==p&&!q.done&&man(p.pos,q.pos)<=1);}
  doDock(p,port){
    const ing=port,k=port; // ports are identified by ingredient name
    if(this.cfg.singleDock&&this.dockOccupiedBy(ing,p))return false;
    if(!this.cfg.unlimitedDock&&p.firstFlip.has(k)&&p.dockedNow.has(k))return false;
    p.firstFlip.add(k);p.dockedNow.add(k);p.justDocked=true;
    // notes/edits NARR-07: an empty island has nothing to flip FOR — heads can't win a crate that
    // isn't there and tails can't buy one either, so both outcomes were already just "+3🌕". Skip
    // the flip entirely and take the 3. NOTE: this consumes one fewer RNG call than before, so the
    // same seed no longer produces the same game as it did pre-change (an intended rules change,
    // but it does mean pre-existing saved seeds/replays won't reproduce their old outcomes).
    if(this.tokens[ing]<=0){p.coins+=3;this.ev({t:"dock",p:p.idx,ing,got:"empty"});return true;}
    if(this.flip(p)){
      this.tokens[ing]--;p.ing.push(ing);this.ev({t:"dock",p:p.idx,ing,heads:1,got:"ing"});
    }else{
      if(this.cfg.dockBuy&&p.coins>=3&&this.needs(p).includes(ing)){
        p.coins-=3;this.tokens[ing]--;p.ing.push(ing);this.ev({t:"dock",p:p.idx,ing,heads:0,got:"bought"});}
      else{p.coins+=3;this.ev({t:"dock",p:p.idx,ing,heads:0,got:"coins"});}
    }
    return true;
  }
  // NARR-04: record this round's wind and return how many rounds running it has held that
  // direction. Called once per round, right after the direction is rolled.
  noteWind(dir){
    this.windStreak=(this.windPrev===dir)?(this.windStreak||1)+1:1;
    this.windPrev=dir;
    return this.windStreak;
  }
  cnt(arr,x){return arr.filter(v=>v===x).length;}
  // non-mutating lookup shared by tryTrade (which executes it) and scoreTrade (which just needs
  // to know whether a trade is on the table this turn, and how good it is)
  tradeCandidate(p){
    // notes/edits AI-03: don't just grab the first willing captain in seat order. Rank them —
    // prefer a mutual swap over a cash buy, and within each prefer the partner who holds the MOST
    // of the resource we need (a bot sitting on 2 spare beats one with a single crate). That fixes
    // "I had one resource and another bot had two of it, and the bot traded with the wrong one".
    let bestSwap=null,bestBuy=null;
    for(const q of this.tradeOpp(p)){
      if(q.strategy==="human")continue; // bots never auto-trade with humans; humans initiate via Parley
      const give=p.ing.filter(i=>this.needs(q).includes(i)&&this.cnt(p.ing,i)>(p.recipe.includes(i)?1:0));
      const get=q.ing.filter(i=>this.needs(p).includes(i)&&this.cnt(q.ing,i)>(q.recipe.includes(i)?1:0));
      if(give.length&&get.length){
        const ge=get[0],held=this.cnt(q.ing,ge);
        if(!bestSwap||held>bestSwap.held)bestSwap={q,kind:"swap",gi:give[0],ge,held};
      }else if(get.length){
        const ge=get[0],held=this.cnt(q.ing,ge);
        const price=(q.strategy==="monopolist"&&ge===q.corner)?5:4; // monopolists gouge
        if(p.coins>=price&&(!bestBuy||held>bestBuy.held))bestBuy={q,kind:"buy",ge,price,held};
      }
    }
    return bestSwap||bestBuy||null;
  }
  tryTrade(p){
    const c=this.tradeCandidate(p);
    if(!c)return false;
    if(c.kind==="swap"){
      const{q,gi,ge}=c;
      p.ing.splice(p.ing.indexOf(gi),1);q.ing.push(gi);
      q.ing.splice(q.ing.indexOf(ge),1);p.ing.push(ge);
      this.trades++;if(this.cfg.tradeBonus){p.coins++;q.coins++;}
      this.ev({t:"trade",a:p.idx,b:q.idx,gave:gi,got:ge,kind:"swap"});return true;
    }
    const{q,ge,price}=c;
    q.ing.splice(q.ing.indexOf(ge),1);p.ing.push(ge);
    p.coins-=price;q.coins+=price;this.trades++;if(this.cfg.tradeBonus){p.coins++;q.coins++;}
    this.ev({t:"trade",a:p.idx,b:q.idx,gave:price+" coins",got:ge,kind:"buy"});return true;
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
  // unweighted-cost port of the free reachable() UI helper, using this.* instead of the global
  // game singleton, so headless battle() can find a legal flee square with the same fidelity.
  reachableFrom(p){
    const budget=this.sailBudget(p);
    const best={[p.pos[0]+","+p.pos[1]]:0},frontier=[[p.pos,0]],out=[];
    while(frontier.length){
      let mi=0;
      for(let i=1;i<frontier.length;i++)if(frontier[i][1]<frontier[mi][1])mi=i;
      const [c,cost]=frontier.splice(mi,1)[0],k=c[0]+","+c[1];
      if(cost>best[k])continue;
      const isStart=c[0]===p.pos[0]&&c[1]===p.pos[1];
      if(!isStart){
        const occupied=this.players.some(q=>q!==p&&!q.done&&q.pos[0]===c[0]&&q.pos[1]===c[1]);
        if(!occupied)out.push(c);
      }
      if(this.onRim(c)&&!isStart)continue;
      for(const dk of Object.keys(DIRS)){
        const dd=DIRS[dk];
        const o=[c[0]+dd[0],c[1]+dd[1]],ok=o[0]+","+o[1];
        if(this.blocked(o))continue;
        if(this.islands[o]!==undefined||this.isHome(o))continue;
        const nc=cost+windStepCost(this.windNow,dk);
        if(nc>budget)continue;
        if(best[ok]!==undefined&&best[ok]<=nc)continue;
        best[ok]=nc;
        frontier.push([o,nc]);
      }
    }
    return out;
  }
  battle(att,def){
    const c=this.cfg,need=2;
    if(c.powder){if(att.coins<c.powder)return null;att.coins-=c.powder;}
    this.battles++;
    let a=0,d=0;
    // notes/edits BATL-01/02: reflips are gone — no attacker broadside reflip, no downwind free
    // reflip. The wind still matters, but only through the both-HEADS tiebreak: the downwind fighter
    // wins a round where both land heads (crosswind cancels). `downwind` is purely geometric and
    // never consumed. Kept in step with asyncBattle.
    let downwind=null;
    {
      const dx=def.pos[0]-att.pos[0],dy=def.pos[1]-att.pos[1];
      const dirAtoD=Object.keys(DIRS).find(k=>DIRS[k][0]===dx&&DIRS[k][1]===dy);
      const dirDtoA=Object.keys(DIRS).find(k=>DIRS[k][0]===-dx&&DIRS[k][1]===-dy);
      if(this.windNow===dirAtoD)downwind="a";
      else if(this.windNow===dirDtoA)downwind="d";
    }
    const rounds=[];
    let fled=false,flips=0;
    while(a<need&&d<need){
      let ah=this.flip(att),dh=this.flip(def);flips+=2;
      let scorer=null;
      if(ah&&dh){if(downwind==="a"){a++;scorer="a";}else if(downwind==="d"){d++;scorer="d";}}
      else if(ah){a++;scorer="a";} else if(dh){d++;scorer="d";}
      rounds.push([ah?1:0,dh?1:0,0,scorer]);
      // double-tails: the battle is still undecided here, so the defender may pay 1 coin to flee
      // — a bot flees iff currently behind on points, same rule as asyncBattle's bot branch.
      const bothTails=!ah&&!dh;
      if(bothTails&&a<need&&d<need&&def.coins>=1&&d<a){
        const cells=this.reachableFrom(def);
        if(cells.length){
          def.coins--;
          def.pos=cells.reduce((best,cc)=>man(cc,att.pos)>man(best,att.pos)?cc:best,cells[0]);
          this.tradewind(def);
          fled=true;
          this.recordSkirmish(att,def,null);
          this.ev({t:"battleflee",a:att.idx,d:def.idx,rounds,flips,downwind});
          break;
        }
      }
    }
    if(fled)return null;
    const win=a>=need?att:def,lose=a>=need?def:att;
    if(win===att)this.attWins++;
    let spoil,spoilIng=null;
    if(c.asym&&lose===att){
      const take=Math.min(2,lose.coins);lose.coins-=take;win.coins+=take;spoil=take+"c (raider)";
    }else{
      const wanted=lose.ing.filter(i=>this.needs(win).includes(i));
      if(lose.coins>=5&&!wanted.length){lose.coins-=5;win.coins+=5;spoil="5 coins";}
      else if(wanted.length){const i=wanted[0];lose.ing.splice(lose.ing.indexOf(i),1);win.ing.push(i);spoil=ilabelImg(i);spoilIng=i;}
      else if(lose.ing.length){const i=lose.ing[0];lose.ing.splice(lose.ing.indexOf(i),1);win.ing.push(i);spoil=ilabelImg(i);spoilIng=i;}
      else{const take=Math.min(5,lose.coins);lose.coins-=take;win.coins+=take;spoil=take+" coins (all they had)";}
    }
    // notes/edits BATL-03: the winning attacker no longer seizes the loser's square. Nobody moves.
    // The old swap dropped the just-beaten defender right in front of the winner — the prime spot to
    // get re-attacked next turn. With no swap there's also no new berth to re-dock into, so the old
    // post-battle auto-dock is gone too.
    this.recordSkirmish(att,def,lose,spoilIng);
    this.ev({t:"battle",a:att.idx,d:def.idx,rounds,winner:win.idx,spoil,spoilIng,flips,downwind});
    return win;
  }
  chooseTarget(p){
    const needs=this.needs(p);
    if(!needs.length)return this.home; // recipe done — go win
    if(p.strategy==="monopolist"&&p.corner&&this.tokens[p.corner]>0)
      return this.islandOf[p.corner]; // corner the market first
    let cands=needs.filter(i=>this.tokens[i]>0).map(i=>this.islandOf[i]);
    if(this.cfg.merchant&&(p.strategy==="trader"||p.strategy==="balanced")){
      let extra=this.ings.filter(i=>!needs.includes(i)&&!p.ing.includes(i)&&this.tokens[i]>0&&
        this.players.some(q=>q!==p&&!q.done&&this.needs(q).includes(i))).map(i=>this.islandOf[i]);
      if(cands.length){const best=Math.min(...cands.map(c=>man(p.pos,c)));
        extra=extra.filter(c=>man(p.pos,c)+3<=best);}
      cands=cands.concat(extra);
    }
    if(!cands.length){
      const holders=this.players.filter(q=>q!==p&&!q.done&&q.ing.some(i=>needs.includes(i)));
      if(holders.length){holders.sort((x,y)=>man(p.pos,x.pos)-man(p.pos,y.pos));return holders[0].pos;}
      return this.home;
    }
    cands.sort((x,y)=>man(p.pos,x)-man(p.pos,y));return cands[0];
  }
  canDock(p,port){
    if(this.cfg.singleDock&&this.dockOccupiedBy(port,p))return false;
    if(!this.cfg.unlimitedDock&&p.firstFlip.has(port)&&p.dockedNow.has(port))return false;
    return true;
  }
  // How worth fighting is this specific adjacent opponent, right now, to this bot? Replaces the
  // old wantsAttack's fixed strategy-vs-trigger table with a score so attacking only wins out
  // when it's genuinely the best move available (see chooseAction) — not just because a bot is
  // pirate-flavored and someone nearby has 5 coins. `rich` is the ONLY term gated by coolUntil:
  // a real steal (contested resource) or a dock blockade are legitimate, self-limiting reasons to
  // keep fighting the same target, but raw greed against the same neighbor is what produced the
  // endless-duel bug, so only that term cools off after a fight.
  scoreAttack(p,q,activeGrudge){
    const need=this.needs(p);
    // don't count re-stealing the exact crate q just took from us as a steal reason — that's
    // the hot-potato loop (see recordSkirmish); everything else q holds still counts normally
    const justLostToQ=(p.justLost&&p.justLost.by===q.idx&&p.justLost.until>=this.round)?p.justLost.ing:null;
    const stealCount=q.ing.filter(i=>need.includes(i)&&i!==justLostToQ).length;
    const blocking=this.cfg.singleDock&&need.some(ing=>this.tokens[ing]>0&&this.dockOccupiedBy(ing)===q);
    const cornering=p.strategy==="monopolist"&&p.corner&&
      (this.dockOccupiedBy(p.corner)===q||q.ing.includes(p.corner));
    const iHoldSomethingTheyWant=p.ing.some(i=>this.needs(q).includes(i));
    const urgency=p.recipe.length?1-need.length/p.recipe.length:0;
    const onCooldown=(p.coolUntil[q.idx]||0)>=this.round;
    const grudge=activeGrudge&&activeGrudge.against===q.idx&&activeGrudge.expires>=this.round;
    // AI-02: is this bot firing downwind (edge) or upwind (handicap) on this adjacent target? Only
    // meaningful for an adjacent q, which is all scoreAttack is ever handed. Positions don't change
    // mid-battle, so this reading holds for the whole fight (matches battle()'s downwind logic).
    const dx=q.pos[0]-p.pos[0],dy=q.pos[1]-p.pos[1];
    const dirPtoQ=Object.keys(DIRS).find(k=>DIRS[k][0]===dx&&DIRS[k][1]===dy);
    const firesDownwind=dirPtoQ&&this.windNow===dirPtoQ;
    const firesUpwind=dirPtoQ&&this.windNow===OPPOSITE[dirPtoQ];
    let s=0;
    s+=stealCount?AW.steal*(1+AW.stealStack*(stealCount-1)):0;
    s+=onCooldown?0:AW.rich*Math.min(q.coins,AW.richCap);
    s+=blocking?AW.blockBonus:0;
    s+=cornering?AW.cornerBonus:0;
    s-=iHoldSomethingTheyWant?AW.riskPenalty*(1+urgency):0;
    s+=grudge?AW.grudgeBonus:0;
    s+=firesDownwind?AW.windAdv:0;
    s-=firesUpwind?AW.windDis:0;
    // AI-06: escalating rematch brake — 0 for the first fight with this ship, growing with each
    // recent rematch, so a persistent grudge-duel prices itself below fishing/docking and breaks.
    s-=AW.rematchEscalate*this.recentFights(p,q);
    return s*PERSONALITY[p.strategy].attackMult;
  }
  scoreTrade(p){
    const c=this.tradeCandidate(p);
    if(!c)return-Infinity;
    let s=TW.base+(c.kind==="swap"?TW.swapBonus:0);
    // a rusher hates spending a turn haggling over anything it could've used itself, even a
    // legal spare — every non-sailing turn is opportunity cost to a rusher
    if(p.strategy==="rusher"&&c.kind==="swap"&&p.recipe.includes(c.gi))s*=TW.rusherRecipeGuard;
    return s*PERSONALITY[p.strategy].tradeMult;
  }
  scoreDock(p,port){
    if(!port||!this.canDock(p,port))return-Infinity;
    const stocked=this.tokens[port]>0;
    let s=DW.fallback; // legal dock nets ~3 coins even empty — same tier as fishing, never a dead end
    if(p.strategy==="monopolist"&&port===p.corner&&stocked)s+=DW.monopolistCornerBonus;
    else if(this.needs(p).includes(port)&&stocked){
      s+=DW.neededBonus;
      // #7: this crate is one of the last 1–2 you need — grabbing it (racing toward the win) should
      // beat picking a fight, so bump it hard when the recipe is nearly done.
      if(this.needs(p).length<=1)s+=DW.finisherBonus;
    }
    else if(this.cfg.merchant&&stocked&&!p.ing.includes(port)&&
      this.players.some(q=>q!==p&&!q.done&&this.needs(q).includes(port)))s+=DW.surplusBonus;
    return s*PERSONALITY[p.strategy].dockMult;
  }
  scoreFish(p){return FISH_BASE*PERSONALITY[p.strategy].fishMult;}
  // the scored replacement for the old fixed trade→attack→dock→fish if-chain: evaluate every
  // viable action this turn and take the best one, so a bot's choice actually reflects the
  // stakes in front of it instead of a hardcoded priority order
  chooseAction(p){
    // one-shot: consumed here no matter what gets picked, so a grudge can never accumulate
    // turn over turn the way the old unthrottled "rich" trigger did
    const activeGrudge=p.grudge;p.grudge=null;
    const opts=[];
    // notes/edits AI-01: never pick a fight once the recipe is already complete — with a full hold
    // the only job left is to sail home and bake, and a battle only risks losing a crate you need.
    // (Pre-BATL-03 this also avoided the winner-swap dragging a finished bot off Tortuga; that swap
    // is gone now, but dropping attack when win-ready is still the right call.)
    const winReady=!this.needs(p).length;
    if(p.strategy!=="rusher"&&p.coins>=this.cfg.powder&&!winReady)
      for(const q of this.adjOpp(p))
        opts.push({type:"attack",target:q,score:this.scoreAttack(p,q,activeGrudge)});
    opts.push({type:"trade",score:this.scoreTrade(p)});
    const port=this.adjPort(p);
    if(port)opts.push({type:"dock",ing:port,score:this.scoreDock(p,port)});
    opts.push({type:"fish",score:this.scoreFish(p)});
    const viable=opts.filter(o=>o.score>-Infinity);
    const best=Math.max(...viable.map(o=>o.score));
    let top=viable.filter(o=>o.score>=best-1e-9);
    if(top.length>1){
      const attacks=top.filter(o=>o.type==="attack");
      if(PERSONALITY[p.strategy].tieBully&&attacks.length>1){
        attacks.sort((x,y)=>(x.target.coins+x.target.ing.length)-(y.target.coins+y.target.ing.length));
        return attacks[0];
      }
      this.shuffle(top);
    }
    return top[0];
  }
  takeTurn(p,windDir,storm){
    this.ev({t:"turn",p:p.idx});
    // wind no longer force-moves anyone on a normal turn (see #7) — only storms still shove
    // ships around; a normal turn's wind only shapes this player's own sail budget below
    if(storm){
      const before=[...p.pos];
      const wasDocked=this.adjPort(p)!==null;
      // D-15: mirrors src/ui/flow.js:556-567's live bot storm block exactly — both gusts, one
      // shared dodgedOnce, so a second leg that also hits land is a free pass on an already-paid
      // anchor rather than a fresh charge.
      const dodgedOnce={v:false};
      this.windPush(p,DIRS[windDir],2,dodgedOnce);
      this.windPush(p,DIRS[this.windNow2],2,dodgedOnce);
      p.justDocked=false;
      if(p.pos[0]!==before[0]||p.pos[1]!==before[1])this.ev({t:wasDocked?"blownOut":"windmove",p:p.idx});
      if(p.shipwrecked){p.shipwrecked=false;return;} // no coins, no crates, no move — repairs eat the turn
    }
    const port0=this.adjPort(p);
    if(!port0)p.dockedNow.clear();
    let target=this.chooseTarget(p);
    if(p.strategy==="pirate"&&this.needs(p).length){
      const prey=this.players.filter(q=>q!==p&&!q.done&&q.ing.some(i=>this.needs(p).includes(i)));
      if(prey.length){prey.sort((x,y)=>man(p.pos,x.pos)-man(p.pos,y.pos));
        if(man(p.pos,prey[0].pos)<man(p.pos,target))target=prey[0].pos;}
    }
    const dist=man(p.pos,target);
    const exact=this.dockCells.has(target[0]+","+target[1]);
    if((dist>1||(dist===1&&exact))&&p.coins>0){
      p.coins--;const b=[...p.pos];this.stepToward(p,target,this.sailBudget(p));
      const moved=(p.pos[0]!==b[0]||p.pos[1]!==b[1]);
      // AI-05: stepToward found no ordinary move. If we're genuinely walled in, spend the coin on a
      // trade-wind escape instead of sitting still; otherwise refund it (we were already in place).
      if(moved)this.ev({t:"sail",p:p.idx});
      else if(this.boxedIn(p)&&this.rimEscape(p)){/* rim sweep already recorded its own event */}
      else p.coins++;
    }
    if(!this.adjPort(p))p.dockedNow.clear(); // leaving a port re-arms its dock flip
    const action=this.chooseAction(p);
    if(action.type==="attack"){if(!this.tryTrade(p))this.battle(p,action.target);return;}
    if(action.type==="trade"){this.tryTrade(p);return;}
    if(action.type==="dock"){if(this.doDock(p,action.ing))return;}
    // fallback: fish regardless of purse size — otherwise a bot with nothing left to dock,
    // trade, or attack for (its one remaining need fully depleted and unheld by anyone) just
    // sits there forever, never taking any action at all
    {const h=this.flip(p);
      if(h)p.coins+=2;else if(this.cfg.sardine)p.coins+=1;
      this.ev({t:"fish",p:p.idx,heads:h?1:0});}
  }
  checkFinish(p){
    if(!this.needs(p).length&&man(p.pos,this.home)<=1){
      p.done=true;this.finishOrder.push(p.idx);this.ev({t:"finish",p:p.idx});
      // the "final round!" announcement + wind re-spin are handled by the caller (runLiveNet),
      // which alone knows the live turn order and can pause the whole crew for it (see #19).
      return true;}
    return false;
  }
  play(){
    let order=this.players.map((_,i)=>i);
    this.shuffle(order);
    while(this.round<150){
      this.round++;
      const wind="NSEW"[Math.floor(this.r()*4)];
      const storm=rollStorm(this); // #1a
      // D-15: roll the second gust's direction the instant the round knows it's stormy, at the
      // exact point src/orchestrator.js:681-683 draws it — one extra RNG draw, right after
      // rollStorm and before anything else touches the seed this round, so live play and the
      // headless simulator consume it identically from here forward.
      this.windNow2=storm?PERP[wind][Math.floor(this.r()*2)]:null;
      this.windNow=wind;this.stormNow=storm;
      this.ev({t:"newround",dir:wind,windStreak:this.noteWind(wind)}); // NARR-04
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
            return this.resolveEnd();
          }
        }
      }
    }
    return this.resolveEnd();
  }
  resolveEnd(){
    if(!this.finishOrder.length){this.ev({t:"end",winner:null});return null;}
    if(this.finishOrder.length===1){this.winner=this.finishOrder[0];this.ev({t:"end",winner:this.winner});return this.winner;}
    let champ=this.players[this.finishOrder[0]];
    for(const idx of this.finishOrder.slice(1)){
      const ch=this.players[idx];let a=0,d=0;const bneed=3;
      while(a<bneed&&d<bneed){const ah=this.flip(champ),dh=this.flip(ch);
        if(ah&&dh){}else if(ah)a++;else if(dh)d++;}
      const w=a>=bneed?champ:ch;
      this.ev({t:"bakeoff",a:champ.idx,b:ch.idx,winner:w.idx});
      champ=w;
    }
    this.winner=champ.idx;this.ev({t:"end",winner:this.winner});return this.winner;
  }
}

// Fixed "Round World" ruleset (the recommended big-game preset), sized to the player count.
function roundCfg(strategies){
  const np=strategies.length;
  // 2-player games with only 1 crate per island just deadlock — the two ships battle forever over
  // the single crate (#10). Give 2p unlimited, never-drying islands (1e9 is the existing "endless
  // supply" sentinel — guarded as crates<1e9 everywhere, and islands then render as always-full).
  const crates=np===2?1e9:Math.max(1,np-1);
  return {grid:15,nIslands:7,recipeSize:5,crates,startCoins:3,
    powder:2,dockBuy:true,merchant:true,parley:true,tradeBonus:true,
    asym:false,storm:0.125,islandW:2,islandH:2,tetris:true,singleDock:true,
    sardine:true,roundBoard:true,unlimitedDock:true,strategies};
}

export { rollStorm, PERSONALITY, AW, TW, DW, FISH_BASE, Game, roundCfg };
