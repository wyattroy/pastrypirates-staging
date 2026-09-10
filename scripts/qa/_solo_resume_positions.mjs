/* AFTER A RELOAD, ARE THE BOATS WHERE THE GAME SAYS THEY ARE?
 *   node scripts/qa/_solo_resume_positions.mjs
 *
 * Wyatt, 2026-09-09: "there's another problem that happens when solo games are reloaded from closed
 * tabs, which is that all the boats appear at tortuga; instead they should be played to their last
 * point automatically so they appear in the correct places immediately."
 *
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8920 + (process.pid % 50), DBG = 9920 + (process.pid % 50);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-resume-${process.pid}`));
const C = await attach(DBG);
const say = console.log;
const wait = async (e, ms = 30000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };

/* THE COMPARISON IS SHIP-DOM AGAINST ENGINE-TRUTH, not a screenshot: "at Tortuga" is a claim about
   where a <g> element sits versus where game.players[i].pos says it should. */
const WHERE = `JSON.stringify((()=>{
  const g = window.__pp_app_state_debug ? __pp_app_state_debug().game : null;
  if (!g || !g.players) return null;
  const home = g.home || null;
  const eng = g.players.map(p => p && p.pos ? [p.pos[0], p.pos[1]] : null);
  // the drawn ships, by their own transform, converted back to cells
  const N = (g.cfg && g.cfg.grid) || 15, cell = 640 / N;
  /* ⚠ THE SHIPS ARE <g> IN #shipsSvg WITH AN INLINE style.transform, not an SVG transform
     ATTRIBUTE. My first version read getAttribute('transform') and found nothing at all — and then
     the probe cheerfully reported "drawn ships match the engine? NO", which was a verdict about an
     empty array. A measurement of nothing is not a measurement. */
  const host = document.getElementById('boardShips') || document.getElementById('board');
  const ships = host ? [...host.querySelectorAll('g')].filter(g => g.querySelector('image')).map(e => {
      const m = (e.style.transform || '').match(/translate\\(\\s*(-?[\\d.]+)px[ ,]+(-?[\\d.]+)px/);
      return m ? [+m[1], +m[2]] : null;
    }).filter(Boolean) : [];
  /* HIS CLAIM IS SPECIFIC — "all the boats appear at tortuga" — so test THAT, in board units,
     instead of reconstructing shipXY's per-seat dock offset (which would mean exporting a debug
     hook from production code to satisfy a probe). Every ship within one cell of home while the
     engine says otherwise is exactly the picture he described. */
  const cells = ships.map(([x,y]) => [x/cell, y/cell]);
  return { eng, ships, cells, home, replaying: __pp_app_state_debug().replaying,
           dlog: (__pp_app_state_debug().dlog || []).length, round: g.round };
})())`;

try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
  await sleep(2400);
  await wait(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await wait(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  // play far enough that ships are demonstrably NOT at home
  for (let i = 0; i < 70; i++) {
    await C.ev(`(()=>{
      const c=document.getElementById('flipCoinWrap');
      if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
      const cell=document.querySelector('.sailCell');
      if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
      const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>x.offsetParent&&!/back|←|‹/i.test(x.textContent));
      const b=bs.find(x=>/nah/i.test(x.textContent))||bs[0];
      if(b){b.click();return 3} return 0;})()`);
    await sleep(420);
    const w = JSON.parse(await C.ev(WHERE) || "null");
    if (w && w.round >= 3) break;
  }
  const before = JSON.parse(await C.ev(WHERE));
  say(`BEFORE reload  round=${before.round} dlog=${before.dlog}`);
  say(`  engine says : ${JSON.stringify(before.eng)}`);
  say(`  drawn ships : ${JSON.stringify(before.ships)}`);

  await C.ev(`location.reload()`).catch(() => {});
  await sleep(3000);
  // a resumed solo game may put up a "carry on?" door — take it
  await C.ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/resume|carry on|continue/i.test(x.textContent));if(b){b.click();return 1}return 0})()`);
  await sleep(2500);
  const t0 = Date.now();
  let after = null;
  for (let i = 0; i < 24; i++) {
    after = JSON.parse(await C.ev(WHERE) || "null");
    if (after && !after.replaying && after.round >= before.round) break;
    await sleep(500);
  }
  say(`\nAFTER reload   round=${after&&after.round} replaying=${after&&after.replaying}  (+${((Date.now()-t0)/1000).toFixed(1)}s)`);
  say(`  engine says : ${JSON.stringify(after && after.eng)}`);
  say(`  drawn ships : ${JSON.stringify(after && after.ships)}`);
  const same = after && JSON.stringify(after.eng) === JSON.stringify(before.eng);
  say(`\n  engine restored to the same squares? ${same ? "YES" : "NO — the replay did not reach the end"}`);
  const near = (a,b) => a && b && Math.abs(a[0]-b[0]) <= 1.2 && Math.abs(a[1]-b[1]) <= 1.2;
  const homeCell = after && after.home;
  const allAtHome = after && after.cells.length && homeCell &&
    after.cells.every(c => near(c, homeCell));
  const engineAwayFromHome = after && after.eng.some(p => p && homeCell && !near(p, homeCell));
  const drawnMatchesEngine = after && after.cells.length === (after.eng||[]).length &&
    after.cells.every((c,i) => near(c, after.eng[i]));
  say(`  home square: ${JSON.stringify(homeCell)}  ships(cells): ${JSON.stringify(after&&after.cells)}`);
  say(`  ALL boats parked at Tortuga while the engine says otherwise? ${allAtHome && engineAwayFromHome ? "YES — his bug, reproduced" : "no"}`);
  say(`  drawn ships match the engine?        ${drawnMatchesEngine ? "YES" : "NO — this is his bug"}`);
} catch (e) { say("PROBE FAILED:", e.message); }
finally { killAll(); }
