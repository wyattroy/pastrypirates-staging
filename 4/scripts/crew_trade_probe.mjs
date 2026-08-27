/* crew_trade_probe.mjs — what a multi-captain trade COSTS, measured in a real crew room.
 *
 * Phase 05 Task 1. Built on mp_rig.mjs (the reusable two-window rig) because every multiplayer
 * question since 02.2 needs the same apparatus and re-deriving it has cost real nights.
 *
 * WHAT IT MEASURES, and why each one is here:
 *   - wall clock from the `openoffer` event to the settlement narration;
 *   - THE LONGEST UNBROKEN SPAN ANY ONE SCREEN HELD A "…is deciding…" LINE. That is criterion 3's
 *     actual subject, not the total duration: ask() broadcasts that line with {wait:true}, and a
 *     wait line registers NO dismissal deadline (DISPLAY-RULES §2), so it stands for the whole
 *     chain while every other captain reads it.
 *   - the number of prompt round trips, counted as WRITES to rooms/<CODE>/prompt by a listener on
 *     the host — not inferred from anything;
 *   - appState.dlog.length before and after, which is the routing-dependent log length the
 *     stepper produces and the slider does not.
 *
 * THE RESPONDERS' THINKING TIME IS HELD CONSTANT (--delay, default 3000ms) so the figure measures
 * the PLUMBING and not the driver's luck. Every duration is quoted beside that delay or it means
 * nothing.
 *
 * RED-PROOF, BEFORE ANY LONG TIME IS BELIEVED (HARD-WON-LESSONS §2). `--holders=1` runs the same
 * stopwatch against a hail with exactly ONE human holder and must report roughly the fixed delay
 * plus overhead. A stopwatch that has never been seen to report a SHORT time cannot be trusted
 * when it reports a long one.
 *
 * HOW THE TRADE IS REACHED — POSED, NOT PLAYED (DRIVING-THE-GAME §5e; feedback_record_at_phone_size).
 * A bot hails ~2.45 times a GAME, so waiting for one is minutes of driving for one sample. Instead:
 *   1. drive until the HOST's own action prompt is up. The turn loop is then parked inside a LOCAL
 *      ask() — localAsk, which never touches rooms/<CODE>/prompt — so the singular prompt channel
 *      is FREE and nothing will clobber the trade's own prompts.
 *   2. pose the holds so the crates in the offer exist where they need to be, VALIDATED AGAINST THE
 *      ENGINE'S OWN CONSTANTS (g.ings) — a fixture that cannot exist in the game proves nothing
 *      (HARD-WON-LESSONS §3, the lemon).
 *   3. stub botOpenOffer for exactly ONE call so WHAT is offered is controlled, then restore it.
 *      botOpenTradeLive then runs its real body: noteDemand, the openoffer event, the answering
 *      loop, counterTerms, settleTrade. ONLY THE PROPOSER IS POSED; everything this phase changes
 *      is real. This is a PROBE, not a game change — no bot's decision-making is altered, and hail
 *      VOLUME is never measured here. That is trade_offer_measure.js's job, headless, and it is
 *      the only number allowed to speak for invariant I1 (TRADE-SYSTEM §0).
 *   In --mode=human the host's own Trade action is driven instead, with no stub at all.
 *
 * Every rejection is caught and printed. HARD-WON-LESSONS §1b: a throw in the turn chain rejects a
 * promise the awaiting chain swallows, so THE CONSOLE IS CLEAN WHILE THE GAME IS DEAD.
 *
 * Hygiene (rule 17): headless, --mute-audio, its own ports, every loop bounded, the room deleted
 * and every process killed on every exit path including a throw. Never driven to an end of voyage
 * (writeGameLog's rows are permanent and unremovable by anyone, Wyatt included).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = k => process.argv.includes(`--${k}`);

const OUT = path.resolve(arg("out", "/tmp/crew-trade-probe"));
fs.mkdirSync(OUT, { recursive: true });
/* mp_rig.mjs reads $MP_RIG_SHOTS at MODULE-EVAL time, so the env has to be set before the import is
   evaluated — a static import would have run first and every screenshot would have landed in
   ./mp-rig-shots instead of --out, silently (04-01's own instrument failure 4). */
process.env.MP_RIG_SHOTS = OUT;
const { serve, launch, attach, makeHost, makeGuest, killAll, sleep } = await import("./mp_rig.mjs");

const PORT = +arg("port", 8841);
const DBG = [+arg("dbg", 9841), +arg("dbg2", 9842), +arg("dbg3", 9843)];
const HOLDERS = +arg("holders", 2);              // how many HUMAN holders answer the hail
const DELAY = +arg("delay", 3000);               // the fixed responder thinking time
const COUNTER = arg("counter", "");              // "" | "crate" | "coins"
/* HOW MUCH COIN THE COUNTERING CAPTAIN ASKS FOR. "max" is the most expensive counter there is and
   a bot will refuse it on its own arithmetic (tryTrade only takes a counter that still beats
   fetching the crate the hard way) — measured on the first t2 run: a perfectly transmitted
   "Crystal Sugar + 8 coins instead" ended in a parley, which proves the WIRE and proves nothing
   about SETTLEMENT. A small number is what reaches settleTrade. */
