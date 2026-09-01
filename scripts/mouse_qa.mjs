// mouse_qa.mjs — play a SOLO voyage with REAL mouse events, clicking only what is visibly on screen.
// Every click: Input.dispatchMouseEvent at the element's screen centre, gated by an on-screen +
// unoccluded check (inside viewport, inside body's rect, elementFromPoint hits the element).
// A button that exists but fails that gate is a FINDING, never a click. Screenshot per action.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { REPO, CHROME, LINUX_ARGS, gameURL, PYTHON } from "./lib/chrome.mjs";   // one resolver for every driver
const OUT = process.argv[2] || path.join(process.cwd(), "mouse-qa-shots");
const W = +(process.argv[3] || 1400), H = +(process.argv[4] || 900);
const PORT = +(process.argv[5] || 8477), DBG = +(process.argv[6] || 9377);
const HEADED = process.argv[7] === "headed";           // only when Wyatt ASKS to watch (2026-08-21: he prefers invisible runs)
const MUTE = process.argv[8] !== "sound";              // ALWAYS muted unless explicitly asked — his speakers are in the room
const MAX_MS = 25 * 60 * 1000, TICK = 700, MAX_SHOTS = 170;   // a 15-day voyage used ~90 by day 9 — keep room for the end card
const PROFILE = path.join(OUT, "profile");
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => { const s = `[${new Date().toISOString().slice(11,19)}] ` + a.join(" "); console.log(s); fs.appendFileSync(path.join(OUT,"log.txt"), s+"\n"); };

// --- serve + launch ---------------------------------------------------------
const srv = spawn(PYTHON, ["-m", "http.server", String(PORT)], { cwd: REPO, stdio: "ignore" });
const chromeArgs = [...LINUX_ARGS, ...(HEADED ? [] : ["--headless=new"]), ...(MUTE ? ["--mute-audio"] : []), `--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", `--window-size=${W},${H}`, "--autoplay-policy=no-user-gesture-required", "about:blank"];
// HEADED: launch through LaunchServices so the window belongs to the GUI session (a Chrome spawned from a
// background shell is not guaranteed to ever appear on screen — 2026-08-21, Wyatt never saw one). Headless
// runs spawn directly as before.
const chrome = HEADED
  ? (execSync(`open -na "Google Chrome" --args ${chromeArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`), { kill() {} })
  : spawn(CHROME, chromeArgs, { stdio: "ignore" });
const killAll = () => { try { chrome.kill("SIGKILL"); } catch {} try { srv.kill("SIGKILL"); } catch {}
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`); } catch {} try { execSync(`pkill -f "http.server ${PORT}"`); } catch {} };
process.on("exit", killAll); process.on("SIGINT", () => { killAll(); process.exit(1); });
await sleep(1500);
let tgt; for (let i = 0; i < 20 && !tgt; i++) { try { tgt = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await sleep(300); } }
if (!tgt) { log("FATAL: chrome never came up"); killAll(); process.exit(1); }
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const consoleErrs = [];
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") consoleErrs.push("EXC " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "").slice(0, 200));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrs.push("ERR " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text }; return r.result?.result?.value; };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

let shots = 0;
const shot = async (label) => { if (shots >= MAX_SHOTS) return; const r = await send("Page.captureScreenshot", { format: "png" });
  const f = path.join(OUT, `${String(++shots).padStart(3,"0")}-${label.replace(/[^a-z0-9]+/gi,"-").slice(0,40)}.png`); fs.writeFileSync(f, Buffer.from(r.result.data, "base64")); return f; };

// --- the visibility gate (in-page) -----------------------------------------
const GATE = `window.__gate = (el) => {
  if (!el) return {ok:false, why:'no element'};
  const r = el.getBoundingClientRect(); const b = document.body.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  if (r.width < 4 || r.height < 4) return {ok:false, why:'zero size', r:[r.left,r.top,r.width,r.height]};
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return {ok:false, why:'outside viewport', r:[r.left,r.top,r.width,r.height]};
  if (r.left < b.left - 1 || r.right > b.right + 1) return {ok:false, why:'outside body column', r:[r.left,r.top,r.width,r.height], body:[b.left,b.right]};
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return {ok:false, why:'occluded by '+(hit? (hit.id||hit.className||hit.tagName):'nothing'), r:[r.left,r.top,r.width,r.height]};
  return {ok:true, x:cx, y:cy, r:[r.left,r.top,r.width,r.height]};
};`;
const findings = []; const acts = [];
// grace + dedupe: a condition must PERSIST for GRACE consecutive ticks before it is a finding (intros,
// card animations and reveals legitimately produce zero-size buttons for a second or two), and each
// distinct condition is recorded once, with a count of how many ticks it held.
const GRACE = 4; const pending = new Map(); const seen = new Map();
const finding = async (sev, what) => {
  const key = what.replace(/\d+/g, "#");
  const n = (pending.get(key) || 0) + 1; pending.set(key, n);
  // zero-size is how the ceremony/intro animations park a button for a few seconds — give those longer
  if (n < (/zero size/.test(key) ? GRACE * 3 : GRACE)) return false;
  if (seen.has(key)) { seen.get(key).ticks++; return true; }
  const f = await shot("FINDING-" + what); const rec = { sev, what, shot: f, t: Date.now(), ticks: n }; seen.set(key, rec); findings.push(rec);
  log(`FINDING[${sev}] (held ${n} ticks) ${what} -> ${f}`); return true; };
