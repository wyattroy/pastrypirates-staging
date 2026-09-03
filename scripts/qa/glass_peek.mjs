#!/usr/bin/env node
/* glass_peek.mjs — LOOK AT HIS PAGE BEFORE HANDING IT TO HIM. Rule 19, for the Glass.
 *
 *   node scripts/qa/glass_peek.mjs "the note to render" .planning/posed/glass-<what>.png
 *
 * NOT A GATE — it is never in `npm test` and it asserts nothing. It is the POSED BOARD for his
 * status page (rule 26): render the REAL Chart, the REAL ledger and the REAL status files through
 * the REAL generator, and photograph the result at 390x844 DPR 2.
 *
 * WHY IT WAS KEPT RATHER THAN THROWN AWAY, stated plainly so he can overrule it: it was written as
 * a throwaway during T-088 and on its FIRST use it found two defects the fixture could not — a
 * trailing full stop made `NUMBER.` read as an identifier, and a punctuation token carried a
 * shouting run across a clause boundary and lowercased the acronym beyond it ("the heading — ceo
 * 104's"). Both were invisible in a hand-written fixture and obvious in one photograph of his own
 * Chart. A gate proves the rule; only this shows what he will actually read.
 *
 * IT NEVER TOUCHES THE LIVE PAGE. Everything renders in a throwaway tree, because
 * `glass.mjs --note` rewrites `.planning/wyclau/glass.html` AND CLEARS `GLASS-NOTE.md`
 * unconditionally — a watch's unpublished note to Wyatt has already been destroyed once by a
 * command run only to inspect the page (INBOX-20260902T0350Z).
 *
 * ⚠ RULE 17: it launches a headless Chrome. It closes it in a `finally`, and `close()`'s belt-and-
 * braces `pkill` does not exist on Windows — so check `node scripts/qa/stray_probe_check.mjs`
 * before you end the turn.
 */
import { mkdirSync, mkdtempSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = mkdtempSync(join(tmpdir(), "glass-peek-"));
mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
mkdirSync(join(dir, ".planning", "wyclau", "status"), { recursive: true });
mkdirSync(join(dir, ".claude", "memory"), { recursive: true });
copyFileSync(join(ROOT, "scripts", "wyclau", "glass.mjs"), join(dir, "scripts", "wyclau", "glass.mjs"));
copyFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs"), join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"));
for (const f of ["CHART.md", "CHART-LOG.md", "CTO-LEDGER.md"]) {
  if (existsSync(join(ROOT, ".planning", f))) copyFileSync(join(ROOT, ".planning", f), join(dir, ".planning", f));
}
copyFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), join(dir, ".planning", "wyclau", "LESSONS.md"));
for (const f of readdirSync(join(ROOT, ".planning", "wyclau", "status"))) {
  copyFileSync(join(ROOT, ".planning", "wyclau", "status", f), join(dir, ".planning", "wyclau", "status", f));
}
copyFileSync(join(ROOT, ".claude", "memory", "DECISIONS.md"), join(dir, ".claude", "memory", "DECISIONS.md"));
execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", process.argv[2] ?? "peek"], { stdio: "pipe" });

/* ⚑ `--show-form` — THE IDEAS BOX HAS NEVER BEEN PHOTOGRAPHED, AND IT COULD NOT BE.
   `#ideaForm` starts `hidden` and is only revealed when the artifact host grants the page its
   "artifact" capability. A headless Chrome serving the file over http is not the artifact host, so
   every peek any watch has ever taken shows the same grey line — "This view can't save to the
   page" — where his Ideas box, his Send button and now his DO NOW button live. **The one part of
   this page he WRITES with is the one part rule 19 has never covered.**
   This flag forces the form open and injects one example idea marked DO NOW, so the controls can
   be seen. ⚠ IT IS A POSE, NOT A GRANT: the page still cannot save here, and a screenshot taken
   with this flag proves the page RENDERS the controls — never that a tap of them lands.

   ⚑ `--press-do-now` — AND THIS ONE ACTUALLY PRESSES IT, which `--show-form` cannot.
   CEO 121's first finding, and it was right: with only `--show-form`, **the button had never been
   pressed by anyone or anything**, and the row drawn beneath it in the photograph was drawn by
   THIS FILE rather than by the page's own `renderIdeas()`. A picture of a control nobody has
   touched is a picture of CSS.
   The grant is what was missing, and it can be forged before the document loads: a stub
   `window.claude.use("artifact")` resolving to an object with a `publish` that keeps the bytes.
   The page then takes its normal path — the form unhides, `sendIdea(true)` runs for real, the idea
   is pushed with its flag, `renderIdeas()` paints the tag — and what is photographed afterwards is
   the page's own output. **The publish is a stub; everything above it is the real page.** */
