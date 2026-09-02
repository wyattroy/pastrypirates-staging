/* THE BOARD — THE SAME PIXELS, IN A FORMAT THAT DOES NOT COST 4.34 MB TO SEND THEM.
 *
 *   node scripts/qa/board_reexport.mjs --dry     measure lossy AND lossless, write nothing
 *   node scripts/qa/board_reexport.mjs           rewrite assets/board.png -> assets/board.webp
 *
 * WYATT'S ASK, INBOX-20260901T1335Z, and he called it launch critical: *"compressing the images to
 * make the game load MUCH faster. it's about 18mb of images... but the only one that needs to be as
 * big as it is is the board itself -- everyhting else should be resized and compressed according to
 * its maximum pixel size in the real gameplay."*
 *
 * ⚑ WHY THE BOARD WAS SKIPPED FOR TWO DAYS, because it is the reusable part. That sentence was read
 * as exempting the board from the WHOLE ask. It exempts it from ONE HALF of it — the resize. It sits
 * inside "resized and compressed according to its maximum pixel size", so the board is the one image
 * that keeps its resolution; nothing in it says it must keep its BYTES. The 2026-09-01 compression
 * pass excluded it by name (`asset_quantize.mjs:22`) and every measurement after that subtracted it
 * from the subject before reporting — "excluding board.png, 6.36 MB remains". THE EXCLUSION
 * PROPAGATED INTO THE FRAMING, so the largest file in the game stopped being counted as work at all,
 * while the item it belonged to stayed open and marked launch critical.
 *
 * NOT ONE PIXEL MOVES, and that is measured rather than chosen. `.planning/ASSET-DISPLAY-SIZES.md`
 * puts the board's maximum on-screen size at 2168x2168 DEVICE pixels (tablet, max zoom) against a
 * 2132px file — so it is already a touch UNDER-resolution at full zoom. Resizing it down would be
 * visible. This re-encodes at the source's own dimensions and refuses to do anything else.
 *
 * THE MECHANISM IS THE ONE THE RECIPE ART ALREADY PROVED on this library the same morning
 * (`pastry_reexport.mjs`, his ruling INBOX-20260902T0048Z): a headless-Chrome canvas is the encoder,
 * because ffmpeg is refused by the Windows sandbox and `scripts/lib/png.mjs` cannot write WebP.
 *
 * ⚠ THE TRANSFER IS CHUNKED ON PURPOSE. A 2132px canvas returns a base64 string of ~1.5 MB and it
 * has to cross the CDP evaluate boundary. The pastry script did this in one piece at 896px — sixteen
 * times less data. Rather than find out the hard way whether one `Runtime.evaluate` survives it, the
 * result is parked on `window` and read back in slices, and the reassembled length is checked
 * against the length the page reports. A truncated image that still decodes is exactly the kind of
 * "numbers right, picture wrong" failure this repo has paid for before.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split("=").slice(1).join("=");
/* --quality and --out exist so the fidelity check has something to look at BEFORE the swap. Once
   assets/board.png is gone there is nothing left to compare the candidate against, so a candidate
   has to be writable somewhere harmless first. */
const QUALITY = Number(arg("quality", 0.92));
const SRC = path.join(REPO, "assets", "board.png");
const OUT = path.resolve(REPO, arg("out", "assets/board.webp"));
const CHUNK = 4 << 20; // 4 MB of base64 per round trip

if (!fs.existsSync(SRC)) {
  console.log("nothing to do — assets/board.png is already gone (the conversion has run)");
  process.exit(0);
}

const png = fs.readFileSync(SRC);
const [W, H] = [png.readUInt32BE(16), png.readUInt32BE(20)];
const before = png.length;
console.log(`source: assets/board.png  ${W}x${H}  ${(before / 1048576).toFixed(2)} MB`);

const PORT = 8497, DBG = 9397;
const url = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-board-reexport"));
const C = await attach(DBG);
await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

// Draw once, encode twice from the same canvas — same pixels into both encoders, so the lossy /
// lossless comparison is a comparison and not two different draws.
const drawn = await C.ev(`(async()=>{
  const img=new Image(); img.src="/assets/board.png"; await img.decode();
  const c=document.createElement("canvas"); c.width=img.naturalWidth; c.height=img.naturalHeight;
  c.getContext("2d").drawImage(img,0,0);
  window.__boardCanvas=c;
  return JSON.stringify({w:c.width,h:c.height});
})()`);
const dim = JSON.parse(drawn);
if (dim.w !== W || dim.h !== H) {
  console.error(`FAIL — the canvas is ${dim.w}x${dim.h} but the file is ${W}x${H}. Refusing: this would resize the board.`);
  killAll();
  process.exit(1);
}

async function encode(quality) {
  const len = await C.ev(`(()=>{
    window.__b64 = window.__boardCanvas.toDataURL("image/webp", ${quality}).split(",")[1];
    return window.__b64.length;
  })()`);
  if (typeof len !== "number" || len < 1000) throw new Error(`the browser returned nothing usable at q${quality}`);
  let b64 = "";
  for (let i = 0; i < len; i += CHUNK) b64 += await C.ev(`window.__b64.slice(${i},${i + CHUNK})`);
  if (b64.length !== len) throw new Error(`truncated transfer: reassembled ${b64.length} of ${len} base64 chars`);
  const buf = Buffer.from(b64, "base64");
  // RIFF....WEBP — proof it is the format asked for and not a PNG fallback from a browser that
  // does not encode WebP. `toDataURL` silently falls back to PNG for an unsupported type.
  if (buf.slice(0, 4).toString("ascii") !== "RIFF" || buf.slice(8, 12).toString("ascii") !== "WEBP")
    throw new Error(`not a WebP — got magic ${JSON.stringify(buf.slice(0, 12).toString("ascii"))}`);
  await C.ev(`window.__b64=null`);
  return buf;
}

const lossy = await encode(QUALITY);
const lossless = await encode(1);
const mb = (n) => (n / 1048576).toFixed(2);
const cut = (n) => `${(100 * (1 - n / before)).toFixed(0)}% lighter`;
console.log(`\n  q${QUALITY} lossy   ${mb(lossy.length)} MB   (${cut(lossy.length)})`);
console.log(`  q1.0 lossless ${mb(lossless.length)} MB   (${cut(lossless.length)})`);

const SWAP = OUT === path.join(REPO, "assets", "board.webp");
if (DRY) {
  console.log("\nDRY — nothing written.");
} else {
  fs.writeFileSync(OUT, lossy);
  const rel = path.relative(REPO, OUT).replace(/\\/g, "/");
  if (SWAP) {
    fs.rmSync(SRC, { force: true });
    console.log(`\nwrote ${rel} at ${W}x${H} (${mb(lossy.length)} MB) and removed assets/board.png`);
  } else {
    console.log(`\nwrote ${rel} at ${W}x${H} (${mb(lossy.length)} MB) — a candidate, assets/board.png left in place`);
  }
  console.log(`  ${mb(before)} MB  ->  ${mb(lossy.length)} MB   (${cut(lossy.length)})`);
}
killAll();
