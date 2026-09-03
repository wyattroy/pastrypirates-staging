#!/usr/bin/env node
// scripts/qa/stats_console_check.mjs
//
// Wyatt's ruling, on the Glass (`.planning/CHART.md` BLOCKED-ON-WYATT row `admin-console-where`),
// answering his own ask "create a firebase admin console so I can see how many people are playing":
//
//     "put it at /stats.html behind a simple curtain and block it from robots.txt"
//
// Three clauses. This gate holds all three, and — the part that makes it not rot — it holds a
// fourth that nobody stated and everybody needs:
//
//   A. THE PAGE IS AT /stats.html, at the repo root, and is a real page.
//   B. IT IS BEHIND A CURTAIN — the numbers are not rendered, and the database is not read,
//      until the curtain opens.
//   C. IT IS KEPT OUT OF SEARCH — `Disallow: /stats.html` in robots.txt AND its own robots meta,
//      the same belt-and-braces `classic/stats.html` already uses.
//   D. IT READS EVERY NODE THE GAME ACTUALLY WRITES. **Derived, never hand-typed** — the node
//      names are parsed out of `src/ui/usage.js` and `src/net/writers.js` themselves. Rename
//      `starts` in usage.js and this console would silently show zero voyages with every other
//      check still green; that is the failure this clause exists to stop, and it is the same
//      shape as every other gate in this repo that derives its list instead of holding one
//      (docs/GIT-AND-DEPLOY.md §5, "a hand-kept list of what to guard rots exactly like the
//      thing it guards").
//   E. WYATT HAS THE WORD. Added 2026-09-03, and it is the clause the other four made possible
//      to miss: A–D can all be green on a page **its only intended reader cannot open**.
//      Measured, not suspected — the word was changed on 2026-09-03 to get it out of the repo
//      (CEO 159, correctly), the ledger recorded that it "lives with Wyatt", and NOTHING in the
//      record shows anybody ever told him. A curtain that excludes its owner is worse than no
//      curtain, and every gate stayed green through it.
//      `.planning/wyclau/CURTAIN-DELIVERED.md` records the SHA-256 that was handed to him, with
//      when and by what channel — **never the word itself**. Change the word without delivering
//      it and the two hashes disagree and the build fails, the same day.
//
// ⚠ THE ONE THING CLAUSE E DOES NOT PROVE, so nobody believes more than it says: it cannot know
// he READ the message. It proves the word on the page is the word somebody recorded delivering,
// which is exactly the join that was missing — a hash changed with no delivery behind it.
//
// RED-PROOFED IN FOUR DIRECTIONS, one per clause, because a gate that only ever proves clause A
// certifies B, C and D by omission — which is precisely how the first `T-139` gate passed while
// two thirds of his ruling was unbuilt. Each `--red=` reconstructs a broken world and the gate
// must FAIL in it; each REFUSES TO RUN if its patch no-ops, so a rename cannot quietly turn a
// red-proof into a second green run.
//
//     node scripts/qa/stats_console_check.mjs                 # the real check
//     node scripts/qa/stats_console_check.mjs --red=absent    # no page at the root
//     node scripts/qa/stats_console_check.mjs --red=nocurtain # page renders straight to numbers
//     node scripts/qa/stats_console_check.mjs --red=robots    # nothing keeping it out of search
//     node scripts/qa/stats_console_check.mjs --red=renamed   # a written node the console never reads
//     node scripts/qa/stats_console_check.mjs --red=undelivered  # word changed, nobody told Wyatt
//     node scripts/qa/stats_console_check.mjs --red=wordinrepo   # the word itself, in the record
//     node scripts/qa/stats_console_check.mjs --red=wordelsewhere # the word in ANY other tracked file
//
// SIX OF THE EIGHT ISOLATE TO ONE CLAUSE; `--red=nocurtain` trips B AND E, because deleting the
// CURTAIN_SHA256 leaves E nothing to join to. Said exactly, because "each red-proof bites its own
// clause" is the kind of sentence that gets written from intent rather than from the gate — which
// is the habit CEO 159 caught here as its FINDING 3 and CEO 164 caught again one day later.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = join(ROOT, "stats.html");
const ROBOTS = join(ROOT, "robots.txt");
const USAGE = join(ROOT, "src", "ui", "usage.js");
const WRITERS = join(ROOT, "src", "net", "writers.js");
const DELIVERED = join(ROOT, ".planning", "wyclau", "CURTAIN-DELIVERED.md");

