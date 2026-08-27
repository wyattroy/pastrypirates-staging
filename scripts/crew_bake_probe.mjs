#!/usr/bin/env node
/* crew_bake_probe.mjs — THE BAKE-OFF, IN A REAL TWO-BROWSER CREW ROOM.
 *
 *   node scripts/crew_bake_probe.mjs --out=DIR [--spectate] [--drop-mid-bake]
 *                                      [--port=N] [--dbg=N] [--dbg2=N]
 *
 * WHY IT EXISTS. On 2026-08-22 four real crew rooms established that the HOST bakes its own recipe
 * and that the GUEST watches nothing (02.2-CONTEXT.md, "THE CREW BAKE-OFF, MEASURED"). One thing
 * that method could not reach: what happens at a GUEST's bake — is it played on the host's screen,
 * or forfeited? The driver could not finish a face-down memory game reliably enough to advance the
 * sequence that far, and that is a limit of the instrument, not a finding about the game.
 *
 * So this probe finishes the memory game. It lifts bakeoff_shots.mjs:205-216's approach — tap every
 * open crate in bowl order and DO NOT try to win; a wrong answer is the more useful outcome anyway,
 * because it is the one where the captain bakes again tomorrow.
 *
 * HOW IT KNOWS WHOSE BENCH IS ON SCREEN, and this is the whole measurement. `.bkoCard` renders one
 * icon per recipe step drawn from the bake's own `order`, so the ingredient sequence on a bench
 * matches EXACTLY ONE seat's `bake.order`. Reading it back and matching it against every seat's
 * order names the baker without inferring anything. That is why an absence here is reportable: the
 * same read reports the host's OWN bench correctly one step earlier (the red-proof below).
 *
 * RED-PROOF, BEFORE ANY ABSENCE IS BELIEVED (HARD-WON-LESSONS §2). The probe reports on the host's
 * own bake first, where a bench is known to exist. A check that has never been seen succeed cannot
 * be trusted when it fails. Visibility is the PAINTED RECTANGLE plus a hit test — never
 * `offsetParent`, which is null for every position:fixed element and has condemned a working
 * screen in this project before.
 *
 * `?ovens=1` is the game's OWN shipped shortcut (shared/index.js) — a URL flag, not state
 * injection, and legal in multiplayer (measured 2026-08-22: it crosses the wire, both humans'
 * holds stocked, the TEST GAME banner drawn on both screens).
 *
 * Hygiene (rule 17): headless, --mute-audio, its own ports, every loop bounded, the room deleted
 * and every process killed on every exit path including a throw.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = k => process.argv.includes(`--${k}`);

const OUT = path.resolve(arg("out", "/tmp/crew-bake-probe"));
/* mp_rig.mjs reads $MP_RIG_SHOTS at MODULE-EVAL time, so the env has to be set before the import
   is evaluated — a static import would have run first and every screenshot would have landed in
   ./mp-rig-shots instead of --out, silently. Hence the dynamic import. */
fs.mkdirSync(OUT, { recursive: true });
process.env.MP_RIG_SHOTS = OUT;
const { serve, launch, attach, makeHost, makeGuest, killAll, sleep } = await import("./mp_rig.mjs");
const PORT = +arg("port", 8811), DBG = +arg("dbg", 9811), DBG2 = +arg("dbg2", 9812);
const SPECTATE = has("spectate");
const DROP = has("drop-mid-bake");
const LOGF = path.join(OUT, "log.txt");
try { fs.unlinkSync(LOGF); } catch {}
const log = (...a) => { const s = a.join(" "); console.log(s); fs.appendFileSync(LOGF, s + "\n"); };

const out = { mode: SPECTATE ? "spectate" : DROP ? "drop-mid-bake" : "measure", startedAt: new Date().toISOString(), steps: [] };
let H = null, G = null, room = null, guestAlive = true;

/* ---------- the report, run identically on host and guest ---------- */
/* ONE expression, evaluated on both clients at the same moment. Everything it reports is read off
   what is RENDERED — the rect, the hit test, the DOM's own text — except the seat/room fields,
   which come from the debug hook. Nothing here is computed by arithmetic of mine (§2). */
