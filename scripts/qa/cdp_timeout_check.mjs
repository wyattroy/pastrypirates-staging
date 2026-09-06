#!/usr/bin/env node
/* cdp_timeout_check.mjs — does a hung CDP call self-kill, instead of hanging the script forever?
 *
 * WHY THIS EXISTS. His Inbox question, INBOX-20260904T004944Z: `scripts/lib/cdp.mjs`'s `send()`
 * had no timeout — its promise only resolved when Chrome's WebSocket answered back. If a
 * `Runtime.evaluate` ever waited on a page-side promise that never settled, the whole script (and
 * anything awaiting it, like `npm test` or a sea trial leg) would hang forever instead of failing
 * loud. This gate proves the fix by MEASURING it — a real timer, a real bounded wait — never by
 * reading a comment describing what the code is supposed to do (rule 6: a comment is not a
 * measurement).
 *
 * WHAT IT DOES NOT DO: launch Chrome. `withTimeout` is a small pure wrapper with no CDP/WebSocket
 * dependency, so it is tested directly with a promise that deliberately never resolves — the exact
 * shape of the hang his question describes — bounded by a short timeout so this gate itself cannot
 * hang.
 */
import { withTimeout } from "../lib/cdp.mjs";

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };

console.log("cdp_timeout_check — a CDP call that never gets a WebSocket answer must self-kill, not hang forever");

// A promise that NEVER resolves or rejects — the exact shape of a Chrome tab that never answers.
const neverSettles = new Promise(() => {});

const BUDGET_MS = 400;   // this gate's own outer bound, so a broken withTimeout cannot hang the suite
const TIMEOUT_MS = 100;  // the timeout given to withTimeout for this probe

const started = Date.now();
let outcome;
try {
  outcome = await Promise.race([
    withTimeout(neverSettles, TIMEOUT_MS, "probe").then(() => ({ kind: "resolved" })).catch((e) => ({ kind: "rejected", err: e })),
    new Promise((_, rej) => setTimeout(() => rej(new Error("gate's own outer bound fired — withTimeout did not")), BUDGET_MS)),
  ]);
} catch (e) {
  fail(`withTimeout never settled a promise that never resolves — it hung past this gate's own ${BUDGET_MS}ms bound (${e.message}). ` +
       `That is the exact bug INBOX-20260904T004944Z describes, unfixed.`);
  console.log(`\n${failures} failure(s).`);
  process.exit(1);
}
const elapsed = Date.now() - started;

if (outcome.kind === "resolved") {
  fail(`withTimeout RESOLVED a promise that never settles — it should have rejected with a timeout error.`);
} else if (elapsed < TIMEOUT_MS - 20 || elapsed > TIMEOUT_MS + 300) {
  fail(`withTimeout rejected, but not on schedule: fired at ${elapsed}ms against a ${TIMEOUT_MS}ms timeout (expected roughly on time, not immediately and not much later).`);
} else if (!/timed out|timeout/i.test(outcome.err?.message || "")) {
  fail(`withTimeout rejected at the right time (${elapsed}ms) but the error ("${outcome.err?.message}") doesn't say it was a timeout — a caller catching this can't tell a timeout from any other CDP failure.`);
} else {
  pass(`a promise that never resolves was rejected at ${elapsed}ms (timeout was ${TIMEOUT_MS}ms): "${outcome.err.message}"`);
}

// Static check that send() actually uses it — a helper nothing calls fixes nothing (this repo's
// recurring fault: a capability nothing invokes is a capability that never runs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const cdpSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "cdp.mjs"), "utf8");
const sendFn = cdpSrc.slice(cdpSrc.indexOf("const send ="));
if (/withTimeout/.test(sendFn.slice(0, sendFn.indexOf("\n\n") > 0 ? sendFn.indexOf("\n\n") : 400))) {
  pass("send() itself is wrapped in withTimeout, not just an unused export sitting beside it");
} else {
  fail("withTimeout exists but send() does not appear to use it — the CDP call that actually hangs is still unguarded");
}

console.log(failures ? `\n${failures} failure(s).` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
