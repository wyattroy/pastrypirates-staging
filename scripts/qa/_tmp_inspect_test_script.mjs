import fs from "node:fs";
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
const t = p.scripts.test;
const idx = t.indexOf("leg_cache_tree_hash_check.mjs");
console.log(JSON.stringify(t.slice(Math.max(0, idx - 150), idx + 250)));
console.log("TOTAL LEN:", t.length);
console.log("TAIL:", JSON.stringify(t.slice(-200)));
console.log("GATE COUNT:", (t.match(/node scripts/g) || []).length);
