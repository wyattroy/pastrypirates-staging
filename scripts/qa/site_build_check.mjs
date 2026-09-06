#!/usr/bin/env node
/* site_build_check.mjs — the publish set is what a player gets. This gate is what says so.
 *
 * WHY THIS EXISTS. Until 2026-09-06 the live site WAS the repo: GitHub Pages served the root, so
 * "what is published" needed no definition and no guard. Two things ended that at once — Wyatt's
 * ask to make the repo private (Pages will not serve a private repo on a free account), and his
 * "my traffic is about to increase 10000 fold -- i'm pre-launch right now", which puts roughly
 * 15 TB/month through whatever serves this. The answer is Cloudflare Pages, and Cloudflare uploads
 * a DIRECTORY. So for the first time this project has to say, in code, which files are the game.
 *
 * THE SHAPE IS EXCLUSION, NOT A LIST OF WHAT TO INCLUDE, AND THE DIRECTION MATTERS.
 * `scripts/deploy-staging.sh` learned this the hard way twice (7.7 GB of probe screenshots that
 * were in .gitignore and not in its hand-kept EXCLUDES; then physical-board/, kept out of the tree
 * by a LOCAL .git/info/exclude that nothing read). The standing lesson in CLAUDE.md §6 is that a
 * hand-kept list of what to guard rots exactly like the thing it guards.
 *
 * So build-site.mjs EXCLUDES, and the failure direction is deliberate: a new ASSET FOLDER added
 * tomorrow ships automatically, and a new TOOLING folder would too — which is the hazard. The
 * guard against that is not a longer list, it is the SIZE CEILING below: a folder nobody meant to
 * publish is a folder that makes the site suddenly much bigger, and that fails the build loudly.
 *
 * RED-PROOFED BY CONSTRUCTION. This gate was written and run BEFORE scripts/build-site.mjs
 * existed. Its first run failed on case 1 ("no build script") — an honest RED with no synthetic
 * mutant needed. To re-prove it later: delete a file out of _site/ and run it again.
 */

