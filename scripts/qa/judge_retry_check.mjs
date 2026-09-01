/* THE CERT-HICCUP RETRY, CHECKED — because it was silently missing from the batched path for an hour.
 *
 * WHAT HAPPENED, 2026-08-30. The one-screen judge grew two bounded retries on 2026-08-28 after a
 * proxy TLS hiccup deferred 45 judgeable screens. The batched judge shipped the same day WITHOUT
 * them, and its own verification run caught it inside the hour: at 457s one call came back
 * "Self-signed certificate detected", the whole vision pass went FATAL, and all 16 screens of a leg
 * were deferred. That is the same shape as the hiccup that lost the ENTIRE picture half of the
 * 2026.08.29.2 trial. Two paths that must agree were kept in step by discipline, and they drifted
 * inside a single session (CLAUDE.md rule 23).
 *
 * So the retry is now one function both paths call, and this is the check on it. It asserts the
 * DISTINCTION that matters: a hiccup is retried, an expired login is not — because there every
 * further call genuinely fails the same way and retrying just buries the one real message.
 */
import { withCertRetry } from "../lib/vision.mjs";

let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : `\n       ${detail}`}`); if (!ok) fails++; };
const isFatal = x => (x && x.verdict === "FATAL") ? x : null;

let n = 0;
const certThenOk = async () => (++n < 3 ? { verdict: "FATAL", issues: ["Self-signed certificate detected. Check your proxy"] } : { verdict: "PASS", issues: [] });
const r1 = await withCertRetry(certThenOk, isFatal);
check("a cert-flavoured FATAL is retried until it clears", r1.verdict === "PASS" && n === 3, `verdict=${r1.verdict} after ${n} call(s)`);

n = 0;
const loginDead = async () => { n++; return { verdict: "FATAL", issues: ["the judge cannot run: OAuth session expired and could not be refreshed"] }; };
const r2 = await withCertRetry(loginDead, isFatal);
check("an expired login is NOT retried — it stops at once", r2.verdict === "FATAL" && n === 1, `${n} call(s) made; expected exactly 1`);

n = 0;
const certForever = async () => { n++; return { verdict: "FATAL", issues: ["Self-signed certificate detected"] }; };
const r3 = await withCertRetry(certForever, isFatal);
check("a SUSTAINED cert outage gives up after its budget (never loops)", r3.verdict === "FATAL" && n === 3, `${n} call(s) made; expected 1 + 2 retries`);

n = 0;
const fine = async () => { n++; return { verdict: "PASS", issues: [] }; };
await withCertRetry(fine, isFatal);
check("a healthy call is made exactly once", n === 1, `${n} call(s)`);

console.log(fails ? `\nFAIL — ${fails} failure(s)` : "\nPASS — 0 failure(s)");
process.exit(fails ? 1 : 0);
