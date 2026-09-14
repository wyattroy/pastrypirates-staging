/* ══ THE INGREDIENTS POP ONTO THE ISLANDS ════════════════════════════════════════════════════════════════════════════
   Wyatt, 2026-09-13: "at the beginning of the game, "pop in" the ingredients on each of the islands in an animation that
   lasts until the recipe picker cards appear. Don't draw the dotted line UNTIL the recipe cards appear. this will draw
   user's attention to the most important thing about the game -- the ingredients -- on a crowded board. it'll also solve
   the problem that the recipe picker cards feel laggy only because i intentionally asked them to appear after a few
   seconds... this should feel juicy and fun and bouncy and "candy crush" like".

   HIS SETTINGS, dialled on the pop-in tuner and read back off it (second round, 2026-09-13 — DECISIONS.md):
     order: island by island, clockwise round the board
     board alone 300ms · gap between islands 0ms · gap between crates 105ms · pop 550ms · cards 300ms after the last pop
     start size 17% · overshoot 160% · bounces 3 · squash 34% · wobble 8° · drop 4% · sparkles 6, sparkle burst on
     sound: cork pop, starting pitch 1 st, climbing 1 st a pop, stops climbing after 18 pops, volume 55%
   and his two corrections the same night: "can you verify that each ingredient appears sequentially?" — so the next
   island waits one crate gap after the last island's last crate — and "make the sound play when the ingredient appears
   -- not when the sparkle appears".

   HOW IT HANGS TOGETHER
     · board.js draws every crate as it always has, but HIDDEN while this voyage's pop-in has not played (popInHolds()).
     · The recipe picker's show (stage.js rcFlightRun) calls startPopIn() where it used to wait two seconds, and waits
       exactly as long as the pops take instead — so "the cards arrive after the last pop" is one number, not two.
     · Every screen runs its own show from its own picker, host and guest alike; nothing crosses the wire.
     · If the draft is over and this screen never showed a picker (a voyage of bots, a guest who joined late, a reload),
       releasePopIn() simply shows the crates — nothing can leave an island empty.
   HTML IN A CAMERA LAYER (#popHost, in stage.js's CAM_HTML_LAYERS), transform and opacity only — docs/BOARD-RENDERING.md
   §5: Chrome cannot composite an SVG transform animation. Each pop hands its crate back to the board's own SVG the
   instant it lands, so after the show nothing of this remains on the board. */
import { appState } from "../state/index.js";
import { playPop } from "./audio.js";

export const POP_LEAD_MS        = 300;    // the board alone, before the first crate
export const POP_ISLAND_GAP_MS  = 0;      // extra wait between one island and the next
export const POP_CRATE_GAP_MS   = 105;    // one crate to the next
export const POP_MS             = 550;    // one pop, start to settle
export const POP_CARDS_AFTER_MS = 300;    // the recipe cards, after the last pop lands
export const POP_FROM           = 0.17;   // start size
export const POP_OVER           = 1.60;   // overshoot
export const POP_BOUNCES        = 3;
export const POP_SQUASH         = 0.34;
export const POP_WOBBLE_DEG     = 8;
export const POP_DROP           = 0.04;   // of the crate's height, dropped in from above
export const POP_SPARKS         = 6;
export const POP_RISE_STEP      = 1;      // semitones higher, each pop
export const POP_RISE_CAP       = 18;     // pops before the climb stops
/* His sparkle was 10px on a 19.09px crate, on the phone board he tuned on — kept as that proportion, so it is the
   same sparkle at every board size and zoom. */
const SPARK_OF_CRATE = 10 / 19.09;
const BOARD_UNITS = 640;                  // the board's viewBox: 640 units == 100cqw (BOARD-RENDERING §2)
const CQ = v => (v / BOARD_UNITS * 100) + "cqw";
const $ = id => document.getElementById(id);
/* A sparkle's scatter is the same on every screen: seeded by the crate, never Math.random (course.js's rnd1). */
const rnd = s => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };

