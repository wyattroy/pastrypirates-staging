/* IS EVERY RECIPE CARD HIS CARD, DRAWN SMALLER? Wyatt, 2026-09-10: "I don't care about the objective
   absolute sizes. I just care about the ratios." So the pass/fail here is not a pixel count — it is
   measured / (his number x k), where k = the card's actual width / the width he tuned it at. Every
   ratio should read 1.00 at every size, whatever width the layout could give.
   Then the swap: the pair is forced to contain the one name that wraps on his phone & tablet card,
   and the stack's height must not change when the cards trade places. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8690+(process.pid%25), DBG=9290+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-ratio-${process.pid}`));
const C=await attach(DBG);
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
// his tuner numbers, 2026-09-10
const HIS = { phone:{ref:360,pad:14,img:205,icon:60}, desktop:{ref:400,pad:23,img:298,icon:57},
              all:{aspect:2.31,gapImg:11,gapTitle:6,inset:38,peek:0.145,title:16.6} };  // title: his 19.5 in the tuner's Zilla Slab = 16.6 in the game's Georgia (his Q3, 2026-09-11)
// ⚠ peek 0.145 IS his 18%: the tuner slid the back card 18% and its .965 scale took 3.5% back, so
//   the sliver he saw — and the one this measures — is 14.5% of the card.
const M=`JSON.stringify((()=>{
  const row=document.querySelector('#actionPanel .apBtns');
  const cards=[...document.querySelectorAll('#actionPanel .apBtn')].filter(b=>b.querySelector('.recipeList'));
  const front=cards.find(c=>c.dataset.rcpos==='front'), back=cards.find(c=>c.dataset.rcpos==='back');
  if(!front||!back) return null;
  const cs=getComputedStyle(row), R=e=>e.getBoundingClientRect();
  const th=front.querySelector('.recipeThumb'), ic=front.querySelector('.recipeIcons'), ti=front.querySelector('.recipeTitle');
  const img=front.querySelector('.recipeIcons .ri img');
  const f=R(front), b=R(back), thr=R(th), icr=R(ic), tir=R(ti);
  const icPadL=parseFloat(getComputedStyle(ic).paddingLeft)||0, bL=parseFloat(getComputedStyle(front).borderLeftWidth)||0;
  const nm=ti.querySelector('.rtName'), nmr=nm?R(nm):tir;
  return { wn:parseFloat(row.style.getPropertyValue('--rcWn'))||parseFloat(cs.getPropertyValue('--rcWn')),
    ref:parseFloat(cs.getPropertyValue('--rcRef')), ghost:ti.dataset.ghost||'',
    cardW:front.offsetWidth, cardH:front.offsetHeight, backH:back.offsetHeight, rowH:row.offsetHeight,
    border:bL, pad:parseFloat(getComputedStyle(front).paddingLeft), title:parseFloat(getComputedStyle(ti).fontSize),
    imgW:th.offsetWidth, aspect:th.offsetWidth/th.offsetHeight,
    /* when the PARTNER's name is the longer one, this name sits centred in a two-line box (the
       ghost reserves it) — so the gap is measured from the box's bottom, found from where the name
       actually is plus half the spare room, not from the name's own bottom */
    gapImg:tir.top-thr.bottom,
    gapTitle:(tir.bottom-3)-(nmr.bottom+((ti.clientHeight-parseFloat(getComputedStyle(ti).paddingBottom))-nmr.height)/2),
    cellLines: Math.round((ti.clientHeight-parseFloat(getComputedStyle(ti).paddingBottom))/(parseFloat(getComputedStyle(ti).fontSize)*1.2)),
    inset:(icr.left+icPadL)-(f.left+bL), icon:img?img.offsetWidth:0,
    peek:(b.right-f.right)/front.offsetWidth,
    frontTitle:nm?nm.textContent:ti.textContent, titleText:ti.textContent,
    frontTitleH:ti.offsetHeight, backTitleH:back.querySelector('.recipeTitle').offsetHeight,
    nameLines: Math.round(nmr.height/(parseFloat(getComputedStyle(ti).fontSize)*1.2)) };
})())`;
const SIZES=[{w:390,h:844,m:1},{w:768,h:1024,m:1},{w:1280,h:800},{w:1440,h:900},{w:1920,h:1080}];
const fmt=(x)=>x==null||!isFinite(x)?'  -- ':x.toFixed(2);
let bad=0;
try{
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(1600);
  for(const s of SIZES){
    await C.send("Emulation.setDeviceMetricsOverride",{width:s.w,height:s.h,deviceScaleFactor:1,mobile:!!s.m});
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2300);
    await waitFor(`!!document.getElementById('choiceSolo')`);
    await C.ev(`document.getElementById('choiceSolo').click()`);
    await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
    await C.ev(`document.getElementById('btnNameConfirm').click()`);
    await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/nah/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(800);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
    await waitFor(`!!document.querySelector('#actionPanel .apBtn[data-rcpos="back"] .recipeList')`);
    await waitFor(`(()=>{const b=document.getElementById('pp4Prompt');return !!b&&b.getAnimations().length>0})()`).catch(()=>{});
    await waitFor(`(()=>{const b=document.getElementById('pp4Prompt');return !!b&&b.getAnimations().length===0})()`).catch(()=>{});
    await sleep(900);
    const m=JSON.parse(await C.ev(M));
    if(!m){ console.log(`${s.w}x${s.h}: (no stack)`); bad++; continue; }
    const band = m.ref===400 ? HIS.desktop : HIS.phone, k = m.wn / band.ref, A=HIS.all;
    const r = { pad:m.pad/(band.pad*k), title:m.title/(A.title*k), img:m.imgW/(band.img*k), aspect:m.aspect/A.aspect,
      gapTitle:m.gapTitle/(A.gapTitle*k), gapImg:m.gapImg/(A.gapImg*k), inset:m.inset/(A.inset*k), peek:m.peek/A.peek };
    const off = Object.entries(r).filter(([,v])=>!(Math.abs(v-1)<=0.06));
    if(off.length) bad++;
    console.log(`\n${s.w}x${s.h}  card ${m.cardW}px of his ${band.ref} -> k=${k.toFixed(3)}  (front title reserves its partner: "${m.ghost}")`);
    console.log('  measured / (his number x k):  ' + Object.entries(r).map(([n,v])=>`${n} ${fmt(v)}`).join('  ') + (off.length?`   ✗ OFF: ${off.map(o=>o[0]).join(',')}`:'   ✓ all within 6%'));
    // HIS CARD'S HEIGHT, from the tuner's own layout at his reference width, scaled by k. The rule
    // (3px here, 1px there) and the card border are drawn in fixed pixels in both, so they are added back.
    const colW=(band.ref-2*A.inset-4*5)/5, iconPx=Math.min(band.icon,colW);
    const tunerH = 2*band.pad + band.img/A.aspect + A.gapImg + 1.2*A.title*m.cellLines + A.gapTitle + 6 + iconPx + 2;
    const expH = tunerH*k + 2*m.border + 3;
    console.log(`  card height ${m.cardH}px; his tuner card at this scale ${expH.toFixed(1)}px  ${Math.abs(m.cardH-expH)<=3?'✓':'✗ differs by '+(m.cardH-expH).toFixed(1)}`
      + `   (name "${m.frontTitle}", ${m.nameLines} line in a ${m.cellLines}-line box; textContent unchanged: ${m.titleText===m.frontTitle?'✓':'✗ '+m.titleText})`);
    if(Math.abs(m.cardH-expH)>3) bad++;
    try{ const shot=await C.send("Page.captureScreenshot",{format:"png"}); (await import("node:fs")).writeFileSync(path.join(process.env.SHOTS||(await import("node:os")).tmpdir(),`ratio-${s.w}x${s.h}.png`), Buffer.from(shot.result.data,"base64")); }catch{}
    // THE SWAP: force the long name into the pair    // THE SWAP: force the long name into the pair, then trade places and compare the stack's height
    /* a real deal of this pair, posed: the back card's name AND the front card's ghost of it */
    await C.ev(`(()=>{const L='Chocolate Genoise Sponge Cake';
      const b=document.querySelector('#actionPanel .apBtn[data-rcpos="back"] .recipeTitle');
      const f=document.querySelector('#actionPanel .apBtn[data-rcpos="front"] .recipeTitle');
      b.querySelector('.rtName').textContent=L; f.dataset.ghost=L;
      b.dataset.ghost=f.querySelector('.rtName').textContent;})()`);
    await sleep(500);
    const a=JSON.parse(await C.ev(M));
    await C.ev(`document.querySelector('.pp4RcSwap')&&document.querySelector('.pp4RcSwap').click()`);
    await sleep(1800);
    const z=JSON.parse(await C.ev(M));
    /* the same ratios on BOTH sides of the posed swap. Renaming a card re-mounts the stack (its key
       is the pair's names), so which card leads is the stack's choice — measuring before AND after
       the swap is what guarantees one of the two has the SHORT name in the long partner's box */
    for (const [when,q] of [['before the swap',a],['after the swap',z]]) {
      if(!q) continue;
      const kk=q.wn/band.ref, off2=[['pad',q.pad/(band.pad*kk)],['gapTitle',q.gapTitle/(A.gapTitle*kk)],['gapImg',q.gapImg/(A.gapImg*kk)],['title',q.title/(A.title*kk)]]
        .filter(([,v])=>!(Math.abs(v-1)<=0.06));
      const cH=2*band.pad+band.img/A.aspect+A.gapImg+1.2*A.title*q.cellLines+A.gapTitle+6+Math.min(band.icon,(band.ref-2*A.inset-20)/5)+2, eH=cH*kk+2*q.border+3;
      if(off2.length||Math.abs(q.cardH-eH)>3) bad++;
      console.log(`  ${when}: front "${q.frontTitle}" (${q.nameLines} line) in a ${q.cellLines}-line box, partner "${q.ghost}" — ${off2.length?'✗ OFF: '+off2.map(o=>o[0]).join(','):'ratios ✓'}, height ${q.cardH} vs ${eH.toFixed(1)} ${Math.abs(q.cardH-eH)<=3?'✓':'✗'}`);
    }
    const jump = z&&a ? z.rowH-a.rowH : null;
    if(jump===null || Math.abs(jump)>1 || a.frontTitleH!==a.backTitleH) bad++;
    console.log(`  swap with "Chocolate Genoise Sponge Cake" in the pair: titles ${a.frontTitleH}/${a.backTitleH}px; `
      + `stack ${a.rowH}px -> ${z?z.rowH:'?'}px after the swap (front now "${z?z.frontTitle:'?'}")  ${jump!==null&&Math.abs(jump)<=1&&a.frontTitleH===a.backTitleH?'✓ no jump':'✗ JUMPS '+jump+'px'}`);
  }
  console.log(bad? `\nFAIL — ${bad} size(s) off` : `\nPASS — his proportions at every size, and no swap jump`);
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); } finally { await killAll(); }