const BENCH_REPORT = `JSON.stringify((()=>{
  const vis=el=>{ if(!el)return null; const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
    const big=r.width>20&&r.height>20;
    const hit=big?document.elementFromPoint(Math.round(r.left+r.width/2),
      Math.round(r.top+Math.min(r.height/2,innerHeight-r.top-4))):null;
    return {w:Math.round(r.width),h:Math.round(r.height),t:Math.round(r.top),
            opacity:+cs.opacity, visible:big&&cs.visibility!=='hidden'&&+cs.opacity>0.05,
            hitIsSelf:!!(hit&&(hit===el||el.contains(hit)||hit.contains(el)))}; };
  const st=(()=>{try{return __pp_app_state_debug()}catch(e){return{}}})();
  const g=st.game||{};
  const shell=document.querySelector('#actionPanel .bko');
  const base=s=>String(s||'').split('/').pop().split('?')[0];
  const cardIngs=[...document.querySelectorAll('#actionPanel .bkoCard img')].map(i=>base(i.getAttribute('src')));
  const benchIngs=[...document.querySelectorAll('#actionPanel .bkoBowl .bkoIng')].map(i=>base(i.getAttribute('src')));
  const bowls=[...document.querySelectorAll('#actionPanel .bkoBowl')];
  return {
    seat:st.mySeat, isHost:!!st.isHost, room:st.room||null,
    round:g.round, events:(g.events||[]).length,
    /* WHOSE BENCH: the icon sequence on the recipe card, matched against every seat's bake.order.
       Reported as raw filenames too, so a failed match can be read rather than guessed at. */
    cardIngs, benchIngs,
    bowlCount:bowls.length,
    lockedCount:bowls.filter(b=>b.classList.contains('locked')).length,
    shell: shell?vis(shell):null,
    shellPresent: !!shell,
    stage: !!document.getElementById('actionPanel').dataset.pp4Stage,
    hint:(document.getElementById('bkoHint')||{}).textContent||null,
    goBtn:(()=>{const b=document.getElementById('bkoGo');return b?{txt:(b.textContent||'').trim(),disabled:!!b.disabled}:null})(),
    watchBtn:(()=>{const b=document.getElementById('bkoWatch');return b?{txt:(b.textContent||'').trim(),hidden:!!b.hidden,disabled:!!b.disabled}:null})(),
    introGo: !!document.getElementById('bkoIntroGo'),
    watching: !!document.querySelector('#actionPanel .bko.bkoWatching'),
    badges:[...document.querySelectorAll('#actionPanel .bkoBowl')].map(b=>({
      n:(b.querySelector('.bkoNum')||{}).textContent||'',
      picked:b.classList.contains('picked'),locked:b.classList.contains('locked'),
      covered:b.classList.contains('covered'),
      right:b.classList.contains('right'),wrong:b.classList.contains('wrong')})),
    apMsg:(()=>{const e=document.querySelector('#actionPanel .apMsg');return e?(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,110):null})(),
    apBtns:[...document.querySelectorAll('#actionPanel .apBtn')].map(b=>(b.textContent||'').trim().slice(0,24)),
    narr:(()=>{const e=document.querySelector('.narrBub,#pp4Narr');return e?(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,110):null})(),
    coins:(g.players||[]).map(p=>p&&p.coins),
    names:(g.players||[]).map(p=>p&&p.name),
    /* Every seat's recipe order as ICON FILENAMES, so the comparison above is like-for-like and
       needs no reverse map maintained in the probe. Only the host's copy is authoritative. */
    orders:(g.players||[]).map(p=>{
      const o=(p&&p.bake&&p.bake.order)||(p&&p.recipe)||null;
      if(!o)return null;
      const imgs=window.__cbING||{};
      return o.map(k=>base(imgs[k]||k));
    }),
    bakeState:(g.players||[]).map(p=>p&&p.bake?{attempts:p.bake.attempts,solved:!!p.bake.solved,
      locked:(p.bake.locked||[]).filter(Boolean).length}:null),
    baking:(g.players||[]).map(p=>!!(p&&p.baking)),
    dlogN:st.dlogN, dlogLen:(st.dlog||[]).length
  };})())`;

async function report(C) { try { return JSON.parse(await C.ev(BENCH_REPORT)); } catch (e) { return { __err: String(e).slice(0, 160) }; } }

/* ING_IMG hung on the window once per client, so `orders` above can render filenames without the
   probe keeping its own copy of a map the game already owns (HARD-WON-LESSONS §3: prefer reading a
   real value to typing a literal). */
async function armIngMap(C, base) {
  await C.ev(`(async()=>{try{const m=await import('${base}src/shared/index.js');window.__cbING=m.ING_IMG;return 1}catch(e){return 0}})()`);
}

/* WHOSE BENCH IS THIS? — pure matching over what the two reads returned, stated as data. */
/* `orders` is only AUTHORITATIVE ON THE HOST. A guest renders from broadcast state and has no
   players[].bake at all, so its own copy falls back to p.recipe — the ingredient SET, not the step
   ORDER — and matches nothing. Measured, not guessed: the t2 run reported NO SEAT MATCHES for a
   bench that was plainly correct. So the match is always made against the host's orders. */
function whoseBench(r, hostOrders) {
  if (!r || !r.cardIngs || !r.cardIngs.length) return null;
  const orders = hostOrders && hostOrders.length ? hostOrders : r.orders;
  if (!orders) return null;
  const key = r.cardIngs.join("|");
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] && orders[i].join("|") === key) return i;
  }
  return -1;   // a bench is drawn and matches NO seat's order — that would itself be a finding
}

