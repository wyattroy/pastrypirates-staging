/* W5-1 (second half) — RE-EXPORT THE FLIP ART FROM THE 2048px MASTERS IN THIS REPO.
 *
 *   node scripts/qa/w51_reexport_coin_art.mjs        rewrites assets/icons/{flip-*,coin-spin}.png
 *
 * Wyatt's own ruling on this item was "try repo assets else park", and the first cut of W5-1 never
 * looked — it fixed the RASTER (the ceremony was stretching a small picture) and declared the art
 * innocent. CEO Review 22 found the masters sitting in art-review/ at 2048x2048 while the game
 * shipped 382–512px, and the arithmetic is against the shipped files:
 *   the ceremony coin paints 502 device pixels on a 390px phone at DPR 3   (shipped: 382x384)
 *   its wooden socket paints 687                                            (shipped: 512x512)
 * Both short by about a quarter on the screen he plays on. Sizing the element right (the first
 * half) removed the 2.2x stretch; this removes what was left.
 *
 * WHY A BROWSER AND NOT ImageMagick: neither ImageMagick, Pillow nor sharp is installed here, and
 * a game with no build step should not grow a toolchain for four files. Chromium is already a
 * dependency of every gate in this repo, and its canvas downscale is the same resampler that would
 * have drawn the image anyway.
 *
 * THE TARGET IS DERIVED FROM WHAT THE SCREEN ASKS FOR, not chosen. The clamp caps the ceremony
 * coin at 96px CSS (index.html), so 96 × --pp4CerZoom × DPR3 = 634 device pixels of coin and, with
 * the plank's padding, 851 of socket. 768 covers the coin outright and leaves the socket at 0.90×
 * on the very largest phone at DPR 3 — against 0.60× today. Going to 1024 buys that last tenth for
 * roughly double the bytes on every page load, which is the wrong trade on a phone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TARGET = 768;
/* WEBP, AND THE NUMBERS DECIDED IT RATHER THAN A PREFERENCE. Re-exported as PNG the four files
   went from 1.04MB to 3.4MB — 2.4MB more on every page load, over a phone connection, for a coin.
   The same four as WebP at q0.92 come to about 55KB EACH: four times the resolution of what ships
   today at a QUARTER of the weight. Measured, both ways, before choosing.
   Support is not a question worth a compatibility table here: WebKit is Safari's engine and this
   repo runs it, so the re-export is verified in it directly (scripts/qa/w51_coin_art_shot.mjs). */
const TYPE = "image/webp", QUALITY = 0.92;
const JOBS = [
  ["art-review/icons-economy/flip-heads.png", "assets/icons/flip-heads.webp", "assets/icons/flip-heads.png"],
  ["art-review/icons-economy/flip-tails.png", "assets/icons/flip-tails.webp", "assets/icons/flip-tails.png"],
  ["art-review/icons-economy/coin-spin.png",  "assets/icons/coin-spin.webp",  "assets/icons/coin-spin.png"],
  ["art-review/flippenator/flip-socket.png",  "assets/icons/flip-socket.webp", "assets/icons/flip-socket.png"],
];
const dims = f => { const d = fs.readFileSync(path.join(REPO, f)).subarray(16, 24);
  return [d.readUInt32BE(0), d.readUInt32BE(4)]; };

const PORT = 8497, DBG = 9397;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-w51x");
const C = await attach(DBG);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");

let changed = 0;
for (const [src, dst, old] of JOBS) {
  const [sw, sh] = dims(src);
  const before = fs.statSync(path.join(REPO, old)).size;
  const [bw, bh] = dims(old);
  /* Keep whatever aspect the master has rather than assuming square, and NEVER upscale —
     re-exporting a small file at 768 would add bytes and no detail. */
  if (Math.max(sw, sh) <= Math.max(bw, bh)) {
    console.log(`  SKIP ${dst} — the master (${sw}x${sh}) is no larger than the shipped file (${bw}x${bh})`);
    continue;
  }
  /* THE MASTER MUST HAVE TRANSPARENCY, AND THIS GUARD IS THE WHOLE LESSON OF THE FIRST RUN.
     art-review/'s 2048px files are the PRE-CUTOUT renders: every corner reads alpha 255 over a
     near-black ground, while the shipped art reads 0. Re-exported, they put a hard black square
     behind the flippenator — and the decode check passed in BOTH engines at 768x768 while doing
     it. Numbers right, picture wrong (rule 19). A master that is opaque where the shipped file is
     transparent is not a bigger version of it; it is a different picture. */
  const alpha = await C.ev(`(async()=>{const o=new Image();o.src=${JSON.stringify("/" + src)};await o.decode();
    const n=new Image();n.src=${JSON.stringify("/" + old)};await n.decode();
    const corner=(img)=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;
      const x=c.getContext("2d");x.drawImage(img,0,0);return x.getImageData(2,2,1,1).data[3];};
    return JSON.stringify({master:corner(o), shipped:corner(n)});})()`);
  const a = JSON.parse(alpha);
  if (a.shipped === 0 && a.master !== 0) {
    console.log(`  REFUSED ${dst} — the shipped file is transparent at its corner (alpha ${a.shipped}) and the master is not (alpha ${a.master}). The master is the pre-cutout render; exporting it would put a solid block behind the art.`);
    continue;
  }
  const scale = TARGET / Math.max(sw, sh);
  const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
  const b64 = await C.ev(`(async()=>{
    const img = new Image(); img.src = ${JSON.stringify("/" + src)};
    await img.decode();
    const c = document.createElement("canvas"); c.width = ${dw}; c.height = ${dh};
    const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, ${dw}, ${dh});
    return c.toDataURL(${JSON.stringify(TYPE)}, ${QUALITY}).split(",")[1];
  })()`);
  if (typeof b64 !== "string" || b64.length < 1000) {
    console.log(`  FAILED ${dst} — the browser returned nothing usable`);
    continue;
  }
  const buf = Buffer.from(b64, "base64");
  fs.writeFileSync(path.join(REPO, dst), buf);
  fs.rmSync(path.join(REPO, old), { force: true });
  console.log(`  ${old} ${bw}x${bh} ${(before / 1024).toFixed(0)}KB  ->  ${dst} ${dw}x${dh} ${(buf.length / 1024).toFixed(0)}KB   (from the ${sw}x${sh} master)`);
  changed++;
}
console.log(`\n${changed} file(s) re-exported at ${TARGET}px from the repo's own masters.`);
killAll();
