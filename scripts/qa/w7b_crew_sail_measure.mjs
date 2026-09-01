/* W7b CREW RE-MEASURE — does the GUEST's boat walk the route, in a real crew room?
 *
 *   node scripts/qa/w7b_crew_sail_measure.mjs [--sails=8] [--minutes=14]
 *
 * WHY THIS EXISTS WHEN TWO GATES ARE ALREADY GREEN. Every W7 gate is SOLO, in one browser.
 * w7b_sail_route_frontier_check.mjs POSES the guest's event order by calling consumeEvent with an
 * extra event behind the sail — which is the right way to make a layout-shaped question cheap and
 * deterministic (rule 26) — but a posed order in a solo page is not a guest. The defect was
 * reported from two real crew rooms over eight sails: five walked, three slid, two of the three
 * corner routes. Only the same setting can say whether that split has moved.
 *
 * THE DISCRIMINATOR IS THE TESTER'S OWN, DELIBERATELY UNCHANGED so the numbers are comparable:
 * count the DISTINCT PAINTED POSITIONS of the sailing ship. A walked route paints every
 * interpolated point (tens of positions over ~700ms); a dropped ride paints the destination and
 * nothing else (1-2 positions in ~16ms). It asserts on the drawn picture, not on a return value.
 *
 * IT REPORTS BOTH SIDES FOR EVERY SAIL. Host and guest are measured on the SAME sail event index,
 * so a divergence is a matched pair rather than two separate stories.
 *
 * IT MUST BE ABLE TO FIND NOTHING HONESTLY. If fewer than --sails sails are observed it says so
 * and keeps a NOT-OBSERVED column: a sail that could not be measured is not a sail that passed.
 */
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8544, DBG_H = 9446, DBG_G = 9447;
const WANT = Number(process.argv.find(a => a.startsWith("--sails="))?.split("=")[1] || 8);
const MINUTES = Number(process.argv.find(a => a.startsWith("--minutes="))?.split("=")[1] || 14);
const SHOTS = process.env.MP_RIG_SHOTS || path.join(process.cwd(), "w7b-crew-shots");
fs.mkdirSync(SHOTS, { recursive: true });

/* WALKED vs SLID — the same threshold w7b_sail_route_frontier_check.mjs fixes against its own
   control, quoted here rather than re-invented. Every verdict prints its step count beside it so
   the threshold can be argued with instead of trusted. */
const WALKED = 5;

/* ⚠ A ROUTE OF FEWER THAN 3 SQUARES IS CULLED ON PURPOSE and must never be judged a failure.
   src/ui/flow.js: "<3 is a straight one-square hop: no corner to draw, and the plain render says
   it better." The first run of this probe did not know that, called four straight hops SLID, and
   reported the guest WORSE than the pre-fix baseline — on a build where every corner route walked.
   The tell was that the HOST painted 1 position on those same sails too: a check that condemns
   something known to work is the suspect (rule 6), and the prediction note for this item had
   already named this exact falsifier before the run.
   So there are two questions, and they are different:
     · a route WITH a corner (>=3 squares) MUST walk on the guest — that is W7;
     · every sail, corner or hop, must be drawn THE SAME WAY on both screens — that is rule 23,
       and it is the stronger claim, because it fails even when both sides are equally wrong. */
const NEEDS_WALK = r => r >= 3;

/* THE WATCHER, installed in BOTH pages. It samples every animation frame and opens a window per
   sail event, so a burst is measured as a burst rather than collapsing into one reading. */
const WATCH = `(()=>{
  if(window.__w7c)return "already";
  const S={sails:[],open:[],frames:0,err:null}; window.__w7c=S;
  Promise.all([import('/src/state/index.js'),import('/src/ui/board.js')])
    .then(([s,b])=>{S.st=s.appState;S.b=b;}).catch(e=>{S.err=String(e&&e.message||e);});
  let lastLen=0;
  const dirOf=(a,c)=>Math.sign(c[0]-a[0])+","+Math.sign(c[1]-a[1]);
  const isCorner=r=>{ if(!Array.isArray(r)||r.length<3)return false;
    for(let i=2;i<r.length;i++) if(dirOf(r[i-2],r[i-1])!==dirOf(r[i-1],r[i]))return true;
    return false; };
  const tick=()=>{
    S.frames++;
    const app=S.st,b=S.b;
    if(app&&app.game&&b){
      const evs=app.game.events;
      if(evs.length>lastLen){
        for(let i=lastLen;i<evs.length;i++){
          const e=evs[i];
          if(e&&e.t==="sail"){
            const route=(e.draw&&e.draw.route)||null;
            const w={idx:i,seat:e.p,routeLen:route?route.length:0,
                     corner:isCorner(route),hasLane:!!route,
                     t0:performance.now(),seen:new Set(),steps:0,ms:0,closed:false,
                     onScreen:0,samples:0};
            S.sails.push(w); S.open.push(w);
          }
        }
        lastLen=evs.length;
      }
      const els=(b.boardShipEls&&b.boardShipEls())||[];
      for(const w of S.open){
        const el=els[w.seat];
        if(el){
          w.seen.add(el.style.transform);
          /* IS THE PLAYER LOOKING AT IT? A route walked off the edge of the screen is drawn and
             not seen, and the step count above cannot tell the difference. The board is an SVG
             the camera pans and zooms, so the ship's own client rect against the viewport is the
             honest question — geometric, poseable, no rate needed (rule 26). */
          const r=el.getBoundingClientRect();
          w.samples++;
          if(r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight) w.onScreen++;
        }
        if(performance.now()-w.t0>1500){
          w.ms=Math.round(performance.now()-w.t0); w.steps=w.seen.size; w.closed=true;
        }
      }
      S.open=S.open.filter(w=>!w.closed);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "installed";
})()`;

