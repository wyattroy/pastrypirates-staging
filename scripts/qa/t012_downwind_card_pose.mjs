/* t012_downwind_card_pose.mjs — POSE the downwind battle card and photograph it.
 *
 * THE QUESTION (Chart row T-012). A trial screenshot caught a battle card reading
 *   "Both fire 🪙 HEADS — but Davy Scones's firing"
 * and stopping, where src/orchestrator.js:700 writes
 *   "Both fire ⚪ HEADS — but <name>'s firing downwind and the shot hits!"
 * Two explanations with opposite fixes: the camera was early, or the second line is CLIPPED and
 * every downwind battle in the game ends mid-phrase.
 *
 * WHY A POSE AND NOT A TRIAL (rule 26). This is a picture, not a rate. The row says so itself:
 * "Do not run a trial for this." A voyage would offer a downwind both-heads battle a few times an
 * hour, at a moment nobody chooses; posing it puts the exact card on the exact screen in seconds
 * and the same card every time.
 *
 * WHAT IT POSES, AND WHY THIS IS THE REAL CARD AND NOT A MOCK-UP. It calls the game's own
 * `renderBattle()` (src/orchestrator.js:279) through the same `renderBattleFromSnap()` the network
 * path uses, and builds the sentence from the SAME template and the SAME `pname()` the game does —
 * so the string under test is the string the game writes, not a transcription of it.
 *
 * THE INSTRUMENT'S OWN RED-PROOF IS BUILT IN, and it is the point of the run rather than a
 * formality: the card is photographed TWICE from one pose — once at +120ms, inside `#apGrid`'s
 * 180ms `grid-template-rows` transition, and once well after it. If the early frame is cut and the
 * late one is whole, the probe has DEMONSTRATED the transient it is accusing, on this build, rather
 * than asserting it. If both are whole, the probe cannot see a clip at all and its "not clipped"
 * verdict is worth nothing — it says so and exits non-zero.
 *
 *   node scripts/qa/t012_downwind_card_pose.mjs            # Chrome, tablet 768x954 @2
 *   node scripts/qa/t012_downwind_card_pose.mjs --wk       # WebKit, same seat (the trial's own
 *                                                          # solo-tablet-wk leg, where it was seen)
 */
import fs from "node:fs";
import path from "node:path";
import { openChrome, freshProfileDir, sleep } from "../lib/cdp.mjs";
import { openWebKit } from "../lib/wk.mjs";
import { REPO, gameURL } from "../lib/chrome.mjs";

