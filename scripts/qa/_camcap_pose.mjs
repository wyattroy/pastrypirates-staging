/* ONE MOMENT, THREE ZOOM CAPS — the posed version of _camcap_lineup.mjs, because three different
 * games made three different pictures and the zoom was not the only thing that changed.
 * One solo voyage on his phone (393x852) to its first sail prompt; then the camera is asked to
 * frame a FIGHT between his boat and the nearest captain — the framing his screenshot showed — at
 * today's fight cap (2.2×) and at 1.6× and 1.3×, each photographed after the camera settles.
 *   node scripts/qa/_camcap_pose.mjs --out=<dir>
 * Posed, dev hosts only (window.__pp4DevCamCap), nothing shipped. A throwaway probe, prefixed `_`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = (process.argv.find(a => a.startsWith("--out=")) || "").slice(6) || path.join(REPO, ".planning", "posed", "camcap");
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8870 + (process.pid % 30), DBG = 9870 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-camcapp-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
const ZOOM = `(()=>{const b=document.getElementById('board');const v=b?(b.getAttribute('viewBox')||'').split(/\\s+/).map(Number):[];return v.length===4&&v[2]?+(640/v[2]).toFixed(2):null})()`;
const shot = async f => { const r = await C.send("Page.captureScreenshot", { format: "png" }); if (r.result?.data) fs.writeFileSync(path.join(OUT, f), Buffer.from(r.result.data, "base64")); };
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1500);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await wait(`!!document.getElementById('choiceSolo')`); await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  // drive to a sail prompt on day 2 or later (ships spread out a little from home)
  for (let i = 0; i < 200; i++) {
    const d = await C.ev(`(()=>{const d=__pp_app_state_debug();return d&&d.game?d.game.round:0})()`).catch(() => 0);
    if (d >= 2 && await C.ev(`document.querySelectorAll('.sailCell').length>0`)) break;
    await C.ev(`(()=>{const c=document.getElementById('flipCoinWrap');if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
      const cell=document.querySelector('.sailCell');if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
      const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>!/back|←|‹|anchor/i.test(x.textContent)&&x.getAttribute('aria-disabled')!=='true'&&!x.classList.contains('apDis')&&!x.disabled);
      const b=bs.find(x=>/yarrgh|start|muse|dock/i.test(x.textContent))||bs[0];if(b){b.click();return 3}return 0})()`);
    await sleep(450);
  }
  await sleep(1800);
  const pair = JSON.parse(await C.ev(`JSON.stringify((()=>{const d=__pp_app_state_debug();const g=d.game;const me=d.mySeat;const p0=g.players[me].pos;
    let best=null,bd=1e9;g.players.forEach((p,i)=>{if(i===me)return;const dd=Math.abs(p.pos[0]-p0[0])+Math.abs(p.pos[1]-p0[1]);if(dd<bd){bd=dd;best=i;}});return [me,best,bd];})())`));
  console.log(`  posing a fight between seat ${pair[0]} and seat ${pair[1]} (${pair[2]} squares apart)`);
  for (const cap of [null, 1.6, 1.3]) {
    await C.ev(`(()=>{window.__pp4DevCamCap=${cap === null ? "null" : cap};window.__pp4.battleEnd();window.__pp4.battle(${pair[0]},${pair[1]});return 1})()`);
    await sleep(1300);
    const z = await C.ev(ZOOM);
    await shot(`fight-${cap === null ? "today" : cap}.png`);
    console.log(`  cap ${cap === null ? "today (2.2)" : cap}: framed at ${z}×`);
  }
  await C.ev(`(()=>{window.__pp4DevCamCap=null;window.__pp4.battleEnd();return 1})()`);
  console.log(`shots -> ${OUT}`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
