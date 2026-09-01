/* W1-4 — CAN A GUEST ON A PHONE ACTUALLY TAP EVERY SAIL SQUARE IT IS OFFERED?
 *
 *   node scripts/qa/w14_guest_sail_reach.mjs [--minutes=8]
 *   exit 0 = every offered square was reachable every time; 1 = at least one was not
 *
 * THE TOP ITEM ON THE BACKLOG, deferred at the cutover by Wyatt's explicit call. D-38's ruling is
 * that a control you cannot hit is THE one unacceptable outcome, and crew-on-a-phone is the square
 * he actually playtests.
 *
 * TWO GEOMETRY THEORIES ARE ALREADY MEASURED DEAD, so this does not re-run them. It records the
 * SEQUENCE, because a snapshot cannot show a race (.planning/predictions/W1-4-guest-sail-squares.md):
 *   - every .sailCell's rect against the viewport and against #pp4Cap, at the moment of the prompt
 *   - the board's viewBox continuously, so a camera move that never happened is visible
 *   - whether a centre-stage card or the flip veil was up in the seconds before
 *
 * IT MUST BE ABLE TO FIND NOTHING HONESTLY. If the guest never reaches a tap-to-sail prompt, it
 * says NOT RUN and exits 1 — three probes this session reported a state they had never created.
 * AND AN ACQUITTAL IS AS SUSPECT AS A CONVICTION: if this says every square is reachable on a build
 * whose FULL trial just failed this exact leg, suspect the probe before believing it.
 */
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";

const PORT = 8520, DBG_H = 9422, DBG_G = 9423;
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 8);
const url = serve(PORT);
launch(DBG_H, "/tmp/chrome-w14-host");
launch(DBG_G, "/tmp/chrome-w14-guest");
const H = await attach(DBG_H), G = await attach(DBG_G);
/* THE PHONE, because that is where it fails and where he plays. */
await H.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
await G.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

/* THE WATCHER LIVES IN THE GUEST'S PAGE. It samples every animation frame, keeps a short rolling
   history of the camera and the stage, and captures a FULL RECORD the first moment sail squares
   exist — so the evidence is the sequence leading up to the prompt, not a photograph of it. */
const WATCH = `(()=>{
  if(window.__w14)return "already";
  const vb=()=>{const b=document.getElementById("board");return b?b.getAttribute("viewBox"):null;};
  const stageUp=()=>{const ap=document.getElementById("actionPanel");
    return (document.body.classList.contains("pp4Cer")?"veil":"")+((ap&&ap.dataset.pp4Stage)?"card":"")||"-";};
  window.__w14={hist:[],prompts:[],frames:0};
  const S=window.__w14;
  const tick=()=>{
    S.frames++;
    const now=Math.round(performance.now());
    const row={t:now,vb:vb(),stage:stageUp()};
    const last=S.hist[S.hist.length-1];
    if(!last||last.vb!==row.vb||last.stage!==row.stage){S.hist.push(row);if(S.hist.length>400)S.hist.shift();}
    const cells=[...document.querySelectorAll(".sailCell")];
    if(cells.length&&!S.pending){
      S.pending=true;
      /* CAPTURE ON SIGHT, AND AGAIN INSIDE THE DRIVER'S OWN WINDOW.
         The first cut waited 1200ms before judging so a camera glide could settle -- and the
         autoplay driver taps a sail square every 700ms (scripts/mp_rig.mjs), so the squares were
         always gone before the judgement ran and the probe reported NOT RUN for eight minutes.
         That is the exact fault this project has already paid for: polling for a prompt while a
         driver answers it. TWO CAPTURES INSTEAD, and they answer different questions:
           t0    -- the frame the squares appeared. A square off-screen here and on-screen later is
                    a TRANSIENT: the player watches it slide in. Worth knowing, not "cannot tap".
           +400  -- still well inside the driver's 700ms, and after any glide. A square still
                    off-screen HERE is one the player is being asked to tap and cannot. */
      const judge=()=>{
        const cs=[...document.querySelectorAll(".sailCell")];
        if(!cs.length)return null;
        const W=innerWidth,Hh=innerHeight;
        const cap=document.getElementById("pp4Cap");
        const capR=cap?cap.getBoundingClientRect():null;
        return {n:cs.length,viewport:[W,Hh],cap:capR?[Math.round(capR.top),Math.round(capR.bottom)]:null,
          cells:cs.map(c=>{const r=c.getBoundingClientRect();
            const off=(r.right<=0||r.bottom<=0||r.left>=W||r.top>=Hh);
            const clipped=(r.left<0||r.top<0||r.right>W||r.bottom>Hh);
            const mx=Math.round(r.left+r.width/2),my=Math.round(r.top+r.height/2);
            const inCap=!!(capR&&mx>=capR.left&&mx<=capR.right&&my>=capR.top&&my<=capR.bottom);
            const top=(mx>=0&&my>=0&&mx<W&&my<Hh)?document.elementFromPoint(mx,my):null;
            const covered=!!(top&&!top.classList.contains("sailCell")&&!c.contains(top));
            /* WYATT'S LEAD, 2026-08-30: are the TRADE-WIND squares the broken ones? They carry
               the sailSwept class and they are the rim of the circular board by construction, so
               they are the squares at the extreme edge. Recorded per square, with the grid
               coordinates the renderer stamped on, so a rect can be checked against where it says
               it is. (NO BACKTICKS IN THIS COMMENT: the whole block is a template literal handed
               to the page, and quoting a class name in backticks ended the literal and threw.) */
            return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
                    off:off,clipped:clipped,inCap:inCap,covered:covered,
                    swept:c.classList.contains("sailSwept"),
                    gx:+c.dataset.gx, gy:+c.dataset.gy,
                    by:covered&&top?((top.id?"#"+top.id:"")+"."+(top.className||"").toString().split(" ")[0]):""};})};
      };
      const first=judge();
      const histAt=S.hist.slice(-14);
      setTimeout(()=>{
        const settled=judge();
        S.prompts.push({t:Math.round(performance.now()),first:first,settled:settled,hist:histAt});
        S.pending=false;
      },400);
    }
    if(S.frames<60*60*20)requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "watching";})()`;

