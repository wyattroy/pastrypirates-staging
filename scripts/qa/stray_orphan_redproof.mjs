/* RED-PROOF FOR THE ORPHAN DEFINITION — added 2026-09-10, the day it cost Wyatt his laptop.
 *
 * On 2026-09-10 stray_probe_check reported "22 debug-port browser(s) are up and EVERY ONE has a
 * live launcher — a probe in use, not a leak" while twenty-two abandoned headless Chromes were
 * pegging his CPU. His words: "COME ON MAN!!!! you were supposed to learn this the last time!"
 *
 * THE FAULT WAS ONE MISSING CASE. Every probe here spawns Chrome DETACHED so it survives the
 * shell; when the launcher exits the kernel re-parents the child to init, PID 1 — which is alive
 * by definition. The test was `is the parent in the process table?`, so an abandoned browser
 * answered YES and the gate called it supervised. The more completely a probe leaked, the more
 * certain this gate was that it had not.
 *
 * THIS FILE EXISTS BECAUSE A FIXTURE COULD NOT HAVE CAUGHT IT. stray_probe_check's `--fixture=`
 * seam supplies lines that are ALREADY classified, so it red-proofs the verdict branches and can
 * never touch the classification. The decision now lives in `isOrphan()` where a test can reach
 * it, and this is that test.
 */
import { isOrphan } from "../lib/stray_probes.mjs";

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  — got ${got}, want ${want}`}`);
  if (!ok) fails++;
};

console.log("stray_orphan_redproof — does the orphan test see a browser re-parented to init?");
const alive = new Set(["1", "500", "900"]);

// THE CASE THAT COST THE LAPTOP
check("ppid 1 (re-parented to init) is an ORPHAN", isOrphan("1", alive), true);
check("ppid 0 is an ORPHAN too", isOrphan("0", alive), true);
// the cases that already worked, kept so a fix cannot trade one for the other
check("a launcher that has exited is an ORPHAN", isOrphan("4242", alive), true);
check("a live launcher is NOT an orphan", isOrphan("900", alive), false);
check("numeric ppid is handled like a string", isOrphan(900, alive), false);
check("numeric 1 is handled like a string", isOrphan(1, alive), true);

console.log(fails ? `\n${fails} failure(s).` : "\nAll checks passed.");
process.exit(fails ? 1 : 0);
