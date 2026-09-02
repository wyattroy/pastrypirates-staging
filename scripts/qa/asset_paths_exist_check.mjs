/* GATE: every picture the game names must exist on disk — in BOTH trees, by the game's own rule.
 *
 *   node scripts/qa/asset_paths_exist_check.mjs
 *
 * WHY, AND IT IS THIS MORNING'S OWN NEAR-MISS. Converting `assets/board.png` to `board.webp`
 * (2026-09-02, INBOX-20260901T1335Z) meant renaming the single biggest file in the game. Two
 * separate constants name it — `src/shared/index.js` and `classic/src/shared/index.js` — and
 * **nothing whatsoever connected them to the file.** Miss the second and `/classic`'s board goes
 * blank for real players mid-voyage, while `npm test`, the sea trial's structural half and every
 * asset gate stay green: the SVG `<image>` has an `error` handler that quietly removes the element
 * (`src/ui/board.js:272`), so a missing board is not even a console error. **A blank board that
 * reports success is the exact shape this project keeps paying for.**
 *
 * `recipe_art_exists_check.mjs` guards the ONE family whose names are not `*_IMG` constants. This is
 * its other half.
 *
 * ⚠ WHAT IS STILL NOT COVERED, NAMED RATHER THAN GLOSSED. The first version of this header said the
 * two gates between them covered "every asset the shared module knows about", and CEO 97 measured
 * that false in a minute. `preloadAssets()` names two things that are neither `*_IMG` constants nor
 * recipe art — `${ASSET_BASE}logo.jpg` and the badge family (`src/ui/util.js`) — and
 * `preload_recipe_badge_check.mjs` only checks the preload list MENTIONS `BADGE_POOL`; it never asks
 * whether a badge file exists. **So renaming a badge is exactly as silent today as renaming the
 * board was yesterday.** That gap is real and this gate does not close it. A gate whose header
 * overstates its own reach is worse than a narrow gate, because the next reader stops looking.
 *
 * ⚑ AND THE SECOND HALF, ADDED 2026-09-02T09:xxZ BECAUSE IT CAUGHT A LIVE ONE. The derivation
 * below reads JavaScript constants, so it is blind to art named directly in HTML — and
 * `about.html` names seven ingredient pictures in two `<img src>` runs. Converting the ingredient
 * family (`T-058`) broke **eight** of them, and this gate said PASS with 368 paths checked. The
 * About page is the one Wyatt speaks in his own voice on (`.claude/CLAUDE.md` §2), so a row of
 * broken-image glyphs there is not a cosmetic loss. Every `*.html` in each tree is now scanned for
 * `src=`/`href=`/`url(...)` values pointing into `assets/`, and those are checked the same way.
 *
 * IT DOES NOT CARRY A LIST, AND IT DOES NOT RESTATE THE RULE. It imports each tree's real shared
 * module and applies `sharedAssetUrls()`'s own derivation (`src/ui/util.js`) — anything exported as
 * `*_IMG` whose value is an asset path, flattened across the scalar / array / lookup-object shapes
 * those constants actually take. A new icon is covered the moment it is declared, and a gate that
 * held its own copy of the answer could not fail when the answer changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// htmlRoot is where the page lives, because ASSET_BASE is a URL relative to the document —
// `/classic` has no `assets/` of its own and reads `../assets/` (measured 2026-09-02).
const TREES = [
  { name: "the game", htmlRoot: ROOT, shared: "src/shared/index.js" },
  { name: "/classic", htmlRoot: path.join(ROOT, "classic"), shared: "classic/src/shared/index.js" },
];

/* `sharedAssetUrls()`'s body, not a description of it. If that function's shape ever changes this
   gate should change with it — which is why the comment above points at it by name. */
function assetUrls(mod) {
  const base = mod.ASSET_BASE;
  const out = [];
  for (const [name, val] of Object.entries(mod)) {
    if (!name.endsWith("_IMG")) continue;
    const vals = typeof val === "string" ? [val]
      : Array.isArray(val) ? val
      : val && typeof val === "object" ? Object.values(val) : [];
    for (const u of vals) if (typeof u === "string" && u.startsWith(base)) out.push([name, u]);
  }
  return out;
}

/* THE HTML HALF. A page's asset URL is relative to the page, so each tree's own htmlRoot resolves
   it — exactly as `ASSET_BASE` is above. Anything reaching outside `assets/` is somebody else's
   business (stylesheets, scripts, the manifest) and is left alone on purpose: this gate is about
   art, and widening it to every URL would make it fail on things that are not pictures. */
