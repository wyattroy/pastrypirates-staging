// src/ui/victory.js — THE VICTORY CARD (docs/VICTORY-CARD-PRD.md). It replaces the End of Voyage card.
//
// ONE PATH ON EVERY SCREEN (architecture item 5). The engine declares the end once (Game.declareEnd) and the `end`
// event carries the whole result (`voyage`: every captain's score rows, the closeness order, flips/heads, recipes).
// The one event consumer hands that event to playVictoryBoard() on the host, every guest, solo and pass-and-play alike;
// nothing here asks who is host. Two parts, in his order ("board first, then the card", 2026-09-14):
//   1. playVictoryBoard(e) — awaited inside the consumer: the last look at the board, the crown, the podium; then it
//      sets liveDone and renders, which is what opens the card.
//   2. victoryCard()       — called by board.js showStats() on every render once the voyage is over; builds the card
//      ONCE per voyage and plays its pages (so close · the winning bake · Polly's awards · the treasure tally) and the dock.
// What differs by screen is only WHOSE pages these are: "so close" and the tally belong to this screen's own captain(s).
//
// THE NUMBERS BELOW ARE HIS, tuned on the Victory Card sheet (rounds 3 and 4). Change them there, then here.

import { appState } from "../state/index.js";
import { ASSET_BASE, BOAT_IMG, CROWN_IMG, PARROT_IMG, SPOILS_POUCH_IMG, POCKET_COMPASS_IMG, HEXCOL, ING_ALL, ING_IMG, dockPlace, iname } from "../shared/index.js";
import { say, sayText, pname, seatLocal, sleepMs, assignBadges, fixedOrigin } from "./util.js";
import { seat } from "../shared/words.js";
import { recipeInfo } from "./recipe.js";
import { playWinScreen, playLidNote, playPop, playCrateVerdict, playDrumroll, playAwardWhoosh, playCoinTick, playCardSwish } from "./audio.js";

/* ---------------- HIS TUNING ---------------- */
export const VICTORY_TUNING = {
  crown:  { dim:.45, zoom:2.05, drop:750, crownSize:1.4, shake:9, letterGap:60, letterPop:1.65, confetti:55, hold:900 },
  podium: { lift:50, rise:600, h1:65, sailGap:520 },
  bake:   { steam:true, rise:600, size:1, flyGap:140, seal:1, count:true, hold:1400 },
  awards: { drum:650, flip:440, gap:1400, shrink:500, climb:2, big:1.15, holdAll:1500, swipe:380, bob:true },
  tally:  { perRow:740, reel:550, visible:4, shake:9, best:true, hold:1200 },
  close:  { pulse:900, hold:1800 },
  dock:   { sailRise:450, countdown:5 },
};
const T = VICTORY_TUNING;

const $ = id => document.getElementById(id);
const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const anim = (el, kf, opt) => { try { return el.animate(kf, { fill: "both", easing: "cubic-bezier(.25,.8,.35,1)", ...opt }); } catch (e) { return null; } };
const mk = (parent, cls, html, style) => { const d = document.createElement("div"); if (cls) d.className = cls; if (html != null) d.innerHTML = html; if (style) Object.assign(d.style, style); parent.appendChild(d); return d; };
const store = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } },
                set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

/* the result of this voyage, whichever screen this is — the `end` event's own payload */
function voyageOf(g) {
  if (g.__voyage) return g.__voyage;
  const end = (g.events || []).slice().reverse().find(e => e.t === "end");
  if (end && end.voyage) return (g.__voyage = end.voyage);
  return (g.__voyage = typeof g.voyageSummary === "function" ? g.voyageSummary() : null);   // an old saved voyage, host-side only
}
/* whose pages these are: this screen's own human captain; on a shared pass-and-play screen, every human captain */
const isLocalHuman = s => { const p = appState.game.players[s]; if (!p) return false;
  return appState.passAndPlay ? p.strategy === "human" : seatLocal(s); };

/* ================= 1. THE BOARD: last look, crown, podium ================= */
let stageEl = null;
export async function playVictoryBoard(e, { fadeOutPanel, sweepCam, leanCam, lastLookMs, render, shipEls }) {
  ensureStyle();
  const g = appState.game;
  if (!g || !e) return;
  // every screen reads the result from the event — a guest's flips/heads/winner come from here, not from a second route
  if (e.voyage) {
    g.__voyage = e.voyage;
    (e.voyage.captains || []).forEach(c => { const p = g.players[c.seat]; if (p) { p.flips = c.flips || 0; p.heads = c.heads || 0; } });
  }
  g.winner = e.winner == null ? null : e.winner;
  if (!appState.replaying && !g.__victoryBoardPlayed) {
    g.__victoryBoardPlayed = true;
    try {
      if (fadeOutPanel) await fadeOutPanel();
      if (sweepCam) sweepCam();
      if (render) render();
      await sleepMs(lastLookMs || 0);
      await boardBeats(g, e.voyage, shipEls, leanCam, sweepCam);
    } catch (err) { console.error("victory board", err); }
  }
  appState.liveDone = true;
  playWinScreen();
  render();
}

/* ⚠ IN THE SPACE THE CEREMONY IS DRAWN IN, NOT THE WINDOW'S. .vcStage and the card are `position: fixed`, and on a desktop the page
   body carries a transform — which makes the BODY the box every fixed layer is measured from, not the viewport (util.js fixedOrigin
   has the whole story; the flip coin hit the same trap on 2026-09-16). Reading the board in window coordinates and then placing
   inside that layer double-counted the body's own offset, which is why the podium drifted off the board's centre and drifted further
   at other window sizes (measured: 26 px out at 1280, 69 px at 820). */
function boardBox() {
  const bw = $("boardwrap"), o = fixedOrigin();
  const raw = bw ? bw.getBoundingClientRect() : { left: 0, top: 44, width: innerWidth, height: innerWidth };
  const r = { left: raw.left - o.x, top: raw.top - o.y, width: raw.width, height: raw.height };
  const top = Math.max(r.top, 44), w = Math.min(r.width, innerWidth);
  // k scales the crown and podium with the board — but never so far that the podium's labels (about 267k below the board's top) reach the card below them
  const fit = (innerHeight - 310 - top - 12) / 267;
  return { x: Math.max(0, r.left), y: top, w, h: Math.min(r.height, innerHeight - top), k: Math.max(.8, Math.min(1.7, w / 375, fit)) };
}

