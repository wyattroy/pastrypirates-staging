/* THE REST OF THE ART — the same trade the board and the recipe pictures already took, family by
 * family, and it REFUSES the files it does not pay for.
 *
 *   node scripts/qa/png_family_reexport.mjs --dry              measure every PNG under assets/, write nothing
 *   node scripts/qa/png_family_reexport.mjs --dry --in=islands only that folder
 *   node scripts/qa/png_family_reexport.mjs                    convert the files that pass, remove their PNGs
 *
 * WYATT'S ASK, INBOX-20260901T1335Z, and he called it launch critical: *"compressing the images to
 * make the game load MUCH faster."* The board went 95% lighter this morning (`T-057`) and the
 * recipe art 31% before it (`T-004`, his ruling "do it"). What is left is `T-058`.
 *
 * ⚑ THIS IS AN INSTRUMENT, NOT THE FIX, and the four steps run around it: its `--dry` pass is the
 * MEASUREMENT that says what total is achievable, `package.json`'s `assets.ceilingBytes` is then
 * ratcheted to that total so `asset_weight_check.mjs` goes RED, and the conversion is what turns it
 * green. Same sequence the board took at 08:10Z.
 *
 * ⚑ WHY THIS IS A THIRD SCRIPT AND NOT A FOURTH COPY. `board_reexport.mjs` and
 * `pastry_reexport.mjs` are the RECORDS of two conversions that have already happened — both print
 * "nothing to do" now, and both do something this one deliberately does not (the board chunks a
 * 1.5 MB base64 string; the pastries RESIZE to a measured slot). This is the general case: same
 * pixels in, same pixels out, format only, over many files. It is the one to reach for next time.
 *
 * ⚠ THE DIFFERENCE FROM THE BOARD IS ALPHA, AND IT IS THE WHOLE RISK.
 * `board_reexport_fidelity.mjs` compares three channels and says so in its own comment — *"alpha is
 * uniformly opaque on this file and would only dilute the average with zeros."* True of the board.
 * **False of every family left**: islands and icons are cut-outs with see-through surrounds. A
 * canvas that composites instead of preserving alpha would put a black or white box behind a
 * cut-out while every byte count and every decode check stayed green. W5-1 paid for exactly that
 * once — numbers right, picture wrong. So this measures alpha SEPARATELY and to a threshold of
 * ZERO, and compares colour only where the source pixel is actually visible; RGB under a fully
 * transparent pixel is undefined and comparing it manufactures noise.
 *
 * THE THREE REFUSALS, each one a file left exactly as it was:
 *   1. **the WebP is not smaller** — a flat few-colour icon is PNG's best case and WebP's worst,
 *      and shipping a heavier file to make a folder tidy is the opposite of what he asked for;
 *   2. **any alpha byte moved at all** — see above;
 *   3. **the canvas came back a different size** — this tool changes FORMAT and never dimensions,
 *      so a size change here is a bug in the encode, not a decision.
 * A refusal is not a failure of the run. It is the run doing its job, and the report names them.
 *
 * ⚠ AND A REFUSAL HERE SETTLES THE FORMAT QUESTION ONLY. CEO 98's finding 3, and the wording it
 * corrects had inverted Wyatt's own sentence — rule 3 above used to read "he exempted nothing from
 * keeping its pixels", which is backwards: he exempted **the board** from resizing and asked for
 * *"everything else… resized and compressed according to its maximum pixel size in the real
 * gameplay."* **This tool does not resize and cannot answer the resize half.** So when it refuses
 * 90 icons, the honest reading is *"WebP does not pay for these"*, never *"these are done."*
 * `.planning/ASSET-DISPLAY-SIZES.md` measures several of them well over their largest on-screen
 * size — `icons/flip-heads.png` x7.07, `crown.png` x5.93, `cupcake.png` x5.88 — and that table has
 * its own known blind spot (it never saw the flip ceremony paint flip-heads at 502 device pixels,
 * `index.html:708-710`), so those ratios are a lead to measure, not a licence to shrink.
 *
 * THE QUALITY POINT IS THE ONE THE BOARD CHOSE BY MEASUREMENT, not by taste: q0.92. The 08:10Z
 * watch measured q0.96 at 2.1x the bytes for a mean improvement of 1.65 -> 1.58 on 4.5M pixels,
 * i.e. the residual is not encoder noise and buying more quality buys nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split("=").slice(1).join("=");
const QUALITY = Number(arg("quality", 0.92));
const ONLY = arg("in", "");
const CHUNK = 4 << 20;
/* ⚠ THE ACCEPTANCE FLOOR IS A JUDGEMENT WITH A CITATION, NOT A DERIVATION — and this comment said
   otherwise for one commit. CEO 98's finding 2, and it is right: an earlier version claimed the
   floor was "taken from a trade Wyatt has already ruled on, not chosen (rule 9)."
   **The citation is real and the derivation is not.** What is true: the smallest conversion he has
   approved on this library is the recipe art at 31% (`INBOX-20260902T0048Z`, his word "Do it",
   commit 3a43235), so 0.31 is anchored to something rather than picked out of the air. What is NOT
   true: he approved converting a FAMILY; he never set a floor, and no quantity the game computes
   produces this number. Rule 9 is about deriving a moving quantity from what the game already
   knows — that is not what this is, and dressing a threshold up as a derivation is exactly the
   habit rule 9 exists to catch.
   WHY THERE IS A FLOOR AT ALL, which stands on its own: below it a file is not what "compressing
   the images to make the game load MUCH faster" is about. It still costs a lossy re-encode of his
   commissioned art, a reference edit in two games, and — on the small flat icons, which is exactly
   where the tiny savings live — the WORST fidelity in the whole library. `icons/blocked-slash.png`
   is the worked example: 0% lighter, colour moved 9.96/255.
   AND IT IS OVERRIDABLE ON PURPOSE (`--floor=0`), because a family with NO fidelity to trade has
   nothing to protect. That is not a loophole; it is why the number is a flag and not a constant.
   Any run that overrides it owes the reason in the same breath — see the `holes/` note in
   `.planning/ASSET-WEBP-2026-09-02.md`. */
