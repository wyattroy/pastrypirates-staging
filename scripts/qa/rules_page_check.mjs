/* A-7 — THE RULES PAGE DERIVES FROM THE GAME, NOT FROM MEMORY. Wyatt, 2026-08-28: "Add a
 * mechanism (perhaps a hook? please suggest the most efficient, durable method) to the build
 * process that automatically updates the rules page according to the latest rules (eg. i'm not
 * sure if black market is in there either)".
 *
 * MEASURED BEFORE CHANGING: the How-to-Play modal hand-typed every number (roundCfg's own comment
 * had already filed it: "the how-to-play modal still hardcodes its numbers — that is a filed
 * todo"), still documented the SHOT CLOCK (removed 2026-08-28, A-10), still described the old
 * "declare victory + one last turn" ending (the bake-off replaced it), and never mentioned the
 * black market (live since 2026-08-12). He was right to be suspicious.
 *
 * THE MECHANISM, two halves — chosen over a hook because a hook only fires in Claude sessions
 * while this fires for anything that runs npm test, which the release loop requires:
 *   1. RUNTIME DERIVATION (the automatic half): every tuned number on the page is an empty
 *      <b data-rule="key"> span, filled from rulesFacts(cfg) — the same cfg the engine plays by —
 *      when the game boots and again each time the modal opens. A retuned constant can never
 *      disagree with the page, because the page holds no copy of it.
 *   2. THIS GATE (the fence for prose): numbers can derive themselves; sentences cannot. So the
 *      gate fails the build when the page's PROSE drifts from the code — a mechanic the code
 *      carries that the page never mentions, a mechanic the code dropped that the page still
 *      teaches, a hand-typed amount that bypasses the span mechanism, or a span nothing fills.
 *      Each prose requirement is ANCHORED TO A LIVE CODE SYMBOL, so the requirement itself
 *      retires with the feature instead of rotting into a false alarm.
 *
 * Run RED against the pre-A-7 page: shot clock present, black market and bake-off absent,
 * every number hand-typed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy that deletes BLOCK comments
   first — so a LINE comment containing the characters that open one swallowed 152 lines of
   src/orchestrator.js, the whole import block included. MEASURED: it also blinded 10 lines
   of src/shared/index.js and 10 of src/ui/util.js. scripts/qa/lib/strip_comments.mjs. */
