#!/usr/bin/env node
/* build-site.mjs — assemble the publishable game into _site/. Cloudflare Pages serves that folder.
 *
 *   node scripts/build-site.mjs                        # context inferred from CF_PAGES_BRANCH
 *   node scripts/build-site.mjs --context=production   # force; used by the gate
 *   node scripts/build-site.mjs --out=_site
 *
 * ============================================================================================
 *  WHY THERE IS A BUILD STEP NOW, IN A PROJECT WHOSE FIRST RULE IS "NO BUILD STEP"
 * ============================================================================================
 * THE GAME STILL HAS NO BUILD STEP. `index.html` and `src/` are native ES modules, they are
 * served exactly as written, and this script does not transform one byte of them — the gate
 * `scripts/qa/site_build_check.mjs` asserts that a production build is BYTE-IDENTICAL to the repo
 * for the game files, and fails the build if it is not.
 *
 * What is new is that the PUBLISH TARGET is a directory rather than a repository. GitHub Pages
 * served the repo root, so "what is published" was the whole tree and needed no definition.
 * Cloudflare Pages uploads a folder. Something has to say which files are the game — and that
 * something has to be code, because the tracked tree is 3,355 files and ~1.3 GB, of which 222
 * files and 7.9 MB are the game.
 *
 * This is the SAME job `scripts/deploy-staging.sh` has been doing since 2026-08-02 with rsync and
 * an EXCLUDES array. It is not a new kind of thing. It is that thing, moved from a shell script
 * that only ran on one machine to something Cloudflare can run on every push.
 *
 * ============================================================================================
 *  THE FILE LIST COMES FROM GIT, NOT FROM A WALK, AND NOT FROM A HAND-KEPT LIST
 * ============================================================================================
 * `git ls-files` is the derived answer to "what is real". It honours .gitignore for free, which is
 * the exact failure deploy-staging.sh hit twice: rsync copies the WORKING TREE, so 7.7 GB of probe
 * screenshots that were already in .gitignore sailed straight past a hand-kept exclude list, and
 * later `physical-board/` did the same through a LOCAL .git/info/exclude that nothing read.
 *
 * ONE PATH, NO FALLBACK. If `git ls-files` cannot run, this script FAILS rather than quietly
 * walking the filesystem instead. A fallback that produces a DIFFERENT publish set is two things
 * kept in step by hope — CLAUDE.md rule 23 — and the day they disagree, the disagreement ships.
 *
 * ============================================================================================
 *  WHAT IS EXCLUDED IS DELIBERATE. WHAT IS INCLUDED IS EVERYTHING ELSE. THE DIRECTION IS CHOSEN.
 * ============================================================================================
 * A new folder of ART added tomorrow ships automatically and nobody has to remember anything.
 * A new folder of TOOLING would ship too — that is the cost of this direction, and the guard
 * against it is not a longer list, it is the SIZE CEILING in the gate: anything nobody meant to
 * publish makes the site suddenly much bigger, and that fails `npm test` loudly.
 *
 * The alternative — an INCLUDE list — fails in the worse direction: a new asset folder is silently
 * missing from the live game and nothing says so until a player sees a broken image.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

/* `--out=` accepts an absolute path as well as a repo-relative one. The gate passes an absolute
   temp directory so that `npm test` never leaves a build artifact inside the working tree — see
   the header of scripts/qa/site_build_check.mjs for what that cost when it did. */
const outArg = arg("out", "_site");
const OUT = isAbsolute(outArg) ? outArg : join(ROOT, outArg);

/* WHICH ENVIRONMENT IS THIS? Cloudflare Pages does not hand a build a "context" the way Netlify
   does; it hands it CF_PAGES_BRANCH. Production is whichever branch the Pages project is
   configured to deploy to, and that is `main` — the same branch that has always been production
   (docs/GIT-AND-DEPLOY.md §5). Anything else is a branch deploy, which is staging.
   `--context=` overrides, so the gate can force a production build on any branch. */
const PRODUCTION_BRANCH = "main";
const branch = arg("branch", process.env.CF_PAGES_BRANCH || "");
const context = arg("context", branch === PRODUCTION_BRANCH ? "production" : "branch");
const isProduction = context === "production";

