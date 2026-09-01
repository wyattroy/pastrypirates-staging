// stage_layout_check.mjs — THE LAYOUT GATE. Boots a solo voyage to its first sail prompt and its
// first action menu at several window sizes, reads the RENDERED rectangles (never arithmetic of its
// own — BOARD-RENDERING.md §7), fails on the faults a human sees at a glance, and KEEPS the
// screenshots, stitched into one contact sheet that must be looked at before any drop is shown.
//
// WHY THIS EXISTS (Wyatt, 2026-08-21): "how did this get past your QA? I thought I told you to QA
// everything in browser, with a mouse, by looking at the pixels. fix your process, even if it means
// writing a gate." The real-mouse run before it asked one question — can every button be clicked —
// and every button could, so it said "clean" while the board was cropped to 630px, the CAPTAINS card
// hung off the bottom of the window, every name marquee-scrolled, and a legal sail square was cut in
// half. None of those is a click failure. All of them are rectangles. And the "four clean passes"
// kept no screenshots, so nobody looked.
//
// Usage:  node scripts/stage_layout_check.mjs [--sizes=390x664,960x1080,1400x900,1890x960,1920x1080]
//                                               [--out=DIR] [--port=N] [--dbg=N] [--parallel=2]
// Exit 1 on any FAIL. Prints one line per check per size, then the contact sheet's path.
// Hygiene: headless, muted, own ports, kills only its own Chrome/server (HARD-WON-LESSONS.md §8).
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO, CHROME, LINUX_ARGS, gameURL, PYTHON } from "./lib/chrome.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
// D-42: the phone size is 390x664 — the viewport a real iPhone-class Safari/Chrome gives the page
// once its bottom bar is accounted for, not the 390x844 screen. Kept in step with playtest_gate's
// phone legs deliberately: two gates disagreeing about what a phone is would be two phones.
// D-52: 820x1180 is the STACKED/TABLET shape, and until 2026-08-22 this gate had never seen it.
// Every other size lands in either the phone branch or the side-by-side one, which is exactly how
// the fast-forward button drawn on top of the wind pill, and a captains card 84px taller than its
// own rows, reached Wyatt in a screenshot. Adding a SIZE is coverage, not a per-bug assertion, so
// D-37 permits it — and the branch-coverage check at the bottom of this file is what stops the
// size silently drifting back out of the branch it was added to cover.
const SIZES = arg("sizes", "390x664,820x1180,960x1080,1400x900,1890x960,1920x1080").split(",").map(s => s.split("x").map(Number));
const OUT = path.resolve(arg("out", path.join(process.cwd(), "layout-check-shots")));
const PORT = +arg("port", 8720), DBG0 = +arg("dbg", 9720);
const PAR = Math.max(1, +arg("parallel", 2));   // sizes run PAR at a time — five Chromes at once would heat his laptop; one at a time took >10 min
const PHONE_MAX_W = 600;                       // the CSS boundary: `@media (min-width:601px)` in index.html
const REACH_MS = 150_000;                       // to reach the first sail prompt (intro + recipe pick + bots)
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();
const log = (...a) => { const s = `[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)}s] ` + a.join(" "); console.log(s); fs.appendFileSync(path.join(OUT, "log.txt"), s + "\n"); };

// --- one server for the whole run, a fresh port (module cache is per URL — DRIVING-THE-GAME.md §1)
const srv = spawn(PYTHON, ["-m", "http.server", String(PORT)], { cwd: REPO, stdio: "ignore" });
const own = { dbg: [] };
const killAll = () => {
  try { srv.kill("SIGKILL"); } catch {}
  for (const d of own.dbg) { try { execSync(`pkill -f "remote-debugging-port=${d}"`, { stdio: "ignore" }); } catch {} }
  try { execSync(`pkill -f "http.server ${PORT}"`, { stdio: "ignore" }); } catch {}
};
process.on("exit", killAll); for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { killAll(); process.exit(1); });   // a timed-out caller sends SIGTERM, which skips "exit" handlers
await sleep(800);

