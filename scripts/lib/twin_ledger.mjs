/* THE TWIN LEDGER — the same game fact, watched on two screens, joined on the wire's own serial.
 *
 * ONE HELM. A ship has one wheel. When two screens decide the same fact in two places, one of them
 * is a second helm — and the way that shows up for a player is not a wrong number, it is a RIGHT
 * number that arrives in the wrong order. Wyatt, 2026-09-18, of a crew game: "guest never saw coin
 * go into their purse when musing ON THEIR TURN -- it was added to the beginning of their following
 * turn!"
 *
 * WHY THE INSTRUMENT THAT EXISTS COULD NOT SEE IT, precisely — this is the whole justification for
 * building anything new. scripts/lib/seat_parity.mjs compares the two screens' STATE and asks "do
 * they agree right now?". Two things stop it: compareWhenSettled (:135) only compares once both
 * screens have stood still for three consecutive reads, which a screen mid-turn never does; and
 * confirmDivergence (:163) throws away any disagreement that heals inside windowMs = 10000. The
 * muse-coin fault was 6,989 ms. THE FAULT WAS SMALLER THAN THE FORGIVENESS — and that window is not
 * a bug, it is there because Wyatt ruled a guest may be "a moment apart". A snapshot comparator
 * cannot be made strict enough to see this class of fault without becoming unusable. You have to
 * change the question from STATE to SEQUENCE. That is what this file does.
 *
 * THE JOIN KEY IS THE ENGINE EVENT'S SERIAL `n`, and nothing else. The host stamps it on the wire
 * copy (src/orchestrator.js:1566 — deliberately on the copy, never on the engine's own event) and
 * the guest stores it (:2065), so BOTH SCREENS HOLD THE IDENTICAL INTEGER FOR THE IDENTICAL GAME
 * FACT for free. On the host the engine's own events carry no `n`, but the array index IS the
 * number (wire.n = appState.evPushed, which is that index), so the recorder falls back to it.
 * ⛔ DO NOT INVENT A SECOND MATCHER. scripts/qa/q18_narr_lag_probe.mjs's header records what it
 * costs: matching two screens' logs by FIRST occurrence instead of k-th fabricated a 63-second hold.
 *
 * EVERYTHING IS MEASURED FROM THE MOMENT EVENT n ARRIVED ON THAT SCREEN. That single choice removes
 * network latency, machine speed and screen size from every number, which is what makes the
 * comparison quiet enough to be believed. It is also the measurement that isolates the muse coin:
 * the fault was a REACTION fault, not an ARRIVAL fault (the dock control landed at 647 ms on both
 * screens before the fix).
 *
 * IT IS A REPORT, NEVER A GATE. It produces a RANKED list of candidates with the raw rows it is
 * arguing from, and its proper end state for anything real is a new STATIC gate. docs/QA-PROCESS.md
 * §2c: a red nobody runs accuses the code of its own bugs, and it goes for his RULINGS first.
 */

/* ── THE PAGE-SIDE RECORDER ────────────────────────────────────────────────────────────────────
   Installed in BOTH pages with Page.addScriptToEvaluateOnNewDocument, before any game script runs.
   It makes NO production change and needs none — every witness below is already reachable from the
   page, and scripts/ui_contract_check.js's allowlist of retained globals means a new window. hook
   would fail a gate anyway.

   THE FIVE TIMESTAMPS, each verified in the source before it was written down:
     t0  the event arrives on THIS screen   appState.game.events grows; e.n read
     t1  the words begin                    a .pp4Bub is put on the stage (src/ui/stage.js:1962-1969)
     t2  the coin is let go                 an animation with id "treasure" starts (src/ui/board.js:2281)
     t3  it lands, and credits              the treasure animation finishes (board.js:2286 onfinish),
                                            the purse number changes and `pulse` is re-added (board.js:2090-2093)
     t4  the chink                          a tagged buffer source starts (board.js:2095 -> coinArrived)

   ⚠ THE SOUND IS NAMED FROM OUTSIDE THE APP, AND NEVER BY BUFFER DURATION.
   scripts/muse_coin_arrival_probe.mjs:23 identifies the chink by Math.abs(duration-1.05)<.05, which
   breaks the first time a stem is re-exported. audio.js:444's `const buffers` is not exported and
   play() is an ES-module binding, so the page cannot reach either. So: tag each decoded AudioBuffer
   with the URL it was fetched from (audio.js:619-621 is fetch -> arrayBuffer -> decodeAudioData) and
   read the tag back in a patched start(). Named sounds, zero source change.

   There is no console line anywhere on this path (src/ui/board.js has one console.* call in 3,292
   lines; src/ui/audio.js has none), so the DOM and the animations are the only witnesses — and the
   recorder has to be page-side and frame-rate, because a CDP round trip per sample cannot see t2. */
