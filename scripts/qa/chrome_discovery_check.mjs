// GATE: scripts/lib/chrome.mjs MUST FIND CHROME ON WINDOWS.
//
// `command -v` is bash's builtin -- it does not exist as a Windows executable, and this repo's
// Windows shell is not bash. Every non-Windows branch in chrome.mjs was therefore a guaranteed
// miss on the Razer, and the FATAL fallback fired even though Chrome was installed and every
// other browser gate found it fine. Found running the exact command a clean playtest leg needs,
// 2026-08-31.
//
// This gate does not fake Windows on a Mac or in the cloud container -- it runs the real module
// on whatever platform it is on, and on Windows requires a real, existing Chrome path to come
// back. SKIPS, loudly, off Windows.

import { existsSync } from "node:fs";

if (process.platform !== "win32") {
  console.log("SKIP chrome_discovery_check -- not Windows; this checks the Windows-only discovery path.");
  console.log("     This is a SKIP, not a pass. Nothing about Windows Chrome discovery was verified here.");
  process.exit(0);
}

let CHROME;
try {
  ({ CHROME } = await import("../lib/chrome.mjs"));
} catch (e) {
  console.error(`FAIL -- importing scripts/lib/chrome.mjs threw: ${e.message}`);
  process.exit(1);
}

let failed = false;
if (!CHROME || typeof CHROME !== "string") {
  console.error(`FAIL -- CHROME resolved to ${JSON.stringify(CHROME)}, not a path.`);
  failed = true;
} else if (!existsSync(CHROME)) {
  console.error(`FAIL -- CHROME resolved to "${CHROME}", which does not exist on disk.`);
  failed = true;
} else {
  console.log(`OK -- CHROME resolves to a real path: ${CHROME}`);
}

process.exit(failed ? 1 : 0);
