# Hard-won lessons

Everything that went wrong, nearly went wrong, or cost real time on this project — with the
evidence that earned each rule. Written 2026-08-05 during the v2.1 build and playtest.

Sibling to `docs/DRIVING-THE-GAME.md` (which is *how* to drive the game). This is *what to distrust*.

**Per-subsystem specs, each of which must be read before touching its subsystem** (§0 explains why
this file is not a substitute for them):

| Document | Covers |
|---|---|
| `docs/BOT-DESIGN-PRINCIPLES.md` | what the bots are FOR — the objective, and every failure that came from not having one |
| **`docs/TRADE-SYSTEM.md`** | **the trade system — the rule, the data shapes, the four invariants, and what has already been tried and thrown away** |
| **`docs/BOARD-RENDERING.md`** | **the board — the layer stack, the two coordinate systems, how the camera reaches each layer, and why half of it is HTML** |
| `docs/BOT-V3-RACE-PLANNER.md` | the route planner, and what it already does (grep cannot tell you) |
| `docs/DRIVING-THE-GAME.md` | driving the game under automation, and measuring cost honestly |

Two of those are worth knowing what you will find in them, because both are easy to assume you can
skip. `BOT-DESIGN-PRINCIPLES.md` opens with the objective every bot decision has to serve (minimise
the expected turns until *this bot* wins) and records the failures that came from not having one: a
whole-turn planner that improved every behaviour statistic and still lost head-to-head, plus the two
tuning traps found inside it. `TRADE-SYSTEM.md` opens with four invariants, and a session that had
read this whole file broke two of them in a single change on 2026-08-14 — because the rulings behind
them were scattered across a commit message, a code comment and two lines of this file, and never
sat in one place until that document existed.

**Read this whole document at the start of every session.** Not the top two sections — all of it.
The 2026-08-08 bake-off session hit **three lessons already written here** and paid for each of them
again: `http.server` inheriting the cwd (§1), `no_undef_check` seeing only call-position identifiers
(§3), and shipping a check that could not fail (§2). Every one was already on this page, in these
words, and none of them was read. A document nobody opens is not a safeguard, it is a diary.

**And reading it once, here, at the start, is NOT enough — see §0.** On 2026-08-13 a session read
this whole file and then committed a failure recorded in its sibling anyway, hours later, at the
moment it applied. Lessons have to be re-read at their TRIGGER: before changing a shared quantity,
before touching bot AI, before a browser probe. §0 also carries the rule that would have saved that
whole day — **read the subsystem's own design document before writing a line**, because grep only
finds what you can already name.

---

## 0. READ THE SUBSYSTEM'S OWN DESIGN DOCUMENT BEFORE YOU WRITE A LINE

On 2026-08-13 I set out to teach the bots to price sailing under the wind. I wrote a wind-aware
distance field, changed a shared function's units to do it, measured it three times, and reverted
every line. **Each thing that went wrong was already written down in a document I had not opened.**

### It already existed, one function away

`docs/BOT-V3-RACE-PLANNER.md` is 152 lines. Section 4 says in one sentence that legs are already
*"costed by wind-aware whole-turn distance fields built from the real one-turn reachability rule
(4 squares, 2 once any step bites into the wind, rim never a staging post)"*. That is
`windReach3()` + `turnsFieldTo3()`, in the same file I was editing, shipped, and measured at **+3.5
ladder points on its own**. Two minutes of reading would have replaced a day of work with a
four-line change.

### grep cannot tell you a capability exists under another name

I had searched that file repeatedly — `waterField`, `stepToward`, `sailStates`. Not one of those
searches can surface `windReach3`. **grep finds what you can already name; the design document is
the index of what EXISTS.** Ask the question behaviourally — *"does anything here already price a
route under the wind?"* — and ask it of the doc, not the code.

### Reading a lesson ONCE, at session start, does not stop you committing it

This is the sharper finding, because it is about this very file. I read HARD-WON-LESSONS end to
end at the start of that session, exactly as its header demands — and then committed the failure
recorded in `BOT-DESIGN-PRINCIPLES.md` under *"de-hardcoding a constant WITHOUT rescaling what
reads it"*: I changed `waterField` from counting SQUARES to counting quarter-turns while
`destField()` and `stepToward()` both read it. That is the **−21.2 ladder regression** in a new
costume, committed by someone who had read the account of it that morning.

> **Tie the lesson to the TRIGGER, not to the session.** Before changing a quantity anything else
> reads, re-read the rescaling lesson. Before touching bot AI, re-read the principles. Before a
> browser probe, re-read §4. The re-read costs seconds at the exact moment it is worth something,
> and "I read it hours ago" is demonstrably not protection.

### Changing the executor when the planner decides is a change that cannot show up

The work went into `stepToward` — the MOVER. `planTurnV3` chooses the destination square before a
ship moves and says so in its own comment: *"the WHOLE turn is decided here, before a square is
crossed."* Six head-to-head configurations came back byte-identical — 30/30, 14/46, sweeps 2.43 on
every row.

**Identical numbers across genuinely different treatments are never a result.** They mean the
harness is not applying the treatment, or the code changed cannot reach the behaviour. Read them as
an alarm, never as "no effect".

### THE GIT HISTORY IS THE OTHER HALF — read what was already TRIED AND REJECTED

2026-08-14, and this is a distinct failure from the one above, because that day the design document
**was** read. `BOT-DESIGN-PRINCIPLES.md` end to end, `HARD-WON-LESSONS.md` end to end, the whole
trade subsystem. Then I changed how bots price a trade, drove bot hails **from 3.25 to 4.10 a
game**, and wrote a commit message arguing it was fine.

It was not fine. It reversed a hard-won result that lives only in the git log:

> `03a683c` — *"Trade SPAM is deliberately not increased — hails stay at ~2.8 a game. Wyatt: 'We
> dont want the table continuously spammed with shitty trade requests, it's exhausting for players
> to swat them away.'"*

Wyatt caught it in the transcript, before the build reached his phone: *"we already tried many
failed attempts at decreasing trade spam; have you read all those logs?"* I had not.

**A design document says how the subsystem WORKS. It does not say what has already been tried and
thrown away, which numbers are deliberately held, or which ruling was earned by a previous
failure.** Those live in commit messages, and this repo's commit messages are unusually rich
precisely so they can be read this way. Two greps would have found it:

```bash
git log --all --oneline --grep="<subsystem>" -i          # the arguments
git log --all --format="%H %s" -S "<the number or fn>"   # where a quantity was last defended
```

**The tell that you are about to repeat a settled argument:** you find yourself reasoning that some
number going *up* is acceptable because a different number stayed flat. If a quantity is worth that
much defending, somebody has probably already defended it — go and see who, and read what it cost
them.

Ask, and ask it of the log rather than the code: *has this project already had this argument?*

### The checklist this earns, before editing any subsystem

1. **Does this subsystem have a design document?** `docs/` carries one for the bots
   (`BOT-DESIGN-PRINCIPLES.md`), one for **trading** (`TRADE-SYSTEM.md` — the rule, the data shapes,
   the four invariants, the graveyard), one for **the board** (`BOARD-RENDERING.md` — layers,
   coordinates, the camera, and the checklist for adding an overlay), one for the route planner
   (`BOT-V3-RACE-PLANNER.md`), one for driving the game (`DRIVING-THE-GAME.md`), one per ruleset.
   Read the whole thing — they are 150–250 lines, minutes each.
2. **What has already been tried here and rejected?** `git log --grep` and `git log -S` over the
   subsystem, before writing a line. The doc holds the design; the log holds the graveyard and the
   guarded numbers.
3. **Ask what exists by BEHAVIOUR, not by name.** *"Is there already something that prices X?"*
   beats *"where is `functionY` called?"*
4. **List what reads whatever you are about to change** — its units and its range especially. A
   shared quantity has callers calibrated to its current scale (§ the −21.2 failure). **Including
   the tests and gates that read it**: a threshold compared against a quantity you just replaced
   with a calculation does not merely go wrong, it can go VACUOUS, and a gate that cannot fail
   still reads as protection.
5. **Find where the decision is actually made**, and confirm it by reading the caller, not by
   assuming the function with the obvious name is the one that matters.
6. **Only then write code.**

The arithmetic is brutal and worth stating plainly. The reading was about ten minutes. Skipping it
cost a redundant implementation, a latent units regression, three measurement suites incapable of
detecting anything, a full revert, and Wyatt's time spent telling me the bots already did the thing
I was building.

---

## 1. Where your edits land

### Absolute paths, always. The shell's working directory is not stable.

The Bash tool's cwd resets to the repo root, and **it announces the reset at the bottom of unrelated
command output**, where it is easy to miss. Twice in one session, edits meant for `v2/src/` landed in
`v1/src/`. Both were caught by `git status` and reverted before any commit — nothing else would have
noticed.

The trigger both times was a command beginning `cd /tmp && …` (to write a probe script), after which
every later relative path silently resolved against the wrong tree.

```bash
# LINUX cloud container (paths and `python3` are that machine's) — the lesson is the ABSOLUTE
# path, not the interpreter; on Windows the interpreter is `python`.
# not this
python3 - <<'PY'
p='src/ui/util.js'          # resolves in BOTH trees
PY

# this
python3 - <<'PY'
p='/home/user/pastrypirates/v2/src/ui/util.js'
PY
```

### The structural hazard: two trees with identical internal paths

`v2/` is a copy of the repo's own layout, so **`src/ui/util.js` exists in both**. A mis-rooted path
does not error. It opens a real file, the edit applies cleanly, `node --check` passes, the linter is
happy — and the wrong copy is now modified. **Every safety signal reports success.**

This is the same shape as the `CNAME` hazard in `CLAUDE.md`: a copy of the repo where a familiar path
quietly means something else.

### Run the constraint as a command

A "don't touch X" constraint you only hold in your head is one you will violate silently.

```bash
git diff --name-only | grep -v '^v2/'   # must print NOTHING
```

One line. It is the only thing that actually caught this, twice.

### `git checkout <ref> -- <dir>` restores, but never deletes

Restoring `v2/` from `origin/main` left three files behind — the ones that exist on the branch and
not on main. Checkout writes what the ref has; it does not remove what the ref lacks. `git diff
--quiet <ref> -- <dir>` said "differs" and named them, which is the only reason it was caught.

The same command also **silently reverted an earlier refactor** in that directory. A later scripted
edit then targeted the refactored signature, matched nothing, and did nothing — see below.

### A scripted `s.replace()` that matches nothing fails silently

Python string replacement is not an error when the target is absent; it returns the input unchanged
and the script reports success. Two edits in one session no-oped this way. One was caught by a gate,
one only by the ordering accident of a later assert.

```python
assert old in s, "target not found"   # on EVERY replacement, without exception
s = s.replace(old, new)
```

**And order the edits: prose first, mechanical global replaces second.** A global
`s.replace("!q.done", ...)` rewrote the very comment text a later match depended on, so that later
assert failed and the whole script aborted having written nothing. Atomic failure is the good
outcome here — it is what the asserts buy.

### `http.server` inherits the cwd too

A server started after a cwd reset served from the wrong root. `/v2/index.html` returned a 404 page,
which the probe rendered as *"the welcome screen is missing"* — a convincing phantom boot failure.

```bash
# LINUX cloud container — on Windows the interpreter is `python`, not `python3`.
python3 -m http.server 8493 --directory /home/user/pastrypirates
```

Always pass `--directory`. And `curl` one asset to confirm the root before blaming the code.

---

## 1b. A THROW IN THE TURN CHAIN IS AN INVISIBLE STALL — and it does not reach the console either

2026-08-14, playtest 22. Wyatt: *"When i counter-offer a bot trade the entire game stalls and stops.
No prompt appears. Nothing is playable... It happened immediately when i clicked counter offer."*
The whole fault was one call in one template string:

```js
poss(pn(p.idx))     // pn() and poss() BOTH take a seat index and BOTH render the name
```

`pname()` computes `NAMES[i].replace("Capt. ","")` **unconditionally, before every early return**, so
an array indexed by a finished `<b …>` string gives `undefined` and `.replace` throws. Every tap of
Counter, for every seat, from the day the counter rebuilt shipped.

**Three things about the SHAPE of this are the lesson, not the typo.**

**1. There is no error boundary anywhere in the turn chain.** `counterOffer` → `botOpenTradeLive` →
`botTurn` → the voyage loop is a chain of awaits, and a throw at the bottom rejects all the way up
and stops the game. Nothing renders, nothing is logged, no captain's-log line is written.

**2. It does not appear as a page error.** Measured over CDP with `Runtime.exceptionThrown`
subscribed: the tap produced `page errors: none`. It is a rejected promise the awaiting chain
swallows, so **the console is clean while the game is dead.** Do not take an empty console as
evidence that nothing threw — catch the rejection at the call you are testing and print it, which is
what turned this from a two-session hunt into a stack trace:

```js
flow.botOpenTradeLive(bot).then(v=>window.__probe='resolved:'+v,
                                e=>window.__probe='REJECTED: '+(e&&e.stack||e));
```

**3. It survives a refresh, and looks like something else entirely.** Solo replays a DECISION LOG, so
the refresh re-runs the recorded Counter press, throws in the same place before the board is ever
driven, and comes back **sitting at the starting position with every purse showing "–"**. That is
Wyatt's second sentence — *"the game remains unplayable but from the starting position"* — and it
reads exactly like the save being corrupt. It was one fault, not two. **A stall plus a broken-looking
resume is the signature of a throw on the replayed path, not of a bad save.**

**Why two earlier sessions fixed "the counter" and missed it.** Both (a6b81cd, 69b9f23) were
reasoning about what a counter *settles* — the three copies of the settlement, the slider's value in
the decision log. All of that is downstream of a prompt **that never rendered**. When a stall is
reported *at a tap*, the first thing to prove is that the next prompt appears at all. Everything
about what it decides is unreachable until that is true.

