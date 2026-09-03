#!/usr/bin/env node
// T-247 — his instruction, 2026-09-03T21:31:29Z: "we need to push all these changes to staging!!"
//
// ASKS ONE QUESTION: is every file the staging deploy WOULD publish already live there, byte for
// byte? Three things it refuses to do, each of them a fault this project has already paid for:
//
// 1. IT DOES NOT TRUST THE BUILD STAMP. `deploy-staging.sh:270` REWRITES PP4_STAMP on the
//    published copy, so the stamp is a claim the publisher wrote about ITSELF. On 2026-08-27
//    staging served DIFFERENT CODE under a stamp identical to production — "worse than no stamp,
//    because the one tell Wyatt uses was actively lying" (docs/GIT-AND-DEPLOY.md §5). So this
//    hashes real bytes fetched over the wire.
//
// 2. IT DOES NOT ASK GIT WHAT CHANGED. ⚠ THIS IS THE CORRECTION CEO 187 FORCED, AND IT IS THE
//    WHOLE POINT OF THE FILE. The first version listed files from `git diff origin/main...HEAD`
//    and then hashed the WORKING TREE — but `deploy-staging.sh:196` rsyncs the working tree,
//    untracked files included. So an untracked NEW file was invisible to the gate BY
//    CONSTRUCTION, and it proved it live: `src/analytics.js` appeared while this gate was being
//    written and the gate could not see it. A check blind to whole new files cannot certify a
//    deploy. The candidate set is now what rsync would actually send.
//
// 3. IT DOES NOT RETYPE THE EXCLUDE LIST. The first version hand-copied it and got it WRONG —
//    it claimed `scripts/` and `docs/` were never published when staging serves both at HTTP 200.
//    That is precisely the fault `deploy-staging.sh`'s own header records costing 7.7 GB: "a
//    hand-kept list of what to guard rots exactly like the thing it guards". The list is now
//    PARSED OUT OF `deploy-staging.sh`, so one file says what is excluded and this follows it.
//
// TWO DIFFERENCES ARE CORRECT AND ARE NOT FAILURES — the deploy writes both on purpose:
// the `[STAGING]` <title> prefix, and the `-staging@<sha>` stamp. Both are normalised away.
//
// Usage:  node scripts/qa/_t247_staging_parity.mjs [--host=…] [--all] [--json]
//         --all compares EVERY publishable file (~3000, slow). The default compares everything a
//         browser can actually load — pages, modules, assets — which is what "is it live" means.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const HOST = arg("host", "https://staging.playpastrypirates.com").replace(/\/$/, "");
const ALL = process.argv.includes("--all");
const JSON_OUT = process.argv.includes("--json");

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });

// ── The excludes, PARSED from deploy-staging.sh rather than retyped ──────────────────────────
// Its explicit block is `--exclude=<pat>` lines inside EXCLUDES=( … ). Its derived half is every
// .gitignore pattern — which needs no mirroring here, because an ignored file appears in neither
// git list below and so can never become a candidate in the first place.
const deployScript = await readFile(path.join(ROOT, "scripts", "deploy-staging.sh"), "utf8");
const explicit = [...deployScript.matchAll(/^\s*--exclude=(\S+)/gm)].map((m) => m[1]);
if (explicit.length < 5) {
  console.error(`REFUSING: parsed only ${explicit.length} --exclude= pattern(s) out of deploy-staging.sh.`);
  console.error("The script's shape changed. Fix this parser rather than guessing the list — guessing");
  console.error("it is the exact fault that put 7.7 GB of screenshots one command from the staging repo.");
  process.exit(2);
}
const excluded = (f) =>
  explicit.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)) ||
  /^\.[^/]*$/.test(f);            // GitHub Pages serves no root dot-file; a 404 there is the server working

// ── The candidate set: exactly what rsync would send ────────────────────────────────────────
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
const publishable = [...new Set([...tracked, ...untracked])].filter((f) => !excluded(f));

// What a browser can actually load. Everything else IS published but no player can reach it, so
// the default run does not spend a thousand requests on it; --all compares the lot.
const LOADABLE = /\.(html|js|mjs|css|json|png|webp|jpe?g|gif|svg|ico|mp3|wav|ogg|woff2?|ttf|txt|xml)$/i;
const files = ALL ? publishable : publishable.filter((f) => LOADABLE.test(f));