async function pair(name, note) {
  const h = await report(H);
  const g = guestAlive ? await report(G) : { __closed: true };
  await H.shot(`${name}-host.png`);
  if (guestAlive) await G.shot(`${name}-guest.png`);
  const row = { name, note: note || "", at: Date.now(), host: h, guest: g,
    hostBench: whoseBench(h, h.orders), guestBench: guestAlive ? whoseBench(g, h.orders) : null };
  out.steps.push(row);
  log(`\n--- ${name} ${note ? "(" + note + ")" : ""}`);
  log(`    HOST  bench=${h.shellPresent ? (h.shell && h.shell.visible ? "VISIBLE " + h.shell.w + "x" + h.shell.h : "present-but-not-painted") : "none"}` +
      `  bowls=${h.bowlCount}  ${h.watching ? "WATCHING" : h.goBtn ? "BAKING" : ""}  whose=${fmtWhose(row.hostBench, h)}  hint="${(h.hint || "").slice(0, 52)}"`);
  log(`          apMsg="${(h.apMsg || "").slice(0, 70)}"  btns=${JSON.stringify((h.apBtns || []).slice(0, 4))}`);
  if (guestAlive) {
    log(`    GUEST bench=${g.shellPresent ? (g.shell && g.shell.visible ? "VISIBLE " + g.shell.w + "x" + g.shell.h : "present-but-not-painted") : "none"}` +
        `  bowls=${g.bowlCount}  ${g.watching ? "WATCHING" : g.goBtn ? "BAKING" : ""}  whose=${fmtWhose(row.guestBench, g)}  hint="${(g.hint || "").slice(0, 52)}"`);
    log(`          apMsg="${(g.apMsg || "").slice(0, 70)}"  btns=${JSON.stringify((g.apBtns || []).slice(0, 4))}`);
  } else log(`    GUEST (tab closed)`);
  return row;
}
function fmtWhose(w, r) {
  if (w == null) return "n/a";
  if (w < 0) return "NO SEAT MATCHES(!)";
  return `seat ${w} (${(r.names && r.names[w]) || "?"})`;
}

/* ---------- driving ---------- */
/* One tick of "answer whatever is on screen", DRIVING-THE-GAME.md §5b priority order, with the
   bake-off's own controls ahead of the generic buttons because #bkoGo IS an .apBtn and a blind
   first-live-button driver would press "Ready to bake!" before the bench had been looked at. */
const TICK = `(()=>{
  const coin=document.getElementById('flipCoinWrap');
  if(coin&&coin.classList.contains('active')&&coin.onclick){coin.onclick();return 'FLIP';}
  const card=[...document.querySelectorAll('#pp4Prompt .recipeCard,#actionPanel .recipeCard')]
    .filter(c=>c.getBoundingClientRect().width>10);
  if(card.length){card[0].click();return 'RECIPE';}
  const bake=document.querySelector('#actionPanel .bko');
  if(bake)return 'BAKE-ON-SCREEN';
  const intro=document.getElementById('bkoIntroGo');
  if(intro)return 'BAKE-INTRO';
  const btl=[...document.querySelectorAll('.btlBtn')].filter(b=>b.getBoundingClientRect().width>4);
  if(btl.length){btl[0].click();return 'BTL';}
  const cells=[...document.querySelectorAll('.sailCell')];
  if(cells.length){cells[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));return 'SAIL';}
  const btns=[...document.querySelectorAll('#actionPanel .apBtn,#pp4Prompt .apBtn')]
    .filter(b=>!/back|←|‹/i.test(b.textContent))
    .filter(b=>b.getAttribute('aria-disabled')!=='true'&&b.disabled!==true)
    .filter(b=>b.getBoundingClientRect().width>4);
  if(!btns.length)return null;
  const pool=btns.filter(b=>!/anchor/i.test(b.textContent));
  const pick=(pool.length?pool:btns)[0];
  const t=(pick.textContent||'').trim().slice(0,20);
  pick.click();return t;
})()`;

