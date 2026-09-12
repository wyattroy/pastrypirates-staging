/* W3-6: DOES THE SONG PICK UP WHERE IT LEFT OFF? Wyatt, 2026-09-12: "every time I leave the tab and
   come back, the song begins at the beginning again... it should pick back up where it left off."

   MEASURED WITHOUT ADDING A TEST HOOK TO THE GAME: every resume is a NEW AudioBufferSourceNode
   started at an offset, so the offset argument of `start()` IS the answer. The page's own
   AudioBufferSourceNode.prototype.start is wrapped before the module runs, and the offsets it was
   handed are read back afterwards. A first play at 0, a second play at 0, is the bug.

   ⚠ TWO THINGS THIS PROBE LEARNED THE HARD WAY, 2026-09-12, both of which made it report a fault in
   code that was correct:

   1. THE SONG IS NOT THE ONLY LONG SOUND. The first version only recorded sources whose buffer ran
      longer than 30 seconds and assumed that meant the song. The sea bed's loop is 16.71s and the
      song is 214.08s, so the threshold happened to work — but the probe could not SAY which sound
      it had watched, and an instrument that cannot report on itself is not evidence
      (docs/QA-PROCESS.md 2b). Every long source is now recorded WITH ITS BUFFER LENGTH and the
      song is identified as the longest one, by measurement.

   2. A SYNTHETIC CLICK IS NOT A GESTURE, AND A SUSPENDED CONTEXT'S CLOCK READS 0.00 FOREVER.
      `document.body.click()` from Runtime.evaluate does not grant user activation, so Chrome never
      let the AudioContext leave `suspended`. The whole resume is built on `ctx.currentTime` — which
      by design stops advancing while the context is suspended — so every subtraction in
      src/ui/audio.js returned 0 and the probe read `[0, 0]` and condemned the game. The clicks are
      real `Input.dispatchMouseEvent` pairs now, and the probe REFUSES TO JUDGE when its own audio
      clock has not advanced, rather than blaming the game for its own missing gesture. */
import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8995+(process.pid%25), DBG=9695+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-w36-${process.pid}`));
const C=await attach(DBG);
let bad=0; const fail=m=>{bad++;console.log("FAIL "+m)}, pass=m=>console.log("PASS "+m);

/* Recorded before any module runs: every source over 5 seconds, its offset AND its buffer's length,
   plus the AudioContext itself so the probe can read its own clock back. */
const WRAP=`(()=>{ if(window.__starts) return "already";
  window.__starts=[];
  const P=AudioBufferSourceNode.prototype, orig=P.start;
  P.start=function(when,offset){ try{ if(this.buffer && this.buffer.duration>5){
      window.__actx = this.context;
      window.__starts.push({o:+(offset||0), d:+this.buffer.duration.toFixed(2)}); } }catch(e){}
    return orig.apply(this,arguments); };
  return "wrapped"; })()`;

/* A REAL click, dispatched by the browser's own input pipeline, which is the only kind that counts
   as a user gesture for the autoplay policy. */
const clickReal = async sel => {
  const r = JSON.parse(await C.ev(`JSON.stringify((()=>{const e=document.querySelector(${JSON.stringify(sel)});
    if(!e) return null; const b=e.getBoundingClientRect();
    return {x:Math.round(b.left+b.width/2), y:Math.round(b.top+b.height/2)};})())`) || "null");
  if (!r) throw new Error("nothing to click: " + sel);
  const p = { x: r.x, y: r.y, button: "left", clickCount: 1 };
  await C.send("Input.dispatchMouseEvent", { type: "mousePressed", ...p });
  await C.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p });
};
const ctxTime = async () => +(await C.ev(`window.__actx ? window.__actx.currentTime : -1`) || -1);
const ctxState = async () => await C.ev(`window.__actx ? window.__actx.state : "none"`);

try{
  await C.send("Input.enable").catch(()=>{});
  await C.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(900);
  console.log("  wrap before any module runs:", await C.ev(WRAP));
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.reload()`).catch(()=>{}); await sleep(600);
  await C.ev(WRAP);                                   // a reload wipes it; re-wrap immediately
  await sleep(2200);
  /* the music only plays with sound running, which needs a REAL gesture — hence clickReal */
  const t=Date.now();
  while(Date.now()-t<40000){ if(await C.ev(`!!document.getElementById('choiceSolo')`)) break; await sleep(200); }
  await clickReal("#choiceSolo");
  const t2=Date.now();
  while(Date.now()-t2<40000){ if(await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`)) break; await sleep(200); }
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
  await clickReal("#btnNameConfirm");
  await sleep(2500);
  await C.ev(`(async()=>{ window.__a = await import('/src/ui/audio.js'); return 'loaded'; })()`);

  /* WAIT FOR THE SONG ITSELF, not for the first long sound. The sea bed starts first and would
     satisfy a bare "something started" — this asks for a source over a minute long, which the sea
     loop (16.71s) never is. */
  const readStarts = async () => JSON.parse(await C.ev(`JSON.stringify(window.__starts||[])`) || "[]");
  const t3=Date.now(); let musicDur=0;
  while(Date.now()-t3<90000){
    const st = await readStarts();
    const longest = st.reduce((m,x)=>Math.max(m,x.d),0);
    if (longest > 60) { musicDur = longest; break; }
    await sleep(1000);
  }
  if(!musicDur){
    fail(`the song never started in 90s — nothing to judge. long sources seen: ${JSON.stringify(await readStarts())}`);
  } else {
    /* ⭐ THE INSTRUMENT'S OWN SELF-CHECK, and the reason this probe once read a false red: if the
       audio clock is frozen the resume arithmetic CANNOT produce anything but 0, and the honest
       answer is "this probe cannot judge", never "the game is broken". */
    const c1 = await ctxTime(); await sleep(2500); const c2 = await ctxTime();
    console.log(`  audio clock: ${c1.toFixed(2)} -> ${c2.toFixed(2)} (context ${await ctxState()})`);
    if (!(c2 > c1 + 0.5)) {
      fail(`THE PROBE CANNOT JUDGE: its own audio clock did not advance (${c1} -> ${c2}, context `
         + `${await ctxState()}). Chrome never granted the gesture, so every subtraction in the `
         + `game's resume reads 0 no matter what the code does. Fix the probe, not the game.`);
    } else {
      console.log(`  the song is playing (buffer ${musicDur}s); letting it run 6s before the pause`);
      await sleep(6000);
      await C.ev(`window.__a.setMuted(true)`);   await sleep(1500);
      await C.ev(`window.__a.setMuted(false)`);  await sleep(3000);
      const all = await readStarts();
      const music = all.filter(x=>x.d===musicDur).map(x=>x.o);
      console.log("  every long source started:", JSON.stringify(all));
      console.log(`  the song's own start offsets (buffer ${musicDur}s):`, JSON.stringify(music.map(o=>+o.toFixed(2))));
      if (music.length < 2) fail(`the song did not start a second time after the pause (${JSON.stringify(music)})`);
      else if (music[music.length-1] === 0) fail(`the resume began at 0 — the song started over (${JSON.stringify(music)})`);
      else pass(`paused and resumed at ${music[music.length-1].toFixed(2)}s into the song, not 0`);
      /* RED-PROOF: a resume that ignores the offset reads 0 here, which is the branch above — and
         that branch is exactly what this probe printed on 2026-09-12 while the clock was frozen,
         which is how the self-check above earned its place. */
    }
  }
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); bad++; } finally { await killAll(); }
console.log(bad ? `\nFAILED — ${bad}` : "\nPASSED — 0 failure(s)");
process.exit(bad?1:0);
