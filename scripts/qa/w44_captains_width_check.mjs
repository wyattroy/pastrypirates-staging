/* W4-4 — THE CAPTAINS BOX AND THE BOARD SHARE ONE WIDTH. Wyatt, from his playtest list:
 * "At tablet width the captains box is narrower than the board, leaving a ~10px dead strip."
 *
 * MEASURED IN A BROWSER BEFORE ANY CHANGE, at three sizes, because the number in the backlog was
 * an estimate and the real one is bigger:
 *   tablet 768x954 — board 756 wide, panel 726: inset 14px on EACH side, 28px total.
 *   desktop 1200   — board 225..975, panel 239..961: the same 14px each side.
 *   phone  390x844 — board 0..390, panel 0..390: EXACTLY FLUSH. The fault does not exist there.
 *
 * THE CAUSE IS ONE VARIABLE DOING TWO UNRELATED JOBS. `--pp4CapGap` is declared in index.html as
 * "the gap between board and captains column" — a SEPARATION, for the side-by-side layout, and it
 * is read by computeStageGeometry() as such. The stacked rule at >=601px then reuses the same
 * number as a left/right INSET:  left: var(--pp4CapGap); right: var(--pp4CapGap).
 * A separation and an inset are different quantities that happened to want the same value once.
 * The phone escapes only because that rule is gated behind the media query.
 *
 * WHAT THIS ASSERTS, and why it is not just "left must be 0": the stacked captains panel must not
 * inset itself from its own containing block AT ALL, because that block is the board's box — so
 * any non-zero left/right is by definition the panel disagreeing with the board about how wide the
 * stage is. Stated that way it survives the value 14 changing, and it survives the variable being
 * renamed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [, ""])[1];
const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

/* Every rule with its @media context — same brace walk the other gates use, kept local so this
   file can be read on its own. */
const RULES = [];
{
  const stack = []; let buf = "", i = 0;
  while (i < clean.length) {
    const ch = clean[i];
    if (ch === "{") {
      const head = buf.replace(/\s+/g, " ").trim();
      let d = 1, j = i + 1;
      for (; j < clean.length && d; j++) { if (clean[j] === "{") d++; else if (clean[j] === "}") d--; }
      RULES.push({ head, body: clean.slice(i + 1, j - 1), media: stack.filter(h => /^@media/.test(h)).join(" | ") });
      stack.push(head); buf = ""; i++; continue;
    }
    if (ch === "}") { stack.pop(); buf = ""; i++; continue; }
    buf += ch; i++;
  }
}

/* ============================ WHAT THIS GATE HOLDS ============================
   WYATT'S RULING, 2026-08-28, in his words: "I want tablet view to go wall to wall in line with the
   board. I want desktop view to have some padding around it like it currently is."
   So this is NOT "the card must never inset" — an earlier version of this gate asserted exactly
   that, which was one session's reading of half his complaint, and it would now fail the behaviour
   he asked for. It holds the ruling: FLUSH where the board has no surround beside it, AIR where it
   does, and the choice between them DERIVED rather than typed. ============================== */
const last = h => h.split(",")[0].trim().replace(/:not\([^)]*\)/g, "").split(/[\s>+~]+/).filter(Boolean).pop() || "";
const positive = h => h.replace(/:not\([^)]*\)/g, "");
const stacked = RULES.filter(r => last(r.head) === "#pp4Cap" && !/\.pp4Side/.test(positive(r.head)));

/* (1) HIS TABLET HALF — a rule must take the card flush when the board fills the window. */
{
  const bleed = stacked.filter(r => /\.pp4CapBleed/.test(r.head));
  const flush = bleed.filter(r => /(?:^|;)\s*left\s*:\s*0/.test(r.body) && /(?:^|;)\s*right\s*:\s*0/.test(r.body));
  if (flush.length) pass(`the card runs flush with the board where there is no surround beside it — his tablet half (${flush[0].head})`);
  else fail("nothing takes the captains card flush with the board when the board fills the window — that is the dead strip Wyatt reported at tablet width, and his ruling was \"wall to wall in line with the board\"");
}

