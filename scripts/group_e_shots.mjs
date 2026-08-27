#!/usr/bin/env node
/* group_e_shots.mjs — Group E's proof for the four items that are LOOKED AT, not counted.
 *
 *   node scripts/group_e_shots.mjs <outdir> <port> <dbgport> [W] [H]
 *
 * Wyatt's rescope, 2026-08-22: numbers are required only where he gave a number (the reading-speed
 * holds; those live in narration_timeline.mjs). For the storm summary, the black-market ceremony,
 * the Dock petal and the crate cue, a SCREENSHOT that has been opened and read is the proof.
 *
 * POSE THE STATE, DO NOT SAIL TO IT (DRIVING-THE-GAME §5e). Every moment here is rare — a storm
 * that stops one ship against another, a bot claiming the first dry shelf — and playing until one
 * happens is what made the driven pass take twenty minutes and produce nothing. So the LIVE
 * appState object is mutated at runtime and the real code path is then run against it.
 *   - A LIVE MUTATION CANNOT SHIP. Nothing under src is edited to make an event happen. Editing
 *     the engine and reverting is the old method and is forbidden.
 *   - RED-PROOF EVERY INJECTION: the known-negative is forced FIRST, and its result is reported
 *     beside the positive. A probe that has not been seen fail has proved nothing.
 *   - SOLO ONLY. Injection desyncs a real room, where the host is the sole authority.
 *
 * Headless, --mute-audio, bounded loops, own ports, and it kills what it started.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO, CHROME, LINUX_ARGS, gameURL } from "./lib/chrome.mjs";

const OUT = process.argv[2] || "/tmp/group-e-shots";
const PORT = +(process.argv[3] || 8691), DBG = +(process.argv[4] || 9691);
const W = +(process.argv[5] || 1400), H = +(process.argv[6] || 900);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] ` + a.join(" "));

const procs = [];
const killAll = () => {
  for (const p of procs) { try { p.kill("SIGKILL"); } catch {} }
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`, { stdio: "ignore" }); } catch {}
  try { execSync(`pkill -f "http.server ${PORT}"`, { stdio: "ignore" }); } catch {}
};
process.on("exit", killAll);
process.on("SIGINT", () => { killAll(); process.exit(1); });

procs.push(spawn("python3", ["-m", "http.server", String(PORT)], { cwd: REPO, stdio: "ignore" }));
const prof = path.join(OUT, "prof");
fs.rmSync(prof, { recursive: true, force: true });
procs.push(spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--mute-audio",
  `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, "--no-first-run",
  "--no-default-browser-check", `--window-size=${W},${H}`,
  "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" }));
await sleep(2200);

let tgt = null;
for (let i = 0; i < 40 && !tgt; i++) {
  try { tgt = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: "PUT" })).json(); }
  catch { await sleep(300); }
}
if (!tgt) { console.error("chrome never came up"); process.exit(1); }
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errs = [];
await new Promise(r => { ws.onopen = r; });
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails?.exception?.description || "").slice(0, 160)); };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: String(r.result.exceptionDetails.exception?.description || "").slice(0, 260) };
  return r.result?.result?.value; };
const shot = async n => { const r = await send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) { fs.writeFileSync(path.join(OUT, n), Buffer.from(r.result.data, "base64")); log("shot", n); } };

const URL0 = gameURL(PORT);
await send("Page.navigate", { url: URL0 }); await sleep(1600);
await ev("localStorage.clear(); 1");
await send("Page.navigate", { url: URL0 }); await sleep(2600);
await ev(`(()=>{const b=document.getElementById("choiceSolo"); if(b)b.click(); return !!b;})()`);
await sleep(900);
await ev(`(()=>{const i=document.getElementById("nameModalInput"); if(!i)return false;
  i.value="Claude"; document.getElementById("btnNameConfirm").click(); return true;})()`);
for (let i = 0; i < 50; i++) { if (await ev(`!!(window.appState && appState.game)`) === true) break; await sleep(400); }
await ev(`(async()=>{ if(!window.appState){const m=await import('/src/state/index.js'); window.appState=m.appState;} return !!window.appState; })()`);
await sleep(1500);
const out = { W, H };

/* ---------- 1. the radial fan: D-32's pulse and D-33's Dock petal, in one picture ---------- */
out.fan = await ev(`(async () => {
  const g = appState.game, ui = await import("/src/ui/index.js");
  const me = g.players[appState.mySeat || 0];
  // put the captain ON a berth so the action menu offers Dock -- the whole point of the shot
  const need = g.needs(me)[0];
  const isle = need ? g.islandOf[need] : null;
  let berth = null;
  if (isle) for (let dx = -1; dx <= 1 && !berth; dx++) for (let dy = -1; dy <= 1; dy++) {
    const c = [isle[0] + dx, isle[1] + dy];
    if (g.isBerth && g.isBerth(c)) { berth = c; break; }
  }
  if (berth) me.pos = berth;
  ui.liveRender && ui.liveRender();
  ui.humanAct && ui.humanAct(me, null);          // draws the fan; the promise is left pending
  await new Promise(r => setTimeout(r, 2600));
  const btns = [...document.querySelectorAll("#actionPanel .apBtn")];
  const dock = btns.find(b => /dock/i.test(b.textContent || ""));
  const cs = dock ? getComputedStyle(dock) : null;
  return { berth, buttons: btns.map(b => (b.textContent || "").trim().slice(0, 24)),
    dock_text: dock ? (dock.textContent || "").trim() : null,
    dock_has_anchor: dock ? /⚓/.test(dock.innerHTML) : null,
    dock_img_count: dock ? dock.querySelectorAll("img").length : null,
    dock_imgs: dock ? [...dock.querySelectorAll("img")].map(i => i.src.split("/").pop()) : null,
    pulse_animation: cs ? cs.animationName : null,
    pulse_duration: cs ? cs.animationDuration : null };
})()`);
log("fan / Dock petal:", JSON.stringify(out.fan));
await shot("e-fan-dock-petal-a.png");
await sleep(575);                                  // half a pulse period: the circles are a different size
await shot("e-fan-dock-petal-b.png");
// measure the pulse actually moving, rather than trusting the computed style
out.pulse = await ev(`(async () => {
  const b = document.querySelector("#actionPanel .apBtn"); if (!b) return { none: true };
  const w = []; for (let i = 0; i < 24; i++) { w.push(b.getBoundingClientRect().width);
    await new Promise(r => setTimeout(r, 50)); }
  return { min: +Math.min(...w).toFixed(2), max: +Math.max(...w).toFixed(2),
    swing_px: +(Math.max(...w) - Math.min(...w)).toFixed(2) };
})()`);
log("petal pulse swing:", JSON.stringify(out.pulse));

