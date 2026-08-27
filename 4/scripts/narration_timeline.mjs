#!/usr/bin/env node
/* narration_timeline.mjs — the instrument behind every number in Group E (02.2-07).
 *
 *   node 4/scripts/narration_timeline.mjs <outdir> <W> <H> <port> <dbgport> [--crew <port2> <dbg2> <dbg3>] [--json <file>]
 *
 * e.g.  node 4/scripts/narration_timeline.mjs /tmp/e-before 1400 900 8611 9611 \
 *          --crew 8612 9612 9613 --json .planning/phases/02.2-.../e-before.json
 *
 * WHY IT EXISTS. Two days were lost this month to five defects reported as confirmed with three of
 * them unmeasured — four of the five did not exist. Nothing in Group E may be reported as fixed
 * against a number that was never taken first, and no sampler here is believed until it has been
 * SEEN RED. The red-proofs run first, every run, and their results are written into the output as
 * `redproof` — a run whose samplers never went red is a run that proved nothing.
 *
 * WHAT IT PRODUCES (one JSON):
 *   cases            per driven narration case: created/out/removed, selfretire_ms, visible_ms
 *   holds            the D-34 anchors measured through the game's own renderer, host tier
 *   holds_guest      the same three, on a real guest in a real Firebase room
 *   pill             the ask pill's overhang past BODY's right edge, and the board's own top edge
 *   buy_to_render_ms Buy click -> the crate actually landing (item 9)
 *   storm            inline storm lines outside the summary, and whether a blocked captain is in it
 *   blackmarket      whether the ceremony appears when a BOT empties the first shelf
 *   redproof         each sampler, and the words "seen red"
 *
 * THE RULES IT PAID FOR (02.2-MOUSE-QA-2026-08-21, HARD-WON-LESSONS §8): always headless, always
 * --mute-audio, launched from a background shell, and every pkill SCOPED TO ITS OWN PORTS — a bare
 * `pkill -f remote-debugging-port` kills every other agent's probe on the machine. Every loop is
 * bounded; nothing here can spin. It kills what it started before it returns.
 *
 * POSING (DRIVING-THE-GAME.md §5e) IS SOLO-ONLY. The coin is posed for TAILS by wrapping the
 * game's own r() behind a flag, restored the moment the flip lands. It is never done in a room.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO, CHROME, LINUX_ARGS, gameURL, GAME_PATH } from "./lib/chrome.mjs";
import { driver, driverOff } from "./mp_rig.mjs";
import { PROBE_SRC, BOARD_SAMPLER_SRC, PILL_PROBE_SRC, RECIPE_PROBE_SRC, HOLD_TEXTS, measureHold, measureHoldTwice } from "./lib/narration_probe.mjs";

const OUT = process.argv[2] || path.join(process.cwd(), "narration-timeline");
const W = +(process.argv[3] || 1400), H = +(process.argv[4] || 900);
const PORT = +(process.argv[5] || 8611), DBG = +(process.argv[6] || 9611);
const argv = process.argv.slice(7);
const flag = n => { const i = argv.indexOf(n); return i < 0 ? null : argv.slice(i + 1); };
const CREW = flag("--crew");                       // [port2, dbgHost, dbgGuest]
const CREWONLY = argv.includes("--crewonly");      // the guest tier alone, merged into an existing JSON
const JSONOUT = flag("--json") ? flag("--json")[0] : null;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => { const s = `[${new Date().toISOString().slice(11, 19)}] ` + a.join(" ");
  console.log(s); fs.appendFileSync(path.join(OUT, "log.txt"), s + "\n"); };

/* ---------- process bookkeeping: everything this run started, and nothing else ---------- */
const procs = [], myDbg = [], myHttp = [];
const serve = port => { const p = spawn("python3", ["-m", "http.server", String(port)], { cwd: REPO, stdio: "ignore" });
  procs.push(p); myHttp.push(port); return gameURL(port); };
const launch = (dbg, profile) => {
  fs.rmSync(profile, { recursive: true, force: true });
  const p = spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--mute-audio",
    `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", `--window-size=${W},${H}`,
    "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
  procs.push(p); myDbg.push(dbg); return p;
};
const killAll = () => {
  for (const p of procs) { try { p.kill("SIGKILL"); } catch {} }
  for (const d of myDbg) { try { execSync(`pkill -f "remote-debugging-port=${d}"`, { stdio: "ignore" }); } catch {} }
  for (const h of myHttp) { try { execSync(`pkill -f "http.server ${h}"`, { stdio: "ignore" }); } catch {} }
};
process.on("exit", killAll);
process.on("SIGINT", () => { killAll(); process.exit(1); });

/* ---------- CDP ---------- */
async function attach(dbg, { w = W, h = H } = {}) {
  let tgt = null;
  for (let i = 0; i < 40 && !tgt; i++) {
    try { tgt = await (await fetch(`http://127.0.0.1:${dbg}/json/new?about:blank`, { method: "PUT" })).json(); }
    catch { await sleep(300); }
  }
  if (!tgt) throw new Error("chrome never came up on " + dbg);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails?.exception?.description || "").slice(0, 160)); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __err: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 200) };
    return r.result?.result?.value; };
  const shot = async name => { const r = await send("Page.captureScreenshot", { format: "png" });
    if (r.result?.data) fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); };
  const goto = async u => { await send("Page.navigate", { url: u }); await sleep(1500); };
  const waitFor = async (expr, ms = 30000, label = expr) => { const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < ms && i < 4000; i++) { let v = false;
      try { v = await ev(expr); } catch { v = false; }
      if (v === true) return true; await sleep(250); }
    log("TIMEOUT waiting for: " + label); return false; };
  const click = async (x, y) => { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); };
  return { ev, shot, goto, waitFor, click, send, errs };
}

