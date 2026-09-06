import fs from "node:fs";
import { section, chunk, idOfRow, titleOf, DECLARED, stateOf } from "./lib/chart_model.mjs";

const text = fs.readFileSync(".planning/CHART.md", "utf8");
const inboxText = section(text, "THE IDEA INBOX") ?? "";
const chunks = chunk(inboxText, "inbox").filter((c) => c.type === "row");
console.log("total inbox rows:", chunks.length);

const CHECK_RE = /✅\s*\*\*([^*]{0,200})/g;
for (const c of chunks) {
  const body = c.lines.join("\n");
  const id = idOfRow(c.lines) ?? "(none)";
  const st = stateOf(body);
  let m;
  CHECK_RE.lastIndex = 0;
  const hits = [];
  while ((m = CHECK_RE.exec(body))) hits.push(m[1].slice(0, 90));
  if (hits.length && st !== "finished") {
    console.log("---");
    console.log("id:", id, "| stateOf:", st, "| title:", titleOf(c.lines).slice(0, 70));
    for (const h of hits) console.log("   check-hit:", JSON.stringify(h));
  }
}
