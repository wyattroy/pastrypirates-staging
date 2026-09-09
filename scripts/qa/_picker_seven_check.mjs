/* HIS SEVEN, 2026-09-09 — posed, hovered, dragged, and looked at.
 *   node scripts/qa/_picker_seven_check.mjs
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 *
 * ⚠ IT MEASURES THE PANEL AS WELL AS THE BOX, and that is a correction. The previous probe reported
 * the sheet as 378px wide at desktop from `#pp4Prompt`'s own rect — but #actionPanel is a flex item
 * with align-self:center, so it shrink-to-fits its own content and can be WIDER than the box that
 * nominally sizes it. On Wyatt's real window it painted ~730px. Measuring the container instead of
 * the painted thing is the same class of error as the vertical-only overlap test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(REPO, ".planning", "posed", "seven");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8760 + (process.pid % 90), DBG = 9760 + (process.pid % 90);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-seven-${process.pid}`));
const C = await attach(DBG);
const SIZES = [{ name:"desktop", w:1280, h:900, mobile:false },
               { name:"tablet",  w:768,  h:1024, mobile:false },
               { name:"phone",   w:390,  h:844, mobile:true }];
const metrics = s => C.send("Emulation.setDeviceMetricsOverride",{width:s.w,height:s.h,deviceScaleFactor:1,mobile:s.mobile});
const shot = async n => { const r = await C.send("Page.captureScreenshot",{format:"png"});
  if(r.result?.data) fs.writeFileSync(path.join(OUT,n), Buffer.from(r.result.data,"base64")); };
const waitFor = async (e,ms=22000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};

const M = `JSON.stringify((()=>{
  const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();
    return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),r:Math.round(r.right),b:Math.round(r.bottom)}};
  const cover=(a,b)=>{if(!a||!b||!b.w||!b.h)return null;
    const ox=Math.max(0,Math.min(a.r,b.r)-Math.max(a.l,b.l)), oy=Math.max(0,Math.min(a.b,b.b)-Math.max(a.t,b.t));
    return +((ox*oy)/(b.w*b.h)).toFixed(3)};
  const box=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel'), brd=document.getElementById('board');
  const ask=document.querySelector('.pp4RcAsk'), help=document.querySelector('.pp4RcHelp span');
  const peek=document.querySelector('.pp4RcPeek'), sw=document.querySelector('.pp4RcSwap');
  const back=document.querySelector('#actionPanel .apBtn[data-rcpos="back"]');
  const cs=e=>e?getComputedStyle(e):null;
  const bg=e=>{const c=cs(e);return c?c.backgroundColor+' | '+c.backgroundImage.slice(0,60)+' | outline:'+c.outlineColor+' '+c.outlineWidth+' | bs:'+c.boxShadow.slice(0,50):null};
  /* every island square, in screen space, so "is the pill on land" is answered from the game's map */
  const g=window.__pp_app_state_debug?__pp_app_state_debug().game:null;
  let onLand=null, hr=R(help);
  /* ⚠ PROJECTED THROUGH THE SVG'S OWN viewBox, and the grid read from cfg — NOT from g.grid,
     which does not exist. The first version of this check did g.grid-or-g.N-or-20 and silently used
     20 against a real grid of 15, so every island rect was 3/4 of its true size and the verdict was
     noise in both directions. It is written from the viewBox rather than from stage.js's toScreen()
     on purpose: a check that reuses the code it is checking cannot disagree with it. */
  if(g&&g.islands&&hr&&brd){
    const svg=brd.getBoundingClientRect();
    const vb=(brd.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
    const N=(g.cfg&&g.cfg.grid)||15;
    if(vb.length===4&&vb[2]>0){
      const sc=svg.width/vb[2], cellU=640/N;
      onLand=0;
      for(const k of Object.keys(g.islands)){
        const [cx,cy]=k.split(',').map(Number);
        const l=svg.left+(cx*cellU-vb[0])*sc, t=svg.top+(cy*cellU-vb[1])*sc;
        const r=l+cellU*sc, b=t+cellU*sc;
        if(!(r<hr.l||l>hr.r||b<hr.t||t>hr.b)) onLand++;
      }
    }
  }
  return {box:R(box), panel:R(ap), board:R(brd), ask:R(ask), askHtml:ask?ask.innerHTML.slice(0,140):null,
    help:hr, helpText:help?help.textContent:null, helpVis:help?getComputedStyle(help.parentElement).visibility:null,
    helpOverIslandCells:onLand, gridN:(g&&g.cfg&&g.cfg.grid)||null, viewBox:brd?brd.getAttribute('viewBox'):null,
    panelBg:bg(ap), askBg:bg(ask), peekBg:bg(peek), backBg:bg(back), swapBg:bg(sw),
    swapRotate:sw&&sw.querySelector('svg')?getComputedStyle(sw.querySelector('svg')).transform:null,
    boardHidden:cover(R(ap),R(brd)), panelWiderThanBox:(R(ap)&&R(box))?(R(ap).w-R(box).w):null,
    cursor:box?getComputedStyle(box).cursor:null,
    boxDisplay:box?getComputedStyle(box).display:null,
    boxAlign:box?getComputedStyle(box).alignItems:null,
    boxDir:box?getComputedStyle(box).flexDirection:null,
    askCentred:(()=>{const b=R(box),a=R(ask);if(!b||!a)return null;
      return {leftGap:a.l-b.l, rightGap:b.r-a.r};})()};
})())`;

const go = async () => {
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2600);
  // WAIT FOR THE LOBBY rather than sleeping at it — a fixed 2600ms reload wait is a race, and it
  // lost once here (`getElementById('choiceSolo')` was null and the probe reported a page fault
  // that did not exist). Never assert on an element you have not waited for.
  await waitFor(`!!document.getElementById('choiceSolo')`, 25000);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`,26000);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(900);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await waitFor(`!!document.querySelector('#actionPanel .recipeList')`); await sleep(3400);
};
const say = console.log;
try {
  await metrics(SIZES[0]);
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(2200);
  for (const s of SIZES){
    await metrics(s); await sleep(400); await go();
    await shot(`parked-${s.name}.png`);
    const m = JSON.parse(await C.ev(M));
    say(`\n══ ${s.name} (${s.w}x${s.h}) ══════════════════`);
    say(` 1 cream card behind the recipes : panel bg = ${m.panelBg}`);
    say(` 2 the ask reads                 : ${JSON.stringify(m.askHtml)}`);
    say(` 6 ask styling                   : ${m.askBg}`);
    say(` 3 helper pill                   : ${JSON.stringify(m.helpText)}  at ${JSON.stringify(m.help)} vis=${m.helpVis}`);
    say(`   ...island squares under it    : ${m.helpOverIslandCells}   (must be 0; grid=${m.gridN}, viewBox=${m.viewBox})`);
    say(` 7 arrow transform               : ${m.swapRotate}   (rotate(180deg) = matrix(-1,0,0,-1,0,0))`);
    say(` 5 cursor on the sheet           : ${m.cursor}`);
    say(`   box ${JSON.stringify(m.box)}  display=${m.boxDisplay} dir=${m.boxDir} align=${m.boxAlign}`);
    say(`   ask centred in the sheet? ${JSON.stringify(m.askCentred)}   (equal gaps = centred)`);
    say(`   PANEL ${JSON.stringify(m.panel)}   panel wider than box by ${m.panelWiderThanBox}px`);
    say(`   board ${JSON.stringify(m.board)}   panel hides ${m.boardHidden==null?'?':(m.boardHidden*100).toFixed(1)+'%'} of it`);
    if (s.name === "desktop"){
      // ── item 4: WHERE IS THE YELLOW? hover the peek strip and read what changes
      const pk = m.box && JSON.parse(await C.ev(`JSON.stringify((()=>{const p=document.querySelector('.pp4RcPeek');if(!p)return null;const r=p.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})())`));
      if (pk){
        await C.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:pk.x,y:pk.y});
        await sleep(500); await shot("hover-peek-desktop.png");
        const h = JSON.parse(await C.ev(M));
        say(`\n ── 4 HOVERING THE BACK CARD'S STRIP ──`);
        say(`   peek  ${h.peekBg}`);
        say(`   back  ${h.backBg}`);
        say(`   swap  ${h.swapBg}`);
      }
      /* ⭐ THE STILL PRESS IS TESTED FIRST, ON THE PARKED SHEET.
         ⚠ IT USED TO RUN AFTER THE DRAG AND REPORTED A FALSE FAILURE: the drag deliberately ends
         with the sheet clamped hard against the bottom edge, which puts the card's own centre BELOW
         the viewport, so the press landed on nothing. The test was measuring its own setup. This is the half the drag could silently break:
         if the slop threshold were 0, or the click-swallower fired on every release, tapping a
         card would stop selecting it and the picker would be unusable. */
      const cd = JSON.parse(await C.ev(`JSON.stringify((()=>{const c=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]');const r=c.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})())`));
      await C.send("Input.dispatchMouseEvent",{type:"mousePressed",x:cd.x,y:cd.y,button:"left",buttons:1,clickCount:1});
      await C.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:cd.x,y:cd.y,button:"left",buttons:0,clickCount:1});
      await sleep(800);
      const chose = await C.ev(`!!document.querySelector('#actionPanel .apBtn.pp4Focus') || !!document.querySelector('.pp4Bake')`);
      say(`   a STILL press still chooses the recipe: ${chose}   (the slop threshold's whole job)`);


      // ── item 5 + item 1: does it drag, and does it drag FROM A CARD?
      // instrumented, because a bare "moved=false" does not say whether the press was even heard
      await C.ev(`(()=>{window.__dc={down:0,move:0,up:0};const b=document.getElementById('pp4Prompt');
        b.addEventListener('pointerdown',()=>__dc.down++,true);
        b.addEventListener('pointermove',()=>__dc.move++,true);
        b.addEventListener('pointerup',()=>__dc.up++,true);
        b.addEventListener('gotpointercapture',()=>window.__dcCap=1,true);
        b.addEventListener('lostpointercapture',()=>window.__dcCap=0,true);})()`);
      const before = JSON.parse(await C.ev(M));
      say(`   ask rect ${JSON.stringify(before.ask)}  (item 4: must hug its words, not the sheet's ${before.box.w}px)`);
      // GRAB THE CARD ITSELF — his item 1
      const card = JSON.parse(await C.ev(`JSON.stringify((()=>{const c=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]');if(!c)return null;const r=c.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})())`));
      const ax = card ? card.x : before.ask.l + 40, ay = card ? card.y : before.ask.t + 12;
      say(`   grabbing the FRONT CARD at ${ax},${ay}`);
      await C.send("Input.dispatchMouseEvent",{type:"mousePressed",x:ax,y:ay,button:"left",buttons:1,clickCount:1});
      // several small moves, like a real hand: one 300px jump can be coalesced or dropped, and it
      // also tells us nothing about whether the drag-slop threshold is behaving
      for (let i=1;i<=10;i++){
        /* ⚠ buttons:1 IS LOAD-BEARING. `button:"left"` alone names WHICH button the event concerns;
           `buttons` is the bitmask of what is currently HELD. Without it Chrome treats each move as
           a button-up move, and the run measured exactly one delivered pointermove out of ten — a
           drag that looked broken in the probe and was fine in the product. */
        await C.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:Math.round(ax-26*i),y:Math.round(ay+30*i),button:"left",buttons:1});
        await sleep(90);
        // READ THE BOX AFTER EVERY STEP — "it moved" and "it tracks" are different claims, and a
        // drag that takes the first move and then stops looks like a pass in a before/after test
        const now = await C.ev(`(()=>{const b=document.getElementById('pp4Prompt');return b.style.left+","+b.style.top})()`);
        say(`     move ${i} -> pointer ${Math.round(ax-26*i)},${Math.round(ay+30*i)}   sheet ${now}   captured=${await C.ev(`!!(window.__dcCap)`)}`);
      }
      await sleep(200);
      say(`   pointer events heard by the sheet: ${await C.ev(`JSON.stringify(window.__dc)`)}`);
      await C.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:Math.round(ax-260),y:Math.round(ay+300),button:"left",buttons:0,clickCount:1});
      await sleep(700);
      const after = JSON.parse(await C.ev(M));
      say(`\n ── 5 DRAG: from ${JSON.stringify([before.box.l,before.box.t])} to ${JSON.stringify([after.box.l,after.box.t])}  moved=${after.box.l!==before.box.l||after.box.t!==before.box.t}`);
      await shot("dragged-desktop.png");
      await sleep(900);
      const stay = JSON.parse(await C.ev(M));
      say(`   ...and it STAYS after a second: ${stay.box.l===after.box.l&&stay.box.t===after.box.t}`);
      /* ⚠ ON A FRESH PICKER, because the drag above deliberately ends with the sheet clamped hard
         against the bottom edge — the card's own centre is then off the glass and the two taps land
         on nothing. Measured that way it reported "ask box left behind: YES" while the panel still
         read "choose yer recipe" and two recipe lists were still mounted: the picker had never been
         dismissed at all, so the chrome was correctly present and the probe was grading its own
         wreckage. A test that has just broken the state cannot then measure it. */
      await go();

      /* ⚠ THE COMMIT GOES LAST, AND HAS TO. It ENDS the picker — every later assertion would be
         reading a sheet that no longer exists, which is how this probe crashed on `ask rect null`
         the first time it was written. The drag left the sheet clamped at the bottom edge, so the
         card is re-found from its live rect rather than from anything measured before. */
      /* ⭐ AND THEN COMMIT IT, WHICH IS THE STATE WYATT PHOTOGRAPHED. A recipe card takes TWO taps
         (docs/DRIVING-THE-GAME.md 3c): the first charts its route, the second bakes it. What
         follows is a CENTRE-STAGED narration — and centre stage is the one exit from promptTick
         that used to skip the picker's teardown, so the ask box and the helper pill were left
         standing on the board under it. */
      const cd2 = JSON.parse(await C.ev(`JSON.stringify((()=>{const c=document.querySelector('#actionPanel .apBtn[data-rcpos="front"]');if(!c)return null;const r=c.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(Math.min(r.top+r.height/2, innerHeight-12))}})())`));
      if (cd2){
        await C.send("Input.dispatchMouseEvent",{type:"mousePressed",x:cd2.x,y:cd2.y,button:"left",buttons:1,clickCount:1});
        await C.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:cd2.x,y:cd2.y,button:"left",buttons:0,clickCount:1});
        await sleep(700);
        await C.send("Input.dispatchMouseEvent",{type:"mousePressed",x:cd2.x,y:cd2.y,button:"left",buttons:1,clickCount:1});
        await C.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:cd2.x,y:cd2.y,button:"left",buttons:0,clickCount:1});
      }
      await sleep(2800);
      const chosen = JSON.parse(await C.ev(`JSON.stringify((()=>{
        const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();
          return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}};
        const ap=document.getElementById('actionPanel');
        return {ask:R(document.querySelector('.pp4RcAsk')), help:R(document.querySelector('.pp4RcHelp')),
          hint:R(document.querySelector('.pp4PeekHint')),
          staged:!!(ap&&ap.dataset.pp4Stage), cards:document.querySelectorAll('#actionPanel .recipeList').length,
          says:(ap?ap.textContent:'').replace(/\s+/g,' ').trim().slice(0,64)};
      })())`));
      await shot("after-choosing-desktop.png");
      say(`\n ── AFTER CHOOSING A RECIPE (his 2026-09-09 screenshot) ──`);
      say(`   panel now says   ${JSON.stringify(chosen.says)}   centre-staged=${chosen.staged} recipeLists=${chosen.cards}`);
      say(`   ask box left behind?    ${chosen.ask ? "YES -> " + JSON.stringify(chosen.ask) : "no (removed)"}`);
      say(`   helper pill left behind? ${chosen.help ? "YES -> " + JSON.stringify(chosen.help) : "no (removed)"}`);

    }
  }
  say(`\nshots -> ${OUT}`);
} catch(e){ say("PROBE FAILED:", e.message); } finally { killAll(); }