async function boardBeats(g, v, shipEls, leanCam, sweepCam) {
  if (!v) return;
  let box = boardBox(), k = box.k;
  const win = g.winner, order = v.order || [];
  if (stageEl && stageEl.__vcStop) stageEl.__vcStop();          // the old stage's resize watchers go with it
  stageEl && stageEl.remove();
  stageEl = mk(document.body, "vcStage", null, {});
  /* ⭐ EVERY PIECE KNOWS HOW TO PLACE ITSELF, AND IS PLACED AGAIN WHENEVER THE BOARD MOVES. Wyatt, 2026-09-17: "the final voyage end
     ceremony does not seem to be centered on the screen properly WHEN the user resizes their screen -- it should be calculated every
     time the screen size changes" and "the boats on the podium should always be centered". Both are the same fault: the crown, the
     podium and the boats were placed once, in pixels, from the board's rectangle AT THAT MOMENT — so a resize, or any later layout
     shift (the card rising under them, the panel fading), left them where the board used to be. Each piece now registers HOW it is
     placed, and `replace()` runs them all against a freshly read board; a ResizeObserver on the board and the window's own resize
     both call it, so it is the board that decides, every time. */
  const placers = [];
  const place = (el, fn) => { placers.push(() => fn(el, box, box.k)); return el; };
  const replace = () => { if (!stageEl || !stageEl.isConnected) return; box = boardBox(); k = box.k; placers.forEach(f => f()); };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => replace()) : null;
  const bw0 = $("boardwrap"); if (ro && bw0) ro.observe(bw0);
  window.addEventListener("resize", replace);
  stageEl.__vcStop = () => { try { ro && ro.disconnect(); } catch (e) {} window.removeEventListener("resize", replace); };
  const dim = mk(stageEl, "vcDim");
  const skip = reduced();
  const cx = box.x + box.w / 2, heroY = box.y + 171 * k, heroSize = 64 * k;
  let hero = null, nameEl = null;

  // ---- 1. the crown comes down (only if somebody was crowned — his ruling for "nobody finished": no crown) ----
  if (win != null) {
    const c = T.crown;
    anim(dim, [{ opacity: 0 }, { opacity: c.dim }], { duration: 250 });
    // the camera leans in on the winner — the game's own camera, so the board stays inside its frame and every layer follows
    const lean = !skip && leanCam ? (leanCam(win, c.zoom), true) : false;
    hero = place(mk(stageEl, "vcHero", `<img src="${BOAT_IMG[win]}" alt="">`, { left: (cx - heroSize / 2) + "px", top: (heroY - heroSize / 2) + "px", width: heroSize + "px" }),
      (el, b2, k2) => { const size = 64 * k2; Object.assign(el.style, { left: (b2.x + b2.w / 2 - size / 2) + "px", top: (b2.y + 171 * k2 - size / 2) + "px", width: size + "px" }); });
    const cw = 38 * k * c.crownSize;
    const crown = mk(hero, "vcCrown", `<img src="${CROWN_IMG}" alt="">`, { left: (heroSize / 2 - cw / 2) + "px", top: (-cw * .62) + "px", width: cw + "px" });
    anim(hero, [{ opacity: 0, transform: "scale(.45)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300, delay: 100 });
    anim(crown, [{ transform: "translateY(-240px) scale(1.7)", opacity: 0 }, { transform: "translateY(0) scale(1.15)", opacity: 1, offset: .8 },
      { transform: "translateY(0) scale(.9,1.1)", offset: .9 }, { transform: "translateY(0) scale(1)", opacity: 1 }], { duration: skip ? 1 : c.drop, delay: 250, easing: "cubic-bezier(.5,0,.9,.6)" });
    const name = pname(win);
    nameEl = mk(stageEl, "vcName", [...name.toUpperCase()].map(ch => `<span>${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("") +
      `<div class="vcSub">${sayText("victory.winsVoyage", { w: seat(win) })}</div>`, { top: (box.y + 218 * k) + "px", fontSize: (24 * k) + "px" });
    place(nameEl, (el, b2, k2) => Object.assign(el.style, { top: (b2.y + 218 * k2) + "px", fontSize: (24 * k2) + "px" }));
    const land = 250 + c.drop;
    await sleepMs(land);
    playWinScreen();
    /* the shake moves the board and this stage — never <body>: a transform on body makes it the box every fixed layer is
       placed in, and on a phone body is 56 px tall, so the full-screen dim collapsed into a strip (Wy-Blade's crew run) */
    if (c.shake && !skip) { const kf = [0, 1, 2, 3, 4, 5].map(i => ({ translate: i === 5 ? "0 0" : `${(i % 2 ? 1 : -1) * c.shake * (1 - i / 5)}px ${(i % 2 ? -1 : 1) * c.shake * .4 * (1 - i / 5)}px` }));
      [$("boardwrap"), stageEl].forEach(el => el && anim(el, kf, { duration: 320, fill: "none", easing: "linear" })); }
    [...nameEl.querySelectorAll(":scope > span")].forEach((sp, i) => {
      anim(sp, [{ transform: "scale(0)", opacity: 0 }, { transform: `scale(${c.letterPop})`, opacity: 1, offset: .6 }, { transform: "scale(1)", opacity: 1 }], { duration: 260, delay: 220 + i * c.letterGap });
      setTimeout(() => playLidNote(Math.min(i, 7)), 220 + i * c.letterGap);
    });
    const confAt = 220 + name.length * c.letterGap;
    anim(nameEl.querySelector(".vcSub"), [{ opacity: 0 }, { opacity: .92 }], { duration: 300, delay: confAt });
    if (!skip) setTimeout(() => gravityConfetti(box, c.confetti), confAt);
    await sleepMs(confAt + 500 + c.hold);
    if (lean && sweepCam) sweepCam();   // back out to the whole board for the podium
  } else {
    anim(dim, [{ opacity: 0 }, { opacity: .55 }], { duration: 250 });
    nameEl = mk(stageEl, "vcName vcNobody", `<div class="vcSub">${sayText("victory.nobody", {})}</div>`, { top: (box.y + 18 * k) + "px", fontSize: (22 * k) + "px" });
    anim(nameEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    await sleepMs(600);
  }

  // ---- 2. the podium at Tortuga ----
  const p = T.podium, top3 = order.slice(0, 3), rest = order[3];
  const heroBottom = heroY + heroSize / 2 - p.lift * k, base = heroBottom + p.h1 * k;
  if (hero) anim(hero, [{ transform: "translateY(0)" }, { transform: `translateY(${-p.lift * k}px)` }], { duration: p.rise, fill: "forwards" });
  if (nameEl && win != null) anim(nameEl, [{ transform: "translateY(0) scale(1)" }, { transform: `translateY(${box.y + 2 * k - (box.y + 218 * k)}px) scale(.74)` }], { duration: p.rise, fill: "forwards" });
  /* THE PODIUM'S OWN GEOMETRY, from a board rectangle handed in — so the same arithmetic serves the first placement and every
     re-placement after a resize. A fourth captain stands to the RIGHT of the plate, so the three tiers are shifted half its width
     left of the board's centre: what a player sees centred is the GROUP, not the plate (his "the boats on the podium should always
     be centered"). */
  const geom = (b2, k2) => {
    const tw2 = 84 * k2, four = order[3] != null, sz4 = 36 * k2, gap4 = 10 * k2, lab4 = 58 * k2;
    let mid = b2.x + b2.w / 2 - (four ? (sz4 + gap4) / 2 : 0);
    let x4 = mid + tw2 * 1.5 + 3 * k2;
    /* IF THE FOURTH CAPTAIN WOULD FALL OFF THE WINDOW, THE WHOLE GROUP SHUFFLES LEFT — it used to be the fourth boat alone that
       was clamped, which pushed it away from the plate and left the group looking shoved right (measured: 116 px off centre in a
       narrow window). Everything moves together, or nothing does. */
    const over = (x4 + lab4) - (innerWidth - 8);
    if (four && over > 0) { mid -= over; x4 -= over; }
    const base2 = b2.y + 171 * k2 + 32 * k2 - p.lift * k2 + p.h1 * k2;
    return { k: k2, tw: tw2, mid, base: base2, hs: [p.h1, p.h1 * .66, p.h1 * .44].map(h => h * k2),
      xs: [mid - tw2 / 2, mid - tw2 * 1.5 - 1.5 * k2, mid + tw2 / 2 + 1.5 * k2], four, sz4, x4 };
  };
  const G0 = geom(box, k);
  const hs = G0.hs, tw = G0.tw;
  const tiers = [{ x: G0.xs[0], c: "#ffe6ef", s: "#f5b3c8" }, { x: G0.xs[1], c: "#f6d7b8", s: "#e9b98f" }, { x: G0.xs[2], c: "#f3e8c9", s: "#dcc58f" }];
  const pod = mk(stageEl, "vcPodium");
  anim(pod, [{ transform: `translateY(${260 * k}px)`, opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: skip ? 1 : p.rise });
  const byS = s => (v.captains || []).find(c => c.seat === s) || {};
  const shortLabel = s => { const c = byS(s); return c.baked ? sayText("victory.podium.shortOvens", {}) : sayText("victory.podium.shortSailing", { sq: c.squares || 0 }); };
  const label = s => { const c = byS(s);
    if (c.won) return sayText("victory.podium.won", {});
    if (c.baked) return sayText("victory.podium.ovens", { n: c.named || 0, size: v.size });
    return sayText("victory.podium.sailing", { n: c.crates || 0, size: v.size, sq: c.squares || 0 }); };
  const boats = [];
  tiers.forEach((tr, i) => { const s = top3[i]; if (s == null) return;
    const tier = mk(pod, "vcTier", `<div style="font-size:${(i ? 17 : 23) * k}px;color:${tr.s}">${i + 1}</div>`,
      { left: tr.x + "px", width: tw + "px", top: (base - hs[i]) + "px", height: hs[i] + "px", background: tr.c });
    place(tier, (el, b2, k2) => { const G = geom(b2, k2);
      Object.assign(el.style, { left: G.xs[i] + "px", width: G.tw + "px", top: (G.base - G.hs[i]) + "px", height: G.hs[i] + "px" });
      const n = el.firstElementChild; if (n) n.style.fontSize = ((i ? 17 : 23) * k2) + "px"; });
    const lab = mk(pod, "vcLab" + (isLocalHuman(s) ? " mine" : ""), `<span style="color:${HEXCOL[s]}">${esc(pname(s))}</span><small>${esc(label(s))}</small>`,
      { left: (tr.x + 3 * k) + "px", width: (tw - 6 * k) + "px", top: (base + 12 * k) + "px", fontSize: (11 * k) + "px" });
    place(lab, (el, b2, k2) => { const G = geom(b2, k2);
      Object.assign(el.style, { left: (G.xs[i] + 3 * k2) + "px", width: (G.tw - 6 * k2) + "px", top: (G.base + 12 * k2) + "px", fontSize: (11 * k2) + "px" }); });
  });
  const plate = mk(pod, "vcPlate", null, { left: (G0.mid - 137 * k) + "px", width: (275 * k) + "px", top: base + "px", height: (7 * k) + "px" });
  place(plate, (el, b2, k2) => { const G = geom(b2, k2);
    Object.assign(el.style, { left: (G.mid - 137 * k2) + "px", width: (275 * k2) + "px", top: G.base + "px", height: (7 * k2) + "px" }); });
  // the boats sail onto their tiers — the winner is already standing on the top one; with nobody crowned, all three sail on
  const sailing = [0, 1, 2].filter(ti => top3[ti] != null && !(win != null && ti === 0));
  sailing.forEach((ti, j) => { const s = top3[ti], size = (ti === 0 ? 56 : 46) * k, tr = tiers[ti], at = p.rise * .6 + (j + 1) * p.sailGap;
    const b = mk(stageEl, "vcBoat", `<img src="${BOAT_IMG[s]}" alt="">`, { left: (tr.x + tw / 2 - size / 2) + "px", top: (base - hs[ti] - size + 4 * k) + "px", width: size + "px" });
    place(b, (el, b2, k2) => { const G = geom(b2, k2), sz = (ti === 0 ? 56 : 46) * k2;
      Object.assign(el.style, { left: (G.xs[ti] + G.tw / 2 - sz / 2) + "px", top: (G.base - G.hs[ti] - sz + 4 * k2) + "px", width: sz + "px" }); });
    boats.push(b);
    anim(b, [{ transform: `translateX(${ti === 2 ? 130 : -130}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: skip ? 1 : 500, delay: skip ? 0 : at });
    setTimeout(() => playCardSwish(), at + 150); });
  if (rest != null) { const at4 = p.rise * .6 + 3 * p.sailGap, sz = G0.sz4, lx = G0.x4;
    const b4 = mk(stageEl, "vcBoat", `<img src="${BOAT_IMG[rest]}" alt="" style="opacity:.85">`, { left: (lx + 29 * k - sz / 2) + "px", top: (base - 32 * k) + "px", width: sz + "px" });
    place(b4, (el, b2, k2) => { const G = geom(b2, k2);
      Object.assign(el.style, { left: (G.x4 + 29 * k2 - G.sz4 / 2) + "px", top: (G.base - 32 * k2) + "px", width: G.sz4 + "px" }); });
    anim(b4, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: skip ? 0 : at4 });
    const l4 = mk(stageEl, "vcLab" + (isLocalHuman(rest) ? " mine" : ""), `<span style="color:${HEXCOL[rest]}">${esc(pname(rest))}</span><small>${esc(shortLabel(rest))}</small>`,
      { left: lx + "px", width: (58 * k) + "px", top: (base + 12 * k) + "px", fontSize: (10 * k) + "px" });
    place(l4, (el, b2, k2) => { const G = geom(b2, k2);
      Object.assign(el.style, { left: G.x4 + "px", width: (58 * k2) + "px", top: (G.base + 12 * k2) + "px", fontSize: (10 * k2) + "px" }); });
    anim(l4, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: skip ? 0 : at4 }); }
  replace();                                                     // one pass now, so nothing is left where the board used to be
  await sleepMs(skip ? 300 : p.rise + 3 * p.sailGap + 700 + 900);
}

