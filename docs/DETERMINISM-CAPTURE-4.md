# Capturing (and re-recording) the determinism corpus for `4/`

**Written 2026-08-23, before it was needed — plan 03-01 Task 5b.**

Sibling to [`DETERMINISM-RERECORD.md`](DETERMINISM-RERECORD.md) (the closed v1 record, which paid
this cost once) and [`DETERMINISM-RERECORD-NEXT.md`](DETERMINISM-RERECORD-NEXT.md) (the queued
engine changes, written against the root tree and **inherited by `4/`**).

**Why it exists before the work does.** A corpus capture is a **one-way door**: from the moment
fixtures exist, any change to what the engine emits costs a gated re-record. This file makes that
door a costed, documented act that can be opened deliberately — instead of a thing somebody
discovers at 3am, mid-phase, with a red suite and no procedure.

**In one sentence for Wyatt:** this is the recipe for locking down "the game replays identically for
every player", written now so that turning it on later is a decision rather than an emergency.

---

## 1. THE STATE OF THE DOOR TODAY — a checkable fact, not a memory

```bash
test -d 4/scripts/fixtures/determinism \
  && echo "CLOSED — a corpus exists; an engine emission change now costs a gated re-record" \
  || echo "OPEN — no corpus; an engine emission change costs nothing"
```

**As of 2026-08-23 that prints OPEN.** `4/scripts/fixtures/` does not exist at all.

**Run the command. Do not trust this paragraph.** It is written down precisely so the claim cannot
rot silently, which is the failure mode every other sentence in this repo's docs is exposed to.

`02.2-04` already made an engine-emission change in `4/` and disclosed it as free *"since the
determinism corpus does not exist yet (Phase 3/TEST-03 captures it), but the door closes the moment
it does."* That disclosure was correct and it is still true.

> **The root tree's door is CLOSED and always has been.** `scripts/fixtures/determinism/` holds 32
> files — 30 base seeds (12345–12374, D-03) plus one extra (12379, 14-04) plus a manifest. Nothing
> in this document changes anything about the root corpus.

---

## 2. WHY THE CORPUS WAS NOT CAPTURED IN PHASE 3 — the decision, in full, with its alternative

**This is a judgement, recorded so it can be OVERRULED with the reasoning in front of you rather
than re-derived.** ROADMAP's Phase 3 says capture it there. Plan 03-01 §1 said: capture it LAST, in
its own plan, preferably after Phases 4 and 5 are scoped.

### The argument for waiting

1. **The corpus is an oracle against UNINTENDED engine drift. Phases 4 and 5 are the two phases most
   likely to make INTENDED engine changes.** A gate that fires on changes you meant to make is
   [`HARD-WON-LESSONS.md`](HARD-WON-LESSONS.md) §9 exactly: *"a gate that fires on every screen
   trains its reader to ignore it — which is worse than no gate."*

2. **"Phases 4 and 5 will not need an engine change" is an INFERENCE, not a measurement** —
   and CLAUDE.md rule 6 forbids acting on the first as if it were the second. ROADMAP sources that
   claim to intake research written 2026-08-18, against a tree that has since been changed by
   `02.2-04` (an engine change) and rewired by `02.15` (the whole orchestration). What HAS been
   measured, 2026-08-22, D-53, four real Firebase rooms: **a guest cannot take their own bake —
   there is no channel to send it down.** Building that channel is Phase 4's first criterion, and
   nobody has yet measured whether it can be built without touching the engine.

3. **`gave` is on the TRADE event, and Phase 5 is trade over the wire.** Freezing a prose-carrying
   trade field the night before the trade phase is the most expensive possible moment to spend the
   door.

### THE ALTERNATIVE, recorded so it can be chosen instead

**Capture now**, and hold Phases 4 and 5 to ROADMAP's own rule — *"if either phase finds it needs an
engine change, stop and re-scope."* That buys the lockstep oracle weeks earlier and costs one gated
re-record if the inference in point 2 turns out wrong.

**It is a real option and it is the ROADMAP's written plan.** What 03-01 refused to do was take it
BY DEFAULT, at 2am, without Wyatt. **One sentence from him overturns this.**

---

## 3. THE THREE INHERITED PURITY FIXES — verified in `4/`'s code on 2026-08-23

`DETERMINISM-RERECORD-NEXT.md` queues these against the root tree. **They are inherited by `4/` —
confirmed by reading `4/`'s source, not assumed:**

| Queued fix | Where it lives in `4/` | Verified |
|---|---|---|
| `spoil` carries rendered text | `src/engine/index.js:1793` — `const spoil=spoilIng?ilabelImg(spoilIng):"nothing"` | yes |
| `gave` carries rendered text | `src/engine/index.js:1140` emits it, via `offerLabel()` whose render line is `:1166` | yes |
| `ilabelImg` imported into the engine tier | `src/engine/index.js:8`, in the shared-barrel import list | yes |

