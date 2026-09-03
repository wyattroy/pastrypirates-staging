#!/usr/bin/env node
/* GATE: `sitemap.xml`'s PAGE LIST is derived from the pages, not kept by hand.
 *
 *   node scripts/qa/sitemap_list_derived_check.mjs
 *   node scripts/qa/sitemap_list_derived_check.mjs --red=<mode>
 *
 * WYATT'S RULING, verbatim. Asked *"You asked me to recommend rather than build: should the
 * sitemap's page list be generated from the actual pages?"* — the note to him saying it goes stale
 * silently, and that `/rules.html` would vanish from Google without a sound — he answered **yes**.
 *
 * WHAT WAS ALREADY TRUE WHEN THIS WAS WRITTEN, AND IT IS HALF THE JOB. `crawl_intent_check.mjs`
 * (built 83 minutes before this file, for the noindex half of the same handle) already NOTICES the
 * drift: a served page that declares itself indexable and is missing from the sitemap fails the
 * build. So *detection* was done. **Generation was not** — `sitemap_write.mjs` read its URL list
 * out of the very file it was rewriting, so it could never add a page that was missing nor drop
 * one that had stopped being public, and the repair for a red build was to hand-type a `<loc>`.
 * That is the hand-kept list his ruling removes, and it is the thing this gate holds down.
 *
 * WHAT IT ASSERTS, AND WHY IT IS NOT A SECOND COPY OF THE SIBLING GATE. `crawl_intent_check.mjs`
 * audits pages: does each served page state an intent, and does the sitemap agree with it? This
 * one audits the WRITER: run it against two different prior sitemaps and the emitted list must be
 * identical, and must equal the derived public set. Those are different claims — the first can
 * hold while the list is still hand-kept, which is exactly the state this file was written in.
 * Both import their notion of "public" from `crawl_sets.mjs`, so there is ONE definition and they
 * cannot drift apart (CLAUDE.md §2, ONE DISPLAY PATH).
 *
 * ⚠ IT NEVER WRITES. `sitemap.xml` is a site-identity file (rule 14, `docs/GIT-AND-DEPLOY.md` §1);
 * every run here is `--print` into a pipe, and the fixtures live in a temp directory that is never
 * inside the published tree. A guard that repairs its own subject can never be seen to have failed.
 */
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicPages, fileToLoc } from "./crawl_sets.mjs";
import { readOrigin } from "./sitemap_lastmod_check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WRITER = join(ROOT, "scripts", "qa", "sitemap_write.mjs");

/* ⛔ CLAUSE 1 WAS REWRITTEN AFTER CEO 185 SHOWED THE FIRST VERSION COULD NOT FAIL, AND THE REASONING
   IS THE MOST USEFUL THING IN THIS FILE.
   It used to run the writer against two prior sitemaps and require the emitted list to be identical
   — and it was the line printed on success. But a writer only notices those fixtures if it READS
   the `--sitemap=` flag, and no real writer does: the flag is this gate's own seam. Revert
   `sitemap_write.mjs` to the list-from-file version it had before his ruling and that version has
   no flag parser either, so it would read the real sitemap.xml twice, emit the same correct list
   twice, and sail through — **the gate would bless the exact regression it exists to forbid.**
   CLAUDE.md §1: a measurement that cannot fail is not a measurement.
   So clause 1 is now a claim about the WRITER'S SOURCE — it must never read `sitemap.xml` as an
   INPUT — which is the invariant his ruling actually bought and the one thing a revert cannot hide.
   The two-fixture comparison is kept below as clause 1b, honestly demoted: it is real evidence only
   against a writer that grows a reader for that flag again, and it is no longer the PASS headline.
   A STATIC CLAUSE IS NOT THE FAULT; A FALSE REASON FOR ONE IS (CEO 180). The reason is above. */
const RED = (process.argv.find((a) => a.startsWith("--red=")) || "").slice(6);
const RED_MODES = ["readsback", "fromfile", "echoinput", "diskdrift"];
if (RED && !RED_MODES.includes(RED)) {
  console.error(`unknown --red mode "${RED}". Legal: ${RED_MODES.join(", ")}`);
  process.exit(2);
}

const origin = readOrigin();
const want = publicPages(ROOT).map((p) => fileToLoc(origin, p)).sort();

if (!want.length) {
  console.error("FAIL  no page in this repo declares itself public — refusing to bless an empty sitemap");
  process.exit(1);
}

const locsOf = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(([, l]) => l).sort();

/* THE TWO FIXTURES ARE DELIBERATELY WRONG IN OPPOSITE DIRECTIONS. One is missing a real public
   page (the `/rules.html` case from his own note); the other invites a page that robots.txt
   fences. A writer that derives its list ignores both and emits the same thing twice. */
