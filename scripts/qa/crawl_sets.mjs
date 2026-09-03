/* ONE DEFINITION of "what this site serves, and which of it is public".
 *
 * WHY THIS FILE EXISTS. Wyatt ruled **yes** on T-102: *"should the sitemap's page list be generated
 * from the actual pages?"* — so `sitemap.xml` stops being an editorial list somebody keeps in step
 * and becomes a DERIVED artifact. The moment that is true, two things need the same answer to
 * "is this page public?": `sitemap_write.mjs`, which now generates the list, and
 * `crawl_intent_check.mjs`, which guards it. CLAUDE.md §2's ONE DISPLAY PATH rule asks the
 * design-time question directly — *what makes these two agree?* — and the only durable answer is
 * that there is one of them. So the predicate lives here and both import it.
 *
 * ⚠ THE READER IS INJECTABLE, AND THAT IS NOT A GENERALISATION FOR ITS OWN SAKE.
 * `crawl_intent_check.mjs` red-proofs itself by patching an input IN MEMORY (`--red=nometa`,
 * `bodymeta`, `publicnoindex`, `unfenced`, `newfolder`) — it was built that way because CEO 183
 * could not audit its first version at all, the only way to break it being to edit a real page.
 * If these helpers read the disk directly, every one of those five modes silently stops reaching
 * the code it is meant to break, and the gate goes on printing PASS. **A gate that passes for a
 * new reason is not a gate that passed.** Hence `read`.
 *
 * NOTHING HERE READS `sitemap.xml`. That is deliberate and it is the whole point of the ruling:
 * the sitemap is the OUTPUT of this predicate, so a definition of "public" that consulted it
 * would be circular — and would reproduce whatever list it was handed, which is the fault being
 * removed.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const defaultRead = (root) => (p) => readFileSync(`${root}/${p}`, "utf8");

/* GitHub Pages runs Jekyll on this repo — there is no `.nojekyll` and no `_config.yml` — and Jekyll
   drops any path segment beginning with `.` or `_`. Verified against the live domain 2026-09-03:
   `/.planning/playtest-checklist.html` answers 404 while `/art-review/gallery.html` answers 200. */
export const jekyllHides = (p) => p.split("/").some((seg) => seg.startsWith(".") || seg.startsWith("_"));

export function trackedFiles(root, pattern) {
  const args = pattern ? ["ls-files", pattern] : ["ls-files"];
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Every tracked `.html` Pages will actually publish. */
export const servedPages = (root) => trackedFiles(root, "*.html").filter((p) => !jekyllHides(p));

/* SCOPED TO `<head>` DELIBERATELY. Google ignores a robots meta that lands in the body, so "the
   string is somewhere in the file" is a weaker claim than it looks — the first version of the gate
   made exactly that weaker claim (CEO 183, finding 6). A page with no `<head>` of its own is a
   fragment the host wraps (rule 27's Glass shape); it can carry no meta and is judged on
   `robots.txt` alone, so this returns null rather than guessing. */
const META = /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i;
export function declaredIntent(root, p, read = defaultRead(root)) {
  const src = read(p);
  const open = src.search(/<head\b/i);
  if (open < 0) return null;
  const close = src.search(/<\/head>/i);
  const m = META.exec(src.slice(open, close < 0 ? undefined : close));
  return m ? m[1].toLowerCase() : null;
}

/* LONGEST MATCH WINS (RFC 9309) — and the gate got this wrong first time in a way that quietly
   disarmed it. Fencing `/art-review/` with per-page `Allow:` overrides made a naive Disallow-only
   reader treat all thirteen already-live pages as fenced, so it stopped requiring the noindex that
   is their entire purpose, while still printing PASS. */
export function robotsRules(root, read = defaultRead(root)) {
  const txt = read("robots.txt");
  const grab = (word) =>
    [...txt.matchAll(new RegExp(`^\\s*${word}:\\s*(\\S+)\\s*$`, "gim"))].map(([, v]) => v);
  return { disallowed: grab("Disallow"), allowed: grab("Allow") };
}

const matchLen = (rules, p) => {
  let best = -1;
  for (const rule of rules) {
    const hit = rule.endsWith("/") ? `/${p}`.startsWith(rule) : `/${p}` === rule;
    if (hit && rule.length > best) best = rule.length;
  }
  return best;
};

export const isDisallowed = ({ disallowed, allowed }, p) =>
  matchLen(disallowed, p) > matchLen(allowed, p);

/** A served page is PUBLIC iff it declares an indexable intent AND robots.txt lets a crawler in.
 *
 *  Both halves are load-bearing and they fail in opposite directions. A page with no robots meta
 *  has declared nothing, so it is NOT public here — the gate makes that state impossible on a
 *  served page, and treating silence as consent is how nineteen working files became crawlable in
 *  the first place. A page that declares `index, follow` while sitting behind a `Disallow` is the
 *  one combination that is always a mistake, so it is excluded too rather than being invited to a
 *  page no crawler may fetch.
 */
export function publicPages(root, read = defaultRead(root)) {
  const rules = robotsRules(root, read);
  return servedPages(root).filter((p) => {
    const intent = declaredIntent(root, p, read);
    return intent !== null && !/noindex/.test(intent) && !isDisallowed(rules, p);
  });
}

/* The repo path -> `<loc>` mapping, derived rather than tabulated, and the exact inverse of
   `locToFile()` in sitemap_lastmod_check.mjs: Pages serves `index.html` at `/` and
   `<dir>/index.html` at `<dir>/`. */
export const fileToLoc = (origin, rel) =>
  origin + "/" + (rel === "index.html" ? "" : rel.replace(/(^|\/)index\.html$/, "$1"));
