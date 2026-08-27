/* narration_probe.mjs — the in-page recorder narration_timeline.mjs arms before it clicks anything.
 *
 * WHY IT IS ITS OWN FILE. The same recorder has to be armed on a solo page, on a host and on a
 * guest — three pages, one definition. A copy per leg is exactly the "two things kept in step by
 * discipline" shape CLAUDE.md rule 23 is about, and the host/guest legs are the ones whose numbers
 * have to be comparable to the millisecond.
 *
 * WHAT IT MEASURES, and each one exists because an ordinary check could not see it:
 *   1. Every `.pp4Bub` narration bubble: when it was created, when it was marked `out` (its 300ms
 *      fade), when it left the DOM. `selfretire_ms` = out_ms - created_ms. A bubble that pops in
 *      and is marked for removal in the same instant is Wyatt's items 2 and 8, and it is invisible
 *      to any check that only asks "did the narration render".
 *   2. OCCLUSION. While `#pp4Veil` (the flip ceremony) is on screen, a bubble in `#pp4Fx`
 *      (z-index 21, veil 44) is drawn but cannot be seen. `visible_ms` subtracts that. This is the
 *      flip-result number and an ordinary hold measurement cannot see it by construction.
 *   3. The `classList.add('out')` CALL STACK, matched to the bubble by time. That stack is what
 *      named promptTick in the original trace and it is what proves the fix.
 *   4. `#pp4Prompt` / `#actionPanel` display + pendingReveal + needsAction, as a timeline — so the
 *      gap between the mirror vanishing and the real prompt arriving is a number, not an impression.
 *   5. A rAF sampler of the board's own top edge over the first seconds of a voyage — item 5's
 *      claimed layout jump, measured rather than assumed.
 *   6. Audio node starts, so a cue that fires TWICE is countable rather than eyeballed.
 *
 * EVERYTHING IS BOUNDED. The occlusion interval stops itself after MAX_TICKS, the rAF sampler after
 * MAX_FRAMES. Nothing here can outlive the page, and nothing here can spin.
 */

/* Armed with Runtime.evaluate. Returns "narration probe armed". */
export const PROBE_SRC = `(() => {
  if (window.__NT && window.__NT.armed) return "already armed";
  const NT = window.__NT = { armed: true, t0: performance.now(), bubbles: [], outStacks: [],
    attrs: [], boardTop: [], cues: [], marks: {}, ticks: 0, frames: 0 };
  const now = () => Math.round(performance.now() - NT.t0);
  NT.now = now;
  const rec = new Map();

  /* --- 1/2/3: the bubbles ------------------------------------------------- */
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "childList") {
        m.addedNodes.forEach(n => {
          if (n.nodeType !== 1 || !n.classList || !n.classList.contains("pp4Bub")) return;
          const txt = (n.textContent || "").trim();
          const r = { text: txt.slice(0, 90), chars: txt.length, created_ms: now(),
            out_ms: null, removed_ms: null, occluded_ms: 0,
            veiled_at_birth: !!document.getElementById("pp4Veil"),
            ambient: n.classList.contains("ambient"), stack: null };
          rec.set(n, r); NT.bubbles.push(r);
        });
        m.removedNodes.forEach(n => { const r = rec.get(n); if (r && r.removed_ms == null) r.removed_ms = now(); });
      } else if (m.type === "attributes" && m.target.classList && m.target.classList.contains("pp4Bub")) {
        const r = rec.get(m.target);
        if (r && r.out_ms == null && m.target.classList.contains("out")) {
          r.out_ms = now();
          // the stack is captured by the DOMTokenList patch below; a DOMTokenList carries no
          // back-reference to its element, so it is matched by time (nearest within 8ms) rather
          // than by identity. Stated here rather than implied — it is a match, not a proof.
          for (let i = NT.outStacks.length - 1; i >= 0; i--) {
            if (Math.abs(NT.outStacks[i].ms - r.out_ms) <= 8) { r.stack = NT.outStacks[i].stack; break; }
          }
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  const ADD = DOMTokenList.prototype.add;
  DOMTokenList.prototype.add = function (...t) {
    if (t.indexOf("out") >= 0 && NT.outStacks.length < 400) {
      NT.outStacks.push({ ms: now(), stack: String(new Error().stack || "").split("\\n").slice(1, 6).join(" <- ").slice(0, 400) });
    }
    return ADD.apply(this, t);
  };

  /* --- 4: the prompt's own timeline --------------------------------------- */
  const snapAttrs = (why) => {
    const box = document.getElementById("pp4Prompt"), ap = document.getElementById("actionPanel");
    NT.attrs.push({ ms: now(), why,
      promptDisplay: box ? (box.style.display || "") : null,
      promptCls: box ? box.className : null,
      pendingReveal: ap ? ap.classList.contains("pendingReveal") : null,
      needsAction: ap ? ap.classList.contains("needsAction") : null,
      apText: ap ? (ap.textContent || "").trim().slice(0, 60) : null });
  };
  NT.snapAttrs = snapAttrs;
  const amo = new MutationObserver(() => { if (NT.attrs.length < 900) snapAttrs("mutation"); });
  const box0 = document.getElementById("pp4Prompt"), ap0 = document.getElementById("actionPanel");
  if (box0) amo.observe(box0, { attributes: true, attributeFilter: ["style", "class"] });
  if (ap0) amo.observe(ap0, { attributes: true, attributeFilter: ["style", "class"] });

  /* --- 2 (sampler) : occlusion, bounded ----------------------------------- */
  const TICK_MS = 30, MAX_TICKS = 40000;          // ~20 minutes, then it stops itself
  NT.tickTimer = setInterval(() => {
    if (++NT.ticks > MAX_TICKS) { clearInterval(NT.tickTimer); return; }
    if (!document.getElementById("pp4Veil")) return;
    for (const r of rec.values()) if (r.removed_ms == null) r.occluded_ms += TICK_MS;
  }, TICK_MS);

  /* --- 6: audio node starts ------------------------------------------------ */
  try {
    const P = AudioBufferSourceNode.prototype, S0 = P.start;
    P.start = function (...a) { if (NT.cues.length < 500) NT.cues.push(now()); return S0.apply(this, a); };
  } catch (e) {}

  return "narration probe armed";
})()`;

