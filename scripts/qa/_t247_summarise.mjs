// T-247 — group the parity gate's failures so the real ones are visible among the noise.
import { execFileSync } from "node:child_process";
const out = execFileSync(process.execPath, ["scripts/qa/_t247_staging_parity.mjs", "--json", ...process.argv.slice(2)], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});
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
