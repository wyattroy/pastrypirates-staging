/* W2-9 — the coin question must know what is on the table.
   Wyatt: "'Would ye offer any coin on top?' is context-blind. If coin is the ONLY thing being
   offered it makes no sense — should read 'How many coins?'"
   Reads the real source and evaluates the real label closure, so it cannot pass on a comment. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// derived, never typed — same reason as w21_weather_line_check.mjs
const SRC = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "src/ui/flow.js");
const s=fs.readFileSync(SRC,"utf8");

/* Pull the label expression actually passed to coinSlider in buildOffer's step 2.
   THE TAIL IS NOT PINNED ANY MORE. It used to require the call to end exactly
   `minC,minC,maxC,"Offer it!");`, and W6-1 added two arguments after that — a decline label for an
   empty purse — so this assertion failed a correct tree and reported itself "pointed at the wrong
   place". It was right to fire: it watches this call and the call changed. But an assertion that
   breaks whenever an unrelated argument is APPENDED is watching the shape of the line rather than
   the thing it cares about, which is the LABEL CLOSURE. So it now anchors on what it is actually
   about and lets the argument list grow. */
/* THE SEAT COMES FROM WHATEVER THE FUNCTION CALLS ITS PLAYER — `\w+\.idx`, not `p.idx`.
   This was pinned to the literal name `p` and went red on 2026-08-31 when that parameter was
   renamed to `player` at Wyatt's request ("why are both players and prompts called p? it's
   unnecessarily lazy code"). Nothing about the coin question changed. A gate that depends on a
   LOCAL VARIABLE'S NAME is asserting about spelling rather than behaviour, and it blocks exactly
   the readability work it should be indifferent to. */
const m=s.match(/const n=await coinSlider\(\w+\.idx,\s*\n\s*(k=>[^\n]*?),\s*\n\s*minC,minC,maxC,"Offer it!"[^;]*\);/);
let fails=0; const ok=m=>console.log("  PASS  "+m); const bad=m=>{fails++;console.log("  FAIL  "+m);};
if(!m){ bad("could not find the coinSlider label in buildOffer — check is pointed at the wrong place"); }
else{
  const expr=m[1];
  console.log("  label expression: "+expr.trim());
  // evaluate it for both worlds
  for(const [what,st,want] of [
     ["coins ONLY (baseIng null)", {baseIng:null},  "How many coins?"],
     ["an ingredient PLUS coin",   {baseIng:"cocoa"},"Would ye offer any coin on top?"]]){
    let got;
    try{ got=new Function("st",`return (${expr})(0)`)(st); }catch(e){ got="THREW: "+e.message; }
    got===want ? ok(`${what.padEnd(28)} -> "${got}"`)
               : bad(`${what.padEnd(28)} -> "${got}"   (expected "${want}")`);
  }
}
console.log(fails?`\nFAIL — ${fails}\n`:"\nPASS — the question knows what is on the table\n");
process.exit(fails?1:0);