/* THE DELIBERATE HALF. Every entry here is TRACKED ON PURPOSE and is not the game.
   Compare `scripts/deploy-staging.sh`'s EXCLUDES — this is the same list, minus the three
   site-identity files, which are handled separately below. */
const EXCLUDE_TOP = new Set([
  ".planning",        // the project record — 1,744 files, and none of it is the game
  ".claude",          // rules, hooks, skills, memory
  ".claude-team",     // agent-team scratch
  ".github",
  "art-review",       // 519 MB of source art. Served publicly until today; see the note below
  "docs",
  "notes",
  "scratchpad",
  "scripts",          // including this file. 9.9 MB, served publicly until today
  "physical-board",   // never public — kept off main by a LOCAL exclude, so named here explicitly
  "node_modules",
]);

/* ============================================================================================
 *  EXCLUDE BY KIND, NOT BY NAME — the half that does not rot
 * ============================================================================================
 * ADDED THE MOMENT THIS SCRIPT FIRST RAN, 2026-09-06, because it leaked on its first attempt and
 * the leak is the argument for this whole block. The exclusion list above is by NAME, and by name
 * it missed four tracked files sitting at the repo root: RULES.md, RULES-V2.md, Rules_boardgame.md
 * and __pycache__/cocoa_pirates_sim.cpython-310.pyc.
 *
 * THREE OF THOSE ARE PUBLIC ON THE LIVE GAME RIGHT NOW — measured, not assumed:
 *     curl https://playpastrypirates.com/RULES-V2.md   ->  HTTP 200, 16,685 bytes
 * They have been served by GitHub Pages for as long as they have existed, because Pages serves
 * the repo root. The .pyc is invisible today ONLY because Jekyll skips folders beginning with `_`
 * — an accident of the old host that Cloudflare would not repeat.
 *
 * A NAME LIST CANNOT FIX THIS, WHICH IS THE POINT. Add these four names and the next design note
 * somebody drops at the root leaks exactly the same way, and nothing says so. A KIND rule closes
 * the whole class: a browser never asks for a Markdown file, a Python bytecode file or a shell
 * script, so no such file belongs in a publish set, whatever it is called and wherever it appears.
 *
 * The gate asserts this independently (`site_build_check.mjs` case 4b), so if someone deletes this
 * block the build goes red rather than quietly publishing his notes again. */
const EXCLUDE_DIR_ANYWHERE = new Set(["__pycache__"]);
const EXCLUDE_EXT = new Set([".md", ".py", ".pyc", ".pyo", ".psd", ".sh", ".bat", ".ps1"]);

