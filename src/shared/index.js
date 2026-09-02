// src/shared/index.js
//
// Phase 8 shared leaf tier (D-03/D-04). Holds no DOM, `window`, Firebase,
// wall-clock, or unseeded-random access — pure constants and pure helpers
// only, safe for both the engine module and (eventually) UI/net modules to
// import.

/* ================= RNG ================= */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

/* ================= Engine (port of cocoa_pirates_sim.py) ================= */
// THE 7 ingredients in the game — kept in the requested order, and matched 1:1 by
// assets/ingredients/*.png. There is no eighth or ninth: `salt` and `honey` used to trail this
// list as never-dealt leftovers (no art on disk, so they also 404'd the boot preloader) and were
// removed. `nIslands` (7) still slices this list so a smaller board stays possible; it is not a
// hint that more ingredients exist.
const ING_ALL=["wheat","dairy","sugar","eggs","cocoa","spice","vanilla"];
const ING_EMOJI={wheat:"🌾",eggs:"🥚",sugar:"🍬",cocoa:"🍫",dairy:"🥛",vanilla:"🌼",spice:"🌶️"};
// custom-art pipeline: drop matching files in assets/ and they render in place of the emoji/
// vector fallback automatically — nothing else in the code needs to change.
//
// THIS COMMENT USED TO CLAIM "iconAt() below removes the <image> on load failure, leaving the
// original emoji/shape visible". IT DOES NOT, and never has: iconAt() (ui/board.js) has no error
// handler, and neither does ingImg(). Only spawnPops() and the board backdrop have one. So a
// failed ingredient image is left showing the browser's broken-image glyph — the blue "?" Wyatt
// photographed on 2026-08-26. Corrected rather than deleted because the false version was
// load-bearing: it is why nobody added the fallback it promised. (Rule 6: a comment is not a
// measurement, and one making a runtime claim rots.)
// v2 shares v1's art and sound rather than duplicating 19MB. NEVER copy CNAME/robots.txt/
// sitemap.xml alongside them — those claim the live domain (see root CLAUDE.md).
const ASSET_BASE="assets/";
/* THE FORMAT IS PER FILE, AND THE TWO MAPS BELOW ARE THE HONEST RECORD OF THE FOLDER — not an
   oversight and not something to "tidy up" by making them uniform. His ask, INBOX-20260901T1335Z:
   "compressing the images to make the game load MUCH faster." Each file was offered WebP at q0.92
   and WebP lossless (scripts/qa/png_family_reexport.mjs) and keeps whichever is smaller — and two
   of them are SMALLER AS PNG, so they stay PNG. Forcing a uniform extension would mean shipping a
   heavier file to make a line of code look neater, which is the opposite of what he asked for.
   The five that converted were the heavy ones: cocoa 72->12 KB, vanilla 90->15, spice 67->12,
   wheat 70->15. Changing a file's format means changing its entry here, and
   scripts/qa/asset_paths_exist_check.mjs fails the build if the two ever disagree. */
const ING_FMT={wheat:"webp",dairy:"png",sugar:"png",eggs:"webp",cocoa:"webp",spice:"webp",vanilla:"webp"};
const ING_IMG={};ING_ALL.forEach(i=>ING_IMG[i]=`${ASSET_BASE}ingredients/${i}.${ING_FMT[i]}`);
// blackened silhouette of each ingredient, same alpha shape as ING_IMG — rendered at 30%
// opacity to leave a "hole" where a crate used to sit once it's taken. Pure silhouettes, so the
// re-encode moved not one visible pixel: measured mean difference 0.00/255 on every one of them.
const ING_HOLE_FMT={wheat:"webp",dairy:"png",sugar:"webp",eggs:"webp",cocoa:"webp",spice:"webp",vanilla:"webp"};
const ING_HOLE_IMG={};ING_ALL.forEach(i=>ING_HOLE_IMG[i]=`${ASSET_BASE}ingredients/holes/${i}.${ING_HOLE_FMT[i]}`);
/* WEBP, AND EVERY ONE OF ITS 2132x2132 PIXELS IS STILL THERE. His ask, INBOX-20260901T1335Z:
   "compressing the images to make the game load MUCH faster... the only one that needs to be as big
   as it is is the board itself" — that exempts the board's SIZE, not its bytes. 4.24 MB -> 0.19 MB,
   same dimensions, re-encoded by scripts/qa/board_reexport.mjs. /classic reads this same file. */
const BOARD_IMG=`${ASSET_BASE}board.webp`;
const DOCK_IMG=`${ASSET_BASE}dock.webp`;
const WIND_ARROW_IMG=`${ASSET_BASE}wind-arrow.webp`;
const TRADE_SWIRL_IMG=`${ASSET_BASE}trade-swirl.webp`;
const PLAY_IMG=`${ASSET_BASE}icons/play.png`,PAUSE_IMG=`${ASSET_BASE}icons/pause.png`;
/* W5-1, THE ART HALF: TRIED, AND THE REPO'S MASTERS CANNOT BE USED. Wyatt's ruling was "try repo
   assets else park". art-review/ holds 2048x2048 masters of all four flip images and the shipped
   files are 382-512, so on the arithmetic they looked like a straight win. THEY ARE OPAQUE.
   Sampled in a browser: every corner of every master reads alpha 255 over a near-black ground
   (rgba 1,5,8,255) while the shipped files read 0,0,0,0. They are the PRE-CUTOUT renders —
   somebody cut the coin and the plank out by hand to make the art the game ships.
   Re-exported at 768 they put a hard black square behind the flippenator. Measured AND SEEN: the
   decode check passed in both Chromium and WebKit at 768x768 and the screenshot showed the black
   square, which is rule 19's whole point — the numbers were right and the picture was wrong.
   So the art stays as it is and the question goes to Wyatt (CTO-QUESTIONS Q-19): are there
   cut-out masters somewhere, or should these be re-cut? scripts/qa/w51_reexport_coin_art.mjs is
   kept, and now refuses an opaque master rather than shipping one. What DID ship for W5-1 is the
   other half: the ceremony no longer stretches a small raster, so the same art is drawn sharp. */
const FLIP_HEADS_IMG=`${ASSET_BASE}icons/flip-heads.png`,FLIP_TAILS_IMG=`${ASSET_BASE}icons/flip-tails.png`;
const CROWN_IMG=`${ASSET_BASE}icons/crown.png`,CRATE_OVERBOARD_IMG=`${ASSET_BASE}icons/crate-overboard.png`,
  CURRENT_SWIRL_ICON_IMG=`${ASSET_BASE}icons/current-swirl.png`,CUPCAKE_IMG=`${ASSET_BASE}icons/cupcake.png`,
  WAVE_IMG=`${ASSET_BASE}icons/wave.webp`,CHECKMARK_IMG=`${ASSET_BASE}icons/checkmark.png`,
  DICE_IMG=`${ASSET_BASE}icons/dice.png`,EYES_IMG=`${ASSET_BASE}icons/eyes.png`,
  CANCEL_X_IMG=`${ASSET_BASE}icons/cancel-x.png`;
const COIN_IMG=`${ASSET_BASE}icons/coin-emoji.png`,FLAME_IMG=`${ASSET_BASE}icons/flame.png`,
  COIN_SPIN_IMG=`${ASSET_BASE}icons/coin-spin.png`;
