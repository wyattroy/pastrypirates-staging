#!/usr/bin/env node
/* glass_peek.mjs — LOOK AT HIS PAGE BEFORE HANDING IT TO HIM. Rule 19, for the Glass.
 *
 *   node scripts/qa/glass_peek.mjs "the note to render" .planning/posed/glass-<what>.png
 *
 * NOT A GATE — it is never in `npm test` and it asserts nothing. It is the POSED BOARD for his
 * status page (rule 26): render the REAL Chart, the REAL ledger and the REAL status files through
 * the REAL generator, and photograph the result at 390x844 DPR 2.
 *
 * WHY IT WAS KEPT RATHER THAN THROWN AWAY, stated plainly so he can overrule it: it was written as
 * a throwaway during T-088 and on its FIRST use it found two defects the fixture could not — a
 * trailing full stop made `NUMBER.` read as an identifier, and a punctuation token carried a
 * shouting run across a clause boundary and lowercased the acronym beyond it ("the heading — ceo
 * 104's"). Both were invisible in a hand-written fixture and obvious in one photograph of his own
 * Chart. A gate proves the rule; only this shows what he will actually read.
 *
 * IT NEVER TOUCHES THE LIVE PAGE. Everything renders in a throwaway tree, because
 * `glass.mjs --note` rewrites `.planning/wyclau/glass.html` AND CLEARS `GLASS-NOTE.md`
 * unconditionally — a watch's unpublished note to Wyatt has already been destroyed once by a
 * command run only to inspect the page (INBOX-20260902T0350Z).
 *
 * ⚠ RULE 17: it launches a headless Chrome. It closes it in a `finally`, and `close()`'s belt-and-
 * braces `pkill` does not exist on Windows — so check `node scripts/qa/stray_probe_check.mjs`
 * before you end the turn.
 */
import { mkdirSync, mkdtempSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = mkdtempSync(join(tmpdir(), "glass-peek-"));
mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
mkdirSync(join(dir, ".claude", "memory"), { recursive: true });
copyFileSync(join(ROOT, "scripts", "wyclau", "glass.mjs"), join(dir, "scripts", "wyclau", "glass.mjs"));
copyFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs"), join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"));
for (const f of ["CHART.md", "CHART-LOG.md", "CTO-LEDGER.md"]) {
  if (existsSync(join(ROOT, ".planning", f))) copyFileSync(join(ROOT, ".planning", f), join(dir, ".planning", f));
}
copyFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), join(dir, ".planning", "wyclau", "LESSONS.md"));
mkdirSync(join(dir, ".planning", "wyclau", "status"), { recursive: true });
for (const f of readdirSync(join(ROOT, ".planning", "wyclau", "status"))) {
  copyFileSync(join(ROOT, ".planning", "wyclau", "status", f), join(dir, ".planning", "wyclau", "status", f));
}
copyFileSync(join(ROOT, ".claude", "memory", "DECISIONS.md"), join(dir, ".claude", "memory", "DECISIONS.md"));
execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", process.argv[2] ?? "peek"], { stdio: "inherit" });

const out = process.argv[3] ?? join(ROOT, ".planning", "posed", "glass-peek.png");
mkdirSync(dirname(out), { recursive: true });
const b = await openChrome({ W: 390, H: 1400, dbgPort: 9789, httpPort: 8789, serveRoot: join(dir, ".planning", "wyclau"), profileDir: join(dir, "prof"), mobile: true, dsf: 2 });
try {
  await b.nav("http://127.0.0.1:8789/glass.html");
  await b.sleep(1500);
  await b.shot(out);
  console.log("shot:", out);
} finally { b.close(); }
