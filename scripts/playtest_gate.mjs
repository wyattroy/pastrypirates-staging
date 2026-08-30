// playtest_gate.mjs — THE GATE, as Wyatt specified it (2026-08-21): "go to the website and play an
// entire game from start to finish while looking at every screen and making sure that it looks
// right, and do this in all the modes" + "play them FULLY. click all the buttons; make sure
// everything works."
//
// ARCHITECTURE (deliberately general — no per-bug assertions anywhere):
//   lib/player.mjs  — plays FULLY: coverage-first button choices, real mouse, every click must
//                     produce an effect (dead buttons are findings), side quests (menu/chat/recipe).
//   lib/checks.mjs  — five UNIVERSAL structural rules run on every distinct screen (nothing
//                     off-screen/occluded/piled/clipped, panels hug content).
//   lib/vision.mjs  — the automatic vision judge (Wyatt's pick): a model looks at every distinct
//                     screen the way he does and says PASS/FAIL with reasons. `claude -p`, no keys.
//   this file       — the legs (modes × sizes), boot flows, verdicts, contact sheets, exit code.
//
// LEGS (default all): solo-desktop, solo-phone, passplay-phone, crew-desktop.
//   Crew plays to the TRUE end-of-voyage (Wyatt's ruling) with players named test1/test2 so the
//   permanent Firebase gamelog rows are trivially filterable from any future player-data analysis.
//
// Usage: node scripts/playtest_gate.mjs [--legs=solo-desktop,...] [--out=DIR] [--port=8800]
//        [--dbg=9800] [--judge=on|off] [--model=claude-sonnet-5] [--max-min=35] [--parallel=2]
// Exit 1 on any failure. Keeps every screenshot + a contact sheet per leg. Read them.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPO, gameURL } from "./lib/chrome.mjs";
import { openChrome, sleep } from "./lib/cdp.mjs";
/* THE SECOND ENGINE. Wyatt, 2026-08-26: "your fixes must be verified across Safari and Chrome."
   wk.mjs is a MOUNT, not a second driver — it returns the same handle shape openChrome() does, so
   makePlayer() and every check below run against it unchanged (ONE DRIVER, TWO MOUNTS, rule 23).
   The pulse bug lived only in his phone's WebKit and cost eight days; three Chromium engines
   cleared it honestly. That is the whole argument for this import. */
import { playwrightDir, openWebKit } from "./lib/wk.mjs";
import { MEASURE, structuralChecks, waitSettled } from "./lib/checks.mjs";
import { judgeAll, writeJudgeQueue } from "./lib/vision.mjs";
import { makePlayer, sideQuests, GATE_SRC } from "./lib/player.mjs";
/* DO THE TWO CAPTAINS SEE THE SAME GAME? This leg already played both seats and threw the
   comparison away — each was judged against the universal rules ALONE, which cannot see "both
   screens are individually fine and they disagree". That is seven of Wyatt's 35 findings. */
import { legVerdictLine } from "./lib/leg_verdict.mjs";
import { compareWhenSettled } from "./lib/seat_parity.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const LEGS = arg("legs", "solo-desktop,solo-phone,passplay-phone,crew-desktop").split(",");
const OUT = path.resolve(arg("out", path.join(process.cwd(), "playtest-gate")));
const PORT0 = +arg("port", 8800), DBG0 = +arg("dbg", 9800);
/* THREE MODES, not two (Wyatt, 2026-08-22). `on` shells out to the `claude` CLI, which needs the
   machine's shared OAuth credential and therefore CANNOT work from inside a Claude session — see
   the queue note in lib/vision.mjs. `queue` skips the CLI entirely and leaves the screens for a
   session to judge. `off` skips the vision pass altogether.
   AND `on` FALLS BACK TO `queue` RATHER THAN LOSING THE PASS: if the judge reports it cannot run at
   all, the run does not simply forfeit its visual review — it writes the queue and says so. That is
   the whole "it should always work" property; the pass is deferred, never dropped. */
const JUDGE_MODE = arg("judge", "on");            // on | queue | off
const JUDGE = JUDGE_MODE !== "off";
const MODEL = arg("model", "claude-sonnet-5");
const MAX_MS = +arg("max-min", 35) * 60_000;
const PAR = Math.max(1, +arg("parallel", 2));
const JUDGE_CAP = 30;                     // distinct screens judged per leg (all get structural checks)
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (...a) => { const s = `[${((Date.now() - T0) / 1000 | 0) + ""}s] ` + a.join(" "); console.log(s); fs.appendFileSync(path.join(OUT, "log.txt"), s + "\n"); };
const ownPorts = { dbg: new Set(), http: new Set() };
const killAll = () => { for (const d of ownPorts.dbg) { try { execSync(`pkill -f "remote-debugging-port=${d}"`, { stdio: "ignore" }); } catch {} }
  for (const h of ownPorts.http) { try { execSync(`pkill -f "http.server ${h}"`, { stdio: "ignore" }); } catch {} } };
process.on("exit", killAll); for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { killAll(); process.exit(1); });