`scripts/seat_arg_check.js` is the gate: the four name renderers (`pn`/`poss`/`pname`/`rawName`)
take a seat index, and it rejects any call site handed a rendered name or a string literal.
`no_undef_check.js` cannot see this class at all — `poss` is defined and imported, and it is the
ARGUMENT that is wrong.

**And the stall itself is now visible** — Wyatt's call, same day. `voyageAground()` (`src/ui/util.js`)
paints a box carrying the build stamp, the error text and whether a refresh will help;
`runLiveNet().catch(...)` in orchestrator.js is the root of the voyage chain, with
`unhandledrejection`/`error` listeners in main.js as the belt behind it. Three things about it are
deliberate and must survive any edit: it uses **raw DOM and no imports**, because the thing that
failed may be the render path and a surface that needs the broken machine is not a surface; it says
**"start a fresh voyage"** whenever a decision log exists, because refreshing into a fault on a
replayed decision is what produces the "back at the starting position" half of these reports; and it
**does not retry or resume**, because play cannot continue past a turn that half-happened.
Proven both ways: no box after a clean boot or a played round, a box for a stray rejection, an
uncaught error, and a forced throw inside the live turn loop (stamp, `runLiveNet`, stack, all shown).

Two things the gate itself taught, both worth copying into the next one:

- **Its first run failed on the comment documenting the bug it exists to catch**, which quotes
  `poss(pn(p.idx))` verbatim. A check that cannot tell prose from code makes writing the explanation
  an offence. Strip comments — and strip regex literals with them, because this source contains
  `/"/g` and a naive scanner reads that lone quote as a string that swallows the rest of the line.
- **It prints the number of call sites it scanned (161).** The comment stripper is the one part that
  could quietly blank the thing it inspects, and a green run over nothing at all is the shape of
  check this project has shipped before. A count is falsifiable; a bare "OK" is not.

---

## 2. Do not trust your own reasoning over a measurement

This is the single biggest theme of the session. Every one of these was a confident, plausible,
**wrong** conclusion that a two-minute measurement overturned.

### THE USER'S DEVICE CAN BE THE ONLY INSTRUMENT — and three innocent engines look like proof

**The pulse bug, 2026-08-24/25, and it cost eight days.** Action-prompt buttons that should swell
were sometimes completely static on Wyatt's iPhone. Every theory assumed a FROZEN animation, and
every probe was built to catch one.

Three engines were driven at it and all three were innocent, honestly and repeatably:

| Instrument | Result |
|---|---|
| WebKitGTK 2.52 (`wk_probe.mjs`) | correct |
| WebKit 26.5, 12 isolated birth conditions (`wk_birth_matrix.mjs`) | all 12 swing at 1.15 |
| WebKit 26.5 playing real voyages (`pulse_menu_probe.mjs`) | 12 turn menus, 69 buttons, zero flat |

**Every one of those green results was true and none of them was evidence**, because the engine in
the fault was iOS 18.7 / AppleWebKit 605.1.15 — a generation older than anything drivable, and
reachable only on his phone. A negative from an instrument that cannot reach the fault is not a
negative about the fault. Say which engine you measured, in the sentence where you report the
result, or the reader will hear "not reproducible" and stop.

**What actually found it: making the game testify on HIS device.** The `?debug=pulse` beacon
(`src/ui/pulsebeacon.js`) printed one line that ended it:

    Trade:none(pp4Grow/running)   Pass +1:none(pp4Grow/running)

Three fields that cannot all be true: the stylesheet grants `pp4Grow`, the computed play-state is
`running`, and `getAnimations()` returns NOTHING. **The animation was never created.** There was no
frozen animation because there was no animation. Eight days of theories were all answering the
wrong question, and no amount of further instrumentation on the wrong engine would have found it.

**And the thing that made the log worth reading was HIS controlled comparison, not our tooling.**
Wyatt: *"if i stay put instead of sail, the pass/trade buttons DO swell."* One action toggled,
everything else held still — that turned an intermittent ghost into a switch and pointed straight
at the only code branch on that axis (`stageSettled()`, the camera tween). **When something is
intermittent, ask him for the toggle before you build another probe.** It is thirty seconds of his
time and it outranks a day of ours.

**The generalisable shape, worth recognising early:** a UI gate that HIDES an element while
something else finishes will also hide it from the engine's animation machinery. Anything granted
to a not-yet-drawn element can be silently declined. Grant it at reveal, not at build — and better,
per Wyatt's own ruling, **do not build the thing at all until the board has stopped moving.**

### WIDEN THE SCOPE TO WHAT HAPPENED JUST BEFORE — the trigger is rarely inside the broken thing

**Wyatt's takeaway from the pulse bug, 2026-08-25, in his words:** *"when you debug, expand your
search scope to look at the events that happened just before the bug (in this case, sailing) in
order to create your hypotheses."*

**This is the lesson that would have saved eight days, and the evidence was already on the screen.**
Every hypothesis for a week was about the broken thing itself — the button, its CSS, its classes,
its birth conditions, the engine's animation machinery. All of it looked INSIDE the dead prompt.
The cause was an action the player took two seconds earlier: **sailing**. Sail, and the boat's glide
makes the reveal gate hold the buttons hidden for up to 1.4s, and the animation is never created.
Stay put, and the gate is instant and the button breathes.

**The evidence had been sitting in our own artefacts, unread as such.** Frame strips of the seconds
before each dead prompt had already been built and looked at — and read for *"what does this prompt
look like"* rather than *"what did he just DO"*. The sail is plainly visible in four of them. One
sentence from Wyatt named it; no further instrumentation was needed after that.

**Do this by default when a bug is intermittent:**
- For every occurrence, write down the last 2-5 seconds of PLAYER ACTIONS and GAME EVENTS before it
  — not the state at the moment it appeared. A prompt's own DOM tells you what it IS, never what
  happened TO it.
- Then look for what the bad occurrences share and the good ones do not. Here it was one word.
- **Ask him for the toggle.** "Is there something you can do differently that makes it stop?" He
  produced *"if i stay put instead of sail, the pass/trade buttons DO swell"* in thirty seconds,
  which is a controlled experiment no probe had thought to run.
- Prefer this BEFORE building instruments. A day of measuring the wrong thing is indistinguishable
  from a day of measuring nothing (see the three innocent engines above).

### Never present an inference from a screenshot as proof

Twice I read pixel positions off a phone screenshot, reasoned about them, and stated the conclusion
as established fact. Both times Wyatt — correctly — rejected it. The second rejection was blunt:
*"Your diagnosis is wrong and insanely so."*

He was right. Squinting at a 400px board image and counting grid squares is not evidence. If a
screenshot is the only artefact, say what it *suggests* and then go and measure the thing.

**Better: make the next occurrence self-reporting.** Rather than keep arguing about the sail
highlights, I shipped a self-check that re-derives the legal move set from scratch on every prompt
and, if it ever disagrees with what is drawn, replaces the helper line with a red diagnostic naming
the wind, the position and the offending squares — so the screenshot *becomes* the bug report.

### A probe that inverts the function it is testing proves nothing

To check whether the sail highlights were drawn in the right place, I derived grid coordinates by
inverting `sailHighlightRect()` — the very function that draws them. **Any error would have cancelled
out.** The honest check was comparing the highlight rect's centre against where ships are drawn
(`(c+0.5)*cellPx` in both — they agreed).

The general form: **verify against an independent path, never against the suspect itself.**

### A CHECK BUILT ON YOUR OWN ARITHMETIC IS THE SUSPECT, NOT THE WITNESS

2026-08-14, and the reason it earns its own entry beside the probe-inversion lesson below is the
timing: it was committed **twice in ten minutes, by someone who had spent the previous hour writing
a document that quotes the rule**. Reading it, writing it down, and quoting it are all demonstrably
not the same as applying it.

One overlay fix, three verifications:

1. **Compared the moved element against the board's top-left corner.** Under a zoom, points at
   *different* board positions move by *different* amounts — the comparison has no meaning. It
   reported **FAIL on a correct fix.**
2. **Computed where the element should be from the SVG viewBox**, assuming the content stretches.
   It is `preserveAspectRatio="xMidYMin meet"` into a non-square box, so it **letterboxes**. That
   reported a confident **200px drift that did not exist**, and I began hunting a second bug.
3. **Compared each element with the grid rect the SVG ITSELF DREW for that same cell.** No formula
   of mine anywhere in it. 1.0px worst at rest, 2.8px zoomed — across all 40 elements.

Only the third is evidence. The first two dressed my own re-derivation up as an oracle, and both
failure modes are seductive because the arithmetic *looks* like independent verification.

**The rule: compare against something the RENDERER produced, never against arithmetic you wrote.**
The SVG's own rects. `getBoundingClientRect` on the real element. `getComputedStyle().transform`
for the live animated value. **If your check needs a formula, the formula is the most likely thing
in the room to be wrong** — and it will fail in whichever direction costs you a false alarm or a
false all-clear, with no way to tell which from the number alone.

Two specific liars worth knowing, both of which produced the above:

- **A non-square SVG box letterboxes.** `rect.width / viewBox.width` is only the scale when the
  aspect ratios match. Check `preserveAspectRatio` — and note it may be set at RUNTIME rather than
  in the markup, which is where you would look.
- **A size ratio is not a size.** `getBoundingClientRect` on a *rotated* square returns its
  axis-aligned bounding box, √2 ≈ 1.41× the side. That reads as "the element is too big" and is not.

Full board-geometry account, including the layer stack and the camera: `docs/BOARD-RENDERING.md`.

### Write the independent implementation

When Wyatt insisted the movement rule was broken and I could not find it, the thing that settled it
was a brute-force enumeration of every path up to 4 steps, **sharing no code with the game**,
compared against the game's own reachability across 1,920 board/position/wind combinations. Zero
disagreements in either direction. That is proof; "I read the code and it looks right" is not.

### Verify that a check can FAIL

Before trusting the sail self-check's silence, I planted an illegal square three moves upwind and
confirmed the check flagged it. A check you have only ever seen pass is indistinguishable from a
check that cannot fail.

### Pure functions can be measured exactly — do that instead of eyeballing

Asked to make wind particles "20% speed", the temptation is to change the number and look at it.
`windDotFrame()` is pure, so:

```
distance travelled in 1s: 48px of a 400px layer -> 0.120 layer-heights/sec
prototype was 0.35 + 0.5*0.5 = 0.600  ->  exactly 20%
```

### Measure rendered geometry, never compute it

Two separate compass-chip failures came from arithmetic that looked right:

| What I assumed | What was true |
|---|---|
| SVG units ≈ screen pixels | viewBox is 640 wide, board renders ~374px → **1 unit ≈ 0.58px** |
| The chip's `transform` attribute positions it | A CSS animation writing `transform` **overrides the SVG attribute entirely** |
| 13 chars at font-size 16 fits a 128-unit box | Text measured 132 units — **it overflowed its own chip** |

The CSS-over-SVG one is worth its own line: **a CSS `transform` silently erases an element's SVG
`transform` attribute.** The chip's position vanished whenever the storm pulse turned on, snapping it
over the dial and 28px off the board. Fix: position on an outer `<g>`, animate an inner one.

```js
// getBoundingClientRect on the real element, compared to the board's own rect
const r = el.getBoundingClientRect(), b = svg.getBoundingClientRect();
{ left: r.left - b.left, right: r.right - b.left, boardW: b.width }
```

### Emphasis is a measurement, not a look

`<b>` inside `.apMsg` looks like it does nothing, because `.apMsg` is already `font-weight: 700` and
the bold only reaches 900. It IS applied; it is just nearly invisible. Read the computed
`fontWeight` of both the container and the emphasised span before concluding either "the bold is
broken" or "the bold is fine".

### DO NOT SWAP THE RECORDED METRIC FOR A MORE SYMPATHETIC ONE

The worst version of this mistake is not failing to measure. It is measuring, getting a bad number,
and quietly arguing your way onto a different number that looks better.

2026-08-14, verbatim from my own commit message, defending bot hails rising 3.25 → 4.10 a game:

> *"IDENTICAL re-hails 31 → 32 — flat. THIS is the spam metric… The extra repeats are all re-offers
> at a BETTER price, which is haggling: a bot that improves its offer after a no is doing what a
> human does."*

Every clause is true. The conclusion is wrong, because **the project had already decided which
number counts, and it is not that one.** Four words, already in this file, in §5:

> **"the announcement IS the spam"** — filtering *responses* barely moved anything (706 → 543);
> moving the check before the hail took it to **375**.

A hail reaches the whole table, so a better-priced re-offer is still an announcement to swat away.
I had read that entry the same day. What defeated it was that "identical repeats" was *my* metric —
I invented it mid-task, it was genuinely defensible, and it said what I wanted.

**The rules:**

1. **When a guarded quantity moves the wrong way, that is the finding.** Not a thing to be
   contextualised by other quantities that moved the right way.
2. **A metric you invented during the task is a hypothesis, not a verdict** — especially when it
   arrives just in time to excuse a result. Prefer the number a previous session already fought for,
   and if you think it is the wrong number, say so *to Wyatt* rather than substituting your own.
3. **Write the losing number in the summary anyway, first, in its own row.** Mine was in the table —
   `hails 3.25 → 4.10` — and I walked straight past it because the sentence underneath told me it
   was fine. A number nobody is allowed to explain away is the only kind that protects anything.

### Beware confounded metrics

After teaching bots to read the storm forecast, "storm pushed them further" went **36% → 44%** and I
briefly reported the change as a regression. It was not: the bots were now *closer to their targets*,
so there was less room to be pushed closer and more to be pushed further. The honest outcome measure
was game length, which **improved 15 → 14 rounds**.