/* A BOUNDED rAF SAMPLER OF THE BOARD'S OWN TOP EDGE. Started explicitly (not at arm time) so it
   covers the first seconds of a VOYAGE rather than of the welcome screen. Drives frames while it
   samples: an idle headless page stops producing them and a layout jump then measures as zero. */
export const BOARD_SAMPLER_SRC = (ms) => `(() => {
  const NT = window.__NT; if (!NT) return "not armed";
  NT.boardTop = []; NT.frames = 0;
  const t0 = performance.now(), MAX_FRAMES = ${Math.ceil(ms / 16) + 60};
  const el = () => document.getElementById("boardwrap") || document.getElementById("pp4Board");
  const step = () => {
    const e = el();
    if (e) { const t = Math.round(e.getBoundingClientRect().top * 10) / 10;
      const last = NT.boardTop[NT.boardTop.length - 1];
      if (!last || last[1] !== t) NT.boardTop.push([Math.round(performance.now() - t0), t]); }
    if (++NT.frames < MAX_FRAMES && performance.now() - t0 < ${ms}) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return "board sampler running";
})()`;

/* THE PILL GEOMETRY PROBE. Reads the ask pill's rendered rect against BODY's own rect, not the
   window's: the desktop layout caps body to a centred column, so a pill can be inside the window
   and still hang off the board into the dark margin — which is exactly what 63.39px meant. */
export const PILL_PROBE_SRC = `(() => {
  const m = document.querySelector("#actionPanel .apMsg");
  const b = document.body.getBoundingClientRect();
  if (!m) return { none: true, body: [b.left, b.right] };
  const r = m.getBoundingClientRect();
  return { msg: [r.left, r.top, r.right, r.bottom, r.width, r.height],
           body: [b.left, b.top, b.right, b.bottom, b.width, b.height],
           overRightPx: Math.round((r.right - b.right) * 100) / 100,
           overLeftPx: Math.round((b.left - r.left) * 100) / 100,
           text: (m.textContent || "").trim().slice(0, 70) };
})()`;

