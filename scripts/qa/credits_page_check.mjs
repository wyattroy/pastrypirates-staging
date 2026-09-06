/* T-101 — CREDITS.HTML DERIVES FROM THE MODAL, NOT FROM MEMORY.
 *
 * Wyatt (Glass, 2026-09-02 3:07 PM ET): "Pull the Credits modal (index.html, around line 2717)
 * out into its own page at playpastrypirates.com so I have a URL to send collaborators. ...
 * Same one-source constraint as the rules page: the modal and the page must not become two
 * copies that drift." And: "credits are NOT in pirate speak. They're outside the game world and
 * written in my own plain first-person voice."
 *
 * Mirrors scripts/qa/rules_page_check.mjs §6 (T-100): the page must exist, must be byte-identical
 * to what scripts/lib/credits_page.mjs's renderCreditsPage() produces from the modal right now,
 * must carry the house head pattern, must be listed in sitemap.xml, and must be reachable from a
 * real <a> a crawler can follow out of index.html.
 *
 * Run RED before credits.html exists: it does not, so this gate fails on that alone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const creditsPath = path.join(REPO, "credits.html");
if (!fs.existsSync(creditsPath)) {
  fail("credits.html does not exist — his instruction of 2026-09-02 3:07 PM ET (\"Pull the Credits modal... out into its own page\") is unbuilt, and collaborators still have no URL to the credits");
  console.log(`\nFAILED — ${fails} assertion(s)`);
  process.exit(1);
}

const { renderCreditsPage } = await import(pathToFileURL(path.join(REPO, "scripts/lib/credits_page.mjs")).href);
let expected = null;
try { expected = await renderCreditsPage(REPO); }
catch (err) { fail(`the credits-page generator refused to run: ${err.message}`); }

if (expected !== null) {
  const onDisk = fs.readFileSync(creditsPath, "utf8");
  if (onDisk === expected) pass("credits.html is byte-identical to what the generator produces from the modal — the page and the game cannot disagree");
  else {
    const a = onDisk.split("\n"), b = expected.split("\n");
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const la = a[i] || "<end of file>", lb = b[i] || "<end of file>";
    let c = 0; while (c < la.length && c < lb.length && la[c] === lb[c]) c++;
    const cut = s => JSON.stringify(s.slice(Math.max(0, c - 40), c + 80));
    fail(`credits.html has drifted from the modal it is generated from — line ${i + 1}, character ${c + 1}.\n       on disk : …${cut(la)}\n       generated: …${cut(lb)}\n       Run: node scripts/build_credits_page.mjs   (never hand-edit credits.html)`);
  }

  const credits = fs.readFileSync(creditsPath, "utf8");

  // 1. Findable — the house head pattern (index.html / about.html / rules.html all carry it).
  const head = [
    [/<title>[^<]+<\/title>/, "a <title>"],
    [/<meta name="description" content="[^"]{10,}">/, "a meta description"],
    [/<link rel="canonical" href="https:\/\/playpastrypirates\.com\/credits\.html">/, "a canonical URL"],
    [/<meta property="og:title"/, "og: tags"],
    [/<meta name="twitter:card"/, "twitter card tags"],
  ];
  const missing = head.filter(([re]) => !re.test(credits)).map(([, name]) => name);
  if (missing.length) fail(`credits.html is missing ${missing.join(", ")} — he asked for a page collaborators can be sent a URL to, and the house pattern is index.html/about.html/rules.html`);
  else pass("credits.html carries the house head pattern — title, description, canonical, og:, twitter:");

  // 2. Register — credits are NOT pirate speak (CLAUDE.md §2). Cheap regression check against a
  // future edit accidentally carrying pirate flavour into this one modal. Word-boundaried:
  // "yer" as a bare word is pirate speak, but "player"/"prayer" contain the same four letters and
  // are not — the first version of this check false-positived on "multiplayer" for exactly that
  // reason (rule 6: when a check condemns something known to be fine, suspect the check first).
  const pirateTells = [/\bye\b/, /\byer\b/, /\barrr+\b/, /\bmatey\b/, /\bavast\b/];
  const lower = credits.toLowerCase();
  const found = pirateTells.filter(re => re.test(lower)).map(re => re.source);
  if (found.length) fail(`credits.html contains pirate-speak marker(s) ${JSON.stringify(found)} — credits are outside the game world and must stay in Wyatt's own plain first-person voice (CLAUDE.md §2)`);
  else pass("credits.html carries no pirate-speak marker — register matches his voice-boundary rule");

  // 3. No leaked UI chrome — the Ko-Fi button belongs to the in-game modal, not to a public page
  // with no mountKofi() behind it (a page that shipped a dead "Buy me a cookie" button would be
  // worse than one that never offered it).
  if (/btnKofiCredits|Buy me a cookie/i.test(credits)) fail("credits.html contains the Ko-Fi button/text — that button is UI chrome with no mountKofi() wiring outside the game, and the generator was supposed to exclude it");
  else pass("credits.html carries no Ko-Fi button — the extraction correctly excluded UI chrome");

  // 4. sitemap.xml is how the page gets FOUND, not merely exists.
  const sitemap = fs.readFileSync(path.join(REPO, "sitemap.xml"), "utf8");
  if (/<loc>https:\/\/playpastrypirates\.com\/credits\.html<\/loc>/.test(sitemap)) pass("sitemap.xml invites a crawler to credits.html");
  else fail("credits.html is live and sitemap.xml does not list it — the page exists and Google is never told");

  // 5. Reachable from the game — a real <a> a crawler can follow, same requirement rules.html
  // earned in T-100 (CEO 171: a page whose whole purpose is being findable must not be reachable
  // only via a <button>, which no crawler follows).
  const indexHtml = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  if (/<a [^>]*href="credits\.html"/.test(indexHtml)) pass("the game page carries a real link a crawler can follow to credits.html");
  else fail('index.html contains no <a href="credits.html"> — the footer control is a <button>, so the credits page is unreachable from the game it is generated from, and unreachable to a crawler following links from the homepage');

  // 6. And that link must not leak into the extracted page (the page would then link to itself).
  if (/href="credits\.html"/.test(credits)) fail("credits.html links to itself — the modal's in-game link back to credits.html was not excluded from the extraction");
  else pass("the modal's own link to credits.html does not reach the generated page");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — credits.html derives from the modal and stays fenced to it");
process.exit(fails ? 1 : 0);
