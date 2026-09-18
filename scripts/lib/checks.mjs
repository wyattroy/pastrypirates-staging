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
  /* HOW AN ELEMENT IS NAMED IN A FINDING — ONE definition, because a second consumer appeared on
     2026-09-17 (the paint-order probe at the foot of this function) and two copies of a naming rule
     drift (CLAUDE.md, "when a second consumer of the same thing appears, converge").
     ⚠ THE DOUBLE BACKSLASH IS LOAD-BEARING, and its absence was a live bug in the copy this
     replaced: MEASURE is a TEMPLATE LITERAL, so a lone \s reaches the browser as a plain "s" and
     the class list was being split on the letter s — "apMsg" was reported as "apM.g". Nothing about
     the verdict changed, but every finding that named a coverer named it slightly wrong. */
  /* AND AN ANONYMOUS NODE NAMES NOTHING. Measured on the real sail screen 2026-09-17: the thing
     painted over the gold square is typewriterReveal()'s own <span> inside .apMsg — no id, no
     class — which the old expression rendered as ". <span>". So climb to the nearest ancestor that
     HAS a name, and keep the tag that was actually hit. */
  const named = el => {
    if (!el) return 'nothing (outside any element)';
    let n = el;
    while (n && n !== document.body && !n.id && !String(n.className||'').trim()) n = n.parentElement;
    if (!n || n === document.body) n = el;
    const cls = String(n.className||'').trim();
    const label = (n.id ? '#' + n.id : '') + (cls ? '.' + cls.split(/\\s+/).slice(0,2).join('.') : '');
    return ((label || n.tagName.toLowerCase()) + ' <' + el.tagName.toLowerCase() + '>').slice(0,60);
  };
  // THINGS A PLAYER CLICKS — every interactive control the game presents, by class, deduped.
  const clickSel = '.apBtn, .btlBtn, .sailCell, .recipeCard, .bkoCard, .apSlider, #flipCoinWrap.active, .recipeList button';
  // vis() already excludes display:none / visibility:hidden / zero-size — so a lobby control that
  // does not exist for this mode (#btnStart is display:none in solo) is never treated as "offered
  // to the player". A gate that fires on something the player cannot see teaches its reader to
  // dismiss it, which is worse than no gate (HARD-WON-LESSONS.md).
  /* ⭐ A CONTROL THE BROWSER WILL NOT CLICK IS NOT A CONTROL — and this check has never asked.
     vis() above excludes display:none, visibility:hidden, opacity and zero size. It does NOT ask
     about pointer-events, and disabled below means the disabled attribute, .apDisabled or
     aria-disabled. So an element the BROWSER itself refuses to deliver a click to was still being
     counted as "a control the player must be able to reach".

     ⚠ WHY THIS IS A CORRECTION AND NOT A GATE BEING BENT AROUND A FAILURE. The recipe picker is a
     STACK of two cards by design (Wyatt's ruling 18: show it is two without saying so in numbers).
     The card behind is deliberately pointer-events:none, aria-hidden and out of the tab order —
     what answers a tap on its visible sliver is .pp4RcPeek, a separate control that IS reachable.
     The comment in index.html claims that arrangement "cannot fail the structural check because it
     is not a clickable at all". THAT CLAIM WAS FALSE: the check never looked at pointer-events, so
     the back card was counted, found to be behind the front card, and reported on every leg as an
     unreachable control. The finding was about the instrument's definition, not the game.

     THE BAR THIS HAD TO CLEAR, because loosening a check is how a suite quietly stops meaning
     anything: a genuinely clickable button that is genuinely covered must STILL fail. That is
     red-proofed in scripts/qa/checks_pointer_events_redproof.mjs, which builds both cases and
     asserts one passes and the other fails. */
  const clickable = el => getComputedStyle(el).pointerEvents !== 'none';
  /* THE ELEMENTS ARE KEPT, not just their numbers: who is painted on top where two of them MEET is
     a question about a pair, and a pair cannot be re-asked of the page once the page is gone. */
  const interactiveEls = [...document.querySelectorAll(clickSel)].filter(vis).filter(clickable);
  const interactive = interactiveEls.map(el => {
    const r = el.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
    const hit = document.elementFromPoint(cx, cy);
    const top = !!(hit && (hit === el || el.contains(hit) || hit.contains(el)));
    /* ⭐ IS IT STILL TAPPABLE — ASKED AT FIVE POINTS, NOT ONE, and asked at all only since
       2026-09-17. topmost (above) answers "is the CENTRE mine", and a centre is exactly the part
       of a control something else is most likely to be sitting on. A control whose middle is under
       a bubble but whose corners answer a tap is reachable, and reporting it as unreachable is the
       cry-wolf failure HARD-WON-LESSONS keeps naming. So: the centre plus the four quarter-points,
       and the COUNT is carried, not a verdict — "4/5 points reach it" is a fact the next reader can
       act on; "covered" is not. Descendants count (a tap on a control's own label is a tap on the
       control); an ANCESTOR does not, because a tap that lands on the parent is not a tap on this. */
    const probes = [[cx, cy],
      [r.left + r.width*0.25, r.top + r.height*0.25], [r.left + r.width*0.75, r.top + r.height*0.25],
      [r.left + r.width*0.25, r.top + r.height*0.75], [r.left + r.width*0.75, r.top + r.height*0.75]];
    const hits = probes.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !!(h && (h === el || el.contains(h))); }).length;
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
      hits, hitPts: probes.length,        // how many of the five probe points the control itself answers
      /* a recipe card says WHICH card it is — front, back, or not yet mounted as a stack — because
         "the card behind counted as a control" is only diagnosable from that (2026-09-10) */
      rcpos: el.classList.contains('recipeCard') ? (el.dataset.rcpos || 'unmounted') : null,
      // WHAT covers it, not just THAT it is covered — a finding you cannot act on is half a finding.
      coveredBy: top ? null : named(hit),
      /* covered by a NARRATION BUBBLE — which Wyatt ruled is not a fault over a sail square (see rules 2 and 6 below) */
      underNarration: !top && !!(hit && hit.closest && hit.closest('.pp4Bub')),
      disabled: el.disabled || el.classList.contains('apDisabled') || el.getAttribute('aria-disabled') === 'true' }; });
  // THINGS A PLAYER READS — text that must not be clipped or overrun.
  const textSel = '.pname, .apMsg, .pp4Bub:not(.ambient), .prowRecipe, .pp4CerTitle, .coins, .bkoName';
  const textEls = [...document.querySelectorAll(textSel)].filter(vis);
  const text = textEls.map(el => {
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
  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     WHERE A CONTROL AND THE PROMPT'S OWN WORDS MEET — WHICH OF THE TWO IS PAINTED ON TOP.
     Added 2026-09-17, because rule 6b had been answering that question by assuming it.

     MEASURED (commit 8495d101, .planning/architecture-cleanup-shots/trial-conditions-sail-over-ask-*.png):
     the Tier-1 trial reported "sailCell over '<captain>: tap to sail'" on six legs. It is the other
     way round. #pp4Prompt is position:fixed z-index:30 and #sailHost is z-index:2 inside the board,
     so the cream prompt bubble PAINTS OVER the gold square — 14% to 79% of it, median 70%, and the
     pixel at the tap point is the bubble's cream. The square is still fully tappable, because the
     radial prompt is pointer-events:none and .apMsg never sets it back: 40 of 40 probe points
     returned div.sailCell, 4 of 4 real taps sailed the boat from inside the words' rect, and 4 of 4
     drags separated the two. A rect-vs-rect overlap cannot tell those two stories apart, and the
     rule reported the wrong one six times.

     ⚠ WHY elementFromPoint ALONE IS NOT THE ANSWER, and this is the trap the old rule fell into
     from the other side: hit testing SKIPS pointer-events:none, so asked plainly it says "the sail
     square is on top" about a square that is visibly under cream. Hit order and paint order are
     different facts. So the ask's own pointer-events is neutralised for the length of one
     synchronous probe and restored immediately — no frame is rendered in between, so nothing on
     screen changes and no transition can start (the game's CSS transitions are all per-property;
     there is no transition:all anywhere in it). What comes back is paint order: who a tap WOULD
     land on if the words could take taps at all, which is the same thing as who is drawn on top.

     The box test below decides only WHICH PAIRS ARE WORTH PROBING. It is deliberately looser than
     the judge's shapeOverlap (any positive intersection, no slack), so it is a superset and can
     never decide a fault on its own — shapeOverlap stays the only thing that does.
     ───────────────────────────────────────────────────────────────────────────────────────────── */
  const askEls = textEls.filter(el => el.classList.contains('apMsg'));
  const meetings = [];
  for (const ctl of interactiveEls) for (const ask of askEls) {
    if (ctl === ask || ctl.contains(ask) || ask.contains(ctl)) continue;        // nested — one cannot cover the other
    const a = ctl.getBoundingClientRect(), b = ask.getBoundingClientRect();
    const l = Math.max(a.left, b.left), rr = Math.min(a.right, b.right);
    const t = Math.max(a.top, b.top), bb = Math.min(a.bottom, b.bottom);
    if (rr <= l || bb <= t) continue;
    const x = (l + rr) / 2, y = (t + bb) / 2;
    const was = ask.style.pointerEvents;
    let hit = null;
    try { ask.style.pointerEvents = 'auto'; hit = document.elementFromPoint(x, y); }
    finally { if (was) ask.style.pointerEvents = was; else ask.style.removeProperty('pointer-events'); }
    meetings.push({ ctl: mark(ctl), ask: mark(ask),
      paints: (hit && (hit === ctl || ctl.contains(hit))) ? 'control'
            : (hit && (hit === ask || ask.contains(hit))) ? 'ask' : 'other',
      top: named(hit), at: [Math.round(x), Math.round(y)] });
  }
  return { iw: innerWidth, ih: innerHeight, interactive, text, panels, meetings };
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
  /* CARRY THE NUMBERS, NOT JUST THE LABEL. Wyatt, 2026-09-11, on a report that named a control as
   off-screen while the screenshot showed it centre-screen and tappable: "this seems like nonsense
   -- i don't see it in the screenshots ... or else it just seems to be lying." He was right. The
   check compared a rect to the viewport (withinVP, above) and then kept only e.text, so the claim
   could be neither confirmed nor killed by anyone reading it. A measurement that discards its own
   measurement is an assertion. The rect and the viewport go in the message so the next reader can
   settle it in one glance -- a neighbouring carousel card poking past the edge looks completely
   different from a button a player cannot reach, once you can see the numbers. */
const off = m.interactive.filter(e => !e.disabled && !withinVP(e.rect)).map(e =>
  `${e.text || e.tag} @ ${Math.round(e.rect.l)},${Math.round(e.rect.t)} ${Math.round(e.rect.w)}x${Math.round(e.rect.h)} (viewport ${m.iw}x${m.ih})`);
  F(off.length === 0, "on-screen", off.length ? `clickable off-screen: ${off.slice(0,6).join(", ")}` : "all clickables on screen");

  // 2. every clickable control is the topmost thing at its own centre (not hidden under something)
  /* EXCEPT A SAIL SQUARE UNDER A NARRATION BUBBLE — Wyatt, 2026-09-14, on Wy-Blade's trial photo of "Day 1: Wind NORTH. Tomorrow:
     WEST." over two sail squares: "this is NOT a problem ... That message disappears after a few seconds and can be tapped to
     dismiss. I need you to write a durable record of that so the sea trial stops flagging it." Scoped to exactly what he ruled on —
     a sail square, covered by a narration bubble. Anything else covering a sail square, and a bubble over any other control, still
     fails; scripts/qa/checks_pointer_events_redproof.mjs builds both cases and proves it. docs/INTENDED-BEHAVIOUR.md carries the ruling. */
  const bubbleOverSail = e => e.underNarration && /sailCell/.test(e.tag);
  const occ = m.interactive.filter(e => !e.disabled && withinVP(e.rect) && !e.topmost && !bubbleOverSail(e)).map(e => `${e.text || e.tag}${e.rcpos ? ' [' + e.rcpos + ' card]' : ''} <- covered by ${e.coveredBy}`);
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
    if (!cell.topmost && cell.coveredBy && !bubbleOverSail(cell)) onSail.push(`a sail square <- ${cell.coveredBy}`);   // a narration bubble over it is his ruled exception (rule 2's note)
    for (const o of others) if (shapeOverlap(o, cell, 4)) onSail.push(`"${o.text || o.tag}" over a sail square`);
  }
  F(onSail.length === 0, "sail-clickable", onSail.length ? `${onSail.length} sail square(s) covered: ${[...new Set(onSail)].slice(0,4).join(", ")}` : `every sail square clickable (${sail.length})`);

  // 6b. A control covering the QUESTION IT ANSWERS is still a fault — D-38 sanctions covering the
  //     board, not covering the game's own words: hold-the-sea reveals the board beneath a prompt,
  //     it does not reveal text beneath a button. Scoped to the prompt's own message so narration
  //     bubbles over the sea (which D-38 explicitly permits) are left alone.
  /* ⭐ WHICH OF THE TWO IS ON TOP IS A MEASUREMENT, AND UNTIL 2026-09-17 THIS RULE NEVER TOOK IT.
     It fired on any rect-vs-rect overlap, with no paint test and no hit test, and named the control
     as the culprit by assumption. On six legs of the Tier-1 trial (commit 8495d101) that produced
     "control covering the question it answers: sailCell over '<captain>: tap to sail'" — with the
     truth the other way round: the cream prompt bubble is painted OVER the gold square (z-index 30
     vs 2; 14–79% of it, median 70%), and the square stays fully tappable because the radial prompt
     is pointer-events:none — 40 of 40 probe points returned div.sailCell, 4 of 4 real taps sailed
     the boat from inside the words' rect, 4 of 4 drags separated them. See MEASURE above.

     WYATT'S RULE, given the same day and now the fence in docs/INTENDED-BEHAVIOUR.md §0, verbatim:
     "the failing rule is 'unless it hides a button that the player cannot access by either waiting
     for 0.5 seconds or shifting the screen themselves (eg. dragging the board)'". So a cover-up is
     a fault only when a BUTTON is hidden and the player can neither wait it out nor move the screen
     to reach it. A button that still answers a tap where it stands is not hidden from the player at
     all, whatever is drawn on it.

     Hence the two directions, told apart by the measurement rather than by the geometry:
       - the CONTROL paints over the words  -> the question is unreadable there. Still a fault.
       - the WORDS paint over the control   -> the words are readable, and the control below is
                                               reachable (the count says how reachable). Not a
                                               fault, and the pass line NAMES which is on top so
                                               the next reader never has to re-derive it.
     Whether a control under the words is unreachable is rule 2's subject, not this one's — this
     rule is about the question being legible, and two rules answering one question is how they
     drift (rule 23). */
  const askText = m.text.filter(t => /apMsg/.test(t.tag || "") || t.isAsk);
  const covers = [], onTop = [];
  /* how much of the WORDS' box the control's box takes — the number goes in the message, because a
     button clipping 3% of a long sentence and one sitting on all of it read identically without it */
  const pctOfWords = (a, b) => (b.w > 0 && b.h > 0)
    ? Math.round(100 * Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) / (b.w * b.h)) : 0;
  for (const ctl of m.interactive) for (const t of askText) {
    if (!t.text) continue;
    if (ctl.chain && t.chain && (ctl.chain.includes(t.id) || t.chain.includes(ctl.id))) continue;   // nested — fine
    if (!shapeOverlap(ctl, { rect: t.rect, round: false }, 4)) continue;
    const meet = (m.meetings || []).find(x => x.ctl === ctl.id && x.ask === t.id);
    const ctlName = ctl.text || ctl.tag, pct = pctOfWords(ctl.rect, t.rect);
    // NO EVIDENCE GETS THE STRICT ANSWER, never the lenient one (QA-PROCESS §"the rules that make
    // this hold", rule 1) — an older measurement with no `meetings` reads exactly as it used to.
    if (!meet) covers.push(`"${ctlName}" covers "${t.text}" (${pct}% of the words; which is on top was NOT measured)`);
    else if (meet.paints === 'control') covers.push(`"${ctlName}" covers "${t.text}" (paints over ${pct}% of the words; ${meet.top} answers a tap at ${meet.at.join(",")})`);
    else if (meet.paints === 'ask') onTop.push(`"${t.tag || 'apMsg'}" paints over "${ctl.tag}" (${pct}% of the words${ctl.hits > 0 ? `; still tappable — ${ctl.hits}/${ctl.hitPts} points reach it` : `; the control answers no tap — see not-occluded`} — not a fault)`);
    else onTop.push(`neither "${ctlName}" nor "${t.text}" is on top where they meet — ${meet.top} is (not this rule's fault)`);
  }
  F(covers.length === 0, "no-cover-ask", covers.length ? `control covering the question it answers: ${covers.slice(0,4).join(", ")}`
    : onTop.length ? `the question is never hidden by its own buttons — ${[...new Set(onTop)].slice(0,3).join("; ")}`
    : "the question is never covered by its own buttons");

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
    return out.replace(/\\s+/g, ' ').trim();   // \\s, not \s: this line is inside a template literal, so one backslash never reaches the browser
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
  /* WHICH HALF IS STILL MOVING. ⚠ NOTHING REPORTS THIS ANY MORE — Wyatt dropped the unsettled-
     screen finding from the sea trial on 2026-09-10 ("you can drop this entirely"; see the note in
     leg_verdict.mjs for why he is right). It is still recorded on the sample because it costs one
     string split and a session debugging a genuinely stuck screen will want it; it is NOT a finding
     and must not become one again without him asking. The WAIT itself is load-bearing and stays:
     every measurement in the trial depends on the screen having stopped first. */
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
