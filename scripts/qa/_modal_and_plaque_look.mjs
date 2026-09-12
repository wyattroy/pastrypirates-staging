/* LOOK AT THE TWO THINGS HE PHOTOGRAPHED, in a real game on a real phone size: the recipe card's
   close X (aligned with the other two icons, and the right colour) and the plaque (whole, inside the
   screen). 2026-09-12 — both were "verified" by reading CSS last time, which is how they shipped
   wrong. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || REPO;
const PORT=9010+(process.pid%25), DBG=9710+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-look-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=45000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
try{
  await C.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1100);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2400);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(800);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await waitFor(`document.querySelectorAll('#players .player-row').length>=4`);
  await sleep(2000);
  await C.ev(`(()=>{const c=document.querySelector('#actionPanel .apBtn.recipeCard'); if(c)c.click();})()`).catch(()=>{});
  await sleep(800);
  await C.ev(`(()=>{const p=[...document.querySelectorAll('#actionPanel .apBtn, #actionPanel button')].find(b=>/bake this/i.test(b.textContent)); if(p)p.click();})()`).catch(()=>{});
  for(let t=0;t<14;t++){ if(!(await C.ev(`!!document.querySelector('#actionPanel .apBtn.recipeCard')`))) break; await sleep(1000); }
  await sleep(1600);

  /* ── THE PLAQUE: is the whole picture inside the screen? ── */
  console.log("PLAQUE " + await C.ev(`JSON.stringify((()=>{
    const c=document.getElementById('pp4Cap'); const r=c.getBoundingClientRect(); const cs=getComputedStyle(c);
    return { rect:Math.round(r.left)+','+Math.round(r.right)+' w'+Math.round(r.width)+' h'+Math.round(r.height),
      viewport:innerWidth+'x'+innerHeight, overflowsLeft:Math.round(0-r.left), overflowsRight:Math.round(r.right-innerWidth),
      bg:(cs.backgroundImage||'').replace(/^.*plaque\\//,'').replace(/\\).*$/,''), size:cs.backgroundSize, pad:cs.padding };
  })())`));
  const s1=await C.send('Page.captureScreenshot',{format:'png'});
  if(s1.result?.data) fs.writeFileSync(path.join(OUT,"look-plaque.png"), Buffer.from(s1.result.data,'base64'));

  /* ── THE MODAL: open the recipe card by its name, then measure the three icons ── */
  await C.ev(`(()=>{const n=document.querySelector('#capRecipeBand .capRecipeName'); if(n)n.click();})()`);
  await sleep(1400);
  console.log("MODAL " + await C.ev(`JSON.stringify((()=>{
    const x=document.querySelector('#recipeModal .modalX'); if(!x) return {noX:true};
    const icons=[...document.querySelectorAll('#recipeModalBody .recipeIconBtn')].map(b=>{const r=b.getBoundingClientRect();
      return {top:Math.round(r.top), h:Math.round(r.height), right:Math.round(r.right)};});
    const r=x.getBoundingClientRect(), img=x.querySelector('img');
    return { xTop:Math.round(r.top), xH:Math.round(r.height), xRight:Math.round(r.right),
      icons, filter: img?getComputedStyle(img).filter.slice(0,60):'no img',
      titleLines: (document.querySelector('#recipeModalBody h2')||{}).offsetHeight,
      alignedWithIcons: icons.length? Math.abs(Math.round(r.top)-icons[0].top)<=1 : null };
  })())`));
  const s2=await C.send('Page.captureScreenshot',{format:'png'});
  if(s2.result?.data) fs.writeFileSync(path.join(OUT,"look-modal.png"), Buffer.from(s2.result.data,'base64'));
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
