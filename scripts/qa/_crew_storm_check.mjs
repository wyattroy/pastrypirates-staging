/* A STORM IN A CREW GAME, WATCHED ON BOTH SCREENS.
 *   node scripts/qa/_crew_storm_check.mjs [--minutes=6]
 *
 * Two questions, one storm:
 *   1. His item 15 (2026-09-10): "The storm helper tutorial polly line only appeared for Host".
 *      The fix raised it from the ONE event consumer instead of the host's round loop, and it has
 *      been verified by structure only — five solo runs never reached a storm. This watches for the
 *      lesson ("A storm takes the whole crew") on the HOST and on the GUEST.
 *   2. W1-2: "During a storm the host steps one square at a time; the guest jumps to the end point",
 *      and his pick once converged: "make the one function move directly to the end point". Every
 *      ship's COMPUTED transform is sampled each frame on both screens while the storm plays: a
 *      glide shows many in-between values, a jump shows none, a step-walk shows pauses between.
 *
 * The storm is forced on the HOST's game object (the host computes; a guest only draws), before
 * the first weather is drawn — the same lever _storm_line_check.mjs uses, never an engine edit.
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 6);
const PORT = 8600 + (process.pid % 40), DBG_H = 9600 + 2 * (process.pid % 40), DBG_G = DBG_H + 1;
const url = serve(PORT);
launch(DBG_H, path.join(REPO, `.tmp-cstorm-host-${process.pid}`));
launch(DBG_G, path.join(REPO, `.tmp-cstorm-guest-${process.pid}`));
const H = await attach(DBG_H), G = await attach(DBG_G);
await H.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
await G.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

/* Installed in each page: the lesson's first sighting, and — from the frame a storm event lands —
   every ship's computed transform, per frame, for eight seconds. */
const WATCH = `(()=>{
  if(window.__cs)return "already";
  const S=window.__cs={lesson:null,storm:null,tracks:{},frames:0};
  const st=()=>{try{return __pp_app_state_debug()}catch(e){return null}};
  const ships=()=>{const h=document.getElementById('boardShips')||document.getElementById('board');
    return h?[...h.querySelectorAll('g')].filter(g=>g.querySelector('image')):[]};
  const tick=()=>{
    S.frames++;
    const now=performance.now();
    if(!S.lesson&&/A storm takes the whole crew/i.test(document.body.innerText||''))S.lesson=Math.round(now);
    const a=st();
    if(!S.storm&&a&&a.game&&a.game.events&&a.game.events.some(e=>e.t==='storm'))S.storm=Math.round(now);
    if(S.storm&&now-S.storm<8000){
      ships().forEach((g,i)=>{const t=getComputedStyle(g).transform;const k='s'+i;
        const tr=S.tracks[k]||(S.tracks[k]=[]);
        if(!tr.length||tr[tr.length-1].t!==t)tr.push({ms:Math.round(now-S.storm),t});});
    }
    if(S.frames<60*60*12)requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "watching";})()`;
const READ = `JSON.stringify(window.__cs?{lesson:__cs.lesson,storm:__cs.storm,tracks:__cs.tracks}:null)`;
const FORCE = `(()=>{const a=__pp_app_state_debug();const g=a&&a.game;if(!g)return 'no game';
  if(g.cfg)g.cfg.storm=1; return 'storm forced: cfg.storm='+(g.cfg&&g.cfg.storm);})()`;

/* A glide is many distinct in-between transforms; a step-walk is changes separated by holds longer
   than a frame or two; a jump is one change. Read off the samples, per ship that moved. */
function shape(track) {
  if (!track || track.length < 2) return null;
  const changes = track.length - 1;
  let holds = 0;
  for (let i = 1; i < track.length; i++) if (track[i].ms - track[i - 1].ms > 250) holds++;
  const span = track[track.length - 1].ms - track[0].ms;
  return { changes, holds, span, kind: changes <= 2 ? "JUMP" : holds >= 2 ? "STEPS" : "GLIDE" };
}
let exit = 1;
/* A HARD DEADLINE — the first run hung five minutes past its own loop and had to be killed by hand.
   Whatever is awaited, the browsers die on time (rule 17). */
