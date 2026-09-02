// w_storm_step_probe.mjs — measures ship screen position at high frequency across a live storm
// push, to settle INBOX-20260901T1351Z: "the storm moves players smoothly to their second (of 3)
// squares, pauses them there, then moves them to the 3rd square" — his hypothesis: an indexing
// issue in the per-square loop.
//
// NOT wired into npm test — a one-off measurement probe for this bug, per rule 26 (pose a question
// with a measurement, not a fourth guess). Boots a real solo game, raises cfg.storm to 1 (the
// documented method, docs/DRIVING-THE-GAME.md "Storms — raise the probability on the LIVE cfg"),
// auto-passes the human's own turns so a round boundary is actually reached, then samples every
// ship's `#boardShips` child's `style.transform` every 40ms across the push.
import { openChrome, sleep } from "../lib/cdp.mjs";
import { gameURL } from "../lib/chrome.mjs";

const DBG = 9332, HTTP = 8732;

const CLICK_FIRST_LIVE_BTN = `(() => {
  const btns = [...document.querySelectorAll('#pp4Prompt .apBtn, #actionPanel .apBtn')]
    .filter(b => { const cs = getComputedStyle(b); if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.disabled; });
  const live = btns.filter(b => !/back|\u2039/i.test((b.textContent||'')));
  const pick = live.find(b => /pass/i.test(b.textContent||'')) || live[0] || btns[0];
  if (!pick) return false;
  const r = pick.getBoundingClientRect();
  pick.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, clientX:r.left+r.width/2, clientY:r.top+r.height/2}));
  pick.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, clientX:r.left+r.width/2, clientY:r.top+r.height/2}));
  pick.click();
  return (pick.textContent||'').trim().slice(0,20);
})()`;

async function main() {
  const c = await openChrome({ W: 1280, H: 800, dbgPort: DBG, httpPort: HTTP, serveRoot: process.cwd(), profileDir: "C:/pp4-storm-probe-profile2" });
  try {
    await c.ev(`localStorage.clear()`);
    await c.nav(gameURL(HTTP));
    await sleep(1500);
    await c.ev(`document.getElementById('choiceSolo').click()`);
    await sleep(300);
    await c.ev(`document.getElementById('nameModalInput').value='Probe'`);
    await c.ev(`document.getElementById('btnNameConfirm').click()`);
    let ok = false;
    for (let i = 0; i < 40; i++) {
      ok = await c.ev(`(async()=>{ if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;} const g=window.appState.game; return !!(g&&g.players&&g.players.some(p=>p.strategy==='human')); })()`);
      if (ok) break;
      await sleep(300);
    }
    if (!ok) { console.log("FAIL: solo game never started"); return; }
    console.log("solo game started, players:", await c.ev(`appState.game.players.map(p=>p.strategy)`));

    await c.ev(`appState.game.cfg.storm = 1`);
    console.log("cfg.storm forced to 1");

    // POSE A SWEEP (rule 26): place player 0 one square upwind of a real rim cell (read off the
    // live, already-validated g.rim — never hand-reconstructed), so the next storm carries them
    // onto the whirlpool on its FIRST square, with no prior ordinary squares this run — the
    // simplest case for checking CEO Review 72's fix (paint from `was`, not the post-sweep pos).
    const posed = await c.ev(`(() => {
      const g = window.appState.game;
      const DIRS = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] };
      // TWO squares upwind of a rim cell, not one — so the storm's FIRST square is ordinary
      // (exercising pendingSquares=true) and the SECOND square is the sweep, which is the exact
      // shape CEO Review 72 found broken (a sweep AFTER at least one un-painted ordinary square).
      for (const key of g.rim) {
        const [rx,ry] = key.split(',').map(Number);
        for (const [dirKey, d] of Object.entries(DIRS)) {
          const mid = [rx-d[0], ry-d[1]];
          const start = [rx-2*d[0], ry-2*d[1]];
          if (!g.blocked(start) && !g.onRim(start) && g.islands[start.join(',')] === undefined &&
              !g.blocked(mid) && !g.onRim(mid) && g.islands[mid.join(',')] === undefined) {
            g.players[0].pos = [...start];
            return { dirKey, start, mid, rim: [rx,ry] };
          }
        }
      }
      return null;
    })()`);
    console.log("posed:", JSON.stringify(posed));
    if (posed) await c.ev(`window.appState.game.windNow = ${JSON.stringify(posed.dirKey)}`);

    // PHASE 1: drive turns (click whatever's live) until a storm event lands, or 90s elapse
    const t0 = Date.now();
    let stormIdx = -1;
    while (Date.now() - t0 < 90000) {
      if (posed) await c.ev(`window.appState.game.players[0].pos=${JSON.stringify(posed.start)};window.appState.game.windNow=${JSON.stringify(posed.dirKey)}`);
      const evs = await c.ev(`appState.game.events.length`);
      const lastStorm = await c.ev(`appState.game.events.map(e=>e.t).lastIndexOf('storm')`);
      if (lastStorm >= 0 && lastStorm !== stormIdx) {
        // only counts once we've actually seen the FIRST storm fire during this run (stormIdx starts -1)
        console.log(`storm event at index ${lastStorm}, t+${Date.now()-t0}ms, total events ${evs}`);
        stormIdx = lastStorm;
        break;
      }
      const clicked = await c.ev(CLICK_FIRST_LIVE_BTN);
      if (!clicked) await sleep(200);
      else await sleep(150);
    }
    if (stormIdx < 0) { console.log("FAIL: no storm event within 90s of driving"); return; }

    // PHASE 2: tight sampling of ship 0..N transforms for 20s right after the storm event
    const sampler = `(() => {
      const g = window.appState.game;
      const kids = [...(document.getElementById('boardShips')||{children:[]}).children];
      return { t: Date.now(), pos: g.players.map(p=>p.pos.slice()),
        tr: kids.map(k => k.style.transform), evn: g.events.length };
    })()`;
    const samples = [];
    const s0 = Date.now();
    while (Date.now() - s0 < 20000) {
      samples.push(await c.ev(sampler));
      await sleep(30);
    }
    console.log("samples:", samples.length);
    console.log("CONSOLE:", JSON.stringify(c.consoleErrs));
    const evDump = await c.ev(`window.appState.game.events.map((e,i)=>i+':'+e.t+(e.p!==undefined?'(p='+e.p+')':'')+(e.dir?'/'+e.dir:'')).join(' | ')`);
    console.log("EVENTS:", evDump);
    // per-ship trace: print a line whenever THAT ship's own pos or transform changes
    const N = samples[0].tr.length;
    for (let i = 0; i < N; i++) {
      console.log(`--- ship ${i} ---`);
      let lastPos = null, lastTr = null;
      for (const s of samples) {
        const p = JSON.stringify(s.pos[i]), tr = s.tr[i];
        if (p !== lastPos || tr !== lastTr) {
          console.log(`  t+${s.t - s0}ms evn=${s.evn} pos=${p} tr=${tr}`);
          lastPos = p; lastTr = tr;
        }
      }
    }
  } finally {
    await c.close();
  }
}
main().catch(e => { console.error("PROBE ERROR", e); process.exit(1); });
