#!/usr/bin/env node
// scripts/dev_flag_gate_check.js
//
// NO URL A PLAYER CAN TYPE MAY SKIP THE VOYAGE OR OPEN A TUNING PANEL.
//
// That is Phase 6 criterion 4, and until this gate it was kept by hand. The cutover (2026-08-26)
// turned this tree from a /4 dev preview into the front door, and `devHost()` in
// src/shared/index.js became the ONE gate every dev flag hangs off. Nothing checked that a new
// flag remembered to hang off it — and W0-1 adds two more flags whose whole purpose is to skip
// the voyage, so the number of ways to get this wrong just went up.
//
// STRICT BY DEFAULT, exactly like scripts/qa/gear.mjs decides what counts as game code: EVERY
// `location.search.indexOf("x=1")` found in src/ must sit on a line that also names devHost(),
// unless it is in UNGATED below with a reason. A hand-kept list of what to GUARD rots exactly like
// the thing it guards; a hand-kept list of what to EXCUSE is short, and each entry has to argue
// for itself.
//
// It also pins the hostnames themselves, because "widen devHost() to include staging" is one
// character away from "widen devHost() to include production".
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };

// Flags that may be ungated, each with the reason it cannot hand a player a shortcut.
const UNGATED = {
  "bakeoff": "an A/B switch between two complete rulesets — neither one skips anything",
  "wind":    "same: turns the wind prototype on/off, both states are a whole playable game",
  "usage":   "opt out of usage pings; a privacy control, not a shortcut",
};

/* ---------- 1. devHost() answers correctly, hostname by hostname ---------- */
console.log("\ndevHost() — who is a developer's machine?");
/* pathToFileURL, NOT the bare path: on Windows an absolute path starts "C:\", and the ESM loader
   reads "c:" as a URL SCHEME and refuses it outright — ERR_UNSUPPORTED_ESM_URL_SCHEME, which kills
   the whole gate and every gate after it in the chain. Harmless on macOS, where "/Users/..." is a
   valid enough file URL to slip through, so this was invisible until the suite was first run on the
   Razer (2026-08-31). Third fault of exactly this shape found in one sitting; see the same day's
   em-dash parse error and tree_health_check's backslash-blind allowlist. */
const shared = await import(pathToFileURL(path.join(ROOT, "src/shared/index.js")).href);
const EXPECT = [
  ["localhost", true], ["127.0.0.1", true], ["0.0.0.0", true], ["", true], ["mac.local", true],
  ["staging.playpastrypirates.com", true],   // Wyatt plays work-in-progress here (2026-08-27)
  ["playpastrypirates.com", false],          // real players. NEVER.
  ["www.playpastrypirates.com", false],
  ["playpastrypirates.com.evil.example", false],  // suffix games must not pass
];
for (const [host, want] of EXPECT) {
  globalThis.location = { hostname: host, search: "" };
  const got = shared.devHost();
  const label = `${(host || "(empty)").padEnd(32)} -> ${got}`;
  got === want ? ok(label) : bad(`${label}  (expected ${want})`);
}

/* ---------- 2. every dev flag in src/ hangs off devHost() ---------- */
console.log("\nEvery ?flag=1 in src/ is behind devHost(), or excused by name");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
})(path.join(ROOT, "src"));

let found = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    const m = [...line.matchAll(/location\.search\.indexOf\("([a-z0-9]+)=1"\)/g)];
    for (const [, flag] of m) {
      found++;
      const where = `${rel}:${i + 1}  ?${flag}=1`;
      if (UNGATED[flag]) ok(`${where}  — ungated on purpose: ${UNGATED[flag]}`);
      else if (line.includes("devHost()")) ok(`${where}  — behind devHost()`);
      else bad(`${where}  — NOT behind devHost(). A player could type this.`);
    }
  });
}
if (!found) bad("no ?flag=1 sites found at all — this check is pointed at the wrong tree");

/* ---------- 3. the two endgame skips W0-1 asked for actually exist ---------- */
console.log("\nThe endgame skips exist and are gated");
for (const flag of ["bake2", "endcard"]) {
  const hit = files.some(f => fs.readFileSync(f, "utf8").includes(`"${flag}=1"`));
  hit ? ok(`?${flag}=1 is implemented`) : bad(`?${flag}=1 is missing — W0-1 is not done`);
}