// ONE http server for the whole run (fresh port per gate invocation = fresh module cache). Legs
// must NOT own servers: the contact sheet renders after a leg's Chrome closes, and a per-leg server
// would already be dead by then. Do not edit game files while the gate runs — this serves the disk.
import { spawn } from "node:child_process";
const SRV = spawn("python3", ["-m", "http.server", String(PORT0)], { cwd: REPO, stdio: "ignore" });
ownPorts.http.add(PORT0);
process.on("exit", () => { try { SRV.kill("SIGKILL"); } catch {} });
await sleep(900);

// ---------- boot flows (from docs/DRIVING-THE-GAME.md §3/§3b/§5c — the documented ways in) -------
/* THE GATE'S GAMES ARE STAMPED SO REAL PLAYER DATA CAN BE READ WITHOUT THEM (Wyatt, 2026-08-21).
   A finished game writes a permanent, undeletable row to the shared `gamelogs/` node, and that
   payload records `names` (what each player typed) and `pid` (the browser's stored player id) —
   verified in orchestrator.js writeGameLog(). His plan is to name the players test1/test2 so the
   rows filter out of any later analysis; this pins the id too, so there are TWO independent
   handles and a real player who happens to type "test1" is never mistaken for the harness.
   Nothing in the game reads gamelogs back, so these rows cannot affect what any player sees. */
const QA_PLAYER_ID = "qa-playtest-gate";
async function freshPage(c, idSuffix = "a") {
  await c.nav(gameURL(c.httpPort)); await sleep(2200);
  // each browser needs its OWN id or the second one rejoins as the first's seat (§5c) — the shared
  // prefix is what makes both filterable, the suffix is what keeps them distinct captains.
  await c.ev(`localStorage.clear(); localStorage.setItem('pp_id', ${JSON.stringify(QA_PLAYER_ID)} + '-' + ${JSON.stringify(idSuffix)}); 1`);
  await c.nav(gameURL(c.httpPort)); await sleep(2600);
  await c.ev(GATE_SRC);
}
async function nameModal(c, name) {
  await sleep(800);
  const g = await c.ev(`__gate(document.getElementById('nameModalInput'))`);
  if (g && g.ok) { await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: g.x, y: g.y, button: "left", clickCount: 3 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: g.x, y: g.y, button: "left", clickCount: 3 });
    await c.type(name); }
  const b = await c.ev(`__gate(document.getElementById('btnNameConfirm'))`);
  if (!b || !b.ok) throw new Error("name confirm not clickable");
  await c.clickXY(b.x, b.y);
}
async function bootSolo(c, name) {
  await freshPage(c, "solo");
  const g = await c.ev(`__gate(document.getElementById('choiceSolo'))`); if (!g || !g.ok) throw new Error("solo card not clickable");
  await c.clickXY(g.x, g.y); await nameModal(c, name);
}
async function bootPassPlay(c, names) {
  await freshPage(c, "pp");
  const g = await c.ev(`__gate(document.getElementById('choicePassPlay'))`); if (!g || !g.ok) throw new Error("pass&play card not clickable");
  await c.clickXY(g.x, g.y); await nameModal(c, names[0]); await sleep(700);
  await c.ev(`(() => { const v = ${JSON.stringify(names)}; for (let i = 0; i < 4; i++) { const el = document.getElementById('ppName' + i); if (el) el.value = v[i] || ''; } return 1; })()`);
  const s = await c.ev(`__gate(document.getElementById('btnStartPassPlay'))`); if (!s || !s.ok) throw new Error("pass&play start not clickable");
  await c.clickXY(s.x, s.y);
}
async function bootHost(c, name) {
  await freshPage(c, "host");
  const g = await c.ev(`__gate(document.getElementById('choiceHost'))`); if (!g || !g.ok) throw new Error("host card not clickable");
  await c.clickXY(g.x, g.y); await nameModal(c, name);
  // UI-05: hosting creates the room outright; wait for the 4-letter code
  const t0 = Date.now(); let code = "";
  while (Date.now() - t0 < 30_000) { await sleep(600);
    code = await c.ev(`(document.getElementById('roomCode')||{textContent:''}).textContent.trim()`);
    if (/^[A-Z0-9]{4}$/.test(code)) return code; }
  throw new Error("room code never appeared: " + JSON.stringify(code));
}
async function bootJoin(c, name, code) {
  await freshPage(c, "guest");
  const g = await c.ev(`__gate(document.getElementById('choiceJoin'))`); if (!g || !g.ok) throw new Error("join card not clickable");
  await c.clickXY(g.x, g.y); await sleep(700);
  /* THE NAME MODAL IS GONE FROM THIS FLOW, and this line waited for it for two days.
     Wyatt's item 31, shipped 2026-08-24 (025f57cc): "'Join a crew' goes straight to the join
     screen -- the name modal in between is gone." The game changed; the rig did not. Every crew
     leg since has died here with "name confirm not clickable", and a crew probe hung all night on
     2026-08-26 for the same reason.

     THIS IS THE RIG ROTTING AGAINST THE GAME, which is a failure mode worth naming: a harness that
     encodes a flow can be broken by a fix to that flow, and it fails in a way that looks like the
     GAME is broken. It is now tolerant -- the modal is used if it is there and skipped if it is
     not -- so this particular rot cannot recur in either direction. */
  const hasModal = await c.ev(`(()=>{const m=document.getElementById('nameModal');
    return !!(m && getComputedStyle(m).display !== 'none');})()`);
  if (hasModal) { await nameModal(c, name); await sleep(700); }
  await c.ev(`(() => { const jc = document.getElementById('joinCode'); if (jc) jc.value = ${JSON.stringify(code)};
    const jn = document.getElementById('joinName'); if (jn) jn.value = ${JSON.stringify(name)}; return 1; })()`);
  const b = await c.ev(`__gate(document.getElementById('btnJoin'))`); if (!b || !b.ok) throw new Error("join button not clickable");
  await c.clickXY(b.x, b.y);
}
async function hostStart(c) {
  // wait for Start to appear (guest seated), then the two-step confirm (§3b)
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) { await sleep(700);
    const b = await c.ev(`__gate(document.getElementById('btnStart'))`);
    if (b && b.ok) { await c.clickXY(b.x, b.y); break; } }
  await sleep(1000);
  const t1 = Date.now();
  while (Date.now() - t1 < 20_000) { await sleep(600);
    const b = await c.ev(`__gate(document.getElementById('btnConfirmStart'))`);
    if (b && b.ok) { await c.clickXY(b.x, b.y); return; } }
  throw new Error("start confirm never clickable");
}

