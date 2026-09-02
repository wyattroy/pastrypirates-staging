/* THE ABOUT PAGE'S OVERSIZED PICTURE — RESIZED TO THE SLOT IT IS ACTUALLY DRAWN IN.
 *
 *   node scripts/qa/about_art_resize.mjs --dry       measure only, write nothing
 *   node scripts/qa/about_art_resize.mjs             resize in place, then pose the pair
 *   node scripts/qa/about_art_resize.mjs --verify    pose the pair again against git HEAD's copy
 *
 * WYATT'S ASK, INBOX-20260901T1335Z: *"everything else should be resized and compressed according
 * to its maximum pixel size in the real gameplay."*
 *
 * THIS IS THE ONE FILE IN THE LIBRARY THAT ANSWER IS UNAMBIGUOUS FOR, and it had been named by two
 * CEO reviews running. `.planning/ASSET-DISPLAY-SIZES.md`: `assets/about-recipes.jpg`, 251 KB,
 * 1328px wide into a slot that wants 891 device pixels — **x1.49**, measured on the real page at
 * the phone size where the slot is biggest, and `about.html` is its ONLY reference in the tree.
 *
 * WHY IT SAT THERE FOR TWO WATCHES: "ffmpeg is refused by this sandbox." That was a could-not that
 * was not true. Chromium is already a dependency of every gate here, and its canvas downscale is
 * the same resampler that would have drawn the image anyway — the trick `w51_reexport_coin_art.mjs`
 * has used since 2026-08-30. **An instrument that reports NOT AVAILABLE has told you something
 * about ITSELF, not about the world** (rule 6).
 *
 * ⚠ AND THE FIRST VERSION OF THIS SCRIPT PROVED NOTHING, WHICH IS THE LESSON WORTH KEEPING.
 * It navigated to `about.html?v=<now>` after writing the new file and screenshotted again. The
 * cache-buster was on the PAGE; the IMAGE URL never changed, so Chrome served the picture it
 * already had. **The two screenshots came back byte-identical — same md5 — and they were read as
 * "the resize is invisible, good."** They were the same photograph twice. A posed pair whose two
 * halves cannot differ is not evidence, it is decoration.
 *
 * SO THE PAIR NOW CANNOT SILENTLY PASS. Each half loads the image under its own unique URL, waits
 * for `decode()`, and **asserts the decoded `naturalWidth`** — 1328 before, 896 after. If those do
 * not hold, or if the two PNGs come out identical, this exits non-zero and writes nothing.
 *
 * WHAT IT DOES NOT TOUCH. `about-screenshot.jpg` (x1.28) is inside the 1.30 margin — that margin is
 * headroom, not a target — and `about-home-island.jpg` (x0.61) and `about-flippenator.jpg` (x0.62)
 * are already under-resolution. One file is the whole honest list.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");
const VERIFY = process.argv.includes("--verify");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(ROOT, ".planning", "posed");
const ORIG = path.join(ROOT, ".tmp-about-orig");        // gitignored; holds the BEFORE picture
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ORIG, { recursive: true });

/* THE TARGET IS THE MEASUREMENT, NOT A ROUND NUMBER. 891 device pixels is what the phone leg of
   asset_display_size_probe.mjs recorded for this file's largest slot; 896 is the next multiple of
   8 and covers it outright. Anything above that is resolution no measured screen can use. */
const JOB = { file: "assets/about-recipes.jpg", target: 896, quality: 0.9, wasWidth: 1328 };
const TYPE = "image/jpeg";

const jpegDims = (buf) => {          // the same SOF walk asset_display_size_probe.mjs uses
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return [0, 0];
};

const abs = path.join(ROOT, JOB.file);
const origPath = path.join(ORIG, path.basename(JOB.file));

/* KEEP THE BEFORE PICTURE BEFORE OVERWRITING IT. On a --verify run the file on disk is already the
   resized one, so the original comes from git — the only copy left. */
