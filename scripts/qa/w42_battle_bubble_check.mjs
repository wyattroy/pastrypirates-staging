/* W4-2 — A BATTLE'S NARRATION IS ABOUT TWO CAPTAINS, SO IT IS NOT ANCHORED TO ONE.
 * Wyatt: "Guest battle narration box is not centred." Narrowed by him 2026-08-27: his screenshot
 * shows the guest's tap-to-sail box correctly centred, so it is specific to the BATTLE box.
 *
 * MEASURED IN A REAL TWO-BROWSER CREW GAME (room NJCU) BEFORE CHANGING ANYTHING, and the
 * measurement corrects his premise in one way and sharpens it in another:
 *   - NOT guest-only. The battle RESULT bubble sat 44px right of centre on BOTH seats.
 *   - Within ONE battle, two lines were drawn two different ways:
 *       "Dough Hook attacks Flaky Jack!"  -> off 0   (centred)
 *       "Dough Hook wins 1–0…"           -> off 44  (anchored to a boat)
 *
 * WHY: a bubble with a SUBJECT anchors to that captain's boat and grows a tail — that is the design
 * and it is right for "Flaky Jack takes the wheel". `panel.js` sets the subject from the event as
 * `e.p ?? e.a ?? null`, and a battle event is `{t:"battle", a:attacker, d:defender}`, so the result
 * anchored to the ATTACKER. The opening line is emitted directly by the orchestrator with no
 * subject, hence centred. Two halves of one beat, two placements.
 *
 * THE RULE, DERIVED FROM THE EVENT'S OWN SHAPE rather than a typed list of event names: an event
 * that names TWO captains is not about one of them. It gets no subject, so its bubble is ambient
 * and centred — which is also what the codebase already says out loud about fights, in the camera
 * hold: "the director should focus battles on the players fighting, not the player calling the
 * battle."
 *
 * WHAT THIS MUST NOT BREAK: boat-anchoring for ordinary single-captain lines. That is the design,
 * not a bug, and a gate that only checked "battles are centred" would happily pass a tree where
 * NOTHING anchors any more.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy, and every copy deleted BLOCK
   comments first — so a LINE comment containing the characters that open one swallowed 152
   lines of src/orchestrator.js, the whole import block included, in eight gates at once.
   See scripts/qa/lib/strip_comments.mjs for the measurement. */
import { stripComments as strip } from "./lib/strip_comments.mjs";
const panel = strip(fs.readFileSync(path.join(REPO, "src/ui/panel.js"), "utf8"));
const stage = strip(fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8"));
/* THE RULE MOVED, AND THAT IS THE POINT (Q-18, 2026-08-29). It used to be inlined in panel.js and
   its ANSWER shipped to the guest as a wire field. It now lives ONCE, in the module both tiers
   import, and both seats run it over the same event. These assertions follow it there rather than
   being deleted — a gate that only knew the old address would have gone green on absence. */
const shared = strip(fs.readFileSync(path.join(REPO, "src/shared/index.js"), "utf8"));

/* (1) THE SUBJECT IS WITHHELD WHEN AN EVENT NAMES TWO CAPTAINS.
   CEO Review 20 broke the first version of this: it passed if the block merely CONTAINED the
   characters `e.d` and `null` — and the block always contains `e.p!=null`, so the `null` half could
   never fail. `const twoCaptains = e.d != null && false;` kept it green with anchoring fully
   restored. It now reads the two-captain test itself and requires it to consult BOTH fighters and
   compare them. */
{
  const fn = (shared.match(/function subjectOf\(e\)\{[\s\S]*?\n\}/) || [""])[0];
  const exported = /\bexport\s*\{[^}]*\bsubjectOf\b[^}]*\}/.test(shared);
  const test = (fn.match(/twoCaptains\s*=\s*([^;]+);/) || [, ""])[1];
  const real = /\be\.d\b/.test(test) && /\be\.a\b/.test(test) && /!==|!=/.test(test) && !/\bfalse\b/.test(test);
  const used = /twoCaptains\s*\?\s*null/.test(fn);
  const hostCalls = /__pp4\.subject\s*=\s*subjectOf\(e\)/.test(panel);
  if (fn && exported && real && used && hostCalls)
    pass(`a fight takes no subject — src/shared/index.js's subjectOf consults both fighters and compares them (${test.replace(/\s+/g, " ").slice(0, 60)}), it is exported, and panel.js calls it rather than spelling the rule out again`);
  else
    fail(`the two-captain rule is not one shared function (found in shared:${!!fn} exported:${exported} consults both and compares:${real} yields null:${used} panel calls it:${hostCalls}; test = \`${test.replace(/\s+/g, " ").slice(0, 60)}\`) — a battle event {t:"battle",a,d} would anchor its result to the ATTACKER. Measured in a crew game: 44px off centre on BOTH seats`);
}