**`-NEXT.md` §7's ruling is binding and is the reason these are not three separate tasks:**

> **ONE RE-RECORD, NOT THREE.** Every queued item must land BEFORE the single `--capture` run.
> Landing any one of them alone spends the whole cost for a fraction of the benefit.

So the purity fixes and the capture are **one pass**. That is why they travel together into plan
03-03 and why neither can be done "quickly" on its own.

### The UI half — and a CORRECTION to 03-01-PLAN.md's estimate

`-NEXT.md` §6 is explicit that the interim display-layer fix must be **REMOVED**, not left beside
the new path as a second way of spelling the same thing.

**03-01-PLAN.md estimated "roughly fifteen sites in `src/ui/util.js` which parse prose". Measured
on 2026-08-23, that is too high, and the real shape is:**

| What | Count | Where |
|---|---:|---|
| Sites that genuinely **parse the rendered prose** | **2** | `:831` (`/ coins/.test(e.spoil)` → `fmtItem`) and `:854` (`parseInt(e.spoil,10)`) |
| Site that **string-compares** the rendered value | 1 | `:915` (`e.spoil==="nothing"`) |
| Sites that render `gave` through `fmtItem()` | 4 | `:777`, `:778`, `:779`, `:781` — these move when `gave` becomes structured |
| Lines that merely **read the clean data field** `e.spoilIng` | ~8 | already on the good path; they do not change |

**So it is about SEVEN real edit sites, not fifteen, inside a ~15-line region that references the
field.** The region is still battle and trade narration — the copy Wyatt has been iterating on all
week — so it still must not ride along beside a batch of gate ports. **But 03-03 is cheaper than
03-01 feared, and that is worth knowing when scheduling it.**

Also needing updates in the same pass (`-NEXT.md` §6, root-tree paths — check whether each has a
`4/` counterpart before starting): `art-review/narration-core.js`'s `VARIANTS.battle` fixtures and
its D-51 paired-field invariant, `art-review/narration-table-baseline.json`'s three battle rows, and
`scripts/narration_test.js`'s battle fixtures.

---

## 4. THE CAPTURE PROCEDURE

### Why it needs almost no new code — the tree-relative property, again

`scripts/determinism_baseline.js` resolves **everything relative to its own location**:

- it loads the engine through `./lib/load_engine.js`, which imports `../../src/engine/index.js`;
- it writes to `path.join(__dirname, "fixtures", "determinism")`.

**So a copy at `4/scripts/determinism_baseline.js` loads `4/`'s engine and writes
`4/scripts/fixtures/determinism/` — with nothing configured and nothing to remember.** That is the
same property `4/scripts/lib_twin_check.js`'s header explains and defends: the copy is not a
duplicate of the code, it is what AIMS the code.

**DO NOT "improve" this by having a `4/` copy import the root's `scripts/lib/load_engine.js`.** It
would silently re-root the loader at the root tree and capture a corpus **of the old game**, which
would then pass verification forever while protecting nothing —
[`HARD-WON-LESSONS.md`](HARD-WON-LESSONS.md) §3, in the most expensive place it could happen.

### The steps

> ### ⚠ THE CUTOVER DELETED STEP 2. Read this before following the steps.
>
> Everything above was written while the new game lived at `4/`, and the copy-it-into-`4/` trick
> existed **only** to aim a tree-relative harness at that tree. **On 2026-08-26 `4/` was promoted to
> the repo root**, so `scripts/determinism_baseline.js` — which loads `../../src/engine/index.js` —
> now already loads the promoted game's engine and already writes `scripts/fixtures/determinism/`.
> **There is nothing to copy and nothing to aim.** The tree-relative property did the whole job.
>
> The paragraphs above are kept because the REASONING is still the thing that matters: a harness
> that resolves relative to itself is what makes a corpus provably about the tree it sits in, and
> "do not have a copy import the root's loader" is still the trap. Only the mechanics changed.

```bash
# 1. Land ALL of section 3 first — the purity fixes AND their UI half. One pass (-NEXT.md §7).

# 2. Capture. (No copy step any more — the game is at the root, and so is the harness.)
node scripts/determinism_baseline.js --capture

# 3. Verify the capture verifies. A corpus that cannot be re-verified is not a corpus.
node scripts/determinism_baseline.js --verify

# 4. Wire it into npm test and update package.json's `gates` counts IN THE SAME EDIT —
#    scripts/gate_count_check.js fails the build if the declared numbers drift from the chain.
```

**The "twin question" below is now moot too** — there is no second copy to keep in step, because
there is no second tree. `4/scripts/lib_twin_check.js` has nothing to watch here.

