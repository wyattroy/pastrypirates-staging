#!/usr/bin/env node
// Every page GitHub Pages SERVES must say whether Google may index it.
//
// WHY THIS EXISTS. Wyatt ruled "yes" on T-102: his working files were crawlable and a note had
// told him they were not. The note's reasoning was that they are absent from `sitemap.xml` —
// but A SITEMAP IS AN INVITATION, NOT A FENCE. Leaving a page out of it changes nothing about
// whether a crawler that finds the URL any other way may read and index it.
//
// WHY IT IS DERIVED AND NOT A LIST. The set it guards GREW while the ruling sat unactioned:
// `scratchpad/` did not exist when the ruling was written and carries two more pages today.
// A hand-typed Disallow list rots exactly like the thing it guards (CLAUDE.md §6), so this
// gate derives the served set from the repo tree and the public set from `sitemap.xml`, and
// a page added tomorrow is covered the moment it is committed.
//
// WHAT "SERVED" MEANS, and it is measured, not assumed. This repo has no `.nojekyll` and no
// `_config.yml`, so Pages runs Jekyll, which drops any path segment beginning with `.` or `_`.
// That is why `.planning/`'s twenty pages are NOT part of this set — verified against the live
// domain on 2026-09-03: `/.planning/playtest-checklist.html` answers 404 while
// `/art-review/gallery.html` answers 200.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  jekyllHides, trackedFiles, servedPages, declaredIntent as declaredIntentOf,
  robotsRules, isDisallowed as isDisallowedBy,
} from "./crawl_sets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// --red=<mode> patches ONE input in memory so each clause can be shown to fail on demand, with no
// file edited. CEO 183 could not red-proof this gate because it was read-only and the only way to
// break it was to edit a page; that is a gate nobody can audit without write access.
const RED = (process.argv.find((a) => a.startsWith("--red=")) || "").slice(6);
const RED_MODES = ["nometa", "bodymeta", "publicnoindex", "unfenced", "newfolder"];
if (RED && !RED_MODES.includes(RED)) {
  console.error(`unknown --red mode "${RED}". Legal: ${RED_MODES.join(", ")}`);
  process.exit(2);
}

