/* CEO 155 throwaway — render the LIVE Chart through the REAL glass.mjs in a copied tree.
   Delete after reading. Never touches the live tree. */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = mkdtempSync(join(tmpdir(), "ceo155-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
mkdirSync(join(tmp, "scripts", "wyclau", "lib"), { recursive: true });
mkdirSync(join(tmp, ".planning", "wyclau", "status"), { recursive: true });
copyFileSync(join(ROOT, "scripts", "wyclau", "glass.mjs"), join(tmp, "scripts", "wyclau", "glass.mjs"));
copyFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs"), join(tmp, "scripts", "wyclau", "lib", "chart_model.mjs"));
writeFileSync(join(tmp, ".planning", "CHART.md"), readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8"));
try { writeFileSync(join(tmp, ".planning", "CHART-LOG.md"), readFileSync(join(ROOT, ".planning", "CHART-LOG.md"), "utf8")); } catch {}
execFileSync(process.execPath, [join(tmp, "scripts", "wyclau", "glass.mjs")], { cwd: tmp, stdio: ["ignore", "ignore", "ignore"] });
const html = readFileSync(join(tmp, ".planning", "wyclau", "glass.html"), "utf8");
const page = html.replace(/\\u003c/g, "<").replace(/\\"/g, '"');
const titles = [...page.matchAll(/<span class="rowtitle">([\s\S]{0,220}?)<\/span>/g)].map((m) => m[1]);
console.log("rowtitle count:", titles.length);
console.log("\n=== PARKED rowtitles ===");
titles.filter((t) => /PARKED/.test(t)).forEach((t) => console.log("  |", t.replace(/\s+/g, " ")));
console.log("\n=== SCHEDULED rowtitles (first 4) ===");
titles.filter((t) => /SCHEDULED/.test(t)).slice(0, 4).forEach((t) => console.log("  |", t.replace(/\s+/g, " ")));
console.log("\n=== the parked REASON on the page? ===");
console.log("  'widen the regex':", page.includes("widen the regex"), "| 'low priority':", page.includes("low priority"));
console.log("\n=== li markup for an inbox (non-draggable) task ===");
console.log((page.match(/<li(?![^>]*data-handle)[^>]*>[\s\S]{0,160}/g) || []).slice(0, 3).join("\n---\n"));
