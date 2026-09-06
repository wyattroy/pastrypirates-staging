/* T-241 (working handle; chartkeeper assigns the real one) —
 * DOES `#legalFooter` OVERLAP THE END-OF-VOYAGE PANEL (`#statsWrap`)?
 *
 *   node scripts/qa/t241_eov_footer_pose.mjs
 *   node scripts/qa/t241_eov_footer_pose.mjs --after   (names the pose "after")
 *
 * WHY THIS IS A POSE AND NOT A RATE (rule 26). Found by the 2026-09-04T1013Z FULL sea trial
 * (`passplay-desktop-041-settled.png`: "'Privacy Policy · About' footer text at bottom of the End
 * of Voyage panel is clipped by the panel's bottom edge"). The claim is geometric — two
 * fixed-position boxes sharing the viewport's bottom edge — settled by painted rectangles.
 *
 * Full reasoning and falsifier: .planning/wyclau/PREDICTION-20260904T1142Z-EOV-footer.md
 *
 * `?endcard=1` reaches the End of Voyage screen directly (w01_endgame_urls.mjs proves it lands),
 * same trick t143_eov_phone_pose.mjs uses — no need to seed real awards for a geometry question.
 *
 * NO GAME CODE IS TOUCHED BY THIS FILE. It is an instrument.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8622, DBG = 9522;
const OUT = process.env.T241_OUT || path.join(process.cwd(), ".planning", "posed");
const TAG = process.argv.includes("--after") ? "after" : "before";
fs.mkdirSync(OUT, { recursive: true });

/* The trial's own passplay-desktop seat is the finding's source. A phone control is included
   because T-256 taught us this class of bug is width-sensitive — worth knowing if it's desktop-only
   or everywhere. */
const SEATS = [
  { tag: "desktop-1280x900", W: 1280, H: 900, dsf: 1, mobile: false },
  { tag: "phone-390x844",    W: 390,  H: 844, dsf: 2, mobile: true },
];

const ADVANCE = `(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis).find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';} return null;})()`;

const STILL = `(()=>{const w=document.getElementById('statsWrap'); if(!w) return false;
  const y = Math.round((new DOMMatrixReadOnly(getComputedStyle(w).transform)).m42);
  const same = window.__t241last === y; window.__t241last = y; return same;})()`;

const MEASURE = `JSON.stringify((()=>{
  const vis = e => { if(!e) return false; const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
    return r.width>2 && r.height>2 && s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity||'1')>0.05; };
  const rect = e => { const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),h:Math.round(r.height),w:Math.round(r.width)}; };

  const footer = document.getElementById('legalFooter');
  const wrap   = document.getElementById('statsWrap');
  const again  = wrap ? wrap.querySelector('.pp4Again') : null;
  if (!footer) return {ok:false, why:'#legalFooter does not exist on this page'};
  if (!wrap || !vis(wrap)) return {ok:false, why:'no visible #statsWrap — not on the End of Voyage screen'};

  const footerVisible = vis(footer);
  const footerRect = rect(footer);
  const wrapRect = rect(wrap);
  const buttonRect = (again && vis(again)) ? rect(again) : null;

  let overlapWithWrapPx = 0;
  if (footerVisible) overlapWithWrapPx = Math.max(0, Math.min(footerRect.bottom, wrapRect.bottom) - Math.max(footerRect.top, wrapRect.top));

  let overlapWithButtonPx = 0;
  if (footerVisible && buttonRect) overlapWithButtonPx = Math.max(0, Math.min(footerRect.bottom, buttonRect.bottom) - Math.max(footerRect.top, buttonRect.top));

  return {ok:true,
    viewport: {w: innerWidth, h: innerHeight, dpr: devicePixelRatio},
    footerVisible, footerRect,
    wrapRect, buttonRect,
    overlapWithWrapPx, overlapWithButtonPx,
    footerOpacity: getComputedStyle(footer).opacity,
    gapBelowButtonPx: buttonRect ? Math.round(footerRect.top - buttonRect.bottom) : null,
  };
})())`;

const url = serve(PORT);
launch(DBG, path.join(process.cwd(), ".tmp-chrome-t241"));
const C = await attach(DBG);
const results = {};