/* Play the bench that is on THIS client, start to finish, without trying to win. Returns a trace. */
async function playBench(C, tag, { buyRewatch = false } = {}) {
  const tr = { tag, steps: [] };
  // 1. the intro card, if this is the first attempt
  for (let i = 0; i < 40; i++) {
    if (await C.ev(`(()=>{const b=document.getElementById('bkoIntroGo');return !!(b&&b.getBoundingClientRect().width>10)})()`)) {
      await C.ev(`document.getElementById('bkoIntroGo').click();true`); tr.steps.push("intro"); break;
    }
    if (await C.ev(`!!document.querySelector('#actionPanel .bko')`)) break;
    await sleep(500);
  }
  // 2. Ready to bake!
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    ready = await C.ev(`(()=>{const b=document.getElementById('bkoGo');return !!(b&&!b.disabled&&/ready/i.test(b.textContent))})()`);
    if (!ready) await sleep(500);
  }
  if (!ready) { tr.fail = "'Ready to bake!' never became live"; return tr; }
  await C.ev(`document.getElementById('bkoGo').click();true`); tr.steps.push("ready");
  // 3. wait for the bench to become answerable (the shuffle has run)
  let armed = false;
  for (let i = 0; i < 80 && !armed; i++) {
    armed = await C.ev(`(()=>{const b=document.getElementById('bkoGo');return !!(b&&/bake it/i.test(b.textContent))})()`);
    if (!armed) await sleep(700);
  }
  if (!armed) { tr.fail = "the bench never became answerable ('Bake it!' never appeared)"; return tr; }
  tr.steps.push("armed");
  await sleep(500);
  // 3b. MP-06: buy one re-watch and record the purse either side of it
  if (buyRewatch) {
    const before = await C.ev(`(()=>{const b=document.getElementById('bkoWatch');return b?{hidden:!!b.hidden,disabled:!!b.disabled}:null})()`);
    tr.watchBtn = before;
    if (before && !before.hidden && !before.disabled) {
      // On the BAKER's own screen, what matters is the DRAWN purse — the guest's engine copy is a
      // stale render shell (DRIVING-THE-GAME §5c), so p.coins there would answer a different
      // question than "did the number on his screen go down".
      tr.purseBefore = await C.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.players||[]).map((_,i)=>{const e=document.getElementById('coins'+i);return e?+e.dataset.coins:null})})()`);
      await C.ev(`document.getElementById('bkoWatch').click();true`);
      await sleep(700);
      tr.purseJustAfter = await C.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.players||[]).map((_,i)=>{const e=document.getElementById('coins'+i);return e?+e.dataset.coins:null})})()`);
      tr.coinRowJustAfter = await C.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.players||[]).map((_,i)=>{const e=document.getElementById('coins'+i);return e?+e.dataset.coins:null})})()`);
      tr.steps.push("rewatch-bought");
      /* THE REPLAY IS ~7.4s LONG AND THE BENCH REFUSES TAPS THROUGHOUT IT — 900ms settle, a
         five-crate cover sweep at 280ms each, then three swaps at 1000ms plus a 700ms pause. The
         first version of this wait was a condition that was ALREADY TRUE, so it fell straight
         through, tapped into the animation ("a tap now means nothing"), and reported "'Bake it!'
         stayed disabled" as though the game were broken. It was the probe.
         The honest signal is the re-watch button coming back off `disabled`, which the
         choreography only does after it sets replaying=false. */
      let back = false;
      for (let i = 0; i < 40 && !back; i++) {
        await sleep(700);
        back = await C.ev(`(()=>{const w=document.getElementById('bkoWatch');return !!(w&&!w.hidden&&!w.disabled)})()`);
      }
      tr.replayEnded = back;
      await sleep(900);
      tr.purseAfterReplay = await C.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.players||[]).map((_,i)=>{const e=document.getElementById('coins'+i);return e?+e.dataset.coins:null})})()`);
    } else tr.steps.push("rewatch-unavailable");
  }
  // 4. tap every open crate in bowl order — NOT trying to win (bakeoff_shots.mjs:205)
  const open = await C.ev(`[...document.querySelectorAll('#actionPanel .bkoBowl')].map((b,i)=>({i,locked:b.classList.contains('locked')})).filter(b=>!b.locked).map(b=>b.i)`);
  tr.openCrates = open;
  for (const i of open || []) {
    await C.ev(`(()=>{const b=document.querySelectorAll('#actionPanel .bkoBowl')[${i}];if(b)b.click();return 1})()`);
    await sleep(280);
  }
  const can = await C.ev(`(()=>{const b=document.getElementById('bkoGo');return !!(b&&!b.disabled)})()`);
  if (!can) { tr.fail = "'Bake it!' stayed disabled after tapping every open crate"; return tr; }
  tr.steps.push("guess-entered");
  return tr;
}
async function commitBench(C, tr) {
  await C.ev(`document.getElementById('bkoGo').click();true`);
  tr.steps.push("committed");
  return tr;
}

const BAKE_SURFACE = `!!document.querySelector('#actionPanel .bko')||!!document.getElementById('bkoIntroGo')`;
/* A BENCH IS NOT THE SAME THING AS A BAKER. Since 04-01 Task 3 every captain has a bench on screen
   during a bake — the baker's takes taps and a watcher's does not — so "who is holding a bench" no
   longer says who to drive. The controls are the tell: only the baker's shell renders #bkoGo (or,
   on the first attempt, #bkoIntroGo). Drive the wrong one and the probe reports "'Ready to bake!'
   never became live" about a game that is working perfectly. */
const BAKER_SURFACE = `(()=>{
  const i=document.getElementById('bkoIntroGo');
  if(i&&i.getBoundingClientRect().width>10)return true;
  /* NOT MERELY "#bkoGo EXISTS" — it survives the whole reveal reading "In the oven...", so a client
     that has just FINISHED baking still answers yes to that and the probe drove the wrong browser
     for three runs, screenshotting four identical frames of a bench nobody had started. The button
     has to be one a captain could actually press. */
  const b=document.getElementById('bkoGo');
  return !!(b&&!b.disabled&&/ready|bake it/i.test(b.textContent||''));
})()`;

/* Wait, bounded, until a bake surface appears on EITHER client, keeping the voyage moving.
   INSTRUMENT CORRECTION, 2026-08-23, found in this probe's own first run: waiting for "a bench" a
   second time returned INSTANTLY, because the FIRST bake's card was still on the glass through its
   reveal and verdict hold. It reported "second bake surface after 0 ticks" and then photographed
   the first bake again. A loop whose condition is already true when it starts is not a wait — so
   `requireClearFirst` makes the bench leave before the next one counts, and the clearing wait is
   bounded and reported rather than assumed. */
