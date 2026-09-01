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
import { pathToFileURL } from "node:url";
import { freshProfileDir } from "./cdp.mjs";
import { PYTHON } from "./chrome.mjs";

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
    try { await import(pathToFileURL(path.join(d, "node_modules/playwright/index.mjs")).href); return d; } catch {}
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
  /* ⚠ ONE RESOLVER, AND THIS FUNCTION USED TO KEEP A SECOND ONE. Found 2026-09-01, on the Razer.
     This built its own candidate list and imported each entry as a RAW PATH. On Windows that is
     fatal and silent: `import("C:\Users\...\index.mjs")` is parsed as the URL protocol "c:",
     which ESM rejects (ERR_UNSUPPORTED_ESM_URL_SCHEME) — so every candidate threw, and the error
     said "playwright not found" while playwright was installed and importable two lines away.
     THREE SAFARI LEGS HAVE BEEN REPORTING "NOT RUN" ON THIS MACHINE EVER SINCE, and Safari is a
     stated core requirement of this game, so a tenth of the fleet was silently uncovered.
     playwrightDir() next door had it right all along — it wraps paths with pathToFileURL — which is
     exactly the drift this file's own comment predicted ("two answers to one question will drift
     again"). So there is now ONE answer: ask playwrightDir(), then import from what it found. */
  let webkit;
  const tried = [];
  const dir = await playwrightDir();
  if (dir) {
    const spec = dir === "playwright (global)"
      ? "playwright"
      : pathToFileURL(path.join(dir, "node_modules/playwright/index.mjs")).href;
    try { ({ webkit } = await import(spec)); } catch (e) { tried.push(`${spec} (${e.code || e.message})`); }
  } else {
    tried.push("$PW_DIR, ~/.pw, and a global install");
  }
  if (!webkit) {
    throw new Error("playwright not found. Tried: " + tried.join(", ")
      + `\n  Install it durably (NOT in /tmp, which is cleared on reboot):\n`
      + `    mkdir -p ~/.pw && cd ~/.pw && npm i playwright && npx playwright install webkit\n`
      + `  scripts/lib/wk.mjs finds ~/.pw automatically; PW_DIR only overrides it.`);
  }
  const srv = httpPort ? spawn(PYTHON, ["-m", "http.server", String(httpPort)], { cwd: serveRoot, stdio: "ignore" }) : null;
  profileDir = freshProfileDir(profileDir);   // same answer as the Chrome mount -- see cdp.mjs
  await sleep(900);

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
  const MUTE_INIT = () => {
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
  };

  /* THE WEB PROCESS DIES AND THE VOYAGE SURVIVES IT — measured 2026-08-28, then engineered around.
     Playwright's Linux WebKit (WPEWebProcess, build 2336) segfaults MID-VOYAGE in this container:
     a core dump shows SIGSEGV inside libWPEWebKit's own compositing walk (a repeating 4-frame
     recursion on a glib worker thread; symbols stripped). It is NOT load — 5/5 isolated runs on a
     quiet machine died by day 9 — and NOT memory (cgroup oom_kill 0), and
     WEBKIT_DISABLE_DMABUF_RENDERER=1 does not stop it (crashed day 7 under it). It is WebKit's
     own binary; no flag of ours reaches it, and real Safari on Wyatt's devices shares none of it.

     So the mount rides it out instead: a PERSISTENT context keeps localStorage on disk, which is
     where the game's own solo save lives — and the game AUTO-RESUMES a saved solo voyage on boot
     (the fbinit-before-solo-resume contract in ui_contract_check). On a crash the mount relaunches
     the context, reloads the last URL, waits for the resume, and retries the one call that failed.
     Every recovery is COUNTED and printed, and playtest_gate surfaces the count in the leg summary
     — a leg that finished with recoveries says so; it never quietly passes as an untroubled run. */
  const consoleErrs = [];
  let context = null, page = null, lastURL = null;
  const ctxOpts = { viewport: { width: W, height: H }, deviceScaleFactor: dsf,
                    hasTouch: mobile, isMobile: mobile };
  const profile = profileDir || path.join(os.tmpdir(), `wk-prof-${Date.now()}`);
  const boot = async () => {
    context = await webkit.launchPersistentContext(profile, ctxOpts);   // headless default: never takes over Wyatt's screen
    await context.addInitScript(MUTE_INIT);
    page = context.pages()[0] || await context.newPage();
    handle.page = page;
    pageCrashed = false;
    page.on("crash", () => { pageCrashed = true; });   // proactive: the next op recovers first
    page.on("pageerror", e => consoleErrs.push("EXC " + String(e).slice(0, 200)));
    page.on("console", m => { if (m.type() === "error") consoleErrs.push("ERR " + m.text().slice(0, 200)); });
  };
  const CRASH_RE = /Target crashed|Target closed|Target page, context or browser has been closed|browser has been closed|wk-op-timeout/i;
  /* A HANG IS A CRASH THAT FORGOT TO SAY SO — measured 2026-08-28, the first proving run of this
     recovery: the leg froze at day 10 for 100 minutes with the web process ALIVE and no error
     thrown anywhere. page.evaluate has no default timeout, so one wedged call held the driver
     inside a single await where even the leg's 35-minute budget could not fire. So every mount
     operation carries a hard ceiling, and blowing it takes the same relaunch-and-resume road as a
     real crash — the voyage lives in the game's own save either way. 60s is deliberately far
     above any honest op (a sig read is milliseconds, a screenshot seconds) so this can only catch
     the pathological case, never race a slow-but-working one. */
  const OP_TIMEOUT_MS = 60000;
  const withTimeout = (p, label) => Promise.race([p, new Promise((_, rej) => {
    const t = setTimeout(() => rej(new Error(`wk-op-timeout: ${label} after ${OP_TIMEOUT_MS}ms`)), OP_TIMEOUT_MS);
    if (t.unref) t.unref();          // never hold the gate process open on our own watchdog
  })]);
  let pageCrashed = false;
  const recover = async () => {
    handle.recoveries++;
    console.log(`[wk-mount] WPEWebProcess died (the known container SIGSEGV) — relaunching and resuming the voyage from its own save. Recovery #${handle.recoveries}.`);
    try { await context.close(); } catch {}
    await boot();
    if (lastURL) {
      await page.goto(lastURL, { waitUntil: "load" }).catch(() => {});
      /* the game boots, finds its solo save, and replays it back to the frontier — give the
         rebuild a real beat before the driver's next read, or the first read sees mid-replay */
      await sleep(6000);
    }
  };
  /* every public operation retries ONCE through a recovery; a second failure surfaces as before */
  const guarded = (fn, fallback) => async (...args) => {
    try {
      if (pageCrashed) throw new Error("Target crashed (crash event)");
      return await withTimeout(fn(...args), fn.name || "op");
    } catch (e) {
      if (!CRASH_RE.test(String(e.message))) { if (fallback) return fallback(e); throw e; }
      await recover();
      try { return await withTimeout(fn(...args), fn.name || "op-retry"); }
      catch (e2) { if (fallback) return fallback(e2); throw e2; }
    }
  };

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
  const ev = guarded(async (expr) => page.evaluate(expr),
                     (e) => ({ __err: String(e.message).slice(0, 200) }));
  const shot = guarded(async (file) => { await page.screenshot({ path: file }); return file; });
  const clickXY = guarded(async (x, y) => {       // a REAL mouse, same discipline as the CDP mount
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  });
  const type = guarded(async (text) => page.keyboard.insertText(text));
  const nav = guarded(async (url) => { lastURL = url; await page.goto(url, { waitUntil: "load" }).catch(() => {}); });
  const close = async () => {
    try { await context.close(); } catch {}
    if (srv) { try { srv.kill("SIGKILL"); } catch {}
               try { execSync(`pkill -f "http.server ${httpPort}"`, { stdio: "ignore" }); } catch {} }
  };
  const handle = { W, H, httpPort, send, ev, shot, clickXY, type, nav, close, consoleErrs, sleep,
                   page: null, recoveries: 0, engine: "webkit" };
  await boot();
  return handle;
}

export { sleep };
