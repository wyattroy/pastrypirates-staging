// cdp.mjs — a tiny Chrome DevTools Protocol client: launch a headless Chrome, drive it, screenshot
// it, kill it — scoped to its own ports so it never touches another agent's probe (HARD-WON-LESSONS §8).
// Shared by playtest.mjs (and reusable by any future browser gate). Nothing game-specific lives here.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, LINUX_ARGS } from "./chrome.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// one Chrome tab, driven over CDP. `serveRoot` is served on `httpPort` (fresh port = fresh module
// cache, DRIVING-THE-GAME.md §1). Returns a rich handle; call .close() when done.
export async function openChrome({ W, H, dbgPort, httpPort, serveRoot, profileDir, mobile = false, dsf = 1 }) {
  const srv = httpPort ? spawn("python3", ["-m", "http.server", String(httpPort)], { cwd: serveRoot, stdio: "ignore" }) : null;
  fs.rmSync(profileDir, { recursive: true, force: true });
  const args = [...LINUX_ARGS, "--headless=new", "--mute-audio", `--remote-debugging-port=${dbgPort}`,
    `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check",
    `--window-size=${W},${H}`, "--autoplay-policy=no-user-gesture-required", "about:blank"];
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  await sleep(1200);
  let tgt; for (let i = 0; i < 30 && !tgt; i++) { try { tgt = await (await fetch(`http://127.0.0.1:${dbgPort}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await sleep(300); } }
  if (!tgt) { try { proc.kill("SIGKILL"); } catch {} if (srv) try { srv.kill("SIGKILL"); } catch {} throw new Error(`chrome never came up on ${dbgPort}`); }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const consoleErrs = [];
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") consoleErrs.push("EXC " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "").slice(0, 200));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrs.push("ERR " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }; return r.result?.result?.value; };
  await send("Page.enable"); await send("Runtime.enable");
  /* THE PAGE MUST BELIEVE IT IS FOCUSED AND VISIBLE, OR THE GAME CORRECTLY PAUSES ITSELF.
     A headless tab that loses foreground reports `document.hidden === true`; Pastry Pirates then
     does exactly the right thing and pauses (its tab-hide gate), `waitWhilePaused()` waits forever,
     and the harness reports a frozen event stream — an immaculate forgery of a game-stopping stall
     (see docs/HARD-WON-LESSONS.md, 2026-08-21). `Page.bringToFront` was tried first and does not
     hold in headless: the gate logged "would not come to front" once a second for six minutes.
     setFocusEmulationEnabled is the API meant for this — it makes the page permanently believe it
     is focused and active, so the pause can never be triggered by the harness's own backgrounding. */
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dsf, mobile });
  /* `mobile:true` alone does NOT make `matchMedia('(pointer: coarse)')` true — it governs viewport
     meta and text autosizing. Touch emulation is what flips the pointer type, and without it a
     390x844 leg still takes every DESKTOP branch of anything that asks what kind of pointer it has.
     Measured: the phone leg's screenshot came back reading "Click and hold the sea" where a real
     phone says "Tap and hold" (D-40). A phone leg that does not emulate a phone tests the wrong game. */
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }).catch(() => {});
  let shotN = 0;
  const shot = async (file) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(file, Buffer.from(r.result.data, "base64")); return file; };
  const clickXY = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); };
  const type = async (text) => send("Input.insertText", { text });
  const nav = async (url) => send("Page.navigate", { url });
  const close = () => { try { ws.close(); } catch {} try { proc.kill("SIGKILL"); } catch {}
    try { execSync(`pkill -f "remote-debugging-port=${dbgPort}"`, { stdio: "ignore" }); } catch {}
    if (srv) { try { srv.kill("SIGKILL"); } catch {} try { execSync(`pkill -f "http.server ${httpPort}"`, { stdio: "ignore" }); } catch {} } };
  return { W, H, httpPort, send, ev, shot, clickXY, type, nav, close, consoleErrs, sleep };
}

export { sleep };
