/* WHAT SHAPE DOES THE CAPTAIN'S BOX ACTUALLY WANT TO BE?
   Poses a real solo game (four captains, always) at five screen sizes and measures the box the art
   has to sit behind: the width it is given, the height its four rows plus the recipe band actually
   need, and the ratio between them. No guesses — every number is read off the rendered page. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8790+(process.pid%25), DBG=9390+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-capshape-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
const M=`JSON.stringify((()=>{
  const R=e=>e.getBoundingClientRect();
  const cap=document.getElementById('pp4Cap'); if(!cap) return null;
  const panel=cap.querySelector('#captainsPanel')||cap.querySelector('.panel')||cap;
  const players=document.getElementById('players');
  const band=document.getElementById('capRecipeBand');
  const rows=[...document.querySelectorAll('#players .player-row')];
  const cs=getComputedStyle(players), cap_cs=getComputedStyle(cap), p_cs=getComputedStyle(panel);
  const px=v=>Math.round(parseFloat(v)||0);
  const rowH=px(cs.getPropertyValue('--rowH1')), rowGap=px(cs.getPropertyValue('--rowGap'));
  const rowReal=rows.map(r=>Math.round(R(r).height));
  const bandH=band?Math.round(R(band).height):0;
  const bandMB=band?px(getComputedStyle(band).marginBottom):0;
  const padCap=px(cap_cs.paddingTop)+px(cap_cs.paddingBottom);
  const padPanel=px(p_cs.paddingTop)+px(p_cs.paddingBottom);
  const need = padCap+padPanel+bandH+bandMB+rowReal.reduce((a,b)=>a+b,0)+Math.max(0,rows.length-1)*rowGap;
  return { side:document.body.classList.contains('pp4Side'), bleed:document.body.classList.contains('pp4CapBleed'),
    capW:Math.round(R(cap).width), capH:Math.round(R(cap).height),
    panelW:Math.round(R(panel).width), panelH:Math.round(R(panel).height),
    playersW:Math.round(R(players).width), playersH:Math.round(R(players).height),
    scrollH:players.scrollHeight, nRows:rows.length, rowH, rowGap, rowReal, bandH, bandMB,
    padCap, padPanel, need };
})())`;
const out=[];
try{
  for (const [w,h,m,label] of [[390,844,1,'phone'],[390,664,1,'small phone'],[768,1024,1,'tablet'],[1280,800,0,'laptop side column'],[1920,1080,0,'wide desktop']]) {
    await C.send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:m?2:1,mobile:!!m});
    await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1200);
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2300);
    await waitFor(`!!document.getElementById('choiceSolo')`);
    await C.ev(`document.getElementById('choiceSolo').click()`);
    await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
    await C.ev(`document.getElementById('btnNameConfirm').click()`);
    await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(900);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
    await waitFor(`(()=>{const r=document.querySelectorAll('#players .player-row');return r.length>=4})()`);
    await sleep(1500);
    const o=JSON.parse(await C.ev(M));
    o.label=`${label} ${w}x${h}`; out.push(o);
    console.log(`\n${o.label}${o.side?'  [side column]':''}${o.bleed?'  [wall-to-wall]':''}`);
    console.log(`  box given ${o.capW} x ${o.capH}   panel ${o.panelW} x ${o.panelH}`);
    console.log(`  rows ${o.nRows} x ${o.rowH}px (real ${o.rowReal.join(',')}) gap ${o.rowGap}  band ${o.bandH}+${o.bandMB}  padding ${o.padCap}+${o.padPanel}`);
    console.log(`  HEIGHT THE CONTENT NEEDS: ${o.need}px   ->  content ratio ${(o.capW/o.need).toFixed(2)} : 1`);
  }
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
console.log("\nJSON "+JSON.stringify(out));
