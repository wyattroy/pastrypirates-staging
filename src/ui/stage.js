// src/ui/stage.js — the /4 stage: full-bleed board, camera director, wind pill, ribbon,
// bottom sheet, ship-attached narration bubbles, and the flip ceremony.
//
// Design contract (Wyatt, 2026-08-11, 16 answers before build):
//   - Bubbles from day one: no narration box. Captain lines attach to their ship; table lines
//     hover over the water. Auto-advance on the existing hold curve, tap to hurry.
//   - Full director: sail prompts frame the WHOLE sail window (never crop a legal move, zoom
//     capped), the camera glides to whoever is speaking, storms pull back to the full board.
//     Pinch/pan/double-tap override the director until the player's next sail prompt.
//   - Wind pill: one compact semi-transparent overlay, fixed spot — "WIND NOW: E→ FORECAST: S↓";
//     a coming storm shows ⛈ with a slowly turning, never-settling arrow (the approved chip
//     treatment, carried over). The old on-board chip is hidden; the compass dial stays as art.
//   - Solo clock off by default (toggle still present in the sheet's controls row).
//   - Flip ceremony: the flippenator takes the screen when armed.
// Everything here is render-side. The engine, its RNG, and the dlog are never touched.
"use strict";
import { appState } from "../state/index.js";
import { boardShipEls } from "./board.js";
import { narrationHoldMs, vwPx, vhPx, isDisabledBtn, fixedOrigin, fixedRect, refreshNameMarquees,
  waitLineIsSelfAddressed } from "./util.js";
import { typewriterReveal } from "./panel.js";
import { HEXCOL, emojify, DIRS, STORM_PUSH } from "../shared/index.js";

const $ = id => document.getElementById(id);
const AR = { N: "↑", S: "↓", E: "→", W: "←" };
// playtest 19 item 3: every box on this stage is laid out from the LAYOUT viewport (vwPx/vhPx in
// util.js), never window.innerWidth/innerHeight — Safari reports the pinch-zoomed *visual*
// viewport in those, which is what shrank the recipe sheet to half width. The helpers live in
// util.js because board.js's syncBoardSizing() needs the same rule; see the note there.
// Bumped on every deploy. Shown in the ☰ menu so a playtest screenshot proves which build it came
// from — two stall reports have now turned out to be photos of code that was already fixed, and
// Safari's module cache makes "refresh" an unreliable way to get the new build.
//
// W0-3 (Wyatt, 2026-08-27): the old shape was `v4 · build 2026-08-26k-CUTOVER`, and both halves had
// stopped earning their place. "v4" named the /4 preview directory, which the cutover deleted, so it
// pointed at nothing; the letter suffix counted the day's builds in a code only its author could
// read. HIS DECISION, recorded in .planning/BACKLOG.md: a date-based build number.
//
//   YYYY.MM.DD.N  —  N is the Nth build published that day, bumped by hand exactly as the letter was.
//
// Staging appends its own suffix at publish time and never here — see scripts/deploy-staging.sh.
const PP4_STAMP = "2026.08.28.4-staging@25158042";

/* HIDE THE WHOLE STAGE LAYER — T-12 (Wyatt, 2026-08-26, with a screenshot).
   "They are successfully brought back to port (the homepage) BUT there is a bug -- the homepage
   looks crazy." His screenshot shows the welcome card floating over a LIVE game: the DAY 4 ribbon,
   the captains box, and a narration bubble reading "wy2: tap to sail", all still painted behind it.

   WHY, and it is structural rather than a missed line. showHome() hides #game — and every one of
   these elements is appended to document.body, OUTSIDE #game (search body.appendChild in this
   file: ribbon, wind pill, captains box, chat sheet, the fx layer, the ceremony veil, the prompt).
   They were never inside the thing being hidden, so hiding it could not touch them. There was no
   stage teardown at all; nothing in the codebase had ever needed to take the stage down, because
   until a captain could leave a voyage mid-flight nothing ever went back.

   HIDDEN, NOT REMOVED, deliberately. maybeBuildStage() builds these once and reuses them, and a
   stale 2026-08-13 no-op in exactly that function silently prevented the whole stage from building
   in ANY networked game until 02-03 found it. Removing nodes here would put the correctness of a
   return trip on the rebuild path being perfect. Hiding cannot fail that way, and buildStage's own
   guards keep working untouched.

   Also drops body.pp4Stage, which is what gives the page the phone-column layout and
   overflow:hidden — left on, the welcome screen inherits a game's body styling. */
/* Set while the player is at port. The prompt's display is rewritten by promptTick() on EVERY
   FRAME, so hiding it lasted under 16ms — the first version of this teardown left #pp4Prompt
   painted over the welcome card and the probe caught it: 5 elements hidden, 4 stayed hidden, the
   prompt came straight back. A flag the tick reads is the fix; hiding harder is not. */
let stageDown = false;
export function hideStageLayer(){
  stageDown = true;
  for(const id of ["pp4Ribbon","pp4Pill","pp4Cap","pp4Col","pp4ChatSheet","pp4Prompt","pp4Fx","pp4Veil","pp4Stamp"]){
    const e=document.getElementById(id);
    if(e)e.style.display="none";
  }
  document.body.classList.remove("pp4Stage","pp4Side");
}
/* The other half. Clears the inline display rather than setting one, so each element goes back
   under CSS control and whatever the game logic wanted for it (a pill hidden in a mode that has no
   wind, the chat sheet closed) still holds. Setting display:"" here rather than "block" is the
   whole point — an inline value would out-rank the stylesheet forever. */
export function showStageLayer(){
  stageDown = false;
  for(const id of ["pp4Ribbon","pp4Pill","pp4Cap","pp4Col","pp4ChatSheet","pp4Prompt","pp4Fx","pp4Veil","pp4Stamp"]){
    const e=document.getElementById(id);
    if(e&&e.style.display==="none")e.style.display="";
  }
}


const S = {
  active: false,            // stage layout applied (solo game on screen)
  cam: { x: 0, y: 0, w: 640, tx: 0, ty: 0, tw: 640 },
  lock: false,              // a player gesture holds the camera until the next sail prompt
  battle: null,             // [attacker, defender] while a fight is live — the camera holds on it
  subject: null,            // seat index the next flash() line is about (stashed by panel.js)
  evType: null,
  hurry: null,              // resolver for tap-to-hurry on the live bubble
  bubPlace: null,           // live bubble's positioner — run every tick, same loop as the camera
  frameKey: "",             // the prompt the director last re-framed for (once per ask, never per frame)
  bubDue: 0,                // when the live bubble is due to retire — a DEADLINE, not a timer
  bubFinish: null,          // …and the resolver the deadline calls. See stageFlash for why.
  waitFinish: null,         // resolver for a WAIT line specifically — see promptTick
  hadPrompt: false,         // …and last frame's answer, so the retire is an EDGE, not a level
  raf: 0,
  lastPill: "",
  geomAt: 0,                // D-31: Date.now() of the last computeStageGeometry() measurement pass
  geomBound: false,         // …and whether the resize listener has been registered yet
};

/* ================= camera ================= */
function svgEl(){ return $("board"); }
function grid(){ const g = appState.game; return g ? g.cfg.grid : 15; }
function cellPx(){ return 640 / grid(); }

/* THE STAGE HOLDS THE DIRECTOR STILL — Wyatt's item 7, 2026-08-23c, stated as a principle and
   quoted in full because he asked that the intention be understood, not just the instance:
   "at EVERY stage, when things happen on stage, the board waits for the stage to disappear before
   serving more narrations/director movement/etc — the etc is important here so i want you to
   understand my intention: the stage should get all your attention; if things happen behind it,
   the player feels like they're missing out, and the stage is BLOCKING them from seeing important
   things. that's the worst feeling."
   camTo() is the ONE door every director move walks through (camFull/camToCell/camToSeat/
   camFitCells all funnel here), so the rule lives here once: while the flip-ceremony veil
   (body.pp4Cer) or a centre-stage card (#actionPanel[data-pp4-stage]) holds the audience, a
   requested glide is REMEMBERED, not performed — and tick() performs the LAST one the moment the
   stage clears. Immediate positioning (boot layout) is exempt: it is setup, not direction. */
function stageHoldsAttention(){
  if (document.body.classList.contains("pp4Cer")) return true;
  const ap = $("actionPanel");
  return !!(ap && ap.dataset.pp4Stage);
}
function camTo(x, y, w, immediate){
  if (!immediate && S.active && stageHoldsAttention()){ S.camHeld = [x, y, w]; return; }
  S.camHeld = null;   // a performed move supersedes anything remembered
  S.cam.tx = Math.max(0, Math.min(640 - w, x));
  S.cam.ty = Math.max(0, Math.min(640 - w, y));
  S.cam.tw = Math.min(640, w);
  if (immediate){ S.cam.x = S.cam.tx; S.cam.y = S.cam.ty; S.cam.w = S.cam.tw; S.tween = null; wake(); return; }
  // Wyatt, playtest 3: the glide was a jerky exponential chase — S-curve it, ~300ms longer.
  S.tween = { fx: S.cam.x, fy: S.cam.y, fw: S.cam.w, t0: performance.now(), dur: 650 };
  wake();   // the slow-gear heartbeat must never pace a glide
}
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function camFull(){ camTo(0, 0, 640); }
function camToCell(c, zoom){
  const w = 640 / zoomCap(zoom || 1.9);              // D-36: less zoom on a big board
  camTo((c[0] + 0.5) * cellPx() - w / 2, (c[1] + 0.5) * cellPx() - w / 2, w);
}
function camToSeat(i){
  const g = appState.game; if (!g || !g.players[i]) return;
  camToCell(g.players[i].pos, 1.9);
}
/* FRAME A SET OF CELLS: the box that holds every one of them, padded, at whatever zoom that box
   allows — capped, so a tight subject is not magnified into abstraction. THE ZOOM IS DERIVED FROM
   THE SUBJECT, never picked: two ships three squares apart and two ships across the board are not
   the same shot, and one number cannot be right for both (CLAUDE.md, "nothing is a constant").
   Shared by the sail window and the battle framing below, so those two cannot drift apart. */
const CAM_FIT_PAD = 1.2;                             // cells of water left around the subject
function camFitCells(cells, maxZoom, reservePx){
  if (!cells || !cells.length) return;
  const cp = cellPx();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  cells.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const P = CAM_FIT_PAD;
  const bw = (x1 - x0 + 1 + 2 * P) * cp, bh = (y1 - y0 + 1 + 2 * P) * cp;
  let side = Math.max(bw, bh);
  side = Math.max(side, 640 / zoomCap(maxZoom || 2.2));   // D-36: less zoom on a big board
  /* THE DIRECTOR MAKES THE ROOM (Wyatt, 2026-08-23): "you can always have the director zoom out
     more if it needs to, to find places to put the elements without covering sail squares."
     A placement search can only choose among the spaces the camera has already left it — so when a
     full sail window fills the strip there is genuinely nowhere legal to stand, and "least-bad"
     meant standing on seven of twenty-two squares. The lever is the FRAME, not the placement.

     ONE THING DECIDES THE FRAME, and that is why this lives here rather than in place(). If the
     bubble asked the camera to move, the camera and the placement would be two directors of the
     same picture, oscillating (rule 23, the fault this project already paid for once). The fit
     reserves the room; the placement then simply finds it.

     DERIVED, NOT TYPED: `reservePx` is the height the prompt actually measures on screen. Growing
     the frame by strip/(strip - reserve) shrinks the board content by exactly the fraction of the
     strip the prompt occupies, so the freed band IS the prompt's own size — no constant, and it
     tracks a longer question or a bigger phone automatically. Still clamped to the whole board:
     640 is the entire ocean and there is nothing further to zoom out to. */
  if (reservePx > 0){
    const strip = Math.max(1, boardBand().bottom - boardBand().top);
    const room = Math.max(0.35, (strip - reservePx) / strip);   // never give away more than 65%
    side = side / room;
  }
  side = Math.min(side, 640);
  camTo((x0 - P) * cp + bw / 2 - side / 2, (y0 - P) * cp + bh / 2 - side / 2, side);
}
// frame the whole sail window: bbox of every highlighted cell + my ship, padded; zoom is
// whatever that window allows, capped at 2.2x — a legal move is never off screen.
/* FRAME THE CAPTAIN BEING ASKED, NOT THE CAPTAIN LOOKING — Wyatt, 2026-08-20, from a two-window
   screenshot: "on guest's turn the host's director moved back up to the host's boat while waiting
   for guest to sail... it should not center on host at the beginning of their turn at all."

   This took `appState.mySeat` — the seat of whoever is *watching*. pickCell() fires this on every
   sail prompt from whichever machine runs the engine, which in a crew game is the HOST, so the
   host's camera jumped to the HOST's own ship at the start of every guest's turn. It then corrected
   itself the moment the guest actually moved, because the move arrives as narration and the
   narration path already aims at the right captain (:589, camToSeat(subj)) — which is exactly why
   it read as a snap-and-recover rather than a stuck camera.

   The `.sailCell` highlights only exist on the client being asked, so on a spectating host the cell
   list is empty and this collapsed to "fit one cell: my own boat". Passing the seat fixes both
   halves: the spectator frames the right ship, and the player being asked still gets their own
   window because their cells ARE drawn locally.

   `seat` is optional and falls back to the viewer, so any future caller with no seat in hand keeps
   the old local behaviour rather than silently framing seat 0. */
function camFitSail(seat){
  S.lock = false;                                    // a new turn releases any gesture hold
  const g = appState.game; if (!g) return;
  const who = g.players[seat ?? appState.mySeat ?? 0]; if (!who) return;
  // playtest 20: the squares carry their own grid coordinates now (sailHighlightRect writes
  // data-gx/gy). This used to invert that function's inset arithmetic by hand — a second copy of
  // the same maths that had to be kept in step with it, and it stopped being possible at all once
  // the squares became HTML sized in cqw rather than SVG rects with x/width attributes.
  const cells = [...document.querySelectorAll(".sailCell")]
    .map(r => [+r.dataset.gx, +r.dataset.gy])
    .filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  cells.push(who.pos);
  /* Reserve the room the prompt will need, measured from what is on screen rather than guessed:
     the ask pill and its helper line are what a sail prompt actually draws, and a narration bubble
     is the other thing that has to stand somewhere. Nothing on screen yet (the very first fit of a
     turn) reserves nothing and behaves exactly as before. */
  const need = [".apMsg", ".apSub", ".pp4Bub:not(.out)"]
    .map(sel => document.querySelector(sel))
    .filter(e => e && e.getBoundingClientRect().height > 4)
    .reduce((h, e) => h + e.getBoundingClientRect().height + 8, 0);
  /* ITEM 38 (Wyatt, 2026-08-23c) — the hole in this reserve, named by the overnight gate as the
     one structural fault ('a sail square covering the tap-to-sail question — the existing clamp
     provably cannot reach it'): the FIRST fit of a turn runs before the pill exists, measures
     nothing, reserves nothing — so the frame never grew and the placement search had no legal
     ground, exactly when the whole sail window fills the strip. The fallback is the LAST measured
     need — the game's own number from the previous prompt, not a typed constant — so from the
     second prompt of a voyage onward the director always leaves the words their room. The very
     first prompt of a session still reserves nothing, exactly as before. */
  if (need > 0) S.lastPromptNeed = need;
  camFitCells(cells, 2.2, need || S.lastPromptNeed || 0);
}
// frame a set of captains — both combatants of a fight, whatever the water between them
function camFitSeats(seats){
  const g = appState.game; if (!g) return;
  camFitCells(seats.map(i => g.players[i] && g.players[i].pos).filter(Boolean), 2.2);
}
// user SVG units -> screen px under the current camera ('meet' fit inside the wrap)
/* RED ALERT FIX (2026-08-21, D-18 follow-up — see fixedOrigin()'s note in util.js): svg's own
   getBoundingClientRect() is viewport-absolute (CSS spec, immune to any ancestor transform), but
   every caller of toScreen() writes its result into a position:fixed element's left/top — which,
   once item 22's stopgap has made body the containing block, is measured from BODY's own box, not
   the viewport. Subtracting fixedOrigin() here, once, converts the ship's screen position into the
   same frame vwPx()/vhPx() already use for the clamps every consumer below builds against — the
   fan buttons, the ask pill, the apSub tooltip, the back button, the slider, the card fallback, and
   the narration bubble + its pointer tail (boatUXY() -> toScreen() is how all of them find a ship). */
function toScreen(ux, uy){
  const svg = svgEl(); if (!svg) return [0, 0];
  const br = svg.getBoundingClientRect();
  const sc = br.width / S.cam.w;
  const o = fixedOrigin();
  return [(ux - S.cam.x) * sc + br.left - o.x, (uy - (S.vy ?? S.cam.y)) * sc + br.top - o.y];
}
/* WHERE A BOARD POINT WILL BE ONCE THE DIRECTOR HAS FINISHED — the same projection through the
   camera's TARGET instead of its live position. Wyatt, 2026-08-25, on the narration bubble:
   "the narration bubble appears first below the boat at the beginning of its run and then above
   the boat later… ideally, the narration bubble stays in its same location with respect to the
   boat for the whole time because if it has to flip from below to above, that's when it looks
   jittery." He is explicit that the bubble MOVING with the camera is good and he wants it kept —
   "i love that look and feel… as long as it is smooth". Only the SIDE may not change.
   A side chosen from the live position is chosen from a number that is still travelling, so it
   flips the instant the pan makes room above. Chosen from where the boat comes to REST it is
   right for the whole life of the bubble, and the glide is untouched. */
function toScreenRest(ux, uy){
  const svg = svgEl(); if (!svg) return [0, 0];
  const br = svg.getBoundingClientRect();
  const w = S.cam.tw || S.cam.w;
  const sc = br.width / w;
  const o = fixedOrigin();
  const cx = (S.cam.tx != null) ? S.cam.tx : S.cam.x;
  const cy = (S.cam.ty != null) ? S.cam.ty : S.cam.y;
  return [(ux - cx) * sc + br.left - o.x, (uy - cy) * sc + br.top - o.y];
}
/* A PULSING BUTTON HAS NO SINGLE SIZE, AND EVERY LAYOUT THAT DODGES ONE MUST AGREE ON WHICH SIZE.
   `getBoundingClientRect()` on a button running pp4Grow returns its ANIMATED box — measured on
   the rig at 66px -> 75.9px and back, every 1.1s. Two placements read those live rects every tick
   and re-decide against them: the peek hint's clear-strip search, and the narration bubble's
   weighted obstacle cost. So both can change their answer at the pulse frequency whenever a
   button edge sits near a decision boundary — the gap they allow is 6px and the pulse moves an
   edge by ~10px, which is why it reads as "it doesn't know where to resolve" (Wyatt, 2026-08-25,
   who also guessed the cause exactly: "I think it's because of the pulsing of the buttons").
   The fan's OWN layout already solved this — it reserves --pp4GrowPeak so circles never kiss at
   the top of the pulse. These two were the placements that had not been told. Measuring the PEAK
   box (the layout size, which a transform does not touch, scaled about the unmoving centre) makes
   every one of them agree and makes the decision stable through the whole cycle. */
const swellPeak = () => parseFloat(getComputedStyle(document.documentElement)
  .getPropertyValue("--pp4GrowPeak")) || 1.15;
function swellRect(el, r){
  const cl = el && el.classList;
  if (!cl || !(cl.contains("apBtn") || cl.contains("btlBtn"))) return r;
  const k = swellPeak();
  const w = (el.offsetWidth || r.width) * k, h = (el.offsetHeight || r.height) * k;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;   // scale origin is the centre
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2, width: w, height: h };
}
/* WAIT FOR THE BOAT TO ARRIVE BEFORE BLOOMING THE FAN — playtest 21 item 2 (Wyatt: "only appear
   the action prompt fan buttons AFTER the boat has finished moving — currently, they appear before
   it has finished and they recalculate position and glitch out in the final few ms of travel,
   which looks bad").

   WHY IT GLITCHES, which is not where it looks. boatUXY reads el.style.transform — the ship's
   TARGET, written in one go — so the circles are not chasing the hull. They are chasing the
   CAMERA: the bloom is placed through toScreen(), the camera tweens across to follow the ship, and
   every frame of that tween moves the whole placement. The tween finishes at about the moment the
   boat lands, which is exactly the "final few ms of travel" he describes. So a fix aimed only at
   the ship's glide would have missed half of it, and a fix aimed only at the camera would have
   left the fan blooming around a hull still in flight.

   BOTH are waited on, and each is MEASURED rather than timed:
     - the camera, by asking whether a tween is running at all;
     - the ship, by comparing its RENDERED transform (getComputedStyle, which returns the current
       animated matrix) against its target. When they agree, the transition is genuinely over.
   A timer would have been a third hand-synced copy of SHIP_GLIDE_MS, and this project has paid for
   that pattern more than once. It also breaks the moment a sweep retunes the glide via
   setShipGlideMs, which is precisely when the ship is moving furthest.

   BOUNDED, AND THIS IS THE LOAD-BEARING PART. A UI gate that can wait forever is a game that can
   hang on a dropped transitionend or a camera that never settles. The wait can never outlast
   SETTLE_CAP_MS, after which the fan blooms regardless: the worst case is the cosmetic glitch this
   exists to remove, never a turn that cannot be taken. */
