/* THE BAKE-OFF SURFACE GATE — verifies T-25 and T-30 on the rendered card, and stands as the
 * regression check for every later bake-off item on Wyatt's list.
 *
 * Reads what is DRAWN, not what the source says. Rule 19: the checks that blessed a broken build
 * were honest and were measuring game state; a screenshot and a computed style see what he sees.
 *
 * Solo + ?ovens=1 fills the human hold at the draft, so the ovens light at the end of day one.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = Number(process.env.QA_PORT || 8503), DBG = Number(process.env.QA_DBG || 9361);
const W = Number(process.env.QA_WIDTH || 390), H = Number(process.env.QA_HEIGHT || 844);
const base = serve(PORT);
launch(DBG, `/tmp/chrome-qa-bko-${PORT}`);
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });

const url = base + "?ovens=1";
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','bko-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "Play Solo");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';document.getElementById('btnNameConfirm').click();true`);
  await sleep(1500);
}

const READ = `JSON.stringify((()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const hd=[...document.querySelectorAll('.bkoHd')].find(vis);
  const watch=document.getElementById('bkoWatch');
  const go=document.getElementById('bkoGo');
  /* T-09: who is drawn as the active captain while the bench is up? The row highlight and the
     header ring both come from ONE derivation in board.js, so reading the row is enough. */
  const rows=[...document.querySelectorAll('[id^=prow]')];
  const lit=rows.filter(r=>r.classList.contains('activeTurn')).map(r=>(r.innerText||'').split(String.fromCharCode(10))[0].trim());
  return {
    onBench: !!hd,
    activeRows: lit,
    title: hd?(hd.innerText||'').replace(/attempt.*$/s,'').trim():null,
    watch: watch?{hidden:watch.hidden, vis:vis(watch), animation:getComputedStyle(watch).animationName}:null,
    go: go?{label:(go.innerText||'').trim(), animation:getComputedStyle(go).animationName}:null,
  };
})())`;

let seen = null;
for (let i = 0; i < 200; i++) {                                  // bounded
  const s = JSON.parse(await C.ev(READ));
  if (s.onBench && s.title) { seen = s; break; }
  // advance: tap whatever is live, but never a blank card (T-15 taught this)
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn:not([disabled]), #actionPanel .btlBtn:not([disabled]), #flipCoinWrap.active, .recipeCard')]
    .filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1});
    if(b.length){b[0].click();return true}return false})()`);
  await sleep(650);
}

console.log("\n=== BAKE-OFF SURFACE (" + W + "x" + H + ") ===");
if (!seen) { console.log("  bench never reached — inconclusive, nothing asserted\n"); killAll(); process.exit(2); }
await C.shot("bakeoff-surface.png");
console.log("  title drawn : " + JSON.stringify(seen.title));
console.log("  Watch again : " + JSON.stringify(seen.watch));
console.log("  Bake button : " + JSON.stringify(seen.go));

const t25 = seen.title && /Yer Bake-Off|'s Bake-Off/.test(seen.title);
const t30 = !seen.watch || seen.watch.animation === "none";
console.log("");
const baker = (seen.title || "").split(",")[0].split("'")[0].trim();
const t09 = seen.activeRows.length === 1 && seen.activeRows[0] === baker;
console.log("  active captain drawn : " + JSON.stringify(seen.activeRows) + "   (baker is " + JSON.stringify(baker) + ")");
console.log("  T-09 (baker is lit)      : " + (t09 ? "PASS" : "FAIL — " + (seen.activeRows.length ? "lit: " + seen.activeRows.join(",") : "nobody lit")));
console.log("  T-25 (titled by captain) : " + (t25 ? "PASS — " + seen.title : "FAIL — still " + seen.title));
console.log("  T-30 (Watch again quiet) : " + (t30 ? "PASS — animation none" : "FAIL — runs " + seen.watch.animation));
console.log("");
killAll();
process.exit(t25 && t30 ? 0 : 1);
