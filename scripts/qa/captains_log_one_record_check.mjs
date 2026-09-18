#!/usr/bin/env node
/* WHAT THE CAPTAIN'S LOG HOLDS — one place, and a reload never empties it.
 *
 * Architecture item 50, 2026-09-18. MEASURED FIRST, in two windows (host 1200x950 + guest 375x812
 * dsf3 with touch), both drivers stopped before the reload so everything after it is the reload's
 * doing. Rooms DMXG and GKMR:
 *   · run 1: the host's own captain's log went from 10 rows to 0 the moment it came back, and was
 *     still 0 fifteen seconds later with nobody playing. Run 2: 8 rows to 0, the same.
 *   · the card a player opens is a modal two taps away on a phone (☰ then "📜 Captain's log"), and
 *     after the reload it opened on its own title and NOTHING ELSE — the whole written record of the
 *     voyage so far, gone, for the rest of the voyage.
 *   · the GUEST'S log survived its own reload intact (18 rows -> 18, 16 -> 17). That asymmetry named
 *     the cause: a guest rebuilds its history BY REPLAYING THE FEED THROUGH THE EVENT CONSUMER, and
 *     syncLogLines lived in that consumer. A host rebuilds by fast-forwarding its own engine with
 *     `replaying` true — which liveRender refuses to drain — so not one rebuilt event was described.
 *   · and when play resumed the rows did not come back on their own: run 1 ended holding 6 rows of
 *     the 18 lines its own logLines array by then held, because the box's paint cursor had been left
 *     at the frontier and only ever appended the newest row. Run 2 happened to catch the rebuild
 *     branch and came back in full. The same voyage, two different logs, depending on timing.
 *
 * THE FACT: which of the voyage's events have a written line in the captain's log.
 * It was decided in four places:
 *   - src/ui/util.js       syncLogLines  the derivation — describe everything not yet described;
 *   - src/orchestrator.js  consumeEvent  its ONLY caller, so the log held only what this screen WATCHED;
 *   - src/ui/flow.js       endReplay     `evConsumed = events.length`, which declares the rebuilt
 *                                        history consumed so the caller above never sees it;
 *   - src/orchestrator.js  beginGame     `appState.logLines=[]`, a third opinion, on the one line a
 *                                        RESUMING host runs too.
 * ONE PLACE NOW: syncLogLines reads the record off `game.events` — which every screen holds in full
 * however it came by them — knows which voyage it is describing, and is called by renderLog, the one
 * function that DRAWS the log. The log is filled by the act of showing it. endReplay's evConsumed is
 * untouched and still decides what this screen has ANIMATED; it decides nothing about the record.
 *
 * Every rule is a pure function of the source text (rule 5 compiles the real source and RUNS it), so the
 * same functions run against deliberately broken copies below — a gate that cannot fail proves nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);

const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code
const tight = s => code(s).replace(/\s+/g, "");                                                   // layout never counts either

/* A function's body, from its head to its closing brace. Skips the parameter list first. */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
/* which function an offset sits in: the nearest `function NAME(` above it */
function enclosing(src, at) {
  const heads = [...src.slice(0, at).matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)];
  return heads.length ? heads[heads.length - 1][1] : "(top level)";
}

/* ---------- the fake card, so the real renderLog can be run against it ---------- */
function mkEl(cls, html) {
  const e = { className: cls, innerHTML: html };
  e.classList = {
    remove(c) { e.className = e.className.split(/\s+/).filter(x => x && x !== c).join(" "); },
    add(c) { e.className += " " + c; },
    contains(c) { return e.className.split(/\s+/).includes(c); },
  };
  return e;
}
function mkBox() {
  return {
    children: [], _html: "", scrollHeight: 0, scrollTop: 0, clientHeight: 0,
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v;
      this.children = v ? [...v.matchAll(/<div class="([^"]*)">([\s\S]*?)<\/div>/g)].map(m => mkEl(m[1], m[2])) : [];
    },
    appendChild(d) { this.children.push(d); this._html += `<div class="${d.className}">${d.innerHTML}</div>`; },
    querySelector(sel) {
      const want = sel.split(".").filter(Boolean);
      return this.children.find(c => want.every(w => c.className.split(/\s+/).includes(w))) || null;
    },
  };
}

