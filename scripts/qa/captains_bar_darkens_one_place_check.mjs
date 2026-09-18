#!/usr/bin/env node
/* THE CAPTAINS BAR GOES DARK UNDER A MODAL IN ONE PLACE — AND COMES BACK BY ITSELF.
 *
 *   node scripts/qa/captains_bar_darkens_one_place_check.mjs
 *
 * THE FACT, in the game's words: while a card is up over the stage, the CAPTAINS bar stops reading
 * through it; when the card closes, the bar is there again, in the same box it was in.
 *
 * WHO DECIDES IT TODAY — three named places, one per question, which is why this is a gate and not
 * a fix:
 *   `index.html`                  body.pp4Stage.pp4ModalOpen #pp4Cap { visibility:hidden; }
 *                                   — the ONE rule that darkens the bar for a modal
 *   `src/orchestrator.js`         syncModalOpenClass() — the ONE writer of `pp4ModalOpen`, and it
 *                                   ASKS THE DOM ("is any .modalOverlay displayed?") instead of
 *                                   being told by each opener. A modal added tomorrow is covered
 *                                   the moment it exists; one deleted stops counting on its own.
 *   `src/ui/stage.js`             capEmptyTick() — the ONE hand that writes the bar's own inline
 *                                   visibility, for a DIFFERENT fact (below).
 *
 * ⚠ THE BAR HAS A SECOND, LEGITIMATE REASON TO BE DARK, AND IT IS THE REASON THIS GATE EXISTS.
 * Wyatt, 2026-09-09: "for this whole section of the pre-game where the captain's box is empty,
 * hide it ... make it appear after the recipe has been selected." `capEmptyTick()` does that with
 * an INLINE `visibility:hidden` until the recipe draft resolves. So a screen posed BEFORE the draft
 * shows a dark bar with no modal anywhere near it — which is exactly what fooled
 * `t142_captains_under_modal_check.mjs` into reporting, on all three of its seats, that "the
 * CAPTAINS bar did NOT come back after the modal closed". It had never come ON. (Measured
 * 2026-09-18, architecture item 53: posed the gate's own staging condition with NO modal opened at
 * all — computed AND inline visibility were already `hidden`. Its `--after` pictures and the
 * geometry it reports about the scrim are still sound; only its tail assertion was aimed at the
 * wrong rule. It is archived at scripts/qa/gate_archive/ and the paragraph above is why.)
 *
 * THE TWO WRITES COMPOSE, AND THAT IS A PROPERTY, NOT A COINCIDENCE: the inline hand clears itself
 * to the EMPTY STRING, never to `"visible"`. An inline `visible` out-ranks every stylesheet rule,
 * so the day somebody "helpfully" writes it, the bar reads straight through every modal in the game
 * and the original T-142 bug is back. Rule 3 is that sentence, as an assertion.
 *
 * RULES (each red-proofed below against a mutant built in memory from the real source):
 *   1. ONE css rule darkens the bar for an open modal, and it darkens by `visibility`, never
 *      `display` — the bar's rect is read while modals are open, so the box must stay put.
 *   2. ONE place writes `pp4ModalOpen`, and it derives the answer from the DOM.
 *   3. ONE hand writes the bar's own inline visibility, and its un-hide value is `""`.
 *   4. The only other hand that touches the bar's style — the off-screen width measurement — SAVES
 *      AND RESTORES it. A measurement that forgot to put the style back is a CAPTAINS bar a player
 *      loses for the rest of the voyage, and it would look exactly like a modal that never let go.
 *
 * NO GAME CODE IS TOUCHED BY THIS FILE.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
/* comments out first, always — a rule that matches a comment is a rule that guards prose */
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const stripHtml = s => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/* the balanced body of a named function, so a rule about capEmptyTick cannot be satisfied by a
   line somewhere else in the same file */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}

/* EVERY HAND THAT WRITES THE BAR'S OWN STYLE. An assignment to `.style.visibility` or
   `.style.cssText` counts only when the variable it writes was bound to #pp4Cap just above it —
   so this finds the captains bar's writers and not the forty other boxes with a visibility.
   `=(?!=)` because `cap.style.visibility==="hidden"` is a READ (src/ui/board.js capShowing), and
   the first draft of this scan counted it as a third writer. */
function capStyleWriters(files) {
  const out = [];
  for (const [f, raw] of Object.entries(files)) {
    if (!f.endsWith(".js")) continue;
    const s = stripJs(raw);
    for (const m of s.matchAll(/(\w+)\.style\.(visibility|cssText)\s*=(?!=)/g)) {
      const v = m[1], before = s.slice(Math.max(0, m.index - 1500), m.index);
      if (new RegExp(`(?:const|let|var)\\s+${v}\\s*=[^;\\n]*(?:\\$\\("pp4Cap"\\)|getElementById\\("pp4Cap"\\))`).test(before))
        out.push({ file: f, kind: m[2], line: s.slice(m.index, m.index + 120).split("\n")[0].trim() });
    }
  }
  return out;
}

