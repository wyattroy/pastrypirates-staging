/* IS THE RING ROUND THE ACTIVE CAPTAIN CUT OFF? Wyatt, 2026-09-12, with a phone screenshot: "the
   outline of the active captain is not accurately drawn currently... you can see it being cut off."
   The ring moved OUTSIDE the row that morning, so anything that clips or paints over the 2px beyond
   the row's border-box now shows. This names the clipper instead of guessing at it. */
import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8960+(process.pid%25), DBG=9660+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-ring-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
const M=`JSON.stringify((()=>{
  const rows=[...document.querySelectorAll('#players .player-row')];
  const a=document.querySelector('#players .player-row.activeTurn')||rows[0];
  if(!a) return {noRows:true};
  a.classList.add('activeTurn');
  const R=e=>e.getBoundingClientRect();
  const cs=getComputedStyle(a), ar=R(a);
  const i=rows.indexOf(a), below=rows[i+1]||null;
  /* every ancestor that could clip the 2px the ring lives in */
  const clippers=[]; let p=a.parentElement;
  while(p && p!==document.body){ const s=getComputedStyle(p);
    if(s.overflow!=='visible'||s.overflowX!=='visible'||s.overflowY!=='visible')
      clippers.push(\`\${p.id||p.className||p.tagName} overflow:\${s.overflow}/\${s.overflowX}/\${s.overflowY} bottom:\${Math.round(R(p).bottom)}\`);
    p=p.parentElement; }
  return { activeIndex:i, ring:cs.boxShadow, border:cs.borderBottomWidth+' '+cs.borderBottomColor,
    rowTop:Math.round(ar.top), rowBottom:Math.round(ar.bottom), rowH:Math.round(ar.height),
    marginBottom:cs.marginBottom, radius:cs.borderRadius,
    gapToNext: below ? Math.round(R(below).top-ar.bottom) : null,
    nextBg: below ? getComputedStyle(below).backgroundColor : null,
    clippers, playersRect: (()=>{const r=R(document.getElementById('players')); return Math.round(r.top)+'..'+Math.round(r.bottom);})() };
})())`;
try{
  await C.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1200);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2400);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh phone'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(900);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await waitFor(`document.querySelectorAll('#players .player-row').length>=4`);
  await sleep(2200);
  /* get past the recipe picker, or the box is behind it and the picture is of a modal */
  await C.ev(`(()=>{const c=document.querySelector('#actionPanel .apBtn.recipeCard'); if(c)c.click();})()`).catch(()=>{});
  await sleep(900);
  await C.ev(`(()=>{const p=[...document.querySelectorAll('#actionPanel .apBtn, #actionPanel button')].find(b=>/bake this/i.test(b.textContent)); if(p)p.click();})()`).catch(()=>{});
  for(let t=0;t<16;t++){ const busy=await C.ev(`!!document.querySelector('#actionPanel .apBtn.recipeCard')||document.body.classList.contains('pp4ModalOpen')`); if(!busy)break; await sleep(1000); }
  await sleep(1800);
  console.log(await C.ev(M));
  /* and a picture of the ring at 4x, because "cut off" is something you look at */
  /* whole viewport, cropped afterwards: a clip rect plus a device pixel ratio is two chances to be
     one factor of two wrong, and a picture of the wrong place looks exactly like a picture. */
  /* force the ring on and let its .25s transition finish, or the capture catches the from-state */
  await C.ev(`(()=>{document.querySelectorAll('.modalOverlay').forEach(m=>m.style.display='none');
    document.body.classList.remove('pp4ModalOpen');
    const r=document.querySelector('#players .player-row'); if(r)r.classList.add('activeTurn');})()`);
  await sleep(900);
  const s=await C.send('Page.captureScreenshot',{format:'png'});
  if(s.result?.data) fs.writeFileSync(path.join(process.argv[2]||REPO,"ring-full.png"), Buffer.from(s.result.data,'base64'));
  console.log(await C.ev(`JSON.stringify((()=>{const c=document.getElementById('pp4Cap').getBoundingClientRect(); return {capTopCss:Math.round(c.top), capBottomCss:Math.round(c.bottom), dpr:devicePixelRatio};})())`));
  /* also the recipe name, since its underline is reported missing */
  console.log(await C.ev(`JSON.stringify((()=>{const n=document.querySelector('#capRecipeBand .capRecipeName'); if(!n) return 'no band'; const c=getComputedStyle(n); return {text:n.textContent.trim(),deco:c.textDecorationLine,thick:c.textDecorationThickness,off:c.textUnderlineOffset,colour:c.textDecorationColor,fs:c.fontSize};})())`));
} catch(e){ console.log("FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
