/* DOES A BOT'S DOCK COIN WAIT FOR ITS BOAT TO ARRIVE? Wyatt, 2026-09-13: "There's still a minor problem
   where bots begin docking BEFORE they have arrived at their dock -- i know I'm not hallucinating it
   because I can see the coin flip moving with their boat as it animates through the water."
   A real solo voyage at his iPhone 13 mini size, autoplayed. Every tiny coin is watched from the frame
   it appears to the frame it leaves, and so is ITS OWN captain's ship — the SVG <g> whose inline
   transform is the ship's position in BOARD units, which the camera never touches. If that transform
   changes while the coin is up, the coin was drawn before the boat had arrived. */
import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, driver } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 3);
const PORT = 8905 + (process.pid % 25), DBG = 9605 + (process.pid % 25);
const url = serve(PORT); launch(DBG, path.join(REPO, `.tmp-bda-${process.pid}`));
const C = await attach(DBG);
let bad = 0; const fail = m => { bad++; console.log("FAIL " + m); }, pass = m => console.log("PASS " + m);
const waitFor = async (e, ms = 45000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(200); } throw new Error("timed out: " + e); };
const WATCH = `(()=>{ if(window.__bda) return 'already';
  const S=window.__bda={coins:[],live:new Map()};
  const ship=i=>{const h=document.getElementById('boardShips');return h&&h.children[i]?h.children[i].style.transform:'';};
  const tick=()=>{ const now=performance.now();
    document.querySelectorAll('.dcoin').forEach(c=>{ if(!S.live.has(c)){ const i=+c.dataset.seat; S.live.set(c,{seat:i,t0:now,start:ship(i),moves:0,lastMoveMs:0,prev:ship(i)}); } });
    for(const [c,L] of S.live){ const now2=ship(L.seat); if(now2!==L.prev){L.moves++;L.lastMoveMs=Math.round(now-L.t0);L.prev=now2;}
      if(!c.isConnected){ S.coins.push({seat:L.seat,moves:L.moves,lastMoveMs:L.lastMoveMs,lifeMs:Math.round(now-L.t0)}); S.live.delete(c); } }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return 'watching'; })()`;
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(900);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(700);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await waitFor(`document.querySelectorAll('#players .player-row').length>=4`);
  console.log("  " + await C.ev(WATCH) + " · driver: " + await driver(C, url));
  const until = Date.now() + MINUTES * 60000; while (Date.now() < until) await sleep(5000);
  const coins = JSON.parse(await C.ev(`JSON.stringify(window.__bda.coins)`) || "[]");
  console.log(`  ${coins.length} tiny coins watched`);
  for (const c of coins) console.log(`   seat ${c.seat}: its ship moved ${c.moves} time(s) while its coin was up (last at +${c.lastMoveMs}ms of ${c.lifeMs}ms)`);
  const early = coins.filter(c => c.moves > 0);
  if (!coins.length) fail("no bot docked — nothing to judge");
  else if (early.length) fail(`${early.length} of ${coins.length} coins were drawn while their own boat was still sailing`);
  else pass(`all ${coins.length} coins waited for their boat to arrive`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); bad++; } finally { await killAll(); }
console.log(bad ? `\nFAILED — ${bad}` : "\nPASSED"); process.exit(bad ? 1 : 0);