import { stripComments as sharedStrip } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const { roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const shared = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
if (typeof shared.rulesFacts !== "function") {
  fail("src/shared/index.js does not export rulesFacts() — there is no one source both the page filler and this gate can read");
  console.log(`\nFAILED — ${fails} assertion(s)`);
  process.exit(1);
}
const facts = shared.rulesFacts(roundCfg(["human", "bot", "bot", "bot"]));

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const m = html.match(/<div id="howToPlayModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
if (!m) { fail("could not locate the howToPlayModal block in index.html"); console.log(`\nFAILED — ${fails}`); process.exit(1); }
const modal = m[0];
const modalNoComments = modal.replace(/<!--[\s\S]*?-->/g, "");

/* 1. every derivable fact appears on the page as a data-rule span, and no span is an orphan */
{
  const used = [...modalNoComments.matchAll(/data-rule="([a-zA-Z0-9_]+)"/g)].map(x => x[1]);
  for (const k of Object.keys(facts))
    if (used.includes(k)) pass(`fact "${k}" (${facts[k]}) reaches the page through its span`);
    else fail(`fact "${k}" (${facts[k]}) has no data-rule span in the modal — that number is either missing from the rules or hand-typed`);
  for (const k of new Set(used))
    if (!(k in facts)) fail(`the modal carries data-rule="${k}" but rulesFacts() computes no such fact — the span would render blank`);
  if (new Set(used).size && [...new Set(used)].every(k => k in facts)) pass("every data-rule span on the page maps to a computed fact");
}

/* 2. no hand-typed amount bypasses the mechanism: a digit glued to 🌕 or "squares" outside a span
      is the exact drift A-7 exists to end */
{
  const prose = modalNoComments.replace(/<b data-rule="[^"]*">[^<]*<\/b>/g, "").replace(/<span data-rule="[^"]*">[^<]*<\/span>/g, "");
  const money = [...prose.matchAll(/\d+\s*🌕/g)].map(x => x[0]);
  if (money.length) fail(`hand-typed coin amount(s) in the modal outside data-rule spans: ${JSON.stringify(money)} — these rot the moment the cfg moves`);
  else pass("no hand-typed coin amount outside a data-rule span");
  const squares = [...prose.matchAll(/\b\d+\s+squares?\b/g)].map(x => x[0]);
  if (squares.length) fail(`hand-typed distance(s) in the modal outside data-rule spans: ${JSON.stringify(squares)}`);
  else pass("no hand-typed square-count outside a data-rule span");
}

/* 3. prose coverage, each requirement anchored to a live code symbol */
{
  const eng = fs.readFileSync(path.join(REPO, "src/engine/index.js"), "utf8");
  const modalText = modalNoComments.toLowerCase();
  // black market: live iff the engine can settle one
  if (/canBlackMarket\(/.test(eng)) {
    if (modalText.includes("black market")) pass("the black market is live (engine.canBlackMarket) and the page teaches it");
    else fail("the engine carries canBlackMarket() but the rules page never mentions the black market — Wyatt's own example of the drift");
  }
  // the bake-off: live iff its UI module exists
  if (fs.existsSync(path.join(REPO, "src/ui/bakeoff.js"))) {
    if (/bake-?off/.test(modalText)) pass("the bake-off ships (src/ui/bakeoff.js) and the page teaches it");
    else fail("the bake-off ships but the rules page still describes the old ending — a new player reads rules for a game that no longer exists");
  }
  // the shot clock: the page may teach it only while the game has one
  const srcFiles = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) srcFiles.push(p); } })(path.join(REPO, "src"));
  // comments stripped first: util.js's graveyard tombstone NAMES the removed clock functions, and
  // an unstripped scan read that as the clock being alive (caught on this gate's first green run)
  const stripJs = sharedStrip;
  const clockLive = srcFiles.some(p => /startShotClock|shotClockTick/.test(stripJs(fs.readFileSync(p, "utf8"))));
  if (!clockLive) {
    if (modalText.includes("shot clock")) fail("the shot clock is gone from src/ (removed 2026-08-28) but the rules page still teaches it — a player will wait for a timer that never comes");
    else pass("the shot clock is gone and the page no longer teaches it");
  } else pass("shot clock live in src/ — its page section is its own business");
}

