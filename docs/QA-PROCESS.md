# How we prove a change to Pastry Pirates

**One process. Four steps. Three gears. Called every time the game's code changes.**

Wyatt, 2026-08-26: *"I want one elegant process that is called every time we need to change the code
of the game. Design this such that small changes can be qa'd quickly, and large changes are qa'd
appropriately, but all using a similar logic."*

> ### WHY THIS EXISTS, and it is not theory
>
> On 2026-08-25/26 a session shipped **22 fixes and verified 4** — all of them in solo mode, on a
> phone-sized screen. It chose how hard to test each fix by feel. It wrote ten separate scripts,
> each named after one bug, eight of them solo-only, and **wired none of them into `npm test`**, so
> none will ever run again.
>
> Nothing in that sentence is unusual. It is what happens by default when the depth of testing is a
> judgement call made by whoever is tired at 3am. **This document removes the judgement call.**

---

## The four steps. They never change, never reorder, and are never skipped.

| | | |
|---|---|---|
| **1** | **Show it broken** | Write the check that FAILS, *before* touching the code. If you cannot make it fail, you have not found the bug — you have found a theory. |
| **2** | **Change the code** | |
| **3** | **Show it fixed** | That same check now passes. Not a different check. The same one. |
| **4** | **Sweep** | Confirm you broke nothing else. |

**Only step 4 changes size**, and step 1 is waived in exactly one gear. Everything else is constant
whether you are fixing a typo or rewriting the wire.

*(Engineers call step 1 → step 3 a **red-green test**: red is the failing check, green is the passing
one. The point of writing it first is that a check written afterwards has never been seen to fail,
so nobody knows whether it can.)*

---

## The three gears — chosen by the files you touched, not by how the change feels

```bash
node scripts/qa/gear.mjs
```

It reads what you actually changed and tells you the gear and the sweep. **It is mechanical on
purpose**: a rule based on how risky a change feels cannot be enforced by anything, and the whole
reason this document exists is that a session picked its own depth by mood.

| Gear | You are here when | Step 1 | The sweep |
|---|---|---|---|
| **COSMETIC** | only words, colours or comments changed | **waived** — a colour proves itself with a screenshot | `npm test` + a screenshot of the one screen |
| **PLUMBING** | **how a mode SERVES the game up** — pass-and-play's hand-the-device gate, crew's room codes / joining / the 30-second grace | **required** | `npm test` + `sea_trial.mjs --gear=PLUMBING` **and the other modes once**, to prove the serving change did not leak into the game |
| **FULL** | **everything else — this is the default** | **required** | `npm test` + `sea_trial.mjs` (all modes, all sizes, both engines, a real two-browser crew game) |

### The middle gear is a different SUBJECT, not a smaller size

Wyatt, 2026-08-26: *"Each mode should be structurally different just about who the player is playing
against, but the game itself should remain consistent for every player in every mode."*

**Pastry Pirates is one game, not three.** Solo, pass-and-play and crew are three answers to one
question — *who are the other captains, and how does a turn reach them?* Everything else is the same
game, and **a player should not be able to tell which mode they are in** from the board, the
narration, the wording, the pacing or the prompts.

**An earlier version of this document had a gear meaning "behaviour changed inside one mode", and he
threw it out.** That sentence *presumes the fork it is supposed to prevent*: it treats "this only
affects crew" as an ordinary thing to say, then only looks at crew — so a divergence introduced
anywhere else sails through, and the process quietly teaches itself that forking modes is routine.
It is the same failure as the parity gate declaring `localAsk` an acceptable gap: **a process
agreeing, in advance, that a fork is fine.**

So PLUMBING covers only *the seating* — who gets asked, when, and how the device or the wire carries
it. Never what they then see.

**PLUMBING MUST BE EARNED. Everything else defaults to FULL.** That polarity is deliberate: the gear
picker shipped an hour before this paragraph defaulting to the LENIENT answer when it had no
evidence, and dropped real changes into the gear that skips proving them broken.

**The tell that separates plumbing from the game:** if a change can alter what any player sees or can
do, it is **not** plumbing. `pos` went missing from the guest's sail prompt exactly here — it looked
like wire plumbing, and it changed what a guest could *do*. Hence: an edit mentioning a prompt's
payload or a renderer is THE GAME, whatever file it lives in.

