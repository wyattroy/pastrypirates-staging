/* SCRATCH (T-100) — RULE 19: look at the rendered picture before handing it over.
 *
 * His instruction named this explicitly: "Screenshot the result before handing it over, and
 * screenshot the in-game modal too to prove it still works (rule 19)."
 *
 * Four pictures, and the pairing is the point — the page and the modal are supposed to be the same
 * words, so they are photographed together and can be compared side by side:
 *   1. rules.html   desktop 1280x900
 *   2. rules.html   phone   390x844
 *   3. index.html   the in-game How-to-play modal, phone 390x844 — proving it still opens and
 *                   still fills its numbers after the extraction
 *   4. about.html   the card that replaced the deleted "How it plays" section
 *
 * Full-page capture for the two static pages (captureBeyondViewport), so nothing below the fold is
 * silently missing from the evidence.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8561, DBG = 9461;
const OUTDIR = path.resolve(".planning/posed");
fs.mkdirSync(OUTDIR, { recursive: true });

const url = serve(PORT);
const origin = url.replace(/\/$/, "");
launch(DBG, "/tmp/chrome-t100shots");
const C = await attach(DBG);

async function shot(name, full) {
  const r = await C.send("Page.captureScreenshot", full ? { format: "png", captureBeyondViewport: true } : { format: "png" });
  const data = r?.result?.data;
  if (!data) { console.log(`NO SCREENSHOT for ${name} — CDP said:`, JSON.stringify(r).slice(0, 200)); return null; }
  const p = path.join(OUTDIR, name);
  fs.writeFileSync(p, Buffer.from(data, "base64"));
  console.log("wrote", p);
  return p;
}

async function go(href, w, h, mobile) {
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await C.ev(`location.href=${JSON.stringify(href)}`);
  await sleep(2200);
}

// 1 + 2 — the new page, both sizes
await go(`${origin}/rules.html`, 1280, 900, false);
console.log("rules.html desktop, title:", await C.ev(`document.title`));
await shot("t100-rules-desktop-1280.png", true);

await go(`${origin}/rules.html`, 390, 844, true);
await shot("t100-rules-phone-390.png", true);

// 3 — the in-game modal still opens and still fills its numbers
await go(`${origin}/`, 390, 844, true);
await C.ev(`try{localStorage.clear()}catch(e){}`);
await C.ev(`location.reload()`);
await sleep(2600);
const opened = await C.ev(`(()=>{const b=document.getElementById('btnShowHow'); if(!b) return 'no btnShowHow'; b.click(); return 'clicked';})()`);
await sleep(900);
/* The measurement that goes BESIDE the picture: are the spans actually filled? An empty span is
   invisible in a thumbnail and fatal in the thing this item is about. */
const spans = await C.ev(`(()=>{const m=document.getElementById('howToPlayModal');
  if(!m) return JSON.stringify({error:'no modal'});
  const b=[...m.querySelectorAll('b[data-rule]')].map(x=>[x.dataset.rule, x.textContent]);
  return JSON.stringify({open:getComputedStyle(m).display, count:b.length, blank:b.filter(p=>!p[1].trim()).map(p=>p[0]), sample:b.slice(0,6)});})()`);
console.log("modal open:", opened, spans);
await shot("t100-modal-phone-390.png", false);

// 4 — about.html's replacement card
await go(`${origin}/about.html`, 1280, 900, false);
const link = await C.ev(`(()=>{const a=document.querySelector('a[href="rules.html"]'); if(!a) return 'MISSING'; a.scrollIntoView({block:'center'}); return a.textContent.trim();})()`);
await sleep(600);
console.log("about.html rules link:", link);
await shot("t100-about-ruleslink-1280.png", false);

killAll();
