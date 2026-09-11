/* A TAP DURING THE ARRIVAL MUST NEVER LEAVE "BAKE THIS!" ON THE CARD BEHIND.
 *   node scripts/qa/_picker_tap_race_check.mjs
 *
 * The 2026-09-10 sea trial stuck on solo-tablet for 13 minutes: the card it had selected ended up
 * BEHIND the other one, still wearing "Bake this!", so the confirm could never reach it. The arrival
 * swaps the cards once on its own, and the swap cancelled a pending choice only when it STARTED —
 * a tap during its 380ms slide selected the card on its way to the back.
 * Two cases, real mouse, the trial's tablet size:
 *   early — tap the front card BEFORE the demo swap: the demo swap must not happen (the player's
 *           choice wins) and the card they tapped stays in front, selected.
 *   mid   — tap DURING the demo swap: whatever ends up selected must be the FRONT card, or nothing.
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8920 + (process.pid % 30), DBG = 9920 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-taprace-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(40); }
  throw new Error("timed out: " + e); };
const click = async (x, y) => {
  await C.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await C.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); };
const FRONT = `JSON.stringify((()=>{const f=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]');if(!f)return null;const r=f.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,name:(f.querySelector('.rtName')||{}).textContent}})())`;
const FINAL = `JSON.stringify([...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>b.querySelector('.recipeList')).map(c=>({pos:c.dataset.rcpos,name:(c.querySelector('.rtName')||{}).textContent,focus:c.classList.contains('pp4Focus')})))`;
async function run(label, tapAtMs) {
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1500);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await wait(`!!document.getElementById('choiceSolo')`); await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Scones'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await wait(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarrgh/i.test(x.textContent));if(b)b.click()})()`); await sleep(800);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await wait(`!!document.querySelector('#actionPanel .apBtn[data-rcpos="back"] .recipeList')`);
  const t0 = Date.now();
  let sawSwap = false, tapped = null;
  while (Date.now() - t0 < 9000) {
    if (!tapped && Date.now() - t0 >= tapAtMs) { const f = JSON.parse(await C.ev(FRONT)); if (f) { await click(f.x, f.y); tapped = { at: Date.now() - t0, name: f.name }; } }
    if (await C.ev(`!!document.querySelector('.apBtns.rcSwapping')`)) sawSwap = true;
    await sleep(40);
  }
  const fin = JSON.parse(await C.ev(FINAL));
  const focused = fin.find(c => c.focus);
  const stranded = fin.some(c => c.pos === "back" && c.focus);
  console.log(`  ${label}: tapped "${tapped && tapped.name}" at +${tapped && tapped.at}ms; demo swap ${sawSwap ? "ran" : "did NOT run"}; ` +
    `now ${fin.map(c => `${c.pos}${c.focus ? "*" : ""}:${c.name}`).join(" | ")}  ${stranded ? "✗ BAKE THIS! STRANDED ON THE BACK CARD" : "✓ no selection behind"}`);
  return { stranded, sawSwap, focused, tapped };
}
let bad = 0;
try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 768, height: 954, deviceScaleFactor: 2, mobile: true });
  // the demo swap starts RC_DELAY_MS (2000) + RC_FADE_MS (1160) + RC_LAND_MS (950) after the stack mounts
  const early = await run("early (before the demo swap)", 3300);
  if (early.stranded || early.sawSwap || !early.focused || early.focused.pos !== "front" || early.focused.name !== early.tapped.name) bad++;
  for (const at of [4150, 4250, 4350]) {
    const mid = await run(`mid-swap (+${at}ms)`, at);
    if (mid.stranded) bad++;
  }
  console.log(bad ? `\nFAIL — ${bad} case(s) wrong` : "\nPASS — the demo swap yields to a tap, and no swap can strand a selection behind");
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); bad++; } finally { await killAll(); }
process.exit(bad ? 1 : 0);