function rules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const html = stripHtml(files["index.html"]);
  const js = Object.fromEntries(Object.entries(files).filter(([f]) => f.endsWith(".js")));

  /* 1 — one rule, and it darkens by visibility */
  const modalRules = [...html.matchAll(/([^{}@;]*pp4ModalOpen[^{}@;]*)\{([^{}]*)\}/g)]
    .map(m => ({ sel: m[1].trim().replace(/\s+/g, " "), decl: m[2].trim().replace(/\s+/g, " ") }));
  const one = modalRules.length === 1 ? modalRules[0] : null;
  rule(!!one && /#pp4Cap/.test(one.sel) && /visibility\s*:\s*hidden/.test(one.decl) && !/display\s*:/.test(one.decl),
    "one css rule darkens the CAPTAINS bar while a modal is up, and it darkens by `visibility` so the bar's box stays exactly where it was",
    `${modalRules.length} css rule(s) key off pp4ModalOpen` +
    (one ? ` — \`${one.sel} { ${one.decl} }\` is not a single visibility:hidden on #pp4Cap` : `, not one`));

  /* 2 — one place decides "a modal is up", and it asks the DOM */
  const writes = Object.entries(js).flatMap(([f, s]) =>
    [...stripJs(s).matchAll(/classList\.(toggle|add|remove)\(\s*"pp4ModalOpen"/g)].map(m => ({ f, how: m[1] })));
  const sync = body(stripJs(js["src/orchestrator.js"] || ""), "const syncModalOpenClass=");
  rule(writes.length === 1 && writes[0].how === "toggle"
    && /querySelectorAll\("\.modalOverlay"\)/.test(sync) && /getComputedStyle\(ov\)\.display/.test(sync)
    && /classList\.toggle\("pp4ModalOpen",open\)/.test(sync),
    "one place decides whether a modal is up — syncModalOpenClass, which asks the DOM rather than being told by each opener",
    writes.length !== 1
      ? `the pp4ModalOpen class is written in ${writes.length} place(s): ${writes.map(w => `${w.f} (${w.how})`).join(", ") || "none"}`
      : `the one write is not syncModalOpenClass deriving the answer from every visible .modalOverlay`);

  /* 3 — one hand writes the bar's own inline visibility, and it un-hides with "" */
  const writers = capStyleWriters(js);
  const vis = writers.filter(w => w.kind === "visibility");
  const tick = body(stripJs(js["src/ui/stage.js"] || ""), "function capEmptyTick(){");
  rule(vis.length === 1 && /\?\s*"hidden"\s*:\s*""/.test(tick) && !/"visible"/.test(tick),
    'one hand writes the bar\'s own inline visibility (capEmptyTick, for the empty-box rule) and it un-hides with "", so the modal rule above is never out-ranked',
    vis.length !== 1
      ? `${vis.length} hand(s) write #pp4Cap's inline visibility: ${vis.map(w => `${w.file} — ${w.line}`).join(" | ") || "none"}`
      : `capEmptyTick does not clear to "" — an inline "visible" out-ranks the stylesheet and the bar reads straight through every modal`);

  /* 4 — the measurement puts the style back */
  const css = writers.filter(w => w.kind === "cssText");
  const meas = body(stripJs(js["src/ui/stage.js"] || ""), "function measureCapNaturalHeight(");
  rule(css.length === 1 && /const save\s*=\s*cap\.getAttribute\("style"\)/.test(meas)
    && /cap\.setAttribute\("style",\s*save\)/.test(meas),
    "the off-screen width measurement is the only other hand on the bar's style, and it saves and restores it",
    css.length !== 1
      ? `${css.length} place(s) overwrite #pp4Cap's whole style: ${css.map(w => `${w.file} — ${w.line}`).join(" | ") || "none"}`
      : "measureCapNaturalHeight hides the bar off-screen without saving and restoring its style — the bar never comes back");

  return out;
}

/* ---------- the real tree ---------- */
const files = Object.fromEntries([
  ["index.html", fs.readFileSync(path.join(REPO, "index.html"), "utf8")],
  ...walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]),
]);
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: four mutants of the real source, each aimed at one rule ---------- */
const mut = (key, from, to) => {
  const src = files[key];
  return src.includes(from) ? { ...files, [key]: src.replace(from, to) } : null;
};
const proofs = [
  ["a second rule darkening the bar, by display this time",
    mut("index.html", "  body.pp4Stage.pp4ModalOpen #pp4Cap { visibility:hidden; }",
      "  body.pp4Stage.pp4ModalOpen #pp4Cap { visibility:hidden; }\n  body.pp4ModalOpen #pp4Cap { display:none; }"), 0],
  ["each opener adding and removing the class itself, instead of the DOM being asked",
    mut("src/orchestrator.js", `    document.body.classList.toggle("pp4ModalOpen",open);`,
      `    if(open)document.body.classList.add("pp4ModalOpen");else document.body.classList.remove("pp4ModalOpen");`), 1],
  ['the empty-box rule un-hiding with an inline "visible"',
    mut("src/ui/stage.js", `? "hidden" : "";`, `? "hidden" : "visible";`), 2],
  ["the off-screen measurement forgetting to put the bar's style back",
    mut("src/ui/stage.js", `  cap.setAttribute("style", save);`, `  void save;`), 3],
];
let redOk = true;
for (const [what, m, idx] of proofs) {
  const red = !!m && !rules(m)[idx].ok;
  if (!red) redOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : m ? "STAYS GREEN" : "could not be built"}`);
}

const fails = real.filter(r => !r.ok).length, bad = fails || !redOk;
console.log(bad ? `\nFAIL — ${fails} rule(s) red${redOk ? "" : ", and a red-proof did not go red"}`
  : "\nPASS — the CAPTAINS bar darkens under a modal in one place, and comes back by itself");
process.exit(bad ? 1 : 0);
