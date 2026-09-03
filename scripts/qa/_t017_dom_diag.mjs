/* SCRATCH — delete when T-017 lands. Is the posed petal actually governed by
   `#pp4Prompt.radial .apBtn`? The first cut of the fit check measured a 116px disc at 15px type
   when that rule says 66px at 9.5px, and "Crustbeard" came out FITTING — contradicting Wyatt's own
   screenshot of it clipped. So the instrument is measuring the wrong box. This asks why. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8534, DBG = 9436;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-t017dom");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

await C.ev(`location.href=${JSON.stringify(url)}`); await sleep(2500);
await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`); await sleep(2500);
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);
await sleep(2500);

console.log(await C.ev(`(()=>{
  const p=document.getElementById('pp4Prompt'), ap=document.getElementById('actionPanel');
  const o={hasPrompt:!!p, hasPanel:!!ap};
  if(!p||!ap) return JSON.stringify(o);
  o.panelInsidePrompt = p.contains(ap);
  o.panelParentChain = (()=>{const c=[];let n=ap;while(n&&n!==document.body){c.push(n.id?('#'+n.id):n.tagName+'.'+[...n.classList].join('.'));n=n.parentElement;}return c;})();
  p.classList.add('radial');
  p.style.display='block'; p.style.opacity='1';
  let row=ap.querySelector('.apBtns');
  if(!row){row=document.createElement('div');row.className='apBtns';ap.appendChild(row);}
  row.innerHTML='';
  const b=document.createElement('button'); b.className='apBtn';
  b.innerHTML='<b style="color:#c33">Crustbeard</b><br><img src="assets/ingredients/sugar.png">+3🌕';
  row.appendChild(b);
  const cs=getComputedStyle(b);
  o.promptClasses=[...p.classList];
  o.btn={w:cs.width,h:cs.height,font:cs.fontSize,pad:cs.padding,radius:cs.borderRadius,
         display:cs.display,flexDir:cs.flexDirection,rect:b.getBoundingClientRect().width};
  o.matchedRadialRule = [...document.styleSheets].some(ss=>{
    try{return [...ss.cssRules].some(function walk(r){
      if(r.cssRules) return [...r.cssRules].some(walk);
      return r.selectorText && r.selectorText.includes('#pp4Prompt.radial .apBtn');
    });}catch(e){return false}});
  o.btnMatchesSelector = b.matches('#pp4Prompt.radial .apBtn');
  return JSON.stringify(o,null,2);})()`));

killAll();