export const RECORDER_SRC = `(function(){
if(window.__TL)return;
var TL=window.__TL={ev:[],words:[],anim:[],animEnd:[],purse:[],pulse:[],snd:[],seat:null,host:null,t:0,err:null};
var bub=[];
try{
  var U=new WeakMap(), N=new WeakMap(), F=window.fetch;
  window.fetch=function(){
    var u=String((arguments[0]&&arguments[0].url)||arguments[0]||"");
    return F.apply(this,arguments).then(function(r){
      try{ var ab=r.arrayBuffer.bind(r);
        r.arrayBuffer=function(){ return ab().then(function(b){ try{U.set(b,u);}catch(e){} return b; }); };
      }catch(e){}
      return r; });
  };
  var B=window.BaseAudioContext&&window.BaseAudioContext.prototype;
  if(B&&B.decodeAudioData){
    var D=B.decodeAudioData;
    B.decodeAudioData=function(buf,ok,bad){
      var u=U.get(buf);                                   // read BEFORE decoding: decode detaches the buffer
      return D.call(this,buf).then(function(b){
        try{ if(u) N.set(b,String(u).split("?")[0].split("/").pop().replace(/\\.[a-z0-9]+$/i,"")); }catch(e){}
        if(ok)ok(b); return b;
      },function(e){ if(bad)bad(e); throw e; });
    };
  }
  var P=window.AudioBufferSourceNode&&window.AudioBufferSourceNode.prototype;
  if(P&&P.start){ var S=P.start;
    P.start=function(){ try{ TL.snd.push([performance.now(),(this.buffer&&N.get(this.buffer))||"?"]); }catch(e){} return S.apply(this,arguments); }; }
}catch(e){}
/* ⚠ THE WORDS ARE FOUND BY SCANNING, NOT BY A MutationObserver ON document.documentElement.
   Measured on the pre-fix tree, 2026-09-18: that observer recorded ZERO bubbles in a 333-second
   voyage and the whole WORDS column came back empty — this script runs at document-START, where
   document.documentElement is still null, so .observe() threw into the try above and the channel was
   silently dead. A channel that is silently dead reads exactly like a channel with nothing in it.
   The rAF scan cannot fail that way and its precision (one frame) is the same as every other witness
   here. */
var watched={};
function watchPurse(el){
  if(watched[el.id])return; watched[el.id]=1; var s=+el.id.slice(5);
  try{ new MutationObserver(function(){ if(el.classList.contains("pulse")) TL.pulse.push([performance.now(),s]); })
        .observe(el,{attributes:true,attributeFilter:["class"]}); }catch(e){}
}
function watchAnim(a,id,s){ try{ a.finished.then(function(){ TL.animEnd.push([performance.now(),id,s]); },function(){}); }catch(e){} }
var seen=0,last={};
(function frame(){
  var now=performance.now(); TL.t=now;
  try{
    var st=window.__pp_app_state_debug?window.__pp_app_state_debug():null;
    if(st){
      TL.seat=st.mySeat; TL.host=!!st.isHost;
      var E=st.game&&st.game.events;
      if(E){
        if(E.length<seen)seen=E.length;                   // a new voyage: the array was replaced
        for(;seen<E.length;seen++){ var e=E[seen]||{}; TL.ev.push([now,(e.n==null?seen:e.n),e.t,(e.p==null?null:e.p)]); }
      }
    }
    var A=document.getAnimations();
    for(var i=0;i<A.length;i++){
      var a=A[i]; if(a.__tl||!a.id)continue; a.__tl=1;
      var tg=a.effect&&a.effect.target, sd=tg&&tg.dataset&&tg.dataset.seat;
      var s=(sd==null||sd==="")?null:+sd;
      TL.anim.push([now,a.id,s]); watchAnim(a,a.id,s);
    }
    var W=document.querySelectorAll(".pp4Bub");
    for(var q=0;q<W.length;q++){ if(W[q].__tl)continue; W[q].__tl=1; TL.words.push([now,""]); bub.push(W[q]); }
    var C=document.querySelectorAll("[id^=coins] .coinN");
    for(var k=0;k<C.length;k++){
      var nEl=C[k], par=nEl.parentElement, pid=par&&par.id||"";
      if(!/^coins[0-9]+$/.test(pid))continue;
      watchPurse(par);
      var txt=nEl.textContent;
      if(last[pid]!==txt){ if(last[pid]!==undefined) TL.purse.push([now,+pid.slice(5),+last[pid],+txt]); last[pid]=txt; }
    }
    for(var b=Math.max(0,bub.length-12);b<bub.length;b++){
      var s2=(bub[b].textContent||"").trim();             // the typewriter reveals progressively: keep the longest
      if(TL.words[b]&&s2.length>TL.words[b][1].length) TL.words[b][1]=s2;
    }
  }catch(e){ TL.err=String(e&&e.message||e).slice(0,160); }
  requestAnimationFrame(frame);
})();
})();`;

