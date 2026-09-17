/* ONE DISPLAY, TWO WINDOWS — does the GUEST see what the HOST sees?
   Wyatt, 2026-09-13:
     note 6  "Guest camera director does not seem to be zooming in and out dynamically or correctly --
              were these changes somehow made only to the host?"
     note 8  "the human players don't see each other's tiny docking coins when the other is docking.
              they should. this tiny coin flip should be displayed for all other players' docks."

   A REAL crew voyage: a host and a guest, both humans driven by the rig's autoplayer, two bots.
   Each window watches its OWN screen, frame by frame, and records for every event it receives:
     turn  whose turn, and whether THIS screen's camera moved (the board's viewBox) within 1.6s
     dock  whose dock, whether it was THIS screen's own captain, and whether a tiny coin (.dcoin)
           appeared over the hull within 3s
   Then the two windows' answers are compared. The rule being checked is the one he wrote: one
   engine, one display, different inputs — so a dock that is not yours draws a coin on YOUR screen,
   whoever docked and whichever window you are, and every turn moves every camera.

   node scripts/qa/_crew_director_coin_check.mjs [--minutes=5] */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 5);
const PORT = 8760 + (process.pid % 30), DBG_H = 9760 + 2 * (process.pid % 30), DBG_G = DBG_H + 1;
const url = serve(PORT);
launch(DBG_H, path.join(REPO, `.tmp-crewdc-host-${process.pid}`));
launch(DBG_G, path.join(REPO, `.tmp-crewdc-guest-${process.pid}`));
const H = await attach(DBG_H), G = await attach(DBG_G);
await H.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
await G.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });

const WATCH = `(()=>{
  if(window.__dc2)return "already";
  const S=window.__dc2={turns:[],docks:[],seen:0,live:[],spins:[],coins:[],coinSeen:new WeakSet(),wasSpin:false};
  const st=()=>{try{return __pp_app_state_debug()}catch(e){return null}};
  const vb=()=>{const b=document.getElementById('board');return b?b.getAttribute('viewBox'):''};
  const tick=()=>{
    const now=performance.now(); const a=st(); const evs=(a&&a.game&&a.game.events)||[];
    while(S.seen<evs.length){ const e=evs[S.seen++];
      if(!e||typeof e.p!=='number')continue;
      if(e.t==='turn') S.live.push({kind:'turn',p:e.p,t0:now,vb0:vb(),moved:false});
      /* ⚠ JUDGED AGAINST THE FLIP, NOT THE DOCK. Since b74d1da3 the tiny coin hangs off the engine's 'coinflip'
         event, recorded at the tap. A person's 'dock' event arrives only after their buy decision — by then
         the coin has long landed and faded — so a probe still watching the 3s after 'dock' reported a guest's
         dock as "0/1 drew a coin" in the very run whose timing pair showed that coin 49ms after the tap. */
      if(e.t==='coinflip'&&e.why==='dock') S.live.push({kind:'dock',p:e.p,t0:now,mine:(a.mySeat===e.p),coin:false});
    }
    /* 2026-09-13 later — "the tiny coin should flip WHEN the host's coin is flipping": when THIS screen's big coin
       starts spinning (its own captain's flip), and when a tiny coin appears here for somebody else, both on the
       wall clock the two windows share */
    const fc=document.getElementById('flipCoinWrap'); const spinning=!!(fc&&fc.classList.contains('spin'));
    if(spinning&&!S.wasSpin){ S.spins.push({t:Date.now(),seat:a&&a.mySeat}); } S.wasSpin=spinning;
    document.querySelectorAll('.dcoin').forEach(c=>{ if(!S.coinSeen.has(c)){ S.coinSeen.add(c); S.coins.push({t:Date.now(),seat:+c.dataset.seat}); } });
    for(const L of S.live){
      if(L.kind==='turn'&&vb()!==L.vb0)L.moved=true;
      if(L.kind==='dock'&&document.querySelector('.dcoin'))L.coin=true;
    }
    S.live=S.live.filter(L=>{
      const age=now-L.t0;
      if(L.kind==='turn'&&age>1600){S.turns.push({p:L.p,moved:L.moved});return false;}
      if(L.kind==='dock'&&age>3000){S.docks.push({p:L.p,mine:L.mine,coin:L.coin});return false;}
      return true;});
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "watching";})()`;
const READ = `JSON.stringify(window.__dc2?{turns:__dc2.turns,docks:__dc2.docks,spins:__dc2.spins,coins:__dc2.coins,me:(()=>{try{return __pp_app_state_debug().mySeat}catch(e){return null}})(),
  bots:(()=>{try{return __pp_app_state_debug().game.players.map(p=>p.strategy)}catch(e){return null}})()}:null)`;