console.log(`W1-4 — a guest on a 390x844 phone, ${MINUTES} minutes.\n`);
const code = await makeHost(H, url, "test1");
console.log(`  room ${code}`);
await makeGuest(G, url, code, "test2");
console.log("  guest watcher:", await G.ev(WATCH));
await startVoyage(H);
await sleep(2500);
await driver(H, url); await driver(G, url);
console.log("  both seats driving\n");
/* BOUNDED — rule 17. */
for (let i = 0; i < Math.ceil((MINUTES * 60) / 2); i++) await sleep(2000);

const prompts = JSON.parse(await G.ev(`JSON.stringify(window.__w14?window.__w14.prompts:[])`));
killAll();

if (!prompts.length) {
  console.log(`=== NOT RUN — the guest never reached a tap-to-sail prompt in ${MINUTES} minutes, so nothing was measured. That is not a pass.`);
  process.exit(1);
}
console.log(`  ${prompts.length} tap-to-sail prompt(s) seen on the GUEST\n`);
const score = c => (c ? { off: c.cells.filter(x => x.off), clip: c.cells.filter(x => x.clipped && !x.off), cov: c.cells.filter(x => x.covered && !x.off) } : null);
/* THE NOT-MEASURED COLUMN. CEO Review 27, and the rule was already written down for the sea trial:
   "What the report must never lose: the NOT-RUN column. A leg that could not start is not a leg
   that passed." THIS PROBE HAD NO SUCH COLUMN, and it cost a false headline.
   `judge()` returns null once the driver has tapped, so a capture with no settle reading COULD NOT
   FAIL — and the first version counted every one of them in the denominator and printed them as
   "corrected themselves", which the probe never observed. 11 of 18 captures in the before-run and
   9 of 11 in the after-run were unjudged. Folding them onto the pass side turned 6-of-7 into
   6-of-18 and produced a "33% -> 18%" improvement out of two runs that simply generated different
   numbers of long-lived prompts. THE RATE IS NOW OVER WHAT WAS ACTUALLY JUDGED, and everything
   else is reported separately, in its own column, never averaged in. */