/* THE HOLD MEASUREMENT. Draws three narration lines of known length through the game's OWN
   renderer (window.__pp4.flash — the one both tiers reach) and reads back what the bubble
   observer recorded. Nothing is derived from the formula: the number is the bubble's own life.
   The three lengths are D-34's own anchors plus a line long enough to be at D-10's ceiling. */
export const HOLD_TEXTS = {
  c27: "Blown into the trade winds!",                                                    // 27
  c75: "The gale hauls ye three squares north and the crates slide across the deck ohh", // 79
  long: "A squall out of the black takes the fleet abeam, hurls every captain three squares north, and leaves the Sugar Seas white to the horizon with nothing but salt and swearing aboard"  // 176
};

/* `hold_ms` is create -> marked-for-fade. `life_ms` adds the 300ms fade tail, and it is the number
   D-10's own 5304ms/5297ms result was quoted in — so the before/after table compares life to life.
   The bubble is matched by ORDER (the first one born after the mark), never by its text: the
   typewriter reveal is already rewriting that text by the time the observer callback runs, so a
   text match here would be a check that silently stops finding anything. */
/* MEASURED TWICE, AND THE SHORTER ONE IS THE TRUE ONE. The hold is a DEADLINE serviced by the
   stage's own tick loop (stage.js: "the timeout stays as the fast path; the deadline is the belt"),
   so a sample can only ever come back LATE — one run of the 178-character line read 4996ms and the
   next 5706ms, on identical code. Taking the minimum of two samples is what makes a 400ms
   before/after tolerance mean something instead of measuring the tick loop's luck. */
/* WAIT FOR A QUIET BOARD BEFORE MEASURING ANYTHING. In a crew game the host is still playing the
   bots between the humans' turns, so "nothing is happening" is a state you wait for, not one you
   assume: a hold measured into a bot's narration read 2ms on the host and would have looked like a
   spectacular improvement. Bounded — it gives up and says so rather than waiting forever. */
