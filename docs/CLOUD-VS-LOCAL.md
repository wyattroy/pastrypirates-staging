# Cloud container vs Wyatt's Mac — what each one costs, and what only works in one of them

**Read this before deciding WHERE to run a sea trial, a playtest, or any long browser job.**
[`QA-PROCESS.md` §5b](QA-PROCESS.md) tells you *how* to run in each place. This tells you *which to
pick, and what it will cost you*.

Written 2026-08-28, the first day both environments sailed the **same 10-leg FULL trial on the same
build** and the numbers could be put side by side.

---

## THE ANSWER, IF YOU READ NOTHING ELSE

**Prefer the cloud for any long run. It is free of his laptop, and that is the scarce resource.**
Go local only when the question is *"does this reproduce on a real Mac?"* — which, for
Safari-family and performance questions, it usually is.

**And run the trial in ONE place at a time.** The single most expensive thing found on 2026-08-28
was not a slow environment; it was two environments running at once and overwriting each other.

---

## THE MEASURED COMPARISON — same build, same 10 legs, same day

| | cloud container | local Mac |
|---|---|---|
| FULL 10-leg trial | **91 min** | **119 min** |
| legs sailed | 10 of 10 | 10 of 10 |
| **WebKit relaunches** | **14** (11 + 2 + 1) | **0** |
| the machine | had itself | shared with 2 Claude sessions + judge subprocesses |
| costs Wyatt's laptop | nothing | ~2 hours of CPU and fan |
| he can watch the browser | no | no (headless either way) |

**DO NOT QUOTE "the cloud is 24% faster" FROM THIS TABLE.** The local run was contended and the
cloud run was not — the honest reading is *busy machine vs idle machine*, not *container vs Mac*.
Earlier cloud runs on 8 legs took 62 and 75 minutes, so the cloud's own spread is wide too.
**Nobody has yet measured an idle Mac against an idle container. Until somebody does, treat the
two totals as the same order of magnitude and choose on the other rows.**

Local per-leg wall times, 2026-08-28, `--parallel=2` (they overlap, so they sum to more than the
total): crew-desktop 40 min · passplay-desktop 27 · passplay-phone 26 · crew-phone 24 ·
solo-tablet-wk 20 · solo-tablet 19 · solo-desktop 17 · solo-phone 17 · solo-phone-wk 16 ·
solo-desktop-wk 15. **The crew legs dominate.** If you need a fast answer and the question is not
about multiplayer, sail the solo legs and say so.

---

## WHAT ONLY WORKS IN ONE PLACE

### Only the Mac can answer a Safari question

**This is the finding that justifies ever running locally.** Playwright's Linux WebKit in the
container is the **WPE** port, and it segfaults mid-voyage inside `libWPEWebKit`'s own compositing
walk — diagnosed by core dump 2026-08-28, after two wrong theories (contention, memory) were
measured dead. It crashed in **5 of 5** isolated runs, dead by day 9.

The mount now relaunches and resumes, so the legs finish, but each rescue is printed as
`✱ N WebKit relaunch(es)`.

**On the Mac the same three legs needed ZERO.** macOS Playwright WebKit is a different backend
entirely. So:

> **A Safari-family failure seen only in a container is the container's, until it reproduces on the
> Mac.** Check `report.json`'s `recoveries` field before believing any cloud Safari result — a leg
> rescued 11 times is not the same evidence as a leg that sailed.

### Only the cloud leaves his laptop alone

Rule 17 exists because probes were found heating the machine he was reporting as overheating. A
FULL trial is **two headless browsers plus a judge subprocess per screenshot, for two hours**. In
the cloud that is free. Locally it is his fans, his battery, and his CPU while he is trying to work.

### Only the Mac has his real browsers, his fonts, and his hardware

For anything about compositing, GPU, font rendering, or how it actually *feels* — the Mac. The
container has no `/dev/dri` at all.

---

## THE TRAPS, BY ENVIRONMENT — every one of these cost time

### In the cloud

| trap | what happens |
|---|---|
| `pkill -f chromium` | **kills your own session** — the container's shell wrapper matches. Kill by debug port |
| `/tmp` | does not survive a container recycle. Evidence vanishes and looks like a failed run — check mtimes before reporting NOT RUN |
| the vision judge | outbound HTTPS goes through a policy proxy; without the CA bundle every judge call dies and **30 screens went unjudged in one run** |
| browser downloads | `cdn.playwright.dev` and the prss host must be allowlisted, or WebKit simply is not there |
| `rsync`, `gh` | not installed by default; install the real tool, never hand-roll the sync (see rule 14) |
| the 10-minute tool ceiling | a FULL trial runs longer. Launch detached with `nohup … &` and watch the log, or it is killed mid-sail and reports nothing |

### On the Mac

