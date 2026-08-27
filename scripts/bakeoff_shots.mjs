#!/usr/bin/env node
/* bakeoff_shots.mjs — item 6's instrument: play a REAL bake-off to the end of the attempt, then
 * watch what is left on the screen.
 *
 *   node scripts/bakeoff_shots.mjs --out=DIR --port=N --dbg=N [--size=WxH] [--mobile]
 *                                    [--root=DIR] [--tag=NAME]
 *
 * WHY IT EXISTS. D-16 says the Bake-Off card does not come back once you have attempted your bake,
 * "so simultaneous bake-offs are visible". Whether it comes back is a question about what is DRAWN
 * a few seconds after a decision resolves — which is precisely the class docs/HARD-WON-LESSONS.md
 * warns no `*_check.js` in this tree can see: every one of them asks whether a renderer FUNCTION
 * ran, never what was on the glass afterwards. So this plays the minigame and takes the picture.
 *
 * IT DOES NOT POSE THE BAKE-OFF. `?ovens=1` is the game's OWN shipped playtest shortcut
 * (src/shared/index.js) — it fills each human hold and lights the ovens on day one, draws no random
 * numbers, and says on screen that it is a test game. That is a supported entry point, not an
 * injection, so the bake-off that runs here is the real one with the real engine behind it.
 *
 * THE ONE MEASUREMENT THAT MATTERS is `bkoAfter`: is a `.bko` shell still on screen N ms after the
 * attempt resolved, and does it come back later? Read off the rendered rect via elementFromPoint,
 * never off `offsetParent` — that reads null for every position:fixed element and has already
 * condemned a working screen once in this project (02.1 Wave 4).
 *
 * Hygiene: headless, --mute-audio, its own ports, bounded loops, kills what it starts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPO, gameURL } from "./lib/chrome.mjs";
import { openChrome, sleep } from "./lib/cdp.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = k => process.argv.includes(`--${k}`);
const OUT = path.resolve(arg("out", "/tmp/bakeoff-shots"));
const PORT = +arg("port", 8771), DBG = +arg("dbg", 9771);
const [W, H] = arg("size", "390x844").split("x").map(Number);
const MOBILE = has("mobile");
const ROOT = path.resolve(arg("root", REPO));
/* --pnp boots PASS-AND-PLAY with two human captains instead of solo (04-01 Task 2). It is the
   third mode, it has no room at all, and a two-tab crew test cannot see it by construction — so
   every change to the bake's decision seam has to be shown here too. Two humans also means the
   pass-the-device handoff (passGate) fires BETWEEN the two bakes, which is the one thing in
   bakeoffPrompt that has to stay ahead of the local/remote fork. Solo stays the default, so the
   existing invocation is byte-identical in behaviour. */
const PNP = has("pnp");
const TAG = arg("tag", `${W}x${H}`);
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(" "); console.log(s); fs.appendFileSync(path.join(OUT, "log.txt"), s + "\n"); };

// THE CHROME PROFILE GOES TO tmpdir, NEVER TO --out. It used to be written under the shots
// directory, and 1,468 files of Chrome profile went into a commit alongside twelve screenshots
// (04-01). --out is a directory a human reads; nothing that is not evidence belongs in it.
const c = await openChrome({ W, H, dbgPort: DBG, httpPort: PORT, serveRoot: ROOT,
  profileDir: fs.mkdtempSync(path.join(os.tmpdir(), `bakeoff-shots-${TAG}-`)), mobile: MOBILE });
