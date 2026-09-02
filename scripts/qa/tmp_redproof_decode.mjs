/* SCRATCH — red-proof for art_decodes_probe.mjs. Corrupts one converted file's BYTES (leaving the
   path in place, so the paths gate would still pass), runs the probe, and restores it. The point is
   that the decode probe's distinct claim — "the engine can draw these bytes" — is one no static
   check makes, so it has to be shown failing on exactly that. Not committed; delete when read. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const F = "assets/islands/5.webp";
const good = fs.readFileSync(F);
fs.writeFileSync(F, Buffer.from("RIFF____WEBPVP8 this is not an image at all", "ascii"));
try {
  execFileSync("node", ["scripts/qa/art_decodes_probe.mjs"], { stdio: "inherit" });
  console.log("\nRED-PROOF FAILED: the probe passed on a corrupted file.");
} catch {
  console.log("\nRED-PROOF OK: the probe failed on a corrupted file, as it must.");
} finally {
  fs.writeFileSync(F, good);
  console.log(`restored ${F} (${good.length} bytes)`);
}
