#!/usr/bin/env node
// scripts/doc_command_check.js
//
// EVERY COMMAND AND FILE PATH THE DOCS TELL A SESSION TO RUN MUST ACTUALLY EXIST.
//
// Wyatt, 2026-08-26: "If I ask you to run 'sea trial' in a year, how will your documentation know
// what file to open, and which process to run?"
//
// The answer today is that .claude/CLAUDE.md carries the two commands inline and is loaded into
// every session automatically. The answer in a year is "only if something checks" — and until this
// file, nothing did. gate_citation_check.js checks citations inside src/**; the DOCS were
// unguarded, which is precisely where the instructions live.
//
// THIS HAS ALREADY COST SOMETHING. The sea trial printed a sweep command, `qa/matrix.mjs`, that had
// been deleted that same morning and was still referenced in FIVE places — found by a CEO review,
// not by a gate. And the v2.0 cutover will move every `scripts/...` path to `scripts/...`, so on
// that day both CLAUDE.md and QA-PROCESS.md will confidently name files that do not exist.
//
// It also catches a second, sneakier drift: CLAUDE.md's §4 "read this first" table has a MACHINE
// COPY in .claude/hooks/read-the-doc-first.cjs, whose own comment says "Add a row here in the same
// commit that adds a doc to CLAUDE.md §4." On 2026-08-26 a commit whose entire purpose was making
// learnings permanent added the prose row and skipped the enforced one. Nothing noticed. Now
// something does.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const fail = (what) => { failures++; console.log(`  FAIL  ${what}`); };
const pass = (what) => console.log(`  PASS  ${what}`);
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

// The documents that TELL A SESSION WHAT TO DO. If a path here is wrong, a session follows it.
/* EVERY doc, not a hand-kept list of five. The list version scanned CLAUDE.md, QA-PROCESS,
   HARD-WON-LESSONS, DRIVING-THE-GAME and GIT-AND-DEPLOY — so docs/AUDIO.md, which CLAUDE.md §4
   itself tells you to read before touching sound, was never checked, and its link to the audio
   module sat dead for a day after the cutover with this gate reporting all green. A hand-kept
   list of what to guard is the same shape as the bug it is guarding against: it rots silently,
   and nothing says so. Derived from the directory instead. */
const DOCS = [".claude/CLAUDE.md", ".claude/CEO-BRIEF.md",
              ...fs.readdirSync(path.join(REPO, "docs")).filter(f => f.endsWith(".md")).map(f => "docs/" + f)];

console.log("doc_command_check — every command and link the docs name must exist\n");

/* ---- 1. `node <path>` commands ------------------------------------------------------------- */
let cmds = 0, badCmds = [], homeRooted = [];
for (const doc of DOCS) {
  if (!exists(doc)) { fail(`${doc} — the doc itself is missing`); continue; }
  const text = fs.readFileSync(path.join(REPO, doc), "utf8");
  /* `~` IS IN THE CLASS ON PURPOSE — see the home-rooted assertion below. It used to be absent,
     which meant `node ~/foo.cjs` did not match this pattern AT ALL, so the `startsWith("~")` skip
     on the next line was dead code that could never fire. Two layers of the same hole, and a wrong
     command sat in CLAUDE.md rule 21 behind them. */
  for (const m of text.matchAll(/\bnode\s+([~A-Za-z0-9_./-]+\.(?:mjs|js|cjs))/g)) {
    const rel = m[1];
    if (rel.includes("node_modules")) continue;
    if (rel.startsWith("~")) { homeRooted.push(`${doc} -> node ${rel}`); continue; }
    cmds++;
    if (!exists(rel)) badCmds.push(`${doc} -> node ${rel}`);
  }
}
for (const b of badCmds) fail(`a doc tells a session to run a file that does not exist: ${b}`);
if (!badCmds.length) pass(`all ${cmds} \`node …\` commands in the docs point at real files`);