const clearPending = (prefix) => { for (const k of [...pending.keys()]) if (k.startsWith(prefix)) pending.delete(k); };
// a drawn cursor so a human watching the window can see where the mouse is (CDP input moves no OS cursor)
const CURSOR = `window.__cur = (x,y,down) => { let c=document.getElementById('__cur'); if(!c){ c=document.createElement('div'); c.id='__cur';
  c.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;margin:-4px 0 0 -4px;border-radius:50%;border:3px solid #ff2d55;background:rgba(255,45,85,.25);box-shadow:0 0 0 2px #fff;transition:left .12s,top .12s,transform .08s';
  document.documentElement.appendChild(c);} /* NOT body: body.pp4Stage is transformed (item 22) and would shift a fixed child by the column offset — the very bug the game just had */
  c.style.left=x+'px'; c.style.top=y+'px'; c.style.transform=down?'scale(.6)':'scale(1)'; };`;
const cur = (x, y, down) => ev(`(window.__cur||(()=>{}))(${x},${y},${!!down})`);
const mouseClick = async (x, y) => {
  await cur(x, y, false); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); if (HEADED) await sleep(350);
  await cur(x, y, true);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await cur(x, y, false); };
// click by selector (first match passing the gate among candidates filtered by fn)
const clickSel = async (selector, filterSrc = "() => true", label = selector) => {
  const g = await ev(`(() => { const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(${filterSrc});
     if (!els.length) return {none:true};
     const tries = els.map(el => ({txt:(el.textContent||el.id||'').trim().slice(0,30), g: __gate(el)}));
     const ok = tries.find(t => t.g.ok); return {ok: !!ok, pick: ok, tries}; })()`);
  if (!g || g.none) return { none: true };
  if (!g.ok) { await finding("RED", `${label}: ${g.tries.length} candidate(s) exist but NONE clickable on screen: ` + g.tries.map(t => `${t.txt}[${t.g.why}]`).join("; ")); return { blocked: true, tries: g.tries }; }
  clearPending(label + ":");
  await mouseClick(g.pick.g.x, g.pick.g.y); acts.push(label + ":" + g.pick.txt); return { clicked: g.pick.txt, at: [g.pick.g.x, g.pick.g.y] }; };

// --- boot -------------------------------------------------------------------
await send("Page.navigate", { url: gameURL(PORT) }); await sleep(2500);
await ev("localStorage.clear(); 1"); await send("Page.navigate", { url: gameURL(PORT) }); await sleep(3000);
await ev(GATE); await ev(CURSOR); await ev("document.title='🤖 CLAUDE IS USING THIS — ' + document.title; 1");
if (HEADED) { // prove there is a real window, and put it in front — log the evidence rather than assuming it
  try { const wt = await send("Browser.getWindowForTarget", {}); const b = wt.result?.bounds;
    // the test window opened at top:1140 — off the main display. Pin it where he is looking.
    if (wt.result) await send("Browser.setWindowBounds", { windowId: wt.result.windowId, bounds: { windowState: "normal", left: 60, top: 40, width: W, height: H } });
    await send("Page.bringToFront"); const wt2 = await send("Browser.getWindowForTarget", {});
    log("VISIBLE WINDOW:", JSON.stringify(wt2.result?.bounds), "title:", await ev("document.title"));
  } catch (e) { log("window check failed:", String(e)); } }
