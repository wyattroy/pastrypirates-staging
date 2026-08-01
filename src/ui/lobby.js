// src/ui/lobby.js
//
// Phase 11 (SPLIT-03/06), wave 11-04. The lobby / room / welcome view cluster —
// showStep, requireName, renderSeatList, showHome, showRoom, showGameView,
// passGate, hideBootLoader, applyEngineBootstrapEffects. Extends 11-01/02/03's proven "move
// verbatim + rewire bare reads into imports + bridge grows + gates green" pattern.
//
// Deliberately NOT moved (11-analysis.json's `ui (DOM)` tier, net:[] classification): the
// room-lifecycle NET-CALLING functions — createRoom, joinRoom, watchRoom, startGame, beginGame,
// wireLobby — stay in the classic <script> region (as of 11-04; homed in src/orchestrator.js
// since 11-06). Those are orchestration (they call src/net/-backed functions directly), not pure
// views, and belong to the net-adjacent orchestration layer, not this UI-rendering cluster.
//
// 11-07 (bridge deletion fix): `buildPlayerRows` relocated OUT of this file into src/ui/util.js —
// see that file's own header note for why (a board.js<->lobby.js cycle risk this function's
// former home would have created). `wireWelcome` relocated OUT of this file into src/ui/flow.js —
// wireWelcome calls startSinglePlayer()/startPassAndPlay(), which live in flow.js (11-05); since
// flow.js already imports `passGate`/`requireName` FROM this file, this file importing
// startSinglePlayer/startPassAndPlay BACK from flow.js would close an import cycle
// module_graph_check.js's "no import cycle" assertion forbids. Relocating the one function that
// needs both directions resolves it with no seam and no cycle. `showStep`/`requireName` stay
// here (flow.js's wireWelcome imports both from this file, extending its existing import).
//
// Purity bar for src/ui/: reads DOM and game state, NEVER imports src/net/ (D-07).
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.
//
// Deviation ($ duplicate, mirrors 11-01/11-03/11-04's precedent): `$` is a classic-script-local
// `const $=id=>document.getElementById(id)` (index.html:863, pre-11-07), used ~120+ times across
// the ~183-function classic region far beyond this cluster's own consumers — reproduced verbatim
// as a private module-local helper instead of "moved".
//
// showGameView() calls syncBoardSizing() — already moved to src/ui/board.js in 11-03 — imported
// directly here (same ui/ tier, already-moved sibling) rather than left as a bare bridge read,
// per the established "reuse already-moved helpers by importing them" precedent.

import { appState } from "../state/index.js";
import {
  HEXCOL, DEVICE_IMG, ANCHOR_IMG, CLOCK_IMG, FLIP_SOCKET_IMG, HOURGLASS_IMG,
  CLOSE_X_IMG, iconImg, emojify, unusedDefaultName,
} from "../shared/index.js";
import { pname, pn, getLastName, saveLastName } from "./util.js";
// F2/UI-06 (2026-07-29): escHtml's only use here was the duplicate seat-name rendering that this
// task removed. The remaining name rendering escapes through pn() -> pname() -> escHtml, so the
// escaping is preserved and this import is now dead — dropped rather than left (D-33/D-34/D-40).
import { syncBoardSizing } from "./board.js";

const $=id=>document.getElementById(id);

