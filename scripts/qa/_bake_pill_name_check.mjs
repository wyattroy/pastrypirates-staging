/* DOES THE "Bake this!" PILL SIT ON THE RECIPE NAME? Found judging sea trial 2043 (2026-09-10): on
   every phone pick the pill hid the name ("Choc[Bake this!]ponge Cake", "Caramel Slice" gone
   entirely), on tablets it clipped the name's top half, and on desktop it sat clear, under the
   picture. His 6.6 put it "over the middle of the card" — and since his tuner numbers, the middle
   of a phone card IS the name line.
   This measures the pill against the NAME (the visible .rtName, not its reserved box) at five
   sizes, on today's rule — and on a candidate that keeps the pill's centre on the picture's bottom
   edge unless that would touch the name (then it rises until it clears by 3px). The candidate is
   applied from here, to the live pill, so the game's code is untouched until he picks.
   Pictures: SHOTS=<dir> (default os tmpdir) — bake-<size>-<today|candidate>.png, cropped to the card. */
import fs from "node:fs"; import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.env.SHOTS || os.tmpdir();
const PORT=8720+(process.pid%25), DBG=9320+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-bake-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
const M=`JSON.stringify((()=>{
  const f=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]'); if(!f) return null;
  const p=f.querySelector('.pp4Bake'), n=f.querySelector('.rtName'), t=f.querySelector('.recipeThumb');
  if(!p||!n||!t) return {card:!!f,pill:!!p};
  const R=e=>e.getBoundingClientRect(), pr=R(p), nr=R(n), tr=R(t), fr=R(f);
  const ov=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  return { name:n.textContent, nameArea:Math.round(nr.width*nr.height), onName:Math.round(ov(pr,nr)),
    onNamePct: Math.round(100*ov(pr,nr)/(nr.width*nr.height)),
    vOverlap: Math.round(Math.max(0,Math.min(pr.bottom,nr.bottom)-Math.max(pr.top,nr.top))),
    clearOfName: Math.round(nr.top-pr.bottom), onPicturePx: Math.round(Math.max(0,tr.bottom-pr.top)),
    pillH: Math.round(pr.height), cardH: Math.round(fr.height),
    clip:{x:Math.max(0,fr.left-6),y:Math.max(0,fr.top-6),width:fr.width+12,height:fr.height+12} };
})())`;
/* THE CANDIDATE, as it would live in recipeGuard(): offsets are layout values, so the card's own
   transforms (the stack's scale and slide) cannot skew them. */
const CANDIDATE=`(()=>{const f=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]');
  const p=f.querySelector('.pp4Bake'), th=f.querySelector('.recipeThumb'), ti=f.querySelector('.recipeTitle'), n=f.querySelector('.rtName');
  const seam=th.offsetTop+th.offsetHeight, nameTop=ti.offsetTop+n.offsetTop, ph=p.offsetHeight;
  p.style.top=Math.min(seam, nameTop-3-ph/2)+'px'; return true;})()`;
const SIZES=[{w:390,h:844,m:1,tag:'phone'},{w:375,h:667,m:1,tag:'small-phone'},{w:768,h:1024,m:1,tag:'tablet'},{w:1280,h:800,tag:'desktop'},{w:1920,h:1080,tag:'wide'}];
const shot=async(f,clip)=>{ try{ const r=await C.send("Page.captureScreenshot",{format:"png",clip:{...clip,scale:1}}); if(r.result?.data) fs.writeFileSync(path.join(OUT,f),Buffer.from(r.result.data,"base64")); }catch{} };
let today=0, cand=0;
try{
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1600);
  for(const s of SIZES){
    await C.send("Emulation.setDeviceMetricsOverride",{width:s.w,height:s.h,deviceScaleFactor:1,mobile:!!s.m});
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2300);
    await waitFor(`!!document.getElementById('choiceSolo')`);
    await C.ev(`document.getElementById('choiceSolo').click()`);
    await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
    await C.ev(`document.getElementById('btnNameConfirm').click()`);
    await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(800);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
    await waitFor(`!!document.querySelector('#actionPanel .apBtn[data-rcpos="back"] .recipeList')`);
    await sleep(2600);                                      // the stack's arrival and any demo swap
    await C.ev(`document.querySelector('#actionPanel .apBtn[data-rcpos="front"]').click()`);   // the first tap
    await waitFor(`!!document.querySelector('#actionPanel .apBtn[data-rcpos="front"] .pp4Bake')`,8000);
    await sleep(500);
    const a=JSON.parse(await C.ev(M));
    if(!a||a.onName==null){ console.log(`${s.tag} ${s.w}x${s.h}: no pill (${JSON.stringify(a)})`); today++; cand++; continue; }
    await shot(`bake-${s.tag}-today.png`,a.clip);
    await C.ev(CANDIDATE); await sleep(150);
    const b=JSON.parse(await C.ev(M));
    await shot(`bake-${s.tag}-candidate.png`,b.clip);
    if(a.onName>0) today++; if(b.onName>0) cand++;
    console.log(`${s.tag.padEnd(11)} ${s.w}x${s.h}  "${a.name}"  card ${a.cardH}px, pill ${a.pillH}px`);
    console.log(`   today:     pill covers ${a.onNamePct}% of the name (${a.vOverlap}px of its height)${a.onName?' ✗':'  ✓ clear by '+a.clearOfName+'px'}; over the picture ${a.onPicturePx}px`);
    console.log(`   candidate: pill covers ${b.onNamePct}% of the name${b.onName?' ✗':'  ✓ clear by '+b.clearOfName+'px'}; over the picture ${b.onPicturePx}px; card ${b.cardH}px (unchanged: ${b.cardH===a.cardH?'✓':'✗'})`);
  }
  console.log(`\nTODAY: the pill sits on the name at ${today} of ${SIZES.length} sizes · CANDIDATE: ${cand} of ${SIZES.length}`);
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
