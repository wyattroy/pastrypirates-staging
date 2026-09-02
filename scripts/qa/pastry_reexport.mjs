/* THE PASTRIES — SIZED TO THE SLOT THE GAME ACTUALLY DRAWS THEM IN.
 *
 * ⚑ APPLIED 2026-09-02 on Wyatt's ruling (INBOX-20260902T0048Z, question UI: "Do it"). The 21
 * shipped files are WebP now, so a plain run of this prints "nothing to do — no PNGs" and that is
 * the correct, finished state, not a fault. It is kept runnable because it is the record of HOW
 * the conversion was made and the only way to redo it if art is ever re-commissioned.
 *
 *   node scripts/qa/pastry_reexport.mjs --dry     measure and report, write nothing
 *   node scripts/qa/pastry_reexport.mjs           rewrite assets/pastries/*.png -> *.webp
 *
 * WYATT'S ASK, INBOX-20260901T1335Z (launch critical, his word): *"everything else should be
 * resized and compressed according to its maximum pixel size in the real gameplay."*
 *
 * MEASURED FIRST, THEN THIS. `.planning/ASSET-DISPLAY-SIZES.md` (2026-09-01T23:xxZ) reached the
 * recipe modal for all 21 pastries and the answer came back the OPPOSITE way round from what a
 * "shrink the art" item assumes:
 *
 *     every pastry ships 512px wide and the modal wants 692-879 DEVICE pixels on a phone.
 *     Ratios x0.58 to x0.74. NOT ONE OF THEM IS OVERSIZED. They are all UNDER-resolution,
 *     by about 40% on the screen he plays on.
 *
 * So "resize to the maximum pixel size in real gameplay" means, for this family, sizing them UP.
 * The bytes come back from the FORMAT, not from the pixels — and that trade was already measured
 * in this repo, on the coins: `w51_reexport_coin_art.mjs` found WebP at q0.92 gave four times the
 * resolution at a QUARTER of the weight, PNG at the same size cost 3.3x more. The pastries are a
 * larger instance of exactly that trade.
 *
 * TWO SOURCES, AND THE GUARD THAT DECIDES BETWEEN THEM. `art-review/pastries/` holds the ~5 MB
 * masters. They are worth using ONLY if they are the same picture at a higher resolution — and
 * W5-1 paid for learning that they often are not: art-review's renders are PRE-CUTOUT, opaque
 * where the shipped file is transparent, so exporting one puts a solid block behind the art while
 * every decode check passes. Numbers right, picture wrong (rule 19). The corner-alpha guard below
 * is lifted from that script unchanged. When it refuses, this falls back to re-encoding the
 * SHIPPED pixels — no sharpness gain, identical picture, far fewer bytes.
 *
 * NEVER UPSCALE PAST THE SOURCE. A master smaller than the target is exported at its own size;
 * inventing pixels adds bytes and no detail.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

/* THE TARGET IS DERIVED FROM THE MEASUREMENT, NOT CHOSEN. The widest slot any pastry reaches is
   879 device pixels (`assets/pastries/10-cinnamon-chocolate-fudge.png`, phone at DPR 3, recipe
   modal). 896 covers every one of the 21 outright with nothing left over — the next step up buys
   pixels no screen in the measurement can use, on a family that loads on every voyage. */
const TARGET = 896;
const TYPE = "image/webp", QUALITY = 0.92;

const SHIPPED = path.join(REPO, "assets", "pastries");
const MASTERS = path.join(REPO, "art-review", "pastries");

const dims = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const rel = (p) => path.relative(REPO, p).replace(/\\/g, "/");

const files = fs.readdirSync(SHIPPED).filter((f) => /\.png$/i.test(f)).sort();
if (!files.length) { console.log("nothing to do — no PNGs in assets/pastries/"); process.exit(0); }

const PORT = 8499, DBG = 9399;
const url = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-pastry-reexport"));
const C = await attach(DBG);
await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

let before = 0, after = 0, done = 0, fromMaster = 0;
const report = [];
for (const f of files) {
  const shipped = path.join(SHIPPED, f);
  const master = path.join(MASTERS, f);
  const [bw, bh] = dims(shipped);
  const bytes = fs.statSync(shipped).size;
  before += bytes;

  let src = shipped, why = "shipped pixels";
  if (fs.existsSync(master)) {
    const [mw] = dims(master);
    if (mw > bw) {
      // THE ALPHA GUARD (W5-1's, unchanged). A master opaque where the shipped file is transparent
      // is not a bigger version of it; it is a different picture.
      const a = JSON.parse(await C.ev(`(async()=>{
        const corner=async(u)=>{const i=new Image();i.src=u;await i.decode();
          const c=document.createElement("canvas");c.width=i.naturalWidth;c.height=i.naturalHeight;
          const x=c.getContext("2d");x.drawImage(i,0,0);return x.getImageData(2,2,1,1).data[3];};
        return JSON.stringify({master:await corner(${JSON.stringify("/" + rel(master))}),
                               shipped:await corner(${JSON.stringify("/" + rel(shipped))})});
      })()`));
      if (a.shipped === 0 && a.master !== 0) {
        why = `shipped pixels (master REFUSED: opaque corner ${a.master} vs shipped ${a.shipped})`;
      } else { src = master; why = `master ${mw}px`; fromMaster++; }
    }
  }

  const [sw, sh] = dims(src);
  const scale = Math.min(1, TARGET / sw);          // never upscale past the source
  const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
  const b64 = await C.ev(`(async()=>{
    const img=new Image(); img.src=${JSON.stringify("/" + rel(src))}; await img.decode();
    const c=document.createElement("canvas"); c.width=${dw}; c.height=${dh};
    const x=c.getContext("2d"); x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high";
    x.drawImage(img,0,0,${dw},${dh});
    return c.toDataURL(${JSON.stringify(TYPE)},${QUALITY}).split(",")[1];
  })()`);
  if (typeof b64 !== "string" || b64.length < 1000) { console.log(`  FAILED ${f} — browser returned nothing usable`); continue; }
  const buf = Buffer.from(b64, "base64");
  after += buf.length;
  report.push(`  ${f}  ${bw}x${bh} ${(bytes / 1024).toFixed(0)}KB  ->  ${dw}x${dh} ${(buf.length / 1024).toFixed(0)}KB   (${why})`);
  if (!DRY) {
    fs.writeFileSync(path.join(SHIPPED, f.replace(/\.png$/i, ".webp")), buf);
    fs.rmSync(shipped, { force: true });
  }
  done++;
}
console.log(report.join("\n"));
console.log(`\n${done} pastr${done === 1 ? "y" : "ies"} ${DRY ? "measured (DRY — nothing written)" : "re-exported"} at ${TARGET}px, ` +
  `${fromMaster} from repo masters.\n  ${(before / 1048576).toFixed(2)} MB  ->  ${(after / 1048576).toFixed(2)} MB   ` +
  `(${(100 * (1 - after / before)).toFixed(0)}% lighter)`);
killAll();
