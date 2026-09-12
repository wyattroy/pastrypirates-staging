// src/ui/course.js — THE ONWARD GUIDE: a dotted course over the real travellable path,
// ending in a pulsing treasure X.
//
// The half of the tutorial that words cannot do. A sentence can say "head for a dock"; it cannot
// say THAT one. Wyatt killed the bearing-pointer alternative himself, and his reason is the one
// that matters: "it may point to a dock that cannot be reached by moving in the direction it's
// pointing."
//
// EVERY NUMBER HERE IS HIS. He dialled them in the Course Tuner on 2026-09-03 and they are the
// spec, not a starting point — see "THE COURSE — FINAL" in .claude/memory/DECISIONS.md. The
// drawing algorithm below is the tuner's own, ported from canvas to the board's two layers;
// porting it rather than re-inventing it is the only way the thing he approved is what ships.
//
// ── THE TWO-LAYER SPLIT, AND WHY (docs/BOARD-RENDERING.md §5) ──────────────────────────────────
// The DASHES ARE STATIC, so they are SVG inside #board and the camera moves them for free via the
// viewBox — no transform to compose, nothing to keep in step on a zoom.
// The MARKER PULSES CONTINUOUSLY, so it must be HTML: Chrome does not composite an SVG transform
// animation at all (measured on this project: ~62 layouts/sec as SVG, ZERO as HTML). It lives in
// its own layer, #courseHost, which is registered in CAM_HTML_LAYERS — §3 calls that the step
// that gets forgotten, and #rimHost got it wrong exactly that way ("the wind arrows are not
// attached to the board!").
//
// It sits BELOW #sailHost: the course is scenery and the gold squares are a choice, and §1's rule
// is that scenery must never cover a choice.
//
// ── WHAT IT IS ALLOWED TO SAY ─────────────────────────────────────────────────────────────────
// It points at the NEAREST dock holding something ye still need, NEVER the best one. Nearest is a
// fact; best depends on price, rivals and wind. That line is what keeps this on the right side of
// his third core value — dynamics taught, strategy not — and it outlives the tutorial.

import { appState } from "../state/index.js";

/* WYATT'S FINAL SETTINGS, 2026-09-03, verbatim from the tuner's Copy button.
   NOT the set he called "ideal" the day before (len 6.5 / gap 10.5 / sep 0.38 / no jitter): he
   came back to tighter dashes with a little jitter and a far higher minimum separation, and 0.85
   is the number that guarantees no two dashes touch where a route folds back over itself. This
   one is later and wins. */
/* ⭐ HIS SECOND PASS, pasted out of the Course Tuner on 2026-09-07 (playtest item 7) and replacing
   the 2026-09-03 block. What changed and what it does to the picture, so the diff reads as a
   decision rather than a pile of numbers:
     len   8   -> 5     shorter dashes
     gap   7   -> 5.5   and closer together — a finer, denser dotted line
     thk   2.6 -> 2.2   drawn lighter
     ang   7   -> 0     dashes now sit square to the course; no per-dash angle jitter at all
     jit   0.02-> 0     and no positional wobble either — the wander is the WAVES only now
     a2/f2 .05/.85 -> .06/.84   the second wave a touch deeper and slower
     rnd   14  -> 11    a different draw of the same deterministic hash
     sep   0.85-> 0.12  the minimum-separation cull all but switched off, which is what lets
                        dashes this short sit this close without being thinned out
   ⚠ pd AND ps ARE DESCRIPTIVE, NOT WIRED, and that is now written down instead of implied. The
   marker's pulse is CSS, and since his item 19 it is the game's ONE shared attention keyframe
   (pp4Grow in index.html) rather than a private copy that happened to agree with these two numbers.
   They are kept because the tuner emits them and a block that round-trips is worth more than two
   fewer keys — but nothing reads them, so changing them here changes nothing on screen. */