const SETTLE_POLL_MS = 60;
const SETTLE_CAP_MS = 1400;   // comfortably past SHIP_GLIDE_MS (700) + the camera's own tween
function shipStill(){
  const els = boardShipEls();
  if (!els || !els.length) return true;
  for (const el of els){
    if (!el || !el.style || !el.style.transform) continue;
    const want = el.style.transform;
    const now = getComputedStyle(el).transform;
    // matrix(1,0,0,1,X,Y) vs translate(Xpx,Ypx) — compare the two translation components only
    const a = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(want);
    const b = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+),\s*([-\d.]+)\)/.exec(now);
    if (!a || !b) continue;             // nothing readable to compare — do not block on it
    if (Math.abs(parseFloat(a[1]) - parseFloat(b[1])) > 0.5) return false;
    if (Math.abs(parseFloat(a[2]) - parseFloat(b[2])) > 0.5) return false;
  }
  return true;
}
function stageSettled(){
  if (!S.active) return Promise.resolve();
  if (appState.replaying) return Promise.resolve();   // a replay waits for nothing — see stageFlash
  const t0 = Date.now();
  return new Promise(res => {
    const poll = () => {
      if (!S.active || (!S.tween && shipStill()) || Date.now() - t0 >= SETTLE_CAP_MS) return res();
      setTimeout(poll, SETTLE_POLL_MS);
    };
    poll();
  });
}
function boatUXY(i){
  const els = boardShipEls();
  const el = els && els[i]; if (!el) return null;
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

// playtest 11 (iPhone 13 mini running HOT): the tick loop used to lay out and write the DOM
// every frame even with a parked camera — rect reads, viewBox writes and transform writes at
// 60fps, forever. Layout inputs are now cached (refreshed ~2x/second and on resize), and every
// write is skipped when the value hasn't changed, so an idle stage costs almost nothing.
// The HTML overlays that are mapped to board coordinates and must therefore carry the camera.
// See where it is applied below for why this is a list rather than two named consts.
const CAM_HTML_LAYERS = ["rippleHost", "sailHost", "rimHost"];
let ribHCache = 48, ribHAt = -1e9, lastVB = "", lastRipT = "";
/* THE TOP BAND — where the board's top edge goes: the bottom of the ribbon, or of the wind pill
   when that sits lower (playtest 17, Wyatt: "the wind/forecast pip covers the top of the trade
   winds — move the board down slightly"). Measured from the rendered elements, cached ~2×/second
   (playtest 11, a hot phone). Read by camFrame() every frame AND by computeStageGeometry() when it
   sizes the desktop board — one measurement, so the square it derives and the strip the camera
   paints cannot drift apart (rule 23). */
function topBandPx(){
  if (performance.now() - ribHAt > 500){
    const rib = $("pp4Ribbon");
    let topEdge = rib ? Math.ceil(rib.getBoundingClientRect().bottom) : 48;
    const pill = $("pp4Pill");
    if (pill){
      const pr = pill.getBoundingClientRect();
      if (pr.height > 0) topEdge = Math.max(topEdge, Math.ceil(pr.bottom) + 6);
    }
    ribHCache = topEdge;
    ribHAt = performance.now();
  }
  return ribHCache;
}
const isSideBySide = () => typeof document !== "undefined" && document.body.classList.contains("pp4Side");
/* D-50 — ONE LIST, TWO MOUNTS. The captains card and the game's menu (#footerRow, the only list of
   menu items there is) are MOVED between two homes rather than rendered twice:
     side-by-side  -> both stand in #pp4Col, the column D-31 built beside the board, menu under card
     everywhere else -> the card is its own fixed panel at the foot of the screen and the menu is
                        the ☰ sheet over the board (D-18/D-31: the phone stays exactly as it is)
   Moving the NODE is what makes "one list" true by construction — a second list is the fault rule
   23 exists to prevent, and it is how the two-directors bug was born. Chosen by the SAME `pp4Side`
   class computeStageGeometry() already sets: one decision, read twice, never two kept in step.
   Every branch is guarded on the current parent, so this is a no-op on all but the tick a window
   actually crosses the threshold. */
function mountColumn(on){
  const col = $("pp4Col"), cap = $("pp4Cap"), foot = $("footerRow"), body = document.body;
  if (!col || !cap) return;
  if (on){
    if (cap.parentNode !== col) col.appendChild(cap);
    if (foot && foot.parentNode !== col) col.appendChild(foot);
    // the ☰ is hidden in this branch, so a sheet left open would be unclosable
    if (body.classList.contains("pp4Foot")) body.classList.remove("pp4Foot");
  } else {
    if (cap.parentNode !== body) body.appendChild(cap);
    const home = $("game");
    if (foot && home && foot.parentNode !== home) home.appendChild(foot);
  }
}
/* WHERE THE BOARD BAND ENDS — one answer, read by everything that has to place a floater above the
   captains card. THE BUG THIS EXISTS TO KILL: three separate places each did
   `cap.getBoundingClientRect().top`, which is the right bottom-boundary only while the captains
   card sits BELOW the board (phone and stacked). In D-31's side-by-side the card sits BESIDE the
   board with its top at the ribbon, so that read returned ~45 — and the radial fan's band became
   `yMin 85 … yMax -29`, inverted. Every circle then clamped to a NEGATIVE y: all of them at the
   same spot (the "overlapping controls: Call X/Call Y" the playtest gate found twice), off the top
   of the screen, behind the ribbon (z40 over the prompt's z30) where nothing could click them —
   which is where a real driver stalled, exactly as a player would. Beside the board the card takes
   nothing off the bottom, so the band simply runs to the foot of the stage. */
/* D-39/D-40 — THE PEEK HINT TEACHES UNTIL LEARNED, AND SAYS THE RIGHT VERB.
   D-38 lets a prompt sit over the board, and the thing that makes that safe is the hold-the-sea
   gesture. Before tonight the gesture was taught in exactly ONE place — the recipe picker on day 1
   — and never again, which is too little for something now load-bearing; Wyatt's own suggestion was
   a hint on every turn, and we landed on the middle: show it while a prompt is over the board on
   your turn, and retire it for good once the player has actually USED the hold three times. Every
   turn forever is clutter that competes with the narration it explains and goes unread by day 3.
   The counter is localStorage, the same idiom pp4_timerOff already uses, and a browser that
   refuses storage is treated as "already learned" so a private window is never nagged forever.
   D-40: "tap" is wrong with a mouse. Pointer type, not width — a touch laptop gets the right verb. */
const PEEK_KEY = "pp4_peekUsed", PEEK_LEARNED = 3, PEEK_HOLD_MS = 450;
let peekArmedAt = 0;
function peekUses(){ try { return +localStorage.getItem(PEEK_KEY) || 0; } catch (e) { return PEEK_LEARNED; } }
function notePeekUse(){ try { localStorage.setItem(PEEK_KEY, String(Math.min(PEEK_LEARNED, peekUses() + 1))); } catch (e) {} }
function holdVerb(){
  try { return matchMedia("(pointer: coarse)").matches ? "Tap and hold" : "Click and hold"; }
  catch (e) { return "Tap and hold"; }
}
export function peekHintText(){ return `${holdVerb()} the sea to reveal the board`; }
/* Shows/hides the hint inside whichever prompt box is up. Placed at the FOOT of the board band so
   it never joins the crowd around the boat (which is where D-38 has just sent everything else). */
function peekHintTick(box){
  let hint = box.querySelector(".pp4PeekHint");
  if (peekUses() >= PEEK_LEARNED){ if (hint) hint.remove(); return; }
  if (!hint){
    hint = document.createElement("div"); hint.className = "pp4PeekHint";
    hint.innerHTML = `<span>${peekHintText()}</span>`;
    box.appendChild(hint);
  }
  const band = boardBand();
  /* THE HINT IS THE ONE FLOATER THAT ALWAYS YIELDS, because it is the only one that is not part of
     the question. It is `pointer-events:none` italic text explaining a gesture; everything it was
     landing on is something a captain has to read or tap. It sat at a FIXED `band.bottom - 44`, and
     that strip is inside the fan's own legal band BY CONSTRUCTION — the cornered dock puts circles
     at `capT - D - 8` and the hint's line runs right through them. Measured on the 2026-08-21 gate:
     the hint drawn straight across "Stay put" (solo-phone-020), across the ✓ of a trade
     (passplay-phone-023) and over the second line of "Call Flaky Jack" (passplay-phone-029) — five
     judge findings, all one cause, none of them a placement the fan could have avoided.
     So the hint moves instead of the controls: keep the foot of the band when that strip is clear,
     else hug the top of it, else say nothing this tick. Never a constant — the strip is judged
     against the rects the renderer actually produced, so it is right at any screen size and for any
     fan the placement search happens to choose. */
  const span = hint.firstElementChild;
  hint.style.display = "";
  const sr = span ? span.getBoundingClientRect() : null;
  const foot = Math.round(Math.max(band.top, band.bottom - 44));
  if (!sr || !(sr.width > 0 && sr.height > 0)){ hint.style.top = foot + "px"; return; }
  // everything the hint must not sit on: every control, the question itself, and any narration
  // box that is already talking. One list, so a floater added later is covered by adding it here.
  const busy = [...box.querySelectorAll(".apBtn, .apSliderWrap, .apMsg, .apSub"),
                ...document.querySelectorAll(".sailCell, .pp4Bub")]
    .map(e => swellRect(e, e.getBoundingClientRect()))    // the PEAK box — see swellRect's note
    .filter(r => r.width > 2 && r.height > 2 && r.right > sr.left && r.left < sr.right);
  /* CLEAR SPACE, not merely "not overlapping" — the judge's own words for this fault were "the
     circle's bottom edge and text sit on top of the pill's top edge instead of having clear space
     between them", and a hint grazing a button by a pixel reads exactly as badly as one covering it.
     6px is the gap every other stacked floater in this file already leaves (`pillB.bottom + 6`, the
     fan's own `gap`), so the hint is spaced like everything else rather than to a number invented
     here — a layout dimension, not a game quantity. */
  const AIR = 6;
  const clear = y => y >= band.top && y + sr.height <= band.bottom &&
    !busy.some(r => r.bottom > y - AIR && r.top < y + sr.height + AIR);
  const head = Math.round(band.top + 4);
  // …and a third spot BEFORE giving up: tucked just above whatever is standing in the foot's way.
  // The hint belongs at the foot of the board, over the sea it names, so stepping up over the fan
  // keeps it there; jumping to the ribbon is the last resort and hiding is the one after that,
  // because a hint nobody sees teaches nobody (D-39).
  const blockers = busy.filter(r => r.bottom > foot - AIR && r.top < foot + sr.height + AIR);
  const above = blockers.length ? Math.round(Math.min(...blockers.map(r => r.top)) - sr.height - AIR) : foot;
  for (const y of [foot, above, head]){
    if (clear(y)){ hint.style.top = y + "px"; return; }
  }
  hint.style.display = "none";          // taught nothing this tick beats covering the answer
}
/* THE BACK CIRCLE RIDES THE PILL'S SHOULDER — one function, because the same two lines were
   written out in THREE places (the placement pass, the lift-clear-of-fan pass and the
   cornered-fan lift) and a floor added to any one of them would have left the other two wrong.
   THE FLOOR IS THE FIX: `top = pill.top + (pill.height - 38) / 2` has no lower bound, and the
   radial placement runs while `#pp4Prompt` is still `display:none` behind panel.js's
   `pendingReveal` gate — so `fixedRect(msg)` is all zeros and the arithmetic reads
   `0 + (0 - 38) / 2 = -19`, i.e. a grey half-circle hanging off the top-left corner over "DAY N".
   Four judge findings on the 2026-08-21 phone leg (passplay-phone-014/015/016/028), reported as a
   clipped "clock icon" because that is exactly what half a circle with a ‹ in it looks like.
   Clamped to `tSafeV - 34`, which is the same floor the pill itself, the lift pass and clampTop()
   already use — the band's own top edge, not a number chosen here. */
function placeBackButton(ap, pillB, tSafeV){
  const back = ap.querySelector(".apBack"); if (!back || !pillB) return;
  const BK = 38, GAP = 8;                       // 46 = the circle plus the gap it always had
  const floor = tSafeV - 34;
  const shoulderY = Math.max(floor, pillB.top + (pillB.height - BK) / 2);
  const shoulderX = pillB.left - (BK + GAP);
  if (shoulderX >= 4){ back.style.left = shoulderX + "px"; back.style.top = shoulderY + "px"; return; }
  /* NO ROOM ON THE SHOULDER, SO IT GOES ABOVE — and this only started happening once the pill was
     made to fit the screen: a 343px pill on a 390px phone is flush left, and a circle clamped to
     `left:4` then sits UNDER it, leaving a half-tappable escape hatch. Above the pill's own left
     edge is where the top-to-bottom reveal rule (CLAUDE.md rule 11: back, message, buttons, helper)
     already says the back belongs, so this is the arrangement the panel version has always used. */
  const aboveY = pillB.top - BK - 6;
  if (aboveY >= floor){ back.style.left = Math.max(4, pillB.left) + "px"; back.style.top = aboveY + "px"; return; }
  back.style.left = "4px"; back.style.top = shoulderY + "px";   // nowhere left to go
}
/* THE PILL FITS THE SCREEN ON EVERY TICK, NOT ONLY ON THE TICK THAT PLACED IT — 18 of the 40 phone
   findings on the 2026-08-21 gate, one cause. The placement pass chooses `left` from `mw`, and `mw`
   was `msg.offsetWidth || 200` read while the box was `display:none` (panel.js's `pendingReveal`
   gate holds the whole prompt hidden until the camera and ships settle). So the left edge is chosen
   for a 200px box, the box turns out 343px, and the right edge leaves the screen — then `radKey`
   memoises the layout and nothing ever measures it again. solo-phone-017 starts at x=95 of 390;
   passplay-phone-023 at x=182, which is exactly the `vwPx() - 200 - 10` clamp for the guessed width.
   Re-clamping here, above the memo, is the only version that cannot be out of date: it compares the
   box's REAL rendered width against the real screen and moves nothing else. `.apSub` shares the
   pill's placement rule so it is swept by the same loop (rule 8), and the back circle rides along
   because its shoulder is defined by the pill it hangs off. */
function clampAskToScreen(ap, tSafeV){
  const vw = vwPx();
  const backGap = ap.querySelector(".apBack") ? 50 : 0;   // same reservation as the placement pass
  let pillB = null;
  [".apMsg", ".apSub"].forEach(sel => {
    const el = ap.querySelector(sel);
    if (!el || !el.style.left) return;
    const w = el.offsetWidth; if (!(w > 0)) return;
    const was = parseFloat(el.style.left) || 0;
    const left0 = sel === ".apMsg" ? 10 + backGap : 10;
    const want = Math.max(left0, Math.min(was, vw - w - 10));
    if (Math.abs(want - was) > 0.5) el.style.left = want + "px";
    if (sel === ".apMsg") pillB = fixedRect(el);
  });
  if (pillB && pillB.height > 0) placeBackButton(ap, pillB, tSafeV);
}
/* Lifts the ask pill clear of any prompt circle already sitting on it (see the call site). */
/* THE LIFT CAN FAIL TO CLEAR, AND IT REPORTS NOTHING WHEN IT DOES. That is the 3x `no-cover-ask`
   on the crew-phone sea trial, 2026-08-26 (host-016, guest-020, guest-022): a long three-line trade
   question with a circle sitting on the word it is asking about.

   WHAT IS MEASURED, AND WHAT IS NOT — read this before trusting the next paragraph.
     - guest-022 (390x664): MEASURED clamp-bound. The pill sits at y~83, the `tSafeV - 34` ceiling
       is y~53, and the lift wants y~37. It rises the 30px it is allowed and STILL overlaps by ~4px.
       Here the floor is genuinely the cause.
     - host-016 (same 390x664 at 2x): MEASURED to have ~36px of headroom — the lift wanted y~65
       against a y~53 ceiling, so it was NOT clamped, and the circle stayed on "deal" anyway.
       WHY the lift did not take on that screen is NOT ESTABLISHED. A candidate, unverified: the
       placement pass below writes `msg.style.top = mTop` unconditionally (see it a few hundred
       lines down), so a re-place discards whatever the lift just did.
   Both findings are from CEO review 4, which measured the two shots rather than reading this
   function. An earlier version of this comment asserted the clamp as THE cause for all three
   screens; that was a guess written in the voice of a finding, and host-016 contradicts it.

   THE FIX DOES NOT DEPEND ON WHICH CAUSE IT WAS, which is the reason to prefer it. Whatever
   defeated the lift, the durable answer is to re-run the placement against the pill's TRUE size.
   The machinery already exists and this adds no second corrective path (rule 23): the pass treats
   the pill as an obstacle (`obstacles.push(pillB)`) and `formationOK` refuses any formation that
   hits an obstacle, sail rects included — so D-38 cannot be traded away by moving the circles.
   The call site's own note says why the pass seated the fan badly in the first place: `.apMsg`
   reveals progressively, so it measured a SMALL pill, avoided that correctly, and the memo then
   froze the layout while the pill grew into it. Dropping `S.radKey` re-runs that same pass — the
   file's existing idiom for "re-place next tick" (3 other uses).

   ORDERING, because it is what makes this converge rather than oscillate: this function runs ABOVE
   the memo check, so clearing `S.radKey` re-places on the SAME tick, not the next one. The pass
   then sets the pill from `mTop` and seats the fan around the pill's now-full-height rect in one
   pass, so the pill and the circles are positioned against each other consistently. */
let _refan = { key: null, n: 0 };
function liftAskClearOfFan(ap, tSafeV, capTV){
  const msg = ap.querySelector(".apMsg"); if (!msg || !msg.style.top) return;
  const btns = [...ap.querySelectorAll(".apBtn")].filter(b => b.style.left && b.offsetWidth > 4);
  if (!btns.length) return;
  const mr = fixedRect(msg);
  if (!(mr.width > 0 && mr.height > 0)) return;
  // Shape-aware, exactly as the gate is: a circle's CORNER clipping a text box is not a circle
  // sitting on it. Taken as a function so the same test can be re-asked after the lift.
  const sitsOn = box => btns.some(b => {
    const r = fixedRect(b);
    const bx = r.left + r.width / 2, by = r.top + r.height / 2, rad = Math.min(r.width, r.height) / 2;
    const px = Math.max(box.left, Math.min(bx, box.right)), py = Math.max(box.top, Math.min(by, box.bottom));
    return Math.hypot(bx - px, by - py) < rad - 2;
  });
  if (!sitsOn(mr)) return;
  const blockTop = Math.min(...btns.map(b => fixedRect(b).top));
  const lifted = Math.max(tSafeV - 34, Math.min(blockTop - mr.height - 10, capTV - mr.height - 8));
  if (Math.abs((parseFloat(msg.style.top) || 0) - lifted) > 1){
    msg.style.top = lifted + "px";
    placeBackButton(ap, fixedRect(msg), tSafeV);
  }
  /* THE CAP IS NOT OPTIONAL. A board so full that no formation clears the pill would otherwise drop
     the memo on EVERY tick — re-placing the fan forever, which is the runaway-probe failure this
     repo has paid for twice. It BOUNDS the churn at three re-places; it does not "prevent" it, and
     saying so would be another behavioural claim this function cannot honour.
     KEYED PER PROMPT, NOT PER TURN. This first read `S.turnSerial + "|" + btns.length`, and
     `turnSerial` only moves when the wheel passes to another captain — but ONE turn holds many
     prompts (a trade alone walks "what'll ye do" -> the ingredient pick -> "coins only" -> "Offer
     it!" -> the table's answer). Two of them with the same circle count shared a single budget, so
     the first could spend all three and leave the second none. The question's own text is what
     makes a prompt distinct, and this file already uses exactly that key for `S.frameKey` — reused
     here rather than invented. (CEO review 4 caught the coarse key.) */
  const stamp = S.turnSerial + "|" + (msg.textContent || "").slice(0, 60) + "|" + btns.length;
  if (_refan.key !== stamp) _refan = { key: stamp, n: 0 };
  if (sitsOn(fixedRect(msg)) && _refan.n < 3){ _refan.n++; S.radKey = null; }
}
function capBandBottom(){
  const cap = $("pp4Cap");
  if (!cap || isSideBySide()) return vhPx();
  const r = cap.getBoundingClientRect();
  return (r.height > 0 && r.top > 0) ? r.top : vhPx();
}
/* THE DESKTOP CAPTAINS COLUMN IS A FIXED, STABLE WIDTH — not re-measured every tick. Re-measuring
   made it (a) collapse to a 220px floor at the opening, where empty holds gave it nothing to
   measure, squeezing every name onto its coin (Wyatt's 2026-08-21 screenshot), and (b) jitter as
   holds filled and emptied through the voyage (rule 8, consistency). 300px comfortably holds the
   game's widest row — a full 8-crate hold laid out on its own line (8×34px chips + 7×3px gaps ≈
   293) — and any name up to MAX_NAME_LEN (18) in the name column above it. The card's HEIGHT still
   hugs its content (index.html); only the width is pinned. This is a layout dimension, not a game
   quantity, so it does not fall under "nothing is a constant" (that rule is about values that shift
   with game state — this one must NOT shift, which is the whole point). */
const SIDE_CAP_MIN = 300;
/* …and it GROWS into the room a wide window actually has (Wyatt, 2026-08-21: "there is absolutely
   no reason on this wide screen that the captain's box is so narrow that the ingredients must move
   onto a second line. The captain's box should take up more horizontal space, as needed and
   available."). The ideal is DERIVED from index.html's own container query, not picked: `@container
   captains (max-width:460px)` is what drops the chips onto their own row, and that 460px threshold
   is itself derived there (name 106 + coins 40 + two 6px gaps = 158, plus 8 chips at 37px-3 = 293).
   So a container just past 460px keeps a full hold inline; + #pp4Cap's own 12px side padding = 484,
   rounded to 492 for daylight. The column takes min(ideal, what the window has spare) and never
   less than SIDE_CAP_MIN, so a merely-wide-enough screen behaves exactly as before. */
const SIDE_CAP_IDEAL = 540;
/* 540, not 492, and the difference was MEASURED rather than reasoned (BOARD-RENDERING.md §7 — ask
   the renderer, never your own arithmetic). At a 492px column the captains PANEL measured 468px
   wide with a 466px client box, and its content box therefore landed just under the container
   query's 460px threshold — so the chips still wrapped, which is the exact thing Wyatt asked to
   stop. The markup costs ~34px between the column's outer width and the panel's content box, so
   clearing 460 needs ~494 at the very edge; 540 leaves real daylight and still fits comfortably at
   1400×900 (which has ~503px spare and simply takes what it has). */
/* D-36 — ON DESKTOP THE DIRECTOR ZOOMS IN LESS (Wyatt, 2026-08-21): "zooming is important on mobile
   because there's so much less screen real estate. on desktop, players want/need to see more of the
   board in order to make strategic decisions." The zoom a phone needs is the zoom that makes a cell
   finger-sized on a ≤600px board; on a bigger board the same cell size is reached at a lower zoom,
   so the ceiling scales DOWN with the board's own rendered width and never below 1 (no zoom at all).
   PHONE_MAX_W is index.html's own boundary — `@media (min-width:601px)` is where desktop begins —
   so a phone board (≤600px wide) keeps today's framing byte-for-byte. Nothing here is a new number:
   at his 1890×960 (876px board) a 2.2 ceiling becomes 1.51; at 1920×1080 (996px) 1.33. */
const PHONE_MAX_W = 600;
function zoomCap(z){
  const bw = $("boardwrap");
  const px = bw ? bw.getBoundingClientRect().width : 0;
  if (!(px > PHONE_MAX_W)) return z;
  return Math.max(1, z * PHONE_MAX_W / px);
}
// TEST-01: guarded because there is no browser global to bind to under Node, and a bare
// `addEventListener(` at module scope threw a ReferenceError the instant anything imported this
// file — the largest module in the new game at 1,545 lines, and the one every 4/ gate has to be
// able to load. Same block-guard shape as 4/src/main.js:32, not an inline ternary.
if (typeof window !== "undefined") {
  window.addEventListener("resize", () => { ribHAt = -1e9; lastVB = ""; });
}
function camFrame(){
  const c = S.cam;
  if (S.tween){
    const t = Math.min(1, (performance.now() - S.tween.t0) / S.tween.dur);
    const e = easeInOutCubic(t);
    c.x = S.tween.fx + (c.tx - S.tween.fx) * e;
    c.y = S.tween.fy + (c.ty - S.tween.fy) * e;
    c.w = S.tween.fw + (c.tw - S.tween.fw) * e;
    if (t >= 1) S.tween = null;
  } else { c.x = c.tx; c.y = c.ty; c.w = c.tw; }
  const svg = svgEl(); if (!svg || !S.active) return;
  // playtest 4: the stage strip runs from the BOTTOM of the ribbon (the board's top row must
  // never hide under DAY + the captain circles) down to the captains box, which is always
  // visible. When the zoomed-out board leaves blank water, the captains box rises to meet it.
  const wrap = $("boardwrap"), cap = $("pp4Cap");
  const ribH = topBandPx();
  /* D-31 REOPENED (2026-08-21, Wyatt's two screenshots — Safari and Chrome, identical): this
     function kept running the PHONE layout's arithmetic in side-by-side mode — reserving CAP_BASE
     under the board for a captains card that D-31 had already moved BESIDE it, and writing the
     card's `top` inline every frame, which beats the column's own CSS by the cascade. Result: a
     960×630 board with 250px of empty teal under it and the card hanging off the bottom of the
     window. ONE decision (computeStageGeometry's `pp4Side` class) is now read here too, so the
     two can no longer disagree: beside the board means no reservation and no inline `top`. */
  const side = isSideBySide();
  // D-46 fault 3: what the card NEEDS (measured on the geometry clock), never 30% of the window.
  // Falls back to the old fraction until the first measurement lands, so the very first frames of
  // a voyage look exactly as they always did.
  /* THE BOARD'S SQUARE OUTRANKS THE CAPTAINS CARD — Wyatt, 2026-08-23c (problems 1+4), with the
     Day-9 screenshot as evidence: "the board cuts off the top row" and "the aspect ratio of the
     board window on mobile is no longer square, but it needs to be." The card's measured need
     (capped 250) came off the strip unconditionally, so on a real phone viewport (~664px of page
     under Safari's chrome) the strip fell below the board's own width, the full-board frame became
     a wide SLICE of the square viewBox, and the camera cropped rows — his ship on the top row,
     clipped in half. The reservation is now also capped by the room a square leaves
     (vh − band − width); when four fat rows need more than that, the card scrolls inside its own
     max-height backstop instead of eating the board. Floor of 64 so the card never vanishes on a
     freak-short viewport — at that point squareness gives way by exactly the overflow, which is
     the least-bad corner. Side-by-side is untouched (no reservation at all, as before). */
  /* PHONE ONLY (≤600px, the same boundary computeStageGeometry's branches use). The square rule
     is about the full-bleed phone board, whose width is the viewport's. A stacked DESKTOP window
     already keeps its board square by narrowing --pp4W instead — and its captains card is
     bottom:auto (not pinned), so shrinking ITS reservation pushed the card past the window bottom:
     bottom=1109 of 1080, caught by stage_layout_check before it shipped, twice (the first scoping,
     portrait-vs-landscape, still let an 800×1080 stacked window through). */
  const squareRoom = (vwPx() <= 600) ? Math.max(64, vhPx() - ribH - vwPx()) : Infinity;
  const CAP_BASE = side ? 0 : Math.min(250, S.capNeed || Math.round(vhPx() * 0.30), squareRoom);
  const availH = Math.max(200, vhPx() - ribH - CAP_BASE);
  if (wrap){
    if (Math.abs((parseFloat(wrap.style.top) || 0) - ribH) > 1) wrap.style.top = ribH + "px";
    if (Math.abs((parseFloat(wrap.style.height) || 0) - availH) > 2) wrap.style.height = availH + "px";
  }
  const aspect = availH / vwPx();
  let h = c.w * aspect;
  if (h > 640) h = 640;                       // whole board fits vertically; width stays filled
  const cy = c.y + c.w / 2;                   // keep the camera centre
  let vy = cy - h / 2;
  vy = Math.max(0, Math.min(640 - h, vy));
  S.vh = h; S.vy = vy;
  // rendered board bottom (meet, width-limited when h is clamped): captains rise to meet it —
  // STACKED/PHONE ONLY. Beside the board (D-31 side-by-side) the column's CSS owns `top`/`bottom`,
  // and a stale inline `top` from a window that was resized DOWN then UP must be cleared, not left.
  if (cap && side){
    if (cap.style.top) cap.style.removeProperty("top");
  } else if (cap){
    const scale = vwPx() / c.w;
    const boardBottom = ribH + Math.min(availH, h * scale);
    const top = Math.round(Math.min(ribH + availH, boardBottom));
    if (Math.abs((parseFloat(cap.style.top) || 0) - top) > 1) cap.style.top = top + "px";
  }
  const vb = `${c.x} ${vy} ${c.w} ${h}`;
  if (vb !== lastVB){
    lastVB = vb;
    svg.setAttribute("viewBox", vb);
    // the boats live in their OWN svg overlay (#boardShips, same 640 space) — give it the same
    // camera, or the ships stay parked on the full-board layout while the water zooms away
    // beneath them (Wyatt, playtest 2).
    const ships = $("boardShips");
    if (ships) ships.setAttribute("viewBox", vb);
    /* EVERY HTML LAYER MAPPED TO THE BOARD NEEDS THE CAMERA COMPOSED IN — as a transform:
       rendered = scale(640/w) then translate(-v * W/640). The SVGs get it via their viewBox; an
       HTML overlay has no viewBox, so without this it stays parked on the full-board layout while
       the water zooms away beneath it.

       KEPT AS A LIST, because this is the second time it has been got wrong by being a hand-written
       pair. playtest 21: #rimHost (the trade-wind current) was added as a third layer and NOT added
       here, so on any zoom the arrows detached from the board entirely and scattered across the
       screen — Wyatt: "the wind arrows are not attached to the board! When the director zooms in,
       they remain unaffected." The comment sitting right here already predicted it in as many
       words for the sail squares. Adding a board-mapped overlay now means adding its id to this
       array and nothing else. */
    const layers = CAM_HTML_LAYERS.map(id => $(id)).filter(Boolean);
    if (layers.length){
      const W = vwPx(), s2 = 640 / c.w;
      const t = `scale(${s2}) translate(${-(c.x / 640) * W}px, ${-(vy / 640) * W}px)`;
      if (t !== lastRipT){
        lastRipT = t;
        for (const el of layers){ el.style.transformOrigin = "0 0"; el.style.transform = t; }
      }
    }
  }
}

/* ================= gestures ================= */
const ptrs = new Map();
let pinch0 = null, panLast = null, lastTap = 0, moved = false;
function gestures(wrap){
  // playtest 4: pinching out over the board triggered Safari's tab-overview gesture. The board
  // owns its touches: no browser pan/zoom on this surface, and multi-touch never reaches Safari.
  wrap.style.touchAction = "none";
  wrap.addEventListener("touchmove", e => { if (S.active) e.preventDefault(); }, { passive: false });
  wrap.addEventListener("gesturestart", e => { if (S.active) e.preventDefault(); });
  wrap.addEventListener("gesturechange", e => { if (S.active) e.preventDefault(); });
  wrap.addEventListener("pointerdown", e => {
    wake();   // a finger is on the sea — full frame rate for the pan/pinch that may follow
    // playtest 5, hold-to-peek: while a finger is on the sea, every floating box steps aside so
    // the board behind it can be read; lifting the finger brings it back.
    //
    // WIDENED, 02-05 (Wyatt, direct ruling, 2026-08-19): this used to arm only "while #pp4Prompt
    // is showing", which meant a box that could be up with NO prompt on screen — a narration
    // bubble sitting alone, or the D-07 chat flash — never dimmed on hold at all. CLAUDE.md §2
    // (consistency): every floating box fades the same way on hold, including one that happens to
    // be the only thing up. Arm on ANY sea touch, unconditionally; the two sanctioned exceptions
    // (centre-stage intros, the flip veil) are what the body.pp4Peek CSS selector list excludes
    // (index.html), not this arm site.
    document.body.classList.add("pp4Peek");
    // D-39: a HOLD is what teaches the gesture, and pp4Peek arms on any sea touch — including the
    // tap that answers a sail square. Counting here would retire the hint after three ordinary
    // taps and teach nobody. The duration is judged on release instead (see `up`).
    peekArmedAt = Date.now();
    ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false;
    if (ptrs.size === 2){ const p = [...ptrs.values()]; pinch0 = { d: Math.hypot(p[0][0]-p[1][0], p[0][1]-p[1][1]), w: S.cam.tw }; }
    else panLast = [e.clientX, e.clientY];
  });
  wrap.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    const svg = svgEl(); if (!svg) return;
    const br = svg.getBoundingClientRect();
    const sc = S.cam.w / Math.min(br.width, br.height);
    if (ptrs.size === 2 && pinch0){
      const p = [...ptrs.values()];
      const d = Math.hypot(p[0][0]-p[1][0], p[0][1]-p[1][1]);
      if (Math.abs(d - pinch0.d) > 6){ moved = true; S.lock = true;
        const w = Math.max(640/2.6, Math.min(640, pinch0.w * pinch0.d / d));
        const cx = S.cam.tx + S.cam.tw/2, cy = S.cam.ty + S.cam.tw/2;
        camTo(cx - w/2, cy - w/2, w, true); }
    } else if (ptrs.size === 1 && panLast){
      const dx = e.clientX - panLast[0], dy = e.clientY - panLast[1];
      if (Math.hypot(dx, dy) > 7){ moved = true; S.lock = true;
        panLast = [e.clientX, e.clientY];
        camTo(S.cam.tx - dx * sc, S.cam.ty - dy * sc, S.cam.tw, true); }
    }
  });
  /* A FINGER THAT LEAVES THE BOARD STILL COMES UP — AND THE PEEK MUST END WHEN IT DOES.
     Found while measuring Group G fault 5, and it is worse than the fault it was found under.
     `pointerdown` on #boardwrap adds `pp4Peek` unconditionally (see the arm site above); this
     handler, which is the only thing that ever removes it, was bound to #boardwrap ALONE, with no
     pointer capture. So a pointer that goes down on the sea and comes up anywhere else — a pan
     that runs off the edge, a drag that ends over the captains card, a phone swipe that lifts past
     the bottom of the board — never disarms it.
     MEASURED at 1890x960 (4/scripts/group_g_peek_probe.mjs, case D): press on the sea, move to the
     captains column, release. `body.pp4Peek` is still set 2.5 seconds later, unattended, with
     `#pp4Prompt` at opacity 0.13 AND pointer-events:none. Every prompt in the game is then both
     invisible and untappable, and nothing on screen says why — the game reads as frozen. The only
     way out is to tap the sea again, which nobody would think to do.
     `ptrs` leaked the same way, taking the pinch and pan state with it.

     Bound to the WINDOW, and it is the SAME function rather than a second copy, so there is one
     answer to "is a finger still on the sea" instead of two kept in step (rule 23). The guard is
     what makes one binding safe: a release whose pointerdown was not ours is not ours to act on,
     which also stops a tap that BEGAN off the board from reaching the double-tap zoom.
     setPointerCapture — which the End of Voyage drag one screen over already uses — was tried and
     rejected here: capturing on #boardwrap retargets the compatibility mouse events too, and a
     sail square answers a plain `click` (flow.js), so it would have broken sailing to fix a fade. */
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    const wr = wrap.getBoundingClientRect();
    const onBoard = e.clientX >= wr.left && e.clientX <= wr.right &&
                    e.clientY >= wr.top && e.clientY <= wr.bottom;
    if (ptrs.size <= 1) setTimeout(() => document.body.classList.remove("pp4Peek"), 140);
    // D-39: count it only if they actually HELD — long enough for the board to have been revealed
    // and looked at. PEEK_HOLD_MS is the same 450ms a person needs before the fade reads as
    // deliberate rather than as a tap that happened to linger.
    if (peekArmedAt && Date.now() - peekArmedAt > PEEK_HOLD_MS) notePeekUse();
    peekArmedAt = 0;
    ptrs.delete(e.pointerId); pinch0 = null;
    // …and a TAP is still only a tap that ends on the board. Releasing over the captains card is
    // not a double-tap on the sea and must not zoom the camera or hurry a bubble.
    if (ptrs.size === 0 && !moved && onBoard){
      const now = Date.now();
      if (now - lastTap < 300){                      // double-tap: fit-board <-> zoom on my ship
        S.lock = true;
        if (S.cam.tw > 500){ const g = appState.game, me = g && g.players[appState.mySeat ?? 0];
          if (me) camToCell(me.pos, 2.0); } else camFull();
        lastTap = 0;
      } else lastTap = now;
      /* ITEM 21 REDESIGN (Wyatt, 2026-08-24): tapping yer own boat during a sail prompt reveals
         the NORMAL Stay put button — the same door the yellow stay square under the boat opens
         (renderPickPrompt, flow.js). The old Aye/Keep-sailin' confirm pair is deleted at his word:
         "Get rid of the Aye Stay Put and Keep Sailin' button flow entirely" — the Keep sailin'
         circle broke the consistent-back-button value, and the pair coexisting with the radial
         circle was his problem 3. One button, two ways to summon it, no confirm theatre. */
      if (document.querySelector(".sailCell")){
        const u = boatUXY(appState.mySeat ?? 0);
        if (u){
          const [bx, by] = toScreen(u[0], u[1]);
          if (Math.hypot(e.clientX - bx, e.clientY - by) < 34){
            const b = document.getElementById("apStay");
            if (b) b.style.display = "";
          }
        }
      }
      if (S.hurry) S.hurry();                        // any tap hurries the live bubble
    }
  };
  // the WINDOW, not the board — see the note on `up`. One binding, so there is one truth.
  window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
}