if (VERIFY) {
  fs.writeFileSync(origPath, execFileSync("git", ["show", `HEAD:${JOB.file}`],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" }));
} else {
  fs.copyFileSync(abs, origPath);
}
const [ow] = jpegDims(fs.readFileSync(origPath));
if (ow !== JOB.wasWidth) {
  console.log(`REFUSED — the BEFORE copy is ${ow}px wide, expected ${JOB.wasWidth}. ` +
    `Nothing was written; the pair would have compared the wrong picture.`);
  process.exit(1);
}

const t = await openChrome({
  W: 390, H: 844, dbgPort: 9441, httpPort: 9442, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-aboutresize"), dsf: 3, mobile: true,
});
try {
  const base = "http://127.0.0.1:9442";

  if (!DRY && !VERIFY) {
    const beforeBytes = fs.statSync(abs).size;
    const [bw, bh] = jpegDims(fs.readFileSync(abs));
    await t.nav(`${base}/about.html`);
    await sleep(2000);
    const b64 = await t.ev(`(async()=>{
      const img=new Image(); img.src='/${JOB.file}'; await img.decode();
      const s=Math.min(1, ${JOB.target}/img.naturalWidth);      // never upscale
      const w=Math.round(img.naturalWidth*s), h=Math.round(img.naturalHeight*s);
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const x=c.getContext('2d'); x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high';
      x.drawImage(img,0,0,w,h);
      return c.toDataURL('${TYPE}',${JOB.quality}).split(',')[1];
    })()`);
    if (typeof b64 !== "string" || b64.length < 1000) throw new Error("the browser returned nothing usable");
    const buf = Buffer.from(b64, "base64");
    const [nw, nh] = jpegDims(buf);
    fs.writeFileSync(abs, buf);
    console.log(`${JOB.file}  ${bw}x${bh} ${(beforeBytes / 1024).toFixed(0)}KB  ->  ` +
      `${nw}x${nh} ${(buf.length / 1024).toFixed(0)}KB   ` +
      `(${(100 * (1 - buf.length / beforeBytes)).toFixed(0)}% lighter)`);
  }
  if (DRY) { console.log("DRY — nothing written, nothing posed."); process.exit(0); }

  // ---- THE POSED PAIR, and it can fail --------------------------------------------------------
  // Same page, same scroll position, same phone. The ONLY thing that changes between the two shots
  // is which file the <img> points at, and each is loaded under a URL Chrome has never seen.
  await t.nav(`${base}/about.html`);
  await sleep(2200);
  const shoot = async (url, expectWidth, file) => {
    const got = await t.ev(`(async()=>{
      const i=[...document.images].find(x=>/about-recipes/.test(x.src));
      if(!i) return -1;
      i.src=${JSON.stringify(url)}+'?cb='+Math.random();
      await i.decode();
      i.scrollIntoView({block:'center'});
      return i.naturalWidth;
    })()`);
    if (got !== expectWidth)
      throw new Error(`the <img> decoded at ${got}px, expected ${expectWidth} — the pair would have been a lie`);
    await sleep(700);
    await t.shot(path.join(OUT, file));
  };
  await shoot(`/.tmp-about-orig/${path.basename(JOB.file)}`, JOB.wasWidth, "about-recipes-before-phone.png");
  await shoot(`/${JOB.file}`, JOB.target, "about-recipes-after-phone.png");

  const a = fs.readFileSync(path.join(OUT, "about-recipes-before-phone.png"));
  const b = fs.readFileSync(path.join(OUT, "about-recipes-after-phone.png"));
  if (a.equals(b)) throw new Error("the two screenshots are byte-identical — the pair proves nothing");
  console.log(`posed pair: ${path.relative(ROOT, OUT)}/about-recipes-{before,after}-phone.png ` +
    `(${a.length} vs ${b.length} bytes — they differ, so the pair can fail)`);
} finally {
  await t.close();
}