const COINS = arg("coins", "2");                 // "max" | an integer
const DROP = has("drop-mid-round");
const SAMPLE_MS = 200;

const LOGF = path.join(OUT, "log.txt");
try { fs.unlinkSync(LOGF); } catch {}
const log = (...a) => { const s = a.join(" "); console.log(s); fs.appendFileSync(LOGF, s + "\n"); };

const out = {
  counter: COUNTER || "none", counterCoins: COINS, holders: HOLDERS, responderDelayMs: DELAY,
  sampleIntervalMs: SAMPLE_MS, startedAt: new Date().toISOString(), steps: [], notes: []
};
let H = null, Gs = [], room = null, base = null;
const alive = [];

/* ================= the in-page recorder — installed identically on every client ================= */
/* Samples what is RENDERED. The narration bubble is `.pp4Bub:not(.out) .pp4BubIn` (stage.js:1143);
   `.apMsg` is sampled too because showNarration falls back to the panel when the stage bridge is
   absent, and because the PROMPT's own text lives there. Never offsetParent — it is null for every
   position:fixed element and has condemned a working screen in this project before. */
const RECORDER = (ms) => `(()=>{
  if(window.__tp&&window.__tp.timer)clearInterval(window.__tp.timer);
  window.__tp={t0:Date.now(),samples:[],timer:null,err:null};
  const T=window.__tp;
  const txt=el=>el?(el.textContent||'').replace(/\\s+/g,' ').trim():'';
  T.timer=setInterval(()=>{
    try{
      const bub=txt(document.querySelector('.pp4Bub:not(.out) .pp4BubIn'));
      const apMsg=txt(document.querySelector('#actionPanel .apMsg'));
      const sl=document.querySelector('#actionPanel .apSlider');
      const st=(()=>{try{return __pp_app_state_debug()}catch(e){return{}}})();
      const g=st.game||{};
      T.samples.push({
        ms:Date.now()-T.t0,
        bub:bub.slice(0,90), apMsg:apMsg.slice(0,90),
        deciding:/is deciding/i.test(bub)||/is deciding/i.test(apMsg),
        btns:[...document.querySelectorAll('#actionPanel .apBtn')].map(b=>(b.textContent||'').trim().slice(0,22)),
        slider: sl?{min:+sl.min,max:+sl.max,value:+sl.value,
          out:txt(document.querySelector('#actionPanel .apSliderOut')),
          wrap:!!document.querySelector('#actionPanel .apSliderWrap')}:null,
        events:(g.events||[]).length,
        lastEv:(()=>{const e=(g.events||[]);const l=e[e.length-1];return l?l.t:null})(),
        dlogLen:(st.dlog||[]).length
      });
      if(T.samples.length>6000)T.samples.shift();
    }catch(e){T.err=String(e&&e.message).slice(0,120);}
  },${ms});
  return 'recorder up';
})()`;

const RECORDER_OFF = `(()=>{if(window.__tp&&window.__tp.timer){clearInterval(window.__tp.timer);window.__tp.timer=null;}return window.__tp?window.__tp.samples.length:0})()`;
const RECORDER_DUMP = `JSON.stringify(window.__tp?window.__tp.samples:[])`;

/* ================= the prompt-write counter, on the host ================= */
/* Counts WRITES to rooms/<CODE>/prompt. Live Firebase listener, not polling (DRIVING-THE-GAME §5d),
   and DETACHED at the end — a leaked listener keeps firing into a page that otherwise accounts for
   every watcher it owns, and net_contract_check.js cannot see one attached from a console. */
const PROMPT_WATCH = `(async()=>{
  const st=__pp_app_state_debug();
  if(!st.db||!st.room)return 'no room';
  if(window.__tpP&&window.__tpP.stop)window.__tpP.stop();
  window.__tpP={t0:Date.now(),writes:[],ids:{}};
  const P=window.__tpP;
  const ref=st.db.ref('rooms/'+st.room+'/prompt');
  const cb=s=>{const v=s.val();
    P.writes.push({ms:Date.now()-P.t0,id:(v&&v.id)||null,kind:(v&&v.kind)||null,seat:v&&v.seat,
      msg:(v&&String(v.msg||'').replace(/<[^>]*>/g,'').slice(0,70))||null,
      nOpts:(v&&v.labels)?v.labels.length:0,
      slider:!!(v&&v.slider)});
    if(v&&v.id)P.ids[v.id]=1;};
  ref.on('value',cb);
  P.stop=()=>{ref.off('value',cb);};
  return 'prompt watch up';
})()`;
const PROMPT_DUMP = `JSON.stringify(window.__tpP?{writes:window.__tpP.writes,distinct:Object.keys(window.__tpP.ids).length}:{writes:[],distinct:0})`;
const PROMPT_OFF = `(()=>{if(window.__tpP&&window.__tpP.stop){window.__tpP.stop();return 'detached'}return 'none'})()`;

