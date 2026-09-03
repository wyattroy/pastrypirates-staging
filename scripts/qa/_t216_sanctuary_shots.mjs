/* SCRATCH (T-216) — RULE 19: look at the rendered picture before handing it over.
 *
 * The corrected sanctuary sentence has to be READ, on both surfaces it reaches:
 *   1. the in-game How-to-play modal, phone 390x844 — where a player at the table meets it
 *   2. rules.html, the public page, phone 390x844 — where a reader from Google meets it
 * Both are scrolled to the Attack paragraph rather than photographed from the top, because a
 * screenshot that does not contain the changed sentence proves nothing about it.
 *
 * The measurement that goes BESIDE each picture: the sentence's own text, read back out of the DOM.
 * A picture can be squinted at; the string cannot.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8563, DBG = 9463;
const OUTDIR = path.resolve(".planning/posed");
fs.mkdirSync(OUTDIR, { recursive: true });

const url = serve(PORT);
const origin = url.replace(/\/$/, "");
launch(DBG, "/tmp/chrome-t216shots");
const C = await attach(DBG);

async function shot(name) {
  const r = await C.send("Page.captureScreenshot", { format: "png" });
  const data = r?.result?.data;
  if (!data) { console.log(`NO SCREENSHOT for ${name}`); return; }
  fs.writeFileSync(path.join(OUTDIR, name), Buffer.from(data, "base64"));
  console.log("wrote", path.join(OUTDIR, name));
}

async function go(href, w, h, mobile) {
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await C.ev(`location.href=${JSON.stringify(href)}`);
  await sleep(2200);
}

// 1 — the in-game modal, scrolled to the sentence
await go(`${origin}/`, 390, 844, true);
await C.ev(`try{localStorage.clear()}catch(e){}`);
await C.ev(`location.reload()`);
await sleep(2600);
console.log("modal opened:", await C.ev(`(()=>{const b=document.getElementById('btnShowHow'); if(!b) return 'no btnShowHow'; b.click(); return 'clicked';})()`));
await sleep(900);
console.log("MODAL sentence:", await C.ev(`(()=>{const s=document.querySelector('[data-engine-rule="sanctuary"]');
  if(!s) return 'MISSING from the modal';
  s.scrollIntoView({block:'center'});
  return JSON.stringify(s.textContent.trim());})()`));
await sleep(600);
await shot("t216-modal-sanctuary-phone.png");

// 2 — the public page, scrolled to the same sentence
await go(`${origin}/rules.html`, 390, 844, true);
console.log("PAGE sentence:", await C.ev(`(()=>{const s=document.querySelector('[data-engine-rule="sanctuary"]');
  if(!s) return 'MISSING from rules.html';
  s.scrollIntoView({block:'center'});
  return JSON.stringify(s.textContent.trim());})()`));
await sleep(600);
await shot("t216-rules-sanctuary-phone.png");

killAll();
