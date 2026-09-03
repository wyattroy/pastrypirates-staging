/* GATE: `sitemap.xml`'s dates are DERIVED from git, and the two dead tags never come back.
 *
 *   node scripts/qa/sitemap_lastmod_check.mjs
 *
 * WYATT'S ASK, verbatim (Glass idea `i1788376035472`, 2026-09-02, 3:07 PM ET —
 * `INBOX-20260902T190715Z`, Chart row `T-098`):
 *
 *   "It uses <changefreq> and <priority> on both entries. Google publicly ignores both tags —
 *    they're dead weight from the 2005 spec. It has no <lastmod>, which is the one tag Google
 *    actually uses to decide what's worth re-crawling. Remove changefreq and priority. Add lastmod
 *    to both entries. DERIVE the dates, do not hand-type them — an inaccurate lastmod gets
 *    discounted by Google, and a hand-typed date is wrong the moment work continues."
 *
 * SO THE GATE IS HIS LAST SENTENCE, NOT HIS FIRST. Removing two tags is a one-line edit that stays
 * done. A `lastmod` is different in kind: it is a claim about a file that changes, and this branch
 * commits `index.html` most days. **The failure mode of a hand-typed date is silence** — Google
 * discounts a sitemap whose dates it can prove wrong, and nothing on our side ever says so. That is
 * why this exists as a check that recomputes rather than as a note asking somebody to remember.
 *
 * IT CARRIES NO LIST AND NO DATE. The URLs come out of the file itself, the origin comes out of
 * `CNAME` (the file GitHub Pages reads as the domain claim), and every date is recomputed with the
 * exact command he named — `git log -1 --format=%cs -- <page>`. Add a page to the sitemap tomorrow
 * and it is covered the moment it is listed. If this gate held its own copy of the answer it could
 * not fail when the answer changed, which is the fault it exists to catch.
 *
 * IT REFUSES RATHER THAN GUESSES, in three places, and each one is a way a sitemap lies quietly:
 *   - a `<loc>` that does not resolve to a file in this repo — we would be dating something else;
 *   - a page git has never committed (`%cs` empty) — a blank or a "today" would be a fabrication;
 *   - a `<loc>` on a different origin than `CNAME` — that is somebody else's site.
 *
 * ⚠ WHAT THIS COSTS, SAID HERE RATHER THAN DISCOVERED BY WHOEVER TRIPS OVER IT (CEO 122, finding
 * 10). Nothing regenerates `sitemap.xml` automatically, so **the next commit that touches
 * `index.html` or `about.html` without running the writer turns `npm test` red** — and on this
 * branch `index.html` is committed most days. That is deliberate and it is the whole mechanism: his
 * complaint is that a stale date fails SILENTLY on both sides, so the only cure is something that
 * stops being silent. The repair is one command, named in the failure message. The alternative
 * considered and rejected was having `npm test` regenerate the file itself — a guard that repairs
 * its own subject can never be seen to have failed, which is the fault this whole suite keeps
 * paying for.
 *
 * AND WHAT IT DELIBERATELY DOES NOT DO: it does not rewrite the file. `sitemap.xml` is a
 * site-identity file (`docs/GIT-AND-DEPLOY.md` §1, rule 14) and GitHub Pages treats its neighbours
 * as a claim on the live domain, so the writing is done by `sitemap_write.mjs`, run deliberately,
 * and this gate only ever reports. A guard that silently repairs its own subject is a guard that
 * can never be seen to have failed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITEMAP = path.join(ROOT, "sitemap.xml");
const CNAME = path.join(ROOT, "CNAME");

/* THE TWO TAGS HE NAMED, and the reason they are matched as tags rather than as words: the string
   "priority" appears in prose all over this repo, and a gate that greps for a word rather than for
   the markup it lives in is a gate that fails on a comment. */
const DEAD_TAGS = ["changefreq", "priority"];

