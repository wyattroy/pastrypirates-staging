/* HOW CLOSE SHOULD THE CAMERA GO ON A PHONE? Three pictures of the same kind of moment — a sail
 * prompt and, where one happens, a fight — at three caps on the closest zoom, via the staging-only
 * ?camcap= switch (src/ui/stage.js, DEV_CAMCAP). For his #6: "pass-and-play on a phone loads too
 * zoomed in". His phone: 393x852 @3x.
 *   node scripts/qa/_camcap_lineup.mjs --out=<dir>
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = (process.argv.find(a => a.startsWith("--out=")) || "").slice(6) || path.join(REPO, ".planning", "posed", "camcap");
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8830 + (process.pid % 30), DBG = 9830 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-camcap-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(250); }
  throw new Error("timed out: " + e); };
const ZOOM = `(()=>{const b=document.getElementById('board');const v=b?(b.getAttribute('viewBox')||'').split(/\\s+/).map(Number):[];return v.length===4&&v[2]?+(640/v[2]).toFixed(2):null})()`;
const shot = async f => { const r = await C.send("Page.captureScreenshot", { format: "png" }); if (r.result?.data) fs.writeFileSync(path.join(OUT, f), Buffer.from(r.result.data, "base64")); };
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  for (const cap of [4, 2, 1.5]) {
    await C.ev(`location.href=${JSON.stringify(url + "?camcap=" + cap)}`).catch(() => {}); await sleep(1500);
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
    await wait(`!!document.getElementById('choiceSolo')`); await C.ev(`document.getElementById('choiceSolo').click()`);
    await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
    let sail = false, fight = false;
    for (let i = 0; i < 220 && !(sail && fight); i++) {
      // photograph the FIRST sail prompt, and the first fight card, after their frames settle
      if (!sail && await C.ev(`document.querySelectorAll('.sailCell').length>0`)) {
        await sleep(1600); await shot(`sail-cap${cap}.png`); sail = true;
        console.log(`  cap ${cap}: sail prompt at zoom ${await C.ev(ZOOM)}×`);
      }
      if (!fight && await C.ev(`!!document.querySelector('.btlBtn')||/Broadside Battle/i.test(document.body.innerText)`)) {
        await sleep(900); await shot(`fight-cap${cap}.png`); fight = true;
        console.log(`  cap ${cap}: fight at zoom ${await C.ev(ZOOM)}×`);
      }
      await C.ev(`(()=>{const c=document.getElementById('flipCoinWrap');if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
        const btl=[...document.querySelectorAll('.btlBtn')].filter(b=>b.getAttribute('aria-disabled')!=='true');if(btl.length){btl[0].click();return 4}
        const cell=document.querySelector('.sailCell');if(cell){cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 2}
        const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>!/back|←|‹|anchor/i.test(x.textContent)&&x.getAttribute('aria-disabled')!=='true'&&!x.classList.contains('apDis')&&!x.disabled);
        const b=bs.find(x=>/attack/i.test(x.textContent))||bs.find(x=>/yarrgh|start|muse|dock/i.test(x.textContent))||bs[0];if(b){b.click();return 3}return 0})()`);
      await sleep(450);
    }
  }
  console.log(`shots -> ${OUT}`);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
