/* THE PILOT'S FOUR GUARANTEES, AS GATES THAT FAIL LOUDLY — not promises somebody keeps.
 *
 *   node scripts/qa/pilot_gates.mjs
 *
 * Wyatt's spec put four guarantees on this feature. Each one below is the machine version, and
 * each carries a RED-PROOF: the check is fed the broken case and watched going red, because
 * "three probes written against the manual could not have failed" is a thing that has happened
 * here before (QA-PROCESS, 2026-08-26).
 *
 *   1  a veteran's game is byte-identical
 *   2  the pilot never draws anything of its own
 *   3  nothing it says reaches the wire
 *   4  the voyage itself is unchanged — it never draws a random number
 *
 * WHAT NO GATE HERE CAN DO: say whether a first-timer understands any of it. Nobody in this
 * project has ever watched one play. That is still the only evidence that would settle it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
/* CODE ONLY, NEVER PROSE. The first run of this gate went red on src/ui/course.js "drawing a
   random number" — and what it had found was the COMMENT saying it deliberately does not use one.
   A scan that fires on the explanation of a rule is worse than no scan: it trains the next reader
   to reword comments until the gate goes quiet. So every check that asks "does this code do X"
   reads the file with its comments removed. (doc_command_check makes the same distinction, and
   its own note — "it does not fire on prose" — is why that gate is trusted.) */
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, " ")     // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");   // line comments (the guard spares "http://")

/* pathToFileURL, NOT a bare absolute path: on Windows the ESM loader THROWS on
   "C:\\..." and takes the rest of the gate chain down with it. He works on a Windows
   laptop as well as this Mac, so a Mac-only gate is a gate that breaks his other machine.
   scripts/qa/esm_import_url_check.mjs caught this on the first run. */
const pilot = await import(pathToFileURL(path.join(REPO, "src/ui/pilot.js")).href);
const { LADDERS, MOMENTS, pilotLine, pilotRung, pilotSee, pilotDepth, DECAY,
        pilotDecayOnLaunch, pilotStartFromTheTop, pilotSkipToVeteran, pilotToggle,
        __pilotPose } = pilot;

let fails = 0;
const ok = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!cond) fails++;
};

/* ══ 1 · A VETERAN'S GAME IS BYTE-IDENTICAL ═══════════════════════════════════════════════════
   Made by CONSTRUCTION, not by an assertion: the bottom rung of every ladder is `null`, which
   means "whatever the game builds today", handed in by the call site. So this gate checks the
   SHAPE that makes it true, which is stronger than comparing two copies of a string. */
console.log("1 · a veteran's game is byte-identical");
const tails = MOMENTS.filter((id) => LADDERS[id][LADDERS[id].length - 1] !== null);
ok(`every one of the ${MOMENTS.length} ladders ends in null`, tails.length === 0,
   tails.length ? `offenders: ${tails.join(", ")}` : "");

// and the reader really does hand `shipped` straight back at that rung — string form and {msg,sub}
__pilotPose({ seen: Object.fromEntries(MOMENTS.map((id) => [id, 99])) });
const strFails = MOMENTS.filter((id) => pilotLine(id, "SHIPPED-SENTINEL").msg !== "SHIPPED-SENTINEL");
ok("at the bottom rung pilotLine() returns the shipped string untouched", strFails.length === 0,
   strFails.length ? `offenders: ${strFails.join(", ")}` : "");
const objLine = pilotLine("sail.pick", { msg: "A", sub: "B" });
ok("…and the {msg,sub} form survives too", objLine.msg === "A" && objLine.sub === "B");

// RED-PROOF: put a literal at the bottom of a ladder and the shape check must go red.
{
  const saved = LADDERS["act.muse"].slice();
  LADDERS["act.muse"][LADDERS["act.muse"].length - 1] = "a literal that would drift";
  const caught = MOMENTS.some((id) => LADDERS[id][LADDERS[id].length - 1] !== null);
  const leaks = pilotLine("act.muse", "SHIPPED-SENTINEL").msg !== "SHIPPED-SENTINEL";
  LADDERS["act.muse"] = saved;
  ok("RED-PROOF: a literal at the bottom of a ladder is caught, and it really would leak", caught && leaks);
}

