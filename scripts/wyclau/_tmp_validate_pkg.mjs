import fs from "node:fs";
JSON.parse(fs.readFileSync("package.json", "utf8"));
console.log("valid json");
