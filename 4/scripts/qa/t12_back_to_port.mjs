/* T-12 — "They are successfully brought back to port (the homepage) BUT there is a bug -- the
 * homepage looks crazy."  His screenshot: the welcome card floating over a LIVE game — the DAY 4
 * ribbon, the captains box, and a "wy2: tap to sail" bubble all still painted behind it.
 *
 * WHAT IT MEASURES: start a real solo voyage so the whole stage layer is built, then go back to
 * port, then ask the browser what is STILL PAINTED. Every element checked lives on document.body,
 * outside #game — which is the entire reason hiding #game never hid them.
 *
 * RED-PROOFED: it asserts the stage IS visible during the game first. If the elements were never
 * on screen to begin with, the "gone afterwards" result would be meaningless and the run says so.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8515, DBG = 9375;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-t12");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t12-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "Play Solo");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';document.getElementById('btnNameConfirm').click();true`);
  await sleep(2000);
}
// play a few beats so the ribbon, captains box and a narration bubble are all real
for (let i = 0; i < 14; i++) {
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn:not([disabled]), .recipeCard, #flipCoinWrap.active')]
    .filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1});
    const m=[...document.querySelectorAll('#actionPanel .apMsg:not(.fadeOut)')][0];
    if(m&&!(m.innerText||'').trim())return false;
    if(b.length){b[0].click();return true}return false})()`);
  await sleep(700);
}

const PAINTED = `JSON.stringify((()=>{
  const vis=id=>{const e=document.getElementById(id); if(!e)return false;
    const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';};
  const ids=["pp4Ribbon","pp4Pill","pp4Cap","pp4Col","pp4ChatSheet","pp4Prompt","pp4Fx","pp4Veil","pp4Stamp"];
  return {painted: ids.filter(vis),
          bodyStage: document.body.classList.contains('pp4Stage'),
          gameHidden: getComputedStyle(document.getElementById('game')).display==='none',
          homeUp: vis('choiceSolo')};
})())`;

const during = JSON.parse(await C.ev(PAINTED));
await C.shot("t12-during-game.png");

/* back to port, by the route the code itself uses */
await C.ev(`(async()=>{const m=await import('./src/ui/lobby.js');m.showHome();return true})()`);
await sleep(1200);
const after = JSON.parse(await C.ev(PAINTED));
await C.shot("t12-back-at-port.png");

console.log("\n=== T-12 — what is still painted after going back to port? ===");
console.log("  during the game : " + JSON.stringify(during.painted) + "   body.pp4Stage=" + during.bodyStage);
console.log("  back at port    : " + JSON.stringify(after.painted) + "   body.pp4Stage=" + after.bodyStage);
console.log("  #game hidden    : " + after.gameHidden + "   home buttons up: " + after.homeUp);
console.log("");
if (!during.painted.length) console.log("  INCONCLUSIVE — the stage was never on screen, so 'gone afterwards' proves nothing.");
else if (after.painted.length) console.log("  FAIL — still painted over the homepage: " + after.painted.join(", "));
else console.log("  PASS — the stage layer is gone; the homepage stands on its own.");
console.log("");
killAll();
process.exit(during.painted.length && !after.painted.length ? 0 : 1);
