#!/usr/bin/env node
/* ⚠ A DIAGNOSTIC, NOT AN AUTHORITY. `scripts/qa/chart_sweep_conserves_check.mjs` case 2 is the gate
   that decides this, and it is in `npm test`. This file prints the same census with the full list
   so a human can SEE which handles are involved, which a pass/fail line cannot show.
   **If the two ever disagree, the gate is right and this is stale** — it is deliberately the only
   copy of this reasoning that nothing depends on. It exists because the first version of the gate
   reported 16 lost rows that were not lost (it split on checkboxes and missed every IDEA INBOX
   row), and that was only visible because something printed the names.

   One-shot census: which allocated `T-nnn` handles are owned by a row in neither record?
   Handles are allocated sequentially and never reused, so a GAP below the maximum is a row that
   existed and is now in neither file — the "never neither" half of the sweep's conservation
   guarantee, derivable from the two files alone with no git archaeology.
   Run: node scripts/qa/chart_handle_census.mjs */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const chart = readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8");
const logP = join(ROOT, ".planning", "CHART-LOG.md");
const log = existsSync(logP) ? readFileSync(logP, "utf8") : "";

// OWNERSHIP IS THE TOOL'S OWN MARKER LINE, not a reconstruction of it. The Chartkeeper writes the
// handle on its own indented line under the row (CEO 91: the first line is Wyatt's), and IDEA INBOX
// rows start "- **", not "- [ ]" — so splitting on checkboxes misses every idea and reports its
// handle as a lost row. Measured: 16 false gaps, including T-084, a row filed an hour earlier.
const chartOwned = (chart.match(/^\s*⟨`(T-\d{3})`⟩\s*$/gm) || []).map((l) => /T-\d{3}/.exec(l)[0]);
const logOwned = (log.match(/^## (T-\d{3}) — /gm) || []).map((h) => /T-\d{3}/.exec(h)[0]);
const owned = new Set([...chartOwned, ...logOwned]);
const nums = [...owned].map((h) => Number(h.slice(2)));
const max = Math.max(...nums);
const missing = [];
for (let i = 1; i <= max; i++) if (!owned.has(`T-${String(i).padStart(3, "0")}`)) missing.push(`T-${String(i).padStart(3, "0")}`);

console.log(`chart owns ${chartOwned.length} · log owns ${logOwned.length} · distinct ${owned.size} · highest T-${String(max).padStart(3, "0")}`);
console.log(`gaps below the highest: ${missing.length}`);
console.log(missing.join(" "));
