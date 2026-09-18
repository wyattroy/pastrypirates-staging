/* LOOSENING A CHECK IS HOW A SUITE QUIETLY STOPS MEANING ANYTHING — so this proves it did not.
 *
 *   node scripts/qa/checks_pointer_events_redproof.mjs
 *
 * ============================================================================
 *  What changed, and why it needed proving
 * ============================================================================
 * scripts/lib/checks.mjs counts "controls the player must be able to reach" and fails when one is
 * covered. It excluded display:none, visibility:hidden, opacity and zero size — but NEVER asked
 * about pointer-events. So an element the BROWSER ITSELF refuses to deliver a click to was counted
 * as an unreachable control.
 *
 * That is not academic: the recipe picker is a STACK of two cards by design, and the card behind is
 * deliberately pointer-events:none / aria-hidden / out of the tab order, with a separate reachable
 * control (.pp4RcPeek) over its visible sliver. The sea trial reported it as a covered clickable on
 * every leg, ten of ten. index.html claimed that arrangement "cannot fail the structural check
 * because it is not a clickable at all" — the claim was FALSE, and the check's definition was the
 * thing that was wrong.
 *
 * ⚠ BUT A CHECK THAT WAS MADE TO STOP FAILING IS WORTHLESS UNLESS IT CAN STILL FAIL. This holds
 * BOTH halves in one run, against a real DOM in a real browser:
 *
 *     A. a covered element with pointer-events:none   -> must NOT be reported  (the fix)
 *     B. a covered element that IS clickable          -> must STILL be reported (the bar)
 *
 * If B ever stops failing, the structural check has been gutted and this says so.
 *
 * ============================================================================
 *  And the second loosening, 2026-09-14: a narration bubble over a sail square
 * ============================================================================
 * Wyatt ruled a narration bubble over a sail square "NOT a problem ... That message disappears after a few seconds and can be tapped
 * to dismiss" and asked that the sea trial stop flagging it. checks.mjs now exempts exactly that. The same two halves, against the
 * REAL MEASURE and structuralChecks from checks.mjs rather than a copy:
 *
 *     D. a sail square under a narration bubble        -> sail-clickable and not-occluded PASS  (his ruling)
 *     E. a sail square under anything else (a lid)     -> both still FAIL                        (the bar)
 *
 * ============================================================================
 *  And the third, 2026-09-17: no-cover-ask now asks WHICH OF THE TWO IS ON TOP
 * ============================================================================
 * Rule 6b fired on any rect-vs-rect overlap between a control and the prompt's own words, with no
 * paint test and no hit test, and named the control as the culprit by assumption. On six legs of
 * the Tier-1 trial (commit 8495d101) that read "sailCell over '<captain>: tap to sail'" — backwards:
 * #pp4Prompt is z-index 30 and #sailHost is z-index 2, so the cream bubble PAINTS OVER the gold
 * square (14-79% of it, median 70%), and the square stays fully tappable because the radial prompt
 * is pointer-events:none — 40 of 40 probe points returned div.sailCell, 4 of 4 real taps sailed the
 * boat from inside the words' rect, 4 of 4 drags separated them.
 *
 * Wyatt's rule, the fence in docs/INTENDED-BEHAVIOUR.md §0, verbatim: "the failing rule is 'unless
 * it hides a button that the player cannot access by either waiting for 0.5 seconds or shifting the
 * screen themselves (eg. dragging the board)'".
 *
 *     F. a button painted over the question's words    -> no-cover-ask still FAILS               (the bar)
 *     G. the measured real case: the words painted over a still-tappable sail square -> PASSES   (his rule)
 */
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import { killProfile } from "../lib/stray_probes.mjs";
import { MEASURE, structuralChecks } from "../lib/checks.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8960 + (process.pid % 40), DBG = 9960 + (process.pid % 40);
/* ⭐ THIS GATE'S OWN PROFILE, AND THE ONE PLACE ITS NAME IS WRITTEN. It used to be spelled inline in
   the launch() call and nowhere else, so nothing at the end of the run could name the folder to
   remove — see dropOwnProfile below. */
const PROFILE = path.join(REPO, `.tmp-pe-${process.pid}`);
const url = serve(PORT);
launch(DBG, PROFILE);

