/* t012_downwind_sequence_pose.mjs — pose the downwind battle card AS A SEQUENCE, not as a still.
 *
 * WHY THIS EXISTS ALONGSIDE t012_downwind_card_pose.mjs, WHICH ALREADY ANSWERS "is it clipped?".
 * That probe poses the FINAL card into an empty panel and reports NOT CLIPPED on both engines, on
 * the right stage, with a red-proof that bites. That kills explanation B of Chart row T-012 ("the
 * second line is clipped and every downwind battle ends mid-phrase"). It cannot touch explanation
 * A, and here is the mechanism it misses:
 *
 *   A real broadside publishes the card SEVEN-ish times a round (src/orchestrator.js:682, 684, 688,
 *   695, 698, 700, 725 — an earlier draft of this note said "twice", which was loose). What matters
 *   is the LAST TWO, because they are the two that differ in HEIGHT. First a one-line card —
 *     src/orchestrator.js:695  "<name> loads the cannon…"                     (ONE line)
 *   (and a publish carrying no result text at all is also one line: src/ui/flow.js:3084 renders it
 *   as &nbsp;, so the box is one line tall either way), then
 *     src/orchestrator.js:712  "Both fire ⚪ HEADS — but <name>'s firing downwind and the shot hits!"
 *                                                                             (TWO lines)
 *   so #apGrid's row animates from a ONE-LINE height to a TWO-LINE height across its 180ms
 *   `grid-template-rows` transition (index.html:467), with #apGridInner overflow:hidden (:473) over
 *   the top of it. **A camera inside that window photographs a two-line sentence in a one-line box.**
 *   Posing the final state into an empty panel starts at the destination height, so the transient
 *   cannot occur — which is exactly why the still probe's +120ms frame came back "already whole".
 *
 * That is the shape of the screenshot this row is about: `solo-tablet-wk-018-settled.png` shows
 * line one and no line two.
 *
 * ⛔ WHAT THIS IS AND IS NOT GENERAL TO — narrowed by CEO 160, and the narrowing makes the fault
 * SMALLER AND MUCH MORE DAMNING. A first draft of this note said "any card growing from a shorter
 * message does this". **False: narration is PROTECTED.** `src/ui/panel.js:662-667` holds the
 * typewriter until the box has finished resizing and says why, in Wyatt's own words — *"Typing into
 * a box still at the OLD height is precisely P3/P5 — 'the 2nd line is cut off during writing, but
 * only sometimes' — a bug he reported himself"* — and closes with *"the clipping fault still
 * impossible."*
 * **It is impossible for narration. It was never reached for THIS card.** A battle card has no
 * `.apMsg` at all (`src/ui/panel.js:374-375`), so there is no typewriter to hold back: `inner.
 * innerHTML=html` puts the whole card on screen at once while the row is still easing up underneath
 * it. So the exposure is **battle cards, and anything else drawn with no text to reveal** — not
 * every card. **This is not an artifact of an intended animation. It is Wyatt's own 2026-08-01 bug,
 * still live in the one path the fix never covered.**
 *
 * WHAT THIS PROBE PROVES, EITHER WAY, AND IT IS NOT A RATE. It runs the real two-publish sequence
 * and reads the card at intervals across the transition. If a frame inside the window is cut and the
 * settled frame is whole, the transient is DEMONSTRATED on this build — the still probe's "already
 * whole" reading is explained, and the trial's screenshot stops being a mystery. If no frame is ever
 * cut, explanation A is dead too and the screenshot needs a third cause.
 *
 *   node scripts/qa/t012_downwind_sequence_pose.mjs         # Chrome, tablet 768x954 @2
 *   node scripts/qa/t012_downwind_sequence_pose.mjs --wk    # WebKit — the engine the shot came from
 */
import fs from "node:fs";
import path from "node:path";
import { openChrome, freshProfileDir, sleep } from "../lib/cdp.mjs";
import { openWebKit } from "../lib/wk.mjs";
import { REPO, gameURL } from "../lib/chrome.mjs";

