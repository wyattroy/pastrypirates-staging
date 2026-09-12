/* ══ THE TINY COIN OVER SOMEBODY ELSE'S BOAT ══════════════════════════════════════════════════════
   W3-7. Wyatt asked for this on 2026-09-10: "a tiny coin flip above OTHER captains' boats when they
   dock, in time with the sound", and then tuned every number of it himself in an artifact of
   sliders. HIS SETTINGS, read back off that tuner and recorded in .claude/memory/DECISIONS.md:

     16px at 1x zoom, and it grows with the camera      ·  11px above the boat, no sideways nudge
     ARRIVES by rising off the boat in 40ms, with the sound
     FLIPS at 6 a second with a 21px toss               ·  LANDS on the blip at 795ms
     landing bounce 22%   ·   glow 6px   ·   shadow 13%
     HOLDS its face 800ms ·   LEAVES by fading in 140ms

   WHY THIS REPLACES THE BIG COIN FOR EVERYONE BUT YOU. The flippenator — the coin that takes over
   the bottom of the screen — is YOUR flip: you tapped Dock, and the game stops to ask heads or
   tails. A bot's dock is not a question being put to you, and until now it borrowed the same stage,
   so four captains docking in a row took the screen four times over something you had no say in.
   The tiny coin says the same thing where the thing is happening: over their boat.

   ⛔ THE TRAP HE NAMED BEFORE ANYONE COULD FALL INTO IT, 2026-09-12: "the narration box comes up
   immediately after the sound of the coin flipping. And instead, you'll need to have that narration
   box showing the result of the coin flip wait until the coin flip is over." So `flipDockCoin()`
   RESOLVES WHEN THE COIN IS DONE — landing plus his 800ms hold — and its one caller awaits it
   before it narrates a word. The flip is the question and the narration is the answer; an answer
   that lands first makes the animation decoration.

   ONE CLOCK, STILL. The spin is FLIP_SPIN_MS (795 — the frame the sound's landing blip peaks) and
   the hold is FLIP_LAND_HOLD_MS (800), the same two constants every other flip in the game waits
   out, so item 18's ruling ("all flips should last the same amount of time") survives this change
   by construction rather than by two numbers that happen to agree today.

   IT IS HTML IN A CAMERA LAYER, NOT SVG. #dockCoinHost is registered in stage.js's CAM_HTML_LAYERS,
   which is what makes the coin ride the director's zoom — and why "grows with the camera" costs
   nothing to honour. It is HTML for the reason every animated thing on this board is HTML: Chrome
   cannot composite an SVG transform animation at all (index.html's #sailHost note carries the
   measurement, 62 layouts/sec as SVG against zero as HTML), and this one spins and bobs for a
   second and a half at a time. */
import { boardCell, boardShipEls, FLIP_SPIN_MS, FLIP_LAND_HOLD_MS } from "./board.js";
/* THE SAME TWO CALLS THE BIG COIN MAKES, so "in time with the sound" is one fact, not two that
   have to be kept in step: start re-fires the sample for as long as the coin turns, and stop only
   cancels the RE-FIRE — the sample already playing runs on, which is what lets the landing blip at
   795ms be heard under a coin that has just landed. */
import { startFlipSpinSound, stopFlipSpinSound } from "./audio.js";
import { COIN_SPIN_IMG, FLIP_HEADS_IMG, FLIP_TAILS_IMG } from "../shared/index.js";
const $ = id => document.getElementById(id);   // the same one-liner every module in this folder keeps

/* HIS NUMBERS, ONCE, BY NAME. They are screen pixels at 1x zoom — the camera's own transform is
   what turns them into "grows with the camera", so nothing here has to know the zoom. */
export const DC_SIZE_PX     = 16;    // the coin, at 1x
export const DC_ABOVE_PX    = 11;    // above the boat's top edge
export const DC_RISE_MS     = 40;    // arrives by rising off the boat
export const DC_FLIPS_PER_S = 6;     // turns over six times a second
export const DC_TOSS_PX     = 21;    // how high each turn throws it
export const DC_BOUNCE      = 0.22;  // the squash it lands with
export const DC_GLOW_PX     = 6;
export const DC_SHADOW      = 0.13;
export const DC_FADE_MS     = 140;   // leaves by fading