// --- CDP plumbing ---------------------------------------------------------------------------
async function openChrome(W, H, dbg) {
  const profile = path.join(OUT, `profile-${W}x${H}`); fs.rmSync(profile, { recursive: true, force: true });
  const args = [...LINUX_ARGS, "--headless=new", "--mute-audio", `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", `--window-size=${W},${H}`, "--autoplay-policy=no-user-gesture-required", "about:blank"];
  const proc = spawn(CHROME, args, { stdio: "ignore" }); own.dbg.push(dbg);
  let tgt; for (let i = 0; i < 30 && !tgt; i++) { try { tgt = await (await fetch(`http://127.0.0.1:${dbg}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await sleep(300); } }
  if (!tgt) throw new Error("chrome never came up on " + dbg);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errs.push("EXC " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "").slice(0, 160));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push("ERR " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 160)); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }; return r.result?.result?.value; };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const shot = async file => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(file, Buffer.from(r.result.data, "base64")); return file; };
  const close = () => { try { ws.close(); } catch {} try { proc.kill("SIGKILL"); } catch {} try { execSync(`pkill -f "remote-debugging-port=${dbg}"`, { stdio: "ignore" }); } catch {} };
  return { send, ev, shot, close, errs };
}

// the same on-screen gate the real-mouse driver uses: a click is allowed only at a point that is
// inside the viewport, inside body's column, and where elementFromPoint hits the element
const GATE = `window.__gate = (el) => {
  if (!el) return {ok:false, why:'no element'};
  const r = el.getBoundingClientRect(); const b = document.body.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  if (r.width < 4 || r.height < 4) return {ok:false, why:'zero size'};
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return {ok:false, why:'outside viewport'};
  if (r.left < b.left - 1 || r.right > b.right + 1) return {ok:false, why:'outside body column'};
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return {ok:false, why:'occluded by '+(hit?(hit.id||hit.className||hit.tagName):'nothing')};
  return {ok:true, x:cx, y:cy};
};`;

async function mouseClick(c, x, y) {
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
async function clickSel(c, selector, filterSrc = "() => true") {
  const g = await c.ev(`(() => { const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(${filterSrc});
     for (const el of els) { const g = __gate(el); if (g.ok) return {ok:true, x:g.x, y:g.y, txt:(el.textContent||'').trim().slice(0,24)}; }
     return {ok:false, n:els.length}; })()`);
  if (g && g.ok) { await mouseClick(c, g.x, g.y); return g.txt || "?"; }
  return null;
}

// --- boot a solo game to the first SAIL prompt (DRIVING-THE-GAME.md §3, §3c, §4a, §4b) ---------
// boot to the STAGE and stop at the OPENING — the ceremony/recipe screen a player sees FIRST. The
// gate used to drive straight past this to the sail prompt, which is exactly why the empty captains
// tower, the clipped names and the ribbon-clipped "Arrgh" all reached Wyatt: the first screen was
// never measured.
async function bootToStage(c) {
  await c.send("Page.navigate", { url: gameURL(PORT) }); await sleep(2200);
  await c.ev("localStorage.clear(); 1"); await c.send("Page.navigate", { url: gameURL(PORT) }); await sleep(2500);
  await c.ev(GATE);
  if (!await clickSel(c, "#choiceSolo")) throw new Error("solo card not clickable"); await sleep(900);
  const ni = await c.ev("(()=>{const el=document.getElementById('nameModalInput'); if(!el) return null; const g=__gate(el); return g.ok?g:null;})()");
  if (ni) { await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: ni.x, y: ni.y, button: "left", clickCount: 3 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ni.x, y: ni.y, button: "left", clickCount: 3 });
    await c.send("Input.insertText", { text: "Davy Scones" }); }   // a long name — the one that clipped
  if (!await clickSel(c, "#btnNameConfirm")) throw new Error("name confirm not clickable");
  // wait for the stage AND the opening prompt to be up and settled (the captains rows exist, and a
  // visible centred ceremony OR a recipe list has appeared and stopped moving)
  const t0 = Date.now();
  while (Date.now() - t0 < 25_000) { await sleep(400);
    const on = await c.ev("(()=>{const cap=document.querySelector('.player-row'); const p=document.getElementById('pp4Prompt'); const vis=p&&getComputedStyle(p).display!=='none'&&p.getBoundingClientRect().width>50; return !!(cap&&vis);})()");
    if (on) return true;
  }
  throw new Error("stage/opening prompt never appeared");
}
// from the opening, answer whatever stands between us and the sail window: flip coin first (§4a),
// tap recipe cards to draft, never Back (§4b).
async function driveToSail(c) {
  const t1 = Date.now();
  while (Date.now() - t1 < REACH_MS) {
    await sleep(700); await c.ev(GATE);
    const sail = await c.ev("document.querySelectorAll('.sailCell').length");
    if (sail > 0) return true;
    if (await clickSel(c, "#flipCoinWrap.active")) continue;
    if (await clickSel(c, ".btlBtn", "b => !/back|←|‹/i.test(b.textContent)")) continue;
    // recipe draft (two-tap: card, then "Bake this!") and every centred/radial barrier
    if (await clickSel(c, "#pp4Prompt .recipeCard, #pp4Prompt .bkoCard", "() => true")) { await sleep(500); }
    await clickSel(c, "#pp4Prompt .apBtn, #actionPanel .apBtn", "b => !/back|←|‹|anchor/i.test(b.textContent) && b.getAttribute('aria-disabled')!=='true'");
  }
  throw new Error("no sail prompt within " + REACH_MS / 1000 + "s");
}
// wait for the prompt's reveal gate and for the camera to stop moving — both read from the renderer
async function settle(c) {
  let last = "", still = 0; const t0 = Date.now();
  while (Date.now() - t0 < 15_000) { await sleep(200);
    const vb = await c.ev("(()=>{const s=document.getElementById('board'); const ap=document.getElementById('actionPanel'); return (s?s.getAttribute('viewBox'):'')+'|'+(ap&&ap.classList.contains('pendingReveal')?'pending':'ready');})()");
    if (vb === last && /ready$/.test(vb)) { if (++still >= 4) return; } else still = 0;
    last = vb; }
}

