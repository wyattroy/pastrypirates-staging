#!/usr/bin/env node
// pulse_menu_probe.mjs — does the action fan's SWELL run, in a real voyage, on either engine?
//
// THE QUESTION, narrowed by Wyatt's 5-minute iPhone recording (.planning/debug-pulse/EVIDENCE.md):
// the freeze is BORN WITH A PROMPT and it is always the same prompt — the "what'll ye do:" TURN
// MENU (5 of its 7 appearances dead; 0 of the other 14 prompts). Every page-wide theory is dead:
// the board's own rimFlow arrows animate perfectly in the same frames, and he never left the page.
// So this probe plays real voyages and measures the swell PER PROMPT, keeping turn menus and every
// other prompt apart in the verdict.
//
// IT USES THE EXISTING DRIVER. lib/player.mjs plays the game; lib/cdp.mjs mounts it on Chrome and
// lib/wk.mjs mounts the same driver on WebKit. Nothing here knows how to play — it only measures.
//
// WHAT IS AND IS NOT A FLAT BUTTON (CLAUDE.md rule 6 — never report a defect you have not measured,
// and red-proof the instrument):
//   - DISABLED controls and the ‹ back circle are DESIGNED never to pulse. Counting them is how a
//     probe invents a bug: a first draft called "What do ye WANT from the table?" broken because
//     its greyed-out crates sat still, which is the whole point of greying them out.
//   - RECIPE CARDS never pulse (Group G fault 4 — a 276px card at 1.11 sliced the hint above it).
//   - CENTRE-STAGE prompts GLOW (pp4Glow, a box-shadow) rather than GROW, so a width measurement
//     cannot see them and must not call them flat. Only `#pp4Prompt.radial` grows.
//   - RED-PROOF: a run in which NOTHING swings is a broken instrument, not a discovery. The probe
//     says so itself rather than reporting a triumphant repro.
//
// Usage:
//   node scripts/pulse_menu_probe.mjs                 # Chrome (baseline)
//   PW_DIR=/tmp/pw node scripts/pulse_menu_probe.mjs --webkit   # the Safari-family engine
//   ... --menus=16 --phone
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { openChrome, sleep } from "./lib/cdp.mjs";
import { openWebKit } from "./lib/wk.mjs";
import { makePlayer, GATE_SRC } from "./lib/player.mjs";
import { gameURL } from "./lib/chrome.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const WEBKIT = process.argv.includes("--webkit");
const PHONE  = process.argv.includes("--phone");
const WANT   = Number(arg("menus", 14));
const PORT   = Number(arg("port", 8491));
const OUT    = path.join(REPO, "scripts", ".pulse-probe");
fs.mkdirSync(OUT, { recursive: true });
const W = PHONE ? 390 : 430, H = PHONE ? 844 : 900;

/* THE MEASUREMENT. Sample each ENABLED radial button's painted width every animation frame for
   1.4s (more than one 1.1s cycle) and report max/min. pp4Grow peaks at scale(1.15), so a running
   swell reads ~1.15 and a parked one reads 1.000. Also read the animation OBJECT off the element
   (docs/DRIVING-THE-GAME.md §7) — playState and whether currentTime advances name the mechanism
   instead of inferring it from pixels. */