const SHOW_FORM = process.argv.includes("--show-form");
const PRESS = process.argv.includes("--press-do-now");
const out = process.argv.filter((a) => !a.startsWith("--"))[3] ?? join(ROOT, ".planning", "posed", "glass-peek.png");
mkdirSync(dirname(out), { recursive: true });
const b = await openChrome({ W: 390, H: 1400, dbgPort: 9789, httpPort: 8789, serveRoot: join(dir, ".planning", "wyclau"), profileDir: join(dir, "prof"), mobile: true, dsf: 2 });
try {
  if (PRESS) {
    /* Injected BEFORE the document runs — the page reads `window.claude.use` at script time, so a
       stub installed after navigation is a stub the page has already looked past. */
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__published = 0;
      window.claude = { use: function(){ return Promise.resolve({
        publish: function(doc){ window.__published++; window.__lastDoc = doc; return Promise.resolve({}); }
      }); } };
    ` });
  }
  await b.nav("http://127.0.0.1:8789/glass.html");
  await b.sleep(1500);
  if (PRESS) {
    const r = await b.ev(`(function(){
      var t = document.getElementById("ideaText"), btn = document.getElementById("ideaDoNow");
      if (!t || !btn) return { err: "no #ideaText or #ideaDoNow" };
      if (document.getElementById("ideaForm").hidden) return { err: "the form never unhid — the stubbed grant did not take" };
      t.value = "an idea he wants done now";
      btn.click();
      return { clicked: true };
    })()`);
    if (r && r.err) console.log(`  ⚠ --press-do-now: ${r.err}`);
    await b.sleep(600);
    const seen = await b.ev(`(function(){
      var box = document.getElementById("ideaList");
      var tag = box ? box.querySelector(".pinTag") : null;
      return {
        published: window.__published,
        pinTag: tag ? tag.textContent : null,
        listText: box ? box.textContent.trim().slice(0, 160) : null,
        boxCleared: document.getElementById("ideaText").value === "",
        status: (document.getElementById("ideaStatus") || {}).textContent || null,
        docHasFlag: /"now":true/.test(String(window.__lastDoc || "")),
      };
    })()`);
    console.log("  pressed DO NOW —", JSON.stringify(seen));
    await b.ev(`document.getElementById("ideaForm").scrollIntoView({block:"center"})`);
    await b.sleep(300);
  }
  if (SHOW_FORM) {
    const r = await b.ev(`(function(){
      var n = document.getElementById("ideaCapNote"); if (n) n.hidden = true;
      var f = document.getElementById("ideaForm"); if (!f) return "no #ideaForm";
      f.hidden = false;
      var box = document.getElementById("ideaList");
      if (box) {
        var ul = document.createElement("ul");
        var li = document.createElement("li");
        var tag = document.createElement("span");
        tag.className = "pinTag"; tag.textContent = "DO NOW";
        li.appendChild(tag);
        li.appendChild(document.createTextNode("an example of what a pinned idea looks like  (2026-09-02 21:4)"));
        ul.appendChild(li); box.appendChild(ul);
      }
      document.querySelector("#ideaForm").scrollIntoView({block:"center"});
      return "ok";
    })()`);
    if (r !== "ok") console.log(`  ⚠ --show-form: ${JSON.stringify(r)} — the shot below does NOT show the form`);
    await b.sleep(300);
  }
  await b.shot(out);
  console.log("shot:", out);
} finally { b.close(); }
