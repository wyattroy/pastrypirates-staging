/* mp_rig.mjs — the reusable two-window crew-game rig.
 *
 * Built overnight 2026-08-19/20 for phase 02.2 and kept because every multiplayer question after it
 * needs the same apparatus: a real host and a real guest, in two independent Chromes, playing a real
 * Firebase room. Phase 3 (The Safety Net) is its next customer.
 *
 * It carries the corrections that cost that night:
 *   - visibility is the PAINTED RECTANGLE plus the styles that remove a thing from view. NOT
 *     offsetParent, which is always null for a position:fixed element and therefore reported the
 *     wind pill hidden on BOTH tiers — a check that could not pass for anyone.
 *   - the driver is DRIVING-THE-GAME.md 5b plus 02.1-01s three fixes: liveness filter, prefer the
 *     committing circle, rotate on repeated failure. Without them it clicks one dead button forever.
 *   - red-proof any visibility claim against #pp4FF (hidden by design in a crew game, D-04) and
 *     #pp4Menu (always shown). A predicate that cannot separate those two is not measuring anything.
 *
 * Two independent real Chrome instances (own profile, own debug port), one hosting and one
 * joining, against a LOCAL server on a port never used before in this session
 * (DRIVING-THE-GAME.md 1: Chrome caches ES modules per URL; 9: never verify against production).
 *
 * Everything is bounded. Nothing drives a voyage to its end (writeGameLog's entries are permanent
 * and unremovable by anyone, Wyatt included). Rooms are torn down by the caller.
 *
 * Exports: serve(), launch(), attach(), makeHost(), makeGuest(), driver(), ribbonReport(), killAll()
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export { REPO, CHROME, LINUX_ARGS } from "./lib/chrome.mjs";   // one resolver for every driver
import { REPO, CHROME, LINUX_ARGS, gameURL } from "./lib/chrome.mjs";
// screenshots: $MP_RIG_SHOTS, else ./mp-rig-shots under the caller's cwd (was a dead scratchpad path)
export const SHOTS = process.env.MP_RIG_SHOTS || path.join(process.cwd(), "mp-rig-shots");
fs.mkdirSync(SHOTS, { recursive: true });

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const log = (...a) => console.log(...a);
const procs = [];
const ports = { dbg: [], http: [] };   // so killAll() can scope its pkill to THIS rig's processes only

export function serve(port) {
  const p = spawn("python3", ["-m", "http.server", String(port)], { cwd: REPO, stdio: "ignore" });
  procs.push(p); ports.http.push(port);
  return gameURL(port);
}

export function launch(dbgPort, profile, { headless = true, url = "about:blank" } = {}) {
  fs.rmSync(profile, { recursive: true, force: true });
  const args = [
    ...LINUX_ARGS,
    ...(headless ? ["--headless=new"] : []),
    "--mute-audio",   // ALWAYS — his speakers are in the room (HARD-WON-LESSONS.md §8)
    "--disable-gpu", `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1200,950", url
  ];
  const p = spawn(CHROME, args, { stdio: "ignore" });
  procs.push(p); ports.dbg.push(dbgPort);
  return p;
}

export function killAll() {
  for (const p of procs) { try { p.kill("SIGKILL"); } catch {} }
  // SCOPED to this rig's own ports — a bare `pkill -f remote-debugging-port` kills every other
  // agent's probe on the machine (HARD-WON-LESSONS.md §8, paid for on 2026-08-21).
  for (const d of ports.dbg) { try { execSync(`pkill -f "remote-debugging-port=${d}"`, { stdio: "ignore" }); } catch {} }
  for (const h of ports.http) { try { execSync(`pkill -f "http.server ${h}"`, { stdio: "ignore" }); } catch {} }
}

export async function attach(dbgPort, { match = null } = {}) {
  let list = null;
  for (let i = 0; i < 80; i++) {                                  // bounded
    try { list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json(); break; }
    catch { await sleep(250); }
  }
  if (!list) throw new Error(`no chrome on ${dbgPort}`);
  let tgt = match ? list.find(t => t.type === "page" && match.test(t.url)) : null;
  if (!tgt) tgt = await (await fetch(`http://127.0.0.1:${dbgPort}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 950, deviceScaleFactor: 1, mobile: false });

  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };
  const shot = async name => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (r.result?.data) fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, "base64"));
  };
  const goto = async u => { await send("Page.navigate", { url: u }); await sleep(1400); };
  /* A CHECK THAT COULD NEVER FAIL, FOUND 2026-08-20 — and it had been lying all day.
     This wrapped the caller's expression in a SYNCHRONOUS IIFE and coerced the result. Hand it an
     async expression — which every appState probe in this file is, because src/state/index.js has to
     be imported — and the IIFE returns a PROMISE. A promise is always truthy, so `waitFor` returned
     true on the first poll, every time, whatever the page was doing.

     It reported "host: gameStarted" on a host whose game had NOT started, which sent a host-gone
     investigation looking for a fault in code that had simply never run. `ev()` already passes
     awaitPromise:true, so the fix is to stop wrapping and let it resolve — then compare the RESOLVED
     value. CLAUDE.md: check that a check can FAIL before believing it passing. */
  const waitFor = async (expr, ms = 30000, label = expr) => {
    const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < ms && i < 4000; i++) {       // bounded twice
      let v = false;
      try { v = await ev(expr); } catch (e) { v = false; }
      if (v === true) return true;                                 // STRICT: a Promise is not `true`
      await sleep(250);
    }
    throw new Error("timeout waiting for: " + label);
  };
  return { ev, shot, goto, waitFor, send };
}