/* ================= the responder — a HUMAN HOLDER answering at a FIXED delay ================= */
/* Holds thinking time constant so the measurement is of the plumbing. It also SPECIAL-CASES THE
   STEPPER, deliberately: a first-live-button driver oscillates +1 / -1 forever on the remote +/-
   fallback and never reaches the confirm (project_mp_rig). Counting its taps is how this run puts
   that hazard on the record before Task 3 deletes the control that causes it. */
const RESPONDER = (mode, delay, coins) => `(()=>{
  if(window.__tr&&window.__tr.timer)clearInterval(window.__tr.timer);
  window.__tr={mode:${JSON.stringify(mode)},delay:${delay},coins:${JSON.stringify(coins)},
               acts:[],seenAt:0,lastKey:'',
               stepperTaps:0,sliderSets:0,timer:null,err:null,phase:'idle'};
  const R=window.__tr;
  const live=b=>b.getAttribute('aria-disabled')!=='true'&&b.disabled!==true&&b.getBoundingClientRect().width>4;
  const byText=(bs,re)=>bs.find(b=>re.test((b.textContent||'').trim()));
  R.timer=setInterval(()=>{
    try{
      const panel=document.getElementById('actionPanel');
      if(!panel)return;
      const msg=((panel.querySelector('.apMsg')||{}).textContent||'').replace(/\\s+/g,' ').trim();
      const all=[...panel.querySelectorAll('.apBtn')];
      const bs=all.filter(live);
      const sl=panel.querySelector('.apSlider');
      if(!bs.length&&!sl){R.lastKey='';return;}
      const key=msg.slice(0,70)+'|'+all.length+'|'+(sl?('S'+sl.value):'');
      if(key!==R.lastKey){R.lastKey=key;R.seenAt=Date.now();return;}
      if(Date.now()-R.seenAt<R.delay)return;

      // ---- the COIN control. SLIDER: one drag, one confirm. ----
      if(sl){
        const target=R.coins==='max'?+sl.max:Math.max(+sl.min,Math.min(+sl.max,parseInt(R.coins,10)));
        R.target=target;
        if(+sl.value!==target){
          const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
          setter.call(sl,String(target));
          sl.dispatchEvent(new Event('input',{bubbles:true}));
          R.sliderSets++;R.acts.push({t:Date.now(),a:'SLIDE->'+target});
          R.seenAt=Date.now();R.lastKey='';return;
        }
        const go=bs.find(b=>b.classList.contains('primary'))||bs[0];
        if(go){R.acts.push({t:Date.now(),a:'CONFIRM-SLIDER "'+(go.textContent||'').trim().slice(0,18)+'" @'+sl.value});
          go.click();R.seenAt=Date.now();R.lastKey='';R.phase='answered';}
        return;
      }
      // ---- the COIN control. STEPPER: press + until it greys, THEN confirm. ----
      const plusAny=byText(all,/\\+\\s*1/);
      const conf=bs.find(b=>b.classList.contains('primary'));
      if(plusAny&&conf){
        /* THE STEPPER SPELLS ITS NUMBER OUT IN BUTTON PRESSES, so the probe pays for them the same
           way a captain does: one tap per coin. It counts ITS OWN CLICKS rather than parsing the
           prompt — the first attempt read the running total out of .apMsg and always saw zero,
           because the 🌕 in the wire payload is emojified into an <img> before it reaches the DOM
           and textContent no longer contains it. What the captain actually asked for is read off
           the SETTLEMENT at the end, which is the engine's own record and not the probe's. */
        const want=R.coins==='max'?Infinity:parseInt(R.coins,10);
        if(R.stepperTaps<want&&live(plusAny)){R.stepperTaps++;R.acts.push({t:Date.now(),a:'STEP+ #'+R.stepperTaps+' msg="'+msg.slice(0,52)+'"'});plusAny.click();
          R.seenAt=Date.now();R.lastKey='';return;}
        R.acts.push({t:Date.now(),a:'CONFIRM-STEPPER after '+R.stepperTaps+' taps, msg="'+msg.slice(0,52)+'"'});
        conf.click();R.seenAt=Date.now();R.lastKey='';R.phase='answered';return;
      }

      // ---- the CRATE PICKER of a counter ("what o' X will ye have instead?") ----
      if(/will ye have instead/i.test(msg)){
        let pick=null;
        if(R.mode==='counter-coins')pick=byText(bs,/Coin instead|Coin$/i);
        if(!pick)pick=bs.find(b=>!/Coin instead|Deny|Back|\\u2190|\\u2039/i.test(b.textContent||''));
        if(!pick)pick=bs.find(b=>!/Deny|Back|\\u2190|\\u2039/i.test(b.textContent||''));
        if(pick){R.acts.push({t:Date.now(),a:'CRATE "'+(pick.textContent||'').trim().slice(0,20)+'"'});
          pick.click();R.seenAt=Date.now();R.lastKey='';}
        return;
      }

      // ---- the ANSWER prompt: Accept / Ask for summat else / Deny ----
      const acc=byText(bs,/Accept/i), cnt=byText(bs,/summat else|Counter/i), den=byText(bs,/Deny/i);
      if(acc||cnt||den){
        let pick=acc;
        if(R.mode==='counter-crate'||R.mode==='counter-coins')pick=cnt||acc;
        if(R.mode==='deny')pick=den||acc;
        if(pick){R.acts.push({t:Date.now(),a:'ANSWER "'+(pick.textContent||'').trim().slice(0,22)+'"'});
          pick.click();R.seenAt=Date.now();R.lastKey='';R.phase='answering';}
        return;
      }
      // anything else on screen is not this responder's to answer
    }catch(e){R.err=String(e&&e.message).slice(0,140);}
  },250);
  return 'responder up ('+R.mode+', '+R.delay+'ms)';
})()`;
const RESPONDER_DUMP = `JSON.stringify(window.__tr?{acts:window.__tr.acts,stepperTaps:window.__tr.stepperTaps,sliderSets:window.__tr.sliderSets,err:window.__tr.err,phase:window.__tr.phase}:null)`;
const RESPONDER_OFF = `(()=>{if(window.__tr&&window.__tr.timer){clearInterval(window.__tr.timer);window.__tr.timer=null;return 'stopped'}return 'none'})()`;

