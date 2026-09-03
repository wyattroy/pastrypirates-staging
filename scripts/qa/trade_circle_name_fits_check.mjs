/* T-017 — DOES A CAPTAIN'S NAME FIT INSIDE THE TRADE-OFFER CIRCLE IT NAMES?
 *
 *   node scripts/qa/trade_circle_name_fits_check.mjs
 *
 * THE BUG, seen three times on three configurations (`.planning/CHART.md` ⟨T-017⟩): in a trade, the
 * circle telling you WHOSE offer you are about to accept is the one piece of text on it that does
 * not fit. `solo-tablet-014-settled.png` — *Crustbeard* clipped by its own disc, the C on the left
 * rim and the final d severed on the right, while "Walk away" in the identical circle beside it
 * fits with room to spare. `crew-desktop-guest-012-settled.png` — *Flaky Jack* hanging out of both
 * sides. `solo-desktop-wk-021-settled.png` — WebKit desktop, build 2026.09.01.8, reading `rustbea`.
 * Chromium tablet, Chromium crew-desktop, WebKit desktop: neither engine-, size- nor mode-specific.
 *
 * WHY THIS SHAPE OF CHECK, AND IT IS RULE 26'S WHOLE POINT. "Is this drawn wrong?" is a GEOMETRIC
 * question, so it gets a geometric answer, not a rate over a voyage. A driven crew game offers a
 * handful of trade prompts an hour and the names it happens to deal are luck; `w14_swept_geometry`
 * settled a bigger question the same way in about a minute. So this asks ONE question of the real
 * shipped stylesheet: is the widest line of a petal's label wider than the space the petal has for
 * it? That has an exact answer, in pixels, every run, with no voyage in it.
 *
 * IT REACHES ITS SUBJECT — the part rule 6 says to prove before believing any instrument. It does
 * NOT hand-build a lookalike disc: it loads the real page, takes the real `#pp4Prompt` and
 * `#actionPanel`, adds the real `radial` class, and inserts real `.apBtn` nodes carrying the exact
 * `short:` HTML `src/ui/flow.js` builds for a trade (name on line one, crate icon and coins on line
 * two). Every number below is therefore produced by `#pp4Prompt.radial .apBtn`'s shipped rules —
 * the 66px width, the 2.5px border, the 5px padding and the 9.5px type — and not by arithmetic of
 * this file's own.
 *
 * WHY A `Range` AND NOT `scrollWidth`. A flex column whose child is a bare TEXT NODE does not
 * always grow `scrollWidth`; the text simply paints outside the box, which is exactly the symptom
 * in the screenshots — nothing is clipped, it hangs out of both rims. `Range.getBoundingClientRect()`
 * measures the painted ink of a text node directly, so it sees the overflow the box does not report.
 *
 * IT CAN FAIL HONESTLY, and it is RED-PROOFED IN BOTH DIRECTIONS by the control row: "Walk away" is
 * the same disc, the same stylesheet and the same measurement, and it is the label Wyatt's own
 * screenshots show fitting. If the control ever reports OVERFLOW, this instrument is wrong and its
 * verdict on the names means nothing — so the run says so and exits non-zero rather than reporting
 * a fault it cannot stand behind. If the page never reaches a stage, it says NOT RUN.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8533, DBG = 9435;

/* The four shipped defaults (`src/shared/index.js:599`, minus the "Capt. " prefix) plus the control.
   A player may type a longer name still, so these are the FLOOR of the problem, not its ceiling. */
const NAMES = ["Davy Scones", "Crustbeard", "Dough Hook", "Flaky Jack"];
const CONTROL = "Walk away";

const url = serve(PORT);
launch(DBG, "/tmp/chrome-t017fit");
const C = await attach(DBG);

/* Three sizes, because the disc is a fixed 66px at every one of them while the type is not
   guaranteed to be — and the three sightings were tablet, desktop and desktop-WebKit. */
