/* T-15, THE NUMBER — how many milliseconds does a narration box sit on screen with nothing in it?
 *
 * Wyatt: "the stages have a brief (half second or so) pause where their narration boxes are
 * completely blank white". He estimated half a second. This measures it.
 *
 * Sampling from Node cannot answer this: a 100ms poll cannot resolve a 200ms event, and the round
 * trip is part of the measurement. So the RECORDER RUNS IN THE PAGE — a MutationObserver plus rAF
 * timestamps — and Node only reads the ledger back afterwards. MutationObserver is not
 * timer-throttled, which is exactly why DRIVING-THE-GAME §8b names it the right instrument for
 * ordering questions.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8513, DBG = 9373;
const W = 390, H = 844;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-t15ms");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t15b-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);

/* the recorder, installed BEFORE the game starts drawing prompts */
await C.ev(`(()=>{
  window.__t15=[];
  const pending=new Map();                       // element -> {t0}
  const txt=el=>((el.innerText||'').trim());
  const tick=()=>{
    for(const el of document.querySelectorAll('#actionPanel .apMsg:not(.fadeOut)')){
      const r=el.getBoundingClientRect();
      const shown=r.width>1&&r.height>1&&getComputedStyle(el).visibility!=='hidden';
      if(!shown){pending.delete(el);continue;}
      if(!pending.has(el)) pending.set(el,{t0:performance.now()});
      const rec=pending.get(el);
      if(!rec.done&&txt(el)){
        rec.done=true;
        window.__t15.push({blankMs:Math.round(performance.now()-rec.t0),
                           text:txt(el).slice(0,40),
                           stage:document.getElementById('actionPanel').dataset.pp4Stage==='1'});
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`);

await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "Play Solo");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';document.getElementById('btnNameConfirm').click();true`);
  await sleep(1500);
}

for (let i = 0; i < 90; i++) {                                   // bounded
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn:not([disabled]), .recipeCard, #flipCoinWrap.active')]
    .filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1});
    const m=[...document.querySelectorAll('#actionPanel .apMsg:not(.fadeOut)')][0];
    if(m&&!(m.innerText||'').trim())return false;   // never click a blank card (T-15 itself)
    if(b.length){b[0].click();return true}return false})()`);
  await sleep(700);
}

const rows = JSON.parse(await C.ev(`JSON.stringify(window.__t15||[])`));
console.log("\n=== T-15 — milliseconds a narration box is on screen with NO text ===");
if (!rows.length) console.log("  nothing recorded — INCONCLUSIVE\n");
else {
  const ms = rows.map(r => r.blankMs).sort((a, b) => a - b);
  const pct = p => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))];
  console.log(`  boxes measured : ${ms.length}`);
  console.log(`  median         : ${pct(0.5)}ms`);
  console.log(`  90th pct       : ${pct(0.9)}ms`);
  console.log(`  worst          : ${ms[ms.length-1]}ms`);
  console.log(`  over 300ms     : ${ms.filter(x=>x>300).length}`);
  console.log("\n  the slowest few:");
  for (const r of rows.slice().sort((a,b)=>b.blankMs-a.blankMs).slice(0,6))
    console.log(`    ${String(r.blankMs).padStart(5)}ms  ${r.stage?"[stage] ":"        "}${JSON.stringify(r.text)}`);
}
console.log("");
killAll();
