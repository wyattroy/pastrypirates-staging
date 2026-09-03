/* SCRATCH — his DO NOW pin, 2026-09-03T18:28:56Z: *"Def to move doesn't work on mobile. New idea:
 * add a 'move to top' button to the right of each item in the list. I click it once, it puts it at
 * the top of the list."*
 *
 * Rule 19: LOOK AT THE RENDERED PICTURE, on the device it is for. This drives a real headless
 * Chrome at 390x844 (his phone), TAPS the button the way he would — a real touch sequence, not a
 * synthetic click — and measures the tap target, then screenshots before and after.
 *
 * ⚠ BOUNDED AND SELF-KILLING (rule 17): every wait is a for-loop with a ceiling and the browser is
 * killed in a finally block. Its own port and profile, so a sea trial sailing on this machine is
 * untouched.
 *
 * WHY A TOUCH TAP AND NOT element.click(): the whole complaint is that a POINTER gesture fails for
 * him. A synthetic click bypasses exactly the layer under suspicion and would prove nothing about
 * his phone — the "measurement that cannot fail" this project keeps paying for.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, LINUX_ARGS } from "../lib/chrome.mjs";

const PAGE = process.argv[2];
const OUT = process.argv[3] || ".";
if (!PAGE || !fs.existsSync(PAGE)) { console.log("usage: node _totop_phone_probe.mjs <page.html> [outdir]"); process.exit(2); }

const PORT = 9487;
const profile = path.join(process.env.TEMP || "/tmp", "chrome-totopprobe");
fs.rmSync(profile, { recursive: true, force: true });
let proc = null, failed = 0;
const ok = (m) => console.log("  PASS  " + m);
const bad = (m) => { console.log("  FAIL  " + m); failed++; };

try {
  proc = spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--mute-audio", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=390,844",
    "file:///" + PAGE.replace(/\\/g, "/")], { stdio: ["ignore", "pipe", "pipe"] });

  let ver = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { /* not up */ }
  }
  if (!ver) { bad("Chrome never came up on port " + PORT); throw new Error("no browser"); }

  let target = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  }
  if (!target) { bad("the page never appeared as a target"); throw new Error("no target"); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params) => new Promise((res) => {
    const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    if (r.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); return true; }
    return false;
  };

  await send("Page.enable", {});
  // A fake artifact host so the save path is REACHED — without it saveOrder returns at `if (!cap)`
  // and this probe would exercise a guard clause instead of the thing it is named after (CEO 143).
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__pubs = 0; window.__pageErrors = [];
    window.addEventListener("error", function(e){ window.__pageErrors.push(String(e.message)); });
    window.claude = { use: function(){ return Promise.resolve({
      publish: function(){ window.__pubs++; return Promise.resolve(); } }); } };
  ` });

  // HIS PHONE, and a real touch device — not just a narrow window.
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: "file:///" + PAGE.replace(/\\/g, "/") });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await evalJs("document.readyState === 'complete' && !!document.querySelector('button.totop')")) break;
  }

  const geo = await evalJs(`(function(){
    var b = document.querySelector("button.totop");
    if (!b) return null;
    var r = b.getBoundingClientRect(), li = b.parentNode.getBoundingClientRect();
    var t = b.parentNode.querySelector(".rowtitle").getBoundingClientRect();
    return { n: document.querySelectorAll("button.totop").length,
             w: Math.round(r.width), h: Math.round(r.height),
             inside: r.right <= li.right + 1 && r.left >= li.left - 1,
             overlapsTitle: r.left < t.right - 1,
             sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  })()`);
  if (!geo) { bad("no move-to-top button on the page at all"); throw new Error("no button"); }
  console.log(`  ${geo.n} button(s), ${geo.w}x${geo.h}px at 390x844`);
  if (geo.w >= 44 && geo.h >= 32) ok(`the tap target is ${geo.w}x${geo.h} — a thumb, not a link`);
  else bad(`the tap target is only ${geo.w}x${geo.h} — this button exists BECAUSE a fine gesture failed him`);
  if (geo.inside) ok("it sits inside its row"); else bad("it hangs outside its row");
  if (!geo.overlapsTitle) ok("it does not cover the row's words"); else bad("it overlaps the row title — his text is behind it");
  if (!geo.sideways) ok("the page does not scroll sideways on his phone"); else bad("the page scrolls sideways at 390px");

  await shot("totop-phone-before.png");
  ok("screenshot: before");

  // The LAST row's button, so a real move is visible.
  const before = await evalJs(`Array.prototype.map.call(document.querySelectorAll("li.drag"), function(l){return l.getAttribute("data-handle");}).join(",")`);
  const box = await evalJs(`(function(){
    var all = document.querySelectorAll("li.drag button.totop");
    var b = all[all.length - 1];
    b.scrollIntoView({block:"center"});
    var r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
             handle: b.parentNode.getAttribute("data-handle") };
  })()`);

  // A REAL TAP: touchStart then touchEnd at his finger's position.
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await evalJs("window.__pubs > 0")) break;
  }

  const after = await evalJs(`Array.prototype.map.call(document.querySelectorAll("li.drag"), function(l){return l.getAttribute("data-handle");}).join(",")`);
  const pubs = await evalJs("window.__pubs");
  const note = await evalJs(`(document.getElementById("orderNote")||{}).textContent || ""`);
  const errs = await evalJs("JSON.stringify(window.__pageErrors)");

  console.log(`  tapped ${box.handle} at (${box.x},${box.y})`);
  if (after.split(",")[0] === box.handle) ok(`ONE TAP moved it to the top (was last of ${before.split(",").length})`);
  else bad(`the tap did not move it — order is still ${after.slice(0, 60)}…`);
  if (pubs > 0) ok(`the new order was published (${pubs} publish call) — it survives a reload`);
  else bad("nothing was published, so his order would vanish on reload");
  if (!/Didn.t save/.test(note)) ok(`the page tells him: "${note.slice(0, 70)}"`);
  else bad(`the page reports a failure: "${note}"`);
  if (errs === "[]") ok("the page threw nothing while doing it"); else bad("page errors: " + errs);

  await shot("totop-phone-after.png");
  ok("screenshot: after");
} finally {
  if (proc) { try { proc.kill("SIGKILL"); } catch { /* already gone */ } }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked, harmless */ }
}
console.log(failed ? `\n${failed} failure(s).` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