/* the on-screen-and-unoccluded gate, and a real-mouse click through it */
const GATE = `window.__gate = (el) => { if (!el) return {ok:false, why:'no element'};
  const r = el.getBoundingClientRect(); const b = document.body.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  if (r.width < 4 || r.height < 4) return {ok:false, why:'zero size'};
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return {ok:false, why:'outside viewport'};
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return {ok:false, why:'occluded'};
  return {ok:true, x:cx, y:cy}; };`;
async function clickSel(C, selector, filterSrc = "() => true", label = selector) {
  const g = await C.ev(`(() => { const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(${filterSrc});
     if (!els.length) return {none:true};
     const tries = els.map(el => ({txt:(el.textContent||el.id||'').trim().slice(0,30), g: __gate(el)}));
     const ok = tries.find(t => t.g.ok); return {ok: !!ok, pick: ok, tries}; })()`);
  if (!g || g.none) return { none: true };
  if (!g.ok) return { blocked: true, tries: g.tries };
  await C.click(g.pick.g.x, g.pick.g.y);
  return { clicked: g.pick.txt };
}

/* ---------- THE RED PROOFS. Every sampler, seen red, before any of them is believed. -------- */
async function redProof(C) {
  const rp = {};
  // 1. a bubble that pops in and is marked for removal in the same instant IS detected
  rp.selfretire = await C.ev(`(async () => { const NT = window.__NT; const i = NT.bubbles.length;
    const b = document.createElement("div"); b.className = "pp4Bub"; b.textContent = "REDPROOF selfretire";
    (document.getElementById("pp4Fx") || document.body).appendChild(b);
    await new Promise(r => setTimeout(r, 30)); b.classList.add("out");
    await new Promise(r => setTimeout(r, 120)); b.remove();
    await new Promise(r => setTimeout(r, 120));
    const h = NT.bubbles[i];
    return (h && h.out_ms != null && h.out_ms - h.created_ms < 300) ? "seen red (self-retired in " + (h.out_ms - h.created_ms) + "ms)" : "DID NOT GO RED"; })()`);
  // 2. occlusion by the ceremony veil IS counted
  rp.occlusion = await C.ev(`(async () => { const NT = window.__NT; const i = NT.bubbles.length;
    const b = document.createElement("div"); b.className = "pp4Bub"; b.textContent = "REDPROOF occlusion";
    (document.getElementById("pp4Fx") || document.body).appendChild(b);
    const v = document.createElement("div"); v.id = "pp4Veil"; v.style.cssText = "position:fixed;inset:0;pointer-events:none;opacity:0";
    document.body.appendChild(v);
    await new Promise(r => setTimeout(r, 400)); v.remove();
    await new Promise(r => setTimeout(r, 100)); b.remove();
    await new Promise(r => setTimeout(r, 120));
    const h = NT.bubbles[i];
    return (h && h.occluded_ms >= 300) ? "seen red (" + h.occluded_ms + "ms behind the veil)" : "DID NOT GO RED (" + (h ? h.occluded_ms : "no bubble") + ")"; })()`);
  // 3. a pill hanging off body's right edge IS reported as an overhang. The forced element is
  //    parked 40px PAST body's own right edge in viewport coordinates (position:fixed answers to
  //    the viewport, not to the capped column) — the first version of this proof used body's
  //    WIDTH as if it were an absolute x and could not go red on a centred desktop column.
  rp.overhang = await C.ev(`(async () => {
    const ap = document.getElementById("actionPanel"); if (!ap) return "no actionPanel";
    const b0 = document.body.getBoundingClientRect();
    const made = document.createElement("div"); made.className = "apMsg redproof";
    made.style.cssText = "position:fixed;left:" + (b0.right - 160) + "px;top:100px;width:200px;height:20px;opacity:0";
    ap.appendChild(made);
    await new Promise(r => setTimeout(r, 60));
    const m = made.getBoundingClientRect(), b = document.body.getBoundingClientRect();
    const over = m.right - b.right; made.remove();
    return over > 20 ? "seen red (" + Math.round(over) + "px past body's right edge)" : "DID NOT GO RED (" + Math.round(over) + ")"; })()`);
  // 4. a board that MOVES is seen moving. #boardwrap is position:fixed, so a spacer sibling moves
  //    nothing — the forced move has to be one getBoundingClientRect actually answers to.
  rp.board_top = await C.ev(`(async () => {
    const el = document.getElementById("boardwrap") || document.getElementById("pp4Board");
    if (!el) return "no board element";
    const was = el.style.transform;
    const before = el.getBoundingClientRect().top;
    el.style.transform = (was ? was + " " : "") + "translateY(40px)";
    await new Promise(r => setTimeout(r, 120));
    const after = el.getBoundingClientRect().top; el.style.transform = was;
    return Math.abs(after - before) > 5 ? "seen red (board moved " + Math.round(after - before) + "px)" : "DID NOT GO RED"; })()`);
  // 5. the prompt attribute timeline records a change
  rp.prompt_attrs = await C.ev(`(async () => { const NT = window.__NT; const n0 = NT.attrs.length;
    const ap = document.getElementById("actionPanel"); if (!ap) return "no actionPanel";
    ap.classList.add("pendingReveal"); await new Promise(r => setTimeout(r, 80)); ap.classList.remove("pendingReveal");
    await new Promise(r => setTimeout(r, 80));
    return NT.attrs.length > n0 ? "seen red (" + (NT.attrs.length - n0) + " new samples on a forced change)" : "DID NOT GO RED"; })()`);
  // 6. an audio cue that fires twice IS counted twice
  rp.cues = await C.ev(`(async () => { const NT = window.__NT; const n0 = NT.cues.length;
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < 2; i++) { const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 128, ctx.sampleRate); s.connect(ctx.destination); s.start(); }
    } catch (e) { return "DID NOT GO RED (" + e.message + ")"; }
    await new Promise(r => setTimeout(r, 120));
    return NT.cues.length - n0 === 2 ? "seen red (counted 2 forced cues)" : "DID NOT GO RED (" + (NT.cues.length - n0) + ")"; })()`);
  for (const [k, v] of Object.entries(rp)) log(`redproof ${k}: ${v}`);
  return rp;
}

