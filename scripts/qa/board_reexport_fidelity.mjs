/* DOES THE RE-ENCODED BOARD STILL LOOK LIKE THE BOARD? Pixel by pixel, both decoded at full size.
 *
 *   node scripts/qa/board_reexport_fidelity.mjs <candidate.webp>
 *
 * WHY THIS EXISTS. The first dry run of `board_reexport.mjs` reported the board going from 4.24 MB
 * to 0.19 MB at q0.92 — 95% lighter, and about six times better than the prediction written before
 * it. CLAUDE.md rule 6: when a measurement condemns or flatters something beyond what you expected,
 * suspect the instrument first. A blank canvas also encodes very small.
 *
 * The blank-canvas theory was already ruled out by the same run — the LOSSLESS encode of the same
 * canvas came back at 3.14 MB, which no empty image produces — so the pixels are demonstrably
 * there. What that does NOT settle is whether they are the RIGHT pixels once the lossy encoder has
 * had them, and no byte count can answer that. This decodes both files at their own full size and
 * compares them channel by channel, which can.
 *
 * WHAT IT REPORTS, and the distinction matters: MEAN absolute difference says how the picture reads
 * overall; MAX says whether any single pixel moved a lot; and the share of pixels past a
 * just-noticeable threshold says whether a person would see it. A high max on a handful of pixels
 * is a sharp edge being re-drawn. A high mean is the whole picture shifting, and that is the one
 * that would show as banding in the sea.
 *
 * This is a MEASUREMENT, not the verdict. The verdict is the posed pair — the board on screen,
 * before and after, at the zoom a player actually reaches (rule 26).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cand = process.argv[2];
if (!cand) {
  console.error("usage: node scripts/qa/board_reexport_fidelity.mjs <candidate file under the repo>");
  process.exit(2);
}
/* `--before=` for the same reason as the posed pair: once the swap lands, `assets/board.png` no
   longer exists and this comparison could never be repeated by anybody checking the numbers.
   CEO 97's finding. Recover the original with
       git show <pre-swap-commit>:assets/board.png > .planning/posed/board-before.png   */
const A = "/" + (process.argv.find((a) => a.startsWith("--before=")) || "--before=assets/board.png").slice(9);
const B = "/" + path.relative(REPO, path.resolve(cand)).replace(/\\/g, "/");
if (!fs.existsSync(path.join(REPO, A.slice(1)))) {
  console.error(`FAIL — ${A.slice(1)} is not here, so there is nothing to compare against.`);
  console.error("       Recover it:  git show <pre-swap-commit>:assets/board.png > .planning/posed/board-before.png");
  console.error("       then pass --before=.planning/posed/board-before.png");
  process.exit(2);
}

const PORT = 8496, DBG = 9396;
const url = serve(PORT);
launch(DBG, path.join(REPO, ".tmp-board-fidelity"));
const C = await attach(DBG);
await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

const out = await C.ev(`(async()=>{
  const load=async(u)=>{const i=new Image();i.src=u;await i.decode();
    const c=document.createElement("canvas");c.width=i.naturalWidth;c.height=i.naturalHeight;
    c.getContext("2d").drawImage(i,0,0);
    return {w:c.width,h:c.height,d:c.getContext("2d").getImageData(0,0,c.width,c.height).data};};
  const a=await load(${JSON.stringify(A)}), b=await load(${JSON.stringify(B)});
  if(a.w!==b.w||a.h!==b.h) return JSON.stringify({sizeMismatch:[a.w,a.h,b.w,b.h]});
  let sum=0,max=0,over2=0,over8=0,over16=0,n=0;
  // WHERE the damage is, not just how much. The image is divided into TILE-sized squares and each
  // one's own mean is tracked, so the posed pair can photograph the WORST place rather than a place
  // somebody picked — a crop chosen by hand lands on open sea and flatters any encoder.
  const TILE=${JSON.stringify(Number(process.env.PP_TILE || 420))};
  const cols=Math.ceil(a.w/TILE), rows=Math.ceil(a.h/TILE);
  const tSum=new Float64Array(cols*rows), tN=new Float64Array(cols*rows);
  for(let i=0,px=0;i<a.d.length;i+=4,px++){
    // Per-pixel worst channel, RGB only — alpha is uniformly opaque on this file and would only
    // dilute the average with zeros.
    const dr=Math.abs(a.d[i]-b.d[i]), dg=Math.abs(a.d[i+1]-b.d[i+1]), db=Math.abs(a.d[i+2]-b.d[i+2]);
    const d=Math.max(dr,dg,db);
    sum+=d; if(d>max)max=d; if(d>2)over2++; if(d>8)over8++; if(d>16)over16++; n++;
    const t=((px/a.w|0)/TILE|0)*cols + ((px%a.w)/TILE|0);
    tSum[t]+=d; tN[t]++;
  }
  const tiles=[...tSum].map((s,i)=>({x:(i%cols)*TILE,y:((i/cols)|0)*TILE,mean:s/(tN[i]||1)}))
                       .sort((p,q)=>q.mean-p.mean).slice(0,4);
  return JSON.stringify({w:a.w,h:a.h,n,mean:sum/n,max,over2,over8,over16,tile:TILE,tiles});
})()`);
killAll();

const r = JSON.parse(out);
if (r.sizeMismatch) {
  console.error(`FAIL — the two images are different sizes: ${r.sizeMismatch[0]}x${r.sizeMismatch[1]} vs ${r.sizeMismatch[2]}x${r.sizeMismatch[3]}. The board must not be resized.`);
  process.exit(1);
}
const pct = (k) => `${((100 * k) / r.n).toFixed(2)}%`;
console.log(`${A}  vs  ${B}`);
console.log(`  both ${r.w}x${r.h}, ${r.n.toLocaleString()} pixels compared`);
console.log(`  mean difference   ${r.mean.toFixed(2)} / 255`);
console.log(`  worst pixel       ${r.max} / 255`);
console.log(`  off by more than  2: ${pct(r.over2)}   8: ${pct(r.over8)}   16: ${pct(r.over16)}`);
console.log(`\n  the ${r.tile}px squares that changed MOST — photograph these, not a crop you chose:`);
for (const t of r.tiles) console.log(`    { x: ${t.x}, y: ${t.y} }   mean ${t.mean.toFixed(2)}`);