/* ⭐ AND THE FOLDER GOES WITH THE BROWSER — 2026-09-18.
 *
 * MEASURED, not suspected: 64 `.tmp-pe-<pid>` Chrome profiles were standing in the repo root, all
 * but one of them less than a day old. `launch()` wipes its profile on the way IN and `killAll()`
 * only ever ends PROCESSES, so this gate — which is in `npm test` — dropped another ~36 MB folder
 * every single suite run. They are gitignored, so `git status` never showed them and nobody saw.
 *
 * stray_probes' 24-hour sweep is the backstop and it works (it found the one old folder); it simply
 * cannot keep up with a leak that fires several times an hour. A leak is fixed where it is made.
 *
 * KILL FIRST, THEN UNLINK — the order the launchers use. `killProfile` is the only scoped way to be
 * sure nothing still holds this directory (a profile path is an identity; a debug port is not), and
 * on Windows a file another process has open cannot be unlinked at all, which is why the removal
 * retries briefly instead of trying once and giving up. IT NEVER THROWS: a gate that went red
 * because a tidy-up failed would be reporting on the wrong thing entirely.
 *
 * AND IT SAYS WHAT IT DID, on every run, including the boring one — a sweep nobody hears about is a
 * leak nobody fixes (stray_probes.mjs's own rule, 2026-09-15). */
