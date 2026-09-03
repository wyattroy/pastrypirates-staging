#!/usr/bin/env node
/* publisher_must_have_looked_check.mjs — `T-210`.
 *
 * THE SUBJECT, off the live receipts rather than reasoned:
 *
 *     LAST-HARVEST  11:22:00.631Z  version 1788433599-0141  stamped by ONE session
 *     LAST-PUBLISH  11:22:29.562Z  version 1788434543-bb7a  by a DIFFERENT one
 *
 * Twenty-nine seconds apart, and the publisher never stamped a harvest of its own. The publish hook
 * allowed it because `LAST-HARVEST`'s MTIME was fresh — **and that file is machine-local, so every
 * session on this machine shares one.** ONE SESSION'S LOOK LICENSED ANOTHER SESSION'S OVERWRITE.
 * Republishing regenerates his page from disk, so it deletes every idea, comment and ruling nobody
 * carried off first: a publish by a session that never looked is that deletion with a clean receipt
 * over it.
 *
 * ⚠ WHAT THIS DOES **NOT** ASSERT, so nobody reads more into it than it proves: **the race is not
 * closed.** He can write in the seconds between a read and a publish; `mark_glass_harvest.mjs`'s own
 * header records a 7-second instance, and nothing short of a transaction on his page fixes it. What
 * is closed — and what these cases hold — is the case where THE PUBLISHER NEVER LOOKED AT ALL.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUB = join(ROOT, "scripts", "wyclau", "mark_glass_published.mjs");
const HARV = join(ROOT, "scripts", "wyclau", "mark_glass_harvest.mjs");
const fails = [];
/* Two sessions' copies of THE SAME page version — the shape that actually occurred tonight. */
const PAGE = resolve("/sessions/05b084be/tool-results/artifact-74034bde-1788386140-0fbe.html");
const OTHER = resolve("/sessions/cb7cabb2/tool-results/artifact-74034bde-1788386140-0fbe.html");

/* A throwaway tree at the same depth, because both writers derive their target from their own
   location. Never the real receipts: this gate must not be able to stamp his live page. */
function box({ harvest = null } = {}) {
  const d = mkdtempSync(join(tmpdir(), "pub-looked-"));
  mkdirSync(join(d, "scripts", "wyclau", "lib"), { recursive: true });
  mkdirSync(join(d, ".planning", "wyclau"), { recursive: true });
  for (const f of ["mark_glass_published.mjs", "mark_glass_harvest.mjs", "glass_needs_publish.mjs", "harvest_glass.mjs"]) {
    try { writeFileSync(join(d, "scripts", "wyclau", f), readFileSync(join(ROOT, "scripts", "wyclau", f))); } catch { /* reported by the case */ }
  }
  for (const f of ["retire.mjs", "chart_model.mjs", "artifact_version.mjs"]) {
    const src = join(ROOT, "scripts", "wyclau", "lib", f);
    if (existsSync(src)) writeFileSync(join(d, "scripts", "wyclau", "lib", f), readFileSync(src));
  }
  if (harvest !== null) writeFileSync(join(d, ".planning", "wyclau", "LAST-HARVEST"), harvest);
  /* The carry's real destinations, INSIDE the sandbox — every script here derives its root from its
     own location, so these are the files it will actually write. Never the real INBOX. */
  mkdirSync(join(d, ".claude", "memory"), { recursive: true });
  const NL = String.fromCharCode(10);
  writeFileSync(join(d, ".planning", "wyclau", "INBOX.md"), `# THE INBOX${NL}`);
  writeFileSync(join(d, ".claude", "memory", "DECISIONS.md"), `# Wyatt's standing decisions${NL}`);
  return d;
}
/* The receipt now carries the RESOLVED PATH, not the basename — CEO 168 proved the basename is not
   an identity: session directories routinely hold byte-identical names for the same page version,
   so the guard asked "did anyone read this version?" and never "did YOU?". */