/* The tap-your-own-ship stay-put CONFIRM (the Aye / Keep-sailin' pair, playtest 11) lived here
   until 2026-08-24 — deleted at Wyatt's word (item 21 redesign): the Keep sailin' circle broke
   the consistent-back-button value and the pair read as a duplicate of the radial Stay put.
   Tapping the boat now simply reveals the hidden #apStay (the pointer handler above), the same
   door the yellow .pp4StayCell square under the boat opens. */

/* ================= end-of-voyage card: the A+C park gesture (item 8, D-14) =================
   Wyatt's pick, decoded 2026-08-21: the card starts fully up; scrolling it (normal overflow:auto,
   already free) reveals whatever is below the fold; pulling past its OWN top — the standard
   overscroll gesture, same shape as "pull to refresh" — carries the WHOLE card down until only its
   header (winner + title) is left showing, landing exactly where #pp4Cap (the captains box) already
   sits, so the board is fully revealed above it. Pulling up from there, or a plain tap on the
   parked strip, restores it. Symmetric with the dismiss, as he asked.

   NOTHING IS A CONSTANT (rule 9): every distance here is read off the DOM at drag time, not
   hardcoded —
     - the PARKED landing spot is #pp4Cap's own `getBoundingClientRect().top` (or, if that would
       clip the header the card is supposed to still show, the header's own rendered bottom edge —
       whichever leaves MORE of the header on screen wins, so a long winner name or a two-line
       victory sentence never gets cut).
     - the release THRESHOLD is a fraction of that same travel distance, not a fixed pixel count —
       it scales with the captains box's own height, which itself scales with the number of
       captains and the screen size.
   Pointer Events cover touch, mouse-drag and pen in one listener set; wheel is handled separately
   below because a trackpad/mouse scroll never fires a pointer drag. */
const EOV_PARK_RELEASE_FRACTION = 0.32; // a UI-feel ratio (how much of the travel counts as "let
  // go of it"), not a game quantity — CLAUDE.md rule 9 governs prices, thresholds and caps the
  // economy computes, not an interaction's own release feel. What IS derived is the pixel distance
  // this fraction is taken OF (see eovParkGeometry) — that is what changes per device and per game.
function eovTranslateY(wrap){
  const m = /translateY\(([-\d.]+)px\)/.exec(wrap.style.transform || "");
  return m ? parseFloat(m[1]) : 0;
}
function eovParkGeometry(wrap){
  const banner = wrap.querySelector(".winner-banner");
  const h3 = wrap.querySelector("h3");
  const cap = $("pp4Cap");
  const wrapRect = wrap.getBoundingClientRect();
  const T0 = wrapRect.top - eovTranslateY(wrap);           // the card's resting top, transform-free
  const VB = vhPx();
  const capTop = cap ? cap.getBoundingClientRect().top : VB;
  // headerH: how tall "winner + title" actually renders THIS voyage — read off the DOM, because a
  // long captain name or a two-line victory sentence changes it. Transform-safe: both wrapRect and
  // the banner's rect move together under the same translateY, so their difference does not.
  const headerBottom = banner ? banner.getBoundingClientRect().bottom
    : (h3 ? h3.getBoundingClientRect().bottom : wrapRect.top);
  const headerH = Math.max(0, headerBottom - wrapRect.top);
  // MEASURED, 2026-08-21: a naive Math.min(capTop, VB-headerH) parks the strip AT capTop whenever
  // the header is shorter than the captains box's own slot (the common case — a short winner name,
  // one-line victory sentence) — which leaves genuine dead space inside the strip, and the awards
  // row's own top edge shows through it, mid-card. Wyatt's "the rest of the card is off-screen
  // below" means NOTHING past the header shows, ever — so the strip's height is the SMALLER of the
  // two derived quantities (never taller than the captains box's own slot, never taller than the
  // header needs), which is Math.max on the TOP coordinate (a larger top = a shorter, tighter
  // window). In the rare case the header itself is taller than the captains box's slot (a long
  // captain name, a two-line victory sentence), this still refuses to eat MORE board than the
  // captains box itself used to cover — the header's own last line/word clips instead, a much
  // smaller cost than covering board the box never covered.
  const parkedTop = Math.max(capTop, VB - headerH);
  const dY = Math.max(0, parkedTop - T0);
  return { dY, T0, VB };
}
let eovDrag = null;
/* WHERE THE SCROLL LIVES — ONE ANSWER, READ IN BOTH PLACES THAT NEED IT.
   Until 2026-08-27 #statsWrap was itself the scroller, and this gesture read `wrap.scrollTop`
   directly in two spots: the pointerdown arm and the wheel handler. Moving the scroll into
   #statsScroll (so Play again could be a footer instead of a sticky button riding over the award
   cards) would have left both reads looking at an element whose scrollTop is now ALWAYS 0 —
   arming the park drag on every touch and killing ordinary scrolling outright. That is the cost
   BACKLOG.md predicted when it said "the gesture needs hand-verification".
   Two reads kept in step by hand is the rule-23 fault; there is one of them, and it falls back to
   the wrap so nothing breaks if the inner element is ever absent. */
const eovScroller = wrap => wrap.querySelector("#statsScroll") || wrap;
function wireEovDrag(){
  const wrap = $("statsWrap"); if (!wrap || wrap._pp4DragWired) return;
  wrap._pp4DragWired = true;
  const settle = (y, park) => {
    wrap.classList.remove("pp4EovDrag");
    wrap.style.transform = y ? `translateY(${y}px)` : "";
    wrap.classList.toggle("pp4EovParked", park);
  };
  wrap.addEventListener("pointerdown", e => {
    if (e.target.closest("button,a")) return;              // Play Again etc. keep their own tap
    // only capture the pull when there is nowhere further to scroll — the top of the content (a
    // normal scroll down to see below the fold stays a normal scroll) — or the card is already
    // parked, so pulling up from the strip can restore it from anywhere on the strip
    if (!wrap.classList.contains("pp4EovParked") && eovScroller(wrap).scrollTop > 0) return;
    eovDrag = { id: e.pointerId, startY: e.clientY, base: eovTranslateY(wrap), moved: 0 };
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener("pointermove", e => {
    if (!eovDrag || eovDrag.id !== e.pointerId) return;
    const raw = e.clientY - eovDrag.startY;
    eovDrag.moved = Math.max(eovDrag.moved, Math.abs(raw));
    if (eovDrag.moved < 4) return;                          // noise floor before this counts as a drag
    const g = eovParkGeometry(wrap);
    if (g.dY <= 0) return;                                  // degenerate geometry: no room to park
    const y = Math.max(0, Math.min(g.dY, eovDrag.base + raw));
    wrap.classList.add("pp4EovDrag");
    wrap.style.transform = `translateY(${y}px)`;
    e.preventDefault();
  });
  const up = e => {
    if (!eovDrag || eovDrag.id !== e.pointerId) return;
    const wasParked = wrap.classList.contains("pp4EovParked");
    const g = eovParkGeometry(wrap);
    if (eovDrag.moved < 4){
      // a TAP, not a drag — symmetric with the pull-down dismiss: tapping the parked strip restores
      if (wasParked) settle(0, false);
    } else if (g.dY > 0){
      const y = eovTranslateY(wrap);
      const threshold = g.dY * EOV_PARK_RELEASE_FRACTION;
      const park = wasParked ? y > threshold : y > (g.dY - threshold);
      settle(park ? g.dY : 0, park);
    }
    eovDrag = null;
  };
  wrap.addEventListener("pointerup", up);
  wrap.addEventListener("pointercancel", up);
  // desktop wheel: scrolling further down while already at the top of the content parks it;
  // scrolling up while parked restores it — same rule as the drag, driven by delta instead of a
  // pointer position, because a trackpad/mouse wheel never fires a pointer drag at all
  wrap.addEventListener("wheel", e => {
    const parked = wrap.classList.contains("pp4EovParked");
    if (!parked && eovScroller(wrap).scrollTop <= 0 && e.deltaY > 0){
      const g = eovParkGeometry(wrap);
      if (g.dY > 0){ settle(g.dY, true); e.preventDefault(); }
    } else if (parked && e.deltaY < 0){
      settle(0, false); e.preventDefault();
    }
  }, { passive: false });
}

/* ================= wind pill ================= */
/* THE PILL IS ALWAYS ON SCREEN (Wyatt's afternoon list, item 5: "Wind pill from frame one —
   `WIND NOW: ? · FORECAST: ?` placeholder so the board never jumps when the pill appears").
   Before the first wind is rolled there is nothing to report, and this used to return "" — so
   pillTick() hid the pill, boardBand() stopped reserving its strip, and the board sat that much
   taller until the first wind landed and shoved everything down, once, in every single voyage.
   Saying "?" costs one line and makes the band constant from the first frame. */
function pillHTML(){
  const g = appState.game; if (!g || !g.windNow || !AR[g.windNow]) return "WIND NOW: ? · FORECAST: ?";
  const now = g.windNow, fc = g.forecastWind();
  const nowS = `WIND NOW: ${now}${AR[now]}`;
  const fcS = g.stormNext
    ? ` · FORECAST: ⛈<span class="pp4Spin">↑</span>`
    : (fc ? ` · FORECAST: ${fc}${AR[fc] || ""}` : "");
  return nowS + fcS;
}
/* WHERE THE WIND PILL LIVES — ONE DECISION, READ TWICE (D-47 + D-52, rule 23).
   The stylesheet's own `@media (min-width:601px)` is the boundary that decides whether the header
   row has space for the wind; matchMedia asks THAT question rather than typing 601 here as well,
   so the two can never drift. matchMedia reads the true viewport, which is exactly what the media
   query reads — never vwPx(), which on the stage is body's own capped column. */
const pillRidesRibbon = () => { try { return matchMedia("(min-width: 601px)").matches; } catch (e) { return false; } };
function pillTick(){
  const p = $("pp4Pill"); if (!p) return;
  /* THE PILL IS A REAL CHILD OF THE HEADER ROW WHEREVER THE ROW HAS SPACE FOR IT.
     Design note 2 moved it into the row visually and left it `position:fixed; left:50%`, so the
     ribbon's flex children — which cannot know it exists — collided with it, and at z-index 19
     under the ribbon the ribbon won: the gradient over the pill (D-47) and the ⏩ over the pill
     (D-52) are the two symptoms of that one omission. Re-parenting is the fix, because spacing
     and paint order then come free from the row itself.
     Inserted BEFORE the clock chip, so the row reads DAY · boats · WIND · clock · ⏩ · 💬 · ☰ —
     left group, wind, right group. Guarded on the current parent, so this is a no-op on all but
     the one tick a window actually crosses the boundary; the phone keeps its own fixed pill below
     the ribbon (D-18/D-31, the phone stays as it is). */
  const rib = $("pp4Ribbon");
  const wantRibbon = !!rib && pillRidesRibbon();
  if (wantRibbon && p.parentNode !== rib) rib.insertBefore(p, $("pp4FF") || rib.lastElementChild);
  else if (!wantRibbon && p.parentNode !== document.body) document.body.appendChild(p);
  const h = pillHTML();
  if (h !== S.lastPill){ p.innerHTML = h; S.lastPill = h; }
  // statsWrap's visibility is toggled via its inline style — read that, never getComputedStyle
  // (which forces style recalc and was running every frame; see the HOT-PHONE note above)
  const sw = $("statsWrap");
  // only the End of Voyage card takes the pill off screen now — `!h` can no longer be true (see
  // pillHTML's note), and hiding on it was the source of the one-time board jump.
  const want = (sw && sw.style.display !== "none") ? "none" : "";
  if (p.style.display !== want) p.style.display = want;
}

/* ================= ribbon ================= */
function ribbonTick(){
  // D-31: a captain's held ingredients change every turn, which changes the captains card's own
  // natural width/height — the same tick that already runs every ~100ms is the cheapest existing
  // pulse to keep that current, throttled here (not every tick — this forces a layout reflow to
  // measure) rather than on its own timer, so there is exactly one clock deciding cadence for the
  // whole stage, not two that can drift apart.
  if (Date.now() - S.geomAt > 900) computeStageGeometry();
  const r = $("pp4Round"), g = appState.game;
  if (r && g) r.textContent = "DAY " + (g.round || 1);
  const boats = document.querySelectorAll("#pp4Ribbon .pp4Boat");
  const act = (S.activeSeat != null) ? S.activeSeat : (appState.curSeat ?? -1);
  // playtest 15 item 1: the circles read LEFT TO RIGHT in the drawn TURN ORDER, not seat order
  const ord = appState.turnOrder;
  boats.forEach((b, i) => {
    b.classList.toggle("on", i === act);
    const want = (ord && ord.length) ? String(ord.indexOf(i) < 0 ? i : ord.indexOf(i)) : "";
    if (b.style.order !== want) b.style.order = want;
  });
  // (The ribbon turn-clock chip #pp4Clock stood here — playtest 11/12. Left with the shot clock
  // 2026-08-28; its span and toggle wiring went in the same commit.)
  // the ⏩ chip shows only while a BOT holds the wheel and the voyage is live — on the player's
  // own turn there is nothing to skip; while a skip runs it stays lit so a tap can't double-arm
  const ff = $("pp4FF");
  if (ff){
    const g2 = appState.game;
    // no ⏩ at a Pass & Play table (Wyatt's ruling, 2026-08-13) and no ⏩ in a crew game either
    // (D-04, 02-03, 2026-08-19 — the skip's third mode, not a new ruling: "there is no skip in a
    // multiplayer game -- this was decided earlier. skip is only for solo games"). The ⏩ exists to
    // skip BOTS (348ccf4); a Pass & Play table and a networked table both hold nothing but people
    // on the turns being waited on, so there is nothing left for either to skip. `appState.db &&
    // appState.room` is the same networked test the chat panel already uses (orchestrator.js) —
    // reused here rather than inventing a new flag, per the state module's own field for "am I in
    // a room right now."
    const botsUp = g2 && !appState.liveDone && !appState.passAndPlay && !(appState.db && appState.room) &&
      act >= 0 && act !== (appState.mySeat ?? 0) && g2.players[act] && !g2.players[act].done;
    // explicit inline-flex/none — the CSS base is display:none, so writing "" would fall back to
    // hidden. inline-flex, NOT block: playtest 21 item 8 gave the ⏩ and the clock one shared box
    // rule that centres their contents with flex, and an inline `display:block` written here would
    // silently defeat that centring on the ⏩ only — the exact drift the shared rule exists to stop.
    const want = botsUp ? "inline-flex" : "none";
    if (ff.style.display !== want) ff.style.display = want;
    ff.classList.toggle("on", !!appState.ff);
  }
  // D-06: the 💬 chip lives only where there's someone to talk to — a crew game. `appState.db &&
  // appState.room` is the SAME networked test the ⏩ chip just above (D-04, 02-03) and the classic
  // #chatPanel display gate (orchestrator.js's beginGame(), "no chat in solo/pass-and-play — no one
  // else to talk to") already use — reused a third time here rather than inventing a fourth copy.
  const chat = $("pp4Chat");
  if (chat){
    const netUp = !!(appState.db && appState.room);
    const wantChat = netUp ? "inline-flex" : "none";
    if (chat.style.display !== wantChat) chat.style.display = wantChat;
  }
  // playtest 13: End of Voyage carries its own big PLAY AGAIN at the bottom. The real
  // #btnPlayAgain lives in the stage-hidden controls row, so this proxy clicks it. Re-injected
  // on this tick whenever a re-render rebuilds the stats panel.
  const sw = $("statsWrap");
  if (sw && sw.style.display !== "none" && !sw.querySelector(".pp4Again")){
    const again = document.createElement("button");
    again.className = "pp4Again"; again.type = "button"; again.textContent = "🔁 Play again!";
    again.onclick = () => { const orig = $("btnPlayAgain"); if (orig && orig.onclick) orig.onclick(); };
    /* APPENDED TO THE WRAP, NOT THE PANEL — it is a FOOTER now, a flex sibling of #statsScroll
       rather than the last child of the scrolling content. That is the whole fix for the button
       riding over the award cards. */
    sw.appendChild(again);
    /* NO PADDING RESERVATION ANY MORE, and deleting it is part of the fix rather than tidy-up.
       It existed solely because a STICKY button floated over the scrolling content: the reserve
       bought back the last rows that would otherwise sit permanently underneath it. The button is
       a footer outside the scroller now, so nothing is ever behind it and there is nothing to
       reserve. Leaving the padding would open a dead strip at the foot of the list.
       (The bug it fixed is still worth knowing: ~52px of the stats list was unreachable at
       390x844 because the reserve was made on #statsPanel, which does not scroll.) */
  }
}

/* ================= THE BOARD'S WINDOW — one definition, and one clip ==================

   Wyatt, playtest 22 item 7, and he asked for the RULE rather than the patch: "The narration boxes
   must be occluded by the game board also. Do not patch this one by one; there is a generalizable
   rule here: whatever is shown in the game board should only be visible within this game board
   window; it should zoom naturally and be directed consistently... you can see 'Wyargh calls
   crustbeard…' hovering over the captains box, which is bad. But it happened because the game board
   is zoomed in, and spatially, wyargh would be down behind the captains box."

   The old comment in index.html states the defect plainly and left it: "#pp4Prompt and the narration
   bubbles are position:fixed on <body>, so the clip cannot reach them." #boardwrap clips (z5), the
   captains box is z22, and the bubbles were z26 on <body> — so a bubble anchored to a ship that had
   been zoomed off the bottom of the board still painted, over the captains box, describing
   something the player could not see.

   THE BAND is the region where the board is actually visible: below the wind ribbon, above the
   captains box. capT and tSafe were already computed for the radial placement, but privately —
   which is why the bubbles never learned about them. One function now, three consumers: the clip
   host, the bubble placer and the ask pill.

   THE CLIP is what makes it a rule rather than a promise. #pp4Fx is sized to the band and carries
   overflow:hidden, so anything appended to it is PHYSICALLY unable to paint over the captains box or
   over the ribbon, however wrong its own arithmetic goes. Placement still clamps inside the band —
   clipping is the guarantee, clamping is what stops the guarantee from ever cutting a line in half. */
export function boardBand(){
  const cap = $("pp4Cap");
  const rib = $("pp4Ribbon");
  const capVisible = cap && getComputedStyle(cap).display !== "none";
  const shown = el => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && el.getBoundingClientRect().height > 0 && !!(el.textContent || "").trim();
  };
  const ribB = (rib && getComputedStyle(rib).display !== "none") ? rib.getBoundingClientRect().bottom : 44;
  /* THE WIND PILL IS CHROME, NOT BOARD. Wyatt, 2026-08-20, after asking for a screen recording of
     sailing into the trade winds in pass & play against solo — which is the check that found this,
     and which three rounds of state measurement could not.

     The recording showed "Mate: tap to sail" drawn straight over "WIND NOW: S↓ · FORECAST: …",
     cutting the forecast off mid-word. MEASURED afterwards over eighteen sail prompts: the wind
     pill occupies y 52–80, the ribbon ends at 45, and the ask pill was allowed anywhere from 51
     down — so 1 in 5 sail prompts landed on the one readout that EXPLAINS the highlighted squares.
     SOLO 1/9 and PASS & PLAY 2/9: the same placement rule, not a mode difference. His report that
     "pass-and-play trade winds differ from solo" is very likely this — the winds are identical
     (three independent measurements say so), but whether you can READ them is not.

     The band already exists to answer "where is the board actually visible", and the pill sits
     inside what it was calling board. Adding it here rather than at the pill's own placement is the
     point: this function has three consumers (the clip host, the bubble placer, the ask pill), so
     every board-anchored floater clears the wind readout from one edit — and the next one somebody
     adds does too, without knowing the pill exists.

     Guarded on having TEXT, not merely a box: pillHTML() returns "" before the first wind is rolled,
     and an empty pill must not reserve a band it is not occupying. */
  const pillB = shown($("pp4Pill")) ? $("pp4Pill").getBoundingClientRect().bottom : 0;
  const top = Math.max(ribB, pillB) + 8;
  const bottom = capVisible ? capBandBottom() : vhPx();
  return { top, bottom, left: 8, right: vwPx() - 8 };
}
// the clipped host every board-anchored floater lives in. Re-sized from the band on the same tick
// the camera moves, so a captains box that grows (a fourth captain, a wrapped hold) takes the
// bubbles with it instead of letting them slide underneath.
function fxHost(){
  let h = $("pp4Fx");
  if (!h){
    h = document.createElement("div");
    h.id = "pp4Fx";
    h.setAttribute("aria-hidden", "true");
    document.body.appendChild(h);
  }
  const b = boardBand();
  const t = Math.round(b.top), ht = Math.max(0, Math.round(b.bottom - b.top));
  if (h.dataset.t !== String(t)){ h.style.top = t + "px"; h.dataset.t = String(t); }
  if (h.dataset.h !== String(ht)){ h.style.height = ht + "px"; h.dataset.h = String(ht); }
  return h;
}

/* ================= bubbles ================= */
// One live bubble at a time (flash() is awaited sequentially upstream). Captain lines anchor to
// the speaker's ship under the CURRENT camera; table lines hover top-centre over the water.
const plain = h => String(h).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
/* `opts.wait` — A WAIT LINE HAS NO DEADLINE. Item 19, Wyatt 2026-08-20: "It shouldn't disappear by
   time, it should disappear when their teammates have played — otherwise the game can look stalled
   with no description as to why or what's going on." A wait line is the one narration whose subject
   is "nothing is happening yet", so the ordinary hold curve retires it precisely when it is still
   the only thing on screen explaining the pause, and what is left is a dead board.
   NOT SOLVED BY A BIGGER NUMBER (CLAUDE.md rule 9) — no constant here is touched, and the ceiling
   at :578 is untouched. The mechanism already exists: stageFlash's first act is `S.hurry()`, which
   retires the live bubble the instant a new one is shown, and the next real line is fired by the
   event that actually ends the wait. So a wait bubble simply never registers a deadline and sits
   there until something real replaces it.
   SAFE ONLY BECAUSE NOTHING AWAITS A WAIT LINE. "A UI gate that can wait forever is a game that
   can hang" (see the deadline note below) — every one of the four wait sites calls this
   fire-and-forget: netIntroBarrier's waitMsg, watchDraftPrompt's waitMsg, recipeDraftNet's two
   lines, and ask()'s "…is deciding…" broadcast. None is awaited by the game loop. If a future wait
   line IS awaited, it must not use this flag. */
function stageFlash(msg, ms, holdMs, variants, opts){
  if (!S.active) return null;                        // pre-game: let the panel handle it
  /* A REPLAY IS SILENT AND INSTANT — playtest 22, the other half of the stall report (Wyatt: "when
     i refreshed the browser, the game RESTARTED").

     It did not restart. A solo refresh REPLAYS the decision log to rebuild the voyage, and every
     other surface in the game knows to do that silently: panel.js's own `sleep` is
     `appState.replaying ? Promise.resolve() : …`, panel() returns early, renderLiveShips,
     paintShipAt, paintShipAtPoint and animateSailRoute all open with the same guard. This function
     was the one that did not — so the replay played every narration line at full length, 2.5-6.75
     seconds each, hundreds of them, from Day 1 forward. What that looks like from the seat is a
     brand new voyage, which is exactly what was reported: the state was never lost, it was being
     re-narrated in real time.

     Consistency, in this project's sense: `appState.replaying` is one condition honoured on every
     surface, and a surface that quietly opted out is a bug even while every line it drew was
     correct. Same shape as the `ff` guard directly below. */
  if (appState.replaying) return Promise.resolve();
  // ⏩ fast-forward: narration is dropped entirely (Wyatt picked cut-not-montage) — the recap at
  // skip end covers it. Resolved (not null) so panel.flash treats it as handled and never falls
  // back to the slow panel path.
  if (appState.ff) return Promise.resolve();
  // a line that just repeats the live prompt's own ask (the broadcast mirror of localAsk)
  // would bubble the same words twice — the pill already says it
  const liveMsg = document.querySelector("#actionPanel .apMsg");
  if (liveMsg && typeof msg === "string" && plain(msg) && plain(msg) === plain(liveMsg.innerHTML)) return Promise.resolve();
  /* …AND THE SAME LINE ARRIVING BEFORE THE PILL EXISTS. The dedup above can only see a prompt that
     is ALREADY in the DOM, and ask()'s mirror is posted two milliseconds BEFORE panel() builds one
     — which is the whole of Wyatt's items 2 and 8. The predicate is in util.js, evaluated here
     because this is the one renderer the host's own game loop and a guest's watchNarr both reach:
     a wait line for a captain sitting at THIS browser is not drawn, because they are getting the
     question itself. Everyone else still reads "…is deciding…". */
  if (waitLineIsSelfAddressed(variants, opts)) return Promise.resolve();
  let subj = S.subject; S.subject = null;
  if (subj == null && typeof msg === "string"){
    /* turn-start lines ("X sets sail") carry no event — sniff the speaker from pn()'s colour.
       ONE CAPTAIN NAMED, OR NOBODY. T-08 — his checklist #32 (Wyatt, 2026-08-26): "the storm narration that reported
       how players were moved appeared connected to the player 1; it shouldn't -- it should appear
       in the dark blue narration box that reports table-wide events. this should be the behavior
       across all modes, not just pass-and-play."

       This used to take the FIRST colour it found. A storm summary names several captains, each
       wrapped in their own colour by pn() — "Flaky Jack was swept…, Dough Hook held…" — so a
       report about the whole table was pinned to whichever captain happened to be mentioned
       first. That is his player 1, and the arbitrariness is the tell: the anchor was the reading
       order of the sentence, not its subject.

       A line naming two or more captains is BY DEFINITION about the table rather than about any
       one of them, so it stays subject-less and draws in the table-wide box. The turn-start case
       the sniff exists for names exactly one captain and is untouched. Nothing is mode-specific:
       this is the one derivation every mode reads, which is why his "across all modes" comes for
       free rather than needing three fixes. */
    const named = [];
    for (let i = 0; i < HEXCOL.length; i++) if (msg.indexOf(`color:${HEXCOL[i]}`) >= 0) named.push(i);
    if (named.length === 1) subj = named[0];
  }
  if (S.hurry) S.hurry();                            // one live bubble: retire the old one NOW
  // playtest 5: a manual pinch/pan holds the camera only until the next action — then the
  // director takes the wheel again, so other captains' moves never play off screen.
  S.lock = false;
  const evType = S.evType; S.evType = null;
  if (evType === "storm") camFull();                 // watch the shove land from above
  /* playtest 12 item 10: while a battle card is live, the camera HOLDS on the battle — a flee
     call can only be made by someone who can see the fight, not the caller's own boat.
     playtest 22 extends that ruling to the WHOLE fight rather than to the card alone (Wyatt: "the
     director should focus battles on the players fighting, not the player calling the battle").
     The card is built after the calls are collected, so the `.btl` test could not cover the part
     of a battle that asks a spectator anything: the crow's-nest call ran with the camera still on
     whoever the opening line named, and then every "X calls Y" line glided it to the CALLER. So
     the hold is now armed by the battle itself (S.battle, set at the top of asyncBattle) and the
     card test stays as the belt to that braces. */
  else if (S.battle) { /* hold the shot on the fight until it resolves */ }
  else if (subj != null && !document.querySelector("#actionPanel .btl")) camToSeat(subj);
  return new Promise(res => {
    // HOW LONG A NARRATION LINE STAYS UP -- one call, and the model behind it lives in util.js
    // beside the curve it replaced (narrationHoldMs, D-34/D-45).
    //
    // What used to be here, and why none of it survives:
    //   Math.max(2550, Math.min(8775, round(msgHoldMs(msg, 3330) * 1.5)))
    // The outer 8775 never bound -- an earlier attempt raised it from 6750, shipped, and measured
    // as changing nothing, because msgHoldMs's own ceiling capped every line before this clamp saw
    // it. The 2550 FLOOR is the one that mattered: it is what made a 27-character turn banner hold
    // exactly as long as a 75-character sentence, which is Wyatt's item 6 ("medium narration lines
    // drag"). D-34 replaced the whole model with reading speed, and the elegant version of that
    // change DELETES the floor rather than lowering it -- so there is nothing left to clamp here.
    //
    // D-45 re-ruled D-10's long-line number in the open (5.3s -> 4.5s); the ceiling now lives in
    // util.js, derived from D-10's own hold, and this call site names no milliseconds at all.
    const hold = narrationHoldMs(msg);
    const b = document.createElement("div");
    b.className = "pp4Bub" + (subj == null ? " ambient" : "");
    if (subj != null) b.style.borderColor = HEXCOL[subj] || "#177";
    // playtest 10 item 7: bubbles bypass panel()'s emojify chokepoint, so ad-hoc narration lines
    // (turn banners, flip results) kept raw ⚪/🌕 emoji instead of the game art. Emojify here.
    b.innerHTML = `<div class="pp4BubIn">${emojify(String(msg))}</div>` + (subj != null ? `<div class="pp4Tail" style="border-color:${HEXCOL[subj] || "#177"}"></div>` : "");
    const host = fxHost();
    host.appendChild(b);
    // playtest 4: lines type themselves in, the game's own reveal — and fade out on replace
    try { typewriterReveal(b.querySelector(".pp4BubIn"), 9); } catch (e) {}
    /* ONLY AS WIDE AS THE WORDS — playtest 23 item 3 (Wyatt): "the narration text boxes should only
       be as wide as they need to be… For a single line text box the boxes should be only as wide as
       they need to be to fit the text."

       `width: max-content` rather than dropping the width and letting the absolute box shrink-wrap:
       an abs-positioned element with `left` set sizes against the space LEFT of the containing
       block's right edge, so a bubble for a ship near the right of the board would have wrapped a
       line that fits perfectly well at the same font. max-content is the one-line width regardless
       of where the box is standing; the cap then wraps only what genuinely cannot fit.

       Safe against the typewriter, and this is the reason it is safe rather than lucky:
       typewriterReveal() splits every text node into a shown span and a `visibility:hidden` span
       holding the SAME full text, so the box's intrinsic width is the finished line's from the very
       first frame. Nothing grows as the words arrive. (Same property panel.js records for height.)

       Both other floating boxes already do this and are untouched: `.pp4Bub.ambient` is
       `max-width:min(320px,86vw)` with no width, and the chat `.bubble` is `max-width:42%`. */
    const CAP = () => Math.min(290, vwPx() - 24);
    b.style.width = "max-content";
    b.style.maxWidth = CAP() + "px";
    let bh = 0, bw = 0, bhAt = -1e9;   // HOT-PHONE: offset* are layout reads — remeasure ~2x/s, not 60
    const place = () => {
      if (subj == null) return;                      // ambient: CSS position
      const u = boatUXY(subj); if (!u) return;
      const [sx, sy] = toScreen(u[0], u[1]);
      const band = boardBand();
      const h = fxHost();                            // keeps the clip in step with the captains box
      const cap = CAP();
      if (b.style.maxWidth !== cap + "px"){ b.style.maxWidth = cap + "px"; bhAt = -1e9; }
      if (performance.now() - bhAt > 500){ bh = b.offsetHeight; bw = b.offsetWidth; bhAt = performance.now(); }
      // MEASURED, not computed: the clamp and the tail both need the width the renderer actually
      // gave the box, which is now the text's width and no longer a number this file chose.
      const W = bw || cap;
      let left = Math.min(Math.max(sx - W / 2, band.left), band.right - W);
      /* ABOVE THE SHIP WHEN THERE IS ROOM, BELOW IT WHEN THERE IS NOT — playtest 22 item 4:
         "When the boats are at the top of the map, the narration box should appear below them, so
         that it doesnt cover them up." The old line clamped to a flat 54px, which for a ship near
         the top meant the bubble was pushed DOWN onto the boat it was talking about. Flipping is
         the only placement that keeps both the ship and the words visible. */
      const above = sy - bh - 40;
      const belowY = Math.min(sy + 44, band.bottom - bh - 4);
      /* THE SIDE IS CHOSEN ONCE AND NEVER RE-CHOSEN (Wyatt, 2026-08-25 — see toScreenRest above).
         It is latched off the RESTING screen position, so it is the side that will be correct when
         the director stops, not the side that happens to fit mid-pan. Latched only once the box
         has a measured height: deciding against bh=0 would pick "above" for everything. */
      if (b._side == null && bh > 0){
        const [, syRest] = toScreenRest(u[0], u[1]);
        b._side = (syRest - bh - 40 >= band.top) ? "above" : "below";
      }
      const side = b._side || ((above >= band.top) ? "above" : "below");
      let top = side === "above" ? above : belowY;
      /* …AND NEVER OVER A SQUARE YOU HAVE TO CLICK — D-38 (Wyatt, 2026-08-21): "always keep the
         prompt and buttons closer to the boat, even if they start to block some of the board
         elements. One exception to this rule is for sailing squares, which you have to click and
         you cannot click them if they are covered by something."
         A bubble covering the sea, an island or a ship is now explicitly fine; a bubble covering a
         legal move is not, because the move becomes unreachable. Measured by the playtest gate on
         phone, where four sail squares at once sat under a bubble and its tail.
         The search is deliberately tiny — the same two vertical spots this already chose between,
         each also tried flush left and flush right in the band — and it takes the first placement
         that covers NO square, else the least-bad one. It cannot wander, because every candidate
         is one the old code would already have been happy with. */
      /* THE OBSTACLE LIST IS EVERY THING THE PLAYER MUST READ OR TAP — not just sail squares.
         Two measurements drove this. The judge kept finding a narration bubble sitting on the ASK
         PILL ("Crustbeard declines" over "Take a deal, or walk away?") — the search had no idea the
         pill existed. And posing a sail prompt on a 390x664 phone measured the bubble standing on
         SEVEN of twenty-two sail squares, a straight D-38 violation, because six candidate spots on
         a board that full are not enough and "least-bad" was genuinely bad.

         WEIGHTED, so D-38's own exception cannot be traded away. A sail square is the thing Wyatt
         singled out — you cannot make the move if you cannot tap it — so it outranks everything;
         then the controls; then the question; then its helper line. Covering the sea, an island or
         a ship stays explicitly free, exactly as D-38 says.

         AND IT STILL PREFERS THE BOAT. Widening the search is what makes a clear spot findable, but
         D-38 also says the words should stay near the ship, so distance from the boat is the
         TIE-BREAK rather than a cost of its own: among equally clear spots the nearest wins, and no
         amount of distance can buy covering a square. That is what stops a wider search wandering,
         which is the risk the narrower version was written to avoid. */
      const OBST = [[".sailCell", 1000], [".apBtn,.btlBtn,#apStay", 60], [".apMsg", 40], [".apSub,.apSliderWrap", 15]]
        .flatMap(([sel, w]) => [...document.querySelectorAll(sel)]
          .filter(e => e !== b && !b.contains(e) && e.getBoundingClientRect().width > 4)
          .map(e => ({ r: swellRect(e, fixedRect(e)), w })));   // the PEAK box, as the hint does
      if (OBST.length){
        const cost = (x, y) => OBST.reduce((n, o) =>
          n + ((x < o.r.right && x + W > o.r.left && y < o.r.bottom && y + bh > o.r.top) ? o.w : 0), 0);
        /* CANDIDATES ON THE LATCHED SIDE ONLY. The search may still slide the box along, and step
           to the band's edge on its own side to clear a sail square — it may never cross the boat,
           because crossing IS the flip he asked us to remove. */
        const ys = [];
        for (const y of (side === "above" ? [above, band.top + 4] : [belowY, band.bottom - bh - 4])) {
          const yy = Math.max(band.top, Math.min(y, band.bottom - bh - 4));
          if (!ys.some(v => Math.abs(v - yy) < 6)) ys.push(yy);
        }
        const xLo = band.left, xHi = Math.max(band.left, band.right - W), span = xHi - xLo;
        const xs = [left, xLo, xHi];
        for (let k = 1; k <= 5; k++) { const x = Math.round(xLo + span * k / 6); if (!xs.some(v => Math.abs(v - x) < 8)) xs.push(x); }
        let best = null;
        for (const y of ys) for (const x0 of xs){
          const x = Math.max(xLo, Math.min(x0, xHi));
          const c0 = cost(x, y);
          const near = Math.hypot((x + W / 2) - sx, (y + bh / 2) - sy);   // tie-break only
          if (!best || c0 < best[2] || (c0 === best[2] && near < best[3])) best = [x, y, c0, near];
        }
        if (best){ left = best[0]; top = best[1]; }
      }
      b.style.left = (left - 0) + "px";
      b.style.top = (Math.max(band.top, Math.min(top, band.bottom - bh - 4)) - band.top) + "px";
      b.classList.toggle("below", side === "below");   // the tail follows the LATCHED side
      const t = b.querySelector(".pp4Tail");
      // the tail tracks the ship, clamped INSIDE the box — and the box can now be narrow, so the
      // two bounds are ordered rather than nested: with a fixed 290px width `Math.max(16, …W-32)`
      // could never invert, and at max-content width it can.
      if (t) t.style.left = Math.min(Math.max(sx - left - 8, 8), Math.max(8, W - 23)) + "px";
    };
    // Wyatt's recording, measured frame by frame: positioned on a 90ms interval, the bubble
    // trailed the 60fps camera glide in visible 25-40px steps — a different loop than the board.
    // It now rides tick() itself, repositioned in the SAME frame the camera moves.
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      if (S.bubFinish === finish){ S.bubFinish = null; S.bubDue = 0; }
      if (S.bubPlace === place) S.bubPlace = null;
      if (S.hurry === finish) S.hurry = null;
      if (S.waitFinish === finish) S.waitFinish = null;
      b.classList.add("out");
      setTimeout(() => b.remove(), 300);
      res();
    };
    S.hurry = finish;
    S.bubPlace = place;
    /* THE HOLD IS A DEADLINE, NOT A TIMER — playtest 22, and this is the CRITICAL one (Wyatt: "the
       game just completely stalled").

       MEASURED, headless, and it is not a logic bug at all. Every narration line is awaited by the
       game loop, and this promise used to be resolved by exactly one `setTimeout`. Instrumented:
       the bubble's `finish` timer AND a canary armed on the same line with the same delay were
       BOTH never delivered — neither was ever cleared, and a 250ms setInterval kept counting right
       through it (272 ticks over 72s). A browser dropped two pending timeouts. The game had no
       second way to continue, so it stopped for good: no prompt, no error, no clock — exactly what
       a stall looks like from the seat. On a phone this is the ordinary case rather than the exotic
       one, because backgrounding a tab is what people do with phones.

       The rule is already written thirty lines up, for stageSettled: "A UI gate that can wait
       forever is a game that can hang." This gate could, and did. So the deadline is recorded and
       tick() — which is re-armed by BOTH rAF and setTimeout, and restarted outright on
       visibilitychange — retires the bubble the moment the clock says it is due. The timeout stays
       as the fast path; the deadline is the belt that means losing it costs a late line rather than
       the voyage. A tab that comes back from the background finds the line already overdue and the
       game carries straight on. */
    // A WAIT LINE REGISTERS NEITHER — no deadline, no timeout. S.hurry is still armed above, so
    // the next real narration retires it, and so does a tap. Every other bubble is unchanged.
    // …and it registers ONE more thing, which is the whole of retireWait() below: a wait line is
    // the only bubble that means "you are done, the others are not". The moment this screen is
    // asked something again that statement is false, so promptTick retires it — precisely, without
    // touching a narration line that merely happens to be on screen at the same moment. That
    // registration is IMMEDIATE and is never deferred by the veil rule below: a wait line has no
    // reading deadline to protect, and a promptTick that cannot find it is 3a80839's bug again.
    const armHold = () => {
      if (done) return;
      S.bubDue = Date.now() + hold;
      S.bubFinish = finish;
      setTimeout(finish, hold);
    };
    /* A HOLD IS A DEADLINE FOR READING, AND IT MUST NOT RUN WHILE THE LINE CANNOT BE SEEN.
       Measured on build h: "Claude flips TAILS" was on screen for 2862ms and spent 1140ms of that
       — forty per cent — drawn UNDERNEATH the full-screen flip veil, because .pp4Bub's stacking
       context #pp4Fx is z-index 21 and #pp4Veil is 44. The bubble's tail points at a boat the veil
       is covering, and the veil is Wyatt's own sanctioned exception to hold-the-sea, so raising the
       bubble above it would be wrong twice over. Fix the clock, not the z-order.
       BOUNDED, BECAUSE THIS IS THE CRITICAL CLASS. Every narration hold is awaited by the game
       loop, and "the game just completely stalled" is a playtest-22 finding — a deferral that can
       wait forever is a stall with a good excuse. The cap is the ceremony's own two clocks added
       together (the longest the veil can legitimately stand), not a new number; the poll runs on
       the same 120ms beat cerWatchResult uses and clears itself on the first of three conditions. */
    if (opts && opts.wait) S.waitFinish = finish;
    else if (!$("pp4Veil")) armHold();
    else {
      const veilT0 = Date.now();
      const veilIv = setInterval(() => {
        if (done || !$("pp4Veil") || Date.now() - veilT0 >= CER_VEIL_WAIT_CAP_MS){
          clearInterval(veilIv); armHold();
        }
      }, 120);
    }
    wake();   // a live bubble rides the ship — full frame rate while it's up
    b.addEventListener("pointerdown", finish);
    place();
  });
}

