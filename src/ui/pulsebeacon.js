// src/ui/pulsebeacon.js — THE PULSE BEACON (debug instrument, ?debug=pulse only).
//
// Wyatt's charter, 2026-08-24: the pulse bug lives only on real devices, so the game itself must
// be able to testify. This module is the sanctioned tooling exception to the "fix the game, don't
// build tools" rule — approved by him in the same conversation that designed it.
//
// WHAT IT RECORDS, timestamped from beacon start:
//   VIS      — every visibilitychange (the prime suspect class: hide/show suspending the
//              animation clock).
//   CLOCK    — a liveness probe: a reference animation this file owns, sampled every 2s. If ITS
//              clock stops advancing while the page is visible, the whole page's animation
//              timeline is stuck (hypothesis H1) and the stall + recovery are logged with times.
//   PROMPT   — every time the action panel's buttons change: the prompt wrapper's classes and,
//              after one full pulse cycle, a per-button verdict — LIVE (animation clock advanced)
//              or FROZEN (assigned but not advancing) — plus label, animation name, play state,
//              and aria-disabled.
//   BOX      — every class change on #pp4Prompt (radial / pp4Center / centered transitions).
//
// DELIBERATELY STANDALONE: imports nothing from the game (no engine, no state, no stage) — it
// reads the DOM only, so it cannot perturb determinism, replay, or module order. Loaded by
// main.js via dynamic import ONLY when the URL carries ?debug=pulse; costs zero when absent.
//
// THE UI: a small 🐛 chip (bottom-left). Its badge counts FROZEN findings. Tap → a copyable log.
// On a phone: tap the chip, tap "Copy log", paste into the chat.

const L = [];
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
let frozenCount = 0;
let chipEl = null;   // assigned when the chip is built below — push() runs before that
function refreshChip(){ if (chipEl) chipEl.textContent = frozenCount ? `🐛${frozenCount}` : "🐛"; }
const push = (k, d) => { L.push(`${ts()}  ${k}${d ? "  " + d : ""}`); if (L.length > 4000) L.splice(0, 500); refreshChip(); };

push("BEACON", `start ${new Date().toISOString()} ua=${navigator.userAgent.slice(0, 80)}`);

// ---- VIS: visibility transitions ------------------------------------------------------------
document.addEventListener("visibilitychange", () => {
  push("VIS", document.visibilityState);
});

// ---- CLOCK: the page-timeline liveness probe ------------------------------------------------
// A reference animation owned by this file (own keyframes, injected here, so no dependence on
// the game's stylesheet). While the page is visible its clock must advance ~2000ms between
// samples. A shortfall is the stuck-clock caught red-handed.
const style = document.createElement("style");
style.textContent = "@keyframes pbTick { from { opacity: .999; } to { opacity: 1; } }";
document.head.appendChild(style);
const probe = document.createElement("div");
probe.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;animation:pbTick 1s linear infinite;";
document.body.appendChild(probe);
let lastCt = null, stalled = false;
setInterval(() => {
  const a = probe.getAnimations && probe.getAnimations()[0];
  if (!a) { push("CLOCK", "NO-ANIMATION-OBJECT"); return; }
  const ct = a.currentTime;
  if (lastCt !== null) {
    const d = ct - lastCt;
    const visible = document.visibilityState === "visible";
    if (visible && d < 1200 && !stalled) { stalled = true; push("CLOCK", `STALLED (advanced ${Math.round(d)}ms of 2000 while visible)`); }
    else if (stalled && d > 1500) { stalled = false; push("CLOCK", `recovered (Δ ${Math.round(d)}ms)`); }
  }
  lastCt = ct;
}, 2000);

// ---- PROMPT + BOX: what the buttons are doing ------------------------------------------------
const box = () => document.getElementById("pp4Prompt");
const ap = () => document.getElementById("actionPanel");