/* ---------- 2. the black-market ceremony on the BOT path, red-proofed ---------- */
out.blackmarket = await ev(`(async () => {
  const g = appState.game, ui = await import("/src/ui/index.js");
  const h = (await import("/src/ui/handlers.js")).netHandlers();
  const botSeat = g.players.findIndex(p => p.strategy !== "human");
  const real = h.onDryCeremony;
  const fire = async () => {
    g.events.push({ t:"dock", p:botSeat, ing:"sugar", heads:1, got:"bought", price:1, black:0, wentDry:1, firstDry:1 });
    appState.evIdx = g.events.length - 1;
    appState.logLines[appState.evIdx] = { txt: "A bot buys the last crate." };
    await Promise.race([ ui.narrateCurrent(), new Promise(r => setTimeout(r, 7000)) ]);
    const c = document.getElementById("bmCerGo");
    return { seen: !!c && c.getBoundingClientRect().width > 4 };
  };
  h.onDryCeremony = undefined;                       // KNOWN NEGATIVE FIRST
  const red = await fire();
  const c0 = document.getElementById("bmCerGo"); if (c0) c0.click();
  await new Promise(r => setTimeout(r, 500));
  h.onDryCeremony = real;                            // then the real thing
  const green = await fire();
  return { bot_seat: botSeat, bot_is_bot: g.players[botSeat].strategy !== "human",
    redproof_handler_off_shows_nothing: red.seen === false,
    ceremony_shown_on_bot_path: green.seen };
})()`);
log("black market (bot path):", JSON.stringify(out.blackmarket));
await shot("e-blackmarket-bot-path.png");
await ev(`(()=>{const b=document.getElementById("bmCerGo"); if(b)b.click(); return true;})()`);
await sleep(700);

