#!/usr/bin/env node
/* SCRATCH — the POSED PAIR for his DO NOW pin (rule 26): the SAME page, the same real Chart, the
 * same phone viewport, photographed with the old labels and the new ones.
 * Drives glass_peek.mjs, which renders the REAL generator over the REAL Chart into a throwaway
 * tree — it never touches .planning/wyclau/glass.html or GLASS-NOTE.md.
 * The "before" is made by swapping the two strings back in the real file and restoring it in a
 * finally block from an in-memory copy. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");
const PEEK = join(ROOT, "scripts", "qa", "glass_peek.mjs");
const POSED = join(ROOT, ".planning", "posed");
mkdirSync(POSED, { recursive: true });

const after = readFileSync(GLASS, "utf8");
const before = after
  .replace('data-choice="yes">Approve', 'data-choice="yes">Do it')
  .replace('data-choice="no">Deny', 'data-choice="no">Don\'t');
if (before === after) { console.log("the swap found nothing — the labels are not where this expects"); process.exit(1); }

const shoot = (out) => execFileSync(process.execPath, [PEEK, "posed pair: his ruling buttons", out], { cwd: ROOT, stdio: "inherit" });

try {
  writeFileSync(GLASS, before);
  shoot(join(POSED, "donow-buttons-before.png"));
  writeFileSync(GLASS, after);
  shoot(join(POSED, "donow-buttons-after.png"));
} finally {
  writeFileSync(GLASS, after);
  console.log("\nglass.mjs restored to the shipped labels.");
}