/* ================= a generic one-tick driver, for getting the voyage open ================= */
const TICK = `(()=>{
  const coin=document.getElementById('flipCoinWrap');
  if(coin&&coin.classList.contains('active')&&coin.onclick){coin.onclick();return 'FLIP';}
  const card=[...document.querySelectorAll('#pp4Prompt .recipeCard,#actionPanel .recipeCard')]
    .filter(c=>c.getBoundingClientRect().width>10);
  if(card.length){card[0].click();return 'RECIPE';}
  const btl=[...document.querySelectorAll('.btlBtn')].filter(b=>b.getBoundingClientRect().width>4);
  if(btl.length){btl[0].click();return 'BTL';}
  const cells=[...document.querySelectorAll('.sailCell')];
  if(cells.length){cells[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));return 'SAIL';}
  const btns=[...document.querySelectorAll('#actionPanel .apBtn')]
    .filter(b=>!/back|\\u2190|\\u2039/i.test(b.textContent))
    .filter(b=>b.getAttribute('aria-disabled')!=='true'&&b.disabled!==true)
    .filter(b=>b.getBoundingClientRect().width>4);
  if(!btns.length)return null;
  /* PREFER THE COMMITTING BUTTON. Measured on the t2c run, which stalled for 240 seconds: without
     this line the driver takes the FIRST live button, which on the remote coin STEPPER is "- 1".
     The next tick finds "- 1" greyed at the floor and takes "+ 1"; the tick after that finds "- 1"
     live again. It oscillates +1 / -1 forever and never reaches "Offer it!" — the hazard
     project_mp_rig records, reproduced in this tree, with a host reading "test2 is deciding..." for
     four solid minutes behind it. mp_rig's own driver carries this fix; this TICK did not.
     Task 3 deletes the control that causes it, which is a benefit of that deletion, not its goal. */
  let pool=btns.filter(b=>!/anchor/i.test(b.textContent));
  if(!pool.length)pool=btns;
  /* ...and do not open a TRADE of our own while getting the voyage under way — this probe fires
     the hail it means to measure, and a second trade in flight is a second thing being measured. */
  const noTrade=pool.filter(b=>!/^\s*Trade/i.test(b.textContent||''));
  if(noTrade.length)pool=noTrade;
  const pick=pool.find(b=>b.classList.contains('primary'))||pool[0];
  const t=(pick.textContent||'').trim().slice(0,20);
  pick.click();return t;
})()`;

/* The parking phase must NOT answer the host's own action menu — that is the very prompt it is
   waiting for. Same tick, minus the action verbs. */
const TICK_NOACT = TICK.replace(
  "const pool=btns.filter(b=>!/anchor/i.test(b.textContent));",
  "const pool=btns.filter(b=>!/anchor|Pass|Sail|Dock|Trade|Attack/i.test(b.textContent));\n  if(!pool.length)return 'ACTION-MENU';");

const STATE = `JSON.stringify((()=>{const st=(()=>{try{return __pp_app_state_debug()}catch(e){return{}}})();
  const g=st.game||{};
  return {seat:st.mySeat,isHost:!!st.isHost,room:st.room||null,round:g.round,
    events:(g.events||[]).length,dlogLen:(st.dlog||[]).length,
    strategies:(g.players||[]).map(p=>p&&p.strategy),
    names:(g.players||[]).map(p=>p&&p.name),
    coins:(g.players||[]).map(p=>p&&p.coins),
    ing:(g.players||[]).map(p=>(p&&p.ing)?p.ing.slice():null),
    ings:g.ings||null,
    apMsg:(()=>{const e=document.querySelector('#actionPanel .apMsg');return e?(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,110):null})(),
    apBtns:[...document.querySelectorAll('#actionPanel .apBtn')].map(b=>(b.textContent||'').trim().slice(0,24)),
    apSub:(()=>{const e=document.querySelector('#actionPanel .apSub');return e?(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90):null})(),
    hasSlider:!!document.querySelector('#actionPanel .apSlider'),
    hasSliderWrap:!!document.querySelector('#actionPanel .apSliderWrap'),
    sliderOut:(()=>{const e=document.querySelector('#actionPanel .apSliderOut');return e?(e.textContent||'').trim():null})(),
    promptCls:(document.getElementById('pp4Prompt')||{}).className||null,
    bub:(()=>{const e=document.querySelector('.pp4Bub:not(.out) .pp4BubIn');return e?(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,110):null})()};})())`;

