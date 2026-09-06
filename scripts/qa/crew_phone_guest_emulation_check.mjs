#!/usr/bin/env node
/* crew_phone_guest_emulation_check.mjs — a mobile crew leg's GUEST must actually be a phone too.
 *
 * T-020. `playtest_gate.mjs`'s "crew-phone" leg def is `{ mobile:true, dsf:2, guestW:390,
 * guestH:664, ... }` — both seats phone-sized, "because a crew game between two phones is what
 * he and a friend play" (the def's own comment). The HOST's openEngine() call passes
 * `mobile: !!def.mobile, dsf: def.dsf || 1`; the GUEST's call passed neither, so
 * `scripts/lib/cdp.mjs:47`'s defaults (`mobile = false, dsf = 1`) turned the guest into a plain
 * desktop window. Proven in the pictures, not only the source: `crew-phone-host-012-settled.png`
 * reads "Tap and hold the sea", `crew-phone-guest-012-settled.png`, same run, reads "Click and
 * hold" — `src/ui/stage.js`'s `matchMedia("(pointer: coarse)")` verb, deriving from the DEVICE.
 * So every crew-phone finding this project has ever produced was measured on a guest that was
 * never actually a phone.
 *
 * This derives the answer from the real legDefs object and the real guest openEngine() call site
 * (lifted out of the real file, not reimplemented) rather than asserting a fixed string, so a
 * future crew leg that adds `mobile:true` (a crew-tablet, say) is covered automatically — rule 9.
 *
 * QA TOOLING, NOT GAME CODE — gear NONE. This file and playtest_gate.mjs live under scripts/,
 * are never shipped, and touch nothing a player's browser loads (same class as the cdp.mjs
 * timeout fix CEO 197 approved without a sea trial).
 */
"use strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const src = readFileSync(join(ROOT, "scripts", "playtest_gate.mjs"), "utf8");

const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("crew_phone_guest_emulation_check — a mobile crew leg's guest must be a phone too\n");

// Lift the REAL legDefs object out of the REAL gate and evaluate it — not a reimplementation.
const legSrc = (src.match(/const legDefs = \{[\s\S]*?\n\};/) || [])[0];
if (!legSrc) {
  check("playtest_gate.mjs defines legDefs", false, "not found");
  console.error(`\nFAIL — ${failures.length} failure(s)`); process.exit(1);
}
const legDefs = new Function(`${legSrc}\nreturn legDefs;`)();

const mobileCrewLegs = Object.entries(legDefs)
  .filter(([name, def]) => name.startsWith("crew-") && def.mobile && def.guestW);
check("at least one mobile crew leg exists to guard (else this check guards nothing)",
  mobileCrewLegs.length > 0, `found: ${mobileCrewLegs.map(([n]) => n).join(", ") || "none"}`);

// Lift the real guest openEngine() call site's source text.
const guestCallSrc = (src.match(/guest = await openEngine\(def, \{.*\}\);/) || [])[0];
check("playtest_gate.mjs's guest openEngine() call site is findable", !!guestCallSrc);

if (guestCallSrc) {
  for (const [name] of mobileCrewLegs) {
    check(`"${name}"'s guest launch passes mobile: !!def.mobile (matching the host call)`,
      /mobile:\s*!!def\.mobile/.test(guestCallSrc),
      "guest openEngine() call omits mobile — cdp.mjs defaults it to false, so the guest is a desktop window, not a phone");
    check(`"${name}"'s guest launch passes dsf: def.dsf || 1 (matching the host call)`,
      /dsf:\s*def\.dsf\s*\|\|\s*1/.test(guestCallSrc),
      "guest openEngine() call omits dsf — cdp.mjs defaults it to 1, losing the 2x device pixel ratio a real phone has");
  }
}

if (failures.length) { console.error(`\nFAIL — ${failures.length} failure(s)`); process.exit(1); }
console.log("\nPASS — every mobile crew leg's guest actually emulates the phone its def claims");
process.exit(0);
