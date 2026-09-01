// GATE: THE GLASS MUST NEVER RENDER "FILE ABSENT" AND "GENUINELY ZERO" AS THE SAME SENTENCE.
//
// restarts.log is machine-local and gitignored (.gitignore:82,90ish) -- a page generated on any
// machine but the Razer has no file to read at all. The old code rendered that identically to a
// real, empty log: both said "None recorded -- either no stalls, or the watchdog isn't live yet".
// A relay caught it 2026-08-31: the restart log IS the 24-hour exit test's evidence, and a page
// that cannot tell "no evidence" from "clean evidence" understates the proof, which is exactly
// the fail-open scripts/wyclau/glass.mjs's own header rule forbids ("a source that cannot be read
// renders as unreadable, never as empty success").
//
// This runs the REAL generator three times, against three real filesystem states, and reads its
// real output -- it does not re-implement the logic.
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

function scratchRun({ restartsContent }) {
  const dir = mkdtempSync(join(tmpdir(), "glass-honesty-"));
  mkdirSync(join(dir, "scripts", "wyclau"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), readFileSync(GLASS));
  writeFileSync(join(dir, ".planning", "CHART.md"), "# Chart\n\n## STEP 1 CHECKLIST\n\n## BLOCKED ON WYATT\n\n## THE IDEA INBOX\n\n*(empty)*\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n");
  if (restartsContent !== null) writeFileSync(join(dir, ".planning", "wyclau", "restarts.log"), restartsContent);
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", "honesty gate"], { stdio: "pipe" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return html;
}

// 1/3 -- FILE ABSENT ENTIRELY (the common case off the Razer). Must say so explicitly and must
//        NOT read as "genuinely zero restarts".
{
  const html = scratchRun({ restartsContent: null });
  const saysAbsent = /No restarts\.log on this machine/.test(html);
  const namesMachine = /The Bell..?s log \(last 5, on [^)]+\)/.test(html);
  if (!saysAbsent) fail("with restarts.log entirely absent, the page does not say so -- it can still be mistaken for a clean log.");
  else if (!namesMachine) fail("the section heading does not name the machine even when the file is absent.");
  else pass("file absent -> the page says so explicitly and names the machine.");
}

// 2/3 -- FILE PRESENT AND GENUINELY EMPTY. Must read differently from case 1 -- this IS evidence.
{
  const html = scratchRun({ restartsContent: "" });
  const saysNoneOn = /None recorded on <b>/.test(html);
  const saysAbsent = /No restarts\.log on this machine/.test(html);
  if (saysAbsent) fail("an EMPTY file is being reported as an ABSENT file -- the two cases must read differently.");
  else if (!saysNoneOn) fail("a present-but-empty log does not say 'None recorded on <machine>' -- the positive evidence case is not distinguished either.");
  else pass("file present and empty -> reads as real (if unremarkable) evidence, distinct from absence.");
}

// 3/3 -- FILE PRESENT WITH REAL ENTRIES. Must list them AND still name the machine.
{
  const html = scratchRun({ restartsContent: "2026-08-31T14:59:01Z\theartbeat stale (32 min > 5) -- restarting the engine\n" });
  const hasEntry = html.includes("heartbeat stale (32 min");
  const namesMachine = /The Bell..?s log \(last 5, on [^)]+\)/.test(html);
  if (!hasEntry) fail("a real restart entry does not appear in the rendered output.");
  else if (!namesMachine) fail("the heading drops the machine name even when there is real data to attribute.");
  else pass("real entries render, and the machine that produced them is still named.");
}

process.exit(failed ? 1 : 0);
