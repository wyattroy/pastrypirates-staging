// T-247 — WHY are 83 published files 404 on staging? A hypothesis, then the test.
//
// HYPOTHESIS: GitHub Pages runs Jekyll, and Jekyll refuses to serve any path segment beginning
// with "_" or "." — so those files ARE in the staging repo and the server will not hand them over.
// If true, every one of the 83 has such a segment, and NOTHING ELSE does.
//
// WHAT WOULD PROVE ME WRONG: a 404 with no underscore/dot segment, or a served file that has one.
//
// ⛔ IT MUST RUN THE GATE WITH `--test-jekyll-rule`, AND THAT FLAG IS THE WHOLE POINT.
// CEO 188: once the gate learned this rule it began stripping those files BEFORE comparing, so
// nothing hidden could ever reach `bad` — and this script then reported "84 of 84 explained" over
// an EMPTY set and printed HYPOTHESIS HOLDS having tested nothing. A measurement that cannot fail
// is not a measurement (CLAUDE.md rule 6), and teaching the gate the rule is what broke it.
// The flag turns the rule off so the claim is re-measured against real 404s every time.
import { execFileSync } from "node:child_process";
let out;
try { out = execFileSync(process.execPath, ["scripts/qa/_t247_staging_parity.mjs", "--json", "--test-jekyll-rule"], { encoding: "utf8", maxBuffer: 64e6 }); }
catch (e) { out = e.stdout; if (!out) throw e; }
const j = JSON.parse(out);

// RED-PROOF THE INSTRUMENT BEFORE BELIEVING IT: if the flag did not reach the gate, `bad` is empty
// and every conclusion below is vacuous. Refuse rather than print a green verdict over nothing.
if (j.bad.length === 0) {
  console.log("REFUSING TO CONCLUDE: the gate reported 0 failures, so there is nothing to explain.");
  console.log("Either --test-jekyll-rule did not reach it, or staging genuinely serves every hidden");
  console.log("file — and both of those make the verdict below meaningless. This is the exact");
  console.log("vacuous-pass CEO 188 caught. Fix the flag before reading anything into a green run.");
  process.exit(2);
}

const jekyllHidden = (f) => f.split("/").some((seg) => seg.startsWith("_") || seg.startsWith("."));

const bad = j.bad;
const explained = bad.filter((b) => jekyllHidden(b.file));
const unexplained = bad.filter((b) => !jekyllHidden(b.file));

console.log(`failing files: ${bad.length}`);
console.log(`  explained by the Jekyll rule (a path segment starting with _ or .): ${explained.length}`);
console.log(`  NOT explained — these are the real ones: ${unexplained.length}`);
for (const b of unexplained) console.log(`     ${b.file}  ${b.verdict}`);

// The other half of the falsifier: does the rule over-predict? Anything Jekyll-hidden that IS served
// would break the hypothesis just as badly.
console.log("\nchecking the reverse — is anything Jekyll-hidden actually being SERVED?");
const kinds = new Set(bad.map((b) => b.verdict));
console.log(`  verdict kinds among failures: ${[...kinds].join(", ")}  (a DIFFERS here would mean stale content, not a hidden file)`);
console.log(unexplained.length === 0 && [...kinds].every((k) => k.startsWith("MISSING"))
  ? "\nHYPOTHESIS HOLDS: every failure is a file Jekyll will not serve, and none is stale content."
  : "\nHYPOTHESIS FAILS — see above.");
