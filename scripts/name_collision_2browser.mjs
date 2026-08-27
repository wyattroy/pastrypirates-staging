#!/usr/bin/env node
/* name_collision_2browser.mjs — item 16 / D-19, in two real browsers against a real Firebase room.
 *
 *   node scripts/name_collision_2browser.mjs [--port=N] [--dbgA=N] [--dbgB=N] [--out=DIR]
 *
 * WHY IT EXISTS. scripts/name_claim_check.js proves the RULE — pure, 43 assertions, red-proofed.
 * It cannot prove the two things a player actually experiences, and the plan says so outright:
 * neither the refusal nor the grant is visible in a screenshot of a normal join.
 *   1. Is the refusal an INLINE line under the box, with the tab still alive? A blocking alert()
 *      would look identical in a DOM dump and has already frozen a page mid-probe in this project.
 *   2. Does the bot ACTUALLY swap, on BOTH screens? The claim and the bot's rename ride in one
 *      Firebase transaction, and only a second client can show that both landed.
 *
 * IT NEVER STARTS A VOYAGE. Everything here happens in the lobby, before "Set sail?" — so
 * writeGameLog(), whose rows are permanent and unremovable by anyone including Wyatt, is never
 * reached. The room is deleted at the end.
 *
 * RED-PROOFED (HARD-WON-LESSONS §2 / DRIVING-THE-GAME §5e): every visibility claim forces the
 * known-negative first — the warning is asserted ABSENT before the colliding join, so "the warning
 * appeared" cannot be a warning that was already there.
 *
 * THE LIVENESS PROBE IS THE ALERT TEST, and that is the neat part: a blocking alert() suspends the
 * page's JS, so a CDP Runtime.evaluate against it never returns. Asking the page a trivial question
 * with a timeout, right after the refusal, distinguishes "inline warning" from "frozen tab" without
 * needing to detect the dialog at all.
 */
import path from "node:path";
import fs from "node:fs";
import { serve, launch, attach, makeHost, killAll, sleep, SHOTS } from "./mp_rig.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = +arg("port", 8781), DBG_A = +arg("dbgA", 9781), DBG_B = +arg("dbgB", 9782);
const OUT = path.resolve(arg("out", SHOTS));
fs.mkdirSync(OUT, { recursive: true });
const notes = [];
const log = (...a) => { const s = a.join(" "); console.log(s); notes.push(s); };

