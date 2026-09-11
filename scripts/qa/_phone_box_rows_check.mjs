/* HOW MANY CAPTAINS CAN A PLAYER SEE ON A REAL PHONE? — found by eye in the paused 2026-09-10 sea
 * trial: at 390x664 (the height a phone browser actually gives the page) the captain's box showed
 * THREE of four captains for the whole voyage. The recipe band (his Q4) arrived that day, and the
 * box's room on a phone is capped so the board stays square (his Q11: "the board does not give way").
 *   node scripts/qa/_phone_box_rows_check.mjs [--h=664]
 * Mid-voyage, it counts the captain rows fully visible without scrolling, and the board's height:
 *   as shipped · with the band posed away (what the band costs) · with compact rows posed (what
 *   smaller crates would buy back). Posed, not shipped: nothing here changes the game.
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? +a.slice(k.length + 3) : d; };
const W = arg("w", 390), H = arg("h", 664);
const PORT = 8860 + (process.pid % 30), DBG = 9860 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-phonerows-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
const M = `JSON.stringify((()=>{const L=document.getElementById('players'), cap=document.getElementById('pp4Cap'), B=document.getElementById('boardwrap');
  const lr=L.getBoundingClientRect(), cr=cap.getBoundingClientRect();
  const top=Math.max(lr.top,cr.top), bot=Math.min(lr.bottom,cr.bottom,innerHeight);
  const rows=[...L.querySelectorAll('.player-row')];
  const seen=rows.filter(r=>{const q=r.getBoundingClientRect();return q.top>=top-1&&q.bottom<=bot+1;}).length;
  const band=document.getElementById('capRecipeBand'); const bh=band&&getComputedStyle(band).display!=='none'?Math.round(band.getBoundingClientRect().height):0;
  return {seen, of:rows.length, board:Math.round(B.getBoundingClientRect().height), box:Math.round(cr.height), band:bh};})())`;
const pose = css => C.ev(`(()=>{let s=document.getElementById('__pose');if(!s){s=document.createElement('style');s.id='__pose';document.head.appendChild(s);}s.textContent=${JSON.stringify(css)};return 1})()`);
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1500);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await wait(`!!document.getElementById('choiceSolo')`); await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Scones'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  for (let i = 0; i < 90; i++) {
    await C.ev(`(()=>{const c=document.getElementById('flipCoinWrap');if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
      const cell=document.querySelector('.sailCell');if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
      const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>!/back|←|‹|anchor/i.test(x.textContent)&&x.getAttribute('aria-disabled')!=='true'&&!x.classList.contains('apDis')&&!x.disabled);
      const b=bs.find(x=>/yarrgh|start|muse|dock/i.test(x.textContent))||bs[0];if(b){b.click();return 3}return 0})()`);
    await sleep(400);
    const r = await C.ev(`(()=>{const d=window.__pp_app_state_debug&&__pp_app_state_debug();return d&&d.game?d.game.round:0})()`).catch(() => 0);
    if (r >= 2) break;
  }
  await sleep(2000);
  const a = JSON.parse(await C.ev(M));
  console.log(`${W}x${H}, mid-voyage`);
  console.log(`  as shipped            : ${a.seen} of ${a.of} captains visible · board ${a.board}px · box ${a.box}px (band ${a.band}px)`);
  await pose(`#capRecipeBand{display:none!important}`); await sleep(2200);
  const b = JSON.parse(await C.ev(M));
  console.log(`  band posed away       : ${b.seen} of ${b.of} captains visible · board ${b.board}px · box ${b.box}px`);
  await pose(`body.pp4Stage #players{--rowH1:calc(22px + 2*3px + 2*2px)} body.pp4Stage .chip{width:22px;height:22px} body.pp4Stage .player-row{padding:3px 6px;margin-bottom:3px}
    #capRecipeBand{min-height:calc(22px + 2px + 5px + 2px);padding:2px 6px 5px;margin-bottom:4px} #pp4Cap{padding-top:6px;padding-bottom:6px}`); await sleep(2200);
  const c = JSON.parse(await C.ev(M));
  console.log(`  compact rows posed    : ${c.seen} of ${c.of} captains visible · board ${c.board}px · box ${c.box}px (band ${c.band}px) — crates 22px instead of 26`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
