/* T-01 — "In play solo, hitting enter closes the modal and dumps you back to the home screen."
 * (Wyatt, 2026-08-26 playtest of 2026-08-25g. Pass-and-play and crew are fine.)
 *
 * RED-PROOFED BY CONSTRUCTION: the same run drives BOTH routes into the same modal —
 * a REAL Enter key over the debugger, and a click on the confirm button. If the two agree,
 * this probe has not measured the reported fault and says so instead of passing.
 *
 * The key is Input.dispatchKeyEvent, NOT a synthetic KeyboardEvent: a dispatched event cannot
 * trigger the browser's own implicit-submission behaviour, so a synthetic one would clear a bug
 * that only a real keypress can cause.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8493, DBG = 9351;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-t01");
const C = await attach(DBG);

async function freshSolo(tag) {
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','${tag}-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await sleep(1200);
  await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${tag}: Play Solo visible`);
  await C.ev(`document.getElementById('choiceSolo').click();true`);
  await sleep(900);
  await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${tag}: name modal`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
}

/* what screen are we actually on? named by what a player would see, not by a flag */
const WHERE = `JSON.stringify((()=>{
  const vis = id => { const e=document.getElementById(id); if(!e) return false;
    const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
    return r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden' && s.opacity!=='0'; };
  return {
    nameModal : vis('nameModal'),
    homeCards : vis('choiceSolo'),
    board     : vis('boardwrap'),
    ribbon    : vis('pp4Ribbon'),
  };
})())`;

const results = {};
for (const route of ["enter", "button"]) {
  await freshSolo(route);
  const before = JSON.parse(await C.ev(WHERE));
  if (route === "enter") {
    await C.ev(`document.getElementById('nameModalInput').focus();true`);
    for (const type of ["keyDown", "char", "keyUp"])
      await C.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter",
        windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
  } else {
    await C.ev(`document.getElementById('btnNameConfirm').click();true`);
  }
  await sleep(2600);
  results[route] = { before, after: JSON.parse(await C.ev(WHERE)) };
  await C.shot(`t01-${route}.png`);
}

const started = r => r.after.board && !r.after.nameModal;
const dumpedHome = r => r.after.homeCards && !r.after.nameModal && !r.after.board;

console.log("\n=== T-01: solo, name modal ===");
for (const [route, r] of Object.entries(results))
  console.log(`  ${route.padEnd(7)} -> ${JSON.stringify(r.after)}  ${started(r) ? "GAME STARTED" : dumpedHome(r) ? "DUMPED TO HOME" : "neither"}`);

let verdict;
if (dumpedHome(results.enter) && started(results.button)) verdict = "REPRODUCED — Enter dumps home, the button starts the game";
else if (started(results.enter) && started(results.button)) verdict = "NOT REPRODUCED — both routes start the game";
else verdict = "INCONCLUSIVE — neither route behaved as either expectation";
console.log("\n  VERDICT: " + verdict + "\n");

killAll();
process.exit(verdict.startsWith("REPRODUCED") ? 1 : 0);