Pick the metric that measures the *goal*, not a proxy that moves for other reasons.

---

## 3. Verification tooling that lies to you

### A FIXTURE THAT CANNOT EXIST IN THE GAME PROVES NOTHING — validate injected state against the engine's own constants

2026-08-14. A browser probe for the black market's 2-crate barter injected the hold
`["cocoa","cocoa","lemon"]`. **There is no lemon in Pastry Pirates.** `ING_ALL` is
wheat/dairy/sugar/eggs/cocoa/spice/vanilla, and it has been for the whole project.

Nine assertions passed, and the result was reported to Wyatt as proof. His reply was the first
anyone knew: *"There is no lemon in the game! How is this possible?"*

It is possible because **`barterCrate` only splices what it is given** — it validates that the
crates are in the hold, not that the hold is legal. So a fabricated crate rides along invisibly.
What actually settled was real (two `cocoa` bought one `wheat`, the lemon was a passenger that was
never spent), so the mechanic *was* exercised — **by luck, not by the test**. Had the barter picked
differently, the run would have "proved" a trade in a currency the game does not have.

**The tell was in the output, quoted verbatim in the report, and read straight past:**

```
step 1 ... || Cacao Pods ×2 / lemon
```

`iname()` falls back to the raw key when an ingredient has no display name. Every real crate renders
as a title-case name — "Cacao Pods", "Crystal Sugar". **A bare lowercase word in a list of proper
names is the game telling you the thing does not exist.** Mixed casing in rendered output is a
fixture bug until proven otherwise.

The rules, cheap to follow and each one would have caught it:

1. **Injected state is asserted, not assumed.** A probe that seeds a hold, a purse, a shelf or a
   position must first check what it seeded against the engine's own exported constants —
   `ING_ALL`, `ings`, `dockOf`. One `check()` line: `h.every(x => ING_ALL.includes(x))`.
2. **Prefer reading a real value to typing a literal.** `g.ings[0]` cannot be wrong; `"lemon"`
   can. Every hand-typed game noun in a probe is an opportunity to invent one.
3. **Read your own PASS output as evidence, not as a verdict.** The count of passing assertions
   says nothing about whether they asked the right question. The interesting information is in the
   strings you printed beside them — which is exactly where this was sitting.

Same disease as the falsy zero below, one level out: there, the harness miscounted real games;
here, the harness ran a game that could not be real. **A green check on a fixture nobody validated
is the most expensive kind of green.**

### A FALSY ZERO IN YOUR OWN HARNESS — this one cost three wrong diagnoses in one session

`Game.play()` returns a **seat index**, so seat 0 winning returns `0`. A measurement harness written
as `if (!winner) unfinished++` therefore counts **every single win by seat 0 as an unfinished game**.

On 2026-08-09 that produced a confident, entirely fabricated crisis: "46 of 300 voyages never
finish", then "my change took it to 57", then a whole diagnosis and two rewrites of the bot's fight
pricing aimed at a regression **that did not exist**. Every game finished, before and after. Checking
took one line:

```js
const w = g.play();
if (w == null) unfinished++;     // NOT if(!w) — seat 0 is a real winner
```

**The tells, all of which were visible and all of which were rationalised away:**

- The "unfinished" count sat near a quarter of games in a four-player table. That is the shape of
  *one seat's win share*, not of a stall.
- Mean voyage length was 17.5 rounds while the cap is 150. **46 games at the cap is arithmetically
  impossible with that mean** — the two numbers could not both be true, and the contradiction was
  printed side by side for three runs before anyone read it.
- An earlier harness in the same session had already hit the sibling bug: `g.players[w.idx]` on a
  number, silently yielding `undefined` and a wins table of all zeros. The shape was known.

**The rules this earns:**

1. **Never truth-test a value that can legitimately be `0`, `""` or `false`.** Use `== null`.
   Indices, counts, coin totals and seat numbers are all in this trap.
2. **Sanity-check a metric against another number in the same output before believing it.** Two
   figures that cannot both be true mean the harness is wrong, not the game.
3. **Confirm what a function returns before measuring it** — index or object, one line in a REPL.
   Three rewrites were paid for skipping that.
4. A harness is code and it is *unreviewed* code. It gets no more trust than the thing it measures —
   see §2, which says exactly this and was written after a different instance of the same mistake.

### `game.events` IS EMPTY UNLESS YOU SET `record = true`

`ev()` opens with `if(!this.record)return;`. A headless harness that builds a `Game`, calls
`play()` and then reads `g.events` gets **an empty array**, and every count derived from it is zero.

That is not a loud failure. Measuring how often bots used the new black market, every row of the
sweep read `0 uses` — which looks exactly like *"the mechanic is dead, nobody ever takes it"*, a
completely plausible finding that would have been reported as a result. What gave it away was a
control that could not possibly be zero: **shelf buys were also 0**, and crate-buying is the entire
economy of the game. `g.tokens` proved it — shelves had drained from 3 to 0.

    const g = new Game(cfg, seed);
    g.record = true;              // <- without this, g.events stays empty
    g.play();

**The general rule, and it is the third instance of this family in this section: put a control in
every harness whose value you already know.** A number you cannot sanity-check is a number you
cannot trust — see the falsy-zero entry above, where mean voyage length and the "unfinished" count
could not both be true and were printed side by side for three runs before anyone read them.

**Also: `roundCfg()` returns `bakeoff: true` headless.** `bakeoffEnabled()` falls back to the
constant when there is no `location` to read, so `play()` routes to `playBakeoff()`, not
`playClassic()`. That is the right ruleset to measure for /4 — it is what ships — but say which one
a number came from, because the two are different games.

### `no_undef_check.js` only inspects CALL-position identifiers

`href: STORM_CLOUD_IMG` — a bare value reference to an unimported constant — **passes the gate
clean**. It would have shipped as a silently broken image. The check is a floor, not a ceiling.

### A gate's ROOT is wherever the gate's FILE lives — check which tree it scans

`scripts/no_undef_check.js` computes `ROOT = __dirname/..`, so from `scripts/` it scans the repo
root's `src/` — **v1**. The copy that covers v2 is `v2/scripts/no_undef_check.js`. For an entire
feature I ran the root one and reported "no-undef green" about code it had never opened.

It passes either way, which is what makes it dangerous: a gate scanning the wrong tree is not silent,
it is *reassuring*.

```bash
node scripts/no_undef_check.js   # the one that reads v2bakeoff/src/
```

`module_graph_check.js` and `ui_contract_check.js` exist only at the root and have **no v2
equivalent at all**, so they have never covered v2. Do not quote them as passing for v2 work.

**Prove a gate covers the file you care about**: plant a deliberate fault in that exact file, watch
it fail, revert. It takes twenty seconds and it is the only thing that distinguishes "green" from
"blind".

### Chrome caches ES modules per URL

Documented in `DRIVING-THE-GAME.md` §1 and it *still* cost two rounds this session. A fix looked
broken because the browser served a cached `flow.js` from a port used earlier.

- **Use a port you have never loaded**, every time.
- When a change appears not to have taken effect, `curl` the file from the server and read it before
  debugging the code.
- On a phone: **a private tab**, not a reload. A normal refresh will serve the old modules and the
  fix will look broken.

### Regex-deleting an arrow-function entry stops at the wrong brace

Deleting narration entries with a brace matcher failed twice, because for
`key:(a,b)=>({...})` the depth counter returns to zero at the **params** paren, long before the body
ends. It cut the key and left the body, producing a syntax error.

**Cut entry-to-next-entry instead** — find the next line matching `^  \w+:` and delete up to it.
Immune to params, bodies, template literals and nesting alike.

---

## 4. Probe hygiene

- **Playwright is not installed.** `npm install playwright --no-save --prefix /tmp/pw`, then launch
  with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. Do **not** run
  `playwright install`.
- **`clip` takes `width`/`height`, not `w`/`h`.** Cost three runs before I read the error properly.
- **Bound every probe and kill it the moment you have the answer.** `ps aux | grep chrome-linux` and
  `grep http.server` both at zero before you finish. A worker restart mid-session killed two
  background runs and left orphans.
- **`pkill -f <pattern>` KILLS YOUR OWN SHELL when the pattern is in your own command line.** This
  is the cause behind the entry that used to sit here ("pkill inside a compound command aborts the
  rest of it") — it does not abort, it is *killed*, because `-f` matches full command lines and yours
  contains the literal pattern. Proved directly: `pgrep -af "unique-marker-abc123"` returns the very
  bash process running it. The cost is not the odd exit code, it is that **everything after the
  pkill never runs** — including, repeatedly, the `ps | grep` that printed "(clean)". Cleanup was
  reported as verified by a command that had already been killed.

  ```bash
  # Mac / Linux ONLY — neither `pkill` nor `pgrep` exists in Git Bash on Windows, which is the
  # machine that runs the relay. Ask `node scripts/qa/stray_probe_check.mjs` instead: it works
  # everywhere and prints the right kill command for the machine you are on.
  pkill -9 -f "[r]emote-debugging-port"   # the bracket cannot match its own command line
  ```

- **A probe that times out is not evidence of absence.** An 18s and a 30s window against a ~50s game
  day both reported "the bench never appears", which read exactly like a broken feature. It appeared
  at 48s. Size the window from the thing being waited on, and say what you actually waited.
- **A loop that never breaks will hand you its last sample as if it were the answer.** A 70-iteration
  poll whose `if (found) break` never fired still ended with a truthy-looking final reading, and it
  was reported as success. If a loop has a break condition, assert that it broke.
- **A driven game takes tens of minutes to reach an end of voyage.** Inject the state instead
  (`DRIVING-THE-GAME.md` §5e). Injecting a full recipe at a human prompt reached the End of Voyage
  screen in ~90 seconds.
- **`appState` is not a window global.** `const st = (await import('/v2/src/state/index.js')).appState;`
  — a probe reading `window.appState` throws, and the resulting error looks exactly like a game bug.

### 2026-08-21 — a DOM-clicking driver cannot see an off-screen button, and a `transform` on `body` changes the coordinate space of every fixed overlay

Wyatt's 7am solo playtest found the radial fan, the ask pill, the apSub tooltip and every narration
bubble+pointer pushed off toward a corner on desktop, with Dock/Trade/Attack stacked invisibly
under Pass — game-stopping, could not dock. The build that shipped it had passed every existing
`scripts/*_check.js` gate and the overnight QA that preceded it, because **every one of those
checks asks whether a renderer FUNCTION ran, never where on screen the thing it drew actually
landed.** A driven-game QA pass would have missed it too, for a related but distinct reason:

**A DOM-clicking driver (`element.click()`, `dispatchEvent(new MouseEvent(...))`) fires a listener
regardless of whether the element is visible, on-screen, or stacked under something else.** It
proves the button EXISTS and HAS a handler; it proves nothing about whether a real player could
have seen or reached it. This build's Dock button was exactly that: present, positioned, and
completely invisible, pixel-stacked under Pass — a scripted driver clicking `.apBtn` selectors
would sail straight through it without ever noticing, which is why no automated QA pass caught this
before Wyatt did with his own eyes. **A QA driver must assert on-screen visibility — the rendered
rect is non-empty, inside the viewport, and not fully covered by a later sibling — before every
click it makes**, not just that `querySelector` found something with a listener attached.

**The root cause, for the next time a `transform` is put on an ancestor to solve a sizing
problem:** `getBoundingClientRect()` always resolves to the TRUE viewport, regardless of any
transform on any ancestor (CSS spec, unconditional). But a `transform` on an ancestor makes THAT
ancestor the containing block for every `position:fixed` descendant (also CSS spec, unconditional).
The moment those two facts coexist — a transformed ancestor AND code that reads a viewport-relative
rect to place a `position:fixed` descendant — every such placement is off by the transformed
ancestor's own offset from the true viewport. It is invisible in code review (each line reads
correctly in isolation) and invisible to any check that only asks "did the renderer run", and it
reproduces at 100% on every desktop width the moment the transformed ancestor centres itself
(`margin:auto`) rather than sitting flush with the viewport's own origin. **Before adding a
`transform` to an ancestor for any reason, grep every descendant for `getBoundingClientRect()` and
`position:fixed` — every one of the former feeding a `left`/`top` write on the latter needs the
ancestor's own offset subtracted, once, at the seam, not at each of the (in this case, dozens of)
call sites separately.** Full account: `.planning/debug/resolved/desktop-radial-fan-offset.md`.

---

## 5. Design and code lessons

### A NEW CONTROL IS A NEW DECISION — and a decision the log cannot see rots the whole voyage

Playtest 21 replaced the counter-offer's ±1 coin stepper with a drag slider. The stepper spelled its
answer out in button presses, which `ask()` already records; the slider's number lived in a `ref`
object the confirm button knew nothing about. **Measured on a real trade: the captain dragged it to
6 and the decision log gained exactly `[0]` — the index of "Offer it!", and nothing else.**

Solo play persists as a *decision log*, not a state snapshot: a refresh replays your choices against
the seed. So a number that never reaches the log replays at the control's floor — 1 coin instead of
6. That is not a cosmetic difference. It is a different offer, a different answer from the holder, a
different `r()` draw, and from that moment every later recorded decision lands on a prompt it was
never recorded against. From the seat, Wyatt's words: *"the game was simply reset and stalled and
the captains log was empty and nothing happened."*

**The rule, and it generalises past sliders:** anything a player can set — a drag, a dial, a text
field, a multi-select — is a decision, and it goes through the same seam `ask()`/`pickCell()`/
`bakeoffPrompt()` go through. If you are adding a control whose answer is not "which button", ask
where the answer is written down before you ask how it looks.

Three things this cost that are worth copying:

