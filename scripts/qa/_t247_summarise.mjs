// T-247 — group the parity gate's failures so the real ones are visible among the noise.
import { execFileSync } from "node:child_process";
// The gate exits 1 when it finds anything, which is the point of it — so a non-zero exit is a
// RESULT here, not a crash. execFileSync throws on it and puts the stdout in e.stdout.
let out;
try {
  out = execFileSync(process.execPath, ["scripts/qa/_t247_staging_parity.mjs", "--json", ...process.argv.slice(2)], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  out = e.stdout;
  if (!out) throw e;
}
const j = JSON.parse(out);
console.log(`stamp=${j.stamp}  head=${j.headSha}  dirty=${j.dirty}  compared=${j.compared}  failing=${j.bad.length}`);
const kind = {};
for (const b of j.bad) {
  const k = b.verdict.startsWith("MISSING") ? "MISSING (404)" : b.verdict;
  kind[k] = (kind[k] || 0) + 1;
}
console.log("by kind:", kind);

const isDevOnly = (f) => /^(scripts|docs|sims|tools|\.github|\.claude-team)\//.test(f);
const real = j.bad.filter((b) => !isDevOnly(b.file));
const dev = j.bad.filter((b) => isDevOnly(b.file));
console.log(`\n${dev.length} failure(s) are in dev-only directories no player loads (scripts/, docs/, …).`);
console.log(`${real.length} failure(s) are in files a PLAYER can reach:\n`);
for (const b of real) console.log(`   ${b.file.padEnd(46)} ${b.verdict}`);
