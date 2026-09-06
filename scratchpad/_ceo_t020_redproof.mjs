// Temporary CEO red-proof script for T-020. Not part of the suite. Deleted after use.
import { execSync } from "node:child_process";

const src = execSync("git show 047fbe80^:scripts/playtest_gate.mjs", { cwd: process.cwd(), encoding: "utf8" });

const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("RED-PROOF: running crew_phone_guest_emulation_check's logic against the PARENT commit's (pre-fix) playtest_gate.mjs\n");

const legSrc = (src.match(/const legDefs = \{[\s\S]*?\n\};/) || [])[0];
if (!legSrc) { check("playtest_gate.mjs defines legDefs", false, "not found"); process.exit(1); }
const legDefs = new Function(`${legSrc}\nreturn legDefs;`)();

const mobileCrewLegs = Object.entries(legDefs)
  .filter(([name, def]) => name.startsWith("crew-") && def.mobile && def.guestW);
check("at least one mobile crew leg exists to guard (else this check guards nothing)",
  mobileCrewLegs.length > 0, `found: ${mobileCrewLegs.map(([n]) => n).join(", ") || "none"}`);

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

console.log(failures.length ? `\nEXPECTED-FAIL — ${failures.length} failure(s) on the pre-fix file` : "\nUNEXPECTED PASS — check would not have caught the bug");