// ---------- one seat's play loop: tick, capture every distinct screen, structural-check it -------
async function playSeat(c, tag, rec, { untilOver = true, quests = true } = {}) {
  const player = makePlayer(c, { log: (m) => log(`  [${tag}] ${m}`) });
  rec.player = player.P;
  let shotN = 0, questsDone = false, lastDay = -1;
  const t0 = Date.now();
  while (Date.now() - t0 < MAX_MS) {
    await sleep(650);
    await c.ev(GATE_SRC);
    // capture + structurally check every screen we have not seen before
    /* TWO MOMENTS, TWO QUESTIONS (Wyatt, 2026-08-22). The gate used to take ONE shot, at the instant
       the screen's signature changed — i.e. the instant the animation starts, which is reliably the
       worst moment rather than a random one, and is what made the recipe picker fail three times a
       run for a fault that does not exist once the cards land.
         MOTION  — captured immediately, as before. Asks a NARROWER question: did anything flash off
                   the screen edge or render unlabelled on the way in. Its findings are OBSERVATIONS
                   and never fail the leg, because "two things overlap while sliding into place" is
                   what an animation IS. Running the settled rules here would double the false
                   alarms, which is the opposite of the point.
         SETTLED — captured once the rects stop moving. THIS IS THE BAR: structural checks and the
                   vision judge both read this one.
       The settled shot REPLACES the motion shot in `rec.screens`, so the judge and the contact sheet
       see the screen as a player leaves it, and the motion frame is kept beside it for reading. */
    const f = await player.captureIfNew(OUT, tag, ++shotN);
    if (f) {
      const mMotion = await c.ev(MEASURE);
      const motionFails = (mMotion && !mMotion.__err) ? structuralChecks(mMotion).filter(k => !k.ok) : [];

      const settle = await waitSettled(c);
      const fSettled = f.replace(/\.png$/, "-settled.png");
      await c.shot(fSettled);

      const m = await c.ev(MEASURE);
      const checks = (m && !m.__err) ? structuralChecks(m) : [{ ok: false, rule: "measure", what: String(m && m.__err) }];
      const fails = checks.filter(k => !k.ok);
      /* A screen that never fully stopped is RECORDED, not failed — see the note in waitSettled. */
      if (!settle.settled) log(`  [${tag}] note: still moving at the cap (${settle.ms}ms) — checked anyway`);
      rec.screens.push({ shot: fSettled, motionShot: f, sig: player.P.screens.at(-1).sig, fails, settle,
        motionOnly: motionFails.filter(k => !fails.some(x => x.rule === k.rule)) });
      if (fails.length) for (const k of fails) log(`  [${tag}] STRUCT FAIL ${k.rule}: ${k.what}`);
      for (const k of (rec.screens.at(-1).motionOnly || [])) log(`  [${tag}] during-animation only (not a failure) ${k.rule}: ${k.what}`);
    } else shotN--;
    const st = await player.state();
    if (st && st.day !== lastDay) { lastDay = st.day; rec.days = st.day; log(`  [${tag}] DAY ${st.day}`); }
    if (st && st.over) { log(`  [${tag}] END OF VOYAGE at day ${st.day}`);
      const f2 = `${OUT}/${tag}-eov.png`; await c.shot(f2); rec.screens.push({ shot: f2, sig: "end of voyage", fails: [] });
      rec.finished = true; return; }
    // side quests once the game is properly underway (day 2+, between prompts)
    if (quests && !questsDone && st && st.day >= 2) { questsDone = true; await sideQuests(c, player, (m) => log(`  [${tag}] ${m}`)); }
    await player.tick();
    if (!untilOver && st && st.day >= 3) { rec.finished = true; return; }   // (unused today; kept for cheap smoke legs)
  }
  rec.finished = false;
  // never report a stall without first ruling out the environment (see ensureVisible)
  const wasHidden = await player.ensureVisible();
  log(`  [${tag}] TIMED OUT after ${MAX_MS / 60000} min without reaching the end of voyage` +
      (wasHidden ? " — BUT THE TAB WAS HIDDEN, so the game had correctly paused itself; this is NOT a game stall" : ""));
}