/* ---------- the solo leg ---------- */
async function soloLeg(url, out) {
  const C = await attach(DBG);
  await C.goto(url); await sleep(1200);
  await C.ev("localStorage.clear(); 1");
  await C.goto(url); await sleep(2500);
  await C.ev(GATE);
  out.stamp = await C.ev(`(document.body.innerText.match(/20\\d\\d-\\d\\d-\\d\\d[a-z]/)||[''])[0]`);
  log("stamp under test:", out.stamp);
  await clickSel(C, "#choiceSolo", "() => true", "solo");
  await sleep(900); await C.ev(GATE);
  const nm = await C.ev(`(() => { const i = document.getElementById("nameModalInput"); if (!i) return false;
    i.value = "Claude"; document.getElementById("btnNameConfirm").click(); return true; })()`);
  log("name entered:", nm);
  const started = await C.waitFor(`(()=>{try{return !!(window.appState&&appState.game&&appState.game.players.some(p=>p.strategy==='human'))}catch(e){return false}})()`, 30000, "solo game start");
  if (!started) { const s = await C.ev(`(async()=>{const m=await import('/src/state/index.js');window.appState=m.appState;return !!(m.appState.game)})()`); log("late appState import:", s); }

  await C.ev(PROBE_SRC);
  await C.ev(BOARD_SAMPLER_SRC(4000));
  await sleep(4200);
  out.board_top = await C.ev(`(() => { const b = window.__NT.boardTop;
    if (!b.length) return { samples: 0, shift_px: null };
    const tops = b.map(x => x[1]);
    return { samples: b.length, first: tops[0], min: Math.min(...tops), max: Math.max(...tops),
      shift_px: Math.round((Math.max(...tops) - Math.min(...tops)) * 10) / 10, trace: b.slice(0, 12) }; })()`);
  log("board top over the first 4s:", JSON.stringify(out.board_top));
  out.pill_visible_at_start = await C.ev(`(() => { const p = document.getElementById("pp4Pill");
    if (!p) return { exists: false };
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    return { exists: true, text: (p.textContent||"").trim().slice(0,60),
      shown: r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > .01 }; })()`);
  log("wind pill at voyage start (host tier):", JSON.stringify(out.pill_visible_at_start));

  out.redproof = await redProof(C);

  // ---- drive the voyage, posing every dock flip for TAILS (§5e, solo only) ----
  await C.ev(`(() => { const g = appState.game; if (!g.__rBase) { g.__rBase = g.r.bind(g);
      g.r = (...a) => (window.__poseTails ? 0.9 : g.__rBase(...a)); } window.__poseTails = false; return true; })()`);
  // §4: sail TOWARD what this captain still needs, or the loop random-walks and never reaches a
  // dock — which is how the first run of this instrument produced no Buy prompt at all in 220 ticks.
  await C.ev(`window.__h = { cellOf: d => [ +d.dataset.gx, +d.dataset.gy ],
    target: () => { const g = appState.game, me = g.players[appState.mySeat], n = g.needs(me);
      return n.length ? (g.islandOf[n[0]] || g.home) : g.home; } }; 1`);
  /* POSE THE STATE INSTEAD OF PLAYING YOUR WAY TO IT (DRIVING-THE-GAME.md §5e, solo only).
     Cases A and D, the ask pill and item 9's Buy-click latency all live at a DOCK, and a captain
     left to sail there on their own took three whole voyages of driving to arrive once. The berth
     is chosen from the engine's own isBerth() next to the island holding this captain's first
     needed ingredient — nothing is invented, and the same pose runs in the before and the after,
     so the two numbers stay comparable. */
  out.posed_dock = await C.ev(`(() => { try { const g = appState.game, me = g.players[appState.mySeat];
    const need = (g.needs(me) || [])[0]; const d = need ? g.dockOf[need] : null;
    if (!d) return { ok: false, why: "no needed ingredient / dock" };
    // ask the ENGINE which square counts as this island's dock rather than deriving it: singleDock
    // makes dockOf[ing] the berth itself, otherwise the berth is a water square beside the island.
    const free = c => !g.players.some(p => p !== me && p.pos && p.pos[0]===c[0] && p.pos[1]===c[1]);
    const cands = [d, [d[0]+1,d[1]], [d[0]-1,d[1]], [d[0],d[1]+1], [d[0],d[1]-1]];
    const hit = cands.find(c => g.portAt(c) === need && free(c));
    if (!hit) return { ok: false, why: "no free berth for " + need, dock: d,
      probe: cands.map(c => [c.join(","), g.portAt(c), free(c)]) };
    me.pos = hit; return { ok: true, pos: me.pos, need, dock: d };
  } catch (e) { return { ok: false, why: String(e.message).slice(0, 120) }; } })()`);
  log("posed at a dock:", JSON.stringify(out.posed_dock));
  await C.ev(`window.__NT.marks.driveStart = window.__NT.now(); 1`);

  const TICK = 600, MAX = 420;
  let buyClickAt = null, evAtBuy = null;
  for (let i = 0; i < MAX; i++) {
    await sleep(TICK);
    const info = await C.ev(`(()=>{try{const g=appState.game;const sw=document.getElementById('statsWrap');
      return {day:g.round, ev:g.events.length, evIdx:appState.evIdx, over:!!(sw&&sw.style.display!=='none'),
        dry:!!g.drySeen, coins:g.players[appState.mySeat].coins};}catch(e){return {err:String(e)}}})()`);
    if (!info || info.err) continue;
    if (info.over) { log("end of voyage at day", info.day); break; }
    if (out.holdsDone && out.pill && out.buy_to_render_ms != null && out.sawFlip) {
      log("every dock-side number captured — stopping the drive at day", info.day); break; }

    // the crate landing: once a Buy click is outstanding, watch for the dock event to be RENDERED
    if (buyClickAt != null) {
      const done = await C.ev(`(() => { const g = appState.game;
        const i = g.events.findIndex((e, i2) => i2 >= ${evAtBuy} && e && e.t === "dock");
        if (i < 0) return null;
        return { evAt: i, rendered: appState.evIdx >= i, now: window.__NT.now(),
          cues: window.__NT.cues.filter(c => c >= ${buyClickAt}).length }; })()`);
      if (done && done.rendered) {
        out.buy_to_render_ms = done.now - buyClickAt;
        out.buy_cue_count = done.cues;
        log(`BUY -> crate landed after ${out.buy_to_render_ms}ms, ${out.buy_cue_count} audio cue(s)`);
        buyClickAt = null;
      } else if (done === null) { buyClickAt = null; }
    }

    // 1. the flip coin — pose TAILS around it
    const coin = await C.ev(`(() => { const c = document.getElementById("flipCoinWrap");
      if (!c || !c.classList.contains("active")) return null; return __gate(c); })()`);
    if (coin) {
      if (coin.ok) { await C.ev("window.__poseTails = true; 1"); await C.click(coin.x, coin.y);
        await sleep(2600); await C.ev("window.__poseTails = false; 1"); out.sawFlip = true;
        if (!out.shots_flip) { await C.shot("e-flip-tails.png"); out.shots_flip = true; } }
      continue;
    }
    // 2. battle buttons
    let r = await clickSel(C, ".btlBtn", "b => b.getAttribute('aria-disabled')!=='true'", "btl");
    if (r.clicked) continue;
    // 3. sail squares — the highlighted one nearest what this captain still needs
    /* The targeting is wrapped because a THROW here reads exactly like "no sail squares" to the
       caller and the captain then never sails at all — which is what the second run of this
       instrument actually did, silently, for a whole voyage. Fall back to the first clickable
       square rather than skipping the turn. */
    const cell = await C.ev(`(() => { const cs = [...document.querySelectorAll(".sailCell")]; if (!cs.length) return null;
      let scored = cs.map(c => ({ c, d: 0 }));
      try { const T = __h.target();
        scored = cs.map(c => { const [x,y] = __h.cellOf(c);
          return { c, d: (isNaN(x)||isNaN(y)) ? 1e8 : Math.abs(x-T[0]) + Math.abs(y-T[1]) }; })
          .sort((a,b) => a.d - b.d);
      } catch (e) { window.__NT.targetErr = String(e.message).slice(0, 80); }
      for (const s of scored) { const g = __gate(s.c); if (g.ok) return g; } return { ok: false }; })()`);
    if (cell) { if (cell.ok) await C.click(cell.x, cell.y); continue; }
    // 4. the action / buy menu
    const menu = await C.ev(`(() => { const bs = [...document.querySelectorAll("#actionPanel .apBtn")]
        .filter(b => !/back|←|‹/i.test(b.textContent) && b.getAttribute("aria-disabled") !== "true");
      if (!bs.length) return null;
      return bs.map(b => ({ t: b.textContent.trim().slice(0, 28), g: __gate(b) })); })()`);
    if (menu && menu.length) {
      const live = menu.filter(m => m.g.ok);
      if (!live.length) continue;
      /* THE HOLDS ARE MEASURED HERE, AND THE PLACE IS THE POINT. The first attempt measured them
         four seconds into the voyage, while the Ahoy centre-stage card was up — and enterCenterStage
         retires the live bubble on EVERY tick (stage.js), so all three anchors read ~300ms: the
         fade tail alone. The instrument was measuring the card, not the hold. A live ACTION MENU is
         the quiet state: the game is blocked on the captain's own answer, nothing else narrates,
         and no centre-stage card is up to hurry a bubble away. */
      if (!out.holdsDone && live.some(m => /dock|pass|trade|anchor|attack/i.test(m.t))
          && !(await C.ev(`!!document.querySelector("#pp4Prompt.pp4Center")`))) {
        out.holdsDone = true; out.holds = {}; out.holds_detail = {};
        out.holds_measured_at = "human action menu, no centre-stage card";
        for (const [k, t] of Object.entries(HOLD_TEXTS)) {
          const m = await measureHoldTwice(C, k, t, 8000);
          if (m) { out.holds[k] = m.life_ms != null ? m.life_ms : m.hold_ms; out.holds_detail[k] = m; }
          log(`hold ${k} (${t.length} chars):`, JSON.stringify(m));
        }
      }
      const isBuy = live.find(m => /^buy/i.test(m.t));
      if (isBuy && out.pill == null) {
        out.pill = await C.ev(PILL_PROBE_SRC);
        log("ask pill at the Buy prompt:", JSON.stringify(out.pill));
        await C.shot("e-buy-prompt.png");
      }
      // Dock is what this instrument is here for (cases A and D, the pill, the crate cue), so it
      // outranks everything; Trade is a multi-step flow that eats whole days and is taken last.
      const pool = live.filter(m => !/anchor/i.test(m.t));
      const base = pool.length ? pool : live;
      const noTrade = base.filter(m => !/trade|hail/i.test(m.t));
      const pick = base.find(m => /^buy/i.test(m.t)) || base.find(m => /dock/i.test(m.t))
        || (noTrade.length ? noTrade : base)[0];
      if (/^buy/i.test(pick.t)) {
        const t = await C.ev("window.__NT.now()");
        buyClickAt = t; evAtBuy = info.ev;
      }
      await C.click(pick.g.x, pick.g.y);
      continue;
    }
  }

  // ---- read the whole bubble ledger back and classify it ----
  out.bubbles = await C.ev(`(() => window.__NT.bubbles.map(b => ({ text: b.text, chars: b.chars,
    created: b.created_ms, out: b.out_ms, removed: b.removed_ms, occluded: b.occluded_ms,
    ambient: b.ambient, veiled: b.veiled_at_birth, stack: b.stack })))()`);
  out.attrs_tail = await C.ev(`(() => window.__NT.attrs.slice(-40))()`);
  out.blackmarket_solo = await C.ev(`(() => { const g = appState.game;
    return { drySeen: !!g.drySeen, dryEvents: g.events.filter(e => e && e.firstDry).length,
      dryBySeat: g.events.filter(e => e && e.firstDry).map(e => ({ seat: e.p, human: g.players[e.p].strategy === "human" })) }; })()`);

  /* ---- HIS ITEM 7: does a BOT emptying the first shelf reach the ceremony? -----------------
     Driven, not code-derived, but stated exactly for what it is: the real bot narration path
     (botBeat -> narrateCurrent -> eventCeremony -> the onDryCeremony handler -> panel.js's
     dryCeremony) is run against a real firstDry dock event injected at DRIVING-THE-GAME §5e,
     rather than a thirty-turn voyage played until a bot happens to claim a shelf. It exercises
     every link in the converged chain. It does NOT prove the engine stamps firstDry correctly —
     that is unchanged code and is measured headlessly over 500 games in the debug document.
     RED-PROOFED IN PLACE: the same injection is run first with the handler unregistered, which
     must show no card. A sampler that cannot go red is not believed. */
  out.blackmarket = await C.ev(`(async () => {
    const g = appState.game, ui = await import("/src/ui/index.js");
    const botSeat = g.players.findIndex(p => p.strategy !== "human");
    const h = (await import("/src/ui/handlers.js")).netHandlers();
    const real = h.onDryCeremony;
    // narrateCurrent() ALONE is the precise unit under test: it is the bot narration path, and it
    // is the function that had no knowledge of firstDry. botBeat() is just onLiveRender() + this,
    // and onLiveRender would try to draw a board state a synthetic event does not describe.
    const fire = async () => {
      g.events.push({ t: "dock", p: botSeat, ing: "sugar", heads: 1, got: "bought", price: 1, black: 0, wentDry: 1, firstDry: 1 });
      appState.evIdx = g.events.length - 1;
      appState.logLines[appState.evIdx] = { txt: "A bot buys the last crate." };
      await Promise.race([ ui.narrateCurrent(), new Promise(r => setTimeout(r, 6000)) ]);
      const card = document.getElementById("bmCerGo");
      const seen = !!card && card.getBoundingClientRect().width > 4;
      if (card) card.click();
      await new Promise(r => setTimeout(r, 400));
      return seen;
    };
    h.onDryCeremony = undefined;                    // RED
    const red = await fire();
    h.onDryCeremony = real;                         // GREEN
    const green = await fire();
    return { bot_seat: botSeat, bot_is_bot: g.players[botSeat].strategy !== "human",
      redproof_no_handler_shows_nothing: red === false,
      bot_first_ceremony_shown: green,
      handler_registered: typeof real === "function" };
  })()`);
  log("black market (bot path):", JSON.stringify(out.blackmarket));
  if (out.blackmarket && out.blackmarket.bot_first_ceremony_shown) {
    // re-fire once purely to photograph it, then dismiss
    await C.ev(`(async () => { const g = appState.game, ui = await import("/src/ui/index.js");
      const b = g.players.findIndex(p => p.strategy !== "human");
      g.events.push({ t:"dock", p:b, ing:"sugar", heads:1, got:"bought", price:1, black:0, wentDry:1, firstDry:1 });
      appState.evIdx = g.events.length - 1;
      appState.logLines[appState.evIdx] = { txt: "A bot buys the last crate." };
      ui.narrateCurrent(); return true; })()`);
    await sleep(2500); await C.shot("e-blackmarket-bot.png");
    await C.ev(`(() => { const b = document.getElementById("bmCerGo"); if (b) b.click(); return true; })()`);
    await sleep(600);
  }

  /* ---- HIS ITEM 3: one storm, posed so a ship really is blocked by another ship ------------
     §5e posing, solo only. Two captains are placed one square apart along the storm's own push
     direction and the round's weather is forced, so the collision is certain rather than waited
     for. `inline_lines` counts narration bubbles raised BETWEEN the storm starting and its
     summary landing — the thing Wyatt saw as "it described player actions one by one". */
  out.storm = await C.ev(`(async () => {
    const g = appState.game, ui = await import("/src/ui/index.js");
    const mark = window.__NT.bubbles.length;
    /* WHY THE OBVIOUS POSE DOES NOT WORK, recorded so nobody re-derives it. stormOrder() resolves
       ships FURTHEST DOWNWIND FIRST, precisely so a lead ship clears its square before the one
       behind arrives (rule 7b). Two adjacent ships along the push direction therefore do NOT
       collide — the leader moves off first. A follower is only ever blocked when the LEADER
       CANNOT MOVE. So the leader is placed hard against land in the push direction (it takes the
       landHeld anchor) and the follower is placed one square behind it. */
    const water = ([x,y]) => x>0 && y>0 && x<15 && y<15 &&
      !g.blocked([x,y]) && !g.isIsland([x,y]) && !g.isHome([x,y]) && !g.onRim([x,y]);
    const wall  = ([x,y]) => g.blocked([x,y]) || g.isIsland([x,y]) || g.isHome([x,y]);
    let lead = null;
    for (let x = 1; x < 15 && !lead; x++) for (let y = 2; y < 15; y++) {
      if (water([x,y]) && wall([x, y-1]) && water([x, y+1])) { lead = [x,y]; break; }
    }
    if (!lead) return { posed: false, why: "no water square with land to its north and water behind" };
    g.players[0].pos = [lead[0], lead[1]];          // pinned by land to the north
    g.players[1].pos = [lead[0], lead[1] + 1];      // one behind, will find a hull dead ahead
    for (let i = 2; i < g.players.length; i++) g.players[i].pos = [g.home[0], g.home[1]];
    for (const p of g.players) p.stormNote = null;
    const before = g.events.length;
    await ui.runStormLive("N");
    const raised = window.__NT.bubbles.slice(mark);
    const evs = g.events.slice(before);
    const sum = evs.filter(e => e.t === "stormSummary").pop() || null;
    const blocked = evs.filter(e => e.t === "blocked");
    const named = sum ? new Set([...(sum.moved||[]),...(sum.held||[]),...(sum.shipHeld||[]),...(sum.blown||[])]) : new Set();
    // "one line per captain" is what he complained about. A bubble raised during the storm that is
    // not the summary is exactly that. Texts are reported too, so the count can be read, not trusted.
    const isSummary = t => /storm (drives|hurls)|a gale tears/i.test(t);
    const inline = raised.filter(b => !isSummary(b.text));
    return { posed: true, lead: lead, blocked_events: blocked.length,
      inline_lines: inline.length,
      inline_texts: inline.map(b => b.text.slice(0, 70)),
      bubbles_raised: raised.length,
      summary_line: (raised.filter(b => isSummary(b.text)).pop() || {}).text || null,
      shipHeld: sum ? (sum.shipHeld || null) : null,
      blocked_captains_in_summary: blocked.length ? blocked.every(b => named.has(b.p)) : null };
  })()`);
  log("storm (posed, one collision):", JSON.stringify(out.storm));
  await C.shot("e-storm-summary.png");

  /* ---- D-35: the recipe modal, measured at this leg's width ------------------------------- */
  out.recipe_card = out.recipe_card || {};
  out.recipe_card["w" + W] = await C.ev(RECIPE_PROBE_SRC);
  log("recipe card at " + W + ":", JSON.stringify(out.recipe_card["w" + W]));
  if (out.recipe_card["w" + W] && !out.recipe_card["w" + W].missing) await C.shot("e-recipe-" + W + ".png");
  await C.ev(`(() => { const b = document.querySelector("#recipeModal .apBtn, #recipeModalClose, .recipeModalClose"); if (b) b.click(); return true; })()`);

  out.consoleErrors = C.errs.slice(0, 10);
  await C.shot("e-solo-final.png");
  return out;
}

