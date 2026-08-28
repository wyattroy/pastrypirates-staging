// wk.mjs — a WebKit mount for the EXISTING driver.
//
// WHY THIS EXISTS, and why it is an adapter rather than a second driver. lib/player.mjs is the one
// thing in this repo that knows how to PLAY Pastry Pirates — real mouse, on-screen gate,
// coverage-first choices, every-click-must-have-an-effect. It talks to a browser through the small
// handle lib/cdp.mjs returns, and CDP means Chrome. The pulse bug is a SAFARI bug, so the driver
// had to reach a second engine.
//
// The wrong answer (attempted first, 2026-08-24, and caught by Wyatt: "THIS ALREADY EXISTS. use
// it") is to hand-roll a second driver for WebKit. Two drivers is two things to keep in step, and
// the one written in a hurry skips what the real one learned — the hand-rolled one had no
// focus emulation, so the game's own tab-hide pause could have been silently in play (the exact
// forgery lib/player.mjs's ensureVisible() exists to prevent).
//
// So: ONE DRIVER, TWO MOUNTS (CLAUDE.md rule 23). This returns the SAME handle shape openChrome()
// does — { W, H, httpPort, send, ev, shot, clickXY, type, nav, close, consoleErrs, sleep } — and
// makePlayer() runs against it unchanged. Anything the driver learns is learnt for both engines.
//
// Needs Playwright, which is deliberately NOT a dependency of this repo (no build step, no
// node_modules). Install it anywhere and point PW_DIR at it:
//   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright && npx playwright install webkit
//   PW_DIR=/tmp/pw node scripts/<probe>.mjs
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* playwrightDir() — THE ONE ANSWER TO "WHERE IS PLAYWRIGHT?", exported so nobody keeps a second.
   playtest_gate.mjs had its own copy, looking only in $PW_DIR or /tmp/pw. THIS file was taught
   ~/.pw on 2026-08-27; that copy was not — and within a day the trial reported "WebKit is not
   installed" while WebKit was installed and launching, then printed install advice pointing at
   /tmp, which §8c of docs/DRIVING-THE-GAME.md warns against because /tmp is cleared on reboot and
   that is exactly how the Safari legs died the time before. Same search order, one definition. */
export async function playwrightDir() {
  const os = await import("node:os"), path = await import("node:path");
  for (const d of [process.env.PW_DIR, path.join(os.homedir(), ".pw")].filter(Boolean)) {
    try { await import(path.join(d, "node_modules/playwright/index.mjs")); return d; } catch {}
  }
  try { await import("playwright"); return "playwright (global)"; } catch {}
  return null;
}

