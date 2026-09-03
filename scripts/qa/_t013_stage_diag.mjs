/* THROWAWAY DIAGNOSTIC for T-013 — which STAGE of the anchored placement strands the circle?
 * Poses exactly what t013_which_instrument.mjs poses, then reports, for each circle:
 *   the band (xMin..xMax, yMin..yMax), the named hull's rect, the ask pill's rect,
 *   the circle's own rect, and whether its left/top sit exactly on a band edge (= CLAMPED).
 * Reports only. Delete after the fix. */
import path from "node:path";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const PORT = 8497, DBG = 9397;
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-t013d")));
const url = serve(PORT);
const C = await attach(DBG);

const ADVANCE = `(()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis)
    .find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';}
  return null;})()`;

const SHAPE = `(async()=>{try{
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  return {players:g.players.length, me:st.mySeat};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

const pose = (a, d, ax, ay, dx, dy) => `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const b=await import('/src/ui/board.js');
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  g.players[${a}].pos=[${ax},${ay}]; g.players[${d}].pos=[${dx},${dy}];
  b.snapShipTo(${a}, g.players[${a}].pos); b.snapShipTo(${d}, g.players[${d}].pos);
  f.localAsk("\\u2694\\uFE0F "+(g.players[${a}].name||"Captain")+" \\u2014 a battle's brewing! Call the winner \\u2014 it's free, and ye get 2\\uD83C\\uDF15 if yer right.",
    [{label:"Call "+(g.players[${a}].name||("Captain "+${a})),value:"a",seat:${a}},
     {label:"Call "+(g.players[${d}].name||("Captain "+${d})),value:"d",seat:${d}}]);
  return {ok:true};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

const DIAG = `(async()=>{try{
  const bd=await import('/src/ui/board.js');
  const sg=await import('/src/ui/stage.js');
  const ap=document.getElementById('actionPanel'); if(!ap) return {err:'no actionPanel'};
  const btns=[...ap.querySelectorAll('.apBtn')].filter(b=>b.offsetWidth>4);
  if(!btns.length) return {err:'no buttons'};
  const band=sg.boardBand();
  const D=Math.round(btns[0].offsetWidth||66);
  const cap=document.getElementById('pp4Cap');
  const capR=cap?cap.getBoundingClientRect():null;
  const msg=ap.querySelector('.apMsg');
  const mr=msg?msg.getBoundingClientRect():null;
  const R=e=>{const r=e.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)};};
  const hulls=(bd.boardShipEls()||[]).map(R);
  return {vw:innerWidth, vh:innerHeight, D,
    bandTop:Math.round(band.top), bandBottom:Math.round(band.bottom),
    tSafe:Math.round(band.top)+32,
    capTop: capR?Math.round(capR.top):null, capH: capR?Math.round(capR.height):null,
    xMin:8, xMax:Math.round(innerWidth-D-8),
    pill: mr?{l:Math.round(mr.left),t:Math.round(mr.top),r:Math.round(mr.right),b:Math.round(mr.bottom)}:null,
    hulls,
    btns: btns.map(b=>({seat:b.dataset&&b.dataset.seat!=null?+b.dataset.seat:null, ...R(b)}))};
}catch(e){return {err:String(e.message).slice(0,200)}}})()`;

async function boot(tag, w, h, mobile){
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t013d-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await sleep(1000);
  await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${tag}: home`);
  await C.ev(`document.getElementById('choiceSolo').click();true`);
  await sleep(800);
  await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${tag}: name`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
  await C.ev(`document.getElementById('btnNameConfirm').click();true`);
  for (let i = 0; i < 90; i++){
    const live = await C.ev(`(()=>{const b=document.getElementById('pp4Prompt');const a=document.getElementById('actionPanel');
      return !!(b&&b.classList.contains('radial')&&a&&!a.dataset.pp4Stage&&a.querySelector('.apBtn'))})()`);
    if (live) return true;
    await C.ev(ADVANCE); await sleep(900);
  }
  return false;
}

const LEGS = [["phone-short", 390, 664, true]];
const POSES = [[2, 2, 5, 2], [2, 10, 5, 10]];

for (const [tag, w, h, mob] of LEGS){
  console.log(`\n=== ${tag} ${w}x${h} ===`);
  if (!(await boot(tag, w, h, mob))){ console.log("  NOT RUN"); continue; }
  const shape = await C.ev(SHAPE);
  if (!shape || shape.err){ console.log(`  NOT RUN — ${shape ? shape.err : "no shape"}`); continue; }
  const seats = [];
  for (let i = 0; i < shape.players && seats.length < 2; i++) if (i !== shape.me) seats.push(i);
  for (const [ax, ay, dx, dy] of POSES){
    const p = await C.ev(pose(seats[0], seats[1], ax, ay, dx, dy));
    if (!p || p.err){ console.log(`  pose FAILED — ${p ? p.err : "?"}`); continue; }
    await sleep(3500);
    const d = await C.ev(DIAG);
    if (!d || d.err){ console.log(`  DIAG FAILED — ${d ? d.err : "?"}`); continue; }
    const yMax = (d.capTop != null ? d.capTop : d.vh) - d.D - 8;
    console.log(`\n  pose (${ax},${ay})/(${dx},${dy})  D=${d.D}  band x[${d.xMin}..${d.xMax}] y[${d.tSafe}..~${yMax}]  capTop=${d.capTop} bandBottom=${d.bandBottom}`);
    console.log(`     pill  ${JSON.stringify(d.pill)}`);
    d.hulls.forEach((h, i) => console.log(`     hull ${i}  l${h.l} t${h.t} r${h.r} b${h.b}`));
    d.btns.forEach(b => {
      const h = d.hulls[b.seat];
      const onX = b.l <= d.xMin + 1 ? "xMin" : (b.l >= d.xMax - 1 ? "xMax" : "-");
      const onY = b.t <= d.tSafe + 1 ? "yMin" : (b.t >= yMax - 1 ? "yMax" : "-");
      const gap = h ? Math.round(Math.hypot(Math.max(h.l - b.r, b.l - h.r, 0), Math.max(h.t - b.b, b.t - h.b, 0))) : null;
      console.log(`     btn seat ${b.seat}  l${b.l} t${b.t}  gap-to-own ${gap}px   clamped: x=${onX} y=${onY}`);
    });
  }
}
killAll();
process.exit(0);