/* (2) A DECIDED SUBJECT BEATS THE COLOUR SNIFF — and this is the half that made the first fix
   change nothing at all. stageFlash falls back to sniffing the sentence for captain colours whenever
   the subject is null. That fallback exists for turn-start lines, which carry no event. A battle
   result names exactly ONE captain (the winner), so the sniff re-anchored the very line the rule had
   just decided to centre. "Decided" and "absent" must be different states. */
{
  /* THE BRIDGE ACCESSOR, because forgetting it made this whole fix a NO-OP that still measured as
     working. `window.__pp4` is a bridge object, not the state: `subject` reaches S only through a
     getter/setter pair. panel.js writes `window.__pp4.subjectSet = true`; without a matching pair
     that set a plain property on the bridge, never arrived, `decided` was always false, the colour
     sniff always ran, and the battle result was re-anchored exactly as before. */
  const bridged = /set subjectSet\(v\)\s*\{\s*S\.subjectSet\s*=\s*v/.test(stage);
  const marks = /__pp4\.subjectSet\s*=\s*true/.test(panel) && bridged;
  const honours = /const\s+decided\s*=\s*!!S\.subjectSet/.test(stage) && /!decided\s*&&\s*subj\s*==\s*null/.test(stage);
  const consumed = /S\.subjectSet\s*=\s*false/.test(stage);
  if (marks && honours && consumed)
    pass("a subject DECIDED from an event beats the colour sniff, and the flag is consumed with it so it cannot leak into the next line");
  else
    fail(`a deliberate "no subject" still falls through to the colour sniff (host marks it:${marks} bridged to the real state:${bridged} stage honours it:${honours} flag consumed:${consumed}) — the sniff anchors any line naming exactly one captain, and a battle result names the winner, so the fix would change nothing on screen`);
}

/* (3) AND BOTH SEATS READ ONE DECISION — rule 23, and the fault CEO Review 20 found still live on
   the seat Wyatt actually reported. A guest never runs panel.js: it receives the finished sentence
   over the wire. If the host's decision does not travel, the guest falls back to the sniff and
   anchors the fight while the host centres it — the same line drawn two ways. */
{
  const writers = strip(fs.readFileSync(path.join(REPO, "src/net/writers.js"), "utf8"));
  const orch = strip(fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8"));
  const sends = /function netSetNarr\([^)]*subj[^)]*\)/.test(writers) && /payload\.subj\s*=/.test(writers);
  /* `subj` ANYWHERE IN THE ARGUMENT LIST, not pinned to the end. This required it to be the LAST
     argument, so Q-18 appending `evN` failed the gate on a tree that still passes the subject
     perfectly. A position is not the requirement; being sent is. `[^;]*` cannot cross a statement
     boundary, so this still fails outright if the argument is dropped — verified by removing it. */
  const passes = /netSetNarr\([^;]*\bsubj\b[^;]*\)/.test(orch);
  /* THE GUEST RUNS THE RULE, and only falls back to the host's answer. This is Wyatt's Q-18 ruling
     in text: "the guest prefers the real event and falls back to today's picture when it's
     absent." Both halves are required — preferring the event without the fallback would break
     every line that carries no event, and the fallback alone is what shipped first and is what
     CEO Review 24 sent back. */
  /* READ FROM THE RAW FILE, NOT THE STRIPPED ONE. `strip` deletes block comments with a lazy
     /* ... *\/ match, and an earlier LINE comment in orchestrator.js contains the characters that
     open one — so the stripper eats a stretch of the import list, and this assertion measured a
     region that was not there. An instrument that cannot see its subject reports absence, which
     reads exactly like a real failure and is worth no more than a real pass. */
  const orchRaw = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
  const sharedImport = (orchRaw.match(/import\s*\{[^}]*\}\s*from\s*"\.\/shared\/index\.js"/) || [""])[0];
  const guestImports = /\bsubjectOf\b/.test(sharedImport);
  const guestComputes = /subject\s*=\s*subjectOf\(/.test(orch);
  const guestFallsBack = /v\.subj\s*!=\s*null/.test(orch) && /subjectSet\s*=\s*true/.test(orch);
  if (sends && passes && guestImports && guestComputes && guestFallsBack)
    pass("both seats run the SAME subjectOf over the same event, and the host's wire answer survives only as the fallback for a line with no event — one rule, not two kept in step (rule 23)");
  else
    fail(`the two seats do not share the rule (writer carries the fallback:${sends} host passes it:${passes} guest imports subjectOf:${guestImports} guest computes from the event:${guestComputes} guest still falls back:${guestFallsBack}) — a guest that decides for itself with a different rule, or does not decide at all, sniffs the sentence and anchors the fight while the host centres it`);
}

/* (4) ORDINARY LINES STILL ANCHOR, at BOTH ends. Without this, "make fights centred" passes on a
   tree where nothing anchors and the tail/boat design is gone. */
{
  const drawsAnchored = /subj\s*==\s*null\s*\?\s*" ambient"/.test(stage) && /boatUXY\(subj\)/.test(stage);
  const fn2 = (shared.match(/function subjectOf\(e\)\{[\s\S]*?\n\}/) || [""])[0];
  const stillSupplies = /e\.p\s*!=\s*null/.test(fn2) && /e\.a\s*!=\s*null/.test(fn2);
  const sniffSurvives = /named\.length\s*===\s*1/.test(stage);
  if (drawsAnchored && stillSupplies && sniffSurvives)
    pass("a single-captain line still anchors — stage can draw it, panel still supplies the seat, and the colour-sniff fallback for event-less turn banners survives");
  else
    fail(`anchoring is broken for ordinary lines (draws:${drawsAnchored} supplies:${stillSupplies} sniff-fallback:${sniffSurvives}) — that is the design for "Flaky Jack takes the wheel", not a bug, and this item did not ask for it to go`);
}

/* (5) THE TWO HALVES OF ONE BATTLE ARE DRAWN ALIKE (rule 8). */
{
  const orch2 = strip(fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8"));
  const open = orch2.match(/await flash\(`[^`]*attacks \$\{pn\(def\.idx\)\}[^`]*`[^;]*\)/);
  if (!open) fail("could not find the battle's opening narration in orchestrator.js — re-anchor this assertion");
  else if (/subject/.test(open[0]))
    fail("the battle's OPENING line now sets a subject while the result withholds one — the two halves of one fight drawn two ways again");
  else
    pass("the battle's opening line and its result are both subject-less, so one fight is drawn one way (rule 8)");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — a fight takes no subject, that decision beats the colour sniff AND crosses the wire so both seats draw it alike, and single-captain lines still anchor");
process.exit(fails ? 1 : 0);