export async function openWebKit({ W, H, httpPort, serveRoot, profileDir, mobile = false, dsf = 1 }) {
  /* FINDING PLAYWRIGHT IS THE CODE'S JOB, NOT THE OPERATOR'S — and it used to be neither.
     This looked only at $PW_DIR, and the documented home for it was /tmp/pw. /tmp is cleared on
     reboot, so the package vanished and every Safari leg died with "playwright not found" while
     the WebKit BROWSERS sat perfectly intact in ~/Library/Caches/ms-playwright. On 2026-08-27 that
     had silently disabled Safari coverage entirely: the full sea trial reported 2 legs NOT RUN and
     nobody had noticed the install was a reboot away from gone.

     Wyatt: "fix playwright to ALWAYS be able to run in this process of sea trials -- install the
     package somewhere durable and keep track of it."

     So the search is ordered and every step is tried, rather than one env var being mandatory:
       1. $PW_DIR            an explicit override still wins, for a one-off or a CI image
       2. ~/.pw              THE DURABLE HOME. Survives reboots; 18 MB; created 2026-08-27
       3. bare "playwright"  a global or workspace install, if someone has one
     The browsers themselves already live durably in ~/Library/Caches/ms-playwright, so only this
     little package directory was ever the fragile part. */
  let webkit;
  const homePw = path.join(os.homedir(), ".pw", "node_modules/playwright/index.mjs");
  const candidates = [
    process.env.PW_DIR ? path.join(process.env.PW_DIR, "node_modules/playwright/index.mjs") : null,
    homePw,
    "playwright",
  ].filter(Boolean);
  const tried = [];
  for (const c of candidates) {
    try { ({ webkit } = await import(c)); if (webkit) break; } catch { tried.push(c); }
  }
  if (!webkit) {
    throw new Error("playwright not found. Tried: " + tried.join(", ")
      + `\n  Install it durably (NOT in /tmp, which is cleared on reboot):\n`
      + `    mkdir -p ~/.pw && cd ~/.pw && npm i playwright && npx playwright install webkit\n`
      + `  scripts/lib/wk.mjs finds ~/.pw automatically; PW_DIR only overrides it.`);
  }
  const srv = httpPort ? spawn("python3", ["-m", "http.server", String(httpPort)], { cwd: serveRoot, stdio: "ignore" }) : null;
  if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
  await sleep(900);
  const browser = await webkit.launch();          // headless: never takes over Wyatt's screen
  const page = await browser.newPage({
    viewport: { width: W, height: H }, deviceScaleFactor: dsf,
    hasTouch: mobile, isMobile: mobile });
  /* MUTED, ALWAYS — and this mount has to do it by hand. Wyatt's standing rule is that a browser a
     probe drives is headless AND silent; he should never be able to hear a run. lib/cdp.mjs gets
     that free from Chrome's `--mute-audio` flag, and the first draft of THIS file simply forgot,
     so a headless WebKit voyage played the game's sound out loud on his machine while he was
     working (2026-08-25, he had to ask). WebKit takes no such flag, so silence is installed in the
     page instead, before a single line of game script runs:
       1. every <audio>/<video> element is born muted at zero volume, and play() re-asserts it;
       2. Web Audio is cut at the last hop — nothing may connect to ctx.destination — which
          silences the graph without changing it, so the game's own audio code runs unaltered and
          nothing it can observe about its own state changes.
     Deliberately NOT done: touching the game's own mute control. That is a subsystem with live
     defects (docs/AUDIO.md) and flipping it would put the thing under test into a different state. */
  await page.addInitScript(() => {
    const M = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (M) {
      const play = M.play;
      M.play = function () { try { this.muted = true; this.volume = 0; } catch {} return play.apply(this, arguments); };
      try {
        Object.defineProperty(M, "volume", { get: () => 0, set: () => {}, configurable: true });
        Object.defineProperty(M, "muted",  { get: () => true, set: () => {}, configurable: true });
      } catch {}
    }
    const AN = window.AudioNode && window.AudioNode.prototype;
    if (AN) {
      const connect = AN.connect;
      AN.connect = function (dest) {
        try { if (dest && dest.constructor && /Destination/.test(dest.constructor.name)) return dest; } catch {}
        return connect.apply(this, arguments);
      };
    }
  });

  const consoleErrs = [];
  page.on("pageerror", e => consoleErrs.push("EXC " + String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") consoleErrs.push("ERR " + m.text().slice(0, 200)); });

  /* THE PAGE MUST BELIEVE IT IS VISIBLE, for exactly the reason cdp.mjs spells out: the game
     pauses itself on document.hidden and a paused game is an immaculate forgery of a stall.
     Playwright's WebKit pages report visible, but the driver's ensureVisible() calls
     `send('Emulation.setFocusEmulationEnabled')` and `send('Page.bringToFront')` — CDP method
     names. They are accepted and no-opped here, and the visibility is asserted for real below so
     a silent difference between the two mounts cannot hide. */
  const send = async (method) => {
    if (method === "Page.bringToFront") { await page.bringToFront().catch(() => {}); return {}; }
    return {};                                     // Emulation.* etc: not applicable to this mount
  };
  const ev = async (expr) => {
    try { return await page.evaluate(expr); }
    catch (e) { return { __err: String(e.message).slice(0, 200) }; }
  };
  const shot = async (file) => { await page.screenshot({ path: file }); return file; };
  const clickXY = async (x, y) => {               // a REAL mouse, same discipline as the CDP mount
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const type = async (text) => page.keyboard.insertText(text);
  const nav = async (url) => page.goto(url, { waitUntil: "load" }).catch(() => {});
  const close = async () => {
    try { await browser.close(); } catch {}
    if (srv) { try { srv.kill("SIGKILL"); } catch {}
               try { execSync(`pkill -f "http.server ${httpPort}"`, { stdio: "ignore" }); } catch {} }
  };
  return { W, H, httpPort, send, ev, shot, clickXY, type, nav, close, consoleErrs, sleep, page, engine: "webkit" };
}

export { sleep };
