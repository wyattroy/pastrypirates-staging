/* WHOSE NAME IS ON THE GUEST'S RECIPE PICKER?
 *   node scripts/qa/_crew_ask_name_check.mjs
 *
 * Wyatt, 2026-09-09, two windows side by side: "guest's recipe choice narration box says
 * '{host name}, pick yer recipe' in the host's color. the recipe that they select is still their
 * own; but the box itself is wrong."
 *
 * ⚠ THIS PROBE EXISTS BECAUSE I FIXED IT ONCE AND WAS WRONG. The first fix published the seat in
 * draftDispatch — which covers host, pass-play and solo, all of which I could see locally, and
 * which a guest never passes through at all. Every mode I could test went green while the one mode
 * he reported stayed broken. A crew fault needs a crew instrument.
 *
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8840 + (process.pid % 60);
const DH = 9840 + (process.pid % 60), DG = 9900 + (process.pid % 60);
const url = serve(PORT);
launch(DH, path.join(REPO, `.tmp-crewH-${process.pid}`));
launch(DG, path.join(REPO, `.tmp-crewG-${process.pid}`));
const H = await attach(DH), G = await attach(DG);
const say = console.log;
let bad = 0;

const ASK = `JSON.stringify((()=>{
  const a=document.querySelector('.pp4RcAsk');
  const w=a?a.querySelector('.pp4RcWho'):null;
  return {present:!!a, text:a?a.textContent.trim():null,
    who:w?w.textContent.trim():null, colour:w?w.getAttribute('style'):null,
    cards:document.querySelectorAll('#actionPanel .recipeList').length};
})())`;
const waitFor = async (C,e,ms=40000)=>{const t=Date.now();
  while(Date.now()-t<ms){ try{ if(await C.ev(e)) return 1; }catch{} await sleep(300); }
  throw new Error("timed out: "+e); };

try {
  const code = await makeHost(H, url, "HOSTCAP");
  say(`room ${code}`);
  await makeGuest(G, url, code, "GUESTCAP");
  await sleep(1500);
  await startVoyage(H);
  // both sides answer the Ahoy fork so the draft can arrive
  /* DRIVE BOTH WINDOWS IN LOCKSTEP, not one then the other — the Ahoy barrier waits for EVERY
     human seat, so answering the host's fork and then walking away to the guest leaves the host
     waiting on a guest nobody has answered for yet. The first version of this loop did exactly
     that and timed out on a barrier it was itself holding shut. */
  for (let i=0;i<40;i++){
    for (const [C,n] of [[H,"host"],[G,"guest"]]) {
      const txt = await C.ev(`(()=>{const p=document.getElementById('actionPanel');return p?p.textContent.replace(/\\s+/g,' ').trim().slice(0,70):''})()`);
      if (i % 6 === 0) {
        const btns = await C.ev(`JSON.stringify([...document.querySelectorAll('#actionPanel .apBtn')].map(b=>({t:b.textContent.trim().slice(0,22),vis:!!b.offsetParent})))`);
        say(`   [${i}] ${n}: ${JSON.stringify(txt)}  btns=${btns}`);
      }
      await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>x.offsetParent&&!x.querySelector('.recipeList')).filter(x=>!/back|←|‹/i.test(x.textContent))[0];if(b){b.click();return 1}return 0})()`);
    }
    await sleep(700);
    const hR = await H.ev(`!!document.querySelector('#actionPanel .recipeList')`);
    const gR = await G.ev(`!!document.querySelector('#actionPanel .recipeList')`);
    if (hR && gR) break;
  }
  await waitFor(H, `!!document.querySelector('#actionPanel .recipeList')`);
  await waitFor(G, `!!document.querySelector('#actionPanel .recipeList')`);
  await sleep(2500);

  const h = JSON.parse(await H.ev(ASK)), g = JSON.parse(await G.ev(ASK));
  say(`\n  HOST  cards=${h.cards} ask=${JSON.stringify(h.text)}  name=${JSON.stringify(h.who)} ${h.colour}`);
  say(`  GUEST cards=${g.cards} ask=${JSON.stringify(g.text)}  name=${JSON.stringify(g.who)} ${g.colour}`);

  const hOk = h.who === "HOSTCAP";
  const gOk = g.who === "GUESTCAP";
  if (!hOk) bad++;
  if (!gOk) bad++;
  say(`\n  host names the host  : ${hOk ? "PASS" : "FAIL — got " + JSON.stringify(h.who)}`);
  say(`  guest names the GUEST: ${gOk ? "PASS" : "FAIL — got " + JSON.stringify(g.who) + " (this is his bug)"}`);
  const diffColour = h.colour !== g.colour;
  say(`  the two boxes wear different captain colours: ${diffColour ? "PASS" : "FAIL — same colour on both"}`);
  if (!diffColour) bad++;

  say(`\n${bad === 0 ? "PASS — each device names its own captain" : "FAIL — " + bad + " problem(s)"}`);
  process.exitCode = bad === 0 ? 0 : 1;
} catch (e) {
  say("PROBE FAILED:", e.message);
  process.exitCode = 1;
} finally { killAll(); }