/* Root FILES that are not the game. Everything else at the root ships. */
const EXCLUDE_FILES = new Set([
  /* CNAME: THE ONE THAT MATTERS, and its meaning has inverted rather than gone away.
     Under GitHub Pages it was a CLAIM on a hostname, and two sessions came within one command of
     publishing this repo's copy into the preview repo and taking the live game down. Under
     Cloudflare, domain configuration lives in Cloudflare's dashboard and a CNAME file means
     NOTHING — which is more dangerous, not less, because it looks like it still means something.
     It is excluded here and the gate fails the build if it ever appears in _site/.
     DO NOT DELETE CNAME FROM THE REPO until production has actually left GitHub Pages: while the
     apex still resolves to Pages, that file is the only thing holding the domain. */
  "CNAME",
  "package.json", "package-lock.json",
  ".gitignore", ".gitattributes", ".nvmrc", ".editorconfig",
  "cocoa_pirates_sim.py",
  "wrangler.toml",
  "README.md",

  /* two-machines.html — HIS RULING WAS "GAME ONLY", AND THIS IS NOT THE GAME.
     It is the internal page explaining how his two machines and (until this move) his two repos
     fit together. Caught by CEO 228, which also measured the part that matters:
         curl https://playpastrypirates.com/two-machines.html  ->  HTTP 404
     It is NOT on production today, so publishing it would be this move ADDING an internal
     document to the live site while claiming to remove three.

     IT IS THE ONE LEAK THE KIND-RULE ABOVE CANNOT CATCH, and that is worth understanding rather
     than patching: a root `.html` is exactly the shape of `about.html`, `rules.html` and
     `credits.html`, which must ship. Extension cannot separate them and neither can size (it is
     16 KB). Only intent can, so this is a NAME — the one honest use of a name list, for the one
     case where kind carries no signal.

     ⚠ IT DISAPPEARS FROM STAGING TOO, where he has been reading it. That is deliberate rather
     than overlooked: `docs/GIT-AND-DEPLOY.md` §5 rule 3 says environments differ by CONFIGURATION,
     not CONTENT, and shipping a file to one environment and not the other is exactly the content
     fork that rule forbids. Restoring it is deleting this one line — his call, not this script's. */
  "two-machines.html",

  /* ⚑ AND IT IS NOT ALONE ANY MORE — that is the part worth noticing, not the extra line.
     `cloudflare-cutover.html` joined it within the hour, for the same reason and from the same
     ask: his standing instruction, 2026-09-06 — *"always create artifacts of the checklist, never
     send me md files (they are hard to read and not user friendly)"*. Pages WRITTEN FOR WYATT — a
     checklist he ticks, a reference page about his own machines — live at the repo ROOT because
     that is the only place `deploy-staging.sh` will serve them from, and none of them are the game.
     TWO IS A PATTERN. If a third arrives, move all of them into one folder and exclude the FOLDER,
     so this stops being a name list at exactly the moment a name list starts to rot. */
  "cloudflare-cutover.html",
]);

/* ---- the file list, from git ------------------------------------------------------------- */
let tracked;
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8").split("\0").filter(Boolean);
} catch (err) {
  console.error("build-site: FATAL — `git ls-files` failed, and there is no fallback on purpose.");
  console.error("  A filesystem walk would produce a DIFFERENT publish set to the one every gate");
  console.error("  has checked, and the day the two disagree the disagreement is what ships.");
  console.error("  " + String(err.message).trim());
  process.exit(1);
}

const publish = tracked.filter((p) => {
  const segs = p.split("/");
  const top = segs[0];
  if (EXCLUDE_TOP.has(top)) return false;
  if (segs.slice(0, -1).some((s) => EXCLUDE_DIR_ANYWHERE.has(s))) return false;
  const dot = p.lastIndexOf(".");
  if (dot > -1 && EXCLUDE_EXT.has(p.slice(dot).toLowerCase())) return false;
  if (!p.includes("/") && EXCLUDE_FILES.has(p)) return false;
  if (top.startsWith(".") && !p.includes("/")) return false;   // stray root dotfiles
  return true;
});

if (publish.length === 0) {
  console.error("build-site: FATAL — the publish set is empty. Refusing to write an empty site.");
  process.exit(1);
}

/* ---- copy ---------------------------------------------------------------------------------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let bytes = 0;
for (const p of publish) {
  const src = join(ROOT, p);
  if (!existsSync(src)) continue;          // tracked but not checked out (sparse/partial clone)
  const dst = join(OUT, p);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
  bytes += readFileSync(src).length;
}

/* ---- environments differ by CONFIGURATION, not content (GIT-AND-DEPLOY §5 rule 3) ---------- */
/* Everything below this line runs ONLY outside production. A production build is a byte-identical
   copy of the game, which is what the gate asserts and what makes "promote the artifact, do not
   rebuild it" true rather than aspirational. */
const notes = [];