setTimeout(async () => { console.log("  WATCHDOG — out of time; killing the browsers"); try { await killAll(); } catch {} process.exit(2); }, (MINUTES + 3) * 60000).unref();
try {
  const code = await makeHost(H, url, "Host Hana");
  console.log(`  room ${code}`);
  await makeGuest(G, url, code, "Guest Gus");
  console.log("  host:", await H.ev(WATCH), " guest:", await G.ev(WATCH));
  await startVoyage(H);
  /* ⚠ BOTH CAPTAINS ANSWER "NAH" — the first run of this probe watched six storms and never saw
     the lesson on EITHER screen, and the fault was mine: the rig's driver taps the first button,
     which on "Do ye know how to play?" is "Yarrgh!" — and a captain who says they know how to play
     has the parrot switched off. A new captain says "Nah", so both seats say it here, by hand,
     before any driver starts. */
  let saidH = false, saidG = false;
  const nah = async C => C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/\\bnah\\b/i.test(x.textContent));if(b){b.click();return true}return false})()`).catch(() => false);
  for (let i = 0; i < 60 && !(saidH && saidG); i++) {
    if (!saidH && await nah(H)) { saidH = true; console.log('  host answered "Nah"'); }
    if (!saidG && await nah(G)) { saidG = true; console.log('  guest answered "Nah"'); }
    await sleep(500);
  }
  if (!(saidH && saidG)) console.log(`  ⚠ "Nah" not found on ${saidH ? "" : "host "}${saidG ? "" : "guest"} — the lesson may be silenced there`);
  await sleep(1500);
  for (let i = 0; i < 20; i++) { const r = await H.ev(FORCE).catch(() => "err"); if (/forced/.test(r)) { console.log("  " + r); break; } await sleep(500); }
  await driver(H, url); await driver(G, url);
  console.log("  both seats driving");
  const t0 = Date.now();
  let h = null, g = null;
  while (Date.now() - t0 < MINUTES * 60000) {
    await sleep(3000);
    h = JSON.parse(await H.ev(READ)); g = JSON.parse(await G.ev(READ));
    if (Math.round((Date.now() - t0) / 1000) % 30 < 3) console.log(`  +${Math.round((Date.now() - t0) / 1000)}s  storm host:${!!(h && h.storm)} guest:${!!(g && g.storm)}  lesson host:${!!(h && h.lesson)} guest:${!!(g && g.lesson)}`);
    if (h && g && h.lesson && g.lesson && h.storm && g.storm && Date.now() - t0 > 20000) { await sleep(8000); h = JSON.parse(await H.ev(READ)); g = JSON.parse(await G.ev(READ)); break; }
  }
  console.log(`\n  storm reached — host: ${!!(h && h.storm)}  guest: ${!!(g && g.storm)}`);
  console.log(`  1. the storm lesson — host: ${h && h.lesson ? "SEEN" : "never"}   guest: ${g && g.lesson ? "SEEN" : "never"}`);
  console.log(`  2. how each ship moved in the first storm (per screen):`);
  for (const [who, d] of [["host", h], ["guest", g]]) {
    const rows = Object.entries((d && d.tracks) || {}).map(([k, tr]) => [k, shape(tr)]).filter(([, s]) => s);
    console.log(`     ${who}: ` + (rows.length ? rows.map(([k, s]) => `${k} ${s.kind} (${s.changes} changes, ${s.holds} holds, ${s.span}ms)`).join(" · ") : "no ship moved"));
  }
  const ok1 = !!(h && g && h.storm && h.lesson && g.lesson);
  console.log(ok1 ? "\n  PASS (1) — the lesson reached both screens" : (h && h.storm ? "\n  FAIL (1) — a storm happened and the lesson did not reach both screens" : "\n  NOT RUN — no storm was reached, so (1) proves nothing"));
  exit = ok1 ? 0 : 1;
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
process.exit(exit);
