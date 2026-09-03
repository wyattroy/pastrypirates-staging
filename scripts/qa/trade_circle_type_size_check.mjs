/* T-017 — DOES A PETAL SHOW ITS LABEL AT THE SIZE THE STYLESHEET DECLARES?
 *
 *   node scripts/qa/trade_circle_type_size_check.mjs
 *   node scripts/qa/trade_circle_type_size_check.mjs --red=nogrow    replay the pre-fix disc
 *   node scripts/qa/trade_circle_type_size_check.mjs --red=crush     replay the type he rejected
 *
 * WYATT'S RULING, VERBATIM, AND IT IS THE WHOLE REASON THIS FILE EXISTS:
 *
 *     "Do bigger circles, not smaller text."
 *
 * `trade_circle_name_fits_check.mjs` — the sibling gate, and it stays — asks *does the name fit*.
 * It has been GREEN since `fitLabelToDisc` shipped, and it was green on the very build he was
 * looking at when he wrote that sentence. It is green because the name is being crushed from the
 * stylesheet's 9.5px down to a 5.5px floor, which is the thing he was objecting to. **A gate that
 * passes BECAUSE the text got smaller cannot see the fault he reported**, so the question he asked
 * needs its own measurement: not *does it fit*, but *at what price*.
 *
 * THE QUESTION THIS ASKS: for every petal in a posed trade fan, is the rendered `font-size` the one
 * `#pp4Prompt.radial .apBtn` declares? Anything smaller is the disc winning an argument with the
 * name, which is what he ruled against.
 *
 * WHY THE PAIR IS THE POINT AND NEITHER GATE IS ENOUGH ALONE. Satisfying this one alone is trivial
 * and wrong — delete the shrink and every name hangs out of its rim again, exactly as in his three
 * screenshots. Satisfying the sibling alone is what shipped and what he rejected. **Both green at
 * once is the only state that means anything**, which is why this file runs the sibling's fit
 * predicate too and refuses to pass a petal whose ink has escaped the disc.
 *
 * IT REACHES ITS SUBJECT (rule 6). It loads the real page, lets the GAME decide to go radial rather
 * than forcing the class, and inserts the exact `short:` HTML `src/ui/flow.js:2184` builds for a
 * trade offer — name on line one, crate icon and coins on line two, because TRADE-SYSTEM.md §4 is
 * explicit that a compact form "may drop words, never the price". Every number below is produced by
 * the shipped stylesheet.
 *
 * IT CAN FAIL, AND `--red=` PROVES IT RATHER THAN ASSERTING IT — ONE MODE PER ARM OF THE VERDICT,
 * because one working arm must not be allowed to certify both. `--red=nogrow` pins the petals back
 * to the stylesheet's disc and reproduces his own screenshots (names ~10–12px past the rim);
 * `--red=crush` leaves the grown disc and puts the type back on the 5.5px floor he rejected.
 * **A `--red=` run that changed nothing exits 2 rather than reporting a pass** — a red-proof that
 * proves nothing is worse than none, because it is a green light with a certificate. Earned two
 * watches ago on this branch by a gate that printed PASS for a brand-new reason.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8536, DBG = 9438;
const RED = (process.argv.find(a => a.startsWith("--red=")) || "").split("=")[1] || "";
if (RED && !["nogrow", "crush"].includes(RED)) {
  console.log(`unknown --red mode "${RED}" — expected nogrow or crush`);
  process.exit(2);
}

/* The four shipped defaults (`src/shared/index.js`, minus the "Capt. " prefix) plus the control
   Wyatt's own screenshots show fitting comfortably in this identical disc. A player may type a
   longer name still, so these are the FLOOR of the problem, not its ceiling. */
const NAMES = ["Davy Scones", "Crustbeard", "Dough Hook", "Flaky Jack"];
const CONTROL = "Walk away";

const SIZES = [
  { name: "phone",   width: 390,  height: 844,  dsf: 2, mobile: true },
  { name: "tablet",  width: 820,  height: 1180, dsf: 2, mobile: true },
  { name: "desktop", width: 1400, height: 900,  dsf: 1, mobile: false },
];

const url = serve(PORT);
launch(DBG, "/tmp/chrome-t017type");
const C = await attach(DBG);

/* POSE THE PETALS (rule 26 / DRIVING-THE-GAME §5e — inject the state, do not play your way to it).
   ⚠ `pp4Center` is REMOVED before radial is allowed: they are alternatives and never both. The
   sibling check's first cut got that wrong and measured a fiction for a whole pass — a 110px disc
   at 15px type, in which every name "fits". */
