#!/usr/bin/env node
/* recipe_card_shots.mjs — D-35's proof, and it is a PICTURE, not a number.
 *
 *   node 4/scripts/recipe_card_shots.mjs <outdir> <port> <dbgport>
 *
 * Wyatt's two changes to option C are things you look at: is the image still cramped against the
 * italic description, and does the lighter gradient still stop dead in a band below the title. So
 * this opens the live recipe modal at 1400x900 and at 390x844, screenshots both, screenshots the
 * PRINT rendering (the path a dark card breaks — threat T-02.2-39), and reads back the two
 * geometries so the pictures can be checked against numbers rather than only squinted at.
 *
 * POSED, NOT PLAYED (DRIVING-THE-GAME §5e). A recipe is drafted several prompts into a voyage; the
 * modal only needs a recipe array on a seat, so the LIVE appState object is given one. Nothing in
 * 4/src is edited to make this happen — a live mutation cannot ship, an engine edit can.
 * RED-PROOFED: the known-negative runs FIRST — with no recipe on the seat, openRecipeModal must
 * draw nothing — so a pass afterwards is a pass at something.
 * SOLO ONLY. Headless, muted, bounded loops, and it kills its own ports before it returns.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO, CHROME, LINUX_ARGS, gameURL } from "./lib/chrome.mjs";
import { RECIPE_PROBE_SRC } from "./lib/narration_probe.mjs";

const OUT = process.argv[2] || "/tmp/recipe-shots";
const PORT = +(process.argv[3] || 8671), DBG = +(process.argv[4] || 9671);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] ` + a.join(" "));

const procs = [];
const kill = () => {
  for (const p of procs) { try { p.kill("SIGKILL"); } catch {} }
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`, { stdio: "ignore" }); } catch {}
  try { execSync(`pkill -f "http.server ${PORT}"`, { stdio: "ignore" }); } catch {}
};
process.on("exit", kill);
process.on("SIGINT", () => { kill(); process.exit(1); });

procs.push(spawn("python3", ["-m", "http.server", String(PORT)], { cwd: REPO, stdio: "ignore" }));
const prof = path.join(OUT, "prof");
fs.rmSync(prof, { recursive: true, force: true });
procs.push(spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--mute-audio",
  `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, "--no-first-run",
  "--no-default-browser-check", "--window-size=1400,900",
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
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Runtime.enable");
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: String(r.result.exceptionDetails.exception?.description || "").slice(0, 240) };
  return r.result?.result?.value; };
const metrics = (w, h) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
const shot = async name => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (r.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); log("shot", name); } };

const URL0 = gameURL(PORT);
await metrics(1400, 900);
await send("Page.navigate", { url: URL0 }); await sleep(1600);
await ev("localStorage.clear(); 1");
await send("Page.navigate", { url: URL0 }); await sleep(2600);
await ev(`(() => { const b=document.getElementById("choiceSolo"); if(b) b.click(); return !!b; })()`);
await sleep(900);
await ev(`(() => { const i=document.getElementById("nameModalInput"); if(!i) return false;
  i.value="Claude"; document.getElementById("btnNameConfirm").click(); return true; })()`);
for (let i = 0; i < 40; i++) { const ok = await ev(`!!(window.appState && appState.game)`); if (ok === true) break; await sleep(400); }
await ev(`(async()=>{ if(!window.appState){ const m=await import('/src/state/index.js'); window.appState=m.appState; } return !!window.appState; })()`);

/* ---- RED PROOF, before anything is believed: no recipe on the seat -> no card ---- */
const red = await ev(`(async () => {
  const ui = await import("/src/ui/index.js");
  const seat = appState.mySeat || 0;
  const keep = appState.game.players[seat].recipe;
  appState.game.players[seat].recipe = null;
  ui.openRecipeModal(appState.game.players[seat].recipe);
  await new Promise(r => setTimeout(r, 400));
  const body = document.getElementById("recipeModalBody");
  const drew = !!(body && body.querySelector("h2"));
  appState.game.players[seat].recipe = keep;
  document.getElementById("recipeModal").style.display = "none";
  return { drew_with_no_recipe: drew };
})()`);
log("RED PROOF:", JSON.stringify(red), red && red.drew_with_no_recipe === false ? "(seen red — the probe can fail)" : "(!! the probe cannot fail)");

/* ---- pose a real recipe on this seat and look at it ---- */
const posed = await ev(`(async () => {
  const r = await import("/src/ui/recipe.js");
  const seat = appState.mySeat || 0, p = appState.game.players[seat];
  if (!p.recipe) {
    // the draft has not happened yet, so hand the seat a real recipe from the book the modal reads
    // a real entry out of the book the modal reads, so the art, the yield, the ingredients and the
    // steps are all the game's own — not a stub that would make the card look shorter than it is
    p.recipe = r.RECIPE_BOOK[0].ings.slice();
  }
  return { seat, recipe: p.recipe, title: r.recipeTitle(p.recipe) };
})()`);
log("posed recipe:", JSON.stringify(posed));

const out = { redproof: red, posed, errs: [] };
for (const [w, h] of [[1400, 900], [390, 844]]) {
  await metrics(w, h); await sleep(400);
  out["w" + w] = await ev(RECIPE_PROBE_SRC);
  log(`w${w}:`, JSON.stringify(out["w" + w]));
  await shot(`e-recipe-${w}.png`);
  // scrolled down, so the sticky title row can be SEEN sticking
  await ev(`(() => { const b=document.getElementById("recipeModalBody"); if(b) b.scrollTop = 320; return true; })()`);
  await sleep(350);
  await shot(`e-recipe-${w}-scrolled.png`);
  await ev(`(() => { const b=document.getElementById("recipeModalBody"); if(b) b.scrollTop = 0; return true; })()`);
}
/* ---- the print path: emulate print media and photograph what comes out ---- */
await metrics(1400, 1400); await sleep(300);
await send("Emulation.setEmulatedMedia", { media: "print" });
await sleep(500); await shot("e-recipe-print.png");
out.print = await ev(`(() => { const b=document.getElementById("recipeModalBody");
  if(!b) return {missing:true};
  const h2=b.querySelector("h2"), row=b.querySelector(".recipeModalTitleRow"), li=b.querySelector("li");
  const cs=el=>el?getComputedStyle(el):null;
  return { h2_color: cs(h2)&&cs(h2).color, row_position: cs(row)&&cs(row).position,
    card_bg: getComputedStyle(document.querySelector("#recipeModal .modalCard")).backgroundImage.slice(0,24),
    icons_hidden: [...b.querySelectorAll(".recipeIconBtn")].every(x=>getComputedStyle(x).display==="none"),
    li_color: cs(li)&&cs(li).color }; })()`);
log("print:", JSON.stringify(out.print));
await send("Emulation.setEmulatedMedia", { media: "" });
out.errs = errs.slice(0, 8);
fs.writeFileSync(path.join(OUT, "recipe.json"), JSON.stringify(out, null, 1));
log("console errors:", JSON.stringify(out.errs));
kill();
process.exit(0);