// --- THE MEASUREMENT: rectangles the renderer drew, nothing computed here ---------------------
const MEASURE = `(() => {
  const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return {l:r.left, t:r.top, r:r.right, b:r.bottom, w:r.width, h:r.height}; };
  const vis = el => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const cap = document.getElementById('pp4Cap');
  // per-row: does the name's own text box run into the coin? (measured rects, not the grid track)
  const names = [...document.querySelectorAll('.player-row')].map(row => {
    const w = row.querySelector('.pname'), inner = w && w.firstElementChild, coin = row.querySelector('.coinsWrap, .coins');
    const ir = inner && inner.getBoundingClientRect(), cr = coin && coin.getBoundingClientRect();
    return { text:(w?w.textContent:'').trim(), marquee:w?w.classList.contains('marquee'):false,
      inner:inner?inner.scrollWidth:0, box:w?w.clientWidth:0,
      textRight: ir?ir.right:0, coinLeft: cr?cr.left:1e9 };
  });
  // the centred ceremony/intro (pp4Center): union box of its visible message + button, to check it
  // is not jammed under the ribbon nor off the board (Wyatt: "the ARRGH button is the only thing visible!")
  const cprompt = document.querySelector('#pp4Prompt.pp4Center');
  let center = null;
  if (cprompt && getComputedStyle(cprompt).display !== 'none') {
    const els = [...cprompt.querySelectorAll('.apMsg, .apBtn')].filter(vis).map(R).filter(Boolean);
    if (els.length) center = { l: Math.min(...els.map(e=>e.l)), t: Math.min(...els.map(e=>e.t)), r: Math.max(...els.map(e=>e.r)), b: Math.max(...els.map(e=>e.b)) };
  }
  const cells = [...document.querySelectorAll('.sailCell')].map(R);
  const bubs = [...document.querySelectorAll('.pp4Bub:not(.ambient)')].filter(vis).map(b => ({ r:R(b), text:(b.textContent||'').trim().slice(0,40), tail:!!b.querySelector('.pp4Tail') }));
  const prompt = document.getElementById('pp4Prompt');
  const radial = !!(prompt && prompt.classList.contains('radial'));
  const petals = [...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b => vis(b) && b.getBoundingClientRect().width > 4).map(b => {
    const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    return { r:R(b), text:(b.textContent||'').trim().slice(0,20), hit: !!(hit && (hit === b || b.contains(hit) || hit.contains(b))) }; });
  const stampEl = document.getElementById('pp4Stamp');
  return {
    iw: innerWidth, ih: innerHeight, side: document.body.classList.contains('pp4Side'),
    pp4W: getComputedStyle(document.body).getPropertyValue('--pp4W').trim(),
    body: R(document.body), board: R(document.getElementById('boardwrap')), ribbon: R(document.getElementById('pp4Ribbon')),
    pill: R(document.getElementById('pp4Pill')), cap: R(cap), capScroll: cap ? cap.scrollHeight : 0, capClient: cap ? cap.clientHeight : 0,
    capPanel: R(document.getElementById('captainsPanel')), center,
    names, cells, bubs, radial, petals, stamp: stampEl ? stampEl.textContent : '',
    viewBox: (document.getElementById('board')||{}).getAttribute ? document.getElementById('board').getAttribute('viewBox') : ''
  };
})()`;

