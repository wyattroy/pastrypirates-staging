#!/usr/bin/env node
/* glass_self_publish_check.mjs — the page must survive SAVING ITSELF.
 *
 * ⚠ THIS IS THE ROOT CAUSE OF "THE PAGE CSS BREAKS AFTER I SEND AN IDEA", found 2026-09-01 after
 * THREE failed fixes. Wyatt reported it on 2026-08-31 and again twice after attempted repairs.
 * Attempt 1 delayed a reload; attempt 2 blanked the body then reloaded; attempt 3 removed the
 * reload entirely. All three changed WHEN the page reloaded. NONE of them touched the bytes the
 * page was saving, and the bytes were broken every single time.
 *
 * THE MECHANISM, measured by clicking Send in a real browser with a stubbed capability and then
 * RENDERING WHAT THE PAGE PUBLISHED: the saved document came back with THREE script elements where
 * the page has two, and its JavaScript died with "SyntaxError: Invalid or unexpected token".
 *
 * WHY. The page rebuilds its whole document from a copy of itself held in a JS string (TPL) and
 * must escape "<" when writing that string, or the first `</script>` INSIDE it closes the real
 * script element early and the rest of the document is parsed as stray markup. The escaper existed
 * and did nothing:
 *
 *     the generator, in a real .js file:  .replace(/</g, "\\u003c")   -> emits an escape. Correct.
 *     the copy it WRITES INTO the page:   .replace(/</g, "<")    -> "<" IS "<". A no-op.
 *
 * The client code is authored inside a TEMPLATE LITERAL in glass.mjs, so "\\u003c" collapsed to
 * "<" on the way out. It needed four backslashes to emit two. One character of escaping, and
 * every save the page has ever made was corrupt.
 *
 * ⚠ AND THIS IS WHY THE EARLIER "I SIMULATED THE ESCAPING, IT ROUND-TRIPS" CHECK PASSED: it
 * exercised the GENERATOR's escaper, which was always correct, not the emitted copy, which never
 * was. Testing the wrong copy of two things that must agree is this project's oldest failure
 * (rule 23). SO THIS GATE RUNS THE FUNCTIONS OUT OF THE GENERATED PAGE ITSELF -- never a copy,
 * never the generator's version.
 */
"use strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS_MJS = join(ROOT, "scripts", "wyclau", "glass.mjs");
const OUT = join(ROOT, ".planning", "wyclau", "glass.html");

const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("glass_self_publish_check — the document the page saves of itself must still be a document\n");

execFileSync("node", [GLASS_MJS, "--note", "self-publish check"], { cwd: ROOT, stdio: "pipe" });
const html = readFileSync(OUT, "utf8");

/* Lift the page's OWN escaper out of the page and run it. Not a reimplementation: the exact text
   the browser would execute.
   ⚠ FROM THE LIVE SCRIPT, NOT THE EMBEDDED COPY. The page contains jsEsc TWICE — once for real and
   once inside the TPL string that holds a copy of the whole document. The first version of this
   gate matched the TPL copy (escaped quotes and all) and blew up on it, which is the same
   "measured the wrong copy" mistake that let this bug survive three fixes. */
const liveScript = html.slice(html.lastIndexOf("<script>"));
/* The LAST occurrence, because the TPL string literal is assigned near the TOP of the live script
   and contains an escaped copy of this very function — so the FIRST match is the copy, not the
   code. Two versions of one thing, again, and the gate had to learn the same lesson the bug did. */
const jsEscAll = liveScript.match(/function jsEsc\(s\)\{[^}]*\}/g) || [];
const jsEscSrc = jsEscAll[jsEscAll.length - 1];
if (!jsEscSrc) {
  check("the page defines jsEsc()", false, "not found in the generated page at all");
} else {
  const jsEsc = new Function(`${jsEscSrc}; return jsEsc;`)();
  const closing = "</" + "script>";
  const escaped = jsEsc(`a ${closing} b`);
  check("the page's own jsEsc actually ESCAPES '<' (it was a no-op: '\\u003c' IS '<')",
    !escaped.includes("<"), `it returned ${JSON.stringify(escaped)} — a raw "<" survives, so a closing script tag inside the string ends the real one`);
  check("jsEsc emits the two-character escape a browser needs",
    /\\u003c/.test(escaped), `got ${JSON.stringify(escaped)}`);
}

/* THE WHOLE POINT, end to end: rebuild the document the way the page does, and count the script
   elements. Two is the page; three means one was closed early and the rest became stray markup. */
const tplMatch = liveScript.match(/var TPL = ("(?:[^"\\]|\\.)*");/);
if (!tplMatch) {
  check("the page carries its own document as TPL", false, "TPL string literal not found");
} else {
  const TPL = JSON.parse(tplMatch[1]);
  const jsEsc2 = new Function(`${jsEscSrc}; return jsEsc;`)();
  const stateJson = JSON.stringify({ v: 2, generatedAt: "x", lastProgressAt: "x", longRun: null, ideas: [{ id: "i1", text: "testing", at: "x" }], rulings: {} });
  let doc = TPL;
  doc = doc.replace("__GLASS_TPL__", () => jsEsc2(TPL));
  doc = doc.replace("__GLASS_STATE__", () => stateJson.replace(/</g, "\\u003c"));

  const scriptOpens = (doc.match(/<script/gi) || []).length;
  check("the self-published document has exactly 2 script elements, not 3",
    scriptOpens === 2, `found ${scriptOpens} — a premature closing tag split the script and the rest of the page became stray markup`);

  // The client script must still parse. A broken escape shows up here as a syntax error, which is
  // exactly what the browser reported ("SyntaxError: Invalid or unexpected token").
  const lastOpen = doc.lastIndexOf("<script>");
  const lastClose = doc.lastIndexOf("</" + "script>");
  const clientJs = lastOpen > -1 && lastClose > lastOpen ? doc.slice(lastOpen + 8, lastClose) : null;
  let parses = false, why = "could not locate the client script in the saved document";
  if (clientJs) {
    try { new Function(clientJs); parses = true; } catch (e) { why = e.message; }
  }
  check("the client script in the SAVED document still parses", parses, why);
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} failure(s). The page cannot save itself without breaking.`);
  process.exit(1);
}
console.log("\nPASS — the page can rebuild and save itself, and what it saves is still a working page");
process.exit(0);
