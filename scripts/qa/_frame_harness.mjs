#!/usr/bin/env node
/* ⭐ THE FRAME HARNESS — what is animating, when, and where the long frames are.
 *
 *   node scripts/qa/_frame_harness.mjs            a solo voyage, sampled
 *   node scripts/qa/_frame_harness.mjs --endcard  the victory ceremony, the heaviest moment there is
 *
 * WHY IT EXISTS. Wyatt, 2026-09-18: *"the game has started to drop frames on my Mac and I wonder if
 * there are ways that the graphics can be optimized better now that there are so many moving things
 * on screen."* `.planning/BACKLOG.md` puts that at the top and names the gap in one line: **there is
 * no frame-rate harness in this repo — nothing under scripts/qa measures frames.** That is what
 * makes "is it faster?" unanswerable, so it is what this builds.
 *
 * ⛔ AND IT IS A PROBE, NOT A GATE — the `_` prefix. It cannot go in `npm test`: it drives a browser
 * through a whole voyage, and docs/DRIVING-THE-GAME.md §3d is explicit that a probe of that shape is
 * intermittent and that "a gate that sometimes hangs is worse than one that is red".
 *
 * ══ WHAT IT MEASURES, AND WHY THESE THREE ══
 *
 *   1. HOW MANY THINGS ARE ANIMATING RIGHT NOW — `document.getAnimations()`. This is the number the
 *      question is really about: he said "so many moving things on screen" and this counts them,
 *      by name, at the instant of the worst frame.
 *   2. LONG FRAMES — consecutive rAF callbacks more than 20 ms apart. At 60 fps a frame is 16.7 ms;
 *      20 ms is one missed.
 *   3. LONG TASKS — PerformanceObserver('longtask'), anything blocking the main thread over 50 ms.
 *
 * ⚠⚠ THE LIMIT, STATED FIRST BECAUSE IT DECIDES HOW THE NUMBERS MAY BE USED. A cloud container has
 * NO GPU: this repo's chromium runs `--use-angle=swiftshader-webgl`, software rasterisation. So the
 * absolute frame times here ARE NOT HIS MAC'S and no report may claim they are. What DOES transfer:
 *   · the COUNT of simultaneous animations, which is a property of the page and not of the machine;
 *   · WHICH MOMENT spikes, and by how much RELATIVE to the rest of the same run;
 *   · a before/after on the same box, which is what "is it faster?" actually needs.
 * The backlog's own warning is the other half — `--disable-gpu` hid the entire finding last time, so
 * this never passes that flag; it reports the renderer it got instead.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENDCARD = process.argv.includes("--endcard");
const SECONDS = +(process.argv.find(a => a.startsWith("--seconds="))?.split("=")[1] || (ENDCARD ? 45 : 90));
const PORT = 8700 + (process.pid % 60), DBG = 9700 + (process.pid % 60);

const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-frames-${process.pid}`));
const C = await attach(DBG);
const tap = async (x = 200, y = 300) => {
  for (const type of ["mousePressed", "mouseReleased"])
    await C.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
};

/* Installed BEFORE the page loads, so nothing is missed during boot — the entrance is one of the
   moments worth catching and it is over before a probe could attach afterwards. */
const INSTRUMENT = `(function(){
  window.__f = { frames: [], long: [], tasks: [], worst: null, started: performance.now() };
  let prev = performance.now();
  function tick(now){
    const dt = now - prev; prev = now;
    window.__f.frames.push(dt);
    if (dt > 20) {
      let running = [];
      try { running = document.getAnimations().filter(a => a.playState === "running"); } catch(e){}
      const rec = { t: Math.round(now - window.__f.started), dt: Math.round(dt), n: running.length };
      window.__f.long.push(rec);
      if (!window.__f.worst || dt > window.__f.worst.dt) {
        const names = {};
        for (const a of running) {
          let k = "(js)";
          try { k = a.animationName || (a.effect && a.effect.getKeyframes && "wa-api") || "(css)"; } catch(e){}
          try { const el = a.effect && a.effect.target; if (el && el.className && typeof el.className === "string")
            k += " ." + el.className.split(/\\s+/).filter(Boolean).slice(0,2).join("."); } catch(e){}
          names[k] = (names[k]||0) + 1;
        }
        window.__f.worst = { ...rec, names };
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries())
      window.__f.tasks.push({ t: Math.round(e.startTime - window.__f.started), ms: Math.round(e.duration) }); })
      .observe({ entryTypes: ["longtask"] });
  } catch(e){}
})()`;

