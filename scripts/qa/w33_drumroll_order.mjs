/* W3-3 — DOES THE DRUMROLL COME BEFORE THE WINNER IS NAMED, OR AFTER?
 *
 *   node scripts/qa/w33_drumroll_order.mjs
 *
 * WYATT, 2026-08-27, from a solo voyage: "The drumroll fires AFTER the narration that names the
 * winner. It should come first." He found it on a TWO-CAPTAIN TIE broken by crates and coins —
 * which matters, because that is the branch with two or more finishers, not the single-winner one.
 *
 * IT IS AN ORDERING QUESTION, so rule 26 applies in its favour: one posed ending answers it
 * completely and no amount of sampling would answer it better. `?endcard=1` already exists for
 * exactly this (src/orchestrator.js's skipToEndCard) and it deliberately draws NO card of its own —
 * it poses the state the ending reads and lets the real ending run, so what is watched here is what
 * a player gets.
 *
 * WHAT IT RECORDS: every change to the narration line and to the gold End of Voyage banner, with a
 * timestamp, from inside the page. Then it prints the sequence and says which came first.
 *
 * IT CAN FAIL HONESTLY: no drumroll seen, or no winner named, and it says NOT RUN rather than
 * reporting an order it never observed.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import path from "node:path";
import os from "node:os";

const PORT = 8526, DBG = 9428;
const url = serve(PORT);
// A hardcoded "/tmp/..." profile path is a Linux-container-era assumption: on Windows Chrome gets
// handed an invalid --user-data-dir, fails to start its DevTools listener, and exits silently
// (spawn() runs with stdio "ignore" in mp_rig.launch()) -- so attach() just times out with the
// uninformative "no chrome on <port>", which reads exactly like an environment problem rather than
// a bad path. os.tmpdir() resolves to the real temp directory on every platform this runs on.
launch(DBG, path.join(os.tmpdir(), "chrome-w33"));
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

const WATCH = `(()=>{
  if(window.__w33)return "already";
  window.__w33={log:[],lastN:null,lastB:null};
  const S=window.__w33;
  const txt=el=>((el&&el.textContent)||"").replace(/\\s+/g," ").trim();
  const tick=()=>{
    const bub=document.querySelector(".pp4Bub");
    const msg=document.querySelector("#actionPanel .apMsg")||document.getElementById("actionPanel");
    const n=(txt(bub)||txt(msg)).slice(0,70);
    /* the gold banner is what actually announces the win — showStats() renders it. */
    const st=document.getElementById("statsWrap");
    const shown=st&&getComputedStyle(st).display!=="none"&&st.getBoundingClientRect().height>4;
    const b=shown?txt(st).slice(0,70):"";
    if(n!==S.lastN){S.lastN=n; if(n)S.log.push({t:Math.round(performance.now()),what:"NARRATION",text:n});}
    if(b!==S.lastB){S.lastB=b; if(b)S.log.push({t:Math.round(performance.now()),what:"GOLD BANNER",text:b});}
    if(S.log.length<300)requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "watching";})()`;

console.log("W3-3 — the drumroll and the winner, in the order a player sees them.\n");
await C.ev(`location.href=${JSON.stringify(url + "?endcard=1")}`);
await sleep(2500);
await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`); await sleep(2500);
console.log("  endcard shortcut armed:", await C.ev(`location.search`));
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);
console.log("  watcher:", await C.ev(WATCH));

const { DRIVER_SRC } = await import("../mp_rig.mjs");
await sleep(1500);
await C.ev(DRIVER_SRC(url));
console.log("  driving to the ending...\n");
/* BOUNDED — rule 17. The shortcut lands on the ending within a couple of days of play. */
for (let i = 0; i < 150; i++) {
  const done = await C.ev(`(()=>{const l=window.__w33?window.__w33.log:[];return l.some(r=>/drumroll/i.test(r.text))&&l.some(r=>r.what==="GOLD BANNER")})()`);
  if (done === true) break;
  await sleep(2000);
}
const log = JSON.parse(await C.ev(`JSON.stringify(window.__w33?window.__w33.log:[])`));
/* WHICH BRANCH ACTUALLY RAN. His report is about a TWO-CAPTAIN TIE — the two-or-more-finishers
   path that emits a `collab` event — and a clean result from the SINGLE-winner path would prove
   nothing about it. Read off the engine's own event stream rather than inferred from the banner. */
/* THE ACCESSOR THIS REPO ACTUALLY EXPOSES. CEO Review 28: this read `window.appState`, which is
   assigned NOWHERE in src/ — so it could never succeed, on any run, on any branch. That is not bad
   luck that happened to strike three runs out of four; it is a read that was always going to
   throw. The real surface is `window.__pp_app_state_debug()` (src/main.js:142), named there as "a
   permanent, named, read-only observation surface", and this repo's own rig already uses it
   (scripts/mp_rig.mjs:244). I had a working example in the tree and did not look. */
