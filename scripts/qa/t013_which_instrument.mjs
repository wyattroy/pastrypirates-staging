/* T-013 — WHICH INSTRUMENT IS TELLING THE TRUTH ABOUT THE "CALL THE WINNER" CIRCLE?
 *
 *   node scripts/qa/t013_which_instrument.mjs      always exit 0 — this REPORTS, it does not gate
 *
 * THE CONFLICT IT EXISTS TO SETTLE. On one shipped tree, two of this project's own probes answer
 * Wyatt's question — "not on top of, or next to, someone else" (INBOX-20260901T1332Z, and W5-2) —
 * with numbers that cannot both be right:
 *
 *     w52_call_beside_boat.mjs   12 circles, boats NEVER moved       0 nearest the wrong captain
 *     w54_call_clear_of_ask.mjs  21 poses, two boats TELEPORTED     14 nearest the wrong captain
 *
 * Same geometry on both sides — nearest hull by EDGE GAP, boardShipEls(), dataset.seat. So the
 * disagreement is not arithmetic. It is the board each probe builds, and the only structural
 * difference is w54's two lines of teleport:
 *
 *     g.players[a].pos=[ax,ay];  b.snapShipTo(a, …)
 *
 * TWO CANDIDATE MECHANISMS, AND THEY NEED DIFFERENT FIXES, WHICH IS WHY BOTH ARE MEASURED HERE:
 *
 *   (A) OFF CAMERA. snapShipTo moves a hull; nothing asks the camera to follow it. A pose can put
 *       both named captains outside the visible board, so the only hulls left for "nearest" to
 *       choose from are the two the pose never moved — including the player's OWN boat. The circle
 *       is then judged against a captain who is not in the fight.
 *   (B) MID-GLIDE. The hull is still travelling when MEASURE runs, so every rect is read at a
 *       position the ship is about to leave. w54's own settle signature watches the pill and the
 *       circles and NOT the ships, and it reported STILL MOVING on 19 of 21 poses.
 *
 * SO THIS PROBE POSES EXACTLY WHAT w54 POSES AND THEN ASKS THE TWO QUESTIONS w54 NEVER ASKS:
 *   onScreen  — is the named captain's hull inside the viewport at all?
 *   settled   — measured once when w54 would measure, and again after the SHIP rects stop moving
 * If (A) holds, the wrong-boat rows are dominated by poses whose named hull is off screen. If (B)
 * holds, waiting for the ships collapses the count on its own. If neither, w54 is right and there
 * is a real placement defect to fix.
 *
 * RULE 26: this is a POSED question, not a rate. Nothing here samples a voyage.
 */
import path from "node:path";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const PORT = 8496, DBG = 9396;
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-t013")));
const url = serve(PORT);
const C = await attach(DBG);

const ADVANCE = `(()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis)
    .find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro:'+(go.textContent||'').trim().slice(0,16);}
  return null;})()`;

const SHAPE = `(async()=>{try{
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  return {players:g.players.length, me:st.mySeat};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

// w54's pose, character for character in the part that matters
const pose = (a, d, ax, ay, dx, dy) => `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const b=await import('/src/ui/board.js');
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  g.players[${a}].pos=[${ax},${ay}]; g.players[${d}].pos=[${dx},${dy}];
  b.snapShipTo(${a}, g.players[${a}].pos); b.snapShipTo(${d}, g.players[${d}].pos);
  f.localAsk("\\u2694\\uFE0F "+(g.players[${a}].name||"Captain")+" \\u2014 a battle's brewing! Call the winner \\u2014 it's free, and ye get 2\\uD83C\\uDF15 if yer right.",
    [{label:"Call "+(g.players[${a}].name||("Captain "+${a})),value:"a",seat:${a}},
     {label:"Call "+(g.players[${d}].name||("Captain "+${d})),value:"d",seat:${d}}]);
  return {ok:true};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

/* THE SHIPS' OWN SETTLE SIGNATURE — the thing w54 does not watch. Quantised to 8px for the same
   reason w54's is: half this board breathes forever, and 8px separates arriving from breathing. */
const SHIPSIG = `(async()=>{try{
  const b=await import('/src/ui/board.js');
  return (b.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return Math.round(r.left/8)+','+Math.round(r.top/8);}).join(' ');
}catch(e){return ''}})()`;