/* classify the bubble ledger into the four named cases */
function classify(bubbles) {
  const cases = {};
  const put = (k, b) => {
    if (!b) return;
    const selfretire = b.out != null ? b.out - b.created : null;
    const life = b.removed != null ? b.removed - b.created : null;
    const rowIsWorse = cases[k] && cases[k].selfretire_ms != null &&
      (selfretire == null || selfretire >= cases[k].selfretire_ms);
    if (cases[k] && rowIsWorse) return;                    // keep the WORST (fastest self-retire)
    cases[k] = { text: b.text, chars: b.chars, selfretire_ms: selfretire, life_ms: life,
      occluded_ms: b.occluded, visible_ms: life != null ? life - b.occluded : null,
      veiled_at_birth: b.veiled, ambient: b.ambient, stack: b.stack ? b.stack.slice(0, 200) : null };
  };
  for (const b of bubbles) {
    const t = (b.text || "");
    if (/\bflips?\b.*\b(HEADS|TAILS)\b/i.test(t)) put("A", b);               // the flip result
    else if (/battle'?s brewin|crow'?s nest/i.test(t)) put("B", b);          // the crow's-nest call
    else if (/what'?ll ye do/i.test(t)) put("C", b);                         // the post-sail menu
    else if (/a turn on the docks\.?\s*Buy|TREASURE!\s*Buy/i.test(t)) put("D", b);   // the dock buy mirror
    else if (/is deciding|choosing where to sail/i.test(t)) put("wait", b);
  }
  return cases;
}

/* ---------- the crew leg: the same three holds, on a real guest ---------- */
async function crewLeg(out) {
  const [p2, dh, dg] = CREW.map(Number);
  const url = serve(p2);
  launch(dh, path.join(OUT, "prof-host"));
  launch(dg, path.join(OUT, "prof-guest"));
  await sleep(2000);
  const Host = await attach(dh, { w: 1200, h: 950 });
  const Guest = await attach(dg, { w: 1200, h: 950 });
  const boot = async (C, tag) => {
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, tag + " load");
    // 5c: same-origin tabs share localStorage — each client needs its OWN pp_id
    await C.ev(`localStorage.clear();localStorage.setItem('pp_id','${tag}-'+Math.floor(Math.random()*1e9));true`);
    await C.goto(url);
    await C.waitFor(`document.readyState==='complete'`, 30000, tag + " reload");
    await sleep(1200);
  };
  // D-37: crew QA plays as test1/test2 so any future player-data analysis can filter it out.
  await boot(Host, "host");
  await Host.waitFor(`(()=>{const e=document.getElementById('choiceHost');return !!(e&&e.offsetParent)})()`, 25000, "Host a Crew");
  await Host.ev(`document.getElementById('choiceHost').click();true`); await sleep(900);
  await Host.ev(`(()=>{const m=document.getElementById('nameModalInput'); if(!m)return false;
    m.value='test1'; document.getElementById('btnNameConfirm').click(); return true;})()`); await sleep(1000);
  await Host.ev(`(()=>{const b=document.getElementById('btnCreate'); if(b){b.click();return true} return false})()`); await sleep(1500);
  const code = await Host.ev(`(document.getElementById('roomCode')||{}).textContent`);
  log("room code:", code);
  if (!code || !/^[A-Z0-9]{4,6}$/.test(code.trim())) { log("crew leg: no room code — skipping"); return; }

  await boot(Guest, "guest");
  await Guest.waitFor(`(()=>{const e=document.getElementById('choiceJoin');return !!(e&&e.offsetParent)})()`, 25000, "Join a Crew");
  await Guest.ev(`document.getElementById('choiceJoin').click();true`); await sleep(900);
  await Guest.ev(`(()=>{const m=document.getElementById('nameModalInput'); if(!m)return false;
    m.value='test2'; document.getElementById('btnNameConfirm').click(); return true;})()`); await sleep(1000);
  await Guest.ev(`(()=>{const j=document.getElementById('joinCode'); if(!j)return false;
    j.value=${JSON.stringify(code.trim())}; const n=document.getElementById('joinName'); if(n)n.value='test2';
    document.getElementById('btnJoin').click(); return true;})()`); await sleep(3500);
  /* §3b: "Start the voyage!" is NOT the button that starts the voyage. #btnStart opens a
     confirmation and #btnConfirmStart is what begins the game — a probe that clicks the first and
     then waits sits on the lobby screen with no error, which is exactly what the first run of this
     leg did (guest game up: false, three null holds, forty seconds of nothing). */
  await Host.ev(`(()=>{const b=document.getElementById('btnStart'); if(b){b.click();return true} return false})()`);
  await sleep(1200);
  await Host.waitFor(`(()=>{const b=document.getElementById('btnConfirmStart');return !!(b&&b.getBoundingClientRect().width>10)})()`, 15000, "confirm-start");
  await Host.ev(`(()=>{const b=document.getElementById('btnConfirmStart'); if(b){b.click();return true} return false})()`);
  await sleep(2500);
  // appState is a module export, not a global — import it before asking whether the game exists
  const bindState = C => C.ev(`(async()=>{try{const m=await import('/src/state/index.js');window.appState=m.appState;return !!m.appState}catch(e){return false}})()`);
  await bindState(Host); await bindState(Guest);
  const up = await Guest.waitFor(`(async()=>{const m=await import('/src/state/index.js');window.appState=m.appState;return !!(m.appState&&m.appState.game)})()`, 60000, "guest game");
  log("guest game up:", up);
  /* Both clients are driven THROUGH THE INTRO and then stopped. The recipe picker takes two taps a
     card (§3c) and the Ahoy barrier takes one, and none of that can be measured through — a hold
     taken while a centre-stage card is up measures the card, not the hold. The drivers are then
     switched off so the game is blocked on somebody's answer: the quiet state. */
  await driver(Host, GAME_PATH); await driver(Guest, GAME_PATH);
  await sleep(45000);
  await driverOff(Host); await driverOff(Guest);
  await sleep(2500);
  log("crew state after the intro:", JSON.stringify({
    host: await Host.ev(`(()=>{const g=appState.game;return g?{round:g.round,ev:g.events.length,centre:!!document.querySelector('#pp4Prompt.pp4Center')}:null})()`),
    guest: await Guest.ev(`(()=>{const g=appState.game;return g?{round:g.round,ev:g.events.length,centre:!!document.querySelector('#pp4Prompt.pp4Center')}:null})()`) }));
  await Host.ev(PROBE_SRC); await Guest.ev(PROBE_SRC);
  await Guest.shot("e-crew-guest.png"); await Host.shot("e-crew-host.png");

  out.pill_guest = await Guest.ev(`(() => { const p = document.getElementById("pp4Pill");
    if (!p) return { exists: false };
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    return { exists: true, text: (p.textContent||"").trim().slice(0,60),
      shown: r.width>0 && r.height>0 && cs.display!=="none" && cs.visibility!=="hidden" && +cs.opacity>.01 }; })()`);
  log("wind pill on the GUEST:", JSON.stringify(out.pill_guest));

  out.holds_guest = {}; out.holds_host_crew = {};
  for (const [k, t] of Object.entries(HOLD_TEXTS)) {
    const mg = await measureHoldTwice(Guest, k, t, 9000);
    if (mg) out.holds_guest[k] = mg.life_ms != null ? mg.life_ms : mg.hold_ms;
    const mh = await measureHoldTwice(Host, k, t, 9000);
    if (mh) out.holds_host_crew[k] = mh.life_ms != null ? mh.life_ms : mh.hold_ms;
    log(`crew hold ${k}: guest ${JSON.stringify(mg)} host ${JSON.stringify(mh)}`);
  }
  out.crew_bubbles_guest = await Guest.ev(`(() => window.__NT.bubbles.slice(-25).map(b => ({ text: b.text,
    created: b.created_ms, out: b.out_ms, removed: b.removed_ms })))()`);
  // NOT driven to the end of voyage: writeGameLog's rows are permanent (D-37 / 2026-08-21).
  log("crew leg complete — the room is left mid-voyage on purpose");
}