export const COURSE = {
  len: 5, gap: 5.5, thk: 2.2, ang: 0,
  a1: 0.13, f1: 0.3, a2: 0.06, f2: 0.84, jit: 0, rnd: 11,
  o0: 0.98, o1: 0.42, sep: 0.12, clp: 0.34,
  mk: 0.5, pd: 0.15, ps: 1.2, mark: "x",
};

/* THE TUNER'S RULER. He dialled every length against a board whose cell was 26 CSS px, so a raw
   `len: 8` means "8/26 of a square". Converting through the cell rather than hardcoding a factor
   is what keeps his look identical at any grid size — and it is why nothing below is a constant
   in board units. (CLAUDE.md: "a hardcoded price, threshold or cap is a price list standing in for
   a quantity that moves by an order of magnitude across a voyage.") */
const TUNER_CELL = 26;

const SVGNS = "http://www.w3.org/2000/svg";
const HOST_ID = "courseHost";
export const COURSE_MARKER_SRC = "assets/icons/course-marker-x.png";

/* board user units -> cqw. 640 board units == 100cqw because #boardwrap is
   container-type:inline-size and the viewBox is 0 0 640 640, so the mapping is 1:1 with no scale
   factor to keep in step on resize (BOARD-RENDERING §2).
   ⚠ DRIFT HAZARD, and §2 already names it: this helper now exists in FOUR places (board.js twice,
   flow.js, here). They agree today. Change the mapping and change all four. Converging them onto
   one export is filed rather than done, because it touches the two renderers G25 exists to keep
   identical and that is not a change to make in the same commit as a new overlay. */
const CQ = v => (v / 640 * 100) + "cqw";

/* The tuner's deterministic hash — same numbers in, same wobble out, on every device and in
   every replay. Not Math.random(): THE PILOT NEVER DRAWS A RANDOM NUMBER, which is the fourth
   guarantee (same seed, guide on and off, identical event stream). */
const rnd1 = s => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };

/* ================= charting the tour ================= *
 *
 * ONE CONTINUOUS TOUR — his ruling, and his own reinterpretation of mine:
 *   "it would be awesome if the dotted course charted from their position now to kind of through
 *    to the first closest dock through the last dock to show them the shortest possible path
 *    right now through the game."
 * with his own caveat recorded so nobody later claims the guide is advice:
 *   "during the actual game, that shortest path might not end up being the path that they wanna
 *    take because the wind can change their strategy... But it's okay because this starter path is
 *    just trying to help the player visualize where the recipe would take them."
 *
 * ⚠ TORTUGA IS LAND. His correction, 2026-09-02: "it looks like your algorithm for computing path
 * is treating tortuga like sailable ocean; it is not. It is land." The route finder I wrote had
 * re-derived the game's own predicate and dropped the `!isHome` clause. So nothing here re-derives
 * anything: it calls the engine's own flood — game.seaRoutes() since 2026-09-11, which carries the
 * engine's `!blocked && !isIsland && !isHome` AND its trade-wind rule. A route finder that answers a
 * question the engine already answers should CALL the engine — that is rule 9 and rule 23 together.
 */

const key = c => c[0] + "," + c[1];
// orthogonal only — "in your mock up, the dots are going diagonally, which is not possible in the
// game." Order is fixed so a tie between two equal-length routes always resolves the same way and
// the drawing is stable between renders.
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Which docks still matter to this captain, and where they are.
 *  A sold-out island still has one crate when the black market is on, so "in stock" is not the
 *  test — what ye still NEED is. */
function wantedDocks(game, player, ingsOverride){
  /* `ingsOverride` is the RECIPE CHOICE case: at that moment the captain has no recipe yet, so
     "what ye still need" is the card being considered rather than anything on the player. His
     ruling: "that Dotted course should appear during the recipe choice phase to help them make a
     decision." Same charting, same drawing, one extra argument — not a second code path. */
  const needs = ingsOverride || (game.needs && game.needs(player)) || [];
  const out = [];
  for (const ing of needs){
    const c = (game.dockOf && game.dockOf[ing]) || (game.islandOf && game.islandOf[ing]);
    if (c) out.push({ ing, cell: [c[0], c[1]] });
  }
  return out;
}

