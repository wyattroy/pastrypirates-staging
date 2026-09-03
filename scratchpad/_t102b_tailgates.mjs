/* Run the npm-test chain gates that come AFTER chart_sweep_conserves_check, which dies on a
 * handle gap that predates this watch. Purpose: prove this watch's change breaks nothing
 * downstream, rather than reporting "the suite is red" and leaving the reason ambiguous.
 * Throwaway — delete once the branch's suite is green again (Chart row T-222). */
import { execFileSync } from "node:child_process";

const GATES = [
  "scripts/qa/glass_done_today_check.mjs",
  "scripts/qa/glass_his_five_asks_check.mjs",
  "scripts/qa/glass_calm_check.mjs",
  "scripts/qa/numbered_options_check.mjs",
  "scripts/qa/lesson_process_check.mjs",
  "scripts/qa/glass_ruling_button_words_check.mjs",
  "scripts/qa/deploy_rsync_paths_check.mjs",
  "scripts/qa/emoji_with_art_never_reaches_screen_check.mjs",
  "scripts/qa/detached_trial_windowless_check.mjs",
  "scripts/qa/sitemap_lastmod_check.mjs",
  "scripts/qa/crawl_intent_check.mjs",
  "scripts/qa/sitemap_list_derived_check.mjs",
  "scripts/qa/stats_console_check.mjs",
  "scripts/qa/harvest_carries_his_words_check.mjs",
  "scripts/qa/one_ambiguity_rule_check.mjs",
  "scripts/qa/question_blocks_across_charts_check.mjs",
  "scripts/qa/publisher_must_have_looked_check.mjs",
  "scripts/qa/sea_trial_chosen_depth_check.mjs",
];

let bad = 0;
for (const g of GATES) {
  try {
    execFileSync(process.execPath, [g], { stdio: "pipe" });
    console.log(`PASS  ${g}`);
  } catch {
    bad++;
    console.log(`FAIL  ${g}`);
  }
}
console.log(`\n${GATES.length - bad} of ${GATES.length} downstream gate(s) pass.`);
process.exit(bad ? 1 : 0);
