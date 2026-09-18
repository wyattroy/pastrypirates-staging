#!/usr/bin/env node
/* THE LEGAL FOOTER LEAVES THE SCREEN WHEN THE BOARD COMES UP — IN ONE PLACE.
 *
 *   node scripts/qa/footer_leaves_the_stage_check.mjs
 *
 * THE FACT, in the game's words: the Privacy Policy / About / Credits line sits along the bottom of
 * the welcome screen. The moment the board is up, it is gone — so it can never be drawn over the
 * bottom row of the CAPTAINS box, which on a phone is pinned to that same edge.
 *
 * WHOSE RULING: Wyatt, 2026-09-06, having played a whole solo voyage on his phone — "It should only
 * be visible on the pre-game screen, not any time during the game." Before that the footer had no
 * hiding rule at all: `position:fixed` at `z-index:1002` outranked every in-game surface and sat
 * over the captains box for the whole voyage, which is what his screenshot showed.
 *
 * WHO DECIDES IT TODAY — ONE css rule, and ONE measurement that agrees with it BY READING IT:
 *   `index.html`        body.pp4Stage #legalFooter { display: none; }
 *                         — the one rule. `pp4Stage` is the class the board mounts with, so it is
 *                           one condition for solo, pass-and-play and crew alike, not three kept
 *                           in step.
 *   `src/ui/stage.js`   phoneFootReserve — the strip of screen the captains card books for the
 *                         footer on a phone. It reads the footer's REAL computed style, so it sees
 *                         the `display:none` above and returns 0 BY ITSELF. Nothing has to remember
 *                         these two agree; that is the whole design (rule: one display path, whose
 *                         design-time question is "what makes these two agree?").
 *
 * ⛔ WHY THIS GATE EXISTS AT ALL, AND WHAT IT REPLACES.
 * `scripts/qa/gate_archive/t256_footer_clear_of_captains_check.mjs`
 * drove a browser through two whole voyages to photograph the two rectangles. Re-run 2026-09-18
 * (architecture item 54b) with its staging wait corrected, it reported at BOTH seats:
 *     phone 390x664   #legalFooter visible=false display=none   overlap 0px   4 of 4 rows painted
 *     tablet 820x1180 #legalFooter visible=false display=none   overlap 0px   4 of 4 rows painted
 * The footer is not on the screen to cover anything, so that probe can no longer go red whatever
 * the game does — a check that cannot fail is not protection. It is archived, and the structural
 * fact it was reaching for is gated here instead, in ~80ms.
 *
 * RULES (each red-proofed below against a mutant built in memory from the real source):
 *   1. Exactly ONE css rule takes the footer off a staged screen, it does it by `display:none`, and
 *      it keys on `body.pp4Stage`. `display`, not `visibility`: a hidden-but-laid-out footer still
 *      occupies its strip, and rule 3's measurement would still book room for it.
 *   2. NOTHING in `src/` writes the footer's own style. Its presence is decided by that css rule
 *      alone; the game code only ever READS it. A second hand here is the T-206 bug's return route.
 *   3. The captains card's reservation READS the footer's real computed style and books zero when
 *      the footer is not displayed — it never types a height. A typed number is a price list
 *      standing in for something the browser already knows, and it goes stale the first time a
 *      link is added and the bar grows a line.
 *   4. The class those rules turn on — `pp4Stage` — is written in exactly one place per direction
 *      (added once, removed once, both in src/ui/stage.js). Two hands on "is the board up?" is two
 *      answers, and the footer would come back mid-voyage on one of them.
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

/* the balanced body of a named binding, so a rule about phoneFootReserve cannot be satisfied by a
   line somewhere else in the same file */
