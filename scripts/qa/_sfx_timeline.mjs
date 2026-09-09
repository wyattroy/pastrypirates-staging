/* WHEN DOES EACH SOUND ACTUALLY REACH THE SPEAKERS, AND WHAT IS THE BOAT DOING AT THE TIME?
 *
 *   node scripts/qa/_sfx_timeline.mjs
 *
 * Wyatt, 2026-09-08 (sheet item s4): "It should happen WHEN the captain clicks a sail square /
 * BEGINS to sail -- instead, it seems to happen after they have started sailing/have arrived...
 * also related to this is the fact that the coin flip/anchor sounds of bot players happen
 * CONCURRENTLY with the sail sound, which is confusing... please do in depth research to figure
 * out what's going wrong with the sfx timing for bot vs human turns."
 *
 * THE INSTRUMENT IS THE AUDIO GRAPH ITSELF, not the game's own logging: AudioBufferSourceNode.start
 * is wrapped before the page loads, so EVERY sound is timestamped at the instant it is handed to
 * the speakers, by whatever route. Each one is identified by its buffer's DURATION, which is unique
 * per stem to four decimal places — so the log cannot disagree with what was actually played.
 * The boat's motion is read the same way: a MutationObserver on the ships' own transform.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8500 + (process.pid % 80), DBG = 9500 + (process.pid % 80);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-sfx-${process.pid}`));
const C = await attach(DBG);

// duration -> stem, read off the files rather than typed
import fs from "node:fs";
import { execSync } from "node:child_process";
const STEMS = {};
for (const f of fs.readdirSync(path.join(REPO, "sfx")).filter(x => x.endsWith(".mp3"))) {
  const d = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path.join(REPO,"sfx",f)}"`).toString().trim();
  STEMS[(+d).toFixed(4)] = f.replace(".mp3", "");
}
const nameFor = d => STEMS[(+d).toFixed(4)] || `(unknown ${d}s)`;

const INSTRUMENT = `(function(){
  window.__snd = []; window.__mv = [];
  window.__t0 = performance.now();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC){
    const orig = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function(){
      const node = orig.call(this);
      const s = node.start.bind(node);
      node.start = function(){
        try { window.__snd.push({ t: Math.round(performance.now() - window.__t0),
                                  dur: node.buffer ? node.buffer.duration : null }); } catch(e){}
        return s.apply(node, arguments);
      };
      return node;
    };
  }
  document.addEventListener("pointerdown", function(e){
    const c = e.target && e.target.closest && e.target.closest(".sailCell");
    if (c) window.__snd.push({ t: Math.round(performance.now() - window.__t0), tap: "sail square" });
  }, true);
  // the boat's own motion, straight off its transform
  const obs = new MutationObserver(ms => {
    for (const m of ms){
      if (m.type === "attributes" && m.attributeName === "style" && m.target && m.target.style &&
          /translate/.test(m.target.style.transform || ""))
        window.__mv.push(Math.round(performance.now() - window.__t0));
    }
  });
  const arm = () => { const b = document.getElementById("board"); if (b) obs.observe(b, {subtree:true, attributes:true, attributeFilter:["style"]}); else setTimeout(arm, 300); };
  arm();
})();`;

const waitFor = async (e, ms = 25000, l = e) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return true; } catch {} await sleep(200); }
  throw new Error("timed out: " + l); };

try {
  await C.send("Page.enable", {});
  await C.send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
  await C.ev(`location.href=${JSON.stringify(url + "?pilot=vet")}`).catch(()=>{});
  await sleep(2200);
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.href=${JSON.stringify(url + "?pilot=vet")}`).catch(()=>{});
  await sleep(2600);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000, "name modal");
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`!!(window.__pp_app_state_debug&&__pp_app_state_debug().game&&__pp_app_state_debug().game.players.some(p=>p.strategy==='human'))`, 25000, "solo game");

  // clear the openers, then play several turns so both a HUMAN sail and BOT turns are captured
  for (let i = 0; i < 150; i++){
    const did = await C.ev(`(()=>{
      const c=document.getElementById('flipCoinWrap');
      if(c&&c.classList.contains('active')&&c.onclick){c.onclick();return 'coin'}
      const cell=[...document.querySelectorAll('.sailCell')].filter(x=>x.offsetParent)[0];
      if(cell){ cell.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
                cell.click(); return 'SAIL' }
      const b=[...document.querySelectorAll('#actionPanel .apBtn,#actionPanel .btlBtn')]
        .filter(x=>!/back|←|‹/i.test(x.textContent)&&x.offsetParent)[0];
      if(b){b.click();return 'btn'} return '';})()`);
    await sleep(did ? 700 : 900);
    // keep going until at least four boats have moved, so BOT turns are in the record too
    const moves = await C.ev(`(window.__snd||[]).filter(e=>e.dur&&Math.abs(e.dur-1.131)<0.002).length`);
    if (moves >= 4) break;
  }

  const snd = JSON.parse(await C.ev(`JSON.stringify(window.__snd||[])`));
  const mv  = JSON.parse(await C.ev(`JSON.stringify(window.__mv||[])`));
  // collapse the transform mutations into runs of motion
  const runs = [];
  for (const t of mv){
    const last = runs[runs.length-1];
    if (last && t - last.end < 400) last.end = t; else runs.push({ start: t, end: t });
  }
  console.log("\n  ── THE TIMELINE (ms from page load) ──────────────────────────────────");
  const rows = snd.map(e => e.tap
    ? { t: e.t, what: `👆 TAP a ${e.tap}` }
    : { t: e.t, what: `🔊 ${nameFor(e.dur)}` });
  for (const r of runs) rows.push({ t: r.start, what: `⛵ boat starts moving  (${r.end - r.start}ms of motion)` });
  rows.sort((a,b) => a.t - b.t);
  let prev = null;
  for (const r of rows){
    const gap = prev == null ? "" : `  +${String(r.t - prev).padStart(5)}ms`;
    console.log(`   ${String(r.t).padStart(7)}ms${gap.padEnd(11)}  ${r.what}`);
    prev = r.t;
  }
  console.log("\n  ── WHAT THE TAPS COST ────────────────────────────────────────────────");
  for (let i = 0; i < snd.length; i++){
    if (!snd[i].tap) continue;
    const next = snd.slice(i+1).find(e => !e.tap && nameFor(e.dur) === "ship-move");
    const run = runs.find(r => r.start >= snd[i].t);
    console.log(`   tap at ${snd[i].t}ms -> ship-move at ${next ? next.t + "ms (+" + (next.t - snd[i].t) + "ms)" : "NEVER"}` +
                `, boat starts at ${run ? run.start + "ms (+" + (run.start - snd[i].t) + "ms)" : "?"}`);
  }
} catch (e) {
  console.log("PROBE FAILED:", e.message);
} finally { killAll(); }
