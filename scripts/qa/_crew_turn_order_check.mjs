/* DOES SAILING ORDER STILL REACH A GUEST, NOW THAT ITS OWN CHANNEL IS GONE?
 *   node scripts/qa/_crew_turn_order_check.mjs
 *
 * 2026-09-10: watchTurnOrder / netSetTurnOrder / rooms/<C>/turnOrder were deleted and the fact now
 * travels as an engine event (Game.setTurnOrder -> consumeEvent), per Wyatt's "we need ONE pipe".
 *
 * ⚠ A LOCAL TEST WOULD PASS EITHER WAY. The host sets its own order in the same breath it emits;
 * only a GUEST ever depended on the deleted channel, so only a two-window run can tell you whether
 * this worked. That is the same lesson the crew-name probe was written for: I fixed a seat in the
 * one renderer a guest never reaches, watched every mode I could test go green, and shipped the
 * one mode he actually reported still broken.
 *
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8790 + (process.pid % 40);
const DH = 9790 + (process.pid % 40), DG = 9930 + (process.pid % 40);
const url = serve(PORT);
launch(DH, path.join(REPO, `.tmp-toH-${process.pid}`));
launch(DG, path.join(REPO, `.tmp-toG-${process.pid}`));
const H = await attach(DH), G = await attach(DG);
const say = console.log;
let bad = 0;

/* The order itself, the rows a captain actually reads it off, and whether the event arrived —
   three answers, because "appState has the value" and "the box shows it" are different claims and
   this fold could break either one alone. */
const ORDER = `JSON.stringify((()=>{
  const S=window.__pp_app_state_debug?__pp_app_state_debug():null;
  /* ⚠ THE REAL MARKUP, read out of buildPlayerRows rather than guessed. My first selector asked
     for '.pp4CapRow' inside '#pp4Cap' -- neither exists -- so it returned [] and the probe reported
     "the guest's captains box drew no rows" as a FAILURE of the fold. It was measuring nothing and
     grading it, which is the one mistake this session has made most. Rows are '#players .player-row'
     and the captain's name is '.pname'; the ORDER of those rows IS seatDisplayOrder() applied, so
     reading them is the only end-to-end proof that the event reached the drawing. */
  const rows=[...document.querySelectorAll('#players .player-row .pname')]
    .map(r=>(r.textContent||'').replace(/\s+/g,' ').trim().slice(0,18));
  const evs=(S&&S.game&&S.game.events)?S.game.events.filter(e=>e.t==='turnOrder').length:null;
  return {order:S?S.turnOrder:null, rows, turnOrderEvents:evs,
          /* players carry no 'name' -- the roster does (buildPlayerRows reads appState.roster),
             and a bot seat has none at all. Ask the roster, and say 'bot' rather than null. */
          names:(S&&S.roster)?S.roster.map((r,i)=>(r&&r.name)||('bot'+i)):null};
})())`;
const waitFor = async (C,e,ms=45000)=>{const t=Date.now();
  while(Date.now()-t<ms){ try{ if(await C.ev(e)) return 1; }catch{} await sleep(300); }
  throw new Error("timed out: "+e); };

try {
  const code = await makeHost(H, url, "HOSTCAP");
  say(`room ${code}`);
  await makeGuest(G, url, code, "GUESTCAP");
  await sleep(1500);
  await startVoyage(H);
  // lockstep, for the reason the crew-name probe records: the Ahoy barrier waits on EVERY human
  // seat, so answering one window and walking away deadlocks on a gate this probe is holding shut.
  for (let i=0;i<40;i++){
    for (const C of [H,G]) {
      await C.ev(`(()=>{const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>x.offsetParent&&!x.querySelector('.recipeList')).filter(x=>!/back|←|‹/i.test(x.textContent));
        const pick=bs.find(x=>/nah/i.test(x.textContent))||bs[0];if(pick){pick.click();return 1}return 0})()`);
    }
    await sleep(700);
    if (await H.ev(`!!document.querySelector('#actionPanel .recipeList')`) &&
        await G.ev(`!!document.querySelector('#actionPanel .recipeList')`)) break;
  }
  await waitFor(H, `!!document.querySelector('#actionPanel .recipeList')`);
  await waitFor(G, `!!document.querySelector('#actionPanel .recipeList')`);
  // both pick a recipe so the voyage moves past the draft into the turn-order beat
  for (const C of [H,G]) await C.ev(`(()=>{const c=[...document.querySelectorAll('#actionPanel .apBtn')].find(b=>b.querySelector('.recipeList'));if(c)c.click();return !!c})()`);
  await sleep(1200);
  for (const C of [H,G]) await C.ev(`(()=>{const c=[...document.querySelectorAll('#actionPanel .apBtn')].find(b=>b.querySelector('.recipeList'));if(c)c.click();return !!c})()`);

  // THE ORDER IS PUBLISHED BEFORE THE DRAFT (runLiveNet shuffles, then drafts), so by the time a
  // card is on screen the guest should already hold it. Wait on the VALUE, not on a sleep.
  await waitFor(G, `(()=>{const S=window.__pp_app_state_debug?__pp_app_state_debug():null;
    return !!(S&&S.turnOrder&&S.turnOrder.length)})()`, 45000).catch(()=>{});
  await sleep(1500);

  const h = JSON.parse(await H.ev(ORDER)), g = JSON.parse(await G.ev(ORDER));
  say(`\n  HOST  order=${JSON.stringify(h.order)} events=${h.turnOrderEvents} rows=${JSON.stringify(h.rows)}`);
  say(`  GUEST order=${JSON.stringify(g.order)} events=${g.turnOrderEvents} rows=${JSON.stringify(g.rows)}`);
  say(`  seats: ${JSON.stringify(h.names)}`);

  const check = (name, ok, detail="") => { say(`  ${ok?"PASS":"FAIL"}  ${name}${ok?"":" — "+detail}`); if(!ok) bad++; };
  check("the host has an order", Array.isArray(h.order) && h.order.length>0, JSON.stringify(h.order));
  check("the GUEST has an order (the deleted channel's whole job)",
        Array.isArray(g.order) && g.order.length>0, JSON.stringify(g.order));
  check("both devices agree on it", JSON.stringify(h.order)===JSON.stringify(g.order),
        `${JSON.stringify(h.order)} vs ${JSON.stringify(g.order)}`);
  /* EXACTLY ONE. A `value` listener fires on attach AND on every write, so the old channel could
     legitimately apply twice; an event must not, or the fold has introduced a duplicate the drain
     will replay on every reload. */
  check("exactly one turnOrder event on each side",
        h.turnOrderEvents===1 && g.turnOrderEvents===1, `host ${h.turnOrderEvents}, guest ${g.turnOrderEvents}`);
  check("the guest's captains box actually drew rows", g.rows.length>0, "no rows rendered");

  say(bad ? `\n${bad} FAILURE(S)` : `\nALL CLEAR — sailing order crossed the wire on the event stream.`);
} catch (e) {
  say("PROBE FAILED: " + (e && e.message || e)); bad++;
} finally { await killAll(); }
process.exit(bad ? 1 : 0);