/**
 * Chart the whole voyage: from where ye are now, to the nearest dock holding something ye still
 * need, then on to the next nearest from there, through to the last.
 *
 * When the recipe is FULL the guide re-aims at Tortuga, and that is how "how to win" is taught
 * without a sentence: the Ahoy card already says "sail home first to win", but it never says
 * WHICH SQUARE is home — and this file's whole argument is that a place needs UI, not words.
 *
 * @returns {{cells:number[][], marks:number[][], home:boolean}|null}
 */
export function chartTour(game, player, ingsOverride){
  if (!game || !player || !player.pos || !game.seaRoutes) return null;
  const start = [player.pos[0], player.pos[1]];
  const want = wantedDocks(game, player, ingsOverride);
  /* ⭐ THE TRADE WINDS ARE PART OF THE SEA — Wyatt, 2026-09-11: "it doesn't take into account the
     trade winds! but it must -- both to calculate the true shortest route, and because the current
     dotted line asks me to sail through the trade winds as if they're a regular square."
     This used to walk game.waterField(), which floods the rim like open water. It now asks the
     engine's game.seaRoutes(): a step onto the rim lands on that arc's head, the ride is free, and
     the rim is never sailed along. A leg that takes a ride comes back with the rim squares the
     current carries ye through, so the line follows the current instead of cutting across it. */

  // ---- the recipe is full: one leg, home to Tortuga
  if (!want.length){
    const home = game.home;
    if (!home) return null;
    // Tortuga is LAND, so the route ends on the water beside it — the same adjacency the bakery
    // button already requires. The X still goes ON the island: that is the spot ye are marking.
    const routes = game.seaRoutes(start);
    let best = null, bestD = Infinity;
    for (const s of STEPS){
      const o = [home[0] + s[0], home[1] + s[1]];
      if (game.blocked(o) || game.isIsland(o) || game.isHome(o)) continue;
      const d = routes.dist[key(o)];
      if (d !== undefined && d < bestD){ bestD = d; best = o; }
    }
    if (!best) return null;
    const cells = game.seaRoute(routes, start, best);
    if (cells.length < 2) return null;
    return { cells, marks: [[home[0], home[1]]], home: true };
  }

  // ---- greedy nearest-first through every dock the recipe still needs
  const remaining = want.slice();
  const cells = [];
  const marks = [];
  let cur = start;
  while (remaining.length){
    const routes = game.seaRoutes(cur);   // ONE flood from where this leg starts serves every dock
    let pick = -1, pickPath = null, pickD = Infinity;
    for (let i = 0; i < remaining.length; i++){
      const d = routes.dist[key(remaining[i].cell)];
      if (d === undefined || d >= pickD) continue;
      const p = game.seaRoute(routes, cur, remaining[i].cell);
      if (!p.length) continue;
      pickD = d; pick = i; pickPath = p;
    }
    if (pick < 0) break;                       // nothing else reachable — draw what we charted
    // the legs join, so drop the repeated cell where one ends and the next begins
    cells.push(...(cells.length ? pickPath.slice(1) : pickPath));
    marks.push(remaining[pick].cell);
    cur = remaining[pick].cell;
    remaining.splice(pick, 1);
  }
  if (cells.length < 2) return null;
  return { cells, marks, home: false };
}

/* ================= the source line ================= *
 * THE TUNER'S OWN ALGORITHM, and the order of it is the point: build the wavy line FIRST, sample
 * it finely, clamp it, and only THEN cut it into dashes by walking its arc length. A dash is
 * therefore a SLICE of the real line and bends with it — his ruling: "each dash curves along the
 * invisible line it traces" — instead of being a straight tick stamped at a point on it.
 *
 * And the lesson in his numbers, which was exactly backwards from my instinct: he removed almost
 * every source of randomness and got the hand-drawn look from LAYERED SLOW WAVES instead.
 */

