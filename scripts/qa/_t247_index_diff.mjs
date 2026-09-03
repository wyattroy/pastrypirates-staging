// T-247 — exactly which lines of index.html staging serves differently from this tree.
import { readFileSync } from "node:fs";

const r = await fetch("https://staging.playpastrypirates.com/index.html");
const a = (await r.text()).replace(/\r\n/g, "\n").split("\n");
const b = readFileSync("index.html", "utf8").replace(/\r\n/g, "\n").split("\n");

let n = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    n++;
    console.log(`line ${i + 1}`);
    console.log(`  staging: ${JSON.stringify(a[i])}`);
    console.log(`  local  : ${JSON.stringify(b[i])}`);
    if (n >= 20) { console.log("… stopping at 20"); break; }
  }
}
console.log("---");
console.log(`differing lines shown: ${n}   (staging ${a.length} lines, local ${b.length} lines)`);
