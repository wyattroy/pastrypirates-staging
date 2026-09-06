// THROWAWAY — qid:t206-privacy-line. Rule 19/22: look at the rendered picture before handing it
// over, on the real repo tree, both the welcome screen (footer + no modal line) and privacy.html.
// Bounded, kills its own browser and server.
import { serve, launch, attach, killAll, sleep } from "../scripts/mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

const DBG = 9793;
const HTTP = 8793;
const base = serve(HTTP); // e.g. http://127.0.0.1:8793/index.html
const origin = new URL(base).origin;

launch(DBG, path.join(process.cwd(), ".tmp-chrome-t206b"));
const C = await attach(DBG);

try {
  for (const seat of [
    { tag: "phone", W: 390, H: 844, dsf: 3, mobile: true },
    { tag: "desktop", W: 1280, H: 900, dsf: 1, mobile: false },
  ]) {
    await C.send("Emulation.setDeviceMetricsOverride", {
      width: seat.W, height: seat.H, deviceScaleFactor: seat.dsf, mobile: seat.mobile,
    });

    // 1. welcome screen — the modal is open, the footer must still be visible/tappable outside it
    await C.goto(base);
    await C.waitFor(`document.readyState==='complete'`, 20000, `${seat.tag} welcome load`);
    await sleep(1500);
    const seen = await C.ev(`(()=>{
      const lobbyTxt = (document.getElementById('lobby')||{}).innerText||'';
      const footer = document.getElementById('legalFooter');
      const rect = footer ? footer.getBoundingClientRect() : null;
      return {
        lobbyHasOldLine: lobbyTxt.includes('Anonymised'),
        footerExists: !!footer,
        footerLinks: footer ? [...footer.querySelectorAll('a')].map(a=>a.getAttribute('href')) : [],
        footerVisible: rect ? (rect.width>0 && rect.height>0 && rect.bottom<=window.innerHeight+1) : false,
        footerTop: rect ? rect.top : null,
        viewportH: window.innerHeight,
      };
    })()`);
    console.log(`\n== ${seat.tag} welcome ${seat.W}x${seat.H}`);
    console.log(`   old line still in modal: ${seen.lobbyHasOldLine ? "YES -- BAD" : "no, gone"}`);
    console.log(`   #legalFooter exists: ${seen.footerExists}, visible: ${seen.footerVisible}, top: ${seen.footerTop}`);
    console.log(`   footer links: ${JSON.stringify(seen.footerLinks)}`);
    let r = await C.send("Page.captureScreenshot", { captureBeyondViewport: false, format: "png" });
    fs.writeFileSync(path.join(OUT, `t206b-welcome-${seat.tag}.png`), Buffer.from(r.result.data, "base64"));

    // 2. privacy.html itself
    await C.goto(`${origin}/privacy.html`);
    await C.waitFor(`document.readyState==='complete'`, 20000, `${seat.tag} privacy load`);
    await sleep(800);
    const pv = await C.ev(`(()=>({
      h1: (document.querySelector('h1')||{}).textContent||'',
      textLen: (document.body.innerText||'').trim().length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))()`);
    console.log(`   privacy.html h1: "${pv.h1}"  textLen: ${pv.textLen}  overflowX: ${pv.overflowX}`);
    r = await C.send("Page.captureScreenshot", { captureBeyondViewport: true, format: "png" });
    fs.writeFileSync(path.join(OUT, `t206b-privacy-${seat.tag}.png`), Buffer.from(r.result.data, "base64"));
  }
} finally {
  killAll();
}
