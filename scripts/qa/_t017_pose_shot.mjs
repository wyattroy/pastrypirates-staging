/* SCRATCH — delete when T-017 lands. POSE THE FAN AND PHOTOGRAPH IT (rules 19 and 26).
   Three theories have now been argued about why "Walk away" measures as overflowing while Wyatt's
   screenshot shows it fitting. Stop arguing and look: this poses the same petals the fit check
   poses, lets the game take them radial, and writes a PNG. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8535, DBG = 9438;
const OUT = process.argv[2] || path.resolve(".planning/posed/t017-before.png");
const NAMES = ["Davy Scones", "Crustbeard", "Dough Hook", "Flaky Jack"];

const url = serve(PORT);
launch(DBG, "/tmp/chrome-t017shot");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true });

await C.ev(`location.href=${JSON.stringify(url)}`); await sleep(2500);
await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`); await sleep(2500);
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);
await sleep(2500);

await C.ev(`(()=>{
  const p=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
  delete ap.dataset.pp4Stage;
  for(const n of ap.querySelectorAll('.bko,.btlBtn,.recipeList,select')) n.remove();
  let row=ap.querySelector('.apBtns');
  if(!row){row=document.createElement('div');row.className='apBtns';ap.appendChild(row);}
  row.innerHTML='';
  const mk=(html,tag)=>{const b=document.createElement('button');b.className='apBtn';
    b.innerHTML=html;b._shortHtml=html;b.dataset.t017=tag;row.appendChild(b);return b;};
  for(const n of ${JSON.stringify(NAMES)})
    mk('<b style="color:#c33">'+n+'</b><br><img src="assets/ingredients/sugar.png">+3🌕','name');
  mk('Walk away','control');
  return "posed";})()`);

for (let i = 0; i < 24; i++) {                       // bounded, rule 17
  if (await C.ev(`(()=>{const p=document.getElementById('pp4Prompt');return !!(p&&p.classList.contains('radial'))})()`) === true) break;
  await sleep(250);
}
await sleep(1200);

/* WHAT THE BROWSER SAYS ABOUT WRAPPING, beside the picture — so the picture is not read alone. */
console.log(await C.ev(`(()=>{const out=[];
  for(const b of document.querySelectorAll('.apBtn[data-t017]')){
    const cs=getComputedStyle(b), br=b.getBoundingClientRect();
    const first=[...b.childNodes].find(n=>n.textContent&&n.textContent.trim());
    let rects=[];
    if(first){const r=document.createRange();r.selectNodeContents(first);
      rects=[...r.getClientRects()].map(x=>({w:+x.width.toFixed(1),l:+(x.left-br.left).toFixed(1)}));}
    out.push({t:b.dataset.t017,text:first?first.textContent.trim():'',
      btn:+br.width.toFixed(1), ws:cs.whiteSpace, lines:rects.length, rects});
  } return JSON.stringify(out,null,1);})()`));

/* C.send resolves with the whole CDP message, so the payload is under .result — not the top level. */
const shot = await C.send("Page.captureScreenshot", { format: "png" });
const data = shot?.result?.data;
if (!data) { console.log("NO SCREENSHOT — CDP said:", JSON.stringify(shot).slice(0, 300)); killAll(); process.exit(2); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(data, "base64"));
console.log("\nwrote", OUT);
killAll();
