#!/usr/bin/env node
/* THE TWIN LEDGER, DRIVEN — one crew room, two windows, one voyage, one table.
 *
 * ⛔ NOT A GATE, AND DELIBERATELY NOT IN scripts/gates.manifest.json. It plays a real voyage in two
 * real browsers for minutes; the 175-gate chain runs in about 220 seconds and the manifest's own
 * header records that it was already one gate away from dying to a Windows command-line limit. And
 * the judgement reason matters more than the mechanical one: a noisy gate gets an --allow flag and
 * then gets ignored, while a report that RANKS what it found gets read. A twin-ledger finding's
 * proper end state is a new STATIC gate — which is exactly the shape of
 * scripts/qa/line_written_one_place_check.mjs, the gate the muse coin produced. The ledger finds;
 * the gate holds.
 *
 *   node scripts/qa/twin_ledger.mjs                 one crew voyage, host 1200x950 + guest 375x812
 *   PLAY_S=420 node scripts/qa/twin_ledger.mjs      a longer voyage
 *
 * Wy-Blade only (his rule: heavy runs never on his Mac). Players are named test1/test2 because a
 * crew voyage that reaches its end writes a permanent gamelog row nobody — Wyatt included — can
 * remove, and those two names are what makes the row filterable (playtest_gate.mjs's crew leg).
 * The room is created through the rig, so killAll() deletes it however this run ends.
 *
 * WHAT IT COVERS, and say this first every run: the PLAYED VOYAGE. Event kinds are what the engine
 * says happened; the lobby, the recipe picker, the victory card and the menus have no event kind and
 * are not watched here. A coverage claim that quietly means something narrower than his words is how
 * an instrument earns distrust.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
// fileURLToPath, never URL.pathname: on Windows .pathname is "/C:/Users/..." and the import doubles the drive
const R = path.join(fileURLToPath(new URL("../..", import.meta.url)), path.sep);   // this file is scripts/qa/, so two up is the repo
const rig = await import(pathToFileURL(path.join(R, "scripts", "mp_rig.mjs")).href);
const TL = await import(pathToFileURL(path.join(R, "scripts", "lib", "twin_ledger.mjs")).href);
const { serve, launch, attach, makeHost, makeGuest, startVoyage, killAll, sleep, DRIVER_SRC, SHOTS } = rig;

const PLAY_S = +(process.env.PLAY_S || 300);
const SETTLE_MS = TL.HORIZON_MS + 1500;          // so an event's whole horizon is watched before we read
const dbg = 9610 + (process.pid % 40) * 2, http = 8610 + (process.pid % 40);
const tmp = process.env.TMPDIR || process.env.TEMP || "/tmp";
/* ⭐ TL_REPLAY=<raw.json> RE-READS A SAVED VOYAGE AND PLAYS NOTHING. The report is a pure function
   of the capture, so a finding can be re-argued, and the rules can be changed and re-run, without
   another six minutes of browsers — and it proves the kept capture really is enough to check the
   report against. (It is also how the noise rules below were tuned: on a run already recorded,
   rather than on a fresh one each time, which is how you end up tuning to the last run's luck.) */
const REPLAY = process.env.TL_REPLAY || null;

