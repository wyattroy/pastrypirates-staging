/* THE PICKER'S FLIGHT, FILMED — and measured with an AREA test, not a vertical one.
 *
 *   node scripts/qa/_picker_flight_shots.mjs
 *
 * Wyatt, 2026-09-09: "the recipe cards appear over the very middle of the board, then swap
 * themselves ONCE ... then after about 0.5 seconds they move up to the top right of the board to
 * reveal most of the gameboard with the dotted line map fully visible; and there should be a small
 * cream box above them that explains '{player}, pick which recipe you want to bake'"
 *
 * ⚠ WHY THIS PROBE FILMS INSTEAD OF POSING. Every other picker probe here poses a still, which is
 * right when the question is "is this drawn wrong?". This ask is a TIMELINE — land, swap, wait,
 * fly — and a still cannot fail it. So it captures frames through the whole show and writes an mp4.
 *
 * ⚠ AND WHY THE OVERLAP TEST IS AN AREA. Its predecessor (_recipe_stack_shots.mjs) asked
 * `front.b > captains.t` — a VERTICAL-ONLY test — and answered "overlaps the captains box: true"
 * for a sheet that left 366px of a 768px box showing on either side. It reported a false pass to
 * Wyatt and a CEO review caught it. Any question of the form "does A cover B" is answered here by
 * intersecting rects and dividing by B's area, never by comparing one edge.
 *
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(REPO, ".planning", "posed", "flight");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const PORT = 8700 + (process.pid % 120);
const DBG  = 9700 + (process.pid % 120);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-flight-${process.pid}`));
const C = await attach(DBG);

const SIZES = [
  { name: "phone",   w: 390,  h: 844,  mobile: true  },
  { name: "tablet",  w: 768,  h: 1024, mobile: false },
  { name: "desktop", w: 1280, h: 900,  mobile: false },
];

const metrics = (s) => C.send("Emulation.setDeviceMetricsOverride",
  { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.mobile });
const grab = async (file) => {
  const r = await C.send("Page.captureScreenshot", { format: "png" });
  if (!r.result?.data) return false;
  fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
  return true;
};
const waitFor = async (expr, ms = 20000, label = expr) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await C.ev(expr)) return true; } catch {} await sleep(200); }
  throw new Error("timed out waiting for: " + label);
};
const clickBtn = async (rx) => C.ev(`(()=>{
  const bs=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>!/back|←|‹/i.test(b.textContent));
  const b=bs.find(x=>${rx}.test(x.textContent)); if(!b) return false; b.click(); return true; })()`);

/* WHAT THE PICTURE CANNOT SAY: where the sheet is against the DRAWN board, how much of that board
   it hides, and whether the dotted course is actually reachable by the eye. */
const MEASURE = `JSON.stringify((()=>{
  const R=e=>{ if(!e) return null; const r=e.getBoundingClientRect();
    return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
            r:Math.round(r.right),b:Math.round(r.bottom)}; };
  /* ⭐ THE AREA TEST. Intersect, divide by the TARGET's area. A vertical edge comparison is what
     produced a false "covered" verdict on a sheet leaving 48% of the box showing. */
  const coverFrac=(a,b)=>{ if(!a||!b||!b.w||!b.h) return null;
    const ox=Math.max(0,Math.min(a.r,b.r)-Math.max(a.l,b.l));
    const oy=Math.max(0,Math.min(a.b,b.b)-Math.max(a.t,b.t));
    return +((ox*oy)/(b.w*b.h)).toFixed(3); };
  const box=document.getElementById('pp4Prompt');
  const brd=document.getElementById('board');
  const ask=document.querySelector('.pp4RcAsk');
  const row=[...document.querySelectorAll('#actionPanel .apBtns')].find(x=>x.querySelector('.recipeList'));
  const cards=row?[...row.querySelectorAll('.apBtn')].filter(b=>b.querySelector('.recipeList')):[];
  const front=cards.find(c=>c.dataset.rcpos==='front')||cards[0];
  /* THE DOTTED COURSE ITSELF — not a proxy for it. Every drawn course node's rect, and how many of
     them the sheet is sitting on. "the dotted line map fully visible" is a number, and this is it. */
  const dots=[...document.querySelectorAll('.pp4Course circle, .pp4Course path, .pp4CourseMark')].map(R).filter(Boolean);
  const bx=R(box), bd=R(brd);
  let dotsHidden=0;
  if(bx) for(const d of dots){ if(!(d.r<bx.l||d.l>bx.r||d.b<bx.t||d.t>bx.b)) dotsHidden++; }
  return {vw:innerWidth, vh:innerHeight,
    box:bx, board:bd, captains:R(document.getElementById('pp4Cap')), panel:R(document.getElementById('actionPanel')),
    ask:R(ask), askText:(ask?ask.textContent:null),
    front:R(front), frontTitle:(front?(front.querySelector('.recipeTitle')||{}).textContent:null),
    transform:(box?box.style.transform:null)||'(none)',
    boardHiddenFrac: coverFrac(bx,bd),
    captainsCoveredFrac: coverFrac(bx,R(document.getElementById('pp4Cap'))),
    courseDots: dots.length, courseDotsUnderSheet: dotsHidden };
})())`;

