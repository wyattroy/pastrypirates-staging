/* T-206 — PHOTOGRAPH THE ANALYTICS PLAN PAGE, phone and desktop.
 *
 *   node scripts/qa/_t206_plan_shot.mjs
 *
 * Rule 19: look at the rendered picture before handing it over. The page is written in
 * PUBLISHABLE shape (no doctype/html/head/body — the Glass host supplies those), so this wraps it
 * the way the host will and serves it, rather than opening the fragment raw.
 *
 * It also PRINTS what the page actually contains — headings, the four stat numbers, table row
 * count, and whether anything forces horizontal scrolling on a 390px phone. A blank or half-loaded
 * render cannot pass as a good screenshot when the readback is empty.
 *
 * Throwaway probe. Bounded, kills its own browser.
 */
import { launch, attach, killAll, sleep } from "../mp_rig.mjs";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = path.join(ROOT, ".planning", "ANALYTICS-PLAN.html");
const OUT = path.join(ROOT, ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

const body = fs.readFileSync(PAGE, "utf8");
const html =
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
  `<body>${body}</body></html>`;

const DBG = 9791;
const srv = createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
// Port 0 = let the OS pick a free one, then ASK THE SERVER where it landed. Nothing here
// hand-types a host or a port. `game_url_check` caught the first draft doing exactly that and it
// was right to: this page is not the game, but a gate cannot tell those apart from a literal, and
// "the server reports its own address" is the better code anyway — it cannot collide with the
// sea trial's ports or with a peer session's probe in this shared checkout.
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const { address, port } = srv.address();
const PAGE_URL = new URL(`http://${address}:${port}`).href;

const READ = `(()=>({
  h1: (document.querySelector('h1')||{}).textContent||'',
  h2s: [...document.querySelectorAll('h2')].map(n=>n.textContent.trim()),
  stats: [...document.querySelectorAll('.stat b')].map(n=>n.textContent.trim()),
  recs: [...document.querySelectorAll('.rec')].length,
  rows: document.querySelectorAll('table tr').length,
  scrollH: document.documentElement.scrollHeight,
  overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  emptyText: (document.body.innerText||'').trim().length
}))()`;

launch(DBG, path.join(process.cwd(), ".tmp-chrome-t206"));
const C = await attach(DBG);

try {
  for (const seat of [
    { tag: "phone", W: 390, H: 844, dsf: 3, mobile: true },
    { tag: "desktop", W: 1280, H: 900, dsf: 1, mobile: false },
  ]) {
    await C.send("Emulation.setDeviceMetricsOverride", {
      width: seat.W, height: seat.H, deviceScaleFactor: seat.dsf, mobile: seat.mobile,
    });
    await C.goto(PAGE_URL);
    await C.waitFor(`document.readyState==='complete'`, 20000, `${seat.tag} load`);
    await sleep(1200); // let the webfont land, or the shot lies about the type

    const seen = await C.ev(READ);
    // `send` resolves the RAW CDP message, so the payload is at .result.data — not .data.
    const r = await C.send("Page.captureScreenshot", { captureBeyondViewport: true, format: "png" });
    if (!r.result?.data) throw new Error(`${seat.tag}: no screenshot came back`);
    const f = path.join(OUT, `t206-analytics-plan-${seat.tag}.png`);
    fs.writeFileSync(f, Buffer.from(r.result.data, "base64"));

    console.log(`\n== ${seat.tag}  ${seat.W}x${seat.H}  ->  ${f}`);
    console.log(`   h1: ${seen.h1}`);
    console.log(`   sections (${seen.h2s.length}): ${seen.h2s.join(" | ")}`);
    console.log(`   stat numbers: ${seen.stats.join(", ")}`);
    console.log(`   "(Recommended)" badges: ${seen.recs}   table rows: ${seen.rows}`);
    console.log(`   text length: ${seen.emptyText} chars   page height: ${seen.scrollH}px`);
    console.log(`   needs side-scrolling: ${seen.overflowX ? "YES -- BAD" : "no"}`);
  }
} finally {
  killAll();
  srv.close();
}
