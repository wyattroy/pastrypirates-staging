/* THE POSED PAIR FOR THE PUBLIC ABOUT PAGE — the same page, before and after, side by side.
 *
 *   node scripts/qa/about_posed_pair.mjs --tag=t114 --width=430 --before=HEAD
 *
 * CLAUDE.md rule 26: when the question is a picture, photograph it. And rule 19: look at the
 * RENDERED page before handing a change over — not the DOM, not a gate's PASS line.
 *
 * BUILT FOR T-114 (Wyatt's ruling, 2026-09-02T22:50:32Z: delete about.html's "How it plays"),
 * and deliberately written to outlive it: about.html is a public page nobody ever photographs,
 * and his ruling 1 of 4 puts a NEW /rules.html beside it. The next change to either wants this.
 *
 * ⚠ WHY THE "BEFORE" IS RECOVERED TO THE REPO ROOT AND NOT TO A SCRATCH FOLDER. about.html loads
 * its art with RELATIVE paths (assets/…). Served from any other directory every one of those 404s,
 * and the "before" half of the pair comes out as a column of broken-image icons — which would look
 * like the deletion had removed the art rather than the words. The root is the only place the old
 * page renders as it actually rendered. `.tmp-*` is gitignored (see .gitignore:130), so the
 * recovered copy cannot be committed by this session or absorbed by a peer's `git add -A`.
 *
 * ⚠ AND IT IS NOT THE GAME'S URL. Navigating to `/` boots the game, whose clock timer then paints
 * a crash card over whatever the harness put on the page — the trap art_posed_pair.mjs documents
 * at :80. This only ever loads about.html and the recovered copy, neither of which boots the game.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split("=").slice(1).join("=");
const TAG = arg("tag", "about");
const REF = arg("before", "HEAD");
const WIDTH = Number(arg("width", 430));

const OUTDIR = path.join(REPO, ".planning", "posed");
fs.mkdirSync(OUTDIR, { recursive: true });

/* `git show` writes to stdout and this sandbox refuses shell redirection, so the bytes come back
   through execFileSync's buffer and node writes the file — same trick as art_posed_pair.mjs:48. */
const BEFORE_REL = `.tmp-${TAG}-before.html`;
const beforeAbs = path.join(REPO, BEFORE_REL);
try {
  fs.writeFileSync(beforeAbs, execFileSync("git", ["show", `${REF}:about.html`], { cwd: REPO, maxBuffer: 64 << 20 }));
} catch (e) {
  console.error(`FAIL — cannot recover about.html from ${REF}: ${String(e.message).split("\n")[0]}`);
  process.exit(1);
}

/* THE PAIR MUST BE OF TWO DIFFERENT PAGES. If the working tree still matches the ref, this would
   photograph the same page twice and print a perfectly convincing "posed pair" showing no change
   — evidence that cannot fail, which is not evidence (rule 6). */
if (fs.readFileSync(beforeAbs, "utf8") === fs.readFileSync(path.join(REPO, "about.html"), "utf8")) {
  console.error(`FAIL — about.html is identical to ${REF}. There is nothing to compare; a pair here would show two copies of one page.`);
  fs.rmSync(beforeAbs, { force: true });
  process.exit(1);
}

const PORT = 8497, DBG = 9397;
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-${TAG}-posed`));
const C = await attach(DBG);

async function shoot(pageUrl, label) {
  await C.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 900, deviceScaleFactor: 2, mobile: WIDTH < 700 });
  await C.ev(`location.href=${JSON.stringify(pageUrl)}`).catch(() => {});
  /* Wait for the real page, not for a timer: every <img> decoded, or we photograph a half-painted
     page and read its gaps as layout. */
  const info = await C.ev(`(async()=>{
    for (let i=0;i<80 && document.readyState!=="complete"; i++) await new Promise(r=>setTimeout(r,100));
    const imgs=[...document.images];
    await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return JSON.stringify({
      h: document.body.scrollHeight,
      imgs: imgs.length,
      broken: imgs.filter(i=>!i.naturalWidth).length,
      h2: [...document.querySelectorAll("h2")].map(e=>e.textContent.trim()),
    });
  })()`);
  const d = JSON.parse(info);
  await C.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: Math.min(d.h + 20, 16000), deviceScaleFactor: 2, mobile: WIDTH < 700 });
  await new Promise((r) => setTimeout(r, 350));
  const cap = await C.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (!cap.result?.data) { console.error(`FAIL — the browser returned no screenshot for ${label}.`); killAll(); process.exit(1); }
  const out = path.join(OUTDIR, `${TAG}-about-${label}-${WIDTH}w.png`);
  fs.writeFileSync(out, Buffer.from(cap.result.data, "base64"));
  console.log(`  ${label.padEnd(6)} ${path.relative(REPO, out)}  ${d.h}px tall · ${d.imgs} images (${d.broken} broken)`);
  console.log(`         sections: ${d.h2.join(" | ") || "(none)"}`);
  return d;
}

console.log(`posed pair for about.html — before=${REF}, ${WIDTH}px wide`);
const before = await shoot(url.replace(/\/?$/, "/") + BEFORE_REL, "before");
const after = await shoot(url.replace(/\/?$/, "/") + "about.html", "after");
killAll();
fs.rmSync(beforeAbs, { force: true });

console.log(`\nsections removed: ${before.h2.filter((s) => !after.h2.includes(s)).join(", ") || "(none)"}`);
console.log(`sections kept:    ${after.h2.join(", ")}`);
console.log(`page height:      ${before.h}px -> ${after.h}px`);
if (after.broken) console.log(`\n⚠ ${after.broken} broken image(s) on the AFTER page — look before believing the pair.`);