- **The gate counts, it does not pattern-match.** `scripts/dlog_quantity_check.js`'s first version
  looked for `=== "ok") return <expr>;` and read the expression — then I reformatted that branch into
  a block and the gate went green while silently covering half of what it claimed. Counting confirm
  branches against `logQuantity()` calls is immune to how the branch is written.
- **The end-to-end probe's fidelity check had teeth only sometimes.** Comparing the replayed event
  prefix catches divergence *when the wrong coin count changed the outcome*, which is not every run.
  The check that actually proved the fix was the narrow one — "is the chosen number in the log" —
  and it was verified by neutering `logQuantity` and watching it fail. **A broad check that passes
  for the wrong reason is worse than a narrow one that cannot.**
- **Bump the save's schema stamp in the same commit.** `SOLO_SCHEMA_V` 1 → 2, because a save written
  before the new entry has one fewer entry per coined trade — replaying it is exactly the misaligned
  log the fix exists to prevent. The stamp is what makes an old blob "no resume" rather than a
  quietly wrong one.

### When you replace an algorithm, find out what the old one was compensating for

v1's `stepToward` used Dijkstra. The v2 rewrite scored candidate moves on Manhattan distance instead.
Manhattan lies next to land — a dock two squares away round the corner of its own island is four
squares of real sailing — so bots refused every move that did not shorten a line they could not
travel. **A third of all bot turns did nothing at all.** The tell was in the data (33% dead turns),
not in the code, which read perfectly sensibly.

### A rule the agents ignore reads as an unfair rule

Storms looked brutal at 38% of ships grounded per storm. The rules were fine; the **bots were sailing
into storms the compass had already shown them**. Teaching them to look one round ahead halved it to
20% and changed nothing else about how they play.

**Before tuning a number, check whether the agents are actually using the information the design
already gives them.**

### Deleting a punishment can delete a whole family of edge cases

The storm rule had grown five outcomes and three meanings for "dock". Asked what would simplify it
most, Wyatt dropped the lost turn entirely. The rule became one sentence — *"Land and other ships
stop ye short"* — and out went four narration entries, their audio mappings, an engine outcome, the
forfeit branch in **both** turn paths, and a how-to-play paragraph.

