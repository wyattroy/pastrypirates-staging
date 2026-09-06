/* SCRATCH (T-101) — RULE 19: look at the rendered picture before handing it over.
 *
 * His instruction implied the same rigor as T-100's rules page ("Same one-source constraint as
 * the rules page"). Three pictures:
 *   1. credits.html          desktop 1280x900
 *   2. credits.html          phone   390x844
 *   3. index.html            the in-game Credits modal, phone 390x844 — proving it still opens,
 *                            the new "these credits live at credits.html" link appears, and the
 *                            Ko-Fi button still sits below it
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8562, DBG = 9462;
const OUTDIR = path.resolve(".planning/posed");
fs.mkdirSync(OUTDIR, { recursive: true });

const url = serve(PORT);
const origin = url.replace(/\/$/, "");
launch(DBG, "/tmp/chrome-t101shots");
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
await go(`${origin}/credits.html`, 1280, 900, false);
console.log("credits.html desktop, title:", await C.ev(`document.title`));
await shot("t101-credits-desktop-1280.png", true);

await go(`${origin}/credits.html`, 390, 844, true);
await shot("t101-credits-phone-390.png", true);

// 3 — the in-game modal still opens, still shows the new link, Ko-Fi button still present
await go(`${origin}/`, 390, 844, true);
await C.ev(`try{localStorage.clear()}catch(e){}`);
await C.ev(`location.reload()`);
await sleep(2600);
const opened = await C.ev(`(()=>{const b=document.getElementById('btnShowCredits'); if(!b) return 'no btnShowCredits'; b.click(); return 'clicked';})()`);
await sleep(900);
const state = await C.ev(`(()=>{const m=document.getElementById('creditsModal');
  if(!m) return JSON.stringify({error:'no modal'});
  const link=m.querySelector('a[href="credits.html"]');
  const kofi=m.querySelector('#btnKofiCredits');
  return JSON.stringify({open:getComputedStyle(m).display, linkText: link ? link.closest('p').textContent.trim() : 'MISSING', kofiPresent: !!kofi});})()`);
console.log("modal open:", opened, state);
await shot("t101-modal-phone-390.png", false);

killAll();