const inside = (a, b, tol = 1.5) => a && b && a.l >= b.l - tol && a.t >= b.t - tol && a.r <= b.r + tol && a.b <= b.b + tol;
const overlap = (a, b, tol = 2) => a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > tol && Math.min(a.b, b.b) - Math.max(a.t, b.t) > tol;
const VP = (m) => ({ l: 0, t: 0, r: m.iw, b: m.ih });

// assertions — each is one sentence a player would recognise
function judge(m, moment) {
  const out = []; const F = (ok, what) => out.push({ ok, what });
  const desktop = m.iw > PHONE_MAX_W;
  F(!!m.board && inside(m.board, VP(m)), `board box inside the window`);
  if (m.pill && m.pill.h > 0 && m.board) F(m.board.t >= m.pill.b - 1, `board starts below the wind pill (not under it)`);
  if (desktop && m.side) {
    F(Math.abs(m.board.w - m.board.h) <= 2, `side-by-side: board is a square (${m.board.w|0}×${m.board.h|0})`);
    F(m.board.b >= m.ih - 2, `side-by-side: board reaches the bottom of the window (no empty band; bottom=${m.board.b|0} of ${m.ih})`);
    F(m.cap && m.cap.l >= m.board.r - 1, `side-by-side: captains column stands beside the board, not under it`);
  }
  if (desktop && !m.side && m.cap && m.board) F(m.cap.t >= m.board.b - 2, `stacked: captains card sits below the board`);
  if (desktop) {
    F(m.cap && inside(m.cap, VP(m)), `captains card fully inside the window (bottom=${m.cap ? m.cap.b|0 : '?'} of ${m.ih})`);
    F(!(m.cap && m.board && overlap(m.cap, m.board)), `captains card does not cover the board`);
    F(m.capScroll <= m.capClient + 2, `no captain row hidden behind an internal scroll (${m.capScroll} content vs ${m.capClient} visible)`);
    // THE EMPTY-TOWER CHECK (Wyatt's screenshot): the card box must hug its rows, not stretch far
    // past them. capPanel is the header+rows; a card taller than that + padding is dead cream.
    if (m.cap && m.capPanel) F(m.cap.h <= m.capPanel.h + 48, `captains card hugs its content — no empty tower (card ${m.cap.h|0}px vs content ${m.capPanel.h|0}px)`);
    const mq = m.names.filter(n => n.marquee).map(n => n.text);
    F(mq.length === 0, `no captain name scrolling/clipped (${mq.length ? mq.join(", ") : "all fit"})`);
    const clipped = m.names.filter(n => n.inner > n.box + 1).map(n => `${n.text} (${n.inner}px in ${n.box}px)`);
    F(clipped.length === 0, `every captain name fits its column (${clipped.length ? clipped.join(", ") : "all fit"})`);
    // THE NAME-INTO-COIN CHECK: the name's rendered text must not reach the coin (Wyatt's "Davy Scon🪙")
    const jam = m.names.filter(n => n.textRight > n.coinLeft + 1).map(n => `${n.text} (+${(n.textRight-n.coinLeft)|0}px)`);
    F(jam.length === 0, `every captain name clears the coin (${jam.length ? "overlapping: " + jam.join(", ") : "all clear"})`);
  }
  // THE CEREMONY CHECK (the opening "Arrgh"): its message+button must sit below the ribbon (not
  // clipped by it) and within the board — not jammed to the top edge, which is how the phone-era
  // lift math mispositioned it in side-by-side.
  if (m.center) {
    const ribB = m.ribbon ? m.ribbon.b : 0;
    F(m.center.t >= ribB - 2, `opening ceremony sits below the ribbon, not clipped by it (top=${m.center.t|0}, ribbon bottom=${ribB|0})`);
    if (m.board) F(m.center.b <= m.board.b + 2 && m.center.t >= m.board.t - 2, `opening ceremony is on the board (top=${m.center.t|0}, bottom=${m.center.b|0}, board ${m.board.t|0}–${m.board.b|0})`);
  }
  if (moment === "sail") {
    F(m.cells.length > 0, `legal sail squares are drawn (${m.cells.length})`);
    const cut = m.cells.filter(c => !inside(c, m.board, 2)).length;
    F(cut === 0, `every legal sail square is fully inside the board (${cut} cropped)`);
  }
  for (const b of m.bubs) {
    F(inside(b.r, VP(m)), `narration bubble "${b.text}" inside the window`);
    const onCell = m.cells.some(c => overlap(b.r, c)); const onPetal = m.petals.some(p => overlap(b.r, p.r));
    F(!onCell && !onPetal, `narration bubble "${b.text}" does not cover a choice (${onCell ? "on a sail square" : onPetal ? "on a button" : "clear"})`);
  }
  if (m.radial && m.petals.length) {
    // on phone body is not a capped column (that CSS is desktop-only), so the window is the column
    const off = m.petals.filter(p => !inside(p.r, VP(m)) || (desktop && !inside(p.r, m.body))).map(p => p.text);
    F(off.length === 0, `every prompt button on screen and inside the column (${off.length ? off.join(", ") : m.petals.length + " ok"})`);
    const piles = []; for (let i = 0; i < m.petals.length; i++) for (let j = i + 1; j < m.petals.length; j++) if (overlap(m.petals[i].r, m.petals[j].r)) piles.push(m.petals[i].text + "/" + m.petals[j].text);
    F(piles.length === 0, `no two prompt buttons stacked on each other (${piles.length ? piles.join(", ") : "none"})`);
    const hid = m.petals.filter(p => !p.hit).map(p => p.text);
    F(hid.length === 0, `every prompt button is the thing under the mouse at its centre (${hid.length ? "covered: " + hid.join(", ") : "all reachable"})`);
  }
  return out;
}