const red = (process.argv.find(a => a.startsWith("--red=")) || "").slice(6);
const fails = [];
const notes = [];

/* ---- the world this run is judging ------------------------------------------------------------
   Everything is read into memory first, so a `--red=` can break exactly one thing and leave the
   rest of the world honest. A patch that changes nothing is a red-proof that proves nothing, so
   each one asserts its own bite before the gate runs. */

function patched(label, text, fn) {
  const after = fn(text);
  if (after === text) {
    console.error(`RED-PROOF "${label}" DID NOT BITE — its patch changed nothing, so this run\n` +
                  `would have been a second green run wearing a red proof's name. Refusing.`);
    process.exit(2);
  }
  return after;
}

let pageExists = existsSync(PAGE);
let page = pageExists ? readFileSync(PAGE, "utf8") : "";
let robots = readFileSync(ROBOTS, "utf8");
let usage = readFileSync(USAGE, "utf8");
let writers = readFileSync(WRITERS, "utf8");
let deliveredExists = existsSync(DELIVERED);
let delivered = deliveredExists ? readFileSync(DELIVERED, "utf8") : "";
let INJECT = null;   // --red=wordelsewhere: a tracked file's contents, replaced in the scan only

if (red === "absent") {
  // CEO 159: this was the one red-proof of four that never asserted its own bite. On a tree where
  // stats.html is already missing, "pretend it is missing" changes nothing — so the run proved
  // only that a check fails on a world it was already failing on, while reporting a red proof.
  if (!pageExists) {
    console.error(`RED-PROOF "absent" DID NOT BITE — stats.html is already missing, so removing it\n` +
                  `changes nothing and this run would prove nothing. Refusing.`);
    process.exit(2);
  }
  pageExists = false; page = "";
}
else if (red === "nocurtain") {
  page = patched("nocurtain", page, t =>
    t.replace(/data-curtain(=".*?")?/g, "").replace(/CURTAIN_SHA256/g, "NOTHING"));
} else if (red === "robots") {
  robots = patched("robots", robots, t => t.replace(/^Disallow: \/stats\.html\s*$/m, ""));
  page = patched("robots(meta)", page, t => t.replace(/<meta\s+name="robots"[^>]*>/i, ""));
} else if (red === "renamed") {
  usage = patched("renamed", usage, t => t.replace(/put\("starts\//g, 'put("voyagestarts/'));
} else if (red === "renamed-presence") {
  // The writers.js half of clause D, and the one that guards the biggest number on his page.
  // `--red=renamed` only ever exercised the usage.js half, which is how `presence` went
  // uncovered in the first place (CEO 159).
  writers = patched("renamed-presence", writers, t => t.replace(/db\.ref\("presence\//g, 'db.ref("online/'));
} else if (red === "undelivered") {
  // The real failure of 2026-09-03, reconstructed: somebody changes the curtain word and the
  // delivery record still names the OLD one. Every other clause stays green; he is locked out.
  page = patched("undelivered", page, t =>
    t.replace(/CURTAIN_SHA256\s*=\s*"[0-9a-f]{64}"/,
              'CURTAIN_SHA256="' + "0".repeat(64) + '"'));
} else if (red === "wordinrepo") {
  // CEO 159's finding, held permanently: the plaintext must never be written beside the hash.
  // The proof uses a THROWAWAY word (never the live one) and moves the page's hash to match it,
  // so this file can prove the guard bites without ever containing the real word.
  const throwaway = "openthedoor";
  const h = createHash("sha256").update(throwaway).digest("hex");
  page = patched("wordinrepo(page)", page, t =>
    t.replace(/CURTAIN_SHA256\s*=\s*"[0-9a-f]{64}"/, `CURTAIN_SHA256="${h}"`));
  delivered = patched("wordinrepo(record)", delivered, t =>
    t.replace(/^sha256:\s*[0-9a-f]{64}\s*$/m, `sha256: ${h}\nthe word is ${throwaway}`));
} else if (red === "wordelsewhere") {
  // The record is not the only file that can hold the word — CEO 159's real finding was the word
  // in `_curtain_hash.mjs`, and the first version of clause E read the record ALONE, so it would
  // have let that exact fault back into that exact file while claiming to hold it. This proof
  // plants the word in a file that is NOT the record, so "the scan reaches the whole tree" is
  // measured rather than inferred from a count.
  const throwaway = "openthedoor";
  const h = createHash("sha256").update(throwaway).digest("hex");
  page = patched("wordelsewhere(page)", page, t =>
    t.replace(/CURTAIN_SHA256\s*=\s*"[0-9a-f]{64}"/, `CURTAIN_SHA256="${h}"`));
  delivered = patched("wordelsewhere(record)", delivered, t =>
    t.replace(/^sha256:\s*[0-9a-f]{64}\s*$/m, `sha256: ${h}`));
  INJECT = { path: "scripts/qa/curtain_hash.mjs", text: `const word = process.argv[2] || "${throwaway}";` };
} else if (red) {
  console.error(`unknown --red=${red}`);
  process.exit(2);
}

/* ---- A. the page is at /stats.html ------------------------------------------------------------ */

if (!pageExists) {
  fails.push("A: there is no `stats.html` at the repo root. His ruling names that exact path, and\n" +
             "   `src/ui/usage.js:5` has claimed since 2026-08-10 that its three records are\n" +
             "   \"read back by /stats.html\" — a reader the cutover left behind in `classic/`.");
} else if (page.length < 500 || !/<\s*html/i.test(page)) {
  fails.push(`A: \`stats.html\` exists but is not a page (${page.length} bytes, no <html>).`);
} else {
  notes.push(`A: stats.html present at the repo root (${page.length} bytes).`);
}

/* ---- B. behind a simple curtain ---------------------------------------------------------------
   What "curtain" means mechanically, so this cannot be satisfied by a comment: the page carries a
   gate element marked `data-curtain`, and the code path that reads the database is not reachable
   until it opens. The second half is checked structurally — the fetch must sit inside a function
   the curtain calls, never at top level. */

if (pageExists) {
  const hasGate = /data-curtain/.test(page);
  const hasSecret = /CURTAIN_SHA256/.test(page);
  if (!hasGate || !hasSecret) {
    fails.push("B: no curtain. His ruling is \"behind a simple curtain\" — the page must not show\n" +
               "   the numbers to anyone who guesses the URL. Expected a `data-curtain` gate and a\n" +
               "   `CURTAIN_SHA256` the typed word is checked against." +
               (hasGate ? "" : "\n   missing: the data-curtain element") +
               (hasSecret ? "" : "\n   missing: the CURTAIN_SHA256 constant"));
  } else {
    // The database must not be read before the curtain opens. A top-level fetch would do exactly
    // that, so require every fetch to be indented inside something.
    const topLevelFetch = page.split("\n").some(l => /^\s{0,2}(await\s+)?fetch\(/.test(l));
    if (topLevelFetch) {
      fails.push("B: the page reads the database at top level, so it fetches before the curtain\n" +
                 "   opens. Move the read inside the function the curtain calls.");
    } else {
      notes.push("B: curtain present, and no database read happens at top level.");
    }
  }
}

/* ---- C. kept out of search --------------------------------------------------------------------- */

if (!/^Disallow: \/stats\.html\s*$/m.test(robots)) {
  fails.push("C: robots.txt has no `Disallow: /stats.html`.");
} else {
  notes.push("C: robots.txt disallows /stats.html.");
}
if (pageExists && !/<meta\s+name="robots"[^>]*noindex/i.test(page)) {
  fails.push("C: the page carries no `noindex` robots meta. robots.txt asks politely and is a\n" +
             "   public file naming the path; the meta tag instructs the crawler directly. Both,\n" +
             "   the same as `classic/stats.html:8`.");
} else if (pageExists) {
  notes.push("C: the page carries its own noindex robots meta.");
}

/* ---- D. it reads every node the game writes — DERIVED, not hand-typed --------------------------- */

// ⚠ THIS BLOCK WAS HALF THEATRE ON ITS FIRST DAY AND CEO 159 CAUGHT IT. It captured the literal
// word `gamelogs` inside its own regex while the header above claimed every name was derived —
// so renaming that node would have left this gate GREEN on a console reading a node nobody
// writes. And `presence`, which feeds the single biggest number on his page, was not covered at
// all. Both regexes below are now generic: they take whatever top-level node the code writes.
const written = new Set();
for (const m of usage.matchAll(/put\("([A-Za-z][A-Za-z0-9_]*)\//g)) written.add(m[1]);
for (const m of writers.matchAll(/db\.ref\("([A-Za-z][A-Za-z0-9_]*)\//g)) written.add(m[1]);

// NOT EVERY NODE THE GAME WRITES BELONGS ON A USAGE DASHBOARD, so the exemptions are named here
// with their reason rather than being silently absent from a hand-typed include list. Anything
// the game starts writing that is NOT named here becomes a required read the day it appears —
// which is the direction that fails safe.
const EXEMPT = {
  rooms: "per-game multiplayer state, torn down as games end — it is the game's wire, not usage",
  feedback: "player feedback messages; a separate surface, and reading it here would put free\n" +
            "        text on a usage dashboard nobody asked for",
};
const required = [...written].filter(n => !(n in EXEMPT));

if (written.size === 0) {
  fails.push("D: derived NOTHING from src/ui/usage.js — the parse found no `put(\"<node>/` calls,\n" +
             "   so this clause could not fail and was certifying nothing. Fix the parse before\n" +
             "   trusting any green run of this gate.");
} else if (!required.includes("presence")) {
  fails.push("D: `presence` is not among the nodes derived as required, so the biggest number on\n" +
             "   his page — \"playing right now\" — is guarded by nothing. Either the parse of\n" +
             "   src/net/writers.js has drifted, or presence was added to EXEMPT, which it must\n" +
             "   not be.");
} else if (pageExists) {
  const missed = required.filter(n => !new RegExp(`["'\`/]${n}\\b`).test(page));
  if (missed.length) {
    fails.push(`D: the game writes ${[...written].sort().join(", ")} — the console never reads ` +
               `${missed.sort().join(", ")}.\n` +
               "   These names are parsed out of src/ui/usage.js and src/net/writers.js, not typed\n" +
               "   here, so this fires the day somebody renames one and the console silently\n" +
               "   starts showing zero.");
  } else {
    notes.push(`D: reads every node the game writes that belongs here — ${required.sort().join(", ")} ` +
               `(derived).\n     deliberately not read: ${Object.keys(EXEMPT).sort().join(", ")}`);
  }
}

/* ---- E. Wyatt has the word ----------------------------------------------------------------------
   The join nobody had: the hash the PAGE checks against, and the hash somebody recorded HANDING
   TO HIM. If they disagree, the word was changed and the owner was not told — which is what
   happened on 2026-09-03 with A, B, C and D all green.

   The record holds a hash and never the word. The second half of this clause enforces that: any
   lowercase token in the record whose SHA-256 is the curtain's is the plaintext, sitting next to
   the thing it opens, in a PUBLIC repo (verified public 2026-09-03 — the unauthenticated GitHub
   API answers 200 for it). That is CEO 159's finding, held by a check instead of by care. */

if (pageExists) {
  const onPage = (page.match(/CURTAIN_SHA256\s*=\s*"([0-9a-f]{64})"/) || [])[1] || null;
  const recorded = (delivered.match(/^sha256:\s*([0-9a-f]{64})\s*$/m) || [])[1] || null;

  if (!onPage) {
    fails.push("E: could not read a CURTAIN_SHA256 out of stats.html, so there is nothing to join\n" +
               "   the delivery record to. Clause B says a curtain exists; this says we can still\n" +
               "   tell WHICH word it is.");
  } else if (!deliveredExists || !recorded) {
    fails.push("E: nothing records that the curtain's word was ever given to Wyatt.\n" +
               "   His whole ask was \"so I can see how many people are playing\" — a page he\n" +
               "   cannot open has not done it. Write the SHA-256 you handed him, with when and\n" +
               "   by what channel, to .planning/wyclau/CURTAIN-DELIVERED.md as `sha256: <hex>`.\n" +
               "   THE WORD ITSELF NEVER GOES IN THAT FILE — this repo is public.");
  } else if (recorded !== onPage) {
    fails.push("E: the curtain word was changed and no delivery is recorded for the new one.\n" +
               `   the page checks against  ${onPage}\n` +
               `   last delivered to Wyatt  ${recorded}\n` +
               "   So his own console would refuse him. Deliver the new word by a channel that is\n" +
               "   NOT this repo (his Glass is the one built for it), then update the record.");
  } else {
    // THE PLAINTEXT MUST NOT BE ANYWHERE IN THE TRACKED TREE.
    //
    // ⚠ THIS SCANNED ONLY THE DELIVERY RECORD ON ITS FIRST DAY, AND THE CEO CAUGHT IT IN THE SAME
    // PASS THAT ADDED IT: CEO 159's finding was the word sitting in `_curtain_hash.mjs`, a
    // DIFFERENT FILE — so a guard reading one file would have let the exact original fault back
    // in, in the exact original place, while its own header claimed to hold it. The list of files
    // is DERIVED from `git ls-files`, never typed, for the reason docs/GIT-AND-DEPLOY.md §5 gives:
    // a hand-kept list of what to guard rots exactly like the thing it guards.
    let scanned = 0;
    let leaked = null;
    try {
      const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 })
        .split("\0").filter(Boolean)
        // Binary and asset paths cannot carry a readable word and dominate the tree.
        .filter(f => !/\.(png|jpg|jpeg|gif|webp|mp3|wav|ogg|woff2?|ttf|ico|pdf|zip)$/i.test(f));
      // The delivery record is read from the IN-MEMORY copy, so a `--red=` that plants a word in
      // it is actually seen. Reading it off disk here would make that red-proof silently toothless.
      const RECORD_REL = ".planning/wyclau/CURTAIN-DELIVERED.md";
      for (const f of [RECORD_REL, ...tracked.filter(f => f.replace(/\\/g, "/") !== RECORD_REL)]) {
        let text;
        if (f === RECORD_REL) text = delivered;
        else if (INJECT && f.replace(/\\/g, "/") === INJECT.path) text = INJECT.text;
        else try { text = readFileSync(join(ROOT, f), "utf8"); } catch { continue; }
        scanned++;
        for (const w of new Set(text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [])) {
          if (createHash("sha256").update(w).digest("hex") === onPage) { leaked = f; break; }
        }
        if (leaked) break;
      }
    } catch (e) {
      fails.push(`E: could not list the tracked tree to scan for the plaintext (${e.message}).\n` +
                 "   Refusing to report a clean sweep of files it never opened — that is the shape\n" +
                 "   of instrument that reports NOT FOUND about ITSELF and gets believed.");
    }
    if (leaked) {
      fails.push(`E: the curtain's word is written in plain text in \`${leaked}\`, a TRACKED file in a\n` +
                 "   PUBLIC repository, so the page's password ships with the page. That is CEO 159's\n" +
                 "   finding recurring. Record the hash and the channel; never the word.");
    } else if (!fails.length || scanned) {
      notes.push("E: the word on the page is the word recorded as delivered to Wyatt, and no plaintext\n" +
                 `     that opens it appears in any of the ${scanned} tracked text files (derived from git ls-files).`);
    }
  }
}

/* ---- verdict ------------------------------------------------------------------------------------ */

const label = red ? `RED-PROOF --red=${red}` : "stats console";
if (fails.length) {
  console.error(`FAIL  ${label}\n\n` + fails.map(f => "  - " + f).join("\n\n") + "\n");
  process.exit(red ? 0 : 1);   // under --red=, failing IS the pass
}
console.log(`PASS  ${label}\n` + notes.map(n => "  " + n).join("\n"));
if (red) {
  console.error(`\nRED-PROOF FAILED TO GO RED: --red=${red} broke the world and the gate still\n` +
                `passed, so that clause is certifying nothing.`);
  process.exit(1);
}
