/* DOES THE HELPER PILL SIT ON TOP OF THE MENU? — Wyatt, 2026-09-10, green underline on his
 * screenshot: "Tap a recipe to see its route" lying across the "Sound: ON" row.
 * Rects, not eyes: the pill's box against the menu's box, at the sizes where the menu is a column.
 * A throwaway probe, prefixed `_`, NOT in the gate chain. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8620 + (process.pid % 25), DBG = 9220 + (process.pid % 25);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-pill-${process.pid}`));
const C = await attach(DBG);
const say = console.log; let bad = 0;
const waitFor = async (e,ms=40000)=>{const t=Date.now();
  while(Date.now()-t<ms){ try{ if(await C.ev(e)) return 1; }catch{} await sleep(250); } return 0; };
const M = `JSON.stringify((()=>{
  const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();
    return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right)}};
  const pill=R(document.querySelector('.pp4RcHelp')), menu=R(document.getElementById('footerRow'));
  const card=R([...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>b.querySelector('.recipeList'))[0]);
  if(!pill||!menu)return {pill,menu,card,overlap:null};
  const ox=Math.max(0,Math.min(pill.r,menu.r)-Math.max(pill.l,menu.l));
  const oy=Math.max(0,Math.min(pill.b,menu.b)-Math.max(pill.t,menu.t));
  return {pill,menu,card,overlap:(ox>0&&oy>0)?{x:ox,y:oy}:null};})())`;
try{
  for (const s of [{n:"1920",w:1920,h:1080},{n:"1440x900 (his shot)",w:1440,h:900},{n:"1280x800",w:1280,h:800}]){
    await C.send("Emulation.setDeviceMetricsOverride",{width:s.w,height:s.h,deviceScaleFactor:1,mobile:false});
    await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1500);
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2300);
    await waitFor(`!!document.getElementById('choiceSolo')`);
    await C.ev(`document.getElementById('choiceSolo').click()`);
    await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value='wyargh host'`);
    await C.ev(`document.getElementById('btnNameConfirm').click()`);
    await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(800);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
    await waitFor(`!!document.querySelector('#actionPanel .recipeList')`);
    await waitFor(`(()=>{const b=document.getElementById('pp4Prompt');return !!b&&b.getAnimations().length>0})()`).catch(()=>{});
    await waitFor(`(()=>{const b=document.getElementById('pp4Prompt');return !!b&&b.getAnimations().length===0})()`).catch(()=>{});
    await sleep(900);
    const m = JSON.parse(await C.ev(M));
    const ok = !m.overlap;
    say(`  ${ok?"PASS":"FAIL"}  ${s.n.padEnd(20)} pill ${m.pill?`${m.pill.t}-${m.pill.b}`:"?"}  menu top ${m.menu?m.menu.t:"?"}` +
        (ok ? "  — clear" : `  — OVERLAPS by ${m.overlap.y}px`));
    if (!ok) bad++;
  }
  say(bad ? `\n${bad} FAILURE(S)` : `\nALL CLEAR — the pill clears the menu at every desktop size.`);
} catch(e){ say("PROBE FAILED: "+(e&&e.message||e)); bad++; }
finally { await killAll(); }
process.exit(bad ? 1 : 0);