import { existsSync, statSync, readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BUILD = join(ROOT, "scripts", "build-site.mjs");

/* ⚠ THE GATE BUILDS INTO A TEMP DIRECTORY, NOT INTO THE REPO, AND THAT IS NOT TIDINESS.
 * The first version of this gate built into `_site/` inside the working tree, and `npm test`
 * immediately went red somewhere else: `scripts/qa/asset_paths_exist_check.mjs` walks the
 * filesystem for HTML, descended into `_site/classic/index.html`, and reported 24 missing pictures
 * in a game where nothing was missing. Its skip list is a HAND-KEPT regex
 * (`/^(\.|node_modules$|classic$|art-review$|…)/`), so every gate that walks the tree would have
 * needed `_site` added to it, one at a time, forever — the hand-kept-list-that-rots fault this
 * project has now paid for four separate times.
 *
 * A BUILD ARTIFACT INSIDE THE TREE IS A SECOND COPY OF THE GAME SITTING WHERE EVERY TREE-WALKING
 * GATE CAN FIND IT. So `npm test` leaves nothing behind at all, and no other gate needs to know
 * this one exists. `npm run build:site` still writes `_site/` for Cloudflare and for humans; that
 * is a deliberate act by someone who wants the folder.
 *
 * Kept ON FAILURE, deliberately — a red build you cannot inspect is a red build you cannot fix.
 * The path is printed in that case. */
const SITE = mkdtempSync(join(tmpdir(), "pp-site-"));

/* Cloudflare Pages' own published limits, read 2026-09-06 from
   developers.cloudflare.com/pages/platform/limits. These are THEIR numbers, not ours: exceeding
   either fails the deploy at Cloudflare, which is the worst place to find out. Checked here so it
   fails in `npm test` instead. */
const CF_MAX_FILES = 20000;
const CF_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MiB

/* THE SIZE CEILING — the real guard on an exclusion-based publish set (see the header).
   Raise it deliberately, in the same commit that adds the art, never to make a red build go away.
   Measured 2026-09-06, three ways that agree (the build script, an independent find, and this gate): 221 game files / 7.3 MB, plus the generated _headers. The headroom is for new assets. */
const SIZE_CEILING_BYTES = 25 * 1024 * 1024;

/* Files and directories that must reach a player. Not the publish set — a SPOT CHECK of it.
   Every one of these is a URL that is live today; `classic/` is in `docs/GIT-AND-DEPLOY.md` §5
   step 8's release check, and it is the entry most likely to be dropped by a publish-set change,
   because it is the one nobody is looking at. */
const MUST_HAVE = [
  "index.html", "about.html", "credits.html", "rules.html", "privacy.html", "stats.html",
  "favicon.ico", "favicon.png", "og-image.jpg", "robots.txt", "sitemap.xml",
  "src/main.js", "src/ui/stage.js", "src/engine/index.js", "src/shared/host.js",
  "classic/index.html",
];

/* Never publishable. CNAME leads this list for the same reason it led deploy-staging.sh's:
   it is a CLAIM on a hostname, and the thing that nearly took the live game down twice.
   Under Cloudflare it is worse than useless — Cloudflare holds domain config in its own
   dashboard, so a CNAME in the publish set is a file that means nothing and looks like it means
   something. The rest are folders that are tracked ON PURPOSE and are not the game. */
const MUST_NOT_HAVE = [
  "CNAME", ".planning", ".claude", ".claude-team", "art-review", "notes", "scratchpad",
  "scripts", "docs", "node_modules", "physical-board", "package.json", "package-lock.json",
  ".git", ".gitignore", "cocoa_pirates_sim.py",
];

const fails = [];
const notes = [];

/* ---- 1. the build script exists and runs ------------------------------------------------ */
if (!existsSync(BUILD)) {
  fails.push("no build script at scripts/build-site.mjs — nothing defines the publish set");
} else {
  try {
    execFileSync(process.execPath, [BUILD, `--out=${SITE}`, "--context=production"], {
      cwd: ROOT, stdio: "pipe", timeout: 120000,
    });
  } catch (err) {
    const tail = String(err.stderr || err.message).trim().split("\n").slice(-3).join(" / ");
    fails.push(`build-site.mjs failed: ${tail}`);
  }
}

/* ---- 2. it produced a site ---------------------------------------------------------------- */
let files = [];
if (fails.length === 0) {
  if (!existsSync(SITE)) {
    fails.push("build-site.mjs ran but produced no _site/");
  } else {
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(SITE);
    if (files.length === 0) fails.push("_site/ is empty");
  }
}

const rel = (p) => relative(SITE, p).split(sep).join("/");

/* ---- 3. everything a player needs is in it ------------------------------------------------ */
for (const want of MUST_HAVE) {
  if (files.length && !existsSync(join(SITE, want))) {
    fails.push(`MISSING from the publish set: ${want} — this is a live URL today`);
  }
}

/* `classic/` is the one that goes dark silently, so it is counted, not spot-checked.
   24 files on 2026-09-06; asserted as "at least", so adding to v1 never fails this. */
if (files.length) {
  const classicCount = files.filter((p) => rel(p).startsWith("classic/")).length;
  if (classicCount < 24) {
    fails.push(`classic/ has ${classicCount} files in the publish set, expected at least 24 — ` +
      "playpastrypirates.com/classic is a release check in docs/GIT-AND-DEPLOY.md §5 step 8");
  } else {
    notes.push(`classic/ carried through: ${classicCount} files`);
  }
}

/* ---- 4. nothing that must never be published is in it ------------------------------------- */
for (const never of MUST_NOT_HAVE) {
  if (files.length && existsSync(join(SITE, never))) {
    fails.push(`PUBLISHED AND MUST NOT BE: ${never}`);
  }
}

/* ---- 4b. nothing a browser would never ask for -------------------------------------------- */
/* THE CLASS, NOT THE FOUR NAMES. On its first run build-site.mjs published RULES.md, RULES-V2.md,
   Rules_boardgame.md and a compiled __pycache__/*.pyc — all tracked at the repo root, and the
   three Markdown files are live on playpastrypirates.com today (HTTP 200, measured 2026-09-06).
   Naming those four here would leave the next design note somebody drops at the root to leak the
   same way. A browser never requests Markdown, Python bytecode or a shell script, so their
   presence in a publish set is the defect, whatever they are called. */
const NEVER_SERVED_EXT = [".md", ".py", ".pyc", ".pyo", ".psd", ".sh", ".bat", ".ps1"];
if (files.length) {
  const leaked = files.filter((p) => NEVER_SERVED_EXT.some((e) => rel(p).toLowerCase().endsWith(e)));
  if (leaked.length) {
    fails.push(`${leaked.length} file(s) a browser never asks for are in the publish set: ` +
      leaked.slice(0, 5).map(rel).join(", ") + (leaked.length > 5 ? ", …" : ""));
  }
  if (files.some((p) => rel(p).split("/").includes("__pycache__"))) {
    fails.push("__pycache__ is in the publish set — compiled Python bytecode is not the game");
  }
}

/* ---- 5. Cloudflare's own limits, and ours -------------------------------------------------- */
if (files.length) {
  if (files.length > CF_MAX_FILES) {
    fails.push(`${files.length} files — Cloudflare Pages caps a site at ${CF_MAX_FILES}`);
  }
  let total = 0;
  for (const p of files) {
    const { size } = statSync(p);
    total += size;
    if (size > CF_MAX_FILE_BYTES) {
      fails.push(`${rel(p)} is ${(size / 1048576).toFixed(1)} MiB — Cloudflare rejects any asset over 25 MiB`);
    }
  }
  const mb = (total / 1048576).toFixed(1);
  if (total > SIZE_CEILING_BYTES) {
    fails.push(`the publish set is ${mb} MB, over the ${(SIZE_CEILING_BYTES / 1048576).toFixed(0)} MB ceiling. ` +
      "Either a folder nobody meant to publish got in, or the game really did grow — " +
      "raise SIZE_CEILING_BYTES deliberately, in the commit that adds the art.");
  }
  notes.push(`publish set: ${files.length} files, ${mb} MB`);
}

/* ---- 6. the game files are BYTE-IDENTICAL to the repo ------------------------------------- */
/* THE POINT OF THE WHOLE MOVE: the same commits, served from somewhere else. A build step that
   can alter the game is a build step that can ship something nobody tested (GIT-AND-DEPLOY §5
   rule 2). Only the build stamp is allowed to differ, and only outside production. */
/* EVERY FILE, NOT A SAMPLE. This checked six named files until CEO 228 pointed out the obvious:
   "a build step that rewrote a seventh file would pass the gate. The property holds today; the
   gate is not what holds it." Comparing all of them costs a few hundred buffer reads on a 7 MB
   site, which is nothing, and it turns a spot check into the actual guarantee. */
if (files.length) {
  const differs = [];
  let compared = 0;
  for (const p of files) {
    const r = rel(p);
    if (r === "_headers") continue;               // generated here, has no repo counterpart
    const repoCopy = join(ROOT, r);
    if (!existsSync(repoCopy)) { differs.push(`${r} (not in the repo at all)`); continue; }
    compared++;
    if (!readFileSync(p).equals(readFileSync(repoCopy))) differs.push(r);
  }
  if (differs.length) {
    fails.push(`${differs.length} published file(s) DIFFER from the repo in a production build — ` +
      "the publish step must copy the game, never rewrite it: " +
      differs.slice(0, 5).join(", ") + (differs.length > 5 ? ", …" : ""));
  } else {
    notes.push(`byte-identical to the repo: ${compared} of ${compared} game files`);
  }
}

/* ---- report ------------------------------------------------------------------------------- */
if (fails.length) {
  console.error("site_build_check: FAIL");
  for (const f of fails) console.error("  - " + f);
  console.error(`  (the build is kept for inspection at ${SITE})`);
  process.exit(1);
}
rmSync(SITE, { recursive: true, force: true });
console.log("site_build_check: PASS");
for (const n of notes) console.log("  " + n);
