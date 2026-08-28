// player.mjs — plays Pastry Pirates FULLY, the way Wyatt asked (2026-08-21): "not just play the
// games, but play them FULLY. click all the buttons; make sure everything works."
//
// This is the GENERAL driver: it has no per-bug knowledge and no per-screen assertions (those live
// in checks.mjs + vision.mjs). It knows only how to ANSWER the game — every prompt kind there is —
// and three disciplines:
//   1. REAL MOUSE, ON-SCREEN ONLY: every click is Input.dispatchMouseEvent at the element's centre,
//      allowed only if the element passes the on-screen/unoccluded gate. A control that exists but
//      cannot be clicked for GRACE consecutive ticks is a finding, never a click (mouse-QA rule).
//   2. COVERAGE, NOT SHORTEST PATH: on a menu it prefers the choice whose KIND it has exercised
//      least, so across a voyage it dock/trades/attacks/passes/fishes rather than spamming one.
//      The ledger of kinds seen vs exercised is part of the gate's verdict.
//   3. EVERY CLICK MUST HAVE AN EFFECT: after each click something observable must change (the
//      prompt, the event log, the day, a body class) within EFFECT_MS — a click that changes
//      nothing is recorded as a DEAD BUTTON. This is "make sure everything works", generalised.
import { sleep } from "./cdp.mjs";

export const GATE_SRC = `window.__gate = (el) => {
  if (!el) return {ok:false, why:'no element'};
  const r = el.getBoundingClientRect(); const cx = r.left + r.width/2, cy = r.top + r.height/2;
  if (r.width < 4 || r.height < 4) return {ok:false, why:'zero size'};
  if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return {ok:false, why:'outside viewport'};
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return {ok:false, why:'occluded by ' + (hit ? (hit.id || String(hit.className).slice(0,20) || hit.tagName) : 'nothing')};
  return {ok:true, x:cx, y:cy};
};`;

