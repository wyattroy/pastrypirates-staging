#!/usr/bin/env node
/* W2-7 — the Pass button becomes MUSE, and reads as three stacked lines.
 *
 *   node scripts/qa/w27_muse_button_check.mjs
 *
 * Wyatt, 2026-08-27: "'Pass' -> 'Muse' everywhere", then "we just don't need the tooltip", then
 * "make sure there's a wave image above 'Muse' and a +1🌕 below it".
 *
 * THE GUARD THAT MATTERS IS THE LAST ONE. "Everywhere" is exactly the instruction that gets
 * over-applied: src/ui/lobby.js says "Pass the wheel to…" and "Pass the board to…", which is
 * HANDING THE DEVICE OVER in pass-and-play — a different word with a different meaning. Renaming
 * those would produce "Muse the wheel to Crustbeard". So this check fails if they ever change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const flow  = fs.readFileSync(path.join(ROOT, "src/ui/flow.js"),  "utf8");
const lobby = fs.readFileSync(path.join(ROOT, "src/ui/lobby.js"), "utf8");

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };

/* READ THE WHOLE BLOCK, NOT ONE LINE. The first version of this check grepped the single line
   containing value:"pass" — which was right until the label grew to three lines, at which point it
   reported five failures against code that was correct. The instrument lost its subject; the code
   was fine. Take the option's construction: from wherever `canOvens` is tested up to value:"pass". */
const lines = flow.split("\n");
const end = lines.findIndex(l => l.includes('value:"pass"'));
const start = end < 0 ? -1 : (() => { for (let i = end; i > end - 12 && i >= 0; i--) if (/canOvens/.test(lines[i])) return i; return end; })();
const line = end < 0 ? "" : lines.slice(start, end + 1).join(" ").trim();
console.log("\nThe action-menu button that ends a turn quietly");
if (!line) bad("no option with value:\"pass\" found — this check is pointed at the wrong place");
else {
  console.log("  " + line.slice(0, 150));
  /Muse/.test(line)            ? ok('it says "Muse"')                    : bad('it does not say "Muse"');
  !/🌊 Pass|>Pass|`Pass/.test(line) ? ok('the old "Pass" label is gone')  : bad('the old "Pass" label is still there');
  /iconImg\(WAVE_IMG\)/.test(line) ? ok("it uses the wave IMAGE (WAVE_IMG), not the 🌊 emoji")
                                   : bad("no iconImg(WAVE_IMG) — he asked for a wave image");
  /* "ABOVE" AND "BELOW" ARE ABOUT THE RENDERED FACE, NOT THE SOURCE. An earlier version of this
     check compared indexOf("passCoin") with indexOf("Muse") in the source and failed correct code,
     because the coin fragment is DECLARED on the line above and USED on the line below. Build the
     real face instead: evaluate the two template literals with stubs. */
  const evalFace = () => {
    const iconImg = () => "[WAVE]";
    const appState = { game: { cfg: { passCoin: 1 } } };
    const mCoin = (flow.match(/const museCoin=([^;]+);/) || [])[1];
    const mFace = (flow.match(/const museFace=([^;]+);/) || [])[1];
    if (!mCoin || !mFace) return null;
    const museCoin = new Function("appState", `return ${mCoin}`)(appState);
    return new Function("iconImg", "WAVE_IMG", "museCoin", `return ${mFace}`)(iconImg, "wave.png", museCoin);
  };
  const face = evalFace();
  if (!face) bad("could not build the button face — museCoin/museFace not found");
  else {
    console.log("  renders as: " + JSON.stringify(face));
    const parts = face.split("<br>").map(x => x.replace(/<[^>]*>/g, "").trim());
    console.log("  stacked:    " + JSON.stringify(parts));
    parts.length === 3            ? ok("three stacked lines")                    : bad(`${parts.length} line(s), expected 3`);
    parts[0] === "[WAVE]"         ? ok("line 1 is the wave image")               : bad(`line 1 is "${parts[0]}", expected the wave image`);
    parts[1] === "Muse"           ? ok('line 2 is "Muse"')                       : bad(`line 2 is "${parts[1]}"`);
    /^\+1🌕$/.test(parts[2] || "") ? ok('line 3 is the coin, below Muse')         : bad(`line 3 is "${parts[2]}", expected "+1🌕"`);
  }
  /cfg\.passCoin/.test(line)     ? ok("the amount is read from cfg.passCoin, never typed (rule 9)")
                                 : bad("the coin amount is not derived from cfg");
}

console.log("\nThe rename did NOT bleed into pass-and-play's device hand-off");
/Pass the wheel to/.test(lobby)  ? ok('lobby still says "Pass the wheel to…"')  : bad('lobby\'s "Pass the wheel to…" was renamed — that is handing the device over, not the Muse action');
/Pass the board to/.test(lobby)  ? ok('lobby still says "Pass the board to…"')  : bad('lobby\'s "Pass the board to…" was renamed — same fault');
!/Muse the/.test(lobby)          ? ok('no "Muse the wheel/board" anywhere')     : bad('found "Muse the …" — the rename was over-applied');

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — Muse reads as three lines, and 'Pass the wheel' survived\n");
process.exit(fails ? 1 : 0);