const MEASURE_SRC = `(async () => {
  const box = document.getElementById('pp4Prompt');
  const cls = box ? box.className : '';
  const msg = (document.querySelector('#pp4Prompt .apMsg') || {textContent:''}).textContent.trim().replace(/\\s+/g,' ').slice(0,52);
  if (!/\\bradial\\b/.test(cls)) return { skip: 'not radial', cls, msg };
  const all = [...document.querySelectorAll('#pp4Prompt .apBtn, #actionPanel .apBtn')]
    .filter(b => !/back|←|‹/i.test(b.textContent));
  const live = all.filter(b => !b.disabled && !b.classList.contains('apDisabled')
    && b.getAttribute('aria-disabled') !== 'true' && !b.classList.contains('recipeCard')
    && getComputedStyle(b).visibility === 'visible');
  if (!live.length) return { skip: 'no enabled buttons', cls, msg };
  const rec = live.map(() => []);
  const t0 = performance.now();
  await new Promise(res => (function f(){
    live.forEach((b,i) => rec[i].push(b.getBoundingClientRect().width));
    performance.now() - t0 < 1400 ? requestAnimationFrame(f) : res();
  })());
  const c1 = live.map(b => { const a = b.getAnimations()[0]; return a ? Number(a.currentTime) : null; });
  await new Promise(r => setTimeout(r, 260));
  return { cls, msg, btns: live.map((b,i) => {
    const w = rec[i], lo = Math.min(...w), hi = Math.max(...w);
    const a = b.getAnimations()[0];
    return { label: b.textContent.trim().replace(/\\s+/g,' ').slice(0,14),
             ratio: +(hi/lo).toFixed(3), samples: w.length,
             anims: b.getAnimations().length,
             state: a ? a.playState : 'NO-ANIMATION',
             advanced: (a && c1[i] != null) ? +(Number(a.currentTime) - c1[i]).toFixed(0) : null };
  })};
})()`;

const isMenu = m => /what'll ye do/i.test(m);
/* WYATT, 2026-08-25: "the pulsing still doesn't work AFTER sailing. same bug." His recording backs
   it — the one turn menu he reached WITHOUT sailing is the one that pulses, and 5 of the 6 he
   reached after a sail are dead. So a probe that cannot say whether a sail preceded each menu is
   not testing his case at all, however many menus it counts. This reads the seat's own square. */