/* ── THE FILTERS, DECLARED (RUN-RULES, 2026-09-18: every filter declares itself on EVERY run,
      including the zeroes, and says which way its error runs) ─────────────────────────────────── */
export const HORIZON_MS = 15000;   /* the longest after an event's arrival that a channel may still be
   claimed as that event's reaction. It must exceed AFTER_LINE_CAP_MS (src/ui/util.js, 8000) or the
   very fault this exists to catch would be filtered out. ERROR DIRECTION: it can only turn a very
   late reaction into a MISSING one — it can never invent a difference between two screens, because
   the same horizon is applied to both. */

const CH = ["words", "flies", "lands", "number", "chink"];

/* ── ONE SCREEN'S ROWS ──────────────────────────────────────────────────────────────────────────
   TWO ATTRIBUTIONS, deliberately, because they answer two different questions and neither one can
   answer both. SAY WHICH IS WHICH IN EVERY ARGUMENT THE REPORT MAKES.

   REACH — first occurrence at or after t0, within the horizon, whether or not a later event has
   arrived in between. This is the muse probe's own rule and it is the ONLY one under which a
   reaction that ran a whole turn late is still attributed to the event that caused it. It is what
   the TABLE prints and what `turns` is counted over, so the table is the same measurement the
   muse-coin fix printed. It over-claims by construction: an event that draws nothing can reach
   forward to a later event's coin. That over-claim is applied IDENTICALLY on both screens, so it
   cannot by itself manufacture a difference — but it is why a lone REACH number is never a finding.

   OWN — the strict attribution: each observation belongs to the LATEST event that had arrived when
   it happened. Every observation is owned once, by one event. This is what the MISSING REACTION
   rule reads, because "the host flew a coin for event n and the guest never did" has to mean the
   guest's screen drew nothing there, not that it drew something late.
   ⭐ THE MUSE COIN SHOWS UP IN BOTH, DIFFERENTLY, and that is the check on each: under OWN the
   guest's muse row simply has no coin (rule 1), and under REACH it has one that crossed a turn
   boundary (rule 2). Two independent statements of one fault.

   `turns` — HOW MANY TIMES THE WHEEL CHANGED HANDS BEFORE THIS EVENT HAD FINISHED BEING DRAWN.
   The column from the muse-coin fix's own table (git show fe5ad352), where the guest's muse row read
   1 and every other row read 0. It counts `turn` events that arrived between this event's arrival
   and its last REACHED channel — Wyatt's own sentence for the fault ("it was added to the beginning
   of their following turn"). It is an ORDERING, not a duration, and needs no threshold. `evs`
   beside it is the same window counted in all events: printed, never judged. */
export function ledger(raw, { horizon = HORIZON_MS } = {}) {
  const seat = raw.seat, end = raw.t || 0;
  const ev = (raw.ev || []).map(([t, n, kind, p]) => ({ t0: t, n, kind, p: p == null ? null : p, local: p != null && p === seat }));
  ev.sort((a, b) => a.t0 - b.t0);
  const anim = raw.anim || [], animEnd = raw.animEnd || [], purse = raw.purse || [], snd = raw.snd || [], words = raw.words || [];
  const reach = (list, t0, ok) => { for (const r of list) { if (r[0] < t0 || r[0] > t0 + horizon) continue; if (!ok || ok(r)) return r; } return null; };
  /* OWN: walk the events backwards from an observation's time to find the newest one that had arrived. */
  const ownerOf = t => { for (let i = ev.length - 1; i >= 0; i--) if (ev[i].t0 <= t) return (t - ev[i].t0 <= horizon) ? i : -1; return -1; };
  const own = ev.map(() => ({ words: null, flies: null, lands: null, number: null, chink: null, snd: new Set(), anim: new Set() }));
  const give = (list, pick) => { for (const r of list) { const i = ownerOf(r[0]); if (i >= 0) pick(own[i], r, ev[i]); } };
  give(words, (o, r) => { if (o.words == null) { o.words = r[0]; o.text = r[1]; } });
  give(anim, (o, r, e) => { o.anim.add(r[1]); if (r[1] === "treasure" && (e.p == null || r[2] == null || r[2] === e.p) && o.flies == null) o.flies = r[0]; });
  give(animEnd, (o, r, e) => { if (r[1] === "treasure" && (e.p == null || r[2] == null || r[2] === e.p) && o.lands == null) o.lands = r[0]; });
  give(purse, (o, r, e) => { if ((e.p == null || r[1] === e.p) && o.number == null) o.number = r[0]; });
  give(snd, (o, r) => { o.snd.add(r[1]); if (r[1] === "coin-chink" && o.chink == null) o.chink = r[0]; });

  const rows = [];
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i], t0 = e.t0;
    const mine = r => e.p == null || r[2] == null || r[2] === e.p;      // the actor's own purse / the coin heading for it
    const w = reach(words, t0);
    const R = {
      words: w && Math.round(w[0] - t0),
      flies: (x => x && Math.round(x[0] - t0))(reach(anim, t0, r => r[1] === "treasure" && mine(r))),
      lands: (x => x && Math.round(x[0] - t0))(reach(animEnd, t0, r => r[1] === "treasure" && mine(r))),
      number: (x => x && Math.round(x[0] - t0))(reach(purse, t0, r => e.p == null || r[1] === e.p)),
      chink: (x => x && Math.round(x[0] - t0))(reach(snd, t0, r => r[1] === "coin-chink")),
    };
    const last = Math.max(0, ...CH.map(c => R[c] == null ? 0 : R[c]));
    const o = own[i];
    rows.push({
      n: e.n, kind: e.kind, p: e.p, local: e.local, t0m: Math.round(t0), ...R,
      own: { words: o.words && Math.round(o.words - t0), flies: o.flies && Math.round(o.flies - t0), lands: o.lands && Math.round(o.lands - t0), number: o.number && Math.round(o.number - t0), chink: o.chink && Math.round(o.chink - t0) },
      snd: [...o.snd].sort(), anim: [...o.anim].sort(),
      turns: last ? ev.filter(x => x.kind === "turn" && x.t0 > t0 && x.t0 <= t0 + last).length : 0,
      evs: last ? ev.filter(x => x.t0 > t0 && x.t0 <= t0 + last).length : 0,
      text: o.text || null,
      complete: t0 + horizon <= end,     // its whole horizon was watched: absence here means absence
    });
  }
  return { seat, host: !!raw.host, rows, bubbles: words.length, err: raw.err || null, spanMs: Math.round(end), dropped: rows.filter(r => !r.complete).length };
}

