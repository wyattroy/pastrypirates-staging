/* W3-7 — THE TINY COIN OVER ANOTHER CAPTAIN'S BOAT: is it where he said, the size he said, for as
   long as he said, and does it finish before anything narrates over it?

   POSED, NOT PLAYED (his §5e): waiting for a bot to choose a dock is a stochastic voyage, and the
   question here is "is this drawn right", which a posed board answers in one frame. The game is
   started for real, then src/ui/dockcoin.js's own flipDockCoin() is called on seat 1 — the same
   function and the same arguments src/ui/flow.js hands it when a bot really docks.

   WHAT IS CHECKED, all four from his own tuner settings (.claude/memory/DECISIONS.md, 2026-09-10):
     · the coin is 16 CSS px at 1x zoom, and it is INSIDE the board strip
     · it sits above the boat, not beside it — no sideways nudge, his words
     · it is over the hull, not under it (z-index above #boardShips)
     · the promise does not resolve before 795 + 800ms, which is the trap he named on 2026-09-12:
       "have that narration box showing the result of the coin flip wait until the coin flip is
       over." Its one caller narrates on the line after the await, so the await IS the guarantee.
   RED-PROOF: drop the `await sleep(FLIP_LAND_HOLD_MS)` from flipDockCoin and the timing check goes
   red; give .dcoin a width of 24px and the size check does. Both were run. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import { decodePng, boxDiff } from "./_png.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || null;
const PORT=9040+(process.pid%25), DBG=9740+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-w37-${process.pid}`));
const C=await attach(DBG);
let bad=0; const fail=m=>{bad++;console.log("FAIL "+m)}, pass=m=>console.log("PASS "+m);
const waitFor=async(e,ms=45000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
/* A PHOTOGRAPH, NOT A MEASUREMENT — the narration bubble is position:fixed over the middle of the
   board on day one, exactly where four boats are still moored together at Tortuga, so a picture
   taken through it shows a cream rectangle. It is hidden for the frame and put straight back, and
   NOTHING above is measured while it is hidden: every assertion in this file reads the DOM, which
   the bubble never touched. */
/* THE NARRATION BUBBLE IS position:fixed OVER THE MIDDLE OF THE BOARD ON DAY ONE — exactly where
   four boats are still moored together at Tortuga. It is the game working correctly and it is also
   an opaque cream rectangle between this probe and the thing it came to look at, so it is lifted
   for two questions and put straight back: "what is actually painted where the coin is" and the
   photograph. Nothing about the coin's own geometry is measured while it is lifted. */
const lift=async()=>C.ev(`(()=>{ window.__hid=[...document.querySelectorAll('#pp4Prompt, .pp4Bubble, .narrBubble, #actionPanel, #pp4CerSlot')]
    .filter(e=>e.offsetParent||getComputedStyle(e).position==='fixed');
    window.__hid.forEach(e=>e.style.visibility='hidden'); return window.__hid.length; })()`).catch(()=>{});