export const waitQuiet = async (C, stillMs = 3000, maxMs = 40000) => {
  const t0 = Date.now(); let last = -1, since = Date.now();
  for (let i = 0; Date.now() - t0 < maxMs && i < 200; i++) {
    const n = await C.ev(`window.__NT ? window.__NT.bubbles.length : -1`);
    if (n !== last) { last = n; since = Date.now(); }
    else if (Date.now() - since >= stillMs) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
};

export const measureHoldTwice = async (C, key, text, waitMs, tries = 4) => {
  /* TWO NOISE SOURCES, PULLING OPPOSITE WAYS, and taking the minimum of a few samples would have
     hidden the worse one. Late service by the stage's tick loop makes a sample LONGER; another
     narration line arriving mid-hold retires this bubble early and makes it SHORTER — which in a
     crew game (where the host is still playing the bots between human turns) produced a 1ms "hold"
     that would have read as a spectacular improvement. So an INTERRUPTED sample is discarded
     outright, not averaged in, and the minimum is taken only over clean ones. */
  const clean = [];
  for (let i = 0; i < tries && clean.length < 2; i++) {
    await waitQuiet(C);
    const m = await measureHold(C, key + "_" + i, text, waitMs);
    if (m && !m.interrupted) clean.push(m);
  }
  if (!clean.length) return null;
  return clean.reduce((m, x) => (x.hold_ms < m.hold_ms ? x : m), clean[0]);
};

export const measureHold = async (C, key, text, waitMs) => {
  await C.ev(`(() => { const NT = window.__NT; NT.marks[${JSON.stringify(key)}] = NT.now();
    NT.markIdx = NT.markIdx || {}; NT.markIdx[${JSON.stringify(key)}] = NT.bubbles.length;
    window.__pp4.flash(${JSON.stringify(text)}); return true; })()`);
  await new Promise(r => setTimeout(r, waitMs));
  const got = await C.ev(`(() => { const NT = window.__NT;
    const i = NT.markIdx[${JSON.stringify(key)}]; const hit = NT.bubbles[i] || null;
    if (!hit) return null;
    // a LATER bubble born before this one was marked for fade is what cut it short
    const cut = NT.bubbles.slice(i + 1).some(b => hit.out_ms != null && b.created_ms <= hit.out_ms + 5);
    return { created: hit.created_ms, out: hit.out_ms, removed: hit.removed_ms,
      chars: hit.chars, text: hit.text.slice(0, 30), interrupted: cut,
      centre: !!document.querySelector("#pp4Prompt.pp4Center") }; })()`);
  if (!got || got.out == null) return null;
  return { hold_ms: got.out - got.created, life_ms: got.removed != null ? got.removed - got.created : null,
    chars: got.chars, text: got.text, interrupted: !!got.interrupted || !!got.centre };
};

/* ---- D-35: the recipe modal's two measured facts -------------------------------------------
 * Wyatt's two changes to option C are both geometry, so both are read with getBoundingClientRect
 * rather than eyeballed:
 *   1. the gap between the bottom of the image and the top of the italic description, against
 *      that description's OWN line-height (his complaint is relative to the type, not to a pixel);
 *   2. the distance between the top of the gradient behind the image and the BOTTOM EDGE of the
 *      title's separator — which is not its own element but the h2's `border-bottom: 3px double`,
 *      so the separator's bottom IS the h2's border-box bottom. Reading anything else would
 *      measure a line that does not exist.
 * Returns `missing:true` rather than throwing when the modal is not open, so a leg that never
 * reaches a recipe reports honestly instead of failing the whole run. */
export const RECIPE_PROBE_SRC = `(async () => {
  const g = window.appState && appState.game;
  const seat = (window.appState && appState.mySeat) || 0;
  const rec = g && g.players && g.players[seat] && g.players[seat].recipe;
  if (!rec) return { missing: true, why: "no recipe on this seat yet" };
  const ui = await import("/src/ui/index.js");
  ui.openRecipeModal(rec);
  await new Promise(r => setTimeout(r, 700));
  const body = document.getElementById("recipeModalBody");
  if (!body) return { missing: true, why: "no #recipeModalBody" };
  const h2 = body.querySelector("h2");
  /* "THE LINE SEPARATING THE TITLE" IS THE 3px DOUBLE RULE, AND SINCE D-35 IT BELONGS TO THE ROW,
     NOT TO THE h2. Reading h2.bottom instead measured the bottom of the TEXT — which sits 20px
     above the rule, because the row is a flex box centring a one-line heading against two 38px
     icon buttons. That first reading condemned a gradient that was in fact flush, which is the
     whole reason CLAUDE.md says to suspect the check when it condemns something that looks right.
     The row's border-BOX bottom is the rule's own bottom edge, so that is what is read. */
  const sepEl = body.querySelector(".recipeModalTitleRow") || h2;
  const img = body.querySelector(".recipeModalThumb");
  const wrap = body.querySelector(".recipeModalThumbWrap") || img;
  const desc = body.querySelector(".recipeModalDesc");
  const rb = el => el ? el.getBoundingClientRect() : null;
  const H = rb(sepEl), I = rb(img), Wp = rb(wrap), D = rb(desc);
  const cs = desc ? getComputedStyle(desc) : null;
  const lh = cs ? (cs.lineHeight === "normal" ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight)) : null;
  const wcs = wrap ? getComputedStyle(wrap) : null;
  const grad = wcs ? (wcs.backgroundImage || "") : "";
  return {
    title_above_image: !!(H && I) && H.top < I.top,
    separator_el: sepEl && sepEl.className ? String(sepEl.className) : (h2 ? "h2" : null),
    separator_bottom: H ? +H.bottom.toFixed(2) : null,
    gradient_top: Wp ? +Wp.top.toFixed(2) : null,
    gradient_declared: /gradient/.test(grad),
    gradient_fades_to_transparent: /transparent|rgba\\([^)]*,\\s*0\\)/.test(grad),
    image_top: I ? +I.top.toFixed(1) : null,
    image_bottom: I ? +I.bottom.toFixed(1) : null,
    desc_top: D ? +D.top.toFixed(1) : null,
    image_to_desc_gap_px: (I && D) ? +(D.top - I.bottom).toFixed(2) : null,
    desc_line_height_px: lh ? +lh.toFixed(2) : null,
    title_row_sticky: h2 ? (getComputedStyle(h2.closest(".recipeModalTitleRow") || h2).position === "sticky") : null,
    icons_in_title_row: !!body.querySelector(".recipeModalTitleRow .recipeIconBtn"),
  };
})()`;
