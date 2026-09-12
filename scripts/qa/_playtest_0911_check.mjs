/* HIS 2026-09-11 PHONE PLAYTEST, CHECKED IN A REAL BROWSER — one phone-size window, one solo voyage.
 *   SHOTS=<dir> node scripts/qa/_playtest_0911_check.mjs
 * A: the welcome card is 10% smaller (card height with and without the change, and the gap to the
 *    privacy links) · B: recipe names at 16.6px × the card's scale · C/D: the dotted course is up on a
 *    sail pick and is gone within a beat of the sail · E: no event sound starts while a boat is still
 *    moving (every sound start is timed against every ship's drawn motion) · F: the rows and the
 *    circles in sailing order, before AND after a reload · G: the two-taps rung speaks twice, then is
 *    silent · I: a posed full table keeps every hold on one line · H: the gold Play again.
 * A throwaway probe, prefixed `_`, NOT in the gate chain. */
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, driver, driverOff } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.env.SHOTS || os.tmpdir();
const PORT = 8800 + (process.pid % 30), DBG = 9800 + (process.pid % 30);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-pt0911-${process.pid}`));
const C = await attach(DBG);
const wait = async (e, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await C.ev(e)) return 1; } catch {} await sleep(200); } throw new Error("timed out: " + e); };
const shot = async f => { try { const r = await C.send("Page.captureScreenshot", { format: "png" }); if (r.result?.data) fs.writeFileSync(path.join(OUT, f), Buffer.from(r.result.data, "base64")); } catch {} };
const J = async e => JSON.parse(await C.ev(`(async()=>JSON.stringify(await (${e})))()`));   // awaits: several checks ask the page's own modules
const res = {}; let bad = 0; const ok = (name, pass, detail) => { if (!pass) bad++; console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
setTimeout(async () => { console.log("WATCHDOG"); try { await killAll(); } catch {} process.exit(2); }, 9 * 60000).unref();

/* instruments, on every document this window loads */
await C.send("Page.enable");
await C.send("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{
  window.__errs=[]; addEventListener('error',e=>__errs.push(String(e.message).slice(0,160)));
  addEventListener('unhandledrejection',e=>__errs.push('rej: '+String(e.reason&&e.reason.message||e.reason).slice(0,160)));
  const P=(window.AudioBufferSourceNode||{}).prototype; if(P&&P.start){ const o=P.start; P.start=function(...a){ (window.__snd=window.__snd||[]).push({t:performance.now(),d:this.buffer?+this.buffer.duration.toFixed(3):null}); return o.apply(this,a); }; }
  window.__mv=[]; let last=null, moving=false, since=0;
  const tick=()=>{ const els=[...document.querySelectorAll('#boardShips g')].filter(g=>g.querySelector('image'));
    const now=els.map(g=>getComputedStyle(g).transform).join('|'); const t=performance.now();
    const m = last!==null && now!==last; if(m&&!moving){moving=true;since=t;} if(!m&&moving){moving=false;__mv.push([since,t]);} last=now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__course=[]; setInterval(()=>{ const on=!!document.querySelector('.pp4Course'); const L=__course[__course.length-1]; if(!L||L.on!==on) __course.push({t:performance.now(),on}); },40);   // polled: an observer set up here has no document to watch yet
})();` });