/* A DOCUMENTED COMMAND MUST RUN FROM A FRESH CHECKOUT — Wyatt, 2026-08-28, by falling into it.
   Rule 21 said `node ~/.claude/gsd-core/bin/gsd-tools.cjs validate health`. That path exists on
   Wyatt's Mac and not in a cloud container, so a cloud session ran it, got "No such file", and
   reported to him that the health check "cannot run in a cloud session" — which was false. The
   same tool is in the repo at .claude/gsd-core/bin/. A home-rooted path in a doc is a command that
   works for exactly one machine and silently misleads every other one, so it fails here rather
   than being skipped as "outside the repo on purpose", which is what the old skip called it. */
for (const h of homeRooted)
  fail(`a doc gives a home-rooted command that only runs on one machine: ${h} — use the path inside the repo so it works in every checkout`);
if (!homeRooted.length) pass("every documented `node …` command is repo-relative — it runs the same in a cloud container as on the laptop");

/* ---- 2. relative markdown links between repo files --------------------------------------- */
let links = 0, badLinks = [];
for (const doc of DOCS) {
  if (!exists(doc)) continue;
  const dir = path.dirname(path.join(REPO, doc));
  const text = fs.readFileSync(path.join(REPO, doc), "utf8");
  /* .md AND SOURCE FILES. This used to match `.md` only, and that hole let a real one through:
     docs/AUDIO.md linked `[src/ui/audio.js](../src/ui/audio.js)` for a whole day after the
     cutover deleted `4/`, and this gate reported "all 21 relative doc links resolve" the entire
     time. A doc that hands you a dead path to the SOURCE is exactly as broken as one that hands
     you a dead path to another doc — and the source links are the ones a session actually opens. */
  for (const m of text.matchAll(/\]\((\.{1,2}\/[^)#\s]+\.(?:md|js|mjs|cjs|html|json|py|sh))(?:#[^)]*)?\)/g)) {
    links++;
    if (!fs.existsSync(path.resolve(dir, m[1]))) badLinks.push(`${doc} -> ${m[1]}`);
  }
}
for (const b of badLinks) fail(`a doc links to a file that does not exist: ${b}`);
if (!badLinks.length) pass(`all ${links} relative doc links resolve`);

/* ---- 3. CLAUDE.md §4's table and the HOOK's copy of it must agree ------------------------- */
/* The hook is what actually stops a session; the table is what a human reads. When they disagree,
   the human-facing one wins the argument and the machine silently protects nothing. */
const hookPath = ".claude/hooks/read-the-doc-first.cjs";
if (!exists(hookPath)) {
  fail(`${hookPath} is missing — CLAUDE.md §4 has no machine enforcement at all`);
} else {
  const hook = fs.readFileSync(path.join(REPO, hookPath), "utf8");
  const claude = fs.readFileSync(path.join(REPO, ".claude/CLAUDE.md"), "utf8");
  // every docs/*.md named in the §4 table rows (lines that link a doc AND describe a trigger)
  const tableDocs = new Set();
  for (const m of claude.matchAll(/\|[^|\n]*\[`(docs\/[A-Za-z0-9._-]+\.md)`\]/g)) tableDocs.add(m[1]);
  const missing = [...tableDocs].filter(d => !hook.includes(d));
  if (missing.length) {
    fail(`in CLAUDE.md §4's table but NOT in the hook that enforces it: ${missing.join(", ")}`
       + `\n        -> add them to SUBSYSTEMS in ${hookPath}, as that file's own comment instructs`);
  } else {
    pass(`all ${tableDocs.size} doc(s) in CLAUDE.md §4 are also in the hook's SUBSYSTEMS table`);
  }
}

/* ---- 4. SHELL commands the docs teach must EXIST ON THE MACHINE READING THEM ---------------- */
/* WHY THIS SECTION EXISTS, and it is the most expensive hole this gate has had.
   Sections 1-3 check `node …` invocations and markdown links. A BARE SHELL COMMAND was invisible
   to them — so CLAUDE.md rule 17, the single most-repeated safety instruction in the rulebook,
   printed `pkill -f remote-debugging-port` for months on a machine where neither `pkill` nor
   `pgrep` exists (Git Bash on the Blade ships no procps). A tidy-up written as
   `pgrep … || echo "no stray probes"` therefore printed the all-clear on a full machine exactly as
   readily as on an empty one, and 183 debug-port Chromes holding 15,097 MB accumulated over a day
   beside a laptop Wyatt was asleep next to. This gate reported green beside that rule the whole
   time — the project's own recurring shape: an instrument whose subject is narrower than the thing
   it is believed to guard.

   THE HONEST LIMIT, stated so nobody oversells it: this can only ever check the machine it runs
   on. A command absent on the Mac and present here still passes here. The goal is not proving a
   command works everywhere — it is stopping a rule from teaching something that cannot run ON THE
   MACHINE READING IT. Which is why the escape hatch is an ANNOTATION, not an allowlist: a line
   that names the platform it belongs to has told its reader the truth, and passes. */

/* Shell GRAMMAR, not blessed commands. Rule 9's line is "no hand-kept list of what to guard";
   this is a list of what is not a command at all — keywords, builtins and pipeline glue. It does
   not grow when a script is added, which is what makes it safe to write down. */
const SHELL_WORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac",
  "in", "function", "select", "time", "coproc",
  "cd", "echo", "export", "set", "unset", "source", "alias", "read", "shift", "exit", "return",
  "local", "eval", "exec", "trap", "wait", "test", "true", "false", "printf", "pwd", "umask",
]);