function spline(pts, per){
  if (pts.length < 2) return pts.slice();
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++){
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let k = 0; k < per; k++){
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function sourceLine(cells, cellPx){
  const C = cellPx;                       // one square, in board units
  const U = C / TUNER_CELL;               // his ruler -> board units
  const S = COURSE;
  const centres = cells.map(c => [(c[0] + 0.5) * C, (c[1] + 0.5) * C]);
  const sm = spline(centres, Math.round(S.rnd));
  const FINE = Math.max(0.5, 1.6 * U);
  const pts = []; let acc = 0, arc = 0;
  for (let i = 1; i < sm.length; i++){
    const [x1, y1] = sm[i - 1], [x2, y2] = sm[i];
    const seg = Math.hypot(x2 - x1, y2 - y1); if (!seg) continue;
    const ux = (x2 - x1) / seg, uy = (y2 - y1) / seg, nx = -uy, ny = ux;
    let d = FINE - acc;
    while (d <= seg){
      const s = arc + d, cyc = s / C;
      const w = Math.sin(cyc * S.f1 * Math.PI * 2) * S.a1 + Math.sin(cyc * S.f2 * Math.PI * 2 + 1.7) * S.a2;
      // the random jitter is LOW frequency too — sampled per half-square, not per sample point,
      // or it becomes the fizz he asked me to take out ("too jittery")
      const jSeed = Math.floor(cyc * 2);
      const j = ((rnd1(jSeed + 13) - 0.5) + (rnd1(jSeed + 91) - 0.5) * 0.5) * 2 * S.jit;
      const off = (w + j) * C;
      pts.push([x1 + ux * d + nx * off, y1 + uy * d + ny * off]);
      d += FINE;
    }
    acc = (acc + seg) % FINE; arc += seg;
  }
  // EVERY MARK STAYS INSIDE THE SQUARE IT CROSSES — his requirement, and the reason the wave can
  // be as deep as it is without the line wandering into water it never sails.
  const lim = S.clp * C;
  for (const q of pts){
    let best = null, bd = 1e9;
    for (const c of centres){ const dd = Math.hypot(q[0] - c[0], q[1] - c[1]); if (dd < bd){ bd = dd; best = c; } }
    if (best && bd > lim){ const k = lim / bd; q[0] = best[0] + (q[0] - best[0]) * k; q[1] = best[1] + (q[1] - best[1]) * k; }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] || 1 };
}

function atArc(line, s){
  const { pts, cum } = line;
  if (!pts.length) return [0, 0];
  if (s <= 0) return pts[0];
  if (s >= cum[cum.length - 1]) return pts[pts.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1){ const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}

function dashesOf(line, cellPx){
  const U = cellPx / TUNER_CELL, S = COURSE;
  const L = Math.max(0.5, S.len * U), G = Math.max(0.2, S.gap * U), pitch = L + G;
  const out = []; let s = L * 0.5, n = 0;
  while (s + L <= line.total){
    const seg = [];
    const steps = Math.max(2, Math.round(L / Math.max(0.5, 1.4 * U)));
    for (let k = 0; k <= steps; k++) seg.push(atArc(line, s + (L * k) / steps));
    const mid = atArc(line, s + L / 2);
    // a small rotation about the dash's own middle keeps it hand-drawn without straightening it
    const a = (rnd1(n + 61) - 0.5) * 2 * (S.ang * Math.PI / 180);
    if (a){
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const q of seg){
        const dx = q[0] - mid[0], dy = q[1] - mid[1];
        q[0] = mid[0] + dx * ca - dy * sa; q[1] = mid[1] + dx * sa + dy * ca;
      }
    }
    out.push({ seg, mid, t: (s + L / 2) / line.total });
    s += pitch; n++;
  }
  /* NO TWO DASHES EVER TOUCH — his requirement, and the thing sep:0.85 buys:
     "it kind of ends up looking like a train map instead of a linear journey". This is what stops
     a doubled-back leg piling its dashes on top of the leg it is crossing. */
  const minSep = S.sep * pitch;
  if (minSep <= 0) return out;
  const kept = [];
  for (const d of out){
    let ok = true;
    for (const q of kept){ if (Math.hypot(d.mid[0] - q.mid[0], d.mid[1] - q.mid[1]) < minSep){ ok = false; break; } }
    if (ok) kept.push(d);
  }
  return kept;
}

