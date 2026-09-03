/* SCRATCH (T-206) — RULE 19: look at the rendered picture before handing it over.
 *
 * The change is one `<script type="module">` in the head of his three public pages. A module that
 * fails to load fails ISOLATED — the page keeps working — which is exactly what makes this worth
 * photographing rather than reasoning about: the failure mode is silent, and "it cannot break the
 * page" is a sentence this project has paid for before.
 *
 * Three things are asked of each LIVE page, not of the source:
 *   1. does it still draw? (a picture, kept in .planning/posed/)
 *   2. did the module actually LOAD — a 404 is silent, so the resource entry is read
 *   3. off the live domain, is NOTHING installed — no dataLayer, no googletagmanager script, no
 *      cookie? That is the guard that stops a sea trial being counted as players, asked of the
 *      running page rather than of the `===` in the source.
 *
 * An `onerror`/`unhandledrejection` collector is installed BEFORE each navigation, because this
 * rig's socket only routes command replies and cannot subscribe to console events.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8571, DBG = 9471;
const OUTDIR = path.resolve(".planning/posed");
fs.mkdirSync(OUTDIR, { recursive: true });

const origin = serve(PORT).replace(/\/$/, "");
launch(DBG, "/tmp/chrome-t206shots");
const C = await attach(DBG);

const problems = [];
try {
  await C.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message||e.error)));" +
            "addEventListener('unhandledrejection',e=>__errs.push('reject: '+String(e.reason)));",
  });

  for (const page of ["index.html", "about.html", "rules.html"]) {
    await C.goto(`${origin}/${page}`);
    await C.waitFor("document.readyState==='complete'", 30000, `${page}: load`);
    await sleep(2500);

    const v = await C.ev(`(() => {
      const res = performance.getEntriesByType("resource").filter(r => /analytics\\.js/.test(r.name));
      return {
        host: location.hostname,
        moduleTag: document.querySelectorAll('script[src*="analytics.js"]').length,
        fetched: res.length,
        fetchedBytes: res.length ? (res[0].transferSize + res[0].decodedBodySize) : 0,
        installed: !!window.__ppAnalyticsInstalled,
        dataLayer: window.dataLayer ? (Array.isArray(window.dataLayer) ? window.dataLayer.length : "object") : null,
        googleScripts: document.querySelectorAll('script[src*="googletagmanager"]').length,
        cookieChars: document.cookie.length,
        errs: (window.__errs || []).slice(0, 4),
        /* ⚠ NOT body height. The first version of this asked for it and condemned index.html at
           height 0 — and the screenshot showed the game drawing perfectly. The GAME's body is a
           full-screen fixed layout, so its own box is legitimately zero-height. When a check
           condemns something known to work, suspect the check (rule 6). The tallest thing actually
           on the screen is the honest question for all three pages. */
        drew: Math.max(0, ...[document.documentElement, document.body, ...(document.body ? document.body.children : [])]
          .filter(Boolean).map((el) => el.getBoundingClientRect().height)),
      };
    })()`);

    console.log(`${page.padEnd(11)} host=${v.host} tag=${v.moduleTag} fetched=${v.fetched} installed=${v.installed} ` +
                `dataLayer=${v.dataLayer} gtm=${v.googleScripts} cookieChars=${v.cookieChars} bodyH=${Math.round(v.drew)}`);
    if (v.errs.length) console.log(`             page errors: ${JSON.stringify(v.errs)}`);

    if (v.moduleTag !== 1) problems.push(`${page}: expected exactly 1 analytics module tag, saw ${v.moduleTag}`);
    /* ⛔ A 404 IS SILENT FOR A MODULE. If the browser never fetched it, the tag is decoration and
       the live site would measure nothing while every source check stayed green. */
    if (!v.fetched) problems.push(`${page}: the browser never fetched src/analytics.js — a module 404 fails silently, so the live pages would measure NOTHING while every source check passed`);
    if (v.installed) problems.push(`${page}: ⛔ ANALYTICS INSTALLED OFF THE LIVE DOMAIN (${v.host}) — a sea trial would be counted as players`);
    if (v.googleScripts) problems.push(`${page}: ⛔ a googletagmanager script reached the DOM on ${v.host}`);
    if (v.errs.length) problems.push(`${page}: page errors — ${JSON.stringify(v.errs)}`);
    if (!(v.drew > 100)) problems.push(`${page}: body height ${v.drew} — the page did not draw`);

    const r = await C.send("Page.captureScreenshot", { format: "png" });
    if (r.result?.data)
      fs.writeFileSync(path.join(OUTDIR, `t206-${page.replace(/\.html$/, "")}.png`), Buffer.from(r.result.data, "base64"));
  }
} finally {
  killAll();
}

console.log(problems.length
  ? `\n⛔ ${problems.length} problem(s):\n  ${problems.join("\n  ")}`
  : "\n✅ three pages drew, the module was fetched on each, and NOTHING was installed off the live domain — no dataLayer, no Google script, no cookie, no page errors.");
process.exit(problems.length ? 1 : 0);
