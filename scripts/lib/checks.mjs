// checks.mjs — UNIVERSAL structural invariants. These know NOTHING about captains cards, Arrgh
// buttons or empty towers by name. They know only about ROLES — things a player clicks, things a
// player reads, and the containers that hold them — and assert a handful of rules that must hold on
// EVERY screen of EVERY mode. This is the opposite of the piecemeal gate Wyatt (rightly) rejected:
// add no rule per bug; these five general rules already catch the whole class today's four bugs
// came from, and the ones not hit yet. The vision judge (vision.mjs) is the catch-all above them.

// MEASURE — an in-page expression string. Collects role-based element sets with the rects and flags
// each rule needs. Returns null-safe plain data (returnByValue over CDP).
export const MEASURE = `(() => {
  let __uid0 = 0;
  const vis = el => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const R = el => { const r = el.getBoundingClientRect(); return { l:r.left, t:r.top, r:r.right, b:r.bottom, w:r.width, h:r.height }; };
  const mark = el => { if (!el.__qaId) el.__qaId = 'q' + (++__uid0); return el.__qaId; };
  const topmostAt = (el, x, y) => { const hit = document.elementFromPoint(x, y); return !!(hit && (hit === el || el.contains(hit) || hit.contains(el))); };
  // THINGS A PLAYER CLICKS — every interactive control the game presents, by class, deduped.
  const clickSel = '.apBtn, .btlBtn, .sailCell, .recipeCard, .bkoCard, .apSlider, #flipCoinWrap.active, .recipeList button';
  // vis() already excludes display:none / visibility:hidden / zero-size — so a lobby control that
  // does not exist for this mode (#btnStart is display:none in solo) is never treated as "offered
  // to the player". A gate that fires on something the player cannot see teaches its reader to
  // dismiss it, which is worse than no gate (HARD-WON-LESSONS.md).
  const interactive = [...document.querySelectorAll(clickSel)].filter(vis).map(el => {
    const r = el.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
    const hit = document.elementFromPoint(cx, cy);
    const top = !!(hit && (hit === el || el.contains(hit) || hit.contains(el)));
    // ROUND CONTROLS ARE ROUND. The prompt circles are 66px with border-radius:50%, and a
    // box-vs-box test calls two diagonal neighbours "overlapping" when their corners clip by a few
    // pixels while the circles themselves are comfortably apart. Measured on the phone leg: centres
    // 73.5px apart, diameter 66 — visibly not touching — reported as a pile three times a voyage.
    // A gate that cries wolf teaches its reader to dismiss it, so the shape has to be part of the
    // measurement rather than an assumption.
    const br = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const round = br >= Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) / 2 - 1;
    return { id: mark(el), round, chain: (() => { const out = []; let n = el; while (n && n !== document.body) { if (n.__qaId) out.push(n.__qaId); n = n.parentElement; } return out; })(),
      tag: el.className.toString().slice(0,40) || el.id, text: (el.textContent||'').trim().slice(0,24), rect: R(el), topmost: top,
      // WHAT covers it, not just THAT it is covered — a finding you cannot act on is half a finding.
      coveredBy: top ? null : (hit ? ((hit.id ? '#'+hit.id : '') + '.' + String(hit.className||'').trim().split(/\s+/).slice(0,2).join('.') + ' <' + hit.tagName.toLowerCase() + '>').slice(0,60) : 'nothing (outside any element)'),
      disabled: el.disabled || el.classList.contains('apDisabled') || el.getAttribute('aria-disabled') === 'true' }; });
  // THINGS A PLAYER READS — text that must not be clipped or overrun.
  const textSel = '.pname, .apMsg, .pp4Bub:not(.ambient), .prowRecipe, .pp4CerTitle, .coins, .bkoName';
  const text = [...document.querySelectorAll(textSel)].filter(vis).map(el => {
    const inner = el.firstElementChild && getComputedStyle(el).overflow !== 'visible' ? el.firstElementChild : el;
    return { id: mark(el), tag: (el.className||'').toString().slice(0,30), isAsk: el.classList.contains('apMsg'),
      text: (el.textContent||'').trim().slice(0,30), rect: R(el), scrollW: el.scrollWidth, clientW: el.clientWidth,
      // the chain of ids from this node up, so a control INSIDE a text block (or vice versa) is
      // never mistaken for one covering the other
      chain: (() => { const out = []; let n = el; while (n && n !== document.body) { if (n.__qaId) out.push(n.__qaId); n = n.parentElement; } return out; })(),
      innerScrollW: el.firstElementChild ? el.firstElementChild.scrollWidth : el.scrollWidth }; });
  // CONTAINERS that should hug their content, not stretch empty. A full-viewport backdrop (a dim
  // overlay) is exempt — big empty space is its job. Everything else is a card and should fit.
  const panelSel = '#pp4Cap, #actionPanel, #captainsPanel, .recipeList, .bko';
  const panels = [...document.querySelectorAll(panelSel)].filter(vis).map(el => {
    const kids = [...el.children].filter(vis); const box = kids.length
      ? { t: Math.min(...kids.map(k=>k.getBoundingClientRect().top)), b: Math.max(...kids.map(k=>k.getBoundingClientRect().bottom)),
          l: Math.min(...kids.map(k=>k.getBoundingClientRect().left)), r: Math.max(...kids.map(k=>k.getBoundingClientRect().right)) } : null;
    const cs = getComputedStyle(el); const bg = cs.backgroundColor;
    const rect = R(el); const backdrop = rect.w > innerWidth*0.85 && rect.h > innerHeight*0.85;
    // A FULL-WIDTH BOTTOM SHEET IS ALLOWED TO FILL ITS BAND; A FLOATING CARD IS NOT. On phone the
    // captains box is pinned edge-to-edge at the foot of the screen and rises to meet the board —
    // playtest 4's design, and the space under its rows is deliberate. Beside the board on desktop
    // it is a floating card, and the same slack is the empty cream tower Wyatt objected to. The
    // discriminator is structural (spans the full width AND sits on the bottom edge), not a name.
    const sheet = rect.w >= innerWidth - 2 && rect.b >= innerHeight - 2;
    return { tag: el.id || el.className.toString().slice(0,30), rect, content: box, backdrop, sheet,
      contentH: box ? box.b - box.t : rect.h, contentW: box ? box.r - box.l : rect.w }; });
  return { iw: innerWidth, ih: innerHeight, interactive, text, panels };
})()`;

