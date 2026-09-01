#!/usr/bin/env node
// scripts/tree_health_check.js
//
// EVERY GATE IN THE TEST CHAIN MUST EXIST, AND EVERYTHING IT IMPORTS MUST EXIST.
//
// ============================================================================
//  Why this gate exists: one cutover broke SIX instruments and none of them said so
// ============================================================================
// The v2.0 cutover promoted `4/` to the repo root on 2026-08-26. Over the next day and a half these
// were found broken, one at a time, each by accident:
//
//   the browser fleet    navigated to /4/ and loaded a DIRECTORY LISTING — HTTP 200, no game
//   35 lines of docs     told sessions to edit files that no longer existed
//   the gear picker      filtered on `4/`, so EVERY game change reported "GEAR: NONE"
//   sea_trial.mjs        read its build stamp from 4/src/ui/stage.js — crashed before sailing
//   the gear HOOK        matched `4/src/`, so it never fired on a single game edit
//   4/scripts/lib/       aimed at 4/'s engine, which had been deleted
//
// NONE of them failed loudly. A directory listing answers 200. A missing file makes a picker say
// "nothing changed". A hook that matches nothing exits silently and looks like consent.
//
// THE COMMON SHAPE: a path is a CLAIM about the world, written once, and nothing re-checks it.
// This gate re-checks the claims that can silently disable the suite itself.
//
// ============================================================================
//  Why STATIC imports only
// ============================================================================
// A first pass at this scanned every `from "..."`, `import(...)` and `require(...)` it could see,
// and reported 12 broken imports among gates that were all passing. Every one was a FALSE POSITIVE:
// these gates read the game's source AS TEXT and search it for strings like "../shared/index.js",
// so the search TERM looked like an import. A check that cries wolf on a green suite trains its
// reader to ignore it — the exact failure HARD-WON-LESSONS warns about. So: statement-position
// static imports and top-level requires only, which cannot appear inside a quoted search string.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./lib/js_region_tokenizer.js";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);

console.log("tree_health_check — the suite's own paths must point at things that exist\n");

/* MASK COMMENTS, NOT STRINGS — hoisted, because cases 3 and 5 both read string LITERALS as their
   evidence and both must ignore prose describing the defect (including this file's own). One copy:
   two maskers kept in step by discipline is the fault rule 23 names. */
const commentsOnly = src => {
  let out = src;
  for (const seg of classify(src)) {
    if (seg.type !== "comment") continue;
    out = out.slice(0, seg.start) + out.slice(seg.start, seg.end).replace(/[^\n]/g, " ") + out.slice(seg.end);
  }
  return out;
};
/* The two readers case 4 and its red-proof SHARE. One copy: a red-proof that tests a second
   implementation of the rule proves nothing about the rule that runs. */
