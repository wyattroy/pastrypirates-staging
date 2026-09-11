/* DOES A RELOADED VOYAGE COME BACK ZOOMED IN? — his #6 ("pass-and-play on a phone loads too zoomed
 * in"), and the screenshot he sent 2026-09-10: Day 2, the camera holding a fight at full zoom
 * (about eight squares of sea), the result line over the top half, and no captain's box — the box
 * half is the reload bug fixed that day (item 12). This reloads a voyage on a phone and reads what
 * the camera does when the game comes back.
 *   node scripts/qa/_resume_zoom_check.mjs
 * Reports the camera's zoom (640 / the board's viewBox width) before the reload and for 8 seconds
 * after it, whether the captain's box is showing, and what the last event was.
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8810 + (process.pid % 30), DBG = 9810 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-rzoom-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
const READ = `JSON.stringify((()=>{const b=document.getElementById('board');const vb=b?(b.getAttribute('viewBox')||'').split(/\\s+/).map(Number):[];
  const d=(()=>{try{return __pp_app_state_debug()}catch(e){return null}})(); const evs=d&&d.game&&d.game.events||[];
  const cap=document.getElementById('pp4Cap');
  return {zoom: vb.length===4&&vb[2]?+(640/vb[2]).toFixed(2):null, capShown: !!(cap&&getComputedStyle(cap).visibility!=='hidden'&&cap.getBoundingClientRect().height>10),
    last: evs.length?evs[evs.length-1].t:null, round: d&&d.game?d.game.round:null, battles: evs.filter(e=>e.t==='battle'||e.t==='battleflee').length};})())`;
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1500);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await wait(`!!document.getElementById('choiceSolo')`); await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Scones'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  // play until a battle has happened and at least two days have passed
  for (let i = 0; i < 260; i++) {
    await C.ev(`(()=>{const c=document.getElementById('flipCoinWrap');if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
      const btl=[...document.querySelectorAll('.btlBtn')].filter(b=>b.getAttribute('aria-disabled')!=='true');if(btl.length){btl[0].click();return 4}
      const cell=document.querySelector('.sailCell');if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
      const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>!/back|←|‹|anchor/i.test(x.textContent)&&x.getAttribute('aria-disabled')!=='true'&&!x.classList.contains('apDis')&&!x.disabled);
      const b=bs.find(x=>/attack/i.test(x.textContent))||bs.find(x=>/yarrgh|start|muse|dock/i.test(x.textContent))||bs[0];if(b){b.click();return 3}return 0})()`);
    await sleep(400);
    const r = JSON.parse(await C.ev(READ));
    if (r.battles >= 1 && r.round >= 2) break;
  }
  await sleep(1500);
  const before = JSON.parse(await C.ev(READ));
  console.log(`before the reload: day ${before.round}, ${before.battles} fight(s), last event "${before.last}", zoom ${before.zoom}×, captain's box ${before.capShown ? "showing" : "HIDDEN"}`);
  await C.ev(`location.reload()`).catch(() => {});
  const seen = [];
  const t0 = Date.now();
  await sleep(1200);
  while (Date.now() - t0 < 9000) {
    try { const r = JSON.parse(await C.ev(READ)); const k = `${r.zoom}|${r.capShown}`; if (!seen.length || seen[seen.length - 1].k !== k) seen.push({ k, ms: Date.now() - t0, ...r }); } catch {}
    await sleep(300);
  }
  for (const s of seen) console.log(`  +${String(s.ms).padStart(5)}ms after reload: zoom ${s.zoom}×, captain's box ${s.capShown ? "showing" : "HIDDEN"}, day ${s.round}, last event "${s.last}"`);
  const end = seen[seen.length - 1];
  console.log(end && end.zoom > 1.6 ? `\n  ⚠ the voyage came back ZOOMED IN (${end.zoom}×) and stayed there` : `\n  the voyage came back at ${end ? end.zoom : "?"}× — not the battle close-up`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
