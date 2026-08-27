/* T-02 IN TWO REAL WINDOWS — "The guest cannot 'stay put'."
 *
 * A real host and a real guest, two independent Chromes, one real Firebase room. The claim is about
 * what a GUEST SEES, so it is measured on the guest's own screen and nowhere else.
 *
 * PASS REQUIRES BOTH HALVES: a yellow stay square (.pp4StayCell) at the guest's own boat, AND that
 * tapping it reveals the Stay put button (#apStay). A square that unlocks nothing would be a
 * cosmetic pass over a real failure.
 *
 * RED-PROOFED: it reads `pos` off the guest's own received prompt. Absent `pos`, the fix's input
 * never arrived, so the run reports INCONCLUSIVE rather than condemning the renderer.
 */
import { serve, launch, attach, makeHost, makeGuest, driver, killAll, sleep, log } from "../mp_rig.mjs";
import { startCrewVoyage, advanceUntil } from "./lib/advance.mjs";

const PORT = 8509, DBG_H = 9367, DBG_G = 9368;
const url = serve(PORT);
launch(DBG_H, "/tmp/chrome-qa-sp-h");
launch(DBG_G, "/tmp/chrome-qa-sp-g");
const H = await attach(DBG_H), G = await attach(DBG_G);

log("• hosting…");
const code = await makeHost(H, url, "Host");
log("• room " + code + " — joining…");
await makeGuest(G, url, code, "Guest");
await sleep(2500);
await startCrewVoyage(H, sleep);

const READ = `JSON.stringify((()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const stay=[...document.querySelectorAll('.pp4StayCell')];
  const cells=[...document.querySelectorAll('.sailCell')];
  const p=(window.appState&&window.appState.currentPrompt)||null;
  return {asked:cells.length>0, sailCells:cells.length, stayCells:stay.length,
          stayVisible:stay.some(vis), posOnPrompt:!!(p&&p.pos),
          wind:(document.getElementById('pp4Pill')||{}).innerText||null};
})())`;

/* THE HOST IS DRIVEN BY THE RIG'S OWN DRIVER, NOT BY MINE. My advancer clicked the first live
   button it found, which parked the host inside the trade flow re-clicking "Trade" forever — 12
   identical lines and an INCONCLUSIVE. DRIVING-THE-GAME §5b's driver already carries the three
   fixes that stop precisely this (liveness filter, prefer the committing circle, rotate on repeated
   failure), and mp_rig exports it. Writing a second one was the mistake this whole list is about.
   The advancer keeps only the job the driver does not do: walking the GUEST through the intro. */
await driver(H, url);

const found = await advanceUntil(
  [["guest", G]],
  async (C, name) => {
    if (name !== "guest") return null;
    const s = JSON.parse(await C.ev(READ));
    return s.asked ? s : null;
  },
  sleep, { steps: 90, log, watch: ["guest"] });

await G.shot("crew-guest-sail.png");
await H.shot("crew-host-sail.png");

console.log("\n=== T-02 — can a GUEST stay put?  (room " + code + ") ===");
if (!found) { console.log("  the guest was never asked to sail — INCONCLUSIVE, nothing asserted\n"); killAll(); process.exit(2); }

const s = found.hit;
let unlocked = null;
if (s.stayCells > 0) {
  unlocked = await G.ev(`(()=>{const c=document.querySelector('.pp4StayCell');
    if(!c)return false; c.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const b=document.getElementById('apStay');
    return !!(b&&getComputedStyle(b).display!=='none');})()`);
  await G.shot("crew-guest-stayput.png");
}

console.log("  guest asked to sail : yes (" + s.sailCells + " sail squares)");
console.log("  stay square present : " + s.stayCells + "   visible: " + s.stayVisible);
console.log("  `pos` on its prompt : " + s.posOnPrompt);
console.log("  tapping it reveals Stay put: " + unlocked);
console.log("  guest's wind pill   : " + JSON.stringify(s.wind));

let verdict;
if (!s.posOnPrompt) verdict = "INCONCLUSIVE — the guest's prompt carried no `pos`; the fix's input never arrived";
else if (s.stayCells > 0 && unlocked) verdict = "PASS — the guest has a stay square and it unlocks Stay put";
else if (s.stayCells > 0) verdict = "PARTIAL — square drawn, but tapping it did not reveal Stay put";
else verdict = "FAIL — still no stay square on the guest";
console.log("\n  " + verdict + "\n");
killAll();
process.exit(verdict.startsWith("PASS") ? 0 : 1);
