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
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failed++; };

/* ==========================================================================================
 *  WHAT THIS GATE LOOKS AT, DERIVED — because a hand-kept list of what to guard rots exactly
 *  like the thing it guards.
 * ==========================================================================================
 * CEO 189 broke the first version of this gate four different ways and every one of them was the
 * same shape: **the gate was anchored to a file somebody typed into it, and the mistake happened in
 * a file nobody had.** It pasted Google's own console snippet into `index.html` (7/7 PASS), into
 * `classic/index.html` (7/7 PASS), and added a consent GRANT to `src/orchestrator.js` — the file
 * this project edits more than any other — and the gate printed *"nothing anywhere grants a storage
 * consent"*. So the lists below are DERIVED, not written — and what they do NOT look at is named
 * out loud in the PASS lines, because a gate that quietly does not look somewhere is the fault this
 * whole file exists to stop.
 *
 * ⚠ AND IT ASKS GIT, NOT THE FILESYSTEM — a correction made in the same hour this rule was
 * written, because the first version walked the directory and reported **1753 pages**. A game with
 * four pages does not have 1753, and a count you cannot explain is a measurement you have not made.
 * Thirty-seven stray `.tmp-*` headless-Chrome profile directories were sitting in the repo root,
 * 47 pages each. None of them ships; all of them would have been scanned, and any one of them
 * containing the word `googletagmanager` would have failed the build for nothing. **`git ls-files`
 * answers the question actually being asked — what does this repo SERVE — and cannot see untracked
 * scratch by construction.** There is no filesystem fallback on purpose: a fallback that silently
 * scans a different set is how a gate starts reporting about a world nobody meant.
 */