const out = { tag: TAG, W, H, mobile: MOBILE };
async function finish(code) {
  fs.writeFileSync(path.join(OUT, `result-${TAG}.json`), JSON.stringify(out, null, 2));
  try { c.close(); } catch {}
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`, { stdio: "ignore" }); } catch {}
  try { execSync(`pkill -f "http.server ${PORT}"`, { stdio: "ignore" }); } catch {}
  process.exit(code);
}
const die = async (msg) => { log("ABORT: " + msg); out.aborted = msg; await finish(1); };
process.on("SIGINT", () => finish(1));
const shot = n => c.shot(path.join(OUT, `${TAG}-${n}.png`));
const ev = e => c.ev(e);

/* the on-screen gate — the same predicate group_f_shots.mjs and the layout gate use. Re-armed
   after every navigation, because a navigate wipes the window it was written on. */
const armGate = () => ev(`window.__gate = (el) => {
  if (!el) return {ok:false, why:'no element'};
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return {ok:false, why:'zero size'};
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return {ok:false, why:'outside viewport'};
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return {ok:false, why:'occluded by '+(hit?(hit.id||hit.className||hit.tagName):'nothing')};
  return {ok:true, x:cx, y:cy};
};`);
async function clickSel(sel, filter = "() => true") {
  const probe = `(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${filter});
     for (const el of els) { const g = __gate(el); if (g.ok) return {ok:true,x:g.x,y:g.y,txt:(el.textContent||'').trim().slice(0,24)}; }
     return {ok:false, n:els.length, why: els.length ? __gate(els[0]).why : 'none'}; })()`;
  let g = await ev(probe);
  if (g && g.ok) { await c.clickXY(g.x, g.y); return g.txt || "?"; }
  if (g && g.n && /outside viewport/.test(g.why || "")) {
    await ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${filter});
       if (els[0]) els[0].scrollIntoView({block:'center'}); return 1; })()`);
    await sleep(400);
    g = await ev(probe);
    if (g && g.ok) { await c.clickXY(g.x, g.y); return g.txt || "?"; }
  }
  return null;
}

/* IS THE BAKE-OFF SHELL ACTUALLY ON THE GLASS? Not `offsetParent` (null for every position:fixed
   element, so it condemns working screens), not `querySelector` alone (present is not visible).
   The rendered rect, plus a hit test at its own centre. */
const BKO_VISIBLE = `(() => {
  const el = document.querySelector('#actionPanel .bko');
  if (!el) return { present:false, visible:false };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const big = r.width > 20 && r.height > 20;
  const hit = big ? document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + Math.min(r.height/2, innerHeight - r.top - 4))) : null;
  return { present:true, visible: big && cs.visibility !== 'hidden' && +cs.opacity > 0.05,
           w:+r.width.toFixed(1), h:+r.height.toFixed(1), t:+r.top.toFixed(1), opacity:+cs.opacity,
           hitIsBko: !!(hit && (hit === el || el.contains(hit))),
           stage: !!document.getElementById('actionPanel').dataset.pp4Stage,
           hint: (document.getElementById('bkoHint')||{}).textContent || '' };
})()`;

log(`\n=== ${TAG} ${MOBILE ? "(touch)" : ""} — booting a ${PNP ? "PASS-AND-PLAY" : "solo"} voyage at ?ovens=1 ===`);
out.mode = PNP ? "pass-and-play" : "solo";
await c.nav(gameURL(PORT)); await sleep(2000);
await ev("localStorage.clear(); 1");
await c.nav(`${gameURL(PORT)}?ovens=1`); await sleep(2500);
await armGate();
if (!await clickSel(PNP ? "#choicePassPlay" : "#choiceSolo")) await die(`${PNP ? "pass&play" : "solo"} card not clickable`);
await sleep(900);
{
  const ni = await ev("(()=>{const el=document.getElementById('nameModalInput'); if(!el) return null; const g=__gate(el); return g.ok?g:null;})()");
  if (ni) { // triple-click first: the field is PRE-FILLED and insertText appends (group_f_shots.mjs)
    await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: ni.x, y: ni.y, button: "left", clickCount: 3 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ni.x, y: ni.y, button: "left", clickCount: 3 });
    await c.type("Wyatt");
  }
}
if (!await clickSel("#btnNameConfirm")) await die("name confirm not clickable");
if (PNP) {
  await sleep(900);
  await ev(`(()=>{const v=["Wyatt","Juju","",""];for(let i=0;i<4;i++){const el=document.getElementById('ppName'+i);if(el)el.value=v[i]||'';}return 1})()`);
  if (!await clickSel("#btnStartPassPlay")) await die("pass&play start not clickable");
  await sleep(1200);
}
{ // a game with a HUMAN seat — never merely "a game exists" (§3's attract-board trap)
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { await sleep(500);
    ok = await ev(`(async()=>{try{if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;}
      const g=window.appState.game; const hs=g?g.players.filter(p=>p.strategy==='human').length:0;
      return !!(g&&hs>=${PNP ? 2 : 1}&&document.getElementById('pp4Ribbon'));}catch(e){return false}})()`);
  }
  if (!ok) await die(PNP ? "no two-human pass-and-play game inside 30s" : "no human solo game inside 30s");
}
await ev(`(async()=>{ window.__B = { st:(await import('/src/state/index.js')).appState }; return 1; })()`);