/* ================= flip ceremony ================= */
// Playtest 3 rebuild. The coin moves INTO the veil (root stacking context), flex-centred with
// its caption right beneath it — no fixed-position tricks, nothing above it to grey it out.
// Disarm does NOT tear down: the veil holds while the spin plays and the landed face shows,
// then the flippenator goes home to the (hidden) controls row.
/* THE CEREMONY IS CENTRED IN THE BOARD BAND, NOT IN THE WINDOW (Group G fault 1).
   Judged on solo-phone-015 and -016: "the battle 'Broadside!' caption text is drawn on top of the
   CAPTAINS card; the captain names show through the white text and both are hard to read." Two
   screens, so not a fluke, and desktop is fine (solo-desktop-018/-019) because the captains sit in
   a side column there.

   MEASURED at 390x664: the veil is `inset:0`, so its flex column centres in the whole 664px window
   — title y154.6, coin y203-419, stakes y445-464, tap-hint y490-509 — while the captains card
   starts at y433. The stakes line lands 19.3px inside the card and the tap-hint 19px inside it,
   with the column's foot spilling 76.4px past the card's top edge. The words are white-on-dim and
   the card behind them is a pale box full of captain names, so both become unreadable at once.

   THE FIX IS THE ROOM, NOT THE WORDS. The scrim still covers the whole screen — dimming the ribbon
   and the card is its job — but the COLUMN is given only the board band to centre in, by padding
   the veil's head and foot with the strips the ribbon and the captains card occupy. `boardBand()`
   and `capBandBottom()` are the existing answers to where those strips are (the plan's own
   instruction: do not invent a new number), and the second of them already returns the full
   viewport height in side-by-side — which is what the `stacked` test below reads, so the DESKTOP
   ceremony comes out byte-identical rather than merely close.

   Re-read every tick rather than once, for the same reason fxHost() is: the card grows a row when
   a fourth captain joins and grows again as holds fill, and a ceremony can be on screen while it
   does. Written only when the number changes, so a still ceremony costs one integer compare. */
function cerBandTick(){
  const veil = $("pp4Veil"); if (!veil) return;
  const band = boardBand();
  /* PAD THE FOOT BY THE CAPTAINS CARD, AND THE HEAD BY THE RIBBON — but the head only when there
     IS a card under the board. `capBandBottom()` already encodes that question: it returns the full
     viewport height in side-by-side, so `stacked` is false on desktop, the head padding is zero,
     and the desktop ceremony is byte-identical. Padding the foot alone was tried first and moved
     the fault rather than fixing it: the column then centred in 0..433 instead of 88..433, and the
     title landed at y39.1 against a ribbon that ends at y45 — 5.9px into it, and into the wind pill
     below that. Fixing one overlap by making another is not a fix (rule 8). */
  const stacked = capBandBottom() < vhPx();
  const padT = stacked ? Math.max(0, Math.round(band.top)) : 0;
  const padB = Math.max(0, Math.round(vhPx() - band.bottom));
  if (veil.dataset.padT !== String(padT)){ veil.style.paddingTop = padT + "px"; veil.dataset.padT = String(padT); }
  if (veil.dataset.padB !== String(padB)){ veil.style.paddingBottom = padB + "px"; veil.dataset.padB = String(padB); }
  /* …AND THE COLUMN'S OWN AIR CLOSES UP WHEN THE BAND IS SHORT, because on a phone the ceremony is
     TALLER THAN THE BAND IT HAS TO LIVE IN. Measured at 390x664: title 22.4 + coin slot 216.1 +
     stakes 19.4 + tap-hint 19 = 276.9px of content, three 26px gaps on top of that = 354.9px, in a
     band of 345px. Something has to give, and it is the AIR — never the words, and never the coin,
     which is the thing being asked for.
     DERIVED, and stable because no term in it depends on the gap: the four children's own rendered
     heights, the band the renderer produced, and the 6px of clear air every other stacked floater
     in this file already leaves. The ceiling is the stylesheet's own resting value, READ from
     --pp4CerGapMax rather than copied here, so there is one 26 in the project and not two.
     On any band with room to spare the arithmetic saturates at that ceiling, which is why the
     desktop ceremony — and a tall phone — are unchanged rather than merely nearly unchanged. */
  const kids = [...veil.children].filter(el => getComputedStyle(el).display !== "none");
  if (kids.length < 2) return;
  const gapMax = parseFloat(getComputedStyle(veil).getPropertyValue("--pp4CerGapMax")) || 26;
  const AIR = 6;
  const contentH = kids.reduce((n, el) => n + el.getBoundingClientRect().height, 0);
  const room = Math.max(0, band.bottom - band.top) - AIR * 2;
  const g = Math.max(0, Math.min(gapMax, Math.floor((room - contentH) / (kids.length - 1))));
  if (veil.dataset.gap !== String(g)){ veil.style.rowGap = g + "px"; veil.dataset.gap = String(g); }
}
function cerTeardown(){
  const veil = $("pp4Veil"); if (!veil) return;
  const fp = $("flipPanel"), row = $("controlsRow");
  if (fp && row && fp.parentElement !== row) row.insertBefore(fp, row.firstChild);
  veil.remove();
  document.body.classList.remove("pp4Cer");
  if (window.__pp4) window.__pp4.flipMsg = null;   // a later ceremony never inherits these words
  S.cerHome = null;
}
/* THE CEREMONY'S OWN TWO CLOCKS, named rather than typed twice. CER_REVEAL_MS is how long the
   landed face is shown before the veil leaves; CER_FALLBACK_MS is the veil's own teardown when no
   face ever lands. Their SUM is the longest the veil can legitimately stand, and that is the only
   number a hold deferred behind the veil is allowed to derive its cap from (nothing in this game
   is a constant, and a new one here would be a third clock to keep in step with these two). */
const CER_REVEAL_MS = 1100, CER_FALLBACK_MS = 6000;
const CER_VEIL_WAIT_CAP_MS = CER_FALLBACK_MS + CER_REVEAL_MS;
function cerWatchResult(){
  // the flip flow swaps faces on #flipCoinWrap: spin -> heads/tails. Hold the veil until a face
  // lands, show it a beat, then leave. Fallback teardown if nothing lands (e.g. prompt cancelled).
  const coin = $("flipCoinWrap");
  const t0 = performance.now();
  const iv = setInterval(() => {
    const c = $("flipCoinWrap");
    const landed = c && (c.classList.contains("heads") || c.classList.contains("tails"));
    const armedAgain = c && c.classList.contains("active");
    if (landed){
      clearInterval(iv);
      // playtest 10 item 6: the landed face hits like a gavel — shudder + golden flare
      c.classList.add("pp4Land");
      setTimeout(() => c.classList.remove("pp4Land"), 700);
      setTimeout(() => { if (!$("flipCoinWrap")?.classList.contains("active")) cerTeardown(); }, CER_REVEAL_MS);
    }
    else if (armedAgain){ clearInterval(iv); }        // a new flip re-armed: veil stays, caption returns
    else if (performance.now() - t0 > CER_FALLBACK_MS){ clearInterval(iv); cerTeardown(); }
  }, 120);
}
function flipArmed(el, onClick){
  if (!S.active) return false;                       // pre-game: normal flippenator
  if (appState.replaying) return false;              // a replay raises no ceremony — see stageFlash
  if (!onClick){
    // disarmed: the tap landed and the spin is starting — hold the stage and watch for the face
    const veil = $("pp4Veil");
    if (veil){ veil.classList.add("resolving"); cerWatchResult(); }
    return true;
  }
  let veil = $("pp4Veil");
  if (!veil){
    veil = document.createElement("div"); veil.id = "pp4Veil";
    // playtest 15 item 5: no "CALL IN THE AIR…" header — the coin and the stakes say it all
    veil.innerHTML = `<div id="pp4CerSlot"></div>
      <div class="pp4CerSub">Tap the coin, captain — let fate decide.</div>`;
    document.body.appendChild(veil);
    veil.addEventListener("pointerdown", ev => {
      const coin = $("flipCoinWrap");
      if (coin && coin.onclick){ ev.stopPropagation(); coin.onclick(); }
    });
  }
  veil.classList.remove("resolving");
  // …and before the first paint, not on the next tick: the slow gear is 125ms away, which is long
  // enough for the ceremony to be seen once in the wrong place (Group G fault 1).
  cerBandTick();
  const fp = $("flipPanel"), slot = $("pp4CerSlot");
  if (fp && slot && fp.parentElement !== slot) slot.appendChild(fp);
  document.body.classList.add("pp4Cer");
  // playtest 10 item 5: the old prompt card is hidden under the veil (CSS body.pp4Cer) — its
  // words move up here: the ask above the coin, the stakes line beneath it. Copied on the next
  // frame, AFTER localAsk's panel() has rendered (the arm hook fires first), and with the
  // typewriter's reveal spans un-hidden so the copy is whole from its first paint.
  requestAnimationFrame(() => {
    const v2 = $("pp4Veil"); if (!v2) return;
    // localAsk stashes the flip prompt's own words on the bridge — a PURE flip never renders a
    // panel to read, and the panel can still hold the PREVIOUS prompt's text at arm time
    const fm = window.__pp4 && window.__pp4.flipMsg;
    let t = v2.querySelector(".pp4CerTitle");
    if (!t){ t = document.createElement("div"); t.className = "pp4CerTitle"; v2.insertBefore(t, $("pp4CerSlot")); }
    t.innerHTML = fm ? emojify(String(fm.m)) : "";
    let st = v2.querySelector(".pp4CerStakes");
    if (!st){ st = document.createElement("div"); st.className = "pp4CerStakes"; v2.insertBefore(st, v2.querySelector(".pp4CerSub")); }
    st.innerHTML = fm ? emojify(String(fm.s)) : "";
    // playtest 20: a BATTLE flip borrows no words — the fight is drawn by renderBattle, not by
    // localAsk — so the ceremony used to take the whole screen saying nothing about the one rule
    // that settles a quarter of all fights. Read straight off the battle card's own wind badge
    // rather than re-deriving the geometry, so the card and the ceremony can never disagree about
    // who holds the wind. Built with DOM nodes, not innerHTML: the captain's name is player-typed.
    const btl = document.querySelector("#actionPanel .btl");
    if (!fm && btl){
      const dwTag = btl.querySelector(".windTag.dw");
      const who = dwTag && dwTag.parentElement ? dwTag.parentElement.querySelector(".who") : null;
      t.textContent = "⚔️ Broadside!";
      st.textContent = "";
      if (who){
        const b = document.createElement("b");
        b.textContent = who.textContent.trim();
        b.style.color = who.style.color || "";      // the captain's own boat colour, as everywhere else
        st.appendChild(b);
        // @copy misc.ceremony.windstakes — APPROVED as written, Wyatt 2026-08-14
        st.appendChild(document.createTextNode(" is firin' downwind — two heads and the tie is theirs."));
      } else {
        st.textContent = "Crosswind — two heads and the cannonballs collide.";
      }
    }
  });
  return true;
}

