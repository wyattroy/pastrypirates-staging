/* ?pilot=new / vet / off — DOES THE FLAG ACTUALLY DO ANYTHING, IN A REAL BROWSER?
 *
 *   node scripts/qa/_pilot_url_flag_probe.mjs
 *
 * ⚠ A PROBE, NOT A GATE, and the underscore says so. It was in `npm test` and had to come out: it
 * drives six real game starts and was INTERMITTENT — pass, fail, and once a HANG (node exited 13,
 * "Detected unsettled top-level await"). A gate that sometimes hangs is worse than one that is red,
 * because the next reader takes the timeout for a machine problem and re-runs until it goes green.
 * The flag's LOGIC is gated deterministically instead, in pilot_gates.mjs §10. This stays as the
 * end-to-end check: run it by hand when you change the flag.
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

import fs from "node:fs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/* ⚠ UNIQUE PORTS PER PROCESS, and this is the SAME lesson as the profile directory one below —
   learned twice in one sitting because I fixed the symptom the first time.
   With a fixed debug port, attach() can find the PREVIOUS run's Chrome, still shutting down and
   still holding its old profile — a device that has already played. That produced a textbook
   alternation: fail, pass, fail, pass. Nothing about the game was involved.
   killAll() does not wait, so "wait for the port to free" is the version that races. Deriving the
   ports from the pid means a still-dying process cannot be found by a name it never had. */
const PORT = 8400 + (process.pid % 90), DBG = 9200 + (process.pid % 90);
const base = serve(PORT);
/* ⚠ A PROFILE NOBODY ELSE COULD HAVE TOUCHED, and this gate took three tries to get right.
   Chrome keeps localStorage in its profile directory, so "a device that has never played" is a
   property of that directory, not of the code. Two wrong answers before this one:
     v1 reused one fixed directory. It passed the first time and FAILED the second on identical
        code, because the second run inherited a device that had already played — a gate whose
        answer depends on whether anyone ran it before is not a gate.
     v2 deleted that directory at startup. STILL ALTERNATED pass/fail, and the reason is a race
        rather than a mistake: killAll() does not wait, so the PREVIOUS run's dying Chrome flushes
        its storage back into the directory AFTER the next run has deleted it.
   v3 removes the race instead of trying to win it: a unique directory per process. Nothing that is
   still shutting down can contaminate a path it has never heard of. Old ones are swept at the end
   so the tree does not fill up with them. */
const PROFILE = path.join(REPO, `.tmp-pilot-flag-${process.pid}-${Date.now()}`);
for (const d of fs.readdirSync(REPO)) {
  if (!d.startsWith(".tmp-pilot-flag")) continue;
  try { fs.rmSync(path.join(REPO, d), { recursive: true, force: true }); } catch {}
}
launch(DBG, PROFILE);
const C0 = await attach(DBG);
/* EVERY CDP CALL GETS A DEADLINE, and this is the fix for the hang rather than a precaution.
   attach()'s send() resolves its promise when a reply arrives with a matching id. If the page
   navigates (or the tab dies) while a call is in flight, THE REPLY NEVER ARRIVES and that promise
   is unsettled for the life of the process — which is exactly what "unsettled top-level await at
   line 78" was. A lost reply is now a rejection, so the probe fails in a readable way instead of
   sitting there looking like a slow machine. */
const C = Object.assign(Object.create(C0), {
  ev: (expr) => Promise.race([
    C0.ev(expr),
    new Promise((_, rej) => setTimeout(() => rej(new Error("CDP eval timed out (reply lost, most likely across a navigation): " + String(expr).slice(0, 60))), 15000)),
  ]),
});
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
  if (wipe) {
    /* CLEARED, THEN CHECKED. localStorage.clear() on the wrong origin returns quietly and does
       nothing, which is exactly how this probe once tested a device that had already played and
       reported the GAME broken. Assert the key is really gone; if it is not, the probe says so
       instead of producing a confident wrong answer. */
    await C.ev(`localStorage.clear()`);
    const left = await C.ev(`(()=>{try{return localStorage.getItem('pp4_pilot')}catch(e){return 'THREW'}})()`);
    if (left !== null) throw new Error("localStorage.clear() did not take (pp4_pilot still " + left + ") — the probe is on the wrong origin, not the game misbehaving");
  }
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
    /* CONFIRMED, NOT ASSUMED. The click was followed by a flat 600ms sleep, so a tap that missed
       left `met` false — and the NEXT case ("a device that has played is not asked again") then
       failed for the probe's own reason while the game was behaving perfectly. That is the
       intermittency, and it is the same fault class as the sea trial's: a step whose success is
       inferred from the clock. */
    if (!await waitFor(`!/know how to play/i.test((document.getElementById('actionPanel')||{}).textContent||'')`, 6000))
      throw new Error("the fork was clicked and did not close — the probe cannot trust anything after this");
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
  // leave nothing behind — the next run must start from a device that has never played
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
console.log(`\n${fails ? "FAILED" : "PASSED"} — ${fails} failing check(s)`);
process.exit(fails ? 1 : 0);
