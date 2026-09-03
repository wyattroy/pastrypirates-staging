/* flip_ceremony_names_the_wind_check.mjs — the flip ceremony must not call a DOWNWIND battle a
 * crosswind.
 *
 * WHAT A PLAYER SEES WHEN THIS IS BROKEN. A downwind broadside raises the coin ceremony, and the
 * line under the coin reads "Crosswind — two heads and the cannonballs collide." Two seconds later
 * the battle card behind it reads "⬇ DAVY SCONES FIRES DOWNWIND — WINS TIES". The two screens
 * describe the same fight and disagree about the one rule that settles it — and by its own comment
 * (src/ui/stage.js:1903-1907) the downwind rule decides about a quarter of all fights.
 *
 * Both halves of that are photographed in this repo, same leg, seconds apart:
 *   judge-1914Z-shots/solo-tablet-wk-018.png           the ceremony, saying CROSSWIND
 *   judge-1914Z-shots/solo-tablet-wk-018-settled.png   the card, saying DAVY SCONES FIRES DOWNWIND
 *
 * THE CAUSE, and it is one hop of the DOM. stage.js found the badge with
 * `btl.querySelector(".windTag.dw")` and then went looking for the captain's name in
 * `dwTag.parentElement` — which is `.btl-wind`, a div that holds the badge and nothing else
 * (src/orchestrator.js:320). `.who` lives two branches away, inside `.btl-col`. So the lookup
 * returned null on EVERY downwind battle and fell through to the crosswind sentence, which is the
 * `else` of that same `if`. The comment directly above it states the intent it was failing:
 * "so the card and the ceremony can never disagree about who holds the wind."
 *
 * WHY THE FIX IS A MARKER AND NOT A BETTER SELECTOR (rule 23 — what makes these two agree?).
 * renderBattle now stamps the downwind column with `.btl-col.dw`, written by the same expression
 * that writes the badge, and the ceremony reads that. Matching on the badge's PROSE would have
 * worked today and broken the next time anyone rewords it; a marker written beside the badge
 * cannot disagree with the badge.
 *
 *   node scripts/qa/flip_ceremony_names_the_wind_check.mjs
 *
 * RED-PROOFED: revert either half of the fix (the `dw` class in src/orchestrator.js, or the
 * selector in src/ui/stage.js) and this check reports the crosswind sentence and exits 1.
 */
import fs from "node:fs";
import path from "node:path";
import { openChrome, freshProfileDir, sleep } from "../lib/cdp.mjs";
import { openWebKit } from "../lib/wk.mjs";
import { REPO, gameURL } from "../lib/chrome.mjs";

/* --before  strips the `.dw` marker off the column before arming the ceremony, which reproduces
              the PRE-FIX DOM exactly, on the same posed board. It is how the matched pair
              (rule 26) is taken without stashing the fix out of a tree another session may be
              reading — and it doubles as the red-proof: with the marker gone this check must
              report the crosswind sentence and exit 1.
   --wk       the same seat on WebKit, which is the engine the fault was photographed on. */
