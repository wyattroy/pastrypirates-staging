/* THE BLOCKER: a bot attacks ye, ye look away, and the ceremony tears itself down mid-question.
 *
 *   node scripts/qa/_battle_veil_patience.mjs
 *
 * Wyatt, 2026-09-08: "when i was attacked by a bot, the stage didn't appear... i had to refresh
 * the page to continue the game, which is not okay." Solo, a bot's turn, the window visible but
 * unfocused (he ruled out a hidden tab himself: "the sound was still audible").
 *
 * POSED, not played (§5e): the two ships are put next to each other and asyncBattle is called
 * directly, because waiting for a bot to pick a fight is a coin toss over many turns.
 *
 * WHAT IT MEASURES: with the coin ARMED and nobody tapping, is the veil still standing after the
 * old deadline (CER_VEIL_WAIT_CAP_MS = 7100ms) has passed? It must be — a person is allowed to
 * think. Red-proofed against the old watchdog in the same run.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8300 + (process.pid % 90), DBG = 9300 + (process.pid % 90);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-veil-${process.pid}`));
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const waitFor = async (e, ms = 20000, l = e) => { const t = Date.now();
  while (Date.now() - t < ms) { try { if (await C.ev(e)) return true; } catch {} await sleep(200); }
  throw new Error("timed out waiting for: " + l); };

let fails = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { console.log("  FAIL  " + m); fails++; };

try {
  await C.ev(`location.href=${JSON.stringify(url + "?pilot=vet")}`).catch(()=>{});
  await sleep(2200);
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.href=${JSON.stringify(url + "?pilot=vet")}`).catch(()=>{});
  await sleep(2500);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000, "the name modal");
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`!!(window.__pp_app_state_debug&&__pp_app_state_debug().game&&__pp_app_state_debug().game.players.some(p=>p.strategy==='human'))`, 25000, "a solo game");
  // clear the opening cards so the stage is idle
  for (let i = 0; i < 8; i++){
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>!/back|←|‹/i.test(x.textContent))[0];if(b){b.click();return 1}return 0})()`);
    await sleep(600);
    if (await C.ev(`!!document.querySelector('.sailCell')`)) break;
  }
  await sleep(800);

  // ── POSE THE FIGHT ──────────────────────────────────────────────────────────────
  const posed = await C.ev(`(async()=>{
    const orch = await import('/src/orchestrator.js');
    const g = __pp_app_state_debug().game;
    const me = g.players.find(p=>p.strategy==='human');
    const bot = g.players.find(p=>p.strategy!=='human');
    if(!me||!bot) return 'no seats';
    // adjacency, powder, and a hold worth taking (rule 13e: an empty hold cannot be attacked)
    bot.coins = 20; me.coins = 20;
    const rec = (me.recipe && me.recipe.length ? me.recipe : ['sugar']);
    me.ing = [rec[0], rec[0]];
    me.pos = [...g.home];
    bot.pos = [g.home[0], g.home[1]-1];
    if(!g.canAttack(bot, me)){
      // try the other four neighbours before giving up
      const steps=[[1,0],[-1,0],[0,1],[0,-1]];
      for(const s of steps){ bot.pos=[g.home[0]+s[0], g.home[1]+s[1]]; if(g.canAttack(bot,me)) break; }
    }
    if(!g.canAttack(bot, me)) return 'canAttack still false';
    window.__veilProbe = { started: Date.now(), done: false };
    orch.asyncBattle(bot, me).then(()=>{ window.__veilProbe.done = true; });
    return 'battle started: ' + bot.name + ' -> ' + me.name;
  })()`);
  console.log("  posed -> " + posed);
  if (String(posed).indexOf("battle started") < 0) throw new Error("could not pose the fight: " + posed);

  // ── WAIT FOR THE DEFEND FLIP TO ARM, THEN DO NOTHING AT ALL ─────────────────────
  await waitFor(`(()=>{const c=document.getElementById('flipCoinWrap');
    return !!(c && c.classList.contains('active') && c.onclick && document.getElementById('pp4Veil'))})()`,
    30000, "the defend flip's ceremony");
  pass("a bot attacking a human raises the coin ceremony and arms the coin");

  const look = async () => JSON.parse(await C.ev(`JSON.stringify((()=>{
    const c=document.getElementById('flipCoinWrap'), v=document.getElementById('pp4Veil');
    return {veil: !!v, armed: !!(c&&c.classList.contains('active')&&c.onclick),
            cerClass: document.body.classList.contains('pp4Cer'),
            face: c ? (c.classList.contains('heads')?'H':c.classList.contains('tails')?'T':c.classList.contains('spin')?'spin':c.classList.contains('wait')?'wait':'') : null};
  })())`));

  console.log("\n  nobody taps. watching past the old 7100ms deadline:");
  for (const at of [2000, 5000, 8000, 11000]) {
    while (true) { const el = Date.now(); if (el) break; }
    await sleep(at === 2000 ? 2000 : 3000);
    const s = await look();
    console.log(`    t+${String(at).padStart(5)}ms  veil=${s.veil}  armed=${s.armed}  face=${s.face}`);
    if (at >= 8000) {
      if (s.veil && s.armed) pass(`t+${at}ms — the ceremony is still up and still asking (past the ${7100}ms deadline)`);
      else fail(`t+${at}ms — the ceremony vanished while the coin was still armed. THIS IS HIS BLOCKER.`);
    }
  }

  // ── and it still ANSWERS when finally tapped ────────────────────────────────────
  await C.ev(`document.getElementById('flipCoinWrap').onclick()`);
  await sleep(2600);
  const after = await look();
  console.log(`\n  after the tap: veil=${after.veil} face=${after.face}`);
  if (!after.veil) pass("tapping late still resolves the flip and the ceremony leaves");
  else fail("the ceremony did not leave after the tap");
  // his bug 1: the face must survive for as long as the veil does
  const held = await C.ev(`(()=>{const c=document.getElementById('flipCoinWrap');
    return !document.getElementById('pp4Veil') || c.classList.contains('heads') || c.classList.contains('tails');})()`);
  if (held) pass("the coin never shows a blank face while the veil is standing (his bug 1)");
  else fail("the coin went blank underneath a standing veil — his bug 1 is back");

  console.log(fails ? `\nFAILED — ${fails}` : "\nPASSED — a thinking captain keeps the stage");
} catch (e) {
  console.log("PROBE FAILED:", e.message); fails++;
} finally { killAll(); }
process.exit(fails ? 1 : 0);
