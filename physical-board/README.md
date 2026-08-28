# Pastry Pirates — the laser-cut set

A physical Pastry Pirates as vector files ready for Rhino (SVG and DXF), black and white, two
layers: **CUT** (red hairline) and **RASTER** (black fill, engrave). Styled after the game's own art
— Wyatt, 2026-08-22: *"It should be piratey and match the online game as closely as you can."*

**This folder lives on branch `physical-board` and never on `main`** (players of the digital game
should not see this work). On `main` the folder is git-ignored.

**Start here:** open [`index.html`](index.html) in a browser. The assembled board, mockups of the
assembled ship, chest, spinner, crate and the board on the table, the cutting sheets, and every
group of pieces; tick "approved" per group, leave notes, copy the lot as text.

## What is borrowed from the screen, and how

| On the screen | On the wood |
|---|---|
| The ingredient drawings (`assets/ingredients/*.png`) | **The tokens ARE the drawings**, cut along their own outline, the ink engraved — traced by [`art/trace.py`](art/trace.py). Outlines only on the cocoa, for painting. One sits on each island square, as in the game. The recipe cards use the same ink inside the app's rounded-square chip. |
| Georgia (recipe titles, flavour) and Avenir Next (labels) | Every word on the wood, as outlines extracted by [`fonts/extract.py`](fonts/extract.py): recipe names and *Tortuga* in Georgia Bold, "Recipe No. 7" in Georgia Italic, compass letters and the rules card in Avenir Next. |
| The 21 named recipes (`4/src/ui/recipe.js`) | The 21 recipe cards, by name, with each ingredient's silhouette in the app's rounded-square chip. |
| Islands (per Wyatt's second drawing, `notes/islands.jpeg`) | A straight-edged rounded polyomino is the cut; a **shore line** and a **grass line** are engraved inside it, each waving its own way, with bare wood between them for the beach; one mark per square — the wind-blown palm, a cluster of three stones, the game's grass tuft; a plain 9 × 2.5 mm notch mid-edge on every outside square, its floor just into the shore line so a docked pier touches the sand. |
| The pier (`assets/dock.png`): upright planks, corner posts | The dock tile's engraving; the planks run onto the tab that nests into the island. |
| The wind chevron (`assets/wind-arrow.png`) | One per ring square, rotated to the ring's clockwise tangent as `buildRimFlow()` does. |
| The whirlpool (`assets/trade-swirl.png`) | Traced and engraved on the four whirlpool tiles. |
| The board's water: short brushy wave strokes in concentric passes | About 170 tapered strokes, 9 mm between passes, from outside the berths to the rim. |
| The compass: scrolled ring, N/E/S/W medallions, fleur-de-lis needle | The spinner's dial and needle. |
| The pirate ship (`assets/icons/sailboat.png`): square sail with the skull and bones | Three-piece ships: a 6 mm hull seen from above with two slots across the beam, two 3 mm square sails that drop in, the skull and crossbones (`art/skull-ref.png`) engraved big on each. |
| The 🌩️ emoji (rendered by Chrome on black into `art/storm-emoji.png`) and the coin (`assets/icons/`) | Traced: the emoji's cloud-and-bolt silhouette is knocked out of each storm wedge; the coin stands in for every coin amount on the rules card. |

## The pieces — V3 · The Round Table, 25 mm squares

**Board, 6 mm, Ø 409 mm, in four pieces, plus Tortuga on top.** Four jigsaw quadrants (three knobs
per seam; seams follow the grid lines that frame Tortuga's square, so every square is whole on one
piece; the north-west quadrant carries the centre square). **Tortuga is a +-shaped 6 mm piece** —
anchor and name in the middle, a berth on each arm — that sits on the board like the islands do,
over a dotted outline that shows where it goes. Scrabble-sized (Scrabble is 381 mm; Monopoly 508).

**On the board, 6 mm:** 9 islands — every tetromino orientation: the app's seven footprints plus the
mirror images of the L and the S (a flipped piece would show its blank back); seven go out each
voyage. A plain 9 × 2.5 mm notch in the middle of every outside edge, its floor biting 0.3 mm into the
engraved shore line so a docked pier reads as touching the sand (Wyatt, 2026-08-22). 7 docks, each a pier whose 9 mm deck becomes the tab, planks running
to the tab's end, bollards touching the deck; 0.05 mm of play — it snaps. 28 ingredient tokens
(four per ingredient: three to stock an island, one black-market spare; three padding options A/B/C are on the
page — the sheets carry B until Wyatt picks). 4 ship hulls (24 × 12 mm,
plan view, deck planks, two slots).

**On the board, 3 mm:** 4 whirlpool tiles; 8 sails — a mainsail and a jib per ship, each with a tab
that drops through a hull slot and sits flush underneath; the ship stands about 30 mm tall.

**Thin parts, 3 mm:**
- **Wind spinner, nested.** A 96 mm backing disc; the game's compass as a 70 mm dial glued onto it,
  with a storm wedge in the last fifth of each quadrant (the app's 20%); a ring that turns around the
  dial — *this round's wind* — carrying a slot for the **WIND NOW vane**: a pennant on a 30 mm mast
  that drops into the slot and stands on the backing, streaming toward the letter the ring is set to
  (put the pennant on the inside). The *forecast* is the flat needle on the centre pivot — a
  fleur-de-lis head one way and the same outline the other, on a 9 mm hub, so it balances on the
  axle and the hole leaves 2.85 mm of wood all round. Stack: backing → dial and ring (same level) → needle →
  washer; one M3 × 16 bolt and nyloc nut. Two layers of wood, one pivot, one flag.
- **Cargo crates, 4.** Slatted crates like the classic wooden one, 44 × 30 × 18 mm: three slats a
  side with real gaps cut between them, solid corner posts, box joints, the captain's mark on the
  front. Tokens stand on edge in them, icons showing — cargo is public in the game.
- **Treasure chests, 4.** 80 × 27 × 32 mm (half as deep since 2026-08-25 — players hold under
  10 coins): a box-jointed body (20 mm) and lid (12 mm). **The hinge is a friction fit — no dowel,
  no holes** (a laser cannot drill along an edge; the first build proved it): the lid's tongues
  wedge between the body's and the lid stays where you put it, and the hinge strip runs a
  ply-thickness further at each end to fill the corners. Both big plates carry planks and straps,
  so either face can be the top. Your recipe card (64 × 20) slides under the hinge strip into
  rails on the lid's end walls — they cover only the front 60 %, so tipping the open chest drops
  the card into your hand. Straps, rivets, lock plate — no captain's mark: paint it, like the
  crates.
- 21 recipe cards (64 × 38) and a rules card.

**Captains:** CRUMBLE plain, BISCOTTI striped, GINGERSNAP dotted, SHORTBREAD checked — the same four
marks on each captain's ship, crate and chest.

## Cutting

- **Kerf 0.275 mm** — measured from the 2026-08-25 test cut (set yours with `--kerf`), compensated in **every cut
  file** — sheets and per-group files alike; `board-assembled` is the one uncompensated design view.
  Every cut line is pushed half a kerf away from the wood that stays (outward on outlines, inward on
  holes). Knob/socket play is 0.1 mm; the dock tab snaps at 0.05 mm.
- **600 × 400 mm bed.** Sheets 1–2 are 6 mm, sheets 3–4 are 3 mm. Cut on the red line.
- Only `board-assembled` carries no kerf (a design view); every other file is cut-ready.

```bash
node physical-board/generate.mjs                          # 25 mm, 6 mm / 3 mm, kerf 0.18, 600x400
node physical-board/generate.mjs --cell 30 --kerf 0.2 --bedw 900 --bedh 600
python3 physical-board/art/trace.py physical-board/art/ingredients.json   # re-trace the art
python3 physical-board/fonts/extract.py physical-board/fonts/glyphs.json  # re-extract the fonts
```

## Opening in Rhino

- **SVG**: `Import`; millimetres; `CUT` and `RASTER` are layer-named groups.
- **DXF**: R2000, layers `CUT` (colour 1, bare curves) and `RASTER` (colour 7, **solid hatches** — the raster areas arrive filled). Units mm.
- Red hairline = cut. Black fill = engrave.

## Assembly

**Board.** Lock the four quadrants (any quadrant fits any position — match the engraving), then press
Tortuga into the centre hole last.

**Ships.** Drop the mainsail into the aft slot and the jib into the forward one; no glue needed.

**Crates and chests.** Box joints; glue. Chest: glue the two card rails to the inside of the lid's
end walls with their top edge on the engraved line — front-flush, the back half stays open. No dowel:
press the lid's tongues between the body's and the friction hinge is done.

## How the physical rules differ from the app

- **Whirlpools.** The app splits the ring into four arcs of random length. On the table: put the
  four whirlpool tiles on any four ring squares; a ship that enters the ring is carried clockwise
  to the next whirlpool.
- **Wind and forecast.** At the start of a round, turn the ring's pointer to where the needle points,
  then spin the needle. If it lands in a storm wedge, the forecast is a storm — leave the needle
  there; when that round begins, spin the ring itself — the storm blows that way, three squares,
  every ship (the app hides a coming storm's direction too).

## Not built, on purpose

The Gold Bullion flip coin and the gold coins (you have them), the 50 sea-creature cards for the
Pass action (a print job), a captain's screen (the chest lid does that job now).
