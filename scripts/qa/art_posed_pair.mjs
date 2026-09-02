/* THE POSED PAIR FOR ANY PIECE OF ART — the same picture, before and after, at magnification.
 *
 *   node scripts/qa/art_posed_pair.mjs --tag=png-webp --scale=3 \
 *        assets/icons/hourglass.png assets/compass/compass-dial.png ...
 *   --before=<git ref>   where to recover the originals from (default HEAD)
 *
 * CLAUDE.md rule 26: when the question is a picture, photograph it — do not go looking for a rate,
 * and do not settle it with a mean-error number. `png_family_reexport.mjs` says
 * `icons/hourglass` moved 13.17/255 where the islands moved 3. **That number cannot tell you
 * whether a person would see it.** This can.
 *
 * ⚠ THE ORIGINALS ARE ALREADY GONE by the time this matters — the conversion deletes each `.png`
 * as it writes its `.webp`, so a pair made from the working tree could be made exactly once and
 * never audited (CEO 97's finding on the board: evidence nobody else can reproduce is testimony).
 * So the "before" side is recovered from git by content hash, through `git show`, and the ref is
 * printed on the sheet. Anybody can re-run this months later and get the same image.
 *
 * WHY A SHEET AND NOT A GAME SCREENSHOT. Both, and they answer different questions.
 * `asset_posed_pair.mjs` photographs a running voyage, which proves the files decode and draw where
 * they belong — but at voyage zoom every one of these is a few dozen screen pixels and any encoder
 * artefact is destroyed by the downsample before the camera sees it. A check that cannot fail is
 * not a check (rule 6). This sheet is the half that CAN fail: nearest-neighbour magnification, so
 * what you are looking at is the stored pixels and not the browser's smoothing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split("=").slice(1).join("=");
const TAG = arg("tag", "art");
const SCALE = Number(arg("scale", 3));
const REF = arg("before", "HEAD");
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!targets.length) {
  console.error("usage: node scripts/qa/art_posed_pair.mjs [--tag=] [--scale=] [--before=<ref>] <assets/…png> …");
  process.exit(2);
}

const OUTDIR = path.join(REPO, ".planning", "posed");
fs.mkdirSync(OUTDIR, { recursive: true });
const SCRATCH = path.join(OUTDIR, `_${TAG}-before`);
fs.mkdirSync(SCRATCH, { recursive: true });

/* `git show` writes to stdout, and this sandbox refuses shell redirection — so the bytes come back
   through execFileSync's buffer and node writes the file. Same result, no shell. */
const pairs = [];
for (const rel of targets) {
  const key = rel.replace(/[\\/]/g, "_");
  const beforeAbs = path.join(SCRATCH, key);
  try {
    const buf = execFileSync("git", ["show", `${REF}:${rel.replace(/\\/g, "/")}`], { cwd: REPO, maxBuffer: 64 << 20 });
    fs.writeFileSync(beforeAbs, buf);
  } catch (e) {
    console.error(`FAIL — cannot recover ${rel} from ${REF}: ${String(e.message).split("\n")[0]}`);
    process.exit(1);
  }
  const afterRel = rel.replace(/\.png$/i, ".webp");
  const afterAbs = path.join(REPO, afterRel);
  if (!fs.existsSync(afterAbs)) {
    console.error(`FAIL — ${afterRel} is not on disk. Nothing to compare the original against.`);
    process.exit(1);
  }
  pairs.push({
    rel,
    afterRel,
    beforeUrl: "/" + path.relative(REPO, beforeAbs).replace(/\\/g, "/"),
    afterUrl: "/" + afterRel,
    beforeBytes: fs.statSync(beforeAbs).size,
    afterBytes: fs.statSync(afterAbs).size,
  });
}

const PORT = 8494, DBG = 9394;
const url = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-art-posed"));
const C = await attach(DBG);
/* ⚠ NOT THE GAME'S OWN URL — a plain directory listing on the same origin. The first version of
   this navigated to `/`, which BOOTS THE GAME, and then replaced document.body with the sheet.
   The game's clock timer kept running, found its element gone, and painted its own "The voyage has
   run aground" error card across the bottom of the posed pair: `TypeError: Cannot read properties
   of null (reading 'style') at setClockUI (src/ui/panel.js:130)`. Nothing was wrong with the game
   — the harness had demolished the house around it. A screenshot carrying a crash card that the
   screenshot itself caused is exactly the kind of evidence that starts a two-day hunt (rule 6:
   when a check condemns something known to work, suspect the check). Same origin is all this
   needs, so it asks for a page with no scripts on it. */