/* Is `name` runnable on THIS machine? Derived from PATH (plus PATHEXT on Windows), never a list. */
const PATH_DIRS = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
const PATH_EXTS = process.platform === "win32"
  ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
  : [""];
const onOwnPath = (name) => PATH_DIRS.some((dir) =>
  [""].concat(process.platform === "win32" ? PATH_EXTS : []).some((ext) => {
    try { return fs.statSync(path.join(dir, name + ext)).isFile(); } catch { return false; }
  }));

/* ⛔ THESE ARE `bash`-TAGGED FENCES, SO ASK BASH — NOT WHATEVER SHELL HAPPENS TO RUN THE GATE.
 * `process.env.PATH` is the INVOKING shell's. From Git Bash it holds /usr/bin and `grep`, `chmod`,
 * `nohup`, `xargs`, `mkdir` all resolve. From PowerShell it does not, so the same docs, unchanged,
 * produced TEN failures reading:
 *
 *   FAIL  a doc teaches a shell command that does not exist on this machine … `grep`
 *
 * **Those commands exist and the docs are correct.** `npm test` was therefore exit 0 in one shell
 * and exit 1 in the other, on the same tree — and a commit of mine closed with "EXIT 0 from Git
 * Bash AND from PowerShell", which CEO 177 measured as false.
 *
 * ⚑ IT IS THE SAME FAULT THE COMMIT BESIDE IT HAD JUST FIXED in `deploy_rsync_paths_check`, one
 * file over: **an instrument reporting a property of ITSELF as a finding about its subject.** The
 * question a bash fence asks is "can BASH run this", so bash is the thing to ask; and where bash
 * cannot be reached, the honest answer is "I cannot judge these", never "they do not exist".
 * Resolved in ONE bash call for all names, then cached. */
let bashReachable = null;               // null = not yet probed, false = no bash here
const bashCache = new Map();            // name -> boolean

/* ⚠ `exit 0` IS LOad-BEARING. Without it bash exits with the status of the last `command -v`, so a
   name it CANNOT resolve makes `execFileSync` throw — which the catch below reads as "bash is
   unreachable", which makes every name runnable, which silently switched the whole section off.
   Caught by this gate's own red-proof fixtures going from 5 findings to 0: **the fixtures are the
   only reason this did not ship as a green gate that checked nothing.** */
