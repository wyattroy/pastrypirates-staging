/* Q-18 — A LINE IS NEVER DRAWN AHEAD OF THE EVENT THAT CAUSED IT, AND BOTH SEATS DECIDE WITH ONE RULE.
 *
 * Wyatt's ruling, 2026-08-29, from the question UI: "Send the event too — additive, reversible: the
 * guest prefers the real event and falls back to today's picture when it's absent."
 *
 * WHAT IT IS FOR, MEASURED RATHER THAN ARGUED. The sentence and the event travel on two separate
 * Firebase paths — `rooms/<room>/narr` (set) and `rooms/<room>/ev` (push) — watched by two
 * independent listeners with no ordering between them. On the host both happen inside one local
 * call and are always in step. On the guest they are two messages that can land in either order.
 * A 12-minute two-browser game (scripts/qa/q21_purse_parity.mjs) caught it four times: twice the
 * guest drew a trade sentence while its captains box still held the pre-trade purse, and twice the
 * mirror image. Both totals were right on both screens — each had applied a COMPLETE trade, at a
 * different moment. Rule 23 in its plainest form: two things kept in step by nothing.
 *
 * THIS GATE READS SOURCE TEXT AND MAY ONLY CLAIM THINGS ABOUT SOURCE TEXT (CEO Review 21's rule).
 * Every pass line below therefore names the TEXT IT FOUND, not the behaviour it hopes that text
 * produces. Whether the two screens actually agree is q21_purse_parity.mjs's job, in two browsers.
 *
 * REBUILT 2026-08-29 AFTER CEO REVIEW 24 WALKED SIX WORKING BREAKAGES PAST THE FIRST VERSION GREEN,
 * including one where the guest silently swallows narration lines forever. Each is now named beside
 * the assertion that stops it, so the next person can see what a hole here actually looks like.
 */
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy, and every copy deleted BLOCK
   comments first — so a LINE comment containing the characters that open one swallowed 152
   lines of src/orchestrator.js, the whole import block included, in eight gates at once.
   See scripts/qa/lib/strip_comments.mjs for the measurement. */
import { stripComments as strip } from "./lib/strip_comments.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const read = rel => strip(fs.readFileSync(path.join(REPO, rel), "utf8"));
const orch = read("src/orchestrator.js");
const writers = read("src/net/writers.js");
const engine = read("src/engine/index.js");
const shared = read("src/shared/index.js");

