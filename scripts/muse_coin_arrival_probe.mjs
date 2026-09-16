#!/usr/bin/env node
/* A MUSE COIN, MEASURED ON A PHONE-SIZE SCREEN. Wyatt, 2026-09-16: "measure a muse coin on a real phone-size screen: the number and the
   chink must come when the coin lands, not when it's earned." Not a gate (it plays a real voyage for a minute or two) — run it by hand,
   on Wy-Blade (his rule: heavy runs never on his Mac).
     node scripts/muse_coin_arrival_probe.mjs
   A solo voyage at his iPhone 13 mini (375x812 @3x), the rig's driver sailing. Every frame, in the page: when each `pass` (muse) event is
   earned, when that captain's next coin lands (the `treasure` flight's end), every change to that captain's purse number, and every
   chink started. PASSES when, for at least MIN_MUSE muse coins: the number does NOT change between earned and landed; it changes within
   LAG_MS after landing; and a chink starts within LAG_MS after landing. Exit 0/1. */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
// fileURLToPath, never URL.pathname: on Windows .pathname is "/C:/Users/..." and the import doubles the drive (Wy-Blade, 2026-09-16)
const R = path.join(fileURLToPath(new URL("..", import.meta.url)), path.sep);
const { serve, launch, attach, killAll, sleep, DRIVER_SRC } = await import(pathToFileURL(path.join(R, "scripts", "mp_rig.mjs")).href);
const MIN_MUSE = 3, LAG_MS = 50, PLAY_S = +(process.env.PLAY_S || 300);   // 150s caught only 2 muse coins on Wy-Blade (2026-09-16)
const url = serve(8879); launch(9879, (process.env.TMPDIR || "/tmp") + "/pp-muse-coin-probe");
const C = await attach(9879);
let exit = 1;
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await C.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__M={events:[],landed:[],counts:[],chinks:[]};
    (function(){ const P=window.AudioBufferSourceNode&&AudioBufferSourceNode.prototype; if(!P)return; const o=P.start;
      P.start=function(){ try{ if(this.buffer&&Math.abs(this.buffer.duration-1.05)<.05) window.__M.chinks.push(performance.now()); }catch(e){} return o.apply(this,arguments); }; })();
    (function f(){ try{ const M=window.__M, now=performance.now();
      import('/src/state/index.js').then(({appState})=>{ const E=appState.game&&appState.game.events; if(E){ for(let i=M.events.length;i<E.length;i++) M.events.push([now,E[i].t,E[i].p]); } }).catch(()=>{});
      for(const a of document.getAnimations()){ if(a.__m||a.id!=='treasure')continue; a.__m=1; const seat=a.effect&&a.effect.target&&a.effect.target.dataset.seat; a.finished.then(()=>M.landed.push([performance.now(),+seat])).catch(()=>{}); }
      for(const n of document.querySelectorAll('[id^=coins] .coinN')){ const seat=+n.parentElement.id.replace('coins',''), t=n.textContent; if(n.__last!==t){ if(n.__last!==undefined) M.counts.push([now,seat,+n.__last,+t]); n.__last=t; } }
    }catch(e){} requestAnimationFrame(f); })();` });
  await C.send("Page.navigate", { url }); await sleep(2500);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  for (let i = 0; i < 50; i++) { if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break; await sleep(200); }
  await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Probe';return !!i})()`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`); await sleep(1500);
  await C.ev(DRIVER_SRC(url));
  let rows = [];
  for (let s = 0; s < PLAY_S; s += 2) {
    await sleep(2000);
    const M = JSON.parse(await C.ev(`JSON.stringify(window.__M)`));
    rows = [];
    for (const [tEarned, t, seat] of M.events) {
      if (t !== "pass") continue;
      const land = M.landed.find(([tl, s2]) => s2 === seat && tl > tEarned);
      if (!land) continue;
      const between = M.counts.filter(([tc, s2, a, b]) => s2 === seat && tc >= tEarned && tc < land[0] - 5 && b > a);
      const up = M.counts.find(([tc, s2, a, b]) => s2 === seat && tc >= land[0] - 5 && b > a);
      const chink = M.chinks.find(tc => tc >= land[0] - 5);
      rows.push({ seat, earnedToLand: Math.round(land[0] - tEarned), roseEarly: between.length, countLag: up ? Math.round(up[0] - land[0]) : null, chinkLag: chink != null ? Math.round(chink - land[0]) : null });
    }
    if (rows.length >= MIN_MUSE) break;
  }
  for (const r of rows) console.log(`  muse coin, captain ${r.seat}: landed ${r.earnedToLand}ms after it was earned; number rose early ${r.roseEarly} time(s); number rose ${r.countLag}ms after landing; chink ${r.chinkLag}ms after landing`);
  const good = rows.filter(r => r.roseEarly === 0 && r.countLag != null && r.countLag <= LAG_MS && r.chinkLag != null && r.chinkLag <= LAG_MS);
  exit = rows.length >= MIN_MUSE && good.length === rows.length ? 0 : 1;
  console.log(rows.length < MIN_MUSE ? `\nNOT MEASURED — only ${rows.length} muse coin(s) landed in ${PLAY_S}s of play`
    : exit ? `\nFAIL — ${rows.length - good.length} of ${rows.length} muse coins did not rise and chink as they landed` : `\nPASS — all ${rows.length} muse coins: the number and the chink came as the coin landed, never before`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.stack || e)); } finally { await killAll(); }
process.exit(exit);
