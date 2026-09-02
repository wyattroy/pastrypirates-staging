/* W5-2 — DO THE "CALL THE WINNER" CIRCLES SIT ON THE BOATS, AND ON THE RIGHT ONES?
 *
 *   node scripts/qa/w52_call_beside_boat.mjs      exit 0 = every circle is beside its own boat
 *
 * Wyatt's report: "The buttons to call other battling captains sit on top of their boats, and often
 * on the WRONG boat. They should be directly beside the boats — side, top or bottom — so the player
 * can read the wind and the situation."
 *
 * MEASURED IN THE BROWSER, not read out of the source, because the complaint is about a picture.
 * It poses the real prompt rather than playing a voyage to a battle: localAsk() is what
 * collectSideBets() calls, and `seat` on an option is the only input the anchored-boats placement
 * in stage.js reads (it writes data-seat). Injection is safe here — solo, decorative (§5e).
 *
 * THREE THINGS ARE MEASURED, all from getBoundingClientRect() on what is actually painted:
 *   covers   — how much of the circle overlaps ITS OWN boat's box. "on top of their boats".
 *   wrongOn  — how much it overlaps SOMEBODY ELSE'S boat. "often on the wrong boat".
 *   nearest  — which boat the circle's centre is closest to. If that is not the boat the button
 *              names, a player reading the board is told the wrong thing even with no overlap.
 * A circle that is beside its boat has covers 0, wrongOn 0, nearest === its own seat, and a small
 * gap to its own boat's edge.
 */
import path from "node:path";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const PORT = 8492, DBG = 9392;
/* THIS PROBE HAD NEVER RUN ON WINDOWS, and nothing said so — it died with "no chrome on 9392",
   which reads as a missing browser rather than a bad argument. `/tmp/chrome-qa-w52` is a POSIX
   path; on the Razer Chrome never comes up with it, so W5-2's own on-screen measurement (the half
   its source gate explicitly defers to: "what a player SEES is measured by this file") was
   unavailable on the one machine the sea trial sails from. Absolute, repo-local and freshened —
   rule 18, plus cdp.mjs's Windows lesson that a profile a killed run still holds open cannot be
   unlinked. Found 2026-09-02 while verifying the ask-pill fix did not undo W5-2. */
const url = serve(PORT);
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-w52")));
const C = await attach(DBG);

const ADVANCE = `(()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis)
    .find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro:'+(go.textContent||'').trim().slice(0,16);}
  return null;})()`;

// pose the prompt collectSideBets() poses: two options, each naming a DIFFERENT captain's seat
const POSE = `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const st=(await import('/src/state/index.js')).appState;
  const g=st.game; if(!g) return {err:'no game'};
  const me=st.mySeat==null?0:st.mySeat;
  let others=g.players.map((p,i)=>i).filter(i=>i!==me).slice(0,2);
  /* ORDER MATTERS, AND THAT IS THE POINT OF THE SECOND POSE. D-48's "the last option takes the
     lowest spot" is a SWAP between two spots — harmless when every spot is interchangeable (a fan
     around your own ship), but these spots are anchored to NAMED boats. Posing the two options in
     the order that makes the swap fire is how the "wrong boat" half of his report is reproduced. */
  if(window.__w52flip){
    const b=await import('/src/ui/board.js'); const els=b.boardShipEls();
    const xr=i=>els[i]?els[i].getBoundingClientRect().left:0;
    others.sort((a,c)=>xr(c)-xr(a));   // the RIGHTMOST boat becomes option 0
  }
  if(others.length<2) return {err:'need two other captains'};
  window.__w52seats=others;
  f.localAsk("⚔️ A battle's brewing! Call the winner — it's free.",
    others.map((i,k)=>({label:"Call "+(g.players[i].name||("Captain "+i)),value:k?"d":"a",seat:i})));
  return {seats:others, me};
}catch(e){return {err:String(e.message).slice(0,120)}}})()`;

const MEASURE = `(async()=>{try{
  const b=await import('/src/ui/board.js');
  const boats=b.boardShipEls().map(el=>{const r=el.getBoundingClientRect();
    return {l:r.left,t:r.top,r:r.right,b:r.bottom,cx:r.left+r.width/2,cy:r.top+r.height/2,w:r.width,h:r.height};});
  const btns=[...document.querySelectorAll('#actionPanel .apBtn')];
  const ov=(a,c)=>Math.max(0,Math.min(a.r,c.r)-Math.max(a.l,c.l))*Math.max(0,Math.min(a.b,c.b)-Math.max(a.t,c.t));
  const gap=(a,c)=>{const dx=Math.max(c.l-a.r,a.l-c.r,0),dy=Math.max(c.t-a.b,a.t-c.b,0);return Math.round(Math.hypot(dx,dy));};
  const radial=document.getElementById('pp4Prompt');
  const bshi=b.boardShipEls();
  return {radial: !!(radial&&radial.classList.contains('radial')),
    cls: radial?radial.className:'(no #pp4Prompt)',
    apCls: (document.getElementById('actionPanel')||{}).className,
    apStage: (document.getElementById('actionPanel')||{dataset:{}}).dataset.pp4Stage||null,
    ships: bshi.length, ship0: bshi[0]?bshi[0].style.transform:null,
    n:btns.length,
    boats: boats.map(x=>({cx:Math.round(x.cx),cy:Math.round(x.cy),w:Math.round(x.w),h:Math.round(x.h)})),
    rows: btns.map(bt=>{
      const rr=bt.getBoundingClientRect();
      const a={l:rr.left,t:rr.top,r:rr.right,b:rr.bottom};
      const area=Math.max(1,rr.width*rr.height);
      const seat=bt.dataset&&bt.dataset.seat!=null?+bt.dataset.seat:null;
      /* NEAREST BY EDGE, NOT BY CENTRE. Centre-to-centre called a false alarm on the shipped
         tree: a circle 11px above the boat it names, with a third boat's centre 4px closer, was
         reported as being on the wrong boat when a player would read it as beside the right one.
         "Beside" is adjacency, so the gap between the boxes is the honest measure. */
      let nearest=null,nd=1e9;
      boats.forEach((bo,i)=>{const d=gap(a,bo); if(d<nd){nd=d;nearest=i;}});
      const mine=seat!=null&&boats[seat]?boats[seat]:null;
      return {label:(bt.textContent||'').trim().slice(0,22), seat,
        x:Math.round(rr.left), y:Math.round(rr.top), w:Math.round(rr.width),
        covers: mine?Math.round(100*ov(a,mine)/area):null,
        wrongOn: Math.round(100*Math.max(0,...boats.map((bo,i)=>i===seat?0:ov(a,bo)))/area),
        nearest, nearestPx: Math.round(nd),
        gapToMine: mine?gap(a,mine):null};
    })};
}catch(e){return {err:String(e.message).slice(0,120)}}})()`;