/* 4. something actually fills the spans: the filler must exist and be reachable from the modal's
      own button, or the page ships blanks */
{
  const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
  if (/rulesFacts\(/.test(orch) && /data-rule/.test(orch)) pass("orchestrator fills [data-rule] spans from rulesFacts()");
  else fail("no filler found in src/orchestrator.js — the data-rule spans would render empty");
}

/* 5. ONE RULES SURFACE. Wyatt's ruling, 2026-09-02T22:50:32Z, Glass question "rules page 2 of 4",
      confirmed by him in the question UI two minutes later ("That's the whole instruction"):
        "Agree with your rec -- delete "how it plays"
      About keeps "What the captains are saying" and "Credits"; the rules live on ONE page.

      WHY THIS GATE AND NOT A NEW ONE: sections 1-4 above exist because a rules page written from
      memory drifts from the game. about.html carried a SECOND rules section, hand-typed, that
      those sections never looked at — and it drifted FOUR ways while the modal above stayed
      correct, which is the cleanest evidence this project has that the derivation is what did the
      work. Rule 23: two things that must agree are one thing, or they will drift.

      Each assertion below is ANCHORED TO A LIVE CODE SYMBOL, like the ones above, so it retires
      with the feature instead of rotting into a false alarm: put fishing back in src/ and the
      fish assertion stops firing on its own. */
{
  /* HTML COMMENTS STRIPPED FIRST, and this gate caught itself on it: the tombstone left where the
     section used to be NAMES the four false sentences so the next reader knows what went and why —
     and the first run of these assertions read that tombstone as live copy and failed on it. Same
     trap as the shot-clock check above, which read util.js's graveyard comment as a live clock.
     A gate must judge what a READER SEES. sharedStrip is for JavaScript; this is HTML. */
  const aboutPath = path.join(REPO, "about.html");
  const about = fs.readFileSync(aboutPath, "utf8").replace(/<!--[\s\S]*?-->/g, "");

  /* THE STRIP'S OWN RED-PROOF, and it is permanent rather than a one-off run. A stripper is a
     silencer: if it ever ate live markup — one unterminated `<!--` is enough — every assertion
     below would pass on an empty string and this gate would report all-clear on a page it had
     never actually read. So: the two cards Wyatt's ruling KEEPS must still be visible after the
     strip. They are the canary, and they are chosen because his ruling names them by name.

     ⚠ THE CANARY HAS AN ORDERING DEPENDENCY, NAMED HERE BECAUSE CEO 154 FOUND IT AND NOTHING ELSE
     WOULD. It works because the tombstone above (about.html, where the section used to be) sits
     ABOVE the two live cards, and a non-greedy left-to-right strip therefore consumes the
     tombstone BEFORE it could reach them — so any over-strip that ate the cards has already eaten
     the tombstone, and the canary fires. The tombstone happens to quote both card titles
     verbatim. MOVE THE TOMBSTONE BELOW THE CREDITS CARD, or add any comment below them quoting
     those two phrases, and this canary becomes self-satisfying: it would pass on a page whose
     live cards had been eaten. If you ever move it, change the canary to assert on markup a
     comment cannot contain — an element, not a phrase. */
  if (/What the captains are saying/.test(about) && /Credits/.test(about))
    pass("the comment strip left about.html's live cards intact — the assertions below are reading a real page");
  else
    fail("the comment strip ate live markup in about.html — every assertion below is now reading a page that is not there, and would pass on nothing");

  // The structural one — his instruction, and the only one that cannot be satisfied by a rewrite.
  // Two independent teeth: the heading a reader sees, and the class that IS the rules block. A
  // section re-added under a different <h2> still trips the second.
  if (/<h2>\s*How it plays\s*<\/h2>/i.test(about))
    fail('about.html still carries its own "How it plays" rules section — his ruling of 2026-09-02 deletes it, and it is the second rules surface rule 23 forbids');
  else pass('about.html carries no "How it plays" section — one rules surface, not two');

  if (/class="abtRules"/.test(about))
    fail("about.html still carries an .abtRules block — the hand-typed rules body, under whatever heading");
  else pass("about.html carries no .abtRules block");

  // Fishing: live iff a fishing path exists in src/ at all. flow.js's tombstone NAMES the deleted
  // function, so comments are stripped first — the same trap the shot-clock check above hit on its
  // first green run.
  const js = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) js.push(p); } })(path.join(REPO, "src"));
  const fishLive = js.some(p => /fishCast|startFishing/.test(sharedStrip(fs.readFileSync(p, "utf8"))));
  if (!fishLive) {
    if (/<b>fish<\/b>/i.test(about))
      fail("about.html offers fish as a turn action and there is no fishing path in src/ — a stranger arriving from Google is taught an action the game does not have");
    else pass("fishing is gone from src/ and about.html no longer offers it");
  } else pass("a fishing path is live in src/ — about.html may teach it");

  // The bake-off decides winning, so "first baker home wins" is false while it ships.
  if (/BAKEOFF_ENABLED\s*=\s*true/.test(fs.readFileSync(path.join(REPO, "src/shared/index.js"), "utf8"))) {
    if (/first baker\s*\n?\s*home wins/i.test(about))
      fail('about.html says "first baker home wins" while the bake-off ships — every captain wins by baking, and two home on the same day bake together');
    else pass('the bake-off ships and about.html no longer says "first baker home wins"');
  }

  // Sailing is free — the modal says so in the prose this gate already reads. The wind caps RANGE;
  // it never charges. "Sailing budget ... cheap with it, dear against it" tells a stranger it costs.
  if (/Sailing is\s*<b>\s*free\s*<\/b>/i.test(fs.readFileSync(path.join(REPO, "index.html"), "utf8"))) {
    if (/sailing budget/i.test(about))
      fail('about.html says the wind sets a "sailing budget" while the game says sailing is free — the wind caps the range, it never charges');
    else pass("sailing is free in the game and about.html no longer prices it");
  }
}

