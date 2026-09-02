/* THE POSED PAIR FOR THE BOARD — the same square inch of art, before and after, at the size a
 * player's screen actually asks for it.
 *
 *   node scripts/qa/board_posed_detail.mjs <candidate.webp>
 *
 * ⚠ WHY NOT JUST USE `asset_posed_pair.mjs`. That script photographs the board inside a running
 * game, and at the zoom a voyage opens at the whole 2132px board is squeezed into a few hundred
 * screen pixels. EVERY artefact a lossy encoder could introduce is destroyed by that downsample
 * before the camera sees it. A pair taken there would come back identical no matter how bad the
 * conversion was — a check that cannot fail (rule 6). It is still worth running, because it proves
 * the file decodes and draws in the real game; it just cannot answer THIS question.
 *
 * WHERE THE ART IS ACTUALLY EXPOSED, measured not guessed: `.planning/ASSET-DISPLAY-SIZES.md:22`
 * puts the board's maximum at 2168x2168 DEVICE pixels — tablet, maximum zoom — against a 2132px
 * file. So at full zoom a player is looking at this art essentially 1:1. That is the pose.
 *
 * This draws both files at 1:1 into one image, the original on top and the candidate directly under
 * it, with a label strip, on four crops chosen to cover the different things the encoder finds hard:
 * open sea (smooth gradient — where banding would show), a coastline (hard edge), the compass rose
 * (fine line work and lettering), and the busiest corner of the map.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cand = process.argv[2];
if (!cand) { console.error("usage: node scripts/qa/board_posed_detail.mjs <candidate file under the repo>"); process.exit(2); }
const B = "/" + path.relative(REPO, path.resolve(cand)).replace(/\\/g, "/");
const OUTDIR = path.join(REPO, ".planning", "posed");
fs.mkdirSync(OUTDIR, { recursive: true });

/* THE ORIGINAL IS GONE THE MOMENT THE SWAP LANDS, so this pair could be made exactly once and never
   audited — CEO 97's finding, and it is fair: evidence nobody else can reproduce is testimony.
   `--before=` names any file to compare against, and the original is one command away:
       git show <commit-before-the-swap>:assets/board.png > .planning/posed/board-before.png
   Default stays `assets/board.png` so a pre-swap run needs no flag. */
const A = "/" + (process.argv.find((a) => a.startsWith("--before=")) || "--before=assets/board.png").slice(9);
if (!fs.existsSync(path.join(REPO, A.slice(1)))) {
  console.error(`FAIL — ${A.slice(1)} is not here, so there is nothing to compare against.`);
  console.error("       After the swap, recover it:  git show <pre-swap-commit>:assets/board.png > .planning/posed/board-before.png");
  console.error("       then pass --before=.planning/posed/board-before.png");
  process.exit(2);
}

/* THE CROPS ARE NOT CHOSEN BY HAND — pass them in from the fidelity check's own worst-tile report:
 *   node scripts/qa/board_posed_detail.mjs <cand> 0,0 1680,2100 860,860
 * A crop somebody picks lands on open sea and flatters any encoder; the first version of this
 * script did exactly that, three crops out of four. The default below is the worst tile the q0.92
 * candidate produced (mean 4.12 against a 1.65 whole-image average) plus the anchor berth, which is
 * the finest line work on the board. */
const parsed = process.argv.slice(3).filter((a) => /^\d+,\d+$/.test(a)).map((a) => {
  const [x, y] = a.split(",").map(Number);
  /* "at x,y" and NOT "worst tile x,y". The label used to assert the crop was the worst-changed tile
     whatever it was handed, so a magnified hand-picked crop carried a claim nobody had checked —
     CEO 97 caught it. A picture's caption is a behavioural claim like any other. */
  return { x, y, label: `at ${x},${y}` };
});
const CROPS = parsed.length ? parsed : [
  { x: 0, y: 0, label: "the WORST 420px square in the whole board" },
  { x: 1680, y: 1680, label: "lower right" },
  { x: 860, y: 860, label: "anchor berth (finest line work)" },
  { x: 980, y: 120, label: "open sea (banding would show here)" },
];
/* --size shrinks the crop and --zoom magnifies it with smoothing OFF, so a suspect region can be
   read at 3x without a resampler inventing anything. Needed because the worst square on this board
   turned out to be the PASTRY PIRATES title art, and white lettering on a teal cartouche is exactly
   where a lossy encoder's halved colour resolution would show as fringing — invisible at 1:1. */
const num = (n, d) => Number((process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split("=")[1]);
const S = num("size", 420), ZOOM = num("zoom", 1);

const PORT = 8495, DBG = 9395;
const url = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-board-posed"));
const C = await attach(DBG);
await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

const b64 = await C.ev(`(async()=>{
  const load=async(u)=>{const i=new Image();i.src=u;await i.decode();return i;};
  const a=await load(${JSON.stringify(A)}), b=await load(${JSON.stringify(B)});
  const crops=${JSON.stringify(CROPS)}, S=${S}, Z=${ZOOM}, D=S*Z, HDR=26;
  const c=document.createElement("canvas");
  c.width=crops.length*D; c.height=HDR+D+HDR+D;
  const x=c.getContext("2d");
  x.imageSmoothingEnabled=false;                 // magnify, never resample
  x.fillStyle="#111"; x.fillRect(0,0,c.width,c.height);
  x.font="13px system-ui,sans-serif"; x.textBaseline="middle";
  crops.forEach((cr,i)=>{
    x.drawImage(a, cr.x,cr.y,S,S, i*D, HDR, D,D);
    x.drawImage(b, cr.x,cr.y,S,S, i*D, HDR+D+HDR, D,D);
    x.fillStyle="#ffd479"; x.fillText("BEFORE  "+cr.label, i*D+8, HDR/2);
    x.fillStyle="#7fd4ff"; x.fillText("AFTER  "+cr.label, i*D+8, HDR+D+HDR/2);
    x.strokeStyle="#333"; x.strokeRect(i*D+0.5,HDR+0.5,D-1,D-1); x.strokeRect(i*D+0.5,HDR+D+HDR+0.5,D-1,D-1);
  });
  return c.toDataURL("image/png").split(",")[1];
})()`);
killAll();

const out = path.join(OUTDIR, "board-webp-detail-1to1.png");
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log(`wrote ${path.relative(REPO, out).replace(/\\/g, "/")} — four crops at 1:1, original above, candidate below`);