*(Engineers call the underlying idea **blast radius**: how much of the product one change can break.
Scaling test effort to blast radius rather than to the size of the bug is called **risk-based
testing**, and it is what every professional team does.)*

---

## The robot that plays the game

```bash
node scripts/sea_trial.mjs                  # the whole thing: modes, sizes, both engines
node scripts/sea_trial.mjs --gear=PLUMBING  # one mode, plus the others once
node scripts/playtest_gate.mjs --legs=crew-phone   # one leg, when you know which
```

It opens real browsers, plays real voyages, and after every move looks at ten specific things. Then
it prints a grid: down the side, the things to look at; across the top, each mode at each screen
size.

**Every square is one of three things, and the third is the point:**

- **ok** — that thing held
- **FAIL** — it broke, with what was measured
- **·** — **NOBODY LOOKED.** Either the game never reached that state, or the whole combination
  never ran.

**The not-run count is printed at the bottom and it is the number that matters.** "We tested it"
becomes a lie precisely in that column. A check that cannot see its subject **skips** — it never
reports a pass.

*(A set of checks that runs on every change, regardless of size, is a **regression suite** —
"regression" meaning something that used to work and stopped.)*

---

## When the slow sweep runs

Wyatt's ruling, 2026-08-26: **automatically, in the background, and nothing ships until it comes
back clean.** The full sweep takes 20–30 minutes. Nobody should have to wait for it or remember it.

> **⚠ NOT BUILT YET — and this paragraph asserted it in the present tense for half a day.** Nothing
> gates the push today. The hook (`qa-gear-first.cjs`) only ever sees `Edit`/`Write`; it never sees a
> `git push`, and it lets the retry through one line later. Caught by the CEO review, which was
> right to call a committed document claiming a mechanism that was never written.
>
> **What it needs:** a `.git/hooks/pre-push` that refuses when `.planning/SEA-TRIAL.md` has no clean
> verdict for the current `PP4_STAMP`. About fifteen lines of shell, no dependencies. The build
> stamp is already the right key — CLAUDE.md §6 makes it the thing Wyatt looks for.

The alternative he rejected — *run it only when asked* — is exactly what happened on 2026-08-25:
the thorough pass existed and nobody ran it.

---

## The rules that make this hold

1. **A check with no evidence returns the STRICT answer, never the lenient one.** The gear picker
   shipped with `[].every(...)` deciding "all changed lines are cosmetic" for an empty diff, which
   dropped real changes into the one gear that skips proving them broken. Caught by pointing it at
   a plain UI file. The same mistake pointed the other way let a narration probe measure a
   `display:none` panel and report PASS.
2. **Red-proof every check before believing it.** Break the thing on purpose; watch the check go
   red; put it back. A check nobody has seen fail is a check nobody should trust.
3. **If it is not in `npm test`, it does not exist.** Ten probes were written on 2026-08-25 and
   none were wired in. None has run since.
4. **The rig is not a bug.** When the two-browser rig breaks, everything stops until it runs. A
   per-bug time budget must never be applied to the thing bugs are tested with — doing that
   silently turned "test every mode" into "test solo", and nobody said so out loud.

---

# THE WHOLE LOOP, END TO END — added 2026-08-26

