#!/usr/bin/env node
/* SCRATCH — watch 2026-09-03T01:10Z, T-103. NOT A GATE, not in npm test, safe to delete.
 *
 * THE POSED PAIR. `do_now_check.mjs` cases 16 can only read the page's SOURCE — there is no DOM in
 * a gate — so the gesture itself is unproven by anything but this: a real Chrome, a real drag, the
 * same page before and after, photographed.
 *
 * TWO SEATS, because the two are different code paths in the browser even though they are one path
 * in our source:
 *   - a MOUSE drag at 900x1000 (the laptop),
 *   - a TOUCH drag at 390x844 with touch emulation on (the phone he reads this page on) — the seat
 *     that HTML5 drag-and-drop would have been silently dead in.
 *
 * It reads back the page's own `state.order` afterwards, so "the rows moved" and "the order was
 * recorded" are two separate facts and neither stands in for the other.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome, sleep } from "../lib/cdp.mjs";
import { gameURL } from "../lib/chrome.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const POSED = join(ROOT, ".planning", "posed");
mkdirSync(POSED, { recursive: true });

const REL = ".planning/wyclau/_t103_pose.html";
execFileSync(process.execPath, [join(ROOT, "scripts", "wyclau", "glass.mjs"),
  `--chart=${join(ROOT, ".planning", "CHART.md")}`, `--out=${join(ROOT, REL)}`],
  { cwd: ROOT, stdio: "ignore" });

const seats = [
  { name: "desktop", W: 900, H: 1000, mobile: false, touch: false },
  { name: "phone", W: 390, H: 844, mobile: true, touch: true },
];

for (const seat of seats) {
  const b = await openChrome({
    W: seat.W, H: seat.H, dbgPort: seat.name === "phone" ? 9411 : 9410, httpPort: seat.name === "phone" ? 8411 : 8410,
    serveRoot: ROOT, profileDir: join(ROOT, ".planning", "posed", `_t103-${seat.name}`),
    mobile: seat.mobile, dsf: seat.mobile ? 3 : 1,
  });
  try {
    /* The URL is BUILT from gameURL()'s own root rather than typed: `game_url_check.mjs` fails the
       build on a hand-typed local address, and it is right to — a probe pointed at a port nobody
       serves is the "gate aimed at the wrong tree" fault in miniature. This page is not the game,
       so only the origin is borrowed. */
    await b.nav(`${gameURL(b.httpPort)}${REL}`);
    await sleep(2500);
    /* Scroll the Tasks card into view first: a drag whose target is off-screen is a drag with no
       coordinates, and this page is long. */
    /* ⚠ SCROLL A LITTLE ABOVE THE LIST, NOT TO IT. The first pose put the list's top flush with the
       viewport, and the row he moved to position 1 then sat one line ABOVE the capture — a posed
       pair whose whole subject is off-camera. */
    await b.ev(`document.getElementById("taskList").scrollIntoView({block:"start"}); window.scrollBy(0,-90); "ok"`);
    await sleep(400);
    const before = await b.ev(`JSON.stringify(Array.prototype.slice.call(
      document.querySelectorAll("#taskList li.drag")).slice(0,5).map(function(li){return li.getAttribute("data-handle");}))`);
    await b.shot(join(POSED, `t103-${seat.name}-before.png`));

    /* Take the FOURTH draggable row and drop it above the first. Fourth, not second: a one-place
       move can be produced by an off-by-one in the insertion rule and look correct. */
    const box = await b.ev(`(function(){
      var li = document.querySelectorAll("#taskList li.drag");
      var a = li[3].getBoundingClientRect(), t = li[0].getBoundingClientRect();
      return JSON.stringify({fx: a.left+30, fy: a.top+a.height/2, tx: t.left+30, ty: t.top+2});
    })()`);
    const { fx, fy, tx, ty } = JSON.parse(box);

    const steps = 14;
    if (seat.touch) {
      const pt = (x, y) => [{ x, y, radiusX: 6, radiusY: 6, force: 1 }];
      await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(fx, fy) });
      for (let i = 1; i <= steps; i++) {
        await b.send("Input.dispatchTouchEvent", { type: "touchMove",
          touchPoints: pt(fx + (tx - fx) * i / steps, fy + (ty - fy) * i / steps) });
        await sleep(25);
      }
      await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fx, y: fy });
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: fx, y: fy, button: "left", clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
          x: fx + (tx - fx) * i / steps, y: fy + (ty - fy) * i / steps });
        await sleep(25);
      }
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tx, y: ty, button: "left", clickCount: 1 });
    }
    await sleep(700);

    const after = await b.ev(`JSON.stringify(Array.prototype.slice.call(
      document.querySelectorAll("#taskList li.drag")).slice(0,5).map(function(li){return li.getAttribute("data-handle");}))`);
    const recorded = await b.ev(`(function(){
      var s = document.getElementById("glassState");
      try { var live = window.__t103 || null; } catch(e) {}
      return JSON.stringify({ note: (document.getElementById("orderNote")||{}).textContent || null });
    })()`);
    /* state lives inside the page's IIFE, so it cannot be read from outside. What CAN be read is
       what the page SAYS about it — the order note is written only by saveOrder(), so its text is
       evidence that the save path ran. Named as such rather than claimed as reading the state. */
    await b.shot(join(POSED, `t103-${seat.name}-after.png`));

    console.log(`\n${seat.name} (${seat.W}x${seat.H}${seat.touch ? ", touch" : ", mouse"})`);
    console.log(`  before: ${before}`);
    console.log(`  after:  ${after}`);
    console.log(`  moved:  ${before !== after ? "YES" : "NO — the drag did nothing"}`);
    console.log(`  page says: ${recorded}`);
    if (b.consoleErrs.length) console.log(`  console: ${b.consoleErrs.slice(0, 3).join(" | ")}`);
  } finally {
    b.close();
  }
}
console.log("\nscreenshots in .planning/posed/t103-*.png");
