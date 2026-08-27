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

// pull the label expression actually passed to coinSlider in buildOffer's step 2
const m=s.match(/const n=await coinSlider\(p\.idx,\s*\n\s*(k=>[^\n]*?),\s*\n\s*minC,minC,maxC,"Offer it!"\);/);
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
