#!/usr/bin/env node
/* THE BIRTH MATRIX — does HOW a pulsing button is born decide whether it ever pulses?
 *
 * Written 2026-08-24 for the pulse bug (.planning/debug-pulse/). Wyatt's 5-minute iPhone
 * recording proved the freeze is BORN WITH A PROMPT — always the "what'll ye do" turn menu,
 * never the trade fans — on a page whose other CSS animations are running perfectly. The
 * obvious suspects were all about BIRTH CONDITIONS: the petals are created behind
 * `#actionPanel.pendingReveal` (visibility:hidden) while `stageSettled()` waits for the boat,
 * inside a camera layer whose transform is tweening, with the `.radial` costume landing late.
 *
 * This runs the game's OWN literal pp4Grow keyframes under twelve birth conditions in a real
 * WebKit and asks which of them, if any, comes out flat.
 *
 * RED-PROOF, and it is not optional: case A (a plain visible petal) MUST swing at ~1.15. If it
 * does not, the engine or the harness is lying and no other row means anything.
 *
 * KNOWN RESULT, WebKit 26.5 (playwright webkit-2336, macOS arm64), 2026-08-24:
 *   ALL TWELVE SWING at 1.15 with a monotonic animation clock. No isolated birth condition
 *   reproduces the freeze. Recorded in EVIDENCE.md; it is why H5/H6/H7 are killed as standalone
 *   mechanisms and why the next instrument is a FULL-GAME WebKit run, not a bigger matrix.
 *
 * Usage:  node 4/scripts/wk_birth_matrix.mjs
 * Needs:  npx playwright install webkit   (browsers land in ~/Library/Caches/ms-playwright)
 * Leaves nothing running — the browser is closed in a finally, per CLAUDE.md rule 17.
 */
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/* Playwright is deliberately NOT a dependency of this repo — Pastry Pirates has no build step and
   no node_modules, and a probe must never change that. Install it anywhere and point PW_DIR at
   that folder. The error below prints the exact two commands. */
let webkit;
try {
  const pwDir = process.env.PW_DIR;
  ({ webkit } = await import(pwDir ? path.join(pwDir, 'node_modules/playwright/index.mjs') : 'playwright'));
} catch {
  console.error(`Cannot load playwright.

  mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright && npx playwright install webkit
  PW_DIR=/tmp/pw node 4/scripts/wk_birth_matrix.mjs
`);
  process.exit(1);
}

const KEYFRAMES = `@keyframes pp4Grow { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }`;

const PAGE = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#14496e}
.petal{position:fixed;width:66px;height:66px;border-radius:50%;background:#fffdf2;border:2.5px solid #177}
${KEYFRAMES}
/* the game's shape: granted by a DESCENDANT selector keyed on an ancestor's class */
#prompt.radial #ap .petal:not(.apDisabled):not(:disabled):not([aria-disabled="true"]){
  animation: pp4Grow 1.1s ease-in-out infinite; }
#ap.pendingReveal .petal{ visibility:hidden !important; }
/* the control cases must ESCAPE the gate — an inline style cannot beat the !important
   above, so they need a rule of their own. Getting this wrong makes every case a
   hidden-birth case and quietly destroys the red-proof. */
#ap.pendingReveal .petal.alwaysOn{ visibility:visible !important; }
.cam{position:absolute;inset:0;will-change:transform}
</style>
<div id="prompt"><div id="ap"><div class="cam" id="cam"></div></div></div>
<script>
const prompt=document.getElementById('prompt'),ap=document.getElementById('ap'),cam=document.getElementById('cam');
const CASES=['A_control','B_hiddenBirth','C_hidden_inTween','D_visible_inTween','E_displayNone',
             'F_hidden_statCam','G_ancestorClassLate','H_reparented','I_perFramePos',
             'J_displayChurn','K_ariaChurn','L_plain'];
