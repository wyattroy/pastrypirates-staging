import { readFileSync } from "node:fs";
const sec = readFileSync(".planning/CHART.md", "utf8").split(/^## BLOCKED ON WYATT$/m)[1]?.split(/^## /m)[0] ?? "";
const NL = /\r?\n/;
const rows = sec.split(NL).filter((l) => l.startsWith("|") && !/^\|\s*Question|^\|\s*-+/.test(l));
console.log("rows:", rows.length);
for (const l of rows) {
  const cells = l.split("|");
  const c = cells.slice(1, cells.length - 1).map((x) => x.trim());
  console.log("cellcount", c.length, "| since=", JSON.stringify(c[2] ?? null), "| head=", c[0].slice(0, 60));
}