export function readOrigin() {
  const host = fs.readFileSync(CNAME, "utf8").trim();
  if (!host) throw new Error("CNAME is empty — cannot tell which origin this sitemap belongs to");
  return `https://${host}`;
}

/* The `<loc>` -> repo file mapping, derived rather than tabulated. A site served from the repo root
   by GitHub Pages resolves `/` to `index.html` and `/x.html` to `x.html`; a trailing-slash path
   resolves to that directory's `index.html`. Anything else is refused above. */
export function locToFile(loc, origin) {
  if (!loc.startsWith(origin)) return { error: `points at another origin (expected ${origin})` };
  let rel = loc.slice(origin.length);
  if (!rel.startsWith("/")) return { error: "is not an absolute path on this origin" };
  rel = rel.slice(1);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (rel.includes("..")) return { error: "escapes the repo root" };
  return { rel };
}

/* HIS COMMAND, RUN, not described. `%cs` is git's committer date in strict YYYY-MM-DD, which is
   already the W3C-date form the sitemap spec asks for, so there is no date formatting invented
   here — the one place a gate like this would otherwise be free to be wrong. */
export function gitLastCommitDate(rel) {
  const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", rel], {
    cwd: ROOT, encoding: "utf8",
  }).trim();
  return out || null;
}

export function checkSitemap(xml, origin) {
  const problems = [];
  const checked = [];

  for (const tag of DEAD_TAGS) {
    const n = (xml.match(new RegExp(`<${tag}\\b`, "g")) || []).length;
    if (n) problems.push(`<${tag}> appears ${n}x — Google ignores it (his words: "dead weight from the 2005 spec")`);
  }

  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  if (!blocks.length) problems.push("no <url> entries at all — this sitemap tells Google nothing");

  for (const block of blocks) {
    const loc = (block.match(/<loc>\s*([^<]+?)\s*<\/loc>/) || [])[1];
    if (!loc) { problems.push("a <url> entry has no <loc>"); continue; }

    const mapped = locToFile(loc, origin);
    if (mapped.error) { problems.push(`${loc} ${mapped.error}`); continue; }

    const abs = path.join(ROOT, mapped.rel);
    if (!fs.existsSync(abs)) { problems.push(`${loc} -> ${mapped.rel} does not exist in this repo`); continue; }

    /* THE DERIVED ANSWER IS COMPUTED BEFORE THE FILE IS READ FOR ONE, and the order is the point:
       a page git has never committed is a DIFFERENT problem from a missing tag, and reporting the
       missing tag first would send the reader off to add one that cannot be derived. CEO 122's
       finding 7. */
    const want = gitLastCommitDate(mapped.rel);
    if (!want) { problems.push(`${loc} -> ${mapped.rel} has never been committed, so no date can be derived`); continue; }

    const lastmod = (block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/) || [])[1];
    if (!lastmod) { problems.push(`${loc} has no <lastmod> — the one tag Google actually uses`); continue; }

    if (lastmod !== want) {
      problems.push(`${loc} says lastmod ${lastmod}; git says ${mapped.rel} last changed ${want}`);
    } else {
      checked.push(`${loc} -> ${mapped.rel} @ ${want}`);
    }
  }
  return { problems, checked };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origin = readOrigin();
  const xml = fs.readFileSync(SITEMAP, "utf8");
  const { problems, checked } = checkSitemap(xml, origin);

  for (const c of checked) console.log(`  ok   ${c}`);
  if (problems.length) {
    console.error(`\nsitemap_lastmod_check: FAIL — ${problems.length} problem(s) in sitemap.xml\n`);
    for (const p of problems) console.error(`  x ${p}`);
    console.error(`\n  Regenerate it, never hand-type a date:  node scripts/qa/sitemap_write.mjs`);
    process.exit(1);
  }
  console.log(`sitemap_lastmod_check: PASS — ${checked.length} url(s), every lastmod recomputed from git, no changefreq/priority`);
}
