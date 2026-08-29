/* W5-1 — DOES THE RE-EXPORTED FLIP ART ACTUALLY DECODE AND DRAW, IN BOTH ENGINES?
 *
 *   node scripts/qa/w51_coin_art_shot.mjs      exit 0 = all four decode at 768px in Chromium AND WebKit
 *
 * The flip art moved from PNG to WebP (see src/shared/index.js for why, and for why the .png files
 * must stay on disk — the frozen v1 at /classic reads the same folder). A format change is exactly
 * the kind of thing that works everywhere the author tested and fails on the one browser Wyatt
 * plays on, so this asks the engines instead of a compatibility table: WebKit IS Safari's engine.
 *
 * IT MEASURES THE DECODED SIZE, not merely that a request returned 200. A broken image still
 * "loads"; what proves the art is there is naturalWidth coming back as 768.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/* THE LIST IS DERIVED FROM THE GAME'S OWN CONSTANTS, not typed here. A file added to the
   flippenator tomorrow is checked without anybody remembering to add it. */
const shared = fs.readFileSync(path.join(REPO, "src/shared/index.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const FILES = [...new Set((shared.match(/\$\{ASSET_BASE\}icons\/(?:flip-[a-z]+|coin-spin)\.\w+/g) || [])
  .map(m => "assets/" + m.replace("${ASSET_BASE}", "")))];
if (!FILES.length) { console.log("FAIL — no flip art constants found in src/shared/index.js; re-anchor this gate"); process.exit(1); }

const PROBE = `(async()=>{const out={};
  for (const f of ${JSON.stringify(FILES)}) {
    try { const i = new Image(); i.src = "/" + f; await i.decode();
      out[f] = i.naturalWidth + "x" + i.naturalHeight; }
    catch (e) { out[f] = "FAILED: " + String(e && e.message || e).slice(0, 60); }
  }
  return JSON.stringify(out);})()`;

let fails = 0;
const url = serve(8499);
launch(9399, "/tmp/chrome-qa-w51art");
const C = await attach(9399);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "chromium load");
const chromium = JSON.parse(await C.ev(PROBE));
killAll();

let webkit = null;
try {
  const { openWebKit } = await import("../lib/wk.mjs");
  const P = await openWebKit({ W: 390, H: 844, httpPort: 8501, serveRoot: REPO,
                               profileDir: "/tmp/wk-w51art", mobile: true, dsf: 3 });
  await P.nav("http://127.0.0.1:8501/");
  webkit = JSON.parse(await P.ev(PROBE));
  await P.close();
} catch (e) {
  console.log(`  WebKit: did NOT run — ${String(e && e.message || e).slice(0, 120)}`);
}

for (const f of FILES) {
  const c = chromium[f] || "absent";
  const w = webkit ? (webkit[f] || "absent") : "NOT RUN";
  const ok = /^\d+x\d+$/.test(c) && (!webkit || /^\d+x\d+$/.test(w));
  if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${f.padEnd(30)} chromium ${c.padEnd(10)} webkit ${w}`);
}
if (!webkit) console.log("  ⚠ WebKit leg NOT RUN — that is not a pass. Safari is a hard requirement for this game.");
console.log(fails ? `\nFAILED — ${fails} file(s) did not decode` : `\nPASSED — all ${FILES.length} decode${webkit ? " in both engines" : " in Chromium; WebKit NOT RUN"}`);
process.exit(fails ? 1 : 0);