| trap | what happens |
|---|---|
| **this repo's own hooks ambush child `claude -p` calls** | the biggest one. See below |
| his other sessions | more than one Claude session can share this checkout. They share `sea-trial-shots/` too |
| `timeout` | not on macOS. Use a poll loop, or `gtimeout` |
| relative `find -newermt` | errors out; with `2>/dev/null` that reads as "found nothing" |
| grepping `ps` for your own probe name | your own grep command matches. Use `pgrep -x` / `pgrep -f` and check the hit is real |
| his speakers are in the room | every browser muted, always |

### The Mac trap that deserves its own heading: THE JUDGE GETS JUDGED

**2026-08-28: a FULL local trial returned `judge ERROR: vision call timed out` on every screen — 75
calls, zero verdicts — while the legs sailed on looking healthy.**

The vision judge shells out to a child `claude -p` per screenshot. That child **inherited the
trial's working directory**, so it loaded `.claude/settings.json` and ran *this project's hooks*.
Every call is a new session id, so `playtest-checklist-last.cjs`'s once-per-session guard never
applied: it fired on all of them, blocked the Stop, and sent each judge off to write a staging
checklist instead of returning its verdict. Fingerprint: **73 `checklist-asked` marker dirs** in
`.claude/hooks/.read-state/`, all inside the failed window and none after it.

Fixed in `scripts/lib/vision.mjs` — the judge now runs from `os.tmpdir()`; `imgPath` was already
absolute so it never needed the repo. **Do not restore the cwd.**

**The general lesson, which outlives this fix:** *any tool that shells out to a second `claude`
from inside this repo inherits this repo's hooks.* If you add one, run it from outside the tree.

---

## RUNNING BOTH AT ONCE — the collision, and what is and is not protected

Two machines on one branch is now normal. It is safe **only** with these:

1. **`--report=<path>`.** `sea_trial.mjs` used to write `.planning/SEA-TRIAL.md` at a hardcoded
   path; whoever finished last silently overwrote the other's verdict, leaving one
   authoritative-looking report describing the **other machine's** run. Rule 24 stands on opening
   that file and believing it. Gated by `scripts/qa/trial_report_ownership_check.mjs`.
   **This was not theoretical** — a local run stamped `19:35:09Z` over the cloud's `18:44:08Z`
   before being caught and restored.
2. **Every report states the machine it sailed on**, derived from `os.hostname()`, never typed.
3. **`git pull --rebase` before every commit.** Both sessions append to `CTO-LEDGER.md`. Rebased
   they stack; un-rebased they conflict on every push. **When they do conflict, keep BOTH entries**
   — the conflict is two appended lines, not a disagreement.
4. **Claim work in the ledger before starting.** There is no lock across machines.

### ⚠ STILL NOT PROTECTED — `sea-trial-shots/` is one shared hardcoded path

`--report=` separates the two **reports**. It does not separate the **evidence** — the screenshots,
and the `report.json` that `sea_trial.mjs` reads to decide *which legs actually sailed*.

Harmless across machines. **Not harmless on one machine**, and on 2026-08-28 there were two local
Claude sessions in this checkout at once. Two local trials would erase each other's evidence — the
same silent-overwrite class, one layer down. *(It is why the "before" half of the judge story above
is no longer on disk.)*

**If you run two trials on one machine, give the second one its own output directory.**

---

## HOW MUCH THE TRIAL ACTUALLY LOOKS AT — read this before quoting a green leg

**The vision judge only ever sees the first 30 distinct screens of a leg** (`JUDGE_CAP`,
`scripts/playtest_gate.mjs:58`, applied at `:481`). Structural checks run on all of them; *eyes* do
not.

2026-08-28 local run: **349 screens captured, 267 submitted, 82 never shown to the judge.** The
worst case was `crew-desktop` — the one leg that did not finish its voyage — **60 captured, 30
judged, all 30 PASS.** It reads as visually clean; half of it was never opened.

**And the report does not tell you this**, because its per-leg lines say *"vision judge FAILED 4
screen(s)"* with no denominator. Until that prints *"judged 30 of 60"*, **do the division yourself
before calling a long leg visually clean.** (CEO Review 14, 2026-08-28 — recorded as a recurrence
of Review 13's *"the instrument announces more than it actually checked"*.)

---

## THE DECISION, IN ONE TABLE

| the question you are asking | where to run it |
|---|---|
| routine FULL trial before staging | **cloud** — his laptop is the scarce thing |
| does this Safari/WebKit fault reproduce for real? | **Mac**, and quote `recoveries` from both |
| anything about compositing, GPU, fonts, feel | **Mac** |
| he is at the keyboard working | **cloud** |
| the cloud run stalled | Mac, and say in the report that it is contended |
| a timing number anyone will quote | **an idle machine, and say which** — otherwise do not quote it |