/* ================= drawing ================= */

const pathD = seg => "M" + seg.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("L");

/** The HTML layer the pulsing markers live in. Created lazily, positioned in the stack, and
 *  registered in CAM_HTML_LAYERS by stage.js — without that it detaches the moment the director
 *  zooms, which is exactly what #rimHost did. */
export function courseHost(){
  let h = document.getElementById(HOST_ID);
  if (h) return h;
  const wrap = document.getElementById("boardwrap");
  if (!wrap) return null;
  h = document.createElement("div");
  h.id = HOST_ID;
  // between the trade-wind current and the sail squares: scenery above scenery, below a choice
  const before = document.getElementById("sailHost");
  if (before) wrap.insertBefore(h, before); else wrap.appendChild(h);
  return h;
}

/* ══════════════════ WHAT WAS LAST DRAWN, SO IT CAN COME BACK ══════════════════
   Wyatt, 2026-09-07 playtest item 9: "when i am about to sail and parrot is on, i can see the
   dotted line on the board. if i then click it off, the dotted line disappears. this is good. But
   when i click parrot on again, the dotted line doesn't return — it should though! re-enabling
   parrot should immediately restore all the hint state."

   THAT WAS A DELIBERATE DECISION OF MINE AND HE HAS OVERRULED IT. The toggle's own comment in
   src/ui/stage.js said: "Switching ON does not draw a course here on purpose: the guide belongs to
   a prompt, and it arrives with the next one." Reasonable on paper; from the seat it means the
   control does nothing when you press it, which is the same complaint that made OFF clear the
   course instantly in the first place. A toggle must answer in both directions.

   SO THE MODULE REMEMBERS ITS LAST REQUEST — the arguments, never the drawn nodes, so a restore
   re-derives the tour from the live game rather than re-hanging stale SVG. Two ways to erase:
     clearCourse()  — take the drawing off the board, KEEP the memory (the parrot going quiet)
     forgetCourse() — the moment itself is over, so there is nothing to come back to (prompt
                      teardown, the ladder reaching its bottom rung)
   Getting those two the wrong way round is the whole risk here, so they are named for what they
   mean rather than for what they do to the DOM. */
let lastRequest = null;

/** Remove everything this module drew. Safe to call when nothing is up.
 *  KEEPS the memory — see redrawCourse(). */
export function clearCourse(){
  document.querySelectorAll(".pp4Course").forEach(e => e.remove());
  const h = document.getElementById(HOST_ID);
  if (h) h.textContent = "";
}

/** Erase, and forget there was ever anything to redraw. For teardowns. */
export function forgetCourse(){
  lastRequest = null;
  clearCourse();
}

/** Put back whatever was last asked for, if anything. Returns true if it drew.
 *  Re-derives the tour from the CURRENT game state, so a restore after a few turns shows where
 *  the captain must go now — not a photograph of where they were told to go before. */
export function redrawCourse(){
  const r = lastRequest;
  if (!r) return false;
  return !!showCourseFor(r.game, r.player, r.svg, r.cellPx, r.ings);
}

/**
 * Draw a charted tour. `svg` is #board and `cellPx` is 640/grid — both handed in rather than
 * re-derived here, so this module owns no second opinion about board geometry.
 *
 * @param {{cells:number[][], marks:number[][], home:boolean}} tour
 */
