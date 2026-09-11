/* TWO OLD CREW COMPLAINTS, MEASURED ON BOTH SCREENS AT ONCE.
 *   node scripts/qa/_crew_motion_check.mjs [--minutes=6]
 *
 *   W1-1  "Guest does not animate boats square by square — host, solo and pass-and-play all do."
 *         For every sail event, the sailing ship's COMPUTED transform is sampled per frame on each
 *         screen: a walked route shows many in-between positions, a snap shows one change.
 *   W1-3  "The director does not follow a guest's boat through the trade winds — it correctly
 *         follows the host's." For every trade-wind ride, the board's camera (its viewBox) and the
 *         riding ship's place on screen are sampled per frame on each screen.
 * To make rides happen, both seats take a trade-wind square whenever one is offered (the rig's
 * driver alone rarely picks one — a 2026-08-29 run was offered none in eight minutes).
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 6);
const PORT = 8700 + (process.pid % 40), DBG_H = 9700 + 2 * (process.pid % 40), DBG_G = DBG_H + 1;
const url = serve(PORT);
launch(DBG_H, path.join(REPO, `.tmp-cmotion-host-${process.pid}`));
launch(DBG_G, path.join(REPO, `.tmp-cmotion-guest-${process.pid}`));
const H = await attach(DBG_H), G = await attach(DBG_G);
await H.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
await G.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const WATCH = `(()=>{
  if(window.__cm)return "already";
  const S=window.__cm={sails:[],winds:[],seen:0,live:[]};
  const st=()=>{try{return __pp_app_state_debug()}catch(e){return null}};
  const ships=()=>{const h=document.getElementById('boardShips');return h?[...h.querySelectorAll('g')].filter(g=>g.querySelector('image')):[]};
  const vb=()=>{const b=document.getElementById('board');return b?b.getAttribute('viewBox'):''};
  const tick=()=>{
    const now=performance.now(); const a=st(); const evs=a&&a.game&&a.game.events||[];
    while(S.seen<evs.length){const e=evs[S.seen]; const n=S.seen++;
      if(e&&(e.t==='sail'||e.t==='tradewind')&&typeof e.p==='number')S.live.push({kind:e.t,n,p:e.p,t0:now,tf:[],vbs:[],off:0,frames:0,route:(e.route||[]).length});}
    const sh=ships(); const bw=document.getElementById('boardwrap'); const br=bw?bw.getBoundingClientRect():null;
    for(const L of S.live){
      const g=sh[L.p]; if(!g)continue;
      const t=getComputedStyle(g).transform; if(!L.tf.length||L.tf[L.tf.length-1]!==t)L.tf.push(t);
      const v=vb(); if(!L.vbs.length||L.vbs[L.vbs.length-1]!==v)L.vbs.push(v);
      L.frames++;
      if(br){const r=g.getBoundingClientRect();const cx=r.left+r.width/2,cy=r.top+r.height/2;if(cx<br.left||cx>br.right||cy<br.top||cy>br.bottom)L.off++;}
    }
    S.live=S.live.filter(L=>{if(now-L.t0<4500)return true;
      (L.kind==='sail'?S.sails:S.winds).push({n:L.n,p:L.p,moves:L.tf.length-1,camMoves:L.vbs.length-1,offFrames:L.off,frames:L.frames,route:L.route});return false;});
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "watching";})()`;
/* take the trade winds whenever they are offered — raced against the rig driver's 700ms beat */
const PREFER_WIND = `(()=>{if(window.__pw)return 'already';window.__pw=setInterval(()=>{const c=document.querySelector('.sailCell.sailSwept');if(c)c.dispatchEvent(new MouseEvent('click',{bubbles:true}));},250);return 'taking the trade winds when offered';})()`;
const READ = `JSON.stringify(window.__cm?{sails:__cm.sails,winds:__cm.winds,me:(()=>{try{return __pp_app_state_debug().mySeat}catch(e){return null}})()}:null)`;
let exit = 1;
setTimeout(async () => { console.log("  WATCHDOG — out of time"); try { await killAll(); } catch {} process.exit(2); }, (MINUTES + 3) * 60000).unref();
const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
try {
  const code = await makeHost(H, url, "Host Hana");
  await makeGuest(G, url, code, "Guest Gus");
  console.log(`  room ${code} — host: ${await H.ev(WATCH)}  guest: ${await G.ev(WATCH)}`);
  await startVoyage(H); await sleep(1500);
  console.log("  " + await H.ev(PREFER_WIND) + " / " + await G.ev(PREFER_WIND));
  await driver(H, url); await driver(G, url);
  const t0 = Date.now();
  while (Date.now() - t0 < MINUTES * 60000) await sleep(5000);
  await sleep(5000);
  const h = JSON.parse(await H.ev(READ)), g = JSON.parse(await G.ev(READ));
  // W1-1: sails by OTHER seats, as each screen drew them
  for (const [who, d] of [["host", h], ["guest", g]]) {
    const other = d.sails.filter(x => x.p !== d.me && x.route > 2);
    console.log(`  W1-1 ${who} screen: ${other.length} sail(s) by other captains (routes of 3+ squares) — median ${med(other.map(x => x.moves))} in-between positions, fewest ${other.length ? Math.min(...other.map(x => x.moves)) : "-"}`);
  }
  const gOther = g.sails.filter(x => x.p !== g.me && x.route > 2);
  const w11 = gOther.length >= 3 && gOther.every(x => x.moves >= 3);
  // W1-3: rides by the screen's OWN captain
  for (const [who, d] of [["host", h], ["guest", g]]) {
    const mine = d.winds.filter(x => x.p === d.me);
    console.log(`  W1-3 ${who} screen: ${mine.length} ride(s) by its own captain` + (mine.length ? ` — camera moved in ${mine.filter(x => x.camMoves > 0).length}/${mine.length}; ship off the board in ${mine.reduce((a, x) => a + x.offFrames, 0)} of ${mine.reduce((a, x) => a + x.frames, 0)} frames` : ""));
  }
  const gRides = g.winds.filter(x => x.p === g.me);
  const w13 = gRides.length ? gRides.every(x => x.offFrames === 0) : null;
  console.log(`\n  W1-1 ${w11 ? "PASS — the guest walks other captains' boats square by square" : gOther.length < 3 ? "NOT RUN — too few sails seen on the guest" : "FAIL — the guest snapped at least one boat"}`);
  console.log(`  W1-3 ${w13 === null ? "NOT RUN — the guest's boat never rode the trade winds" : w13 ? "PASS — the guest's own boat stayed on the guest's screen through every ride" : "FAIL — the guest's boat left the guest's screen during a ride"}`);
  exit = (w11 && w13 !== false) ? 0 : 1;
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
process.exit(exit);