async function waitForBake(maxTicks, { driveHost = true, driveGuest = true, clearOn = null } = {}) {
  let clearedAfter = 0;
  if (clearOn) {
    /* WAIT FOR THE CLIENT THAT WAS HOLDING THE LAST BENCH TO LET GO OF IT — not for both.
       Requiring BOTH to be clear was wrong twice over: it is not the property that distinguishes
       one bake from the next, and the second captain's intro card can legitimately appear on the
       OTHER browser before the first captain's card has finished its verdict hold. That is exactly
       what happened, and the probe reported INCONCLUSIVE about a game that was working. */
    /* WAIT FOR EVERY BENCH TO GO, and test `.bko` ONLY — not the intro card. Since Task 3 both
       captains hold a bench during a bake, so waiting on one of them is not enough; but the NEXT
       captain's story card (#bkoIntroGo) can legitimately be up on the other browser before this
       one's verdict hold has finished, so including it in the test reported INCONCLUSIVE about a
       game that was working. Bounded, and a timeout is RECORDED rather than fatal — the pair that
       follows says what was on the glass either way. */
    let cleared = false;
    for (let i = 0; i < 60 && !cleared; i++) {
      const h = await H.ev(`!!document.querySelector('#actionPanel .bko')`);
      const g = guestAlive ? await G.ev(`!!document.querySelector('#actionPanel .bko')`) : false;
      if (!h && !g) { cleared = true; clearedAfter = i; break; }
      await sleep(1000);
    }
    if (!cleared) clearedAfter = -1;   // recorded, not fatal
  }
  for (let i = 0; i < maxTicks; i++) {
    const hb = await H.ev(BAKE_SURFACE), hk = await H.ev(BAKER_SURFACE);
    const gb = guestAlive ? await G.ev(BAKE_SURFACE) : false;
    const gk = guestAlive ? await G.ev(BAKER_SURFACE) : false;
    if (hb || gb) return { host: hb, guest: gb, hostIsBaker: hk, guestIsBaker: gk, ticks: i, clearedAfter };
    if (driveHost) { const a = await H.ev(TICK); if (a && a !== "BAKE-ON-SCREEN") log(`      host tick ${i}: ${a}`); }
    if (driveGuest && guestAlive) { const a = await G.ev(TICK); if (a && a !== "BAKE-ON-SCREEN") log(`      guest tick ${i}: ${a}`); }
    await sleep(1100);
  }
  return { host: false, guest: false, ticks: maxTicks, timedOut: true };
}

/* THE DROP, MP-13. Drive the guest's bench to answerable, then CLOSE THE TAB — the case a
   client-side goodbye cannot cover — and watch the host's table from the outside. What must be
   true: the voyage carries on within seconds, and exactly ONE decision-log entry lands for that
   bake, the same entry a completed bake writes. */
async function dropMidBake(owner) {
  log("\n=== drop: closing the guest's tab mid-bake ===");
  for (let i = 0; i < 40; i++) {
    if (await owner.ev(`(()=>{const b=document.getElementById('bkoIntroGo');return !!(b&&b.getBoundingClientRect().width>10)})()`)) { await owner.ev(`document.getElementById('bkoIntroGo').click();true`); break; }
    if (await owner.ev(`!!document.querySelector('#actionPanel .bko')`)) break;
    await sleep(500);
  }
  let rdy = false;
  for (let i = 0; i < 40 && !rdy; i++) { rdy = await owner.ev(`(()=>{const b=document.getElementById('bkoGo');return !!(b&&!b.disabled&&/ready/i.test(b.textContent))})()`); if (!rdy) await sleep(500); }
  if (rdy) await owner.ev(`document.getElementById('bkoGo').click();true`);
  let armed3 = false;
  for (let i = 0; i < 80 && !armed3; i++) { armed3 = await owner.ev(`(()=>{const b=document.getElementById('bkoGo');return !!(b&&/bake it/i.test(b.textContent))})()`); if (!armed3) await sleep(700); }
  await pair("d0-before-drop", "the guest's bench, answerable — and no countdown on either screen");
  const dlogBefore = await H.ev(`(()=>{const s=__pp_app_state_debug();return (s.dlog||[]).length})()`);
  const evBefore = await H.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.events||[]).length})()`);
  out.drop = { dlogBefore, evBefore, armedBench: armed3, closedAt: Date.now() };
  log(`  closing the guest tab (dlog=${dlogBefore}, events=${evBefore})`);
  await G.send("Page.close").catch(() => {});
  guestAlive = false;
  out.drop.samples = [];
  for (let k = 0; k < 24; k++) {
    await sleep(2500);
    const sm = { tMs: (k + 1) * 2500,
      dlog: await H.ev(`(()=>{const s=__pp_app_state_debug();return (s.dlog||[]).length})()`),
      events: await H.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.events||[]).length})()`),
      bko: await H.ev(`!!document.querySelector('#actionPanel .bko')`),
      last: await H.ev(`(()=>{const s=__pp_app_state_debug();const e=(s.game.events||[]);return e.length?e[e.length-1].t:null})()`) };
    out.drop.samples.push(sm);
    log(`  +${(sm.tMs / 1000).toFixed(1)}s dlog=${sm.dlog} events=${sm.events} bko=${sm.bko} last=${sm.last}`);
    if (sm.events > evBefore + 2) break;
  }
  await pair("d1-after-drop", "the host's table, after the guest vanished");
  const lastS = out.drop.samples[out.drop.samples.length - 1] || {};
  const firstS = out.drop.samples.find(sm => sm.events > evBefore);
  out.drop.verdict = {
    tableCarriedOn: (lastS.events || 0) > evBefore,
    secondsToCarryOn: firstS ? firstS.tMs / 1000 : null,
    dlogEntriesAdded: (lastS.dlog || 0) - dlogBefore,
    lastDlogEntry: await H.ev(`(()=>{const s=__pp_app_state_debug();const d=(s.dlog||[]);return d.length?d[d.length-1]:null})()`)
  };
  log("DROP VERDICT: " + JSON.stringify(out.drop.verdict));
}