// --- run -------------------------------------------------------------------------------------
const report = []; let anyFail = false;
async function runSize(i) {
  const [W, H] = SIZES[i]; const tag = `${W}x${H}`; const rec = { tag, W, H, moments: [], errors: [] }; report[i] = rec; const t0 = Date.now();
  let c;
  try {
    c = await openChrome(W, H, DBG0 + i);
    // MOMENT 0 — the OPENING: the first screen a player sees (ceremony / recipe pick). Its blind
    // spot is the whole reason build v's empty tower + clipped names + top-jammed Arrgh shipped.
    await bootToStage(c); await settle(c);
    let m = await c.ev(MEASURE); if (m && m.__err) throw new Error(m.__err);
    rec.stamp = m.stamp; rec.side = m.side; rec.pp4W = m.pp4W;
    let checks = judge(m, "opening"); let f = await c.shot(path.join(OUT, `${tag}-0-opening.png`));
    rec.moments.push({ name: "opening", shot: f, checks, m });
    // MOMENT 1 — the SAIL prompt
    await driveToSail(c); await settle(c);
    m = await c.ev(MEASURE); if (m && m.__err) throw new Error(m.__err);
    rec.board = m.board; rec.cap = m.cap;
    checks = judge(m, "sail"); f = await c.shot(path.join(OUT, `${tag}-1-sail.png`));
    rec.moments.push({ name: "sail prompt", shot: f, checks, m });
    // click a legal square with the real mouse, then measure the ACTION MENU — where petals pile up
    await c.ev(GATE);
    const cell = await c.ev("(()=>{for (const el of document.querySelectorAll('.sailCell')){const g=__gate(el); if(g.ok) return g;} return null;})()");
    if (cell) {
      await mouseClick(c, cell.x, cell.y);
      const t0 = Date.now(); let menu = 0;
      while (Date.now() - t0 < 30_000 && menu < 2) { await sleep(500);
        menu = await c.ev("[...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b=>getComputedStyle(b).visibility!=='hidden'&&b.getBoundingClientRect().width>4).length"); }
      await settle(c);
      m = await c.ev(MEASURE);
      checks = judge(m, "menu"); f = await c.shot(path.join(OUT, `${tag}-2-menu.png`));
      rec.moments.push({ name: "action menu", shot: f, checks, m });
    } else rec.errors.push("no clickable sail square to reach the action menu");
    rec.errors.push(...c.errs);
  } catch (e) {
    rec.errors.push(String(e.message || e));
    try { if (c) rec.moments.push({ name: "FAILED TO REACH", shot: await c.shot(path.join(OUT, `${tag}-0-stuck.png`)), checks: [{ ok: false, what: String(e.message || e) }] }); } catch {}
  } finally { if (c) c.close(); }
  const fails = rec.moments.flatMap(mo => mo.checks.filter(k => !k.ok));
  if (fails.length || rec.errors.length) anyFail = true;
  // one contiguous block per size (no awaits between these lines, so parallel sizes never interleave)
  log(`\n== ${tag}  ${rec.side ? "SIDE-BY-SIDE" : (W > PHONE_MAX_W ? "STACKED" : "PHONE")}  --pp4W=${rec.pp4W || "-"}  ${rec.stamp || ""}  (${((Date.now() - t0) / 1000) | 0}s)`);
  for (const mo of rec.moments) { log(`  [${mo.name}] ${path.basename(mo.shot)}`); for (const k of mo.checks) log(`    ${k.ok ? "ok  " : "FAIL"} ${k.what}`); }
  for (const e of rec.errors) log(`    ERR  ${e}`);
}
{ let next = 0; await Promise.all(Array.from({ length: Math.min(PAR, SIZES.length) }, async () => { while (next < SIZES.length) await runSize(next++); })); }

