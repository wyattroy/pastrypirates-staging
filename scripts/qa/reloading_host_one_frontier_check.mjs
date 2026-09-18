#!/usr/bin/env node
/* WHICH RECORDS THE CREW HAS ALREADY SEEN — one place, and a reloading host never tells them twice.
 *
 * Architecture item 47, 2026-09-18. MEASURED FIRST, in two windows (host 1200x950 + guest 375x812 dsf3,
 * room YGMF): a host that reloaded on day 2 of a thirty-six-record voyage put ALL THIRTY-SIX RECORDS BACK
 * ON THE WIRE — every serial from n0 to n35 a second time, every copy byte-identical to its original. The
 * guest's own feed went from 35 records to 72 for a 36-event voyage; its captain's log grew from 8 rows to
 * 18 as the whole voyage was told again (Day 1's wind, the beluga, the docks, the trade), and three coins
 * flew across the board a second time. The engine came out RIGHT on both screens — same four squares, same
 * four purses — so the crew were not sent a wrong voyage, they were sent the same one twice.
 *
 * THE FACT: which records the crew has already seen — the number a reloading host starts numbering from.
 * It was decided in two places that disagreed, and the wrong one ran first:
 *   - src/orchestrator.js beginGame  said 0        — on the unconditional reset line, so a RESUMED host
 *                                                    announced "the crew have seen nothing" before it had
 *                                                    rebuilt a single event;
 *   - src/ui/flow.js     endReplay   said resumeEvLen — right, but only after the replay had finished, and
 *                                                    the replay's own publishNow() calls run throughout it.
 * And the publisher obeyed whichever number it was handed: liveRender (src/ui/panel.js) does test
 * `appState.replaying`, but publishNow (src/ui/flow.js) — the other publish path — did not.
 *
 * ONE PLACE NOW: resumeHostGame sets the frontier the moment it reads the feed's own length, and pushEvents
 * refuses to publish at all while this screen is rebuilding its own history. endReplay's copy is deleted.
 *
 * Every rule is a pure function of the source text (rule 5 compiles the real source and RUNS it), so the same
 * functions run against deliberately broken copies below — a gate that cannot fail proves nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);

const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code

/* A function's body, from its head to its closing brace. Skips the parameter list first. */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const inner = b => b.slice(b.indexOf("{") + 1, b.lastIndexOf("}"));
/* which function an offset sits in: the nearest `function NAME(` above it */
function enclosing(src, at) {
  const heads = [...src.slice(0, at).matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)];
  return heads.length ? heads[heads.length - 1][1] : "(top level)";
}

/* THE ONLY FOUR PLACES ALLOWED TO WRITE THE FRONTIER, and what each one is for. A fifth is the fault.
   wireRestoreFail is NOT a copy of the rule: it answers a different question — what a player who chose
   "Resume anyway" from a knowingly-incomplete voyage is numbering from — and deliberately uses the REBUILT
   length rather than the feed's, which is BUG-04's own ruling (`5e29eab9`). It is pinned here so nobody
   tidies it away and so nobody mistakes it for a second opinion about what the crew has seen. */
const ALLOWED = [
  ["src/orchestrator.js", "resumeHostGame", "the feed's own length, read the one moment any screen learns it"],
  ["src/orchestrator.js", "beginGame", "a FRESH voyage's reset to 0 — and only a fresh one"],
  ["src/orchestrator.js", "pushEvents", "the publisher's own advance, one per record it sends"],
  ["src/ui/flow.js", "wireRestoreFail", "BUG-04's named exception: the player chose to carry on from what was actually rebuilt"],
];