/* (2) HIS DESKTOP HALF — and it is the older decision this restores, not a leftover. The comment
   above the rule in index.html records why: both desktop branches draw the same component with the
   same air (rule 8). CEO Review 15 caught that being deleted silently; the gate now stops it being
   deleted at all. */
{
  const air = stacked.filter(r => !/\.pp4CapBleed/.test(r.head) &&
    /(?:^|;)\s*left\s*:\s*[^;]*--pp4CapGap/.test(r.body) && /(?:^|;)\s*right\s*:\s*[^;]*--pp4CapGap/.test(r.body));
  if (air.length) pass(`the card keeps its air where the board IS letterboxed — his desktop half, spaced by the same --pp4CapGap the side-by-side column uses (${air[0].head}${air[0].media ? ", " + air[0].media : ""})`);
  else fail("the stacked card no longer keeps its --pp4CapGap air on desktop — Wyatt ruled \"I want desktop view to have some padding around it like it currently is\", and the comment above that rule records it as the rule-8 reason both desktop branches match");
}

/* (3) AND THE CHOICE IS DERIVED, NOT TYPED (rule 9). The whole point is that no "tablet ends here"
   number exists to drift. stage.js must compute the board's own surround and toggle the class from
   it; a hand-typed pixel breakpoint deciding the same thing is the failure this asserts against. */
{
  const js = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");
  const derives = /surroundPerSide\s*=\s*\(\s*iw\s*-\s*boardSideStacked\s*\)\s*\/\s*2/.test(js) &&
                  /classList\.toggle\("pp4CapBleed"/.test(js);
  if (derives) pass("the flush-vs-air choice is derived from the board's own surround in stage.js — (window - board) / 2 against the gap — with no typed breakpoint to drift");
  else fail("stage.js no longer derives the flush-vs-air choice from the board's surround — if it has been replaced by a typed viewport breakpoint, that is the constant rule 9 exists to stop");
  /* (3b) AND THE TWO QUANTITIES STAY SEPARATE. `capInset` used to be BOTH the horizontal side inset
     (doubled) and the vertical air under the card — one number, two jobs, the same fault this item
     fixed one layer up in the stylesheet. */
  if (/capGapBelow/.test(js) && !/\bcapInset\b/.test(js))
    pass("stage.js keeps the side inset and the air BENEATH the card as separate quantities");
  else
    fail("stage.js is back to one variable serving both the card's side inset and the vertical air under it — that is the exact conflation W4-4 fixed in the stylesheet");
}

/* (4) THE CARD'S SIDE PADDING IS DECLARED ONCE. CEO Review 15: it is the easiest way to recreate a
   dead strip while every width assertion stays green — 12 of the 13px beside every row IS this. */
{
  const CANON = "12px";
  const padRules = RULES.filter(r => last(r.head) === "#pp4Cap" && /(?:^|;)\s*padding\s*:/.test(r.body));
  const bad = [];
  for (const r of padRules) {
    const v = (r.body.match(/(?:^|;)\s*padding\s*:\s*([^;]+)/) || [])[1].trim();
    const parts = v.split(/\s+/);
    if ((parts.length === 1 ? parts[0] : parts[1]) !== CANON) bad.push(`${r.head} { padding: ${v} }`);
  }
  if (!padRules.length) fail("the captains card declares no padding at all — re-anchor this assertion");
  else if (bad.length) bad.forEach(b => fail(`the captains card's side padding is no longer the agreed ${CANON} — ${b}. Growing it puts a dead strip back where the width assertions cannot see it`));
  else pass(`the captains card's side padding is the one agreed value (${CANON}) in all ${padRules.length} rule(s) that set it`);
}

/* (5) NOTHING SNEAKS AN EXTRA INSET IN BY ANOTHER ROUTE. Everything the CEO used to defeat the
   first version: margin, a subtracting width, the logical-inset properties. left/right are governed
   by (1) and (2) above and are deliberately not re-checked here. */
{
  const offenders = [];
  const ZERO = /^(0(px|%|em|rem)?|auto|unset|initial|revert)$/;
  for (const r of stacked) {
    const decl = k => { const m = r.body.match(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([^;]+)`)); return m ? m[1].trim() : null; };
    for (const k of ["margin-left", "margin-right", "inset-inline-start", "inset-inline-end"]) {
      const v = decl(k); if (v !== null && !ZERO.test(v)) offenders.push({ r, k, v });
    }
    const mg = decl("margin");
    if (mg) { const parts = mg.split(/\s+/); const x = parts.length === 1 ? parts[0] : parts[1];
      if (x && !ZERO.test(x)) offenders.push({ r, k: "margin (horizontal)", v: x }); }
    for (const k of ["width", "max-width"]) { const v = decl(k);
      if (v && /calc\([^)]*-/.test(v)) offenders.push({ r, k, v }); }
  }
  if (offenders.length)
    for (const o of offenders)
      fail(`the captains card takes horizontal space by a route other than the two ruled cases — ${o.r.head} { ${o.k}: ${o.v} }${o.r.media ? " in " + o.r.media : ""}`);
  else
    pass(`across all ${stacked.length} rule(s) that size the stacked card, no margin, logical inset, or subtracting width adds space beyond the two cases Wyatt ruled on`);
}

/* (6) The side-by-side column must keep reading --pp4CapGap for its real job. */
{
  const sideUse = RULES.some(r => /\.pp4Side/.test(positive(r.head)) && /--pp4CapGap/.test(r.body));
  if (sideUse) pass("the side-by-side column still reads --pp4CapGap as the gap between board and column");
  else fail("nothing reads --pp4CapGap as a separation any more — the side-by-side gap has been deleted, which is not what this item asked for");
}

/* (7) THE ROWS FILL THE CARD — the second half of what he reported, and the rule must clear the cap
   on THE CARD THAT HOLDS THE ROWS. CEO Review 15: the first version was satisfied by any element in
   the box, so a rule clearing the hidden controls row would have passed while the captains card
   stayed at the old layout's width. The holder is DERIVED from the markup, never typed. */
{
  const holder = (() => {
    const rows = html.indexOf('id="players"');
    if (rows < 0) return null;
    const ids = [...html.slice(0, rows).matchAll(/<div[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
    return ids.length ? ids[ids.length - 1] : null;
  })();
  if (!holder) fail("could not find the element that holds the captain rows in index.html — re-anchor this assertion, do not delete it");
  else {
    const cleared = RULES.filter(r => /pp4Stage/.test(r.head) && /(?:^|;)\s*max-width\s*:\s*none/.test(r.body) &&
      r.head.split(",").some(sel => {
        const c = sel.trim().replace(/:not\([^)]*\)/g, "").split(/[\s>+~]+/).filter(Boolean);
        const at = c.findIndex(x => x.includes("#pp4Cap"));
        const tgt = c[c.length - 1] || "";
        return at >= 0 && at < c.length - 1 && (tgt.includes("#" + holder) || tgt.includes(".panel"));
      }));
    if (cleared.length) pass(`the classic --boardW cap is cleared on #${holder}, the card that actually holds the captain rows`);
    else fail(`nothing clears the classic \`max-width: var(--boardW)\` cap on #${holder} — the card that holds the captain rows — so they stay at the OLD layout's board width inside a card sized by the new one`);
  }
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : `\nPASSED — the card goes wall-to-wall where the board fills the window and keeps its air where the board is letterboxed (Wyatt's ruling, derived not typed), its rows fill it, and no other route adds space`);
process.exit(fails ? 1 : 0);