/* CONFETTI THAT OBEYS GRAVITY — his round-3 note: "falls parabollically with gravity, not this jerky horrible thing".
   Fired up and inward from the board's bottom corners, slowed by the air, pulled down to paper's falling speed; the
   path is worked out 40 times over each flight so the arc is smooth. */
function gravityConfetti(box, n) {
  const G = 1600 * box.k, AIR = 1.8, VT = G / AIR, STEPS = 40, cols = ["#ffd24d", "#ff6fa5", "#5ee0c1", "#7fb8ff", "#ffffff"];
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0, d = mk(document.body, "vcConfetti", null, { left: (left ? box.x + 6 : box.x + box.w - 12) + "px", top: (box.y + box.h - 10) + "px", background: cols[i % 5] });
    const vx = (left ? 1 : -1) * (160 + Math.random() * 320) * box.k, vy = -(1050 + Math.random() * 450) * box.k, spin = (Math.random() * 2 - 1) * 720, flip = 3 + Math.random() * 5, sway = 4 + Math.random() * 6, D = 2300 + Math.random() * 700;
    const kf = [];
    for (let j = 0; j <= STEPS; j++) { const s = (j / STEPS) * D / 1000, fall = 1 - Math.exp(-AIR * s);
      kf.push({ offset: j / STEPS, opacity: j / STEPS > .85 ? Math.max(0, (1 - j / STEPS) / .15) : 1,
        transform: `translate(${(vx * fall / AIR + Math.sin(s * flip) * sway).toFixed(1)}px,${(VT * s + (vy - VT) * fall / AIR).toFixed(1)}px) rotate(${(spin * s).toFixed(0)}deg) scaleY(${Math.cos(s * flip * 2).toFixed(2)})` }); }
    const a = anim(d, kf, { duration: D, delay: Math.random() * 140, easing: "linear" });
    if (a) a.onfinish = a.oncancel = () => d.remove(); else d.remove();
  }
}

