/* T-017 — THE POSED PAIR, plus the one measurement that could sink his solution.
 *
 *   node scripts/qa/_t017_posed_pair.mjs
 *
 * Rule 26: when the question is a picture, photograph the same board twice. Same phone, same posed
 * trade fan, before and after — not a rate over a voyage.
 *
 * HOW "BEFORE" IS PRODUCED, AND WHY YOU MAY BELIEVE IT. The pre-fix game did exactly two things:
 * left the disc at the width `#pp4Prompt.radial .apBtn` declares, and stepped the font down in
 * half-pixel increments until every painted line sat inside the rim, with a floor at 60% of base.
 * That is reproduced here in six lines, in the page — and then CHECKED against what the real
 * pre-fix build measured an hour earlier on this same pose: **5.5, 5.5, 5.5 and 6.0px at 390x844**.
 * If the reconstruction does not land on those numbers it says so and refuses to write the picture,
 * because a "before" that is not the before is worse than no picture at all.
 *
 * AND THE FALSIFIER, which is the real reason this file exists. This watch's prediction named it up
 * front: *if a grown disc cannot be placed on a 390px phone — petals overlapping, or crossing the
 * rails — then "bigger circles" cannot be carried out to the end at phone size, and that is a
 * measurement for Wyatt, not a reason to quietly keep shrinking.* So the busy case is posed too:
 * EIGHT petals on the smallest screen, with every pair tested for overlap and every petal tested
 * against the viewport. The numbers are printed whichever way they come out.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8537, DBG = 9439;
const OUT = path.resolve(".planning/posed");
const NAMES = ["Davy Scones", "Crustbeard", "Dough Hook", "Flaky Jack"];

/* What the REAL pre-fix build drew on this exact pose at 390x844, measured by
   trade_circle_type_size_check.mjs before a line of the fix was written. The reconstruction below
   has to reproduce it.

   ⚠ TOLERANCE IS ONE SHRINK STEP, AND THAT NUMBER IS NOT A FUDGE — IT IS THE ANSWER TO A REAL
   WOBBLE, FOUND BY THIS CHECK FAILING. The shrink walks in 0.5px steps, and the petal is under the
   attention vocabulary's swell (`--pp4GrowPeak`, index.html), so `getBoundingClientRect()` reads a
   different size depending on which frame of that pulse the measurement lands in. Both the fit
   predicate and the text scale together, so the VERDICT is scale-invariant — but the rounding at
   the boundary is not, and "Crustbeard" therefore lands on 5.5px or 6.0px depending on the frame.
   The same wobble is visible in the disc widths this run prints (96.4px here against 102.6px in
   trade_circle_name_fits_check), and it is a property of the shipped game, not of this file.
   Anything LARGER than one step is a genuinely different reconstruction and still refuses. */
const BEFORE_TRUTH = { "Davy Scones": 5.5, "Crustbeard": 5.5, "Dough Hook": 5.5, "Flaky Jack": 6 };
const STEP = 0.5;

const POSE = names => `(()=>{
  const p=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
  if(!p||!ap) return "nostage";
  delete ap.dataset.pp4Stage;
  for(const n of ap.querySelectorAll('.bko,.btlBtn,.recipeList,select')) n.remove();
  let row=ap.querySelector('.apBtns');
  if(!row){row=document.createElement('div');row.className='apBtns';ap.appendChild(row);}
  row.innerHTML='';
  const mk=(html,tag)=>{const b=document.createElement('button');b.className='apBtn';
    b.innerHTML=html;b._shortHtml=html;b.dataset.t017=tag;row.appendChild(b);return b;};
  for(const n of ${JSON.stringify(names)})
    mk('<b style="color:#c33">'+n+'</b><br><img src="assets/ingredients/sugar.png">+3🌕','name:'+n);
  mk('Walk away','control');
  return "posed";})()`;

/* EIGHT petals — the busy case. Short verbs, the shape a sail or dock fan really carries, so the
   labels are not what limits it: this is a question about ROOM, not about text. */
const BUSY = `(()=>{
  const p=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
  if(!p||!ap) return "nostage";
  delete ap.dataset.pp4Stage;
  for(const n of ap.querySelectorAll('.bko,.btlBtn,.recipeList,select')) n.remove();
  let row=ap.querySelector('.apBtns');
  if(!row){row=document.createElement('div');row.className='apBtns';ap.appendChild(row);}
  row.innerHTML='';
  const L=['Davy Scones','Crustbeard','Dough Hook','Flaky Jack','Sail','Dock','Fish','Pass'];
  for(const n of L){const b=document.createElement('button');b.className='apBtn';
    const h='<b>'+n+'</b>'; b.innerHTML=h;b._shortHtml=h;b.dataset.t017='busy';row.appendChild(b);}
  return "posed";})()`;