const SIZES = [
  { name: "phone",   width: 390,  height: 844, dsf: 2, mobile: true },
  { name: "tablet",  width: 820,  height: 1180, dsf: 2, mobile: true },
  { name: "desktop", width: 1400, height: 900, dsf: 1, mobile: false },
];

/* POSE THE PETALS (rule 26 / DRIVING-THE-GAME §5e — inject the state, do not play your way to it).
   The short form is copied from src/ui/flow.js:2184: the captain's name, <br>, then the crate icon
   and the coins. `iconImg` renders an <img>; a 17px box is what `#pp4Prompt.radial .apBtn img` sizes
   it to, so the second line is represented at its real width rather than as text.

   ⚠ IT REMOVES `pp4Center` BEFORE ADDING `radial` — THEY ARE ALTERNATIVES, NEVER BOTH, and the
   first cut of this check got that wrong and measured a fiction for a whole pass. A resting prompt
   already carries `pp4Center`; adding `radial` on top produced classes ["pp4Center","radial"],
   which the game never emits, and pp4Center's rules won — the disc computed 110px at 15px type
   instead of the 66px at 9.5px `#pp4Prompt.radial .apBtn` specifies (index.html:1847,1853).
   In that fiction "Crustbeard" FITS, flatly contradicting Wyatt's own screenshot of it clipped at
   both ends. THAT CONTRADICTION IS WHAT EXPOSED THE INSTRUMENT rather than the game (rule 6: when a
   check disagrees with something you have seen, suspect the check). `stage.js:2517` and `:2669` are
   the game's own transitions and both do exactly this. The OTHER_STYLE_FONT guard below now makes
   the same mistake impossible to report as a result. */
const POSE = (names, control) => `(()=>{
  const p=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
  if(!p||!ap) return "nostage";
  /* Let the GAME choose radial rather than forcing the class: promptTick re-evaluates on its own
     beat and will strip a class it did not decide on. A centre-stage card outranks everything
     (stage.js:2665), so that flag is cleared first; then menuButtons() (stage.js:2416) blesses
     these petals because each carries _shortHtml, exactly as an ask() option's short form does
     (flow.js:248). What is measured afterwards is therefore a disc the game put into radial mode. */
  delete ap.dataset.pp4Stage;
  for(const n of ap.querySelectorAll('.bko,.btlBtn,.recipeList,select')) n.remove();
  let row=ap.querySelector('.apBtns');
  if(!row){row=document.createElement('div');row.className='apBtns';ap.appendChild(row);}
  row.innerHTML='';
  const mk=(html,tag)=>{const b=document.createElement('button');b.className='apBtn';
    b.innerHTML=html;b._shortHtml=html;b.dataset.t017=tag;row.appendChild(b);return b;};
  for(const n of ${JSON.stringify(names)})
    mk('<b style="color:#c33">'+n+'</b><br><img src="assets/ingredients/sugar.png">+3🌕','name:'+n);
  mk(${JSON.stringify(control)},'control');
  return "posed";})()`;

/* Wait for the game's own tick to put the prompt into radial mode. Bounded (rule 17). */
const IS_RADIAL = `(()=>{const p=document.getElementById('pp4Prompt');
  return !!(p&&p.classList.contains('radial'));})()`;

/* THE MEASUREMENT. For every petal: the inner width the disc actually offers (its own clientWidth
   minus its own resolved padding — read back from the renderer, never assumed), against the widest
   painted line inside it. Lines are split on the <br>, and each text node is measured with a Range,
   which reports painted ink rather than box geometry. */
