/* ══ EVERY BUTTON SQUISHES WHEN IT IS PRESSED ══════════════════════════════════════════════════════════════════════════
   PASSED on his game feel audit (2026-09-13), exactly as proposed there: "Press: the button shrinks to 95%; release: it
   springs to 103% and back. One rule for every button in the game, so tapping always feels physical."

   ONE LISTENER FOR THE WHOLE DOCUMENT, so a button drawn tomorrow squishes without anyone remembering to wire it — the
   same reason every word lives in one file.
   THE `scale` PROPERTY, NEVER `transform`: plenty of buttons are placed or moved by a transform (the radial circles,
   the recipe cards' flight and swap, the swap arrow's own :active), and `scale` composes on top of an element's
   transform instead of replacing it, so a squish can never knock a button out of its place. */
export const PRESS_DOWN = 0.95;      // pressed
export const PRESS_OVER = 1.03;      // the spring past full size on release
export const PRESS_DOWN_MS = 90;
export const PRESS_UP_MS = 260;

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const buttonAt = e => (e.target && e.target.closest) ? e.target.closest("button, .apBtn") : null;

export function wirePressSquish(doc){
  doc = doc || (typeof document !== "undefined" ? document : null);
  if (!doc || doc.__pressSquish) return;
  doc.__pressSquish = true;
  let pressed = null, down = null;
  doc.addEventListener("pointerdown", e => {
    const b = buttonAt(e);
    if (!b || typeof b.animate !== "function" || reduced()) return;
    if (down) { try { down.cancel(); } catch (x) {} }
    pressed = b;
    down = b.animate([{ scale: "1" }, { scale: String(PRESS_DOWN) }], { duration: PRESS_DOWN_MS, easing: "ease-out", fill: "forwards" });
  }, true);
  /* The button that was PRESSED springs back, wherever the finger comes off — a drag off the button still releases it. */
  const release = () => {
    const b = pressed, d = down;
    pressed = null; down = null;
    if (!b) return;
    if (d) { try { d.cancel(); } catch (x) {} }
    if (!b.isConnected) return;        // its own tap replaced it: nothing left to spring
    b.animate([{ scale: String(PRESS_DOWN) }, { scale: String(PRESS_OVER), offset: .45 }, { scale: "1" }],
      { duration: PRESS_UP_MS, easing: "ease-out" });
  };
  doc.addEventListener("pointerup", release, true);
  doc.addEventListener("pointercancel", release, true);
}
