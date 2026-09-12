/* IF THE BOARD IS ALWAYS A SQUARE, WHAT SHAPE IS THE BOX UNDERNEATH IT?
   Wyatt, 2026-09-12: "I wanted the board to always be a square and the captain's box ratios to be
   related to the space left underneath a square board as a constraint." That is the reverse of what
   the code does today — today the box takes what it needs and the board takes the rest — so the
   number that decides the plaque's shape is the LEFTOVER, and it is measured here rather than
   assumed: what is above the board, how tall a square board is, and what is left. */
import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8980+(process.pid%25), DBG=9680+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-sq-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
const M=`JSON.stringify((()=>{
  const R=e=>e&&e.getBoundingClientRect();
  const bw=R(document.getElementById('boardwrap'))||R(document.getElementById('board'));
  const cap=R(document.getElementById('pp4Cap'));
  const rib=R(document.getElementById('pp4Ribbon'));
  const vh=window.innerHeight, vw=window.innerWidth;
  const topBand = bw ? Math.round(bw.top) : null;         // everything above the board
  const squareLeftover = topBand==null ? null : Math.round(vh - topBand - vw);
  return { vw, vh, topBand,
    boardWindow: bw ? Math.round(bw.width)+' x '+Math.round(bw.height) : '—',
    boardRatio: bw ? +(bw.width/bw.height).toFixed(3) : null,
    capH: cap ? Math.round(cap.height) : null,
    ribbonBottom: rib ? Math.round(rib.bottom) : null,
    squareLeftover,
    leftoverRatio: squareLeftover>0 ? +(vw/squareLeftover).toFixed(2) : null };
})())`;
const sizes=[[375,716,1,"his iPhone, Safari bars showing"],[375,812,1,"same iPhone, bars hidden"],
             [390,844,1,"iPhone 14/15"],[390,664,1,"short phone"],[768,1024,1,"tablet"],[1280,800,0,"laptop"]];
try{
  for (const [w,h,m,label] of sizes) {
    await C.send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:m?2:1,mobile:!!m});
    await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1100);
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2300);
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
    await sleep(1800);
    /* past the picker, so the picture is the game and not a modal */
    await C.ev(`(()=>{const c=document.querySelector('#actionPanel .apBtn.recipeCard'); if(c)c.click();})()`).catch(()=>{});
    await sleep(800);
    await C.ev(`(()=>{const p=[...document.querySelectorAll('#actionPanel .apBtn, #actionPanel button')].find(b=>/bake this/i.test(b.textContent)); if(p)p.click();})()`).catch(()=>{});
    for(let t=0;t<14;t++){ const busy=await C.ev(`!!document.querySelector('#actionPanel .apBtn.recipeCard')`); if(!busy)break; await sleep(1000); }
    await sleep(1600);
    const o=JSON.parse(await C.ev(M));
    if (process.env.SHOTS) { const sc=await C.send('Page.captureScreenshot',{format:'png'});
      if(sc.result?.data) (await import('node:fs')).writeFileSync(`${process.env.SHOTS}/sq-${w}x${h}.png`, Buffer.from(sc.result.data,'base64')); }
    console.log(`${label.padEnd(32)} ${w}x${h}  board ${o.boardWindow} (${o.boardRatio}:1)  above ${o.topBand}  box ${o.capH}` +
      `   →  IF SQUARE: leftover ${o.squareLeftover}px, box would be ${o.vw} x ${o.squareLeftover} = ${o.leftoverRatio}:1`);
  }
} catch(e){ console.log("FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