const ANCHOR_IMG=`${ASSET_BASE}icons/anchor.png`,BATTLE_IMG=`${ASSET_BASE}icons/battle.png`,
  SAILBOAT_IMG=`${ASSET_BASE}icons/sailboat.png`,FISHING_ROD_IMG=`${ASSET_BASE}icons/fishing-rod.png`,
  HANDSHAKE_IMG=`${ASSET_BASE}icons/handshake.png`,SPOILS_POUCH_IMG=`${ASSET_BASE}icons/spoils-pouch.png`,
  STORM_CLOUD_IMG=`${ASSET_BASE}icons/storm-cloud.png`,SPYGLASS_IMG=`${ASSET_BASE}icons/spyglass.png`,
  FINISH_FLAG_IMG=`${ASSET_BASE}icons/finish-flag.png`,POCKET_COMPASS_IMG=`${ASSET_BASE}icons/pocket-compass.png`,
  FLEE_BOOT_IMG=`${ASSET_BASE}icons/flee-boot.png`,WIND_GUST_IMG=`${ASSET_BASE}icons/wind-gust.png`,
  DODGE_SWOOSH_IMG=`${ASSET_BASE}icons/dodge-swoosh.png`,IMPACT_BURST_IMG=`${ASSET_BASE}icons/impact-burst.png`,
  COINS_FLYING_IMG=`${ASSET_BASE}icons/coins-flying.png`,CANDY_CRAB_IMG=`${ASSET_BASE}icons/candy-crab.png`,
  ISLAND_SILHOUETTE_IMG=`${ASSET_BASE}icons/island-silhouette.png`,REPAIR_TOOLS_IMG=`${ASSET_BASE}icons/repair-tools.png`,
  TARGET_IMG=`${ASSET_BASE}icons/target.png`,SUGARFISH_IMG=`${ASSET_BASE}icons/sugarfish.png`,
  FISH_IMG=`${ASSET_BASE}icons/fish.png`,BLOCKED_SLASH_IMG=`${ASSET_BASE}icons/blocked-slash.png`;
const HOURGLASS_IMG=`${ASSET_BASE}icons/hourglass.webp`,ALARM_IMG=`${ASSET_BASE}icons/alarm.png`,
  STOPWATCH_IMG=`${ASSET_BASE}icons/stopwatch.png`,PAUSE_SYMBOL_IMG=`${ASSET_BASE}icons/pause-symbol.png`;
// AUDIO-02/D-14 (phase 21): Wyatt's own megaphone pair, replacing the 🔊/🔇 emoji scaffold 21-04
// shipped. Two drawn states rather than the timer toggle's swap-to-a-bare-blocked-slash — a drawn
// red X reads as "sound off" at the button's ~29px render size, where a bare slash reads only as
// "off" without saying off what.
const SOUND_ON_IMG=`${ASSET_BASE}icons/sound-on.png`,SOUND_OFF_IMG=`${ASSET_BASE}icons/sound-off.png`;
const DAGGER_IMG=`${ASSET_BASE}icons/dagger.png`,SKULL_IMG=`${ASSET_BASE}icons/skull.png`,
  SNAIL_IMG=`${ASSET_BASE}icons/snail.png`,SALUTE_CAPTAIN_IMG=`${ASSET_BASE}icons/salute-captain.png`,
  SHIELD_IMG=`${ASSET_BASE}icons/shield.png`,CROISSANT_IMG=`${ASSET_BASE}icons/croissant.png`,
  CAKE_SLICE_IMG=`${ASSET_BASE}icons/cake-slice.png`,DONUT_IMG=`${ASSET_BASE}icons/donut.png`;
const SCROLL_IMG=`${ASSET_BASE}icons/scroll.png`,DOOR_IMG=`${ASSET_BASE}icons/door.png`,
  ROBOT_IMG=`${ASSET_BASE}icons/robot.png`,WARNING_IMG=`${ASSET_BASE}icons/warning.png`,
  STORYBOOK_IMG=`${ASSET_BASE}icons/storybook.png`,RIBBON_IMG=`${ASSET_BASE}icons/ribbon.png`,
  SPEECH_BUBBLE_IMG=`${ASSET_BASE}icons/speech-bubble.webp`,KEY_IMG=`${ASSET_BASE}icons/key.png`,
  MAP_IMG=`${ASSET_BASE}icons/map.png`,STOOL_IMG=`${ASSET_BASE}icons/stool.png`,
  DEVICE_IMG=`${ASSET_BASE}icons/device.png`,PARROT_IMG=`${ASSET_BASE}icons/parrot.png`,
  MAGNIFYING_GLASS_IMG=`${ASSET_BASE}icons/magnifying-glass.png`,CLOSE_X_IMG=`${ASSET_BASE}icons/close-x.png`,
  HORN_IMG=`${ASSET_BASE}icons/horn.png`,REFUSED_IMG=`${ASSET_BASE}icons/refused.png`,
  GEAR_IMG=`${ASSET_BASE}icons/gear.png`,REPLAY_IMG=`${ASSET_BASE}icons/replay.png`,
  PRINTER_IMG=`${ASSET_BASE}icons/printer.png`,ENVELOPE_IMG=`${ASSET_BASE}icons/envelope.png`,
  PLAY_ARROW_IMG=`${ASSET_BASE}icons/play-arrow.png`,SPARKLES_IMG=`${ASSET_BASE}icons/sparkles.png`,
  GLOBE_IMG=`${ASSET_BASE}icons/globe.png`,PIRATE_CHEF_IMG=`${ASSET_BASE}icons/pirate-chef.png`,
  PIRATE_FLAG_IMG=`${ASSET_BASE}icons/pirate-flag.png`;
const CLOCK_IMG=`${ASSET_BASE}clock/clock.webp`;
/* WHO A NARRATION LINE IS ABOUT — ONE RULE, CALLED BY BOTH SEATS (Q-18, rule 23).
   An event that names TWO captains is not about either of them: a battle result centred on the
   winner would anchor a fight to one fighter, which is the fault CEO Review 20 found still live on
   the seat Wyatt reported. Everything else is about whoever it names.

   IT LIVES HERE BECAUSE THIS IS THE ONE MODULE BOTH TIERS ALREADY IMPORT — src/orchestrator.js and
   src/ui/panel.js each pull from it, and src/ui/ may never import the orchestrator. Before this the
   host inlined the test and shipped its ANSWER to the guest as a wire field; now both compute it,
   which is what "what makes these two agree?" is supposed to be answered with. */
