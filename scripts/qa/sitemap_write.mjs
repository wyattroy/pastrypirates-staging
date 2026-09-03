/* Regenerate `sitemap.xml`: the PAGE LIST derived from the pages, every `<lastmod>` derived from git.
 *
 *   node scripts/qa/sitemap_write.mjs            # rewrite the file
 *   node scripts/qa/sitemap_write.mjs --print    # print it, touch nothing
 *
 * WHY THIS IS A SCRIPT AND NOT AN EDIT. Wyatt, 2026-09-02, 3:07 PM ET: *"DERIVE the dates, do not
 * hand-type them — an inaccurate lastmod gets discounted by Google, and a hand-typed date is wrong
 * the moment work continues."* On this branch `index.html` is committed most days, so a date typed
 * today is wrong tomorrow, and wrong silently: Google's response to a sitemap it can prove stale is
 * to stop trusting the dates, which nothing on our side ever observes.
 *
 * AND THE LIST IS NOW DERIVED TOO — HIS RULING ON T-102, 2026-09-03. Asked *"should the sitemap's
 * page list be generated from the actual pages?"*, against a note saying it goes stale silently and
 * that `/rules.html` would vanish from Google without a sound, he answered **yes**.
 *
 * ⚠ THE PARAGRAPH THAT USED TO BE HERE ARGUED THE OPPOSITE, AND ITS ARGUMENT WAS SOUND WHEN IT WAS
 * WRITTEN. It said the list must stay hand-kept because "which pages belong in the index is an
 * editorial decision", and that a generator walking the directory "would quietly re-add every one
 * of them". **That was true of a generator that walks the directory. This one does not.** It asks
 * each page what it declares about itself, and every page that must stay out now says so in its own
 * `<head>` — the thirteen already-live working pages were given `noindex` on 2026-09-03, and
 * `/classic` has carried `noindex, follow` all along. The editorial decision did not disappear; it
 * MOVED, from a list in this file to the page it is about, which is the only place it cannot go
 * stale relative to the thing it describes.
 *
 * SO THE FAULT THIS REMOVES, CONCRETELY: reading the list out of the file it was rewriting meant
 * the writer could never add a page that was missing nor drop one that had stopped being public.
 * `crawl_intent_check.mjs` would go red on the drift — that half has worked since 19:25Z on
 * 2026-09-03 — and the only repair was to hand-type a `<loc>`. Now the repair is this command.
 *
 * ⚠ AND IT KEEPS THE `<loc>` AND NOTHING ELSE FROM AN ENTRY. An earlier version of this comment
 * said *"everything else about an entry is preserved in the order it was written"*, and that was a
 * behavioural claim about code that does not do it — CEO 122's finding 2. The writer below emits
 * `<loc>` and `<lastmod>`, full stop, so an `<xhtml:link>` alternate or an `<image:image>` added by
 * hand would be dropped on the next run, in silence. Both entries are `loc`-only today so nothing
 * is lost; **the next person to add a tag here has to teach this function about it first.**
 *
 * ⚠ `sitemap.xml` IS A SITE-IDENTITY FILE (rule 14, `docs/GIT-AND-DEPLOY.md` §1). It must never be
 * copied into the preview or staging tree — `deploy-staging.sh:154` already excludes it, and this
 * script deliberately touches nothing but the one file at the repo root. Do not "helpfully" teach
 * it to write a second copy anywhere.
 *
 * The gate that keeps this true is `sitemap_lastmod_check.mjs`, which recomputes the same dates and
 * fails when the file on disk disagrees. This script exists so that fixing that failure is one
 * command instead of an invitation to type a date.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readOrigin, gitLastCommitDate } from "./sitemap_lastmod_check.mjs";
import { publicPages, fileToLoc } from "./crawl_sets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITEMAP = path.join(ROOT, "sitemap.xml");

/* `--sitemap=<path>` IS A RED-PROOF SEAM AND NOW READS NOTHING AT ALL — that is the point of it.
   `sitemap_list_derived_check.mjs` runs this writer against two prior sitemaps that are wrong in
   opposite directions and requires the emitted list to be identical; a flag the writer accepts and
   ignores is what makes that claim testable. It never changes where the file is WRITTEN, so it
   cannot be used to publish a second sitemap (rule 14 — this script touches exactly one file at the
   repo root). CEO 183 made the same point about a gate that could only be broken by editing a real
   page: a claim about how output varies with an input cannot be tested without varying that input. */

const origin = readOrigin();

/* THE LIST, DERIVED. `publicPages()` is the ONE definition of public, shared with
   `crawl_intent_check.mjs` so the generator and its guard cannot drift apart (CLAUDE.md §2). A
   served page is public iff its `<head>` declares a robots intent without "noindex" AND robots.txt
   does not fence it — so a page stays out of Google by SAYING SO IN ITSELF, not by being left off
   a list somebody maintains here. */
const pages = publicPages(ROOT);
if (!pages.length) {
  console.error("sitemap_write: no page in this repo declares itself public — refusing to write an empty sitemap");
  process.exit(1);
}

/* SORTED BY URL, NOT BY REPO PATH, and the difference is visible: `index.html` sorts after
   `about.html` as a filename, but the `/` it is served at sorts before `/about.html` — so sorting
   by path would push the front door into second place for no reason a reader could see. Sorting by
   the thing the file actually expresses also makes the output stable and diff-free. */
const entries = [];
for (const rel of pages) {
  /* REFUSE, NEVER SUBSTITUTE. An uncommitted page has no derivable date, and the two tempting
     fallbacks — today, or the file's mtime — are both fabrications that would read to a crawler
     exactly like a real one. His whole point is that a wrong date costs more than a missing one.
     This now bites on a page that is public and NEW, which the old list-from-file version could
     never reach: commit the page, then run this. */
  const lastmod = gitLastCommitDate(rel);
  if (!lastmod) {
    console.error(`sitemap_write: ${rel} declares itself public but git has never committed it, so no lastmod can be derived — refusing`);
    console.error(`sitemap_write: commit the page first, or give it <meta name="robots" content="noindex, nofollow">`);
    process.exit(1);
  }
  entries.push({ loc: fileToLoc(origin, rel), rel, lastmod });
}
entries.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));

const out =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entries.map((e) =>
    `  <url>\n` +
    `    <loc>${e.loc}</loc>\n` +
    `    <lastmod>${e.lastmod}</lastmod>\n` +
    `  </url>\n`).join("") +
  `</urlset>\n`;

if (process.argv.includes("--print")) {
  process.stdout.write(out);
} else {
  fs.writeFileSync(SITEMAP, out);
  for (const e of entries) console.log(`  ${e.loc} -> ${e.rel} @ ${e.lastmod}`);
  console.log(`sitemap_write: wrote ${entries.length} url(s) to sitemap.xml, every date from git log -1 --format=%cs`);
}