const FLOOR = Number(arg("floor", 0.31));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (path.extname(e.name).toLowerCase() === ".png") out.push(p);
  }
  return out;
}

const ASSETS = path.join(REPO, "assets");
const files = walk(ASSETS)
  .map((f) => path.relative(REPO, f).split(path.sep).join("/"))
  .filter((rel) => !ONLY || rel.startsWith(`assets/${ONLY}`))
  .sort();

if (!files.length) {
  console.log(`nothing to do — no PNGs under assets/${ONLY}`);
  process.exit(0);
}

const mb = (n) => (n / 1048576).toFixed(2);
const kb = (n) => `${Math.round(n / 1024)} KB`;
const beforeTotal = files.reduce((s, f) => s + fs.statSync(path.join(REPO, f)).size, 0);
console.log(`${files.length} PNG file(s), ${mb(beforeTotal)} MB${ONLY ? ` under assets/${ONLY}` : ""}`);
console.log(`quality q${QUALITY}${DRY ? "   (DRY — nothing will be written)" : ""}\n`);

const PORT = 8495, DBG = 9395;
const url = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-png-family"));
const C = await attach(DBG);
await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

/* ONE PAGE, reused for every file — a fresh page per file would cost more in process startup than
   the whole encode. The metrics come back as JSON; the BYTES come back separately and chunked,
   because a base64 string is the one thing here that can be large. */
async function draw(rel) {
  const meta = await C.ev(`(async()=>{
    const img=new Image(); img.src=${JSON.stringify("/" + rel)}; await img.decode();
    const c=document.createElement("canvas"); c.width=img.naturalWidth; c.height=img.naturalHeight;
    const x=c.getContext("2d"); x.clearRect(0,0,c.width,c.height); x.drawImage(img,0,0);
    window.__canvas=c;
    window.__src=x.getImageData(0,0,c.width,c.height).data;
    return JSON.stringify({w:c.width,h:c.height});
  })()`);
  return JSON.parse(meta);
}

/* BOTH ARMS, FROM THE SAME DRAW — so the comparison is a comparison and not two different draws.
   ⚑ THE LOSSLESS ARM IS THE POINT OF THIS SCRIPT AND THE BOARD DID NOT NEED IT. The first dry run
   over all 121 files refused 64 of them because lossy WebP came back HEAVIER than the PNG — every
   one a small, flat, few-colour icon, which is PNG's best case. Those same icons were also the
   worst on fidelity (`icons/hourglass.png` moved 13.17/255 where the islands moved 3). Lossy WebP
   is simply the wrong format for a flat icon. Lossless WebP was the obvious candidate to rescue
   them — it costs exactly zero fidelity by construction — so each file is offered both arms and
   keeps whichever is smaller, and the report names the winner.
   ⚠ AND IT DID NOT RESCUE THEM. Measured over all 121 files on 2026-09-02: the lossless arm won
   for exactly ONE (`assets/ingredients/holes/wheat.png`). PNG's own entropy coding is already at
   least as good as WebP's on this library's flat art. **The arm stays because it is cheap and
   because it is the reason we now KNOW that, rather than assuming it** — but nobody should expect
   it to pay next time. This is a measurement with a date on it, not a standing claim. */
