// GATE: THE GLASS PICKS UP OTHER SESSIONS' NOTES INSTEAD OF THEM PUBLISHING DIRECTLY.
//
// ONE PUBLISHER (Wyatt's ruling, 2026-08-31, on session sprawl: one WORKER, everything else
// scaffolding). Before this, two sessions both published the Glass artifact within five minutes
// and the platform's own conflict guard fired three times before it cleared. Nothing was lost,
// but it does not scale past two sessions, and every retry costs a full page read.
//
// THE FIX: GLASS-NOTE.md is a TRACKED file. A session that is not the Bosun writes what it wants
// shown into it and commits, instead of publishing the artifact itself. glass.mjs reads it on
// every generation, folds real content into the rendered page, and resets the file to its
// template so the next run does not re-show a stale message.
//
// This runs the REAL generator against real filesystem states -- it does not re-implement the
// pickup logic.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");

let failed = false;
const fail = (m) => { console.error(`FAIL -- ${m}`); failed = true; };
const pass = (m) => console.log(`PASS -- ${m}`);

function scratchRun({ noteContent, consume = false }) {
  const dir = mkdtempSync(join(tmpdir(), "glass-relay-"));
  mkdirSync(join(dir, "scripts", "wyclau"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), readFileSync(GLASS));
  /* glass.mjs IMPORTS ./lib/chart_model.mjs since the 2026-09-02 convergence, so a staged copy
     without its dependency dies with ERR_MODULE_NOT_FOUND. */
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"), readFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs")));
  writeFileSync(join(dir, ".planning", "CHART.md"), "# Chart\n\n## STEP 1 CHECKLIST\n\n## BLOCKED ON WYATT\n\n## THE IDEA INBOX\n\n*(empty)*\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n");
  if (noteContent !== null) writeFileSync(join(dir, ".planning", "wyclau", "GLASS-NOTE.md"), noteContent);
    /* ⛔ CONSUMING HIS NOTE IS OPT-IN SINCE 2026-09-02 (his words: "make sure nothing can destroy my
     writing"). The harness defaults to NOT consuming, because that is what every caller except the
     tick's publish step now does, and case 5 below is the guarantee that matters most. */
  const argv = [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", "relay gate"];
  if (consume) argv.splice(1, 0, "--consume-note");
  const out = execFileSync(process.execPath, argv, { encoding: "utf8" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  const noteAfter = existsSync(join(dir, ".planning", "wyclau", "GLASS-NOTE.md"))
    ? readFileSync(join(dir, ".planning", "wyclau", "GLASS-NOTE.md"), "utf8") : null;
  rmSync(dir, { recursive: true, force: true });
  return { out, html, noteAfter };
}

// 1/4 -- RED-PROOF: no GLASS-NOTE.md at all (the common case, and today's actual state before
//        this file existed). Must not throw, must not render a relay paragraph.
{
  const { html } = scratchRun({ noteContent: null });
  if (/<p class="relayNote">/.test(html)) fail("with no GLASS-NOTE.md at all, a relay paragraph still rendered.");
  else pass("no file at all -> generator runs clean, nothing rendered.");
}

// 2/4 -- TEMPLATE ONLY, no real content below the marker. Must read as empty, not as a message.
{
  const template = readFileSync(GLASS, "utf8").match(/const GLASS_NOTE_TEMPLATE = `([\s\S]*?)`;/)[1];
  const { html, noteAfter } = scratchRun({ noteContent: template });
  if (/<p class="relayNote">/.test(html)) fail("the bare template (no real note) rendered as if it were a message.");
  else if (noteAfter !== template) fail("an untouched template file was rewritten -- it should be left alone when there is nothing to pick up.");
  else pass("bare template -> no message rendered, file left as-is.");
}

// 3/5 -- REAL CONTENT below the marker, WITH `--consume-note`. Must render it AND reset the file.
//        The flag is what the tick's publish step passes; nothing else may.
{
  const template = readFileSync(GLASS, "utf8").match(/const GLASS_NOTE_TEMPLATE = `([\s\S]*?)`;/)[1];
  const { html, noteAfter, out } = scratchRun({ noteContent: template + "Please check the exit test.\n", consume: true });
  const rendered = /<p class="relayNote">From another session, folded in on this pulse: Please check the exit test\.<\/p>/.test(html);
  const wasReset = noteAfter === template;
  const said = /relayed note picked up/.test(out);
  if (!rendered) fail("real note content did not appear on the rendered page.");
  else if (!wasReset) fail("the note file was NOT reset after being picked up -- it would re-show forever.");
  else if (!said) fail("the generator's own console output did not say a note was picked up -- a session running it would not know to commit the reset.");
  else pass("real note -> rendered on the page, file reset, console said so.");
}

// 4/5 -- A SECOND RUN AFTER PICKUP must NOT re-show the same message (proves the reset actually
//        prevents repetition, not just that the file changed).
{
  const dir = mkdtempSync(join(tmpdir(), "glass-relay-repeat-"));
  mkdirSync(join(dir, "scripts", "wyclau"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), readFileSync(GLASS));
  /* glass.mjs IMPORTS ./lib/chart_model.mjs since the 2026-09-02 convergence, so a staged copy
     without its dependency dies with ERR_MODULE_NOT_FOUND. */
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"), readFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs")));
  writeFileSync(join(dir, ".planning", "CHART.md"), "# Chart\n\n## STEP 1 CHECKLIST\n\n## BLOCKED ON WYATT\n\n## THE IDEA INBOX\n\n*(empty)*\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n");
  const template = readFileSync(GLASS, "utf8").match(/const GLASS_NOTE_TEMPLATE = `([\s\S]*?)`;/)[1];
  writeFileSync(join(dir, ".planning", "wyclau", "GLASS-NOTE.md"), template + "One-time message.\n");
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--consume-note", "--note", "first run"], { stdio: "pipe" });
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--consume-note", "--note", "second run"], { stdio: "pipe" });
  const html2 = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  if (/<p class="relayNote">/.test(html2)) fail("a message picked up on run 1 still rendered on run 2 -- the reset did not stop repetition.");
  else pass("picked up once, gone by the second run -- no repetition.");
}


