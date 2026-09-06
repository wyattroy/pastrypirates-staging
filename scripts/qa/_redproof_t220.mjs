import { spawnSync } from "node:child_process";
const r = spawnSync("node", ["scripts/sea_trial.mjs", "--gear=COSMETIC", "--reason=T-220 red/green proof"], { encoding: "utf8" });
console.log((r.stdout || "").split("\n").filter(l => l.includes("NOTHING SAILED") || l.includes("PASSED") || l.includes("FAILED")).join("\n"));
console.log("EXIT:" + r.status);