const state = async C => JSON.parse(await C.ev(STATE));

async function shotAll(name) {
  await H.shot(`${name}-host.png`);
  for (let i = 0; i < Gs.length; i++) if (alive[i]) await Gs[i].shot(`${name}-guest${i + 1}.png`);
}

async function pair(name, note) {
  const h = await state(H);
  const gs = [];
  for (let i = 0; i < Gs.length; i++) gs.push(alive[i] ? await state(Gs[i]) : { __closed: true });
  await shotAll(name);
  out.steps.push({ name, note: note || "", at: Date.now(), host: h, guests: gs });
  log(`\n--- ${name} ${note ? "(" + note + ")" : ""}`);
  log(`    HOST  apMsg="${(h.apMsg || "").slice(0, 78)}"`);
  log(`          btns=${JSON.stringify((h.apBtns || []).slice(0, 5))} slider=${h.hasSlider}/${h.hasSliderWrap}@${h.sliderOut} bub="${(h.bub || "").slice(0, 62)}"`);
  gs.forEach((g, i) => {
    if (g.__closed) return log(`    G${i + 1}    (tab closed)`);
    log(`    G${i + 1}    apMsg="${(g.apMsg || "").slice(0, 78)}"`);
    log(`          btns=${JSON.stringify((g.apBtns || []).slice(0, 5))} slider=${g.hasSlider}/${g.hasSliderWrap}@${g.sliderOut} bub="${(g.bub || "").slice(0, 62)}"`);
  });
  return { host: h, guests: gs };
}

/* ================= the pose ================= */
/* VALIDATED AGAINST THE ENGINE'S OWN CONSTANTS. A fixture that cannot exist in the game proves
   nothing (HARD-WON-LESSONS §3): every crate named here is read out of g.ings, never typed. */
const POSE = (holderSeats) => `(async()=>{
  const st=__pp_app_state_debug();const g=st.game;
  const holders=${JSON.stringify(holderSeats)};
  const ings=g.ings;
  if(!ings||ings.length<3)return JSON.stringify({err:'no ingredient list'});
  const want=ings[0];
  const asker=g.players.find(p=>p.strategy!=='human'&&holders.indexOf(p.idx)<0);
  if(!asker)return JSON.stringify({err:'no bot seat available as asker'});
  asker.coins=Math.max(asker.coins,8);
  const spare=ings.filter(i=>i!==want);
  /* One crate to GIVE, and TWO of a second so a crate counter asking for it is asking for a
     genuine SPARE. botOpenTradeLive prices a counter's crate at acquireTurns when it is the bot's
     last copy of something its own recipe wants, and at PLAN.leverageTurns (1.1) when it is spare —
     measured on the t2/t2b/t2c runs, where a perfectly transmitted counter was refused three times
     because the crate asked for was the asker's only one. A refusal is a legitimate answer; it is
     just not the SETTLEMENT this tracer has to see. */
  asker.ing=[spare[0],spare[1],spare[1]];
  for(const s of holders){const q=g.players[s];if(!q)return JSON.stringify({err:'no seat '+s});
    if(q.ing.indexOf(want)<0)q.ing=q.ing.concat([want]);
    q.coins=Math.max(q.coins,4);}
  // nobody ELSE holds it, so the hail reaches exactly the seats this run is measuring
  for(const q of g.players)if(holders.indexOf(q.idx)<0&&q!==asker)q.ing=q.ing.filter(i=>i!==want);
  const offer={want:want,giveIng:spare[0],giveCoins:3};
  const legal=ings.indexOf(offer.want)>=0&&ings.indexOf(offer.giveIng)>=0
    &&offer.giveCoins<=asker.coins&&asker.ing.indexOf(offer.giveIng)>=0
    &&asker.ing.filter(function(i){return i===spare[1]}).length===2
    &&asker.ing.indexOf(offer.want)<0;
  if(!legal)return JSON.stringify({err:'illegal fixture',offer:offer,askerIng:asker.ing,askerCoins:asker.coins});
  const heard=g.holdersOf(offer.want,asker).map(q=>q.idx);
  window.__tpPose={askerIdx:asker.idx,offer:offer,heard:heard};
  return JSON.stringify({ok:true,askerIdx:asker.idx,askerName:asker.name,offer:offer,heard:heard,
    holderStrategies:heard.map(i=>g.players[i].strategy),
    askerIng:asker.ing,askerCoins:asker.coins});
})()`;

/* Fire the REAL botOpenTradeLive with only the PROPOSER stubbed, for exactly one call.
   The rejection is caught and stringified: a throw here rejects a promise the awaiting chain
   swallows and the console stays clean while the game is dead (HARD-WON-LESSONS §1b). */
