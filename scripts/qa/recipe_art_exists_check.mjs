/* GATE: every recipe illustration the game asks for must exist on disk — in BOTH trees.
 *
 *   node scripts/qa/recipe_art_exists_check.mjs
 *
 * WHY THIS EXISTS, AND IT IS NOT A HYPOTHETICAL. The 21 pastry illustrations are the one asset
 * family whose filenames are built from a list inside `recipe.js` rather than from a `*_IMG`
 * constant, so `sharedAssetUrls()`'s derivation cannot see them (`src/ui/util.js` says so in its
 * own comment). They are named in THREE places that must agree and are kept in step by nothing:
 *
 *     assets/pastries/*            the files
 *     src/ui/recipe.js             the new game's PASTRY_FILES + the path it builds
 *     classic/src/ui/recipe.js     the frozen v1's copy of both, reading the SAME assets/ folder
 *                                  (its ASSET_BASE is "../assets/" — classic has no assets/ of
 *                                  its own, measured 2026-09-02)
 *
 * So a rename, a re-format or a deletion in `assets/pastries/` silently breaks the recipe picker,
 * the recipe modal and the victory banner — in a game real players are in the middle of, which
 * nobody here opens. That is exactly the shape of fault this project keeps paying for: two things
 * kept in step by discipline (rule 23), with no gate between them. This one was written the day
 * the family changed format (INBOX-20260901T1335Z, his launch-critical compression ask), because
 * that change is the first time anything has ever renamed these files.
 *
 * HOW IT DERIVES, RATHER THAN RE-STATING. It does not carry a list of 21 names and it does not
 * hardcode an extension. It lifts each tree's own `PASTRY_FILES` array and its own `r.img=`
 * template expression out of the source and EVALUATES THEM — the same technique
 * `cam_fit_cells_containment_check.mjs` uses to test the real `camFitCells()` instead of a
 * re-implementation of it. A gate holding its own copy of the answer cannot fail when the answer
 * changes, which is the failure it exists to prevent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Each tree's HTML root — ASSET_BASE is a URL relative to the page, so it resolves from here.
const TREES = [
  { name: "the game", htmlRoot: ROOT, recipe: "src/ui/recipe.js", shared: "src/shared/index.js" },
  { name: "/classic", htmlRoot: path.join(ROOT, "classic"), recipe: "classic/src/ui/recipe.js", shared: "classic/src/shared/index.js" },
];

function assetBase(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const m = src.match(/const ASSET_BASE\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`${file}: no ASSET_BASE declaration — this gate can no longer find where the art lives`);
  return m[1];
}

function recipeImgUrls(file, base) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const list = src.match(/const PASTRY_FILES\s*=\s*\[[\s\S]*?\];/);
  if (!list) throw new Error(`${file}: no PASTRY_FILES array — this gate can no longer see which pictures the game names`);
  const tmpl = src.match(/r\.img\s*=\s*(`[^`]*`)/);
  if (!tmpl) throw new Error(`${file}: no r.img=\`…\` assignment — this gate can no longer see how the path is built`);
  // Evaluate the game's OWN array and its OWN template, with only ASSET_BASE and the index
  // supplied. Nothing about the filenames or the extension is restated here.
  const build = new Function("ASSET_BASE", `${list[0]}\nreturn PASTRY_FILES.map((_, i) => ${tmpl[1]});`);
  return build(base);
}

let failures = 0, checked = 0;
for (const tree of TREES) {
  const base = assetBase(tree.shared);
  const urls = recipeImgUrls(tree.recipe, base);
  if (urls.length === 0) {
    console.error(`FAIL — ${tree.name}: PASTRY_FILES is empty, so this gate would pass while every recipe lost its picture`);
    failures++;
    continue;
  }
  const missing = [];
  for (const u of urls) {
    checked++;
    if (!fs.existsSync(path.resolve(tree.htmlRoot, u))) missing.push(u);
  }
  if (missing.length) {
    failures += missing.length;
    console.error(`FAIL — ${tree.name} (${tree.recipe}) asks for ${missing.length} of ${urls.length} recipe illustrations that are not on disk:`);
    for (const u of missing.slice(0, 5)) console.error(`         ${u}`);
    if (missing.length > 5) console.error(`         …and ${missing.length - 5} more`);
  } else {
    console.log(`  ${tree.name}: ${urls.length} recipe illustrations, all present (${base}pastries/…${path.extname(urls[0])})`);
  }
}

if (failures) {
  console.error(`\nFAIL — ${failures} recipe illustration(s) the game asks for do not exist.`);
  console.error("A player sees an empty frame in the recipe picker, the recipe modal and the win banner.");
  console.error("Fix the path in the tree named above, or put the file back — do not weaken this check.");
  process.exit(1);
}
console.log(`\nPASS — ${checked} recipe illustration paths across ${TREES.length} trees, every one on disk.`);