const branch = await C.ev(`(()=>{try{
  const st=(typeof __pp_app_state_debug==="function")?__pp_app_state_debug():null;
  if(!st||!st.game) return "unreachable";
  const appState=st;
  const evs=(appState.game&&appState.game.events)||[];
  const c=evs.filter(e=>e&&e.t==="collab");
  const end=evs.filter(e=>e&&e.t==="end");
  const ps=(appState.game.players||[]).map(p=>({seat:p.idx, bot:p.strategy!=="human",
    recipe:(p.recipe&&p.recipe.length)||0, ing:(p.ing&&p.ing.length)||0, done:!!p.done,
    hasChoices:!!(p.recipeChoices&&p.recipeChoices.length)}));
  return JSON.stringify({collab:c.length, finishers:c.length?(c[0].finishers||[]).length:0, end:end.length,
    finishOrder:(appState.game.finishOrder||[]).slice(), players:ps});
}catch(e){return "unreachable"}})()`);
killAll();
console.log(`  branch: ${branch}`);

if (!log.length) { console.log("=== NOT RUN — nothing was recorded at all."); process.exit(1); }
console.log("  the sequence, one line per change:");
log.slice(-14).forEach(r => console.log(`    ${String(r.t).padStart(7)}ms  ${r.what.padEnd(12)} ${r.text}`));

const drum = log.find(r => /drumroll/i.test(r.text));
const banner = log.find(r => r.what === "GOLD BANNER");
/* A narration line that NAMES a captain and lands before the drumroll is the fault he reported. */
const namesWinner = log.find(r => r.what === "NARRATION" && /wins|best baker|takes the|crowned/i.test(r.text));
console.log("");
if (!drum) { console.log("=== NOT RUN — no drumroll was seen, so the order was never observed."); process.exit(1); }
if (!banner && !namesWinner) { console.log("=== NOT RUN — the winner was never announced, so there is no order to compare."); process.exit(1); }
const winnerAt = Math.min(banner ? banner.t : Infinity, namesWinner ? namesWinner.t : Infinity);
console.log(`  drumroll at ${drum.t}ms`);
console.log(`  winner first named at ${winnerAt}ms${namesWinner && namesWinner.t === winnerAt ? ` (narration: "${namesWinner.text}")` : " (the gold banner)"}`);
const ok = drum.t < winnerAt;
/* A PASS THAT NEVER REACHED THE SUBJECT IS NOT A PASS. The first cut of this printed PASS while
   its own branch check said the collab path had not run — the exact fault this repo has spent a
   week naming. The branch is now part of the verdict, not a note printed beside it. */
let br = null; try { br = JSON.parse(branch); } catch {}
/* "I READ NOTHING" AND "THE BRANCH DID NOT RUN" MUST NEVER PRINT THE SAME SENTENCE — CEO Review 28,
   and it is the whole reason a false claim reached the ledger. The old code took `!br` (the read
   failed) down the same path as `collab === 0` (a real finding), so a probe that had learned
   nothing announced "the COLLAB branch never ran". */
if (!br) {
  console.log(`\n=== NOT RUN — the branch could not be read at all (__pp_app_state_debug unreachable).`);
  console.log(`    This says nothing about which path ran. It is a broken instrument, not a finding.`);
  process.exit(1);
}
if (br.collab === 0) {
  console.log(`\n=== NOT RUN — the COLLAB branch never ran: this was the single-winner path, and his`);
  console.log(`    report is about a TWO-CAPTAIN TIE. The order above is real and it is correct, but`);
  console.log(`    it does not test what he reported. ?endcard=1's own note says every captain must`);
  console.log(`    finish, "because with one finisher the ending takes its single-winner branch and`);
  console.log(`    never emits collab — and the ranked finishers and the drumroll are exactly what`);
  console.log(`    W3-3 is about". It produced ${br ? br.finishers : "?"} finisher(s).`);
  if (br && br.players) {
    console.log(`\n    WHY — every captain at the end, read off the engine:`);
    br.players.forEach(p => console.log(`      seat ${p.seat} ${p.bot ? "bot  " : "human"}  recipe ${p.recipe}  crates ${p.ing}  done ${p.done}  had choices ${p.hasChoices}`));
    console.log(`      finishOrder: [${(br.finishOrder || []).join(", ")}]`);
    console.log(`    skipToEndCard skips any captain with no recipe (\`if(!p.recipe||!p.recipe.length)continue\`),`);
    console.log(`    so a captain who has none is never marked done and never reaches the collab branch.`);
  }
  process.exit(1);
}
console.log(`  ✓ the collab branch ran, with ${br.finishers} finishers — this IS the path his report names.`);
console.log(ok
  ? `\n=== PASS — the drumroll comes ${winnerAt - drum.t}ms BEFORE the winner is named. Suspense in the right order.`
  : `\n=== FAIL — the winner is named ${drum.t - winnerAt}ms BEFORE the drumroll. That is exactly what he reported.`);
process.exit(ok ? 0 : 1);
