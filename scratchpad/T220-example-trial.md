# Sea trial v2 — build `2026.09.03.3`

**INCOMPLETE** — 0 of 0 voyage(s) sailed, 10 NOT RUN  ·  2026-09-03T17:49:22.559Z  ·  1 min  ·  gear **COSMETIC**  ·  sailed on **win32 (Wy-Blade)**

> Gear chosen because: **CHOSEN ON THE COMMAND LINE**, overriding the mechanical picker, which said **FULL** (behaviour can change in: package.json)
>
> **Depth: COSMETIC. The mechanical picker said FULL.** A person chose this depth. Their reason, verbatim: **just a script tag in index.html -- his ruling on qid:t206-ga-turn-on**
>
> Sailed by **sea trial v2** — the eyes see EVERY distinct screen (no judge
> cap), five to a call, and each leg says how many of its screens were actually looked at. A report
> from an older trial version looked at less; do not compare their silences.

## What ran

| | |
|---|---|
| checks with no browser (`npm test`) | PASS |
| **can the vision judge see?** | n/a — not asked for (--judge=off) |
| voyages played with a real mouse | none |
| **voyages that did NOT run** | **solo-desktop, solo-phone, solo-tablet, passplay-phone, passplay-desktop, crew-desktop, crew-phone, solo-desktop-wk, solo-phone-wk, solo-tablet-wk** |

## What did NOT run, and why

**solo-desktop**

```
vision judge FAILED 1 of 25 screen(s) it looked at — OPEN THESE; the judge's words are its guess at why, and it is wrong often enough that they are not quotable (T-019)
       · solo-desktop-023-settled.png — bottom line of battle card text ('Davy Scones shows TAILS — Dough Hook must') is truncated/cut off at the card's bottom edge, sentence incomplete
2 screen(s) never stopped moving before being checked (still moving: 2 geometry; longest wait 2.7s)
```

**solo-phone**

```
vision judge FAILED 1 of 26 screen(s) it looked at — OPEN THESE; the judge's words are its guess at why, and it is wrong often enough that they are not quotable (T-019)
       · solo-phone-026-settled.png — award card titles ('Rum Runner', 'Crustbeard') are clipped/overlapped by the fixed 'Play again!' button rather than scrolling cleanly under it
8 screen(s) never stopped moving before being checked (still moving: 8 geometry; longest wait 2.7s)
```

**solo-tablet**

```
offered but never exercised: walk away
vision judge FAILED 2 of 38 screen(s) it looked at — OPEN THESE; the judge's words are its guess at why, and it is wrong often enough that they are not quotable (T-019)
       · solo-tablet-005-settled.png — speech bubble above pink ship is empty/blank, no text rendered
       · solo-tablet-034-settled.png — Pastry Pirates logo/banner in the top-left corner is cut off/clipped by the screen edge, showing only fragments of its icons (sword, bone, cocoa pod) instead of the full logo plaque seen intact in oth
12 screen(s) never stopped moving before being checked (still moving: 12 geometry; longest wait 2.7s)
```

**passplay-phone**

```
offered but never exercised: deny
vision judge FAILED 1 of 29 screen(s) it looked at — OPEN THESE; the judge's words are its guess at why, and it is wrong often enough that they are not quotable (T-019)
       · passplay-phone-029-settled.png — 'Play again!' button overlaps and clips the award cards' captain-name text (both left and right card text cut off mid-letter by the button on top of it, not by the screen edge)
8 screen(s) never stopped moving before being checked (still moving: 8 geometry; longest wait 2.7s)
```

**passplay-desktop**

```
12 screen(s) never stopped moving before being checked (still moving: 12 geometry; longest wait 2.7s)
```

**crew-desktop**

```
offered but never exercised: vanilla beans
11 screen(s) never stopped moving before being checked (still moving: 11 geometry; longest wait 3.0s)
```

**crew-phone**

```
vision judge FAILED 1 of 46 screen(s) it looked at — OPEN THESE; the judge's words are its guess at why, and it is wrong often enough that they are not quotable (T-019)
       · crew-phone-host-025-settled.png — 'test1' label under The Silver-Tongued Ledger card is clipped/overlapped by the Play again! button
1 observation(s) seen only DURING an animation — not failures, read them in the log
10 screen(s) never stopped moving before being checked (still moving: 10 geometry; longest wait 2.7s)
```

**solo-desktop-wk**

```
5 screen(s) never stopped moving before being checked (still moving: 5 geometry; longest wait 2.7s)
```

**solo-phone-wk**

```
did not finish the voyage
1 structural check failure(s): run×1 — first: solo card not clickable
leg error: solo card not clickable
```

**solo-tablet-wk**

```
did not finish the voyage
1 structural check failure(s): run×1 — first: solo card not clickable
leg error: solo card not clickable
```

A leg that did not run is **not** a leg that passed. This section exists so that distinction cannot be lost.


## The voyages, in full

```
(none run)
```

Screenshots and contact sheets: `sea-trial-shots/` (not committed — 100MB+ per run).

---
*Written by `scripts/sea_trial.mjs`. To check whether a sea trial was actually run for what is
live, compare the build stamp above with the one in the game's ☰ menu.*