// ---------- verdicts --------------------------------------------------------------------------
function legVerdict(rec) {
  const v = [];
  if (!rec.finished) v.push("did not finish the voyage");
  /* A RESCUE IS NOT A FREE PASS — CEO Review 12, 2026-08-28: "nothing bounds the recoveries…
     A leg needing eleven relaunches should not produce the same shaped verdict as one needing
     none," and this repo has already paid once for an instrument that was reassuring rather than
     silent. The mount absorbs ANY WebKit death, so without this a future crash caused by OUR OWN
     game code would relaunch, resume, and report finished:true with a small asterisk.
     TWO RULES, both derived rather than typed:
       - ANY recovery on a NON-WebKit leg fails outright. The crash we sanction is WebKit's own
         (diagnosed by core dump); Chrome has never once needed one, so a Chrome relaunch is by
         definition not the known bug.
       - A WebKit leg gets a budget of ONE RESCUE PER FOUR GAME-DAYS SAILED (floor 2). A voyage
         that has to be restarted more often than that is not sailing, it is crash-looping, and
         the verdict should say so. The divisor is the honest knob: the 2026-08-28 fleet ran
         11 rescues over 29 days (budget 7 — FAILS, correctly: the CEO called that leg a limp),
         2 over 19 and 1 over 16 (budgets 4 and 4 — both pass). Change it when observation
         changes, and say what you observed. */
  const rescues = rec.recoveries || 0;
  if (rescues) {
    const wk = /-wk$/.test(rec.name);
    const budget = Math.max(2, Math.ceil((rec.days || 1) / 4));
    if (!wk) v.push(`${rescues} browser relaunch(es) on a Chrome leg — Chrome has never needed one; this is NOT the sanctioned WebKit crash`);
    else if (rescues > budget) v.push(`${rescues} WebKit relaunch(es) over ${rec.days || "?"} day(s) — above the ${budget} this voyage's length allows; that is a crash loop being ridden out, not a voyage`);
  }
  const structFails = rec.screens.flatMap(s => s.fails);
  /* NAME THEM. A COUNT IS NOT ACTIONABLE, AND THIS ONE HID THE BIGGEST FINDING IN THE FLEET.
     Every other line in this verdict names its subject — dead controls list their labels,
     unreachable controls their `what`, unexercised kinds their names — and this one alone said
     only "2 structural check failure(s)". Rule 24 stands on Wyatt being able to OPEN THE REPORT
     and see what happened; a bare number sends him to a 5,000-line log or nowhere.
     WHAT IT COST, 2026-08-29: the FULL trial for build 2026.08.29.2 reported "1" and "2"
     structural failures per leg. Behind those numbers were 22 failures, 14 of them on
     crew-phone-guest, and they say `on-screen: clickable off-screen: sailCell` and
     `sail-clickable: 2 sail square(s) covered ... <- #pp4Cap` — the trial had independently
     reproduced "sail squares a guest cannot tap", the TOP item on the backlog, and the summary
     line threw the evidence away. Grouped by RULE rather than listed flat, because one broken
     screen trips the same rule repeatedly and a flat list would be its own kind of noise. */
  if (structFails.length) {
    const byRule = new Map();
    for (const k of structFails) byRule.set(k.rule, (byRule.get(k.rule) || 0) + 1);
    const named = [...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}×${n}`).join(", ");
    const first = (structFails[0] && structFails[0].what) ? ` — first: ${String(structFails[0].what).slice(0, 110)}` : "";
    v.push(`${structFails.length} structural check failure(s): ${named}${first}`);
  }
  for (const seat of rec.seats || [rec]) {
    const P = seat.player; if (!P) continue;
    if (P.deadButtons.length) v.push(`${P.deadButtons.length} dead control(s): ${P.deadButtons.map(d => d.label).slice(0, 5).join(", ")}`);
    if (P.findings.length) v.push(`${P.findings.length} unreachable control(s): ${P.findings.map(f => f.what).slice(0, 3).join("; ")}`);
    // coverage: a kind the game OFFERED but the player never successfully exercised
    const unexercised = [...P.coverage.entries()].filter(([k, r]) => r.seen > 2 && r.clicked === 0 && !/back|menu close|chat close/.test(k)).map(([k]) => k);
    if (unexercised.length) v.push(`offered but never exercised: ${unexercised.join(", ")}`);
  }
  /* THE TWO SEATS DISAGREEING IS A FAILURE, not a note. This is the class Wyatt's 2026-08-26
     playtest was mostly made of — seven findings where both screens were individually fine and they
     showed different games — and until this line the leg had no way to say so. */
  if (rec.parity && rec.parity.length)
    v.push(`${rec.parity.length} moment(s) where the two captains saw different games: ` +
           rec.parity.slice(0, 3).map(p => `${p.field} (${p.why})`).join("; "));
  if (rec.consoleErrs && rec.consoleErrs.length) v.push(`${rec.consoleErrs.length} console error(s): ${rec.consoleErrs[0]}`);
  /* A JUDGED SLOT CAN BE EMPTY, AND EVERY READER MUST COPE. judgeAll stops the whole pass on the
     first FATAL, so screens it never reached come back `undefined` — deliberately, because an
     unreached screen has NOT been cleared and must never be defaulted to PASS. This crashed a real
     run of Wyatt's on 2026-08-22 (`Cannot read properties of undefined (reading 'verdict')`, twice:
     here and in the contact sheet) because the producer learned to leave holes and its consumers
     did not. Count the holes and say so, rather than assuming a dense array. */
  const judged = (rec.judged || []).filter(j => j && j.r);
  const judgeHoles = (rec.judged || []).length - judged.length;
  const judgeFails = judged.filter(j => j.r.verdict === "FAIL");
  if (judgeFails.length) v.push(`vision judge FAILED ${judgeFails.length} screen(s)`);
  const judgeErrs = judged.filter(j => j.r.verdict === "ERROR" || j.r.verdict === "FATAL");
  if (judgeErrs.length) v.push(`vision judge errored on ${judgeErrs.length} screen(s) — those screens are NOT cleared`);
  if (judgeHoles) v.push(`${judgeHoles} screen(s) never judged — NOT cleared`);
  const motionOnly = rec.screens.reduce((n, s) => n + ((s.motionOnly || []).length), 0);
  if (motionOnly) v.push(`${motionOnly} observation(s) seen only DURING an animation — not failures, read them in the log`);
  const unsettled = rec.screens.filter(s => s.settle && !s.settle.settled).length;
  if (unsettled) v.push(`${unsettled} screen(s) never stopped moving before being checked`);
  if ((rec.queued || []).length) v.push(`vision pass DEFERRED for ${rec.queued.length} screen(s) — queued for a session, NOT cleared`);
  return v;
}

async function contactSheet(rec, tag, idx) {
  try {
    const c = await openChrome({ W: 1700, H: 1000, dbgPort: DBG0 + 90 + idx, httpPort: null, serveRoot: REPO, profileDir: path.join(OUT, "prof-sheet-" + tag) });
    ownPorts.dbg.add(DBG0 + 90 + idx);
    const tiles = rec.screens.map(s => { const j = (rec.judged || []).find(x => x && x.r && x.shot === s.shot);
      const bad = s.fails.length || (j && j.r.verdict !== "PASS");
      return { cap: `${path.basename(s.shot)} · ${s.fails.length ? "STRUCT×" + s.fails.length : "struct ok"}${j ? " · judge " + j.r.verdict : ""}`,
        notes: [...s.fails.map(f => f.what), ...((j && j.r.issues) || [])], src: path.basename(s.shot), bad }; });
    const html = `<!doctype html><body style="margin:0;background:#1c2f38;color:#fff;font:13px/1.35 -apple-system,sans-serif">
      <div style="padding:12px 16px;font-size:16px">playtest_gate · ${tag} · ${rec.finished ? "finished voyage" : "DID NOT FINISH"} · ${new Date().toISOString().slice(0, 16)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0 16px 16px">${tiles.map(t =>
        `<div style="background:#0f1d24;border:2px solid ${t.bad ? "#ff2d55" : "#27c78d"};border-radius:8px;padding:7px">
         <div style="font-weight:bold;margin-bottom:5px">${t.cap}</div><img src="${t.src}" style="width:100%;display:block;border-radius:4px;background:#000">
         ${t.notes.map(n => `<div style="color:#ff8fa5;margin-top:3px">✗ ${String(n).replace(/</g, "&lt;")}</div>`).join("")}</div>`).join("")}</div></body>`;
    fs.writeFileSync(path.join(OUT, `contact-${tag}.html`), html);
    /* THE SHEET IS SERVED FROM ITS OWN DIRECTORY, AND IT SAYS SO WHEN THE IMAGES DID NOT LOAD.
       This used to build a URL relative to REPO and fetch it from the run's own server, which is
       rooted at REPO — so ANY `--out` outside the repo produced `../../..` and python's http.server
       answered 404. The sheet then screenshotted the 404 page: 1700x1000, 23,889 bytes, every time,
       and the log still printed "contact sheet: <path>" as if it had one. Every sheet from the
       2026-08-21 evening run is that same 404, all four legs, byte-identical — and nobody could
       tell, because a blank sheet and a green sheet are both "a file that exists".
       This is the failure `stage_layout_check.mjs` was already hardened against (its own loader
       check, d9c9a71); the hardening never reached this gate. Now: a short-lived server rooted at
       OUT so the sheet works from anywhere, plus the loaded-images check so a future variant of
       the same mistake is LOUD instead of reassuring (docs/HARD-WON-LESSONS.md §3). */
    const sheetPort = PORT0 + 70 + idx;
    ownPorts.http.add(sheetPort);
    const sheetSrv = spawn("python3", ["-m", "http.server", String(sheetPort)], { cwd: OUT, stdio: "ignore" });
    await sleep(700);
    await c.nav(`http://127.0.0.1:${sheetPort}/contact-${tag}.html`); await sleep(1200);
    const widths = await c.ev("Promise.all([...document.images].map(i=>i.complete?i.naturalWidth:new Promise(r=>{i.onload=()=>r(i.naturalWidth);i.onerror=()=>r(0);})))");
    const missing = Array.isArray(widths) ? widths.filter(w => !w).length : tiles.length;
    const h = await c.ev("document.documentElement.scrollHeight");
    await c.send("Emulation.setDeviceMetricsOverride", { width: 1700, height: Math.max(400, Math.min(h || 0, 16000)), deviceScaleFactor: 1, mobile: false }); await sleep(400);
    await c.shot(path.join(OUT, `contact-${tag}.png`)); c.close();
    try { sheetSrv.kill("SIGKILL"); } catch {}
    try { execSync(`pkill -f "http.server ${sheetPort}"`, { stdio: "ignore" }); } catch {}
    if (missing || !Array.isArray(widths) || widths.length !== tiles.length)
      log(`[${tag}] CONTACT SHEET INCOMPLETE: ${missing} of ${tiles.length} images did not load — DO NOT TRUST IT`);
    log(`[${tag}] contact sheet: ${path.join(OUT, `contact-${tag}.png`)}`);
  } catch (e) { log(`[${tag}] contact sheet failed: ${e.message}`); }
}