/* ================= 2. THE CARD ================= */
export function victoryCard() {
  ensureStyle();
  const g = appState.game, wrap = $("statsWrap"), panel = $("statsPanel");
  if (!g || !wrap || !panel) return;
  wrap.classList.add("vcOn");
  placeCard(wrap);
  /* …and the card is placed again whenever the window changes, for the same reason the podium is (his 2026-09-17 note). */
  if (!wrap.__vcPlacing) { wrap.__vcPlacing = () => { if (wrap.classList.contains("vcOn")) placeCard(wrap); }; window.addEventListener("resize", wrap.__vcPlacing); }
  if (g.__victoryCardBuilt) return;                       // render() calls this on every repaint; the card is built once a voyage
  const v = voyageOf(g);
  if (!v) return;
  g.__victoryCardBuilt = true;
  panel.innerHTML = "";
  const card = mk(panel, "vcCard");
  buildDock(wrap);
  const cardH = () => card.clientHeight;
  const win = g.winner, locals = (v.order || []).filter(isLocalHuman);
  const skip = reduced() || appState.replaying;
  const pages = [];
  const addPage = (id, label, fill) => pages.push({ id, label, fill });
  // his order: so close straight after the podium, then the winning bake, Polly's awards, the treasure tally
  for (const s of locals) { const c = v.captains.find(x => x.seat === s); if (c && !c.won) addPage("close", sayText("victory.chip.close", {}), el => pageClose(el, v, c)); }
  if (win != null) addPage("bake", sayText("victory.chip.bake", {}), el => pageBake(el, v, win));
  addPage("awards", sayText("victory.chip.awards", {}), el => pageAwards(el, v, cardH));
  for (const s of locals) { const c = v.captains.find(x => x.seat === s); if (c) addPage("tally", sayText("victory.chip.score", {}), el => pageTally(el, v, c, card)); }
  const SW = T.awards.swipe;
  let cur = 0, done = false, taken = false;   // `taken`: a finger took the card over mid-show, so the auto-play stands down
  const els = pages.map((pg, i) => { const el = mk(card, "vcPage"); if (i) el.style.transform = "translateX(112%)"; return el; });
  const bodies = els.map(el => mk(el, "vcBody"));   // content fills the body; the swipe buttons live beside it on the page
  const slide = (from, to, dir) => { const ease = "cubic-bezier(.3,.7,.3,1)";
    anim(els[from], [{ transform: "translateX(0)" }, { transform: `translateX(${-dir * 112}%)` }], { duration: SW, fill: "forwards", easing: ease });
    anim(els[to], [{ transform: `translateX(${dir * 112}%)` }, { transform: "translateX(0)" }], { duration: SW, fill: "forwards", easing: ease });
    playCardSwish(); };
  /* ⭐ THE PAGES FOLLOW HIS FINGER. Wyatt, 2026-09-17, on the victory card: "The cards should be swipable to go back and forth between
     them; not just using the little buttons at the bottom." There WAS a swipe (a pointerdown/pointerup pair with a 30px threshold),
     and two things made it feel like there wasn't: nothing moved while the finger did, and NOTHING answered at all until the card had
     finished playing every page — `done`. So a swipe during the show, which is when a player first tries one, did nothing.
     Now a drag takes the card over: the auto-play stops where it is, the page follows the finger, and it snaps to whichever page the
     release asks for. The ends rubber-band rather than wrap, and a page dragged to before its turn is filled on the way. */
  const filled = pages.map(() => false);
  const fill = i => { if (filled[i]) return 0; filled[i] = true; return pages[i].fill(bodies[i]) || 0; };
  /* hand every page back to its inline style: keep the pose a filled animation is holding, then let that animation go */
  const freePages = () => els.forEach(el => el.getAnimations().forEach(an => {
    try { an.commitStyles(); } catch (e) {}
    try { an.cancel(); } catch (e) {}
  }));
  const restAt = i => { els[i].style.transform = i === cur ? "translateX(0)" : `translateX(${i < cur ? -112 : 112}%)`; };
  const takeOver = () => { if (done) return; taken = true; done = true; card.classList.add("done"); };
  const nav = i => { if (!done || i < 0 || i >= pages.length || i === cur) return; card.classList.add("browsing"); fill(i); slide(cur, i, i > cur ? 1 : -1); cur = i; };
  els.forEach((el, i) => {
    if (i > 0) { const b = document.createElement("button"); b.type = "button"; b.className = "vcChip prev"; b.textContent = "‹ " + pages[i - 1].label; b.onclick = () => nav(i - 1); el.appendChild(b); }
    if (i < pages.length - 1) { const b = document.createElement("button"); b.type = "button"; b.className = "vcChip next"; b.textContent = pages[i + 1].label + " ›"; b.onclick = () => nav(i + 1); el.appendChild(b); }
  });
  let drag = null;
  const PULL = 0.28;                       // how far the first and last page give before they spring back
  /* ⚠ TOUCH AND POINTER BOTH, AND THAT IS MEASURED. A pointer-only drag looked right and did nothing on a phone: the card gets the
     pointerdown and then Chrome stops sending pointer moves for that touch — measured at 375x812 with real touch events, the card
     saw "pointerdown, touchstart, 8 × touchmove, touchend" and no pointermove or pointerup at all. So the finger is read from the
     touch events, the mouse and pen from the pointer ones, and whichever starts first owns the drag. */
  const at = ev => (ev.touches && ev.touches.length ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
                 : ev.changedTouches && ev.changedTouches.length ? { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY }
                 : { x: ev.clientX, y: ev.clientY });
  const dragStart = (ev, kind) => {
    if (drag || (ev.target && ev.target.closest && ev.target.closest("button"))) return;   // the chips answer for themselves
    const p = at(ev);
    drag = { kind, x: p.x, y: p.y, t: performance.now(), w: card.getBoundingClientRect().width || 1, moved: false, to: -1 };
  };
  const dragMove = (ev, kind) => {
    if (!drag || drag.kind !== kind) return;
    const p = at(ev), dx = p.x - drag.x, dy = p.y - drag.y;
    if (!drag.moved) {                                             // a drag, not a tap, and across rather than down
      if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return;
      drag.moved = true; takeOver(); card.classList.add("browsing");
      /* ⚠ AND THE LAST SWIPE'S ANIMATION HAS TO LET GO OF THE PAGE FIRST. Every slide ends as a filled Web Animation
         (fill:"forwards"), which outranks an inline style — so a second drag on the same page wrote its transform and nothing
         moved. Wy-Blade measured exactly that: "inline translateX(59.89%), painted 0px, animations [finished/forwards]". Each
         page's finished animations are committed (so the page keeps the pose it is in) and then cancelled, which hands it back
         to the inline style this drag writes. */
      freePages();
    }
    if (ev.cancelable) ev.preventDefault();                        // ours now: no rubber-banding of the page under it
    const to = dx < 0 ? cur + 1 : cur - 1, room = (to >= 0 && to < pages.length) ? 1 : PULL;
    const f = (dx / drag.w) * room;
    drag.to = room === 1 ? to : -1;
    els[cur].style.transform = `translateX(${(f * 100).toFixed(2)}%)`;
    if (drag.to >= 0) { fill(to); els[to].style.transform = `translateX(${((f + (dx < 0 ? 1.12 : -1.12)) * 100).toFixed(2)}%)`; }
  };
  const dragEnd = (ev, kind) => {
    if (!drag || drag.kind !== kind) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    const dx = at(ev).x - d.x, speed = Math.abs(dx) / Math.max(1, performance.now() - d.t);
    const take = d.to >= 0 && (Math.abs(dx) > d.w * 0.22 || speed > 0.45);
    const from = cur, goTo = take ? d.to : cur;
    const ease = "cubic-bezier(.3,.7,.3,1)", ms = Math.round(SW * 0.8);
    anim(els[from], [{ transform: els[from].style.transform }, { transform: `translateX(${from === goTo ? 0 : (goTo > from ? -112 : 112)}%)` }], { duration: ms, fill: "forwards", easing: ease });
    if (d.to >= 0) anim(els[d.to], [{ transform: els[d.to].style.transform }, { transform: `translateX(${d.to === goTo ? 0 : (d.to > from ? 112 : -112)}%)` }], { duration: ms, fill: "forwards", easing: ease });
    if (take) { cur = goTo; playCardSwish(); }
  };
  card.addEventListener("touchstart", ev => dragStart(ev, "touch"), { passive: true });
  card.addEventListener("touchmove", ev => dragMove(ev, "touch"), { passive: false });
  card.addEventListener("touchend", ev => dragEnd(ev, "touch"));
  card.addEventListener("touchcancel", () => { if (drag && drag.kind === "touch") { const d = drag; drag = null; if (d.moved) { restAt(cur); if (d.to >= 0) restAt(d.to); } } });
  /* ⚠ A MOUSE LETS GO WHEREVER IT LIKES. Wyatt, 2026-09-17: "click-dragging to swipe those end cards doesn't work -- it's really
     buggy. when i click once, the card starts to drag; when i release, the card continues to drag. this may have been an issue with
     mouse up outside the window?" That is exactly it: the release listener was on the CARD, so a button let go past its edge — or
     outside the window — never ended the drag, and the next move carried on dragging a card nobody was holding.
     So the pointer is CAPTURED on press (every later event for that pointer comes to the card wherever it goes), and the release is
     listened for on the window as well, with a blur to catch the drag that ends by leaving the page entirely. The touch path keeps
     its own listeners: it never had this fault, because a touch's events already follow the finger that started them. */
  card.addEventListener("pointerdown", ev => {
    if (ev.pointerType === "touch") return;
    dragStart(ev, "pointer");
    if (drag) { try { card.setPointerCapture(ev.pointerId); } catch (e) {} }
  });
  card.addEventListener("pointermove", ev => dragMove(ev, "pointer"));
  const onBlur = () => letGoPointer(null);
  const stopWatching = () => {                                   // the card has left; so do its window listeners, or a second voyage stacks another pair
    window.removeEventListener("pointerup", letGoPointer);
    window.removeEventListener("pointercancel", letGoPointer);
    window.removeEventListener("blur", onBlur);
  };
  const letGoPointer = ev => {
    if (!card.isConnected) { stopWatching(); return; }
    if (!drag || drag.kind !== "pointer") return;
    try { if (ev && ev.pointerId != null) card.releasePointerCapture(ev.pointerId); } catch (e) {}
    dragEnd(ev || { clientX: drag.x, clientY: drag.y }, "pointer");
  };
  card.addEventListener("pointerup", letGoPointer);
  window.addEventListener("pointerup", letGoPointer);
  window.addEventListener("pointercancel", letGoPointer);
  window.addEventListener("blur", onBlur);
  // the card rises, then each page plays in turn and swipes away left to the next
  if (!skip) anim(wrap, [{ transform: "translateY(110%)" }, { transform: "translateY(0)" }], { duration: 450, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "none" });
  (async () => {
    await sleepMs(skip ? 0 : 450);
    for (let i = 0; i < pages.length; i++) {
      if (!card.isConnected || taken) return;                      // a finger is driving now
      if (i > 0) { slide(i - 1, i, 1); cur = i; await sleepMs(skip ? 0 : SW); }
      if (taken) return;
      const ms = fill(i);
      await sleepMs(skip ? 0 : ms);
    }
    if (taken) return;
    done = true; card.classList.add("done");
  })();
}