export function drawCourse(svg, cellPx, tour){
  clearCourse();
  if (!svg || !tour || !tour.cells || tour.cells.length < 2) return;
  const S = COURSE, U = cellPx / TUNER_CELL;
  const line = sourceLine(tour.cells, cellPx);
  const dashes = dashesOf(line, cellPx);

  // ONE group, so a single remove takes the whole course with it
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "pp4Course");
  g.setAttribute("pointer-events", "none");
  const shadowDrop = 1.6 * U;
  const thk = (S.thk * U).toFixed(2);
  for (const d of dashes){
    // OPACITY TRAVELS, SIZE DOES NOT — "don't modify their scale over distance, just their
    // opacity." Constant thickness all the way, fading from the boat to the far end.
    const alpha = S.o0 + (S.o1 - S.o0) * d.t;
    const under = document.createElementNS(SVGNS, "path");
    under.setAttribute("d", pathD(d.seg.map(p => [p[0], p[1] + shadowDrop])));
    under.setAttribute("stroke", "rgba(0,26,36,.9)");
    under.setAttribute("stroke-width", thk);
    under.setAttribute("stroke-linecap", "round");
    under.setAttribute("stroke-linejoin", "round");
    under.setAttribute("fill", "none");
    under.setAttribute("opacity", (alpha * 0.5).toFixed(3));
    g.appendChild(under);
    const ink = document.createElementNS(SVGNS, "path");
    ink.setAttribute("d", pathD(d.seg));
    // CREAM, NEVER GOLD. Gold means "tap me" in this game — it is the sail square's colour — and a
    // gold trail would promise a move ye cannot make. Round dashes, never chevrons, so it cannot
    // be read as a trade-wind current either.
    ink.setAttribute("stroke", "#FFFDF2");
    ink.setAttribute("stroke-width", thk);
    ink.setAttribute("stroke-linecap", "round");
    ink.setAttribute("stroke-linejoin", "round");
    ink.setAttribute("fill", "none");
    ink.setAttribute("opacity", alpha.toFixed(3));
    g.appendChild(ink);
  }
  svg.appendChild(g);
  paintMarks(tour.marks, cellPx);
}

/** The pulsing X. HTML, animating transform only — Chrome cannot composite the SVG version.
 *  THE RIPPLE RING IS GONE: "I want the x to pulse, remove the ring." The swell IS the pulse.
 *  (That reverses his own two earlier rulings to keep the slow white ripple; 2026-09-03 is later
 *  and wins. Recorded here so it is not re-argued from the older comment.) */
export function paintMarks(marks, cellPx){
  const host = courseHost();
  if (!host || !marks || !marks.length) return;
  const size = cellPx * COURSE.mk;
  const w = size * 1.16;                       // the tuner's own draw width for his artwork
  for (const c of marks){
    const el = document.createElement("div");
    el.className = "pp4CourseMark";
    el.dataset.gx = c[0]; el.dataset.gy = c[1];   // carry the cell, never re-derive it
    const x = (c[0] + 0.5) * cellPx, y = (c[1] + 0.5) * cellPx;
    el.style.cssText = `left:${CQ(x)};top:${CQ(y)};width:${CQ(w)};height:${CQ(w)};`
      + `margin-left:${CQ(-w / 2)};margin-top:${CQ(-w / 2)};`;
    // STATIC TRANSFORM ON THE WRAPPER, ANIMATION ON THE CHILD (BOARD-RENDERING §5) — written on
    // one element, the keyframe overwrites the static rotate every frame.
    const im = document.createElement("img");
    im.className = "pp4CourseMarkArt";
    im.src = COURSE_MARKER_SRC;
    im.alt = "";
    el.appendChild(im);
    host.appendChild(el);
  }
}

/** Draw the course for a captain, if there is one to draw. The single entry point every caller
 *  uses, so "where onward is" is derived in ONE place from what the game already computes. */
export function showCourseFor(game, player, svg, cellPx, ingsOverride){
  const tour = chartTour(game || appState.game, player, ingsOverride);
  if (!tour){ clearCourse(); return null; }
  drawCourse(svg, cellPx, tour);
  /* Stashed AFTER the draw succeeds, so a moment that had no course to show never becomes the
     thing a later restore puts back. */
  lastRequest = { game, player, svg, cellPx, ings: ingsOverride };
  return tour;
}