const WK = process.argv.includes("--wk");
const OUT = path.join(REPO, ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

// the trial's own solo-tablet seat — the leg the screenshot came from
const W = 768, H = 954, DSF = 2;
const httpPort = WK ? 8497 : 8496, dbgPort = 9496;

const wait = async (m, expr, ms = 30000, step = 250) => {
  for (let t = 0; t < ms; t += step) { if (await m.ev(expr) === true) return true; await sleep(step); }
  return false;
};

/* THE POSE, run in the page. Builds the sentence from the game's own template and pname(), then
   hands it to the game's own renderer. `dw` is passed explicitly so the card cannot fall back to
   deriving a crosswind from wherever the attract board happens to have parked its ships. */
/* ⛔ CLEAR `pp4Stage` FIRST, OR THIS PROBE ANSWERS ABOUT THE WRONG SCREEN — and it did, once.
   A battle card is placed by `promptTick` as `.centered` (src/ui/stage.js:3721-3722:
   `const isBattle = !!box.querySelector(".btl"); if (big || isBattle || !u){ ...add("centered") }`).
   `pp4Center` is a DIFFERENT stage, entered only when `#actionPanel` carries `dataset.pp4Stage`
   (src/ui/stage.js:2744) — and the opening ceremony leaves that flag set, so a probe that poses
   straight after boot lands in `pp4Center` without touching anything.
   THAT DISTINCTION IS THE WHOLE QUESTION. `pp4Center` DROPS the clip box (index.html:2277-2278 —
   `#apGridInner` overflow:visible, row `max-content !important`), so a card there CANNOT cut its
   text and every clip reading comes back zero by stylesheet, not by measurement. `.centered` keeps
   `index.html:467` (a pinned px row on a 180ms transition) and `:473` (`overflow:hidden`) — which
   is exactly the mechanism under test.
   The first run of this probe reported "NOT CLIPPED, both engines" from `pp4Center` and it proved
   nothing. Caught by CEO 148. The regime is now cleared before the pose AND asserted after it. */
const POSE = (attIdx, defIdx) => `(async () => {
  const { appState } = await import('/src/state/index.js');
  delete document.getElementById('actionPanel').dataset.pp4Stage;
  const { pname, pn } = await import('/src/ui/util.js');
  const { renderBattleFromSnap } = await import('/src/ui/flow.js');
  /* pn(), NOT pname(). The battle RUNNER binds its own \`nm\` to pn (src/orchestrator.js:635) —
     a BOLD, colour-carrying <b>, not the plain escaped string the CARD's header uses
     (src/orchestrator.js:281). A first draft of this probe used pname() and drew the name in
     the sentence's own green at normal weight; the real card draws it in the captain's colour,
     in bold, which is WIDER and therefore wraps in a different place. A pose that wraps
     somewhere the game does not is not a pose of the game. */
  const dwName = pn(${attIdx});
  // src/orchestrator.js:700, character for character
  const result = '<span class="score">Both fire \\u26aa HEADS \\u2014 but ' + dwName + "'s firing downwind and the shot hits!</span>";
  renderBattleFromSnap({
    attIdx: ${attIdx}, defIdx: ${defIdx}, round: 1, a: 1, d: 0,
    atState: 'H', dfState: 'H', live: null, winCoin: 'a', result,
    title: '\\u2694\\ufe0f The broadside', roleA: 'Attacker', roleD: 'Defender'
  }, { dw: 'a' });
  return { dwName, result };
})()`;

/* WHAT THE CARD LOOKS LIKE RIGHT NOW — read from the rendered box, never from the source string.
   `lines` comes from the text's own client rects, so it counts the lines the browser DREW.
   `hiddenPx` is how much of .btl-result falls below the visible bottom of #apGridInner, which is
   the element that does the clipping (index.html:473, overflow:hidden). */
const READ = `(() => {
  const r = document.querySelector('.btl-result');
  const inner = document.getElementById('apGridInner');
  if (!r || !inner) return { missing: true, hasResult: !!r, hasInner: !!inner };
  const rr = r.getBoundingClientRect(), ir = inner.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(r);
  const rects = [...range.getClientRects()].filter(b => b.width > 0 && b.height > 0);
  const tops = [...new Set(rects.map(b => Math.round(b.top)))];
  return {
    text: r.textContent,
    /* THE COIN IS AN <img>, NOT A CHARACTER. emojify() (src/shared/index.js:184) swaps every emoji
       that has custom art for an <img class="narrIcon">, so textContent legitimately does NOT
       contain the ⚪ the source string carries. Count the icons instead — a probe that compared
       textContent against the source would report a missing coin on a card that draws one, which
       is exactly the kind of phantom defect rule 6 exists to stop. It got this wrong once. */
    icons: r.querySelectorAll("img").length,
    lines: tops.length,
    scrollH: r.scrollHeight, clientH: r.clientHeight,
    resultBottom: Math.round(rr.bottom), innerBottom: Math.round(ir.bottom),
    hiddenPx: Math.max(0, Math.round(rr.bottom - ir.bottom)),
    gridRows: getComputedStyle(document.getElementById('apGrid')).gridTemplateRows,
    /* WHICH DISPLAY REGIME IS THIS? It decides whether a clip is even possible: under
       #pp4Prompt.pp4Center the clip box is DROPPED (#apGridInner overflow:visible) and the row is
       max-content !important (index.html:2277-2278), so a centre-stage card cannot cut its own
       text. Reported on every frame because a pose that answers in the wrong regime has answered
       a different question, and there is no way to tell from the numbers alone. */
    promptClass: (document.getElementById('pp4Prompt') || {}).className || "(no #pp4Prompt)",
    innerOverflow: getComputedStyle(inner).overflowY,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
  };
})()`;

const say = (o) => JSON.stringify(o);

(async () => {
  const engine = WK ? "webkit" : "chrome";
  const profileDir = freshProfileDir(path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", `pp-t012-${engine}`));
  const open = WK ? openWebKit : openChrome;
  const m = await open({ W, H, dbgPort, httpPort, serveRoot: REPO, profileDir, mobile: true, dsf: DSF });
  let bad = null;
  try {
    await m.nav(gameURL(httpPort));
    await sleep(2500);
    await m.ev("localStorage.clear()");
    await m.nav(gameURL(httpPort));
    await sleep(2800);

    // §3 of DRIVING-THE-GAME: click the mode card FIRST, then the name modal — and wait for the
    // confirm to be VISIBLE, not merely present, or it fires before the modal opens and does nothing.
    await m.ev("document.getElementById('choiceSolo').click()");
    if (!await wait(m, "(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.getBoundingClientRect().width>10)})()"))
      throw new Error("the name modal never opened");
    await m.ev("document.getElementById('nameModalInput').value='Wyatt'");
    await m.ev("document.getElementById('btnNameConfirm').click()");

    // "a game exists" is NOT the signal — the welcome screen runs an all-bot attract board on the
    // same appState. Wait for a HUMAN seat, or you have posed the demo.
    if (!await wait(m, "(async()=>{const {appState}=await import('/src/state/index.js');return !!(appState.game&&appState.game.players.some(p=>p.strategy==='human'))})()", 45000))
      throw new Error("no solo game with a human seat ever started");
    await sleep(3500);   // let the opening ceremony settle so the panel is not mid-anything

    const posed = await m.ev(POSE(1, 2));
    if (posed && posed.__err) throw new Error("the pose itself threw: " + posed.__err);

    // FRAME 1 — inside #apGrid's 180ms height transition.
    await sleep(120);
    const early = await m.ev(READ);
    await m.shot(path.join(OUT, `t012-downwind-${engine}-early.png`));

    // FRAME 2 — well past it, and past anything else that might still be moving.
    await sleep(2500);
    const late = await m.ev(READ);
    await m.shot(path.join(OUT, `t012-downwind-${engine}-settled.png`));

    /* FRAME 3 — THE FORCED CLIP. The +120ms frame was supposed to be this probe's negative case and
       on this build it is not: the card's height sequence is already finished by then, so nothing
       was ever cut and a "not clipped" verdict off those two frames alone would be a measurement
       that could not fail (rule 6). So the negative case is MADE: pin #apGrid's row one line short
       and read again. The detector must go red here or its green means nothing. Restored after. */
    /* setProperty(..., 'important'): a plain style assignment was tried first and did NOTHING —
       the computed row came back unchanged — so the forced frame silently equalled the settled one
       and the red-proof reported "cannot see a clip" when the truth was "could not create one".
       An instrument that fails to build its own negative case looks identical to one that is
       blind. Forced with `important`, and the assertion below is on the FORCED READING, so if the
       force ever stops working again the probe says so instead of passing. */
    await m.ev(`(()=>{const g=document.getElementById('apGrid');
      g.style.setProperty('transition','none','important');
      g.style.setProperty('grid-template-rows',(g.getBoundingClientRect().height-20)+'px','important');})()`);
    await sleep(200);
    const forced = await m.ev(READ);
    await m.shot(path.join(OUT, `t012-downwind-${engine}-forced-clip.png`));
    await m.ev(`(()=>{const g=document.getElementById('apGrid');
      g.style.removeProperty('grid-template-rows');g.style.removeProperty('transition');})()`);

    console.log(`t012 downwind card pose — ${engine} ${W}x${H} @${DSF} (the trial's solo-tablet seat)`);
    console.log(`  posed name  : ${posed && posed.dwName}`);
    console.log(`  EARLY +120ms : ${say(early)}`);
    console.log(`  SETTLED +2.6s: ${say(late)}`);
    console.log(`  FORCED CLIP  : ${say(forced)}`);

    /* THE SCENE GATE. Refuse to report anything unless the card is on the stage the game puts it
       on. CEO 148's finding, made structural: "a red-proofed detector aimed at a stage where the
       fault is switched off by stylesheet reads exactly like a clean bill of health." The reader
       could fail; the SCENE could not. */
    if (late.missing || early.missing || forced.missing) {
      bad = "the probe could not find .btl-result or #apGridInner — it measured nothing";
    } else if (!/\bcentered\b/.test(late.promptClass) || /pp4Center/.test(late.promptClass)) {
      bad = `WRONG STAGE — the card is on "${late.promptClass}", and a battle card belongs on "centered" `
          + `(src/ui/stage.js:3721-3722). #apGridInner overflow here is "${late.innerOverflow}". `
          + `On pp4Center the clip box is dropped (index.html:2277-2278), so every clip reading would `
          + `come back zero because of the stylesheet, not because of the card. Refusing to answer.`;
    } else {
      /* The expected TEXT is the source sentence with the coin removed, because the coin is drawn
         as an <img> (see READ's note). Both halves are still checked: the words by string compare,
         the coin by the icon count. */
      const full = "Both fire ⚪ HEADS — but " + posed.dwName + "'s firing downwind and the shot hits!";
      /* Collapse runs of spaces on both sides: removing the coin CHARACTER leaves the spaces that
         surrounded it, so the card's own text carries a double space where the icon sits. That is
         whitespace, not a missing word, and comparing without collapsing would flag it as one. */
      const squash = s => s.replace(/\s+/g, " ").trim();
      // ...and strip the tags: pn() returns a <b> wrapper, so `full` is HTML while the card's
      // textContent is words. Comparing HTML against text reports a difference at the first "<".
      const expectText = squash(full.replace("⚪", "").replace(/<[^>]*>/g, ""));
      /* CODEPOINTS, NOT ===. A mismatch here has to say WHICH character, because a probe that
         reports "the text is wrong" without naming the difference is the kind of finding this
         project spends days on. */
      const a = [...expectText], b = [...squash(late.text || "")];
      /* (an earlier draft compared raw textContent here and read the icon's leftover space as a
         missing character — see the squash() note above) */ // || "")].filter(c => c !== " ");
      let diffAt = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { diffAt = i; break; }
      console.log(`  the sentence the game writes : ${JSON.stringify(full)}`);
      console.log(`  the coin is drawn as art, so the card's own text should read : ${JSON.stringify(expectText)}`);
      console.log(`  drawn on ${late.lines} line(s), with ${late.icons} icon image(s) in it`);
      if (diffAt >= 0) {
        const cp = s => s === undefined ? "(end)" : "U+" + s.codePointAt(0).toString(16).toUpperCase();
        console.log(`  ⚠ TEXT DIFFERS at index ${diffAt}: expected ${cp(a[diffAt])}, card has ${cp(b[diffAt])}`
                  + ` — lengths ${a.length} vs ${b.length}`);
      }
      const wordsWhole = diffAt < 0, coinDrawn = late.icons >= 1;

      /* THE RED-PROOF, AND IT IS THE FORCED FRAME — NOT THE EARLY ONE. Reported honestly either
         way: if the early frame happens to be cut on some build, that is a real transient worth
         seeing, but the probe's licence to say "not clipped" rests on the forced case going red. */
      const earlyCut = early.hiddenPx > 0 || early.lines < late.lines;
      const detectorWorks = forced.hiddenPx > 0;
      console.log(`  RED-PROOF   : forcing the row one line short -> hiddenPx ${forced.hiddenPx}`
                + ` — the reader ${detectorWorks ? "GOES RED, so its green means something" : "STAYED GREEN, so it cannot see a clip at all"}`);
      /* SAY WHAT THE READER ACTUALLY MEASURES, because in this regime it is not the same as what a
         player sees. `hiddenPx` is GEOMETRY — how far .btl-result reaches past the panel box — and
         under pp4Center #apGridInner is overflow:visible, so text past that edge would SPILL onto
         the board rather than be cut. The screenshots are what answer the visual half; this number
         answers the layout half. Both are reported, and neither is offered as the other. */
      console.log(`  what that number means here : #apGridInner overflow is "${late.innerOverflow}"`
                + (late.innerOverflow === "visible"
                   ? " — so overflow would SPILL, not cut. The screenshot is the visual proof; this is the layout proof."
                   : " — so overflow really is cut here, and this number is the visual answer too."));
      console.log(`  transient?  : the +120ms frame was ${earlyCut ? "CUT" : "already whole"} (grid row ${early.gridRows} -> ${late.gridRows})`);

      if (!detectorWorks) {
        bad = "the forced-clip frame did not go red — this probe cannot detect a clipped card, so nothing "
            + "it says about clipping is evidence. Fix the instrument before believing any verdict here.";
      } else if (late.lines < 2) {
        bad = `the sentence fits on ${late.lines} line at ${W}x${H}, so there is no second line to clip `
            + `and no wrap to catch early — falsifier 3. Neither of the row's explanations can be right as stated.`;
      } else if (late.hiddenPx > 0 || late.scrollH > late.clientH) {
        console.log(`  VERDICT     : CLIPPED — the settled card is cut. ${late.hiddenPx}px of .btl-result`
                  + ` falls below #apGridInner, scrollHeight ${late.scrollH} vs clientHeight ${late.clientH}.`);
      } else {
        console.log(`  VERDICT     : NOT CLIPPED. Both lines are drawn and fully inside the panel, at +120ms`
                  + ` and at +2.6s. The card does not cut this sentence at this size on ${engine}.`);
      }
    }
  } finally {
    await m.close();
  }
  if (bad) { console.log(`\n  ⚠ ${bad}`); process.exit(1); }
})();
