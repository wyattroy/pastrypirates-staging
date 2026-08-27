/* T-16 + T-18 together, because they live on the SAME screen — the lots ceremony, which only runs
 * in pass-and-play and crew. A solo probe cannot see either, which is why the first pass reported
 * a clean zero.
 *
 * T-16 (Wyatt): "no orange glow on start button."   Screenshot 3, build 2026-08-25g.
 * T-18 (Wyatt): "keeps parentheses with their clauses... broken across the game (eg here, where
 *                the parenthesis after 'Dough Hook (+2🌕)')."
 *
 * WHY BOTH ARE MEASURABLE HERE: netIntroBarrier() builds this card through localAsk() with
 * cls:"primary ahoyGlow", and .ahoyGlow IS in the shipped glow rule. So the class is applied and
 * the glow is still absent — which means something MORE SPECIFIC is winning the `animation`
 * property. This reads the computed value rather than guessing which selector won.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8501, DBG = 9359;
const WIDTH = Number(process.env.QA_WIDTH || 390), HEIGHT = Number(process.env.QA_HEIGHT || 844);
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-ceremony");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });

await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','pp-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);

await C.waitFor(`(()=>{const e=document.getElementById('choicePassPlay');return !!(e&&e.offsetParent)})()`, 25000, "Pass & Play");
await C.ev(`document.getElementById('choicePassPlay').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';document.getElementById('btnNameConfirm').click();true`);
  await sleep(1000);
}
await C.waitFor(`(()=>{const b=document.getElementById('btnStartPassPlay');return !!(b&&b.offsetParent)})()`, 20000, "pass&play step");
await C.ev(`['Davy Probe','Dough Hook','Flaky Jack','Crustbeard'].forEach((n,i)=>{const e=document.getElementById('ppName'+i);if(e)e.value=n;});
            document.getElementById('btnStartPassPlay').click();true`);

/* THE CEREMONY CARD — read the computed animation on the stage button, and every parenthetical.
   Sampled repeatedly because the ahoy barrier comes first and the lots card follows it. */
const READ = `JSON.stringify((()=>{
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const msg=[...document.querySelectorAll('.apMsg')].find(vis);
  const btns=[...document.querySelectorAll('#actionPanel .apBtn')].filter(vis);
  const prompt=document.getElementById('pp4Prompt');
  const panel=document.getElementById('actionPanel');
  const paren=(()=>{
    if(!msg) return null;
    const nodes=[];const w=document.createTreeWalker(msg,NodeFilter.SHOW_TEXT);
    let n;while(n=w.nextNode())if(n.nodeValue)nodes.push(n);
    const topOf=(nd,o)=>{const rg=document.createRange();rg.setStart(nd,o);rg.setEnd(nd,Math.min(o+1,nd.nodeValue.length));
      const r=rg.getBoundingClientRect();return r.height?r.top:null;};
    let open=null,splits=0,pairs=0;
    for(const nd of nodes){const s=nd.nodeValue;
      for(let i=0;i<s.length;i++){
        if(s[i]==='(')open={nd,i,top:topOf(nd,i)};
        else if(s[i]===')'&&open){pairs++;const ct=topOf(nd,i);
          if(open.top!==null&&ct!==null&&Math.abs(ct-open.top)>2)splits++;open=null;}}}
    return {pairs,splits};
  })();
  return {
    text: msg ? (msg.innerText||'').slice(0,120) : null,
    promptClasses: prompt?prompt.className:null,
    panelClasses: panel?panel.className:null,
    buttons: btns.map(b=>({
      label:(b.innerText||'').trim().slice(0,24),
      cls:b.className,
      animation:getComputedStyle(b).animationName,
    })),
    paren,
  };
})())`;

let ceremony = null, seen = [], blankFrames = 0, framesWithBox = 0;
for (let i = 0; i < 260; i++) {                                  // bounded, sampled fast
  const s = JSON.parse(await C.ev(READ));
  const txt = (s.text || "").trim();
  if (s.text !== null) {
    framesWithBox++;
    /* T-15: "the stages have a brief (half second or so) pause where their narration boxes are
       completely blank white". A BLANK BOX IS NOT A SCREEN TO CLICK THROUGH — the first version of
       this probe clicked one and skipped the very card it was hunting. Wait instead, and count. */
    if (!txt) { blankFrames++; await sleep(150); continue; }
    if (!seen.some(x => (x.text || "").trim() === txt)) seen.push(s);
    /* MATCH ON THE BUTTON, NOT THE SENTENCE. The message types in one character at a time, so a
       regex over the full sentence only matches after the reveal finishes — the previous version
       sampled "T" and clicked the card away. The Start button exists from the first frame, and the
       text is only trusted once it has stopped growing. */
    const isCeremony = s.buttons.some(b => /start/i.test(b.label));
    if (isCeremony) {
      let last = "", stable = 0;
      for (let k = 0; k < 60 && stable < 3; k++) {               // bounded: wait for the reveal
        const t = JSON.parse(await C.ev(READ));
        const cur = (t.text || "").trim();
        if (cur && cur === last) stable++; else stable = 0;
        last = cur; ceremony = t;
        await sleep(200);
      }
      break;
    }
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1});
      if(b.length){b[0].click();return true}return false})()`);
    await sleep(700);
    continue;
  }
  await sleep(150);
}
console.log(`\n  T-15 probe: ${blankFrames} of ${framesWithBox} frames had a narration box on screen with NO text in it.`);

console.log("\n=== T-16 / T-18 — the lots ceremony (" + WIDTH + "x" + HEIGHT + ") ===");
if (!ceremony) {
  console.log("  NOT REACHED. Screens seen:");
  for (const s of seen) console.log("    • " + (s.text || "").replace(/\n/g, " / ").slice(0, 80));
} else {
  await C.shot("ceremony.png");
  console.log("  text: " + ceremony.text.replace(/\n/g, " / "));
  console.log("  #pp4Prompt class: " + ceremony.promptClasses);
  console.log("  #actionPanel class: " + ceremony.panelClasses);
  console.log("  T-16 — buttons and the animation actually computed:");
  for (const b of ceremony.buttons)
    console.log(`    "${b.label}"  cls=[${b.cls}]  animation-name=${b.animation}`);
  const start = ceremony.buttons.find(b => /start/i.test(b.label));
  console.log("  T-16 VERDICT: " + (!start ? "no Start button found"
    : start.animation === "pp4Glow" ? "GLOWING (pp4Glow) — does not reproduce here"
    : `REPRODUCED — Start runs '${start.animation}', not pp4Glow`));
  console.log(`  T-18 — parenthetical pairs: ${ceremony.paren?.pairs ?? 0}, split across lines: ${ceremony.paren?.splits ?? 0}`);
  console.log("  T-18 VERDICT: " + ((ceremony.paren?.splits ?? 0) > 0 ? "REPRODUCED" : "not reproduced at this width"));
}
console.log("");
killAll();
