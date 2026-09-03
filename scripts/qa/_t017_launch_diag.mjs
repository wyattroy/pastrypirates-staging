/* SCRATCH — delete when T-017 lands. Why did headless Chrome not come up on this Blade?
   `launch()` spawns with stdio:"ignore", so its failure is silent; this re-spawns the SAME argv
   with the pipes open and prints whatever Chrome says. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { CHROME, LINUX_ARGS } from "../lib/chrome.mjs";

console.log("CHROME =", CHROME);
console.log("exists =", fs.existsSync(CHROME));

const profile = process.argv[2] || "/tmp/chrome-t017diag";
fs.rmSync(profile, { recursive: true, force: true });
const args = [...LINUX_ARGS, "--headless=new", "--mute-audio", "--disable-gpu",
  "--remote-debugging-port=9437", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1200,950", "about:blank"];
console.log("argv  =", args.join(" "), "\n");

const p = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
p.stdout.on("data", d => process.stdout.write("OUT " + d));
p.stderr.on("data", d => process.stdout.write("ERR " + d));
p.on("error", e => console.log("SPAWN ERROR:", e.message));

for (let i = 0; i < 24; i++) {                       // bounded, rule 17
  await new Promise(r => setTimeout(r, 500));
  try {
    const j = await (await fetch("http://127.0.0.1:9437/json/version")).json();
    console.log("\nUP after", (i + 1) * 500, "ms —", j.Browser);
    break;
  } catch { /* not up yet */ }
}
p.kill("SIGKILL");
console.log("killed.");