const WK = process.argv.includes("--wk");
const OUT = path.join(REPO, ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

const W = 768, H = 954, DSF = 2;            // the trial's own solo-tablet seat
const httpPort = WK ? 8499 : 8498, dbgPort = 9498;

const wait = async (m, expr, ms = 30000, step = 250) => {
  for (let t = 0; t < ms; t += step) { if (await m.ev(expr) === true) return true; await sleep(step); }
  return false;
};

/* STEP 1 — the state the card is in before the result. THE SHORTEST ONE THE RUNNER PUBLISHES:
   src/orchestrator.js:695, "<name> loads the cannon…", through the same renderBattleFromSnap the
   network path uses.
   ⚠ WHY THE SHORT ONE AND NOT src/orchestrator.js:701 ("…must answer…"), WHICH IS THE IMMEDIATE
   PREDECESSOR. The first draft of this probe used :701 and measured a height delta of ONE PIXEL
   (247.5px -> 248.5px), because at this width :701's two bold names already wrap to TWO lines — so
   the box was never one line short and the window under test barely existed. **A probe whose
   "before" state is already the destination height cannot see the fault it is looking for.** :695
   is a genuinely one-line card, which is the harshest real case the runner produces and the only
   one where a whole line has to appear. If the clip is real anywhere, it is here.
   pp4Stage is cleared for the same reason the still probe clears it (CEO 148): the opening ceremony
   leaves the flag set, and pp4Center drops the clip box, so a pose that skips this measures a screen
   where the fault is switched off by stylesheet. */
const POSE_BEFORE = (attIdx, defIdx) => `(async () => {
  document.getElementById('actionPanel') && delete document.getElementById('actionPanel').dataset.pp4Stage;
  const { pn } = await import('/src/ui/util.js');
  const { renderBattleFromSnap } = await import('/src/ui/flow.js');
  const result = pn(${attIdx}) + ' loads the cannon\\u2026';
  renderBattleFromSnap({
    attIdx: ${attIdx}, defIdx: ${defIdx}, round: 1, a: 0, d: 0,
    atState: 'wait', dfState: 'wait', live: 'a', result,
    title: '\\u2694\\ufe0f The broadside', roleA: 'Attacker', roleD: 'Defender'
  }, { dw: 'a' });
  return true;
})()`;

// STEP 2 — the result itself. src/orchestrator.js:712, character for character.
const POSE_RESULT = (attIdx, defIdx) => `(async () => {
  const { pn } = await import('/src/ui/util.js');
  const { renderBattleFromSnap } = await import('/src/ui/flow.js');
  const result = '<span class="score">Both fire \\u26aa HEADS \\u2014 but ' + pn(${attIdx}) + "'s firing downwind and the shot hits!</span>";
  renderBattleFromSnap({
    attIdx: ${attIdx}, defIdx: ${defIdx}, round: 1, a: 1, d: 0,
    atState: 'H', dfState: 'H', live: null, winCoin: 'a', result,
    title: '\\u2694\\ufe0f The broadside', roleA: 'Attacker', roleD: 'Defender'
  }, { dw: 'a' });
  return true;
})()`;

/* The same reader the still probe uses, so the two runs are comparable line for line. `visibleLines`
   is the reading that matters here: how many of the drawn lines actually sit above #apGridInner's
   bottom edge. A two-line sentence in a one-line box has lines 2 and visibleLines 1. */
const READ = `(() => {
  const r = document.querySelector('.btl-result');
  const inner = document.getElementById('apGridInner');
  if (!r || !inner) return { missing: true };
  const rr = r.getBoundingClientRect(), ir = inner.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(r);
  const rects = [...range.getClientRects()].filter(b => b.width > 0 && b.height > 0);
  const tops = [...new Set(rects.map(b => Math.round(b.top)))];
  return {
    text: r.textContent,
    lines: tops.length,
    // the height of one drawn line of THIS card, so the "is a whole line missing?" bar below is
    // derived from the seat rather than typed as a constant (rule 9)
    lineH: rects.length ? Math.round(Math.max(...rects.map(b => b.height))) : 0,
    // a line counts as VISIBLE only if its own bottom is above the clip box's bottom
    visibleLines: tops
      .filter(t => rects.filter(b => Math.round(b.top) === t).every(b => b.bottom <= ir.bottom + 0.5)).length,
    hiddenPx: Math.max(0, Math.round(rr.bottom - ir.bottom)),
    gridRows: getComputedStyle(document.getElementById('apGrid')).gridTemplateRows,
    promptClass: (document.getElementById('pp4Prompt') || {}).className || "(no #pp4Prompt)",
    innerOverflow: getComputedStyle(inner).overflowY
  };
})()`;

(async () => {
  const engine = WK ? "webkit" : "chrome";
  const profileDir = freshProfileDir(path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", `pp-t012seq-${engine}`));
  const open = WK ? openWebKit : openChrome;
  const m = await open({ W, H, dbgPort, httpPort, serveRoot: REPO, profileDir, mobile: true, dsf: DSF });
  let bad = null;
  try {
    await m.nav(gameURL(httpPort));
    await sleep(2500);
    await m.ev("localStorage.clear()");
    await m.nav(gameURL(httpPort));
    await sleep(2800);

    await m.ev("document.getElementById('choiceSolo').click()");
    if (!await wait(m, "(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.getBoundingClientRect().width>10)})()"))
      throw new Error("the name modal never opened");
    await m.ev("document.getElementById('nameModalInput').value='Wyatt'");
    await m.ev("document.getElementById('btnNameConfirm').click()");
    if (!await wait(m, "(async()=>{const {appState}=await import('/src/state/index.js');return !!(appState.game&&appState.game.players.some(p=>p.strategy==='human'))})()", 45000))
      throw new Error("no solo game with a human seat ever started");
    await sleep(3500);

    // ---- the sequence ----
    await m.ev(POSE_BEFORE(1, 2));
    await sleep(1200);                       // let the one-line card settle at ITS height
    const before = await m.ev(READ);
    await m.shot(path.join(OUT, `t012-seq-${engine}-1-before.png`));

    await m.ev(POSE_RESULT(1, 2));
    /* ⛔ PHOTOGRAPH THE CUT FIRST, BEFORE ANY READING. The first draft fired this shot AFTER the
       whole read loop and named it "-2-transition" — by then the card had settled, so the picture
       showed a perfectly whole sentence under a filename claiming to show the transition. **A
       screenshot taken outside the window it is named for is worse than no screenshot**, because
       the next reader believes it. The read either side brackets what the camera could have caught,
       so the picture is never offered as evidence of a moment nobody bounded. */
    const shotFrom = await m.ev(READ);
    await m.shot(path.join(OUT, `t012-seq-${engine}-2-cut.png`));
    const shotTo = await m.ev(READ);

    /* ⛔ THE CAMERA-OPEN READING IS A FRAME, AND LEAVING IT OUT MADE THIS PROBE CONTRADICT ITSELF.
       Taking the screenshot costs ~180ms, which on Chrome is the whole transition — so the first
       timed frame below landed at hiddenPx 0 and the verdict printed "NO TRANSIENT" on the same run
       whose own bracket line two rows above said hiddenPx 18. **An instrument whose conclusion
       disagrees with its own printed data is worse than one that stays silent.** `shotFrom` is a
       real, timestamped reading of the card and it counts like any other. */
    const frames = [{ atMs: 0, ...shotFrom }];
    let atMs = 0;
    for (const dt of [40, 40, 40, 40, 40, 100, 200]) {
      await sleep(dt); atMs += dt;
      frames.push({ atMs, ...(await m.ev(READ)) });
    }
    await sleep(2500);
    const settled = await m.ev(READ);
    await m.shot(path.join(OUT, `t012-seq-${engine}-3-settled.png`));

    console.log(`t012 downwind SEQUENCE pose — ${engine} ${W}x${H} @${DSF} (the trial's solo-tablet seat)`);
    console.log(`  the real two-publish sequence: "…must answer…" (1 line) -> the downwind result (2 lines)`);
    console.log(`  BEFORE  : lines ${before.lines}, visible ${before.visibleLines}, row ${before.gridRows}, hiddenPx ${before.hiddenPx}, stage "${before.promptClass}"`);
    console.log(`  the "-2-cut.png" camera opened at hiddenPx ${shotFrom.hiddenPx} and closed at hiddenPx ${shotTo.hiddenPx}`
              + ` — so that picture shows the card somewhere between those two states, and nothing outside them.`);
    for (const f of frames)
      console.log(`  +${String(f.atMs).padStart(3)}ms : lines ${f.lines}, visible ${f.visibleLines}, row ${f.gridRows}, hiddenPx ${f.hiddenPx}, lineH ${f.lineH}`);
    console.log(`  SETTLED : lines ${settled.lines}, visible ${settled.visibleLines}, row ${settled.gridRows}, hiddenPx ${settled.hiddenPx}`);
    console.log(`  text at settle: ${JSON.stringify(settled.text)}`);

    /* THE SCENE GATE, same as the still probe's and for the same reason (CEO 148): a reading taken
       on pp4Center is a reading about a screen where the clip box does not exist. */
    if (settled.missing || before.missing) {
      bad = "the probe could not find .btl-result or #apGridInner — it measured nothing";
    } else if (!/\bcentered\b/.test(settled.promptClass) || /pp4Center/.test(settled.promptClass)) {
      bad = `WRONG STAGE — "${settled.promptClass}", overflow "${settled.innerOverflow}". Refusing to answer.`;
    } else if (settled.lines < 2) {
      bad = `the settled sentence fits on ${settled.lines} line at ${W}x${H} — there is no second line `
          + `to clip, so this seat cannot answer the row's question at all.`;
    } else {
      /* WHAT COUNTS AS "CUT", AND THE FIRST DRAFT GOT THIS WRONG. It used `hiddenPx > 0`, and on a
         mid-transition frame that fires on ONE PIXEL of sub-pixel overhang — which it duly reported
         as "the sentence is CUT", against a row whose whole subject is SIX MISSING WORDS. A pixel of
         rounding is not a lost line and calling it one is the phantom-defect failure rule 6 exists to
         stop. The bar is a WHOLE LINE of the sentence being hidden, measured against the line height
         the card actually drew, so it scales with the seat instead of a typed number (rule 9). */
      const CUT_PX = Math.max(6, Math.round((settled.lineH || 18) * 0.6));
      const cut = frames.filter(f => f.hiddenPx >= CUT_PX);
      const grazed = frames.filter(f => f.hiddenPx > 0 && f.hiddenPx < CUT_PX);
      if (grazed.length)
        console.log(`  (${grazed.length} frame(s) overhang by 1-${Math.max(...grazed.map(f => f.hiddenPx))}px — `
                  + `sub-pixel rounding inside the transition, NOT a missing line. Reported, not counted.)`);
      if (cut.length) {
        console.log(`\n  VERDICT : TRANSIENT CONFIRMED — ${cut.length} of ${frames.length} frames inside the`
                  + ` window show the sentence CUT (first at +${cut[0].atMs}ms: ${cut[0].visibleLines} of`
                  + ` ${cut[0].lines} lines visible, ${cut[0].hiddenPx}px hidden), and the settled card is whole.`);
        console.log(`            So the card really does show a half-sentence, briefly, every downwind battle —`);
        console.log(`            and a camera in that window photographs it. That is the screenshot on T-012.`);
      } else {
        console.log(`\n  VERDICT : NO TRANSIENT. Across the whole ${frames[frames.length-1].atMs}ms window the`
                  + ` sentence was never cut — every frame drew ${settled.lines} lines with 0px hidden.`);
        console.log(`            Explanation A is dead too, on this build, on ${engine}. The screenshot needs`);
        console.log(`            a third cause, and this probe has not found it.`);
      }
    }
  } finally {
    await m.close();
  }
  if (bad) { console.log(`\n  ⚠ ${bad}`); process.exit(1); }
})();
