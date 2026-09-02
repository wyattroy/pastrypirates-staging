// Scratch: can the browser decode assets/board.webp at all, and does a real solo board draw it?
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await openChrome({ W: 1280, H: 900, dbgPort: 9410, httpPort: 8410, serveRoot: ROOT, profileDir: path.join(ROOT, ".tmp-sel"), dsf: 1 });
try {
  await t.nav("http://127.0.0.1:8410/index.html");
  await sleep(2500);
  console.log("direct decode:", await t.ev(`(async()=>{
    const r=await fetch("/assets/board.webp");
    let dec="no";
    try{const i=new Image();i.src="/assets/board.webp";await i.decode();dec=i.naturalWidth+"x"+i.naturalHeight;}catch(e){dec="THREW "+e.message;}
    return JSON.stringify({status:r.status,type:r.headers.get("content-type"),bytes:(await r.blob()).size,decode:dec});
  })()`));
  await t.ev("localStorage.clear()");
  await t.nav("http://127.0.0.1:8410/index.html");
  await sleep(2500);
  await t.ev(`document.getElementById('choiceSolo').click()`);
  await sleep(1200);
  await t.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';const b=document.getElementById('btnNameConfirm');if(b)b.click();})()`);
  await sleep(6000);
  console.log("in a solo game:", await t.ev(`(()=>{
    const out=[];
    document.querySelectorAll("image,img").forEach(e=>{
      const h=e.getAttribute("href")||e.getAttribute("xlink:href")||e.getAttribute("src")||"";
      if(/board/i.test(h)) out.push(e.tagName+" href="+h);
    });
    return JSON.stringify({named:out,imagesInBoard:document.querySelectorAll("svg#board image").length});
  })()`));
  console.log("console errors:", t.consoleErrs.slice(0, 5));
} finally { await t.close(); }
