#!/usr/bin/env node
/* GATE: ANALYTICS RUNS ON THE THREE PAGES HE CHOSE, SETS NO COOKIE, AND NEVER COUNTS OUR OWN TESTING.
 *
 * HIS TWO RULINGS, 2026-09-03, verbatim:
 *   which pages — *"The public pages only — the game, About and Rules."*
 *   cookie      — *"Cookieless, no banner — you keep the referrer, the geography and the per-page
 *                  numbers, set no cookie, and no child is asked to consent."*
 *
 * ⛔ THE PROPERTY THIS GATE DEFENDS IS AN ORDER, NOT A PRESENCE. Every wrong version of this
 * installation looks right: the tag is there, the denial is there, and the denial arrives after the
 * tag has already decided it may store. The page is then indistinguishable by eye from the correct
 * one and quietly writes a cookie onto a child's device. **So this gate does not grep for a
 * snippet. It RUNS the installer against a fake window and records the sequence** — the only way to
 * see an ordering fault is to watch it happen (rule 6: verify against a different route, never
 * against the suspect itself; rule 27: ask what happened immediately BEFORE).
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failed++; };

console.log("analytics_consent_check — his three pages, no cookie, and never our own testing\n");

const mod = await import(new URL("../../src/analytics.js", import.meta.url).href).catch((e) => {
  fail(`src/analytics.js will not load: ${String(e.message).split("\n")[0]}`);
  return null;
});

/* A window that records what the installer does to it, in order. */
function drive(hostname) {
  const seq = [];
  const win = {
    location: { hostname },
    dataLayer: { push(args) { seq.push(`gtag:${args[0]}${args[1] ? ":" + args[1] : ""}`); } },
    document: {
      createElement: () => ({}),
      head: { appendChild(node) { seq.push(`load:${node.src}`); } },
    },
  };
  const verdict = mod ? mod.installAnalytics(win) : "module-missing";
  return { seq, verdict };
}

/* 1 — ⛔ THE DENIAL LANDS BEFORE THE TAG DOES. The whole safety property, watched rather than read. */
if (mod) {
  const { seq, verdict } = drive("playpastrypirates.com");
  const iConsent = seq.findIndex((s) => s.startsWith("gtag:consent:default"));
  const iLoad = seq.findIndex((s) => s.startsWith("load:https://www.googletagmanager.com/"));
  if (verdict !== "installed") fail(`on the live host the installer returned "${verdict}" instead of installing — nothing is being measured at all`);
  else if (iConsent < 0) fail("no consent default was ever pushed — the tag would store on a child's device by default");
  else if (iLoad < 0) fail("the Google tag was never loaded, so nothing is measured");
  else if (iConsent > iLoad) fail(`⛔ THE TAG LOADS BEFORE THE DENIAL (load at ${iLoad}, denial at ${iConsent}). It has already decided it may store; the denial arrives too late and a cookie is written. This is the fault that looks identical to the correct page.`);
  else pass(`the denial is pushed BEFORE the tag is fetched (denial ${iConsent}, load ${iLoad}) — watched by running it, not read off the source`);
}

