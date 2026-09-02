// throwaway: measure the recipe MODAL thumb, the largest pastry slot in the game.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from '../lib/cdp.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const vp of [{ n: 'desktop', W: 1280, H: 900, dsf: 2 }, { n: 'phone', W: 390, H: 844, dsf: 3 }]) {
  const t = await openChrome({ W: vp.W, H: vp.H, dbgPort: 9455, httpPort: 9456, serveRoot: ROOT, profileDir: path.join(ROOT, `.tmp-bootdiag-${vp.n}`), dsf: vp.dsf });
  try {
    await t.nav('http://127.0.0.1:9456/index.html');
    await sleep(1200); await t.ev('localStorage.clear()');
    await t.nav('http://127.0.0.1:9456/index.html'); await sleep(2500);
    await t.ev(`document.getElementById('choiceSolo').click()`); await sleep(1200);
    await t.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
    await t.ev(`document.getElementById('btnNameConfirm').click()`);
    for (let i = 0; i < 20; i++) {
      await sleep(1200);
      await t.ev(`(()=>{const b=[...document.querySelectorAll('.apBtn')];
        if(document.querySelectorAll('.recipeThumb').length===0 && b.length===1) b[0].click();})()`);
      if (await t.ev(`document.querySelectorAll('.recipeThumb').length>0`) === true) break;
    }
    // the PICKER thumb, measured with object-fit resolved
    const pick = await t.ev(`(()=>{const im=document.querySelector('.recipeThumb'); if(!im)return null;
      const r=im.getBoundingClientRect(), s=Math.min(r.width/im.naturalWidth, r.height/im.naturalHeight);
      return {css:Math.round(im.naturalWidth*s), dev:Math.round(im.naturalWidth*s*devicePixelRatio),
              nat:im.naturalWidth, box:Math.round(r.width)+'x'+Math.round(r.height)};})()`);
    console.log(`${vp.n} PICKER thumb:`, JSON.stringify(pick));
    // choose a recipe, get onto the board, then open the modal the way a player does
    await t.ev(`(()=>{const c=document.querySelectorAll('.recipeCard,.apBtn');if(c[0])c[0].click()})()`); await sleep(1000);
    await t.ev(`(()=>{const b=[...document.querySelectorAll('button,.apBtn')].find(e=>/bake this/i.test(e.textContent||''));if(b)b.click()})()`);
    await sleep(3500);
    const opened = await t.ev(`(()=>{const el=[...document.querySelectorAll('.prowRecipe')].find(e=>(e.textContent||'').trim());
      if(!el)return 'no-prowRecipe'; el.click(); return 'clicked';})()`);
    await sleep(1500);
    const mod = await t.ev(`(()=>{const im=document.querySelector('.recipeModalThumb'); if(!im)return null;
      const r=im.getBoundingClientRect(), s=Math.min(r.width/im.naturalWidth, r.height/im.naturalHeight);
      return {css:Math.round(im.naturalWidth*s), dev:Math.round(im.naturalWidth*s*devicePixelRatio),
              nat:im.naturalWidth, box:Math.round(r.width)+'x'+Math.round(r.height), src:im.getAttribute('src')};})()`);
    console.log(`${vp.n} MODAL thumb (${opened}):`, JSON.stringify(mod));
  } finally { await t.close(); }
}