/* ── THE FINDING RULES — ORDER AND CONTENT, NEVER RATE ─────────────────────────────────────────
   Not an invention. Wyatt's ruling, docs/INTENDED-BEHAVIOUR.md:84: "Neither is a difference in RATE
   — only a difference in CONTENT or ORDER." And his ARCH ruling (:365): "same sequence, never a
   different script — possibly a moment apart".
     1. A MISSING REACTION  — a channel fired on one screen and never on the other. Threshold-free.
     2. A CROSSED BOUNDARY  — `turns` differs. An ordering, not a duration. This is the muse coin.
     3. DIFFERENT CONTENT   — the words drawn differ, after the viewer-relative wording is normalised.
   PURE LATENESS IS NEVER A FINDING. It is printed as an observation and left for a person. The
   storm's 0.8 s and every other rate difference lands there, deliberately.

   DEMOTION, not escalation, when the two screens were not in the same position. The one display
   door takes exactly two inputs — the event, and whether this screen is where the choice was made
   (CLAUDE.md; orchestrator.js:1954). A screen being ASKED legitimately draws a prompt, a slider and
   gold squares that a watching screen must not. So compare asked-to-asked and watching-to-watching;
   where `local` differs, the finding is demoted by construction rather than by an allowlist. This is
   the same discipline seat_parity.mjs:33 practises and the same one it got wrong once (#prow vs
   #prowRecipe, a private recipe reported as a divergence twice in 60 seconds). */