It cost nothing measurable: storms still shove 2.9 squares (most of a turn's sailing) and still fling
~0.85 ships per storm into the rim; **median game length did not move**.

### A justification rots independently of the behaviour it justifies

A comment explained why only baking ships fade, on the grounds that a docked finisher "is still a
legal target, still worth attacking". True in v2 classic. False in the bake-off, where Tortuga is
sanctuary and `done` is only ever set by the call that ends the voyage. The **behaviour was correct**
and the **stated reason was not** — carried across from the other ruleset and asserted as current.

Wyatt caught it, because a wrong reason is what the next change gets built on. When a rule is copied
between two rulesets, re-derive why it holds in the second one; do not port the sentence.

### One word meaning three things will produce a family of bugs

"Dock" meant *a shelter you can be blown into*, *a shelter that holds you against land*, and *not a
shelter that stops you being blown away* — depending on approach direction. Two bugs in that family
surfaced within one session. `isBerth()` is now the single answer to "is this a berth".

### Anything drawn over a focal element competes with it

Three attempts at the forecast marker:

1. **Ghost needle** — same object, smaller and greyer. Mistaken for the live wind; produced a bogus
   "I sailed 3 upwind" bug report.
2. **Red chevron on the needle** — a genuinely different object and perfectly legible, but it shouted
   louder than the thing it was annotating.
3. **A chip beside the dial** — annotates without competing. This one worked.

### Silence is a bug

Removing the grounding rule left a storm outcome (land stops you) that narrated **nothing at all**.
Wyatt asked for the "dropped anchor" line back, and it turned out to be exactly the line that filled
the hole. When you delete a rule, check what its narration was covering.

### Rendering from event snapshots hides mid-turn state changes

The Captains panel draws coins from `events[evIdx].state`, not live player state. Dock coins were
awarded *before* the buy prompt but the event was emitted *after* it — so the game offered a purchase
priced against a total it had not shown yet. Fix: a silent `purse` event carrying the new snapshot at
the moment of the mutation.

**Any state change separated from its event by an `await` is invisible until the event lands.**

### The check must run before the side effect it prevents

Bot trade memory filtered *responses* after the offer had already been announced. But **the
announcement is the spam** — offers barely fell (706 → 543). Moving the check before the hail:
706 → 375, identical repeats **365 → 31 (−92%)**, and the hit rate doubled.

**READ THAT PHRASE AS A STANDING CONSTRAINT, NOT AS THE STORY OF ONE FIX.** On 2026-08-14 it was
violated by someone who had read this very entry that morning — see §2's *"do not swap the recorded
metric"*. It is short enough to be mistaken for a description of a past bug. It is not; it is the
rule:

> **A trade hail is broadcast to the WHOLE TABLE (rule 4). Its COUNT is the number of interruptions
> a player must swat away. That count is a guarded number — `03a683c` pinned it at ~2.8 a game on
> purpose — and no improvement to offer quality may raise it.**

The bots-side statement of the same constraint, with the current figures, is the hail-volume
invariant in `docs/BOT-DESIGN-PRINCIPLES.md`. **Any change to bot trading reports hails per game
beside whatever else it improved**, or it has not been measured.

**The whole trade system — the rule, the data shapes, all four invariants, where every decision
lives, and what has already been tried and failed — is `docs/TRADE-SYSTEM.md`. Read it before
touching anything that trades.** It exists because this lesson, and the ruling behind it, were
scattered across a commit message, a code comment and two lines of this file, and a session that had
read all of them still broke it.

### `needs()` excludes what you already hold

`def.ing.some(i => needs(def).includes(i))` is **always false** — `needs()` is the recipe *minus* the
hold. The battle flee condition read that way and defenders fled **0 times in 3000 simulated
fights**. Test held crates against `recipe`, not `needs`.

---

## 6. Working with Wyatt

### ASK IN A SHORT TURN, AS THE FIRST THING YOU DO — never behind long work

**A question form is a TOOL CALL THAT LIVES INSIDE ONE TURN.** If that turn ends for any reason —
a timeout, the sandbox being re-provisioned, an interrupt — the form is cancelled and **everything
he has typed into it is destroyed**. He does not get it back, and he has to reconstruct answers he
had already thought through.

Wyatt, 2026-08-13: *"Multiple times in the past few days i have started answering questions then the
sandbox seems to glitch and time out and you lose all of my feedback and thoughts. It is
frustrating."*

**The part that is our fault, and is entirely controllable: WHERE IN THE TURN WE ASK.** The pattern
that kept destroying his input was asking at the *end* of a long turn — ten to fifteen minutes of
browser probes, measurements and edits, and only then the question form. So the form went up at the
moment the turn was oldest and most fragile, and then sat there while yet more long work ran behind
it. That is the worst possible ordering and it is the whole bug.

The rules, in order of how much they save:

1. **Ask as the FIRST action of a turn**, before any probe, server, browser or long edit. The form
   should reach him seconds after his message, not minutes.
2. **Never leave a question pending behind long-running work.** Get the answers, end the turn, then
   go and do the work in the next one. A turn containing both an unanswered question and a five
   minute probe is a turn that will eventually eat his thinking.
3. **Commit and push incrementally.** A dead turn should cost minutes, not a session. Never carry a
   large body of unpushed work across long-running tool calls.
4. **Do the homework in an EARLIER turn, not the same one.** His standing rule is to arrive with
   measurements in the options (`CLAUDE.md`) — that is still right, but it means measure in one
   turn, ask at the top of the next. The two are not required to share a turn, and they must not.

The failure is silent from our side: the tool simply returns as though it was never answered, so
there is no way to tell "he did not reply" from "his reply was destroyed". **If a question comes
back unanswered or the turn was interrupted near one, assume his input was lost, say so, and re-ask
immediately** — do not make him raise it.

- **Ask 2–5 clarifying questions before building** (his standing rule, in `CLAUDE.md`). For the v2
  ruleset this ran to 62 questions across 16 batches before a line of code was written, and it was
  the right call — several answers were "a better third thing" neither option offered.
- **Taste, placement, wording and "how much is enough" are his. Mechanism is yours.** When he asks for
  copy, *propose it for approval* rather than shipping it silently.
- **He asks for renders — produce actual images.** Screenshot the real thing at phone scale
  (`viewport: {width:430,height:930}`) and send it. Do not describe what it will look like.
- **When he says a diagnosis is wrong, re-measure — do not defend it.** Both times he pushed back
  this session he was right and I was reasoning from too little.
- **Flagging an assumption afterwards is not asking.** "Simplified recipe" was genuinely ambiguous.
  I noticed that it was, picked a reading, shipped it, and *then* told him which reading I had picked.
  That is not disclosure, it is moving the correction downstream onto him — and it cost a round. If a
  term he used could mean two different builds, ask before building.
- **Never quote him a URL without checking what is deployed there.** He was sent to
  `playpastrypirates.com/v2/?ovens=1` for a flag that existed only on an unmerged branch, and spent
  two turns staying put waiting for a feature that was not there. `git ls-tree origin/main -- <path>`
  before naming a link.
- **When he corrects a decision he made earlier, he is almost certainly right — go and read the
  code.** Both times this session he pushed back on a rule ("a docked finisher is NOT raidable"), the
  code agreed with him and the comment I had written did not.
- **Ignore the apostrophe glyphs in copy he sends.** He drafts in Notes on a phone, which substitutes
  a curly `'` automatically. The game's copy is straight `'` throughout (41 to 0). Normalise silently;
  he has asked not to be asked about it again.
- **Frame trade-offs with numbers.** Every design decision he made quickly was one where he was
  handed real measurements ("34.8% of your reachable squares are storm-proof, the shove helps 25% of
  the time") rather than adjectives.

---

## 7. The v2 build, in one paragraph

`v2/` is a full copy of the game beside v1, sharing `../assets` and `../sfx` (988K of its own).
Solo/pass-and-play only: Firebase script tags and the Host/Join cards removed, `src/net/` left on
disk unused so multiplayer is two `<script>` tags away. It ships from `main` and is served at
`playpastrypirates.com/v2/`, kept out of search by `Disallow: /v2/` in the root `robots.txt` plus a
`noindex` meta. **It must never carry `CNAME`, `robots.txt` or `sitemap.xml` of its own** — see
`CLAUDE.md` for why that can take the live game down. Rules live in `v2/RULES-V2.md`.

---

## 8. Rules that lived only in the laptop's memory — ported here so a CLOUD session has them

Wyatt, 2026-08-21: *"I want to be able to run all future sessions in the cloud."* A cloud session
(claude.ai/code) gets the repo's `.claude/` and `docs/` and nothing from the laptop's `~/.claude/`
— so every rule that had been kept only in the laptop's memory notes is restated here, short, with
the note's name in brackets. CLAUDE.md already carries the big ones (ask with the UI, plain English
+ size, phone reachability, read every screenshot, measure before reporting, play the game).

- **Browsers: ALWAYS headless, ALWAYS `--mute-audio`, launched from a background shell, and never
  announce a window to him.** A visible Chrome steals his keyboard focus; an unmuted headless one
  plays the game's sounds through his speakers (*"the only annoying thing is that I can hear the
  sounds"*). If he asks to WATCH, `open -na "Google Chrome" --args …` and pin it with CDP
  `Browser.setWindowBounds {left:60, top:40}` — a window spawned from a shell once opened off his
  main display after he had been told to look for it. *(feedback_testing_scope)*
- **Scope every `pkill` to your own port.** A bare `pkill -f remote-debugging-port` kills every
  other agent's probe on the machine. `pkill -f "remote-debugging-port=${DBG}"`, `"http.server
  ${PORT}"`. *(same)*
- **Real-mouse QA is the instrument he trusts, and a DOM clicker is not** — he asked for it by name
  after an off-screen Dock button sailed through headless QA. `scripts/mouse_qa.mjs`: trusted
  `Input.dispatchMouseEvent` at screen coordinates, gated on inside-viewport + inside-the-column +
  `elementFromPoint` hits it, a screenshot per action that you then READ. **And KEEP the
  screenshots** — the build-u desktop pass was declared clean with none kept, and the layout was
  wrong in both his browsers. *(same; 02.2-MOUSE-QA-2026-08-21.md)*
- **Match verification effort to the stakes.** Decoration gets a look-at-it check; money,
  multiplayer state and data loss get rigour. An overnight run that built a contract-checker and a
  frame meter to decide whether wind dots stutter burned his whole usage allowance; his own test took
  60 seconds. Say so at wave 1 if a plan is disproportionate. *(same)*
- **The QA bar is WHOLE games, not stretches** — crew (two windows, both screenshotted and
  compared at the beats), solo, and pass-and-play, each to its end-of-voyage card, on the FINAL
  build. Its first night it found a nine-day-old softlock every shallower pass had sailed past. If
  more drops land after the pass, the pass is stale. *(feedback_qa_bar_whole_games)*
- **Drive and record at a PHONE viewport (390×844) unless he has said he is on desktop** —
  `Emulation.setDeviceMetricsOverride` is the only thing that moves `innerWidth`. And POSE the
  state (§5e of DRIVING-THE-GAME.md) instead of sailing for minutes to reach it.
  *(feedback_record_at_phone_size)*
- **Keep the local server running through his testing; stop it only when he says commit.** He
  always tests before a commit and hated re-asking for the server. *(feedback_server_lifecycle)*
- **Every time you ask him to look at something, the URL (with port) goes IN that same reply.**
  Ports change with every rebuild (module cache), so an older link up-thread is usually the wrong
  build. Say what he should look FOR, not just where. *(feedback_always_include_the_link)*
- **One topic at a time.** After he answers, reflect it back and invite additions on THAT topic
  before asking the next question — he dismissed two forms only because they cut off a
  clarification he was still making. *(feedback_one_topic_at_a_time)*
- **On the laptop only: tabs you drive in HIS Chrome get renamed `🤖 CLAUDE IS USING THIS`** (title
  + favicon, re-claimed on an interval) and renamed back the moment you stop — he closed a tab
  mid-run twice because he could not tell it was yours. Irrelevant in the cloud, which cannot reach
  his browser at all. *(feedback_label_claude_browser_tabs)*
- **On the laptop only: `find` is `bfs`**, which rejects relative `-newermt` timestamps; with
  `2>/dev/null` the error looks like "found nothing". The cloud image has GNU find. Either way,
  never `2>/dev/null` an exploratory `find`. *(project_find_is_bfs)*
- **`scripts/mp_rig.mjs` is the two-window crew rig**, with three corrections baked in that each
  cost real time: visibility is the painted rectangle, never `offsetParent` (always null for
  `position:fixed`); the driver carries the liveness filter / prefer-the-committing-circle / rotate-
  after-5-failures fixes; a remote seat gets `coinStepper()`'s ± fallback, not the slider, so a
  first-live-button driver oscillates `+1 → −1` forever — skip steppers. Never drive a crew voyage
  to its end (`writeGameLog()` is a permanent, undeletable write). *(project_mp_rig)*
- **The role switch is the trigger for reading the subsystem doc.** Orchestrate for an hour, pick
  up a browser yourself, and rule 20 will not fire on its own — `.claude/hooks/read-the-doc-first.cjs`
  now denies the first browser launch / push / board edit / trade edit per session with the doc
  named. Retry only after actually reading. Precision matters more than coverage in that hook: a
  gate that fires on prose trains you to dismiss it. *(feedback_read_docs_at_role_switch)*
- **Safari caches ES modules by URL and a page `?cb=` does NOT bust them** — a fresh server PORT
  does. Same for Chrome and for image assets. No tool here can drive desktop Safari; a Safari pass
  is Wyatt's, from his laptop. *(project_safari_storm_module_cache)*

### 2026-08-21 — A HIDDEN TAB IS A PERFECT FORGERY OF A GAME-STOPPING BUG

`DRIVING-THE-GAME.md` §8b already says a hidden tab is a fake freeze. It was read this session, and
the trap was walked into anyway — which is the point §0 makes about re-reading a lesson at its
TRIGGER rather than at session start.

`playtest_gate.mjs` was 15 days into a solo voyage when the event stream froze: 234 events, no
prompt, no buttons, no end-of-voyage card, **and a completely clean console**. That is, precisely,
the signature §1b gives for a throw in the turn chain. The last three events read
`turn:1 → sail:1 → tradewind:1`, so it even had a plausible culprit — a captain sails into a trade
wind and the game dies. It came within one sentence of being reported to Wyatt as a game-stopping
bug at day 15.

It was the harness. `document.hidden` was `true`, the game had done exactly the right thing and
paused itself (its tab-hide gate), and `waitWhilePaused()` — a promise that resolves only when
`shotClockPaused` clears — was correctly waiting forever, mid-ride.

**Two instrument failures, both worth copying out:**

1. **The first probe measured a property that does not exist.** It read `g.turn` and reported
   `undefined`, which read as "the turn pointer is corrupt". There is no `this.turn` in
   `src/engine/index.js` and never has been. A probe that names a field the code does not have
   returns `undefined` for a healthy game and a dead one alike — it cannot fail, so it cannot be
   evidence. **Grep the property before you believe a reading of it.**
2. **The honest instrument was the one with a control**: sample `game.events.length` twice, 25s
   apart. Frozen means frozen. That took one probe and settled it.

**The rule, now enforced in code rather than remembered:** `lib/player.mjs` repairs visibility every
tick (`Page.bringToFront`) and logs when it had to; and the gate refuses to report a timeout as a
stall without first ruling the hidden tab out, saying so in the same line. A gate that quietly fixes
its own environment hides how often the environment is the thing that is broken.

**And the reason this matters beyond one evening:** every finding in that run up to day 15 was real
and clean (0 piled controls, 0 off-screen controls, 0 dead sliders, 0 ribbon occlusions — all four
classes that had been failing). Had the phantom stall been reported alongside them, it would have
put every one of those true results in doubt. **An unmeasured claim shipped beside measured ones
does not merely add noise; it discredits the measurements it travels with** (CLAUDE.md rule 6).

---

## 9. 2026-08-22 — the day the instruments cost more than the bugs

Every entry here is from one overnight run plus the morning after it. **Not one of them is a fault in
the game.** They are all faults in the things built to find faults in the game, which is why they
belong together: a QA layer is unreviewed code that nobody plays, so it rots in the dark.

### A QA TOOL THAT CAN OUTLIVE ITS OWN RUN WILL BE FOUND HEATING HIS LAPTOP

`playtest_gate.mjs` was launched against build `2026-08-22a`. It played for 37 minutes, then sat at
**0% CPU for three hours with ten headless Chromes alive at 47% of Wyatt's CPU**, until he asked why
it was still running. Three faults stacked:

1. **The judge could not tell a dead instrument from a bad answer** (below).
2. **It kept calling anyway** — 67 times, once per screenshot.
3. **The contact sheet hung the run.** A step that only PRESENTS results outlived the run that
   produced them and held its own browsers open indefinitely.

CLAUDE.md's rule 17 says kill every headless Chrome before you reply. **That rule assumes the probe
ENDS.** This one did not, and the session reported "still running" for hours without once checking
whether it was *progressing*. **A long-running probe needs a watchdog that can kill it, and a
liveness check that reads the log's timestamp rather than the process's existence** — `ps` said it
was alive, and it was alive the way a corpse is warm.

### ANYTHING THAT FAILS ON EVERY SCREEN IS AN INSTRUMENT FAILURE, NOT A GAME WITH THAT MANY BUGS

The machine's `claude` login had expired. Every judge call returned a perfectly well-formed JSON
envelope whose `result` was *"Failed to authenticate: OAuth session expired and could not be
refreshed"* — so the parser found no verdict and resolved **"unparseable judge reply"**, 67 times.
The one fact that mattered appeared nowhere; it was buried under 67 findings-shaped non-findings.

**A uniform failure rate is diagnostic.** 67 of 67 is never a property of the thing being measured.
Detect the environment failure explicitly, make it FATAL, and stop — and when you stop, leave the
screens **unjudged rather than passed**, because those two must never be confused.

### WHEN A PRODUCER LEARNS TO RETURN HOLES, GREP EVERY CONSUMER — THE CHANGE THAT ADDS THE HOLE IS NEVER THE ONE THAT CRASHES

Fixing the above, `judgeAll` was taught to stop on the first FATAL, leaving unreached slots
`undefined` — deliberately, so an unjudged screen could not read as a pass. **Two consumers assumed a
dense array.** Wyatt's own run died on it twice in one leg:

```
contact sheet failed: Cannot read properties of undefined (reading 'verdict')
TypeError ... at legVerdict (playtest_gate.mjs:181)
```

It took the gate down **after solo-desktop had already played a complete voyage to day 15**, so the
crash discarded a finished leg. He was running the exact build that had the first half of the change
and not the second.

### A GATE THAT FIRES ON EVERY SCREEN TRAINS ITS READER TO IGNORE IT — WHICH IS WORSE THAN NO GATE

The gate had **no notion of a settled screen**: it screenshots the instant a screen's signature
changes, i.e. the instant the animation STARTS. Reliably the worst moment, not a random one. That is
why the recipe picker reported overlapping, off-screen cards three times a phone leg for a fault
that does not exist once the cards land (measured at rest: 7px apart, 12px of clearance).

**The first fix was worse than the bug.** It compared exact rects and treated hitting the cap as a
FAILURE. But **half this board never stops moving** — `.sailCell` carries a permanent bounce, ships
glide, the ripple pulses — so nothing ever settled: **22 samples over 2.68s on essentially every
screen of a real leg.** A rare phantom had become a constant one.

Two things came out of it. **Quantise, do not enumerate:** a slide-in travels tens to hundreds of
pixels and a bounce travels two to four, so rounding rects to 8px separates *arriving* from
*breathing* without maintaining a list of exceptions. And **hitting a cap is a fact to record, never
a failure to raise** — the checks still run on the best moment available.

### RECONCILE A THEORY WITH THE EVIDENCE YOU ALREADY HAVE BEFORE OFFERING IT

The auth failure was diagnosed as a shared-credential race: the app session and the CLI read one
Keychain token, the app refreshes it, refreshing rotates it, the CLI's copy dies. Every fact fitted —
the credential existed, it had been rewritten twenty minutes earlier, stripping every inherited
`ANTHROPIC_*` and `CLAUDE_CODE_*` variable changed nothing.

**The theory predicted that running from a plain Terminal would work. Wyatt ran it from a plain
Terminal and it failed identically — and that output was already in the transcript when the theory
was restated.** `/login` fixed it. A hypothesis that survives only because you did not check it
against the evidence in front of you is not a hypothesis, it is a preference.

**And the same session then contradicted itself in the other direction:** having just built the
queue handoff *specifically to remove the CLI dependency*, it told him the vision pass "stays manual
until you re-authenticate." He caught it. **When you remove a dependency, update your model of what
is blocked — the old blocker survives in your own sentences long after it stops being true.**

### CHASING A FALSE ALARM IS HOW THE TRUE ONE WAS FOUND — SO CHASE IT, BUT SAY WHICH IS WHICH

The recipe-picker structural failure was a mid-animation artifact on phone. Investigating it turned
up a **real** fault one layer over: on DESKTOP the picker's subtitle is sliced by the cards in a
settled state. The phantom was worth chasing. It was not worth *reporting* — and the two were only
distinguishable because the settled state was measured rather than assumed.

Related, and the reason the phantom was reachable at all: **the phone legs had been emulating a
390×844 screen with no browser bar** — 180px no real Safari ever gives a page. Correcting it to 664
made nine "empty dead space" findings evaporate and exposed the recipe cards being cut off at the
bottom **on the first screen of the game**. An instrument that models a device nobody owns reports
faults nobody has and hides faults everybody has.

### DO NOT RUN A GATE ON A MACHINE ANOTHER AGENT IS ALREADY DRIVING

A verification re-run boot-failed with *"solo card not clickable"* at 7 seconds. Not the change under
test: another agent was driving browsers on the same laptop and the page never finished loading in
the boot window. **Check for other agents' Chromes before launching, and scope the conclusion when
you do not** — that failure was nearly filed against the settle detector.

### A JUDGE READING A STILL FRAME CANNOT TELL "FADED" FROM "UNDERNEATH", OR A PULSE FROM A GAP

2026-08-22, and this one is about the vision judge itself — which since D-53 is a Claude session
reading screenshots, so it is about *us*. Judging 46 gate screenshots produced 8 failures. **Two of
the six distinct faults did not exist**, and both were the same mistake: **a positional claim
inferred from a still frame and reported as a finding.**

- *"The narration bubble is drawn UNDERNEATH the sail-square highlights — only the fragments 'Ahoy'
  and 'turn!' are visible between the squares."* Measured: the bubble is in `#pp4Fx` at z-index 21,
  the squares in `#boardwrap` at 5, siblings in one stacking context, and it stood on **0 of 19**
  squares while fully opaque. Sampling the screenshot's own pixels put it at ~18% transparency,
  agreeing across all three colour channels. It was **on top and faded** — hold-the-sea, Wyatt's own
  gesture, caught mid-tap. The fragments were the board showing THROUGH it, not over it.
- *"Two battle circles sit about 10px apart, tighter than the derived gap."* Measured: 82.98px
  centre-to-centre against an ordinary fan's 83.07 — identical. The "10px" was the **tap-me pulse**:
  two 66px circles rendered at 109% leave exactly 11.1px of white between them in a still.

**A still frame cannot distinguish transparency from occlusion, or a mid-animation scale from a
layout gap.** Both are questions about state over time, and a screenshot has none.

**So the rule for the judge — the one this file now has to carry, because the judge is a session:
REPORT WHAT YOU SEE, NAME WHAT IT MIGHT BE, AND NEVER STATE THE MECHANISM.** *"The bubble's text is
broken up by the sail squares"* is a true observation worth acting on. *"The bubble is underneath the
sail squares"* is a diagnosis, it was wrong, and it sent a fix at the wrong layer. CLAUDE.md rule 6
already says never report a defect as confirmed before measuring it; this is that rule arriving at
the one place in the pipeline whose whole job is to look rather than measure.

**Both were still worth chasing.** Investigating the false one is what found the real desktop
subtitle clipping, and what found the drag-off-the-board deafness below. **Chase the phantom; just
never hand it over wearing a mechanism.**

---

## 10. 2026-08-26 — every instrument lied, and each one lied in a way that read as truth

**§9 was the day the instruments cost more than the bugs. This is the day they started reporting
bugs that did not exist and certifying tests that never ran.** Five separate measuring devices were
wrong in one session. None of them looked broken. Every one produced a confident, specific,
plausible answer.

**Read this section at the moment you are about to trust a number, not once at session start.**

**The PROCESS these lessons produced lives in [`QA-PROCESS.md` → THE WHOLE LOOP, END TO END](QA-PROCESS.md).** This section is the evidence; that one is what to do about it.

### 10a. The five instruments, and what each one's lie looked like

| instrument | what it reported | what was true |
|---|---|---|
| the seeded-defect drill | "3 of 3 bugs CAUGHT" | it grades by grepping output for `FAIL`/`✗`, and an UNSEEDED leg prints both — **an unbroken game scores 3 of 3 too** |
| the settle probe | `settled: true` at 631ms | **14 of 75 characters were painted.** It compares rectangles; a typewriter changes neither geometry nor textContent |
| the sea-trial report | "voyages that did NOT run: **none**" | **both Safari legs died instantly** and captured zero screens. It matched one phrasing (`NOT RUN —`) and the gate had emitted another (`ERROR:`) |
| the remote-control detector | "remote control is DOWN" | Wyatt was reading the session on his phone at that moment |
| the vision judge | 16 findings | **roughly half survive contact with the source** |

### 10b. THE PATTERN, and it is the only thing here worth memorising

**Every one of the five failed by measuring an adjacent thing and reporting it as the thing.**

- The drill measured *"did the leg fail?"* and reported *"did we catch the bug?"*
- Settle measured *geometry* and reported *"has this screen stopped changing?"*
- The report measured *one sentence in a log* and reported *"did Safari run?"*
- The detector measured `WarmLifecycle` — the **warm-process** subsystem — and reported *"can he see this on his phone?"*

**So the question to ask of any instrument is never "is it green?" It is: WHAT DOES THIS ACTUALLY
MEASURE, AND IS THAT THE SAME THING AS WHAT I AM ABOUT TO CLAIM?** Four times out of five here, it
was not, and the gap was invisible from the reading alone.

### 10c. A measurement that cannot fail is not a measurement — three in one day, all mine

1. A settle trace that began sampling **after** the reveal had already finished, so both the old and
   new probe "settled on complete text" and the check could not have failed.
2. A test of the icon-punctuation fix that used a **wheat emoji, which has no custom artwork** — so
   it never became an image and never exercised the path it claimed to test.
3. A "does the button cover the card" probe whose card-finder walked up to the **full-screen
   container**, making `OVERLAPS: true` true of everything.

**Before believing a pass, prove the instrument reached its subject.** Feed it the broken case and
watch it go red. If you cannot make it fail, you have not written a test.

### 10d. The typewriter is invisible to BOTH obvious signals, by design

`typewriterReveal()` (`src/ui/panel.js`) splits each text node into **two spans holding the same
characters** — a revealed prefix and a `visibility:hidden` remainder that still occupies its exact
layout box. That is a good design: line breaking matches the finished message from the first frame,
so no word ever hops a line mid-reveal. It also means:

- **geometry never changes during a reveal** — that is the entire point;
- **`textContent` returns the full string throughout** — both spans are in it.

Only the **painted** pixels differ. A first fix using `textContent` did nothing, and a 40-sample
trace is what caught it. **If you need to know whether text has finished arriving, walk the nodes
and skip anything under `visibility:hidden`** — see `SETTLE_PROBE` in `scripts/lib/checks.mjs`.

### 10e. The vision judge has TWO named biases — calibrate before acting

Of 16 findings this trial, the confirmed real ones were the "Play again!" overlap and an orphaned
full stop. The rest fell into two shapes:

1. **Deliberate whitespace reads as a defect.** Three findings — a desktop right-column gap, day-1
   captain rows sized to hold a full 8-crate hold, and (previously) "dead space below the CAPTAINS
   panel" that turned out to be the harness emulating a phone height no phone gives the page. **All
   three had already been argued and settled in the source.**
2. **Small glyphs are misread.** It reported a literal `$` in `WIND NOW: $↓`. `DIRS={N,S,E,W}` — a
   `$` is unreachable, and the `↓` beside it confirms the letter is `S`.

**So: never act on a judge finding without opening the screenshot AND checking the graveyard
(rule 10).** It is still worth having — it found both real bugs — but it is a witness, not a verdict.

### 10f. The fix you verify must be the fix that was reported

The "Play again!" button was reported as covering the award cards. I fixed **reachability** (52px of
stats were permanently unscrollable behind it → 0), measured exactly that, and called it fixed. The
next trial reported it again, because the complaint was about **mid-scroll overlap** and I had
measured only the **fully-scrolled** state.

**Write down the reported symptom verbatim, and make the after-measurement address that sentence.**

### 10g. Reading the graveyard stopped a regression that a green trial would have blessed

Round two on that button, the plan was "take it out of the scrolling region." The comment directly
above it records that **sticky IS the fix** for a worse defect (D-46 fault 2: the button below the
fold, unreachable), and that awards passing behind it is the accepted consequence — *"a control you
cannot hit is the one unacceptable outcome."*

**Shipping the "obvious fix" would have re-broken a fixed bug, and every gate would have stayed
green**, because no check tests "is the button above the fold on a short window". The only thing
that caught it was writing the plan down before executing it. See
[the predict-before-measure rule](../.claude/CLAUDE.md) in rule 6.

### 10h. Following the mandated workflow disarmed the gate that enforces it

`scripts/qa/gear.mjs` compares against `origin/main`. **Rule 24 requires you to commit AND push so
Wyatt can play it — and pushing empties that diff, so the picker then reports `GEAR: NONE`.** Doing
exactly what the rules say produces "nothing to prove". Use `--since=HEAD~N` after a push, and treat
a `NONE` verdict on a day you changed game code as the tell.

**This is the third time this shape has appeared** (the working-tree version, the origin/main
version, and now the post-push version). A gate whose subject can vanish will eventually report on
an empty set and call it a pass.

---

## 11. 2026-08-28 — the tool that got judged, and three ways a number lied about its own coverage

**§10 was the day every instrument lied. This is the day an instrument was *silenced by this repo's
own safety rules* and still filed a report.** Environment-and-coordination lessons, from the first
day two machines and three sessions worked one branch at once.

**The decision guide these produced is [`CLOUD-VS-LOCAL.md`](CLOUD-VS-LOCAL.md)** — where to run a
long job and what it costs. This section is why.

### 11a. A CHILD `claude -p` INHERITS THIS REPO'S HOOKS — and fails silently, and intermittently

The vision judge shells out to a second `claude` per screenshot. Run from the repo, that child
loads `.claude/settings.json` and runs **this project's hooks**. A FULL local trial therefore
returned `judge ERROR: vision call timed out` on **every screen — 75 calls, zero verdicts** — while
the legs sailed on looking perfectly healthy.

The mechanism: each call is a **new session id**, so `playtest-checklist-last.cjs`'s
once-per-session guard never applied. It fired on all of them, blocked the Stop, and sent each
judge off to write a staging checklist instead of returning JSON. Fingerprint: **73
`checklist-asked` marker dirs**, all inside the failed window, none after the fix.

Red-proofed both directions — same call, same image, **cwd the only difference**: from the repo,
still running at 40 s; from a temp dir, answered in 37 s.

**The reusable rule: ANY tool that shells out to a second `claude` must run from OUTSIDE the tree.**
Our own guard rails are indiscriminate — they cannot tell a subprocess doing one narrow job from a
session that should be held to the full process.

**And it is worse than a consistent break.** The hook decides by comparing **file mtimes**, which a
`git checkout` resets in whatever order it writes files. The cloud got 14 judge findings on this
same code hours earlier. **So the eyes can be open on one run and shut on the next, with nothing
announcing the difference.** An intermittent silent instrument is harder than a broken one.

### 11b. A PER-ITEM RESULT WITH NO DENOMINATOR HIDES ITS OWN COVERAGE

The trial prints `vision judge FAILED 4 screen(s)` per leg. It never prints **out of how many**.

The judge only ever looks at the **first 30 distinct screens of a leg** (`JUDGE_CAP`,
`scripts/playtest_gate.mjs:58`, applied `:481`). One run captured **349** and submitted **267** —
**82 screens never shown to the judge at all.** The write-up then said *"two screens were never
judged"*, counting only the timeouts: **wrong by a factor of forty, in the section headed *what
this run does NOT establish*.**

The sharpest case: `crew-desktop`, **the one leg that did not finish its voyage**, captured 60
screens, had 30 judged, and all 30 came back PASS. **It reads as visually clean. Half of it was
never opened.**

**CEO Review 14 called this a recurrence of Review 13's *"the instrument announces more than it
actually checked"* — third review running, third surface.** The fix is arithmetic: print
`judged 30 of 60`. **Whenever a check samples, the sample size belongs in the output, beside the
result, every time.**

### 11c. A HARDCODED OUTPUT PATH IS A SILENT OVERWRITE THE MOMENT THERE ARE TWO OF YOU

`sea_trial.mjs` wrote `.planning/SEA-TRIAL.md` at a fixed path. With two machines sailing, whoever
finished last **silently replaced** the other's verdict — leaving one authoritative-looking report,
real build stamp and all, describing a run from the **other machine**. Rule 24 stands on opening
that file and believing it.

**A merge conflict is loud; this was silent.** Fixed by `--report=<path>` plus a machine name
derived from `os.hostname()` in every report, gated by
`scripts/qa/trial_report_ownership_check.mjs`. It was **not theoretical** — one run stamped
`19:35:09Z` over another's `18:44:08Z` before it was caught.

**The half still open, and the general form:** that fix separated the **reports**, not the
**evidence**. `sea-trial-shots/` — including the `report.json` that decides *which legs sailed* — is
still one shared path, and two Claude sessions can share one checkout on one machine. **When you
fix a shared-path collision, fix it for every artifact the process writes, not the one that
collided.**

### 11d. A BUILD STAMP THAT DOES NOT MOVE MAKES TWO GAMES ONE LABEL

`a4069ed2` changed `index.html` while `PP4_STAMP` read `2026.08.28.4` on both sides of it. So that
string names at least two different games.

**This breaks rule 24's check by making it pass.** "Compare the report's stamp with the one in the
game's ☰ menu" silently stops working when one stamp covers two builds: the two will match while
describing different code. `GIT-AND-DEPLOY.md` §5 already made this argument for staging — *"the
sha stayed because it is what makes it a build identity"*. **Bump the stamp in the same commit as
the game change, and pin any claim to a sha.**

### 11e. THREE SMALL INSTRUMENT FAULTS, ALL THE SAME SHAPE

Each cost a wrong answer on the day, and each is the §2 lesson in miniature — *the check measured
something other than what it named.*

| the check | what it actually measured |
|---|---|
| `ps ax \| grep -c "remote-debugging-port"` | **its own command text.** The grep's arguments contain the pattern, so a clean machine reports live probes. Use `pgrep -x`, and confirm a hit is real before acting |
| `find … -newermt '-60 minutes'` | **nothing** — macOS `find` rejects a relative `-newermt` and errors out. With `2>/dev/null` that is indistinguishable from "no matches". It reported 0 marker dirs when 73 existed |
| `ls .planning/hooks/.read-state \| wc -l` | **directories, not markers.** Typed into a report as "75"; counting the ones that actually held the marker file gave **73** |

**All three were caught, but only because something else disagreed with them.** The last is the
worst: it broke *"never hand-type a number that can be counted"* **inside the very finding written
to warn about unverified claims.**

## POSE THE BOARD — when the question is a picture, don't go looking for a rate

**Wyatt, 2026-08-30, and these are his words:** *"don't touch bubble placement again without a
posed comparison — the same seeded sail prompt, before and after, two screenshots. Three probe runs
and three 85-minute trials couldn't settle a question that two pictures would have. That's the
lesson of the night, and it cost the night to learn it."*

**What it cost, so nobody has to pay it twice.** One night, on one item (W1-4, sail squares a guest
cannot tap):

| instrument | what it gave |
|---|---|
| three 8-minute probe runs | **7, 12 and 5** judged captures, completely different cause mixes |
| three 85-minute full trials | **22 → 26 → 31** structural failures, same ten legs |
| **one posed prompt, ~1 minute** | every square sits where its grid coordinate predicts, **to 0.0px** |

**Three changes were shipped on those rates and all three were reverted.** Net game-code change for
the night: zero. The posed check answered a question the rates could not, in about a minute
(`scripts/qa/w14_swept_geometry.mjs`).

- **A driven voyage is a terrible instrument for a layout question.** It yields a handful of
  samples an hour and they swing wildly. `docs/DRIVING-THE-GAME.md` §5e poses the state instead of
  playing your way to it.
- **When a small sample and a large one disagree, the large one is not the one to explain away.**
  An 8-minute probe said coverings had gone to zero; a 10-voyage trial said they had gone up. The
  probe was believed and it was wrong.
- **Ask a geometric question, not a statistical one.** "Is this drawn where it says it is" needs
  one prompt containing both cases. "How often is this wrong" needs a hundred and still won't say.
- **This is rule 6's other face.** Rule 6 says don't report what you haven't measured. This says
  *measuring the wrong quantity is not measuring* — and a rate over a stochastic voyage is the
  wrong quantity for anything you could photograph.

**Enforced at the trigger**, not left to memory: `.claude/hooks/qa-gear-first.cjs` prints it as
STEP 0b at the moment you are about to change game code, and `src/ui/stage.js` carries it at both
the framing and the placement sites.

---

## 12. 2026-08-30/31 — the night every wrong answer came from reading a summary instead of its source

**Read this one before you write a status report, and before you believe any tool's headline.** The
work that night was mostly sound. **Every wrong thing said to Wyatt came from the same move:
repeating a summary without opening what it summarised.** Four times, in four different disguises.

### 12a. ⚠ THIS ENTRY WAS FALSE WHEN FIRST WRITTEN. THE REPORT WAS RIGHT.

**What stood here:** that the sea trial reported 2 structural failures while its own log held 36,
and that a crew leg's guest failures were never counted. A CEO review found it, I verified it
against the log, withdrew two claims to Wyatt, and wrote it up as a lesson — all within an hour.

**It collapsed on one check.** `sea-trial-shots/log.txt` **DOES NOT DESCRIBE ONE RUN. It accumulates
across every run** — its elapsed-second prefix resets to `[10s]` **sixteen times**, and the same
screenshot carries a judge error twice, an hour apart. The 36 failures are spread over ~16 separate
trials. The last run's own `report.json` holds **10 legs and exactly 2 screens with structural
failures.**

**And the mechanism blamed does not exist.** `playtest_gate.mjs:390`:
`const recA = { screens: rec.screens }, recB = { screens: rec.screens }` — **both seats point at the
same array as the parent.** A guest's failures were never missing from the count.

**THE LESSON THAT REPLACES IT, and it is worth more:**

- **AN ACCUMULATED LOG READS EXACTLY LIKE A SINGLE RUN'S LOG.** Three readers in a row took this one
  as a single trial. Nothing announces otherwise until you notice the clock running backwards.
  **Before counting anything in an artifact, establish whether it is per-run or append-only.**
  `report.json` is the per-run record here; `log.txt` is not.
- **AND THE PICTURES ARE GONE.** Later runs reuse the same screenshot filenames, so most
  `STRUCT FAIL` lines in that log **no longer have the image of the moment they describe.** Two
  failure families were chased on that basis; every surviving picture of them is clean, and nobody
  can now say whether they were real.
- **BEING WRONG IN BOTH DIRECTIONS ON ONE QUESTION IN ONE NIGHT IS THE TELL.** The first answer came
  from trusting a report, the second from trusting a log. Neither was checked against the artifact
  that actually described the run.

### 12b. AN INSTRUMENT THAT DISCARDS THE EVIDENCE OF ITS OWN FAILURE CANNOT BE DEBUGGED

The vision judge failed **1494 times in one run** saying only *"unparseable judge reply"*. It had
the real reason in hand the whole time — `judgeBatch` resolves `raw` — and nothing logged it. The
actual sentence was **"I don't have permission to read those image files."** One line that would
have ended a two-hour investigation before it began.

**Put the failure's own words in the message, not in a field nobody prints.**

### 12c. A FIX BECOMES THE NEXT FAILURE — check what your protection now forbids

The judge runs from a temp dir **on purpose**: on 2026-08-28 a child `claude -p` inherited the repo
cwd, loaded `.claude/settings.json`, ran this project's hooks and went off to write a checklist
instead of a verdict — 75 calls lost. **That protection is exactly why it could no longer open the
repo's own screenshots.** A child in `/tmp` is refused absolute paths into the repo.

**The fix was to move the images to the judge, not the judge to the images** (`stageImages`). When
you fence something off, ask what it can no longer reach.

### 12d. ERROR MESSAGES POINT AWAY FROM THE CAUSE MORE OFTEN THAN THEY POINT AT IT

The same wall produced three different wordings, none of them naming it: *"unparseable judge reply"*
(a parsing complaint about a permissions problem), *"unable to access image file"*, and
*"Self-signed certificate detected"* at five images. **Diagnosis came from bisection — 0, 1, 2, 3, 5
images, then 3 staged locally — not from reading any message.**

### 12e. QUOTING A CLAIM APPROVINGLY IS ASSERTING IT

PR #15 was merged with its own summary quoted into the ledger as *"worth keeping"*. One of its five
claims — *"contact sheets are out"* — was false; they ran **91 times, timing out at two minutes
each**, on a trial budgeted at 85 minutes that took 104. The safety claim ("no game code") had been
verified properly; **none of the value claims had been checked at all.**

**Verify what a change CLAIMS TO BUY, not only that it is safe.** (Checked afterwards: the other
four claims held.)

### 12f. THREE GATES I WROTE WERE WRONG BEFORE THE CODE THEY GUARDED WAS

`judge_can_see_check.mjs`, on its first day: passed items as `{shot}` when the function reads
`it.path`; then expected an array when the function resolves `{results: Map}` — **and a Map
stringifies to `{}`, so the good case printed as an empty object and read exactly like a failure**;
then selected the first three PNGs alphabetically, which were leftover contact sheets, and printed
**"THE JUDGE CANNOT SEE"** over a reply beginning *"I can see the three images"* — the exact fault
it was built to catch.

**Each was a guess where a read would have done.** Before writing a check against a function, open
the function.

### 12g. AND THE ONE THAT IS ABOUT REPORTING, NOT ENGINEERING

Every correction above was surfaced to Wyatt as it happened, which was right. **The cumulative
effect was a status stream that read as nothing but failure while the branch was actually shipping
— and he said so: "I'm losing faith in you."**

**A correction is not a status report.** Say what now works that did not before, then what was
corrected on the way. A session that reports only its own errors gives a false picture just as
surely as one that hides them.

---

### §12f — A GATE THAT NAMES A MACHINE TAKES THE REST OF THE SUITE DOWN WITH IT

**2026-08-31.** A new gate rooted itself at `process.argv[2] || '/home/user/pastrypirates'`. `npm
test` passes no argument. On this container it was green; on Wyatt's Mac that directory does not
exist, so the gate would have crashed with exit 1 at **gate 32 of 55 — and the remaining 23 would
never have run**. CEO Review 37 caught it one commit before it shipped.

**Three things worth keeping from it:**

1. **A crashing gate is worse than a failing one.** A FAIL reports on one thing. A crash ends the
   chain, and everything after it reports nothing at all — which reads, to anybody scrolling, like
   the run simply stopped rather than like 23 unanswered questions.
2. **The lesson was already in the repo and was made again in the direction nothing checked.**
   `doc_command_check` fails a home-rooted path in a DOC, and printed *"it runs the same in a cloud
   container as on the laptop"* in the very run this gate would have died in. **Guarding the prose
   about the scripts is not guarding the scripts.** When you write a check, ask which
   half of the artifact it can see.
3. **"Absolute" was the wrong thing to ban, and the first draft of the guard proved it in one run:**
   17 honest lines, all browser-side `import("/src/ui/index.js")` — a URL the local server answers,
   not a filesystem path. And `vision.mjs` names `/root/.ccr/ca-bundle.crt` guarded by `existsSync`,
   which degrades instead of dying. **The fault is not an absolute path; it is a path that locates
   THIS REPO'S OWN CODE on one machine.** A guard aimed at the wrong quantity would have taught the
   next session to break three working files.

**Now enforced:** `tree_health_check` case 4, red-proofed in both directions, on every script in
`scripts/`. Its planted example strings are **assembled at runtime** rather than typed, so the gate
still polices its own file — an allowlist would have been a file nobody checks any more.

### §12g — "SOMEBODY WILL REMEMBER" IS NOT A MECHANISM

**2026-08-31.** A checker ruled that a change inside `board.js`'s BYTE-IDENTICAL Safari region
needed a SCOPED EXCEPTION block in the header, and that **whether Wyatt must approve it was his
call, not the builder's**. So the block was written saying `AWAITING WYATT'S RULING` — honest, in
the right place, and completely inert. CEO Review 38 grepped `scripts/` and `.claude/hooks/` for
that marker and got **zero hits**: *"Nothing mechanical stops that file merging to main unruled —
only somebody remembering."*

**The shape to recognise: a question correctly raised, correctly recorded, and load-bearing on
nobody.** It reads as diligence. It behaves as a comment.

Two things worth copying from the fix (`scripts/qa/unruled_exception_check.mjs`, gate 55 of 56):

1. **BRANCH-AWARE, NOT ABSOLUTE.** An unruled exception is *correct* on a working branch — that is
   where a ruling gets asked for. Failing there would turn every unrelated piece of work red until
   Wyatt happened to be at a keyboard, and a gate that cries wolf gets `--no-verify`'d. So: on a
   branch it PASSES and prints the file and line **every single run**, so the question cannot
   become furniture; on `main` it FAILS, because that is the moment the change reaches real
   players. **Put the failure where the cost is, and the reminder everywhere else.**
2. **THE RED-PROOF NEEDED THE BRANCH TO BE AN ARGUMENT.** A run on a feature branch can never
   demonstrate the main-branch verdict. The first attempt tried to prove it with a throwaway
   worktree; that exited 1 with *module not found*, which looks exactly like the gate failing —
   **an instrument measuring something other than what it names, inside the red-proof of a gate
   about honesty.** The fix was one `verdict(found, branch)` function called by both the live path
   and the proof. Nothing passes an override in; the live call reads git.

**State the limit, or the fence becomes a wall in the telling:** this fires when `npm test` runs on
main. It cannot see a merge pushed without running the suite. It is a fence — but a fence is what
did not exist, and the release process walks straight into it.

### §12h — READING THE CODE TELLS YOU WHAT ONE PATH DOES. ONLY THE OUTPUT TELLS YOU WHAT THE SYSTEM DOES.

**2026-08-31, and it is rule 6's missing corollary.** Three overclaims in one item, all the same
shape, all made by someone being careful:

1. *"The End of Voyage screen is checked by nothing."* The branch really did hardcode `fails: []`.
   But the vision judge reads it, and — found only by a fresh reader opening the previous trial's
   `report.json` — **the ordinary capture loop was already photographing and structurally checking
   that same screen one tick earlier, in all ten legs.** The real fault was a *duplicate* entering
   the report marked clean. Worth fixing; a fraction of the billed size.
2. *"The judge was handed a frame guaranteed to be mid-flight,"* citing a measured 688px glide. The
   matched pair showed the card already at rest. That number was measured about the card being
   **dragged**, not arriving — the right object, the wrong moment, and it read as rigour *because*
   it had a citation attached.
3. *"That failure runs at counts of 8 to 18."* Counted: **1 to 22, and 20 of the 90 at 4 or below.**

**Every one is a true statement about the CODE promoted to a statement about the WORLD.** Reading a
branch and seeing no checks is true of the branch. Concluding no checks ran on that screen requires
knowing what every *other* path did — and the file that answered it was on disk, unopened.

**SO, BEFORE YOU SAY HOW BIG A HOLE IS: OPEN WHAT THE SYSTEM ACTUALLY PRODUCED.** The last trial's
`report.json`, the last run's log, the screenshots. It costs one command. All three of these died
on contact with output that already existed.

**The size of a claim is itself a claim, and it needs its own evidence.** "This is broken" and "this
has been broken on every leg of every trial" are different assertions; the second is the one that
gets quoted back, and it is the one nobody measured.

**What caught them, in order:** the prediction note with named falsifiers caught #1's headline
before the fix shipped. The matched-pair screenshots caught #2. A fresh-context CEO opening a file
the author never opened caught #3 — *after* two honest self-corrections had already been made in
the same document, which is precisely why rule 25 cannot be replaced by being careful.

### §12i — A GATE BUILT INSTEAD OF THE WORK MUST BE THE HARDEST GATE YOU WRITE, NOT THE EASIEST

**2026-08-31.** Asked to build the Decider interface, I measured first, found most of its machinery
already present, decided the rename carried risk with no player gain, and **wrote a gate to lock
the existing structure instead.** That decision is defensible. What happened next is not, and it is
the reusable part:

**The gate could not fail for the change it named.** It typed the rule and its seven expected rows
in as literals and asserted against its own private copy. A fresh reviewer broke it in one line —
appending `|| appState.isHost` to the real `decisionIsLocal` left every case green while the single
row the gate existed to protect was broken. I planted it myself to check: green.

**THE PATTERN, AND IT IS SPECIFIC ENOUGH TO WATCH FOR.** When you substitute a gate for work you
were asked to do, the gate is carrying the *entire* argument for the substitution. That is the
moment to make it the strictest thing in the suite — and it is exactly the moment the temptation
runs the other way, because a gate over code you are not changing is easy to write green and there
is no failing behaviour pushing back on it. **A gate written to justify not doing something has no
natural adversary. You have to be its adversary.**

**The fix was not a better regex — it was making the rule RUNNABLE.** The predicate lived in a file
that reaches `appState` and the DOM, so no headless gate could import it; typing out a copy was the
path of least resistance and the root cause. Extracting it into the pure tier let the gate import
and run *the same function the game runs*. **If a gate cannot execute its subject, it is asserting
about a copy — and a copy is the thing that drifts.**

**Three smaller things fell out of it, each worth its own line:**

- **The purity gate then caught the extraction carrying a MODE'S NAME into the pure tier**
  (`passAndPlay` as a parameter). It is `sharedDevice` now — a capability, not a mode. Mode leaking
  one tier down, on the day a plan about removing that leak was being built, caught by a counter
  that did not know why it was right.
- **"Delegates to the pure rule" was not a strong enough assertion.** `return isDecisionLocal({…})
  || appState.isHost;` delegates *and* changes the answer. The assertion has to be that the wrapper
  returns the pure call **and nothing else** — read by paren balance, because the brace-naive regex
  that replaced it failed a perfectly good wrapper.
- **A fixture without its recorder is data nobody can re-make.** The events were committed; the
  script that produced them was not. It can be re-compared forever and never refreshed, so the day
  the engine legitimately changes the only options are hand-editing recorded data or deleting the
  gate. **Commit the recorder with the recording.**

**And the honest report is the other half.** *"Step 5 is done"* and *"step 5 should not be built as
written, here is the weaker thing I put in its place"* are different sentences, and only the second
one was true. The first is what I wrote until a reviewer with fresh eyes read the tree.

### §12j — A CHECK PINNED TO A VARIABLE'S NAME BLOCKS THE READABILITY WORK IT SHOULD IGNORE

**2026-08-31.** Wyatt, on finding that a gate could not tell a player from a prompt because both
were called `p`: *"it's unnecessarily lazy code for an AI agent to write. you write the string
'player' exactly as quickly as the string 'p'."* Renaming them broke **three gates**, none of which
was testing anything that changed:

```
w29_coin_question_check    /const n=await coinSlider\(p\.idx,/
a2_bot_bake_watch_check    /benchReveal\(p,out\.res\)/
a1_bake_now_check          /lightOvens\(p\)/ … /bakeTurnLive\(p\)/
```

**Every one asserts about SPELLING, not behaviour.** The coin question still knows what is on the
table; the bench verdict is still drawn for bots; the ovens still lead to a bake. All three now
read `\w+`.

**The rule: a source-reading gate may name a FUNCTION, a CONSTANT, an exported symbol or a string
the product itself contains — never a local variable.** A local name is the one thing a refactor is
entitled to change without asking, and a gate that forbids it is a gate that forbids cleaning up.

**AND THE RENAME ITSELF BROKE THE CODE ONCE, silently, which is the sharper half.** The first pass
matched the parentheses around an arrow's PARAMETER and depth-walked from there — so for
`(p)=>{...}` the match closed immediately after `p`, and only the parameter was renamed:

```js
setPicks:(player)=>{picks=p||[];if(pickCb)pickCb(picks);}   // p is now undefined
```

**`npm test` passed. All 62 gates.** It was caught by reading the output of a listing command, not
by any check. Reverted with `git checkout` and redone with the span running from the parameter to
the end of the arrow's body.

**Three defences that made the redo safe, and they are cheap enough to always use:**
1. **A pure swap is verifiable** — `git diff --numstat` must show insertions equal to deletions on
   every file. A rename that adds or removes a line is not a rename.
2. **Search for the orphan shape directly** — every scope whose parameter is now `player` while its
   body still says `p`. That check found zero on the second pass and would have found the bug on
   the first.
3. **Some `p` are not variables at all.** `{t:"sidebet",p:bet.idx}` is the event wire format — the
   seat field every client reads — and `<p style=…>` is a paragraph tag inside a string. Renaming
   either would have been a genuine break dressed as tidying. The matcher excludes `p:` explicitly.

### §12k — A SECOND PLACE TO DECIDE IS A PLACE HIS ANSWERS GO TO DIE

**2026-08-31.** Wyatt ruled on five questions on the Helm — a second page built beside the Glass
so he could tap decisions from his phone — between 17:02 and 17:10Z. **No session read them for
over an hour.** The Glass went on printing *"Blocked on Wyatt (6)"* while five of the six were
already answered, the engine sat idle on work he had unblocked, and he had to tell us twice:
*"i answered all of those questions already, multiple times."*

**Nothing was broken.** The Helm saved his taps correctly, into its own state block, exactly as
designed. The Glass rendered the Chart correctly. Both pages were right, and the answer still
never arrived — because **no step in any loop read the Helm.**

**THE SHAPE, AND IT IS RULE 23 WEARING NEW CLOTHES:** two surfaces that must agree, kept in step
by nothing. The project already knows what that costs on the game's screens; this is the same
fault one level up, in the interface itself. The rule generalises past pages:

- **A CHANNEL NOBODY HARVESTS IS NOT A CHANNEL.** It is a place his words are stored and lost.
  Before building any new surface he can write to, name the loop step that READS it — a Door
  step, a hook, a gate. If you cannot name one, you are building a drawer, not a channel.
- **ONE PLACE TO SEE AND DECIDE.** His words, 2026-08-31. The fold-in put the decision cards
  inside the Glass, derived from the Chart's own blocked table, and the same harvest hook that
  guards his ideas now guards his rulings.
- **THE FIRST QUESTION FOR ANY INTERFACE: what makes this and the record agree?** "The session
  will check both" is the answer that failed here.

**AND THE MECHANICAL HALF, EARNED ON THE HELM ITSELF BEFORE THE GLASS EXISTED:** a self-
publishing artifact must **select its own assets BY ID, never by tag or position**. The artifact
host injects its own reset stylesheet ahead of the page's content, so `querySelector("style")`
resolves to the HOST's asset — the Helm rebuilt itself around the reset once and **the entire
stylesheet vanished on the first Record tap**, which Wyatt found. Every element a self-saving
page rebuilds from carries an id: `#helm-style`, `#helm-state`, `#glass-style`, `#glassState`,
`#asks`. The comment at `helm-main`'s `fullDoc()` records it at the scene.

## 13. 2026-09-03 — ONE INSTRUCTION SPLIT ONE LIST IN TWO, AND SEVEN INSTRUMENTS WENT QUIETLY WRONG

**Wyatt, 2026-09-02:** *"take every Glass-focused task on the Chart, and compile it into a new list…
YOU will work on the chart -- the Watch will work on the game."* A reasonable instruction, correctly
carried out: 44 rows moved from `CHART.md` to `GLASS-CHART.md`.

**Every tool with the old path written into it then broke — in a DIFFERENT way each time, and not
one of them errored.** They all reported confidently about a file they could no longer fully see.

| tool | what it did instead of failing |
|---|---|
| `close_item.mjs` | refused to close **any** of the moved rows — "no open Chart row contains…" |
| `chartkeeper.mjs --rank` | printed a clean report reading **"0 open rows"** on a 27-row file |
| `tick_rows.mjs` | same blindness, silently |
| the Door's step 2 | sent every watch to the top of an empty list |
| `chart_sweep_conserves_check` | called all 27 rows **lost** |
| `no_ambiguous_handle_check` | accused whichever row sat above his questions table |
| `glass_his_five_asks_check` | (later) failed on markup a new feature put on his page |

**THE TELL, AND IT IS THE MOST USEFUL SENTENCE HERE: the sweep gate's error count GREW AS WORK WENT
WELL** — 38 → 112 → 106 across one night — because every row that got CLOSED moved its handle into
the half the gate could not see. **An instrument that gets louder the more you fix is measuring
itself.** If a number moves the wrong way when you succeed, stop and audit the instrument.

### THE OTHER HALF: an instrument that asks for an IDENTITY and accepts one spelling of it

Three separate tools demanded a row's handle and then could not match it:

- `close_item.mjs` matched only a row's **first line** — and every handle is written on line two. **The
  one identifier the gate asked for was the one it could never match.**
- `chart_sweep_conserves_check` required the handle to be the **entire** bracket contents, so every
  row carrying `· size: M` or his `· now: yes` pin was invisible **as an owner** and reported LOST. A
  gate whose whole job is *"the sweep may never lose a row"* was manufacturing losses out of its own
  strictness.
- `no_ambiguous_handle_check` read a row's block to the next row, so the last row before a heading
  swallowed his BLOCKED-ON-WYATT table — which carries a handle per question. **The accused row
  CHANGED as rows moved**, which is the tell that a finding is about POSITION, not ownership.

**Match the identity; allow what follows it.** And note the third one's shape: *a handle a row
MENTIONS is a reference; only a row's own handle line is a claim.* Cross-references make text
matching worse exactly as a record gets better cross-referenced.

### AND THE SAME DAY'S THIRD FACE: a measured refusal is evidence about a moment

Three rows were built on *"a watch cannot do this"*, each measured honestly and each **stale when
read**:

- `can_push.mjs` prescribed a `git push --dry-run` form the permission list can never match (it is a
  PREFIX match), then said *"if it is REFUSED, end the turn"* — **a permanent false STOP at the Door,
  on a healthy tree.**
- A row said reading `claude-kit` was forbidden. **He had removed that fence 31 minutes earlier**, and
  nobody had harvested the ruling.
- `T-027` said the staging deploy is *"the one step a watch cannot take"* and that granting it was
  his call. **He had already granted it.**

**Re-measure before believing any row that says a thing cannot be done.** A refusal is a fact about
one moment, not a standing property of the world.

### THE CHEAPEST MISTAKE OF THE NIGHT, AND IT COST 68 GHOSTS

Restoring a swept row, a session minted the handle `T-203` because it looked free. The sweep gate
takes its ceiling from the highest **owned** handle, so jumping 134 → 203 invented **68 vanished
rows** in one keystroke, and two sessions then reasoned about them. **Take the next handle at the
FRONTIER; never a round number that looks unused.**

### THE SAME NIGHT, THE OTHER DIRECTION: I TRUSTED AN INSTRUMENT BECAUSE ITS ANSWER WAS THE ONE I WANTED

Everything above is about instruments that could not see. **This is about believing one that could
see and could not explain**, and it happened after a whole night of writing the entries above.

The sea trial's vision judge FAILED ten screens. A session read its `issues` strings and filed five
bugs, marking two as unverified. **A CEO opened the pictures.** Of the ten: *"the Arrgh! bubble has
no tail"* is **a button** (`panel.js:1156`); *"the FORECAST ribbon is clipped by the sidebar"* is
refuted by its own screenshot, ~280px of empty board between the text and the sidebar; and
*"the Play again! button overlaps the award cards"* has a real symptom with **the wrong cause** —
the cut is ~15px **above** the button, a scroller edge, not an overlap. The judge had also invented
the award winners' names on that screen, which `INTENDED-BEHAVIOUR.md:123` already records it doing
with wind direction.

**THE RULE, AND IT IS NARROW ENOUGH TO USE: A JUDGED `FAIL` IS A POINTER TO A SCREEN WORTH OPENING.
IT IS NEVER A DESCRIPTION OF WHAT IS WRONG WITH IT.** The judge is good at *"look here"* and
unreliable at *"because of this"*. Quote its verdict, never its reasoning.

**And the tell was in the report before the CEO was:** the two claims that turned out false were
exactly the two the session had NOT opened. **The ones it looked at survived.**

⚠ **WORSE, AND THE PART WORTH REMEMBERING: the failed claim carried the words "VERIFIED BY EYE".**
The session did open that screenshot. What it wrote down was not what it saw — it was its
*explanation* of what it saw, in the same sentence and the same voice. **Looking at a thing licenses
you to report the thing. It does not license you to report the mechanism.**

### AND A RANGE REPLACEMENT IS A DELETION OF EVERYTHING YOU DID NOT LOOK AT

Correcting that row, the same session rewrote `CHART.md` between two anchors — `s[:start] + new +
s[end:]` — and **four unrelated rows were living between them**, one of them another session's
in-flight work. They were gone, silently, in a commit about something else.

**`chart_sweep_conserves_check` caught it** — *"4 allocated handle(s) are owned by NOTHING"* — the
gate whose ownership regex that same session had fixed six hours earlier. All four were restored
verbatim from `HEAD`.

**Anchor an edit to the thing you are changing, not to the thing after it.** If you must replace a
range, print what is inside it first.

---

## 14. 2026-09-03 — FIVE HARNESSES LIED IN ONE NIGHT, AND EVERY ONE WAS BUILT TO CHECK SOMETHING ELSE

**§10 is *"every instrument lied, and each one lied in a way that read as truth."* Those were the
project's own gates. This is the layer under them: the throwaway scripts a session writes to check
a gate.** Five of them were wrong in one session. Not one had itself been checked.

**They are all the same fault in different costumes: the harness could not tell SUCCESS from
NEVER-RAN, and it defaulted to success.**

| the harness | what it reported | what was true |
|---|---|---|
| `harvest_glass.mjs`'s own counter | *"3 of 3 new (verified in the file)"* | the write had deleted **61 of 64** existing entries |
| `red_proof_at_ref.mjs` | *"RED PROOF HELD — the check can see its subject"* | the gate had crashed and judged nothing |
| a mutant runner | *"all 8 mutants SURVIVED"* | all 8 had died; it read **no output** as **passed** |
| its own replacement guard | *"all 8 COULD NOT RUN"* | they ran; the guard matched an **em dash** the Windows pipe re-encoded |
| an `awk` position check | *"the fix did not work"* | it matched the handle in the file's **header prose**, not the row |

**A sixth was found by a REVIEWER rather than the author** — a CEO measured 15 rows moving, traced
it to running the tool from a copy *outside* the repo where `import.meta.url` could not reach the
ledger, and reported that instead of quietly re-running.

### THE RULE, AND IT IS ONE SENTENCE

**Before believing a measurement, ask what the instrument would print if the thing WORKED — and
check that it prints something different.**

Every failure above collapses two outcomes into one symbol. *"No output"* and *"passed"* both look
like silence. *"Non-zero exit"* covers both *"the check failed"* and *"the check could not start"*.
*"The id is in the file"* is true whether the file is complete or empty. **A symbol that two
different worlds produce is not a measurement.**

### THREE THINGS THAT DO NOT WORK, ALL TRIED THE SAME NIGHT

1. **Writing the trap down first.** The prediction for the harvest tool said, in advance, *"the
   tool must read back what it wrote and count it from the FILE, never from the array it
   iterated."* That was built — and the gate could not tell whether it was there. **Naming a trap
   does not test for it.**
2. **Adding a guard.** The fix for *"no output means passed"* was a guard requiring a verdict line.
   The guard matched on a character the pipe re-encoded, and reported eight successful runs as
   *"COULD NOT RUN"* **while printing their real failures directly underneath.** A guard is an
   instrument too.
3. **Knowing the lesson.** The same session wrote the reply to a verdict about fixture shape, and
   then wrote a fixture with the same fault in a different file, an hour later. **A lesson recorded
   in the morning does not transfer to the afternoon by itself; it has to be a case in a gate.**

### THE POSITIVE FORM — what a trustworthy harness does

- **Require positive evidence that the subject RAN.** `red_proof_at_ref.mjs` now demands the gate's
  own verdict text, and separately detects a loader error inside the failure lines — because a gate
  whose *dependency* is missing is fluent, confident, and failing about the wrong thing, which is
  far better hidden than a crash.
- **Assert on the WHOLE output, not the one number you set out to fix.** A verdict found a bug
  sitting in a field the gate already parsed and then discarded, because every case asserted on
  `score`. One line on data already in hand would have caught it.
- **Shape the fixture like the real subject.** A gate whose destination was an EMPTY inbox could
  not see a write that emptied a real one. Count the real file's sections, heading levels and
  formats before writing a single assertion.
- **Prefer ASCII in a detector.** Two of the five failures were an em dash and a re-encoded pipe.
  A detector that depends on typography is a detector with a locale bug waiting in it.
- **When a check condemns something you have reason to believe works, suspect the check** — §10's
  rule, and it held five times out of five here.
