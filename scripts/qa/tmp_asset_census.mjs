// Scratch census of assets/ — what is left to shrink, by family and by format.
// Not a gate; delete when the compression item closes.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "assets");
const rows = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else rows.push([fs.statSync(f).size, path.relative(process.cwd(), f).replace(/\\/g, "/")]);
  }
})(root);
rows.sort((a, b) => b[0] - a[0]);
const total = rows.reduce((s, r) => s + r[0], 0);
console.log(`total ${(total / 1048576).toFixed(2)} MB in ${rows.length} files\n`);
for (const r of rows.slice(0, 30)) console.log(`${(r[0] / 1024).toFixed(0).padStart(7)} KB  ${r[1]}`);
const byExt = {};
for (const r of rows) {
  const e = path.extname(r[1]).toLowerCase();
  byExt[e] = byExt[e] || { n: 0, b: 0 };
  byExt[e].n++;
  byExt[e].b += r[0];
}
console.log(
  "\nby format: " +
    Object.entries(byExt)
      .sort((a, b) => b[1].b - a[1].b)
      .map(([k, v]) => `${k} ${v.n} files ${(v.b / 1048576).toFixed(2)}MB`)
      .join("   ")
);
const byDir = {};
for (const r of rows) {
  const d = path.dirname(r[1]);
  byDir[d] = (byDir[d] || 0) + r[0];
}
console.log(
  "\nby folder: " +
    Object.entries(byDir)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${(v / 1048576).toFixed(2)}MB`)
      .join("   ")
);