// ---------- legs ------------------------------------------------------------------------------
/* `mobile` and `dsf` are not decoration: without them a 390px window still reports
   `pointer: fine`, so the phone legs were exercising the DESKTOP branch of anything that asks what
   kind of pointer it has — D-40's "Tap and hold" vs "Click and hold" among them, which is how a
   phone screenshot came back saying "Click". A phone leg that does not emulate a phone is testing
   the wrong game. */
const legDefs = {
  "solo-desktop":  { W: 1890, H: 960 },
  /* D-42 — 664, NOT 844: the height a real phone browser GIVES THE PAGE. 844 is the iPhone 14's
     screen; Safari and Chrome both keep a bottom bar, so the page never sees the last ~180px of it.
     Emulating 844 handed the layout room no player has, and the judge duly reported the surplus as
     "large empty dead space below the CAPTAINS panel" on eight screens across the two phone legs.
     Wyatt, 2026-08-21: "it does not appear on my phone, in either safari or chrome... the search
     bar is down there." The GAME is not changed for this — the instrument was measuring a phone
     that does not exist. */
  "solo-phone":    { W: 390, H: 664, mobile: true, dsf: 2 },
  "passplay-phone":{ W: 390, H: 664, mobile: true, dsf: 2 },
  "crew-desktop":  { W: 1890, H: 960, guestW: 1400, guestH: 900 },
  /* CREW ON A PHONE — the combination Wyatt actually playtested for two hours on 2026-08-26, and
     the one with NO LEG until the CEO review pointed at the hole. It did not even show up as a gap:
     a leg that is not in the table produces no row, which is worse than a not-run cell, because a
     not-run cell is at least visible. Most of his 35 findings came from this square.
     Both seats phone-sized, because a crew game between two phones is what he and a friend play. */
  "crew-phone":    { W: 390, H: 664, mobile: true, dsf: 2, guestW: 390, guestH: 664 },
  /* Pass-and-play on a desktop — the other empty square in the matrix. */
  "passplay-desktop": { W: 1890, H: 960 },
  /* THE THIRD SIZE — tablet portrait (Wyatt, 2026-08-28: the trial must run "at the three sizes";
     his pick from the offered options was tablet portrait). 768×954, and 954 is D-42's honest-
     viewport rule applied to an iPad: the screen is 1024 tall, Safari's top chrome takes ~70px,
     and emulating the full 1024 would hand the layout room no player has — the exact fault the
     phone legs already paid for at 844. dsf 2 and touch, because the device is a touch device.
     SOLO, matching the WebKit argument below: a size exercises rendering and layout, not the
     wire, so one mode covers what the size can differ on. */
  "solo-tablet":   { W: 768, H: 954, mobile: true, dsf: 2 },

  /* THE WEBKIT LEGS — the same modes, the same player, the other engine.
     WHY NOT ALL FOUR MODES IN WEBKIT: the two engines diverge on RENDERING, ANIMATION and LAYOUT
     TIMING — that is where the pulse bug lived, where the var()-in-keyframes fault lived, and where
     Safari's storm behaviour has always been the risk. They do not diverge on whether a bot passes
     correctly or whether a room code works. Running the wire twice buys nothing and doubles the
     load on the machine Wyatt plays on.
     So: WebKit plays SOLO at every size, which exercises every prompt, every ceremony, every
     animation and every layout the game has — and Chrome carries the multiplayer legs.
     (Wyatt ratified exactly this depth on 2026-08-28 — "Safari covers solo at every size" — when
     the third size was added.) */
  "solo-desktop-wk": { W: 1890, H: 960, engine: "webkit" },
  "solo-phone-wk":   { W: 390, H: 664, mobile: true, dsf: 2, engine: "webkit" },
  "solo-tablet-wk":  { W: 768, H: 954, mobile: true, dsf: 2, engine: "webkit" },
};