let judged = 0, unjudged = 0, badPrompts = 0, firstFrameOnly = 0;
prompts.forEach((p, i) => {
  const f = score(p.first), s2 = score(p.settled);
  const nFirst = f ? f.off.length + f.clip.length + f.cov.length : 0;
  if (!s2) { unjudged++; }
  else {
    judged++;
    const nBad = s2.off.length + s2.clip.length + s2.cov.length;
    if (nBad) badPrompts++; else if (nFirst) firstFrameOnly++;
  }
  const c = p.settled || p.first;
  console.log(`  capture ${i + 1} at ${p.t}ms — ${c ? c.n : "?"} square(s), viewport ${c ? c.viewport.join("x") : "?"}${c && c.cap ? `, captains panel y ${c.cap[0]}..${c.cap[1]}` : ""}`);
  console.log(`    on sight:  off-screen ${f ? f.off.length : "-"}  clipped ${f ? f.clip.length : "-"}  covered ${f ? f.cov.length : "-"}`);
  console.log(`    at +400ms: ${s2 ? `off-screen ${s2.off.length}  clipped ${s2.clip.length}  covered ${s2.cov.length}` : "NOT MEASURED — the driver tapped before the settle reading. This capture cannot fail and is NOT counted as a pass."}`);
  const show = s2 ? [...s2.off, ...s2.clip, ...s2.cov] : (f ? [...f.off, ...f.clip, ...f.cov] : []);
  /* EVERY BAD SQUARE, NOT THE FIRST SIX. The cap of six was ordered [off, clipped, covered], so on
     a prompt with many failures the coverers were truncated away — and a tally taken off that
     truncated list read as "which element covers most often" when it was measuring print order. */
  show.forEach(x =>
    console.log(`      square at ${x.x},${x.y} ${x.w}x${x.h}${x.off ? " OFF-SCREEN" : ""}${x.clipped ? " CLIPPED" : ""}${x.covered ? ` COVERED by ${x.by || "(an element with no id or class)"}` : ""}${x.swept ? " [TRADE-WIND]" : ""} grid ${x.gx},${x.gy}${x.inCap ? " (centre inside the captains panel)" : ""}`));
  if (show.length) {
    console.log(`    the sequence BEFORE the squares appeared — a snapshot cannot show a race:`);
    p.hist.forEach(h => console.log(`      ${String(h.t).padStart(7)}ms  stage:${h.stage}  viewBox:${h.vb}`));
  }
});
/* AND WHY EACH JUDGED FAILURE FAILED, because "2 prompts failed" says nothing about which of the
   three causes is which — and reading the wrong one off a truncated list is what went wrong. */
const tally = { off: 0, clipped: 0, coveredBub: 0, coveredCap: 0, coveredOther: 0 };
for (const p of prompts) { const s2 = score(p.settled); if (!s2) continue;
  tally.off += s2.off.length; tally.clipped += s2.clip.length;
  for (const c of s2.cov) {
    if (/pp4Bub/.test(c.by)) tally.coveredBub++;
    else if (c.inCap || /pp4Cap|captainsPanel|prow|chips/.test(c.by)) tally.coveredCap++;
    else tally.coveredOther++;
  } }
console.log(`\n  ${prompts.length} capture(s): ${judged} JUDGED at +400ms, ${unjudged} NOT MEASURED (the driver tapped first).`);
console.log(`  NOT-MEASURED captures are neither pass nor fail. They are excluded from the rate below, never folded into it.`);
console.log(`\n  of the ${judged} judged: ${badPrompts} offered an unreachable square, ${firstFrameOnly} were wrong only on the first frame and were clear by +400ms.`);
/* WYATT'S TRADE-WIND LEAD, ANSWERED WITH A RATE RATHER THAN A COUNT. "8 of the broken ones were
   trade-wind squares" means nothing without knowing how many trade-wind squares were offered — if
   they are half the board, half the failures being theirs is exactly no signal. */
let sweptTot = 0, sweptBad = 0, plainTot = 0, plainBad = 0;
for (const p of prompts) { const c = p.settled; if (!c) continue;
  for (const x of c.cells) { const bad = x.off || x.clipped;
    if (x.swept) { sweptTot++; if (bad) sweptBad++; } else { plainTot++; if (bad) plainBad++; } } }
const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "n/a";
console.log(`\n  WYATT'S LEAD — are the TRADE-WIND squares the ones falling off the screen?`);
console.log(`    trade-wind (.sailSwept): ${sweptBad} of ${sweptTot} off-screen or clipped  (${pct(sweptBad, sweptTot)})`);
console.log(`    ordinary yellow:         ${plainBad} of ${plainTot} off-screen or clipped  (${pct(plainBad, plainTot)})`);
if (!sweptTot) console.log(`    ⚠ NO trade-wind square was offered in this run — his lead is NOT tested by it.`);
console.log(`\n  WHY the judged failures failed — squares, not prompts, and every one counted:`);
console.log(`    off the screen entirely: ${tally.off}   clipped at an edge: ${tally.clipped}`);
console.log(`    covered by the narration bubble: ${tally.coveredBub}   by the captains panel: ${tally.coveredCap}   by something else: ${tally.coveredOther}`);
console.log(`\n=== ${badPrompts ? "FAIL" : judged ? "PASS" : "NOT RUN"} — ${badPrompts} of ${judged} JUDGED capture(s) offered the guest a square it could not tap.`);
if (!judged) console.log(`    Nothing was judged at all. That is not a pass — raise --minutes, or the driver is answering faster than the settle window.`);
else if (!badPrompts) console.log(`    An acquittal is as suspect as a conviction: the FULL trial has failed this exact leg, so check the probe reached its subject before believing this.`);
process.exit(badPrompts || !judged ? 1 : 0);
