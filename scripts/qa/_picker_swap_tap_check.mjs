/* A TAP DURING THE PICKER'S SELF-SWAP MUST CHOOSE THE CARD, NOT VANISH.
 *   node scripts/qa/_picker_swap_tap_check.mjs [root-dir]      (default: this worktree)
 *
 * Found by Wy-Blade's crate trial (sep13-trial-crates @ f0017432): three Chrome PHONE legs recorded the FIRST tap on
 * a recipe card as changing nothing for 9s. POSED on the Mac the same night, real mouse at 390x664 mobile dsf 2:
 * every tap on a still deck selects (22 of 22, dev and main); every tap landing inside the cards' one self-swap —
 * about 3.3-3.7s after both cards are drawn — selected the card and then lost it, 6 of 6 on dev 8fea1e02 and on main
 * 43a133fc too. The swap cancels a pending pick when it starts, and 612a98d4's end-of-swap rule ("the back card can
 * never be the one pending") cleared the pick made during the slide. His ruling the show was built on: "THE DEMO
 * SWAP NEVER FIGHTS THE PLAYER" (stage.js). So a tap during the slide must stop the swap and keep the tapped card in
 * front, selected.
 *
 * Measures the self-swap's start on two fresh loads first — never assumes it — then taps at five points inside it.
 * PASS: every tap ends with a card selected, and the selected card is the FRONT card (nothing stranded behind).
 * RED-PROOF: run it against a checkout of 43a133fc — it must fail. A throwaway probe, prefixed `_`, NOT in npm test.
 */
import path from "node:path"; import { spawn } from "node:child_process"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import { gameURL, PYTHON, staticServerArgs } from "../lib/chrome.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = process.argv.slice(2).find(a => !a.startsWith("--")) || REPO;   // a flag is never the root: `--confirm` alone once became a directory to serve, and spawn reported it as ENOENT
const PORT = 8850 + (process.pid % 20), DBG = 9850 + (process.pid % 20);
/* ONE SPELLING OF WHERE THE GAME IS, ONE WAY TO SERVE IT (game_url_check). This worktree goes through the rig's serve();
   any OTHER root — a checkout of 43a133fc, for the red-proof — gets the same interpreter and server args from
   lib/chrome.mjs, run in that directory. A hand-typed `python3` once failed to spawn in a background shell (ENOENT). */
let srv = { kill() {} }, url;
if (path.resolve(ROOT) === REPO) url = serve(PORT);
else { srv = spawn(PYTHON, staticServerArgs(PORT), { cwd: ROOT, stdio: "ignore" }); url = gameURL(PORT); }
launch(DBG, path.join(REPO, `.tmp-swaptap-${process.pid}`)); const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
setTimeout(async () => { console.log("WATCHDOG"); try { await killAll(); } catch {} srv.kill(); process.exit(2); }, 10 * 60000).unref();
const wait = async (e, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(40); } throw new Error("timed out: " + e.slice(0, 80)); };
const click = async (x, y) => { await C.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await C.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); };
async function openPicker() {
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1200);
  await C.ev(`localStorage.clear()`).catch(() => {}); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await wait(`!!document.getElementById('choiceSolo')`); await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='wyhost'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await wait(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr|arrgh/i.test(x.textContent));if(b)b.click()})()`); await sleep(800);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await wait(`document.querySelectorAll('#actionPanel .apBtn .recipeList').length>=2`);
}
const FRONT = `JSON.stringify((()=>{const f=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]');if(!f)return null;const r=f.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})())`;
const END = `JSON.stringify((()=>{const cs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>b.querySelector('.recipeList'));
  const sel=cs.find(c=>c.classList.contains('pp4Focus')); return {selected:!!sel, selPos:sel?sel.dataset.rcpos:null, bakeOnBack:cs.some(c=>c.dataset.rcpos==='back'&&c.querySelector('.pp4Bake'))};})())`;
let bad = 0;
try {
  const starts = [];
  for (let k = 0; k < 2; k++) {
    await openPicker();
    const r = JSON.parse(await C.ev(`new Promise(res=>{const t0=performance.now();let s=null,e=null;const tick=()=>{const on=!!document.querySelector('.rcSwapping');const t=performance.now()-t0;
      if(on&&s===null)s=t; if(!on&&s!==null&&e===null)e=t; if(e!==null||t>9000) return res(JSON.stringify({start:s&&Math.round(s),end:e&&Math.round(e)})); requestAnimationFrame(tick);};requestAnimationFrame(tick);})`));
    console.log(`  self-swap on a fresh load: +${r.start}ms to +${r.end}ms`); if (r.start != null) starts.push(r.start);
  }
  if (!starts.length) throw new Error("the self-swap never ran — cannot pose a tap inside it");
  const s0 = Math.min(...starts);
  for (const dd of [40, 110, 180, 250, 320]) {
    await openPicker();
    const t0 = Date.now(); while (Date.now() - t0 < s0 + dd) await sleep(10);
    const f = JSON.parse(await C.ev(FRONT)); await click(f.x, f.y); const at = Date.now() - t0;
    const midSwap = await C.ev(`!!document.querySelector('.rcSwapping')`);
    await sleep(2500);
    const e = JSON.parse(await C.ev(END));
    let ok = e.selected && e.selPos === "front" && !e.bakeOnBack;
    /* AND THE SECOND TAP STILL COMMITS IT — the confirm branch is untouched code, but a pick made mid-swap is new ground */
    let committed = null;
    if (ok && process.argv.includes("--confirm")) {
      const f2 = JSON.parse(await C.ev(FRONT)); if (f2) await click(f2.x, f2.y);
      const t2 = Date.now(); committed = false;
      while (Date.now() - t2 < 5000) { if (await C.ev(`!document.querySelector('#actionPanel .recipeList')`)) { committed = true; break; } await sleep(80); }
      if (!committed) ok = false;
    }
    if (!ok) bad++;
    console.log(`  ${ok ? "PASS" : "FAIL"} tap at +${at}ms (swap +${dd}ms${midSwap ? ", still sliding after the tap" : ""}): ${e.selected ? "selected, " + e.selPos + " card" : "NOTHING selected — the tap was lost"}${e.bakeOnBack ? ", Bake this! stranded behind" : ""}${committed === null ? "" : committed ? "; the second tap chose it" : "; the SECOND TAP DID NOT COMMIT"}`);
  }
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); bad++; }
finally { await killAll(); srv.kill(); }
console.log(bad ? `\nFAILED — ${bad} tap(s) inside the self-swap were lost or stranded` : "\nPASSED — a tap during the self-swap chooses the front card and keeps it");
process.exit(bad ? 1 : 0);