/* ══ 2 · THE PILOT NEVER DRAWS ANYTHING OF ITS OWN ════════════════════════════════════════════
   It may only hand strings to boxes the renderer already produced. No elements, no camera.
   (src/ui/course.js is EXCLUDED on purpose and is not a loophole: the onward guide is new
   drawing Wyatt approved by name — "a dotted course over the real travellable path, ending in a
   pulsing treasure X" — and it has its own layer, its own teardown and its own row in the
   accepted list. This gate is about the WORDS half not growing a renderer.) */
console.log("\n2 · the pilot never draws anything of its own");
const src = code("src/ui/pilot.js");   // comments stripped — see `code()`
for (const bad of ["createElement", "innerHTML", "appendChild", "camFit", "querySelector"])
  ok(`src/ui/pilot.js contains no ${bad}`, !src.includes(bad));
ok("RED-PROOF: the scan can fail — it finds a token that IS in the stripped code", src.includes("localStorage"));

/* ══ 3 · NOTHING IT SAYS REACHES THE WIRE ═════════════════════════════════════════════════════
   The Pilot is per device, so a veteran host must not be able to silence a first-time guest.
   The spec pickCell() builds carries the SHIPPED line and a null hint; each device applies its
   own rung inside renderPickPrompt, the one renderer both tiers already share. */