const receipt = (p) => JSON.stringify({ artifactVersion: "1788386140-0fbe", harvestedFile: "x.html", harvestedPath: p }, null, 2);
const runPub = (d, args) => {
  try {
    const out = execFileSync(process.execPath, [join(d, "scripts", "wyclau", "mark_glass_published.mjs"), ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};
const stampOf = (d) => { try { return readFileSync(join(d, ".planning", "wyclau", "LAST-PUBLISH"), "utf8"); } catch { return ""; } };

const dirs = [];
try {
  // 1 — NO --harvested= AT ALL: the session that never looked. This is the case that happened.
  {
    const d = box({ harvest: receipt(PAGE) }); dirs.push(d);
    const r = runPub(d, ["--version=1788386140-0fbe"]);
    if (r.code === 0) fails.push("1: a publish with no --harvested= was stamped — a session that never read his page can license its own overwrite");
    if (stampOf(d)) fails.push("1: it REFUSED and still wrote a receipt — a refusal that writes is not a refusal");
    /* AND IT MUST REFUSE FOR THE RIGHT REASON. Deleting the missing-flag guard still refuses —
       the receipt comparison catches it — but the session is told "no harvest receipt for
       <the current directory>", which sends it looking for a receipt fault that does not exist.
       **"It went red" is not enough when the message is the thing the next session acts on.** */
    if (!/did not say WHICH PAGE/.test(r.out)) fails.push("1: it refused, but not with the missing-flag message — the session is told to fix a receipt instead of to name the page it read");
  }

  /* 2 — ANOTHER SESSION'S COPY OF THE SAME PAGE VERSION. **This is tonight's incident exactly**,
   *     and under the basename comparison it PASSED: CEO 168 read the mtimes and found the peer had
   *     that page on disk fourteen seconds before it stamped, so naming its own copy matched a
   *     receipt written by a different session. Same filename, different session directory. */
  {
    const d = box({ harvest: receipt(OTHER) }); dirs.push(d);
    const r = runPub(d, ["--version=1788386140-0fbe", `--harvested=${PAGE}`]);
    if (r.code === 0) fails.push("2: the harvest receipt named a DIFFERENT page and the publish was stamped anyway");
  }

  // 3 — THE PAGE THIS SESSION READ: must succeed. Without this the refusal could be unconditional,
  //     which would WEDGE THE ONE SURFACE HE STEERS FROM — and the first version of this fix did
  //     exactly that, because the receipt stored only the version and never the filename.
  {
    const d = box({ harvest: receipt(PAGE) }); dirs.push(d);
    const r = runPub(d, ["--version=1788386140-0fbe", `--harvested=${PAGE}`]);
    if (r.code !== 0) fails.push(`3: a publish that DID read and carry the page was refused (exit ${r.code}) — this wedges the Glass: ${r.out.trim().slice(0, 160)}`);
    if (!stampOf(d).includes("1788386140-0fbe")) fails.push("3: the publish succeeded and recorded no version");
  }

  // 4 — TWO BLANKS MUST NOT AGREE. **The trap this session fell into five times tonight**: a check
  //     that passes because an empty value matched an empty field. `"".includes("")` is true.
  {
    const d = box({ harvest: "" }); dirs.push(d);
    const r = runPub(d, ["--version=1788386140-0fbe", "--harvested="]);
    if (r.code === 0) fails.push("4: an EMPTY --harvested= against an EMPTY receipt was accepted — the check passes on two blanks, which is not a measurement");
  }

  // 5 — NO RECEIPT AT ALL. A missing file must refuse, not read as "nothing to disagree with".
  {
    const d = box(); dirs.push(d);
    const r = runPub(d, ["--version=1788386140-0fbe", `--harvested=${PAGE}`]);
    if (r.code === 0) fails.push("5: no harvest receipt existed and the publish was stamped — an absent receipt is not permission");
  }

  /* 6 — THE JOIN IS EXERCISED, NOT GREPPED. **The first version read the harvest script's SOURCE
   *     for the word `harvestedFile`, and that is the §14 fault inside the gate written an hour
   *     after §14.** CEO 168's M6/M7: rename the field and leave the word in a comment, or hardcode
   *     the filename, and the gate printed PASS while EVERY legitimate publish would be refused —
   *     the exact wedge that nearly shipped. So the real harvest stamp runs, and its receipt is what
   *     the publish stamp is handed. A case that greps cannot see the half that failed first. */
  {
    const d = box(); dirs.push(d);
    const page = join(d, "artifact-74034bde-1788386140-0fbe.html");
    writeFileSync(page, `<!doctype html><script type="application/json" id="glassState">{"v":2,"ideas":[],"rulings":{},"comments":{}}</script>`);
    /* A Chart the harvest stamp can read: the sections only have to exist and hold no live
       question, because this case declares `--rulings=none`. */
    writeFileSync(join(d, ".planning", "CHART.md"), [
      "# CHART", "", "## BLOCKED ON WYATT", "",
      "| Question | Recommendation | since |", "|---|---|---|", "",
      "## RULED", "", "| question | his verdict |", "|---|---|", "",
    ].join(String.fromCharCode(10)));
    /* THE WHOLE THREE-STEP CHAIN, because that is what a session really walks and each step
       refuses without the one before it: CARRY (writes LAST-CARRY) -> HARVEST STAMP (refuses
       without that receipt, `T-140`) -> PUBLISH STAMP (refuses without THIS session's page,
       `T-210`). Running only the middle step is how a gate certifies a chain it never walked. */
    let hCode = 0, hOut = "";
    for (const step of [
      ["harvest_glass.mjs", [`--html=${page}`]],
      ["mark_glass_harvest.mjs", ["--version=1788386140-0fbe", "--rulings=none", `--harvested=${page}`]],
    ]) {
      if (hCode !== 0) break;
      try {
        execFileSync(process.execPath, [join(d, "scripts", "wyclau", step[0]), ...step[1]],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) { hCode = e.status ?? 1; hOut = `${step[0]}: ${e.stdout ?? ""}${e.stderr ?? ""}`; }
    }
    if (hCode !== 0) fails.push(`6: the REAL carry+harvest chain refused a legitimate harvest (exit ${hCode}) — ${hOut.trim().slice(0, 200)}`);
    else {
      const r = runPub(d, ["--version=1788386140-0fbe", `--harvested=${page}`]);
      if (r.code !== 0) fails.push(`6: a publish following the REAL harvest was refused (exit ${r.code}) — the two halves of the receipt do not agree, and every legitimate publish is now wedged: ${r.out.trim().slice(0, 160)}`);
    }
  }

  /* 7 — A DRIVE ROOT, which is the input that disproves "unreachable". I labelled the `!want` guard
   *     UNREACHABLE and called it measured; I had measured `basename(resolve(""))`, the wrong input.
   *     `resolve("C:\\")` has an EMPTY basename, and with an empty receipt an unguarded comparison
   *     stamps a publish. **A behavioural claim in a comment, written as settled — rule 6's other
   *     half — and it survived its red proof only because no case exercised it.** */
  {
    const d = box({ harvest: "" }); dirs.push(d);
    const r = runPub(d, ["--version=1788386140-0fbe", "--harvested=C:\\"]);
    if (r.code === 0) fails.push("7: a drive root was accepted against an empty receipt — the emptiness guard is doing nothing");
  }

  /* 9 — A RECEIPT THAT PARSES AND CARRIES AN EMPTY PATH. Case 7's drive root dies at the JSON
   *     parse (an empty file is not JSON), so nothing exercised the emptiness of the FIELD — and a
   *     mutant that accepts any string, blank included, survived because of it. `resolve("")` is the
   *     current directory, so a publisher running from the right folder would be waved through.
   *     **The "two blanks agree" family again, one layer in from where I last looked for it.** */
  {
    const d = box({ harvest: JSON.stringify({ artifactVersion: "1788386140-0fbe", harvestedPath: "" }) }); dirs.push(d);
    const r = runPub(d, ["--version=1788386140-0fbe", `--harvested=${PAGE}`]);
    if (r.code === 0) fails.push("9: a receipt recording an EMPTY harvestedPath was accepted — a blank field is not a record of having looked");
  }

  // 8 — BOTH HALVES OF THE JOIN MUST STILL BE DECLARED. Behaviour above proves they work today;
  //     this fails loudly if either is deleted, so the reason is legible rather than a puzzle.
  {
    if (!readFileSync(HARV, "utf8").includes("harvestedPath")) fails.push("8: mark_glass_harvest.mjs no longer records harvestedPath — the publish join falls back to a basename, which is not an identity");
    if (!readFileSync(PUB, "utf8").includes("--harvested=")) fails.push("8: mark_glass_published.mjs no longer requires --harvested= — one session's look licenses another's overwrite again");
  }
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

if (fails.length) {
  console.log(`FAIL — publisher_must_have_looked_check (${fails.length}):`);
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("PASS — publisher_must_have_looked_check: a session cannot stamp a publish of a page it never read, and a session that did read one still can.");
