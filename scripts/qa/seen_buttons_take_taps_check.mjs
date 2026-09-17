#!/usr/bin/env node
/* A BUTTON A PLAYER CAN SEE IS A BUTTON A PLAYER CAN TAP.
   Wyatt, 2026-09-17, on the bake-off's "Get bakin'!": AGREED, one tap should press it. It took two. While a card's words are still
   typing, that button was drawn at 40% AND given `pointer-events: none`, so the tap fell through to the card — and a tap on a card
   means "hurry the words" (stage.js's tap-to-hurry, which stands aside for a button but can never see one that takes no taps).
   The rules, each a pure function of the source text, run again below against a deliberately broken copy (RED-PROOF):
     1. no stylesheet rule takes taps away from a button row it leaves VISIBLE (a hidden one is fair: nothing is offered)
     2. the tap-to-hurry listener still stands aside for anything that answers, so a tap on a control is never spent hurrying
     3. the bake-off's own intro button is reachable: its row is the visible one the reveal gate shows */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const cssOf = html => (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
const BTN = /\.apBtn\b|Btns\b|\bbutton\b/;
/* THE NAMED LIST, and it is a list so that adding one is a deliberate act. A button drawn BEHIND another is not an offer: the recipe
   card's back card peeks out at 55% under the front one, and without pointer-events:none it is a tap target over the card in front
   (index.html's own note, "load-bearing"). Anything else that shows a button and refuses its tap has to earn its line here. */
const ALLOWED = [/\.apBtns:has\(\.recipeList\)[^{]*\[data-rcpos="back"\]/];

function rules(html, stage) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const css = cssOf(html);
  const inert = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m => BTN.test(m[1]) && /pointer-events\s*:\s*none/.test(m[2]) && !/visibility\s*:\s*hidden|display\s*:\s*none/.test(m[2]))
    .filter(m => !ALLOWED.some(re => re.test(m[1])))
    .map(m => m[1].trim().replace(/\s+/g, " ").slice(0, 80));
  rule(inert.length === 0,
    `no stylesheet rule shows a button and then refuses its tap, but for the ${ALLOWED.length} on the named list`,
    `a shown button takes no taps: ${inert.join(" | ")} — the tap falls through to the card behind it`);
  const hurry = (stage.match(/prompt\.addEventListener\("pointerdown"[\s\S]{0,400}?\}, \{ capture: true \}\);/) || [""])[0];
  rule(/closest\(["'][^"']*\.apBtn[^"']*button/.test(hurry) && /return;/.test(hurry),
    "a tap on anything that answers is never spent hurrying the words",
    "the tap-to-hurry listener no longer stands aside for a control — an impatient tap on a button would skip text instead of acting");
  rule(/#actionPanel\.pendingReveal \.bkoIntroBtns\s*\{[^}]*visibility:\s*visible/.test(css),
    "the bake-off's intro button is shown while its card types, so there is something to tap",
    "the bake-off's intro button is not shown during the reveal — this gate would pass vacuously");
  return out;
}

const html = rd("index.html"), stage = rd("src/ui/stage.js");
const real = rules(html, stage);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
/* RED-PROOF: each rule must go red on a copy broken the way it guards against. */
const swap = (s, a, b) => (s.includes(a) ? s.replace(a, b) : null);
const MUTANTS = [
  ["the old shown-but-inert button put back", swap(html, "#actionPanel.pendingReveal .bkoIntroBtns { visibility: visible; opacity: .4; }", "#actionPanel.pendingReveal .bkoIntroBtns { visibility: visible; opacity: .4; pointer-events: none; }"), null, 0],
  ["the hurry listener no longer standing aside for controls", null, swap(stage, `if (ev.target.closest(".apBtn,button,a,input,select,textarea,.recipeCard,.bkoBowl,#flipCoinWrap")) return;`, "if (false) return;"), 1],
  ["the intro button hidden again during the reveal", swap(html, "#actionPanel.pendingReveal .bkoIntroBtns { visibility: visible;", "#actionPanel.pendingReveal .bkoIntroBtns { visibility: hidden;"), null, 2],
];
let proof = true;
for (const [what, h, st, idx] of MUTANTS) {
  const built = (h !== null || st !== null);
  const res = built ? rules(h || html, st || stage) : null, red = !!res && !res[idx].ok;
  if (!red) proof = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : built ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proof ? `\nFAIL — ${fails} rule(s) broken${proof ? "" : ", and the red-proof did not hold"}` : `\nPASS — a button a player can see is a button a player can tap; ${real.length} rules, each red-proofed`);
process.exit(fails || !proof ? 1 : 0);
