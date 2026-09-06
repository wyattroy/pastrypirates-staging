#!/usr/bin/env node
/* build_credits_page.mjs — regenerate /credits.html from the in-game Credits modal.
 *
 * RUN THIS whenever the modal's words change. You will not have to remember:
 * scripts/qa/credits_page_check.mjs runs on every `npm test` and fails the build the moment
 * credits.html differs from it by one byte. The failure names the first differing line and
 * prints this command.
 *
 * WHY THIS IS NOT A BUILD STEP in the sense the project forbids: nothing is built to SERVE the
 * game. credits.html is a plain committed file, served as-is by GitHub Pages exactly like
 * index.html, about.html and rules.html. This script is a tool a watch runs, same family as the
 * scripts/qa gates — the same two-halves shape T-100 chose for the rules page.
 *
 * The design and Wyatt's constraint that produced it: scripts/lib/credits_page.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderCreditsPage } from "./lib/credits_page.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "credits.html");

const html = await renderCreditsPage(REPO);
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
fs.writeFileSync(OUT, html);

if (before === html) console.log(`UNCHANGED  credits.html is already what the modal says (${html.length} bytes)`);
else if (before === null) console.log(`CREATED    credits.html (${html.length} bytes) from the Credits modal in index.html`);
else console.log(`REGENERATED credits.html (${before.length} -> ${html.length} bytes) — the modal moved and the page has caught up`);

console.log("           every word came from #creditsModal .modalByline in index.html; nothing was typed.");