log("stamp:", await ev("(document.body.innerText.match(/20\\d\\d-\\d\\d-\\d\\d[a-z]/)||[''])[0]"));
await shot("welcome");
let r = await clickSel("#choiceSolo", "() => true", "choiceSolo"); log("solo card:", JSON.stringify(r)); await sleep(900);
await ev(GATE);
r = await clickSel("#nameModalInput", "() => true", "nameInput");
if (r.at) { await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.at[0], y: r.at[1], button: "left", clickCount: 3 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.at[0], y: r.at[1], button: "left", clickCount: 3 }); }
await send("Input.insertText", { text: "Claude" });
await shot("name-modal");
r = await clickSel("#btnNameConfirm", "() => true", "nameConfirm"); log("name confirm:", JSON.stringify(r));
let started = false; for (let i = 0; i < 40 && !started; i++) { await sleep(500);
  started = await ev("(()=>{try{return !!(window.appState&&appState.game&&appState.game.players.some(p=>p.strategy==='human'))}catch(e){return false}})()"); }
if (!started) { const st = await ev("(async()=>{const m=await import('/src/state/index.js');window.appState=m.appState;return !!(m.appState.game&&m.appState.game.players.some(p=>p.strategy==='human'))})()"); started = !!st; }
log("solo started:", started); await shot("game-start");
if (!started) { await finding("RED", "solo game did not start after name confirm"); killAll(); process.exit(2); }

// --- the turn loop ----------------------------------------------------------
const t0 = Date.now(); let lastDay = -1, lastEv = -1, idle = 0, tick = 0;
// .sailCell is an HTML div now (flow.js:497) carrying data-gx/data-gy (flow.js:512) — §4c's SVG inversion is stale
const helpers = `window.__h = { cellOf: d => [ +d.dataset.gx, +d.dataset.gy ],
  target: () => { const g=appState.game, me=g.players[appState.mySeat], n=g.needs(me); return n.length ? (g.islandOf[n[0]]||g.home) : g.home; } };`;