const MEASURE = `(()=>{
  const out=[];
  for(const b of document.querySelectorAll('.apBtn[data-t017]')){
    const cs=getComputedStyle(b), br=b.getBoundingClientRect();
    let L=Infinity,R=-Infinity,T=Infinity,B=-Infinity,text='';
    const corners=[];
    for(const node of b.childNodes){
      if(node.nodeName==='BR'||!node.textContent||!node.textContent.trim()) continue;
      /* The name arrives wrapped in <b> (pn(), src/ui/util.js:312) and the control arrives as a
         bare text node, so BOTH shapes are measured. getClientRects() gives one rect PER PAINTED
         LINE, so a name that wraps is measured as the lines it really draws rather than as one
         long line it does not — "Dough Hook" wraps and "Crustbeard" cannot, and that difference is
         the whole bug. */
      const r=document.createRange(); r.selectNodeContents(node);
      for(const q of r.getClientRects()){
        if(q.width<=0&&q.height<=0) continue;
        L=Math.min(L,q.left); R=Math.max(R,q.right); T=Math.min(T,q.top); B=Math.max(B,q.bottom);
        corners.push([q.left,q.top],[q.right,q.top],[q.left,q.bottom],[q.right,q.bottom]);
      }
      if(!text) text=node.textContent.trim();
    }
    const has=isFinite(L);
    /* THE BOUNDARY IS THE INSCRIBED CIRCLE, NOT THE SQUARE AROUND IT. The petal is
       border-radius:50% (index.html:1847): widest at its middle, narrowing to nothing at the top —
       which is exactly where these labels sit. Judging against the bounding RECT passed every name
       while the posed picture still showed them crossing the painted rim. Worst overhang below is
       the furthest any line-corner escapes that circle, in px. */
    const cx=br.left+br.width/2, cy=br.top+br.height/2;
    const bw=parseFloat(cs.borderTopWidth)||0;
    const rad=Math.min(br.width,br.height)/2-bw;
    let worst=0;
    for(const [x,y] of corners){
      const d=Math.hypot(x-cx,y-cy)-rad;
      if(d>worst) worst=d;
    }
    out.push({tag:b.dataset.t017, text,
      out:+worst.toFixed(2), rad:+rad.toFixed(2),
      outL:has?+(br.left-L).toFixed(2):0, outR:has?+(R-br.right).toFixed(2):0,
      outT:has?+(br.top-T).toFixed(2):0,  outB:has?+(B-br.bottom).toFixed(2):0,
      box:+br.width.toFixed(2), font:cs.fontSize,
      /* carried so the runner can prove the pose reached the RADIAL disc and not some other
         prompt style — see the DISC_MAX guard below */
      radial:document.getElementById('pp4Prompt').classList.contains('radial')});
  }
  return JSON.stringify(out);})()`;

/* THE POSE'S OWN GUARD, and it is the lesson of this file's first cut: a pose that lands in a
   DIFFERENT prompt style describes a box the game never draws, and every number after it is
   fiction. `pp4Center` renders a 110px disc at 15px type, and in that fiction every name "fits".

   ⚠ IT USED TO BE A WIDTH CAP — `DISC_MAX = 80`, because "a correctly posed petal renders 71px" —
   AND THAT STOPPED BEING TRUE ON 2026-09-03. Wyatt ruled "Do bigger circles, not smaller text", so
   `fitFanToLabels` (src/ui/stage.js) now grows the fan's disc until the label fits at the
   stylesheet's own size: a real, correctly posed radial petal measured 97.8–104.9px that day. The
   width cap turned this gate's verdict into **NOT RUN at all three sizes** — a gate that had gone
   blind while still looking healthy, exactly the class `docs/HARD-WON-LESSONS.md` §3 is about.

   SO THE GUARD NOW READS THE TELL THAT ACTUALLY SEPARATES THE TWO STYLES: the FONT. Radial declares
   9.5px, the centre-stage card 15px. That is a property of which stylesheet rule won, and unlike a
   width it is not something the fix is allowed to move — the whole point of the fix is that the
   type stays at 9.5px. Loosening the number to 120 would have worked today and gone blind again the
   next time a disc grows; this cannot. */
const OTHER_STYLE_FONT = 15;

console.log("T-017 — does a captain's name fit the circle that names them?\n");

await C.ev(`location.href=${JSON.stringify(url)}`);
await sleep(2500);
await C.ev(`localStorage.clear()`);
await C.ev(`location.reload()`);
await sleep(2500);

/* A stage has to exist before #pp4Prompt is anything. Solo is the cheapest route to one, and the
   trade circle is not a host/guest question — the bug was seen in solo AND in a crew guest. */
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);
await sleep(2500);

