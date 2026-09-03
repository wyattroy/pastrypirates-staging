/* CEO 156 throwaway — renders the LIVE .planning/CHART.md through a COPY of the real glass.mjs in a
   temp tree (the live glass.html / GLASS-NOTE.md are never touched) and reports what the parked row
   actually looks like on his page. No browser. DELETE ME. */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = mkdtempSync(join(tmpdir(), "ceo156-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

mkdirSync(join(tmp, "scripts", "wyclau", "lib"), { recursive: true });
mkdirSync(join(tmp, ".planning", "wyclau", "status"), { recursive: true });
mkdirSync(join(tmp, ".claude", "memory"), { recursive: true });
copyFileSync(join(ROOT, "scripts", "wyclau", "glass.mjs"), join(tmp, "scripts", "wyclau", "glass.mjs"));
copyFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs"), join(tmp, "scripts", "wyclau", "lib", "chart_model.mjs"));
for (const f of ["CHART.md", "CHART-LOG.md", "CTO-LEDGER.md"]) {
  if (existsSync(join(ROOT, ".planning", f))) copyFileSync(join(ROOT, ".planning", f), join(tmp, ".planning", f));
}
copyFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), join(tmp, ".planning", "wyclau", "LESSONS.md"));
for (const f of readdirSync(join(ROOT, ".planning", "wyclau", "status"))) {
  copyFileSync(join(ROOT, ".planning", "wyclau", "status", f), join(tmp, ".planning", "wyclau", "status", f));
}
copyFileSync(join(ROOT, ".claude", "memory", "DECISIONS.md"), join(tmp, ".claude", "memory", "DECISIONS.md"));

execFileSync(process.execPath, [join(tmp, "scripts", "wyclau", "glass.mjs")], { cwd: tmp, stdio: ["ignore", "pipe", "ignore"] });
const html = readFileSync(join(tmp, ".planning", "wyclau", "glass.html"), "utf8");
const page = html.replace(/\\u003c/g, "<").replace(/\\"/g, '"');

console.log("SCHEDULED rows on the page :", (page.match(/SCHEDULED\s*·/g) || []).length);
console.log("PARKED rows on the page    :", (page.match(/PARKED\s*·/g) || []).length);
console.log("dimmed <li> on the page    :", (page.match(/<li class="[^"]*\bdim\b/g) || []).length);
console.log("rowwhy spans on the page   :", (page.match(/class="rowwhy"/g) || []).length);
console.log("li.dim CSS present         :", /li\.dim\{opacity:\.72;\}/.test(page));

for (const m of page.matchAll(/<li class="([^"]*)"><span class="rowtitle">([^<]{0,120})[\s\S]{0,400}?<\/li>/g)) {
  if (!/\bdim\b/.test(m[1])) continue;
  const why = /class="rowwhy">([^<]*)</.exec(m[0]);
  console.log("\nDIMMED ROW class=", JSON.stringify(m[1]));
  console.log("  title:", m[2].slice(0, 100));
  console.log("  why  :", why ? JSON.stringify(why[1]) : "(NONE)");
}
