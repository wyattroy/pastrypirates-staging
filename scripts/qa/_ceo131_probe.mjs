// CEO 131 read-only probe. Copies the LIVE CHART.md to a temp dir and asks two questions:
//   A. does the sequence a drag on his real page would save survive `chartkeeper --order=`?
//   B. once an order IS applied, does the Glass page he next reads actually move?
// Writes nothing into the repo except this file. Safe to delete.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const R = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), "..", "..");
const CK = path.join(R, "scripts/wyclau/chartkeeper.mjs");
const GL = path.join(R, "scripts/wyclau/glass.mjs");
const d = fs.mkdtempSync(path.join(os.tmpdir(), "ceo131-"));
const chart = path.join(d, "CHART.md");
fs.copyFileSync(path.join(R, ".planning/CHART.md"), chart);

const render = (tag) => {
  const out = path.join(d, tag + ".html");
  execFileSync(process.execPath, [GL, "--chart=" + chart, "--out=" + out], { cwd: R, stdio: "ignore" });
  const card = fs.readFileSync(out, "utf8").split("<h2>The Chart (Tasks To Do)")[1].split("</section>")[0];
  return [...card.matchAll(/data-handle="(T-\d+)"/g)].map((m) => m[1]);
};
const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [CK, "--chart=" + chart, ...args], { cwd: R, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
};

const seq = render("before");
console.log("=== A. the whole sequence, exactly as the page would save it ===");
const a = run(["--order=" + seq.join(",")]);
console.log("exit", a.code);
console.log(a.out.trim().split("\n").slice(0, 6).join("\n"));

console.log("\n=== B. a clean 4-handle order, then what the page shows ===");
const clean = seq.filter((h, i) => seq.indexOf(h) === i && seq.lastIndexOf(h) === i);
const want = [clean[3], clean[0], clean[1], clean[2]];
const b = run(["--order=" + want.join(",")]);
console.log("exit", b.code, "|", b.out.trim().split("\n")[0]);
const after = render("after");
console.log("he dragged to      :", want.join(","));
console.log("page after --order= :", after.slice(0, 4).join(","));
console.log("PAGE MOVED?", after.slice(0, 4).join(",") === want.join(",") ? "YES" : "NO");
const c = run(["--rank", "--write"]);
const after2 = render("after2");
console.log("page after --rank --write:", after2.slice(0, 4).join(","), "| MOVED?", after2.slice(0, 4).join(",") === want.join(",") ? "YES" : "NO");
console.log("tmp:", d);
