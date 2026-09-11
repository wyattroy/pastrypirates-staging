/* THE CAPTAIN'S BOX, MEASURED AGAINST HIS TWELVE RULINGS (DECISIONS.md, 2026-09-10).
 *   node scripts/qa/_captains_box_check.mjs [--shots=<dir>]
 *
 * Plays a solo voyage to day 2 with an 18-character captain name — the longest a live Firebase rule
 * allows, so the width the name column must survive — and at each size reports:
 *   · coin x on every row, and the SPREAD (his Q8: every coin starts at the same x)
 *   · whether a name that overflows its column scrolls (the marquee), on desktop too
 *   · the active captain's outline (Q3) · the recipe header band and whose recipe it shows (Q4)
 *   · the box's height against its cap, and whether it scrolls (Q11)
 * and photographs the box. A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = (process.argv.find(a => a.startsWith("--shots=")) || "").slice(8) || path.join(REPO, ".planning", "posed", "captains-box");
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8740 + (process.pid % 40), DBG = 9740 + (process.pid % 40);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-capbox-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
const LONG = "Captain Longbeards";   // 18 characters: seats/$seat/name's cap
const M = `JSON.stringify((()=>{
  const cap=document.getElementById('pp4Cap'), players=document.getElementById('players');
  if(!cap||!players) return null;
  const rows=[...players.querySelectorAll('.player-row')].filter(r=>r.offsetParent);
  const R=e=>{const r=e.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),r:Math.round(r.right),b:Math.round(r.bottom)}};
  const out=rows.map(r=>{const nm=r.querySelector('.pname'), inner=nm&&nm.firstElementChild, coin=r.querySelector('.coinsWrap');
    const cs=getComputedStyle(r);
    return {name:inner?inner.textContent:'', nameW:nm?Math.round(nm.getBoundingClientRect().width):0,
      textW:inner?inner.scrollWidth:0, marquee:!!(nm&&nm.classList.contains('marquee')),
      clipped:!!(nm&&inner&&inner.scrollWidth>nm.clientWidth+1),
      coinX:coin?Math.round(coin.getBoundingClientRect().left):null,
      active:r.classList.contains('activeTurn'), outline:cs.borderTopWidth+' '+cs.borderTopStyle,
      rowH:Math.round(r.getBoundingClientRect().height)};});
  const xs=out.map(o=>o.coinX).filter(x=>x!=null);
  const band=document.getElementById('capRecipeBand');
  return { cap:R(cap), players:R(players), scrollH:players.scrollHeight, clientH:players.clientHeight,
    overflowY:getComputedStyle(players).overflowY, rows:out, spread:xs.length?Math.max(...xs)-Math.min(...xs):null,
    band: band ? {shown:!!band.offsetParent, text:band.textContent.trim().slice(0,80), r:R(band)} : null,
    vw:innerWidth, vh:innerHeight };
})())`;
const SIZES = [{ w: 390, h: 844, m: 1 }, { w: 768, h: 1024, m: 1 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 }];
let bad = 0;
try {
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1600);
  for (const s of SIZES) {
    await C.send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: !!s.m });
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2300);
    await wait(`!!document.getElementById('choiceSolo')`);
    await C.ev(`document.getElementById('choiceSolo').click()`);
    await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value=${JSON.stringify(LONG)}`);
    await C.ev(`document.getElementById('btnNameConfirm').click()`);
    await wait(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
    for (let i = 0; i < 90; i++) {
      await C.ev(`(()=>{
        const c=document.getElementById('flipCoinWrap');
        if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
        const cell=document.querySelector('.sailCell');
        if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
        const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>x.offsetParent&&!/back|←|‹/i.test(x.textContent));
        const b=bs.find(x=>/nah|start/i.test(x.textContent))||bs[0];
        if(b){b.click();return 3} return 0;})()`);
      await sleep(400);
      const r = await C.ev(`(()=>{const d=window.__pp_app_state_debug&&__pp_app_state_debug();return d&&d.game?d.game.round:0})()`).catch(() => 0);
      if (r >= 2) break;
    }
    await sleep(1200);
    const m = JSON.parse(await C.ev(M) || "null");
    if (!m) { console.log(`${s.w}x${s.h}: no captains box`); bad++; continue; }
    console.log(`\n${s.w}x${s.h}  box ${m.cap.w}x${m.cap.h} at (${m.cap.l},${m.cap.t})   rows ${m.rows.length}   coin spread ${m.spread}px`);
    for (const r of m.rows) console.log(`   ${r.active ? '▶' : ' '} ${r.name.padEnd(20)} name col ${String(r.nameW).padStart(3)}px (text ${r.textW})  coin x ${r.coinX}  ${r.clipped ? (r.marquee ? 'scrolls' : 'CLIPPED, NOT SCROLLING') : 'fits'}  row ${r.rowH}px  border ${r.outline}`);
    console.log(`   recipe band: ${m.band ? (m.band.shown ? `"${m.band.text}"` : 'present, hidden') : 'none'}   list ${m.clientH}/${m.scrollH}px, overflow-y ${m.overflowY}`);
    /* HIS Q11, POSED: "Cap it and scroll. The board does not give way." Three captains are given a
       hold too big for one line, and the board's height and the list's are read before and after. */
    const cap = JSON.parse(await C.ev(`(()=>{const L=document.getElementById('players'), B=document.getElementById('boardwrap');
      const bh0=Math.round(B.getBoundingClientRect().height), lh0=L.clientHeight;
      const rows=[...L.querySelectorAll('.chips')].slice(0,3); const saved=rows.map(r=>r.innerHTML);
      const one=(document.querySelector('#capRecipeBand .chip')||document.querySelector('.chip'));
      rows.forEach(r=>{for(let k=0;k<11;k++)r.insertAdjacentHTML('beforeend',one?one.outerHTML:'<span class="chip have"></span>');});
      window.dispatchEvent(new Event('resize'));
      return new Promise(res=>setTimeout(()=>{const out={bh0,bh1:Math.round(B.getBoundingClientRect().height),lh0,lh1:L.clientHeight,sh1:L.scrollHeight};
        rows.forEach((r,k)=>r.innerHTML=saved[k]); res(JSON.stringify(out));},900));})()`));
    // the rule is the BOARD's height; scrolling is only owed where the posed holds actually wrapped
    const capOK = Math.abs(cap.bh1 - cap.bh0) <= 1 && (cap.sh1 <= cap.lh1 + 1 || cap.lh1 <= cap.lh0 + 1);
    if (!capOK) bad++;
    console.log(`   Q11 posed — three holds wrapped: list ${cap.lh0}px -> ${cap.lh1}px showing, ${cap.sh1}px of rows (${cap.sh1 > cap.lh1 + 1 ? 'scrolls' : 'nothing wrapped at this width'}); board ${cap.bh0}px -> ${cap.bh1}px  ${capOK ? '✓ the board did not give way' : '✗'}`);
    try { const r = await C.send("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, m.cap.l - 8), y: Math.max(0, m.cap.t - 8), width: Math.min(m.vw, m.cap.w + 16), height: Math.min(m.vh, m.cap.h + 16), scale: 1 } });
      if (r.result?.data) fs.writeFileSync(path.join(SHOTS, `box-${s.w}x${s.h}.png`), Buffer.from(r.result.data, "base64")); } catch {}
    try { const r = await C.send("Page.captureScreenshot", { format: "png" });
      if (r.result?.data) fs.writeFileSync(path.join(SHOTS, `full-${s.w}x${s.h}.png`), Buffer.from(r.result.data, "base64")); } catch {}
  }
  console.log(`\nshots -> ${SHOTS}`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); bad++; } finally { await killAll(); }
process.exit(bad ? 1 : 0);
