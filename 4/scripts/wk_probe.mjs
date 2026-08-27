/* wk_probe.mjs — THE WEBKIT RUNNER: drive a real WebKit engine (WebKitGTK via WebKitWebDriver)
 * against a page and measure an element's painted swing. The Safari-engine half of the rig that
 * the Chromium-only container never had — built 2026-08-24 after the pulse bug shipped twice
 * because every probe ran Chromium while the bug lived in WebKit.
 *
 * Usage:  xvfb-run -a node 4/scripts/wk_probe.mjs <url> <cssSelector> [sampleMs=1400]
 * Prints: JSON { engine, min, max, swing } of the selector's painted width across the window.
 *
 * RED-PROOF (run before trusting): 4/scripts/wk_redproof.sh drives the known-bad 24d pattern
 * (scale(var()) inside @keyframes, the class landing after animation start) and the known-good
 * literal pattern; WebKit must show the first ~flat/weak and the second at full swing, or this
 * instrument cannot detect the bug class it exists for.
 *
 * Requirements (this container, installed 2026-08-24): webkit2gtk-driver, xvfb.
 * The driver launches MiniBrowser in automation mode; GTK needs the virtual display. */
import { spawn } from "node:child_process";

const [url, selector, sampleMsArg] = process.argv.slice(2);
if (!url || !selector) { console.error("usage: wk_probe.mjs <url> <selector> [sampleMs]"); process.exit(2); }
const sampleMs = +sampleMsArg || 1400;
const PORT = 4723 + Math.floor(Math.random() * 200);

const drv = spawn("WebKitWebDriver", [`--port=${PORT}`, "--host=127.0.0.1"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (method, path, body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method, headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
};

let sessionId = null;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/status`); up = true; } catch { await sleep(250); } }
  if (!up) throw new Error("WebKitWebDriver never came up");
  const ses = await api("POST", "/session", { capabilities: { alwaysMatch: {
    browserName: "MiniBrowser",
    "webkitgtk:browserOptions": { args: ["--automation"] },
  } } });
  sessionId = ses.value && ses.value.sessionId;
  if (!sessionId) throw new Error("no session: " + JSON.stringify(ses).slice(0, 300));
  await api("POST", `/session/${sessionId}/url`, { url });
  await sleep(1200);   // let the page and its animations settle in
  const script = `
    const done = arguments[arguments.length - 1];
    (async () => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return done(JSON.stringify({ error: "selector not found" }));
      let min = 1e9, max = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ${sampleMs}) {
        const w = el.getBoundingClientRect().width;
        if (w < min) min = w; if (w > max) max = w;
        await new Promise(r => setTimeout(r, 40));
      }
      done(JSON.stringify({ min: +min.toFixed(1), max: +max.toFixed(1), swing: +(max - min).toFixed(1) }));
    })();`;
  const out = await api("POST", `/session/${sessionId}/execute/async`, { script, args: [] });
  const parsed = JSON.parse(out.value);
  console.log(JSON.stringify({ engine: "webkitgtk", url, selector, ...parsed }));
  process.exitCode = parsed.error ? 1 : 0;   // exitCode, NEVER process.exit(): exit() inside try
                                             // skips this finally and leaks the driver — caught
                                             // 2026-08-24, four orphaned WebKitWebDrivers (rule 17)
} catch (e) {
  console.error("WK-PROBE ERROR:", e.message);
  process.exitCode = 1;
} finally {
  try { if (sessionId) await api("DELETE", `/session/${sessionId}`); } catch {}
  try { drv.kill("SIGKILL"); } catch {}
}