const say = (s) => console.log(s);
const report = {};

try {
  await metrics(SIZES[0]);
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
  await sleep(2200);
  await C.ev(`localStorage.clear()`);
  await C.ev(`location.reload()`).catch(() => {});
  await sleep(2500);
  await C.ev(`document.getElementById('choiceSolo').click()`);
  await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000, "the name modal");
  await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await C.ev(`document.getElementById('btnNameConfirm').click()`);
  await waitFor(`!!(window.__pp_app_state_debug&&__pp_app_state_debug().game&&__pp_app_state_debug().game.players.some(p=>p.strategy==='human'))`, 25000, "a solo game");
  await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`, 20000, "the Ahoy card");
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b){b.click();return true}return false})()`);
  await sleep(900);

  for (const s of SIZES) {
    await metrics(s);
    await sleep(700);
    /* ⭐ THE FLIGHT IS ARMED ONCE PER PICKER, so it cannot be re-watched by resizing — the picker
       has to be BORN at this size. Reloading into a fresh solo game per size is the only honest way
       to film three flights, and it is also what a real captain gets. */
    if (s !== SIZES[0]) {
      await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{});
      await sleep(2600);
      await C.ev(`document.getElementById('choiceSolo').click()`);
      await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`, 15000, "the name modal");
      await C.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
      await C.ev(`document.getElementById('btnNameConfirm').click()`);
      await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`, 25000, "the Ahoy card");
      await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b){b.click();return true}return false})()`);
      await sleep(900);
    }
    /* Start filming BEFORE the tap that raises the picker, so frame 0 is the board with no sheet on
       it — the "before" half of the comparison, in the same film. */
    const dir = path.join(OUT, s.name);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0, fired = false;
    const t0 = Date.now();
    const marks = [];
    while (Date.now() - t0 < 3600) {
      await grab(path.join(dir, `f${String(n).padStart(3, "0")}.png`));
      if (!fired && Date.now() - t0 > 260) { await clickBtn("/start/i"); fired = true; }
      const m = JSON.parse(await C.ev(MEASURE));
      marks.push({ t: Date.now() - t0, frame: n, box: m.box, tf: m.transform, front: m.frontTitle });
      n++;
    }
    const m = JSON.parse(await C.ev(MEASURE));
    report[s.name] = { parked: m, marks };
    await grab(path.join(OUT, `parked-${s.name}.png`));

    say(`\n── ${s.name} (${s.w}x${s.h}) ─────────────────────────────`);
    say(`   drawn board      ${JSON.stringify(m.board)}`);
    say(`   sheet, PARKED    ${JSON.stringify(m.box)}   transform=${m.transform}`);
    say(`   cream ask box    ${JSON.stringify(m.ask)}`);
    say(`   its words        ${JSON.stringify(m.askText)}`);
    if (m.box && m.board) {
      say(`   parked at the board's TOP RIGHT?  right edge gap ${m.board.r - m.box.r}px, top gap ${m.box.t - m.board.t}px`);
    }
    say(`   how much of the BOARD the sheet hides : ${(m.boardHiddenFrac*100).toFixed(1)}%   (he wants "most of the gameboard" revealed)`);
    say(`   how much of the CAPTAINS box it covers: ${m.captainsCoveredFrac==null?'n/a':(m.captainsCoveredFrac*100).toFixed(1)+'%'}   (AREA, not one edge)`);
    say(`   dotted course nodes on the board      : ${m.courseDots}, of which UNDER the sheet: ${m.courseDotsUnderSheet}`);
    say(`   frames filmed: ${n} over ${((Date.now()-t0)/1000).toFixed(1)}s -> ${dir}`);

    // the film
    const mp4 = path.join(OUT, `flight-${s.name}.mp4`);
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(Math.max(6, Math.round(n / 3.6))),
        "-i", path.join(dir, "f%03d.png"), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
      say(`   film -> ${mp4}`);
    } catch (e) { say(`   ffmpeg failed: ${String(e.message).slice(0,200)}`); }
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  say(`\nshots + films -> ${OUT}`);
} catch (e) {
  console.log("PROBE FAILED:", e.message, e.stack);
} finally {
  killAll();
}
