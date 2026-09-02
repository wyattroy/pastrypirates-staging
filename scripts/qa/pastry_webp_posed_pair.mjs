/* THE POSED PAIR FOR THE PASTRY FORMAT QUESTION — rule 26, and the only thing that can settle it.
 *
 *   node scripts/qa/pastry_reexport.mjs --dry     first: get the byte numbers
 *   node scripts/qa/pastry_webp_posed_pair.mjs    then: the same modal, PNG and WebP, side by side
 *
 * WHY THIS EXISTS. `.planning/ASSET-DISPLAY-SIZES.md` measured every pastry at the recipe modal
 * and found them all UNDER-resolution (x0.58-0.74 on a phone), so Wyatt's resize ask cannot take a
 * single pixel off this family. The bytes can only come from the FORMAT — WebP q0.92 measured at
 * 1.71 MB -> 1.18 MB with the pixels untouched.
 *
 * BUT THAT IS A LOSSY RE-ENCODE OF COMMISSIONED ART, AND ART QUALITY IS HIS CALL, NOT A SESSION'S.
 * So this script does not ship anything. It poses the same recipe in the same modal at the phone
 * size he plays on, photographs it twice — the shipped PNG, then the WebP in the same slot — and
 * leaves him two pictures to rule on. Same seed, same board, same prompt, one variable.
 *
 * It writes:
 *   .planning/posed/pastry-png-phone.png     what ships today
 *   .planning/posed/pastry-webp-phone.png    the same slot, WebP q0.92
 * and the scratch WebP files under .tmp-pastry-webp/ (gitignored, regenerable).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(ROOT, ".planning", "posed");
const SCRATCH = path.join(ROOT, ".tmp-pastry-webp");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

// The one photographed at every earlier step of this item, so the pair is comparable to what is
// already on file. Its slot is 268x220 CSS -> 805 device px on the phone; it ships 512 wide.
const SUBJECT = "21-chocolate-fudge-torte";
const RECIPE_INDEX = 20;                       // RECIPE_BOOK is 1:1 with PASTRY_FILES (recipe.js:317)
const QUALITY = 0.92;

const t = await openChrome({
  W: 390, H: 844, dbgPort: 9431, httpPort: 9432, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-pastrypose"), dsf: 3, mobile: true,
});
try {
  const base = `http://127.0.0.1:9432`;
  await t.nav(`${base}/index.html`);
  await sleep(1500);
  await t.ev("localStorage.clear()");
  await t.nav(`${base}/index.html`);
  await sleep(2500);

  // Encode the subject to WebP in the page, from the shipped PNG's own pixels — no resize, so the
  // ONLY variable between the two pictures is the codec.
  const b64 = await t.ev(`(async()=>{
    const img=new Image(); img.src='/assets/pastries/${SUBJECT}.png'; await img.decode();
    const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
    c.getContext('2d').drawImage(img,0,0);
    return c.toDataURL('image/webp',${QUALITY}).split(',')[1];
  })()`);
  if (typeof b64 !== "string" || b64.length < 1000) throw new Error("the browser returned no WebP");
  fs.writeFileSync(path.join(SCRATCH, `${SUBJECT}.webp`), Buffer.from(b64, "base64"));

  // Start a solo game so the modal opens over the real board, then open it through the game's own
  // function — the same one the CAPTAINS row calls (recipe.js:433). ONE DISPLAY PATH.
  await t.ev(`document.getElementById('choiceSolo').click()`);
  for (let i = 0; i < 40; i++) {
    if (await t.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
    await sleep(250);
  }
  await t.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await t.ev(`document.getElementById('btnNameConfirm').click()`);
  for (let i = 0; i < 80; i++) {
    if (await t.ev(`(()=>{try{return !!(appState.game&&appState.game.players.some(p=>p.strategy==='human'))}catch(e){return false}})()`) === true) break;
    await sleep(300);
  }
  await sleep(2500);

  const opened = await t.ev(`(async()=>{
    const m=await import('/src/ui/recipe.js');
    m.openRecipeModal(m.RECIPE_BOOK[${RECIPE_INDEX}].ings);
    const im=document.querySelector('.recipeModalThumb');
    if(!im) return 'no thumb';
    const r=im.getBoundingClientRect();
    return r.width>0 ? JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),src:im.getAttribute('src')}) : 'zero-width';
  })()`);
  if (typeof opened !== "string" || opened[0] !== "{") throw new Error(`modal did not open: ${opened}`);
  console.log(`modal slot: ${opened}`);
  await sleep(500);
  await t.shot(path.join(OUT, "pastry-png-phone.png"));

  // SWAP ONLY THE CODEC. Same element, same box, same page — so a difference in the two pictures
  // can only be the encoding.
  const swapped = await t.ev(`(async()=>{
    const im=document.querySelector('.recipeModalThumb');
    im.src='/.tmp-pastry-webp/${SUBJECT}.webp';
    await im.decode();
    return im.naturalWidth+'x'+im.naturalHeight;
  })()`);
  console.log(`webp decoded at: ${swapped}`);
  await sleep(400);
  await t.shot(path.join(OUT, "pastry-webp-phone.png"));

  const png = fs.statSync(path.join(ROOT, "assets", "pastries", `${SUBJECT}.png`)).size;
  const webp = fs.statSync(path.join(SCRATCH, `${SUBJECT}.webp`)).size;
  console.log(`\n${SUBJECT}:  PNG ${(png / 1024).toFixed(0)}KB  ->  WebP ${(webp / 1024).toFixed(0)}KB  ` +
    `(${(100 * (1 - webp / png)).toFixed(0)}% lighter, identical pixel dimensions)`);
  console.log(`wrote ${path.relative(ROOT, OUT)}/pastry-png-phone.png and pastry-webp-phone.png`);
} finally {
  await t.close();
}