const FIRE = (baseUrl) => `(async()=>{
  const st=__pp_app_state_debug();const g=st.game;
  const P=window.__tpPose;if(!P)return 'no pose';
  const flow=await import('${baseUrl}src/ui/flow.js');
  const asker=g.players[P.askerIdx];
  const real=g.botOpenOffer.bind(g);
  let used=false;
  g.botOpenOffer=function(p){if(!used&&p===asker){used=true;return P.offer;}return real(p);};
  window.__tpFire={t0:Date.now(),state:'running',result:null,err:null};
  flow.botOpenTradeLive(asker).then(
    function(v){window.__tpFire.state='resolved';window.__tpFire.result=v;window.__tpFire.t1=Date.now();g.botOpenOffer=real;},
    function(e){window.__tpFire.state='REJECTED';window.__tpFire.err=String((e&&(e.stack||e.message))||e).slice(0,400);
        window.__tpFire.t1=Date.now();g.botOpenOffer=real;});
  return 'fired on seat '+P.askerIdx;
})()`;
const FIRE_STATE = `JSON.stringify(window.__tpFire||null)`;

/* What actually MOVED — read off the engine after settlement, so "the crate that moves is the crate
   they asked for" is a measurement and not a reading of the screen. */
const LEDGER = `JSON.stringify((()=>{const st=__pp_app_state_debug();const g=st.game;
  const P=window.__tpPose||{};
  return {askerIdx:P.askerIdx,offer:P.offer,
    ing:(g.players||[]).map(p=>(p&&p.ing)?p.ing.slice():null),
    coins:(g.players||[]).map(p=>p&&p.coins),
    tradeEvents:(g.events||[]).filter(e=>e&&(e.t==='trade'||e.t==='parley'||e.t==='openoffer')),
    dlog:(st.dlog||[]).slice()};})())`;

/* ================= analysis — read off the samples, no arithmetic of mine ================= */
function longestDecidingSpan(samples) {
  let best = 0, bestFrom = null, run = null;
  for (const s of samples) {
    if (s.deciding) { if (run === null) run = s.ms; }
    else if (run !== null) { const d = s.ms - run; if (d > best) { best = d; bestFrom = run; } run = null; }
  }
  if (run !== null && samples.length) {
    const d = samples[samples.length - 1].ms - run;
    if (d > best) { best = d; bestFrom = run; }
  }
  return { ms: best, fromMs: bestFrom };
}

async function finish(code) {
  try { await H.ev(PROMPT_OFF); } catch {}
  for (const C of [H, ...Gs]) { try { await C.ev(RECORDER_OFF); } catch {} try { await C.ev(RESPONDER_OFF); } catch {} }
  try { await H.ev(`(async()=>{const st=__pp_app_state_debug();if(st.db&&st.room)await st.db.ref('rooms/'+st.room).remove();return 1})()`); } catch {}
  out.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(out, null, 2));
  log(`\nwrote ${path.join(OUT, "result.json")}`);
  try { killAll(); } catch {}
  process.exit(code);
}