const namesAMachine = line => {
  const m = line.match(/["'`](\/(?:home|Users|root)\/[^"'`]*)["'`]/);
  return m ? m[1] : null;
};
/* GUARDED? Read the whole FILE, not the line: `const CA = "/root/…"` is only safe because
   somewhere below it says `existsSync(CA)`. Derived from the identifier the line assigns. */
const guardedIn = (src, line) => {
  const id = (line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/) || [])[1];
  return !!id && new RegExp(`existsSync\\(\\s*${id}\\b`).test(src);
};

const everyScript = () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : (/\.(mjs|cjs|js)$/.test(e.name) ? [path.join(d, e.name)] : []));
  return walk(path.join(REPO, "scripts"));
};



const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
const chain = String(pkg.scripts?.test || "").split("&&").map(s => s.trim()).filter(Boolean);

/* 1. every gate the chain names is really there. A chain entry pointing at a deleted file fails the
      whole run loudly — but a chain that was EDITED to drop a gate fails nothing at all, which is
      why gate_count_check counts them too. This catches the other half: named but absent. */
{
  const missing = [];
  for (const entry of chain) {
    const m = entry.match(/^node\s+(\S+)/);
    if (!m) continue;
    if (!fs.existsSync(path.join(REPO, m[1]))) missing.push(m[1]);
  }
  if (missing.length) fail(`the test chain names ${missing.length} gate(s) that do not exist: ${missing.join(", ")}`);
  else pass(`all ${chain.filter(e => /^node\s/.test(e)).length} gate(s) named in the chain exist`);
}

/* 2. and everything those gates STATICALLY import resolves. This is what would have caught
      net_connected_twin_test.js importing "../../src/net/watchers.js" after the script tree moved:
      the walk still parsed, still looked reasonable, and pointed one level ABOVE the repo. */
{
  const bad = [];
  for (const entry of chain) {
    const m = entry.match(/^node\s+(\S+)/);
    if (!m) continue;
    const gate = path.join(REPO, m[1]);
    if (!fs.existsSync(gate)) continue;
    fs.readFileSync(gate, "utf8").split("\n").forEach((line, i) => {
      // statement position only — never a quoted needle inside a search
      const im = line.match(/^\s*import\s[^"']*["'](\.[^"']+)["']/)
              || line.match(/^\s*(?:const|let|var)\s+[^=]+=\s*require\(\s*["'](\.[^"']+)["']\s*\)/);
      if (!im) return;
      const target = path.resolve(path.dirname(gate), im[1]);
      if (!target.startsWith(REPO + path.sep)) bad.push(`${m[1]}:${i + 1} -> ${im[1]} ESCAPES THE REPO`);
      else if (!fs.existsSync(target)) bad.push(`${m[1]}:${i + 1} -> ${im[1]} MISSING`);
    });
  }
  if (bad.length) fail(`${bad.length} broken import(s) in gates that the chain runs: ${bad.slice(0, 4).join(" | ")}`);
  else pass("every static import in every gate resolves inside the repo");
}

/* 3. no top-level directory is named by a path that does not exist. The generalisation of "4/ is
      gone": ANY tree can be promoted, renamed or deleted, and this asks the question without
      naming a specific one. Segment form only (path.join(REPO, "x", ...)) because that is the
      spelling a text search cannot see — it is how game_url_check's own SCRIPTS constant survived
      three sweeps pointing at path.join(REPO, "4", "scripts"). */
{
  const bad = [];

  /* MASK COMMENTS, NOT STRINGS — and the difference is the whole case.
     A first fix masked every non-code region via classify(), which was right for the pirate-register
     gate but WRONG here: the path segments this case must read ARE string literals
     (path.join(REPO, "4", "scripts")), so masking strings blanked the evidence and the case silently
     stopped working. The red-proof is the only reason that was noticed — it went from catching the
     planted fault to reporting 0. A check that quietly stops checking is the exact fault this whole
     gate exists to prevent, committed inside the gate itself.
     So: comments are masked (that clears prose describing the incident, including this file's own),
     and ONE file is allowlisted because its job is to hold example strings OF the defect. */
  const PROSE_OK = new Set(["scripts/game_url_check.js"]);

  /* AND THE ALLOWLIST IS COMPARED IN POSIX SPELLING, BECAUSE path.relative ANSWERS IN THE HOST'S.
     On Windows it returns "scripts\game_url_check.js", which never equals the "scripts/..." written
     above — so this allowlist was INERT on the one machine the watchdog runs on, and the whole suite
     had been red there since 2026-08-31T03:23Z with nobody looking. The failure message printed the
     backslash the entire time. Same family as the em-dash parse error the same day: written on a
     Mac, correct there, silently wrong on the machine that matters. Normalise at every boundary
     where a path meets a literal. */
  const relPosix = (f) => path.relative(REPO, f).split(path.sep).join("/");

  /* A DIRECTORY THAT DOES NOT EXIST YET IS NOT A BROKEN PATH. sea-trial-shots/ and friends are
     CREATED BY THE RUN. .gitignore is already the one place that says what is transient output, so
     this follows it rather than keeping a second list that would rot the same way. */
  const transient = new Set(
    fs.readFileSync(path.join(REPO, ".gitignore"), "utf8").split("\n")
      .map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("!"))
      .map(l => l.replace(/\/$/, "")));

  for (const f of everyScript()) {
    if (PROSE_OK.has(relPosix(f))) continue;
    commentsOnly(fs.readFileSync(f, "utf8")).split("\n").forEach((line, i) => {
      const m = line.match(/(?:path\.)?(?:join|resolve)\(\s*(?:REPO|ROOT)\s*,\s*["']([^"'/.][^"']*)["']/);
      if (!m) return;
      const seg = m[1];
      if (transient.has(seg)) return;
      if (fs.existsSync(path.join(REPO, seg))) return;
      bad.push(`${relPosix(f)}:${i + 1} builds a path into "${seg}/", which does not exist`);
    });
  }
  if (bad.length) fail(`${bad.length} path(s) built from a top-level directory that is gone: ${bad.slice(0, 3).join(" | ")}`);
  else pass("no script builds a path into a top-level directory that does not exist");
}

/* 4. NO SCRIPT MAY NAME A MACHINE. Earned 2026-08-31, twice in one file-set: a gate rooted itself
      at `process.argv[2] || "/home/user/pastrypirates"` and `npm test` passes no argument, so on
      Wyatt's Mac it died at gate 32 of 55 and the remaining 23 never ran — found by CEO Review 37,
      one commit before it would have. A sibling probe imported two modules by their /home/user/…
      path outright. Both spellings resolve on exactly ONE machine and fail everywhere else with an
      error that reads like a missing file rather than a typed path.

      WHY THIS SHAPE AND NOT "ban /home and /Users". A machine path is not wrong by itself —
      vision.mjs names /root/.ccr/ca-bundle.crt and GUARDS it with existsSync, so it degrades
      instead of dying. What is always wrong is a machine path used to LOCATE THIS REPO'S OWN CODE.
      So: ANY string literal rooted in somebody's home directory (/home, /Users, /root). NOT merely
      "absolute" — the browser-side probes legitimately import("/src/ui/index.js"), a URL the local
      server answers, and 17 honest lines said so on the first run of this case.

      THE EXEMPTION IS DERIVED, NOT LISTED. A home path GUARDED by existsSync degrades instead of
      dying, which is the correct spelling and must stay legal; so a line is spared when the file
      itself guards the identifier it assigns. A typed allowlist would rot exactly like the thing
      it guards (§6 of this file's own lesson).

      WIDENED 2026-08-31 BY CEO REVIEW 38, which broke the first draft two ways and both were real:
        · a BACKTICK escaped it — `const ROOT = \`/home/user/pastrypirates\`` sailed straight
          through, and commit 4631b0d1 is titled "the backtick trap bit a third time, and the rule
          was too narrow". That made four. Every quote class here now carries all three.
        · matching the literal word "pastrypirates" missed every OTHER name the same checkout has:
          /home/user/pp-worktree, /home/user/pastrypirates-wt2/src. A worktree path is precisely
          what a second session types (CLAUDE.md §3, two sessions on one branch). Nothing is a
          constant — the check no longer spells the repo's name at all.
      doc_command_check already fails a home-rooted command in a DOC; nothing checked the scripts
      themselves, which is exactly the direction the fault came back in. */
{
  const bad = [];
  for (const f of everyScript()) {
    const rel = path.relative(REPO, f);
    const src = commentsOnly(fs.readFileSync(f, "utf8"));
    src.split("\n").forEach((line, i) => {
      const hit = namesAMachine(line);
      if (!hit || guardedIn(src, line)) return;
      bad.push(`${rel}:${i + 1} names a machine — "${hit}" exists on one computer; root off fileURLToPath(import.meta.url), or guard it with existsSync`);
    });
  }
  if (bad.length) fail(`${bad.length} script line(s) name a machine instead of rooting off this module: ${bad.slice(0, 3).join(" | ")}`);
  else pass("no script locates repo code by an absolute path typed for one machine");
}

/* 5. RED-PROOF. A check never seen to fail is not a check (CLAUDE.md rule 6). Both directions,
      because case 2's whole design point is that it must stay QUIET on a quoted search needle. */
{
  const realImport   = '  import { netWatchConnected } from "../../src/net/watchers.js";';
  const searchNeedle = '  const needle = "../shared/index.js";   // searched for as TEXT in the game source';
  const re = /^\s*import\s[^"']*["'](\.[^"']+)["']/;
  const catches = re.test(realImport);
  const spares  = !re.test(searchNeedle);
  if (catches && spares) pass("red-proof: catches a real static import, ignores a quoted search needle");
  else fail(`red-proof FAILED (catches:${catches} sparesNeedle:${spares})`);

  /* and case 4 both ways — the sparing half matters as much as the catching half, because a
     machine path that is GUARDED (vision.mjs's CA bundle) must stay quiet or the gate teaches
     sessions to delete a working fallback. */
  const RI = /^\s*(?:import\s[^"']*|export\s[^"']*)["'](\/(?:home|Users|root)\/[^"']+)["']|^\s*(?:const|let|var)\s+[^=]+=\s*(?:await\s+)?(?:import|require)\(\s*["'](\/(?:home|Users|root)\/[^"']+)["']/;
  const NC = /["'](\/[^"']*\/pastrypirates)(?=[/"'])/;
  /* ASSEMBLED, NOT TYPED. Written out in full, these two planted lines are themselves the defect
     and case 4 flags its own gate — and the fix for THAT must never be an allowlist, because a
     gate that stops reading one file is a gate somebody will later hide a fault in. Joined at
     runtime, the regexes see the identical text and this file still polices itself. */
  const HOME = "/" + "home/user/" + "pastrypirates";
  const plantedImport = `  import { serve } from "${HOME}/scripts/mp_rig.mjs";`;
  const plantedRoot   = `  const ROOT = process.argv[2] || '${HOME}';`;
  const guardedCA     = `  const CA = "${"/" + "root/.ccr"}/ca-bundle.crt";`;   // assembled, same reason as HOME
  const relImport     = '  import { serve } from "../mp_rig.mjs";';
  /* FIVE SPELLINGS, and CEO Review 38 supplied two of them by breaking the first draft: the
     backtick (this repo's fourth time — commit 4631b0d1) and a worktree whose directory is not
     called "pastrypirates". Both must go red; the guarded CA and a legitimate browser URL must
     stay quiet, and the guarded one is exercised THROUGH guardedIn, not through the matcher. */
  const plantedTick  = "  const ROOT = `" + HOME + "`;";
  const plantedTree  = "  const ROOT = '/" + "home/user/pp-worktree/src';";
  const browserURL   = '  const m = await import("/src/ui/index.js");';
  const caGuardedSrc = guardedCA + "\n  if (fs.existsSync(CA)) env.NODE_EXTRA_CA_CERTS = CA;";
  const red = { import: plantedImport, root: plantedRoot, backtick: plantedTick, worktree: plantedTree };
  const missed = Object.entries(red).filter(([, line]) => !namesAMachine(line) || guardedIn(line, line)).map(([k]) => k);
  const sparesCA  = !!namesAMachine(guardedCA) && guardedIn(caGuardedSrc, guardedCA);   // matched, then spared BY THE GUARD
  const sparesRel = !namesAMachine(relImport) && !namesAMachine(browserURL);
  if (!missed.length && sparesCA && sparesRel) pass(`red-proof: goes red on all ${Object.keys(red).length} spellings (quoted import, typed root, backtick, worktree name), stays quiet on a guarded CA path, a relative import and a browser URL`);
  else fail(`red-proof FAILED for case 4 (missed:${missed.join(",") || "none"} sparesCA:${sparesCA} sparesRel:${sparesRel})`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