/* ================= recipe compare (two-tap focus + island glow) ================= */
let focusBtn = null;
function recipeGuard(){
  document.addEventListener("click", e => {
    if (!S.active) return;
    const btn = e.target.closest("#actionPanel .apBtn");
    /* #13 (Wyatt, 2026-08-24): "tapping the board does not clear the selected state, so it should
       not force two taps." This line used to reset focusBtn on ANY outside tap — the hold-the-sea
       peek included — while the card's visible selection (pp4Focus, the Bake this! door, the dock
       glow) all stayed. Pixels and state disagreed, and the next tap re-selected instead of
       confirming. The internal state now follows the visible one: an outside tap changes nothing. */
    if (!btn || !btn.querySelector(".recipeList")) return;
    if (focusBtn === btn) { clearGlow(); clearBake(); focusBtn = null; return; }  // second tap: let it through
    e.stopPropagation(); e.preventDefault();                          // first tap: focus + glow
    focusBtn = btn;
    document.querySelectorAll("#actionPanel .apBtn").forEach(x => x.classList.toggle("pp4Focus", x === btn));
    clearGlow();
    // playtest 19 item 2 (Wyatt: "the recipe choosing ux is confusing. we need a 'bake this' button
    // to appear over the recipe after the first tap; maybe over the image?" — his pick: over the
    // image). Nothing on screen used to say how to COMMIT: the first tap lit the docks and outlined
    // the card, and the confirming second tap was undiscoverable.
    // It is a SPAN, not a button, for two reasons that are really one: the recipe card is itself the
    // <button>, so a nested button is invalid HTML and Chrome hoists it clean out of the card — and
    // being inert (pointer-events:none) means a tap on it lands on the card underneath, which IS the
    // second tap that already confirms. So the visible door and the old gesture are the same code
    // path, and both keep working (Wyatt's pick: "yes — both work").
    clearBake();
    const thumb = btn.querySelector(".recipeThumb");
    if (thumb){
      const bake = document.createElement("span");
      bake.className = "pp4Bake";
      // @copy misc.stage.bakethis — APPROVED as written, Wyatt 2026-08-14. In-world register (the voice boundary:
      // this is the game speaking to a captain, not the credits).
      bake.textContent = "Bake this!";
      btn.appendChild(bake);
    }
    const g = appState.game; if (!g) return;
    const names = [...btn.querySelectorAll(".rn")].map(x => x.textContent.trim());
    const cp = cellPx(), svg = svgEl();
    // resolve display-name -> ingredient id through the shared table
    import("../shared/index.js").then(sh => {
      /* THE RINGS OUTLIVED THE CARD THAT ASKED FOR THEM. Found 2026-08-20 while screenshotting a
         crew game: orange dock rings still on the water two days into the voyage.
         The commit path is synchronous — second tap calls clearGlow() and lets the click through —
         but the rings are appended from THIS promise. Commit before it settles and clearGlow has
         already run on an empty board, so the rings land afterwards with nothing left to remove
         them. Nobody can hit it on a warm module cache, which is why it has never been seen by
         hand; a cold first tap of the session is a different story.
         focusBtn is nulled by the committing tap, so "is this card still the focused one?" is the
         exact question, and it costs one comparison. */
      if (focusBtn !== btn) return;
      const ids = names.map(n => Object.entries(sh.ING_NAME || {}).find(([k, v]) => v === n)?.[0]).filter(Boolean);
      ids.forEach(ing => {
        const c = (g.dockOf && g.dockOf[ing]) || (g.islandOf && g.islandOf[ing]); if (!c) return;
        const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        el.setAttribute("cx", (c[0] + 0.5) * cp); el.setAttribute("cy", (c[1] + 0.5) * cp);
        // playtest 12 (2.4): a tight ring on the dock square itself, not a splash over the island
        el.setAttribute("r", cp * 0.55); el.setAttribute("fill", "#f5a623"); el.setAttribute("fill-opacity", "0.18");
        el.setAttribute("stroke", "#f5a623"); el.setAttribute("stroke-width", 3);
        el.classList.add("pp4Glow"); svg.appendChild(el);
      });
    }).catch(() => {});
  }, true);
}
function clearGlow(){ document.querySelectorAll(".pp4Glow").forEach(e => e.remove()); }
function clearBake(){ document.querySelectorAll(".pp4Bake").forEach(e => e.remove()); }

/* ========== the trade-wind ride preview (playtest 20, Mando's three lost turns) ========== */
// "I was stuck here for 3 turns trying to get milk. Just couldn't get to the dock from this
// direction since I didn't want to get stuck in the trade winds."
//
// Landing on the rim does not park you there — the current carries you to that arc's clockwise
// end (RULES-V2 line 24), which can be most of the board away. The only way to learn that was to
// spend a turn on it. So a swept square now ANSWERS FIRST: one tap draws where you would actually
// end up, and only a second tap commits.
//
// A DELIBERATE EXCEPTION to the one-tap sail gesture, and Wyatt's own pick (2026-08-13): every
// other legal square still commits on the first tap. The confirmation is bought only where the
// square does something the player cannot see coming.
let sweepBtn = null;
function clearSweep(){ document.querySelectorAll(".sweepPath,.sweepEnd,.sweepGhost").forEach(e => e.remove()); }
function sweepGuard(){
  document.addEventListener("click", e => {
    if (!S.active) return;
    const cell = e.target.closest && e.target.closest(".sailCell");
    // any tap that is NOT on a previewed square clears the preview and forgets it
    if (!cell || !cell.classList.contains("sailSwept")){ if (!cell) { clearSweep(); sweepBtn = null; } return; }
    if (sweepBtn === cell){ clearSweep(); sweepBtn = null; return; }   // second tap: let it through
    e.stopPropagation(); e.preventDefault();                           // first tap: show the ride
    sweepBtn = cell;
    clearSweep();
    /* ZOOM OUT TO SHOW HOW FAR THE BOAT WOULD GO — Wyatt, 2026-08-20, in those words, after
       watching a screen recording of a trade-wind ride at PHONE width.

       The preview's whole job is to answer "where would I end up", and at 390px it usually could
       not: the current carries a ship most of the way round the board, so the destination is off
       camera far more often than not, and what he saw was a dashed line leaving the corner of the
       screen with no end circle and no ghost hull. A preview that runs off the screen answers
       nothing — it is the question restated.

       The SAME call the real ride already makes (__pp4.sweepCam, used by animateRimSweepRun in
       ui/flow.js) rather than a second framing rule of its own: the preview is a promise about what
       the ride will look like, so it must be framed the way the ride is framed, or the promise is
       about a different shot. Consistency is a core value, and this is the cheap kind — one
       existing call, no new numbers.

       Safe against the two-tap gesture, checked rather than assumed: the camera moves by writing
       the SVG's viewBox (tick(), :270), never by redrawing the board, so `cell` is the same element
       on the second tap and `sweepBtn === cell` still commits. */
    S.lock = false; camFull();
    const to = (cell.dataset.sweptTo || "").split(",").map(Number);
    const g = appState.game, svg = svgEl();
    if (!g || !svg || to.length !== 2 || !isFinite(to[0])) return;
    // the tapped square carries its own grid cell (data-gx/gy from sailHighlightRect)
    const fx = +cell.dataset.gx, fy = +cell.dataset.gy;
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
    const cp = cellPx();
    const x1 = (fx + 0.5) * cp, y1 = (fy + 0.5) * cp;
    const x2 = (to[0] + 0.5) * cp, y2 = (to[1] + 0.5) * cp;
    // bow the track AWAY from the board's middle, so it reads as running round the rim rather
    // than cutting straight across the sea the current never crosses
    const mid = 320, bx = (x1 + x2) / 2, by = (y1 + y2) / 2;
    const ox = bx - mid, oy = by - mid, len = Math.hypot(ox, oy) || 1;
    const bow = Math.min(140, Math.hypot(x2 - x1, y2 - y1) * 0.35);
    const cxq = bx + (ox / len) * bow, cyq = by + (oy / len) * bow;
    const mk = (tag, attrs, cls) => {
      const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      n.classList.add(cls); svg.appendChild(n); return n;
    };
    mk("path", { d: `M${x1},${y1} Q${cxq},${cyq} ${x2},${y2}` }, "sweepPath");
    mk("circle", { cx: x2, cy: y2, r: cp * 0.42 }, "sweepEnd");
    // a ghost of YOUR hull waiting at the far end — the clearest possible "this is where you'd be"
    const seat = appState.mySeat ?? 0;
    const gh = document.createElementNS("http://www.w3.org/2000/svg", "image");
    gh.setAttribute("href", `assets/boats/${seat + 1}.png`);
    gh.setAttribute("x", x2 - cp * 0.32); gh.setAttribute("y", y2 - cp * 0.32);
    gh.setAttribute("width", cp * 0.64); gh.setAttribute("height", cp * 0.64);
    gh.classList.add("sweepGhost"); svg.appendChild(gh);
  }, true);
}

/* ================= stage assembly ================= */
function buildStage(){
  const wrap = $("boardwrap"); if (!wrap) return;
  document.body.classList.add("pp4Stage");
  // ribbon
  const rib = document.createElement("div"); rib.id = "pp4Ribbon";
  const order = [0, 1, 2, 3];
  rib.innerHTML = `<span id="pp4Round">DAY 1</span>
    <span class="pp4Boats">${order.map(i => `<img class="pp4Boat" src="assets/boats/${i + 1}.png">`).join("")}</span>
    <button id="pp4FF" type="button" title="Skip to yer next turn">⏩</button>
    <button id="pp4Chat" type="button" title="Scuttlebutt">💬<span id="pp4ChatDot"></span></button>
    <button id="pp4Menu" type="button">☰</button>`;
  document.body.appendChild(rib);
  // FAST-FORWARD (Wyatt's spec, 2026-08-12): ONE tap arms ONE skip — everything paces instantly
  // until the next prompt that involves him (his sail, a flip, a battle call, an offered trade),
  // which ends the skip at normal speed and never re-arms it (flow.js ffEndNow is the other half:
  // it also builds the one-clause-per-bot recap of what he didn't witness). Solo only by design
  // (D-04) — never Pass & Play, never a crew game — and the flag drives pure UI pacing, never the
  // engine.
  //
  // T-02-10 (02-03): hiding the chip is not proof the flag can't be set — appState.ff also
  // shortens sleep() in orchestrator.js/flow.js, and on the HOST those calls pace the entire
  // runLiveNet loop, so an armable-but-invisible flag would still rush every guest's narration
  // even with #pp4FF's own display stuck at "none". The arm refuses here, in the handler body,
  // using the same networked test the visibility tick above uses — a guard rather than a
  // conditionally-attached handler, so it holds even if this device's mode were ever to change
  // after buildStage() already ran (never happens today — a room's networked-ness is fixed for a
  // voyage's whole lifetime — but the guard doesn't have to trust that staying true).
  $("pp4FF").onclick = () => {
    if (appState.ff) return;
    if (appState.db && appState.room) return; // D-04: no arming the skip in a crew game, chip visible or not
    appState.ff = true;
    appState.ffFromEv = appState.game ? appState.game.events.length : 0;
    if (S.hurry) S.hurry();          // the live bubble goes NOW — the skip starts this instant
    wake();
  };
  // D-06: chat's slide-up sheet re-parents the classic #chatPanel wholesale — the same
  // build-a-container-then-move-the-existing-node pattern this function already uses below for
  // #controlsRow/#captainsPanel/#actionPanel. That's what leaves #chatLog/#chatForm/#chatInput's
  // ids, and the orchestrator's own wiring to them (sendChat/watchChat/the #chatForm submit
  // handler, orchestrator.js:1711), completely untouched — no second chat log, no edit there.
  const chatSheet = document.createElement("div"); chatSheet.id = "pp4ChatSheet";
  document.body.appendChild(chatSheet);
  const chatPanelEl = $("chatPanel"); if (chatPanelEl) chatSheet.appendChild(chatPanelEl);
  // Opening clears the unread mark and focuses the input; closing does nothing further — nothing
  // about chat persists, and the log is already wiped by startGame()'s own reset
  // (orchestrator.js:1551). The dot is toggled directly here (not through panel.js's own setter,
  // which this plan's second task adds) so this task's own commit stays self-contained.
  $("pp4Chat").onclick = () => {
    const opening = !document.body.classList.contains("pp4Chat");
    document.body.classList.toggle("pp4Chat");
    if (opening){
      const dot = $("pp4ChatDot"); if (dot) dot.classList.remove("on");
      const inp = $("chatInput"); if (inp) inp.focus();
    }
  };
  // wind pill
  const pill = document.createElement("div"); pill.id = "pp4Pill";
  document.body.appendChild(pill);
  // playtest 4: no sheet. The captains box is ALWAYS on screen, pinned under the board and
  // rising to meet it when the zoomed-out board leaves blank water. Prompts float at the ship.
  const capBox = document.createElement("div"); capBox.id = "pp4Cap";
  document.body.appendChild(capBox);
  /* THE DESKTOP COLUMN (D-50). Empty and display:none until computeStageGeometry() decides the
     window is wide enough, at which point mountColumn() MOVES the captains card and the menu into
     it. Built here rather than lazily so there is exactly one of it for the life of the stage. */
  const col = document.createElement("div"); col.id = "pp4Col";
  document.body.appendChild(col);
  const cr = $("controlsRow"), ap = $("actionPanel");
  if (cr) capBox.appendChild(cr);              // parked hidden — the ceremony borrows the coin from here
  const cap = $("captainsPanel"); if (cap) capBox.appendChild(cap);
  // playtest 11: rows are one line (recipe hidden) — tapping a row reveals that captain's recipe
  // line again. Rows are stable elements, so the open state survives re-renders.
  capBox.addEventListener("click", e => {
    const row = e.target.closest(".player-row");
    if (row && !e.target.closest("a,button")) row.classList.toggle("pp4Open");
  });
  const prompt = document.createElement("div"); prompt.id = "pp4Prompt";
  document.body.appendChild(prompt);
  if (ap) prompt.appendChild(ap);
  /* T-17 — his checklist #24 (Wyatt, 2026-08-26): "tapping the card, or the space around it, should instant-appear all
     of the text. this is a nice affordance for players who are familiar with the game and follows
     the same logic where they get to progress bot turns by tapping."

     Delegated from the box, so it covers the card AND the space around it in one listener, and so a
     card rebuilt for the next prompt inherits it without rewiring.

     A TAP ON A CONTROL IS NOT A TAP TO HURRY. If the target is a button, a link, a crate, a recipe
     card or anything else that answers, this stands aside completely — otherwise the first
     impatient tap on "Pass" would be spent skipping text instead of passing, which is a worse game
     than the one he is complaining about. Everything else is fair game: the message, the padding,
     the sea showing through the box.

     `capture:true` so the decision is made before the panel's own handlers run, and no
     preventDefault anywhere — this never consumes an event, it only ever hurries alongside one. */
  prompt.addEventListener("pointerdown", ev => {
    if (ev.target.closest(".apBtn,.btlBtn,button,a,input,select,textarea,.recipeCard,.bkoBowl,#flipCoinWrap")) return;
    const msg = prompt.querySelector(".apMsg:not(.fadeOut)");
    if (msg && typeof msg._revealNow === "function") msg._revealNow();
  }, { capture: true });
  /* The ribbon clock chip's toggle wiring stood here (D-51 kept it the ONE control after the menu
     row left, Wyatt 2026-08-21). Removed 2026-08-28 with the shot clock. */
  const foot = $("footerRow");
  /* ONE LIST, and this class is what says so (D-50, rule 23). The card look, the full-width rows
     and the sound row all hang off it in index.html, so they follow the list into whichever mount
     it is standing in. There is no second builder and there must never be one. */
  if (foot) foot.classList.add("pp4MenuList");
  // playtest 10 item 2: the sound toggle was orphaned at the top-left of the stage (the horn
  // peeking under the ribbon in Wyatt's screenshots) — it lives in the ☰ menu now
  const ms = $("muteSlot");
  if (ms && foot){
    // FIRST in the list, which is where it has always rendered — it used to be inserted before
    // the turn-clock row and that row has gone (D-51), so it anchors to the list's own head now.
    foot.insertBefore(ms, foot.firstChild); ms.style.cssText = "display:flex;justify-content:center;";
    /* AND BRING THE BUTTON WITH IT. Wyatt, 2026-08-20: "the host has no mute button (guest does)."
       Moving the SLOT into the menu is not enough, because placeMuteButton() (ui/board.js) may
       already have moved the BUTTON out of it and into #controlsRow — which enterStage parks inside
       #pp4Cap and index.html hides outright. Whether it had is a matter of which measurement ran
       last, so one client kept its mute button and the other lost it, and it looked like a
       host/guest parity bug when it was a race.
       board.js now refuses to send the button to #controlsRow while the stage is up; this line is
       the other half — it retrieves one that was already sent there, at the exact moment the two
       homes change hands. Together they make the answer the same on every client, every time. */
    const mb = $("btnMute");
    if (mb && mb.parentNode !== ms) ms.appendChild(mb);
  }
  if (foot){
    const stamp = document.createElement("div");
    stamp.id = "pp4Stamp";
    /* A-4 (Wyatt, 2026-08-28): the commit code goes ON ITS OWN LINE. The deploy script appends
       -staging@<sha> to the stamp; splitting at the @ keeps the human-readable build number on
       one line and the exact-commit identity on the next, instead of one long string. A build
       with no @ (local, production) renders a single line, unchanged. textContent per line —
       never innerHTML — so the stamp can never carry markup. */
    const at = PP4_STAMP.indexOf("@");
    if (at >= 0) {
      stamp.append("Build " + PP4_STAMP.slice(0, at), document.createElement("br"), "@" + PP4_STAMP.slice(at + 1));
    } else {
      stamp.textContent = "Build " + PP4_STAMP;
    }
    stamp.style.cssText = "opacity:.55;font-size:11px;text-align:center;padding:6px 0 2px;letter-spacing:.04em;line-height:1.5";
    foot.appendChild(stamp);
  }
  $("pp4Menu").onclick = () => { document.body.classList.toggle("pp4Foot"); };
  // playtest 12 item 6: tapping anywhere outside the open menu closes it. D-06 extends this SAME
  // capture-phase listener for the chat sheet rather than adding a second one — a second condition
  // block, not a folded selector, since the ☰ menu and the chat sheet close against different
  // "outside" targets and toggle different body classes.
  document.addEventListener("pointerdown", e => {
    if (document.body.classList.contains("pp4Foot") && !e.target.closest("#footerRow,#pp4Menu"))
      document.body.classList.remove("pp4Foot");
    if (document.body.classList.contains("pp4Chat") && !e.target.closest("#pp4ChatSheet,#pp4Chat"))
      document.body.classList.remove("pp4Chat");
  }, true);
  const svg = svgEl();
  if (svg) svg.setAttribute("preserveAspectRatio", "xMidYMin meet");   // full-board hugs the ribbon
  const shipsSvg = $("boardShips");
  if (shipsSvg) shipsSvg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  gestures(wrap);
  wireEovDrag();   // item 8 (D-14): the end-of-voyage card's pull-to-park gesture
  camFull();
  S.active = true;
  computeStageGeometry();   // D-31: size the stage before the first paint, not after
  if (!S.geomBound){
    S.geomBound = true;
    let t = 0;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(computeStageGeometry, 120);   // debounced — a drag-resize fires dozens of times
    });
  }
}

/* ================= D-31: the desktop stage's own size ================= */
/* Derives body's own capped box (`--pp4W`) and, in side-by-side mode, the captains column's own
   width (`--pp4CapColW`) from the window's real geometry and the captains panel's OWN rendered
   content — never a breakpoint table (CLAUDE.md, "nothing is a constant"). Everything downstream
   of body's own rect — `stageCappedRect()`/`vwPx()`/`vhPx()`/`fixedOrigin()`/`fixedRect()`/
   `toScreen()` (util.js, this file) — is completely unchanged by this: it already reads body's
   own rendered box, so handing that box a computed width instead of a literal 430px is invisible
   to every board-anchored overlay (rule 23, ONE DISPLAY PATH — nothing about WHAT is drawn moved,
   only how wide the "screen" it is drawn against is).
   PHONE (<=600px) IS UNTOUCHED: this function returns having cleared every custom property/class
   it might have left behind (a window resized DOWN through the breakpoint mid-game must not carry
   a leftover --pp4W into the phone's own `@media(min-width:601px)`-gated CSS, which never applies
   there regardless — this clears the properties for exactly the same reason a stale inline style
   would otherwise sit there unused but discoverable, which is the kind of thing a future debugging
   session should never have to explain away). */
function measureCapNaturalHeight(widthPx){
  // D-31 BUG, FOUND BY THE VERIFICATION GATE ITSELF (not a code read): stacked mode at 960x1080
  // pinned the board to the 240px FLOOR — every derived width, unrelated to the window — and the
  // radial fan's "cornered beyond hope" fallback (this file, promptTick) then stacked three trade
  // buttons on top of each other, unclickable, exactly the RED ALERT failure mode
  // (`.planning/debug/resolved/desktop-radial-fan-offset.md`) this file was already once fixed for.
  // Measured root cause (probe: sampled `cap.scrollHeight` at widths 240..900px — EVERY width
  // reported the identical 993px, which is what "the box stretched to fill, not to its content"
  // looks like as a number): this function's inline override sets `top:0` and `height:auto` but,
  // like measureCapNaturalWidth above, never touches `bottom` — which #pp4Cap's OWN base rule
  // (index.html) sets to `0`. For a `position:fixed` box, `height:auto` sandwiched between two
  // EXPLICIT insets (`top:0` here, `bottom:0` inherited) does not ask the content how tall it is —
  // per the CSS spec it stretches to fill the gap between them. So `scrollHeight` read back
  // (near-)the full viewport height every single time, regardless of `widthPx` — which is exactly
  // why `boardSideStacked = ih - capH` collapsed to the `Math.max(240, …)` floor: `ih - capH` was
  // reliably negative. `bottom:auto` frees `height:auto` to do what its name says — size to content.
  const cap = $("pp4Cap"); if (!cap) return 0;
  const save = cap.getAttribute("style") || "";
  cap.style.cssText = `position:fixed;visibility:hidden;left:-9999px;top:0;right:auto;bottom:auto;width:${widthPx}px;` +
    "height:auto;max-height:none;";
  void cap.getBoundingClientRect();
  const h = Math.ceil(cap.scrollHeight);
  cap.setAttribute("style", save);
  return h;
}
function computeStageGeometry(){
  if (typeof document === "undefined") return;
  const body = document.body;
  if (!body.classList.contains("pp4Stage")) return;
  S.geomAt = Date.now();
  const iw = document.documentElement.clientWidth || window.innerWidth;
  const ih = document.documentElement.clientHeight || window.innerHeight;
  const cap = $("pp4Cap");
  if (iw <= 600){
    // PHONE: the `@media(min-width:601px)` rule this feeds never matches here regardless, but
    // clear the properties anyway (see the function-header note) — D-18's byte-identical promise.
    body.classList.remove("pp4Side");
    mountColumn(false);
    body.style.removeProperty("--pp4W"); body.style.removeProperty("--pp4CapColW"); body.style.removeProperty("--pp4Top"); body.style.removeProperty("--pp4Left");
    if (cap) cap.style.removeProperty("max-height");
    /* D-46 fault 3 — HOW MUCH ROOM THE CAPTAINS NEED IS A MEASUREMENT, NOT A PERCENTAGE.
       camFrame() reserves the band under the board for this card and reserved 30% of the window
       for it. At the honest phone height (390x664, D-42) 30% is 199px and four captain rows are
       231px, so the fourth row — "Flaky Jack" — was sliced by the bottom edge of the screen and
       25px of the card lived behind its own scrollbar. Measured, not inferred: cap.scrollHeight
       minus cap.clientHeight came back 25 on the recipe screen.
       A percentage cannot be right for a table that has two, three or four captains and a hold
       that grows all voyage (rule 9). measureCapNaturalHeight() already computes the honest answer
       for the desktop branches; caching it here on the geometry clock — which is the same ~900ms
       beat the card's own width already rides — lets camFrame read it without a reflow per frame.
       The 250px ceiling is unchanged: it is what stops a big roster crushing the board. */
    S.capNeed = measureCapNaturalHeight(iw);
    refreshNameMarquees();   // the column just widened back to full — drop any stale scroll
    return;
  }
  // The board's own full-height square side — the height UNDER the ribbon/wind-pill band. camFrame()
  // has always started the board strip BELOW the band (playtest 4/17), so a square of the full
  // viewport height was too tall for the strip and the camera cropped it. topBandPx() is the same
  // measurement camFrame uses, so the derived square and the painted strip agree by construction.
  const topBand = topBandPx();
  const boardSideFull = Math.max(240, ih - topBand);
  const capGap = parseFloat(getComputedStyle(body).getPropertyValue("--pp4CapGap")) || 0;
  // ENTER side-by-side on the MINIMUM (so widening the column never costs a screen the layout it
  // already qualified for), then GROW the column into whatever is actually spare.
  if (iw >= boardSideFull + capGap + SIDE_CAP_MIN){
    const spare = iw - boardSideFull - capGap - 28;      // 28 = breathing room at the window's edge
    const capColW = Math.round(Math.max(SIDE_CAP_MIN, Math.min(SIDE_CAP_IDEAL, spare)));
    // SIDE-BY-SIDE (Wyatt's "full desktop"): the board takes the whole height under the band; the
    // captains column sits beside it, level with the board's top, at a fixed comfortable width and
    // hugging its own content height (index.html).
    body.classList.add("pp4Side");
    mountColumn(true);
    body.style.setProperty("--pp4W", boardSideFull + "px");
    body.style.setProperty("--pp4Top", topBand + "px");
    body.style.setProperty("--pp4CapColW", capColW + "px");
    // centre the PAIR, not the board: body's own `margin:0 auto` centres the board and then hangs
    // the column off its right edge — at 1400×900 the column ran 141px past the window. The left
    // margin centres board+gap+column as one unit.
    body.style.setProperty("--pp4Left", Math.max(0, Math.round((iw - boardSideFull - capGap - capColW) / 2)) + "px");
    if (cap){ cap.style.removeProperty("max-height"); cap.style.removeProperty("top"); }
    // D-31 fix: buildPlayerRows()'s own marquee check ran (if at all) against whatever column
    // width was live BEFORE this geometry pass — usually wider, sometimes the 430px fallback —
    // so a name that fits THAT column but not this narrower derived one was never marked to
    // scroll, and sat statically clipped with no cue anything was hidden. Re-check now that the
    // column's real width is on the page.
    refreshNameMarquees();
    return;
  }
  // STACKED (Wyatt's "half desktop"): same overlay architecture as phone (board full-bleed behind
  // the ribbon, captains card floats over the void the letterboxed square leaves below it) — the
  // ONLY lever available is how wide (== how tall, since the board is square) that letterboxed
  // square is allowed to be. Shrinking it WIDENS the void, which is where the derivation happens:
  // measure the captains card's natural height at a first-pass candidate width, then narrow the
  // board by exactly that much so the void is never smaller than the card actually needs.
  // `max-height` + `overflow-y:auto` (already on #pp4Cap) is kept as a backstop regardless — a
  // single measurement pass is an estimate, not a fixed-point solve, and the backstop is what turns
  // any remaining error into an internal scrollbar instead of a clipped top row.
  body.classList.remove("pp4Side");
  mountColumn(false);
  body.style.removeProperty("--pp4CapColW"); body.style.removeProperty("--pp4Top"); body.style.removeProperty("--pp4Left");
  const candidate = Math.max(240, Math.min(boardSideFull, iw));
  /* THE VOID HAS TO HOLD THE CARD *AND* THE AIR UNDER IT (D-52). On desktop the stacked card is
     inset by --pp4CapGap on three sides (index.html), so it is measured at the width it will
     actually have — a card measured 28px wider than it renders is a card that wraps a row nobody
     reserved space for — and the board is narrowed by the gap as well, so the air beneath the card
     can never be squeezed to nothing. The phone is byte-identical: it has no inset, and its own
     media query is the one that decides that, so `gapBelow` reads the same boundary the CSS does
     rather than a second copy of it. */
  const insetCard = pillRidesRibbon();                 // the same @media (min-width:601px) boundary
  const capInset = insetCard ? capGap : 0;
  const capH = measureCapNaturalHeight(Math.max(240, candidate - capInset * 2));
  S.capNeed = capH;   // camFrame's band reservation reads the same measurement (D-46 fault 3)
  const boardSideStacked = Math.max(240, Math.min(candidate, ih - capH - capInset));
  body.style.setProperty("--pp4W", boardSideStacked + "px");
  if (cap) cap.style.setProperty("max-height", Math.max(capH, ih - boardSideStacked - capInset) + "px");
  refreshNameMarquees();   // same reason as the side-by-side branch above — the board (and with
                           // it the name column, which spans the same derived width) just resized
}

