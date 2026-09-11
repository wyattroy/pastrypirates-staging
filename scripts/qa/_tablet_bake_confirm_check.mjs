/* CAN A TABLET PLAYER CONFIRM "BAKE THIS!" AFTER SWAPPING THE CARDS?
 *   node scripts/qa/_tablet_bake_confirm_check.mjs [--w=768 --h=954]
 *
 * The 2026-09-10 sea trial stuck on solo-tablet at the recipe picker for 13 minutes:
 *   FINDING: "Cinnamon-Chocolate FudgeBake t" not clickable — occluded by apBtn recipeCard
 * i.e. the card that had been SWAPPED to the front and selected could not be clicked to confirm,
 * because another recipe card was on top at its centre. Observed once; this reproduces the trial's
 * own steps with a real mouse — swap, select, confirm — and reports what is on top at each step.
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? +a.slice(k.length + 3) : d; };
const W = arg("w", 768), H = arg("h", 954);
const PORT = 8950 + (process.pid % 30), DBG = 9950 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-tabconf-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
const click = async (x, y) => {
  await C.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await C.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await C.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); };
const STATE = `JSON.stringify((()=>{
  const cs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>b.querySelector('.recipeList'));
  const f=cs.find(c=>c.dataset.rcpos==='front')||cs[0];
  const r=f?f.getBoundingClientRect():null; const x=r?r.left+r.width/2:0, y=r?r.top+r.height/2:0;
  const hit=r?document.elementFromPoint(x,y):null;
  const d=window.__pp_app_state_debug&&__pp_app_state_debug();
  const me=d&&d.game&&d.game.players?d.game.players[d.mySeat]:null;
  return { cards:cs.map(c=>({pos:c.dataset.rcpos||'unmounted',name:(c.querySelector('.rtName')||c.querySelector('.recipeTitle')||{}).textContent,
      pe:getComputedStyle(c).pointerEvents,z:getComputedStyle(c).zIndex,focus:c.classList.contains('pp4Focus'),tf:getComputedStyle(c).transform.slice(0,40)})),
    swapping: !!document.querySelector('.apBtns.rcSwapping'),
    front:f?{x:Math.round(x),y:Math.round(y)}:null,
    onTop: hit ? (f.contains(hit)||hit===f ? 'the front card' : (hit.closest('.recipeCard') ? 'ANOTHER recipe card ('+(hit.closest('.recipeCard').dataset.rcpos||'unmounted')+')' : String(hit.className).slice(0,40))) : 'nothing',
    chosen: !!(me&&me.recipe&&me.recipe.length) };
})())`;
const show = (tag, s) => console.log(`  ${tag.padEnd(22)} ${s.cards.map(c => `${c.pos}${c.focus ? "*" : ""}:${c.name}(pe ${c.pe}, z ${c.z})`).join("  |  ")}  ${s.swapping ? "[swapping]" : ""}  -> at the front card's centre: ${s.onTop}${s.chosen ? "   RECIPE CHOSEN" : ""}`);
let exit = 1;
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(2200);
  await wait(`!!document.getElementById('choiceSolo')`); await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Scones'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await wait(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarrgh|nah/i.test(x.textContent));if(b)b.click()})()`); await sleep(800);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await wait(`!!document.querySelector('#actionPanel .apBtn[data-rcpos="back"] .recipeList')`);
  await sleep(6500);                                                   // the arrival: delay, fade, self-swap, flight
  let s = JSON.parse(await C.ev(STATE)); show("at rest", s);
  const sw = JSON.parse(await C.ev(`JSON.stringify((()=>{const b=document.querySelector('.pp4RcSwap');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})())`));
  if (!sw) throw new Error("no swap circle");
  await click(sw.x, sw.y); await sleep(250);
  s = JSON.parse(await C.ev(STATE)); show("mid-swap (+250ms)", s);
  await sleep(1500);
  s = JSON.parse(await C.ev(STATE)); show("after the swap", s);
  await click(s.front.x, s.front.y); await sleep(900);
  s = JSON.parse(await C.ev(STATE)); show("front card selected", s);
  const blocked = !/the front card/.test(s.onTop);
  await click(s.front.x, s.front.y); await sleep(1500);
  const after = JSON.parse(await C.ev(STATE));
  show("confirm tapped", after);
  console.log(after.chosen ? "\n  PASS — the swapped-in card could be selected AND confirmed" : blocked ? "\n  FAIL — the front card was covered at its own centre, so the confirm tap never reached it" : "\n  FAIL — nothing covered it, but the confirm did not choose a recipe");
  exit = after.chosen ? 0 : 1;
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
process.exit(exit);