const normalise = (buf, file) => {
  if (/\.(png|webp|jpe?g|gif|ico|mp3|wav|ogg|woff2?|ttf)$/i.test(file)) return buf;
  return Buffer.from(
    buf.toString("utf8")
      .replace(/\r\n/g, "\n")
      .replace(/PP4_STAMP\s*=\s*"[^"]*"/g, 'PP4_STAMP = "<stamp>"')
      .replace(/<title>\[STAGING\] /g, "<title>"),
    "utf8"
  );
};
const h = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);

const rows = [];
let cursor = 0;
async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= files.length) return;
    const f = files[i];
    let local;
    try { local = await readFile(path.join(ROOT, f)); }
    catch { rows.push({ file: f, verdict: "GONE-FROM-TREE" }); continue; }
    let res;
    try { res = await fetch(`${HOST}/${f}`, { redirect: "follow" }); }
    catch (e) { rows.push({ file: f, verdict: "UNREACHABLE", detail: String(e.message || e) }); continue; }
    if (!res.ok) { rows.push({ file: f, verdict: "MISSING-" + res.status }); continue; }
    const remote = Buffer.from(await res.arrayBuffer());
    const a = h(normalise(remote, f)), b = h(normalise(local, f));
    rows.push(a === b ? { file: f, verdict: "IDENTICAL" } : { file: f, verdict: "DIFFERS" });
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
rows.sort((x, y) => x.file.localeCompare(y.file));

let stamp = null, headSha = null;
try { const r = await fetch(`${HOST}/src/ui/stage.js`); if (r.ok) stamp = (await r.text()).match(/PP4_STAMP\s*=\s*"([^"]*)"/)?.[1] ?? null; } catch {}
try { headSha = git("rev-parse", "--short", "HEAD").trim(); } catch {}
const dirty = (() => { try { return git("status", "--porcelain").split("\n").filter(Boolean).length; } catch { return -1; } })();

const bad = rows.filter((r) => r.verdict !== "IDENTICAL");

if (JSON_OUT) {
  console.log(JSON.stringify({ host: HOST, stamp, headSha, dirty, compared: rows.length, candidates: publishable.length, bad, ok: bad.length === 0 }, null, 2));
} else {
  console.log(`STAGING PARITY — ${HOST}`);
  console.log(`  stamp served : ${stamp ?? "(could not read)"}`);
  console.log(`  local HEAD   : ${headSha ?? "?"}${dirty > 0 ? `   ⚠ ${dirty} uncommitted change(s) in the tree` : "   (clean)"}`);
  console.log(`  excludes     : ${explicit.length}, parsed out of scripts/deploy-staging.sh`);
  console.log(`  candidates   : ${publishable.length} publishable file(s) (tracked + untracked-not-ignored, minus those excludes)`);
  console.log(`  compared     : ${rows.length}${ALL ? " (--all)" : " a browser can load; pass --all for every one"}`);
  console.log("");
  if (bad.length === 0) {
    console.log(`PASS — all ${rows.length} file(s) staging serves are byte-identical to this working tree.`);
    if (dirty > 0) {
      console.log(`       ⚠ but the tree has ${dirty} uncommitted change(s). rsync publishes the WORKING TREE`);
      console.log(`         while the stamp names HEAD (deploy-staging.sh:261) — so publishing now would put`);
      console.log(`         code on his page that exists in no commit, under a stamp naming a commit without it.`);
    }
  } else {
    console.log(`FAIL — ${bad.length} of ${rows.length} file(s) are not live on staging as this tree has them:`);
    for (const r of bad.slice(0, 40)) console.log(`         ${r.file.padEnd(46)} ${r.verdict}`);
    if (bad.length > 40) console.log(`         … and ${bad.length - 40} more`);
    console.log('       Publish with:  npm run deploy:staging -- "<what changed>"');
    console.log("       — but COMMIT FIRST if the tree is dirty; see the warning above.");
  }
}
process.exit(bad.length === 0 ? 0 : 1);