let voyage = null;       // which voyage this state belongs to
let state = "idle";      // idle → held → playing → done
let timers = [], endsAt = 0;

function thisVoyage(){
  const g = appState.game;
  if (!g) return false;
  const key = g.seed != null ? g.seed : g;
  if (voyage !== key){ voyage = key; state = "idle"; timers.forEach(clearTimeout); timers = []; }
  return true;
}
const later = (fn, ms) => { const v = voyage; timers.push(setTimeout(() => { if (voyage === v) fn(); }, ms)); };
const drawnCrates = () => [...document.querySelectorAll('#board g[id^="crate_"]')];
/* VISIBILITY, never opacity — render() owns a crate's opacity (a taken crate greys to .45) and rewrites it every render. */
const showCrate = id => { const g = document.getElementById(id); if (g) g.style.visibility = ""; };
function showAll(){
  drawnCrates().forEach(g => { g.style.visibility = ""; });
  const host = $("popHost"); if (host) host.textContent = "";
}

/** Should board.js draw this voyage's crates hidden? True from the voyage's first draw until its pop-in lands. */
export function popInHolds(){
  if (!thisVoyage()) return false;
  if (state === "idle"){
    const g = appState.game;
    state = (Array.isArray(g.events) && g.events.some(e => e && e.t === "recipeSet")) ? "done" : "held";
  }
  return state === "held" || state === "playing";
}

/** The draft ended with no show on this screen: just show the crates. Safe to call every frame. */
export function releasePopIn(){
  if (!thisVoyage() || state !== "held") return;
  state = "done";
  showAll();
}

/* The order — his "island by island, clockwise round the board", starting at twelve o'clock — and when each crate
   starts, in ms after the first. Read off what board.js DREW (data-cx/cy/size on each crate), never re-derived. */
function schedule(list){
  const crates = list.map(g => {
    const img = g.querySelector("image");
    return { id: g.id, ing: g.dataset.ing, idx: +g.dataset.idx, cx: +g.dataset.cx, cy: +g.dataset.cy, size: +g.dataset.size,
      href: img ? img.getAttribute("href") : null };
  });
  const mid = BOARD_UNITS / 2, avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const islands = [...new Set(crates.map(c => c.ing))].map(ing => {
    const cs = crates.filter(c => c.ing === ing).sort((a, b) => a.idx - b.idx);
    let ang = Math.atan2(avg(cs.map(c => c.cy)) - mid, avg(cs.map(c => c.cx)) - mid) + Math.PI / 2;
    if (ang < 0) ang += 2 * Math.PI;
    return { cs, ang };
  }).sort((a, b) => a.ang - b.ang);
  /* ONE CRATE AT A TIME, ALWAYS: the next island starts a full crate gap after this island's last crate. */
  const out = [];
  let t = 0;
  for (const s of islands){
    s.cs.forEach((c, k) => out.push(Object.assign(c, { at: t + k * POP_CRATE_GAP_MS })));
    t += s.cs.length * POP_CRATE_GAP_MS + POP_ISLAND_GAP_MS;
  }
  return out;
}

function keyframes(h){
  const f = POP_FROM, o = POP_OVER, sq = POP_SQUASH, w = POP_WOBBLE_DEG, drop = POP_DROP * h;
  const K = [
    { offset: 0,   opacity: 0, transform: `translateY(${-drop}px) rotate(${-w}deg) scale(${f},${f})` },
    { offset: .38, opacity: 1, transform: `translateY(0px) rotate(${w * .6}deg) scale(${o * (1 - sq * .5)},${o * (1 + sq * .5)})` },
    { offset: .58,             transform: `translateY(0px) rotate(${-w * .3}deg) scale(${1 + sq},${1 - sq})` },
  ];
  if (POP_BOUNCES >= 2) K.push({ offset: .76, transform: `translateY(0px) rotate(${w * .15}deg) scale(${1 + (o - 1) * .35},${1 + (o - 1) * .35})` });
  if (POP_BOUNCES >= 3) K.push({ offset: .88, transform: `translateY(0px) rotate(0deg) scale(${1 - (o - 1) * .12},${1 + (o - 1) * .12})` });
  K.push({ offset: 1, opacity: 1, transform: "translateY(0px) rotate(0deg) scale(1,1)" });
  return K;
}

