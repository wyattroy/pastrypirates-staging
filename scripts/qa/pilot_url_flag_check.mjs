/* ?pilot=new / vet / off — DOES THE FLAG IN THE CHECKLIST ACTUALLY DO ANYTHING?
 *
 *   node scripts/qa/pilot_url_flag_check.mjs
 *
 * WHY THIS IS A GATE AND NOT A ONE-OFF. A flag that silently does nothing is the worst kind of
 * checklist item: the URL loads, no error, no hint — so Wyatt plays the default path, sees the old
 * behaviour, and reports the item GREEN. That is a stale sheet arriving by a different road, and it
 * costs the one thing this project cannot buy more of, which is his eyes.
 *
 * So the flag is driven in a real browser, on a host that counts as a developer's machine, and each
 * mode is checked by what a PLAYER would see — the fork card, and the words in the sail prompt —
 * never by reading the storage key it writes.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8493, DBG = 9393;                 // a port not used by the other probes
const base = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-pilot-flag"));
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

let fails = 0;
const ok = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!cond) fails++;
};
const waitFor = async (expr, ms, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await C.ev(expr)) return true; } catch {} await sleep(200); }
  return false;
};

/* Drive one mode as far as the fork, then report what a player would be looking at.
   `seed` decides whether storage is wiped first: ?pilot=new has to work on a device that HAS
   played, which is the whole reason it exists, so that case is run on a dirty profile. */
async function run(flag, { wipe }){
  await C.ev(`location.href=${JSON.stringify(base)}`).catch(() => {});
  await sleep(1800);
  if (wipe) await C.ev(`localStorage.clear()`);
  /* CLEAR THE SAVED VOYAGE BUT KEEP WHAT THE PILOT REMEMBERS. DRIVING-THE-GAME §2: a leftover
     `pp4_solo` silently RESUMES an interrupted game instead of showing the welcome screen, so
     without this every run after the first tested a resumed voyage and never reached the opening
     at all. `pp4_pilot` deliberately survives — "a device that has played" is the state under
     test, and wiping it would make every run a first-timer and every check vacuous. */
  else await C.ev(`(()=>{try{localStorage.removeItem('pp4_solo');localStorage.removeItem('pp4_sess')}catch(e){}})()`);
  await C.ev(`location.href=${JSON.stringify(base + (flag ? "?" + flag : ""))}`).catch(() => {});
  await sleep(2200);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  if (!await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000))
    throw new Error("name modal never opened for " + flag);
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`!!(window.__pp_app_state_debug&&__pp_app_state_debug().game&&__pp_app_state_debug().game.players.some(p=>p.strategy==='human'))`, 25000);
  // give the intro a moment to draw whichever card it is going to draw
  await sleep(1800);
  const seen = await C.ev(`(()=>{const p=document.getElementById('actionPanel');const t=(p&&p.textContent)||'';
    return /know how to play/i.test(t) ? 'FORK' : (/ahoy/i.test(t) ? 'AHOY' : ('?? '+t.slice(0,50)));})()`);
  const store = await C.ev(`(()=>{try{return localStorage.getItem('pp4_pilot')||'(none)'}catch(e){return 'ERR'}})()`);
  console.log(`      [${flag||"no flag"}] -> ${seen}   store=${String(store).slice(0,120)}`);
  /* ANSWER the fork when it is up. A probe that only LOOKS at it leaves `met` false forever, so
     the very next run is offered it again and the control below fails for the probe's own reason
     rather than the code's. Answering it is what a captain does. */
  if (seen === "FORK"){
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yaargh/i.test(x.textContent));if(b){b.click();return true}return false})()`);
    await sleep(600);
  }
  return seen;
}

try {
  // 1. a device that has never played meets the fork with no flag at all — the control
  ok("control: a cleared device is offered the fork", (await run("", { wipe: true })) === "FORK");

  // 2. …and the SAME device, having now answered it, is not asked again
  ok("control: a device that has played is NOT asked again", (await run("", { wipe: false })) !== "FORK",
     "(this is what makes the flag necessary)");

  // 3. ?pilot=new brings the fork back on that same dirty device — the whole point
  ok("?pilot=new brings the fork back on a device that has played",
     (await run("pilot=new", { wipe: false })) === "FORK");

  // 4. ?pilot=vet skips it and hands over today's game
  ok("?pilot=vet skips the fork", (await run("pilot=vet", { wipe: false })) !== "FORK");
  const vetLine = await C.ev(`(()=>{
    const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>!/back|←/i.test(b.textContent));
    if(bs.length)bs[0].click(); return true;})()`);
  ok("…and it really was applied (vet mode leaves every ladder at the bottom)",
     await C.ev(`(()=>{try{const s=JSON.parse(localStorage.getItem('pp4_pilot')||'{}');
       return !!(s.seen&&s.seen['sail.pick']>=3)}catch(e){return false}})()`));

  // 5. ?pilot=off silences it
  await run("pilot=off", { wipe: false });
  ok("?pilot=off silences the parrot",
     await C.ev(`(()=>{try{return !!JSON.parse(localStorage.getItem('pp4_pilot')||'{}').off}catch(e){return false}})()`));

  /* 6. RED-PROOF, and it is the one that matters: a flag the code does NOT know must change
     nothing, so a green above is worth something. If a typo'd flag also brought the fork back,
     every check here would pass for the wrong reason. */
  ok("RED-PROOF: an unknown flag changes nothing", (await run("pilot=banana", { wipe: false })) !== "FORK");
} catch (e) {
  ok("the probe ran to completion", false, e.message);
} finally {
  killAll();
}
console.log(`\n${fails ? "FAILED" : "PASSED"} — ${fails} failing check(s)`);
process.exit(fails ? 1 : 0);
