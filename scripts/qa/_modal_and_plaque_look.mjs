/* LOOK AT THE TWO THINGS HE PHOTOGRAPHED, in a real game on a real phone size: the recipe card's
   close X (aligned with the other two icons, and the right colour) and the plaque (whole, inside the
   screen). 2026-09-12 — both were "verified" by reading CSS last time, which is how they shipped
   wrong.

   ⚠ AND THE FIRST VERSION OF THE PLAQUE CHECK COULD NOT FAIL, which a CEO audit caught the same
   evening: it compared `#pp4Cap`'s rect to `innerWidth`, and #pp4Cap is a block element filling its
   column — it can NEVER overflow horizontally. `overflowsLeft: 0` was true by construction on every
   build that has ever existed, before the fix and after it. docs/QA-PROCESS.md 2a: a check that
   cannot go red is not a check.

   WHAT IS MEASURED INSTEAD IS THE ROPE ITSELF, and it is the one number that tells a stretch from a
   picture frame. The rope band is the same thickness on all four sides of every one of the three
   pictures. So on screen, IF THE PICTURE IS NOT BEING STRETCHED, the band above the captains and
   the band beside them are the same number of pixels. Stretch the picture to the box instead and
   the two come apart by exactly the stretch — on a 390x217 phone box that is 20.5px of rope at the
   sides against 17.5px at the top, a 17% difference an eye reads as "the rope looks squashed."
   RED-PROOF: put `background: url(...) center / 100% 100%` back and this goes red. */
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || REPO;
const PORT=9010+(process.pid%25), DBG=9710+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-look-${process.pid}`));
const C=await attach(DBG);
/* Chrome hands back a truecolour PNG, so this only has to handle colour type 6/2 — enough to read
   pixels out of a screenshot without a dependency. */
function decodePng(buf){
  let i=8,w=0,h=0,ct=0,idat=[];
  while(i<buf.length){ const len=buf.readUInt32BE(i), t=buf.toString("ascii",i+4,i+8), d=buf.slice(i+8,i+8+len);
    if(t==="IHDR"){w=d.readUInt32BE(0);h=d.readUInt32BE(4);ct=d[9];}
    else if(t==="IDAT")idat.push(d); else if(t==="IEND")break; i+=12+len; }
  const raw=zlib.inflateSync(Buffer.concat(idat)), ch=ct===6?4:3, stride=w*ch, out=Buffer.alloc(w*h*4);
  let prev=Buffer.alloc(stride), pos=0;
  for(let y=0;y<h;y++){ const f=raw[pos++], line=Buffer.from(raw.slice(pos,pos+stride)); pos+=stride;
    for(let x=0;x<stride;x++){ const a=x>=ch?line[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0; let v=line[x];
      if(f===1)v+=a; else if(f===2)v+=b; else if(f===3)v+=((a+b)>>1);
      else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c); v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);} line[x]=v&255; }
    prev=line;
    for(let x=0;x<w;x++){ const o=(y*w+x)*4; out[o]=line[x*ch];out[o+1]=line[x*ch+1];out[o+2]=line[x*ch+2];out[o+3]=255; } }
  return {w,h,px:out};
}
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

  /* ── THE PLAQUE ── */
  /* HOW THE ROPE CAN BE STRETCHED, and there are only two ways, so both are asked:
     (1) the picture painted as a BACKGROUND at `100% 100%` — then the rope is squeezed by exactly
         (box ratio / picture ratio), and the box's ratio moves with the captain count;
     (2) the picture painted as a picture frame whose BAND is a percentage — a vertical percentage
         resolves against the box's height, which brings the same stretch in through the other door.
     A frame with a band in px cannot stretch the rope at all, because px does not know the box's
     height. The picture's own size is read from the browser, not from this file. */
  const plaque = JSON.parse(await C.ev(`(async()=>{
    const c=document.getElementById('pp4Cap'); const r=c.getBoundingClientRect(); const cs=getComputedStyle(c);
    const url=(cs.borderImageSource&&cs.borderImageSource!=='none'?cs.borderImageSource:cs.backgroundImage)
      .replace(/^url\\(["']?/,'').replace(/["']?\\).*$/,'');
    const nat = await new Promise(res=>{ const i=new Image(); i.onload=()=>res({w:i.naturalWidth,h:i.naturalHeight});
      i.onerror=()=>res({w:0,h:0}); i.src=url; });
    return JSON.stringify({ left:r.left, right:r.right, top:r.top, w:Math.round(r.width), h:Math.round(r.height),
      vw:innerWidth, vh:innerHeight, art:url.replace(/^.*plaque\\//,''), natW:nat.w, natH:nat.h,
      frame: cs.borderImageSource!=='none', band: cs.borderImageWidth, slice: cs.borderImageSlice,
      repeat: cs.borderImageRepeat, bgSize: cs.backgroundSize, pad: cs.padding });
  })()`));
  const s1=await C.send('Page.captureScreenshot',{format:'png'});
  if(s1.result?.data) fs.writeFileSync(path.join(OUT,"look-plaque.png"), Buffer.from(s1.result.data,'base64'));
  const boxRatio = plaque.w/plaque.h, artRatio = plaque.natW/plaque.natH;
  const bandIsPx = /^[\d.]+px( [\d.]+px)*$/.test((plaque.band||"").trim());
  const stretch = plaque.frame && bandIsPx ? 0 : Math.abs(boxRatio/artRatio - 1);
  console.log("PLAQUE " + JSON.stringify({
    rect: Math.round(plaque.left)+","+Math.round(plaque.right)+" w"+plaque.w+" h"+plaque.h,
    viewport: plaque.vw+"x"+plaque.vh, art: plaque.art, picture: plaque.natW+"x"+plaque.natH,
    paintedAs: plaque.frame ? "picture frame" : "stretched background",
    band: plaque.band, slice: plaque.slice, repeat: plaque.repeat, pad: plaque.pad,
    boxRatio: boxRatio.toFixed(2), pictureRatio: artRatio.toFixed(2),
    ropeStretch: (stretch*100).toFixed(0)+"%" }));
  if (!plaque.natW) console.log("FAIL the plaque picture did not load — the probe cannot judge");
  else if (plaque.frame && !bandIsPx)
    console.log(`FAIL the frame's band is "${plaque.band}" — a percentage resolves against the box's `
      + `height, so the rope thins and thickens with the captain count`);
  else if (stretch > 0.08)
    console.log(`FAIL the rope is stretched ${(stretch*100).toFixed(0)}% — the box is ${boxRatio.toFixed(2)}:1 `
      + `and the picture is ${artRatio.toFixed(2)}:1, and the box's height moves with the captain count`);
  else console.log(`PASS the rope is not stretched (${plaque.frame?"picture frame, band "+plaque.band:"ratios within 8%"})`);
  /* HIS OTHER ASK — "ensure the entire plaque is visible within the screen area." The frame is drawn
     INSIDE the border box on every side, so the question is whether that box is on screen. */
  const off = Math.max(Math.round(0-plaque.left), Math.round(plaque.right-plaque.vw));
  console.log(off>0 ? `FAIL ${off}px of the plaque is off the side of the screen`
                    : `PASS the whole plaque is inside the screen (${Math.round(plaque.left)}..${Math.round(plaque.right)} of ${plaque.vw})`);

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