/* clear the recipe draft and the opening ceremony (§3c: a recipe card takes TWO taps) */
for (let i = 0; i < 30; i++) {
  const n = await ev("[...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b=>b.getBoundingClientRect().width>4).length");
  const staged = await ev("!!document.getElementById('actionPanel').dataset.pp4Stage || !!document.querySelector('#pp4Prompt .recipeList')");
  const bko = await ev("!!document.querySelector('#actionPanel .bko, #bkoIntroGo')");
  if (bko) break;
  if (!staged && n === 0) break;
  if (!await clickSel("#pp4Prompt .recipeCard, #pp4Prompt .bkoCard")) {
    if (!await clickSel("#pp4Prompt .apBtn", "b => !/back|←|‹/i.test(b.textContent)")) await sleep(500);
  }
  await sleep(650);
}
log("booted; ovens should be lit for every captain on day one.");
out.ovens = await ev(`(()=>{const g=window.__B.st.game; return g.players.map(p=>({n:p.name, baking:!!p.baking, done:!!p.done, human:p.strategy==='human'}));})()`);
log("ovens: " + JSON.stringify(out.ovens));

/* ---- the intro card ----
   THE WINDOW IS SIZED FROM THE THING BEING WAITED ON (HARD-WON-LESSONS §4: "a probe that times out
   is not evidence of absence"). A captain who is baking takes no ordinary turn, so day one still
   has to run three bot turns — each with its own sail animation and narration hold — before the
   end-of-day bake loop is reached. Measured at ~15s a bot turn on this rig, so 150s, not 30s.
   The first version of this file waited 30s and reported "the intro card never appeared", which
   read exactly like a broken feature and was a short window. */
{
  let seen = false;
  for (let i = 0; i < 150 && !seen; i++) {
    seen = await ev("!!document.getElementById('bkoIntroGo')");
    if (seen) break;
    // a storm or a hand-off can put a live prompt in the way of the day ending; clear it
    if (await ev("!!document.querySelector('#pp4Prompt .apBtn, #actionPanel .apBtn')"))
      await clickSel("#pp4Prompt .apBtn, #actionPanel .apBtn", "b => !/back|←|‹/i.test(b.textContent)");
    await sleep(1000);
  }
  if (!seen) await die("the bake-off intro card never appeared inside 150s; day state: " +
    JSON.stringify(await ev("(()=>{const g=window.__B.st.game; return {round:g.round, players:g.players.map(p=>({baking:!!p.baking,done:!!p.done}))};})()")));
  /* VISIBLE, NOT MERELY PRESENT. panel.js holds the whole prompt hidden until the camera and every
     ship have stopped moving (D-20), so #bkoIntroGo is in the DOM for seconds before it is drawn.
     The first run of this file clicked on its existence and reported "not clickable" with a
     screenshot showing an empty board — the element was real and the picture was honest. */
  let drawn = false;
  for (let i = 0; i < 60 && !drawn; i++) {
    drawn = await ev("(()=>{const b=document.getElementById('bkoIntroGo'); return !!(b&&b.getBoundingClientRect().width>10);})()");
    if (!drawn) await sleep(600);
  }
  if (!drawn) await die("the intro card was in the DOM but never drawn inside 36s");
  await sleep(1400);
  out.introShot = await shot("01-intro-card");
  log("shot 01 — the 'ovens be roarin'' intro card");
  if (!await clickSel("#bkoIntroGo")) await die("Get bakin'! not clickable");
}

/* ---- study, then start the shuffle ---- */
{
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    ready = await ev("(()=>{const b=document.getElementById('bkoGo'); return !!(b&&!b.disabled&&/ready/i.test(b.textContent));})()");
    if (!ready) await sleep(500);
  }
  if (!ready) await die("'Ready to bake!' never became live");
  out.benchShot = await shot("02-bench-study");
  log("shot 02 — the bench, in the study phase");
  if (!await clickSel("#bkoGo")) await die("Ready to bake! not clickable");
}