const bashHas = (name) => {
  if (bashCache.has(name)) return bashCache.get(name);
  if (bashReachable === false) return null;
  let ok = null;
  try {
    const out = cp.execFileSync("bash", ["-c", 'command -v "$1" >/dev/null 2>&1 && echo yes || echo no; exit 0', "_", name],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    bashReachable = true;
    ok = out.trim() === "yes";
  } catch { bashReachable = false; return null; }
  bashCache.set(name, ok);
  return ok;
};

/* A name is runnable if THIS shell can run it, or if BASH can — because the fence says bash.
   When bash is unreachable we cannot judge a bash command at all, so we do not accuse: the section
   reports that it could not judge, rather than inventing ten failures. */
let unjudgeable = 0;
const onPath = (name) => {
  if (onOwnPath(name)) return true;
  const viaBash = bashHas(name);
  if (viaBash === null) { unjudgeable++; return true; }
  return viaBash;
};

/* A line that NAMES the platform it belongs to has told its reader the truth. CLAUDE.md rule 17's
   corrected form — `# Mac / Linux ONLY — absent in Git Bash` — is exactly this shape. */
const PLATFORM_NOTE = /#[^\n]*\b(mac(os)?|linux|windows|git\s*bash|powershell|wsl|posix|unix)\b/i;

/* THE SCANNER IS A FUNCTION SO IT CAN BE RED-PROOFED BY FIXTURES, not by a session's say-so.
   `T-008`'s lesson on this branch: a gate whose fixtures never contain the failing case is green
   because it is not asserting what it claims. The fixtures below feed it a command that cannot
   exist, and the gate fails if the scanner does not catch it. */
function scanShellCommands(text, doc, judge = onPath) {
  const found = [];
  let counted = 0;
  const lines = text.split("\n");
  let inBlock = false, heredoc = null, blockNote = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const fence = raw.match(/^\s*```(\w*)/);
    /* TAGGED FENCES ONLY, and this was MEASURED rather than chosen for comfort: entering untagged
       fences too took the gate from 0 findings to 1,170, because this repo's untagged blocks are
       full of PSEUDOCODE — `pWin = downwind ? 0.50 : 0.25` in WINNING-STRATEGY.md, and a hundred
       more like it. So an untagged block cannot be judged, and the cost of that is real and is
       stated in the PASS line below rather than papered over: a command in an untagged fence is
       invisible here. CEO 116 found exactly one live instance (docs/MODULES.md), now tagged
       `bash`. THE DURABLE ANSWER IS A CONVENTION — a fence that teaches a command carries a
       language tag — and it is filed, not built here. */
    if (fence) { inBlock = inBlock ? false : /^(bash|sh|shell|console)$/i.test(fence[1]); heredoc = null; blockNote = false; continue; }
    if (!inBlock) continue;
    /* HEREDOC BODIES ARE NOT COMMANDS, and the first version of this gate did not know that: it
       reported `subject`, `Body`, `because` and `MSG` — four lines of the commit-message EXAMPLE in
       GIT-AND-DEPLOY.md §"COMMIT MESSAGES" — as missing binaries. Four of its first fifteen findings
       were prose. That matters more than the noise: a check that fires on prose is a check somebody
       disables, and then the eleven real findings underneath it go with it. */
    if (heredoc !== null) { if (raw.trim() === heredoc) heredoc = null; continue; }
    const line = raw.trim();
    /* A `#` LINE NAMING A PLATFORM ANNOTATES THE REST OF ITS BLOCK. Five consecutive `python3`
       lines in AUDIO.md's harvest pipeline are one fact about one machine, not five; making each
       carry its own tail comment would be noise a reader learns to skip, which is how the pkill
       line survived in the first place. One header line, above the block it describes. */
    if (line.startsWith("#")) { if (PLATFORM_NOTE.test(line)) blockNote = true; continue; }
    if (!line) continue;
    const opener = line.match(/<<-?\s*(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))/);
    if (opener) heredoc = opener[1] || opener[2] || opener[3];
    /* EVERY COMMAND ON THE LINE, not just the first — because the canonical incident command is a
       COMPOUND one: `.claude/CLAUDE.md` rule 17 reads `pkill -f remote-debugging-port; pkill -f
       http.server`, and a scanner that read only the first word would have checked half of the very
       line this gate exists for. Widening it found 19 more commands in the same docs.
       AND A `;` INSIDE A COMMENT OR A QUOTED STRING IS NOT A SEPARATOR — the first version of the
       split did not know that and read `# run it; writes .planning/SEA-TRIAL.md` as a command
       called `writes`, and `echo "OPEN — no corpus; an engine …"` as one called `an`. Three false
       positives in three docs: the prose-firing fault this section had already fixed once,
       re-created one line further down. Quotes are blanked first so a `#` inside one is gone
       before the comment strip; PLATFORM_NOTE is still matched against the RAW line, so stripping
       the comment here cannot swallow an annotation. Anything beyond this would be a shell parser,
       which is the tooling-instead-of-the-game trap. */
    const code = line
      .replace(/'[^']*'/g, "''")
      .replace(/"[^"]*"/g, '""')
      .replace(/(^|\s)#.*$/, "$1");
    for (const seg of code.split(/\|\||&&|[;|]/)) {
      const word = seg.trim().split(/\s+/)[0];
      /* Only judge a token that is plainly a command NAME. Assignments, redirections, subshells
         and paths are somebody else's problem — this gate stays narrow on purpose. */
      if (!word || !/^[A-Za-z][A-Za-z0-9._+-]*$/.test(word)) continue;
      if (SHELL_WORDS.has(word)) continue;
      counted++;
      if (judge(word)) continue;
      if (blockNote || PLATFORM_NOTE.test(raw)) continue;
      found.push(`${doc}:${i + 1} -> \`${word}\` (${line.slice(0, 72)})`);
    }
  }
  return { counted, found };
}

/* ⛔ CAN THIS SHELL JUDGE A BASH FENCE AT ALL? Probe once, up front, with a name every POSIX shell
   has. If bash is unreachable — PowerShell on this machine, measured — then NOTHING below can be
   judged: not the docs, and not the fixtures either, because a fixture's fake command is
   "unrunnable" for the same reason every real one is. Section 4 then SKIPS LOUDLY.

   **This is the shape `deploy_rsync_paths_check` was given one commit earlier, applied to the gate
   beside it.** Before it, the same docs produced 0 failures in Git Bash and TEN in PowerShell —
   `grep`, `chmod`, `nohup`, `xargs`, `mkdir` — every one of them real, correct, and present. A
   commit of mine closed with "npm test: EXIT 0 from Git Bash AND from PowerShell"; CEO 177
   measured that as false and this is why. A gate that cannot reach its subject must say so. */
const CAN_JUDGE_BASH = onOwnPath("grep") || bashHas("grep") === true;

let shellCmds = 0, unrunnable = [];
if (!CAN_JUDGE_BASH) {
  console.log("  SKIP  bash is not reachable from this shell, so the `bash`-tagged fences cannot be judged here.");
  console.log("        NOT a pass: 0 shell commands were checked. The docs are correct; this shell simply");
  console.log("        cannot resolve a POSIX command. Run from Git Bash to exercise this section.");
} else {
  for (const doc of DOCS) {
    if (!exists(doc)) continue;
    const r = scanShellCommands(fs.readFileSync(path.join(REPO, doc), "utf8"), doc);
    shellCmds += r.counted;
    unrunnable.push(...r.found);
  }
}
for (const u of unrunnable)
  fail(`a doc teaches a shell command that does not exist on this machine and is not labelled with the machine it belongs to: ${u}`
     + `\n        -> either give the form that runs here, or annotate the line with its platform (e.g. \`# Mac / Linux ONLY\`)`);
/* THE PASS LINE NAMES ITS OWN SUBJECT, and this wording is the point rather than pedantry.
   It used to read "all N shell commands THE DOCS TEACH", which is wider than what it looks at —
   and CEO 116 found the gap was not theoretical: `docs/MODULES.md` taught `python3 -m http.server`
   inside an UNTAGGED fence, unrunnable here, counted by nothing, with this line printing green
   above it. That is the exact fault this whole section was written to fix — an instrument whose
   subject is narrower than the thing it is believed to guard — reproduced inside the fix for it.
   A gate's silence about what it does NOT cover is what makes it reassuring. So it says so. */
/* ⚠ AND NO GREEN LINE AFTER A SKIP. The first version of the skip above still printed
   "PASS — all 0 shell command(s) … run on this machine", which is true and useless and reads as
   protection: it is the "a gate's silence about what it does NOT cover is what makes it
   reassuring" fault, in the very paragraph that names it. A section that judged nothing says
   nothing green. */
if (CAN_JUDGE_BASH && !unrunnable.length) pass(`all ${shellCmds} shell command(s) in the docs' \`bash\`/\`sh\`-tagged blocks run on this machine (${process.platform}) or are labelled with the machine they belong to — an UNTAGGED fence is not read (they hold pseudocode here), so a command in one is still invisible`);

/* ---- 4b. THE SCANNER MUST BE ABLE TO FAIL --------------------------------------------------- */
/* Every fixture is written against a command name that CANNOT be on any PATH, so these cases mean
   the same thing on the Blade, on the Mac and in a container. */
const FIXTURES = [
  ["catches a command that is not on this machine",
   "```bash\nzzznotacommand --go\n```", 1],
  ["accepts it once the LINE names the platform it belongs to",
   "```bash\nzzznotacommand --go   # Mac / Linux ONLY\n```", 0],
  ["accepts it once a COMMENT LINE above it names the platform",
   "```bash\n# Linux container only\nzzznotacommand --go\nzzzalsonot --go\n```", 0],
  ["does not read a HEREDOC BODY as commands — the fault that made 4 of its first 15 findings prose",
   "```bash\ngit commit -F - <<'MSG'\nzzznotacommand is prose here\nMSG\n```", 0],
  ["still judges the line that OPENS a heredoc",
   "```bash\nzzznotacommand - <<'PY'\nprint(1)\nPY\n```", 1],
  ["ignores shell grammar (`for`, `done`) rather than calling it a missing binary",
   "```bash\nfor c in a b; do\n  echo \"$c\"\ndone\n```", 0],
  ["only looks inside SHELL fences — a js block is not a command list",
   "```js\nzzznotacommand();\n```", 0],
  ["a platform note does not leak into the NEXT block",
   "```bash\n# Mac ONLY\nzzznotacommand\n```\n\n```bash\nzzznotacommand\n```", 1],
  ["judges the SECOND command of a compound line — rule 17's own command is `pkill …; pkill …`",
   "```bash\ngit status; zzznotacommand\n```", 1],
  ["judges both sides of a pipe and of `&&`",
   "```bash\ngit status | zzznotacommand\ngit status && zzzalsonot\n```", 2],
  ["a `;` inside a TRAILING COMMENT is not a command separator",
   "```bash\ngit status    # run it; zzznotacommand is only prose here\n```", 0],
  ["a `;` inside a QUOTED STRING is not a command separator",
   "```bash\ngit status || echo \"OPEN; zzznotacommand is only prose here\"\n```", 0],
];
let fixturesBad = 0;
if (!CAN_JUDGE_BASH) {
  /* The fixtures rely on a fake command being UNRUNNABLE. Where bash is unreachable every name is
     unjudgeable, so a fixture proves nothing — it would report the scanner broken when the scanner
     was never consulted. Skipped with the section it belongs to, for the same reason. */
  console.log("  SKIP  the scanner's red-proof fixtures need a shell that can resolve a command; see the SKIP above.");
} else {
  for (const [what, text, want] of FIXTURES) {
    const got = scanShellCommands(text, "fixture").found.length;
    if (got !== want) { fixturesBad++; fail(`the shell scanner ${what} — expected ${want} finding(s), got ${got}`); }
  }
  if (!fixturesBad) pass(`the shell scanner survives all ${FIXTURES.length} fixtures — it can still FAIL, and it does not fire on prose`);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