/* the card sits below the podium: its top overlaps the board's last rows, like his sheet; never shorter than it needs */
function placeCard(wrap) {
  const box = boardBox(), need = 236 + 74;
  wrap.style.top = Math.round(Math.min(Math.max(box.y + box.h - 67 * box.k, 150), innerHeight - need)) + "px";
}

/* -------- so close: only a captain who did not win, on their own screen (or a shared pass-and-play screen, where the
   voyage is over and the recipe is no secret — his ruling, 2026-09-16) -------- */
function pageClose(el, v, c) {
  const size = v.size, baking = !!c.baked, bench = baking && Array.isArray(c.bakeOrder) && Array.isArray(c.namedCrates);
  const recipe = bench ? c.bakeOrder : (c.recipe || []);
  const held = (appState.game.players[c.seat] || {}).ing || [];
  const ok = baking ? (c.named || 0) : (c.crates || 0), missing = Math.max(1, size - ok);
  // a sailing captain's ticks are the crates they HELD; a baker's are how many crates they had named right
  const has = bench ? recipe.map(x => c.namedCrates.includes(x)) : baking ? recipe.map((x, i) => i < ok) : recipe.map(x => held.includes(x));
  el.innerHTML = `<h4 class="vcHead">${say((baking ? "victory.close.bake" : "victory.close.ovens") + (missing === 1 ? ".one" : ".many"), { w: seat(c.seat), n: sayText("victory.number." + Math.min(5, missing), {}) })}</h4>`;
  const row = mk(el, "vcRecipe");
  recipe.forEach((ing, i) => { const got = has[i];
    const box = mk(row, "vcIng" + (got ? "" : " missing"), `<img src="${ING_IMG[ing]}" alt="">` + (got ? `<span class="tick">✓</span>` : (baking ? `<span class="q">?</span>` : "")));
    anim(box, [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: 250 + i * 110 });
    setTimeout(() => playLidNote(got ? Math.min(i, 7) : 0), 250 + i * 110);
    if (!got && !reduced()) anim(box, [{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }], { duration: T.close.pulse, delay: 800, iterations: 12, fill: "none", easing: "ease-in-out" });
  });
  const place = (v.order || []).indexOf(c.seat) + 1;
  mk(el, "vcHow", `<b>${esc(sayText(baking ? "victory.close.howBake" : "victory.close.howSail", { n: ok, size, sq: c.squares || 0 }))}</b><br><span>${esc(sayText("victory.close.place", { place: sayText("victory.place." + place, {}), total: v.captains.length }))}</span>`);
  const miss = recipe.find((x, i) => !has[i]);
  if (miss) mk(el, "vcNext", `<img src="${POCKET_COMPASS_IMG}" alt=""> ${esc(sayText(baking ? "victory.close.nextBake" : "victory.close.nextSail", { place: dockPlace(miss), ing: iname(miss) }))}`);
  return 1000 + T.close.hold;
}