const BEFORE = process.argv.includes("--before");
const WK = process.argv.includes("--wk");
const OUT = path.join(REPO, ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

const W = 768, H = 954, DSF = 2;
const httpPort = WK ? 8499 : 8498, dbgPort = 9498;

const wait = async (m, expr, ms = 45000, step = 250) => {
  for (let t = 0; t < ms; t += step) { if (await m.ev(expr) === true) return true; await sleep(step); }
  return false;
};

/* Pose a DOWNWIND battle card, then raise the ceremony over it exactly as the game does — through
   the same `window.__pp4.flip(el, onClick)` bridge the flippenator arms (src/ui/stage.js:3958). */
const POSE_AND_ARM = (before) => `(async () => {
  const { pn } = await import('/src/ui/util.js');
  const { renderBattleFromSnap } = await import('/src/ui/flow.js');
  renderBattleFromSnap({
    attIdx: 1, defIdx: 2, round: 1, a: 1, d: 0,
    atState: 'H', dfState: 'H', live: null, winCoin: 'a',
    result: '<span class="score">Both fire \\u26aa HEADS \\u2014 but ' + pn(1) + "'s firing downwind and the shot hits!</span>",
    title: '\\u2694\\ufe0f The broadside', roleA: 'Attacker', roleD: 'Defender'
  }, { dw: 'a' });
  const btl0 = document.querySelector('#actionPanel .btl');
  ${before ? `if (btl0) btl0.querySelectorAll('.btl-col.dw').forEach(c => c.classList.remove('dw'));` : ``}
  const armed = !!(window.__pp4 && window.__pp4.flip &&
                   window.__pp4.flip(document.getElementById('flipCoinWrap'), () => {}));
  const btl = document.querySelector('#actionPanel .btl');
  return {
    armed,
    badge: btl && btl.querySelector('.windTag.dw') ? btl.querySelector('.windTag.dw').textContent.trim() : null,
    marked: !!(btl && btl.querySelector('.btl-col.dw .who'))
  };
})()`;

const READ_STAKES = `(() => {
  const st = document.querySelector('#pp4Veil .pp4CerStakes');
  return st ? { present: true, text: st.textContent.trim() } : { present: false };
})()`;

(async () => {
  const engine = WK ? "webkit" : "chrome";
  const profileDir = freshProfileDir(path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", `pp-flipcer-${engine}`));
  const m = await (WK ? openWebKit : openChrome)({ W, H, dbgPort, httpPort, serveRoot: REPO, profileDir, mobile: true, dsf: DSF });
  let fail = null;
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
    if (!await wait(m, "(async()=>{const {appState}=await import('/src/state/index.js');return !!(appState.game&&appState.game.players.some(p=>p.strategy==='human'))})()"))
      throw new Error("no solo game with a human seat ever started");
    await sleep(3500);

    const posed = await m.ev(POSE_AND_ARM(BEFORE));
    if (posed && posed.__err) throw new Error("the pose threw: " + posed.__err);
    await sleep(600);                       // the ceremony copies its words on the next frame
    const stakes = await m.ev(READ_STAKES);
    const shotName = `flip-ceremony-wind-${engine}-${BEFORE ? "before" : "after"}.png`;
    await m.shot(path.join(OUT, shotName));

    console.log(`flip_ceremony_names_the_wind — the ceremony must agree with the battle card's wind badge`);
    console.log(`  ${engine} ${W}x${H} @${DSF} · ${BEFORE ? "BEFORE (marker stripped — the pre-fix DOM)" : "AFTER (as shipped)"}`
              + ` · picture: .planning/posed/${shotName}`);
    console.log(`  the card's badge says : ${JSON.stringify(posed && posed.badge)}`);
    console.log(`  downwind column marked: ${posed && posed.marked}`);
    console.log(`  the ceremony says     : ${JSON.stringify(stakes.present ? stakes.text : "(no .pp4CerStakes)")}`);

    /* THE INSTRUMENT MUST REACH ITS SUBJECT BEFORE ITS VERDICT MEANS ANYTHING. A ceremony that was
       never raised, or a card with no downwind badge, would make the assertion below pass or fail
       for reasons that have nothing to do with the bug. Checked first, and loudly. */
    if (!posed || !posed.armed)  fail = "the ceremony was never armed — __pp4.flip returned false, so nothing below was measured";
    else if (!posed.badge)       fail = "the posed card carries no downwind badge, so this run tested a crosswind and proves nothing";
    else if (!stakes.present)    fail = "the ceremony raised but has no .pp4CerStakes line to read";
    else if (/crosswind/i.test(stakes.text))
      fail = `the ceremony calls a DOWNWIND battle a crosswind. The card says ${JSON.stringify(posed.badge)} `
           + `and the ceremony says ${JSON.stringify(stakes.text)} — the same fight, two rules.`;
    else if (!/downwind/i.test(stakes.text))
      fail = `the ceremony says neither downwind nor crosswind: ${JSON.stringify(stakes.text)}`;
    else
      console.log("  PASS  the ceremony names the downwind captain, and it is the one the badge names.");
  } finally {
    await m.close();
  }
  if (fail) { console.log(`\n  FAIL  ${fail}`); process.exit(1); }
})();