// normalise a button label to a coverage KIND — strips numbers/emoji so "Pass +1🌕" and "Pass"
// count as one kind, and every distinct verb the game offers becomes one coverage row.
const kindOf = (label) => label.toLowerCase()
  .replace(/[0-9]+/g, "#").replace(/[^\p{L}# ]/gu, "").trim().replace(/\s+/g, " ").slice(0, 24) || "(icon)";

// a stable signature of "which screen is this" — used to screenshot each DISTINCT screen once and
// to detect that a click changed something. Content-shaped, not pixel-shaped, so narration typing
// doesn't churn it.
const SIG_SRC = `(() => {
  const ap = document.getElementById('actionPanel'); const box = document.getElementById('pp4Prompt');
  const btns = [...document.querySelectorAll('#pp4Prompt .apBtn, .btlBtn')].filter(b => getComputedStyle(b).visibility !== 'hidden' && b.getBoundingClientRect().width > 4).map(b => (b.textContent||'').trim().slice(0,12)).join('|');
  const cls = (box ? box.className : '') + ' ' + document.body.className;
  const sail = document.querySelectorAll('.sailCell').length;
  const flip = document.querySelector('#flipCoinWrap.active') ? 'FLIP' : '';
  const eov = (() => { const s = document.getElementById('statsWrap'); return s && s.style.display !== 'none' ? 'EOV' : ''; })();
  // SELECTION STATE IS A REAL CHANGE. Two-step confirm controls (the recipe card is the worked
  // example: first tap is preventDefault'd and only adds a focus class + a "Bake this!" pill,
  // second tap on the SAME card commits) change nothing else on screen. Without this the driver
  // read its own first tap as "dead button" and coverage-first then chose the OTHER card, toggling
  // forever. Selection is part of what screen you are on, so it belongs in the signature.
  const sel = [...document.querySelectorAll('.pp4Focus, .selected, [aria-selected="true"], .pp4Bake')].map(e => (e.className||'') + ':' + (e.textContent||'').trim().slice(0,8)).join(',');
  const msg = (document.querySelector('#pp4Prompt .apMsg, .bko') || {textContent:''}).textContent.trim().slice(0, 40);
  return [cls.trim(), btns, 'sail:'+(sail?1:0), flip, eov, 'sel:'+sel, msg].join(' ~ ');
})()`;

// THE one button query. Both the survey and the click-locator index into this exact list, so an
// index always means the same element (see the label-matching stall this replaced).
const BTN_Q = `[...document.querySelectorAll('#pp4Prompt .apBtn, #actionPanel .apBtn, .btlBtn')].filter(b => { const cs = getComputedStyle(b); if (cs.visibility === 'hidden' || cs.display === 'none') return false; const r = b.getBoundingClientRect(); return r.width > 0 || r.height > 0; })`;

export function makePlayer(c, { log = () => {}, isGuest = false } = {}) {
  const P = {
    coverage: new Map(),      // kind -> { seen: n, clicked: n }
    deadButtons: [],          // { label, screen } — clicks that changed nothing
    findings: [],             // unreachable-control findings (from the grace counter)
    screens: [],              // { sig, shot } — every DISTINCT screen, screenshotted once
    days: new Set(),
    pending: new Map(),       // grace counters for unreachable controls
  };
  const seenSig = new Set();

  const ev = c.ev.bind(c);
  const sig = () => ev(SIG_SRC);
  // appState is NOT a window global (DRIVING-THE-GAME.md §6) — import it once and cache it on
  // window, exactly as mouse_qa.mjs does. Without this every read threw, was swallowed, and the
  // gate reported DAY 0 forever and could never see the end of voyage. A silent zero, not an error.
  const state = () => ev(`(async()=>{try{
    if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;}
    const g=window.appState.game; if(!g) return {ev:0,day:0,over:false};
    return {ev:(g.log||g.events||[]).length, day:g.round||0,
      over:(()=>{const s=document.getElementById('statsWrap');return !!(s&&s.style.display!=='none');})()};
  }catch(e){return {ev:0,day:0,over:false,err:String(e.message).slice(0,60)}}})()`);

  const cover = (kind, field) => { const r = P.coverage.get(kind) || { seen: 0, clicked: 0 }; r[field]++; P.coverage.set(kind, r); };

  // click el (by an in-page locator expr resolving to ONE element) with the real mouse, then
  // require an effect. Returns true if clicked+effective, "dead" if clicked with no effect.
  const EFFECT_MS = 9000;
  async function clickAndVerify(gateExpr, label) {
    const g = await ev(gateExpr);
    if (!g || !g.ok) return null;
    const before = JSON.stringify([await sig(), await state()]);
    await c.clickXY(g.x, g.y);
    cover(kindOf(label), "clicked");
    const t0 = Date.now();
    while (Date.now() - t0 < EFFECT_MS) {
      await sleep(450);
      const now = JSON.stringify([await sig(), await state()]);
      if (now !== before) return true;
    }
    P.deadButtons.push({ label, at: (await sig()).slice(0, 80) });
    log(`DEAD BUTTON: "${label}" — clicked, nothing changed in ${EFFECT_MS / 1000}s`);
    return "dead";
  }

  // pick from the current prompt's buttons by COVERAGE (least-clicked kind first). Never "Back"
  // unless it is the only choice; never the stepper's −1 (the +1/confirm path covers it, and a
  // naive driver oscillates ± forever — mp_rig lesson); records every label it SAW.
  async function answerButtons() {
    const btns = await ev(`(() => {
      const list = ${BTN_Q};
      return list.map((b, i) => ({ i, label: (b.textContent||'').trim().slice(0, 30),
        disabled: b.disabled || b.classList.contains('apDisabled') || b.getAttribute('aria-disabled') === 'true',
        g: __gate(b) }));
    })()`);
    if (!btns || !btns.length) return false;
    for (const b of btns) if (!b.disabled) cover(kindOf(b.label), "seen");
    const isBack = b => /back|←|‹/i.test(b.label);
    const isMinus = b => /^−|^-\s*1|minus/i.test(b.label);
    const live = btns.filter(b => !b.disabled && !isBack(b) && !isMinus(b));
    // unreachable-control finding, with grace (intros park buttons at zero size legitimately)
    // "zero size" here means a hidden/parked control, not a mispositioned one — intros legitimately
    // park buttons at zero size, and a display:none lobby control (e.g. #btnStart in solo) is simply
    // not offered. Only controls that ARE rendered but cannot be reached are findings.
    const blocked = live.filter(b => !b.g.ok && b.g.why !== 'zero size');
    for (const b of blocked) {
      const k = "unreachable:" + kindOf(b.label) + ":" + b.g.why.replace(/\d+/g, "#");
      const n = (P.pending.get(k) || 0) + 1; P.pending.set(k, n);
      if (n === 6) { P.findings.push({ what: `control "${b.label}" exists but not clickable: ${b.g.why}` }); log(`FINDING: "${b.label}" not clickable — ${b.g.why}`); }
    }
    const usable = live.filter(b => b.g.ok);
    if (!usable.length) {
      const back = btns.find(b => isBack(b) && b.g && b.g.ok);
      if (back && blocked.length === 0) { await c.clickXY(back.g.x, back.g.y); return true; }   // a Back-only prompt
      return false;
    }
    for (const b of usable) { const pre = "unreachable:" + kindOf(b.label);
      for (const k of [...P.pending.keys()]) if (k.startsWith(pre)) P.pending.delete(k); }
    // stepper: exercise +1 once per stepper visit, then confirm (the primary)
    // TWO-STEP CONFIRM: if a control we just tapped is now SELECTED (focus class / "Bake this!"
    // pill), the committing gesture is another tap on that SAME control — not a different one.
    // General to any select-then-confirm control, not specific to the recipe picker.
    const selIdx = await ev(`(() => { const list = ${BTN_Q};
      for (let i = 0; i < list.length; i++) { const b = list[i];
        if (b.classList.contains('pp4Focus') || b.classList.contains('selected') || b.querySelector('.pp4Bake')) return i; }
      return -1; })()`);
    if (selIdx >= 0) {
      const lab = (btns[selIdx] && btns[selIdx].label) || "selected card";
      await clickAndVerify(`__gate(${BTN_Q}[${selIdx}])`, lab + " (commit)");
      return true;
    }
    // LOCATE BY INDEX, NEVER BY LABEL. Labels are truncated to 30 chars for the coverage ledger,
    // and a locator comparing that truncated string to the element's real textContent matches
    // NOTHING — every click silently no-oped and the gate stalled on the recipe picker forever
    // (measured 2026-08-21). The index is into BTN_Q, the one query both sides share.
    const at = i => `__gate(${BTN_Q}[${i}])`;
    const plus = usable.find(b => /^\+\s*1|plus/i.test(b.label));
    if (plus && !P._steppedThisPrompt) { P._steppedThisPrompt = true;
      await clickAndVerify(at(plus.i), plus.label); return true; }
    P._steppedThisPrompt = false;
    // coverage-first pick: least-clicked kind, then leftmost
    usable.sort((a, b2) => ((P.coverage.get(kindOf(a.label))||{clicked:0}).clicked - (P.coverage.get(kindOf(b2.label))||{clicked:0}).clicked));
    const pick = usable[0];
    await clickAndVerify(at(pick.i), pick.label);
    return true;
  }

  // slider prompt: real mouse click at ~2/3 along the track, verify the readout moved (its effect),
  // then let answerButtons confirm.
  async function answerSlider() {
    const s = await ev(`(() => { const el = document.querySelector('#pp4Prompt .apSlider'); if (!el) return null;
      const r = el.getBoundingClientRect(); const out = document.querySelector('.apSliderOut');
      return { x: r.left + r.width * 0.67, y: r.top + r.height / 2, val: out ? out.textContent : el.value, vis: getComputedStyle(el).visibility !== 'hidden' && r.width > 10 }; })()`);
    if (!s || !s.vis) return false;
    cover("slider", "seen");
    await c.clickXY(s.x, s.y); await sleep(400);
    const after = await ev(`(() => { const out = document.querySelector('.apSliderOut'); const el = document.querySelector('#pp4Prompt .apSlider'); return out ? out.textContent : (el ? el.value : null); })()`);
    if (after !== s.val) cover("slider", "clicked");
    else { P.deadButtons.push({ label: "slider drag", at: "slider readout did not move" }); log("DEAD CONTROL: slider click did not move its readout"); }
    return true;   // buttons beside it confirm on the next tick
  }

  async function answerSail() {
    const cell = await ev(`(() => { const cs = [...document.querySelectorAll('.sailCell')]; if (!cs.length) return null;
      for (const el of cs) { const g = __gate(el); if (g.ok) return Object.assign(g, { n: cs.length }); }
      return { blocked: cs.length }; })()`);
    if (!cell) return false;
    cover("sail square", "seen");
    if (!cell.ok) { const k = "unreachable:sail"; const n = (P.pending.get(k) || 0) + 1; P.pending.set(k, n);
      if (n === 6) { P.findings.push({ what: `sail squares exist but none clickable` }); log("FINDING: no sail square clickable"); } return true; }
    P.pending.delete("unreachable:sail");
    await c.clickXY(cell.x, cell.y); cover("sail square", "clicked");
    return true;
  }

  async function answerFlip() {
    const r = await clickAndVerify(`(() => { const coin = document.querySelector('#flipCoinWrap.active'); return coin ? __gate(coin) : null; })()`, "flip coin");
    if (r) cover("flip coin", "seen");
    return !!r;
  }

  /* A HIDDEN TAB LOOKS EXACTLY LIKE A GAME-STOPPING BUG, AND IS NOT ONE.
     DRIVING-THE-GAME.md §8b says it outright, and this gate reproduced it anyway on 2026-08-21:
     the tab went `document.hidden`, the game did the correct thing and paused itself (its tab-hide
     gate), `waitWhilePaused()` legitimately never resolved mid trade-wind ride, and the event
     stream froze at 234 events with a clean console — the precise signature of a throw in the turn
     chain. It cost a real investigation and came within one sentence of being reported to Wyatt as
     a game-stopping stall at day 15. It was the instrument.
     So the driver now REPAIRS visibility every tick rather than trusting it, and says so out loud
     if it ever has to — a gate that silently fixes its own environment is a gate that hides how
     often the environment is wrong. */
  async function ensureVisible() {
    const hidden = await ev("document.hidden === true");
    if (!hidden) return false;
    await c.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
    await c.send("Page.bringToFront").catch(() => {});
    await sleep(300);
    const still = await ev("document.hidden === true");
    // ONCE per leg, not once per tick — the first version logged every second for six minutes,
    // which buries the real findings it sits among and is its own kind of gate-that-cries-wolf.
    if (!P._hiddenSaid){
      P._hiddenSaid = true;
      log(still ? "WARNING: tab is hidden and will not come to front — the game auto-pauses, so timings and any 'stall' from here are NOT trustworthy"
                : "note: tab had gone hidden (game auto-pauses); focus re-asserted");
    }
    return still;
  }

  // one tick: answer whatever the game is asking, in priority order (flip first — §4a).
  async function tick() {
    await ensureVisible();
    await ev(GATE_SRC);
    if (await answerFlip()) return "acted";
    if (await answerSail()) return "acted";
    await answerSlider();                     // slider needs its nudge before the confirm click
    if (await answerButtons()) return "acted";
    return "idle";
  }

  // screenshot every DISTINCT screen once. Returns the shot path when this sig is new.
  async function captureIfNew(shotDir, prefix, n) {
    const s = await sig();
    /* THE WEBKIT MOUNT RETURNS {__err} WHERE THE CDP MOUNT THROWS — and this line used to call
       .replace on that object, so both -wk legs of the 2026-08-28 trial died mid-voyage with
       "s.replace is not a function" while the REAL failure (whatever made page.evaluate throw)
       was never seen by anyone. An instrument that crashes on its own error report is worse than
       one that crashes honestly: surface the underlying message instead. */
    if (typeof s !== "string") throw new Error("sig() could not read the page: " + ((s && s.__err) || JSON.stringify(s).slice(0, 160)));
    const key = s.replace(/~ [^~]*$/, "");     // ignore the free-text tail for dedupe
    if (seenSig.has(key)) return null;
    seenSig.add(key);
    const f = `${shotDir}/${prefix}-${String(n).padStart(3, "0")}.png`;
    await c.shot(f);
    P.screens.push({ sig: s.slice(0, 120), shot: f });
    return f;
  }

  return { P, tick, captureIfNew, sig, state, clickAndVerify, cover, ensureVisible };
}

// side quests — the buttons OUTSIDE the turn loop that "click all the buttons" must also cover.
// Each verifies its own effect and restores the state it toggled.
export async function sideQuests(c, player, log = () => {}) {
  const { clickAndVerify, cover, P } = player;
  await c.ev(GATE_SRC);
  // ☰ menu open/close (+ its own screenshot happens via captureIfNew on the changed body class)
  cover("menu", "seen");
  const m1 = await clickAndVerify(`__gate(document.getElementById('pp4Menu'))`, "☰ menu open");
  if (m1 === true) { await sleep(400); await clickAndVerify(`__gate(document.getElementById('pp4Menu'))`, "☰ menu close"); }
  // chat (crew only — the bubble only renders in a networked game)
  const hasChat = await c.ev(`!!document.getElementById('pp4Chat') && getComputedStyle(document.getElementById('pp4Chat')).display !== 'none'`);
  if (hasChat) {
    cover("chat", "seen");
    const open = await clickAndVerify(`__gate(document.getElementById('pp4Chat'))`, "chat open");
    if (open === true) {
      await c.ev(`(() => { const i = document.getElementById('chatInput'); if (i) { i.focus(); } return 1; })()`);
      await c.type("ahoy from the gate");
      const sent = await c.ev(`(() => { const f = document.getElementById('chatForm'); if (!f) return false; const n0 = document.querySelectorAll('#chatLog > *').length; f.requestSubmit(); return n0; })()`);
      await sleep(1200);
      const n1 = await c.ev(`document.querySelectorAll('#chatLog > *').length`);
      if (typeof sent === "number" && n1 > sent) cover("chat", "clicked");
      else { P.deadButtons.push({ label: "chat send", at: "no new chat row after submit" }); log("DEAD CONTROL: chat message did not appear"); }
      await clickAndVerify(`__gate(document.getElementById('pp4Chat'))`, "chat close");
    }
  }
  // a captain's recipe link -> recipe modal, then dismiss (outside click)
  const hasRecipeLink = await c.ev(`(() => { const el = [...document.querySelectorAll('.prowRecipe')].find(e => e.textContent.trim() && __gate(e).ok); return !!el; })()`);
  if (hasRecipeLink) {
    cover("recipe modal", "seen");
    const opened = await clickAndVerify(`__gate([...document.querySelectorAll('.prowRecipe')].find(e => e.textContent.trim() && __gate(e).ok))`, "recipe link");
    if (opened === true) { cover("recipe modal", "clicked"); await sleep(400); await c.clickXY(8, Math.round(c.H / 2)); await sleep(500); }
  }
}
