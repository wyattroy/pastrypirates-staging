/* T-18 — "there should be a narration typing display rule that keeps parentheses with their
 * clauses, but it is broken across the game (eg here, where the parenthesis after 'Dough Hook
 * (+2🌕)'). Fix this universally."  — Wyatt, 2026-08-26, screenshot of build 2026-08-25g
 *
 * THE PUZZLE THIS RESOLVES: flow.js:2598 ALREADY wraps that unit in <span class="nobrk">, and
 * .nobrk is `white-space:nowrap`. By reading, it cannot break. It broke. So this measures the
 * REAL page with the REAL stylesheet instead of reasoning further.
 *
 * THE INSTRUMENT: an element that occupies more than one line box returns more than one client
 * rect. getClientRects().length > 1 IS the break — no eyeballing, no screenshot reading.
 *
 * RED-PROOFED: it measures a control string with NO nobrk wrapper alongside. If the control does
 * not break at the same width, the harness is not narrow enough to prove anything and says so.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8497, DBG = 9355;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-t18");
const C = await attach(DBG);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await sleep(1200);

/* Build the exact ceremony line inside the REAL narration box, at a phone width, and ask the
   browser where each piece actually landed. Widths swept so a pass cannot be an accident of one. */
const PROBE = `JSON.stringify((()=>{
  const host=document.getElementById('actionPanel')||document.body;
  const box=document.createElement('div');
  box.className='apMsg';
  box.style.cssText='position:fixed;left:0;top:0;z-index:99999;visibility:hidden';
  host.appendChild(box);

  const coin='<img class="narrIcon" src="../assets/icons/coin.png" alt="">';
  // the shipped construction, flow.js:2598 — name and amount inside ONE nobrk span
  const wrapped = n => '<span class="nobrk"><span style="color:#c96">'+n+'</span> (+2'+coin+')</span>';
  // the control: identical text, NO nobrk. If this does not break, the width proves nothing.
  const bare    = n => '<span style="color:#c96">'+n+'</span> (+2'+coin+')';

  const out=[];
  for(const w of [300,340,390,430]){
    box.style.width=w+'px';
    for(const [kind,build] of [['wrapped',wrapped],['control',bare]]){
      box.innerHTML='No fretting, patience pays — '+
        build('Flaky Jack')+', '+build('Dough Hook')+', '+build('Crustbeard')+
        ' all cast off with extra dubloons.';
      const spans=[...box.querySelectorAll('span.nobrk')];
      const broke = kind==='wrapped'
        ? spans.some(s=>s.getClientRects().length>1)
        : (()=>{ // control: did any "(+2 coin )" group straddle a line?
            const imgs=[...box.querySelectorAll('img')];
            return imgs.some(img=>{
              const r=img.getBoundingClientRect();
              const next=img.nextSibling;                 // the ")" text node
              if(!next) return false;
              const rng=document.createRange(); rng.selectNodeContents(next);
              const nr=rng.getBoundingClientRect();
              return Math.abs(nr.top-r.top)>2;            // different line box
            });
          })();
      out.push({width:w,kind,broke,nobrkCount:spans.length,
                whiteSpace: spans[0]?getComputedStyle(spans[0]).whiteSpace:'n/a'});
    }
  }
  box.remove();
  return out;
})())`;

const rows = JSON.parse(await C.ev(PROBE));
console.log("\n=== T-18: does a parenthetical break across lines? ===");
console.log("  width  kind      broke   white-space");
for (const r of rows)
  console.log(`  ${String(r.width).padEnd(6)} ${r.kind.padEnd(9)} ${String(r.broke).padEnd(7)} ${r.whiteSpace}`);

const wrappedBroke = rows.filter(r => r.kind === "wrapped" && r.broke).length;
const controlBroke = rows.filter(r => r.kind === "control" && r.broke).length;

console.log("");
if (controlBroke === 0) console.log("  INCONCLUSIVE — even the UNWRAPPED control never broke; the box is too wide to prove anything.");
else if (wrappedBroke === 0) console.log(`  nobrk HOLDS in a static box (control broke at ${controlBroke}/4 widths, wrapped at 0).`);
else console.log(`  REPRODUCED — the nobrk span itself broke at ${wrappedBroke}/4 widths.`);
console.log("");

killAll();