let fails = 0, n = 0;
const ok = (name, got, want) => {
  n++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const pass = g === w; if (!pass) fails++;
  log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(60)} got=${g} want=${w}`);
};

const HOST_NAME = "Bess";          // a HUMAN name -> the refusal case
const BOT_NAME = "Dough Hook";     // seat 2's captain default. NOT seat 1's: the guest CLAIMS seat 1,
                                   // and a seat cannot collide with itself, so colliding with seat 1's
                                   // own default would silently exercise nothing.
const SHOT = async (C, f) => { const r = await C.send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) { fs.writeFileSync(path.join(OUT, f), Buffer.from(r.result.data, "base64")); log(`    shot -> ${f}`); } };

/* the warning's state, read off the RENDERED element — never offsetParent (always null for a
   position:fixed element, and it has condemned a working screen in this project before) */
const WARN = `(() => {
  const el = document.getElementById('joinNameWarn');
  if (!el) return { mount:false };
  const r = el.getBoundingClientRect();
  return { mount:true, hidden: !!el.hidden, text: (el.textContent||'').trim(),
           painted: r.width > 10 && r.height > 4, redBox: (document.getElementById('joinName')||{className:''}).className.includes('nameWarned') };
})()`;
const SEATS = `(() => [...document.querySelectorAll('#seatList .seat .nm')].map(e => (e.textContent||'').trim()))()`;
const STATE = `(async()=>{ const st=(await import('/src/state/index.js')).appState;
  return { room: st.room||null, mySeat: st.mySeat, isHost: !!st.isHost }; })()`;

const url = serve(PORT);
launch(DBG_A, "/tmp/pp-name-host", { url: "about:blank" });
launch(DBG_B, "/tmp/pp-name-guest", { url: "about:blank" });
await sleep(1800);
const A = await attach(DBG_A), B = await attach(DBG_B);
let code = null;

try {
  log(`\nITEM 16 / D-19 — two browsers, one real room  (${url})\n`);

  code = await makeHost(A, url, HOST_NAME);
  log(`  host "${HOST_NAME}" created room ${code}`);
  await sleep(1500);
  ok("CONTROL: the host's lobby shows four seats", (await A.ev(SEATS)).length, 4);
  const seats0 = await A.ev(SEATS);
  log(`  host lobby before the guest: ${JSON.stringify(seats0)}`);
  ok("CONTROL: the host is seated under the name they typed", seats0[0].startsWith(HOST_NAME), true);
  ok(`CONTROL: a bot really is holding "${BOT_NAME}"`, seats0.some(s => s.startsWith(BOT_NAME)), true);

  /* ---- the guest reaches the JOIN screen ---- */
  await B.goto(url);
  await B.waitFor(`document.readyState==='complete'`, 30000, "guest load");
  await B.ev(`localStorage.clear();localStorage.setItem('pp_id','guest-'+Math.floor(Math.random()*1e9));true`);
  await B.goto(url);
  await B.waitFor(`document.readyState==='complete'`, 30000, "guest reload");
  await sleep(1400);
  await B.waitFor(`(()=>{const e=document.getElementById('choiceJoin');return !!(e&&e.offsetParent)})()`, 25000, "guest: Join a Crew");
  await B.ev(`document.getElementById('choiceJoin').click();true`);
  await sleep(1000);
  await B.ev(`document.getElementById('nameModalInput').value=${JSON.stringify(HOST_NAME)};
              document.getElementById('btnNameConfirm').click();true`);
  await sleep(1000);
  await B.waitFor(`(()=>{const j=document.getElementById('joinCode');return !!(j&&j.offsetParent)})()`, 25000, "guest: join form");

  /* ---- RED-PROOF: the known-negative, forced and confirmed, before the thing under test ---- */
  log("\n  -- CASE 1: the guest types a name the HOST already holds --");
  const before = await B.ev(WARN);
  ok("CONTROL: the warning has a mount in the markup", before.mount, true);
  ok("RED-PROOF: it is hidden before the colliding join", [before.hidden, before.painted], [true, false]);

  await B.ev(`document.getElementById('joinCode').value=${JSON.stringify(code)};
              document.getElementById('joinName').value=${JSON.stringify(HOST_NAME)};
              document.getElementById('btnJoin').click();true`);
  await sleep(3000);

  /* THE LIVENESS PROBE. If that click had raised a blocking alert() the page's JS would be
     suspended and this evaluate would never return — so reaching the next line at all is the
     evidence that the refusal did not freeze the tab. */
  const alive = await Promise.race([B.ev(`1+1`), sleep(8000).then(() => "FROZEN")]);
  ok("the tab is still alive after the refusal (no blocking alert)", alive, 2);

  const after = await B.ev(WARN);
  log(`  warning: ${JSON.stringify(after)}`);
  ok("the warning is now shown", [after.hidden, after.painted], [false, true]);
  ok("...it names the name that is spoken for", after.text.includes(HOST_NAME), true);
  ok("...it speaks pirate, inside the game world", /matey|Arrgh/.test(after.text), true);
  ok("...and the box itself is marked", after.redBox, true);
  const gs1 = await B.ev(STATE);
  ok("the guest did NOT get a seat", [gs1.room, gs1.mySeat], [null, null]);
  const hostSeats1 = await A.ev(SEATS);
  ok("and the HOST's lobby is unchanged — no second Bess", hostSeats1.filter(s => s.startsWith(HOST_NAME)).length, 1);
  await SHOT(B, "d-16-guest-refused-human-name.png");

  /* ---- CASE 2 ---- */
  log(`\n  -- CASE 2: the guest types "${BOT_NAME}", which a BOT holds --`);
  await B.ev(`const el=document.getElementById('joinName'); el.value=${JSON.stringify(BOT_NAME)};
              el.dispatchEvent(new Event('input',{bubbles:true})); true`);
  const cleared = await B.ev(WARN);
  ok("the warning clears as soon as the captain retypes", cleared.hidden, true);
  await B.ev(`document.getElementById('btnJoin').click();true`);
  await sleep(4000);

  const gs2 = await B.ev(STATE);
  ok("the guest IS let in", gs2.room, code);
  ok("...at a seat of their own", typeof gs2.mySeat === "number", true);
  const guestSeats = await B.ev(SEATS), hostSeats = await A.ev(SEATS);
  log(`  guest lobby: ${JSON.stringify(guestSeats)}`);
  log(`  host  lobby: ${JSON.stringify(hostSeats)}`);
  ok("...under the name they typed", guestSeats[gs2.mySeat].startsWith(BOT_NAME), true);
  ok("...and the HOST sees the same name at that seat", hostSeats[gs2.mySeat].startsWith(BOT_NAME), true);
  /* THE BOT SWAPPED. Counting is the honest test: exactly one captain at the table is called
     "Dough Hook", and it is the human. */
  ok(`exactly one captain is called "${BOT_NAME}" on the guest's screen`, guestSeats.filter(s => s.startsWith(BOT_NAME)).length, 1);
  ok(`exactly one captain is called "${BOT_NAME}" on the HOST's screen`, hostSeats.filter(s => s.startsWith(BOT_NAME)).length, 1);
  ok("...and that one is the human, not a bot", /bot/i.test(guestSeats[gs2.mySeat]), false);
  const bare = a => a.map(s => s.split("—")[0].trim());
  ok("no two captains share a name, guest side", bare(guestSeats).filter((x, i, v) => v.indexOf(x) !== i), []);
  ok("no two captains share a name, host side", bare(hostSeats).filter((x, i, v) => v.indexOf(x) !== i), []);
  ok("the two screens agree seat for seat (rule 23)", bare(guestSeats), bare(hostSeats));
  await SHOT(B, "d-16-guest-granted-bot-name.png");
  await SHOT(A, "d-16-host-sees-bot-swapped.png");

} catch (e) {
  fails++; log("ABORT: " + (e && e.message ? e.message : e));
} finally {
  /* DELETE THE ROOM. A probe that leaves live rooms behind is litter in a database Wyatt shares
     with real players (DRIVING-THE-GAME §3). */
  if (code) { try { await A.ev(`(async()=>{const st=(await import('/src/state/index.js')).appState;
      if(st.db) await st.db.ref('rooms/${code}').remove(); return 1;})()`); log(`\n  room ${code} deleted`); } catch (e) { log("  could not delete room: " + e.message); } }
  killAll();
}

fs.writeFileSync(path.join(OUT, "name-collision-log.txt"), notes.join("\n") + "\n");
log(`\n  ${n} assertion(s), ${fails} failure(s)`);
if (fails) { console.error("FAIL name_collision_2browser"); process.exit(1); }
console.log("PASS name_collision_2browser — refused for a human, granted over a bot, both screens agree");
process.exit(0);