/* boot a client with its OWN pp_id (5c: same-origin tabs share localStorage) */
async function boot(C, url, tag) {
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','${tag}-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await sleep(1200);
}

/* §3/§5c: the NAME MODAL opens on the choiceHost/choiceJoin click, before the next step */
export async function makeHost(C, url, name = "Host") {
  await boot(C, url, "host");
  await C.waitFor(`(()=>{const e=document.getElementById('choiceHost');return !!(e&&e.offsetParent)})()`, 25000, "host: Host a Crew visible");
  await C.ev(`document.getElementById('choiceHost').click();true`);
  await sleep(900);
  if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
    await C.ev(`document.getElementById('nameModalInput').value=${JSON.stringify(name)};
                document.getElementById('btnNameConfirm').click();true`);
    await sleep(900);
  }
  const btnCreate = await C.ev(`(()=>{const b=document.getElementById('btnCreate');return !!(b&&b.offsetParent)})()`);
  if (btnCreate) { await C.ev(`document.getElementById('btnCreate').click();true`); await sleep(1200); }
  await C.waitFor(`/^[A-Z0-9]{4,6}$/.test((document.getElementById('roomCode')||{}).textContent||'')`, 30000, "host: room code");
  return await C.ev(`document.getElementById('roomCode').textContent.trim()`);
}

export async function makeGuest(C, url, code, name = "Guest") {
  await boot(C, url, "guest");
  await C.waitFor(`(()=>{const e=document.getElementById('choiceJoin');return !!(e&&e.offsetParent)})()`, 25000, "guest: Join a Crew visible");
  await C.ev(`document.getElementById('choiceJoin').click();true`);
  await sleep(900);
  if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
    await C.ev(`document.getElementById('nameModalInput').value=${JSON.stringify(name)};
                document.getElementById('btnNameConfirm').click();true`);
    await sleep(900);
  }
  await C.waitFor(`(()=>{const j=document.getElementById('joinCode');return !!(j&&j.offsetParent)})()`, 25000, "guest: join form");
  await C.ev(`document.getElementById('joinCode').value=${JSON.stringify(code)};
              document.getElementById('joinName').value=${JSON.stringify(name)};
              document.getElementById('btnJoin').click();true`);
  await sleep(3000);
}