function bindingBody(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("{", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}

function rules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const html = stripHtml(files["index.html"]);
  const js = Object.fromEntries(Object.entries(files).filter(([f]) => f.endsWith(".js")));

  /* 1 — one rule takes it off the stage, by display, keyed on the board's own class.
     Every css rule whose SELECTOR names #legalFooter; the base rule declares `display:flex` and is
     expected — what must be unique is the one that takes the footer AWAY. */
  const footerRules = [...html.matchAll(/([^{}@;]*#legalFooter[^{}@;]*)\{([^{}]*)\}/g)]
    .map(m => ({ sel: m[1].trim().replace(/\s+/g, " "), decl: m[2].trim().replace(/\s+/g, " ") }));
  const hiders = footerRules.filter(r => /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\b)/.test(r.decl));
  const one = hiders.length === 1 ? hiders[0] : null;
  rule(!!one && /display\s*:\s*none/.test(one.decl) && /body\.pp4Stage\s+#legalFooter/.test(one.sel),
    "one css rule takes the legal footer off a staged screen — `body.pp4Stage #legalFooter { display:none }` — so it is gone from the board's own class, by display, and the captains card gets that strip of screen back",
    hiders.length !== 1
      ? `${hiders.length} css rule(s) hide #legalFooter: ${hiders.map(r => `\`${r.sel} { ${r.decl} }\``).join(" | ") || "none — the footer is never taken off the stage"}`
      : `the one hiding rule is \`${one.sel} { ${one.decl} }\` — it must key on body.pp4Stage and hide by display:none; a footer merely made invisible still holds its strip of the screen and phoneFootReserve still books room for it`);

  /* 2 — nothing in src/ writes the footer's own style; the game only reads it */
  const writers = [];
  for (const [f, raw] of Object.entries(js)) {
    const s = stripJs(raw);
    for (const m of s.matchAll(/(\w+)\.style(?:\.\w+)?\s*=(?!=)/g)) {
      const v = m[1], before = s.slice(Math.max(0, m.index - 1500), m.index);
      if (new RegExp(`(?:const|let|var)\\s+${v}\\s*=[^;\\n]*(?:\\$\\("legalFooter"\\)|getElementById\\("legalFooter"\\))`).test(before))
        writers.push({ file: f, line: s.slice(m.index, m.index + 120).split("\n")[0].trim() });
    }
  }
  rule(writers.length === 0,
    "nothing in src/ writes the footer's own style — the css rule above is the only thing that decides whether it is on the screen, and the game code only reads it",
    `${writers.length} place(s) in src/ write #legalFooter's style: ${writers.map(w => `${w.file} — ${w.line}`).join(" | ")} — a second hand on this is how the footer comes back over the captains box`);

  /* 3 — the reservation reads the real style and books zero when the footer is gone */
  const reserve = bindingBody(stripJs(js["src/ui/stage.js"] || ""), "const phoneFootReserve");
  const readsReal = /getComputedStyle\(\s*foot\s*\)/.test(reserve)
    && /getBoundingClientRect\(\)\.height/.test(reserve);
  const zeroesWhenGone = /display\s*===\s*"none"/.test(reserve) && /return\s+0\b/.test(reserve);
  /* a typed height: any bare number in a `return` other than the 0 that means "book nothing" */
  const typedHeight = [...reserve.matchAll(/return\s+(\d+(?:\.\d+)?)\b/g)].map(m => m[1]).filter(n => Number(n) !== 0);
  rule(!!reserve && readsReal && zeroesWhenGone && typedHeight.length === 0,
    "the captains card books the footer's strip from the footer's OWN measured height, and books zero the moment it reads display:none — so the two agree without either being told about the other",
    !reserve ? "phoneFootReserve is gone from src/ui/stage.js — re-anchor this gate, or the captains card no longer knows the footer exists"
      : typedHeight.length ? `phoneFootReserve returns a typed height (${typedHeight.join(", ")}) instead of the footer's measured one — a number that goes stale the first time a link is added and the bar grows a line`
        : !zeroesWhenGone ? "phoneFootReserve no longer returns 0 when the footer reads display:none — the captains card books a strip for a footer that is not there, and a player loses that much board"
          : "phoneFootReserve no longer reads the footer's real computed style and rect");

  /* 4 — one hand per direction on "is the board up?" */
  const classWrites = Object.entries(js).flatMap(([f, s]) =>
    [...stripJs(s).matchAll(/classList\.(add|remove|toggle)\(\s*"pp4Stage"/g)].map(m => ({ f, how: m[1] })));
  const adds = classWrites.filter(w => w.how === "add"), removes = classWrites.filter(w => w.how === "remove");
  rule(adds.length === 1 && removes.length === 1 && !classWrites.some(w => w.how === "toggle")
    && adds[0].f === "src/ui/stage.js" && removes[0].f === "src/ui/stage.js",
    "one hand raises the board's own class and one hand lowers it, both in src/ui/stage.js — so \"is the board up?\" has a single answer, and the footer's rule turns on the same fact solo, pass-and-play and crew all see",
    `the pp4Stage class is written in ${classWrites.length} place(s) (${adds.length} add, ${removes.length} remove): ${classWrites.map(w => `${w.f} (${w.how})`).join(", ") || "none"}`);

  return out;
}

/* ---------- the real tree ---------- */
const files = Object.fromEntries([
  ["index.html", fs.readFileSync(path.join(REPO, "index.html"), "utf8")],
  ...walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]),
]);
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: mutants of the real source, each aimed at one rule ---------- */
const mut = (key, from, to) => {
  const src = files[key];
  return src.includes(from) ? { ...files, [key]: src.replace(from, to) } : null;
};
const proofs = [
  ["a second rule bringing the footer back over the board",
    mut("index.html", "  body.pp4Stage #legalFooter { display: none; }",
      "  body.pp4Stage #legalFooter { display: none; }\n  body.pp4Stage.pp4Side #legalFooter { opacity: 0; }"), 0],
  ["the footer merely made invisible instead of taken out of the layout",
    mut("index.html", "  body.pp4Stage #legalFooter { display: none; }",
      "  body.pp4Stage #legalFooter { visibility: hidden; }"), 0],
  ["the game code hiding the footer itself, beside the css rule",
    mut("src/ui/stage.js", `    const foot = document.getElementById("legalFooter");\n    if (!foot) return 0;`,
      `    const foot = document.getElementById("legalFooter");\n    if (!foot) return 0;\n    foot.style.display = "none";`), 1],
  ["the reservation typing the footer's height instead of measuring it",
    mut("src/ui/stage.js", `    return Math.ceil(foot.getBoundingClientRect().height);`, `    return 28;`), 2],
  ["the reservation booking a strip for a footer that is not on the screen",
    mut("src/ui/stage.js", `    if (fs.display === "none" || fs.visibility === "hidden") return 0;`, `    void fs;`), 2],
  ["a second hand raising the board's own class",
    mut("src/ui/stage.js", `  document.body.classList.add("pp4Stage");`,
      `  document.body.classList.add("pp4Stage");\n  document.body.classList.add("pp4Stage");`), 3],
];
let redOk = true;
for (const [what, m, idx] of proofs) {
  const red = !!m && !rules(m)[idx].ok;
  if (!red) redOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : m ? "STAYS GREEN" : "could not be built"}`);
}

const fails = real.filter(r => !r.ok).length, bad = fails || !redOk;
console.log(bad ? `\nFAIL — ${fails} rule(s) red${redOk ? "" : ", and a red-proof did not go red"}`
  : "\nPASS — the legal footer leaves the screen when the board comes up, in one place, and the captains card reads that rather than being told it");
process.exit(bad ? 1 : 0);
