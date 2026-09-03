/* SCRATCH — T-141. WHEN does the board actually stop moving, and WHICH elements never do?
 *
 * The trial gives up at its 2600ms cap and reports "N screens never stopped moving" either way, so
 * it cannot tell "settles at 2.7s" from "never settles". This samples the SAME signature
 * `checks.mjs` uses, well past the cap, and reports the last time it changed — plus the per-selector
 * churn, which is the part that decides whether this is the game or the instrument.
 *
 * KEY CONTEXT from checks.mjs:176-181, and it reframes the question: half this board never stops by
 * design — `.sailCell` carries a permanent bounce, ships glide, the ripple pulses. Exact rects were
 * measured hitting the cap on essentially every screen, and the fix was QUANTISING TO 8px to
 * separate "arriving" from "breathing". So if geometry is failing again, something is now breathing
 * MORE THAN 8px — and naming it is the whole job.
 *
 * ⚠ BOUNDED AND SELF-KILLING (rule 17): fixed sample count, browser killed in a finally, own port
 * and profile. No sea trial is at sea (the 0624Z run ended), so nothing is being skewed.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, LINUX_ARGS } from "../lib/chrome.mjs";

const PORT = 9611;
const SAMPLES = 70;          // 70 x 120ms = 8.4s, comfortably past the 2600ms cap
const EVERY_MS = 120;        // checks.mjs samples at 120ms
const profile = path.join(process.env.TEMP || "/tmp", "chrome-t141");
fs.rmSync(profile, { recursive: true, force: true });

let proc = null, srv = null;
const out = (m) => console.log(m);

try {
  // Serve the repo — the game is static, no build step.
  srv = spawn(process.execPath, ["-e", `
    const http=require("http"),fs=require("fs"),p=require("path");
    http.createServer((q,s)=>{let f=p.join(process.cwd(),decodeURIComponent(q.url.split("?")[0]));
      if(f.endsWith(p.sep))f=p.join(f,"index.html");
      fs.readFile(f,(e,d)=>{ if(e){s.writeHead(404);s.end();return;}
        const t={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
                 ".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"}[p.extname(f)]||"application/octet-stream";
        s.writeHead(200,{"content-type":t});s.end(d);});
    }).listen(8791);
  `], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((r) => setTimeout(r, 900));

  proc = spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--mute-audio", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1200,900",
    "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });

  let ver = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { /* not up */ }
  }
  if (!ver) throw new Error("Chrome never came up");
  out("  browser: " + ver.Browser);

  let target = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); } };
  const send = (method, params) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send("Page.enable", {});
  await send("Page.navigate", { url: "http://127.0.0.1:8791/index.html" });
  await new Promise((r) => setTimeout(r, 2500));

  // Start a solo game so the board is real, not the menu.
  const started = await evalJs(`(function(){
    var b = [...document.querySelectorAll("button, .apBtn, .pp4Btn")].find(function(e){ return /solo|start|play/i.test(e.textContent||""); });
    if (b) { b.click(); return "clicked: " + (b.textContent||"").trim().slice(0,40); }
    return "no start button found";
  })()`);
  out("  start: " + started);
  /* ⛔ THIS PROBE DOES NOT WORK, AND THE REASON IS NOT WHAT I FIRST WROTE HERE.
   *
   * I removed a 2500ms sleep from this spot and blamed it — "a settle trace begun after the reveal
   * had finished", CLAUDE.md's own named failure. **That was wrong, and CEO 156 disproved it by
   * counting at both moments:** immediately after the click AND four seconds later, every selector
   * is still zero and `#lobby` is still `display:flex`. **Waiting was never the issue. THE GAME
   * NEVER STARTS.** The click lands on a real, visible `#choiceSolo` (184x114, display:flex) and
   * nothing follows it.
   *
   * So a next session reading the old comment would have gone hunting for a timing fix. **A wrong
   * diagnosis in a comment is worse than no comment: it aims the next reader at the wrong thing**,
   * which is the fault this project already named about a rule pointing at a dead cause.
   *
   * ⛔ DO NOT PATCH THIS PROBE. `docs/DRIVING-THE-GAME.md` §5b is "the autoplay driver — the loop
   * that actually plays", written because naive drivers stall exactly here, and CLAUDE.md says to
   * read it BEFORE touching a browser. I did not, and this file is the cost. Start there. */

  /* The SAME signature checks.mjs uses — per selector, so churn can be attributed. */
  const PER_SEL = `(() => {
    const sels = ['.apBtn','.btlBtn','.sailCell','.recipeCard','.bkoCard','.apSlider','#flipCoinWrap.active','.apMsg','.apSub'];
    const q = v => Math.round(v / 8);
    const o = {};
    for (const s of sels) {
      o[s] = [...document.querySelectorAll(s)].map(el => { const r = el.getBoundingClientRect();
        return q(r.left)+','+q(r.top)+','+q(r.width)+','+q(r.height); }).join(';');
    }
    return JSON.stringify(o);
  })()`;

  /* ⛔ DOES THIS PROBE SEE ITS SUBJECT AT ALL? Rule 6: check a check can FAIL before believing it
     passing. Two runs reported "nothing moved at all" — which reads like a settled board and is
     indistinguishable from a probe whose selectors match ZERO elements. Count first. */
  const counts = await evalJs(`(() => {
    const sels = ['.apBtn','.btlBtn','.sailCell','.recipeCard','.bkoCard','.apSlider','.apMsg','.apSub'];
    const o = {}; for (const s of sels) o[s] = document.querySelectorAll(s).length;
    o.__anyDiv = document.querySelectorAll("div").length;
    o.__title = (document.title||"").slice(0,40);
    return JSON.stringify(o);
  })()`);
  out("  elements the probe can see: " + counts);
  const seen = JSON.parse(counts || "{}");
  const total = Object.entries(seen).filter(([k]) => !k.startsWith("__")).reduce((a,[,v]) => a+v, 0);
  if (total === 0) {
    out("  ⛔ THE PROBE SEES ZERO OF ITS OWN SELECTORS — any 'nothing moved' verdict from here is");
    out("     about the probe, not about the board. Not reporting a settle time.");
  }

  const t0 = Date.now();
  let prev = null;
  const lastChange = {};   // selector -> ms of last change
  let lastAnyChange = 0, changes = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const now = Date.now() - t0;
    const cur = JSON.parse(await evalJs(PER_SEL) || "{}");
    if (prev) {
      let any = false;
      for (const k of Object.keys(cur)) {
        if (cur[k] !== prev[k]) { lastChange[k] = now; any = true; }
      }
      if (any) { lastAnyChange = now; changes++; }
    }
    prev = cur;
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }

  const span = Date.now() - t0;
  out("");
  out(`  sampled ${SAMPLES}x every ${EVERY_MS}ms over ${(span/1000).toFixed(1)}s`);
  out(`  samples in which ANYTHING moved: ${changes}`);
  out(`  LAST movement of any kind at: ${lastAnyChange}ms`);
  out(`  the 2600ms cap would have given up at: 2600ms`);
  out("");
  out("  per selector — last time it changed (blank = never moved during the window):");
  for (const [k, v] of Object.entries(lastChange).sort((a,b) => b[1]-a[1])) {
    out(`    ${String(v).padStart(5)}ms   ${k}${v > 2600 ? "   <-- STILL MOVING PAST THE CAP" : ""}`);
  }
  out("");
  out(lastAnyChange === 0
    ? "  VERDICT: nothing moved at all in the window — the board was already still."
    : lastAnyChange > span - (EVERY_MS * 3)
      ? `  VERDICT: STILL MOVING AT THE END OF THE WINDOW (${(span/1000).toFixed(1)}s). Something animates indefinitely — no deadline fixes this.`
      : `  VERDICT: the board went still at ${lastAnyChange}ms — ${lastAnyChange > 2600 ? "PAST" : "INSIDE"} the 2600ms cap.`);

  try { ws.close(); } catch { /* closing */ }
} catch (e) {
  out("  probe error: " + String(e && e.message).slice(0, 200));
} finally {
  if (proc) { try { proc.kill("SIGKILL"); } catch { /* gone */ } }
  if (srv) { try { srv.kill("SIGKILL"); } catch { /* gone */ } }
  await new Promise((r) => setTimeout(r, 400));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}
