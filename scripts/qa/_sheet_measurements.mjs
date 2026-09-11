/* THE NUMBERS HIS SHEET'S QUESTIONS NEED, measured rather than described (CLAUDE.md: put the
 * measurement IN the question). One browser, three readings:
 *   a. "Play again!" over the award cards — how much of which card it covers, on a phone
 *   b. the empty stretch of the desktop right-hand column at 1890x960, mid-voyage
 *   c. the recipe title: the tuner drew it in Zilla Slab, the game draws it in Georgia bold — how
 *      much wider is his 19.5px in the game than what he saw?
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8840 + (process.pid % 30), DBG = 9840 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-sheetm-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
try {
  /* a — the end card on a phone */
  await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url + "?endcard=1")}`).catch(() => {});
  await wait(`!!document.querySelector('.pp4Again')&&document.querySelectorAll('.awardCard').length>0`, 60000);
  await sleep(2500);
  const a = JSON.parse(await C.ev(`JSON.stringify((()=>{
    const b=document.querySelector('.pp4Again').getBoundingClientRect();
    const cards=[...document.querySelectorAll('.awardCard')].map(c=>{const r=c.getBoundingClientRect();
      const ov=Math.max(0,Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top))*Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left));
      return {name:(c.querySelector('.awardName')||{}).textContent, top:Math.round(r.top), bottom:Math.round(r.bottom), covered:Math.round(ov), area:Math.round(r.width*r.height)};});
    const hit=cards.filter(c=>c.covered>0);
    return {btn:{top:Math.round(b.top),bottom:Math.round(b.bottom),h:Math.round(b.height)}, cards:cards.length, hit, vh:innerHeight};
  })())`));
  console.log(`a. Play again! at y ${a.btn.top}-${a.btn.bottom} (${a.btn.h}px) on a ${a.vh}px phone; ${a.cards} award card(s) laid out`);
  for (const c of a.hit) console.log(`   covers "${c.name}" — ${Math.round(100 * c.covered / c.area)}% of the card (${c.top}-${c.bottom})`);
  if (!a.hit.length) console.log("   covers no award card at rest (scroll position as the card lands)");

  /* b — the desktop column mid-voyage */
  await C.send("Emulation.setDeviceMetricsOverride", { width: 1890, height: 960, deviceScaleFactor: 1, mobile: false });
  await C.ev(`localStorage.clear()`); await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(2300);
  await wait(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  for (let i = 0; i < 90; i++) {
    await C.ev(`(()=>{const c=document.getElementById('flipCoinWrap');if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
      const cell=document.querySelector('.sailCell');if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
      const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>!/back|←|‹|anchor/i.test(x.textContent)&&x.getAttribute('aria-disabled')!=='true'&&!x.classList.contains('apDis')&&!x.disabled);
      const b=bs.find(x=>/nah|start|muse|dock/i.test(x.textContent))||bs[0];if(b){b.click();return 3}return 0})()`);
    await sleep(400);
    const r = await C.ev(`(()=>{const d=window.__pp_app_state_debug&&__pp_app_state_debug();return d&&d.game?d.game.round:0})()`).catch(() => 0);
    if (r >= 2) break;
  }
  await sleep(1500);
  const b = JSON.parse(await C.ev(`JSON.stringify((()=>{const R=id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right)}};
    return {cap:R('pp4Cap'), foot:R('footerRow'), board:R('boardwrap'), vh:innerHeight};})())`));
  console.log(`b. 1890x960 mid-voyage: captain's box ${b.cap ? b.cap.t + "-" + b.cap.b : "?"}, menu from ${b.foot ? b.foot.t : "?"} — ${b.cap && b.foot ? (b.foot.t - b.cap.b) + "px of empty column between them" : "n/a"} (board ${b.board ? b.board.t + "-" + b.board.b : "?"})`);

  /* c — the two typefaces */
  const c = JSON.parse(await C.ev(`(async()=>{
    const l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@600;700&display=swap';document.head.appendChild(l);
    await new Promise(r=>{l.onload=r;l.onerror=r;setTimeout(r,6000)});
    try{await document.fonts.load('600 19.5px "Zilla Slab"');}catch(e){}
    const w=(font,weight)=>{const s=document.createElement('span');s.style.cssText='position:fixed;left:-9999px;white-space:nowrap;font-size:19.5px;letter-spacing:.3px;font-family:'+font+';font-weight:'+weight;
      s.textContent='French Pots de Crème';document.body.appendChild(s);const x=s.getBoundingClientRect().width;s.remove();return x;};
    const zillaOk=document.fonts.check('600 19.5px "Zilla Slab"');
    return JSON.stringify({game:w('Georgia, "Times New Roman", serif',800), tuner:w('"Zilla Slab", Georgia, serif',400), zillaOk});})()`));
  console.log(`c. "French Pots de Crème" at 19.5px — game (Georgia bold) ${c.game.toFixed(0)}px, tuner (Zilla Slab${c.zillaOk ? "" : " — NOT LOADED, fell back"}) ${c.tuner.toFixed(0)}px: the game's is ${Math.round(100 * (c.game / c.tuner - 1))}% wider; his look in the game's face would be ${(19.5 * c.tuner / c.game).toFixed(1)}px`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