/* THE BATTLE-CALL FAN — THE CASE CEO 184 SAID NOBODY HAD MEASURED, AND IT IS THE RISKY ONE.
   These circles are NOT fanned around your own ship: each carries a `seat`, so stage.js's `onBoats`
   path hangs each one ON THE BOAT IT NAMES. Two captains standing close together therefore put two
   discs close together, and GROWING THE DISC MAKES THAT WORSE BY CONSTRUCTION.
   It is not hypothetical: the pre-fix trial `.planning/SEA-TRIAL-2026-09-03T1845Z-Wy-Blade.md`
   already records `solo-phone-wk-028-settled.png — left 'Call Dough Hook' selection circle is
   overlapped and its label text clipped by the front 'Call Crustbeard' circle`.
   ⚠ AND THESE BUTTONS CARRY NO `short:` (src/ui/flow.js:3112) — "Call Crustbeard" is 15 characters,
   so `menuButtons()` admits them on the ≤16 rule and the short-swap never runs. That is precisely
   the fan the per-button fan key exists to protect. */
const CALLS = `(()=>{
  const p=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
  if(!p||!ap) return "nostage";
  delete ap.dataset.pp4Stage;
  for(const n of ap.querySelectorAll('.bko,.btlBtn,.recipeList,select')) n.remove();
  let row=ap.querySelector('.apBtns');
  if(!row){row=document.createElement('div');row.className='apBtns';ap.appendChild(row);}
  row.innerHTML='';
  const who=[['Call Crustbeard',1],['Call Dough Hook',2]];
  for(const [n,seat] of who){const b=document.createElement('button');b.className='apBtn';
    b.textContent=n; b.dataset.seat=String(seat); b.dataset.t017='call'; row.appendChild(b);}
  return "posed";})()`;

const IS_RADIAL = `(()=>{const p=document.getElementById('pp4Prompt');
  return !!(p&&p.classList.contains('radial'));})()`;

/* THE RECONSTRUCTION OF THE PRE-FIX GAME — disc back to the stylesheet, then shrink to fit. */
const AS_BEFORE = `(()=>{
  const inside=b=>{
    const br=b.getBoundingClientRect();
    const cx=br.left+br.width/2, cy=br.top+br.height/2;
    const bw=parseFloat(getComputedStyle(b).borderTopWidth)||0;
    const r=Math.min(br.width,br.height)/2-bw;
    if(!(r>0)) return true;
    const r2=(r+0.5)*(r+0.5);
    for(const n of b.childNodes){
      if(!n.textContent||!n.textContent.trim()) continue;
      const rng=document.createRange(); rng.selectNodeContents(n);
      for(const q of rng.getClientRects()){
        if(q.width<=0&&q.height<=0) continue;
        for(const [x,y] of [[q.left,q.top],[q.right,q.top],[q.left,q.bottom],[q.right,q.bottom]])
          if((x-cx)*(x-cx)+(y-cy)*(y-cy)>r2) return false;
      }
    }
    return true;
  };
  const out={};
  for(const b of document.querySelectorAll('.apBtn[data-t017]')){
    b.style.width=''; b.style.height=''; b.style.fontSize='';
    const base=parseFloat(getComputedStyle(b).fontSize);
    for(let px=base; !inside(b) && px>base*0.6; ){ px-=0.5; b.style.fontSize=px+'px'; }
    const first=[...b.childNodes].find(n=>n.textContent&&n.textContent.trim());
    out[first?first.textContent.trim():'?']=parseFloat(getComputedStyle(b).fontSize);
  }
  return JSON.stringify(out);})()`;

/* DO THE GROWN PETALS STILL FIT THE PHONE, AND DO THEY TOUCH? Every pair, and every rail. */
const ROOM = `(()=>{
  const bs=[...document.querySelectorAll('.apBtn[data-t017]')].map(b=>{
    const r=b.getBoundingClientRect();
    const first=[...b.childNodes].find(n=>n.textContent&&n.textContent.trim());
    return {t:first?first.textContent.trim():'?',
      l:+r.left.toFixed(1), t2:+r.top.toFixed(1), r:+r.right.toFixed(1), b:+r.bottom.toFixed(1),
      w:+r.width.toFixed(1), cx:r.left+r.width/2, cy:r.top+r.height/2, rad:Math.min(r.width,r.height)/2};
  });
  const vw=window.innerWidth, vh=window.innerHeight;
  const off=bs.filter(x=>x.l<0||x.t2<0||x.r>vw||x.b>vh)
              .map(x=>x.t+' ['+x.l+','+x.t2+'..'+x.r+','+x.b+']');
  const hits=[];
  for(let i=0;i<bs.length;i++) for(let j=i+1;j<bs.length;j++){
    const d=Math.hypot(bs[i].cx-bs[j].cx, bs[i].cy-bs[j].cy);
    const need=bs[i].rad+bs[j].rad;
    if(d<need-0.5) hits.push(bs[i].t+' / '+bs[j].t+' overlap by '+(need-d).toFixed(1)+'px');
  }
  return JSON.stringify({n:bs.length, vw, vh, disc:bs[0]?bs[0].w:0, off, hits});})()`;

const url = serve(PORT);
launch(DBG, "/tmp/chrome-t017pair");
const C = await attach(DBG);
let failed = false;