// a menu is 1-5 apBtn choices with SHORT labels and no rich content — the N4 radial case.
// Playtest 10 (Wyatt: "ALL of the action prompts should be [radial]"): single-button prompts
// qualify too, and a button whose ask() option carries a `short` label qualifies regardless of
// its full label's length — the circle shows the short form, the pill carries the sentence.
function menuButtons(ap){
  /* `input` disqualifies a prompt from the radial bloom because a text field cannot live in a ring
     of circles. The quantity SLIDER (playtest 21 item 7) is an <input type=range> and was therefore
     knocking its own prompt out of radial mode entirely — measured, not guessed: with the slider
     present #pp4Prompt carried NO classes at all, so every radial rule for the pill, the arc and
     the slider bar silently stopped applying and the whole prompt fell back to a flat card.
     It is exempted by class rather than by type: any OTHER input still disqualifies, which is the
     behaviour this guard exists for. */
  if (ap.querySelector(".btlBtn,.bkoRow,.recipeList,input:not(.apSlider),select")) return null;
  const btns = [...ap.querySelectorAll(".apBtn")];
  // playtest 15: up to EIGHT circles — the trade's what-do-ye-WANT step (7 crates) fans too;
  // the open-side fan wraps to a second arc row past four, so big menus stay one tight group
  if (btns.length < 1 || btns.length > 8) return null;
  if (!btns.every(b => b._shortHtml != null || b.textContent.trim().length <= 16)) return null;
  return btns;
}
// enterCenterStage() — flip the prompt box to centre-stage mode NOW, synchronously. promptTick
// calls it on its own beat; the bake-off (via __pp4.stageCenterNow) calls it BEFORE building its
// panel, because panel() measures its height at build time and a measurement taken under the
// PREVIOUS prompt's radial CSS reads ~zero — radial makes every child position:fixed — which
// pinned the intro's box to a clipped nothing for the whole typewriter (playtest 16: a dimmed sea
// with no card on it). Idempotent, exactly as the promptTick branch it was extracted from.
function enterCenterStage(){
  const box = $("pp4Prompt"), ap = $("actionPanel");
  if (!box || !ap) return;
  /* A CARD TAKING THE STAGE ENDS THE WAIT IT WAS WAITING FOR. Wyatt, 2026-08-20, twice in a row:
     "the 'Recipe Chosen! Waiting for the rest of the crew' narration box behind the stage shouldn't
     persist behind the 'The crew draws lots' box", and "when both host and guest are on recipe
     choice, the 'waiting for yer mateys' card only appears to host. this is a parity problem."

     Both are one fault and it is MINE, from Stage 1. Wait lines were given NO dismissal deadline
     (item 19 — "it should disappear when their teammates have played"), on the understanding that
     stageFlash's S.hurry() retires them the instant the next line lands. That holds for narration.
     It does not hold for a CENTRE-STAGE CARD, which is not a narration line and never calls
     stageFlash — so a wait bubble sat behind the ceremony card with nothing on any timer to remove
     it. It reads as a parity bug because whoever clicked through FIRST is the one holding a wait
     line when the card arrives; the other captain never had one to strand.

     Here rather than at the call sites, for the same reason the sound dedup went into
     playForEvent: this is the one function every stage card passes through — the ceremony barriers,
     the recipe draft and the bake-off (via __pp4.stageCenterNow) — so one line makes it true for
     all of them, on both tiers, and stays true for the next card someone adds. */
  if (S.hurry) S.hurry();
  /* D-20 (item 11): promptTick()'s own `want` gate (below) never runs for a centre-stage prompt —
     the `ap.dataset.pp4Stage || ap.querySelector(".bko")` branch calls straight into this function
     and returns before reaching it, so a ceremony card (the ahoy barrier, "the crew draws lots",
     the bake-off intro) was popping its dimmed box up here, unconditionally, on every tick this
     runs — the exact "popup before the camera/ships settle" complaint, just via a second display
     assignment promptTick's own fix never touched. Same flag, same reasoning: `pendingReveal` is
     the one thing that already tracks "is this prompt's reveal (typewriter AND stageSettled())
     done yet", so re-checking it here rather than adding a second clock keeps the two gates unable
     to disagree. Evaluated fresh on every call (not just the pp4Center class transition below),
     because promptTick() calls this function on every tick a stage-flagged prompt is up. */
  /* pendingStage, NOT pendingReveal (Wyatt's blank-space lag, 2026-08-23 tier 1): this gate is
     D-20's "no popup until the camera and ships have stopped" — which is exactly what pendingStage
     tracks. Reading pendingReveal here made the ceremony card also wait for its own typewriter,
     typed invisibly behind display:none: "the crew draws lots" arrived after seconds of dead air,
     which is the LONG blank he reported by name. The buttons inside still wait for the full reveal
     through the unchanged pendingReveal CSS. */
  box.style.display = ap.classList.contains("pendingStage") ? "none" : "flex";
  // centre within the water, not the viewport: the captains box owns the bottom of the screen,
  // and a stage column tall enough to reach it (the bake-off intro was first) had its button
  // clipped mid-letter at the panel's top edge. Padding, not a shorter box — the dim paints
  // through padding, so the captains stay under the veil while the content centres above them.
  /* CENTRED ON THE STAGE, LIFTED ONLY AS FAR AS IT HAS TO BE — playtest 22 item 10 (Wyatt): "the
     bakeoff box stage should be vertically centered on the stage; it is too high here."
     The padding above was the captains box's FULL height, unconditionally. On a four-captain table
     that is ~250px, so a short card was centred in the top two-thirds of the screen and read as
     floating. The reason it existed is real and kept: a column tall enough to reach the captains
     box had its button hidden behind it.
     So compute the lift instead of assuming it. Centred, the column's bottom sits at
     (vh + need) / 2; it only needs lifting by however far THAT dips below the captains box, and
     with align-items:center a lift of N costs 2N of bottom padding. A card that already clears the
     captains box gets no padding at all and is centred on the stage, which is the ask. */
  const cap = $("pp4Cap");
  // D-31 REOPENED (2026-08-21, Wyatt: "the ARRGH button is the only thing visible!"): this lift
  // clears the captains box, which on phone/stacked sits BELOW the board — so capH is the height it
  // eats off the bottom. In SIDE-BY-SIDE the captains box is BESIDE the board, not under it, and
  // reading its `top` (~45px) made capH ≈ the whole viewport height, shoving the ceremony button up
  // to the ribbon and clipping it. Beside the board there is nothing below the centre to clear, so
  // capH is 0 and the ceremony centres on the board exactly as intended.
  const capH = (cap && !isSideBySide()) ? Math.max(0, Math.round(vhPx() - cap.getBoundingClientRect().top)) : 0;
  const need = ap.offsetHeight || 0;
  const dip = Math.max(0, Math.round((vhPx() + need) / 2 - (vhPx() - capH)));
  /* ITEM 9 (Wyatt, 2026-08-23c, the black-market card): "it was not centered vertically and the
     top of it was nested behind the header row." The lift above clears the captains box but
     nothing guarded the TOP — a tall card (the black-market ceremony is the longest in the game)
     was hoisted until its title ran under the ribbon. The lift is now also capped by the room the
     top band leaves: with align-items:center and a bottom pad of P, the card's top sits at
     (vh − P)/2 − need/2, so keeping it below the band means P ≤ vh − 2·band.top − need. When even
     P=0 cannot fit the card, the card overlaps the CAPTAINS box instead of the header — the
     captains are passive; the title is not. */
  const topRoom = Math.max(0, Math.round(vhPx() - 2 * boardBand().top - need));
  const pad = dip > 0 ? Math.min(capH, dip * 2, topRoom) + "px" : "";
  if (box.style.paddingBottom !== pad) box.style.paddingBottom = pad;
  // same teardown as the empty-tick branch: a hint or maxHeight surviving from the recipe
  // sheet must never share the centre stage (see the strip bug above)
  const h1 = box.querySelector(".pp4PeekHint"); if (h1) h1.remove();
  if (ap.style.maxHeight) ap.style.maxHeight = "";
  box.classList.remove("pp4Recipes");
  if (!box.classList.contains("pp4Center")){
    box.classList.add("pp4Center"); box.classList.remove("radial", "centered");
    S.radKey = null;
    box.style.left = ""; box.style.top = ""; box.style.width = "";
    [...ap.querySelectorAll(".apBtn")].forEach(b => { b.style.position = ""; b.style.left = ""; b.style.top = ""; });
    const m = ap.querySelector(".apMsg"); if (m){ m.style.position = ""; m.style.left = ""; m.style.top = ""; }
  }
}
/* THE PEEK HINT IS PLACED LAST IN THE TICK — seam (a) of the two named in 260821-qwv.
   It is the one floater that always yields (see peekHintTick), which only works if it can see
   where everything else has actually ended up. Called from tick() AFTER promptTick, rather than
   from inside the radial branch where it used to sit, so it can never again be dodging last
   frame's layout. One call site, so nothing has to remember: the radial prompt is the only style
   that teaches the gesture (D-39), and every other style has already removed the hint by the time
   this runs. */
/* ONE MOMENT SAYS ITS WORDS ONCE (D-46 fault 1, and it is rule 23's own signature).
   The dock flip put the SAME sentence on screen twice — "Docking at Glitter Bay – dig for
   treasure!" as the ceremony's big cream title, and again as a narration bubble half-hidden behind
   the coin (solo-phone-017/018). Two paths, one moment: ask() broadcasts the ask as a narration
   line for the deciding seat, and localAsk stashes the same words for the flip ceremony's title.
   The de-dupe for this already existed — it lived inside the radial branch and compared the live
   bubble against `.apMsg` — but A PURE FLIP RENDERS NO PANEL AT ALL, so there was no `.apMsg` to
   compare against and the check could not fire. That is the seam, and it is the second time a
   prompt style has fallen out of a rule written for one of them.
   So the question is asked properly and in one place: is the live bubble already being said by
   whatever is ASKING right now? The ask pill and the ceremony title are the two things that ever
   are, and this runs every tick from tick(), for every prompt style there is or ever will be,
   rather than from inside the one branch that happens to have a panel.
   An empty bubble is not a duplicate of an empty title — the typewriter blanks both for their
   first frames, and `"" === ""` once retired a perfectly good narration line. */