function subjectOf(e){
  if(!e) return undefined;
  const twoCaptains = e.d!=null && e.a!=null && e.d!==e.a;
  return twoCaptains ? null : (e.p!=null ? e.p : (e.a!=null ? e.a : null));
}
const FLIP_SOCKET_IMG=`${ASSET_BASE}icons/flip-socket.webp`;
const COMPASS_DIAL_IMG=`${ASSET_BASE}compass/compass-dial.webp`,COMPASS_NEEDLE_IMG=`${ASSET_BASE}compass/compass-needle.png`;
// every emoji in the game that has dedicated custom art — the single source of truth emojify()
// (below) and popEmoji() both draw from, so a new icon only needs adding here once. Keys are the
// bare emoji; emojify() also matches an optional trailing variation selector (️) so it
// doesn't matter whether a given call site typed e.g. "⚔" or "⚔️".
const EMOJI_IMG={
  "🌕":COIN_IMG,"⚫":FLIP_TAILS_IMG,"⚪":FLIP_HEADS_IMG,"🔥":FLAME_IMG,"🪙":COIN_SPIN_IMG,
  "⚓":ANCHOR_IMG,"⚔":BATTLE_IMG,"⛵":SAILBOAT_IMG,"🎣":FISHING_ROD_IMG,"🌀":CURRENT_SWIRL_ICON_IMG,
  "🤝":HANDSHAKE_IMG,"👑":CROWN_IMG,"💰":SPOILS_POUCH_IMG,"⛈":STORM_CLOUD_IMG,"🔭":SPYGLASS_IMG,
  "🏁":FINISH_FLAG_IMG,"🧭":POCKET_COMPASS_IMG,"🏃":FLEE_BOOT_IMG,"🌬":WIND_GUST_IMG,"💨":DODGE_SWOOSH_IMG,
  "💥":IMPACT_BURST_IMG,"💸":COINS_FLYING_IMG,"🦀":CANDY_CRAB_IMG,"🏝":ISLAND_SILHOUETTE_IMG,
  "📦":CRATE_OVERBOARD_IMG,"🛠":REPAIR_TOOLS_IMG,"🎯":TARGET_IMG,"🐠":SUGARFISH_IMG,"🐟":FISH_IMG,
  "🚫":BLOCKED_SLASH_IMG,
  "⏳":HOURGLASS_IMG,"⏰":ALARM_IMG,"⏱":STOPWATCH_IMG,"⏸":PAUSE_SYMBOL_IMG,
  "🧁":CUPCAKE_IMG,"🗡":DAGGER_IMG,"💀":SKULL_IMG,"🐌":SNAIL_IMG,"🫡":SALUTE_CAPTAIN_IMG,
  "🛡":SHIELD_IMG,"🌊":WAVE_IMG,"🥐":CROISSANT_IMG,"🍰":CAKE_SLICE_IMG,"🍩":DONUT_IMG,
  "📜":SCROLL_IMG,"🚪":DOOR_IMG,"🤖":ROBOT_IMG,"⚠":WARNING_IMG,"📖":STORYBOOK_IMG,"🎗":RIBBON_IMG,
  "💬":SPEECH_BUBBLE_IMG,"🔑":KEY_IMG,"🗺":MAP_IMG,"🪑":STOOL_IMG,"📱":DEVICE_IMG,"🦜":PARROT_IMG,
  "🔍":MAGNIFYING_GLASS_IMG,"✕":CLOSE_X_IMG,"✅":CHECKMARK_IMG,"❌":CANCEL_X_IMG,"📯":HORN_IMG,
  "🙅":REFUSED_IMG,"🎲":DICE_IMG,"👀":EYES_IMG,"⚙":GEAR_IMG,"🔁":REPLAY_IMG,"🖨":PRINTER_IMG,
  "✉":ENVELOPE_IMG,"➤":PLAY_ARROW_IMG,"✨":SPARKLES_IMG,"🌍":GLOBE_IMG,"🧑‍🍳":PIRATE_CHEF_IMG,
  "🏴‍☠":PIRATE_FLAG_IMG,"▶":PLAY_IMG,
};
// sorted longest-first so multi-codepoint sequences (e.g. the ZWJ chef/flag emoji) match whole,
// not as a stray prefix character followed by leftover combining codepoints. The optional ️
// is inside the group so it applies to every alternative, not just the last one.
const EMOJIFY_RE=new RegExp(
  "(?:"+Object.keys(EMOJI_IMG).sort((a,b)=>b.length-a.length)
    .map(e=>e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")\\uFE0F?","gu");
// The same alternation, capturing the emoji and any punctuation glued to its right, so emojify()
// can keep the two on one line. Built from EMOJIFY_RE.source so the two can never drift apart.
const EMOJIFY_PUNCT_RE=new RegExp("("+EMOJIFY_RE.source+")([.,;:!?\u2026]+)?","gu");
// drop-in replacement for any narration/label/log HTML string: swaps every emoji that has custom
// art for its <img>, leaving anything without dedicated art untouched. Safe to run more than once
// on the same string (already-swapped text has no emoji left to match) — deliberately applied at
// more than one chokepoint (describe(), panel()) rather than tracked precisely, since re-scanning
// a short string is free and missing a spot silently isn't.
//
// SUBSTITUTION HAPPENS OUTSIDE TAGS ONLY, and that is load-bearing, not tidiness. panel()
// (ui/panel.js:435) runs a WHOLE assembled button row through here — every attribute included —
// and iconImg() returns `<img class="narrIcon" src="..." alt="">`, which carries three literal
// double-quotes. Spliced into an already-correctly-escaped data-why="Ye can't afford the powder —
// 5🌕 a broadside…", the first of those quotes CLOSES the attribute early and breaks the button's
// own opening tag open; the leaked fragments then count toward the textContent that
// menuButtons() (ui/stage.js:1029) measures against its 16-character cutoff, which disqualifies
// the WHOLE prompt from the radial bloom and drops it to a flat card — on host and guest alike,
// since panel() is the one sink both localAsk() and watchPrompt() render through. So walk the
// string tag-by-tag and only ever replace inside the text spans between them. This protects every
// current and future data-* attribute, not just data-why.
//
// KNOWN LIMITATION, named rather than hidden (RESEARCH 02.1 §7, threat T-02.1-04): a literal ">"
// inside an attribute value would end a tag span early here and could still be walked into. No
// string this codebase feeds through emojify() contains one — every why:/label is
// developer-authored, never player-typed, and esc()/escW() already turn "<" into "&lt;" — and a
// real HTML tokenizer is disproportionate to a zero-dependency, zero-build-step codebase.
function emojify(html){
  if(!html)return html;
  // split() with ONE capture group alternates text, tag, text, tag… so odd indices are always the
  // captured tags. Index parity is used rather than a startsWith("<") test so that a stray, never
  // -closed "<" in ordinary prose stays TEXT and still gets its emoji swapped.
  return html.split(/(<[^>]*>)/).map((seg,i)=>
    i%2?seg:seg.replace(EMOJIFY_PUNCT_RE,(m,emo,punct)=>{
      const img=iconImg(EMOJI_IMG[emo.replace(/️$/,"")]);
      /* PUNCTUATION STAYS WITH ITS ICON. An <img> is a replaced element, so the browser is allowed
         to break the line straight after it — and it does. The sea trial's vision judge caught the
         result twice, on two different legs: "…find ye one more crate… for 10 [coin]" with the FULL
         STOP stranded alone on the next line, which it read as "a broken/truncated sentence
         template". A player reads it the same way.
         Fixed HERE rather than at the call sites because the sweep found five of them
         (util.js x3, flow.js, panel.js) and any new line of copy would be a sixth. Adds a wrapper
         but no TEXT, which matters: menuButtons() (ui/stage.js) measures textContent against a
         16-character cutoff to decide the radial bloom, so a fix that added even one invisible
         character could silently drop prompts to a flat card. */
      return punct?`<span class="pp4Cling">${img}${punct}</span>`:img;
    })
  ).join("");
}
const BOAT_IMG=[1,2,3,4].map(i=>`${ASSET_BASE}boats/${i}.webp`);
// 7 base island footprints (see TET below); art is authored once per shape in its canonical
// orientation — the game applies the same rotate/mirror it used to place the shape on the board.
const ISLAND_SHAPE_IMG=[1,2,3,4,5,6,7].map(i=>`${ASSET_BASE}islands/${i}.webp`);
// 3–4 block island shapes: lines, Ls, corner, square, S, T. Shared by board generation
// (Game constructor, below) and by island art placement (renderBoard) — index into this array
// is the canonical shape id baked into each islands/N.png filename (1-based) via ISLAND_SHAPE_IMG.
// ORDER IS LOAD-BEARING — indexed by Math.floor(this.r()*TET.length) for shape selection, and separately by ISLAND_SHAPE_IMG for art placement, so a reorder breaks both RNG parity and rendering.
const TET=[
  [[0,0],[1,0],[2,0]],[[0,0],[1,0],[0,1]],
  [[0,0],[1,0],[2,0],[3,0]],[[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[1,0],[2,0],[0,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,0],[1,0],[2,0],[1,1]]];
const ING_NAME={wheat:"Toasty Wheat",dairy:"Fresh Milk",sugar:"Crystal Sugar",eggs:"Speckled Eggs",
  cocoa:"Cacao Pods",vanilla:"Vanilla Beans",spice:"Hot Cinnamon"};
// the plain baker's term each pirate ingredient stands in for — shown as a gloss on recipe cards
const ING_PLAIN={wheat:"flour",dairy:"butter & milk",sugar:"sugar",eggs:"eggs",
  cocoa:"chocolate",vanilla:"vanilla",spice:"cinnamon"};
// worldbuilding (notes/edits #2): every ingredient island has a place-name + a flavorful haul,
// announced when a pirate docks there. One entry per ingredient in ING_ALL — all 7.
const DOCK_PLACE={sugar:"Glitter Bay",vanilla:"Custard Key",spice:"the Spice Isle",
  wheat:"the Flour Patch",dairy:"Full Cream Folly",eggs:"Clucker's Cove",cocoa:"Cocoa Cabana"};
// NARR-01/D-25/D-48 (Wyatt-approved 2026-07-29): flavour phrasing, kept and applied verbatim.
// F5 (Wyatt-approved 2026-07-29): *"when the ingredient icons are referencing an ingredient (not the
// island) they should always consistently go directly in front of the ingredient, not in front of
// the flavor like they do now."*
//
// So the icon has to be inserted BETWEEN the quantity/container phrase and the product name — and
// THE INSERTION POINT CANNOT BE DERIVED FROM THE STRING. iname("cocoa") is "Cacao Pods" while this
// flavour reads "Luscious Cacao Beans": there is no substring to match on, and a regex guessing at
// it would silently produce "a pod of Luscious 🍫 Cacao Beans". So the split is DECLARED AS DATA
// here, once, and dockFlavorIcon() below is the only thing that decides where the icon goes.
//
// The name keeps every adjective that belongs to it ("Luscious", "Red-Hot", "Sand-Speckled"). Note
// `eggs`: its prefix carries no "of" — that asymmetry is exactly why this is data and not a pattern.
const DOCK_FLAVOR={sugar:{prefix:"a jar of",name:"Crystal Sugar"},vanilla:{prefix:"a bundle of",name:"Velvety Vanilla Beans"},
  spice:{prefix:"sprigs of",name:"Red-Hot Cinnamon"},wheat:{prefix:"a sack of",name:"Toasty Wheat"},dairy:{prefix:"some jugs of",name:"Fresh Milk"},
  eggs:{prefix:"a dozen",name:"Sand-Speckled Eggs"},cocoa:{prefix:"a pod of",name:"Luscious Cacao Beans"}};
const dockPlace=x=>DOCK_PLACE[x]||"the island";
// UNCHANGED in signature AND in value — all 7 joined strings stay byte-identical, because two things
// depend on that: the seven `misc:dockFlavor:<ing>` audit cards render dockFlavor(ing) directly (so
// Wyatt's seven reviewed rows read exactly as they did), and the neutral dock narration's own
// wording is not what F5 changes. scripts/narration_test.js pins all 7 against hardcoded literals.  [UNGATED-IN-4: narration_test.js reads the root tree, not this one]
const dockFlavor=x=>{const f=DOCK_FLAVOR[x];return f?`${f.prefix} ${f.name}`:iname(x);};
const iname=x=>ING_NAME[x]||x;
const ilabel=x=>ING_EMOJI[x]+" "+iname(x);
const ingImg=x=>`<img src="${ING_IMG[x]}" alt="${iname(x)}">`;
// narration uses the custom ingredient art (not the raw emoji) so wording matches the rest of the UI
const ilabelImg=x=>`<img class="narrIcon" src="${ING_IMG[x]}" alt="${iname(x)}"> ${iname(x)}`;
// same idea as ilabelImg but for the one-off custom icons (crown, dice, etc.) that stand in for a
// single emoji rather than an ingredient — drop-in replacement for that emoji character in any
// narration/label string that already renders as HTML
const iconImg=src=>`<img class="narrIcon" src="${src}" alt="">`;
// F5: dockFlavor() with the ingredient's icon inserted immediately before the NAME, per the declared
// {prefix,name} split above. THE ONE PLACE that decides where a dock-flavour icon goes — every dock
// string in src/ui/flow.js and src/ui/util.js routes through here, so the branches cannot drift apart
// again. Differs from dockFlavor() by nothing but the inserted icon; narration_test.js proves that by  [UNGATED-IN-4: narration_test.js reads the root tree, not this one]
// stripping the icon back out and comparing (D-16: an icon is never dropped, only moved).
// The unknown-key fallback emits no icon rather than an `src="undefined"` img: for a key with no art
// there is no icon to drop, so D-16 has nothing to protect here.
const dockFlavorIcon=x=>{
  const f=DOCK_FLAVOR[x],icon=ING_IMG[x]?iconImg(ING_IMG[x])+" ":"";
  return f?`${f.prefix} ${icon}${f.name}`:`${icon}${iname(x)}`;
};
// ORDER IS LOAD-BEARING — its Object.values iteration order builds the candidate dock-cell array that the constructor then indexes with an this.r()-derived index; a reorder changes every dock position for an identical RNG draw, and also flips seat-spawn assignment and Dijkstra tie-breaks.
const DIRS={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};
/* CAPS, by Wyatt's ruling of 2026-08-27: "write directions in all caps, eg, SOUTH for all storm
   and wind." CHANGED IN THE TABLE RATHER THAN AT EACH CALL SITE, which is rule 23's question —
   what makes these agree? There are exactly four consumers and every one of them is player-facing
   wind or storm prose (the day-start line and its forecast, the storm summary, and the turn
   banner), so a fifth surface added later inherits the ruling instead of re-deciding it.

   ONLY THE VALUES CHANGED. THE KEY ORDER IS UNTOUCHED, and the line below says why that matters —
   it was momentarily deleted by this very edit and `engine_contract_check.js` (ENGINE-04) caught
   it, which is the whole reason that gate pins nine of these annotations by name. */
// ORDER IS LOAD-BEARING — parallel table keyed to DIRS; must stay in lockstep with it.
const DIRNAME={N:"NORTH",S:"SOUTH",E:"EAST",W:"WEST"};
// a storm's 2nd gust always veers 90° off the 1st (never the same direction, never reversing)
// ORDER IS LOAD-BEARING — consumed only by the classic live turn loop, where PERP[windNow][Math.floor(game.r()*2)] indexes directly by RNG draw. The headless corpus cannot catch a reorder here.
const PERP={N:["E","W"],S:["E","W"],E:["N","S"],W:["N","S"]};
// the combined diagonal a storm actually carries you toward — used to aim the single wind needle
// ORDER IS LOAD-BEARING — consumed only by the classic live turn loop alongside PERP, to aim the storm's combined wind-needle diagonal; the headless corpus cannot catch a reorder here.
const STORM_DIAG={N:{E:45,W:315},S:{E:135,W:225},E:{N:45,S:135},W:{N:315,S:225}};
// v2 rule 1. Sailing is a plain DISTANCE, not a weighted point budget, and it is free (rule 2).
// You move up to SAIL_RANGE squares in any mix of orthogonal directions — but the moment your
// route includes even ONE upwind square (the direct opposite of the wind), the whole move is
// capped at SAIL_RANGE_UPWIND. Crosswind is not upwind and never triggers the cap.
//
// The lee is gone: an island upwind of you does nothing at all now. v1's SAIL_BUDGET(_LEEWARD)
// and windStepCost are deleted rather than left unused — a constant nothing reads is exactly the
// dead code the house rules exist to prevent.
// ORDER IS LOAD-BEARING — parallel table keyed to DIRS; must stay in lockstep with it.
const OPPOSITE={N:"S",S:"N",E:"W",W:"E"};
// What a captain sees when they Pass — there's nothing else worth doing with the turn, so they
// look into the ocean. All fifty sightings are Wyatt's, hand-written in full on 2026-08-06 and
// corrected only for grammar and punctuation; copy here is his, mechanism is ours.
//
// EACH ENTRY CARRIES BOTH PERSONS, and that is the whole design. One sighting is narrated two ways
// — "ye lean over the rail..." to the captain themselves, "Crustbeard leans over the rail..." to
// everyone else — and `{}` in `t` is where the captain's name goes. It is NOT always first: Wyatt's
// own "Off the bow, ye see..." becomes "Off the bow, Crustbeard sees...", which no name-prefix rule
// could have produced.
//
// THE PREVIOUS SHAPE (a shared SEA_OPENERS table plus a per-creature subject and verb) IS GONE.
// It existed to keep the two persons in lockstep from one source, but it only worked while every
// line began with the same handful of clauses. Wyatt's rewrite fuses opener and sighting — "ye see
// a baby candycrab scuttle off the deck", "By the bow, ye spy..." — so there is no shared opener
// left to share. Both forms are now written out, which also means the second verb in a compound
// sentence is conjugated correctly ("leans over the rail, and SPOTS six clownfish") — something no
// leading-clause rule would have caught.
//
// Nothing is inferred at runtime. No article is guessed, no verb agreement is derived, no person is
// conjugated: every string is read out exactly as written.
//
// ORDER IS LOAD-BEARING (Wyatt, 2026-08-06): "we want each animal to be followed by a substantially
// different animal, in a different view/part of the oceanscape." No two neighbours share a creature
// family or a zone of the sea — and because each captain starts at their own point and walks the
// list as a RING, the 50→1 join is a real adjacency and satisfies the rule too. Adding or moving an
// entry means re-checking both, not just the visible neighbours.
const SEA_CREATURES=[
  {y:"ye peep into the clear water and see a pokey pistachio pufferfish gettin' sassy.",
   t:"{} peeps into the clear water and sees a pokey pistachio pufferfish gettin' sassy."},
  {y:"ye lean on the railing as a honeycomb hermit crab skitters by.",
   t:"{} leans on the railing as a honeycomb hermit crab skitters by."},
  {y:"By the bow, ye spy a minty mahi mahi leap out of the emerald water.",
   t:"By the bow, {} spies a minty mahi mahi leap out of the emerald water."},
  {y:"ye peer down past the waterline at a school of glittering sugarfish.",
   t:"{} peers down past the waterline at a school of glittering sugarfish."},
  {y:"ye catch sight of the bottom, and a dozen donut shrimp bounce past.",
   t:"{} catches sight of the bottom, and a dozen donut shrimp bounce past."},
  {y:"ye spy a key lime lionfish fanning out its tangy fins.",
   t:"{} spies a key lime lionfish fanning out its tangy fins."},
  {y:"Off the bow, ye see a sprinkle shark leave a rainbow wake in the water.",
   t:"Off the bow, {} sees a sprinkle shark leave a rainbow wake in the water."},
  {y:"ye watch some sour sardines turn together in the turquoise water.",
   t:"{} watches some sour sardines turn together in the turquoise water."},
  {y:"ye lean over the rail, as shimmering cinnamon squid drift past.",
   t:"{} leans over the rail, as shimmering cinnamon squid drift past."},
  {y:"ye peer down past the waterline, and a banana bonito slips down the hull.",
   t:"{} peers down past the waterline, and a banana bonito slips down the hull."},
  {y:"ye catch sight of the bottom, where a lollipop lobster backs into a crack.",
   t:"{} catches sight of the bottom, where a lollipop lobster backs into a crack."},
  {y:"ye squint up and see an applesauce albatross soaring above.",
   t:"{} squints up and sees an applesauce albatross soaring above."},
  {y:"ye watch the sea open up as a butterwhale breaches and splashes down.",
   t:"{} watches the sea open up as a butterwhale breaches and splashes down."},
  {y:"ye lean over the rail and see a gingerbread hammerhead circling.",
   t:"{} leans over the rail and sees a gingerbread hammerhead circling."},
  {y:"ye peer starboard and see a marshmallow manatee floating in the swell.",
   t:"{} peers starboard and sees a marshmallow manatee floating in the swell."},
  {y:"ye look down through clear water at a nougat nudibranch sliding along.",
   t:"{} looks down through clear water at a nougat nudibranch sliding along."},
  {y:"ye look down at a reef to see a peppermint parrotfish crunching candy cane coral.",
   t:"{} looks down at a reef to see a peppermint parrotfish crunching candy cane coral."},
  {y:"ye lean over the rail, when a custard cuttlefish flashes gold and vanishes.",
   t:"{} leans over the rail, when a custard cuttlefish flashes gold and vanishes."},
  {y:"ye watch the water slide by, swirled by a school of tiramisu tuna.",
   t:"{} watches the water slide by, swirled by a school of tiramisu tuna."},
  {y:"ye catch sight of the bottom, and a tiny toasted coconut crab scuttles along.",
   t:"{} catches sight of the bottom, and a tiny toasted coconut crab scuttles along."},
  {y:"ye see a pavlova pelican dive in a white crash of meringue.",
   t:"{} sees a pavlova pelican dive in a white crash of meringue."},
  {y:"ye catch sight of a blueberry beluga spraying jam as it splashes down.",
   t:"{} catches sight of a blueberry beluga spraying jam as it splashes down."},
  {y:"ye look down through crystal clear water and spy a reef of golden funnelcake coral.",
   t:"{} looks down through crystal clear water and spies a reef of golden funnelcake coral."},
  {y:"ye keep an eye on the swell, and some maple syrup seals slick over each other.",
   t:"{} keeps an eye on the swell, and some maple syrup seals slick over each other."},
  {y:"ye peer down and spot a mocha manta ray gliding below.",
   t:"{} peers down and spots a mocha manta ray gliding below."},
  {y:"ye catch sight of the bottom, where a salted caramel starfish sticks to a rock.",
   t:"{} catches sight of the bottom, where a salted caramel starfish sticks to a rock."},
  {y:"ye lean over the rail, and spot six clementine clownfish squabbling.",
   t:"{} leans over the rail, and spots six clementine clownfish squabbling."},
  {y:"ye drift near a reef, and a giant snickerdoodle sea snail slides by.",
   t:"{} drifts near a reef, and a giant snickerdoodle sea snail slides by."},
  {y:"ye peer down deep, where a jello octopus wobbles.",
   t:"{} peers down deep, where a jello octopus wobbles."},
  {y:"ye catch sight of the bottom, where a fudgey flounder unburies itself.",
   t:"{} catches sight of the bottom, where a fudgey flounder unburies itself."},
  {y:"ye peer down past the waterline, and a cheesecake sea snake squiggles below.",
   t:"{} peers down past the waterline, and a cheesecake sea snake squiggles below."},
  {y:"ye lean over the rail, and a great white waffleshark passes below with maple syrup on its fin.",
   t:"{} leans over the rail, and a great white waffleshark passes below with maple syrup on its fin."},
  {y:"ye squint up at the sky, and see a cotton candy flamingo float over.",
   t:"{} squints up at the sky, and sees a cotton candy flamingo float over."},
  {y:"ye look into the water, and spy a cloud of pecan prawns roasting in the shimmering sun.",
   t:"{} looks into the water, and spies a cloud of pecan prawns roasting in the shimmering sun."},
  {y:"ye watch the turquoise water slide by, thick with peanut butter jellyfish.",
   t:"{} watches the turquoise water slide by, thick with peanut butter jellyfish."},
  {y:"ye float by a reef, where a lemony anemone wiggles its citrusy arms.",
   t:"{} floats by a reef, where a lemony anemone wiggles its citrusy arms."},
  {y:"ye watch the sea open up ahead, and a challah humpback blows a toasty plume.",
   t:"{} watches the sea open up ahead, and a challah humpback blows a toasty plume."},
  {y:"ye peer down deep and see a family of strawberry seahorses squoogling along.",
   t:"{} peers down deep and sees a family of strawberry seahorses squoogling along."},
  {y:"ye catch sight of the bottom, and a gummy eel stretches out of its hidey-hole.",
   t:"{} catches sight of the bottom, and a gummy eel stretches out of its hidey-hole."},
  {y:"ye lean over the rail, and some affogato angelfish swirl up like cream in coffee.",
   t:"{} leans over the rail, and some affogato angelfish swirl up like cream in coffee."},
  {y:"ye watch the water off the bow, and a pod of dark chocolate dolphins jump up.",
   t:"{} watches the water off the bow, and a pod of dark chocolate dolphins jump up."},
  {y:"ye drift near a reef, and a crème brûlée stingray lifts off, its back cracked and burnt gold.",
   t:"{} drifts near a reef, and a crème brûlée stingray lifts off, its back cracked and burnt gold."},
  {y:"ye see a baby candycrab scuttle off the deck, shell hard as torched sugar.",
   t:"{} sees a baby candycrab scuttle off the deck, shell hard as torched sugar."},
  {y:"ye look up at a shadow crossing the deck, and a sesame seagull makes off with a bun.",
   t:"{} looks up at a shadow crossing the deck, and a sesame seagull makes off with a bun."},
  {y:"ye spy an ice cream sea bream chilling in the hull's shadow, keepin' cool.",
   t:"{} spies an ice cream sea bream chilling in the hull's shadow, keepin' cool."},
  {y:"ye catch sight of the bottom, where a giant cappuccino clam shuts with a foamy thump.",
   t:"{} catches sight of the bottom, where a giant cappuccino clam shuts with a foamy thump."},
  {y:"ye peer at an eggnog nautilus spiraling to the surface in a creamy swirl.",
   t:"{} peers at an eggnog nautilus spiraling to the surface in a creamy swirl."},
  {y:"ye lean over the rail, and a babka bull shark comes in too close.",
   t:"{} leans over the rail, and a babka bull shark comes in too close."},
  {y:"ye keep an eye on the swell, and the amber shell of a toffee turtle surfaces.",
   t:"{} keeps an eye on the swell, and the amber shell of a toffee turtle surfaces."},
  {y:"ye drift near a reef, and a honey lavender sea cucumber lies there, doing nothing.",
   t:"{} drifts near a reef, and a honey lavender sea cucumber lies there, doing nothing."},
];
const SAIL_RANGE=4,SAIL_RANGE_UPWIND=2;
// v2 rule 7: a storm is one direction, this far, everyone at once, at the start of the round.
const STORM_PUSH=3;

/* ================= THE BAKE-OFF (v2.1, experimental) =================
   The end-of-voyage minigame: five mixing bowls, shuffled, named back in the recipe's own order.
   See v2bakeoff/src/engine/bakeoff.js for the pure core and RULES-V2.md for the ruleset.

   BAKEOFF_ENABLED IS A ROLLBACK SWITCH, NOT A TUNING KNOB. False restores the pre-bake-off game
   exactly — the instant finish and the one-lap final round — and scripts/bakeoff_baseline.js proves  [UNGATED-IN-4: bakeoff_baseline.js reads the root tree, not this one]
   that mechanically against a fingerprint captured before the feature existed, rather than leaving
   it as a claim nobody re-checks.

   It is threaded onto `cfg` by roundCfg() rather than read directly at every call site, for two
   reasons that both bite otherwise: a headless balance run needs to flip it PER GAME to compare the
   two rulesets in one process, and a solo save must carry the value it was played under (cfg is
   rebuilt from roundCfg() on resume, so a save made with it on and resumed with it off would replay
   a decision log against a structurally different game).

   BAKE_ATTENTION is the bot's per-crate memory. NOT a difficulty dial for the player: raising it
   makes bots better, it does not make the puzzle harder.

   RETUNED 0.28 -> 0.24 (Wyatt, 2026-08-08: "The bots should take 2-3 turns to finish the bakeoff,
   getting 1-2 more ingredients right per attempt. Tune them so this is the case."). Measured over
   60k bakes per candidate:

     att    mean attempts   1st attempt   newly-correct per later attempt
     0.20        2.94          2.00                 1.54
     0.24        2.72          2.20                 1.63     <- both criteria inside their bands
     0.28        2.51          2.41                 1.72     <- old; first attempt above "1-2"

   THE TWO CRITERIA PULL AGAINST EACH OTHER, which is worth knowing before anyone "improves" this.
   Five crates finished in two attempts REQUIRES 2.5 per attempt, which is outside "1-2" by
   construction — so the gain criterion pushes the mean up and the turn criterion pushes it down.
   0.24 is where both land inside their stated range at once.

   Attention also cannot cut both tails: it only trades instant wins against long ones. At 0.24,
   11.5% of bakes still finish first try and 21.3% run to four or more. The 2-3 band is essentially
   flat at ~69% across the whole usable range, so there is no setting that concentrates it further —
   that would need a different bot model, not a different number. */
const BAKEOFF_ENABLED=true;
const BAKE_SWAPS=3;
const BAKE_ATTENTION=0.24;
// What one more look at the shuffle costs (Wyatt, 2026-08-08: "You should be able to pay 1 coin to
// rewatch the shuffle happen before making your guess — and repeat it as long as you have coins").
// A coin, and no cap beyond your purse: the ceiling is affordability, which is a decision the player
// already understands, rather than an arbitrary "3 rewatches max" nobody can reason about. It also
// gives coins a use at the very end of a voyage, where they had none — every other way to spend
// them is out at sea.
const BAKE_REWATCH_COST=1;
/* rulesFacts(cfg) — EVERY NUMBER THE HOW-TO-PLAY PAGE TEACHES, computed from the same cfg the
   engine plays by (A-7 — Wyatt, 2026-08-28: the rules page must update "according to the latest
   rules" automatically). The page holds no copy of any amount: each one is an empty
   <b data-rule="key"> span filled from this object at boot and again on every modal open, so a
   retuned constant cannot disagree with the page (rule 9's todo in roundCfg's own comment, paid).
   scripts/qa/rules_page_check.mjs reads THIS SAME function, which is what stops the gate and the
   filler drifting apart. Takes cfg as an argument because shared/ sits below engine/ in the
   module graph — the caller passes the live game's cfg, or roundCfg's default. */
function rulesFacts(cfg){
  return {recipeSize:cfg.recipeSize,startCoins:cfg.startCoins,
    sailRange:SAIL_RANGE,sailUpwind:SAIL_RANGE_UPWIND,stormPush:STORM_PUSH,
    dockHeads:cfg.dockHeads,dockTails:cfg.dockTails,
    crateBase:cfg.crateBase,
    // the worked price ladder: first crate off a full shelf, the next, and the last one
    priceFirst:cfg.crateBase-cfg.crates,priceNext:Math.min(cfg.crateBase-cfg.crates+1,cfg.crateBase-1),priceLast:cfg.crateBase-1,
    powder:cfg.powder,refire:cfg.refire,callBounty:cfg.callBounty,passCoin:cfg.passCoin,
    blackMarket:cfg.blackMarket,bakeRewatch:BAKE_REWATCH_COST};
}
// bakeoffEnabled() — the live switch, same memoize-and-guard shape as windPrototypeEnabled():
// `?bakeoff=0` / `?bakeoff=1` overrides the constant for one session so both rulesets can be
// A/B'd on a phone without a redeploy. Guarded so a file:// page or a storage-blocked context
// falls back to the constant instead of throwing.
let bakeoffOn=null;
function bakeoffEnabled(){
  if(bakeoffOn!==null)return bakeoffOn;
  let on=BAKEOFF_ENABLED;
  try{
    if(location.search.indexOf("bakeoff=1")!==-1)on=true;
    else if(location.search.indexOf("bakeoff=0")!==-1)on=false;
  }catch(err){}
  bakeoffOn=on;
  return bakeoffOn;
}
/* ================= ?ovens=1 — the bake-off playtest shortcut =================

   A whole voyage to reach the ovens is 16-odd days, and the thing being tested at the end of it
   takes ninety seconds. `?ovens=1` fills the HUMAN captains' holds with their own drafted recipe
   the moment the draft closes. Everyone starts the game standing on Tortuga, so a full hold is the
   only thing standing between the first turn and the ovens: pass on day one and they light.

   BOTS ARE DELIBERATELY LEFT ALONE. Filling every hold would end the voyage on day one and test
   nothing. Leaving them to sail normally is what makes this a real test of the thing actually in
   question — whether the days a captain spends baking give the rest of the table a catch-up window
   that feels earned.

   IT DRAWS NO RANDOM NUMBERS, which is what makes it safe to bolt onto a seeded game: the same seed
   still produces the same board, the same recipes and the same bot decisions. It only changes what
   is in a hold. It rides in soloMeta for the same reason the bake-off flag does — a save made with
   it on and resumed without it would replay its decision log against a different game. */
/* IS THIS A DEVELOPER'S MACHINE? — the one gate every dev flag hangs off.
   CUTOVER, 2026-08-26. While this game lived at /4 it was a dev preview and a URL that skipped the
   voyage cost nothing. It is now the front door, and Phase 6's criterion 4 is explicit: "No URL a
   player can type skips the voyage or opens a developer tuning panel." `?ovens=1` fills the human
   holds — a player who typed it would skip the entire 16-day voyage and never know what they
   missed; `?windhud=1` opens a tuning HUD.
   NOT DELETED, because both are genuinely useful and deleting them would mean re-deriving them the
   next time the bake-off needs testing. Gated instead: the flags keep working exactly as before on
   localhost and from a file:// checkout, and do nothing at all on the live domain. ONE definition
   rather than a copy at each flag (rule 23) — a second copy is a second thing to keep in step. */
function devHost(){
  try{
    const h = location.hostname;
    // STAGING COUNTS AS A DEVELOPER'S MACHINE (W0-1, 2026-08-27). staging.playpastrypirates.com is
    // where Wyatt plays work in progress; it did not exist on the day this gate was written, so the
    // gate is not wrong, it is older than the environment. An EXACT match, never endsWith(): a
    // suffix test would also admit evil-staging.playpastrypirates.com, and the whole value of this
    // function is that the list of who counts is short enough to read.
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === ""
        || h.endsWith(".local") || h === "staging.playpastrypirates.com";
  }catch(err){ return false; }
}

const OVENS_NOW=false;
let ovensNowOn=null;
function ovensNowEnabled(){
  if(ovensNowOn!==null)return ovensNowOn;
  let on=OVENS_NOW;
  try{
    if(devHost() && location.search.indexOf("ovens=1")!==-1)on=true;
    else if(location.search.indexOf("ovens=0")!==-1)on=false;
  }catch(err){}
  ovensNowOn=on;
  return ovensNowOn;
}
/* ================= THE TWO ENDGAME SKIPS (W0-1, 2026-08-27) =================

   Wyatt's playtest of 2026-08-27 marked four items PROBLEM that were problems only because he
   could not GET to them on a phone: the bake-off's second attempt and the End of Voyage card both
   sit at the far end of a sixteen-day voyage. `?ovens=1` already solves half of it — it puts a
   captain at the ovens on day one — but it lands on attempt ONE, and the jitter he reported is an
   attempt-TWO fault. Neither flag could reach the end card at all.

   Both ride on devHost(), so they are dead on playpastrypirates.com. Both IMPLY ?ovens=1 (see
   testFlagOn in orchestrator.js): stocking the holds and lighting the ovens is the shared first
   half of every route to the endgame, and two flags that stock holds their own way would be two
   things kept in step by memory.

   NEITHER DRAWS A RANDOM NUMBER, which is what makes them safe to bolt onto a seeded game — the
   board, the recipes, the wind and every bot decision are unchanged. */
const BAKE2_NOW=false;
let bake2On=null;
function bake2Enabled(){
  if(bake2On!==null)return bake2On;
  let on=BAKE2_NOW;
  try{
    if(devHost() && location.search.indexOf("bake2=1")!==-1)on=true;
    else if(location.search.indexOf("bake2=0")!==-1)on=false;
  }catch(err){}
  bake2On=on;
  return bake2On;
}
const ENDCARD_NOW=false;
let endCardOn=null;
function endCardEnabled(){
  if(endCardOn!==null)return endCardOn;
  let on=ENDCARD_NOW;
  try{
    if(devHost() && location.search.indexOf("endcard=1")!==-1)on=true;
    else if(location.search.indexOf("endcard=0")!==-1)on=false;
  }catch(err){}
  endCardOn=on;
  return endCardOn;
}
const NAMES=["Capt. Davy Scones","Capt. Crustbeard","Capt. Dough Hook","Capt. Flaky Jack"];
// default captain names in seat order (no "Capt. " prefix) — the pool a player who leaves the
// name box blank draws from, mirroring the defaults pname() shows for un-claimed seats.
const DEFAULT_NAMES=NAMES.map(n=>n.replace("Capt. ",""));
// #15/#2: a blank name box no longer gets a *random* captain name (which could collide with a
// bot's or another captain's default — the "two Crustbeards" bug). Instead pick a name no seat
// in `seats` is already using, preferring the one that belongs to `preferIdx`'s own seat so the
// solo/host player at seat 0 reliably becomes "Davy Scones".
// seatHeldName(seats,i) — THE ONE ANSWER to "what name is this seat holding right now?"
//
// Item 16 (D-19) needs to ask that question of every seat before it lets a joining captain keep the
// name they typed, and unusedDefaultName() below was already asking its own version of it to build
// the taken-set. Two askers means two answers that drift, so there is one function and both name it
// (CLAUDE.md rule 23).
//
// AN UNNAMED SEAT STILL HOLDS A NAME, and that is the whole subtlety. A networked bot seat is written
// as {name:"", id:"", bot:true} (createRoom), so nothing in the database says "Crustbeard" — yet
// pname() draws the seat-indexed captain default for it, and that is the name a player SEES at the
// table. A human typing it would sit opposite their own twin, which is playtest 19's "two Dough
// Hooks" bug arriving by a different door.
//
// WHAT THIS CHANGES IN unusedDefaultName, stated exactly, because it is a shared quantity and
// HARD-WON-LESSONS §0 is emphatic about listing what reads one before altering how it is produced.
// The old expression was `s.id ? (s.name||"").trim() : DEFAULT_NAMES[+k]`. Against every input any
// call site in this repo can actually produce, the two agree on all but one case:
//   - claimed + named        -> the typed name.        SAME
//   - unclaimed bot, blank   -> the seat's default.    SAME
//   - unclaimed bot, NAMED   -> old: the seat's default (wrong, it ignores the written name)
//                               new: the written name.  CHANGED, and this is the point — item 16
//                               renames a bot to accommodate a human, so from now on a bot seat can
//                               carry a name that is not its index's default.
//   - claimed + BLANK        -> old: "" ; new: the default. UNREACHABLE: no write path in this
//                               codebase ever puts a blank name on a claimed seat (createRoom seat 0
//                               takes requireName(), and joinRoom/renameMySeat both write
//                               `chosen||unusedDefaultName(...)`), and buildRoster resolves a blank
//                               human name before recording it. Listed rather than left implicit,
//                               so the next reader does not have to re-derive that it cannot happen.
function seatHeldName(seats,i){
  const s=(seats&&seats[i])||{};
  return (s.name||"").trim()||DEFAULT_NAMES[+i]||"";
}
// Item 30 (playtest 2026-08-23c): two names that READ the same ARE the same. Wyatt joined as
// "flaky jack" and Flaky Jack the bot stayed at the table — the collision checks compared exact
// strings, so a case difference smuggled a twin in. Every name comparison in this file goes
// through this one norm (rule 23: one rule, however many askers), so the claim check and the
// default-name pool can never disagree about what counts as taken.
const sameName=(a,b)=>String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();
function unusedDefaultName(seats,preferIdx){
  const taken=new Set();
  Object.keys(seats||{}).forEach(k=>{
    const nm=seatHeldName(seats,k);
    if(nm)taken.add(nm.toLowerCase());   // item 30: the pool is capitalization-normed too
  });
  if(preferIdx!=null&&!taken.has(DEFAULT_NAMES[preferIdx].toLowerCase()))return DEFAULT_NAMES[preferIdx];
  return DEFAULT_NAMES.find(nm=>!taken.has(nm.toLowerCase()))||DEFAULT_NAMES[preferIdx||0];
}
// unusedDefaultName() counts EVERY seat in the map as taking a name, including the one being
// claimed — so a player re-resolving their own seat would see their own old name as taken and drift
// to a different default each pass. Hiding the seat under claim from the tally makes `preferIdx`
// reliably return that seat's own captain, which is both stable and collision-free. Shared by
// applyNameClaim() below, which is the only caller left in the tree.
const withoutSeat=(s,i)=>{const o={};Object.keys(s||{}).forEach(k=>{if(+k!==i)o[k]=s[k];});return o;};

/* ================= ITEM 16 / D-19 — a captain keeps the name they typed ================= */

/* applyNameClaim(s,seat,chosen,numSeats,myId,fresh) — THE ONE RULE for what happens when a captain puts
   a name on a seat. Returns "ok" (and has mutated `s`) or "taken" (and has touched nothing).

   WYATT'S RULING, two different answers depending on who holds the name:
     - another HUMAN holds it -> REFUSE. Nothing is written; the caller says so under the box the
       name was typed in.
     - a BOT holds it -> GRANT IT ANYWAY, and the bot swaps to a name nobody is using.

   THERE ARE THREE WRITE PATHS, NOT TWO, and that is why this is a function rather than an edit in
   two places. joinRoom has a fresh-claim path AND a rejoin path (NAME-01/C, added so "back out and
   come back with a different name" honours the new name), and renameMySeat is the third. Fix two and
   the rule holds on joining and fails on renaming — or, worse, holds on both and fails only on the
   rejoin, which is the rarest path to test and the easiest to forget. One rule, three callers
   (CLAUDE.md rule 23). Before this, all three wrote `chosen` verbatim with no collision check at all;
   only the blank-name fallback, unusedDefaultName(), ever checked anything.

   IT RUNS INSIDE THE TRANSACTION, and that is the whole point of its shape. netClaimSeat is a real
   Firebase transaction on rooms/<code>/seats (src/net/readers.js), so `s` is the live server value
   and the check and the write are one atomic step. Checked BEFORE the transaction instead, two
   captains typing the same name in the same instant both pass the check and the last write wins —
   the bug wearing a fix's clothes (T-02.2-21: two captains under one name at one table is an
   impersonation surface, not a cosmetic clash).

   `fresh` PRESERVES EACH CALLER'S EXISTING WRITE SHAPE, deliberately. The fresh claim writes a bare
   {name,id,bot} record; the rejoin and rename paths spread the existing record first. They are kept
   distinct rather than unified because the live RTDB rule validates this node, and quietly adding a
   field (a bot seat's leftover `strat`) to a human seat's record is exactly the kind of change that
   fails server-side and locks people out of games rather than showing a cosmetic fault.

   THE BOT IS RENAMED AFTER THE HUMAN'S SEAT IS WRITTEN, which is what makes it collision-free for
   free: unusedDefaultName() then reads a map that already contains the human's new name, so it
   cannot hand the same name straight back. Both writes land in the SAME transaction, so there is no
   instant in which two seats share a name. */
function applyNameClaim(s,seat,chosen,numSeats,myId,fresh){
  let clash=null;
  if(chosen){
    for(let i=0;i<numSeats;i++){
      if(i===seat)continue;
      // seatHeldName, not s[i].name: a networked bot seat is stored with name:"" and DISPLAYS its
      // seat-indexed captain default, so the name a player can see is not the one in the record.
      // sameName, not ===: "flaky jack" and "Flaky Jack" are one name at the table (item 30).
      if(sameName(seatHeldName(s,i),chosen)){clash=i;break;}
    }
  }
  // A HUMAN holds it (the seat has an id). Refuse, and write nothing at all.
  if(clash!=null&&(s[clash]||{}).id)return "taken";
  const cur=s[seat]||{};
  const resolved=chosen||unusedDefaultName(withoutSeat(s,seat),seat);
  s[seat]=fresh?{name:resolved,id:myId,bot:false}
               :{...cur,name:resolved,id:myId,bot:false};
  // A BOT held it: it swaps to accommodate the human, in this same transaction.
  if(clash!=null){
    const bot=s[clash]||{};
    s[clash]={...bot,name:unusedDefaultName(withoutSeat(s,clash),clash)};
  }
  return "ok";
}

// playtest 19: TWO CAPTAINS CALLED "DOUGH HOOK". A bot seat was built as {name:"", id:""}, so its
// display name came from pname()'s SEAT-INDEXED fallback (NAMES[i]) — which means a human who
// typed one of the four default names got a bot twin at the table. Seen live at a Pass & Play
// table with a human "Dough Hook": seat 2's bot was "Dough Hook" too.
//
// unusedDefaultName() above was written for exactly this ("the two Crustbeards bug"), but nothing
// ever ran it for BOT seats — only for humans who left the box blank. So every seat is named once,
// here, and all three roster-build sites share it: solo, Pass & Play, and the solo RESUME. They
// must share it — if resume named the crew by a different rule, a resumed voyage would rename the
// bots mid-game. Deterministic (no RNG), so the dlog and replay are untouched.
function buildRoster(humanNames,strategies){
  const roster=[],seats={},humans=humanNames||[];
  humans.forEach((nm,i)=>{
    // A BLANK human name is resolved here too, not left empty for pname() to paper over with the
    // seat default. Leaving it empty was a second, quieter version of the same collision: an empty
    // name reserves nothing, so seat 0 would DISPLAY "Davy Scones" through the fallback while a bot
    // was still free to be handed "Davy Scones" as its own. Naming it now makes it taken.
    const clean=String(nm||"").trim()||unusedDefaultName(seats,i);
    roster[i]={name:clean,id:"solo",bot:false};
    seats[i]={id:"solo",name:clean};
  });
  for(let i=humans.length;i<strategies.length;i++){
    const nm=unusedDefaultName(seats,i);
    roster[i]={name:nm,id:"",bot:true,strat:strategies[i]};
    // recorded WITH an id so the next bot counts this actual name as taken, rather than the
    // default that belongs to this seat index (which is the name we may have just skipped)
    seats[i]={id:"bot",name:nm};
  }
  return roster;
}
const COLORS=["var(--p0)","var(--p1)","var(--p2)","var(--p3)"];
const HEXCOL=["#f2679e","#1d96a6","#27c78d","#f5a623"];
const man=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);

export { mulberry32, ING_ALL, ING_EMOJI, ASSET_BASE, ALARM_IMG, ANCHOR_IMG, BATTLE_IMG, BLOCKED_SLASH_IMG, BOARD_IMG, BOAT_IMG, CAKE_SLICE_IMG, CANCEL_X_IMG, CANDY_CRAB_IMG, CHECKMARK_IMG, CLOCK_IMG, CLOSE_X_IMG, COINS_FLYING_IMG, COIN_IMG, COIN_SPIN_IMG, COMPASS_DIAL_IMG, COMPASS_NEEDLE_IMG, CRATE_OVERBOARD_IMG, CROISSANT_IMG, CROWN_IMG, CUPCAKE_IMG, CURRENT_SWIRL_ICON_IMG, DAGGER_IMG, DEVICE_IMG, DICE_IMG, DOCK_IMG, DODGE_SWOOSH_IMG, DONUT_IMG, DOOR_IMG, EMOJI_IMG, ENVELOPE_IMG, EYES_IMG, FINISH_FLAG_IMG, FISHING_ROD_IMG, FISH_IMG, FLAME_IMG, FLEE_BOOT_IMG, FLIP_HEADS_IMG, FLIP_SOCKET_IMG, FLIP_TAILS_IMG, GEAR_IMG, GLOBE_IMG, HANDSHAKE_IMG, HORN_IMG, HOURGLASS_IMG, IMPACT_BURST_IMG, ING_HOLE_IMG, ING_IMG, ISLAND_SHAPE_IMG, ISLAND_SILHOUETTE_IMG, KEY_IMG, MAGNIFYING_GLASS_IMG, MAP_IMG, PARROT_IMG, PAUSE_IMG, PAUSE_SYMBOL_IMG, PIRATE_CHEF_IMG, PIRATE_FLAG_IMG, PLAY_ARROW_IMG, PLAY_IMG, POCKET_COMPASS_IMG, PRINTER_IMG, REFUSED_IMG, REPAIR_TOOLS_IMG, REPLAY_IMG, RIBBON_IMG, ROBOT_IMG, SAILBOAT_IMG, SALUTE_CAPTAIN_IMG, SCROLL_IMG, SHIELD_IMG, SKULL_IMG, SNAIL_IMG, SPARKLES_IMG, SPEECH_BUBBLE_IMG, SPOILS_POUCH_IMG, SPYGLASS_IMG, STOOL_IMG, SOUND_OFF_IMG, SOUND_ON_IMG, STOPWATCH_IMG, STORM_CLOUD_IMG, STORYBOOK_IMG, SUGARFISH_IMG, TARGET_IMG, TRADE_SWIRL_IMG, WARNING_IMG, WAVE_IMG, WIND_ARROW_IMG, WIND_GUST_IMG, EMOJIFY_RE, emojify, TET, ING_NAME, ING_PLAIN, DOCK_PLACE, DOCK_FLAVOR, dockPlace, dockFlavor, dockFlavorIcon, iname, ilabel, ingImg, ilabelImg, iconImg, DIRS, DIRNAME, PERP, STORM_DIAG, OPPOSITE, SAIL_RANGE, SAIL_RANGE_UPWIND, STORM_PUSH, devHost, BAKEOFF_ENABLED, BAKE_SWAPS, BAKE_ATTENTION, BAKE_REWATCH_COST, rulesFacts, bakeoffEnabled, OVENS_NOW, ovensNowEnabled, BAKE2_NOW, bake2Enabled, ENDCARD_NOW, endCardEnabled, SEA_CREATURES, NAMES, DEFAULT_NAMES, unusedDefaultName, seatHeldName, withoutSeat, applyNameClaim, buildRoster, COLORS, HEXCOL, man, subjectOf };
