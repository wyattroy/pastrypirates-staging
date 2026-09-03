/* _t206_redproof.mjs — proves `_t206_dark_property_check.mjs` can reach BOTH verdicts.
 *
 * It builds two throwaway trees in the OS temp directory (never in the repo) and runs the check
 * against each: one carrying the measurement id and no loader (must FAIL, exit 1), one carrying
 * the id AND a gtag.js tag (must PASS, exit 0). Without this, "the property is dark" rests on a
 * check nobody has ever seen say PASS — the exact instrument fault this project keeps paying for.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHECK = join(dirname(fileURLToPath(import.meta.url)), "_t206_dark_property_check.mjs");
const ID_LINE = `const cfg = { measurementId: "G-2KK6EZDZSP" };\n`;
const TAG = `<script src="https://www.googletagmanager.com/gtag/js?id=G-2KK6EZDZSP"></script>`;

function build(withTag) {
  const dir = mkdtempSync(join(tmpdir(), "t206-"));
  mkdirSync(join(dir, "src", "net"), { recursive: true });
  writeFileSync(join(dir, "src", "net", "index.js"), ID_LINE);
  writeFileSync(join(dir, "index.html"), `<title>x</title>${withTag ? TAG : ""}`);
  return dir;
}

let bad = 0;
for (const [withTag, want, label] of [[false, 1, "id, no loader"], [true, 0, "id AND gtag.js"]]) {
  const dir = build(withTag);
  const r = spawnSync(process.execPath, [CHECK, `--root=${dir}`], { encoding: "utf8" });
  const got = r.status;
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "BAD "} ${label.padEnd(16)} want exit ${want}, got ${got}`);
  if (!ok) console.log(r.stdout);
  rmSync(dir, { recursive: true, force: true });
}

console.log(bad === 0
  ? "\nPASS  the check bites on a dark property and clears on a loaded one — both verdicts reachable."
  : `\nFAIL  ${bad} case(s) wrong — the check cannot be trusted either way.`);
process.exit(bad === 0 ? 0 : 1);