function sparkle(host, c, px, n){
  const s = c.size * SPARK_OF_CRATE;
  for (let k = 0; k < POP_SPARKS; k++){
    const sp = document.createElement("div");
    sp.className = "ppSpark";
    sp.style.left = CQ(c.cx - s / 2); sp.style.top = CQ(c.cy - s / 2);
    sp.style.width = sp.style.height = CQ(s);
    host.appendChild(sp);
    const a = (k / POP_SPARKS) * Math.PI * 2 + rnd(n * 7 + k) * .5, r = px * (.55 + rnd(n * 13 + k) * .45), sc = .6 + rnd(n * 17 + k) * .7;
    const an = sp.animate([
      { opacity: 0, transform: "translate(0,0) scale(.2)" },
      { opacity: 1, transform: `translate(${Math.cos(a) * r * .5}px,${Math.sin(a) * r * .5}px) scale(${sc})`, offset: .35 },
      { opacity: 0, transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) scale(.1) rotate(90deg)` },
    ], { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" });
    an.onfinish = () => sp.remove();
  }
}

/** Play this voyage's pop-in if its crates are waiting for it. Returns how long until the recipe cards may arrive (ms),
 *  or null when there is nothing to wait for. Called again while it plays, it returns the time still left. */
export function startPopIn(){
  if (!thisVoyage()) return null;
  if (state === "playing") return Math.max(0, endsAt - performance.now()) + POP_CARDS_AFTER_MS;
  if (state !== "held") return null;
  const host = $("popHost"), list = drawnCrates();
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!host || !list.length || reduced){ releasePopIn(); return null; }
  state = "playing";
  const order = schedule(list);
  order.forEach((c, n) => {
    const at = POP_LEAD_MS + c.at;
    if (!c.href){ later(() => showCrate(c.id), at); return; }     // its picture failed to load: nothing to pop
    const el = document.createElement("div");
    el.className = "ppPop";
    el.dataset.crate = c.id;
    el.style.left = CQ(c.cx - c.size / 2); el.style.top = CQ(c.cy - c.size / 2);
    el.style.width = el.style.height = CQ(c.size);
    const img = document.createElement("img");
    img.src = c.href; img.alt = "";
    el.appendChild(img);
    host.appendChild(el);
    const an = el.animate(keyframes(el.offsetHeight), { duration: POP_MS, delay: at, easing: "cubic-bezier(.25,.8,.35,1)", fill: "both" });
    /* ON THE ANIMATION'S OWN CLOCK. An animation starts on the NEXT frame, not when animate() is called, so timers set
       beside it ran a frame or two ahead of what the eye sees — measured ~30ms early at his phone size. Once it has
       started (`ready`), every beat is set from its real start time, so the sound lands with the crate. */
    const beats = lag => {
      later(() => playPop(Math.min(n, POP_RISE_CAP) * POP_RISE_STEP), Math.max(0, at - lag));   // the sound is the crate ARRIVING
      later(() => sparkle(host, c, el.offsetWidth, n), Math.max(0, at + POP_MS * .36 - lag));     // the sparkle is its landing
      later(() => { showCrate(c.id); el.remove(); }, Math.max(0, at + POP_MS - lag));             // the board's own crate takes over
    };
    if (an.ready && document.timeline) an.ready.then(() => beats(Math.max(0, document.timeline.currentTime - an.startTime))).catch(() => {});
    else beats(0);
  });
  const last = POP_LEAD_MS + (order.length ? order[order.length - 1].at : 0) + POP_MS;
  endsAt = performance.now() + last;
  later(() => { state = "done"; showAll(); }, last + 40);
  return last + POP_CARDS_AFTER_MS;
}