const tmp = mkdtempSync(join(tmpdir(), "pp-sitemap-"));
const url = (loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>2020-01-01</lastmod>\n  </url>\n`;
const wrap = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}</urlset>\n`;

// Fixture A — a public page dropped. RED MODE `fromfile` keeps it dropped in the expectation too,
// which is what a hand-kept list silently does; the gate must refuse that.
const shortList = want.slice(0, -1);
const fixtureA = join(tmp, "missing-a-public-page.xml");
writeFileSync(fixtureA, wrap(shortList.map(url).join("")));

// Fixture B — a fenced page invited. `/stats.html` is his own player-count console: it carries a
// `noindex` AND sits behind a `Disallow`, so it is excluded on both legs of the predicate. The
// unfixed writer accepts it happily — it checks only that the file exists, and never asks whether
// a crawler is allowed to see it.
//
// NOT `/lab.html`, and the correction is worth keeping: robots.txt fences `/lab.html`, so it reads
// like a served page, and it is not in this repo at all. A fixture is a claim about the world too.
const fixtureB = join(tmp, "invites-a-fenced-page.xml");
writeFileSync(fixtureB, wrap([...want, `${origin}/stats.html`].map(url).join("")));

/* The stub the `echoinput` mode substitutes: a writer that echoes its prior list, which is exactly
   what `sitemap_write.mjs` did before his ruling. Nothing in the repo is touched — it is written
   into the same temp directory as the fixtures. */
let writerPath = WRITER;
if (RED === "echoinput") {
  writerPath = join(tmp, "echo-writer.mjs");
  writeFileSync(
    writerPath,
    `import {readFileSync} from "node:fs";\n` +
      `const from=(process.argv.find(a=>a.startsWith("--sitemap="))||"").slice(10);\n` +
      `process.stdout.write(readFileSync(from,"utf8"));\n`,
  );
}

const runWriter = (fixture) =>
  execFileSync(process.execPath, [writerPath, "--print", `--sitemap=${fixture}`], {
    cwd: ROOT, encoding: "utf8",
  });

let outA, outB;
try {
  outA = runWriter(fixtureA);
  outB = runWriter(fixtureB);
} catch (e) {
  console.error(`FAIL  the writer refused a prior sitemap it should have ignored entirely:\n${e.stderr || e.message}`);
  console.error(`\n      A derived list does not depend on the file it replaces, so no prior list can be invalid.`);
  process.exit(1);
}

const failures = [];
const gotA = locsOf(outA);
const gotB = locsOf(outB);

/* CLAUSE 1 — the writer never READS sitemap.xml. This is the one a revert cannot slip past: the
   pre-ruling writer's defining line was `readFileSync(SITEMAP)`, and any return to a hand-kept list
   has to read the file back from somewhere. Writing it is fine and required — only reading it as an
   input is forbidden — so the two are told apart rather than the filename simply being banned. */
let writerSrc = readFileSync(WRITER, "utf8");
if (RED === "readsback") writerSrc = writerSrc.replace(/^const origin = /m, "const prior = fs.readFileSync(SITEMAP, \"utf8\");\nconst origin = ");
const readsBack = [...writerSrc.matchAll(/readFileSync\s*\(\s*([A-Za-z_$][\w$]*)/g)].map(([, v]) => v);
if (readsBack.includes("SITEMAP")) {
  failures.push(
    `sitemap_write.mjs READS sitemap.xml back (readFileSync(SITEMAP)) — the page list is coming ` +
    `out of the file it replaces again, which is the hand-kept list his ruling removed`,
  );
}

// CLAUSE 1b — supporting only: a writer that DOES read a prior list must at least ignore it.
// Weak by construction (the real writer has no parser for --sitemap=), and said so rather than
// printed as protection. See the note at the top of this file.
if (gotA.join("\n") !== gotB.join("\n")) {
  failures.push(
    `the writer emitted DIFFERENT lists for two different prior sitemaps, so the list is still ` +
    `read out of the file it replaces:\n          from A: ${gotA.length} url(s)\n          from B: ${gotB.length} url(s)`,
  );
}

// CLAUSE 2 — and the list it emits is the derived public set.
const expected = RED === "fromfile" ? shortList : want;
if (gotA.join("\n") !== expected.join("\n")) {
  const missing = expected.filter((l) => !gotA.includes(l));
  const extra = gotA.filter((l) => !expected.includes(l));
  failures.push(
    `the emitted list is not the set of pages that declare themselves public:` +
    (missing.length ? `\n          missing: ${missing.join(", ")}` : "") +
    (extra.length ? `\n          unexpected: ${extra.join(", ")}` : ""),
  );
}

// CLAUSE 3 — and the file on disk matches, i.e. somebody actually ran the writer.
let diskXml = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
if (RED === "diskdrift") diskXml = diskXml.replace(/<url>[\s\S]*?<\/url>\s*/, "");
const onDisk = locsOf(diskXml);
if (onDisk.join("\n") !== want.join("\n")) {
  const missing = want.filter((l) => !onDisk.includes(l));
  const extra = onDisk.filter((l) => !want.includes(l));
  failures.push(
    `sitemap.xml on disk disagrees with what the pages say:` +
    (missing.length ? `\n          public page(s) not invited: ${missing.join(", ")}` : "") +
    (extra.length ? `\n          invited but not public: ${extra.join(", ")}` : ""),
  );
}

if (failures.length) {
  console.error(`FAIL  ${failures.length} problem(s) — the sitemap's page list is not derived from the pages:`);
  for (const f of failures) console.error(`        • ${f}`);
  console.error(`
      His ruling on T-102 was that this list is GENERATED, never kept by hand. Regenerate it:
          node scripts/qa/sitemap_write.mjs

      If a page is in or out of that list wrongly, the fix is on the PAGE, not here: a served
      page is public iff its <head> declares a robots intent without "noindex" AND robots.txt
      does not fence it. Change the page, then regenerate.`);
  if (RED) console.error(`\n      (this was --red=${RED}: the patch did its job and the gate refused)`);
  process.exit(1);
}

if (RED) {
  console.error(`FAIL  --red=${RED} changed nothing — this gate CANNOT fail that way, so it is not guarding what it claims.`);
  process.exit(2);
}

console.log(`PASS  sitemap.xml's page list is derived: the writer never reads the file back, and the ${want.length} url(s) it emits are exactly the pages that declare themselves public.`);
console.log(`      ${want.map((l) => l.replace(origin, "")).join("  ")}`);