function rules(files) {
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const util = files["src/ui/util.js"] || "", board = files["src/ui/board.js"] || "", orch = files["src/orchestrator.js"] || "";
  const syncSrc = body(util, "export function syncLogLines(");
  const renderSrc = body(board, "export function renderLog(");

  /* 1. THE ONE PLACE IT IS BUILT, AND IT IS WHERE IT IS DRAWN.
        Exactly one call site across src/, it is renderLog, and it stands before the first paint —
        a fill that runs after the rows are written is a fill nobody sees this tick. */
  const callSites = Object.entries(files).flatMap(([f, s]) => {
    const c = code(s);
    return [...c.matchAll(/syncLogLines\s*\(/g)]
      .filter(m => !/function\s+$/.test(c.slice(Math.max(0, m.index - 14), m.index)))
      .map(m => `${f}:${enclosing(c, m.index)}`);
  });
  const rTight = tight(renderSrc);
  const fillAt = rTight.indexOf("syncLogLines()");
  const paintAt = Math.min(...["box.innerHTML=html", "box.appendChild("].map(s => { const i = rTight.indexOf(s); return i < 0 ? Infinity : i; }));
  rule(callSites.length === 1 && callSites[0] === "src/ui/board.js:renderLog" && fillAt >= 0 && fillAt < paintAt,
    "the captain's log is built in exactly one place and it is where it is drawn — src/ui/board.js renderLog, before it paints a row",
    callSites.length !== 1 ? `syncLogLines() is called from ${callSites.length} place(s) [${callSites.join(", ") || "none"}] — a record built from only what one screen watched go by cannot survive that screen rebuilding its history`
      : callSites[0] !== "src/ui/board.js:renderLog" ? `the log is built in ${callSites[0]} instead of where it is drawn — a reloading host rebuilds its history without that function ever running, and opens its log on an empty card`
        : "renderLog paints before it fills — the rows it draws are last tick's");

  /* 2. AND NOT BY THE EVENT CONSUMER. Stated on its own, because that is where it used to live and
        where the instinct is to put it back: the log is not a REACTION to an event. */
  const consumer = code(body(orch, "export async function consumeEvent("));
  rule(!!consumer && !/syncLogLines\s*\(/.test(consumer),
    "the event consumer does not build the captain's log — the record is read from game.events, so every screen holds it however it came by its history",
    !consumer ? "consumeEvent() does not exist in src/orchestrator.js"
      : "consumeEvent() builds the captain's log again — that is the shape that emptied a reloading host's own log (10 rows -> 0, measured twice)");

  /* 3. A CENSUS: nothing outside syncLogLines touches the record. An outside `logLines=[]` is a
        second opinion about what the log holds, and beginGame's ran on a RESUME too. */
  const writes = Object.entries(files).flatMap(([f, s]) => {
    const c = code(s);
    return [...c.matchAll(/appState\.logLines\s*(?:=(?!=)|\.length\s*=|\.push\s*\(|\.splice\s*\(|\.pop\s*\(|\.shift\s*\(|\.unshift\s*\()/g)]
      .map(m => [f, enclosing(c, m.index)]);
  });
  const stray = writes.filter(([f, fn]) => !(f === "src/ui/util.js" && fn === "syncLogLines"));
  rule(writes.length > 0 && stray.length === 0,
    "nothing outside syncLogLines writes the captain's log — no caller has to remember to empty it",
    writes.length === 0 ? "nothing writes appState.logLines at all — the log can never hold anything"
      : `the log is also written in ${stray.map(x => x.join(":")).join(", ")} — beginGame's copy of this ran on a resuming host too, and emptied the voyage's record`);

  /* 4. IT KNOWS WHICH VOYAGE IT IS DESCRIBING — the invariant that let beginGame's reset be deleted
        rather than left standing beside it. Cleared BEFORE the fill, and the answer handed back. */
  const sTight = tight(syncSrc);
  const iClear = sTight.indexOf("appState.logLines.length=0"), iFill = sTight.indexOf("for(leti=appState.logLines.length");
  rule(/loggedVoyage!==appState\.game/.test(sTight) && iClear >= 0 && iFill >= 0 && iClear < iFill && /returnfresh/.test(sTight),
    "syncLogLines knows which voyage it is describing — it starts the record over when the voyage under it changes, before it fills, and hands that answer back",
    !/loggedVoyage!==appState\.game/.test(sTight) ? "syncLogLines no longer tests which voyage it is describing — a second voyage in one page would keep the last one's lines, which is exactly what beginGame's deleted reset was there for"
      : iClear < 0 || iFill < 0 ? "syncLogLines no longer clears or no longer fills — one half of the record is missing"
        : iClear > iFill ? "syncLogLines clears the record AFTER filling it — the new voyage's lines are thrown away"
          : "syncLogLines does not hand back whether it started over — the box cannot know to drop the rows it painted for the last voyage");

  /* 5. THE PAINT CURSOR IS THE BOX'S OWN, AND IT FOLLOWS THAT ONE ANSWER. No export hands it out
        (resetBoardLog was beginGame's way in), and renderLog drops the last voyage's rows on it. */
  const cursorWriters = Object.entries(files).flatMap(([f, s]) => {
    const c = code(s);
    return [...c.matchAll(/\blogRenderedTo\s*=(?!=)/g)].map(() => f);
  });
  const outside = [...new Set(cursorWriters.filter(f => f !== "src/ui/board.js"))];
  const dropsRows = /if\(syncLogLines\(\)\)\{box\.innerHTML="";logRenderedTo=-\d+;\}/.test(rTight);
  rule(outside.length === 0 && !/export\s+function\s+resetBoardLog\b/.test(code(board)) && dropsRows,
    "the box's paint cursor belongs to board.js alone, and the rows painted for a voyage go when that voyage does",
    outside.length ? `the paint cursor is written outside board.js (${outside.join(", ")}) — a second hand on what has been painted`
      : /export\s+function\s+resetBoardLog\b/.test(code(board)) ? "resetBoardLog is exported again — that accessor existed only so beginGame could reset the log, and beginGame no longer decides anything about it"
        : "renderLog does not drop the painted rows when syncLogLines says the voyage changed — the box would show the last voyage's log over the new one's");

  /* 6. BEHAVIOURAL — the real syncLogLines and the real renderLog, run through a real host reload */
  let ok6 = false, why6 = "the harness could not be built";
  const voyDecl = (util.match(/let\s+loggedVoyage\s*=[^;]*;/) || [""])[0];
  const curDecl = (board.match(/let\s+logRenderedTo\s*=[^;]*;/) || [""])[0];
  if (syncSrc && renderSrc && curDecl) {
    try {
      /* the consumer's own behaviour is read from the source too, so the pre-item-50 shape —
         the log built by the consumer, not by the renderer — poses exactly as it really ran */
      const consumerSyncs = /syncLogLines\s*\(/.test(consumer);
      const describeFor = e => (e && e.say) ? { cls: "log", txt: e.say } : null;
      const EV = (n, from = 0) => Array.from({ length: n }, (_, k) => ({ i: from + k, say: ((from + k) % 4 === 3) ? null : "line " + (from + k) }));
      const newPage = st => {
        const box = mkBox();
        const sync = new Function("appState", "describeFor", "NEUTRAL_VIEWER",
          voyDecl + "\n" + syncSrc.replace("export function", "function") + "\nreturn syncLogLines;")(st, describeFor, -1);
        const render = new Function("$", "appState", "syncLogLines", "document",
          curDecl + "\n" + renderSrc.replace("export function", "function") + "\nreturn renderLog;")(
            () => box, st, sync, { createElement: () => mkEl("", "") });
        return { box, sync, render };
      };

      /* (a) A LIVE VOYAGE: forty events drawn one at a time, the way any screen draws them */
      const all = EV(40);
      const drawable = all.filter(e => e.say).length;                       // 30
      const st1 = { logLines: [], game: { events: [] }, evIdx: 0 };
      const P1 = newPage(st1);
      for (const e of all) {
        st1.game.events.push(e); st1.evIdx = st1.game.events.length - 1;
        if (consumerSyncs) P1.sync();
        P1.render();
      }
      const liveRows = P1.box.children.length;

      /* (b) THE RELOAD. A brand-new page rebuilds the SAME voyage into a new engine with `replaying`
             true — so the drain refuses and the consumer never runs for one of them — and endReplay
             draws the board once. This is the measured moment: 10 rows -> 0. */
      const st2 = { logLines: [], game: { events: [] }, evIdx: 0 };
      const P2 = newPage(st2);
      for (const e of all) st2.game.events.push(e);                          // rebuilt silently
      st2.evIdx = st2.game.events.length - 1;
      P2.render();                                                           // endReplay's one renderBoard()
      const afterReload = P2.box.children.length;

      /* (c) AND PLAY RESUMES: three more events. The box must hold the whole voyage, not just the tail —
             run 1 ended holding 6 rows of the 18 its own array held. */
      for (const e of EV(3, 40)) {
        st2.game.events.push(e); st2.evIdx = st2.game.events.length - 1;
        if (consumerSyncs) P2.sync();
        P2.render();
      }
      const afterPlay = P2.box.children.length;
      const held = st2.logLines.filter(Boolean).length;
      const firstRow = P2.box.children[0] ? P2.box.children[0].innerHTML : null;

      /* (d) AND IF THE VOYAGE UNDER IT IS REPLACED — what beginGame used to do by hand */
      st2.game = { events: EV(5) }; st2.evIdx = 0;
      P2.render();
      const afterNewVoyage = P2.box.children.length;

      ok6 = liveRows === drawable && afterReload === drawable && afterPlay === drawable + 3
        && held === afterPlay && firstRow === "line 0" && afterNewVoyage === 1;
      why6 = `a ${all.length}-event voyage drew ${liveRows}/${drawable} rows live; after the reload the log held ${afterReload}/${drawable}; after three more events ${afterPlay} rows against ${held} line(s) the log itself holds, first row ${JSON.stringify(firstRow)}; a replaced voyage left ${afterNewVoyage} row(s)`;
    } catch (e) { why6 = "the harness threw: " + e.message; }
  }
  rule(ok6,
    "posed, on the real source: a host reloads mid-voyage, rebuilds every event without the consumer ever running, and its captain's log still holds the whole voyage from Day 1 — then grows with play, never disagreeing with the record behind it, and starts over when the voyage does",
    `${why6} — the reload emptying the log is what was measured in rooms DMXG and GKMR`);

  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy broken the way it guards against. */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const CONSUMER_ANCHOR = "  /* AUDIO-01/D-07: the per-event sound moment, every tier";
const RENDER_FILL = `  if(syncLogLines()){box.innerHTML="";logRenderedTo=-2;}\n`;
const MUTANTS = [
  ["the whole pre-item-50 shape: the log built by the consumer, never by the renderer",
    (() => {
      const f = broken("src/ui/board.js", RENDER_FILL, "");
      if (!f) return null;
      const g = { ...f };
      if (!g["src/orchestrator.js"].includes(CONSUMER_ANCHOR)) return null;
      g["src/orchestrator.js"] = g["src/orchestrator.js"].replace(CONSUMER_ANCHOR, "  syncLogLines();\n" + CONSUMER_ANCHOR);
      return g;
    })(), 5],
  ["the consumer building it again beside the renderer",
    broken("src/orchestrator.js", CONSUMER_ANCHOR, "  syncLogLines();\n" + CONSUMER_ANCHOR), 1],
  ["renderLog no longer filling the log it draws",
    broken("src/ui/board.js", RENDER_FILL, ""), 0],
  ["renderLog filling it AFTER it has painted the rows — this tick draws last tick's record",
    (() => {
      const f = broken("src/ui/board.js", RENDER_FILL, "");
      if (!f || !f["src/ui/board.js"].includes("  logRenderedTo=appState.evIdx;")) return null;
      const g = { ...f };
      g["src/ui/board.js"] = g["src/ui/board.js"].replace("  logRenderedTo=appState.evIdx;", RENDER_FILL + "  logRenderedTo=appState.evIdx;");
      return g;
    })(), 0],
  ["beginGame emptying the captain's log again (the line a resuming host ran too)",
    broken("src/orchestrator.js", "  $(\"chatLog\").innerHTML=\"\";clearChatBubbles();", "  appState.logLines=[];\n  $(\"chatLog\").innerHTML=\"\";clearChatBubbles();"), 2],
  ["syncLogLines forgetting which voyage it is describing",
    broken("src/ui/util.js", "  const fresh=loggedVoyage!==appState.game;", "  const fresh=false;"), 3],
  ["renderLog ignoring the answer — the last voyage's rows left standing",
    broken("src/ui/board.js", RENDER_FILL, "  syncLogLines();\n"), 4],
  ["resetBoardLog handed back out, so beginGame can reach the paint cursor again",
    broken("src/ui/board.js", "export function renderLog(){", "export function resetBoardLog(v){logRenderedTo=v;}\nexport function renderLog(){"), 4],
  ["a second place building the log beside the renderer",
    broken("src/ui/panel.js", "export function liveRender(){", "export function liveRender(){\n  syncLogLines();"), 0],
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
  : `\nPASS — the captain's log holds the whole voyage, on every screen, however that screen came by its history; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