let anyRan = false, offenders = [], controlBroken = [];

for (const s of SIZES) {
  await C.send("Emulation.setDeviceMetricsOverride",
    { width: s.width, height: s.height, deviceScaleFactor: s.dsf, mobile: s.mobile });
  await sleep(400);

  const posed = await C.ev(POSE(NAMES, CONTROL));
  if (posed !== "posed") { console.log(`  ${s.name}: NOT RUN — no stage to pose on (${posed})`); continue; }

  let wentRadial = false;
  for (let i = 0; i < 24; i++) {                                   // bounded, rule 17
    if (await C.ev(IS_RADIAL) === true) { wentRadial = true; break; }
    await sleep(250);
  }
  if (!wentRadial) { console.log(`  ${s.name}: NOT RUN — the game never took these petals radial`); continue; }
  await sleep(250);

  const rows = JSON.parse(await C.ev(MEASURE));
  if (!rows.length) { console.log(`  ${s.name}: NOT RUN — posed, but nothing measured`); continue; }
  if (!rows[0].radial || parseFloat(rows[0].font) >= OTHER_STYLE_FONT) {
    console.log(`  ${s.name}: NOT RUN — the pose did not land on the radial disc ` +
      `(radial=${rows[0].radial}, type ${rows[0].font}, and the centre-stage card is ${OTHER_STYLE_FONT}px). ` +
      `Not a pass, and not a fault.`);
    continue;
  }
  anyRan = true;

  console.log(`  ${s.name} (${s.width}x${s.height}, dsf ${s.dsf}) — disc ${rows[0].box}px, type ${rows[0].font}`);
  for (const r of rows) {
    /* A hair of rounding is not a defect the eye can see; a whole letter is. 1px of tolerance
       keeps sub-pixel layout noise from being reported as a fault. */
    const fits = r.out <= 1;
    const label = r.tag === "control" ? `${CONTROL} (control)` : r.text;
    const how = `${r.out}px past the ${r.rad}px rim`;
    console.log(`      ${fits ? "fits    " : "OUTSIDE "}  ${label.padEnd(24)} ` +
      (fits ? `inside the ${r.rad}px rim` : `ink ${how}`));
    if (!fits && r.tag === "control") controlBroken.push(`${s.name}: ${CONTROL} — ${how}`);
    else if (!fits) offenders.push(`${s.name}: ${r.text} — ${how}`);
  }
  console.log("");
}

await C.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
killAll();

if (!anyRan) {
  console.log("NOT RUN — never reached a stage to pose the petals on. This is not a pass.");
  process.exit(2);
}

/* THE INSTRUMENT'S OWN RED-PROOF, CHECKED BEFORE ITS VERDICT IS BELIEVED. "Walk away" is the label
   Wyatt's screenshots show fitting comfortably in this identical disc. If THIS measurement says it
   overflows, the measurement is wrong — and a broken instrument must not be allowed to convict the
   names. Rule 6: when a check condemns something known to work, suspect the check first. */
if (controlBroken.length) {
  console.log("INSTRUMENT FAILED ITS OWN CONTROL — the verdict below is void:");
  for (const c of controlBroken) console.log("   " + c);
  console.log(`\n"${CONTROL}" is shown fitting this same disc in his own screenshots. This check is`);
  console.log("measuring something other than what it names. Fix it before believing anything it says.");
  process.exit(3);
}

if (offenders.length) {
  console.log(`FAIL — ${offenders.length} captain name(s) painted outside the disc naming them:`);
  for (const o of offenders) console.log("   " + o);
  console.log(`\nThe control "${CONTROL}" fit in every size, in the same disc, measured the same way —`);
  console.log("so this is the name, not the instrument. src/ui/flow.js:2171,2184 put the name on line");
  console.log("one of a fixed 66px circle (index.html:1847) with nothing sizing it to fit.");
  process.exit(1);
}

console.log(`PASS — every captain name fits its own circle at all three sizes, and "${CONTROL}" still does too.`);
