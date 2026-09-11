/* HOW FAR BELOW THE CARDS DOES "Tap a recipe to see its route" SIT? Seen judging sea trial 2043:
   on every SOLO and PASS-AND-PLAY phone pick the hint floated ~100px under the card stack, below
   the board, in empty sea — while on both CREW phones it sat right under the card, where his
   2026-09-09 ruling put it ("locked underneath the recipe cards so it moves with them").
   Samples, every 400ms for 9s after the picker mounts: the gap from the front card's bottom to the
   hint's top, the grid row pin (runHeightSequence's px pin, released on settle), and whether the
   card art has decoded. Solo at two phone heights. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8750+(process.pid%25), DBG=9350+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-hintgap-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
const M=`JSON.stringify((()=>{
  const f=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]'), h=document.querySelector('.pp4RcHelp');
  const g=document.getElementById('apGrid'), ap=document.getElementById('actionPanel');
  if(!f||!h) return null; const R=e=>e.getBoundingClientRect();
  const imgs=[...ap.querySelectorAll('img')], rc=[...ap.querySelectorAll('.recipeCard img')];
  const msg=ap.querySelector('.apMsg:not(.fadeOut)');
  return { gap:Math.round(R(h).top-R(f).bottom), cardTop:Math.round(R(f).top), cardBottom:Math.round(R(f).bottom), hintTop:Math.round(R(h).top),
    typed:msg?(msg.textContent||'').length:-1,
    boardBottom:Math.round(R(document.getElementById('boardwrap')).bottom),
    rows:g?g.style.gridTemplateRows:'', gridH:g?Math.round(R(g).height):0, apH:Math.round(R(ap).height),
    imgs:imgs.length, done:imgs.filter(i=>i.complete).length, recipeCardImgs:rc.length };
})())`;
try{
  for (const [w,h,m] of [[390,664,1],[390,844,1],[768,1024,1],[1280,800,0]]) {
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
    await sleep(800);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
    await waitFor(`!!document.querySelector('.pp4RcHelp')`);
    console.log(`\nsolo ${w}x${h}`);
    let last=""; const t0=Date.now();
    let worst=0, shot=false; while(Date.now()-t0<9000){ if(process.env.SHOTS&&!shot&&Date.now()-t0>2500){ shot=true; try{ const r=await C.send('Page.captureScreenshot',{format:'png'}); if(r.result?.data)(await import('node:fs')).writeFileSync(path.join(process.env.SHOTS,`hint-gap-${w}x${h}.png`),Buffer.from(r.result.data,'base64')); }catch{} } const m=await C.ev(M); if(m&&m!==last){ const o=JSON.parse(m); if(Date.now()-t0>1500) worst=Math.max(worst,o.gap); console.log(`  +${((Date.now()-t0)/1000).toFixed(1)}s gap ${o.gap} card ${o.cardTop}-${o.cardBottom} hint ${o.hintTop} board ${o.boardBottom} rows ${o.rows} typed ${o.typed}`); last=m; } await sleep(100); }
    console.log(`  WORST gap after the landing: ${worst}px`);
  }
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
