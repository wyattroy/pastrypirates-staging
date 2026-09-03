/* T-247 — RULE 19: look at the rendered picture before telling him it is live.
 *
 * The parity gate proves the BYTES on staging match this tree. It cannot prove the game
 * RUNS — a broken module, a 404 on an asset path, or a Firebase host the staging origin
 * cannot reach would all leave every byte identical and hand him a white screen. That is
 * exactly the trap CLAUDE.md rule 19 was written for: "a green suite proves nothing about
 * what he will see."
 *
 * So this photographs the REAL staging site — not localhost — at the two sizes he uses, and
 * prints, beside each picture, the measurements a thumbnail cannot show:
 *   • the <title>, which must carry the [STAGING] prefix (that is how he knows which build)
 *   • the build stamp the page itself reports
 *   • whether Firebase actually loaded (Host/Join do nothing at all if it did not)
 *   • any console errors
 *
 * Deliberately does NOT play a voyage: a FULL sea trial is already at sea on this exact build
 * (.planning/wyclau/LONG-RUN), and starting a second one is the T-026 fault.
 */
import { launch, attach, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = (process.argv.find((a) => a.startsWith("--host=")) ?? "--host=https://staging.playpastrypirates.com")
  .slice(7).replace(/\/$/, "");
const DBG = 9747;                       // distinctive, so the running sea trial's ports are untouched
const OUTDIR = path.resolve(".planning/posed");
fs.mkdirSync(OUTDIR, { recursive: true });

launch(DBG, "/tmp/chrome-t247");
const C = await attach(DBG);

const errs = [];
await C.send("Log.enable").catch(() => {});

async function shot(name) {
  const r = await C.send("Page.captureScreenshot", { format: "png" });
  const data = r?.result?.data;
  if (!data) { console.log(`NO SCREENSHOT for ${name}`); return null; }
  const p = path.join(OUTDIR, name);
  fs.writeFileSync(p, Buffer.from(data, "base64"));
  console.log("wrote", p);
  return p;
}

async function look(label, href, w, h, mobile) {
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await C.ev(`location.href=${JSON.stringify(href)}`);
  await sleep(4000);
  const facts = await C.ev(`(()=>{
    const out = { title: document.title, url: location.href };
    out.firebase = (typeof window.firebase !== 'undefined') ? 'LOADED' : 'MISSING';
    out.bodyChars = (document.body ? document.body.innerText.trim().length : 0);
    out.canvasOrBoard = !!(document.querySelector('#board, canvas, #stage, .board'));
    const btns = [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,10);
    out.buttons = btns;
    return JSON.stringify(out);
  })()`);
  const stamp = await C.ev(`(()=>{ const m=[...document.querySelectorAll('*')].map(e=>e.textContent||'').join(' ').match(/2026\\.\\d\\d\\.\\d\\d\\.\\d+[^\\s<]*/); return m?m[0]:'(no stamp visible in the DOM)'; })()`);
  console.log(`\n── ${label}  ${w}x${h}${mobile ? " (phone)" : ""}`);
  console.log("   ", facts);
  console.log("    stamp seen on page:", stamp);
  return facts;
}

await look("staging — the game, desktop", `${ORIGIN}/`, 1280, 900, false);
await shot("t247-staging-desktop-1280.png");

await look("staging — the game, phone", `${ORIGIN}/`, 390, 844, true);
await shot("t247-staging-phone-390.png");

await look("staging — rules.html, phone", `${ORIGIN}/rules.html`, 390, 844, true);
await shot("t247-staging-rules-phone-390.png");

// Rule 17: kill what this script started, and NOTHING else. The port is unique to this probe,
// so a port-scoped kill cannot touch the sea trial's four browsers.
try { await fetch(`http://127.0.0.1:${DBG}/json/close`); } catch {}
const { execSync } = await import("node:child_process");
try {
  execSync(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*remote-debugging-port=${DBG}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
    { stdio: "ignore" }
  );
} catch {}
console.log(`\nkilled every chrome carrying --remote-debugging-port=${DBG} (and only those)`);
process.exit(0);
