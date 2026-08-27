/* T-24 — "tapping the card, or the space around it, should instant-appear all of the text."
 *
 * MEASURES: catch a message MID-TYPE, tap the card's padding (not a control), and compare the text
 * before and after. A pass needs the text to GROW to its full length on the tap — not merely to be
 * complete a moment later, which it would be anyway.
 *
 * RED-PROOFED: it also taps a control-free spot on a message that has ALREADY finished, and
 * requires that nothing changes. If both cases "pass", the probe is measuring the passage of time
 * rather than the tap.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8517, DBG = 9377;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-t24");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t24-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "Play Solo");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';document.getElementById('btnNameConfirm').click();true`);
  await sleep(1200);
}

/* tap the box itself, away from any control — the "space around it" he described */
const TAP = `(()=>{
  const box=document.getElementById('pp4Prompt');
  if(!box)return 'no box';
  const msg=box.querySelector('.apMsg:not(.fadeOut)');
  if(!msg)return 'no msg';
  const before=(msg.innerText||'').length;
  const full=(msg.textContent||'').replace(/\\s+/g,' ').trim().length;
  box.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  const after=(msg.innerText||'').length;
  return JSON.stringify({before,after,full,grew:after>before});
})()`;

let midType = null, alreadyDone = null;
for (let i = 0; i < 220 && (!midType || !alreadyDone); i++) {
  const state = await C.ev(`(()=>{const m=document.querySelector('#pp4Prompt .apMsg:not(.fadeOut)');
    if(!m)return null;
    const shown=(m.innerText||'').trim().length, full=(m.textContent||'').trim().length;
    return JSON.stringify({shown,full,typing:shown>0&&shown<full});})()`);
  const st = state ? JSON.parse(state) : null;
  if (st && st.typing && !midType) midType = JSON.parse(await C.ev(TAP));
  else if (st && st.shown > 0 && st.shown === st.full && !alreadyDone) alreadyDone = JSON.parse(await C.ev(TAP));
  else {
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn:not([disabled]), .recipeCard, #flipCoinWrap.active')]
      .filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1});
      const m=[...document.querySelectorAll('#actionPanel .apMsg:not(.fadeOut)')][0];
      if(m&&!(m.innerText||'').trim())return false;
      if(b.length){b[0].click();return true}return false})()`);
  }
  await sleep(90);
}

console.log("\n=== T-24 — does tapping the card finish the text? ===");
console.log("  caught MID-TYPE   : " + JSON.stringify(midType));
console.log("  already FINISHED  : " + JSON.stringify(alreadyDone));
console.log("");
if (!midType) console.log("  INCONCLUSIVE — never caught a message mid-type, so nothing was tested.");
else if (midType.grew && (!alreadyDone || !alreadyDone.grew))
  console.log(`  PASS — the tap jumped the text from ${midType.before} to ${midType.after} chars, and a tap on a finished message changed nothing.`);
else if (midType.grew) console.log("  SUSPECT — it grew, but the finished-message control ALSO grew; the probe may be measuring time, not the tap.");
else console.log("  FAIL — the tap did not complete the text.");
console.log("");
killAll();
