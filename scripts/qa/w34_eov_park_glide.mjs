/* W3-4 — DOES THE END OF VOYAGE CARD SLAM DOWN TO THE CAPTAINS BOX?
 *
 *   node scripts/qa/w34_eov_park_glide.mjs     exit 0 = the card follows the scroll, 1 = it slams
 *
 * Wyatt: "The End of Voyage card SLAMS down to the captains box. It should scroll smoothly."
 *
 * MEASURED, not reasoned about. The card is parked by dragging it or by scrolling past the top of
 * its own content. Two numbers say whether that reads as a slam:
 *   travelPerTick — how far the card moves for ONE wheel notch. A card that follows the scroll
 *                   moves about as far as the notch; a card that slams goes the whole way.
 *   overshoot     — how far past its destination it goes before coming back, sampled every frame.
 * `?endcard=1` puts the game straight on the End of Voyage screen (scripts/qa/w01_endgame_urls.mjs
 * proves that flag lands where it claims), so this needs no voyage.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const PORT = 8495, DBG = 9395;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-w34");
const C = await attach(DBG);

const ADVANCE = `(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis).find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';} return null;})()`;

// sample the card's own translateY every animation frame for ~1.2s after one wheel notch
const WATCH = `(()=>{const w=document.getElementById('statsWrap');if(!w)return 'no card';
  window.__w34=[];const t0=performance.now();
  const read=()=>{const m=/translateY\\(([-\\d.]+)px\\)/.exec(getComputedStyle(w).transform==='none'?'':
    'translateY('+(new DOMMatrixReadOnly(getComputedStyle(w).transform)).m42+'px)');
    window.__w34.push([Math.round(performance.now()-t0), m?parseFloat(m[1]):0]);
    if(performance.now()-t0 < 1200) requestAnimationFrame(read);};
  requestAnimationFrame(read);return 'watching';})()`;

async function leg(tag, w, h) {
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await C.goto(url + "?endcard=1");
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag} load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','w34-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(url + "?endcard=1");
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag} reload`);
  await sleep(1000);
  await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${tag} home`);
  await C.ev(`document.getElementById('choiceSolo').click();true`); await sleep(700);
  await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${tag} name`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
  await C.ev(`document.getElementById('btnNameConfirm').click();true`);
  let up = false;
  for (let i = 0; i < 40; i++) {
    up = await C.ev(`(()=>{const s=document.getElementById('statsWrap');
      return !!(s&&getComputedStyle(s).display!=='none'&&s.getBoundingClientRect().height>40)})()`);
    if (up) break;
    await C.ev(ADVANCE); await sleep(900);
  }
  if (!up) { console.log(`  ${tag}: the End of Voyage card never appeared`); return null; }
  await sleep(800);
  const geom = await C.ev(`(()=>{const w=document.getElementById('statsWrap');const c=document.getElementById('pp4Cap');
    return {parkDistance: Math.round((c?c.getBoundingClientRect().top:innerHeight) - w.getBoundingClientRect().top),
            easing: getComputedStyle(w).transitionTimingFunction, dur: getComputedStyle(w).transitionDuration};})()`);
  /* (A) DOES IT FOLLOW THE GESTURE? Read DURING the gesture, not after it.
     THE INSTRUMENT WAS WRONG TWICE HERE AND BOTH TIMES IT FLATTERED OR CONDEMNED THE WRONG THING.
     Taking the peak over 1.4s spans the release as well as the drag, so once the wheel commits on
     direction (which is what lets a click-wheel mouse work at all) a card that tracked a 4px notch
     perfectly still reports "moved 688px" and reads as a slam. "Follows" is a claim about the
     gesture, so it is measured inside the 110ms quiet window, before the release can fire. What
     happens AFTER the gesture is leg B's business and it is measured there. */
  const NOTCH = 4;
  await C.ev(`(()=>{document.getElementById('statsWrap').dispatchEvent(
    new WheelEvent('wheel',{deltaY:${NOTCH},bubbles:true,cancelable:true}));return 'sent';})()`);
  await sleep(60);
  const reached = await C.ev(`Math.round((new DOMMatrixReadOnly(getComputedStyle(
    document.getElementById('statsWrap')).transform)).m42)`);
  await sleep(1400);

  /* (B) DOES IT LAND WITHOUT A BOUNCE? Measuring "overshoot" on run (A) was the instrument being
     wrong, not the game: one notch is below the park threshold, so the card correctly comes BACK
     to 0, and a naive peak-minus-end read that as a 4px overshoot. The bounce to look for is on
     ARRIVAL — so drive the card just past the release threshold, go quiet, and watch whether the
     settle animation goes PAST the captains box before coming back. */
  await C.ev(`(()=>{const w=document.getElementById('statsWrap');w.style.transform='';
    w.classList.remove('pp4EovParked','pp4EovDrag');return 'reset';})()`);
  await sleep(400);
  const drive = Math.round(geom.parkDistance * 0.7 + 12);   // past 1 - EOV_PARK_RELEASE_FRACTION
  await C.ev(WATCH);
  await C.ev(`(()=>{document.getElementById('statsWrap').dispatchEvent(
    new WheelEvent('wheel',{deltaY:${drive},bubbles:true,cancelable:true}));return 'sent';})()`);
  await sleep(1400);
  const landPts = JSON.parse(await C.ev(`JSON.stringify(window.__w34||[])`)).map(p => p[1]);
  const landEnd = landPts.length ? landPts[landPts.length - 1] : 0;
  const landPeak = landPts.length ? Math.max(...landPts) : 0;
  const overshoot = Math.max(0, landPeak - geom.parkDistance);

  /* (C) THE SWEEP — the same gesture with a FINGER must still work. settle() changed for both
     input paths, and `.pp4EovDrag { transition:none }` has to keep beating the inline variable or
     the card would lag a live finger by a quarter-second. */
  await C.ev(`(()=>{const w=document.getElementById('statsWrap');w.style.transform='';
    w.classList.remove('pp4EovParked','pp4EovDrag');return 'reset';})()`);
  await sleep(400);
  const drag = await C.ev(`(async()=>{const w=document.getElementById('statsWrap');
    const r=w.getBoundingClientRect(), x=Math.round(r.left+r.width/2), y0=Math.round(r.top+30);
    const pd=(t,cy)=>w.dispatchEvent(new PointerEvent(t,{pointerId:7,clientX:x,clientY:cy,bubbles:true,cancelable:true}));
    pd('pointerdown',y0);
    const mid=[];
    for(let i=1;i<=8;i++){ pd('pointermove',y0+i*${'$'}{0}+i*70);
      mid.push(Math.round((new DOMMatrixReadOnly(getComputedStyle(w).transform)).m42));
      await new Promise(r2=>setTimeout(r2,30)); }
    pd('pointerup',y0+560);
    return {mid, live:w.classList.contains('pp4EovDrag')};})()`.replace("${0}",""));
  await sleep(900);
  const after = await C.ev(`(()=>{const w=document.getElementById('statsWrap');
    return {y:Math.round((new DOMMatrixReadOnly(getComputedStyle(w).transform)).m42),
            parked:w.classList.contains('pp4EovParked')};})()`);
  const tracked = drag && drag.mid && drag.mid.length > 2 && drag.mid[drag.mid.length-1] > drag.mid[0];

  /* (D) A CLICK-WHEEL MOUSE, which is not a trackpad — CEO Review 23 caught the first cut of this
     fix leaving a plain mouse unable to park the card at all: one detent is ~100px against 688px
     of travel, and the 110ms of quiet that stands in for a finger lifting falls BETWEEN detents,
     so every notch sprang back. One detent, then silence, must still commit. */
  await C.ev(`(()=>{const w=document.getElementById('statsWrap');w.style.transform='';
    w.classList.remove('pp4EovParked','pp4EovDrag');return 'reset';})()`);
  await sleep(500);
  await C.ev(`(()=>{document.getElementById('statsWrap').dispatchEvent(
    new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));return 'detent';})()`);
  await sleep(900);
  const detent = await C.ev(`(()=>{const w=document.getElementById('statsWrap');
    return {y:Math.round((new DOMMatrixReadOnly(getComputedStyle(w).transform)).m42),
            parked:w.classList.contains('pp4EovParked')};})()`);
  await C.ev(`(()=>{document.getElementById('statsWrap').dispatchEvent(
    new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));return 'detent up';})()`);
  await sleep(900);
  const detentBack = await C.ev(`(()=>{const w=document.getElementById('statsWrap');
    return {y:Math.round((new DOMMatrixReadOnly(getComputedStyle(w).transform)).m42),
            parked:w.classList.contains('pp4EovParked')};})()`);
  const mouseWorks = detent.parked && !detentBack.parked;

  console.log(`  ${tag} ${w}x${h}: easing ${geom.easing}; park travel ${geom.parkDistance}px`);
  console.log(`     A. during the gesture, one ${NOTCH}px notch had moved the card ${Math.round(reached)}px`);
  console.log(`     B. driven to ${drive}px then released: settled at ${Math.round(landEnd)}px, peak ${Math.round(landPeak)}px -> ${Math.round(overshoot)}px past the captains box`);
  console.log(`     D. one mouse detent down -> ${detent.y}px parked=${detent.parked}; one detent up -> ${detentBack.y}px parked=${detentBack.parked}`);
  console.log(`     C. finger drag: card tracked the pointer ${tracked ? "YES" : "NO"} (${(drag && drag.mid || []).join(",")}) -> ${after.y}px, parked ${after.parked}`);
  return { notch: NOTCH, reached, landEnd, overshoot, tracked, mouseWorks, dragY: after.y, park: geom.parkDistance, easing: geom.easing };
}

