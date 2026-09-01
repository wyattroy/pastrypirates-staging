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

### DEFECT-3 — The six stems were never levelled against each other

`SFX_VOLUME` exists as the one intended tuning point and **every value is still `1`**. Measured
(EBU R128):

| Stem | Integrated | True peak | Suggested `SFX_VOLUME` |
|---|---|---|---|
| `battle-swords` | **−16.3 LUFS** | **+0.2 dBFS — clipped** | 0.46 |
| `fishing` | −21.2 | −4.3 | 0.81 |
| `storm` | −21.7 | −1.5 | 0.86 |
| `coin-flip` | −26.8 | −4.3 | 1.45 *(near the ceiling)* |
| `ship-move` | −27.7 | −11.3 | 1.72 |
| `store-ingredient` | **−31.9** | −12.4 | 2.79 |

A **15.6 dB** spread — the sword clash is about six times louder than a crate being loaded. And the
two extremes sit in the worst possible places:

- `battle-swords` (loudest, **and distorted in the file itself**) is `SHOTCLOCK_SOUND_PLACEHOLDER` —
  it plays **when you run out of time**.
- `store-ingredient` (quietest file in the game) is `WIN_SOUND_PLACEHOLDER` — it is the **victory**
  sound.

Turning `battle-swords` down fixes the balance but **not** the clipping, which is baked into the
file. That one needs a fresh export regardless.

### Also: three moments are silent by accident, not by decision

`storm` (the shove that moves your ship), `testhold`, and `rewatch` (*"ye slip the kitchen hand …
for another look at the crates"*) all produce narration and have **no `EVENT_SOUND` entry at all**.
Everywhere else in that file silence is written down deliberately as `null`. These three simply fell
through — give them explicit entries either way.

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
resolution he settled on: **cannon when the fight is joined** (`playBattleEngage()`, already wired
and firing at the right moment since `260801-7f4`), **and a second sound when it resolves** — which
is the `clash` slot still open in §4.

---

## 3. Two things to get right before music is added

### The narration already asks for a drumroll, and nothing plays

`src/orchestrator.js:1078` is literally `await flash("Drumroll...")`. The board pulls back for a
last look, the blue box types the word, holds, fades, and the gold banner reveals the winner. The
whole moment is built, staged and timed. **It is simply mute.**

**The window is exact, not estimated.** `src/ui/stage.js:578` holds every narration line for
`Math.max(2550, Math.min(6750, msgHoldMs(msg) * 1.5))`, and `"Drumroll..."` is short enough to take
that floor — so the roll is **2.55 seconds** and its final hit lands as the box fades into the
reveal.

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

### Open questions — genuinely his, do not decide these

1. **Does "your turn" break the hear-the-whole-table rule?** `audio.js` D-07 says every captain is
   audible to everyone. A your-turn cue only works if it plays for the reader alone. He has not
   ruled.
2. **Three-state cycle instead of two switches?** He asked whether a single control could cycle
   *everything → effects only → mute*. My recommendation was **yes** — the states form a ladder
   rather than a grid, it adds no new control to a screen where placing the mute button already
   cost several rounds, and it needs one new icon instead of a new surface. He has not ruled.
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