/* -------- the winning bake -------- */
function pageBake(el, v, win) {
  const b = T.bake, c = v.captains.find(x => x.seat === win) || {}, recipe = c.recipe || (appState.game.players[win] || {}).recipe || [];
  const info = recipe.length ? recipeInfo(recipe) : null;
  // "3 of 21 recipes baked" — this device remembers what each of its human captains has baked (until accounts)
  let countLine = "";
  if (b.count && isLocalHuman(win) && info) {
    const baked = store.get("pp_recipesBaked", {}), name = pname(win), list = new Set(baked[name] || []);
    list.add(info.title); baked[name] = [...list]; store.set("pp_recipesBaked", baked);
    countLine = " · " + sayText("victory.bake.count", { n: list.size, total: recipesTotal(v.size) });
  }
  // his ruling (2026-08-30): honour every captain who baked, and say why the winner won
  const cobakers = (v.captains || []).filter(x => x.seat !== win && x.tries).map(x => pname(x.seat));
  el.innerHTML = `<h4 class="vcHead">${say("victory.bake.title", { w: seat(win) })}</h4><div class="vcSubline">${esc(info ? info.title : "")}${esc(countLine)}</div>` +
    (cobakers.length ? `<div class="vcSubline">${esc(sayText("victory.bake.cobakers", { names: cobakers.join(", ") }))}</div>` : "");
  let t = 0;
  const H = el.clientHeight || 230, W = el.clientWidth || 355, pw = Math.min(H * .5, 120) * b.size, standY = H * .78;
  if (b.steam && !reduced()) { for (let i = 0; i < 5; i++) { const puff = mk(el, "vcSteam", null, { left: (W / 2 - 13 + (i - 2) * 10) + "px", top: (standY - 40) + "px" });
      anim(puff, [{ transform: "translateY(0) scale(.4)", opacity: 0 }, { opacity: .9, offset: .3 }, { transform: `translate(${(i - 2) * 14}px,-70px) scale(1.6)`, opacity: 0 }], { duration: 900, delay: i * 40 }); }
    t += 350; }
  if (info && info.img) { const img = mk(el, "vcPastry", `<img src="${info.img}" alt="">`, { left: (W / 2 - pw / 2) + "px", top: (standY - pw * .9) + "px", width: pw + "px" });
    anim(img, [{ transform: "translateY(40px) scale(.6)", opacity: 0 }, { transform: "translateY(-6px) scale(1.06)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: b.rise, delay: t });
    setTimeout(() => playPop(0), t + b.rise * .7); }
  t += b.rise;
  recipe.forEach((ing, i) => { const e = mk(el, "vcFly", `<img src="${ING_IMG[ing]}" alt="">`, { left: (W / 2 - 15 + (i - 2) * 38) + "px", top: "54px" });
    anim(e, [{ transform: `translate(${(2 - i) * 30}px,${H * .4}px) scale(.3)`, opacity: 0 }, { transform: "scale(1.25)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: 420, delay: t + i * b.flyGap });
    setTimeout(() => playPop(i + 1), t + i * b.flyGap + 300); });
  t += recipe.length * b.flyGap + 500;
  const sw = 66 * b.seal, seal = mk(el, "vcSeal", say("victory.bake.seal", {}), { left: (W / 2 + pw * .38) + "px", top: (standY - pw * .9) + "px", width: sw + "px", height: sw + "px", fontSize: Math.round(sw * .17) + "px" });
  anim(seal, [{ transform: "rotate(-14deg) scale(2.6)", opacity: 0 }, { transform: "rotate(-14deg) scale(.9)", opacity: 1, offset: .7 }, { transform: "rotate(-14deg) scale(1)", opacity: 1 }], { duration: 350, delay: t });
  setTimeout(() => playCrateVerdict(true), t + 240);
  return t + 350 + b.hold;
}
const recipesTotal = size => { let n = ING_ALL.length, r = 1; for (let i = 0; i < size; i++) r = r * (n - i) / (i + 1); return Math.round(r); };

/* -------- Polly's awards: last place first; each flips in big, then shrinks into a tall column -------- */
function pageAwards(el, v, cardH) {
  const a = T.awards, badges = assignBadges(), bySeat = {};
  badges.forEach(b => { bySeat[b.seat] = b; });
  const shown = (v.order || []).slice().reverse().filter(s => bySeat[s]);
  const H = cardH() || 233, W = el.clientWidth || 355;
  const polly = mk(el, "vcPolly", `<img src="${PARROT_IMG}" alt="">`);
  if (a.bob && !reduced()) anim(polly, [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-5px) rotate(-6deg)" }, { transform: "translateY(0) rotate(0)" }], { duration: 700, iterations: 30, fill: "none" });
  const bubble = mk(el, "vcBubble", "");
  const n = shown.length, gap = 6, sw = Math.min(120, Math.floor((W - 16 - (n - 1) * gap) / n)), rowY = 56, sh = H - rowY - 34, rowX = W / 2 - (n * sw + (n - 1) * gap) / 2;
  let t = 0;
  playDrumroll();
  shown.forEach((s, i) => { const b = bySeat[s], last = i === n - 1, col = HEXCOL[s];
    const stat = `${b.def.stat}${b.value != null ? " — " + b.value + (b.def.unit || "") : ""}`;
    setTimeout(() => { bubble.innerHTML = say("victory.awards.goesTo", { award: b.def.name }); }, t);
    const cw = Math.min(W - 20, 215 * (last ? a.big : 1)), ch = H - 86, left = W / 2 - cw / 2, top = 46;
    const big = mk(el, "vcAward", `<img src="${ASSET_BASE}badges/${b.def.img}.png" alt="" style="width:${Math.round(ch * .25)}px">
        <div class="an" style="font-size:${last ? 15 : 13.5}px">${esc(b.def.name)}</div><div class="ab">${esc(b.def.byline)}</div>
        <div class="ac" style="color:${col};font-size:${last ? 19 : 16}px">${esc(pname(s))}</div><div class="as">${esc(stat)}</div>`,
      { left: left + "px", top: top + "px", width: cw + "px", height: ch + "px", borderColor: col, zIndex: String(10 + i * 2), opacity: 0 });
    const fa = t + a.drum;
    anim(big, [{ transform: "perspective(600px) rotateY(90deg)", opacity: 1 }, { transform: "perspective(600px) rotateY(0deg)", opacity: 1 }], { duration: a.flip, delay: fa, fill: "forwards" });
    setTimeout(() => playAwardWhoosh(), fa);
    const sa = fa + a.flip + a.gap, sx = rowX + i * (sw + gap), dx = (sx + sw / 2) - (left + cw / 2), dy = (rowY + sh / 2) - (top + ch / 2);
    const end = `perspective(600px) rotateY(0deg) translate(${dx}px,${dy}px) scale(${sw / cw},${sh / ch})`;
    anim(big, [{ transform: "perspective(600px) rotateY(0deg) translate(0px,0px) scale(1,1)", opacity: 1 }, { transform: end, opacity: 1, offset: .82 }, { transform: end, opacity: 0 }], { duration: a.shrink, delay: sa, fill: "forwards", easing: "cubic-bezier(.5,0,.3,1)" });
    const small = mk(el, "vcAwardSm", `<img src="${ASSET_BASE}badges/${b.def.img}.png" alt="">
        <div class="an">${esc(b.def.name)}</div><div class="ac" style="color:${col}">${esc(pname(s))}</div><div class="as">${esc(stat)}</div>`,
      { left: sx + "px", top: rowY + "px", width: sw + "px", height: sh + "px", borderColor: col, zIndex: String(9 + i * 2), opacity: 0 });
    anim(small, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: sa + a.shrink * .72, fill: "forwards" });
    t = sa + a.shrink;
  });
  setTimeout(() => { bubble.innerHTML = say("victory.awards.done", {}); }, t);
  return t + a.holdAll;
}

/* -------- the treasure tally: this captain's voyage score, row by row -------- */
function pageTally(el, v, c, card) {
  const g = T.tally, rows = c.rows || [], total = c.score || 0, name = pname(c.seat);
  el.innerHTML = `<img class="vcPouch" src="${SPOILS_POUCH_IMG}" alt=""><h4 class="vcHead">${say("victory.score.title", { w: seat(c.seat) })}</h4>`;
  const vp = mk(el, "vcRows", null, { height: (g.visible * 20) + "px" }), list = mk(vp, null), lifts = [];
  const detail = r => r.key === "ovens" ? (r.day != null ? sayText("victory.row.day", { n: r.day }) : "")
    : r.key === "perfect" ? (r.tries === 1 ? sayText("victory.row.firstTry", {}) : r.tries === 2 ? sayText("victory.row.twoTries", {}) : "")
    : r.key === "won" ? "" : `${r.count} × ${r.each}`;
  rows.forEach((r, i) => { const at = i * g.perRow;
    const row = mk(list, "vcRow" + (r.pts ? "" : " zero"), `<span>${esc(sayText("victory.row." + r.key, {}))}<i>${esc(detail(r))}</i></span><b>${r.pts ? "+0" : "—"}</b>`, { opacity: 0 });
    anim(row, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: r.pts ? 1 : .42, transform: "none" }], { duration: 320, delay: at });
    // once the card is full, every line SLIDES up one row to make room (his round-3 note: "animate them up")
    if (i >= g.visible) { const from = (i - g.visible) * 20;
      lifts.push(anim(list, [{ transform: `translateY(${-from}px)` }, { transform: `translateY(${-from - 20}px)` }], { duration: Math.min(340, g.perRow * .6), delay: at, fill: i === g.visible ? "both" : "forwards", easing: "cubic-bezier(.3,.7,.3,1)" })); }
    if (r.pts) setTimeout(() => reel(row.querySelector("b"), r.pts, g.reel, "+"), at);
  });
  const totalAt = rows.length * g.perRow;
  const trow = mk(el, "vcRow vcTotal", `<span>${esc(sayText("victory.score.total", {}))}</span><b>0</b>`);
  reel(trow.querySelector("b"), total, totalAt + g.reel, "", true);
  setTimeout(() => { lifts.forEach(x => { try { x && x.cancel(); } catch (e) {} }); list.style.transform = ""; vp.style.overflowY = "auto"; vp.scrollTop = Math.max(0, (rows.length - g.visible) * 20); }, totalAt + g.reel + 50);
  setTimeout(() => { playLidNote(7);   // not the coin chink: that sound is a coin ARRIVING in a purse, played in one place (coin_arrival_one_event_check)
   
    if (g.shake && !reduced()) anim(card, [0, 1, 2, 3, 4, 5, 6].map(i => ({ translate: i === 6 ? "0 0" : `${(i % 2 ? 1 : -1) * g.shake * (1 - i / 6) * Math.min(2, total / 800)}px 0` })), { duration: 380, fill: "none", easing: "linear" }); }, totalAt + g.reel);
  // "New best voyage!" — each player's own best, on their own device (his ruling, 2026-09-16)
  const bests = store.get("pp_bestVoyage", {}), prev = bests[name];
  if (prev == null || total > prev) { bests[name] = total; store.set("pp_bestVoyage", bests); }
  let extra = 0;
  if (g.best && prev != null && total > prev) {
    const pill = mk(el, "vcBest", say("victory.score.best", {}), { opacity: 0 });
    anim(pill, [{ transform: "translateX(-50%) rotate(-6deg) scale(2.6)", opacity: 0 }, { transform: "translateX(-50%) rotate(-6deg) scale(.92)", opacity: 1, offset: .7 }, { transform: "translateX(-50%) rotate(-6deg) scale(1)", opacity: 1 }], { duration: 350, delay: totalAt + g.reel + 300 });
    setTimeout(() => playCrateVerdict(true), totalAt + g.reel + 520);
    extra = 700;
  }
  return totalAt + g.reel + extra + g.hold;
}
/* a number rolling up like a slot reel. Its timing is the animation frame's own clock; its tick asks audio.js, which
   spaces the coin tick in ONE place (playSpaced — sound_spacing_one_place_check), so nothing here keeps a sound clock. */
function reel(el, to, dur, prefix, quiet) {
  let start = null, shown = null;
  const step = t => { if (!el.isConnected) return; if (start === null) start = t;
    const k = Math.min(1, (t - start) / Math.max(1, dur)), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (v !== shown) { shown = v; el.textContent = prefix + v; if (!quiet && k < 1) playCoinTick(); }
    if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* -------- set sail again: the Play again button is a dock -------- */
function buildDock(wrap) {
  wrap.querySelectorAll(".pp4Again").forEach(x => x.remove());
  const dock = document.createElement("button");
  dock.type = "button"; dock.className = "pp4Again vcDock";                   // .pp4Again: stage.js adds no second button, and the probes still find it
  dock.innerHTML = `<span class="vcDockLabel">${esc(sayText("victory.dock.label", {}))}</span><span class="vcPlank"></span>` +
    appState.game.players.map((p, i) => `<img class="vcSail" data-seat="${i}" src="${BOAT_IMG[i]}" alt="" style="left:calc(50% - 108px + ${i * 58}px)">`).join("");
  wrap.appendChild(dock);
  if (!reduced() && !appState.replaying) anim(dock, [{ transform: "translateY(90px)" }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "none" });
  let tapped = false;
  dock.onclick = () => {
    if (tapped) return; tapped = true;
    const label = dock.querySelector(".vcDockLabel");
    const raise = (el, delay) => anim(el, [{ transform: "scaleY(.35)", filter: "grayscale(.7)" }, { transform: "scaleY(1.12)", filter: "grayscale(0)", offset: .75 }, { transform: "scaleY(1)", filter: "grayscale(0)" }], { duration: T.dock.sailRise, delay, fill: "forwards" });
    const sails = [...dock.querySelectorAll(".vcSail")];
    appState.game.players.forEach((p, i) => { if (p.strategy !== "human" || isLocalHuman(i)) raise(sails[i], p.strategy === "human" ? 0 : 60); });
    playCardSwish();
    setTimeout(() => { label.textContent = sayText("victory.dock.setting", {}); playLidNote(7); }, T.dock.sailRise);
    setTimeout(() => { const orig = $("btnPlayAgain"); if (orig && orig.onclick) orig.onclick(); }, T.dock.sailRise + 500);
  };
  return dock;
}

/* ================= STYLE ================= */
const CSS = `
body.pp4Stage #statsWrap.vcOn { top:auto; background:transparent; box-shadow:none; border:0; padding:0 8px 8px; max-width:460px; margin:0 auto; overflow:visible; }
#statsWrap.vcOn > h3 { display:none; }
#statsWrap.vcOn #statsScroll { overflow:visible; flex:1 1 auto; min-height:0; display:flex; }
#statsWrap.vcOn #statsPanel { flex:1 1 auto; display:flex; min-height:0; }
.vcCard { position:relative; flex:1 1 auto; min-height:226px; background:#f4fbf8; border-radius:16px; box-shadow:0 8px 26px rgba(0,0,0,.35); overflow:hidden; touch-action:pan-y; font-family:'Avenir Next',Avenir,'Segoe UI','Trebuchet MS',sans-serif; color:#1f2d33; }
.vcPage { position:absolute; inset:0; text-align:center; }
.vcBody { position:absolute; inset:0; padding:10px 12px; }
.vcHead::first-letter { text-transform:uppercase; }
.vcHead { margin:0; font:600 18px/1.15 Fredoka,'Avenir Next',Avenir,system-ui,sans-serif; color:#1f2d33; }
.vcSubline { font:600 12px/1.3 'Avenir Next',Avenir,sans-serif; color:#5c6b70; margin-top:2px; }
.vcChip { position:absolute; bottom:7px; z-index:40; display:none; font:700 11px/1 'Avenir Next',Avenir,sans-serif; color:#24505a; background:#dfece8; border:0; border-radius:999px; padding:6px 10px; cursor:pointer; }
.vcChip.prev { left:8px } .vcChip.next { right:8px }
.vcCard.done .vcChip.prev { display:block } .vcCard.done.browsing .vcChip.next { display:block }
.vcRecipe { position:absolute; left:0; right:0; top:64px; display:flex; justify-content:center; align-items:center; gap:8px; }
.vcIng { position:relative; padding:5px; } .vcIng img { width:38px; display:block; }
.vcIng .tick { position:absolute; right:-4px; bottom:-4px; width:18px; height:18px; border-radius:50%; background:#27c78d; color:#fff; font:700 12px/18px sans-serif; }
.vcIng.missing { border:2px dashed #e39a1b; border-radius:50%; padding:3px; background:#fff7e3; } .vcIng.missing img { opacity:.5; }
.vcIng .q { position:absolute; inset:0; display:grid; place-items:center; font:700 20px Fredoka,system-ui,sans-serif; color:#a65f00; }
.vcHow { position:absolute; left:10px; right:10px; top:122px; font:600 13px/1.35 'Avenir Next',Avenir,sans-serif; } .vcHow b { font-size:15px; } .vcHow span { color:#5c6b70; }
.vcNext { position:absolute; left:10px; right:10px; top:166px; font:600 12.5px/1.3 'Avenir Next',Avenir,sans-serif; } .vcNext img { width:20px; vertical-align:middle; }
.vcSteam { position:absolute; width:26px; height:26px; border-radius:50%; background:rgba(110,145,168,.6); filter:blur(4px); opacity:0; }
.vcPastry, .vcFly { position:absolute; } .vcPastry img { width:100%; display:block; } .vcFly img { width:30px; display:block; }
.vcSeal { position:absolute; border-radius:50%; background:#b8322d; color:#ffe9b0; font-family:Fredoka,system-ui,sans-serif; font-weight:700; line-height:1.05; display:grid; place-items:center; box-shadow:0 0 0 3px #8c1f1b; }
.vcPolly { position:absolute; left:10px; top:6px; width:34px; } .vcPolly img { width:100%; display:block; }
.vcBubble { position:absolute; left:54px; right:8px; top:8px; min-height:30px; text-align:left; font:600 12.5px/1.25 'Avenir Next',Avenir,sans-serif; background:#fff; border-radius:10px; padding:6px 9px; box-shadow:0 1px 3px rgba(0,0,0,.15); }
.vcAward, .vcAwardSm { position:absolute; background:#fff; border:3px solid; border-radius:12px; padding:3px 7px; text-align:center; box-sizing:border-box; }
.vcAward img { display:block; margin:2px auto 1px; } .vcAward .an { font-family:Fredoka,system-ui,sans-serif; font-weight:600; line-height:1.1; }
.vcAward .ab { font-size:10px; line-height:1.2; color:#5c6b70; margin:2px 0; } .vcAward .ac { font-family:Fredoka,system-ui,sans-serif; font-weight:700; line-height:1.1; }
.vcAward .as { font-size:10.5px; color:#5c6b70; border-top:1px solid #dfe7e4; margin-top:3px; padding-top:2px; }
.vcAwardSm { border-width:2px; border-radius:10px; padding:2px 4px; overflow:hidden; }
.vcAwardSm img { width:24px; display:block; margin:3px auto 2px; } .vcAwardSm .an { font:600 10px/1.12 Fredoka,system-ui,sans-serif; color:#1f2d33; }
.vcAwardSm .ac { font:700 11px/1.1 Fredoka,system-ui,sans-serif; margin:4px 0 3px; } .vcAwardSm .as { font:600 9px/1.15 'Avenir Next',Avenir,sans-serif; color:#5c6b70; border-top:1px solid #dfe7e4; padding-top:2px; }
.vcPouch { width:28px; display:block; margin:0 auto; }
.vcRows { overflow-y:hidden; margin:6px 8px 0; scrollbar-width:thin; }
.vcRow { display:flex; justify-content:space-between; align-items:center; gap:6px; height:20px; font:600 12.5px/1.2 'Avenir Next',Avenir,sans-serif; text-align:left; white-space:nowrap; }
.vcRow span { overflow:hidden; text-overflow:ellipsis; } .vcRow i { font-style:normal; color:#7b8a8f; font-size:11px; margin-left:4px; } .vcRow b { font-variant-numeric:tabular-nums; }
.vcRow.zero { opacity:.42 }
.vcTotal { border-top:1px solid #dfe7e4; padding-top:4px; margin:4px 8px 0; height:30px; } .vcTotal span { font-size:14.5px; } .vcTotal b { font-size:20px; color:#b37400; }
.vcBest { position:absolute; left:50%; bottom:36px; padding:5px 14px; border-radius:999px; background:#ffd24d; color:#2e1c00; font:700 14px/1 Fredoka,system-ui,sans-serif; white-space:nowrap; }
.pp4Again.vcDock { position:relative; flex:0 0 66px; height:66px; margin-top:8px; width:100%; border:0; border-radius:14px; padding:0; background:linear-gradient(#ffc24a,#f5a623); box-shadow:inset 0 -4px 0 #c47f10,0 4px 12px rgba(0,0,0,.3); overflow:hidden; cursor:pointer; animation:none; }
.vcDockLabel { position:absolute; left:0; right:0; top:6px; text-align:center; font:800 15px/1 'Avenir Next',Avenir,sans-serif; color:#2c1d08; }
.vcPlank { position:absolute; left:14px; right:14px; bottom:9px; height:6px; border-radius:3px; background:#8a5a2b; }
.vcSail { position:absolute; bottom:10px; width:24px; transform-origin:50% 100%; transform:scaleY(.35); filter:grayscale(.7); }
.vcStage { position:fixed; inset:0; z-index:31; pointer-events:none; }
.vcDim { position:absolute; inset:0; background:#06141a; opacity:0; }
.vcHero, .vcCrown, .vcBoat { position:absolute; } .vcHero img, .vcCrown img, .vcBoat img { width:100%; display:block; }
.vcHero { z-index:3; }
.vcName { position:absolute; left:0; right:0; text-align:center; font-family:Fredoka,system-ui,sans-serif; font-weight:700; color:#fff; text-shadow:0 2px 0 rgba(0,0,0,.35); white-space:nowrap; transform-origin:50% 0; z-index:3; }
.vcName span { display:inline-block; opacity:0; } .vcName .vcSub { font-size:.54em; font-weight:600; opacity:0; margin-top:2px; }
.vcNobody .vcSub { font-size:1em; opacity:1; }
.vcPodium { position:absolute; inset:0; } .vcTier { position:absolute; border-radius:9px 9px 0 0; text-align:center; font-family:Fredoka,system-ui,sans-serif; font-weight:700; padding-top:3px; box-sizing:border-box; }
.vcPlate { position:absolute; border-radius:4px; background:#e2cfa6; box-shadow:0 2px 0 #b89d6a; }
.vcLab { position:absolute; text-align:center; font-family:'Avenir Next',Avenir,sans-serif; font-weight:700; line-height:1.15; color:#fff; text-shadow:0 1px 0 rgba(0,0,0,.5); background:rgba(6,20,26,.6); border-radius:6px; padding:3px 2px; box-sizing:border-box; }
.vcLab small { display:block; font-weight:600; font-size:.86em; opacity:.9; } .vcLab.mine { box-shadow:inset 0 0 0 1.5px #fff; }
.vcConfetti { position:fixed; width:7px; height:10px; border-radius:2px; z-index:33; pointer-events:none; }
@media (prefers-reduced-motion: reduce) { .vcConfetti { display:none; } }
`;
/* the style goes in the first time the card is shown — never at import, because headless checks load the game's modules with no page (w7_route_derivation_check) */
function ensureStyle() {
  if (typeof document === "undefined" || typeof document.createElement !== "function" || !document.head || document.getElementById("vcStyle")) return;
  const st = document.createElement("style"); st.id = "vcStyle"; st.textContent = CSS; document.head.appendChild(st);
}
