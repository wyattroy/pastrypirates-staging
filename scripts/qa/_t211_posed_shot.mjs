/* T-211 POSED PAIR — one seeded board, one prompt, before and after. Rule 26.
 *   node scripts/qa/_t211_posed_shot.mjs <outfile.png>
 * Throwaway; delete when T-211 closes.
 */
import path from "node:path";
import fs from "node:fs";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const OUT = process.argv[2] || path.join(REPO, ".planning/posed/t211.png");
const SEED = 20260903;
const PIN_RANDOM = `(()=>{let s=${SEED}>>>0;Math.random=function(){s|=0;s=s+0x6D2B79F5|0;
  let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};return true;})()`;
const PORT = 8496, DBG = 9396;
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-t211s")));
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

const pose = (a, d, ax, ay, dx, dy, tail = "") => `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const b=await import('/src/ui/board.js');
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  g.players[${a}].pos=[${ax},${ay}]; g.players[${d}].pos=[${dx},${dy}];
  b.snapShipTo(${a}, g.players[${a}].pos); b.snapShipTo(${d}, g.players[${d}].pos);
  f.localAsk("Attack whom?${tail}",
    [{label:"Call "+(g.players[${a}].name||("Captain "+${a})),value:"a",seat:${a}},
     {label:"Call "+(g.players[${d}].name||("Captain "+${d})),value:"d",seat:${d}}]);
  return {ok:true};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

const SHIPSIG = `(async()=>{try{
  const b=await import('/src/ui/board.js');
  return (b.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return Math.round(r.left/8)+','+Math.round(r.top/8);}).join(' ');
}catch(e){return ''}})()`;

const ONSCREEN = `(async()=>{try{
  const bd=await import('/src/ui/board.js');
  const ap=document.getElementById('actionPanel');
  const btns=[...ap.querySelectorAll('.apBtn')].filter(b=>b.offsetWidth>4);
  const vw=innerWidth, vh=innerHeight;
  const boats=(bd.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return r.left>=0&&r.top>=0&&r.right<=vw&&r.bottom<=vh;});
  return btns.filter(b=>b.dataset.seat!=null).map(b=>!!boats[+b.dataset.seat]);
}catch(e){return []}})()`;

await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t211-shot');true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await C.ev(PIN_RANDOM);
await sleep(1000);
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "home");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(800);
await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, "name");
await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
await C.ev(`document.getElementById('btnNameConfirm').click();true`);
for (let i = 0; i < 90; i++){
  const live = await C.ev(`(()=>{const b=document.getElementById('pp4Prompt');const a=document.getElementById('actionPanel');
    return !!(b&&b.classList.contains('radial')&&a&&!a.dataset.pp4Stage&&a.querySelector('.apBtn'))})()`);
  if (live) break;
  await C.ev(ADVANCE); await sleep(900);
}

const shape = await C.ev(SHAPE);
const seats = [];
for (let i = 0; i < shape.players && seats.length < 2; i++) if (i !== shape.me) seats.push(i);

async function settle(){
  let last = "", same = 0;
  for (let i = 0; i < 60; i++){
    const sig = await C.ev(SHIPSIG);
    if (sig && sig === last){ if (++same >= 3) break; } else { same = 0; last = sig; }
    await sleep(250);
  }
}

// wake the director, exactly as the gate does — unique sentences until it frames
for (let k = 0; k < 6; k++){
  await C.ev(pose(seats[0], seats[1], 2, 2, 5, 2, ` [wake ${k}]`)); await settle();
  const on = await C.ev(ONSCREEN);
  console.log(`wake ${k}: ${JSON.stringify(on)}`);
  if (on.length && on.every(Boolean)) break;
}

// the fault needs a PRIOR same-sentence ask, then a move
await C.ev(pose(seats[0], seats[1], 2, 2, 5, 2)); await settle();
await C.ev(pose(seats[0], seats[1], 9, 2, 10, 3)); await settle();
console.log("shot pose (9,2)/(10,3), same sentence:", JSON.stringify(await C.ev(ONSCREEN)));

// C.send resolves the WHOLE CDP message, so the bytes are under .result — not the top level.
const shot = await C.send("Page.captureScreenshot", { format: "png" });
const data = shot?.result?.data;
if (!data){ console.log("NO SCREENSHOT — CDP said:", JSON.stringify(shot).slice(0, 300)); killAll(); process.exit(2); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(data, "base64"));
console.log("wrote", OUT);
killAll();
process.exit(0);
