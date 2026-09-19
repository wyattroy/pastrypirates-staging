#!/usr/bin/env node
/* ⭐ THE CLOUD CONTAINER'S QA RIG — ONE COMMAND THAT SAYS WHAT IS MISSING AND INSTALLS IT.
 *
 *   node scripts/qa/cloud_rig.mjs             what is here, what is missing, and the fix
 *   node scripts/qa/cloud_rig.mjs --install   install everything missing, then verify it
 *
 * WHY THIS EXISTS, and it is a process failure rather than a technical one. Wyatt, 2026-09-19:
 *
 *   "There is documentation in the repo for how to set up the qa rig — you should have just looked
 *    for it and set it up yourself… then write that documentation in a way that they will find
 *    more easily."
 *
 * He is right on both counts. THE KNOWLEDGE WAS ALL THERE and had been since 2026-08-27:
 * docs/GIT-AND-DEPLOY.md §7 names rsync, `gh`, BSD `sed`, the WebKit install and the pkill trap,
 * each with its fix; docs/DRIVING-THE-GAME.md §8c gives playwright's durable home. A session in a
 * fresh container read NEITHER — because a browser rig is not where anyone looks in a document
 * called GIT-AND-DEPLOY, and §8c is at line 798 of 962. It hit rsync when a deploy died, playwright
 * when gate 36 of 177 went red, and never noticed WebKit was missing at all: it installed the npm
 * PACKAGE and skipped `npx playwright install webkit`, so a FULL sea trial ran with both Safari-
 * family legs unrunnable. THE GATE SAW IT AND THE SESSION DID NOT.
 *
 * SO THE FIX IS NOT MORE PROSE. It is this file — a thing you RUN, named for where you are, that
 * refuses to let you guess. docs/CLOUD-CONTAINER.md is its one-page front door, and the
 * SessionStart hook prints its verdict so nobody has to know it exists.
 *
 * ⚠ EVERY CHECK VERIFIES THE THING ITSELF, NOT THE INSTALL COMMAND'S EXIT CODE — WebKit's download
 * succeeds and then fails at validateDependenciesLinux, which is why §7 warns to "read past the
 * stack trace". The only honest proof that a browser is installed is launching it.
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INSTALL = process.argv.includes("--install");
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), ".pw");
const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
/* The proxy CA bundle is how a container identifies itself when CLAUDE_CODE_REMOTE is not set.
   NAMED, and guarded by its name below — an inline literal reads to tree_health_check as a path
   that exists on one computer, and it is right to: the guard is what makes it safe, and a guard
   it cannot see is a guard nobody can rely on. Same env override the SessionStart hook uses. */
const CA_BUNDLE = process.env.CCR_CA_BUNDLE || "/root/.ccr/ca-bundle.crt";
const IN_CLOUD = process.env.CLAUDE_CODE_REMOTE === "true" || fs.existsSync(CA_BUNDLE);

const sh = (cmd, opts = {}) => { try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim(); } catch (e) { return null; } };
const has = bin => !!sh(`command -v ${bin}`);

const rows = [];
const row = (name, ok, detail, fix) => { rows.push({ name, ok, detail, fix }); return ok; };

/* ---- 1. rsync. docs/GIT-AND-DEPLOY.md §7: "FIXED by installing the real tool… DO NOT substitute
        cp -r or a hand-rolled copy" — rsync's --exclude list is what keeps CNAME, robots.txt and
        sitemap.xml out of the staging repo, and hand-rolling that sync is the exact move that
        twice came within one command of taking the live game down. ---- */
{
  let ok = has("rsync");
  if (!ok && INSTALL) { sh("apt-get install -y rsync") ?? sh("apt-get update && apt-get install -y rsync"); ok = has("rsync"); }
  row("rsync", ok, ok ? (sh("rsync --version | head -1") || "").slice(0, 28) : "absent — `npm run deploy:staging` dies at its rsync line",
      "apt-get install -y rsync");
}

/* ---- 2. Chromium, the TLS wrapper and the proxy CAs. The SessionStart hook
        (.claude/hooks/cloud-session-start.sh) does all three; this only reports, because a hook
        that already ran is the right owner and two owners is the fault this repo keeps finding. ---- */
{
  const real = path.join(BROWSERS, "chromium");
  const wrapper = "/usr/local/bin/chromium";
  const wrapped = fs.existsSync(wrapper) && /ssl-version-max=tls1\.2/.test(fs.readFileSync(wrapper, "utf8"));
  const certs = (sh(`certutil -L -d sql:${os.homedir()}/.pki/nssdb 2>/dev/null | grep -c ccr-bundle`) || "0").trim();
  row("chromium + TLS 1.2 wrapper", fs.existsSync(real) && wrapped,
      fs.existsSync(real) ? (wrapped ? `${real}, wrapped, ${certs} proxy CA(s) imported` : "present but NOT wrapped — TLS 1.3 is reset by the gateway") : "no chromium on this image",
      "the SessionStart hook does this: .claude/hooks/cloud-session-start.sh");
}