const POSE = `(()=>{
  const p=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
  if(!p||!ap) return "nostage";
  delete ap.dataset.pp4Stage;
  for(const n of ap.querySelectorAll('.bko,.btlBtn,.recipeList,select')) n.remove();
  let row=ap.querySelector('.apBtns');
  if(!row){row=document.createElement('div');row.className='apBtns';ap.appendChild(row);}
  row.innerHTML='';
  const mk=(html,tag)=>{const b=document.createElement('button');b.className='apBtn';
    b.innerHTML=html;b._shortHtml=html;b.dataset.t017=tag;row.appendChild(b);return b;};
  for(const n of ${JSON.stringify(NAMES)})
    mk('<b style="color:#c33">'+n+'</b><br><img src="assets/ingredients/sugar.png">+3🌕','name:'+n);
  mk(${JSON.stringify(CONTROL)},'control');
  return "posed";})()`;

const IS_RADIAL = `(()=>{const p=document.getElementById('pp4Prompt');
  return !!(p&&p.classList.contains('radial'));})()`;

/* THE RED-PROOFS, AND THEY BREAK THE TWO HALVES SEPARATELY ON PURPOSE. A verdict with two arms
   needs a proof per arm, or one working arm certifies both.

     `nogrow`  puts every petal back to the width the stylesheet declares and leaves the type alone.
               That is not a synthetic break — it is a REPLAY OF THE BUILD HE COMPLAINED ABOUT, and
               it reproduces his own screenshots: full-size names hanging ~10–12px past the rim.
               It trips the ESCAPED arm.
     `crush`   leaves the grown disc alone and crushes the type to the old 5.5px floor, which is the
               state he rejected. Everything fits; nothing escapes. It trips the SHRUNK arm, and it
               is the one that proves this gate sees the fault the sibling gate cannot.

   Both run AFTER the game's own pass, and the runner checks they actually moved a number before
   believing either. */
const APPLY_RED = mode => `(()=>{
  let touched=0;
  for(const b of document.querySelectorAll('.apBtn[data-t017]')){
    const before=b.getBoundingClientRect().width+'|'+getComputedStyle(b).fontSize;
    ${mode === "crush"
      ? "b.style.fontSize='5.5px';"
      : "b.style.width=''; b.style.height='';"}
    if(b.getBoundingClientRect().width+'|'+getComputedStyle(b).fontSize !== before) touched++;
  }
  return touched;})()`;

/* THE MEASUREMENT. Two numbers per petal, and they are different questions:
     `font`     — what the renderer actually drew the label at
     `declared` — what `#pp4Prompt.radial .apBtn` says it should be, read from a petal with its
                  inline size cleared, so it is the CSS's answer and not a number copied out of it
   plus the sibling's fit predicate, so a petal cannot pass this gate by escaping its own rim. */
const MEASURE = `(()=>{
  const probe=document.querySelector('.apBtn[data-t017]');
  let declared=null;
  if(probe){
    const keepF=probe.style.fontSize, keepW=probe.style.width, keepH=probe.style.height;
    probe.style.fontSize=''; probe.style.width=''; probe.style.height='';
    declared=parseFloat(getComputedStyle(probe).fontSize);
    probe.style.fontSize=keepF; probe.style.width=keepW; probe.style.height=keepH;
  }
  const out=[];
  for(const b of document.querySelectorAll('.apBtn[data-t017]')){
    const cs=getComputedStyle(b), br=b.getBoundingClientRect();
    const cx=br.left+br.width/2, cy=br.top+br.height/2;
    const bw=parseFloat(cs.borderTopWidth)||0;
    const rad=Math.min(br.width,br.height)/2-bw;
    let worst=0, text='';
    for(const n of b.childNodes){
      if(!n.textContent||!n.textContent.trim()) continue;
      const rng=document.createRange(); rng.selectNodeContents(n);
      for(const q of rng.getClientRects()){
        if(q.width<=0&&q.height<=0) continue;
        for(const [x,y] of [[q.left,q.top],[q.right,q.top],[q.left,q.bottom],[q.right,q.bottom]]){
          const d=Math.hypot(x-cx,y-cy)-rad;
          if(d>worst) worst=d;
        }
      }
      if(!text) text=n.textContent.trim();
    }
    out.push({tag:b.dataset.t017, text, declared,
      font:+parseFloat(cs.fontSize).toFixed(2),
      disc:+br.width.toFixed(2), out:+worst.toFixed(2), rad:+rad.toFixed(2),
      radial:document.getElementById('pp4Prompt').classList.contains('radial')});
  }
  return JSON.stringify(out);})()`;

/* THIS GATE IS ABOUT GROWING THE DISC, so its "did the pose land in the right prompt style?" guard
   cannot be the sibling's "roughly 71px wide" — that would condemn the very fix it is measuring.
   The tell that separates radial from the centre-stage card is the OTHER style's font size: 15px,
   against radial's 9.5px. A petal drawn at 15px is not a petal. */
const OTHER_STYLE_FONT = 15;

console.log(`T-017 — does a petal show its label at the size the stylesheet declares?${RED ? `   [--red=${RED}]` : ""}\n`);

await C.ev(`location.href=${JSON.stringify(url)}`);
await sleep(2500);
await C.ev(`localStorage.clear()`);
await C.ev(`location.reload()`);
await sleep(2500);