/* MISSING vs none vs FROZEN, and the distinction is the whole bug (2026-08-25).
   The first version reported a bare "none" whenever getAnimations() came back empty, and the chip
   counted only FROZEN. So on the day the answer finally appeared on Wyatt's screen — a button
   whose stylesheet grants pp4Grow, whose computed play-state reads `running`, and which has NO
   animation object at all — the chip stayed blank and the finding sat unlabelled in the log text.
   A badge that cannot count the thing that actually happens is a badge that says "nothing found".
     MISSING = the CSS grants an animation and the engine never created one  <- THE FAULT
     none    = the CSS grants no animation (recipe cards, disabled controls) <- correct and normal
     FROZEN  = an animation exists and its clock is not advancing
     LIVE    = an animation exists and its clock advanced */
const verdictOf = (b, ct0) => {
  const a = b.getAnimations && b.getAnimations()[0];
  if (!a) {
    const n = getComputedStyle(b).animationName;
    return (n && n !== "none") ? "MISSING" : "none";
  }
  if (ct0 === null || ct0 === undefined) return "new";
  return (a.currentTime - ct0) > 200 ? "LIVE" : "FROZEN";
};

let lastSig = "";
const inspect = () => {
  const p = ap(); if (!p) return;
  const btns = [...p.querySelectorAll(".apBtn,.btlBtn")].filter(b => b.getBoundingClientRect().width > 2);
  const sig = btns.map(b => b.textContent.trim().slice(0, 10)).join("|");
  if (!sig || sig === lastSig) return;
  lastSig = sig;
  const bx = box();
  const cls = bx ? [...bx.classList].join(".") : "no-box";
  // first sample now, verdict one pulse-cycle later
  const t0s = btns.map(b => { const a = b.getAnimations && b.getAnimations()[0]; return a ? a.currentTime : null; });
  setTimeout(() => {
    const rows = btns.map((b, i) => {
      const cs = getComputedStyle(b);
      const v = verdictOf(b, t0s[i]);
      if ((v === "FROZEN" || v === "MISSING") && b.getAttribute("aria-disabled") !== "true") frozenCount++;
      return `${b.textContent.trim().slice(0, 14)}:${v}(${cs.animationName}/${cs.animationPlayState}${b.getAttribute("aria-disabled") === "true" ? "/dis" : ""})`;
    });
    push("PROMPT", `[${cls}] ${rows.join(" ")}`);
  }, 1300);
};
new MutationObserver(inspect).observe(document.body, { childList: true, subtree: true });
setInterval(inspect, 1500);   // belt: catch prompts the observer coalesced away

let lastBoxCls = "";
setInterval(() => {
  const bx = box(); if (!bx) return;
  const c = bx.className;
  if (c !== lastBoxCls) { push("BOX", c || "(none)"); lastBoxCls = c; }
}, 400);

// ---- the chip + copyable log -----------------------------------------------------------------
const chip = document.createElement("button");
chip.id = "pbChip";
chip.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:2147483000;width:44px;height:44px;" +
  "border-radius:50%;border:2px solid #f5a623;background:#12303a;color:#fff;font-size:18px;opacity:.85;";
chipEl = chip;
refreshChip();
document.body.appendChild(chip);
chip.onclick = () => {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;inset:0;z-index:2147483001;background:rgba(8,34,41,.92);" +
    "display:flex;flex-direction:column;padding:14px;gap:10px;";
  const ta = document.createElement("textarea");
  ta.readOnly = true;
  ta.value = L.join("\n");
  ta.style.cssText = "flex:1;font:11px/1.4 ui-monospace,Menlo,monospace;background:#fffdf2;color:#123;" +
    "border-radius:10px;padding:10px;white-space:pre;";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;";
  const mk = (label, fn) => { const b = document.createElement("button");
    b.textContent = label; b.style.cssText = "flex:1;font:600 15px system-ui;padding:12px;border-radius:10px;" +
      "border:none;background:#2aa9b8;color:#fff;"; b.onclick = fn; return b; };
  row.appendChild(mk("Copy log", async () => {
    try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand("copy"); }
  }));
  row.appendChild(mk("Close", () => wrap.remove()));
  wrap.appendChild(ta); wrap.appendChild(row);
  document.body.appendChild(wrap);
};

// exposed for the rig's probes (and for a desktop console: __pulseBeacon.log)
window.__pulseBeacon = { log: L, frozen: () => frozenCount };