const out = [];
for (const [tag, w, h] of [["desktop", 1200, 950], ["tablet", 768, 1024]]) {
  const m = await leg(tag, w, h);
  if (m) out.push([tag, m]);
}
console.log("\n=== W3-4 VERDICT ===");
if (!out.length) { console.log("  NOTHING MEASURED — the card never appeared. Not a pass."); killAll(); process.exit(2); }
let bad = 0;
for (const [tag, m] of out) {
  // a card that FOLLOWS the scroll moves about as far as the notch; a card that SLAMS goes most of
  // the way in one go. Half the park travel is generous — a slam measures as the whole of it.
  const slams = Math.abs(m.reached) > Math.max(m.notch * 4, 20);
  const bounces = m.overshoot > 2;
  const parked = Math.abs(m.landEnd - m.park) <= 2;
  if (slams || bounces || !parked || !m.tracked || !m.mouseWorks) bad++;
  console.log(`  ${tag}: one notch -> ${Math.round(m.reached)}px of ${m.park}px ${slams ? "SLAM" : "follows"}; on release it ${parked ? "parks" : "DOES NOT PARK (" + Math.round(m.landEnd) + "px)"}${bounces ? `, overshooting by ${Math.round(m.overshoot)}px` : " without a bounce"}; a finger still drags it ${m.tracked ? "live" : "NOT AT ALL"}; a click-wheel mouse ${m.mouseWorks ? "parks and unparks on one detent" : "CANNOT PARK IT"}`);
}
killAll();
process.exit(bad ? 1 : 0);