async function encodeArm(rel, quality) {
  const len = await C.ev(`(()=>{
    window.__b64=window.__canvas.toDataURL("image/webp",${quality}).split(",")[1];
    return window.__b64.length;
  })()`);
  if (typeof len !== "number" || len < 40) throw new Error(`the browser returned nothing usable for ${rel} at q${quality}`);
  let b64 = "";
  for (let i = 0; i < len; i += CHUNK) b64 += await C.ev(`window.__b64.slice(${i},${i + CHUNK})`);
  if (b64.length !== len) throw new Error(`truncated transfer on ${rel}: ${b64.length} of ${len}`);
  const buf = Buffer.from(b64, "base64");
  /* RIFF....WEBP. `toDataURL` falls back to PNG in silence for a type the browser cannot encode,
     which would make every "saving" here a re-encoded PNG wearing the wrong extension. */
  if (buf.slice(0, 4).toString("ascii") !== "RIFF" || buf.slice(8, 12).toString("ascii") !== "WEBP")
    throw new Error(`not a WebP for ${rel} — magic ${JSON.stringify(buf.slice(0, 12).toString("ascii"))}`);
  await C.ev(`window.__b64=null`);
  return buf;
}

/* THE CANDIDATE IS DECODED BACK AND COMPARED AGAINST THE SOURCE PIXELS STILL SITTING ON THE PAGE.
   Writing it to disk first and comparing files would work too, and would also mean a refused file
   had already been written — this way nothing touches the tree until it has passed. */
async function fidelity(buf, w, h) {
  const dataUrl = `data:image/webp;base64,${buf.toString("base64")}`;
  const out = await C.ev(`(async()=>{
    const img=new Image(); img.src=${JSON.stringify(dataUrl)}; await img.decode();
    if(img.naturalWidth!==${w}||img.naturalHeight!==${h})
      return JSON.stringify({sizeMismatch:[img.naturalWidth,img.naturalHeight]});
    const c=document.createElement("canvas"); c.width=${w}; c.height=${h};
    const x=c.getContext("2d"); x.clearRect(0,0,c.width,c.height); x.drawImage(img,0,0);
    const b=x.getImageData(0,0,${w},${h}).data, a=window.__src;
    let aMax=0, sum=0, max=0, n=0, cut=0, oSum=0, oMax=0, oN=0;
    for(let i=0;i<a.length;i+=4){
      const da=Math.abs(a[i+3]-b[i+3]); if(da>aMax)aMax=da;
      if(a[i+3]===0){cut++;continue;}            // invisible: its RGB is undefined, comparing it is noise
      const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));
      sum+=d; if(d>max)max=d; n++;
      /* AND AGAIN OVER THE SOLID PART ONLY. A pixel at alpha 1/255 is a hair of a feathered edge:
         the canvas premultiplies, so its colour is stored with almost no precision and a large
         difference there is arithmetic, not something a player can see. Reporting only the
         all-visible mean would let feather noise masquerade as damage to the picture — and
         reporting only the solid mean would hide real edge damage. Both, always. */
      if(a[i+3]>=250){ oSum+=d; if(d>oMax)oMax=d; oN++; }
    }
    return JSON.stringify({aMax,mean:n?sum/n:0,max,visible:n,transparent:cut,
                           oMean:oN?oSum/oN:0,oMax,opaque:oN});
  })()`);
  return JSON.parse(out);
}