const MEASURE = `(async()=>{try{
  const bd=await import('/src/ui/board.js');
  const ap=document.getElementById('actionPanel'); if(!ap) return {err:'no actionPanel'};
  const btns=[...ap.querySelectorAll('.apBtn')].filter(b=>b.offsetWidth>4);
  if(!btns.length) return {err:'no buttons'};
  const vw=window.innerWidth, vh=window.innerHeight;
  const boats=(bd.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return {l:r.left,t:r.top,r:r.right,b:r.bottom,
            /* ON SCREEN = the hull's box genuinely intersects the viewport. Not its centre: a hull
               half off the edge is still something a player can see and read a circle against. */
            on: r.right>0 && r.left<vw && r.bottom>0 && r.top<vh};});
  const edgeGap=(a,c)=>{const dx=Math.max(c.l-a.r,a.l-c.r,0),dy=Math.max(c.t-a.b,a.t-c.b,0);
    return Math.round(Math.hypot(dx,dy));};
  const rows=btns.map(bt=>{const r0=bt.getBoundingClientRect();
    const r={l:r0.left,t:r0.top,r:r0.right,b:r0.bottom};
    const seat=bt.dataset&&bt.dataset.seat!=null?+bt.dataset.seat:null;
    let nearest=null,nd=1e9;
    boats.forEach((bo,i)=>{const g=edgeGap(r,bo); if(g<nd){nd=g;nearest=i;}});
    /* AND THE SAME QUESTION ASKED ONLY OF THE HULLS A PLAYER CAN ACTUALLY SEE.
       ⚠ THE FIRST VERSION OF THIS METRIC COULD NOT FAIL, AND CEO 146 CAUGHT IT. It walked only the
       hulls with on=true and then asked nearestOn !== seat — so whenever the NAMED captain was
       off screen, that captain was skipped by the loop, nearestOn could never equal seat, and
       the row reported "wrong" with certainty whatever the game had drawn. 17 of 42 judgements were
       forced. That is rule 6's "a measurement that cannot fail is not a measurement", and it is the
       exact fault the previous review named, recurring one file later.
       SO IT IS ONLY ASKED WHERE IT CAN BE ANSWERED: when the named hull is itself on screen. When it
       is NOT, the honest reading is not "wrong boat" but "there is no boat to be beside", which is
       counted separately as namedOffScreen and is a DIFFERENT fault with a different fix. */
    const mine=seat!=null&&boats[seat]?boats[seat]:null;
    let nearestOn=null,ndo=1e9;
    boats.forEach((bo,i)=>{if(!bo.on)return;const g=edgeGap(r,bo); if(g<ndo){ndo=g;nearestOn=i;}});
    return {seat, nearest, nearestOn,
      mineOnScreen: mine?mine.on:null,
      gapToMine: mine?edgeGap(r,mine):null,
      wrongBoat: seat!=null&&nearest!==seat,
      /* null, not false, where the question is unanswerable — so the summary can count it apart
         rather than silently folding an unmeasured row into a measured total. */
      wrongBoatVisible: (seat!=null&&mine&&mine.on)?(nearestOn!==seat):null};});
  return {vw, vh, boatsOn: boats.map(b=>b.on?1:0).join(''), rows};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

async function boot(tag, w, h, mobile){
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t013-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await sleep(1000);
  await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${tag}: home`);
  await C.ev(`document.getElementById('choiceSolo').click();true`);
  await sleep(800);
  await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${tag}: name`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
  await C.ev(`document.getElementById('btnNameConfirm').click();true`);
  for (let i = 0; i < 90; i++){
    const live = await C.ev(`(()=>{const b=document.getElementById('pp4Prompt');const a=document.getElementById('actionPanel');
      return !!(b&&b.classList.contains('radial')&&a&&!a.dataset.pp4Stage&&a.querySelector('.apBtn'))})()`);
    if (live) return true;
    await C.ev(ADVANCE); await sleep(900);
  }
  return false;
}

const LEGS = [["phone", 390, 844, true], ["phone-short", 390, 664, true], ["tablet", 768, 1024, false]];
const N = 12;
const POSES = [];
for (const row of [0, 1, 2, Math.floor(N / 2), N - 2]) POSES.push([2, row, 5, row]);
POSES.push([1, 0, 2, 1]);
POSES.push([Math.max(0, N - 3), 0, Math.max(0, N - 2), 1]);

let measured = 0, notRun = 0;
let wrongAtW54Time = 0, wrongAfterShipsSettle = 0, wrongAmongVisible = 0, namedOffScreen = 0, rows = 0;
/* THE ONE NUMBER THAT DECIDES THIS. A circle within a hull's-breadth of the boat it names is
   ANCHORED; one half a screen away was placed by something else. Counting the two apart is what
   separates "the placement drifts a bit" from "the placement fails outright", and they are
   different bugs. 16px is one board square's worth of slack at phone scale, not a tuned threshold. */
let anchored = 0, stranded = 0, minStranded = 1e9, maxAnchored = 0;

for (const [tag, w, h, mob] of LEGS){
  console.log(`\n--- ${tag} ${w}x${h} ---`);
  if (!(await boot(tag, w, h, mob))){ console.log("  NOT RUN — never reached a live radial board prompt"); notRun++; continue; }
  const shape = await C.ev(SHAPE);
  if (!shape || shape.err){ console.log(`  NOT RUN — ${shape ? shape.err : "no shape"}`); notRun++; continue; }
  const seats = [];
  for (let i = 0; i < shape.players && seats.length < 2; i++) if (i !== shape.me) seats.push(i);
  for (const [ax, ay, dx, dy] of POSES){
    const p = await C.ev(pose(seats[0], seats[1], ax, ay, dx, dy));
    if (!p || p.err){ console.log(`  pose(${ax},${ay})/(${dx},${dy}): POSE FAILED — ${p ? p.err : "no result"}`); notRun++; continue; }
    await sleep(2200);                                  // roughly where w54's pill-settle lands
    const early = await C.ev(MEASURE);
    /* NOW WAIT FOR THE HULLS THEMSELVES. Bounded — 60 x 250ms = 15s — and it reports whether the
       ships stopped or the cap was hit, because "settled" and "we gave up" are different facts. */
    let last = "", same = 0, shipsStopped = false;
    for (let i = 0; i < 60; i++){
      const sig = await C.ev(SHIPSIG);
      if (sig && sig === last){ if (++same >= 3){ shipsStopped = true; break; } } else { same = 0; last = sig; }
      await sleep(250);
    }
    const late = await C.ev(MEASURE);
    if (!early || early.err || !late || late.err){ console.log(`  pose(${ax},${ay})/(${dx},${dy}): NOT RUN — ${(early&&early.err)||(late&&late.err)}`); notRun++; continue; }
    measured++;
    console.log(`  boats (${ax},${ay})/(${dx},${dy})  ships ${shipsStopped ? "stopped" : "STILL MOVING at the 15s cap"}  hulls on screen ${late.boatsOn}`);
    for (let i = 0; i < late.rows.length; i++){
      const e = early.rows[i], l = late.rows[i];
      rows++;
      if (e.wrongBoat) wrongAtW54Time++;
      if (l.wrongBoat) wrongAfterShipsSettle++;
      if (l.wrongBoatVisible === true) wrongAmongVisible++;
      if (!l.mineOnScreen) namedOffScreen++;
      if (l.gapToMine != null){
        if (l.gapToMine <= 16){ anchored++; if (l.gapToMine > maxAnchored) maxAnchored = l.gapToMine; }
        else { stranded++; if (l.gapToMine < minStranded) minStranded = l.gapToMine; }
      }
      console.log(`      seat ${l.seat}  own hull ${l.mineOnScreen ? "ON SCREEN" : "OFF SCREEN"}  gap to own ${e.gapToMine}px -> ${l.gapToMine}px` +
        `  nearest ${e.nearest}->${l.nearest}${l.wrongBoat ? " <-- WRONG BOAT" : ""}` +
        `  nearest among VISIBLE hulls ${l.nearestOn}${l.wrongBoatVisible ? " <-- WRONG BOAT" : ""}`);
    }
  }
}

console.log(`\n=== T-013 — WHICH INSTRUMENT? ===`);
console.log(`  poses measured: ${measured}   NOT RUN: ${notRun}   circles judged: ${rows}`);
console.log(`  wrong boat, measured where w54 measures ......... ${wrongAtW54Time}`);
console.log(`  wrong boat, after the SHIPS stop moving ......... ${wrongAfterShipsSettle}   (mechanism B: mid-glide — equal counts kill it)`);
console.log(`  the named captain is OFF SCREEN ................. ${namedOffScreen}   (mechanism A: nothing to be beside)`);
console.log(`  wrong boat where the named hull IS on screen .... ${wrongAmongVisible} of ${rows - namedOffScreen} answerable   <-- the rows a player could be misled by`);
console.log(`\n  ANCHORED (circle within 16px of the boat it names) .. ${anchored} of ${rows}   worst ${anchored ? maxAnchored + "px" : "n/a"}`);
console.log(`  STRANDED (further than that) ....................... ${stranded} of ${rows}   closest ${stranded ? minStranded + "px" : "n/a"}`);
console.log(`\n  READ IT THIS WAY: anchored circles are beside their captain and are never wrong.`);
console.log(`  A stranded circle's "nearest" is decided by whichever hull happens to be closest,`);
console.log(`  so it is the named captain only by luck — which is why the wrong-boat count is a`);
console.log(`  SYMPTOM of the stranding and not an independent fault.`);
killAll();
process.exit(0);