/* ---- the shuffle runs, then the bench takes taps ---- */
{
  let armed = false;
  for (let i = 0; i < 60 && !armed; i++) {
    armed = await ev("(()=>{const b=document.getElementById('bkoGo'); return !!(b&&/bake it/i.test(b.textContent));})()");
    if (!armed) await sleep(700);
  }
  if (!armed) await die("the bench never became answerable ('Bake it!' never appeared)");
  await sleep(600);
  out.armedShot = await shot("03-bench-answerable");
  log("shot 03 — the bench, answerable");

  /* Tap every open crate, in bowl order. We are not trying to WIN — a wrong answer is the more
     interesting case for item 6, because it is the one where the captain bakes again tomorrow. */
  const open = await ev(`[...document.querySelectorAll('#actionPanel .bkoBowl')].map((b,i)=>({i, locked:b.classList.contains('locked')})).filter(b=>!b.locked).map(b=>b.i)`);
  log("open crates: " + JSON.stringify(open));
  for (const i of open) {
    const g = await ev(`(()=>{const b=document.querySelectorAll('#actionPanel .bkoBowl')[${i}]; return b?__gate(b):null;})()`);
    if (g && g.ok) { await c.clickXY(g.x, g.y); await sleep(320); }
    else log(`crate ${i} not clickable: ${g && g.why}`);
  }
  await sleep(400);
  const can = await ev("(()=>{const b=document.getElementById('bkoGo'); return !!(b&&!b.disabled);})()");
  if (!can) await die("'Bake it!' stayed disabled after tapping every open crate");
  out.guessShot = await shot("04-guess-entered");
  log("shot 04 — every crate named");
  if (!await clickSel("#bkoGo")) await die("Bake it! not clickable");
}

/* ---- THE MEASUREMENT. What is on screen after the attempt resolves? ---- */
out.after = [];
{
  await sleep(900);
  out.revealShot = await shot("05-reveal-running");
  log("shot 05 — the reveal, mid-run: " + JSON.stringify(await ev(BKO_VISIBLE)));
  /* Sample for 24s at 1.5s intervals — long enough to cover the whole reveal (5 x 520ms), the
     1300ms verdict hold, the post-bake narration, and the three bot bakes that follow. A window
     sized from the thing being waited on, not a guess (HARD-WON-LESSONS §4). */
  for (let k = 0; k < 16; k++) {
    await sleep(1500);
    const v = await ev(BKO_VISIBLE);
    const narr = await ev(`(()=>{const e=document.querySelector('#actionPanel .apMsg')||document.querySelector('.narrBub'); return e?(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,70):'';})()`);
    out.after.push({ tMs: 900 + (k + 1) * 1500, ...v, narr });
    log(`  +${((900 + (k + 1) * 1500) / 1000).toFixed(1)}s  bko=${v.present ? (v.visible ? "VISIBLE h" + v.h : "present-but-hidden") : "gone"}  stage=${v.stage}  narr="${narr}"`);
    if (k === 1) { out.afterShot = await shot("06-just-after-attempt"); log("shot 06 — just after the attempt resolved"); }
    if (k === 5) { out.laterShot = await shot("07-two-beats-later"); log("shot 07 — two beats later"); }
  }
  out.finalShot = await shot("08-end-of-window");
}

/* the verdict, stated as a fact rather than a feeling */
const everGone = out.after.some(s => !s.present);
const backAfterGone = (() => { let gone = false; for (const s of out.after) { if (!s.present) gone = true; else if (gone && s.visible) return true; } return false; })();
out.verdict = { everGone, backAfterGone,
  stillUpAt4s: !!(out.after[1] && out.after[1].visible),
  stillUpAt10s: !!(out.after[5] && out.after[5].visible) };
log("\nVERDICT: " + JSON.stringify(out.verdict));
log(`  the shell left the screen at some point: ${everGone}`);
log(`  the shell CAME BACK after leaving:       ${backAfterGone}`);
log(`  still up ~4s after the attempt:          ${out.verdict.stillUpAt4s}`);
log(`  still up ~10s after the attempt:         ${out.verdict.stillUpAt10s}`);
out.consoleErrs = c.consoleErrs.slice(0, 10);
if (out.consoleErrs.length) log("console: " + JSON.stringify(out.consoleErrs));
await finish(0);