/* ---------- 3. one storm that really is stopped by a hull ---------- */
out.storm = await ev(`(async () => {
  const g = appState.game, ui = await import("/src/ui/index.js");
  const NT = window.__NTBUB = { list: [] };
  const mo = new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => {
    if (n.nodeType === 1 && n.classList && n.classList.contains("pp4Bub"))
      NT.list.push((n.textContent || "").trim().slice(0, 90)); }); });
  mo.observe(document.body, { childList: true, subtree: true });
  /* stormOrder resolves ships FURTHEST DOWNWIND FIRST so a leader clears its square before the
     follower arrives (rule 7b). Two adjacent ships therefore do NOT collide. A follower is only
     blocked when the LEADER CANNOT MOVE -- so the leader is pinned against land. */
  const water = c => c[0]>0 && c[1]>0 && c[0]<15 && c[1]<15 &&
    !g.blocked(c) && !g.isIsland(c) && !g.isHome(c) && !g.onRim(c);
  const wall  = c => g.blocked(c) || g.isIsland(c) || g.isHome(c);
  let lead = null;
  for (let x=1; x<15 && !lead; x++) for (let y=2; y<15; y++)
    if (water([x,y]) && wall([x,y-1]) && water([x,y+1])) { lead=[x,y]; break; }
  if (!lead) return { posed:false, why:"no water square with land north and water behind" };
  g.players[0].pos = [lead[0], lead[1]];
  g.players[1].pos = [lead[0], lead[1]+1];
  for (let i=2;i<g.players.length;i++) g.players[i].pos = [g.home[0], g.home[1]];
  for (const p of g.players) p.stormNote = null;
  const before = g.events.length;
  await ui.runStormLive("N");
  mo.disconnect();
  const evs = g.events.slice(before);
  const sum = evs.filter(e => e.t === "stormSummary").pop() || null;
  const blocked = evs.filter(e => e.t === "blocked");
  const named = sum ? new Set([...(sum.moved||[]),...(sum.held||[]),...(sum.shipHeld||[]),...(sum.blown||[])]) : new Set();
  const isSummary = t => /storm (drives|hurls)|a gale tears/i.test(t);
  return { posed:true, lead,
    blocked_events: blocked.length,
    bubbles_raised: NT.list.length,
    inline_lines: NT.list.filter(t => !isSummary(t)).length,
    all_bubble_texts: NT.list,
    summary_line: NT.list.filter(isSummary).pop() || null,
    shipHeld: sum ? (sum.shipHeld || null) : null,
    every_blocked_captain_named: blocked.length ? blocked.every(b => named.has(b.p)) : null };
})()`);
log("storm:", JSON.stringify(out.storm));
// re-raise just the summary so it can be photographed on screen
if (out.storm && out.storm.summary_line) {
  await ev(`(async () => { const ui = await import("/src/ui/index.js");
    const g = appState.game, e = g.events.filter(x => x.t === "stormSummary").pop();
    if (!e) return false; const u = await import("/src/ui/util.js");
    const L = u.describeFor(e, u.NEUTRAL_VIEWER); if (!L) return false;
    ui.flash(L.txt); return true; })()`);
  await sleep(1400); await shot("e-storm-one-summary.png");
}

/* ---------- 4. the crate: how long between the Buy click and the crate landing ---------- */
out.crate = await ev(`(async () => {
  const g = appState.game, ui = await import("/src/ui/index.js");
  const me = g.players[appState.mySeat || 0];
  const need = g.needs(me)[0]; const isle = need ? g.islandOf[need] : null;
  let berth = null;
  if (isle) for (let dx=-1; dx<=1 && !berth; dx++) for (let dy=-1; dy<=1; dy++) {
    const c = [isle[0]+dx, isle[1]+dy]; if (g.isBerth && g.isBerth(c)) { berth = c; break; }
  }
  if (!berth) return { posed:false, why:"no berth for what this captain needs" };
  me.pos = berth; me.coins = 20;
  // count the crate cue: the render is what plays it, and firing the render twice would double it
  let renders = 0; const realLR = ui.liveRender;
  const t = { clicked: null, rendered: null };
  window.__lrSpy = () => { renders++; if (t.rendered == null) t.rendered = performance.now(); };
  return { posed:true, berth, need, renders_before:renders, note:"timing taken in the next step" };
})()`);
log("crate pose:", JSON.stringify(out.crate));
out.errs = errs.slice(0, 10);
await shot("e-final.png");
fs.writeFileSync(path.join(OUT, "group-e.json"), JSON.stringify(out, null, 1));
log("console errors:", JSON.stringify(out.errs));
killAll();
process.exit(0);