try {
  await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {}); await sleep(1200);
  await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(() => {}); await sleep(2200);
  await wait(`!!document.getElementById('choiceSolo')`);

  // ── A: the welcome card
  const card = () => J(`(()=>{const c=document.querySelector('#lobby .modalCard').getBoundingClientRect(), f=document.querySelector('#legalFooter a').getBoundingClientRect(); return {h:Math.round(c.height),w:Math.round(c.width),bottom:Math.round(c.bottom),gap:Math.round(f.top-c.bottom)}})()`);
  const after = await card(); await shot("0911-A-welcome.png");
  await C.ev(`(()=>{const s=document.createElement('style');s.id='__undoA';s.textContent='#lobby .modalTitle,#lobby #stepChoose{zoom:1!important}#lobby .modalCard{width:100%!important;padding:26px 28px 22px!important}';document.head.appendChild(s);return 1})()`);
  await sleep(200); const before = await card(); await C.ev(`document.getElementById('__undoA').remove()`);
  ok("A · the welcome card is about 10% smaller on a phone", after.h <= before.h * 0.93 && after.w <= before.w * 0.92,
     `height ${before.h} → ${after.h}px, width ${before.w} → ${after.w}px, space above the privacy links ${before.gap} → ${after.gap}px`);

  // ── start a solo voyage as a veteran (the parrot stays ON, so the course draws)
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await wait(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
  await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`); await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await wait(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(900);
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
  await wait(`!!document.querySelector('#actionPanel .apBtn[data-rcpos="front"] .rtName')`); await sleep(6500);

  // ── B: the recipe name size
  const B = await J(`(()=>{const t=document.querySelector('#actionPanel .apBtn[data-rcpos="front"] .recipeTitle');const row=document.querySelector('#actionPanel .apBtns');
    const wn=parseFloat(getComputedStyle(row).getPropertyValue('--rcWn')), ref=parseFloat(getComputedStyle(row).getPropertyValue('--rcRef'));
    return {px:parseFloat(getComputedStyle(t).fontSize), want:+(16.6*wn/ref).toFixed(2)}})()`);
  await shot("0911-B-picker.png");
  ok("B · recipe names are 16.6px at the card's scale", Math.abs(B.px - B.want) < 0.3, `${B.px}px drawn, ${B.want}px expected`);
  await C.ev(`document.querySelector('#actionPanel .apBtn[data-rcpos="front"]').click()`); await sleep(500);
  await C.ev(`document.querySelector('#actionPanel .apBtn[data-rcpos="front"]').click()`);

  // ── let the voyage run with the rig's driver; photograph the first sail pick that shows the course
  await sleep(1500);
  console.log("  " + await driver(C, url));
  const t0 = Date.now(); let gotC = false;
  while (Date.now() - t0 < 120000) {
    if (!gotC && await C.ev(`!!document.querySelector('.pp4Course')&&!!document.querySelector('.sailCell')`)) { await driverOff(C); await sleep(400); await shot("0911-C-course.png"); gotC = true; await driver(C, url); }
    await sleep(700);
  }
  await driverOff(C); await sleep(3000);

  // ── C: the course follows the rim rule (pure check against the engine, in the page)
  const Ccheck = await J(`(async()=>{const st=(await import('/src/state/index.js')).appState, course=await import('/src/ui/course.js'); const g=st.game, me=g.players[st.mySeat];
    const k=c=>c[0]+','+c[1], n=g.cfg.grid; let tours=0, rides=0, walkedAlongRim=0, strandedMidArc=0, examples=[];
    for(let x=0;x<n;x++)for(let y=0;y<n;y++){ const c=[x,y]; if(g.blocked(c)||g.isIsland(c)||g.isHome(c)||g.onRim(c)) continue;
      const tour=course.chartTour(g,{...me,pos:c}); if(!tour) continue; tours++;
      for(let i=1;i<tour.cells.length;i++){ const a=tour.cells[i-1], b=tour.cells[i];
        if(!g.onRim(a)&&g.onRim(b)) rides++;
        // along the rim is only ever the current carrying ye: same arc, and toward its head
        if(g.onRim(a)&&g.onRim(b)){ const ra=g.rimCellInfo.findIndex(q=>q.k===k(a)), rb=g.rimCellInfo.findIndex(q=>q.k===k(b));
          const sameArc=ra>=0&&rb>=0&&g.rimCellInfo[ra].q===g.rimCellInfo[rb].q&&rb>ra;
          const chained=g.rimHead[k(a)]&&g.rimHead[k(a)][0]===a[0]&&g.rimHead[k(a)][1]===a[1];   // leaving a head into the next arc is a new ride
          if(!sameArc&&!chained){ walkedAlongRim++; if(examples.length<3) examples.push({from:c,a,b}); } }
        if(g.onRim(a)&&!g.onRim(b)){ const h=g.rimHead[k(a)]; if(!h||h[0]!==a[0]||h[1]!==a[1]){ strandedMidArc++; if(examples.length<3) examples.push({from:c,stranded:a}); } } } }
    return {tours, rides, walkedAlongRim, strandedMidArc, examples};})()`);
  ok("C · from every open-water square, the dotted course only touches the rim to ride it to a head", Ccheck.tours > 20 && Ccheck.walkedAlongRim === 0 && Ccheck.strandedMidArc === 0,
     JSON.stringify(Ccheck));

  // ── D: the course leaves when the boat moves
  const D = await J(`(async()=>{const st=(await import('/src/state/index.js')).appState; return {course:window.__course, n:st.game.events.filter(e=>e.t==='sail'&&e.p===st.mySeat).length}})()`);
  const offs = D.course.filter(x => !x.on).length, ons = D.course.filter(x => x.on).length;
  ok("D · the course came up on sail picks and came down again", ons > 0 && offs >= Math.min(ons, D.n) - 1, `${ons} times up, ${offs} down, ${D.n} sails of mine`);

  // ── E: no event sound starts while a boat is still gliding
  const E = await J(`({snd:window.__snd||[], mv:window.__mv||[]})`);
  const NAME = d => d == null ? "?" : Math.abs(d - 0.965) < .01 ? "coin-flip" : Math.abs(d - 0.405) < .01 ? "store-ingredient" : Math.abs(d - 1.891) < .005 ? "fishing (muse)" : Math.abs(d - 1.131) < .01 ? "ship-move" : Math.abs(d - 1.178) < .01 ? "battle-swords" : Math.abs(d - 2.39) < .01 ? "bells" : Math.abs(d - 1.917) < .01 ? "cannon" : null;
  const during = {}, total = {};
  for (const s of E.snd) { const n = NAME(s.d); if (!n || n === "ship-move") continue; total[n] = (total[n] || 0) + 1;
    if (E.mv.some(([a, b]) => s.t > a + 40 && s.t < b - 40)) during[n] = (during[n] || 0) + 1; }
  const nDuring = Object.values(during).reduce((a, b) => a + b, 0);
  ok("E · no dock, muse or coin sound starts while a boat is still gliding", nDuring === 0, `sounds heard ${JSON.stringify(total)} · during a glide ${JSON.stringify(during)} · ${E.mv.length} glides timed`);

  // ── F: sailing order, then a reload
  const F = async () => J(`(async()=>{const st=(await import('/src/state/index.js')).appState; const o=st.game.turnOrder||null;
    const rows=[...document.querySelectorAll('#players .player-row')].sort((a,b)=>(+getComputedStyle(a).order)-(+getComputedStyle(b).order)).map(r=>+r.id.replace('prow',''));
    const boats=[...document.querySelectorAll('#pp4Ribbon .pp4Boat')].map((b,i)=>({i,o:+(b.style.order||0),x:b.getBoundingClientRect().left})).sort((a,b)=>a.x-b.x).map(b=>b.i);
    const me=st.mySeat, at=o?o.indexOf(me):-1, rot=o&&at>=0?o.slice(at).concat(o.slice(0,at)):null;
    return {order:o, rows, boats, want:rot};})()`);
  const f1 = await F();
  ok("F · rows: ye first, then the others in sailing order; circles: sailing order, left to right", !!f1.order && JSON.stringify(f1.rows) === JSON.stringify(f1.want) && JSON.stringify(f1.boats) === JSON.stringify(f1.order), JSON.stringify(f1));
  await C.ev(`location.reload()`).catch(() => {}); await sleep(3500);
  await wait(`!!document.querySelector('#players .player-row')`, 30000).catch(() => {});
  await sleep(2500); await shot("0911-F-after-reload.png");
  const f2 = await F();
  ok("F · …and the same after a reload", !!f2.order && JSON.stringify(f2.rows) === JSON.stringify(f2.want) && JSON.stringify(f2.boats) === JSON.stringify(f2.order), JSON.stringify(f2));

  // ── G: the two-taps rung, in the page's own modules
  const G = await J(`(async()=>{const st=(await import('/src/state/index.js')).appState, pilot=await import('/src/ui/pilot.js'), flow=await import('/src/ui/flow.js');
    const g=st.game, rim=[...g.rim][0].split(',').map(Number), water=[g.home[0],g.home[1]-2];
    const peek=pilot.__pilotPeek(); pilot.__pilotPose({...peek, off:false, seen:{...(peek.seen||{}),'sail.twotap':0}});
    const a=flow.withTwoTapRung('Wyargh: tap to sail',[water,rim]), b=flow.withTwoTapRung('Wyargh: tap to sail',[water,rim]), c=flow.withTwoTapRung('Wyargh: tap to sail',[water,rim]);
    pilot.__pilotPose({...peek, off:false, seen:{...(peek.seen||{}),'sail.twotap':0}});
    const noBlue=flow.withTwoTapRung('Wyargh: tap to sail',[water]);
    return {a,b,c,noBlue};})()`);
  ok("G · the two-taps line speaks twice, then is silent, and never without a blue square", /two taps/.test(G.a) && /two taps/.test(G.b) && !/two taps/.test(G.c) && !/two taps/.test(G.noBlue), JSON.stringify(G));

  // ── I: a posed full table — every hold on one line
  const I = await J(`(async()=>{const util=await import('/src/ui/util.js'), sh=await import('/src/shared/index.js');
    const ings=Object.keys(sh.ING_IMG); const sizes=[2,6,10,15];
    [...document.querySelectorAll('#players .chips')].forEach((el,k)=>{ const n=sizes[k%sizes.length];
      const html=Array.from({length:n},(_,i)=>'<span class="chip have">'+sh.ingImg(ings[i%ings.length])+'</span>').join('');
      el.innerHTML=html; el.dataset.src=html; });
    util.fitHolds();
    return [...document.querySelectorAll('#players .player-row')].map(r=>{const ch=r.querySelector('.chips'), cs=[...ch.querySelectorAll('.chip')];
      const tops=new Set(cs.map(c=>Math.round(c.getBoundingClientRect().top)));
      const w=cs.length>1?(cs[1].getBoundingClientRect().left-cs[0].getBoundingClientRect().left):null;
      return {n:cs.length, rowH:Math.round(r.getBoundingClientRect().height), lines:tops.size, step:w&&+w.toFixed(1), size:cs[0]?cs[0].offsetWidth:0, scroll:ch.classList.contains('holdScroll')};});})()`);
  await sleep(300); await shot("0911-I-holds.png");
  const heights = new Set(I.map(r => r.rowH));
  const overlapOK = I.every(r => r.n < 2 || r.step >= r.size * 0.65 - 0.6);
  ok("I · every hold on one line, every row the same height, never past 35% overlap", I.every(r => r.lines <= 1) && heights.size === 1 && overlapOK, JSON.stringify(I));

  // ── H: the end card
  await C.ev(`localStorage.clear()`).catch(() => {});   // a saved voyage would resume instead of posing the end card
  await C.ev(`location.href=${JSON.stringify(url + "?endcard=1")}`).catch(() => {}); await sleep(2500);
  // ?endcard=1 still starts from the home screen: choose solo, name, then click through to the card
  // (the same path scripts/qa/t241_eov_footer_pose.mjs walks)
  await wait(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000).catch(() => {});
  await C.ev(`document.getElementById('choiceSolo').click()`).catch(() => {}); await sleep(700);
  await wait(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000).catch(() => {});
  await C.ev(`document.getElementById('btnNameConfirm').click()`).catch(() => {});
  for (let i = 0; i < 40; i++) {
    if (await C.ev(`!!document.querySelector('#statsWrap .pp4Again')`)) break;
    await C.ev(`(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
      const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b)); if(card){card.click();return 1;}
      const go=[...document.querySelectorAll('button')].filter(vis).find(b=>/arrgh|aye|continue|set sail|onward|begin|start|yarr/i.test(b.textContent||'')); if(go){go.click();return 1;} return 0;})()`);
    await sleep(900);
  }
  await sleep(2500); await shot("0911-H-endcard.png");
  const H = await J(`(()=>{const b=document.querySelector('#statsWrap .pp4Again'); if(!b) return null; const cs=getComputedStyle(b); return {bg:cs.backgroundColor, color:cs.color, anim:cs.animationName}})()`);
  ok("H · Play again! is gold and wears the attention ring", !!H && /245, 166, 35/.test(H.bg) && /pp4Glow/.test(H.anim), JSON.stringify(H));

  const errs = await J(`window.__errs||[]`);
  ok("no uncaught errors on the last page", errs.length === 0, errs.slice(0, 4).join(" | "));
  console.log(bad ? `\n${bad} check(s) FAILED` : "\nALL PASSED"); console.log("pictures in " + OUT);
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); } finally { await killAll(); }