> ### STEP 0 — WIDEN THE TIME HORIZON. What happened immediately BEFORE the bug?
>
> **Before you write the failing check, ask what preceded the fault** — and if one step back is not
> enough, ask what preceded *that*. A bug you cannot explain from its own moment is usually the
> consequence of a preceding one, and **a snapshot cannot show you a race**.
>
> **INTERMITTENT IS THE TELL.** A fault that appears in some runs and not others is almost never a
> wrong constant; it is two things happening in an order nobody fixed.
>
> **Earned 2026-08-27.** Sail squares were being drawn off the edge of a phone. Two days went into
> measuring WHERE they were — rects, transforms, the camera's scale — and two geometry theories were
> measured dead. Wyatt asked *"what happens right before the bug each time?"* and it moved in
> minutes: the squares are drawn, then the camera is asked to frame them **180ms later**, and the
> camera is allowed to refuse while a centre-stage card holds attention. The squares were correct;
> the ORDER was not.
>
> **It applies to instruments as much as to the game.** *"The trial says NOT RUN"* — what happened
> just before? A reboot cleared `/tmp`. *"The gear says NONE"* — what happened just before? A cutover
> moved the tree.
>
> Stated in full in `.claude/CLAUDE.md` (rule 6's family) and printed by
> `.claude/hooks/qa-gear-first.cjs` as step 0, so it arrives when you are about to change game code
> rather than in a file somebody read this morning.

**Everything above describes the sea trial. This describes the process the sea trial sits inside.**
It was refined across one long session in which **five separate instruments were wrong** and two of
the day's "fixes" were wrong before they were right. Each numbered step below exists because
skipping it cost something that day. The war stories are
[`HARD-WON-LESSONS.md` §10](HARD-WON-LESSONS.md).

**If you read one line: an instrument that cannot fail is not an instrument, and four of the five
that lied were measuring something ADJACENT to what they reported.**

## 0. Before you touch anything — ask what already exists

Read the subsystem's own doc (CLAUDE.md rule 20) **and** the comments around the code you intend to
change. On 2026-08-26 the "obvious fix" for a reported overlap would have **re-broken a defect fixed
weeks earlier**, and the comment saying so was four lines above the CSS. Every gate would have
stayed green. See §10g.

```bash
git log --all --oneline --grep="<subsystem>" -i          # the arguments already had
git log --all --format="%H %s" -S "<the number or fn>"   # where a quantity was last defended
```

## 1. WRITE THE PREDICTION DOWN — before you measure, before you fix

State in writing: **what you expect, why, and what would prove you wrong.** Then measure. Then say
plainly which parts were wrong. Roughly ninety seconds.

- **Name the falsifier**, or it is a wish. *"If no-cover-ask is gone but Deny is still never
  exercised, my reasoning is wrong"* — it was, and the note is why that got reported instead of
  quietly reframed as a partial win.
- **Write it BEFORE the result exists.** A prediction composed afterwards is always right.
- It is also what gives step 0 a chance to fire: you cannot check a plan against the graveyard
  until you have written the plan down.

Full rule: `.claude/CLAUDE.md` rule 6, *"write the prediction down before you measure"*.

## 2. RED-PROOF THE INSTRUMENT before you believe it

**Feed it the broken case and watch it go red.** If you cannot make it fail, you have not written a
test — you have written a sentence that always says yes.

Three of the day's own probes could not have failed: a trace that began after the animation had
finished; a test using an emoji with no artwork, so it never became the image it claimed to test; a
"does this cover that" check whose element-finder resolved to the full-screen container.

**And ask the harder question:** *what does this actually measure, and is that the same thing as
what I am about to claim?* Four of five failures that day were an adjacent measurement reported as
the real one — geometry reported as "has it stopped changing", a log phrase reported as "did Safari
run", a warm-process timer reported as "can he see this on his phone".

## 3. THE FOUR STEPS (unchanged — see the top of this file)

Show it broken → change it → show that SAME check passes → sweep.

**The check must address the REPORTED symptom.** Write the complaint down verbatim and make the
after-measurement answer that sentence. On 2026-08-26 a button was reported as covering cards
mid-scroll; the fix addressed *fully-scrolled reachability*, was measured there, was declared fixed,
and came back in the next trial. See §10f.

## 4. THE SWEEP — one fix, every site

`emojify()` proved the shape: the reported bug was one stranded full stop, and the sweep found
**five** places with the same fault plus a sixth waiting in the next line of copy. Fix centrally
where a central fix exists; when you fix at a call site, say why the central one could not see it.

## 5. RUN THE SEA TRIAL — and read the NOT-RUN column first

```bash
node scripts/qa/gear.mjs --since=HEAD~1   # AFTER a push, or it reports NONE. See below.
node scripts/sea_trial.mjs                # writes .planning/SEA-TRIAL.md
```

> **AFTER A PUSH THE GEAR PICKER GOES BLIND.** It diffs against `origin/main`, and rule 24's own
> workflow tells you to push so Wyatt can play it — which empties that diff and yields `GEAR: NONE`.
> **A `NONE` verdict on a day you changed game code is the tell, not the answer.** Third appearance
> of this shape; see §10h.

**"Did it run?" is answered by evidence captured, never by a phrase in a log.** The report once
said *"voyages that did NOT run: none"* while both Safari legs had died instantly — it matched
`NOT RUN —` and the gate had printed `ERROR:`. It now decides from `report.json`: **a leg that
captured no screens did not sail.**

## 5b. RUNNING THE TRIAL — cloud container vs Wyatt's Mac, written down so it stops being re-derived

*(Wyatt, 2026-08-28: "Add to Sea Trial's process document the steps to run it from a cloud
container and the steps to run it from local, because it seems like those are different and you
re-derive them each time at great time and cost." Every line below was paid for at least once.)*

**The command is the same everywhere.** What differs is the environment around it, and every
difference is listed here — if you are about to fight one that is not, add it to this section in
the same session.

> **WHICH environment to pick, and what each costs, is a separate question with its own document:
> [`CLOUD-VS-LOCAL.md`](CLOUD-VS-LOCAL.md)** — the measured 10-leg comparison, the traps unique to
> each, and the one thing only a Mac can answer (Safari). This section is the *how*; that one is
> the *where*.

### IS IT PROVEN? — the honest answer, 2026-08-28

He asked: *"Make sure the full Sea Trial can run in safari and chrome, at the three sizes, whether
in a cloud container or local… can you confirm this is the case?"*

| | status |
|---|---|
| **Chrome, all three sizes, cloud** | ✅ **proven** — build 2026.08.28.4, 10/10 voyages `finished=true` |
| **Safari (WebKit), all three sizes, cloud** | ✅ **proven, with a caveat that must be read** |
| **Either engine, local Mac** | ⏳ **not yet run here.** The runbook below is written and a session on his Mac holds `HANDOFF-2026-08-28-LOCAL-TRIAL.md`; until that run reports, the local half is documented, not demonstrated. Do not claim it. |

**THE SAFARI CAVEAT, stated plainly because it is the difference between "works" and "survives":**
Playwright's Linux WebKit (`WPEWebProcess`) **segfaults mid-voyage in the cloud container** —
diagnosed by core dump on 2026-08-28: SIGSEGV inside `libWPEWebKit`'s own compositing walk. Not
load (5/5 isolated runs died), not memory (cgroup `oom_kill` 0), and
`WEBKIT_DISABLE_DMABUF_RENDERER=1` does not stop it. **No flag of ours reaches it.** So the mount
does not prevent the crash — it *rides it out*: a persistent context keeps the game's own solo
save on disk, and on a crash it relaunches, reloads, lets the game's boot-resume replay the
voyage, and retries the failed call. That run's three WebKit legs took **11, 2 and 1** relaunches
and all three still finished. **Every recovery is counted and printed (`✱ N WebKit relaunch(es)`)
in the leg summary — a recovered leg must never read as an untroubled one.**

**Real Safari on real devices shares none of this**, and a local Mac run uses a macOS WebKit
build: **zero relaunches there confirms the crash is container-only; any relaunch there overturns
the diagnosis.** That row is the most valuable cell in the cloud-vs-local comparison.

### The matrix a FULL trial sails (Wyatt's 2026-08-28 ruling)

| | desktop 1890×960 | tablet 768×954 | phone 390×664 |
|---|---|---|---|
| **Chrome** | solo, passplay, crew | solo | solo, passplay, crew |
| **Safari (WebKit)** | solo | solo | solo |

Ten legs. **Three sizes** — desktop, tablet portrait, phone — with the tablet's 954 being D-42's
honest-viewport rule applied to an iPad (1024 screen minus browser chrome). **Both engines play
solo at every size**; Chrome alone carries the multiplayer modes, on the recorded argument that
the engines diverge on rendering/animation/layout, never on the wire. The leg table itself is
`legDefs` in `scripts/playtest_gate.mjs`; the FULL list is in `scripts/sea_trial.mjs` — change
either only with a matching edit to this table.

### From a Claude Code cloud container

```bash
nohup node scripts/sea_trial.mjs > "$SCRATCH/trial.log" 2>&1 &   # DETACHED — see below
```

- **Launch it detached (`nohup … &`) and watch the log.** The Bash tool's hard ceiling is 10
  minutes and a FULL trial runs longer — a foreground or background-tool run is killed mid-sail
  and reports nothing. Watch the log with a monitor/until-loop; a foreground `sleep` is blocked
  by the harness.
- **Chrome is pre-wired**: `$CHROME_BIN` → `/usr/local/bin/chromium` (a wrapper over the
  Playwright chromium in `/opt/pw-browsers`). Never run `playwright install` — the image sets
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and re-fetching is both slow and unnecessary.
- **WebKit legs work**: browsers live durably in `$PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`;
  the package resolves via `playwrightDir()` (`$PW_DIR` → `~/.pw` → global).
- **The vision judge needs the proxy's CA.** Outbound HTTPS goes through the agent proxy;
  `scripts/lib/vision.mjs` sets `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` itself when unset,
  but exporting it on the trial command is harmless belt. Never disable TLS verification.
- **Never `pkill -f chromium`** — the container's own shell wrapper matches and you kill your own
  session. The browsers are processes named `chrome`; kill by debug port (mp_rig's `killAll()`
  does this correctly, scoped to its own ports).
- **`/tmp` does not survive a container recycle.** A trial whose evidence directory vanished may
  be a reboot, not a failure — check mtimes before reporting NOT RUN (§10's "what happened just
  before"). Keep evidence under `.planning/` or the session scratchpad.
- **Firebase is reachable**, so the crew legs sail real rooms. Wyatt cannot see this machine's
  browser — the report, the screenshots, and the build stamp are the only evidence that leaves it.

### From Wyatt's Mac (local)

```bash
cd /Users/wyattroy/Documents/Projects/pastrypirates    # the ONLY checkout — worktrees are retired
node scripts/sea_trial.mjs
```

- Chrome resolves from the PATH; WebKit's durable home is `~/.pw` (package) +
  `~/Library/Caches/ms-playwright` (browsers) — both survive reboots; never install to `/tmp/pw`.
- No CA override needed; the judge reaches the API directly.
- **Rule 17 is live here in a way it is not in the cloud**: this is the laptop he is sitting at.
  `--mute-audio` always (his speakers are in the room), and every headless Chrome and
  `http.server` dies before you reply — the trial's own cleanup plus §8's pkill.
- Foreground is fine; there is no 10-minute tool ceiling.

**Which to prefer:** the cloud, whenever the session is already there — it costs his laptop
nothing. Fall back to local when the cloud run is STALLED (measured: the log stops growing for
minutes while legs sit unfinished — an environmental stall, seen 2026-08-28, cleared by re-running
the leg) — and per his standing order, **tell him within 10 minutes of launching if the trial is
stalled and whether it needs to run locally**, rather than silently retrying past the window.

## 6. READ THE JUDGE AS A WITNESS, NOT A VERDICT

Roughly half its findings survive contact with the source. **Open the screenshot. Then check the
graveyard.** Two named biases:

- **Deliberate whitespace reads as a defect** — three findings in one trial, all previously settled.
- **Small glyphs are misread** — it reported a literal `$` where the wind said `S`.

It is still worth having: it found both of that trial's real bugs. But never act on it unread.

## 7. SHOW IT TO A CEO BEFORE SHOWING IT TO WYATT

Fresh context, his request verbatim, what was actually done, and the previous verdict. Its question
is narrow — **did the thing he asked for happen?** Its verdict reaches him in ITS words, especially
when bad. Template: `.claude/CEO-BRIEF.md`, rule 25.

It has earned its place: it caught an untested build being certified, a dead sweep command, a
fabricated quote, and a cause asserted for three screens that was measurably wrong on one of them.

## 8. LEAVE THE MACHINE AS YOU FOUND IT

```bash
pkill -f remote-debugging-port; pkill -f http.server
```

Bound every probe. Kill it when you have the answer, not when the task ends. Never leave one running
across a reply — he is at the keyboard, on the machine it is heating.

---

## The one-screen version

| | |
|---|---|
| 0 | Read the doc **and the comments**. The argument may already be had. |
| 1 | **Write the prediction and its falsifier** before measuring. |
| 2 | **Make the instrument go red** before believing it green. Ask what it really measures. |
| 3 | Broken → change → **the same check** passes → sweep. Answer the reported sentence. |
| 4 | Fix centrally; sweep every site. |
| 5 | Sea trial. **Read NOT-RUN first.** `--since=HEAD~1` after a push. |
| 6 | Judge = witness. Open the picture, check the graveyard. |
| 7 | CEO before Wyatt. Its words, especially when bad. |
| 8 | Kill every browser and server. |
