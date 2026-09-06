/* renderCreditsPage() — credits.html IS the in-game Credits modal. It is not a copy of it.
 *
 * WYATT'S CONSTRAINT, VERBATIM (the Glass, 2026-09-02 3:07 PM ET, harvested as T-101):
 *   "Pull the Credits modal (index.html, around line 2717) out into its own page at
 *    playpastrypirates.com so I have a URL to send collaborators. ... Same one-source constraint
 *    as the rules page: the modal and the page must not become two copies that drift."
 *
 * THE ANSWER, same shape as scripts/lib/rules_page.mjs (T-100): nothing keeps them in step,
 * because there is only one of them. This function reads the credits paragraph out of
 * index.html at the moment it runs; scripts/qa/credits_page_check.mjs re-runs it and fails the
 * build the moment credits.html differs from it by one byte.
 *
 * SIMPLER THAN rules.html IN ONE REAL WAY: the credits modal carries no data-rule spans (no
 * tuned game numbers — it is a paragraph of prose, not game mechanics), so there is no
 * rulesFacts()/engine dependency. The extraction targets `.modalByline` specifically, which
 * naturally excludes the modal's title and its Ko-Fi button (a sibling element, not part of the
 * credits text) — no data-page-omit marker is needed here the way rules.html needed one, because
 * the selector is already narrow enough to exclude everything but the credits paragraph.
 *
 * REGISTER: credits are NOT pirate speak (CLAUDE.md §2, the voice boundary — they are outside the
 * game world, in Wyatt's own plain first-person voice). The modal's text is already in that
 * register, so this function does no register conversion; it only extracts and wraps.
 */
import fs from "node:fs";
import path from "node:path";

export async function renderCreditsPage(repo) {
  const html = fs.readFileSync(path.join(repo, "index.html"), "utf8");

  const modalMatch = html.match(/<div id="creditsModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  if (!modalMatch) throw new Error("could not locate the creditsModal block in index.html — the generator has no source");
  const modal = modalMatch[0].replace(/<!--[\s\S]*?-->/g, "");

  const bylineMatch = modal.match(/<div class="modalByline"[^>]*>([\s\S]*?)<\/div>/);
  if (!bylineMatch) throw new Error("located the creditsModal but not its .modalByline — the generator has no source");
  // The captured text is already a whole <p>...</p> (index.html's own markup) — the page must NOT
  // wrap it in a second one. CEO 221 caught the double-wrap this generator originally had.
  const credits = bylineMatch[1].trim();

  // A hole nobody meant: the Ko-Fi button lives in a sibling div, never inside .modalByline, but
  // this guards the extraction itself rather than trusting the selector's geometry forever.
  if (/btnKofiCredits/.test(credits)) throw new Error("the extracted credits text contains the Ko-Fi button — refusing to publish a page whose 'Buy me a cookie' button has no mountKofi() behind it");

  const TITLE = "Credits — Pastry Pirates";
  const DESC = "Who made Pastry Pirates, and who helped.";
  const URL = "https://playpastrypirates.com/credits.html";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="shortcut icon" href="favicon.ico">
<link rel="apple-touch-icon" href="favicon.png">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<link rel="canonical" href="${URL}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="website">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${URL}">
<meta property="og:image" content="https://playpastrypirates.com/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="663">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="https://playpastrypirates.com/og-image.jpg">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- No Firebase SDK and no game logic — same as about.html/rules.html (D-07). -->
<!-- No Google Analytics here, deliberately: his ruling on T-206 named three pages exactly —
     "The public pages only — the game, About and Rules" — and Credits was not one of them.
     Adding it would be scope creep past an explicit, page-by-page ruling. Ask him first. -->
<!-- THIS FILE IS GENERATED. DO NOT EDIT IT.
     Every word below is the in-game Credits modal in index.html (#creditsModal .modalByline).
     Change the credits by editing the modal, then run:
         node scripts/build_credits_page.mjs
     scripts/qa/credits_page_check.mjs re-runs the generator on every npm test and fails the build
     if this file differs from it by one byte, so a hand-edit here does not drift quietly. -->
<style>
  /* Own stylesheet, same rule about.html/rules.html follow (D-07): this page never links or
     @imports index.html's inline <style> block. Colours re-declared from index.html's own
     --teal / --ink / --parch2. */
  :root { --teal: #29a3b2; --ink: #1f4249; --accent: #fdb63d; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Avenir Next', Avenir, 'Segoe UI', 'Trebuchet MS', sans-serif;
    background: linear-gradient(160deg, #dcece9 0%, #e6efe1 45%, #f5f0dd 100%); background-attachment: fixed;
    color: var(--ink); }
  .creditsPage { max-width: 640px; margin: 40px auto; padding: 0 20px 56px; }
  .creditsTopCta { text-align: center; margin-bottom: 28px; }
  .creditsPlayBtn { display: inline-block; font-family: inherit; font-size: 14px; font-weight: 700;
    padding: 16px 32px; border-radius: 12px; border: 1.5px solid #e89827; cursor: pointer;
    background: #fdf3e3; color: #8a5a12; text-decoration: none; box-shadow: 0 8px 24px rgba(253,182,61,.18); }
  .creditsPlayBtn:hover { background: #fae7cb; }
  h1 { font-size: 28px; font-weight: 700; line-height: 1.2; margin: 0 0 24px; text-align: center; }
  .creditsBody { background: #fffdf4; border: 1px solid #cfe7eb; border-radius: 16px;
    padding: 24px 28px; box-shadow: 0 12px 30px rgba(10,35,40,.10); }
  .creditsBody p { font-size: 15px; line-height: 1.65; margin: 0; }
  .creditsBody a { color: var(--teal); }
  .creditsFoot { margin-top: 28px; font-size: 12.5px; line-height: 1.5; text-align: center; opacity: .75; }
  .creditsFoot a { color: var(--teal); }
  @media (max-width: 560px) {
    .creditsPage { margin: 24px auto; padding: 0 14px 40px; }
    .creditsBody { padding: 16px 18px; border-radius: 12px; }
    h1 { font-size: 23px; }
  }
</style>
</head>
<body>
<div class="creditsPage">

  <div class="creditsTopCta">
    <a class="creditsPlayBtn" href="index.html"><img style="height:1.05em;width:auto;vertical-align:-0.16em" src="assets/icons/anchor.png" alt=""> Play Pastry Pirates</a>
  </div>

  <h1>🎗️ Credits</h1>

  <div class="creditsBody">
    ${credits}
  </div>

  <p class="creditsFoot">
    <a href="index.html">Play Pastry Pirates</a> · <a href="about.html">About</a>
  </p>

</div>
</body>
</html>
`;
}