function rules(files) {
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const orch = code(files["src/orchestrator.js"] || "");
  const flow = code(files["src/ui/flow.js"] || "");
  const push = body(orch, "export function pushEvents(");
  const begin = body(orch, "export function beginGame(cfg,seed){");
  const resume = body(orch, "export async function resumeHostGame(r){");

  // 1. THE PUBLISHER REFUSES WHILE THIS SCREEN IS REBUILDING ITS OWN HISTORY — and the rule lives on it
  const guardAt = push.search(/if\s*\(\s*appState\.replaying\s*\)\s*return\s*;/);
  const loopAt = push.search(/while\s*\(\s*appState\.evPushed\s*<\s*appState\.game\.events\.length\s*\)/);
  rule(guardAt >= 0 && loopAt >= 0 && guardAt < loopAt,
    "pushEvents refuses to publish while this screen is rebuilding its own history — the rule sits on the publisher, before the loop, so publishNow reaches it too",
    guardAt < 0 ? "pushEvents has no `if(appState.replaying)return;` — a reload-replay's publishNow() calls put the whole rebuilt history back on the wire"
      : "pushEvents tests appState.replaying only AFTER its send loop — the records are already gone");

  // 2. THE FRONTIER IS SET FROM THE FEED IN EXACTLY ONE PLACE, AND IT IS resumeHostGame
  const fromFeed = [...Object.entries(files)].flatMap(([f, s]) => {
    const c = code(s);
    return [...c.matchAll(/appState\.evPushed\s*=\s*appState\.resumeEvLen/g)].map(m => `${f}:${enclosing(c, m.index)}`);
  });
  rule(fromFeed.length === 1 && fromFeed[0] === "src/orchestrator.js:resumeHostGame",
    "the frontier is set from the crew's own feed in exactly one place — resumeHostGame, beside the read it comes from, before the replay starts",
    `the feed's length is written onto the frontier in ${fromFeed.length} place(s) [${fromFeed.join(", ") || "none"}] — endReplay's copy said the right thing one step too late, after the replay had already published`);

  // 3. A FRESH VOYAGE'S RESET NEVER RUNS ON A RESUME
  const resetLine = (begin.match(/appState\.live=true;[^\n]*/) || [])[0] || "";
  const freshBlock = (begin.match(/if\(!appState\.replaying\)\{[^}]*\}/) || [])[0] || "";
  rule(!!freshBlock && /appState\.evPushed\s*=\s*0/.test(freshBlock) && !/appState\.evPushed/.test(resetLine),
    "beginGame zeroes the frontier only inside its fresh-start block — a resumed voyage is never told the crew has seen nothing",
    !freshBlock ? "beginGame's `if(!appState.replaying){...}` fresh-start block is gone"
      : /appState\.evPushed/.test(resetLine) ? "beginGame zeroes appState.evPushed on its unconditional reset line — that zero is what the whole rebuilt voyage then goes out from"
        : "beginGame's fresh-start block does not reset the frontier — a second voyage in one page load would start behind the last one's feed");

  // 4. A CENSUS: nobody else writes the frontier at all
  const writes = Object.entries(files).flatMap(([f, s]) => {
    const c = code(s);
    return [...c.matchAll(/appState\.evPushed\s*(?:\+\+|--|\+=|=(?!=))/g)].map(m => [f, enclosing(c, m.index)]);
  });
  const stray = writes.filter(([f, fn]) => !ALLOWED.some(a => a[0] === f && a[1] === fn));
  const missing = ALLOWED.filter(a => !writes.some(([f, fn]) => f === a[0] && fn === a[1]));
  rule(stray.length === 0 && missing.length === 0,
    `the frontier is written in exactly the four places that own it (${ALLOWED.map(a => a[1]).join(", ")}) and nowhere else`,
    stray.length ? `a fifth place writes the frontier: ${stray.map(x => x.join(":")).join(", ")} — that is a second opinion about what the crew has seen`
      : `a place that must own the frontier no longer writes it: ${missing.map(a => `${a[0]}:${a[1]} (${a[2]})`).join(", ")}`);

  // 5. BEHAVIOURAL — the real source, run through a real host reload
  let ok5 = false, why5 = "the harness could not be built";
  const resumeStmts = (code(resume).match(/appState\.resumeEvLen\s*=[^;]+;(?:\s*appState\.evPushed\s*=[^;]+;)?/) || [])[0] || "";
  if (push && resetLine && resumeStmts) {
    try {
      const pushFn = new Function("appState", "netPushEvent", "netFail", inner(push));
      const beginFn = new Function("appState", resetLine + "\n" + freshBlock);
      const resumeFn = new Function("appState", "evval", resumeStmts);
      const feed = [];                                   // the room's ev node, as the crew receives it
      const netPushEvent = (db, room, wire) => feed.push(wire);
      const netFail = () => () => { };
      const fresh = () => ({ isHost: true, db: {}, room: "ROOM", replaying: false, evPushed: 0, evConsumed: 0, evIdx: 0, resumeEvLen: 0, game: { events: [] } });

      /* (a) a live voyage: thirty-six events, thirty-six records */
      const live = fresh();
      beginFn(live);
      for (let i = 0; i < 36; i++) { live.game.events.push({ t: "turn", i }); pushFn(live, netPushEvent, netFail); }
      const afterLive = feed.length;

      /* (b) THE RELOAD. A brand-new page: resumeHostGame reads the feed, then beginGame, then the replay
             rebuilds the voyage — and three events PAST the old frontier, which a dlog legitimately holds.
             publishNow() is called after every one of them, exactly as the fast-forward does. */
      const evval = Object.fromEntries(feed.map((e, i) => ["k" + i, e]));
      const back = fresh();
      resumeFn(back, evval);
      back.replaying = true;                              // resumeHostGame sets this before beginGame
      beginFn(back);
      for (let i = 0; i < 39; i++) { back.game.events.push({ t: "turn", i }); pushFn(back, netPushEvent, netFail); }
      const duringReplay = feed.length - afterLive;

      /* (c) the replay ends and the host is live again (endReplay -> liveRender -> pushEvents) */
      back.replaying = false;
      pushFn(back, netPushEvent, netFail);
      const afterEnd = feed.length - afterLive;

      const serials = feed.map(e => e.n);
      const twice = serials.filter((n, i) => serials.indexOf(n) !== i);
      ok5 = afterLive === 36
        && duringReplay === 0
        && afterEnd === 3
        && feed.slice(36).map(e => e.n).join(",") === "36,37,38"
        && twice.length === 0;
      why5 = `the live voyage put ${afterLive} record(s) on the wire; the reload's replay put ${duringReplay} on while rebuilding and ${afterEnd} once it was live (serials ${feed.slice(36).map(e => e.n).join(",") || "none"}); ${twice.length} serial(s) arrived twice${twice.length ? " [" + [...new Set(twice)].slice(0, 8).join(",") + (twice.length > 8 ? ",…" : "") + "]" : ""}`;
    } catch (e) { why5 = "the harness threw: " + e.message; }
  }
  rule(ok5,
    "posed, on the real source: a host reloads mid-voyage, rebuilds all 36 of the crew's records and 3 more — nothing goes on the wire while it is rebuilding, exactly the 3 new ones go out when it is live again, numbered 36-38, and no serial is ever sent twice",
    `${why5} — this is the thirty-six duplicate serials measured in room YGMF`);

  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy broken the way it guards against. */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const MUTANTS = [
  ["the publisher's replaying guard removed (the state this item found)",
    broken("src/orchestrator.js", "  if(appState.replaying)return;\n  while(appState.evPushed<", "  while(appState.evPushed<"), 0],
  ["a replaying host publishing after its loop instead of before it",
    broken("src/orchestrator.js", "  if(appState.replaying)return;\n  while(appState.evPushed<", "  while(appState.evPushed<"), 4],
  ["endReplay setting the frontier again, one step too late",
    broken("src/ui/flow.js", "  // The resumed host is live again: re-arm the full host-gone kit",
      "  appState.evPushed=appState.resumeEvLen;\n  // The resumed host is live again: re-arm the full host-gone kit"), 1],
  ["resumeHostGame no longer saying what the crew's feed holds",
    broken("src/orchestrator.js", "  appState.evPushed=appState.resumeEvLen;\n", "\n"), 1],
  ["beginGame zeroing the frontier on a resume again (the lie the whole voyage went out from)",
    broken("src/orchestrator.js", "appState.live=true;appState.liveDone=false;appState.evIdx=0;",
      "appState.live=true;appState.liveDone=false;appState.evIdx=0;appState.evPushed=0;"), 2],
  ["a fifth place writing the frontier",
    broken("src/ui/panel.js", "export function liveRender(){", "export function liveRender(){\n  if(appState.evPushed<0)appState.evPushed=0;"), 3],
  ["BUG-04's named exception quietly tidied away",
    broken("src/ui/flow.js", "    appState.evPushed=appState.game.events.length;", "    "), 3],
  ["the whole pre-item-47 shape: no guard, and the frontier zeroed on a resume",
    (() => { const f = broken("src/orchestrator.js", "  if(appState.replaying)return;\n  while(appState.evPushed<", "  while(appState.evPushed<"); if (!f) return null; const g = { ...f }; g["src/orchestrator.js"] = g["src/orchestrator.js"].replace("appState.live=true;appState.liveDone=false;appState.evIdx=0;", "appState.live=true;appState.liveDone=false;appState.evIdx=0;appState.evPushed=0;"); return g; })(), 4],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && res[idx] && !res[idx].ok;          // the rule that guards against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — a reloading host tells the crew only what they have not seen; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