await ev(helpers); await ev(GATE); await ev(CURSOR);
while (Date.now() - t0 < MAX_MS) {
  tick++; await sleep(TICK);
  const info = await ev(`(()=>{try{const g=appState.game;const sw=document.getElementById('statsWrap');
    return {day:g.round, ev:(g.log||g.events||[]).length, over: !!(sw&&getComputedStyle(sw).display!=='none'), seat:appState.mySeat,
      coins:g.players[appState.mySeat].coins, hold:g.players[appState.mySeat].ing.length, turn:g.turn, active:g.players[g.turn]&&g.players[g.turn].name};}catch(e){return {err:String(e)}}})()`);
  if (!info || info.err) { log("state read err", JSON.stringify(info)); continue; }
  if (info.day !== lastDay) { lastDay = info.day; await shot(`day${info.day}`); log(`DAY ${info.day} coins=${info.coins} hold=${info.hold} active=${info.active}`); }
  if (info.over) { log("END OF VOYAGE reached at day", info.day); await shot("end-of-voyage-card");
    // exercise the new card: scroll, then a mouse drag down to park, then a click to restore
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: W/2, y: H/2, deltaX: 0, deltaY: 400 }); await sleep(600); await shot("eov-scrolled");
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: W/2, y: H/2, deltaX: 0, deltaY: -800 }); await sleep(400);
    const g = await ev("(()=>{const el=document.getElementById('statsWrap'); const r=el.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+Math.min(40,r.height/4)};})()");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: g.x, y: g.y, button: "left", clickCount: 1 });
    for (let s = 1; s <= 12; s++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: g.x, y: g.y + s * 40, button: "left", buttons: 1 }); await sleep(30); }
    await shot("eov-mid-drag");
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: g.x, y: g.y + 480, button: "left", clickCount: 1 }); await sleep(900); await shot("eov-parked");
    const p = await ev("(()=>{const el=document.getElementById('statsWrap'); const r=el.getBoundingClientRect(); const c=document.getElementById('pp4Cap'); const cr=c?c.getBoundingClientRect():null; return {card:[r.top,r.height], cap: cr?[cr.top,cr.height]:null};})()");
    log("parked geometry:", JSON.stringify(p));
    await mouseClick(g.x, (p.card ? p.card[0] + 20 : g.y + 480)); await sleep(900); await shot("eov-restored");
    break; }
  // 1. flip coin
  let rr = await clickSel("#flipCoinWrap.active", "() => true", "flipCoin"); if (rr.clicked || rr.blocked) { await shot("flip"); continue; }
  // 2. battle buttons
  rr = await clickSel(".btlBtn", "b => !/back|←|‹/i.test(b.textContent)", "battleBtn"); if (rr.clicked || rr.blocked) { await shot("battle"); continue; }
  // 3. sail window: the highlighted square nearest the target
  const cells = await ev(`(()=>{const cs=[...document.querySelectorAll('.sailCell')]; if(!cs.length) return null; const T=__h.target(); let best=0,bd=1e9;
     cs.forEach((c,i)=>{const [x,y]=__h.cellOf(c); const d=(isNaN(x)||isNaN(y))?1e8:Math.abs(x-T[0])+Math.abs(y-T[1]); if(d<bd){bd=d;best=i;}});
     const g=__gate(cs[best]); return {n:cs.length, best, g, gx:cs[best].dataset.gx, gy:cs[best].dataset.gy};})()`);
  if (cells) { if (!cells.g.ok) { await finding("RED", `sail square exists but not clickable: ${cells.g.why}`); continue; }
    clearPending("sail"); await mouseClick(cells.g.x, cells.g.y); acts.push(`sail(${cells.gx},${cells.gy})`); await shot("sail-click"); continue; }
  // 4. action menu: prefer dock/fish, never back, avoid anchor unless alone
  const menu = await ev(`(()=>{const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>!/back|←|‹/i.test(b.textContent)); if(!bs.length) return null;
     const vis = bs.map(b=>({t:b.textContent.trim().slice(0,24), g:__gate(b), dis: b.disabled||b.classList.contains('disabled')||b.getAttribute('aria-disabled')==='true'}));
     return vis;})()`);
  if (menu && menu.length) {
    const live = menu.filter(m => !m.dis);
    const notOk = live.filter(m => !m.g.ok);
    if (notOk.length) await finding(live.every(m => !m.g.ok) ? "RED" : "AMBER", `action buttons not clickable on screen: ` + notOk.map(m => `${m.t}[${m.g.why}]`).join("; "));
    else clearPending("action buttons");
    const pool = live.filter(m => m.g.ok); if (!pool.length) { idle++; continue; }
    const noAnchor = pool.filter(m => !/anchor/i.test(m.t)); const p2 = noAnchor.length ? noAnchor : pool;
    const pick = p2.find(m => /dock/i.test(m.t)) || p2.find(m => /fish/i.test(m.t)) || p2[0];
    await mouseClick(pick.g.x, pick.g.y); acts.push(pick.t); await shot("act-" + pick.t); continue; }
  // nothing to do: bot turn / narration. Wyatt's item 2: are narration bubbles tethered to their ship?
  // The moment a NEW subject bubble (.pp4Bub with a .pp4Tail) is on screen, take a full shot AND a
  // close-up clip around it so the tail's aim can be judged by eye.
  const bub = await ev(`(()=>{const b=document.querySelector('.pp4Bub:not(.ambient)'); if(!b) return null; const t=b.querySelector('.pp4Tail'); if(!t) return null;
     const r=b.getBoundingClientRect(), tr=t.getBoundingClientRect(); return {txt:(b.textContent||'').trim().slice(0,40), r:[r.left,r.top,r.width,r.height], tail:[tr.left,tr.top,tr.width,tr.height]};})()`);
  if (bub && bub.txt && bub.txt !== globalThis.__lastBub && (globalThis.__bubShots = (globalThis.__bubShots||0)) < 10) {
    globalThis.__lastBub = bub.txt; globalThis.__bubShots++;
    await shot("bubble-" + bub.txt.slice(0, 18));
    const cx = bub.r[0] + bub.r[2]/2, cy = bub.r[1] + bub.r[3]/2, half = 180;
    const clip = { x: Math.max(0, cx-half), y: Math.max(0, cy-half), width: half*2, height: half*2, scale: 2 };
    const rr = await send("Page.captureScreenshot", { format: "png", clip });
    if (rr.result) fs.writeFileSync(path.join(OUT, `${String(++shots).padStart(3,"0")}-bubble-zoom.png`), Buffer.from(rr.result.data, "base64"));
    log(`bubble "${bub.txt}" box=${bub.r.map(Math.round)} tail=${bub.tail.map(Math.round)}`); }
  idle++; if (idle % 12 === 0) await shot(`bots-${info.active}`);
  if (info.ev !== lastEv) { lastEv = info.ev; idle = 0; }
  if (idle > 240) { await finding("RED", `no prompt and no new events for ${(idle*TICK/1000)|0}s — stuck? active=${info.active}`); break; }
}
log("done. ticks=" + tick + " acts=" + acts.length + " shots=" + shots + " findings=" + findings.length + " consoleErrs=" + consoleErrs.length);
fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify({ W, H, acts, findings, consoleErrs, ticks: tick, ms: Date.now() - t0 }, null, 2));
killAll(); process.exit(0);
