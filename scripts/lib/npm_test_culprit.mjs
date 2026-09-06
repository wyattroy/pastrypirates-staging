/* npm_test_culprit.mjs — WHICH gate actually failed, not a guess from the tail of the output.
 *
 * WHY THIS EXISTS. `npm test` is one `&&` chain of ~140 independent `node <script>` gates
 * (package.json's own `scripts.test`). When it fails, the naive approach — grab the last N lines
 * of the whole run's combined stdout+stderr — names whichever gate happened to print near the end
 * of the buffer, not necessarily the one that actually exited non-zero. CEO Review 185 (2026-09-03)
 * caught a real sea-trial report doing exactly this: it printed fixture chatter from two PASSING
 * gates (chartkeeper, do_now_check) while the real failure, chart_sweep_conserves_check, was never
 * named. Rule 24 stands on Wyatt being able to open a sea-trial report and believe it; a report
 * that misnames its own failure quietly reintroduces the evasiveness the sea trial exists to kill.
 *
 * THE FIX. On failure only (the rare path — this never runs when `npm test` is green, so the
 * common case pays nothing extra), re-run the SAME chain package.json declares, one entry at a
 * time, stopping at the first non-zero exit. That entry — by construction, not by text-matching —
 * is the culprit. Its own stdout/stderr is what gets shown, not a tail-sliced guess.
 */
import { execFileSync, spawnSync } from "node:child_process";

/** Split `package.json`'s `scripts.test` chain on ` && ` the same way gate_count_check.js does —
 *  that file already asserts this chain uses ONLY `&&` (never `;` or `||`), so splitting on it is
 *  a safe, shared assumption, not a new one. */
export function parseChain(chainStr) {
  if (typeof chainStr !== "string" || !chainStr.trim()) return [];
  return chainStr.split("&&").map((s) => s.trim()).filter(Boolean);
}

/** Run each chain entry in order, via the shell (an entry may carry flags/quoting), stopping at
 *  the first that exits non-zero. Returns:
 *    { failed: false }                                             — every entry passed
 *    { failed: true, index, entry, code, stdout, stderr }          — this entry is the culprit
 *    { failed: null,  reason }                                     — the chain reproduced GREEN
 *                                                                     (could not reproduce the
 *                                                                     original npm-test failure —
 *                                                                     say so, never guess)
 *  `cwd` must be the repo root; every gate assumes it runs from there. */
export function findCulprit(chainStr, { cwd, tailLines = 20 } = {}) {
  const entries = parseChain(chainStr);
  if (!entries.length) return { failed: null, reason: "empty chain — nothing to run" };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const r = spawnSync(entry, { cwd, encoding: "utf8", shell: true, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) {
      const stdout = (r.stdout || "").trim();
      const stderr = (r.stderr || "").trim();
      return {
        failed: true,
        index: i,
        entry,
        code: r.status,
        stdout: stdout.split("\n").slice(-tailLines).join("\n"),
        stderr: stderr.split("\n").slice(-tailLines).join("\n"),
      };
    }
  }
  return { failed: null, reason: "every chain entry passed on re-run — the original failure did not reproduce (flaky gate, or state changed between runs)" };
}

/** Render `findCulprit`'s result as the Markdown block sea_trial.mjs drops into its report. */
export function renderCulprit(result) {
  if (result.failed === false) return "";
  if (result.failed === null) {
    return `## The browser-free checks failed\n\n**Could not identify which gate** — ${result.reason}. Re-run \`npm test\` directly and read its own output.\n`;
  }
  const out = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return `## The browser-free checks failed\n\n**FAILING GATE:** \`${result.entry}\`\n\n\`\`\`\n${out || "(no output)"}\n\`\`\`\n`;
}
