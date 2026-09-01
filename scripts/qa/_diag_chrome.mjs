import { execFileSync } from "node:child_process";
try {
  const out = execFileSync("powershell", [
    "-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='python.exe'\" | " +
      "ForEach-Object { $_.ProcessId.ToString() + '|' + $_.Name }",
  ], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  console.log(out || "(no chrome.exe or python.exe processes)");
} catch (e) {
  console.log("ERR", e.message);
}