/* One door for both engines. A leg says which it wants; nothing below this line knows the
   difference, which is the property that keeps the two from drifting. */
async function openEngine(def, opts) {
  if (def.engine === "webkit") return openWebKit(opts);
  return openChrome(opts);
}

/* Is WebKit reachable at all? Playwright is deliberately NOT a dependency of this repo (no build
   step, no node_modules), so it is installed out of tree and pointed at with PW_DIR.
   A MISSING ENGINE IS "NOT RUN", NEVER A PASS. That distinction is the entire reason this function
   exists: a leg that silently skipped would make the report say Safari was covered when it was not,
   which is the exact lie this whole process was built to stop. */
async function webkitAvailable() {
  // ASKS scripts/lib/wk.mjs, never its own copy. See playwrightDir()'s note there for the day this
  // function's private /tmp/pw guess reported "not installed" about a working WebKit.
  const dir = await playwrightDir();
  if (dir) return { ok: true, dir };
  return { ok: false, dir: null, how:
    `WebKit is not installed, so the Safari legs did NOT run.\n` +
    `      mkdir -p ~/.pw && cd ~/.pw && npm i playwright && npx playwright install webkit\n` +
    `      (NOT /tmp — it is cleared on reboot. scripts/lib/wk.mjs finds ~/.pw on its own;\n` +
    `       PW_DIR only overrides it.)` };
}