const READ = `JSON.stringify({err:(window.__w7c||{}).err||null,frames:(window.__w7c||{}).frames||0,
  sails:((window.__w7c||{}).sails||[]).filter(w=>w.closed)
    .map(w=>({idx:w.idx,seat:w.seat,routeLen:w.routeLen,corner:w.corner,hasLane:w.hasLane,steps:w.steps,ms:w.ms,
              seen:w.samples?Math.round(100*w.onScreen/w.samples):-1}))})`;

const url = serve(PORT);
launch(DBG_H, "/tmp/chrome-w7c-host");
launch(DBG_G, "/tmp/chrome-w7c-guest");
const H = await attach(DBG_H), G = await attach(DBG_G);

let fails = 0;
const bail = async m => { console.log("INSTRUMENT DID NOT REACH ITS SUBJECT — " + m); killAll(); process.exit(2); };

console.log("W7b CREW — does the guest's boat walk the route in a real crew room?\n");
const code = await makeHost(H, url, "HostCap");
console.log("room " + code);
await makeGuest(G, url, code, "GuestCap");
await startVoyage(H);
await sleep(1500);
console.log("voyage started; installing watchers on both sides");
console.log("  host  " + await H.ev(WATCH));
console.log("  guest " + await G.ev(WATCH));
await driver(H, url); await driver(G, url);

const deadline = Date.now() + MINUTES * 60000;
let hs = { sails: [] }, gs = { sails: [] };
while (Date.now() < deadline) {
  await sleep(5000);
  hs = JSON.parse(await H.ev(READ)); gs = JSON.parse(await G.ev(READ));
  if (hs.err) await bail("host watcher failed to import the page's modules: " + hs.err);
  if (gs.err) await bail("guest watcher failed to import the page's modules: " + gs.err);
  process.stdout.write(`\r  sails measured — host ${hs.sails.length}, guest ${gs.sails.length}   `);
  if (gs.sails.length >= WANT && hs.sails.length >= WANT) break;
}
console.log("");
if (!gs.sails.length) await bail(`no sail was measured on the guest in ${MINUTES} minutes (guest frames ${gs.frames}). Nothing below would mean anything.`);

/* ── the matched pair, sail by sail ─────────────────────────────────────────────────────────── */
const byIdx = new Map();
for (const s of hs.sails) byIdx.set(s.idx, { idx: s.idx, host: s });
for (const s of gs.sails) byIdx.set(s.idx, { ...(byIdx.get(s.idx) || { idx: s.idx }), guest: s });
const rows = [...byIdx.values()].sort((a, b) => a.idx - b.idx);

console.log("\n  ev  seat  route  kind      HOST steps      GUEST steps    ONSCREEN verdict");
let gWalk = 0, gSlid = 0, notObs = 0, hops = 0, mismatch = 0;
const slidRows = [], mismatchRows = [];
for (const r of rows) {
  const h = r.host, g = r.guest;
  const len = (g || h).routeLen;
  const draw = s => s.steps >= WALKED ? "walked" : "still";
  const hv = h ? `${draw(h)} ${h.steps}` : "not observed";
  const gv = g ? `${draw(g)} ${g.steps}` : "not observed";
  let verdict;
  if (!g) { verdict = "GUEST NOT OBSERVED"; notObs++; }
  else if (!NEEDS_WALK(len)) {
    hops++;
    verdict = (h && draw(h) !== draw(g)) ? "HOST/GUEST DISAGREE" : "straight hop — culled by design";
  } else if (g.steps >= WALKED) { verdict = "walked"; gWalk++; }
  else { verdict = "SLID"; gSlid++; slidRows.push(r); }
  if (g && h && draw(h) !== draw(g)) { mismatch++; mismatchRows.push(r); }
  const vis = g ? (g.seen < 0 ? "  ?  " : `${String(g.seen).padStart(3)}%`) : "  -  ";
  console.log(`  ${String(r.idx).padStart(3)}   ${g ? g.seat : h.seat}    ${String(len).padStart(2)}   ${(g || h).corner ? "corner" : "hop   "}   ${hv.padEnd(14)}  ${gv.padEnd(14)}  ${vis}   ${verdict}`);
}