const listing = url.replace(/\/?$/, "/") + "scripts/qa/";
await C.ev(`location.href=${JSON.stringify(listing)}`).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));

/* image-rendering: pixelated — otherwise the browser's own smoothing is what you photograph, and a
   soft resample flatters every lossy encoder ever made. */
const html = `
<style>
  body{margin:0;background:#12161c;color:#e8eef6;font:14px/1.4 system-ui,sans-serif;padding:18px}
  h1{font-size:16px;margin:0 0 4px} .sub{opacity:.65;font-size:12px;margin-bottom:14px}
  .row{display:flex;gap:14px;align-items:flex-start;margin-bottom:20px}
  .cell{background:
      linear-gradient(45deg,#333 25%,transparent 25%,transparent 75%,#333 75%),
      linear-gradient(45deg,#333 25%,#242a33 25%,#242a33 75%,#333 75%);
      background-size:16px 16px;background-position:0 0,8px 8px;padding:6px;border-radius:6px}
  .cell img{image-rendering:pixelated;display:block}
  .cap{font-size:12px;opacity:.8;margin-bottom:4px}
  .name{font-size:13px;font-weight:600;margin-bottom:6px}
</style>
<h1>Same pixels, new format — before and after at ${SCALE}x, nearest-neighbour</h1>
<div class="sub">"before" recovered from git <b>${REF}</b> · chequerboard shows through wherever the art is transparent, so a lost cut-out would be a solid block</div>
${pairs
  .map(
    (p) => `<div class="name">${p.rel} → ${p.afterRel} &nbsp; ${(p.beforeBytes / 1024).toFixed(0)} KB → ${(
      p.afterBytes / 1024
    ).toFixed(0)} KB</div>
  <div class="row">
    <div><div class="cap">BEFORE (png)</div><div class="cell"><img data-src="${p.beforeUrl}"></div></div>
    <div><div class="cap">AFTER (webp)</div><div class="cell"><img data-src="${p.afterUrl}"></div></div>
  </div>`,
  )
  .join("")}
`;

const ready = await C.ev(`(async()=>{
  document.body.innerHTML=${JSON.stringify(html)};
  const imgs=[...document.querySelectorAll("img[data-src]")];
  for(const el of imgs){
    const i=new Image(); i.src=el.dataset.src; await i.decode();
    el.src=el.dataset.src;
    el.width=i.naturalWidth*${SCALE}; el.height=i.naturalHeight*${SCALE};
  }
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return JSON.stringify({n:imgs.length,h:document.body.scrollHeight,w:document.body.scrollWidth});
})()`);
const dim = JSON.parse(ready);
/* A SHEET WITH NO IMAGES ON IT WOULD SCREENSHOT PERFECTLY WELL AND PROVE NOTHING. */
if (dim.n !== pairs.length * 2) {
  console.error(`FAIL — ${dim.n} images on the sheet, expected ${pairs.length * 2}.`);
  killAll();
  process.exit(1);
}

/* The whole sheet, not the fold — the viewport is grown to the document so the capture is one
   image rather than the first screenful of one. */
/* The cap is wide enough for two full-size cells side by side at 3x on the biggest art here
   (512px source -> 1536 each). It was 2400 for one run and silently CROPPED THE "AFTER" COLUMN
   OFF THE RIGHT — a posed pair with the after half missing, which would have looked like a
   perfectly good screenshot. */
const W = Math.min(dim.w + 40, 5200), H = Math.min(dim.h + 40, 16000);
await C.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await new Promise((r) => setTimeout(r, 400));
const cap = await C.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const data = cap.result?.data;
if (!data) {
  console.error("FAIL — the browser returned no screenshot.");
  killAll();
  process.exit(1);
}
const out = path.join(OUTDIR, `${TAG}-${SCALE}x.png`);
fs.writeFileSync(out, Buffer.from(data, "base64"));
killAll();
console.log(`wrote ${path.relative(REPO, out)}  —  ${pairs.length} pair(s) at ${SCALE}x, ${dim.w}x${dim.h}`);
for (const p of pairs)
  console.log(`  ${p.rel.padEnd(38)} ${(p.beforeBytes / 1024).toFixed(0).padStart(4)} KB -> ${(p.afterBytes / 1024).toFixed(0).padStart(4)} KB`);