**Three things 03-03 must decide when it does step 2, none of which is decided here:**

- **Seeds.** The root corpus is 30 base seeds (12345–12374, D-03) plus `EXTRA_SEEDS=[12379]`, added
  by 14-04 to restore coverage of an event type no base seed produced any more
  (`DETERMINISM-RERECORD.md` §6a). **`4/` is a different game** — bake-off rather than classic — so
  whether those same seeds cover every event type it emits is a MEASUREMENT to take, not an
  assumption to inherit. `capture()` already fails loudly if the corpus misses a required event
  type; read that output rather than trusting the seed list.
- **The ruleset.** `roundCfg()` returns `bakeoff: true` headless, so `play()` routes to
  `playBakeoff()`, not `playClassic()` (`HARD-WON-LESSONS.md` §3). That IS the right ruleset for
  `/4` — it is what ships — but the manifest must say which one it recorded.
- **The twin question.** `4/scripts/determinism_baseline.js` would be a byte-identical copy of a
  root file that is NOT under `scripts/lib/`, so `4/scripts/lib_twin_check.js` does not currently
  watch it. Either extend that gate's pair list (it already special-cases the `no_undef_check.js`
  pair one directory up, for exactly this reason) or the two will drift unnoticed.

### The anti-vacuity condition, which is not optional

`capture()` already refuses a seed that produces zero events — *"record flag or extraction is
suspect"*. **That guard exists because of a real incident:** `game.events` is empty unless
`record = true`, and a harness that forgot it once measured every row of a sweep as `0 uses`, which
read exactly like a dead mechanic (`HARD-WON-LESSONS.md` §3). **Read the per-seed event counts the
capture prints.** A corpus of empty streams verifies perfectly, forever, against nothing.

---

## 5. THE RE-RECORD PROCEDURE — the reason this file was written tonight

**Phases 4 and 5 may need an engine change.** If they do, this must be a costed, reviewed,
documented act. Not a crisis.

### What triggers it

**Any change to what `src/engine/index.js` emits into the event stream — INCLUDING ADDING OR
RENAMING A FIELD ON AN EXISTING EVENT.** Not just new events. Not just removed ones. A field.

That invalidates every fixture at once.

### What it costs, in wall-clock terms

Sourced from `DETERMINISM-RERECORD.md`, which paid it once, and `-NEXT.md` §7:

| Step | Command | Realistic time |
|---|---|---|
| 1. Full per-seed attributed divergence report | `node scripts/determinism_diff.js --json` | minutes to run |
| 2. **Attribute EVERY divergence to a named cause** | reading | **hours — this is the cost** |
| 3. **A blocking human decision on that report** | Wyatt | his time, and it cannot be skipped |
| 4. One capture run | `--capture` | minutes |
| 5. Verify the capture verifies | `--verify` | minutes |

**Step 2 is where the day goes, and it is not compressible.** An unattributed divergence is the
whole failure this procedure exists to prevent: it means a real behaviour change rode along
invisibly inside a re-record that everyone assumed was mechanical. **A divergence you cannot name is
a bug you have just baptised as the new baseline.**

**There is no cheap version.** The standing rule in `.planning/STATE.md` says it plainly: the corpus
is the multiplayer lockstep oracle, and **UI-tier fixes are preferred precisely so this cost is not
incurred.**

### The one question to ask before ANY engine edit, once the door is closed

> *Can this be done in the UI tier instead?*

`-NEXT.md` §9 is the worked example of getting this right, and it is worth reading before answering:
the trade-wind rim sweep looked like it needed intermediate squares in the event stream, and it did
not — G14 shipped it host-and-guest with no engine change, because the guest could DERIVE the path
from what was already emitted.

**`4/` did this again, on its own, and it is the model to copy.** A swept storm step emits nothing
between stepping onto the rim and `tradewind()`, so the event stream cannot supply the entry cell —
which looks like it forces a new field. Instead `src/ui/flow.js` split the guard from the ride
(`animateRimSweepIfAny` → `animateRimSweepRun(seat,from,to)`) so the caller, which is holding the
pre-step square, passes it in. **The animation shipped and the door stayed shut.** That shape —
*give the renderer an entry point that takes the value, rather than putting the value in the
stream* — is the first thing to try.

---

## 6. WHEN THE DOOR IS FINALLY CLOSED, UPDATE THIS FILE

In the same commit as the capture:

- Change §1 to say CLOSED, and leave the command in place so the claim stays checkable.
- Record the seed set actually used, the ruleset, and the manifest's `capturedAt`.
- Add the `4/` corpus to `.planning/STATE.md`'s standing rule beside the root one.
- Delete §2 and replace it with the decision that was actually taken, and by whom.