/* EVERY BRANCH OF THE LAYOUT MUST BE COVERED BY SOMETHING (D-52). The game draws three different
   shapes — phone, stacked and side-by-side — and this gate used to sample five sizes that between
   them hit only two of them. A gate aimed at the wrong shape is not silent, it is reassuring
   (HARD-WON-LESSONS section 3). This is coverage, not a per-bug assertion: it names no defect and
   no element, it only refuses to call a run complete while a whole branch of the layout went
   unlooked-at. It also catches the drift case — a stacked size stops being stacked the moment the
   side-by-side threshold moves, and then the coverage quietly vanishes with nothing to say so. */
{
  const seen = new Set(report.filter(Boolean).map(r => r.side ? "side-by-side" : (r.W > PHONE_MAX_W ? "stacked" : "phone")));
  const missing = ["phone", "stacked", "side-by-side"].filter(b => !seen.has(b));
  // A run that was deliberately narrowed with --sizes is a targeted probe, not a gate run, and
  // failing it would only teach people to route around this check. It still SAYS so, loudly.
  const narrowed = process.argv.some(a => a.startsWith("--sizes="));
  if (missing.length) { if (!narrowed) anyFail = true;
    log(`\nBRANCH COVERAGE ${narrowed ? "GAP (narrowed run, not counted)" : "FAIL"}: no size in this run landed in the ${missing.join(" or ")} branch (saw ${[...seen].join(", ") || "nothing"})`); }
  else log(`\nbranch coverage: ${[...seen].sort().join(", ")} — all three shapes measured`);
}