/* ---------- teardown, on every path ---------- */
async function finish(code) {
  try {
    if (room && H) await H.ev(`(()=>{try{const s=__pp_app_state_debug();if(s.db&&s.room)s.db.ref('rooms/'+s.room).remove();return 1}catch(e){return 0}})()`);
  } catch {}
  out.finishedAt = new Date().toISOString();
  out.exit = code;
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(out, null, 2));
  log(`\nresult.json written to ${OUT}`);
  try { killAll(); } catch {}
  await sleep(400);
  process.exit(code);
}
process.on("SIGINT", () => finish(130));
process.on("unhandledRejection", async e => { log("UNHANDLED: " + e); await finish(1); });

/* ================= the run ================= */
try {
  const base = serve(PORT);                       // http://127.0.0.1:PORT/  (the game is at the root since the cutover)
  const url = base + "?ovens=1";
  log(`=== crew bake probe (${out.mode}) — ${url} ===`);
  /* CHROME PROFILES GO TO tmpdir, NEVER TO --out. The first run put them under the shots directory
     and 1,468 files of Chrome profile — verified_contents.json, ActorSafetyLists, the lot — went
     into a commit alongside twelve screenshots. --out is a directory a human reads; nothing that
     is not evidence belongs in it. */
  const profRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crew-bake-prof-"));
  out.profileRoot = profRoot;
  launch(DBG, path.join(profRoot, "host"));
  launch(DBG2, path.join(profRoot, "guest"));
  H = await attach(DBG); G = await attach(DBG2);
  // A headless tab that loses foreground reports document.hidden and the game correctly pauses
  // itself — an immaculate forgery of a stall (HARD-WON-LESSONS 2026-08-21). mp_rig's attach()
  // does not do this; cdp.mjs's openChrome does, and this is the same call.
  for (const C of [H, G]) await C.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});

  room = await makeHost(H, url, "test1");
  log(`room ${room}`);
  await makeGuest(G, url, room, "test2");
  await armIngMap(H, base); await armIngMap(G, base);

  // §3b: "Start the voyage!" opens a CONFIRMATION; #btnConfirmStart is what begins the game.
  await H.waitFor(`(()=>{const b=document.getElementById('btnStart');return !!(b&&b.getBoundingClientRect().width>10)})()`, 30000, "host: Start");
  await H.ev(`document.getElementById('btnStart').click();true`);
  await sleep(900);
  await H.waitFor(`(()=>{const b=document.getElementById('btnConfirmStart');return !!(b&&b.getBoundingClientRect().width>10)})()`, 25000, "host: Confirm start");
  await H.ev(`document.getElementById('btnConfirmStart').click();true`);
  log("voyage started");
  await sleep(2500);
  await armIngMap(H, base); await armIngMap(G, base);

  // the ceremony + the recipe draft (§3c: a recipe card takes TWO taps — TICK clicks the card, and
  // the "Bake this!" overlay it reveals is an .apBtn the next tick presses)
  for (let i = 0; i < 40; i++) {
    const a = await H.ev(TICK), b = guestAlive ? await G.ev(TICK) : null;
    if (a) log(`  open host: ${a}`); if (b) log(`  open guest: ${b}`);
    const started = await H.ev(`(()=>{try{const s=__pp_app_state_debug();return !!(s.game&&s.game.players&&s.game.players.every(p=>p.recipe))}catch(e){return false}})()`);
    if (started) { log("  recipes drafted on every seat"); break; }
    await sleep(1000);
  }
  await armIngMap(H, base); await armIngMap(G, base);
  await pair("00-voyage-open", "after the draft");

  /* ---------- THE RED-PROOF: the host's own bake, where a bench is KNOWN to exist ---------- */
  log("\n=== waiting for the first bake ===");
  const first = await waitForBake(220);
  if (first.timedOut) { out.abort = "no bake surface on either client inside ~4 minutes"; log("ABORT: " + out.abort); await pair("zz-timeout"); await finish(1); }
  log(`first bake surface: host=${first.host} guest=${first.guest} after ${first.ticks} ticks`);

  const r0 = await pair("01-first-bake", "the first bench of the voyage");
  out.redProof = {
    benchSeenSomewhere: !!(r0.host.shellPresent || (r0.guest && r0.guest.shellPresent) || r0.host.introGo || (r0.guest && r0.guest.introGo)),
    hostBench: r0.hostBench, guestBench: r0.guestBench
  };

  // Play whichever client is holding the first bench.
  // whichever client holds the CONTROLS is the baker; a watcher's shell has none
  const firstOnHost = first.hostIsBaker || (!first.guestIsBaker && first.host);
  /* --drop-mid-bake takes the FIRST bake the GUEST is holding, whichever one that is. Waiting for
     "the second bake" was wrong: the bake order is shuffled, so on half the runs the second bake
     was the host's and there was nothing to drop. */
  if (DROP && !firstOnHost) { await dropMidBake(G); await finish(0); }
  const C1 = firstOnHost ? H : G;
  log(`\n=== playing the first bake on the ${firstOnHost ? "HOST" : "GUEST"} ===`);
  const t1 = await playBench(C1, firstOnHost ? "host" : "guest", { buyRewatch: !firstOnHost });
  out.firstBake = t1;
  log("  " + JSON.stringify(t1).slice(0, 400));
  if (t1.fail) { out.abort = "first bake: " + t1.fail; log("ABORT: " + out.abort); await pair("zz-firstbake-fail"); await finish(1); }
  const rArmed = await pair("02-first-bench-answerable", "every crate named, before Bake it!");
  out.redProof.armedBowls = { host: rArmed.host.bowlCount, guest: rArmed.guest && rArmed.guest.bowlCount };
  out.redProof.armedWhose = { host: rArmed.hostBench, guest: rArmed.guestBench };
  await commitBench(C1, t1);
  await sleep(1500);
  await pair("03-first-verdict", "the reveal running");

  /* ---------- THE QUESTION: the SECOND captain's bake ---------- */
  log("\n=== waiting for the second captain's bake ===");
  /* The reveal + verdict hold + retireBakeCard run ~8s. requireClearFirst is what stops the FIRST
     bench, still on the glass through all of that, being photographed a second time and called the
     second bake — which is exactly what this probe did on its first run. */
  const second = await waitForBake(180, { clearOn: firstOnHost ? "host" : "guest" });
  out.secondBakeSurface = second;
  log(`second bake surface: host=${second.host} guest=${second.guest} after ${second.ticks} ticks`);
  if (second.clearedAfter === -1) log("NOTE: a bench was still on screen after 60s of waiting for the first bake to clear — the pair below says which.");
  if (second.timedOut) {
    out.answer = "INCONCLUSIVE — no second bake surface appeared on either client inside ~3 minutes";
    log("LIMIT: " + out.answer);
    await pair("04-second-bake-timeout");
    await finish(1);
  }
  const r2 = await pair("04-second-bake", "the second captain's bake, both browsers at the same moment");

  /* PLAY THE SECOND BAKE TOO, on whichever client is holding it — and buy a re-watch when that
     client is the GUEST, because MP-06's whole question is what a remote captain's purse does. */
  const secondOnGuest = second.guestIsBaker || (!second.hostIsBaker && second.guest && !second.host);
  const C2 = secondOnGuest ? G : H;
  log(`\n=== playing the second bake on the ${secondOnGuest ? "GUEST" : "HOST"} ===`);
  const t2 = await playBench(C2, secondOnGuest ? "guest" : "host", { buyRewatch: secondOnGuest });
  out.secondBake = t2;
  log("  " + JSON.stringify(t2).slice(0, 600));
  if (!t2.fail) {
    await pair("05-second-bench-answerable", "every crate named on the second bake");
    await commitBench(C2, t2);
    await sleep(2000);
    const r3 = await pair("06-second-verdict", "just after the second captain answered");
    /* MP-06's settlement: the host is authoritative. Sampled until the host's purse stops moving,
       bounded, so the comparison is against a settled number rather than a mid-flight one. */
    const gt = (t2.purseJustAfter ? t2 : (t1.purseJustAfter ? t1 : null));
    out.purse = { fromBake: gt ? gt.tag : null,
                  guestOptimistic: gt ? gt.purseJustAfter : null,
                  guestBefore: gt ? gt.purseBefore : null,
                  guestCoinRow: gt ? gt.coinRowJustAfter : null };
    for (let k = 0; k < 12; k++) {
      await sleep(2000);
      out.purse.hostSettled = await H.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.players||[]).map(p=>p.coins)})()`);
      /* BY SEAT ID, NEVER BY DOCUMENT ORDER. The first version read
         `[...document.querySelectorAll('[id^=coins]')]`, which returns the CAPTAINS rows in the
         order they are laid out — and that order is rotated per viewer, so every captain sees
         their own row on top (seatDisplayOrder, DISPLAY-RULES §2). It reported host [5,3,3,4] vs
         guest [3,4,5,3] and read as a live purse divergence. It was not: the guest's rows were
         test2/FlakyJack/test1/DoughHook, i.e. seats 1,3,0,2 — the SAME four numbers. A check built
         on my own assumption about ordering, exactly HARD-WON-LESSONS §2. Read `#coins<seat>`. */
      out.purse.guestRendered = guestAlive ? await G.ev(`(()=>{const s=__pp_app_state_debug();return (s.game.players||[]).map((_,i)=>{const e=document.getElementById('coins'+i);return e?+e.dataset.coins:null})})()`) : null;
      out.purse.hostDlog = await H.ev(`(()=>{const s=__pp_app_state_debug();return (s.dlog||[]).slice(-3)})()`);
      if (JSON.stringify(out.purse.hostSettled) === JSON.stringify(out.purse.guestRendered)) break;
    }
    log("PURSE: " + JSON.stringify(out.purse));
    await pair("07-after-second-bake", "the table, once the second bake has settled");
  } else log("  second bake could not be played: " + t2.fail);

  /* THE ANSWER, stated as what the two reads say and nothing more. */
  const hostHasBench = !!(r2.host.shellPresent || r2.host.introGo);
  const guestHasBench = !!(r2.guest && (r2.guest.shellPresent || r2.guest.introGo));
  out.answer = {
    hostShowsABench: hostHasBench,
    guestShowsABench: guestHasBench,
    hostBenchBelongsToSeat: r2.hostBench,
    guestBenchBelongsToSeat: r2.guestBench,
    hostSeat: r2.host.seat, guestSeat: r2.guest && r2.guest.seat,
    guestApMsg: r2.guest && r2.guest.apMsg,
    hostApMsg: r2.host.apMsg
  };
  log("\nANSWER: " + JSON.stringify(out.answer, null, 2));

  if (SPECTATE) {
    /* Four paired moments across the second captain's bake, for the spectator criterion. */
    log("\n=== spectate: four paired moments ===");
    /* RE-DETECT WHO IS BAKING, RIGHT NOW. `second.*` was captured two bakes ago and reusing it
       aimed the driver at a browser that had long since handed the crates back — so this leg
       screenshotted four moments of a bench nobody had pressed Ready on and called them
       mid-shuffle, a pick landed, mid-reveal and the verdict. They were all the same frame.
       Bounded: if neither client is holding controls, say so rather than driving the wrong one. */
    let owner = null, ownerTag = "none";
    for (let i = 0; i < 90 && !owner; i++) {
      if (await H.ev(BAKER_SURFACE)) { owner = H; ownerTag = "host"; break; }
      if (guestAlive && await G.ev(BAKER_SURFACE)) { owner = G; ownerTag = "guest"; break; }
      await H.ev(TICK); if (guestAlive) await G.ev(TICK);
      await sleep(1100);
    }
    if (!owner) { log("LIMIT: no captain was holding bake controls inside ~100s — the spectate leg has nothing to drive"); out.spectate = { aborted: "no baker" }; await finish(1); }
    /* THE WATCHER IS THE OTHER ONE, and it is the whole point of this leg: at each of the four
       moments below, one screen is being tapped and the other is watching, and they must show the
       same bench. */
    const spec = { moments: [], baker: ownerTag, watcher: ownerTag === "guest" ? "host" : "guest" };
    log(`  baker=${ownerTag}, watcher=${spec.watcher}`);
    // moment A: mid-shuffle. Press Ready and sample while the swaps run.
    for (let i = 0; i < 40; i++) {
      if (await owner.ev(`(()=>{const b=document.getElementById('bkoIntroGo');return !!(b&&b.getBoundingClientRect().width>10)})()`)) { await owner.ev(`document.getElementById('bkoIntroGo').click();true`); break; }
      if (await owner.ev(`!!document.querySelector('#actionPanel .bko')`)) break;
      await sleep(500);
    }
    let rdy = false;
    for (let i = 0; i < 40 && !rdy; i++) { rdy = await owner.ev(`(()=>{const b=document.getElementById('bkoGo');return !!(b&&!b.disabled&&/ready/i.test(b.textContent))})()`); if (!rdy) await sleep(500); }
    await pair("s0-study", "the study phase, before Ready");
    if (rdy) await owner.ev(`document.getElementById('bkoGo').click();true`);
    await sleep(2600);
    spec.moments.push((await pair("s1-mid-shuffle", "the swaps running")).name);
    let armed2 = false;
    for (let i = 0; i < 80 && !armed2; i++) { armed2 = await owner.ev(`(()=>{const b=document.getElementById('bkoGo');return !!(b&&/bake it/i.test(b.textContent))})()`); if (!armed2) await sleep(700); }
    // moment B: one pick landed
    const open2 = await owner.ev(`[...document.querySelectorAll('#actionPanel .bkoBowl')].map((b,i)=>({i,locked:b.classList.contains('locked')})).filter(b=>!b.locked).map(b=>b.i)`);
    if (open2 && open2.length) { await owner.ev(`(()=>{const b=document.querySelectorAll('#actionPanel .bkoBowl')[${open2[0]}];if(b)b.click();return 1})()`); await sleep(700); }
    spec.moments.push((await pair("s2-one-pick-landed", "a single crate named")).name);
    for (const i of (open2 || []).slice(1)) { await owner.ev(`(()=>{const b=document.querySelectorAll('#actionPanel .bkoBowl')[${i}];if(b)b.click();return 1})()`); await sleep(260); }
    await sleep(400);
    await owner.ev(`(()=>{const b=document.getElementById('bkoGo');if(b&&!b.disabled)b.click();return 1})()`);
    await sleep(1400);
    spec.moments.push((await pair("s3-mid-reveal", "crates coming off one at a time")).name);
    await sleep(3200);
    spec.moments.push((await pair("s4-verdict", "the verdict line")).name);
    out.spectate = spec;
  } else if (DROP) {
    /* THE NEGATIVE CASE IS PROVEN BY THE PLAIN RUN, which is the "a captain who finishes normally
       is never forfeited" half. This branch only runs when neither of the first two bakes was the
       guest's; the drop itself is taken at the first guest bake, far above. */
    if (second.guestIsBaker) { await dropMidBake(G); }
    else { out.dropNote = "neither of the first two bakes was the guest's — nothing to drop; reported rather than dropping the host"; log("LIMIT: " + out.dropNote); }
  }

  await finish(0);
} catch (e) {
  log("THREW: " + (e && e.stack || e));
  out.threw = String(e && e.message || e);
  await finish(1);
}