function tracked(pattern) {
  const r = spawnSync("git", ["-C", ROOT, "ls-files", pattern], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

/* Every page this repo actually SERVES. GitHub Pages serves it from the root, so a tracked `.html`
   is a real, reachable address — `classic/lab.html` and `scripts/battle_sim.html` included.
   ⚠ EXCEPT the ones Jekyll refuses: it serves no path whose segment starts with `.` or `_`. That is
   not a guess — it was measured on this repo during `T-247`, where it explained 84 of 84 staging
   404s with 0 unexplained. Without this line the gate fails on `.planning/ANALYTICS-PLAN.html`,
   which is the plan document written FOR Wyatt and which quotes Google's snippet on purpose. A
   file no browser can reach cannot put a cookie on a child's device. */
const servable = (p) => !p.split("/").some((seg) => seg.startsWith(".") || seg.startsWith("_"));
const PAGES = tracked("*.html")?.filter(servable) ?? null;

/* Everywhere a line of SHIPPED script can live. `scripts/` is deliberately not here: a grant in a
   QA script reaches no player, and this gate's own red proof contains the mutation text verbatim,
   so including it would make the gate flag its own evidence. */
const SHIPPED_JS = [...(tracked("src/*") ?? []), ...(tracked("classic/src/*") ?? [])]
  .filter((f) => f.endsWith(".js") || f.endsWith(".mjs")).sort();

/* Said out loud in every PASS line. A gate that quietly does not look somewhere is worse than no
   gate, because npm test stays green and everybody believes the property is defended. */
const NOT_LOOKED_AT = "anything git does not track (deploy-staging.sh rsyncs the WORKING TREE, so "
  + "an untracked page can still reach staging); any path Jekyll refuses to serve — a segment "
  + "starting with . or _, which stops being true the day a .nojekyll file appears, and nothing "
  + "will say so; a first-party tagging proxy on our own subdomain, which no host list can catch; "
  + "and — for the consent-grant scan only — scripts/, whose code reaches no player";

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
     the mutant was in.** It is now the quoted value itself, which needs no proximity at all.
     ⛔ AND THE SECOND VERSION COULD NOT SEE ITS SUBJECT EITHER, in a way the first red proof was
     never pointed at: it read FOUR TYPED FILENAMES. CEO 189 appended one line to
     `src/orchestrator.js` — `window.gtag("consent","update",{ analytics_storage: "granted" })` —
     and this case printed PASS. `src/orchestrator.js` runs for every player on the game page. **The
     back door was in the file this project edits more than any other, and the scan had never heard
     of it.** The list is now derived from the tree.
     ⚠ AND THE THIRD VERSION WENT RED ON ORDINARY ENGLISH. It matched a quoted `granted` anywhere,
     so CEO 190 put `<p>Permission "granted" by the artists.</p>` on a page and the build failed
     with *"something grants consent in credits2.html"*. It fails SAFE, which is why that was a ⚠
     and not a ⛔ — but it is CEO 182's "a PASS produced by prose" turned inside out, and one quoted
     word in a future credits line would send the next session hunting a consent grant that does
     not exist. It now matches the SHAPE of a real grant — one of the four storage keys, set to
     "granted" — which is exactly CEO 189's own mutation and needs no proximity fuzz. */
  const GRANT = /["']?(ad_storage|ad_user_data|ad_personalization|analytics_storage)["']?\s*:\s*["']granted["']/;
  const scanned = PAGES === null ? null : [...PAGES, ...SHIPPED_JS];
  const grants = (scanned ?? []).filter((f) => {
    try { return GRANT.test(readFileSync(join(ROOT, f), "utf8")); } catch { return false; }
  });
  if (!scanned || !scanned.length) fail("git could not list this repo's tracked pages and scripts, so there is nothing to scan for a consent grant — this case cannot see its subject and must not report PASS");
  else if (grants.length) fail(`something grants consent in ${grants.join(", ")} — he ruled "cookieless, no banner", so nothing should ever be able to change its mind`);
  else pass(`nothing grants a storage consent in any of the ${scanned.length} tracked page(s) and shipped script(s) — his "no banner" ruling has no back door. NOT looked at: ${NOT_LOOKED_AT}`);
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

/* 4 — THE THREE PAGES HE CHOSE, AND ONLY THOSE.
 *
 * ⚠ THIS CASE WAS SATISFIED BY PROSE. It was a bare substring test for `src/analytics.js` over the
 * whole file, so CEO 189 replaced About's script tag with `<!-- analytics removed while debugging;
 * see src/analytics.js -->` and this case printed *"all three pages he chose load the one analytics
 * module."* Zero script tags left, one mention left, PASS. **A page that MENTIONS a module is not a
 * page that LOADS it** — the same through-line CEO 182 named. It is now a script-tag match. */
{
  const want = ["index.html", "about.html", "rules.html"];
  const notWant = ["stats.html"];
  const TAG = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\banalytics\.js["'][^>]*>/;
  const has = (f) => { try { return TAG.test(readFileSync(join(ROOT, f), "utf8")); } catch { return null; } };
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

/* 6 — ⛔ NO PAGE MAY LOAD A GOOGLE TAG OF ITS OWN. THE ONE CASE THAT GUARDS THE REALISTIC MISTAKE.
 *
 * Every case above this one watches `src/analytics.js` do the right thing. **None of them ever
 * asked what ELSE a page loads** — so CEO 189 pasted the snippet Google's own console hands you
 * into `index.html`'s head, with no consent call at all, and every check still said *"no cookie
 * set"*. It A/B'd all 25 gates in the 130-chain that read `index.html`: not one changed its verdict.
 *
 * **The realistic mistake is not editing this project's analytics module. It is pasting the
 * snippet.** And it is worse than the fault the module was written to prevent: a raw tag writes
 * `_ga` onto a child's device, fires on staging, on localhost, and on every one of the sea trial's
 * hundreds of page loads an evening.
 *
 * The same paste into `classic/index.html` also passed — and `/classic` is the option he explicitly
 * DECLINED. One derived rule closes both, which is exactly what CEO 189 asked for first.
 *
 * ⛔ AND THE FIRST VERSION OF THIS CASE SCANNED THE PAGES AND NEVER THE SCRIPTS — the NINTH
 * recurrence of 182 → 186 → 189, one layer out again, found by CEO 190 in about a minute. Three
 * lines of ordinary JavaScript appended to `src/orchestrator.js`, the file this project edits most:
 *
 *     const s = document.createElement("script");
 *     s.src = "https://www.googletagmanager.com/gtag/js?id=…";
 *     document.head.appendChild(s);
 *
 * …fetched Google's tag with no consent denial at all, and all nine cases printed PASS. **The tell
 * was inside the case itself**: `ALLOWED` was declared with the comment *"the one file whose whole
 * job is this"* and then never filtered anything — it existed only inside two message strings. **A
 * one-file exemption is only meaningful over a scan that includes that file**, so the case was
 * written as though it read scripts and did not. Worse, its PASS line asserted *"the only route to
 * Google is src/analytics.js"* — a statement the mutation made false while the line still printed.
 * That is CEO 186's "a gate that certifies its own sight", literally.
 *
 * ⚠ `google-analytics.com` was also missing from the markers (CEO 190 Finding 2). It serves legacy
 * Universal Analytics *and* GA4's own `/g/collect`, so it is the second-likeliest paste after
 * `gtag.js`. **A host list cannot be complete** — a first-party tagging proxy on our own subdomain
 * would pass — which is why that limit is named in `NOT_LOOKED_AT` rather than papered over. */
{
  const MARKERS = [/googletagmanager\.com/, /google-analytics\.com/, /gtag\/js/,
    /firebase-analytics/, /\bgetAnalytics\s*\(/];
  const ALLOWED = "src/analytics.js";   // the one file whose whole job is this — and it FILTERS now
  /* Pages AND shipped scripts. The paste is just as harmful three lines into a module as it is in
     a <script> tag, and `SHIPPED_JS` was already sitting three lines up, used by one case only. */
  const subjects = PAGES === null ? null : [...PAGES, ...SHIPPED_JS].filter((f) => f !== ALLOWED);
  const offenders = [];
  for (const p of subjects ?? []) {
    let t = ""; try { t = readFileSync(join(ROOT, p), "utf8"); } catch { continue; }
    const hit = MARKERS.find((m) => m.test(t));
    if (hit) offenders.push(`${p} (${hit.source})`);
  }
  if (!subjects || !subjects.length) fail("git listed NO tracked pages or shipped scripts, so this case cannot see its subject and must not report PASS");
  else if (offenders.length) fail(`⛔ ${offenders.join(", ")} reaches a Google analytics endpoint directly. Only ${ALLOWED} may do that, because only it pushes the consent denial FIRST — a pasted snippet writes a cookie onto a child's device, and fires on staging and on every sea-trial page load`);
  else pass(`none of the ${subjects.length} tracked page(s) and shipped script(s) reaches Google except ${ALLOWED}, which denies storage first`);

  /* CEO 190 Finding 6, closed in the same pass because it costs four lines. `index.html` already
     loads Google's tag through the module, so one stray `gtag("config","G-SOMETHINGELSE")` ships
     this game's traffic to a property nobody named. Cookieless — the denial has already been
     pushed — so no cookie reaches a child, which is why it is minor rather than a ⛔. The id set is
     DERIVED from the module's own MEASUREMENT_ID, so it cannot drift from it. */
  const mine = readFileSync(join(ROOT, ALLOWED), "utf8").match(/MEASUREMENT_ID\s*=\s*"([^"]+)"/)?.[1];
  const strays = new Set();
  for (const p of subjects ?? []) {
    let t = ""; try { t = readFileSync(join(ROOT, p), "utf8"); } catch { continue; }
    for (const m of t.matchAll(/["'](G-[A-Z0-9]{6,})["']/g)) if (m[1] !== mine) strays.add(`${m[1]} in ${p}`);
  }
  if (!mine) fail(`could not read ${ALLOWED}'s own measurement id, so "is any OTHER property configured" cannot be asked — this case must not report PASS`);
  else if (strays.size) fail(`⛔ a second Google property is named outside ${ALLOWED}: ${[...strays].join(", ")} — the game page already loads the tag, so this ships his players' traffic to a property nobody chose`);
  else pass(`no measurement id other than ${mine} appears anywhere in those ${subjects.length} file(s) — his traffic goes to one property, the one he owns`);
}

/* 7 — IMPORTING THE MODULE IS WHAT INSTALLS IT. Cases 1 and 3 call `installAnalytics()` by hand,
 *     so they cannot tell a live install from a dead one: CEO 189 commented out the module's own
 *     bottom-line call — the only thing that makes a page importing it do anything — and got 7/7
 *     PASS, including *"his three pages measured."* Safe direction, but it would leave him reading
 *     a property that had quietly stopped collecting. This drives the IMPORT, not the export. */
{
  const seq = [];
  const win = {
    location: { hostname: "playpastrypirates.com" },
    dataLayer: { push(a) { seq.push(String(a[0])); } },
    document: { createElement: () => ({}), head: { appendChild() { seq.push("load"); } } },
  };
  const had = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prev = globalThis.window;
  globalThis.window = win;
  try {
    /* A cache-buster, because the top of this file already imported the module once. */
    await import(new URL(`../../src/analytics.js?fresh=${Date.now()}`, import.meta.url).href);
  } catch (e) {
    fail(`re-importing src/analytics.js threw: ${String(e.message).split("\n")[0]} — this case cannot see its subject`);
  } finally {
    if (had) globalThis.window = prev; else delete globalThis.window;
  }
  if (!win.__ppAnalyticsInstalled) fail("importing src/analytics.js installs NOTHING — the three pages load a module that does nothing, and every other case here still passes because they call installAnalytics() by hand");
  else if (!seq.includes("consent") || !seq.includes("load")) fail(`importing the module installed something incomplete — it did ${JSON.stringify(seq)}`);
  else pass("importing the module is what installs it — driven through the import, so a deleted bottom-line call goes red");
}

console.log(failed
  ? `\nFAIL — ${failed} failure(s).`
  : `\nPASS — the denial lands before the tag; his three pages load the module; and across ${PAGES.length} tracked page(s) plus ${SHIPPED_JS.length} shipped script(s), nothing else reaches Google, nothing grants storage, and no second property is named. It fires on the live domain alone. NOT measured here: what Google actually does with a real ping, and ${NOT_LOOKED_AT}.`);
process.exit(failed ? 1 : 0);
