/* local_trade_probe.mjs — a complete trade in SOLO and in PASS-AND-PLAY, played and photographed.
 *
 * Phase 05 Task 5. These are the two modes a two-tab crew test cannot see BY CONSTRUCTION: both have
 * `appState.room === null`, so every mirror-when-remote guard is unreachable in them and every
 * routing fork takes its other branch (DISPLAY-RULES Rule A's measured correction). crew_trade_probe
 * covers the wire; this covers the two modes the wire does not exist in.
 *
 * WHAT IT PROVES:
 *   1. SOLO — a human captain builds an offer, sets the coins BY DRAGGING, and the trade settles.
 *      This is also the HOST-SIDE half of MP-08's paired screenshot: the same builder, the same two
 *      class names, the same picture the guest now gets.
 *   2. PASS-AND-PLAY — the same, on a shared device with two human seats; and it answers a question
 *      the plan raised from SOURCE and forbade reporting unmeasured (rule 6): when captain A hails
 *      the table and captain B is a human holder at the SAME device, does B's answer prompt appear
 *      without the pass-the-device screen? passGate(seat) returns immediately when
 *      seat === appState.mySeat, and the answering loop never calls it — so the prediction is YES,
 *      it appears with no hand-off. This probe photographs whatever actually happens.
 *
 * POSED, NOT PLAYED (DRIVING-THE-GAME §5e), and injection is SAFE here in a way it is not in
 * multiplayer: solo and pass-and-play have no room, no broadcast and no second authority to desync.
 * Every crate is read out of g.ings and asserted against it before use — a fixture that cannot exist
 * in the game proves nothing (HARD-WON-LESSONS §3).
 *
 * Hygiene (rule 17): headless, --mute-audio, its own ports, every loop bounded, killed on every exit.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = k => process.argv.includes(`--${k}`);
const OUT = path.resolve(arg("out", "/tmp/local-trade-probe"));
fs.mkdirSync(OUT, { recursive: true });
process.env.MP_RIG_SHOTS = OUT;
const { serve, launch, attach, killAll, sleep } = await import("./mp_rig.mjs");

const PORT = +arg("port", 8861), DBG = +arg("dbg", 9931);
const PNP = has("pnp");
const LOGF = path.join(OUT, "log.txt");
try { fs.unlinkSync(LOGF); } catch {}
const log = (...a) => { const s = a.join(" "); console.log(s); fs.appendFileSync(LOGF, s + "\n"); };
const out = { mode: PNP ? "pass-and-play" : "solo", startedAt: new Date().toISOString(), steps: [], notes: [] };
let C = null;

const STATE = `JSON.stringify((()=>{const st=(()=>{try{return __pp_app_state_debug()}catch(e){return{}}})();
  const g=st.game||{};
  return {mySeat:st.mySeat,room:st.room,passAndPlay:!!st.passAndPlay,
    strategies:(g.players||[]).map(p=>p&&p.strategy),
    coins:(g.players||[]).map(p=>p&&p.coins),
    ing:(g.players||[]).map(p=>(p&&p.ing)?p.ing.slice():null),
    ings:g.ings||null, dlogLen:(st.dlog||[]).length,
    events:(g.events||[]).length,
    apMsg:(()=>{const e=document.querySelector('#actionPanel .apMsg');return e?(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,120):null})(),
    apBtns:[...document.querySelectorAll('#actionPanel .apBtn')].map(b=>(b.textContent||'').trim().slice(0,26)),
    hasSlider:!!document.querySelector('#actionPanel .apSlider'),
    hasSliderWrap:!!document.querySelector('#actionPanel .apSliderWrap'),
    sliderVal:(()=>{const e=document.querySelector('#actionPanel .apSlider');return e?+e.value:null})(),
    sliderMax:(()=>{const e=document.querySelector('#actionPanel .apSlider');return e?+e.max:null})(),
    sliderOut:(()=>{const e=document.querySelector('#actionPanel .apSliderOut');return e?(e.textContent||'').trim():null})(),
    /* THE HAND-OFF CARD. passGate stamps #actionPanel[data-pp4-hand] and draws "Pass the wheel to
       X" — so its presence, or absence, is the whole answer to the pass-and-play question. */
    handOff:!!document.getElementById('actionPanel').dataset.pp4Hand,
    handOffText:(()=>{const p=document.getElementById('actionPanel');
      return (p&&p.dataset.pp4Hand)?(p.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80):null})(),
    bub:(()=>{const e=document.querySelector('.pp4Bub:not(.out) .pp4BubIn');return e?(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,110):null})()};})())`;
const state = async () => JSON.parse(await C.ev(STATE));

/* WAIT FOR THE PROMPT LAYER TO BE PAINTED BEFORE PHOTOGRAPHING IT.
   MEASURED, and it nearly became a false bug report: #pp4Prompt is display:none for the first
   ~750ms after panel() renders — the reveal/placement window — and block at 691x950 for the rest of
   the prompt's life (3 of 32 samples none, 29 block, sampled every 250ms). The DOM read that says
   "the slider is there" is true from the FIRST render, three quarters of a second before a captain
   can see anything, so a shot fired straight after that read catches an empty screen every time.
   Two runs were photographed that way and read exactly like a game-stopping layout fault; the same
   emptiness was then reproduced on the PRE-TASK tree, which is what proved it was the instrument.
   A still frame cannot tell "hidden" from "not revealed yet" (HARD-WON-LESSONS §9), so do not ask
   it to — wait for the paint, then look. */
const PAINTED = `(()=>{const el=document.getElementById('pp4Prompt');if(!el)return false;
  const cs=getComputedStyle(el),r=el.getBoundingClientRect();
  return cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0.05&&r.width>20&&r.height>20;})()`;
async function shot(name, note) {
  const s = await state();
  if ((s.apBtns || []).length || s.hasSlider) {
    for (let i = 0; i < 24; i++) { if (await C.ev(PAINTED) === true) break; await sleep(200); }
    await sleep(350);                    // let the fan finish placing, not just start
  }
  await C.shot(`${name}.png`);
  out.steps.push({ name, note: note || "", ...s });
  log(`\n--- ${name} ${note ? "(" + note + ")" : ""}`);
  log(`    apMsg="${(s.apMsg || "").slice(0, 90)}"`);
  log(`    btns=${JSON.stringify(s.apBtns.slice(0, 5))}`);
  log(`    slider=${s.hasSlider} wrap=${s.hasSliderWrap} val=${s.sliderVal}/${s.sliderMax} out="${s.sliderOut}" handOff=${s.handOff}`);
  if (s.bub) log(`    bubble="${s.bub.slice(0, 80)}"`);
  return s;
}

/* One tick, with the committing button preferred — see crew_trade_probe's note on the oscillation
   this avoids. Never opens a Trade of its own; this probe opens the one it means to measure. */
const TICK = (allowTrade) => `(()=>{
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
  let pool=btns.filter(b=>!/anchor/i.test(b.textContent));
  if(!pool.length)pool=btns;
  ${allowTrade ? "" : `const nt=pool.filter(b=>!/^\\\\s*Trade/i.test(b.textContent||''));if(nt.length)pool=nt;`}
  const pick=pool.find(b=>b.classList.contains('primary'))||pool[0];
  const t=(pick.textContent||'').trim().slice(0,22);
  pick.click();return t;
})()`;

/* CLICK asserts the button is actually ON SCREEN before pressing it — a DOM-clicking driver fires a
   listener whether or not a real captain could have seen or reached the control, which is how an
   off-screen Dock button sailed through headless QA on 2026-08-21. It also REPORTS the rects when
   nothing matches, because the radial fan places its circles a frame or two after panel() returns
   and "no live button" and "the fan has not bloomed yet" look identical from one sample. */
const CLICK = (re) => `(()=>{const all=[...document.querySelectorAll('#actionPanel .apBtn')];
  const live=all.filter(b=>b.getAttribute('aria-disabled')!=='true'&&b.disabled!==true&&b.getBoundingClientRect().width>4);
  const b=live.find(x=>${re}.test((x.textContent||'').trim()));
  if(!b)return {clicked:null,seen:all.map(x=>({t:(x.textContent||'').trim().slice(0,20),
    w:Math.round(x.getBoundingClientRect().width),dis:x.getAttribute('aria-disabled')==='true'}))};
  const t=(b.textContent||'').trim().slice(0,26);b.click();return {clicked:t};})()`;
/* Bounded retry — the fan's placement is the thing being waited on, not the game. */
async function click(re, label) {
  let last = null;
  for (let i = 0; i < 20; i++) {
    last = await C.ev(CLICK(re));
    if (last && last.clicked) return last.clicked;
    await sleep(400);
  }
  log(`  CLICK ${label || re} found nothing pressable; panel held ${JSON.stringify(last && last.seen)}`);
  return null;
}

/* Drag the real bar. The value setter has to be the prototype's, or React-style value tracking and
   the browser's own internal state disagree with what the input event reports. */
const DRAG = (n) => `(()=>{const sl=document.querySelector('#actionPanel .apSlider');if(!sl)return null;
  const t=Math.max(+sl.min,Math.min(+sl.max,${n}));
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(sl,String(t));
  sl.dispatchEvent(new Event('input',{bubbles:true}));
  return {set:t,reads:+sl.value,out:(document.querySelector('#actionPanel .apSliderOut')||{}).textContent};})()`;

/* POSE — validated against the engine's own ingredient list before anything is written. */
const POSE = `(async()=>{
  const st=__pp_app_state_debug();const g=st.game;const ings=g.ings;
  if(!ings||ings.length<3)return JSON.stringify({err:'no ingredient list'});
  const me=g.players[st.mySeat];
  const want=ings[0], mine=ings[1];
  // I hold something to give and a purse to sweeten with; somebody else holds what I want
  me.ing=[mine,mine];me.coins=Math.max(me.coins,6);
  const holder=g.players.find(p=>p!==me);
  if(!holder)return JSON.stringify({err:'no other captain'});
  if(holder.ing.indexOf(want)<0)holder.ing=holder.ing.concat([want]);
  holder.coins=Math.max(holder.coins,4);
  for(const q of g.players)if(q!==holder&&q!==me)q.ing=q.ing.filter(i=>i!==want);
  me.ing=me.ing.filter(i=>i!==want);
  const legal=ings.indexOf(want)>=0&&ings.indexOf(mine)>=0&&me.ing.indexOf(mine)>=0&&me.ing.indexOf(want)<0
    &&g.holdersOf(want,me).length>0;
  if(!legal)return JSON.stringify({err:'illegal fixture',want:want,mine:mine,meIng:me.ing});
  return JSON.stringify({ok:true,mySeat:st.mySeat,want:want,mine:mine,coins:me.coins,
    holders:g.holdersOf(want,me).map(q=>({idx:q.idx,strategy:q.strategy}))});
})()`;

const LEDGER = `JSON.stringify((()=>{const st=__pp_app_state_debug();const g=st.game;
  return {ing:(g.players||[]).map(p=>(p&&p.ing)?p.ing.slice():null),
    coins:(g.players||[]).map(p=>p&&p.coins),
    dlog:(st.dlog||[]).slice(),
    tradeEvents:(g.events||[]).filter(e=>e&&(e.t==='trade'||e.t==='parley'||e.t==='openoffer'))
      .map(e=>({t:e.t,a:e.a,b:e.b,p:e.p,want:e.want,got:e.got,
                gave:String(e.gave||e.offer||'').replace(/<[^>]*>/g,' ').replace(/\\s+/g,' ').trim()}))};})())`;

async function finish(code) {
  out.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(out, null, 2));
  log(`\nwrote ${path.join(OUT, "result.json")}`);
  try { killAll(); } catch {}
  process.exit(code);
}

try {
  const base = serve(PORT);
  log(`=== local trade probe — ${out.mode} — ${base} ===`);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "local-trade-prof-"));
  launch(DBG, path.join(prof, "c"));
  C = await attach(DBG);
  await C.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await C.goto(base);
  await C.waitFor(`document.readyState==='complete'`, 30000, "load");
  await C.ev(`localStorage.clear();true`);
  await C.goto(base);
  await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
  await sleep(1400);

  // §3: click the mode card FIRST, then the name modal it opens. btnNameConfirm is in the DOM from
  // boot, so waiting on its EXISTENCE returns instantly and the confirm fires into a closed modal.
  // #choicePassPlay, not #choicePass — read off 4/index.html rather than guessed at. The first run
  // named a card that does not exist and aborted; the abort printed the four ids the page actually
  // offers, which is why the check reports the universe instead of just failing.
  const cardId = PNP ? "choicePassPlay" : "choiceSolo";
  const okCard = await C.ev(`(()=>{const e=document.getElementById(${JSON.stringify(cardId)});return !!(e&&e.getBoundingClientRect().width>10)})()`);
  if (!okCard) {
    const ids = await C.ev(`JSON.stringify([...document.querySelectorAll('[id^=choice]')].map(e=>e.id))`);
    out.abort = `mode card ${cardId} not found; page offers ${ids}`; log("ABORT: " + out.abort); await finish(1);
  }
  await C.ev(`document.getElementById(${JSON.stringify(cardId)}).click();true`);
  await sleep(900);
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`)) {
    await C.ev(`document.getElementById('nameModalInput').value='test1';document.getElementById('btnNameConfirm').click();true`);
    await sleep(1000);
  }
  // pass-and-play asks for the crew before it starts
  for (let i = 0; i < 12; i++) {
    const started = await C.ev(`(()=>{try{const s=__pp_app_state_debug();return !!(s.game&&s.game.players&&s.game.players.some(p=>p.strategy==='human'))&&(s.game.events||[]).length>0}catch(e){return false}})()`);
    if (started) break;
    const clicked = await C.ev(`(()=>{for(const id of ['btnStartPassPlay','btnConfirmStart','btnStart']){
      const b=document.getElementById(id);if(b&&b.getBoundingClientRect().width>10){b.click();return id;}}
      const b=[...document.querySelectorAll('button')].find(x=>/set sail|start|begin/i.test(x.textContent||'')&&x.getBoundingClientRect().width>10);
      if(b){b.click();return (b.textContent||'').trim().slice(0,20);}return null;})()`);
    if (clicked) log(`  lobby: ${clicked}`);
    await sleep(1000);
  }
  await shot("00-opened", "the voyage screen");

  /* POSE BEFORE THE ACTION MENU IS BUILT, not after. Measured on the first run of this probe:
     humanAct computes the Trade button's greyed state from live holds AT THE MOMENT IT BUILDS THE
     MENU ("No one's holding cargo to trade for yet"), so a pose applied to an already-rendered menu
     leaves Trade dead and the driver walks past it into Pass. The state a feature reads is the
     thing to set, and it has to be set before the feature reads it (DRIVING-THE-GAME §5e). */
  let posed = null;
  for (let i = 0; i < 40 && !posed; i++) {
    const ready = await C.ev(`(()=>{try{const s=__pp_app_state_debug();const g=s.game;
      return !!(g&&g.players&&g.players.every(p=>p.recipe))&&(g.events||[]).length>0;}catch(e){return false}})()`);
    if (ready) { const raw = await C.ev(POSE); posed = JSON.parse(raw); log(`\n=== pose (tick ${i}): ${raw}`); break; }
    const a = await C.ev(TICK(false)); if (a) log(`  open: ${a}`);
    await sleep(800);
  }
  out.pose = posed;
  if (!posed || posed.err) { out.abort = "pose failed: " + JSON.stringify(posed); log("ABORT: " + out.abort); await shot("zz-pose"); await finish(1); }

  /* Drive to my own turn, RE-POSING EVERY TICK. humanAct greys the Trade button from live holds at
     the moment it BUILDS the menu, and the voyage in between takes dozens of ticks during which bots
     buy, trade and raid the crates this run depends on — the first run wandered into a battle and
     spent its whole budget. Re-applying an idempotent top-up each tick means the state is right at
     the one instant the menu reads it, rather than right when the probe happened to write it. */
  let reached = false;
  for (let i = 0; i < 150 && !reached; i++) {
    await C.ev(POSE).catch(() => {});
    const s = await state();
    if ((s.apBtns || []).some(b => /Trade/i.test(b))) { log(`  reached my own action menu at tick ${i}`); reached = true; break; }
    const a = await C.ev(TICK(false));
    if (a && i % 5 === 0) log(`  tick ${i}: ${a}`);
    await sleep(800);
  }
  const s1 = await shot("01-my-action-menu", "the captain's own turn");
  out.humanSeats = (s1.strategies || []).map((x, i) => x === "human" ? i : -1).filter(i => i >= 0);
  log(`  human seats: ${JSON.stringify(out.humanSeats)}  passAndPlay=${s1.passAndPlay}  room=${s1.room}`);
  if (!(s1.apBtns || []).some(b => /Trade/i.test(b))) { out.abort = "never reached my own action menu"; log("ABORT: " + out.abort); await finish(1); }

  out.dlogBefore = s1.dlogLen;
  const tradeLive = await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/Trade/i.test(x.textContent||''));
    return b?{present:true,disabled:b.getAttribute('aria-disabled')==='true',why:b.getAttribute('data-why')||null}:{present:false};})()`);
  log(`  Trade button: ${JSON.stringify(tradeLive)}`);
  out.tradeButton = tradeLive;
  if (!tradeLive.present || tradeLive.disabled) { out.abort = "the Trade action is not offerable: " + JSON.stringify(tradeLive); log("ABORT: " + out.abort); await shot("zz-notrade"); await finish(1); }

  /* WAIT FOR THE PROMPT, PHOTOGRAPH IT, THEN CLICK — in that order. The first run of this probe
     clicked and then shot, so every screenshot was of the step BEFORE the one it was labelled with,
     and a click that missed by one render made the whole chain slide. A shot taken before the thing
     it names has arrived is not evidence of anything. */
  async function step(name, note, msgRe, btnRe) {
    let s = null;
    for (let i = 0; i < 25; i++) {
      s = await state();
      if (msgRe.test(s.apMsg || "") && (s.apBtns || []).length) break;
      await sleep(500);
    }
    if (!msgRe.test(s.apMsg || "")) { out.abort = `${name}: expected ${msgRe} — screen reads "${s.apMsg}"`; log("ABORT: " + out.abort); await shot("zz-" + name); await finish(1); }
    const shown = await shot(name, note);
    const clicked = await click(btnRe, name);
    log(`    click -> ${clicked}`);
    if (clicked === null) { out.abort = `${name}: nothing matched ${btnRe} among ${JSON.stringify(shown.apBtns)}`; log("ABORT: " + out.abort); await finish(1); }
    await sleep(1300);
    return shown;
  }

  log(`  ${await click("/Trade/i", "Trade")}  <- Trade`);
  await sleep(1300);
  await step("02-what-do-ye-want", "step 0 of humanTrade — every crate, the unheld ones greyed", /WANT from the table/i, "/./");
  await step("03-what-will-ye-give", "step 1 of humanTrade", /will ye GIVE/i, "/^(?!.*coins only).+/i");

  /* ---- THE SLIDER, ON THE LOCAL TIER ---- */
  for (let i = 0; i < 25; i++) { const s = await state(); if (s.hasSlider) break; await sleep(500); }
  const sBefore = await shot("04-coin-slider", "the coin step — the SAME builder the guest now gets");
  if (!sBefore.hasSlider) { out.abort = "no slider on the coin step"; log("ABORT: " + out.abort); await shot("zz-noslider"); await finish(1); }
  /* WHERE IS IT ON SCREEN? The DOM having a control and a captain being able to see it are two
     different facts, and a screenshot of the solo coin step showed no prompt at all while the state
     read said the slider was there — so this measures the RENDERED rectangle rather than trusting
     either. Never offsetParent (null for every position:fixed element); the painted rect plus the
     computed styles that remove a thing from view, plus a hit test at its own centre. */
  /* SAMPLE IT OVER THE PROMPT'S WHOLE LIFE, not at one instant. A single read that says
     "display:none" cannot tell a layer that is hidden from a layer photographed between two
     renders, and a still frame has no notion of state over time (HARD-WON-LESSONS 2026-08-22). */
  const displayTrace = JSON.parse(await C.ev(`(async()=>{const seen=[];const t0=Date.now();
    for(let i=0;i<32;i++){const el=document.getElementById('pp4Prompt');
      const cs=el?getComputedStyle(el):null;const r=el?el.getBoundingClientRect():null;
      seen.push({ms:Date.now()-t0,d:cs?cs.display:null,w:r?Math.round(r.width):null,h:r?Math.round(r.height):null});
      await new Promise(r2=>setTimeout(r2,250));}
    return JSON.stringify(seen);})()`));
  const distinct = [...new Set(displayTrace.map(x => x.d + "/" + x.w + "x" + x.h))];
  out.promptLayerOverTime = { samples: displayTrace.length, distinct, trace: displayTrace };
  log(`\n  #pp4Prompt over ${(displayTrace.length * 250 / 1000).toFixed(1)}s: ${JSON.stringify(distinct)}`);

  out.promptGeometry = JSON.parse(await C.ev(`JSON.stringify((()=>{
    const g=el=>{ if(!el)return null; const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      const cx=Math.round(r.left+r.width/2),cy=Math.round(r.top+r.height/2);
      const hit=(r.width>2&&r.height>2&&cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight)?document.elementFromPoint(cx,cy):null;
      return {rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
        display:cs.display,visibility:cs.visibility,opacity:+cs.opacity,position:cs.position,
        transform:cs.transform==='none'?'none':cs.transform.slice(0,40),zIndex:cs.zIndex,
        inViewport:r.width>2&&r.height>2&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth,
        hitIsSelf:!!(hit&&(hit===el||el.contains(hit)||hit.contains(el))),
        hitTag:hit?(hit.id||hit.className||hit.tagName):null}; };
    return {viewport:{w:innerWidth,h:innerHeight},
      bodyClass:document.body.className,
      bodyTransform:(()=>{const t=getComputedStyle(document.body).transform;return t==='none'?'none':t.slice(0,40)})(),
      panel:g(document.getElementById('actionPanel')),
      promptLayer:g(document.getElementById('pp4Prompt')),
      sliderWrap:g(document.querySelector('.apSliderWrap')),
      sliderInput:g(document.querySelector('.apSlider')),
      apMsgEl:g(document.querySelector('#actionPanel .apMsg')),
      firstBtn:g(document.querySelector('#actionPanel .apBtn')),
      panelParent:(()=>{const p=document.getElementById('actionPanel');return p&&p.parentElement?(p.parentElement.id||p.parentElement.className):null})()};})())`));
  log(`\n  PROMPT GEOMETRY: ${JSON.stringify(out.promptGeometry, null, 1)}`);

  const target = Math.max(1, Math.min(sBefore.sliderMax, 3));
  const drag = await C.ev(DRAG(target));
  log(`  DRAG -> ${JSON.stringify(drag)}`);
  out.drag = drag;
  const sAfter = await shot("05-dragged", `dragged to ${target} — the pill re-states the whole deal`);
  out.sliderRestatedDeal = { before: sBefore.apMsg, after: sAfter.apMsg, changed: sBefore.apMsg !== sAfter.apMsg };
  log(`  the ask re-stated the deal: ${out.sliderRestatedDeal.changed}`);
  log(`     before: "${sBefore.apMsg}"`);
  log(`     after : "${sAfter.apMsg}"`);
  log(`  ${await click("/Offer it/i", "Offer it!")}  <- confirm`);
  await sleep(2500);

  /* ---- THE ANSWER ROUND. In pass-and-play a second HUMAN holder is asked here, on this device. ---- */
  let sawHandOff = false, sawOtherSeatPrompt = null;
  for (let i = 0; i < 40; i++) {
    const s = await state();
    if (s.handOff) { sawHandOff = true; log(`  HAND-OFF CARD at tick ${i}: "${s.handOffText}"`); await shot("06-handoff", "the pass-the-device screen"); }
    if (/offers/i.test(s.apMsg || "") && (s.apBtns || []).some(b => /Accept/i.test(b))) {
      sawOtherSeatPrompt = { tick: i, apMsg: s.apMsg, handOffFirst: sawHandOff };
      log(`  A TRADE-ANSWER PROMPT is on this device at tick ${i}: "${s.apMsg}"`);
      log(`     was a hand-off card shown first? ${sawHandOff}`);
      await shot("07-answer-prompt", "a holder's answer prompt, on this device");
      await click("/Accept/i", "Accept");
      await sleep(1200);
      continue;
    }
    if (/the table answers|Take a deal/i.test(s.apMsg || "")) { await shot("08-the-table-answers", "every answer, one captain per line"); await C.ev(TICK(true)); await sleep(1500); }
    /* MY trade's settlement, not ANY trade's. The first run broke on tick 0 because a BOT had
       already struck a deal earlier in the voyage, so the probe walked past its own answer round
       and photographed nothing. Count only what happened after the LAST openoffer, which is mine. */
    const led0 = JSON.parse(await C.ev(LEDGER));
    const evs = led0.tradeEvents || [];
    const lastOpen = evs.map(e => e.t).lastIndexOf("openoffer");
    if (lastOpen >= 0 && evs.slice(lastOpen + 1).some(e => e.t === "trade" || e.t === "parley")) { log(`  MY trade settled at tick ${i}: ${JSON.stringify(evs[evs.length - 1])}`); break; }
    await C.ev(TICK(true));
    await sleep(900);
  }
  await sleep(1200);
  const sEnd = await shot("09-settled", "after the trade");
  out.dlogAfter = sEnd.dlogLen;
  out.ledger = JSON.parse(await C.ev(LEDGER));
  out.passAndPlayAnswerPrompt = sawOtherSeatPrompt;
  out.sawHandOffBeforeAnswerPrompt = sawHandOff;

  log("\n================ RESULT ================");
  log(`  mode                     ${out.mode}   (room=${sEnd.room}, passAndPlay=${sEnd.passAndPlay})`);
  log(`  slider present locally   ${sBefore.hasSlider} (.apSlider) / ${sBefore.hasSliderWrap} (.apSliderWrap)`);
  log(`  dragged to               ${JSON.stringify(out.drag)}`);
  log(`  the ask re-stated deal   ${out.sliderRestatedDeal.changed}`);
  log(`  decision log             ${out.dlogBefore} -> ${out.dlogAfter}  (+${out.dlogAfter - out.dlogBefore})`);
  log(`  dlog                     ${JSON.stringify(out.ledger.dlog)}`);
  (out.ledger.tradeEvents || []).forEach(e => log(`  EV ${e.t}  a=${e.a} b=${e.b} want=${e.want} got=${e.got} gave="${e.gave}"`));
  log(`  holds after              ${JSON.stringify(out.ledger.ing)}`);
  log(`  coins after              ${JSON.stringify(out.ledger.coins)}`);
  if (PNP) {
    log(`  PASS-AND-PLAY QUESTION: a second human seat's trade-answer prompt appeared on this device: ${!!sawOtherSeatPrompt}`);
    log(`                          a pass-the-device card was shown first: ${sawHandOff}`);
  }
  log("========================================");
  await finish(0);
} catch (e) {
  log("\nTHREW: " + ((e && (e.stack || e.message)) || e));
  out.threw = String((e && (e.stack || e.message)) || e);
  try { await finish(1); } catch { try { killAll(); } catch {} process.exit(1); }
}