// judge a measurement. Returns [{ok, rule, what}] — one entry per check that ran. General rules only.
export function structuralChecks(m) {
  const out = []; const F = (ok, rule, what) => out.push({ ok, rule, what });
  const IB = 2;                                     // sub-pixel tolerance
  const withinVP = r => r.l >= -IB && r.t >= -IB && r.r <= m.iw + IB && r.b <= m.ih + IB;
  const boxOverlap = (a, b, tol = 3) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > tol && Math.min(a.b, b.b) - Math.max(a.t, b.t) > tol;
const overlaps = (a, b, tol = 3) => boxOverlap(a, b, tol);
/* Shape-aware: a circle is a circle. Falls back to boxes whenever either side is rectangular, so
   nothing that used to be caught stops being caught — it only stops reporting two round buttons
   whose CORNERS clip while the buttons themselves are apart. */
const cx = r => r.l + r.w / 2, cy = r => r.t + r.h / 2;
function shapeOverlap(A, B, tol = 3) {
  const a = A.rect, b = B.rect;
  if (A.round && B.round) {
    const ra = Math.min(a.w, a.h) / 2, rb = Math.min(b.w, b.h) / 2;
    return Math.hypot(cx(a) - cx(b), cy(a) - cy(b)) < ra + rb - tol;
  }
  if (A.round !== B.round) {                       // circle vs rectangle: nearest point on the box
    const C = A.round ? a : b, Rr = A.round ? b : a;
    const r = Math.min(C.w, C.h) / 2;
    const px = Math.max(Rr.l, Math.min(cx(C), Rr.r)), py = Math.max(Rr.t, Math.min(cy(C), Rr.b));
    return Math.hypot(cx(C) - px, cy(C) - py) < r - tol;
  }
  return boxOverlap(a, b, tol);
}

  // 1. every clickable control is fully on screen (nothing a player must reach is off the edge)
  const off = m.interactive.filter(e => !e.disabled && !withinVP(e.rect)).map(e => `${e.text || e.tag}`);
  F(off.length === 0, "on-screen", off.length ? `clickable off-screen: ${off.slice(0,6).join(", ")}` : "all clickables on screen");

  // 2. every clickable control is the topmost thing at its own centre (not hidden under something)
  const occ = m.interactive.filter(e => !e.disabled && withinVP(e.rect) && !e.topmost).map(e => `${e.text || e.tag} <- covered by ${e.coveredBy}`);
  F(occ.length === 0, "not-occluded", occ.length ? `clickable covered by something else: ${occ.slice(0,6).join(", ")}` : "all clickables reachable");

  // 3. no two DISTINCT clickable controls overlap (piled buttons, a control on a control)
  const piles = [];
  for (let i = 0; i < m.interactive.length; i++) for (let j = i+1; j < m.interactive.length; j++)
    if (shapeOverlap(m.interactive[i], m.interactive[j])) piles.push(`${m.interactive[i].text||m.interactive[i].tag}/${m.interactive[j].text||m.interactive[j].tag}`);
  F(piles.length === 0, "no-pile", piles.length ? `overlapping controls: ${piles.slice(0,5).join(", ")}` : "no overlapping controls");

  // 4. no readable text is clipped by its own box (name into coin, label cut off)
  const clip = m.text.filter(t => t.innerScrollW > t.clientW + 3).map(t => `"${t.text}" (${t.innerScrollW}>${t.clientW})`);
  F(clip.length === 0, "no-clip", clip.length ? `text clipped by its box: ${clip.slice(0,5).join(", ")}` : "no clipped text");

  // 6. NOTHING MAY COVER A SAIL SQUARE — D-38, Wyatt 2026-08-21: "I think my preference would be to
  //    always keep the prompt and buttons closer to the boat, even if they start to block some of
  //    the board elements. One exception to this rule is for sailing squares, which you have to
  //    click and you cannot click them if they are covered by something."
  //    So covering the BOARD is sanctioned (holding the sea makes prompts transparent, so nothing
  //    is truly lost) and this gate must NOT flag it. What is never acceptable is covering a
  //    control the player has to hit. The sail squares are the case he named, and rules 2 and 3
  //    above already carry the general form for every other control.
  const sail = m.interactive.filter(e => /sailCell/.test(e.tag));
  const others = m.interactive.filter(e => !/sailCell/.test(e.tag));
  const onSail = [];
  for (const cell of sail) {
    if (!cell.topmost && cell.coveredBy) onSail.push(`a sail square <- ${cell.coveredBy}`);
    for (const o of others) if (shapeOverlap(o, cell, 4)) onSail.push(`"${o.text || o.tag}" over a sail square`);
  }
  F(onSail.length === 0, "sail-clickable", onSail.length ? `${onSail.length} sail square(s) covered: ${[...new Set(onSail)].slice(0,4).join(", ")}` : `every sail square clickable (${sail.length})`);

  // 6b. A control covering the QUESTION IT ANSWERS is still a fault — D-38 sanctions covering the
  //     board, not covering the game's own words: hold-the-sea reveals the board beneath a prompt,
  //     it does not reveal text beneath a button. Scoped to the prompt's own message so narration
  //     bubbles over the sea (which D-38 explicitly permits) are left alone.
  const askText = m.text.filter(t => /apMsg/.test(t.tag || "") || t.isAsk);
  const covers = [];
  for (const ctl of m.interactive) for (const t of askText) {
    if (!t.text) continue;
    if (ctl.chain && t.chain && (ctl.chain.includes(t.id) || t.chain.includes(ctl.id))) continue;   // nested — fine
    if (shapeOverlap(ctl, { rect: t.rect, round: false }, 4)) covers.push(`"${ctl.text || ctl.tag}" over "${t.text}"`);
  }
  F(covers.length === 0, "no-cover-ask", covers.length ? `control covering the question it answers: ${covers.slice(0,4).join(", ")}` : "the question is never covered by its own buttons");

  // 5. no content card is stretched far past its content (the empty-tower class). Backdrops exempt.
  const empty = m.panels.filter(p => !p.backdrop && !p.sheet && p.content && p.rect.h > p.contentH + 90).map(p => `${p.tag} (${p.rect.h|0}px box vs ${p.contentH|0}px content)`);
  F(empty.length === 0, "hug-content", empty.length ? `panel stretched empty: ${empty.join(", ")}` : "panels hug their content");
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   SETTLE — "has this screen stopped moving?" (Wyatt, 2026-08-22)

   WHY. The gate screenshots the instant a screen's signature changes, which is the instant the
   animation STARTS — reliably the worst moment, not a random one. On 2026-08-22 that produced three
   structural failures every phone run at the recipe picker (cards reported overlapping and
   off-screen) which do not exist once the cards land: measured at rest they are 7px apart with 12px
   of clearance. A whole investigation went into that phantom.

   WHY NOT A SLEEP. A fixed wait is a constant standing in for a quantity that moves (rule 9): right
   for today's animation, wrong for the next one, and silently wrong in both directions — too short
   and the phantom returns, too long and every screen costs that much. This asks the PAGE instead,
   sampling the same rects the checks are about to read until they stop changing.

   THE CAP IS NOT OPTIONAL. Something on this board always animates (the wind arrows, the active-turn
   ripple), and a poll that waits for true stillness would wait forever — which is precisely the
   failure that left ten Chromes on Wyatt's laptop for three hours the same morning. So: settle is
   declared after `stableFor` consecutive identical samples OR at `capMs`, and which of the two it
   was is REPORTED, because "we gave up waiting" and "it settled" are different facts and a caller
   that cannot tell them apart will eventually trust the wrong one.

   ONLY THE MEASURED ROLES COUNT. It watches the rects of things a player clicks and reads — not the
   whole document — so ambient scenery cannot hold it open.
   ───────────────────────────────────────────────────────────────────────────────────────────── */
export const SETTLE_PROBE = `(() => {
  const sel = '.apBtn, .btlBtn, .sailCell, .recipeCard, .bkoCard, .apSlider, #flipCoinWrap.active, .apMsg, .apSub, .pp4Bub, .pp4PeekHint, #pp4Prompt, #pp4Cap, #pp4Pill';
  /* QUANTISED TO 8px ON PURPOSE. Half this board never stops moving — .sailCell carries a permanent
     bounce, ships glide, the ripple pulses — so an exact-rect comparison never settles and the cap
     is hit on every screen. Measured: with exact rects, 22 samples over 2.68s on essentially every
     screen of a phone leg. A slide-in travels tens to hundreds of pixels; a bounce travels two to
     four. Rounding to 8px separates "arriving" from "breathing" without naming a single element,
     which keeps this a general rule rather than a list of exceptions to maintain (D-37). */
  const q = v => Math.round(v / 8);
  const geom = [...document.querySelectorAll(sel)].map(el => { const r = el.getBoundingClientRect();
    return q(r.left) + ',' + q(r.top) + ',' + q(r.width) + ',' + q(r.height); }).join(';');
  /* AND THE VISIBLE WORDS. Wyatt, 2026-08-26: "only capture screenshots after the text has entered
     entirely and settled."

     WHY NEITHER RECTS NOR textContent CAN SEE THIS — read typewriterReveal() in src/ui/panel.js
     before changing anything here. It splits each text node into TWO adjacent spans holding the
     SAME characters: a revealed prefix, and the remainder at visibility:hidden which still
     occupies its exact layout box. That is deliberate and good — line breaking is identical to the
     finished message from the first frame, so no word ever hops a line mid-reveal.
     It also means:
       - GEOMETRY NEVER CHANGES during a reveal. By design. Nothing reflows.
       - textContent RETURNS THE FULL STRING THE WHOLE TIME, because both spans are in it.
     So the only thing that differs mid-reveal is what is PAINTED — which is why the vision judge
     was the only check that could see it, and why it reported perfectly good copy as a truncation
     bug twice on 2026-08-26: "...then sa" (solo-desktop-001) and "gather each ingredien"
     (passplay-phone-001). Same sentence, same box, DIFFERENT cut points — clipping is
     deterministic, so different cuts prove a reveal in flight.

     MEASURED, not reasoned: a first attempt at this fix added plain textContent and changed
     nothing — a 40-sample trace showed 75 of 75 characters present at 12ms. The trace is what
     caught it; the source is what explained it.

     So: gather the text that is NOT inside a hidden subtree, and the images still faded out (the
     same function sets IMG opacity to 0 and transitions it in, so a half-revealed line can also be
     missing its icons). Scoped to the reading surfaces — containers like #pp4Prompt/#pp4Cap
     aggregate volatile children and would keep the signature churning forever, which is the 8px
     lesson above in another costume. */
  const READ = '.apMsg, .apSub, .pp4Bub, .apBtn, .btlBtn, .pp4PeekHint';
  const shown = el => {
    let out = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t;
    while (t = w.nextNode()) {
      const par = t.parentElement;
      if (par && getComputedStyle(par).visibility === 'hidden') continue;
      out += t.nodeValue;
    }
    return out.replace(/\s+/g, ' ').trim();
  };
  const words = [...document.querySelectorAll(READ)].map(el => {
    const faded = [...el.querySelectorAll('img')].filter(i => +getComputedStyle(i).opacity < 0.99).length;
    return shown(el) + (faded ? '~' + faded : '');
  }).join('|');
  return geom + '\u00a7' + words;
})()`;

/* THE CAP FOLLOWS PROGRESS RATHER THAN NAMING A DURATION. Measured 2026-08-26: the opening
   narration paints at ~25ms/char and finishes at ~1890ms, so a 75-character line settles at 2202ms
   — inside the old flat 2600ms cap by a whisker. A three-line trade offer is comfortably longer and
   would blow it, and the screen would be graded half-typed again.
   Raising 2600 to some bigger number would be exactly the constant rule 9 forbids: right for
   today's longest message, wrong for the next one, and it taxes every quiet screen by the
   difference. So while the PAINTED text is still growing, the deadline is pushed out — the wait
   tracks the reveal's own progress. HARD_MS is a runaway guard, not a pacing number: it exists
   only so a permanently-churning screen cannot hold a browser open forever (rule 17), and it is
   reported when it bites. */
const HARD_MS = 12000;
export async function waitSettled(c, { sampleMs = 120, stableFor = 3, capMs = 2600 } = {}) {
  const t0 = Date.now();
  let last = null, same = 0, samples = 0;
  let deadline = t0 + capMs, grewTo = -1, pushed = 0;
  /* WHICH HALF IS STILL MOVING — reported, not merely counted. "20 screens never stopped moving"
     was the shape of this finding for two days and it is not actionable: it names a quantity, not a
     cause. Geometry churn and text churn need opposite fixes, so the report has to tell them
     apart. Costs one string split on the sample we already have. */
  let churn = null;
  while (Date.now() < deadline && Date.now() - t0 < HARD_MS) {
    const now = await c.ev(SETTLE_PROBE);
    samples++;
    // Still painting? Then this is progress, not churn — give it the same window again.
    if (typeof now === "string") {
      const n = (now.split("\u00a7")[1] || "").length;
      if (n > grewTo) { grewTo = n; pushed++; deadline = Math.min(t0 + HARD_MS, Date.now() + capMs); }
    }
    if (typeof now === "string" && now === last) { if (++same >= stableFor) return { settled: true, ms: Date.now() - t0, samples }; }
    else {
      if (typeof now === "string" && typeof last === "string") {
        const [g0, w0] = last.split("\u00a7"), [g1, w1] = now.split("\u00a7");
        churn = g0 !== g1 ? (w0 !== w1 ? "geometry+text" : "geometry") : "text";
      }
      same = 0; last = now;
    }
    await new Promise(r => setTimeout(r, sampleMs));
  }
  /* HITTING THE CAP IS NOT A FAULT, and an earlier version of this made it one — which fired on
     nearly every screen of a real leg and would have trained its reader to ignore the gate entirely,
     the exact failure HARD-WON-LESSONS warns about. It is a fact worth recording and nothing more:
     the checks below still run, on the best moment available. */
  return { settled: false, ms: Date.now() - t0, samples, churn, pushed, hardCap: Date.now() - t0 >= HARD_MS };
}