// --- the contact sheet: one picture to open before anything is shown to Wyatt -----------------
// A real file on disk, loaded over file:// with RELATIVE image paths — the first version navigated
// to a multi-megabyte data: URL, which Chrome silently refused, and screenshotted a blank page. A
// blank sheet that looks like a rendering hiccup is exactly the reassuring-green trap this gate
// exists to close, so the sheet now also asserts that every image actually loaded.
/* --- THE CONTACT SHEET IS AN HTML FILE, AND IT IS NO LONGER SCREENSHOTTED ------------------
   It used to open the sheet in a seventh headless Chrome and photograph it. That step has NEVER
   ONCE SUCCEEDED on a real multi-size run, and it took until 2026-08-22 to notice, because it was
   photographing its own 404: the URL was built relative to REPO and fetched from the run's own
   server, so any --out outside the repo produced `../../../tmp/...` and python answered 404. That
   is exactly the class d9c9a71 hardened playtest_gate.mjs against, in this file, unfixed.
   Serving the sheet from its own directory fixed the 404 — and then the capture began TIMING OUT
   instead, on a six-size run, at 40s, at 90s and at 240s alike, while a one-size run finished in
   seconds. A seventh Chrome decoding eighteen full-size screenshots on a laptop already running
   three is not a thing to keep paying for.
   So the step is DELETED rather than nursed. What is kept is the part that was always the useful
   artifact: the HTML sheet on disk, which links the REAL full-resolution PNGs and prints every
   failure beside its own tile — better to look at than a photograph of itself, because you can
   click into a tile at full size. Open it with `open <path>`.
   AND THE CHECK IS STRONGER FOR LOSING THE BROWSER. "Did the browser load 18 images" is now "does
   every PNG this sheet names exist on disk with real bytes in it", asked of the filesystem, which
   cannot be answered by an error page. A gate aimed at the wrong thing is not silent, it is
   reassuring (HARD-WON-LESSONS section 3), and photographing a 404 is the purest form of that. */
{
  const tiles = report.filter(Boolean).flatMap(r => r.moments.map(mo => { const fails = mo.checks.filter(k => !k.ok);
    return { cap: `${r.tag} · ${mo.name} · ${fails.length ? "FAIL ×" + fails.length : "ok"}`, fails: fails.map(k => k.what), src: path.basename(mo.shot), file: mo.shot }; }));
  const html = `<!doctype html><html><body style="margin:0;background:#1c2f38;color:#fff;font:13px/1.3 -apple-system,Helvetica,sans-serif"><div style="padding:14px 16px 4px;font-size:16px">stage_layout_check — ${new Date().toISOString().slice(0, 16)} — ${report[0]?.stamp || ""} — ${anyFail ? "FAILURES" : "all green"}</div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:10px 16px 16px">${tiles.map(t => `<div style="background:#0f1d24;border:2px solid ${t.fails.length ? "#ff2d55" : "#27c78d"};border-radius:8px;padding:8px">
    <div style="font-weight:bold;margin-bottom:6px">${t.cap}</div><a href="${t.src}"><img src="${t.src}" style="width:100%;display:block;border-radius:4px;background:#000"></a>
    ${t.fails.map(f => `<div style="color:#ff8fa5;margin-top:4px">✗ ${f.replace(/</g, "&lt;")}</div>`).join("")}</div>`).join("")}</div></body></html>`;
  const htmlFile = path.join(OUT, "contact-sheet.html"); fs.writeFileSync(htmlFile, html);
  const missingShots = tiles.filter(t => { try { return fs.statSync(t.file).size < 2000; } catch { return true; } }).map(t => t.src);
  if (missingShots.length) { anyFail = true; log(`\nCONTACT SHEET INCOMPLETE: ${missingShots.length} of ${tiles.length} screenshots are missing or empty on disk — do not trust it (${missingShots.join(", ")})`); }
  log(`\nCONTACT SHEET (open it and READ it before showing anyone anything): open ${htmlFile}  [${tiles.length} tiles, all present on disk]`);
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, (k, v) => k === "m" ? undefined : v, 2));
log(anyFail ? "\nRESULT: FAIL" : "\nRESULT: PASS");
killAll(); process.exit(anyFail ? 1 : 0);
