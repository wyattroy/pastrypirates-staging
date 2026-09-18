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
 * RE-ANCHORED 2026-09-14, when Wyatt had the battle box removed entirely ("THe battle box covered this up. I want the battle box
 * removed entirely."). There is no card and no badge any more.
 * RE-ANCHORED AGAIN 2026-09-18 (architecture item 25). From 09-14 the ceremony asked the ENGINE for itself —
 * appState.game.downwindSide(A, D) for the two captains the stage frames — and so did the fight's opening bubble. That is two
 * readings of one fact, each taken off the board ITS OWN SCREEN happens to be holding, and a watching screen's board is behind its
 * event queue: measured in a crew room, one fight, host "⬇ HOSTCAP FIRES DOWNWIND — WINS TIES" and guest "CROSSWIND · ties collide"
 * 340 ms apart. Now Game.beginBattle takes the reading ONCE and records it on the fight's `engage` event; the one event consumer
 * hands it to the stage with the pair (window.__pp4.battle(a, d, downwind) -> S.battle[2]) and the ceremony simply says it.
 * So this pose no longer stubs the engine: it hands the stage the wind the way the event consumer does.
 *
 *   node scripts/qa/flip_ceremony_names_the_wind_check.mjs
 *
 * RED-PROOFED: --before hands the stage "no one holds the wind" for the posed fight, which is what a guest whose board was behind
 * effectively drew on every downwind battle; the check must then report the crosswind sentence and exit 1.
 */
import fs from "node:fs";
import path from "node:path";
import { openChrome, freshProfileDir, sleep } from "../lib/cdp.mjs";
import { openWebKit } from "../lib/wk.mjs";
import { REPO, gameURL } from "../lib/chrome.mjs";

/* --before  hands the stage null (crosswind) for the posed fight — the red-proof: the ceremony must then say crosswind and this
              check must exit 1.
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

/* Pose a DOWNWIND battle ON THE BOARD — the stage framing captains 1 and 2, the fight saying captain 1 holds the wind — then raise
   the ceremony exactly as the game does, through the same `window.__pp4.flip(el, onClick)` bridge the flippenator arms.
   THE WIND IS HANDED OVER, NOT STUBBED (architecture item 25): __pp4.battle(a, d, downwind) is exactly the call the one event
   consumer makes on the fight's `engage` event, so this pose exercises the shipped path rather than a monkey-patched engine. */
const POSE_AND_ARM = (before) => `(async () => {
  const { pname } = await import('/src/ui/util.js');
  const dw = ${before ? "null" : "'a'"};
  if (window.__pp4) { window.__pp4.flipMsg = null; window.__pp4.battle(1, 2, dw); }
  const armed = !!(window.__pp4 && window.__pp4.flip &&
                   window.__pp4.flip(document.getElementById('flipCoinWrap'), () => {}));
  return { armed, holder: pname(1), dw };
})()`;

const READ_STAKES = `(() => {
  const st = document.querySelector('#pp4Veil .pp4CerStakes');
  const b = st && st.querySelector('b');
  return st ? { present: true, text: st.textContent.trim(), named: b ? b.textContent.trim() : null } : { present: false };
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

    console.log(`flip_ceremony_names_the_wind — the ceremony must name the captain the FIGHT says holds the wind`);
    console.log(`  ${engine} ${W}x${H} @${DSF} · ${BEFORE ? "BEFORE (the stage handed a crosswind — the red-proof)" : "AFTER (as shipped)"}`
              + ` · picture: .planning/posed/${shotName}`);
    console.log(`  the fight says        : ${posed && posed.dw === "a" ? JSON.stringify(posed.holder) + " holds the wind" : "no one holds the wind"}`);
    console.log(`  the ceremony says     : ${JSON.stringify(stakes.present ? stakes.text : "(no .pp4CerStakes)")}`);

    /* THE INSTRUMENT MUST REACH ITS SUBJECT BEFORE ITS VERDICT MEANS ANYTHING. A ceremony that was
       never raised, or a card with no downwind badge, would make the assertion below pass or fail
       for reasons that have nothing to do with the bug. Checked first, and loudly. */
    if (!posed || !posed.armed)  fail = "the ceremony was never armed — __pp4.flip returned false, so nothing below was measured";
    else if (!stakes.present || !stakes.text) fail = "the ceremony raised but its stakes line is empty — the stage never saw the posed fight (S.battle)";
    else if (/crosswind/i.test(stakes.text))
      fail = `the ceremony calls a DOWNWIND battle a crosswind: ${JSON.stringify(stakes.text)}`;
    else if (!/downwind/i.test(stakes.text))
      fail = `the ceremony says neither downwind nor crosswind: ${JSON.stringify(stakes.text)}`;
    else if (stakes.named !== posed.holder)
      fail = `the ceremony names ${JSON.stringify(stakes.named)} but the fight gave the wind to ${JSON.stringify(posed.holder)}`;
    else
      console.log("  PASS  the ceremony names the downwind captain, and it is the one the fight was called in.");
  } finally {
    await m.close();
  }
  if (fail) { console.log(`\n  FAIL  ${fail}`); process.exit(1); }
})();
