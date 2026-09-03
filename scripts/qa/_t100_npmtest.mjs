/* Scratch (T-100): run npm test, report the exit code and the FAIL lines, without shell
   redirection — this machine's shell blocks both `>` and `2>&1 | grep` in one command. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const r = spawnSync("npm", ["test"], { cwd: REPO, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const out = (r.stdout || "") + (r.stderr || "");
const lines = out.split("\n");
const fails = lines.filter(l => /^\s*(FAIL|✖|not ok|npm ERR)/.test(l));
console.log("EXITCODE =", r.status);
console.log("FAIL LINES =", fails.length);
for (const f of fails.slice(0, 20)) console.log("  " + f.slice(0, 200));
console.log("---- last 20 ----");
console.log(lines.slice(-20).join("\n"));
