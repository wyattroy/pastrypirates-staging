/* DOES THE RECIPE BAND LEAVE THE SCREEN WHEN A PASS-AND-PLAY DEVICE CHANGES HANDS?
 *   node scripts/qa/_pnp_band_handover.mjs
 *
 * His duty on the Q4 ruling (DECISIONS.md, 2026-09-10): the recipe header band "must not be on
 * screen when a pass-and-play device changes hands." A real pass-and-play voyage, four captains at
 * one screen: each captain taps "Check my recipe" on their turn (so there IS a recipe on screen to
 * leak), and at every "Pass the wheel to …" card the band is read. It FAILS if any hand-over card
 * shares the screen with a recipe name. A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8780 + (process.pid % 40), DBG = 9780 + (process.pid % 40);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-pnpband-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 30000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
const BAND = `JSON.stringify((()=>{const b=document.getElementById('capRecipeBand');
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'};
  const name=b&&b.querySelector('.capRecipeName');
  const go=document.getElementById('passHelmGo');
  return {hand:vis(go), handTo:go?(document.querySelector('#actionPanel .apMsg')||{}).textContent:'', bandShown:vis(b), recipe:vis(name)?name.textContent.trim():null,
    check:vis(b&&b.querySelector('.checkRecipeBtn')), active:(window.__pp_app_state_debug&&__pp_app_state_debug().activeTurnSeat)};})())`;
let hands = 0, leaks = 0, reveals = 0;
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1500);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','pp-'+Math.floor(Math.random()*1e9));true`);
  await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await wait(`(()=>{const e=document.getElementById('choicePassPlay');return !!(e&&e.offsetParent)})()`);
  await C.ev(`document.getElementById('choicePassPlay').click();true`); await sleep(900);
  if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
    await C.ev(`document.getElementById('nameModalInput').value='Anne Bonny';document.getElementById('btnNameConfirm').click();true`); await sleep(900); }
  await wait(`(()=>{const b=document.getElementById('btnStartPassPlay');return !!(b&&b.offsetParent)})()`);
  await C.ev(`['Anne Bonny','Mary Read','Calico Jack','Ned Low'].forEach((n,i)=>{const e=document.getElementById('ppName'+i);if(e)e.value=n;});document.getElementById('btnStartPassPlay').click();true`);
  for (let i = 0; i < 260 && hands < 8; i++) {
    const b = JSON.parse(await C.ev(BAND));
    if (process.env.DEBUG && i % 15 === 0) console.log(`  [${i}] ${JSON.stringify(b)} ` + await C.ev(`(()=>{const m=document.querySelector('#actionPanel');return (m?m.innerText:'').replace(/\s+/g,' ').slice(0,110)+' | btns: '+[...document.querySelectorAll('#actionPanel .apBtn, #actionPanel button')].filter(x=>x.offsetParent).map(x=>x.id||x.innerText.trim().slice(0,14)).join(',')})()`));
    if (b.hand) {
      hands++;
      const leaked = b.bandShown && !!b.recipe;
      if (leaked) leaks++;
      console.log(`  hand-over ${hands}: "${(b.handTo || '').trim().slice(0, 40)}" — band ${b.bandShown ? 'SHOWN' : 'hidden'}${b.recipe ? `, showing "${b.recipe}"` : ''}  ${leaked ? '✗ LEAK' : '✓'}`);
      await C.ev(`document.getElementById('passHelmGo').click()`); await sleep(700); continue;
    }
    if (b.check) { await C.ev(`document.querySelector('#capRecipeBand .checkRecipeBtn').click()`); await sleep(500);
      const a = JSON.parse(await C.ev(BAND)); if (a.recipe) { reveals++; } continue; }
    await C.ev(`(()=>{
      const c=document.getElementById('flipCoinWrap');
      if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
      const cell=document.querySelector('.sailCell');
      if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
      const btl=[...document.querySelectorAll('.btlBtn')].filter(b=>b.getAttribute('aria-disabled')!=='true');
      if(btl.length){btl[0].click();return 4}
      /* ⚠ NOT offsetParent: the action fan's buttons are position:fixed, and offsetParent is ALWAYS
         null for a fixed element — the first run of this probe sat at "what'll ye do" for 200 ticks
         with three live buttons it had filtered out. The rig driver's own filters, instead. */
      const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>x.id!=='passHelmGo'&&!/back|←|‹|anchor/i.test(x.textContent)
        &&x.getAttribute('aria-disabled')!=='true'&&!x.classList.contains('apDis')&&x.disabled!==true);
      const b=bs.find(x=>x.classList.contains('primary'))||bs.find(x=>/dock|muse|nah|start|end|done/i.test(x.textContent))||bs[0];
      if(b){b.click();return 3} return 0;})()`);
    await sleep(450);
  }
  console.log(`\n${hands} hand-over(s) watched, ${reveals} recipe reveal(s) by the captain at the helm, ${leaks} leak(s)`);
  console.log(!hands ? "NOT RUN — never reached a hand-over, so this proves nothing" : !reveals ? "INCONCLUSIVE — no captain ever had a recipe on screen to leak" : leaks ? "FAIL — a recipe shared the screen with a hand-over" : "PASS — no hand-over ever showed a recipe");
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
