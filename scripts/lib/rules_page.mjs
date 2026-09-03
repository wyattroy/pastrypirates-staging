/* renderRulesPage() — /rules.html IS the in-game How-to-play modal. It is not a copy of it.
 *
 * WYATT'S CONSTRAINT, VERBATIM (the Glass, 2026-09-02 3:07 PM ET, harvested as T-100):
 *   "The in-game 'How to play' modal (index.html, around line 2685) and the new rules page must
 *    NOT be two copies of the same 765 words. Two things kept in step by discipline will drift —
 *    that's rule 23 in .claude/CLAUDE.md, ONE DISPLAY PATH... Before writing anything, answer this
 *    out loud: what makes these two agree? If the honest answer is 'we keep them in sync,' that's
 *    the defect, and you should design it differently before writing a line. There is no build
 *    step in this project — vanilla HTML/CSS/JS, native ES modules — so whatever you propose has
 *    to work without one."
 *
 * THE ANSWER TO HIS QUESTION, out loud: NOTHING KEEPS THEM IN STEP, BECAUSE THERE IS ONLY ONE OF
 * THEM. This function reads the modal out of index.html at the moment it runs, fills the same
 * data-rule spans from the same rulesFacts(cfg) the game plays by, and returns the page. Nobody
 * edits rules.html — it is a build product with no editable half, and
 * scripts/qa/rules_page_check.mjs re-runs this function and fails the build the moment the file on
 * disk differs by one byte from what it produces. A sentence changed in the modal and not
 * regenerated does not drift silently; it goes RED in npm test.
 *
 * WHY A GENERATED FILE AND NOT A RUNTIME fetch() OF index.html, which would be purer one-source:
 * he asked for a FINDABLE page — "Nobody can link to it, search for it, or land on it from
 * Google". A page whose entire body arrives by client-side JavaScript is the weakest thing you can
 * hand a crawler. The generated file is static HTML and indexes like any other page. That is the
 * whole trade, and it is his stated purpose that decides it.
 *
 * WHY THE NUMBERS ARE BAKED IN HERE AND LIVE IN THE MODAL, which is not an inconsistency: the
 * modal fills its spans at open time from the cfg of the voyage being played RIGHT NOW, because a
 * 2-player table genuinely has different crate prices from a 4-player one and the modal tells each
 * table the truth about itself (SPEC-RULES-PAGE-SPLIT.md, Q3). A public page has no table. It can
 * only ever show one ruleset, so it shows the default four-seat one, generated from the same
 * function — and the page says so in its own footer rather than letting a reader assume otherwise.
 * The data-rule attributes are KEPT in the output so the derivation stays auditable in view-source.
 *
 * NO BUILD STEP IS ADDED TO SERVING. rules.html is a plain file in the repo, served as-is by
 * GitHub Pages exactly like index.html. The generator is a script a watch runs
 * (scripts/build_rules_page.mjs) and the gate is the fence — the same two-halves shape A-7 already
 * chose for the modal itself.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/* engineClaims(page, key) — every sentence on the rules page marked as answerable by the engine.
 *
 * ONE LOCATOR, FOR THE SAME REASON renderRulesPage() IS ONE GENERATOR (rule 23). There are now TWO
 * gates that each take a marked sentence off this page and compare it against a function they call
 * on a real Game — sanctuary (`canAttack`) and the forecast (`forecastWind`). Each owns its own
 * measurement and its own classifier, which is right: they are different rules and a shared
 * classifier would be a worse one for both. What they must NOT each own is *how a marked sentence is
 * found*, because that is one fact about the page, and two copies of it drift the moment the marker
 * changes shape — leaving one gate reading nothing and reporting green.
 *
 * THIS IS THE "SECOND CONSUMER" MOMENT CLAUDE.md §2 NAMES. The sanctuary gate was written with an
 * inline regex when it was the only reader. The forecast gate is the second, so the first was moved
 * onto this function rather than the regex being copied — converge when the second appears, never
 * run them side by side.
 *
 * Returns the inner HTML of each matching span, in document order. Any number is possible; the
 * CALLER decides how many it expects, because "exactly one" is a fact about a particular rule and
 * not about the mechanism.
 */
export function engineClaims(page, key) {
  const re = new RegExp(`<span data-engine-rule="${key}">([\\s\\S]*?)</span>`, "g");
  return [...page.matchAll(re)].map(m => m[1]);
}