const rows = [];
for (const rel of files) {
  const before = fs.statSync(path.join(REPO, rel)).size;
  let r;
  try {
    const dim = await draw(rel);
    const lossy = await encodeArm(rel, QUALITY);
    const lossless = await encodeArm(rel, 1);
    const arm = lossless.length <= lossy.length ? "lossless" : `q${QUALITY}`;
    const buf = arm === "lossless" ? lossless : lossy;
    const fid = await fidelity(buf, dim.w, dim.h);
    r = { rel, before, after: buf.length, arm, lossy: lossy.length, lossless: lossless.length, ...dim, buf, ...fid };
  } catch (e) {
    r = { rel, before, error: String(e.message || e) };
  }
  /* THE REFUSALS, in the order a reader should think about them. */
  if (r.error) r.verdict = `ERROR — ${r.error}`;
  else if (r.sizeMismatch) r.verdict = `REFUSED — re-decoded at ${r.sizeMismatch.join("x")}, not ${r.w}x${r.h}`;
  else if (r.aMax > 0) r.verdict = `REFUSED — alpha moved by ${r.aMax}/255; the cut-out would change`;
  else if (r.after >= r.before) r.verdict = `REFUSED — WebP is ${kb(r.after)}, heavier than the PNG's ${kb(r.before)}`;
  else if (1 - r.after / r.before < FLOOR)
    r.verdict = `REFUSED — only ${(100 * (1 - r.after / r.before)).toFixed(0)}% lighter, under the ${(100 * FLOOR).toFixed(0)}% floor`;
  else r.verdict = "OK";
  rows.push(r);
  const pct = r.after ? `${(100 * (1 - r.after / r.before)).toFixed(0)}% lighter` : "";
  console.log(
    `${r.verdict === "OK" ? "  ok " : "  ** "}${r.rel.padEnd(44)} ${kb(r.before).padStart(7)} -> ${
      r.after ? kb(r.after).padStart(7) : "     -"
    }  ${pct.padStart(11)}  ${
      r.verdict === "OK"
        ? `${r.arm.padEnd(8)} alpha ${r.aMax}  solid ${r.oMean.toFixed(2)}  edges+solid ${r.mean.toFixed(2)}`
        : r.verdict
    }`,
  );
}

const ok = rows.filter((r) => r.verdict === "OK");
const refused = rows.filter((r) => r.verdict !== "OK");
const afterTotal = ok.reduce((s, r) => s + r.after, 0) + refused.reduce((s, r) => s + r.before, 0);

console.log(`\n${ok.length} converted, ${refused.length} left as PNG`);
console.log(`  ${mb(beforeTotal)} MB  ->  ${mb(afterTotal)} MB   (${(100 * (1 - afterTotal / beforeTotal)).toFixed(0)}% lighter)`);
/* THE EXACT BYTES, AND THE WHOLE-LIBRARY FIGURE THEY IMPLY. `package.json`'s `assets.ceilingBytes`
   is a BYTE number and this run is the only thing that knows what it is about to become — printing
   MB alone is what made ratcheting that ceiling a hand-count, which is how it drifted before. */
const weighAll = (dir) => {
  let s = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    s += e.isDirectory() ? weighAll(p) : fs.statSync(p).size;
  }
  return s;
};
const libNow = weighAll(ASSETS);
console.log(`  exact: ${beforeTotal.toLocaleString()} -> ${afterTotal.toLocaleString()} bytes  (saves ${(beforeTotal - afterTotal).toLocaleString()})`);
console.log(`  assets/ as a whole: ${libNow.toLocaleString()} -> ${(libNow - (beforeTotal - afterTotal)).toLocaleString()} bytes`);
console.log(`  that second number is what package.json's assets.ceilingBytes should become.`);
if (refused.length) {
  console.log(`\n  LEFT ALONE, and each for a stated reason — this is the tool working, not failing:`);
  for (const r of refused) console.log(`    ${r.rel}  —  ${r.verdict}`);
}
const worst = ok.slice().sort((a, b) => b.oMean - a.oMean).slice(0, 5);
if (worst.length) {
  console.log(`\n  the files whose COLOUR moved most where the art is SOLID — photograph these,`);
  console.log(`  not ones you picked:`);
  for (const r of worst)
    console.log(
      `    ${r.rel}   solid mean ${r.oMean.toFixed(2)}/255, worst solid pixel ${r.oMax}` +
        `   (${((100 * r.opaque) / (r.visible + r.transparent)).toFixed(0)}% of the file is solid)`,
    );
}

if (DRY) {
  console.log("\nDRY — nothing written.");
} else {
  for (const r of ok) {
    fs.writeFileSync(path.join(REPO, r.rel.replace(/\.png$/i, ".webp")), r.buf);
    fs.rmSync(path.join(REPO, r.rel), { force: true });
  }
  console.log(`\nwrote ${ok.length} .webp file(s) and removed their .png sources.`);
  console.log(`NEXT, and the run is not finished without it: every reference to a converted path has`);
  console.log(`to move too — src/shared/index.js, src/ui/{board,stage,util}.js, index.html, and`);
  console.log(`classic/ which reads this same assets/ folder. node scripts/qa/asset_paths_exist_check.mjs`);
}
killAll();
