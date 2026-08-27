# v3 UI/UX audit — findings catalog (working draft)

Brief: cold new player first · 375px floor · teach-in-play centerpiece · charm everywhere except
actions · tiered quick→big · real-game before/after mocks · nothing sacred.

Evidence base: instrumented playthroughs at 375×812 and 390×844 (headless Chromium, dpr 2),
code measurements from `3/index.html` + `3/src/ui/*`, plus the planning-record dossier.

## RANKED TOP FINDINGS

### 1. The first 60 seconds have no guided attention (his own write-in pain)
- First prompt "Ahoy! … Arrgh!" renders in the narration box BELOW board+coin+clock; nothing
  points there. Cold player sees 5 competing panels. Wyatt: players don't know where to click
  on the "ahoy" screen.
- Fix (quick): on the first prompt of a voyage, dim everything except the narration box
  (one overlay div, ~z-index under #actionPanel), pulse the panel border once. Also give the
  first button function wording: "Arrgh! Set sail →" (charm + function rule).
- Fix (medium): a 3-beat intro sequence in the SAME narration box (his v1 copy pattern):
  goal → your recipe → "watch this panel"; each just an "Arrgh!" tap.

### 2. Sail squares are ~25px taps that commit instantly
- Board renders 319px at 375vw → 13 cols ≈ 24.5px/cell vs his own 44px Phase-19 standard.
  `.sailCell` opacity .5; `:hover` affordances are dead on touch; one mis-tap spends the turn
  (movement is the whole strategy). No confirm was a deliberate choice — but that ruling was
  about a rim-only confirm.
- Fix (quick): contrast pass on highlights (stroke + brighter fill + slow pulse already exists).
- Fix (medium, centerpiece candidate): two-tap with ghost-ship preview — first tap shows YOUR
  boat's ghost on the square (he already approved ghost-boat previews for rim arcs), second tap
  commits. Tap elsewhere moves the ghost. Effective target size becomes the whole board.
- Fix (big): edge-to-edge board at ≤480 (drop side padding: 319→375px, +18% linear, cells 28.8px).

### 3. The board's instruments are illegible at phone scale
- SVG viewBox 640 → scale ≈ 0.50 at 375vw. FORECAST chip text = 15 SVG units ≈ **7.5px**
  rendered. Storm spinner glyph ≈ 9px. Compass letters smaller. Wind rim chevrons are light
  grey on mid-blue at ~12px.
- The forecast is the one instrument the design promises is "never wrong" — and it's the least
  legible element on screen.
- Fix (quick): scale the whole HUD group ~1.6× under 480px (SVG transform), collision-checked
  against the board title art; wind chevrons to white @ 80% with a dark stroke.

### 4. Teach-in-play: rules are explained never, or every turn — not at the moment of need (centerpiece)
- CORRECTION from live capture: the sail prompt's apSub DOES teach the upwind cap — every
  single turn, forever ("ye can run 4 squares with it or across it, but only 2 if yer route
  bites into it"). And it says "click any yellow square" on a touch device.
- Everything else is taught never: first storm (direction hidden on purpose), first dock flip
  (the coin IS the button — three automation drivers and real players all stalled on it),
  first battle/trade/call, dock prices rising, the rim current.
- So the design is inverted: one rule is over-taught (noise by voyage three), the rest untaught.
  A first-voyage hint ledger fixes both: hints show once, then retire; the standing apSub line
  retires with them.
- Design: a first-voyage hint ledger (localStorage `pp3_hints`), one-line hints in the game's
  voice + function, delivered in the apSub slot (existing italic helper line — reveal order
  already settled), each shown once, all suppressed after voyage 1. ~8 hints:
  upwind cap · tap-the-coin · forecast chip · storm hidden direction · dock prices rising ·
  battle call side-bet · trade window · rim current (bots already demo it).
- This extends his own D-41 greyed-button-with-reason pattern = the game's proven teacher.

### 5. Your recipe is invisible while you decide (his "scrolling to see state")
- In solo, the captains panel does NOT re-sort the active captain to the top (that fix shipped
  pass-and-play only). At 375×812 your recipe row sits at the fold or below; deciding where to
  sail requires the board (top) + your needs (bottom) at once.
- Fix (quick): port the active-captain-to-top re-sort to solo.
- Fix (medium): a one-row "hold strip" pinned between clock row and narration: your 5 recipe
  chips, greyed→lit as collected — readable at a glance, tappable to open the recipe card.

### 6. The solo turn clock pressures the player who is still learning
- "PLAY IN 20 seconds or pay 1🪙" runs from solo turn 1; the toggle to disable it is missing in
  solo (his own todo). A cold player reads a countdown + a fine while still finding the buttons.
- Fix (quick): solo default = clock off, toggle present; first voyage always clockless.

### 7. How-to-play is 5.3 phone-screens of prose — and it teaches a game that no longer exists
- 2,567px scroll in a 487px window at 375vw. Teaches: heads pays 6🪙 (engine pays 5), "ghost
  needle" forecast (removed — it's the chip), "plan around" storms (direction deliberately
  hidden). Unreachable before starting a game; Escape doesn't close it.
- Fix (quick): correct the three drifted facts; add a "How to play" link on the welcome card.
- Fix (medium): restructure into 6 illustrated cards (goal / sail / dock / battle / trade /
  storm), swipeable, each ≤1 screen, using board art crops; keep full prose as "the long yarn".

### 8. Welcome screen: no path to rules, and dev-speak on the front door
- Only actions are the two mode cards; "v2.1 + bake-off — test ruleset" + a 4-line telemetry
  paragraph read as internal. No "first time? how it works" affordance anywhere pre-game.
- Fix (quick): "📖 How to play" link under the cards; compress telemetry note to one line with
  a tap-to-expand; move version string to the About page.

### 9. Recipe choice: two 423px cards compared by scrolling, chosen blind
- Cards are beautiful but can't be seen together at 375vw; nothing connects a recipe to the
  BOARD (which islands hold its ingredients / how far they are). Cold player picks on vibes.
- Fix (medium): compact compare — shrink art, two cards fit one screen; on focus, glow the
  islands holding that recipe's ingredients (teaches the island-ingredient mapping for free).

### 10. Chrome tap targets bottom out at 24px
- ≤480px block sets #scPause/#scTimerToggle to 24×24 vs his 44px standard; mute ~40px; footer
  buttons OK (~44px) but sit below the fold with "Leave game" last.
- Fix (quick): 44px minimum via padding (invisible hit area), no visual redesign needed.

### 11. Battle / trade / storm prompts (pending mid-game captures — audit2)
- Placeholder: verify button labels carry function, amounts-on-buttons rule, downwind clarity.

### 12. End of Voyage: dead chrome above the celebration
- Ghosted flip coin + "WAITING" clock sit above "END OF VOYAGE". Fix (quick): hide flip/clock
  row when statsWrap shows.

## CATALOG (smaller findings)
- C1. Name modal ✕ confirms instead of cancelling — tension with his own "close = cancel" ruling (P10).
- C2. How-to-play modal: Escape doesn't close (measured); backdrop tap?
- C3. `.sailCell:hover` and other hover affordances dead on touch (no touch equivalent).
- C4. Chat bubbles 12px text, max-width 42% — squint territory on the board.
- C5. Captains rows 13.5px, recipe name 11px underlined link — small for the primary state surface.
- C6. Bake-off: helper text "Study the order. Start the shuffle when yer ready." persists into
  the covered/shuffling state (stale instruction).
- C7. Bake-off panel taller than viewport: step list scrolls off while tapping crates.
- C8. Footer: 7 buttons in a 2-col wrap below the fold; "Buy me a cookie" amber draws more
  attention than "How to play".
- C9. Welcome screen still renders the live blurred game behind (his own perf todo: static image).
- C10. Recipe link in captains panel (`.prowRecipe`) is a tiny 11px tap target for a key surface.
- C11. No landscape handling statement; board+panel column assumes portrait (fine — note only).
- C12. Version/telemetry strings use plain-English register on an in-world surface (voice
  boundary is credits/About = plain; the welcome card is arguably in-world).
- C13. Storm spinner: rotating arrow glyph for hidden direction is a great idea rendered at 9px —
  invisible on the device it teaches.
- C14. `prefers-reduced-motion` kills the sailCell bounce — the ONLY signal distinguishing
  reachable squares then is a 50%-opacity tint (accessibility).
- C15. All-text lobby/name-modal buttons are fine ≥44px (measured 423px recipe buttons, 45px apBtn).

## MEASUREMENTS LEDGER (for the PDF)
- 375×812 dpr2: board 319px → cell 24.5px; sail hl inset ×0.9 → ~22px visual.
- 390×844: board 334px, cell 25.7px; ap top 479, captains top 600 (bottom 845 > fold 844);
  footer top 899 (below fold); docH 1091.
- Forecast chip: FC_W 190×28 SVG units → ~95×14px at 375vw; label font 15u ≈ 7.5px.
- How-to-play: 3,888 chars; 2,567px scroll / 487px window = 5.3 screens.
- Recipe choice buttons: 423×291px each (2 stacked).
- ≤480 media block: #scPause/#scTimerToggle 24×24px; flip coin clamp(54px,19.5cqw,96px).
- apMsg 15px; apSub 12.5px italic; player-row 13.5px; prowRecipe 11px; chat bubble 12px.
- Engine dockHeads:5 vs how-to-play copy "6"; RULES-V2.md also stale (6/2).
