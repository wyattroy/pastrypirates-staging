#!/usr/bin/env node
/* Throwaway audit: WHAT is the analytics gate's page walk actually finding? It reported 1753
   pages, which is not a plausible number of pages for this game, and a count you cannot explain
   is a measurement you have not made (rule 6). */
import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = new Set([".git", "node_modules", "assets", ".claude", "scratchpad", ".planning", "sea-trial-shots", "qa-out", "docs"]);
const skipped = (n) => SKIP.has(n) || n.startsWith("judge-") || n.startsWith("qa-out");

const out = [];
(function walk(dir) {
  let e = []; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.isDirectory()) { if (!skipped(x.name)) walk(join(dir, x.name)); }
    else if (x.name.endsWith(".html")) out.push(relative(ROOT, join(dir, x.name)).split(sep).join("/"));
  }
})(ROOT);

const byTop = {};
for (const p of out) { const k = p.includes("/") ? p.split("/").slice(0, 2).join("/") : "(root)"; byTop[k] = (byTop[k] || 0) + 1; }
console.log(`${out.length} .html found\n`);
for (const [k, v] of Object.entries(byTop).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log(`\nroot-level pages: ${out.filter((p) => !p.includes("/")).join(", ")}`);
