/* W0-1 — do ?bake2=1 and ?endcard=1 actually land where they claim?
 *
 *   node scripts/qa/w01_endgame_urls.mjs      exit 0 = both land, 1 = one of them does not
 *
 * COMMITTED BECAUSE THE FIRST VERSION WAS NOT, and the CEO was right about it (review 6): the
 * commit that added these two URLs quoted the numbers this probe produced and left the probe in a
 * scratch directory. **A measurement nobody can re-run is a claim, not a gate.**
 *
 * RED-PROOFED BY CONSTRUCTION, like scripts/qa/t01_solo_enter.mjs: every route is driven TWICE in
 * the same run — once at a BARE url (the known negative) and once with the flag. If the two agree
 * it prints "RED-PROOF FAILED ... nothing was measured" instead of passing. That is not decoration:
 * on 2026-08-27 it is what caught ?endcard=1 sitting behind the turn-order intro's Start button,
 * before the change shipped.
 *
 * Phone size 390x844 — the square Wyatt actually playtests.
 * Runs three legs of up to ~85s each; budget about five minutes.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8477, DBG = 9377;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-w01");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await C.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });

const SHOTS = "/tmp/claude-0/-home-user-pastrypirates/205edaad-bb58-527a-85d4-b887228dafd2/scratchpad";

// what the engine actually holds — the state both the UI and my change read
const STATE = `(async()=>{try{
  if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;}
  const g=window.appState.game; if(!g) return {no:'no game'};
  const h=g.players.find(p=>p.strategy==='human')||g.players[0];
  const stats=document.getElementById('statsWrap');
  return { day:g.round||0,
    bakeAttempts: h.bake?h.bake.attempts:null,
    bakeLocked:   h.bake?h.bake.locked.filter(Boolean).length:null,
    bakeOf:       h.bake?h.bake.locked.length:null,
    baking:       !!h.baking,
    finishers:    (g.finishOrder||[]).length,
    winner:       g.winner,
    endCardShown: !!(stats && getComputedStyle(stats).display!=='none' && stats.getBoundingClientRect().height>0),
    attemptLabel: (document.querySelector('.bkoAtt')||{}).textContent||null };
}catch(e){return {err:String(e.message).slice(0,80)}}})()`;

async function run(tag, query) {
  const full = url + query;
  await C.goto(full);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','${tag}-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(full);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await sleep(1200);
  await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${tag}: home`);
  await C.ev(`document.getElementById('choiceSolo').click();true`);
  await sleep(900);
  await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${tag}: name modal`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
  await C.ev(`document.getElementById('btnNameConfirm').click();true`);

  /* The intros gate the whole opening and each one waits on ONE button. "Arrgh!" holds the Ahoy
     card — a probe that waits for the recipe picker without clicking it sits there until it times
     out, with nothing in the console (measured, 2026-08-27). So: one bounded loop that advances
     whatever is in front of it, and takes the recipe card's TWO taps (DRIVING-THE-GAME §3c). */
  const ADVANCE = `(()=>{
    const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
      return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
    const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
    if(card){card.click();return 'recipe';}
    const go=[...document.querySelectorAll('button')].filter(vis)
      .find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
    if(go){go.click();return 'intro:'+(go.textContent||'').trim().slice(0,16);}
    return null;})()`;

  // bounded watch — 60 samples x 1.4s ~ 84s ceiling, never a while(true)
  let best = null;
  for (let i = 0; i < 60; i++) {
    const s = await C.ev(STATE);
    if (s && !s.err) { best = s; if (s.endCardShown || s.bakeAttempts > 0) break; }
    await C.ev(ADVANCE);
    await sleep(1400);
  }
  await C.shot(`w01-${tag}.png`);
  return best;
}

const out = {};
for (const [tag, q] of [["bare", ""], ["bake2", "?bake2=1"], ["endcard", "?endcard=1"]]) {
  out[tag] = await run(tag, q);
  console.log(`  ${tag.padEnd(8)} ${JSON.stringify(out[tag])}`);
}

console.log("\n=== W0-1 VERDICT ===");
const b2 = out.bake2 || {}, bare = out.bare || {}, ec = out.endcard || {};
const bake2Works  = b2.bakeAttempts === 1 && (bare.bakeAttempts === null || bare.bakeAttempts === 0);
const endcardWorks = ec.endCardShown === true && bare.endCardShown !== true;
console.log(`  ?bake2=1   lands on attempt 2 : ${bake2Works ? "YES" : "NO"}   (flag=${b2.bakeAttempts}, bare=${bare.bakeAttempts})`);
console.log(`  ?endcard=1 lands on the card  : ${endcardWorks ? "YES" : "NO"}   (flag=${ec.endCardShown}, bare=${bare.endCardShown}, finishers=${ec.finishers}, winner=${ec.winner})`);
if (b2.bakeAttempts === bare.bakeAttempts) console.log("  ⚠ RED-PROOF FAILED for bake2 — flag and bare agree, nothing was measured");
if (ec.endCardShown === bare.endCardShown) console.log("  ⚠ RED-PROOF FAILED for endcard — flag and bare agree, nothing was measured");
killAll();
process.exit(bake2Works && endcardWorks ? 0 : 1);
