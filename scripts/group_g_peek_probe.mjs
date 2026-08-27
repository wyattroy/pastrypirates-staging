#!/usr/bin/env node
/* group_g_peek_probe.mjs — FAULT 5's real question, asked properly.
 *
 * The judge read solo-desktop-014 as "the narration bubble is drawn UNDERNEATH the sail-square
 * highlights". group_g_shots.mjs measured the stacking and that reading is wrong: .pp4Bub sits in
 * #pp4Fx (z-index 21) and .sailCell sits in #boardwrap (z-index 5), and those two are SIBLINGS in
 * one stacking context (body.pp4Stage, which makes a context through its own transform). Nothing
 * between them inverts it, and a posed bubble measures opacity 1 standing on 0 of 19 squares.
 *
 * So the words were ghosted by OPACITY, not by paint order — and the only thing in the game that
 * fades a narration bubble AND hides the whole prompt at the same time is `body.pp4Peek`, the
 * hold-the-sea gesture. This probe proves that mechanism reproduces the picture, and then asks the
 * question that actually matters:
 *
 *   CAN THE PEEK STICK? `pointerdown` on #boardwrap adds .pp4Peek unconditionally; it is removed
 *   only by `pointerup`/`pointercancel` bound to #boardwrap itself, with no setPointerCapture. A
 *   pointer that goes down on the sea and comes up somewhere else therefore never disarms it — and
 *   a stuck peek leaves every prompt in the game at 13% opacity with pointer-events:none.
 *
 * RED-PROOF: every reading is taken against the known-negative first (peek OFF, bubble opaque).
 * Hygiene: headless, --mute-audio, own ports, kills what it starts.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPO, gameURL } from "./lib/chrome.mjs";
import { openChrome, sleep } from "./lib/cdp.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(arg("out", "/tmp/group-g-peek"));
const PORT = +arg("port", 8473), DBG = +arg("dbg", 9473);
const [W, H] = arg("size", "1890x960").split("x").map(Number);
const ROOT = path.resolve(arg("root", REPO));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(" "); console.log(s); fs.appendFileSync(path.join(OUT, "log.txt"), s + "\n"); };

const c = await openChrome({ W, H, dbgPort: DBG, httpPort: PORT, serveRoot: ROOT, profileDir: path.join(OUT, "prof") });
const out = {};
async function finish(code) {
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(out, null, 2));
  try { c.close(); } catch {}
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`, { stdio: "ignore" }); } catch {}
  try { execSync(`pkill -f "http.server ${PORT}"`, { stdio: "ignore" }); } catch {}
  process.exit(code);
}
const ev = e => c.ev(e);
const shot = n => c.shot(path.join(OUT, `${n}.png`));
process.on("SIGINT", () => finish(1));

/* ---- boot ---- */
await c.nav(gameURL(PORT)); await sleep(2000);
await ev("localStorage.clear(); 1");
await c.nav(gameURL(PORT)); await sleep(2500);
await ev(`window.__gate = el => { if(!el) return null; const r=el.getBoundingClientRect();
  if (r.width<4||r.height<4) return null; return {x:r.left+r.width/2, y:r.top+r.height/2}; };`);
const clickId = async id => { const g = await ev(`__gate(document.getElementById(${JSON.stringify(id)}))`); if (g) await c.clickXY(g.x, g.y); return !!g; };
await clickId("choiceSolo"); await sleep(900);
{ const g = await ev("__gate(document.getElementById('nameModalInput'))");
  if (g) { await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: g.x, y: g.y, button: "left", clickCount: 3 });
           await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: g.x, y: g.y, button: "left", clickCount: 3 });
           await c.type("Davy Scones"); } }
await clickId("btnNameConfirm");
{ let ok = false; for (let i = 0; i < 60 && !ok; i++) { await sleep(500);
    ok = await ev(`(async()=>{try{if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;}
      const g=window.appState.game; return !!(g&&g.players.some(p=>p.strategy==='human')&&document.getElementById('pp4Ribbon'));}catch(e){return false}})()`); }
  if (!ok) { log("ABORT: no solo game"); await finish(1); } }
await ev(`(async()=>{ window.__G = { st:(await import('/src/state/index.js')).appState,
  flow:await import('/src/ui/flow.js'), board:await import('/src/ui/board.js') }; return 1; })()`);
// clear the intro barriers
for (let i = 0; i < 26; i++) {
  const n = await ev("[...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b=>b.getBoundingClientRect().width>4).length");
  const staged = await ev("!!document.getElementById('actionPanel').dataset.pp4Stage || !!document.querySelector('#pp4Prompt .recipeList')");
  if (!staged && n === 0) break;
  const g = await ev(`(()=>{const e=document.querySelector('#pp4Prompt .recipeCard, #pp4Prompt .bkoCard') ||
    [...document.querySelectorAll('#pp4Prompt .apBtn')].filter(b=>!/back|←|‹/i.test(b.textContent))[0]; return __gate(e);})()`);
  if (g) await c.clickXY(g.x, g.y); else await sleep(400);
  await sleep(650);
}
log("booted.");