/* A stage has to exist before #pp4Prompt is anything. Solo is the cheapest route to one, and this
   is not a host/guest question — the bug was seen in solo AND in a crew guest. */
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);
await sleep(2500);

let anyRan = false, shrunk = [], escaped = [], controlBroken = [], redTouched = 0;

for (const s of SIZES) {
  await C.send("Emulation.setDeviceMetricsOverride",
    { width: s.width, height: s.height, deviceScaleFactor: s.dsf, mobile: s.mobile });
  await sleep(400);

  const posed = await C.ev(POSE);
  if (posed !== "posed") { console.log(`  ${s.name}: NOT RUN — no stage to pose on (${posed})`); continue; }

  let wentRadial = false;
  for (let i = 0; i < 24; i++) {                                   // bounded, rule 17
    if (await C.ev(IS_RADIAL) === true) { wentRadial = true; break; }
    await sleep(250);
  }
  if (!wentRadial) { console.log(`  ${s.name}: NOT RUN — the game never took these petals radial`); continue; }
  await sleep(400);

  if (RED) redTouched += (await C.ev(APPLY_RED(RED))) | 0;

  const rows = JSON.parse(await C.ev(MEASURE));
  if (!rows.length) { console.log(`  ${s.name}: NOT RUN — posed, but nothing measured`); continue; }
  if (!rows[0].radial || rows[0].font >= OTHER_STYLE_FONT || !(rows[0].declared > 0)) {
    console.log(`  ${s.name}: NOT RUN — the pose did not land on the radial disc ` +
      `(radial=${rows[0].radial}, type ${rows[0].font}px, declared ${rows[0].declared}). Not a pass, and not a fault.`);
    continue;
  }
  anyRan = true;

  const dec = rows[0].declared;
  console.log(`  ${s.name} (${s.width}x${s.height}, dsf ${s.dsf}) — stylesheet declares ${dec}px type; disc drawn at ${rows[0].disc.toFixed(1)}px`);
  for (const r of rows) {
    const label = r.tag === "control" ? `${CONTROL} (control)` : r.text;
    /* A hair of rounding is not a defect the eye can see. 0.25px of tolerance on the type and 1px
       on the ink keeps sub-pixel layout noise out of the verdict — the same 1px the sibling uses. */
    const full = r.font >= dec - 0.25;
    const fits = r.out <= 1;
    console.log(`      ${full ? "full    " : "SHRUNK  "}${fits ? "        " : "OUTSIDE "} ${label.padEnd(24)} ` +
      `${r.font}px on a ${r.disc.toFixed(1)}px disc` + (fits ? "" : ` — ink ${r.out}px past the ${r.rad}px rim`));
    if (!full) shrunk.push(`${s.name}: ${label} — ${r.font}px, not the declared ${dec}px`);
    if (!fits && r.tag === "control") controlBroken.push(`${s.name}: ${CONTROL} — ink ${r.out}px past the ${r.rad}px rim`);
    else if (!fits) escaped.push(`${s.name}: ${label} — ink ${r.out}px past the ${r.rad}px rim`);
  }
  console.log("");
}

await C.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
killAll();

if (!anyRan) {
  console.log("NOT RUN — never reached a stage to pose the petals on. This is not a pass.");
  process.exit(2);
}

/* A RED-PROOF THAT CHANGED NOTHING IS NOT A RED-PROOF. If the mode could not move a single number,
   this run says nothing about whether the gate can fail — so it exits 2 rather than reporting
   whatever verdict it happened to reach. */
if (RED && redTouched === 0) {
  console.log(`--red=${RED} CHANGED NOTHING — every petal was already at the stylesheet's own size,`);
  console.log("so this run proves nothing about whether this gate can fail. Not a pass.");
  process.exit(2);
}

if (controlBroken.length) {
  console.log("INSTRUMENT FAILED ITS OWN CONTROL — the verdict below is void:");
  for (const c of controlBroken) console.log("   " + c);
  console.log(`\n"${CONTROL}" is shown fitting this same disc in his own screenshots. Fix this before`);
  console.log("believing anything else this check says.");
  process.exit(3);
}

if (escaped.length) {
  console.log(`FAIL — ${escaped.length} label(s) painted OUTSIDE the disc naming them:`);
  for (const e of escaped) console.log("   " + e);
  console.log("\nThe type may be full size, but the name has left the circle — which is the original");
  console.log("T-017 fault. Both halves have to hold at once; see this file's header.");
  process.exit(1);
}

if (shrunk.length) {
  console.log(`FAIL — ${shrunk.length} label(s) drawn smaller than the stylesheet declares:`);
  for (const s of shrunk) console.log("   " + s);
  console.log('\nWyatt, on exactly this: "Do bigger circles, not smaller text." The name fits only');
  console.log("because it was crushed, which is why the sibling gate has been green throughout.");
  process.exit(1);
}

console.log("PASS — every label is drawn at the stylesheet's own size AND stays inside its rim,");
console.log(`at all three sizes, with "${CONTROL}" still fitting the same disc.`);