try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`); await sleep(2500);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`); await sleep(2500);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  for (let i = 0; i < 40; i++) {
    if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
    await sleep(250);
  }
  await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await sleep(2500);

  const shoot = async name => {
    const s = await C.send("Page.captureScreenshot", { format: "png" });
    const data = s?.result?.data;
    if (!data) { console.log("NO SCREENSHOT for " + name); failed = true; return; }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, "base64"));
    console.log("   wrote .planning/posed/" + name);
  };

  const goRadial = async () => {
    for (let i = 0; i < 24; i++) { if (await C.ev(IS_RADIAL) === true) return true; await sleep(250); }
    return false;
  };

  console.log("T-017 — the posed pair, on a 390x844 phone\n");

  // ---- AFTER: the fix as it stands -------------------------------------------------------
  if (await C.ev(POSE(NAMES)) !== "posed") throw new Error("could not pose the trade fan");
  if (!await goRadial()) throw new Error("the game never took the trade fan radial");
  await sleep(1200);
  console.log("  AFTER — the fan as the fix draws it:");
  console.log("   " + await C.ev(ROOM));
  await shoot("t017-after-phone-grown.png");

  // ---- BEFORE: the shipped behaviour, reconstructed and then verified ---------------------
  const before = JSON.parse(await C.ev(AS_BEFORE));
  await sleep(400);
  console.log("\n  BEFORE — the shipped behaviour reconstructed: " + JSON.stringify(before));
  const wrong = Object.entries(BEFORE_TRUTH).filter(([k, v]) => Math.abs((before[k] ?? -1) - v) > STEP + 0.01);
  if (wrong.length) {
    console.log("   ⛔ RECONSTRUCTION REJECTED — it does not match what the real pre-fix build drew:");
    for (const [k, v] of wrong) console.log(`      ${k}: got ${before[k]}px, the real build drew ${v}px`);
    console.log("   No 'before' picture written. A before that is not the before is worse than none.");
    failed = true;
  } else {
    console.log("   reconstruction matches the real pre-fix build at every name — writing the picture");
    await shoot("t017-before-phone-shrunk.png");
  }

  // ---- THE FALSIFIER: eight petals on the same phone --------------------------------------
  if (await C.ev(BUSY) !== "posed") throw new Error("could not pose the busy fan");
  await C.ev(`(()=>{const p=document.getElementById('pp4Prompt');p.classList.remove('radial');return 1})()`);
  if (!await goRadial()) throw new Error("the game never took the busy fan radial");
  await sleep(1400);
  const room = JSON.parse(await C.ev(ROOM));
  console.log("\n  THE BUSY CASE — eight petals on the same 390px phone:");
  console.log(`   ${room.n} petals, disc ${room.disc}px, viewport ${room.vw}x${room.vh}`);
  console.log(`   off the screen: ${room.off.length ? room.off.join(" | ") : "none"}`);
  console.log(`   overlapping   : ${room.hits.length ? room.hits.join(" | ") : "none"}`);
  await shoot("t017-after-phone-busy8.png");
  if (room.off.length || room.hits.length) {
    console.log("\n   ⚠ THE FALSIFIER FIRED. This is the case the prediction named, and it goes to");
    console.log("     Wyatt as a measurement rather than being quietly worked around.");
    failed = true;
  }

  // ---- THE BATTLE-CALL FAN, before and after, on the same phone --------------------------
  if (await C.ev(CALLS) !== "posed") throw new Error("could not pose the call fan");
  await C.ev(`(()=>{const p=document.getElementById('pp4Prompt');p.classList.remove('radial');return 1})()`);
  if (!await goRadial()) throw new Error("the game never took the call fan radial");
  await sleep(1400);
  const callAfter = JSON.parse(await C.ev(ROOM));
  console.log("\n  THE BATTLE-CALL FAN — circles hung ON the boats they name:");
  console.log(`   AFTER  disc ${callAfter.disc}px · off screen: ${callAfter.off.length ? callAfter.off.join(" | ") : "none"} · overlapping: ${callAfter.hits.length ? callAfter.hits.join(" | ") : "none"}`);
  await shoot("t017-after-phone-calls.png");
  await C.ev(AS_BEFORE);
  await sleep(600);
  const callBefore = JSON.parse(await C.ev(ROOM));
  console.log(`   BEFORE disc ${callBefore.disc}px · off screen: ${callBefore.off.length ? callBefore.off.join(" | ") : "none"} · overlapping: ${callBefore.hits.length ? callBefore.hits.join(" | ") : "none"}`);
  await shoot("t017-before-phone-calls.png");
  if (callAfter.hits.length > callBefore.hits.length || callAfter.off.length > callBefore.off.length) {
    console.log("\n   ⚠ GROWING THE DISC MADE THE CALL FAN WORSE. That is a regression on a screen");
    console.log("     the pre-fix trial ALREADY flagged as colliding, and it is reported, not buried.");
    failed = true;
  }
} finally {
  await C.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  killAll();
  console.log("\nbrowser killed, server closed");
}
process.exit(failed ? 1 : 0);