let bad = 0;
const fail = m => { bad++; console.log("FAIL " + m); }, pass = m => console.log("PASS " + m);
setTimeout(async () => { console.log("  WATCHDOG — out of time"); try { await killAll(); } catch {} process.exit(2); }, (MINUTES + 4) * 60000).unref();
try {
  const code = await makeHost(H, url, "Host Hana");
  await makeGuest(G, url, code, "Guest Gus");
  await startVoyage(H); await sleep(2000);
  console.log(`  room ${code} — host: ${await H.ev(WATCH)}  guest: ${await G.ev(WATCH)}`);
  console.log(`  host driver: ${await driver(H, url)}   guest driver: ${await driver(G, url)}`);
  /* MAKE THE HUMANS DOCK. Three runs (5, 7, 14 minutes) produced 0, 4 and 0 human docks — the autoplayer
     rarely chooses one — so the one thing this probe exists to time (a person's flip seen on the other
     screen) went unmeasured. Both windows now take any Dock button the moment it is offered. */
  const PREFER_DOCK = `(()=>{if(window.__pd)return 'already';window.__pd=setInterval(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/\\bDock\\b/.test(x.textContent||'')&&!/Nah|Buy/.test(x.textContent||''));
    if(b)b.click();},350);return 'taking every dock offered';})()`;
  console.log(`  host: ${await H.ev(PREFER_DOCK)}   guest: ${await G.ev(PREFER_DOCK)}`);
  const until = Date.now() + MINUTES * 60000;
  while (Date.now() < until) { await sleep(20000); const h = JSON.parse(await H.ev(READ) || "null"), g = JSON.parse(await G.ev(READ) || "null");
    console.log(`  … host ${h ? h.turns.length + " turns/" + h.docks.length + " docks" : "-"}   guest ${g ? g.turns.length + " turns/" + g.docks.length + " docks" : "-"}`); }
  const h = JSON.parse(await H.ev(READ) || "null"), g = JSON.parse(await G.ev(READ) || "null");
  for (const [name, r] of [["HOST", h], ["GUEST", g]]) {
    if (!r) { fail(`${name}: the watcher never reported`); continue; }
    const kind = s => (r.bots && r.bots[s] === "human") ? (s === r.me ? "own captain" : "the other human") : "a bot";
    const turns = r.turns, docks = r.docks;
    const others = turns.filter(t => t.p !== r.me), movedOthers = others.filter(t => t.moved).length;
    console.log(`\n${name} (seat ${r.me}): ${turns.length} turns, ${docks.length} docks`);
    if (others.length < 4) fail(`${name}: only ${others.length} other captains' turns seen — not enough voyage to judge`);
    else if (movedOthers / others.length >= 0.8) pass(`${name}: the camera moved on ${movedOthers} of ${others.length} other captains' turns`);
    else fail(`${name}: the camera moved on only ${movedOthers} of ${others.length} other captains' turns`);
    const notMine = docks.filter(d => !d.mine), coins = notMine.filter(d => d.coin);
    const byKind = {}; for (const d of notMine) { const k = kind(d.p); byKind[k] = byKind[k] || [0, 0]; byKind[k][0]++; if (d.coin) byKind[k][1]++; }
    console.log(`  docks that were not this screen's: ${JSON.stringify(Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, `${v[1]}/${v[0]} drew a coin`])))}`);
    if (!notMine.length) fail(`${name}: no other captain docked during the run — cannot judge the coin`);
    else if (coins.length === notMine.length) pass(`${name}: a tiny coin appeared over every dock that was not this screen's own (${coins.length}/${notMine.length})`);
    else fail(`${name}: a tiny coin appeared over only ${coins.length} of ${notMine.length} docks that were not this screen's own`);
    const mineCoin = docks.filter(d => d.mine && d.coin).length;
    if (mineCoin) fail(`${name}: ${mineCoin} of this screen's OWN docks drew the tiny coin — its captain already had the big one`);
  }
  /* THE SYNC: each screen's own big-coin spin, paired with the tiny coin the OTHER screen drew for that captain */
  const pairs = [];
  for (const [flipper, watcher] of [[h, g], [g, h]]) {
    if (!flipper || !watcher) continue;
    for (const sp of flipper.spins) {
      const tiny = watcher.coins.filter(c => c.seat === sp.seat && c.t >= sp.t - 400 && c.t <= sp.t + 8000).sort((a, b) => a.t - b.t)[0];
      if (tiny) pairs.push({ seat: sp.seat, lagMs: tiny.t - sp.t });
    }
  }
  console.log(`\n  big-coin spin -> other screen's tiny coin: ${JSON.stringify(pairs)}`);
  if (!pairs.length) console.log("  (no human dock flip was paired in this run — the sync is not judged)");
  else if (pairs.every(p => p.lagMs <= 1500)) pass(`every human dock flip appeared on the other screen within ${Math.max(...pairs.map(p => p.lagMs))}ms of the big coin starting to spin (${pairs.length} flips)`);
  else fail(`a tiny coin lagged the flip it shows: ${JSON.stringify(pairs.filter(p => p.lagMs > 1500))}`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); bad++; } finally { await killAll(); }
console.log(bad ? `\nFAILED — ${bad}` : "\nPASSED — both windows frame every turn and see every other captain's dock coin");
process.exit(bad ? 1 : 0);
