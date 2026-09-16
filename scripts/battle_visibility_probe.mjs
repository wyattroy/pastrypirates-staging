#!/usr/bin/env node
/* A FIGHT, WATCHED FOR WHAT A PLAYER CAN SEE. Wyatt, 2026-09-16: "there's a weird little white diamond that appears in the water near my
   boat during battles. why? also, there was no smoke during battles."
     node scripts/battle_visibility_probe.mjs [width height]      (default his window, 734 920)
   A solo voyage; at the captain's first sail prompt the driver is stopped, a bot is posed beside the captain with crates and powder, and
   the captain attacks it through the game's own asyncBattle, the probe tapping each flip. Every frame, in the page: every smoke puff
   (.ppSmokePuff) and whether the dark stage is up and what is actually ON TOP at the puff's centre (elementFromPoint); every sparkle
   (.ppSpark) with its opacity and place. PREDICTION: the smoke plays while the flip stage's dark covers the board (so a player sees none);
   any visible .ppSpark during the fight is the "diamond". Up to 4 fights, until a shot lands. Reports numbers; exits 0 if it measured. */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const R = path.join(fileURLToPath(new URL("..", import.meta.url)), path.sep);
const { serve, launch, attach, killAll, sleep, DRIVER_SRC } = await import(pathToFileURL(path.join(R, "scripts", "mp_rig.mjs")).href);
const W = +(process.argv[2] || 734), H = +(process.argv[3] || 920);
const url = serve(8881); launch(9881, (process.env.TMPDIR || "/tmp") + "/pp-battle-vis-probe");
const C = await attach(9881);
let exit = 1;
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: W < 500 });
  await C.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__B={smoke:[],sparks:[],shots:0,on:false};
    (function f(){ try{ const B=window.__B; if(B.on){ const now=performance.now(), dark=!!document.getElementById('pp4Veil'), cer=document.body.classList.contains('pp4Cer');
      for(const p of document.querySelectorAll('.ppSmokePuff')){ const r=p.getBoundingClientRect(); if(r.width<1)continue; const cs=+getComputedStyle(p).opacity; if(cs<.2)continue;
        B.smoke.push([Math.round(now),dark,cer]); if(!B.shotAt)B.shotAt=now; }
      for(const s of document.querySelectorAll('.ppSpark')){ const r=s.getBoundingClientRect(), op=+getComputedStyle(s).opacity; if(op>.1) B.sparks.push([Math.round(now),Math.round(r.left),Math.round(r.top),Math.round(r.width),+op.toFixed(2),dark]); }
    } }catch(e){} requestAnimationFrame(f); })();` });
  await C.send("Page.navigate", { url }); await sleep(2500);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  for (let i = 0; i < 50; i++) { if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break; await sleep(200); }
  await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Probe';return !!i})()`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`); await sleep(1500);
  await C.ev(DRIVER_SRC(url));
  let atSail = false;
  for (let i = 0; i < 200 && !atSail; i++) { await sleep(250); atSail = await C.ev(`(()=>{ if(document.querySelectorAll('.sailCell').length){ if(window.__g&&window.__g.timer){clearInterval(window.__g.timer);window.__g.timer=null;} return true; } return false; })()`).catch(() => false); }
  if (!atSail) throw new Error("never reached the captain's sail prompt");
  let fights = 0, landed = 0;
  for (; fights < 4 && !landed; fights++) {
    const posed = await C.ev(`(async()=>{ const {appState}=await import('/src/state/index.js'); const g=appState.game, me=g.players[appState.mySeat];
      const bot=g.players.find(p=>p!==me&&p.strategy!=='human'); if(!bot) return 'no bot';
      const dirs=[[1,0],[-1,0],[0,1],[0,-1]]; let spot=null;
      for(const d of dirs){ const c=[me.pos[0]+d[0],me.pos[1]+d[1]]; if(!g.blocked(c)&&!g.isIsland(c)){spot=c;break;} }
      if(!spot) return 'no water beside the captain';
      bot.pos=spot; const ings=g.ings; me.ing=[ings[0],ings[1]]; bot.ing=[ings[2],ings[3]]; me.coins=Math.max(me.coins,8); bot.coins=Math.max(bot.coins,8);
      window.__pp4Probe={me:me.idx,bot:bot.idx};
      if(!g.__flipPatched){ const orig=g.flip.bind(g); g.flip=(p,why)=>why==='battle'?(p===me):orig(p,why); g.__flipPatched=true; }
      return g.canAttack(me,bot)?'posed':'posed but canAttack says no'; })()`);
    if (!/^posed$/.test(posed)) throw new Error("posing the fight: " + posed);
    await C.ev(`(async()=>{ const B=await import('/src/ui/board.js'); B.render&&B.render(); window.__B.on=true; return 1; })()`);
    await C.ev(`(async()=>{ const O=await import('/src/orchestrator.js'); const {appState}=await import('/src/state/index.js'); const g=appState.game;
      window.__fight=O.asyncBattle(g.players[window.__pp4Probe.me],g.players[window.__pp4Probe.bot]).then(()=>window.__fightDone=true,e=>{window.__fightDone=true;window.__fightErr=String(e);}); return 1; })()`);
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      if (process.env.SHOTS) { const at = await C.ev(`window.__B.shotAt||0`); if (at && !C.__shot) { C.__shot = 1;
        for (const [n, ms] of [["a", 0], ["b", 250], ["c", 500]]) { await sleep(ms ? 250 : 0); const r = await C.send("Page.captureScreenshot", { format: "jpeg", quality: 85 }); fs.writeFileSync(path.join(process.env.SHOTS, `shot-${n}.jpg`), Buffer.from((r.result || r).data, "base64")); } } }
      if (process.env.SHOTS && i % 3 === 1) { const r = await C.send("Page.captureScreenshot", { format: "jpeg", quality: 80 }); fs.writeFileSync(path.join(process.env.SHOTS, `fight${fights}-${String(i).padStart(3, "0")}.jpg`), Buffer.from((r.result || r).data, "base64")); }
      await C.ev(`(()=>{ const c=document.getElementById('flipCoinWrap'); if(c&&c.classList.contains('active')&&typeof c.onclick==='function'){ c.onclick(); return 'tapped'; }
        const b=[...document.querySelectorAll('.apBtn')].find(x=>x.getBoundingClientRect().width>20&&!x.disabled&&/fire|attack|flip|roll|go|call|skip|nah/i.test(x.textContent)); if(b){b.click();return 'pressed '+b.textContent.trim().slice(0,12);} return null; })()`).catch(() => null);
      if (await C.ev(`!!window.__fightDone`)) break;
    }
    landed = await C.ev(`(async()=>{ const {appState}=await import('/src/state/index.js'); return appState.game.events.filter(e=>e.t==='shotLands').length; })()`);
  }
  const B = JSON.parse(await C.ev(`JSON.stringify(window.__B)`));
  const err = await C.ev(`window.__fightErr||null`);
  const underDark = B.smoke.filter(s => s[1]).length;
  console.log(`window ${W}x${H}: ${fights} fight(s), ${landed} shot(s) landed${err ? `, fight error: ${err}` : ""}`);
  console.log(`  smoke: ${B.smoke.length} frames with a visible puff; the dark stage was up on ${underDark} of them (whether the coin covers it: see the shot-a/b/c pictures)`);
  console.log(`  sparkles (.ppSpark) showing during the fight: ${B.sparks.length} frame(s)${B.sparks.length ? `, e.g. ${JSON.stringify(B.sparks.slice(0, 3))} [t,left,top,size,opacity,darkUp]` : ""}`);
  exit = landed ? 0 : 1;
} catch (e) { console.log("PROBE FAILED: " + (e && e.stack || e)); } finally { await killAll(); }
process.exit(exit);