// 5/5 -- ⛔ HIS GUARANTEE, AND THE REASON THIS FILE MATTERS: WITHOUT `--consume-note`, HIS WRITING
//        SURVIVES. His instruction, 2026-09-02 10:45 PM ET: "okay make sure nothing can destroy my
//        writing -- that is an important task."
//        Until that night, generating the page and destroying his queued note were ONE act, so any
//        run consumed it. Measured with a sentinel through `npm test`: it was eaten, and bisecting
//        named five gates. They were not careless -- glass.mjs resolves its paths from its own
//        location, so a gate CANNOT sandbox it by changing directory. The fix was to make the
//        destructive half opt-in, and THIS CASE IS THE PROOF THAT IT STAYED THAT WAY.
{
  const template = readFileSync(GLASS, "utf8").match(/const GLASS_NOTE_TEMPLATE = `([\s\S]*?)`;/)[1];
  const his = template + "Words of his that must not be destroyed.\n";
  const { html, noteAfter } = scratchRun({ noteContent: his });
  const rendered = /<p class="relayNote">/.test(html);
  const survived = noteAfter === his;
  if (!survived) fail("HIS WRITING WAS DESTROYED BY A RUN THAT DID NOT ASK. Without --consume-note the note file must be left exactly as it was; a gate, a probe, or a session merely rendering the page would now eat his words.");
  else if (!rendered) fail("his note survived but did not reach the page -- surviving unread is not the goal.");
  else pass("without --consume-note his words are rendered AND left in the file, byte for byte.");
}

process.exit(failed ? 1 : 0);
