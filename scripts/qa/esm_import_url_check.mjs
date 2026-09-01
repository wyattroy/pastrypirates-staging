// GATE: A DYNAMIC import() OF AN ABSOLUTE PATH MUST GO THROUGH pathToFileURL.
//
// WHAT IT COSTS TO GET WRONG, MEASURED 2026-08-31 ON THE RAZER: `await import(path.join(ROOT,
// "src/shared/index.js"))` works on macOS and THROWS on Windows. An absolute Windows path begins
// "C:\", the ESM loader reads "c:" as a URL SCHEME, and refuses:
//
//     ERR_UNSUPPORTED_ESM_URL_SCHEME -- Received protocol 'c:'
//
// That is not a failing gate, it is an UNCAUGHT THROW: the gate dies, and because `npm test` is a
// single `&&` chain, every gate after it never runs. Seventeen sites had this. The suite had never
// once completed on the machine that is about to run the engine unattended for 24 hours, and
// nothing said so -- the chain simply stopped, and a chain that stops looks a lot like a chain
// that finished.
//
// The `file://${path.join(...)}` spelling is the same bug wearing a costume: on Windows it yields
// file://C:\... , where "C:" parses as the URL's HOST and the backslashes are not separators.
//
// WHY A GATE AND NOT A NOTE: this repo's rule is that a hand-kept list of what to guard rots
// exactly like the thing it guards. Seventeen sites got this wrong one at a time, each locally
// reasonable, over months -- because nothing was watching. Now something is.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = path.join(ROOT, "scripts");

let fails = 0;
const pass = (m) => console.log("  PASS  " + m);
const fail = (m) => { fails++; console.log("  FAIL  " + m); };

function everyScript(dir = SCRIPTS, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") everyScript(full, out); }
    else if (/\.(mjs|js|cjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

// An import() whose argument is a PATH EXPRESSION rather than a specifier or a file URL.
//   flagged: import(path.join(...))  import(path.resolve(...))  import(`file://${...}`)
//   spared:  import(pathToFileURL(...).href)  import("./x.js")  import("node:fs")  import(someVar)
const BARE_JOIN = /\bimport\(\s*(?:path\.)?(?:join|resolve)\s*\(/;
const RAW_FILE_URL = /\bimport\(\s*[`"']file:\/\/\$?\{?/;

console.log("\nesm_import_url_check — a dynamic import of an absolute path must be a file:// URL");

{
  const bad = [];
  for (const f of everyScript()) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    if (rel === "scripts/qa/esm_import_url_check.mjs") continue;   // holds the example strings
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (BARE_JOIN.test(line) || RAW_FILE_URL.test(line)) {
        bad.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }
  if (bad.length) {
    fail(
      `${bad.length} dynamic import(s) hand an absolute path straight to the ESM loader. ` +
      `On Windows each one THROWS and takes the rest of the chain with it. ` +
      `Wrap in pathToFileURL(...).href:\n    ` + bad.join("\n    ")
    );
  } else {
    pass("every dynamic import of a built path goes through pathToFileURL");
  }
}

/* RED-PROOF, BOTH DIRECTIONS. A check never seen to fail is not a check, and one that flags the
   correct spelling too is worse than none -- it teaches people to work around it. */
{
  const bareJoin  = 'const m = await import(path.join(ROOT, "src/shared/index.js"));';
  const rawUrl    = 'const m = await import(`file://${path.join(TREE, "src/ui/flow.js")}`);';
  const correct   = 'const m = await import(pathToFileURL(path.join(ROOT, "src/shared/index.js")).href);';
  const specifier = 'const m = await import("./lib/vision.mjs");';
  const bareMod   = 'const fs = await import("node:fs");';

  const flags  = (s) => BARE_JOIN.test(s) || RAW_FILE_URL.test(s);
  const checks = [
    ["catches the bare path.join form", flags(bareJoin)],
    ["catches the `file://${...}` form", flags(rawUrl)],
    ["spares the correct pathToFileURL form", !flags(correct)],
    ["spares a relative specifier", !flags(specifier)],
    ["spares a bare node: module", !flags(bareMod)],
  ];
  const broken = checks.filter(([, ok]) => !ok).map(([m]) => m);
  if (broken.length) fail(`red-proof FAILED: ${broken.join("; ")}`);
  else pass("red-proof: catches both broken spellings, spares the correct one and plain specifiers");
}

console.log(fails ? `\nFAIL — ${fails} failure(s)\n` : "\nPASS — 0 failure(s)\n");
process.exit(fails ? 1 : 0);
