import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
console.log("Parsed _ceiling_raise_142 winner (first 100 chars):");
console.log(pkg.gates._ceiling_raise_142.slice(0, 100));
