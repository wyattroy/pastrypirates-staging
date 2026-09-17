/* WYATT'S 2026-09-13 NOTES 3, 4, 5 AND 7 — measured in a real game, posed rather than played.
     3  "All the board decorations are offset up and left from where they should be (trade wind
        arrows, dock coin flips, active player boat ripples)... make sure they're being drawn with
        respect to the board square window; not the page itself."
     4  "I had to 'pass the helm' to a bot player... why?!"
     5  "I can see a faint background navy blue behind the captain's box -- there should be no
        background behind the plaque"
     7  "forcing DAY 2 onto two different lines, and making the forecast impossible to see... shrink all
        the elements dynamically so that all can appear fully"
   Per size: the plaque's own shadow and background; the top bar's children all whole and on one line;
   then the camera is ZOOMED onto a boat (the director's own sail frame) and a dock coin is placed on
   that boat — the coin is an HTML board layer, so its centre landing on the hull's centre is the
   question note 3 asks. Last, pass-and-play is switched on in the page and the helm is offered to a
   BOT seat: nothing may be drawn. */
import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, driver, driverOff } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8930 + (process.pid % 25), DBG = 9630 + (process.pid % 25);
const url = serve(PORT); launch(DBG, path.join(REPO, `.tmp-sep13-${process.pid}`));
const C = await attach(DBG);
let bad = 0; const fail = m => { bad++; console.log("FAIL " + m); }, pass = m => console.log("PASS " + m);
const waitFor = async (e, ms = 45000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(200); } throw new Error("timed out: " + e); };
async function startSolo(){
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
  await sleep(1500);
  await C.ev(`(()=>{const c=document.querySelector('#actionPanel .apBtn.recipeCard'); if(c)c.click();})()`).catch(() => {});
  await sleep(700);
  await C.ev(`(()=>{const p=[...document.querySelectorAll('#actionPanel .apBtn, #actionPanel button')].find(b=>/bake this/i.test(b.textContent)); if(p)p.click();})()`).catch(() => {});
  await sleep(2600);
}
try {
  for (const [w, h, m, label] of [[375, 667, 1, "his iPhone 13 mini"], [590, 800, 0, "his just-under-600 Safari window"], [640, 720, 0, "narrow Safari window"], [711, 840, 0, "his laptop window"], [768, 1024, 1, "tablet"]]) {
    await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: !!m });
    await startSolo();
    console.log(`\n${label} ${w}x${h}`);
    /* 5 — nothing painted behind the plaque */
    const cap = JSON.parse(await C.ev(`JSON.stringify((()=>{const cs=getComputedStyle(document.getElementById('pp4Cap'));return {shadow:cs.boxShadow,bg:cs.backgroundColor};})())`));
    (cap.shadow === "none" && /rgba\(0, 0, 0, 0\)|transparent/.test(cap.bg))
      ? pass(`nothing behind the plaque (shadow ${cap.shadow}, background ${cap.bg})`)
      : fail(`the plaque still paints behind itself: shadow "${cap.shadow}", background "${cap.bg}"`);
    /* 7 — every child of the top bar whole and on one line */
    const rib = JSON.parse(await C.ev(`JSON.stringify((()=>{const r=document.getElementById('pp4Ribbon');const rr=r.getBoundingClientRect();
      const kids=[...r.children].filter(k=>getComputedStyle(k).display!=='none'&&k.getBoundingClientRect().width>0);
      const round=document.getElementById('pp4Round'), rh=parseFloat(getComputedStyle(round).lineHeight)||0;
      return {fit:r.style.getPropertyValue('--ribFit')||'1', overflowRight:Math.round(Math.max(...kids.map(k=>k.getBoundingClientRect().right))-rr.right),
        roundLines: Math.round(round.getBoundingClientRect().height/(round.getBoundingClientRect().height>0&&rh?rh*(parseFloat(r.style.getPropertyValue('--ribFit'))||1):round.getBoundingClientRect().height)),
        roundH:Math.round(round.getBoundingClientRect().height), clipped: kids.filter(k=>k.scrollWidth>k.clientWidth+1).map(k=>k.id||k.className)};})())`));
    (rib.overflowRight <= 1 && rib.clipped.length === 0 && rib.roundH <= 24)
      ? pass(`the top bar fits on one line (zoom ${rib.fit}, "DAY" ${rib.roundH}px tall, nothing clipped)`)
      : fail(`the top bar does not fit: ${JSON.stringify(rib)}`);
    /* 2026-09-13 later: "the day forecast goes onto its own line. Ideally it should be on the same line." */
    const pillIn = await C.ev(`(()=>{const p=document.getElementById('pp4Pill');return !!(p&&p.parentNode&&p.parentNode.id==='pp4Ribbon');})()`);
    if (w <= 400) (!pillIn ? pass("on his phone the forecast pill keeps its own row (the bar would need ~72% to hold it)") : fail("the forecast pill squeezed into a phone's top bar"));
    else (pillIn ? pass("the forecast pill rides the top bar on this window") : fail(`the forecast pill dropped to its own line at ${w}px wide`));
    /* 3 — zoom the director onto boat 0, then put a board-layer coin on it */
    /* WAIT FOR THE DIRECTOR TO ZOOM BY ITSELF. Asking it to frame a seat on demand read 640 (no zoom) at
       every size on the first run — day one's turn-order ceremony owns the camera. The bots' own turns
       zoom it within seconds; the question is asked the moment it is zoomed in, on the boat it framed. */
    /* ⚠ AND LET THE VOYAGE MOVE. A solo game sits on day one's "the crew draws lots" coin until the
       captain taps it, so nothing sails and nothing zooms — the second run waited 63s at every size for
       a camera that had no reason to move. The rig's own autoplayer taps coins and picks sails. */
    await driver(C, url);
    let zoomed = 0;
    for (let i = 0; i < 90 && !zoomed; i++){ const w = await C.ev(`+document.getElementById('board').getAttribute('viewBox').split(' ')[2]`); if (w && w < 560) zoomed = w; else await sleep(700); }
    const seat = await C.ev(`(()=>{try{const a=__pp_app_state_debug(); return (a.curSeat!=null?a.curSeat:(a.game&&a.game.turnOrder?a.game.turnOrder[0]:1));}catch(e){return 1}})()`);
    await C.ev(`(async()=>{const m=await import('/src/ui/dockcoin.js'); m.flipDockCoin(${Number(seat)||0},true); return 1;})()`); await sleep(420);
    const off = JSON.parse(await C.ev(`JSON.stringify((()=>{const c=document.querySelector('.dcoin'); const g=document.getElementById('boardShips').children[${Number(seat)||0}];
      if(!c||!g) return null; const cr=c.getBoundingClientRect(), gr=g.getBoundingClientRect(), vb=document.getElementById('board').getAttribute('viewBox').split(' ').map(Number);
      const wrap=document.getElementById('boardwrap').getBoundingClientRect();
      return {dx:Math.round((cr.left+cr.width/2)-(gr.left+gr.width/2)), vbW:Math.round(vb[2]), wrapW:Math.round(wrap.width), pageW:innerWidth};})())`) || "null");
    if (!off) fail("could not place a coin on boat 0 to measure the layer offset");
    else if (off.vbW >= 640) fail(`the camera never zoomed (viewBox ${off.vbW}) — the offset question cannot be asked`);
    else if (Math.abs(off.dx) <= 2) pass(`zoomed to a ${off.vbW}-unit window, a board-layer coin lands on its hull (${off.dx}px; window ${off.wrapW} inside a ${off.pageW} page)`);
    else fail(`zoomed to ${off.vbW}, the board-layer coin sits ${off.dx}px off its hull (window ${off.wrapW} inside a ${off.pageW} page)`);
    await driverOff(C);
    await sleep(1800);
  }
  /* 4 — pass-and-play never offers the helm to a bot */
  const pg = JSON.parse(await C.ev(`(async()=>{const {appState}=await import('/src/state/index.js'); const L=await import('/src/ui/lobby.js');
    const g=appState.game; const bot=g.players.findIndex(p=>p.strategy!=='human'); const was=appState.passAndPlay, me=appState.mySeat;
    appState.passAndPlay=true; let drew=false; const r=L.passGate(bot);
    await new Promise(z=>setTimeout(z,400)); drew=/pass the (wheel|board)/i.test((document.getElementById('actionPanel')||{}).textContent||'')||getComputedStyle(document.getElementById('passOverlay')).display!=='none';
    const settled=await Promise.race([r.then(()=>true),new Promise(z=>setTimeout(()=>z(false),50))]);
    appState.passAndPlay=was; appState.mySeat=me;
    return JSON.stringify({bot, strategy:g.players[bot].strategy, drew, settled, mySeatNow:me});})()`));
  (!pg.drew && pg.settled) ? pass(`pass-and-play: offering the helm to bot seat ${pg.bot} (${pg.strategy}) drew nothing and returned at once`)
    : fail(`pass-and-play asked the table to pass the helm to a bot: ${JSON.stringify(pg)}`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); bad++; } finally { await killAll(); }
console.log(bad ? `\nFAILED — ${bad}` : "\nPASSED — notes 3, 4, 5 and 7 hold at every size");
process.exit(bad ? 1 : 0);
