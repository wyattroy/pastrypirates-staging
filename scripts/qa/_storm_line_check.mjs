/* DOES THE STORM LESSON STILL APPEAR, NOW THAT ONLY THE CONSUMER RAISES IT? — Wyatt, playtest
 * 2026-09-10, item 15: "The storm helper tutorial polly line only appeared for Host -- have you
 * ensured that these are also drained from the engine?"
 *
 * SOLO, DELIBERATELY, and it proves the thing that matters. The old call lived in runLiveNet — the
 * HOST'S round loop — which a guest never runs; that call site is deleted. The new one is in
 * consumeEvent, and `one_event_consumer_check.mjs` (in the gate chain) fails the build if a second
 * consumer of the event stream ever appears. So if the card appears in solo it was raised by the
 * consumer, and the consumer is provably the same code a guest runs.
 *
 * ⚠ NOT `?endcard=1`. That shortcut SILENCES the Pilot (added the same day), so a probe using it
 * can never see a tutorial card — my own dev route defeated my own first test of this.
 *
 * The storm is a 1-in-5 roll decided a ROUND AHEAD, so it is forced on the live game once the game
 * object exists — before round 1's weather is drawn — rather than by editing the engine.
 *
 * ⛔ IT DOES NOT CURRENTLY REACH A STORM, AND IT SAYS SO RATHER THAN PASSING. Five runs; the driver
 * stalls at `round=0` with nothing clickable — after the recipe is chosen, no #apStay and no
 * visible .apBtn is found, so a turn is never completed and no weather is ever drawn. The fault is
 * in the DRIVING, not in the fix; whoever picks this up should start by dumping the panel's
 * contents at that point rather than adding another click heuristic on top of the three already
 * here. Left in the tree with its own verdict lines intact, because a probe that knows it did not
 * exercise the thing it names is worth more than a deleted one and far more than a green one.
 *
 * WHAT IS VERIFIED WITHOUT IT: the old call site was `runLiveNet` — the host's own round loop,
 * which a guest never runs — and it is deleted; the new one is in consumeEvent, which
 * `one_event_consumer_check.mjs` holds as the ONE consumer both tiers drain. That is the whole of
 * his question. What is NOT verified is a storm observed end to end.
 *
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8670 + (process.pid % 30), DBG = 9270 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-sl-${process.pid}`));
const C = await attach(DBG);
const say = console.log;
let bad = 0;
const waitFor = async (e,ms=45000)=>{const t=Date.now();
  while(Date.now()-t<ms){ try{ if(await C.ev(e)) return 1; }catch{} await sleep(250); } return 0; };
const LESSON  = `/A storm takes the whole crew/i.test(document.body.innerText||'')`;
const STORMED = `(()=>{const S=window.__pp_app_state_debug&&__pp_app_state_debug();
  return !!(S&&S.game&&S.game.events&&S.game.events.some(e=>e.t==='storm'))})()`;
const force = () => C.ev(`(()=>{const S=window.__pp_app_state_debug&&__pp_app_state_debug();
  const g=S&&S.game; if(!g)return null;
  if(g.cfg)g.cfg.storm=1; if(g.next)g.next.storm=true; g.stormNext=true; g.stormStreak=0;
  return 1})()`);
/* ⚠ "STAY PUT" IS #apStay AND IS NOT AN .apBtn — which is why the first three runs of this probe
   never advanced a single round and truthfully reported "the probe never exercised the thing it
   names". A sail prompt cannot be answered by clicking buttons alone: without this the turn never
   completes, the round never turns, and no weather is ever drawn. */
const click = () => C.ev(`(()=>{
  const stay=document.getElementById('apStay');
  if(stay&&stay.offsetParent){stay.click();return 'stay'}
  const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>x.offsetParent&&!x.querySelector('.recipeList'));
  const p=bs.find(x=>/nah/i.test(x.textContent))||bs.find(x=>/aye/i.test(x.textContent))||bs.find(x=>!/back|←|‹|leave/i.test(x.textContent));
  if(p){p.click();return p.textContent.trim().slice(0,18)}return 0})()`);

try {
  await C.send("Emulation.setDeviceMetricsOverride",{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1600);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2400);
  await waitFor(`!!document.getElementById('choiceSolo')`);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh phone'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await force();                        // the game object exists by now — pin the weather
  await click(); await sleep(900);      // "Nah" — keeps the Pilot ON
  await click();                        // Start
  await waitFor(`!!document.querySelector('#actionPanel .recipeList')`);
  await force();
  await sleep(5200);
  await C.ev(`(()=>{const c=[...document.querySelectorAll('#actionPanel .apBtn')].find(b=>b.querySelector('.recipeList'));if(c)c.click();return !!c})()`);
  await sleep(1500);

  let stormed=false, saw=false;
  for (let i=0;i<45;i++){
    await force();
    if (await C.ev(STORMED)) stormed = true;
    if (await C.ev(LESSON))  saw = true;
    if (stormed && saw) break;
    const did=await click();
    if(i%10===0){const r=await C.ev(`(()=>{const S=window.__pp_app_state_debug&&__pp_app_state_debug();return S&&S.game?S.game.round:'-'})()`);
      say(`   [${i}] round=${r} clicked=${JSON.stringify(did)}`);}
    await sleep(850);
  }
  say(`\n  a storm actually happened : ${stormed}`);
  say(`  the lesson appeared       : ${saw}`);
  const check=(n,ok,d="")=>{ say(`  ${ok?"PASS":"FAIL"}  ${n}${ok?"":" — "+d}`); if(!ok)bad++; };
  check("a storm was reached at all", stormed, "the probe never exercised the thing it names");
  check("the consumer raises the lesson (his item 15)", saw,
        "the card never appeared, so consumeEvent is not raising it");
  say(bad ? `\n${bad} FAILURE(S)` : `\nALL CLEAR — raised by the one consumer both tiers run.`);
} catch (e) { say("PROBE FAILED: " + (e && e.message || e)); bad++; }
finally { await killAll(); }
process.exit(bad ? 1 : 0);
