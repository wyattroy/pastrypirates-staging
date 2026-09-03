/* Scratch: run npm test, report the exit code and the tail, without shell redirection. */
import { spawnSync } from "node:child_process";
const r = spawnSync("npm", ["test"], { cwd: process.cwd(), shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const out = (r.stdout || "") + (r.stderr || "");
console.log("EXITCODE =", r.status);
const lines = out.split("\n");
console.log("FAIL LINES:", lines.filter(l => /^\s*(FAIL|✖|not ok)/.test(l)).length);
console.log(lines.slice(-25).join("\n"));