/* ================= KOFI-01 — the Ko-Fi panel, embedded in our own modal ================= */
// Wyatt, 2026-07-31: "i don't want this button to open up the kofi website; ideally, i want it to
// open up the kofi widget." So the footer button and the Credits button both open #kofiModal, which
// holds Ko-Fi's own embedded donation panel. The player never leaves the game.
//
// WHY NOT the floating-chat overlay snippet he sent first. That script draws its OWN permanent
// button, and it lives inside a CROSS-ORIGIN iframe (verified in a browser: contentDocument threw).
// Nothing on our page can click into it, so "our button opens their widget" is not achievable that
// way at all — it would have meant accepting a second, always-on button floating over the board.
// The embed URL below is the same widget, hosted in a frame we control the size and placement of.
//
// Loaded on FIRST OPEN, never at boot: a player who never opens it never contacts ko-fi.com. The
// src is set here rather than in the markup precisely so that stays true.
const KOFI_EMBED="https://ko-fi.com/wyattroy/?hidefeed=true&widget=true&embed=true&preview=true";
let kofiMounted=false;
export function mountKofi(){
  const host=$("kofiPanel");
  if(!host||kofiMounted)return;
  kofiMounted=true;
  const f=document.createElement("iframe");
  f.src=KOFI_EMBED;
  f.title="Support Pastry Pirates on Ko-fi";
  f.setAttribute("loading","lazy");
  // payments live in the frame, so it needs scripts, forms and same-origin to ko-fi.com; it gets
  // nothing else, and top-navigation is NOT granted — a frame cannot yank the player out of a game.
  f.setAttribute("sandbox","allow-scripts allow-forms allow-popups allow-same-origin");
  // An ad-blocker eating this is common and expected. Say so plainly rather than leaving an empty
  // box, and name ko-fi.com so the player can go there themselves if they want to.
  f.onerror=()=>{kofiMounted=false;host.innerHTML='<div class="muted" style="padding:14px;text-align:center">Couldn\'t load the Ko-Fi panel — an ad blocker may be blocking it. ko-fi.com/wyattroy works directly.</div>';};
  host.innerHTML="";
  host.appendChild(f);
}
export function openKofi(){
  const m=$("kofiModal");
  if(!m)return;
  m.style.display="flex";
  mountKofi();
}

/* ================= welcome modal ================= */
export function showStep(id){
  ["stepChoose","stepHost","stepJoin","stepPassPlay"].forEach(s=>{$(s).style.display=(s===id?"":"none");});
}
// FIX-01: the single read chokepoint every caller goes through. Was a direct read of the
// welcome-screen input's value — that field is gone (D-01); the persisted last-used name
// (pp_lastName, via getLastName()) is now the source of truth, confirmed/updated by the name
// modal's confirmName().
export function requireName(){
  const v=(getLastName()||"").trim();
  // solo/host player always sits at seat 0, so an unset/blank persisted name defaults to seat 0's
  // captain via unusedDefaultName(null,0) rather than DEFAULT_NAMES[0] directly, so the
  // collision-safe helper stays the single source of default names — deterministic, and can't
  // clash with the bots that fill seats 1-3.
  return v?v.slice(0,40):unusedDefaultName(null,0);
}

/* ================= name modal (FIX-01) ================= */
// D-03: the same modal appears before all four mode cards. Each caller in wireWelcome() opens it
// with a continuation (`next`) carrying that mode's remaining body; confirmName() resolves the
// name, persists it, and invokes the stored continuation with the resolved name as its argument.
let pendingNameAction=null;
export function openNameModal(next){
  pendingNameAction=next;
  $("nameModalInput").value=requireName();
  $("nameModal").style.display="flex";
  $("nameModalInput").focus();
  $("nameModalInput").select();
}
export function confirmName(){
  // guard: a second invocation with no pending action (e.g. a stray dismiss handler firing twice)
  // is a no-op, not a throw.
  if(!pendingNameAction)return;
  const raw=($("nameModalInput").value||"").trim().slice(0,40);
  const name=raw||unusedDefaultName(null,0);
  // RAW trimmed string, NOT HTML-escaped here — escaping already happens once at render time
  // inside pname() (./util.js), which reads appState.roster[i].name. A second escape at this write
  // site would double-escape legitimate names containing "&" or "<".
  saveLastName(name);
  $("nameModal").style.display="none";
  const next=pendingNameAction;
  pendingNameAction=null;
  next(name);
}

