/* THROWAWAY posed pair for T-139's third clause — "PARKED shows DIMMED with its reason".
 * Renders the REAL .planning/CHART.md through the REAL generator twice, scrolls his Tasks card to
 * the one genuinely parked idea on it, and photographs it. Same seed both sides; the ONLY thing
 * that differs is whether `why`/`dim` are populated.
 *
 *   node scripts/qa/_t139_parked_pose.mjs <out.png> [--two-thirds]
 *
 * `--two-thirds` reconstructs the render CEO 155 found: the tag shipped, the reason and the
 * dimming did not. Everything renders in a throwaway tree — the live glass.html and GLASS-NOTE.md
 * are never touched. Rule 17: it launches a headless Chrome and closes it in a finally.
 */
import { mkdirSync, mkdtempSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TWO_THIRDS = process.argv.includes("--two-thirds");
const out = process.argv.filter((a) => !a.startsWith("--"))[2];
if (!out) { console.log("usage: node scripts/qa/_t139_parked_pose.mjs <out.png> [--two-thirds]"); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), "t139-pose-"));
mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
mkdirSync(join(dir, ".planning", "wyclau", "status"), { recursive: true });
mkdirSync(join(dir, ".claude", "memory"), { recursive: true });

let glass = readFileSync(join(ROOT, "scripts", "wyclau", "glass.mjs"), "utf8");
if (TWO_THIRDS) {
  glass = glass
    .replace(/why: b\.state === "parked" \? parkedReason\(b\.all\) : "",/, 'why: "",')
    .replace(/dim: b\.state === "parked",/, "dim: false,");
}
writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), glass);
copyFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs"), join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"));
for (const f of ["CHART.md", "CHART-LOG.md", "CTO-LEDGER.md"]) {
  if (existsSync(join(ROOT, ".planning", f))) copyFileSync(join(ROOT, ".planning", f), join(dir, ".planning", f));
}
copyFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), join(dir, ".planning", "wyclau", "LESSONS.md"));
for (const f of readdirSync(join(ROOT, ".planning", "wyclau", "status"))) {
  copyFileSync(join(ROOT, ".planning", "wyclau", "status", f), join(dir, ".planning", "wyclau", "status", f));
}
copyFileSync(join(ROOT, ".claude", "memory", "DECISIONS.md"), join(dir, ".claude", "memory", "DECISIONS.md"));
execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note",
  TWO_THIRDS ? "T-139 BEFORE: a parked idea is a bare tag" : "T-139 AFTER: a parked idea dims and says why"], { stdio: "pipe" });

mkdirSync(dirname(out), { recursive: true });
const b = await openChrome({ W: 390, H: 900, dbgPort: 9791, httpPort: 8791, serveRoot: join(dir, ".planning", "wyclau"), profileDir: join(dir, "prof"), mobile: true, dsf: 2 });
try {
  await b.nav("http://127.0.0.1:8791/glass.html");
  await b.sleep(1200);
  /* Find the PARKED row by the fate word the page itself writes, and centre it. Reported back so
     a shot of the wrong screen cannot be mistaken for evidence — the trap that killed the T-012
     pose (CEO 148: "the pose was on the wrong stage"). */
  const seen = await b.ev(`(function(){
    var li = [].slice.call(document.querySelectorAll("li")).filter(function(n){
      return /PARKED\\s*·/.test(n.textContent); });
    if (!li.length) return { err: "no PARKED row on the rendered page" };
    li[0].scrollIntoView({ block: "center" });
    return {
      rows: li.length,
      text: li[0].querySelector(".rowtitle") ? li[0].querySelector(".rowtitle").textContent.trim() : null,
      why: li[0].querySelector(".rowwhy") ? li[0].querySelector(".rowwhy").textContent.trim() : null,
      dimmed: /\\bdim\\b/.test(li[0].className),
      opacity: getComputedStyle(li[0]).opacity,
    };
  })()`);
  console.log("  parked row:", JSON.stringify(seen));
  await b.sleep(300);
  await b.shot(out);
  console.log("shot:", out);
} finally { b.close(); }