async function leg(tag, w, h, mobile) {
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','w52-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await sleep(1000);
  await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${tag}: home`);
  await C.ev(`document.getElementById('choiceSolo').click();true`);
  await sleep(800);
  await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${tag}: name`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
  await C.ev(`document.getElementById('btnNameConfirm').click();true`);
  /* ADVANCE UNTIL A REAL BOARD PROMPT IS UP, not merely until the board exists. Posing over an
     unanswered CEREMONY ask leaves `#actionPanel[data-pp4-stage]` set (renderAskPrompt only clears
     it when its own prompt resolves), and promptTick then routes every later prompt to the centre
     stage — measured: three legs reporting cls="pp4Center", nothing radial, nothing measured. */
  let live = false;
  for (let i = 0; i < 40; i++) {
    live = await C.ev(`(()=>{const b=document.getElementById('pp4Prompt');const a=document.getElementById('actionPanel');
      return !!(b&&b.classList.contains('radial')&&a&&!a.dataset.pp4Stage&&a.querySelector('.apBtn'))})()`);
    if (live) break;
    await C.ev(ADVANCE); await sleep(900);
  }
  if (!live) {
    const why = await C.ev(`(()=>{const b=document.getElementById('pp4Prompt'),a=document.getElementById('actionPanel');
      return JSON.stringify({box:b?b.className:null, ap:a?a.className:null, stage:a?(a.dataset.pp4Stage||null):null,
        btns:a?a.querySelectorAll('.apBtn').length:0, body:document.body.className.slice(0,60),
        msg:((a&&a.querySelector('.apMsg'))||{}).textContent||null})})()`);
    console.log(`  ${tag}: never reached a live board prompt — ${why}`); return null; }
  await sleep(600);
  const out = {};
  for (const flip of [false, true]) {
    await C.ev(`window.__w52flip=${flip};true`);
    const posed = await C.ev(POSE);
    if (posed && posed.err) { console.log(`  ${tag}: POSE FAILED — ${posed.err}`); return null; }
    await sleep(1400);                       // let the stage tick place the circles
    out[flip ? "rightFirst" : "natural"] = await C.ev(MEASURE);
    await C.shot(`w52-${tag}${flip ? "-rightfirst" : ""}.png`);
  }
  return out;
}

const LEGS = [["phone", 390, 844, true], ["desktop", 1200, 950, false], ["tablet", 768, 1024, false]];
let bad = 0, measured = 0;
for (const [tag, w, h, mob] of LEGS) {
  const legs = await leg(tag, w, h, mob);
  console.log(`\n--- ${tag} ${w}x${h} ---`);
  if (!legs) { console.log(`  NOT RUN — leg failed`); continue; }
  for (const [order, m] of Object.entries(legs)) {
    if (!m || m.err) { console.log(`  ${order}: NOT RUN — ${m ? m.err : "no measurement"}`); continue; }
    if (!m.radial) { console.log(`  ${order}: NOT RUN — not radial (n=${m.n} cls="${m.cls}" apStage=${m.apStage})`); continue; }
    console.log(`  ${order}  boats: ${m.boats.map((b, i) => `${i}@${b.cx},${b.cy}(${b.w}px)`).join("  ")}`);
    for (const r of m.rows) {
      measured++;
      const wrongBoat = r.nearest !== r.seat;
      const onBoat = (r.covers || 0) > 0 || r.wrongOn > 0;
      if (wrongBoat || onBoat) bad++;
      console.log(`    seat ${r.seat} "${r.label}" at ${r.x},${r.y}  covers-own ${r.covers}%  on-other ${r.wrongOn}%  nearest ${r.nearest}${wrongBoat ? " \u2190 WRONG BOAT" : ""}  gap ${r.gapToMine}px`);
    }
  }
}
console.log(`\n=== W5-2 VERDICT ===`);
if (!measured) { console.log("  NOTHING MEASURED — no leg produced a radial call prompt. Not a pass."); killAll(); process.exit(2); }
console.log(`  circles measured: ${measured}   sitting on a boat or nearest the wrong one: ${bad}`);
killAll();
process.exit(bad ? 1 : 0);
