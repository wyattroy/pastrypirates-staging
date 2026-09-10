/* HOW MANY LINES DOES THE LONGEST RECIPE NAME NEED? Measured for every name in RECIPE_BOOK at each
   card width, instead of reserving a number I guessed and watching one name overflow it. */
import path from "node:path";
import { fileURLToPath } from "node:url";
/* ⚠ ROOTED OFF THIS MODULE, never off a typed path. The throwaway version of this probe carried an
   absolute /Users/wyattroy/... root because it was written in a scratch directory — which works on
   exactly one computer, and Wyatt has two. The gate chain caught it the moment it was promoted into
   scripts/, which is the gate doing its job. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8660+(process.pid%25), DBG=9260+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-t-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=30000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
try{
  await C.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(2600);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  const out = await C.ev(`(async()=>{
    const m = await import('/src/ui/recipe.js');
    const b = await import('/src/shared/index.js');
    const names = (m.RECIPE_BOOK||b.RECIPE_BOOK||[]).map(r=>r.title);
    if(!names.length) return 'NO RECIPE_BOOK EXPORT';
    document.body.classList.add('pp4Stage');
    const res=[];
    /* ⭐ MEASURED AT HIS TWO REFERENCE CARDS, and nowhere else, because the card is proportional
       now (2026-09-10): font, padding and letter-spacing all scale by --rcK, so a name wraps at a
       225px phone card exactly where it wraps at his 360px one. Two geometries answer every width. */
    for (const ref of [{size:'phone & tablet', W:360, pad:14}, {size:'desktop', W:400, pad:23}]) {
      const host=document.createElement('div');
      // the card's content box: his width, less his padding, less the card's 2px border each side
      host.style.cssText='position:fixed;left:-9999px;top:0;width:'+(ref.W-2*ref.pad-4)+'px';
      const t=document.createElement('div'); t.className='recipeTitle';
      // ⚠ padding:0 IS LOAD-BEARING — the bare class still carries the old 12px side padding, which
      // the game card no longer has; the first run of this probe measured with it and overcounted
      t.style.cssText='font-size:19.5px;line-height:1.2;letter-spacing:.3px;margin:0;padding:0';
      host.appendChild(t); document.body.appendChild(host);
      const one=(()=>{t.textContent='X';return t.offsetHeight;})();
      const lines={};
      let max=0, worst='';
      for (const n of names){ t.textContent=n; const L=Math.round(t.offsetHeight/one); lines[L]=(lines[L]||0)+1; if(L>max){max=L;worst=n;} }
      res.push({...ref, font:getComputedStyle(t).fontFamily.split(',')[0], maxLines:max, worst, namesByLineCount:lines});
      host.remove();
    }
    return JSON.stringify({count:names.length, res});
  })()`);
  console.log(out);
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
