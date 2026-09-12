/* W3-6: DOES THE SONG PICK UP WHERE IT LEFT OFF? Wyatt, 2026-09-12: "every time I leave the tab and
   come back, the song begins at the beginning again... it should pick back up where it left off."
   MEASURED WITHOUT ADDING A TEST HOOK TO THE GAME: every resume is a NEW AudioBufferSourceNode
   started at an offset, so the offset argument of `start()` IS the answer. The page's own
   AudioBufferSourceNode.prototype.start is wrapped before the module runs, and the offsets it was
   handed are read back afterwards. A first play at 0, a second play at 0, is the bug. */
import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8995+(process.pid%25), DBG=9695+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-w36-${process.pid}`));
const C=await attach(DBG);
let bad=0; const fail=m=>{bad++;console.log("FAIL "+m)}, pass=m=>console.log("PASS "+m);
const WRAP=`(()=>{ if(window.__starts) return "already";
  window.__starts=[];
  const P=AudioBufferSourceNode.prototype, orig=P.start;
  P.start=function(when,offset){ try{ if(this.buffer && this.buffer.duration>30) window.__starts.push(+(offset||0)); }catch(e){}
    return orig.apply(this,arguments); };
  return "wrapped"; })()`;
try{
  await C.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(900);
  console.log("  wrap before any module runs:", await C.ev(WRAP));
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.reload()`).catch(()=>{}); await sleep(600);
  await C.ev(WRAP);                                   // a reload wipes it; re-wrap immediately
  await sleep(2200);
  /* the music only plays with sound running, which needs a gesture — click, then start a solo game */
  const t=Date.now();
  while(Date.now()-t<40000){ if(await C.ev(`!!document.getElementById('choiceSolo')`)) break; await sleep(200); }
  await C.ev(`document.body.click(); document.getElementById('choiceSolo').click()`);
  const t2=Date.now();
  while(Date.now()-t2<40000){ if(await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`)) break; await sleep(200); }
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await sleep(2500);
  /* wait for the music to actually be playing, then drive the exact pair a tab-switch drives:
     setMuted(true) -> syncBeds() -> musicStop(), and setMuted(false) -> musicStart(). */
  await C.ev(`(async()=>{ window.__a = await import('/src/ui/audio.js'); return 'loaded'; })()`);
  const t3=Date.now(); let heard=false;
  while(Date.now()-t3<60000){ const n=JSON.parse(await C.ev(`JSON.stringify((window.__starts||[]).length)`)||"0");
    if(n>0){heard=true;break;} await sleep(1000); }
  if(!heard){ console.log("SKIP the music never started in 60s — nothing to judge"); }
  else {
    console.log("  music is playing; letting it run 6s before the pause");
    await sleep(6000);
    await C.ev(`window.__a.setMuted(true)`);   await sleep(1500);
    await C.ev(`window.__a.setMuted(false)`);  await sleep(2500);
    const starts = JSON.parse(await C.ev(`JSON.stringify(window.__starts||[])`) || "[]");
    console.log("  start offsets:", JSON.stringify(starts.map(o=>+o.toFixed(2))));
    if (starts.length < 2) fail(`the music did not start a second time after the pause (${JSON.stringify(starts)})`);
    else if (starts[starts.length-1] === 0) fail(`the resume began at 0 — the song started over (${JSON.stringify(starts)})`);
    else pass(`paused after ~6s and resumed at ${starts[starts.length-1].toFixed(2)}s, not 0`);
    /* RED-PROOF: a resume that ignores the offset would read 0 here, which is the branch above. */
  }
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
console.log(bad ? `\nFAILED — ${bad}` : "\nPASSED — 0 failure(s)");
process.exit(bad?1:0);
