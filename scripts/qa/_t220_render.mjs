/* Did the new question actually reach the RENDERED page, with numbered buttons and a recommendation?
   Verified on the drawn HTML, not asserted from the Chart source. Scratch, not a gate. */
import fs from "node:fs";
const h = fs.readFileSync("scratchpad/t220-glass.html", "utf8");
const ids = [...h.matchAll(/class="ask"[^>]*data-id="([^"]+)"/g)].map(m => m[1]);
console.log(`  ask rows drawn on his Your Call card: ${ids.length}`);
ids.forEach(i => console.log(`     ${i}`));
const i = h.indexOf("t220-shallow-green");
console.log(`\n  the T-220 question is on the page: ${i >= 0}`);
if (i >= 0) {
  const seg = h.slice(i, i + 4000);
  const upTo = seg.slice(0, seg.indexOf('class="ask"', 10) > 0 ? seg.indexOf('class="ask"', 10) : 4000);
  const btns = [...upTo.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
  console.log(`  buttons rendered inside this question: ${btns.length}`);
  btns.forEach(o => console.log(`     ${o.slice(0, 110)}`));
  console.log(`  carries a (recommended) marker: ${/recTag|recommended/i.test(seg)}`);
}