const WHERE_SRC = `(async () => { try {
  if (!window.appState) { const m = await import('/src/state/index.js'); window.appState = m.appState; }
  const g = window.appState.game; if (!g) return null;
  const me = g.players[window.appState.mySeat]; if (!me || !me.pos) return null;
  /* p.pos, NOT p.x/p.y. The first version read me.x/me.y - which do not exist - so the position
     was [undefined, undefined] every time, 'sailed' compared undefined !== undefined, and was
     ALWAYS FALSE. A check that cannot fire reads exactly like a check that passes: five turn
     menus were reported 'not after a sail' when nothing had been measured at all. */
  return [me.pos[0], me.pos[1]];
} catch (e) { return null; } })()`;
const log = s => console.log(s);
let c;
const menus = [], others = [], skipped = [];
try {
  const open = WEBKIT ? openWebKit : openChrome;
  c = await open({ W, H, dbgPort: 9411, httpPort: PORT, serveRoot: REPO,
                   profileDir: path.join(OUT, "prof"), mobile: PHONE, dsf: PHONE ? 3 : 1 });
  log(`engine=${WEBKIT ? "WebKit" : "Chrome"}  ${W}x${H}${PHONE ? " (phone, touch)" : ""}  port=${PORT}`);

  // the documented way in (DRIVING-THE-GAME.md §3): mode card FIRST, then the modal
  await c.nav(gameURL(PORT)); await sleep(2200);
  await c.ev(`localStorage.clear(); localStorage.setItem('pp_id','qa-pulse-probe'); 1`);
  await c.nav(gameURL(PORT)); await sleep(2600);
  await c.ev(GATE_SRC);
  let g = await c.ev(`__gate(document.getElementById('choiceSolo'))`);
  if (!g || !g.ok) throw new Error("solo card not clickable");
  await c.clickXY(g.x, g.y); await sleep(1300);
  g = await c.ev(`__gate(document.getElementById('nameModalInput'))`);
  if (g && g.ok) { await c.clickXY(g.x, g.y); await c.type("Wyargh"); }
  g = await c.ev(`__gate(document.getElementById('btnNameConfirm'))`);
  if (!g || !g.ok) throw new Error("name confirm not clickable");
  await c.clickXY(g.x, g.y);
  await sleep(2500);
  log("solo voyage started");

  const player = makePlayer(c, { log: m => log("  [drv] " + m) });
  const t0 = Date.now(); let lastSig = "", idle = 0, ticks = 0, lastMark = "", stallSince = Date.now(), lastWhere = null;
  while (menus.length < WANT && Date.now() - t0 < 600000) {
    const sig = await player.sig();
    if (sig !== lastSig) {
      lastSig = sig;
      const here = await c.ev(WHERE_SRC);
      const sailed = !!(here && lastWhere && (here[0] !== lastWhere[0] || here[1] !== lastWhere[1]));
      const m = await c.ev(MEASURE_SRC);
      if (m && !m.__err && !m.skip && m.btns?.length) {
        const flat = m.btns.filter(b => b.ratio <= 1.05);
        (isMenu(m.msg) ? menus : others).push({ ...m, flat: flat.length, sailed });
        log(`  ${isMenu(m.msg) ? "MENU" : "    "} [${(isMenu(m.msg) ? menus : others).length}]${sailed ? " AFTER-SAIL" : "          "} "${m.msg}" `
          + `${m.btns.length}btn ${flat.length ? `*** ${flat.length} FLAT ***` : "swing"}  `
          + m.btns.map(b => `${b.label}:${b.ratio}${b.state === "running" ? "" : "/" + b.state}`).join(" "));
      } else if (m?.skip) skipped.push(m.skip);
      if (here) lastWhere = here;
    }
    const r = await player.tick();
    ticks++;
    await sleep(r === "idle" ? 400 : 250);
    /* IDLE IS NOT STUCK. DRIVING-THE-GAME.md §5b: "a rising n with a flat event count means it is
       WAITING, not stuck — usually a bot turn with narration holds." Bailing on idle ticks alone
       ends the run in the middle of the bots' turns and reports a sample of two. The only honest
       stall signal is the EVENT STREAM going flat. */
    const st = await player.state();
    if (st?.over) { log("  end of voyage"); break; }
    const mark = `${st?.day}|${st?.ev}`;
    if (mark !== lastMark) { lastMark = mark; stallSince = Date.now(); }
    else if (Date.now() - stallSince > 120000) { log(`  event stream flat for 120s at day ${st?.day}, ${st?.ev} events — stopping`); break; }
  }
} catch (e) { log("ERROR " + String(e.message || e).slice(0, 240)); }
finally {
  const flatOf = a => a.filter(r => r.flat).length;
  const allBtns = [...menus, ...others].flatMap(r => r.btns);
  const anySwing = allBtns.some(b => b.ratio > 1.05);
  console.log("\n================ RESULT ================");
  console.log(`engine        : ${WEBKIT ? "WebKit" : "Chrome"}${PHONE ? " @390x844 touch" : ""}`);
  const sailMenus = menus.filter(r => r.sailed), stillMenus = menus.filter(r => !r.sailed);
  console.log(`TURN MENUS    : ${menus.length}   with a flat button: ${flatOf(menus)}`);
  console.log(`  ...AFTER A SAIL : ${sailMenus.length}   flat: ${flatOf(sailMenus)}   <-- Wyatt's case`);
  console.log(`  ...no sail first: ${stillMenus.length}   flat: ${flatOf(stillMenus)}`);
  console.log(`OTHER radial  : ${others.length}   with a flat button: ${flatOf(others)}`);
  if (!allBtns.length) console.log("  NO MEASUREMENTS — the probe never saw a radial prompt. Broken run, not a result.");
  else if (!anySwing) console.log("  RED-PROOF FAILED: nothing swung anywhere. Suspect the instrument, not the game.");
  else {
    const bad = [...menus, ...others].filter(r => r.flat);
    if (!bad.length) console.log(`  Every enabled radial button swelled (${allBtns.length} buttons). NO REPRODUCTION.`);
    else bad.forEach(r => console.log(`  FLAT: "${r.msg}" — ` + r.btns.map(b => `${b.label}:${b.ratio}/${b.state}/adv${b.advanced}`).join(" ")));
  }
  if (c) await c.close();                                  // rule 17: nothing left running
}