function retireEchoBubble(){
  if (!S.hurry) return;
  const bub = document.querySelector(".pp4Bub");
  if (!bub) return;
  const bubT = plain(bub.textContent);
  if (!bubT) return;
  const asking = [$("actionPanel") && $("actionPanel").querySelector(".apMsg"),
                  document.querySelector("#pp4Veil .pp4CerTitle")];
  for (const a of asking){
    if (a && plain(a.textContent) === bubT){ S.hurry(); return; }
  }
}
function peekHintLast(){
  const box = $("pp4Prompt");
  if (!box || !box.classList.contains("radial")) return;
  peekHintTick(box);
}
function promptTick(){
  const box = $("pp4Prompt"), ap = $("actionPanel");
  if (!box || !ap) return;
  // AT PORT: this loop keeps running (it is the shared stage rAF, not per-game), and it owns
  // box.style.display. Without this it re-shows the prompt one frame after hideStageLayer() hides
  // it — T-12's second half. Returning early leaves the hidden display exactly as set.
  if (stageDown) return;
  // textContent, not innerText — innerText forces a layout pass, and this runs every frame
  const has = ap.textContent.trim().length > 0 || ap.querySelector(".apBtn,.btlBtn,.bkoRow");
  /* D-20 (playtest 22 item 11 / 02.2 item 11, Wyatt): "no popup appears until the director camera
     AND the ships have stopped moving." panel.js's `pendingReveal` gate already exists and already
     waits on exactly that — stageSettled() (the camera tween AND the ship's rendered transform,
     hard-bounded by SETTLE_CAP_MS) alongside the typewriter reveal — but it was only ever applied
     to hide the BUTTON ROW (.apBtns/.apSub/.apBack) inside an already-visible box. The box itself,
     and the board-dimming backdrop this wrapper owns, still popped up the instant panel() gave the
     actionPanel any content, so a captain could watch an empty white card with a dimmed board
     arrive while their ship (or the director) was still gliding into place — the button fan simply
     bloomed into it a beat later.
     Reusing the SAME flag for the wrapper's own visibility (rather than inventing a second gate
     that could disagree with the first) means the whole popup — box, dim and buttons alike — now
     waits together. `pendingReveal` is only ever added when the prompt HAS buttons (panel.js:546),
     so a buttonless wait-line or battle flip-card (already framed synchronously by
     window.__pp4.battle, and not what D-20 was complaining about) is untouched by this and keeps
     appearing immediately, exactly as before. */
  /* pendingStage, NOT pendingReveal (Wyatt's blank-space lag, 2026-08-23 tier 1). The paragraph
     above still holds — the whole popup waits for the BOARD — but the flag it read also waited for
     the prompt's own typewriter, which typed invisibly behind display:none: fade + resize +
     20ms/char of dead air before anything appeared, on every prompt, every trade step. pendingStage
     is the board-settled half alone; the box now appears the moment the camera and ships are still,
     the old line fades in view, the new text types in visibly, and the buttons keep arriving last
     through the unchanged pendingReveal CSS (top-to-bottom rule intact). */
  const want = (has && !ap.classList.contains("pendingStage")) ? "block" : "none";
  if (box.style.display !== want) box.style.display = want;
  /* BEING ASKED SOMETHING IS THE END OF WAITING — Wyatt, 2026-08-20, and this is the half of his
     two wait-line reports that survived the first fix. A screenshot of the HOST at the recipe
     picker with "⚓ Waiting for yer mateys…" still floating over the sea, overlapping the "tap and
     hold the sea" hint: he had clicked through the Ahoy barrier first, been told he was waiting,
     and then been handed his own recipe choice with the wait line still standing.

     A wait line has no deadline and no timeout by design (item 19 — "it should disappear when their
     teammates have played"), so the ONLY things that retire one are a tap, the next narration line,
     and — since this morning — a centre-stage card. A recipe sheet is none of those. Neither is a
     radial bloom, or a battle call, or a trade offer. So whoever finished first sat under a stale
     "waiting" line through every prompt until narration happened to land.

     ONE PLACE, and it is this one: promptTick runs on both tiers (host and guest render into the
     same #actionPanel) and covers every prompt style there is or ever will be — no call site has to
     remember. Deliberately NOT S.hurry(): that would also cut a narration line short the instant a
     prompt appeared, which is a pacing change nobody asked for. Only the wait line goes.

     A RISING EDGE, NOT A LEVEL — and the level version was written first, shipped nothing, and was
     caught by measuring my own fix rather than trusting it. A wait line is BORN one beat after its
     owner answered a prompt, and the panel is not always empty by then; a `has`-is-true test
     therefore retired the line in the same frame it appeared. Both runs agreed: 0 frames of a live
     wait line, and the only samples that saw one at all were catching its fade. That is the whole
     feature deleted while every check still said PASS, because "the line is gone" is what the check
     was asking for.
     The honest question is "has a NEW question arrived since you were told to wait", so the panel
     going empty -> non-empty is the signal, and an already-open panel simply waits for the next one. */
  if (has && !S.hadPrompt && S.waitFinish) S.waitFinish();
  S.hadPrompt = has;
  if (!has){
    // full mode teardown — the recipes->lots transition never passes through an empty tick, and a
    // stale .pp4PeekHint left in the box becomes a FLEX SIBLING of the panel on the next centre
    // stage, crushing the message into a one-word-wide strip (Wyatt's 2:10 screenshot)
    box.classList.remove("radial", "pp4Center", "pp4Recipes");
    S.radKey = null;
    const h0 = box.querySelector(".pp4PeekHint"); if (h0) h0.remove();
    if (ap.style.maxHeight) ap.style.maxHeight = "";
    if (box.style.paddingBottom) box.style.paddingBottom = "";
    return;
  }
  // playtest 12 item 1/3: intro barriers (ahoy, turn order) play CENTER STAGE — the board dims,
  // the message sits dead centre and its button pulses right beneath it
  // ...and the bake-off shell (.bko) stages ITSELF, by content rather than flag: it is hand-built
  // (never through localAsk), it must stay staged through the verdict reveal, and keying off the
  // content means the stage ends at the exact moment the next narration replaces it — no window
  // where the shell could flash back to the old card style (playtest 16).
  if (ap.dataset.pp4Stage || ap.querySelector(".bko")){
    enterCenterStage();
    return;
  }
  box.classList.remove("pp4Center");
  if (box.style.paddingBottom) box.style.paddingBottom = "";   // centre-stage-only inset
  // playtest 10 item 1: the recipe chooser becomes a BOTTOM sheet — the sea it asks you to read
  // stays visible above the cards, holding a finger on the sea peeks behind them (the gesture
  // that already works on every card), and a hint line teaches it. Draft copy — Wyatt's to rewrite.
  const recipes = !!ap.querySelector(".recipeList");
  box.classList.toggle("pp4Recipes", recipes);
  let hint = box.querySelector(".pp4PeekHint");
  if (recipes){
    box.classList.remove("radial", "centered");
    /* THE PICKER SITS AS LOW AS IT CAN WHILE STILL FITTING — it is no longer a flat 45% of the
       viewport. 0.45 is a constant standing in for a quantity that moves (rule 9), and the honest
       phone height found it out: at 844 tall it leaves 456px for a card that wants ~370 and all is
       well, but at the 664 a real iPhone Safari actually gives the page it leaves 357, so BOTH
       recipe cards were cut off by the bottom edge of the screen with no visible cue that the panel
       scrolls — on the very first screen of the game. Measured before the fix at 390x664: cards
       ended at y=663 of a 664-tall viewport, and the panel's content was 370px in a 353px box.
       The 844 emulation hid it completely, which is D-42's whole point.
       The lift itself is applied after the cards exist and can be measured — see the note by the
       maxHeight cap below. This stays the STARTING point, so nothing changes on a tall screen. */
    const top = Math.round(vhPx() * 0.45);
    box.style.left = "8px"; box.style.top = top + "px";
    box.style.width = (vwPx() - 16) + "px";
    /* THE TWO HINTS TEACH TWO DIFFERENT SURFACES, SO THEY LIVE ON THE SURFACE THEY TEACH.
       playtest 21 (Wyatt), items 2 and 4. They used to be a stacked pair of pills wedged in the gap
       between the board and the sheet, where the sea one sat nowhere near the sea it names and the
       recipe one sat outside the card it is about.
         - "tap and hold the SEA"    -> a pill over the water, up in the open sea near the top of the
                                        board, away from the sheet entirely.
         - "tap a RECIPE"            -> inside the card, small italics, under the ask and above the
                                        cards it describes.
       The recipe line goes after .apMsg and before .apBtns, which is its VISUAL position — so the
       top-to-bottom reveal rule carries it for free: back, message, this, cards. */
    if (!hint){
      hint = document.createElement("div"); hint.className = "pp4PeekHint";
      hint.innerHTML = `<span>${peekHintText()}</span>`;   // D-40: one sentence, device-correct verb
      box.insertBefore(hint, ap);
    }
    // over the SEA, high on the board — measured off the board's own rect rather than a guessed
    // viewport fraction, so it lands on water at any screen height
    const bw = document.getElementById("boardwrap");
    const br = bw ? bw.getBoundingClientRect() : null;
    hint.style.top = Math.round(br && br.height ? br.top + br.height * 0.10 : vhPx() * 0.20) + "px";
    const msg = ap.querySelector(".apMsg");
    if (msg && !ap.querySelector(".pp4RecipeHint")){
      const rh = document.createElement("div");
      rh.className = "pp4RecipeHint";
      rh.textContent = "Tap a recipe to highlight its docks";
      msg.insertAdjacentElement("afterend", rh);
    }
    // playtest 19: the cap is the room left UNDER THE PANEL'S OWN TOP, not under the box's. The
    // hint pills are flex siblings above the panel, so measuring from `top` handed the panel the
    // hint's height as extra allowance and it ran off the bottom of the screen by exactly that
    // much — 47px, seen when slow-loading art made the cards tall enough to reach the cap.
    const apTop = ap.getBoundingClientRect().top;
    /* LIFT THE WHOLE BOX IF THE CARDS DO NOT FIT UNDER IT (D-42's find, see the note at `top`).
       Measure what the panel actually wants — scrollHeight is the content's own height, produced by
       the renderer rather than by any arithmetic here — and if the starting 45% cannot hold it,
       raise the box by exactly the shortfall. Never RAISE it on a screen where it already fits (the
       min() keeps a tall phone byte-identical), and never lift it above the board's own top band,
       which is where the ribbon and the wind pill live. */
    if (apTop > 0){
      const want = ap.scrollHeight + (apTop - parseFloat(box.style.top || 0)) + 8;
      const floor = topBandPx();
      const fitTop = Math.max(floor, vhPx() - want);
      if (fitTop < apTop - 1){
        box.style.top = Math.round(Math.min(parseFloat(box.style.top || 0), fitTop)) + "px";
      }
    }
    const apTop2 = ap.getBoundingClientRect().top;
    const capFrom = apTop2 > 0 ? apTop2 : top;
    ap.style.maxHeight = Math.max(160, vhPx() - capFrom - 8) + "px";
    return;
  }
  if (hint) hint.remove();
  ap.style.maxHeight = "";
  // N4 radial: choices bloom around the ship, right where the eyes are (the plan's own words).
  const menu = menuButtons(ap);
  const uu = boatUXY(appState.mySeat ?? 0);
  if (menu && uu){
    box.classList.add("radial"); box.classList.remove("centered");
    /* SEAM (a): peekHintTick() USED TO RUN HERE, FIRST, and that was the whole fault. It dodges
       the pill, the helper line and every circle by reading their rendered rects — but at this
       point in the tick none of them has been re-placed yet, so it always dodged where they were
       LAST frame and was one tick behind wherever they ended up (measured on solo-phone-021: the
       hint and the helper line overlapping by 1.75px, with .apSub already in the hint's own
       obstacle list). It now runs at the very end of tick(), after this whole placement pass —
       see peekHintLast(). D-39's rule is unchanged: a prompt IS over the board here, so the
       gesture is taught until it has been learned. */
    // ITEM 22 (D-18): 100%, not 100vw — an inline style always wins the cascade, so this literal
    // viewport-width string would have overridden the CSS %-based fix (index.html) and kept the
    // radial fan's box pinned to the true desktop width regardless of item 22's stopgap cap.
    box.style.left = "0px"; box.style.top = "0px"; box.style.width = "100%";
    // playtest 10: circles carry the SHORT form of a long action (Wyatt's pick: "short verbs,
    // details in the pill") — the full label is kept for the card fallback and restored there
    menu.forEach(b => {
      if (b._shortHtml != null && !b._radSwapped){ b._fullHtml = b.innerHTML; b.innerHTML = emojify(String(b._shortHtml)); b._radSwapped = true; }
    });
    const [sx, sy] = toScreen(uu[0], uu[1]);
    /* A CHOICE ABOUT SOMEONE ELSE'S SHIP SITS ON THAT SHIP — Wyatt's pick, playtest 22. The battle
       call is the case that needs it: "Call Dough Hook" belongs over Dough Hook's boat, not fanned
       around the caller's own, which the director no longer has on screen now that it frames the
       fight. It is the same rule the fan already follows — circles bloom around the ship, right
       where the eyes are — applied to the ship a button NAMES rather than the one choosing.
       Opt-in and all-or-nothing: an option carries `seat` (localAsk writes data-seat) and every
       button in the menu must carry one, or the ordinary fan runs untouched. */
    const anchors = menu.map(b => {
      const s = b.dataset ? b.dataset.seat : null;
      const u = s == null ? null : boatUXY(+s);
      return u ? toScreen(u[0], u[1]) : null;
    });
    const onBoats = anchors.length > 0 && anchors.every(Boolean);
    // the SEATS those anchors belong to — the framing needs captains, not screen points
    const anchorSeats = menu.map(b => b.dataset ? +b.dataset.seat : NaN).filter(n => Number.isFinite(n));
    const cap = $("pp4Cap");
    const capT = capBandBottom();   // NOT the card's own top — see capBandBottom()
    /* DERIVED FROM THE BAND, NOT RE-DERIVED FROM THE RIBBON. This line used to compute its own
       answer to "where does the board start" while boardBand() computed another — two things kept
       in step by nobody, which is the fault this whole phase has been unpicking, one scale down.
       boardBand()'s own note says it out loud: "capT and tSafe were already computed for the radial
       placement, but privately — which is why the bubbles never learned about them." tSafe never
       learned about the band either, so teaching the band about the wind pill would have fixed the
       bubbles and left the ask pill still sitting on it.
       ARITHMETICALLY IDENTICAL to what it replaced whenever there is no wind pill: the band is
       ribbonBottom + 8 and this was ribbonBottom + 40, so +32 preserves every existing number. */
    const tSafe = boardBand().top + 32;
    /* THE FALLBACK HAD NO FLOOR, AND MY OWN CHECK FOUND IT. Walking the placement rule across every
       sail-window top (rather than trusting the live sample, which had not produced one) showed the
       "put it BELOW instead" branch landing back on the wind pill: `Math.min(cb.b + 8, capT - 44)`
       clamps how far DOWN the pill may go and never how far up, so a sail window whose bottom edge
       is itself high on screen puts the pill straight back where it was not allowed to be.
       Pre-existing, not introduced by the tSafe change above — and it would have quietly undone it.
       The anchored-boats branch a few lines down has carried this Math.max all along; these two
       simply never got it. */
    const clampTop = y => Math.max(tSafe - 34, y);
    /* THE BOAT BEING ASKED IS ALWAYS ON THE WATER — playtest 22 (Wyatt: "the director did not
       correctly center my boat, so the board looks weird"), from a screenshot with his own ship
       drawn up over the ribbon and the wind pill, its action fan hanging beneath it.

       Only the SAIL prompt framed anything: camFitSail fits the sail window (which contains the
       ship by construction), and every other prompt simply inherited whatever shot the last
       narration left. A ship that had just sailed to the edge of that shot therefore got its
       question asked off the board. This became worth fixing rather than tolerating the moment
       #boardwrap started clipping (see index.html): what used to paint over the ribbon would now
       be cut off entirely, and a boat you cannot see is worse than a boat in the wrong place.

       Fires ONCE per prompt — S.frameKey is the turn serial plus the ask itself, so a re-place
       during the glide cannot re-aim the camera at every frame and chase itself. Only when the boat
       is genuinely outside the band the circles have to live in; a boat merely near the edge is
       left alone, because the director moving on its own is startling when it was not needed. */
    /* FRAME WHAT THE QUESTION IS ABOUT, NOT WHOEVER IS ANSWERING IT — playtest 22 item 6 (Wyatt):
       "The director is not correctly centering the players who are engaging in a battle, when
       asking a player to call the battle. The player is centered; instead, the two battling
       captains should be."
       Exactly what this did. `sx,sy` is MY ship and camToSeat(mySeat) re-aimed at MY ship, for
       EVERY prompt — including the call-the-winner prompt, which is a question about two other
       captains and whose own circles are anchored to THEM. So the director pulled the shot off the
       fight onto a bystander, and the two circles then bloomed around boats that had just been
       shoved to the edge, which is the second half of his report ("the logic is broken on
       displaying the action buttons"). The buttons were placed correctly around the wrong shot.
       `camFitSeats` already exists and is what __pp4.battle uses — the fight simply was not asking
       for it here. */
    if (!S.lock && sx != null){
      const key = S.turnSerial + "|" + (ap.querySelector(".apMsg") || {}).textContent;
      if (S.frameKey !== key){
        S.frameKey = key;
        const inBand = (px, py) => px >= 8 && px <= vwPx() - 8 && py >= tSafe && py <= capT - 8;
        if (onBoats && anchorSeats.length){
          // every captain the question is about has to be on screen, not just one of them
          if (!anchors.every(a => inBand(a[0], a[1]))) camFitSeats(anchorSeats);
        } else if (!inBand(sx, sy)) camToSeat(appState.mySeat ?? 0);
      }
    }
    /* D-48 — PASS IS ALWAYS THE LOWEST CIRCLE ON SCREEN. Wyatt, 2026-08-21, typed at the keyboard:
       "the Pass button is always the lowest one, so it's seen as the last option of what to do."
       This is the other half of item 14 of the twenty-two, which 02.2-01 left open as "never
       reproduced"; it is no longer a bug report, it is an instruction.

       flow.js already pushes Pass LAST into `opts`, which is exactly why the flat CARD fallback has
       always been right — DOM order puts the last option at the bottom. The fan then maps array
       index -> spot and chooses the most OPEN heading from the boat, so the moment it fans upward
       or sideways the "last" spot is no longer the lowest one on screen: measured on a posed
       four-crate fan at 390×664 with the boat against the bottom rail, Pass came out at y307 with
       three crates BELOW it at y390, and against the right rail with three below it again.

       So the rule is stated the way the card already behaves — THE LAST OPTION TAKES THE LOWEST
       SPOT — and it is applied once, to whichever set of points the search finally produced, so it
       holds for the formation, for the outward rings, for the cornered dock and for the anchored
       boats alike. A SWAP, not a re-sort: everything else keeps the order the fan gave it, and the
       circle that had been lowest takes the place Pass vacated, which is the smallest disturbance
       that satisfies him.
       It needs no new field and nothing on the wire, so a guest gets it by construction — the same
       reason the card fallback never needed one (rule 23). */
    /* ITEM 16 (Wyatt, 2026-08-23c) AMENDS D-48: "when right-to-left orientation of buttons, pass
       should be on the right, not the left — humans read left to right, so when you put it on the
       left we read it first... decide where pass goes based on whether the fan is more horizontal
       or more vertical, at the 45 degree cutoff." So the rule is READING ORDER, not gravity: a fan
       spread wider than it is tall reads left-to-right and Pass takes the RIGHTMOST spot; taller
       than wide reads top-to-bottom and Pass keeps D-48's LOWEST spot. The cutoff is the spread's
       own aspect (width ≥ height ⇔ the fan's axis is within 45° of horizontal). Still a SWAP, for
       D-48's own reason: everything else keeps the order the fan gave it. */
    const lastLowest = pts => {
      if (!pts || pts.length < 2) return pts;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const horizontal = (Math.max(...xs) - Math.min(...xs)) >= (Math.max(...ys) - Math.min(...ys));
      const last = pts.length - 1;
      let target = 0;
      for (let i = 1; i < pts.length; i++){
        if (horizontal ? (pts[i][0] > pts[target][0]) : (pts[i][1] > pts[target][1])) target = i;
      }
      if (target === last) return pts;
      const outPts = pts.slice();
      outPts[last] = pts[target]; outPts[target] = pts[last];
      return outPts;
    };
    /* THE CIRCLE'S SIZE COMES FROM THE RENDERER, AND THE GAP IS A FRACTION OF IT (D-44, rule 9).
       `D` was the literal 66 copied out of the stylesheet — but a RENDERED petal is 70px, because
       `#pp4Prompt.radial .apBtn` carries a 2px border outside its 66px box. So every spacing in
       this function was computed against a circle 4px smaller than the one on screen, and the
       "6px gap" a player was supposed to get measured 2.8–4.2px on a posed eight-button fan at
       390×664 (2026-08-22). Reading the width the renderer produced is BOARD-RENDERING §7's rule
       one scale down: never compare against arithmetic of your own when the real box is right
       there. Falls back to the stylesheet's 66 only if nothing has been laid out yet.

       A QUARTER OF THE CIRCLE, derived rather than typed, so it tracks D at every screen size:
       four petals plus three quarter-gaps is 4×70 + 3×17 = 331px, which still fits inside a 390px
       phone's band with room either side — the measurement Wyatt was shown when he chose this.
       R is the circle's own width plus a hair, which is byte-identical to the 70 this line has
       always carried at the old D, and now grows with the petal instead of drifting from it. */
    const D = Math.round((menu[0] && menu[0].offsetWidth) || 66);
    const GAP = Math.round(D / 4);
    /* THE PETAL BREATHES — the attention vocabulary (index.html) swells it to --pp4GrowPeak.
       Separation must reserve that room: at D+GAP two diagonal neighbours closed to under 1px of
       painted gap at every pulse peak (2026-08-24e layout gate). offsetWidth is layout size, so
       measuring mid-swell cannot double-count. The || fallback is the declared token's own value,
       for a pathological boot order only — the declaration lives in the vocabulary block. */
    if (!S.growPeak) S.growPeak = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pp4GrowPeak")) || 1.15;
    const SEP = Math.round(D * S.growPeak) + GAP;
    const R = D + 4;
    const placed = [];
    // playtest 10 item 3: the sail prompt is radial too — its legal squares are the answer space,
    // so every sail highlight is an obstacle nothing of ours may cover
    // RED ALERT FIX (2026-08-21): fixedRect(), not a raw getBoundingClientRect() — these obstacle
    // boxes are compared against sx/sy (now body-relative, per toScreen()'s own fix above) and feed
    // the fan's placement search and the sail-window card dodge below; a raw viewport-absolute rect
    // mixed into that arithmetic is the same offset bug in a different spot.
    const cellRects = [...document.querySelectorAll(".sailCell")].map(r => fixedRect(r));
    let cb = null;
    if (cellRects.length){
      cb = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
      cellRects.forEach(r => { cb.l = Math.min(cb.l, r.left); cb.t = Math.min(cb.t, r.top);
        cb.r = Math.max(cb.r, r.right); cb.b = Math.max(cb.b, r.bottom); });
    }
    // the ask itself rides as a compact pill above the ship — never hidden, so the panel's
    // type-then-reveal order survives; the bloom below it is the answer space
    const msg = ap.querySelector(".apMsg");
    // the ask's broadcast mirror can land as a bubble BEFORE the panel exists — if a live
    // bubble is just this pill's own words, retire it (the pill already says it)
    const bub = document.querySelector(".pp4Bub");
    /* BOTH SIDES MUST ACTUALLY SAY SOMETHING. Found by the Group E instrument, which could not
       measure a hold at all until it was explained: the typewriter reveal blanks a bubble's text
       for its first frames, and an ask pill mid-reveal is blank too — so `"" === ""` matched and
       this dedup retired a perfectly good narration line the instant any prompt was on screen.
       An empty bubble is not a duplicate of an empty pill. */
    /* the de-dupe that used to be written out here now lives in retireEchoBubble(), called from
       tick() for EVERY prompt style — a pure flip renders no panel, so this branch could never see
       the one case that was actually duplicating (D-46 fault 1). `bub` is still read above because
       the fan's own placement wants to know whether a bubble is on screen. */
    // HOT-PHONE memo: the placement search below re-ran every frame even with everything parked.
    // Re-place only when an input actually moved (camera/ship/viewport/menu/cells).
    // playtest 21 item 7: the slider's presence is part of the placement key. Without it a prompt
    // that differs from the previous one ONLY by gaining a slider reuses the memoised layout and
    // the bar is never positioned — it would render at 0,0 in the corner.
    const hasSlider = ap.querySelector(".apSliderWrap") ? 1 : 0;
    // the anchors are a placement INPUT, so they belong in the memo key — without them the layout
    // would be computed once, on the first frame of the camera's glide into the fight, and frozen
    // there while the boats slid across the screen underneath it
    const radKey = [S.turnSerial, menu.length, sx | 0, sy | 0, Math.round(capT), Math.round(tSafe),
      cellRects.length, vwPx(), hasSlider, menu.map(b => b.textContent.length).join(","),
      anchors.map(a => a ? (a[0] | 0) + "," + (a[1] | 0) : "-").join(";")].join("|");
    /* THE MEMO KEY DESCRIBES THE LAYOUT, NOT THE BUTTONS — so two consecutive prompts that happen
       to agree on it (same count, same label lengths, same ship square: two trade offers in a row
       are exactly this) produced the same key, the placement early-returned, and the prompt's
       BRAND NEW buttons were never positioned at all. Unpositioned radial buttons are
       `position:fixed` with no offsets, so they render stacked at the panel's static spot — which
       is precisely the "overlapping controls: Dough Hook/Walk away" the playtest gate kept
       reporting, and it is not a placement failure but a placement that never ran.
       Checking that every button actually carries a position is cheap, and it is a fact about the
       DOM rather than another thing to remember to put in the key. */
    /* THE PILL AND THE FAN CAN DRIFT INTO EACH OTHER AFTER PLACEMENT, so this runs on EVERY tick,
       above the memo. formationOK already refuses any layout that overlaps the ask pill — and the
       measurement showed a circle sitting on the pill anyway, with the pill still at the top the
       placement pass gave it. The reason is that the pill is not the size it will be when the fan
       is placed: `.apMsg` reveals progressively, so its rect is captured small, the fan legitimately
       avoids that small box, and the pill then grows into the circles while the layout is frozen by
       the memo. Re-checking is cheap (a handful of rects) and it is the only version that cannot be
       out of date. Shape-aware for the same reason the gate is: these are circles, and a corner
       clipping a text box is not a circle sitting on it. */
    liftAskClearOfFan(ap, tSafe, capT);
    clampAskToScreen(ap, tSafe);
    const unplaced = menu.some(b => !b.style.left);
    if (radKey === S.radKey && !unplaced) return;
    /* A LAYOUT COMPUTED WHILE THE BOX WAS `display:none` IS A GUESS, AND THE MEMO WOULD KEEP IT
       FOR THE WHOLE PROMPT. Nothing in radKey changes when the prompt becomes visible — same turn,
       same buttons, same ship, same viewport — so the guess computed behind panel.js's
       `pendingReveal` gate was frozen in place and never re-measured. Refusing to memoise a pass
       that had no layout to read costs one extra placement per prompt and removes the whole class. */
    S.radKey = (msg && !msg.offsetWidth) ? null : radKey;
    let pillB = null, stackAt = null, stackCx = null;
    if (msg){
      msg.style.position = "fixed";
      /* THE ASK PILL MUST FIT THE SCREEN, NOT JUST BE AIMED AT IT. `mw` was clamped to
         `vwPx() - 20` and then used only to CHOOSE a left edge — the element itself kept its
         natural width, so a long ask on a phone stayed wider than the screen and ran off the right
         edge, cutting the first line mid-word. The vision judge caught it in plain words on the
         phone leg: "trade prompt text box is clipped by the right screen edge, cutting off the
         first line mid-word ('Speckled Eggs the t...')". Capping the box makes it WRAP instead,
         which is what the clamp was always assuming had happened. */
      // NEVER WIDER THAN THE STYLESHEET ALREADY ALLOWS. index.html caps this box at `max-width:88%`;
      // an inline `vwPx()-20` is LARGER than that on a phone (370 vs 343) and, being inline, wins —
      // so the first version of this cap made the very overflow it was meant to stop slightly worse.
      // Take the tighter of the two and the cap can only ever help.
      /* THE PILL LEAVES ROOM FOR ITS OWN BACK CIRCLE. Capping the box to fit the screen turned a
         long trade ask into a 343px box on a 390px phone, which is the whole width — so the ‹ circle
         that hangs off its shoulder had nowhere to stand and ended up two-thirds hidden UNDER the
         pill, a half-tappable escape hatch. Reserving the circle's own footprint (38 + 8 gap + 4
         margin, the numbers the shoulder placement already uses) costs a long ask one extra line
         and keeps both fully on screen and fully touchable — which is the trade D-38 already made
         for every other control. Nothing is reserved when the prompt has no back option. */
      const backGap = ap.querySelector(".apBack") ? 50 : 0;
      msg.style.maxWidth = (Math.min(vwPx() - 20, Math.round(vwPx() * 0.88)) - backGap) + "px";
      msg.style.boxSizing = "border-box";
      /* CAP FIRST, MEASURE SECOND — this read used to sit ABOVE the two lines it depends on, so it
         measured a box that had not been capped yet and then chose a left edge for a width the box
         was about to stop having. Order is the whole fix here; the arithmetic below is unchanged. */
      const mw = Math.min(msg.offsetWidth || 200, vwPx() - 20);
      // playtest 15 (Wyatt: "over the course of a single turn, it doesn't move around"): the
      // pill's spot is chosen at the FIRST prompt of the turn and every later prompt in the
      // same turn reuses it — only the width re-clamps so a longer ask stays on screen.
      let cxA, mTop;
      // an ask about other people's ships is centred over THEM, and does not take or reuse the
      // turn's pill lock: that lock exists so a pill does not wander during YOUR turn, and this
      // prompt belongs to a fight in the middle of someone else's
      if (onBoats){
        cxA = anchors.reduce((a, p) => a + p[0], 0) / anchors.length;
        mTop = Math.max(tSafe - 34, Math.min(...anchors.map(p => p[1])) - R - 96);
      }
      /* THE LOCK IS PER TURN *AND* PER SHIP POSITION — playtest 22 item 8 (Wyatt): "'Wyargh whatll
         ye do' is far below my boat instead of above it, which is where it should be, and this
         happens even though there is space above it."
         The lock exists for a good reason (playtest 15: "over the course of a single turn, it
         doesn't move around"), but it keyed on the turn ALONE. The first prompt of a turn is the
         SAIL prompt, whose pill deliberately dodges the sail window and drops BELOW it when the
         squares reach the ribbon — and then the ship sails away and the action menu inherits that
         low spot, with the whole sea empty above it. Adding the ship's square to the key keeps the
         pill still while the ship is still, which is what he actually asked for, and re-picks the
         moment the ship has moved. */
      else if (S.pillLock && S.pillLock.key === S.turnSerial && S.pillLock.at === (sx|0)+","+(sy|0)){
        cxA = S.pillLock.cx; mTop = S.pillLock.top;
      } else {
        cxA = sx;
        // above the boat when the band has room, below it when it does not — the same rule the
        // narration bubble now follows (item 4), so one gesture has one behaviour
        mTop = (sy - R - 96 >= tSafe - 34) ? sy - R - 96 : clampTop(Math.min(sy + R + 34, capT - 44));
        // a sail prompt's pill dodges the whole sail window: above it if there's room under
        // the ribbon, else just below it
        if (cb){ mTop = (cb.t - 42 >= tSafe - 34) ? cb.t - 42 : clampTop(Math.min(cb.b + 8, capT - 44)); }
        S.pillLock = { key: S.turnSerial, at: (sx|0)+","+(sy|0), cx: cxA, top: mTop };
      }
      /* …AND THE PILL'S BOTTOM CLEARS THE CAPTAINS CARD, WHICHEVER SPOT WAS CHOSEN (Group G
         fault 3, judged on solo-phone-023: "the ask pill's bottom edge meets the top edge of the
         CAPTAINS card with no gap between them").

         `capT - 44` above is a CONSTANT STANDING IN FOR THE PILL'S HEIGHT — 44 is one line of pill
         plus the 6px of air, and it has been right only for one-line asks. A trade's answer runs to
         three lines and a counter-offer to five, so the taller the question the further it reaches
         past the card. Measured at 390x664 on a posed five-line ask: the pill is 99px tall and its
         bottom lands 65.4px INSIDE the captains card. RED-PROOF, same pill, boat high on the board:
         229px of clear air — so this measures the placement and not merely "a big pill".

         Two reasons it is applied HERE rather than by fixing the 44:
           - the three branches above choose between four spots (above the boat, below it, above the
             sail window, below it) and only two of them clamp at all; the ABOVE-the-boat spot,
             which is the one that actually overran in the measurement, never had a bottom bound.
             One clamp on the answer beats four copies of it (rule 23).
           - the pill lock reuses a spot across a whole turn, so a later, TALLER prompt in the same
             turn inherits a top chosen for a shorter one. Clamping on use rather than on store
             means the lock keeps the pill still while the words keep it legible.

         DERIVED, NOT TYPED: the pill's own rendered height, and the 6px of air every other stacked
         floater in this file already leaves (`stackAt = pillB.bottom + 6`, the fan's own gap, the
         peek hint's AIR). Never lifted above the band's own ceiling, which is what tSafe - 34 is. */
      const mh = msg.offsetHeight || 0;
      mTop = Math.max(tSafe - 34, Math.min(mTop, capT - 6 - mh));
      msg.style.left = Math.min(Math.max(cxA - mw / 2, 10 + backGap), vwPx() - mw - 10) + "px";
      msg.style.top = mTop + "px";
      // RED ALERT FIX (2026-08-21): fixedRect(), not a raw getBoundingClientRect() — msg is itself
      // position:fixed, so its rendered box is always viewport-absolute regardless of what we just
      // wrote; the back button below (also position:fixed) needs it back in the same body-relative
      // frame everything else in this function is now working in.
      pillB = fixedRect(msg);
      // the back option, when present, is a small circle on the pill's shoulder
      placeBackButton(ap, pillB, tSafe);
      stackAt = pillB.bottom + 6; stackCx = cxA;
    }
    /* THE SLIDER AND THE HELPER LINE ARE PLACED WHETHER OR NOT THERE IS AN ASK PILL, AND ARE
       ALWAYS CLAMPED INTO THE BAND. Both used to live inside `if (msg)`, hanging off the pill's
       bottom — so a prompt that carries a slider but no `.apMsg` never gave the slider a `top` at
       all. `.apSliderWrap` is `position:fixed` by CSS in this mode, and a fixed element with no
       offsets renders at its STATIC position, which on this stage is up inside the ribbon's band —
       and the ribbon is z-index 40 against the prompt's 30, so it sits ON TOP and eats the click.
       Measured by 4/scripts/playtest_gate.mjs, which named the occluder outright
       ("apSlider <- covered by #pp4Ribbon") after six straight voyages of
       "slider click did not move its readout": the counter-offer slider could not be dragged at
       all. Same family as the side-bet circles, same cure — nothing a player must touch may be
       placed without being clamped below the band.
       playtest 21 item 7's ordering is kept: slider first, helper text pushed below it. */
    /* ONE FUNCTION FOR EVERYTHING THAT RIDES UNDER THE PILL, because the pill MOVES after this.
       It was a bare block that ran once, before the fan was placed; the cornered-dock fallback
       then lifts the pill clear of the circles and the helper line stayed behind, stranded on top
       of them (measured: the line lying 23px deep across three crates on a posed eight-button fan
       at 390×664). The slider and the helper line hang off the pill's bottom edge, so they have
       to be re-stacked wherever the pill ends up — one definition, two call sites, rather than two
       copies of the arithmetic to keep in step. */
    const stackUnderPill = (cxS, startTop) => {
      let stackTop = startTop;
      const floor = tSafe;                       // never above the band…
      const ceil = Math.max(floor, capT - 60);   // …and never under the captains card
      const slw = ap.querySelector(".apSliderWrap");
      if (slw){
        const qw = Math.min(slw.offsetWidth || 220, vwPx() - 20);
        slw.style.left = Math.min(Math.max(cxS - qw / 2, 10), vwPx() - qw - 10) + "px";
        slw.style.top = Math.min(Math.max(stackTop, floor), ceil) + "px";
        stackTop = Math.min(Math.max(stackTop, floor), ceil) + (slw.offsetHeight || 40) + 6;
      }
      // helper text (greyed-circle reasons) rides just beneath the pill
      const sub = ap.querySelector(".apSub");
      if (sub){
        // SAME BUG AS THE ASK PILL, ONE ELEMENT OVER: the width was clamped to choose a left edge
        // while the element kept its natural width, so "Attacking costs ye 2 for powder. Firing
        // downwind wins ties!" ran clean off the right of a 390px phone. Cap it so it wraps.
        sub.style.maxWidth = Math.min(vwPx() - 20, Math.round(vwPx() * 0.88)) + "px";
        sub.style.boxSizing = "border-box";
        const sw = Math.min(sub.offsetWidth || 200, vwPx() - 20);
        sub.style.left = Math.min(Math.max(cxS - sw / 2, 10), vwPx() - sw - 10) + "px";
        sub.style.top = Math.min(Math.max(stackTop, floor), Math.max(floor, capT - 30)) + "px";
      }
    };
    stackUnderPill(stackCx != null ? stackCx : sx, stackAt != null ? stackAt : tSafe);
    // ---- playtest 15, ONE placement rule (Wyatt's pick): a TIGHT FAN on the open side ----
    // Find the most open direction from the boat (clear of screen edges, the captains box, the
    // pill and every sail square), then lay ALL the buttons along snug arc rows centred on it —
    // circles nearly touching, wrapping to a second row past four. A cornered boat fans toward
    // whatever water is open; the group stays together instead of scattering.
    const xMin = 8, xMax = vwPx() - D - 8, yMin = tSafe, yMax = capT - D - 8;
    // ---- each circle on the boat it names (see `onBoats` above) ----
    if (onBoats){
      /* SEPARATE, THEN CLAMP, THEN SEPARATE AGAIN — and the ORDER is the whole bug. This used to
         push overlapping circles apart and THEN clamp each one into the band, so two boats near the
         top of the board had their circles pushed apart vertically and then squashed straight back
         together by the clamp: both landed on yMin, piled on each other, with the upper one partly
         under the ribbon where nothing can click it. Found twice by 4/scripts/playtest_gate.mjs
         inside one voyage ("overlapping controls: Call Crustbeard/Call Flaky Jack") and again by
         stage_layout_check at 1920×1080, where the driver STALLED on it exactly as a player would —
         a side bet you cannot answer and cannot dismiss.
         Clamping first and re-separating after means separation is the last word, and running it a
         few times lets a pair that is pinned against one edge walk along that edge instead of
         through it. */
      const clampSpot = s => [Math.min(Math.max(s[0], xMin), xMax), Math.min(Math.max(s[1], yMin), yMax)];
      let spots = anchors.map(([ax, ay]) => clampSpot([ax - D / 2, ay + 26]));   // just off the stern
      const NEED = SEP;   // D-44: derived, never typed — swollen petal + quarter-gap, see the SEP note above
      for (let pass = 0; pass < 4; pass++){
        let moved = false;
        for (let i = 0; i < spots.length; i++)
          for (let j = i + 1; j < spots.length; j++){
            const dx = spots[j][0] - spots[i][0], dy = spots[j][1] - spots[i][1];
            const d = Math.hypot(dx, dy);
            if (d >= NEED) continue;
            moved = true;
            // when two circles land exactly on top of each other the direction is undefined —
            // separate them ALONG THE BAND (horizontally), which is the axis that always has room,
            // rather than vertically into the edge that just clamped them together.
            const ux = d > 0.5 ? dx / d : 1, uy = d > 0.5 ? dy / d : 0, push = (NEED - d) / 2 + 0.5;
            spots[i] = [spots[i][0] - ux * push, spots[i][1] - uy * push];
            spots[j] = [spots[j][0] + ux * push, spots[j][1] + uy * push];
          }
        spots = spots.map(clampSpot);
        if (!moved) break;
      }
      // LAST RESORT, so the fan can never come out piled: if the band is too tight for the circles
      // to separate at all, lay them out as an even row across the band's own width.
      const stillPiled = spots.some((a, i) => spots.some((b2, j) => j > i && Math.hypot(a[0] - b2[0], a[1] - b2[1]) < NEED - 1));
      if (stillPiled){
        const n = spots.length, span = Math.min((n - 1) * NEED, Math.max(0, xMax - xMin));
        const startX = Math.min(Math.max(spots.reduce((t, p) => t + p[0], 0) / n - span / 2, xMin), Math.max(xMin, xMax - span));
        const rowY = Math.min(Math.max(spots.reduce((t, p) => t + p[1], 0) / n, yMin), yMax);
        spots = spots.map((_, i) => [startX + (n > 1 ? (span / (n - 1)) * i : 0), rowY]);
      }
      spots = lastLowest(spots);   // D-48, and it holds for the anchored-boats fan too
      menu.forEach((b, i) => {
        b.style.position = "fixed";
        b.style.left = spots[i][0] + "px";
        b.style.top = spots[i][1] + "px";
      });
      return;
    }
    const hitRect = (bx, by, r, m) =>
      bx < r.right + m && bx + D > r.left - m && by < r.bottom + m && by + D > r.top - m;
    const obstacles = cellRects.slice();
    if (pillB) obstacles.push(pillB);
    /* SEAM (b), MEASURED IN 260821-qwv AND FIXED HERE: THE HELPER LINE IS AN OBSTACLE TOO.
       Only the ask pill was ever in this list, and nothing lifts `.apSub` the way
       liftAskClearOfFan lifts the pill — so on passplay-phone-021 the italic line explaining why a
       circle is greyed sat ON the Pass circle, and on a posed eight-button fan at 390×664 it lay
       across FOUR of them, 23px deep. It is text a captain has to read to understand a dead
       control: the same standing as the question itself, which has been an obstacle all along.
       Pushed as the RENDERED rect (fixedRect, body-relative like everything else in this
       function), not the styled one — the line wraps, so its height is only knowable after
       layout. */
    const subObs = ap.querySelector(".apSub");
    if (subObs && subObs.style.top){
      const sr = fixedRect(subObs);
      if (sr.width > 2 && sr.height > 2) obstacles.push(sr);
    }
    const inBounds = (bx, by) => bx >= xMin && bx <= xMax && by >= yMin && by <= yMax;
    const clash = (bx, by) =>
      placed.some(q => Math.hypot(bx - q[0], by - q[1]) < SEP) ||
      Math.hypot(bx + D / 2 - sx, by + D / 2 - sy) < D / 2 + 26 ||
      obstacles.some(r => hitRect(bx, by, r, 2));
    // Playtest 16 (Wyatt: "fan them out in a more symmetrical orderly way"): the fan is a RIGID
    // FORMATION, not per-button slot-filling. Straight rows perpendicular to the open heading,
    // each row centred on the heading axis (7 -> 4 across + 3 staggered behind, like pins), and
    // validity judged for the WHOLE formation — if anything collides the entire fan rotates to
    // the next-best heading or steps outward, so it can never come out ragged or lopsided. Arc
    // rows were tried first and rejected: at this radius a row of four wraps ~200° round the
    // boat and reads as a ring, not a fan. Only the hopeless case docks as a strip.
    const rowSplit = n => n <= 4 ? [n] : n === 5 ? [3, 2] : n === 6 ? [3, 3] : n === 7 ? [4, 3] : [4, 4];
    const formation = (a0, r0) => {
      const ux = Math.cos(a0), uy = Math.sin(a0);       // out from the boat
      const vx = -uy, vy = ux;                          // across the row
      const pts = [];
      const split = rowSplit(menu.length);
      for (let ri = 0; ri < split.length; ri++){
        const along = r0 + ri * SEP;
        const n = split[ri];
        for (let j = 0; j < n; j++){
          const off = (j - (n - 1) / 2) * SEP;
          pts.push([sx + ux * along + vx * off - D / 2, sy + uy * along + vy * off - D / 2]);
        }
      }
      return pts;
    };
    const formationOK = pts => pts.every(([cx, cy]) =>
      inBounds(cx, cy) &&
      Math.hypot(cx + D / 2 - sx, cy + D / 2 - sy) >= D / 2 + 26 &&
      !obstacles.some(rc => hitRect(cx, cy, rc, 2)));
    // headings ranked by open water, then fine-tuned by half-steps; radius grows as a last resort
    const headings = [];
    for (let k = 0; k < 16; k++){
      const a = k * Math.PI / 8;
      let reach = 0;
      for (let r = R; r <= R + 150; r += GAP){
        const cx = sx + r * Math.cos(a) - D / 2, cy = sy + r * Math.sin(a) - D / 2;
        if (!inBounds(cx, cy) || obstacles.some(rc => hitRect(cx, cy, rc, 2))) break;
        reach = r;
      }
      headings.push({ a, reach });
    }
    headings.sort((p, q) => q.reach - p.reach);
    /* WHEN NOTHING FITS, THE CLUSTER DRIFTS AWAY FROM THE BOAT — IT NEVER PILES (D-44).
       Wyatt, asked with the measurement in front of him: keep the circles full size, give them a
       real gap, and let the group move out toward open water when the corner is tight. D-38's
       "circles hug the boat" preference yields here, and he had already said why — a control you
       cannot hit is the one unacceptable outcome.
       The ladder used to be three fixed steps (0, 14, 28): a quarter of a circle's worth of
       search, after which the cornered GRID took over and packed eight crates into a slab. Now it
       steps outward in rings of half a circle-and-gap until the band's own diagonal is exhausted,
       so the dock is reached only when there is genuinely nowhere in the band that holds the
       formation at the required gap. Derived from the band, so it cannot be wrong at a size
       nobody tested. Bounded by construction: the loop breaks the moment a layout passes. */
    const rings = [];
    for (let g = 0, lim = Math.hypot(Math.max(0, xMax - xMin), Math.max(0, yMax - yMin)),
             stepG = Math.max(8, Math.round(SEP / 2)); g <= lim; g += stepG) rings.push(g);
    let pts = null;
    outer:
    for (const grow of rings){
      for (const h of headings){
        for (const da of [0, Math.PI / 16, -Math.PI / 16]){
          const cand = formation(h.a + da, R + grow);
          if (formationOK(cand)){ pts = cand; break outer; }
        }
      }
    }
    if (!pts){
      /* CORNERED BEYOND HOPE (a phone-narrow band): the group docks as a compact GRID above the
         captains box. It used to dock as a single ROW, spaced D+6 apart, and then clamp each circle
         into the band — and a row of eight at 72px apart needs 504px, which a 390px phone does not
         have, so the outer circles clamped straight onto their neighbours and a trade prompt came
         out as a pile of unclickable crates. Measured by the playtest gate's phone leg, repeatedly:
         "overlapping controls: Fresh Milk/Cacao Pods, Cacao Pods/Speckled Eggs".
         This is the SAME mistake the anchored-boats branch above was fixed for an hour earlier —
         spread first, clamp second, and let the clamp undo the spreading. The cure is the same in
         spirit: never lay out more per row than the band genuinely holds. Wrap instead, and stack
         the rows upward from the captains box. */
      const gap = GAP, step = SEP;
      const perRow = Math.max(1, Math.floor((xMax - xMin + gap) / step));
      const rowsN = Math.ceil(menu.length / perRow);
      const blockH = rowsN * step - gap;
      const block = (cx, ty) => {
        const top0 = Math.min(Math.max(ty, yMin), Math.max(yMin, yMax - (blockH - D)));
        return menu.map((b, n) => {
          const r = Math.floor(n / perRow), c = n % perRow;
          const inRow = Math.min(perRow, menu.length - r * perRow);
          const rowW = inRow * step - gap;                        // left-edge span of this row
          // xMax is the greatest LEFT coordinate a circle may take, so the row's own start is bounded
          // by xMax minus the row's width beyond its first circle.
          const startX = Math.min(Math.max(cx - rowW / 2, xMin), Math.max(xMin, xMax - (rowW - D)));
          return [startX + c * step, top0 + r * step];
        });
      };
      const dockY = Math.max(yMin, Math.min(capT - blockH - 10, Math.max(yMin, yMax)));
      /* …AND THE DOCK MUST NEVER LAND ON A SQUARE YOU HAVE TO TAP. D-38 (Wyatt, 2026-08-21) lets a
         prompt cover the board and names exactly one exception: "sailing squares, which you have to
         click and you cannot click them if they are covered by something." Every OTHER placement in
         this function already treats the sail rects as obstacles; the cornered dock is the one that
         did not, because it is what runs precisely when the obstacle-aware search has already given
         up — so it docked the block above the captains box and dropped it straight onto the sail
         window. That is all three of the 2026-08-21 passplay-phone structural failures at once, one
         screen, one circle: `sail-clickable: 9 sail square(s) covered <- #apStay`, plus the `no-pile`
         and `not-occluded` rules reporting the same overlap from their own angle.
         The search is deliberately the SAME SHAPE the narration bubble already uses for the same
         rule (see place() above): the two vertical spots the layout would consider anyway — clear
         below the sail window, clear above it — each tried at the boat's own column, flush left and
         flush right, taking the first that covers NO square and otherwise the least-covering. It
         cannot wander: every candidate is one the old code would already have been happy with, and
         with no sail window on screen the first candidate IS the old behaviour, unchanged. */
      const covers = ps => cellRects.reduce((n, rc) =>
        n + (ps.some(p => hitRect(p[0], p[1], rc, 0)) ? 1 : 0), 0);
      const ys = cb ? [dockY, cb.b + 8, cb.t - blockH - 8] : [dockY];
      const xs = [sx, -1e6, 1e6];        // the boat's column, then flush left, then flush right
      let bestN = Infinity;
      for (const ty of ys){
        for (const cx of xs){
          const cand = block(cx, ty);
          const n = covers(cand);
          if (n < bestN){ bestN = n; pts = cand; }
          if (n === 0) break;
        }
        if (bestN === 0) break;
      }
      /* AND IF EVEN THE DOCK CANNOT HOLD THEM, SAY SO OUT LOUD (D-44). Wyatt's ruling ends "a
         layout that still cannot satisfy the gap must be reported, never silently accepted." The
         layout gate already catches a pile from the outside, geometrically; this names it from the
         inside, with the numbers, so a driven run is loud rather than merely red — a fallback that
         quietly hands back overlapping circles is exactly the reassuring-green failure this
         project keeps paying for. */
      if (pts && pts.some((a, i) => pts.some((b2, j) => j > i && Math.abs(a[0] - b2[0]) < D && Math.abs(a[1] - b2[1]) < D)))
        console.warn(`[pp4] fan fallback piled: ${menu.length} circles of ${D}px at a ${GAP}px gap do not fit the ${Math.round(xMax - xMin + D)}×${Math.round(yMax - yMin + D)} band`);
    }
    /* THE QUESTION MUST SURVIVE ITS OWN ANSWERS. D-38 lets the fan cover the BOARD, and holding
       the sea reveals what is underneath — but holding the sea does not reveal text sitting under
       a button, so a circle parked on the ask pill hides the very sentence it is answering. The
       formation search already treats the pill as an obstacle; the cornered GRID fallback above
       cannot, because it is what runs precisely when nothing avoidable is left. So the pill gives
       way instead: it lifts to just above the block, still inside the band. Measured repeatedly by
       the playtest gate ("no-cover-ask: 'Toasty Wheat' over 'What do ye WANT from the table'"). */
    if (msg && pillB){
      const hit = pts.some(p => p[0] < pillB.right && p[0] + D > pillB.left &&
                                p[1] < pillB.bottom && p[1] + D > pillB.top);
      if (hit){
        const blockTop = Math.min(...pts.map(p => p[1]));
        /* THE WHOLE ASK MOVES, SO THE WHOLE ASK HAS TO FIT. Lifting only the pill's own height
           put its bottom 10px above the circles and then re-stacked a 23px helper line into that
           10px — measured: the line back across three crates, 20px deep, which is the fault this
           lift exists to prevent, reintroduced by the lift itself. Measure what actually hangs
           below the pill (the slider and the helper line, with the same 6px air stackUnderPill
           gives them) and clear the block by all of it. */
        const under = [".apSliderWrap", ".apSub"].reduce((t, sel) => {
          const el = ap.querySelector(sel); if (!el || !el.style.top) return t;
          const r = fixedRect(el); return r.height > 0 ? t + r.height + 6 : t;
        }, 0);
        const lifted = Math.max(tSafe - 34, blockTop - pillB.height - under - 10);
        msg.style.top = lifted + "px";
        pillB = fixedRect(msg);
        placeBackButton(ap, pillB, tSafe);
        // …AND THE HELPER LINE COMES WITH IT. The back circle already followed the pill here; the
        // slider and `.apSub` did not, so the one piece of text that explains a greyed circle was
        // left lying across the very circles it explains.
        stackUnderPill(stackCx != null ? stackCx : sx, pillB.bottom + 6);
      }
    }
    pts = lastLowest(pts);   // D-48 — applied to whichever search produced this layout
    menu.forEach((b, i) => {
      const spot = pts[i];
      placed.push(spot);
      b.style.position = "fixed"; b.style.left = spot[0] + "px"; b.style.top = spot[1] + "px";
    });
    return;
  }
  box.classList.remove("radial");
  S.radKey = null;
  [...ap.querySelectorAll(".apBtn")].forEach(b => {
    b.style.position = ""; b.style.left = ""; b.style.top = "";
    if (b._radSwapped){ b.innerHTML = b._fullHtml; b._radSwapped = false; }   // card shows the full label
  });
  // HOT-PHONE: the card path reads offsetHeight (layout) — 20Hz is plenty when nothing glides
  if (!S.tween && fc % 3) return;
  const big = box.offsetHeight > vhPx() * 0.42;
  const u = boatUXY(appState.mySeat ?? 0);
  /* T-07 (Wyatt, 2026-08-26): "when you observe other players battling, the battle box moves around
     in a glitchy way, and sometimes it's offscreen; it almost looks like it's trying to hover the
     box over my own boat, which is unnecessary. expectation: it should be centered over the game
     board and stay there."  It IS hovering his own boat: `u` above is MY seat, and the card is hung
     off that hull below. A battle between two OTHER captains has nothing to do with my ship, and
     the camera is meanwhile holding on the pair who are fighting — so the card is anchored to a
     boat the director is not even looking at.

     MEASURED, both screens, one real battle (4/scripts/qa/battle_watch_probe): the watching guest's
     card travelled 435,453 -> 350,176 -> 261,227 in 600ms and then jittered +/-10px for the rest of
     the fight; the host's went 304,167 -> 306,166 and stopped. The 600ms is the camera's 650ms
     tween — the guest aims its camera at the same instant the card is born, so the card rides the
     tween. And `top = sy + 34` is NOT clamped to the viewport the way `left` is, which is the
     "sometimes it's offscreen" half: an anchor ship above the visible band sends top negative.

     CENTRED IS ALREADY A SOLVED CASE HERE — it is what an over-tall card does, one line up. So the
     battle card joins it rather than getting placement logic of its own. This function runs on both
     tiers, so host and guest take the rule from the same line; nothing is branched on who is
     watching. */
  const isBattle = !!box.querySelector(".btl");
  if (big || isBattle || !u){ box.classList.add("centered"); box.style.left = ""; box.style.top = ""; return; }
  box.classList.remove("centered");
  const W = Math.min(330, vwPx() - 16);
  box.style.width = W + "px";
  const H = box.offsetHeight;
  const cap = $("pp4Cap");
  const capTop = capBandBottom();
  const pill = $("pp4Pill");
  const topSafe = (pill && pill.style.display !== "none")
    ? pill.getBoundingClientRect().bottom + 8
    : ($("pp4Ribbon") ? $("pp4Ribbon").getBoundingClientRect().bottom + 8 : 56);
  const [sx, sy] = toScreen(u[0], u[1]);
  let left, top;
  const cells = [...document.querySelectorAll(".sailCell")];
  if (cells.length){
    // playtest 6: during a sail prompt the card must NEVER sit on the sail window — the camera
    // promised every legal square stays visible, so the card dodges to the clearest band:
    // below the window, above it, or hugging the captains box, recomputed as the camera moves.
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    // RED ALERT FIX (2026-08-21): fixedRect(), not a raw getBoundingClientRect() — x0/x1 feed
    // `left` below, clamped against vwPx() (body-relative); a raw viewport-absolute rect here is
    // the same seam this whole fix is about, just in the card-mode fallback instead of the radial one.
    cells.forEach(c => { const r = fixedRect(c);
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); });
    left = Math.min(Math.max((x0 + x1) / 2 - W / 2, 8), vwPx() - W - 8);
    const below = (capTop - 8) - (y1 + 8);
    const above = (y0 - 8) - topSafe;
    if (below >= H) top = y1 + 8;
    else if (above >= H) top = y0 - 8 - H;
    else {
      /* LEAST-BAD IS STILL NOT ALLOWED TO COVER A SQUARE — the same D-38 rule the radial dock
         above now obeys, on the card the sail prompt falls back to when the fan cannot be drawn.
         The two vertical spots ARE the two branches above; all that is left to try here is the
         row's horizontal position, so the card slides to whichever end of the band covers fewest
         legal moves. On a 390px phone the card is 330 wide and that buys 44px of travel — say so
         rather than pretend otherwise; it is the same search shape as the bubble's and it is what
         there is room for. Zero-cover wins outright when it exists. */
      top = capTop - H - 6;                    // least-bad: hug the captains box
      const cr = cells.map(c => fixedRect(c));
      const hits = (lx, ty) => cr.reduce((n, r) =>
        n + ((lx < r.right && lx + W > r.left && ty < r.bottom && ty + H > r.top) ? 1 : 0), 0);
      let bn = hits(left, top);
      if (bn > 0) for (const lx of [8, Math.max(8, vwPx() - W - 8)]){
        const n = hits(lx, top);
        if (n < bn){ bn = n; left = lx; }
      }
    }
  } else {
    left = Math.min(Math.max(sx - W / 2, 8), vwPx() - W - 8);
    top = sy + 34;                             // just under the hull
    if (top + H > capTop - 6) top = Math.max(topSafe, sy - H - 44);
  }
  box.style.left = left + "px"; box.style.top = top + "px";
}
// HOT-PHONE, measured by ablation (idle at a sail prompt, headless): the 60Hz rAF loop itself
// cost ~17% of a core — more than every CSS animation combined — just by waking the renderer
// every frame. So the loop now has two gears: full rAF while anything actually moves (camera
// tween, live pinch/pan, a bubble riding a ship), and an 8Hz heartbeat otherwise. wake() snaps
// back to the fast gear the instant motion starts, so nothing ever glides at 8fps.
let fc = 0;
// activate once a voyage is actually on screen — solo, pass-and-play, OR networked. Extracted
// from tick() so syncPrompt() can run the SAME check synchronously: the stage was only ever built
// on the tick loop's own beat, so the very first prompt of a voyage could render before
// body.pp4Stage existed at all — and then no amount of laying it out helps, because every stage
// rule is scoped to that class. That is what left the recipe cards at 306px (unstyled flex) for
// the first frames of the chooser.
//
// 02-03 (MP-10/MP-11): this used to also require `!appState.room`, written 2026-08-13 while `4/`'s
// Firebase tags were off and appState.room could never be non-null — a no-op at the time, not a
// deliberate "networked games use the classic layout" choice. Restoring multiplayer (02-01) turned
// that no-op into a real bug: appState.room stays truthy for a room's entire lifetime, so this
// guard silently stopped the stage — and with it #pp4Ribbon, #pp4FF, everything this phase's
// mode-gating work depends on — from ever building in a networked game, confirmed by direct
// measurement (headless host+guest voyage: `pp4Stage` absent from body, `#pp4Ribbon`/`#pp4FF`
// absent from the DOM, even with `gameStarted:true`). `gameEl`'s display plus `appState.game`
// already fully capture "the voyage view is on screen" for every mode alike (`showGameView()`,
// `4/src/ui/lobby.js`, runs identically for solo/pass-and-play/networked) — the room check added
// nothing even when it was harmless, and removing it is not a new mechanism, just the two
// conditions that were always sufficient on their own.
function maybeBuildStage(){
  if (S.active) return;
  const gameEl = $("game");
  if (gameEl && getComputedStyle(gameEl).display !== "none" && appState.game) buildStage();
}
function needFast(){ return !!(S.tween || S.bubPlace || ptrs.size > 0); }
export function wake(){
  if (S.hidden) return;   // nothing to wake for while the page is hidden — see the listener below
  if (S.slow){ clearTimeout(S.raf); S.slow = false; S.raf = requestAnimationFrame(tick); }
}
function tick(){
  fc++;
  camFrame();
  // the narration deadline, honoured by whichever gear is running — see stageFlash's note. This is
  // the only thing standing between a dropped timer and a voyage that never continues.
  if (S.bubDue && Date.now() >= S.bubDue){ const f = S.bubFinish; S.bubDue = 0; S.bubFinish = null; if (f) f(); }
  if (S.bubPlace) S.bubPlace();   // the live bubble moves in the same frame as the camera
  if (S.active){
    // item 7: the move the stage held back plays the moment the stage is gone — see camTo()
    if (S.camHeld && !stageHoldsAttention()){ const t = S.camHeld; S.camHeld = null; camTo(t[0], t[1], t[2]); }
    // pill and ribbon change on human timescales — 10Hz in the fast gear, every beat in slow
    if (S.slow || S.tween || fc % 6 === 0){ pillTick(); ribbonTick(); }
    promptTick();
    retireEchoBubble();   // D-46: one moment, one sentence — every prompt style, not just the fan
    cerBandTick();    // the ceremony's words stay off the captains card, however tall it grows
    peekHintLast();   // SEAM (a): the hint is the LAST thing placed, so it dodges this tick's layout

  }
  else if (S.slow || fc % 6 === 0) maybeBuildStage();
  if (S.hidden) { S.raf = 0; return; }   // backgrounded: stop dead, don't re-arm
  if (needFast()){ S.slow = false; S.raf = requestAnimationFrame(tick); }
  else { S.slow = true; S.raf = setTimeout(tick, 125); }
}
/* WATCHDOG — because the thing that failed is the thing tick() is re-armed BY.
   playtest 22. The stall above was a dropped `setTimeout`; the slow gear re-arms itself with
   `setTimeout(tick,125)`, so the very same loss can kill the tick loop, and then the deadline check
   inside tick() never runs either. A belt that hangs off the same hook as the thing it is holding up
   is not a belt.
   `setInterval` is the independent hook, and that is measured rather than assumed: in the run that
   found this, a 250ms interval delivered 272 ticks across 72 seconds — through the whole stall —
   while two timeouts armed in the middle of it were never delivered at all.
   Half a second, and all it does when nothing is wrong is compare two integers: no layout, no DOM,
   nothing that shows up on a hot phone. It never restarts the loop while the page is hidden — that
   would undo playtest 20's battery fix, and visibilitychange already restarts it on the way back —
   but it DOES honour a narration deadline while hidden, which is what the timeouts used to do. */