// P10 — D-02 REVERSED by Wyatt, 2026-08-01: "the x close button doesn't take you back to home, it
// starts the game onwards."
//
// D-02 originally made all three dismissal routes (✕, Escape, backdrop) CONFIRM the shown name,
// reasoning that "just close" would strand a player mid-mode-pick with no captain resolved. That
// reasoning holds against a bare close — but the answer is not to proceed. It is to CANCEL back to
// the home screen, which resolves the stranding just as completely (no half-entered state survives)
// while doing what a ✕ universally means. A close control must never advance.
//
// All three routes are changed together, deliberately: D-02 made them identical on purpose, and
// leaving ✕ cancelling while Escape and the backdrop still confirmed would be worse than either
// rule applied consistently.
//
// There is no Escape handling anywhere else in this codebase (RESEARCH.md, confirmed at plan
// time) — the document-level keydown listener below is new machinery, not reuse.
// P10: dismissing the name modal returns to the mode-choice screen instead of proceeding. Hides the
// overlay first so showHome() paints over a closed modal, and drops the pending continuation so no
// half-started mode is left armed behind it.
function cancelName(){
  const overlay=$("nameModal");
  if(overlay)overlay.style.display="none";
  pendingNameAction=null;
  showHome();
}
let nameModalWired=false;
export function wireNameModal(){
  if(nameModalWired)return; // idempotent: a second call adds no second button, no duplicate listener
  nameModalWired=true;
  const overlay=$("nameModal");
  if(!overlay)return;
  const card=overlay.querySelector(".modalCard");
  if(card&&!card.querySelector(".modalX")){
    card.style.position="relative";
    const x=document.createElement("button");
    x.className="modalX";x.type="button";x.innerHTML=iconImg(CLOSE_X_IMG);x.setAttribute("aria-label","Close");
    x.onclick=()=>{cancelName();};
    card.insertBefore(x,card.firstChild);
  }
  // backdrop click: only when the click lands on the overlay itself, not a click that bubbles up
  // from inside the card.
  overlay.addEventListener("click",e=>{if(e.target===overlay)cancelName();});
  // Escape: only while this overlay is the one currently visible, so Escape pressed elsewhere
  // (e.g. inside another modal) does nothing here.
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&overlay.style.display!=="none")cancelName();});
}

/* ================= lobby / room ================= */
export function showHome(){
  showStep("stepChoose");
  $("lobby").style.display="flex";$("lobbyRoom").style.display="none";
  $("game").style.display="";$("game").classList.add("bg-blurred");
}
export function showRoom(){
  $("lobby").style.display="none";$("lobbyRoom").style.display="flex";
  $("game").style.display="";$("game").classList.add("bg-blurred");
  $("roomCode").textContent=appState.room;
}
export function showGameView(){
  $("lobby").style.display="none";$("lobbyRoom").style.display="none";
  $("game").style.display="";$("game").classList.remove("bg-blurred");
  syncBoardSizing();
}

/* ================= pass & play: hand the device to the next seat ================= */
// Blocks until whoever is about to act taps through, blurring the board underneath so nothing
// from the outgoing seat's turn lingers on screen while the device changes hands. A no-op
// outside Pass & Play, for the seat that already has the device, and during replay (a reload
// should replay straight through with no hand-off prompts, same as every other decision).
export function passGate(seatIdx){
  if(!appState.passAndPlay||seatIdx===appState.mySeat)return Promise.resolve();
  if(appState.replaying){appState.mySeat=seatIdx;return Promise.resolve();} // silently keep mySeat in sync so it's
  // already correct the moment replay catches up to the live edge — no UI shown mid-replay
  return new Promise(res=>{
    $("game").classList.add("bg-blurred");
    // NARR-01/D-25 (Wyatt-approved 2026-07-29).
    // @copy misc.lobby.passmessage
    $("passOverlayMsg").innerHTML=`${iconImg(DEVICE_IMG)} Pass the board to<br><span style="color:${HEXCOL[seatIdx]}">${pname(seatIdx)}</span>`;
    const btn=$("passHelmBtn");
    // @copy misc.lobby.passbutton
    btn.innerHTML=`${iconImg(ANCHOR_IMG)} ${pname(seatIdx)} at the helm!`;
    btn.style.background=HEXCOL[seatIdx];btn.style.borderColor=HEXCOL[seatIdx];
    $("passOverlay").style.display="flex";
    btn.onclick=()=>{
      $("passOverlay").style.display="none";
      $("game").classList.remove("bg-blurred");
      appState.mySeat=seatIdx;
      res();
    };
  });
}