const url = REPLAY ? null : serve(http);
if (!REPLAY) { launch(dbg, path.join(tmp, `pp-twin-ledger-host-${process.pid}`)); launch(dbg + 1, path.join(tmp, `pp-twin-ledger-guest-${process.pid}`)); }
let exit = 1;
try {
  const H = REPLAY ? null : await attach(dbg), G = REPLAY ? null : await attach(dbg + 1);
  if (REPLAY) console.log(`  replaying a saved capture, no browsers: ${REPLAY}`);
  if (!REPLAY) {
  /* THE RECORDER GOES IN BEFORE ANY GAME SCRIPT RUNS, IN BOTH PAGES. makeHost/makeGuest navigate
     twice each, and this applies to every navigation after it. */
  for (const C of [H, G]) await C.send("Page.addScriptToEvaluateOnNewDocument", { source: TL.RECORDER_SRC });
  /* HIS iPHONE 13 MINI on the guest — the screen the muse coin was measured on, and the pairing
     CLAUDE.md requires for anything visual. */
  await G.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await G.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const code = await makeHost(H, url, "test1");
  console.log(`  room ${code}`);
  await makeGuest(G, url, code, "test2");
  await startVoyage(H);
  await sleep(1500);
  for (const C of [H, G]) await C.ev(DRIVER_SRC(url));
  console.log(`  sailing, up to ${PLAY_S}s…`);
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < PLAY_S) {
    await sleep(5000);
    const over = await H.ev(`!!document.querySelector('.pp4Again,#pp4Stats,#statsCard')`);
    if (over === true) { console.log(`  the voyage ended at ${Math.round((Date.now() - t0) / 1000)}s`); break; }
  }
  for (const C of [H, G]) await C.ev(`(()=>{if(window.__g&&window.__g.timer){clearInterval(window.__g.timer);window.__g.timer=null}return 1})()`);
  console.log(`  settling ${SETTLE_MS}ms so every event's whole horizon has been watched…`);
  await sleep(SETTLE_MS);
  await H.shot("twin-ledger-host.png"); await G.shot("twin-ledger-guest.png");

  }
  const raw = {};
  if (REPLAY) Object.assign(raw, JSON.parse(fs.readFileSync(REPLAY, "utf8")));
  else for (const [k, C] of [["host", H], ["guest", G]]) raw[k] = JSON.parse(await C.ev(`JSON.stringify(window.__TL||null)`) || "null");
  if (!raw.host || !raw.guest) throw new Error("the recorder never installed on one of the pages");
  /* ⭐ THE RAW CAPTURE IS KEPT, ALWAYS. docs/QA-PROCESS.md §2c: the one move that caught three false
     reds in a night was opening what the red cited, and none of the three took two minutes. A
     finding whose raw observations are gone the moment the run ends cannot be checked at all — and
     the muse coin's own before/after table was taken by a probe that no longer exists on disk. */
  if (!REPLAY) {
    const rawOut = process.env.TL_RAW || path.join(SHOTS, "twin-ledger-raw.json");
    fs.writeFileSync(rawOut, JSON.stringify(raw));
    console.log(`  raw capture kept: ${rawOut} (${Math.round(fs.statSync(rawOut).size / 1024)} KB — every observation this report argues from; TL_REPLAY=<that file> re-reads it without playing)`);
  }
  const A = TL.ledger(raw.host), B = TL.ledger(raw.guest);
  /* THE AMBIENCE COMES OUT OF audio.js'S OWN ARRAYS, never a list typed here — the sea, the gulls
     and the creaking ropes are random per device by design, so comparing them across two screens is
     comparing two coin tosses. */
  const audio = fs.readFileSync(path.join(R, "src", "ui", "audio.js"), "utf8");
  const declared = [...(/const AMBIENCE_FILES = \[([\s\S]*?)\]/.exec(audio) || [, ""])[1].matchAll(/"([^"]+)"/g)].map(m => m[1])
    .concat([...(/const MUSIC_FILE\s*=\s*"([^"]+)"/.exec(audio) || []).slice(1)]);
  if (!declared.length) console.log(`  ⚠ AMBIENCE_FILES could not be read out of src/ui/audio.js — the ambience is NOT being excluded and the report below will be noisy`);
  /* …and the stems the game plays on ONE screen on purpose, resolved through EVENT_SOUND from the
     kinds named in LOCAL_ONLY_SOUND_EVENTS. Both lists come out of audio.js; nothing is typed here. */
  const localKinds = [...(/const LOCAL_ONLY_SOUND_EVENTS = new Set\(\[([^\]]*)\]/.exec(audio) || [, ""])[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const soundBlock = (/const EVENT_SOUND = \{([\s\S]*?)\n\};/.exec(audio) || [, ""])[1];
  const localOnly = localKinds.map(k => (new RegExp(`\\b${k}\\s*:\\s*"([^"]+)"`).exec(soundBlock) || [])[1]).filter(Boolean);
  if (localKinds.length && !localOnly.length) console.log(`  ⚠ LOCAL_ONLY_SOUND_EVENTS names ${localKinds.join(", ")} but no stem could be resolved for them — those sounds are NOT being excluded`);
  const ambient = TL.ambientOf(A, B, declared, localOnly);
  const res = TL.twin(A, B, { labelA: "host", labelB: "guest", ambient });

  /* ── what it watched ─────────────────────────────────────────────────────────────────────── */
  const srcFiles = {};
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") && (srcFiles[path.relative(R, path.join(d, e.name)).split(path.sep).join("/")] = fs.readFileSync(path.join(d, e.name), "utf8")));
  walk(path.join(R, "src"));
  const all = [...TL.emittedKinds(srcFiles)].sort();
  const missing = TL.MUST_HAVE.filter(k => !all.includes(k));
  const kinds = [...new Set(A.rows.concat(B.rows).map(r => r.kind))].filter(Boolean).sort();
  console.log(`\nTHE TWIN LEDGER — one crew room, two screens, joined on the wire's own serial \`n\`.`);
  console.log(`WHAT IT WATCHED: the PLAYED VOYAGE only. The lobby, the recipe picker, the victory card and the menus have no event kind and are not in this table.`);
  if (missing.length) console.log(`⚠ the derived producer list looks wrong (it is missing ${missing.join(", ")}) — treat the coverage line below as unproven`);
  console.log(`COVERAGE: this run exercised ${kinds.filter(k => all.includes(k)).length} of the ${all.length} event kinds the engine can emit. Never reached: ${all.filter(k => !kinds.includes(k)).join(", ") || "none"}.`);
  console.log(`FILTERS, INCLUDING THE ZEROES:`);
  console.log(`  horizon ${TL.HORIZON_MS}ms — a channel later than this is not claimed as that event's reaction. It is applied to BOTH screens, so its error can only turn a very late reaction into a MISSING one; it cannot invent a difference.`);
  console.log(`  events whose whole horizon was not watched (the tail of the run): ${A.dropped} on the host, ${B.dropped} on the guest — excluded from every finding. That exclusion can only HIDE a finding, never create one.`);
  console.log(`  events seen on one screen only: ${res.onlyA} host-only, ${res.onlyB} guest-only — not compared.`);
  console.log(`  not a game fact, so not compared (${ambient.size}): ${[...ambient].map(([v, why]) => `${v} [${why}]`).join("; ") || "none"}. This can only make the report QUIETER, never louder.`);
  console.log(`  differences that did not reproduce (under ${TL.BAR.k} times or ${Math.round(TL.BAR.ratio * 100)}% of that kind, and not one of the five coin channels): ${res.belowBar.length} — counted, not listed.`);
  console.log(`  a reaction counts as present if this event or anything that arrived within ${TL.NEAR_MS}ms of it drew it — two events milliseconds apart otherwise flip who owns what lands between them. This too can only make the report QUIETER.`);
  console.log(`  paired and fully watched: ${res.paired} events over ${Math.round(A.spanMs / 1000)}s.`);
  if (A.err || B.err) console.log(`  ⚠ the recorder caught an error: host=${A.err} guest=${B.err}`);

  console.log(`\nTHE TABLE — every time in ms from the moment that event arrived ON THAT SCREEN; medians.\n`);
  console.log(TL.table(A, B, kinds));

  /* THE TALLY FIRST, because it answers "drew nothing" vs "drew it under a different label" before
     a single per-event finding is read — and on dev's first real run it disposed of the top nine. */
  console.log(`\nWHAT EACH SCREEN DREW IN TOTAL — the threshold-free half, and no join can confuse it.`);
  console.log(`    lines written    host ${String(TL.tally(A).words).padStart(4)}   guest ${String(TL.tally(B).words).padStart(4)}`);
  if (!res.totals.length) console.log(`  the two screens ran every named animation and played every named sound the SAME number of times across the whole voyage.`);
  for (const t of res.totals.slice(0, 12)) console.log(`  ${t.only ? "⚠ " : "  "}${t.key} ${t.v.padEnd(18)} host ${String(t.a).padStart(4)}   guest ${String(t.b).padStart(4)}${t.only ? "   — one screen never did it at all" : ""}`);
  if (res.totals.length > 12) console.log(`  … and ${res.totals.length - 12} more`);

  console.log(`\nRANKED FINDINGS — order and content, never rate.`);
  if (!res.findings.length) console.log(`  none. The two screens did the same things in the same order for all ${res.paired} events.`);
  const RULE = { 1: "A MISSING REACTION", 2: "A CROSSED BOUNDARY", 3: "DIFFERENT CONTENT" };
  const SHOW = +(process.env.TL_SHOW || 25);
  res.findings.slice(0, SHOW).forEach((f, i) => {
    console.log(`  ${i + 1}. [${f.demoted ? "demoted — one screen was asked and the other was watching" : "rule " + f.rule + ": " + RULE[f.rule]}] ${f.kind} · ${f.what} — ${f.k} of ${f.of}`);
    console.log(`       ${f.why}`);
    console.log(`       events n=${f.ns.slice(0, 8).join(", ")}${f.ns.length > 8 ? " …" : ""}`);
    for (const n of f.ns.slice(0, 2)) for (const [lab, L] of [["host ", A], ["guest", B]]) {
      const r = L.rows.find(x => x.n === n);
      if (r) console.log(`       n=${n} ${lab}: reach words=${r.words} flies=${r.flies} lands=${r.lands} number=${r.number} chink=${r.chink} turns=${r.turns} evs=${r.evs} | own flies=${r.own.flies} number=${r.own.number} chink=${r.own.chink} sounds=[${r.snd}] anims=[${r.anim}]`);
    }
  });
  if (res.findings.length > SHOW) console.log(`  … and ${res.findings.length - SHOW} more (TL_SHOW=${res.findings.length} to see them all)`);
  /* THE RAW ROWS GO BESIDE EVERY FINDING, ALWAYS. docs/QA-PROCESS.md §2c: the one move that caught
     three false reds in a night was checking that the red's stated evidence exists, and none of the
     three took two minutes. A verdict alone cannot be checked in two minutes. */

  console.log(`\nLATENESS — printed, never failed (his ruling: "only a difference in content or order"). guest minus host, ms:`);
  for (const l of res.lateness) console.log(`  ${l.ch.padEnd(8)} median ${String(l.med).padStart(6)}   range ${l.min} … ${l.max}   over ${l.n} paired events`);
  console.log(`\npictures: ${path.join(SHOTS, "twin-ledger-host.png")} / twin-ledger-guest.png (end of run, not the moment of a finding)`);
  exit = 0;
} catch (e) {
  console.log("PROBE FAILED: " + (e && e.stack || e));
} finally { await killAll(); }
process.exit(exit);