const reg={};
CASES.forEach((id,i)=>{
  const el=document.createElement('div'); el.className='petal';
  el.style.left=(30+(i%6)*140)+'px'; el.style.top=(40+Math.floor(i/6)*400)+'px';
  (id==='C_hidden_inTween'||id==='D_visible_inTween'||id==='F_hidden_statCam'?cam:ap).appendChild(el);
  reg[id]=el;
});
reg.E_displayNone.style.display='none';
ap.classList.add('pendingReveal');            // every petal starts life hidden, as in the game
['A_control','D_visible_inTween','L_plain'].forEach(id=>reg[id].classList.add('alwaysOn'));
window.__revealed=false;
const t0=performance.now();
(function frame(){
  const p=Math.min(1,(performance.now()-t0)/900);
  cam.style.transform='translate3d('+(p*120).toFixed(2)+'px,0,0)';   // the director's glide
  reg.I_perFramePos.style.left=(30+2*140+p*3).toFixed(2)+'px';
  if(!window.__revealed){
    reg.J_displayChurn.style.display=(Math.floor(p*60)%2)?'none':'';
    reg.K_ariaChurn.setAttribute('aria-disabled',(Math.floor(p*60)%2)?'true':'false');
  }
  if(p<1) requestAnimationFrame(frame);
})();
setTimeout(()=>{                               // the moment pendingReveal lifts
  prompt.classList.add('radial');              // the costume lands LATE, as it does in stage.js
  reg.H_reparented.remove(); cam.appendChild(reg.H_reparented);
  reg.E_displayNone.style.display='';
  reg.J_displayChurn.style.display='';
  reg.K_ariaChurn.setAttribute('aria-disabled','false');
  ap.classList.remove('pendingReveal');
  window.__revealed=true;
},900);
window.__reg=reg;
<\/script>`;

const dir = mkdtempSync(path.join(tmpdir(), 'wkbirth-'));
const file = path.join(dir, 'birth.html');
writeFileSync(file, PAGE);

let b;
try {
  b = await webkit.launch();                    // headless; never takes over Wyatt's screen
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  await p.goto('file://' + file);
  await p.waitForFunction('window.__revealed === true', null, { timeout: 5000 });
  await p.waitForTimeout(150);
  const out = await p.evaluate(async () => {
    const ids = Object.keys(window.__reg), rec = {};
    ids.forEach(id => rec[id] = []);
    const t0 = performance.now();
    await new Promise(res => (function f(){
      ids.forEach(id => rec[id].push(window.__reg[id].getBoundingClientRect().width));
      performance.now() - t0 < 3300 ? requestAnimationFrame(f) : res();
    })());
    const r = {};
    for (const id of ids) {
      const w = rec[id], lo = Math.min(...w), hi = Math.max(...w);
      const a = window.__reg[id].getAnimations()[0];
      const c1 = a ? Number(a.currentTime) : null;
      await new Promise(res => setTimeout(res, 300));
      const c2 = a ? Number(a.currentTime) : null;
      r[id] = { lo:+lo.toFixed(1), hi:+hi.toFixed(1), ratio:+(hi/lo).toFixed(4),
                state: a ? a.playState : 'NO ANIMATION',
                clock: (c1!=null&&c2!=null) ? +(c2-c1).toFixed(0) : null };
    }
    return r;
  });
  console.log('\n=== WebKit birth matrix ===');
  let bad = 0;
  for (const [id, v] of Object.entries(out)) {
    const verdict = v.ratio > 1.10 ? 'SWINGS' : 'FLAT';
    if (verdict === 'FLAT') bad++;
    console.log(`  ${id.padEnd(20)} ${String(v.lo).padStart(5)} -> ${String(v.hi).padStart(5)}px  `
      + `ratio ${v.ratio}  [${v.state} clock+${v.clock}ms]  ${verdict}`);
  }
  if (out.A_control.ratio <= 1.10) {
    console.log('\n  RED-PROOF FAILED: the control is flat. Trust nothing above.');
    process.exitCode = 2;
  } else {
    console.log(`\n  Red-proof OK (control swings ${out.A_control.ratio}). ${bad} of `
      + `${Object.keys(out).length} birth conditions came out FLAT.`);
  }
} finally {
  if (b) await b.close();                       // rule 17: nothing left running
}