/* ---- pose: the engine's own sail window + a narration bubble, exactly as 014 shows ---- */
const pose = async () => ev(`(async()=>{ const {st,flow,board}=window.__G; const g=st.game;
  document.querySelectorAll('.sailCell').forEach(e=>e.remove());
  const seat=st.mySeat??0, p=g.players[seat];
  p.pos=[(g.cfg.grid/2|0),(g.cfg.grid/2|0)]; board.paintShipAt(seat,p.pos);
  await new Promise(r=>setTimeout(r,700));
  const cells=g.reachableFrom(p)||[]; const cellPx=640/g.cfg.grid; const svg=document.getElementById('board');
  for(const cc of cells) flow.sailHighlightRect(cc,cellPx,svg);
  window.__pp4.subject=seat; window.__pp4.narr("Ahoy, Davy Scones — yer turn!");
  return {sails:document.querySelectorAll('.sailCell').length}; })()`);

const READ = `(() => { const b=document.querySelector('.pp4Bub'), pr=document.getElementById('pp4Prompt');
  return { peek: document.body.classList.contains('pp4Peek'),
    bubOpacity: b?getComputedStyle(b).opacity:null, bubText: b?b.textContent.trim().slice(0,40):null,
    promptOpacity: pr?getComputedStyle(pr).opacity:null,
    promptPE: pr?getComputedStyle(pr).pointerEvents:null }; })()`;

out.pose = await pose(); await sleep(900);

/* ---- (A) RED-PROOF: peek OFF. The bubble must be opaque and the prompt reachable. ---- */
out.off = await ev(READ);
out.offShot = await shot("A-peek-off");
log(`A (red-proof, no peek): ${JSON.stringify(out.off)}`);

/* ---- (B) the gesture, held: does it reproduce 014's picture? ---- */
const wrap = await ev(`(()=>{const w=document.getElementById('boardwrap'); const r=w.getBoundingClientRect();
  return {x:+(r.left+r.width*0.5).toFixed(1), y:+(r.top+r.height*0.12).toFixed(1),
          l:+r.left.toFixed(1), t:+r.top.toFixed(1), r:+r.right.toFixed(1), b:+r.bottom.toFixed(1)};})()`);
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: wrap.x, y: wrap.y });
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: wrap.x, y: wrap.y, button: "left", clickCount: 1 });
await sleep(600);
out.held = await ev(READ);
out.heldShot = await shot("B-peek-held");
log(`B (finger down on the sea, 600ms): ${JSON.stringify(out.held)}`);
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: wrap.x, y: wrap.y, button: "left", clickCount: 1 });
await sleep(900);
out.released = await ev(READ);
log(`B' (released on the sea): ${JSON.stringify(out.released)}`);

/* ---- (C) the transition, sampled: how long is a bubble ghosted by an ORDINARY tap? ----
   A gate screenshot lands at an arbitrary instant, so the honest question is not "is it faded" but
   "for how long is it faded, and how faint does it get". Sampled at 60ms through the whole
   arm-and-release cycle of one plain click. */
await pose(); await sleep(900);
out.tap = [];
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: wrap.x, y: wrap.y, button: "left", clickCount: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: wrap.x, y: wrap.y, button: "left", clickCount: 1 });
for (let i = 0; i < 14; i++) { out.tap.push(await ev(READ)); await sleep(60); }
log(`C (one ordinary tap on the sea) bubble opacity over ~840ms: ${out.tap.map(t => t.bubOpacity).join(" ")}`);
log(`C                              peek class over the same:   ${out.tap.map(t => (t.peek ? "1" : "0")).join(" ")}`);

/* ---- (D) THE ONE THAT MATTERS: down on the sea, up somewhere else. ---- */
await sleep(1200);
await pose(); await sleep(900);
out.beforeDrag = await ev(READ);
const offBoard = { x: Math.min(wrap.r + 120, W - 8), y: wrap.y };   // the captains column, off #boardwrap
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: wrap.x, y: wrap.y });
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: wrap.x, y: wrap.y, button: "left", clickCount: 1 });
await sleep(120);
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: offBoard.x, y: offBoard.y, button: "left", buttons: 1 });
await sleep(120);
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: offBoard.x, y: offBoard.y, button: "left", clickCount: 1 });
await sleep(1500);
out.afterDrag = await ev(READ);
out.dragShot = await shot("D-released-off-the-board");
log(`D before drag: ${JSON.stringify(out.beforeDrag)}`);
log(`D  after drag (released at ${offBoard.x},${offBoard.y}, outside #boardwrap ${wrap.l}-${wrap.r}): ${JSON.stringify(out.afterDrag)}`);
log(`D VERDICT — peek STUCK: ${out.afterDrag.peek === true}`);
// …and is the game still playable with it stuck? a prompt at pointer-events:none takes no taps.
await sleep(2500);
out.afterDragLater = await ev(READ);
log(`D 2.5s later, unattended: ${JSON.stringify(out.afterDragLater)}`);

await finish(0);