try {
  for (const seat of SEATS) {
    await C.send("Emulation.setDeviceMetricsOverride",
      { width: seat.W, height: seat.H, deviceScaleFactor: seat.dsf, mobile: seat.mobile });
    await C.goto(url + "?endcard=1");
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} load`);
    await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t241-'+Math.floor(Math.random()*1e9));true`);
    await C.goto(url + "?endcard=1");
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} reload`);
    await sleep(1000);
    await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${seat.tag} home`);
    await C.ev(`document.getElementById('choiceSolo').click();true`); await sleep(700);
    await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${seat.tag} name`);
    await C.ev(`document.getElementById('btnNameConfirm').click();true`);

    let up = false;
    for (let i = 0; i < 40; i++) {
      up = await C.ev(`(()=>{const s=document.getElementById('statsWrap');
        return !!(s&&getComputedStyle(s).display!=='none'&&s.getBoundingClientRect().height>40)})()`);
      if (up) break;
      await C.ev(ADVANCE); await sleep(900);
    }
    if (!up) {
      console.log(`  ${seat.tag}: the End of Voyage card never appeared — NOT MEASURED`);
      results[seat.tag] = { ok: false, why: "card never appeared" };
      continue;
    }

    await C.ev(`window.__t241last = null; true`);
    let still = false;
    for (let i = 0; i < 40; i++) { still = await C.ev(STILL); if (still) break; await sleep(120); }
    if (!still) console.log(`  ${seat.tag}: ⚠ the card never stopped moving in 4.8s — rects below describe a card in transit`);
    await sleep(300);

    const m = JSON.parse(await C.ev(MEASURE));
    m.settled = still;
    results[seat.tag] = m;

    const cap0 = await C.send("Page.captureScreenshot", { format: "png" });
    const png = path.join(OUT, `t241-eov-footer-${seat.tag}-${TAG}.png`);
    fs.writeFileSync(png, Buffer.from(cap0.result.data, "base64"));
    m.shot = png;

    console.log(`\n=== ${seat.tag} ===  ${png}`);
    if (!m.ok) { console.log(`  NOT MEASURED: ${m.why}`); continue; }
    console.log(`  viewport ${m.viewport.w}x${m.viewport.h} @${m.viewport.dpr}x  settled=${m.settled}`);
    console.log(`  #legalFooter visible=${m.footerVisible} opacity=${m.footerOpacity} rect ${m.footerRect.left}..${m.footerRect.right} x ${m.footerRect.top}..${m.footerRect.bottom}`);
    console.log(`  #statsWrap   rect ${m.wrapRect.left}..${m.wrapRect.right} x ${m.wrapRect.top}..${m.wrapRect.bottom}`);
    console.log(`  Play again! button rect: ${m.buttonRect ? `${m.buttonRect.top}..${m.buttonRect.bottom}` : "not found"}`);
    console.log(`  overlap footer/wrap: ${m.overlapWithWrapPx}px   overlap footer/button: ${m.overlapWithButtonPx}px   gap below button: ${m.gapBelowButtonPx}px`);
  }

  console.log(`\n--- THE VERDICT ---`);
  let anyOverlap = false, measured = 0;
  for (const seat of SEATS) {
    const m = results[seat.tag];
    if (!m || !m.ok) { console.log(`${seat.tag}: NOT MEASURED — ${m ? m.why : 'no result'}`); continue; }
    measured++;
    if (m.overlapWithButtonPx > 0) { anyOverlap = true;
      console.log(`${seat.tag}: OVERLAP — #legalFooter covers ${m.overlapWithButtonPx}px of the "Play again!" button`);
    } else {
      console.log(`${seat.tag}: CLEAR — #legalFooter does not overlap the button (gap ${m.gapBelowButtonPx}px)`);
    }
  }
  if (!measured) console.log(`\n⚠ NOT ONE SEAT REACHED THE POSE. This run is evidence of nothing.`);

  const jsonPath = path.join(OUT, `t241-eov-footer-measurements-${TAG}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${jsonPath}`);
  process.exitCode = (measured && anyOverlap) ? 1 : 0;
} finally {
  killAll();
}