const drop=async()=>C.ev(`(()=>{ (window.__hid||[]).forEach(e=>e.style.removeProperty('visibility')); window.__hid=[]; })()`).catch(()=>{});
const shot=async n=>{ if(!OUT) return;
  const r=await C.send('Page.captureScreenshot',{format:'png'});
  if(r.result?.data) fs.writeFileSync(path.join(OUT,n), Buffer.from(r.result.data,'base64'));
};
try{
  await C.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1100);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2400);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(800);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await waitFor(`document.querySelectorAll('#players .player-row').length>=4`);
  await sleep(2000);
  /* GET THE RECIPE PICKER OFF THE BOARD FIRST. It covers the captain's box AND most of the sea by
     his own ruling (r7), so a coin posed under it measures correctly and photographs nothing. */
  await C.ev(`(()=>{const c=document.querySelector('#actionPanel .apBtn.recipeCard'); if(c)c.click();})()`).catch(()=>{});
  await sleep(800);
  await C.ev(`(()=>{const p=[...document.querySelectorAll('#actionPanel .apBtn, #actionPanel button')].find(b=>/bake this/i.test(b.textContent)); if(p)p.click();})()`).catch(()=>{});
  for(let t=0;t<14;t++){ if(!(await C.ev(`!!document.querySelector('#actionPanel .apBtn.recipeCard')`))) break; await sleep(1000); }
  await sleep(1600);

  /* the layer must exist AND be carried by the camera, or the coin detaches the moment the director
     zooms — the one board-overlay mistake docs/BOARD-RENDERING.md names by name */
  const layered = await C.ev(`!!document.getElementById('dockCoinHost')`);
  layered ? pass("the coin has its own layer inside the board strip (#dockCoinHost)")
          : fail("#dockCoinHost is missing — nothing can draw a coin");

  await C.ev(`(async()=>{ window.__dc = await import('/src/ui/dockcoin.js');
    window.__dcT0 = performance.now();
    window.__dcDone = 0;
    window.__dcErr = '';
    window.__dc.flipDockCoin(1, true).then(()=>{ window.__dcDone = performance.now() - window.__dcT0; })
      .catch(e=>{ window.__dcErr = String((e&&e.stack)||e); });
    return 'called'; })()`);
  const t0 = Date.now();
  await sleep(380);
  await lift();

  const mid = JSON.parse(await C.ev(`JSON.stringify((()=>{
    const c=document.querySelector('#dockCoinHost .dcoin'); if(!c) return null;
    const r=c.getBoundingClientRect();
    /* ⚠ WHERE THE COIN IS DRAWN IS NOT WHERE .dcoin IS. .dcoin is the anchor pinned to the hull's
       top edge; the 11px rise and the 21px toss are transforms on the CHILD, so .dcoin's own rect
       never moves and reading it reported the coin sitting exactly on the hull. Measure the element
       that carries the rise. */
    const lift=c.querySelector('.dcoinRise'); const rl=lift? lift.getBoundingClientRect() : r;
    const ships=document.getElementById('boardShips');
    const g=ships? ships.children[1] : null; const rb=g? g.getBoundingClientRect() : null;
    const wrap=document.getElementById('boardwrap').getBoundingClientRect();
    const spin=c.querySelector('.dcoinSpin');
    return { w:Math.round(r.width), h:Math.round(r.height),
      cx:Math.round(rl.left+rl.width/2), cy:Math.round(rl.top+rl.height/2),
      anchorY:Math.round(r.top+r.height/2),
      boatCx: rb? Math.round(rb.left+rb.width/2):null, boatTop: rb? Math.round(rb.top):null,
      insideBoard: rl.left>=wrap.left-1 && rl.right<=wrap.right+1 && rl.top>=wrap.top-1 && rl.bottom<=wrap.bottom+1,
      hostZ: getComputedStyle(document.getElementById('dockCoinHost')).zIndex,
      shipsZ: getComputedStyle(ships).zIndex,
      spinning: !!spin && getComputedStyle(spin).animationName !== 'none',
      art: (getComputedStyle(spin).backgroundImage||'').split('/').pop().split('"')[0],
      spinRect: (()=>{ const r=spin.getBoundingClientRect();
        return {x:Math.round(r.left)-4, y:Math.round(r.top)-4, w:Math.round(r.width)+8, h:Math.round(r.height)+8}; })() };
  })())`) || "null");

  if(!mid) fail("no coin was drawn at all 380ms into the flip");
  else {
    console.log("  mid-flip: " + JSON.stringify(mid));
    await shot("dockcoin-midflip.png");
    await drop();
    (mid.w===16 && mid.h===16) ? pass(`the coin is ${mid.w}px at 1x zoom, his number`)
      : fail(`the coin is ${mid.w}x${mid.h}px — he asked for 16px at 1x zoom`);
    mid.insideBoard ? pass("the coin is inside the board strip")
      : fail("part of the coin is outside the board strip");
    (mid.boatCx!==null && Math.abs(mid.cx-mid.boatCx)<=2)
      ? pass(`no sideways nudge — the coin is centred over the hull (${mid.cx} against ${mid.boatCx})`)
      : fail(`the coin is ${Math.abs(mid.cx-(mid.boatCx||0))}px to the side of the hull; he asked for none`);
    (mid.boatTop!==null && mid.cy <= mid.boatTop - 10)
      ? pass(`the coin rides above the boat (coin centre ${mid.cy}, hull top ${mid.boatTop} — ${mid.boatTop-mid.cy}px clear, his 11 plus wherever the toss has it)`)
      : fail(`the coin is not clear of the boat (coin centre ${mid.cy}, hull top ${mid.boatTop})`);
    (+mid.hostZ > +mid.shipsZ) ? pass(`the coin draws over the hull (z ${mid.hostZ} against the boats' ${mid.shipsZ})`)
      : fail(`the coin draws UNDER the hull (z ${mid.hostZ} against the boats' ${mid.shipsZ})`);
    mid.spinning ? pass("it is turning over, not sitting still") : fail("the coin is not spinning");
    /* ⚠ THE ONE THAT CAUGHT THE INVISIBLE COIN, and it took two goes to write. Everything else
       about the first version measured right — right place, right size, art decoded, opacity 1 —
       and it drew nothing at all. The second attempt asked elementFromPoint what was at the coin's
       centre, and that answers a DIFFERENT question: #dockCoinHost is `pointer-events: none`, so
       hit-testing walks straight past a coin that is plainly on screen and names the boat behind
       it. THE ONLY HONEST TEST IS THE PIXELS: photograph the coin's own little square twice, once
       with it and once with it hidden, and see whether the picture changed. */
    /* ⚠ THE ONE THAT CAUGHT THE INVISIBLE COIN, and it took three goes to write.
         attempt 1  elementFromPoint at the coin's centre — but #dockCoinHost is pointer-events:none,
                    so hit-testing walks past a coin that is plainly on screen and names the boat.
         attempt 2  two CLIPPED captures, with the coin and without — Page.captureScreenshot's clip
                    handed back the same bytes either way under device emulation, so it read "not
                    drawn" while the full screenshot beside it showed the coin perfectly.
         attempt 3  full frames, decoded, and only the coin's own box compared. That is the honest
                    question: did hiding it change the picture where it is?
       AND THREE SAMPLES, NOT ONE: a coin turning six times a second passes EDGE ON twice a turn,
       and an edge-on coin is a zero-height sliver that really does change nothing. */
    const D = await C.ev(`devicePixelRatio`) || 1;
    const full = async () => decodePng(Buffer.from(
      (await C.send('Page.captureScreenshot',{format:'png'})).result?.data || "", 'base64'));
    const frames = []; for (let i=0;i<3;i++){ frames.push(await full()); await sleep(55); }
    await C.ev(`(()=>{const c=document.querySelector('#dockCoinHost .dcoin'); if(c)c.style.visibility='hidden';})()`);
    const without = await full();
    await C.ev(`(()=>{const c=document.querySelector('#dockCoinHost .dcoin'); if(c)c.style.removeProperty('visibility');})()`);
    const box = mid.spinRect;
    const diffs = frames.map(f => boxDiff(f, without, Math.round((box.x-6)*D), Math.round((box.y-6)*D),
                                          Math.round((box.w+12)*D), Math.round((box.h+12)*D)));
    const best = diffs.reduce((m,d)=>d.changed>m.changed?d:m, {changed:0,worst:0});
    (best.changed > 40)
      ? pass(`the coin's own square photographs differently with it and without it — ${best.changed} pixels changed, worst by ${best.worst} — it is really drawn`)
      : fail(`hiding the coin changed only ${best.changed} pixels in its own square across three frames — it is in the DOM and not on the screen`);
    /coin-spin/.test(mid.art) ? pass(`it is wearing the spinning-coin art (${mid.art})`)
      : fail(`the spinning coin is drawn with "${mid.art}" — it should be the game's own coin-spin`);
  }

  /* HIS TRAP: nothing may narrate until the coin is done. The caller narrates on the line after the
     await, so what is measured is when the await lets go. */
  /* PHOTOGRAPH THE LANDED FACE WHILE IT IS STILL THERE. It lands at 795ms and holds for 800, so
     the window closes at 1595 — and the measurements above cost enough wall clock to walk straight
     past it, which is how the first run photographed an empty sea and called it "landed". */
  await sleep(Math.max(0, 1150 - (Date.now() - t0)));
  const landedArt0 = await C.ev(`(()=>{const s=document.querySelector('#dockCoinHost .dcoinSpin');
    return s? (getComputedStyle(s).backgroundImage||'').split('/').pop().split('"')[0] : 'gone';})()`);
  await lift(); await shot("dockcoin-landed.png"); await drop();
  /dcoinSpin|flip-heads/.test(landedArt0) || landedArt0==='flip-heads.png'
    ? pass(`it landed on the face the engine recorded (${landedArt0})`)
    : fail(`it landed showing "${landedArt0}" — heads was the recorded result`);
  let done = 0;
  for (let i=0;i<40 && !done;i++){ done = +(await C.ev(`window.__dcDone`) || 0); if(!done) await sleep(200); }
  const floor = 795 + 800;
  const err = await C.ev(`window.__dcErr||''`);
  if (err) fail("the coin threw: " + String(err).slice(0,300));
  if (!done) fail("the coin's promise never resolved — a bot's dock would hang the voyage");
  else if (done < floor - 30) fail(`the coin let go after ${Math.round(done)}ms, before the flip was over `
    + `(${floor}ms = his 795ms landing plus his 800ms hold) — the narration would land on a spinning coin`);
  else pass(`the coin held the turn for ${Math.round(done)}ms before anything could narrate over it (floor ${floor}ms)`);

  /* it fades over 140ms and then takes itself off the board; give that its time before asking */
  await sleep(600);
  const gone = await C.ev(`!document.querySelector('#dockCoinHost .dcoin')`);
  gone ? pass("and it cleared itself off the board afterwards")
       : fail("the coin is still on the board after the flip finished");
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); bad++; } finally { await killAll(); }
console.log(bad ? `\nFAILED — ${bad}` : "\nPASSED — 0 failure(s)");
process.exit(bad?1:0);
