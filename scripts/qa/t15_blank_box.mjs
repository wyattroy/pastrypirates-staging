/* T-15 — "the stages have a brief (half second or so) pause where their narration boxes are
 * completely blank white -- eg. 'the crew draws lots' and the recipe card choice. Expectation: The
 * exact instant that a box appears, the text should start to appear in it. otherwise it looks like
 * the game is laggy and stalling."   — Wyatt, 2026-08-26
 *
 * WHY THIS MEASURES BEFORE ANYTHING IS CHANGED: the wait is DELIBERATE. panel.js says the reveal
 * holds for the fade AND the height animation, "180ms per REPLACED line", bought so that "text
 * never arrives while the box is mid-move". He is reversing that ruling, so the change is his to
 * make — but which of the three gates is actually holding the box blank is a fact, and guessing
 * which one would be how the wrong 180ms gets deleted.
 *
 * The three candidates, all readable from the DOM while it happens:
 *   pendingStage   the box waiting on the BOARD to settle (camera + ship glide)
 *   pendingReveal  the BUTTON ROW waiting on the typewriter
 *   a ghost        .apMsg.fadeOut present => a line is being REPLACED, so the height animates
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8511, DBG = 9371;
const W = Number(process.env.QA_WIDTH || 390), H = Number(process.env.QA_HEIGHT || 844);
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-t15");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t15-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "Play Solo");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';document.getElementById('btnNameConfirm').click();true`);
  await sleep(1500);
}

const SAMPLE = `JSON.stringify((()=>{
  const ap=document.getElementById('actionPanel');
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const live=[...document.querySelectorAll('#actionPanel .apMsg:not(.fadeOut)')].find(vis);
  if(!live) return null;
  const txt=(live.innerText||'').trim();
  return {
    blank: !txt,
    cls: ap?ap.className:'',
    ghost: !!document.querySelector('#actionPanel .apMsg.fadeOut'),
    stage: ap?ap.dataset.pp4Stage==='1':false,
    h: Math.round(live.getBoundingClientRect().height),
  };
})())`;

const blanks = [];
let withBox = 0;
for (let i = 0; i < 320; i++) {                                  // bounded
  const raw = await C.ev(SAMPLE);
  // JSON.stringify(null) is the STRING "null" — truthy, and it parses back to null. Guard on the
  // parsed value, not on the string, or the first frame with no box on screen throws.
  const s = raw ? JSON.parse(raw) : null;
  if (s) {
    withBox++;
    if (s.blank) blanks.push(s);
    else {
      // text present -> advance, but never click a blank card (that is the thing being measured)
      await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn:not([disabled]), .recipeCard, #flipCoinWrap.active')]
        .filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1});
        if(b.length){b[0].click();return true}return false})()`);
    }
  }
  await sleep(100);
}

const tally = (key) => blanks.filter(b => b[key]).length;
console.log("\n=== T-15 — a narration box on screen with NO text in it (solo, " + W + "x" + H + ") ===");
console.log(`  frames with a live box : ${withBox}`);
console.log(`  of those, BLANK        : ${blanks.length}  (${withBox ? (100*blanks.length/withBox).toFixed(1) : 0}%)`);
console.log("");
console.log("  which gate was up during the blank frames:");
console.log(`    pendingStage (waiting on the BOARD)   : ${blanks.filter(b=>/pendingStage/.test(b.cls)).length}`);
console.log(`    pendingReveal (buttons held)          : ${blanks.filter(b=>/pendingReveal/.test(b.cls)).length}`);
console.log(`    a ghost present (line being REPLACED) : ${tally("ghost")}`);
console.log(`    centre-stage card                     : ${tally("stage")}`);
console.log(`    NONE of the above                     : ${blanks.filter(b=>!/pendingStage|pendingReveal/.test(b.cls)&&!b.ghost).length}`);
console.log("");
killAll();