async function dropOwnProfile() {
  try {
    killProfile(PROFILE);
    for (let i = 0; i < 10; i++) {
      if (!fsSync.existsSync(PROFILE)) break;
      try { fsSync.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
      if (!fsSync.existsSync(PROFILE)) break;
      await sleep(100);
    }
    console.log(fsSync.existsSync(PROFILE)
      ? `  [tidy] COULD NOT remove ${path.basename(PROFILE)} — something still holds it; the 24h sweep will take it`
      : `  [tidy] removed this run's profile folder ${path.basename(PROFILE)}`);
  } catch (e) { console.log("  [tidy] profile cleanup failed: " + e.message); }
}

const C = await attach(DBG);
let bad = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { bad++; console.log("  FAIL  " + m); };

/* The exact predicate checks.mjs now uses, applied to a purpose-built page. Reproduced rather than
   imported because checks.mjs is a browser-injected source string, not an importable module — so
   this asserts the RULE, and a drift between the two is caught by the string test at the end. */
const PROBE = `(() => {
  const vis = el => { const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const clickable = el => getComputedStyle(el).pointerEvents !== 'none';
  const out = [];
  for (const el of document.querySelectorAll('.apBtn')) {
    if (!vis(el) || !clickable(el)) continue;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    const top = !!(hit && (hit === el || el.contains(hit) || hit.contains(el)));
    out.push({id: el.id, top, hit: hit ? (hit.id || hit.className || hit.tagName) : null,
              rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]});
  }
  return JSON.stringify(out);
})()`;

/* ⚠ THE FIXTURE IS BUILT INTO A REAL SERVED PAGE, NOT A data: URL. The first version navigated to
   a data: URL and the probe found ZERO buttons — it then reported "the check has been gutted",
   which was a verdict about an empty page. A measurement of nothing is not a measurement. */
const FIXTURE = `(() => {
  document.body.style.margin = '0';
  document.body.innerHTML = \`<div style="position:relative;width:400px;height:300px">
    <button class="apBtn" id="backCard" aria-hidden="true" tabindex="-1"
      style="position:absolute;left:40px;top:20px;width:200px;height:100px;pointer-events:none">back</button>
    <button class="apBtn" id="frontCard"
      style="position:absolute;left:10px;top:20px;width:200px;height:100px">front</button>
    <button class="apBtn" id="buried"
      style="position:absolute;left:10px;top:160px;width:200px;height:100px">buried</button>
    <div id="lid" style="position:absolute;left:10px;top:160px;width:200px;height:100px;background:#000"></div>
  </div>\`;
  return document.querySelectorAll('.apBtn').length;
})()`;

try {
  console.log("POINTER-EVENTS: the structural check's definition of a control\n");
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
  /* ⚠ WAIT FOR THE PAGE, DO NOT GUESS AT IT. This slept a flat 2 s and then evaluated a fixture whose first line is
     `document.body.style.margin` — so under load, on a busy machine, `document.body` was still null and the eval threw
     "Uncaught" at line 1, column 16. That is this gate's whole flake, named by Wy-Blade from the exceptionDetails after it
     fired five times across two branches (RED, GREEN, RED, GREEN, GREEN). A longer sleep would only move the edge. */
  for (let i = 0; i < 40; i++) {
    if (await C.ev(`!!(document.body && document.readyState !== "loading")`).catch(() => false) === true) break;
    await sleep(125);
  }
  const n = await C.ev(FIXTURE);
  n === 3 ? pass(`instrument reached its subject — ${n} buttons built into a real page`)
          : fail(`the fixture did not build (${n} buttons) — everything below is meaningless`);
  await sleep(200);
  const all = JSON.parse(await C.ev(PROBE));
  console.log("  (raw) " + JSON.stringify(all) + "\n");
  const got = all.filter(e => !e.top).map(e => e.id);

  got.includes("backCard")
    ? fail("A: the pointer-events:none card behind is STILL reported — the fix did not take")
    : pass("A: a card behind with pointer-events:none is not counted as an unreachable control");

  got.includes("buried")
    ? pass("B: a genuinely clickable button under an opaque lid IS still reported — the check still bites")
    : fail("B: THE CHECK HAS BEEN GUTTED — a real covered button is no longer reported");

  got.includes("frontCard")
    ? fail("C: the front card is reported covered — its own contents are not pointer-events:none")
    : pass("C: the front card reads as reachable");

  /* AND THE RULE IN checks.mjs MUST BE THE RULE PROVED HERE. Two copies of a predicate is rule 23;
     this asserts the source actually contains the pointer-events filter, so the proof above cannot
     go on passing after somebody removes it. */
  const fs = await import("node:fs");
  const src = fs.readFileSync(path.join(REPO, "scripts/lib/checks.mjs"), "utf8");
  /pointerEvents\s*!==\s*'none'/.test(src) && /\.filter\(vis\)\.filter\(clickable\)/.test(src)
    ? pass("checks.mjs applies the same pointer-events rule this proof exercises")
    : fail("checks.mjs no longer filters on pointer-events — this proof is testing nothing");

  /* D and E — a sail square under a narration bubble passes; under anything else it still fails. Each case is its own page, so one
     rule's verdict cannot be carried by the other square. */
  const SQ = (cover) => `(() => {
    document.body.style.margin = '0';
    document.body.innerHTML = \`<div style="position:relative;width:400px;height:300px">
      <div class="sailCell" id="sq" style="position:absolute;left:30px;top:30px;width:60px;height:60px"></div>
      ${cover}
    </div>\`;
    return document.querySelectorAll('.sailCell').length;
  })()`;
  const rulesFor = async (cover) => {
    const n = await C.ev(SQ(cover));
    await sleep(500);   // past the square's own pop-in, so it is painted when measured
    const m = JSON.parse(await C.ev(`JSON.stringify(${MEASURE})`));
    const out = structuralChecks(m), r = name => out.find(x => x.rule === name) || { ok: null, what: "rule not run" };
    return { n, sail: m.interactive.filter(e => /sailCell/.test(e.tag)).length, sailClickable: r("sail-clickable"), notOccluded: r("not-occluded") };
  };
  const bubble = await rulesFor(`<div class="pp4Bub" style="left:0;top:0;width:220px;height:120px;background:#123"><div class="pp4BubIn">Day 1: Wind NORTH. Tomorrow: WEST.</div></div>`);
  console.log("  (raw D) " + JSON.stringify(bubble));
  bubble.n === 1 && bubble.sail === 1 ? pass("D: the instrument measured the sail square under the bubble")
    : fail(`D: the sail square was not measured (${bubble.sail}) — D and E below are meaningless`);
  bubble.sailClickable.ok && bubble.notOccluded.ok
    ? pass("D: a sail square under a narration bubble is NOT reported (his 2026-09-14 ruling)")
    : fail(`D: a narration bubble over a sail square is STILL reported — ${bubble.sailClickable.what} / ${bubble.notOccluded.what}`);
  const lid = await rulesFor(`<div id="lid" style="position:absolute;left:0;top:0;width:220px;height:120px;background:#000;z-index:30"></div>`);
  console.log("  (raw E) " + JSON.stringify(lid));
  lid.sail === 1 && lid.sailClickable.ok === false && lid.notOccluded.ok === false
    ? pass("E: a sail square under anything else IS still reported by both rules — the check still bites")
    : fail(`E: THE SAIL CHECK HAS BEEN GUTTED — a square under an opaque lid is no longer reported (${JSON.stringify(lid)})`);

  /* F and G — no-cover-ask. Same pattern: one page per case, the REAL MEASURE and the REAL
     structuralChecks, so what is proved here is what the sea trial runs. */
  const askCase = async (html) => {
    await C.ev(`(() => { document.body.style.margin = '0';
      document.body.innerHTML = ${JSON.stringify(html)};
      return document.querySelectorAll('.apMsg').length; })()`);
    await sleep(500);                                  // past the square's own pop-in, so it is painted when measured
    const m = JSON.parse(await C.ev(`JSON.stringify(${MEASURE})`));
    const out = structuralChecks(m);
    return { m, rule: out.find(x => x.rule === "no-cover-ask") || { ok: null, what: "rule not run" },
             occ: out.find(x => x.rule === "not-occluded") || { ok: null },
             sail: out.find(x => x.rule === "sail-clickable") || { ok: null } };
  };

  const WORDS = `<div class="apMsg" id="ask" style="position:absolute;left:20px;top:70px;width:300px;height:44px;background:#fffdf2;border:2px solid #177;font-size:15px">Cap'n Ada: tap to sail</div>`;
  const covered = await askCase(`<div style="position:relative;width:400px;height:400px">${WORDS}
    <button class="apBtn" id="lid" style="position:absolute;left:60px;top:76px;width:180px;height:32px;background:#c33;color:#fff;z-index:5">Sail</button></div>`);
  console.log("  (raw F) " + JSON.stringify({ meet: covered.m.meetings, rule: covered.rule }));
  covered.m.meetings && covered.m.meetings.length === 1 && covered.m.meetings[0].paints === "control"
    ? pass("F: the instrument measured the button as the thing painted on top")
    : fail(`F: the pair was not measured — everything below it is meaningless (${JSON.stringify(covered.m.meetings)})`);
  covered.rule.ok === false && /covers/.test(covered.rule.what) && /Sail/.test(covered.rule.what)
    ? pass("F: a button painted over the question IS still reported, and the message names it — " + covered.rule.what)
    : fail(`F: NO-COVER-ASK HAS BEEN GUTTED — a button drawn on the question is no longer reported (${covered.rule.what})`);

  /* G reproduces the measured stacking exactly: the sail host at z-index 2 inside the board, the
     prompt fixed at z-index 30 and pointer-events:none, the words over the square. */
  const real = await askCase(`<div style="position:relative;width:400px;height:400px">
    <div id="host" style="position:absolute;inset:0;z-index:2;pointer-events:none">
      <div class="sailCell" id="sq" style="position:absolute;left:120px;top:60px;width:64px;height:64px;background:#e8b93a;pointer-events:auto"></div></div>
    <div id="prompt" style="position:fixed;left:0;top:0;width:400px;height:400px;z-index:30;pointer-events:none">${WORDS}</div></div>`);
  console.log("  (raw G) " + JSON.stringify({ meet: real.m.meetings, hits: real.m.interactive.map(e => e.tag + " " + e.hits + "/" + e.hitPts), rule: real.rule }));
  real.m.meetings && real.m.meetings.length === 1 && real.m.meetings[0].paints === "ask" && real.m.interactive.length === 1
    ? pass("G: the instrument measured the pair, and the WORDS are the thing painted on top (z-index 30 over 2)")
    : fail(`G: the pair was not measured — a green verdict below would be vacuous (${JSON.stringify(real.m.meetings)})`);
  real.m.interactive.length === 1 && real.m.interactive[0].hits === real.m.interactive[0].hitPts
    ? pass(`G: the square under the words still answers a tap at every probe point (${real.m.interactive[0].hits}/${real.m.interactive[0].hitPts})`)
    : fail(`G: the square is not reachable in the fixture — it does not reproduce the measured case (${JSON.stringify(real.m.interactive.map(e => e.hits))})`);
  real.rule.ok && /paints over/.test(real.rule.what) && /still tappable/.test(real.rule.what)
    ? pass("G: the bubble over a tappable sail square is NOT reported, and the pass line names what is on top — " + real.rule.what)
    : fail(`G: the measured real case is STILL reported — ${real.rule.what}`);
  real.occ.ok && real.sail.ok
    ? pass("G: not-occluded and sail-clickable are unmoved by this change")
    : fail(`G: another rule changed its answer — not-occluded ${real.occ.ok}, sail-clickable ${real.sail.ok}`);

  /* And the rule proved here must be the rule checks.mjs runs — the same bar as the string test above. */
  const src2 = (await import("node:fs")).readFileSync(path.join(REPO, "scripts/lib/checks.mjs"), "utf8");
  /ask\.style\.pointerEvents = 'auto'/.test(src2) && /meet\.paints === 'control'/.test(src2)
    ? pass("checks.mjs still measures which of the two is painted on top, and rule 6b still reads it")
    : fail("checks.mjs no longer measures paint order for the ask — F and G are testing nothing");

  console.log(bad ? `\nFAILED — ${bad} problem(s)` : "\nPASSED — the fix took, and the check still bites");
  process.exitCode = bad ? 1 : 0;
} catch (e) {
  console.log("PROBE FAILED:", e.message);
  process.exitCode = 1;
} finally {
  /* AWAITED now, where it used to be fired and forgotten: the browser has to be gone before its
     folder can be unlinked on Windows. killProcs() inside it is synchronous either way. */
  await killAll();
  await dropOwnProfile();
}