console.log("\n3 · nothing the pilot says reaches the wire");
const flow = code("src/ui/flow.js");
const specLine = (flow.match(/const spec=\{kind:"pick".*/) || [""])[0];
ok("the sail spec on the wire carries hint:null", /hint:null/.test(specLine), specLine.slice(0, 96) + "…");
ok("…and its msg is sailPickMsg with NO rung argument (i.e. the shipped default)",
   /msg:sailPickMsg\(player\.idx,cells\)/.test(specLine));
ok("the rung is applied in renderPickPrompt, not in pickCell",
   /renderPickPrompt[\s\S]{0,4000}?pilotLine\("sail\.pick"/.test(flow));
ok("pilot.js itself knows nothing about the network",
   !/netSetNarr|onBroadcast|netHandlers|firebase/i.test(src));
// RED-PROOF: the spec matcher is real — it fails on a spec that DID carry a rung.
ok("RED-PROOF: the wire check can fail",
   !/hint:null/.test(`const spec={kind:"pick",seat:0,cells,msg:X,hint:rung.sub||null,pos:[]};`));

/* ══ 4 · THE VOYAGE ITSELF IS UNCHANGED ═══════════════════════════════════════════════════════
   The cheapest of the four to check and the strongest available: the pilot never draws a random
   number, so the same seed produces the same voyage with it on or off. The course's hand-drawn
   wobble is a DETERMINISTIC hash of the arc length, which is the whole reason it is not Math.random. */
console.log("\n4 · the voyage itself is unchanged");
const course = code("src/ui/course.js");
ok("src/ui/pilot.js draws no random number", !/Math\.random/.test(src));
ok("src/ui/course.js draws no random number", !/Math\.random/.test(course));
ok("…the course's wobble is a deterministic hash instead", /const rnd1 = s =>/.test(course));
ok("…and the comment-stripper really stripped something", read("src/ui/course.js").length > course.length + 2000);
ok("neither module calls the engine's seeded RNG either (that WOULD fork the stream)",
   !/\bg\.r\(\)|game\.r\(\)/.test(src + course));
ok("RED-PROOF: the scan can fail", /Math\.(sin|floor)/.test(course));

/* ══ 5 · THE STEP BOARD-RENDERING CALLS THE ONE THAT GETS FORGOTTEN ═══════════════════════════
   A board-mapped HTML overlay that is not in CAM_HTML_LAYERS detaches the moment the director
   zooms. #rimHost was forgotten exactly that way — "the wind arrows are not attached to the
   board!" This is one grep and it would have caught that. */
console.log("\n5 · the marker layer is registered with the camera");
const stage = code("src/ui/stage.js");
const cam = (stage.match(/const CAM_HTML_LAYERS = \[[^\]]*\]/) || [""])[0];
ok("courseHost is in CAM_HTML_LAYERS", /courseHost/.test(cam), cam);
ok("RED-PROOF: the check can fail", !/courseHost/.test(`const CAM_HTML_LAYERS = ["rippleHost"]`));

/* ══ 6 · A RUNG FIRES ONCE, AND THE COUNT CLAMPS ══════════════════════════════════════════════ */
console.log("\n6 · a rung fires once, then the next one down");
__pilotPose({});
const seen = [];
for (let i = 0; i < 6; i++) { seen.push(pilotLine("sail.pick", "tap to sail").msg); pilotSee("sail.pick"); }
ok("the first three sightings differ, then it settles on the shipped line for good",
   seen[0] !== seen[1] && seen[1] !== seen[2] && seen[3] === "tap to sail" && seen[5] === "tap to sail",
   JSON.stringify(seen.map((s) => s.slice(0, 26))));
ok("the count never runs past the bottom rung", pilotRung("sail.pick") === pilotDepth("sail.pick") - 1);

/* ══ 7 · THE DIAL ════════════════════════════════════════════════════════════════════════════ */
console.log("\n7 · the fork and the parrot");
__pilotPose({}); pilotSkipToVeteran();
ok("the fork's 'Yaargh!' is today's game exactly", MOMENTS.every((id) => pilotRung(id) === pilotDepth(id) - 1));
__pilotPose({}); pilotStartFromTheTop();
ok("the fork's 'Nah' starts every ladder at the top", MOMENTS.every((id) => pilotRung(id) === 0));
__pilotPose({}); pilotToggle();
ok("the parrot switched OFF puts every ladder at the bottom", MOMENTS.every((id) => pilotRung(id) === pilotDepth(id) - 1));
ok("…and OFF really is today's copy", pilotLine("sail.pick", "tap to sail").msg === "tap to sail");
pilotToggle();
ok("switching it back ON returns every ladder to the top", MOMENTS.every((id) => pilotRung(id) === 0));

/* ══ 8 · DECAY, ON HIS SCHEDULE, EVALUATED BETWEEN VOYAGES ════════════════════════════════════ */
console.log("\n8 · decay by time away");
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const poseAt = (days) => {
  __pilotPose({ last: daysAgo(days), seen: Object.fromEntries(MOMENTS.map((id) => [id, 9])) });
  return pilotDecayOnLaunch();
};
ok("under 7 days: nothing is given back", poseAt(3) === 0);
ok("7–30 days: one rung back", poseAt(14) === 1);
ok("30–90 days: two rungs back", poseAt(60) === 2);
ok("over 90 days: back to the top", poseAt(200) === Infinity);
__pilotPose({ last: daysAgo(200), seen: { "sail.pick": 3 } });
pilotDecayOnLaunch();
ok("…and 'back to the top' really means rung 0", pilotRung("sail.pick") === 0);
ok("a first voyage (no stored date) decays nothing", (() => { __pilotPose({}); return pilotDecayOnLaunch() === 0; })());
ok("two voyages in one evening behave identically", (() => {
  __pilotPose({ seen: { "sail.pick": 2 } });
  pilotDecayOnLaunch(); const a = pilotRung("sail.pick");
  pilotDecayOnLaunch(); const b = pilotRung("sail.pick");
  return a === 2 && b === 2;
})());
ok("RED-PROOF: the schedule check can fail — a 14-day gap is not 0 rungs", poseAt(14) !== 0);

/* ══ 9 · THE EDITORIAL LAW ════════════════════════════════════════════════════════════════════
   Wyatt, 2026-08-25, deleting "Attacking costs ye 2🌕 for powder": a helper line may only say
   what the button does not. A rung that names a price the circle already prints is the exact
   thing he removed, so the ladders are scanned for one. */
console.log("\n9 · no rung restates its own button");
const lines = [];
for (const id of MOMENTS) for (const r of LADDERS[id]) {
  if (r == null) continue;
  lines.push([id, typeof r === "string" ? r : [r.msg, r.sub].filter(Boolean).join(" ")]);
}
const priced = lines.filter(([, t]) => /[−-]\s?\d+\s*🌕|costs ye \d/.test(t));
ok(`no rung prints a price the button already carries (${lines.length} rungs scanned)`, priced.length === 0,
   priced.length ? JSON.stringify(priced) : "");
ok("RED-PROOF: the scan can fail", /[−-]\s?\d+\s*🌕/.test("Attack −2🌕 for powder"));

console.log(`\n${fails ? "FAILED" : "PASSED"} — ${fails} failing check(s)`);
process.exit(fails ? 1 : 0);