/* 2 — ALL FOUR STORAGE TYPES DENIED, and nothing anywhere grants one. */
if (mod) {
  const src = readFileSync(join(ROOT, "src", "analytics.js"), "utf8");
  const body = src.split("gtag(\"consent\", \"default\"")[1]?.split(");")[0] ?? "";
  const need = ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"];
  const missing = need.filter((k) => !new RegExp(`${k}\\s*:\\s*"denied"`).test(body));
  if (!body) fail("cannot find the consent default call to inspect — this case cannot see its subject, so it must not report PASS");
  else if (missing.length) fail(`${missing.length} storage type(s) not denied by default: ${missing.join(", ")} — a type nobody denies is a type Google may store`);
  else pass("all four storage types are denied by default — ad_storage, ad_user_data, ad_personalization, analytics_storage");

  /* He ruled NO BANNER, so there is nothing that could ever grant consent later. If a grant
     appears, either a banner was built without him or something is quietly undoing his ruling.
     ⚠ THE FIRST VERSION OF THIS CASE COULD NOT SEE ITS OWN SUBJECT, and the red proof is what
     said so: it looked for "consent" and "granted" within 80 characters ON ONE LINE, and the
     consent object is written across five lines — so mutating `analytics_storage` to "granted"
     left this case printing PASS while the grant sat four lines below the word "consent". The
     case above caught the mutant; this one would not have caught a grant added anywhere else.
     **A red proof is not only for the case you are proving. Read what the OTHER lines said while
     the mutant was in.** It is now the quoted value itself, which needs no proximity at all. */
  const grants = [];
  for (const f of ["src/analytics.js", "index.html", "about.html", "rules.html"]) {
    let t = ""; try { t = readFileSync(join(ROOT, f), "utf8"); } catch { continue; }
    if (/["']granted["']/.test(t)) grants.push(f);
  }
  if (grants.length) fail(`something grants consent in ${grants.join(", ")} — he ruled "cookieless, no banner", so nothing should ever be able to change its mind`);
  else pass('nothing anywhere grants a storage consent — his "no banner" ruling has no back door');
}

/* 3 — ⛔ IT NEVER COUNTS OUR OWN TESTING. A sea trial loads these pages hundreds of times an
 *     evening and staging exists so he can play a build that is not the real one. Counting either
 *     makes the first number he ever reads from this property a fiction he cannot detect. */
if (mod) {
  const offenders = ["staging.playpastrypirates.com", "localhost", "127.0.0.1", "wyattroy.github.io", ""]
    .filter((h) => mod.analyticsShouldRun(h));
  if (offenders.length) fail(`analytics would fire on ${offenders.map((o) => JSON.stringify(o)).join(", ")} — his own trials and his own staging would inflate his own figures`);
  else if (!mod.analyticsShouldRun("playpastrypirates.com")) fail("analytics would NOT fire on the live domain — it is installed and measuring nothing");
  else pass("it fires on the live domain and on nothing else — not staging, not localhost, not a probe");
  const { verdict } = drive("staging.playpastrypirates.com");
  if (verdict !== "not-live-host") fail(`driven against staging the installer returned "${verdict}" — the guard is declared and not obeyed`);
  else pass("driven against staging, the installer refuses and installs nothing (behaviour, not a declaration)");
}

/* 4 — THE THREE PAGES HE CHOSE, AND ONLY THOSE. */
{
  const want = ["index.html", "about.html", "rules.html"];
  const notWant = ["stats.html"];
  const has = (f) => { try { return /src\/analytics\.js/.test(readFileSync(join(ROOT, f), "utf8")); } catch { return null; } };
  const missing = want.filter((f) => has(f) === false);
  const unreadable = want.filter((f) => has(f) === null);
  const extra = notWant.filter((f) => has(f) === true);
  if (unreadable.length) fail(`cannot read ${unreadable.join(", ")} — this case cannot see its subject`);
  else if (missing.length) fail(`${missing.join(", ")} do(es) not load src/analytics.js — he chose "the public pages only: the game, About and Rules", and a page nobody measures is the gap he named`);
  else if (extra.length) fail(`${extra.join(", ")} loads analytics and he did not choose it — his ruling names three pages`);
  else pass(`all three pages he chose load the one analytics module, and ${notWant.join(", ")} does not — ${want.join(", ")}`);
}

/* 5 — ONE MEASUREMENT ID, TWO FILES, AND THEY MUST AGREE. `src/net/index.js`'s firebaseConfig
 *     carries the same id and its own header forbids retyping it, so neither file may import the
 *     other. Two hand-kept copies is how they drift; this is the check that makes them one fact. */
{
  const a = readFileSync(join(ROOT, "src", "analytics.js"), "utf8").match(/MEASUREMENT_ID\s*=\s*"([^"]+)"/)?.[1];
  const n = readFileSync(join(ROOT, "src", "net", "index.js"), "utf8").match(/measurementId:\s*"([^"]+)"/)?.[1];
  if (!a || !n) fail(`could not read both ids (analytics=${a ?? "none"}, firebase=${n ?? "none"}) — nothing can be said about whether they agree`);
  else if (a !== n) fail(`the analytics id "${a}" and firebase's "${n}" disagree — one of them is measuring a property nobody is reading`);
  else pass(`the measurement id is the same fact in both files — ${a}`);
}

console.log(failed ? `\nFAIL — ${failed} failure(s).` : "\nPASS — his three pages measured, no cookie set, and our own testing never counted.");
process.exit(failed ? 1 : 0);