const norm = s => String(s || "")
  .replace(/\s+/g, " ")
  .replace(/\b(ye|yer|ye're|yours|you|your)\b/gi, "«you»")
  .replace(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)?/g, m => (/^(The|A|An|And|But|Ye|Yer)$/.test(m) ? m : "«name»"))
  .trim().toLowerCase();

/* ── WHAT IS NOT A GAME FACT, AND SO IS NOT COMPARED ────────────────────────────────────────────
   1. THE AMBIENCE. src/ui/audio.js's AMBIENCE_FILES — the sea, the gulls, the creaking ropes — is
      deliberately random and runs on each device's own clock. Comparing a gull between two screens
      is comparing two coin tosses. The list is DERIVED from that array, never typed here.
   2. ANYTHING THE SCREEN DOES ALL THE TIME. A named animation or sound that turns up in more than
      AMBIENT_SHARE of one screen's event windows is not a reaction to any particular event — it is
      the boat bobbing. This is measured from the run itself rather than kept in a list, so a new
      idle animation added tomorrow is handled without anyone remembering to edit this file.
   ERROR DIRECTION, both: they can only REMOVE candidates, never add one. If either is too greedy
   the report is quieter than the truth — so every excluded name is PRINTED with its share, and a
   real reaction wrongly excluded is visible there rather than silently gone. */
export const AMBIENT_SHARE = 0.4;
export function ambientOf(A, B, declared = [], localOnly = []) {
  const out = new Map(declared.map(d => [d, "declared in AMBIENCE_FILES / MUSIC_FILE (src/ui/audio.js)"]));
  /* 3. THE SOUNDS THAT ARE MEANT TO BE HEARD ON ONE SCREEN ONLY. src/ui/audio.js's
     LOCAL_ONLY_SOUND_EVENTS is Wyatt's own ruling (T-073, s4/q4: "Your Turn should use the Bell SFX
     sound"), and the bell is deliberately played only on the screen whose turn it is. Comparing it
     across two screens reports his decision as a defect — which docs/QA-PROCESS.md §2c says is the
     commonest way an instrument goes wrong here. Derived from that Set, never typed. */
  for (const s of localOnly) if (!out.has(s)) out.set(s, "played only on the screen it belongs to — LOCAL_ONLY_SOUND_EVENTS (src/ui/audio.js), his T-073 ruling");
  for (const L of [A, B]) {
    const rows = L.rows.filter(r => r.complete); if (!rows.length) continue;
    const tally = new Map();
    for (const r of rows) for (const v of [...r.snd, ...r.anim]) tally.set(v, (tally.get(v) || 0) + 1);
    for (const [v, k] of tally) if (k / rows.length > AMBIENT_SHARE && !out.has(v)) out.set(v, `on ${Math.round(100 * k / rows.length)}% of this run's events — the screen does it all the time`);
  }
  return out;
}

/* THE REPEAT BAR. "Nothing is a finding until it reproduces" — the muse coin was 5 of 5, so the bar
   is reachable. A one-off difference in a free-form channel (a sound, an animation) is a moment, not
   a fault; the five named coin channels are exempt because they are the game's own doors and a
   single silent coin is worth a look. Everything below the bar is COUNTED and reported as a count. */
export const BAR = { k: 2, ratio: 0.2 };

/* ⚠ THE BOUNDARY FLIP, AND THE FILTER THAT ANSWERS IT — measured on dev, 2026-09-18, by this
   instrument against itself. Strict ownership gives every observation to the newest event that had
   arrived. When two events land milliseconds apart — `turn` then `sail`, `openoffer` then `trade` —
   a reaction that falls between them is owned by `turn` on one screen and by `sail` on the other,
   and the ledger reported FOUR separate MISSING REACTIONS for one thing that in fact happened on
   both screens. The tell was the ratio: 22 of 42 and 22 of 43, which is a coin toss, not a fault.
   So presence is read over a small NEIGHBOURHOOD: a channel counts as present on event n if n or any
   event that arrived within NEAR_MS of n owns it.
   ERROR DIRECTION: it can only make the report QUIETER. It cannot invent a difference — it only ever
   turns "absent" into "present". A real missing reaction longer than NEAR_MS still reports, which is
   why the muse coin (six and a half seconds) is untouched by it. */
export const NEAR_MS = 600;

/* ⭐ THE TALLY — WHAT EACH SCREEN DREW IN TOTAL, and the single most useful line in the report.
   Measured on dev, 2026-09-18: the ledger's top NINE findings were all `trade`, all 14 of 14, all
   "on the guest and not on the host" — and the tally settled every one of them in thirty seconds.
   trade-swap 21 and 21. crate-land 32 and 32. coins-across 9 and 9. coin-chink 55 and 55. The two
   screens drew the very same things the very same number of times; what differed was WHICH EVENT'S
   WINDOW each drawing fell in, because the host's engine emits a trade and then waits 4.35 s before
   the next event while the guest's feed delivers the two 15 ms apart. Same drawings, different
   labels. A per-event bag cannot tell those apart; a total can.
   So a set-channel difference whose TOTALS AGREE is demoted, with that sentence as its reason. */
export const tally = L => {
  const t = { snd: new Map(), anim: new Map(), words: 0 };
  for (const r of L.rows) { for (const v of r.snd) t.snd.set(v, (t.snd.get(v) || 0) + 1); for (const v of r.anim) t.anim.set(v, (t.anim.get(v) || 0) + 1); }
  t.words = L.bubbles;   // the bubbles the screen actually put up, not the rows that own one
  return t;
};
/* The same argument for the WORDS channel, which has no name to tally by: if the two screens wrote
   about the same NUMBER of lines over the voyage, a per-event difference is a line filed under a
   neighbouring event, not a line nobody wrote. 10% because a voyage's last few lines are still being
   written when the capture is taken; it is printed either way, so the reader can disagree. */
export const SAME_WORDS = 0.1;

/* ── WHAT THIS STILL GETS WRONG, measured on dev 2026-09-18 and left here rather than re-derived ──
   1. THE FIVE COIN CHANNELS ARE NEVER DEMOTED BY THE TALLY, only by nothing at all. `trade · chink`
      still reports although coin-chink was played 35 times on both screens, because a silent coin is
      worth a person's look and the tally line sits directly above the finding. The obvious next
      step is to let the tally demote `chink` (coin-chink), `flies` and `lands` (the `treasure`
      animation) the same way it demotes the sets — DELIBERATELY NOT DONE HERE, because it would be
      tuned on one voyage, and a filter shaped by the run you are looking at is the fault
      docs/QA-PROCESS.md §2c is about. Do it on the next run that disagrees with this one.
   2. THE SCATTERED CLAPS. The storm's thunder is random PER DEVICE — src/ui/board.js:927 in the
      game's own words: "A clap is per screen (the thunder is scattered on each device), so each
      screen's lightning matches its own sound." So `lightning`, `storm-rock` and the `storm` stem
      differ between screens BY DESIGN (host 0/0/1 against guest 4/4/5 on the run above). They are
      not in AMBIENCE_FILES, so the derived exclusion above does not catch them. That ruling belongs
      in a ` ```twins ` fence in docs/INTENDED-BEHAVIOUR.md with the rest of the per-screen rulings,
      cited and dated, the way the ` ```accepted ` fence already works — a later item.
   3. THE FLIP CEREMONY. coin-land / coin-stamp / coin-sink / tails-nudge run only on the screen that
      was ASKED (decisionIsLocal). `apart` already demotes those, correctly, and which screen they
      land on swaps between runs — which is itself the tell. */

export function twin(A, B, { labelA = "host", labelB = "guest", ambient = new Map(), bar = BAR, near = NEAR_MS } = {}) {
  const tA = tally(A), tB = tally(B);
  const sameTotal = (key, v) => (tA[key].get(v) || 0) === (tB[key].get(v) || 0) && (tA[key].get(v) || 0) > 0;
  for (const L of [A, B]) {
    const rs = L.rows;
    for (let i = 0; i < rs.length; i++) {
      rs[i].nearOwn = {};
      for (const c of CH) {
        let hit = rs[i].own[c] != null;
        for (let j = 0; !hit && j < rs.length; j++) if (Math.abs(rs[j].t0m - rs[i].t0m) <= near && rs[j].own[c] != null) hit = true;
        rs[i].nearOwn[c] = hit;
      }
      rs[i].nearSnd = new Set(rs[i].snd); rs[i].nearAnim = new Set(rs[i].anim);
      for (let j = 0; j < rs.length; j++) if (Math.abs(rs[j].t0m - rs[i].t0m) <= near) { for (const v of rs[j].snd) rs[i].nearSnd.add(v); for (const v of rs[j].anim) rs[i].nearAnim.add(v); }
    }
  }
  const byN = r => new Map(r.rows.map(x => [x.n, x]));
  const a = byN(A), b = byN(B);
  const both = [...a.keys()].filter(n => b.has(n));
  const out = [];
  const add = (rule, kind, what, n, why, demoted, hard) => out.push({ rule, kind, what, n, why, demoted, hard });
  for (const n of both) {
    const x = a.get(n), y = b.get(n);
    if (!x.complete || !y.complete) continue;                       // its horizon was not fully watched on one side
    const apart = x.local !== y.local;                              // one screen was asked, the other was watching
    /* ⚠ THE FIVE COIN CHANNELS ARE NEVER DEMOTED, AND THIS IS A DELIBERATE EXCEPTION TO `apart`.
       A purse is SHARED TRUTH: every screen draws every captain's purse, and seat_parity.mjs
       already compares purses across seats for exactly that reason. `decisionIsLocal` governs the
       PROMPT and the affordances around it — the slider, the gold squares — not whether a coin is
       seen to fly. Demoting these would have thrown away the very case Wyatt reported ("guest never
       saw coin go into their purse when musing ON THEIR TURN"): the actor's own screen and the
       watching screen are `apart` by definition on every event that has an actor, so a blanket
       demotion silently drops every human-actor row. Measured on the pre-fix tree, 2026-09-18: it
       split one 13-of-13 finding into 10 reported and 3 hidden. */
    for (const c of CH) {                                            // ownership over the neighbourhood: drew nothing, not drew late
      const px = x.nearOwn[c], py = y.nearOwn[c];
      const at = px ? x.own[c] : y.own[c];
      const evenWords = c === "words" && Math.abs(tA.words - tB.words) <= SAME_WORDS * Math.max(tA.words, tB.words);
      if (px !== py) add(1, x.kind, c, n, `${c} fired on the ${px ? labelA : labelB} (${at == null ? `on a neighbour within ${near}ms` : at + "ms after the event arrived"}) and never on the ${px ? labelB : labelA}, nor on anything that arrived within ${near}ms of it` + (evenWords ? ` — but the ${labelA} wrote ${tA.words} lines over the voyage and the ${labelB} wrote ${tB.words}, so this one sat under a different event` : ""), evenWords, true);
    }
    for (const [setName, key, tkey] of [["a sound", "nearSnd", "snd"], ["an animation", "nearAnim", "anim"]]) {
      for (const v of new Set([...x[key], ...y[key]])) {
        if (v === "?" || ambient.has(v)) continue;
        const px = x[key].has(v), py = y[key].has(v);
        const even = sameTotal(tkey, v);
        if (px !== py) add(1, x.kind, `${tkey}:${v}`, n,
          `${setName} (${v}) on the ${px ? labelA : labelB} and not on the ${px ? labelB : labelA}` +
          (even ? ` — but both screens ran it ${tA[tkey].get(v)} time(s) over the whole run, so it sat under a different event, it was not undrawn` : ` (over the whole run: ${tA[tkey].get(v) || 0} on the ${labelA}, ${tB[tkey].get(v) || 0} on the ${labelB})`),
          apart || even, false);
      }
    }
    if (x.turns !== y.turns) add(2, x.kind, "turns", n, `the reaction crossed ${x.turns} turn boundary(ies) on the ${labelA} and ${y.turns} on the ${labelB}`, false, true);   // an ordering of shared facts — same exception as the five above
    /* RULE 3 AND VIEWER-RELATIVITY. src/ui/util.js:931 names it explicitly (describeFor(e,
       NEUTRAL_VIEWER)): the same event is worded "ye offer…" to the captain who offered and
       "test2 offers…" to everyone else, and that is the game working. A difference where exactly one
       side addresses the reader is therefore DEMOTED, not raised — and this is checked on the words
       themselves rather than on `local`, because plenty of events carry no actor at all and `local`
       is then false on both screens, which reads as "the same position" and is not. */
    const you = s => /(^|[\s—,>])(ye|yer|ye're|thee|thy)([\s—,.!?<]|$)/i.test(String(s));
    if (x.text && y.text && norm(x.text) !== norm(y.text)) {
      const i = [...String(x.text)].findIndex((ch, k) => ch !== String(y.text)[k]);
      add(3, x.kind, "words", n, `they part at character ${i < 0 ? "the end" : i}: ${labelA} "…${String(x.text).slice(Math.max(0, i - 15), i + 55)}…" vs ${labelB} "…${String(y.text).slice(Math.max(0, i - 15), i + 55)}…"`, apart || (you(x.text) !== you(y.text)), false);
    }
  }
  /* REPEAT BEFORE REPORTING: nothing is a finding until it reproduces. The muse coin was 5 of 5, so
     the bar is reachable — and the RATIO goes in the sentence, always, because a finding that
     happened once in forty is a different animal from one that happened forty times in forty. */
  const seen = {};
  for (const n of both) { const x = a.get(n); if (x.complete && b.get(n).complete) seen[x.kind] = (seen[x.kind] || 0) + 1; }
  const agg = new Map();
  for (const f of out) {
    const k = `${f.rule}|${f.kind}|${f.what}|${f.demoted}`;
    if (!agg.has(k)) agg.set(k, { ...f, ns: [], of: seen[f.kind] || 0 });
    agg.get(k).ns.push(f.n);
  }
  const all = [...agg.values()].map(f => ({ ...f, k: f.ns.length }));
  const reproduced = f => f.hard || (f.k >= bar.k && f.k / (f.of || 1) >= bar.ratio);
  const rank = all.filter(reproduced)
    .sort((p, q) => (p.demoted - q.demoted) || (p.rule - q.rule) || (q.k / (q.of || 1) - p.k / (p.of || 1)) || (q.k - p.k));
  const belowBar = all.filter(f => !reproduced(f));
  /* THE LATENESS OBSERVATIONS — printed, ranked below every finding, and NEVER failed. His rule,
     from his own playtest notes on q17-coinword: "if important game elements like words or sail
     squares are blocked for a finite, short amount of time … that's fine. that passes." */
  const lateness = [];
  for (const c of CH) {
    const d = both.map(n => [a.get(n), b.get(n)]).filter(([x, y]) => x.complete && y.complete && x[c] != null && y[c] != null).map(([x, y]) => y[c] - x[c]);
    if (d.length) { d.sort((p, q) => p - q); lateness.push({ ch: c, n: d.length, med: d[d.length >> 1], min: d[0], max: d[d.length - 1] }); }
  }
  /* THE TALLY DIFFERENCES — what one screen drew and the other did not, over the WHOLE run. This is
     the threshold-free half of rule 1 and it cannot be confused by attribution: a thing drawn 16
     times on one screen and 0 on the other is a fact about the screens, not about the join. */
  const totals = [];
  for (const key of ["snd", "anim"]) for (const v of new Set([...tA[key].keys(), ...tB[key].keys()])) {
    if (v === "?" || ambient.has(v)) continue;
    const ka = tA[key].get(v) || 0, kb = tB[key].get(v) || 0;
    if (ka !== kb) totals.push({ key, v, a: ka, b: kb, only: ka === 0 || kb === 0 });
  }
  totals.sort((p, q) => (q.only - p.only) || (Math.abs(q.a - q.b) - Math.abs(p.a - p.b)));
  return { findings: rank, belowBar, totals, lateness, paired: both.length, onlyA: [...a.keys()].filter(n => !b.has(n)).length, onlyB: [...b.keys()].filter(n => !a.has(n)).length, seen };
}

/* ── THE TABLE, in the shape the muse-coin fix printed it (git show fe5ad352) ────────────────── */
export function table(A, B, kinds, labelA = "host", labelB = "guest") {
  const col = ["words", "flies", "lands", "number", "chink", "turns", "evs"];
  const owned = ["flies", "number", "chink"];      // the same three, under the strict attribution
  const med = (rows, c, o) => { const v = rows.map(r => o ? r.own[c] : r[c]).filter(x => x != null).sort((p, q) => p - q); return v.length ? v[v.length >> 1] : null; };
  const cnt = (rows, c) => rows.filter(r => r.own[c] != null).length;
  const lines = [
    `  ${"screen  kind".padEnd(24)}${col.map(c => c.padStart(8)).join("")}${"  rows".padStart(6)}   ${owned.map(c => ("own " + c).padStart(11)).join("")}`,
    `  ${"".padEnd(24)}${"  ← reached (first after the event arrived, whatever else began meanwhile)".padEnd(56)}      ← owned (median, and how many of the rows own one)`];
  for (const k of kinds) for (const [lab, L] of [[labelA, A], [labelB, B]]) {
    const rs = L.rows.filter(r => r.kind === k && r.complete);
    if (!rs.length) continue;
    lines.push(`  ${(lab + "  " + k).padEnd(24)}${col.map(c => String(med(rs, c) ?? "-").padStart(8)).join("")}${String(rs.length).padStart(6)}   ${owned.map(c => `${med(rs, c, true) ?? "-"}/${cnt(rs, c)}`.padStart(11)).join("")}`);
  }
  return lines.join("\n");
}

/* ── THE PRODUCER SET — DERIVED FROM THE SOURCE'S OWN EMISSIONS, NEVER TYPED ────────────────────
   scripts/qa/event_actor_field_check.mjs's header states the principle in the repo's own words:
   "Never trust a hand-kept list to detect the failure it exists to prevent." This is shared with
   scripts/qa/event_sound_kinds_real_check.mjs so the report's coverage line and the gate's
   expectation can never become two different lists.

   ⚠ IT IS NOT A `.ev({t:"…"` SCAN, AND THAT MATTERS — the obvious pattern silently loses a third of
   the game. The engine routinely builds the event object in a variable first:
     src/engine/index.js:869   const move={...(as||{t:"sail",p:p.idx}),route:[…]};  this.ev(move)
     src/engine/index.js:2287  const flight={t:"battleflee",…};                     this.ev(flight)
   A `.ev({t:` regex loses `sail` — the commonest action in the game — and would then condemn a live
   sound as dead. So the pattern is any `t:"…"` literal, in the three files that emit events.

   ⚠ AND THE ONE NON-LITERAL EMISSION IS PICKED UP DELIBERATELY: src/engine/index.js:741 is
   `this.ev({t:blown?"blownOut":"windmove",p:p.idx})`, invisible to a literal scan. Both arms are
   taken by the ternary pattern; if that shape moves, MUST_HAVE below fails loudly rather than
   quietly returning a shorter list.

   ⚠ AND THE FILE LIST ITSELF IS CHECKED, by `strayEmitters`: scoping to three files is only safe
   while those three are the only ones that call `.ev(`. A fourth emitter added tomorrow makes the
   gate say so instead of silently shrinking. (src/shared/index.js and src/shared/words.js are
   excluded on purpose and could not be included: their `t:` is the THIRD-PERSON WORDING of a
   narration line, not an event kind.) */
export const EMITTER_FILES = ["src/engine/index.js", "src/ui/flow.js", "src/orchestrator.js"];
export function emittedKinds(files) {
  const kinds = new Set();
  for (const f of EMITTER_FILES) {
    const src = files[f]; if (!src) continue;
    for (const m of src.matchAll(/\bt\s*:\s*"([A-Za-z]+)"/g)) kinds.add(m[1]);
    for (const m of src.matchAll(/\bt\s*:\s*[^,{}]*\?\s*"([A-Za-z]+)"\s*:\s*"([A-Za-z]+)"/g)) { kinds.add(m[1]); kinds.add(m[2]); }
  }
  return kinds;
}
export const strayEmitters = files => Object.keys(files).filter(f => !EMITTER_FILES.includes(f) && /\.ev\(\s*\{/.test(files[f]));
/* The anchors: a live event of each shape the derivation could lose — a plain literal, the one
   built in a variable (`sail`), and both arms of the one ternary. */
export const MUST_HAVE = ["turn", "sail", "dock", "pass", "trade", "battleflee", "blownOut", "windmove", "shotLands"];