console.log(`\n  W7 — routes with a corner (>=3 squares), which are the ones that must walk on the guest:`);
console.log(`       ${gWalk} walked, ${gSlid} SLID, ${notObs} not observed, of ${gWalk + gSlid + notObs}`);
console.log(`  Straight one-square hops, culled by design on both sides: ${hops}`);
console.log(`  BASELINE before the fix: 5 walked, 3 slid of 8 — two of the three slid were CORNER routes`);
console.log(`\n  RULE 23 — host and guest drawn the same way: ${rows.length - mismatch} of ${rows.length} sail(s) agree`);
if (mismatch) {
  console.log(`  THE SCREENS DISAGREE ON:`);
  for (const r of mismatchRows)
    console.log(`    event ${r.idx}, seat ${r.guest.seat}, ${r.guest.routeLen} squares — host painted ${r.host.steps}, guest painted ${r.guest.steps}`);
  fails++;
}
if (gSlid) {
  console.log(`\n  THE SLID CORNER ROUTES, named:`);
  for (const r of slidRows)
    console.log(`    event ${r.idx}, seat ${r.guest.seat}, ${r.guest.routeLen} squares, `
      + `guest painted ${r.guest.steps} position(s) in ${r.guest.ms}ms`
      + (r.host ? ` while the host painted ${r.host.steps}` : ""));
  fails++;
}
/* THE WALK THE GUEST CANNOT SEE. Found by looking at a matched pair, not by any step count:
   the guest walked the route correctly while its camera was framed on another part of the board,
   so the moving ship was cropped at the edge of the screen. A route drawn off-screen is not a
   route the player watched. This is NOT W7 and no gate above can see it. */
const blind = rows.filter(r => r.guest && NEEDS_WALK(r.guest.routeLen) && r.guest.seen >= 0 && r.guest.seen < 60);
if (blind.length) {
  console.log(`\n  ⚠ WALKED BUT LARGELY OFF THE GUEST'S SCREEN — ${blind.length} of ${gWalk + gSlid} route(s):`);
  for (const r of blind)
    console.log(`    event ${r.idx}, seat ${r.guest.seat}: the boat was inside the guest's viewport for only `
      + `${r.guest.seen}% of the walk (host framed it for ${r.host && r.host.seen >= 0 ? r.host.seen + "%" : "?"}). `
      + `The route is drawn; the guest is not looking at it.`);
  console.log(`    This is a CAMERA divergence, not the sail walker, and it is reported as a finding — not fixed here.`);
}

const noLane = rows.filter(r => r.guest && !r.guest.hasLane);
if (noLane.length) console.log(`\n  ${noLane.length} sail(s) reached the guest with NO draw lane at all — that is the wire, not the walker: events ${noLane.map(r => r.idx).join(", ")}`);

/* ── THE MATCHED PAIR, CAUGHT MID-CORNER-WALK ────────────────────────────────────────────────
   The first version of this probe captured at the END of the run, which is a picture of whatever
   happened to be on screen — a trade bubble, as it turned out — and proves nothing about a boat
   walking a route. It now WAITS for a corner route to be in flight on the guest and shoots both
   screens inside that window. If none arrives it says so rather than shipping an arbitrary pair. */
const OPEN_CORNER = `(()=>{const S=window.__w7c;if(!S)return -1;
  const w=(S.open||[]).find(w=>w.corner&&w.routeLen>=3);return w?w.idx:-1})()`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
let shotIdx = -1;
for (let i = 0; i < 900; i++) {
  const idx = await G.ev(OPEN_CORNER);
  if (idx >= 0) {
    shotIdx = idx;
    const shots = await Promise.all([H.send("Page.captureScreenshot", { format: "png" }),
                                     G.send("Page.captureScreenshot", { format: "png" })]);
    for (const [k, who] of [[0, "host"], [1, "guest"]]) {
      const p = path.join(SHOTS, `w7b-crew-corner-ev${idx}-${who}-${stamp}.png`);
      fs.writeFileSync(p, Buffer.from(shots[k].result.data, "base64"));
      console.log(`  matched shot, event ${idx} mid-walk, ${who}: ${p}`);
    }
    break;
  }
  await sleep(120);
}
if (shotIdx < 0) console.log(`  NO MATCHED PAIR — no corner route came in flight while waiting, so no picture was taken. Not a pass.`);

if (gs.sails.length < WANT) { console.log(`\n  NOT RUN TO SIZE — ${gs.sails.length} of ${WANT} sails measured on the guest. A sail that could not be observed is not a sail that passed.`); fails++; }
console.log(fails ? `\nFAILED — the guest is not walking every route.` : `\nPASSED — every measured sail walked on the guest, ${gWalk} of ${gWalk}.`);
killAll();
process.exit(fails ? 1 : 0);
