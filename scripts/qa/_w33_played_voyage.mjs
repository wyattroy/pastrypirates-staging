/* W3-3 IN A PLAYED VOYAGE — the half the shortcut cannot reach.
 *   node scripts/qa/_w33_played_voyage.mjs [--minutes=25]
 *
 * His report (2026-08-27, a solo voyage): "The drumroll fires AFTER the narration that names the
 * winner. It should come first." w33_drumroll_order.mjs answers it for the ENDING posed by
 * ?endcard=1 (PASS, twice) — and its own verdict says that does not close W3-3, because the posed
 * ending skips the whole day loop, and the day loop is where he saw it.
 * So this plays a real solo voyage from the first day to the gold banner with the rig's driver and
 * records, in order, every narration line and the banner — a ROLLING log, because a whole voyage
 * narrates far more than the 300 lines w33's recorder keeps. It then reports the last lines before
 * the drumroll and whether any of them named a winner.
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, DRIVER_SRC } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 25);
const PORT = 8900 + (process.pid % 40), DBG = 9900 + (process.pid % 40);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-w33p-${process.pid}`));
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
const WATCH = `(()=>{
  if(window.__w33)return "already";
  window.__w33={log:[],lastN:null,lastB:null};
  const S=window.__w33;
  const txt=el=>((el&&el.textContent)||"").replace(/\\s+/g," ").trim();
  const tick=()=>{
    const bub=document.querySelector(".pp4Bub");
    const msg=document.querySelector("#actionPanel .apMsg")||document.getElementById("actionPanel");
    const n=(txt(bub)||txt(msg)).slice(0,90);
    const st=document.getElementById("statsWrap");
    const shown=st&&getComputedStyle(st).display!=="none"&&st.getBoundingClientRect().height>4;
    const b=shown?txt(st).slice(0,90):"";
    if(n!==S.lastN){S.lastN=n; if(n){S.log.push({t:Math.round(performance.now()),what:"NARRATION",text:n}); if(S.log.length>600)S.log.shift();}}
    if(b!==S.lastB){S.lastB=b; if(b){S.log.push({t:Math.round(performance.now()),what:"GOLD BANNER",text:b}); if(S.log.length>600)S.log.shift();}}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "watching";})()`;
let exit = 1;
try {
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(2500);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2500);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  for (let i = 0; i < 40; i++) { if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break; await sleep(250); }
  await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  console.log("  watcher:", await C.ev(WATCH));
  await sleep(1500);
  await C.ev(DRIVER_SRC(url));
  console.log(`  driving a whole solo voyage (up to ${MINUTES} min)...`);
  const t0 = Date.now();
  while (Date.now() - t0 < MINUTES * 60000) {
    const done = await C.ev(`(()=>{const l=window.__w33?window.__w33.log:[];return l.some(r=>r.what==="GOLD BANNER")})()`);
    if (done === true) { await sleep(4000); break; }
    await sleep(5000);
  }
  const log = JSON.parse(await C.ev(`JSON.stringify(window.__w33?window.__w33.log:[])`));
  const banner = log.find(r => r.what === "GOLD BANNER");
  const drum = log.find(r => /drumroll/i.test(r.text));
  const round = await C.ev(`(()=>{const d=__pp_app_state_debug();return d&&d.game?d.game.round:null})()`).catch(() => null);
  console.log(`  voyage reached day ${round}; ${log.length} lines kept; banner ${banner ? "at " + banner.t + "ms" : "NEVER"}; drumroll ${drum ? "at " + drum.t + "ms" : "NEVER"}`);
  if (!banner) { console.log("=== NOT RUN — the voyage never reached its ending, so no order was observed."); }
  else {
    const endAt = drum ? drum.t : banner.t;
    const before = log.filter(r => r.t <= endAt).slice(-8);
    console.log("  the last lines before " + (drum ? "the drumroll" : "the banner (no drumroll line was seen)") + ":");
    for (const r of before) console.log(`    ${String(r.t).padStart(8)}ms  ${r.what === "GOLD BANNER" ? "[BANNER] " : ""}${r.text}`);
    const names = before.filter(r => r !== drum && /\b(wins|winner|victor|crowned|takes the crown|is the champion)\b/i.test(r.text));
    if (!drum) console.log("=== NO DRUMROLL LINE in this ending — say so rather than guess an order.");
    else if (names.length) { console.log(`=== FAIL — a line naming the winner landed BEFORE the drumroll: "${names[0].text}"`); }
    else { console.log(`=== PASS — nothing named the winner before the drumroll (${banner.t - drum.t}ms later, the banner).`); exit = 0; }
  }
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
process.exit(exit);