/* ---- 3. The playwright NPM PACKAGE, in the durable home docs/DRIVING-THE-GAME.md §8c prescribes.
        NOT /tmp: /tmp is cleared on reboot and that is exactly how the Safari legs died once. ---- */
{
  const mod = path.join(PW_DIR, "node_modules/playwright/index.mjs");
  let ok = fs.existsSync(mod);
  if (!ok && INSTALL) { fs.mkdirSync(PW_DIR, { recursive: true }); sh("npm i playwright", { cwd: PW_DIR, stdio: "inherit" }); ok = fs.existsSync(mod); }
  row("playwright (npm package)", ok, ok ? PW_DIR : `absent — npm test dies at trial_honesty_check, gate 36 of 177, and the 140 gates after it never run`,
      `mkdir -p ${PW_DIR} && cd ${PW_DIR} && npm i playwright`);
}

/* ---- 4. WEBKIT ITSELF — the half that is easiest to skip and hardest to notice, because a sea
        trial with no WebKit does not fail: it reports two legs NOT RUN, at the bottom of a long
        report. Needs `install-deps` FIRST (its absence fails the install AFTER a successful 102 MB
        download) and the two allowlisted hosts named in §7. ---- */
{
  const dir = fs.existsSync(BROWSERS) ? fs.readdirSync(BROWSERS).find(d => d.startsWith("webkit-")) : null;
  let ok = !!dir;
  if (!ok && INSTALL) {
    console.log("  installing WebKit's Linux libraries (install-deps), then the 102 MB browser…");
    sh("npx --yes playwright install-deps webkit", { cwd: PW_DIR, stdio: "inherit" });
    sh("npx --yes playwright install webkit", { cwd: PW_DIR, stdio: "inherit" });
    ok = fs.existsSync(BROWSERS) && !!fs.readdirSync(BROWSERS).find(d => d.startsWith("webkit-"));
  }
  row("webkit (the browser)", ok, ok ? path.join(BROWSERS, fs.readdirSync(BROWSERS).find(d => d.startsWith("webkit-"))) :
      "absent — a FULL sea trial reports solo-desktop-wk and solo-phone-wk as NOT RUN",
      `cd ${PW_DIR} && npx playwright install-deps webkit && npx playwright install webkit` +
      "   (needs cdn.playwright.dev + playwright.download.prss.microsoft.com allowlisted — see docs/GIT-AND-DEPLOY.md §7)");
}

/* ---- 5. AND IT LAUNCHES. §7's own words about the last WebKit install: "it LAUNCHES — verified,
        not assumed". A directory on disk is not a browser. ---- */
if (rows.find(r => r.name.startsWith("webkit")).ok) {
  const probe = `
    import { pathToFileURL } from "node:url";
    const { webkit } = await import(pathToFileURL(${JSON.stringify(path.join(PW_DIR, "node_modules/playwright/index.mjs"))}).href);
    const b = await webkit.launch(); const p = await b.newPage();
    await p.setContent("<i id=t>ok</i>"); const t = await p.textContent("#t");
    const v = b.version(); await b.close();
    console.log(JSON.stringify({ t, v }));`;
  const f = path.join(os.tmpdir(), `wk-launch-${process.pid}.mjs`);
  fs.writeFileSync(f, probe);
  const r = spawnSync(process.execPath, [f], { encoding: "utf8", timeout: 120000 });
  fs.unlinkSync(f);
  let out = null; try { out = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch {}
  row("webkit LAUNCHES", !!(out && out.t === "ok"), out ? `WebKit ${out.v} opened a page and read it back` :
      `it did not start: ${(r.stderr || "no stderr").trim().split("\n").slice(-1)[0].slice(0, 140)}`,
      "run --install again; if it still fails, read docs/GIT-AND-DEPLOY.md §7's WebKit row before concluding the download was blocked");
}

/* ---- the report ---- */
console.log(`\ncloud_rig — the QA rig in ${IN_CLOUD ? "this cloud container" : "this environment (not a cloud container — most rows will be irrelevant)"}\n`);
for (const r of rows) console.log(`  ${r.ok ? "OK  " : "MISSING"}  ${r.name.padEnd(28)} ${r.detail}`);
const missing = rows.filter(r => !r.ok);
if (missing.length && !INSTALL) {
  console.log(`\n  ${missing.length} thing(s) missing. Fix them all in one go:\n\n      node scripts/qa/cloud_rig.mjs --install\n`);
  console.log("  or by hand:");
  for (const r of missing) console.log(`      # ${r.name}\n      ${r.fix}`);
  console.log("\n  Background: docs/CLOUD-CONTAINER.md (one page), docs/GIT-AND-DEPLOY.md §7 (the measurements).");
} else if (missing.length) {
  console.log(`\n  ${missing.length} thing(s) STILL missing after --install — read the fix beside each, and docs/GIT-AND-DEPLOY.md §7.`);
} else {
  console.log("\n  The rig is complete: npm test can run all 177 gates, a FULL sea trial can sail every leg\n  including the two WebKit ones, and `npm run deploy:staging` has its rsync.");
}
/* EXIT 0 EVEN WHEN INCOMPLETE, on purpose: this is a REPORT, not a gate. A container that only
   needs `npm test` does not need WebKit, and a non-zero exit here would make that look broken. */
process.exit(0);