const plainSleep = ms => new Promise(r => setTimeout(r, ms));

/* WHERE THE BOAT IS, IN BOARD UNITS. board.js seats each ship with an inline
   `transform: translate(Xpx, Ypx)` in the SVG's own user space, so reading it back is one regex and
   needs no second copy of shipXY's offsetting arithmetic (which is the thing that would drift). */
function boatPoint(seat){
  const els = boardShipEls();
  const g = els && els[seat];
  if (!g) return null;
  const m = /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/.exec(g.style.transform || "");
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

export function clearDockCoins(){
  const host = $("dockCoinHost");
  if (host) host.innerHTML = "";
}

/* Draw one, spin it, land it on the face the ENGINE already recorded, hold it, fade it.
   Draws no randomness of its own — the flip happened in the engine long before this ran — so a
   replay after a reload is untouched by it. */
/* THE CALLER LENDS ITS OWN `sleep`, and that is not decoration: src/ui/flow.js's sleep is the
   replay-aware one, so a reload fast-forwards straight through a coin instead of sitting out two
   real seconds per dock for every dock of the voyage. A bare setTimeout here would have quietly
   made a reloaded game crawl — the same trap flipSpinLeftMs's own note describes. */
export async function flipDockCoin(seat, heads, sleepFn){
  const sleep = sleepFn || plainSleep;
  const host = $("dockCoinHost");
  const pt = boatPoint(seat);
  const cell = boardCell();
  /* NO BOAT, NO HOST, NO COIN — and the caller still gets its wait, so the game's pacing is the
     same whether the coin could be drawn or not. A flip that silently took less time than every
     other flip is exactly the fault item 18 was raised about. */
  if (!host || !pt || !cell) { await sleep(FLIP_SPIN_MS + FLIP_LAND_HOLD_MS); return; }

  const CQ = v => (v / 640 * 100) + "cqw";
  const el = document.createElement("div");
  el.className = "dcoin";
  el.style.left = CQ(pt[0]);
  el.style.top  = CQ(pt[1] - cell / 2);          // the boat's TOP edge; the rise happens from there
  /* ⚠ ONE ELEMENT WITH A BACKGROUND, WHICH IS EXACTLY WHAT THE BIG COIN DOES — and the first
     version of this did something cleverer and rendered NOTHING. It stacked the two faces back to
     back on a `transform-style: preserve-3d` card with `backface-visibility: hidden`, which measured
     perfectly (right place, right size, images decoded, opacity 1) and photographed as bare sea:
     the coin was in the DOM and not on the screen. index.html's `.coin.spin` has spun a single
     background-image through `rotateX(0..360)` since the flippenator was built, so this borrows the
     proven thing rather than inventing a second one. A measurement that cannot see the difference
     between drawn and not-drawn is why the screenshot is taken. */
  el.innerHTML = '<div class="dcoinRise"><div class="dcoinToss"><div class="dcoinSpin"></div></div></div>';
  const spinEl = el.querySelector(".dcoinSpin");
  spinEl.style.backgroundImage = `url(${COIN_SPIN_IMG})`;
  host.appendChild(el);
  startFlipSpinSound();

  await sleep(FLIP_SPIN_MS);

  /* THE LANDING. Stop the spin exactly where the face should be, then let the bounce play. The two
     faces are back to back on one 3D card, so "which face" is just which way the card is turned —
     there is no second image to swap in and no frame where neither is showing. */
  stopFlipSpinSound();
  const spin = spinEl;
  const toss = el.querySelector(".dcoinToss");
  if (spin){ spin.style.animation = "none"; spin.style.transform = "none";
    spin.style.backgroundImage = `url(${heads ? FLIP_HEADS_IMG : FLIP_TAILS_IMG})`; }
  if (toss){ toss.style.animation = "dcoinLand 220ms cubic-bezier(.2,1.6,.4,1) 1 both"; }
  el.classList.add("dcoinLanded");

  await sleep(FLIP_LAND_HOLD_MS);

  el.classList.add("dcoinGone");
  setTimeout(() => el.remove(), DC_FADE_MS + 60);
}