async function runLeg(name, idx) {
  const def = legDefs[name]; if (!def) { log(`unknown leg ${name}`); return { name, verdict: ["unknown leg"] }; }
  const rec = { name, screens: [], consoleErrs: [], seats: [] };
  const dbg = DBG0 + idx * 4;
  ownPorts.dbg.add(dbg); ownPorts.dbg.add(dbg + 1);
  let host = null, guest = null;
  if (def.engine === "webkit") {
    const wk = await webkitAvailable();
    if (!wk.ok) { log(`[${name}] NOT RUN — ${wk.how}`); return { name, notRun: wk.how, verdict: [] }; }
  }
  try {
    host = await openEngine(def, { W: def.W, H: def.H, dbgPort: dbg, httpPort: null, serveRoot: REPO,
      profileDir: path.join(OUT, `prof-${name}-a`), mobile: !!def.mobile, dsf: def.dsf || 1 });
    host.httpPort = PORT0;   // navigate against the run's shared server
    if (name.startsWith("crew-")) {
      // Wyatt's ruling: crew plays to the TRUE end; players are test1/test2 so the permanent
      // gamelog rows are filterable. Two separate Chromes = separate localStorage/pp_id (§5c).
      const code = await bootHost(host, "test1");
      log(`[${name}] room ${code} created by test1`);
      guest = await openEngine(def, { W: def.guestW, H: def.guestH, dbgPort: dbg + 1, httpPort: null, serveRoot: REPO, profileDir: path.join(OUT, `prof-${name}-b`) });
      guest.httpPort = PORT0;
      await bootJoin(guest, "test2", code);
      log(`[${name}] test2 joined ${code}`);
      await hostStart(host);
      const recA = { screens: rec.screens, finished: false }, recB = { screens: rec.screens, finished: false };
      rec.seats = [recA, recB];
      /* THE PARITY SAMPLER runs ALONGSIDE the two seats, not after them: a divergence that heals
         before the voyage ends is still a divergence a player saw. It compares only the SHARED
         truth — the day, the wind, every purse, who is lit, whether a battle card or a bench is up
         — because the two seats' PROMPTS are legitimately different and comparing those would cry
         wolf every turn. It waits for both to settle before each comparison, so the network's
         latency is never reported as a fault. */
      rec.parity = [];
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          const r = await compareWhenSettled(host, guest);
          if (r && r.findings && r.findings.length) {
            for (const f of r.findings) {
              const key = f.field + "|" + f.why;
              if (!rec.parity.some(p => p.key === key)) {
                rec.parity.push({ key, ...f });
                log(`[${name}] SEATS DISAGREE — ${f.field}: ${f.why}`);
              }
            }
          }
          await sleep(2500);
        }
      })();
      await Promise.all([playSeat(host, `${name}-host`, recA), playSeat(guest, `${name}-guest`, recB, { quests: true })]);
      sampling = false; await sampler.catch(() => {});
      /* BOTH, NOT EITHER. This was `||` until the CEO review of 2026-08-26: if the host completed
         the voyage while the guest sat stuck on a card forever, the leg reported "finished" and went
         green. That is T-04's exact symptom — a guest holding a dead battle card for 13.4 seconds
         and, in his playtest, until its own turn came round. The one bug he called serious would
         have passed this gate. */
      rec.finished = recA.finished && recB.finished;
    } else {
      const seat = { screens: rec.screens, finished: false }; rec.seats = [seat];
      if (name.startsWith("passplay-")) await bootPassPlay(host, ["Davy Scones", "Peg Leg Meg"]);
      else await bootSolo(host, "Davy Scones");   // the long name — the one that cliped, on purpose
      await playSeat(host, name, seat);
      rec.finished = seat.finished;
    }
    rec.consoleErrs.push(...host.consoleErrs.slice(0, 10)); if (guest) rec.consoleErrs.push(...guest.consoleErrs.slice(0, 10));
  } catch (e) {
    rec.error = String(e.message || e); log(`[${name}] ERROR: ${rec.error}`);
    try { if (host) { const f = `${OUT}/${name}-error.png`; await host.shot(f); rec.screens.push({ shot: f, sig: "ERROR", fails: [{ ok: false, rule: "run", what: rec.error }] }); } } catch {}
  } finally {
    // the wk mount rides out WPEWebProcess segfaults by relaunch-and-resume; the count is honesty,
    // not decoration — a leg that finished with recoveries must say so in its summary
    rec.recoveries = ((host && host.recoveries) || 0) + ((guest && guest.recoveries) || 0);
    try { if (host) host.close(); } catch {} try { if (guest) guest.close(); } catch {}
  }
  // vision judge over every distinct screen (capped)
  if (JUDGE && rec.screens.length) {
    const items = rec.screens.slice(0, JUDGE_CAP).map(s => ({ path: s.shot, context: `${name} — ${s.sig.slice(0, 60)}`, shot: s.shot }));
    if (JUDGE_MODE === "queue") {
      rec.queued = (rec.queued || []).concat(items);
      log(`[${name}] ${items.length} screen(s) queued for a session to judge`);
    } else {
      log(`[${name}] vision-judging ${items.length} screen(s)…`);
      const results = await judgeAll(items, { concurrency: 3, model: MODEL, onEach: (it, r) => { if (r.verdict !== "PASS") log(`  [judge ${r.verdict}] ${path.basename(it.shot)}: ${(r.issues || []).slice(0, 2).join("; ")}`); } });
      if (results.fatal) {
        /* THE JUDGE IS DEAD, NOT THE SCREENS. Defer rather than forfeit — see the JUDGE_MODE note. */
        log(`[${name}] !! the vision judge cannot run: ${results.fatal.issues[0]}`);
        log(`[${name}] falling back to the QUEUE — these ${items.length} screen(s) are deferred, not cleared`);
        rec.queued = (rec.queued || []).concat(items);
      } else {
        rec.judged = items.map((it, i) => ({ shot: it.shot, r: results[i] }));
      }
    }
  }
  /* THE CONTACT SHEET MUST NOT BE ABLE TO HANG THE WHOLE RUN. 2026-08-22: after the judge failed,
     the gate stopped here and never exited — 0% CPU, no log line, and its two sheet browsers left
     alive at 47% of Wyatt's CPU for three hours until a human noticed. A step that only PRESENTS
     results may never outlive the run that produced them, so it is bounded and its failure is
     reported rather than fatal. The kill is scoped to this sheet's own port, never a bare pkill. */
  const sheetPort = DBG0 + 90 + idx;
  await Promise.race([
    contactSheet(rec, name, idx),
    sleep(120000).then(() => { log(`[${name}] contact sheet timed out after 2 min — abandoning it (the screenshots and log are already written)`);
      try { execSync(`pkill -9 -f "remote-debugging-port=${sheetPort}"`, { stdio: "ignore" }); } catch {} })
  ]);
  rec.verdict = legVerdict(rec);
  if (rec.error) rec.verdict.push("leg error: " + rec.error);
  return rec;
}

