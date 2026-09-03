/* T-143 — THE END OF VOYAGE ON A PHONE: IS ANYTHING COVERED, OR IS IT JUST OFF THE BOTTOM?
 *
 *   node scripts/qa/t143_eov_phone_pose.mjs
 *
 * WHY THIS EXISTS, AND WHY IT IS A POSE AND NOT A RATE (rule 26). Two Chart rows describe the same
 * screen and disagree about it. `T-023` says the sticky "Play again!" button COVERS the award cards
 * and slices a winner's name horizontally. `T-143` is CEO 158's correction: the cut sits ~15px ABOVE
 * the button with the card's own background in the gap, so nothing overlaps anything, and the real
 * question is a DESIGN one for Wyatt — is it acceptable that a phone player must scroll to see who
 * won which award when a tablet player sees all four at once?
 *
 * A rate over a driven voyage cannot separate those two readings. Two painted rectangles can.
 *
 * WHAT IT MEASURES, and every one is a geometric fact rather than a judgement:
 *   overlapWithButtonPx — do the button's painted box and an award card's painted box actually
 *                 intersect? That is the whole of `T-023`'s claim. Zero means the layering theory
 *                 is dead and no ninth layering rule is needed.
 *   gapPx       — how much sits between the scroller's bottom edge and the button. CEO 158
 *                 measured ~15px by eye; this reads it.
 *   cutByScrollerPx — how far each award card extends past the scroller's visible bottom, which is
 *                 the fault that is really there and the thing his design question is about.
 *
 * TWO SEATS, because the tablet is the working reference the row already points at
 * (`solo-tablet-022-settled.png`: four awards in one row, every name legible, nothing covered).
 *
 * `?endcard=1` puts the game straight on the End of Voyage screen without sailing a voyage —
 * `scripts/qa/w01_endgame_urls.mjs` is what proves that flag lands where it claims, and
 * `w34_eov_park_glide.mjs` is the older probe that uses it the same way.
 *
 * ⚠ IT WAITS FOR THE CARD TO STOP MOVING BEFORE IT READS A SINGLE RECT. `#statsWrap` is PARKED by a
 * settle transition; a rect read during that glide describes a card in transit, and the whole
 * measurement would then be about a moment nobody sees. Two identical frames, then measure.
 *
 * NO GAME CODE IS TOUCHED BY THIS FILE. It is an instrument.
 */
import { serve, launch, attach, killAll, sleep, SHOTS } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8617, DBG = 9517;
/* the posed pair belongs where every other posed pair lives, so he can find it beside them */
const OUT = process.env.T143_OUT || path.join(process.cwd(), ".planning", "posed");
/* `--fallback` photographs the empty-log floor instead; the default is the realistic case */
const SEED = !process.argv.includes("--fallback");
const SUFFIX = SEED ? "awards" : "fallback";
fs.mkdirSync(OUT, { recursive: true });

const SEATS = [
  { tag: "phone-390x664", W: 390, H: 664, dsf: 2, mobile: true },
  { tag: "tablet-820x1180", W: 820, H: 1180, dsf: 2, mobile: true },
];

/* ⚠ WHY THIS EXISTS, AND IT IS CEO 170's FINDING, NOT A FLOURISH.
 * `?endcard=1` skips the whole day loop, so the event log is EMPTY, so `computeAwards()`
 * (`src/ui/util.js:930`) returns zeroes, so no captain can claim any category and all four fall
 * through to `FALLBACK_BADGE` — *"Good Mate / Pirated for the love of the game."*, the SHORTEST
 * card content the game can produce (`src/ui/util.js:996`, handed out at `:1016`).
 *
 * **So an unseeded pose photographs the LEAST crowded End of Voyage that exists**, and a question
 * about what falls below the fold cannot honestly be answered from it. A real voyage hands out four
 * DIFFERENT badges with much longer bylines — the Lucky Streak's runs to 70 characters against the
 * fallback's 33 — and every extra wrapped line pushes more content off a phone.
 *
 * `assignBadges()` gives a real badge to any captain with ANY positive stat, so seeding one
 * positive stat per seat is enough to guarantee four real awards rather than four fallbacks. The
 * events below are shaped exactly like the ones the engine emits, and they are pushed onto
 * `appState.game.events` through the game's own permanent read-only bridge
 * (`window.__pp_app_state_debug`, `src/main.js:142`) — a shallow copy, so `.game` is the REAL
 * object. NO GAME CODE IS CHANGED, and nothing is monkey-patched.
 *
 * BOTH POSES ARE KEPT, because they are the floor and the typical case and he should see both. */
