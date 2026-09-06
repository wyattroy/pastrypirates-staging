import fs from "fs";
import { section, chunk, DECLARED, stateOf, titleOf } from "./lib/chart_model.mjs";

const text = fs.readFileSync(".planning/CHART.md", "utf8");
const inboxText = section(text, "THE IDEA INBOX") ?? "";
const chunks = chunk(inboxText, "inbox").filter(c => c.type === "row");

let multiArrow = 0;
for (const c of chunks) {
  const body = c.lines.join("\n");
  const matches = [...body.matchAll(/(?:→|->)\s*\*\*/g)];
  if (matches.length >= 2) {
    multiArrow++;
    const first = DECLARED.exec(body);
    console.log("---");
    console.log("title:", titleOf(c.lines).slice(0, 90));
    console.log("arrow count:", matches.length, "stateOf:", stateOf(body));
    console.log("first declared text:", first ? first[1].slice(0, 100) : null);
  }
}
console.log("TOTAL chunks with 2+ arrow markers:", multiArrow, "of", chunks.length);