setInterval(() => {
  if (S.bubDue && Date.now() >= S.bubDue){ const f = S.bubFinish; S.bubDue = 0; S.bubFinish = null; if (f) f(); }
  if (!S.hidden && !S.raf){ S.slow = false; tick(); }        // the loop stopped: pick it up again
}, 500);
// playtest 20 (Wyatt: "see if those continue when the game is idle in the background on mobile,
// and pause them"). Measured with the page hidden: a requestAnimationFrame loop stops on its own
// (92 ticks -> 92 across 1.5s), but a setTimeout loop KEEPS FIRING (12 -> 14). This tick has two
// gears and the idle one is `setTimeout(tick,125)`, so the stage went right on running — camera
// maths, pill and ribbon updates, prompt placement — on a phone in a pocket, for as long as the
// tab lived. Nothing was painting, so every bit of it was waste.
// Stops on hide and restarts on show. The restart is a plain tick(): every layout input it caches
// (ribbon height, viewBox, ripple transform) is re-read on the first pass, so there is no stale
// frame to clear first. board.js's own visibilitychange listener is untouched — it resets the wind
// meter's frame reference and must keep doing that independently of this.
if (typeof document !== "undefined" && document.addEventListener){
  document.addEventListener("visibilitychange", () => {
    const hidden = document.visibilityState === "hidden";
    if (hidden === !!S.hidden) return;
    S.hidden = hidden;
    if (hidden){
      clearTimeout(S.raf); cancelAnimationFrame(S.raf); S.raf = 0;
    } else if (!S.raf){
      S.slow = false; tick();
    }
  });
}

/* FIX-01 (D-01/D-02) — the ONE-TIME removal of the shared, un-namespaced turn-clock key.
 *
 * WHY. playpastrypirates.com and playpastrypirates.com/4 are two games on ONE origin, so they share
 * one localStorage namespace. Until this commit the new game wrote pp_timerOff, which the live
 * game reads at src/orchestrator.js:1399 and PUSHES TO THE WHOLE ROOM at :1404 — so opening /4
 * switched the clock off in the game real players play, and a host who had visited /4 handed that
 * setting to everyone at their table. The new game now writes pp4_timerOff at all five of its own
 * sites; this function clears the key it should never have written. D-01, Wyatt 2026-08-18:
 * "Not migrate, not leave." The standing rule it comes from is D-04 — share who you are, split how
 * you play — which is why pp_id / pp_lastName / pp_muted are deliberately NOT namespaced.
 *
 * WHY IT IS MARKER-GUARDED AND NOT A DELETE-ON-EVERY-LOAD (D-02, the whole point). Deleting the
 * shared key on every visit would mean /4 permanently vandalises the live game's preference — every
 * time a live-game session set it, the next /4 load would wipe it again. That is the exact defect
 * FIX-01 exists to fix, re-committed from the other direction. It runs once per browser; after that
 * a re-planted legacy key belongs to the live game and is left strictly alone.
 *
 * WHY THE MARKER IS TESTED WITH `!= null` AND THE LEGACY VALUE IS NEVER READ AT ALL. "0" and ""
 * are both legitimate stored values and both are falsy (HARD-WON-LESSONS §3, the falsy zero). A
 * truth-test would treat a browser storing "0" as never having been cleaned, and would skip an
 * empty-string legacy key as though there were nothing to remove. removeItem() is unconditional
 * precisely so no falsy-but-present value can be missed.
 *
 * `store` is a parameter rather than a direct localStorage reference so the behaviour is drivable
 * against a fake store under Node — that is what 4/scripts/pp4_timeroff_check.js does, and it costs
 * exactly one argument. The try/catch swallows silently with no logging, matching this codebase's
 * storage convention at 4/src/ui/audio.js:177-183 (Safari private mode throws on write).
 *
 * Returns true when this call performed the cleanup, false when it was already done or storage
 * threw — the boolean is what lets the gate assert the marker semantics instead of inferring them.
 *
 * NOTE TO THE NEXT EDITOR: every mention of a key name in PROSE here is deliberately UNQUOTED.
 * 4/scripts/pp4_timeroff_check.js counts QUOTED occurrences of the legacy literal and requires
 * exactly one tree-wide — the removeItem call below. Quoting a key name in a comment makes that
 * gate red, which is the trap HARD-WON-LESSONS §1b records: a check that cannot tell prose from
 * code makes writing the explanation an offence. Quotes are code here; prose goes bare.
 */
export function cleanupLegacyTimerKey(store){
  try {
    if (store.getItem("pp4_timerOffCleaned") != null) return false;
    store.removeItem("pp_timerOff");
    store.setItem("pp4_timerOffCleaned", "1");
    return true;
  } catch (e) { return false; }
}

export function initStage(){
  // FIX-01: clear the shared legacy key once per browser, BEFORE the seed below reads anything.
  // Wrapped again here because a browser can throw on merely touching localStorage (Safari private
  // mode) — the boot path must not go down for a housekeeping call.
  try { cleanupLegacyTimerKey(localStorage); } catch (e) {}
  // solo clock: off by default on /4 (the toggle in the sheet still works and persists).
  // D-03: the OFF default is DELIBERATE and is not what FIX-01 changes — only the key changed.
  // Wyatt, 2026-08-18: "multiplayer is played between friends, who can communicate through the
  // chat." The shot clock is not this game's dropped-player mechanism. REQUIREMENTS.md:169.
  // (The D-03 off-by-default timer seed stood here. The shot clock left 2026-08-28; players'
  // pp4_timerOff preference stays on their devices untouched, to be honoured on its return.)
  // bridge for the classic modules (no import cycles): panel/flow/board call these if present
  window.__pp4 = {
    flash: stageFlash,
    /* `variants` USED TO BE DROPPED HERE, AND THAT WAS PAR-14's OWN SEAM. netNarrate picked a
       variant and handed this entry a bare string; watchNarr handed flash() the RAW payload and
       flash() picked for itself — two shapes for one drawn thing, and the shape the HOST used
       could not carry the fact the renderer needed. It is forwarded now, so both tiers hand
       stageFlash the same five arguments and any rule about a payload is written exactly once. */
    narr: (html, opts, variants) => (S.active ? stageFlash(html, undefined, undefined, variants, opts) : null),
    set subject(v){ S.subject = v; }, get subject(){ return S.subject; },
    set evType(v){ S.evType = v; }, get evType(){ return S.evType; },
    sailCells: (seat) => { if (S.active) camFitSail(seat); },
    /* THE SHOT IS THE FIGHT, AND IT IS HELD. Called at the top of asyncBattle (before the opening
       line, so the camera is already there when it speaks) and again by every battle-card render.
       It used to centre the MIDPOINT at a fixed 2.0x, which frames two adjacent ships and crops two
       that are not — camFitSeats derives the zoom from the gap instead, so both boats are on screen
       whatever the fight looks like. Re-fitting only when the pair changes: an unchanged re-fit
       would restart the 650ms tween — and hold the tick loop in its fast gear — on every round. */
    battle: (a, d) => { if (!S.active) return;
      const g = appState.game; if (!g || !g.players[a] || !g.players[d]) return;
      const same = S.battle && S.battle[0] === a && S.battle[1] === d;
      S.battle = [a, d]; S.lock = false;
      if (!same) camFitSeats([a, d]); },
    battleEnd: () => { S.battle = null; },
    flip: flipArmed,
    // turnSerial: bumps whenever the wheel changes hands — the pill-lock and placement memo key
    // on it, so a NEW turn re-anchors the ask pill and an ongoing one never moves it (playtest 15)
    actor: seat => { if (S.activeSeat !== seat) S.turnSerial = (S.turnSerial || 0) + 1; S.activeSeat = seat; },
    // a rim ride spans the whole board — pull out so the sweep never plays off screen; the
    // narration that follows glides the camera back down to the ship at its whirlpool
    sweepCam: () => { if (S.active){ S.lock = false; camFull(); } },
    /* THE STORM IS THE ONE MOMENT THE WHOLE TABLE MOVES AT ONCE — playtest 22 item 1 (Wyatt): "The
       director should zoom out to show all boats and their end squares before moving them in a
       storm." A storm takes every ship three squares downwind simultaneously; framed on one boat,
       the player watches their own ship slide and has to infer the rest from the narration.
       The window is every ship's square AND the square the wind is driving it toward. That target
       is computed the plain way (pos + dir x STORM_PUSH) rather than asked of the engine, and that
       is deliberate: a ship that fetches up short on land or another hull ends INSIDE this window,
       never outside it, so an over-estimate is always safe and an engine query would have to mutate
       the board to answer. Called before the first ship moves, so the shot is already wide when the
       storm starts rather than chasing it. */
    stormCam: (dirKey) => { if (!S.active) return;
      const g = appState.game; if (!g) return;
      const d = DIRS[dirKey]; if (!d) return;
      const cells = [];
      for (const p of g.players){
        if (!g.inPlay || !g.inPlay(p) || !p.pos) continue;
        cells.push(p.pos);
        cells.push([p.pos[0] + d[0] * STORM_PUSH, p.pos[1] + d[1] * STORM_PUSH]);
      }
      if (!cells.length) return;
      S.lock = false;
      camFitCells(cells, 2.0); },
    // playtest 16: the bake-off flips to centre stage BEFORE building its panel, so panel()'s
    // height measurement runs under centre CSS rather than the outgoing radial prompt's (see
    // enterCenterStage's own note for the clipped-to-nothing failure this prevents)
    stageCenterNow: () => { if (S.active) enterCenterStage(); },
    // playtest 19: panel() calls this at the end of every prompt render, so a new prompt is styled
    // and placed in the SAME frame it was built instead of waiting for the next tick — which, in
    // the slow gear, is up to 125ms away. That window is what made the recipe cards flash at 110px
    // before settling to 163.5px. promptTick is idempotent and already runs every frame, so this
    // is the same work a beat earlier, not extra work.
    syncPrompt: () => { maybeBuildStage(); if (S.active) promptTick(); },
    settled: stageSettled,
  };
  recipeGuard();
  sweepGuard();   // playtest 20: the trade-wind ride preview
  // playtest 18: Pass & Play sails again — the refit note comes off and the card is live.
  // (The shipyard greying was this block; the whole hand-off/privacy flow ships in
  // lobby.js/flow.js/board.js and the /4 stage sweep landed with it.)
  tick();
}
