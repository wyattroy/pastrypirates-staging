/* THE TWO PARKED ITEMS, MEASURED IN ONE RUN.
   (a) does the picture's inset track the first ingredient icon's across the whole desktop range?
   (b) how far does the BACK card hang below the FRONT one, and which way does that move when the
       card shrinks? The CEO computed `top:10px at scale(.965)` => shrinking makes it protrude MORE.
       Arithmetic off a stylesheet is not a measurement; this is the measurement. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8640+(process.pid%25), DBG=9240+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-geo-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
const M=`JSON.stringify((()=>{
  const cards=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>b.querySelector('.recipeList'));
  const front=cards.find(c=>c.dataset.rcpos==='front')||cards[0];
  const back =cards.find(c=>c.dataset.rcpos==='back' )||cards[1];
  if(!front) return null;
  const R=e=>{const r=e.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right),h:Math.round(r.height),w:Math.round(r.width)}};
  const th=front.querySelector('.recipeThumb'), ic=front.querySelector('.recipeIcons'),
        icImg=front.querySelector('.recipeIcons .ri img');
  const fr=R(front), br=back?R(back):null;
  return {rcW:Math.round(parseFloat(getComputedStyle(document.querySelector('#actionPanel .apBtns')).getPropertyValue('--rcWn'))||0),
    cardW:front.offsetWidth, cardH:front.offsetHeight,
    insetImg: th?th.offsetLeft:null,
    insetIcon: (ic&&icImg)?(ic.offsetLeft+icImg.offsetLeft):null,
    backBelowFront: br?(br.b-fr.b):null,
    backAboveFront: br?(fr.t-br.t):null};})())`;
const SIZES=[{w:950,h:800},{w:1100,h:900},{w:1280,h:900},{w:1500,h:1000},{w:1680,h:1050},{w:1920,h:1080}];
try{
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1600);
  console.log(" viewport   --rcW  cardW  cardH   img  icon   diff   backBelow  backAbove");
  for(const s of SIZES){
    await C.send("Emulation.setDeviceMetricsOverride",{width:s.w,height:s.h,deviceScaleFactor:1,mobile:false});
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2300);
    await waitFor(`!!document.getElementById('choiceSolo')`);
    await C.ev(`document.getElementById('choiceSolo').click()`);
    await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value='Wyargh phone'`);
    await C.ev(`document.getElementById('btnNameConfirm').click()`);
    await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(800);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
    await waitFor(`!!document.querySelector('#actionPanel .recipeList')`);
    await waitFor(`(()=>{const b=document.getElementById('pp4Prompt');return !!b&&b.getAnimations().length>0})()`).catch(()=>{});
    await waitFor(`(()=>{const b=document.getElementById('pp4Prompt');return !!b&&b.getAnimations().length===0})()`).catch(()=>{});
    await sleep(900);
    const m=JSON.parse(await C.ev(M));
    if(!m){ console.log(`  ${s.w}x${s.h}  (no cards)`); continue; }
    const d=(m.insetImg!=null&&m.insetIcon!=null)?(m.insetImg-m.insetIcon):null;
    console.log(`  ${String(s.w+'x'+s.h).padEnd(9)} ${String(m.rcW).padStart(4)}  ${String(m.cardW).padStart(5)}  ${String(m.cardH).padStart(5)}  ${String(m.insetImg).padStart(4)} ${String(m.insetIcon).padStart(5)}  ${String(d).padStart(5)}   ${String(m.backBelowFront).padStart(8)}   ${String(m.backAboveFront).padStart(8)}`);
  }
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