const SEED_AWARDS = `(()=>{
  if(window.__t143seeded) return 'already';
  window.__t143timer = setInterval(()=>{
    const g = window.__pp_app_state_debug && window.__pp_app_state_debug().game;
    if(!g || !g.players || g.players.length < 4 || !g.events || window.__t143seeded) return;
    /* ⛔ WAIT UNTIL THE VOYAGE IS OVER. The first version armed at boot and the game never reached
       the End of Voyage at all — measured, not guessed: two seats, both "the card never appeared".
       Something downstream walks this stream while the voyage is running. Every captain being
       \`done\` is what \`skipToEndCard()\` sets (\`src/orchestrator.js:1275-1279\`) immediately before
       the ending resolves, behind a 2600ms flash — so this lands after the game loop is finished
       and before \`assignBadges()\` is called, and touches nothing in between. */
    if(!g.players.every(p => p.done)) return;
    window.__t143seeded = true;
    /* Every event below is a shape the engine really emits — no invented \`t\`, no \`state\` arrays.
       assignBadges() gives a real badge to any seat with ANY positive stat, so one per seat is all
       it takes to replace four fallbacks with four real awards. */
    /* seat 0 — the most trades struck: The Silver-Tongued Ledger */
    for(let i=0;i<6;i++) g.events.push({t:'trade', a:0, b:(i%2)?1:2});
    /* seat 1 — battles won; seat 3 is the one set upon: The Cutlass / The Painted Target */
    for(let i=0;i<5;i++) g.events.push({t:'battle', a:1, d:3, winner:1, rounds:[[1,0],[1,0]]});
    /* seat 2 — crates bought at the dock: The Open Purse */
    for(let i=0;i<8;i++) g.events.push({t:'dock', p:2, heads:true, got:'bought'});
    clearInterval(window.__t143timer);
  }, 60);
  return 'armed';
})()`;

/* THE READING. Everything here is a rect off the live page. Each element is reported with its own
   TEXT beside its rect, so a human can check the probe found what it says it found — an instrument
   whose subject cannot be checked is not evidence (rule 6). */