if (!isProduction) {
  const sha = (arg("commit", process.env.CF_PAGES_COMMIT_SHA || "") || "").slice(0, 8) || "local";

  /* THE BUILD STAMP. On 2026-08-27 staging served DIFFERENT CODE under a stamp IDENTICAL to
     production's, which is worse than no stamp: the one tell Wyatt uses to know which build he is
     looking at was actively lying. The suffix shape is his (W0-3): `<stamp>-staging@<sha>`. */
  const stampFile = join(OUT, "src", "ui", "stage.js");
  if (!existsSync(stampFile)) {
    console.error("build-site: FATAL — src/ui/stage.js is not in the publish set, so this build");
    console.error("  cannot be stamped. Refusing to publish an unstampable staging build.");
    process.exit(1);
  }
  const js = readFileSync(stampFile, "utf8");
  const m = js.match(/const PP4_STAMP = "([^"]*)"/);
  if (!m) {
    console.error("build-site: FATAL — no PP4_STAMP found in src/ui/stage.js. Refusing to publish");
    console.error("  a staging build with no way to tell it apart from production.");
    process.exit(1);
  }
  if (m[1].includes("-staging@")) {
    notes.push(`stamp already marked: ${m[1]}`);
  } else {
    const stamped = `${m[1]}-staging@${sha}`;
    writeFileSync(stampFile, js.replace(m[0], `const PP4_STAMP = "${stamped}"`), "utf8");
    notes.push(`stamped: ${stamped}`);
  }

  /* THE TAB SAYS STAGING TOO. On 2026-08-27 Wyatt played PRODUCTION believing it was staging: a
     bare domain makes a browser try https://, and when that failed he landed on his production
     bookmark. A tell that requires opening the ☰ menu is a tell that gets skipped.
     DELIBERATELY THE TITLE AND NOTHING ELSE — an on-page banner was considered and rejected,
     because the entire value of staging is being IDENTICAL to production, and an overlay can
     itself produce a false finding ("something is covering the board"). */
  const idx = join(OUT, "index.html");
  if (existsSync(idx)) {
    const html = readFileSync(idx, "utf8");
    if (!html.includes("<title>[STAGING]")) {
      writeFileSync(idx, html.replace("<title>", "<title>[STAGING] "), "utf8");
      notes.push("tab title marked [STAGING]");
    }
  }

  /* KEEP STAGING OUT OF SEARCH. The repo's robots.txt says `Allow: /` and points a sitemap at the
     live domain; publishing that on staging invites Google to index it as duplicate content
     competing with the real game. That exact thing happened on the first run of the old preview
     deploy and was caught only by reading the diff. sitemap.xml goes entirely — it lists
     playpastrypirates.com URLs and is meaningless anywhere else. */
  writeFileSync(join(OUT, "robots.txt"),
    "# staging — never indexed. See scripts/build-site.mjs.\nUser-agent: *\nDisallow: /\n", "utf8");
  rmSync(join(OUT, "sitemap.xml"), { force: true });
  notes.push("robots.txt -> Disallow: /   sitemap.xml removed");
}

/* ---- _headers — Cloudflare reads this out of the publish directory ------------------------- */
/* WHY CACHING IS SET BY HAND HERE. This game has NO content hashing — `src/ui/stage.js` keeps its
   name forever — so a long browser cache on a module is a player running last week's code against
   this week's HTML, which is a broken game with no error message. So: HTML and JS always
   revalidate, and only the images and audio are allowed to sit in a browser cache.
   THAT SPLIT IS ALSO THE BANDWIDTH ANSWER at launch scale: assets/ is 4.4 MB of the ~5 MB a cold
   visit pulls, and src/ is ~600 KB compressed. Caching the big half is most of the saving, and
   caching the dangerous half would buy little and could break the game. */
const noindex = isProduction ? "" : "  X-Robots-Tag: noindex\n";
writeFileSync(join(OUT, "_headers"), `# Generated by scripts/build-site.mjs — do not edit in _site/.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
${noindex}
# No content hashing in this project: a stale module against fresh HTML is a broken game.
/*.html
  Cache-Control: public, max-age=0, must-revalidate
/
  Cache-Control: public, max-age=0, must-revalidate
/src/*
  Cache-Control: public, max-age=0, must-revalidate

# Stable, and the bulk of the bytes.
/assets/*
  Cache-Control: public, max-age=604800
/sfx/*
  Cache-Control: public, max-age=604800
`, "utf8");

/* ---- report -------------------------------------------------------------------------------- */
console.log(`build-site: ${context}${isProduction ? "" : ` (branch ${branch || "local"})`}`);
console.log(`  ${publish.length} files, ${(bytes / 1048576).toFixed(1)} MB -> ${arg("out", "_site")}/`);
for (const n of notes) console.log("  " + n);
