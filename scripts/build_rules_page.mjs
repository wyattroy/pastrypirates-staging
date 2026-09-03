#!/usr/bin/env node
/* build_rules_page.mjs — regenerate /rules.html from the in-game How-to-play modal.
 *
 * RUN THIS whenever the modal's words change, or a tuned constant moves. You will not have to
 * remember: scripts/qa/rules_page_check.mjs §6 runs on every `npm test`, re-runs this same
 * generator, and fails the build the moment rules.html differs from it by one byte. The failure
 * names the first differing line and prints this command.
 *
 * WHY THIS IS NOT A BUILD STEP in the sense the project forbids: nothing is built to SERVE the
 * game. rules.html is a plain committed file, served as-is by GitHub Pages exactly like
 * index.html and about.html. This script is a tool a watch runs, in the same family as the
 * scripts/qa gates — the two-halves shape A-7 already chose for the modal (runtime derivation for
 * numbers, a gate for prose).
 *
 * The whole design and Wyatt's constraint that produced it: scripts/lib/rules_page.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderRulesPage } from "./lib/rules_page.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "rules.html");

const html = await renderRulesPage(REPO);
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
fs.writeFileSync(OUT, html);

if (before === html) console.log(`UNCHANGED  rules.html is already what the modal says (${html.length} bytes)`);
else if (before === null) console.log(`CREATED    rules.html (${html.length} bytes) from the How-to-play modal in index.html`);
else console.log(`REGENERATED rules.html (${before.length} -> ${html.length} bytes) — the modal moved and the page has caught up`);

console.log("           every number in it came from rulesFacts(roundCfg(4 seats)); nothing was typed.");