const MEASURE = `JSON.stringify((()=>{
  const vis = e => { if(!e) return false; const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
    return r.width>2 && r.height>2 && s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity||'1')>0.05; };
  const rect = e => { const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),h:Math.round(r.height),w:Math.round(r.width)}; };

  const wrap   = document.getElementById('statsWrap');
  const scroll = document.getElementById('statsScroll');
  const again  = document.querySelector('.pp4Again') || document.getElementById('pp4Again');
  if(!wrap || !vis(wrap)) return {ok:false, why:'no visible #statsWrap — this is not the End of Voyage screen'};

  /* AWARD CARDS ARE FOUND BY STRUCTURE, NOT BY A HOPEFUL CLASS NAME: an award card is whatever box
     holds a badge image. Walk up from each badge <img> until the box is meaningfully taller than
     the image itself — that is the card. Deduplicated, because two badges can share an ancestor. */
  const badges = [...wrap.querySelectorAll('img')].filter(i => /badges\\//.test(i.getAttribute('src')||''));
  const awards = badges.map(img => {
    let e = img;
    for(let i=0;i<6 && e.parentElement && e.parentElement!==wrap;i++){
      e = e.parentElement;
      if(e.getBoundingClientRect().height > img.getBoundingClientRect().height * 1.6) break;
    }
    return e;
  }).filter((e,i,a)=>a.indexOf(e)===i);

  const clipTop    = scroll ? scroll.getBoundingClientRect().top    : 0;
  const clipBottom = scroll ? scroll.getBoundingClientRect().bottom : innerHeight;

  /* ⚠ THE PAINTED BOX IS NOT THE LAYOUT BOX, AND THE FIRST VERSION OF THIS PROBE GOT IT WRONG.
     These cards live inside a scroller that CLIPS them. \`getBoundingClientRect()\` hands back the
     layout box, which runs on past the scroller's bottom edge — so a naive intersection test found
     "4 of 4 award cards overlap the Play again! button" and would have resurrected the layering
     theory CEO 158 had already killed by opening the pictures. NOTHING PAINTS BELOW THE SCROLLER.
     So every card's box is intersected with the scroller's own box FIRST, and the overlap test is
     run against what is actually on the glass. Rule 6: when a check condemns something known to
     work, suspect the check. */
  const painted = r => ({ left:r.left, right:r.right,
    top: Math.max(r.top, clipTop), bottom: Math.min(r.bottom, clipBottom) });

  const overlapWith = r => {
    if(!again || !vis(again)) return 0;
    const p = painted(r);
    if(p.bottom <= p.top) return 0;                 // entirely clipped away: nothing is drawn at all
    const b = again.getBoundingClientRect();
    const x = Math.min(p.right,b.right) - Math.max(p.left,b.left);
    const y = Math.min(p.bottom,b.bottom) - Math.max(p.top,b.top);
    return (x>0 && y>0) ? Math.round(y) : 0;
  };

  const awardRows = awards.map(e => { const r = e.getBoundingClientRect(); return {
    text: (e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60),
    rect: rect(e),
    cutByScrollerPx: Math.max(0, Math.round(r.bottom - clipBottom)),
    overlapWithButtonPx: overlapWith(r),
    /* LAYOUT overlap kept beside the painted one, on purpose, so the difference between the two is
       visible in the record instead of being an invisible correction. */
    layoutOverlapWithButtonPx: (() => { if(!again||!vis(again)) return 0;
      const b = again.getBoundingClientRect();
      const x = Math.min(r.right,b.right) - Math.max(r.left,b.left);
      const y = Math.min(r.bottom,b.bottom) - Math.max(r.top,b.top);
      return (x>0 && y>0) ? Math.round(y) : 0; })(),
  };});

  /* WHICH TEXT IS SLICED THROUGH THE HEIGHT OF ITS LETTERS BY THE SCROLLER'S EDGE. This is what a
     player's eye actually lands on, and the row described it before anyone measured it — so it is
     measured rather than inferred from two pictures.
     ⚠ THE FIRST VERSION OF THIS CLAUSE REPORTED 0 WHILE THE SCREENSHOT PLAINLY SHOWED A HALF-DRAWN
     LINE. It required a LEAF element (no element children), and the line it was looking for —
     "Number of ingredients plundered — 5" — carries a <b> around the number, so it has a child and
     was never a candidate. An instrument that cannot reach its subject reads exactly like a clean
     screen (rule 6). The test is now on the BOX: any element inside the scroller no taller than a
     couple of text lines whose box straddles the clip line is a line of text cut in half. */
  const sliced = scroll ? [...scroll.querySelectorAll('*')].filter(e => {
      if(!vis(e) || !(e.textContent||'').trim()) return false;
      const r = e.getBoundingClientRect();
      return r.height <= 48 && r.top < clipBottom && r.bottom > clipBottom;
    })
    .map(e => { const r = e.getBoundingClientRect(); return {
      tag: e.tagName.toLowerCase(),
      text: (e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,70),
      top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
      visiblePx: Math.round(clipBottom - r.top) };})
    /* keep the innermost box for each distinct sentence — an outer wrapper and its inner span are
       one sliced line, not two */
    .filter((x,i,a) => !a.some((y,j) => j!==i && y.text===x.text && y.h < x.h)) : [];

  const gapPx = (again && vis(again) && scroll)
    ? Math.round(again.getBoundingClientRect().top - scroll.getBoundingClientRect().bottom) : null;
  const table = wrap.querySelector('table');

  return {ok:true,
    viewport: {w: innerWidth, h: innerHeight, dpr: devicePixelRatio},
    wrap: rect(wrap),
    scroller: scroll ? rect(scroll) : null,
    button: (again && vis(again)) ? {text:(again.textContent||'').trim().slice(0,30), rect: rect(again)} : null,
    gapPx,
    scrollTop:    scroll ? Math.round(scroll.scrollTop)    : null,
    scrollHeight: scroll ? Math.round(scroll.scrollHeight) : null,
    clientHeight: scroll ? Math.round(scroll.clientHeight) : null,
    awards: awardRows,
    slicedByScrollerEdge: sliced,
    statsTableVisible: !!(table && vis(table)),
    statsTableCutPx: table ? Math.max(0, Math.round(table.getBoundingClientRect().bottom - clipBottom)) : null,
  };
})())`;

