/* THE NARRATION LINE-BREAK GATE — T-18, and every future instance of it.
 *
 * Wyatt, 2026-08-26: "there should be a narration typing display rule that keeps parentheses with
 * their clauses, but it is broken across the game... Fix this universally."
 *
 * WHAT IT MEASURES, in a REAL running game, not a synthesised box: every parenthetical group the
 * narration draws, and whether its opening bracket and closing bracket landed on the same line.
 * An element occupying two line boxes returns two client rects; a text range that straddles a line
 * has two different `top` values. Both are facts the browser reports — nothing is eyeballed.
 *
 * A PREVIOUS VERSION OF THIS PROBE MEASURED NOTHING AND REPORTED PASS. It appended its test box to
 * #actionPanel, which is display:none on the welcome screen, so every rect was empty and every
 * check was false. It was caught only because it also measured an UNWRAPPED control that MUST break
 * — and the control did not. That control stays. A check that cannot fail is not protection.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = Number(process.env.QA_PORT || 8499), DBG = Number(process.env.QA_DBG || 9357);
const WIDTH = Number(process.env.QA_WIDTH || 390), HEIGHT = Number(process.env.QA_HEIGHT || 844);
const url = serve(PORT);
launch(DBG, `/tmp/chrome-qa-narr-${PORT}`);
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','narr-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);

/* start a solo voyage; ?ovens=1 is not used — ordinary narration is what carries parentheticals */
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "Play Solo");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';document.getElementById('btnNameConfirm').click();true`);
  await sleep(1500);
}

/* THE MEASUREMENT — every visible parenthetical in the narration box, right now.
   Walks text, pairs "(" with its ")", and asks the browser which line each landed on. */
const SAMPLE = `JSON.stringify((()=>{
  const out=[];
  for(const box of document.querySelectorAll('.apMsg, .narrBubble, .apWhy, .stageMsg')){
    const r=box.getBoundingClientRect();
    if(r.width<2||r.height<2) continue;                       // not laid out -> not measurable
    if(getComputedStyle(box).visibility==='hidden') continue;
    const txt=box.innerText||'';
    if(!txt.includes('(')) continue;
    // map every character to its line box via a Range over the text nodes
    const nodes=[]; const w=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);
    let n; while(n=w.nextNode()) if(n.nodeValue&&n.nodeValue.trim()!=='') nodes.push(n);
    const topOf=(node,off)=>{ const rg=document.createRange(); rg.setStart(node,off); rg.setEnd(node,Math.min(off+1,node.nodeValue.length));
      const rr=rg.getBoundingClientRect(); return rr.height?rr.top:null; };
    let open=null;
    for(const node of nodes){
      const s=node.nodeValue;
      for(let i=0;i<s.length;i++){
        if(s[i]==='(') open={node,i,top:topOf(node,i)};
        else if(s[i]===')'&&open){
          const closeTop=topOf(node,i);
          if(open.top!==null&&closeTop!==null&&Math.abs(closeTop-open.top)>2)
            out.push({text:txt.slice(0,90),split:true});
          open=null;
        }
      }
    }
  }
  return out;
})())`;

/* the CONTROL, proving the instrument can see a break at this width at all */
const CONTROL = `(()=>{
  const box=document.querySelector('.apMsg');
  if(!box) return 'no .apMsg on screen';
  const r=box.getBoundingClientRect();
  if(r.width<2) return 'apMsg not laid out';
  const probe=document.createElement('span');
  probe.textContent='CONTROLWORD (AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA)';
  box.appendChild(probe);
  const rects=probe.getClientRects().length;
  probe.remove();
  return rects>1 ? 'CAN SEE A BREAK ('+rects+' line boxes)' : 'CANNOT see a break — width proves nothing';
})()`;

const findings = [];
let control = "not run";
for (let i = 0; i < 40; i++) {                                  // bounded
  const rows = JSON.parse(await C.ev(SAMPLE));
  for (const r of rows) if (!findings.some(f => f.text === r.text)) findings.push(r);
  if (control === "not run" || control.startsWith("no ") || control.startsWith("apMsg")) control = await C.ev(CONTROL);
  // advance the game: tap whatever is asking
  await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn:not([disabled]), #actionPanel .btlBtn:not([disabled]), #flipCoinWrap.active')]
    .filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});
    if(b.length){b[Math.floor(Math.random()*b.length)].click();return true}return false})()`);
  await sleep(1100);
}

console.log("\n=== NARRATION LINE-BREAK GATE (solo, " + WIDTH + "x" + HEIGHT + ") ===");
console.log("  instrument check: " + control);
console.log("  parentheticals split across lines: " + findings.length);
for (const f of findings.slice(0, 12)) console.log("    • " + f.text.replace(/\n/g, " / "));
console.log("");

killAll();
process.exit(findings.length ? 1 : 0);