export function renderSeatList(seats){
  let html="";
  for(let i=0;i<appState.numSeats;i++){
    const s=seats[i]||{bot:true};
    const me=(s.id===appState.myId);
    let label;
    // BOT-01: no personality picker — every captain's temperament is fixed (see SEAT_BOT_STRAT)
    // D-29 RESOLVED (Wyatt-approved 2026-07-29): every player-facing string in this file speaks the
    // pirate register — the 2nd-person pronouns become ye/yer/yers/yerself. Applied as a one-time source
    // transformation using art-review/narration-core.js's own PIRATE_RE/PIRATE_MAP as the spec — the one
    // declaration site in the repo, imported by the audit page, the health gate and ui_contract_check.js
    // alike (the
    // page ran it LIVE at render, so a card tagged `keep` displayed the converted text — under D-25 that
    // converted text is what he approved). No runtime helper is shipped for it: a pirateVoice() nothing
    // calls would be dead code, which D-33/D-34/D-40 exist to prevent. Comments and identifiers are out
    // of scope. scripts/ui_contract_check.js now gates this permanently.
    // F1 + UI-06 (Wyatt-approved 2026-07-29, 15-PLAYTEST-NOTES.md): two fixes in two lines.
    //
    // F1 — THE LABEL CLASS. The pirate register (D-29) applies to text the game SPEAKS. This is not
    // speech: it is a demonstrative LABEL pointing at a seat to say "this row is the reader". No
    // verb, no sentence, not the game's voice — UI chrome, so it takes plain "you". `name — ye` is
    // not pirate, it is a grammar error: `ye` is a pronoun standing in for a person, so a bare
    // `Wyatt — ye` reads "Wyatt — thou" rather than "Wyatt — that's the one that's you". The ~50
    // in-sentence ADDRESS sites in this codebase are correct as ye/yer and none of them change.
    // scripts/ui_contract_check.js carries a named, content-anchored, staleness-checked exception
    // for exactly these three label sites, so a later pass cannot "fix" them back.
    //
    // F2/UI-06 — ONE NAME PER SEAT. `label` used to begin with the seated player's name while the
    // template also rendered `pn(i)`, so a joined human printed twice ("Wyatt — Wyatt — ye", his
    // screenshot). `label` is now the SUFFIX only, and `pn(i)` is the single name rendering — which
    // also keeps the HTML escaping where it already was (pn -> pname -> escHtml), rather than
    // re-implementing it here. The separator is suppressed when the suffix is empty, so another
    // human's seat is the bare name. UI-06's three renderings exactly: `{name} — you` for the
    // reader, `{name}` for another human, `{captain default} — 🤖 bot` for an empty seat.
    if(s.id)label=me?"you":"";
    else label="🤖 bot";
    html+=`<div class="seat ${me?"me":""}">
      <span class="nm">${pn(i)}${label?` — ${label}`:""}</span></div>`;
  }
  $("seatList").innerHTML=emojify(html);
  if(appState.isHost){
    $("btnStart").style.display="";
    // NARR-01/D-25/D-50 (Wyatt-approved 2026-07-29): applied verbatim; {clock/stopwatch} resolves
    // to the hourglass (D-50 RESOLVED — this is a "waiting for players" moment, not a control).
    // @copy misc.lobby.waitcaption
    $("waitMsg").innerHTML=`${iconImg(HOURGLASS_IMG)} Yer mateys will appear above as they join. Wait for them before clicking start. Empty seats are played by botpirates — and they're feisty.`;
  }else{
    $("btnStart").style.display="none";
    $("waitMsg").textContent="Waiting for the host to start the voyage…";
  }
}

export function hideBootLoader(){
  const b=$("bootLoader");if(!b||b.classList.contains("hidden"))return;
  b.classList.add("hidden");
  setTimeout(()=>{if(b.parentNode)b.remove();},600);
}
export function applyEngineBootstrapEffects(){
  document.documentElement.style.setProperty("--clock-img",`url(${CLOCK_IMG})`);
  document.documentElement.style.setProperty("--flip-socket-img",`url(${FLIP_SOCKET_IMG})`);
  // One-time sweep of the static page markup (lobby, modals, footer buttons) — that HTML is
  // authored with plain emoji same as every narration string, but it never passes through
  // describe()/panel() since it's just sitting in the DOM from page load, not built at runtime.
  // Rewriting document.body here, before any element-lookup/event-wiring below runs, catches every
  // static occurrence in one pass (ids and structure survive — only text content changes) instead
  // of hunting down and hand-editing each one individually.
  document.body.innerHTML = emojify(document.body.innerHTML);
}