/* ---------- main ---------- */
const out = { started: new Date().toISOString(), W, H, cases: {}, holds: {}, pill: null,
  board_top: null, buy_to_render_ms: null, redproof: {} };
try {
  if (!CREWONLY) {
    const url = serve(PORT);
    launch(DBG, path.join(OUT, "prof-solo"));
    await sleep(1800);
    await soloLeg(url, out);
    out.cases = classify(out.bubbles || []);
    log("cases:", JSON.stringify(out.cases, null, 1).slice(0, 1200));
  }
  if (CREW) { try { await crewLeg(out); } catch (e) { log("crew leg failed:", String(e).slice(0, 200)); out.crew_error = String(e).slice(0, 200); } }
} catch (e) {
  log("FATAL:", String(e && e.stack || e).slice(0, 500));
  out.fatal = String(e && e.message || e).slice(0, 300);
}
out.finished = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "narration-timeline.json"), JSON.stringify(out, null, 2));
if (JSONOUT) {
  /* THE TWO LEGS COMPLETE ONE FILE, THEY DO NOT REPLACE EACH OTHER. The solo leg and the crew leg
     are different browsers and cannot run in one page. The first version of this merge used a bare
     Object.assign and the crew pass wrote its own EMPTY `cases: {}` straight over the four driven
     cases the solo pass had just measured — a whole leg's numbers deleted with nothing reported.
     So an empty object, an empty array and a null never overwrite anything. */
  let merged = out;
  if (fs.existsSync(JSONOUT)) {
    merged = JSON.parse(fs.readFileSync(JSONOUT, "utf8"));
    for (const [k, v] of Object.entries(out)) {
      const empty = v == null || (Array.isArray(v) && !v.length)
        || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
      if (!empty || !(k in merged)) merged[k] = v;
    }
  }
  fs.writeFileSync(JSONOUT, JSON.stringify(merged, null, 2));
}
log("written:", JSONOUT || path.join(OUT, "narration-timeline.json"));
killAll();
process.exit(0);