/* the 5b driver + 02.1-01's three fixes, installed IN the page */
export const DRIVER_SRC = base => `(async()=>{
  if(window.__g&&window.__g.timer)clearInterval(window.__g.timer);
  let st=null;
  for(const p of ['${base}src/state/index.js','/src/state/index.js','/src/state/index.js']){
    try{ st=(await import(p)).appState; if(st)break; }catch(e){}
  }
  if(!st) return "NO appState";
  window.__g={n:0,acts:[],err:null,timer:null,last:null,same:0};
  const G=window.__g;
  const cellOf=r=>{const s=parseFloat(r.getAttribute('width')),px=(s/0.9)+4,i=(px-s)/2;
    return [Math.round((parseFloat(r.getAttribute('x'))-i)/px),Math.round((parseFloat(r.getAttribute('y'))-i)/px)];};
  const target=()=>{const g=st.game,me=g.players[st.mySeat],n=(g.needs?g.needs(me):[])||[];
    return n.length?(g.islandOf[n[0]]||g.home):g.home;};
  G.timer=setInterval(()=>{
    try{
      G.n++;
      const coin=document.getElementById('flipCoinWrap');
      if(coin&&coin.classList.contains('active')&&coin.onclick){coin.onclick();G.acts.push('FLIP');return;}
      const cells=[...document.querySelectorAll('.sailCell')];
      if(cells.length){const T=target();let b=cells[0],bd=1e9;
        for(const c of cells){const [x,y]=cellOf(c);const d=Math.abs(x-T[0])+Math.abs(y-T[1]);if(d<bd){bd=d;b=c;}}
        b.dispatchEvent(new MouseEvent('click',{bubbles:true}));G.acts.push('SAIL');return;}
      const btl=[...document.querySelectorAll('.btlBtn')].filter(b=>b.getAttribute('aria-disabled')!=='true');
      if(btl.length){btl[0].click();G.acts.push('BTL');return;}
      let btns=[...document.querySelectorAll('#actionPanel .apBtn')]
        .filter(b=>!/back|←|‹/i.test(b.textContent))
        .filter(b=>b.getAttribute('aria-disabled')!=='true'&&!b.classList.contains('apDis')&&b.disabled!==true);
      if(!btns.length)return;
      const noAnchor=btns.filter(b=>!/anchor/i.test(b.textContent));
      const pool=noAnchor.length?noAnchor:btns;
      let pick=pool.find(b=>b.classList.contains('primary'))||pool.find(b=>/dock/i.test(b.textContent))
             ||pool.find(b=>/fish/i.test(b.textContent))||pool[0];
      const lbl=pick.textContent.trim().slice(0,20);
      if(lbl===G.last)G.same++;else{G.same=0;G.last=lbl;}
      if(G.same>=5){const alt=pool.filter(b=>b.textContent.trim().slice(0,20)!==lbl);
        if(alt.length){pick=alt[G.same%alt.length];G.same=0;G.last=pick.textContent.trim().slice(0,20);}}
      G.acts.push(lbl); if(G.acts.length>30)G.acts.shift();
      pick.click();
    }catch(e){G.err=String(e.message).slice(0,120);}
  },700);
  return "driver up, seat "+st.mySeat;
})()`;

export const driver = (C, base) => C.ev(DRIVER_SRC(base));
export const driverOff = C => C.ev(`(()=>{if(window.__g&&window.__g.timer){clearInterval(window.__g.timer);window.__g.timer=null;return "stopped"}return "not running"})()`);

/* the five gate defects, measured on ONE client — used identically on host and guest */
export const RIBBON_REPORT = `JSON.stringify((()=>{
  // VISIBILITY, measured properly. offsetParent is ALWAYS null for a position:fixed element, so the
  // obvious "el.offsetParent!==null" test reports every fixed overlay as hidden — it did exactly that
  // for #pp4Pill on BOTH tiers in the first run of this probe, which is a check that could not pass.
  // Use the painted rectangle plus the computed styles that actually remove a thing from view.
  const vis=el=>{ if(!el) return null; const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    const painted=r.width>0&&r.height>0;
    const styled=cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity||'1')>0.01;
    return {display:cs.display,pos:cs.position,inline:el.style.display||'',cls:el.className||'',
            rect:{w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)},
            text:(el.textContent||'').trim().slice(0,30),
            shown:painted&&styled}; };
  const st=(()=>{try{return __pp_app_state_debug()}catch(e){return{}}})();
  const g=st.game||{};
  return {
    seat:st.mySeat, isHost:!!st.isHost, room:st.room||null,
    round:g.round, events:(g.events||[]).length,
    windNow:g.windNow, windNext:g.windNext,
    timerOff:st.timerOff, shotClockSeat:st.shotClockSeat, shotClockPaused:st.shotClockPaused,
    day:(document.getElementById('pp4Round')||{}).textContent||null,
    pill:vis(document.getElementById('pp4Pill')),
    clock:vis(document.getElementById('pp4Clock')),
    chat:vis(document.getElementById('pp4Chat')),
    ff:vis(document.getElementById('pp4FF')),
    menu:vis(document.getElementById('pp4Menu')),
    promptCls:(document.getElementById('pp4Prompt')||{}).className||null,
    apMsg:(()=>{const e=document.querySelector('#actionPanel .apMsg');return e?e.textContent.trim().slice(0,70):null})(),
    apBtns:(()=>{const b=document.querySelector('#actionPanel .apBtns');return b?[...b.querySelectorAll('.apBtn')].length:0})(),
    posGame:(g.players||[]).map(p=>p&&p.pos?p.pos.join(','):null),
    posEvent:(()=>{const e=[...(g.events||[])].reverse().find(x=>x&&x.state);
      return e&&e.state?e.state.map(s=>s.pos?s.pos.join(','):null):null})()
  };})())`;

export const ribbonReport = async C => JSON.parse(await C.ev(RIBBON_REPORT));