/* 6. /rules.html IS THE MODAL, NOT A COPY OF IT — T-100, his instruction of 2026-09-02 3:07 PM ET.
      His words, and they name the failure before it happens: "the new rules page must NOT be two
      copies of the same 765 words... Before writing anything, answer this out loud: what makes
      these two agree? If the honest answer is 'we keep them in sync,' that's the defect."

      THIS BLOCK IS THAT ANSWER'S TEETH. scripts/lib/rules_page.mjs reads the modal out of
      index.html and fills it from the same rulesFacts() sections 1-4 above already fence. Here we
      RE-RUN it and require the file on disk to be what it produces, byte for byte. So:
        - a sentence changed in the modal and not regenerated       -> RED
        - a word typed straight into rules.html by a person or a bot -> RED
        - a retuned constant (crateBase, powder, ...)                -> RED until regenerated
      There is no editable half of rules.html for the two to drift by. That is the whole design,
      and this is the only thing standing behind it: if this assertion can ever pass on a corrupted
      page, section 6 is decoration. It was red-proofed by corrupting one number and one word in
      the generated file and requiring a FAIL on each. */
{
  const rulesPath = path.join(REPO, "rules.html");
  if (!fs.existsSync(rulesPath)) {
    fail("rules.html does not exist — his ruling of 2026-09-02T22:50:08Z (\"Do a new /rules.html that explains the rules\") is unbuilt, and the game's best writing still has no URL anyone can link to");
  } else {
    const { renderRulesPage } = await import(pathToFileURL(path.join(REPO, "scripts/lib/rules_page.mjs")).href);
    let expected = null;
    try { expected = await renderRulesPage(REPO); }
    catch (err) { fail(`the rules-page generator refused to run: ${err.message}`); }
    if (expected !== null) {
      const onDisk = fs.readFileSync(rulesPath, "utf8");
      if (onDisk === expected) pass("rules.html is byte-identical to what the generator produces from the modal — the page and the game cannot disagree");
      else {
        /* Name the first differing line. A gate that says only "they differ" on a 60-line page
           sends the next reader diffing by eye, and this one can afford to be specific. */
        const a = onDisk.split("\n"), b = expected.split("\n");
        let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
        /* WINDOW THE EXCERPT ON THE DIFFERENCE, NOT ON THE START OF THE LINE. CEO 171 changed a
           wind rule 300 characters into a paragraph and got two quoted lines that looked
           IDENTICAL — the gate went red correctly and then could not show what had moved, which
           is a fair way to make a reader distrust a true failure. */
        const la = a[i] || "<end of file>", lb = b[i] || "<end of file>";
        let c = 0; while (c < la.length && c < lb.length && la[c] === lb[c]) c++;
        const cut = s => JSON.stringify(s.slice(Math.max(0, c - 40), c + 80));
        fail(`rules.html has drifted from the modal it is generated from — line ${i + 1}, character ${c + 1}.\n       on disk : …${cut(la)}\n       generated: …${cut(lb)}\n       Run: node scripts/build_rules_page.mjs   (never hand-edit rules.html)`);
      }
    }
    /* The page must be findable, which is the entire point of his ask — "Nobody can link to it,
       search for it, or land on it from Google". A generated page that is correct and uncrawlable
       has missed the ask, so the head tags are asserted rather than assumed. */
    const rules = fs.readFileSync(rulesPath, "utf8");
    const head = [
      [/<title>[^<]+<\/title>/, "a <title>"],
      [/<meta name="description" content="[^"]{40,}">/, "a meta description"],
      [/<link rel="canonical" href="https:\/\/playpastrypirates\.com\/rules\.html">/, "a canonical URL"],
      [/<meta property="og:title"/, "og: tags"],
      [/<meta name="twitter:card"/, "twitter card tags"],
    ];
    const missing = head.filter(([re]) => !re.test(rules)).map(([, name]) => name);
    if (missing.length) fail(`rules.html is missing ${missing.join(", ")} — he asked for a FINDABLE page, and the house pattern is index.html/about.html`);
    else pass("rules.html carries the house head pattern — title, description, canonical, og:, twitter:");

    /* sitemap.xml is how the page gets FOUND rather than merely existing. Derived date, never
       hand-typed (T-098's standing instruction), so this asserts presence only. */
    const sitemap = fs.readFileSync(path.join(REPO, "sitemap.xml"), "utf8");
    if (/<loc>https:\/\/playpastrypirates\.com\/rules\.html<\/loc>/.test(sitemap)) pass("sitemap.xml invites a crawler to rules.html");
    else fail("rules.html is live and sitemap.xml does not list it — the page exists and Google is never told");

    /* And a page nothing links to is a page nobody reaches. about.html is the public page a
       stranger lands on; it must offer the rules now that its own rules section is deleted. */
    const aboutHtml = fs.readFileSync(path.join(REPO, "about.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    if (/href="rules\.html"/.test(aboutHtml)) pass("about.html links to the rules page");
    else fail('about.html links nowhere to rules.html — its own "How it plays" section was deleted on his ruling, so a stranger there now has no route to the rules at all');

    /* CEO 171'S FINDING, FENCED SO IT CANNOT COME BACK. The first version of this page shipped
       correct, gated, sitemapped — and UNREACHABLE FROM THE GAME. index.html's "How to play"
       control is a <button>, which a crawler cannot follow, so nothing on the highest-traffic page
       on the site pointed at the rules page. For a page whose whole purpose is "Nobody can link to
       it, search for it, or land on it from Google", that is the ask half-missed. A real <a> now
       lives at the foot of the modal. */
    const indexHtml = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    if (/<a [^>]*href="rules\.html"/.test(indexHtml)) pass("the game page carries a real link a crawler can follow to rules.html");
    else fail('index.html contains no <a href="rules.html"> — the footer control is a <button>, so the rules page is unreachable from the game it describes, and unreachable to a crawler following links from the homepage');

    /* …and the other half of that link: it must NOT be copied onto the page, or the page links to
       itself and the modal's one non-rules sentence becomes rules text. This is what data-page-omit
       buys, so it is asserted rather than trusted. */
    /* The RELATIVE form only — the head legitimately carries the absolute canonical and og:url
       (https://playpastrypirates.com/rules.html), so testing for the bare filename would fail on a
       perfectly good page. Caught before this shipped by reading the generated head. */
    if (/data-page-omit/.test(indexHtml) && /href="rules\.html"/.test(rules))
      fail("the omit marker did not take — rules.html carries the modal's own link back to rules.html, so the page now links to itself and a non-rule reads as a rule");
    else pass("the modal's share line is marked data-page-omit and does not reach the page");
  }
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — the rules page derives its numbers and its prose is fenced to the code");
process.exit(fails ? 1 : 0);