/* ---------- 4. "which host is this?" is answered in exactly ONE file ----------
   CEO 189 finding 6: `analyticsShouldRun()` was a second hostname policy beside `devHost()`.
   It was THREE — `src/ui/usage.js` had a third, and it DISAGREED, counting `www.` where analytics
   did not. Nothing made them agree and nothing would have said so, which is rule 23 exactly.
   Two halves, because either alone is decoration: the list must ANSWER correctly (driven, not
   read), and no other file in src/ may decide for itself (swept, strict by default — a new file
   that grows its own copy fails without anyone remembering to register it). */
console.log("\nONE host policy — src/shared/host.js answers, and nothing else does");
const host = await import(pathToFileURL(path.join(ROOT, "src/shared/host.js")).href);
const LIVE_EXPECT = [
  ["playpastrypirates.com", true],
  ["www.playpastrypirates.com", true],       // 301s to the apex today; in the list so the day that
                                             // changes, one list moves and both consumers follow
  ["staging.playpastrypirates.com", false],  // a sea trial must NEVER count as real players
  ["localhost", false], ["", false],
  ["playpastrypirates.com.evil.example", false],  // suffix games must not pass
];
for (const [h, want] of LIVE_EXPECT) {
  const got = host.isLiveHost(h);
  const label = `isLiveHost(${(h || "(empty)").padEnd(30)}) -> ${got}`;
  got === want ? ok(label) : bad(`${label}  (expected ${want})`);
}
/* No host may be BOTH — that is what keeps staging out of the analytics numbers. */
const both = [...host.LIVE_HOSTS, ...host.DEV_HOSTS].filter(h => host.isLiveHost(h) && host.isDevHost(h));
both.length ? bad(`host(s) counted as BOTH live and dev: ${both.join(", ")}`)
            : ok("no host is both live and a developer's machine");

/* THE SWEEP. Any src/ file that compares a hostname to a playpastrypirates.com literal is deciding
   for itself — which is the fault, whatever answer it happens to reach. */
const OWNER = path.join("src", "shared", "host.js");
let deciders = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel === OWNER) continue;
  /* STRIP COMMENTS BEFORE COUNTING, and blank them rather than delete them so line numbers survive.
     The first version skipped a line only if it STARTED with `//` or `*`, which misses every
     continuation line inside a `/* … *​/` block — and it promptly failed a correct tree by finding
     the domain inside the very comment explaining why the domain moved. This project has paid for
     the same thing before, on the peek-hint gate: an instrument that reads comments is measuring
     intent, not code. */
  const stripped = fs.readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:'"])\/\/.*$/gm, (m, p) => p);
  stripped.split("\n").forEach((line, i) => {
    /* ⚠ THE FIRST VERSION OF THIS LINE READ `/["'][\w.-]*playpastrypirates\.com["']/` — the domain
       inside a SINGLE- OR DOUBLE-QUOTED literal — and CEO 194 defeated it on its first attempt with
       a template literal:  const evilHost = `playpastrypirates.com`;
       The gate printed a full PASS with the bypass sitting in the file. I had described it as
       "strict by default"; it was strict against one spelling. So it now matches the DOMAIN TOKEN
       ANYWHERE in the stripped code, whatever quoting carries it. Measured before widening: after
       comment-stripping, the token appears in exactly three lines of src/, all of them in
       host.js — so there is no legitimate use for this to trip over.
       A determined obfuscation ("playpastry" + "pirates.com") still walks past, and that is stated
       rather than papered over: this stops the accident, not an adversary. */
    if (/playpastrypirates/.test(line)) {
      deciders++;
      bad(`${rel}:${i + 1}  decides the host itself — import from ${OWNER} instead`);
    }
  });
}
if (!deciders) ok(`no file outside ${OWNER} compares a hostname to a live-domain literal`);

console.log(fails ? `\nFAIL — ${fails} problem(s)\n` : "\nPASS — no URL a player can type skips the voyage, and one file answers who is live\n");
process.exit(fails ? 1 : 0);