// ---------- main ------------------------------------------------------------------------------
const results = [];
{ let next = 0; await Promise.all(Array.from({ length: Math.min(PAR, LEGS.length) }, async () => {
    while (next < LEGS.length) { const i = next++; results[i] = await runLeg(LEGS[i], i); } })); }

let anyFail = false;
for (const r of results) {
  const ok = r.verdict.length === 0;
  if (!ok) anyFail = true;
  log(legVerdictLine(r));
  for (const v of r.verdict) log(`   ✗ ${v}`);
  if (r.recoveries) log(`   ✱ ${r.recoveries} WebKit relaunch(es) mid-voyage — the known WPEWebProcess SIGSEGV, resumed from the game's own solo save each time`);
  const P = (r.seats && r.seats[0] && r.seats[0].player) ? r.seats[0].player : null;
  if (P) log(`   coverage: ${[...P.coverage.entries()].map(([k, c]) => `${k}:${c.clicked}/${c.seen}`).join("  ")}`);
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, (k, v) => v instanceof Map ? Object.fromEntries(v) : k === "screens" && Array.isArray(v) && v.length > 60 ? v.slice(0, 60) : v, 2));
log(anyFail ? "\nRESULT: FAIL" : "\nRESULT: PASS");
/* Write the queue LAST, once, for every leg that deferred — one file for the whole run, because a
   session judging it wants one list, not one per leg. */
{
  const queued = results.filter(Boolean).flatMap(r => (r.queued || []).map(it => ({ shot: it.shot, context: it.context })));
  if (queued.length) {
    const n = writeJudgeQueue(OUT, queued, { build: "see src/ui/stage.js PP4_STAMP", legs: LEGS });
    log(`WROTE ${path.join(OUT, "judge-queue.json")} — ${n} screen(s) awaiting a session's eyes.`);
    log(`  A session should read that file; it carries its own instructions and the rubric.`);
  }
}
killAll(); process.exit(anyFail ? 1 : 0);