const HTML_URL_RE = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g;
/* RECURSIVE, and it was not for one commit — CEO 98's finding 6. A flat `readdirSync` saw only the
   top-level pages of each tree, so a page added in a subdirectory would be invisible to the very
   gate written because `about.html` was invisible. Latent rather than live (every project page is
   top-level today), and a latent blind spot in a freshly-written guard is the one most likely to
   go unnoticed later. `.planning/`, `node_modules/` and the scratch/profile directories are
   skipped: they are full of captured HTML from probes and playtests, and a gate that fails on a
   screenshot contact sheet from August is a gate people learn to ignore. */
const SKIP_DIR = /^(\.|node_modules$|classic$|art-review$|notes$|sea-trial-shots$|judge-)/;
/* `notes/sketches/` earns its place on that list by having failed this gate the minute the walk
   went recursive: `notes/sketches/09-recipe-card/option-c-real-art.html` names two pastry files up
   a relative path that does not resolve from where it sits. It is a throwaway design mockup
   (`/gsd-sketch`), it is not served, and no player can reach it. **A gate that fails on a mockup is
   a gate people learn to pass with `--force`** — the subject here is the pages the GAME ships. */
function htmlAssetUrls(dir, root = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // `classic` is skipped only from the ROOT walk — it is its own tree, with its own htmlRoot.
      if (SKIP_DIR.test(e.name) && !(dir !== root && e.name === "classic")) continue;
      htmlAssetUrls(path.join(dir, e.name), root, out);
      continue;
    }
    if (!e.isFile() || !e.name.endsWith(".html")) continue;
    const rel = path.relative(root, path.join(dir, e.name)).split(path.sep).join("/");
    const text = fs.readFileSync(path.join(dir, e.name), "utf8");
    for (const m of text.matchAll(HTML_URL_RE)) {
      const u = m[1] || m[2];
      if (!u) continue;
      const clean = u.split("?")[0].split("#")[0];
      if (/(^|\/)assets\//.test(clean) && !/^https?:/.test(clean)) out.push([rel, clean]);
    }
  }
  return out;
}

let failures = 0, checked = 0;
for (const tree of TREES) {
  let mod;
  try {
    mod = await import(pathToFileURL(path.join(ROOT, tree.shared)).href);
  } catch (e) {
    console.error(`FAIL — ${tree.name}: cannot import ${tree.shared} (${e.message})`);
    console.error("       This gate can no longer see what art the game names. That is a failure, not a skip.");
    failures++;
    continue;
  }
  const urls = assetUrls(mod);
  /* A GATE THAT FINDS NOTHING TO CHECK MUST FAIL. If `_IMG` is ever renamed, or ASSET_BASE moves,
     the derivation above returns an empty list and this would otherwise print PASS while guarding
     nothing — the "instrument that reports NOT FOUND has told you about ITSELF" failure. */
  if (urls.length < 20) {
    console.error(`FAIL — ${tree.name}: only ${urls.length} asset paths derived from ${tree.shared}. ` +
      "This gate has gone blind rather than the art having shrunk.");
    failures++;
    continue;
  }
  const missing = urls.filter(([, u]) => (checked++, !fs.existsSync(path.resolve(tree.htmlRoot, u))));
  if (missing.length) {
    failures += missing.length;
    console.error(`FAIL — ${tree.name} names ${missing.length} of ${urls.length} pictures that are not on disk:`);
    for (const [n, u] of missing.slice(0, 8)) console.error(`         ${n} -> ${u}`);
    if (missing.length > 8) console.error(`         …and ${missing.length - 8} more`);
  } else {
    console.log(`  ${tree.name}: ${urls.length} asset paths named, every one on disk`);
  }

  const html = htmlAssetUrls(tree.htmlRoot);
  const htmlMissing = html.filter(([, u]) => (checked++, !fs.existsSync(path.resolve(tree.htmlRoot, u))));
  if (htmlMissing.length) {
    failures += htmlMissing.length;
    console.error(`FAIL — ${tree.name}: ${htmlMissing.length} of ${html.length} pictures named in HTML are not on disk:`);
    for (const [f, u] of htmlMissing.slice(0, 8)) console.error(`         ${f} -> ${u}`);
    if (htmlMissing.length > 8) console.error(`         …and ${htmlMissing.length - 8} more`);
  } else {
    console.log(`  ${tree.name}: ${html.length} asset paths named in its HTML pages, every one on disk`);
  }
}

if (failures) {
  console.error(`\nFAIL — the game asks for art that does not exist.`);
  console.error("A player gets a blank where that picture belongs, and nothing else reports it.");
  console.error("Fix the constant in the tree named above, or put the file back — do not weaken this check.");
  process.exit(1);
}
console.log(`\nPASS — ${checked} asset paths across ${TREES.length} trees, every one on disk.`);
