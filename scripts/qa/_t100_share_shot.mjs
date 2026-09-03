/* SCRATCH (T-100 / CEO 171) — photograph the BOTTOM of the How-to-play modal, where the new share
   line lives. The main shot photographs the top of the modal, so it cannot show the one thing that
   changed. Rule 19: look at the picture of the thing you actually altered, not the thing next to it. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8563, DBG = 9463;
const url = serve(PORT).replace(/\/$/, "");
launch(DBG, "/tmp/chrome-t100share");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await C.ev(`location.href=${JSON.stringify(url + "/")}`);
await sleep(2400);
await C.ev(`try{localStorage.clear()}catch(e){}`);
await C.ev(`location.reload()`);
await sleep(2600);
await C.ev(`document.getElementById('btnShowHow').click()`);
await sleep(900);
/* Scroll the modal's own scrolling body to the end, then measure the link BESIDE the picture. */
console.log(await C.ev(`(()=>{const m=document.getElementById('howToPlayModal');
  const body=[...m.querySelectorAll('div')].find(d=>d.scrollHeight>d.clientHeight+50);
  if(body) body.scrollTop = body.scrollHeight;
  const a=m.querySelector('.howShare a');
  if(!a) return JSON.stringify({error:'no share link in the modal'});
  const r=a.getBoundingClientRect();
  return JSON.stringify({href:a.getAttribute('href'), text:a.textContent,
    onScreen:r.top>=0&&r.bottom<=innerHeight&&r.width>0, top:Math.round(r.top), w:Math.round(r.width)});})()`));
await sleep(500);
const s = await C.send("Page.captureScreenshot", { format: "png" });
const out = path.resolve(".planning/posed/t100-modal-share-line-390.png");
fs.writeFileSync(out, Buffer.from(s.result.data, "base64"));
console.log("wrote", out);
killAll();
