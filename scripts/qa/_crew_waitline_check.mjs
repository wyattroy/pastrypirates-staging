/* IS "WAITING FOR YER MATEYS" STILL UP WHILE THE HOST IS BEING ASKED TO PICK A RECIPE?
 *   node scripts/qa/_crew_waitline_check.mjs
 *
 * Wyatt, playtest 2026-09-10, item 14.1: "'waiting for yer mateys' appears ONLY on host, while both
 * host and guest are picking recipes. expectation: this does not appear UNTIL host is actually
 * waiting for guest to decide."
 *
 * ⚠ A LOCAL TEST CANNOT SEE THIS. The line is born when one human answers a barrier and another has
 * not; solo and pass-and-play never show it at all (nobody is waiting for anybody). Same lesson the
 * crew-name probe was written for.
 *
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8730 + (process.pid % 40);
const DH = 9730 + (process.pid % 40), DG = 9870 + (process.pid % 40);
const url = serve(PORT);
launch(DH, path.join(REPO, `.tmp-wlH-${process.pid}`));
launch(DG, path.join(REPO, `.tmp-wlG-${process.pid}`));
const H = await attach(DH), G = await attach(DG);
const say = console.log;
let bad = 0;
const waitFor = async (C,e,ms=45000)=>{const t=Date.now();
  while(Date.now()-t<ms){ try{ if(await C.ev(e)) return 1; }catch{} await sleep(300); }
  throw new Error("timed out: "+e); };
/* The wait line is a NARRATION bubble, a different surface from the picker sheet — which is the
   whole reason it could sit on top of it. Look for its words anywhere visible. */
const WAITING = `(()=>{const t=(document.body.innerText||'');
  return /Waiting for yer mateys|Waiting for the rest of the crew/i.test(t);})()`;
const PICKING = `!!document.querySelector('#actionPanel .recipeList')`;

try {
  const code = await makeHost(H, url, "HOSTCAP");
  say(`room ${code}`);
  await makeGuest(G, url, code, "GUESTCAP");
  await sleep(1500);
  await startVoyage(H);

  /* THE HOST ANSWERS THE AHOY BARRIER FIRST AND THE GUEST DELIBERATELY DOES NOT — that gap is the
     bug's whole setting, and a lockstep loop would close it before it could be seen. */
  await waitFor(H, `(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C_click(H);
  await sleep(2500);
  const hostWaitingBefore = await H.ev(WAITING);
  say(`  host answered, guest has not — wait line up on host? ${hostWaitingBefore}   (expected: true, that is correct here)`);

  // now the guest answers, both go to the draft
  await waitFor(G, `(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C_click(G);

  await waitFor(H, PICKING); await waitFor(G, PICKING);
  await sleep(4200);   // let the picker's own arrival settle before judging what is on screen

  const hostWaiting = await H.ev(WAITING), guestWaiting = await G.ev(WAITING);
  const hostPicking = await H.ev(PICKING), guestPicking = await G.ev(PICKING);
  say(`\n  HOST : picking=${hostPicking}  wait line still up=${hostWaiting}`);
  say(`  GUEST: picking=${guestPicking}  wait line still up=${guestWaiting}`);

  const check=(n,ok,d="")=>{ say(`  ${ok?"PASS":"FAIL"}  ${n}${ok?"":" — "+d}`); if(!ok)bad++; };
  check("the wait line DOES appear while the host waits on the guest", hostWaitingBefore===true,
        "it never showed, so this probe is not exercising the thing it names");
  check("it is GONE once the host is the one being asked (his 14.1)", hostWaiting===false,
        "still telling the host to wait for his mateys while asking HIM to choose");
  check("and gone on the guest too", guestWaiting===false);
  say(bad ? `\n${bad} FAILURE(S)` : `\nALL CLEAR`);
} catch (e) { say("PROBE FAILED: " + (e && e.message || e)); bad++; }
finally { await killAll(); }

/* one click of whatever the barrier is offering — "Nah" first, because "Yarrgh!" turns the tutorial
   OFF and a probe that disables the feature then reports it missing is a documented mistake here */
async function C_click(C){
  await C.ev(`(()=>{const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(x=>x.offsetParent&&!x.querySelector('.recipeList'));
    const p=bs.find(x=>/nah/i.test(x.textContent))||bs.find(x=>!/back|←|‹/i.test(x.textContent));
    if(p){p.click();return 1}return 0})()`);
}
process.exit(bad ? 1 : 0);