/* ================= main ================= */
try {
  base = serve(PORT);
  /* NOT ?ovens=1. That is the game's own TEST-GAME shortcut and it stocks every hold to a full
     recipe — measured on the first run of this probe: every captain went straight to the ovens and
     the host's action menu never appeared at all. A full hold is precisely the state in which
     nobody wants to trade. crew_bake_probe.mjs wants that flag; a TRADE probe must not have it. */
  const url = base;
  log(`=== crew trade probe — counter=${COUNTER || "none"} coins=${COINS} holders=${HOLDERS} delay=${DELAY}ms drop=${DROP} ===`);
  log(`    ${url}`);
  const profRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crew-trade-prof-"));
  out.profileRoot = profRoot;

  const nGuests = Math.max(1, Math.min(2, HOLDERS));
  launch(DBG[0], path.join(profRoot, "host"));
  for (let i = 0; i < nGuests; i++) launch(DBG[i + 1], path.join(profRoot, "guest" + (i + 1)));
  H = await attach(DBG[0]);
  for (let i = 0; i < nGuests; i++) { Gs.push(await attach(DBG[i + 1])); alive.push(true); }
  // a headless tab that loses foreground reports document.hidden and the game correctly pauses
  // itself — an immaculate forgery of a stall (HARD-WON-LESSONS 2026-08-21)
  for (const C of [H, ...Gs]) await C.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});

  room = await makeHost(H, url, "test1");
  log(`room ${room}`);
  for (let i = 0; i < nGuests; i++) await makeGuest(Gs[i], url, room, "test" + (i + 2));
  await sleep(1500);

  // 3b: "Start the voyage!" opens a CONFIRMATION; #btnConfirmStart is what begins the game.
  await H.waitFor(`(()=>{const b=document.getElementById('btnStart');return !!(b&&b.getBoundingClientRect().width>10)})()`, 30000, "host: Start");
  await H.ev(`document.getElementById('btnStart').click();true`);
  await sleep(900);
  await H.waitFor(`(()=>{const b=document.getElementById('btnConfirmStart');return !!(b&&b.getBoundingClientRect().width>10)})()`, 25000, "host: Confirm start");
  await H.ev(`document.getElementById('btnConfirmStart').click();true`);
  log("voyage started");
  await sleep(2500);

  /* The ceremony + the recipe draft (3c: a recipe card takes TWO taps).
     THE BREAK CONDITION IS "the recipe BANNER is up AND the ceremony card is gone", not
     "every seat has a recipe" — the first run broke out at tick 0 while the Ahoy card was still on
     screen, because recipeChoices are assigned before the draft and p.recipe was already truthy.
     A loop that breaks for the wrong reason hands you its first sample as if it were the answer
     (HARD-WON-LESSONS 4). */
  let drafted = false;
  for (let i = 0; i < 60; i++) {
    const a = await H.ev(TICK); for (const G of Gs) await G.ev(TICK);
    const done = await H.ev(`(()=>{try{const s=__pp_app_state_debug();const g=s.game;
      if(!g||!g.players||!g.players.every(p=>p.recipe))return false;
      if(document.querySelector('#actionPanel .recipeCard'))return false;
      return (g.events||[]).length>0;}catch(e){return false}})()`);
    if (done) { drafted = true; log(`  voyage under way (tick ${i}, last host act ${a})`); break; }
    await sleep(900);
  }
  if (!drafted) log("  NOTE: the draft-complete condition never went true; carrying on anyway");
  const s0 = await state(H);
  out.seats = { strategies: s0.strategies, names: s0.names };
  log(`  seats: ${JSON.stringify(s0.names)} strategies=${JSON.stringify(s0.strategies)}`);
  const humanSeats = (s0.strategies || []).map((s, i) => s === "human" ? i : -1).filter(i => i >= 0);
  log(`  human seats: ${JSON.stringify(humanSeats)}  (host is seat ${s0.seat})`);
  await pair("00-voyage-open", "after the draft");

  /* Park the turn loop on the HOST's own LOCAL prompt, so the singular Firebase prompt channel is
     free for the trade's own asks. A local ask never writes to rooms/<CODE>/prompt. */
  log("\n=== waiting for the host's own action prompt (parks the turn loop, frees the wire) ===");
  let parked = false;
  for (let i = 0; i < 260 && !parked; i++) {
    const h = await state(H);
    if ((h.apBtns || []).some(b => /Pass|Sail|Dock|Trade|Attack/i.test(b))) {
      parked = true; log(`  parked at tick ${i}: ${JSON.stringify(h.apBtns)}`); break;
    }
    await H.ev(TICK_NOACT).catch(() => {});
    for (const G of Gs) await G.ev(TICK).catch(() => {});
    if (i % 25 === 24) log(`  ...tick ${i}: host apMsg="${(h.apMsg || "").slice(0, 60)}" btns=${JSON.stringify((h.apBtns || []).slice(0, 4))}`);
    await sleep(900);
  }
  if (!parked) { out.abort = "the host's own action prompt never appeared inside ~240s"; log("ABORT: " + out.abort); await pair("zz-noprompt"); await finish(1); }
  await pair("01-parked", "the turn loop is parked on a LOCAL prompt; the wire is free");

  // holders = the guest seats. The HOST must NOT be a holder: its own local ask would overwrite
  // the parked prompt and the measurement would be of two things at once.
  const hostSeat = s0.seat;
  const guestSeats = humanSeats.filter(i => i !== hostSeat).slice(0, HOLDERS);
  out.holderSeats = guestSeats;
  if (guestSeats.length < HOLDERS) out.notes.push(`WANTED ${HOLDERS} human holders, HAVE ${guestSeats.length} — any three-captain figure quoted from this run is arithmetic, not a measurement`);
  log(`  human holder seats: ${JSON.stringify(guestSeats)} (host seat ${hostSeat} deliberately NOT a holder)`);

  const poseRaw = await H.ev(POSE(guestSeats));
  const pose = JSON.parse(poseRaw);
  log(`\n=== pose: ${poseRaw}`);
  out.pose = pose;
  if (pose.err) { out.abort = "pose failed: " + pose.err; log("ABORT: " + out.abort); await finish(1); }
  if ((pose.heard || []).length !== guestSeats.length) out.notes.push(`holdersOf returned ${JSON.stringify(pose.heard)} for holder seats ${JSON.stringify(guestSeats)}`);

  // recorders + responders + prompt watch, all armed BEFORE the hail
  for (const C of [H, ...Gs]) await C.ev(RECORDER(SAMPLE_MS));
  log("  " + await H.ev(PROMPT_WATCH));
  const rmode = COUNTER === "crate" ? "counter-crate" : COUNTER === "coins" ? "counter-coins" : "accept";
  for (const G of Gs) log("  guest: " + await G.ev(RESPONDER(rmode, DELAY, COINS)));

  const before = await state(H);
  out.dlogBefore = before.dlogLen;
  const tFire = Date.now();
  log(`\n=== firing the hail (dlog before = ${before.dlogLen}) ===`);
  log("  " + await H.ev(FIRE(base)));

  if (DROP) {
    await sleep(1400);
    log("  --drop-mid-round: closing guest 1's tab");
    try { await Gs[0].send("Page.navigate", { url: "about:blank" }); } catch {}
    alive[0] = false;
    out.dropAtMs = Date.now() - tFire;
  }

  // watch it play out, BOUNDED
  let settled = null;
  for (let i = 0; i < 200; i++) {
    const f = JSON.parse((await H.ev(FIRE_STATE)) || "null");
    if (f && f.state !== "running") { settled = f; break; }
    if (i === 6) await pair("02-round-open", "every holder's screen at the same moment");
    if (i === 22) await pair("03-mid-round", "");
    await sleep(700);
  }
  out.fire = settled || JSON.parse((await H.ev(FIRE_STATE)) || "null");
  if (!settled) { out.notes.push("the trade did NOT resolve inside ~140s — TIMED OUT, which is not the same as proven stalled"); log("  TIMEOUT: trade did not resolve in ~140s"); }
  else log(`  trade ${settled.state} after ${((settled.t1 - settled.t0) / 1000).toFixed(1)}s  result=${JSON.stringify(settled.result)} err=${settled.err || "none"}`);
  await sleep(1800);
  await pair("04-settled", "after the trade resolved");

  const after = await state(H);
  out.dlogAfter = after.dlogLen;
  out.ledger = JSON.parse(await H.ev(LEDGER));

  // ---- pull the recordings ----
  for (const C of [H, ...Gs]) await C.ev(RECORDER_OFF).catch(() => {});
  const rec = { host: JSON.parse(await H.ev(RECORDER_DUMP)) };
  for (let i = 0; i < Gs.length; i++) rec["guest" + (i + 1)] = alive[i] ? JSON.parse(await Gs[i].ev(RECORDER_DUMP)) : [];
  out.promptChannel = JSON.parse(await H.ev(PROMPT_DUMP));
  out.responders = [];
  for (let i = 0; i < Gs.length; i++) out.responders.push(alive[i] ? JSON.parse((await Gs[i].ev(RESPONDER_DUMP)) || "null") : null);

  // ---- the numbers ----
  const spans = {};
  for (const k of Object.keys(rec)) spans[k] = longestDecidingSpan(rec[k]);
  const openEv = rec.host.find(s => s.lastEv === "openoffer");
  const endEv = [...rec.host].reverse().find(s => s.lastEv === "trade" || s.lastEv === "parley");
  const openToSettle = (openEv && endEv && endEv.ms > openEv.ms) ? (endEv.ms - openEv.ms) : null;

  out.measured = {
    responderDelayMs: DELAY,
    sampleIntervalMs: SAMPLE_MS,
    openofferToSettlementMs: openToSettle,
    tradeWallClockMs: settled ? (settled.t1 - settled.t0) : null,
    longestDecidingSpanMs: spans,
    longestDecidingSpanAnyScreenMs: Math.max(...Object.values(spans).map(s => s.ms)),
    promptWrites: out.promptChannel.writes.length,
    distinctPromptIds: out.promptChannel.distinct,
    dlogBefore: out.dlogBefore, dlogAfter: out.dlogAfter,
    dlogEntriesAdded: out.dlogAfter - out.dlogBefore,
    stepperTaps: out.responders.map(r => r && r.stepperTaps),
    sliderDrags: out.responders.map(r => r && r.sliderSets)
  };
  fs.writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(rec));

  log("\n================ MEASURED ================");
  log(`  responder thinking time held at        ${DELAY}ms (fixed), sampled every ${SAMPLE_MS}ms`);
  log(`  human holders answering                ${guestSeats.length}`);
  log(`  openoffer -> settlement                ${openToSettle == null ? "n/a" : (openToSettle / 1000).toFixed(1) + "s"}`);
  log(`  trade call wall clock                  ${out.measured.tradeWallClockMs == null ? "n/a" : (out.measured.tradeWallClockMs / 1000).toFixed(1) + "s"}`);
  for (const k of Object.keys(spans)) log(`  longest unbroken "is deciding" (${k.padEnd(7)}) ${(spans[k].ms / 1000).toFixed(1)}s`);
  log(`  prompt round trips (writes to rooms/<C>/prompt)  ${out.promptChannel.writes.length}  (${out.promptChannel.distinct} distinct prompts)`);
  log(`  decision log                           ${out.dlogBefore} -> ${out.dlogAfter}  (+${out.dlogAfter - out.dlogBefore})`);
  log(`  stepper taps per guest                 ${JSON.stringify(out.measured.stepperTaps)}`);
  log(`  slider drags per guest                 ${JSON.stringify(out.measured.sliderDrags)}`);
  out.promptChannel.writes.forEach(w => log(`    +${(w.ms / 1000).toFixed(1)}s  ${w.id ? w.id.slice(0, 12) : "(cleared)"} seat=${w.seat} slider=${w.slider} "${(w.msg || "").slice(0, 56)}"`));
  log("==========================================");

  await finish(0);
} catch (e) {
  log("\nTHREW: " + ((e && (e.stack || e.message)) || e));
  out.threw = String((e && (e.stack || e.message)) || e);
  try { await finish(1); } catch { try { killAll(); } catch {} process.exit(1); }
}
