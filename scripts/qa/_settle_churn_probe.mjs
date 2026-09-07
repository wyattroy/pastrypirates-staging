/* WHICH ELEMENT NEVER STOPS MOVING?
 *
 *   node scripts/qa/_settle_churn_probe.mjs
 *
 * The sea trial reported "N screen(s) never stopped moving before being checked (still moving:
 * geometry)" on every one of ten legs. That names a quantity, not a cause. My first guess was the
 * pulsing treasure X and it was WRONG — the settle probe's own selector does not include it.
 *
 * So this asks the question directly instead of guessing a second time: sample the SAME selector
 * the trial samples, quantised the SAME way, twice a frame apart, and report which entries differ.
 * A throwaway probe, prefixed `_` like the other one-offs here.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = serve(8492);
launch(9392, path.join(REPO, ".tmp-churn"));
const C = await attach(9392);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// the trial's own selector and quantisation, copied verbatim from scripts/lib/checks.mjs so this
// is measuring the same thing the trial measures — not my paraphrase of it
const SEL = '.apBtn, .btlBtn, .sailCell, .recipeCard, .bkoCard, .apSlider, #flipCoinWrap.active, .apMsg, .apSub, .pp4Bub, .pp4PeekHint, #pp4Prompt, #pp4Cap, #pp4Pill';
const SAMPLE = `(() => {
  const q = v => Math.round(v / 8);
  return [...document.querySelectorAll(${JSON.stringify(SEL)})].map((el,i) => {
    const r = el.getBoundingClientRect();
    const id = (el.id ? "#"+el.id : "") + (el.className && typeof el.className === "string" ? "."+el.className.trim().split(/\\s+/).join(".") : "");
    return i + "|" + id.slice(0,60) + "|" + q(r.left)+','+q(r.top)+','+q(r.width)+','+q(r.height);
  });
})()`;

const waitFor = async (e, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await C.ev(e)) return true; } catch {} await sleep(200);} return false; };

try {
  await C.ev(`location.href=${JSON.stringify(base)}`).catch(()=>{});
  await sleep(2000);
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.href=${JSON.stringify(base + "?pilot=vet")}`).catch(()=>{});
  await sleep(2200);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`!!(window.__pp_app_state_debug&&__pp_app_state_debug().game&&__pp_app_state_debug().game.players.some(p=>p.strategy==='human'))`, 25000);

  // walk to the sail prompt, which is where most of a leg's screens are taken
  for (let i = 0; i < 40; i++) {
    if (await C.ev(`!!document.querySelector('.sailCell')`)) break;
    await C.ev(`(()=>{const c=document.getElementById('flipCoinWrap');
      if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 1}
      const b=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>!/back|←/i.test(x.textContent)&&x.offsetParent)[0];
      if(b){b.click();return 2} return 0;})()`);
    await sleep(500);
  }
  await sleep(2500);   // well past every glide and camera tween

  const churn = {};
  let prev = await C.ev(SAMPLE);
  for (let n = 0; n < 24; n++) {
    await sleep(120);
    const now = await C.ev(SAMPLE);
    const m = new Map(prev.map(r => { const p = r.split("|"); return [p[0] + "|" + p[1], p[2]]; }));
    for (const r of now) {
      const p = r.split("|"), k = p[0] + "|" + p[1];
      if (m.has(k) && m.get(k) !== p[2]) churn[p[1]] = (churn[p[1]] || 0) + 1;
    }
    prev = now;
  }
  const rows = Object.entries(churn).sort((a, b) => b[1] - a[1]);
  console.log("\n  MOVED between samples, over 24 samples 120ms apart, long after everything settled:");
  if (!rows.length) console.log("    (nothing — every element in the trial's selector held still)");
  for (const [sel, n] of rows) console.log(`    ${String(n).padStart(3)}×  ${sel}`);
  console.log(`\n  elements watched: ${prev.length}`);
} catch (e) {
  console.log("probe failed:", e.message);
} finally { killAll(); }
