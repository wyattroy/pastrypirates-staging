/* SCRATCH (T-100) — is the pale band in the full-page capture a BUG or an ARTIFACT?
   The desktop full-page shot of rules.html shows the sea-green gradient stopping partway down and
   going pale below it. `background-attachment: fixed` (copied verbatim from about.html) paints
   against the VIEWPORT, so a captureBeyondViewport shot is expected to show exactly that — but
   "expected" is a theory, and rule 6 says measure it. This scrolls to the bottom and photographs
   the real viewport, which is what a reader actually sees. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8562, DBG = 9462;
const url = serve(PORT).replace(/\/$/, "");
launch(DBG, "/tmp/chrome-t100scroll");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await C.ev(`location.href=${JSON.stringify(url + "/rules.html")}`);
await sleep(2200);
await C.ev(`window.scrollTo(0, document.body.scrollHeight)`);
await sleep(700);
console.log("scrollY / scrollHeight:", await C.ev(`window.scrollY + " / " + document.body.scrollHeight`));
const r = await C.send("Page.captureScreenshot", { format: "png" });
const out = path.resolve(".planning/posed/t100-rules-desktop-scrolled-bottom.png");
fs.writeFileSync(out, Buffer.from(r.result.data, "base64"));
console.log("wrote", out);
killAll();