const read = (p) => {
  let src = readFileSync(resolve(ROOT, p), "utf8");
  if (RED === "nometa" && p === "art-review/gallery.html") {
    src = src.replace(/<meta[^>]+name=["']robots["'][^>]*>\s*/i, "");
  }
  if (RED === "bodymeta" && p === "art-review/gallery.html") {
    // Move the declaration out of <head> and into the body: still in the file, ignored by Google.
    const m = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(src);
    if (m) src = src.replace(m[0], "").replace(/<body[^>]*>/i, (b) => `${b}\n${m[0]}`);
  }
  if (RED === "publicnoindex" && p === "rules.html") {
    src = src.replace(/(<meta[^>]+name=["']robots["'][^>]*content=["'])[^"']*/i, '$1noindex, nofollow');
  }
  if (RED === "unfenced" && p === "robots.txt") {
    src = src.replace(/^Disallow: \/scripts\/\s*$/im, "");
  }
  return src;
};

// --- the served set: every tracked .html Jekyll will publish -------------------------------
// DERIVED IN `crawl_sets.mjs`, NOT HERE. His T-102 ruling made `sitemap.xml` a generated artifact,
// so `sitemap_write.mjs` now needs the same notion of "served" and "public" that this gate uses.
// Two copies of that predicate is the drift CLAUDE.md §2 exists to stop — the design-time question
// is "what makes these two agree?", and the only durable answer is that there is one of them.
// `read` is threaded through so every --red mode still reaches the code it patches.
const served = servedPages(ROOT);

// --- the public set: whatever sitemap.xml invites ------------------------------------------
// A sitemap <loc> is a URL; turn it back into the repo path Pages serves it from.
const sitemap = read("sitemap.xml");
const publicPaths = new Set(
  [...sitemap.matchAll(/<loc>\s*https?:\/\/[^/]+\/([^<]*)<\/loc>/g)].map(([, tail]) =>
    tail === "" || tail.endsWith("/") ? `${tail}index.html` : tail,
  ),
);

// --- what robots.txt fences off ------------------------------------------------------------
// Longest-match-wins (RFC 9309) lives in crawl_sets.mjs now. This gate got that wrong first time
// in a way that quietly disarmed it: fencing /art-review/ with per-page `Allow:` overrides made a
// naive Disallow-only reader treat all thirteen already-live pages as fenced, so it stopped
// requiring the noindex that is the entire point of them. Caught by --red=nometa reporting
// "changed nothing", which is exactly what that mode exists to say.
const rules = robotsRules(ROOT, read);
const { disallowed } = rules;
const isDisallowed = (p) => isDisallowedBy(rules, p);

// --- what each page declares about itself --------------------------------------------------
const declaredIntent = (p) => declaredIntentOf(ROOT, p, read);

const failures = [];
for (const p of served) {
  const intent = declaredIntent(p);
  const isPublic = publicPaths.has(p);

  if (isPublic) {
    // An invited page must actually accept the invitation.
    if (!intent || /noindex/.test(intent)) {
      failures.push(`${p} — is in sitemap.xml but ${intent ? `declares "${intent}"` : "declares no crawl intent"}`);
    } else if (isDisallowed(p)) {
      failures.push(`${p} — is in sitemap.xml and ALSO Disallowed in robots.txt; those contradict`);
    }
    continue;
  }

  // Not invited. It must still say so itself, or be fenced.
  if (!intent && !isDisallowed(p)) {
    failures.push(`${p} — is served, is not in sitemap.xml, declares no crawl intent and is not Disallowed`);
  } else if (intent && !/noindex/.test(intent) && !isDisallowed(p)) {
    failures.push(`${p} — is served, is not in sitemap.xml, and declares "${intent}"`);
  }
}

// --- CLAUSE 2: the files that can carry no meta tag at all ---------------------------------
// A .js, .png or .md has no <head>, and GitHub Pages cannot send an X-Robots-Tag, so robots.txt
// is the ONLY tool for them. The first version of this gate globbed "*.html" and could therefore
// never see 376 served files under scripts/ alone — the folder Wyatt named by name (CEO 183,
// finding 1). Classification is by TOP-LEVEL FOLDER and it is STRICT BY DEFAULT: a folder nobody
// has classified FAILS, so a directory added tomorrow cannot quietly publish itself. That is the
// same shape gear.mjs uses, and for the same reason — a hand-kept list of what to guard rots,
// but a hand-kept list of what is ALLOWED fails safe.
const SHIPPED = new Set(["assets", "src", "sfx", "classic", "(root)"]); // the game itself: a crawler
// blocked from these cannot render the page it is ranking, so they must stay open.
const WORKING = new Set(["scripts", "art-review", "docs", "notes", "scratchpad"]); // must be fenced.

const allTracked = trackedFiles(ROOT).filter((p) => !jekyllHides(p));

const seenFolders = new Map();
for (const p of allTracked) {
  const top = p.includes("/") ? p.split("/")[0] : "(root)";
  if (!seenFolders.has(top)) seenFolders.set(top, []);
  seenFolders.get(top).push(p);
}

if (RED === "newfolder") seenFolders.set("brochure", ["brochure/leaflet.pdf"]);

for (const [folder, files] of seenFolders) {
  if (SHIPPED.has(folder)) continue;
  if (!WORKING.has(folder)) {
    failures.push(`${folder}/ — ${files.length} served file(s) in a folder this gate has never been told about; classify it SHIPPED (the game) or WORKING (fenced) in ${"crawl_intent_check.mjs"}`);
    continue;
  }
  // A WORKING folder must be fenced wholesale, or every non-HTML file in it is crawlable.
  const nonHtml = files.filter((p) => !p.toLowerCase().endsWith(".html"));
  if (nonHtml.length && !disallowed.includes(`/${folder}/`)) {
    failures.push(`${folder}/ — ${nonHtml.length} file(s) that can carry no meta tag (e.g. ${nonHtml[0]}) and robots.txt has no "Disallow: /${folder}/"`);
  }
}

if (failures.length) {
  console.error(`FAIL  ${failures.length} problem(s) with what this site tells a crawler (${served.length} served page(s), ${seenFolders.size} folder(s) checked):`);
  for (const f of failures) console.error(`        • ${f}`);

  // The hint has to match the fault. Red-proofing this gate produced a public page wrongly
  // marked noindex and the advice printed was "add noindex" — the exact opposite of the fix.
  if (failures.some((f) => /declares no crawl intent/.test(f))) {
    console.error(`
      A page absent from sitemap.xml is NOT thereby hidden. Add to its <head>:
          <meta name="robots" content="noindex, nofollow">

      NOINDEX, NOT A robots.txt Disallow, for anything that has already been live. A Disallow
      stops the crawler FETCHING the page, so it can never read a noindex and never drops a URL
      it already holds — the page stays in the index as a bare link forever. Disallow is for
      paths that were never reachable.`);
  }
  if (failures.some((f) => /is in sitemap\.xml/.test(f))) {
    console.error(`
      A page you INVITED in sitemap.xml must accept the invitation. Either let it be indexed,
      or drop its <loc> from sitemap.xml — inviting a crawler to a page that turns it away is
      the one combination that is always a mistake.`);
  }
  if (RED) console.error(`\n      (this was --red=${RED}: the patch did its job and the gate refused)`);
  process.exit(1);
}

if (RED) {
  console.error(`FAIL  --red=${RED} changed nothing — this gate CANNOT fail that way, so it is not guarding what it claims.`);
  process.exit(2);
}

const fenced = [...seenFolders.keys()].filter((f) => WORKING.has(f));
console.log(`PASS  ${served.length} served page(s) each state whether Google may index them (${publicPaths.size} public, ${served.length - publicPaths.size} withheld);`);
console.log(`      ${fenced.length} working folder(s) fenced in robots.txt for the files that can carry no meta tag (${fenced.join(", ")}).`);
