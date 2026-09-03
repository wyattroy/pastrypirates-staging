/* _t206_dark_property_check.mjs — the RED check for T-206, written BEFORE any fix.
 *
 * THE CLAIM IT TESTS: this site already carries a Google Analytics 4 measurement id, and not one
 * page loads anything that would send GA a single event. A measurement id that nothing loads is a
 * property collecting nothing — which is why "add Google Analytics" is a two-line job here and not
 * a setup job, and why nobody has noticed it is not done.
 *
 * ⛔ DELIBERATELY NOT IN `npm test`, AND THE LEADING UNDERSCORE IS THE MARKER. It FAILS today, on
 * purpose. A gate added red is a gate somebody disables. WHOEVER INSTALLS THE TAG WIRES IT IN:
 * rename it `ga_tag_reaches_a_page_check.mjs`, add it to package.json's chain, and it becomes the
 * guard that stops the tag being deleted later — the same shape as every other gate here, which
 * derives its answer instead of trusting a list somebody typed.
 *
 *   node scripts/qa/_t206_dark_property_check.mjs     exit 1 = the property is dark (today)
 *                                                     exit 0 = something on a page loads GA
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* --root=<dir> exists ONLY so this check can be red-proofed against a fixture that DOES load GA.
 * A check that has never been seen to say PASS is a check nobody has tested — three probes in one
 * night here measured a state they had never actually created. `_t206_redproof.mjs` drives it. */
const argRoot = process.argv.find((a) => a.startsWith("--root="));
const ROOT = argRoot
  ? argRoot.slice(7)
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ⚠ THIS USED TO SCAN ROOT-LEVEL .html ONLY — three pages — WHILE THE ROW IT BACKS SAID
 * "no page ANYWHERE asks Google for anything". CEO 162 caught it: the shipping tree also has
 * classic/index.html, classic/stats.html, classic/lab.html and thirteen crawlable pages under
 * art-review/ and notes/sketches/, and `classic/` is one of the four surfaces the INBOX entry says
 * needs its own decision. The claim happened to be TRUE (verified by full-repo grep), so this was
 * never a false green — but wired in as the header instructs, it would not have noticed a tag
 * added to or deleted from classic/, which is the one job it would exist to do.
 *
 * Derived, not listed — every file git actually tracks, filtered by extension. A hand-kept list of
 * pages rots exactly like the thing it guards, and so does a hand-kept list of DIRECTORIES. */
/* The fallback walks the tree instead. It exists for the fixture in `_t206_redproof.mjs`, which is
 * a bare temp directory with no git in it — and it is deliberately BROADER than the git listing,
 * never narrower: a check that cannot see its subject must return the strict answer. */
function walk(d, out = []) {
  for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const rel = d ? `${d}/${e.name}` : e.name;
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const fromGit = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
const tracked = (fromGit.stdout || "").split("\0").filter(Boolean);
if (!tracked.length) tracked.push(...walk(""));
const pages = tracked.filter((f) => f.endsWith(".html"));
const jsFiles = tracked.filter((f) => f.endsWith(".js") && !f.startsWith("scripts/"));

const ID = /["'](G-[A-Z0-9]{6,})["']/g;
const LOADS_GA = /googletagmanager\.com\/gtag\/js|firebase-analytics|\bgtag\s*\(|\.analytics\s*\(/;

const idSites = [];
const loadSites = [];
for (const rel of [...pages, ...jsFiles]) {
  const txt = readFileSync(join(ROOT, rel), "utf8");
  for (const m of txt.matchAll(ID)) idSites.push(`${rel}  ${m[1]}`);
  if (LOADS_GA.test(txt)) loadSites.push(rel);
}

console.log(`scanned ${pages.length} tracked page(s) + ${jsFiles.length} js file(s), whole repo`);
console.log(`measurement id declared in ${idSites.length} place(s):`);
for (const s of idSites) console.log(`   ${s}`);
console.log(`something that would actually send GA an event, in ${loadSites.length} place(s):`);
for (const s of loadSites) console.log(`   ${s}`);

if (idSites.length > 0 && loadSites.length === 0) {
  console.log(
    `\nFAIL  DARK PROPERTY — a GA4 measurement id is declared and NO page loads gtag.js,\n` +
    `      firebase-analytics, or calls gtag()/analytics(). Google is being told nothing.\n` +
    `      This is the state T-206 was written against, and it is the check to re-run after the fix.`
  );
  process.exit(1);
}
if (idSites.length === 0) {
  console.log(`\nFAIL  no measurement id found at all — this check's premise is gone, re-read T-206.`);
  process.exit(1);
}
console.log(`\nPASS  the declared property is loaded by at least one page.`);
