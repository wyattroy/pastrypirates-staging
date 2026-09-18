/* scripts/lib/gate_chain.mjs — WHAT `npm test` RUNS, AND IN WHAT ORDER. ONE PLACE.
 *
 * ============================================================================
 * Why this file exists
 * ============================================================================
 * Until 2026-09-18 the list of gates WAS `package.json`'s `scripts.test` string: 171 `node …`
 * invocations joined by `&&`, and six different files each re-parsed that string their own way
 * (gate_count_check, tree_health_check, stray_probe_reaper_check, quiet_gate_report,
 * gate_citation_check, and sea_trial via npm_test_culprit). That is rule 23's shape — one fact,
 * six deciders — and it had a hard ceiling on top of it.
 *
 * THE CEILING, measured rather than reasoned about: `npm` runs `scripts.test` through
 * `cmd.exe /d /s /c "…"`, and cmd.exe refuses a command line past 8191 characters. Binary-searched
 * on Wy-Blade twice, independently (architecture item 24, and again for item 63): the longest
 * `scripts.test` that runs is **8154 characters**; 8155 dies with "The command line is too long."
 * before a single gate starts. The chain was **8150**. Four characters — a 172nd gate under ANY
 * name took the whole suite down, and the failure looks nothing like the gate that caused it.
 *
 * So the list moved here, to `scripts/gates.manifest.json`, and `scripts.test` became one command.
 * There is no length ceiling on a JSON array.
 *
 * ============================================================================
 * It REFUSES rather than guesses
 * ============================================================================
 * Every rule below fails loudly and names the offending entry. A manifest reader that quietly
 * skipped a malformed line would drop a gate from the suite and report a smaller, greener number —
 * which is the exact failure `gate_count_check.js` exists to make impossible (HARD-WON-LESSONS §3:
 * a gate aimed at nothing is not silent, it is reassuring).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.join(__dirname, "..", "..");
export const MANIFEST_PATH = path.join(REPO_ROOT, "scripts", "gates.manifest.json");

/* The ONE command `package.json`'s `scripts.test` may contain. Anything else means somebody has
   started a second list beside the manifest — see gate_count_check.js's clause 3. */
export const RUNNER_ENTRY = "node scripts/run_gates.mjs";

/* An entry is a WHOLE invocation, flags included (`--tree=classic`, `--selftest 6`, `--drill`),
   because that is what a gate's identity is: the same script run two different ways is two gates
   (ui_contract_check.js appears twice today, once with `--tree=classic`).
   The character class is deliberately narrow. Nothing in this suite needs a quote, a pipe, a glob
   or a variable, and the runner spawns `node` DIRECTLY with an argv array rather than through a
   shell — QA-PROCESS §2b, "the cure is not better quoting, it is not using a shell". An entry that
   would need one is refused here rather than mis-run there. */
const ENTRY_RE = /^node(?: [A-Za-z0-9_.\/=+:-]+)+$/;

/** Parse one manifest entry into something spawnable. Throws, with the entry quoted, on anything
 *  the runner could not execute faithfully. */
export function splitEntry(entry, where = "the manifest") {
  if (typeof entry !== "string" || !entry.trim()) {
    throw new Error(`${where}: a gate entry is empty or not a string: ${JSON.stringify(entry)}`);
  }
  const e = entry.trim();
  if (e !== entry) {
    throw new Error(`${where}: gate entry has leading/trailing whitespace: ${JSON.stringify(entry)}`);
  }
  if (!ENTRY_RE.test(e)) {
    throw new Error(`${where}: gate entry is not a plain \`node <script> [flags]\` invocation, or carries a character that would need a shell: ${JSON.stringify(entry)}`);
  }
  const parts = e.split(" ");
  const [bin, script, ...args] = parts;
  if (!/\.(mjs|cjs|js)$/.test(script)) {
    throw new Error(`${where}: gate entry does not run a .js/.mjs/.cjs file: ${JSON.stringify(entry)}`);
  }
  return { bin, script, args, entry: e };
}

/** The gates, in order, exactly as the manifest lists them.
 *  `manifestPath` is the test seam — gate_count_check.js drives this against fixture manifests to
 *  prove the runner really does stop at the first red. */
export function readGates({ manifestPath = MANIFEST_PATH } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (e) {
    throw new Error(`the gate manifest is unreadable at ${manifestPath}: ${e.message}. There is no list, so nothing can honestly be said about what \`npm test\` covers.`);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(`the gate manifest at ${manifestPath} is not valid JSON: ${e.message}`);
  }
  if (!doc || !Array.isArray(doc.gates)) {
    throw new Error(`the gate manifest at ${manifestPath} has no "gates" array.`);
  }
  const where = path.relative(REPO_ROOT, manifestPath).split(path.sep).join("/");
  const seen = new Map();
  doc.gates.forEach((entry, i) => {
    splitEntry(entry, where);                    // shape
    if (seen.has(entry)) {
      throw new Error(`${where}: entry ${i + 1} is a duplicate of entry ${seen.get(entry) + 1}: ${JSON.stringify(entry)}. Running one gate twice does not make it truer; it makes the count lie.`);
    }
    seen.set(entry, i);
  });
  return doc.gates.slice();
}

/** The manifest rendered as the `&&` chain string the older readers were written against.
 *  This is what `scripts/lib/npm_test_culprit.mjs` takes — its contract (and the gate that holds
 *  it, scripts/qa/sea_trial_names_failing_gate_check.mjs) is a chain STRING, and it stays one. */
export function chainString(gates = readGates()) {
  return gates.join(" && ");
}