/* THE SETTLE GUARD — read `#statsWrap`'s own translateY on two consecutive frames and proceed only
   when they agree. See the header for why this is not optional. */
const STILL = `(()=>{const w=document.getElementById('statsWrap'); if(!w) return false;
  const y = Math.round((new DOMMatrixReadOnly(getComputedStyle(w).transform)).m42);
  const same = window.__t143last === y; window.__t143last = y; return same;})()`;

const ADVANCE = `(()=>{const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis).find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';} return null;})()`;

const url = serve(PORT);
launch(DBG, path.join(process.cwd(), ".tmp-chrome-t143"));
const C = await attach(DBG);
const results = {};

try {
  for (const seat of SEATS) {
    await C.send("Emulation.setDeviceMetricsOverride",
      { width: seat.W, height: seat.H, deviceScaleFactor: seat.dsf, mobile: seat.mobile });
    await C.goto(url + "?endcard=1");
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} load`);
    await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t143-'+Math.floor(Math.random()*1e9));true`);
    await C.goto(url + "?endcard=1");
    await C.waitFor(`document.readyState==='complete'`, 30000, `${seat.tag} reload`);
    await sleep(1000);
    await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${seat.tag} home`);
    await C.ev(`document.getElementById('choiceSolo').click();true`); await sleep(700);
    await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${seat.tag} name`);
    /* the seat-0 default a real player gets is "Davy Scones" (`src/shared/index.js:606`); typing a
       probe's own name in changes the very string `T-023` says is sliced, so it is left alone */
    await C.ev(`document.getElementById('btnNameConfirm').click();true`);
    if (SEED) await C.ev(SEED_AWARDS);

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

    await C.ev(`window.__t143last = null; true`);
    let still = false;
    for (let i = 0; i < 40; i++) { still = await C.ev(STILL); if (still) break; await sleep(120); }
    if (!still) console.log(`  ${seat.tag}: ⚠ the card never stopped moving in 4.8s — rects below describe a card in transit`);
    await sleep(300);

    const m = JSON.parse(await C.ev(MEASURE));
    m.settled = still;
    results[seat.tag] = m;

    /* The rig's own `shot()` writes into SHOTS with the literal name it is handed and returns
       nothing, so this writes the PNG itself — with a `.png` on the end, where a human can open it. */
    const cap = await C.send("Page.captureScreenshot", { format: "png" });
    const png = path.join(OUT, `t143-eov-${seat.tag}-${SUFFIX}.png`);
    fs.writeFileSync(png, Buffer.from(cap.result.data, "base64"));
    m.shot = png;
    console.log(`\n=== ${seat.tag} ===  ${png}`);
    if (!m.ok) { console.log(`  NOT MEASURED: ${m.why}`); continue; }
    console.log(`  viewport ${m.viewport.w}x${m.viewport.h} @${m.viewport.dpr}x   settled=${m.settled}`);
    console.log(`  scroller ${m.scroller ? `${m.scroller.top}..${m.scroller.bottom} (client ${m.clientHeight}, content ${m.scrollHeight})` : "none"}`);
    console.log(`  button   ${m.button ? `"${m.button.text}" ${m.button.rect.top}..${m.button.rect.bottom}` : "not visible"}`);
    console.log(`  gap between scroller bottom and button top: ${m.gapPx === null ? "n/a" : m.gapPx + "px"}`);
    console.log(`  stats table visible: ${m.statsTableVisible}  cut by ${m.statsTableCutPx}px`);
    console.log(`  text sliced through its letters by the scroller edge: ${m.slicedByScrollerEdge.length}`);
    for (const s of m.slicedByScrollerEdge)
      console.log(`    ! ${s.top}..${s.bottom}, only ${s.visiblePx}px of it drawn — "${s.text}"`);
    console.log(`  award cards found: ${m.awards.length}`);
    for (const a of m.awards)
      console.log(`    - ${a.rect.top}..${a.rect.bottom}  cutByScroller=${a.cutByScrollerPx}px  overlapWithButton(painted)=${a.overlapWithButtonPx}px  (layout box alone would say ${a.layoutOverlapWithButtonPx}px)  "${a.text}"`);
  }

  /* THE VERDICT, stated as the two rows' competing claims so nobody has to interpret it. */
  const ph = results["phone-390x664"], tb = results["tablet-820x1180"];
  console.log(`\n--- WHAT THE RECTANGLES SAY ---`);
  if (ph && ph.ok) {
    const over = ph.awards.filter(a => a.overlapWithButtonPx > 0);
    const cut  = ph.awards.filter(a => a.cutByScrollerPx > 0);
    console.log(`T-023's claim (the button COVERS the cards): ${over.length
      ? `SUPPORTED — ${over.length} of ${ph.awards.length} award cards intersect the button's painted box`
      : `NOT SUPPORTED — 0 of ${ph.awards.length} award cards intersect the button's painted box`}`);
    console.log(`T-143's claim (the cards are CUT BY THE SCROLLER): ${cut.length
      ? `SUPPORTED — ${cut.length} of ${ph.awards.length} cut, worst ${Math.max(...cut.map(a => a.cutByScrollerPx))}px`
      : `NOT SUPPORTED — nothing is cut at 390x664`}`);
  } else console.log(`the phone seat was NOT MEASURED — nothing above is a claim about a phone`);
  if (tb && tb.ok) {
    const tcut = tb.awards.filter(a => a.cutByScrollerPx > 0);
    console.log(`the tablet reference: ${tb.awards.length} award cards, ${tcut.length} cut, stats table cut by ${tb.statsTableCutPx}px`);
  } else console.log(`the tablet seat was NOT MEASURED`);

  /* ⚠ SAY OUT LOUD WHETHER THIS RUN PHOTOGRAPHED REAL AWARDS OR THE FALLBACK FLOOR. A run that
     silently caught four "Good Mate" cards is a run about the shortest screen the game can draw,
     and every number above then understates the fault. */
  const ph2 = results["phone-390x664"];
  if (ph2 && ph2.ok) {
    const fallbacks = ph2.awards.filter(a => /^Good Mate/.test(a.text)).length;
    console.log(`\nAWARD CONTENT: ${fallbacks} of ${ph2.awards.length} cards are the "Good Mate" FALLBACK badge.` +
      (fallbacks === ph2.awards.length
        ? ` ⚠ THIS IS THE SHORTEST CARD THE GAME CAN DRAW — the numbers above are a FLOOR, not the typical case.`
        : ` Real, distinct awards with their real bylines — this is the typical case.`));
  }

  const jsonPath = path.join(OUT, `t143-measurements-${SUFFIX}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`wrote ${jsonPath}`);
} finally {
  killAll();
}