/* The register question (his Your Call card, "rules page 4 of 4") is MOOT BY CONSTRUCTION and that
   is deliberate, not an oversight: the page speaks whatever the modal speaks, because it IS the
   modal. Rule the modal into plain English tomorrow and this page follows in one command. Nobody
   here chose a voice. */
export async function renderRulesPage(repo) {
  const html = fs.readFileSync(path.join(repo, "index.html"), "utf8");

  /* Same anchor scripts/qa/rules_page_check.mjs:52 has used since A-7 — one locator, so a change
     to the modal's shape cannot make the gate and the generator disagree about where it is. */
  const block = html.match(/<div id="howToPlayModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  if (!block) throw new Error("could not locate the howToPlayModal block in index.html — the generator has no source");

  /* Comments stripped: the modal carries the A-7 tombstone explaining the span mechanism to the
     next editor, and it is written for a session, not for a player. */
  const modal = block[0].replace(/<!--[\s\S]*?-->/g, "");
  const body = modal.match(/<div class="modalTitle"[^>]*>[\s\S]*?<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*$/);
  if (!body) throw new Error("located the modal but not its scrolling body — the generator has no source");

  const { roundCfg } = await import(pathToFileURL(path.join(repo, "src/engine/index.js")).href);
  const { rulesFacts } = await import(pathToFileURL(path.join(repo, "src/shared/index.js")).href);
  /* The four-seat default table. Named here rather than passed in, because a page that changed
     its numbers depending on who generated it would be exactly the drift this exists to stop. */
  const facts = rulesFacts(roundCfg(["human", "bot", "bot", "bot"]));

  /* ELEMENTS MARKED data-page-omit ARE THE MODAL'S, NOT THE PAGE'S — added for T-100 on CEO 171's
     finding. The modal now carries one line that is not a rule: a link to this very page, so that a
     crawler following links from the homepage can reach it and a player has a URL to send someone.
     Copying it onto the page would give the page a link to itself and, worse, promote the one
     non-rules sentence in the modal into rules text.

     AN EXPLICIT MARKER, NOT A POSITION. The obvious alternative was to put the line after the
     scrolling body and let the extraction stop before it — but the extraction and the gate both
     find the modal by counting closing tags, so a <p> in that gap would have silently widened
     rules_page_check.mjs:52's match into the credits modal below. A marker cannot do that, and the
     next person adding a line here does not have to know any of this. */
  const kept = body[1].replace(/<(\w+)[^>]*\sdata-page-omit[^>]*>[\s\S]*?<\/\1>\s*/g, "");
  if (kept === body[1] && /data-page-omit/.test(body[1]))
    throw new Error("the modal carries data-page-omit and the stripper matched nothing — refusing to publish a page that may contain the modal's own non-rules line");

  const filled = kept.replace(/<b data-rule="([a-zA-Z0-9_]+)"><\/b>/g, (whole, key) => {
    if (!(key in facts)) throw new Error(`the modal carries data-rule="${key}" and rulesFacts() computes no such fact — the page would render a blank where a number belongs`);
    return `<b data-rule="${key}">${facts[key]}</b>`;
  });
  /* A span the generator could not fill is a blank on a public page, which is worse than a loud
     failure. There is no forgiving path here on purpose. */
  const unfilled = filled.match(/data-rule="[^"]*"><\/b>/);
  if (unfilled) throw new Error(`a data-rule span survived unfilled (${unfilled[0]}) — refusing to write a page with a hole in it`);

  const lines = filled.split("\n").map(l => l.replace(/^      /, "  ")).join("\n").trim();

  const TITLE = "How to play — Pastry Pirates";
  const DESC = "The full rules of Pastry Pirates: the wind and the ghost needle, crate prices, broadsides, the trade winds, storms, and the bake-off that decides the voyage.";
  const URL = "https://playpastrypirates.com/rules.html";

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
<!-- No Firebase SDK and no game logic — same as about.html (D-07). -->
<!-- THIS FILE IS GENERATED. DO NOT EDIT IT.
     Every word below is the in-game How-to-play modal in index.html, and every number is
     rulesFacts(cfg) — the same function the engine plays by. Change the RULES by changing the
     modal, then run:
         node scripts/build_rules_page.mjs
     scripts/qa/rules_page_check.mjs re-runs the generator on every npm test and fails the build if
     this file differs from it by one byte, so a hand-edit here does not drift quietly: it goes RED. -->
<style>
  /* Own stylesheet, same rule about.html follows (D-07): this page never links or @imports
     index.html's inline <style> block, and index.html is not touched by this file. The colours are
     index.html's own --teal / --ink / --parch2, re-declared. */
  :root { --teal: #29a3b2; --ink: #1f4249; --accent: #fdb63d; --parch2: #fff6c0; --line: #cfe7eb; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Avenir Next', Avenir, 'Segoe UI', 'Trebuchet MS', sans-serif;
    background: linear-gradient(160deg, #dcece9 0%, #e6efe1 45%, #f5f0dd 100%); background-attachment: fixed;
    color: var(--ink); }
  .rulesPage { max-width: 720px; margin: 40px auto; padding: 0 20px 56px; }
  .rulesTopCta { text-align: center; margin-bottom: 28px; }
  .rulesPlayBtn { display: inline-block; font-family: inherit; font-size: 14px; font-weight: 700;
    padding: 16px 32px; border-radius: 12px; border: 1.5px solid #e89827; cursor: pointer;
    background: #fdf3e3; color: #8a5a12; text-decoration: none; box-shadow: 0 8px 24px rgba(253,182,61,.18); }
  .rulesPlayBtn:hover { background: #fae7cb; }
  h1 { font-size: 28px; font-weight: 700; line-height: 1.2; margin: 0 0 8px; text-align: center; }
  .rulesLede { font-size: 14px; line-height: 1.5; text-align: center; margin: 0 0 28px; opacity: .85; }
  .rulesBody { background: #fffdf4; border: 1px solid var(--line); border-radius: 16px;
    padding: 8px 24px 24px; box-shadow: 0 12px 30px rgba(10,35,40,.10); }
  .rulesBody h4 { font-size: 17px; color: var(--teal); margin: 24px 0 6px; }
  .rulesBody h4:first-child { margin-top: 12px; }
  .rulesBody p { font-size: 14.5px; line-height: 1.55; margin: 0 0 10px; }
  /* Matches index.html's .narrIcon so the inline art sits on the text baseline exactly as it does
     inside the game's own modal. */
  .narrIcon { height: 1.05em; width: auto; vertical-align: -0.16em; }
  .rulesFoot { margin-top: 28px; font-size: 12.5px; line-height: 1.5; text-align: center; opacity: .75; }
  .rulesFoot a { color: var(--teal); }
  @media (max-width: 560px) {
    .rulesPage { margin: 24px auto; padding: 0 14px 40px; }
    .rulesBody { padding: 4px 16px 18px; border-radius: 12px; }
    h1 { font-size: 23px; }
  }
</style>
<!-- Google Analytics, COOKIELESS — his two rulings, 2026-09-03: "The public pages only — the
     game, About and Rules" and "Cookieless, no banner". ONE module, loaded in one line on each of
     the three pages, because a snippet pasted three times is three things kept in step by
     discipline (rule 23). It denies all four storage types BEFORE the tag is fetched — that order
     is the whole safety property — and it refuses to run anywhere but the live domain, so a sea
     trial and staging can never inflate his own figures. Gate: analytics_consent_check.mjs.
     ⚠ THIS PAGE IS GENERATED. It is written HERE and nowhere else — editing rules.html by hand
     is drift the build catches, which is how this line ended up in the right file. -->
<script type="module" src="src/analytics.js"></script>
</head>
<body>
<div class="rulesPage">

  <div class="rulesTopCta">
    <a class="rulesPlayBtn" href="index.html"><img class="narrIcon" src="assets/icons/anchor.png" alt=""> Play Pastry Pirates</a>
  </div>

  <h1>📖 How to play Pastry Pirates</h1>
  <p class="rulesLede">Everything ye need to sail, trade, fight and bake. These are the same rules the game shows ye at the table.</p>

  <div class="rulesBody">
${lines}
  </div>

  <p class="rulesFoot">
    The amounts on this page are a standard four-captain voyage. At the table the game fills them in
    for yer own crew — a two-captain voyage prices its crates differently — so the
    <b>📖 How to play</b> button in the game always shows the numbers ye are actually playing by.<br>
    <a href="index.html">Play Pastry Pirates</a> · <a href="about.html">About</a>
  </p>

</div>
</body>
</html>
`;
}