await C.send("Page.enable", {});
await C.send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
await C.goto(url + (ENDCARD ? "?endcard=1" : ""));
await sleep(2500);
await tap(); await sleep(300);
await C.ev(`localStorage.clear(); "cleared"`);
await C.goto(url + (ENDCARD ? "?endcard=1" : ""));
await sleep(2500);
await tap(); await sleep(400);

const renderer = await C.ev(`(()=>{try{const g=document.createElement("canvas").getContext("webgl");
  const d=g&&g.getExtension("WEBGL_debug_renderer_info");
  return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):"unknown";}catch(e){return "unknown"}})()`);

await C.ev(`document.getElementById('choiceSolo').click(); "solo"`);
for (let i = 0; i < 40 && !(await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`)); i++) await sleep(200);
await C.ev(`document.getElementById('nameModalInput').value='Wyatt'; document.getElementById('btnNameConfirm').click(); "named"`);

/* Sample the animation count on a slow clock for the whole run, so a spike has a shape rather than
   a single reading — a snapshot cannot show you a race (QA-PROCESS step 0). */
await C.ev(`window.__s=[]; window.__si=setInterval(()=>{ try{
  const r=document.getAnimations().filter(a=>a.playState==="running");
  window.__s.push({t:Math.round(performance.now()-window.__f.started), n:r.length});
}catch(e){} },250); "sampling"`);

process.stdout.write(`  sailing for ${SECONDS}s`);
for (let i = 0; i < SECONDS / 5; i++) { await sleep(5000); process.stdout.write("."); }
console.log("");

const f = JSON.parse(await C.ev(`(()=>{clearInterval(window.__si);
  const F=window.__f, s=window.__s||[];
  const fr=F.frames.slice(10);
  const sorted=fr.slice().sort((a,b)=>a-b);
  const pct=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:0;
  return JSON.stringify({
    frames:fr.length, median:+pct(.5).toFixed(1), p95:+pct(.95).toFixed(1), p99:+pct(.99).toFixed(1),
    longCount:F.long.length, worst:F.worst, tasks:F.tasks.length,
    taskMs:F.tasks.reduce((a,x)=>a+x.ms,0),
    animMax:Math.max(0,...s.map(x=>x.n)), animMedian:(()=>{const a=s.map(x=>x.n).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0})(),
    peakAt:(s.find(x=>x.n===Math.max(0,...s.map(y=>y.n)))||{}).t,
    samples:s.length
  });})()`));

const bar = n => "█".repeat(Math.min(40, Math.round(n)));
console.log(`\nFRAME HARNESS — ${ENDCARD ? "the victory ceremony" : "a solo voyage"}, ${SECONDS}s\n`);
console.log(`  renderer            ${renderer}`);
console.log(`  ⚠ software rasterisation in a container — these millisecond figures are NOT his Mac's.`);
console.log(`    What transfers is the ANIMATION COUNT and WHICH moment spikes, not the absolute ms.\n`);
console.log(`  frames sampled      ${f.frames}`);
console.log(`  frame time          median ${f.median}ms · p95 ${f.p95}ms · p99 ${f.p99}ms`);
console.log(`  frames over 20ms    ${f.longCount}  (${((f.longCount / Math.max(1, f.frames)) * 100).toFixed(1)}% of the run)`);
console.log(`  long tasks >50ms    ${f.tasks}, ${f.taskMs}ms of blocked main thread in total`);
console.log(`  animations running  median ${f.animMedian} ${bar(f.animMedian)}`);
console.log(`                      PEAK   ${f.animMax} ${bar(f.animMax)}   at ${(f.peakAt / 1000).toFixed(1)}s`);
if (f.worst) {
  console.log(`\n  THE WORST FRAME: ${f.worst.dt}ms at ${(f.worst.t / 1000).toFixed(1)}s, with ${f.worst.n} animation(s) running.`);
  const rows = Object.entries(f.worst.names || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [k, v] of rows) console.log(`      ${String(v).padStart(3)} x  ${k}`);
  if (!rows.length) console.log("      (nothing was animating — so this frame was JS, not the compositor)");
}
const out = path.join(REPO, ".planning", `FRAME-HARNESS-${ENDCARD ? "endcard" : "voyage"}.json`);
fs.writeFileSync(out, JSON.stringify({ renderer, seconds: SECONDS, ...f }, null, 1));
console.log(`\n  written to ${path.relative(REPO, out)} — compare two runs on the SAME box, never across machines.`);
await killAll();