/* (1) THE ENGINE STILL EMITS EXACTLY WHAT IT EMITTED. This is the assertion that protects the
   determinism corpus — CLAUDE.md's Project section: changing what the engine emits into the event
   stream invalidates the whole corpus and forces a gated re-record.
   BREAKAGE 1, WALKED PAST THE OLD VERSION: `o["n"]=this.events.length;`. The old guard was
   `!/o\.n\s*=/` — one spelling of one property access, protecting the most expensive thing in the
   repo. It now reads every property `ev(o)` assigns onto `o`, in BOTH spellings, and compares that
   SET against what the corpus was recorded with. A new field of any name fails, whatever it is
   called and however it is written. */
{
  const body = (engine.match(/\bev\(o\)\s*\{[\s\S]*?this\.events\.push\(o\);\}/) || [""])[0];
  const RECORDED = ["round", "wind", "storm", "wind2", "state", "tokens"];
  const assigned = [...body.matchAll(/\bo(?:\.([A-Za-z_$][\w$]*)|\[\s*["'`]([^"'`]+)["'`]\s*\])\s*=/g)]
    .map(m => m[1] || m[2]);
  const extra = [...new Set(assigned)].filter(k => !RECORDED.includes(k));
  const missing = RECORDED.filter(k => !assigned.includes(k));
  if (body && !extra.length && !missing.length)
    pass(`ev(o) assigns exactly {${RECORDED.join(", ")}} onto the event and nothing else — the text the determinism corpus was recorded against, in either spelling`);
  else
    fail(`ev(o)'s emitted field set has moved (found body:${!!body} unexpected:[${extra}] missing:[${missing}]) — anything added here changes what the engine emits and forces a gated re-record of the whole determinism corpus (CLAUDE.md, Project)`);
}

/* (2) AND THE ENGINE'S OWN ARRAY IS NEVER WRITTEN THROUGH FROM OUTSIDE.
   BREAKAGE 2: `appState.game.events[appState.evPushed].n=appState.evPushed;` beside the wire stamp.
   The old version only ever looked inside ev(o), so dirtying the array from the orchestrator was
   invisible to it. The serial must live on the DEEP COPY and nowhere else. */
{
  const stampsCopy = /const wire\s*=\s*JSON\.parse\(JSON\.stringify\([\s\S]{0,120}?\)\)/.test(orch)
    && /\bwire\.n\s*=\s*appState\.evPushed\b/.test(orch)
    && /netPushEvent\([^)]*\bwire\b/.test(orch);
  /* any assignment INTO the events array, however indexed — `events[i].x =`, `events[i] =` */
  const writesThrough = [...orch.matchAll(/\bgame\.events\s*\[[^\]]*\]\s*(?:\.[\w$]+\s*)?=[^=]/g)].map(m => m[0].trim());
  if (stampsCopy && !writesThrough.length)
    pass(`found: \`wire.n = appState.evPushed\` on a JSON deep copy passed to netPushEvent, and 0 matches for an assignment into game.events[...] in src/orchestrator.js`);
  else
    fail(`the engine's array is not protected (stamps the copy:${stampsCopy} writes found into game.events[...]:[${writesThrough}]) — a field written onto the engine's own event object is a field the corpus was not recorded with`);
}

/* (3) THE LINE CARRIES THE SERIAL, ADDITIVELY, AND THE FIELD IS SET IN EXACTLY ONE PLACE.
   BREAKAGE 3: append `payload.evN = 0;` after the required line. Every line then names event 0,
   nothing ever waits, and the whole fix is off with all the old assertions still matching. A
   single-assignment count is what stops it — and it is the same shape as the `subj` field beside
   it, which also has exactly one write. */
{
  const guarded = /if\s*\(evN\s*!=\s*null\)\s*payload\.evN\s*=\s*evN/.test(writers);
  const writes = (writers.match(/payload\.evN\s*=/g) || []).length;
  const inSignature = /function netSetNarr\([^)]*\bevN\b[^)]*\)/.test(writers);
  if (guarded && inSignature && writes === 1)
    pass("netSetNarr takes evN and writes payload.evN in exactly one place, behind a null guard — the same additive shape `wait`, `variants` and `subj` already use, and no second write that could pin it to a constant");
  else
    fail(`the serial field is not sound (in the signature:${inSignature} guarded write present:${guarded} total writes to payload.evN:${writes}, must be 1) — a second assignment can pin every line to one serial and silently disable the wait while every other assertion here still matches`);
}

/* (4) THE SERIAL NAMES THE EVENT THE SUBJECT WAS READ FROM — NOT SIMPLY THE NEWEST EVENT.
   CEO REVIEW 25's FINDING, and it is the fix introducing the fault it exists to cure. The first
   cut sent `events.length-1` with EVERY narration line. Only src/ui/panel.js's narrateLastEvent is
   about the last event; every other flash() in the game — prompts, dock lines, ceremonies, bot
   turn banners, the battle play-by-play — carried the serial of an event it had nothing to do
   with. The guest resolved that unrelated event, anchored the bubble to whichever captain it
   named and marked the subject DECIDED, while the host left the same sentence to the colour
   sniff: a host/guest divergence in bubble placement, in the exact family Wyatt reported.
   -1 IS NOT A SERIAL EITHER (CEO Review 24): before the first event `events.length-1` is -1,
   `-1 != null` so it went out, and the guest's frontier was still undefined so the guard was true
   regardless — holding the recipe-draft line for the full grace period in every crew game.
   Both ends are held, because either alone leaves an older client holding. */
{
  const panel = read("src/ui/panel.js");
  const boundToSubject = /appState\.narrEvIdx\s*=\s*appState\.game\.events\.length\s*-\s*1/.test(panel)
    && /window\.__pp4\.subject\s*=\s*subjectOf\(e\)/.test(panel);
  /* ONE SET AND ONE SPEND. panel.js sets it beside the subject and clears it once the line has
     been handed to the broadcast — a second SET would be a second opinion about which event a
     sentence belongs to, which is the fault this assertion exists to stop; the clear is the
     one-shot lifetime and is required, not merely tolerated. */
  const setsIt = (panel.match(/appState\.narrEvIdx\s*=\s*appState\.game\.events\.length\s*-\s*1/g) || []).length;
  const clearsIt = (panel.match(/appState\.narrEvIdx\s*=\s*null/g) || []).length;
  const onlyWriter = setsIt === 1 && clearsIt === 1;
  /* readSubject() must take BOTH from the same one-shot flag, refuse a negative, and spend it. */
  const rs = (orch.match(/function readSubject\(\)\{[\s\S]*?return \{subj,evN\};\}/) || [""])[0];
  const gatedOnFlag = /const has=!!\(window\.__pp4&&window\.__pp4\.subjectSet\)/.test(rs)
    && /const raw=has\?appState\.narrEvIdx:null/.test(rs);
  const refusesNegative = /raw>=0/.test(rs);
  const spent = /appState\.narrEvIdx=null;/.test(rs);
  const guestRefuses = /v\.evN\s*!=\s*null\s*&&\s*v\.evN\s*>=\s*0/.test(orch);
  if (boundToSubject && onlyWriter && rs && gatedOnFlag && refusesNegative && spent && guestRefuses)
    pass("found: panel.js sets appState.narrEvIdx beside `subject = subjectOf(e)` once, and spends it once when the line has gone; readSubject() reads it only when subjectSet is true, requires `raw>=0`, and assigns it null before returning; the guest guard text is `v.evN != null && v.evN >= 0`");
  else
    fail(`the serial is not bound to the subject (panel sets it beside the subject:${boundToSubject} panel sets it once and spends it once:${onlyWriter} (sets:${setsIt} clears:${clearsIt}) readSubject found:${!!rs} gated on the subjectSet flag:${gatedOnFlag} refuses a negative:${refusesNegative} spends it:${spent} guest guard requires >= 0:${guestRefuses}) — a serial sent with a line that never read an event points the guest at an unrelated event, and it anchors the bubble to whichever captain that event names while the host does not`);
}

/* (5) THE GUEST'S OWN FRONTIER IS RECORDED, AND NOTHING ELSE SETS IT.
   BREAKAGE 4: `appState.evSeen=1e9;` after the required record line. The wait then never engages.
   Assignments are counted and located instead of merely found. */
{
  const records = /if\(e&&e\.n!=null\)appState\.evSeen=e\.n/.test(orch);
  /* `=` NOT FOLLOWED BY `=`. The first cut of this counter matched `appState.evSeen==null` — the
     guard in watchNarr — as an assignment, reported 3 and failed a correct tree. An instrument
     that miscounts its own subject is worth no more than one that cannot see it. */
  const writes = (orch.match(/appState\.evSeen\s*=(?!=)/g) || []).length;
  const resets = /appState\.evSeen=null/.test(orch);
  if (records && resets && writes === 2)
    pass("appState.evSeen is written in exactly two places — from each arriving event's own `n`, and back to null when a voyage starts — so no third line can move the guest's frontier");
  else
    fail(`the guest's frontier is not trustworthy (records from the feed:${records} reset at voyage start:${resets} total assignments:${writes}, must be 2) — any extra write can park it past every serial and switch the wait off entirely`);
}

/* (6) THE WAIT IS STARTED, GUARDED ON ITS REAL OPERANDS, BOUNDED, AND FALLS BACK TO TODAY.
   BREAKAGE 5 (CEO 24), THE WORST OF THE FIRST SIX: delete the single `tick();` that starts the
   loop. The block still contained `setTimeout(tick`, the deadline test and the else-branch, so
   every assertion matched — while a guest silently lost every narration line whose event had not
   landed, forever. `node --check` passed too. The loop being STARTED is its own assertion.
   BREAKAGE 6: `NARR_EVENT_GRACE_MS = 2000`, inside the old 1..2000 window, and the pass line
   obligingly printed "for at most 2000ms". The ceiling is 600ms — above that it is a stall.
   BREAKAGE N1 (CEO 25): rewrite the engage condition to `(false)`. Every other assertion still
   matched and the ordering barrier never engaged again, on any line, ever. The condition's own
   OPERANDS are now read, not merely its presence. */
{
  const blk = (orch.match(/if\(v\.evN!=null[\s\S]*?\} else drawIt\(\);/) || [""])[0];
  const engage = (blk.match(/if\(v\.evN!=null&&v\.evN>=0&&\(([^)]*)\)\)/) || [, ""])[1];
  const realGuard = /appState\.evSeen==null/.test(engage) && /appState\.evSeen<v\.evN/.test(engage)
    && !/\bfalse\b/.test(engage) && !/\btrue\b/.test(engage);
  const started = /\n\s*tick\(\);\s*\n/.test(blk);
  const loops = /setTimeout\(tick/.test(blk);
  const deadline = /Date\.now\(\)>=until/.test(blk);
  const grace = (orch.match(/NARR_EVENT_GRACE_MS\s*=\s*(\d+)/) || [, null])[1];
  const bounded = grace != null && +grace > 0 && +grace <= 600;
  const fallsBack = /\} else drawIt\(\);/.test(blk);
  /* N2: `drawIt` must actually invoke applySubject. Deleting that one call left every other
     assertion here green while Wyatt's whole ruling — and W4-2's subject fix with it — was off. */
  const drawIt = (orch.match(/const drawIt=\(\)=>\{[\s\S]*?\};/) || [""])[0];
  const appliesSubject = /applySubject\(\);/.test(drawIt);
  if (blk && realGuard && started && loops && deadline && bounded && fallsBack && appliesSubject)
    pass(`found: the engage condition tests both \`appState.evSeen==null\` and \`appState.evSeen<v.evN\` with no literal true/false in it; a bare \`tick();\` statement inside the block; \`setTimeout(tick\`; \`Date.now()>=until\`; NARR_EVENT_GRACE_MS = ${grace} (<= 600); a closing \`} else drawIt();\`; and \`applySubject();\` inside drawIt's body`);
  else
    fail(`the wait is not safe (block found:${!!blk} guard reads its real operands:${realGuard} (\`${engage.slice(0,60)}\`) loop started:${started} re-arms:${loops} deadline test:${deadline} grace ${grace}ms within 1..600:${bounded} else-draws:${fallsBack} drawIt calls applySubject:${appliesSubject}) — a block that never calls tick() drops every held line silently, a guard rewritten to a constant switches the barrier off on every line, and a drawIt that never calls applySubject switches Wyatt's ruling off entirely`);
}

/* (7) A HELD LINE CANNOT REPAINT OVER A NEWER ONE. `narr` is a single slot written with .set(), so
   only the newest sentence is real — but each arriving line runs its own timer. Sequence CEO Review
   24 found: a line naming a held event, then a battle line 200ms later drawn at once, then the
   event lands and the older sentence paints over the newer. The generation counter is the guard. */
{
  const bumpAt = orch.search(/appState\.narrGen\s*=\s*\(appState\.narrGen\|\|0\)\s*\+\s*1/);
  const capAt  = orch.search(/const myGen\s*=\s*appState\.narrGen/);
  const drops = /if\(appState\.narrGen!==myGen\)return;/.test(orch);
  /* BREAKAGE N3 (CEO 25), AND IT IS BREAKAGE 5's CATASTROPHE WEARING A NEW COAT: swap the two
     adjacent lines so `myGen` is captured BEFORE the bump. Every assertion above still matches,
     the whole 48-gate chain stays green — and `narrGen !== myGen` is then true on the very first
     tick of every held line, so the guest silently loses all of them, forever. Reachable by
     reordering two lines. ORDER IS THE REQUIREMENT, so order is what is read. */
  const rightOrder = bumpAt >= 0 && capAt >= 0 && bumpAt < capAt;
  if (rightOrder && drops)
    pass(`found: \`appState.narrGen = (appState.narrGen||0)+1\` at offset ${bumpAt}, BEFORE \`const myGen = appState.narrGen\` at ${capAt}, and \`if(appState.narrGen!==myGen)return;\` inside the tick`);
  else
    fail(`the superseded-line guard is not in a working order (bump found at:${bumpAt} capture at:${capAt} bump precedes capture:${rightOrder} tick returns on mismatch:${drops}) — captured before the bump, every held line mismatches on its first tick and the guest loses all of them silently`);
}

/* (8) EVERY WRITER TO THE SLOT SENDS THE SAME FIELDS, AND SPENDS THE ONE-SHOT FLAG.
   netBroadcast — the battle play-by-play, where coins move MOST — used to send neither the subject
   nor the serial, so the fault this whole item exists to close stayed fully live for battle spoils
   (CEO Review 24). And it renders nothing locally, so nothing else ever clears `subjectSet` for it:
   without clearing it here a battle line inherits whatever subject the previous event decided
   (CEO Review 25). Two writers to one Firebase slot that disagree is the same fault in miniature. */
{
  const one = /function sendNarr\(html,variants,opts,subj,evN\)\{[\s\S]*?netSetNarr\([\s\S]*?evN\)/.test(orch);
  const narrateUses = /export function netNarrate\([\s\S]{0,900}?sendNarr\(html,variants,opts,subj,evN\)/.test(orch);
  const bBlk = (orch.match(/export function netBroadcast\([\s\S]{0,500}?sendNarr\(html,variants,opts,subj,evN\);\}/) || [""])[0];
  const broadcastClears = /window\.__pp4\.subjectSet=false/.test(bBlk);
  const noStragglers = (orch.match(/netSetNarr\(/g) || []).length === 1;
  if (one && narrateUses && bBlk && broadcastClears && noStragglers)
    pass("found: one sendNarr(html,variants,opts,subj,evN) reaching netSetNarr; both netNarrate and netBroadcast call it with that exact argument list; netBroadcast's body contains `window.__pp4.subjectSet=false`; `netSetNarr(` appears exactly 1 time in src/orchestrator.js");
  else
    fail(`the two narration writers do not share their payload (single assembler:${one} netNarrate uses it:${narrateUses} netBroadcast uses it:${!!bBlk} netBroadcast spends the flag:${broadcastClears} netSetNarr called exactly once:${noStragglers}) — a second call site is a second opinion about what a line carries, and an unspent flag leaks one line's subject onto the next`);
}

/* (9) AND THE GUEST PREFERS THE REAL EVENT — Wyatt's ruling in text. The first cut of this item
   shipped an ordering barrier and stopped one line short of the ruling: the guest still read the
   host's pre-drawn answer. It now runs the SAME shared rule over the event it already holds, with
   the host's answer surviving only as the fallback for a line that has no event.
   (Whether that rule is the RIGHT rule is w42_battle_bubble_check.mjs's assertion, not this one.) */
{
  const ruleIsShared = /function subjectOf\(e\)\{/.test(shared) && /\bexport\s*\{[^}]*\bsubjectOf\b/.test(shared);
  const guestComputes = /window\.__pp4\.subject=subjectOf\(ev\)/.test(orch);
  const evAt = (orch.match(/const evAt=n=>\{[\s\S]*?return null;\};/) || [""])[0];
  /* N4: `evAt` rewritten to return arr[0] — the guest then computes the subject from the wrong
     event on every line, and every assertion still matched. The lookup must be BY the serial. */
  const looksUpByN = /arr\[n\]&&arr\[n\]\.n===n/.test(evAt) && /arr\[i\]\.n===n/.test(evAt);
  /* N5: `arr[n].n=n` inside evAt — the engine's own array dirtied through the alias evAt itself
     creates, which assertion (2)'s `game.events[...]` search cannot see by construction. A lookup
     has no business assigning anything, so the requirement is the strong one: evAt's body contains
     no assignment at all. Comparisons and arrow heads are removed before looking. */
  const writesInto = [...evAt.matchAll(/(?:\]|\.[\w$]+)\s*=(?!=)/g)].map(m => m[0].trim());
  const readOnly = !!evAt && !writesInto.length;
  /* BREAKAGE N4' (CEO Review 26): rather than REPLACING the lookup, insert `return arr[0];` above
     it. Every presence test still matches — the lookup text is all still there, just unreachable —
     and the guest computes every subject from event 0. So the ORDER of the returns is read: the
     first return after the null guard must be the indexed lookup, and a fixed index must appear
     nowhere. Presence was never the requirement; being reached is. */
  const guardAt = evAt.search(/if\(n==null/);
  const lookupAt = evAt.search(/if\(arr\[n\]&&arr\[n\]\.n===n\)return arr\[n\];/);
  const between = guardAt >= 0 && lookupAt > guardAt ? evAt.slice(guardAt, lookupAt) : "";
  const noEarlyReturn = lookupAt > guardAt && !/\breturn\b/.test(between.replace(/if\(n==null[^;]*;/, ""));
  const noFixedIndex = !/arr\[\s*\d+\s*\]/.test(evAt);
  const fallsBack = /if\(v\.subj!=null\)\{window\.__pp4\.subject=\(v\.subj===-1\?null:v\.subj\)/.test(orch);
  if (ruleIsShared && guestComputes && looksUpByN && noEarlyReturn && noFixedIndex && readOnly && fallsBack)
    pass("found: subjectOf declared and exported in src/shared/index.js; `window.__pp4.subject=subjectOf(ev)` in the guest path; evAt tests `arr[n].n===n` and scans on `arr[i].n===n`, with no return statement and no fixed index between its null guard and that test; evAt's body contains no assignment; and the `v.subj` fallback with its -1 case is still present");
  else
    fail(`the guest does not prefer the real event (rule shared and exported:${ruleIsShared} guest calls subjectOf:${guestComputes} evAt found:${!!evAt} looks up BY the serial:${looksUpByN} reachable (no earlier return):${noEarlyReturn} no fixed index:${noFixedIndex} evAt assigns into something:[${writesInto}] still falls back to v.subj:${fallsBack}) — a lookup that ignores the serial hands the guest the wrong event, and one that assigns can dirty the engine's own array through its own alias`);
}

/* (10) THE DECISION IS CAPTURED — REALLY CAPTURED — BEFORE THE LOCAL DRAW SPENDS IT.
   MEASURED ON THE WIRE before this was written, two real browsers: of 47 narration lines in one
   crew game, NOT ONE carried a subject. On the v2 stage path — every crew game — src/ui/panel.js's
   flash() calls window.__pp4.flash() first, and stageFlash's own act is to read the flag and clear
   it (src/ui/stage.js:1386); only then does it reach netBroadcast, which finds it spent. W4-2's
   second half had therefore never worked in a crew game, and gate 42 could not see it because
   every line of code that SENDS the subject is present and correct.
   BREAKAGE P2 (CEO Review 26), AND IT IS THE WORST ONE YET: `const pre=window.__pp4.subjectSet&&false`.
   Two characters. `pre` is then always null, netBroadcast falls back to reading a flag that is
   already spent, and the wire carries nothing again — while THIS ASSERTION, written for exactly
   this bug, printed its PASS line word for word, because it read the POSITION of a substring and
   never the OPERANDS of the condition. That is the fault N1 was supposed to have taught, committed
   again in the assertion added to stop it. So the capture EXPRESSION is now read whole. */
{
  const panel2 = read("src/ui/panel.js");
  const cap = (panel2.match(/const pre=([\s\S]*?);\n/) || [, ""])[1];
  /* the whole expression, not its opening: a ternary on the flag, yielding the subject and the
     serial, with no literal that can short-circuit it to a constant. */
  const capSound = /window\.__pp4\.subjectSet\s*$|window\.__pp4\.subjectSet\s*\n/.test(cap.split("?")[0])
    && /\bsubj:\s*window\.__pp4\.subject\b/.test(cap)
    && /\bevN:\s*appState\.narrEvIdx\b/.test(cap)            /* P1: evN:null instead */
    && !/\bfalse\b|\btrue\b|&&|\|\|/.test(cap);              /* P2: &&false, ||null */
  const capAt = panel2.search(/const pre=window\.__pp4\.subjectSet/);
  const drawAt = panel2.search(/const h=window\.__pp4\.flash\(shown/);
  const inOrder = capAt >= 0 && drawAt >= 0 && capAt < drawAt;
  const handedOver = /onNetBroadcast\(msg,variants,opts,pre\)/.test(panel2);
  const accepted = /export function netBroadcast\(html,variants,opts,pre\)/.test(orch)
    && /pre\?\{subj:pre\.subj,evN:\(typeof pre\.evN==="number"&&pre\.evN>=0\)\?pre\.evN:null\}:readSubject\(\)/.test(orch);
  /* P6: exactly one write to the subject on the host side. A second one, crew-only, anchors every
     bubble to one seat on the host while the guest computes correctly — pure divergence. */
  const subjWrites = (panel2.match(/window\.__pp4\.subject\s*=(?!=)/g) || []).length;
  /* P4: inside readSubject the CLEAR must come after the READ, or no line ever carries a serial. */
  const rs2 = (orch.match(/function readSubject\(\)\{[\s\S]*?return \{subj,evN\};\}/) || [""])[0];
  const readAt = rs2.search(/const raw=has\?appState\.narrEvIdx:null/);
  const clearAt = rs2.search(/appState\.narrEvIdx=null;/);
  const spentAfterRead = readAt >= 0 && clearAt >= 0 && readAt < clearAt;
  /* P5: the wire writes the serial it was given, not an arithmetic of it. */
  const writesVerbatim = /payload\.evN\s*=\s*evN\s*;/.test(writers);
  if (capSound && inOrder && handedOver && accepted && subjWrites === 1 && spentAfterRead && writesVerbatim)
    pass(`found: the capture expression is \`${cap.replace(/\s+/g, " ").slice(0, 72)}\` — a ternary on window.__pp4.subjectSet yielding window.__pp4.subject and appState.narrEvIdx, with no true/false/&&/|| in it; it sits at offset ${capAt}, before the local draw at ${drawAt}; window.__pp4.subject is assigned exactly 1 time in panel.js; readSubject reads narrEvIdx before assigning it null; and writers.js contains \`payload.evN = evN;\``);
  else
    fail(`the decision is not captured intact before the draw (capture expression sound:${capSound} (\`${cap.replace(/\s+/g, " ").slice(0, 60)}\`) capture precedes draw:${inOrder} handed over:${handedOver} broadcast accepts it:${accepted} panel writes the subject ${subjWrites}x (must be 1) readSubject reads before it spends:${spentAfterRead} writers writes evN verbatim:${writesVerbatim}) — two characters appended to that expression switch this whole fix off and put the wire back to carrying nothing, which is how it sat for days`);
}

console.log(fails ? `\nFAILED — ${fails} failure(s)`
  : "\nPASSED — the TEXT found: ev(o)'s field set is unchanged and nothing writes into the engine's array; the serial is stamped on the wire copy, written once, and never negative at either end; the guest's frontier has exactly two writers; the held-line loop is started, capped at 600ms and falls through to an immediate draw; a superseded line drops; both narration writers share one payload; and the guest path contains a reachable lookup by serial into its own events array feeding the one shared subjectOf. Whether the two SCREENS agree is measured by scripts/qa/q21_purse_parity.mjs, in two real browsers.");
process.exit(fails ? 1 : 0);
