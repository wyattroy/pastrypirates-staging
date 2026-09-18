# Audio — what is broken, what was chosen, and how the sounds were found

**Pick this up here.** Everything below came out of the 2026-08-19 audio audit. It is written so a
cold session — or Wyatt, months later — can carry on without re-deriving any of it.

- **What Wyatt has already chosen:** [`.planning/research/audio-sourcing/PICKS.json`](../.planning/research/audio-sourcing/PICKS.json)
- **The brief for Luis (CSV):** [`.planning/research/audio-sourcing/SOUND-BRIEF.csv`](../.planning/research/audio-sourcing/SOUND-BRIEF.csv) — every moment, its context, the duration it has to fit, and which 7 are Luis's to make
- **The tooling that found them:** [`.planning/research/audio-sourcing/`](../.planning/research/audio-sourcing/)
- **The audit as a readable page:** https://claude.ai/code/artifact/57892569-287e-4dcc-a1ec-90cb4956864a
- **Audition galleries** (playable, keep/reject): [round 1](https://claude.ai/code/artifact/f26c0e04-48dc-488d-b589-feb2538b028a) ·
  [round 2](https://claude.ai/code/artifact/464b56e4-70b7-4e0a-afcc-1b7237575dc1) ·
  [round 3](https://claude.ai/code/artifact/cc2f6a16-488a-46f8-ad9e-2140fa7b917f)

The audio module itself is [`src/ui/audio.js`](../src/ui/audio.js). Its own header is excellent
and still accurate on *architecture* — one AudioContext, one master gain, a quieter storm bus, a
fresh source node per play so repeats layer. **This document is about what that architecture is
currently doing wrong, and what is meant to fill it.**

---

## 1. Three defects — TWO OF THEM WERE FIXED AT THE CUTOVER. This section was stale for weeks.

> **⚠ CORRECTED 2026-08-31, and the correction matters more than the defects did.**
> DEFECT-1 and DEFECT-2 were fixed by commit `fb74eedc` (the cutover). This page went on saying
> they were "live right now" — and on 2026-08-31 a session read that heading, believed it, and told
> Wyatt an eight-second storm was blasting at players. **It was not.** A doc that says LIVE is a
> claim about runtime, and rule 6 applies to a document exactly as it applies to a comment: it is
> intent by somebody who has since left the room. **Measure before repeating it.** Verified by
> running the map: `soundForEvent({t:"anchorHold"})` returns `{name:"fishing", bus:"master"}`.
>
> **DEFECT-3 (the stems were never levelled) is UNVERIFIED either way** and stays below as written.
>
> **What was genuinely still open, and is now closed:** nothing guarded the fix. This page said at
> the time *"worth adding both assertions with the fix, red first"* and nobody did.
> `scripts/audio_mapping_test.js` now asserts `anchorHold` plays `fishing`, that `fishing` is
> reachable at all, and — reading the SOURCE, because a finished object cannot show it — that
> `EVENT_SOUND` declares no key twice.
>
> **And the suite that would have caught it has been DEAD SINCE 2026-08-28.** It imported
> `SHOTCLOCK_SOUND_PLACEHOLDER`, which left with the shot clock, so the whole file crashed on load
> — unnoticed because it lives in `test:v1`, parked by the cutover. **Every audio assertion in this
> project has been unrun for weeks while `npm test` reported green about other things.** Repaired;
> it runs again, and it immediately reported three real failures (below).

### DEFECT-1 — `fishing.mp3` can never play. One of six sounds is dead.

`EVENT_SOUND` in `src/ui/audio.js` lists **`anchorHold` twice**. In a JavaScript object literal
the last one wins, so the intended `anchorHold: "fishing"` is silently overwritten by a later
`anchorHold: "storm"`. The only other two events mapped to `fishing` — `fish` and `anchor` — are
**not emitted anywhere in `4/src`** under the v2 rules.

The engine states the intent in writing, at `src/engine/index.js:463`: *"the audio cues
(windmove/blownOut -> ship-move, anchorHold -> fishing)"*. **The comment and the behaviour
disagree.** Every game downloads and decodes a 55 KB file that nothing can trigger.

Introduced in `0d3a71c` (the v2 ruleset), copied verbatim into `/3` and `/4`.

~~**Fix: delete the second `anchorHold` line.** That is the whole change.~~
**ALREADY DONE — see the correction box above.** There is no second line; `src/ui/audio.js:105` is
the only `anchorHold` key left in the object literal. Left struck through rather than deleted,
because this exact sentence read further down than the correction box is what put "delete the
`anchorHold` line" back on the Helm as a live question on 2026-08-31 and got it ruled on a second
time — the box at the top of this section was read; this one was not.

~~**And `npm test` passes.** `scripts/audio_mapping_test.js` is a real, thorough suite — it asserts
the storm-cue pairing, the placeholders, the bus volumes — but it **never mentions `anchorHold` or
`fishing` at all**, and nothing anywhere checks the literal for duplicate keys. So the green tick
is not evidence: this check cannot fail on this defect. Worth adding both assertions with the fix,
red first.~~
**DONE.** `scripts/audio_mapping_test.js` now asserts `anchorHold` plays `fishing`, that `fishing`
is reachable at all, and that `EVENT_SOUND` declares no key twice — all four PASS.

### DEFECT-2 — Anchoring in a storm dumps 8 seconds of weather at full volume, once per ship

A consequence of DEFECT-1, and the reason it matters more than a dead file. `anchorHold` now plays
`storm.mp3`, which is **8.0 seconds long**. Worse, it goes out on the **master** bus, because
`soundForEvent()` only routes to the quiet storm bus for the pair `newround` + `storm` — so
`STORM_VOLUME` (0.35) never applies and it lands roughly **three times louder** than the storm is
mixed to sit.

It fires once per ship: `noteStormOutcome()` is called per player. Three captains anchoring in one
storm stacks three 8-second storms, on top of the storm cue that already played — and `fadeStorm()`
cannot retire any of them, because `stormNode` is only set on the `newround` path.

~~**Fix: the same single line.**~~ **ALREADY FIXED, same commit as DEFECT-1** (`fb74eedc`) —
this defect existed only because of DEFECT-1. `noteStormOutcome()` now plays `fishing`, not
`storm`, so nothing lands on the master bus at full volume any more.

### THREE ASSERTIONS THAT FAIL THE MOMENT THE SUITE RUNS AGAIN (2026-08-31, undiagnosed)

Repairing the crash made these visible for the first time since the cutover. **They are recorded,
not fixed, and NOT put into `npm test` while red — a red gate in the chain is a broken build, and
quietly editing the numbers to make them pass is the thing the numbers exist to prevent.**

```
EVENT_NARRATION has exactly 25 keys (the shared inventory size)   got=9  want=25
EVENT_SOUND has exactly 25 keys (matches EVENT_NARRATION)         got=33 want=25
EVENT_SOUND invents no key of its own (every key also in EVENT_NARRATION)   got=false
```

Two readings, and nobody has separated them: either the sound map has drifted away from the
narration map and some sounds are now unreachable — the same shape as DEFECT-1 — or the coupling
was abandoned deliberately when v2 rewrote the event set, and these are **hand-typed counts that
the game outgrew** (CLAUDE.md §5: *never hand-type a number that can be counted*). The 9-versus-25
gap on the narration side suggests the second, but suggests is not measured.

## 1c. THE LEVELLING PASS — DONE, 2026-09-18. This is his q7 pass, not an interim tweak.

**Read this before changing any number in `SFX_VOLUME`.** The section below it ("THE NINE AT 1")
and DEFECT-3 below that are now HISTORY: their measurements stand, their conclusions are spent.

### What he said

> "Sfx leveling adjustment: the coin flips are too loud, the sailing sound is too loud; please do
> another mixing pass" — then, minutes later, **"Muse sound is also too loud by a lot."**

And, when asked whether the five stems that sat at 1 because he had auditioned them on a tuner page
should be left alone: **"It should relevel them too; I haven't heard them properly."** That ruling
is what makes this the **q7 pass** — "level everything together, once, after all files are in" —
rather than an adjustment to two sounds. Every stem is in it. (The first-home fanfare is still with
Luis; it will be levelled onto the line below when it lands, which is one number, not a re-pass.)

### Why his complaint was predictable, and why loudness alone was the wrong yardstick

The six stems were levelled in 2026-08 by **EBU R128 integrated loudness**, every one brought to
the same −23 LUFS. That measures how loud a sound is **when it plays** and is blind to **how often
it plays** — so the sounds a player hears fifty times a voyage were boosted to match sounds heard
once a voyage. All three he named are among the four most-heard cues in the game.

**The muse is the proof.** R128 had already turned `fishing` **down** to 0.81 and he still called it
much too loud — *by a lot*, his strongest wording. A yardstick that cuts a sound and leaves it the
loudest complaint in the game is measuring the wrong thing.

### ⭐⭐ THE LEVELS ARE HIS, SET BY EAR IN THE TUNER — 2026-09-18

**A measured proposal was built first and he overrode it with his own ear, which is what his ear is
for.** The method below is kept because it was right about the *shape* and is the yardstick for the
next stem that arrives; **where the two differ, his number wins.**

**He tuned with the ambience bed OFF, the music ON, master at 0.80.** Write that down every time
these numbers are quoted: the bed he raised in the same pass was **not audible** while he was
placing the effects against each other, so **the balance between the sea and the effects has not yet
been heard as a whole.** Nothing was adjusted for it — it is a thing to judge in the game.

| | he raised the bed | he lowered almost everything heard often |
|---|---|---|
| sea | 0.596 → **0.695** | sailing 1.72 → **0.57** |
| gulls | 0.168 → **0.335** | the muse 0.81 → **0.38** |
| creaks | 1.122 → **1.585** | the flip 1.45 → **0.57** |
| rates | **unchanged** (creaks 8s, gulls 14s) | the turn bell 1 → **0.63** · a crate 2.79 → **1.82** |
| music | **unchanged** at 0.141 | the coin tick 3 → **1.00** |

…while the rare ceremony sounds went **up**: crate-squawk 2.10, crate-marimba 1.94, card-swish 1.76,
cork-pop 1.73, award-whoosh 1.48, drumroll 1.41.

**That is exactly the frequency axis the first pass lacked, arrived at by ear.** The sea comes up and
the game's chatter comes down — a different mix, not a quieter one.

**Checked against the ceiling, and nothing clips.** Every gain above 1, with its resulting true peak:
crate-squawk −12.6 · crate-marimba −9.1 · store-ingredient −7.2 · card-swish −5.1 · award-whoosh −9.4
· drumroll −7.0 · **cork-pop −2.6**, the closest, with 1.6 dB to spare.

⚠ **One of his numbers reverses an earlier one of his.** `abacus-click` goes **3 → 1.00**, a 9.5 dB
drop and the largest single move in the pass — and the 3 was there because *he* asked for it on
2026-09-14 (*"The ticking sound isn't happening as it should… i don't hear it"*). Both are his;
recorded rather than reconciled. Worth knowing when he judges it: that file is the quietest in the
game by 5 dB (max momentary −40.2), and **he tuned with the bed off**, so it is the stem most likely
to go missing again once the sea is back.

### The method it was checked against — the line, fitted to his three complaints

```
target loudness = −16.9 dB − 1.71 dB × log2(plays per voyage)
```

- **−16.9** is where `battle-won` sits today: the loudest once-a-voyage moment, never complained
  about. So the hero beats do not move, and everything else is placed relative to them.
- **1.71 dB per doubling** is the **smallest** slope that brings all three of his complaints down by
  at least 5 dB — the point where a change stops being arguable and is simply audible. It is fitted
  to his ear, not chosen for tidiness.
- **Ceiling −1 dBFS true peak**, enforced by `scripts/audio_map_check.js` rule (d) against the
  measured peaks in `SFX_TRUE_PEAK_DBFS`.

**Max momentary loudness** is the loudness column, not integrated: it reads a 120 ms click and an
8 s storm on one scale (§5 trap 4 — integrated reads anything under 400 ms as silence), and a
sliced file is played **one slot at a time**, so max-momentary measures the slot rather than the
average over all nineteen pops. Validated: padding a clip with silence leaves its max-momentary
unchanged (`card-swish` reads −31.2 either way), so the padded figure for `abacus-click` is comparable.

### The two-axis table — measured both ways, 2026-09-18

Plays per voyage are **counted, not guessed**: 200 seeded voyages, the shipping bot brain, the
bake-off ruleset, every play derived from the engine's own event stream through `soundForEvent()`.
Mean voyage: 16.3 rounds, 63.3 turns, 311.7 events.

**"Gain →" is HIS number.** The measured proposal is in the last column for comparison only — it is
not what shipped, and it is kept because the *method* is the yardstick for the next stem.

| Stem | Plays / voyage | File max-M | As heard before | **His gain** | Move | New peak | *(measured proposal)* |
|---|---|---|---|---|---|---|---|
| `coin-chink` | **84.3** | −26.9 | −23.7 | 1.45 → **0.66** | −6.8 dB | −15.3 | *0.9* |
| `abacus-click` | **78.7** | −40.2 | −30.7 | 3 → **1.00** | **−9.5 dB** | −12.6 | *3 (held)* |
| `ship-move` | **58.4** | −25.6 | −20.9 | 1.72 → **0.57** | **−9.6 dB** | −16.2 | *0.86* |
| `coin-flip` | **32.2** ⌊floor⌋ | −20.4 | −17.2 | 1.45 → **0.57** | **−8.1 dB** | −9.2 | *0.56* |
| `fishing` (Muse) | **31.9** | −18.6 | −20.4 | 0.81 → **0.38** | **−6.6 dB** | −12.7 | *0.45* |
| `store-ingredient` | **27.9** | −31.9 | −23.0 | 2.79 → **1.82** | −3.7 dB | −7.2 | *2.18* |
| `cork-pop` | **17.0** | −28.6 | −28.6 | 1 → **1.73** | +4.8 dB | **−2.6** | *1.72* |
| `bells` | **15.8** *(your seat only)* | −17.6 | −17.6 | 1 → **0.63** | −4.0 dB | −14.1 | *0.49* |
| `battle-swords` | 5.4 | −14.9 | −21.6 | 0.46 → **0.46** | 0 | −6.5 | *0.46* |
| `award-whoosh` | 5 | −32.6 | −32.6 | 1 → **1.48** | +3.4 dB | −9.4 | *3.86* |
| `crate-marimba` | 4.7 | −32.7 | −32.7 | 1 → **1.94** | +5.8 dB | −9.1 | *3.97* |
| `cannon` | 4.4 | −21.5 | −21.5 | 1 → **1.00** | 0 | −2.0 | *1 (held)* |
| `storm` | 3.3 | −17.9 | −19.2 | 0.86 → **0.57** | −3.6 dB | −6.4 | *0.86 (held)* |
| `card-swish` | 3 | −31.2 | −31.2 | 1 → **1.76** | +4.9 dB | −5.1 | *2.81 (clamped)* |
| `crate-chime` | 2.8 | −30.7 | −30.7 | 1 → **1.00** | 0 | −19.0 | *3.66* |
| `crate-squawk` | 1.9 | −35.1 | −29.1 | 2 → **2.10** | +0.4 dB | −12.6 | *6.77* |
| `battle-won` | 1 | −16.9 | −16.9 | 1 → **1.00** | 0 | −8.0 | *1* |
| `drumroll` | 1 | −20.5 | −20.5 | 1 → **1.41** | +3.0 dB | −7.0 | *1.51* |

**Where he and the measurement agreed closely:** the flip (0.57 vs 0.56), the cork pop (1.73 vs
1.72), the drumroll (1.41 vs 1.51), the muse and the sail (both cut hard, he cut harder). **Where
they parted:** he kept the four ceremony sounds far lower than the line wanted (award-whoosh 1.48 vs
3.86, crate-marimba 1.94 vs 3.97, crate-chime 1.00 vs 3.66, crate-squawk 2.10 vs 6.77) — the line
was placing them against once-a-voyage hero beats and his ear says they are decoration, not beats.
And he cut the coin tick that the line held.

**The two numbers that explain his ear:** `sail` fires on **92% of all turns** (58.4 a voyage) and
`pass` — the Muse — on **50% of them** (31.9). The flip's 32.2 is a **floor**, because
`startFlipSpinSound()` replays the stem every 965 ms (its own buffer length) for as long as a coin
is still spinning, so a slow wire means more.

### "By a lot" is the PILE, not only the stem — measured

**The Muse is two sounds.** The `pass` event plays `fishing`, and it carries `coins: passCoin`, so
the muse coin flies to the purse and **chinks** on the same beat. Measured together:

| | `fishing` | `coin-chink` | the moment |
|---|---|---|---|
| **before** | −6.1 dBFS | −8.5 dBFS | **−1.2 dBFS** — a whisker off full scale |
| **after** | −11.2 dBFS | −12.6 dBFS | **−5.9 dBFS** |

So the moment drops **4.7 dB** on top of the stem's own **5.1 dB**. That is why this one earned his
strongest wording, and why cutting `fishing` alone would have under-delivered.

### ⭐ WHERE EACH STEM ACTUALLY PLAYS — the corrected labels

He flagged this and he was right: *"You mislabeled some of the sounds from where they actually
appear I think."* **Eight of the eighteen never touch `EVENT_SOUND` at all** — they are played
directly from code, so a label derived from that map alone is a guess. Swept from **every call site
in `src/`**, 2026-09-18:

| Stem | Where it actually plays |
|---|---|
| `ship-move` | A captain **choosing to sail** (`EVENT_SOUND.sail`). Never the storm moving you — he removed that. |
| `fishing` | **The Muse** (`EVENT_SOUND.pass`) — the radial builds Muse as `value: "pass"`. Also the anchor family by name, but `fish`/`anchor` are dead keys. |
| `coin-flip` | **A coin spinning** — the tapped coin on the board, and the small coin over a flipping boat. It **repeats** every 965 ms while the coin is still spinning. |
| `bells` | **Your turn**, and only on **your own screen** — the one seat-gated sound in the game. |
| `coin-chink` | **A coin going INTO a purse** — one door for every earning (a dock's treasure, a won call's bounty, a muse coin, a trade's sale). |
| `abacus-click` | **A coin going OUT of a purse**, plus each bake-off guess and the End of Voyage stats rolling up. |
| `store-ingredient` | **A crate landing in the hold** (the "woomp" as its bounce begins), and a crate taken at a dock or in a trade. |
| `cork-pop` | **A crate arriving at the round's pop-in** (19 slots, a semitone up per pop), and **buying** a crate at a dock. |
| `card-swish` | **The recipe cards flying in**, the crow's-nest prompt releasing, and the End of Voyage cards dealing and paging. |
| **`crate-chime`** | ⚠ **NOT a crate landing in the hold.** A crate you got **RIGHT on the bake-off reveal**, plus the "BAKED!" wax seal and the "best" pill stamping down at the End of Voyage. |
| `crate-squawk` | A crate you got **WRONG** on the bake-off reveal. |
| `crate-marimba` | **Each bake-off lid landing** (8 slots, a step up the scale), the victory letters, the End of Voyage dock line. |
| `award-whoosh` | **Each award card dealing in** at the End of Voyage. |
| `drumroll` | The End of Voyage roll, **before the winner is revealed**. |
| `battle-won` | **The win screen.** Heard once. |
| `battle-swords` | **A fight being CALLED** (`engage`), and fleeing one. Not the fight resolving. |
| `cannon` | **A shot landing**, and **firing up the bakery** (`ovens`). |
| `storm` | **Scattered thunder** — once as a storm arrives, then ~20 s apart, on its own quieter bus. |

#### His `crate-chime` question, answered

> *"crate-chime: This is not the sound of a crate landing in the hold."*

**The label was wrong; the wiring is right — and they needed different answers, which is why it was
worth checking rather than assuming.** `crate-chime` is played by `playCrateVerdict(true)` in three
places, none of them a hold: the bake-off reveal, the "BAKED!" seal, and the "best" pill. **The
sound of a crate landing in the hold is `store-ingredient`** — his own 2026-09-18 ask, *the old
crate "woomp" as the bounce BEGINS*. **Nothing was re-wired.** The stem's *name* is what invites the
confusion; renaming a shipped file is a bigger change than this pass, and is not worth doing quietly.

### What the measured method predicted, and how his ear ruled

The predictions are kept because they are the honest test of the method — and two of the three held:

1. **`bells` (your turn) — the line wanted −6.2 dB and called it the riskiest number in the table**,
   because it is the one cue that is a **signal to act** rather than a report, and the only sound
   just its own seat hears. **He cut it 4.0 dB** — the same direction, less far. His ear and the
   line agree that the bell was too loud and disagree by 2 dB about how much. **If a turn ever goes
   unnoticed, this is still the first number to put back.**
2. **`coin-chink` — predicted −4.1 dB, he cut −6.8 dB.** The most frequent sound in the game.
3. **`store-ingredient` — predicted −2.1 dB, he cut −3.7 dB.**
4. **The ceremony sounds: the line was WRONG and his ear corrected it.** The line wanted them up
   9–12 dB (placing them against once-a-voyage hero beats); he put them up **0.4–5.8 dB**. The line
   had no way to know that a bake-off chime is *decoration* rather than a beat — it treated "rare"
   as "important", and those are different things. **That is the method's real limitation, found by
   his ear in one pass, and it is the reason the line is a starting point and not an answer.**

### The dead `EVENT_SOUND` keys — verified, reported, NOT changed

A CEO review flagged `fish` and `shipwrecked` as matching no emitted event. **Confirmed, and there
are seven, not two.** Measured 2026-09-18 two ways — 200 seeded voyages (every event kind the engine
produced) and a grep of every emitter in `src/`:

| Key | Maps to | Emitters in `src/` |
|---|---|---|
| `fish` | `fishing` | 0 |
| `anchor` | `fishing` | 0 |
| `shipwrecked` | `storm` | 0 |
| `dodge` | `battle-swords` | 0 |
| `moored`, `idle`, `bakeoff` | `null` (explicit silence) | 0 |

**Not changed, and that is a decision.** They cost nothing at runtime — an event that never fires
never reaches the lookup — and the standing ruling is that **the default is KEEP**: they are records
of intent, and deleting them is a person's call, not a gate's. `audio_map_check.js` says so in its
own header rather than failing on them.

⚠ **One is worth a human eye: `shipwrecked: "storm"`.** If that event ever came back, it would put
the 8-second storm bed on the **master** bus at full level — which is DEFECT-2 below, exactly. The
comment beside `anchorHold` already warns about this shape. Worth deleting or re-pointing the day
anyone touches it.

---

### THE NINE AT 1 — MEASURED 2026-09-18, SUPERSEDED THE SAME DAY (kept: the measurements are still good)

> **⚠ THE CONCLUSION BELOW IS SPENT — see §1c above.** This section said "⛔ DO NOT APPLY THAT LAST
> COLUMN WHOLESALE — it would undo his own ear on five of the nine". **He overruled it himself on
> 2026-09-18**: *"It should relevel them too; I haven't heard them properly."* Auditioning a sound
> alone on a tuner page is not hearing it in a game, and that gap is what he was naming. **The
> measurements below stand; the instruction not to move them does not.** Left rather than deleted,
> because the *reason* those five were at 1 is still true and still worth knowing.

**Read this before "fixing" the nine gains of 1 in `SFX_VOLUME`.** A gate condemned them on
2026-09-18 with the message *"docs/AUDIO.md DEFECT-3 carries the measured replacement for each"* —
**false twice.** DEFECT-3's table below holds six *different* stems and no value for any of these
nine. The gate has been repaired; this section is the evidence it should have pointed at.

**They are at 1 because of his ruling** (`q7`, 2026-09-06, DECISIONS.md): *"level everything
together, once, after all files are in."*

Measured the same way as DEFECT-3's six (EBU R128, `ffmpeg … ebur128=peak=true`):

| Stem | Integrated | True peak | Gain to reach −21 LUFS |
|---|---|---|---|
| `battle-won` | −19.7 | −8.0 | 0.86 |
| `bells` | −21.4 | −10.1 | 1.05 |
| `drumroll` | −22.6 | −10.0 | 1.20 |
| `cannon` | −23.9 | **−2.0** | 1.40 |
| `cork-pop` | −30.9 | −7.4 | 3.13 |
| `card-swish` | −31.2 | −10.0 | 3.24 |
| `crate-chime` | −32.4 | −19.0 | 3.72 |
| `award-whoosh` | −32.6 | −12.8 | 3.80 |
| `crate-marimba` | −33.1 | −14.9 | 4.00 |

**⛔ DO NOT APPLY THAT LAST COLUMN WHOLESALE — it would undo his own ear on five of the nine.**
The cork pop and the four "Sounds of the Voyage" picks were rendered from their own tuner pages
**at the level he auditioned them**, so a gain of 1 plays them exactly as he dialled them. The
quietness in those five rows is his choice, measured back out of the file. Normalising them would
raise them 3.1x to 4.0x.

The rows where a levelling pass has something real to decide are the other four — and `cannon` is
the interesting one: quiet body (−23.9) with a **−2.0 dBFS peak**, i.e. a sharp transient over a
thin sound, which is a shaping question and not a gain question.

**The trigger for his pass is "after all files are in".** As of 2026-09-18 every stem is in sfx/
(31 files, ocean bed and music included) **except the first-home fanfare, which is with Luis.** So
the pass he ordered is one file away, not overdue — and that one file is the thing to ask him about,
not the nine gains.

### DEFECT-3 — The six stems were never levelled against each other

`SFX_VOLUME` exists as the one intended tuning point and **every value is still `1`**. Measured
(EBU R128):

| Stem | Integrated | True peak | Suggested `SFX_VOLUME` |
|---|---|---|---|
| `battle-swords` | **−16.3 LUFS** | **+0.2 dBFS** *(see the withdrawal below)* | 0.46 |
| `fishing` | −21.2 | −4.3 | 0.81 |
| `storm` | −21.7 | −1.5 | 0.86 |
| `coin-flip` | −26.8 | −4.3 | 1.45 *(near the ceiling)* |
| `ship-move` | −27.7 | −11.3 | 1.72 |
| `store-ingredient` | **−31.9** | −12.4 | 2.79 |

A **15.6 dB** spread — the sword clash is about six times louder than a crate being loaded. And the
two extremes sit in the worst possible places:

- `battle-swords` (loudest, **and distorted in the file itself**) is `SHOTCLOCK_SOUND_PLACEHOLDER` —
  it plays **when you run out of time**.
- ~~`store-ingredient` (quietest file in the game) is `WIN_SOUND_PLACEHOLDER` — it is the
  **victory** sound.~~ **FIXED 2026-09-06 (T-073):** the victory sound is now `battle-won`
  (Luis's `PP_SFX_BattleWon.mp3`), and the constant is `WIN_SOUND` — it stopped being a
  placeholder, so it stopped carrying the word. `store-ingredient` still plays a crate being
  loaded, which is what it is for.

~~Turning `battle-swords` down fixes the balance but **not** the clipping, which is baked into the
file. That one needs a fresh export regardless.~~

> ### ⚠ THE SWORD CLASH IS NOT A DEFECT — the verdict is WITHDRAWN, 2026-09-18
>
> **The measurement stands: `battle-swords` is +0.2 dBFS true peak.** That number was measured
> correctly and is confirmed by a fresh run on 2026-09-18. What was never more than an *inference*
> from it — "clipped, distorted, needs a fresh export" — **is withdrawn.** Luis checked the file and
> found it fine, and Wyatt relayed it: *"luis checked the sword clash and found it fine; fix your
> notes it is not a problem."*
>
> **A peak reading is not a verdict on how a file sounds**, and this is the whole lesson: three
> sessions carried "needs a re-export" as outstanding work on the strength of one number, none of
> them able to hear the file, while the one person who could hear it had not been asked. The −1 dBFS
> ceiling still stands for every stem levelled in §1c above; this one file is a **known, judged
> exception**, and `scripts/audio_map_check.js` rule (d) names it as such rather than pretending the
> measurement is different. **Nothing downstream should carry this as open work.**

### Also: three moments are silent by accident, not by decision

`storm` (the shove that moves your ship), `testhold`, and `rewatch` (*"ye slip the kitchen hand …
for another look at the crates"*) all produce narration and have **no `EVENT_SOUND` entry at all**.
Everywhere else in that file silence is written down deliberately as `null`. These three simply fell
through — give them explicit entries either way.

---

## 1b. THE AMBIENCE BED IS WIRED — 2026-09-07, with his own numbers

**It plays.** Luis's ocean loop with his gulls and creaks scattered over it, running for as long as
the board is on screen. Twelve clips, `sfx/ocean-loop.mp3` + `gull-1..5` + `creak-1..6`, 917 KB.

**The numbers are Wyatt's, dialled by hand and not to be improved on.** He tuned them in the
**Sea Bed Tuner** — https://claude.ai/code/artifact/4623cd73-2340-4611-832f-522ebbf33442 — and
pasted the block out with *"THIS IS AWESOME BUILD IT NOW"*.

| | his setting | as a gain |
|---|---|---|
| Sea level | −4.5 dB | `AMBIENCE_SEA` 0.596 |
| Gull level | −15.5 dB | `AMBIENCE_GULL` 0.168 |
| Creak level | +1.0 dB | `AMBIENCE_CREAK` 1.122 |
| Gull rate | every 10s (mean) | `AMBIENCE_GULL_MEAN_SEC` |
| Creak rate | every 13s (mean) | `AMBIENCE_CREAK_MEAN_SEC` |
| Stereo spread | 70% | `AMBIENCE_SPREAD` 0.7 |
| Liveliness | 35% | `AMBIENCE_LIVELINESS` 0.35 |

`scripts/qa/ambience_one_seam_check.mjs` fails the build if any of them drifts.

### The four things that are load-bearing, and why

1. **⛔ NOT IN `SFX_FILES`, and it must never go in.** §3 below predicted this exact failure before
   the files existed: `initAudio()` awaits `Promise.all` over that array, so a 917 KB bed in it
   would silence the coin flip, the cannon and the your-turn bell until the whole sea downloaded —
   worst on the phone least able to afford it. `initAmbience()` is a separate path that fades in
   whenever it arrives. **The gate fails if a clip ever appears in both arrays.**
2. **ONE SEAM: the screen, never the tier.** `showGameView()` starts it; `showHome()` and
   `showRoom()` stop it — the three functions in `src/ui/lobby.js` whose own header says *"every
   route to these screens goes through them and a route added later cannot forget."* Solo,
   pass-and-play, host, guest and the reload-resume path therefore cannot drift apart. This is
   §3's drumroll ruling (*"DO NOT ARCHITECT DRIFTABLE CODE OR I WILL FIRE YOU"*) applied in
   advance; the gate fails if a second seam appears anywhere under `src/`.
3. **One creak slider works across six creaks** because `AMBIENCE_TRIM` is COMPUTED from measured
   loudness, not typed. The six arrive 8.3 dB apart; creak 6 takes a ×2.03 boost or it is
   inaudible at any setting. A re-export from Luis changes one number in `AMBIENCE_LUFS`.
4. **Mute STOPS the bed**, it does not merely silence it. `play()`'s own mute guard cannot help a
   source started minutes ago and still looping, and a silent-but-running bed would hold Safari's
   tab audio indicator lit for the whole voyage — which is the complaint that produced his
   *"make mute skip the sound entirely"* ruling in the first place. `setMuted()` calls the one
   reconciler, `syncAmbience()`.

### Measured in a live solo voyage, not asserted

Red-proofed first: **with the bed stopped, zero buffer sources start**, so the green below counts.

- the sea starts as **one looping source of 16.71s** — the file's own measured length
- **five scattered clips** fired across 25s, each at a **different playback rate** (the liveliness
  jitter is real, not a constant)
- **10/10 game sounds still decoded** and `audioDiagnosis()` returned `ok` — the separate load path
  does what it claims
- **12 seconds muted: zero sources started**, and the sea restarted on unmute

*(Counts, not rates — the measuring tab was hidden, and §8b of `DRIVING-THE-GAME.md` forbids
quoting a duration measured there.)*

### The music, and the three-way switch that gates it — both built 2026-09-07

**The song is "Out on the Ocean" by Fiddlers Plus**, credited on the Credits page at his
instruction (*"we need to add Fiddlers Plus, and Muster Field Farms to the credits for the
music"*). `sfx/music-ocean.mp3`, 34.5s, mono, 540 KB, at his `MUSIC_LEVEL` 0.141 (−17 dB) and
`MUSIC_PAN` −0.7 (70% to port). Mono is not a defect to fix — a mono source is exactly what pans
cleanly, and the pan moves all of it.

**IT DOES NOT LOOP.** Wyatt: *"the song shouldn't immediately restart after it finishes— it should
wait a minute."* So the track runs to its end, `onended` fires, and `MUSIC_GAP_SEC` brings it back.
A `loop = true` would make that constant dead code, which is what the gate checks for.

⚠ **THE GAP IS 180 SECONDS — THREE MINUTES — AND THIS PARAGRAPH SAID 60 FOR TWO DAYS.** He asked for
it longer on 2026-09-08 and the constant moved; this page did not, and a CEO review caught it. That
matters more here than in most docs: CLAUDE.md sends the next session to read `docs/AUDIO.md`
**first** before touching sound, so a stale number here is not a stale note, it is a briefing that
is wrong. **Read `MUSIC_GAP_SEC` in `src/ui/audio.js` rather than trusting this sentence** — and if
you change it, change this line in the same commit.

*(History, so nobody restores an older value believing it is live: 2026-09-06 recorded a 2-minute
gap · 2026-09-07 ruled 1 minute · 2026-09-08 ruled 3. Each supersedes the one above it.)*

**THE SOUND CONTROL IS A THREE-WAY CYCLE:** sound+music → sound → mute → sound+music. `isMuted()`
still means exactly what it always meant, so not one of its callers changed; what is new is that
"sound is on" now has two answers and only the music separates them. The row names all three from
`data-audio` — panel.js's own rule, *"ONE ATTRIBUTE CARRIES THE WHOLE TRUTH, so the menu row and
the icon cannot disagree"* — and `aria-pressed` was **removed** from that button, because it is a
binary and would announce "on" or "off" for a state that is neither.

`pp_soundMode` is the new key; a player who muted the game on an older build is migrated on first
read, and `pp_muted` is kept in step so a rollback does not lose their choice.

**Measured live, three taps from `full`:** tap 1 → `sfx` and nothing restarts (the sea keeps
running, the song stops); tap 2 → `mute`, silence; tap 3 → `full`, and both return — one **looping**
16.71s source and one **non-looping** 34.47s source. Three taps land back where they started.

### Still open

- **The music is a cut of the full master, not his own "short 1" edit.** That edit is on Drive and
  could not be fetched (the Chrome extension was not connected; the Drive connector returns base64
  into the session rather than to disk). **His level and pan were judged against this exact audio**
  in the tuner, so the numbers mean what he heard. Swapping his edit in later is one file, no code.
- **The bed does not duck** under a cannon or a drumroll, and the music does not duck under either.
  Nobody has asked; noted so the next session knows it is absent by omission, not by decision.
- **His pan is a strong one** (70% to port on a mono track). Worth a headphone check.

---

## 2. The audio contradicts the script

The battles are written entirely as gunpowder. Counted across `4/src` and `index.html`:

| Word | Occurrences |
|---|---|
| powder | 26 |
| broadside | 17 |
| cannon | 14 |
| cutlass | 1 |
| sword | 0 *(outside the filename)* |

**Every one of those battles currently plays a sword clash.** Wyatt asked for a cannon on
2026-08-01; this is not a preference, the audio is contradicting the game's own writing. The
resolution he settled on: **cannon when the fight is joined** (then `playBattleEngage()`, firing at
the right moment since `260801-7f4`), **and a second sound when it resolves** — which
is the `clash` slot still open in §4.

> **Where the "fight joined" sound lives now (architecture item 4, 2026-09-17):** `EVENT_SOUND.engage`
> — the engine records `engage` when a fight is called (`Game.beginBattle`) and the one event consumer
> sounds it on every screen. `playBattleEngage()` is deleted; it played on the host before the opening
> line and on a crew guest only at the first battle snapshot (measured 4.4–13.8 s late).
> `scripts/qa/fight_on_screen_one_door_check.mjs` holds it.

---

## 3. Two things to get right before music is added

### ~~The narration already asks for a drumroll, and nothing plays~~ — IT PLAYS NOW (T-073, 2026-09-06)

`src/orchestrator.js:1078` is literally `await flash("Drumroll...")`. The board pulls back for a
last look, the blue box types the word, holds, fades, and the gold banner reveals the winner. The
whole moment is built, staged and timed. ~~**It is simply mute.**~~ **NO LONGER — `playDrumroll()` fires on both end-of-voyage twins**
(`applyEndMeta` for the guest, `liveResolveEndNet` for the host). The line moved from
`src/orchestrator.js:1078` to `:1439`; cite it by name, not by number.

⛔ **BUT THE TIMING HALF OF HIS RULING IS NOT DELIVERED, AND THE NUMBER BELOW IS STALE.** Wyatt
asked (2026-09-06) to *"match the narration box timing to the sfx file"*. **Measured: the file runs
3148 ms and the box holds 1130 ms** — so the roll is still cut short by the winner reveal, equally
on both screens. A first attempt passed the file's duration as `flash()`'s `holdMs` and was REVERTED
the same day: that argument never crosses the wire (`sendNarr` forwards only `opts.wait`), so it
held the HOST's box for 3148 ms and every guest's for 1130 — a split table, which is worse than a
clipped roll. Doing it properly means the shared narration renderer knowing a line carries a sound,
so both sides derive the same hold from the same file.

~~**The window is exact, not estimated.** `src/ui/stage.js:578` holds every narration line for
`Math.max(2550, Math.min(6750, msgHoldMs(msg) * 1.5))`, and `"Drumroll..."` is short enough to take
that floor — so the roll is **2.55 seconds**.~~
⚠ **THAT FLOOR NO LONGER EXISTS AND THIS PARAGRAPH MISLED A SESSION IN 2026-09.** D-34 replaced the
whole model with reading speed (`narrationHoldMs`, `src/ui/util.js`) and, in stage.js's own words,
*"the elegant version of that change DELETES the floor rather than lowering it"*. **Measured
2026-09-06: the box holds "Drumroll..." for 1130 ms, and the file is 3148 ms** — so the roll is
nearly three times the window, not sized to fit it.

### `initAudio()` blocks every sound on every file

`await Promise.all(SFX_FILES.map(loadOne))` — no sound can play until *all* of them have downloaded
and decoded. With six files totalling 312 KB that is invisible. **Add a music bed to that list and
every sound effect in the game goes silent until the music finishes downloading**, potentially the
first minute of play on a phone. Music must load on its own path and fade in whenever it arrives.

### Looping: do not reach for a bigger file format

MP3 pads a sliver of silence onto both ends of every file, so a naive MP3 loop clicks each time it
comes round. The fix is **not** WAV (≈10 MB/minute, unusable) and **not** OGG (fine on size, but
Safari support is patchy and this game must run in Safari).

**Set `loopStart` / `loopEnd` on the `AudioBufferSourceNode`** — loop between two measured points
*inside* the decoded buffer, skipping the encoder padding. Costs nothing, stays MP3, works
everywhere. Two numbers per looping file.

And **loops do not have to be long.** Game ambience is normally a short bed (15–30s) with a handful
of one-shots scattered at random intervals over it; the scatter is what stops the ear finding the
loop point. A 20-second bed plus six scatter sounds is roughly 350 KB — about what `sfx/` weighs
today.

---

## 4. What Wyatt has decided

Rulings from 2026-08-19, so none of these get re-litigated:

| Decision | His call |
|---|---|
| Who makes the sounds | **Luis for the hero moments, library/fill elsewhere** |
| Music | **Ambient sea bed under everything + music at the big beats** (welcome, bake-off, End of Voyage, storm swap) |
| Controls | **Mute + a separate music toggle** — but see the open question below |
| Register | **More piratey.** *"a wrong bowl can be a squawk?"* — his idea, and it reframed the entire hunt |
| Cannon | Round-1 `explosion_med_long_tail_01.wav`. **Closed.** |
| "The ovens go cold" | **Struck** — the moment no longer exists in the game |
| "Paying the kitchen hand" | **Struck** — does not need a sound |

**22 moments are settled with a chosen file. 3 are open. 2 go to ElevenLabs.** The authoritative
list, with libraries and licences, is [`PICKS.json`](../.planning/research/audio-sourcing/PICKS.json)
— read it rather than trusting any summary here.

The two for ElevenLabs, after two rounds of searching each: **a ship's bell** (free libraries have
cowbells, bell trees and waiters' bells — none is a bell hung in a rolling sea) and **your turn**
(wants a bosun's pipe; nothing free has one).

### The cork pop — his pop-in's sound (2026-09-13)

He picked it on the pop-in tuner: *"sound: Cork pop, starting pitch 1 st, climb 1 st per pop, stops after 18 pops,
volume 55%"*, and *"make the sound play when the ingredient appears -- not when the sparkle appears"*.

- **`sfx/cork-pop.mp3` is one file of 19 slots**, 300ms each: slot *s* is the pop *s* semitones above his starting
  pitch. Each is rendered from the tuner's own recipe by
  [`render_cork_run.mjs`](../.planning/research/audio-sourcing/render_cork_run.mjs), so a high pop lasts as long as a
  low one — pitching one sample up with `playbackRate` would have shortened it by up to 2.8×.
- **Its level is his 55%, baked into the file** — `SFX_VOLUME["cork-pop"]` is 1, so it plays as loud as the tuner did.
  Measured with `volumedetect` (trap 4: EBU R128 cannot read a 160ms clip): one pop −27.9 dB mean / −8.1 dB peak,
  against `store-ingredient` at its game gain, −21.9 / −3.5. Part of the one levelling pass (q7) like every other stem.
- **Timed off the crate's animation, not beside it** (`src/ui/popin.js`): an animation starts on the next frame, and
  timers set beside it ran ~30ms ahead of the eye. Measured at 375×812: every sound starts within 15ms of its crate
  appearing.

### The sounds of the voyage — his picks (2026-09-14)

His game feel audit proposed a sound beside several of the moments it animated. The candidates were built in a page, three per
moment, each heard in a replay of the moment and **levelled to one loudness** (every candidate rendered offline and its sounding
frames measured; median −24.3 dB) so none could win by being louder. He picked on the page ("Sounds of the Voyage",
CURRENT-SHEET), and **the page is the recipe**: [`sounds-of-the-voyage.html`](../.planning/research/audio-sourcing/sounds-of-the-voyage.html)
renders each pick through [`render_voyage_sounds.mjs`](../.planning/research/audio-sourcing/render_voyage_sounds.mjs) at the level he
heard it, so every one plays at `SFX_VOLUME` 1.

| Stem | Moment | His pick, and his note |
|---|---|---|
| `card-swish` | the recipe cards fly in (stage.js, off the entrance's `ready`) | Paper swish — *"remove the "boop boop" at the end -- just use the swish at the beginning."* |
| `abacus-click` | each coin seen leaving a purse (board.js coinLeft, one click per coin, SPEND_GAP_MS apart), the End of Voyage stats roll up, and each bake-off guess | Abacus click; the stats take *"The coin tick"*; the guesses too (2026-09-14). `SFX_VOLUME` 3: at 1 it was the quietest stem and he could not hear it |
| `crate-marimba` | each bake-off lid lands (bakeoff.js dropLid) — 8 slots of 600ms, like the cork pop | Marimba — *"make them lower pitched so they sound more like big crates"* (two octaves down, C3 to A3) |
| `crate-chime` / `crate-squawk` | a right / wrong crate on the reveal | Chime & thud, then (2026-09-14) *"I want the "wrong" sound to be a squawk during the bakeoff"* — the page's own squawk, his pick over re-fetching the macaw he chose on 2026-08-19 |
| `award-whoosh` | each award card deals in | Soft whoosh |

**Refused:** a sting under HEADS/TAILS (*"No need - the coin already has a landing sound baked in."*). **Sent to Luis:** the
first-home fanfare (*"Get Luis to come up with this"*) — a row in SOUND-BRIEF.csv. Measured mean/peak (volumedetect): card-swish
−33.6/−10.0, abacus-click −38.1/−12.6, crate-marimba −33.8/−14.9, crate-chime −35.9/−19.0, crate-thud −30.6/−12.3,
award-whoosh −34.3/−12.9 — against store-ingredient's file −30.9/−12.4 and the cork pop's −31.5/−7.6. **Heard by him on the page,
never by the session that built them** (§6).

**The cannon moved the same day:** it plays from the `shotLands` event (`EVENT_SOUND.shotLands`), on every screen, instead of from
the fight on the device that owned it — a crew guest used to watch a hit in silence.

### Open questions — genuinely his, do not decide these

1. **Does "your turn" break the hear-the-whole-table rule?** `audio.js` D-07 says every captain is
   audible to everyone. A your-turn cue only works if it plays for the reader alone. He has not
   ruled.
2. ~~**Three-state cycle instead of two switches?**~~ **RULED AND BUILT, 2026-09-07.** His words:
   *"Make sure The audio/mute switch is 3-way— sound+music, sound, mute— repeat again from
   sound+music."* The cycle it is, and **the order is part of the ruling**. `SOUND_MODES` owns it;
   the row names all three states from `data-audio`; `scripts/qa/ambience_one_seam_check.mjs` holds
   the order, the wrap and the three labels. **No new icon was needed after all** — the two
   megaphones still carry on/off and the row's words carry the middle position, so the screen where
   placing the mute button cost several rounds gained nothing new to place.
3. **Where a second audio control would live**, if he takes the two-switch route.

---

## 5. Where the sounds came from, and how to find more

Everything below is CC0 or royalty-free **for commercial game use**, which matters: this game ships
on a live public domain.

| Source | Licence | Notes |
|---|---|---|
| [Kenney](https://kenney.nl) | **CC0** — no attribution, commercial fine | 647 files indexed. Best for UI, impacts, coins, jingles |
| [OpenGameArt](https://opengameart.org) | **CC0 only, verified per pack** | 733 files. Best find: `battle-at-sea` (cannon fire, cannonballs hitting hulls) and a 21-file seagull library |
| Sonniss #GameAudioGDC | Royalty-free for games, no attribution, **may not resell the raws** | Professional foley. Reached via `gamesounds.xyz` |

**Pixabay returns 403 to scripted requests. Freesound needs an API token.** Neither was usable.

### Five traps that cost real time

1. **`gamesounds.xyz` mirrors only 2–5 files per Sonniss library, not the whole library.** This is
   why round 1 had a thin parrot and no gull at all. If a slot looks empty, the library probably
   *does* have what you want — the mirror just does not carry it. Adding OpenGameArt is what fixed it.
2. **OpenGameArt packs can carry several licences at once.** A page listing CC0 *alongside* CC-BY-SA
   or GPL gives no way to tell which file is which. `oga.py` drops those packs whole. Two were
   dropped this way. Do not loosen that.
3. **Zips from OpenGameArt contain macOS AppleDouble stubs** (`._name.wav`). They are metadata, not
   audio, and decode as garbage. Filter anything starting `._`.
4. **EBU R128 loudness integrates over a 400 ms gated window, so any clip shorter than that measures
   as silence.** This wrongly rejected most of the Kenney one-shots (clicks, wood impacts, chip
   lays — 0.1–0.3 s each). Use `volumedetect` RMS for short material.
5. **Field recordings routinely open with a minute of nothing.** A naive first-N-seconds preview
   made a perfectly good owl flyby audition as pure silence. `best_offset()` seeks to the most
   energetic window first.

### Level-matching the audition (why it matters)

Straight out of the libraries the candidates spanned **13.2 dB**, which means the loudest master
wins regardless of whether it is the right sound. Getting that down took three attempts, and the
last one is the one that worked:

- `loudnorm` under-corrects badly on short clips (−20.4 to −26.6 against a −20 target).
- Capping gain by peak defeats it for percussive material (huge crest factor → left 10+ dB down).
- **Reach the target, limit the peak, then measure the output and correct once more.** Closed loop.
  Final spread: **4.0 dB** across 109 candidates.

None of this applies to the shipped files — it is audition hygiene only, so the choice is about the
sound. The **true** measured loudness is what `SFX_VOLUME` needs (§1, DEFECT-3).

### Reproducing the hunt

```bash
# `python3` is the Mac / Linux spelling; on Windows the interpreter registers only as `python`
# (scripts/lib/chrome.mjs:110 resolves both, and records what the wrong spelling cost).
cd .planning/research/audio-sourcing
python3 crawl.py libs > sonniss-libs.txt          # 1,816 Sonniss libraries
python3 crawl.py files < targets.txt              # file lists for chosen libraries
python3 oga.py < oga-targets.txt                  # OpenGameArt, licence-verified
python3 build.py                                  # fetch, measure, level, preview
python3 gen_gallery.py                            # self-contained audition page
```

Indexes are cached, so re-runs cost no requests. `build.py` range-limits every download to the head
of the file — Sonniss masters are 96 kHz/24-bit and can run to hundreds of megabytes.

**The audio itself was never committed** (≈370 MB, in a scratchpad that is now gone). The scripts,
the crawl indexes and `PICKS.json` are here; the files are re-fetchable from the URLs in the indexes.

### `make_drumroll.py` — an assembled asset, flagged as such

No free library anywhere has a drumroll. `make_drumroll.py` builds one from a single real drum
strike: an accelerating stroke grid, a crescendo, and a terminal accent landing at 2.42 s so it
resolves inside the 2.55 s window. Three were produced (timpani, hand drum, deep). **They are
constructed, not recorded, and the galleries mark them with a dashed border.** Their shape is
correct by construction; whether they convince was never verified, because the sessions that made
them could not hear them.

---

## 6. The honest limitation on all of this

**The audit and the sourcing were done by a session that cannot hear audio.** Every file was found,
measured, levelled and structurally verified — never *judged*. Each "gap" flag in the galleries is
about what a file **is**, never how it sounds. Wyatt's keep/reject verdicts in `PICKS.json` are the
only aesthetic judgement in the entire record, and they are the part worth trusting.
