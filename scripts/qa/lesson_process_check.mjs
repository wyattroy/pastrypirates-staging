#!/usr/bin/env node
/* lesson_process_check.mjs — the daily lesson has a WRITER, a caller, and a shape his page renders.
 *
 * HIS WORDS, 2026-09-03, with a screenshot of the card:
 *   "the Lesson is two days old; it is formatted wrong, and whatever process is supposed to give me
 *    new ones does not exist in a formal way yet. build that, get CEO approval."
 *
 * THREE FAULTS IN ONE SENTENCE, and the middle one is the one he could SEE:
 *   (a) STALE — `LESSONS.md` held ONE entry, dated 2026-09-01. Nothing wrote to it.
 *   (b) FORMATTED WRONG — the body rendered under `white-space:pre-line`, which preserves the
 *       SOURCE FILE's newlines, and that file is hard-wrapped at ~95 columns for a text editor. His
 *       page broke mid-sentence: "…because from the outside a / hard-working session…". And `esc()`
 *       escaped the markdown, so *crash-only design* reached him as literal asterisks.
 *   (c) NO PROCESS — "the day's close owes one" was a sentence in a runbook.
 *
 * ⚠ WHAT THIS GATE DELIBERATELY DOES NOT DO: fail the build on a day with no lesson. That would
 * punish the build for a human cadence, and it would push somebody to manufacture one — which is
 * worse than the honest empty state his card already shows. **The gate holds the MACHINERY and the
 * SHAPE; the page's own "the day's close owes one" holds the cadence.**
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NL = String.fromCharCode(10);
const fails = [];
const dir = mkdtempSync(join(tmpdir(), "lesson-"));

try {
  // 1 — THE WRITER EXISTS AND REFUSES THE WAYS AN ENTRY GOES WRONG.
  {
    const W = join(ROOT, "scripts", "wyclau", "add_lesson.mjs");
    const run = (args) => {
      try { execFileSync(process.execPath, [W, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); return 0; }
      catch (e) { return e.status ?? 1; }
    };
    if (run([]) === 0) fails.push("1: add_lesson wrote a lesson with no title and no body");
    if (run(["--title=x"]) === 0) fails.push("1: add_lesson wrote a lesson with no body");
    if (run(["--title=x", "--body=y", "--date=nonsense"]) === 0) fails.push("1: add_lesson accepted a date his page cannot parse — the entry would be silently invisible");
    /* At most one a day: two entries for one date make "today's lesson" ambiguous and the page shows
       only the newest, so the second would be written and never seen. */
    const firstDate = (readFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), "utf8")
      .match(/^## (\d{4}-\d{2}-\d{2}) /m) || [])[1];
    if (firstDate && run(["--title=x", "--body=y", `--date=${firstDate}`]) === 0) {
      fails.push(`1: add_lesson wrote a SECOND lesson for ${firstDate} — the page shows one, so the other is invisible`);
    }
    /* A future date pins his card forever (the Glass shows the newest), and a heading inside the
       text creates a phantom lesson that truncates the real one AND blocks the next real write.
       Both found by CEO 174; both are well-formed input the shape checks cannot see. */
    if (run(["--title=x", "--body=y", "--date=2099-12-31"]) === 0) {
      fails.push("1: add_lesson accepted a FUTURE date — the Glass shows the newest, so his card would be pinned to it forever");
    }
    if (run(["--title=x", `--body=one${NL}${NL}## 2026-01-01 — phantom${NL}${NL}two`]) === 0) {
      fails.push("1: add_lesson accepted a body containing a lesson heading — that phantom truncates the real lesson on his card and blocks the next real write for its date");
    }
  }

  /* 1b — ⛔ EXERCISE A REAL WRITE. CEO 174 found the 9th mutant: every invocation above expects a
   *      REFUSAL, so the insertion arithmetic, the newest-first placement, the em dash and the
   *      self-check were entirely unrun — *"the half that failed first is the half nothing
   *      exercises."* Run it against a COPY of the tree; his real LESSONS.md is never touched. */
  {
    const W = join(ROOT, "scripts", "wyclau", "add_lesson.mjs");
    const fakeRoot = join(dir, "tree");
    const lessonsDir = join(fakeRoot, ".planning", "wyclau");
    const scriptsDir = join(fakeRoot, "scripts", "wyclau");
    mkdirSync(lessonsDir, { recursive: true });
    mkdirSync(scriptsDir, { recursive: true });
    copyFileSync(W, join(scriptsDir, "add_lesson.mjs"));
    writeFileSync(join(lessonsDir, "LESSONS.md"), `# LESSONS${NL}${NL}## 2020-01-01 — An older one${NL}${NL}older body${NL}`);
    let code = 0;
    try {
      execFileSync(process.execPath, [join(scriptsDir, "add_lesson.mjs"),
        "--title=A real one", `--body=first para${NL}${NL}second para`, "--date=2026-06-15"],
        { cwd: fakeRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { code = e.status ?? 1; fails.push(`1b: a VALID lesson was refused (exit ${code}) — the write path nothing had ever run does not work`); }
    if (!code) {
      const after = readFileSync(join(lessonsDir, "LESSONS.md"), "utf8");
      /* The exact regex glass.mjs parses — if the writer's output does not match it, the entry is
         silently invisible on his card, which is this whole item's failure shape. */
      if (!/^## 2026-06-15 [—-]+ A real one$/m.test(after)) {
        fails.push("1b: the entry it wrote does not match the heading his page parses — it would be silently invisible on his card");
      }
      const heads = [...after.matchAll(/^## (\d{4}-\d{2}-\d{2}) /gm)].map((m) => m[1]);
      if (heads.length !== 2) fails.push(`1b: expected 2 entries after one write, found ${heads.length}`);
      if (heads[0] !== "2026-06-15") fails.push(`1b: the new lesson was not placed newest-first (top entry is ${heads[0]}) — a person opening the file reads a stale one`);
      if (!/first para\n\nsecond para/.test(after)) fails.push("1b: the writer altered his paragraphs — it must store the body as written, unwrapped");
      if (!/older body/.test(after)) fails.push("1b: writing a lesson DESTROYED the existing one");
    }
  }

  // 2 — EVERY ENTRY MATCHES THE SHAPE HIS PAGE PARSES. glass.mjs matches
  //     /^## (\d{4}-\d{2}-\d{2}) [—-]+ (.+)$/m; anything else is silently absent from his card.
  {
    const raw = readFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), "utf8");
    const heads = raw.split(NL).filter((l) => /^## /.test(l));
    if (!heads.length) fails.push("2: LESSONS.md holds no entries at all");
    for (const h of heads) {
      if (!/^## \d{4}-\d{2}-\d{2} [—-]+ .+$/.test(h)) {
        fails.push(`2: an entry his page cannot parse, so it never appears on his card: "${h.slice(0, 60)}"`);
      }
    }
  }

  /* 3 — ⛔ THE FORMATTING FAULT HE SCREENSHOTTED. The body must reach his page as flowing prose,
   *     not broken at the width of whoever wrapped the file, and its markdown must be RENDERED.
   *     Rendered for real through glass.mjs, because a unit test of the helper cannot see whether
   *     the page still applies `white-space:pre-line` around it. */
  {
    const chart = [
      "# CHART", "", "## STEP 1 CHECKLIST", "", "- [ ] **A row.**", "      ⟨`T-901`⟩", "",
      "## BLOCKED ON WYATT", "", "| Question | Recommendation | since |", "|---|---|---|", "",
      "## RULED", "", "| question | his verdict |", "|---|---|", "",
    ].join(NL);
    writeFileSync(join(dir, "CHART.md"), chart);
    try {
      execFileSync(process.execPath, [join(ROOT, "scripts", "wyclau", "glass.mjs"), `--chart=${join(dir, "CHART.md")}`, `--out=${join(dir, "glass.html")}`],
        { cwd: ROOT, stdio: "ignore" });
    } catch (e) { fails.push(`3: glass.mjs could not render (exit ${e.status}) — nothing below is checked`); }
    let html = "";
    try { html = readFileSync(join(dir, "glass.html"), "utf8"); } catch { /* below */ }
    const m = html.match(/<div class="lessonBody">([\s\S]*?)<\/div>/);
    if (!m) fails.push("3: the lesson body did not render on his page at all");
    else {
      const bodyHtml = m[1];
      if (/white-space:\s*pre-line/.test(html.slice(Math.max(0, html.indexOf(bodyHtml) - 400), html.indexOf(bodyHtml)))) {
        fails.push("3: the lesson still renders with white-space:pre-line — the source file's editor wrapping breaks his page mid-sentence, which is the fault he screenshotted");
      }
      const inner = bodyHtml.replace(/<[^>]+>/g, "");
      if (/\S\n\S/.test(inner.replace(/\n\s*\n/g, "\n\n"))) {
        fails.push("3: hard newlines survive inside a paragraph — his page will break mid-sentence again");
      }
      if (/(^|[^*])\*[^*]/.test(inner)) {
        fails.push("3: a literal asterisk reached his page — the lesson's markdown is being escaped instead of rendered");
      }
      /* Whatever his current lesson is, the page must draw the same number of paragraphs it has. */
      const srcParas = readFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), "utf8")
        .split(/^(?=## )/m).filter((s) => s.startsWith("## "))
        .map((s) => s.split(NL).slice(1).join(NL).trim())
        .filter(Boolean)[0] ?? "";
      const want = srcParas.split(/\n\s*\n/).filter((p) => p.trim()).length;
      const got = (bodyHtml.match(/<p[\s>]/g) || []).length;
      if (want && got !== want) {
        fails.push(`3: his lesson has ${want} paragraph(s) and his page drew ${got} — re-flowing the editor's wrapping must not merge or split what HE wrote`);
      }
    }
  }

  /* 3b — ⛔ HIS PARAGRAPHS MUST SURVIVE THE RE-FLOW, ON INPUT THAT CAN PROVE IT. CEO 174 found the
   *      8th mutant: a version that joins every paragraph into ONE fired nothing, because case 3's
   *      assertions read `bodyHtml.replace(/<[^>]+>/g,"")`, which strips the `</p><p>` boundary —
   *      merged and separate paragraphs produce identical text.
   *
   *      ⚠ AND THE FIRST FIX FOR IT WAS ITSELF VACUOUS. Counting the paragraphs of HIS CURRENT
   *      lesson cannot fail while that lesson is a single paragraph: flattening one paragraph
   *      still yields one, and the mutant passed again. **A count taken from live data is only as
   *      strong as the data happens to be.** So this case feeds the real `lessonHtml` a controlled
   *      TWO-paragraph body, where merging is visible by construction.
   *
   *      Unwrapping his lesson and FLATTENING it are one keystroke apart, and only one is the fix. */
  {
    const src = readFileSync(join(ROOT, "scripts", "wyclau", "glass.mjs"), "utf8");
    const grab = (re) => {
      const at = src.search(re);
      if (at === -1) return "";
      const open = src.indexOf("{", at);
      let depth = 0;
      for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
      }
      return "";
    };
    const escLine = (src.match(/^const esc = [^\n]+$/m) || [""])[0];
    const fn = grab(/(?:function\s+lessonHtml\s*\(|const\s+lessonHtml\s*=)/);
    if (!escLine || !fn) {
      fails.push("3b: could not lift esc/lessonHtml out of glass.mjs — the paragraph behaviour is UNKNOWN, not proven");
    } else {
      let out = "";
      try {
        // eslint-disable-next-line no-new-func
        out = new Function(`${escLine}; ${fn}; return lessonHtml(arguments[0]);`)(
          `one line${NL}wrapped by an editor${NL}${NL}a second paragraph he wrote`);
      } catch (e) { fails.push(`3b: lessonHtml threw on a two-paragraph body: ${e.message}`); }
      const paras = (out.match(/<p[\s>]/g) || []).length;
      if (paras !== 2) fails.push(`3b: a two-paragraph lesson rendered as ${paras} paragraph(s) — his blank lines are his, and re-flowing must not merge them`);
      if (/wrapped by an editor/.test(out) && !/one line wrapped by an editor/.test(out)) {
        fails.push("3b: the editor's line wrapping was NOT re-flowed — his page breaks mid-sentence, which is the fault he screenshotted");
      }
    }
  }

  /* 4 — HIS TEXT IS ESCAPED BEFORE IT IS MARKED UP. He writes these; a lesson quoting a tag must
   *     arrive as text, never as markup. Checked on the real renderer through a fixture file. */
  {
    /* ⛔ FIND IT IN EITHER FORM, AND SAY SO WHEN IT IS NOT THERE. This case used to anchor on the
       exact string "const lessonHtml" and feed the result straight to `slice`. When the function
       was restored as `function lessonHtml`, `indexOf` returned -1, `slice(-1, 1399)` handed the
       check the LAST CHARACTER OF THE FILE, and it then reported "the lesson body is no longer
       escaped" — **blaming the code for a fault it had never looked at.**

       That is HARD-WON-LESSONS §14 happening inside the gate written to enforce §14: an instrument
       reporting NOT FOUND has told you something about ITSELF. A -1 from `indexOf` is now its own
       distinct failure, and the window is brace-matched rather than a guessed 1400 characters. */
    const src = readFileSync(join(ROOT, "scripts", "wyclau", "glass.mjs"), "utf8");
    const at = src.search(/(?:function\s+lessonHtml\s*\(|const\s+lessonHtml\s*=)/);
    if (at === -1) {
      fails.push("4: lessonHtml is GONE from glass.mjs — the lesson body has no renderer at all, so nothing below could be checked. (A peer overwrite deleted it once already on 2026-09-03.)");
    } else {
      const open = src.indexOf("{", at);
      let depth = 0, end = -1;
      for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) { end = i + 1; break; }
      }
      const fn = end > 0 ? src.slice(at, end) : "";
      if (!fn) fails.push("4: could not read lessonHtml's body — unbalanced braces, so the escape order is UNKNOWN, not proven");
      else {
        const escAt = fn.indexOf("esc(joined)"), boldAt = fn.indexOf("<b>$1</b>");
        if (escAt === -1) {
          fails.push("4: the lesson body is no longer escaped before markdown is applied — a lesson quoting a tag becomes markup on his page");
        } else if (boldAt !== -1 && boldAt < escAt) {
          fails.push("4: markdown is applied BEFORE escaping — the escape would then eat the tags it just made");
        }
      }
    }
  }

  /* 5 — ⛔ THE ANTI-DECAY CLAUSE: THE DOOR MUST NAME THE COMMAND. A writer nothing invokes is the
   *     third instance of this exact failure on this project (the ranker nothing ran; the harvest
   *     nothing called), and both were found the same way — HE ASKED AGAIN. */
  {
    const door = readFileSync(join(ROOT, ".claude", "skills", "door", "SKILL.md"), "utf8");
    if (!door.includes("add_lesson.mjs")) {
      fails.push("5: the Door no longer names add_lesson.mjs — the daily lesson is back to being a sentence somebody has to remember, which is the state he complained about");
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (fails.length) {
  console.log(`FAIL — lesson_process_check (${fails.length}):`);
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("PASS — lesson_process_check: a lesson is written by a command that refuses bad ones, the Door names it, and the body reaches his page as flowing prose with its markdown rendered.");
