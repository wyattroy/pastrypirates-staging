import { execSync } from "node:child_process";

const chain = 'node -e "console.log(1)" && node -e "console.log(2); console.error(\'UNIQUE_MARKER_STEP2\'); process.exit(1)" && node -e "console.log(3)"';

try {
  execSync(chain, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: true });
  console.log("did not throw?!");
} catch (e) {
  const combined = (e.stdout || "") + (e.stderr || "");
  const tail = combined.trim().split("\n").slice(-3).join("\n");
  console.log("--- combined ---");
  console.log(JSON.stringify(combined));
  console.log("--- tail(3) [current sea_trial.mjs approach] ---");
  console.log(tail);
  console.log("--- does tail contain UNIQUE_MARKER_STEP2? ---", tail.includes("UNIQUE_MARKER_STEP2"));
}
