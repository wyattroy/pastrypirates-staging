#!/usr/bin/env node
// GATE: the Glass's two-way round trip cannot eat Wyatt's words.
//
// Glass v2 (2026-08-31) lets the page rebuild and save itself with an idea appended. The idea
// text is user text, and two documented failure shapes would corrupt it silently:
//   (a) String.replace's "$&"-interpretation mangling inserted values, and
//   (b) an unescaped "</script>" in idea text terminating the state block early.
// This gate runs THE REAL generator (never a paraphrase of it), extracts the template exactly
// the way the page's own script holds it, performs the page's rebuild with deliberately nasty
// text, and requires the state to survive byte-for-byte. It then RED-PROOFS ITSELF both ways:
// the two broken rebuild variants must make this same verifier FAIL, or the verifier is
// vacuous and says so.
//
// Side effect, stated: running the generator stamps the heartbeat and rewrites glass.html with
// a gate note. Both are honest (a test run is real activity), and the Door regenerates the page
// with a real note before any republish.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, ".planning", "wyclau", "glass.html");
let failed = false;
const fail = (m) => { failed = true; console.error(`FAIL glass_roundtrip: ${m}`); };
const ok = (m) => console.log(`  ok: ${m}`);

execFileSync("node", [join(ROOT, "scripts", "wyclau", "glass.mjs"), "--note", "gate: glass_roundtrip_check"], { stdio: "ignore" });
const page = readFileSync(OUT, "utf8");

// --- extract the state block and the TPL literal exactly as the page holds them ---
const stateMatch = page.match(/<script type="application\/json" id="glassState">([\s\S]*?)<\/script>/);
const tplMatch = page.match(/var TPL = ("(?:[^"\\]|\\.)*");/);
if (!stateMatch) fail("no state block found in generated page");
if (!tplMatch) fail("no TPL literal found in generated page");

let state = null, TPL = null;
if (stateMatch) {
  try { state = JSON.parse(stateMatch[1]); } catch (e) { fail(`state block is not JSON: ${e.message}`); }
  if (state && (state.v !== 2 || !Array.isArray(state.ideas))) fail("state lacks v:2 / ideas[]");
  else if (state && (typeof state.rulings !== "object" || state.rulings === null))
    fail("state lacks rulings{} — the folded-in Helm has nowhere to record his call");
  else if (state) ok("generated state block parses (v:2, ideas[], rulings{})");
}
if (tplMatch) {
  try { TPL = JSON.parse(tplMatch[1]); } catch (e) { fail(`TPL literal is not a JSON string: ${e.message}`); }
}
if (TPL) {
  // The tokens appear MORE than once by design — the client's own replace() calls hold them as
  // string literals. What is load-bearing is that the FIRST occurrence of each is the real slot,
  // because both the generator and the page replace first-occurrence only.
  const idxState = TPL.indexOf("__GLASS_STATE__");
  const idxTpl = TPL.indexOf("__GLASS_TPL__");
  if (idxState < 0 || idxTpl < 0) fail("template is missing a token entirely");
  else {
    if (!TPL.slice(Math.max(0, idxState - 60), idxState).includes('id="glassState">'))
      fail("first __GLASS_STATE__ occurrence is not the state-block slot — a save would write JSON somewhere else");
    else ok("first state token is the state-block slot");
    if (TPL.slice(idxTpl - 10, idxTpl) !== "var TPL = ")
      fail("first __GLASS_TPL__ occurrence is not the TPL assignment slot");
    else ok("first TPL token is the assignment slot");
    if (idxState > idxTpl)
      fail("state slot must precede the TPL slot — first-occurrence replacement depends on it");
  }
}

// --- the page's rebuild, mirrored line for line from glass.mjs's client script.
// A paraphrase risk, acknowledged: if buildDoc changes shape there, change it here in the same
// commit — the red-proofs below exist to keep this mirror honest rather than vacuous.
const jsEsc = (s) => JSON.stringify(s).replace(/</g, "\\u003c");
const buildDocReal = (tpl, st) => tpl
  .replace("__GLASS_TPL__", () => jsEsc(tpl))
  .replace("__GLASS_STATE__", () => JSON.stringify(st).replace(/</g, "\\u003c"));
// The two documented broken shapes:
const buildDocDollar = (tpl, st) => tpl
  .replace("__GLASS_TPL__", () => jsEsc(tpl))
  .replace("__GLASS_STATE__", JSON.stringify(st).replace(/</g, "\\u003c")); // string form: $-interpretation
const buildDocNoEsc = (tpl, st) => tpl
  .replace("__GLASS_TPL__", () => jsEsc(tpl))
  .replace("__GLASS_STATE__", () => JSON.stringify(st)); // no < escaping: </script> escapes the block

const NASTY = {
  v: 2, generatedAt: "2026-08-31T00:00:00.000Z",
  ideas: [{ id: "i1", text: `He said "arr" \\ matey $& $' $\` 100% </script><img src=x>`, at: "2026-08-31T00:00:01.000Z" }],
  // Rulings ride the same state block (the Helm, folded in 2026-08-31) and must survive the same
  // hostile text — his NOTE is free-form and is the half that outranks the button.
  rulings: {
    "fix-the-live-audio-defect": {
      choice: "yes",
      note: `Do it — but not the "$&" way; see </script> notes & the 100% case`,
      q: `Fix the live audio defect? (8s of storm)`,
      at: "2026-08-31T00:00:02.000Z",
    },
  },
};

const verify = (doc) => {
  const m = doc.match(/<script type="application\/json" id="glassState">([\s\S]*?)<\/script>/);
  if (!m) return "no state block in rebuilt doc";
  let st;
  try { st = JSON.parse(m[1]); } catch (e) { return `rebuilt state is not JSON: ${e.message}`; }
  if (JSON.stringify(st) !== JSON.stringify(NASTY)) return "rebuilt state does not equal the input state";
  const t = doc.match(/var TPL = ("(?:[^"\\]|\\.)*");/);
  if (!t) return "rebuilt doc lost its own template — the next save would be impossible";
  let tpl2;
  try { tpl2 = JSON.parse(t[1]); } catch (e) { return "rebuilt TPL literal unparseable"; }
  if (!tpl2.includes("__GLASS_STATE__") || !tpl2.includes("__GLASS_TPL__"))
    return "rebuilt doc's embedded template lost its tokens — saves would stop after one generation";
  return null;
};

if (TPL) {
  const realErr = verify(buildDocReal(TPL, NASTY));
  if (realErr) fail(`round trip with hostile text: ${realErr}`);
  else ok("round trip survives quotes, backslash, $&-sequences and </script> in idea text");

  // Red-proofs: the verifier must catch both broken shapes, or it proves nothing.
  if (verify(buildDocDollar(TPL, NASTY)) === null)
    fail("VACUOUS: verifier passed the $-interpretation variant — it cannot catch failure (a)");
  else ok("red-proof (a): $-interpretation variant is caught");
  if (verify(buildDocNoEsc(TPL, NASTY)) === null)
    fail("VACUOUS: verifier passed the unescaped-</script> variant — it cannot catch failure (b)");
  else ok("red-proof (b): unescaped </script> variant is caught");
}

if (failed) { console.error("FAIL glass_roundtrip_check"); process.exit(1); }
console.log("PASS glass_roundtrip_check — the page can save Wyatt's words and its own future");
